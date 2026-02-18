import { useCallback, useEffect, useState, useRef } from "react";
import {
  getCaseById, getCustomerById, getHistoryByCaseId, getNotesByCaseId,
  getTasksByCaseId, addHistory, addNote, addTask, toggleTask, deleteTask, updateCase, deleteCase,
  getDocuments, uploadDocument, deleteDocument, fetchDocumentBlob, StoredDocument,
} from "@/lib/case-store";
import {
  ALL_STAGES, STAGE_LABELS, CaseStage, PRIORITY_CONFIG, Priority,
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
import { useAuth } from "@/lib/auth-context";
import {
  FileText, User, Clock, MessageSquare,
  CheckSquare, AlertTriangle, Phone, Mail, MapPin, Zap, Trash2, MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { isPast, differenceInHours } from "date-fns";
import { getDeadlineNotification, mapStageToState, formatDate } from "@/lib/utils";
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
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTaskBusy, setIsTaskBusy] = useState(false);
  const [isNoteBusy, setIsNoteBusy] = useState(false);
  const previousCaseIdRef = useRef<string | null>(null);
  const [editForm, setEditForm] = useState({
    category: "",
    subcategory: "",
    state: "INTAKE" as CaseStage,
    documentState: "ok" as "ok" | "missing",
    communicationMethod: "",
    generalNote: "",
    priority: "medium" as Priority,
    deadline: "",
    assignedTo: "",
  });
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const currentLawyer = user?.consultantName || user?.lawyerName || "";
  const getErrorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
  const formatOptionalDateTime = (value: string | null | undefined) => {
    if (!value) return "N/A";
    const includeTime = String(value).includes("T");
    return formatDate(value, includeTime);
  };
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
      try {
        const docs = await getDocuments('case', id);
        setDocuments(docs);
      } catch (e) {
        setDocuments([]);
      }
      previousCaseIdRef.current = id;
    } catch (err: unknown) {
      toast({ title: "Error", description: getErrorMessage(err, "Failed to load case"), variant: "destructive" });
    }
  }, [toast, editMode]);

  const handleUploadDocument = async (file?: File) => {
    if (!file || !caseId) return;
    try {
      setIsLoading(true);
      await uploadDocument('case', caseId, file);
      const docs = await getDocuments('case', caseId);
      setDocuments(docs);
      toast({ title: 'Uploaded', description: 'Document uploaded' });
    } catch (err: unknown) {
      toast({ title: 'Upload failed', description: String(err), variant: 'destructive' });
    } finally { setIsLoading(false); }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      setIsLoading(true);
      await deleteDocument(docId);
      setDocuments((d) => d.filter((x) => x.docId !== docId));
      toast({ title: 'Deleted', description: 'Document removed' });
    } catch (err: unknown) {
      toast({ title: 'Delete failed', description: String(err), variant: 'destructive' });
    } finally { setIsLoading(false); }
  };

  const handlePreviewDocument = async (docId: string) => {
    try {
      setIsLoading(true);
      const { blob } = await fetchDocumentBlob(docId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      toast({ title: "Preview failed", description: getErrorMessage(err, "Unable to preview document"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadDocument = async (docId: string, originalName?: string) => {
    try {
      setIsLoading(true);
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
      toast({ title: "Download failed", description: getErrorMessage(err, "Unable to download document"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

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
  const pCfg = PRIORITY_CONFIG[c.priority];
  const overdue = c.deadline && isPast(new Date(c.deadline));
  const deadlineNotif = getDeadlineNotification(c.deadline, c.caseId);

  const handleChangeState = async (newStage: CaseStage) => {
    const currentStage = mapCaseStateToStage(c.state);
    if (newStage === "NEW" && currentStage !== "NEW") {
      toast({ title: "Invalid transition", description: "Case cannot go back to New after it has progressed.", variant: "destructive" });
      return;
    }
    const currentState = c.state;
    const nextState = mapStageToState(newStage);
    if (currentState === nextState) return;
    try {
      await addHistory(caseId, currentState, nextState);
      toast({ title: "State Changed", description: `→ ${STAGE_LABELS[newStage]}` });
      onStateChanged();
      await loadCaseData(caseId);
    } catch (err: unknown) {
      toast({ title: "Error", description: getErrorMessage(err, "Failed"), variant: "destructive" });
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || isNoteBusy) return;
    const text = noteText.trim();
    const optimisticNote: Note = {
      noteId: `temp-${Date.now()}`,
      caseId,
      noteText: text,
      date: new Date().toISOString(),
    };
    try {
      setIsNoteBusy(true);
      setCaseNotes((prev) => [optimisticNote, ...prev]);
      setNoteText("");
      const created = await addNote(caseId, text);
      setCaseNotes((prev) => prev.map((note) => (note.noteId === optimisticNote.noteId ? created : note)));
    } catch (err: unknown) {
      toast({ title: "Error", description: getErrorMessage(err, "Failed"), variant: "destructive" });
      setCaseNotes((prev) => prev.filter((note) => note.noteId !== optimisticNote.noteId));
    } finally {
      setIsNoteBusy(false);
    }
  };

  const handleAddTask = async () => {
    if (!taskTitle.trim() || isTaskBusy) return;
    const title = taskTitle.trim();
    const optimisticTask: CaseTask = {
      taskId: `temp-${Date.now()}`,
      caseId,
      title,
      done: false,
      createdAt: new Date().toISOString(),
      dueDate: null,
    };
    try {
      setIsTaskBusy(true);
      setCaseTasks((prev) => [...prev, optimisticTask]);
      setTaskTitle("");
      const created = await addTask(caseId, title, null);
      setCaseTasks((prev) => prev.map((task) => (task.taskId === optimisticTask.taskId ? created : task)));
    } catch (err: unknown) {
      toast({ title: "Error", description: getErrorMessage(err, "Failed"), variant: "destructive" });
      setCaseTasks((prev) => prev.filter((task) => task.taskId !== optimisticTask.taskId));
    } finally {
      setIsTaskBusy(false);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    if (isTaskBusy) return;
    const previous = caseTasks;
    try {
      setIsTaskBusy(true);
      // Optimistic update
      setCaseTasks(caseTasks.map(t => t.taskId === taskId ? { ...t, done: !t.done } : t));
      await toggleTask(taskId);
    } catch (err: unknown) {
      toast({ title: "Error", description: getErrorMessage(err, "Failed"), variant: "destructive" });
      setCaseTasks(previous);
    } finally {
      setIsTaskBusy(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (isTaskBusy) return;
    const previous = caseTasks;
    try {
      setIsTaskBusy(true);
      setCaseTasks((prev) => prev.filter((task) => task.taskId !== taskId));
      await deleteTask(taskId);
    } catch (err: unknown) {
      toast({ title: "Error", description: getErrorMessage(err, "Failed"), variant: "destructive" });
      setCaseTasks(previous);
    } finally {
      setIsTaskBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (isLoading) return;
    try {
      setIsLoading(true);
      const targetId = c.caseId;
      const currentStage = mapCaseStateToStage(c.state);
      if (editForm.state === "NEW" && currentStage !== "NEW") {
        toast({ title: "Invalid transition", description: "Case cannot go back to New after it has progressed.", variant: "destructive" });
        setIsLoading(false);
        return;
      }
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
        assignedTo: isAdmin ? editForm.assignedTo : (currentLawyer || editForm.assignedTo),
      };
      setCaseData(updatedCaseData);
      setEditMode(false);

      // Send update to backend
      const updatePayload: Partial<Case> = {
        ...editForm,
        assignedTo: isAdmin ? editForm.assignedTo : (currentLawyer || editForm.assignedTo),
        state: mapStageToState(editForm.state),
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : null,
      };
      const saved = await updateCase(targetId, updatePayload);
      // Use server response to update local state immediately (avoid extra fetch)
      if (saved) setCaseData(saved as Case);
      onStateChanged();
      toast({ title: "Case updated", description: "Changes saved successfully" });
    } catch (err: unknown) {
      toast({ title: "Error", description: getErrorMessage(err, "Failed"), variant: "destructive" });
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
    } catch (err: unknown) {
      toast({ title: "Error", description: getErrorMessage(err, "Failed"), variant: "destructive" });
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
                <div className="flex justify-between"><span className="text-muted-foreground">State</span><Badge>{STAGE_LABELS[mapCaseStateToStage(c.state)]}</Badge></div>
                {!editMode && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Documents</span><Badge variant={c.documentState === "ok" ? "default" : "destructive"}>{c.documentState}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Communication</span><span>{c.communicationMethod}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Assigned</span><span>{c.assignedTo}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pCfg.color}`}>{pCfg.label}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Last Change</span><span className="text-xs">{formatOptionalDateTime(c.lastStateChange)}</span></div>
                    {c.deadline && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Deadline</span><span className={`text-xs ${overdue ? "text-destructive font-bold" : ""}`}>{formatOptionalDateTime(c.deadline)}</span></div>
                    )}
                    
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
                        <span className="text-xs text-muted-foreground">State</span>
                        <Select value={editForm.state} onValueChange={(v) => setEditForm({ ...editForm, state: v as CaseStage })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ALL_STAGES.map((stage) => (
                              <SelectItem key={stage} value={stage}>{STAGE_LABELS[stage]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                        <span className="text-xs text-muted-foreground">Assigned Consultant</span>
                        {isAdmin ? (
                          <Select value={editForm.assignedTo} onValueChange={(v) => setEditForm({ ...editForm, assignedTo: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {LAWYERS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input value={currentLawyer || editForm.assignedTo} disabled />
                        )}
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

            {/* Documents */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files && handleUploadDocument(e.target.files[0])} />
                  <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>Upload</Button>
                </div>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.docId} className="flex items-center gap-2 rounded-md border p-2">
                        <span className="font-medium truncate max-w-[220px]" title={doc.originalName}>{doc.originalName}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{new Date(doc.uploadedAt).toLocaleString()}</span>
                        <div className="ml-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex items-center rounded-md px-2 py-1 border">
                              <MoreVertical className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handlePreviewDocument(doc.docId)}>Preview</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownloadDocument(doc.docId, doc.originalName)}>Download</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeleteDocument(doc.docId)} className="text-destructive">Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
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
                  {/* country removed; keep address for location */}
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Change State</CardTitle>
            </CardHeader>
            <CardContent className="max-w-sm">
              <Select
                value={mapCaseStateToStage(c.state)}
                onValueChange={(value) => handleChangeState(value as CaseStage)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>{STAGE_LABELS[stage]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

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
                <Input placeholder="New task..." value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddTask()} disabled={isTaskBusy} />
                <Button size="sm" onClick={handleAddTask} disabled={isTaskBusy}>{isTaskBusy ? "Adding..." : "Add"}</Button>
              </div>
              {caseTasks.length > 0 && (
                <div className="space-y-1">
                  {caseTasks.map((t) => (
                    <div key={t.taskId} className={`flex items-center gap-3 rounded-md border p-2 text-sm ${t.done ? "opacity-50" : ""}`}>
                      <Checkbox checked={t.done} onCheckedChange={() => handleToggleTask(t.taskId)} disabled={isTaskBusy} />
                      <span className={t.done ? "line-through" : ""}>{t.title}</span>
                      <div className="ml-auto flex items-center gap-2">
                        {t.dueDate && (
                          <span className={`text-xs ${isPast(new Date(t.dueDate)) && !t.done ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                            Due {formatDate(t.dueDate)}
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDeleteTask(t.taskId)}
                          disabled={isTaskBusy}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
                          <TableCell><Badge variant="outline" className="text-xs">{STAGE_LABELS[mapCaseStateToStage(h.stateFrom)]}</Badge></TableCell>
                          <TableCell><Badge className="text-xs">{STAGE_LABELS[mapCaseStateToStage(h.stateIn)]}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatOptionalDateTime(h.date)}</TableCell>
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
                  <Textarea placeholder="Add a note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="min-h-[50px]" disabled={isNoteBusy} />
                  <Button onClick={handleAddNote} className="self-end" size="sm" disabled={isNoteBusy}>{isNoteBusy ? "Adding..." : "Add"}</Button>
                </div>
                {caseNotes.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {caseNotes.map((n) => (
                      <div key={n.noteId} className="rounded-md border p-2">
                        <p className="text-sm">{n.noteText}</p>
                        <p className="text-xs text-muted-foreground mt-1">{formatOptionalDateTime(n.date)}</p>
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
