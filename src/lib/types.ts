export type CaseState =
  | "NEW"
  | "IN_PROGRESS"
  | "WAITING_CUSTOMER"
  | "WAITING_AUTHORITIES"
  | "FINALIZED"
  | "INTAKE"
  | "SEND_PROPOSAL"
  | "WAITING_RESPONSE_P"
  | "DISCUSSING_Q"
  | "SEND_CONTRACT"
  | "WAITING_RESPONSE_C";

export type Priority = "urgent" | "high" | "medium" | "low";

export interface Case {
  caseId: string;
  version?: number;
  title?: string;
  caseType?: "client" | "customer";
  customerId: string;
  category: string;
  subcategory: string;
  state: CaseState;
  documentState: "ok" | "missing";
  lastStateChange: string;
  communicationMethod: string;
  generalNote: string;
  priority: Priority;
  deadline: string | null;
  // ServiceNow-like fields
  readyForWork?: boolean;
  slaDue?: string | null;
  assignedTo: string;
}

/** Fields collected via the intake bot and used to populate the proposal template */
export interface ProposalFields {
  /** Title of the proposal, e.g. "Legal Assistance for Real Estate Investment in Albania" */
  proposalTitle?: string;
  /** Employer / company name (used in work visa proposals) */
  companyName?: string;
  /** Date shown on the proposal (ISO string) */
  proposalDate?: string;
  /** Short description of what/where, e.g. "residential house and garage located in Durrës, Albania" */
  propertyDescription?: string;
  /** Transaction / investment value in EUR */
  transactionValueEUR?: number;
  /** Consultation fee in ALL (0 = free) */
  consultationFeeALL?: number;
  /** Main service fee in ALL */
  serviceFeeALL?: number;
  /** Alternative: use a percentage of transaction value instead of fixed fee (1–3) */
  serviceFeePct?: number;
  /** Power of Attorney fee in ALL */
  poaFeeALL?: number;
  /** Translation / notarisation costs in ALL */
  translationFeeALL?: number;
  /** Any other additional fees in ALL */
  otherFeesALL?: number;
  /** Free-text note on additional costs breakdown */
  additionalCostsNote?: string;
  /** Custom payment terms (overrides the default 50/50 split) */
  paymentTermsNote?: string;
  /** Nationality – used in the required-documents section */
  nationality?: string;
  /** Client's country of origin / current residence */
  country?: string;
  /** ID or passport number for documents section */
  idPassportNumber?: string;
  // ── Visa / Residency specific ──
  /** Number of applicants (including the main applicant) */
  numberOfApplicants?: number;
  /** Number of accompanying family members */
  numberOfFamilyMembers?: number;
  /** Employment type: employed, self-employed, student, retired, investor, other */
  employmentType?: string;
  /** Primary purpose of stay / relocation */
  purposeOfStay?: string;
  /** Previous visa/residency refusals: "none" or details */
  previousRefusals?: string;
  // ── Dependent (spouse / family member for Pensioner / Family Reunification) ──
  /** Full name of the accompanying dependent / spouse */
  dependentName?: string;
  /** Nationality of the dependent */
  dependentNationality?: string;
  /** Occupation / status of the dependent */
  dependentOccupation?: string;
  // ── Company Formation specific ──
  /** Legal form of the company: SH.P.K., SH.A., branch, representative office, other */
  companyType?: string;
  /** Number of shareholders */
  numberOfShareholders?: number;
  /** Primary business activity / purpose */
  businessActivity?: string;
  /** Proposed registered share capital in ALL */
  shareCapitalALL?: number;
  // ── Tax / Compliance specific ──
  /** Free-text description of the client's situation or what they need */
  situationDescription?: string;
  // ── Real Estate specific ──
  /** True when the property is off-plan / under construction (adds monitoring retainer section) */
  isOffPlan?: boolean;
  /** Expected construction completion year, e.g. "2027" (used when isOffPlan is true) */
  propertyCompletionYear?: string;
}

