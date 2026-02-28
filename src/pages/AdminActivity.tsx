import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAuditLogs, getTeamSummary } from "@/lib/case-store";
import { AuditLogRecord, TeamSummary } from "@/lib/types";
import { formatDate, stripProfessionalTitle } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const AdminActivity = () => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);
  const [teamSummary, setTeamSummary] = useState<TeamSummary[]>([]);
  const [activeTab, setActiveTab] = useState<"logs" | "team" | "staff_sessions">("logs");
  const { user } = useAuth();

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getAuditLogs().catch(() => []),
      getTeamSummary().catch(() => []),
    ]).then(([logsData, teamData]) => {
      setLogs(logsData);
      setTeamSummary(teamData);
    }).catch((err) => {
      setLoadError(err instanceof Error ? err.message : "Failed to load activity data");
    }).finally(() => {
      setLoading(false);
    });
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

  const actorDisplayName = (log: AuditLogRecord) =>
    stripProfessionalTitle(log.consultantName || log.username || "") || log.username || "System";

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
      const actor = actorDisplayName(l).toLowerCase();
      const msg = `${l.action} ${l.resource} ${l.resourceId || ""}`.toLowerCase();
      const details = JSON.stringify(l.details || {}).toLowerCase();
      return actor.includes(q) || msg.includes(q) || details.includes(q);
    });
  }, [logs, query, actionFilter, resourceFilter, roleFilter, fromDate, toDate]);

  const total = filtered.length;
  const last24h = filtered.filter((log) => Date.now() - new Date(log.at).getTime() <= 24 * 60 * 60 * 1000).length;
  const uniqueActors = new Set(filtered.map((log) => actorDisplayName(log))).size;
  const destructiveChanges = filtered.filter((log) => log.action === "delete").length;

  const formatDetailsPreview = (details?: Record<string, unknown>) => {
    if (!details || Object.keys(details).length === 0) return "-";
    try {
      const entries = Object.entries(details)
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
      return entries.join(" • ");
    } catch {
      return "(details)"
    }
  };

  if (user?.role !== "admin") {
    return (
      <MainLayout title="Activity">
        <div className="text-sm text-muted-foreground">Only admin can view activity logs.</div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout title="Admin Activity">
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">Loading activity data…</div>
      </MainLayout>
    );
  }

  if (loadError) {
    return (
      <MainLayout title="Admin Activity">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load activity: {loadError}. Please refresh the page.
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Admin Activity">
      <div className="space-y-3">
        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("logs")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "logs" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Activity Log
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("team")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "team" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Team Summary
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("staff_sessions")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "staff_sessions" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Staff Sessions
          </button>
        </div>

        {activeTab === "staff_sessions" && (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Event</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs
                    .filter((l) => l.resource === 'session')
                    .map((log, idx) => (
                      <TableRow key={`${log.at}-${idx}`}>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(log.at, true)}</TableCell>
                        <TableCell className="text-sm">{actorDisplayName(log)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{log.role || "unknown"}</Badge></TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            log.action === 'login'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          }`}>
                            {log.action === 'login' ? '→ Logged in' : '← Logged out'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  {logs.filter((l) => l.resource === 'session').length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No session events yet. They appear after staff log in or out.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab === "team" && (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Customers</TableHead>
                    <TableHead>Clients</TableHead>
                    <TableHead>Cases</TableHead>
                    <TableHead>Meetings (7d)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamSummary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                        No team summary available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    teamSummary.map((row) => (
                      <TableRow key={row.username}>
                        <TableCell className="text-sm">{row.consultantName}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{row.role}</Badge></TableCell>
                        <TableCell className="text-sm font-medium">{row.customersCount}</TableCell>
                        <TableCell className="text-sm font-medium">{row.clientsCount}</TableCell>
                        <TableCell className="text-sm font-medium">{row.casesCount}</TableCell>
                        <TableCell className="text-sm font-medium">{row.meetingsCount ?? 0}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab === "logs" && <>
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
                      <TableCell className="text-sm">{actorDisplayName(log)}</TableCell>
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
        </>}

        <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-2xl w-[95vw] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Activity Details</DialogTitle>
              <DialogDescription>Detailed audit log information for the selected activity record.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">When:</span> {selectedLog ? formatDate(selectedLog.at, true) : "-"}</div>
              <div><span className="text-muted-foreground">Actor:</span> {selectedLog ? actorDisplayName(selectedLog) : "System"}</div>
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
