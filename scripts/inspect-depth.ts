import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "../src/server/main.ts";
import { createCombat, beginTurn, enemyPhase } from "../src/domain/combat.ts";
import type { Character, Command } from "../src/shared/model.ts";

const dir = await mkdtemp(join(tmpdir(), "cards-depth-inspect-"));
const server = await createServer({
  dataDir: dir,
  automaticTicks: false,
  sessionSeed: 42,
});
await server.http.listen({ host: "127.0.0.1", port: 0 });
const address = server.http.server.address();
assert(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
try {
  const { session, token } = await server.app.create();
  server.app.connect("fixture-host", session.id, { role: "host" });
  const send = async (socket: string, command: Command) => {
    const receipt = await server.app.command(socket, {
      requestId: crypto.randomUUID(),
      sessionId: session.id,
      encounterId: null,
      command,
    });
    assert(receipt.accepted, receipt.message);
  };
  const players = [];
  for (let i = 0; i < 5; i++) {
    const p = await server.app.join(
      session.code,
      ["Alex", "Sam", "Maya", "Lee", "Noora"][i]!,
    );
    server.app.connect(`p${i}`, session.id, {
      role: "player",
      memberId: p.memberId,
    });
    await send(`p${i}`, {
      kind: "team",
      character: (
        ["guardian", "rogue", "alchemist", "channeler"] as Character[]
      )[i % 4]!,
      ...(i > 0 && i < 4 ? { crewId: "team-1" } : { name: i ? "Blue" : "Red" }),
    });
    players.push(p);
  }
  await send("fixture-host", { kind: "host", action: "start" });
  const s = server.app.sessions.get(session.id)!;
  for (const crew of Object.values(s.crews)) {
    crew.progress.roster = [...crew.members];
    crew.progress.row = 4;
    crew.progress.nodeId = "r4-0";
    crew.progress.phase = "battle";
    const b = createCombat(
      `${crew.id}:milk`,
      "route",
      crew.members.map((id) => ({
        hero: s.members[id]!.hero,
        crewId: crew.id,
      })),
      80,
      "elite",
      42,
      0,
      s.content,
      { encounterId: "milk-cat" },
    );
    beginTurn(b, 0, s.content);
    enemyPhase(b, 0, s.content);
    beginTurn(b, 0, s.content);
    for (const a of Object.values(b.actors))
      a.hand = [
        "ram",
        "shield-pass",
        "stored-blow",
        "blood-wall",
        "red-tide",
      ].map((cardId, i) => ({
        uid: `${a.memberId}:new:${i}`,
        cardId,
        upgraded: false,
      }));
    crew.progress.combat = b;
  }
  await server.app.repository.save(s);
  const context = await browser.newContext({
    viewport: { width: 388, height: 619 },
  });
  await context.addCookies([
    { name: "cg-player", value: players[0]!.token, url: base },
    { name: "cg-host", value: token, url: base },
  ]);
  const page = await context.newPage();
  await page.goto(`${base}/play/${session.id}`);
  await page.getByRole("button", { name: "Take control", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "End turn", exact: true }),
  ).toBeEnabled();
  const reports: object[] = [];
  await mkdir("docs/screenshots", { recursive: true });
  for (const [width, height] of [
    [294, 534],
    [360, 800],
    [388, 619],
    [667, 375],
    [844, 390],
    [768, 1024],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page
      .locator(`[data-card-uid="${players[0]!.memberId}:new:1"]`)
      .click();
    const targets = page.locator(
      'select[aria-label="Player"], select[aria-label="Target"]',
    );
    if (await targets.count())
      await targets.first().selectOption(players[1]!.memberId);
    server.app.onPublish(session.id);
    await expect(page.locator(".turn-clock").first()).toContainText("60s");
    await expect(page.locator(".enemy-photo img").first()).toBeVisible();
    const result = await page.evaluate(() => {
      const inside = (e: Element | null) => {
        if (!e) return false;
        const r = e.getBoundingClientRect();
        return (
          r.top >= 0 &&
          r.left >= 0 &&
          r.bottom <= innerHeight &&
          r.right <= innerWidth
        );
      };
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        footer: inside(document.querySelector(".play-footer")),
        enemyReadouts: [
          ...document.querySelectorAll(".enemy-readout, .enemy-intention"),
        ].every((el) => {
          const arena = document
            .querySelector(".combat-arena")!
            .getBoundingClientRect();
          const r = el.getBoundingClientRect();
          return (
            r.top >= arena.top && r.bottom <= arena.bottom + 1 && inside(el)
          );
        }),
        cards: [...document.querySelectorAll(".hand .card")].every(inside),
        portraitSizes: [
          ...document.querySelectorAll<HTMLImageElement>(".enemy-photo img"),
        ].map((img) => ({
          width: img.getBoundingClientRect().width,
          height: img.getBoundingClientRect().height,
        })),
        portraits: [
          ...document.querySelectorAll<HTMLImageElement>(".enemy-photo img"),
        ].every(
          (img) =>
            img.complete &&
            img.naturalWidth > 0 &&
            img.getBoundingClientRect().width <=
              img.parentElement!.getBoundingClientRect().width + 1,
        ),
      };
    });
    assert(
      !result.overflow &&
        result.footer &&
        result.cards &&
        result.enemyReadouts &&
        result.portraits,
      JSON.stringify({ width, height, result }),
    );
    reports.push({ width, height, ...result });
    await page.screenshot({
      path: `docs/screenshots/depth-${width}x${height}.png`,
    });
  }
  await page.setViewportSize({ width: 388, height: 619 });
  await page.getByRole("button", { name: /Milk Cat intention:/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Block");
  await page.keyboard.press("Escape");
  // Every template is local and decodes. Failed loads keep the controls intact.
  for (const portrait of s.content.portraits!) {
    const response = await context.request.get(base + portrait.path);
    assert.equal(response.status(), 200);
    // Decode the actual bundled asset, not just its HTTP response.
    assert(
      await page.evaluate(async (path) => {
        const image = new Image();
        image.src = path;
        await image.decode();
        return image.naturalWidth > 0 && image.naturalHeight > 0;
      }, portrait.path),
    );
  }
  await page.route("**/assets/enemies/milk-cat.png", (route) => route.abort());
  await page.reload();
  await expect(page.locator(".enemy svg.combat-art").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "End turn", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/assets/enemies/milk-cat.png");
  await page.reload();
  await expect(page.locator(".enemy-photo img").first()).toBeVisible();
  const response = await context.request.post(
    `${base}/api/session/${session.id}/projector`,
  );
  const projector = await context.newPage();
  await projector.setViewportSize({ width: 1920, height: 1080 });
  await projector.goto(
    `${base}/projector/${session.id}?view=${(await response.json()).token}`,
  );
  await expect(projector.locator(".team-board")).toHaveCount(2);
  await expect(projector.locator(".board-member")).toHaveCount(5);
  await expect(projector.locator(".enemy-photo img").first()).toBeVisible();
  await expect(projector.locator(".turn-clock").first()).toContainText("60s");
  for (const width of [1366, 1920]) {
    await projector.setViewportSize({
      width,
      height: width === 1366 ? 768 : 1080,
    });
    server.app.onPublish(session.id);
    await expect(projector.locator(".turn-clock").first()).toContainText("60s");
    assert(
      await projector.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await projector.screenshot({
      path: `docs/screenshots/depth-projector-${width}.png`,
      fullPage: true,
    });
  }
  await projector.getByRole("button", { name: "Map", exact: true }).click();
  await expect(projector.locator(".shared-map")).toContainText("Milk Cat");
  await projector.screenshot({
    path: "docs/screenshots/depth-map.png",
    fullPage: true,
  });
  await writeFile(
    "docs/depth-responsive.json",
    JSON.stringify(
      {
        reports,
        projectorWidths: [1366, 1920],
        fallback: true,
        localAssets: s.content.portraits!.length,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      samples: reports.length,
      projector: 2,
      fallback: true,
      passed: true,
    }),
  );
} finally {
  await browser.close();
  await server.http.close();
  await rm(dir, { recursive: true, force: true });
}
