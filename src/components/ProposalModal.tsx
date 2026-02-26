/**
 * ProposalModal
 * Opens when staff clicks "Generate Proposal" on a SEND_PROPOSAL customer.
 * Two tabs: Edit (fee form) and Preview (rendered proposal + print).
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
import { Printer, Save, Send, Wand2 } from "lucide-react";
import { Customer, ProposalFields, SERVICE_LABELS, ServiceType } from "@/lib/types";
import { updateCustomer } from "@/lib/case-store";
import { useToast } from "@/hooks/use-toast";

// ── Fixed conversion approximation (shown as indicative, source: xe.com) ──
export const EUR_RATE = 0.01037032; // 1 ALL → EUR
export const USD_RATE = 0.01212463;
export const GBP_RATE = 0.00902409;

export function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Fee presets per service (suggested starting points, staff can adjust)
// Values in Albanian Lek (ALL). For multiple services, service fees are summed;
// shared costs (consultation, POA, translation) use the maximum across services.
const SVC_PRESETS: Partial<Record<ServiceType, { consultationFeeALL?: number; serviceFeeALL?: number; poaFeeALL?: number; translationFeeALL?: number }>> = {
  real_estate:       { consultationFeeALL: 20_000, serviceFeeALL: 150_000, poaFeeALL: 15_000, translationFeeALL: 15_000 },
  visa_c:            { consultationFeeALL: 15_000, serviceFeeALL:  75_000, translationFeeALL: 10_000 },
  visa_d:            { consultationFeeALL: 15_000, serviceFeeALL: 100_000, poaFeeALL: 15_000, translationFeeALL: 10_000 },
  residency_permit:  { consultationFeeALL: 20_000, serviceFeeALL: 120_000, poaFeeALL: 15_000, translationFeeALL: 15_000 },
  company_formation: { consultationFeeALL: 20_000, serviceFeeALL: 100_000, translationFeeALL: 20_000 },
  tax_consulting:    { consultationFeeALL: 15_000, serviceFeeALL:  80_000 },
  compliance:        { consultationFeeALL: 15_000, serviceFeeALL:  60_000 },
};

export function computePresetFees(services: ServiceType[]): Pick<ProposalFields, "consultationFeeALL" | "serviceFeeALL" | "poaFeeALL" | "translationFeeALL"> {
  let consultationFeeALL = 0, serviceFeeALL = 0, poaFeeALL = 0, translationFeeALL = 0;
  for (const svc of services) {
    const p = SVC_PRESETS[svc];
    if (!p) continue;
    consultationFeeALL = Math.max(consultationFeeALL, p.consultationFeeALL ?? 0);
    serviceFeeALL     += p.serviceFeeALL     ?? 0;
    poaFeeALL          = Math.max(poaFeeALL,    p.poaFeeALL        ?? 0);
    translationFeeALL  = Math.max(translationFeeALL, p.translationFeeALL ?? 0);
  }
  return { consultationFeeALL, serviceFeeALL, poaFeeALL, translationFeeALL };
}

// ── Service-specific content generators ──
export interface ServiceContent {
  scopeParagraph: string;
  servicesSections: Array<{ heading: string; bullets: string[] }>;
  requiredDocs: string[];
  timeline: string[];
  nextSteps: string[];
  /** Service-aware text for Section 4.1 "General Legal Service Fee" */
  feeDescription: string;
}

// Per-service content builders (TypeScript — types stripped at runtime by Node splice script)

function contentForRealEstate(fields: Partial<ProposalFields>): ServiceContent {
  const desc = fields.propertyDescription || "the property";
  return {
    scopeParagraph: `Provision of full legal assistance for the purchase of ${desc} in Albania — ensuring full legal compliance of the transaction, protection of the Client's interests as buyer, and proper transfer and registration of ownership.`,
    servicesSections: [
      {
        heading: "Legal Due Diligence (Real Estate)",
        bullets: [
          "Verification of ownership title with the Albanian State Cadastre (ASHK)",
          "Confirmation that the property is properly registered",
          "Verification of encumbrances (mortgages, liens, seizures, restrictions)",
          "Review of ownership history and seller's legal authority",
          "Consistency check between legal documentation and factual status",
        ],
      },
      {
        heading: "Contractual Documentation (Real Estate)",
        bullets: [
          "Review and/or drafting of the final Sale & Purchase Agreement",
          "Inclusion of buyer-protective clauses",
          "Coordination with the seller, real estate agent, and notary",
        ],
      },
      {
        heading: "Notarial Transaction Assistance (Real Estate)",
        bullets: [
          "Legal assistance during notarial execution of the transaction",
          "Verification of seller identity and disposal rights",
          "Review of the notarial deed prior to execution",
        ],
      },
      {
        heading: "Post-Transaction Registration (Real Estate)",
        bullets: [
          "Follow-up and registration of ownership with ASHK",
          "Submission of required documentation",
          "Monitoring until issuance of the new ownership certificate in the Client's name",
        ],
      },
    ],
    requiredDocs: [
      "Valid identification document (ID / Passport)",
      "Available property-related documentation (if any)",
      "Payment method details",
      "Power of Attorney (if required for real estate)",
    ],
    timeline: [
      "Real Estate — Legal due diligence & document verification: approx. 3–5 business days",
      "Real Estate — Contract review / finalization: approx. 3–7 business days",
      "Real Estate — Notarial execution: subject to parties' availability",
      "Real Estate — Registration with ASHK: approx. 15–30 business days",
    ],
    nextSteps: [
      "Collection and review of property-related documents",
      "Legal due diligence on the property",
      "Review and finalization of the Sale & Purchase Agreement",
      "Assistance during notarial signing and payment coordination",
      "Follow-up and monitoring of ownership registration with ASHK",
    ],
    feeDescription: "For real estate transactions, DAFKU Law Firm applies either a fixed legal service fee or a percentage-based fee typically ranging from 1% to 3% of the transaction value, depending on the complexity of the transaction, the nature of the property, and the level of legal assistance required. For this specific engagement, the fee is set out in Section 4.2 below.",
  };
}

