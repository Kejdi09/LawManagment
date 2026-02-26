import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/MainLayout";
import { useAuth } from "@/lib/auth-context";
import { getStaffUsers, createStaffUser, updateStaffUser, deleteStaffUser, StaffUser } from "@/lib/case-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, Plus, KeyRound } from "lucide-react";

const ROLES = ["admin", "manager", "consultant", "intake"] as const;
type Role = (typeof ROLES)[number];

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  manager: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  consultant: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  intake: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  consultant: "Consultant",
  intake: "Intake",
};

type FormMode = "create" | "edit" | "reset-password";

interface FormState {
  username: string;
  password: string;
  confirmPassword: string;
  role: Role;
  consultantName: string;
  managerUsername: string;
}

const emptyForm: FormState = {
  username: "",
  password: "",
  confirmPassword: "",
  role: "intake",
  consultantName: "",
  managerUsername: "",
};

const StaffManagement = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<StaffUser | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (user?.role !== "admin") { navigate("/"); return; }
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadStaff() {
    setLoading(true);
    try {
      const data = await getStaffUsers();
      setStaff(data);
    } catch {
      toast({ title: "Failed to load staff", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setEditTarget(null);
    setFormMode("create");
    setFormOpen(true);
  }

  function openEdit(s: StaffUser) {
    setForm({ ...emptyForm, role: (s.role as Role) || "intake", consultantName: s.consultantName || "", managerUsername: s.managerUsername || "", username: s.username });
    setEditTarget(s);
    setFormMode("edit");
    setFormOpen(true);
  }

  function openResetPassword(s: StaffUser) {
    setForm({ ...emptyForm, username: s.username });
    setEditTarget(s);
    setFormMode("reset-password");
    setFormOpen(true);
  }

  async function handleSave() {
    if (formMode === "create") {
      if (!form.username.trim()) { toast({ title: "Username required", variant: "destructive" }); return; }
      if (!form.password) { toast({ title: "Password required", variant: "destructive" }); return; }
      if (form.password !== form.confirmPassword) { toast({ title: "Passwords do not match", variant: "destructive" }); return; }
      if (form.password.length < 4) { toast({ title: "Password must be at least 4 characters", variant: "destructive" }); return; }
      setWorking(true);
      try {
        await createStaffUser({
          username: form.username.trim().toLowerCase(),
          password: form.password,
          role: form.role,
          consultantName: form.consultantName.trim() || form.username.trim(),
          managerUsername: form.managerUsername || undefined,
        });
        toast({ title: `Staff member "${form.username}" created` });
        setFormOpen(false);
        loadStaff();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to create user";
        toast({ title: msg.includes("exists") ? "Username already exists" : "Failed to create user", variant: "destructive" });
      } finally {
        setWorking(false);
      }
    } else if (formMode === "edit" && editTarget) {
      setWorking(true);
      try {
        await updateStaffUser(editTarget.username, {
          role: form.role,
          consultantName: form.consultantName.trim() || editTarget.username,
          managerUsername: form.managerUsername || undefined,
        });
        toast({ title: "Staff member updated" });
        setFormOpen(false);
        loadStaff();
      } catch {
        toast({ title: "Failed to update user", variant: "destructive" });
      } finally {
        setWorking(false);
      }
    } else if (formMode === "reset-password" && editTarget) {
      if (!form.password) { toast({ title: "Password required", variant: "destructive" }); return; }
      if (form.password !== form.confirmPassword) { toast({ title: "Passwords do not match", variant: "destructive" }); return; }
      if (form.password.length < 4) { toast({ title: "Password must be at least 4 characters", variant: "destructive" }); return; }
      setWorking(true);
      try {
        await updateStaffUser(editTarget.username, { password: form.password });
        toast({ title: "Password updated" });
        setFormOpen(false);
      } catch {
        toast({ title: "Failed to update password", variant: "destructive" });
      } finally {
        setWorking(false);
      }
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      await deleteStaffUser(deleteTarget.username);
      toast({ title: `"${deleteTarget.username}" removed` });
      setDeleteTarget(null);
      loadStaff();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast({ title: msg.includes("own") ? "Cannot delete your own account" : "Failed to delete user", variant: "destructive" });
    } finally {
      setWorking(false);
    }
  }

  if (user?.role !== "admin") return null;

  const dialogTitle = formMode === "create" ? "Add Staff Member" : formMode === "edit" ? "Edit Staff Member" : "Reset Password";

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Staff Management</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Add, edit, or remove staff accounts. Role controls what each person can access in the system.
            </p>
          </div>
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4 mr-2" /> Add Staff
          </Button>
        </div>

        {/* Role guide */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ROLES.map((r) => (
            <Card key={r} className="py-3">
              <CardContent className="p-3 pt-0 flex flex-col gap-1">
                <span className={`inline-flex self-start rounded px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[r]}`}>{ROLE_LABELS[r]}</span>
                <p className="text-xs text-muted-foreground mt-1">
                  {r === "admin" && "Full access. Manages staff, invoices, archives, reports."}
                  {r === "manager" && "Oversees intake team. Views all leads, assigns tasks."}
                  {r === "consultant" && "Handles confirmed clients, cases, proposals."}
                  {r === "intake" && "Handles new leads, intake forms, proposals."}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>{staff.length} member{staff.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((s) => (
                    <TableRow key={s.username}>
                      <TableCell className="font-mono text-sm">{s.username}</TableCell>
                      <TableCell className="font-medium">{s.consultantName || s.username}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[(s.role as Role)] || "bg-gray-100 text-gray-700"}`}>
                          {ROLE_LABELS[(s.role as Role)] || s.role}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.managerUsername || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.createdAt ? new Date(s.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(s)} title="Edit role / display name">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openResetPassword(s)} title="Reset password">
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        {s.username !== user?.username && (
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)} title="Remove">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit / Reset-password dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) setFormOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            {formMode === "edit" && <DialogDescription>Update role and display name for <strong>{editTarget?.username}</strong>.</DialogDescription>}
            {formMode === "reset-password" && <DialogDescription>Set a new password for <strong>{editTarget?.username}</strong>.</DialogDescription>}
          </DialogHeader>

          <div className="space-y-4">
            {formMode === "create" && (
              <div className="space-y-1.5">
                <Label>Username <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. john" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} />
                <p className="text-xs text-muted-foreground">Lowercase letters and numbers only. Used to log in.</p>
              </div>
            )}

            {formMode !== "reset-password" && (
              <>
                <div className="space-y-1.5">
                  <Label>Display Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. John Smith" value={form.consultantName} onChange={(e) => setForm({ ...form, consultantName: e.target.value })} />
                  <p className="text-xs text-muted-foreground">Shown throughout the app instead of the username.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Role <span className="text-destructive">*</span></Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.role === "intake" && (
                  <div className="space-y-1.5">
                    <Label>Manager Username</Label>
                    <Input placeholder="e.g. lenci" value={form.managerUsername} onChange={(e) => setForm({ ...form, managerUsername: e.target.value.toLowerCase() })} />
                    <p className="text-xs text-muted-foreground">Optional. Links this intake user to a manager.</p>
                  </div>
                )}
              </>
            )}

            {(formMode === "create" || formMode === "reset-password") && (
              <>
                <div className="space-y-1.5">
                  <Label>Password <span className="text-destructive">*</span></Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm Password <span className="text-destructive">*</span></Label>
                  <Input type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" disabled={working} onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button disabled={working} onClick={handleSave}>
              {formMode === "create" ? "Create" : formMode === "edit" ? "Save" : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove staff member?</DialogTitle>
            <DialogDescription>
              This will permanently delete the account for <strong>{deleteTarget?.consultantName || deleteTarget?.username}</strong>. Their existing cases and data will remain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={working} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={working} onClick={handleDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default StaffManagement;
