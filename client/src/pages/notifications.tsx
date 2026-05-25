import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bell, Check, CheckCheck, Trash2, AlertCircle, AlertTriangle, Info, CheckCircle2, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { Notification } from "@shared/schema";

const SEVERITY_META: Record<string, { icon: any; color: string; bg: string }> = {
  info:    { icon: Info,          color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-950/30" },
  success: { icon: CheckCircle2,  color: "text-green-600 dark:text-green-400",   bg: "bg-green-50 dark:bg-green-950/30" },
  warning: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-950/30" },
  alert:   { icon: AlertCircle,   color: "text-red-600 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-950/30" },
};

const MODULE_LABELS: Record<string, string> = {
  kyc: "KYC",
  enquiries: "Enquiries",
  documents: "Documents",
  tasks: "Tasks",
  registrations: "Registrations",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsPage() {
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const removeNotif = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight" data-testid="text-notifications-title">Notifications</h1>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"} · {notifications.length} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="w-4 h-4 mr-1.5" />
            Mark all read
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto p-6 space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </>
          ) : notifications.length === 0 ? (
            <Card className="p-12 text-center">
              <Bell className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                New activity across KYC, enquiries, documents and tasks will appear here.
              </p>
            </Card>
          ) : (
            notifications.map((n) => {
              const meta = SEVERITY_META[n.severity] || SEVERITY_META.info;
              const Icon = meta.icon;
              return (
                <Card
                  key={n.id}
                  className={`p-4 transition-colors ${!n.isRead ? "border-l-4 border-l-primary" : "opacity-70"}`}
                  data-testid={`notification-${n.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-tight" data-testid={`text-notif-title-${n.id}`}>
                            {n.title}
                            {!n.isRead && <span className="inline-block w-2 h-2 rounded-full bg-primary ml-2 align-middle" />}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 break-words">{n.message}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(n.createdAt as any)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2.5">
                        {n.module && (
                          <Badge variant="secondary" className="text-[10px] h-5">
                            {MODULE_LABELS[n.module] || n.module}
                          </Badge>
                        )}
                        {n.link && (
                          <Link href={n.link}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => !n.isRead && markRead.mutate(n.id)}
                              data-testid={`button-open-${n.id}`}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Open
                            </Button>
                          </Link>
                        )}
                        {!n.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => markRead.mutate(n.id)}
                            data-testid={`button-read-${n.id}`}
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Mark read
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive ml-auto"
                          onClick={() => removeNotif.mutate(n.id)}
                          data-testid={`button-delete-${n.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
