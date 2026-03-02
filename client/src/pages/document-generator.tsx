import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Plus,
  Download,
  CheckCircle2,
  Clock,
  FileCheck,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Document as Doc, Trade } from "@shared/schema";

const docTypes = [
  { value: "SCO", label: "Soft Corporate Offer (SCO)" },
  { value: "FCO", label: "Full Corporate Offer (FCO)" },
  { value: "ICPO", label: "Irrevocable Corporate Purchase Order (ICPO)" },
  { value: "SPA", label: "Sales & Purchase Agreement (SPA)" },
  { value: "LOI", label: "Letter of Intent (LOI)" },
  { value: "POP", label: "Proof of Product (POP)" },
  { value: "POF", label: "Proof of Funds (POF)" },
  { value: "BCL", label: "Bank Comfort Letter (BCL)" },
];

export default function DocumentGenerator() {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState("");
  const [selectedTrade, setSelectedTrade] = useState("");
  const [title, setTitle] = useState("");

  const { data: docs, isLoading: docsLoading } = useQuery<Doc[]>({
    queryKey: ["/api/documents"],
  });

  const { data: trades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const generateDoc = useMutation({
    mutationFn: async (data: { docType: string; tradeRef?: string; title: string }) => {
      const res = await apiRequest("POST", "/api/documents", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setSelectedType("");
      setSelectedTrade("");
      setTitle("");
      toast({ title: "Document Generated", description: "Trade document has been created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerate = () => {
    if (!selectedType || !title) {
      toast({ title: "Missing Fields", description: "Please select a document type and enter a title.", variant: "destructive" });
      return;
    }
    generateDoc.mutate({
      docType: selectedType,
      tradeRef: selectedTrade && selectedTrade !== "none" ? selectedTrade : undefined,
      title,
    });
  };

  const isLoading = docsLoading || tradesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-[300px] rounded-md" />
          <Skeleton className="h-[300px] rounded-md lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-docgen-title">
          Automated Document Generator
        </h1>
        <p className="text-sm text-muted-foreground">
          Generate trade documents linked to blockchain-verified transactions
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card data-testid="card-generate-doc">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              Generate Document
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Document Type *</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger data-testid="select-doc-type">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {docTypes.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Link to Trade (Optional)</Label>
              <Select value={selectedTrade} onValueChange={setSelectedTrade}>
                <SelectTrigger data-testid="select-doc-trade">
                  <SelectValue placeholder="Select trade..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No trade link</SelectItem>
                  {trades?.map((t) => (
                    <SelectItem key={t.id} value={t.tradeRef}>
                      {t.tradeRef} - {t.commodity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Document Title *</Label>
              <Input
                placeholder="Enter document title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-doc-title"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={generateDoc.isPending}
              data-testid="button-generate-doc"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              {generateDoc.isPending ? "Generating..." : "Generate Document"}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" data-testid="card-doc-list">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-base font-semibold">Generated Documents</CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {docs?.length || 0} documents
            </Badge>
          </CardHeader>
          <CardContent>
            {docs && docs.length > 0 ? (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted"
                    data-testid={`doc-row-${doc.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileCheck className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{doc.title}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {doc.docType}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {doc.tradeRef ? `Trade: ${doc.tradeRef}` : "Standalone"}
                          {" "}&middot;{" "}
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge
                        variant={doc.status === "final" ? "default" : "secondary"}
                        className="text-[10px] capitalize"
                      >
                        {doc.status === "final" ? (
                          <CheckCircle2 className="w-3 h-3 mr-0.5" />
                        ) : (
                          <Clock className="w-3 h-3 mr-0.5" />
                        )}
                        {doc.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">No documents generated</p>
                <p className="text-xs">Use the form to generate trade documents</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
