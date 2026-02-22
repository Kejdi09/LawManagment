import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAuditLogs } from "@/lib/case-store";
import { AuditLogRecord } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const AdminActivity = () => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    getAuditLogs().then(setLogs).catch(() => setLogs([]));
  }, []);

  const actionOptions = useMemo(
    () => ["all", ...Array.from(new Set(logs.map((log) => log.action).filter(Boolean)))],
    [logs]
  );

  const resourceOptions = useMemo(
    () => ["all", ...Array.from(new Set(logs.map((log) => log.resource).filter(Boolean)))],
    [logs]
  );

  const roleOptions = useMemo(
    () => ["all", ...Array.from(new Set(logs.map((log) => log.role || "system")))],
    [logs]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const toTs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;

    return logs.filter((l) => {
      const logTs = new Date(l.at).getTime();
      if (logTs < fromTs || logTs > toTs) return false;
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (resourceFilter !== "all" && l.resource !== resourceFilter) return false;
      if (roleFilter !== "all" && (l.role || "system") !== roleFilter) return false;
      if (!q) return true;
      const actor = (l.consultantName || l.username || "").toLowerCase();
      const msg = `${l.action} ${l.resource} ${l.resourceId || ""}`.toLowerCase();
      const details = JSON.stringify(l.details || {}).toLowerCase();
      return actor.includes(q) || msg.includes(q) || details.includes(q);
    });
  }, [logs, query, actionFilter, resourceFilter, roleFilter, fromDate, toDate]);

  const total = filtered.length;
  const last24h = filtered.filter((log) => Date.now() - new Date(log.at).getTime() <= 24 * 60 * 60 * 1000).length;
  const uniqueActors = new Set(filtered.map((log) => log.consultantName || log.username || "System")).size;
  const destructiveChanges = filtered.filter((log) => log.action === "delete").length;

  const formatDetailsPreview = (details?: Record<string, unknown>) => {
    if (!details || Object.keys(details).length === 0) return "-";
    const entries = Object.entries(details)
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
    return entries.join(" • ");
  };

  if (user?.role !== "admin") {
    return (
      <MainLayout title="Activity">
        <div className="text-sm text-muted-foreground">Only admin can view activity logs.</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Admin Activity">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Visible Events</div>
              <div className="text-lg font-semibold">{total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Last 24 Hours</div>
              <div className="text-lg font-semibold">{last24h}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Unique Actors</div>
              <div className="text-lg font-semibold">{uniqueActors}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Delete Actions</div>
              <div className="text-lg font-semibold">{destructiveChanges}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activity" className="lg:col-span-2" />
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  {actionOptions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action === "all" ? "All actions" : action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Resource" />
                </SelectTrigger>
                <SelectContent>
                  {resourceOptions.map((resource) => (
                    <SelectItem key={resource} value={resource}>
                      {resource === "all" ? "All resources" : resource}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role === "all" ? "All roles" : role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2 lg:col-span-2">
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                      No activity found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((log, idx) => (
                    <TableRow key={`${log.at}-${log.resourceId || idx}`}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(log.at, true)}</TableCell>
                      <TableCell className="text-sm">{log.consultantName || log.username || "System"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{log.role || "system"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.action}</TableCell>
                      <TableCell className="text-sm">{log.resource}</TableCell>
                      <TableCell className="font-mono text-xs">{log.resourceId || "-"}</TableCell>
                      <TableCell className="max-w-[360px] text-xs text-muted-foreground">
                        <div className="line-clamp-2 break-words">{formatDetailsPreview(log.details)}</div>
                        {Object.keys(log.details || {}).length > 0 && (
                          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setSelectedLog(log)}>
                            View details
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Activity Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">When:</span> {selectedLog ? formatDate(selectedLog.at, true) : "-"}</div>
              <div><span className="text-muted-foreground">Actor:</span> {selectedLog?.consultantName || selectedLog?.username || "System"}</div>
              <div><span className="text-muted-foreground">Action:</span> {selectedLog?.action || "-"}</div>
              <div><span className="text-muted-foreground">Resource:</span> {selectedLog?.resource || "-"}</div>
              <pre className="max-h-[45vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words">
                {selectedLog?.details ? JSON.stringify(selectedLog.details, null, 2) : "No details"}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default AdminActivity;
