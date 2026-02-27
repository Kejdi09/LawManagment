/**
 * ProposalRenderer
 * Renders a professional service proposal document.
 * Supports single and multi-service proposals.
 * Conditions (has_spouse, is_off_plan) drive conditional sections
 * from intake form fields.
 */
import React from "react";
import { ServiceType, ProposalFields } from "@/lib/types";
import { evaluateConditions, Conditions } from "@/lib/proposal-engine";

// ---- Currency helpers ----
export const EUR_RATE = 0.01037032;
export const USD_RATE = 0.01212463;
export const GBP_RATE = 0.00902409;

export function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ---- Data model ----

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

// ---- Data builders ----

function buildPensioner(
  clientName: string,
  fields: Partial<ProposalFields>,
  c: Conditions
): TemplateData {
  const dep = c.has_spouse;
  return {
    svcKey: "residency_pensioner",
    serviceTitle: dep
      ? "Residence Permit for Pensioner + Family Reunification"
      : "Residence Permit for Pensioner",
    contactBar: "relocate",
    caseOverviewSections: [
      {
        sectionTitle: "Main Applicant",
        rows: [
          { label: "Full Name", value: clientName },
          { label: "Nationality", value: fields.nationality || "-" },
          { label: "Occupation", value: fields.employmentType || "-" },
          { label: "Application Type", value: "Residency Permit (Pensioner)" },
        ],
      },
      ...(dep
        ? [
            {
              sectionTitle: "Dependent — Spouse",
              rows: [
                { label: "Full Name", value: fields.dependentName || "-" },
                { label: "Nationality", value: fields.dependentNationality || "-" },
                { label: "Occupation", value: fields.dependentOccupation || "-" },
                { label: "Application Type", value: "Family Reunification" },
              ],
            },
          ]
        : []),
    ],
    scopeIntro:
      "Full legal representation and management of the Residency Permit procedure, including:",
    scopeBullets: [
      "Pre-check and verification of all documents before submission",
      "Assistance with translations, notarization, and apostille/legalization where required",
      "Preparation of all declarations required by Albanian authorities",
      "Completing and submitting the residence permit application(s)",
      "Scheduling all appointments with the relevant institutions",
      "Submission at the Local Directorate for Border and Migration",
      "Follow-up with authorities until final approval",
      "Civil Registry address registration assistance",
      "Accompanying the applicant for biometric fingerprints",
      "Guidance through receipt of the final residence permit card",
      "Payment of government and third-party fees on behalf of the applicant",
    ],
    processSteps: [
      {
        stepTitle: "Residency Permit — Main Applicant (Pensioner)",
        bullets: [
          "Documents collection and preparation (see Required Documents below)",
          "Government fees payment on behalf of the applicant",
          "Application submission at the Local Directorate for Border and Migration",
          "Issuance of Provisional Residency Permit",
          "Final Decision on Residency Permit",
          "Address Registration at the Civil Registry Office",
          "Application for biometric Residency Permit Card",
          "Collection of the biometric residence card",
        ],
      },
      ...(dep
        ? [
            {
              stepTitle: "Residency Permit — Dependent (Family Reunification)",
              bullets: [
                "Same procedure as above for the dependent",
                "Submitted after the main applicant's Residency Permit is granted",
              ],
            },
          ]
        : []),
    ],
    docSections: [
      {
        heading: "Main Applicant (Pensioner)",
        items: [
          "Valid travel document — photocopy (valid at least 3 months beyond the permit period, with 2 blank pages) — provided by applicant",
          "Individual declarations for reason of stay in Albania — we prepare in Albanian and English; applicant signs",
          "Proof of insurance in Albania — we arrange at our associate insurance company",
          "Albanian bank evidence confirming transfer of pension income — we assist with bank account opening",
          "Legalized criminal record from country of origin (issued within last 6 months, translated and notarized) — we handle",
          "Evidence of annual pension income exceeding 1,200,000 ALL — we handle legal translation and notary",
          "Proof of Residency Permit Government Fee Payment — we pay and provide the mandate",
          "Passport-size photograph (47mm x 36mm, taken within last 6 months, white background)",
          "Proof of accommodation in Albania (residential rental contract)",
        ],
      },
      ...(dep
        ? [
            {
              heading: "Dependent — Spouse (submitted after main permit is granted)",
              items: [
                "Valid travel document — photocopy (same requirements as main applicant) — provided by applicant",
                "Marriage certificate (issued within last 6 months, legalized, translated and notarized if not issued in Albania) — we handle",
                "Proof of insurance in Albania — we arrange at our associate insurance company",
                "Copy of the main applicant's residence permit in Albania",
                "Proof of Residency Permit Government Fee Payment — we pay and provide the mandate",
                "Passport-size photograph (47mm x 36mm, taken within last 6 months) — two printed copies + digital copy",
                "Proof of accommodation in Albania (residential rental contract)",
                "Evidence of sufficient financial resources during the stay — we handle legal translation and notary",
              ],
            },
          ]
        : []),
    ],
    timeline: [
      "Documents preparation and application submission: 3–5 business days",
      "Provisional Residency Permit: approx. 10–15 business days",
      "Final Decision on Residency Permit: approx. 30–45 business days",
      "Biometric Residency Permit Card: approx. 2 calendar weeks after final decision",
    ],
    paymentTerms: [
      "50% of the service fee is payable upon contract signing and file opening.",
      dep
        ? "50% is payable before submission of the residency permit application for the dependent."
        : "50% is payable before submission of the residency permit application.",
      "Government fees are paid upfront before application submission.",
      "All payments are non-refundable once the application has been submitted.",
      "Accepted payment methods: cash, card, bank transfer, PayPal, and others.",
    ],
    disclaimerIntro: "Please note the following regarding the Residency Permit procedure:",
    disclaimers: [
      "All residency decisions are made exclusively by Albanian authorities; our office cannot influence the outcome.",
      "Processing times are estimates and may vary based on institutional workload.",
      "Authorities may request additional documents or clarifications at any stage.",
      "Our office is not responsible for delays or decisions made by the authorities.",
    ],
    nextSteps: [
      "Execution of the service agreement and payment of the initial fee.",
      "Documents collection and preparation.",
      "Residency Permit application submission.",
      "Follow-up with authorities through to the final decision.",
    ],
  };
}

