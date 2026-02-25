import { Case, CaseStage, STAGE_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { isPast } from "date-fns";
import { formatDate, stripProfessionalTitle } from "@/lib/utils";
import { Clock } from "lucide-react";

interface CaseTableProps {
  state: CaseStage;
  cases: Case[];
  onSelectCase: (caseId: string) => void;
  customerNames?: Record<string, string>;
  showMoreColumns?: boolean;
  personLabel?: string;
}

export function CaseTable({ state, cases, onSelectCase, customerNames = {}, showMoreColumns = false, personLabel = "Person" }: CaseTableProps) {
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
          <Table className={showMoreColumns ? "min-w-[1150px]" : "min-w-[860px]"}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Case ID</TableHead>
                <TableHead className="w-[160px]">{personLabel}</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-[110px]">Assigned</TableHead>
                <TableHead className="w-[160px]">Due</TableHead>
                {showMoreColumns && <TableHead className="w-[90px]">Docs</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => {
                const customerName = customerNames[c.customerId];
                const overdue = c.deadline && isPast(new Date(c.deadline));
                const dueSoon = !!c.deadline && !overdue && (new Date(c.deadline).getTime() - Date.now()) <= 48 * 60 * 60 * 1000;
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
                      {c.title
                        ? <span className="text-sm">{c.title}</span>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.category}{c.subcategory ? ` / ${c.subcategory}` : ""}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{stripProfessionalTitle(c.assignedTo) || c.assignedTo || "—"}</TableCell>
                    <TableCell className={`text-xs ${overdue ? "text-destructive font-semibold" : dueSoon ? "text-amber-700 font-medium" : ""}`}>
                      {c.deadline ? (
                        <span className={`flex items-center gap-1 ${overdue ? "text-destructive" : dueSoon ? "text-amber-700" : "text-muted-foreground"}`}>
                          <Clock className="h-3 w-3" />
                          {formatDate(c.deadline)}
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
            const rowClassName = overdue
              ? "bg-destructive/10 border-l-4 border-l-destructive"
              : dueSoon
                ? "bg-amber-100/70 border-l-4 border-l-amber-500"
                : "";
            return (
              <button key={c.caseId} onClick={() => onSelectCase(c.caseId)} className={`w-full text-left rounded-md p-3 border ${rowClassName}`}>
                <div className="flex items-start gap-3">
                  <div className="font-mono text-xs font-medium">{c.caseId}</div>
                  <div className="flex-1">
                    <div className="font-medium text-sm truncate">{customerName ?? c.customerId}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.customerId}</div>
                    {c.title && <div className="text-xs font-medium mt-0.5 truncate">{c.title}</div>}
                    <div className="mt-2 text-xs text-muted-foreground ml-auto">{c.deadline ? formatDate(c.deadline) : 'No deadline'}</div>
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
