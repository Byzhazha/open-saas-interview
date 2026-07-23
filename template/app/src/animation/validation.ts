import * as z from "zod";

export const videoFormatSchema = z.enum(["mp4", "webm"]);
export const animationInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  htmlContent: z.string().trim().min(1).max(1_000_000),
});

export const requestVideoSchema = z.object({
  animationId: z.string().uuid(),
  format: videoFormatSchema,
  durationSeconds: z.number().int().min(1).max(30),
  fps: z.number().int().min(12).max(60),
});

export const videoJobIdSchema = z.object({
  jobId: z.string().uuid(),
});

export type VideoFormat = z.infer<typeof videoFormatSchema>;
