/**
 * ProposalRenderer
 * Shared verbatim template renderer used by both ProposalModal (admin)
 * and ClientPortal (customer view).  Renders the exact same content as
 * the four docx templates: Pensioner · Employment · Company Formation · Real Estate.
 */
import React from "react";
import { ServiceType, ProposalFields, SERVICE_LABELS } from "@/lib/types";
import { getServiceContent, fmt, EUR_RATE, USD_RATE, GBP_RATE } from "@/components/ProposalModal";

interface ProposalRendererProps {
  clientName: string;
  clientId: string;
  services: ServiceType[];
  fields: Partial<ProposalFields>;
  /** Pass a React ref to have it attached to the rendered div (for PDF / print) */
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

  // ── Fee calculations ────────────────────────────────────────────────────────
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
    ? new Date(fields.proposalDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".")
    : "";

  const serviceContent = getServiceContent(svcs, fields as ProposalFields);
  const hp = !!(serviceContent.processSteps?.length);

  const cls = "bg-white text-gray-900 rounded-lg border shadow-sm p-10 font-serif text-[13px] leading-relaxed";
  const sty: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif" };

  // ── Shared sub-components ────────────────────────────────────────────────────
  const CommonCover = ({ contactLine }: { contactLine: React.ReactNode }) => (
    <>
      <h1 className="text-2xl font-bold text-center uppercase tracking-widest mb-1">Service Proposal</h1>
      <p className="text-center text-sm text-gray-500 mb-1">Presented to: <strong>{clientName}</strong></p>
      <p className="text-center text-xs text-gray-400 mb-8">Client ID: {clientId}</p>
      <div className="border rounded p-4 mb-2 bg-gray-50">
        <p className="text-sm font-semibold mb-1">Services Provided:</p>
        <p className="text-sm">{fields.proposalTitle}</p>
      </div>
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
      {contactLine}
    </>
  );

  const RelocateContactBar = () => (
    <div className="border rounded p-4 mb-8 bg-gray-50 text-xs text-gray-700 flex flex-wrap gap-4">
      <span>☎ +355 69 69 52 989</span>
      <span>✉ info@relocatetoalbania.com</span>
      <span>🌐 www.relocatetoalbania.com</span>
      <span className="ml-auto font-semibold">Date: {displayDate}</span>
    </div>
  );

  const DafkuContactBar = () => (
    <div className="border rounded p-4 mb-8 bg-gray-50 text-xs text-gray-700 flex flex-wrap gap-4">
      <span>☎ +355 69 69 52 989</span>
      <span>✉ info@dafkulawfirm.al</span>
      <span>🌐 www.dafkulawfirm.al</span>
      <span className="ml-auto font-semibold">Date: {displayDate}</span>
    </div>
  );

  const BusinessGroupFooter = () => (
    <div className="mt-10 border-t pt-6">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Part of Business Group</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-700">
        <div className="border rounded p-3 bg-gray-50">
          <p className="font-semibold mb-1">DAFKU Law Firm</p>
          <p>Legal services in Albania</p>
          <p>www.dafkulawfirm.al</p>
        </div>
        <div className="border rounded p-3 bg-gray-50">
          <p className="font-semibold mb-1">Relocate to Albania</p>
          <p>Immigration &amp; Residency services</p>
          <p>www.relocatetoalbania.com</p>
        </div>
        <div className="border rounded p-3 bg-gray-50">
          <p className="font-semibold mb-1">Albania Real Estate</p>
          <p>Property investment services</p>
          <p>www.albaniaproperties.al</p>
        </div>
      </div>
    </div>
  );

