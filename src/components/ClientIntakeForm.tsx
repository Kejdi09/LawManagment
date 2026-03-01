/**
 * ClientIntakeForm
 * Structured intake form the customer fills in the Client Portal.
 * Fields are service-specific (dropdowns + checkboxes — no free-text traps).
 * On submit, answers are saved as ProposalFields so the lawyer can
 * generate the proposal automatically.
 */

import { useState } from "react";
import { CheckCircle2, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServiceType, ProposalFields } from "@/lib/types";

// ── nationality list ──────────────────────────────────────────────────────
const NATIONALITIES = [
  "Afghan", "Albanian", "Algerian", "American", "Argentinian", "Australian",
  "Austrian", "Azerbaijani", "Bahraini", "Bangladeshi", "Belgian", "Bosnian",
  "Brazilian", "British", "Bulgarian", "Cameroonian", "Canadian", "Chinese",
  "Colombian", "Croatian", "Czech", "Danish", "Dutch", "Egyptian",
  "Emirati", "Estonian", "Ethiopian", "Filipino", "Finnish", "French",
  "Georgian", "German", "Ghanaian", "Greek", "Hungarian", "Indian",
  "Indonesian", "Iranian", "Iraqi", "Irish", "Israeli", "Italian",
  "Jamaican", "Japanese", "Jordanian", "Kazakh", "Kenyan", "Kosovar",
  "Kuwaiti", "Lebanese", "Lithuanian", "Macedonian", "Malaysian", "Mexican",
  "Moldovan", "Montenegrin", "Moroccan", "Nigerian", "Norwegian", "Pakistani",
  "Palestinian", "Polish", "Portuguese", "Qatari", "Romanian", "Russian",
  "Saudi", "Serbian", "Slovak", "Slovenian", "South African", "Spanish",
  "Sri Lankan", "Swedish", "Swiss", "Syrian", "Taiwanese", "Tunisian",
  "Turkish", "Ukrainian", "Uzbek", "Venezuelan", "Vietnamese",
  "Other",
];

// ── occupation options ────────────────────────────────────────────────────
const OCCUPATIONS_GENERAL = [
  "Business Owner",
  "Company Director / CEO",
  "Employed (Company Employee)",
  "Freelancer / Self-Employed",
  "Investor",
  "In Retirement",
  "Semi-Retired",
  "Digital Nomad",
  "Student",
  "Other",
];

const RELOCATION_MOTIVES_COMPANY = [
  "Self-Employment / Company Registration",
  "Business Expansion",
  "Investment",
  "Other",
];

const PROPERTY_TYPES = [
  "Apartment (Off-Plan / Under Construction)",
  "Apartment (Ready to Move In)",
  "Villa / House",
  "Commercial Property",
  "Land / Plot",
  "Other",
];

const BUDGET_RANGES: { label: string; value: number }[] = [
  { label: "Under €30,000", value: 25000 },
  { label: "€30,000 – €60,000", value: 45000 },
  { label: "€60,000 – €100,000", value: 80000 },
  { label: "€100,000 – €150,000", value: 125000 },
  { label: "€150,000 – €250,000", value: 200000 },
  { label: "Over €250,000", value: 300000 },
];

const PREVIOUS_REFUSALS_OPTIONS = [
  "None — I have never been refused a visa or residence permit",
  "Yes — I will provide details in the Messages tab",
];

const COMPANY_TYPES = [
  "SH.P.K. (Limited Liability Company)",
  "SH.A. (Joint Stock Company)",
  "Branch of Foreign Company",
  "Representative Office",
  "Other",
];

