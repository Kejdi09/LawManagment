import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getPortalData, getPortalChatByToken, sendPortalMessage, savePortalIntakeFields, markProposalViewed, respondToProposal, respondToContract } from "@/lib/case-store";
import { PortalData, PortalMessage, ServiceType, SERVICE_LABELS } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { PortalChatPanel, countTrailingClient } from "@/components/PortalChatPanel";
import ClientIntakeForm from "@/components/ClientIntakeForm";
import FaqBot from "@/components/FaqBot";
import ProposalRenderer from "@/components/ProposalRenderer";
import ContractRenderer from "@/components/ContractRenderer";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Clock, CheckCircle2, AlertCircle, AlertTriangle, ChevronDown, ChevronUp,
  MessageSquare, CalendarClock, StickyNote, ClipboardList, ThumbsUp, PenLine, Bot, FileDown, Receipt,
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

  return (
    <Card className={isWaitingClient ? "border-amber-400 dark:border-amber-500" : ""}>
      <CardContent className="pt-4 pb-3 space-y-3">
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
  // Chat state
  const [chatMessages, setChatMessages] = useState<PortalMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);
  // Proposal response state
  const [proposalResponding, setProposalResponding] = useState(false);
  const [proposalRespondDone, setProposalRespondDone] = useState<"accepted" | null>(null);
  // Contract response state
  const [contractResponding, setContractResponding] = useState(false);
  const [contractRespondDone, setContractRespondDone] = useState<"accepted" | null>(null);
  const contractPrintRef = useRef<HTMLDivElement>(null);
  // Tracks whether a new lawyer message has arrived since the client last opened the Messages tab
  const [unreadFromLawyer, setUnreadFromLawyer] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevMsgCountRef = useRef(0);
  const proposalViewedRef = useRef(false);
  const portalPrintRef = useRef<HTMLDivElement>(null);
  const [contractSignName, setContractSignName] = useState("");
  const [contractSignAgreed, setContractSignAgreed] = useState(false);

  function handlePortalPrint() {
    const content = portalPrintRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Proposal — ${data?.client?.name ?? 'Client'}</title>
      <meta charset="utf-8"/>
      <style>
        @page { margin: 20mm 16mm; }
        *, *::before, *::after { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; margin: 0; padding: 0; }
        section { page-break-inside: avoid; break-inside: avoid; }
        table { page-break-inside: avoid; break-inside: avoid; }
        @media print { body { font-size: 11px; } }
      </style>
    </head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  function handleContractPrint() {
    const content = contractPrintRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Service Agreement — ${data?.client?.name ?? 'Client'}</title>
      <meta charset="utf-8"/>
      <style>
        @page { margin: 20mm 16mm; }
        *, *::before, *::after { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; margin: 0; padding: 0; }
        section { page-break-inside: avoid; break-inside: avoid; }
        h2, h3 { page-break-after: avoid; break-after: avoid; }
        table { page-break-inside: avoid; break-inside: avoid; }
        @media print { body { font-size: 11px; } }
      </style>
    </head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  // Load portal data
  useEffect(() => {
    if (!token) { setError("Invalid link"); setLoading(false); return; }
    getPortalData(token)
      .then((d) => {
        setData(d);
        // Initialise chat from the portal data payload (avoids an extra round-trip)
        if (d.chatMessages) {
          setChatMessages(d.chatMessages);
          prevMsgCountRef.current = d.chatMessages.length;
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

  // Request browser notification permission so we can alert on new messages
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // If the proposal tab is the default tab on first load, mark it viewed immediately
  useEffect(() => {
    if (!data || !token || proposalViewedRef.current) return;
    if (!!data.proposalSentAt && !!data.proposalSnapshot) {
      proposalViewedRef.current = true;
      markProposalViewed(token);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Poll for new chat messages every 12 seconds (client-visible only)
  useEffect(() => {
    if (!token) return;
    const fetchChat = () => {
      getPortalChatByToken(token)
        .then(({ expired, messages }) => {
          // Detect new lawyer messages and fire a browser notification
          const prev = prevMsgCountRef.current;
          const newLawyerMsgs = messages.slice(prev).filter((m) => m.senderType === 'lawyer');
          if (newLawyerMsgs.length > 0) {
            // Show the unread dot on the Messages tab
            setUnreadFromLawyer(true);
            // Also fire a browser notification if permitted
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('New message from your lawyer', {
                body: newLawyerMsgs[newLawyerMsgs.length - 1].text.slice(0, 100),
                icon: '/favicon.ico',
              });
            }
          }
          prevMsgCountRef.current = messages.length;
          setChatMessages(messages);
          if (expired) setLinkExpired(true);
        })
        .catch(() => {});
    };
    pollRef.current = setInterval(fetchChat, 12_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token]);

  const handleSendChat = async () => {
    if (!token || !chatText.trim() || chatSending) return;
    setChatSending(true);
    try {
      const msg = await sendPortalMessage(token, chatText.trim());
      setChatMessages((prev) => [...prev, msg]);
      setChatText("");
    } catch (e) {
      alert(String((e as Error)?.message ?? "Failed to send message."));
    } finally {
      setChatSending(false);
    }
  };

  const trailingClientCount = countTrailingClient(chatMessages);

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

  const showIntakeTab = data.client.status === "SEND_PROPOSAL";
  const showProposalTab = !!data.proposalSentAt && !!data.proposalSnapshot && data.client.status !== 'CLIENT';
  const showContractTab = !!data.contractSentAt && !!data.contractSnapshot;
  const showInvoicesTab = !!(data.invoices && data.invoices.length > 0);
  const tabCount = 3 + (showIntakeTab ? 1 : 0) + (showProposalTab ? 1 : 0) + (showContractTab ? 1 : 0) + (showInvoicesTab ? 1 : 0);
  const defaultTab = showContractTab ? "contract" : showProposalTab ? "proposal" : showIntakeTab ? "intake" : "status";
  // Unread indicator: set when a new lawyer message arrives during this session, cleared when client opens Messages tab
  const hasNewMessages = unreadFromLawyer;

  const snap = data.proposalSnapshot;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10 shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">DAFKU Law Firm — Client Portal</div>
            <div className="text-xs text-muted-foreground truncate">Welcome, {data.client.name} 👋</div>
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
        <div className="max-w-3xl mx-auto px-4 py-2 flex gap-2 flex-wrap">
          {(data.client.services || []).map((s: ServiceType) => (
            <Badge key={s} variant="secondary" className="text-xs">{SERVICE_LABELS[s] || s}</Badge>
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
            // Clear the unread dot as soon as the client opens the Messages tab
            if (tab === 'messages') {
              setUnreadFromLawyer(false);
            }
          }}>
          <TabsList className="w-full mb-4 grid" style={{ gridTemplateColumns: `repeat(${tabCount}, 1fr)` }}>
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
            <TabsTrigger value="faq" className="flex items-center gap-1.5 text-xs">
              <Bot className="h-3.5 w-3.5" /> FAQ
            </TabsTrigger>
            {showInvoicesTab && (
              <TabsTrigger value="invoices" className="flex items-center gap-1.5 text-xs">
                <Receipt className="h-3.5 w-3.5" /> Invoices
              </TabsTrigger>
            )}
            <TabsTrigger value="messages" className="flex items-center gap-1.5 text-xs relative">
              <MessageSquare className="h-3.5 w-3.5" /> Messages
              {hasNewMessages && (
                <span className="absolute top-1 right-2 h-2 w-2 rounded-full bg-blue-500" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── STATUS TAB ── */}
          <TabsContent value="status" className="space-y-4 mt-0">
            <div className="rounded-md border bg-primary/5 px-4 py-3 text-sm text-center space-y-0.5">
              <p className="font-semibold">Hello, {data.client.name}! We're glad you're here.</p>
              <p className="text-xs text-muted-foreground">This is your personal portal where you can track your case, review proposals, and message your lawyer directly.</p>
            </div>
            {data.client.status === 'CLIENT' && (
              <div className="rounded-md border border-green-300 bg-green-50/60 dark:bg-green-950/30 dark:border-green-800 px-4 py-3 text-sm text-center space-y-0.5">
                <p className="font-semibold text-green-800 dark:text-green-300">✓ You are a confirmed DAFKU client</p>
                <p className="text-xs text-muted-foreground">We're committed to providing you with the best legal support. Your lawyer will be in touch regarding next steps — feel free to send a message any time.</p>
              </div>
            )}
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

            <div className="space-y-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Your Cases ({data.cases.length})
              </h2>
              {data.cases.length === 0 && (
                <Card>
                  <CardContent className="py-6 text-sm text-muted-foreground text-center">
                    No active cases at this time.
                  </CardContent>
                </Card>
              )}
              {data.cases.map((c) => (
                <CaseCard key={c.caseId} c={c} history={data.history} />
              ))}
            </div>

            <p className="text-center text-xs text-muted-foreground pt-2 border-t">
              Have a question? Use the Messages tab or reach us on WhatsApp: <strong>+355 69 69 52 989</strong> — we're here to help.
            </p>
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
                      Contract accepted — congratulations, you're now a confirmed DAFKU client!
                    </div>
                  )}
                  {!contractRespondDone && (
                    <>
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

          {/* ── FAQ TAB ── */}
          <TabsContent value="faq" className="mt-0 space-y-3">
            <div className="rounded-md border bg-primary/5 px-4 py-3 text-sm space-y-0.5">
              <p className="font-semibold">Frequently Asked Questions</p>
              <p className="text-xs text-muted-foreground">Ask anything about our services, timelines, fees, or process — our assistant will find the answer instantly.</p>
            </div>
            <FaqBot />
            <p className="text-xs text-muted-foreground text-center">
              Didn&apos;t find your answer?{" "}
              <span className="font-medium">Switch to the Messages tab</span> to chat with your lawyer directly.
            </p>
          </TabsContent>

          {/* ── MESSAGES TAB ── */}
          <TabsContent value="messages" className="mt-0 space-y-3">
            {data.client.status === 'CLIENT' ? (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <p className="font-medium mb-0.5">Direct line to your lawyer</p>
                <p className="text-xs text-muted-foreground">As a confirmed client, you can message your lawyer here any time. We typically reply within one business day.</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Send a message directly to your lawyer. You can send up to 10 messages in a row before waiting for a reply.
                {linkExpired && " This link has expired — message history is preserved but you cannot send new messages."}
              </p>
            )}
            <PortalChatPanel
              messages={chatMessages}
              text={chatText}
              onTextChange={setChatText}
              onSend={handleSendChat}
              sending={chatSending}
              isAdmin={false}
              trailingClientCount={trailingClientCount}
              linkExpired={linkExpired}
              fillHeight={false}
            />
            <p className="text-xs text-muted-foreground text-center">
              For urgent matters, reach us directly on WhatsApp:{" "}
              <a
                href="https://wa.me/355696952989"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted hover:text-foreground"
              >
                +355 69 69 52 989
              </a>
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

