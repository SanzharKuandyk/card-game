import { chromium } from "@playwright/test";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "../src/server/main.ts";
import type { Command } from "../src/shared/model.ts";
const dataDir = await mkdtemp(join(tmpdir(), "cards-inspect-"));
const server = await createServer({
  dataDir,
  automaticTicks: false,
});
await server.http.listen({ port: 0, host: "127.0.0.1" });
const address = server.http.server.address();
if (!address || typeof address === "string") throw new Error("No address");
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const sockets: Socket[] = [];
async function socket(role: string, token: string, id: string) {
  const sock = io(base, {
    auth: { sessionId: id, role },
    transports: ["websocket"],
    extraHeaders: {
      cookie: `cg-${role === "host" ? "host" : "player"}=${token}`,
    },
  });
  sockets.push(sock);
  await new Promise<void>((r, j) => {
    sock.once("connect", () => r());
    sock.once("connect_error", j);
  });
  return sock;
}
async function send(sock: Socket, id: string, command: Command) {
  const s = server.app.sessions.get(id)!;
  const response = (await sock.emitWithAck("command", {
    requestId: crypto.randomUUID(),
    sessionId: id,
    encounterId:
      s.bosses.find((b) => b.gate === s.activeBossGate)?.combat?.id ?? null,
    command,
  })) as { accepted: boolean; message: string };
  if (!response.accepted) throw new Error(response.message);
}
try {
  const { session, token } = await server.app.create();
  const host = await socket("host", token, session.id);
  const clients: Socket[] = [];
  for (let i = 0; i < 80; i++) {
    const player = await server.app.join(
      session.code,
      ["Alex", "Sam", "Maya", "Lee"][i % 4] + " " + (Math.floor(i / 4) + 1),
    );
    const sock = await socket("player", player.token, session.id);
    await send(sock, session.id, {
      kind: "team",
      character: ["guardian", "rogue", "alchemist", "channeler"][
        i % 4
      ] as "guardian",
      ...(i % 4
        ? { crewId: "team-" + (Math.floor(i / 4) + 1) }
        : { name: "Team " + (Math.floor(i / 4) + 1) }),
    });
    clients.push(sock);
  }
  await send(host, session.id, { kind: "host", action: "start" });
  for (let i = 0; i < clients.length; i++)
    if (i % 4 < 3)
      await send(clients[i]!, session.id, { kind: "travel", nodeId: "r1-0" });
  for (const crew of Object.values(
    server.app.sessions.get(session.id)!.crews,
  )) {
    crew.progress.combat!.enemies[0]!.poison = 3;
    crew.progress.combat!.enemies[0]!.weak = 2;
  }
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  await context.addCookies([{ name: "cg-host", value: token, url: base }]);
  const response = await context.request.post(
    base + "/api/session/" + session.id + "/projector",
  );
  const credential = (await response.json()).token;
  const page = await context.newPage();
  await page.goto(base + "/projector/" + session.id + "?view=" + credential);
  await page.locator(".team-board").nth(19).waitFor();
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/projector-overview-20.png" });
  const grid = page.locator(".live-team-grid");
  const first = page.locator(".team-board").first();
  await first.getByRole("button", { name: "Poison 3", exact: true }).click();
  await page.getByRole("dialog", { name: /Poison/ }).waitFor();
  await page.screenshot({
    path: "docs/screenshots/projector-effect-details.png",
  });
  await page.keyboard.press("Escape");
  await first.getByRole("button", { name: /intention/ }).click();
  assert.match(
    await page.getByRole("dialog").innerText(),
    /Alex 1.*incoming damage/,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox").fill("Team 20");
  assert.equal(await page.locator(".team-board:visible").count(), 1);
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await first
    .getByRole("button", { name: "Collapse Team 1", exact: true })
    .click();
  assert.equal(await first.locator(".board-members").isVisible(), false);
  await first
    .getByRole("button", { name: "Expand Team 1", exact: true })
    .click();
  const sizes = [];
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    const layout = await first.evaluate((el) => {
      const members = el
        .querySelector(".board-members")!
        .getBoundingClientRect();
      const card = el.querySelector(".board-playback")!.getBoundingClientRect();
      const enemies = el
        .querySelector(".board-enemies")!
        .getBoundingClientRect();
      return {
        horizontal: members.right <= card.left && card.right <= enemies.left,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(layout.horizontal, true);
    assert.equal(layout.overflow, false);
    sizes.push({ width, height, ...layout });
    await page.screenshot({
      path: `docs/screenshots/projector-rows-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await grid.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const before = await grid.evaluate((el) => el.scrollTop);
  for (const crew of Object.values(
    server.app.sessions.get(session.id)!.crews,
  )) {
    const battle = crew.progress.combat!;
    const actor = Object.values(battle.actors)[0]!;
    actor.hand = [
      { uid: "show-strike-" + crew.id, cardId: "strike", upgraded: false },
    ];
    actor.handRevision++;
  }
  server.app.onPublish(session.id);
  for (let i = 0; i < clients.length; i += 4) {
    const battle = server.app.sessions.get(session.id)!.crews[
      "team-" + (i / 4 + 1)
    ]!.progress.combat!;
    const actor = Object.values(battle.actors)[0]!;
    const ack = await clients[i]!.emitWithAck("command", {
      requestId: crypto.randomUUID(),
      sessionId: session.id,
      encounterId: battle.id,
      command: {
        kind: "play",
        cardUid: actor.hand[0]!.uid,
        handRevision: actor.handRevision,
        targetId: battle.enemies[0]!.id,
      },
    });
    if (!ack.accepted) throw new Error(ack.message);
  }
  await page
    .locator(".board-playback")
    .last()
    .getByText("Strike", { exact: true })
    .waitFor();
  await page.screenshot({
    path: "docs/screenshots/projector-overview-plays.png",
  });
  const after = await grid.evaluate((el) => el.scrollTop);
  assert.equal(before, after, "Live plays must not move projector scroll");
  const lastBoard = page.locator(".team-board").last();
  await lastBoard
    .getByRole("button", { name: "Inspect Strike", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Strike", exact: true }).waitFor();
  assert.match(
    await page.getByRole("dialog", { name: "Strike", exact: true }).innerText(),
    /Deal 6 damage/,
  );
  await page.keyboard.press("Escape");
  const lastBattle = server.app.sessions.get(session.id)!.crews["team-20"]!
    .progress.combat!;
  for (let i = 1; i <= 2; i++) {
    const enemy = {
      ...lastBattle.enemies[0]!,
      id: `inspect-enemy-${i}`,
      name: i === 1 ? "Guard" : "Supporter",
      pattern: i === 1 ? "guard" : "support",
    };
    lastBattle.enemies.push(enemy);
    lastBattle.intents.push({ ...lastBattle.intents[0]!, enemyId: enemy.id });
  }
  server.app.onPublish(session.id);
  await lastBoard.locator(".board-enemies > div").nth(2).waitFor();
  await page.setViewportSize({ width: 1366, height: 768 });
  await lastBoard.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/projector-three-enemies.png",
  });
  const report = {
    teams: await page.locator(".team-board").count(),
    members: await page.locator(".board-member").count(),
    scrollBefore: before,
    scrollAfter: after,
    stableScroll: before === after,
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    visibleHands: await page.locator(".board-member details").count(),
    sizes,
    effectInspection: true,
    namedIntentTargets: true,
    searchAndCollapse: true,
    fullCardInspection: true,
  };
  await writeFile(
    "docs/projector-overview.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  for (const sock of sockets) sock.disconnect();
  await browser.close();
  await server.http.close();
  await rm(dataDir, { recursive: true, force: true });
}
