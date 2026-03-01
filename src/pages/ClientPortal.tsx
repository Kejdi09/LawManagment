import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { getPortalData, savePortalIntakeFields, markProposalViewed, respondToProposal, respondToContract, selectPortalPaymentMethod } from "@/lib/case-store";
import { PortalData, ServiceType, SERVICE_LABELS } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import ClientIntakeForm from "@/components/ClientIntakeForm";
import FaqBot from "@/components/FaqBot";
import ProposalRenderer from "@/components/ProposalRenderer";
import ContractRenderer from "@/components/ContractRenderer";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Clock, CheckCircle2, AlertCircle, AlertTriangle, ChevronDown, ChevronUp,
  CalendarClock, StickyNote, ClipboardList, ThumbsUp, PenLine, Bot, FileDown, Receipt, CreditCard,
} from "lucide-react";

const STATE_LABELS: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  WAITING_CUSTOMER: "Waiting � Your Input Needed",
  WAITING_AUTHORITIES: "Waiting � Authorities",
  FINALIZED: "Completed",
  INTAKE: "Under Review",
  SEND_PROPOSAL: "Proposal Sent",
  WAITING_RESPONSE_P: "Waiting Your Response",
  DISCUSSING_Q: "Under Discussion",
  SEND_CONTRACT: "Contract Sent",
  WAITING_RESPONSE_C: "Waiting Your Response",
};

