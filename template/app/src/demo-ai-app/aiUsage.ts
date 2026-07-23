import * as z from "zod";

/** AI 调用状态只允许这三个值，便于后续统计和告警按状态聚合。 */
export const AiUsageStatus = {
  Processing: "processing",
  Completed: "completed",
  Failed: "failed",
} as const;

export const MAX_CONCURRENT_AI_REQUESTS = 2;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 100;

/** 请求键限制长度，避免把大字段写入唯一索引并影响查询性能。 */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_IDEMPOTENCY_KEY_LENGTH);

export function getReservationErrorStatus(
  isSubscribed: boolean,
  credits: number,
  requestsInFlight: number,
): 402 | 429 {
  if (!isSubscribed && credits < 1) {
    return 402;
  }
  if (requestsInFlight >= MAX_CONCURRENT_AI_REQUESTS) {
    return 429;
  }
  return 429;
}

export function getErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "invalid_ai_response";
  }
  if (error instanceof Error && error.name) {
    return error.name.slice(0, 80);
  }
  return "ai_provider_error";
}
