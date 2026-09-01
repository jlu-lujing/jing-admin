import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:5273", locale: "zh-CN" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5273",
    reuseExistingServer: true,
  },
});
