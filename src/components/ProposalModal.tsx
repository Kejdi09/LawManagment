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
import { Send, Wand2 } from "lucide-react";
import { Customer, ProposalFields, SERVICE_LABELS, ServiceType } from "@/lib/types";
import { updateCustomer } from "@/lib/case-store";
import { useToast } from "@/hooks/use-toast";
import ProposalRenderer from "@/components/ProposalRenderer";

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
  real_estate:         { consultationFeeALL: 20_000, serviceFeeALL: 150_000, poaFeeALL: 15_000, translationFeeALL: 15_000 },
  visa_c:              { consultationFeeALL: 15_000, serviceFeeALL:  75_000, translationFeeALL: 10_000 },
  visa_d:              { consultationFeeALL: 15_000, serviceFeeALL: 100_000, poaFeeALL: 15_000, translationFeeALL: 10_000 },
  residency_permit:    { consultationFeeALL: 20_000, serviceFeeALL: 120_000, poaFeeALL: 15_000, translationFeeALL: 15_000 },
  residency_pensioner: { consultationFeeALL:      0, serviceFeeALL:  90_000, translationFeeALL: 15_000 },
  company_formation:   { consultationFeeALL: 20_000, serviceFeeALL: 100_000, translationFeeALL: 20_000 },
  tax_consulting:      { consultationFeeALL: 15_000, serviceFeeALL:  80_000 },
  compliance:          { consultationFeeALL: 15_000, serviceFeeALL:  60_000 },
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
  /** Step-by-step process overview — present only for template-specific services */
  processSteps?: Array<{ step: string; bullets: string[] }>;
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

// ── NOTE: For residency_pensioner, visa_d (employment), company_formation, and real_estate
//    the Preview tab renders verbatim docx content directly (see PreviewTab in JSX below).
//    The legacy content functions below are kept only for other service types. ──

function contentForPensionerResidency_UNUSED(fields: Partial<ProposalFields>): ServiceContent {
  const hasDependents = (fields.numberOfFamilyMembers ?? 0) > 0 || !!fields.dependentName;
  return {
    scopeParagraph: `Provision of full legal assistance for obtaining a Residence Permit in Albania as a Pensioner${hasDependents ? ", including Family Reunification for a dependent family member" : ""}. This covers the complete procedure from document collection through to the final biometric residence permit card.`,
    servicesSections: [
      {
        heading: "Services – Residency Permit Procedure",
        bullets: [
          "Full legal guidance during the entire application process",
          "Pre-check and verification of all documents",
          "Assistance with translations, notarization, and legalization if required",
          "Preparing all declarations required by the authorities",
          "Completing the residence permit applications",
          "Scheduling appointments with institutions",
          "Submission of applications at Migration Office",
          "Follow-up with authorities until final approval",
          "Assistance with Civil Registry address registration",
          "Accompanying the applicant for biometric fingerprints",
          "Guidance until the applicant receives the final residence permit card",
          "Payment of government or third-party fees",
          "Documents translation, apostille/legalization, or notary",
        ],
      },
    ],
    processSteps: [
      {
        step: "STEP 1: Residency Permit for the Main Applicant – Pensioner",
        bullets: [
          "Documents collection and preparation (see below)",
          "Government Fees payment by us",
          "Residency Permit Application Submission at the Local Directorate for Border and Migration in Durrës",
          "Receiving Provisional Residency Permit",
          "Final Decision on Residency Permit",
          "Address Registration at Civil Registry Office",
          "Application for biometric Residency Permit Card",
          "Obtaining the biometric residence card",
        ],
      },
      ...(hasDependents
        ? [{
            step: "STEP 2: Residency Permit for Dependent – Family Reunification",
            bullets: [
              "Same procedure as Step 1",
              "Submission after main applicant's Residency Permit is granted",
            ],
          }]
        : []),
    ],
    requiredDocs: [
      "— For the Main Applicant (Pensioner) —",
      "Photocopy of valid travel document (valid at least 3 months beyond permit period, with at least 2 blank pages)",
      "Individual declarations for reason of staying in Albania — We prepare in Albanian & English, you sign",
      "Proof of insurance in Albania — We arrange at our associate insurance company",
      "Evidence from a bank in Albania for transfer of pension income — We support with bank account opening",
      "Legalized criminal record from country of origin (issued within last 6 months, translated & notarized) — We handle",
      "Evidence of annual pension income exceeding 1,200,000 ALL — We handle legal translation and notary",
      "Proof of Residency Permit Government Fee Payment — We pay at the bank and provide the mandate",
      "Passport-size photograph (47mm × 36mm, taken within last 6 months, white background, neutral expression)",
      "Proof of accommodation in Albania (residential rental contract in accordance with Albanian standards)",
      ...(hasDependents
        ? [
            "— For the Dependent (Family Reunification) —",
            "Photocopy of dependent's valid travel document",
            "Marriage certificate (apostilled/legalized, translated and notarized if not issued in Albania) — We handle",
            "Proof of insurance in Albania for dependent — We arrange",
            "Copy of main applicant's residence permit in Albania",
            "Proof of Government Fee Payment for dependent — We pay and provide the mandate",
            "Passport-size photograph of dependent (47mm × 36mm)",
            "Proof of accommodation in Albania",
            "Evidence of sufficient financial resources during the stay in Albania",
          ]
        : []),
    ],
    timeline: [
      "Preparation and application submission: 3–5 business days",
      "Provisional Residency Permit: approx. 10–15 business days",
      "Final Decision on Residency Permit: approx. 30–45 business days",
      "Residency Permit Card issuance: approx. 2 calendar weeks",
    ],
    nextSteps: [
      "Prepare and sign the service agreement",
      "Make initial payment as agreed upon agreement signing",
      "Documents collection and preparation",
      "Residency Permit application submission at the Migration Office",
      "Follow-up with authorities until final decision",
      "Biometric fingerprints appointment and Residency Permit Card collection",
    ],
    feeDescription: "For Residency Permit applications as Pensioner, DAFKU Law Firm applies a fixed legal service fee per applicant, covering all procedural steps from document preparation through to the final permit card. For the specific fees applied to this engagement, see Section 4.2 below.",
  };
}

