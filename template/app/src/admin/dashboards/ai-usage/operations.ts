import { HttpError, prisma } from "wasp/server";
import type { GetAiUsageLogs, GetAiUsageStats } from "wasp/server/operations";
import * as z from "zod";
import { ensureArgsSchemaOrThrowHttpError } from "../../../server/validation";

const periodSchema = z.enum(["today", "7d", "30d"]);
const statsInputSchema = z.object({ period: periodSchema.default("7d") });
const logsInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  status: z.enum(["processing", "completed", "failed"]).optional(),
});

type Stats = {
  period: z.infer<typeof periodSchema>;
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  processingCalls: number;
  totalTokens: number;
  estimatedCostMicros: number;
  byOperation: Array<{
    operation: string;
    calls: number;
    tokens: number;
    estimatedCostMicros: number;
  }>;
};

type LogsPage = {
  logs: Array<{
    id: string;
    createdAt: Date;
    operation: string;
    model: string;
    status: string;
    totalTokens: number;
    estimatedCostMicros: number;
    durationMs: number | null;
    errorCode: string | null;
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function ensureAdmin(context: { user?: { isAdmin: boolean } | null }): void {
  if (!context.user) throw new HttpError(401, "Authentication required");
  if (!context.user.isAdmin) throw new HttpError(403, "Admin access required");
}

function getPeriodStart(period: z.infer<typeof periodSchema>): Date {
  const now = Date.now();
  const duration = period === "today" ? 24 : period === "7d" ? 7 * 24 : 30 * 24;
  return new Date(now - duration * 60 * 60 * 1000);
}

/** 管理员统计统一从 AiUsageLog 聚合，成功和失败调用使用同一成本口径。 */
export const getAiUsageStats: GetAiUsageStats<
  z.input<typeof statsInputSchema>,
  Stats
> = async (rawArgs, context) => {
  ensureAdmin(context);
  const { period } = ensureArgsSchemaOrThrowHttpError(
    statsInputSchema,
    rawArgs,
  );
  const logs = await prisma.aiUsageLog.findMany({
    where: { createdAt: { gte: getPeriodStart(period) } },
    select: {
      operation: true,
      status: true,
      totalTokens: true,
      estimatedCostMicros: true,
    },
  });

  const byOperation = new Map<string, Stats["byOperation"][number]>();
  let totalTokens = 0;
  let estimatedCostMicros = 0;
  let completedCalls = 0;
  let failedCalls = 0;
  let processingCalls = 0;
  for (const log of logs) {
    totalTokens += log.totalTokens;
    estimatedCostMicros += log.estimatedCostMicros;
    if (log.status === "completed") completedCalls += 1;
    if (log.status === "failed") failedCalls += 1;
    if (log.status === "processing") processingCalls += 1;
    const current = byOperation.get(log.operation) ?? {
      operation: log.operation,
      calls: 0,
      tokens: 0,
      estimatedCostMicros: 0,
    };
    current.calls += 1;
    current.tokens += log.totalTokens;
    current.estimatedCostMicros += log.estimatedCostMicros;
    byOperation.set(log.operation, current);
  }

  return {
    period,
    totalCalls: logs.length,
    completedCalls,
    failedCalls,
    processingCalls,
    totalTokens,
    estimatedCostMicros,
    byOperation: [...byOperation.values()].sort((a, b) => b.calls - a.calls),
  };
};

/** 管理员查看最近调用明细，错误信息只返回稳定错误码。 */
export const getAiUsageLogs: GetAiUsageLogs<
  z.input<typeof logsInputSchema>,
  LogsPage
> = async (rawArgs, context) => {
  ensureAdmin(context);
  const input = ensureArgsSchemaOrThrowHttpError(logsInputSchema, rawArgs);
  const where = input.status ? { status: input.status } : undefined;
  const [logs, total] = await prisma.$transaction([
    prisma.aiUsageLog.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        operation: true,
        model: true,
        status: true,
        totalTokens: true,
        estimatedCostMicros: true,
        durationMs: true,
        errorCode: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.aiUsageLog.count({ where }),
  ]);
  return {
    logs,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
};
