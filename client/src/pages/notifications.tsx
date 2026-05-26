import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileText, Bell } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { Notification } from "@shared/schema";

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} at ${hh}:${mm}`;
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

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="border-b border-border px-6 py-5 bg-card">
        <h1 className="text-xl font-bold tracking-tight text-foreground" data-testid="text-notifications-title">
          Notifications
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">Platform alerts and updates</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Notifications</h2>
              <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-notifications-counts">
                {unreadCount} unread · {notifications.length} total
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={unreadCount === 0 || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              className="h-8 rounded-md border-border text-xs font-medium"
              data-testid="button-mark-all-read"
            >
              Mark all read
            </Button>
          </div>

          {isLoading ? (
            <Card className="rounded-md border border-border shadow-none">
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-4">
                    <Skeleton className="h-14 w-full" />
                  </div>
                ))}
              </div>
            </Card>
          ) : notifications.length === 0 ? (
            <Card className="rounded-md border border-border shadow-none py-16 text-center" data-testid="notifications-empty">
              <Bell className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                New activity across KYC, enquiries, documents and tasks will appear here.
              </p>
            </Card>
          ) : (
            <Card className="rounded-md border border-border shadow-none overflow-hidden">
              <ul className="divide-y divide-border">
                {notifications.map((n) => {
                  const body = (
                    <div className="flex items-start gap-4 px-5 py-4 hover-elevate active-elevate-2 transition-colors" data-testid={`notification-${n.id}`}>
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-foreground leading-tight truncate" data-testid={`text-notif-title-${n.id}`}>
                            {n.title}
                          </p>
                          {!n.isRead && <span className="text-muted-foreground text-sm leading-none">·</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 break-words">{n.message}</p>
                        <p className="text-[11px] text-muted-foreground mt-1.5" data-testid={`text-notif-time-${n.id}`}>
                          {formatTimestamp(n.createdAt as any)}
                        </p>
                      </div>
                      <div className="shrink-0 pt-2 w-2">
                        {!n.isRead && (
                          <span
                            className="block w-2 h-2 rounded-full bg-primary"
                            aria-label="Unread"
                            data-testid={`indicator-unread-${n.id}`}
                          />
                        )}
                      </div>
                    </div>
                  );

                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link href={n.link}>
                          <a
                            className="block cursor-pointer"
                            onClick={() => !n.isRead && markRead.mutate(n.id)}
                            data-testid={`link-notif-${n.id}`}
                          >
                            {body}
                          </a>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => !n.isRead && markRead.mutate(n.id)}
                          data-testid={`button-notif-${n.id}`}
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