function contentForVisa(type: "visa_c" | "visa_d", fields: Partial<ProposalFields>): ServiceContent {
  const visaLabel = type === "visa_c" ? "Visa C (Short-Stay)" : "Visa D (Long-Stay)";
  const purposePart = fields.purposeOfStay ? ` for the purpose of ${fields.purposeOfStay}` : "";
  const applicantsPart =
    fields.numberOfApplicants && fields.numberOfApplicants > 1
      ? ` for ${fields.numberOfApplicants} applicant(s)`
      : "";
  return {
    scopeParagraph: `Provision of full legal assistance for obtaining a ${visaLabel}${applicantsPart}${purposePart} in Albania — ensuring full compliance with Albanian immigration requirements and timely submission to the competent authorities.`,
    servicesSections: [
      {
        heading: `Eligibility Assessment (${visaLabel})`,
        bullets: [
          "Review of the Client's personal and professional situation",
          fields.purposeOfStay
            ? `Confirmation that a ${visaLabel} is the correct type for: ${fields.purposeOfStay}`
            : "Confirmation of visa category and sub-category applicable",
          "Assessment of supporting documentation requirements",
        ],
      },
      {
        heading: `Document Preparation & Submission (${visaLabel})`,
        bullets: [
          "Review and verification of all required supporting documents",
          "Assistance with translation and notarisation of foreign-language documents",
          "Preparation of the visa application form and cover letter",
          "Submission of the complete application package to the competent Albanian authority",
          "Ongoing follow-up with the immigration authority",
        ],
      },
    ],
    requiredDocs: [
      `Valid passport (minimum 6 months validity)${fields.nationality ? ` — Nationality: ${fields.nationality}` : ""}`,
      "Proof of purpose of stay (employment contract, invitation letter, etc.)",
      "Proof of financial means (bank statements)",
      "Proof of accommodation in Albania",
      "Passport-size photographs",
      ...(fields.numberOfApplicants && fields.numberOfApplicants > 1
        ? [`Documentation for all ${fields.numberOfApplicants} applicants`]
        : []),
      ...(fields.previousRefusals && !/^(none|no|skip|-)/i.test(fields.previousRefusals)
        ? [`Explanation letter regarding previous refusal: ${fields.previousRefusals}`]
        : []),
    ],
    timeline: [
      `${visaLabel} — Document review and preparation: approx. 3–5 business days`,
      `${visaLabel} — Application submission: approx. 1–2 business days after document completion`,
      `${visaLabel} — Authority processing time: approx. 15–30 business days`,
    ],
    nextSteps: [
      `Collection and review of required documents for ${visaLabel}`,
      `Submission of the ${visaLabel} application to the competent Albanian authority`,
      "Follow-up with the immigration authority on application status",
    ],
    feeDescription: `For ${visaLabel} applications, DAFKU Law Firm applies a fixed legal service fee per application/applicant, depending on the visa category, number of applicants, and complexity of the case. For this specific engagement, the fee is set out in Section 4.2 below.`,
  };
}

