import { chromium, expect } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server/main.ts";

// Bounded visual fixture. UI plays still go through authenticated commands.
const dataDir = await mkdtemp(join(tmpdir(), "cards-feedback-"));
const server = await createServer({
  dataDir,
  automaticTicks: false,
  sessionSeed: 42,
});
await server.http.listen({ port: 0, host: "127.0.0.1" });
const address = server.http.server.address();
if (!address || typeof address === "string") throw new Error("No address");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
try {
  const host = await browser.newPage();
  await host.goto(`${base}/#host`);
  await host.getByRole("button", { name: "New game", exact: true }).click();
  await expect(host).toHaveURL(/\/host\/[\da-f-]+$/);
  const id = host.url().split("/host/")[1]!;
  const code = server.app.sessions.get(id)!.code;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/join/${code}`);
  await page.getByLabel("Name", { exact: true }).fill("Alex");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.getByRole("button", { name: /^guardian/i }).click();
  await page.getByRole("button", { name: "Join team", exact: true }).click();
  await expect(
    page.getByText("Waiting to start", { exact: true }),
  ).toBeVisible();
  await host.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".map-node.available").first().click();
  await expect(
    page.getByRole("heading", { name: "Turn 1", exact: true }),
  ).toBeVisible();
  await mkdir("docs/screenshots", { recursive: true });
  const reports = [];
  for (const [width, height] of [
    [294, 534],
    [360, 800],
    [667, 375],
    [844, 390],
    [768, 1024],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    const fight = Object.values(server.app.sessions.get(id)!.crews)[0]!.progress
      .combat!;
    const actor = Object.values(fight.actors)[0]!;
    actor.hand = Array.from({ length: 10 }, (_, index) => ({
      uid: `${width}-${index}`,
      cardId: index ? "guard" : "strike",
      upgraded: false,
    }));
    actor.handRevision++;
    actor.energy = 3;
    fight.enemies[0]!.hp = 20;
    fight.enemies[0]!.block = 2;
    server.app.onPublish(id);
    await page.locator(`[data-card-uid="${width}-0"]`).click();
    await page.getByRole("button", { name: /^Play ·/ }).click();
    await expect(
      page.locator(".played-card-stage:not(.card-impact)"),
    ).toBeVisible();
    // Capture the readable reveal after its entrance, before the target impact.
    await page.waitForTimeout(280);
    await page.screenshot({
      path: `docs/screenshots/play-reveal-${width}x${height}.png`,
    });
    await expect(page.locator(".enemy .effect-burst")).toBeVisible();
    await page.waitForTimeout(260);
    await page.screenshot({
      path: `docs/screenshots/play-impact-${width}x${height}.png`,
    });
    reports.push({
      width,
      height,
      ...(await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        handVisible: [...document.querySelectorAll(".hand .card")].every(
          (card) => {
            const box = card.getBoundingClientRect();
            return (
              box.top >= 0 &&
              box.bottom <= innerHeight &&
              box.left >= 0 &&
              box.right <= innerWidth
            );
          },
        ),
        playReachable: (() => {
          const box = document
            .querySelector(".play-footer")!
            .getBoundingClientRect();
          return box.top >= 0 && box.bottom <= innerHeight;
        })(),
      }))),
    });
    await expect(page.locator(".played-card-stage")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "End turn", exact: true }).click();
  await server.app.advance(1);
  await expect(page.locator(".combat-link.active")).toBeVisible();
  await page.waitForTimeout(100);
  await page.screenshot({ path: "docs/screenshots/enemy-windup-360x800.png" });
  await expect(page.locator(".hero .effect-burst")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/enemy-impact-360x800.png" });
  await writeFile(
    "docs/feedback-responsive.json",
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(JSON.stringify(reports));
} finally {
  await browser.close();
  await server.http.close();
  await rm(dataDir, { recursive: true, force: true });
}
