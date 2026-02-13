import { useState, useCallback, useMemo, useEffect } from "react";
import { getAllCases, searchCases, createCase, getAllCustomers } from "@/lib/case-store";
import { ALL_STAGES, Priority, LAWYERS, Customer, STAGE_LABELS, CaseStage } from "@/lib/types";
import { mapCaseStateToStage, mapStageToState } from "@/lib/utils";
import { CaseTable } from "@/components/CaseTable";
import { CaseDetail } from "@/components/CaseDetail";
import { DashboardKPIs } from "@/components/DashboardKPIs";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Scale, Users, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [docFilter, setDocFilter] = useState<"all" | "ok" | "missing">("all");
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [caseForm, setCaseForm] = useState({
    customerId: "",
    category: "",
    subcategory: "",
    state: "INTAKE" as CaseStage,
    documentState: "ok" as "ok" | "missing",
    communicationMethod: "Email",
    generalNote: "",
    priority: "medium" as Priority,
    deadline: "",
    assignedTo: LAWYERS[0],
  });

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const [caseList, setCaseList] = useState<any[]>([]);
  const [stageFilter, setStageFilter] = useState<"all" | CaseStage>("all");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [alerts, setAlerts] = useState<
    { id: string; customerId: string; caseId?: string; message?: string; kind: "follow" | "respond" | "deadline"; severity: "warn" | "critical" }[]
  >([]);
  const [seenAlertIds, setSeenAlertIds] = useState<Set<string>>(new Set());
  const [alertHintShown, setAlertHintShown] = useState(false);
  const { toast } = useToast();

  const loadCases = useCallback(async () => {
    const all = await getAllCases();
    const base = query ? await searchCases(query) : all;

    // Compute alerts from the full dataset (not filtered by search)
    const now = Date.now();
    const alertsComputed = all.flatMap((c) => {
      const last = c.lastStateChange ? new Date(c.lastStateChange).getTime() : 0;
      const hours = last ? (now - last) / (1000 * 60 * 60) : 0;
      const items: { id: string; customerId: string; caseId?: string; message?: string; kind: "follow" | "respond" | "deadline"; severity: "warn" | "critical" }[] = [];
      // Map legacy state to logical stage for alerting
      const stage = mapCaseStateToStage(c.state);
      const isWaiting = stage === "WAITING_CUSTOMER" || stage === "WAITING_AUTHORITIES";
      if (isWaiting && hours >= 48 && hours < 72) {
        items.push({ id: `${c.caseId}-wait-48`, customerId: c.customerId, kind: "follow", severity: "warn" });
      }
      if (isWaiting && hours >= 72 && hours < 96) {
        items.push({ id: `${c.caseId}-wait-72`, customerId: c.customerId, kind: "follow", severity: "critical" });
      }
      if (isWaiting && hours >= 96 && hours < 120) {
        items.push({ id: `${c.caseId}-wait-96`, customerId: c.customerId, kind: "follow", severity: "critical" });
      }

      const isSend = stage === "WAITING_CUSTOMER";
      if (isSend && hours >= 12) {
        items.push({ id: `${c.caseId}-send-12`, customerId: c.customerId, caseId: c.caseId, message: `Respond: ${c.caseId}`, kind: "respond", severity: "warn" });
      }

      // Deadline notifications
      if (c.deadline) {
        const deadlineTime = new Date(c.deadline).getTime();
        const hoursUntilDeadline = Math.max(0, (deadlineTime - now) / (1000 * 60 * 60));
        
        // Case is overdue
        if (deadlineTime < now) {
          items.push({ id: `${c.caseId}-overdue`, customerId: c.customerId, caseId: c.caseId, message: `Overdue: ${c.caseId}`, kind: "deadline", severity: "critical" });
        }
        // Deadline within 48 hours
        else if (hoursUntilDeadline <= 48) {
          items.push({ id: `${c.caseId}-deadline-48`, customerId: c.customerId, caseId: c.caseId, message: `${c.caseId} due in ${Math.ceil(hoursUntilDeadline)}h`, kind: "deadline", severity: "warn" });
        }
      }

      return items;
    });

    // Add customer status notifications
    const customerAlerts = customers.flatMap((customer) => {
      const items: { id: string; customerId: string; caseId?: string; message?: string; kind: "follow" | "respond" | "deadline"; severity: "warn" | "critical" }[] = [];
      
      if (!customer.statusHistory || customer.statusHistory.length === 0) return items;
      
      const lastStatusChange = new Date(customer.statusHistory[customer.statusHistory.length - 1].date).getTime();
      const hoursSinceChange = (now - lastStatusChange) / (1000 * 60 * 60);
      
      const waitingStatuses = ["WAITING_APPROVAL", "WAITING_ACCEPTANCE"];
      const respondStatuses = ["SEND_RESPONSE"];
      
      if (waitingStatuses.includes(customer.status)) {
        if (hoursSinceChange >= 48 && hoursSinceChange < 72) {
          items.push({ id: `${customer.customerId}-cust-wait-48`, customerId: customer.customerId, kind: "follow", severity: "warn" });
        }
        if (hoursSinceChange >= 72 && hoursSinceChange < 96) {
          items.push({ id: `${customer.customerId}-cust-wait-72`, customerId: customer.customerId, kind: "follow", severity: "critical" });
        }
        if (hoursSinceChange >= 96 && hoursSinceChange < 120) {
          items.push({ id: `${customer.customerId}-cust-wait-96`, customerId: customer.customerId, kind: "follow", severity: "critical" });
        }
      }
      
      if (respondStatuses.includes(customer.status) && hoursSinceChange >= 24) {
        items.push({ id: `${customer.customerId}-cust-respond`, customerId: customer.customerId, kind: "respond", severity: "warn" });
      }
      
      return items;
    });

    setAlerts([...alertsComputed, ...customerAlerts]);

    const filtered = base.filter((c) => {
      if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
      if (docFilter !== "all" && c.documentState !== docFilter) return false;
      return true;
    });
    setCaseList(filtered);
  }, [query, priorityFilter, docFilter, customers]);

  useEffect(() => {
    (async () => {
      const customers = await getAllCustomers();
      const map = customers.reduce<Record<string, string>>((acc, c) => {
        acc[c.customerId] = c.name;
        return acc;
      }, {});
      setCustomers(customers);
      setCustomerNames(map);
    })();
  }, []);


  // Filtered cases by state for rendering tables
  const filteredByState = useMemo(
    () => ALL_STAGES.map((stage) => ({
      state: stage,
      cases: caseList.filter((c) => mapCaseStateToStage(c.state) === stage),
    })),
    [caseList]
  );
  const categoryOptions = useMemo(() => Array.from(new Set(caseList.map((c) => c.category))).sort(), [caseList]);
  const subcategoryOptions = useMemo(() => Array.from(new Set(caseList.map((c) => c.subcategory))).sort(), [caseList]);
  const customerOptions = useMemo(
    () => customers.map((c) => ({ id: c.customerId, name: c.name })),
    [customers],
  );
  const criticalCount = useMemo(() => alerts.filter((a) => a.severity === "critical").length, [alerts]);
  const warnCount = useMemo(() => alerts.filter((a) => a.severity === "warn").length, [alerts]);
  const totalAlerts = criticalCount + warnCount;
  const unreadCount = useMemo(() => alerts.filter((a) => !seenAlertIds.has(a.id)).length, [alerts, seenAlertIds]);

  // One-time hint toast if any alerts are present
  useEffect(() => {
    if (alertHintShown) return;
    if (alerts.length === 0) return;
    toast({ title: "Check notifications", description: "Open the bell to view follow-ups and responses." });
    setAlertHintShown(true);
  }, [alerts, toast, alertHintShown]);

  const openCreateCase = () => {
    setCaseForm({
      customerId: "",
      category: "",
      subcategory: "",
      state: "IN_PROGRESS",
      documentState: "ok",
      communicationMethod: "Email",
      generalNote: "",
      priority: "medium",
      deadline: "",
      assignedTo: LAWYERS[0],
    });
    setShowCaseForm(true);
  };

  const handleCreateCase = async () => {
    if (!caseForm.customerId || !caseForm.category) {
      toast({ title: "Validation", description: "Customer and Category are required", variant: "destructive" });
      return;
    }
    try {
      // Map UI stage (state) to a legacy CaseState for backend
      const mappedState = mapStageToState(caseForm.state as any);
      await createCase({
        ...caseForm,
        state: mappedState,
        deadline: caseForm.deadline ? new Date(caseForm.deadline).toISOString() : null,
      } as any);
      setShowCaseForm(false);
      toast({ title: "Case created successfully" });
      setTick((t) => t + 1);
      await loadCases();
    } catch (err: any) {
      toast({ title: "Create failed", description: err?.message ?? "Unable to create case", variant: "destructive" });
    }
  };

  // Load cases on mount and when refreshed (tick)
  useEffect(() => {
    loadCases().catch((err) => {
      console.error("Failed to load cases:", err);
    });
  }, [tick, loadCases]);

  
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center gap-3">
          <Scale className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">Case Management</h1>
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu
              onOpenChange={(open) => {
                if (open) {
                  setSeenAlertIds((prev) => {
                    const next = new Set(prev);
                    alerts.forEach((a) => next.add(a.id));
                    return next;
                  });
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <Badge
                      variant={criticalCount > 0 ? "destructive" : "secondary"}
                      className="absolute -top-1 -right-2 px-1.5 text-[10px]"
                    >
                      {unreadCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {alerts.length === 0 && <DropdownMenuItem disabled>No alerts</DropdownMenuItem>}
                {alerts.map((a) => {
                  const name = customerNames[a.customerId] ? `${customerNames[a.customerId]} (${a.customerId})` : a.customerId;
                  // Use explicit message when available, fall back to kind-based label
                  const message = a.message ?? (a.kind === "deadline" ? "Deadline" : a.kind === "respond" ? "Respond" : "Follow up");
                  return (
                    <DropdownMenuItem key={a.id} className={a.severity === "critical" ? "text-destructive" : ""}>
                      <div className="flex flex-col">
                        <span>{message}</span>
                        <span className="text-xs text-muted-foreground">{name}</span>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => navigate("/customers")}>
              <Users className="h-4 w-4 mr-1" /> Customers
            </Button>
            <Button className="ml-2" size="sm" onClick={openCreateCase}>New Case</Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <DashboardKPIs key={tick} />

        <SearchFilterBar
          query={query}
          onQueryChange={setQuery}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
          docFilter={docFilter}
          onDocFilterChange={setDocFilter}
        />
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as any)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {ALL_STAGES.map((s) => (<SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredByState.map(({ state, cases }) => {
          if (stageFilter !== "all" && state !== stageFilter) return null;
          return (
            <CaseTable
              key={state}
              state={state}
              cases={cases}
              customerNames={customerNames}
              onSelectCase={setSelectedCaseId}
            />
          );
        })}

        {filteredByState.every(({ cases }) => cases.length === 0) && (
          <div className="text-center py-12 text-muted-foreground">
            No cases match your filters.
          </div>
        )}
      </main>

      <CaseDetail
        caseId={selectedCaseId}
        open={!!selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
        onStateChanged={refresh}
      />

      <Dialog open={showCaseForm} onOpenChange={(o) => !o && setShowCaseForm(false)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Case</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer ID *</label>
              <Input
                list="customer-ids"
                autoComplete="off"
                value={caseForm.customerId}
                onChange={(e) => setCaseForm({ ...caseForm, customerId: e.target.value })}
                placeholder="C001"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assigned To</label>
              <Select value={caseForm.assignedTo} onValueChange={(v) => setCaseForm({ ...caseForm, assignedTo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LAWYERS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category *</label>
              <Input
                list="category-options"
                autoComplete="off"
                value={caseForm.category}
                onChange={(e) => setCaseForm({ ...caseForm, category: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subcategory</label>
              <Input list="subcategory-options" autoComplete="off" value={caseForm.subcategory} onChange={(e) => setCaseForm({ ...caseForm, subcategory: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">State</label>
              <Select value={caseForm.state} onValueChange={(v) => setCaseForm({ ...caseForm, state: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <Select value={caseForm.priority} onValueChange={(v) => setCaseForm({ ...caseForm, priority: v as Priority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Documents</label>
              <Select value={caseForm.documentState} onValueChange={(v) => setCaseForm({ ...caseForm, documentState: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Communication</label>
              <Input value={caseForm.communicationMethod} onChange={(e) => setCaseForm({ ...caseForm, communicationMethod: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Deadline</label>
              <Input type="date" value={caseForm.deadline} onChange={(e) => setCaseForm({ ...caseForm, deadline: e.target.value })} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium">General Note</label>
              <Textarea value={caseForm.generalNote} onChange={(e) => setCaseForm({ ...caseForm, generalNote: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCaseForm(false)}>Cancel</Button>
            <Button onClick={handleCreateCase}>Create Case</Button>
          </div>
          <datalist id="customer-ids">
            {customerOptions.map((o) => (
              <option key={o.id} value={o.id}>{`${o.id} — ${o.name}`}</option>
            ))}
          </datalist>
          <datalist id="category-options">
            {categoryOptions.map((c) => (<option key={c} value={c} />))}
          </datalist>
          <datalist id="subcategory-options">
            {subcategoryOptions.map((s) => (<option key={s} value={s} />))}
          </datalist>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
