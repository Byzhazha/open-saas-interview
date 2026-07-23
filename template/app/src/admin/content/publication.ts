import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, prisma } from "wasp/server";

type PublishedPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: Date | null;
  updatedAt: Date;
  author: { displayName: string };
  tags: Array<{ tag: { name: string; slug: string } }>;
};

/**
 * 读取已发布文章并生成 Astro 可直接消费的元数据清单和 sitemap。
 * 使用临时文件替换，避免 Astro 构建时读到半截 JSON/XML。
 */
export async function writePublishedCmsArtifacts(): Promise<void> {
  const posts = (await prisma.post.findMany({
    where: {
      status: "published",
      publishedAt: { lte: new Date() },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      publishedAt: true,
      updatedAt: true,
      author: { select: { displayName: true } },
      tags: { select: { tag: { select: { name: true, slug: true } } } },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
  })) as PublishedPost[];

  const outputDir = path.resolve(process.cwd(), env.CMS_PUBLIC_OUTPUT_DIR);
  await mkdir(outputDir, { recursive: true });

  const baseUrl = env.CMS_PUBLIC_BASE_URL.replace(/\/$/, "");
  const metadata = {
    generatedAt: new Date().toISOString(),
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      canonical: `${baseUrl}/blog/${post.slug}/`,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      updatedAt: post.updatedAt.toISOString(),
      author: post.author.displayName,
      tags: post.tags.map(({ tag }) => tag),
    })),
  };

  const sitemapUrls = [
    `<url><loc>${escapeXml(`${baseUrl}/blog/`)}</loc></url>`,
    ...posts.map((post) => {
      const lastmod = (post.updatedAt ?? post.publishedAt)?.toISOString();
      return `<url><loc>${escapeXml(`${baseUrl}/blog/${post.slug}/`)}</loc>${
        lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
      }</url>`;
    }),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapUrls.join("")}</urlset>\n`;

  await writeAtomically(
    path.join(outputDir, "cms-posts.json"),
    JSON.stringify(metadata, null, 2),
  );
  await writeAtomically(path.join(outputDir, "sitemap.xml"), sitemap);
}

async function writeAtomically(
  filePath: string,
  content: string,
): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
