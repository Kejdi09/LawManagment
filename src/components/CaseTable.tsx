import { Case, PRIORITY_CONFIG, CaseStage, STAGE_LABELS } from "@/lib/types";
import { mapCaseStateToStage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { isPast } from "date-fns";
import { formatDate } from "@/lib/utils";
import { Clock } from "lucide-react";

interface CaseTableProps {
  state: CaseStage;
  cases: Case[];
  onSelectCase: (caseId: string) => void;
  customerNames?: Record<string, string>;
}

export function CaseTable({ state, cases, onSelectCase, customerNames = {} }: CaseTableProps) {
  if (cases.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg">{STAGE_LABELS[state]}</CardTitle>
          <Badge variant="secondary" className="text-xs">{cases.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Desktop / tablet: full table */}
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Case ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-[90px]">Priority</TableHead>
                <TableHead className="w-[90px]">Docs</TableHead>
                <TableHead className="w-[120px]">Deadline</TableHead>
                <TableHead className="w-[100px]">Assigned</TableHead>
                <TableHead className="w-[120px]">Last Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => {
                const customerName = customerNames[c.customerId];
                const pCfg = PRIORITY_CONFIG[c.priority];
                const overdue = c.deadline && isPast(new Date(c.deadline));
                const dueSoon = !!c.deadline && !overdue && (new Date(c.deadline).getTime() - Date.now()) <= 48 * 60 * 60 * 1000;
                const rowClassName = overdue ? "bg-destructive/5" : dueSoon ? "bg-yellow-50/70 dark:bg-yellow-900/20" : "";
                return (
                  <TableRow key={c.caseId} className={`cursor-pointer ${rowClassName}`} onClick={() => onSelectCase(c.caseId)}>
                    <TableCell className="font-mono text-xs font-medium">{c.caseId}</TableCell>
                    <TableCell className="font-medium">{customerName ?? c.customerId}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.category} / {c.subcategory}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pCfg.color}`}>
                        {pCfg.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.documentState === "ok" ? "default" : "destructive"} className="text-xs">
                        {c.documentState}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.deadline ? (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(c.deadline)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.assignedTo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(c.lastStateChange, true)}
                    </TableCell>
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
            const pCfg = PRIORITY_CONFIG[c.priority];
            const overdue = c.deadline && isPast(new Date(c.deadline));
            const dueSoon = !!c.deadline && !overdue && (new Date(c.deadline).getTime() - Date.now()) <= 48 * 60 * 60 * 1000;
            const rowClassName = overdue ? "bg-destructive/5" : dueSoon ? "bg-yellow-50/70" : "";
            return (
              <button key={c.caseId} onClick={() => onSelectCase(c.caseId)} className={`w-full text-left rounded-md p-3 border ${rowClassName}`}>
                <div className="flex items-start gap-3">
                  <div className="font-mono text-xs font-medium">{c.caseId}</div>
                  <div className="flex-1">
                    <div className="font-medium text-sm truncate">{customerName ?? c.customerId}</div>
                    <div className="text-muted-foreground text-xs truncate">{c.category} • {c.subcategory}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pCfg.color}`}>{pCfg.label}</span>
                      <Badge variant={c.documentState === "ok" ? "default" : "destructive"} className="text-xs">{c.documentState}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{c.deadline ? formatDate(c.deadline) : '—'}</span>
                    </div>
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
