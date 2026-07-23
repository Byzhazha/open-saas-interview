import { Prisma } from "@prisma/client";
import { HttpError, prisma } from "wasp/server";
import type {
  GetPublishedPost,
  GetPublishedPosts,
} from "wasp/server/operations";
import * as z from "zod";
import { ensureArgsSchemaOrThrowHttpError } from "../../server/validation";

const listInputSchema = z
  .object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(50).default(10),
    tagSlug: z.string().trim().min(1).optional(),
  })
  .default({});
const slugInputSchema = z.object({ slug: z.string().trim().min(1).max(120) });
const publicPostInclude = {
  author: { select: { displayName: true } },
  tags: { include: { tag: { select: { name: true, slug: true } } } },
} as const;
type PublicPost = Prisma.PostGetPayload<{
  include: typeof publicPostInclude;
}>;

type PublicPostPage = {
  posts: PublicPost[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** 公开读取接口只返回已发布且已到发布时间的文章。 */
export const getPublishedPosts: GetPublishedPosts<
  z.input<typeof listInputSchema>,
  PublicPostPage
> = async (rawArgs) => {
  const input = ensureArgsSchemaOrThrowHttpError(listInputSchema, rawArgs);
  const where: Prisma.PostWhereInput = {
    status: "published",
    publishedAt: { lte: new Date() },
    ...(input.tagSlug
      ? { tags: { some: { tag: { slug: input.tagSlug } } } }
      : {}),
  };
  const [posts, total] = await prisma.$transaction([
    prisma.post.findMany({
      where,
      include: publicPostInclude,
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.post.count({ where }),
  ]);
  return {
    posts,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
};

/** 公开文章详情接口按 slug 查询，草稿和未来发布时间文章不会泄露。 */
export const getPublishedPost: GetPublishedPost<
  z.input<typeof slugInputSchema>,
  PublicPost
> = async (rawArgs) => {
  const { slug } = ensureArgsSchemaOrThrowHttpError(slugInputSchema, rawArgs);
  const post = await prisma.post.findFirst({
    where: {
      slug,
      status: "published",
      publishedAt: { lte: new Date() },
    },
    include: publicPostInclude,
  });
  if (!post) throw new HttpError(404, "Post not found");
  return post;
};
