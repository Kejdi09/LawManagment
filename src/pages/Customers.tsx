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
import { Search, Phone, Mail, MapPin, ChevronDown, StickyNote, Pencil, Trash2, Plus, Archive, Workflow } from "lucide-react";
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
const CUSTOMER_COLUMNS_MODE_KEY = "lm:show-more-columns";
const CUSTOMER_COLUMNS_MODE_EVENT = "lm-columns-mode-change";

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

const WORKFLOW_STEPS: Array<{ status: LeadStatus; title: string; subtitle: string }> = [
  { status: "INTAKE", title: "1. Intake", subtitle: "new lead" },
  { status: "SEND_PROPOSAL", title: "2. Proposal", subtitle: "offer sent" },
  { status: "WAITING_APPROVAL", title: "3. Approval", subtitle: "awaiting decision" },
  { status: "SEND_CONTRACT", title: "4. Contract", subtitle: "contract sent" },
  { status: "WAITING_ACCEPTANCE", title: "5. Acceptance", subtitle: "waiting signature" },
  { status: "SEND_RESPONSE", title: "6. Response", subtitle: "final response" },
  { status: "CLIENT", title: "7. Client", subtitle: "converted" },
];

const WORKFLOW_SEQUENCE: LeadStatus[] = [
  "INTAKE",
  "SEND_PROPOSAL",
  "WAITING_APPROVAL",
  "SEND_CONTRACT",
  "WAITING_ACCEPTANCE",
  "SEND_RESPONSE",
  "CLIENT",
];

function getNextWorkflowStatus(status: LeadStatus): LeadStatus | null {
  const index = WORKFLOW_SEQUENCE.indexOf(status);
  if (index < 0) return null;
  return WORKFLOW_SEQUENCE[index + 1] ?? null;
}

