import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isPast, differenceInHours, format } from "date-fns";

import { CaseStage, Case, CaseTask, CaseState } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Keep backward-compatible alias for components still importing classNames
export function classNames(...inputs: ClassValue[]) {
  return cn(...inputs);
}

// Deadline notification helper
export function getDeadlineNotification(deadline: string | null | undefined, caseId: string) {
  if (!deadline) return null;
  
  const deadlineDate = new Date(deadline);
  const now = new Date();
  
  if (isPast(deadlineDate)) {
    return {
      type: "overdue" as const,
      message: `Overdue: ${caseId}`,
      severity: "destructive" as const,
    };
  }
  
  const hoursUntilDeadline = differenceInHours(deadlineDate, now);
  
  if (hoursUntilDeadline <= 48 && hoursUntilDeadline > 0) {
    return {
      type: "soon" as const,
      message: `${caseId} due in ${hoursUntilDeadline}h`,
      severity: "warning" as const,
    };
  }
  
  return null;
}

// Consistent date formatter used across the app. Returns `dd/MM/yyyy` by default
// and `dd/MM/yyyy HH:mm` when `includeTime` is true.
export function formatDate(value: string | Date | null | undefined, includeTime = false) {
  if (!value) return "N/A";
  const d = new Date(value as any);
  if (isNaN(d.getTime())) return "N/A";
  return includeTime ? format(d, "dd/MM/yyyy HH:mm") : format(d, "dd/MM/yyyy");
}

// Map legacy case state to simplified case stage used for grouping/UI
export function mapCaseStateToStage(state: string): CaseStage {
  switch (state) {
    case "NEW":
      return "NEW";
    case "IN_PROGRESS":
      return "IN_PROGRESS";
    case "WAITING_CUSTOMER":
      return "WAITING_CUSTOMER";
    case "WAITING_AUTHORITIES":
      return "WAITING_AUTHORITIES";
    case "FINALIZED":
      return "FINALIZED";
    case "INTAKE":
      return "NEW";
    case "WAITING_RESPONSE_P":
    case "WAITING_RESPONSE_C":
      return "WAITING_CUSTOMER";
    case "WAITING_APPROVAL":
    case "WAITING_ACCEPTANCE":
      return "WAITING_AUTHORITIES";
    case "SEND_PROPOSAL":
    case "SEND_CONTRACT":
    case "DISCUSSING_Q":
      return "IN_PROGRESS";
    default:
      return "IN_PROGRESS";
  }
}

// Map a UI stage selection back to a representative legacy CaseState
export function mapStageToState(stage: CaseStage): CaseState {
  switch (stage) {
    case "NEW":
      return "NEW";
    case "IN_PROGRESS":
      return "IN_PROGRESS";
    case "WAITING_CUSTOMER":
      return "WAITING_CUSTOMER";
    case "WAITING_AUTHORITIES":
      return "WAITING_AUTHORITIES";
    case "FINALIZED":
      return "FINALIZED";
    default:
      return "IN_PROGRESS";
  }
}

// Compute whether a case is ready for work using case stage and its tasks.
// Returns ready flag, number of pending tasks and whether SLA is overdue.
export function computeReadyForWork(c: Case, tasks: CaseTask[]) {
  const stage = mapCaseStateToStage(c.state);
  const pendingTasks = tasks.filter((t) => !t.done).length;
  const now = new Date();
  const slaOverdue = !!c.slaDue && isPast(new Date(c.slaDue));

  // A case is considered ready if it's in ACTIONABLE stage.
  // SLA overdue is returned for UI emphasis.
  return {
    ready: stage === "IN_PROGRESS",
    pendingTasks,
    slaOverdue,
  };
}
