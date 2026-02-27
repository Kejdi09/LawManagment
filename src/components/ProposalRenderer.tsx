/**
 * ProposalRenderer
 * Renders a professional service proposal document from structured template data.
 * Supports single and multi-service proposals. Conditions (has_spouse, is_off_plan)
 * drive conditional sections automatically from the intake form fields.
 */
import React from "react";
import { ServiceType, ProposalFields } from "@/lib/types";
import { evaluateConditions, Conditions } from "@/lib/proposal-engine";

// --- Currency rates (indicative) ---
export const EUR_RATE = 0.01037032;
export const USD_RATE = 0.01212463;
export const GBP_RATE = 0.00902409;

export function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// --- Template data model ---

interface CaseOverviewRow {
  label: string;
  value: string;
}

interface CaseOverviewSection {
  sectionTitle?: string;
  rows: CaseOverviewRow[];
}

interface ProcessStep {
  stepTitle: string;
  bullets: string[];
}

interface DocSection {
  heading?: string;
  items: string[];
}

interface TemplateData {
  svcKey: ServiceType;
  serviceTitle: string;
  contactBar: "relocate" | "dafku";
  caseOverviewSections: CaseOverviewSection[];
  scopeIntro?: string;
  scopeBullets: string[];
  processSteps: ProcessStep[];
  docSections: DocSection[];
  timeline: string[];
  paymentTerms: string[];
  disclaimerIntro?: string;
  disclaimers: string[];
  nextSteps: string[];
}

// --- Per-service data builders ---

function buildPensioner(
  clientName: string,
  fields: Partial<ProposalFields>,
  c: Conditions
): TemplateData {
  const dep = c.has_spouse;
  return {
    svcKey: "residency_pensioner",
    serviceTitle: dep
      ? "Residence Permit for Pensioner + Residence Permit for Family Reunification"
      : "Residence Permit for Pensioner",
    contactBar: "relocate",
    caseOverviewSections: [
      {
        sectionTitle: "Main Applicant",
        rows: [
          { label: "Name", value: clientName },
          { label: "Nationality", value: fields.nationality || "-" },
          { label: "Occupation", value: fields.employmentType || "-" },
          { label: "Relocation motive", value: "Pensioner" },
        ],
      },
      ...(dep
        ? [
            {
              sectionTitle: "Dependent (Spouse)",
              rows: [
                { label: "Name", value: fields.dependentName || "-" },
                { label: "Nationality", value: fields.dependentNationality || "-" },
                { label: "Occupation", value: fields.dependentOccupation || "-" },
                { label: "Relocation motive", value: "Family Reunification" },
              ],
            },
          ]
        : []),
    ],
    scopeIntro: "Services related to the Residency Permit procedure:",
    scopeBullets: [
      "Full legal guidance during the entire application process",
      "Pre-check and verification of all documents",
      "Assistance with translations, notarization, and legalization if required",
      "Preparing all declarations required by the authorities",
      "Completing the residence permit application(s)",
      "Scheduling all appointments with the relevant institutions",
      "Submission of the application at the Local Directorate for Border and Migration",
      "Follow-up with the authorities until final approval",
      "Assistance with Civil Registry address registration",
      "Accompanying the applicant for biometric fingerprints",
      "Guidance until the applicant receives the final residence permit card",
      "Payment of government or third-party fees on behalf of the applicant",
      "Documents translation, apostille/legalization, or notary (if needed)",
    ],
    processSteps: [
      {
        stepTitle: "Residency Permit for the Main Applicant (Pensioner)",
        bullets: [
          "Documents collection and preparation (see required documents below)",
          "Government fees payment by us",
          "Residency Permit Application submission at the Local Directorate for Border and Migration",
          "Receiving the Provisional Residency Permit",
          "Final Decision on Residency Permit",
          "Address Registration at the Civil Registry Office",
          "Application for biometric Residency Permit Card",
          "Obtaining the biometric residence card",
        ],
      },
      ...(dep
        ? [
            {
              stepTitle: "Residency Permit for Dependent (Family Reunification)",
              bullets: [
                "Same procedure as above for the main applicant",
                "Submitted after the main applicant's Residency Permit is granted",
              ],
            },
          ]
        : []),
    ],
    docSections: [
      {
        heading: "For the Main Applicant (Pensioner)",
        items: [
          "Photocopy of valid travel document (valid for at least 3 months beyond the permit period, with at least 2 blank pages) - provided by the applicant",
          "Individual declarations for the reason for staying in Albania - we prepare in Albanian and English; you sign",
          "Proof of insurance in Albania - we arrange at our associate insurance company",
          "Evidence from an Albanian bank confirming transfer of pension income - we assist with bank account opening",
          "Legalized criminal record from country of origin (issued within the last 6 months, translated and notarized) - we handle",
          "Evidence of annual pension income exceeding 1,200,000 ALL - we handle legal translation and notary",
          "Proof of Residency Permit Government Fee Payment - we pay at the bank and provide the mandate",
          "Passport-size photograph (47mm x 36mm, taken within the last 6 months, white background)",
          "Proof of accommodation in Albania - residential rental contract",
        ],
      },
      ...(dep
        ? [
            {
              heading: "For the Dependent (Family Reunification) - submitted after main permit is granted",
              items: [
                "Photocopy of valid travel document (same requirements as main applicant) - provided by the applicant",
                "Marriage certificate (issued within the last 6 months, legalized, translated and notarized if not issued in Albania) - we handle",
                "Proof of insurance in Albania - we arrange at our associate insurance company",
                "Copy of the main applicant's residence permit in Albania",
                "Proof of Residency Permit Government Fee Payment - we pay at the bank and provide the mandate",
                "Passport-size photograph (47mm x 36mm, taken within the last 6 months) - two printed copies and a digital copy emailed to us",
                "Proof of accommodation in Albania - residential rental contract",
                "Evidence of sufficient financial resources during the stay in Albania - we handle legal translation and notary",
              ],
            },
          ]
        : []),
    ],
    timeline: [
      "Preparation and application submission: 3-5 business days",
      "Provisional Residency Permit: approx. 10-15 business days",
      "Final Decision on Residency Permit: approx. 30-45 business days",
      "Residency Permit Card issue: approx. 2 calendar weeks",
    ],
    paymentTerms: [
      "50% of the service fee is payable upon contract signing / file opening.",
      dep
        ? "50% is payable before submission of the residency permit application for the dependent (family reunification)."
        : "50% is payable before submission of the residency permit application.",
      "Government fees are paid upfront before application submission.",
      "All payments are non-refundable once the application has been submitted to the authorities.",
      "Payments can be made in cash, card, bank transfer, PayPal, etc.",
    ],
    disclaimerIntro: "Important notes for the Residency Permit procedure:",
    disclaimers: [
      "All residency decisions are made exclusively by Albanian authorities; our office cannot influence the outcome.",
      "Processing times are estimated and may vary based on institutional workload.",
      "Authorities may request additional documents or clarifications at any stage.",
      "Our office is not responsible for delays or decisions made by the authorities.",
    ],
    nextSteps: [
      "Execution of the service agreement and initial payment.",
      "Documents collection and preparation.",
      "Residency Permit application submission.",
      "Follow-up with the authorities until the final decision.",
      "Biometric fingerprints appointment and Residency Permit Card collection.",
    ],
  };
}

