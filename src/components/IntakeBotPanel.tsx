/**
 * IntakeBotPanel
 * A scripted step-by-step chatbot that collects info needed to generate a proposal.
 *
 * Two modes:
 *  - "portal"  (client-facing): sends a formatted summary to the chat thread when done
 *  - "staff"   (internal): saves directly to the customer record via updateCustomer
 */
import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquare, Phone, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServiceType, SERVICE_LABELS, ProposalFields } from "@/lib/types";
import { updateCustomer } from "@/lib/case-store";
import { useToast } from "@/hooks/use-toast";

const WHATSAPP_NUMBER = "+355 69 69 52 989";
const WHATSAPP_LINK = "https://wa.me/355696952989";

// ── Shared validators ──
const isEmailLike = (v: string) => /[@]/.test(v);
const hasDigit = (v: string) => /\d/.test(v);
const hasLetter = (v: string) => /[a-zA-Z]/.test(v);

function validateName(label: string) {
  return (v: string): string | null => {
    if (isEmailLike(v)) return `Please enter your ${label}, not an email address.`;
    if (hasDigit(v)) return `${label} should only contain letters — no numbers please.`;
    if (v.trim().length < 2) return `Please enter a valid ${label} (at least 2 characters).`;
    return null;
  };
}

function validateText(label: string, minLen = 3) {
  return (v: string): string | null => {
    if (isEmailLike(v)) return `Please describe your ${label} — not an email address.`;
    if (v.trim().length < minLen) return `Please provide a more complete answer for: ${label} (at least ${minLen} characters).`;
    return null;
  };
}

function validateId(v: string): string | null {
  if (isEmailLike(v)) return 'Please enter your ID or passport number — not an email address.';
  if (v.trim().length < 4) return 'That does not look like a valid ID/passport number. It should be at least 4 characters long.';
  if (!hasLetter(v) && v.trim().length < 5) return 'Passport numbers typically contain both letters and numbers (e.g. AB1234567).';
  if (/[^a-zA-Z0-9\-\s]/.test(v)) return 'ID/passport numbers should only contain letters, numbers, and hyphens.';
  return null;
}

// ── Question definitions ──
interface BotQuestion {
  id: keyof ProposalFields | "clientName" | "done";
  text: string;
  placeholder?: string;
  optional?: boolean;
  hint?: string;
  /** Numeric fields get parsed to number in buildProposalFields */
  isNumeric?: boolean;
  /** Minimum integer value for numeric fields (default 0) */
  minValue?: number;
  /** Optional field-level validator — returns error string or null */
  validate?: (val: string) => string | null;
  /** If defined, only show if a certain service is in the services list */
  onlyFor?: ServiceType[];
}

// Common to every service
const COMMON_QUESTIONS: BotQuestion[] = [
  {
    id: "nationality",
    text: "What is your nationality?",
    placeholder: "e.g. Italian, German, Albanian",
    validate: validateName("nationality"),
  },
  {
    id: "country",
    text: "What country do you currently reside in?",
    placeholder: "e.g. Germany, Italy, Albania",
    validate: validateName("country"),
  },
  {
    id: "idPassportNumber",
    text: "What is your ID or passport number?",
    placeholder: "e.g. AB1234567",
    optional: true,
    hint: 'Optional — type "skip" if you prefer to provide this later.',
    validate: validateId,
  },
];

// Real estate
const REAL_ESTATE_QUESTIONS: BotQuestion[] = [
  {
    id: "propertyDescription",
    text: "Please describe the property involved in this transaction.\nInclude the type (e.g. apartment, house, commercial unit), its intended use, and the approximate location.",
    placeholder: "e.g. Residential apartment in Tirana, Blloku area",
    onlyFor: ["real_estate"],
    validate: validateText("property description", 8),
  },
  {
    id: "transactionValueEUR",
    text: "What is the approximate transaction / investment value in EUR? Please enter a number only.",
    placeholder: "e.g. 95000",
    onlyFor: ["real_estate"],
    isNumeric: true,
    minValue: 1,
    hint: 'Enter the value in EUR as a number, e.g. 95000. Type "skip" if unknown.',
  },
];

