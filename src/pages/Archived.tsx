import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/MainLayout";
import { useAuth } from "@/lib/auth-context";
import { getDeletedRecords, restoreDeletedRecord, purgeDeletedRecord, getDeletedRecord } from "@/lib/case-store";
import { DeletedRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

function daysUntil(isoDate: string): number {
  return Math.max(0, Math.round((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const ArchivedPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [records, setRecords] = useState<DeletedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<DeletedRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/");
      return;
    }
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadRecords() {
    setLoading(true);
    try {
      const data = await getDeletedRecords();
      setRecords(data);
    } catch {
      toast({ title: "Failed to load deleted records", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(recordId: string) {
    setLoadingDetail(true);
    setDetailOpen(true);
    try {
      const full = await getDeletedRecord(recordId);
      setSelectedRecord(full);
    } catch {
      toast({ title: "Failed to load record details", variant: "destructive" });
      setDetailOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    setWorking(true);
    try {
      await restoreDeletedRecord(restoreTarget);
      toast({ title: "Record restored successfully" });
      setRestoreTarget(null);
      setDetailOpen(false);
      setSelectedRecord(null);
      loadRecords();
    } catch {
      toast({ title: "Failed to restore record", variant: "destructive" });
    } finally {
      setWorking(false);
    }
  }

  async function handlePurge() {
    if (!purgeTarget) return;
    setWorking(true);
    try {
      await purgeDeletedRecord(purgeTarget);
      toast({ title: "Record permanently deleted" });
      setPurgeTarget(null);
      setDetailOpen(false);
      setSelectedRecord(null);
      loadRecords();
    } catch {
      toast({ title: "Failed to purge record", variant: "destructive" });
    } finally {
      setWorking(false);
    }
  }

  if (user?.role !== "admin") return null;

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Deleted Records Archive</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All deleted customers and clients are retained for 5 years. Admin can view, restore, or permanently purge them.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Deleted Records</CardTitle>
            <CardDescription>{records.length} record{records.length !== 1 ? "s" : ""} in archive</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
            ) : records.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No deleted records found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Deleted</TableHead>
                    <TableHead>Deleted By</TableHead>
                    <TableHead>Expires In</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => {
                    const daysLeft = daysUntil(r.expiresAt);
                    const expiryVariant = daysLeft < 180 ? "destructive" : daysLeft < 365 ? "secondary" : "outline";
                    return (
                      <TableRow key={r.recordId}>
                        <TableCell className="font-mono text-xs">{r.customerId}</TableCell>
                        <TableCell className="font-medium">{r.customerName}</TableCell>
                        <TableCell>
                          <Badge variant={r.recordType === "confirmedClient" ? "default" : "secondary"}>
                            {r.recordType === "confirmedClient" ? "Client" : "Customer"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(r.deletedAt)}</TableCell>
                        <TableCell className="text-sm">{r.deletedBy}</TableCell>
                        <TableCell>
                          <Badge variant={expiryVariant}>{daysLeft}d</Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => openDetail(r.recordId)}>
                            View
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setRestoreTarget(r.recordId)} disabled={working}>
                            Restore
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setPurgeTarget(r.recordId)} disabled={working}>
                            Purge
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(o) => { if (!o) { setDetailOpen(false); setSelectedRecord(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deleted Record Details</DialogTitle>
            <DialogDescription>
              Full snapshot of this record at the time of deletion.
            </DialogDescription>
          </DialogHeader>
          {loadingDetail ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Loading details…</p>
          ) : selectedRecord ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 bg-muted/40 rounded-lg p-3">
                <div><span className="font-medium">Customer ID:</span> {selectedRecord.customerId}</div>
                <div><span className="font-medium">Name:</span> {selectedRecord.customerName}</div>
                <div><span className="font-medium">Type:</span> {selectedRecord.recordType === "confirmedClient" ? "Confirmed Client" : "Customer"}</div>
                <div><span className="font-medium">Deleted at:</span> {formatDate(selectedRecord.deletedAt)}</div>
                <div><span className="font-medium">Deleted by:</span> {selectedRecord.deletedBy}</div>
                <div><span className="font-medium">Expires at:</span> {formatDate(selectedRecord.expiresAt)} ({daysUntil(selectedRecord.expiresAt)} days)</div>
              </div>
              {selectedRecord.snapshot?.customer && (
                <div>
                  <p className="font-semibold mb-1">Contact Info</p>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground bg-muted/20 rounded p-2">
                    <div>Email: {selectedRecord.snapshot.customer.email || "—"}</div>
                    <div>Phone: {selectedRecord.snapshot.customer.phone || "—"}</div>
                    <div>Services: {(selectedRecord.snapshot.customer.services || []).join(", ") || "—"}</div>
                    <div>Status at deletion: {selectedRecord.snapshot.customer.status || "—"}</div>
                  </div>
                </div>
              )}
              <div>
                <p className="font-semibold mb-1">Cases ({selectedRecord.snapshot?.cases?.length ?? 0})</p>
                {selectedRecord.snapshot?.cases?.length ? (
                  <ul className="space-y-1">
                    {selectedRecord.snapshot.cases.map((c) => (
                      <li key={c.caseId} className="text-muted-foreground bg-muted/20 rounded px-2 py-1">
                        <span className="font-mono text-xs mr-2">{c.caseId}</span>
                        {c.title || c.category || "Untitled"} — <span className="text-xs">{c.state}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No cases.</p>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => { setDetailOpen(false); setSelectedRecord(null); }}>Close</Button>
            {selectedRecord && (
              <>
                <Button variant="secondary" disabled={working} onClick={() => { setRestoreTarget(selectedRecord.recordId); setDetailOpen(false); }}>
                  Restore
                </Button>
                <Button variant="destructive" disabled={working} onClick={() => { setPurgeTarget(selectedRecord.recordId); setDetailOpen(false); }}>
                  Purge
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore confirm */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => { if (!o) setRestoreTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this record?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer/client and all their cases, notes, and tasks will be restored to the active database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={working} onClick={handleRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Purge confirm */}
      <AlertDialog open={!!purgeTarget} onOpenChange={(o) => { if (!o) setPurgeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently and irreversibly delete this record from the archive. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={working} onClick={handlePurge} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default ArchivedPage;