function buildEmployment(
  clientName: string,
  fields: Partial<ProposalFields>,
  _c: Conditions
): TemplateData {
  return {
    svcKey: "visa_d",
    serviceTitle: "Type D Visa & Residence Permit for Employment",
    contactBar: "relocate",
    caseOverviewSections: [
      {
        sectionTitle: "Client Details",
        rows: [
          { label: "Name", value: clientName },
          { label: "Nationality", value: fields.nationality || "-" },
          { label: "Occupation", value: fields.employmentType || "-" },
          { label: "Relocation motive", value: "Employment" },
        ],
      },
    ],
    scopeIntro: "Services related to the Visa and Residency Permit procedure:",
    scopeBullets: [
      "Full legal guidance during the entire application process",
      "Pre-check and verification of all documents",
      "Assistance with translations, notarization, and legalization if required",
      "Preparing all declarations required by the authorities",
      "Payment of government or third-party fees",
      "Completing the visa and residence permit applications",
      "Scheduling all appointments with the relevant institutions",
      "Submission of applications at the competent authorities",
      "Follow-up with authorities until final approval",
      "Assistance with Civil Registry address registration",
      "Accompanying the applicant for biometric fingerprints",
      "Guidance until the applicant receives the final residence permit card",
    ],
    processSteps: [
      {
        stepTitle: "Type D Visa Processing",
        bullets: [
          "Issuing Power of Attorney (if needed)",
          "Preparation of employment contract",
          "Preparation of accommodation proof (contract or declaration)",
          "Documents collection and preparation (see below)",
          "Visa and Residency Permit Government Fees payment by us",
          "Visa application submission",
          "Decision on the visa approval",
        ],
      },
      {
        stepTitle: "Residency Permit Processing",
        bullets: [
          "As soon as your visa is approved and you enter the Albanian border, the Residency Permit procedure starts automatically",
          "Delivering original documents and the Residency Permit application at the Local Directorate for Border and Migration",
          "Receiving the Provisional Residency Permit",
          "Final Decision on Residency Permit",
          "Address Registration at the Civil Registry Office",
          "Application for biometric Residency Permit Card",
          "Obtaining the biometric residence card",
        ],
      },
    ],
    docSections: [
      {
        heading: "For the Type D Visa Application (Employee)",
        items: [
          "Passport-size photograph (47mm x 36mm, not older than 6 months, white background) - provided by the applicant",
          "Photocopy of valid travel document (valid at least 3 months beyond the visa period, with at least 2 blank pages) - provided by the applicant",
          "Document certifying accommodation in Albania - notarized rental contract or hosting declaration",
          "Document proving professional or commercial activity in the applicant's country - provided by the applicant",
          "Residence Permit >12 months from country of residence (if residing in a third country), valid 3+ additional months",
          "Document proving the legal status of the inviting entity - we obtain from the accountant",
          "Invitation signed by the host - we prepare it, you sign it",
          "Employment contract drawn up according to the Albanian Labor Code - we prepare the contract",
        ],
      },
      {
        heading: "For the Residency Permit Application (Employee)",
        items: [
          "Photocopy of valid travel document (valid at least 3 months beyond the permit period, with at least 2 blank pages)",
          "Proof of Residency Permit Government Fee Payment - we pay at the bank and provide the mandate",
          "Passport-size photograph (47mm x 36mm) - two printed copies and a digital copy sent via email",
          "Proof of accommodation in Albania - notarized rental contract",
          "Employment contract drawn up according to the Albanian Labor Code - we prepare the contract",
          "Proof of professional qualification (diploma/certificate/reference) or self-declaration - provided by the applicant",
        ],
      },
    ],
    timeline: [
      "Documents preparation: approx. 3-5 business days",
      "Visa processing: approx. 15-30 business days",
      "Residency Permit: approx. 30-45 business days",
      "Residency Permit ID Card: approx. 2 calendar weeks",
    ],
    paymentTerms: [
      "50% of the service fee is payable upon contract signing / file opening.",
      "30% is payable after visa issuance and before submission of the residency permit application.",
      "20% is payable upon approval of the residency permit and before fingerprint appointment for the ID card.",
      "Government fees and additional costs are paid upfront with the initial 50%.",
      "All payments are non-refundable once the application has been submitted to the authorities.",
      "Payments can be made in cash, card, bank transfer, PayPal, etc.",
    ],
    disclaimerIntro: "Important notes for the Visa and Residency Permit procedure:",
    disclaimers: [
      "The applicant must be outside Albanian territory when the visa application is submitted.",
      "As soon as the visa is approved, the applicant must enter Albania for the Residency Permit procedure to start.",
      "The applicant can begin working legally once the visa is issued, even while the residency permit is pending.",
      "All visa and residency decisions are made exclusively by Albanian authorities.",
      "Processing times are estimated and may vary based on institutional workload.",
      "Authorities may request additional documents or clarifications at any stage.",
    ],
    nextSteps: [
      "Execution of the service agreement and initial payment.",
      "Documents collection and preparation.",
      "Visa application submission.",
      "Residency Permit application submission after visa approval.",
      "Follow-up with the authorities until the final decision.",
      "Biometric fingerprints appointment and Residency Permit Card collection.",
    ],
  };
}