// Visa C / Visa D
const VISA_QUESTIONS: BotQuestion[] = [
  {
    id: "purposeOfStay",
    text: "What is the primary purpose of your visit to Albania?\n(e.g. tourism, business meeting, family visit, event attendance)",
    placeholder: "e.g. Business meetings with Albanian partners",
    onlyFor: ["visa_c", "visa_d"],
  },
  {
    id: "numberOfApplicants",
    text: "How many people will be applying? (Including yourself.)",
    placeholder: "e.g. 1",
    onlyFor: ["visa_c", "visa_d"],
    isNumeric: true,
    hint: "Enter a number, e.g. 1 or 3.",
  },
  {
    id: "previousRefusals",
    text: "Have you or any co-applicants previously had a visa or permit application refused?\nIf yes, please briefly describe when and for what country.",
    placeholder: 'e.g. "None" or "Schengen visa refused in 2022, Germany"',
    optional: true,
    onlyFor: ["visa_c", "visa_d"],
    hint: 'Type "none" or "skip" if there are no previous refusals.',
  },
];

// Residency permit
const RESIDENCY_QUESTIONS: BotQuestion[] = [
  {
    id: "purposeOfStay",
    text: "What is the primary reason for relocating to / residing in Albania?\n(e.g. employment, self-employment, property ownership, retirement, family reunification, investment)",
    placeholder: "e.g. Self-employment and property ownership",
    onlyFor: ["residency_permit"],
  },
  {
    id: "employmentType",
    text: "What is your current employment / income status?",
    placeholder: "e.g. Employed, Self-employed, Freelancer, Retired, Investor, Student",
    onlyFor: ["residency_permit"],
  },
  {
    id: "numberOfApplicants",
    text: "How many people will be applying for a residence permit? (Including yourself.)",
    placeholder: "e.g. 1",
    onlyFor: ["residency_permit"],
    isNumeric: true,
    hint: "Enter a number, e.g. 1 or 4.",
  },
  {
    id: "numberOfFamilyMembers",
    text: "Of those, how many are family members / dependants? (Enter 0 if none.)",
    placeholder: "e.g. 0",
    onlyFor: ["residency_permit"],
    isNumeric: true,
    hint: "Enter 0 if you are the only applicant.",
  },
  {
    id: "previousRefusals",
    text: "Have you or any co-applicants previously had a residence permit or visa application refused?\nIf yes, please briefly describe.",
    placeholder: 'e.g. "None" or "Residence permit refused in 2021"',
    optional: true,
    onlyFor: ["residency_permit"],
    hint: 'Type "none" or "skip" if there are no previous refusals.',
  },
];

// Company formation
const COMPANY_FORMATION_QUESTIONS: BotQuestion[] = [
  {
    id: "companyType",
    text: "What type of legal entity would you like to establish?\n(e.g. SH.P.K. — limited liability, SH.A. — joint stock, branch of a foreign company, representative office)",
    placeholder: "e.g. SH.P.K. (limited liability company)",
    onlyFor: ["company_formation"],
    hint: 'Most small/medium businesses choose SH.P.K. Type "unsure" if you need advice.',
    validate: (v) => {
      if (isEmailLike(v)) return 'Please enter a company type — not an email address.';
      if (v.trim().length < 2) return 'Please enter the type of legal entity (e.g. SH.P.K., SH.A., Branch).';
      return null;
    },
  },
  {
    id: "businessActivity",
    text: "What is the primary business activity or purpose of the company?\n(Please be as specific as possible.)",
    placeholder: "e.g. Import and wholesale distribution of construction materials",
    onlyFor: ["company_formation"],
    validate: validateText("business activity", 6),
  },
  {
    id: "numberOfShareholders",
    text: "How many shareholders will the company have?",
    placeholder: "e.g. 1",
    onlyFor: ["company_formation"],
    isNumeric: true,
    minValue: 1,
    hint: "Enter a number, e.g. 1 or 3.",
  },
  {
    id: "shareCapitalALL",
    text: "What is the proposed registered share capital in ALL (Albanian Lek)?\nThe legal minimum for a SH.P.K. is 100 ALL.",
    placeholder: "e.g. 100",
    onlyFor: ["company_formation"],
    isNumeric: true,
    minValue: 0,
    hint: 'Enter a number in ALL, e.g. 100 or 1000000. Type "skip" if undecided.',
    optional: true,
  },
];

