import { chromium, expect } from "@playwright/test";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { Command, SessionView } from "../src/shared/model.ts";
import { createServer } from "../src/server/main.ts";
const dataDir = await mkdtemp(join(tmpdir(), "cards-smoke-"));
const server = await createServer({
  dataDir,
  automaticTicks: false,
});
await server.http.listen({ port: 0, host: "127.0.0.1" });
const address = server.http.server.address();
if (!address || typeof address === "string") throw new Error("Missing address");
const base = `http://127.0.0.1:${address.port}`;
const delays = monitorEventLoopDelay({ resolution: 10 });
delays.enable();
const sockets: Socket[] = [];
const responseTimes: number[] = [];
const browser = await chromium.launch();
let projectorLayout: object = {};
const projectionBytes: number[] = [];
async function connect(role: string, cookie: string, id: string) {
  const socket = io(base, {
    auth: { sessionId: id, role },
    transports: ["websocket"],
    extraHeaders: { cookie },
  });
  sockets.push(socket);
  socket.on("snapshot", (v: SessionView) =>
    projectionBytes.push(Buffer.byteLength(JSON.stringify(v))),
  );
  await new Promise<void>((r, j) => {
    socket.once("connect", () => r());
    socket.once("connect_error", j);
  });
  return socket;
}
async function send(
  socket: Socket,
  id: string,
  command: Command,
  allowRejection = false,
) {
  const start = performance.now();
  const result = (await socket.timeout(30000).emitWithAck("command", {
    requestId: crypto.randomUUID(),
    sessionId: id,
    encounterId:
      server.app.sessions
        .get(id)!
        .bosses.find(
          (b) => b.gate === server.app.sessions.get(id)!.activeBossGate,
        )?.combat?.id ?? null,
    command,
  })) as { accepted: boolean; message: string };
  responseTimes.push(performance.now() - start);
  if (!result.accepted && !allowRejection) throw new Error(result.message);
  return result;
}
function percentile(values: number[], p: number) {
  return (
    [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] ?? 0
  );
}
try {
  const created = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const { id, code } = (await created.json()) as { id: string; code: string };
  const hostCookie = created.headers.get("set-cookie")!.split(";")[0]!;
  const host = await connect(
    "host",
    created.headers.get("set-cookie")!.split(";")[0]!,
    id,
  );
  const players = await Promise.all(
    Array.from({ length: 80 }, async (_, i) => {
      const response = await fetch(`${base}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, name: `Player ${i + 1}` }),
      });
      const { memberId } = (await response.json()) as { memberId: string };
      const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
      const socket = await connect("player", cookie, id);
      await send(socket, id, {
        kind: "team",
        character: ["guardian", "rogue", "alchemist", "channeler"][
          i % 4
        ] as "guardian",
        name: `Team ${i + 1}`,
      });
      return { socket, memberId, cookie };
    }),
  );
  await send(host, id, { kind: "host", action: "start" });
  const publicResponse = await fetch(`${base}/api/session/${id}/projector`, {
    method: "POST",
    headers: { cookie: hostCookie },
  });
  const publicToken = (await publicResponse.json()).token as string;
  const projector = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await projector.goto(`${base}/projector/${id}?view=${publicToken}`);
  await expect(projector.locator(".team-board")).toHaveCount(80);
  // Position the bounded fixture at the last junction; race the real travel commands.
  for (const c of Object.values(server.app.sessions.get(id)!.crews)) {
    c.progress.row = 7;
    c.progress.nodeId = "r7-2";
    c.progress.phase = "map";
    c.progress.roster = [...c.members];
  }
  const gate = server.app.sessions.get(id)!.map.find((n) => n.row === 8)!;
  const arrivals = await Promise.all(
    players.map((p) =>
      send(p.socket, id, { kind: "travel", nodeId: gate.id }, true),
    ),
  );
  if (arrivals.filter((r) => r.accepted).length !== 1)
    throw new Error("First arrival was not exclusive");
  await server.app.advance(8001);
  for (let round = 0; round < 2; round++) {
    await server.app.advance(6001);
    const q = server.app.sessions.get(id)!.bosses[0]!.quiz;
    await Promise.all(
      players.map((p, i) =>
        send(p.socket, id, {
          kind: "quiz:answer",
          quizId: q.id,
          questionId: q.rounds[round]!.questionId,
          phaseRevision: q.phaseRevision,
          optionId: ["a", "b", "c"][i % 3]!,
        }),
      ),
    );
    await server.app.advance(12001);
    if (round === 0) {
      await expect(projector.locator(".projector-quiz .quiz-team")).toHaveCount(
        80,
      );
      await expect(projector.locator(".quiz-explanation")).toBeVisible();
      projectorLayout = await projector.evaluate(() => {
        const q = document.querySelector(".projector-quiz")!;
        const last = document
          .querySelector(".quiz-team:last-child")!
          .getBoundingClientRect();
        return {
          allTeamsVisible: last.bottom <= innerHeight,
          overflow: document.documentElement.scrollWidth > innerWidth,
          scrollHeight: q.scrollHeight,
          clientHeight: q.clientHeight,
        };
      });
      await projector.screenshot({
        path: "docs/screenshots/v2-quiz-80-teams.png",
      });
    }
    await server.app.advance(12001);
  }
  for (const reward of server.app.sessions.get(id)!.rewards) {
    const p = players.find((p) => p.memberId === reward.memberId)!;
    await send(p.socket, id, {
      kind: "reward",
      rewardId: reward.id,
      cardUid: null,
    });
  }
  await server.app.advance(8001);
  await Promise.all(
    players.map(async (p) => {
      const b = server.app.sessions.get(id)!.bosses[0]!.combat!;
      const a = b.actors[p.memberId]!;
      const card = a.hand.find((c) => {
        const def = server.app.sessions
          .get(id)!
          .content.cards.find((d) => d.id === c.cardId)!;
        return (
          ["enemy", "self"].includes(def.target) && !def.choose && def.cost <= 3
        );
      })!;
      const def = server.app.sessions
        .get(id)!
        .content.cards.find((d) => d.id === card.cardId)!;
      await send(p.socket, id, {
        kind: "play",
        cardUid: card.uid,
        handRevision: a.handRevision,
        targetId: def.target === "enemy" ? "main" : undefined,
      });
    }),
  );
  await Promise.all(
    players.map((p) => send(p.socket, id, { kind: "end-turn", ended: true })),
  );
  await server.app.advance(1);
  await server.app.advance(8001);
  for (const p of players.slice(0, 10)) {
    p.socket.disconnect();
    p.socket = await connect("player", p.cookie, id);
  }
  await send(host, id, { kind: "host", action: "pause" });
  await send(host, id, { kind: "host", action: "resume" });
  await send(host, id, { kind: "host", action: "skip" });
  const report = {
    projectorLayout,
    players: 80,
    teams: 80,
    firstArrivalAccepted: arrivals.filter((r) => r.accepted).length,
    commands: responseTimes.length,
    serverCommandLatencyMs: {
      p50: percentile(server.app.commandDurations, 0.5),
      p95: percentile(server.app.commandDurations, 0.95),
    },
    executionMs: {
      p50: percentile(server.app.executionDurations, 0.5),
      p95: percentile(server.app.executionDurations, 0.95),
    },
    under100msTarget: percentile(server.app.commandDurations, 0.95) < 100,
    localRoundTripMs: {
      p50: percentile(responseTimes, 0.5),
      p95: percentile(responseTimes, 0.95),
    },
    eventLoopDelayMs: {
      p95: delays.percentile(95) / 1e6,
      max: delays.max / 1e6,
    },
    rssMB: process.memoryUsage().rss / 1024 / 1024,
    projectionBytes: {
      median: percentile(projectionBytes, 0.5),
      max: Math.max(...projectionBytes),
    },
    rulesVersion: "cards-v2",
  };
  await mkdir("docs", { recursive: true });
  await writeFile("docs/capacity.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  delays.disable();
  for (const socket of sockets) socket.disconnect();
  await server.http.close();
  await rm(dataDir, { recursive: true, force: true });
}
