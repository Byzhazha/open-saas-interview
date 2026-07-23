import { describe, expect, it } from "vitest";
import { estimateCostMicros, normalizeTokenUsage } from "./cost";

describe("AI token cost accounting", () => {
  it("normalizes missing provider usage to zero", () => {
    expect(normalizeTokenUsage(undefined)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it("derives total tokens from prompt and completion tokens", () => {
    expect(
      normalizeTokenUsage({ prompt_tokens: 12.8, completion_tokens: 7.2 }),
    ).toEqual({
      promptTokens: 12,
      completionTokens: 7,
      totalTokens: 19,
    });
  });

  it("uses the model pricing table for known models", () => {
    expect(
      estimateCostMicros("gpt-3.5-turbo", {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      }),
    ).toBe(250);
  });

  it("falls back to the default model pricing for unknown models", () => {
    expect(
      estimateCostMicros("unknown-model", {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      }),
    ).toBe(250);
  });
});
