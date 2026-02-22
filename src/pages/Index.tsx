import { useState, useCallback, useMemo, useEffect } from "react";
import { getAllCases, searchCases, createCase, getAllCustomers, getConfirmedClients } from "@/lib/case-store";
import { ALL_STAGES, Priority, LAWYERS, Customer, STAGE_LABELS, CaseStage } from "@/lib/types";
import { mapCaseStateToStage, mapStageToState } from "@/lib/utils";
import { CaseTable } from "@/components/CaseTable";
import { CaseDetail } from "@/components/CaseDetail";
import { DashboardKPIs } from "@/components/DashboardKPIs";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { AlertTriangle, CalendarClock, KanbanSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import MainLayout from "@/components/MainLayout";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { user } = useAuth();
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
  const isAdmin = user?.role === "admin";
  const currentLawyer = user?.consultantName || user?.lawyerName || "";

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const [caseList, setCaseList] = useState<any[]>([]);
  const [stageFilter, setStageFilter] = useState<"all" | CaseStage>("all");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const loadCases = useCallback(async () => {
    const all = await getAllCases();
    const base = query ? await searchCases(query) : all;

    const filtered = base.filter((c) => {
      if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
      if (docFilter !== "all" && c.documentState !== docFilter) return false;
      return true;
    });
    setCaseList(filtered);
  }, [query, priorityFilter, docFilter, customers]);

  useEffect(() => {
    (async () => {
      const [customers, confirmedClients] = await Promise.all([getAllCustomers(), getConfirmedClients()]);
      const map = [...customers, ...confirmedClients].reduce<Record<string, string>>((acc, c) => {
        acc[c.customerId] = c.name;
        return acc;
      }, {});
      setCustomers(confirmedClients);
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

  const workflowStageSummary = useMemo(() => {
    return ALL_STAGES.map((stage) => ({
      stage,
      count: caseList.filter((c) => mapCaseStateToStage(c.state) === stage).length,
    }));
  }, [caseList]);

  const todaysQueue = useMemo(() => {
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    const overdue = caseList.filter((c) => c.deadline && new Date(c.deadline).getTime() < now);
    const dueToday = caseList.filter((c) => {
      if (!c.deadline) return false;
      const ts = new Date(c.deadline).getTime();
      return ts >= now && ts <= in24h;
    });
    const waiting = caseList.filter((c) => {
      const stage = mapCaseStateToStage(c.state);
      return stage === "WAITING_CUSTOMER" || stage === "WAITING_AUTHORITIES";
    });
    const topItems = [...overdue, ...dueToday, ...waiting]
      .filter((item, idx, arr) => arr.findIndex((x) => x.caseId === item.caseId) === idx)
      .slice(0, 5);

    return {
      overdue,
      dueToday,
      waiting,
      topItems,
    };
  }, [caseList]);

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
      assignedTo: isAdmin ? LAWYERS[0] : (currentLawyer || LAWYERS[0]),
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
        assignedTo: isAdmin ? caseForm.assignedTo : (currentLawyer || caseForm.assignedTo),
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
    <MainLayout
      title="Cases"
      right={<Button size="sm" onClick={openCreateCase}>New Case</Button>}
    >
      <div className="space-y-6">
        <DashboardKPIs key={tick} />

        <Card>
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
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${stageFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
                >
                  <div className="text-xs font-semibold">All Stages</div>
                  <div className={`text-[11px] ${stageFilter === "all" ? "text-primary-foreground/90" : "text-muted-foreground"}`}>full pipeline</div>
                  <div className="mt-1 text-sm font-semibold">{caseList.length}</div>
                </button>
                {workflowStageSummary.map((entry) => {
                  const active = stageFilter === entry.stage;
                  return (
                    <button
                      key={entry.stage}
                      type="button"
                      onClick={() => setStageFilter(entry.stage)}
                      className={`rounded-md border px-3 py-2 text-left transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
                    >
                      <div className="text-xs font-semibold">{STAGE_LABELS[entry.stage]}</div>
                      <div className={`text-[11px] ${active ? "text-primary-foreground/90" : "text-muted-foreground"}`}>workflow lane</div>
                      <div className="mt-1 text-sm font-semibold">{entry.count}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4" />
              Today's Queue
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Overdue Deadlines</div>
                <div className="text-xl font-semibold text-destructive">{todaysQueue.overdue.length}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Due in 24h</div>
                <div className="text-xl font-semibold">{todaysQueue.dueToday.length}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Waiting on Response</div>
                <div className="text-xl font-semibold">{todaysQueue.waiting.length}</div>
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
                      <div className="text-xs text-muted-foreground">{customerNames[item.customerId] ?? item.customerId} • {item.category}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {item.deadline && new Date(item.deadline).getTime() < Date.now() && (
                        <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" />Overdue</span>
                      )}
                      <Badge variant="outline">{STAGE_LABELS[mapCaseStateToStage(item.state)]}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <KanbanSquare className="h-4 w-4" />
              Case Command Bar
            </div>
            <SearchFilterBar
              query={query}
              onQueryChange={setQuery}
              priorityFilter={priorityFilter}
              onPriorityChange={setPriorityFilter}
              docFilter={docFilter}
              onDocFilterChange={setDocFilter}
            />
          </CardContent>
        </Card>

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
      </div>

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
              <label className="text-sm font-medium">Assigned Consultant</label>
              {isAdmin ? (
                <Select value={caseForm.assignedTo} onValueChange={(v) => setCaseForm({ ...caseForm, assignedTo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LAWYERS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={currentLawyer || "My Cases"} disabled />
              )}
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
    </MainLayout>
  );
};

export default Index;