export interface Customer {
  customerId: string;
  version?: number;
  name: string;
  customerType: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  registeredAt: string;
  services: ServiceType[];
  serviceDescription: string;
  contactChannel: ContactChannel;
  assignedTo?: string;
  followUpDate?: string | null;
  status: LeadStatus;
  statusHistory?: Array<{ status: LeadStatus; date: string }>;
  expectedVersion?: number;
  notes?: string;
  /** Proposal-specific fields filled via intake bot or manually by staff */
  proposalFields?: ProposalFields;
  /** ISO timestamp of when the proposal was formally sent to the client */
  proposalSentAt?: string;
  /** Snapshot of the proposal fields at the time it was sent */
  proposalSnapshot?: ProposalFields;
  /** ISO timestamp of when the client first viewed the proposal in the portal */
  proposalViewedAt?: string;
  /** ISO timestamp of when the client last loaded the portal (any visit) */
  portalLastViewedAt?: string;
  /** ISO timestamp of when the proposal expires (default: 14 days after sent) */
  proposalExpiresAt?: string;
  /** ISO timestamp of when the client last submitted the intake form via the portal */
  intakeLastSubmittedAt?: string;
  /** Nationality – synced from proposalFields for convenience */
  nationality?: string;
  /** Country of origin / current residence */
  country?: string;
  /** When true, the portal intake bot is forced to restart (staff-triggered reset) */
  intakeBotReset?: boolean;
  /** ISO timestamp of when the client last submitted the portal intake form */
  intakeLastSubmittedAt?: string;
  /** ISO timestamp of when the client accepted the proposal */
  proposalAcceptedAt?: string;
  /** ISO timestamp of when the contract was formally sent to the client */
  contractSentAt?: string;
  /** Snapshot of the contract fields at the time it was sent */
  contractSnapshot?: ProposalFields;
  /** ISO timestamp of when the client first viewed the contract in the portal */
  contractViewedAt?: string;
  /** ISO timestamp of when the client accepted the contract */
  contractAcceptedAt?: string;
  /** Name typed by the client when electronically signing the contract via portal */
  contractSignedByName?: string;
  /** ISO timestamp of when the client electronically signed the contract via portal */
  contractSignedAt?: string;
  /** IP address of the client's device at the moment of signing */
  contractSignedIp?: string;
  /** Browser/user-agent string of the client's device at the moment of signing */
  contractSignedUserAgent?: string;
  /** HMAC-SHA256 integrity hash sealing name + timestamp + customerId + contract snapshot */
  contractSignatureHash?: string;
  /** Message / note left by the client when self-registering */
  message?: string | null;
  /** Source of the record, e.g. 'self_register' */
  source?: string;
  // ── Payment fields (set by admin when sending contract) ──
  /** Payment amount in ALL (pre-filled from contract total) */
  paymentAmountALL?: number;
  /** Payment amount in EUR (secondary display) */
  paymentAmountEUR?: number;
  /** Note shown to client about payment (e.g. payment terms, deadline) */
  paymentNote?: string | null;
  /** Payment methods the admin will accept: 'bank', 'crypto', 'cash' */
  paymentMethods?: Array<'bank' | 'crypto' | 'cash'>;
  /** Payment method the client selected via the portal */
  paymentSelectedMethod?: 'bank' | 'crypto' | 'cash' | null;
  /** ISO timestamp of when the admin marked payment as done */
  paymentDoneAt?: string | null;
  /** Username of admin who marked payment done */
  paymentDoneBy?: string | null;
  /** Initial (first-instalment) amount the admin requires before activating the client */
  initialPaymentAmount?: number | null;
  /** Currency for the initial payment (EUR, ALL, USD…) */
  initialPaymentCurrency?: string | null;
  /** ISO timestamp of when the payment reminder was sent */
  paymentReminderSentAt?: string | null;
}

export interface HistoryRecord {
  historyId: string;
  caseId: string;
  stateFrom: CaseState;
  stateIn: CaseState;
  date: string;
}

export interface CustomerHistoryRecord {
  historyId: string;
  customerId: string;
  statusFrom: LeadStatus;
  statusTo: LeadStatus;
  date: string;
  changedBy?: string | null;
  changedByRole?: string | null;
  changedByConsultant?: string | null;
  changedByLawyer?: string | null;
}

export interface AuditLogRecord {
  _id?: string;
  username?: string | null;
  role?: string | null;
  consultantName?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  at: string;
}

export interface Note {
  noteId: string;
  caseId: string;
  date: string;
  noteText: string;
}

export interface CaseTask {
  taskId: string;
  caseId: string;
  title: string;
  done: boolean;
  createdAt: string;
  dueDate: string | null;
}

export interface Meeting {
  meetingId: string;
  title: string;
  customerId?: string | null;
  startsAt: string;
  endsAt?: string | null;
  assignedTo: string;
  location?: string | null;
  notes?: string;
  status: string;
  createdBy?: string | null;
  createdAt?: string;
}

