import { useEffect, useState } from "react";
import SharedHeader from "@/components/SharedHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Customer, CONTACT_CHANNEL_LABELS } from "@/lib/types";
import { getConfirmedClients } from "@/lib/case-store";

const ClientsPage = () => {
  const [clients, setClients] = useState<Customer[]>([]);

  useEffect(() => {
    getConfirmedClients().then(setClients).catch(() => setClients([]));
  }, []);

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      No confirmed clients yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow key={client.customerId}>
                      <TableCell className="font-mono text-xs">{client.customerId}</TableCell>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell className="text-sm">{client.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{client.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{CONTACT_CHANNEL_LABELS[client.contactChannel]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="text-xs">Client Confirmed</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ClientsPage;
