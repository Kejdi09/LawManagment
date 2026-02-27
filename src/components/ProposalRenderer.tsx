/**
 * ProposalRenderer
 * Structured proposal engine that faithfully renders the content from the 4 DOCX
 * templates (Pensioner, Employment, Company Formation, Real Estate).
 *
 * Supports single-service rendering AND multi-service merging:
 *   - Each service contributes its own sections (scope, process, docs, etc.)
 *   - Sections are merged sequentially into ONE final document
 *   - Conditional sections (has_spouse, is_off_plan) are evaluated centrally
 *
 * Used by ProposalModal (admin preview) and ClientPortal (customer view).
 */
import React from "react";
import { ServiceType, ProposalFields, SERVICE_LABELS } from "@/lib/types";
import { evaluateConditions, Conditions } from "@/lib/proposal-engine";

// â”€â”€â”€ Currency rates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const EUR_RATE = 0.01037032;
export const USD_RATE = 0.01212463;
export const GBP_RATE = 0.00902409;
export function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// â”€â”€â”€ Template data model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CaseOverviewSection {
  sectionTitle?: string;
  rows: Array<{ label: string; value: string }>;
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

// â”€â”€â”€ Per-service data builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildPensioner(clientName: string, fields: Partial<ProposalFields>, c: Conditions): TemplateData {
  const dep = c.has_spouse;
  return {
    svcKey: "residency_pensioner",
    serviceTitle: dep
      ? "Residence Permit for Pensioner\n+\nResidence Permit for Family Reunification"
      : "Residence Permit for Pensioner",
    contactBar: "relocate",
    caseOverviewSections: [
      {
        sectionTitle: "Main Applicant:",
        rows: [
          { label: "Name", value: clientName },
          { label: "Nationality", value: fields.nationality || "â€”" },
          { label: "Occupation", value: fields.employmentType || "â€”" },
          { label: "Relocation motive", value: "Pensioner" },
        ],
      },
      ...(dep ? [{
        sectionTitle: "Dependent (Wife):",
        rows: [
          { label: "Name", value: fields.dependentName || "â€”" },
          { label: "Nationality", value: fields.dependentNationality || "â€”" },
          { label: "Occupation", value: fields.dependentOccupation || "â€”" },
          { label: "Relocation motive", value: "Family Reunification" },
        ],
      }] : []),
    ],
    scopeIntro: "Services related to Residency Permit procedure:",
    scopeBullets: [
      "Full legal guidance during the entire application process",
      "Pre-check and verification of all documents",
      "Assistance with translations, notarization, and legalization if required",
      "Preparing all declarations required by the authorities",
      "Completing the residence permit applications",
      "Scheduling all appointments with the relevant institutions",
      "Submission of the applications at the Local Directorate for Border and Migration",
      "Follow-up with the authorities until the final approval",
      "Assistance with the Civil Registry address registration",
      "Accompanying the applicant for biometric fingerprints",
      "Guidance until the applicant receives the final residence permit card",
      "Payment of government or third-party fees on behalf of the applicant",
      "Documents translation, apostille/legalization, or notary (if needed)",
    ],
    processSteps: [
      {
        stepTitle: "Residency Permit for the Main Applicant â€“ Pensioner",
        bullets: [
          "Documents collection and preparation (see below)",
          "Government Fees payment by us",
          "Residency Permit Application Submission at the Local Directorate for Border and Migration in DurrÃ«s",
          "Receiving Provisional Residency Permit",
          "Final Decision on Residency Permit",
          "Address Registration at Civil Registry Office",
          "Application for biometric Residency Permit Card",
          "Obtaining the biometric residence card",
        ],
      },
      ...(dep ? [{
        stepTitle: "Residency Permit for Dependent â€“ Family Reunification",
        bullets: [
          "Same procedure as in first step",
          "Submitted after the main applicant's Residency Permit is granted",
        ],
      }] : []),
    ],
    docSections: [
      {
        heading: "For the Main Applicant (Pensioner):",
        items: [
          "Photocopy of the valid travel document (valid for at least 3 months beyond the permit period, with at least 2 blank pages) â€” Provided by the Applicant",
          "Individual declarations for the reason for staying in Albania â€” We prepare in Albanian and English; you sign",
          "Proof of insurance in Albania â€” We arrange at our associate insurance company",
          "Evidence from a bank in Albania for the transfer of pension income â€” We support with bank account opening",
          "Legalized criminal record from the country of origin (issued within the last 6 months, translated and notarized) â€” We handle",
          "Evidence of annual pension income exceeding 1,200,000 ALL â€” We handle legal translation and notary",
          "Proof of Residency Permit Government Fee Payment â€” We pay at the bank and provide the mandate",
          "Passport-size photograph (47mm Ã— 36mm, taken within the last 6 months, white background, neutral expression, eyes open)",
          "Proof of accommodation in Albania â€” residential rental contract in accordance with Albanian standards",
        ],
      },
      ...(dep ? [{
        heading: "For the Dependent (Family Reunification) â€” after main permit is granted:",
        items: [
          "Photocopy of the valid travel document (same requirements as main applicant) â€” Provided by the Applicant",
          "Marriage certificate (issued within the last 6 months, legalized, translated and notarized if not issued in Albania) â€” We handle",
          "Proof of insurance in Albania â€” We arrange at our associate insurance company",
          "Copy of the main applicant's residence permit in Albania",
          "Proof of Residency Permit Government Fee Payment â€” We pay at the bank and provide the mandate",
          "Passport-size photograph (47mm Ã— 36mm, taken within the last 6 months) â€” Two printed copies and a digital copy emailed to us",
          "Proof of accommodation in Albania â€” residential rental contract",
          "Evidence of sufficient financial resources during the stay in Albania â€” We handle legal translation and notary",
        ],
      }] : []),
    ],
    timeline: [
      "Preparation and application submission â€” 3â€“5 business days",
      "Provisional Residency Permit â€” approx. 10â€“15 business days",
      "Final Decision on Residency Permit â€” approx. 30â€“45 business days",
      "Residency Permit Card issue â€” approx. 2 calendar weeks",
    ],
    paymentTerms: [
      "50% of the service fee is payable upon contract signing / file opening.",
      dep
        ? "50% is payable before submission of the residency permit application for family reunification for the dependent."
        : "50% is payable before submission of the residency permit application.",
      "Government fees are paid upfront before application submission.",
      "All payments are non-refundable once the application has been submitted to the authorities.",
      "Payments can be made in cash, card, bank transaction, PayPal, etc.",
    ],
    disclaimerIntro: "For Residency Permit procedure:",
    disclaimers: [
      "All residency decisions are made exclusively by Albanian authorities; our office cannot influence the outcome.",
      "Processing times are estimated and may vary based on internal procedures or workload.",
      "Authorities may request additional documents or clarifications at any stage.",
      "Our office is not responsible for delays or decisions made by the authorities.",
    ],
    nextSteps: [
      "Prepare a service agreement and request signature from your side.",
      "Make payments as agreed upon agreement signing.",
      "Documents collection and preparation.",
      "Residency Permit application submission at the Local Directorate for Border and Migration.",
      "Follow-up with the authorities until the final decision.",
      "Biometric fingerprints appointment and Residency Permit Card collection.",
    ],
  };
}

