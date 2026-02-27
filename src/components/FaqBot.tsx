/**
 * FaqBot — Client Portal FAQ chatbot
 * Responds instantly to common questions about services, pricing, timelines etc.
 * Responses are mock for now — replace FAQS with real content when ready.
 */

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface FaqEntry {
  keywords: string[];
  question: string; // short-form of the question shown as a suggestion chip
  answer: string;
}

// ── FAQ database ─────────────────────────────────────────────────────────
// Replace these answers with your real content when ready.
const FAQS: FaqEntry[] = [
  {
    keywords: ["cost", "price", "fee", "how much", "charge", "payment", "pay"],
    question: "What does it cost?",
    answer:
      "Our fees vary depending on the service. As a general guide:\n\n• Residency Permit (Pensioner): fixed fee per applicant — included in your proposal.\n• Type D Visa & Residency Permit (Employment): fixed fee covering both procedures — see your proposal.\n• Company Formation + Visa/RP: fixed fee covering registration and immigration — see your proposal.\n• Real Estate: Phase 1 fixed legal fee + Phase 2 monthly retainer of €50/month for post-acquisition monitoring.\n\nAll fees are confirmed in your personalised proposal once we receive your intake information. Government fees, notary fees, and third-party costs are always separate.",
  },
  {
    keywords: ["how long", "timeline", "duration", "time", "processing", "wait", "weeks", "days", "months"],
    question: "How long does it take?",
    answer:
      "Processing times depend on the service:\n\n• Residency Permit (Pensioner): document preparation 3–5 days → provisional permit 10–15 days → final decision 30–45 days → card issue ~2 weeks.\n• Type D Visa + Residency Permit: documents 3–5 days → visa 15–30 days → residency permit 30–45 days → card ~2 weeks.\n• Company Formation: registration 3–5 days → visa 15–30 days → residency 30–45 days.\n• Real Estate: due diligence 5–10 days → preliminary agreement within 5 days → final notarial act at project completion.\n\nThese are estimates — public authorities may vary.",
  },
  {
    keywords: ["document", "docs", "need", "bring", "require", "passport", "photo"],
    question: "What documents do I need?",
    answer:
      "The documents required depend on your specific service. Full lists are included in your proposal. In general you will need:\n\n• Valid passport (with at least 2 blank pages and valid for 3+ months beyond the permit period)\n• Passport-size photograph (47×36mm, white background, neutral expression, taken within last 6 months)\n• Proof of accommodation in Albania\n• Criminal record from your home country (apostilled, translated, notarised — we arrange this)\n• Service-specific documents (income proof for pensioners; employment contract for employees; company documents for self-employed; property documents for real estate)\n\nWe will guide you step by step through exactly what is needed once your case starts.",
  },
  {
    keywords: ["residency permit", "residence permit", "pensioner", "pension", "retire", "retired"],
    question: "How does the Residency Permit for Pensioners work?",
    answer:
      "Albania offers a Residency Permit category specifically for foreign pensioners. To qualify, you need to:\n\n• Prove a pension income of at least 1,200,000 ALL per year (~€11,000)\n• Provide proof of accommodation in Albania\n• Have valid health insurance in Albania\n• Submit a clean criminal record from your home country\n\nWe handle the entire process — from document collection to appointment scheduling, submission, follow-up, and biometric card collection. If your spouse/partner is joining you, we also manage their Family Reunification application.",
  },
  {
    keywords: ["visa d", "type d", "visa", "employee", "employment", "work", "job", "staff"],
    question: "What is a Type D Visa?",
    answer:
      "A Type D Visa is a long-stay national visa that allows you to enter Albania for the purpose of taking up employment. It is the first step before you can apply for a Residency Permit.\n\nOnce the visa is approved and you enter Albania, your Residency Permit application starts automatically. You can legally start working at the company from the moment your visa is issued — even while the residency permit is still being processed.\n\nWe prepare all the documents, submit the visa application, and accompany the full process through to your biometric residency card.",
  },
  {
    keywords: ["company", "formation", "register", "business", "self-employ", "sh.p.k", "nipt", "nuis", "qkb"],
    question: "How do I register a company in Albania?",
    answer:
      "Company registration in Albania is handled through the National Business Center (QKB) and typically takes 3–5 business days. The main steps are:\n\n1. Issuing Power of Attorney\n2. Preparing registration documents (Founding Act, Statute)\n3. Submitting to QKB\n4. Obtaining TAX ID (NIPT) and registration certificate\n\nAfter registration, if you need to relocate to Albania, we process your Type D Visa and Residency Permit as a Self-Employed/Business Owner.\n\nOngoing management costs (accounting, legal, virtual office) are approximately 15,000 ALL/month.",
  },
  {
    keywords: ["real estate", "property", "buy", "purchase", "apartment", "villa", "land", "investment"],
    question: "What legal help do you offer for real estate?",
    answer:
      "We provide full legal cover for property purchases in Albania, including:\n\n• Due diligence and title verification (we check ownership history, encumbrances, permits)\n• Drafting/reviewing the Preliminary and Final Sale-Purchase Agreement\n• Coordinating with the notary and ZRPP (property registry) for the title transfer\n• Payment coordination and escrow advice\n• Post-acquisition monitoring for off-plan projects (€50/month retainer)\n\nFor off-plan properties, we continue to monitor the developer's obligations until project completion and final title transfer.",
  },
  {
    keywords: ["contact", "phone", "whatsapp", "email", "reach", "call", "speak"],
    question: "How can I contact you?",
    answer:
      "You can reach us through any of the following channels:\n\n📞 Phone / WhatsApp: +355 69 69 52 989\n✉️ Email: info@relocatetoalbania.com / info@dafkulawfirm.al\n🌐 Website: www.dafkulawfirm.al | www.relocatetoalbania.com\n\n🏢 Office in Tirana: Gjergj Fishta Blvd, F.G.P Bld., Ent. nr. 2, Office 5, 1001, Tirana\n🏢 Office in Durrës: Rruga Aleksandër Goga, Lagja 11, 2001, Durrës\n\nYou can also use the Messages tab in this portal to send us a direct message — your lawyer will respond as soon as possible.",
  },
  {
    keywords: ["albania", "why", "benefit", "advantage", "tax", "good", "move"],
    question: "Why relocate to Albania?",
    answer:
      "Albania offers a range of benefits for international residents and investors:\n\n• Low corporate income tax (15%) and flat income tax rates\n• Low cost of living compared to Western Europe\n• EU candidate country with growing foreign investment\n• Straightforward residency paths for pensioners, employees, and business owners\n• Beautiful coastline, mountains, and warm Mediterranean climate\n• Friendly, English-speaking environment in major cities\n\nOur team specialises exclusively in immigration, real estate, and company formation in Albania — we know the system inside out.",
  },
  {
    keywords: ["proposal", "when", "ready", "sent", "receive", "prepare"],
    question: "When will my proposal be ready?",
    answer:
      "Once you complete the Intake Form (the 'Intake Form' tab), our team prepares your personalised proposal typically within 1–2 business days. You will receive a notification in this portal when it is ready to review.\n\nIf you have already completed the intake form, please check the Proposal tab — it may already be available. If you have questions or need the proposal urgently, please use the Messages tab to contact your lawyer directly.",
  },
];