function buildCompany(
  clientName: string,
  fields: Partial<ProposalFields>,
  _c: Conditions
): TemplateData {
  return {
    svcKey: "company_formation",
    serviceTitle:
      "Company Registration & Management + Type D Visa & Residence Permit (Self-Employed)",
    contactBar: "relocate",
    caseOverviewSections: [
      {
        sectionTitle: "Main Applicant",
        rows: [
          { label: "Name", value: clientName },
          { label: "Nationality", value: fields.nationality || "-" },
          { label: "Occupation", value: fields.employmentType || "-" },
          { label: "Relocation motive", value: "Self-Employment / Company Registration" },
        ],
      },
    ],
    scopeIntro: undefined,
    scopeBullets: [
      "COMPANY FORMATION",
      "Legal consultation and company structure planning",
      "Selection and reservation of the company name",
      "Drafting of the Founding Act and Company Statute",
      "Registration of the company with the National Business Center (QKB)",
      "Issuance of company registration certificate and NUIS (tax number)",
      "Registration with the tax authorities (VAT and contributions if applicable)",
      "Assistance with opening a corporate bank account",
      "Preparation of company documentation required for residency permit purposes",
      "VISA & RESIDENCY PERMIT",
      "Full legal guidance during the entire application process",
      "Pre-check and verification of all documents",
      "Assistance with translations, notarization, and legalization if required",
      "Preparing all declarations required by the authorities",
      "Completing the visa and residence permit applications",
      "Scheduling all appointments with the relevant institutions",
      "Submission of applications at the Migration Office",
      "Follow-up with authorities until final approval",
      "Assistance with Civil Registry address registration",
      "Accompanying the applicant for biometric fingerprints",
      "Guidance until the applicant receives the final residence permit card",
      "Payment of government or third-party fees",
      "Documents translation, apostille/legalization, or notary",
    ],
    processSteps: [
      {
        stepTitle: "Company Formation",
        bullets: [
          "Issuing Power of Attorney",
          "Registration documents preparation",
          "Company registration submission at QKB",
          "Obtaining TAX ID / NIPT",
          "Obtaining Registration Certificate",
          "Employee declaration",
        ],
      },
      {
        stepTitle: "Visa & Residency Permit (Self-Employed)",
        bullets: [
          "Documents collection and preparation (see below)",
          "Visa and Residency Permit Government Fees payment by us",
          "Visa application submission",
          "Decision on the visa approval",
          "Entry into Albania - Residency Permit procedure starts automatically",
          "Residency Permit application submission at the Local Directorate for Border and Migration",
          "Receiving the Provisional Residency Permit",
          "Final Decision on Residency Permit",
          "Address Registration at the Civil Registry Office",
          "Application for biometric Residency Permit Card",
          "Obtaining the biometric residence card",
        ],
      },
    ],
    docSections: [
      {
        heading: "For Company Registration",
        items: [
          "For shareholder(s) and administrator(s): valid passport copy, contact details, and residential address (foreign address)",
          "Corporate & Legal documentation: company name proposal, description of business activity, administrator appointment details, shareholding structure, company address in Albania",
          "If registration is done remotely: Power of Attorney (notarized and legalized/apostilled)",
        ],
      },
      {
        heading: "For the Type D Visa (Self-Employed)",
        items: [
          "Passport-size photograph (47mm x 36mm, not older than 6 months, white background)",
          "Photocopy of valid travel document (valid at least 3 months beyond the visa period, with at least 2 blank pages)",
          "Certification of professional capacity related to self-employment (diploma, certificate, qualifications)",
          "Business Registration Certificate - we provide it upon company registration",
          "Document certifying accommodation in Albania (rental contract or declaration)",
          "Residence Permit >12 months from country of residence (if living in a third country), with at least 3 additional months validity",
          "Full bank statement showing money in/out for the last 12 months",
        ],
      },
      {
        heading: "For the Residency Permit (Self-Employed / Business Owner)",
        items: [
          "Photocopy of valid travel document (valid at least 3 months beyond the permit period, with at least 2 blank pages)",
          "Project idea for the business/activity (minimum elements per the National Employment and Labor Agency) - we prepare it",
          "Document proving sufficient financial means (not less than 500,000 ALL or equivalent) - we open the bank account; you make the deposit",
          "Document proving necessary skills (certificate, diploma, or equivalent)",
          "Proof of registration of the activity in QKB - we provide it upon company registration",
          "Payment mandate for government fee - we pay and provide the document",
          "Passport-size photograph (47mm x 36mm, taken within the last 6 months)",
          "Proof of accommodation in Albania - rental contract",
        ],
      },
    ],
    timeline: [
      "Company registration: approx. 3-5 business days",
      "Visa processing: approx. 15-30 business days",
      "Residency Permit: approx. 30-45 business days",
      "Residency Permit ID Card: approx. 2 calendar weeks",
    ],
    paymentTerms: [
      "50% of the service fee is payable upon contract signing / file opening.",
      "50% is payable before submission of the residency permit application.",
      "Government fees are paid upfront before application submission.",
      "All payments are non-refundable once the application has been submitted to the authorities.",
      "Payments can be made in cash, card, bank transfer, PayPal, etc.",
    ],
    disclaimerIntro: "Important compliance notes for Company Management:",
    disclaimers: [
      "The company must have a registered business address in Albania (virtual office available through our office).",
      "A licensed accountant is mandatory.",
      "Applicable taxes: corporate income tax, VAT (if applicable), local municipal taxes.",
      "Social and health contributions must be paid for each employee; monthly and annual declarations are mandatory.",
      "The company must remain active and compliant to support residence permit validity and renewals.",
      "The applicant must be outside Albanian territory when the visa application is submitted.",
      "All visa and residency decisions are made exclusively by Albanian authorities.",
    ],
    nextSteps: [
      "Execution of the service agreement and initial payment.",
      "Documents collection and preparation.",
      "Company Registration submission.",
      "Visa and Residency Permit application submission.",
      "Follow-up with the authorities until the final decision.",
      "Biometric fingerprints appointment and Residency Permit Card collection.",
    ],
  };
}