function buildEmployment(
  clientName: string,
  fields: Partial<ProposalFields>,
  _c: Conditions
): TemplateData {
  const n = fields.numberOfApplicants ?? 1;
  const plural = n > 1;
  return {
    svcKey: "visa_d",
    serviceTitle: "Type D Visa & Residence Permit for Employee(s)",
    contactBar: "relocate",
    caseOverviewSections: [
      {
        rows: [
          { label: "Applicant(s)", value: plural ? `${n} employees` : clientName },
          { label: "Nationality", value: fields.nationality || "-" },
          { label: "Purpose of Stay", value: "Employment / Work" },
          {
            label: "Employer",
            value: fields.companyName || fields.propertyDescription || "-",
          },
        ],
      },
    ],
    scopeIntro: "Full legal assistance for the Type D Visa and Residence Permit procedure for employee(s), including:",
    scopeBullets: [
      "Pre-check and verification of all documents",
      "Preparation of all required declarations and forms",
      "Type D Long-Stay Visa application support (submitted at Albanian Embassy/Consulate abroad)",
      "Residence Permit application upon arrival in Albania",
      "Scheduling appointments with immigration authorities",
      "Submission and follow-up at the Local Directorate for Border and Migration",
      "Work permit coordination (if applicable)",
      "Civil Registry address registration",
      "Guidance through receipt of the biometric Residency Permit Card",
      plural ? `Fee applies per applicant (${n} applicants covered under this engagement)` : "",
    ].filter(Boolean),
    processSteps: [
      {
        stepTitle: "Type D Long-Stay Visa Application",
        bullets: [
          "Documents collection and preparation",
          "Application submitted at the Albanian Embassy or Consulate in the applicant's country of residence",
          "Visa issuance and travel to Albania",
        ],
      },
      {
        stepTitle: "Residence Permit Application (in Albania)",
        bullets: [
          "Application submitted at the Local Directorate for Border and Migration within 30 days of entry",
          "Government fees payment on behalf of the applicant",
          "Issuance of Provisional Residency Permit",
          "Address registration at the Civil Registry Office",
          "Final Decision on Residency Permit",
          "Application for and collection of biometric Residency Permit Card",
        ],
      },
    ],
    docSections: [
      {
        items: [
          "Valid passport (valid at least 6 months beyond the permit period, with 2 blank pages) — provided by applicant",
          "Employment contract with Albanian employer (signed, stamped) — provided by applicant / employer",
          "Work permit (if required — we advise and assist)",
          "Passport-size photographs (per Albanian authority requirements)",
          "Employer registration certificate and fiscal certificate — we assist in obtaining",
          "Proof of accommodation in Albania (rental contract or hotel confirmation)",
          "Criminal record from country of origin (issued within last 6 months, notarized and translated) — we handle",
          "Health/travel insurance valid in Albania",
          "Individual declarations prepared by us — applicant signs",
        ],
      },
    ],
    timeline: [
      "Type D Visa (at Embassy abroad): 5–15 business days depending on consulate workload",
      "Residence Permit submission: within 30 days of arriving in Albania",
      "Provisional Residency Permit: approx. 10–15 business days",
      "Final Residency Permit decision: approx. 30–45 business days",
      "Biometric card: approx. 2 calendar weeks after final decision",
    ],
    paymentTerms: [
      "50% of the service fee is payable upon contract signing and file opening.",
      "50% is payable before submission of the Residence Permit application in Albania.",
      "Government fees are paid upfront before application submission.",
      "All payments are non-refundable once applications have been submitted.",
      plural ? `Fee applies per applicant; total reflects ${n} applicants.` : "",
    ].filter(Boolean),
    disclaimerIntro: "Please note the following regarding the Type D Visa & Residence Permit procedure:",
    disclaimers: [
      "Visa and permit decisions are made exclusively by Albanian authorities.",
      "Type D Visa must be applied for at an Albanian Embassy or Consulate abroad.",
      "Processing times are estimates and may vary.",
      "Employers must hold valid Albanian business registration.",
    ],
    nextSteps: [
      "Execution of the service agreement and initial payment.",
      "Documents collection.",
      "Type D Visa application (if not yet obtained).",
      "Residency Permit application upon entry to Albania.",
      "Follow-up through to card issuance.",
    ],
  };
}

