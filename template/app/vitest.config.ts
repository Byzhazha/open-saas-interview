import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 单测只加载无 Wasp 运行时依赖的业务策略模块。
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
