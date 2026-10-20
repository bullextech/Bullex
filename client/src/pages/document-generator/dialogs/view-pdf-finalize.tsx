import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, FileCheck } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function ViewPdfFinalize() {
  const { viewDoc, convertToPdf, lpgReviewByDocId } = useDocGen();
  if (!viewDoc) return null;
  const hasSignature = viewDoc.docType === "ADDENDUM"
    ? (viewDoc.sellerSignature && viewDoc.buyerSignature)
    : viewDoc.docType === "NCNDA"
      ? (viewDoc.sellerSignature || viewDoc.buyerSignature)
      : viewDoc.buyerSignature;
  const lpgBlocked = lpgReviewByDocId.get(viewDoc.id)?.data?.required === true
    && lpgReviewByDocId.get(viewDoc.id)?.data?.cleared !== true;
  const canFinalize = !lpgBlocked && viewDoc.docType !== "PI" &&
    !!hasSignature &&
    viewDoc.status !== "sent" &&
    viewDoc.status !== "accepted" &&
    viewDoc.status !== "final" &&
    (viewDoc.docType === "ADDENDUM" || !viewDoc.pdfPath);

  return (
    <>
      {canFinalize && (
        <div className="border-t pt-4">
          <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4 text-center space-y-3">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-200">{viewDoc.docType} is signed and ready to finalize</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">Convert to PDF to finalize the document. This will generate the final PDF with the digital signature embedded.</p>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => convertToPdf.mutate(viewDoc.id)}
              disabled={convertToPdf.isPending}
              data-testid="button-convert-pdf-view"
            >
              <FileCheck className="w-4 h-4 mr-1.5" />
              {convertToPdf.isPending ? "Converting..." : `Convert to PDF & Complete ${viewDoc.docType}`}
            </Button>
          </div>
        </div>
      )}
      {viewDoc.pdfPath && viewDoc.status === "final" && (
        <div className="border-t pt-4">
          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="text-sm font-medium text-green-800 dark:text-green-200">{viewDoc.docType} Complete</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/documents/${viewDoc.id}/download/pdf`, "_blank")} data-testid="button-download-final-pdf">
              <FileText className="w-3.5 h-3.5 mr-1.5 text-red-600" />
              Download PDF
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
