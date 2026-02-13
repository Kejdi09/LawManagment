import { Case, CaseState, STATE_LABELS, PRIORITY_CONFIG } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow, isPast } from "date-fns";
import { AlertTriangle, Clock, Zap } from "lucide-react";
import { getDeadlineNotification } from "@/lib/utils";

interface CaseTableProps {
  state: CaseState;
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
          <CardTitle className="text-lg">{STATE_LABELS[state]}</CardTitle>
          <Badge variant="secondary" className="text-xs">{cases.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
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
              const overdue = c.deadline && isPast(new Date(c.deadline));
              const pCfg = PRIORITY_CONFIG[c.priority];
              const deadlineNotif = getDeadlineNotification(c.deadline, c.caseId);
              return (
                <TableRow
                  key={c.caseId}
                  className={`cursor-pointer ${overdue ? "bg-destructive/5" : ""}`}
                  onClick={() => onSelectCase(c.caseId)}
                >
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
                    {deadlineNotif ? (
                      <span className={deadlineNotif.severity === 'destructive'
                        ? 'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold bg-destructive/10 text-destructive'
                        : 'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-300'
                      }>
                        {deadlineNotif.severity === 'destructive' ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {deadlineNotif.message}
                      </span>
                    ) : c.deadline ? (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(c.deadline), { addSuffix: true })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}\n                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.assignedTo}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.lastStateChange), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