// ── (renamed to avoid routing conflicts — preview uses hardcoded JSX) ──
function contentForVisaDEmployment_UNUSED(fields: Partial<ProposalFields>): ServiceContent {
  return {
    scopeParagraph: `Provision of full legal assistance for obtaining a Type D Visa and Residence Permit in Albania for employment purposes${fields.nationality ? ` (Nationality: ${fields.nationality})` : ""}. This covers the complete process from visa application through to the final biometric residence permit card.`,
    servicesSections: [
      {
        heading: "Services – Visa and Residency Permit Procedure",
        bullets: [
          "Full legal guidance during the entire application process",
          "Pre-check and verification of all documents",
          "Assistance with translations, notarization, and legalization if required",
          "Preparing all declarations required by the authorities",
          "Payment of government or third-party fees",
          "Completing the visa and residence permit applications",
          "Scheduling appointments with institutions",
          "Submission of applications at Migration Office",
          "Follow-up with authorities until final approval",
          "Assistance with Civil Registry address registration",
          "Accompanying the applicant for biometric fingerprints",
          "Guidance until the applicant receives the final residence permit card",
        ],
      },
    ],
    processSteps: [
      {
        step: "STEP 1: Type D Visa Processing",
        bullets: [
          "Issuing Power of Attorney (if needed)",
          "Preparation of employment contract",
          "Preparation of Accommodation proof (contract or declaration)",
          "Documents collection and preparation (see below)",
          "Visa and Residency Permit Government Fees payment by us",
          "Visa application submission",
          "Decision on the visa approval",
        ],
      },
      {
        step: "STEP 2: Residency Permit Processing",
        bullets: [
          "As soon as the visa is approved and you enter the Albanian border, the Residency Permit procedure starts automatically",
          "Delivering the original documents and the Residency Permit application at the Local Directorate for Border and Migration",
          "Receiving Provisional Residency Permit",
          "Final Decision on Residency Permit",
          "Address Registration at Civil Registry Office",
          "Application for biometric Residency Permit Card",
          "Obtaining the biometric residence card",
        ],
      },
    ],
    requiredDocs: [
      "— For the Type D Visa Application (Employee) —",
      "Passport-size photograph (47mm × 36mm, taken within last 6 months, white background, neutral expression) — Provided by applicant",
      "Photocopy of valid travel document (valid at least 3 months beyond visa period, with at least 2 blank pages) — Provided by applicant",
      "Document certifying accommodation in Albania (notarized rental contract or hosting declaration) — We arrange",
      "Document proving professional/commercial activity in applicant's country related to visa purpose — Provided by applicant",
      "Residence Permit (12+ months) from country of residence if different from nationality country (valid 3+ additional months beyond visa period)",
      "Document proving legal status of the inviting entity — We obtain from accountant",
      "Invitation signed by the host — We prepare, applicant signs",
      "Employment contract drafted according to Albanian Labor Code — We prepare",
      "— For the Residency Permit Application (Employee) —",
      "Photocopy of valid travel document",
      "Proof of Residency Permit Government Fee Payment — We pay at the bank and provide the mandate",
      "Passport-size photograph (two printed copies + digital copy sent to us via email)",
      "Proof of accommodation in Albania (notarized rental contract)",
      "Employment contract according to Albanian Labor Code — We prepare",
      "Proof of professional qualification (diploma / certificate / reference / self-declaration)",
    ],
    timeline: [
      "Documents preparation: approx. 3–5 business days",
      "Visa processing: approx. 15–30 business days",
      "Residency Permit: approx. 30–45 business days",
      "Residency Permit ID Card: approx. 2 calendar weeks",
    ],
    nextSteps: [
      "Prepare and sign the service agreement",
      "Make initial payment as agreed upon agreement signing",
      "Documents collection and preparation",
      "Visa application submission",
      "Residency Permit application submission after visa approval",
      "Follow-up with authorities until final decision",
      "Biometric fingerprints appointment and Residency Permit Card collection",
    ],
    feeDescription: "For Type D Visa and Residency Permit applications for employment, DAFKU Law Firm applies a fixed legal service fee per applicant, covering all procedural steps from visa application through to the final permit card. For the specific fees applied to this engagement, see Section 4.2 below.",
  };
}

