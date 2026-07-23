import { useMemo, useState, type ReactNode } from "react";
import { type AuthUser } from "wasp/auth";
import {
  createAuthor,
  createPost,
  createTag,
  deleteAuthor,
  deletePost,
  deleteTag,
  getAdminPosts,
  getCmsLookups,
  updateAuthor,
  updatePost,
  updateTag,
  useQuery,
} from "wasp/client/operations";
import { Button } from "../../client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../client/components/ui/card";
import { Input } from "../../client/components/ui/input";
import { Label } from "../../client/components/ui/label";
import { Textarea } from "../../client/components/ui/textarea";
import { DefaultLayout } from "../layout/DefaultLayout";

type CmsPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: "draft" | "published";
  author: { id: string; displayName: string };
  tags: Array<{ tag: { id: string; name: string; slug: string } }>;
};
type CmsAuthor = {
  id: string;
  displayName: string;
  email: string | null;
  bio: string | null;
};

type AuthorForm = { displayName: string; email: string; bio: string };
type TagForm = { name: string; slug: string };
type PostForm = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: "draft" | "published";
  authorId: string;
  tagIds: string[];
};

const emptyAuthor: AuthorForm = { displayName: "", email: "", bio: "" };
const emptyTag: TagForm = { name: "", slug: "" };
const emptyPost: PostForm = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  status: "draft",
  authorId: "",
  tagIds: [],
};

export function ContentPage({ user }: { user: AuthUser }) {
  const postsQuery = useQuery(getAdminPosts);
  const lookupsQuery = useQuery(getCmsLookups);
  const posts = (postsQuery.data ?? []) as CmsPost[];
  const authors = lookupsQuery.data?.authors ?? [];
  const tags = lookupsQuery.data?.tags ?? [];
  const refresh = async () => {
    await Promise.all([postsQuery.refetch(), lookupsQuery.refetch()]);
  };

  return (
    <DefaultLayout user={user}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Content Management</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage posts, authors, tags, and publication status.
          </p>
        </div>
        <PostManager
          posts={posts}
          authors={authors}
          tags={tags}
          onRefresh={refresh}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <AuthorManager authors={authors} onRefresh={refresh} />
          <TagManager tags={tags} onRefresh={refresh} />
        </div>
      </div>
    </DefaultLayout>
  );
}

function PostManager({
  posts,
  authors,
  tags,
  onRefresh,
}: {
  posts: CmsPost[];
  authors: CmsAuthor[];
  tags: Array<{ id: string; name: string; slug: string }>;
  onRefresh: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PostForm>(emptyPost);
  const [error, setError] = useState<string>("");

  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => a.title.localeCompare(b.title)),
    [posts],
  );

  const editPost = (post: CmsPost) => {
    setEditingId(post.id);
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      status: post.status,
      authorId: post.author.id,
      tagIds: post.tags.map(({ tag }) => tag.id),
    });
  };

  const savePost = async () => {
    try {
      setError("");
      if (editingId) {
        await updatePost({ id: editingId, ...form });
      } else {
        await createPost(form);
      }
      setEditingId(null);
      setForm(emptyPost);
      await onRefresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save post",
      );
    }
  };

  const removePost = async (id: string) => {
    if (!window.confirm("Delete this post?")) return;
    await deletePost({ id });
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyPost);
    }
    await onRefresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Posts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3">
          {sortedPosts.map((post) => (
            <div
              key={post.id}
              className="border-border flex flex-wrap items-center justify-between gap-3 rounded-sm border p-3"
            >
              <div>
                <p className="font-medium">{post.title}</p>
                <p className="text-muted-foreground text-xs">
                  /{post.slug} · {post.status} · {post.author.displayName}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => editPost(post)}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removePost(post.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {sortedPosts.length === 0 && (
            <p className="text-muted-foreground text-sm">No posts yet.</p>
          )}
        </div>

        <div className="border-border space-y-4 border-t pt-5">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">
              {editingId ? "Edit post" : "Create post"}
            </h3>
            {editingId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyPost);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <Input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </Field>
            <Field label="Slug">
              <Input
                value={form.slug}
                onChange={(event) =>
                  setForm({ ...form, slug: event.target.value })
                }
              />
            </Field>
            <Field label="Author">
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={form.authorId}
                onChange={(event) =>
                  setForm({ ...form, authorId: event.target.value })
                }
              >
                <option value="">Select author</option>
                {authors.map((author) => (
                  <option key={author.id} value={author.id}>
                    {author.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as PostForm["status"],
                  })
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
          </div>
          <Field label="Excerpt">
            <Textarea
              value={form.excerpt}
              onChange={(event) =>
                setForm({ ...form, excerpt: event.target.value })
              }
            />
          </Field>
          <Field label="Content">
            <Textarea
              className="min-h-56"
              value={form.content}
              onChange={(event) =>
                setForm({ ...form, content: event.target.value })
              }
            />
          </Field>
          <Field label="Tags">
            <div className="flex flex-wrap gap-3">
              {tags.map((tag) => (
                <label key={tag.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.tagIds.includes(tag.id)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        tagIds: event.target.checked
                          ? [...form.tagIds, tag.id]
                          : form.tagIds.filter((id) => id !== tag.id),
                      })
                    }
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          </Field>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button onClick={savePost} disabled={!authors.length}>
            {editingId ? "Save changes" : "Create post"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AuthorManager({
  authors,
  onRefresh,
}: {
  authors: CmsAuthor[];
  onRefresh: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AuthorForm>(emptyAuthor);

  const save = async () => {
    if (editingId) await updateAuthor({ id: editingId, ...form });
    else await createAuthor(form);
    setEditingId(null);
    setForm(emptyAuthor);
    await onRefresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {authors.map((author) => (
            <div
              key={author.id}
              className="flex items-center justify-between text-sm"
            >
              <span>{author.displayName}</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingId(author.id);
                    setForm({
                      displayName: author.displayName,
                      email: author.email ?? "",
                      bio: author.bio ?? "",
                    });
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!window.confirm("Delete this author?")) return;
                    await deleteAuthor({ id: author.id });
                    await onRefresh();
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Field label="Display name">
          <Input
            value={form.displayName}
            onChange={(event) =>
              setForm({ ...form, displayName: event.target.value })
            }
          />
        </Field>
        <Field label="Email">
          <Input
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
          />
        </Field>
        <Field label="Bio">
          <Textarea
            value={form.bio}
            onChange={(event) => setForm({ ...form, bio: event.target.value })}
          />
        </Field>
        <div className="flex gap-2">
          <Button onClick={save}>
            {editingId ? "Save author" : "Add author"}
          </Button>
          {editingId && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyAuthor);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TagManager({
  tags,
  onRefresh,
}: {
  tags: Array<{ id: string; name: string; slug: string }>;
  onRefresh: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TagForm>(emptyTag);

  const save = async () => {
    if (editingId) await updateTag({ id: editingId, ...form });
    else await createTag(form);
    setEditingId(null);
    setForm(emptyTag);
    await onRefresh();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this tag?")) return;
    await deleteTag({ id });
    await onRefresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between text-sm"
            >
              <span>
                {tag.name}{" "}
                <span className="text-muted-foreground">/{tag.slug}</span>
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingId(tag.id);
                    setForm({ name: tag.name, slug: tag.slug });
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(tag.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="Slug">
          <Input
            value={form.slug}
            onChange={(event) => setForm({ ...form, slug: event.target.value })}
          />
        </Field>
        <div className="flex gap-2">
          <Button onClick={save}>{editingId ? "Save tag" : "Add tag"}</Button>
          {editingId && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyTag);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
