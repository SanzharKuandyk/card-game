import { chromium, expect } from "@playwright/test";
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
  const players = [];
  const names = ["Alex", "Sam", "Maya", "Lee", "Noora", "Ilya", "Sofia", "Dan"];
  for (let i = 0; i < 8; i++) {
    const player = await server.app.join(session.code, names[i]!);
    const sock = await socket("player", player.token, session.id);
    await send(sock, session.id, {
      kind: "team",
      character: ["guardian", "rogue", "alchemist", "channeler"][
        i % 4
      ] as "guardian",
      ...(i % 4
        ? { crewId: `team-${Math.floor(i / 4) + 1}` }
        : { name: i ? "Blue team" : "Red team" }),
    });
    players.push({ ...player, sock });
  }
  await send(host, session.id, { kind: "host", action: "start" });
  for (const [i, p] of players.entries())
    if (i % 4 < 3)
      await send(p.sock, session.id, { kind: "travel", nodeId: "r1-0" });
  const pc = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  await pc.addCookies([{ name: "cg-host", value: token, url: base }]);
  const response = await pc.request.post(
    `${base}/api/session/${session.id}/projector`,
  );
  const projector = await pc.newPage();
  await projector.goto(
    `${base}/projector/${session.id}?view=${(await response.json()).token}`,
  );
  await projector.locator(".team-board").last().waitFor();
  const context = await browser.newContext({
    viewport: { width: 388, height: 619 },
  });
  await context.addCookies([
    { name: "cg-player", value: players[0]!.token, url: base },
  ]);
  const phone = await context.newPage();
  phone.on("pageerror", (e) => console.log("PHONE ERROR", e.message));
  await phone.goto(`${base}/play/${session.id}`);
  await phone.getByRole("button", { name: "Take control" }).click();
  await expect(phone.getByRole("button", { name: "Take control" })).toHaveCount(
    0,
  );
  await mkdir("docs/screenshots", { recursive: true });
  const report = [];
  for (const [width, height] of [
    [388, 619],
    [360, 800],
    [294, 534],
    [667, 375],
    [844, 390],
    [768, 1024],
  ]) {
    await phone.setViewportSize({ width: width!, height: height! });
    for (const crew of Object.values(
      server.app.sessions.get(session.id)!.crews,
    )) {
      const fight = crew.progress.combat!;
      fight.enemies[0]!.hp = fight.enemies[0]!.maxHp = 300;
      for (const actor of Object.values(fight.actors)) {
        actor.energy = 3;
        actor.block = 0;
        actor.hand = [
          "guard",
          "strike",
          "shield-strike",
          "heavy-swing",
          "brace",
        ].map((cardId, i) => ({
          uid: `${width}-${actor.memberId}-${i}`,
          cardId,
          upgraded: false,
        }));
        actor.handRevision++;
      }
    }
    server.app.onPublish(session.id);
    await expect(projector.locator(".board-enemy-hp").first()).toHaveText(
      "300/300 HP",
    );
    await phone
      .locator(`[data-card-uid="${width}-${players[0]!.memberId}-0"]`)
      .click();
    const grid = projector.locator(".live-team-grid");
    const scrollBefore = await grid.evaluate((el) => el.scrollTop);
    await phone.getByRole("button", { name: /^Play ·/ }).click();
    for (const [i, p] of players.entries()) {
      if (!i) continue;
      const fight = server.app.sessions.get(session.id)!.crews[
        `team-${Math.floor(i / 4) + 1}`
      ]!.progress.combat!;
      const actor = fight.actors[p.memberId]!;
      const ack = await p.sock.emitWithAck("command", {
        requestId: crypto.randomUUID(),
        sessionId: session.id,
        encounterId: fight.id,
        command: {
          kind: "play",
          handRevision: actor.handRevision,
          cardUid: actor.hand[i % 4 ? 1 : 0]!.uid,
          targetId: i % 4 ? fight.enemies[0]!.id : p.memberId,
        },
      });
      assert(ack.accepted, ack.message);
    }
    await expect(phone.locator(".queue-summary")).toContainText("Next · 3");
    const first = projector.locator(".team-board").first();
    await expect(first.locator(".queue-label")).toHaveText("Next");
    await expect(first.locator(".queue-card")).toHaveCount(3);
    await expect(first.locator(".queue-card small")).toHaveText([
      "Sam",
      "Maya",
      "Lee",
    ]);
    await phone.waitForTimeout(300);
    await phone.screenshot({
      path: `docs/screenshots/queue-phone-${width}x${height}.png`,
    });
    if (width === 388) {
      await projector.screenshot({
        path: "docs/screenshots/queue-projector-1920.png",
      });
      await phone.getByRole("button", { name: "Inspect play queue" }).click();
      await expect(
        phone.getByRole("dialog", { name: "Plays", exact: true }),
      ).toContainText("Next 1 · Sam · Strike");
      await phone.screenshot({
        path: "docs/screenshots/queue-phone-details.png",
      });
      await phone.keyboard.press("Escape");
      await expect(first.locator(".board-playback.is-impact")).toBeVisible();
      await projector.screenshot({
        path: "docs/screenshots/queue-projector-impact.png",
      });
    }
    report.push({
      width,
      height,
      ...(await phone.evaluate(() => {
        const action = document
          .querySelector(".play-footer")!
          .getBoundingClientRect();
        const queue = document
          .querySelector(".queue-summary")!
          .getBoundingClientRect();
        const track = document
          .querySelector(".action-slot")!
          .getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          reachableActions: action.bottom <= innerHeight && action.top >= 0,
          reachableQueue: queue.bottom <= innerHeight && queue.top >= 0,
          queueFitsTrack:
            queue.top >= track.top && queue.bottom <= track.bottom,
        };
      })),
    });
    await expect(first.locator(".board-playback.is-playing")).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(phone.locator(".played-card-stage")).toHaveCount(0, {
      timeout: 15000,
    });
    assert.equal(await grid.evaluate((el) => el.scrollTop), scrollBefore);
    await expect(first.locator(".queue-label")).toHaveText("Recent");
    await expect(first.locator(".queue-card small")).toHaveText([
      "Lee",
      "Maya",
      "Sam",
    ]);
    if (width === 388)
      await projector.screenshot({
        path: "docs/screenshots/queue-projector-recent.png",
      });
  }
  assert(
    report.every(
      (r) =>
        !r.overflow &&
        r.reachableActions &&
        r.reachableQueue &&
        r.queueFitsTrack,
    ),
  );
  await writeFile(
    "docs/playback-queue-responsive.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  for (const sock of sockets) sock.disconnect();
  await browser.close();
  await server.http.close();
  await rm(dataDir, { recursive: true, force: true });
}