const FALLBACK =
  "Thank you for your message! I'm able to answer common questions — try asking about fees, timelines, required documents, the Type D Visa, company formation, or how to contact us.\n\nFor anything specific to your case, please use the Messages tab to speak directly with your lawyer.";

function matchFaq(input: string): FaqEntry | null {
  const lower = input.toLowerCase();
  let best: FaqEntry | null = null;
  let bestScore = 0;
  for (const faq of FAQS) {
    const score = faq.keywords.filter((k) => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = faq;
    }
  }
  return bestScore > 0 ? best : null;
}

// ── message types ──────────────────────────────────────────────────────────
interface ChatMsg {
  id: number;
  role: "user" | "bot";
  text: string;
}

let idSeq = 0;
function nextId() { return ++idSeq; }

const WELCOME =
  "Hi there 👋 I'm the DAFKU virtual assistant. I can answer common questions about our services, fees, timelines, and more.\n\nSelect a topic below or type your question:";

// ── component ──────────────────────────────────────────────────────────────
export default function FaqBot() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: nextId(), role: "bot", text: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, thinking]);

  function addBotReply(text: string) {
    setThinking(true);
    setTimeout(() => {
      setMessages((prev) => [...prev, { id: nextId(), role: "bot", text }]);
      setThinking(false);
    }, 700);
  }

  function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);
    setInput("");
    const match = matchFaq(trimmed);
    addBotReply(match ? match.answer : FALLBACK);
  }

  function handleChip(faq: FaqEntry) {
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text: faq.question }]);
    addBotReply(faq.answer);
  }

  // Only show chips if the last message is bot (not user)
  const showChips = messages[messages.length - 1]?.role === "bot" && !thinking;

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-background" style={{ height: 460 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold leading-tight">DAFKU Virtual Assistant</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Instant answers · 24/7</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "bot" && (
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mb-4">
                <Bot className="h-3 w-3 text-primary" />
              </div>
            )}
            <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed max-w-[80%] whitespace-pre-line ${
              m.role === "bot"
                ? "bg-muted text-foreground rounded-bl-sm"
                : "bg-primary text-primary-foreground rounded-br-sm"
            }`}>
              {m.text}
            </div>
            {m.role === "user" && (
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mb-4">
                <User className="h-3 w-3 text-primary" />
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="flex items-end gap-2 justify-start">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mb-4">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
              <span className="flex gap-1 items-center h-4">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}

        {/* Suggestion chips */}
        {showChips && (
          <div className="flex flex-wrap gap-1.5 pl-8 pt-1">
            {FAQS.slice(0, 5).map((faq) => (
              <button
                key={faq.question}
                type="button"
                onClick={() => handleChip(faq)}
                className="rounded-full border bg-background hover:bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {faq.question}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-2 flex gap-2 shrink-0">
        <Textarea
          className="resize-none text-sm flex-1 min-h-[40px] max-h-20"
          placeholder="Ask a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(input);
            }
          }}
        />
        <Button
          size="sm"
          className="self-end h-10 px-3"
          disabled={!input.trim() || thinking}
          onClick={() => handleSend(input)}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-3 pb-2 text-[10px] text-muted-foreground text-center">
        For case-specific questions, use the <strong>Messages</strong> tab to speak with your lawyer directly.
      </div>
    </div>
  );
}

export { MessageSquare };
