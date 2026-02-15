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
  notes?: string;
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
  SEND_CONTRACT: "Send Contract",
  WAITING_ACCEPTANCE: "Waiting Acceptance",
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
  NEW: "New",
  IN_PROGRESS: "In Progress",
  WAITING_CUSTOMER: "Waiting Customer",
  WAITING_AUTHORITIES: "Waiting Authorities",
  FINALIZED: "Finalized",
  INTAKE: "Intake",
  SEND_PROPOSAL: "Send Proposal",
  WAITING_RESPONSE_P: "Waiting Response (P)",
  DISCUSSING_Q: "Discussing Q",
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

export const LAWYERS = ["Dr. Weber", "Mag. Albert", "Dr. Kejdi", "Mag. Berger"];

export interface CustomerNotification {
  notificationId: string;
  customerId: string;
  message: string;
  kind: "follow" | "respond";
  severity: "warn" | "critical";
  createdAt: string;
}
