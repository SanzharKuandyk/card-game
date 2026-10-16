import { createHash, randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type {
  ActorIdentity,
  Content,
  DomainContext,
  Envelope,
  Receipt,
  Session,
} from "../shared/model.ts";
import {
  addMember,
  applyCommand,
  createSession,
  settleImmediate,
  tick,
} from "../domain/session.ts";
import { Repository } from "./persistence/repository.ts";
import { project } from "./projections/view.ts";
export function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
function copySession(session: Session): Session {
  const { content, map, ...state } = session;
  return { ...structuredClone(state), content, map };
}
export class Application {
  readonly sessions = new Map<string, Session>();
  readonly repository: Repository;
  readonly content: Content;
  private queue: Promise<unknown> = Promise.resolve();
  private connections = new Map<
    string,
    {
      sessionId: string;
      identity: ActorIdentity;
      control: boolean;
      clientId?: string;
    }
  >();
  private absent = new Map<string, number>();
  private hostAbsent = new Map<string, number>();
  private lastTick = performance.now();
  private lastSaved = performance.now();
  onPublish: (sessionId: string) => void = () => {};
  commandDurations: number[] = [];
  executionDurations: number[] = [];
  storageFailure: string | null = null;
  private sessionSeed: number | undefined;
  constructor(content: Content, path: string, sessionSeed?: number) {
    this.content = content;
    this.sessionSeed = sessionSeed;
    this.repository = new Repository(path);
  }
  async initialise(): Promise<void> {
    for (const s of await this.repository.load()) {
      if (s.rulesVersion !== "cards-v2")
        throw new Error("Unsupported saved rules version");
      if (s.status === "running") {
        s.status = "paused";
        s.notice = "Restored · paused";
        await this.repository.save(s);
      }
      this.sessions.set(s.id, s);
    }
  }
  serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => {});
    return next;
  }
  async create(): Promise<{ session: Session; token: string }> {
    return this.serialize(async () => {
      const id = randomUUID();
      const code = randomBytes(3).toString("hex").toUpperCase();
      const s = createSession(
        id,
        code,
        this.sessionSeed ?? randomBytes(4).readUInt32LE(),
        this.content,
      );
      await this.repository.save(s);
      const token = randomBytes(32).toString("hex");
      await this.repository.credential(hash(token), id, { role: "host" });
      this.sessions.set(id, s);
      return { session: s, token };
    });
  }
  async join(
    code: string,
    name: string,
  ): Promise<{ sessionId: string; memberId: string; token: string }> {
    return this.serialize(async () => {
      const old = [...this.sessions.values()].find(
        (s) => s.code === code.toUpperCase(),
      );
      if (!old) throw new Error("Code not found");
      const s = copySession(old);
      const id = randomUUID();
      addMember(s, id, name);
      s.revision++;
      const token = randomBytes(32).toString("hex");
      await this.repository.save(s);
      await this.repository.credential(hash(token), s.id, {
        role: "player",
        memberId: id,
      });
      this.sessions.set(s.id, s);
      this.onPublish(s.id);
      return { sessionId: s.id, memberId: id, token };
    });
  }
  async authenticate(
    token: string,
  ): Promise<{ sessionId: string; identity: ActorIdentity } | null> {
    if (!token) return null;
    const c = await this.repository.auth(hash(token));
    return c
      ? {
          sessionId: c.session_id,
          identity: JSON.parse(c.identity) as ActorIdentity,
        }
      : null;
  }
  connect(
    socketId: string,
    sessionId: string,
    identity: ActorIdentity,
    clientId?: string,
  ): boolean {
    const previous = [...this.connections.values()].find(
      (c) =>
        c.sessionId === sessionId &&
        c.identity.memberId === identity.memberId &&
        c.control,
    );
    const resumes =
      identity.role === "player" &&
      !!clientId &&
      previous?.clientId === clientId;
    const control =
      identity.role === "player"
        ? resumes ||
          ![...this.connections.values()].some(
            (c) =>
              c.sessionId === sessionId &&
              c.identity.memberId === identity.memberId &&
              c.control,
          )
        : identity.role === "host";
    if (resumes && previous) previous.control = false;
    this.connections.set(socketId, { sessionId, identity, control, clientId });
    if (identity.memberId) this.absent.delete(identity.memberId);
    if (identity.role === "host") this.hostAbsent.delete(sessionId);
    this.onPublish(sessionId);
    return control;
  }
  disconnect(socketId: string): void {
    const c = this.connections.get(socketId);
    this.connections.delete(socketId);
    if (c) {
      if (c.identity.memberId && !this.isOnline(c.identity.memberId))
        this.absent.set(c.identity.memberId, performance.now());
      if (
        c.identity.role === "host" &&
        ![...this.connections.values()].some(
          (x) => x.sessionId === c.sessionId && x.identity.role === "host",
        )
      )
        this.hostAbsent.set(c.sessionId, performance.now());
      this.onPublish(c.sessionId);
    }
  }
  isOnline(id: string): boolean {
    return [...this.connections.values()].some(
      (c) => c.identity.memberId === id,
    );
  }
  context(sessionId: string): DomainContext {
    const now = performance.now();
    const hostConnected = [...this.connections.values()].some(
      (c) => c.sessionId === sessionId && c.identity.role === "host",
    );
    return {
      presence: {
        online: [
          ...new Set(
            [...this.connections.values()]
              .filter((c) => c.sessionId === sessionId && c.identity.memberId)
              .map((c) => c.identity.memberId!),
          ),
        ],
        hostOnline: hostConnected,
        absentFor: Object.fromEntries(
          [...this.absent].map(([id, time]) => [id, now - time]),
        ),
      },
    };
  }
  view(sessionId: string, identity: ActorIdentity) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error("Session not found");
    return project(s, identity, this.context(sessionId));
  }
  async command(
    socketId: string,
    envelope: Envelope,
  ): Promise<Receipt & { preview?: unknown }> {
    const receivedAt = performance.now();
    return this.serialize(async () => {
      const start = performance.now();
      const connection = this.connections.get(socketId);
      if (!connection || connection.sessionId !== envelope.sessionId)
        throw new Error("Not authenticated");
      const identity = connection.identity;
      const old = this.sessions.get(envelope.sessionId);
      if (!old) throw new Error("Session not found");
      const fingerprint = hash(JSON.stringify({ identity, envelope }));
      const stored = await this.repository.receipt(old.id, envelope.requestId);
      if (stored) {
        if (stored.fingerprint !== fingerprint)
          throw new Error("Request ID was used for a different action");
        return JSON.parse(stored.receipt) as Receipt;
      }
      if (
        identity.role === "player" &&
        !connection.control &&
        envelope.command.kind !== "takeover"
      )
        throw new Error("This tab is read-only. Take control to play.");
      const s = structuredClone(old);
      let accepted = true;
      let message: string;
      let preview: unknown;
      try {
        const outcome = applyCommand(
          s,
          identity,
          envelope,
          this.context(old.id),
        );
        message = outcome.message;
        preview = outcome.preview;
        settleImmediate(s);
      } catch (e) {
        accepted = false;
        message = e instanceof Error ? e.message : "Action rejected";
      }
      if (envelope.command.kind === "preview") {
        return {
          requestId: envelope.requestId,
          accepted,
          message,
          revision: old.revision,
          preview,
        };
      }
      const saved = accepted ? s : copySession(old);
      saved.revision++;
      const receipt = {
        requestId: envelope.requestId,
        accepted,
        message,
        revision: saved.revision,
      };
      try {
        await this.repository.save(
          saved,
          envelope.requestId,
          fingerprint,
          receipt,
        );
      } catch (e) {
        this.storageFailure = e instanceof Error ? e.message : "Storage failed";
        old.status = "paused";
        old.notice = "Storage error · paused";
        this.onPublish(old.id);
        throw new Error("Storage error. Action was not saved.", { cause: e });
      }
      this.sessions.set(saved.id, saved);
      this.storageFailure = null;
      if (
        accepted &&
        envelope.command.kind === "takeover" &&
        identity.role === "player"
      ) {
        for (const c of this.connections.values())
          if (c.identity.memberId === identity.memberId) c.control = false;
        connection.control = true;
      }
      this.onPublish(saved.id);
      this.commandDurations.push(performance.now() - receivedAt);
      this.executionDurations.push(performance.now() - start);
      if (this.commandDurations.length > 10000)
        this.commandDurations.splice(0, 5000);
      if (this.executionDurations.length > 10000)
        this.executionDurations.splice(0, 5000);
      return receipt;
    });
  }
  controller(socketId: string): boolean {
    return this.connections.get(socketId)?.control ?? false;
  }
  async advance(elapsed?: number): Promise<void> {
    await this.serialize(async () => {
      const now = performance.now();
      const dt = elapsed ?? Math.min(1000, now - this.lastTick);
      this.lastTick = now;
      for (const [id, old] of this.sessions) {
        if (old.status !== "running") continue;
        const context = this.context(id);
        const s = copySession(old);
        const absent = this.hostAbsent.get(id);
        if (
          !context.presence.hostOnline &&
          absent !== undefined &&
          now - absent >= 10000
        ) {
          s.status = "paused";
          s.notice = "Host disconnected · paused";
        } else if (context.presence.hostOnline) tick(s, dt, context);
        if (JSON.stringify(s) !== JSON.stringify(old)) {
          s.revision++;
          if (
            now - this.lastSaved >= 1000 ||
            s.status !== old.status ||
            JSON.stringify(
              s.bosses.map((b) => [
                b.quiz.stage,
                b.quiz.phaseRevision,
                !!b.combat,
              ]),
            ) !==
              JSON.stringify(
                old.bosses.map((b) => [
                  b.quiz.stage,
                  b.quiz.phaseRevision,
                  !!b.combat,
                ]),
              ) ||
            JSON.stringify(
              Object.values(s.crews).map((c) => [
                c.progress.phase,
                c.progress.combat?.phase,
              ]),
            ) !==
              JSON.stringify(
                Object.values(old.crews).map((c) => [
                  c.progress.phase,
                  c.progress.combat?.phase,
                ]),
              ) ||
            s.bosses.filter((b) => b.settled).length !==
              old.bosses.filter((b) => b.settled).length
          ) {
            try {
              await this.repository.save(s);
            } catch (e) {
              this.storageFailure =
                e instanceof Error ? e.message : "Storage error";
              old.status = "paused";
              old.notice = "Storage error · paused";
              this.onPublish(id);
              continue;
            }
          }
          this.sessions.set(id, s);
          this.onPublish(id);
        }
      }
      if (now - this.lastSaved >= 1000) this.lastSaved = now;
    });
  }
  async close(): Promise<void> {
    await this.queue;
    for (const s of this.sessions.values()) await this.repository.save(s);
    await this.repository.close();
  }
}
