import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllCustomers } from "@/lib/case-store";
import { Customer, LEAD_STATUS_LABELS } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, ChevronRight } from "lucide-react";

type PendingGroup = {
  status: "WAITING_APPROVAL" | "WAITING_ACCEPTANCE" | "AWAITING_PAYMENT";
  label: string;
  color: string;
  badgeClass: string;
  customers: Customer[];
  oldestDays: number | null;
};

const PENDING_STATUSES: PendingGroup["status"][] = [
  "WAITING_APPROVAL",
  "WAITING_ACCEPTANCE",
  "AWAITING_PAYMENT",
];

function daysSince(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86_400_000);
}

function oldestDaysInGroup(customers: Customer[]): number | null {
  const days = customers
    .map((c) => {
      const lastChange = c.statusHistory?.[c.statusHistory.length - 1]?.date;
      return daysSince(lastChange ?? c.registeredAt);
    })
    .filter((d): d is number => d !== null);
  return days.length > 0 ? Math.max(...days) : null;
}

export function PendingActionsWidget() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<PendingGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllCustomers()
      .then((all) => {
        const result: PendingGroup[] = PENDING_STATUSES.map((status) => {
          const matches = all.filter((c) => c.status === status);
          return {
            status,
            label: LEAD_STATUS_LABELS[status] ?? status,
            color:
              status === "AWAITING_PAYMENT"
                ? "red"
                : status === "WAITING_ACCEPTANCE"
                ? "orange"
                : "amber",
            badgeClass:
              status === "AWAITING_PAYMENT"
                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200"
                : status === "WAITING_ACCEPTANCE"
                ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200",
            customers: matches,
            oldestDays: oldestDaysInGroup(matches),
          };
        });
        setGroups(result);
      })
      .finally(() => setLoading(false));
  }, []);

  const total = groups.reduce((s, g) => s + g.customers.length, 0);

  if (!loading && total === 0) return null;

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Pending Client Actions
          {total > 0 && (
            <Badge variant="outline" className="ml-auto text-xs bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              {total} waiting
            </Badge>
          )}
        </div>
        {loading ? (
          <div className="text-xs text-muted-foreground animate-pulse">Loading…</div>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <button
                key={g.status}
                type="button"
                onClick={() => navigate("/customers")}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge className={`shrink-0 text-[11px] ${g.badgeClass}`}>
                    {g.label}
                  </Badge>
                  {g.oldestDays !== null && g.oldestDays > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      oldest {g.oldestDays}d
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-foreground shrink-0">
                  {g.customers.length}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
