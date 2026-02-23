import React, { useCallback, useEffect, useMemo, useState } from "react";
import { deleteCustomerNotification, getAllCases, getAllCustomers, getConfirmedClients, getCustomerNotifications } from "@/lib/case-store";
import { mapCaseStateToStage, stripProfessionalTitle } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Customer, CustomerNotification } from "@/lib/types";

export type AlertFilterType = "case" | "customer" | "all";

const DISMISSED_ALERTS_KEY = "dismissed_customer_alerts";
const DISMISSED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getVersionTag(dateValue: string) {
  const ts = new Date(dateValue).getTime();
  if (!Number.isFinite(ts)) return "na";
  return Math.floor(ts / (60 * 60 * 1000)).toString();
}

function readDismissedAlerts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DISMISSED_ALERTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function writeDismissedAlerts(payload: Record<string, number>) {
  try {
    localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function pruneDismissedAlerts(payload: Record<string, number>) {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(payload).filter(([, dismissedAt]) => Number.isFinite(dismissedAt) && now - dismissedAt <= DISMISSED_TTL_MS)
  );
}

function getLastStatusChangeIso(customer: Customer) {
  const history = Array.isArray(customer.statusHistory) ? customer.statusHistory : [];
  const last = history.length > 0 ? history[history.length - 1] : null;
  return last?.date || customer.registeredAt || new Date().toISOString();
}

function buildFallbackNotifications(customers: Customer[]): CustomerNotification[] {
  const nowMs = Date.now();
  return customers.flatMap((customer) => {
    if (customer.status === "CLIENT" || customer.status === "CONFIRMED") return [];
    const lastStatusIso = getLastStatusChangeIso(customer);
    const lastStatusMs = new Date(lastStatusIso).getTime();
    const elapsedHours = Number.isFinite(lastStatusMs) ? (nowMs - lastStatusMs) / (1000 * 60 * 60) : 0;
    const notifications: CustomerNotification[] = [];

    if (customer.status === "INTAKE" && elapsedHours >= 24) {
      notifications.push({
        notificationId: `local-follow-${customer.customerId}-${getVersionTag(lastStatusIso)}`,
        customerId: customer.customerId,
        message: `Follow up ${customer.name}`,
        kind: "follow",
        severity: "warn",
        createdAt: lastStatusIso,
      });
    }

    if ((customer.status === "WAITING_APPROVAL" || customer.status === "WAITING_ACCEPTANCE") && elapsedHours >= 72) {
      notifications.push({
        notificationId: `local-follow72-${customer.customerId}-${getVersionTag(lastStatusIso)}`,
        customerId: customer.customerId,
        message: `Follow up ${customer.name}`,
        kind: "follow",
        severity: "critical",
        createdAt: lastStatusIso,
      });
    }

    if ((customer.status === "SEND_PROPOSAL" || customer.status === "SEND_CONTRACT" || customer.status === "SEND_RESPONSE") && elapsedHours >= 24) {
      notifications.push({
        notificationId: `local-respond-${customer.customerId}-${getVersionTag(lastStatusIso)}`,
        customerId: customer.customerId,
        message: `Respond to ${customer.name}`,
        kind: "respond",
        severity: "warn",
        createdAt: lastStatusIso,
      });
    }

    if (customer.status === "ON_HOLD" && customer.followUpDate) {
      const followUpMs = new Date(customer.followUpDate).getTime();
      if (Number.isFinite(followUpMs) && followUpMs <= nowMs) {
        notifications.push({
          notificationId: `local-onhold-${customer.customerId}-${getVersionTag(customer.followUpDate)}`,
          customerId: customer.customerId,
          message: `Follow up ${customer.name}`,
          kind: "follow",
          severity: "warn",
          createdAt: customer.followUpDate,
        });
      }
    }

    return notifications;
  });
}

type AlertItem = {
  id: string;
  type: "case" | "customer";
  customerId: string;
  caseId?: string;
  message: string;
  kind: "deadline" | "follow" | "respond";
  severity: "warn" | "critical";
};

export const CaseAlerts = ({ filterType = "all" }: { filterType?: AlertFilterType }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const currentLawyer = stripProfessionalTitle(user?.consultantName || user?.lawyerName) || "";

  // What alert types to show based on role + filterType
  const canSeeCustomerAlerts =
    (user?.role === "admin" || user?.role === "intake") &&
    (filterType === "customer" || filterType === "all");
  const canSeeCaseAlerts =
    Boolean(user) &&
    user?.role !== "intake" &&
    (filterType === "case" || filterType === "all");

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [customersMap, setCustomersMap] = useState<Record<string, string>>({});
  const [seenAlertIds, setSeenAlertIds] = useState<Set<string>>(new Set());
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  const [dismissedAlertMap, setDismissedAlertMap] = useState<Record<string, number>>(() => pruneDismissedAlerts(readDismissedAlerts()));

  useEffect(() => {
    const pruned = pruneDismissedAlerts(dismissedAlertMap);
    if (Object.keys(pruned).length !== Object.keys(dismissedAlertMap).length) {
      setDismissedAlertMap(pruned);
      writeDismissedAlerts(pruned);
    }
  }, [dismissedAlertMap]);

  const markAlertDismissed = useCallback((alertId: string) => {
    setDismissedAlertMap((prev) => {
      const next = pruneDismissedAlerts({ ...prev, [alertId]: Date.now() });
      writeDismissedAlerts(next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const [customers, confirmed] = await Promise.all([getAllCustomers(), getConfirmedClients()]);
    const allCustomers = [...customers, ...confirmed];
    const nameMap = allCustomers.reduce<Record<string, string>>((acc, c) => {
      acc[c.customerId] = c.name;
      return acc;
    }, {});
    // Map customerId → assignedTo (normalized) for per-user filtering
    const assignedToMap = allCustomers.reduce<Record<string, string>>((acc, c) => {
      acc[c.customerId] = stripProfessionalTitle((c as Customer & { assignedTo?: string }).assignedTo) || "";
      return acc;
    }, {});
    setCustomersMap(nameMap);

    let caseAlerts: AlertItem[] = [];
    if (canSeeCaseAlerts) {
      const all = await getAllCases();
      const now = Date.now();
      caseAlerts = all
        // Non-admins only see cases assigned to themselves
        .filter((c) => isAdmin || !currentLawyer || stripProfessionalTitle(c.assignedTo) === currentLawyer)
        .flatMap((c) => {
          const out: AlertItem[] = [];
          if (c.deadline) {
            const stage = mapCaseStateToStage(c.state);
            if (stage === "FINALIZED") return out;
            const deadlineTime = new Date(c.deadline).getTime();
            const hoursUntil = Math.max(0, (deadlineTime - now) / (1000 * 60 * 60));
            if (deadlineTime < now) out.push({ id: `case-${c.caseId}-overdue`, type: "case", customerId: c.customerId, caseId: c.caseId, message: `Overdue: ${c.caseId}`, kind: "deadline", severity: "critical" });
            else if (hoursUntil <= 48) out.push({ id: `case-${c.caseId}-deadline-48`, type: "case", customerId: c.customerId, caseId: c.caseId, message: `${c.caseId} due in ${Math.ceil(hoursUntil)}h`, kind: "deadline", severity: "warn" });
          }
          return out;
        });
    }

    let customerAlerts: AlertItem[] = [];
    if (canSeeCustomerAlerts) {
      const remote = await getCustomerNotifications();
      const source = remote.length > 0 ? remote : buildFallbackNotifications(customers);
      customerAlerts = source
        // Non-admins only see notifications for customers assigned to themselves
        .filter((n) => isAdmin || !currentLawyer || assignedToMap[n.customerId] === currentLawyer)
        .map((n) => ({
          id: n.notificationId,
          type: "customer" as const,
          customerId: n.customerId,
          message: n.message,
          kind: n.kind,
          severity: n.severity,
        }));
    }

    const combined = [...caseAlerts, ...customerAlerts].filter((alert) => !dismissedAlertMap[alert.id]);
    setAlerts(combined);
  }, [canSeeCaseAlerts, canSeeCustomerAlerts, dismissedAlertMap, isAdmin, currentLawyer]);

  // Unified dismiss — works for both case and customer alerts
  const dismissAlert = useCallback(async (alertId: string, alertType: "case" | "customer") => {
    if (!alertId) return;
    markAlertDismissed(alertId);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    // Case alerts and local-fallback customer alerts are local only — no server call needed
    if (alertType === "case" || alertId.startsWith("local-")) return;
    setDismissingIds((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });
    try {
      await deleteCustomerNotification(alertId);
      await load();
    } catch {
      // keep locally dismissed even if backend delete is unavailable
    } finally {
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  }, [load, markAlertDismissed]);

  useEffect(() => {
    if (!canSeeCaseAlerts && !canSeeCustomerAlerts) return;
    load().catch(() => {});
  }, [load, canSeeCaseAlerts, canSeeCustomerAlerts]);

  useEffect(() => {
    if (!canSeeCaseAlerts && !canSeeCustomerAlerts) return;
    const onUpdate = () => { load().catch(() => {}); };
    window.addEventListener('app:data-updated', onUpdate);
    return () => { window.removeEventListener('app:data-updated', onUpdate); };
  }, [load, canSeeCaseAlerts, canSeeCustomerAlerts]);

  const criticalCount = useMemo(() => alerts.filter((a) => a.severity === 'critical').length, [alerts]);
  const unreadCount = useMemo(() => alerts.filter((a) => !seenAlertIds.has(a.id)).length, [alerts, seenAlertIds]);

  if (!canSeeCaseAlerts && !canSeeCustomerAlerts) return null;

  return (
    <DropdownMenu onOpenChange={(open) => {
      if (open) setSeenAlertIds((prev) => { const next = new Set(prev); alerts.forEach((a) => next.add(a.id)); return next; });
    }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge variant={criticalCount > 0 ? 'destructive' : 'secondary'} className="absolute -top-1 -right-2 px-1.5 text-[10px]">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[22rem] max-w-[92vw] max-h-[70vh] overflow-y-auto p-1">
        {alerts.length === 0 && <DropdownMenuItem disabled>No alerts</DropdownMenuItem>}
        {alerts.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={(e) => e.preventDefault()} className={`items-start py-2 ${a.severity === 'critical' ? 'text-destructive' : ''}`}>
            <div className="flex w-full items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm leading-snug break-words">{a.message ?? (a.kind === 'deadline' ? 'Deadline' : a.kind === 'respond' ? 'Respond' : 'Follow up')}</span>
                <span className="text-xs text-muted-foreground">{customersMap[a.customerId] ? `${customersMap[a.customerId]} (${a.customerId})` : a.customerId}</span>
              </div>
              {/* X button on every alert — all users can dismiss their own notifications */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                aria-label="Dismiss notification"
                disabled={dismissingIds.has(a.id)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dismissAlert(a.id, a.type).catch(() => {});
                }}
              >
                <X className={`h-3.5 w-3.5 ${dismissingIds.has(a.id) ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CaseAlerts;