const Customers = () => {
  const [search, setSearch] = useState("");
  const [sectionView, setSectionView] = useState<"main" | "on_hold" | "archived">("main");
  const [statusView, setStatusView] = useState<"all" | LeadStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [customerPage, setCustomerPage] = useState(1);
  const customerPageSize = 25;
  const [showMoreCustomerColumns, setShowMoreCustomerColumns] = useState(false);
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
  const [customerDocuments, setCustomerDocuments] = useState<StoredDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([...CATEGORY_OPTIONS]);
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
  const [caseCounts, setCaseCounts] = useState<Record<string, number>>({});
  const [customerStatusLog, setCustomerStatusLog] = useState<CustomerHistoryRecord[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    try {
      setShowMoreCustomerColumns(localStorage.getItem(CUSTOMER_COLUMNS_MODE_KEY) === "1");
    } catch {
      setShowMoreCustomerColumns(false);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      try {
        setShowMoreCustomerColumns(localStorage.getItem(CUSTOMER_COLUMNS_MODE_KEY) === "1");
      } catch {
        setShowMoreCustomerColumns(false);
      }
    };
    window.addEventListener("storage", sync);
    window.addEventListener(CUSTOMER_COLUMNS_MODE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CUSTOMER_COLUMNS_MODE_EVENT, sync);
    };
  }, []);

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

  const loadCustomerDetail = useCallback(async (id: string | null) => {
    if (!id) {
      setSelectedCustomer(null);
      setSelectedCases([]);
      setCustomerStatusLog([]);
      return;
    }
    const customer = customers.find((c) => c.customerId === id) || null;
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
  }, [customers]);

  useEffect(() => { loadCustomers(); }, [loadCustomers, tick]);
  useEffect(() => { loadCustomerDetail(selectedId); }, [selectedId, loadCustomerDetail]);

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

  const statusFilteredCustomers = useMemo(() => {
    const sectionFiltered = categoryFilteredCustomers.filter((customer) => {
      if (sectionView === "on_hold") return customer.status === "ON_HOLD";
      if (sectionView === "archived") return customer.status === "ARCHIVED";
      return customer.status !== "ON_HOLD" && customer.status !== "ARCHIVED";
    });
    return statusView === "all"
      ? sectionFiltered
      : sectionFiltered.filter((customer) => customer.status === statusView);
  }, [categoryFilteredCustomers, sectionView, statusView]);

  const customerTotalPages = Math.max(1, Math.ceil(statusFilteredCustomers.length / customerPageSize));

  const pagedCustomers = useMemo(() => {
    const start = (customerPage - 1) * customerPageSize;
    return statusFilteredCustomers.slice(start, start + customerPageSize);
  }, [statusFilteredCustomers, customerPage]);

  const groupedCustomers = useMemo(() => {
    const order = ["Individual", "Family", "Company", "Other"];
    const buckets = order.map((type) => ({
      type,
      items: pagedCustomers.filter((customer) => getCustomerCategory(customer.customerType) === type),
    }));
    return buckets.filter((bucket) => bucket.items.length > 0);
  }, [pagedCustomers]);

  const sectionFilteredCustomers = useMemo(() => {
    return categoryFilteredCustomers.filter((customer) => {
      if (sectionView === "on_hold") return customer.status === "ON_HOLD";
      if (sectionView === "archived") return customer.status === "ARCHIVED";
      return customer.status !== "ON_HOLD" && customer.status !== "ARCHIVED";
    });
  }, [categoryFilteredCustomers, sectionView]);

  useEffect(() => {
    setCustomerPage(1);
  }, [search, sectionView, statusView, selectedCategories]);

  const workflowCounts = useMemo(() => {
    return WORKFLOW_STEPS.reduce<Record<string, number>>((acc, step) => {
      acc[step.status] = sectionFilteredCustomers.filter((customer) => customer.status === step.status).length;
      return acc;
    }, {});
  }, [sectionFilteredCustomers]);

  const crmKPIs = useMemo(() => {
    const now = Date.now();
    const visible = sectionFilteredCustomers;
    const activePipeline = visible.filter((c) => c.status !== "ARCHIVED" && c.status !== "CLIENT").length;
    const onHoldDue = visible.filter((c) => c.status === "ON_HOLD" && c.followUpDate && new Date(c.followUpDate).getTime() <= now).length;
    const assignedClients = visible.filter((c) => c.status === "CLIENT" && !!(assignedMap[c.customerId] || c.assignedTo)).length;
    const withCases = visible.filter((c) => (caseCounts[c.customerId] || 0) > 0).length;
    return {
      totalVisible: visible.length,
      activePipeline,
      onHoldDue,
      assignedClients,
      withCases,
    };
  }, [sectionFilteredCustomers, assignedMap, caseCounts]);

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
    INTAKE: "bg-muted text-foreground",
    SEND_PROPOSAL: "bg-blue-50 text-blue-800",
    WAITING_APPROVAL: "bg-amber-50 text-amber-800",
    SEND_CONTRACT: "bg-violet-50 text-violet-800",
    WAITING_ACCEPTANCE: "bg-orange-50 text-orange-800",
    SEND_RESPONSE: "bg-cyan-50 text-cyan-800",
    CONFIRMED: "bg-emerald-50 text-emerald-800",
    CLIENT: "bg-emerald-50 text-emerald-800",
    ARCHIVED: "bg-muted text-muted-foreground",
    CONSULTATION_SCHEDULED: "bg-blue-50 text-blue-800",
    CONSULTATION_DONE: "bg-emerald-50 text-emerald-800",
    ON_HOLD: "bg-amber-50 text-amber-800",
  };

  const customerTableColumns = showMoreCustomerColumns ? 7 : 5;

  const hasCustomerFilters = Boolean(search) || sectionView !== "main" || statusView !== "all" || selectedCategories.length !== CATEGORY_OPTIONS.length;

  const resetCustomerFilters = () => {
    setSearch("");
    setSectionView("main");
    setStatusView("all");
    setSelectedCategories([...CATEGORY_OPTIONS]);
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
        patched.expectedVersion = original?.version ?? 1;
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
        toast({ title: "Updated", description: "Customer updated successfully" });
        try { await loadCustomers(); } catch (e) { /* ignore reload errors */ }
        try { if (selectedId) await loadCustomerDetail(selectedId); } catch (e) { /* ignore */ }
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unable to save customer";
      if (/conflict/i.test(errorMessage)) {
        toast({ title: "Save conflict", description: "This customer was changed by another user. Reloaded latest data.", variant: "destructive" });
      } else {
        toast({ title: "Save failed", description: errorMessage, variant: "destructive" });
      }
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
      // If current user is intake and confirming to CLIENT, require assignee selection
      if (user?.role === 'intake' && status === 'CLIENT') {
        setConfirmAssignCustomerId(customerId);
        setShowConfirmAssign(true);
        return;
      }

      const current = customers.find((c) => c.customerId === customerId);
      // optimistic update
      setCustomers((prev) => prev.map((c) => (c.customerId === customerId ? { ...c, status } : c)));
      if (selectedCustomer?.customerId === customerId) setSelectedCustomer({ ...selectedCustomer, status });
      await updateCustomer(customerId, { status, expectedVersion: current?.version ?? 1 });
      toast({ title: 'Status updated' });
      await loadCustomers();
      if (selectedId) await loadCustomerDetail(selectedId);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unable to update status';
      if (/conflict/i.test(errorMessage)) {
        toast({ title: 'Update conflict', description: 'This customer was changed by another user. Reloaded latest data.', variant: 'destructive' });
      } else {
        toast({ title: 'Update failed', description: errorMessage, variant: 'destructive' });
      }
      await loadCustomers();
    }
  };

  const handleAdvanceStatus = async (customer: Customer) => {
    const next = getNextWorkflowStatus(customer.status);
    if (!next) {
      toast({ title: "No next step", description: "This customer is already at the final workflow stage." });
      return;
    }
    await handleSetStatus(customer.customerId, next);
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
      const current = customers.find((c) => c.customerId === confirmAssignCustomerId);
      await updateCustomer(confirmAssignCustomerId, {
        status: 'CLIENT',
        assignedTo: confirmAssignSelected,
        expectedVersion: current?.version ?? 1,
      });
      toast({ title: 'Client confirmed', description: `Assigned to ${confirmAssignSelected}` });
      setShowConfirmAssign(false);
      setConfirmAssignCustomerId(null);
      await loadCustomers();
      if (selectedId) await loadCustomerDetail(selectedId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (/conflict/i.test(message)) {
        toast({ title: 'Confirm conflict', description: 'This customer was changed by another user. Reloaded latest data.', variant: 'destructive' });
        await loadCustomers();
      } else {
        toast({ title: 'Confirm failed', description: message, variant: 'destructive' });
      }
    }
  };

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
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Visible Customers</div>
              <div className="text-lg font-semibold">{crmKPIs.totalVisible}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Active Pipeline</div>
              <div className="text-lg font-semibold">{crmKPIs.activePipeline}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">On-Hold Due</div>
              <div className="text-lg font-semibold">{crmKPIs.onHoldDue}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Assigned Clients</div>
              <div className="text-lg font-semibold">{crmKPIs.assignedClients}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Customers with Cases</div>
              <div className="text-lg font-semibold">{crmKPIs.withCases}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="h-4 w-4" /> Client Workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2">
                <button
                  type="button"
                  onClick={() => setStatusView("all")}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${statusView === "all" ? "bg-muted border-primary/30" : "bg-card hover:bg-muted"}`}
                >
                  <div className="text-xs font-semibold">All</div>
                  <div className="mt-0.5 text-sm font-semibold">{sectionFilteredCustomers.length}</div>
                </button>
                {WORKFLOW_STEPS.map((step) => {
                  const active = statusView === step.status;
                  return (
                    <button
                      key={step.status}
                      type="button"
                      onClick={() => setStatusView(step.status)}
                      className={`rounded-md border px-3 py-2 text-left transition-colors ${active ? "bg-muted border-primary/30" : "bg-card hover:bg-muted"}`}
                    >
                      <div className="text-xs font-semibold">{step.title}</div>
                      <div className="text-[11px] text-muted-foreground">{step.subtitle}</div>
                      <div className="mt-1 text-sm font-semibold">{workflowCounts[step.status] || 0}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Workflow path: Intake → Proposal → Approval → Contract → Acceptance → Response → Client.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
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
              {(user?.role === 'intake' || user?.role === 'admin') && (
                <Button onClick={openCreate} className="flex items-center gap-2" size="sm">
                  <Plus className="h-4 w-4" /> New Customer
                </Button>
              )}
            </div>
            {hasCustomerFilters && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-1 text-xs hover:bg-muted">
                    Search: {search}
                    <Plus className="h-3 w-3 rotate-45" />
                  </button>
                )}
                {sectionView !== "main" && (
                  <button type="button" onClick={() => setSectionView("main")} className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-1 text-xs hover:bg-muted">
                    Section: {sectionView === "on_hold" ? "On Hold" : "Archived"}
                    <Plus className="h-3 w-3 rotate-45" />
                  </button>
                )}
                {statusView !== "all" && (
                  <button type="button" onClick={() => setStatusView("all")} className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-1 text-xs hover:bg-muted">
                    Status: {LEAD_STATUS_LABELS[statusView]}
                    <Plus className="h-3 w-3 rotate-45" />
                  </button>
                )}
                {selectedCategories.length !== CATEGORY_OPTIONS.length && (
                  <button type="button" onClick={() => setSelectedCategories([...CATEGORY_OPTIONS])} className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-1 text-xs hover:bg-muted">
                    Categories: {selectedCategories.length}
                    <Plus className="h-3 w-3 rotate-45" />
                  </button>
                )}
                <Button variant="ghost" size="sm" onClick={resetCustomerFilters}>Clear all</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  {showMoreCustomerColumns && <TableHead>Contact</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  {showMoreCustomerColumns && <TableHead className="text-right">Cases</TableHead>}
                  <TableHead className="w-[220px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedCustomers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={customerTableColumns} className="text-center text-sm text-muted-foreground py-6">
                      <div className="flex flex-col items-center gap-2">
                        <span>No customers match the selected categories/search.</span>
                        <Button variant="outline" size="sm" onClick={resetCustomerFilters}>Clear filters</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {groupedCustomers.flatMap((group) => ([
                  <TableRow key={`group-${group.type}-header`} className="bg-muted/30">
                    <TableCell colSpan={customerTableColumns} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                        <TableRow key={`${group.type}-${c.customerId}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedId(c.customerId)}>
                          <TableCell className="font-mono text-xs">{c.customerId}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          {showMoreCustomerColumns && (
                            <TableCell className="text-sm text-muted-foreground">{c.phone || c.email || "—"}</TableCell>
                          )}
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusAccent[c.status]}`}>
                              {LEAD_STATUS_LABELS[c.status]}
                            </span>
                          </TableCell>
                          <TableCell className="text-right flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">{c.followUpDate ? safeFormatDate(c.followUpDate) : "—"}</span>
                          </TableCell>
                          {showMoreCustomerColumns && (
                            <TableCell className="text-right">
                              <div className="inline-flex items-center gap-2">
                                {c.notes && <StickyNote className="h-4 w-4 text-muted-foreground" />}
                                <Badge variant="secondary">{caseCount}</Badge>
                              </div>
                            </TableCell>
                          )}
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

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-8"
                                    disabled={!getNextWorkflowStatus(c.status)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAdvanceStatus(c).catch(() => {});
                                    }}
                                  >
                                    Advance
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Move to next workflow step</TooltipContent>
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
            </div>

            <div className="md:hidden space-y-2 p-3">
              {groupedCustomers.length === 0 && (
                <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <span>No customers match the selected categories/search.</span>
                    <Button variant="outline" size="sm" onClick={resetCustomerFilters}>Clear filters</Button>
                  </div>
                </div>
              )}
              {groupedCustomers.flatMap((group) => (
                collapsedCategories.includes(group.type)
                  ? []
                  : group.items.map((c) => {
                    const caseCount = caseCounts[c.customerId] || 0;
                    const assignedTo = assignedMap[c.customerId] || c.assignedTo || "Unassigned";
                    return (
                      <div
                        key={`mobile-${group.type}-${c.customerId}`}
                        onClick={() => setSelectedId(c.customerId)}
                        className="w-full rounded-md border p-3 text-left cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs text-muted-foreground">{c.customerId} • {group.type}</div>
                          </div>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusAccent[c.status]}`}>
                            {LEAD_STATUS_LABELS[c.status]}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <div>{c.phone} • {c.email}</div>
                          <div>Assigned: {assignedTo}</div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <Badge variant="secondary">{caseCount} case{caseCount === 1 ? "" : "s"}</Badge>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!getNextWorkflowStatus(c.status)}
                              onClick={() => handleAdvanceStatus(c).catch(() => {})}
                            >
                              Advance
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openEdit(c.customerId)}>Edit</Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(c.customerId)}>Delete</Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              ))}
            </div>
          </CardContent>
        </Card>

        {statusFilteredCustomers.length > 0 && (
          <Card>
            <CardContent className="flex items-center justify-between p-3">
              <div className="text-xs text-muted-foreground">
                Showing page {customerPage} of {customerTotalPages} ({statusFilteredCustomers.length} filtered customers)
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={customerPage <= 1} onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={customerPage >= customerTotalPages} onClick={() => setCustomerPage((p) => Math.min(customerTotalPages, p + 1))}>
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      {/* Create / Edit customer */}
      <Dialog open={showForm} onOpenChange={(o) => !o && setShowForm(false)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Customer" : "New Customer"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update customer details and save changes." : "Create a new customer record."}
            </DialogDescription>
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
        onStateChanged={async () => {
          const activeCustomerId = selectedIdRef.current;
          await loadCustomers();
          if (activeCustomerId) {
            await loadCustomerDetail(activeCustomerId);
          }
        }}
      />
    </MainLayout>
  );
};

export default Customers;
