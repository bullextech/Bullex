import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MessageSquare,
  Users,
  Send,
  Search,
  Video,
  PhoneOff,
  Mic,
  MicOff,
  VideoOff,
  Phone,
  Hash,
  ArrowLeft,
} from "lucide-react";

interface ChatUser {
  id: string;
  name: string;
  role: string;
  subtitle?: string;
}

interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  createdAt: string;
}

interface Me {
  id: string;
  name: string;
  role: string;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function roleBadge(role: string) {
  if (role === "admin") return "bg-primary/15 text-primary border-primary/30";
  if (role === "team") return "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400";
  return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400";
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatPanel({ embedded = false }: { embedded?: boolean }) {
  // ---- Identity & user list ----
  const { data: me } = useQuery<Me>({
    queryKey: ["/api/chat/me"],
    queryFn: async () => {
      const res = await fetch("/api/chat/me", { credentials: "include" });
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<ChatUser[]>({
    queryKey: ["/api/chat/users"],
    queryFn: async () => {
      const res = await fetch("/api/chat/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!me,
  });

  // ---- WebSocket ----
  const wsRef = useRef<WebSocket | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [activeRoom, setActiveRoom] = useState<{ id: string; label: string; peerId?: string }>({
    id: "general",
    label: "General",
  });
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // WebRTC state
  const [callState, setCallState] = useState<"idle" | "calling" | "ringing" | "connected">("idle");
  const [callPeer, setCallPeer] = useState<{ id: string; name: string } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ from: string; fromName: string; sdp: any } | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [showMobileList, setShowMobileList] = useState(true);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingIceRef = useRef<{ peerId: string; cand: RTCIceCandidateInit }[]>([]);
  // Refs mirroring call state so the WS message handler (created once) reads current values.
  const callStateRef = useRef<typeof callState>("idle");
  const callPeerRef = useRef<typeof callPeer>(null);
  const incomingCallRef = useRef<typeof incomingCall>(null);
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { callPeerRef.current = callPeer; }, [callPeer]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

  // ---- Connect WebSocket once me known ----
  useEffect(() => {
    if (!me) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/chat`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      let data: any;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (data.type === "presence") {
        setOnline(new Set(data.online || []));
      } else if (data.type === "message") {
        const m: ChatMessage = data.message;
        setMessages((prev) => {
          if (m.roomId !== activeRoomRef.current.id) return prev;
          return [...prev, m];
        });
      } else if (data.type === "signal") {
        handleSignal(data.from, data.fromName, data.payload);
      }
    };

    ws.onclose = () => { wsRef.current = null; };

    return () => {
      try { ws.close(); } catch {}
      cleanupCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  const activeRoomRef = useRef(activeRoom);
  useEffect(() => { activeRoomRef.current = activeRoom; }, [activeRoom]);

  // ---- Load history when room changes ----
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch(`/api/chat/messages?room=${encodeURIComponent(activeRoom.id)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ChatMessage[]) => { if (!cancelled) setMessages(rows); })
      .catch(() => { if (!cancelled) setMessages([]); });
    return () => { cancelled = true; };
  }, [activeRoom.id, me?.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || (u.subtitle || "").toLowerCase().includes(q));
  }, [users, search]);

  function openDm(u: ChatUser) {
    if (!me) return;
    const ids = [me.id, u.id].sort();
    setActiveRoom({ id: `dm:${ids[0]}|${ids[1]}`, label: u.name, peerId: u.id });
  }

  function sendMessage() {
    const c = draft.trim();
    if (!c || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "message", roomId: activeRoom.id, content: c }));
    setDraft("");
  }

  // ---- WebRTC helpers ----
  function createPeerConnection(peerId: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "signal",
          to: peerId,
          payload: { kind: "ice", candidate: ev.candidate.toJSON() },
        }));
      }
    };
    // Mark current call peer for queued-ICE scoping.
    callPeerRef.current = { id: peerId, name: callPeerRef.current?.name || peerId };

    pc.ontrack = (ev) => {
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
      remoteStreamRef.current.addTrack(ev.track);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pcRef.current) return;
      const s = pcRef.current.connectionState;
      if (s === "connected") setCallState("connected");
      else if (s === "failed" || s === "disconnected" || s === "closed") {
        cleanupCall();
      }
    };

    return pc;
  }

  async function ensureLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }

  async function startCall(peerId: string, peerName: string) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setCallPeer({ id: peerId, name: peerName });
    setCallState("calling");
    try {
      const stream = await ensureLocalStream();
      const pc = createPeerConnection(peerId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      wsRef.current.send(JSON.stringify({
        type: "signal",
        to: peerId,
        payload: { kind: "offer", sdp: offer },
      }));
    } catch (e: any) {
      console.error("startCall failed", e);
      cleanupCall();
      alert("Could not start camera/microphone: " + (e?.message || e));
    }
  }

  async function acceptCall() {
    if (!incomingCall || !wsRef.current) return;
    const { from, fromName, sdp } = incomingCall;
    setCallPeer({ id: from, name: fromName });
    setIncomingCall(null);
    setCallState("connected");
    try {
      const stream = await ensureLocalStream();
      const pc = createPeerConnection(from);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const drain = pendingIceRef.current.filter((q) => q.peerId === from);
      pendingIceRef.current = pendingIceRef.current.filter((q) => q.peerId !== from);
      for (const q of drain) {
        try { await pc.addIceCandidate(q.cand); } catch {}
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsRef.current.send(JSON.stringify({
        type: "signal",
        to: from,
        payload: { kind: "answer", sdp: answer },
      }));
    } catch (e: any) {
      console.error("acceptCall failed", e);
      cleanupCall();
      alert("Could not accept call: " + (e?.message || e));
    }
  }

  function declineCall() {
    const inc = incomingCallRef.current || incomingCall;
    if (inc && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "signal", to: inc.from, payload: { kind: "decline" } }));
    }
    setIncomingCall(null);
    setCallState("idle");
  }

  function endCall() {
    if (callPeer && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "signal", to: callPeer.id, payload: { kind: "end" } }));
    }
    cleanupCall();
  }

  function cleanupCall() {
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    pendingIceRef.current = [];
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setCallState("idle");
    setCallPeer(null);
    setMuted(false);
    setCamOff(false);
  }

  async function handleSignal(from: string, fromName: string, payload: any) {
    if (!payload?.kind) return;

    if (payload.kind === "offer") {
      // Incoming call — only accept if currently idle
      if (callStateRef.current !== "idle") {
        wsRef.current?.send(JSON.stringify({ type: "signal", to: from, payload: { kind: "decline" } }));
        return;
      }
      setIncomingCall({ from, fromName, sdp: payload.sdp });
      setCallState("ringing");
      return;
    }

    // For all other signal kinds, the sender must match the current call partner.
    const expectedPeer =
      callStateRef.current === "ringing"
        ? incomingCallRef.current?.from
        : callPeerRef.current?.id;
    if (!expectedPeer || from !== expectedPeer) return;

    if (payload.kind === "answer") {
      if (pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const drain = pendingIceRef.current.filter((q) => q.peerId === from);
          pendingIceRef.current = pendingIceRef.current.filter((q) => q.peerId !== from);
          for (const q of drain) {
            try { await pcRef.current.addIceCandidate(q.cand); } catch {}
          }
        } catch (e) { console.error(e); }
      }
    } else if (payload.kind === "ice") {
      const cand = payload.candidate;
      if (!cand) return;
      if (pcRef.current && pcRef.current.remoteDescription) {
        try { await pcRef.current.addIceCandidate(cand); } catch {}
      } else {
        pendingIceRef.current.push({ peerId: from, cand });
      }
    } else if (payload.kind === "decline" || payload.kind === "end") {
      // Only reset the relevant state
      if (callStateRef.current === "ringing") {
        setIncomingCall(null);
        setCallState("idle");
      } else {
        cleanupCall();
      }
    }
  }

  function toggleMute() {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  function toggleCam() {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !camOff;
    s.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCamOff(next);
  }

  const isDm = activeRoom.id.startsWith("dm:");

  return (
    <div className={`flex ${embedded ? "h-[640px]" : "h-full"} bg-background border border-border rounded-md overflow-hidden`}>
      {/* Left: rooms / users */}
      <aside className={`${showMobileList ? "flex" : "hidden"} md:flex w-full md:w-64 flex-shrink-0 border-r border-border flex-col bg-muted/20`}>
        <div className="px-3 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider">Bullex Chat</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search people…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-8 text-xs"
              data-testid="input-chat-search"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2 py-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 mb-1">Rooms</p>
            <button
              onClick={() => { setActiveRoom({ id: "general", label: "General" }); setShowMobileList(false); }}
              className={`w-full text-left flex items-center gap-2 px-2 py-2 rounded text-xs ${
                activeRoom.id === "general" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
              data-testid="button-room-general"
            >
              <Hash className="w-3.5 h-3.5" />
              <span className="flex-1">General</span>
              <Users className="w-3 h-3 opacity-60" />
              <span className="text-[10px] opacity-70">{online.size}</span>
            </button>
          </div>
          <div className="px-2 py-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 mb-1">Direct messages</p>
            <div className="space-y-0.5">
              {filteredUsers.length === 0 && (
                <p className="text-[11px] text-muted-foreground px-2 py-3">No other members yet.</p>
              )}
              {filteredUsers.map((u) => {
                const isActive = activeRoom.peerId === u.id;
                const isOnline = online.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => { openDm(u); setShowMobileList(false); }}
                    className={`w-full text-left flex items-center gap-2 px-2 py-2 rounded ${
                      isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                    data-testid={`button-dm-${u.id}`}
                  >
                    <div className="relative w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {u.name.slice(0, 2).toUpperCase()}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${
                          isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{u.name}</p>
                      <p className={`text-[10px] truncate ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {u.subtitle}
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${isActive ? "border-primary-foreground/40 text-primary-foreground" : roleBadge(u.role)}`}>
                      {u.role}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        </ScrollArea>
      </aside>

      {/* Right: thread */}
      <section className={`${showMobileList ? "hidden" : "flex"} md:flex flex-1 flex-col min-w-0`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden flex-shrink-0"
              onClick={() => setShowMobileList(true)}
              data-testid="button-chat-back-to-list"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            {isDm ? (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                {activeRoom.label.slice(0, 2).toUpperCase()}
              </div>
            ) : (
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Hash className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" data-testid="text-active-room">{activeRoom.label}</p>
              <p className="text-[10px] text-muted-foreground">
                {isDm ? (online.has(activeRoom.peerId!) ? "Online" : "Offline") : `${online.size} online`}
              </p>
            </div>
          </div>
          {isDm && activeRoom.peerId && callState === "idle" && (
            <Button
              size="sm"
              onClick={() => startCall(activeRoom.peerId!, activeRoom.label)}
              className="h-8"
              data-testid="button-start-video-call"
            >
              <Video className="w-3.5 h-3.5 mr-1.5" />
              Video Call
            </Button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs">No messages yet. Say hello!</p>
            </div>
          )}
          {messages.map((m) => {
            const mine = m.senderId === me?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  {!mine && (
                    <p className="text-[10px] text-muted-foreground mb-0.5 px-1">{m.senderName}</p>
                  )}
                  <div
                    className={`px-3 py-2 rounded-lg text-sm ${
                      mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5 px-1">{fmtTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Composer */}
        <div className="border-t border-border p-3 flex items-center gap-2 flex-shrink-0">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={`Message ${activeRoom.label}…`}
            className="flex-1 h-9 text-sm"
            data-testid="input-chat-message"
          />
          <Button size="sm" onClick={sendMessage} disabled={!draft.trim()} className="h-9" data-testid="button-send-chat">
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Send
          </Button>
        </div>
      </section>

      {/* Incoming call dialog */}
      <Dialog open={callState === "ringing" && !!incomingCall} onOpenChange={(o) => { if (!o) declineCall(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Incoming video call</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-3">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold">
              {incomingCall?.fromName.slice(0, 2).toUpperCase()}
            </div>
            <p className="text-sm font-medium">{incomingCall?.fromName}</p>
            <p className="text-xs text-muted-foreground">is calling you…</p>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={declineCall} className="gap-2" data-testid="button-decline-call">
                <PhoneOff className="w-4 h-4" /> Decline
              </Button>
              <Button onClick={acceptCall} className="gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="button-accept-call">
                <Phone className="w-4 h-4" /> Accept
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Active video call overlay */}
      {(callState === "calling" || callState === "connected") && callPeer && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center" data-testid="overlay-video-call">
          <div className="relative w-full max-w-4xl aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-3 right-3 w-40 h-28 object-cover rounded border border-white/20 bg-black"
            />
            <div className="absolute top-3 left-3 text-white text-sm bg-black/50 px-3 py-1 rounded">
              {callState === "calling" ? `Calling ${callPeer.name}…` : callPeer.name}
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={toggleMute} className="gap-2" data-testid="button-toggle-mute">
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {muted ? "Unmute" : "Mute"}
            </Button>
            <Button variant="outline" onClick={toggleCam} className="gap-2" data-testid="button-toggle-cam">
              {camOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              {camOff ? "Camera On" : "Camera Off"}
            </Button>
            <Button onClick={endCall} className="gap-2 bg-red-600 hover:bg-red-700" data-testid="button-end-call">
              <PhoneOff className="w-4 h-4" /> End
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
