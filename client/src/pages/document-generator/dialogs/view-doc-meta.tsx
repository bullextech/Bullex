import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { docTypes } from "../doc-types";
import { useDocGen } from "../use-doc-gen";

export default function ViewDocMeta() {
  const { viewDoc, getStatusBadge } = useDocGen();
  if (!viewDoc) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">Document Type</Label>
          <p className="text-sm font-medium" data-testid="text-view-doc-type">{docTypes.find(d => d.value === viewDoc.docType)?.label || viewDoc.docType}</p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Status</Label>
          {(() => {
            const sb = getStatusBadge(viewDoc);
            const SbIcon = sb.icon;
            return (
              <Badge className={`text-[10px] capitalize ${sb.color}`} data-testid="text-view-doc-status">
                <SbIcon className="w-3 h-3 mr-0.5" />
                {sb.label}
              </Badge>
            );
          })()}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Trade Reference</Label>
          <p className="text-sm" data-testid="text-view-doc-trade">{viewDoc.tradeRef || "Standalone"}</p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Created</Label>
          <p className="text-sm" data-testid="text-view-doc-date">{new Date(viewDoc.createdAt).toLocaleString()}</p>
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Content</Label>
        <div className="mt-1 p-4 rounded-md bg-muted min-h-[120px] whitespace-pre-wrap text-sm" data-testid="text-view-doc-content">
          {viewDoc.content || "No content yet. Use the Amend button to add content."}
        </div>
      </div>
    </>
  );
}
