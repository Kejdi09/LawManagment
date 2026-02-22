import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  fetchDocumentBlob,
  StoredDocument,
  getCustomerHistory,
  getCustomerNotifications,
  deleteCustomerNotification,
} from "@/lib/case-store";
import {
  STAGE_LABELS,
  PRIORITY_CONFIG,
  SERVICE_LABELS,
  CONTACT_CHANNEL_LABELS,
  LEAD_STATUS_LABELS,
  LAWYERS,
  Customer,
  Case,
  CustomerHistoryRecord,
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
import { Search, Phone, Mail, MapPin, ChevronDown, StickyNote, Pencil, Trash2, Plus, Archive, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-context";
import MainLayout from "@/components/MainLayout";
import { CaseDetail } from "@/components/CaseDetail";
import { useToast } from "@/hooks/use-toast";

// Reusable safe date formatter
function safeFormatDate(dateValue: string | Date | null | undefined) {
  if (!dateValue) return "N/A";
  const raw = String(dateValue);
  const includeTime = raw.includes("T");
  return formatDate(dateValue, includeTime);
}

const CUSTOMER_TYPES = ["Individual", "Family", "Company"] as const;
const CATEGORY_OPTIONS = [...CUSTOMER_TYPES, "Other"] as const;
const UNASSIGNED_CONSULTANT = "__UNASSIGNED__";

function getCustomerCategory(customerType: string) {
  return CUSTOMER_TYPES.includes(customerType as (typeof CUSTOMER_TYPES)[number]) ? customerType : "Other";
}

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

const Customers = () => {
  const [search, setSearch] = useState("");
  const [sectionView, setSectionView] = useState<"main" | "on_hold" | "archived">("main");
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
    assignedTo: "",
    followUpDate: "",
    status: "INTAKE",
    notes: "",
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assignedMap, setAssignedMap] = useState<Record<string, string>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCases, setSelectedCases] = useState<Case[]>([]);
  const [customerAlerts, setCustomerAlerts] = useState<CustomerNotification[]>([]);
  const [dismissingNotificationIds, setDismissingNotificationIds] = useState<Set<string>>(new Set());
  const [customerDocuments, setCustomerDocuments] = useState<StoredDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([...CATEGORY_OPTIONS]);
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
  const [caseCounts, setCaseCounts] = useState<Record<string, number>>({});
  const [customerStatusLog, setCustomerStatusLog] = useState<CustomerHistoryRecord[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  const loadCustomers = useCallback(async () => {
    const data = await getAllCustomers();
    setCustomers(data);
    const allCases = await getAllCases();
    const counts = allCases.reduce<Record<string, number>>((acc, c) => {
      acc[c.customerId] = (acc[c.customerId] || 0) + 1;
      return acc;
    }, {});
    setCaseCounts(counts);
    // compute assigned consultant per customer (most recent case assignedTo)
    const map: Record<string, { assignedTo: string; lastChange: number }> = {};
    for (const c of allCases) {
      const last = new Date(c.lastStateChange || 0).getTime();
      if (!map[c.customerId] || last > map[c.customerId].lastChange) {
        map[c.customerId] = { assignedTo: c.assignedTo || "", lastChange: last };
      }
    }
    const flattened: Record<string, string> = {};
    for (const k of Object.keys(map)) flattened[k] = map[k].assignedTo || "";
    setAssignedMap(flattened);
  }, []);

  const loadCustomerNotifications = useCallback(async () => {
    const notifications = await getCustomerNotifications();
    // Filter out notifications for already-confirmed/clients and those the current user shouldn't see
    const visible = notifications.filter((n) => {
      const cust = customers.find((c) => c.customerId === n.customerId);
      if (!cust) return false;
      // Don't surface notifications for confirmed clients
      if (cust.status === 'CLIENT' || cust.status === 'CONFIRMED') return false;
      // Admins and intake users see all
      if (user?.role === 'admin' || user?.role === 'intake') return true;
      // If assignedTo matches current user (by consultantName, lawyerName or username) allow
      const viewerNames = new Set([user?.consultantName, user?.lawyerName, user?.username].filter(Boolean) as string[]);
      const assigned = cust.assignedTo || assignedMap[cust.customerId] || '';
      if (assigned && viewerNames.has(assigned)) return true;
      // Otherwise hide
      return false;
    });
    setCustomerAlerts(visible);
  }, [customers, user, assignedMap]);

  const handleDismissNotification = useCallback(async (notificationId: string) => {
    setDismissingNotificationIds((prev) => {
      const next = new Set(prev);
      next.add(notificationId);
      return next;
    });
    try {
      await deleteCustomerNotification(notificationId);
      await loadCustomerNotifications();
      toast({ title: "Notification removed" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to remove notification";
      toast({ title: "Dismiss failed", description: message, variant: "destructive" });
    } finally {
      setDismissingNotificationIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  }, [loadCustomerNotifications, toast]);

  const loadCustomerDetail = useCallback(async (id: string | null) => {
    if (!id) {
      setSelectedCustomer(null);
      setSelectedCases([]);
      setCustomerStatusLog([]);
      return;
    }
    const customerList = await getAllCustomers();
    const customer = customerList.find((c) => c.customerId === id) || null;
    setSelectedCustomer(customer);
    const [cases, history] = await Promise.all([
      getCasesByCustomer(id),
      getCustomerHistory(id).catch(() => []),
    ]);
    setSelectedCases(cases);
    setCustomerStatusLog(history);
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

  // Customer alerts are filtered server-side; we've applied client-side visibility rules in loader

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
    const sectionFiltered = categoryFilteredCustomers.filter((customer) => {
      if (sectionView === "on_hold") return customer.status === "ON_HOLD";
      if (sectionView === "archived") return customer.status === "ARCHIVED";
      return customer.status !== "ON_HOLD" && customer.status !== "ARCHIVED";
    });
    const order = ["Individual", "Family", "Company", "Other"];
    const buckets = order.map((type) => ({
      type,
      items: sectionFiltered.filter((customer) => getCustomerCategory(customer.customerType) === type),
    }));
    return buckets.filter((bucket) => bucket.items.length > 0);
  }, [categoryFilteredCustomers, sectionView]);

  const customerById = useMemo(() => {
    return customers.reduce<Record<string, Customer>>((acc, cust) => {
      acc[cust.customerId] = cust;
      return acc;
    }, {});
  }, [customers]);

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
  const statusEntriesBase = Object.entries(LEAD_STATUS_LABELS).filter(([key]) => ALLOWED_CUSTOMER_STATUSES.includes(key as LeadStatus));
  // Allow intake users to choose CLIENT via the form, but we'll require assignment when they do.
  const statusEntries = statusEntriesBase;

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
      assignedTo: "",
      followUpDate: "",
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
      assignedTo: c.assignedTo || "",
      followUpDate: c.followUpDate ? String(c.followUpDate).slice(0, 10) : "",
      notes: c.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      // UI-level validation: intake must choose assignee when confirming
      if (form.status === 'CLIENT' && user?.role === 'intake' && !form.assignedTo) {
        toast({ title: 'Assign required', description: 'Please select someone to assign the confirmed client', variant: 'destructive' });
        return;
      }
      const payload = {
        ...form,
        assignedTo: form.assignedTo === UNASSIGNED_CONSULTANT ? "" : form.assignedTo,
        followUpDate: form.status === "ON_HOLD" && form.followUpDate ? new Date(form.followUpDate).toISOString() : null,
        contact: form.contact || form.name,
        registeredAt: form.registeredAt || new Date().toISOString(),
        services: form.services || [],
        serviceDescription: form.serviceDescription || "",
        notes: form.notes ?? "",
      };
      // Intake users are not allowed to change assignment except when confirming to CLIENT.
      if (user?.role === 'intake') {
        if (form.status === 'CLIENT') {
          // keep assignedTo from form (already mapped above)
        } else {
          // If editing, preserve existing assignedTo; if creating, ensure empty
          if (editingId) {
            const orig = customers.find((x) => x.customerId === editingId);
            payload.assignedTo = orig?.assignedTo || "";
          } else {
            payload.assignedTo = "";
          }
        }
      }
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
        try { await loadCustomerNotifications(); } catch (e) { /* ignore secondary load errors */ }
        toast({ title: "Updated", description: "Customer updated successfully" });
        try { window.dispatchEvent(new Event('app:data-updated')); } catch {}
        try { await loadCustomers(); } catch (e) { /* ignore reload errors */ }
        try { if (selectedId) await loadCustomerDetail(selectedId); } catch (e) { /* ignore */ }
        return;
      } else {
        // New customer: initialize statusHistory
        const toCreate: Partial<Customer> = { ...(rest as Partial<Customer>) };
        toCreate.status = form.status as LeadStatus;
        toCreate.statusHistory = [{ status: form.status as LeadStatus, date: new Date().toISOString() }];
        await createCustomer(toCreate as Omit<Customer, "customerId">);
        try { await loadCustomerNotifications(); } catch (e) { /* ignore */ }
        toast({ title: "Created", description: "Customer created successfully" });
        try { window.dispatchEvent(new Event('app:data-updated')); } catch {}
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
      try { window.dispatchEvent(new Event('app:data-updated')); } catch {}
      await loadCustomers();
      setTick((t) => t + 1);
    }).catch((err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : "Unable to delete customer";
      toast({ title: "Delete failed", description: errorMessage, variant: "destructive" });
    });
  };

  const handleSetStatus = async (customerId: string, status: LeadStatus) => {
    try {
      // If current user is intake and confirming to CLIENT, require assignee selection
      if (user?.role === 'intake' && status === 'CLIENT') {
        setConfirmAssignCustomerId(customerId);
        setShowConfirmAssign(true);
        return;
      }

      // optimistic update
      setCustomers((prev) => prev.map((c) => (c.customerId === customerId ? { ...c, status } : c)));
      if (selectedCustomer?.customerId === customerId) setSelectedCustomer({ ...selectedCustomer, status });
      await updateCustomer(customerId, { status });
      toast({ title: 'Status updated' });
      try { window.dispatchEvent(new Event('app:data-updated')); } catch {}
      await loadCustomers();
      if (selectedId) await loadCustomerDetail(selectedId);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unable to update status';
      toast({ title: 'Update failed', description: errorMessage, variant: 'destructive' });
      await loadCustomers();
    }
  };

  // Confirm-assign dialog state
  const [showConfirmAssign, setShowConfirmAssign] = useState(false);
  const [confirmAssignCustomerId, setConfirmAssignCustomerId] = useState<string | null>(null);
  const [confirmAssignSelected, setConfirmAssignSelected] = useState<string>(LAWYERS[0] || "");

  const handleConfirmAssign = async () => {
    if (!confirmAssignCustomerId) return;
    if (!confirmAssignSelected) {
      toast({ title: 'Select assignee', description: 'Please choose someone to assign the confirmed client', variant: 'destructive' });
      return;
    }
    try {
      await updateCustomer(confirmAssignCustomerId, { status: 'CLIENT', assignedTo: confirmAssignSelected });
      toast({ title: 'Client confirmed', description: `Assigned to ${confirmAssignSelected}` });
      setShowConfirmAssign(false);
      setConfirmAssignCustomerId(null);
      try { window.dispatchEvent(new Event('app:data-updated')); } catch {}
      await loadCustomers();
      if (selectedId) await loadCustomerDetail(selectedId);
    } catch (err: unknown) {
      toast({ title: 'Confirm failed', description: String(err), variant: 'destructive' });
    }
  };

  const isAdmin = user?.role === "admin";
  const canManageCustomerNotifications = isAdmin || user?.role === 'intake';

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

  const handlePreviewCustomerDocument = async (docId: string) => {
    try {
      const { blob } = await fetchDocumentBlob(docId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      toast({ title: "Preview failed", description: err instanceof Error ? err.message : "Unable to preview document", variant: "destructive" });
    }
  };

  const handleDownloadCustomerDocument = async (docId: string, originalName?: string) => {
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
  return (
    <MainLayout title="Customers">
      <div className="space-y-4">
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
          <div className="flex items-center gap-2">
            <Button variant={sectionView === "main" ? "default" : "outline"} size="sm" onClick={() => setSectionView("main")}>Main</Button>
            <Button variant={sectionView === "on_hold" ? "default" : "outline"} size="sm" onClick={() => setSectionView("on_hold")}>On Hold</Button>
            <Button variant={sectionView === "archived" ? "default" : "outline"} size="sm" onClick={() => setSectionView("archived")}>Archived</Button>
          </div>
          {/* Removed global Expand/Collapse - category headers are collapsible individually */}
          {(user?.role === 'intake' || user?.role === 'admin') && (
            <Button onClick={openCreate} className="flex items-center gap-2" size="sm">
              <Plus className="h-4 w-4" /> New Customer
            </Button>
          )}
        </div>

        {canManageCustomerNotifications && customerAlerts.length > 0 && (
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">Customer Alerts</CardTitle>
              <span className="text-xs text-muted-foreground">{customerAlerts.length} pending</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {customerAlerts.map((alert) => {
                const cust = customerById[alert.customerId];
                const badgeVariant = alert.severity === "critical" ? "destructive" : "secondary";
                const isDismissing = dismissingNotificationIds.has(alert.notificationId);
                return (
                  <div key={alert.notificationId} className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={badgeVariant} className="text-[10px] uppercase tracking-[0.2em]">
                          {alert.kind === "follow" ? "Follow up" : "Respond"}
                        </Badge>
                        <p className="text-sm font-semibold leading-tight">{alert.message}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{cust ? `${cust.name} (${cust.customerId})` : alert.customerId}</span>
                        {cust && <span>• {LEAD_STATUS_LABELS[cust.status] || cust.status}</span>}
                        <span>• {safeFormatDate(alert.createdAt)}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Dismiss notification"
                      onClick={() => handleDismissNotification(alert.notificationId)}
                      disabled={isDismissing}
                    >
                      <X className={`h-4 w-4 ${isDismissing ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cases</TableHead>
                  <TableHead className="w-[220px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedCustomers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                      No customers match the selected categories/search.
                    </TableCell>
                  </TableRow>
                )}
                {groupedCustomers.flatMap((group) => ([
                  <TableRow key={`group-${group.type}-header`} className="bg-muted/30">
                    <TableCell colSpan={7} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                  ...(collapsedCategories.includes(group.type)
                    ? []
                    : group.items.map((c) => {
                      const caseCount = caseCounts[c.customerId] || 0;
                      return (
                        <TableRow key={`${group.type}-${c.customerId}`} className="cursor-pointer" onClick={() => setSelectedId(c.customerId)}>
                          <TableCell className="font-mono text-xs">{c.customerId}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-sm">{c.phone}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{c.email}</TableCell>
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
                            <div className="flex justify-end items-center gap-2 flex-nowrap" onClick={(e) => e.stopPropagation()}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(c.customerId); }} aria-label="Edit">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit</TooltipContent>
                              </Tooltip>

                              {c.status !== 'ARCHIVED' ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm('Archive this customer? They will be hidden from Active lists.')) {
                                          handleSetStatus(c.customerId, 'ARCHIVED');
                                        }
                                      }}
                                      aria-label="Archive"
                                    >
                                      <Archive className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Archive</TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm('Unarchive this customer? They will return to Active lists.')) {
                                          handleSetStatus(c.customerId, 'INTAKE');
                                        }
                                      }}
                                      aria-label="Unarchive"
                                    >
                                      <Archive className="h-3.5 w-3.5 rotate-180" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Unarchive</TooltipContent>
                                </Tooltip>
                              )}

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(c.customerId); }} aria-label="Delete">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
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

      </div>

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
              <Label>Assigned Consultant</Label>
              <Select
                value={form.assignedTo || UNASSIGNED_CONSULTANT}
                onValueChange={(v) => setForm({ ...form, assignedTo: v === UNASSIGNED_CONSULTANT ? "" : v })}
                disabled={form.status !== 'CLIENT'}
              >
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED_CONSULTANT}>Unassigned</SelectItem>
                  {LAWYERS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.status !== 'CLIENT' && (
                <p className="text-xs text-muted-foreground">Assignment can only be changed when confirming to a client.</p>
              )}
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
            {form.status === "ON_HOLD" && (
              <div className="space-y-2">
                <Label>Follow Up Date</Label>
                <Input
                  type="date"
                  value={form.followUpDate || ""}
                  onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                />
              </div>
            )}
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

      {/* Confirm-assign dialog for intake users */}
      <Dialog open={showConfirmAssign} onOpenChange={(o) => { if (!o) setShowConfirmAssign(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm client — assign to</DialogTitle>
            <DialogDescription>Please choose a consultant or lawyer to assign this confirmed client to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Assign to</Label>
            <Select value={confirmAssignSelected} onValueChange={(v) => setConfirmAssignSelected(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select consultant" />
              </SelectTrigger>
              <SelectContent>
                {LAWYERS.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setShowConfirmAssign(false); setConfirmAssignCustomerId(null); }}>Cancel</Button>
              <Button onClick={handleConfirmAssign}>Confirm & Assign</Button>
            </div>
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

                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Documents</CardTitle></CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            disabled={!selectedCustomer || isUploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadCustomerDocument(f);
                              e.currentTarget.value = "";
                            }}
                          />
                          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={!selectedCustomer || isUploading}>
                            {isUploading ? "Uploading..." : "Upload"}
                          </Button>
                        </div>
                        <div className="space-y-1">
                          {customerDocuments.length === 0 && (<div className="text-xs text-muted-foreground">No documents</div>)}
                          {customerDocuments.map((d) => (
                            <div key={d.docId} className="flex items-center justify-between gap-2 text-sm rounded-md border p-2">
                              <div className="truncate" title={d.originalName || d.filename}>{d.originalName || d.filename}</div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => handlePreviewCustomerDocument(d.docId)}>Preview</Button>
                                <Button variant="outline" size="sm" onClick={() => handleDownloadCustomerDocument(d.docId, d.originalName || d.filename)}>Download</Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteCustomerDocument(d.docId)} className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {customerStatusLog.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Status History</CardTitle></CardHeader>
                        <CardContent className="text-sm">
                          <div className="space-y-2">
                            {[...customerStatusLog].reverse().map((record: CustomerHistoryRecord, idx: number) => (
                              <div key={record.historyId || idx} className="flex items-start justify-between gap-3 text-xs rounded-md border p-2">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${statusAccent[record.statusTo] || "bg-muted text-foreground"}`}>
                                    {LEAD_STATUS_LABELS[record.statusTo as LeadStatus] || record.statusTo}
                                  </span>
                                  <span className="text-muted-foreground">from {LEAD_STATUS_LABELS[record.statusFrom as LeadStatus] || record.statusFrom}</span>
                                </div>
                                <span className="text-right text-muted-foreground">
                                  {safeFormatDate(record.date)} • {record.changedByConsultant || record.changedByLawyer || record.changedBy || "System"}
                                </span>
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
    </MainLayout>
  );
};

export default Customers;
