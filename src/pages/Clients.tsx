import { useEffect, useRef, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Phone, Mail, MapPin, StickyNote, Trash2, Link2, Copy, RefreshCw, XCircle, Loader2, SendHorizonal } from "lucide-react";
import {
  Customer,
  CustomerHistoryRecord,
  CONTACT_CHANNEL_LABELS,
  LEAD_STATUS_LABELS,
  LeadStatus,
  Case,
  STAGE_LABELS,
  PRIORITY_CONFIG,
  ContactChannel,
  ServiceType,
  SERVICE_LABELS,
  LAWYERS,
  CLIENT_LAWYERS,
  PortalNote,
  PortalMessage,
} from "@/lib/types";
import {
  deleteConfirmedClient,
  getCasesByCustomer,
  getConfirmedClients,
  updateConfirmedClient,
  getCustomerHistory,
  getDocuments,
  uploadDocument,
  deleteDocument,
  fetchDocumentBlob,
  StoredDocument,
  createMeeting,
  generatePortalToken,
  revokePortalToken,
  getPortalNotes,
  addPortalNote,
  deletePortalNote,
  getAdminChat,
  sendAdminMessage,
  markChatRead,
  deletePortalChatMessage,
} from "@/lib/case-store";
import { PortalChatPanel, countTrailingClient } from "@/components/PortalChatPanel";
import { CaseDetail } from "@/components/CaseDetail";
import { mapCaseStateToStage, formatDate, stripProfessionalTitle } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

const UNASSIGNED_CONSULTANT = "__UNASSIGNED__";
const CUSTOMER_TYPES = ["Individual", "Family", "Company"] as const;

const ALLOWED_CUSTOMER_STATUSES: LeadStatus[] = [
  "INTAKE",
  "SEND_PROPOSAL",
  "WAITING_APPROVAL",
  "SEND_CONTRACT",
  "WAITING_ACCEPTANCE",
  "SEND_RESPONSE",
  "CLIENT",
  "ARCHIVED",
  "ON_HOLD",
  "CONSULTATION_SCHEDULED",
];

const statusAccent: Record<string, string> = {
  INTAKE: "bg-slate-100 text-slate-800",
  SEND_PROPOSAL: "bg-blue-100 text-blue-800",
  WAITING_APPROVAL: "bg-amber-100 text-amber-800",
  SEND_CONTRACT: "bg-indigo-100 text-indigo-800",
  WAITING_ACCEPTANCE: "bg-orange-100 text-orange-800",
  SEND_RESPONSE: "bg-emerald-100 text-emerald-800",
  CONFIRMED: "bg-green-100 text-green-800",
  CLIENT: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-gray-100 text-gray-600",
  CONSULTATION_SCHEDULED: "bg-blue-50 text-blue-800",
  CONSULTATION_DONE: "bg-emerald-50 text-emerald-800",
  ON_HOLD: "bg-gray-100 text-gray-800",
};

