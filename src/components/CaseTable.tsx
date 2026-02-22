import { Case, PRIORITY_CONFIG, CaseStage, STAGE_LABELS } from "@/lib/types";
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
  showMoreColumns?: boolean;
}

export function CaseTable({ state, cases, onSelectCase, customerNames = {}, showMoreColumns = false }: CaseTableProps) {
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
          <Table className={showMoreColumns ? "min-w-[860px]" : "min-w-[560px]"}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Case ID</TableHead>
                <TableHead>Customer</TableHead>
                {showMoreColumns && <TableHead>Category</TableHead>}
                <TableHead className="w-[220px]">Due</TableHead>
                {showMoreColumns && <TableHead className="w-[90px]">Docs</TableHead>}
                {showMoreColumns && <TableHead className="w-[100px]">Assigned</TableHead>}
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
                  <TableRow key={c.caseId} className={`cursor-pointer transition-colors hover:bg-muted/50 ${rowClassName}`} onClick={() => onSelectCase(c.caseId)}>
                    <TableCell className="font-mono text-xs font-medium">{c.caseId}</TableCell>
                    <TableCell className="font-medium">{customerName ?? c.customerId}</TableCell>
                    {showMoreColumns && <TableCell className="text-muted-foreground text-sm">{c.category} / {c.subcategory}</TableCell>}
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pCfg.color}`}>
                          {pCfg.label}
                        </span>
                        {c.deadline ? (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(c.deadline)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No deadline</span>
                        )}
                      </div>
                    </TableCell>
                    {showMoreColumns && (
                      <TableCell>
                        <Badge variant={c.documentState === "ok" ? "default" : "destructive"} className="text-xs">
                          {c.documentState}
                        </Badge>
                      </TableCell>
                    )}
                    {showMoreColumns && <TableCell className="text-xs text-muted-foreground">{c.assignedTo}</TableCell>}
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
                    <div className="text-muted-foreground text-xs truncate">{c.category}</div>
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
