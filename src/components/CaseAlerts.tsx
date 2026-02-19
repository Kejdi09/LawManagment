import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getAllCases, getAllCustomers } from "@/lib/case-store";
import { mapCaseStateToStage } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const CaseAlerts = () => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [customersMap, setCustomersMap] = useState<Record<string, string>>({});
  const [seenAlertIds, setSeenAlertIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const all = await getAllCases();
    const allCustomers = await getAllCustomers();
    const nameMap = allCustomers.reduce<Record<string, string>>((acc, c) => {
      acc[c.customerId] = c.name;
      return acc;
    }, {});
    const statusMap = allCustomers.reduce<Record<string, string>>((acc, c) => {
      acc[c.customerId] = c.status || "";
      return acc;
    }, {});
    setCustomersMap(nameMap);

    const now = Date.now();
    const items = all.flatMap((c) => {
      // Skip alerts for confirmed/clients unless user is admin
      const custStatus = statusMap[c.customerId];
      if (custStatus === 'CLIENT' || custStatus === 'CONFIRMED') {
        if (user?.role !== 'admin') return [] as any[];
      }

      const last = c.lastStateChange ? new Date(c.lastStateChange).getTime() : 0;
      const hours = last ? (now - last) / (1000 * 60 * 60) : 0;
      const out: any[] = [];
      const stage = mapCaseStateToStage(c.state);
      const isWaiting = stage === "WAITING_CUSTOMER" || stage === "WAITING_AUTHORITIES";
      if (isWaiting && hours >= 48 && hours < 72) out.push({ id: `${c.caseId}-wait-48`, customerId: c.customerId, caseId: c.caseId, kind: 'follow', severity: 'warn' });
      if (isWaiting && hours >= 72 && hours < 96) out.push({ id: `${c.caseId}-wait-72`, customerId: c.customerId, caseId: c.caseId, kind: 'follow', severity: 'critical' });
      if (isWaiting && hours >= 96) out.push({ id: `${c.caseId}-wait-96`, customerId: c.customerId, caseId: c.caseId, kind: 'follow', severity: 'critical' });
      if (stage === 'WAITING_CUSTOMER' && hours >= 12) out.push({ id: `${c.caseId}-send-12`, customerId: c.customerId, caseId: c.caseId, message: `Respond: ${c.caseId}`, kind: 'respond', severity: 'warn' });

      if (c.deadline && mapCaseStateToStage(c.state) !== 'FINALIZED') {
        const deadlineTime = new Date(c.deadline).getTime();
        const hoursUntil = Math.max(0, (deadlineTime - now) / (1000 * 60 * 60));
        if (deadlineTime < now) out.push({ id: `${c.caseId}-overdue`, customerId: c.customerId, caseId: c.caseId, message: `Overdue: ${c.caseId}`, kind: 'deadline', severity: 'critical' });
        else if (hoursUntil <= 48) out.push({ id: `${c.caseId}-deadline-48`, customerId: c.customerId, caseId: c.caseId, message: `${c.caseId} due in ${Math.ceil(hoursUntil)}h`, kind: 'deadline', severity: 'warn' });
      }
      return out;
    });
    setAlerts(items);
  }, [user]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  useEffect(() => {
    const onUpdate = () => { load().catch(() => {}); };
    window.addEventListener('app:data-updated', onUpdate);
    return () => { window.removeEventListener('app:data-updated', onUpdate); };
  }, [load]);

  const criticalCount = useMemo(() => alerts.filter((a) => a.severity === 'critical').length, [alerts]);
  const warnCount = useMemo(() => alerts.filter((a) => a.severity === 'warn').length, [alerts]);
  const unreadCount = useMemo(() => alerts.filter((a) => !seenAlertIds.has(a.id)).length, [alerts, seenAlertIds]);

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
      <DropdownMenuContent align="end" className="w-64">
        {alerts.length === 0 && <DropdownMenuItem disabled>No alerts</DropdownMenuItem>}
        {alerts.map((a) => (
          <DropdownMenuItem key={a.id} className={a.severity === 'critical' ? 'text-destructive' : ''}>
            <div className="flex flex-col">
              <span>{a.message ?? (a.kind === 'deadline' ? 'Deadline' : a.kind === 'respond' ? 'Respond' : 'Follow up')}</span>
              <span className="text-xs text-muted-foreground">{customersMap[a.customerId] ? `${customersMap[a.customerId]} (${a.customerId})` : a.customerId}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CaseAlerts;