function buildEmployment(clientName: string, fields: Partial<ProposalFields>, _c: Conditions): TemplateData {
  return {
    svcKey: "visa_d",
    serviceTitle: "Type D Visa & Residence Permit for Employees",
    contactBar: "relocate",
    caseOverviewSections: [{
      sectionTitle: "Client details:",
      rows: [
        { label: "Name", value: clientName },
        { label: "Nationality", value: fields.nationality || "â€”" },
        { label: "Occupation", value: fields.employmentType || "â€”" },
        { label: "Staff Relocation motive", value: "Employment" },
      ],
    }],
    scopeIntro: "Services related to Visa and Residency Permit procedure:",
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
          "Preparation of Accommodation proof (contract or declaration)",
          "Documents collection and preparation (see below)",
          "Visa and Residency Permit Government Fees payment by us",
          "Visa application submission",
          "Decision on the visa approval",
        ],
      },
      {
        stepTitle: "Residency Permit Processing",
        bullets: [
          "As soon as your visa is approved and you enter the Albanian border, the Residency Permit procedures start automatically",
          "Delivering the original documents and the Residency Permit application at the Local Directorate for Border and Migration",
          "Receiving Provisional Residency Permit",
          "Final Decision on Residency Permit",
          "Address Registration at Civil Registry Office",
          "Application for biometric Residency Permit Card",
          "Obtaining the biometric residence card",
        ],
      },
    ],
    docSections: [
      {
        heading: "For the Type D Visa Application (Employee):",
        items: [
          "Passport-size photograph (47mm Ã— 36mm, not older than 6 months, white background, neutral expression) â€” Provided by the applicant",
          "Photocopy of the valid travel document (valid at least 3 months longer than the required visa period, with at least 2 blank pages) â€” Provided by the applicant",
          "Document certifying accommodation in Albania â€” A notarized rental contract or a hosting declaration",
          "Document proving professional or commercial activity in the applicant's country related to the visa motives â€” Provided by the applicant",
          "Residence Permit >12 months from country of residence (if residing in a different country), valid 3+ additional months",
          "Document proving the legal status of the inviting entity â€” We obtain from the accountant",
          "Invitation signed by the host â€” We prepare it, you sign it",
          "Employment contract drawn up according to the Albanian Labor Code â€” We prepare the contract",
        ],
      },
      {
        heading: "For the Residency Permit Application (Employee):",
        items: [
          "Photocopy of the valid travel document (valid at least 3 months longer than the permit period, with at least 2 blank pages)",
          "Proof of Residency Permit Government Fee Payment â€” We pay at the bank and provide the mandate",
          "Passport-size photograph (47mm Ã— 36mm) â€” Two printed copies and a digital copy sent via email",
          "Proof of accommodation in Albania â€” A notarized rental contract",
          "Employment contract drawn up according to the Albanian Labor Code â€” We prepare the contract",
          "Proof of professional qualification (diploma/certificate/reference) or self-declaration â€” Provided by the applicant",
        ],
      },
    ],
    timeline: [
      "Documents Preparation â€” approx. 3â€“5 business days",
      "Visa processing â€” approx. 15â€“30 business days",
      "Residency Permit â€” approx. 30â€“45 business days",
      "Residency Permit ID Card issuing â€” approx. 2 calendar weeks",
    ],
    paymentTerms: [
      "50% of the service fee is payable upon contract signing / file opening.",
      "30% is payable after visa issuing and before submission of the residency permit application.",
      "20% is payable upon approval of the residency permit and before fingerprint setting for the ID card.",
      "Additional fees (government fees, notary, legal translation, etc.) are paid upfront with the 50%.",
      "All payments are non-refundable once the application has been submitted to the authorities.",
      "Payments can be made in cash, card, bank transaction, PayPal, etc.",
    ],
    disclaimerIntro: "For Visa and Residency Permit procedure:",
    disclaimers: [
      "The Applicant should be outside the Albanian territory when the visa application is submitted.",
      "As soon as the visa is approved, the applicant should enter the Albanian territory for the Residency Permit procedure to start.",
      "The applicant can start working legally after the visa is issued even while the residency permit is still pending.",
      "All visa and residency decisions are made exclusively by Albanian authorities; our office cannot influence the outcome.",
      "Processing times are estimated and may vary based on internal procedures or workload.",
      "Authorities may request additional documents or clarifications at any stage.",
    ],
    nextSteps: [
      "Prepare a service agreement and request signature from your side.",
      "Make payments as agreed upon agreement signing.",
      "Documents collection and preparation.",
      "Visa application submission.",
      "Residency Permit application submission after visa approval.",
      "Follow-up with the authorities until the final decision.",
      "Biometric fingerprints appointment and Residency Permit Card collection.",
    ],
  };
}

