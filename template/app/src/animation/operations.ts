import { type Animation, type AnimationVideoJob } from "wasp/entities";
import { HttpError } from "wasp/server";
import { convertAnimationToVideoJob } from "wasp/server/jobs";
import type {
  CreateAnimation,
  GetAnimationVideoDownloadURL,
  GetAnimationVideoJobs,
  GetAnimations,
  RetryAnimationVideo,
  RequestAnimationVideo,
} from "wasp/server/operations";
import * as z from "zod";
import { getDownloadFileSignedURLFromS3 } from "../file-upload/s3Utils";
import { ensureArgsSchemaOrThrowHttpError } from "../server/validation";
import {
  animationInputSchema,
  requestVideoSchema,
  videoFormatSchema,
  videoJobIdSchema,
  type VideoFormat,
} from "./validation";

type RequestVideoInput = z.infer<typeof requestVideoSchema>;
type AnimationVideoJobWithTitle = AnimationVideoJob & {
  animation: Pick<Animation, "id" | "title">;
};

function ensureAuthenticated(context: { user?: { id: string } | null }) {
  if (!context.user) {
    throw new HttpError(401, "Only authenticated users are allowed");
  }
}

export const createAnimation: CreateAnimation<
  z.infer<typeof animationInputSchema>,
  Animation
> = async (rawArgs, context) => {
  ensureAuthenticated(context);
  const input = ensureArgsSchemaOrThrowHttpError(animationInputSchema, rawArgs);
  return context.entities.Animation.create({
    data: {
      title: input.title,
      htmlContent: input.htmlContent,
      userId: context.user!.id,
    },
  });
};

export const getAnimations: GetAnimations<void, Animation[]> = async (
  _args,
  context,
) => {
  ensureAuthenticated(context);
  return context.entities.Animation.findMany({
    where: { userId: context.user!.id },
    orderBy: { updatedAt: "desc" },
  });
};

export const requestAnimationVideo: RequestAnimationVideo<
  RequestVideoInput,
  AnimationVideoJob
> = async (rawArgs, context) => {
  ensureAuthenticated(context);
  const input = ensureArgsSchemaOrThrowHttpError(requestVideoSchema, rawArgs);
  const animation = await context.entities.Animation.findFirst({
    where: { id: input.animationId, userId: context.user!.id },
  });
  if (!animation) {
    throw new HttpError(404, "Animation not found");
  }

  // 同一动画和格式已有任务时复用进行中的任务，避免重复占用 CPU 和存储。
  const activeJob = await context.entities.AnimationVideoJob.findFirst({
    where: {
      animationId: input.animationId,
      userId: context.user!.id,
      format: input.format,
      status: { in: ["queued", "processing"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (activeJob) {
    return activeJob;
  }

  const videoJob = await context.entities.AnimationVideoJob.create({
    data: {
      animationId: animation.id,
      userId: context.user!.id,
      format: input.format,
      durationSeconds: input.durationSeconds,
      fps: input.fps,
      status: "queued",
    },
  });

  try {
    const submittedJob = await convertAnimationToVideoJob.submit(
      { videoJobId: videoJob.id },
      { retryLimit: 2 },
    );
    return context.entities.AnimationVideoJob.update({
      where: { id: videoJob.id },
      data: { queueJobId: submittedJob.jobId },
    });
  } catch (error) {
    await context.entities.AnimationVideoJob.update({
      where: { id: videoJob.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: getErrorMessage(error),
      },
    });
    throw new HttpError(503, "Video conversion queue is unavailable", {
      cause: error,
    });
  }
};

export const getAnimationVideoJobs: GetAnimationVideoJobs<
  void,
  AnimationVideoJobWithTitle[]
> = async (_args, context) => {
  ensureAuthenticated(context);
  return context.entities.AnimationVideoJob.findMany({
    where: { userId: context.user!.id },
    include: { animation: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
  }) as Promise<AnimationVideoJobWithTitle[]>;
};

export const retryAnimationVideo: RetryAnimationVideo<
  { jobId: string },
  AnimationVideoJob
> = async (rawArgs, context) => {
  ensureAuthenticated(context);
  const { jobId } = ensureArgsSchemaOrThrowHttpError(videoJobIdSchema, rawArgs);
  const job = await context.entities.AnimationVideoJob.findFirst({
    where: { id: jobId, userId: context.user!.id, status: "failed" },
  });
  if (!job) {
    throw new HttpError(404, "Failed video job not found");
  }
  const queuedJob = await context.entities.AnimationVideoJob.update({
    where: { id: job.id },
    data: {
      status: "queued",
      attempts: 0,
      errorMessage: null,
      completedAt: null,
      outputS3Key: null,
    },
  });
  try {
    const submittedJob = await convertAnimationToVideoJob.submit(
      { videoJobId: queuedJob.id },
      { retryLimit: 2 },
    );
    return context.entities.AnimationVideoJob.update({
      where: { id: queuedJob.id },
      data: { queueJobId: submittedJob.jobId },
    });
  } catch (error) {
    await context.entities.AnimationVideoJob.update({
      where: { id: queuedJob.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: getErrorMessage(error),
      },
    });
    throw new HttpError(503, "Video conversion queue is unavailable", {
      cause: error,
    });
  }
};

export const getAnimationVideoDownloadURL: GetAnimationVideoDownloadURL<
  { jobId: string },
  string
> = async (rawArgs, context) => {
  ensureAuthenticated(context);
  const { jobId } = ensureArgsSchemaOrThrowHttpError(videoJobIdSchema, rawArgs);
  const job = await context.entities.AnimationVideoJob.findFirst({
    where: { id: jobId, userId: context.user!.id },
  });
  if (!job || job.status !== "completed" || !job.outputS3Key) {
    throw new HttpError(404, "Video is not ready");
  }
  return getDownloadFileSignedURLFromS3({ s3Key: job.outputS3Key });
};

export function isVideoFormat(value: string): value is VideoFormat {
  return videoFormatSchema.safeParse(value).success;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return String(error).slice(0, 500);
}
