# Blog CMS

CMS 后台位于 `/admin/content`，只允许 `User.isAdmin = true` 的用户访问。

## 数据模型

- `Post`：标题、slug、摘要、正文、作者、标签、草稿/已发布状态和发布时间。
- `Author`：显示名称、邮箱和简介，可独立维护。
- `Tag`：名称与 kebab-case slug，可独立维护。
- `PostTag`：文章与标签的复合主键关联表。

## 行为约束

- 文章 slug、标签名称和标签 slug 均由数据库唯一索引兜底，重复值返回 409。
- slug 只接受小写字母、数字和连字符组成的 kebab-case。
- 未发布文章的 `publishedAt` 为空，删除仍被文章引用的作者或标签会返回 409。
- 所有查询和写操作都在服务端再次校验管理员身份，页面权限不能替代接口权限。

## 公开博客读取

- `getPublishedPosts` 提供分页列表，并支持按 `tagSlug` 过滤。
- `getPublishedPost` 按 slug 返回文章详情；草稿和未来发布时间的文章统一返回 404。
- 两个查询只返回公开内容所需的文章、作者名称和标签字段，不暴露后台管理字段。

## 发布同步

发布、编辑、撤回或删除已发布文章时，写事务会创建 `CmsPublicationEvent`。PgBoss 每分钟执行
`syncCmsPublicationJob`，生成可供 Astro 消费的 `cms-posts.json`、`sitemap.xml` 和文章 metadata。
产物使用临时文件原子替换，失败会按递增间隔重试，最多 5 次。

可通过以下配置调整产物位置和 canonical 基地址：

```text
CMS_PUBLIC_OUTPUT_DIR=../blog/public
CMS_PUBLIC_BASE_URL=http://localhost:3000
```

## 迁移与测试

```bash
wasp db migrate-dev
npx vitest run --config vitest.config.ts src/admin/content/validation.test.ts
```
