import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Video, Copy, Check, ExternalLink, Loader2, Mail, MessageSquarePlus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { KycApplication } from "@shared/schema";
import { sortClientDetails } from "@shared/client-sorting";

export interface InstantMeetingResult {
  meetUrl: string;
  eventId: string;
  start: string;
  end: string;
  htmlLink?: string;
}

interface InstantMeetingButtonProps {
  label?: string;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  iconOnly?: boolean;
  title?: string;
  /** When provided, an "Insert into message" action appears in the dialog so the
   *  link can be dropped straight into the chat composer. */
  onCreated?: (result: InstantMeetingResult) => void;
}

export function InstantMeetingButton({
  label = "Instant Meeting",
  className,
  variant = "default",
  size = "sm",
  iconOnly = false,
  title,
  onCreated,
}: InstantMeetingButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [meeting, setMeeting] = useState<InstantMeetingResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [emailTo, setEmailTo] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: kycClients } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
    enabled: open,
  });
  const approvedClients = sortClientDetails(
    (kycClients || []).filter((k) => k.status === "approved" && k.contactEmail),
  );

  const create = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/meet/instant", title ? { title } : undefined);
      const data: InstantMeetingResult = await res.json();
      setMeeting(data);
      setEmailTo("");
      setRecipientName("");
      setNote("");
      setSent(false);
      setOpen(true);
    } catch (err: any) {
      toast({
        title: "Could not create meeting",
        description: err?.message?.replace(/^\d+:\s*/, "") || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!meeting) return;
    try {
      await navigator.clipboard.writeText(meeting.meetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Copy the link manually.", variant: "destructive" });
    }
  };

  const pickClient = (id: string) => {
    const kyc = approvedClients.find((k) => k.id === id);
    if (kyc) {
      setEmailTo(kyc.contactEmail || "");
      setRecipientName(kyc.companyName || "");
    }
  };

  const sendByEmail = async () => {
    if (!meeting) return;
    const to = emailTo.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast({ title: "Invalid email", description: "Enter a valid recipient email.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await apiRequest("POST", "/api/meet/email", {
        to,
        meetUrl: meeting.meetUrl,
        recipientName: recipientName.trim() || undefined,
        note: note.trim() || undefined,
      });
      setSent(true);
      toast({ title: "Invitation sent", description: `Meeting link emailed to ${to}.` });
    } catch (err: any) {
      toast({
        title: "Could not send email",
        description: err?.message?.replace(/^\d+:\s*/, "") || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const insertIntoChat = () => {
    if (!meeting || !onCreated) return;
    onCreated(meeting);
    setOpen(false);
    toast({ title: "Meeting link added", description: "Google Meet link added to your message." });
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={create}
        disabled={loading}
        data-testid="button-instant-meeting"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Video className="w-3.5 h-3.5" />
        )}
        {!iconOnly && size !== "icon" && <span className="ml-1.5">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="dialog-instant-meeting" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Google Meet ready</DialogTitle>
            <DialogDescription>
              Share this link with your client or counterparty. Anyone with the link can join.
            </DialogDescription>
          </DialogHeader>
          {meeting && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={meeting.meetUrl}
                  className="flex-1 font-mono text-xs"
                  data-testid="input-meet-link"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyLink}
                  data-testid="button-copy-meet-link"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild className="flex-1" data-testid="button-join-meet">
                  <a href={meeting.meetUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1.5" />
                    Join meeting
                  </a>
                </Button>
                {onCreated && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={insertIntoChat}
                    data-testid="button-insert-meet-chat"
                  >
                    <MessageSquarePlus className="w-4 h-4 mr-1.5" />
                    Add to message
                  </Button>
                )}
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="w-4 h-4 text-primary" />
                  Send link by email to a client
                </div>

                {approvedClients.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Pick an approved client (optional)</Label>
                    <Select onValueChange={pickClient}>
                      <SelectTrigger className="h-9" data-testid="select-meet-client">
                        <SelectValue placeholder="Select a client…" />
                      </SelectTrigger>
                      <SelectContent>
                        {approvedClients.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Recipient email</Label>
                    <Input
                      type="email"
                      placeholder="client@example.com"
                      value={emailTo}
                      onChange={(e) => { setEmailTo(e.target.value); setSent(false); }}
                      data-testid="input-meet-email"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Recipient name (optional)</Label>
                    <Input
                      placeholder="Acme Trading Ltd"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      data-testid="input-meet-recipient-name"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Message (optional)</Label>
                  <Textarea
                    placeholder="Add a short note for the invitation…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    data-testid="textarea-meet-note"
                  />
                </div>

                <Button
                  type="button"
                  className="w-full"
                  onClick={sendByEmail}
                  disabled={sending || !emailTo.trim()}
                  data-testid="button-send-meet-email"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : sent ? (
                    <Check className="w-4 h-4 mr-1.5 text-green-600" />
                  ) : (
                    <Mail className="w-4 h-4 mr-1.5" />
                  )}
                  {sent ? "Sent — send another?" : "Send invitation"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
