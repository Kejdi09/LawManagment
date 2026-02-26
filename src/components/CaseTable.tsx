import { Case, CaseStage, STAGE_LABELS, ALL_STAGES, Priority, PRIORITY_CONFIG } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isPast } from "date-fns";
import { formatDate, stripProfessionalTitle } from "@/lib/utils";
import { Clock } from "lucide-react";

const PRIORITY_DOT: Record<Priority, string> = {
  urgent: "bg-red-500",
  high:   "bg-orange-400",
  medium: "bg-amber-400",
  low:    "bg-emerald-400",
};

interface CaseTableProps {
  state: CaseStage;
  cases: Case[];
  onSelectCase: (caseId: string) => void;
  customerNames?: Record<string, string>;
  showMoreColumns?: boolean;
  personLabel?: string;
  onQuickStateChange?: (caseId: string, newState: string) => void;
}

export function CaseTable({ state, cases, onSelectCase, customerNames = {}, showMoreColumns = false, personLabel = "Person", onQuickStateChange }: CaseTableProps) {
  if (cases.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg">{STAGE_LABELS[state]}</CardTitle>
          <Badge variant="secondary" className="text-xs">{cases.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Desktop / tablet: full table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table className={showMoreColumns ? "min-w-[1250px]" : "min-w-[920px]"}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Case ID</TableHead>
                <TableHead className="w-[160px]">{personLabel}</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-[110px]">Assigned</TableHead>
                <TableHead className="w-[160px]">Due</TableHead>
                {showMoreColumns && <TableHead className="w-[90px]">Docs</TableHead>}
                {onQuickStateChange && <TableHead className="w-[160px]">Move to</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => {
                const customerName = customerNames[c.customerId];
                const overdue = c.deadline && isPast(new Date(c.deadline));
                const dueSoon = !!c.deadline && !overdue && (new Date(c.deadline).getTime() - Date.now()) <= 48 * 60 * 60 * 1000;
                const priority = (c.priority as Priority) || "medium";
                const rowClassName = overdue
                  ? "bg-destructive/10 border-l-4 border-l-destructive"
                  : dueSoon
                    ? "bg-amber-100/70 border-l-4 border-l-amber-500"
                    : "";
                return (
                  <TableRow key={c.caseId} className={`cursor-pointer transition-colors hover:bg-muted/50 ${rowClassName}`} onClick={() => onSelectCase(c.caseId)}>
                    <TableCell className="font-mono text-xs font-medium">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {c.caseId}
                        {c.caseType && (
                          <span className={`inline-flex rounded px-1 py-0 text-[10px] font-semibold uppercase tracking-wide ${
                            c.caseType === "client"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                              : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                          }`}>
                            {c.caseType === "client" ? "Client" : "Customer"}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>{customerName ?? c.customerId}</div>
                      <div className="text-xs text-muted-foreground font-mono">{c.customerId}</div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[priority]}`}
                          title={PRIORITY_CONFIG[priority]?.label ?? priority}
                        />
                        {c.title
                          ? <span className="text-sm">{c.title}</span>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                      <div className="mt-0.5 ml-4">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_CONFIG[priority]?.color ?? ""}`}>
                          {PRIORITY_CONFIG[priority]?.label ?? priority}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.category}{c.subcategory ? ` / ${c.subcategory}` : ""}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{stripProfessionalTitle(c.assignedTo) || c.assignedTo || "—"}</TableCell>
                    <TableCell className={`text-xs ${overdue ? "text-destructive font-semibold" : dueSoon ? "text-amber-700 font-medium" : ""}`}>
                      {c.deadline ? (
                        <span className={`flex items-center gap-1 ${overdue ? "text-destructive" : dueSoon ? "text-amber-700" : "text-muted-foreground"}`}>
                          <Clock className="h-3 w-3" />
                          {formatDate(c.deadline)}
                          {overdue && <span className="text-[10px] font-semibold text-destructive ml-0.5">Overdue</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No deadline</span>
                      )}
                    </TableCell>
                    {showMoreColumns && (
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.documentState === "missing" ? "bg-destructive/10 text-destructive" : "bg-green-100 text-green-700"}`}>
                          {c.documentState === "missing" ? "Missing" : "OK"}
                        </span>
                      </TableCell>
                    )}
                    {onQuickStateChange && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={c.state}
                          onValueChange={(v) => onQuickStateChange(c.caseId, v)}
                        >
                          <SelectTrigger className="h-7 text-xs w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ALL_STAGES.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">{STAGE_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile: condensed list cards */}
        <div className="sm:hidden space-y-2 p-2">
          {cases.map((c) => {
            const customerName = customerNames[c.customerId];
            const overdue = c.deadline && isPast(new Date(c.deadline));
            const dueSoon = !!c.deadline && !overdue && (new Date(c.deadline).getTime() - Date.now()) <= 48 * 60 * 60 * 1000;
            const priority = (c.priority as Priority) || "medium";
            const rowClassName = overdue
              ? "bg-destructive/10 border-l-4 border-l-destructive"
              : dueSoon
                ? "bg-amber-100/70 border-l-4 border-l-amber-500"
                : "";
            return (
              <button key={c.caseId} onClick={() => onSelectCase(c.caseId)} className={`w-full text-left rounded-md p-3 border ${rowClassName}`}>
                <div className="flex items-start gap-3">
                  <div className="font-mono text-xs font-medium">{c.caseId}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[priority]}`} />
                      <div className="font-medium text-sm truncate">{customerName ?? c.customerId}</div>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{c.customerId}</div>
                    {c.title && <div className="text-xs font-medium mt-0.5 truncate">{c.title}</div>}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_CONFIG[priority]?.color ?? ""}`}>
                        {PRIORITY_CONFIG[priority]?.label ?? priority}
                      </span>
                      <div className="text-xs text-muted-foreground">{c.deadline ? formatDate(c.deadline) : "No deadline"}</div>
                    </div>
                    {onQuickStateChange && (
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <Select value={c.state} onValueChange={(v) => onQuickStateChange(c.caseId, v)}>
                          <SelectTrigger className="h-6 text-[11px] w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ALL_STAGES.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">{STAGE_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

