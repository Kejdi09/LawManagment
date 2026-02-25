/**
 * IntakeBotPanel
 * A scripted step-by-step chatbot that collects info needed to generate a proposal.
 *
 * Two modes:
 *  - "portal"  (client-facing): sends a formatted summary to the chat thread when done
 *  - "staff"   (internal): saves directly to the customer record via updateCustomer
 */
import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquare, Phone, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServiceType, SERVICE_LABELS, ProposalFields } from "@/lib/types";
import { updateCustomer } from "@/lib/case-store";
import { useToast } from "@/hooks/use-toast";

const WHATSAPP_NUMBER = "+355 69 62 71 692";
const WHATSAPP_LINK = "https://wa.me/355696271692";

// ── Question definitions ──
interface BotQuestion {
  id: keyof ProposalFields | "clientName" | "done";
  text: string;
  placeholder?: string;
  optional?: boolean;
  hint?: string;
  /** If defined, only show if a certain service is in the services list */
  onlyFor?: ServiceType[];
}

const COMMON_QUESTIONS: BotQuestion[] = [
  {
    id: "nationality",
    text: "What is your nationality? (e.g. German, French, Italian…)",
    placeholder: "e.g. German",
  },
  {
    id: "country",
    text: "What country do you currently live in?",
    placeholder: "e.g. Germany",
  },
  {
    id: "idPassportNumber",
    text: "What is your ID or Passport number? (You can skip this — we'll collect it later.)",
    placeholder: "e.g. AB1234567",
    optional: true,
    hint: "You can type 'skip' to leave this for later.",
  },
];

const REAL_ESTATE_QUESTIONS: BotQuestion[] = [
  {
    id: "propertyDescription",
    text: "Please describe the property you are interested in purchasing.\n(e.g. 'a residential apartment in Tirana' or 'a house and garage in Durrës')",
    placeholder: "e.g. a residential house and garage in Durrës",
    onlyFor: ["real_estate"],
  },
  {
    id: "transactionValueEUR",
    text: "What is the approximate purchase price or investment value in EUR? (Just the number, e.g. 100000)",
    placeholder: "e.g. 100000",
    onlyFor: ["real_estate"],
    hint: "Type a number in EUR, e.g. 85000",
  },
];

const VISA_QUESTIONS: BotQuestion[] = [
  {
    id: "propertyDescription",
    text: "What is the main reason for your stay / relocation to Albania?",
    placeholder: "e.g. employment, self-employment, family, retirement, investment…",
    onlyFor: ["visa_c", "visa_d", "residency_permit"],
  },
];

function buildQuestions(services: ServiceType[]): BotQuestion[] {
  const questions: BotQuestion[] = [...COMMON_QUESTIONS];

  if (services.includes("real_estate")) {
    for (const q of REAL_ESTATE_QUESTIONS) questions.push(q);
  }
  if (services.includes("visa_c") || services.includes("visa_d") || services.includes("residency_permit")) {
    for (const q of VISA_QUESTIONS) {
      // Avoid duplicates if already added
      if (!questions.find((existing) => existing.id === q.id)) questions.push(q);
    }
  }

  return questions;
}

// ── Message types ──
type Sender = "bot" | "user";
interface BotMessage {
  id: number;
  sender: Sender;
  text: string;
}

let _msgId = 0;
const nextId = () => ++_msgId;

function botMsg(text: string): BotMessage {
  return { id: nextId(), sender: "bot", text };
}
function userMsg(text: string): BotMessage {
  return { id: nextId(), sender: "user", text };
}

// ── Props ──
interface IntakeBotPanelProps {
  /** Service types the customer has selected — determines which questions are asked */
  services: ServiceType[];
  /** Client's display name (for greeting) */
  clientName?: string;
  /** "portal" = client fills in themselves; "staff" = lawyer/consultant fills on behalf of client */
  mode: "portal" | "staff";
  /** customerId — required for "staff" mode to persist via API */
  customerId?: string;
  /** Called when the bot has collected all answers (staff mode: after saving; portal mode: after sending summary) */
  onComplete?: (fields: Partial<ProposalFields>) => void;
  /** Portal mode: called with the formatted summary string so the parent can post it as a chat message */
  onSendSummaryMessage?: (text: string) => void;
  /** Fill height of parent container */
  fillHeight?: boolean;
}

