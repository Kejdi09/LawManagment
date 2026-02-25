import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getPortalData, getPortalChatByToken, sendPortalMessage, savePortalIntakeFields } from "@/lib/case-store";
import { PortalData, PortalMessage, ServiceType, SERVICE_LABELS } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { PortalChatPanel, countTrailingClient } from "@/components/PortalChatPanel";
import { IntakeBotSection } from "@/components/IntakeBotPanel";
import { getServiceContent, fmt, EUR_RATE, USD_RATE, GBP_RATE } from "@/components/ProposalModal";
import {
  FileText, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  MessageSquare, CalendarClock, StickyNote, ClipboardList,
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevMsgCountRef = useRef(0);

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

  // Poll for new chat messages every 12 seconds (client-visible only)
  useEffect(() => {
    if (!token) return;
    const fetchChat = () => {
      getPortalChatByToken(token)
        .then(({ expired, messages }) => {
          // Detect new lawyer messages and fire a browser notification
          const prev = prevMsgCountRef.current;
          const newLawyerMsgs = messages.slice(prev).filter((m) => m.senderType === 'lawyer');
          if (newLawyerMsgs.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('New message from your lawyer', {
              body: newLawyerMsgs[newLawyerMsgs.length - 1].text.slice(0, 100),
              icon: '/favicon.ico',
            });
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

  const showIntakeTab = data.client.status === "SEND_PROPOSAL" || data.client.status === "INTAKE";
  const showProposalTab = !!data.proposalSentAt && !!data.proposalSnapshot;
  const tabCount = 2 + (showIntakeTab ? 1 : 0) + (showProposalTab ? 1 : 0);
  const defaultTab = showProposalTab ? "proposal" : showIntakeTab ? "intake" : "status";
  // Unread indicator: any lawyer messages newer than the last visit
  const hasNewMessages = chatMessages.some((m) => m.senderType === "lawyer" && !m.readByLawyer);

  // Proposal computed values (only used when showProposalTab)
  const snap = data.proposalSnapshot;
  const pConsultation = snap?.consultationFeeALL ?? 0;
  const pServiceFee = snap?.serviceFeeALL ?? 0;
  const pPoa = snap?.poaFeeALL ?? 0;
  const pTranslation = snap?.translationFeeALL ?? 0;
  const pOther = snap?.otherFeesALL ?? 0;
  const pServiceSubtotal = pConsultation + pServiceFee;
  const pAdditionalSubtotal = pPoa + pTranslation + pOther;
  const pTotal = pServiceSubtotal + pAdditionalSubtotal;
  const pTotalEUR = pTotal * EUR_RATE;
  const pTotalUSD = pTotal * USD_RATE;
  const pTotalGBP = pTotal * GBP_RATE;
  const pServiceContent = showProposalTab ? getServiceContent(data.client.services || [], snap?.propertyDescription) : null;
  const pDisplayDate = snap?.proposalDate
    ? new Date(snap.proposalDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".")
    : "";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10 shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">DAFKU Law Firm — Client Portal</div>
            <div className="text-xs text-muted-foreground truncate">{data.client.name}</div>
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
        <Tabs defaultValue={defaultTab} className="flex flex-col gap-0">
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
            <TabsTrigger value="messages" className="flex items-center gap-1.5 text-xs relative">
              <MessageSquare className="h-3.5 w-3.5" /> Messages
              {hasNewMessages && (
                <span className="absolute top-1 right-2 h-2 w-2 rounded-full bg-blue-500" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── STATUS TAB ── */}
          <TabsContent value="status" className="space-y-4 mt-0">
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
              For questions, use the Messages tab or contact us on WhatsApp: +355 69 62 71 692
            </p>
          </TabsContent>

          {/* ── INTAKE TAB ── */}
          {showIntakeTab && (
            <TabsContent value="intake" className="mt-0 space-y-3">
              <p className="text-sm text-muted-foreground">
                Please answer the questions below so our team can prepare a personalised proposal for you.
                This only takes a few minutes and you only need to do it once.
              </p>
              <IntakeBotSection
                services={data.client.services || []}
                clientName={data.client.name}
                storageKey={token}
                forceReset={!!data.intakeBotReset}
                onSendSummaryMessage={async (text) => {
                  if (!token) return;
                  try {
                    const msg = await sendPortalMessage(token, text);
                    setChatMessages((prev) => [...prev, msg]);
                  } catch { /* non-blocking */ }
                }}
                onComplete={async (fields) => {
                  if (!token) return;
                  try { await savePortalIntakeFields(token, fields); } catch { /* non-blocking */ }
                }}
              />
              <p className="text-xs text-muted-foreground text-center">
                Need immediate help?{" "}
                <a
                  href="https://wa.me/355696271692"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted hover:text-foreground"
                >
                  Contact us on WhatsApp
                </a>
                {" "}(+355 69 62 71 692)
              </p>
            </TabsContent>
          )}

          {/* ── PROPOSAL TAB ── */}
          {showProposalTab && snap && pServiceContent && (
            <TabsContent value="proposal" className="mt-0 space-y-3">
              <div
                className="bg-white text-gray-900 rounded-lg border shadow-sm p-8 font-serif text-[13px] leading-relaxed"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {/* Cover */}
                <h1 className="text-2xl font-bold text-center uppercase tracking-widest mb-1">Service Proposal</h1>
                <p className="text-center text-sm text-gray-500 mb-6">Presented to: <strong>{data.client.name}</strong></p>

                <div className="border rounded p-4 mb-2 bg-gray-50">
                  <p className="text-sm font-semibold mb-1">Services Provided:</p>
                  <p className="text-sm">{snap.proposalTitle}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-2 border rounded p-4 bg-gray-50">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Office in Tirana</p>
                    <p className="text-xs text-gray-700">Gjergj Fishta Blvd, F.G.P Bld. Ent. nr. 2, Office 5, 1001, Tirana, Albania.</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Office in Durrës</p>
                    <p className="text-xs text-gray-700">Rruga Aleksandër Goga, Lagja 11, 2001, Durrës, Albania.</p>
                  </div>
                </div>

                <div className="border rounded p-4 mb-8 bg-gray-50 text-xs text-gray-700 flex flex-wrap gap-4">
                  <span>☎ +355 69 62 71 692</span>
                  <span>✉ info@dafkulawfirm.al</span>
                  <span>🌐 www.dafkulawfirm.al</span>
                  <span className="ml-auto font-semibold">Date: {pDisplayDate}</span>
                </div>

                {/* Section 1 */}
                <div className="mb-1">
                  <p className="text-sm font-bold border-b pb-1 mb-2">1 — Scope of the Proposal</p>
                  <p className="text-sm">{pServiceContent.scopeParagraph}</p>
                  {snap.transactionValueEUR && (
                    <p className="text-sm mt-1">Total estimated transaction value: <strong>EUR {fmt(snap.transactionValueEUR, 0)}</strong>.</p>
                  )}
                </div>

                {/* Section 2 */}
                <div className="mt-6">
                  <p className="text-sm font-bold border-b pb-1 mb-2">2 — Scope of Services Provided</p>
                  {pServiceContent.servicesSections.map((sec) => (
                    <div key={sec.heading} className="mt-3">
                      <p className="text-sm font-semibold mb-1">{sec.heading}</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {sec.bullets.map((b, i) => <li key={i} className="text-sm">{b}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* Section 3 */}
                <div className="mt-6">
                  <p className="text-sm font-bold border-b pb-1 mb-2">3 — Required Documents</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {pServiceContent.requiredDocs.map((d, i) => <li key={i} className="text-sm">{d}</li>)}
                  </ul>
                </div>

                {/* Section 4 */}
                <div className="mt-6">
                  <p className="text-sm font-bold border-b pb-1 mb-2">4 — Fees &amp; Costs</p>
                  <p className="text-sm font-semibold mb-1">4.2 Fees Applied to This Engagement</p>
                  <table className="w-full border-collapse text-sm mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-3 py-1.5 text-left">Description</th>
                        <th className="border px-3 py-1.5 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td className="border px-3 py-1.5">Consultation fee</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(pConsultation, 0)} ALL</td></tr>
                      <tr>
                        <td className="border px-3 py-1.5">Service fee{snap.propertyDescription ? ` — ${snap.propertyDescription}` : ""}</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(pServiceFee, 0)} ALL</td>
                      </tr>
                      <tr className="bg-gray-50 font-semibold"><td className="border px-3 py-1.5">Service Fees Subtotal</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(pServiceSubtotal, 0)} ALL</td></tr>
                      <tr><td className="border px-3 py-1.5">Power of Attorney</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(pPoa, 0)} ALL</td></tr>
                      <tr><td className="border px-3 py-1.5">Translation &amp; Notary{snap.additionalCostsNote ? ` (${snap.additionalCostsNote})` : ""}</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(pTranslation, 0)} ALL</td></tr>
                      <tr><td className="border px-3 py-1.5">Other fees</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(pOther, 0)} ALL</td></tr>
                      <tr className="bg-gray-50 font-semibold"><td className="border px-3 py-1.5">Additional Costs Subtotal</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(pAdditionalSubtotal, 0)} ALL</td></tr>
                      <tr className="bg-gray-100 font-bold"><td className="border px-3 py-1.5">TOTAL</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(pTotal, 0)} ALL ≈ {fmt(pTotalEUR)} EUR ≈ {fmt(pTotalUSD)} USD ≈ {fmt(pTotalGBP)} GBP</td></tr>
                    </tbody>
                  </table>
                  <p className="text-xs text-gray-500 mb-4">Currency conversions are indicative only (source: xe.com)</p>
                </div>

                {/* Section 5 */}
                <div className="mt-6">
                  <p className="text-sm font-bold border-b pb-1 mb-2">5 — Payment Terms</p>
                  {snap.paymentTermsNote ? (
                    <p className="text-sm">{snap.paymentTermsNote}</p>
                  ) : (
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>50% payable upon signing of the engagement agreement.</li>
                      <li>50% payable prior to completion of the engagement.</li>
                      <li>Government, notary, and third-party costs are payable separately and in advance.</li>
                      <li>Payments may be made via bank transfer, cash, card, PayPal, or other agreed method.</li>
                    </ul>
                  )}
                </div>

                {/* Section 6 */}
                <div className="mt-6">
                  <p className="text-sm font-bold border-b pb-1 mb-2">6 — Timeline Overview</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm">
                    {pServiceContent.timeline.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>

                {/* Section 7 */}
                <div className="mt-6">
                  <p className="text-sm font-bold border-b pb-1 mb-2">7 — Next Steps</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm">
                    {pServiceContent.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>

                <div className="mt-10 border-t pt-4 text-center text-xs text-gray-400">
                  DAFKU Law Firm · Tirana &amp; Durrës, Albania · info@dafkulawfirm.al · www.dafkulawfirm.al
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Questions about this proposal?{" "}
                <a href="https://wa.me/355696271692" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-foreground">
                  Contact us on WhatsApp
                </a>
                {" "}(+355 69 62 71 692)
              </p>
            </TabsContent>
          )}

          {/* ── MESSAGES TAB ── */}
          <TabsContent value="messages" className="mt-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              Send a message directly to your lawyer. You can send up to 3 messages in a row before waiting for a reply.
              {linkExpired && " This link has expired — message history is preserved but you cannot send new messages."}
            </p>
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
                href="https://wa.me/355696271692"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted hover:text-foreground"
              >
                +355 69 62 71 692
              </a>
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

