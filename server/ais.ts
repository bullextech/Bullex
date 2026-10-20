// Live AIS vessel-position feed via aisstream.io (free WebSocket API).
//
// When AISSTREAM_API_KEY is set, this module keeps a WebSocket subscription to
// AISStream filtered to the MMSIs of active (non-delivered/cancelled) shipments
// and writes received positions back onto the matching shipment rows with
// positionSource = "ais". Without the key the module is inert and the
// shipments page falls back to manual position entry.

import WebSocket from "ws";
import { storage } from "./storage";

function log(message: string) {
  console.log(`${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })} [ais] ${message}`);
}

const AIS_URL = "wss://stream.aisstream.io/v0/stream";
const RESYNC_INTERVAL_MS = 5 * 60 * 1000; // re-read tracked MMSIs from the DB
const MIN_WRITE_INTERVAL_MS = 2 * 60 * 1000; // per-vessel DB write throttle
const MAX_MMSI_FILTER = 50; // AISStream subscription filter limit

let socket: WebSocket | null = null;
let trackedMmsis: string[] = [];
let reconnectDelayMs = 5_000;
let stopped = false;
const lastWriteAt = new Map<string, number>();

export function isAisEnabled(): boolean {
  return Boolean(process.env.AISSTREAM_API_KEY);
}

function isValidMmsi(value: string | null | undefined): value is string {
  return !!value && /^\d{9}$/.test(value.trim());
}

async function fetchTrackedMmsis(): Promise<string[]> {
  const all = await storage.getShipments();
  const active = all.filter(
    (s) => !["delivered", "cancelled"].includes(s.status) && isValidMmsi(s.mmsi),
  );
  const unique = Array.from(new Set(active.map((s) => s.mmsi!.trim())));
  if (unique.length > MAX_MMSI_FILTER) {
    log(`tracking first ${MAX_MMSI_FILTER} of ${unique.length} MMSIs (AISStream filter limit)`);
  }
  return unique.slice(0, MAX_MMSI_FILTER);
}

function sendSubscription(ws: WebSocket, mmsis: string[]) {
  ws.send(
    JSON.stringify({
      APIKey: process.env.AISSTREAM_API_KEY,
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FiltersShipMMSI: mmsis,
      FilterMessageTypes: ["PositionReport"],
    }),
  );
}

async function handleMessage(raw: WebSocket.RawData) {
  let msg: any;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (msg?.MessageType !== "PositionReport") return;

  const meta = msg.MetaData ?? {};
  const report = msg.Message?.PositionReport ?? {};
  const mmsi = String(meta.MMSI ?? report.UserID ?? "");
  const lat = Number(report.Latitude ?? meta.latitude);
  const lng = Number(report.Longitude ?? meta.longitude);
  if (!isValidMmsi(mmsi) || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

  const now = Date.now();
  const last = lastWriteAt.get(mmsi) ?? 0;
  if (now - last < MIN_WRITE_INTERVAL_MS) return;
  lastWriteAt.set(mmsi, now);

  try {
    const updated = await storage.updateShipmentPositionByMmsi(mmsi, lat, lng);
    if (updated > 0) {
      log(`position update MMSI ${mmsi} -> ${lat.toFixed(4)}, ${lng.toFixed(4)} (${updated} shipment(s))`);
    }
  } catch (e: any) {
    console.error("[ais] failed to persist position:", e?.message || e);
  }
}

function connect() {
  if (stopped || !isAisEnabled()) return;
  if (trackedMmsis.length === 0) return; // nothing to track — stay offline

  const ws = new WebSocket(AIS_URL);
  socket = ws;

  ws.on("open", () => {
    reconnectDelayMs = 5_000;
    sendSubscription(ws, trackedMmsis);
    log(`connected — tracking ${trackedMmsis.length} vessel(s)`);
  });

  ws.on("message", (raw) => void handleMessage(raw));

  ws.on("error", (err) => {
    console.error("[ais] socket error:", (err as any)?.message || err);
  });

  ws.on("close", () => {
    if (socket === ws) socket = null;
    if (stopped) return;
    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 5 * 60 * 1000);
    setTimeout(() => {
      if (!socket && !stopped) connect();
    }, delay);
  });
}

async function resync() {
  if (stopped || !isAisEnabled()) return;
  let next: string[];
  try {
    next = await fetchTrackedMmsis();
  } catch (e: any) {
    console.error("[ais] failed to read tracked MMSIs:", e?.message || e);
    return;
  }

  const changed =
    next.length !== trackedMmsis.length || next.some((m) => !trackedMmsis.includes(m));
  trackedMmsis = next;

  if (trackedMmsis.length === 0) {
    if (socket) {
      log("no active vessels with an MMSI — pausing feed");
      socket.close();
      socket = null;
    }
    return;
  }

  if (!socket) {
    connect();
  } else if (changed && socket.readyState === WebSocket.OPEN) {
    sendSubscription(socket, trackedMmsis);
    log(`subscription updated — tracking ${trackedMmsis.length} vessel(s)`);
  }
}

export function startAisFeed() {
  if (!isAisEnabled()) {
    log("AISSTREAM_API_KEY not set — live feed disabled, manual positions only");
    return;
  }
  stopped = false;
  void resync();
  setInterval(() => void resync(), RESYNC_INTERVAL_MS).unref();
}