function buildRealEstate(
  clientName: string,
  fields: Partial<ProposalFields>,
  c: Conditions
): TemplateData {
  const propDesc = fields.propertyDescription || "the property";
  const txValue = fields.transactionValueEUR
    ? `EUR ${Number(fields.transactionValueEUR).toLocaleString()}`
    : "";
  const year = fields.propertyCompletionYear || "the scheduled year";
  const offPlan = c.is_off_plan;

  return {
    svcKey: "real_estate",
    serviceTitle: offPlan
      ? "Off-Plan Real Estate Investment in Albania"
      : "Real Estate Purchase Assistance in Albania",
    contactBar: "dafku",
    caseOverviewSections: [
      {
        sectionTitle: "Property & Transaction",
        rows: [
          { label: "Client", value: clientName },
          { label: "Property", value: propDesc },
          ...(txValue ? [{ label: "Estimated Value", value: txValue }] : []),
          {
            label: "Status",
            value: offPlan
              ? `Under construction - expected completion ${year}`
              : "Ready / Completed",
          },
        ],
      },
    ],
    scopeIntro: offPlan
      ? `Comprehensive legal assistance for the purchase of ${propDesc}${txValue ? ` (estimated value: ${txValue})` : ""}. Given the off-plan nature, the engagement includes both transactional legal support and ongoing legal monitoring until final handover and ownership registration.`
      : `Comprehensive legal assistance for the purchase of ${propDesc}${txValue ? ` (estimated value: ${txValue})` : ""}, ensuring full legal compliance, protection of the Client's interests, and proper transfer and registration of ownership.`,
    scopeBullets: [
      "Verification of ownership title and registration through the Albanian State Cadastre (ASHK)",
      "Review of the construction permit and approved project documentation",
      "Legal due diligence: encumbrances, liens, mortgages, seizures, and restrictions",
      "Verification of the developer's legal status and right to pre-sell",
      "Legal review and negotiation of reservation agreements and preliminary Sale & Purchase Agreements",
      "Review of contractual clauses: deadlines, penalties, payment schedules, termination rights",
      "Representation and coordination with the real estate agency, developer, notary, and authorities",
      "Legal presence and assistance during notarial signing",
      "Payment coordination and legal safeguards",
      "Follow-up and registration of ownership with ASHK after completion",
      ...(offPlan
        ? [
            "Ongoing legal monitoring throughout the construction period",
            `Legal oversight until project completion, handover, and ownership registration (expected: ${year})`,
          ]
        : []),
    ],
    processSteps: [
      {
        stepTitle: "Legal Due Diligence & Project Verification",
        bullets: [
          "Verification of ownership title through ASHK",
          "Review of construction permit and approved project documentation",
          "Examination of the developer's legal status and authority to pre-sell",
          "Check for encumbrances or restrictions affecting the land or project",
          "Consistency check between contractual documentation and factual project status",
          "Legal risk assessment related to construction timelines and buyer safeguards",
        ],
      },
      {
        stepTitle: "Contractual Documentation & Notarial Assistance",
        bullets: [
          "Legal review and/or drafting of reservation agreements and preliminary Sale & Purchase Agreements",
          "Detailed review of clauses: construction deadlines, payment schedules, penalties, termination rights",
          "Legal coordination and negotiation with the developer, real estate agency, and notary",
          "Legal review of notarial deeds prior to execution and legal presence during signing",
          "Payment coordination and guidance on legally compliant payment methods",
        ],
      },
      ...(offPlan
        ? [
            {
              stepTitle: `Long-Term Legal Monitoring Until Completion (${year})`,
              bullets: [
                "Ongoing legal availability for advisory support related to the contractual relationship",
                "Review of communications, notices, or updates issued by the developer",
                "Legal advice and intervention in cases of construction delays or non-compliance",
                `Coordination until final handover, delivery of keys, and ownership registration (expected: ${year})`,
              ],
            },
          ]
        : []),
    ],
    docSections: [
      {
        heading: "Required Documentation from the Client",
        items: [
          "Valid identification document (ID / Passport)",
          "Available project-related documentation if any (reservation or preliminary contracts)",
          "Payment method details",
          "Power of Attorney (if representation is required)",
        ],
      },
    ],
    timeline: [
      "Legal due diligence & document verification: approx. 5-10 business days",
      "Contract review & coordination: approx. 5-10 business days",
      "Notarial execution: subject to parties' availability",
      ...(offPlan
        ? [
            `Construction completion & handover: expected in ${year}`,
            "Ownership registration after completion: approx. 15-30 business days",
          ]
        : ["Ownership registration: approx. 15-30 business days"]),
    ],
    paymentTerms: [
      "50% payable upon signing of the engagement agreement.",
      "50% payable prior to notarial execution of the contractual documentation.",
      "Third-party and government costs are payable separately and in advance.",
      "Legal fees are non-refundable once services have commenced.",
      "Payments accepted via bank transfer, cash, card, PayPal, or other agreed methods.",
      ...(offPlan
        ? [
            `Phase 2 Monitoring Retainer: EUR 50 per month, payable monthly or quarterly in advance, from contract execution until project completion and registration in ${year}.`,
          ]
        : []),
    ],
    disclaimerIntro: "Important notes for the Real Estate transaction:",
    disclaimers: [
      "Services are based on documentation provided by the Client and third parties.",
      ...(offPlan
        ? ["The Firm does not guarantee construction timelines or third-party performance."]
        : []),
      "Public authorities may request additional documentation at any stage.",
      "Legal fees exclude government, notary, and third-party costs unless explicitly stated.",
      ...(offPlan
        ? ["Hourly rate for out-of-scope services (disputes, litigation): EUR 100 / hour."]
        : []),
    ],
    nextSteps: [
      "Execution of the legal services engagement agreement.",
      "Payment of the initial legal fee.",
      "Commencement of legal due diligence.",
      "Contract review and coordination.",
      "Notarial assistance and payment coordination.",
      ...(offPlan
        ? [
            `Ongoing legal monitoring until project completion (expected: ${year}).`,
            "Completion upon issuance of ownership documentation in the Client's name.",
          ]
        : ["Completion upon issuance of ownership documentation in the Client's name."]),
    ],
  };
}