function contentForResidency(fields: Partial<ProposalFields>): ServiceContent {
  const purposePart = fields.purposeOfStay ? ` for the purpose of ${fields.purposeOfStay}` : "";
  const employmentPart = fields.employmentType
    ? ` The client's current status is: ${fields.employmentType}.`
    : "";
  const applicantsNote = fields.numberOfApplicants
    ? ` This application covers ${fields.numberOfApplicants} applicant(s)${
        fields.numberOfFamilyMembers && fields.numberOfFamilyMembers > 0
          ? `, of whom ${fields.numberOfFamilyMembers} are family member(s)/dependant(s)`
          : ""
      }.`
    : "";
  return {
    scopeParagraph: `Provision of full legal assistance for obtaining a Residence Permit in Albania${purposePart}.${employmentPart}${applicantsNote} Ensuring full compliance with Albanian immigration law and successful registration of residence status.`,
    servicesSections: [
      {
        heading: "Eligibility & Category Assessment (Residency)",
        bullets: [
          "Review of the Client's personal, professional, and financial situation",
          ...(fields.employmentType
            ? [
                `Assessment of the Client's status as: ${fields.employmentType} — and the appropriate permit category`,
              ]
            : ["Determination of the most suitable residence permit category"]),
          "Legal advice on residency rights and obligations under Albanian law",
        ],
      },
      {
        heading: "Document Preparation & Submission (Residency)",
        bullets: [
          "Review and verification of all required supporting documents",
          "Assistance with translation and notarisation of foreign-language documents",
          "Preparation of the residence permit application and supporting documentation",
          "Submission to the National Registration Centre (QKR) or competent body",
          "Ongoing monitoring and communication with authorities",
        ],
      },
    ],
    requiredDocs: [
      `Valid passport (minimum 12 months validity)${fields.nationality ? ` — Nationality: ${fields.nationality}` : ""}`,
      "Lease agreement or property ownership deed",
      ...(fields.employmentType
        ? [
            `Proof of ${fields.employmentType} status (employment contract, self-employment registration, etc.)`,
          ]
        : ["Proof of financial means or employment / self-employment"]),
      "Health insurance valid for Albania",
      `Certificate of no criminal record from country of origin${fields.country ? ` (${fields.country})` : ""} (apostilled / legalised)`,
      "Passport-size photographs",
      ...(fields.numberOfFamilyMembers && fields.numberOfFamilyMembers > 0
        ? [
            `Documents for ${fields.numberOfFamilyMembers} family member(s)/dependant(s)`,
          ]
        : []),
      ...(fields.previousRefusals && !/^(none|no|skip|-)/i.test(fields.previousRefusals)
        ? [`Explanation letter regarding previous refusal: ${fields.previousRefusals}`]
        : []),
      "Power of Attorney (if the Client appoints a representative for residency)",
    ],
    feeDescription: "For residence permit applications, DAFKU Law Firm applies a fixed legal service fee per applicant, depending on the permit category, duration, and complexity of the application. For this specific engagement, the fee is set out in Section 4.2 below.",
    timeline: [
      "Residency — Document review and preparation: approx. 5–10 business days",
      "Residency — Application submission: approx. 1–2 business days after document completion",
      `Residency — Authority processing time: approx. 30–60 business days${
        fields.numberOfApplicants && fields.numberOfApplicants > 1
          ? ` — ${fields.numberOfApplicants} applicant(s)`
          : ""
      }`,
    ],
    nextSteps: [
      "Collection and review of required documents for the Residence Permit",
      "Submission of the residence permit application",
      "Ongoing monitoring and follow-up with authorities",
      "Notification to the Client upon approval and permit collection",
    ],
  };
}

function contentForCompany(fields: Partial<ProposalFields>): ServiceContent {
  const companyTypePart = fields.companyType ? ` — ${fields.companyType}` : "";
  const activityPart = fields.businessActivity ? ` engaged in ${fields.businessActivity}` : "";
  const shareholdersPart = fields.numberOfShareholders
    ? ` with ${fields.numberOfShareholders} shareholder(s)`
    : "";
  const capitalPart = fields.shareCapitalALL
    ? ` Proposed registered capital: ${fields.shareCapitalALL.toLocaleString()} ALL.`
    : "";
  return {
    scopeParagraph: `Provision of full legal assistance for the formation and registration of a company in Albania${companyTypePart}${activityPart}${shareholdersPart}.${capitalPart} Ensuring full legal compliance with Albanian commercial law and successful registration with QKR.`,
    servicesSections: [
      {
        heading: "Legal & Structural Advisory (Company Formation)",
        bullets: [
          ...(fields.companyType
            ? [
                `Legal advisory on the chosen entity type: ${fields.companyType} — confirmation of suitability`,
              ]
            : ["Legal advice on the most suitable company type (SH.P.K., SH.A., branch, etc.)"]),
          ...(fields.numberOfShareholders
            ? [
                `Advice on the shareholder structure (${fields.numberOfShareholders} shareholder(s)), registered capital, and governance`,
              ]
            : ["Advice on shareholder structure, registered capital, and governance"]),
          "Company name availability check with the National Registration Centre (QKR)",
        ],
      },
      {
        heading: "Document Preparation & Registration (Company Formation)",
        bullets: [
          `Drafting of the Articles of Association${
            fields.businessActivity ? ` — business activity: ${fields.businessActivity}` : ""
          }`,
          "Preparation of all registration documents required by QKR",
          "Submission to QKR and coordination with the tax authority for NIPT",
          "Post-registration guidance (bank account opening, initial compliance)",
        ],
      },
    ],
    requiredDocs: [
      `Valid ID / Passport for all shareholders and directors${
        fields.numberOfShareholders ? ` (${fields.numberOfShareholders} shareholders)` : ""
      }`,
      "Proposed company name (at least two options)",
      "Shareholder structure and ownership percentages",
      `Registered capital${
        fields.shareCapitalALL ? `: ${fields.shareCapitalALL.toLocaleString()} ALL` : ""
      } and business activity${fields.businessActivity ? `: ${fields.businessActivity}` : ""}`,
      "Registered office address in Albania",
      "Power of Attorney (if the Client appoints a representative for company registration)",
    ],
    timeline: [
      "Company Formation — Advisory and document preparation: approx. 3–5 business days",
      "Company Formation — Notarisation and submission to QKR: approx. 1–2 business days",
      "Company Formation — QKR registration processing: approx. 1–3 business days",
      "Company Formation — Tax registration (NIPT): approx. 2–5 business days",
    ],
    nextSteps: [
      "Collection of required documents and information for company formation",
      "Drafting of Articles of Association and preparation of registration documents",
      "Notarisation and submission to QKR",
      "Tax registration and issuance of NIPT",
      "Post-registration guidance and account opening support",
    ],
    feeDescription: `For company registration and formation services, DAFKU Law Firm applies a fixed legal service fee depending on the entity type${fields.companyType ? ` (${fields.companyType})` : ""}, number of shareholders, and scope of post-registration assistance required. For this specific engagement, the fee is set out in Section 4.2 below.`,
  };
}

