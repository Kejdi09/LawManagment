import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getAuditLogs } from "@/lib/case-store";
import { AuditLogRecord } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const AdminActivity = () => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [query, setQuery] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    getAuditLogs().then(setLogs).catch(() => setLogs([]));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return logs;
    const q = query.toLowerCase();
    return logs.filter((l) => {
      const actor = (l.consultantName || l.username || "").toLowerCase();
      const msg = `${l.action} ${l.resource} ${l.resourceId || ""}`.toLowerCase();
      return actor.includes(q) || msg.includes(q);
    });
  }, [logs, query]);

  if (user?.role !== "admin") {
    return (
      <MainLayout title="Activity">
        <div className="text-sm text-muted-foreground">Only admin can view activity logs.</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Admin Activity">
      <div className="space-y-4">
        <div className="max-w-sm">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by actor/action/resource" />
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default AdminActivity;
