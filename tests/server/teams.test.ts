import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io } from "socket.io-client";
import { createServer } from "../../src/server/main.ts";
import type { Command, Envelope } from "../../src/shared/model.ts";

test("host removal ejects every tab, revokes reconnect, and queued moves survive restart", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "cards-teams-"));
  const server = await createServer({ dataDir, automaticTicks: false });
  await server.http.listen({ port: 0, host: "127.0.0.1" });
  const address = server.http.server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const { session } = await server.app.create();
  const a = await server.app.join(session.code, "Alex");
  const b = await server.app.join(session.code, "Sam");
  const c = await server.app.join(session.code, "Lee");
  server.app.connect("host", session.id, { role: "host" });
  server.app.connect("a", session.id, { role: "player", memberId: a.memberId });
  server.app.connect("b", session.id, { role: "player", memberId: b.memberId });
  const connect = async () => {
    const socket = io(base, {
      auth: { role: "player", sessionId: session.id },
      extraHeaders: { cookie: `cg-player=${c.token}` },
      transports: ["websocket"],
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  };
  const tabs = [await connect(), await connect()];
  const envelope = (command: Command): Envelope => ({
    requestId: crypto.randomUUID(),
    sessionId: session.id,
    encounterId: null,
    command,
  });
  const send = async (id: string, command: Command) => {
    const r = await server.app.command(id, envelope(command));
    assert(r.accepted, r.message);
    return r;
  };
  const removal = envelope({
    kind: "host",
    action: "remove",
    memberId: c.memberId,
  });
  let deck: unknown;
  try {
    await send("a", { kind: "team", character: "guardian", name: "Red" });
    await send("b", { kind: "team", character: "rogue", name: "Blue" });
    await send(tabs[0]!.id!, {
      kind: "team",
      character: "alchemist",
      crewId: "team-1",
    });
    await send("host", { kind: "host", action: "start" });
    await send("a", { kind: "travel", nodeId: "r1-0" });
    await send(tabs[0]!.id!, { kind: "travel", nodeId: "r1-0" });
    await send("a", { kind: "team:change", crewId: "team-2" });
    deck = structuredClone(
      server.app.sessions.get(session.id)!.members[a.memberId]!.hero,
    );
    const kicked = tabs.map(
      (socket) =>
        new Promise<void>((resolve) => socket.once("removed", resolve)),
    );
    const receipt = await server.app.command("host", removal);
    assert(receipt.accepted);
    await Promise.all(kicked);
    assert.equal(server.app.isOnline(c.memberId), false);
    assert.equal(await server.app.authenticate(c.token), null);
    assert.deepEqual(await server.app.command("host", removal), receipt);
    const rejected = await server.http.inject({
      url: `/api/session/${session.id}`,
      headers: { cookie: `cg-player=${c.token}` },
    });
    assert.equal(rejected.statusCode, 401);
    const view = server.app.view(session.id, { role: "projector" });
    assert(
      !view.crews
        .flatMap((c) => c.board?.actors ?? [])
        .some((actor) => actor.memberId === c.memberId),
    );
  } finally {
    tabs.forEach((socket) => socket.disconnect());
    await server.http.close();
  }
  const restored = await createServer({ dataDir, automaticTicks: false });
  try {
    const s = restored.app.sessions.get(session.id)!;
    assert.equal(s.status, "paused");
    assert.deepEqual(s.members[a.memberId]!.pendingTeam, { crewId: "team-2" });
    assert.equal(await restored.app.authenticate(c.token), null);
    assert.throws(
      () =>
        restored.app.connect("removed", s.id, {
          role: "player",
          memberId: c.memberId,
        }),
      /removed/,
    );
    restored.app.connect("host", s.id, { role: "host" });
    const r = await restored.app.command(
      "host",
      envelope({ kind: "host", action: "skip" }),
    );
    assert(r.accepted, r.message);
    assert.equal(
      restored.app.sessions.get(s.id)!.members[a.memberId]!.crewId,
      "team-2",
    );
    assert.deepEqual(
      restored.app.sessions.get(s.id)!.members[a.memberId]!.hero,
      deck,
    );
  } finally {
    await restored.http.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
