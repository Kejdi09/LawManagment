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
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Clock, CheckCircle2, AlertCircle, AlertTriangle, ChevronDown, ChevronUp,
  MessageSquare, CalendarClock, StickyNote, ClipboardList, ThumbsUp, PenLine, Bot, FileDown,
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
  const [contractPdfGenerating, setContractPdfGenerating] = useState(false);
  // Tracks whether a new lawyer message has arrived since the client last opened the Messages tab
  const [unreadFromLawyer, setUnreadFromLawyer] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevMsgCountRef = useRef(0);
  const proposalViewedRef = useRef(false);
  const portalPrintRef = useRef<HTMLDivElement>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  async function handlePortalPrint() {
    const content = portalPrintRef.current;
    if (!content || pdfGenerating) return;
    setPdfGenerating(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(content, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgData = canvas.toDataURL('image/png');
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let posY = 0;
      let remaining = imgH;
      pdf.addImage(imgData, 'PNG', 0, posY, imgW, imgH);
      remaining -= pageH;
      while (remaining > 0) {
        posY -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, posY, imgW, imgH);
        remaining -= pageH;
      }
      pdf.save(`Proposal - ${data?.client?.name ?? 'Client'}.pdf`);
    } catch {
      // silent fail
    } finally {
      setPdfGenerating(false);
    }
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
  const tabCount = 3 + (showIntakeTab ? 1 : 0) + (showProposalTab ? 1 : 0) + (showContractTab ? 1 : 0);
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
                <Button variant="outline" size="sm" onClick={handlePortalPrint} disabled={pdfGenerating} className="gap-1.5">
                  <FileDown className="h-4 w-4" />
                  {pdfGenerating ? "Generating…" : "Save as PDF"}
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
                <Button variant="outline" size="sm" disabled={contractPdfGenerating} className="gap-1.5"
                  onClick={async () => {
                    const content = contractPrintRef.current;
                    if (!content || contractPdfGenerating) return;
                    setContractPdfGenerating(true);
                    try {
                      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                        import('html2canvas'),
                        import('jspdf'),
                      ]);
                      const canvas = await html2canvas(content, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
                      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                      const pageW = pdf.internal.pageSize.getWidth();
                      const pageH = pdf.internal.pageSize.getHeight();
                      const imgData = canvas.toDataURL('image/png');
                      const imgW = pageW;
                      const imgH = (canvas.height * imgW) / canvas.width;
                      let posY = 0; let remaining = imgH;
                      pdf.addImage(imgData, 'PNG', 0, posY, imgW, imgH);
                      remaining -= pageH;
                      while (remaining > 0) { posY -= pageH; pdf.addPage(); pdf.addImage(imgData, 'PNG', 0, posY, imgW, imgH); remaining -= pageH; }
                      pdf.save(`Contract - ${data?.client?.name ?? 'Client'}.pdf`);
                    } catch { /* silent fail */ } finally { setContractPdfGenerating(false); }
                  }}>
                  <FileDown className="h-4 w-4" />
                  {contractPdfGenerating ? "Generating…" : "Save as PDF"}
                </Button>
              </div>
              <ProposalRenderer
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
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white gap-2"
                          disabled={contractResponding}
                          onClick={async () => {
                            if (!token) return;
                            setContractResponding(true);
                            try {
                              await respondToContract(token);
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

