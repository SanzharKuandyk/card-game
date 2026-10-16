import { Worker } from "node:worker_threads";
import type { ActorIdentity, Receipt, Session } from "../../shared/model.ts";
export class Repository {
  private savedMetadata = new Set<string>();
  private worker: Worker;
  private serial = 0;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  constructor(path: string) {
    this.worker = new Worker(new URL("./sqlite-worker.ts", import.meta.url), {
      workerData: { path },
    });
    this.worker.on(
      "message",
      (m: { id: number; result: unknown; error?: string }) => {
        const p = this.pending.get(m.id);
        if (p) {
          this.pending.delete(m.id);
          if (m.error) p.reject(new Error(m.error));
          else p.resolve(m.result);
        }
      },
    );
    this.worker.on("error", (e) => {
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
    });
  }
  call<T>(op: string, data: object = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
      this.worker.postMessage({ id, op, ...data });
    });
  }
  load(): Promise<Session[]> {
    return this.call("load");
  }
  async save(
    session: Session,
    requestId?: string,
    fingerprint?: string,
    receipt?: Receipt,
  ): Promise<void> {
    // Frozen content and the shared map are written once, in the same initial
    // transaction. Subsequent commands only send mutable session state.
    const { content, map, ...state } = session;
    await this.call("save", {
      session: state,
      metadata: this.savedMetadata.has(session.id)
        ? undefined
        : { content, map },
      requestId,
      fingerprint,
      receipt,
    });
    this.savedMetadata.add(session.id);
  }
  receipt(
    sessionId: string,
    requestId: string,
  ): Promise<{ fingerprint: string; receipt: string } | null> {
    return this.call("receipt", { sessionId, requestId });
  }
  credential(
    hash: string,
    sessionId: string,
    identity: ActorIdentity,
  ): Promise<void> {
    return this.call("credential", { hash, sessionId, identity });
  }
  auth(hash: string): Promise<{ session_id: string; identity: string } | null> {
    return this.call("auth", { hash });
  }
  async close(): Promise<void> {
    await this.call("close");
    await this.worker.terminate();
  }
}
