import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { app, websocket, state, clients, resetState } from "./app";

const TEST_PORT = 3001;
let server: ReturnType<typeof Bun.serve>;

// Helpers

function connectWS(role?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = `ws://localhost:${TEST_PORT}/ws${role ? `?role=${role}` : ""}`;
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error("WS connect failed"));
    setTimeout(() => reject(new Error("Connect timeout")), 3000);
  });
}

function waitForMessage(
  ws: WebSocket,
  filter: (msg: any) => boolean = () => true,
  timeout = 3000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler as any);
      reject(new Error("Message timeout"));
    }, timeout);
    function handler(event: MessageEvent) {
      const msg = JSON.parse(event.data as string);
      if (filter(msg)) {
        clearTimeout(timer);
        ws.removeEventListener("message", handler as any);
        resolve(msg);
      }
    }
    ws.addEventListener("message", handler as any);
  });
}

function closeWS(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    ws.onclose = () => resolve();
    ws.close();
  });
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Setup / Teardown

beforeAll(() => {
  server = Bun.serve({ port: TEST_PORT, fetch: app.fetch, websocket });
});

afterAll(async () => {
  await server.stop(true);
});

beforeEach(() => {
  resetState();
});

// Suite 1: Connection

describe("Suite 1: WebSocket Connection", () => {
  it("TEST-CON-01: koneksi berhasil terbuka", async () => {
    const ws = await connectWS();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    await closeWS(ws);
  });

  it("TEST-CON-02: koneksi terdaftar di clients Map", async () => {
    const ws = await connectWS();
    await delay(50);
    expect(clients.size).toBe(1);
    await closeWS(ws);
  });

  it("TEST-CON-03: koneksi dihapus dari clients setelah disconnect", async () => {
    const ws = await connectWS();
    await delay(50);
    expect(clients.size).toBe(1);
    await closeWS(ws);
    await delay(100);
    expect(clients.size).toBe(0);
  });
});

// Suite 2: JOIN

describe("Suite 2: Event JOIN", () => {
  it("TEST-JOIN-01: username berhasil disimpan setelah JOIN", async () => {
    const ws = await connectWS();
    await waitForMessage(ws, m => m.type === "STATE_UPDATE");
    ws.send(JSON.stringify({ type: "JOIN", payload: { username: "TestUser" } }));
    const msg = await waitForMessage(ws, m => m.type === "STATE_UPDATE" && m.payload.players.includes("TestUser"));
    expect(msg.payload.players).toContain("TestUser");
    await closeWS(ws);
  });

  it("TEST-JOIN-02: broadcast STATE_UPDATE dikirim ke semua client setelah JOIN", async () => {
    const wsA = await connectWS();
    const wsB = await connectWS();
    await delay(50);
    wsA.send(JSON.stringify({ type: "JOIN", payload: { username: "PlayerA" } }));
    const msg = await waitForMessage(wsB, m => m.type === "STATE_UPDATE" && m.payload.players.includes("PlayerA"));
    expect(msg.payload.players).toContain("PlayerA");
    await closeWS(wsA);
    await closeWS(wsB);
  });
});

// Suite 3: Race Condition

describe("Suite 3: Integritas State & Race Condition", () => {
  it("TEST-RACE-01: hanya satu winner dari dua BUZZ bersamaan", async () => {
    const host = await connectWS("host");
    const playerA = await connectWS();
    const playerB = await connectWS();
    await delay(100);

    playerA.send(JSON.stringify({ type: "JOIN", payload: { username: "PlayerA" } }));
    playerB.send(JSON.stringify({ type: "JOIN", payload: { username: "PlayerB" } }));
    await delay(100);

    host.send(JSON.stringify({ type: "START_SESSION" }));
    await delay(100);
    expect(state.isSessionOpen).toBe(true);

    const winnerFromA = waitForMessage(playerA, m => m.type === "STATE_UPDATE" && m.payload.winner !== null);
    const winnerFromB = waitForMessage(playerB, m => m.type === "STATE_UPDATE" && m.payload.winner !== null);

    playerA.send(JSON.stringify({ type: "BUZZ" }));
    playerB.send(JSON.stringify({ type: "BUZZ" }));

    const [msgA, msgB] = await Promise.all([winnerFromA, winnerFromB]);
    expect(msgA.payload.winner).not.toBeNull();
    expect(msgA.payload.winner).toBe(msgB.payload.winner);
    expect(["PlayerA", "PlayerB"]).toContain(msgA.payload.winner);

    await closeWS(host);
    await closeWS(playerA);
    await closeWS(playerB);
  });

  it("TEST-RACE-02: BUZZ diabaikan jika winner sudah ada", async () => {
    state.isSessionOpen = true;
    state.winner = "PlayerA";
    const ws = await connectWS();
    ws.send(JSON.stringify({ type: "JOIN", payload: { username: "PlayerB" } }));
    await delay(100);
    ws.send(JSON.stringify({ type: "BUZZ" }));
    await delay(300);
    expect(state.winner).toBe("PlayerA");
    await closeWS(ws);
  });

  it("TEST-RACE-03: BUZZ diabaikan jika sesi belum dibuka", async () => {
    state.isSessionOpen = false;
    state.winner = null;
    const ws = await connectWS();
    ws.send(JSON.stringify({ type: "JOIN", payload: { username: "TestUser" } }));
    await delay(100);
    ws.send(JSON.stringify({ type: "BUZZ" }));
    const errMsg = await waitForMessage(ws, m => m.type === "ERROR");
    expect(errMsg.payload.message).toBe("Sesi belum dimulai.");
    expect(state.winner).toBeNull();
    await closeWS(ws);
  });
});

// Suite 4: Access Control

describe("Suite 4: Kontrol Akses Role", () => {
  it("TEST-AUTH-01: non-Host tidak bisa START_SESSION", async () => {
    const ws = await connectWS();
    await delay(50);
    ws.send(JSON.stringify({ type: "START_SESSION" }));
    const errMsg = await waitForMessage(ws, m => m.type === "ERROR");
    expect(state.isSessionOpen).toBe(false);
    expect(errMsg.payload.message).toBe("Tidak diizinkan.");
    await closeWS(ws);
  });

  it("TEST-AUTH-02: Host berhasil START_SESSION dan semua client menerima broadcast", async () => {
    const player = await connectWS();
    const host = await connectWS("host");
    await delay(50);
    player.send(JSON.stringify({ type: "JOIN", payload: { username: "Player1" } }));
    await delay(100);
    host.send(JSON.stringify({ type: "START_SESSION" }));
    const msg = await waitForMessage(player, m => m.type === "STATE_UPDATE" && m.payload.isSessionOpen === true);
    expect(state.isSessionOpen).toBe(true);
    expect(msg.payload.isSessionOpen).toBe(true);
    await closeWS(player);
    await closeWS(host);
  });
});
