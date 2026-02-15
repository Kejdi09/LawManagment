import { useEffect, useState } from "react";
import SharedHeader from "@/components/SharedHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Customer, CONTACT_CHANNEL_LABELS, LEAD_STATUS_LABELS, LeadStatus, Case, STAGE_LABELS, PRIORITY_CONFIG } from "@/lib/types";
import { deleteConfirmedClient, getCasesByCustomer, getConfirmedClients, updateConfirmedClient } from "@/lib/case-store";
import { mapCaseStateToStage } from "@/lib/utils";

const ClientsPage = () => {
  const [clients, setClients] = useState<Customer[]>([]);
  const [selectedClient, setSelectedClient] = useState<Customer | null>(null);
  const [selectedCases, setSelectedCases] = useState<Case[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState<Partial<Customer>>({});

  const load = () => getConfirmedClients().then(setClients).catch(() => setClients([]));

  useEffect(() => {
    load();
  }, []);

  const openDetail = async (client: Customer) => {
    setSelectedClient(client);
    const cases = await getCasesByCustomer(client.customerId);
    setSelectedCases(cases);
  };

  const openEdit = (client: Customer) => {
    setForm({ ...client, followUpDate: client.followUpDate ? String(client.followUpDate).slice(0, 10) : "" });
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!form.customerId) return;
    await updateConfirmedClient(form.customerId, {
      ...form,
      followUpDate: form.status === "ON_HOLD" && form.followUpDate ? new Date(String(form.followUpDate)).toISOString() : null,
    } as Partial<Customer>);
    setShowEdit(false);
    load();
  };

  const removeClient = async (customerId: string) => {
    if (!window.confirm("Delete this confirmed client?")) return;
    await deleteConfirmedClient(customerId);
    if (selectedClient?.customerId === customerId) setSelectedClient(null);
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <SharedHeader title="Confirmed Clients" />
      <main className="container py-6 space-y-4">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                      No confirmed clients yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow key={client.customerId} className="cursor-pointer" onClick={() => openDetail(client)}>
                      <TableCell className="font-mono text-xs">{client.customerId}</TableCell>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell className="text-sm">{client.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{client.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{CONTACT_CHANNEL_LABELS[client.contactChannel]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="text-xs">{LEAD_STATUS_LABELS[client.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(client)}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={() => removeClient(client.customerId)}>Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!selectedClient} onOpenChange={(o) => !o && setSelectedClient(null)}>
          <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
            {selectedClient && (
              <>
                <DialogHeader>
                  <DialogTitle>{selectedClient.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                  <div><strong>ID:</strong> {selectedClient.customerId}</div>
                  <div><strong>Phone:</strong> {selectedClient.phone}</div>
                  <div><strong>Email:</strong> {selectedClient.email}</div>
                  <div><strong>Address:</strong> {selectedClient.address}</div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Case ID</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Priority</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCases.map((sc) => {
                      const pCfg = PRIORITY_CONFIG[sc.priority];
                      return (
                        <TableRow key={sc.caseId}>
                          <TableCell className="font-mono text-xs">{sc.caseId}</TableCell>
                          <TableCell className="text-sm">{sc.category} / {sc.subcategory}</TableCell>
                          <TableCell><Badge className="text-xs">{STAGE_LABELS[mapCaseStateToStage(sc.state)]}</Badge></TableCell>
                          <TableCell><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pCfg.color}`}>{pCfg.label}</span></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent className="max-w-xl w-[95vw]">
            <DialogHeader>
              <DialogTitle>Edit Confirmed Client</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Status</Label>
                <Select value={(form.status as LeadStatus) || "CLIENT"} onValueChange={(v) => setForm({ ...form, status: v as LeadStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLIENT">Client Confirmed</SelectItem>
                    <SelectItem value="ON_HOLD">On Hold</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.status === "ON_HOLD" && (
                <div className="space-y-2 md:col-span-2">
                  <Label>Follow Up Date</Label>
                  <Input type="date" value={(form.followUpDate as string) || ""} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button onClick={saveEdit}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default ClientsPage;
