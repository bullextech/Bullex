import { useState } from "react";
import { useQuery,useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import {
Dialog,
DialogContent,
DialogHeader,
DialogTitle,
} from "@/components/ui/dialog";
import {
Trash2,ImageUp,
Loader2
} from "lucide-react";
import { apiRequest,queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LogoMeta {
  originalName: string;
  contentType: string;
  uploadedAt: string;
}

function LogoSlot({ slot, title, hint }: { slot: "primary" | "secondary" | "letterhead"; title: string; hint: string }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(0);

  const { data, isLoading } = useQuery<{ logo: LogoMeta | null }>({
    queryKey: ["/api/settings/logo", slot],
  });
  const logo = data?.logo ?? null;

  const handleUpload = async (file: File) => {
    const ext = file.name.toLowerCase().match(/\.(png|jpg|jpeg)$/);
    if (!ext) {
      toast({ title: "Unsupported file", description: "Logo must be a PNG or JPG image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 5MB. Try a smaller image.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/settings/logo/${slot}`, { method: "POST", body: formData, credentials: "include", signal: controller.signal });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Your admin session has expired. Open the app in a full browser tab, sign in again, then retry.");
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Upload failed");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/settings/logo", slot] });
      setPreview(Date.now());
      toast({ title: `${title} updated`, description: "It will now appear on every generated document." });
    } catch (e: any) {
      const description = e?.name === "AbortError"
        ? "Upload timed out. Open the app in a full browser tab (not the embedded preview), check your connection, and try again."
        : (e?.message || "Something went wrong uploading the logo. Please try again.");
      toast({ title: "Upload failed", description, variant: "destructive" });
    } finally {
      clearTimeout(timeout);
      setUploading(false);
    }
  };

  const removeMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/settings/logo/${slot}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/settings/logo", slot] });
      toast({ title: `${title} removed`, description: "It will no longer appear on generated documents." });
    },
    onError: (e: any) => toast({ title: "Could not remove logo", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium" data-testid={`text-logo-title-${slot}`}>{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <div className="flex items-center justify-center rounded-md border bg-muted/30 p-4 min-h-[100px]">
        {isLoading ? (
          <Skeleton className="h-14 w-32" />
        ) : logo ? (
          <img
            src={`/api/branding/logo/${slot}?t=${preview}`}
            alt={`Current ${title}`}
            className="max-h-20 max-w-full object-contain"
            data-testid={`img-current-logo-${slot}`}
          />
        ) : (
          <span className="text-sm text-muted-foreground" data-testid={`text-no-logo-${slot}`}>No logo set</span>
        )}
      </div>

      {logo && (
        <p className="text-xs text-muted-foreground truncate" data-testid={`text-logo-filename-${slot}`}>
          {logo.originalName}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <label className="inline-flex">
          <input
            type="file"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
            data-testid={`input-logo-file-${slot}`}
          />
          <Button asChild size="sm" disabled={uploading}>
            <span className="gap-2 cursor-pointer inline-flex items-center">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageUp className="w-4 h-4" />}
              {logo ? "Replace" : "Upload"}
            </span>
          </Button>
        </label>
        {logo && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={removeMutation.isPending}
            onClick={() => removeMutation.mutate()}
            data-testid={`button-remove-logo-${slot}`}
          >
            <Trash2 className="w-4 h-4" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export default function LogoManager() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
        data-testid="button-manage-logo"
      >
        <ImageUp className="w-4 h-4" />
        Document Logos
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Document Logos</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Brand every generated document (PDF & DOCX). PNG or JPG, up to 5MB each.
          </p>
          <LogoSlot
            slot="letterhead"
            title="Bullfrog letterhead (full page)"
            hint="A full A4 stationery design drawn behind the text on every page. When set, it replaces the Bullfrog header logo below. Use a portrait A4 image (e.g. 794×1123px or larger) and keep the centre clear for the document text."
          />
          <div className="border-t" />
          <LogoSlot slot="secondary" title="Bullfrog logo (header)" hint="Shown at the top of every page — used only when no full-page letterhead is set." />
          <div className="border-t" />
          <LogoSlot slot="primary" title="Bullex logo (footer)" hint="Shown at the bottom of every page." />
        </div>
      </DialogContent>
    </Dialog>
  );
}