export default function IntakeBotPanel({
  services,
  clientName = "Client",
  mode,
  customerId,
  onComplete,
  onSendSummaryMessage,
  fillHeight = false,
}: IntakeBotPanelProps) {
  const { toast } = useToast();
  const questions = buildQuestions(services);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [currentStep, setCurrentStep] = useState(0); // index into questions
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [inputText, setInputText] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const serviceLabelList = (services || []).map((s) => SERVICE_LABELS[s] || s).join(", ");

  // Initial greeting
  useEffect(() => {
    const greeting =
      mode === "portal"
        ? `Hello ${clientName}! 👋 I'm the DAFKU Law Firm intake assistant.\n\nTo help us prepare a personalised proposal for your ${serviceLabelList} service(s), I'll ask you a few quick questions.\n\nYou can type 'skip' to skip any optional question, or type 'help' at any time to reach us on WhatsApp.`
        : `Staff intake mode for: ${clientName}.\n\nServices: ${serviceLabelList}.\n\nPlease answer the following questions to fill in the proposal fields. Type 'skip' to skip optional fields.`;
    setMessages([botMsg(greeting)]);
    // Ask the first question after a short delay
    setTimeout(() => {
      setMessages((prev) => [...prev, botMsg(questions[0]?.text ?? "All done!")]);
    }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [done]);

  function buildProposalFields(rawAnswers: Record<string, string>): Partial<ProposalFields> {
    const fields: Partial<ProposalFields> = {};
    if (rawAnswers.nationality) fields.nationality = rawAnswers.nationality;
    if (rawAnswers.country) fields.country = rawAnswers.country;
    if (rawAnswers.idPassportNumber) fields.idPassportNumber = rawAnswers.idPassportNumber;
    if (rawAnswers.propertyDescription) fields.propertyDescription = rawAnswers.propertyDescription;
    if (rawAnswers.transactionValueEUR) {
      const v = parseFloat(rawAnswers.transactionValueEUR.replace(/[^0-9.]/g, ""));
      if (!isNaN(v)) fields.transactionValueEUR = v;
    }
    return fields;
  }

  function buildSummaryText(rawAnswers: Record<string, string>): string {
    const lines = [`📋 INTAKE SUMMARY — ${clientName}`, `Services: ${serviceLabelList}`, ""];
    for (const q of questions) {
      const answer = rawAnswers[q.id];
      if (answer && answer.toLowerCase() !== "skip") {
        lines.push(`• ${q.text.split("\n")[0].replace(/\?$/, "")}: ${answer}`);
      }
    }
    lines.push("\n✅ Submitted via intake bot. Ready for proposal generation.");
    return lines.join("\n");
  }

  async function finishIntake(rawAnswers: Record<string, string>) {
    setDone(true);
    const fields = buildProposalFields(rawAnswers);

    if (mode === "staff" && customerId) {
      setSaving(true);
      try {
        const updated = await updateCustomer(customerId, { proposalFields: fields as ProposalFields });
        setMessages((prev) => [
          ...prev,
          botMsg("✅ All done! The answers have been saved to the customer record. You can now generate the proposal from the customer detail panel."),
        ]);
        toast({ title: "Intake saved", description: "Proposal fields updated on customer record." });
        onComplete?.(fields);
        void updated; // suppress unused variable warning
      } catch {
        toast({ title: "Save failed", variant: "destructive" });
        setMessages((prev) => [
          ...prev,
          botMsg("⚠️ There was an issue saving the data. Please try the 'Edit Fields' form in the proposal generator."),
        ]);
      } finally {
        setSaving(false);
      }
    } else if (mode === "portal") {
      const summary = buildSummaryText(rawAnswers);
      setMessages((prev) => [
        ...prev,
        botMsg("✅ Thank you! Your answers have been submitted to the DAFKU Law Firm team. We will prepare your personalised proposal and get back to you shortly.\n\nIf you have any questions in the meantime, feel free to message us below or contact us on WhatsApp."),
      ]);
      onSendSummaryMessage?.(summary);
      onComplete?.(fields);
    }
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || done || saving) return;
    setInputText("");

    // Help / WhatsApp trigger
    if (text.toLowerCase() === "help" || text.toLowerCase() === "whatsapp") {
      setMessages((prev) => [
        ...prev,
        userMsg(text),
        botMsg(`For immediate assistance, please contact us on WhatsApp: ${WHATSAPP_NUMBER}\nOr click the button below to open a chat.`),
      ]);
      setShowWhatsApp(true);
      return;
    }

    const currentQ = questions[currentStep];
    if (!currentQ) return;

    const isSkip = text.toLowerCase() === "skip";

    // Validate numeric fields
    if (currentQ.id === "transactionValueEUR" && !isSkip) {
      const v = parseFloat(text.replace(/[^0-9.]/g, ""));
      if (isNaN(v) || v <= 0) {
        setMessages((prev) => [
          ...prev,
          userMsg(text),
          botMsg("Please enter a valid number (e.g. 100000). You can type 'skip' to leave this for later."),
        ]);
        return;
      }
    }

    const savedAnswer = isSkip ? "" : text;
    const newAnswers = { ...answers, [currentQ.id]: savedAnswer };
    setAnswers(newAnswers);
    setMessages((prev) => [...prev, userMsg(text)]);

    const nextStep = currentStep + 1;
    setCurrentStep(nextStep);

    if (nextStep >= questions.length) {
      // All questions answered
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          botMsg("Great, that's all the information I need! Let me save your answers now…"),
        ]);
        setTimeout(() => finishIntake(newAnswers), 800);
      }, 400);
    } else {
      // Ask next question
      setTimeout(() => {
        setMessages((prev) => [...prev, botMsg(questions[nextStep].text)]);
      }, 400);
    }
  }

  const currentQuestion = questions[currentStep];
  const canSend = inputText.trim().length > 0 && !done && !saving;

  return (
    <div
      className={`flex flex-col border rounded-lg overflow-hidden bg-background${fillHeight ? " flex-1" : ""}`}
      style={fillHeight ? undefined : { height: 420 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">
          {mode === "portal" ? "Intake Assistant — DAFKU Law Firm" : "Staff Intake Bot"}
        </span>
        {done && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 ml-auto" />}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-end gap-2 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.sender === "bot" && (
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mb-4">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            <div
              className={`rounded-2xl px-3 py-2 text-sm leading-relaxed max-w-[80%] whitespace-pre-wrap ${
                m.sender === "bot"
                  ? "bg-muted text-foreground rounded-bl-sm"
                  : "bg-primary text-primary-foreground rounded-br-sm"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {/* WhatsApp CTA */}
        {showWhatsApp && (
          <div className="flex justify-center">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-4 py-2 transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              Open WhatsApp Chat
            </a>
          </div>
        )}

        {/* Progress hint while active */}
        {!done && currentQuestion && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-8">
            <AlertTriangle className="h-3 w-3 opacity-40" />
            Question {currentStep + 1} of {questions.length}
            {currentQuestion.optional && " · optional — type 'skip' to continue"}
            {currentQuestion.hint && ` · ${currentQuestion.hint}`}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      {!done ? (
        <div className="border-t px-3 py-2 flex gap-2 shrink-0 bg-background">
          <Input
            ref={inputRef}
            className="flex-1 text-sm h-8"
            placeholder={currentQuestion?.placeholder ?? "Type your answer…"}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) handleSend();
              }
            }}
            disabled={done || saving}
          />
          <Button
            size="sm"
            className="h-8 px-3"
            onClick={handleSend}
            disabled={!canSend}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="border-t px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground bg-muted/20 shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
          Intake complete. You can close this panel.
          {mode === "portal" && (
            <span>
              {" "}·{" "}
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted hover:text-foreground"
              >
                Contact us on WhatsApp
              </a>{" "}
              {WHATSAPP_NUMBER}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Small helper to embed in the portal as a collapsible section */
export function IntakeBotSection({
  services,
  clientName,
  onSendSummaryMessage,
  storageKey,
}: {
  services: ServiceType[];
  clientName?: string;
  onSendSummaryMessage?: (text: string) => void;
  /** localStorage key to persist completion across refreshes (e.g. portal token) */
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const lsKey = storageKey ? `portal_intake_done_${storageKey}` : null;
  const [completed, setCompleted] = useState(() => {
    if (!lsKey) return false;
    try { return localStorage.getItem(lsKey) === "1"; } catch { return false; }
  });

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <Bot className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1">
          Intake Form — Help us prepare your proposal
        </span>
        {completed && (
          <span className="text-xs text-green-600 flex items-center gap-1 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" /> Submitted
          </span>
        )}
        <span className="text-muted-foreground text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t">
          {completed ? (
            <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              Thank you! Your information has been submitted. Our team will prepare your proposal shortly.
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 underline decoration-dotted text-primary hover:text-primary/80"
              >
                WhatsApp us
              </a>
            </div>
          ) : (
            <div className="p-3">
              <IntakeBotPanel
                services={services}
                clientName={clientName}
                mode="portal"
                fillHeight={false}
                onSendSummaryMessage={onSendSummaryMessage}
                onComplete={() => {
                  if (lsKey) { try { localStorage.setItem(lsKey, "1"); } catch {} }
                  setCompleted(true);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
