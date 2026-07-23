import { describe, expect, it } from "vitest";
import { animationInputSchema, requestVideoSchema } from "./validation";

describe("动画视频任务校验", () => {
  it("限制动画内容、时长和帧率边界", () => {
    expect(
      animationInputSchema.safeParse({
        title: "Demo",
        htmlContent: "<div>hello</div>",
      }).success,
    ).toBe(true);
    expect(
      requestVideoSchema.safeParse({
        animationId: "550e8400-e29b-41d4-a716-446655440000",
        format: "mp4",
        durationSeconds: 30,
        fps: 60,
      }).success,
    ).toBe(true);
    expect(
      requestVideoSchema.safeParse({
        animationId: "550e8400-e29b-41d4-a716-446655440000",
        format: "avi",
        durationSeconds: 31,
        fps: 5,
      }).success,
    ).toBe(false);
  });
});