function buildCompany(
  clientName: string,
  fields: Partial<ProposalFields>,
  _c: Conditions
): TemplateData {
  const shareholders = Math.max(1, fields.numberOfShareholders ?? 1);
  const multiSh = shareholders > 1;
  return {
    svcKey: "company_formation",
    serviceTitle:
      "Company Formation & Management + Type D Visa & Residence Permit (Self-Employed / Business Owner)",
    contactBar: "dafku",
    caseOverviewSections: [
      {
        rows: [
          { label: "Applicant", value: clientName },
          { label: "Nationality", value: fields.nationality || "-" },
          { label: "Company Name", value: fields.businessActivity ? `(${fields.businessActivity})` : "(to be confirmed)" },
          { label: "Business Activity", value: fields.businessActivity || "-" },
          { label: "Shareholders", value: String(shareholders) },
          { label: "Relocation Purpose", value: "Business Owner / Self-Employed" },
        ],
      },
    ],
    scopeIntro:
      "Full legal assistance for establishing an Albanian company and obtaining the Type D Visa and Residence Permit as a business owner/self-employed individual, including:",
    scopeBullets: [
      "Legal advice on company structure and applicable regulations",
      "Company name reservation at the National Business Centre (QKB)",
      "Drafting and notarizing the Articles of Association",
      "Registration at the National Business Centre (QKB) and tax registration",
      "Opening a corporate bank account (assistance)",
      "Obtaining all required licenses and permits for the business activity",
      multiSh
        ? `Documentation for all ${shareholders} shareholders`
        : "",
      "Type D Visa application support",
      "Residence Permit application and follow-up",
      "Post-registration company management support (annual declarations, accounting coordination)",
    ].filter(Boolean),
    processSteps: [
      {
        stepTitle: "Company Formation",
        bullets: [
          "Company name approval",
          "Drafting and notarizing the Articles of Association",
          multiSh
            ? `Gathering documents from all ${shareholders} shareholders`
            : "Gathering required founder documents",
          "Registration at the National Business Centre (QKB)",
          "Tax registration and fiscal number issuance",
          "Corporate bank account opening (assistance)",
          "Obtaining required business licenses",
        ].filter(Boolean),
      },
      {
        stepTitle: "Type D Visa & Residence Permit as Business Owner",
        bullets: [
          "Type D Visa application at Albanian Embassy/Consulate (if applicable)",
          "Residence Permit application in Albania (within 30 days of entry)",
          "Government fees payment on behalf of the applicant",
          "Submission and follow-up at the Local Directorate for Border and Migration",
          "Address registration at the Civil Registry",
          "Final Decision and biometric card collection",
        ],
      },
    ],
    docSections: [
      {
        heading: "Founder / Shareholder Documents",
        items: [
          "Valid passport — provided by applicant",
          "Criminal record from country of origin (issued within last 6 months, translated and notarized) — we handle",
          "Power of Attorney (if applying through a representative) — we draft",
          "Proof of initial share capital deposit",
          multiSh
            ? `Same set of documents required from each of the ${shareholders} shareholders`
            : "",
        ].filter(Boolean),
      },
      {
        heading: "Residence Permit Documents",
        items: [
          "Proof of company registration (certificate from QKB) — obtained as part of this service",
          "Evidence of business activity and income — we assist",
          "Proof of accommodation in Albania (rental contract)",
          "Health insurance valid in Albania",
          "Passport-size photographs",
          "Individual declarations — we prepare; applicant signs",
        ],
      },
    ],
    timeline: [
      "Company formation and registration: 5–10 business days",
      "Type D Visa (if needed, at Embassy abroad): 5–15 business days",
      "Residence Permit submission: within 30 days of arrival",
      "Provisional Residency Permit: approx. 10–15 business days",
      "Final Residency Permit decision: approx. 30–45 business days",
      "Biometric card: approx. 2 calendar weeks after final decision",
    ],
    paymentTerms: [
      "50% of the service fee is payable upon contract signing and file opening.",
      "50% is payable before submission of the Residence Permit application.",
      "Government and notary fees are paid upfront before each relevant stage.",
      "All payments are non-refundable once the application has been submitted.",
    ],
    disclaimerIntro: "Please note the following:",
    disclaimers: [
      "Company registration decisions are made by Albanian authorities (QKB).",
      "Visa and Residence Permit decisions are made by immigration authorities.",
      "Processing times are estimates and may vary.",
      "Business licenses or sector-specific permits may involve additional fees.",
    ],
    nextSteps: [
      "Execution of the service agreement and initial payment.",
      "Documents collection from all founders/shareholders.",
      "Company name reservation and formation process.",
      "Type D Visa and Residence Permit applications.",
      "Post-registration company management setup.",
    ],
  };
}