const STATE_COLOR: Record<string, string> = {
  FINALIZED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  WAITING_CUSTOMER: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  WAITING_RESPONSE_P: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  WAITING_RESPONSE_C: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  WAITING_AUTHORITIES: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  default: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function stateColor(state: string) {
  return STATE_COLOR[state] || STATE_COLOR.default;
}

function CaseCard({ c, history }: {
  c: PortalData["cases"][number];
  history: PortalData["history"];
}) {
  const [expanded, setExpanded] = useState(false);
  const caseHistory = history.filter((h) => h.caseId === c.caseId);
  const isWaitingClient =
    c.state === "WAITING_CUSTOMER" ||
    c.state === "WAITING_RESPONSE_P" ||
    c.state === "WAITING_RESPONSE_C";

  const accentColor = c.state === 'FINALIZED'
    ? 'bg-green-500'
    : isWaitingClient
    ? 'bg-amber-400'
    : c.state === 'IN_PROGRESS'
    ? 'bg-blue-500'
    : c.state === 'WAITING_AUTHORITIES'
    ? 'bg-purple-500'
    : 'bg-muted-foreground/20';

  return (
    <Card className={`relative overflow-hidden ${isWaitingClient ? "border-amber-400 dark:border-amber-500" : ""}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor}`} />
      <CardContent className="pt-4 pb-3 pl-5 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <span className="font-mono text-xs text-muted-foreground">{c.caseId}</span>
            {c.title && <div className="font-semibold text-sm mt-0.5">{c.title}</div>}
            <div className="text-sm text-muted-foreground">
              {c.category}{c.subcategory ? ` � ${c.subcategory}` : ""}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stateColor(c.state)}`}>
              {STATE_LABELS[c.state] || c.state}
            </span>
            {isWaitingClient && (
              <span className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Action required
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {c.deadline && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Deadline: {formatDate(c.deadline)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Updated: {formatDate(c.lastStateChange)}
          </span>
        </div>

        {c.generalNote && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex gap-2">
            <StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">{c.generalNote}</span>
          </div>
        )}

        {caseHistory.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "Hide" : "Show"} status timeline ({caseHistory.length} entries)
            </button>
            {expanded && (
              <div className="mt-2 space-y-1 border-t pt-2">
                {caseHistory.map((h) => (
                  <div key={h.historyId} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono w-24 shrink-0">{formatDate(h.date)}</span>
                    <span className="text-muted-foreground/50">?</span>
                    <span>{STATE_LABELS[h.stateIn] || h.stateIn}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkExpired, setLinkExpired] = useState(false);
  // Proposal response state
  const [proposalResponding, setProposalResponding] = useState(false);
  const [proposalRespondDone, setProposalRespondDone] = useState<"accepted" | null>(null);
  // Contract response state
  const [contractResponding, setContractResponding] = useState(false);
  const [contractRespondDone, setContractRespondDone] = useState<"accepted" | null>(null);
  const contractPrintRef = useRef<HTMLDivElement>(null);
  const proposalViewedRef = useRef(false);
  const portalPrintRef = useRef<HTMLDivElement>(null);
  const [contractSignName, setContractSignName] = useState("");
  const [contractSignAgreed, setContractSignAgreed] = useState(false);
  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'crypto' | 'cash' | ''>('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentMethodSaved, setPaymentMethodSaved] = useState(false);

  function handlePortalPrint() {
    const content = portalPrintRef.current;
    if (!content) return;
    const name = data?.client?.name ?? 'Client';
    html2pdf()
      .set({
        margin: [15, 12, 15, 12],
        filename: `DAFKU-Proposal-${name}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      } as any)
      .from(content)
      .save();
  }

  function handleContractPrint() {
    const content = contractPrintRef.current;
    if (!content) return;
    const name = data?.client?.name ?? 'Client';
    html2pdf()
      .set({
        margin: [15, 12, 15, 12],
        filename: `DAFKU-ServiceAgreement-${name}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      } as any)
      .from(content)
      .save();
  }

  // Load portal data
  useEffect(() => {
    if (!token) { setError("Invalid link"); setLoading(false); return; }
    getPortalData(token)
      .then((d) => {
        setData(d);
        // Sync payment method state from server so selection stays hidden on refresh
        if (d.paymentSelectedMethod) {
          setPaymentMethod(d.paymentSelectedMethod);
          setPaymentMethodSaved(true);
        }
      })
      .catch((e) => {
        const msg = String(e?.message || "");
        if (msg.includes("expired") || msg.includes("410")) {
          setError("This link has expired. Please contact your lawyer for a new link.");
          setLinkExpired(true);
        } else {
          setError("Invalid or expired link.");
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  // If the proposal tab is the default tab on first load, mark it viewed immediately
  useEffect(() => {
    if (!data || !token || proposalViewedRef.current) return;
    if (!!data.proposalSentAt && !!data.proposalSnapshot) {
      proposalViewedRef.current = true;
      markProposalViewed(token);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading your case information�
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

  const isConfirmedClient = data.client.status === 'CLIENT';
  const showIntakeTab = !isConfirmedClient && data.client.status === "SEND_PROPOSAL";
  const showProposalTab = !isConfirmedClient && !!data.proposalSentAt && !!data.proposalSnapshot;
  const showContractTab = !isConfirmedClient && !!data.contractSentAt && !!data.contractSnapshot;
  const showPaymentTab = !isConfirmedClient && data.client.status === 'AWAITING_PAYMENT';
  const showInvoicesTab = !!(data.invoices && data.invoices.length > 0);
  const tabCount = (isConfirmedClient ? 1 : 2) + (showIntakeTab ? 1 : 0) + (showProposalTab ? 1 : 0) + (showContractTab ? 1 : 0) + (showPaymentTab ? 1 : 0) + (showInvoicesTab ? 1 : 0);
  const defaultTab = isConfirmedClient ? (showInvoicesTab ? 'invoices' : 'status') : showPaymentTab ? "payment" : showContractTab ? "contract" : showProposalTab ? "proposal" : showIntakeTab ? "intake" : "status";
  const snap = data.proposalSnapshot;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top gradient accent */}
      <div className="h-1 bg-gradient-to-r from-violet-600 via-purple-500 to-indigo-500 shrink-0" />
      {/* Sticky header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10 shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-sm shrink-0 select-none">D</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm leading-tight">DAFKU Law Firm <span className="text-muted-foreground font-normal text-xs">— Client Portal</span></div>
            <div className="text-xs text-muted-foreground truncate">Welcome, {data.client.name}</div>
          </div>
          {data.expiresAt && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
              <CalendarClock className="h-3.5 w-3.5" />
              Expires {formatDate(data.expiresAt)}
            </div>
          )}
        </div>
      </header>

      {/* Services banner */}
      <div className="border-b bg-muted/30 shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-2 flex gap-2 flex-wrap items-center">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium shrink-0">Services:</span>
          {(data.client.services || []).map((s: ServiceType) => (
            <Badge key={s} variant="secondary" className="text-xs bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200/60 dark:border-violet-700/40">{SERVICE_LABELS[s] || s}</Badge>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 pt-4 pb-8">
        <Tabs defaultValue={defaultTab} className="flex flex-col gap-0" onValueChange={(tab) => {
            if (tab === 'proposal' && !proposalViewedRef.current && token) {
              proposalViewedRef.current = true;
              markProposalViewed(token);
            }
          }}>
          <TabsList className="w-full mb-4 grid" style={{ gridTemplateColumns: `repeat(${tabCount}, 1fr)` }}>
            {isConfirmedClient ? (
              <>
                {showInvoicesTab && (
                  <TabsTrigger value="invoices" className="flex items-center gap-1.5 text-xs">
                    <Receipt className="h-3.5 w-3.5" /> Invoices
                  </TabsTrigger>
                )}
                <TabsTrigger value="status" className="flex items-center gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5" /> Cases
                </TabsTrigger>
                <TabsTrigger value="faq" className="flex items-center gap-1.5 text-xs">
                  <Bot className="h-3.5 w-3.5" /> Messages
                </TabsTrigger>
              </>
            ) : (
              <>
                <TabsTrigger value="status" className="flex items-center gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5" /> Status
                </TabsTrigger>
                {showIntakeTab && (
                  <TabsTrigger value="intake" className="flex items-center gap-1.5 text-xs">
                    <ClipboardList className="h-3.5 w-3.5" /> Intake Form
                  </TabsTrigger>
                )}
                {showProposalTab && (
                  <TabsTrigger value="proposal" className="flex items-center gap-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5" /> Proposal
                  </TabsTrigger>
                )}
                {showContractTab && (
                  <TabsTrigger value="contract" className="flex items-center gap-1.5 text-xs">
                    <PenLine className="h-3.5 w-3.5" /> Contract
                  </TabsTrigger>
                )}
                {showPaymentTab && (
                  <TabsTrigger value="payment" className="flex items-center gap-1.5 text-xs">
                    <CreditCard className="h-3.5 w-3.5" /> Payment
                  </TabsTrigger>
                )}
                <TabsTrigger value="faq" className="flex items-center gap-1.5 text-xs">
                  <Bot className="h-3.5 w-3.5" /> FAQ
                </TabsTrigger>
                {showInvoicesTab && (
                  <TabsTrigger value="invoices" className="flex items-center gap-1.5 text-xs">
                    <Receipt className="h-3.5 w-3.5" /> Invoices
                  </TabsTrigger>
                )}
              </>
            )}
          </TabsList>

          {/* ── STATUS TAB ── */}
          <TabsContent value="status" className="space-y-4 mt-0">
            {/* Welcome card — CLIENT version */}
            {isConfirmedClient ? (
              <div className="rounded-xl border border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 via-emerald-50/60 to-teal-50/30 dark:from-green-950/40 dark:via-emerald-950/20 dark:to-teal-950/10 px-5 py-5">
                <div className="flex items-center gap-4 mb-3">
                  <div className="h-12 w-12 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-lg shrink-0 select-none shadow-md">
                    {data.client.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-base text-green-900 dark:text-green-200">{data.client.name}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-300 text-[10px] font-semibold px-2 py-0.5 border border-green-200 dark:border-green-700">
                        <CheckCircle2 className="h-3 w-3" /> Confirmed Client
                      </span>
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">Welcome to the DAFKU client family — we're delighted to have you on board.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div className="rounded-lg bg-white/70 dark:bg-white/5 border border-green-100 dark:border-green-800/60 px-3 py-2.5 space-y-0.5">
                    <p className="text-muted-foreground uppercase tracking-wide text-[10px] font-medium">Your Lawyer</p>
                    <p className="font-semibold text-foreground">DAFKU Legal Team</p>
                    <p className="text-muted-foreground">+355 69 69 52 989</p>
                  </div>
                  <div className="rounded-lg bg-white/70 dark:bg-white/5 border border-green-100 dark:border-green-800/60 px-3 py-2.5 space-y-0.5">
                    <p className="text-muted-foreground uppercase tracking-wide text-[10px] font-medium">Email</p>
                    <p className="font-semibold text-foreground break-all">info@dafkulawfirm.al</p>
                    <p className="text-muted-foreground">Mon–Fri, 09:00–17:00</p>
                  </div>
                </div>
              </div>
            ) : (
            <div className="rounded-lg border border-violet-200/60 dark:border-violet-800/30 bg-gradient-to-br from-violet-50/60 to-indigo-50/20 dark:from-violet-950/20 dark:to-indigo-950/10 px-4 py-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-9 w-9 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-base shrink-0 select-none">
                  {data.client.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm">Hello, {data.client.name} 👋</p>
                  <p className="text-xs text-muted-foreground">Welcome to your personal DAFKU client portal</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pl-12">This is your secure space to track your case, review proposals, and communicate directly with your lawyer.</p>
            </div>
            )}

            {/* Journey progress — hide for confirmed clients */}
            {!isConfirmedClient && (() => {
              const steps = [
                { key: 'enquiry', label: 'Enquiry' },
                { key: 'intake', label: 'Intake' },
                { key: 'proposal', label: 'Proposal' },
                { key: 'contract', label: 'Contract' },
                { key: 'payment', label: 'Payment' },
                { key: 'client', label: 'Confirmed' },
              ];
              const statusToStep: Record<string, number> = {
                NEW: 1, INTAKE: 1, SEND_PROPOSAL: 2, WAITING_APPROVAL: 3,
                DISCUSSING_Q: 3, WAITING_RESPONSE_P: 3, SEND_CONTRACT: 4,
                WAITING_ACCEPTANCE: 4, WAITING_RESPONSE_C: 4, AWAITING_PAYMENT: 5, CLIENT: 6,
              };
              const currentStep = statusToStep[data.client.status] ?? 1;
              return (
                <div className="rounded-md border bg-card px-4 py-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">Your Journey</p>
                  <div className="flex items-start">
                    {steps.map((step, i) => {
                      const stepNum = i + 1;
                      const done = stepNum < currentStep;
                      const active = stepNum === currentStep;
                      return (
                        <div key={step.key} className="flex items-start flex-1 min-w-0">
                          <div className="flex flex-col items-center gap-1 min-w-0 flex-shrink-0 w-full">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              done ? 'bg-green-500 text-white' : active ? 'bg-violet-600 text-white ring-2 ring-violet-300 dark:ring-violet-800' : 'bg-muted text-muted-foreground'
                            }`}>
                              {done ? '✓' : stepNum}
                            </div>
                            <span className={`text-[9px] text-center leading-tight px-0.5 ${
                              active ? 'text-foreground font-semibold' : done ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                            }`}>{step.label}</span>
                          </div>
                          {i < steps.length - 1 && (
                            <div className={`h-px flex-1 mt-3 min-w-[4px] mx-0.5 ${
                              done ? 'bg-green-400' : 'bg-border'
                            }`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {data.client.status === 'CLIENT' && false && (
              <div className="rounded-md border border-green-300 bg-green-50/60 dark:bg-green-950/30 dark:border-green-800 px-4 py-3 text-sm text-center space-y-0.5">
                <p className="font-semibold text-green-800 dark:text-green-300">✓ You are a confirmed DAFKU client</p>
                <p className="text-xs text-muted-foreground">We're committed to providing you with the best legal support. Your lawyer will be in touch regarding next steps — feel free to send a message any time.</p>
              </div>
            )}

            {data.client.status === 'NEW' && (
              <div className="rounded-md border border-violet-200 bg-violet-50/60 dark:bg-violet-950/20 dark:border-violet-800 px-4 py-4 space-y-3">
                <p className="font-semibold text-violet-900 dark:text-violet-200">📋 What happens next?</p>
                <div className="space-y-2.5 text-sm text-violet-800 dark:text-violet-300">
                  <div className="flex gap-2.5">
                    <span className="shrink-0 font-bold">1.</span>
                    <div><strong>We review your enquiry</strong> — Our team is reviewing the information you submitted and will be in touch shortly. No action is needed from you at this stage.</div>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="shrink-0 font-bold">2.</span>
                    <div><strong>You will receive an intake form</strong> — Once reviewed, we will send you a short form through this portal. It takes about 2 minutes and helps us understand your specific situation in detail.</div>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="shrink-0 font-bold">3.</span>
                    <div><strong>We prepare your personalised proposal</strong> — Based on your answers, we will build a tailored legal proposal covering exactly the services you need and the associated fees.</div>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="shrink-0 font-bold">4.</span>
                    <div><strong>Review, sign &amp; proceed</strong> — You will be able to review, accept, and sign your service agreement directly through this portal — no office visit needed.</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pt-2 border-t border-violet-200 dark:border-violet-800">
                  No action needed right now — you will be notified by email when your intake form is ready. For urgent matters, reach us on WhatsApp: <strong>+355 69 69 52 989</strong>
                </p>
              </div>
            )}

            {data.client.status === 'INTAKE' && (
              <div className="rounded-md border border-violet-200 bg-violet-50/60 dark:bg-violet-950/20 dark:border-violet-800 px-4 py-4 space-y-3">
                <p className="font-semibold text-violet-900 dark:text-violet-200">🔍 Your enquiry is being reviewed</p>
                <div className="space-y-2.5 text-sm text-violet-800 dark:text-violet-300">
                  <div className="flex gap-2.5">
                    <span className="shrink-0 font-bold">1.</span>
                    <div><strong>Enquiry received ✔</strong> — We have received your enquiry and our team is currently reviewing your details.</div>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="shrink-0 font-bold">2.</span>
                    <div><strong>Intake form — coming soon</strong> — Once our review is complete, we will unlock a short intake form here in your portal. It only takes a few minutes and lets us prepare a tailored proposal for you.</div>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="shrink-0 font-bold">3.</span>
                    <div><strong>Personalised proposal</strong> — After you complete the intake form, we will prepare a proposal specific to your needs and present it here for your review.</div>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="shrink-0 font-bold">4.</span>
                    <div><strong>Review, sign &amp; proceed</strong> — You will be able to review, accept, and sign your service agreement directly through this portal — no office visit needed.</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pt-2 border-t border-violet-200 dark:border-violet-800">
                  Please wait — your intake form will appear in a new tab here once our team is ready. For urgent matters, contact us on WhatsApp: <strong>+355 69 69 52 989</strong>
                </p>
              </div>
            )}
            {!isConfirmedClient && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{data.client.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Services</span>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {(data.client.services || []).map((s: ServiceType) => (
                      <Badge key={s} variant="secondary">{SERVICE_LABELS[s] || s}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            )}

            {data.cases.length > 0 && (
              <div className="space-y-3">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Your Cases ({data.cases.length})
                </h2>
                {data.cases.map((c) => (
                  <CaseCard key={c.caseId} c={c} history={data.history} />
                ))}
              </div>
            )}

            {isConfirmedClient && (
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground text-sm">Need help or have a question?</p>
                <p>Reach your legal team directly via the <strong>Messages</strong> tab, by email at <strong>info@dafkulawfirm.al</strong>, or on WhatsApp: <strong>+355 69 69 52 989</strong>.</p>
                <p>Our office hours are Monday to Friday, 09:00–17:00.</p>
              </div>
            )}
            {!isConfirmedClient && (
            <p className="text-center text-xs text-muted-foreground pt-2 border-t">
              Have a question? Use the Messages tab or reach us on WhatsApp: <strong>+355 69 69 52 989</strong> — we're here to help.
            </p>
            )}
          </TabsContent>

          {/* ── INTAKE TAB ── */}
          {showIntakeTab && (
            <TabsContent value="intake" className="mt-0 space-y-3">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Please take a few minutes to answer the questions below. Your answers help us prepare a personalised proposal tailored to your situation — you only need to do this once.
                </p>
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex flex-col gap-1">
                  <span className="font-medium text-foreground">Have a question first?</span>
                  <span>Use the <strong>Messages</strong> tab to chat with us directly before filling in the form — we're happy to clarify anything.</span>
                </div>
              </div>
              <ClientIntakeForm
                services={data.client.services || []}
                clientName={data.client.name}
                savedFields={data.client.proposalFields}
                alreadySubmitted={!!data.intakeLastSubmittedAt && !data.intakeBotReset}
                onComplete={async (fields) => {
                  if (!token) return;
                  try { await savePortalIntakeFields(token, fields); } catch { /* non-blocking */ }
                }}
              />
              <p className="text-xs text-muted-foreground text-center">
                Need immediate help?{" "}
                <a
                  href="https://wa.me/355696952989"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted hover:text-foreground"
                >
                  Contact us on WhatsApp
                </a>
                {" "}(+355 69 69 52 989)
              </p>
            </TabsContent>
          )}

          {/* ── PROPOSAL TAB ── */}
          {showProposalTab && snap && (
            <TabsContent value="proposal" className="mt-0 space-y-3">
              {data.proposalExpiresAt && new Date(data.proposalExpiresAt) < new Date() && (
                <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span><strong>This proposal has expired.</strong> Please contact your lawyer to request an updated proposal.</span>
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handlePortalPrint} className="gap-1.5">
                  <FileDown className="h-4 w-4" />
                  Save as PDF
                </Button>
              </div>
              <ProposalRenderer
                innerRef={portalPrintRef}
                clientName={data.client.name}
                clientId={data.client.customerId}
                services={(data.client.services || []) as import("@/lib/types").ServiceType[]}
                fields={snap}
              />

              <p className="text-xs text-muted-foreground text-center">
                Questions about this proposal?{" "}
                <a href="https://wa.me/355696952989" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-foreground">
                  Contact us on WhatsApp
                </a>
                {" "}(+355 69 69 52 989)
              </p>
              {/* ── Proposal Accept / Revision ── */}
              {(data.client.status === "SEND_PROPOSAL" || data.client.status === "WAITING_APPROVAL") && (
                <div className="mt-6 border-t pt-5">
                  {proposalRespondDone === "accepted" && (
                    <div className="flex items-center gap-2 justify-center text-green-700 dark:text-green-400 font-medium text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      Proposal accepted — your lawyer has been notified.
                    </div>
                  )}
                  {!proposalRespondDone && (
                    <>
                      <p className="text-sm font-medium text-center mb-4">Ready to proceed?</p>
                      <div className="flex flex-col items-center gap-4">
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white gap-2"
                          disabled={proposalResponding}
                          onClick={async () => {
                            if (!token) return;
                            setProposalResponding(true);
                            try {
                              await respondToProposal(token, "accept");
                              setProposalRespondDone("accepted");
                            } finally {
                              setProposalResponding(false);
                            }
                          }}
                        >
                          <ThumbsUp className="w-4 h-4" />
                          Accept Proposal
                        </Button>
                        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-center max-w-sm">
                          <p className="font-medium mb-1">Have questions or concerns about this proposal?</p>
                          <p className="text-xs text-muted-foreground">
                            Contact us via{" "}
                            <a
                              href="https://wa.me/355696952989"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline decoration-dotted hover:text-foreground font-medium"
                            >
                              WhatsApp (+355 69 69 52 989)
                            </a>
                            {" "}or use the <strong>Messages</strong> tab on this page — we&apos;re happy to discuss.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}            </TabsContent>
          )}

          {/* ── CONTRACT TAB ── */}
          {showContractTab && data.contractSnapshot && (
            <TabsContent value="contract" className="mt-0 space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleContractPrint} className="gap-1.5">
                  <FileDown className="h-4 w-4" />
                  Save as PDF
                </Button>
              </div>
              <ContractRenderer
                innerRef={contractPrintRef}
                clientName={data.client.name}
                clientId={data.client.customerId}
                services={(data.client.services || []) as import("@/lib/types").ServiceType[]}
                fields={data.contractSnapshot}
              />
              <p className="text-xs text-muted-foreground text-center">
                Questions about this contract?{" "}
                <a href="https://wa.me/355696952989" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-foreground">
                  Contact us on WhatsApp
                </a>
                {" "}(+355 69 69 52 989)
              </p>
              {/* ── Contract Accept ── */}
              {(data.client.status === "WAITING_ACCEPTANCE" || data.client.status === "SEND_CONTRACT") && (
                <div className="mt-6 border-t pt-5">
                  {contractRespondDone === "accepted" && (
                    <div className="flex items-center gap-2 justify-center text-green-700 dark:text-green-400 font-medium text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      Contract signed! Please proceed to the <strong>Payment</strong> tab to complete your onboarding.
                    </div>
                  )}
                  {!contractRespondDone && (
                    <>
                      {/* ── Initial payment commitment notice ── */}
                      {data.initialPaymentAmount && (
                        <div className="mx-auto max-w-lg mb-5">
                          <div className="relative overflow-hidden rounded-xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-amber-50 to-orange-50 dark:from-amber-950/60 dark:via-amber-900/40 dark:to-orange-950/50 dark:border-amber-500 px-5 py-4 shadow-sm">
                            <div className="absolute top-0 right-0 w-24 h-24 opacity-5 dark:opacity-10">
                              <CreditCard className="w-full h-full text-amber-500" />
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="shrink-0 mt-0.5 bg-amber-400 dark:bg-amber-500 text-white rounded-full p-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </div>
                              <div className="space-y-1.5">
                                <p className="font-bold text-sm text-amber-900 dark:text-amber-200 tracking-wide">
                                  Initial Payment Required After Signing
                                </p>
                                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                                  By accepting and signing this agreement, you confirm your commitment to make the agreed initial payment of{" "}
                                  <span className="font-bold text-base text-amber-900 dark:text-amber-100">
                                    {data.initialPaymentAmount.toLocaleString()} {data.initialPaymentCurrency ?? "EUR"}
                                  </span>{" "}
                                  to activate your client account and allow us to begin work on your matter.
                                </p>
                                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                  Our team will reach out with payment instructions immediately after you sign. The remaining balance will be settled at a later stage as outlined in the agreement.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      <p className="text-sm font-medium text-center mb-4">Ready to confirm?</p>
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-full max-w-sm space-y-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">
                              Type your full legal name to confirm
                            </label>
                            <input
                              className={`w-full border rounded px-3 py-2 text-sm ${
                                contractSignName.trim() &&
                                contractSignName.trim().toLowerCase() !== data.client.name.trim().toLowerCase()
                                  ? "border-red-400 bg-red-50"
                                  : ""
                              }`}
                              placeholder={data.client.name}
                              value={contractSignName}
                              onChange={(e) => setContractSignName(e.target.value)}
                            />
                            {contractSignName.trim() &&
                              contractSignName.trim().toLowerCase() !== data.client.name.trim().toLowerCase() && (
                              <p className="text-xs text-red-500">
                                Name must match exactly: <strong>{data.client.name}</strong>
                              </p>
                            )}
                          </div>
                          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={contractSignAgreed}
                              onChange={(e) => setContractSignAgreed(e.target.checked)}
                              className="mt-0.5"
                            />
                            I have read and understood the full contract and agree to be legally bound by its terms.
                          </label>
                        </div>
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white gap-2"
                          disabled={contractResponding || contractSignName.trim().toLowerCase() !== data.client.name.trim().toLowerCase() || !contractSignAgreed}
                          onClick={async () => {
                            if (!token) return;
                            setContractResponding(true);
                            try {
                              await respondToContract(token, contractSignName.trim());
                              setContractRespondDone("accepted");
                              // Re-fetch portal data immediately to get the auto-created invoice
                              getPortalData(token).then((d) => setData(d)).catch(() => {});
                            } finally {
                              setContractResponding(false);
                            }
                          }}
                        >
                          <ThumbsUp className="w-4 h-4" />
                          Accept Contract
                        </Button>
                        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-center max-w-sm">
                          <p className="font-medium mb-1">Have questions about this contract?</p>
                          <p className="text-xs text-muted-foreground">
                            Contact us via{" "}
                            <a href="https://wa.me/355696952989" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-foreground font-medium">
                              WhatsApp (+355 69 69 52 989)
                            </a>
                            {" "}or use the <strong>Messages</strong> tab — we&apos;re happy to clarify.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </TabsContent>
          )}

          {/* ── PAYMENT TAB ── */}
          {showPaymentTab && (
            <TabsContent value="payment" className="mt-0 space-y-4">
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3 text-sm space-y-1">
                <p className="font-semibold text-amber-900 dark:text-amber-300">💳 Payment Required to Activate Your Account
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-400">
                  Your contract has been signed. Please complete the payment below to become a confirmed client.
                </p>
              </div>

              {/* Amount due */}
              {(data.paymentAmountALL || data.paymentAmountEUR) && (
                <div className="rounded-md border bg-card px-4 py-3 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Contract Amount</p>
                  <p className="text-xl font-bold">
                    {data.paymentAmountALL ? `${data.paymentAmountALL.toLocaleString()} ALL` : ''}
                    {data.paymentAmountALL && data.paymentAmountEUR ? ' ≈ ' : ''}
                    {data.paymentAmountEUR ? `${data.paymentAmountEUR.toFixed(2)} EUR` : ''}
                  </p>
                  {data.initialPaymentAmount && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Initial Payment Required Now</p>
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                        {data.initialPaymentAmount.toLocaleString()} {data.initialPaymentCurrency ?? 'EUR'}
                      </p>
                      <p className="text-xs text-muted-foreground">The remaining balance will be due at a later stage as agreed.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Admin note */}
              {data.paymentNote && (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex gap-2">
                  <StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{data.paymentNote}</span>
                </div>
              )}

              {/* Method selection */}
              {!paymentMethodSaved && !data.paymentSelectedMethod && !data.paymentDoneAt && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Select your preferred payment method:</p>
                  <div className="grid gap-2">
                    {(data.paymentMethods || []).map((m) => {
                      const labels: Record<string, string> = {
                        bank: '🏦 Bank Transfer',
                        crypto: '💎 Crypto (USDT)',
                        cash: '💵 Cash',
                      };
                      return (
                        <label
                          key={m}
                          className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                            paymentMethod === m ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={m}
                            checked={paymentMethod === m}
                            onChange={() => setPaymentMethod(m as 'bank' | 'crypto' | 'cash')}
                            className="accent-primary"
                          />
                          <span className="text-sm font-medium">{labels[m] ?? m}</span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Show instructions for selected method */}
                  {paymentMethod === 'bank' && (
                    <div className="rounded-md border bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm space-y-1">
                      <p className="font-semibold text-blue-900 dark:text-blue-300">Bank Transfer Instructions</p>
                      <p className="text-xs text-muted-foreground">Transfer the amount due to the account below. Use your full name as the payment reference.</p>
                      <div className="mt-2 space-y-1 text-xs font-mono bg-white dark:bg-zinc-900 rounded border px-3 py-2">
                        <div><span className="text-muted-foreground">Bank:</span> Raiffeisen Bank Albania</div>
                        <div><span className="text-muted-foreground">Account Holder:</span> DAFKU Law Firm Sh.p.k.</div>
                        <div><span className="text-muted-foreground">IBAN:</span> AL47 0000 0000 0000 0000 0000 0000</div>
                        <div><span className="text-muted-foreground">BIC/SWIFT:</span> SGSBALTX</div>
                        <div><span className="text-muted-foreground">Currency:</span> ALL or EUR</div>
                        <div><span className="text-muted-foreground">Reference:</span> Your full name</div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">After transferring, please email proof of payment to <strong>info@dafkulawfirm.al</strong> or via WhatsApp: <strong>+355 69 69 52 989</strong>.</p>
                    </div>
                  )}

                  {paymentMethod === 'crypto' && (
                    <div className="rounded-md border bg-purple-50 dark:bg-purple-950/30 px-4 py-3 text-sm space-y-1">
                      <p className="font-semibold text-purple-900 dark:text-purple-300">Crypto Payment Instructions (USDT)</p>
                      <p className="text-xs text-muted-foreground">Send USDT to the wallet address below. Use the TRC-20 (TRON) network.</p>
                      <div className="mt-2 bg-white dark:bg-zinc-900 rounded border px-3 py-2 text-xs font-mono break-all">
                        <div><span className="text-muted-foreground">Network:</span> TRON (TRC-20)</div>
                        <div><span className="text-muted-foreground">Token:</span> USDT</div>
                        <div><span className="text-muted-foreground">Address:</span> T_PLACEHOLDER_WALLET_ADDRESS</div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">After sending, share the transaction hash via email: <strong>info@dafkulawfirm.al</strong> or WhatsApp: <strong>+355 69 69 52 989</strong>.</p>
                      <p className="text-xs text-amber-600">Note: Always double-check the network (TRC-20) before sending.</p>
                    </div>
                  )}

                  {paymentMethod === 'cash' && (
                    <div className="rounded-md border bg-green-50 dark:bg-green-950/30 px-4 py-3 text-sm space-y-1">
                      <p className="font-semibold text-green-900 dark:text-green-300">Cash Payment Instructions</p>
                      <p className="text-xs text-muted-foreground">Visit our office to pay in cash. Please call ahead to schedule a time.</p>
                      <div className="mt-2 bg-white dark:bg-zinc-900 rounded border px-3 py-2 text-xs">
                        <div><span className="font-medium">Address:</span> Rr. Ismail Qemali, Tirana, Albania</div>
                        <div><span className="font-medium">Hours:</span> Mon–Fri, 09:00 – 17:00</div>
                        <div><span className="font-medium">Phone:</span> +355 69 69 52 989</div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Once you arrive, mention your name and that you are here for a contract payment.</p>
                    </div>
                  )}

                  {paymentMethod && (
                    <Button
                      className="w-full"
                      disabled={paymentSaving}
                      onClick={async () => {
                        if (!token || !paymentMethod) return;
                        setPaymentSaving(true);
                        try {
                          await selectPortalPaymentMethod(token, paymentMethod as 'bank' | 'crypto' | 'cash');
                          setPaymentMethodSaved(true);
                          setData((prev) => prev ? { ...prev, paymentSelectedMethod: paymentMethod as 'bank' | 'crypto' | 'cash' } : prev);
                        } catch (e) {
                          alert(String((e as Error)?.message ?? 'Failed to save selection.'));
                        } finally {
                          setPaymentSaving(false);
                        }
                      }}
                    >
                      {paymentSaving ? 'Saving...' : `Confirm I will pay by ${paymentMethod === 'bank' ? 'bank transfer' : paymentMethod === 'crypto' ? 'crypto' : 'cash'}`}
                    </Button>
                  )}
                </div>
              )}

              {/* After method saved */}
              {(paymentMethodSaved || (data.paymentSelectedMethod && !data.paymentDoneAt)) && !data.paymentDoneAt && (
                <div className="rounded-md border border-blue-300 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-700 px-4 py-3 text-sm space-y-1">
                  <p className="font-semibold text-blue-800 dark:text-blue-300">🕒 Waiting for Payment Confirmation</p>
                  <p className="text-xs text-muted-foreground">
                    Your payment method preference has been recorded. Once our team confirms receipt of payment, your account will be fully activated.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Have you already made the payment? Let us know via email: <strong>info@dafkulawfirm.al</strong> or WhatsApp: <strong>+355 69 69 52 989</strong>.
                  </p>
                </div>
              )}

              {/* Payment confirmed by admin */}
              {data.paymentDoneAt && (
                <div className="rounded-md border border-green-300 bg-green-50/60 dark:bg-green-950/30 dark:border-green-800 px-4 py-3 text-sm text-center space-y-1">
                  <p className="font-semibold text-green-800 dark:text-green-300">✓ Payment Confirmed!</p>
                  <p className="text-xs text-muted-foreground">Your payment has been confirmed. You are now a fully confirmed DAFKU client.</p>
                </div>
              )}

              <p className="text-center text-xs text-muted-foreground pt-2">
                Questions? Email us at <strong>info@dafkulawfirm.al</strong> or WhatsApp: <strong>+355 69 69 52 989</strong>
              </p>
            </TabsContent>
          )}

          {/* ── INVOICES TAB ── */}
          {showInvoicesTab && (
            <TabsContent value="invoices" className="mt-0 space-y-3">
              <div className="rounded-md border bg-primary/5 px-4 py-3 text-sm space-y-0.5">
                <p className="font-semibold">Your Invoices</p>
                <p className="text-xs text-muted-foreground">Below is a summary of all invoices associated with your account. Contact us with any questions.</p>
              </div>
              {(data.invoices || []).map((inv) => {
                const paid = inv.amountPaid ?? 0;
                const remaining = Math.max(0, inv.amount - paid);
                const paidPct = inv.amount > 0 ? Math.min(100, (paid / inv.amount) * 100) : 0;
                const statusColor = inv.status === 'paid'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : inv.status === 'overdue'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                  : inv.status === 'cancelled'
                  ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
                return (
                  <Card key={inv.invoiceId}>
                    <CardContent className="pt-4 pb-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{inv.description}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{inv.invoiceId}</div>
                          {inv.dueDate && (
                            <div className="text-xs text-muted-foreground mt-0.5">Due: {new Date(inv.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold">{inv.currency} {inv.amount.toLocaleString()}</div>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor}`}>
                            {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                          </span>
                        </div>
                      </div>
                      {paid > 0 && (
                        <div className="space-y-1">
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${paidPct.toFixed(0)}%` }} />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span className="text-green-600 dark:text-green-400">Paid: {inv.currency} {paid.toLocaleString()}</span>
                            {remaining > 0 && <span className="text-amber-600">Remaining: {inv.currency} {remaining.toLocaleString()}</span>}
                            {remaining === 0 && <span className="text-green-600">✔ Fully paid</span>}
                          </div>
                        </div>
                      )}
                      {inv.payments && inv.payments.length > 0 && (
                        <div className="rounded-md bg-muted/40 border divide-y text-xs">
                          {inv.payments.map((p) => (
                            <div key={p.paymentId} className="flex items-center gap-2 px-3 py-1.5">
                              <span className="font-medium">{inv.currency} {Number(p.amount).toLocaleString()}</span>
                              <span className="text-muted-foreground">{p.method.replace('_', ' ')}</span>
                              {p.note && <span className="text-muted-foreground">— {p.note}</span>}
                              <span className="ml-auto text-muted-foreground">{p.date ? new Date(p.date).toLocaleDateString('en-GB') : ''}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              <p className="text-xs text-muted-foreground text-center pt-2">
                Questions about an invoice? Use the <strong>Messages</strong> tab or WhatsApp us.
              </p>
            </TabsContent>
          )}

          {/* ── FAQ / MESSAGES TAB ── */}
          <TabsContent value="faq" className="mt-0 space-y-3">
            <div className="rounded-md border bg-primary/5 px-4 py-3 text-sm space-y-0.5">
              <p className="font-semibold">{isConfirmedClient ? 'Messages & Support' : 'Frequently Asked Questions'}</p>
              <p className="text-xs text-muted-foreground">
                {isConfirmedClient
                  ? 'Send a message to your legal team or ask a question — we typically respond within one business day.'
                  : 'Ask anything about our services, timelines, fees, or process — our assistant will find the answer instantly.'}
              </p>
            </div>
            <FaqBot />
            {!isConfirmedClient && (
            <p className="text-xs text-muted-foreground text-center">
              Didn&apos;t find your answer?{" "}
              <span className="font-medium">Switch to the Messages tab</span> to chat with your lawyer directly.
            </p>
            )}
            {isConfirmedClient && (
              <div className="rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1 text-center">
                <p>You can also reach us directly via email: <strong>info@dafkulawfirm.al</strong></p>
                <p>Or WhatsApp: <strong>+355 69 69 52 989</strong> — Mon–Fri, 09:00–17:00</p>
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}

