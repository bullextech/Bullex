import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Circle, RefreshCw, AlertCircle, ChevronDown, ChevronUp,
  Plus, MessageSquare, User, Calendar, Send, Shield, Trash2, X, Loader2,
} from "lucide-react";
import type { TeamTask, TaskUpdate } from "@shared/schema";

type Priority = "urgent" | "high" | "medium" | "low";
type Status = "todo" | "in_progress" | "review" | "done";

const PRIORITIES: Record<Priority, { label: string; color: string; dot: string }> = {
  urgent: { label: "Urgent", color: "text-red-600 bg-red-50 border-red-200", dot: "bg-red-500" },
  high:   { label: "High",   color: "text-orange-600 bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  medium: { label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  low:    { label: "Low",    color: "text-green-600 bg-green-50 border-green-200", dot: "bg-green-500" },
};

const STATUSES: Record<Status, { label: string; icon: any; color: string; bg: string }> = {
  todo:        { label: "To Do",       icon: Circle,       color: "text-gray-400",  bg: "bg-gray-100" },
  in_progress: { label: "In Progress", icon: RefreshCw,    color: "text-blue-500",  bg: "bg-blue-50" },
  review:      { label: "Review",      icon: AlertCircle,  color: "text-amber-500", bg: "bg-amber-50" },
  done:        { label: "Done",        icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
};

function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITIES[priority as Priority] ?? PRIORITIES.medium;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-semibold ${p.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {p.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES[status as Status] ?? STATUSES.todo;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${s.bg} ${s.color}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function TaskRow({ task, username, onDelete }: { task: TeamTask; username: string; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const { toast } = useToast();

  const { data: updates = [], isLoading: updatesLoading } = useQuery<TaskUpdate[]>({
    queryKey: ["/api/tasks", task.id, "updates"],
    queryFn: () => fetch(`/api/tasks/${task.id}/updates`).then(r => r.json()),
    enabled: expanded,
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/tasks/${task.id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  const postUpdate = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tasks/${task.id}/updates`, { author: username, text: replyText.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id, "updates"] });
      setReplyText("");
    },
    onError: () => toast({ title: "Failed to post update", variant: "destructive" }),
  });

  const isDone = task.status === "done";

  return (
    <div
      data-testid={`task-row-${task.id}`}
      className={`border border-border rounded-lg overflow-hidden transition-all ${isDone ? "opacity-60" : ""}`}
    >
      <button
        data-testid={`button-expand-task-${task.id}`}
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-muted/40 transition-colors"
      >
        <div className="mt-0.5 shrink-0">
          {isDone
            ? <CheckCircle2 className="w-4.5 h-4.5 text-green-500" />
            : <Circle className="w-4.5 h-4.5 text-muted-foreground/40" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold mb-1.5 ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {task.title}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            {task.assignee && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <User className="w-3 h-3" />{task.assignee}
              </span>
            )}
            {task.dueDate && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />Due: {task.dueDate}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 px-5 py-5 space-y-5">
          {task.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Update Status</p>
            <div className="flex flex-wrap gap-2">
              {(["todo", "in_progress", "review", "done"] as Status[]).map(s => (
                <button
                  key={s}
                  data-testid={`button-status-${s}-${task.id}`}
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate(s)}
                  className={`text-xs px-3 py-1.5 rounded border font-medium transition-all ${
                    task.status === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  {STATUSES[s].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Progress Updates</p>
            {updatesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading…
              </div>
            ) : updates.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 italic">No updates yet.</p>
            ) : (
              <div className="space-y-2 mb-3">
                {updates.map(u => (
                  <div key={u.id} className="flex gap-3 text-sm" data-testid={`update-${u.id}`}>
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-primary text-xs font-bold">{u.author[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 bg-background border border-border rounded px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold">{u.author}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(u.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80">{u.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                data-testid={`input-update-${task.id}`}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (replyText.trim()) postUpdate.mutate(); } }}
                placeholder="Add a progress update…"
                className="flex-1 text-sm border border-border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
              />
              <button
                data-testid={`button-send-update-${task.id}`}
                disabled={!replyText.trim() || postUpdate.isPending}
                onClick={() => postUpdate.mutate()}
                className="px-3 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {postUpdate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              data-testid={`button-delete-task-${task.id}`}
              onClick={() => onDelete(task.id)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete task
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewTaskForm({ onClose, username }: { onClose: () => void; username: string }) {
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", assignee: "", dueDate: "" });
  const { toast } = useToast();

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tasks", { ...form, createdBy: username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to create task", variant: "destructive" }),
  });

  const set = (field: string, val: string) => setForm(f => ({ ...f, [field]: val }));

  return (
    <div className="mx-6 mt-5 bg-background border border-primary/30 rounded-lg p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> New Task
        </h3>
        <button data-testid="button-close-new-task" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      <input
        data-testid="input-task-title"
        value={form.title}
        onChange={e => set("title", e.target.value)}
        placeholder="Task title *"
        className="w-full text-sm border border-border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
      />
      <textarea
        data-testid="input-task-description"
        value={form.description}
        onChange={e => set("description", e.target.value)}
        placeholder="Instructions / description…"
        rows={3}
        className="w-full text-sm border border-border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary resize-none"
      />
      <div className="grid grid-cols-3 gap-2">
        <select
          data-testid="select-task-priority"
          value={form.priority}
          onChange={e => set("priority", e.target.value)}
          className="text-sm border border-border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          data-testid="input-task-assignee"
          value={form.assignee}
          onChange={e => set("assignee", e.target.value)}
          placeholder="Assignee"
          className="text-sm border border-border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <input
          data-testid="input-task-due-date"
          type="date"
          value={form.dueDate}
          onChange={e => set("dueDate", e.target.value)}
          className="text-sm border border-border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          data-testid="button-cancel-new-task"
          onClick={onClose}
          className="text-sm px-4 py-2 border border-border rounded text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          data-testid="button-create-task"
          disabled={!form.title.trim() || create.isPending}
          onClick={() => create.mutate()}
          className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded font-semibold hover:bg-primary/90 disabled:opacity-40 flex items-center gap-2"
        >
          {create.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Create Task
        </button>
      </div>
    </div>
  );
}

export default function TaskBoard() {
  const { username } = useAuth();
  const [filter, setFilter] = useState<Status | "all">("all");
  const [showNew, setShowNew] = useState(false);
  const { toast } = useToast();

  const { data: tasks = [], isLoading } = useQuery<TeamTask[]>({
    queryKey: ["/api/tasks"],
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task deleted" });
    },
    onError: () => toast({ title: "Failed to delete task", variant: "destructive" }),
  });

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  const counts = {
    all: tasks.length,
    todo: tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    review: tasks.filter(t => t.status === "review").length,
    done: tasks.filter(t => t.status === "done").length,
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="border-b border-border bg-background px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Team Task Board</h1>
            <p className="text-xs text-muted-foreground">Assign, track, and update team tasks</p>
          </div>
        </div>
        <button
          data-testid="button-add-task"
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Task
        </button>
      </div>

      <div className="px-6 py-3 border-b border-border bg-background sticky top-[65px] z-10">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "todo", "in_progress", "review", "done"] as const).map(s => (
            <button
              key={s}
              data-testid={`button-filter-${s}`}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all border ${
                filter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-muted-foreground"
              }`}
            >
              {s === "all" ? "All" : STATUSES[s].label}
              <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                filter === s ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {counts[s]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showNew && (
        <NewTaskForm onClose={() => setShowNew(false)} username={username ?? "Admin"} />
      )}

      <div className="px-6 py-5 space-y-3 max-w-4xl">
        {isLoading ? (
          <div className="flex items-center gap-3 py-8 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading tasks…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">
              {filter === "all" ? "No tasks yet. Add one above." : `No tasks with status "${STATUSES[filter as Status]?.label}".`}
            </p>
          </div>
        ) : (
          filtered.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              username={username ?? "Admin"}
              onDelete={id => deleteTask.mutate(id)}
            />
          ))
        )}
      </div>

      {tasks.length > 0 && (
        <div className="px-6 pb-8">
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
      )}
    </div>
  );
}
