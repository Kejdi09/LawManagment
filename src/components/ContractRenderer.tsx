/**
 * ContractRenderer
 * Renders a formal Service Agreement / legal contract document.
 * Distinct from ProposalRenderer — contains binding legal clauses,
 * not process steps or marketing copy.
 */
import React from "react";
import { ServiceType, ProposalFields, SERVICE_LABELS } from "@/lib/types";
import { EUR_RATE, USD_RATE, fmt } from "@/components/ProposalRenderer";

// ── Design tokens (same palette as ProposalRenderer) ──
const NAVY    = "#0d1c2e";
const ACCENT  = "#a57c32";
const LIGHT_BG = "#f9f7f4";
const BORDER  = "#ddd5c3";
const TEXT_MAIN = "#111827";
const TEXT_MUTED = "#5a5570";

// ── Sub-components ──

function SectionLabel({ number, title }: { number: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", paddingBottom: "10px", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ width: "3px", height: "20px", background: ACCENT, borderRadius: "2px", flexShrink: 0 }} />
      <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.18em", color: ACCENT, flexShrink: 0 }}>
        §{number}
      </span>
      <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: NAVY }}>
        {title}
      </span>
    </div>
  );
}

function Clause({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: "10px", marginBottom: "7px" }}>
      <span style={{ color: ACCENT, fontWeight: 900, flexShrink: 0, marginTop: "3px", fontSize: "9px" }}>&#9654;</span>
      <span style={{ fontSize: "13px", color: TEXT_MAIN, lineHeight: "1.65" }}>{text}</span>
    </div>
  );
}

function SubClause({ label, text }: { label?: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: "10px", marginBottom: "6px", paddingLeft: "18px" }}>
      <span style={{ color: TEXT_MUTED, flexShrink: 0, fontSize: "12px" }}>—</span>
      <span style={{ fontSize: "12.5px", color: TEXT_MAIN, lineHeight: "1.6" }}>
        {label && <strong style={{ color: NAVY }}>{label}:&nbsp;</strong>}
        {text}
      </span>
    </div>
  );
}

// ── Props ──

interface ContractRendererProps {
  clientName: string;
  clientId: string;
  services: ServiceType[];
  fields: Partial<ProposalFields>;
  innerRef?: React.RefObject<HTMLDivElement>;
  /** If the contract was already signed electronically, pass the signer's name + ISO timestamp */
  signedByName?: string;
  signedAt?: string;
}

// ── Main component ──

