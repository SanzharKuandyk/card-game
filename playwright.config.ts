import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 10000 },
  use: { browserName: "chromium", headless: true, trace: "retain-on-failure" },
  reporter: "list",
});
