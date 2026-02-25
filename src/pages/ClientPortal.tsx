import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getPortalData, getPortalChatByToken, sendPortalMessage } from "@/lib/case-store";
import { PortalData, PortalMessage, ServiceType, SERVICE_LABELS } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PortalChatPanel, countTrailingClient } from "@/components/PortalChatPanel";
import { IntakeBotSection } from "@/components/IntakeBotPanel";
import {
  FileText, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  MessageSquare, CalendarClock, StickyNote,
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

const PRIORITY_PORTAL: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200",
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
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
            {c.priority && (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_PORTAL[c.priority] || PRIORITY_PORTAL.medium}`}>
                {c.priority.charAt(0).toUpperCase() + c.priority.slice(1)} priority
              </span>
            )}
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Dafku Law Firm � Case Portal</div>
            <div className="text-xs text-muted-foreground">Read-only view for {data.client.name}</div>
          </div>
          {data.expiresAt && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
              <CalendarClock className="h-3.5 w-3.5" />
              Expires {formatDate(data.expiresAt)}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
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

        {/* Intake bot — shown if the customer is in a proposal-relevant status */}
        {(data.client.status === "SEND_PROPOSAL" || data.client.status === "INTAKE") && (
          <div className="space-y-2">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              📋 Prepare Your Proposal
            </h2>
            <p className="text-xs text-muted-foreground">
              Help us prepare a personalised service proposal by answering a few quick questions below.
            </p>
            <IntakeBotSection
              services={data.client.services || []}
              clientName={data.client.name}
              onSendSummaryMessage={async (text) => {
                if (!token) return;
                try {
                  const msg = await sendPortalMessage(token, text);
                  setChatMessages((prev) => [...prev, msg]);
                } catch {
                  // non-blocking
                }
              }}
            />
          </div>
        )}

        <div className="space-y-2">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Chat with Your Lawyer
          </h2>
          <p className="text-xs text-muted-foreground">
            You can send up to 3 consecutive messages. After that, you must wait for your lawyer to reply.
            {linkExpired && " Your link has expired — message history is shown but new messages are disabled."}
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
          />
        </div>

        <div className="text-center text-xs text-muted-foreground pt-4 border-t">
          This page is read-only and provided for your information. For any questions, contact your lawyer directly.
        </div>
      </main>
    </div>
  );
}