function contentForTax(type: ServiceType, fields: Partial<ProposalFields>): ServiceContent {
  const situationPart = fields.situationDescription
    ? ` The client requires assistance with: ${fields.situationDescription}.`
    : "";
  const entityPart = fields.employmentType ? ` Acting as: ${fields.employmentType}.` : "";
  const label = type === "tax_consulting" ? "Tax Consulting" : "Compliance Advisory";
  return {
    scopeParagraph: `Provision of professional legal and ${label.toLowerCase()} services.${situationPart}${entityPart} Ensuring full compliance with applicable Albanian law and expert guidance throughout the engagement.`,
    servicesSections: [
      {
        heading: `Initial Assessment (${label})`,
        bullets: [
          "Review of the Client's situation, documentation, and objectives",
          "Identification of applicable legal and regulatory requirements",
          "Legal advice on available courses of action",
        ],
      },
      {
        heading: `Advisory & Documentation (${label})`,
        bullets: [
          "Provision of legal opinions and written advisory notes",
          "Preparation and review of relevant documentation",
          "Representation before competent authorities where required",
          "Provision of a completion report upon conclusion",
        ],
      },
    ],
    requiredDocs: [
      "Valid identification document (ID / Passport)",
      "Relevant documentation specific to the matter (to be confirmed upon engagement)",
      "Power of Attorney (if the Client appoints a representative)",
    ],
    timeline: [
      `${label} — Initial review and assessment: approx. 3–7 business days`,
      `${label} — Advisory and documentation phase: approx. 5–15 business days`,
      `${label} — Authority interaction: subject to authority processing times`,
    ],
    nextSteps: [
      `Collection of required documents for ${label}`,
      "Commencement of legal review and advisory work",
      "Ongoing communication and monitoring",
    ],
    feeDescription: `For ${label.toLowerCase()} services, DAFKU Law Firm applies a fixed fee or an hourly/engagement-based fee depending on the scope, complexity, and duration of the work required. For this specific engagement, the fee is set out in Section 4.2 below.`,
  };
}

export function getServiceContent(services: ServiceType[], fields: Partial<ProposalFields>): ServiceContent {
  const all: ServiceType[] = services.length ? services : ["residency_permit"];

  // Build a ServiceContent per service
  const parts: ServiceContent[] = all.map((svc) => {
    if (svc === "real_estate") return contentForRealEstate(fields);
    if (svc === "visa_c" || svc === "visa_d") return contentForVisa(svc, fields);
    if (svc === "residency_permit") return contentForResidency(fields);
    if (svc === "company_formation") return contentForCompany(fields);
    return contentForTax(svc, fields);
  });

  if (parts.length === 1) {
    // Single service — wrap scope with intro and number sections
    const p = parts[0];
    return {
      ...p,
      scopeParagraph:
        "This proposal outlines the provision of legal services as described below.\n\n" +
        p.scopeParagraph,
      servicesSections: p.servicesSections.map((s, i) => ({
        ...s,
        heading: `2.${i + 1} ${s.heading}`,
      })),
      feeDescription: p.feeDescription,
    };
  }

  // Multiple services — merge content from all
  const serviceNames = all.map((s) => SERVICE_LABELS[s] || s).join(", ");
  const combinedScope =
    `This proposal outlines the provision of integrated legal assistance covering the following services: ${serviceNames}.\n\n` +
    parts.map((p) => p.scopeParagraph).join("\n\n");

  // Re-number sections across all services
  let sectionIdx = 1;
  const combinedSections: ServiceContent["servicesSections"] = [];
  for (const p of parts) {
    for (const s of p.servicesSections) {
      combinedSections.push({ ...s, heading: `2.${sectionIdx++} ${s.heading}` });
    }
  }

  // Merge required docs — deduplicate
  const seenDocs = new Set<string>();
  const combinedDocs: string[] = [];
  for (const p of parts) {
    for (const d of p.requiredDocs) {
      const key = d.toLowerCase().trim();
      if (!seenDocs.has(key)) {
        seenDocs.add(key);
        combinedDocs.push(d);
      }
    }
  }

  // For combined services, merge unique fee description sentences
  const combinedFeeDesc = parts.map((p) => p.feeDescription).join(" ");

  return {
    scopeParagraph: combinedScope,
    servicesSections: combinedSections,
    requiredDocs: combinedDocs,
    timeline: parts.flatMap((p) => p.timeline),
    nextSteps: [
      "Execution of the legal service engagement agreement",
      "Payment of the initial portion of the legal fee as agreed",
      ...parts.flatMap((p) => p.nextSteps),
      "Completion of all service engagements and issuance of final documents",
    ],
    feeDescription: combinedFeeDesc,
  };
}

// ── Main component ──
interface ProposalModalProps {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (updated: Customer) => void;
  onSent?: (updated: Customer) => void;
}