function buildCompany(clientName: string, fields: Partial<ProposalFields>, _c: Conditions): TemplateData {
  return {
    svcKey: "company_formation",
    serviceTitle: "Company Registration and Management\n+\nType D Visa & Residence Permit as Self-Employed/Business Owner",
    contactBar: "relocate",
    caseOverviewSections: [{
      sectionTitle: "Main Applicant:",
      rows: [
        { label: "Name", value: clientName },
        { label: "Nationality", value: fields.nationality || "â€”" },
        { label: "Occupation", value: fields.employmentType || "â€”" },
        { label: "Relocation motive", value: "Self-Employment / Company Registration" },
      ],
    }],
    scopeIntro: undefined,
    scopeBullets: [
      "â€” Services related to Company Formation in Albania â€”",
      "Legal consultation and structuring of the company",
      "Selection and reservation of the company name",
      "Drafting of the Founding Act and Company Statute",
      "Registration of the company with the National Business Center (QKB)",
      "Issuance of the company registration certificate and NUIS (tax number)",
      "Registration with the tax authorities (VAT and contributions if applicable)",
      "Assistance with opening a corporate bank account",
      "Preparation of company documentation required for residency permit purposes",
      "â€” Services related to Visa and Residency Permit procedure â€”",
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
          "Company registration submission",
          "Obtaining TAX ID / NIPT",
          "Obtaining Registration Certificate by QKB",
          "Employee declaration",
        ],
      },
      {
        stepTitle: "Visa and Residency Permit (Self-Employed)",
        bullets: [
          "Documents collection and preparation (see below)",
          "Visa and Residency Permit Application and Government Fees payment by us",
          "Decision on the visa approval",
          "As soon as your visa is approved and you enter the Albanian border, the Residency Permit procedures start automatically",
          "We submit the Residency Permit application at the Local Directorate for Border and Migration in the city where you will be based",
          "Receiving Provisional Residency Permit",
          "Final Decision on Residency Permit",
          "Address Registration at Civil Registry Office",
          "Application for biometric Residency Permit Card",
          "Obtaining the biometric residence card",
        ],
      },
    ],
    docSections: [
      {
        heading: "For Company Registration:",
        items: [
          "For the Shareholder(s) and Administrator(s): valid passport copy, contact details and residential address (foreign address)",
          "Corporate & Legal Documentation: company name proposal, description of business activity, appointment details of the administrator, shareholding structure details, company address in Albania",
          "If Registration Is Done Remotely: Power of Attorney (notarized and legalized/apostilled)",
        ],
      },
      {
        heading: "For Visa for Self-Employed (Type D):",
        items: [
          "Passport-size photograph (47mm Ã— 36mm, not older than 6 months, white background, neutral expression)",
          "Photocopy of the valid travel document (valid at least 3 months longer than the required visa period, with at least 2 blank pages)",
          "Certification of professional capacity related to self-employment (diploma, certificate, qualifications)",
          "Business Registration Certificate â€” We provide it upon company registration",
          "Document certifying accommodation in Albania (rental contract or declaration) â€” We can arrange as an extra service",
          "Residence Permit >12 months from country of residence (if residing in a different country), with at least 3 additional months validity",
          "Full bank statement showing money in/out for the last 12 months",
        ],
      },
      {
        heading: "For Residency Permit (Self-Employed / Business Owner):",
        items: [
          "Photocopy of the valid travel document (valid at least 3 months longer than the permit period, with at least 2 blank pages)",
          "Project idea for the business/activity (min. elements per the National Employment and Labor Agency) â€” We prepare it",
          "Document proving sufficient financial means (not less than 500,000 ALL or equivalent) â€” We open the bank account; you make the deposit",
          "Document proving necessary skills (certificate/diploma or equivalent)",
          "Proof of registration of the activity in QKB â€” We provide it upon company registration",
          "Payment Mandate of Government fee â€” We pay and provide the document",
          "Passport-size photograph (47mm Ã— 36mm, taken within the last 6 months)",
          "Proof of accommodation in Albania (rental contract) â€” We can arrange upon request",
        ],
      },
    ],
    timeline: [
      "Company Registration â€” approx. 3â€“5 business days",
      "Visa processing â€” approx. 15â€“30 business days",
      "Residency Permit â€” approx. 30â€“45 business days",
      "Residency Permit ID Card issuing â€” approx. 2 calendar weeks",
    ],
    paymentTerms: [
      "50% of the service fee is payable upon contract signing / file opening.",
      "50% is payable before submission of the residency permit application.",
      "Government fees are paid upfront before application submission.",
      "All payments are non-refundable once the application has been submitted to the authorities.",
      "Payments can be made in cash, card, bank transaction, PayPal, etc.",
    ],
    disclaimerIntro: "Important compliance points for Company Management:",
    disclaimers: [
      "The company must have a registered business address in Albania (virtual office available through our office).",
      "A licensed accountant is mandatory.",
      "Applicable taxes: corporate income tax, VAT (if applicable), local municipal taxes.",
      "Social and health contributions must be paid for each employee; monthly and annual declarations are mandatory.",
      "The company must remain active and compliant to support residence permit validity and renewals.",
      "For Visa and Residency Permit: the applicant should be outside Albanian territory when the visa application is submitted.",
      "All visa and residency decisions are made exclusively by Albanian authorities.",
    ],
    nextSteps: [
      "Prepare a service agreement and request signature from your side.",
      "Make payments as agreed upon agreement signing.",
      "Documents collection and preparation.",
      "Company Registration submission.",
      "Visa and Residency Permit application submission.",
      "Follow-up with the authorities until the final decision.",
      "Biometric fingerprints appointment and Residency Permit Card collection.",
    ],
  };
}

