import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Save, X, AlertCircle } from "lucide-react";
import { docTypes } from "../doc-types";
import { useDocGen } from "../use-doc-gen";

export default function EditDialog() {
  const {
    editDoc,
    setEditDoc,
    editTitle,
    setEditTitle,
    editContent,
    setEditContent,
    editStatus,
    setEditStatus,
    amendReason,
    setAmendReason,
    isTeam,
    updateDoc,
    requestAmendment,
    handleSaveAmend,
  } = useDocGen();

  return (
    <Dialog open={!!editDoc} onOpenChange={(open) => !open && setEditDoc(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-edit-doc-heading">
              <Pencil className="w-5 h-5 text-primary" />
              Amend Document
            </DialogTitle>
          </DialogHeader>
          {editDoc && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Document Type</Label>
                  <p className="text-sm font-medium">{docTypes.find(d => d.value === editDoc.docType)?.label || editDoc.docType}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Trade Reference</Label>
                  <p className="text-sm">{editDoc.tradeRef || "Standalone"}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  data-testid="input-edit-doc-title"
                />
              </div>
              {!isTeam && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger data-testid="select-edit-doc-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="final">Final</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Enter document content..."
                  className="font-mono text-sm min-h-[55vh] leading-relaxed"
                  data-testid="textarea-edit-doc-content"
                />
              </div>
              {isTeam && (
                <div className="space-y-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                    <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                      Your changes will be submitted for admin approval before they take effect.
                    </p>
                  </div>
                  <Label className="text-xs text-amber-800 dark:text-amber-300">Reason for amendment (optional)</Label>
                  <Textarea
                    value={amendReason}
                    onChange={(e) => setAmendReason(e.target.value)}
                    placeholder="Briefly explain what changed and why..."
                    rows={2}
                    className="text-xs resize-none border-amber-200 dark:border-amber-800"
                    data-testid="textarea-amend-reason"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditDoc(null)} data-testid="button-cancel-edit">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button onClick={handleSaveAmend} disabled={updateDoc.isPending || requestAmendment.isPending} data-testid="button-save-amend">
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {isTeam
                    ? (requestAmendment.isPending ? "Submitting..." : "Submit for Approval")
                    : (updateDoc.isPending ? "Saving..." : "Save Changes")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
  );
}