function buildRealEstate(
  clientName: string,
  fields: Partial<ProposalFields>,
  c: Conditions
): TemplateData {
  const offPlan = c.is_off_plan;
  const desc = fields.propertyDescription || "the property";
  const txValue = fields.transactionValueEUR
    ? `approximately EUR ${fields.transactionValueEUR.toLocaleString()}`
    : "as agreed";
  return {
    svcKey: "real_estate",
    serviceTitle: "Real Estate Legal Assistance — Property Purchase in Albania",
    contactBar: "dafku",
    caseOverviewSections: [
      {
        rows: [
          { label: "Client", value: clientName },
          { label: "Nationality", value: fields.nationality || "-" },
          { label: "Property", value: desc },
          { label: "Transaction Value", value: txValue },
          {
            label: "Property Status",
            value: offPlan
              ? "Off-Plan / Under Construction"
              : "Ready to Move In / Completed",
          },
          ...(offPlan && fields.propertyCompletionYear
            ? [
                {
                  label: "Expected Completion",
                  value: fields.propertyCompletionYear,
                },
              ]
            : []),
        ],
      },
    ],
    scopeIntro:
      "Full legal assistance for the purchase of the above property in Albania, ensuring legal compliance, protection of the client's interests as buyer, and proper transfer and registration of title, including:",
    scopeBullets: [
      "Verification of ownership title with the Albanian State Cadastre (ASHK)",
      "Due diligence on the property (encumbrances, mortgages, legal disputes, planning status)",
      "Review and negotiation of the Preliminary Sale Agreement (Compromis/Antecontract)",
      "Drafting or reviewing the Final Sale and Purchase Agreement",
      "Notary appointment coordination and attendance",
      "Title transfer and property registration at the State Cadastre (ASHK)",
      "Tax and duty advice (property transfer tax, VAT if applicable)",
      "Coordination with the seller's legal representative",
      "Post-completion registration follow-up",
      offPlan
        ? "Long-term monitoring of the developer's construction obligations until handover"
        : "",
    ].filter(Boolean),
    processSteps: [
      {
        stepTitle: "Legal Due Diligence",
        bullets: [
          "Title and encumbrance check at ASHK",
          "Review of planning permissions and building permits",
          "Verification of seller's legal ownership and capacity",
          "Assessment of any outstanding taxes or charges",
          "Reporting findings to the client before proceeding",
        ],
      },
      {
        stepTitle: "Transaction Execution",
        bullets: [
          "Review / drafting of the Preliminary Sale Agreement",
          "Coordination with notary for the Final Sale and Purchase Agreement",
          "Attendance at notary signing",
          "Property transfer tax calculation and payment advice",
          "Title registration at ASHK and receipt of new title certificate",
        ],
      },
      ...(offPlan
        ? [
            {
              stepTitle: "Construction Monitoring & Handover (Off-Plan)",
              bullets: [
                "Periodic review of construction progress against contractual milestones",
                "Legal review of stage payment invoices before payment",
                "Communication with developer on behalf of the client",
                "Legal review of snagging / defect notices",
                "Attendance at property handover and key inspection",
                "Final title registration upon completion",
              ],
            },
          ]
        : []),
    ],
    docSections: [
      {
        items: [
          "Valid passport or national ID — provided by client",
          "Power of Attorney (if signing through a representative) — we draft and notarize",
          "Preliminary Sale Agreement (we review or draft)",
          "Final Sale and Purchase Agreement (we draft or review)",
          "Proof of payment / bank transfer records — provided by client",
          "Property due diligence extract from ASHK — we obtain",
          "Cadastral certificate and building permit copies — we obtain",
          offPlan ? "Developer construction contract and stage payment schedule — we review" : "",
        ].filter(Boolean),
      },
    ],
    timeline: [
      "Legal due diligence: 3–7 business days",
      "Preliminary Agreement signing: as agreed between parties",
      "Final notary signing: subject to bank and notary availability",
      "ASHK title registration: 5–15 business days after notary",
      offPlan
        ? "Construction monitoring: ongoing until handover (estimated " +
          (fields.propertyCompletionYear || "TBC") +
          ")"
        : "",
    ].filter(Boolean),
    paymentTerms: [
      "50% of the legal service fee is payable upon engagement / contract signing.",
      "50% is payable upon completion of the title transfer and ASHK registration.",
      offPlan
        ? "Monthly retainer of EUR 50 applies from handover date, for ongoing construction monitoring."
        : "",
      "Government fees, notary fees, and transfer taxes are payable when due (not included in the service fee).",
      "All service fees are non-refundable once due diligence has commenced.",
    ].filter(Boolean),
    disclaimerIntro: "Please note the following regarding the real estate transaction:",
    disclaimers: [
      "Title registration is managed by ASHK; our office cannot influence processing times.",
      "Transfer taxes and notary fees are set by law and are in addition to our legal fee.",
      offPlan
        ? "Developer obligations are enforceable under the signed contract; our office monitors and advises but cannot compel timely completion."
        : "",
      "Our advice is based on Albanian law as currently in force; regulatory changes may affect the transaction.",
    ].filter(Boolean),
    nextSteps: [
      "Execution of the legal service agreement and initial payment.",
      "Commencement of legal due diligence on the property.",
      "Reporting due diligence results to the client.",
      "Proceeding to Preliminary Agreement and then Final Sale Agreement.",
      "Title transfer and ASHK registration.",
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

// ---- Design tokens ----
const NAVY = "#1b2e4b";
const ACCENT = "#2563eb"; // blue-600
const LIGHT_BG = "#f8fafc"; // slate-50
const BORDER = "#e2e8f0"; // slate-200
const TEXT_MAIN = "#0f172a"; // slate-900
const TEXT_MUTED = "#64748b"; // slate-500

// ---- Sub-components ----

function SectionLabel({ number, title }: { number: string; title: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        marginBottom: "14px",
        paddingBottom: "8px",
        borderBottom: `2px solid ${ACCENT}`,
      }}
    >
      <span
        style={{
          background: ACCENT,
          color: "#fff",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          padding: "2px 8px",
          borderRadius: "3px",
          flexShrink: 0,
        }}
      >
        {number}
      </span>
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: NAVY,
        }}
      >
        {title}
      </span>
    </div>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: "10px", marginBottom: "5px" }}>
      <span style={{ color: ACCENT, fontWeight: 700, flexShrink: 0, marginTop: "1px" }}>
        &#8594;
      </span>
      <span style={{ fontSize: "13px", color: TEXT_MAIN, lineHeight: "1.5" }}>{text}</span>
    </div>
  );
}

