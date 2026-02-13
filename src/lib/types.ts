export type CaseState =
  | "INTAKE"
  | "SEND_PROPOSAL"
  | "WAITING_RESPONSE_P"
  | "DISCUSSING_Q"
  | "SEND_CONTRACT"
  | "WAITING_RESPONSE_C";

export type Priority = "urgent" | "high" | "medium" | "low";

export interface Case {
  caseId: string;
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

export interface Customer {
  customerId: string;
  name: string;
  country: string;
  customerType: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  registeredAt: string;
  services: ServiceType[];
  serviceDescription: string;
  contactChannel: ContactChannel;
  status: LeadStatus;
  statusHistory?: Array<{ status: LeadStatus; date: string }>;
  notes?: string;
}

export interface HistoryRecord {
  historyId: string;
  caseId: string;
  stateFrom: CaseState;
  stateIn: CaseState;
  date: string;
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

export type ServiceType =
  | "visa_c"
  | "visa_d"
  | "residency_permit"
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
  | "SEND_CONTRACT"
  | "WAITING_ACCEPTANCE"
  | "SEND_RESPONSE";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  INTAKE: "Intake / New",
  SEND_PROPOSAL: "Send Proposal",
  WAITING_APPROVAL: "Waiting Approval",
  SEND_CONTRACT: "Send Contract",
  WAITING_ACCEPTANCE: "Waiting Acceptance",
  SEND_RESPONSE: "Send Response",
};

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  phone_call: "Phone Call",
  whatsapp: "WhatsApp",
  website: "Website",
  email: "Email",
  in_person: "In Person",
  referral: "Referral",
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
  visa_c: "Visa C",
  visa_d: "Visa D",
  residency_permit: "Residency Permit",
  company_formation: "Company Formation",
  real_estate: "Real Estate",
  tax_consulting: "Tax Consulting",
  compliance: "Compliance",
};

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "bg-red-600 text-white" },
  high: { label: "High", color: "bg-orange-500 text-white" },
  medium: { label: "Medium", color: "bg-yellow-500 text-black" },
  low: { label: "Low", color: "bg-green-600 text-white" },
};

export const STATE_LABELS: Record<CaseState, string> = {
  INTAKE: "Intake",
  SEND_PROPOSAL: "Send Proposal",
  WAITING_RESPONSE_P: "Waiting Response (P)",
  DISCUSSING_Q: "Discussing Q",
  SEND_CONTRACT: "Send Contract",
  WAITING_RESPONSE_C: "Waiting Response (C)",
};

export type CaseStage = "INTAKE" | "ACTIONABLE" | "AWAITING" | "CLOSED";

export const STAGE_LABELS: Record<CaseStage, string> = {
  INTAKE: "Intake",
  ACTIONABLE: "Actionable",
  AWAITING: "Awaiting",
  CLOSED: "Closed",
};

export const ALL_STAGES: CaseStage[] = ["INTAKE", "ACTIONABLE", "AWAITING", "CLOSED"];

export const ALLOWED_TRANSITIONS: Record<CaseState, CaseState[]> = {
  INTAKE: ["SEND_PROPOSAL"],
  SEND_PROPOSAL: ["WAITING_RESPONSE_P"],
  WAITING_RESPONSE_P: ["DISCUSSING_Q", "SEND_CONTRACT"],
  DISCUSSING_Q: ["SEND_PROPOSAL", "SEND_CONTRACT"],
  SEND_CONTRACT: ["WAITING_RESPONSE_C"],
  WAITING_RESPONSE_C: [],
};

export const ALL_STATES: CaseState[] = [
  "INTAKE",
  "SEND_PROPOSAL",
  "WAITING_RESPONSE_P",
  "DISCUSSING_Q",
  "SEND_CONTRACT",
  "WAITING_RESPONSE_C",
];

export const LAWYERS = ["Dr. Weber", "Mag. Fischer", "Dr. Klein", "Mag. Berger"];
