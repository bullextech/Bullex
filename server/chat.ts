import type { Server as HttpServer } from "http";
import type { RequestHandler } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";

function isAllowedOrigin(origin: string | undefined, hostHeader: string | undefined): boolean {
  if (!origin) return true; // non-browser clients / same-origin without Origin header
  try {
    const u = new URL(origin);
    // Same host as the request → allow
    if (hostHeader && u.host === hostHeader) return true;
    // Replit-hosted dev/prod domains
    if (u.hostname.endsWith(".replit.dev")) return true;
    if (u.hostname.endsWith(".replit.app")) return true;
    if (u.hostname.endsWith(".repl.co")) return true;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

async function isKnownUser(id: string): Promise<boolean> {
  if (id.startsWith("admin:")) {
    const adminUser = process.env.ADMIN_USERNAME;
    return !!adminUser && id === `admin:${adminUser}`;
  }
  if (id.startsWith("team:")) {
    const username = id.slice("team:".length);
    try {
      const m = await storage.getTeamMemberByUsername(username);
      return !!m;
    } catch { return false; }
  }
  if (id.startsWith("client:")) {
    const kycId = id.slice("client:".length);
    try {
      const k = await storage.getKycApplicationById(kycId);
      return !!k && k.status === "approved" && !!k.clientUsername;
    } catch { return false; }
  }
  return false;
}

export interface ChatIdentity {
  id: string;
  name: string;
  role: "admin" | "team" | "client";
}

export function getSessionIdentity(session: any): ChatIdentity | null {
  if (!session?.authenticated) return null;
  if (session.role === "admin") {
    return { id: `admin:${session.username}`, name: session.username || "Admin", role: "admin" };
  }
  if (session.role === "team") {
    return { id: `team:${session.username}`, name: session.username || "Team", role: "team" };
  }
  if (session.role === "client") {
    return {
      id: `client:${session.clientKycId}`,
      name: session.clientCompanyName || session.username || "Client",
      role: "client",
    };
  }
  return null;
}

export function dmRoomId(a: string, b: string): string {
  return "dm:" + [a, b].sort().join("|");
}

export function canAccessRoom(roomId: string, userId: string): boolean {
  if (roomId === "general") return true;
  if (roomId.startsWith("dm:")) {
    const parts = roomId.slice(3).split("|");
    return parts.includes(userId);
  }
  return false;
}

interface ChatClient {
  ws: WebSocket;
  identity: ChatIdentity;
}

const clients = new Map<WebSocket, ChatClient>();
const byUser = new Map<string, Set<WebSocket>>();

function broadcastPresence() {
  const online = Array.from(byUser.keys());
  const payload = JSON.stringify({ type: "presence", online });
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function sendToUser(userId: string, data: any) {
  const sockets = byUser.get(userId);
  if (!sockets) return;
  const payload = JSON.stringify(data);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function broadcastToAll(data: any, excludeWs?: WebSocket) {
  const payload = JSON.stringify(data);
  for (const ws of clients.keys()) {
    if (ws === excludeWs) continue;
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function broadcastToRoom(roomId: string, data: any, excludeWs?: WebSocket) {
  if (roomId === "general") {
    broadcastToAll(data);
    return;
  }
  if (roomId.startsWith("dm:")) {
    const parts = roomId.slice(3).split("|");
    const payload = JSON.stringify(data);
    const seen = new Set<WebSocket>();
    for (const uid of parts) {
      const sockets = byUser.get(uid);
      if (!sockets) continue;
      for (const ws of sockets) {
        if (seen.has(ws)) continue;
        seen.add(ws);
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  }
}

export function attachChat(httpServer: HttpServer, sessionMiddleware: RequestHandler) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url || !req.url.startsWith("/ws/chat")) return;
    // Reject cross-origin upgrades to prevent CSWSH (sameSite=none cookies).
    const origin = req.headers.origin as string | undefined;
    const host = req.headers.host as string | undefined;
    if (!isAllowedOrigin(origin, host)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    // Run express-session on the upgrade request to populate req.session.
    sessionMiddleware(req as any, {} as any, () => {
      const identity = getSessionIdentity((req as any).session);
      if (!identity) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req, identity);
      });
    });
  });

  wss.on("connection", (ws: WebSocket, _req, identity: ChatIdentity) => {
    clients.set(ws, { ws, identity });
    if (!byUser.has(identity.id)) byUser.set(identity.id, new Set());
    byUser.get(identity.id)!.add(ws);

    ws.send(JSON.stringify({ type: "welcome", you: identity }));
    broadcastPresence();

    ws.on("message", async (raw) => {
      let data: any;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (data.type === "message" && typeof data.roomId === "string" && typeof data.content === "string") {
        const roomId: string = data.roomId;
        const content: string = data.content.trim();
        if (!content) return;
        if (!canAccessRoom(roomId, identity.id)) return;
        try {
          const saved = await storage.createChatMessage({
            roomId,
            senderId: identity.id,
            senderName: identity.name,
            senderRole: identity.role,
            content: content.slice(0, 4000),
          });
          broadcastToRoom(roomId, { type: "message", message: saved });
        } catch (err: any) {
          console.error("[chat] save failed:", err?.message || err);
        }
        return;
      }

      if (data.type === "signal" && typeof data.to === "string" && data.payload) {
        const to: string = data.to;
        if (to === identity.id) return; // no self
        // Only allow forwarding between two valid known users (canonical DM relationship).
        const ok = await isKnownUser(to);
        if (!ok) return;
        sendToUser(to, {
          type: "signal",
          from: identity.id,
          fromName: identity.name,
          payload: data.payload,
        });
        return;
      }

      if (data.type === "typing" && typeof data.roomId === "string") {
        broadcastToRoom(data.roomId, { type: "typing", roomId: data.roomId, from: identity.id, fromName: identity.name }, ws);
        return;
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      const set = byUser.get(identity.id);
      if (set) {
        set.delete(ws);
        if (set.size === 0) byUser.delete(identity.id);
      }
      broadcastPresence();
    });

    ws.on("error", () => {
      try { ws.close(); } catch {}
    });
  });
}