const SHARE_CAPITAL_RANGES: { label: string; value: number }[] = [
  { label: "Minimum required (500,000 ALL ≈ €5,000)", value: 500000 },
  { label: "1,000,000 ALL (≈ €10,000)", value: 1000000 },
  { label: "2,500,000 ALL (≈ €25,000)", value: 2500000 },
  { label: "5,000,000 ALL (≈ €50,000)", value: 5000000 },
  { label: "10,000,000 ALL (≈ €100,000)", value: 10000000 },
  { label: "To be confirmed later", value: 500000 },
];

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaijan", "Bahrain", "Bangladesh", "Belgium", "Bosnia and Herzegovina",
  "Brazil", "Bulgaria", "Canada", "China", "Colombia", "Croatia", "Czech Republic",
  "Denmark", "Egypt", "Estonia", "Ethiopia", "Finland", "France", "Georgia", "Germany",
  "Ghana", "Greece", "Hungary", "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Israel", "Italy", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kosovo", "Kuwait",
  "Lebanon", "Lithuania", "Malaysia", "Mexico", "Moldova", "Montenegro", "Morocco",
  "Netherlands", "Nigeria", "Norway", "Pakistan", "Palestine", "Philippines",
  "Poland", "Portugal", "Qatar", "Romania", "Russia", "Saudi Arabia", "Serbia",
  "Slovakia", "Slovenia", "South Africa", "Spain", "Sri Lanka", "Sweden", "Switzerland",
  "Syria", "Taiwan", "Tunisia", "Turkey", "UAE", "Ukraine", "United Kingdom",
  "United States", "Uzbekistan", "Venezuela", "Vietnam", "Other",
];

