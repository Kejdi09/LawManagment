import { useEffect, useMemo, useState, useCallback } from "react";
import { formatDate } from "@/lib/utils";
import {
  getAllCustomers,
  getAllCases,
  getCasesByCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getDocuments,
  uploadDocument,
  deleteDocument,
} from "@/lib/case-store";
import {
  STAGE_LABELS,
  PRIORITY_CONFIG,
  SERVICE_LABELS,
  CONTACT_CHANNEL_LABELS,
  LEAD_STATUS_LABELS,
  Customer,
  Case,
  CustomerNotification,
  ContactChannel,
  LeadStatus,
  ServiceType,
} from "@/lib/types";
import { mapCaseStateToStage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Phone, Mail, MapPin, ArrowLeft, ChevronDown, StickyNote, Pencil, Trash2, Plus, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { CaseDetail } from "@/components/CaseDetail";
import { useToast } from "@/hooks/use-toast";
import { getCustomerNotifications } from "@/lib/case-store";

// Reusable safe date formatter
function safeFormatDate(dateValue: string | Date | null | undefined) {
  if (!dateValue) return "N/A";
  const raw = String(dateValue);
  const includeTime = raw.includes("T");
  return formatDate(dateValue, includeTime);
}

const CUSTOMER_TYPES = ["Individual", "Family", "Company"] as const;
const CATEGORY_OPTIONS = [...CUSTOMER_TYPES, "Other"] as const;

function getCustomerCategory(customerType: string) {
  return CUSTOMER_TYPES.includes(customerType as (typeof CUSTOMER_TYPES)[number]) ? customerType : "Other";
}

const Customers = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    customerType: "Individual",
    contact: "",
    phone: "",
    email: "",
    address: "",
    registeredAt: new Date().toISOString(),
    services: [] as (keyof typeof SERVICE_LABELS)[],
    serviceDescription: "",
    contactChannel: "email" as keyof typeof CONTACT_CHANNEL_LABELS,
    status: "INTAKE",
    notes: "",
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCases, setSelectedCases] = useState<Case[]>([]);
  const [customerAlerts, setCustomerAlerts] = useState<CustomerNotification[]>([]);
  const [seenAlertIds, setSeenAlertIds] = useState<Set<string>>(new Set());
  const [customerDocuments, setCustomerDocuments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([...CATEGORY_OPTIONS]);
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
  const [caseCounts, setCaseCounts] = useState<Record<string, number>>({});
  const { toast } = useToast();

  const loadCustomers = useCallback(async () => {
    const data = await getAllCustomers();
    setCustomers(data);
    const allCases = await getAllCases();
    const counts = allCases.reduce<Record<string, number>>((acc, c) => {
      acc[c.customerId] = (acc[c.customerId] || 0) + 1;
      return acc;
    }, {});
    setCaseCounts(counts);
  }, []);

  const loadCustomerNotifications = useCallback(async () => {
    const notifications = await getCustomerNotifications();
    setCustomerAlerts(notifications);
  }, []);

  const loadCustomerDetail = useCallback(async (id: string | null) => {
    if (!id) {
      setSelectedCustomer(null);
      setSelectedCases([]);
      return;
    }
    const customerList = await getAllCustomers();
    const customer = customerList.find((c) => c.customerId === id) || null;
    setSelectedCustomer(customer);
    const cases = await getCasesByCustomer(id);
    setSelectedCases(cases);
    try {
      const docs = await getDocuments('customer', id);
      setCustomerDocuments(docs);
    } catch (e) {
      setCustomerDocuments([]);
    }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers, tick]);
  useEffect(() => { loadCustomerNotifications(); }, [loadCustomerNotifications, tick]);
  useEffect(() => { loadCustomerDetail(selectedId); }, [selectedId, loadCustomerDetail]);

  const unreadAlertCount = useMemo(
    () => customerAlerts.filter((a) => !seenAlertIds.has(a.notificationId)).length,
    [customerAlerts, seenAlertIds],
  );

  const filteredCustomers = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter((c) => {
      const serviceMatch = c.services.some((s: string) => SERVICE_LABELS[s].toLowerCase().includes(q));
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.contact.toLowerCase().includes(q) ||
        serviceMatch
      );
    });
  }, [customers, search]);

  const categoryFilteredCustomers = useMemo(() => {
    return filteredCustomers.filter((customer) => selectedCategories.includes(getCustomerCategory(customer.customerType)));
  }, [filteredCustomers, selectedCategories]);

  const groupedCustomers = useMemo(() => {
    const order = ["Individual", "Family", "Company", "Other"];
    const buckets = order.map((type) => ({
      type,
      items: categoryFilteredCustomers.filter((customer) => getCustomerCategory(customer.customerType) === type),
    }));
    return buckets.filter((bucket) => bucket.items.length > 0);
  }, [categoryFilteredCustomers]);

  const toggleCategoryFilter = (category: string) => {
    setSelectedCategories((prev) => (
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    ));
  };

  const toggleCategoryOpen = (category: string) => {
    setCollapsedCategories((prev) => (
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    ));
  };

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

  const serviceEntries = Object.entries(SERVICE_LABELS);
  const channelEntries = Object.entries(CONTACT_CHANNEL_LABELS);
  const statusEntries = Object.entries(LEAD_STATUS_LABELS);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      customerType: "Individual",
      contact: "",
      phone: "",
      email: "",
      address: "",
      registeredAt: new Date().toISOString(),
      services: [],
      serviceDescription: "",
      contactChannel: "email",
      status: "INTAKE",
      notes: "",
    });
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (customerId: string) => {
    const c = customers.find((x) => x.customerId === customerId);
    if (!c) return;
    setEditingId(customerId);
    setForm({
      ...c,
      registeredAt: c.registeredAt || new Date().toISOString(),
      services: c.services || [],
      serviceDescription: c.serviceDescription || "",
      notes: c.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        contact: form.contact || form.name,
        registeredAt: form.registeredAt || new Date().toISOString(),
        services: form.services || [],
        serviceDescription: form.serviceDescription || "",
        notes: form.notes ?? "",
      };
      const { _id: _ignoredId, customerId: _ignoredCustomerId, ...rest } = payload as Record<string, unknown>;
      if (editingId) {
        const original = customers.find((x) => x.customerId === editingId);
        const patched: Partial<Customer> = { ...(rest as Partial<Customer>) };
        // If status changed, append to statusHistory with current date
        if (original && original.status !== (form.status as LeadStatus)) {
          const prevHistory = Array.isArray(original.statusHistory) ? original.statusHistory.slice() : [];
          prevHistory.push({ status: form.status as LeadStatus, date: new Date().toISOString() });
          patched.status = form.status as LeadStatus;
          patched.statusHistory = prevHistory;
        }
        // Optimistic UI update so changes appear instantly
        const optimistic = {
          ...(original as Customer),
          ...(patched as Partial<Customer>),
          customerId: editingId,
        } as Customer;
        setCustomers((prev) => prev.map((c) => (c.customerId === editingId ? optimistic : c)));
        if (selectedCustomer?.customerId === editingId) {
          setSelectedCustomer(optimistic);
        }
        setShowForm(false);
        resetForm();
        await updateCustomer(editingId.trim(), patched);
        await loadCustomerNotifications();
        toast({ title: "Updated", description: "Customer updated successfully" });
        await loadCustomers();
        if (selectedId) await loadCustomerDetail(selectedId);
        return;
      } else {
        // New customer: initialize statusHistory
        const toCreate: Partial<Customer> = { ...(rest as Partial<Customer>) };
        toCreate.status = form.status as LeadStatus;
        toCreate.statusHistory = [{ status: form.status as LeadStatus, date: new Date().toISOString() }];
        await createCustomer(toCreate as Omit<Customer, "customerId">);
        toast({ title: "Created", description: "Customer created successfully" });
      }
      setShowForm(false);
      setSelectedId(null);
      resetForm();
      await loadCustomers();
      await loadCustomerNotifications();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unable to save customer";
      toast({ title: "Save failed", description: errorMessage, variant: "destructive" });
      await loadCustomers();
      if (selectedId) await loadCustomerDetail(selectedId);
    }
  };

  const handleDelete = (customerId: string) => {
    const confirmed = window.confirm("Delete this customer and related cases?");
    if (!confirmed) return;
    deleteCustomer(customerId).then(async () => {
      if (selectedId === customerId) setSelectedId(null);
      toast({ title: "Deleted successfully" });
      await loadCustomers();
      setTick((t) => t + 1);
    }).catch((err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : "Unable to delete customer";
      toast({ title: "Delete failed", description: errorMessage, variant: "destructive" });
    });
  };

  const handleSetStatus = async (customerId: string, status: LeadStatus) => {
    try {
      // optimistic update
      setCustomers((prev) => prev.map((c) => (c.customerId === customerId ? { ...c, status } : c)));
      if (selectedCustomer?.customerId === customerId) setSelectedCustomer({ ...selectedCustomer, status });
      await updateCustomer(customerId, { status });
      toast({ title: 'Status updated' });
      await loadCustomers();
      if (selectedId) await loadCustomerDetail(selectedId);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unable to update status';
      toast({ title: 'Update failed', description: errorMessage, variant: 'destructive' });
      await loadCustomers();
    }
  };

  const { logout } = useAuth();

  const handleUploadCustomerDocument = async (file?: File) => {
    if (!file || !selectedCustomer) return;
    try {
      setIsUploading(true);
      await uploadDocument('customer', selectedCustomer.customerId, file);
      const docs = await getDocuments('customer', selectedCustomer.customerId);
      setCustomerDocuments(docs);
      toast({ title: 'Uploaded', description: 'Document uploaded' });
    } catch (err: unknown) {
      toast({ title: 'Upload failed', description: String(err), variant: 'destructive' });
    } finally { setIsUploading(false); }
  };

  const handleDeleteCustomerDocument = async (docId: string) => {
    try {
      setIsUploading(true);
      await deleteDocument(docId);
      setCustomerDocuments((d) => d.filter((x) => x.docId !== docId));
      toast({ title: 'Deleted', description: 'Document removed' });
    } catch (err: unknown) {
      toast({ title: 'Delete failed', description: String(err), variant: 'destructive' });
    } finally { setIsUploading(false); }
  };
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}> 
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">Customers</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={logout}>
              Sign Out
            </Button>
            <DropdownMenu
              onOpenChange={(open) => {
                if (open) {
                  setSeenAlertIds((prev) => {
                    const next = new Set(prev);
                    customerAlerts.forEach((a) => next.add(a.notificationId));
                    return next;
                  });
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative">
                  <Bell className="h-4 w-4" />
                  {unreadAlertCount > 0 && (
                    <Badge variant="destructive" className="absolute -top-1 -right-2 px-1.5 text-[10px]">
                      {unreadAlertCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {customerAlerts.length === 0 && <DropdownMenuItem disabled>No customer alerts</DropdownMenuItem>}
                {customerAlerts.map((a) => (
                  <DropdownMenuItem key={a.notificationId} className={a.severity === "critical" ? "text-destructive" : ""}>
                    <div className="flex flex-col">
                      <span>{a.message}</span>
                      <span className="text-xs text-muted-foreground">{a.customerId}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Categories ({selectedCategories.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {CATEGORY_OPTIONS.map((category) => {
                const checked = selectedCategories.includes(category);
                return (
                  <DropdownMenuItem
                    key={category}
                    onSelect={(e) => {
                      e.preventDefault();
                      toggleCategoryFilter(category);
                    }}
                    className="gap-2"
                  >
                    <Checkbox checked={checked} />
                    <span>{category}</span>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setSelectedCategories([...CATEGORY_OPTIONS]);
                }}
              >
                Select all
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setSelectedCategories([]);
                }}
              >
                Clear all
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Removed global Expand/Collapse - category headers are collapsible individually */}
          <Button onClick={openCreate} className="flex items-center gap-2" size="sm">
            <Plus className="h-4 w-4" /> New Customer
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cases</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedCustomers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-6">
                      No customers match the selected categories/search.
                    </TableCell>
                  </TableRow>
                )}
                {groupedCustomers.flatMap((group) => ([
                  <TableRow key={`group-${group.type}-header`} className="bg-muted/30">
                    <TableCell colSpan={10} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={() => toggleCategoryOpen(group.type)}
                      >
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsedCategories.includes(group.type) ? "-rotate-90" : "rotate-0"}`} />
                        {group.type} ({group.items.length})
                      </button>
                    </TableCell>
                  </TableRow>,
                  ...(collapsedCategories.includes(group.type) ? [] : group.items.map((c) => {
                    const caseCount = caseCounts[c.customerId] || 0;
                    const servicesLabel = c.services.map((s) => SERVICE_LABELS[s]);
                    return (
                      <TableRow key={`${group.type}-${c.customerId}`} className="cursor-pointer" onClick={() => setSelectedId(c.customerId)}>
                        <TableCell className="font-mono text-xs">{c.customerId}</TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{safeFormatDate(c.registeredAt)}</TableCell>
                        <TableCell className="text-sm">{c.phone}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.email}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 px-2">
                                {servicesLabel[0]}{servicesLabel.length > 1 ? ` +${servicesLabel.length - 1}` : ""}
                                <ChevronDown className="h-3 w-3 ml-1" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {servicesLabel.map((s) => (
                                <DropdownMenuItem key={s}>{s}</DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{CONTACT_CHANNEL_LABELS[c.contactChannel]}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusAccent[c.status]}`}>
                            {LEAD_STATUS_LABELS[c.status]}
                          </span>
                        </TableCell>
                        <TableCell className="text-right flex items-center justify-end gap-2">
                          {c.notes && <StickyNote className="h-4 w-4 text-muted-foreground" />}
                          <Badge variant="secondary">{caseCount}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(c.customerId)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSetStatus(c.customerId, 'CLIENT')}>
                              <Badge className="text-xs">Client</Badge>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleSetStatus(c.customerId, 'ARCHIVED')}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.customerId)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }))
                ]))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Documents</CardTitle></CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <input type="file" disabled={!selectedCustomer || isUploading} onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUploadCustomerDocument(f);
                            // reset input
                            if (e.target) (e.target as HTMLInputElement).value = "";
                          }} />
                          <Button size="sm" onClick={() => {
                            const el = document.createElement('input');
                            el.type = 'file';
                            el.onchange = (ev: Event) => {
                              const input = ev.target as HTMLInputElement;
                              const f = input.files?.[0];
                              if (f) handleUploadCustomerDocument(f);
                            };
                            el.click();
                          }} disabled={!selectedCustomer || isUploading}>{isUploading ? 'Uploading...' : 'Upload'}</Button>
                        </div>
                        <div className="space-y-1">
                          {customerDocuments.length === 0 && (<div className="text-xs text-muted-foreground">No documents</div>)}
                          {customerDocuments.map((d) => (
                            <div key={d.docId} className="flex items-center justify-between gap-2 text-sm">
                              <div className="truncate">{d.originalName || d.filename}</div>
                              <div className="flex items-center gap-2">
                                <a href={`/api/documents/${d.docId}`} target="_blank" rel="noreferrer" className="text-sm text-primary">Open</a>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteCustomerDocument(d.docId)} className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
      </main>

      {/* Create / Edit customer */}
      <Dialog open={showForm} onOpenChange={(o) => !o && setShowForm(false)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Customer" : "New Customer"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Contact Type</Label>
              <Select value={form.customerType} onValueChange={(v) => setForm({ ...form, customerType: v })}>
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
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            {/* Country removed; use Address field to store country if desired */}
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Registered At</Label>
              <Input
                type="date"
                value={form.registeredAt.slice(0, 10)}
                onChange={(e) => setForm({ ...form, registeredAt: new Date(e.target.value).toISOString() })}
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Channel</Label>
              <Select value={form.contactChannel} onValueChange={(v) => setForm({ ...form, contactChannel: v as ContactChannel })}>
                <SelectTrigger><SelectValue placeholder="Channel" /></SelectTrigger>
                <SelectContent>
                  {channelEntries.map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as LeadStatus })}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {statusEntries.map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Services</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {serviceEntries.map(([key, label]) => {
                  const checked = form.services.includes(key as ServiceType);
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const on = Boolean(v);
                          setForm({
                            ...form,
                            services: on
                              ? [...form.services, key as ServiceType]
                              : form.services.filter((s) => s !== key),
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
              <Textarea value={form.serviceDescription} onChange={(e) => setForm({ ...form, serviceDescription: e.target.value })} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingId ? "Save" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer detail dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
          {selectedCustomer && (
            <>
              <DialogHeader>
                  <DialogTitle>{selectedCustomer.name}</DialogTitle>
                  <DialogDescription>
                    Registered on {safeFormatDate(selectedCustomer.registeredAt)}
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Overview</CardTitle></CardHeader>
                      <CardContent className="grid gap-2 text-sm">
                        <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-muted-foreground" />{selectedCustomer.phone}</div>
                        <div className="flex items-center gap-2"><Mail className="h-3 w-3 text-muted-foreground" />{selectedCustomer.email}</div>
                        <div className="flex items-center gap-2"><MapPin className="h-3 w-3 text-muted-foreground" />{selectedCustomer.address}</div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusAccent[selectedCustomer.status]}`}>
                            {LEAD_STATUS_LABELS[selectedCustomer.status]}
                          </span>
                          <Badge variant="outline" className="text-xs">{CONTACT_CHANNEL_LABELS[selectedCustomer.contactChannel]}</Badge>
                        </div>
                      </CardContent>
                    </Card>

                <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Services</CardTitle></CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex flex-wrap gap-2">
                          {selectedCustomer.services.map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">{SERVICE_LABELS[s]}</Badge>
                          ))}
                        </div>
                        <p className="text-muted-foreground text-sm">{selectedCustomer.serviceDescription}</p>
                        {selectedCustomer.notes && (
                          <div className="rounded-md border p-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1"><StickyNote className="h-3 w-3" />Notes</div>
                            <p>{selectedCustomer.notes}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {selectedCustomer.statusHistory && selectedCustomer.statusHistory.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Status History</CardTitle></CardHeader>
                        <CardContent className="text-sm">
                          <div className="space-y-2">
                            {[...selectedCustomer.statusHistory].reverse().map((record: { status: LeadStatus; date: string }, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${statusAccent[record.status]}`}>
                                  {LEAD_STATUS_LABELS[record.status]}
                                </span>
                                <span className="text-muted-foreground">{safeFormatDate(record.date)}</span>
                              </div>
                            ))}
                          </div>
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
                            {selectedCases.map((sc) => {
                              const pCfg = PRIORITY_CONFIG[sc.priority];
                              return (
                                <TableRow key={sc.caseId} className="cursor-pointer" onClick={() => setSelectedCaseId(sc.caseId)}>
                                  <TableCell className="font-mono text-xs">{sc.caseId}</TableCell>
                                  <TableCell className="text-sm">{sc.category} / {sc.subcategory}</TableCell>
                                  <TableCell><Badge className="text-xs">{STAGE_LABELS[mapCaseStateToStage(sc.state)]}</Badge></TableCell>
                                  <TableCell>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pCfg.color}`}>{pCfg.label}</span>
                                  </TableCell>
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

      <CaseDetail
        caseId={selectedCaseId}
        open={!!selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
        onStateChanged={() => {
          setSelectedCaseId(null);
          loadCustomerDetail(selectedId);
          loadCustomers();
        }}
      />
    </div>
  );
};

export default Customers;