function buildRealEstate(clientName: string, fields: Partial<ProposalFields>, c: Conditions): TemplateData {
  const propDesc = fields.propertyDescription || "the property";
  const txValue = fields.transactionValueEUR ? `EUR ${fields.transactionValueEUR.toLocaleString()}` : "";
  const year = fields.propertyCompletionYear || "2027";
  const offPlan = c.is_off_plan;
  return {
    svcKey: "real_estate",
    serviceTitle: offPlan
      ? "Off-Plan Real Estate Investment in Albania"
      : "Real Estate Purchase Assistance in Albania",
    contactBar: "dafku",
    caseOverviewSections: [{
      sectionTitle: "Property & Transaction:",
      rows: [
        { label: "Client", value: clientName },
        { label: "Property", value: propDesc },
        ...(txValue ? [{ label: "Estimated Value", value: txValue }] : []),
        offPlan
          ? { label: "Construction Status", value: `Under construction â€” expected completion ${year}` }
          : { label: "Construction Status", value: "Ready / Completed" },
      ],
    }],
    scopeIntro: offPlan
      ? `Comprehensive legal assistance for the purchase of ${propDesc}${txValue ? ` (estimated value: ${txValue})` : ""}. Given the off-plan nature, the engagement includes both transactional legal support and ongoing legal monitoring until final handover and ownership registration.`
      : `Comprehensive legal assistance for the purchase of ${propDesc}${txValue ? ` (estimated value: ${txValue})` : ""}, ensuring full legal compliance, protection of the Client's interests, and proper transfer and registration of ownership.`,
    scopeBullets: [
      "Verification of ownership title and registration through the Albanian State Cadastre (ASHK)",
      "Review of the construction permit (Leje NdÃ«rtimi) and approved project documentation",
      "Legal due diligence: encumbrances, liens, mortgages, seizures, and restrictions",
      "Verification of the developer's legal status and right to pre-sell",
      "Legal review and negotiation of reservation agreements and preliminary Sale & Purchase Agreements",
      "Review of contractual clauses: deadlines, penalties, payment schedules, termination rights",
      "Representation and coordination with the real estate agency, developer, notary, and authorities",
      "Legal presence and assistance during notarial signing",
      "Payment coordination and legal safeguards",
      "Follow-up and registration of ownership with ASHK after completion",
      ...(offPlan ? [
        "Ongoing legal monitoring throughout the construction period",
        `Legal oversight until project completion, handover, and ownership registration (expected: ${year})`,
      ] : []),
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
      ...(offPlan ? [{
        stepTitle: `Long-Term Legal Monitoring Until Completion (${year})`,
        bullets: [
          "Ongoing legal availability for advisory support related to the contractual relationship",
          "Review of communications, notices, or updates issued by the developer",
          "Legal advice and intervention in cases of construction delays or non-compliance",
          `Coordination until final handover, delivery of keys, and registration of ownership (expected: ${year})`,
        ],
      }] : []),
    ],
    docSections: [{
      heading: "Required Documentation from the Client:",
      items: [
        "Valid identification document (ID / Passport)",
        "Available project-related documentation (reservation or preliminary contracts, if any)",
        "Payment method details",
        "Power of Attorney (if representation is required)",
      ],
    }],
    timeline: [
      "Legal due diligence & document verification â€” approx. 5â€“10 business days",
      "Contract review & coordination â€” approx. 5â€“10 business days",
      "Notarial execution â€” subject to parties' availability",
      ...(offPlan
        ? [`Construction completion & handover â€” expected in ${year}`, "Ownership registration after completion â€” approx. 15â€“30 business days"]
        : ["Ownership registration â€” approx. 15â€“30 business days"]),
    ],
    paymentTerms: [
      "50% payable upon signing of the engagement agreement.",
      "50% payable prior to notarial execution of contractual documentation.",
      "Third-party and government costs payable separately and in advance.",
      "Legal fees are non-refundable once services have commenced.",
      "Payments accepted via bank transfer, cash, card, PayPal, or other agreed methods.",
      ...(offPlan ? ["Phase 2 Monitoring Retainer: EUR 50 per month, payable monthly or quarterly in advance, from contract execution until project completion and registration."] : []),
    ],
    disclaimerIntro: "For Real Estate transaction:",
    disclaimers: [
      "Services are based on documentation provided by the Client and third parties.",
      ...(offPlan ? ["The Firm does not guarantee construction timelines or third-party performance."] : []),
      "Public authorities may request additional documentation at any stage.",
      "Legal fees exclude government, notary, and third-party costs unless explicitly stated.",
      ...(offPlan ? ["Hourly rate for out-of-scope services (disputes, litigation): EUR 100 / hour."] : []),
    ],
    nextSteps: [
      "Execution of the legal services engagement agreement.",
      "Payment of the initial legal fee.",
      "Commencement of legal due diligence.",
      "Contract review and coordination.",
      "Notarial assistance and payment coordination.",
      ...(offPlan
        ? [`Ongoing legal monitoring until project completion (expected: ${year}).`, "Completion upon issuance of ownership documentation in the Client's name."]
        : ["Completion upon issuance of ownership documentation in the Client's name."]),
    ],
  };
}

