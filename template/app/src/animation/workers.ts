import { promises as fs } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { env } from "wasp/server";
import { type ConvertAnimationToVideoJob } from "wasp/server/jobs";
import { uploadBinaryToS3 } from "../file-upload/s3Utils";
import { type VideoFormat } from "./validation";

type ConvertAnimationInput = { videoJobId: string };
const execFile = promisify(execFileCallback);

/** PgBoss 重试时会再次执行该 worker，数据库状态负责记录业务级进度。 */
export const convertAnimationToVideoJob: ConvertAnimationToVideoJob<
  ConvertAnimationInput,
  void
> = async ({ videoJobId }, context) => {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
  const claimed = await context.entities.AnimationVideoJob.updateMany({
    where: {
      id: videoJobId,
      OR: [
        { status: "queued" },
        { status: "processing", startedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "processing",
      attempts: { increment: 1 },
      startedAt: new Date(),
      errorMessage: null,
    },
  });

  if (claimed.count !== 1) {
    return;
  }

  const job = await context.entities.AnimationVideoJob.findUnique({
    where: { id: videoJobId },
    include: { animation: true },
  });
  if (!job) {
    return;
  }

  try {
    const output = await renderAnimationToVideo({
      htmlContent: job.animation.htmlContent,
      durationSeconds: job.durationSeconds,
      fps: job.fps,
      format: job.format as VideoFormat,
    });
    const outputS3Key = `animations/${job.userId}/${job.animationId}/${job.id}.${job.format}`;
    await uploadBinaryToS3({
      s3Key: outputS3Key,
      body: output,
      contentType: job.format === "mp4" ? "video/mp4" : "video/webm",
    });
    await context.entities.AnimationVideoJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        outputS3Key,
        completedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    const terminal = job.attempts >= job.maxAttempts;
    await context.entities.AnimationVideoJob.update({
      where: { id: job.id },
      data: {
        status: terminal ? "failed" : "queued",
        completedAt: terminal ? new Date() : null,
        errorMessage: getErrorMessage(error),
      },
    });
    if (!terminal) {
      throw error;
    }
  }
};

async function renderAnimationToVideo({
  htmlContent,
  durationSeconds,
  fps,
  format,
}: {
  htmlContent: string;
  durationSeconds: number;
  fps: number;
  format: VideoFormat;
}): Promise<Buffer> {
  const workDir = await fs.mkdtemp(path.join(tmpdir(), "html-animation-"));
  const framesDir = path.join(workDir, "frames");
  const outputPath = path.join(workDir, `output.${format}`);
  await fs.mkdir(framesDir);

  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await page.route("**/*", async (route) => {
        const requestUrl = route.request().url();
        if (
          requestUrl.startsWith("http://") ||
          requestUrl.startsWith("https://")
        ) {
          await route.abort();
        } else {
          await route.continue();
        }
      });
      await page.setContent(htmlContent, { waitUntil: "load" });
      await page.evaluate(() => {
        document.body.style.margin = "0";
        document.body.style.overflow = "hidden";
      });

      const frameCount = durationSeconds * fps;
      const frameDelay = 1000 / fps;
      for (let frame = 0; frame < frameCount; frame += 1) {
        const framePath = path.join(
          framesDir,
          `frame-${String(frame + 1).padStart(6, "0")}.png`,
        );
        await page.screenshot({ path: framePath, type: "png" });
        await page.waitForTimeout(frameDelay);
      }
    } finally {
      await browser.close();
    }

    const codecArgs =
      format === "mp4"
        ? ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
        : ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32"];
    await execFile(env.FFMPEG_PATH, [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      path.join(framesDir, "frame-%06d.png"),
      ...codecArgs,
      outputPath,
    ]);

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return String(error).slice(0, 500);
}
