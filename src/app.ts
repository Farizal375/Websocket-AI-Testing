import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";

export const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

interface ClientInfo {
  username: string;
  isHost: boolean;
}

export const clients = new Map<ServerWebSocket, ClientInfo>();

export const state = {
  isSessionOpen: false,
  winner: null as string | null,
};

export function resetState(): void {
  clients.clear();
  state.isSessionOpen = false;
  state.winner = null;
}

function broadcast(payload: object): void {
  const message = JSON.stringify(payload);
  for (const [ws] of clients) ws.send(message);
}

function sendTo(ws: ServerWebSocket, payload: object): void {
  ws.send(JSON.stringify(payload));
}

function buildStateUpdate(): object {
  const players: string[] = [];
  for (const [, info] of clients)
    if (!info.isHost && info.username !== "Anonymous") players.push(info.username);
  return { type: "STATE_UPDATE", payload: { isSessionOpen: state.isSessionOpen, winner: state.winner, players } };
}

export const app = new Hono();
app.use("/*", serveStatic({ root: "./public" }));

app.get("/ws", upgradeWebSocket((c) => {
  const isHost = c.req.query("role") === "host";
  return {
    onOpen(_e, ws) {
      const raw = ws.raw as ServerWebSocket;
      clients.set(raw, { username: "Anonymous", isHost });
      sendTo(raw, buildStateUpdate());
    },
    onMessage(event, ws) {
      const raw = ws.raw as ServerWebSocket;
      const info = clients.get(raw);
      if (!info) return;
      let parsed: { type: string; payload?: { username?: string } };
      try { parsed = JSON.parse(event.data as string); }
      catch { sendTo(raw, { type: "ERROR", payload: { message: "Format pesan tidak valid." } }); return; }
      const { type, payload } = parsed;

      if (type === "JOIN") {
        if (info.isHost) { sendTo(raw, { type: "ERROR", payload: { message: "Host tidak dapat menggunakan event JOIN." } }); return; }
        const username = payload?.username?.trim();
        if (!username) { sendTo(raw, { type: "ERROR", payload: { message: "Username tidak boleh kosong." } }); return; }
        info.username = username;
        broadcast(buildStateUpdate());
        return;
      }
      if (type === "START_SESSION") {
        if (!info.isHost) { sendTo(raw, { type: "ERROR", payload: { message: "Tidak diizinkan." } }); return; }
        if (state.isSessionOpen) { sendTo(raw, { type: "ERROR", payload: { message: "Sesi sudah berjalan." } }); return; }
        state.isSessionOpen = true; state.winner = null;
        broadcast(buildStateUpdate()); return;
      }
      if (type === "BUZZ") {
        if (!state.isSessionOpen) { sendTo(raw, { type: "ERROR", payload: { message: "Sesi belum dimulai." } }); return; }
        if (state.winner !== null) return;
        state.winner = info.username; state.isSessionOpen = false;
        broadcast(buildStateUpdate()); return;
      }
      if (type === "RESET_SESSION") {
        if (!info.isHost) { sendTo(raw, { type: "ERROR", payload: { message: "Tidak diizinkan." } }); return; }
        state.isSessionOpen = false; state.winner = null;
        broadcast(buildStateUpdate()); return;
      }
    },
    onClose(_e, ws) { const raw = ws.raw as ServerWebSocket; clients.delete(raw); broadcast(buildStateUpdate()); },
    onError(_e, ws) { clients.delete(ws.raw as ServerWebSocket); },
  };
}));