export interface TeamSummary {
  username: string;
  consultantName: string;
  role: string;
  customersCount: number;
  clientsCount: number;
  casesCount: number;
  meetingsCount: number;
}

export type ServiceType =
  | "visa_c"
  | "visa_d"
  | "residency_permit"
  | "residency_pensioner"
  | "company_formation"
  | "real_estate"
  | "tax_consulting"
  | "compliance";

export type ContactChannel =
  | "phone_call"
  | "whatsapp"
  | "website"
  | "email"
  | "in_person"
  | "referral";

export type LeadStatus =
  | "INTAKE"
  | "SEND_PROPOSAL"
  | "WAITING_APPROVAL"
  | "DISCUSSING_Q"
  | "SEND_CONTRACT"
  | "WAITING_ACCEPTANCE"
  | "AWAITING_PAYMENT"
  | "SEND_RESPONSE"
  | "CONFIRMED"
  | "CLIENT"
  | "ARCHIVED"
  | "CONSULTATION_SCHEDULED"
  | "CONSULTATION_DONE"
  | "ON_HOLD";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  INTAKE: "Intake / New",
  SEND_PROPOSAL: "Send Proposal",
  WAITING_APPROVAL: "Waiting Approval",
  DISCUSSING_Q: "Discussing Proposal",
  SEND_CONTRACT: "Send Contract",
  WAITING_ACCEPTANCE: "Waiting Acceptance",
  AWAITING_PAYMENT: "Awaiting Payment",
  SEND_RESPONSE: "Send Respond",
  CONFIRMED: "Confirmed",
  CLIENT: "Client Confirmed",
  ARCHIVED: "Archived",
  CONSULTATION_SCHEDULED: "Consulation Scheduled",
  CONSULTATION_DONE: "Consultation Done",
  ON_HOLD: "On Hold",
};

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  phone_call: "Phone Call",
  whatsapp: "WhatsApp",
  website: "Website",
  email: "Email",
  in_person: "In Person",
  referral: "Referral",
};

/** The 4 services available in the proposal system — each maps to one DOCX template */
export const PROPOSAL_SERVICES = [
  "residency_pensioner",
  "visa_d",
  "company_formation",
  "real_estate",
] as const satisfies ServiceType[];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  // ── 4 proposal-eligible services (shown in registration + proposal UI) ──
  residency_pensioner: "Residency Permit – Pensioner",
  visa_d: "Type D Visa & Residence Permit (Employment)",
  company_formation: "Company Formation + Visa D (Self-Employed)",
  real_estate: "Real Estate Investment",
  // ── Legacy service types (kept for backward compatibility, not shown in UI) ──
  visa_c: "Visa C",
  residency_permit: "Residency Permit",
  tax_consulting: "Tax Consulting",
  compliance: "Compliance",
};

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "bg-red-100 text-red-800" },
  high: { label: "High", color: "bg-orange-100 text-orange-800" },
  medium: { label: "Medium", color: "bg-amber-100 text-amber-800" },
  low: { label: "Low", color: "bg-emerald-100 text-emerald-800" },
};

export const STATE_LABELS: Record<CaseState, string> = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  WAITING_CUSTOMER: "Waiting Customer",
  WAITING_AUTHORITIES: "Waiting Authorities",
  FINALIZED: "Finalized",
  INTAKE: "Intake",
  SEND_PROPOSAL: "Send Proposal",
  WAITING_RESPONSE_P: "Waiting Response (P)",
  DISCUSSING_Q: "Discussing Proposal",
  SEND_CONTRACT: "Send Contract",
  WAITING_RESPONSE_C: "Waiting Response (C)",
};

export type CaseStage = "NEW" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "WAITING_AUTHORITIES" | "FINALIZED";

export const STAGE_LABELS: Record<CaseStage, string> = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  WAITING_CUSTOMER: "Waiting Customer",
  WAITING_AUTHORITIES: "Waiting Authorities",
  FINALIZED: "Finalized",
};

export const ALL_STAGES: CaseStage[] = ["IN_PROGRESS", "NEW", "WAITING_CUSTOMER", "WAITING_AUTHORITIES", "FINALIZED"];

