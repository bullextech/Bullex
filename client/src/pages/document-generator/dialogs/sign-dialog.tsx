import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileSignature } from "lucide-react";
import SignaturePad from "@/components/signature-pad";
import { useDocGen } from "../use-doc-gen";

export default function SignDialog() {
  const {
    signParty,
    setSignParty,
    signDocId,
    setSignDocId,
    signerName,
    setSignerName,
    signDoc,
    handleSignature,
    docs,
    lpgReviewByDocId,
  } = useDocGen();
  const signDocRecord = docs?.find(d => d.id === signDocId);
  const lpgBlocked = !!signDocRecord
    && lpgReviewByDocId.get(signDocRecord.id)?.data?.required === true
    && lpgReviewByDocId.get(signDocRecord.id)?.data?.cleared !== true;

  return (
    <Dialog open={!!signParty && !!signDocId} onOpenChange={(open) => { if (!open) { setSignParty(null); setSignDocId(null); setSignerName(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-sign-dialog-title">
              <FileSignature className="w-5 h-5 text-primary" />
              {(() => {
                const doc = docs?.find(d => d.id === signDocId);
                if (doc?.docType === "NCNDA") {
                  return signParty === "seller" ? "Sign as Party A (Issuer)" : "Sign as Party B (Receiving Party)";
                }
                if (doc?.docType === "FCO" || doc?.docType === "PI") return "Sign as Seller / Issuer";
                return signParty === "buyer" ? "Sign as Buyer" : "Sign as Seller";
              })()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {lpgBlocked && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert" data-testid="sign-lpg-sts-blocked">
                Signing is blocked until an administrator clears every LPG STS review point for this exact content.
              </div>
            )}
            <div className="space-y-2">
              <Label>Full Name of Signatory</Label>
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your full name"
                data-testid="input-signer-name"
              />
            </div>
            {!lpgBlocked && <div>
              <Label className="mb-2 block">Draw Your Signature</Label>
              <SignaturePad
                onSave={handleSignature}
                onCancel={() => { setSignParty(null); setSignDocId(null); setSignerName(""); }}
              />
            </div>}
            {signDoc.isPending && (
              <p className="text-sm text-center text-muted-foreground">Applying signature and regenerating documents...</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
  );
}