function StepBlock({
  stepNumber,
  title,
  bullets,
}: {
  stepNumber: number;
  title: string;
  bullets: string[];
}) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "10px" }}>
        <div
          style={{
            background: NAVY,
            color: "#fff",
            borderRadius: "50%",
            width: "26px",
            height: "26px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 700,
            flexShrink: 0,
            marginTop: "1px",
          }}
        >
          {stepNumber}
        </div>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: NAVY,
            lineHeight: "1.4",
            paddingTop: "4px",
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ paddingLeft: "38px" }}>
        {bullets.map((b, i) => (
          <BulletItem key={i} text={b} />
        ))}
      </div>
    </div>
  );
}

function DocItem({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "6px 10px",
        background: LIGHT_BG,
        borderLeft: `3px solid ${ACCENT}`,
        borderRadius: "0 4px 4px 0",
        marginBottom: "6px",
      }}
    >
      <span style={{ color: ACCENT, fontSize: "12px", flexShrink: 0, marginTop: "1px" }}>
        &#x2713;
      </span>
      <span style={{ fontSize: "12px", color: TEXT_MAIN, lineHeight: "1.45" }}>{text}</span>
    </div>
  );
}

// ---- Props ----

interface ProposalRendererProps {
  clientName: string;
  clientId: string;
  services: ServiceType[];
  fields: Partial<ProposalFields>;
  innerRef?: React.RefObject<HTMLDivElement>;
}