function buildTemplate(svc: ServiceType, clientName: string, fields: Partial<ProposalFields>, c: Conditions): TemplateData | null {
  switch (svc) {
    case "residency_pensioner": return buildPensioner(clientName, fields, c);
    case "visa_d": return buildEmployment(clientName, fields, c);
    case "company_formation": return buildCompany(clientName, fields, c);
    case "real_estate": return buildRealEstate(clientName, fields, c);
    default: return null;
  }
}

// â”€â”€â”€ ProposalRenderer component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // Build per-service template data
  const templates: TemplateData[] = svcs
    .map((s) => buildTemplate(s, clientName, fields, conditions))
    .filter((t): t is TemplateData => t !== null);

  // â”€â”€ Fee calculations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        .toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
        .replace(/\//g, ".")
    : "";

  // Merged next steps: deduplicated across all templates
  const allNextSteps = Array.from(
    new Map(templates.flatMap((t) => t.nextSteps).map((s) => [s, s])).values()
  );

  // Determine contact bar â€” if any service uses "relocate", use that; otherwise "dafku"
  const usesRelocate = templates.some((t) => t.contactBar === "relocate");

  const cls =
    "bg-white text-gray-900 rounded-lg border shadow-sm p-10 font-serif text-[13px] leading-relaxed";
  const sty: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif" };

  // Global step counter for multi-service merge
  let globalStep = 0;

  if (templates.length === 0) {
    return (
      <div className={cls} style={sty}>
        <p className="text-sm text-gray-500 text-center py-10">
          No proposal services selected. Please select at least one service.
        </p>
      </div>
    );
  }

  return (
    <div className={cls} style={sty} ref={innerRef}>
      {/* â”€â”€ Cover â”€â”€ */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-center uppercase tracking-widest mb-1">
          Service Proposal
        </h1>
        <p className="text-center text-sm text-gray-500 mb-1">
          Presented to: <strong>{clientName}</strong>
        </p>
        <p className="text-center text-xs text-gray-400 mb-6">Client ID: {clientId}</p>

        {/* Services listed on cover */}
        <div className="border rounded p-4 mb-4 bg-gray-50">
          <p className="text-sm font-semibold mb-2">Services Provided:</p>
          {templates.map((t, i) => (
            <p key={i} className="text-sm whitespace-pre-line">
              {i + 1}. {t.serviceTitle}
            </p>
          ))}
        </div>

        {/* Date */}
        {displayDate && (
          <p className="text-right text-xs text-gray-400">Date: {displayDate}</p>
        )}

        {/* Contact bar */}
        {usesRelocate ? (
          <div className="mt-4 border-t pt-3 text-center text-xs text-gray-500">
            Relocate Albania Â· Tirana &amp; DurrÃ«s, Albania Â· info@relocateto.al Â· www.relocateto.al
          </div>
        ) : (
          <div className="mt-4 border-t pt-3 text-center text-xs text-gray-500">
            DAFKU Law Firm Â· Tirana &amp; DurrÃ«s, Albania Â· info@dafkulawfirm.al Â· www.dafkulawfirm.al
          </div>
        )}
      </div>

      <hr className="my-6" />

      {/* â”€â”€ Per-Service Sections â”€â”€ */}
      {templates.map((tpl, ti) => {
        const servicePrefix = templates.length > 1 ? `[Service ${ti + 1}] ` : "";
        return (
          <React.Fragment key={tpl.svcKey}>
            {ti > 0 && <hr className="my-8 border-dashed" />}

            {/* Service Title */}
            <h2 className="text-xl font-bold text-center uppercase tracking-wide mb-4 whitespace-pre-line">
              {tpl.serviceTitle}
            </h2>

            {/* 1 â€” Case Overview */}
            <div className="mb-6">
              <p className="text-sm font-bold border-b pb-1 mb-3">
                {servicePrefix}1 â€” Case Overview
              </p>
              {tpl.caseOverviewSections.map((sec, si) => (
                <div key={si} className="mb-3">
                  {sec.sectionTitle && (
                    <p className="text-sm font-semibold mb-1">{sec.sectionTitle}</p>
                  )}
                  <table className="w-full text-sm">
                    <tbody>
                      {sec.rows.map((r, ri) => (
                        <tr key={ri} className="border-b last:border-0">
                          <td className="text-gray-500 py-1 pr-4 w-40 align-top">{r.label}</td>
                          <td className="py-1">{r.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            {/* 2 â€” Scope of Work */}
            <div className="mb-6">
              <p className="text-sm font-bold border-b pb-1 mb-2">
                {servicePrefix}2 â€” Scope of Work
              </p>
              {tpl.scopeIntro && (
                <p className="text-sm mb-2 text-gray-700">{tpl.scopeIntro}</p>
              )}
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                {tpl.scopeBullets.map((b, bi) => (
                  b.startsWith("â€”") ? (
                    <li key={bi} className="list-none font-semibold mt-3 -ml-5">{b}</li>
                  ) : (
                    <li key={bi}>{b}</li>
                  )
                ))}
              </ul>
            </div>

            {/* 3 â€” Process / Steps */}
            {tpl.processSteps.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">
                  {servicePrefix}3 â€” Process
                </p>
                {tpl.processSteps.map((step, si) => {
                  globalStep += 1;
                  return (
                    <div key={si} className="mb-4">
                      <p className="text-sm font-semibold mb-1">
                        STEP {globalStep}: {step.stepTitle}
                      </p>
                      <ul className="list-disc pl-5 space-y-0.5 text-sm">
                        {step.bullets.map((b, bi) => (
                          <li key={bi}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4 â€” Required Documents */}
            {tpl.docSections.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">
                  {servicePrefix}4 â€” Required Documents
                </p>
                {tpl.docSections.map((sec, si) => (
                  <div key={si} className="mb-3">
                    {sec.heading && (
                      <p className="text-sm font-semibold mb-1">{sec.heading}</p>
                    )}
                    <ul className="list-disc pl-5 space-y-0.5 text-sm">
                      {sec.items.map((item, ii) => (
                        <li key={ii}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* 5 â€” Timeline */}
            {tpl.timeline.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">
                  {servicePrefix}5 â€” Timeline Overview
                </p>
                <ul className="list-disc pl-5 space-y-0.5 text-sm">
                  {tpl.timeline.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 6 â€” Disclaimers */}
            {tpl.disclaimers.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">
                  {servicePrefix}6 â€” Important Notes
                </p>
                {tpl.disclaimerIntro && (
                  <p className="text-sm mb-1 italic text-gray-600">{tpl.disclaimerIntro}</p>
                )}
                <ul className="list-disc pl-5 space-y-0.5 text-sm">
                  {tpl.disclaimers.map((d, di) => (
                    <li key={di}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </React.Fragment>
        );
      })}

      <hr className="my-6" />

      {/* â”€â”€ Fees (merged, from fields) â”€â”€ */}
      <div className="mb-6">
        <p className="text-sm font-bold border-b pb-1 mb-3">Professional Fees</p>
        <table className="w-full text-sm mb-3">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1 text-gray-600 font-medium">Description</th>
              <th className="text-right py-1 text-gray-600 font-medium">ALL</th>
              <th className="text-right py-1 text-gray-600 font-medium">EUR</th>
            </tr>
          </thead>
          <tbody>
            {consultationFee > 0 && (
              <tr className="border-b">
                <td className="py-1">Consultation Fee</td>
                <td className="text-right py-1">{consultationFee.toLocaleString()}</td>
                <td className="text-right py-1">{fmt(consultationFee * EUR_RATE)}</td>
              </tr>
            )}
            {serviceFee > 0 && (
              <tr className="border-b">
                <td className="py-1">Service Fee</td>
                <td className="text-right py-1">{serviceFee.toLocaleString()}</td>
                <td className="text-right py-1">{fmt(serviceFee * EUR_RATE)}</td>
              </tr>
            )}
            {serviceFeeSubtotal > 0 && (
              <tr className="border-b font-semibold">
                <td className="py-1">Service Subtotal</td>
                <td className="text-right py-1">{serviceFeeSubtotal.toLocaleString()}</td>
                <td className="text-right py-1">{fmt(serviceFeeSubtotal * EUR_RATE)}</td>
              </tr>
            )}
            {poaFee > 0 && (
              <tr className="border-b">
                <td className="py-1">Power of Attorney</td>
                <td className="text-right py-1">{poaFee.toLocaleString()}</td>
                <td className="text-right py-1">{fmt(poaFee * EUR_RATE)}</td>
              </tr>
            )}
            {translationFee > 0 && (
              <tr className="border-b">
                <td className="py-1">Translation</td>
                <td className="text-right py-1">{translationFee.toLocaleString()}</td>
                <td className="text-right py-1">{fmt(translationFee * EUR_RATE)}</td>
              </tr>
            )}
            {otherFees > 0 && (
              <tr className="border-b">
                <td className="py-1">Other Fees</td>
                <td className="text-right py-1">{otherFees.toLocaleString()}</td>
                <td className="text-right py-1">{fmt(otherFees * EUR_RATE)}</td>
              </tr>
            )}
            {totalALL > 0 && (
              <tr className="font-bold border-t-2 border-gray-400">
                <td className="py-2">TOTAL</td>
                <td className="text-right py-2">{totalALL.toLocaleString()}</td>
                <td className="text-right py-2">{fmt(totalEUR)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {totalALL > 0 && (
          <p className="text-xs text-gray-500">
            Also approx. USD {fmt(totalUSD)} / GBP {fmt(totalGBP)} at indicative rates.
          </p>
        )}
        {fields.additionalCostsNote && (
          <p className="text-sm mt-2 text-gray-600 italic">{fields.additionalCostsNote}</p>
        )}
      </div>

      {/* â”€â”€ Payment Terms (merged across all templates) â”€â”€ */}
      <div className="mb-6">
        <p className="text-sm font-bold border-b pb-1 mb-2">Payment Terms</p>
        {templates.map((tpl, ti) => (
          <div key={tpl.svcKey} className="mb-3">
            {templates.length > 1 && (
              <p className="text-sm font-semibold mb-1 whitespace-pre-line">{tpl.serviceTitle}:</p>
            )}
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              {tpl.paymentTerms.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          </div>
        ))}
        {fields.paymentTermsNote && (
          <p className="text-sm mt-2 text-gray-600 italic">{fields.paymentTermsNote}</p>
        )}
      </div>

      {/* â”€â”€ Next Steps (deduplicated) â”€â”€ */}
      <div className="mb-6">
        <p className="text-sm font-bold border-b pb-1 mb-2">Next Steps</p>
        <ul className="list-disc pl-5 space-y-0.5 text-sm">
          {allNextSteps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>

      {/* â”€â”€ Footer â”€â”€ */}
      <div className="mt-10 border-t pt-4">
        <p className="text-xs text-gray-400 text-center">
          DAFKU Law Firm &amp; Relocate Albania Â· Tirana &amp; DurrÃ«s Â· info@dafkulawfirm.al Â· info@relocateto.al
        </p>
        <p className="text-xs text-gray-400 text-center mt-1">
          This proposal is confidential and valid for 30 days from the date of issue.
        </p>
      </div>
    </div>
  );
}

