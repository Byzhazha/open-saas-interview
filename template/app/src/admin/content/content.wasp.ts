import { action, page, query, route, type Spec } from "@wasp.sh/spec";

import { ContentPage } from "./ContentPage" with { type: "ref" };
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
} from "./operations" with { type: "ref" };

export const contentSpec: Spec = [
  route(
    "AdminContentRoute",
    "/admin/content",
    page(ContentPage, { authRequired: true }),
  ),
  query(getAdminPosts, { entities: ["Post", "Author", "Tag", "PostTag"] }),
  query(getCmsLookups, { entities: ["Author", "Tag"] }),
  action(createPost, { entities: ["Post", "Author", "Tag", "PostTag"] }),
  action(updatePost, { entities: ["Post", "Author", "Tag", "PostTag"] }),
  action(deletePost, { entities: ["Post"] }),
  action(createAuthor, { entities: ["Author"] }),
  action(updateAuthor, { entities: ["Author"] }),
  action(deleteAuthor, { entities: ["Author", "Post"] }),
  action(createTag, { entities: ["Tag"] }),
  action(updateTag, { entities: ["Tag"] }),
  action(deleteTag, { entities: ["Tag", "PostTag"] }),
];
