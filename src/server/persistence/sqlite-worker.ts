import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ActorIdentity, Receipt, Session } from "../../shared/model.ts";
const config = workerData as { path: string };
mkdirSync(dirname(config.path), { recursive: true });
const db = new DatabaseSync(config.path);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, snapshot TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS session_metadata(session_id TEXT PRIMARY KEY,content TEXT NOT NULL,map TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credentials(hash TEXT PRIMARY KEY,session_id TEXT NOT NULL,identity TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS receipts(session_id TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,receipt TEXT NOT NULL,PRIMARY KEY(session_id,request_id));
CREATE TABLE IF NOT EXISTS results(session_id TEXT NOT NULL,source TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(session_id,source));
CREATE TABLE IF NOT EXISTS combat_events(session_id TEXT NOT NULL,encounter_id TEXT NOT NULL,event_id INTEGER NOT NULL,event_json TEXT NOT NULL,PRIMARY KEY(session_id,encounter_id,event_id));`);
const archived = new Map<string, number>();
type Request = {
  id: number;
  op: "load" | "save" | "receipt" | "credential" | "auth" | "close";
  session?: Omit<Session, "content" | "map">;
  metadata?: Pick<Session, "content" | "map">;
  requestId?: string;
  fingerprint?: string;
  receipt?: Receipt;
  hash?: string;
  sessionId?: string;
  identity?: ActorIdentity;
};
parentPort!.on("message", (m: Request) => {
  try {
    let result: unknown = null;
    if (m.op === "load")
      result = db
        .prepare("SELECT snapshot FROM sessions")
        .all()
        .map((r) => {
          const s = JSON.parse(r.snapshot as string);
          if (!s.content) {
            const metadata = db
              .prepare(
                "SELECT content,map FROM session_metadata WHERE session_id=?",
              )
              .get(s.id);
            if (!metadata) throw new Error("Saved session content is missing");
            s.content = JSON.parse(metadata.content as string);
            s.map = JSON.parse(metadata.map as string);
          }
          return s;
        });
    else if (m.op === "save") {
      db.exec("BEGIN IMMEDIATE");
      try {
        const s = m.session!;
        if (m.metadata)
          db.prepare(
            "INSERT OR IGNORE INTO session_metadata VALUES(?,?,?)",
          ).run(
            s.id,
            JSON.stringify(m.metadata.content),
            JSON.stringify(m.metadata.map),
          );
        db.prepare(
          "INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot",
        ).run(s.id, s.code, JSON.stringify(s));
        if (m.receipt)
          db.prepare("INSERT INTO receipts VALUES(?,?,?,?)").run(
            s.id,
            m.requestId!,
            m.fingerprint!,
            JSON.stringify(m.receipt),
          );
        for (const b of s.bosses.filter((b) => b.settled))
          db.prepare("INSERT OR IGNORE INTO results VALUES(?,?,?)").run(
            s.id,
            `boss:${b.gate}`,
            JSON.stringify({ result: b.result, awards: b.awards }),
          );
        const battles = new Map(
          [
            ...s.bosses.flatMap((b) =>
              Object.values(b.suspended).map((p) => p.combat),
            ),
            ...Object.values(s.crews).map((c) => c.progress.combat),
            ...s.bosses.map((b) => b.combat),
          ]
            .filter((b) => b !== null)
            .map((b) => [b.id, b]),
        );
        const nextArchived: [string, number][] = [];
        const insertEvent = db.prepare(
          "INSERT OR IGNORE INTO combat_events VALUES(?,?,?,?)",
        );
        for (const b of battles.values()) {
          const key = `${s.id}:${b.id}`;
          const latest = archived.get(key) ?? 0;
          for (const event of b.log)
            if (event.id > latest)
              insertEvent.run(s.id, b.id, event.id, JSON.stringify(event));
          nextArchived.push([key, Math.max(latest, b.eventSequence)]);
        }
        db.exec("COMMIT");
        for (const [key, latest] of nextArchived) archived.set(key, latest);
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    } else if (m.op === "receipt")
      result =
        db
          .prepare(
            "SELECT fingerprint,receipt FROM receipts WHERE session_id=? AND request_id=?",
          )
          .get(m.sessionId!, m.requestId!) ?? null;
    else if (m.op === "credential")
      db.prepare("INSERT OR REPLACE INTO credentials VALUES(?,?,?)").run(
        m.hash!,
        m.sessionId!,
        JSON.stringify(m.identity!),
      );
    else if (m.op === "auth")
      result =
        db
          .prepare("SELECT session_id,identity FROM credentials WHERE hash=?")
          .get(m.hash!) ?? null;
    else if (m.op === "close") {
      db.close();
      parentPort!.postMessage({ id: m.id, result: true });
      return;
    }
    parentPort!.postMessage({ id: m.id, result });
  } catch (e) {
    parentPort!.postMessage({
      id: m.id,
      error: e instanceof Error ? e.message : "Storage error",
    });
  }
});