  const FeeTable = () => (
    <>
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
            <td className="border px-3 py-1.5">Service fee for the assistance</td>
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
            <td className="border px-3 py-1.5">Documents Legal Translation and Notary{fields.additionalCostsNote ? ` (${fields.additionalCostsNote})` : " (to be specified later upon documents collection)"}</td>
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
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // TEMPLATE 1: RESIDENCY PERMIT FOR PENSIONER
  // ─────────────────────────────────────────────────────────────────────────────
  if (svcs.includes("residency_pensioner")) {
    return (
      <div ref={innerRef} className={cls} style={sty}>
        <CommonCover contactLine={<RelocateContactBar />} />
        <div className="border rounded p-4 mb-6 bg-gray-50">
          <p className="text-sm font-semibold mb-3">Case Overview</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Main Applicant</p>
              <p className="text-sm"><strong>Name:</strong> {clientName}</p>
              <p className="text-sm"><strong>Nationality:</strong> {fields.nationality || "—"}</p>
              <p className="text-sm"><strong>Occupation:</strong> {fields.employmentType || "—"}</p>
              <p className="text-sm"><strong>Relocation motive:</strong> Pensioner</p>
            </div>
            {fields.dependentName && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Dependent Wife</p>
                <p className="text-sm"><strong>Name:</strong> {fields.dependentName}</p>
                <p className="text-sm"><strong>Nationality:</strong> {fields.dependentNationality || "—"}</p>
                <p className="text-sm"><strong>Occupation:</strong> {fields.dependentOccupation || "—"}</p>
                <p className="text-sm"><strong>Relocation motive:</strong> Family Reunification</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Scope of Services Provided</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Full legal guidance during the entire application process</li>
            <li>Pre-check and verification of all documents before submission</li>
            <li>Assistance with translations, notarization, and legalization if required</li>
            <li>Preparing all declarations required by the authorities</li>
            <li>Completing the residence permit applications</li>
            <li>Scheduling all appointments with the relevant institutions</li>
            <li>Submission of the applications at the Local Directorate for Border and Migration</li>
            <li>Follow-up with the authorities until the final approval</li>
            <li>Assistance with the Civil Registry address registration</li>
            <li>Accompanying the applicant for biometric fingerprints</li>
            <li>Guidance until the applicant receives the final residence permit card</li>
            <li>Payment of government or third-party fees on behalf of the applicant</li>
            <li>Documents translation, apostille/legalization, or notary (if needed)</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Process Overview</p>
          <p className="text-sm font-semibold mb-1">STEP 1: Residency Permit for the Main Applicant – Pensioner</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
            <li>Documents collection and preparation (see below)</li>
            <li>Government Fees payment by us</li>
            <li>Residency Permit Application Submission at the Local Directorate for Border and Migration in Durrës</li>
            <li>Receiving Provisional Residency Permit</li>
            <li>Final Decision on Residency Permit</li>
            <li>Address Registration at Civil Registry Office</li>
            <li>Application for biometric Residency Permit Card</li>
            <li>Obtaining the biometric residence card</li>
          </ul>
          {fields.dependentName && (
            <>
              <p className="text-sm font-semibold mb-1">STEP 2: Residency Permit for Dependent – Family Reunification</p>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li>Same procedure as in first step</li>
              </ul>
            </>
          )}
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Required Documents</p>
          <p className="text-sm font-semibold mb-1">For the Main Applicant (Pensioner):</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
            <li>Photocopy of valid travel document (valid at least 3 months beyond the permit period, with at least 2 blank pages) — Provided by the Applicant</li>
            <li>Individual declarations for reason of staying in Albania — We prepare both in Albanian and English; you sign</li>
            <li>Proof of insurance in Albania — We arrange at our associate insurance company</li>
            <li>Evidence from a bank in Albania for the transfer of pension income — We support with bank account opening</li>
            <li>Legalized criminal record from the country of origin (issued within the last 6 months, translated and notarized) — We handle</li>
            <li>Evidence of an annual pension income exceeding 1,200,000 ALL — We handle legal translation and notary</li>
            <li>Proof of Residency Permit Government Fee Payment — We pay at the bank and provide the mandate</li>
            <li>Biometric fingerprints appointment and Residency Permit Card collection</li>
          </ul>
          {fields.dependentName && (
            <>
              <p className="text-sm font-semibold mb-1">For the Dependent (Family Reunification):</p>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li>Photocopy of valid travel document — Provided by the Applicant</li>
                <li>Individual declarations for reason of staying in Albania — We prepare; you sign</li>
                <li>Proof of insurance in Albania — We arrange</li>
                <li>Evidence of family relationship (marriage certificate, translated and notarized) — We handle legal translation and notary</li>
                <li>Legalized criminal record from the country of origin (issued within the last 6 months, translated and notarized) — We handle</li>
                <li>Proof of sufficient financial means of the main applicant — existing documents used</li>
                <li>Proof of Residency Permit Government Fee Payment — We pay at the bank and provide the mandate</li>
                <li>Accompanying the applicant for biometric fingerprints</li>
                <li>Biometric fingerprints appointment and Residency Permit Card collection</li>
              </ul>
            </>
          )}
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Fees &amp; Costs</p>
          <p className="text-sm mb-3">For the Residency Permit for Pensioner{fields.dependentName ? " and Family Reunification" : ""}, DAFKU Law Firm applies a fixed service fee per applicant, covering all procedural steps from application through to the final permit card.</p>
          <FeeTable />
          <p className="text-sm font-semibold mb-1">Costs Not Included</p>
          <p className="text-sm mb-1">The legal fee does not include:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Government fees and taxes.</li>
            <li>Notary fees related to the execution of agreements and notarization of documents.</li>
            <li>Translation and sworn translation costs, if documents are issued in a foreign language.</li>
            <li>Apostille or legalization costs, where required for foreign documents.</li>
            <li>Bank charges related to payment transfers (domestic or international).</li>
            <li>Courier or administrative expenses, including document delivery or official filings.</li>
            <li>Any third-party professional fees, if required.</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Payment Terms</p>
          <p className="text-sm">50% upon contract signing / file opening.</p>
          <p className="text-sm">50% before submission of the residence permit application.</p>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Timeline Overview</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Documents preparation – 3 – 5 business days</li>
            <li>Residency Permit – 30 – 45 business days</li>
            <li>Residency Permit ID Card – ~2 calendar weeks</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Important Notes &amp; Legal Disclaimers</p>
          <p className="text-sm mb-1">It is important for the Client to be aware of the following:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>All legal services are provided based on the documentation and information made available by the Client and third parties.</li>
            <li>Processing times are estimates and may vary due to institutional workload or additional requirements.</li>
            <li>Public authorities may request additional documents or clarifications at any stage of the process.</li>
            <li>The Firm cannot guarantee timelines or decisions made by public authorities.</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Next Steps</p>
          <p className="text-sm mb-1">Upon your approval of this proposal, the following steps will be taken:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Preparation and signing of the service agreement.</li>
            <li>Payment of the initial agreed fee.</li>
            <li>Documents collection and preparation.</li>
            <li>Residency Permit application submission.</li>
            <li>Follow-up with the authorities until the final decision.</li>
          </ul>
        </div>

        <BusinessGroupFooter />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEMPLATE 2: TYPE D VISA & RESIDENCE PERMIT FOR EMPLOYMENT
  // ─────────────────────────────────────────────────────────────────────────────
  if (svcs.includes("visa_d")) {
    return (
      <div ref={innerRef} className={cls} style={sty}>
        <CommonCover contactLine={<RelocateContactBar />} />
        <div className="border rounded p-4 mb-6 bg-gray-50">
          <p className="text-sm font-semibold mb-3">Case Overview</p>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Client</p>
            <p className="text-sm"><strong>Name:</strong> {clientName}</p>
            <p className="text-sm"><strong>Nationality:</strong> {fields.nationality || "—"}</p>
            <p className="text-sm"><strong>Occupation:</strong> {fields.employmentType || "—"}</p>
            <p className="text-sm"><strong>Staff Relocation motive:</strong> Employment</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Scope of Services Provided</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Full legal guidance during the entire application process</li>
            <li>Pre-check and verification of all documents before submission</li>
            <li>Assistance with translations, notarization, and legalization if required</li>
            <li>Preparing all declarations required by the authorities</li>
            <li>Payment of government or third-party fees on behalf of the applicant</li>
            <li>Completing the visa and residence permit applications</li>
            <li>Scheduling all appointments with the relevant institutions</li>
            <li>Submission of the applications at the competent authorities</li>
            <li>Follow-up with the authorities until the final approval</li>
            <li>Assistance with the Civil Registry address registration</li>
            <li>Accompanying the applicant for biometric fingerprints</li>
            <li>Guidance until the applicant receives the final residence permit card</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Process Overview</p>
          <p className="text-sm font-semibold mb-1">STEP 1: Type D Visa</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
            <li>Issuing Power of Attorney (if needed)</li>
            <li>Preparation of employment contract</li>
            <li>Preparation of Accommodation proof (contract or declaration)</li>
            <li>Documents collection and preparation (see below)</li>
            <li>Visa and Residency Permit Government Fees payment by us</li>
            <li>Visa application submission</li>
            <li>Decision on the visa approval</li>
          </ul>
          <p className="text-sm font-semibold mb-1">STEP 2: Residency Permit</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>As soon as the visa is approved and you enter the Albanian border, the Residency Permit procedure starts automatically</li>
            <li>Delivering the original documents and the Residency Permit application at the Local Directorate for Border and Migration</li>
            <li>Receiving Provisional Residency Permit</li>
            <li>Final Decision on Residency Permit</li>
            <li>Address Registration at Civil Registry Office</li>
            <li>Application for biometric Residency Permit Card</li>
            <li>Obtaining the biometric residence card</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Required Documents</p>
          <p className="text-sm font-semibold mb-1">For the Type D Visa Application (Employee):</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
            <li>Passport-size photograph (47mm × 36mm, taken within the last 6 months, white background, neutral expression) — Provided by the Applicant</li>
            <li>Photocopy of valid travel document (valid at least 3 months beyond the visa period, with at least 2 blank pages) — Provided by the Applicant</li>
            <li>Document certifying accommodation in Albania (notarized rental contract or hosting declaration) — We arrange</li>
            <li>Document proving professional/commercial activity in the applicant's country related to the visa purpose — Provided by the Applicant</li>
            <li>Residence Permit (12+ months) from country of residence if different from nationality country (valid 3+ additional months beyond visa period)</li>
            <li>Document proving legal status of the inviting entity — We obtain from accountant</li>
            <li>Invitation signed by the host — We prepare; applicant signs</li>
            <li>Employment contract drafted according to Albanian Labor Code — We prepare</li>
          </ul>
          <p className="text-sm font-semibold mb-1">For the Residency Permit Application (Employee):</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Photocopy of valid travel document — Provided by the Applicant</li>
            <li>Proof of Residency Permit Government Fee Payment — We pay at the bank and provide the mandate</li>
            <li>Passport-size photograph (two printed copies + digital copy sent to us via email)</li>
            <li>Proof of accommodation in Albania (notarized rental contract)</li>
            <li>Employment contract according to Albanian Labor Code — We prepare</li>
            <li>Proof of professional qualification (diploma / certificate / reference / self-declaration)</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Fees &amp; Costs</p>
          <p className="text-sm mb-3">For Type D Visa and Residency Permit applications for employment, DAFKU Law Firm applies a fixed legal service fee per applicant, covering all procedural steps from visa application through to the final permit card.</p>
          <FeeTable />
          <p className="text-sm font-semibold mb-1">Costs Not Included</p>
          <p className="text-sm mb-1">The legal fee does not include:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Government fees and taxes.</li>
            <li>Notary fees related to the execution of agreements and notarization of documents.</li>
            <li>Translation and sworn translation costs, if documents are issued in a foreign language.</li>
            <li>Apostille or legalization costs, where required for foreign documents.</li>
            <li>Bank charges related to payment transfers (domestic or international).</li>
            <li>Courier or administrative expenses, including document delivery or official filings.</li>
            <li>Any third-party professional fees, if required.</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Payment Terms</p>
          <p className="text-sm">50% upon contract signing.</p>
          <p className="text-sm">30% after visa issuing and before residency permit application.</p>
          <p className="text-sm">20% upon approval of residency permit and before fingerprint setting.</p>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Timeline Overview</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Documents preparation – 3 – 5 business days</li>
            <li>Visa processing – 15 – 30 business days</li>
            <li>Residency Permit – 30 – 45 business days</li>
            <li>Residency Permit ID Card – ~ 2 calendar weeks</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Important Notes &amp; Legal Disclaimers</p>
          <p className="text-sm mb-1">It is important for the Client to be aware of the following:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>All legal services are provided based on the documentation and information made available by the Client and third parties.</li>
            <li>Processing times are estimates and may vary due to institutional workload or additional requirements.</li>
            <li>Public authorities may request additional documents or clarifications at any stage of the process.</li>
            <li>The applicant can start working at the company legally after the visa is issued despite the fact that the residency permit is still pending.</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Next Steps</p>
          <p className="text-sm mb-1">Upon your approval of this proposal, the following steps will be taken:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Preparation and signing of the service agreement.</li>
            <li>Payment of the initial agreed fee.</li>
            <li>Documents collection and preparation.</li>
            <li>Visa application submission.</li>
            <li>Residency Permit application submission after visa approval.</li>
            <li>Follow-up with the authorities until the final decision.</li>
          </ul>
        </div>

        <BusinessGroupFooter />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEMPLATE 3: COMPANY FORMATION + VISA D (SELF-EMPLOYED)
  // ─────────────────────────────────────────────────────────────────────────────
  if (svcs.includes("company_formation")) {
    return (
      <div ref={innerRef} className={cls} style={sty}>
        <CommonCover contactLine={<RelocateContactBar />} />
        <div className="border rounded p-4 mb-6 bg-gray-50">
          <p className="text-sm font-semibold mb-3">Case Overview</p>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Main Applicant</p>
            <p className="text-sm"><strong>Name:</strong> {clientName}</p>
            <p className="text-sm"><strong>Nationality:</strong> {fields.nationality || "—"}</p>
            <p className="text-sm"><strong>Occupation:</strong> {fields.employmentType || "—"}</p>
            <p className="text-sm"><strong>Relocation motive:</strong> {fields.purposeOfStay || "Self-Employment/Company Registration"}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Scope of Services Provided</p>
          <p className="text-sm font-semibold mb-1">Services – Company Formation in Albania</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
            <li>Legal consultation and structuring of the company</li>
            <li>Selection and reservation of the company name</li>
            <li>Drafting of the Founding Act and Company Statute</li>
            <li>Registration of the company with the National Business Center (QKB)</li>
            <li>Issuance of the company registration certificate and NUIS (tax number)</li>
            <li>Registration with the tax authorities (VAT and contributions if applicable)</li>
            <li>Assistance with opening a corporate bank account</li>
            <li>Preparation of company documentation required for residency permit purposes</li>
          </ul>
          <p className="text-sm font-semibold mb-1">Services – Visa and Residency Permit Procedure</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Full legal guidance during the entire application process</li>
            <li>Pre-check and verification of all documents before submission</li>
            <li>Assistance with translations, notarization, and legalization if required</li>
            <li>Preparing all declarations required by the authorities</li>
            <li>Completing the visa and residence permit applications</li>
            <li>Scheduling all appointments with the relevant institutions</li>
            <li>Submission of the applications at the competent authorities</li>
            <li>Follow-up with the authorities until the final approval</li>
            <li>Assistance with the Civil Registry address registration</li>
            <li>Accompanying the applicant for biometric fingerprints</li>
            <li>Guidance until the applicant receives the final residence permit card</li>
            <li>Payment of government or third-party fees on behalf of the applicant</li>
            <li>Documents translation, apostille/legalization, or notary (if needed)</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Process Overview</p>
          <p className="text-sm font-semibold mb-1">STEP 1: Company Formation</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
            <li>Issuing Power of Attorney</li>
            <li>Registration documents preparation</li>
            <li>Company registration submission</li>
            <li>Obtaining TAX ID / NIPT</li>
            <li>Obtaining Registration Certificate by QKB</li>
            <li>Employee declaration</li>
          </ul>
          <p className="text-sm font-semibold mb-1">STEP 2: Visa and Residency Permit</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Documents collection and preparation (see below)</li>
            <li>Visa and Residency Permit Application and Government Fees payment by us</li>
            <li>Decision on the visa approval</li>
            <li>As soon as the visa is approved and you enter the Albanian border, the Residency Permit procedure starts automatically</li>
            <li>Residency Permit application at the Local Directorate for Border and Migration in the city where you will be based</li>
            <li>Receiving Provisional Residency Permit</li>
            <li>Final Decision on Residency Permit</li>
            <li>Address Registration at Civil Registry Office</li>
            <li>Application for biometric Residency Permit Card</li>
            <li>Obtaining the biometric residence card</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Required Documents</p>
          <p className="text-sm font-semibold mb-1">For Company Registration:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
            <li>Valid passport copy (for each shareholder and administrator)</li>
            <li>Contact details and residential address (foreign address)</li>
            <li>Company name proposal (at least two options)</li>
            <li>Description of business activity</li>
            <li>Appointment details of the company administrator</li>
            <li>Shareholding structure details</li>
            <li>Company address in Albania</li>
            <li>Power of Attorney (notarized and apostilled/legalized, if registration is done remotely)</li>
          </ul>
          <p className="text-sm font-semibold mb-1">For Type D Visa (Self-Employed):</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
            <li>Passport-size photograph (47mm × 36mm, taken within the last 6 months, white background, neutral expression)</li>
            <li>Photocopy of valid travel document (valid at least 3 months beyond the visa period, with at least 2 blank pages)</li>
            <li>Certification of professional capacity (diploma, certificate, qualifications related to self-employment)</li>
            <li>Business Registration Certificate — We provide upon company registration</li>
            <li>Document certifying accommodation in Albania (rental contract or accommodation declaration) — We can arrange</li>
            <li>Bank statement covering the last 12 months (income and outgoings)</li>
          </ul>
          <p className="text-sm font-semibold mb-1">For Residency Permit (Self-Employed):</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Photocopy of valid travel document</li>
            <li>Project idea for the business/activity (as required by the National Employment and Labor Agency) — We prepare</li>
            <li>Proof of sufficient financial means (minimum 500,000 ALL or equivalent) — We open the bank account; you make the deposit</li>
            <li>Document proving necessary skills (certificate / diploma or equivalent)</li>
            <li>Proof of registration of the activity in QKB — We provide upon company registration</li>
            <li>Payment Mandate of Government fee — We pay and provide the document</li>
            <li>Passport-size photograph (47mm × 36mm)</li>
            <li>Proof of accommodation in Albania (rental contract) — We can arrange</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Fees &amp; Costs</p>
          <p className="text-sm mb-3">For Company Formation combined with Type D Visa and Residency Permit, DAFKU Law Firm applies a fixed service fee covering both the company registration process and the complete immigration procedure.</p>
          <FeeTable />

          <p className="text-sm font-semibold mb-2 mt-4">Company Management Costs</p>
          <table className="w-full border-collapse text-sm mb-2">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-3 py-1.5 text-left">Service</th>
                <th className="border px-3 py-1.5 text-right">Cost / Month (ALL)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border px-3 py-1.5">Accounting services</td><td className="border px-3 py-1.5 text-right font-mono">5,000 ALL</td></tr>
              <tr><td className="border px-3 py-1.5">Legal services</td><td className="border px-3 py-1.5 text-right font-mono">5,000 ALL</td></tr>
              <tr><td className="border px-3 py-1.5">Virtual office</td><td className="border px-3 py-1.5 text-right font-mono">5,000 ALL</td></tr>
              <tr className="bg-gray-50 font-semibold"><td className="border px-3 py-1.5">Total Monthly</td><td className="border px-3 py-1.5 text-right font-mono">15,000 ALL / month</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mb-3">Note: The above are ongoing monthly management costs and are separate from the one-time service fee above.</p>

          <p className="text-sm font-semibold mb-2">Taxation Overview (Albania)</p>
          <table className="w-full border-collapse text-sm mb-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-3 py-1.5 text-left">Tax Type</th>
                <th className="border px-3 py-1.5 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border px-3 py-1.5">Corporate Income Tax (CIT)</td><td className="border px-3 py-1.5 text-right">15%</td></tr>
              <tr><td className="border px-3 py-1.5">Value Added Tax (VAT)</td><td className="border px-3 py-1.5 text-right">20%</td></tr>
              <tr><td className="border px-3 py-1.5">Personal Income Tax – Employment</td><td className="border px-3 py-1.5 text-right">0–23%</td></tr>
              <tr><td className="border px-3 py-1.5">Social Security Contributions (Employee)</td><td className="border px-3 py-1.5 text-right">11.2%</td></tr>
              <tr><td className="border px-3 py-1.5">Social Security Contributions (Employer)</td><td className="border px-3 py-1.5 text-right">16.7%</td></tr>
              <tr><td className="border px-3 py-1.5">Dividend Tax (Withholding)</td><td className="border px-3 py-1.5 text-right">8%</td></tr>
            </tbody>
          </table>

          <p className="text-sm font-semibold mb-1">Costs Not Included</p>
          <p className="text-sm mb-1">The legal fee does not include:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Government fees and taxes.</li>
            <li>Notary fees related to the execution of agreements and notarization of documents.</li>
            <li>Translation and sworn translation costs, if documents are issued in a foreign language.</li>
            <li>Apostille or legalization costs, where required for foreign documents.</li>
            <li>Bank charges related to payment transfers (domestic or international).</li>
            <li>Courier or administrative expenses, including document delivery or official filings.</li>
            <li>Any third-party professional fees, if required.</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Payment Terms</p>
          <p className="text-sm">50% upon contract signing / file opening.</p>
          <p className="text-sm">50% before submission of the visa and residency permit application.</p>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Timeline Overview</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Company Registration – 3 – 5 business days</li>
            <li>Visa processing – 15 – 30 business days</li>
            <li>Residency Permit – 30 – 45 business days</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Important Notes &amp; Legal Disclaimers</p>
          <p className="text-sm mb-1 font-semibold">Company management:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
            <li>All legal services are provided based on the documentation and information made available by the Client and third parties.</li>
            <li>The company registration timeline is subject to the processing speed of the National Business Center (QKB).</li>
            <li>Monthly management costs are billed separately and in advance.</li>
          </ul>
          <p className="text-sm mb-1 font-semibold">Visa and Residency Permit:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Processing times are estimates and may vary due to institutional workload or additional requirements.</li>
            <li>Public authorities may request additional documents or clarifications at any stage of the process.</li>
            <li>The Firm cannot guarantee timelines or decisions made by public authorities.</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">Next Steps</p>
          <p className="text-sm mb-1">Upon your approval of this proposal, the following steps will be taken:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Preparation and signing of the service agreement.</li>
            <li>Payment of the initial agreed fee.</li>
            <li>Documents collection and preparation.</li>
            <li>Company Registration.</li>
            <li>Visa and Residency Permit application submission.</li>
            <li>Follow-up with the authorities until the final decision.</li>
          </ul>
        </div>

        <BusinessGroupFooter />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEMPLATE 4: REAL ESTATE
  // ─────────────────────────────────────────────────────────────────────────────
  if (svcs.includes("real_estate")) {
    const propDesc = fields.propertyDescription || "residential property in Albania";
    const txVal = fields.transactionValueEUR ? `EUR ${fmt(fields.transactionValueEUR, 0)}` : "to be confirmed";
    return (
      <div ref={innerRef} className={cls} style={sty}>
        <CommonCover contactLine={<DafkuContactBar />} />

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">1 — Scope of the Proposal</p>
          <p className="text-sm">This proposal is prepared by DAFKU Law Firm for the provision of legal services in connection with the purchase of a {propDesc}. The total estimated transaction value is {txVal}. The services outlined below cover the full scope of legal assistance required for a secure and compliant property acquisition in Albania.</p>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">2 — Scope of Services Provided</p>
          <p className="text-sm font-semibold mb-1">2.1 Due Diligence and Title Verification</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
            <li>Full legal review of the property's title and ownership chain</li>
            <li>Verification of the property's registration status at the Immovable Property Registration Office (ZRPP)</li>
            <li>Search for any encumbrances, mortgages, liens, or legal disputes affecting the property</li>
            <li>Verification of the seller's legal capacity and authority to sell</li>
            <li>Verification of building permits, urban planning approvals, and compliance with applicable construction regulations</li>
            <li>Identification and disclosure of any legal risks or irregularities affecting the transaction</li>
          </ul>
          <p className="text-sm font-semibold mb-1">2.2 Contract Drafting and Review</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
            <li>Drafting or reviewing of the Preliminary Sale-Purchase Agreement (Compromis / Promesë Shitje)</li>
            <li>Drafting or reviewing of the Final Sale-Purchase Agreement for notarial execution</li>
            <li>Advising on contractual terms, conditions, and legal protections for the buyer</li>
            <li>Reviewing and advising on any side agreements, addenda, or developer agreements</li>
          </ul>
          <p className="text-sm font-semibold mb-1">2.3 Liaison with Third Parties</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
            <li>Coordination with the seller's legal counsel, real estate agents, and developer representatives</li>
            <li>Liaison with the notary public for the preparation and execution of the notarial deed</li>
            <li>Coordination with the ZRPP for title registration in the buyer's name</li>
            <li>Liaising with tax authorities for property transfer tax declarations and payments</li>
          </ul>
          <p className="text-sm font-semibold mb-1">2.4 Notarial Act and Registration</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
            <li>Attendance and legal representation at the notarial act signing</li>
            <li>Preparation and submission of all required documentation for the ZRPP registration</li>
            <li>Monitoring of the ZRPP registration process until completion</li>
            <li>Obtaining and delivering the certified title extract confirming the buyer's ownership</li>
          </ul>
          <p className="text-sm font-semibold mb-1">2.5 Payment Coordination and Escrow Advice</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
            <li>Advising on the payment structure and schedule in accordance with the purchase agreement</li>
            <li>Issuing payment instructions and confirming the release of funds at each contractual milestone</li>
            <li>Advising on payment methods (bank transfer, cash, escrow, or other arrangements)</li>
          </ul>
          <p className="text-sm font-semibold mb-1">2.6 Post-Acquisition Monitoring (Off-Plan Projects)</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Monitoring of construction progress and developer obligations until project handover</li>
            <li>Reviewing any change orders, amendments, or developer communications affecting the buyer</li>
            <li>Advising on handover procedures, snagging, and final title transfer upon project completion</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">3 — Required Documents</p>
          <p className="text-sm mb-1">Required Documentation from the Client:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Valid passport or national identity document</li>
            <li>Proof of residential address (utility bill, bank statement, or equivalent — issued within the last 3 months)</li>
            <li>Tax identification number (TIN) — from the buyer's country of residence or Albania</li>
            <li>Source of funds documentation (bank statement, employment contract, or equivalent) — as required for due diligence and compliance purposes</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">4 — Fees &amp; Costs</p>
          <p className="text-sm mb-3">DAFKU Law Firm charges a fixed legal service fee for the provision of the services described in this proposal. The fee is structured as follows:</p>
          <p className="text-sm font-semibold mb-1">Phase 1 — Legal Due Diligence, Contract and Transaction Management</p>
          <p className="text-sm mb-2">A fixed fee for legal due diligence, contract drafting and review, notarial attendance, title registration, and payment coordination.</p>
          <FeeTable />

          <p className="text-sm font-semibold mb-1 mt-2">Phase 2 — Post-Acquisition Monitoring (monthly retainer)</p>
          <table className="w-full border-collapse text-sm mb-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-3 py-1.5 text-left">Service</th>
                <th className="border px-3 py-1.5 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border px-3 py-1.5">Monthly retainer for post-acquisition monitoring and developer liaison</td><td className="border px-3 py-1.5 text-right font-mono">€50 / month</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mb-4">The monthly retainer applies from the date of preliminary agreement signing until the project handover and final title transfer (estimated completion: 2027).</p>

          <p className="text-sm font-semibold mb-1">Costs Not Included</p>
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

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">5 — Payment Terms</p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>50% of the Phase 1 fee is payable upon signing of the engagement agreement.</li>
            <li>50% of the Phase 1 fee is payable upon execution of the Final Notarial Sale-Purchase Agreement.</li>
            <li>The Phase 2 monthly retainer is payable monthly in advance, commencing from the date of the preliminary agreement signing.</li>
            <li>Government fees, notary fees, and any third-party costs are payable separately and in advance, before the relevant service or submission to the competent authorities.</li>
            <li>All legal service fees are non-refundable once the service has commenced and/or once any documentation has been submitted to a notary or public authority.</li>
            <li>Payments may be made via bank transfer, cash, card payment, PayPal, or other agreed payment methods.</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">6 — Timeline Overview</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Legal due diligence and title verification – 5 – 10 business days from receipt of all required documents</li>
            <li>Preliminary agreement drafting and signing – within 3 – 5 business days from due diligence completion</li>
            <li>Notarial act execution and ZRPP registration – upon project completion and final payment (estimated: 2027)</li>
            <li>Post-acquisition monitoring – ongoing, from preliminary agreement signing until final handover</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">7 — Important Notes &amp; Legal Disclaimers</p>
          <p className="text-sm mb-1">It is important for the Client to be aware of the following:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>All legal services are provided based on the documentation and information made available by the Client and third parties.</li>
            <li>The due diligence and legal review are limited to documents and information accessible through official Albanian public records and registers.</li>
            <li>The Firm is not responsible for delays or refusals caused by incomplete, inaccurate, or late documentation provided by third parties, including the developer or seller.</li>
            <li>The Firm cannot guarantee timelines or decisions made by notaries, banks, the ZRPP, or public authorities.</li>
            <li>Legal fees do not include government fees, notary fees, or any third-party costs unless explicitly stated.</li>
            <li>For off-plan properties, completion timelines are subject to the developer's construction schedule and are beyond the control of the Firm.</li>
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-3">8 — Next Steps</p>
          <p className="text-sm mb-1">Upon your approval of this proposal, the following steps will be taken:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>Execution of the legal service engagement agreement.</li>
            <li>Payment of the initial portion of the legal fee as agreed.</li>
            <li>Commencement of legal due diligence and title verification.</li>
            <li>Drafting and review of the Preliminary Sale-Purchase Agreement.</li>
            <li>Coordination with the notary for the execution of the final agreement.</li>
            <li>Post-acquisition monitoring until project completion and final title transfer.</li>
          </ul>
        </div>

        <BusinessGroupFooter />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FALLBACK: Generic renderer for other service types
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div ref={innerRef} className={cls} style={sty}>
      <h1 className="text-2xl font-bold text-center uppercase tracking-widest mb-1">Service Proposal</h1>
      <p className="text-center text-sm text-gray-500 mb-1">Presented to: <strong>{clientName}</strong></p>
      <p className="text-center text-xs text-gray-400 mb-8">Client ID: {clientId}</p>
      <div className="border rounded p-4 mb-2 bg-gray-50">
        <p className="text-sm font-semibold mb-1">Services Provided:</p>
        <p className="text-sm">{fields.proposalTitle}</p>
      </div>
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
      {(fields.nationality || fields.employmentType || fields.purposeOfStay) && (
        <div className="border rounded p-4 mb-6 bg-gray-50">
          <p className="text-sm font-semibold mb-3">Case Overview</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Main Applicant</p>
              <p className="text-sm"><strong>Name:</strong> {clientName}</p>
              {fields.nationality && <p className="text-sm"><strong>Nationality:</strong> {fields.nationality}</p>}
              {fields.employmentType && <p className="text-sm"><strong>Occupation:</strong> {fields.employmentType}</p>}
              {fields.purposeOfStay && <p className="text-sm"><strong>Relocation motive:</strong> {fields.purposeOfStay}</p>}
            </div>
            {(fields.dependentName || (fields.numberOfFamilyMembers && fields.numberOfFamilyMembers > 0)) && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                  {fields.dependentName ? "Dependent" : `${fields.numberOfFamilyMembers} Dependent(s)`}
                </p>
                {fields.dependentName && <p className="text-sm"><strong>Name:</strong> {fields.dependentName}</p>}
                {fields.dependentNationality && <p className="text-sm"><strong>Nationality:</strong> {fields.dependentNationality}</p>}
                {fields.dependentOccupation && <p className="text-sm"><strong>Occupation:</strong> {fields.dependentOccupation}</p>}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mb-1">
        <p className="text-sm font-bold border-b pb-1 mb-2">1 — Scope of the Proposal</p>
        <p className="text-sm">{serviceContent.scopeParagraph}</p>
        {fields.transactionValueEUR && (
          <p className="text-sm mt-1">Total estimated transaction value: <strong>EUR {fmt(fields.transactionValueEUR, 0)}</strong>.</p>
        )}
      </div>
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
      {hp && (
        <div className="mt-6">
          <p className="text-sm font-bold border-b pb-1 mb-2">3 — Process Overview</p>
          {serviceContent.processSteps!.map((ps, idx) => (
            <div key={idx} className="mt-3">
              <p className="text-sm font-semibold mb-1">{ps.step}</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {ps.bullets.map((b, i) => <li key={i} className="text-sm">{b}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="mt-6">
        <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "4" : "3"} — Required Documents</p>
        <ul className="list-disc pl-5 space-y-0.5">
          {serviceContent.requiredDocs.map((d, i) => <li key={i} className="text-sm">{d}</li>)}
        </ul>
      </div>
      <div className="mt-6">
        <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "5" : "4"} — Fees &amp; Costs</p>
        <table className="w-full border-collapse text-sm mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-3 py-1.5 text-left">Description</th>
              <th className="border px-3 py-1.5 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="border px-3 py-1.5">Consultation fee</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(consultationFee, 0)} ALL</td></tr>
            <tr><td className="border px-3 py-1.5">Service fee{fields.propertyDescription ? ` — ${fields.propertyDescription}` : ""}</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(serviceFee, 0)} ALL</td></tr>
            <tr className="bg-gray-50 font-semibold"><td className="border px-3 py-1.5">Service Fees Subtotal</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(serviceFeeSubtotal, 0)} ALL</td></tr>
            <tr><td className="border px-3 py-1.5">Power of Attorney</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(poaFee, 0)} ALL</td></tr>
            <tr><td className="border px-3 py-1.5">Translation &amp; Notary</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(translationFee, 0)} ALL</td></tr>
            <tr><td className="border px-3 py-1.5">Other fees</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(otherFees, 0)} ALL</td></tr>
            <tr className="bg-gray-50 font-semibold"><td className="border px-3 py-1.5">Additional Costs Subtotal</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(additionalSubtotal, 0)} ALL</td></tr>
            <tr className="bg-gray-100 font-bold"><td className="border px-3 py-1.5">TOTAL</td><td className="border px-3 py-1.5 text-right font-mono">{fmt(totalALL, 0)} ALL ≈ {fmt(totalEUR)} EUR ≈ {fmt(totalUSD)} USD ≈ {fmt(totalGBP)} GBP</td></tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mb-4">Currency conversions are indicative only (source: xe.com)</p>
      </div>
      <div className="mt-6">
        <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "6" : "5"} — Payment Terms</p>
        {fields.paymentTermsNote ? (
          <p className="text-sm">{fields.paymentTermsNote}</p>
        ) : (
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>50% payable upon signing of the engagement agreement.</li>
            <li>50% payable prior to completion of the engagement.</li>
            <li>Government, notary, and third-party costs are payable separately and in advance.</li>
            <li>Payments may be made via bank transfer, cash, card, PayPal, or other agreed method.</li>
          </ul>
        )}
      </div>
      <div className="mt-6">
        <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "7" : "6"} — Timeline Overview</p>
        <ul className="list-disc pl-5 space-y-0.5 text-sm">
          {serviceContent.timeline.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>
      <div className="mt-6">
        <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "8" : "7"} — Next Steps</p>
        <ul className="list-disc pl-5 space-y-0.5 text-sm">
          {serviceContent.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>
      <div className="mt-10 border-t pt-4 text-center text-xs text-gray-400">
        DAFKU Law Firm · Tirana &amp; Durrës, Albania · info@dafkulawfirm.al · www.dafkulawfirm.al
      </div>
    </div>
  );
}
