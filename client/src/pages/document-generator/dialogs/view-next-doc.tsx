import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function ViewNextDoc() {
  const { viewDoc, createNextDoc, prepareProformaInvoice, getNextDocTypes, setAddendumSpaId, canCreateProformaInvoice, isProformaSpa, lpgReviewByDocId } = useDocGen();
  if (!viewDoc) return null;
  if (!(viewDoc.recipientResponse === "accepted" || viewDoc.docType === "LOI" || viewDoc.docType === "SPA")) return null;

  const nextTypes = getNextDocTypes(viewDoc).filter((next) => next !== "PI" || !isProformaSpa(viewDoc));
  const canCreatePi = canCreateProformaInvoice(viewDoc);
  if (nextTypes.length === 0 && !canCreatePi) return null;
  const isAccepted = viewDoc.recipientResponse === "accepted";
  const lpgBlocked = lpgReviewByDocId.get(viewDoc.id)?.data?.required === true
    && lpgReviewByDocId.get(viewDoc.id)?.data?.cleared !== true;
  return (
    <div className="border-t pt-4">
      <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <p className="text-sm font-medium text-green-800 dark:text-green-200">{isAccepted ? `${viewDoc.docType} Accepted` : `Generate from ${viewDoc.docType}`}</p>
        </div>
        <p className="text-xs text-green-600 dark:text-green-400">
          Proceed to create the next document in the workflow.
        </p>
        <div className="flex flex-wrap gap-2">
          {canCreatePi && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => prepareProformaInvoice.mutate(viewDoc.id)}
              disabled={prepareProformaInvoice.isPending}
              title="Open the Commercial Invoice template to prepare the Proforma Invoice"
              data-testid="button-view-create-pi"
            >
              <ArrowRight className="w-3.5 h-3.5 mr-1" />
              {prepareProformaInvoice.isPending ? "Preparing..." : "Create PI"}
            </Button>
          )}
          {viewDoc.docType === "SPA" && (
            <Button size="sm" onClick={() => setAddendumSpaId(viewDoc.id)} data-testid="button-view-create-addendum">
              <ArrowRight className="w-3.5 h-3.5 mr-1" /> Create Addendum
            </Button>
          )}
          {nextTypes.map((next) => (
            <Button
              key={next}
              size="sm"
              onClick={() => next === "PI"
                ? prepareProformaInvoice.mutate(viewDoc.id)
                : createNextDoc.mutate({ id: viewDoc.id, nextDocType: next })}
              disabled={lpgBlocked || createNextDoc.isPending || prepareProformaInvoice.isPending}
              title={lpgBlocked ? "Blocked pending LPG STS clearance" : undefined}
              data-testid={`button-create-next-doc-${next}`}
            >
              <ArrowRight className="w-3.5 h-3.5 mr-1" />
              {next === "PI" && prepareProformaInvoice.isPending
                ? "Preparing..."
                : createNextDoc.isPending
                  ? "Creating..."
                  : next === "PI" ? "Create PI" : `Create ${next}`}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
