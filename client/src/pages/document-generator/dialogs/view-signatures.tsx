import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { X, FileSignature } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function ViewSignatures() {
  const { viewDoc, removeSignature, openSignDialog, isAdmin, lpgReviewByDocId } = useDocGen();
  if (!viewDoc) return null;
  const isNcnda = viewDoc.docType === "NCNDA";
  const isAddendum = viewDoc.docType === "ADDENDUM";
  const isTwoParty = isNcnda || isAddendum;
  const primaryParty: "seller" | "buyer" = isTwoParty ? "seller" : "buyer";
  const primaryLabel = isNcnda
    ? "Party A (Issuer)"
    : isAddendum
      ? "Seller"
      : viewDoc.docType === "FCO" || viewDoc.docType === "PI"
        ? "Seller / Issuer Signature"
        : "Buyer / Issuer Signature";
  const primaryActionLabel = isNcnda
    ? "Sign as Party A (Issuer)"
    : isAddendum
      ? "Sign as Seller"
      : viewDoc.docType === "FCO" || viewDoc.docType === "PI"
        ? "Sign as Seller / Issuer"
        : "Sign as Buyer";
  const primarySignature = primaryParty === "seller" ? viewDoc.sellerSignature : viewDoc.buyerSignature;
  const primaryName = primaryParty === "seller" ? viewDoc.sellerSignedName : viewDoc.buyerSignedName;
  const primaryDate = primaryParty === "seller" ? viewDoc.sellerSignedAt : viewDoc.buyerSignedAt;
  const canManageSignature = viewDoc.docType !== "PI"
    || (isAdmin && viewDoc.status === "draft" && !primarySignature);
  const lpgBlocked = lpgReviewByDocId.get(viewDoc.id)?.data?.required === true
    && lpgReviewByDocId.get(viewDoc.id)?.data?.cleared !== true;

  return (
    <div className="border-t pt-4">
      <Label className="text-sm font-semibold flex items-center gap-1.5 mb-3">
        <FileSignature className="w-4 h-4" />
        Digital Signatures
      </Label>
      <div className={`grid gap-4 ${isTwoParty ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        <div className="border rounded-lg p-3 space-y-2" data-testid="section-seller-signature">
          <p className="text-xs font-semibold text-muted-foreground uppercase">{primaryLabel}</p>
          {primarySignature ? (
            <div className="space-y-1.5">
              <div className="bg-white border rounded p-2 flex justify-center">
                <img src={primarySignature} alt={`${primaryLabel} signature`} className="max-h-16 object-contain" data-testid={primaryParty === "seller" ? "img-seller-signature" : "img-buyer-signature"} />
              </div>
              <p className="text-xs text-muted-foreground" data-testid={primaryParty === "seller" ? "text-seller-signed-name" : "text-buyer-signed-name"}>
                Signed by: <span className="font-medium text-foreground">{primaryName}</span>
              </p>
              {primaryDate && (
                <p className="text-xs text-muted-foreground">
                  Date: {new Date(primaryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[10px]">Signed</Badge>
                {canManageSignature && (
                  <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-destructive" onClick={() => { if (confirm(`Remove ${primaryLabel} signature?`)) removeSignature.mutate({ id: viewDoc.id, party: primaryParty }); }} data-testid="button-remove-partya-sig">
                    <X className="w-3 h-3 mr-0.5" />Remove
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-muted/50 border border-dashed rounded p-4 flex items-center justify-center min-h-[60px]">
                <p className="text-xs text-muted-foreground">{lpgBlocked ? "Blocked pending LPG STS clearance" : viewDoc.status === "pending_review" ? "Awaiting admin approval" : "Not yet signed"}</p>
              </div>
              {viewDoc.status !== "pending_review" && canManageSignature && !lpgBlocked && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => openSignDialog(viewDoc.id, primaryParty)} data-testid="button-sign-partya">
                  <FileSignature className="w-3.5 h-3.5 mr-1.5" />
                  {primaryActionLabel}
                </Button>
              )}
            </div>
          )}
        </div>

        {isTwoParty && (
          <div className="border rounded-lg p-3 space-y-2" data-testid="section-partyb-signature">
            <p className="text-xs font-semibold text-muted-foreground uppercase">{isNcnda ? "Party B (Receiving Party)" : "Buyer"}</p>
            {viewDoc.buyerSignature ? (
              <div className="space-y-1.5">
                <div className="bg-white border rounded p-2 flex justify-center">
                  <img src={viewDoc.buyerSignature} alt="Party B Signature" className="max-h-16 object-contain" data-testid="img-partyb-signature" />
                </div>
                <p className="text-xs text-muted-foreground" data-testid="text-partyb-signed-name">
                  Signed by: <span className="font-medium text-foreground">{viewDoc.buyerSignedName}</span>
                </p>
                {viewDoc.buyerSignedAt && (
                  <p className="text-xs text-muted-foreground">
                    Date: {new Date(viewDoc.buyerSignedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[10px]">Signed</Badge>
                  <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-destructive" onClick={() => { if (confirm(`Remove ${isNcnda ? "Party B" : "Buyer"} signature?`)) removeSignature.mutate({ id: viewDoc.id, party: "buyer" }); }} data-testid="button-remove-partyb-sig">
                    <X className="w-3 h-3 mr-0.5" />Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="bg-muted/50 border border-dashed rounded p-4 flex items-center justify-center min-h-[60px]">
                  <p className="text-xs text-muted-foreground">
                    {lpgBlocked
                      ? "Blocked pending LPG STS clearance"
                      : viewDoc.status === "pending_review"
                      ? "Awaiting admin approval"
                      : isAddendum
                        ? "Required before finalizing or sending"
                        : "Optional — sign after receipt"}
                  </p>
                </div>
                {viewDoc.status !== "pending_review" && !lpgBlocked && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => openSignDialog(viewDoc.id, "buyer")} data-testid="button-sign-partyb">
                    <FileSignature className="w-3.5 h-3.5 mr-1.5" />
                    {isNcnda ? "Sign as Party B" : "Sign as Buyer"}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
