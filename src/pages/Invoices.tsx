import { useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createInvoice, deleteInvoice, getConfirmedClients, getInvoices, updateInvoice, recordInvoicePayment, deleteInvoicePayment } from "@/lib/case-store";
import { Invoice, InvoiceStatus, InvoicePayment } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/utils";
import { Plus, Trash2, Pencil, X, Check, Download, CreditCard, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "crypto", label: "Crypto" },
  { value: "other", label: "Other" },
];

type FormState = {
  customerId: string;
  caseId: string;
  description: string;
  amount: string;
  currency: string;
  status: InvoiceStatus;
  dueDate: string;
};

const emptyForm: FormState = {
  customerId: "",
  caseId: "",
  description: "",
  amount: "",
  currency: "EUR",
  status: "pending",
  dueDate: "",
};

export default function InvoicesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(new Set());

  // Payment modal state
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "bank_transfer", note: "" });
  const [paymentLoading, setPaymentLoading] = useState(false);

  const load = async () => {
    const [invs, clients] = await Promise.all([getInvoices(), getConfirmedClients()]);
    setInvoices(invs);
    const map: Record<string, string> = {};
    clients.forEach((c) => { map[c.customerId] = c.name; });
    setClientNames(map);
  };

  useEffect(() => { load().catch(() => {}); }, []);

  const handleSave = async () => {
    if (!form.customerId) { toast({ title: "Customer required", variant: "destructive" }); return; }
    if (!form.description.trim()) { toast({ title: "Description required", description: "Please enter a description for this invoice.", variant: "destructive" }); return; }
    const parsedAmount = parseFloat(form.amount);
    if (!form.amount || isNaN(parsedAmount) || parsedAmount <= 0) { toast({ title: "Amount required", description: "Please enter a valid amount greater than 0.", variant: "destructive" }); return; }
    try {
      const payload = {
        customerId: form.customerId,
        caseId: form.caseId || null,
        description: form.description,
        amount: parseFloat(form.amount) || 0,
        currency: form.currency,
        status: form.status,
        dueDate: form.dueDate || null,
      };
      if (editingId) {
        await updateInvoice(editingId, payload);
        toast({ title: "Invoice updated" });
      } else {
        await createInvoice(payload as never);
        toast({ title: "Invoice created" });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  const handleEdit = (inv: Invoice) => {
    setForm({
      customerId: inv.customerId,
      caseId: inv.caseId || "",
      description: inv.description,
      amount: String(inv.amount),
      currency: inv.currency,
      status: inv.status,
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : "",
    });
    setEditingId(inv.invoiceId);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this invoice?")) return;
    try {
      await deleteInvoice(id);
      toast({ title: "Invoice deleted" });
      await load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  const handleStatusChange = async (id: string, status: InvoiceStatus) => {
    try {
      await updateInvoice(id, { status });
      await load();
    } catch { /* ignore */ }
  };

  const handleRecordPayment = async () => {
    if (!paymentInvoice) return;
    const amt = parseFloat(paymentForm.amount);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    setPaymentLoading(true);
    try {
      await recordInvoicePayment(paymentInvoice.invoiceId, {
        amount: amt,
        method: paymentForm.method,
        note: paymentForm.note.trim() || undefined,
      });
      toast({ title: "Payment recorded" });
      setPaymentInvoice(null);
      setPaymentForm({ amount: "", method: "bank_transfer", note: "" });
      await load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleDeletePayment = async (invoiceId: string, paymentId: string) => {
    if (!window.confirm("Remove this payment record?")) return;
    try {
      await deleteInvoicePayment(invoiceId, paymentId);
      toast({ title: "Payment removed" });
      await load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  const togglePayments = (id: string) => {
    setExpandedPayments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportCSV = () => {
    const header = ["Invoice ID", "Customer", "Case ID", "Description", "Amount", "Paid", "Remaining", "Currency", "Status", "Due Date", "Created At"];
    const rows = filtered.map((inv) => [
      inv.invoiceId,
      clientNames[inv.customerId] || inv.customerId,
      inv.caseId || "",
      inv.description,
      inv.amount,
      inv.amountPaid ?? 0,
      Math.max(0, inv.amount - (inv.amountPaid ?? 0)),
      inv.currency,
      inv.status,
      inv.dueDate ? formatDate(inv.dueDate) : "",
      formatDate(inv.createdAt),
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "invoices.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = invoices.filter((inv) => {
    if (filterStatus !== "all" && inv.status !== filterStatus) return false;
    if (search && !inv.invoiceId.toLowerCase().includes(search.toLowerCase()) &&
      !inv.description.toLowerCase().includes(search.toLowerCase()) &&
      !(clientNames[inv.customerId] || "").toLowerCase().includes(search.toLowerCase()) &&
      !(inv.caseId || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPending = invoices.filter((i) => i.status === "pending").reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalOverdue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const totalCollected = invoices.reduce((s, i) => s + (i.amountPaid ?? 0), 0);

  return (
    <MainLayout title="Invoices & Billing">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Pending", value: totalPending, color: "text-amber-600" },
          { label: "Paid", value: totalPaid, color: "text-green-600" },
          { label: "Overdue", value: totalOverdue, color: "text-destructive" },
          { label: "Total Collected", value: totalCollected, color: "text-blue-600" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={`text-xl font-bold ${color}`}>€{value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle>All Invoices</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-40 text-sm"
              />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
              <Button size="sm" onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" />New Invoice
              </Button>
            </div>
          </div>
        </CardHeader>

        {showForm && (
          <CardContent className="border-b pb-4">
            <div className="text-sm font-medium mb-3">{editingId ? "Edit Invoice" : "New Invoice"}</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Client <span className="text-destructive">*</span></Label>
                <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(clientNames).map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name} ({id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Case ID (optional)</Label>
                <Input value={form.caseId} onChange={(e) => setForm((f) => ({ ...f, caseId: e.target.value }))} placeholder="CL-001" />
              </div>
              <div className="space-y-1">
                <Label>Description <span className="text-destructive">*</span></Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Legal services…" />
              </div>
              <div className="space-y-1">
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="1500" />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="ALL">ALL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as InvoiceStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleSave}><Check className="h-3.5 w-3.5 mr-1" />Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}>
                <X className="h-3.5 w-3.5 mr-1" />Cancel
              </Button>
            </div>
          </CardContent>
        )}

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No invoices found.</div>
          ) : (
            <div className="divide-y">
              {filtered.map((inv) => {
                const paid = inv.amountPaid ?? 0;
                const remaining = Math.max(0, inv.amount - paid);
                const paidPct = inv.amount > 0 ? Math.min(100, (paid / inv.amount) * 100) : 0;
                const paymentsExpanded = expandedPayments.has(inv.invoiceId);
                const payments: InvoicePayment[] = inv.payments ?? [];
                return (
                  <div key={inv.invoiceId}>
                    {/* Main invoice row */}
                    <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">{inv.invoiceId}</span>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[inv.status]}`}>
                            {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                          </span>
                          {inv.dueDate && <span className="text-xs text-muted-foreground">Due {formatDate(inv.dueDate)}</span>}
                        </div>
                        <div className="font-medium text-sm">{clientNames[inv.customerId] || inv.customerId}</div>
                        {inv.description && <div className="text-xs text-muted-foreground">{inv.description}</div>}
                        {inv.caseId && <div className="text-xs text-muted-foreground font-mono">Case: {inv.caseId}</div>}
                      </div>

                      <div className="shrink-0 text-right space-y-1">
                        <div className="font-semibold text-sm">{inv.currency} {inv.amount.toLocaleString()}</div>
                        {paid > 0 && (
                          <div className="text-xs text-green-600 dark:text-green-400">
                            Paid: {inv.currency} {paid.toLocaleString()}
                          </div>
                        )}
                        {remaining > 0 && paid > 0 && (
                          <div className="text-xs text-amber-600">
                            Due: {inv.currency} {remaining.toLocaleString()}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                          setPaymentInvoice(inv);
                          setPaymentForm({ amount: "", method: "bank_transfer", note: "" });
                        }}>
                          <CreditCard className="h-3 w-3 mr-1" />Pay
                        </Button>
                        {payments.length > 0 && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => togglePayments(inv.invoiceId)}>
                            {paymentsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(inv)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(inv.invoiceId)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {paid > 0 && (
                      <div className="px-4 pb-2">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                          <span>{paidPct.toFixed(0)}% paid</span>
                          {remaining > 0 && <span>{inv.currency} {remaining.toLocaleString()} remaining</span>}
                        </div>
                      </div>
                    )}

                    {/* Payment history */}
                    {paymentsExpanded && payments.length > 0 && (
                      <div className="px-4 pb-3">
                        <div className="rounded-md border bg-muted/30 divide-y">
                          {payments.map((p) => (
                            <div key={p.paymentId} className="flex items-center gap-3 px-3 py-2 text-xs">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{inv.currency} {Number(p.amount).toLocaleString()}</span>
                                <span className="text-muted-foreground ml-2">{PAYMENT_METHODS.find(m => m.value === p.method)?.label ?? p.method}</span>
                                {p.note && <span className="text-muted-foreground ml-2">— {p.note}</span>}
                              </div>
                              <div className="text-muted-foreground shrink-0">{p.date ? new Date(p.date).toLocaleDateString('en-GB') : '—'}</div>
                              {p.recordedBy && <div className="text-muted-foreground shrink-0">{p.recordedBy}</div>}
                              {isAdmin && (
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => handleDeletePayment(inv.invoiceId, p.paymentId)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={!!paymentInvoice} onOpenChange={(o) => { if (!o) setPaymentInvoice(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {paymentInvoice && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/40 border px-3 py-2 text-sm space-y-0.5">
                <div className="font-medium">{paymentInvoice.description}</div>
                <div className="text-muted-foreground">
                  Total: {paymentInvoice.currency} {paymentInvoice.amount.toLocaleString()}
                  {(paymentInvoice.amountPaid ?? 0) > 0 && (
                    <> · Paid: {paymentInvoice.currency} {(paymentInvoice.amountPaid ?? 0).toLocaleString()} · Remaining: {paymentInvoice.currency} {Math.max(0, paymentInvoice.amount - (paymentInvoice.amountPaid ?? 0)).toLocaleString()}</>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  placeholder={`Max ${paymentInvoice.currency} ${Math.max(0, paymentInvoice.amount - (paymentInvoice.amountPaid ?? 0)).toLocaleString()}`}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                  disabled={paymentLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm(f => ({ ...f, method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Note (optional)</Label>
                <Textarea
                  placeholder="Reference number, notes…"
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm(f => ({ ...f, note: e.target.value }))}
                  rows={2}
                  disabled={paymentLoading}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentInvoice(null)} disabled={paymentLoading}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={paymentLoading}>
              {paymentLoading ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
