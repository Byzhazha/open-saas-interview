# AI 成本与滥用控制

## 设计

`generateGptResponse` 在调用 OpenAI 前完成一次数据库事务：

1. 通过 `User.aiRequestsInFlight < 2` 的条件更新原子占用并发槽位。
2. 非订阅用户同时原子扣减 1 个 `credits`，订阅用户只占用并发槽位。
3. 创建 `AiUsageLog(processing)`，记录操作名、模型和幂等键。

调用成功后，响应、日志完成状态、耗时、prompt/completion/total token 和微美元成本与槽位释放在同一事务提交。供应商异常、解析异常或数据库异常会进入补偿事务，记录 `failed`、释放槽位并退回预扣额度。

幂等键按用户建立复合唯一索引。已完成的重复请求直接返回已保存的 `GptResponse`，处理中的重复请求返回 409；数据库唯一约束负责处理两个相同请求同时到达的竞态。

## 测试

首次启用功能时，使用 Wasp 生成并应用 Prisma migration：

```bash
wasp db migrate-dev
```

```bash
npx vitest run --config vitest.config.ts src/demo-ai-app/aiUsage.test.ts
$env:DATABASE_URL = "postgresql://user:pass@localhost:5432/open_saas"
npx prisma@5.19.1 validate --schema schema.prisma
```

测试覆盖额度不足、并发槽位耗尽、幂等键边界、错误码归档和 token 成本计算。管理员访问 `/admin/ai-usage` 查看今日、7 日或 30 日聚合，并可分页筛选调用明细。完整端到端验证需要运行 Wasp 生成的应用并使用测试数据库及 AI provider mock。

## 后续规划

- 为更多模型补充价格表，并把价格版本写入成本审计记录。
- 增加定时任务清理长期保留的失败日志，并对持续触发 429 的账户接入告警。
