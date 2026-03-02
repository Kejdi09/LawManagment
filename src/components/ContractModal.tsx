/**
 * ContractModal
 * Opens when staff clicks "Generate Contract" on a SEND_CONTRACT customer.
 * Two tabs: Edit (fee review/adjust) and Preview (rendered contract + print).
 * On "Send Contract" → saves contractSentAt + contractSnapshot + status WAITING_ACCEPTANCE.
 */
import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send, FileText } from "lucide-react";
import { Customer, ProposalFields, SERVICE_LABELS, ServiceType } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { updateCustomer } from "@/lib/case-store";
import { useToast } from "@/hooks/use-toast";
import ProposalRenderer from "@/components/ProposalRenderer";
import ContractRenderer from "@/components/ContractRenderer";
import { EUR_RATE, USD_RATE, GBP_RATE, fmt, computePresetFees } from "@/components/ProposalModal";

// ── Main component ──
interface ContractModalProps {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (updated: Customer) => void;
  onSent?: (updated: Customer) => void;
  readOnly?: boolean;
}

export default function ContractModal({ customer, open, onOpenChange, onSaved, onSent, readOnly }: ContractModalProps) {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const svcs = (customer.services || []) as ServiceType[];

  // Pre-fill from contractSnapshot → proposalSnapshot → proposalFields → defaults
  const source = customer.contractSnapshot || customer.proposalSnapshot || customer.proposalFields;

  const initFields = (): ProposalFields => {
    const defaultTitle = (() => {
      if (source?.proposalTitle) return source.proposalTitle;
      if (svcs.includes("residency_pensioner")) return "Service Contract — Residence Permit for Pensioner";
      if (svcs.includes("company_formation")) return "Service Contract — Company Registration and Management";
      if (svcs.includes("visa_d")) return "Service Contract — Type D Visa & Residence Permit";
      return `Service Contract — ${svcs.map((s) => SERVICE_LABELS[s] || s).join(", ")}`;
    })();
    const hasCustomFees = (source?.serviceFeeALL ?? 0) > 0;
    const presets = hasCustomFees ? {} as ReturnType<typeof computePresetFees> : computePresetFees(svcs);
    return {
      proposalTitle: defaultTitle,
      proposalDate: source?.proposalDate || today,
      propertyDescription: source?.propertyDescription || "",
      transactionValueEUR: source?.transactionValueEUR ?? undefined,
      consultationFeeALL: source?.consultationFeeALL ?? presets.consultationFeeALL ?? 0,
      serviceFeeALL: source?.serviceFeeALL ?? presets.serviceFeeALL ?? 0,
      serviceFeePct: source?.serviceFeePct ?? undefined,
      poaFeeALL: source?.poaFeeALL ?? presets.poaFeeALL ?? 0,
      translationFeeALL: source?.translationFeeALL ?? presets.translationFeeALL ?? 0,
      otherFeesALL: source?.otherFeesALL ?? 0,
      additionalCostsNote: source?.additionalCostsNote || "",
      paymentTermsNote: source?.paymentTermsNote || "",
      nationality: source?.nationality || customer.nationality || "",
      country: source?.country || customer.country || "",
      idPassportNumber: source?.idPassportNumber || "",
      purposeOfStay: source?.purposeOfStay || "",
      employmentType: source?.employmentType || "",
      numberOfApplicants: source?.numberOfApplicants ?? undefined,
      numberOfFamilyMembers: source?.numberOfFamilyMembers ?? undefined,
      previousRefusals: source?.previousRefusals || "",
      dependentName: source?.dependentName || "",
      dependentNationality: source?.dependentNationality || "",
      dependentOccupation: source?.dependentOccupation || "",
      companyType: source?.companyType || "",
      businessActivity: source?.businessActivity || "",
      numberOfShareholders: source?.numberOfShareholders ?? undefined,
      shareCapitalALL: source?.shareCapitalALL ?? undefined,
      situationDescription: source?.situationDescription || "",
    };
  };

  const [fields, setFields] = useState<ProposalFields>(initFields);
  const [saving, setSaving] = useState(false);

  // ── Payment setup ──
  const [paymentMethods, setPaymentMethods] = useState<Array<'bank' | 'crypto' | 'cash'>>(
    customer.paymentMethods ?? ['bank', 'cash']
  );
  const [paymentNote, setPaymentNote] = useState(customer.paymentNote ?? '');
  const [initialPayAmount, setInitialPayAmount] = useState<string>(
    customer.initialPaymentAmount ? String(customer.initialPaymentAmount) : ''
  );
  const [initialPayCurrency, setInitialPayCurrency] = useState<string>(
    customer.initialPaymentCurrency ?? 'EUR'
  );

  function togglePaymentMethod(method: 'bank' | 'crypto' | 'cash') {
    setPaymentMethods(prev =>
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    );
  }

  function setField<K extends keyof ProposalFields>(key: K, value: ProposalFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  // Fee calculations
  const consultationFee = fields.consultationFeeALL ?? 0;
  const serviceFee = fields.serviceFeeALL ?? 0;
  const poaFee = fields.poaFeeALL ?? 0;
  const translationFee = fields.translationFeeALL ?? 0;
  const otherFees = fields.otherFeesALL ?? 0;
  const serviceFeeSubtotal = consultationFee + serviceFee;
  const additionalSubtotal = poaFee + translationFee + otherFees;
  const totalALL = serviceFeeSubtotal + additionalSubtotal;
  const totalEUR = totalALL * EUR_RATE;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateCustomer(customer.customerId, { contractSnapshot: fields });
      toast({ title: "Contract fields saved", description: "The customer record has been updated." });
      onSaved?.(updated);
    } catch {
      toast({ title: "Save failed", description: "Could not save contract fields.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendContract() {
    if (paymentMethods.length === 0) {
      toast({ title: "Payment methods required", description: "Please select at least one accepted payment method.", variant: "destructive" });
      return;
    }
    if (!initialPayAmount || Number(initialPayAmount) <= 0) {
      toast({ title: "Initial payment required", description: "Please enter the initial payment amount before sending the contract.", variant: "destructive" });
      return;
    }
    // 80% cap
    const initNum = Number(initialPayAmount);
    const maxInCurrency = initialPayCurrency === 'ALL' ? totalALL * 0.8
      : initialPayCurrency === 'EUR' ? totalEUR * 0.8
      : initialPayCurrency === 'USD' ? totalALL * USD_RATE * 0.8
      : totalALL * GBP_RATE * 0.8;
    if (initNum > maxInCurrency) {
      toast({ title: "Initial payment too high", description: `Initial payment cannot exceed 80% of the total (max ${maxInCurrency.toFixed(2)} ${initialPayCurrency}).`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const initAmt = initialPayAmount && Number(initialPayAmount) > 0 ? Number(initialPayAmount) : null;
      const updated = await updateCustomer(customer.customerId, {
        contractSentAt: new Date().toISOString(),
        contractSnapshot: fields,
        status: "WAITING_ACCEPTANCE" as const,
        paymentAmountALL: totalALL,
        paymentAmountEUR: Math.round(totalEUR * 100) / 100,
        paymentMethods,
        paymentNote: paymentNote.trim() || null,
        initialPaymentAmount: initAmt,
        initialPaymentCurrency: initAmt ? initialPayCurrency : null,
        // Reset any previous payment selection/done state when re-sending
        paymentSelectedMethod: null,
        paymentDoneAt: null,
        paymentDoneBy: null,
      });
      toast({ title: "Contract sent", description: "The contract has been sent. Waiting for client acceptance." });
      onSent?.(updated);
      onOpenChange(false);
    } catch {
      toast({ title: "Failed to send", description: "Could not send the contract.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Service Agreement — ${customer.name}</title>
      <meta charset="utf-8"/>
      <style>
        @page { margin: 20mm 16mm; }
        *, *::before, *::after { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; margin: 0; padding: 0; }
        section { page-break-inside: avoid; break-inside: avoid; }
        h2, h3 { page-break-after: avoid; break-after: avoid; }
        table { page-break-inside: avoid; break-inside: avoid; }
        .avoid-break { page-break-inside: avoid; break-inside: avoid; }
        @media print { body { font-size: 11px; } }
      </style>
    </head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">
            Generate Contract — {customer.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={readOnly ? "preview" : "edit"} className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="mx-6 mt-3 mb-2 shrink-0 w-fit">
            {!readOnly && <TabsTrigger value="edit">Edit</TabsTrigger>}
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          {/* EDIT TAB */}
          <TabsContent value="edit" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 mb-4">
              <strong>Contract fields</strong> — pre-filled from the accepted proposal. Review and adjust before sending.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Contract title */}
              <div className="md:col-span-2 space-y-1">
                <Label>Contract / Document Title</Label>
                <Input
                  value={fields.proposalTitle ?? ""}
                  onChange={(e) => setField("proposalTitle", e.target.value)}
                />
              </div>

              {/* Contract date */}
              <div className="space-y-1">
                <Label>Contract Date</Label>
                <Input
                  type="date"
                  value={fields.proposalDate ?? today}
                  onChange={(e) => setField("proposalDate", e.target.value)}
                />
              </div>

              {/* Nationality */}
              <div className="space-y-1">
                <Label>Client Nationality</Label>
                <Input
                  value={fields.nationality ?? ""}
                  onChange={(e) => setField("nationality", e.target.value)}
                />
              </div>

              {/* Passport */}
              <div className="space-y-1">
                <Label>Passport / ID Number</Label>
                <Input
                  value={fields.idPassportNumber ?? ""}
                  onChange={(e) => setField("idPassportNumber", e.target.value)}
                />
              </div>

              {/* Number of applicants */}
              <div className="space-y-1">
                <Label>Number of Applicants</Label>
                <Input
                  type="number"
                  min={1}
                  value={fields.numberOfApplicants ?? ""}
                  onChange={(e) => setField("numberOfApplicants", e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>

              <div className="md:col-span-2">
                <hr className="my-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Fees (ALL)</p>
              </div>

              {/* Consultation fee */}
              <div className="space-y-1">
                <Label>Consultation Fee (ALL)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fields.consultationFeeALL ?? 0}
                  onChange={(e) => setField("consultationFeeALL", Number(e.target.value))}
                />
              </div>

              {/* Service fee */}
              <div className="space-y-1">
                <Label>Legal Service Fee (ALL)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fields.serviceFeeALL ?? 0}
                  onChange={(e) => setField("serviceFeeALL", Number(e.target.value))}
                />
              </div>

              {/* POA fee */}
              <div className="space-y-1">
                <Label>Power of Attorney Costs (ALL)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fields.poaFeeALL ?? 0}
                  onChange={(e) => setField("poaFeeALL", Number(e.target.value))}
                />
              </div>

              {/* Translation fee */}
              <div className="space-y-1">
                <Label>Translation / Notarisation Costs (ALL)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fields.translationFeeALL ?? 0}
                  onChange={(e) => setField("translationFeeALL", Number(e.target.value))}
                />
              </div>

              {/* Other fees */}
              <div className="space-y-1">
                <Label>Other Fees (ALL)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fields.otherFeesALL ?? 0}
                  onChange={(e) => setField("otherFeesALL", Number(e.target.value))}
                />
              </div>

              {/* Additional costs note */}
              <div className="space-y-1">
                <Label>Additional Costs Note (optional)</Label>
                <Input
                  value={fields.additionalCostsNote ?? ""}
                  onChange={(e) => setField("additionalCostsNote", e.target.value)}
                  placeholder="e.g. Translation costs TBD upon document collection"
                />
              </div>

              {/* Payment terms */}
              <div className="md:col-span-2 space-y-1">
                <Label>Custom Payment Terms Note (optional)</Label>
                <Textarea
                  value={fields.paymentTermsNote ?? ""}
                  onChange={(e) => setField("paymentTermsNote", e.target.value)}
                  placeholder="Leave blank to use the standard 50/50 payment terms"
                  rows={3}
                />
              </div>

              {/* Fee summary */}
              <div className="md:col-span-2 rounded-md border bg-muted/40 px-4 py-3 text-sm">
                <div className="flex justify-between"><span>Service Fees Subtotal</span><span className="font-mono">{fmt(serviceFeeSubtotal, 0)} ALL</span></div>
                <div className="flex justify-between"><span>Additional Costs Subtotal</span><span className="font-mono">{fmt(additionalSubtotal, 0)} ALL</span></div>
                <div className="flex justify-between font-semibold border-t mt-1 pt-1">
                  <span>TOTAL</span>
                  <span className="font-mono">{fmt(totalALL, 0)} ALL ≈ {fmt(totalEUR)} EUR</span>
                </div>
              </div>

              {/* ── Payment Setup ── */}
              <div className="md:col-span-2">
                <hr className="my-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Payment Setup</p>
                <p className="text-xs text-muted-foreground mb-3">
                  The payment amount is auto-filled from the contract total above. Choose which payment methods the client can use.
                </p>
              </div>

              {/* Payment amount (read-only) */}
              <div className="space-y-1">
                <Label>Payment Amount (ALL) — auto from total</Label>
                <div className="rounded-md border bg-muted/60 px-3 py-2 text-sm font-mono font-medium">
                  {fmt(totalALL, 0)} ALL ≈ {fmt(totalEUR)} EUR
                </div>
              </div>

              {/* Accepted payment methods */}
              <div className="space-y-1">
                <Label>Accepted Payment Methods <span className="text-destructive">*</span></Label>
                <div className="flex flex-col gap-2 mt-1">
                  {(["bank", "crypto", "cash"] as const).map(m => (
                    <label key={m} className="flex items-center gap-2.5 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
                      <Checkbox
                        checked={paymentMethods.includes(m)}
                        onCheckedChange={() => togglePaymentMethod(m)}
                      />
                      <span className="text-sm capitalize">
                        {m === 'bank' ? '🏦 Bank Transfer' : m === 'crypto' ? '💎 Crypto (USDT)' : '💵 Cash'}
                      </span>
                    </label>
                  ))}
                </div>
                {paymentMethods.length === 0 && (
                  <p className="text-xs text-destructive mt-1">Select at least one method.</p>
                )}
              </div>

              {/* Payment note for client */}
              <div className="md:col-span-2 space-y-1">
                <Label>Payment Note for Client (optional)</Label>
                <Textarea
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  placeholder="e.g. Please complete payment within 5 business days of signing. Reference your name on the transfer."
                  rows={2}
                />
              </div>

              {/* Initial payment amount */}
              <div className="md:col-span-2 space-y-1">
                {(() => {
                  const initNum = Number(initialPayAmount);
                  const maxInCurrency = initialPayCurrency === 'ALL' ? totalALL * 0.8
                    : initialPayCurrency === 'EUR' ? totalEUR * 0.8
                    : initialPayCurrency === 'USD' ? totalALL * USD_RATE * 0.8
                    : totalALL * GBP_RATE * 0.8;
                  const isOver = !!initialPayAmount && initNum > maxInCurrency;
                  const isEmpty = !initialPayAmount || initNum <= 0;
                  return (
                    <>
                      <Label>
                        Initial Payment Required <span className="text-destructive">*</span>
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={maxInCurrency}
                          value={initialPayAmount}
                          onChange={(e) => setInitialPayAmount(e.target.value)}
                          placeholder={`e.g. ${(maxInCurrency * 0.5).toFixed(0)}`}
                          className={`flex-1 ${isEmpty || isOver ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                        />
                        <select
                          value={initialPayCurrency}
                          onChange={(e) => setInitialPayCurrency(e.target.value)}
                          className="border rounded-md px-3 py-2 text-sm bg-background w-24"
                        >
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                          <option value="ALL">ALL</option>
                          <option value="GBP">GBP</option>
                        </select>
                      </div>
                      {isOver ? (
                        <p className="text-xs text-destructive">
                          Exceeds 80% limit — max allowed: <strong>{maxInCurrency.toFixed(2)} {initialPayCurrency}</strong>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Max 80% of contract total: <strong>{maxInCurrency.toFixed(initialPayCurrency === 'ALL' ? 0 : 2)} {initialPayCurrency}</strong>.
                          This amount will be deducted from the client's invoice when confirmed.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {!readOnly && (
              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave} disabled={saving} variant="secondary">
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button onClick={handleSendContract} disabled={saving}>
                  <Send className="h-4 w-4 mr-1.5" />
                  {saving ? "Sending..." : "Send Contract"}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* PREVIEW TAB */}
          <TabsContent value="preview" className="flex-1 overflow-y-auto mt-0">
            <div className="flex justify-end px-6 pt-3 pb-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <FileText className="h-4 w-4 mr-1.5" />
                Print / Save PDF
              </Button>
            </div>
            <div className="px-6 pb-6">
              <ContractRenderer
                clientName={customer.name}
                clientId={customer.customerId}
                services={svcs}
                fields={fields}
                innerRef={printRef}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