export default function ContractRenderer({
  clientName,
  clientId,
  services,
  fields,
  innerRef,
  signedByName,
  signedAt,
}: ContractRendererProps) {
  const svcs = (services || []) as ServiceType[];

  // Fees
  const consultationFee = fields.consultationFeeALL ?? 0;
  const serviceFee      = fields.serviceFeeALL ?? 0;
  const poaFee          = fields.poaFeeALL ?? 0;
  const translationFee  = fields.translationFeeALL ?? 0;
  const otherFees       = fields.otherFeesALL ?? 0;
  const totalALL        = consultationFee + serviceFee + poaFee + translationFee + otherFees;
  const totalEUR        = totalALL * EUR_RATE;
  const totalUSD        = totalALL * USD_RATE;

  const displayDate = fields.proposalDate
    ? new Date(fields.proposalDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const signedDate = signedAt
    ? new Date(signedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  const hasRealEstate = svcs.includes("real_estate");
  const hasPensioner  = svcs.includes("residency_pensioner");
  const hasVisaD      = svcs.includes("visa_d");
  const hasCompany    = svcs.includes("company_formation");

  // Payment schedule: default 50/50 unless custom
  const paymentNote = fields.paymentTermsNote ?? null;

  const serviceLabels = svcs
    .filter((s) => SERVICE_LABELS[s])
    .map((s) => SERVICE_LABELS[s]);

  const feeRows: { label: string; all: number }[] = [
    ...(consultationFee > 0 ? [{ label: "Consultation Fee", all: consultationFee }] : []),
    ...(serviceFee > 0       ? [{ label: "Professional Service Fee", all: serviceFee }] : []),
    ...(poaFee > 0           ? [{ label: "Power of Attorney", all: poaFee }] : []),
    ...(translationFee > 0   ? [{ label: "Translation & Notarisation", all: translationFee }] : []),
    ...(otherFees > 0        ? [{ label: fields.additionalCostsNote || "Other / Additional Costs", all: otherFees }] : []),
  ];

  return (
    <div
      ref={innerRef}
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        background: "#ffffff",
        color: TEXT_MAIN,
        fontSize: "13px",
        lineHeight: "1.6",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      {/* ══ HEADER ══ */}
      <div style={{ background: NAVY, color: "#fff", padding: "30px 44px 26px", borderBottom: `3px solid ${ACCENT}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "9px", letterSpacing: "0.3em", textTransform: "uppercase", color: ACCENT, marginBottom: "6px", fontWeight: 600 }}>
              DAFKU Law Firm &#8212; Legal Services
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px", lineHeight: 1.1 }}>
              Service Agreement
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "4px" }}>
              info@dafkulawfirm.al &#8226; +355 69 69 52 989 &#8226; Tirana, Albania
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: "11px", color: "rgba(255,255,255,0.75)", flexShrink: 0 }}>
            <div style={{ marginBottom: "4px" }}>
              <span style={{ opacity: 0.55, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Date&#8194;</span>
              <span style={{ color: "#fff", fontWeight: 600 }}>{displayDate}</span>
            </div>
            <div>
              <span style={{ opacity: 0.55, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Ref&#8194;</span>
              <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.85)" }}>{clientId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══ CLIENT BAND ══ */}
      <div style={{ background: LIGHT_BG, padding: "18px 44px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: "3px" }}>Client Party</div>
          <div style={{ fontSize: "17px", fontWeight: 700, color: NAVY }}>{clientName}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: "4px" }}>Services Engaged</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            {serviceLabels.map((lbl, i) => (
              <span key={i} style={{ background: NAVY, color: "#fff", fontSize: "10px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", letterSpacing: "0.03em" }}>
                {lbl}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══ LEGAL BODY ══ */}
      <div style={{ padding: "36px 44px" }}>

        {/* PREAMBLE */}
        <div style={{ background: LIGHT_BG, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${ACCENT}`, borderRadius: "4px", padding: "14px 18px", marginBottom: "28px", fontSize: "12.5px", color: TEXT_MAIN, lineHeight: 1.7 }}>
          This <strong>Service Agreement</strong> (the &ldquo;Agreement&rdquo;) is entered into on{" "}
          <strong>{displayDate}</strong> between <strong>DAFKU Law Firm</strong>, a licensed legal practice registered
          in the Republic of Albania (&ldquo;the Firm&rdquo;), and <strong>{clientName}</strong> (&ldquo;the Client&rdquo;).
          Together referred to as &ldquo;the Parties&rdquo;. By accepting this Agreement the Parties agree to be bound
          by all terms and conditions set out herein.
        </div>

        {/* §1 DEFINITIONS */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="1" title="Definitions" />
          <SubClause label="Agreement" text='means this Service Agreement including any schedules or annexes.' />
          <SubClause label="Firm" text='means DAFKU Law Firm, registered in Albania, providing legal and immigration services.' />
          <SubClause label="Client" text={`means ${clientName}, the individual engaging the Firm for the services described herein.`} />
          <SubClause label="Services" text="means the legal services described in §2 below." />
          <SubClause label="Fee" text="means the total legal service fee payable as set out in §3 below." />
          <SubClause label="Confidential Information" text="means any information disclosed by either Party in connection with this Agreement that is marked confidential or by its nature ought to be treated as confidential." />
        </section>

        {/* §2 SCOPE OF SERVICES */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="2" title="Scope of Services" />
          <p style={{ fontSize: "13px", color: TEXT_MAIN, marginBottom: "12px", lineHeight: "1.6" }}>
            The Firm agrees to provide the following legal services to the Client in the Republic of Albania:
          </p>
          {serviceLabels.map((lbl, i) => (
            <Clause key={i} text={lbl} />
          ))}
          <p style={{ fontSize: "12px", color: TEXT_MUTED, marginTop: "12px", lineHeight: "1.6" }}>
            A detailed description of the scope, process steps, required documents, and estimated timeline for each
            service was provided in the Service Proposal (Ref: {clientId}) delivered prior to this Agreement,
            which forms an informational annex. This Agreement governs the legal engagement; the Proposal describes
            operational scope only.
          </p>
          {(hasPensioner || hasVisaD || hasCompany) && (
            <p style={{ fontSize: "12px", color: TEXT_MUTED, marginTop: "8px", lineHeight: "1.6" }}>
              Immigration and residency decisions are made exclusively by the competent Albanian authorities
              (Directorate for Border and Migration, Ministry of Interior). The Firm provides legal representation
              and process management; approval is not guaranteed and is not within the Firm&apos;s control.
            </p>
          )}
          {hasRealEstate && (
            <p style={{ fontSize: "12px", color: TEXT_MUTED, marginTop: "8px", lineHeight: "1.6" }}>
              Real estate title registration is managed by the Albanian State Cadastre (ASHK). Processing timelines
              are set by that authority and are not within the Firm&apos;s control.
            </p>
          )}
        </section>

        {/* §3 FEES & PAYMENT */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="3" title="Fees & Payment Schedule" />

          {feeRows.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "16px" }}>
              <thead>
                <tr>
                  <th style={{ background: NAVY, color: "#fff", padding: "8px 12px", textAlign: "left", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>Description</th>
                  <th style={{ background: NAVY, color: "#fff", padding: "8px 12px", textAlign: "right", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>Amount (ALL)</th>
                  <th style={{ background: NAVY, color: "#fff", padding: "8px 12px", textAlign: "right", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>≈ EUR</th>
                </tr>
              </thead>
              <tbody>
                {feeRows.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : LIGHT_BG }}>
                    <td style={{ padding: "8px 12px", color: TEXT_MAIN }}>{row.label}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: TEXT_MAIN }}>{fmt(row.all, 0)} ALL</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: TEXT_MUTED }}>€{fmt(row.all * EUR_RATE)}</td>
                  </tr>
                ))}
                <tr style={{ background: NAVY }}>
                  <td style={{ padding: "9px 12px", color: "#fff", fontWeight: 700, fontSize: "12px" }}>TOTAL DUE</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", color: ACCENT, fontWeight: 700, fontFamily: "monospace" }}>{fmt(totalALL, 0)} ALL</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", color: "rgba(255,255,255,0.8)", fontFamily: "monospace", fontSize: "12px" }}>€{fmt(totalEUR)} / ${fmt(totalALL * USD_RATE)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {totalALL === 0 && (
            <div style={{ background: LIGHT_BG, border: `1px solid ${BORDER}`, borderRadius: "6px", padding: "12px 16px", fontSize: "13px", color: TEXT_MUTED, marginBottom: "16px" }}>
              Fee amounts to be confirmed by the Firm and agreed in writing prior to commencement of work.
            </div>
          )}

          {paymentNote ? (
            <Clause text={paymentNote} />
          ) : (
            <>
              <Clause text="50% of the total service fee is payable upon signing this Agreement. Work commences upon receipt of this initial payment." />
              <Clause text="The remaining 50% is payable before the final stage of the engagement (submission of the principal application or completion of the transaction)." />
            </>
          )}
          <Clause text="Government fees, third-party notary fees, cadastral fees, and official stamp duties are not included in the above and are payable separately as they fall due." />
          <Clause text="All service fees are quoted in Albanian Lek (ALL). EUR/USD equivalents are indicative only based on the rate at the time of issue." />
          <Clause text="Payments should be made to the Firm's bank account details as separately communicated in writing. Online or bank transfer only." />
          <Clause text="All fees paid are non-refundable once work on the relevant stage has commenced, except where the Firm is in material breach of this Agreement." />
        </section>

        {/* §4 CLIENT OBLIGATIONS */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="4" title="Client Obligations" />
          <Clause text="Pay all fees in accordance with the payment schedule in §3." />
          <Clause text="Provide all required documents, information, and signatures promptly when requested by the Firm. Delays caused by the Client may affect processing times and do not entitle the Client to a refund." />
          <Clause text="Ensure all documents and information provided are accurate, complete, and genuine. The Client indemnifies the Firm against any consequences arising from false or misleading information." />
          <Clause text="Attend appointments, biometric sessions, or authority meetings as scheduled by the Firm with reasonable notice." />
          <Clause text="Not engage any other legal representative for the same matter without prior written notice to the Firm." />
          <Clause text="Notify the Firm promptly of any changes in personal circumstances, contact details, or immigration status that may affect the engagement." />
        </section>

        {/* §5 FIRM OBLIGATIONS */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="5" title="Obligations of the Firm" />
          <Clause text="Provide the Services with reasonable professional skill, care, and diligence in accordance with Albanian law and professional standards." />
          <Clause text="Keep the Client informed of material progress and any significant developments affecting the engagement." />
          <Clause text="Maintain the confidentiality of all Client information in accordance with §6 below." />
          <Clause text="Not delegate the Client's file to unqualified personnel without appropriate supervision." />
          <Clause text="Act in the Client's best interests at all times, subject to applicable law and professional ethics." />
          <Clause text="Provide the Client with copies of all key documents submitted or received on their behalf upon request." />
        </section>

        {/* §6 CONFIDENTIALITY & DATA */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="6" title="Confidentiality & Data Protection" />
          <Clause text="Both Parties agree to keep Confidential Information strictly confidential and not to disclose it to any third party without prior written consent, except as required by law or regulatory authority." />
          <Clause text="The Firm processes personal data in accordance with applicable data protection legislation, including the Law on Personal Data Protection (Law No. 9887, as amended) of Albania, which aligns with EU GDPR principles." />
          <Clause text="The Client's personal data is collected and used solely for the purpose of providing the Services and will not be sold or shared with unrelated third parties." />
          <Clause text="The Client may request access to, correction of, or deletion of their personal data at any time by written request to the Firm." />
          <Clause text="The confidentiality obligation survives termination of this Agreement indefinitely." />
        </section>

        {/* §7 COMMUNICATION */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="7" title="Communication & Progress Updates" />
          <Clause text="The Firm will provide progress updates via the secure client portal, email, or WhatsApp as appropriate." />
          <Clause text="The Client is responsible for monitoring the portal and any communications sent to the email or phone number provided during registration." />
          <Clause text="Formal notices under this Agreement must be in writing (email to info@dafkulawfirm.al is sufficient unless otherwise specified)." />
          <Clause text="Office hours: Monday–Friday, 09:00–17:00 CET. Response time: within 2 business days for non-urgent matters." />
        </section>

        {/* §8 TERMINATION */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="8" title="Termination" />
          <Clause text="Either Party may terminate this Agreement by giving 14 days' written notice to the other Party." />
          <Clause text="The Firm may terminate immediately if the Client provides false information, fails to pay fees when due (after a 7-day cure period), or the continued engagement would conflict with the Firm's professional obligations." />
          <Clause text="Upon termination, fees are due for all work completed up to the termination date. Fees already paid for work not yet commenced are refundable within 30 days, unless the termination is due to Client default." />
          <Clause text="The Firm will provide the Client with copies of all official documents already obtained on the Client's behalf." />
        </section>

        {/* §9 LIMITATION OF LIABILITY */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="9" title="Limitation of Liability" />
          <Clause text="The Firm's total liability under this Agreement shall not exceed the total fees paid by the Client in the 12 months preceding the event giving rise to the claim." />
          <Clause text="The Firm is not liable for decisions made by Albanian governmental authorities, courts, or third parties outside the Firm's control." />
          <Clause text="The Firm is not liable for delays caused by Client non-cooperation, missing documents, or force majeure events." />
          <Clause text="Nothing in this clause limits liability for fraud, gross negligence, or wilful misconduct." />
        </section>

        {/* §10 FORCE MAJEURE */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="10" title="Force Majeure" />
          <Clause text="Neither Party shall be liable for failure to perform obligations if such failure is caused by events beyond reasonable control, including but not limited to acts of government, natural disasters, pandemics, or civil unrest." />
          <Clause text="The affected Party must notify the other as soon as practicable and use reasonable efforts to mitigate the impact." />
        </section>

        {/* §11 GOVERNING LAW */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="11" title="Governing Law & Jurisdiction" />
          <Clause text="This Agreement is governed by and construed in accordance with the laws of the Republic of Albania." />
          <Clause text="Any dispute arising under or in connection with this Agreement shall first be referred to good-faith negotiation. Failing resolution within 30 days, the dispute shall be subject to the exclusive jurisdiction of the competent courts of Tirana, Albania." />
        </section>

        {/* §12 ENTIRE AGREEMENT */}
        <section style={{ marginBottom: "28px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SectionLabel number="12" title="Entire Agreement & Amendments" />
          <Clause text="This Agreement constitutes the entire agreement between the Parties with respect to its subject matter and supersedes all prior negotiations, representations, or undertakings." />
          <Clause text="Any amendment to this Agreement must be in writing and signed (or electronically confirmed) by both Parties." />
          <Clause text="If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions continue in full force." />
        </section>

        {/* ACCEPTANCE / SIGNATURE BLOCK */}
        <section style={{ pageBreakInside: "avoid", breakInside: "avoid", marginBottom: "0" }}>
          <SectionLabel number="13" title="Acceptance & Electronic Signature" />
          <p style={{ fontSize: "12.5px", color: TEXT_MAIN, marginBottom: "20px", lineHeight: 1.7 }}>
            By electronically accepting this Agreement through the DAFKU client portal, the Client confirms they have
            read, understood, and agreed to all terms and conditions set out above. Electronic acceptance via the
            portal constitutes a legally binding signature equivalent for the purposes of this Agreement and
            Albanian law on electronic signatures (Law No. 9880, as amended).
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", marginTop: "16px" }}>
            {/* Client column */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: "38px" }}>
                Client
              </div>
              <div style={{ borderTop: `1px solid ${NAVY}`, paddingTop: "8px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: TEXT_MAIN }}>
                  {signedByName || clientName}
                </div>
                {signedByName && (
                  <div style={{ fontSize: "10px", color: ACCENT, marginTop: "2px", fontStyle: "italic" }}>
                    Signed electronically via client portal
                  </div>
                )}
                <div style={{ fontSize: "11px", color: TEXT_MUTED, marginTop: "4px" }}>
                  Date: {signedDate || "____________________"}
                </div>
              </div>
            </div>
            {/* Firm column */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: "38px" }}>
                DAFKU Law Firm
              </div>
              <div style={{ borderTop: `1px solid ${NAVY}`, paddingTop: "8px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: TEXT_MAIN }}>Authorised Representative</div>
                <div style={{ fontSize: "11px", color: TEXT_MUTED, marginTop: "4px" }}>
                  Date: {displayDate}
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* ══ FOOTER ══ */}
      <div style={{
        background: NAVY,
        borderTop: `3px solid ${ACCENT}`,
        color: "rgba(255,255,255,0.65)",
        padding: "18px 44px",
        fontSize: "10px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "8px",
      }}>
        <div>
          <span style={{ color: ACCENT, fontWeight: 700, letterSpacing: "0.08em" }}>DAFKU LAW FIRM</span>
          <br />
          <span style={{ marginTop: "3px", display: "block" }}>Tirana &#8226; Dur&#235;s, Albania &#8226; info@dafkulawfirm.al</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div>Ref: {clientId}</div>
          <div style={{ marginTop: "4px", fontStyle: "italic", color: "rgba(255,255,255,0.4)" }}>
            This agreement is confidential. Acceptance constitutes a legally binding commitment.
          </div>
        </div>
      </div>
    </div>
  );
}
