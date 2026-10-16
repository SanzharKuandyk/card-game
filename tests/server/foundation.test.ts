import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io } from "socket.io-client";
import { createServer } from "../../src/server/main.ts";
import type { Envelope, Receipt } from "../../src/shared/model.ts";
test("real sockets: early start, duplicate receipt, ownership, reconnect and restart", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "cards-foundation-"));
  const server = await createServer({
    dataDir,
    automaticTicks: false,
  });
  await server.http.listen({ port: 0, host: "127.0.0.1" });
  const address = server.http.server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const create = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const session = (await create.json()) as { id: string; code: string };
  const hostCookie = create.headers.get("set-cookie")!.split(";")[0]!;
  const playerResponse = await fetch(`${base}/api/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: session.code, name: "Alex" }),
  });
  const player = (await playerResponse.json()) as { memberId: string };
  const playerCookie = playerResponse.headers.get("set-cookie")!.split(";")[0]!;
  await fetch(`${base}/api/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: session.code, name: "Unassigned" }),
  });
  const connect = async (role: string, cookie: string) => {
    const socket = io(base, {
      auth: { sessionId: session.id, role },
      extraHeaders: { cookie },
      transports: ["websocket"],
    });
    await new Promise<void>((r, j) => {
      socket.once("connect", () => r());
      socket.once("connect_error", j);
    });
    return socket;
  };
  const host = await connect("host", hostCookie);
  let socket = await connect("player", playerCookie);
  const command = (sock: typeof socket, envelope: Envelope) =>
    sock.emitWithAck("command", envelope) as Promise<Receipt>;
  const env = (requestId: string, command: Envelope["command"]): Envelope => ({
    requestId,
    sessionId: session.id,
    encounterId: null,
    command,
  });
  try {
    const team = env("team", {
      kind: "team",
      name: "Blue",
      character: "guardian",
    });
    assert.equal((await command(socket, team)).accepted, true);
    const revision = server.app.sessions.get(session.id)!.revision;
    assert.deepEqual(await command(socket, team), await command(socket, team));
    assert.equal(server.app.sessions.get(session.id)!.revision, revision);
    assert.equal(
      (
        await command(
          socket,
          env("wrong-host", { kind: "host", action: "start" }),
        )
      ).accepted,
      false,
    );
    assert.equal(
      (await command(host, env("start", { kind: "host", action: "start" })))
        .accepted,
      true,
    );
    assert.equal(
      server.app.sessions.get(session.id)!.members[
        Object.keys(server.app.sessions.get(session.id)!.members).find(
          (id) => id !== player.memberId,
        )!
      ]!.crewId,
      null,
    );
    assert.equal(
      (await command(socket, env("travel", { kind: "travel", nodeId: "r1-0" })))
        .accepted,
      true,
    );
    const combat = server.app.sessions.get(session.id)!.crews["team-1"]!
      .progress.combat!;
    assert.equal(combat.actors[player.memberId]!.hand.length, 5);
    socket.disconnect();
    socket = await connect("player", playerCookie);
    assert.equal(
      server.app.view(session.id, { role: "player", memberId: player.memberId })
        .combat!.id,
      combat.id,
    );
  } finally {
    host.disconnect();
    socket.disconnect();
    await server.http.close();
  }
  const restored = await createServer({
    dataDir,
    automaticTicks: false,
  });
  try {
    const s = restored.app.sessions.get(session.id)!;
    assert.equal(s.status, "paused");
    assert.equal(
      s.crews["team-1"]!.progress.combat!.actors[player.memberId]!.hand.length,
      5,
    );
    assert(await restored.app.authenticate(playerCookie.split("=")[1]!));
    const hosting = await restored.http.inject({
      method: "GET",
      url: "/api/hosting",
      headers: { cookie: hostCookie },
    });
    assert.equal(hosting.json().canHost, true);
    const fresh = await restored.http.inject({
      method: "POST",
      url: "/api/session",
      headers: { cookie: hostCookie },
      payload: {},
    });
    assert.equal(fresh.statusCode, 200);
    assert.notEqual(fresh.json().id, session.id);
    assert.equal(restored.app.sessions.get(fresh.json().id)!.status, "lobby");
    assert.equal(
      Object.keys(restored.app.sessions.get(fresh.json().id)!.members).length,
      0,
    );
    assert.equal(restored.app.sessions.get(session.id)!.status, "paused");
    for (const cookie of ["", playerCookie]) {
      const created = await restored.http.inject({
        method: "POST",
        url: "/api/session",
        headers: { cookie },
        payload: {},
      });
      assert.equal(created.statusCode, 200);
      assert.notEqual(created.json().id, session.id);
      const denied = await restored.http.inject({
        method: "POST",
        url: "/api/recover",
        headers: { cookie },
        payload: { sessionId: session.id },
      });
      assert.equal(denied.statusCode, 401);
    }
  } finally {
    await restored.http.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
