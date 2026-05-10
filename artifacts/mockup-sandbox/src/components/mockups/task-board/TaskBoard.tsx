import { useState } from "react";
import {
  CheckCircle2, Circle, Clock, AlertCircle, ChevronDown, ChevronUp,
  Plus, MessageSquare, User, Calendar, Flag, Trash2, Send, Shield,
  ArrowRight, RefreshCw
} from "lucide-react";

type Priority = "urgent" | "high" | "medium" | "low";
type Status = "todo" | "in_progress" | "review" | "done";

interface Update {
  id: string;
  author: string;
  text: string;
  time: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  assignee: string;
  dueDate: string;
  updates: Update[];
}

const PRIORITIES: Record<Priority, { label: string; color: string; dot: string }> = {
  urgent: { label: "Urgent", color: "text-red-600 bg-red-50 border-red-200", dot: "bg-red-500" },
  high:   { label: "High",   color: "text-orange-600 bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  medium: { label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  low:    { label: "Low",    color: "text-green-600 bg-green-50 border-green-200", dot: "bg-green-500" },
};

const STATUSES: Record<Status, { label: string; icon: typeof Circle; color: string; bg: string }> = {
  todo:        { label: "To Do",       icon: Circle,        color: "text-gray-400",   bg: "bg-gray-100" },
  in_progress: { label: "In Progress", icon: RefreshCw,     color: "text-blue-500",   bg: "bg-blue-50" },
  review:      { label: "Review",      icon: AlertCircle,   color: "text-amber-500",  bg: "bg-amber-50" },
  done:        { label: "Done",        icon: CheckCircle2,  color: "text-green-600",  bg: "bg-green-50" },
};

const SAMPLE_TASKS: Task[] = [
  {
    id: "1",
    title: "Complete KYC verification for ABC Limited",
    description: "Review all submitted documents, verify blockchain hash, and approve the KYC application. Cross-check with AML database before final approval.",
    priority: "urgent",
    status: "in_progress",
    assignee: "trade@bullex.tech",
    dueDate: "2026-05-12",
    updates: [
      { id: "u1", author: "VK", text: "Documents received and under review. Passport and registration cert look good.", time: "10 May, 09:15" },
      { id: "u2", author: "trade@bullex.tech", text: "AML check initiated. Waiting for response from compliance team.", time: "10 May, 11:40" },
    ],
  },
  {
    id: "2",
    title: "Send SCO to Al Fakhama UAE for Granular Sulphur",
    description: "Generate and send the Seller's Conditional Offer for 50,000 MT Granular Sulphur ex-Aktau. Price: USD 185/MT CIF. Validity: 7 days.",
    priority: "high",
    status: "todo",
    assignee: "trade@bullex.tech",
    dueDate: "2026-05-11",
    updates: [],
  },
  {
    id: "3",
    title: "Follow up on BFG-2026-B0F2 final payment",
    description: "Iron Ore trade BFG-2026-B0F2 is at final_payment stage. Confirm LC receipt, verify sight draft and beneficiary certificate before releasing cargo.",
    priority: "high",
    status: "review",
    assignee: "VK",
    dueDate: "2026-05-13",
    updates: [
      { id: "u3", author: "VK", text: "LC copy received from buyer's bank. Forwarding to trade desk for verification.", time: "09 May, 14:22" },
    ],
  },
  {
    id: "4",
    title: "Prepare Deal Recap for ANZ Iron Ore enquiry",
    description: "Draft the Deal Recap for ANZ-IRO-0905-001. Commodity: Iron Ore 62% Fe, 50,000 MT, CIF Kamsar. Ensure dual signatory block is included.",
    priority: "medium",
    status: "todo",
    assignee: "trade@bullex.tech",
    dueDate: "2026-05-14",
    updates: [],
  },
  {
    id: "5",
    title: "Blockchain ledger audit — Q2 2026",
    description: "Review all blockchain blocks from April–May 2026. Verify chain integrity, confirm all trade and KYC blocks are correctly linked and hashed.",
    priority: "low",
    status: "done",
    assignee: "VK",
    dueDate: "2026-05-09",
    updates: [
      { id: "u4", author: "VK", text: "Audit complete. All 27 blocks verified. Chain integrity confirmed. Report filed.", time: "09 May, 17:00" },
    ],
  },
];

function StatusBadge({ status }: { status: Status }) {
  const s = STATUSES[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${s.bg} ${s.color}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITIES[priority];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-semibold ${p.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {p.label}
    </span>
  );
}

function TaskRow({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(task.id === "1");
  const [replyText, setReplyText] = useState("");
  const [updates, setUpdates] = useState(task.updates);
  const [status, setStatus] = useState<Status>(task.status);
  const isDone = status === "done";

  const postUpdate = () => {
    if (!replyText.trim()) return;
    setUpdates(prev => [...prev, {
      id: `u${Date.now()}`,
      author: "trade@bullex.tech",
      text: replyText.trim(),
      time: "Just now",
    }]);
    setReplyText("");
  };

  return (
    <div className={`border border-border rounded-lg overflow-hidden transition-all duration-200 ${isDone ? "opacity-70" : ""}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
      >
        <div className="mt-0.5">
          {isDone
            ? <CheckCircle2 className="w-5 h-5 text-green-500" />
            : <Circle className="w-5 h-5 text-gray-300" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`font-semibold text-sm ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {task.title}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={status} />
            <span className="flex items-center gap-1"><User className="w-3 h-3" />{task.assignee}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Due: {task.dueDate}</span>
            {updates.length > 0 && (
              <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{updates.length}</span>
            )}
          </div>
        </div>
        <div className="text-muted-foreground ml-2 mt-0.5">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-gray-50/50 px-5 py-5 space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>

          <div className="flex flex-wrap gap-2">
            {(["todo", "in_progress", "review", "done"] as Status[]).map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`text-xs px-3 py-1.5 rounded border font-medium transition-all ${
                  status === s
                    ? "bg-[#990000] text-white border-[#990000]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-[#990000]/40 hover:text-[#990000]"
                }`}
              >
                {STATUSES[s].label}
              </button>
            ))}
          </div>

          {updates.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Progress Updates</h4>
              <div className="space-y-2">
                {updates.map(u => (
                  <div key={u.id} className="flex gap-3 text-sm">
                    <div className="w-7 h-7 rounded-full bg-[#990000]/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[#990000] text-xs font-bold">{u.author[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 bg-white border border-border rounded px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-foreground">{u.author}</span>
                        <span className="text-xs text-muted-foreground">{u.time}</span>
                      </div>
                      <p className="text-xs text-foreground/80">{u.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && postUpdate()}
              placeholder="Add a progress update…"
              className="flex-1 text-sm border border-border rounded px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#990000]/40 focus:border-[#990000]"
            />
            <button
              onClick={postUpdate}
              className="px-3 py-2 bg-[#990000] text-white rounded hover:bg-[#7a0000] transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskBoard() {
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [showNew, setShowNew] = useState(false);
  const [tasks] = useState<Task[]>(SAMPLE_TASKS);

  const filtered = filterStatus === "all" ? tasks : tasks.filter(t => t.status === filterStatus);
  const counts = {
    all: tasks.length,
    todo: tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    review: tasks.filter(t => t.status === "review").length,
    done: tasks.filter(t => t.status === "done").length,
  };

  return (
    <div className="min-h-screen bg-background font-sans">
      <div className="border-b border-border bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#990000] rounded flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Team Task Board</h1>
            <p className="text-xs text-muted-foreground">Bullex Commodity Trading Platform</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-2 px-4 py-2 bg-[#990000] text-white text-sm font-semibold rounded hover:bg-[#7a0000] transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Task
        </button>
      </div>

      <div className="px-6 py-4 border-b border-border bg-white">
        <div className="flex items-center gap-2">
          {(["all", "todo", "in_progress", "review", "done"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all border ${
                filterStatus === s
                  ? "bg-[#990000] text-white border-[#990000]"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}
            >
              {s === "all" ? "All" : STATUSES[s].label}
              <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
                filterStatus === s ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              }`}>
                {counts[s]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showNew && (
        <div className="mx-6 mt-5 bg-white border border-[#990000]/30 rounded-lg p-5 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#990000]" /> New Task
          </h3>
          <input placeholder="Task title…" className="w-full text-sm border border-border rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#990000]/40 focus:border-[#990000]" />
          <textarea placeholder="Instructions / description…" rows={2} className="w-full text-sm border border-border rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#990000]/40 focus:border-[#990000] resize-none" />
          <div className="flex gap-2">
            <select className="flex-1 text-sm border border-border rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#990000]/40">
              <option>Priority…</option>
              <option>Urgent</option><option>High</option><option>Medium</option><option>Low</option>
            </select>
            <input type="date" className="flex-1 text-sm border border-border rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#990000]/40" />
            <input placeholder="Assignee" className="flex-1 text-sm border border-border rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#990000]/40" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="text-sm px-4 py-2 border border-border rounded text-muted-foreground hover:bg-gray-50">Cancel</button>
            <button className="text-sm px-4 py-2 bg-[#990000] text-white rounded font-semibold hover:bg-[#7a0000]">Create Task</button>
          </div>
        </div>
      )}

      <div className="px-6 py-5 space-y-3 max-w-4xl">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No tasks in this category.</p>
          </div>
        )}
        {filtered.map(task => <TaskRow key={task.id} task={task} />)}
      </div>

      <div className="px-6 pb-6">
        <div className="max-w-4xl grid grid-cols-4 gap-3">
          {(["todo", "in_progress", "review", "done"] as Status[]).map(s => {
            const st = STATUSES[s];
            const Icon = st.icon;
            return (
              <div key={s} className={`${st.bg} border border-border rounded-lg px-4 py-3 text-center`}>
                <Icon className={`w-5 h-5 mx-auto mb-1 ${st.color}`} />
                <p className={`text-xl font-bold ${st.color}`}>{counts[s]}</p>
                <p className="text-xs text-muted-foreground">{st.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
