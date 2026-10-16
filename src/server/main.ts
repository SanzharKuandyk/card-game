import Fastify from "fastify";
import type { FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import middie from "@fastify/middie";
import { Server } from "socket.io";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { envelopeSchema, joinSchema } from "../shared/schemas.ts";
import type { ActorIdentity } from "../shared/model.ts";
import { Application, hash } from "./application.ts";
import { loadContent } from "./content/load.ts";
export async function createServer(
  options: {
    dataDir?: string;
    dev?: boolean;
    automaticTicks?: boolean;
    sessionSeed?: number;
  } = {},
) {
  const content = await loadContent();
  const app = new Application(
    content,
    resolve(
      options.dataDir ?? process.env.DATA_DIR ?? "data",
      "cards-v2.sqlite",
    ),
    options.sessionSeed,
  );
  await app.initialise();
  const http = Fastify({ logger: false, bodyLimit: 12000 });
  await http.register(cookie);
  http.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) {
          reply.code(403).send({ message: "Origin rejected" });
          return;
        }
      } catch {
        reply.code(403).send({ message: "Origin rejected" });
      }
    }
  });
  const io = new Server(http.server, {
    maxHttpBufferSize: 16000,
    pingInterval: 8000,
    pingTimeout: 7000,
    allowRequest: (req, cb) => {
      try {
        const origin = req.headers.origin;
        cb(null, !origin || new URL(origin).host === req.headers.host);
      } catch {
        cb(null, false);
      }
    },
  });
  const tokenCookie = (req: { headers: { cookie?: string } }, name: string) =>
    http.parseCookie(req.headers.cookie ?? "")[name] ?? "";
  const authenticate = async (
    req: { headers: { cookie?: string } },
    role: string,
    projector?: string,
  ) =>
    app.authenticate(
      role === "projector"
        ? (projector ?? "")
        : tokenCookie(req, role === "host" ? "cg-host" : "cg-player"),
    );
  const setCookie = (
    reply: FastifyReply,
    name: string,
    token: string,
    origin?: string,
  ) =>
    reply.setCookie(name, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: origin?.startsWith("https://") ?? false,
      maxAge: 60 * 60 * (name === "cg-host" ? 24 * 30 : 12),
    });
  http.get("/api/health", async () => ({
    ok: !app.storageFailure,
    rules: "cards-v2",
  }));
  http.post("/api/session", async (req, reply) => {
    const created = await app.create();
    setCookie(reply, "cg-host", created.token, req.headers.origin);
    return { id: created.session.id, code: created.session.code };
  });
  http.get("/api/hosting", async (req) => {
    const host = await authenticate(req, "host");
    const session =
      host?.identity.role === "host"
        ? app.sessions.get(host.sessionId)
        : undefined;
    return {
      canHost: !!session,
      session: session
        ? { id: session.id, code: session.code, status: session.status }
        : null,
    };
  });
  http.post("/api/recover", async (req, reply) => {
    const body = req.body as { sessionId?: string };
    const host = await authenticate(req, "host");
    if (
      !(host?.identity.role === "host" && host.sessionId === body?.sessionId) ||
      !app.sessions.has(body.sessionId ?? "")
    )
      return reply.code(401).send({ message: "Open from your host browser" });
    const token = randomBytes(32).toString("hex");
    await app.repository.credential(hash(token), body.sessionId!, {
      role: "host",
    });
    setCookie(reply, "cg-host", token, req.headers.origin);
    return { id: body.sessionId };
  });
  http.get("/api/sessions", async () => ({
    sessions: [...app.sessions.values()]
      .filter((s) => s.status !== "finished")
      .map((s) => ({ id: s.id, code: s.code, status: s.status })),
  }));
  http.post("/api/join", async (req, reply) => {
    try {
      const body = joinSchema.parse(req.body);
      const joined = await app.join(body.code, body.name);
      setCookie(reply, "cg-player", joined.token, req.headers.origin);
      return { sessionId: joined.sessionId, memberId: joined.memberId };
    } catch (e) {
      return reply
        .code(400)
        .send({ message: e instanceof Error ? e.message : "Cannot join" });
    }
  });
  http.get<{
    Params: { id: string };
    Querystring: { role?: string; view?: string };
  }>("/api/session/:id", async (req, reply) => {
    const auth = await authenticate(
      req,
      req.query.role ?? "player",
      req.query.view,
    );
    if (!auth || auth.sessionId !== req.params.id)
      return reply.code(401).send({ message: "Join again" });
    return app.view(auth.sessionId, auth.identity);
  });
  http.post<{ Params: { id: string } }>(
    "/api/session/:id/projector",
    async (req, reply) => {
      const auth = await authenticate(req, "host");
      if (
        !auth ||
        auth.sessionId !== req.params.id ||
        auth.identity.role !== "host"
      )
        return reply.code(403).send({ message: "Host only" });
      const token = randomBytes(24).toString("hex");
      await app.repository.credential(hash(token), auth.sessionId, {
        role: "projector",
      });
      return { token };
    },
  );
  http.get("/api/catalogue", async () => ({
    cards: content.cards,
  }));
  http.setErrorHandler((error, _, reply) => {
    reply.code(400).send({
      message: error instanceof Error ? error.message : "Request failed",
    });
  });
  const clients = new Map<
    string,
    {
      sessionId: string;
      identity: ActorIdentity;
      lastProjector: number;
    }
  >();
  const dirty = new Set<string>();
  app.onPublish = (id) => dirty.add(id);
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as {
        sessionId?: string;
        role?: string;
        projector?: string;

        clientId?: string;
      };
      const authenticated = await authenticate(
        socket.request,
        auth.role ?? "player",
        auth.projector,
      );
      if (
        !authenticated ||
        authenticated.sessionId !== auth.sessionId ||
        (auth.role && authenticated.identity.role !== auth.role)
      )
        throw new Error("Join again");
      socket.data.identity = authenticated;
      socket.data.clientId =
        typeof auth.clientId === "string" &&
        /^[a-f0-9]{32}$/.test(auth.clientId)
          ? auth.clientId
          : undefined;
      next();
    } catch (e) {
      next(e instanceof Error ? e : new Error("Not authenticated"));
    }
  });
  io.on("connection", (socket) => {
    const auth = socket.data.identity as {
      sessionId: string;
      identity: ActorIdentity;
    };
    app.connect(
      socket.id,
      auth.sessionId,
      auth.identity,
      socket.data.clientId as string | undefined,
    );
    clients.set(socket.id, { ...auth, lastProjector: 0 });
    socket.emit("snapshot", {
      ...app.view(auth.sessionId, auth.identity),
      controlling: app.controller(socket.id),
    });
    let windowStart = Date.now(),
      count = 0;
    socket.on(
      "command",
      async (payload: unknown, ack: (value: unknown) => void) => {
        if (typeof ack !== "function") return;
        try {
          if (Date.now() - windowStart > 1000) {
            windowStart = Date.now();
            count = 0;
          }
          if (++count > 20) throw new Error("Too many actions. Try again.");
          const envelope = envelopeSchema.parse(payload);
          ack(await app.command(socket.id, envelope));
          if (envelope.command.kind !== "preview")
            socket.emit("snapshot", {
              ...app.view(auth.sessionId, auth.identity),
              controlling: app.controller(socket.id),
            });
        } catch (e) {
          ack({
            accepted: false,
            message: e instanceof Error ? e.message : "Action rejected",
          });
        }
      },
    );
    socket.on("resync", () =>
      socket.emit("snapshot", {
        ...app.view(auth.sessionId, auth.identity),
        controlling: app.controller(socket.id),
      }),
    );
    socket.on("disconnect", () => {
      clients.delete(socket.id);
      app.disconnect(socket.id);
    });
  });
  const publishTimer = setInterval(() => {
    const deferred = new Set<string>();
    for (const [socketId, c] of clients) {
      if (!dirty.has(c.sessionId)) continue;
      if (
        c.identity.role === "projector" &&
        Date.now() - c.lastProjector < 500
      ) {
        deferred.add(c.sessionId);
        continue;
      }
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        const view = app.view(c.sessionId, c.identity);
        view.cards = [];
        socket.emit("snapshot", {
          ...view,
          controlling: app.controller(socketId),
        });
        c.lastProjector = Date.now();
      }
    }
    dirty.clear();
    for (const id of deferred) dirty.add(id);
  }, 200);
  const tickTimer =
    options.automaticTicks === false
      ? null
      : setInterval(() => {
          void app.advance().catch(() => {});
        }, 250);
  if (options.dev) {
    await http.register(middie);
    const { createServer: makeVite } = await import("vite");
    const vite = await makeVite({
      server: { middlewareMode: true },
      appType: "spa",
    });
    http.use(vite.middlewares);
    http.addHook("onClose", () => vite.close());
  } else if (existsSync(resolve("dist/index.html"))) {
    await http.register(staticFiles, { root: resolve("dist") });
    http.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/"))
        return reply.code(404).send({ message: "Not found" });
      return reply.sendFile("index.html");
    });
  }
  http.addHook("preClose", async () => {
    clearInterval(publishTimer);
    if (tickTimer) clearInterval(tickTimer);
    io.disconnectSockets();
    await new Promise<void>((r) => io.close(() => r()));
  });
  http.addHook("onClose", async () => {
    await app.close();
  });
  return { http, io, app };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const server = await createServer({ dev: process.argv.includes("--dev") });
  const port = Number(process.env.PORT ?? 47833);
  await server.http.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
  console.log(`http://127.0.0.1:${port}/#host`);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.http.close();
  };
  process.on("SIGINT", () => void close());
  process.on("SIGTERM", () => void close());
}
