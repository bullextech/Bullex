import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileCheck } from "lucide-react";
import { useDocGen } from "../use-doc-gen";
import ViewDocMeta from "./view-doc-meta";
import ViewDocDownloads from "./view-doc-downloads";
import ViewAdminReview from "./view-admin-review";
import ViewAmendmentReview from "./view-amendment-review";
import ViewSignatures from "./view-signatures";
import ViewPdfFinalize from "./view-pdf-finalize";
import ViewResponsePrompts from "./view-response-prompts";
import ViewNextDoc from "./view-next-doc";
import ViewDocRefs from "./view-doc-refs";
import ViewFooterActions from "./view-footer-actions";
import ViewLpgStsReview from "./view-lpg-sts-review";

export default function ViewDialog() {
  const { viewDoc, setViewDoc } = useDocGen();

  return (
    <Dialog open={!!viewDoc} onOpenChange={(open) => !open && setViewDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-view-doc-title">
              <FileCheck className="w-5 h-5 text-primary" />
              {viewDoc?.title}
            </DialogTitle>
          </DialogHeader>
          {viewDoc && (
            <div className="space-y-4">
              <ViewDocMeta />
              <ViewDocDownloads />
              <ViewAdminReview />
              <ViewLpgStsReview />
              <ViewAmendmentReview />
              <ViewSignatures />
              <ViewPdfFinalize />
              <ViewResponsePrompts />
              <ViewNextDoc />
              <ViewDocRefs />
              <ViewFooterActions />
            </div>
          )}
        </DialogContent>
      </Dialog>
  );
}
