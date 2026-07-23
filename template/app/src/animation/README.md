# HTML 动画转视频

访问 `/animations` 保存 HTML/CSS/JavaScript 动画并预览。提交 MP4 或 WebM 后，服务端创建 `AnimationVideoJob` 并提交到 Wasp PgBoss；页面每 3 秒刷新任务状态，成功后通过 S3 presigned URL 下载。

## 任务状态

`queued -> processing -> completed` 是成功路径。渲染、FFmpeg 或 S3 失败时记录错误信息，未达到 3 次会重新排队，达到上限后进入 `failed`。
失败任务可以在页面手动重置为 `queued` 再次提交，重试会重新计算 3 次自动尝试次数。

## 运行依赖

服务端需要可执行的 FFmpeg，并安装 Playwright Chromium：

```bash
npx playwright install chromium
wasp db migrate-dev
```

默认从 `PATH` 查找 `ffmpeg`，也可以在 `.env.server` 设置 `FFMPEG_PATH`。视频文件沿用已有 AWS S3 配置，下载接口只返回限时签名 URL。

## Playwright E2E

`template/e2e-tests/tests/animationVideoTests.spec.ts` 覆盖登录、保存动画、选择 WebM、提交转换任务、轮询终态、成功下载以及失败重试分支。
运行前启动 Wasp 数据库和应用，并安装 Chromium、FFmpeg 和测试依赖：

```bash
npx playwright install chromium
cd ../e2e-tests && npm install
npx playwright test tests/animationVideoTests.spec.ts
```

## 设计边界

- HTML 在无头 Chromium 中渲染为固定 1280x720 帧，编码参数由服务端固定，避免客户端传入命令参数。
- 渲染页阻断 HTTP/HTTPS 外部请求，减少外部资源不稳定和服务端请求伪造风险。
- 任务状态写入数据库，PgBoss 只负责持久化排队和重试，进程重启后可继续处理。
