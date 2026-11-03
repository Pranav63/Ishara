import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:3101", browserName: "chromium", reducedMotion: "reduce" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: !process.env.CI,
  },
});
