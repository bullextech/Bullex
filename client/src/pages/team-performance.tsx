import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Loader2, SearchCheck, Link2, FileText, Users } from "lucide-react";

type PerformanceRow = {
  id: string;
  name: string;
  participantId: string | null;
  department: string | null;
  position: string | null;
  allocatedEnquiries: number;
  trades: number;
  documents: number;
};

export default function TeamPerformance() {
  const { data: rows = [], isLoading } = useQuery<PerformanceRow[]>({
    queryKey: ["/api/team-performance"],
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.enquiries += r.allocatedEnquiries;
      acc.trades += r.trades;
      acc.documents += r.documents;
      return acc;
    },
    { enquiries: 0, trades: 0, documents: 0 },
  );

  const sorted = [...rows].sort(
    (a, b) =>
      b.allocatedEnquiries - a.allocatedEnquiries ||
      b.documents - a.documents ||
      a.name.localeCompare(b.name),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">Team Performance</h1>
            <p className="text-sm text-muted-foreground">
              Deals allocated per team member and the trades and documents flowing from those deals.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <SearchCheck className="w-6 h-6 text-primary shrink-0" />
            <div>
              <div className="text-2xl font-bold" data-testid="text-total-enquiries">{totals.enquiries}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Allocated Enquiries</div>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <Link2 className="w-6 h-6 text-primary shrink-0" />
            <div>
              <div className="text-2xl font-bold" data-testid="text-total-trades">{totals.trades}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Trades</div>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary shrink-0" />
            <div>
              <div className="text-2xl font-bold" data-testid="text-total-documents">{totals.documents}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Documents</div>
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-10 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading performance…
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-10 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Users className="w-8 h-8" />
              <p className="text-sm">No team members yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-3 font-semibold">Team Member</th>
                    <th className="p-3 font-semibold">Member Code</th>
                    <th className="p-3 font-semibold text-right">Allocated Enquiries</th>
                    <th className="p-3 font-semibold text-right">Trades</th>
                    <th className="p-3 font-semibold text-right">Documents</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover-elevate" data-testid={`row-member-${r.id}`}>
                      <td className="p-3">
                        <div className="font-medium" data-testid={`text-name-${r.id}`}>{r.name}</div>
                        {(r.position || r.department) && (
                          <div className="text-xs text-muted-foreground">
                            {[r.position, r.department].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {r.participantId ? (
                          <Badge variant="secondary" className="font-mono text-xs" data-testid={`badge-code-${r.id}`}>
                            {r.participantId}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums" data-testid={`text-enquiries-${r.id}`}>{r.allocatedEnquiries}</td>
                      <td className="p-3 text-right tabular-nums" data-testid={`text-trades-${r.id}`}>{r.trades}</td>
                      <td className="p-3 text-right tabular-nums" data-testid={`text-documents-${r.id}`}>{r.documents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
