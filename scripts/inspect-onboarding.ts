import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { createServer } from "../src/server/main.ts";
import type { Command } from "../src/shared/model.ts";
const dir = await mkdtemp(join(tmpdir(), "cards-opening-inspect-"));
const server = await createServer({
  dataDir: dir,
  automaticTicks: false,
  sessionSeed: 42,
});
await server.http.listen({ host: "127.0.0.1", port: 0 });
const address = server.http.server.address();
if (!address || typeof address === "string") throw Error("No address");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const sockets: Socket[] = [];
try {
  const { session, token } = await server.app.create();
  const connect = async (role: string, credential: string) => {
    const sock = io(base, {
      auth: { sessionId: session.id, role },
      transports: ["websocket"],
      extraHeaders: { cookie: `cg-${role}=${credential}` },
    });
    sockets.push(sock);
    await new Promise<void>((resolve, reject) => {
      sock.once("connect", resolve);
      sock.once("connect_error", reject);
    });
    return sock;
  };
  const send = async (sock: Socket, command: Command) => {
    const state = server.app.sessions.get(session.id)!;
    const receipt = await sock.emitWithAck("command", {
      sessionId: session.id,
      requestId: crypto.randomUUID(),
      encounterId: state.crews["team-1"]?.progress.combat?.id ?? null,
      command,
    });
    assert(receipt.accepted, receipt.message);
  };
  const host = await connect("host", token);
  const players = [];
  for (let i = 0; i < 4; i++) {
    const p = await server.app.join(
      session.code,
      i ? `Teammate ${i + 1}` : "Alex",
    );
    const sock = await connect("player", p.token);
    await send(sock, {
      kind: "team",
      character: "guardian",
      ...(i ? { crewId: "team-1" } : { name: "Team" }),
    });
    players.push({ ...p, sock });
  }
  const context = await browser.newContext();
  await context.addCookies([
    { name: "cg-player", value: players[0]!.token, url: base },
  ]);
  const page = await context.newPage();
  await page.goto(`${base}/play/${session.id}`);
  await page.getByText("Waiting to start", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Take control", exact: true }).click();
  await send(host, { kind: "host", action: "start" });
  for (const p of players.slice(1))
    await send(p.sock, { kind: "travel", nodeId: "r1-0" });
  await page.getByRole("heading", { name: "Turn 1", exact: true }).waitFor();
  await mkdir("docs/screenshots", { recursive: true });
  const sizes = [
    [294, 534],
    [360, 800],
    [388, 619],
    [667, 375],
    [844, 390],
    [768, 1024],
    [1366, 768],
  ];
  const reports: object[] = [];
  const progressKey = `learning:1:${session.id}:${players[0]!.memberId}`;
  async function preference(seen: string[]) {
    await page.evaluate(
      ({ key, seen }) => {
        const value = JSON.stringify({ version: 1, hidden: false, seen });
        localStorage.setItem(key, value);
        window.dispatchEvent(
          new StorageEvent("storage", { key, newValue: value }),
        );
      },
      { key: progressKey, seen },
    );
  }
  async function inspect(scene: string, seen: string[] = []) {
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width: width!, height: height! });
      await preference(seen);
      const target = page
        .locator(".target-controls select, .enemy-target select")
        .first();
      if (await target.count()) await target.scrollIntoViewIfNeeded();
      const report = await page.evaluate(() => {
        const inside = (element: Element | null) => {
          if (!element) return false;
          const r = element.getBoundingClientRect();
          return (
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            r.left >= 0 &&
            r.right <= innerWidth
          );
        };
        const hand = [...document.querySelectorAll(".hand .card")];
        const description = document.querySelector(".selected-description");
        const target = document.querySelector(
          ".target-controls select, .enemy-target select",
        );
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          handVisible: hand.length > 0 && hand.every(inside),
          actionsReachable: inside(document.querySelector(".play-footer")),
          helpReachable: inside(document.querySelector(".battle-help")),
          targetReachable: !target || inside(target),
          descriptionAboveTarget:
            !description ||
            !target ||
            description.getBoundingClientRect().bottom <=
              target.getBoundingClientRect().top,
          highlighted: document.querySelectorAll(".learning-highlight").length,
          detailsScrollTop:
            document.querySelector(".action-details")!.scrollTop,
          footer: document
            .querySelector(".play-footer")!
            .getBoundingClientRect()
            .toJSON(),
        };
      });
      await page.screenshot({
        path: `docs/screenshots/opening-${scene}-${width}x${height}.png`,
      });
      assert(
        !report.overflow &&
          report.handVisible &&
          report.actionsReachable &&
          report.helpReachable &&
          report.targetReachable &&
          report.descriptionAboveTarget,
        JSON.stringify({ scene, width, height, ...report }),
      );
      reports.push({ scene, width, height, ...report });
      await page.screenshot({
        path: `docs/screenshots/opening-${scene}-${width}x${height}.png`,
      });
    }
  }
  await inspect("initial");
  const fight = server.app.sessions.get(session.id)!.crews["team-1"]!.progress
    .combat!;
  const actor = fight.actors[players[0]!.memberId]!;
  actor.hand = [
    "brace",
    "shield-strike",
    "guard",
    "strike",
    "gift",
    "charge",
    "windup",
    "blood-spark",
    "heavy-swing",
    "guard",
  ].map((cardId, i) => ({ uid: `opening-${i}`, cardId, upgraded: false }));
  actor.handRevision++;
  server.app.onPublish(session.id);
  await page.locator('[data-card-uid="opening-9"]').waitFor();
  await inspect("combination", ["choose", "more", "defence"]);
  await page.locator('[data-card-uid="opening-1"]').click();
  await inspect("selected");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('[data-card-uid="opening-4"]').click();
  await inspect("target");
  for (const profile of [
    { width: 390, height: 844, top: 47, bottom: 34, left: 0, right: 0 },
    { width: 844, height: 390, top: 0, bottom: 21, left: 47, right: 0 },
  ]) {
    await page.setViewportSize(profile);
    await page.evaluate((profile) => {
      for (const edge of ["top", "bottom", "left", "right"] as const)
        document.documentElement.style.setProperty(
          `--safe-${edge}`,
          `${profile[edge]}px`,
        );
    }, profile);
    const arena = await page.locator(".combat-arena").boundingBox();
    await page.getByRole("button", { name: "Help", exact: true }).click();
    await page.getByRole("dialog", { name: "Help", exact: true }).waitFor();
    const box = (await page
      .getByRole("dialog", { name: "Help", exact: true })
      .boundingBox())!;
    assert(
      box.x >= profile.left &&
        box.x + box.width <= profile.width - profile.right &&
        box.y >= profile.top &&
        box.y + box.height <= profile.height - profile.bottom,
    );
    assert.deepEqual(await page.locator(".combat-arena").boundingBox(), arena);
    await page.screenshot({
      path: `docs/screenshots/opening-help-${profile.width}x${profile.height}.png`,
    });
    await page.keyboard.press("Escape");
    assert(
      await page
        .getByRole("button", { name: "Help", exact: true })
        .evaluate((el) => el === document.activeElement),
    );
    reports.push({
      scene: "safe-help",
      ...profile,
      bounds: true,
      selectionPreserved: await page
        .locator('[data-card-uid="opening-4"]')
        .getAttribute("class"),
    });
  }
  await writeFile(
    "docs/opening-responsive.json",
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(JSON.stringify({ samples: reports.length, passed: true }));
} finally {
  for (const s of sockets) s.disconnect();
  await browser.close();
  await server.http.close();
  await rm(dir, { recursive: true, force: true });
}