// ---- Main component ----

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
          month: "long",
          year: "numeric",
        })
    : new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

  const allNextSteps = Array.from(new Set(templates.flatMap((t) => t.nextSteps)));
  const allPaymentTerms = templates.flatMap((t) => t.paymentTerms);
  const usesRelocate = templates.some((t) => t.contactBar === "relocate");

  if (templates.length === 0) {
    return (
      <div
        style={{
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: "8px",
          padding: "48px",
          textAlign: "center",
          color: TEXT_MUTED,
          fontSize: "14px",
        }}
      >
        No proposal content available for the selected service(s). Please ensure the customer
        has at least one of the supported services selected.
      </div>
    );
  }

  let globalStep = 0;

  return (
    <div
      ref={innerRef}
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        background: "#ffffff",
        color: TEXT_MAIN,
        fontSize: "13px",
        lineHeight: "1.6",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      {/* ===== HEADER BAND ===== */}
      <div
        style={{
          background: NAVY,
          color: "#fff",
          padding: "28px 40px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                opacity: 0.7,
                marginBottom: "4px",
              }}
            >
              {usesRelocate ? "Relocate Albania" : "DAFKU Law Firm"}
            </div>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                marginBottom: "2px",
              }}
            >
              Service Proposal
            </div>
            <div style={{ fontSize: "12px", opacity: 0.75 }}>
              {usesRelocate ? "info@relocateto.al" : "info@dafkulawfirm.al"}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: "12px", opacity: 0.8 }}>
            <div style={{ marginBottom: "3px" }}>
              <span style={{ opacity: 0.6 }}>Date: </span>
              {displayDate}
            </div>
            <div>
              <span style={{ opacity: 0.6 }}>Ref: </span>
              {clientId}
            </div>
          </div>
        </div>
      </div>

      {/* ===== CLIENT INTRO BAND ===== */}
      <div
        style={{
          background: LIGHT_BG,
          padding: "18px 40px",
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: "3px" }}>
            Prepared for
          </div>
          <div style={{ fontSize: "17px", fontWeight: 700, color: NAVY }}>{clientName}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: "4px" }}>
            Services Covered
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            {templates.map((t, i) => (
              <span
                key={i}
                style={{
                  background: NAVY,
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: "20px",
                  letterSpacing: "0.03em",
                }}
              >
                {t.serviceTitle}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ===== PER-SERVICE SECTIONS ===== */}
      {templates.map((tpl, ti) => (
        <div key={tpl.svcKey}>
          {/* Service separator when multiple services */}
          {templates.length > 1 && (
            <div
              style={{
                background: NAVY,
                color: "#fff",
                padding: "10px 40px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Part {ti + 1} &#8212; {tpl.serviceTitle}
            </div>
          )}

          <div style={{ padding: "32px 40px", borderBottom: `1px solid ${BORDER}` }}>
            {/* 1. Case Overview */}
            <section style={{ marginBottom: "28px" }}>
              <SectionLabel number="1" title="Case Overview" />
              {tpl.caseOverviewSections.map((sec, si) => (
                <div key={si} style={{ marginBottom: si < tpl.caseOverviewSections.length - 1 ? "16px" : 0 }}>
                  {sec.sectionTitle && (
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: NAVY,
                        marginBottom: "8px",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {sec.sectionTitle}
                    </div>
                  )}
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "13px",
                    }}
                  >
                    <tbody>
                      {sec.rows.map((r, ri) => (
                        <tr
                          key={ri}
                          style={{
                            background: ri % 2 === 0 ? "#fff" : LIGHT_BG,
                          }}
                        >
                          <td
                            style={{
                              padding: "7px 12px 7px 0",
                              color: TEXT_MUTED,
                              fontSize: "11px",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              width: "180px",
                              verticalAlign: "top",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.label}
                          </td>
                          <td
                            style={{
                              padding: "7px 12px",
                              color: TEXT_MAIN,
                              fontWeight: 500,
                              verticalAlign: "top",
                            }}
                          >
                            {r.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>

            {/* 2. Scope of Work */}
            <section style={{ marginBottom: "28px" }}>
              <SectionLabel number="2" title="Scope of Work" />
              {tpl.scopeIntro && (
                <p
                  style={{
                    fontSize: "13px",
                    color: TEXT_MAIN,
                    marginBottom: "12px",
                    lineHeight: "1.6",
                  }}
                >
                  {tpl.scopeIntro}
                </p>
              )}
              <div>
                {tpl.scopeBullets.map((b, bi) => (
                  <BulletItem key={bi} text={b} />
                ))}
              </div>
            </section>

            {/* 3. Process */}
            {tpl.processSteps.length > 0 && (
              <section style={{ marginBottom: "28px" }}>
                <SectionLabel number="3" title="Process Overview" />
                {tpl.processSteps.map((step) => {
                  globalStep += 1;
                  const sn = globalStep;
                  return (
                    <StepBlock
                      key={step.stepTitle}
                      stepNumber={sn}
                      title={step.stepTitle}
                      bullets={step.bullets}
                    />
                  );
                })}
              </section>
            )}

            {/* 4. Required Documents */}
            {tpl.docSections.length > 0 && (
              <section style={{ marginBottom: "28px" }}>
                <SectionLabel number="4" title="Required Documents" />
                {tpl.docSections.map((sec, si) => (
                  <div key={si} style={{ marginBottom: si < tpl.docSections.length - 1 ? "16px" : 0 }}>
                    {sec.heading && (
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: NAVY,
                          marginBottom: "8px",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {sec.heading}
                      </div>
                    )}
                    {sec.items.map((item, ii) => (
                      <DocItem key={ii} text={item} />
                    ))}
                  </div>
                ))}
              </section>
            )}

            {/* 5. Timeline */}
            {tpl.timeline.length > 0 && (
              <section style={{ marginBottom: "28px" }}>
                <SectionLabel number="5" title="Estimated Timeline" />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                  }}
                >
                  {tpl.timeline.map((item, i) => {
                    const [phaseRaw, timeRaw] = item.split(/:\s(.+)/);
                    const phase = phaseRaw.trim();
                    const time = timeRaw?.trim() || "";
                    return (
                      <div
                        key={i}
                        style={{
                          background: LIGHT_BG,
                          border: `1px solid ${BORDER}`,
                          borderRadius: "6px",
                          padding: "10px 14px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: NAVY,
                            marginBottom: "3px",
                          }}
                        >
                          {phase}
                        </div>
                        {time && (
                          <div style={{ fontSize: "12px", color: TEXT_MUTED }}>
                            {time}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 6. Important Notes */}
            {tpl.disclaimers.length > 0 && (
              <section>
                <SectionLabel number="6" title="Important Notes" />
                {tpl.disclaimerIntro && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: TEXT_MUTED,
                      fontStyle: "italic",
                      marginBottom: "10px",
                    }}
                  >
                    {tpl.disclaimerIntro}
                  </p>
                )}
                <div
                  style={{
                    background: "#fef9ec",
                    border: "1px solid #f5e07a",
                    borderRadius: "6px",
                    padding: "14px 16px",
                  }}
                >
                  {tpl.disclaimers.map((d, di) => (
                    <div
                      key={di}
                      style={{
                        display: "flex",
                        gap: "8px",
                        marginBottom: di < tpl.disclaimers.length - 1 ? "7px" : 0,
                      }}
                    >
                      <span style={{ color: "#b45309", flexShrink: 0 }}>&#x26A0;</span>
                      <span style={{ fontSize: "12px", color: "#78350f", lineHeight: "1.5" }}>
                        {d}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      ))}

      {/* ===== PROFESSIONAL FEES ===== */}
      <div style={{ padding: "32px 40px", borderBottom: `1px solid ${BORDER}` }}>
        <SectionLabel number={String(templates.length > 1 ? "A" : "7")} title="Professional Fees" />
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
            marginBottom: "12px",
          }}
        >
          <thead>
            <tr style={{ background: NAVY, color: "#fff" }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Description
              </th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                ALL
              </th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                EUR (approx.)
              </th>
            </tr>
          </thead>
          <tbody>
            {consultationFee > 0 && (
              <tr style={{ background: LIGHT_BG }}>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${BORDER}` }}>
                  Consultation Fee
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${BORDER}` }}>
                  {consultationFee.toLocaleString()}
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${BORDER}` }}>
                  {fmt(consultationFee * EUR_RATE)}
                </td>
              </tr>
            )}
            {serviceFee > 0 && (
              <tr>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${BORDER}` }}>
                  Service Fee
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${BORDER}` }}>
                  {serviceFee.toLocaleString()}
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${BORDER}` }}>
                  {fmt(serviceFee * EUR_RATE)}
                </td>
              </tr>
            )}
            {poaFee > 0 && (
              <tr style={{ background: LIGHT_BG }}>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${BORDER}` }}>
                  Power of Attorney
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${BORDER}` }}>
                  {poaFee.toLocaleString()}
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${BORDER}` }}>
                  {fmt(poaFee * EUR_RATE)}
                </td>
              </tr>
            )}
            {translationFee > 0 && (
              <tr>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${BORDER}` }}>
                  Translation &amp; Notarization
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${BORDER}` }}>
                  {translationFee.toLocaleString()}
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${BORDER}` }}>
                  {fmt(translationFee * EUR_RATE)}
                </td>
              </tr>
            )}
            {otherFees > 0 && (
              <tr style={{ background: LIGHT_BG }}>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${BORDER}` }}>
                  Other Fees
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${BORDER}` }}>
                  {otherFees.toLocaleString()}
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${BORDER}` }}>
                  {fmt(otherFees * EUR_RATE)}
                </td>
              </tr>
            )}
            {/* Total row */}
            <tr style={{ background: NAVY, color: "#fff" }}>
              <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: "14px" }}>
                Total
              </td>
              <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: "14px" }}>
                {totalALL.toLocaleString()} ALL
              </td>
              <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: "14px" }}>
                {fmt(totalEUR)} EUR
              </td>
            </tr>
          </tbody>
        </table>
        {totalALL > 0 && (
          <div
            style={{
              fontSize: "11px",
              color: TEXT_MUTED,
              background: LIGHT_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: "4px",
              padding: "8px 12px",
            }}
          >
            Indicative equivalents: USD {fmt(totalUSD)} &#8226; GBP {fmt(totalGBP)} &#8226; exchange rates are approximate and for reference only.
          </div>
        )}
        {fields.additionalCostsNote && (
          <p
            style={{
              fontSize: "12px",
              color: TEXT_MUTED,
              fontStyle: "italic",
              marginTop: "10px",
            }}
          >
            {fields.additionalCostsNote}
          </p>
        )}
      </div>

      {/* ===== PAYMENT TERMS ===== */}
      <div style={{ padding: "32px 40px", borderBottom: `1px solid ${BORDER}` }}>
        <SectionLabel number={String(templates.length > 1 ? "B" : "8")} title="Payment Terms" />
        {templates.map((tpl, ti) => (
          <div
            key={tpl.svcKey}
            style={{ marginBottom: ti < templates.length - 1 ? "18px" : 0 }}
          >
            {templates.length > 1 && (
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: NAVY,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "8px",
                }}
              >
                {tpl.serviceTitle}
              </div>
            )}
            {tpl.paymentTerms.map((pt, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "10px",
                  marginBottom: "6px",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    background: ACCENT,
                    color: "#fff",
                    fontSize: "10px",
                    fontWeight: 700,
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: "13px", color: TEXT_MAIN, lineHeight: "1.5" }}>
                  {pt}
                </span>
              </div>
            ))}
          </div>
        ))}
        {fields.paymentTermsNote && (
          <p
            style={{
              fontSize: "12px",
              color: TEXT_MUTED,
              fontStyle: "italic",
              marginTop: "10px",
              borderTop: `1px solid ${BORDER}`,
              paddingTop: "10px",
            }}
          >
            {fields.paymentTermsNote}
          </p>
        )}
      </div>

      {/* ===== NEXT STEPS ===== */}
      <div style={{ padding: "32px 40px", borderBottom: `1px solid ${BORDER}` }}>
        <SectionLabel number={String(templates.length > 1 ? "C" : "9")} title="Next Steps" />
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {allNextSteps.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "flex-start",
                background: LIGHT_BG,
                border: `1px solid ${BORDER}`,
                borderRadius: "6px",
                padding: "10px 14px",
              }}
            >
              <span
                style={{
                  background: ACCENT,
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: 700,
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: "13px", color: TEXT_MAIN, lineHeight: "1.5" }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ===== FOOTER ===== */}
      <div
        style={{
          background: NAVY,
          color: "rgba(255,255,255,0.7)",
          padding: "20px 40px",
          fontSize: "11px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div>
          <span style={{ color: "#fff", fontWeight: 600 }}>
            DAFKU Law Firm &#8226; Relocate Albania
          </span>
          <br />
          Tirana &#8226; Durres, Albania
        </div>
        <div style={{ textAlign: "right" }}>
          <div>info@dafkulawfirm.al &#8226; info@relocateto.al</div>
          <div style={{ marginTop: "4px", fontStyle: "italic", opacity: 0.7 }}>
            This proposal is confidential and valid for 30 days from the date of issue.
          </div>
        </div>
      </div>
    </div>
  );
}

