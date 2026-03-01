import { useState } from "react";
import { submitRegistration, sendVerifyCode } from "@/lib/case-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const SERVICES: { value: string; label: string }[] = [
  { value: "residency_pensioner", label: "Residency Permit – Pensioner" },
  { value: "visa_d", label: "Type D Visa & Residence Permit" },
  { value: "company_formation", label: "Company Formation" },
  { value: "real_estate", label: "Real Estate Investment" },
];

const CLIENT_TYPES = [
  { value: "Individual", label: "Individual" },
  { value: "Family", label: "Family" },
  { value: "Company", label: "Company" },
] as const;

const SS_KEY = 'dafku_verify_email';

export default function RegisterPage() {
  const persistedEmail = sessionStorage.getItem(SS_KEY) || '';
  const [form, setForm] = useState({
    name: "",
    email: persistedEmail,
    phone: "",
    nationality: "",
    country: "",
    clientType: "Individual" as "Individual" | "Family" | "Company",
    message: "",
    services: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Email verification state — restored from sessionStorage so a page refresh keeps the code input visible
  const [codeSent, setCodeSent] = useState(!!persistedEmail);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeSentTo, setCodeSentTo] = useState(persistedEmail);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim());
  const emailChanged = form.email.trim().toLowerCase() !== codeSentTo.toLowerCase();

  async function handleSendCode() {
    setCodeError(null);
    setSendingCode(true);
    try {
      await sendVerifyCode(form.email.trim());
      const sentTo = form.email.trim();
      setCodeSentTo(sentTo);
      setCodeSent(true);
      setCodeInput("");
      sessionStorage.setItem(SS_KEY, sentTo);
    } catch (err: unknown) {
      setCodeError(err instanceof Error ? err.message : "Failed to send code.");
    } finally {
      setSendingCode(false);
    }
  }

  function toggleService(value: string) {
    setForm(f => ({
      ...f,
      services: f.services.includes(value)
        ? f.services.filter(s => s !== value)
        : [...f.services, value],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError("Please enter your full name."); return; }
    if (!form.email.trim()) { setError("Please enter your email address."); return; }
    if (!form.phone.trim()) { setError("Please enter your phone / WhatsApp number."); return; }
    if (!form.nationality.trim()) { setError("Please enter your nationality."); return; }
    if (!form.country.trim()) { setError("Please enter your country of residence."); return; }
    if (form.services.length === 0) { setError("Please select at least one service you are interested in."); return; }
    if (!codeInput.trim()) { setError("Please enter the verification code sent to your email."); return; }
    setLoading(true);
    try {
      await submitRegistration({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        nationality: form.nationality.trim() || undefined,
        country: form.country.trim() || undefined,
        clientType: form.clientType,
        services: form.services,
        message: form.message.trim() || undefined,
        verifyCode: codeInput.trim(),
      });
      sessionStorage.removeItem(SS_KEY);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Enquiry Received</h1>
            <p className="mt-2 text-muted-foreground">
              Thank you for reaching out. We have received your enquiry and will be in touch within 1–2 business days.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Check your email for a confirmation and your personal customer portal link.
            </p>
          </div>
          <div className="bg-muted/40 border rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Need immediate assistance?</p>
            <a
              href="https://wa.me/355696952989"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-green-500 hover:underline font-medium"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp: +355 69 69 52 989
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm px-4 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">D</div>
          <div>
            <div className="font-semibold text-sm leading-tight">DAFKU Law Firm</div>
            <div className="text-xs text-muted-foreground">Client Intake Form</div>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-8">
        <div className="space-y-2 mb-8">
          <h1 className="text-2xl font-bold text-foreground">Get in Touch</h1>
          <p className="text-muted-foreground text-sm">
            Fill in the form below and our team will review your enquiry and get back to you within 1–2 business days.
            You will receive a confirmation email with your personal customer portal link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="reg-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. John Smith"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">
                Email Address <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="reg-email"
                  type="email"
                  value={form.email}
                  onChange={e => {
                    setForm(f => ({ ...f, email: e.target.value }));
                    setCodeError(null);
                  }}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!emailValid || sendingCode || loading}
                  onClick={handleSendCode}
                  className="shrink-0 text-xs px-3"
                >
                  {sendingCode ? "Sending…" : codeSent && !emailChanged ? "Resend" : "Send Code"}
                </Button>
              </div>
              {codeError && (
                <p className="text-xs text-destructive">{codeError}</p>
              )}
              {codeSent && !emailChanged && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="reg-code" className="text-xs text-muted-foreground">
                    Enter the 6-digit code sent to <span className="font-medium text-foreground">{codeSentTo}</span>
                  </Label>
                  <Input
                    id="reg-code"
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    inputMode="numeric"
                    disabled={loading}
                    className="font-mono tracking-widest text-center text-lg w-36"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-phone">Phone / WhatsApp <span className="text-destructive">*</span></Label>
              <Input
                id="reg-phone"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+1 555 000 0000"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-nationality">Nationality <span className="text-destructive">*</span></Label>
              <Input
                id="reg-nationality"
                value={form.nationality}
                onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
                placeholder="e.g. American"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-country">Country of Residence <span className="text-destructive">*</span></Label>
              <Input
                id="reg-country"
                value={form.country}
                onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                placeholder="e.g. Portugal"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client Type</Label>
              <div className="flex gap-2">
                {CLIENT_TYPES.map(ct => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, clientType: ct.value }))}
                    disabled={loading}
                    className={`flex-1 rounded-md border py-2 text-sm transition-colors ${
                      form.clientType === ct.value
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Services Interested In <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SERVICES.map(svc => (
                <label
                  key={svc.value}
                  className="flex items-center gap-2.5 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={form.services.includes(svc.value)}
                    onCheckedChange={() => toggleService(svc.value)}
                    disabled={loading}
                  />
                  <span className="text-sm">{svc.label}</span>
                </label>
              ))}
            </div>
            {form.services.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {form.services.map(s => (
                  <Badge key={s} variant="secondary" className="text-xs">
                    {SERVICES.find(sv => sv.value === s)?.label ?? s}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-message">Message / Additional Details</Label>
            <Textarea
              id="reg-message"
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Briefly describe your situation or what help you need..."
              rows={4}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || !codeSent || codeInput.length < 6}>
            {loading ? "Submitting…" : "Submit Enquiry"}
          </Button>
          {!codeSent && (
            <p className="text-xs text-muted-foreground text-center">
              You must verify your email address before submitting.
            </p>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Your information is kept strictly confidential and used only to process your enquiry.
          </p>
        </form>
      </main>
    </div>
  );
}