// ── (renamed to avoid routing conflicts — preview uses hardcoded JSX) ──
function contentForCompanySelfEmployed_UNUSED(fields: Partial<ProposalFields>): ServiceContent {
  return {
    scopeParagraph: `Provision of full legal assistance for Company Registration and Management in Albania, combined with a Type D Visa and Residence Permit as Self-Employed/Business Owner${fields.nationality ? ` (Nationality: ${fields.nationality})` : ""}. This engagement covers both the legal establishment of the company and the complete immigration procedure.`,
    servicesSections: [
      {
        heading: "Services – Company Formation in Albania",
        bullets: [
          "Legal consultation and structuring of the company",
          "Selection and reservation of the company name",
          "Drafting of the Founding Act and Company Statute",
          "Registration of the company with the National Business Center (QKB)",
          "Issuance of the company registration certificate and NUIS (tax number)",
          "Registration with the tax authorities (VAT and contributions if applicable)",
          "Assistance with opening a corporate bank account",
          "Preparation of company documentation required for residency permit purposes",
        ],
      },
      {
        heading: "Services – Visa and Residency Permit Procedure",
        bullets: [
          "Full legal guidance during the entire application process",
          "Pre-check and verification of all documents",
          "Assistance with translations, notarization, and legalization if required",
          "Preparing all declarations required by the authorities",
          "Completing the visa and residence permit applications",
          "Scheduling appointments with institutions",
          "Submission of applications at Migration Office",
          "Follow-up with authorities until final approval",
          "Assistance with Civil Registry address registration",
          "Accompanying the applicant for biometric fingerprints",
          "Guidance until the applicant receives the final residence permit card",
          "Payment of government or third-party fees",
          "Documents translation, apostille/legalization, or notary",
        ],
      },
    ],
    processSteps: [
      {
        step: "STEP 1: Company Formation",
        bullets: [
          "Issuing Power of Attorney",
          "Registration documents preparation",
          "Company registration submission",
          "Obtaining TAX ID / NIPT",
          "Obtaining Registration Certificate by QKB",
          "Employee declaration",
        ],
      },
      {
        step: "STEP 2: Visa and Residency Permit",
        bullets: [
          "Documents collection and preparation (see below)",
          "Visa and Residency Permit Application and Government Fees payment by us",
          "Decision on the visa approval",
          "As soon as the visa is approved and you enter the Albanian border, the Residency Permit procedure starts automatically",
          "Residency Permit application at the Local Directorate for Border and Migration in the city where you will be based",
          "Receiving Provisional Residency Permit",
          "Final Decision on Residency Permit",
          "Address Registration at Civil Registry Office",
          "Application for biometric Residency Permit Card",
          "Obtaining the biometric residence card",
        ],
      },
    ],
    requiredDocs: [
      "— For Company Registration —",
      "Valid passport copy (for each shareholder and administrator)",
      "Contact details and residential address (foreign address)",
      "Company name proposal (at least two options)",
      "Description of business activity",
      "Appointment details of the company administrator",
      "Shareholding structure details",
      "Company address in Albania",
      "Power of Attorney (notarized and apostilled/legalized, if registration is done remotely)",
      "— For Type D Visa (Self-Employed) —",
      "Passport-size photograph (47mm × 36mm, within last 6 months, white background, neutral expression)",
      "Photocopy of valid travel document (valid at least 3 months beyond visa period, with at least 2 blank pages)",
      "Certification of professional capacity (diploma, certificate, qualifications related to self-employment)",
      "Business Registration Certificate — We provide upon company registration",
      "Document certifying accommodation in Albania (rental contract or accommodation declaration) — We can arrange",
      "Bank statement covering the last 12 months (income and outgoings)",
      "— For Residency Permit (Self-Employed) —",
      "Photocopy of valid travel document",
      "Project idea for the business/activity (as required by the National Employment and Labor Agency) — We prepare",
      "Proof of sufficient financial means (minimum 500,000 ALL or equivalent) — We open the bank account; you make the deposit",
      "Document proving necessary skills (certificate / diploma or equivalent)",
      "Proof of registration of the activity in QKB — We provide upon company registration",
      "Payment Mandate of Government fee — We pay and provide the document",
      "Passport-size photograph (47mm × 36mm)",
      "Proof of accommodation in Albania (rental contract) — We can arrange",
    ],
    timeline: [
      "Company Registration: approx. 3–5 business days",
      "Visa processing: approx. 15–30 business days",
      "Residency Permit: approx. 30–45 business days",
      "Residency Permit ID Card: approx. 2 calendar weeks",
    ],
    nextSteps: [
      "Prepare and sign the service agreement",
      "Make initial payment as agreed upon agreement signing",
      "Documents collection and preparation",
      "Company Registration",
      "Visa and Residency Permit application submission",
      "Follow-up with authorities until final decision",
      "Biometric fingerprints appointment and Residency Permit Card collection",
    ],
    feeDescription: "For Company Formation combined with Type D Visa and Residency Permit for Self-Employed/Business Owners, DAFKU Law Firm applies a fixed service fee covering both the company registration process and the complete immigration procedure. For the specific fees applied to this engagement, see Section 4.2 below.",
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
  const initFields = (): ProposalFields => {
    const svcs = customer.services || [];
    const defaultTitle = (() => {
      if (customer.proposalFields?.proposalTitle) return customer.proposalFields.proposalTitle;
      if (svcs.includes("residency_pensioner")) return "Residence Permit for Pensioner and Family Reunification";
      if (svcs.includes("company_formation")) return "Company Registration and Management + Type D Visa & Residence Permit as Self-Employed/Business Owner";
      if (svcs.includes("visa_d")) return "Type D Visa & Residence Permit for Employees";
      return `Legal Assistance — ${svcs.map((s) => SERVICE_LABELS[s] || s).join(", ")}`;
    })();
    // Auto-apply standard fee presets when no custom fees have been set yet
    const hasCustomFees = (customer.proposalFields?.serviceFeeALL ?? 0) > 0;
    const presets = hasCustomFees ? {} as ReturnType<typeof computePresetFees> : computePresetFees(svcs as ServiceType[]);
    return {
    proposalTitle: defaultTitle,
    proposalDate: customer.proposalFields?.proposalDate || today,
    propertyDescription: customer.proposalFields?.propertyDescription || "",
    transactionValueEUR: customer.proposalFields?.transactionValueEUR ?? undefined,
    consultationFeeALL: customer.proposalFields?.consultationFeeALL ?? presets.consultationFeeALL ?? 0,
    serviceFeeALL: customer.proposalFields?.serviceFeeALL ?? presets.serviceFeeALL ?? 0,
    serviceFeePct: customer.proposalFields?.serviceFeePct ?? undefined,
    poaFeeALL: customer.proposalFields?.poaFeeALL ?? presets.poaFeeALL ?? 0,
    translationFeeALL: customer.proposalFields?.translationFeeALL ?? presets.translationFeeALL ?? 0,
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
    // Dependent (for Pensioner / Family Reunification)
    dependentName: customer.proposalFields?.dependentName || "",
    dependentNationality: customer.proposalFields?.dependentNationality || "",
    dependentOccupation: customer.proposalFields?.dependentOccupation || "",
    // Company formation
    companyType: customer.proposalFields?.companyType || "",
    businessActivity: customer.proposalFields?.businessActivity || "",
    numberOfShareholders: customer.proposalFields?.numberOfShareholders ?? undefined,
    shareCapitalALL: customer.proposalFields?.shareCapitalALL ?? undefined,
    // Tax / Compliance
    situationDescription: customer.proposalFields?.situationDescription || "",
    };
  };

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

  // Proposal template is driven entirely by customer.services
  const svcs = (customer.services || []) as ServiceType[];

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

        <Tabs defaultValue={
            (customer.proposalFields?.nationality || customer.proposalFields?.numberOfApplicants || customer.proposalFields?.businessActivity || customer.proposalFields?.dependentName || customer.proposalFields?.purposeOfStay)
              ? "preview" : "edit"
          } className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="mx-6 mt-2 w-fit shrink-0">
            <TabsTrigger value="edit">Edit Fields</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
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
              {(customer.services || []).some((s) => ["visa_c", "visa_d", "residency_permit", "residency_pensioner"].includes(s)) && (
                <>
                  <div className="md:col-span-2 border-t pt-4">
                    <p className="text-sm font-semibold mb-1 text-blue-700">
                      {(customer.services || []).some((s) => ["residency_permit", "residency_pensioner"].includes(s)) ? "Residency Permit" : "Visa"} — Intake Fields
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
                  {(customer.services || []).some((s) => ["residency_permit", "residency_pensioner"].includes(s)) && (
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

                  {/* Dependent / Family Member — only for Pensioner template */}
                  {(customer.services || []).includes("residency_pensioner") && (
                    <>
                      <div className="md:col-span-2 border-t pt-4">
                        <p className="text-sm font-semibold mb-1 text-blue-700">Dependent (Spouse / Family Member – Family Reunification)</p>
                        <p className="text-xs text-muted-foreground">Leave blank if there is no accompanying dependent.</p>
                      </div>
                      <div className="space-y-1">
                        <Label>Dependent Full Name</Label>
                        <Input
                          value={fields.dependentName ?? ""}
                          onChange={(e) => setField("dependentName", e.target.value)}
                          placeholder="e.g. Amanda Kerri Norris"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Dependent Nationality</Label>
                        <Input
                          value={fields.dependentNationality ?? ""}
                          onChange={(e) => setField("dependentNationality", e.target.value)}
                          placeholder="e.g. USA, British…"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Dependent Occupation</Label>
                        <Input
                          value={fields.dependentOccupation ?? ""}
                          onChange={(e) => setField("dependentOccupation", e.target.value)}
                          placeholder="e.g. In Retirement"
                        />
                      </div>
                    </>
                  )}
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
              <Button onClick={handleSave} disabled={saving} variant="secondary">
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button onClick={handleSendProposal} disabled={saving}>
                <Send className="h-4 w-4 mr-1.5" />
                {saving ? "Sending..." : "Send Proposal"}
              </Button>
            </div>
          </TabsContent>

          {/* -- PREVIEW TAB -- */}
          <TabsContent value="preview" className="flex-1 overflow-y-auto mt-0">
            <div className="flex justify-end px-6 pt-3 pb-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                Print / Save PDF
              </Button>
            </div>
            <div className="px-6 pb-6">
              <ProposalRenderer
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
