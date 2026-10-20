import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

import {
Dialog,
DialogContent,
DialogHeader,
DialogTitle,
} from "@/components/ui/dialog";
import {
Eye,
Pencil,Download
} from "lucide-react";
import { lazy,Suspense,type ComponentType } from "react";
import { useDocGen } from "./use-doc-gen";

const DealRecapForm = lazy(() => import("./forms/deal-recap-form"));
const LoiForm = lazy(() => import("./forms/loi-form"));
const NcndaForm = lazy(() => import("./forms/ncnda-form"));
const BlForm = lazy(() => import("./forms/bl-form"));
const CooForm = lazy(() => import("./forms/coo-form"));
const CoaForm = lazy(() => import("./forms/coa-form"));
const CowForm = lazy(() => import("./forms/cow-form"));
const CiForm = lazy(() => import("./forms/ci-form"));
const PbgForm = lazy(() => import("./forms/pbg-form"));
const DlcForm = lazy(() => import("./forms/dlc-form"));
const FobForm = lazy(() => import("./forms/fob-form"));
const TfrForm = lazy(() => import("./forms/tfr-form"));
const GenericForm = lazy(() => import("./forms/generic-form"));

const formByType: Record<string, ComponentType> = {
  DEAL_RECAP: DealRecapForm,
  LOI: LoiForm,
  NCNDA: NcndaForm,
  BL: BlForm,
  COO: CooForm,
  COA: CoaForm,
  COW: CowForm,
  CI: CiForm,
  PBG_MT760: PbgForm,
  DLC_MT700: DlcForm,
  FOB_PROCEDURE: FobForm,
  TFR: TfrForm,
};

export default function GenerateDialog() {
  const {
    selectedType,
    reviewContent,
    setReviewContent,
    originalReviewContent,
    setOriginalReviewContent,
    isEditingReview,
    setIsEditingReview,
    resetForm,
    generateDoc,
    handleGenerate,
    piPreparationParentId,
    piPreparation,
    setPiPreparationParentId,
    setPiPreparation,
    setPiPreviewToken,
    createPreparedProformaInvoice,
    handleCreatePreparedProformaInvoice,
  } = useDocGen();
  const isProformaMode = !!piPreparationParentId;
  const close = () => {
    resetForm();
    setPiPreparationParentId(null);
    setPiPreparation(null);
    setPiPreviewToken(null);
  };

  return (
    <>
      <Dialog open={!!selectedType} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className={reviewContent ? "max-w-3xl max-h-[90vh] overflow-y-auto" : (selectedType?.value === "DEAL_RECAP" || selectedType?.value === "LOI" || selectedType?.value === "NCNDA" || selectedType?.value === "BL" || selectedType?.value === "COO" || selectedType?.value === "COA" || selectedType?.value === "COW" || selectedType?.value === "TFR" || selectedType?.value === "FOB_PROCEDURE" || selectedType?.value === "DLC_MT700" || selectedType?.value === "PBG_MT760") ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-lg max-h-[85vh] overflow-y-auto"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-generate-dialog-title">
              {selectedType && (() => { const Icon = selectedType.icon; return <Icon className="w-5 h-5 text-primary" />; })()}
              {isProformaMode
                ? reviewContent ? "Review Proforma Invoice" : "Prepare Proforma Invoice in Commercial Invoice"
                : reviewContent ? `Review ${selectedType?.short}` : `Generate ${selectedType?.short}`}
            </DialogTitle>
          </DialogHeader>
          {selectedType && reviewContent && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Eye className="w-4 h-4" />
                  {isProformaMode
                    ? "Review the PI generated from the Commercial Invoice fields before creating it."
                    : isEditingReview
                    ? "Edit the document text below to fix any mistakes or alignment, then generate."
                    : "Review the document below. You can edit the text to fix mistakes or alignment before generating."}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {reviewContent !== originalReviewContent && (
                    <Badge variant="secondary" data-testid="badge-review-edited">Edited</Badge>
                  )}
                  {!isProformaMode && <Button
                    variant={isEditingReview ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setIsEditingReview(v => !v)}
                    data-testid="button-toggle-edit-review"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    {isEditingReview ? "Done Editing" : "Edit Content"}
                  </Button>}
                </div>
              </div>
              {isEditingReview ? (
                <Textarea
                  value={reviewContent}
                  onChange={(e) => setReviewContent(e.target.value)}
                  className="min-h-[60vh] text-sm font-mono leading-relaxed"
                  data-testid="textarea-review-content"
                />
              ) : (
                <div className="p-4 rounded-lg border bg-muted/30 whitespace-pre-wrap text-sm font-mono leading-relaxed max-h-[60vh] overflow-y-auto" data-testid="text-review-content">
                  {reviewContent}
                </div>
              )}
              <div className="flex justify-between gap-2 pt-2">
                {reviewContent !== originalReviewContent ? (
                  <Button variant="ghost" onClick={() => { setReviewContent(originalReviewContent); }} data-testid="button-revert-review">
                    Revert changes
                  </Button>
                ) : <span />}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => {
                    setReviewContent(null);
                    setOriginalReviewContent(null);
                    setIsEditingReview(false);
                    if (isProformaMode) setPiPreviewToken(null);
                  }} data-testid="button-back-to-edit">
                    Back to Form
                  </Button>
                  <Button
                    onClick={isProformaMode ? handleCreatePreparedProformaInvoice : handleGenerate}
                    disabled={isProformaMode
                      ? createPreparedProformaInvoice.isPending
                      : generateDoc.isPending}
                    data-testid="button-confirm-generate"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    {isProformaMode
                      ? createPreparedProformaInvoice.isPending
                        ? "Creating PI..."
                        : "Create Proforma Invoice"
                      : generateDoc.isPending ? "Generating..." : "Generate DOCX"}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {selectedType && !reviewContent && (() => {
            const FormComponent = formByType[selectedType.value] ?? GenericForm;
            return (
              <Suspense fallback={null}>
                <FormComponent />
              </Suspense>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
