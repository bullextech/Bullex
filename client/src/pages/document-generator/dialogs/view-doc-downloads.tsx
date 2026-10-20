import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function ViewDocDownloads() {
  const { viewDoc } = useDocGen();
  if (!viewDoc || !viewDoc.content) return null;

  return (
    <div className="border rounded-lg p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Download Document</p>
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          onClick={() => window.open(`/api/documents/${viewDoc.id}/download/docx`, "_blank")}
          data-testid="button-download-docx-view"
        >
          <FileText className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
          Download DOCX
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          onClick={() => window.open(`/api/documents/${viewDoc.id}/download/pdf`, "_blank")}
          data-testid="button-download-pdf-view"
        >
          <FileText className="w-3.5 h-3.5 mr-1.5 text-red-600" />
          Download PDF
        </Button>
      </div>
    </div>
  );
}
