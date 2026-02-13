import { useCallback, useEffect, useState, useRef } from "react";
import {
  getCaseById, getCustomerById, getHistoryByCaseId, getNotesByCaseId,
  getTasksByCaseId, changeState, addNote, addTask, toggleTask, updateCase, deleteCase,
} from "@/lib/case-store";
import {
  ALLOWED_TRANSITIONS, STATE_LABELS, CaseState, PRIORITY_CONFIG, ALL_STATES, Priority,
  Case, Customer, HistoryRecord, Note, CaseTask, LAWYERS,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight, FileText, User, Clock, MessageSquare,
  CheckSquare, AlertTriangle, Phone, Mail, MapPin, Zap,
} from "lucide-react";
import { format, isPast, differenceInHours } from "date-fns";
import { getDeadlineNotification, mapStageToState } from "@/lib/utils";
import { mapCaseStateToStage } from "@/lib/utils";

interface CaseDetailProps {
  caseId: string | null;
  open: boolean;
  onClose: () => void;
  onStateChanged: () => void;
}

export function CaseDetail({ caseId, open, onClose, onStateChanged }: CaseDetailProps) {
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [caseHistory, setCaseHistory] = useState<HistoryRecord[]>([]);
  const [caseNotes, setCaseNotes] = useState<Note[]>([]);
  const [caseTasks, setCaseTasks] = useState<CaseTask[]>([]);
  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const previousCaseIdRef = useRef<string | null>(null);
  const [editForm, setEditForm] = useState({
    category: "",
    subcategory: "",
    state: "INTAKE" as any,
    documentState: "ok" as "ok" | "missing",
    communicationMethod: "",
    generalNote: "",
    priority: "medium" as Priority,
    deadline: "",
    assignedTo: "",
  });
  const { toast } = useToast();
  const loadCaseData = useCallback(async (id: string) => {
    try {
      const data = await getCaseById(id);
      if (!data) {
        setCaseData(null);
        return;
      }
      setCaseData(data);
      setCustomer(await getCustomerById(data.customerId));
      setCaseHistory(await getHistoryByCaseId(id));
      setCaseNotes(await getNotesByCaseId(id));
      setCaseTasks(await getTasksByCaseId(id));
      // Only exit edit mode if we're actually editing AND the ID is different (fresh load)
      if (editMode && previousCaseIdRef.current !== id) {
        setEditMode(false);
      }
      setEditForm({
        category: data.category,
        subcategory: data.subcategory,
        // represent case state as UI stage
        state: mapCaseStateToStage(data.state),
        documentState: data.documentState,
        communicationMethod: data.communicationMethod,
        generalNote: data.generalNote ?? "",
        priority: data.priority,
        deadline: data.deadline ? data.deadline.slice(0, 10) : "",
        assignedTo: data.assignedTo,
      });
      previousCaseIdRef.current = id;
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to load case", variant: "destructive" });
    }
  }, [toast, editMode]);

  useEffect(() => {
    if (!caseId) {
      setCaseData(null);
      setCustomer(null);
      setCaseHistory([]);
      setCaseNotes([]);
      setCaseTasks([]);
      return;
    }
    loadCaseData(caseId);
  }, [caseId, loadCaseData]);

  if (!caseId || !caseData) return null;

  const c = caseData;
  const allowedNext = ALLOWED_TRANSITIONS[c.state];
  const pCfg = PRIORITY_CONFIG[c.priority];
  const overdue = c.deadline && isPast(new Date(c.deadline));
  const deadlineNotif = getDeadlineNotification(c.deadline, c.caseId);

  const handleChangeState = async (newState: CaseState) => {
    try {
      await changeState(caseId, newState);
      toast({ title: "State Changed", description: `→ ${STATE_LABELS[newState]}` });
      onStateChanged();
      await loadCaseData(caseId);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || isLoading) return;
    try {
      setIsLoading(true);
      const optimisticNote: Note = {
        noteId: `temp-${Date.now()}`,
        caseId,
        noteText: noteText.trim(),
        date: new Date().toISOString(),
      };
      setCaseNotes([...caseNotes, optimisticNote]);
      setNoteText("");
      await addNote(caseId, noteText.trim());
      await loadCaseData(caseId);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
      await loadCaseData(caseId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTask = async () => {
    if (!taskTitle.trim() || isLoading) return;
    try {
      setIsLoading(true);
      const optimisticTask: CaseTask = {
        taskId: `temp-${Date.now()}`,
        caseId,
        title: taskTitle.trim(),
        done: false,
        dueDate: null,
      };
      setCaseTasks([...caseTasks, optimisticTask]);
      setTaskTitle("");
      await addTask(caseId, taskTitle.trim(), null);
      await loadCaseData(caseId);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
      await loadCaseData(caseId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    if (isLoading) return;
    try {
      setIsLoading(true);
      // Optimistic update
      setCaseTasks(caseTasks.map(t => t.taskId === taskId ? { ...t, done: !t.done } : t));
      await toggleTask(taskId);
      // Light refresh - only get tasks instead of full reload
      const updatedTasks = await getTasksByCaseId(caseId);
      setCaseTasks(updatedTasks);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
      // Reload to restore correct state on error
      const tasks = await getTasksByCaseId(caseId);
      setCaseTasks(tasks);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (isLoading) return;
    try {
      setIsLoading(true);
      const targetId = c.caseId;
      // Optimistically update local state
      const updatedCaseData: Case = {
        ...caseData,
        category: editForm.category,
        subcategory: editForm.subcategory,
        state: mapStageToState(editForm.state),
        documentState: editForm.documentState,
        communicationMethod: editForm.communicationMethod,
        generalNote: editForm.generalNote,
        priority: editForm.priority,
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : null,
        assignedTo: editForm.assignedTo,
      };
      setCaseData(updatedCaseData);
      setEditMode(false);

      // Send update to backend
      await updateCase(targetId, {
        ...editForm,
        state: mapStageToState(editForm.state),
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : null,
      } as any);
      
      onStateChanged();
      // Minimal reload to ensure consistency
      await loadCaseData(targetId);
      toast({ title: "Case updated", description: "Changes saved successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
      // Reload on error to restore correct state
      await loadCaseData(c.caseId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCase = async () => {
    const confirmed = window.confirm("Delete this case and related records?");
    if (!confirmed) return;
    try {
      await deleteCase(caseId);
      onStateChanged();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  const handleToggleReady = async () => {
    if (!caseId || !caseData) return;
    try {
      setIsLoading(true);
      await updateCase(caseId, { readyForWork: !caseData.readyForWork } as any);
      await loadCaseData(caseId);
      toast({ title: caseData.readyForWork ? "Marked not ready" : "Marked ready" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to update", variant: "destructive" });
      await loadCaseData(caseId);
    } finally {
      setIsLoading(false);
    }
  };

  const doneCount = caseTasks.filter((t) => t.done).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl flex-wrap">
            <FileText className="h-5 w-5" />
            {c.caseId}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pCfg.color}`}>
              {pCfg.label}
            </span>
            {deadlineNotif && (
              <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold ${
                deadlineNotif.severity === 'destructive' 
                  ? 'bg-destructive/10 text-destructive' 
                  : 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-300'
              }`}>
                <Zap className="h-3.5 w-3.5" />
                {deadlineNotif.message}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{c.category} — {c.subcategory} • Assigned to {c.assignedTo}</DialogDescription>
          <div className="flex gap-2 mt-2">
            {!editMode && <Button variant="outline" size="sm" onClick={() => setEditMode(true)} disabled={isLoading}>Edit</Button>}
            {editMode && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditMode(false)} disabled={isLoading}>Cancel</Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={isLoading}>{isLoading ? "Saving..." : "Save"}</Button>
              </>
            )}
            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDeleteCase} disabled={isLoading}>Delete</Button>
            <Button variant="outline" size="sm" onClick={handleToggleReady} disabled={isLoading || mapCaseStateToStage(c.state) === "AWAITING"}>
              {caseData?.readyForWork ? "Unmark Ready" : "Mark Ready"}
            </Button>
          </div>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Case Info + Customer side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Case Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">State</span><Badge>{STATE_LABELS[c.state]}</Badge></div>
                {!editMode && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Documents</span><Badge variant={c.documentState === "ok" ? "default" : "destructive"}>{c.documentState}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Communication</span><span>{c.communicationMethod}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Assigned</span><span>{c.assignedTo}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pCfg.color}`}>{pCfg.label}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Last Change</span><span className="text-xs">{format(new Date(c.lastStateChange), "PPp")}</span></div>
                    {c.deadline && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Deadline</span><span className={`text-xs ${overdue ? "text-destructive font-bold" : ""}`}>{format(new Date(c.deadline), "PP")}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">Ready</span><span>{c.readyForWork ? <Badge className="text-xs">Ready for work</Badge> : <span className="text-xs text-muted-foreground">No</span>}</span></div>
                    <Separator />
                    <p className="text-muted-foreground text-xs whitespace-pre-wrap">{c.generalNote}</p>
                  </>
                )}
                {editMode && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Category</span>
                        <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Subcategory</span>
                        <Input value={editForm.subcategory} onChange={(e) => setEditForm({ ...editForm, subcategory: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Priority</span>
                        <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v as Priority })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Documents</span>
                        <Select value={editForm.documentState} onValueChange={(v) => setEditForm({ ...editForm, documentState: v as "ok" | "missing" })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ok">OK</SelectItem>
                            <SelectItem value="missing">Missing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Communication</span>
                        <Input value={editForm.communicationMethod} onChange={(e) => setEditForm({ ...editForm, communicationMethod: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Assigned To</span>
                        <Select value={editForm.assignedTo} onValueChange={(v) => setEditForm({ ...editForm, assignedTo: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LAWYERS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Deadline</span>
                        <Input type="date" value={editForm.deadline} onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">General Note</span>
                      <Textarea value={editForm.generalNote} onChange={(e) => setEditForm({ ...editForm, generalNote: e.target.value })} className="min-h-[80px]" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {customer && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" /> Customer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="font-medium text-base">{customer.name}</div>
                  <Badge variant="outline" className="text-xs">{customer.customerType}</Badge>
                  <div className="space-y-1 mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{customer.phone}</div>
                    <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{customer.email}</div>
                    <div className="flex items-center gap-2"><MapPin className="h-3 w-3" />{customer.address}</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{customer.country}</div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* State Transitions */}
          {allowedNext.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><ArrowRight className="h-4 w-4" /> Change State</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {allowedNext.map((ns) => (
                  <Button key={ns} size="sm" onClick={() => handleChangeState(ns)}>→ {STATE_LABELS[ns]}</Button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Tasks */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckSquare className="h-4 w-4" /> Tasks
                <span className="text-xs text-muted-foreground ml-auto">{doneCount}/{caseTasks.length} done</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="New task..." value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddTask()} disabled={isLoading} />
                <Button size="sm" onClick={handleAddTask} disabled={isLoading}>{isLoading ? "Adding..." : "Add"}</Button>
              </div>
              {caseTasks.length > 0 && (
                <div className="space-y-1">
                  {caseTasks.map((t) => (
                    <div key={t.taskId} className={`flex items-center gap-3 rounded-md border p-2 text-sm ${t.done ? "opacity-50" : ""}`}>
                      <Checkbox checked={t.done} onCheckedChange={() => handleToggleTask(t.taskId)} disabled={isLoading} />
                      <span className={t.done ? "line-through" : ""}>{t.title}</span>
                      {t.dueDate && (
                        <span className={`ml-auto text-xs ${isPast(new Date(t.dueDate)) && !t.done ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                          Due {format(new Date(t.dueDate), "MMM d")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* History */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> State History</CardTitle>
              </CardHeader>
              <CardContent>
                {caseHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transitions yet.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {caseHistory.map((h) => (
                        <TableRow key={h.historyId}>
                          <TableCell><Badge variant="outline" className="text-xs">{STATE_LABELS[h.stateFrom]}</Badge></TableCell>
                          <TableCell><Badge className="text-xs">{STATE_LABELS[h.stateIn]}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{format(new Date(h.date), "MMM d, HH:mm")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Textarea placeholder="Add a note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="min-h-[50px]" disabled={isLoading} />
                  <Button onClick={handleAddNote} className="self-end" size="sm" disabled={isLoading}>{isLoading ? "Adding..." : "Add"}</Button>
                </div>
                {caseNotes.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {caseNotes.map((n) => (
                      <div key={n.noteId} className="rounded-md border p-2">
                        <p className="text-sm">{n.noteText}</p>
                        <p className="text-xs text-muted-foreground mt-1">{format(new Date(n.date), "MMM d, HH:mm")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