// Tax consulting / Compliance
const TAX_COMPLIANCE_QUESTIONS: BotQuestion[] = [
  {
    id: "situationDescription",
    text: "Please briefly describe your situation and what you need assistance with.\n(e.g. tax registration, annual filing, VAT compliance, transfer pricing, financial audit support)",
    placeholder: "e.g. I need to register for VAT and set up monthly reporting for my new Albanian company",
    onlyFor: ["tax_consulting", "compliance"],
    validate: validateText("situation description", 10),
  },
  {
    id: "employmentType",
    text: "Are you acting as an individual, or on behalf of a company?",
    placeholder: "e.g. Individual, Company — SH.P.K., Foreign company with Albanian branch",
    onlyFor: ["tax_consulting", "compliance"],
    validate: (v) => {
      if (isEmailLike(v)) return 'Please describe whether you are an individual or a company — not an email address.';
      if (v.trim().length < 3) return 'Please specify: Individual, Company, or describe your entity type.';
      return null;
    },
  },
];

function buildQuestions(services: ServiceType[]): BotQuestion[] {
  const questions: BotQuestion[] = [...COMMON_QUESTIONS];
  const added = new Set<string>(COMMON_QUESTIONS.map((q) => String(q.id)));

  function push(arr: BotQuestion[]) {
    for (const q of arr) {
      if (!added.has(String(q.id))) {
        questions.push(q);
        added.add(String(q.id));
      }
    }
  }

  if (services.includes("real_estate")) push(REAL_ESTATE_QUESTIONS);
  if (services.includes("visa_c") || services.includes("visa_d")) push(VISA_QUESTIONS);
  if (services.includes("residency_permit")) push(RESIDENCY_QUESTIONS);
  if (services.includes("company_formation")) push(COMPANY_FORMATION_QUESTIONS);
  if (services.includes("tax_consulting") || services.includes("compliance")) push(TAX_COMPLIANCE_QUESTIONS);

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
        ? `Good day, ${clientName}. Welcome to the DAFKU Law Firm client intake process.\n\nTo prepare a tailored proposal for your ${serviceLabelList} service(s), we will guide you through a brief set of questions. This should only take a few minutes.\n\nPlease answer each question as accurately as possible. You may type "skip" to pass any optional question, or type "help" to reach our team directly on WhatsApp.`
        : `Staff intake — ${clientName}\nServices: ${serviceLabelList}\n\nPlease answer each question to complete the proposal fields. Type "skip" to omit optional fields.`;
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

    // Helper: parse a user answer to a positive number, or undefined
    const toNum = (v: string | undefined): number | undefined => {
      if (!v) return undefined;
      const n = parseFloat(v.replace(/[^0-9.]/g, ""));
      return isNaN(n) ? undefined : n;
    };
    // Helper: set a string field if non-empty and not a skip signal
    const setStr = (key: keyof ProposalFields, val: string | undefined) => {
      if (val && !/^(skip|none|-)$/i.test(val.trim())) {
        (fields as Record<string, unknown>)[key] = val;
      }
    };

    // Common
    setStr("nationality", rawAnswers.nationality);
    setStr("country", rawAnswers.country);
    setStr("idPassportNumber", rawAnswers.idPassportNumber);

    // Real estate
    setStr("propertyDescription", rawAnswers.propertyDescription);
    const txv = toNum(rawAnswers.transactionValueEUR);
    if (txv !== undefined) fields.transactionValueEUR = txv;

    // Visa / Residency
    setStr("purposeOfStay", rawAnswers.purposeOfStay);
    setStr("employmentType", rawAnswers.employmentType);
    setStr("previousRefusals", rawAnswers.previousRefusals);
    const nApplicants = toNum(rawAnswers.numberOfApplicants);
    if (nApplicants !== undefined) fields.numberOfApplicants = nApplicants;
    const nFamily = toNum(rawAnswers.numberOfFamilyMembers);
    if (nFamily !== undefined) fields.numberOfFamilyMembers = nFamily;

    // Company formation
    setStr("companyType", rawAnswers.companyType);
    setStr("businessActivity", rawAnswers.businessActivity);
    const nShareholders = toNum(rawAnswers.numberOfShareholders);
    if (nShareholders !== undefined) fields.numberOfShareholders = nShareholders;
    const capital = toNum(rawAnswers.shareCapitalALL);
    if (capital !== undefined) fields.shareCapitalALL = capital;

    // Tax / Compliance
    setStr("situationDescription", rawAnswers.situationDescription);

    return fields;
  }

  function buildSummaryText(rawAnswers: Record<string, string>): string {
    const lines = [`INTAKE SUMMARY — ${clientName}`, `Services: ${serviceLabelList}`, ""];
    for (const q of questions) {
      const answer = rawAnswers[q.id];
      if (answer && answer.toLowerCase() !== "skip") {
        lines.push(`- ${q.text.split("\n")[0].replace(/\?$/, "")}: ${answer}`);
      }
    }
    lines.push("\nSubmitted via intake form. Ready for proposal preparation.");
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
          botMsg("All done. The answers have been saved to the client record. You may now generate the proposal from the customer detail panel."),
        ]);
        toast({ title: "Intake saved", description: "Proposal fields updated on customer record." });
        onComplete?.(fields);
        void updated; // suppress unused variable warning
      } catch {
        toast({ title: "Save failed", variant: "destructive" });
        setMessages((prev) => [
          ...prev,
          botMsg("There was an issue saving the data. Please use the \"Edit Fields\" form in the proposal generator to enter the information manually."),
        ]);
      } finally {
        setSaving(false);
      }
    } else if (mode === "portal") {
      const summary = buildSummaryText(rawAnswers);
      setMessages((prev) => [
        ...prev,
        botMsg(`Thank you, ${clientName}. Your information has been submitted to the DAFKU Law Firm team.\n\nWe will review your answers and prepare a personalised proposal for you. You can expect to hear from us shortly.\n\nIf you have any immediate questions, please use the Messages tab or contact us directly on WhatsApp.`),
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
        botMsg(`For immediate assistance, please contact us directly on WhatsApp: ${WHATSAPP_NUMBER}\n\nA member of our team will be happy to help you.`),
      ]);
      setShowWhatsApp(true);
      return;
    }

    const currentQ = questions[currentStep];
    if (!currentQ) return;

    const isSkip = text.toLowerCase() === "skip";

    // Validate numeric fields
    if (currentQ.isNumeric && !isSkip) {
      const v = parseFloat(text.replace(/[^0-9.]/g, ""));
      const min = currentQ.minValue ?? 0;
      if (isNaN(v) || v < min) {
        setMessages((prev) => [
          ...prev,
          userMsg(text),
          botMsg(
            `Please enter a valid number${
              min > 0 ? ` (minimum: ${min})` : ""
            } — e.g. ${currentQ.placeholder ?? "1"}. Type "skip" if you prefer to provide this information later.`
          ),
        ]);
        return;
      }
    }

    // Run field-level validator (for non-numeric, non-skip answers)
    if (!isSkip && !currentQ.isNumeric && currentQ.validate) {
      const err = currentQ.validate(text);
      if (err) {
        setMessages((prev) => [
          ...prev,
          userMsg(text),
          botMsg(err),
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
          botMsg("Thank you. That is all the information we need. Please allow a moment while we process your answers."),
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
          {mode === "portal" ? "Client Intake — DAFKU Law Firm" : "Staff Intake Form"}
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
            <span>Step {currentStep + 1} of {questions.length}</span>
            {currentQuestion.optional && <span className="opacity-70">· optional</span>}
            {currentQuestion.hint && <span className="opacity-70">· {currentQuestion.hint}</span>}
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
          Intake complete.
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
  onComplete,
  forceReset,
}: {
  services: ServiceType[];
  clientName?: string;
  onSendSummaryMessage?: (text: string) => void;
  /** localStorage key to persist completion across refreshes (e.g. portal token) */
  storageKey?: string;
  /** Called when intake is finished, receives the collected proposal fields */
  onComplete?: (fields: Partial<ProposalFields>) => void;
  /** When true, clears any stored completion and restarts the bot */
  forceReset?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lsKey = storageKey ? `portal_intake_done_${storageKey}` : null;
  const [completed, setCompleted] = useState(() => {
    if (!lsKey) return false;
    try { return localStorage.getItem(lsKey) === "1"; } catch { return false; }
  });

  // When staff triggers a reset, clear local storage and restart the bot
  useEffect(() => {
    if (forceReset && lsKey) {
      try { localStorage.removeItem(lsKey); } catch {}
      setCompleted(false);
    }
  }, [forceReset, lsKey]);

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
              Your information has been submitted. Our team will prepare your proposal and be in touch shortly.
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 underline decoration-dotted text-primary hover:text-primary/80"
              >
                Contact us on WhatsApp
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
                onComplete={(fields) => {
                  if (lsKey) { try { localStorage.setItem(lsKey, "1"); } catch {} }
                  setCompleted(true);
                  onComplete?.(fields);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