export default function ProposalModal({ customer, open, onOpenChange, onSaved, onSent }: ProposalModalProps) {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  // Merge stored proposalFields with sensible defaults
  const initFields = (): ProposalFields => ({
    proposalTitle:
      customer.proposalFields?.proposalTitle ||
      `Legal Assistance — ${(customer.services || []).map((s) => SERVICE_LABELS[s] || s).join(", ")}`,
    proposalDate: customer.proposalFields?.proposalDate || today,
    propertyDescription: customer.proposalFields?.propertyDescription || "",
    transactionValueEUR: customer.proposalFields?.transactionValueEUR ?? undefined,
    consultationFeeALL: customer.proposalFields?.consultationFeeALL ?? 0,
    serviceFeeALL: customer.proposalFields?.serviceFeeALL ?? 0,
    serviceFeePct: customer.proposalFields?.serviceFeePct ?? undefined,
    poaFeeALL: customer.proposalFields?.poaFeeALL ?? 0,
    translationFeeALL: customer.proposalFields?.translationFeeALL ?? 0,
    otherFeesALL: customer.proposalFields?.otherFeesALL ?? 0,
    additionalCostsNote: customer.proposalFields?.additionalCostsNote || "",
    paymentTermsNote: customer.proposalFields?.paymentTermsNote || "",
    nationality: customer.proposalFields?.nationality || customer.nationality || "",
    country: customer.proposalFields?.country || customer.country || "",
    idPassportNumber: customer.proposalFields?.idPassportNumber || "",
    // Visa / Residency
    purposeOfStay: customer.proposalFields?.purposeOfStay || "",
    employmentType: customer.proposalFields?.employmentType || "",
    numberOfApplicants: customer.proposalFields?.numberOfApplicants ?? undefined,
    numberOfFamilyMembers: customer.proposalFields?.numberOfFamilyMembers ?? undefined,
    previousRefusals: customer.proposalFields?.previousRefusals || "",
    // Company formation
    companyType: customer.proposalFields?.companyType || "",
    businessActivity: customer.proposalFields?.businessActivity || "",
    numberOfShareholders: customer.proposalFields?.numberOfShareholders ?? undefined,
    shareCapitalALL: customer.proposalFields?.shareCapitalALL ?? undefined,
    // Tax / Compliance
    situationDescription: customer.proposalFields?.situationDescription || "",
  });

  const [fields, setFields] = useState<ProposalFields>(initFields);
  const [saving, setSaving] = useState(false);

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
  const totalUSD = totalALL * USD_RATE;
  const totalGBP = totalALL * GBP_RATE;

  // Proposal template is driven entirely by customer.services (saved in DB)
  const serviceContent = getServiceContent(customer.services || [], fields);

  const displayDate = fields.proposalDate
    ? new Date(fields.proposalDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".")
    : today;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateCustomer(customer.customerId, { proposalFields: fields });
      toast({ title: "Proposal fields saved", description: "The customer record has been updated." });
      onSaved?.(updated);
    } catch {
      toast({ title: "Save failed", description: "Could not save proposal fields.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendProposal() {
    setSaving(true);
    try {
      const updated = await updateCustomer(customer.customerId, {
        proposalFields: fields,
        proposalSentAt: new Date().toISOString(),
        proposalExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        proposalSnapshot: fields,
      });
      toast({ title: "Proposal sent", description: "The proposal has been marked as sent and saved to the customer record." });
      onSent?.(updated);
      onOpenChange(false);
    } catch {
      toast({ title: "Failed to send", description: "Could not send the proposal.", variant: "destructive" });
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
      <title>Service Proposal — ${customer.name}</title>
      <meta charset="utf-8"/>
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        body { font-family: 'Georgia', serif; color: #1a1a1a; background: #fff; margin: 0; padding: 0; }
        .page { max-width: 800px; margin: 0 auto; padding: 48px 56px; }
        h1 { font-size: 28px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; text-align: center; margin-bottom: 4px; }
        .cover-sub { text-align: center; font-size: 13px; color: #444; margin-bottom: 36px; }
        .cover-block { background: #f8f8f8; border: 1px solid #ddd; border-radius: 6px; padding: 16px 20px; margin-bottom: 14px; }
        .cover-block p { margin: 3px 0; font-size: 13px; }
        .section-title { font-size: 15px; font-weight: bold; margin: 28px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        .sub-title { font-size: 13px; font-weight: bold; margin: 14px 0 4px; }
        p, li { font-size: 13px; line-height: 1.7; margin: 4px 0; }
        ul { padding-left: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
        th { background: #f0f0f0; text-align: left; padding: 6px 10px; border: 1px solid #ccc; }
        td { padding: 6px 10px; border: 1px solid #ddd; }
        .total-row td { font-weight: bold; background: #f8f8f8; }
        .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 11px; color: #777; text-align: center; }
        .office-grid { display: flex; gap: 20px; }
        .office-grid > div { flex: 1; }
        @media print { body { font-size: 12px; } .page { padding: 20px 28px; } }
      </style>
    </head><body><div class="page">${content.innerHTML}</div></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">
            Generate Proposal — {customer.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="edit" className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="mx-6 mt-2 w-fit shrink-0">
            <TabsTrigger value="edit">Edit Fields</TabsTrigger>
            <TabsTrigger value="preview">Preview / Print</TabsTrigger>
          </TabsList>

          {/* ── EDIT TAB ── */}
          <TabsContent value="edit" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 pt-4">
              {/* Proposal basics */}
              <div className="md:col-span-2 space-y-1">
                <Label>Proposal Title</Label>
                <Input
                  value={fields.proposalTitle ?? ""}
                  onChange={(e) => setField("proposalTitle", e.target.value)}
                  placeholder="e.g. Legal Assistance for Real Estate Investment in Albania"
                />
              </div>

              <div className="space-y-1">
                <Label>Proposal Date</Label>
                <Input
                  type="date"
                  value={fields.proposalDate ?? today}
                  onChange={(e) => setField("proposalDate", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Nationality</Label>
                <Input
                  value={fields.nationality ?? ""}
                  onChange={(e) => setField("nationality", e.target.value)}
                  placeholder="e.g. German, French…"
                />
              </div>

              {/* Property / transaction fields — only relevant for real estate */}
              {(customer.services || []).includes("real_estate") && (
                <>
                  <div className="md:col-span-2 space-y-1">
                    <Label>Property Description</Label>
                    <Input
                      value={fields.propertyDescription ?? ""}
                      onChange={(e) => setField("propertyDescription", e.target.value)}
                      placeholder="e.g. a residential house and garage located in Durrës, Albania"
                    />
                    <p className="text-xs text-muted-foreground">Used in the Scope section of the proposal.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Transaction Value (EUR)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={fields.transactionValueEUR ?? ""}
                      onChange={(e) => setField("transactionValueEUR", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g. 100000"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <Label>ID / Passport Number</Label>
                <Input
                  value={fields.idPassportNumber ?? ""}
                  onChange={(e) => setField("idPassportNumber", e.target.value)}
                  placeholder="leave blank if not yet collected"
                />
              </div>

              {/* ── Service-specific fields ── */}
              {(customer.services || []).some((s) => ["visa_c", "visa_d", "residency_permit"].includes(s)) && (
                <>
                  <div className="md:col-span-2 border-t pt-4">
                    <p className="text-sm font-semibold mb-1 text-blue-700">
                      {(customer.services || []).includes("residency_permit") ? "Residency Permit" : "Visa"} — Intake Fields
                    </p>
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label>Purpose of stay / relocation</Label>
                    <Input
                      value={fields.purposeOfStay ?? ""}
                      onChange={(e) => setField("purposeOfStay", e.target.value)}
                      placeholder="e.g. employment, self-employment, property ownership, tourism"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Employment / income type</Label>
                    <Input
                      value={fields.employmentType ?? ""}
                      onChange={(e) => setField("employmentType", e.target.value)}
                      placeholder="e.g. Employed, Self-employed, Retired, Investor"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Number of applicants</Label>
                    <Input
                      type="number" min={1}
                      value={fields.numberOfApplicants ?? ""}
                      onChange={(e) => setField("numberOfApplicants", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g. 1"
                    />
                  </div>
                  {(customer.services || []).includes("residency_permit") && (
                    <div className="space-y-1">
                      <Label>Family members / dependants</Label>
                      <Input
                        type="number" min={0}
                        value={fields.numberOfFamilyMembers ?? ""}
                        onChange={(e) => setField("numberOfFamilyMembers", e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 0"
                      />
                    </div>
                  )}
                  <div className="md:col-span-2 space-y-1">
                    <Label>Previous permit / visa refusals</Label>
                    <Input
                      value={fields.previousRefusals ?? ""}
                      onChange={(e) => setField("previousRefusals", e.target.value)}
                      placeholder='"none" or describe briefly'
                    />
                  </div>
                </>
              )}

              {(customer.services || []).includes("company_formation") && (
                <>
                  <div className="md:col-span-2 border-t pt-4">
                    <p className="text-sm font-semibold mb-1 text-blue-700">Company Formation — Intake Fields</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Company type</Label>
                    <Input
                      value={fields.companyType ?? ""}
                      onChange={(e) => setField("companyType", e.target.value)}
                      placeholder="e.g. SH.P.K., SH.A., Branch, Representative Office"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Number of shareholders</Label>
                    <Input
                      type="number" min={1}
                      value={fields.numberOfShareholders ?? ""}
                      onChange={(e) => setField("numberOfShareholders", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label>Business activity</Label>
                    <Input
                      value={fields.businessActivity ?? ""}
                      onChange={(e) => setField("businessActivity", e.target.value)}
                      placeholder="e.g. Import and wholesale distribution of construction materials"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Share capital (ALL)</Label>
                    <Input
                      type="number" min={0}
                      value={fields.shareCapitalALL ?? ""}
                      onChange={(e) => setField("shareCapitalALL", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g. 100"
                    />
                  </div>
                </>
              )}

              {(customer.services || []).some((s) => ["tax_consulting", "compliance"].includes(s)) && (
                <>
                  <div className="md:col-span-2 border-t pt-4">
                    <p className="text-sm font-semibold mb-1 text-blue-700">Tax / Compliance — Intake Fields</p>
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label>Client situation / needs</Label>
                    <Textarea
                      value={fields.situationDescription ?? ""}
                      onChange={(e) => setField("situationDescription", e.target.value)}
                      placeholder="e.g. needs to register for VAT and set up monthly reporting"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Acting as</Label>
                    <Input
                      value={fields.employmentType ?? ""}
                      onChange={(e) => setField("employmentType", e.target.value)}
                      placeholder="e.g. Individual, Company, Foreign company"
                    />
                  </div>
                </>
              )}

              {/* Fee section */}
              <div className="md:col-span-2 border-t pt-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Fees (in ALL)</p>
                {(customer.services || []).length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      const preset = computePresetFees(customer.services as ServiceType[]);
                      setFields((prev) => ({ ...prev, ...preset }));
                    }}
                  >
                    <Wand2 className="h-3 w-3" />
                    Load standard fees
                  </Button>
                )}
              </div>

              <div className="space-y-1">
                <Label>Consultation Fee (ALL)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fields.consultationFeeALL ?? 0}
                  onChange={(e) => setField("consultationFeeALL", Number(e.target.value))}
                />
              </div>

              <div className="space-y-1">
                <Label>Service Fee (ALL)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fields.serviceFeeALL ?? 0}
                  onChange={(e) => setField("serviceFeeALL", Number(e.target.value))}
                />
              </div>

              <div className="space-y-1">
                <Label>Power of Attorney Fee (ALL)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fields.poaFeeALL ?? 0}
                  onChange={(e) => setField("poaFeeALL", Number(e.target.value))}
                />
              </div>

              <div className="space-y-1">
                <Label>Translation / Notarisation Costs (ALL)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fields.translationFeeALL ?? 0}
                  onChange={(e) => setField("translationFeeALL", Number(e.target.value))}
                />
              </div>

              <div className="space-y-1">
                <Label>Other Fees (ALL)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fields.otherFeesALL ?? 0}
                  onChange={(e) => setField("otherFeesALL", Number(e.target.value))}
                />
              </div>

              <div className="space-y-1">
                <Label>Additional Costs Note (optional)</Label>
                <Input
                  value={fields.additionalCostsNote ?? ""}
                  onChange={(e) => setField("additionalCostsNote", e.target.value)}
                  placeholder="e.g. Translation costs TBD upon document collection"
                />
              </div>

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
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1.5" />
                {saving ? "Saving…" : "Save Draft"}
              </Button>
              <Button onClick={handleSendProposal} disabled={saving}>
                <Send className="h-4 w-4 mr-1.5" />
                {saving ? "Sending…" : "Send Proposal"}
              </Button>
            </div>
          </TabsContent>

          {/* ── PREVIEW TAB ── */}
          <TabsContent value="preview" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
            <div className="flex justify-end mt-3 mb-4">
              <Button onClick={handlePrint} variant="outline">
                <Printer className="h-4 w-4 mr-1.5" />
                Print / Save as PDF
              </Button>
            </div>

            {/* Proposal content */}
            <div
              ref={printRef}
              className="bg-white text-gray-900 rounded-lg border shadow-sm p-10 font-serif text-[13px] leading-relaxed"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {/* Cover */}
              <h1 className="text-2xl font-bold text-center uppercase tracking-widest mb-1">Service Proposal</h1>
              <p className="text-center text-sm text-gray-500 mb-8">Presented to: <strong>{customer.name}</strong></p>

              <div className="border rounded p-4 mb-2 bg-gray-50">
                <p className="text-sm font-semibold mb-1">Services Provided:</p>
                <p className="text-sm">{fields.proposalTitle}</p>
              </div>

              {/* Two office columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2 border rounded p-4 bg-gray-50">
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
                <span>☎ +355 69 69 52 989</span>
                <span>✉ info@dafkulawfirm.al</span>
                <span>🌐 www.dafkulawfirm.al</span>
                <span className="ml-auto font-semibold">Date: {displayDate}</span>
              </div>

              {/* Section 1 */}
              <div className="section-divider mb-1">
                <p className="text-sm font-bold border-b pb-1 mb-2">1 — Scope of the Proposal</p>
                <p className="text-sm">{serviceContent.scopeParagraph}</p>
                {fields.transactionValueEUR && (
                  <p className="text-sm mt-1">
                    Total estimated transaction value: <strong>EUR {fmt(fields.transactionValueEUR, 0)}</strong>.
                  </p>
                )}
              </div>

              {/* Section 2 */}
              <div className="mt-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">2 — Scope of Services Provided</p>
                {serviceContent.servicesSections.map((sec) => (
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
                <p className="text-sm mb-1">Required Documentation from the Client:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {serviceContent.requiredDocs.map((d, i) => <li key={i} className="text-sm">{d}</li>)}
                </ul>
              </div>

              {/* Section 4 */}
              <div className="mt-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">4 — Fees & Costs</p>

                <p className="text-sm font-semibold mb-0.5">4.1 General Legal Service Fee</p>
                <p className="text-sm mb-3">{serviceContent.feeDescription}</p>

                <p className="text-sm font-semibold mb-1">4.2 Fees and Costs Applied to this Specific Case</p>
                <table className="w-full border-collapse text-sm mb-4">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border px-3 py-1.5 text-left">Description of the Service</th>
                      <th className="border px-3 py-1.5 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border px-3 py-1.5">Consultation fee</td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(consultationFee, 0)} ALL</td>
                    </tr>
                    <tr>
                      <td className="border px-3 py-1.5">
                        Service fee for the assistance with {(customer.services || []).map((s) => SERVICE_LABELS[s] || s).join(", ")}
                        {fields.propertyDescription ? `, including: ${fields.propertyDescription}` : ""}
                      </td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(serviceFee, 0)} ALL</td>
                    </tr>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="border px-3 py-1.5">Service Fees Subtotal</td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(serviceFeeSubtotal, 0)} ALL</td>
                    </tr>
                  </tbody>
                </table>

                <table className="w-full border-collapse text-sm mb-4">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border px-3 py-1.5 text-left">Additional Costs</th>
                      <th className="border px-3 py-1.5 text-right w-24">Unit Cost</th>
                      <th className="border px-3 py-1.5 text-right w-24">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border px-3 py-1.5">Power of Attorney</td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(poaFee, 0)} ALL</td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(poaFee, 0)} ALL</td>
                    </tr>
                    <tr>
                      <td className="border px-3 py-1.5">
                        Documents Legal Translation and Notary
                        {fields.additionalCostsNote ? ` (${fields.additionalCostsNote})` : " (to be specified later upon documents collection)"}
                      </td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(translationFee, 0)} ALL</td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(translationFee, 0)} ALL</td>
                    </tr>
                    <tr>
                      <td className="border px-3 py-1.5">Other fees</td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(otherFees, 0)} ALL</td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(otherFees, 0)} ALL</td>
                    </tr>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="border px-3 py-1.5">Additional Costs Subtotal</td>
                      <td className="border px-3 py-1.5"></td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(additionalSubtotal, 0)} ALL</td>
                    </tr>
                    <tr className="bg-gray-100 font-bold">
                      <td className="border px-3 py-1.5">FINAL COST TOTAL</td>
                      <td className="border px-3 py-1.5"></td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(totalALL, 0)} ALL</td>
                    </tr>
                  </tbody>
                </table>

                <p className="text-sm font-semibold mb-1">4.3 Calculation in Foreign Currencies</p>
                <table className="w-full border-collapse text-sm mb-4">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border px-3 py-1.5 text-left">Currency</th>
                      <th className="border px-3 py-1.5 text-right">Conversion Rate</th>
                      <th className="border px-3 py-1.5 text-right">Value after Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border px-3 py-1.5">EUR</td>
                      <td className="border px-3 py-1.5 text-right font-mono">1.00 ALL = {EUR_RATE.toFixed(8)} EUR</td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(totalEUR)} EUR</td>
                    </tr>
                    <tr>
                      <td className="border px-3 py-1.5">USD</td>
                      <td className="border px-3 py-1.5 text-right font-mono">1.00 ALL = {USD_RATE.toFixed(8)} USD</td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(totalUSD)} USD</td>
                    </tr>
                    <tr>
                      <td className="border px-3 py-1.5">GBP</td>
                      <td className="border px-3 py-1.5 text-right font-mono">1.00 ALL = {GBP_RATE.toFixed(8)} GBP</td>
                      <td className="border px-3 py-1.5 text-right font-mono">{fmt(totalGBP)} GBP</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-gray-500 mb-4">Conversion Source: https://www.xe.com/ (indicative rates — subject to change)</p>

                <p className="text-sm font-semibold mb-1">4.4 Costs Not Included</p>
                <p className="text-sm mb-1">The legal fee does not include:</p>
                <ul className="list-disc pl-5 space-y-0.5 text-sm">
                  <li>Notary fees related to the execution of agreements and notarization of documents.</li>
                  <li>Government fees and taxes, including property transfer tax and registration fees.</li>
                  <li>Real estate agency or third-party professional commissions, if applicable.</li>
                  <li>Bank charges related to payment transfers (domestic or international).</li>
                  <li>Translation and sworn translation costs, if documents are issued in a foreign language.</li>
                  <li>Apostille or legalization costs, where required for foreign documents.</li>
                  <li>Courier or administrative expenses, including document delivery or official filings.</li>
                  <li>Any third-party professional fees, such as surveyors, engineers, or technical experts, if required.</li>
                </ul>
              </div>

              {/* Section 5 */}
              <div className="mt-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">5 — Payment Terms</p>
                {fields.paymentTermsNote ? (
                  <p className="text-sm">{fields.paymentTermsNote}</p>
                ) : (
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>50% of the agreed legal service fee is payable upon signing of the engagement agreement and opening of the client file.</li>
                    <li>50% of the agreed legal service fee is payable prior to the execution of the final notarial act or completion of the engagement.</li>
                    <li>Government fees, notary fees, and any third-party costs are payable separately and in advance, before the relevant service or submission to the competent authorities.</li>
                    <li>All legal service fees are non-refundable once the service has commenced and/or once any documentation has been submitted to a notary or public authority.</li>
                    <li>Payments may be made via bank transfer, cash, card payment, PayPal, or other agreed payment methods.</li>
                  </ul>
                )}
              </div>

              {/* Section 6 */}
              <div className="mt-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">6 — Timeline Overview</p>
                <ul className="list-disc pl-5 space-y-0.5 text-sm">
                  {serviceContent.timeline.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>

              {/* Section 7 */}
              <div className="mt-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">7 — Important Notes & Legal Disclaimers</p>
                <p className="text-sm mb-1">It is important for the Client to be aware of the following:</p>
                <ul className="list-disc pl-5 space-y-0.5 text-sm">
                  <li>All legal services are provided based on the documentation and information made available by the Client and third parties.</li>
                  <li>Processing times are estimates and may vary due to institutional workload or additional requirements.</li>
                  <li>Public authorities may request additional documents or clarifications at any stage of the process.</li>
                  <li>The Firm cannot guarantee timelines or decisions made by notaries, banks, or public authorities.</li>
                  <li>The Firm is not responsible for delays or refusals caused by incomplete, inaccurate, or late documentation provided by third parties.</li>
                  <li>Legal fees do not include government fees, notary fees, or any third-party costs unless explicitly stated.</li>
                </ul>
              </div>

              {/* Section 8 */}
              <div className="mt-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">8 — Next Steps</p>
                <p className="text-sm mb-1">Upon your approval of this proposal, the following steps will be taken:</p>
                <ul className="list-disc pl-5 space-y-0.5 text-sm">
                  {serviceContent.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>

              {/* Footer */}
              <div className="mt-10 border-t pt-4 text-center text-xs text-gray-400">
                DAFKU Law Firm · Tirana & Durrës, Albania · info@dafkulawfirm.al · www.dafkulawfirm.al
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
