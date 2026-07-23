import * as z from "zod";

export const postStatusSchema = z.enum(["draft", "published"]);
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must use lowercase kebab-case");

export const authorInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().optional().or(z.literal("")),
  bio: z.string().trim().max(500).optional(),
});

export const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  slug: slugSchema,
});

const tagIdsSchema = z
  .array(z.string().uuid())
  .max(30)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Tag IDs must be unique" });
    }
  });

export const postInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: slugSchema,
  excerpt: z.string().trim().min(1).max(320),
  content: z.string().trim().min(1),
  status: postStatusSchema,
  authorId: z.string().uuid(),
  tagIds: tagIdsSchema,
});
