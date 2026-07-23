export const AI_MODEL = "gpt-3.5-turbo";

type ModelPricing = {
  promptMicrosPerToken: number;
  completionMicrosPerToken: number;
};

// 价格以美元微单位保存，避免浮点数累加造成后台统计误差。
const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-3.5-turbo": {
    promptMicrosPerToken: 1.5,
    completionMicrosPerToken: 2,
  },
  "gpt-4o-mini": {
    promptMicrosPerToken: 0.15,
    completionMicrosPerToken: 0.6,
  },
};

export type AiTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

/** 统一规范供应商返回的 token 字段，缺失时按零处理。 */
export function normalizeTokenUsage(
  usage:
    | {
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
      }
    | null
    | undefined,
): AiTokenUsage {
  const promptTokens = Math.max(0, Math.floor(usage?.prompt_tokens ?? 0));
  const completionTokens = Math.max(
    0,
    Math.floor(usage?.completion_tokens ?? 0),
  );
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

/** 返回美元微单位整数，便于数据库聚合和排序。 */
export function estimateCostMicros(model: string, usage: AiTokenUsage): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[AI_MODEL];
  return Math.round(
    usage.promptTokens * pricing.promptMicrosPerToken +
      usage.completionTokens * pricing.completionMicrosPerToken,
  );
}