export const ALLOWED_TRANSITIONS: Partial<Record<CaseState, CaseState[]>> = {
  INTAKE: ["SEND_PROPOSAL"],
  SEND_PROPOSAL: ["WAITING_RESPONSE_P"],
  WAITING_RESPONSE_P: ["DISCUSSING_Q", "SEND_CONTRACT"],
  DISCUSSING_Q: ["SEND_PROPOSAL", "SEND_CONTRACT"],
  SEND_CONTRACT: ["WAITING_RESPONSE_C"],
  WAITING_RESPONSE_C: [],
};

export const ALL_STATES: CaseState[] = [
  "NEW",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "WAITING_AUTHORITIES",
  "FINALIZED",
  "INTAKE",
  "SEND_PROPOSAL",
  "WAITING_RESPONSE_P",
  "DISCUSSING_Q",
  "SEND_CONTRACT",
  "WAITING_RESPONSE_C",
];

export const LAWYERS = ["Kejdi", "Albert"];

/** Lawyers who handle confirmed clients */
export const CLIENT_LAWYERS = ["Kejdi", "Albert"];

/** Lawyers who handle customer intake */
export const INTAKE_LAWYERS = ["Kejdi", "Albert"];

export interface CustomerNotification {
  notificationId: string;
  customerId: string;
  message: string;
  kind: "follow" | "respond";
  severity: "warn" | "critical";
  createdAt: string;
}

export type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";

export interface InvoicePayment {
  paymentId: string;
  amount: number;
  method: string;
  note?: string | null;
  date: string;
  recordedBy?: string | null;
}

export interface Invoice {
  invoiceId: string;
  caseId?: string | null;
  customerId: string;
  description: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  dueDate?: string | null;
  createdAt: string;
  createdBy?: string | null;
  assignedTo?: string | null;
  payments?: InvoicePayment[];
  amountPaid?: number;
}

export interface PortalInvoice {
  invoiceId: string;
  description: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  dueDate?: string | null;
  createdAt: string;
  payments: InvoicePayment[];
  amountPaid: number;
}

export type CommChannel = "email" | "whatsapp" | "phone" | "inperson";
export type CommDirection = "inbound" | "outbound";

export interface CommEntry {
  commId: string;
  caseId: string;
  channel: CommChannel;
  direction: CommDirection;
  summary: string;
  date: string;
  loggedBy?: string | null;
}

export interface SearchResult {
  customers: Array<{ customerId: string; name: string; status: string; type: "customer" }>;
  clients: Array<{ customerId: string; name: string; status: string; type: "client" }>;
  cases: Array<{ caseId: string; title?: string; customerId: string; state: string; caseType?: string; type: "case" }>;
}

export interface PortalNote {
  noteId: string;
  text: string;
  createdAt: string;
  createdBy: string;
}

export interface DeletedRecord {
  recordId: string;
  recordType: 'customer' | 'confirmedClient';
  customerId: string;
  customerName: string;
  deletedAt: string;
  deletedBy: string;
  snapshot: {
    customer: Customer;
    cases: Case[];
    caseHistory: HistoryRecord[];
    notes: Note[];
    tasks: CaseTask[];
    customerHistory: CustomerHistoryRecord[];
  };
}

export interface PortalData {
  client: { name: string; customerId: string; services: ServiceType[]; status: string; proposalFields?: ProposalFields };
  cases: Array<{
    caseId: string;
    title?: string;
    category: string;
    subcategory: string;
    state: string;
    priority?: string;
    deadline?: string | null;
    lastStateChange: string;
    generalNote?: string | null;
  }>;
  history: HistoryRecord[];
  portalNotes: PortalNote[];
  invoices?: PortalInvoice[];
  expiresAt?: string;
  proposalSentAt?: string | null;
  proposalSnapshot?: ProposalFields | null;
  proposalViewedAt?: string | null;
  proposalExpiresAt?: string | null;
  intakeBotReset?: boolean;
  intakeLastSubmittedAt?: string | null;
  contractSentAt?: string | null;
  contractSnapshot?: ProposalFields | null;
  contractViewedAt?: string | null;
  // Payment fields (visible after contract signing)
  paymentAmountALL?: number | null;
  paymentAmountEUR?: number | null;
  paymentNote?: string | null;
  paymentMethods?: Array<'bank' | 'crypto' | 'cash'> | null;
  paymentSelectedMethod?: 'bank' | 'crypto' | 'cash' | null;
  paymentDoneAt?: string | null;
  /** Initial (first-instalment) amount set by admin */
  initialPaymentAmount?: number | null;
  /** Currency of the initial payment */
  initialPaymentCurrency?: string | null;
}