function buildTemplate(
  svc: ServiceType,
  clientName: string,
  fields: Partial<ProposalFields>,
  c: Conditions
): TemplateData | null {
  switch (svc) {
    case "residency_pensioner":
      return buildPensioner(clientName, fields, c);
    case "visa_d":
      return buildEmployment(clientName, fields, c);
    case "company_formation":
      return buildCompany(clientName, fields, c);
    case "real_estate":
      return buildRealEstate(clientName, fields, c);
    default:
      return null;
  }
}

// --- Component ---

interface ProposalRendererProps {
  clientName: string;
  clientId: string;
  services: ServiceType[];
  fields: Partial<ProposalFields>;
  innerRef?: React.RefObject<HTMLDivElement>;
}

export default function ProposalRenderer({
  clientName,
  clientId,
  services,
  fields,
  innerRef,
}: ProposalRendererProps) {
  const svcs = (services || []) as ServiceType[];
  const conditions = evaluateConditions(fields);

  const templates: TemplateData[] = svcs
    .map((s) => buildTemplate(s, clientName, fields, conditions))
    .filter((t): t is TemplateData => t !== null);

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

  const displayDate = fields.proposalDate
    ? new Date(fields.proposalDate)
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
        .replace(/\//g, ".")
    : new Date().toLocaleDateString("en-GB").replace(/\//g, ".");

  const allNextSteps = Array.from(
    new Set(templates.flatMap((t) => t.nextSteps))
  );

  const usesRelocate = templates.some((t) => t.contactBar === "relocate");

  if (templates.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-10 text-center text-sm text-gray-400">
        No services selected. Please select at least one service for this customer.
      </div>
    );
  }

  let globalStep = 0;

  return (
    <div
      ref={innerRef}
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      className="bg-white text-gray-900 text-[13px] leading-relaxed"
    >
      {/* ===== COVER ===== */}
      <div className="px-12 pt-10 pb-8 border-b">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400 mb-1">
            {usesRelocate ? "Relocate Albania" : "DAFKU Law Firm"}
          </p>
          <h1 className="text-[22px] font-bold uppercase tracking-widest text-gray-800 mb-1">
            Service Proposal
          </h1>
          <p className="text-sm text-gray-500">
            Presented to: <span className="font-semibold text-gray-700">{clientName}</span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Ref: {clientId}</p>
        </div>

        {/* Services box */}
        <div className="border border-gray-200 rounded p-4 mb-4 bg-gray-50">
          <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">
            Services Covered
          </p>
          {templates.map((t, i) => (
            <p key={i} className="text-sm font-medium text-gray-800 leading-snug mb-1">
              {templates.length > 1 ? `${i + 1}. ` : ""}{t.serviceTitle}
            </p>
          ))}
        </div>

        {/* Date & contact */}
        <div className="flex items-center justify-between text-xs text-gray-400 mt-4">
          <span>Date: {displayDate}</span>
          {usesRelocate ? (
            <span>info@relocateto.al &bull; www.relocateto.al</span>
          ) : (
            <span>info@dafkulawfirm.al &bull; www.dafkulawfirm.al</span>
          )}
        </div>
      </div>

      {/* ===== PER-SERVICE SECTIONS ===== */}
      {templates.map((tpl, ti) => {
        const prefix = templates.length > 1 ? `Part ${ti + 1} \u2013 ` : "";
        return (
          <React.Fragment key={tpl.svcKey}>
            <div className="px-12 py-8 border-b">

              {/* Service heading (only when multiple services) */}
              {templates.length > 1 && (
                <h2 className="text-base font-bold uppercase tracking-wide text-gray-700 border-b border-gray-200 pb-2 mb-6">
                  {prefix}{tpl.serviceTitle}
                </h2>
              )}

              {/* 1. Case Overview */}
              <section className="mb-7">
                <h3 className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-3">
                  1. Case Overview
                </h3>
                {tpl.caseOverviewSections.map((sec, si) => (
                  <div key={si} className={si > 0 ? "mt-4" : ""}>
                    {sec.sectionTitle && (
                      <p className="text-xs font-semibold text-gray-600 mb-1.5">
                        {sec.sectionTitle}
                      </p>
                    )}
                    <table className="w-full text-sm border-collapse">
                      <tbody>
                        {sec.rows.map((r, ri) => (
                          <tr key={ri} className="border-b border-gray-100 last:border-0">
                            <td className="py-1.5 pr-6 text-gray-400 w-40 align-top text-xs uppercase tracking-wide">
                              {r.label}
                            </td>
                            <td className="py-1.5 text-gray-800">{r.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </section>

              {/* 2. Scope of Work */}
              <section className="mb-7">
                <h3 className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-3">
                  2. Scope of Work
                </h3>
                {tpl.scopeIntro && (
                  <p className="text-sm text-gray-700 mb-3 leading-relaxed">{tpl.scopeIntro}</p>
                )}
                <ul className="space-y-1">
                  {tpl.scopeBullets.map((b, bi) => {
                    const isHeading =
                      b === b.toUpperCase() && b.length > 3 && !b.startsWith("-");
                    return isHeading ? (
                      <li key={bi} className="pt-3 pb-0.5 text-xs font-bold uppercase tracking-wider text-gray-500 list-none">
                        {b}
                      </li>
                    ) : (
                      <li key={bi} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-gray-300 mt-0.5 shrink-0">&#8211;</span>
                        <span>{b}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* 3. Process */}
              {tpl.processSteps.length > 0 && (
                <section className="mb-7">
                  <h3 className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-3">
                    3. Process
                  </h3>
                  {tpl.processSteps.map((step, si) => {
                    globalStep += 1;
                    return (
                      <div key={si} className="mb-5">
                        <p className="text-sm font-semibold text-gray-800 mb-2">
                          <span className="inline-block bg-gray-800 text-white text-[10px] uppercase tracking-wider px-2 py-0.5 rounded mr-2">
                            Step {globalStep}
                          </span>
                          {step.stepTitle}
                        </p>
                        <ul className="space-y-1 pl-2">
                          {step.bullets.map((b, bi) => (
                            <li key={bi} className="flex gap-2 text-sm text-gray-700">
                              <span className="text-gray-300 mt-0.5 shrink-0">&#8211;</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </section>
              )}

              {/* 4. Required Documents */}
              {tpl.docSections.length > 0 && (
                <section className="mb-7">
                  <h3 className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-3">
                    4. Required Documents
                  </h3>
                  {tpl.docSections.map((sec, si) => (
                    <div key={si} className={si > 0 ? "mt-4" : ""}>
                      {sec.heading && (
                        <p className="text-xs font-semibold text-gray-600 mb-1.5">
                          {sec.heading}
                        </p>
                      )}
                      <ul className="space-y-1">
                        {sec.items.map((item, ii) => (
                          <li key={ii} className="flex gap-2 text-sm text-gray-700">
                            <span className="text-gray-300 mt-0.5 shrink-0">&#8211;</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              )}

              {/* 5. Timeline */}
              {tpl.timeline.length > 0 && (
                <section className="mb-7">
                  <h3 className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-3">
                    5. Timeline Overview
                  </h3>
                  <ul className="space-y-1">
                    {tpl.timeline.map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-gray-300 mt-0.5 shrink-0">&#8211;</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 6. Important Notes / Disclaimers */}
              {tpl.disclaimers.length > 0 && (
                <section>
                  <h3 className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-3">
                    6. Important Notes
                  </h3>
                  {tpl.disclaimerIntro && (
                    <p className="text-xs text-gray-500 italic mb-2">{tpl.disclaimerIntro}</p>
                  )}
                  <ul className="space-y-1">
                    {tpl.disclaimers.map((d, di) => (
                      <li key={di} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-gray-300 mt-0.5 shrink-0">&#8211;</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </React.Fragment>
        );
      })}

      {/* ===== FEES ===== */}
      <div className="px-12 py-8 border-b">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-4">
          Professional Fees
        </h3>
        <table className="w-full text-sm border-collapse mb-3">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 text-gray-500 font-normal text-xs uppercase tracking-wide">
                Description
              </th>
              <th className="text-right py-2 text-gray-500 font-normal text-xs uppercase tracking-wide">
                ALL
              </th>
              <th className="text-right py-2 text-gray-500 font-normal text-xs uppercase tracking-wide">
                EUR
              </th>
            </tr>
          </thead>
          <tbody>
            {consultationFee > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-2">Consultation Fee</td>
                <td className="text-right py-2 font-mono">{consultationFee.toLocaleString()}</td>
                <td className="text-right py-2 font-mono">{fmt(consultationFee * EUR_RATE)}</td>
              </tr>
            )}
            {serviceFee > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-2">Service Fee</td>
                <td className="text-right py-2 font-mono">{serviceFee.toLocaleString()}</td>
                <td className="text-right py-2 font-mono">{fmt(serviceFee * EUR_RATE)}</td>
              </tr>
            )}
            {serviceFeeSubtotal > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-2 text-gray-500 text-xs">Service Subtotal</td>
                <td className="text-right py-2 font-mono text-gray-500 text-xs">
                  {serviceFeeSubtotal.toLocaleString()}
                </td>
                <td className="text-right py-2 font-mono text-gray-500 text-xs">
                  {fmt(serviceFeeSubtotal * EUR_RATE)}
                </td>
              </tr>
            )}
            {poaFee > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-2">Power of Attorney</td>
                <td className="text-right py-2 font-mono">{poaFee.toLocaleString()}</td>
                <td className="text-right py-2 font-mono">{fmt(poaFee * EUR_RATE)}</td>
              </tr>
            )}
            {translationFee > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-2">Translation</td>
                <td className="text-right py-2 font-mono">{translationFee.toLocaleString()}</td>
                <td className="text-right py-2 font-mono">{fmt(translationFee * EUR_RATE)}</td>
              </tr>
            )}
            {otherFees > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-2">Other Fees</td>
                <td className="text-right py-2 font-mono">{otherFees.toLocaleString()}</td>
                <td className="text-right py-2 font-mono">{fmt(otherFees * EUR_RATE)}</td>
              </tr>
            )}
            {totalALL > 0 && (
              <tr className="border-t-2 border-gray-800">
                <td className="py-2.5 font-bold">Total</td>
                <td className="text-right py-2.5 font-bold font-mono">
                  {totalALL.toLocaleString()} ALL
                </td>
                <td className="text-right py-2.5 font-bold font-mono">{fmt(totalEUR)} EUR</td>
              </tr>
            )}
          </tbody>
        </table>
        {totalALL > 0 && (
          <p className="text-xs text-gray-400">
            Also approximately USD {fmt(totalUSD)} &bull; GBP {fmt(totalGBP)} at indicative rates.
          </p>
        )}
        {fields.additionalCostsNote && (
          <p className="text-sm text-gray-600 italic mt-2">{fields.additionalCostsNote}</p>
        )}
      </div>

      {/* ===== PAYMENT TERMS ===== */}
      <div className="px-12 py-8 border-b">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-4">
          Payment Terms
        </h3>
        {templates.map((tpl, ti) => (
          <div key={tpl.svcKey} className={ti > 0 ? "mt-5" : ""}>
            {templates.length > 1 && (
              <p className="text-xs font-semibold text-gray-600 mb-2">{tpl.serviceTitle}</p>
            )}
            <ul className="space-y-1">
              {tpl.paymentTerms.map((pt, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-gray-300 mt-0.5 shrink-0">&#8211;</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {fields.paymentTermsNote && (
          <p className="text-sm text-gray-600 italic mt-3">{fields.paymentTermsNote}</p>
        )}
      </div>

      {/* ===== NEXT STEPS ===== */}
      <div className="px-12 py-8 border-b">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-4">
          Next Steps
        </h3>
        <ul className="space-y-1">
          {allNextSteps.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-gray-400 font-mono text-xs mt-0.5 w-4 shrink-0">
                {i + 1}.
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ===== FOOTER ===== */}
      <div className="px-12 py-6 text-center text-xs text-gray-400 space-y-1">
        <p className="font-medium text-gray-500">
          DAFKU Law Firm &bull; Relocate Albania
        </p>
        <p>Tirana &bull; Durres, Albania</p>
        <p>info@dafkulawfirm.al &bull; info@relocateto.al</p>
        <p className="pt-1 italic">
          This proposal is confidential and valid for 30 days from the date of issue.
        </p>
      </div>
    </div>
  );
}

