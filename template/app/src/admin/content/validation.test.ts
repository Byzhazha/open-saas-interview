import { describe, expect, it } from "vitest";
import { postInputSchema, slugSchema, tagInputSchema } from "./validation";

describe("CMS content validation", () => {
  it("只接受小写 kebab-case slug", () => {
    expect(slugSchema.safeParse("astro-release-notes").success).toBe(true);
    expect(slugSchema.safeParse("Astro Release Notes").success).toBe(false);
    expect(slugSchema.safeParse("astro_release_notes").success).toBe(false);
  });

  it("校验标签名称和 slug", () => {
    expect(
      tagInputSchema.safeParse({ name: "Astro", slug: "astro" }).success,
    ).toBe(true);
    expect(tagInputSchema.safeParse({ name: "", slug: "astro" }).success).toBe(
      false,
    );
  });

  it("拒绝文章重复标签和非法发布状态", () => {
    const input = {
      title: "Post",
      slug: "post",
      excerpt: "Excerpt",
      content: "Content",
      status: "published",
      authorId: "00000000-0000-0000-0000-000000000001",
      tagIds: [
        "00000000-0000-0000-0000-000000000002",
        "00000000-0000-0000-0000-000000000002",
      ],
    };
    expect(postInputSchema.safeParse(input).success).toBe(false);
    expect(
      postInputSchema.safeParse({ ...input, tagIds: [], status: "archived" })
        .success,
    ).toBe(false);
  });
});
