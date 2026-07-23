import * as z from "zod";

/** CMS 发布任务将 Astro 可消费的静态产物写入博客 public 目录。 */
export const cmsEnvSchema = z.object({
  CMS_PUBLIC_OUTPUT_DIR: z.string().default("../blog/public"),
  CMS_PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
});
