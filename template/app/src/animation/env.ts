import * as z from "zod";

export const animationVideoEnvSchema = z.object({
  FFMPEG_PATH: z.string().default("ffmpeg"),
});
