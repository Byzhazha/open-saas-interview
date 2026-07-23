import type { Author, Post, Tag } from "wasp/entities";
import { HttpError, prisma } from "wasp/server";
import type {
  CreateAuthor,
  CreatePost,
  CreateTag,
  DeleteAuthor,
  DeletePost,
  DeleteTag,
  GetAdminPosts,
  GetCmsLookups,
  UpdateAuthor,
  UpdatePost,
  UpdateTag,
} from "wasp/server/operations";
import * as z from "zod";
import { ensureArgsSchemaOrThrowHttpError } from "../../server/validation";
import {
  authorInputSchema,
  postInputSchema,
  tagInputSchema,
} from "./validation";

type PostInput = z.infer<typeof postInputSchema>;
type AuthorInput = z.infer<typeof authorInputSchema>;
type TagInput = z.infer<typeof tagInputSchema>;

type UpdatePostInput = PostInput & { id: string };
type UpdateAuthorInput = AuthorInput & { id: string };
type UpdateTagInput = TagInput & { id: string };
type DeleteInput = { id: string };

type AdminPost = Post & {
  author: Pick<Author, "id" | "displayName">;
  tags: Array<{ tag: Pick<Tag, "id" | "name" | "slug"> }>;
};

type CmsLookups = {
  authors: Pick<Author, "id" | "displayName" | "email" | "bio">[];
  tags: Pick<Tag, "id" | "name" | "slug">[];
};

