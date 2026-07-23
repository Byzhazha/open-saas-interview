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

## 迁移与测试

```bash
wasp db migrate-dev
npx vitest run --config vitest.config.ts src/admin/content/validation.test.ts
```