const ClientsPage = () => {
  const [clients, setClients] = useState<Customer[]>([]);
  const [selectedClient, setSelectedClient] = useState<Customer | null>(null);
  const [selectedCases, setSelectedCases] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [statusHistoryRows, setStatusHistoryRows] = useState<CustomerHistoryRecord[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [clientDocuments, setClientDocuments] = useState<StoredDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<Partial<Customer>>({});
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [isGeneratingPortal, setIsGeneratingPortal] = useState(false);
  const [isRevokingPortal, setIsRevokingPortal] = useState(false);
  const [portalNotes, setPortalNotes] = useState<PortalNote[]>([]);
  const [portalNoteText, setPortalNoteText] = useState("");
  const [isSavingPortalNote, setIsSavingPortalNote] = useState(false);
  // Live chat state
  const [chatMessages, setChatMessages] = useState<PortalMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Consultation scheduling state
  const [showConsultScheduler, setShowConsultScheduler] = useState(false);
  const [pendingSavePayload, setPendingSavePayload] = useState<{ id: string; update: Partial<Customer> } | null>(null);
  const [consultForm, setConsultForm] = useState({ title: 'Consultation', startsAt: '', endsAt: '', notes: '' });

  const isAdmin = user?.role === "admin";
  const serviceEntries = Object.entries(SERVICE_LABELS);
  const channelEntries = Object.entries(CONTACT_CHANNEL_LABELS);
  const statusEntries = Object.entries(LEAD_STATUS_LABELS).filter(([key]) => ALLOWED_CUSTOMER_STATUSES.includes(key as LeadStatus));

  const load = () => getConfirmedClients()
    .then((rows) => setClients(rows.map((row) => ({
      ...row,
      assignedTo: stripProfessionalTitle(row.assignedTo) || row.assignedTo || "",
    }))))
    .catch(() => setClients([]));

  useEffect(() => {
    load();
  }, []);

  const openDetail = async (client: Customer) => {
    setSelectedClient(client);
    setPortalLink(null);
    setPortalNotes([]);
    setChatMessages([]);
    setChatText("");
    setSelectedCases([]);
    const [cases, history, docs] = await Promise.all([
      getCasesByCustomer(client.customerId),
      getCustomerHistory(client.customerId).catch(() => []),
      getDocuments("customer", client.customerId).catch(() => []),
    ]);
    setSelectedCases(cases);
    setStatusHistoryRows(history);
    setClientDocuments(docs);
    // Load portal notes + chat
    try {
      const [notes, msgs] = await Promise.all([
        getPortalNotes(client.customerId),
        getAdminChat(client.customerId).catch(() => [] as PortalMessage[]),
      ]);
      setPortalNotes(notes);
      setChatMessages(msgs);
      // Mark all client messages as read
      markChatRead(client.customerId).catch(() => {});
    } catch {
      setPortalNotes([]);
    }
  };

  const openEdit = (client: Customer) => {
    setForm({
      ...client,
      registeredAt: client.registeredAt || new Date().toISOString(),
      services: client.services || [],
      serviceDescription: client.serviceDescription || "",
      assignedTo: stripProfessionalTitle(client.assignedTo) || client.assignedTo || "",
      followUpDate: client.followUpDate ? String(client.followUpDate).slice(0, 10) : "",
      notes: client.notes ?? "",
    });
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!form.customerId) return;
    const payload: Partial<Customer> = {
      ...form,
      assignedTo: isAdmin
        ? (stripProfessionalTitle(form.assignedTo) || form.assignedTo || "")
        : (stripProfessionalTitle(user?.consultantName || user?.lawyerName || form.assignedTo || "") || form.assignedTo || ""),
      followUpDate: form.status === "ON_HOLD" && form.followUpDate ? new Date(String(form.followUpDate)).toISOString() : null,
      services: form.services || [],
      serviceDescription: form.serviceDescription || "",
      notes: form.notes ?? "",
      contact: form.contact || form.name || "",
    };
    const { customerId, ...withoutId } = payload as Partial<Customer> & { customerId?: string; _id?: unknown };
    const { _id, ...safePayload } = withoutId as typeof withoutId & { _id?: unknown };

    // Intercept CONSULTATION_SCHEDULED to let user schedule a meeting
    if (form.status === 'CONSULTATION_SCHEDULED') {
      setPendingSavePayload({ id: form.customerId, update: safePayload });
      setConsultForm({ title: 'Consultation', startsAt: '', endsAt: '', notes: '' });
      setShowConsultScheduler(true);
      return;
    }

    try {
      await updateConfirmedClient(form.customerId, safePayload);
      setShowEdit(false);
      await load();
      if (selectedClient?.customerId === form.customerId) {
        const updated = await getConfirmedClients().then((rows) => rows.find((x) => x.customerId === form.customerId) || null);
        if (updated) await openDetail(updated);
      }
      toast({ title: "Saved", description: "Confirmed client updated" });
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Unable to update confirmed client", variant: "destructive" });
    }
  };

  const handleConfirmConsultation = async () => {
    if (!pendingSavePayload) return;
    if (!consultForm.startsAt) {
      toast({ title: 'Date required', description: 'Please select the consultation date and time.', variant: 'destructive' });
      return;
    }
    try {
      const assignedTo = stripProfessionalTitle(user?.consultantName || user?.lawyerName || LAWYERS[0]) || LAWYERS[0];
      await Promise.all([
        updateConfirmedClient(pendingSavePayload.id, pendingSavePayload.update),
        createMeeting({
          title: consultForm.title || 'Consultation',
          customerId: pendingSavePayload.id,
          startsAt: new Date(consultForm.startsAt).toISOString(),
          endsAt: consultForm.endsAt ? new Date(consultForm.endsAt).toISOString() : null,
          assignedTo,
          notes: consultForm.notes || '',
          status: 'scheduled',
        }),
      ]);
      toast({ title: 'Consultation scheduled' });
      setShowConsultScheduler(false);
      setPendingSavePayload(null);
      setShowEdit(false);
      await load();
      if (selectedClient?.customerId === pendingSavePayload.id) {
        const updated = await getConfirmedClients().then((rows) => rows.find((x) => x.customerId === pendingSavePayload.id) || null);
        if (updated) await openDetail(updated);
      }
    } catch (err) {
      toast({ title: 'Failed to schedule', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const removeClient = async (customerId: string) => {
    if (!window.confirm("Delete this confirmed client?")) return;
    await deleteConfirmedClient(customerId);
    if (selectedClient?.customerId === customerId) setSelectedClient(null);
    load();
  };

  const handleUploadClientDocument = async (file?: File) => {
    if (!file || !selectedClient) return;
    try {
      setIsUploading(true);
      await uploadDocument("customer", selectedClient.customerId, file);
      const docs = await getDocuments("customer", selectedClient.customerId);
      setClientDocuments(docs);
      toast({ title: "Uploaded", description: "Document uploaded" });
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteClientDocument = async (docId: string) => {
    try {
      setIsUploading(true);
      await deleteDocument(docId);
      setClientDocuments((d) => d.filter((x) => x.docId !== docId));
      toast({ title: "Deleted", description: "Document removed" });
    } catch (err: unknown) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePreviewClientDocument = async (docId: string) => {
    try {
      const { blob } = await fetchDocumentBlob(docId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      toast({ title: "Preview failed", description: err instanceof Error ? err.message : "Unable to preview document", variant: "destructive" });
    }
  };

  const handleDownloadClientDocument = async (docId: string, originalName?: string) => {
    try {
      const { blob, fileName } = await fetchDocumentBlob(docId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName || originalName || "document";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast({ title: "Download failed", description: err instanceof Error ? err.message : "Unable to download document", variant: "destructive" });
    }
  };

  // Only admin and consultants manage confirmed clients
  if (user && user.role !== 'admin' && user.role !== 'consultant') {
    return (
      <MainLayout title="Clients">
        <div className="py-12 text-center text-sm text-muted-foreground">Access restricted. Only client consultants can view confirmed clients.</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Confirmed Clients">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Consultant</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                      No confirmed clients yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow key={client.customerId} className="cursor-pointer" onClick={() => openDetail(client)}>
                      <TableCell className="font-mono text-xs">{client.customerId}</TableCell>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{stripProfessionalTitle(client.assignedTo) || client.assignedTo || "Unassigned"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{CONTACT_CHANNEL_LABELS[client.contactChannel]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{client.services?.length || 0}</TableCell>
                      <TableCell className="text-sm">{client.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{client.email}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusAccent[client.status]}`}>
                          {LEAD_STATUS_LABELS[client.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(client)}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={() => removeClient(client.customerId)}>Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!selectedClient} onOpenChange={(o) => !o && setSelectedClient(null)}>
          <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>Client Details</DialogTitle>
              <DialogDescription>Detailed information, documents, and related cases for the selected client.</DialogDescription>
            </DialogHeader>
            {selectedClient && (
              <>
                <DialogHeader>
                  <DialogTitle>{selectedClient.name}</DialogTitle>
                  <DialogDescription>Confirmed client overview, service details, and case activity.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Link2 className="h-4 w-4" />Client Portal Link</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">Generate a secure read-only link your client can use to view their case status. The link expires in 30 days.</p>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isGeneratingPortal}
                          onClick={async () => {
                            if (!selectedClient) return;
                            setIsGeneratingPortal(true);
                            try {
                              const result = await generatePortalToken(selectedClient.customerId, 30);
                              const base = window.location.href.split('#')[0];
                              const link = `${base}#/portal/${result.token}`;
                              setPortalLink(link);
                            } catch (err) {
                              toast({ title: "Error", description: String(err), variant: "destructive" });
                            } finally { setIsGeneratingPortal(false); }
                          }}
                        >
                          {isGeneratingPortal ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                          {portalLink ? "Regenerate Link" : "Generate Link"}
                        </Button>
                        {portalLink && (
                          <Button
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(portalLink);
                              toast({ title: "Copied!", description: "Portal link copied to clipboard." });
                            }}
                          >
                            <Copy className="h-4 w-4 mr-1" />Copy Link
                          </Button>
                        )}
                        {portalLink && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isRevokingPortal}
                            onClick={async () => {
                              if (!selectedClient) return;
                              if (!window.confirm("Revoke this portal link? The client will no longer be able to access the portal with this link.")) return;
                              setIsRevokingPortal(true);
                              try {
                                await revokePortalToken(selectedClient.customerId);
                                setPortalLink(null);
                                toast({ title: "Link revoked", description: "The portal link has been destroyed." });
                              } catch (err) {
                                toast({ title: "Error", description: String(err), variant: "destructive" });
                              } finally { setIsRevokingPortal(false); }
                            }}
                          >
                            {isRevokingPortal ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                            Revoke Link
                          </Button>
                        )}
                      </div>
                      {portalLink && (
                        <div className="rounded-md bg-muted px-3 py-2 text-xs font-mono break-all select-all">{portalLink}</div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <SendHorizonal className="h-4 w-4" />Live Chat with Client
                        {chatMessages.filter((m) => m.senderType === 'client' && m.readByLawyer === false).length > 0 && (
                          <span className="ml-auto inline-flex items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            {chatMessages.filter((m) => m.senderType === 'client' && m.readByLawyer === false).length} new
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <PortalChatPanel
                        messages={chatMessages}
                        text={chatText}
                        onTextChange={setChatText}
                        onSend={async () => {
                          if (!selectedClient || !chatText.trim() || chatSending) return;
                          setChatSending(true);
                          try {
                            const msg = await sendAdminMessage(selectedClient.customerId, chatText.trim());
                            setChatMessages((prev) => [...prev, msg]);
                            setChatText('');
                          } catch (e) {
                            toast({ title: 'Failed to send', description: String(e), variant: 'destructive' });
                          } finally { setChatSending(false); }
                        }}
                        sending={chatSending}
                        isAdmin
                        onDelete={async (messageId) => {
                          if (!selectedClient) return;
                          await deletePortalChatMessage(selectedClient.customerId, messageId).catch(() => {});
                          setChatMessages((prev) => prev.filter((m) => m.messageId !== messageId));
                        }}
                        trailingClientCount={countTrailingClient(chatMessages)}
                        loading={chatLoading}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Overview</CardTitle></CardHeader>
                    <CardContent className="grid gap-2 text-sm">
                      <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-muted-foreground" />{selectedClient.phone}</div>
                      <div className="flex items-center gap-2"><Mail className="h-3 w-3 text-muted-foreground" />{selectedClient.email}</div>
                      <div className="flex items-center gap-2"><MapPin className="h-3 w-3 text-muted-foreground" />{selectedClient.address}</div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusAccent[selectedClient.status]}`}>
                          {LEAD_STATUS_LABELS[selectedClient.status]}
                        </span>
                        <Badge variant="outline" className="text-xs">{CONTACT_CHANNEL_LABELS[selectedClient.contactChannel]}</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Services</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex flex-wrap gap-2">
                        {selectedClient.services.map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">{SERVICE_LABELS[s]}</Badge>
                        ))}
                      </div>
                      <p className="text-muted-foreground text-sm">{selectedClient.serviceDescription}</p>
                      {selectedClient.notes && (
                        <div className="rounded-md border p-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground mb-1"><StickyNote className="h-3 w-3" />Notes</div>
                          <p>{selectedClient.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Documents</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          disabled={!selectedClient || isUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUploadClientDocument(f);
                            e.currentTarget.value = "";
                          }}
                        />
                        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={!selectedClient || isUploading}>
                          {isUploading ? "Uploading..." : "Upload"}
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {clientDocuments.length === 0 && (<div className="text-xs text-muted-foreground">No documents</div>)}
                        {clientDocuments.map((d) => (
                          <div key={d.docId} className="flex items-center justify-between gap-2 text-sm rounded-md border p-2">
                            <div className="truncate" title={d.originalName || d.filename}>{d.originalName || d.filename}</div>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => handlePreviewClientDocument(d.docId)}>Preview</Button>
                              <Button variant="outline" size="sm" onClick={() => handleDownloadClientDocument(d.docId, d.originalName || d.filename)}>Download</Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteClientDocument(d.docId)} className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {statusHistoryRows.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Status History</CardTitle></CardHeader>
                      <CardContent className="space-y-2 text-xs">
                        {[...statusHistoryRows].reverse().map((row, idx) => (
                          <div key={`${row.historyId || idx}`} className="flex items-start justify-between gap-3 rounded-md border p-2">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${statusAccent[row.statusTo] || "bg-muted text-foreground"}`}>
                                {LEAD_STATUS_LABELS[row.statusTo as LeadStatus] || row.statusTo}
                              </span>
                              <span className="text-muted-foreground">from {LEAD_STATUS_LABELS[row.statusFrom as LeadStatus] || row.statusFrom}</span>
                            </div>
                            <div className="text-right text-muted-foreground">
                              <div>{formatDate(row.date, true)}</div>
                              <div>{stripProfessionalTitle(row.changedByConsultant || row.changedByLawyer || row.changedBy || "") || row.changedBy || "System"}</div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Cases ({selectedCases.length})</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Case ID</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Priority</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedCases.length === 0 && (
                            <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">No cases found.</TableCell></TableRow>
                          )}
                          {selectedCases.map((sc) => {
                            const pCfg = PRIORITY_CONFIG[sc.priority];
                            return (
                              <TableRow
                                key={sc.caseId}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => setSelectedCaseId(sc.caseId)}
                              >
                                <TableCell className="font-mono text-xs">{sc.caseId}</TableCell>
                                <TableCell className="text-sm">{sc.category} / {sc.subcategory}</TableCell>
                                <TableCell><Badge className="text-xs">{STAGE_LABELS[mapCaseStateToStage(sc.state)]}</Badge></TableCell>
                                <TableCell><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pCfg.color}`}>{pCfg.label}</span></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Confirmed Client</DialogTitle>
              <DialogDescription>Update confirmed client profile fields and workflow status.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Contact Type</Label>
                <Select value={form.customerType || "Individual"} onValueChange={(v) => setForm({ ...form, customerType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Registered At</Label>
                <Input
                  type="date"
                  value={String(form.registeredAt || new Date().toISOString()).slice(0, 10)}
                  onChange={(e) => setForm({ ...form, registeredAt: new Date(e.target.value).toISOString() })}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Channel</Label>
                <Select value={(form.contactChannel as ContactChannel) || "email"} onValueChange={(v) => setForm({ ...form, contactChannel: v as ContactChannel })}>
                  <SelectTrigger><SelectValue placeholder="Channel" /></SelectTrigger>
                  <SelectContent>
                    {channelEntries.map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigned Consultant</Label>
                {isAdmin ? (
                  <Select value={form.assignedTo || UNASSIGNED_CONSULTANT} onValueChange={(v) => setForm({ ...form, assignedTo: v === UNASSIGNED_CONSULTANT ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_CONSULTANT}>Unassigned</SelectItem>
                      {CLIENT_LAWYERS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={stripProfessionalTitle(user?.consultantName || user?.lawyerName || form.assignedTo || "") || form.assignedTo || "My clients"} disabled />
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Status</Label>
                <Select value={(form.status as LeadStatus) || "CLIENT"} onValueChange={(v) => setForm({ ...form, status: v as LeadStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusEntries.map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.status === "ON_HOLD" && (
                <div className="space-y-2 md:col-span-2">
                  <Label>Follow Up Date</Label>
                  <Input type="date" value={(form.followUpDate as string) || ""} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
                </div>
              )}
              <div className="md:col-span-2 space-y-2">
                <Label>Services</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {serviceEntries.map(([key, label]) => {
                    const checked = (form.services || []).includes(key as ServiceType);
                    return (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const on = Boolean(v);
                            setForm({
                              ...form,
                              services: on
                                ? [...(form.services || []), key as ServiceType]
                                : (form.services || []).filter((s) => s !== key),
                            });
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Service Description</Label>
                <Textarea value={form.serviceDescription || ""} onChange={(e) => setForm({ ...form, serviceDescription: e.target.value })} />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button onClick={saveEdit}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Consultation scheduling dialog */}
        <Dialog open={showConsultScheduler} onOpenChange={(o) => { if (!o) { setShowConsultScheduler(false); setPendingSavePayload(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Consultation</DialogTitle>
              <DialogDescription>Set the date and time for this consultation meeting.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={consultForm.title} onChange={(e) => setConsultForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start Date &amp; Time <span className="text-destructive">*</span></Label>
                  <Input type="datetime-local" value={consultForm.startsAt} onChange={(e) => setConsultForm((f) => ({ ...f, startsAt: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>End Date &amp; Time</Label>
                  <Input type="datetime-local" value={consultForm.endsAt} onChange={(e) => setConsultForm((f) => ({ ...f, endsAt: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={consultForm.notes} onChange={(e) => setConsultForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setShowConsultScheduler(false); setPendingSavePayload(null); }}>Cancel</Button>
                <Button onClick={handleConfirmConsultation}>Schedule</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <CaseDetail
        caseId={selectedCaseId}
        open={!!selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
        onStateChanged={() => {
          if (selectedClient) openDetail(selectedClient);
        }}
      />
    </MainLayout>
  );
};

export default ClientsPage;
