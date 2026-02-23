import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPortalData } from "@/lib/case-store";
import { PortalData, ServiceType, SERVICE_LABELS } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { FileText, Clock, CheckCircle2, AlertCircle } from "lucide-react";

const STATE_LABELS: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  WAITING_CUSTOMER: "Waiting — Your Input Needed",
  WAITING_AUTHORITIES: "Waiting — Authorities",
  FINALIZED: "Completed",
  INTAKE: "Under Review",
  SEND_PROPOSAL: "Proposal Sent",
  WAITING_RESPONSE_P: "Waiting Your Response",
  DISCUSSING_Q: "Under Discussion",
  SEND_CONTRACT: "Contract Sent",
  WAITING_RESPONSE_C: "Waiting Your Response",
};

const STATE_COLOR: Record<string, string> = {
  FINALIZED: "bg-green-100 text-green-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  WAITING_CUSTOMER: "bg-amber-100 text-amber-800",
  default: "bg-gray-100 text-gray-700",
};

function stateColor(state: string) {
  return STATE_COLOR[state] || STATE_COLOR.default;
}

export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError("Invalid link"); setLoading(false); return; }
    getPortalData(token)
      .then(setData)
      .catch((e) => setError(e?.message?.includes("expired") ? "This link has expired. Please contact your lawyer for a new link." : "Invalid or expired link."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading your case information…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">Access Error</h1>
        <p className="text-muted-foreground max-w-sm">{error || "Unable to load your case data."}</p>
        <p className="text-xs text-muted-foreground">If you believe this is a mistake, contact your lawyer directly.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <div className="font-semibold text-sm">Dafku Law Firm — Case Portal</div>
            <div className="text-xs text-muted-foreground">Read-only view for {data.client.name}</div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Client card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{data.client.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2 flex-wrap">
              {(data.client.services || []).map((s: ServiceType) => (
                <Badge key={s} variant="secondary">{SERVICE_LABELS[s] || s}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cases */}
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Your Cases ({data.cases.length})</h2>
          {data.cases.length === 0 && (
            <Card><CardContent className="py-4 text-sm text-muted-foreground text-center">No cases found.</CardContent></Card>
          )}
          {data.cases.map((c) => {
            const stateLabel = STATE_LABELS[c.state] || c.state;
            const isWaitingClient = c.state === "WAITING_CUSTOMER" || c.state === "WAITING_RESPONSE_P" || c.state === "WAITING_RESPONSE_C";
            return (
              <Card key={c.caseId} className={isWaitingClient ? "border-amber-400 dark:border-amber-500" : ""}>
                <CardContent className="pt-4 pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-mono text-xs text-muted-foreground">{c.caseId}</span>
                      {c.title && <div className="font-semibold text-sm mt-0.5">{c.title}</div>}
                      <div className="text-sm text-muted-foreground">{c.category}{c.subcategory ? ` — ${c.subcategory}` : ""}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stateColor(c.state)}`}>{stateLabel}</span>
                      {isWaitingClient && (
                        <span className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Action required
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {c.deadline && (
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Deadline: {formatDate(c.deadline)}</span>
                    )}
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Updated: {formatDate(c.lastStateChange)}</span>
                  </div>

                  {/* Case history */}
                  {data.history.filter((h) => h.caseId === c.caseId).length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <div className="text-xs font-semibold text-muted-foreground mb-2">Status Timeline</div>
                      <div className="space-y-1">
                        {data.history.filter((h) => h.caseId === c.caseId).slice(0, 5).map((h) => (
                          <div key={h.historyId} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{formatDate(h.date)}</span>
                            <span className="text-muted-foreground/60">→</span>
                            <span>{STATE_LABELS[h.stateIn] || h.stateIn}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center text-xs text-muted-foreground pt-4 border-t">
          This page is read-only and provided for your information. For any questions, contact your lawyer directly.
        </div>
      </main>
    </div>
  );
}
