import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderOpen,
  FileText,
  FileCheck,
  Clock,
  CheckCircle2,
  Shield,
  Link2,
} from "lucide-react";
import type { Document as Doc, Trade } from "@shared/schema";

export default function Vault() {
  const { data: docs, isLoading: docsLoading } = useQuery<Doc[]>({
    queryKey: ["/api/documents"],
  });
  const { data: trades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const isLoading = docsLoading || tradesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-md" />
      </div>
    );
  }

  const totalDocs = docs?.length || 0;
  const finalDocs = docs?.filter((d) => d.status === "final").length || 0;
  const draftDocs = docs?.filter((d) => d.status === "draft").length || 0;
  const linkedDocs = docs?.filter((d) => d.tradeRef).length || 0;

  const docsByType: Record<string, Doc[]> = {};
  docs?.forEach((doc) => {
    if (!docsByType[doc.docType]) docsByType[doc.docType] = [];
    docsByType[doc.docType].push(doc);
  });

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-vault-title">
          Document Vault
        </h1>
        <p className="text-sm text-muted-foreground">
          Secure storage for all trade documents and compliance records
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card data-testid="stat-total-docs">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Documents</p>
              <p className="text-xl font-bold">{totalDocs}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-final-docs">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-status-online/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-status-online" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Finalized</p>
              <p className="text-xl font-bold">{finalDocs}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-draft-docs">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-status-away/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-status-away" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Drafts</p>
              <p className="text-xl font-bold">{draftDocs}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-linked-docs">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-chart-2/10 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-chart-2" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Trade-Linked</p>
              <p className="text-xl font-bold">{linkedDocs}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {Object.keys(docsByType).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(docsByType).map(([type, typeDocs]) => (
            <Card key={type} data-testid={`card-doc-type-${type}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  {type}
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {typeDocs.length} document{typeDocs.length !== 1 ? "s" : ""}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {typeDocs.map((doc) => {
                  const linkedTrade = doc.tradeRef
                    ? trades?.find((t) => t.tradeRef === doc.tradeRef)
                    : null;

                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-md border"
                      data-testid={`vault-doc-${doc.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileCheck className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{doc.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                            {linkedTrade && (
                              <>
                                <span>&middot;</span>
                                <span className="font-mono">{linkedTrade.tradeRef}</span>
                                <span>&middot;</span>
                                <span>{linkedTrade.commodity}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {linkedTrade?.blockchainHash && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Shield className="w-3 h-3" />
                            <span className="font-mono hidden sm:inline">
                              {linkedTrade.blockchainHash.slice(0, 8)}...
                            </span>
                          </div>
                        )}
                        <Badge
                          variant={doc.status === "final" ? "default" : "secondary"}
                          className="text-[10px] capitalize"
                        >
                          {doc.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FolderOpen className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">Vault is empty</p>
            <p className="text-xs">Generate documents to populate the vault</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
