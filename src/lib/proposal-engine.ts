/**
 * proposal-engine.ts
 * Centralized proposal logic:
 *  - Condition rules (has_spouse, is_off_plan)
 *  - Form field definitions per service with condition-driven visibility
 *
 * This is the single source of truth consumed by ProposalModal (form) and
 * ProposalRenderer (document generation).
 */

import { ServiceType, ProposalFields } from "@/lib/types";

// ─── Condition rules ─────────────────────────────────────────────────────────

export interface Conditions {
  /** True when dependentName is filled in (adds Family Reunification to Pensioner proposal) */
  has_spouse: boolean;
  /** True when the real-estate property is off-plan / under construction */
  is_off_plan: boolean;
  /** True when the property is ready to move in (adds post-acquisition monitoring note) */
  is_move_in_ready: boolean;
}

export function evaluateConditions(fields: Partial<ProposalFields>): Conditions {
  // Check new multi-dependent array first, then fall back to legacy single-dependent field
  const hasArrayDeps = Array.isArray(fields.dependents) && fields.dependents.length > 0 &&
    fields.dependents.some(d => d.name?.trim().length > 0);
  const depRaw = (fields.dependentName ?? '').trim();
  const hasLegacyDep = depRaw.length > 0 && !/^(none|skip|n\/a|no|-)$/i.test(depRaw);
  return {
    has_spouse: hasArrayDeps || hasLegacyDep,
    is_off_plan: !!fields.isOffPlan,
    is_move_in_ready: !!fields.isMoveInReady,
  };
}

// ─── Form field definitions ───────────────────────────────────────────────────

export type FieldType = "text" | "number" | "date" | "boolean" | "textarea";

export interface FieldDef {
  /** Key in ProposalFields */
  key: keyof ProposalFields;
  label: string;
  type: FieldType;
  placeholder?: string;
  /** Explanatory note shown below the field */
  hint?: string;
  /**
   * If set, the field is only visible when this condition evaluates to true.
   * Evaluated against the live form values.
   */
  condition?: keyof Conditions;
  /**
   * Which services expose this field.
   * If omitted, the field is shown for all selected services.
   */
  services?: ServiceType[];
}

/**
 * Master list of all proposal form fields, in display order.
 * The form renders only fields whose `services` overlap with the currently
 * selected services, and whose `condition` (if any) is satisfied.
 */
export const FIELD_DEFS: FieldDef[] = [
  // ── Universal ──────────────────────────────────────────────────────────────
  {
    key: "nationality",
    label: "Nationality",
    type: "text",
    placeholder: "e.g. American, German, Portuguese…",
  },

  // ── Pensioner / Employment / Company: occupation ───────────────────────────
  {
    key: "employmentType",
    label: "Occupation / Status",
    type: "text",
    placeholder: "e.g. In Retirement, Business Owner, Employed",
    services: ["residency_pensioner", "visa_d", "company_formation"],
  },

  // ── Pensioner: dependent / spouse ─────────────────────────────────────────
  {
    key: "dependentName",
    label: "Spouse / Dependent Full Name",
    type: "text",
    placeholder: "Leave blank if no accompanying dependent",
    hint: "Filling this in adds a Family Reunification section to the proposal (STEP 2 + dependent documents).",
    services: ["residency_pensioner"],
  },
  {
    key: "dependentNationality",
    label: "Spouse / Dependent Nationality",
    type: "text",
    placeholder: "e.g. American, British…",
    condition: "has_spouse",
    services: ["residency_pensioner"],
  },
  {
    key: "dependentOccupation",
    label: "Spouse / Dependent Occupation",
    type: "text",
    placeholder: "e.g. In Retirement",
    condition: "has_spouse",
    services: ["residency_pensioner"],
  },

  // ── Real Estate ────────────────────────────────────────────────────────────
  {
    key: "propertyDescription",
    label: "Property Description",
    type: "text",
    placeholder: "e.g. residential apartment under construction in Golem, Albania",
    services: ["real_estate"],
  },
  {
    key: "transactionValueEUR",
    label: "Estimated Transaction Value (EUR)",
    type: "number",
    placeholder: "e.g. 85000",
    services: ["real_estate"],
  },
  {
    key: "isOffPlan",
    label: "Property is off-plan / under construction",
    type: "boolean",
    hint: "When checked, adds ongoing legal monitoring (retainer) and construction completion sections.",
    services: ["real_estate"],
  },
  {
    key: "propertyCompletionYear",
    label: "Expected Completion Year",
    type: "text",
    placeholder: "e.g. 2027",
    condition: "is_off_plan",
    services: ["real_estate"],
  },
];

/**
 * Returns the subset of FIELD_DEFS that are relevant for the given services
 * and satisfy the current conditions.
 */
export function getVisibleFields(
  services: ServiceType[],
  conditions: Conditions
): FieldDef[] {
  return FIELD_DEFS.filter((f) => {
    // Service filter: if a services list is specified, at least one must be selected
    if (f.services && !f.services.some((s) => services.includes(s))) return false;
    // Condition gate: if a condition is specified, it must be true
    if (f.condition && !conditions[f.condition]) return false;
    return true;
  });
}