function ensureAdmin(context: { user?: { isAdmin: boolean } | null }) {
  if (!context.user) {
    throw new HttpError(401, "Only authenticated users are allowed");
  }
  if (!context.user.isAdmin) {
    throw new HttpError(403, "Only admins are allowed to manage content");
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function throwPersistenceError(error: unknown, message: string): never {
  if (isUniqueConstraintError(error)) {
    throw new HttpError(409, message);
  }
  throw error;
}

const postInclude = {
  author: { select: { id: true, displayName: true } },
  tags: {
    include: { tag: { select: { id: true, name: true, slug: true } } },
  },
} as const;

async function findAdminPost(id: string): Promise<AdminPost> {
  const post = await prisma.post.findUnique({
    where: { id },
    include: postInclude,
  });
  if (!post) {
    throw new HttpError(404, "Post not found");
  }
  return post as AdminPost;
}

function buildPostData(input: PostInput) {
  return {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    content: input.content,
    status: input.status,
    publishedAt: input.status === "published" ? new Date() : null,
    authorId: input.authorId,
    tags: {
      create: input.tagIds.map((tagId) => ({
        tag: { connect: { id: tagId } },
      })),
    },
  };
}

export const getAdminPosts: GetAdminPosts<void, AdminPost[]> = async (
  _args,
  context,
) => {
  ensureAdmin(context);
  return prisma.post.findMany({
    include: postInclude,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  }) as Promise<AdminPost[]>;
};

export const getCmsLookups: GetCmsLookups<void, CmsLookups> = async (
  _args,
  context,
) => {
  ensureAdmin(context);
  const [authors, tags] = await prisma.$transaction([
    prisma.author.findMany({
      select: { id: true, displayName: true, email: true, bio: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.tag.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { authors, tags };
};

export const createPost: CreatePost<PostInput, AdminPost> = async (
  rawArgs,
  context,
) => {
  ensureAdmin(context);
  const input = ensureArgsSchemaOrThrowHttpError(postInputSchema, rawArgs);
  try {
    const post = await prisma.post.create({ data: buildPostData(input) });
    return findAdminPost(post.id);
  } catch (error) {
    throwPersistenceError(error, "Post slug is already in use");
  }
};

export const updatePost: UpdatePost<UpdatePostInput, AdminPost> = async (
  rawArgs,
  context,
) => {
  ensureAdmin(context);
  const { id, ...rawPost } = ensureArgsSchemaOrThrowHttpError(
    postInputSchema.extend({ id: z.string().uuid() }),
    rawArgs,
  );
  const input = rawPost as PostInput;
  try {
    await prisma.$transaction(async (tx) => {
      const currentPost = await tx.post.findUnique({
        where: { id },
        select: { publishedAt: true },
      });
      await tx.post.update({
        where: { id },
        data: {
          title: input.title,
          slug: input.slug,
          excerpt: input.excerpt,
          content: input.content,
          status: input.status,
          publishedAt:
            input.status === "published"
              ? (currentPost?.publishedAt ?? new Date())
              : null,
          authorId: input.authorId,
          tags: {
            deleteMany: {},
            create: input.tagIds.map((tagId) => ({
              tag: { connect: { id: tagId } },
            })),
          },
        },
      });
    });
    return findAdminPost(id);
  } catch (error) {
    throwPersistenceError(error, "Post slug is already in use");
  }
};

export const deletePost: DeletePost<DeleteInput, DeleteInput> = async (
  rawArgs,
  context,
) => {
  ensureAdmin(context);
  const { id } = ensureArgsSchemaOrThrowHttpError(
    z.object({ id: z.string().uuid() }),
    rawArgs,
  );
  await prisma.post.delete({ where: { id } });
  return { id };
};

export const createAuthor: CreateAuthor<AuthorInput, Author> = async (
  rawArgs,
  context,
) => {
  ensureAdmin(context);
  const input = ensureArgsSchemaOrThrowHttpError(authorInputSchema, rawArgs);
  return prisma.author.create({
    data: {
      displayName: input.displayName,
      email: input.email || null,
      bio: input.bio || null,
    },
  });
};

export const updateAuthor: UpdateAuthor<UpdateAuthorInput, Author> = async (
  rawArgs,
  context,
) => {
  ensureAdmin(context);
  const { id, ...rawAuthor } = ensureArgsSchemaOrThrowHttpError(
    authorInputSchema.extend({ id: z.string().uuid() }),
    rawArgs,
  );
  const input = rawAuthor as AuthorInput;
  return prisma.author.update({
    where: { id },
    data: {
      displayName: input.displayName,
      email: input.email || null,
      bio: input.bio || null,
    },
  });
};

export const deleteAuthor: DeleteAuthor<DeleteInput, DeleteInput> = async (
  rawArgs,
  context,
) => {
  ensureAdmin(context);
  const { id } = ensureArgsSchemaOrThrowHttpError(
    z.object({ id: z.string().uuid() }),
    rawArgs,
  );
  const postCount = await prisma.post.count({ where: { authorId: id } });
  if (postCount > 0) {
    throw new HttpError(409, "Author still has posts");
  }
  await prisma.author.delete({ where: { id } });
  return { id };
};

export const createTag: CreateTag<TagInput, Tag> = async (rawArgs, context) => {
  ensureAdmin(context);
  const input = ensureArgsSchemaOrThrowHttpError(tagInputSchema, rawArgs);
  try {
    return await prisma.tag.create({ data: input });
  } catch (error) {
    throwPersistenceError(error, "Tag name or slug is already in use");
  }
};

export const updateTag: UpdateTag<UpdateTagInput, Tag> = async (
  rawArgs,
  context,
) => {
  ensureAdmin(context);
  const { id, ...rawTag } = ensureArgsSchemaOrThrowHttpError(
    tagInputSchema.extend({ id: z.string().uuid() }),
    rawArgs,
  );
  const input = rawTag as TagInput;
  try {
    return await prisma.tag.update({ where: { id }, data: input });
  } catch (error) {
    throwPersistenceError(error, "Tag name or slug is already in use");
  }
};

export const deleteTag: DeleteTag<DeleteInput, DeleteInput> = async (
  rawArgs,
  context,
) => {
  ensureAdmin(context);
  const { id } = ensureArgsSchemaOrThrowHttpError(
    z.object({ id: z.string().uuid() }),
    rawArgs,
  );
  const postCount = await prisma.postTag.count({ where: { tagId: id } });
  if (postCount > 0) {
    throw new HttpError(409, "Tag is used by posts");
  }
  await prisma.tag.delete({ where: { id } });
  return { id };
};
