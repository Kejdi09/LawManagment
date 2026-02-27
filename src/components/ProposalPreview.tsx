/**
 * ProposalPreview
 * Shared verbatim proposal template renderer.
 * Used by ProposalModal (admin preview tab) and ClientPortal (customer proposal tab).
 */
import React from "react";
import { ProposalFields, SERVICE_LABELS, ServiceType } from "@/lib/types";

// ── Fixed conversion approximation (shown as indicative, source: xe.com) ──
export const EUR_RATE = 0.01037032;
export const USD_RATE = 0.01212463;
export const GBP_RATE = 0.00902409;

export function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ServiceContent is re-exported for consumers that need the type
export interface ServiceContent {
  scopeParagraph: string;
  servicesSections: Array<{ heading: string; bullets: string[] }>;
  processSteps?: Array<{ step: string; bullets: string[] }>;
  requiredDocs: string[];
  timeline: string[];
  nextSteps: string[];
  feeDescription: string;
}

export interface ProposalPreviewProps {
  clientName: string;
  clientId: string;
  services: ServiceType[];
  fields: Partial<ProposalFields>;
  /** Required for fallback (non-verbatim) service types */
  serviceContent?: ServiceContent | null;
}

const ProposalPreview = React.forwardRef<HTMLDivElement, ProposalPreviewProps>(
  ({ clientName, clientId, services, fields, serviceContent }, ref) => {
    const svcs = (services || []) as ServiceType[];

    // ── Fee variables ──────────────────────────────────────────────────────
    const consultationFee   = fields.consultationFeeALL  ?? 0;
    const serviceFee        = fields.serviceFeeALL       ?? 0;
    const poaFee            = fields.poaFeeALL           ?? 0;
    const translationFee    = fields.translationFeeALL   ?? 0;
    const otherFees         = fields.otherFeesALL        ?? 0;
    const serviceFeeSubtotal  = consultationFee + serviceFee;
    const additionalSubtotal  = poaFee + translationFee + otherFees;
    const totalALL  = serviceFeeSubtotal + additionalSubtotal;
    const totalEUR  = totalALL * EUR_RATE;
    const totalUSD  = totalALL * USD_RATE;
    const totalGBP  = totalALL * GBP_RATE;

    const today = new Date().toISOString().slice(0, 10);
    const displayDate = fields.proposalDate
      ? new Date(fields.proposalDate).toLocaleDateString("en-GB", {
          day: "2-digit", month: "2-digit", year: "numeric",
        }).replace(/\//g, ".")
      : today;

    // ── Shared inner components ────────────────────────────────────────────
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

    // ── Template-specific fee tables (each template has its own FeeTable) ──
    // Defined below inside each template block.
    // Shared currency conversion table used by all templates
    const CurrencyTable = ({ total }: { total: number }) => {
      const eur = total * EUR_RATE;
      const usd = total * USD_RATE;
      const gbp = total * GBP_RATE;
      return (
        <>
          <table className="w-full border-collapse text-sm mb-1">
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
                <td className="border px-3 py-1.5 text-right font-mono">{fmt(eur)} EUR</td>
              </tr>
              <tr>
                <td className="border px-3 py-1.5">USD</td>
                <td className="border px-3 py-1.5 text-right font-mono">1.00 ALL = {USD_RATE.toFixed(8)} USD</td>
                <td className="border px-3 py-1.5 text-right font-mono">{fmt(usd)} USD</td>
              </tr>
              <tr>
                <td className="border px-3 py-1.5">GBP</td>
                <td className="border px-3 py-1.5 text-right font-mono">1.00 ALL = {GBP_RATE.toFixed(8)} GBP</td>
                <td className="border px-3 py-1.5 text-right font-mono">{fmt(gbp)} GBP</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mb-4">Conversion Source: https://www.xe.com/ (indicative rates — subject to change)</p>
        </>
      );
    };

    // Keep a generic FeeTable for the fallback renderer
    const FeeTable = () => {
      const total = serviceFeeSubtotal + additionalSubtotal;
      return (
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
                <td className="border px-3 py-1.5 text-right font-mono">{fmt(total, 0)} ALL</td>
              </tr>
            </tbody>
          </table>
          <CurrencyTable total={total} />
        </>
      );
    };

    const wrapperClass = "bg-white text-gray-900 rounded-lg border shadow-sm p-10 font-serif text-[13px] leading-relaxed";
    const serif = { fontFamily: "Georgia, 'Times New Roman', serif" };

    // ─────────────────────────────────────────────────────────────────────────
    // TEMPLATE 1: RESIDENCY PERMIT FOR PENSIONER
    // ─────────────────────────────────────────────────────────────────────────
    if (svcs.includes("residency_pensioner")) {
      return (
        <div ref={ref} className={wrapperClass} style={serif}>
          <CommonCover contactLine={<RelocateContactBar />} />

          {/* Case Overview */}
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

          {/* Scope */}
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

          {/* Process Overview */}
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

          {/* Required Documents */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Required Documents</p>
            <p className="text-sm font-semibold mb-1">For the Main Applicant (Pensioner):</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
              <li>Photocopy of the valid travel document, which must be valid for at least 3 months longer than the requested visa period and have at least 2 blank pages, on which the visa stamp will be placed, as well as the photocopy of the pages with notes of interest for the trip. – Provided by the Applicant.</li>
              <li>Individual declarations for reason of staying in Albania – We prepare both in Albanian and English; you sign.</li>
              <li>Proof of insurance in Albania – We purchase for you at our associate insurance company.</li>
              <li>Evidence from a bank in Albania for the transfer of pension income – We support with bank account opening.</li>
              <li>Legalized criminal record from the country of origin (issued within the last 6 months, translated and notarized) – We do the legal translation and notary at our associated partners.</li>
              <li>Evidence of an annual pension income exceeding 1,200,000 ALL – We do the legal translation and notary at our associated partners.</li>
              <li>Proof of Residency Permit Government Fee Payment – We pay for you at the bank and provide the payment mandate.</li>
              <li>Photograph of the applicant, which must be taken not before 6 (six) months from the date of application, measuring 47 mm x 36 mm, taken on a plane with a white background, visibly and clearly focused. The photo should show the person front, with a neutral expression and eyes open and visible.</li>
              <li>Proof of accommodation made in Albania, certificate, residential rental contract in accordance with the standards in Albania.</li>
            </ul>
            {fields.dependentName && (
              <>
                <p className="text-sm font-semibold mb-1">For Your Family (Family Reunification), after your permit is granted:</p>
                <ul className="list-disc pl-5 space-y-0.5 text-sm">
                  <li>Photocopy of the valid travel document, which must be valid for at least 3 months longer than the requested visa period and have at least 2 blank pages, on which the visa stamp will be placed, as well as the photocopy of the pages with notes of interest for the trip.</li>
                  <li>Marriage certificate (issued within the last 6 months, legalized, translated, notarized, if it is not issued in Albania) – We do the legal translation and notary at our associated partners.</li>
                  <li>Proof of insurance in Albania – We purchase for you at our associate insurance company.</li>
                  <li>Copy of the identity document of the invitee and the residence permit in Albania.</li>
                  <li>Proof of Payment of Residency Permit Government Fee – We pay for you at the bank and provide the payment mandate.</li>
                  <li>Photograph of the applicant, which must be taken not before 6 (six) months from the date of application, measuring 47 mm x 36 mm, taken on a plane with a white background, visibly and clearly focused. The photo should show the person front, with a neutral expression and eyes open and visible. – Two printed copies and a digital copy emailed to us.</li>
                  <li>Proof of accommodation made in Albania, certificate, residential rental contract in accordance with the standards in Albania.</li>
                  <li>Evidence of sufficient resources to live during the stay in Albania for the required period – We do the legal translation and notary at our associated partners.</li>
                </ul>
              </>
            )}
          </div>

          {/* Fees */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Fees &amp; Costs</p>
            <p className="text-sm mb-3">For Residency Permit applications as Pensioner with Family Reunification, DAFKU Law Firm applies a fixed legal service fee per applicant, covering all procedural steps from document preparation through to the final permit card.</p>

            {/* Pensioner-specific fee table matching the document exactly */}
            {(() => {
              const mainFee = 45_000;
              const depFee = fields.dependentName ? 45_000 : 0;
              const svcSubtotal = mainFee + depFee;
              const rpGovMain = 5_100;
              const rpGovDep = fields.dependentName ? 5_100 : 0;
              const idCardCoupon = fields.dependentName ? 11_400 : 5_700; // 5700 × 2 or ×1
              const idCardUnit = fields.dependentName ? 5_700 : 5_700;
              const idCardQty = fields.dependentName ? 2 : 1;
              const healthInsQty = fields.dependentName ? 2 : 1;
              const healthIns = healthInsQty * 5_000;
              const addSubtotal = rpGovMain + rpGovDep + idCardCoupon + (translationFee) + healthIns;
              const grandTotal = svcSubtotal + addSubtotal;
              return (
                <>
                  <table className="w-full border-collapse text-sm mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-3 py-1.5 text-left">Description of the service</th>
                        <th className="border px-3 py-1.5 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border px-3 py-1.5">Consultation fee</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">
                          <div>Residency service fee – Main applicant – Pensioner</div>
                          <ul className="list-disc pl-5 text-xs text-gray-600 mt-1 space-y-0.5">
                            <li>Documents check and preparation</li>
                            <li>Employment Contract drafting/adjustment</li>
                            <li>Residency Permit Application</li>
                            <li>Follow-up with immigration Office</li>
                            <li>Assistance with Registry Office</li>
                            <li>Assistance with Biometric Card and Fingerprints</li>
                          </ul>
                        </td>
                        <td className="border px-3 py-1.5 text-right font-mono align-top">45.000 ALL</td>
                      </tr>
                      {fields.dependentName && (
                        <tr>
                          <td className="border px-3 py-1.5">
                            <div>Residency service fee – Dependent – Family Reunification</div>
                            <ul className="list-disc pl-5 text-xs text-gray-600 mt-1 space-y-0.5">
                              <li>Same procedure as above</li>
                            </ul>
                          </td>
                          <td className="border px-3 py-1.5 text-right font-mono align-top">45.000 ALL</td>
                        </tr>
                      )}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="border px-3 py-1.5">Service fees Subtotal</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(svcSubtotal, 0)} ALL</td>
                      </tr>
                    </tbody>
                  </table>
                  <table className="w-full border-collapse text-sm mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-3 py-1.5 text-left">Additional costs</th>
                        <th className="border px-3 py-1.5 text-right w-16">Unit</th>
                        <th className="border px-3 py-1.5 text-right w-28">Cost</th>
                        <th className="border px-3 py-1.5 text-right w-28">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border px-3 py-1.5">Residency Permit government fee – Pensioner</td>
                        <td className="border px-3 py-1.5 text-right font-mono">1</td>
                        <td className="border px-3 py-1.5 text-right font-mono">5.100 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">5.100 ALL</td>
                      </tr>
                      {fields.dependentName && (
                        <tr>
                          <td className="border px-3 py-1.5">Residency Permit government fee – Family Reunification</td>
                          <td className="border px-3 py-1.5 text-right font-mono">1</td>
                          <td className="border px-3 py-1.5 text-right font-mono">5.100 ALL</td>
                          <td className="border px-3 py-1.5 text-right font-mono">5.100 ALL</td>
                        </tr>
                      )}
                      <tr>
                        <td className="border px-3 py-1.5">Residency Permit ID Card Coupon</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{idCardQty}</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(idCardUnit, 0)} ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(idCardCoupon, 0)} ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Documents legal Translation and Notary (to be specified later)</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Other fees – Health Insurance</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{healthInsQty}</td>
                        <td className="border px-3 py-1.5 text-right font-mono">5.000 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(healthIns, 0)} ALL</td>
                      </tr>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="border px-3 py-1.5">Additional costs Subtotal</td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(addSubtotal, 0)} ALL</td>
                      </tr>
                      <tr className="bg-gray-100 font-bold">
                        <td className="border px-3 py-1.5">FINAL COST TOTAL</td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(grandTotal, 0)} ALL</td>
                      </tr>
                    </tbody>
                  </table>
                  <CurrencyTable total={grandTotal} />
                </>
              );
            })()}

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

          {/* Payment Terms */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Payment Terms</p>
            <p className="text-sm mb-1">Our office, applies the following payment terms:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>50% of the service fee is payable upon contract signing / file opening.</li>
              <li>50% is payable before submission of the residency permit application for family reunification for the dependent.</li>
              <li>Government fees are paid upfront before application submission.</li>
              <li>All payments are non-refundable once the application has been submitted to the authorities.</li>
              <li>Payments can be made in cash, card, bank transaction, PayPal, etc.</li>
            </ul>
          </div>

          {/* Timeline */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Timeline Overview</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Preparation and application submission – 3 – 5 business days</li>
              <li>Provisional Residency Permit ~10 – 15 business days</li>
              <li>Final Decision ~30 – 45 business days</li>
              <li>Card issue ~ 2 calendar weeks</li>
            </ul>
          </div>

          {/* Important Notes */}
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

          {/* Next Steps */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Next Steps</p>
            <p className="text-sm mb-1">Upon your approval of this proposal, the following steps will be taken:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Preparation and signing of the service agreement.</li>
              <li>Payment of the initial agreed fee.</li>
              <li>Documents collection and preparation.</li>
              <li>Residency Permit Application Submission at the Local Directorate for Border and Migration.</li>
              <li>Follow-up with the authorities until the final decision.</li>
              <li>Biometric fingerprints appointment and Residency Permit Card collection.</li>
            </ul>
          </div>

          <BusinessGroupFooter />
        </div>
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEMPLATE 2: TYPE D VISA & RESIDENCE PERMIT FOR EMPLOYMENT
    // ─────────────────────────────────────────────────────────────────────────
    if (svcs.includes("visa_d")) {
      return (
        <div ref={ref} className={wrapperClass} style={serif}>
          <CommonCover contactLine={<RelocateContactBar />} />

          {/* Case Overview */}
          <div className="border rounded p-4 mb-6 bg-gray-50">
            <p className="text-sm font-semibold mb-3">Case Overview</p>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Client</p>
              <p className="text-sm"><strong>Name:</strong> {clientName}</p>
              <p className="text-sm"><strong>Nationality:</strong> {fields.nationality || "—"}</p>
              <p className="text-sm"><strong>Occupation:</strong> {fields.employmentType || "—"}</p>
              <p className="text-sm"><strong>Staff Relocation motive:</strong> Employment</p>
              {fields.numberOfApplicants && fields.numberOfApplicants > 1 && (
                <p className="text-sm"><strong>Number of applicants:</strong> {fields.numberOfApplicants}</p>
              )}
              {fields.previousRefusals && !/^(none|no|-)$/i.test(fields.previousRefusals) && (
                <p className="text-sm"><strong>Previous refusals:</strong> {fields.previousRefusals}</p>
              )}
            </div>
          </div>

          {/* Scope */}
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

          {/* Process Overview */}
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

          {/* Required Documents */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Required Documents</p>
            <p className="text-sm font-semibold mb-1">For the Type D Visa Application for Employee:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
              <li>Photograph of the applicant, which should have been taken no earlier than 6 (six) months before the application date, measuring 47 mm x 36 mm, taken in a frontal view with a white background, clearly and distinctly focused. The photograph should show the person facing the camera, with a neutral expression and the eyes open and visible. – Provided by the applicant.</li>
              <li>Photocopy of the valid travel document which must be valid for at least 3 months longer than the requested visa period and have at least 2 blank pages, on which the visa stamp will be placed, as well as a photocopy of the pages with notes of interest for the trip. – Provided by the applicant.</li>
              <li>Document certifying accommodation in the territory of the Republic of Albania. – A notarized rental contract or a hosting declaration prepared before the application submission.</li>
              <li>Document proving the activity or professional, commercial ability in the applicant&apos;s country, which is related to the motives of the applicant&apos;s visa application, in the case of Type D visa applications. – Provided by the applicant.</li>
              <li>Residence Permit more than 12 months, issued from the country of residence, with a validity period of at least 3 additional months than the duration period of the required visa (if you are residing in another country, rather than your nationality).</li>
              <li>Document proving the legal status of the inviting entity. – We get them from the accountant.</li>
              <li>Invitation signed by the host. – We prepare it, you sign it.</li>
              <li>The employment contract with the employer, drawn up according to the Labor Code of the Republic of Albania. – We will prepare the contract.</li>
            </ul>
            <p className="text-sm font-semibold mb-1">For the Residency Permit Application for Employee:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Photocopy of the valid travel document, which must be valid for at least 3 months longer than the requested visa period and have at least 2 blank pages, on which the visa stamp will be placed, as well as the photocopy of the pages with notes of interest for the trip.</li>
              <li>Proof of Residency Permit Government Fee Payment – We pay it for you at the bank and provide the payment mandate.</li>
              <li>Photograph of the applicant, which must be taken not before 6 (six) months from the date of application, measuring 47 mm x 36 mm, taken on a plane with a white background, visibly and clearly focused. The photo should show the person front, with a neutral expression and eyes open and visible. – Two printed pieces and a digital copy sent to us via email.</li>
              <li>Proof of accommodation made in Albania, certificate, residential rental contract in accordance with the standards in Albania. – A notarised rental contract prepared before the application submission.</li>
              <li>The employment contract with the employer, drawn up according to the Labor Code of the Republic of Albania. – We will prepare the contract.</li>
              <li>Proof of professional qualification (diploma/professional certificate/reference) or self-declaration from the subject, or self-declaration from the foreigner in the form of a curriculum vitae (CV), which proves the foreigner&apos;s previous professional skills/experience, in relation to the profession defined in the employment contract work, in the Albanian language. – Provided by the applicant.</li>
            </ul>
          </div>

          {/* Fees */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Fees &amp; Costs</p>
            <p className="text-sm mb-3">For Type D Visa and Residency Permit applications for employment, DAFKU Law Firm applies a fixed legal service fee per applicant, covering all procedural steps from visa application through to the final permit card.</p>

            {/* Visa D employment-specific fee table matching the document exactly */}
            {(() => {
              const n = fields.numberOfApplicants && fields.numberOfApplicants > 1 ? fields.numberOfApplicants : 1;
              const unitFee = 75_000;
              const discountPerUnit = n > 1 ? 20_000 : 0;
              const discountedUnit = unitFee - discountPerUnit;
              const svcSubtotal = discountedUnit * n;
              // Government fees per person
              const visaGovFee = 2_100 * n;
              const rpGovFee = 8_600 * n;
              const idCard = 5_700 * n;
              const addSubtotal = visaGovFee + rpGovFee + idCard + translationFee + otherFees;
              const grandTotal = svcSubtotal + addSubtotal;
              return (
                <>
                  <table className="w-full border-collapse text-sm mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-3 py-1.5 text-left">Description of the service</th>
                        <th className="border px-3 py-1.5 text-right w-16">Unit</th>
                        <th className="border px-3 py-1.5 text-right w-28">Cost/Unit</th>
                        <th className="border px-3 py-1.5 text-right w-28">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border px-3 py-1.5">Consultation fee</td>
                        <td className="border px-3 py-1.5 text-right font-mono"></td>
                        <td className="border px-3 py-1.5 text-right font-mono"></td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">
                          <div>Visa and Residency Permit service fee – Employee</div>
                          <ul className="list-disc pl-5 text-xs text-gray-600 mt-1 space-y-0.5">
                            <li>Job Contract Preparation</li>
                            <li>Documentation Collection and Checking</li>
                            <li>Visa Application and Follow-Up</li>
                            <li>Payment of government fees</li>
                            <li>Residency Permit Application</li>
                            <li>Follow-Up of the process</li>
                            <li>Representation and support with immigration office</li>
                            <li>Support with Registry Office for address registration</li>
                            <li>Fingerprints setting support for ID Card</li>
                          </ul>
                        </td>
                        <td className="border px-3 py-1.5 text-right font-mono align-top">{n}</td>
                        <td className="border px-3 py-1.5 text-right font-mono align-top">75.000 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono align-top">{fmt(unitFee * n, 0)} ALL</td>
                      </tr>
                      {n > 1 && (
                        <>
                          <tr>
                            <td className="border px-3 py-1.5">Discount on group application</td>
                            <td className="border px-3 py-1.5 text-right font-mono">{n}</td>
                            <td className="border px-3 py-1.5 text-right font-mono text-red-600">-20.000 ALL</td>
                            <td className="border px-3 py-1.5 text-right font-mono text-red-600">-{fmt(discountPerUnit * n, 0)} ALL</td>
                          </tr>
                          <tr>
                            <td className="border px-3 py-1.5">Visa and Residency Permit service fee after discount</td>
                            <td className="border px-3 py-1.5 text-right font-mono">{n}</td>
                            <td className="border px-3 py-1.5 text-right font-mono">55.000 ALL</td>
                            <td className="border px-3 py-1.5 text-right font-mono">{fmt(discountedUnit * n, 0)} ALL</td>
                          </tr>
                        </>
                      )}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="border px-3 py-1.5">Service fees Subtotal</td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(svcSubtotal, 0)} ALL</td>
                      </tr>
                    </tbody>
                  </table>
                  <table className="w-full border-collapse text-sm mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-3 py-1.5 text-left">Additional costs</th>
                        <th className="border px-3 py-1.5 text-right w-16">Unit</th>
                        <th className="border px-3 py-1.5 text-right w-28">Cost/Unit</th>
                        <th className="border px-3 py-1.5 text-right w-28">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border px-3 py-1.5">Visa government fee</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{n}</td>
                        <td className="border px-3 py-1.5 text-right font-mono">2.100 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(visaGovFee, 0)} ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Residency Permit government fee – Self employment</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{n}</td>
                        <td className="border px-3 py-1.5 text-right font-mono">8.600 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(rpGovFee, 0)} ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Residency Permit ID Card Coupon</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{n}</td>
                        <td className="border px-3 py-1.5 text-right font-mono">5.700 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(idCard, 0)} ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Documents legal Translation and Notary (to be specified later)</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Other fees (residence contract, and related supporting service upon request)</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="border px-3 py-1.5">Additional costs Subtotal</td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(addSubtotal, 0)} ALL</td>
                      </tr>
                      <tr className="bg-gray-100 font-bold">
                        <td className="border px-3 py-1.5">TOTAL</td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(grandTotal, 0)} ALL</td>
                      </tr>
                    </tbody>
                  </table>
                  <CurrencyTable total={grandTotal} />
                </>
              );
            })()}

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

          {/* Payment Terms */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Payment Terms</p>
            <p className="text-sm">50% upon contract signing.</p>
            <p className="text-sm">30% after visa issuing and before residency permit application.</p>
            <p className="text-sm">20% upon approval of residency permit and before fingerprint setting.</p>
          </div>

          {/* Timeline */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Timeline Overview</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Documents preparation – 3 – 5 business days</li>
              <li>Visa processing – 15 – 30 business days</li>
              <li>Residency Permit – 30 – 45 business days</li>
              <li>Residency Permit ID Card – ~ 2 calendar weeks</li>
            </ul>
          </div>

          {/* Important Notes */}
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

          {/* Next Steps */}
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

    // ─────────────────────────────────────────────────────────────────────────
    // TEMPLATE 3: COMPANY FORMATION + VISA D (SELF-EMPLOYED)
    // ─────────────────────────────────────────────────────────────────────────
    if (svcs.includes("company_formation")) {
      return (
        <div ref={ref} className={wrapperClass} style={serif}>
          <CommonCover contactLine={<RelocateContactBar />} />

          {/* Case Overview */}
          <div className="border rounded p-4 mb-6 bg-gray-50">
            <p className="text-sm font-semibold mb-3">Case Overview</p>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Main Applicant</p>
              <p className="text-sm"><strong>Name:</strong> {clientName}</p>
              <p className="text-sm"><strong>Nationality:</strong> {fields.nationality || "—"}</p>
              <p className="text-sm"><strong>Occupation:</strong> {fields.employmentType || "—"}</p>
              <p className="text-sm"><strong>Relocation motive:</strong> {fields.purposeOfStay || "Self-Employment/Company Registration"}</p>
              {fields.businessActivity && (
                <p className="text-sm"><strong>Business activity:</strong> {fields.businessActivity}</p>
              )}
              {fields.numberOfShareholders && (
                <p className="text-sm"><strong>Number of shareholders:</strong> {fields.numberOfShareholders}</p>
              )}
            </div>
          </div>

          {/* Scope */}
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

          {/* Process Overview */}
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

          {/* Required Documents */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Required Documents</p>
            <p className="text-sm font-semibold mb-1">For Company Registration:</p>
            <p className="text-sm font-semibold text-gray-600 mb-1">For the Shareholder(s) and Administrator(s):</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-2">
              <li>Valid passport copy</li>
              <li>Contact details and residential address (foreign address)</li>
            </ul>
            <p className="text-sm font-semibold text-gray-600 mb-1">Corporate &amp; Legal Documentation:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-2">
              <li>Company name proposal</li>
              <li>Description of business activity</li>
              <li>Appointment details of the company administrator</li>
              <li>Shareholding structure details</li>
              <li>Company address</li>
            </ul>
            <p className="text-sm font-semibold text-gray-600 mb-1">If Registration Is Done Remotely:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
              <li>Power of Attorney (notarized and legalized/apostilled)</li>
            </ul>
            <p className="text-sm font-semibold mb-1">For Visa for self-employed people (Type D):</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
              <li>Photograph of the applicant, which should have been taken no earlier than 6 (six) months before the application date, measuring 47 mm x 36 mm, taken in a frontal view with a white background, clearly and distinctly focused. The photograph should show the person facing the camera, with a neutral expression and the eyes open and visible.</li>
              <li>Photocopy of the valid travel document which must be valid for at least 3 months longer than the requested visa period and have at least 2 blank pages, on which the visa stamp will be placed, as well as a photocopy of the pages with notes of interest for the trip.</li>
              <li>Certification of professional capacity related to the approval of self-employment (diploma, certificate, training, various qualifications).</li>
              <li>The document of the legal status of the entity (Business Registration Certificate). – We provide it.</li>
              <li>Document certifying accommodation in the territory of the Republic of Albania. (Rental contract or accommodation reservation declaration). – We can make it for you as an extra service through a power of attorney.</li>
              <li>Residence permit more than 12 months, issued from the country of residence, with a validity period of at least 3 additional months than the duration period of the required visa (if you are resident in another country rather than your nationality).</li>
              <li>The full bank statement showing the money going in and money leaving your account for the last 12 months.</li>
            </ul>
            <p className="text-sm font-semibold mb-1">For Residency Permit Application as Self-Employed/Business Owner:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Photocopy of the valid travel document, which must be valid for at least 3 months longer than the requested visa period and have at least 2 blank pages, on which the visa stamp will be placed, as well as the photocopy of the pages with notes of interest for the trip.</li>
              <li>Project idea for the business/activity (reflecting the minimum elements recommended by the National Employment and Labor Agency). – We prepare it for you.</li>
              <li>The document proving that there are sufficient financial means, not less than 500,000 (five hundred thousand) ALL or the equivalent value of one dollar or euro. – We open the bank account for you and you have to make the deposit.</li>
              <li>Document proving the necessary skills (certificate/diploma or equivalent document).</li>
              <li>Proof of registration of the activity in the QKB. – We provide it upon company registration.</li>
              <li>Payment Mandate of Government fee. – We pay and provide the document.</li>
              <li>Photograph of the applicant, which must be taken not before 6 (six) months from the date of application, measuring 47 mm x 36 mm, taken on a plane with a white background, visibly and clearly focused. The photo should show the person front, with a neutral expression and eyes open and visible.</li>
              <li>Proof of accommodation made in Albania, certificate, residential rental contract in accordance with the standards in Albania. – We can rent a place for you upon your request as an extra service through a power of attorney.</li>
            </ul>
          </div>

          {/* Fees */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Fees &amp; Costs</p>
            <p className="text-sm mb-3">For Company Formation combined with Type D Visa and Residency Permit, DAFKU Law Firm applies a fixed service fee covering both the company registration process and the complete immigration procedure.</p>

            {/* Company formation exact fee table from document */}
            {(() => {
              const companyFee = 85_000;
              const visaRpFee = 75_000;
              const svcSubtotal = companyFee + visaRpFee;
              const visaGovFee = 4_500;
              const rpGovFee = 8_800;
              const idCard = 5_700;
              const addSubtotal = visaGovFee + rpGovFee + idCard;
              const grandTotal = svcSubtotal + addSubtotal;
              return (
                <>
                  <table className="w-full border-collapse text-sm mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-3 py-1.5 text-left">Description of the service</th>
                        <th className="border px-3 py-1.5 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border px-3 py-1.5">Consultation fee</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">
                          <div>Company Formation service fee which includes:</div>
                          <ul className="list-disc pl-5 text-xs text-gray-600 mt-1 space-y-0.5">
                            <li>Power of Attorney</li>
                            <li>Name check and reservation</li>
                            <li>Statute and Establishment Act Drafting</li>
                            <li>Company Registration Application</li>
                            <li>Company Registration with relevant authorities</li>
                            <li>Accounting and Virtual Office for 1 month</li>
                            <li>Bank Account Opening Support</li>
                            <li>Business Plan Drafting</li>
                          </ul>
                        </td>
                        <td className="border px-3 py-1.5 text-right font-mono align-top">85.000 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">
                          <div>Visa and Residency Permit service fee – Main Applicant</div>
                          <ul className="list-disc pl-5 text-xs text-gray-600 mt-1 space-y-0.5">
                            <li>Documentation Checking</li>
                            <li>Visa Application and Follow-Up</li>
                            <li>Residency Permit Application and Follow-Up</li>
                            <li>Payment of government fees</li>
                            <li>Representation and support with immigration office</li>
                            <li>Support with Registry Office and Fingerprints</li>
                          </ul>
                        </td>
                        <td className="border px-3 py-1.5 text-right font-mono align-top">75.000 ALL</td>
                      </tr>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="border px-3 py-1.5">Service fees Subtotal</td>
                        <td className="border px-3 py-1.5 text-right font-mono">160.000 ALL</td>
                      </tr>
                    </tbody>
                  </table>
                  <table className="w-full border-collapse text-sm mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-3 py-1.5 text-left">Additional costs</th>
                        <th className="border px-3 py-1.5 text-right w-16">Unit</th>
                        <th className="border px-3 py-1.5 text-right w-28">Cost</th>
                        <th className="border px-3 py-1.5 text-right w-28">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border px-3 py-1.5">Visa government fee</td>
                        <td className="border px-3 py-1.5 text-right font-mono">1</td>
                        <td className="border px-3 py-1.5 text-right font-mono">4.500 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">4.500 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Residency Permit government fee – Self employment</td>
                        <td className="border px-3 py-1.5 text-right font-mono">1</td>
                        <td className="border px-3 py-1.5 text-right font-mono">8.800 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">8.800 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Residency Permit ID Card Coupon</td>
                        <td className="border px-3 py-1.5 text-right font-mono">1</td>
                        <td className="border px-3 py-1.5 text-right font-mono">5.700 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">5.700 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Documents legal Translation and Notary (to be specified later)</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Other fees</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="border px-3 py-1.5">Additional costs Subtotal</td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(addSubtotal, 0)} ALL</td>
                      </tr>
                      <tr className="bg-gray-100 font-bold">
                        <td className="border px-3 py-1.5">FINAL COST TOTAL</td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(grandTotal, 0)} ALL</td>
                      </tr>
                    </tbody>
                  </table>
                  <CurrencyTable total={grandTotal} />
                </>
              );
            })()}

            <p className="text-sm font-semibold mb-2 mt-4">Company Management Costs</p>
            <p className="text-xs text-gray-600 mb-2"><strong>Fixed fees:</strong> The maintenance service fees listed below are the minimum fees applied for new businesses initially registered in Albania. These fees remain fixed at this amount for businesses with an annual turnover of 5,000,000 ALL (50,000 EUR). Above this limit, the fees will increase accordingly depending on the administrative and legal support required.</p>
            <table className="w-full border-collapse text-sm mb-2">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-3 py-1.5 text-left">Service</th>
                  <th className="border px-3 py-1.5 text-right">Unit</th>
                  <th className="border px-3 py-1.5 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border px-3 py-1.5">Accounting</td><td className="border px-3 py-1.5 text-right">Month</td><td className="border px-3 py-1.5 text-right font-mono">5.000 ALL</td></tr>
                <tr><td className="border px-3 py-1.5">Legal Support</td><td className="border px-3 py-1.5 text-right">Month</td><td className="border px-3 py-1.5 text-right font-mono">5.000 ALL</td></tr>
                <tr><td className="border px-3 py-1.5">Virtual Office</td><td className="border px-3 py-1.5 text-right">Month</td><td className="border px-3 py-1.5 text-right font-mono">5.000 ALL</td></tr>
                <tr><td className="border px-3 py-1.5">Electronic Fiscal Certificate</td><td className="border px-3 py-1.5 text-right">Annual</td><td className="border px-3 py-1.5 text-right font-mono">4.500 ALL</td></tr>
                <tr><td className="border px-3 py-1.5">Invoicing Software</td><td className="border px-3 py-1.5 text-right">Annual</td><td className="border px-3 py-1.5 text-right font-mono">7.500 ALL</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-gray-600 mb-3"><strong>Non-fixed fees:</strong> The maintenance service fees listed below are calculated based on our experience with other clients and in reference to the market prices.</p>
            <table className="w-full border-collapse text-sm mb-2">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-3 py-1.5 text-left">Service</th>
                  <th className="border px-3 py-1.5 text-right">Unit</th>
                  <th className="border px-3 py-1.5 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border px-3 py-1.5">Office rent</td><td className="border px-3 py-1.5 text-right">Month</td><td className="border px-3 py-1.5 text-right font-mono">30.000 – 50.000 ALL</td></tr>
                <tr><td className="border px-3 py-1.5">Social and Health Security</td><td className="border px-3 py-1.5 text-right">Month</td><td className="border px-3 py-1.5 text-right font-mono">12.000 – 15.000 ALL</td></tr>
                <tr><td className="border px-3 py-1.5">Local Municipal Taxes</td><td className="border px-3 py-1.5 text-right">Month</td><td className="border px-3 py-1.5 text-right font-mono">25.000 – 40.000 ALL</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mb-4">Note: The above are ongoing management costs and are separate from the one-time service fee above.</p>

            <p className="text-sm font-semibold mb-2">Taxation Overview (Albania)</p>
            <table className="w-full border-collapse text-sm mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-3 py-1.5 text-left">Tax</th>
                  <th className="border px-3 py-1.5 text-right">Below turnover</th>
                  <th className="border px-3 py-1.5 text-right">Above turnover</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border px-3 py-1.5">VAT – Turnover 10,000,000 ALL</td><td className="border px-3 py-1.5 text-right">0%</td><td className="border px-3 py-1.5 text-right">20%</td></tr>
                <tr><td className="border px-3 py-1.5">Corporate Tax – Turnover 14,000,000 ALL</td><td className="border px-3 py-1.5 text-right">0%</td><td className="border px-3 py-1.5 text-right">15%</td></tr>
                <tr><td className="border px-3 py-1.5">Dividend Tax – Flat Rate</td><td className="border px-3 py-1.5 text-right">8%</td><td className="border px-3 py-1.5 text-right">8%</td></tr>
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

          {/* Payment Terms */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Payment Terms</p>
            <p className="text-sm">50% upon contract signing / file opening.</p>
            <p className="text-sm">50% before submission of the visa and residency permit application.</p>
          </div>

          {/* Timeline */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Timeline Overview</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Company Registration – 3 – 5 business days</li>
              <li>Visa processing – 15 – 30 business days</li>
              <li>Residency Permit – 30 – 45 business days</li>
            </ul>
          </div>

          {/* Important Notes */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">Important Notes &amp; Legal Disclaimers</p>
            <p className="text-sm mb-1 font-semibold">For Company Management &amp; Ongoing Requirements – Key Points:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
              <li>The company must have a registered business address in Albania which can be provided by our office through a virtual office or by renting physical premises.</li>
              <li>A licensed accountant is mandatory.</li>
              <li>The company must pay applicable taxes, depending on activity and turnover, such as: Corporate income tax, VAT (if applicable), Local municipal taxes.</li>
              <li>Social and health contributions must be paid for each employee.</li>
              <li>Employment contracts and payroll declarations must comply with Albanian law.</li>
              <li>The company must operate through an Albanian corporate bank account.</li>
              <li>Monthly and annual tax declarations are mandatory.</li>
              <li>Annual financial statements must be submitted.</li>
              <li>Any changes to company details (address, administrator, activity) must be officially registered.</li>
              <li>The company must remain active and compliant to support residence permit validity and renewals.</li>
              <li>Non-compliance may result in penalties and may affect residency permit status.</li>
            </ul>
            <p className="text-sm mb-1 font-semibold">For Visa and Residency Permit procedure:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>The Applicant should be outside the Albanian territory when the visa application is submitted.</li>
              <li>As soon as the visa is approved, the applicant should enter the Albanian territory in order for the Residency permit procedure to start processing.</li>
              <li>All visa and residency decisions are made exclusively by Albanian authorities; our office cannot influence the outcome.</li>
              <li>Processing times are estimated and may vary based on internal procedures or workload.</li>
              <li>Authorities may request additional documents or clarifications at any stage.</li>
              <li>Our office is not responsible for delays or decisions made by the authorities.</li>
            </ul>
          </div>

          {/* Next Steps */}
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

    // ─────────────────────────────────────────────────────────────────────────
    // TEMPLATE 4: REAL ESTATE
    // ─────────────────────────────────────────────────────────────────────────
    if (svcs.includes("real_estate")) {
      const propDesc = fields.propertyDescription || "residential property in Albania";
      const txVal = fields.transactionValueEUR ? `EUR ${fmt(fields.transactionValueEUR, 0)}` : "to be confirmed";
      return (
        <div ref={ref} className={wrapperClass} style={serif}>
          <CommonCover contactLine={<DafkuContactBar />} />

          {/* Section 1 */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">1 — Scope of the Proposal</p>
            <p className="text-sm mb-1">This proposal outlines the provision of comprehensive legal, advisory, and procedural assistance in connection with the purchase of a {propDesc}. The total estimated transaction value is {txVal}.</p>
            <p className="text-sm mb-1">The property forms part of a residential development currently under construction. Given the off-plan nature of the investment and the extended construction period, this engagement is structured to provide not only transactional legal support, but also ongoing legal monitoring and safeguarding of the Client&apos;s interests until final handover and ownership registration.</p>
            <p className="text-sm mb-1">The objectives of this engagement are:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>To ensure full legal compliance of the transaction at all stages</li>
              <li>To mitigate legal and contractual risks associated with off-plan property purchases</li>
              <li>To protect the Client&apos;s interests as buyer throughout the construction period</li>
              <li>To ensure proper handover, ownership transfer, and registration of the property</li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">2 — Scope of Services Provided</p>
            <p className="text-sm mb-2">The Firm&apos;s services are divided into transactional assistance and post-contract monitoring, reflecting the lifecycle of an off-plan real estate investment.</p>

            <p className="text-sm font-semibold mb-1">2.1 Legal Due Diligence &amp; Project Verification</p>
            <p className="text-sm mb-1">The Firm shall conduct a comprehensive legal due diligence process aimed at verifying the legality, validity, and risk profile of the project and the transaction. This includes, but is not limited to:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
              <li>Verification of the ownership title of the land on which the project is being developed, through the Albanian State Cadastre (ASHK)</li>
              <li>Review and verification of the construction permit (Leje Ndërtimi) and approved project documentation</li>
              <li>Examination of the legal status, registration, and authority of the developer / construction company</li>
              <li>Verification of the developer&apos;s right to pre-sell residential units under Albanian law</li>
              <li>Confirmation of the allocation of the specific apartment intended for purchase</li>
              <li>Verification of any encumbrances or restrictions affecting the land or the project (mortgages, liens, seizures, or other legal burdens)</li>
              <li>Consistency check between contractual documentation, cadastral records, and factual project status</li>
              <li>Legal risk assessment related to construction timelines, delivery obligations, and buyer safeguards</li>
            </ul>

            <p className="text-sm font-semibold mb-1">2.2 Contractual Documentation &amp; Legal Structuring</p>
            <p className="text-sm mb-1">The Firm shall provide full legal assistance in relation to the contractual framework governing the off-plan purchase. This includes:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
              <li>Legal review and, where required, drafting or amendment of: Reservation agreements; Preliminary Sale and Purchase Agreements</li>
              <li>Detailed review of contractual clauses related to: Construction deadlines and delivery timelines; Penalties and remedies in case of delay or non-performance; Payment schedules and legal safeguards; Termination rights and refund mechanisms</li>
              <li>Ensuring that contractual obligations are balanced and aligned with Albanian law</li>
              <li>Legal coordination and negotiation support with the developer, real estate agency, and notary public</li>
            </ul>

            <p className="text-sm font-semibold mb-1">2.3 Representation &amp; Communication with Third Parties</p>
            <p className="text-sm mb-1">Throughout the transaction, the Firm shall act as the Client&apos;s legal point of contact with all relevant parties involved in the investment process. This includes communication and coordination with:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
              <li>The real estate agency and agent involved in the transaction</li>
              <li>The construction company / developer</li>
              <li>The notary public</li>
              <li>Relevant public authorities, where necessary</li>
            </ul>

            <p className="text-sm font-semibold mb-1">2.4 Notarial Transaction Assistance</p>
            <p className="text-sm mb-1">The Firm shall provide legal assistance during the execution of contractual documentation before the notary public. This includes:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
              <li>Legal review of notarial deeds prior to execution</li>
              <li>Verification of the identity and legal authority of the selling party</li>
              <li>Ensuring that the notarial act reflects the agreed contractual terms</li>
              <li>Legal presence during signing to address issues that may arise in real time</li>
            </ul>

            <p className="text-sm font-semibold mb-1">2.5 Payment Coordination &amp; Legal Guidance</p>
            <p className="text-sm mb-1">The Firm shall provide legal guidance related to the execution of payments associated with the transaction, including:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-3">
              <li>Advice on secure and legally compliant payment methods (bank transfers)</li>
              <li>Coordination of payment timing in line with contractual obligations</li>
              <li>Ensuring legal linkage between payments and contractual milestones</li>
            </ul>

            <p className="text-sm font-semibold mb-1">2.6 Long-Term Legal Monitoring Until Project Completion</p>
            <p className="text-sm mb-1">Given the off-plan nature of the investment, the Firm shall remain legally engaged on an ongoing basis following contract execution. The monitoring service includes:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Ongoing legal availability for advisory support related to the contractual relationship</li>
              <li>Review of communications, notices, or updates issued by the developer</li>
              <li>Legal advice and basic intervention in cases of: construction delays; non-compliance with contractual obligations; proposed changes affecting the Client&apos;s rights</li>
              <li>Assistance and coordination until: final handover of the apartment; delivery of keys; registration of ownership with ASHK; issuance of ownership documentation in the Client&apos;s name</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">3 — Required Documents</p>
            <p className="text-sm mb-1">Required Documentation from the Client:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Valid identification document (ID / Passport)</li>
              <li>Available project-related documentation (reservation or preliminary contracts, if any)</li>
              <li>Payment method details</li>
              <li>Power of Attorney (if representation is required)</li>
            </ul>
          </div>

          {/* Section 4 */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">4 — Fees &amp; Costs</p>

            <p className="text-sm font-semibold mb-1">4.1 General Legal Service Fee</p>
            <p className="text-sm mb-3">For real estate transactions, particularly off-plan purchases, DAFKU Law Firm applies either a fixed fee or a percentage-based fee, depending on complexity, duration, and risk exposure. For this specific transaction, a hybrid structure is applied, consisting of a fixed transactional fee and a monthly monitoring retainer.</p>

            <p className="text-sm font-semibold mb-1">4.2. Fees and Costs applied to this specific case</p>
            <p className="text-sm mb-1"><strong>Phase 1 – Transaction &amp; Contractual Assistance (Fixed Fee)</strong></p>
            <p className="text-sm mb-2">This phase covers all legal services from engagement commencement until completion of notarial signing. This includes all services described below:</p>

            {(() => {
              const mainFee = serviceFee || 95_000;
              const grandTotal = mainFee;
              return (
                <>
                  <table className="w-full border-collapse text-sm mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-3 py-1.5 text-left">Description of the service</th>
                        <th className="border px-3 py-1.5 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border px-3 py-1.5">Consultation fee</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">
                          <div>Comprehensive legal assistance for off-plan real estate investment, including:</div>
                          <ul className="list-disc pl-5 text-xs text-gray-600 mt-1 space-y-0.5">
                            <li>Legal due diligence of the project, land ownership, construction permit, and developer documentation</li>
                            <li>Legal review and negotiation of reservation and preliminary sale contracts</li>
                            <li>Representation and coordination with the real estate agency, developer, notary, and authorities</li>
                            <li>Legal assistance and presence during notarial signing</li>
                            <li>Payment coordination and legal safeguards</li>
                          </ul>
                        </td>
                        <td className="border px-3 py-1.5 text-right font-mono align-top">{fmt(mainFee, 0)} ALL</td>
                      </tr>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="border px-3 py-1.5">Service fees Subtotal</td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(mainFee, 0)} ALL</td>
                      </tr>
                    </tbody>
                  </table>
                  <table className="w-full border-collapse text-sm mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-3 py-1.5 text-left">Additional costs</th>
                        <th className="border px-3 py-1.5 text-right w-16">Unit</th>
                        <th className="border px-3 py-1.5 text-right w-28">Cost</th>
                        <th className="border px-3 py-1.5 text-right w-28">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border px-3 py-1.5">
                          <div>Power of Attorney</div>
                          <div className="text-xs text-gray-600">Needed in case of representation without the presence of the client</div>
                        </td>
                        <td className="border px-3 py-1.5 text-right font-mono">0</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">
                          <div>Documents legal Translation and Notary</div>
                          <div className="text-xs text-gray-600">To be specified later upon documents collection and calculated based on the documents volume</div>
                        </td>
                        <td className="border px-3 py-1.5 text-right font-mono">0</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr>
                        <td className="border px-3 py-1.5">Other fees</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="border px-3 py-1.5">Additional costs Subtotal</td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5 text-right font-mono">0 ALL</td>
                      </tr>
                      <tr className="bg-gray-100 font-bold">
                        <td className="border px-3 py-1.5">FINAL COST TOTAL</td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5"></td>
                        <td className="border px-3 py-1.5 text-right font-mono">{fmt(grandTotal, 0)} ALL</td>
                      </tr>
                    </tbody>
                  </table>
                  <CurrencyTable total={grandTotal} />
                </>
              );
            })()}

            <p className="text-sm font-semibold mb-1 mt-2">Phase 2 – Long-Term Legal Monitoring (Monthly Retainer)</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm mb-4">
              <li>Monitoring fee: EUR 50 per month</li>
              <li>Billing: payable monthly or quarterly in advance, at the Client&apos;s discretion</li>
              <li>Duration: from contract execution until project completion, handover, and registration</li>
            </ul>
            <p className="text-sm mb-2">The monitoring service includes advisory support and reasonable legal communication. Any complex dispute, prolonged negotiation, formal legal action, or litigation shall fall outside the scope of monitoring and be billed separately.</p>
            <p className="text-sm mb-4">Hourly rate for out-of-scope services: EUR 100 / hour</p>

            <p className="text-sm font-semibold mb-1">4.3. Costs Not Included</p>
            <p className="text-sm mb-1">The legal fee does not include:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Notary fees</li>
              <li>Government taxes and registration fees</li>
              <li>Real estate agency commissions</li>
              <li>Bank transfer fees</li>
              <li>Translation, sworn translation, apostille, or legalization costs</li>
              <li>Power of Attorney preparation and notarization fees</li>
              <li>Courier or administrative expenses</li>
              <li>Any third-party professional fees (engineers, surveyors, experts)</li>
            </ul>
          </div>

          {/* Section 5 */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">5 — Payment Terms</p>
            <p className="text-sm mb-1">Our office applies the following payment terms for the provision of legal services related to real estate purchase transactions:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>50% payable upon signing of the engagement agreement</li>
              <li>50% payable prior to notarial execution of contractual documentation</li>
              <li>Third-party and government costs payable separately and in advance</li>
              <li>Legal fees are non-refundable once services have commenced</li>
              <li>Payments accepted via bank transfer, cash, card, PayPal, or other agreed methods.</li>
            </ul>
          </div>

          {/* Section 6 */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">6 — Timeline Overview</p>
            <p className="text-sm mb-1">Based on our experience, and taking into consideration that there will be no delays by the client and third parties, the approximate timeline for each service component will be:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Legal due diligence &amp; document verification: approx. 5–10 business days</li>
              <li>Contract review &amp; coordination: approx. 5–10 business days</li>
              <li>Notarial execution: subject to parties&apos; availability</li>
              <li>Construction completion &amp; handover: expected in 2027</li>
              <li>Ownership registration after completion: approx. 15–30 business days</li>
            </ul>
            <p className="text-xs text-gray-500 mt-1">Timelines are indicative and subject to third-party and institutional responsiveness.</p>
          </div>

          {/* Section 7 */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">7 — Important Notes &amp; Legal Disclaimers</p>
            <p className="text-sm mb-1">It is important for the Client to be aware of the following:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Services are based on documentation provided by the Client and third parties</li>
              <li>The Firm does not guarantee construction timelines or third-party performance</li>
              <li>Public authorities may request additional documentation at any stage</li>
              <li>Legal fees exclude government, notary, and third-party costs unless explicitly stated.</li>
            </ul>
          </div>

          {/* Section 8 */}
          <div className="mt-6">
            <p className="text-sm font-bold border-b pb-1 mb-3">8 — Next Steps</p>
            <p className="text-sm mb-1">Upon approval of this proposal:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm">
              <li>Execution of the legal services engagement agreement</li>
              <li>Payment of the initial legal fee</li>
              <li>Commencement of legal due diligence</li>
              <li>Contract review and coordination</li>
              <li>Notarial assistance and payment coordination</li>
              <li>Ongoing legal monitoring until project completion</li>
              <li>Completion upon issuance of ownership documentation in the Client&apos;s name</li>
            </ul>
          </div>

          <BusinessGroupFooter />
        </div>
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FALLBACK: Generic renderer for other service types (uses serviceContent prop)
    // ─────────────────────────────────────────────────────────────────────────
    const sc = serviceContent;
    const hp = !!(sc?.processSteps?.length);

    return (
      <div ref={ref} className={wrapperClass} style={serif}>
        {/* Cover */}
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

        {/* Case Overview — shown when nationality/occupation/purpose filled in */}
        {(fields.nationality || fields.employmentType || fields.purposeOfStay) && (
          <div className="border rounded p-4 mb-6 bg-gray-50">
            <p className="text-sm font-semibold mb-3">Case Overview</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Main Applicant</p>
                <p className="text-sm"><strong>Name:</strong> {clientName}</p>
                {fields.nationality && <p className="text-sm"><strong>Nationality:</strong> {fields.nationality}</p>}
                {fields.country && <p className="text-sm"><strong>Country of residence:</strong> {fields.country}</p>}
                {fields.employmentType && <p className="text-sm"><strong>Occupation:</strong> {fields.employmentType}</p>}
                {fields.purposeOfStay && <p className="text-sm"><strong>Relocation motive:</strong> {fields.purposeOfStay}</p>}
              </div>
            </div>
          </div>
        )}

        {sc ? (
          <>
            {/* Section 1 */}
            <div className="mb-1">
              <p className="text-sm font-bold border-b pb-1 mb-2">1 — Scope of the Proposal</p>
              <p className="text-sm">{sc.scopeParagraph}</p>
              {fields.transactionValueEUR && (
                <p className="text-sm mt-1">Total estimated transaction value: <strong>EUR {fmt(fields.transactionValueEUR, 0)}</strong>.</p>
              )}
            </div>

            {/* Section 2 */}
            <div className="mt-6">
              <p className="text-sm font-bold border-b pb-1 mb-2">2 — Scope of Services Provided</p>
              {sc.servicesSections.map((sec) => (
                <div key={sec.heading} className="mt-3">
                  <p className="text-sm font-semibold mb-1">{sec.heading}</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {sec.bullets.map((b, i) => <li key={i} className="text-sm">{b}</li>)}
                  </ul>
                </div>
              ))}
            </div>

            {/* Section 3 — Process (optional) */}
            {hp && (
              <div className="mt-6">
                <p className="text-sm font-bold border-b pb-1 mb-2">3 — Process Overview</p>
                {sc.processSteps!.map((ps, idx) => (
                  <div key={idx} className="mt-3">
                    <p className="text-sm font-semibold mb-1">{ps.step}</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {ps.bullets.map((b, i) => <li key={i} className="text-sm">{b}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* Required Documents */}
            <div className="mt-6">
              <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "4" : "3"} — Required Documents</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {sc.requiredDocs.map((d, i) => <li key={i} className="text-sm">{d}</li>)}
              </ul>
            </div>

            {/* Fees */}
            <div className="mt-6">
              <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "5" : "4"} — Fees &amp; Costs</p>
              <p className="text-sm mb-3">{sc.feeDescription}</p>
              <FeeTable />
            </div>

            {/* Payment Terms */}
            <div className="mt-6">
              <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "6" : "5"} — Payment Terms</p>
              {fields.paymentTermsNote ? (
                <p className="text-sm">{fields.paymentTermsNote}</p>
              ) : (
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>50% of the agreed legal service fee is payable upon signing of the engagement agreement.</li>
                  <li>50% of the agreed legal service fee is payable prior to completion of the engagement.</li>
                  <li>Government fees, notary fees, and any third-party costs are payable separately and in advance.</li>
                  <li>Payments may be made via bank transfer, cash, card payment, PayPal, or other agreed payment methods.</li>
                </ul>
              )}
            </div>

            {/* Timeline */}
            <div className="mt-6">
              <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "7" : "6"} — Timeline Overview</p>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                {sc.timeline.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>

            {/* Notes */}
            <div className="mt-6">
              <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "8" : "7"} — Important Notes &amp; Legal Disclaimers</p>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li>All legal services are provided based on the documentation and information made available by the Client and third parties.</li>
                <li>Processing times are estimates and may vary due to institutional workload or additional requirements.</li>
                <li>Public authorities may request additional documents or clarifications at any stage of the process.</li>
                <li>The Firm cannot guarantee timelines or decisions made by notaries, banks, or public authorities.</li>
              </ul>
            </div>

            {/* Next Steps */}
            <div className="mt-6">
              <p className="text-sm font-bold border-b pb-1 mb-2">{hp ? "9" : "8"} — Next Steps</p>
              <p className="text-sm mb-1">Upon your approval of this proposal, the following steps will be taken:</p>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                {sc.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <p>Proposal content is being prepared. Please check back shortly.</p>
            <p className="text-xs mt-1">Services: {svcs.map((s) => SERVICE_LABELS[s] || s).join(", ")}</p>
          </div>
        )}

        <div className="mt-10 border-t pt-4 text-center text-xs text-gray-400">
          DAFKU Law Firm · Tirana &amp; Durrës, Albania · info@dafkulawfirm.al · www.dafkulawfirm.al
        </div>
      </div>
    );
  }
);

ProposalPreview.displayName = "ProposalPreview";

export default ProposalPreview;