// ── helpers ───────────────────────────────────────────────────────────────
function Select({
  id, label, value, onChange, options, placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function Field({
  id, label, value, onChange, placeholder, type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

// ── types ─────────────────────────────────────────────────────────────────
type IntakeFormData = {
  // ─ Personal / shared ─
  nationality: string;
  country: string;              // country of current residence
  idPassportNumber: string;     // optional: passport / ID number
  occupation: string;
  occupationOther: string;
  relocationMotive: string;
  previousRefusals: string;     // pensioner + visa_d
  // ─ Dependent (pensioner) ─
  hasDependent: boolean;
  dependentName: string;
  dependentNationality: string;
  dependentOccupation: string;
  dependentOccupationOther: string;
  // ─ Employment (visa_d) ─
  employerName: string;
  // ─ Real estate ─
  propertyType: string;
  propertyLocation: string;
  budgetRange: number | "";
  // ─ Company formation ─
  companyActivityDescription: string;
  companyNameIdeas: string;
  companyType: string;                // SH.P.K. / SH.A. / etc.
  numberOfShareholders: number | "";  // how many shareholders
  shareCapitalALL: number | "";       // registered capital in ALL
};

function emptyForm(): IntakeFormData {
  return {
    nationality: "",
    country: "",
    idPassportNumber: "",
    occupation: "",
    occupationOther: "",
    relocationMotive: "",
    previousRefusals: "",
    hasDependent: false,
    dependentName: "",
    dependentNationality: "",
    dependentOccupation: "",
    dependentOccupationOther: "",
    employerName: "",
    propertyType: "",
    propertyLocation: "",
    budgetRange: "",
    companyActivityDescription: "",
    companyNameIdeas: "",
    companyType: "",
    numberOfShareholders: "",
    shareCapitalALL: "",
  };
}

function toProposalFields(form: IntakeFormData, svcs: ServiceType[]): Partial<ProposalFields> {
  const isRealEstate = svcs.includes("real_estate");
  const isPensioner = svcs.includes("residency_pensioner");
  const isCompany = svcs.includes("company_formation");
  const isEmployment = svcs.includes("visa_d");

  const nationality = form.nationality;
  const occupation = form.occupation === "Other" ? form.occupationOther : form.occupation;

  const shared: Partial<ProposalFields> = {
    nationality,
    employmentType: occupation,
    country: form.country || undefined,
    idPassportNumber: form.idPassportNumber || undefined,
  };

  if (isRealEstate) {
    const desc = [form.propertyType, form.propertyLocation].filter(Boolean).join(", ");
    return {
      ...shared,
      propertyDescription: desc,
      transactionValueEUR: form.budgetRange !== "" ? Number(form.budgetRange) : undefined,
    };
  }

  const base: Partial<ProposalFields> = { ...shared };

  if (isPensioner) {
    base.previousRefusals = form.previousRefusals || undefined;
    Object.assign(base, {
      dependentName: form.hasDependent ? form.dependentName : "",
      dependentNationality: form.hasDependent ? form.dependentNationality : "",
      dependentOccupation: form.hasDependent
        ? (form.dependentOccupation === "Other" ? form.dependentOccupationOther : form.dependentOccupation)
        : "",
    });
  }

  if (isEmployment) {
    base.previousRefusals = form.previousRefusals || undefined;
    if (form.employerName) base.purposeOfStay = "Employment";
  }

  if (isCompany) {
    base.purposeOfStay = form.relocationMotive || "Self-Employment/Company Registration";
    base.businessActivity = form.companyActivityDescription;
    base.companyType = form.companyType || undefined;
    base.numberOfShareholders = form.numberOfShareholders !== "" ? Number(form.numberOfShareholders) : undefined;
    base.shareCapitalALL = form.shareCapitalALL !== "" ? Number(form.shareCapitalALL) : undefined;
  }

  return base;
}

// ── main component ────────────────────────────────────────────────────────
interface ClientIntakeFormProps {
  services: ServiceType[];
  clientName: string;
  /** Called when submitted with the mapped ProposalFields */
  onComplete: (fields: Partial<ProposalFields>) => Promise<void>;
  /** Pre-filled data from a previous save */
  savedFields?: Partial<ProposalFields>;
  /** True when the server already has a submitted intake (persists across refresh) */
  alreadySubmitted?: boolean;
}

export default function ClientIntakeForm({
  services,
  clientName,
  onComplete,
  savedFields,
  alreadySubmitted = false,
}: ClientIntakeFormProps) {
  const svcs = (services || []) as ServiceType[];
  const isPensioner = svcs.includes("residency_pensioner");
  const isEmployment = svcs.includes("visa_d");
  const isCompany = svcs.includes("company_formation");
  const isRealEstate = svcs.includes("real_estate");

  const [form, setForm] = useState<IntakeFormData>(() => {
    const f = emptyForm();
    if (savedFields) {
      f.nationality = savedFields.nationality || "";
      f.country = savedFields.country || "";
      f.idPassportNumber = savedFields.idPassportNumber || "";
      f.occupation = savedFields.employmentType || "";
      f.relocationMotive = savedFields.purposeOfStay || "";
      f.previousRefusals = savedFields.previousRefusals || "";
      f.dependentName = savedFields.dependentName || "";
      f.dependentNationality = savedFields.dependentNationality || "";
      f.dependentOccupation = savedFields.dependentOccupation || "";
      f.hasDependent = !!(savedFields.dependentName);
      f.companyActivityDescription = savedFields.businessActivity || "";
      f.companyType = savedFields.companyType || "";
      f.numberOfShareholders = savedFields.numberOfShareholders ?? "";
      f.shareCapitalALL = savedFields.shareCapitalALL ?? "";
      if (savedFields.propertyDescription) f.propertyType = savedFields.propertyDescription;
      if (savedFields.transactionValueEUR) f.budgetRange = savedFields.transactionValueEUR;
    }
    return f;
  });

  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.nationality) return "Please select your nationality.";
    if (!form.occupation) return "Please select your occupation type.";
    if (form.occupation === "Other" && !form.occupationOther.trim())
      return "Please describe your occupation.";
    if (isPensioner && form.hasDependent) {
      if (!form.dependentName.trim()) return "Please enter the dependent's full name.";
      if (!form.dependentNationality) return "Please select the dependent's nationality.";
      if (!form.dependentOccupation) return "Please select the dependent's occupation.";
    }
    if (isRealEstate) {
      if (!form.propertyType) return "Please select the type of property.";
      if (!form.budgetRange) return "Please select an approximate budget range.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);
    try {
      const fields = toProposalFields(form, svcs);
      await onComplete(fields);
      setSubmitted(true);
    } catch {
      setError("Failed to save your answers. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <div>
          <p className="font-semibold text-lg">Thank you, {clientName.split(" ")[0]}!</p>
          <p className="text-muted-foreground text-sm mt-1">
            Your information has been submitted. Our team will prepare your personalised proposal shortly — you will be notified once it is ready.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Questions? Use the <strong>Messages</strong> tab to chat with us directly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-md border bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
        <p className="font-semibold mb-0.5">Help us prepare your proposal</p>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Please fill in the details below. All fields have pre-defined options so there's no guesswork — just select what applies to you. This takes about 2 minutes.
        </p>
      </div>

      {/* ── PERSONAL DETAILS ── */}
      <div className="space-y-4">
        <p className="text-sm font-semibold border-b pb-1">Your Details</p>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Name: </span>
          <span className="font-medium">{clientName}</span>
        </div>

        <Select
          id="nationality"
          label="Nationality"
          value={form.nationality}
          onChange={(v) => set("nationality", v)}
          options={NATIONALITIES}
          placeholder="— Select your nationality —"
        />

        <Select
          id="country"
          label="Country of Current Residence"
          value={form.country}
          onChange={(v) => set("country", v)}
          options={COUNTRIES}
          placeholder="— Select country of residence —"
        />

        <Field
          id="idPassportNumber"
          label="Passport / ID Number (optional)"
          value={form.idPassportNumber}
          onChange={(v) => set("idPassportNumber", v)}
          placeholder="e.g. AB123456"
        />

        <Select
          id="occupation"
          label="Occupation / Employment Type"
          value={form.occupation}
          onChange={(v) => set("occupation", v)}
          options={OCCUPATIONS_GENERAL}
          placeholder="— Select your occupation type —"
        />

        {form.occupation === "Other" && (
          <Field
            id="occupationOther"
            label="Please describe your occupation"
            value={form.occupationOther}
            onChange={(v) => set("occupationOther", v)}
            placeholder="e.g. Architect, Medical professional…"
          />
        )}
      </div>

      {/* ── PENSIONER: RELOCATION + DEPENDENT ── */}
      {isPensioner && (
        <div className="space-y-4">
          <p className="text-sm font-semibold border-b pb-1">Residency Permit — Pensioner</p>
          <p className="text-xs text-muted-foreground">
            Your relocation motive is: <strong>Pensioner</strong> (Residence Permit for Pensioner).
          </p>

          <div className="space-y-2">
            <Label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.hasDependent}
                onChange={(e) => set("hasDependent", e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">I have a spouse / family member joining me (Family Reunification)</span>
            </Label>
          </div>

          {form.hasDependent && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dependent Details</p>
              <Field
                id="dependentName"
                label="Dependent Full Name"
                value={form.dependentName}
                onChange={(v) => set("dependentName", v)}
                placeholder="e.g. Amanda Kerri Norris"
              />
              <Select
                id="dependentNationality"
                label="Dependent Nationality"
                value={form.dependentNationality}
                onChange={(v) => set("dependentNationality", v)}
                options={NATIONALITIES}
                placeholder="— Select nationality —"
              />
              <Select
                id="dependentOccupation"
                label="Dependent Occupation"
                value={form.dependentOccupation}
                onChange={(v) => set("dependentOccupation", v)}
                options={OCCUPATIONS_GENERAL}
                placeholder="— Select occupation —"
              />
              {form.dependentOccupation === "Other" && (
                <Field
                  id="dependentOccupationOther"
                  label="Describe dependent's occupation"
                  value={form.dependentOccupationOther}
                  onChange={(v) => set("dependentOccupationOther", v)}
                  placeholder="e.g. Teacher, Engineer…"
                />
              )}
            </div>
          )}

          <Select
            id="previousRefusals"
            label="Previous Visa or Residency Permit Refusals"
            value={form.previousRefusals}
            onChange={(v) => set("previousRefusals", v)}
            options={PREVIOUS_REFUSALS_OPTIONS}
            placeholder="— Select an option —"
          />
        </div>
      )}

      {/* ── EMPLOYMENT VISA D ── */}
      {isEmployment && (
        <div className="space-y-4">
          <p className="text-sm font-semibold border-b pb-1">Type D Visa &amp; Residency Permit</p>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Relocation motive: </span>
            <span className="font-medium">Employment (Staff Relocation)</span>
          </div>
          <Field
            id="employerName"
            label="Employer / Company Name in Albania"
            value={form.employerName}
            onChange={(v) => set("employerName", v)}
            placeholder="e.g. Alpine Trade Sh.P.K."
          />
          <Select
            id="previousRefusalsEmployment"
            label="Previous Visa or Residency Permit Refusals"
            value={form.previousRefusals}
            onChange={(v) => set("previousRefusals", v)}
            options={PREVIOUS_REFUSALS_OPTIONS}
            placeholder="— Select an option —"
          />
        </div>
      )}

      {/* ── COMPANY FORMATION ── */}
      {isCompany && (
        <div className="space-y-4">
          <p className="text-sm font-semibold border-b pb-1">Company Formation</p>

          <Select
            id="relocationMotive"
            label="Relocation / Business Motive"
            value={form.relocationMotive}
            onChange={(v) => set("relocationMotive", v)}
            options={RELOCATION_MOTIVES_COMPANY}
            placeholder="— Select your motive —"
          />

          <Field
            id="companyActivityDescription"
            label="Describe your planned business activity"
            value={form.companyActivityDescription}
            onChange={(v) => set("companyActivityDescription", v)}
            placeholder="e.g. Import and distribution of medical equipment"
          />

          <Field
            id="companyNameIdeas"
            label="Company name ideas (optional — give 1–2 options)"
            value={form.companyNameIdeas}
            onChange={(v) => set("companyNameIdeas", v)}
            placeholder="e.g. Alpine Trade Sh.P.K."
          />

          <Select
            id="companyType"
            label="Preferred Legal Form of the Company"
            value={form.companyType}
            onChange={(v) => set("companyType", v)}
            options={COMPANY_TYPES}
            placeholder="— Select company type —"
          />

          <div className="space-y-1.5">
            <Label htmlFor="numberOfShareholders">Number of Shareholders</Label>
            <Input
              id="numberOfShareholders"
              type="number"
              min={1}
              max={100}
              value={form.numberOfShareholders === "" ? "" : String(form.numberOfShareholders)}
              onChange={(e) => set("numberOfShareholders", e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="e.g. 1"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shareCapitalALL">Approximate Registered Share Capital</Label>
            <div className="relative">
              <select
                id="shareCapitalALL"
                value={form.shareCapitalALL === "" ? "" : String(form.shareCapitalALL)}
                onChange={(e) => set("shareCapitalALL", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— Select capital range —</option>
                {SHARE_CAPITAL_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      )}

      {/* ── REAL ESTATE ── */}
      {isRealEstate && (
        <div className="space-y-4">
          <p className="text-sm font-semibold border-b pb-1">Real Estate</p>

          <Select
            id="propertyType"
            label="Type of Property"
            value={form.propertyType}
            onChange={(v) => set("propertyType", v)}
            options={PROPERTY_TYPES}
            placeholder="— Select property type —"
          />

          <Field
            id="propertyLocation"
            label="Preferred location / area (optional)"
            value={form.propertyLocation}
            onChange={(v) => set("propertyLocation", v)}
            placeholder="e.g. Golem, Tiranë, Sarandë, Durrës…"
          />

          <div className="space-y-1.5">
            <Label htmlFor="budgetRange">Approximate Budget</Label>
            <div className="relative">
              <select
                id="budgetRange"
                value={form.budgetRange === "" ? "" : String(form.budgetRange)}
                onChange={(e) =>
                  set("budgetRange", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— Select budget range —</option>
                {BUDGET_RANGES.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving…
          </>
        ) : (
          "Submit My Information"
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Your information is used solely to prepare your legal service proposal. It is handled securely and in accordance with applicable data protection standards.
      </p>
    </form>
  );
}
