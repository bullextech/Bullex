import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, uploadFormData } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Contact as ContactIcon, Plus, Search, Pencil, Trash2, Mail, Phone, Globe,
  MapPin, Building2, Briefcase, Upload, Image as ImageIcon, CreditCard,
} from "lucide-react";
import type { Contact, InsertContact } from "@shared/schema";

const EMPTY_FORM: InsertContact = {
  name: "",
  title: "",
  company: "",
  email: "",
  phone: "",
  additionalEmails: [],
  additionalPhones: [],
  website: "",
  address: "",
  category: "",
  notes: "",
};

export default function Contacts() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<InsertContact>(EMPTY_FORM);
  const [cardFile, setCardFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const set = (k: keyof InsertContact, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  type ArrayKey = "additionalEmails" | "additionalPhones";
  const addItem = (k: ArrayKey) => setForm(prev => ({ ...prev, [k]: [...(prev[k] ?? []), ""] }));
  const setItem = (k: ArrayKey, i: number, v: string) =>
    setForm(prev => ({ ...prev, [k]: (prev[k] ?? []).map((x, idx) => (idx === i ? v : x)) }));
  const removeItem = (k: ArrayKey, i: number) =>
    setForm(prev => ({ ...prev, [k]: (prev[k] ?? []).filter((_, idx) => idx !== i) }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCardFile(null);
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({
      name: c.name ?? "",
      title: c.title ?? "",
      company: c.company ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      additionalEmails: c.additionalEmails ?? [],
      additionalPhones: c.additionalPhones ?? [],
      website: c.website ?? "",
      address: c.address ?? "",
      category: c.category ?? "",
      notes: c.notes ?? "",
    });
    setCardFile(null);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        additionalEmails: (form.additionalEmails ?? []).map(s => s.trim()).filter(Boolean),
        additionalPhones: (form.additionalPhones ?? []).map(s => s.trim()).filter(Boolean),
      };
      let contact: Contact;
      if (editing) {
        const res = await apiRequest("PATCH", `/api/contacts/${editing.id}`, payload);
        contact = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/contacts", payload);
        contact = await res.json();
      }
      // The record is already persisted; treat a card-upload failure as a partial
      // success so the user isn't prompted to re-create (which would duplicate it).
      let cardError: string | null = null;
      if (cardFile) {
        try {
          const fd = new FormData();
          fd.append("card", cardFile);
          await uploadFormData(`/api/contacts/${contact.id}/card`, fd);
        } catch (e: any) {
          cardError = e?.message ?? "Card image upload failed";
        }
      }
      return { contact, cardError };
    },
    onSuccess: ({ cardError }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      if (cardError) {
        toast({
          title: editing ? "Contact saved — card image failed" : "Contact added — card image failed",
          description: cardError,
          variant: "destructive",
        });
      } else {
        toast({ title: editing ? "Contact updated" : "Contact added" });
      }
      setDialogOpen(false);
    },
    onError: (e: any) => {
      toast({ title: "Could not save contact", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact deleted" });
      setDeleteTarget(null);
    },
    onError: (e: any) => {
      toast({ title: "Could not delete contact", description: e.message, variant: "destructive" });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? contacts.filter(c =>
        [c.name, c.company, c.email, c.phone, c.title, c.category,
          ...(c.additionalEmails ?? []), ...(c.additionalPhones ?? [])]
          .filter(Boolean)
          .some(v => v!.toLowerCase().includes(q)))
    : contacts;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-contacts-title">
              <ContactIcon className="w-6 h-6 text-primary" /> Contacts
            </h1>
            <p className="text-sm text-muted-foreground">Visiting cards &amp; business contacts</p>
          </div>
          <Button onClick={openCreate} data-testid="button-add-contact">
            <Plus className="w-4 h-4 mr-1.5" /> Add Contact
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, company, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-contacts"
          />
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm" data-testid="text-contacts-loading">Loading contacts…</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-contacts-empty">
              <ContactIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
              {contacts.length === 0 ? "No contacts yet. Add your first visiting card." : "No contacts match your search."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => (
              <Card key={c.id} className="overflow-hidden" data-testid={`card-contact-${c.id}`}>
                {c.cardImageStoredName && (
                  <img
                    src={`/api/contacts/${c.id}/card`}
                    alt={`${c.name} visiting card`}
                    className="w-full h-32 object-cover border-b"
                    data-testid={`img-contact-card-${c.id}`}
                  />
                )}
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate" data-testid={`text-contact-name-${c.id}`}>{c.name}</p>
                      {c.title && <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><Briefcase className="w-3 h-3" />{c.title}</p>}
                    </div>
                    {c.category && <Badge variant="secondary" className="flex-shrink-0" data-testid={`badge-contact-category-${c.id}`}>{c.category}</Badge>}
                  </div>
                  <div className="space-y-1 text-sm">
                    {c.company && <p className="flex items-center gap-2 text-muted-foreground"><Building2 className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{c.company}</span></p>}
                    {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-primary hover:underline" data-testid={`link-contact-email-${c.id}`}><Mail className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{c.email}</span></a>}
                    {(c.additionalEmails ?? []).map((em, i) => (
                      <a key={`em-${i}`} href={`mailto:${em}`} className="flex items-center gap-2 text-primary hover:underline" data-testid={`link-contact-additional-email-${c.id}-${i}`}><Mail className="w-3.5 h-3.5 flex-shrink-0 opacity-60" /><span className="truncate">{em}</span></a>
                    ))}
                    {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground" data-testid={`link-contact-phone-${c.id}`}><Phone className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{c.phone}</span></a>}
                    {(c.additionalPhones ?? []).map((ph, i) => (
                      <a key={`ph-${i}`} href={`tel:${ph}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground" data-testid={`link-contact-additional-phone-${c.id}-${i}`}><Phone className="w-3.5 h-3.5 flex-shrink-0 opacity-60" /><span className="truncate">{ph}</span></a>
                    ))}
                    {c.website && <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><Globe className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{c.website}</span></a>}
                    {c.address && <p className="flex items-start gap-2 text-muted-foreground"><MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span className="line-clamp-2">{c.address}</span></p>}
                  </div>
                  {c.notes && <p className="text-xs text-muted-foreground border-t pt-2 line-clamp-3">{c.notes}</p>}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(c)} data-testid={`button-edit-contact-${c.id}`}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(c)} data-testid={`button-delete-contact-${c.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Contact" : "Add Contact"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-name">Name *</Label>
                <Input id="c-name" value={form.name} onChange={e => set("name", e.target.value)} required data-testid="input-contact-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-title">Title</Label>
                <Input id="c-title" value={form.title ?? ""} onChange={e => set("title", e.target.value)} data-testid="input-contact-title" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-company">Company</Label>
                <Input id="c-company" value={form.company ?? ""} onChange={e => set("company", e.target.value)} data-testid="input-contact-company" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" value={form.email ?? ""} onChange={e => set("email", e.target.value)} data-testid="input-contact-email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Phone</Label>
                <Input id="c-phone" value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} data-testid="input-contact-phone" />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Additional emails</Label>
                {(form.additionalEmails ?? []).map((val, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      type="email"
                      value={val}
                      onChange={e => setItem("additionalEmails", i, e.target.value)}
                      placeholder="name@example.com"
                      data-testid={`input-contact-additional-email-${i}`}
                    />
                    <Button type="button" variant="outline" size="icon" className="flex-shrink-0 text-destructive hover:text-destructive" onClick={() => removeItem("additionalEmails", i)} data-testid={`button-remove-additional-email-${i}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => addItem("additionalEmails")} data-testid="button-add-additional-email">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add email
                </Button>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Additional phone numbers</Label>
                {(form.additionalPhones ?? []).map((val, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={val}
                      onChange={e => setItem("additionalPhones", i, e.target.value)}
                      placeholder="+971 5x xxx xxxx"
                      data-testid={`input-contact-additional-phone-${i}`}
                    />
                    <Button type="button" variant="outline" size="icon" className="flex-shrink-0 text-destructive hover:text-destructive" onClick={() => removeItem("additionalPhones", i)} data-testid={`button-remove-additional-phone-${i}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => addItem("additionalPhones")} data-testid="button-add-additional-phone">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add phone
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-website">Website</Label>
                <Input id="c-website" value={form.website ?? ""} onChange={e => set("website", e.target.value)} data-testid="input-contact-website" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-category">Category</Label>
                <Input id="c-category" value={form.category ?? ""} onChange={e => set("category", e.target.value)} placeholder="e.g. Supplier, Broker" data-testid="input-contact-category" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-address">Address</Label>
                <Textarea id="c-address" value={form.address ?? ""} onChange={e => set("address", e.target.value)} rows={2} data-testid="input-contact-address" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-notes">Notes</Label>
                <Textarea id="c-notes" value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} rows={2} data-testid="input-contact-notes" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="flex items-center gap-1.5"><CreditCard className="w-4 h-4" /> Visiting Card Image</Label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => setCardFile(e.target.files?.[0] ?? null)} data-testid="input-contact-card-file" />
                <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()} data-testid="button-upload-card">
                  {cardFile ? <><ImageIcon className="w-4 h-4 mr-1.5" />{cardFile.name}</> : <><Upload className="w-4 h-4 mr-1.5" /> Choose image</>}
                </Button>
                {editing?.cardImageStoredName && !cardFile && (
                  <p className="text-xs text-muted-foreground">A card image is already attached. Choose a new image to replace it.</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-contact">
                {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Add Contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleteTarget?.name}{deleteTarget?.company ? ` (${deleteTarget.company})` : ""} and any attached card image.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-contact"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
