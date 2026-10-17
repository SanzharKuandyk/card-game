import { defineStore } from "pinia";
import { computed, shallowRef, ref } from "vue";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { requestId } from "../connection.ts";
import type {
  Command,
  Envelope,
  Receipt,
  SessionView,
} from "../../shared/model.ts";
type Snapshot = SessionView & { controlling: boolean };
export const useGame = defineStore("game", () => {
  const view = shallowRef<Snapshot | null>(null);
  const connected = ref(false);
  const busy = ref(false);
  const actionError = ref("");
  const connectionError = ref("");
  const error = computed({
    get: () => actionError.value || connectionError.value,
    set: (value: string) => {
      actionError.value = value;
    },
  });
  const message = ref("");
  let socket: Socket | null = null;
  const clientId = requestId();
  let lifecycleAttached = false;
  let hiddenAt = 0;
  const needsJoin = ref(false);
  let wakeTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
  function awaitSnapshot() {
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      if (!socket || needsJoin.value || document.visibilityState === "hidden")
        return;
      connected.value = false;
      socket.disconnect().connect();
      awaitSnapshot();
    }, 8000);
  }
  function recover() {
    if (!socket || needsJoin.value || document.visibilityState === "hidden")
      return;
    // Safari can deliver pageshow and visibilitychange together. One wake
    // must not cancel the connection started by the other event.
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => {
      if (!socket || needsJoin.value || document.visibilityState === "hidden")
        return;
      clearTimeout(retryTimer);
      connected.value = false;
      if (!socket.connected || hiddenAt) socket.disconnect().connect();
      else socket.emit("resync");
      hiddenAt = 0;
      awaitSnapshot();
    }, 100);
  }
  function visibility() {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else recover();
  }
  function leave() {
    clearTimeout(wakeTimer);
    clearTimeout(snapshotTimer);
    socket?.disconnect();
    connected.value = false;
    hiddenAt = Date.now();
  }
  function flushPending() {
    const pending = sessionStorage.getItem(
      `pending:${view.value?.id ?? lastKey.split(":")[0]}:${lastKey.split(":")[1]}`,
    );
    busy.value = !!pending;
    if (pending && socket?.connected) {
      try {
        void send(JSON.parse(pending) as Envelope);
      } catch {
        actionError.value = "Saved action could not be read. Reload this page.";
      }
    }
  }
  let lastKey = "";
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const inFlight = new Map<
    string,
    Promise<Receipt & { preview?: { message: string } }>
  >();
  function connect(
    id: string,
    role: "host" | "player" | "projector",
    projector?: string,
  ) {
    const key = `${id}:${role}:${projector ?? ""}`;
    if (key === lastKey && socket) return;
    socket?.removeAllListeners();
    socket?.disconnect();
    clearTimeout(retryTimer);
    clearTimeout(wakeTimer);
    clearTimeout(snapshotTimer);
    lastKey = key;
    actionError.value = "";
    connectionError.value = "";
    view.value = null;
    connected.value = false;
    needsJoin.value = false;
    if (!lifecycleAttached) {
      document.addEventListener("visibilitychange", visibility);
      window.addEventListener("online", recover);
      window.addEventListener("pageshow", recover);
      window.addEventListener("pagehide", leave);
      lifecycleAttached = true;
    }
    socket = io({
      auth: { sessionId: id, role, projector, clientId },
      transports: ["polling", "websocket"],
      tryAllTransports: true,
      timeout: 8000,
      reconnectionDelay: 250,
      reconnectionDelayMax: 1500,
    });
    socket.on("connect", () => {
      // An open transport is not yet a restored hand. Enable controls only
      // after receiving the authoritative snapshot.
      connected.value = false;
      connectionError.value = "";
      needsJoin.value = false;
      awaitSnapshot();
      socket?.emit("resync");
    });
    socket.on("snapshot", (incoming: Snapshot) => {
      if (!incoming.cards.length && view.value)
        incoming.cards = view.value.cards;
      view.value = incoming;
      clearTimeout(snapshotTimer);
      const restored = !connected.value;
      connected.value = true;
      connectionError.value = "";
      if (restored) flushPending();
    });
    socket.on("disconnect", () => {
      connected.value = false;
      if (document.visibilityState !== "hidden") awaitSnapshot();
    });
    socket.on("connect_error", (e: Error) => {
      needsJoin.value = /Join again|Not authenticated|Session not found/.test(
        e.message,
      );
      connectionError.value = needsJoin.value
        ? "This game needs your player sign-in again."
        : "Reconnecting…";
      connected.value = false;
      if (needsJoin.value) clearTimeout(snapshotTimer);
      // Namespace/middleware errors do not always trigger Socket.IO's own
      // retry. Keep a bounded retry for transient failures, not bad identity.
      else awaitSnapshot();
    });
  }
  function send(
    envelope: Envelope,
  ): Promise<Receipt & { preview?: { message: string } }> {
    const existing = inFlight.get(envelope.requestId);
    if (existing) return existing;
    const operation = deliver(envelope).finally(() => {
      inFlight.delete(envelope.requestId);
      if (
        envelope.command.kind !== "preview" &&
        sessionStorage.getItem(
          `pending:${envelope.sessionId}:${view.value?.role}`,
        ) &&
        socket?.connected
      ) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(flushPending, 250);
      }
    });
    inFlight.set(envelope.requestId, operation);
    return operation;
  }
  async function deliver(
    envelope: Envelope,
  ): Promise<Receipt & { preview?: { message: string } }> {
    const activeSocket = socket;
    const activeKey = lastKey;
    const durable = envelope.command.kind !== "preview";
    const pendingKey = `pending:${envelope.sessionId}:${view.value?.role ?? activeKey.split(":")[1]}`;
    if (!activeSocket || !connected.value)
      return {
        requestId: envelope.requestId,
        accepted: false,
        message: "Reconnecting",
        revision: 0,
      };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = (await activeSocket
          .timeout(3500)
          .emitWithAck("command", envelope)) as Receipt & {
          preview?: { message: string };
        };
        if (durable) {
          sessionStorage.removeItem(pendingKey);
          if (lastKey !== activeKey) return result;
          clearTimeout(retryTimer);
          busy.value = false;
          if (result.accepted) {
            message.value = result.message;
            actionError.value = "";
            connectionError.value = "";
          } else actionError.value = result.message;
        }
        return result;
      } catch {
        if (lastKey !== activeKey) break;
        connectionError.value =
          "Connection interrupted. Checking saved action.";
        activeSocket.emit("resync");
        if (!durable || !activeSocket.connected) break;
      }
    }
    if (
      durable &&
      lastKey === activeKey &&
      sessionStorage.getItem(pendingKey)
    ) {
      busy.value = true;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (activeSocket.connected && lastKey === activeKey)
          void send(envelope);
      }, 3000);
    }
    return {
      requestId: envelope.requestId,
      accepted: false,
      message: error.value,
      revision: view.value?.revision ?? 0,
    };
  }
  async function command(command: Command) {
    if (!view.value) return { accepted: false, message: "Connecting" };
    if (!connected.value)
      return { accepted: false, message: "Reconnecting… Your hand is saved." };
    const pendingKey = `pending:${view.value.id}:${view.value.role}`;
    if (command.kind !== "preview" && sessionStorage.getItem(pendingKey))
      return { accepted: false, message: "Checking your previous action" };
    const envelope: Envelope = {
      requestId: requestId(),
      sessionId: view.value.id,
      encounterId: view.value.combat?.id ?? null,
      command,
    };
    if (command.kind !== "preview")
      sessionStorage.setItem(
        `pending:${view.value.id}:${view.value.role}`,
        JSON.stringify(envelope),
      );
    if (command.kind !== "preview") busy.value = true;
    try {
      return await send(envelope);
    } finally {
      if (command.kind !== "preview")
        busy.value = !!sessionStorage.getItem(pendingKey);
    }
  }
  function close() {
    clearTimeout(retryTimer);
    clearTimeout(wakeTimer);
    clearTimeout(snapshotTimer);
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
    lastKey = "";
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("online", recover);
    window.removeEventListener("pageshow", recover);
    window.removeEventListener("pagehide", leave);
    lifecycleAttached = false;
  }
  return {
    view,
    connected,
    busy,
    error,
    message,
    connect,
    command,
    close,
    recover,
    needsJoin,
  };
});
