import { describe, expect, it } from "vitest";
import * as z from "zod";
import {
  AiUsageStatus,
  getErrorCode,
  getReservationErrorStatus,
  idempotencyKeySchema,
  MAX_CONCURRENT_AI_REQUESTS,
} from "./aiUsage";

describe("AI 调用额度策略", () => {
  it("没有订阅且额度不足时返回支付提示", () => {
    expect(getReservationErrorStatus(false, 0, 0)).toBe(402);
  });

  it("并发槽位已满时返回限流状态", () => {
    expect(getReservationErrorStatus(true, 0, MAX_CONCURRENT_AI_REQUESTS)).toBe(
      429,
    );
    expect(
      getReservationErrorStatus(false, 2, MAX_CONCURRENT_AI_REQUESTS),
    ).toBe(429);
  });

  it("幂等键限制长度并拒绝空值", () => {
    expect(idempotencyKeySchema.safeParse("request-1").success).toBe(true);
    expect(idempotencyKeySchema.safeParse(" ").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("x".repeat(101)).success).toBe(false);
  });

  it("将供应商异常归档为稳定的错误码", () => {
    expect(getErrorCode(new Error("timeout"))).toBe("Error");
    expect(getErrorCode(z.string().safeParse(1).error)).toBe(
      "invalid_ai_response",
    );
    expect(AiUsageStatus.Failed).toBe("failed");
  });
});
