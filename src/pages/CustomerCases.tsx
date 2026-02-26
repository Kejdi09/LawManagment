import { useState, useCallback, useMemo, useEffect } from "react";
import { getAllCases, searchCases, createCase, getAllCustomers } from "@/lib/case-store";
import { ALL_STAGES, Priority, INTAKE_LAWYERS, Customer, STAGE_LABELS, CaseStage } from "@/lib/types";
import { mapCaseStateToStage, mapStageToState } from "@/lib/utils";
import { CaseTable } from "@/components/CaseTable";
import { CaseDetail } from "@/components/CaseDetail";
import { DashboardKPIs } from "@/components/DashboardKPIs";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { CalendarClock, ChevronDown, KanbanSquare, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import MainLayout from "@/components/MainLayout";
import CaseAlerts from "@/components/CaseAlerts";
import { useToast } from "@/hooks/use-toast";

type CaseFormState = {
  title: string;
  customerId: string;
  category: string;
  subcategory: string;
  state: CaseStage;
  documentState: "ok" | "missing";
  communicationMethod: string;
  generalNote: string;
  priority: Priority;
  deadline: string;
  assignedTo: string;
};

type SavedCaseView = {
  name: string;
  query: string;
  docFilter: "all" | "ok" | "missing";
  stageFilter: "all" | CaseStage;
};

const SAVED_CASE_VIEWS_KEY = "lm:saved-customer-case-views";
const CASE_COLUMNS_MODE_KEY = "lm:show-more-columns";
const CASE_COLUMNS_MODE_EVENT = "lm-columns-mode-change";
const DASHBOARD_OPEN_KEY = "lm:dashboard-open";

const CASE_TEMPLATES: Array<{
  label: string;
  category: string;
  subcategory: string;
  communicationMethod: string;
  priority: Priority;
}> = [
  { label: "Property Purchase", category: "Real Estate", subcategory: "Property Transfer", communicationMethod: "Email", priority: "medium" },
  { label: "Property Sale", category: "Real Estate", subcategory: "Property Sale", communicationMethod: "Email", priority: "medium" },
  { label: "Residency Application", category: "Immigration", subcategory: "Residency Permit", communicationMethod: "Email", priority: "medium" },
  { label: "Citizenship Application", category: "Immigration", subcategory: "Citizenship", communicationMethod: "Email", priority: "medium" },
  { label: "Company Formation", category: "Business", subcategory: "Company Registration", communicationMethod: "Email", priority: "medium" },
  { label: "Contract Drafting / Review", category: "Contract Law", subcategory: "Contract Review", communicationMethod: "Email", priority: "medium" },
  { label: "Divorce Case", category: "Family Law", subcategory: "Divorce", communicationMethod: "Email", priority: "medium" },
  { label: "Inheritance / Estate", category: "Family Law", subcategory: "Inheritance", communicationMethod: "Email", priority: "medium" },
  { label: "Criminal Defense", category: "Criminal Law", subcategory: "Defense", communicationMethod: "Email", priority: "urgent" },
  { label: "Visa Application", category: "Immigration", subcategory: "Visa", communicationMethod: "Email", priority: "medium" },
];

const CustomerCases = () => {
  const { user } = useAuth();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState<"all" | "ok" | "missing">("all");
  const [showCaseForm, setShowCaseForm] = useState(false);
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";
  const currentLawyer = user?.consultantName || user?.lawyerName || "";
  // Admin and manager assign to the intake team; intake users are locked to themselves
  const availableLawyers = (isAdmin || isManager) ? INTAKE_LAWYERS : [];

  const [caseForm, setCaseForm] = useState<CaseFormState>({
    title: "",
    customerId: "",
    category: "",
    subcategory: "",
    state: "NEW",
    documentState: "ok",
    communicationMethod: "Email",
    generalNote: "",
    priority: "medium",
    deadline: "",
    assignedTo: isAdmin || isManager ? (currentLawyer || INTAKE_LAWYERS[0]) : (currentLawyer || ""),
  });

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const [caseList, setCaseList] = useState<Awaited<ReturnType<typeof getAllCases>>>([]);
  const [stageFilter, setStageFilter] = useState<"all" | CaseStage>("all");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [savedViews, setSavedViews] = useState<SavedCaseView[]>([]);
  const [newViewName, setNewViewName] = useState("");
  const [showMoreCaseColumns, setShowMoreCaseColumns] = useState(true);
  const [dashboardOpen, setDashboardOpen] = useState(() => {
    try { return localStorage.getItem(DASHBOARD_OPEN_KEY) !== "0"; } catch { return true; }
  });
  const [listPage, setListPage] = useState(1);
  const listPageSize = 30;
  const { toast } = useToast();

  const exportCSV = useCallback(() => {
    const header = ["Case ID", "Customer", "Title", "Category", "Subcategory", "Stage", "Assigned To", "Deadline"];
    const rows = caseList.map((c) => [
      c.caseId,
      customerNames[c.customerId] || c.customerId,
      c.title || "",
      c.category,
      c.subcategory || "",
      c.state,
      c.assignedTo || "",
      c.deadline || "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "customer-cases.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [caseList, customerNames]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_CASE_VIEWS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedViews(parsed.filter((x) => x && typeof x.name === "string"));
      }
    } catch {
      setSavedViews([]);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CASE_COLUMNS_MODE_KEY);
      setShowMoreCaseColumns(stored !== "0");
    } catch {
      setShowMoreCaseColumns(true);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      try {
        const stored = localStorage.getItem(CASE_COLUMNS_MODE_KEY);
        setShowMoreCaseColumns(stored !== "0");
      } catch {
        setShowMoreCaseColumns(true);
      }
    };
    window.addEventListener("storage", sync);
    window.addEventListener(CASE_COLUMNS_MODE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CASE_COLUMNS_MODE_EVENT, sync);
    };
  }, []);

  const persistSavedViews = useCallback((views: SavedCaseView[]) => {
    setSavedViews(views);
    localStorage.setItem(SAVED_CASE_VIEWS_KEY, JSON.stringify(views));
  }, []);

  const handleSaveView = useCallback(() => {
    const name = newViewName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Enter a name for this view", variant: "destructive" });
      return;
    }
    const nextView: SavedCaseView = { name, query, docFilter, stageFilter };
    const withoutSameName = savedViews.filter((v) => v.name.toLowerCase() !== name.toLowerCase());
    persistSavedViews([nextView, ...withoutSameName].slice(0, 8));
    setNewViewName("");
    toast({ title: "View saved" });
  }, [newViewName, query, docFilter, stageFilter, savedViews, persistSavedViews, toast]);

  const applySavedView = useCallback((view: SavedCaseView) => {
    setQuery(view.query);
    setDocFilter(view.docFilter);
    setStageFilter(view.stageFilter);
  }, []);

  const deleteSavedView = useCallback((name: string) => {
    persistSavedViews(savedViews.filter((v) => v.name !== name));
  }, [savedViews, persistSavedViews]);

  const loadCases = useCallback(async () => {
    const all = await getAllCases('customer');
    const base = query ? await searchCases(query, 'customer') : all;
    const filtered = base.filter((c) => {
      if (docFilter !== "all" && c.documentState !== docFilter) return false;
      return true;
    });
    setCaseList(filtered);
  }, [query, docFilter]);

  useEffect(() => {
    (async () => {
      // Customer Cases always link to pre-confirmation customers
      const allCustomers = await getAllCustomers();
      const map = allCustomers.reduce<Record<string, string>>((acc, c) => {
        acc[c.customerId] = c.name;
        return acc;
      }, {});
      setCustomers(allCustomers);
      setCustomerNames(map);
    })();
  }, []);

  const filteredByState = useMemo(
    () => ALL_STAGES.map((stage) => ({
      state: stage,
      cases: caseList.filter((c) => mapCaseStateToStage(c.state) === stage),
    })),
    [caseList]
  );

  const totalVisibleCases = useMemo(() => {
    return filteredByState.reduce((sum, group) => {
      if (stageFilter !== "all" && group.state !== stageFilter) return sum;
      return sum + group.cases.length;
    }, 0);
  }, [filteredByState, stageFilter]);

  const totalPages = Math.max(1, Math.ceil(totalVisibleCases / listPageSize));

  const pagedByState = useMemo(() => {
    let remainingStart = (listPage - 1) * listPageSize;
    let remainingTake = listPageSize;
    return filteredByState.map((group) => {
      if (stageFilter !== "all" && group.state !== stageFilter) return { ...group, cases: [] as typeof group.cases };
      if (remainingTake <= 0) return { ...group, cases: [] as typeof group.cases };
      if (remainingStart >= group.cases.length) {
        remainingStart -= group.cases.length;
        return { ...group, cases: [] as typeof group.cases };
      }
      const start = remainingStart;
      const take = Math.min(remainingTake, group.cases.length - start);
      const sliced = group.cases.slice(start, start + take);
      remainingStart = 0;
      remainingTake -= take;
      return { ...group, cases: sliced };
    });
  }, [filteredByState, stageFilter, listPage]);

  const categoryOptions = useMemo(() => Array.from(new Set(caseList.map((c) => c.category))).sort(), [caseList]);
  const subcategoryOptions = useMemo(() => Array.from(new Set(caseList.map((c) => c.subcategory))).sort(), [caseList]);
  const customerOptions = useMemo(() => customers.map((c) => ({ id: c.customerId, name: c.name })), [customers]);

  const workflowStageSummary = useMemo(() => {
    return ALL_STAGES.map((stage) => ({
      stage,
      count: caseList.filter((c) => mapCaseStateToStage(c.state) === stage).length,
    }));
  }, [caseList]);

  useEffect(() => { setListPage(1); }, [query, docFilter, stageFilter]);

  const todaysQueue = useMemo(() => {
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    const dueToday = caseList.filter((c) => {
      if (!c.deadline) return false;
      const ts = new Date(c.deadline).getTime();
      return ts >= now && ts <= in24h;
    });
    return { dueToday, topItems: [...dueToday].slice(0, 5) };
  }, [caseList]);

  const myWorkSummary = useMemo(() => {
    if (isAdmin) {
      return {
        title: "Admin Focus",
        cards: [
          { label: "New Cases", value: caseList.filter((c) => mapCaseStateToStage(c.state) === "NEW").length },
          { label: "Due in 24h", value: todaysQueue.dueToday.length },
          { label: "Need Documents", value: caseList.filter((c) => c.documentState === "missing").length },
        ],
      };
    }
    if (isManager) {
      return {
        title: "Team Focus",
        cards: [
          { label: "Total Cases", value: caseList.length },
          { label: "Due in 24h", value: todaysQueue.dueToday.length },
          { label: "Need Documents", value: caseList.filter((c) => c.documentState === "missing").length },
        ],
      };
    }
    const mine = currentLawyer ? caseList.filter((c) => c.assignedTo === currentLawyer) : [];
    return {
      title: "My Work Today",
      cards: [
        { label: "Assigned to Me", value: mine.length },
        { label: "Due in 24h", value: todaysQueue.dueToday.length },
        { label: "Need Documents", value: caseList.filter((c) => c.documentState === "missing").length },
      ],
    };
  }, [caseList, todaysQueue, currentLawyer, isAdmin, isManager]);

  const openCreateCase = () => {
    setCaseForm({
      title: "",
      customerId: "",
      category: "",
      subcategory: "",
      state: "IN_PROGRESS",
      documentState: "ok",
      communicationMethod: "Email",
      generalNote: "",
      priority: "medium",
      deadline: "",
      assignedTo: (isAdmin || isManager) ? (currentLawyer || INTAKE_LAWYERS[0]) : (currentLawyer || ""),
    });
    setShowCaseForm(true);
  };

  const handleCreateCase = async () => {
    if (!caseForm.title?.trim()) {
      toast({ title: "Title required", description: "Please enter a case title.", variant: "destructive" });
      return;
    }
    if (!caseForm.customerId || !caseForm.category) {
      toast({ title: "Validation", description: "Customer and Category are required", variant: "destructive" });
      return;
    }
    try {
      const mappedState = mapStageToState(caseForm.state);
      const payload = {
        ...caseForm,
        // pass caseScope='customer' so the server knows to look in customersCol for admin too
        caseScope: "customer",
        assignedTo: (isAdmin || isManager) ? caseForm.assignedTo : (currentLawyer || caseForm.assignedTo),
        state: mappedState,
        deadline: caseForm.deadline ? new Date(caseForm.deadline).toISOString() : null,
      };
      await createCase(payload);
      setShowCaseForm(false);
      toast({ title: "Case created successfully" });
      setTick((t) => t + 1);
      await loadCases();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to create case";
      toast({ title: "Create failed", description: message, variant: "destructive" });
    }
  };

  useEffect(() => {
    loadCases().catch((err) => console.error("Failed to load cases:", err));
  }, [tick, loadCases]);

  // Real-time polling: refresh cases every 30s
  useEffect(() => {
    const id = setInterval(() => {
      loadCases().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [loadCases]);

  return (
    <MainLayout
      title="Customer Cases"
      right={<><CaseAlerts filterType="case" caseScope="customer" /><Button size="sm" variant="outline" onClick={exportCSV} title="Export to CSV"><Download className="h-4 w-4 mr-1" />Export</Button><Button size="sm" onClick={openCreateCase}>New Case</Button></>}
    >
      <div className="space-y-4">
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            const next = !dashboardOpen;
            setDashboardOpen(next);
            try { localStorage.setItem(DASHBOARD_OPEN_KEY, next ? "1" : "0"); } catch {}
          }}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${dashboardOpen ? "rotate-0" : "-rotate-90"}`} />
          {dashboardOpen ? "Hide dashboard" : "Show dashboard"}
        </button>

        {dashboardOpen && <DashboardKPIs key={tick} />}

        {dashboardOpen && <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <KanbanSquare className="h-4 w-4" />
              Case Workflow
            </div>
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2">
                <button
                  type="button"
                  onClick={() => setStageFilter("all")}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${stageFilter === "all" ? "bg-muted border-primary/30" : "bg-card hover:bg-muted"}`}
                >
                  <div className="text-xs font-semibold">All Stages</div>
                  <div className="text-[11px] text-muted-foreground">full pipeline</div>
                  <div className="mt-1 text-sm font-semibold">{caseList.length}</div>
                </button>
                {workflowStageSummary.map((entry) => {
                  const active = stageFilter === entry.stage;
                  return (
                    <button
                      key={entry.stage}
                      type="button"
                      onClick={() => setStageFilter(entry.stage)}
                      className={`rounded-md border px-3 py-2 text-left transition-colors ${active ? "bg-muted border-primary/30" : "bg-card hover:bg-muted"}`}
                    >
                      <div className="text-xs font-semibold">{STAGE_LABELS[entry.stage]}</div>
                      <div className="text-[11px] text-muted-foreground">workflow lane</div>
                      <div className="mt-1 text-sm font-semibold">{entry.count}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>}

        {dashboardOpen && <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4" />
              Today's Queue
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Due in 24h</div>
                <div className="text-xl font-semibold">{todaysQueue.dueToday.length}</div>
              </div>
            </div>
            {todaysQueue.topItems.length > 0 && (
              <div className="mt-3 space-y-2">
                {todaysQueue.topItems.map((item) => (
                  <button
                    key={item.caseId}
                    type="button"
                    onClick={() => setSelectedCaseId(item.caseId)}
                    className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <div>
                      <div className="text-sm font-medium">{item.caseId}</div>
                      <div className="text-xs text-muted-foreground">{customerNames[item.customerId] ?? item.customerId} â€¢ {item.category}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">{STAGE_LABELS[mapCaseStateToStage(item.state)]}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>}

        {dashboardOpen && <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="mb-3 text-sm font-semibold">{myWorkSummary.title}</div>
            <div className="grid gap-3 md:grid-cols-3">
              {myWorkSummary.cards.map((card) => (
                <div key={card.label} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{card.label}</div>
                  <div className="text-xl font-semibold">{card.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>}

        <Card>
          <CardContent className="p-3 sm:p-4">
            <SearchFilterBar
              query={query}
              onQueryChange={setQuery}
              docFilter={docFilter}
              onDocFilterChange={setDocFilter}
            />
            <div className="mt-3 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="Save current filters as..."
                  className="sm:max-w-xs"
                />
                <Button size="sm" variant="outline" onClick={handleSaveView}>Save View</Button>
              </div>
              {savedViews.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {savedViews.map((view) => (
                    <div key={view.name} className="flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1">
                      <button type="button" onClick={() => applySavedView(view)} className="text-xs font-medium hover:underline">{view.name}</button>
                      <button type="button" onClick={() => deleteSavedView(view.name)} className="text-xs text-muted-foreground hover:text-foreground" aria-label={`Delete view ${view.name}`}>Ã—</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {pagedByState.map(({ state, cases }) => {
          if (stageFilter !== "all" && state !== stageFilter) return null;
          return (
            <CaseTable
              key={state}
              state={state}
              cases={cases}
              customerNames={customerNames}
              showMoreColumns={showMoreCaseColumns}
              onSelectCase={setSelectedCaseId}
              personLabel="Customer"
            />
          );
        })}

        {totalVisibleCases === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
              <p>No cases match your filters.</p>
              <Button variant="outline" size="sm" onClick={() => { setQuery(""); setDocFilter("all"); setStageFilter("all"); }}>
                Clear filters
              </Button>
            </div>
          </div>
        )}

        {totalVisibleCases > 0 && (
          <Card>
            <CardContent className="flex items-center justify-between p-3">
              <div className="text-xs text-muted-foreground">
                Showing page {listPage} of {totalPages} ({totalVisibleCases} total cases)
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={listPage <= 1} onClick={() => setListPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <Button size="sm" variant="outline" disabled={listPage >= totalPages} onClick={() => setListPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <CaseDetail
        caseId={selectedCaseId}
        open={!!selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
        onStateChanged={refresh}
        availableLawyers={availableLawyers}
      />

      <Dialog open={showCaseForm} onOpenChange={(o) => !o && setShowCaseForm(false)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Customer Case</DialogTitle>
            <DialogDescription>Create a case for a pre-confirmation customer. Additional details can be edited later.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Load Template (optional)</label>
              <Select
                value=""
                onValueChange={(v) => {
                  const tpl = CASE_TEMPLATES.find((t) => t.label === v);
                  if (tpl) {
                    setCaseForm((prev) => ({
                      ...prev,
                      category: tpl.category,
                      subcategory: tpl.subcategory,
                      communicationMethod: tpl.communicationMethod,
                      priority: tpl.priority,
                      title: prev.title || tpl.label,
                    }));
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="— Pick a template to pre-fill —" /></SelectTrigger>
                <SelectContent>
                  {CASE_TEMPLATES.map((t) => (
                    <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium">Case Title <span className="text-destructive">*</span></label>
              <Input
                value={caseForm.title}
                onChange={(e) => setCaseForm({ ...caseForm, title: e.target.value })}
                placeholder="e.g. Family Reunification"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer ID *</label>
              <Select value={caseForm.customerId} onValueChange={(v) => setCaseForm({ ...caseForm, customerId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer…" />
                </SelectTrigger>
                <SelectContent>
                  {customerOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.id} — {o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assigned To</label>
              {(isAdmin || isManager) ? (
                <Select value={caseForm.assignedTo} onValueChange={(v) => setCaseForm({ ...caseForm, assignedTo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableLawyers.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={currentLawyer || "My Cases"} disabled />
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category *</label>
              <Input list="cc-category-options" autoComplete="off" value={caseForm.category} onChange={(e) => setCaseForm({ ...caseForm, category: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subcategory</label>
              <Input list="cc-subcategory-options" autoComplete="off" value={caseForm.subcategory} onChange={(e) => setCaseForm({ ...caseForm, subcategory: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">State</label>
              <Select value={caseForm.state} onValueChange={(v) => setCaseForm({ ...caseForm, state: v as CaseStage })}>
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
              <Select value={caseForm.documentState} onValueChange={(v) => setCaseForm({ ...caseForm, documentState: v as "ok" | "missing" })}>
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

          <datalist id="cc-category-options">
            {categoryOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
          <datalist id="cc-subcategory-options">
            {subcategoryOptions.map((s) => <option key={s} value={s} />)}
          </datalist>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default CustomerCases;
