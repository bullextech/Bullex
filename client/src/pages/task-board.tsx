import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Circle, RefreshCw, AlertCircle, ChevronDown, ChevronUp,
  Plus, MessageSquare, User, Calendar, Send, Shield, Trash2, X, Loader2,
  Briefcase, ClipboardList, ArrowRight,
} from "lucide-react";
import type { TeamTask, TaskUpdate, TeamMember, DailyReport } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const teamQuery = useQuery<TeamMember[]>({ queryKey: ["/api/team/members"] });
  const teamMembers = teamQuery.data ?? [];

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
        <select
          data-testid="select-task-assignee"
          value={form.assignee}
          onChange={e => set("assignee", e.target.value)}
          className="text-sm border border-border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="">Assign to team member…</option>
          {teamMembers.map(tm => (
            <option key={tm.id} value={tm.username}>
              {tm.name} ({tm.username}){tm.position ? ` — ${tm.position}` : ""}
            </option>
          ))}
        </select>
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

function TaskListView() {
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

      <div className="px-4 sm:px-6 py-3 border-b border-border bg-background sticky top-[65px] z-10">
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

      <div className="px-4 sm:px-6 py-5 space-y-3 max-w-4xl">
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
        <div className="px-4 sm:px-6 pb-8">
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

const TASK_STATUSES = [
  { v: "todo", l: "To Do", c: "text-gray-600" },
  { v: "in_progress", l: "In Progress", c: "text-blue-600" },
  { v: "review", l: "Review", c: "text-amber-600" },
  { v: "done", l: "Done", c: "text-green-600" },
];

function DailyReportsBar() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { toast } = useToast();
  const reportsQuery = useQuery<DailyReport[]>({ queryKey: ["/api/daily-reports", { date }], queryFn: () => fetch(`/api/daily-reports?date=${date}`, { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []) });
  const teamQuery = useQuery<TeamMember[]>({ queryKey: ["/api/team/members"] });
  const reports = Array.isArray(reportsQuery.data) ? reportsQuery.data : [];
  const team = Array.isArray(teamQuery.data) ? teamQuery.data : [];

  const reportByMemberId = new Map<string, DailyReport>();
  reports.forEach(r => { if (!reportByMemberId.has(r.teamMemberId)) reportByMemberId.set(r.teamMemberId, r); });

  const submittedCount = team.filter(tm => reportByMemberId.has(tm.id)).length;

  const deleteReport = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/daily-reports/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/daily-reports"] }); toast({ title: "Report deleted" }); },
  });

  return (
    <Card data-testid="card-daily-reports-bar">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Daily Reports</CardTitle>
          <Badge variant="outline" className="text-[10px]" data-testid="badge-reports-count">
            {submittedCount} / {team.length} submitted
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40 text-xs" data-testid="input-report-date-filter" />
          {date !== today && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDate(today)} data-testid="button-reset-date">Today</Button>}
        </div>
      </CardHeader>
      <CardContent>
        {teamQuery.isLoading || reportsQuery.isLoading ? (
          <div className="h-20 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : team.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No team members yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2 pb-2" data-testid="bar-reports">
            {team.map(tm => {
              const r = reportByMemberId.get(tm.id);
              const submitted = !!r;
              const isOpen = expanded === tm.id;
              return (
                <div key={tm.id} className={`flex-shrink-0 w-56 border rounded-md p-3 cursor-pointer transition-colors ${submitted ? "border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900" : "border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-900/50"}`}
                  onClick={() => setExpanded(isOpen ? null : tm.id)}
                  data-testid={`tile-report-${tm.id}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${submitted ? "bg-green-500" : "bg-amber-500"}`} />
                      <span className="text-xs font-semibold truncate">{tm.name}</span>
                    </div>
                    {submitted && r?.hoursWorked && <Badge variant="outline" className="text-[10px] h-4">{r.hoursWorked}h</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-1">{tm.position || tm.department || "Team Member"}</p>
                  {submitted && r ? (
                    <p className="text-[11px] line-clamp-2 text-foreground/80" data-testid={`text-summary-${tm.id}`}>{r.summary}</p>
                  ) : (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">No report submitted</p>
                  )}
                  {isOpen && submitted && r && (
                    <div className="mt-2 pt-2 border-t space-y-1 text-[10px]" onClick={(e) => e.stopPropagation()}>
                      <p className="whitespace-pre-wrap"><span className="font-semibold">Summary:</span> {r.summary}</p>
                      {r.tasksCompleted && <p className="whitespace-pre-wrap"><span className="font-semibold">Tasks:</span> {r.tasksCompleted}</p>}
                      {r.blockers && <p className="whitespace-pre-wrap text-amber-700 dark:text-amber-400"><span className="font-semibold">Blockers:</span> {r.blockers}</p>}
                      {r.nextSteps && <p className="whitespace-pre-wrap"><span className="font-semibold">Next:</span> {r.nextSteps}</p>}
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-600 mt-1" onClick={() => deleteReport.mutate(r.id)} data-testid={`button-delete-report-${tm.id}`}>
                        <Trash2 className="w-3 h-3 mr-1" />Delete
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkAllocationSummary() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", assignee: "", dueDate: "" });
  const tasksQuery = useQuery<TeamTask[]>({ queryKey: ["/api/tasks"] });
  const teamQuery = useQuery<TeamMember[]>({ queryKey: ["/api/team/members"] });
  const tasks = tasksQuery.data ?? [];
  const team = teamQuery.data ?? [];

  const counts = TASK_STATUSES.map(s => ({ ...s, n: tasks.filter(t => t.status === s.v).length }));

  const createTask = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tasks", { ...form, createdBy: "Admin", status: "todo" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setForm({ title: "", description: "", priority: "medium", assignee: "", dueDate: "" });
      setShowForm(false);
      toast({ title: "Task Allocated", description: "Work has been assigned." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Try again.", variant: "destructive" }),
  });

  return (
    <Card data-testid="card-work-allocation">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Work Allocation</CardTitle>
          <Badge variant="outline" className="text-[10px]">{tasks.length} total</Badge>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setShowForm(!showForm)} data-testid="button-allocate-work">
          <Plus className="w-3 h-3 mr-1" />Allocate
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {counts.map(s => (
            <div key={s.v} className="border rounded-md p-2 text-center" data-testid={`stat-task-${s.v}`}>
              <div className={`text-lg font-bold ${s.c}`}>{s.n}</div>
              <div className="text-[10px] text-muted-foreground uppercase">{s.l}</div>
            </div>
          ))}
        </div>

        {showForm && (
          <div className="border border-primary/30 rounded-md p-3 space-y-2 bg-primary/5">
            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-8 text-xs mt-1" data-testid="input-alloc-title" />
              </div>
              <div>
                <Label className="text-xs">Assignee</Label>
                <Select value={form.assignee} onValueChange={(v) => setForm({ ...form, assignee: v })}>
                  <SelectTrigger className="h-8 text-xs mt-1" data-testid="select-alloc-assignee"><SelectValue placeholder="Select team member" /></SelectTrigger>
                  <SelectContent>{team.map(tm => <SelectItem key={tm.id} value={tm.username}>{tm.name} ({tm.username})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="h-8 text-xs mt-1" data-testid="select-alloc-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="h-8 text-xs mt-1" data-testid="input-alloc-due-date" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="text-xs mt-1" data-testid="input-alloc-description" />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} data-testid="button-cancel-alloc">Cancel</Button>
              <Button size="sm" onClick={() => createTask.mutate()} disabled={!form.title.trim() || createTask.isPending} data-testid="button-save-alloc">
                {createTask.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                Allocate Task
              </Button>
            </div>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">All Tasks — click to view progress</p>
            <div className="space-y-2">
              {tasks.map(task => (
                <AdminTaskRow key={task.id} task={task} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminTaskRow({ task }: { task: TeamTask }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const updatesQuery = useQuery<any[]>({
    queryKey: ["/api/tasks", task.id, "updates"],
    queryFn: () => fetch(`/api/tasks/${task.id}/updates`, { credentials: "include" }).then(r => r.json()),
    enabled: expanded,
  });
  const [text, setText] = useState("");
  const postUpdate = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tasks/${task.id}/updates`, { text, author: "Admin" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id, "updates"] });
      setText("");
      toast({ title: "Comment posted" });
    },
  });
  const statusMeta = TASK_STATUSES.find(s => s.v === task.status) || TASK_STATUSES[0];
  const updates = updatesQuery.data ?? [];
  return (
    <div className="border rounded-md text-xs" data-testid={`admin-task-${task.id}`}>
      <button
        type="button"
        className="w-full p-2.5 flex items-center justify-between gap-2 hover:bg-muted/40 text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-toggle-admintask-${task.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold truncate">{task.title}</span>
            <Badge variant="outline" className="text-[10px]">{task.priority}</Badge>
            <span className={`text-[10px] font-semibold ${statusMeta.c}`}>{statusMeta.l}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{task.assignee || "Unassigned"}</span>
            {task.dueDate && <span>· Due {task.dueDate}</span>}
            {updates.length > 0 && <span>· {updates.length} update{updates.length !== 1 ? "s" : ""}</span>}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t bg-muted/20 p-3 space-y-2">
          {task.description && <p className="text-[11px] whitespace-pre-wrap text-foreground/80">{task.description}</p>}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Progress Updates</p>
            {updatesQuery.isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : updates.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground">No updates yet from the team member.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {updates.map((u: any) => (
                  <div key={u.id} className="bg-background rounded border px-2.5 py-1.5" data-testid={`admin-update-${u.id}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-[11px]">{u.author}</span>
                      <span className="text-[9px] text-muted-foreground">{new Date(u.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[11px] text-foreground/85">{u.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              rows={2}
              placeholder="Add an admin comment or feedback…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="text-xs flex-1"
              data-testid={`admin-input-update-${task.id}`}
            />
            <Button size="sm" onClick={() => postUpdate.mutate()} disabled={!text.trim() || postUpdate.isPending} data-testid={`admin-button-post-${task.id}`}>
              {postUpdate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TaskBoard() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="border-b border-border bg-background px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
          <Shield className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground">Team Task Board</h1>
          <p className="text-xs text-muted-foreground">Tasks, work allocation, and daily reports in one place</p>
        </div>
      </div>
      <Tabs defaultValue="tasks" className="px-4 sm:px-6 py-4">
        <TabsList>
          <TabsTrigger value="tasks" data-testid="tab-tasks">Tasks</TabsTrigger>
          <TabsTrigger value="allocation" data-testid="tab-allocation">Work Allocation</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">Daily Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" className="mt-4 -mx-6">
          <TaskListView />
        </TabsContent>
        <TabsContent value="allocation" className="mt-4">
          <WorkAllocationSummary />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <DailyReportsBar />
        </TabsContent>
      </Tabs>
    </div>
  );
}
