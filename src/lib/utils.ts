import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isPast, differenceInHours, format } from "date-fns";

import { CaseStage } from "./types";

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

// Map legacy case state to simplified case stage used for grouping/UI
export function mapCaseStateToStage(state: string): CaseStage {
  switch (state) {
    case "INTAKE":
      return "INTAKE";
    case "WAITING_RESPONSE_P":
    case "WAITING_RESPONSE_C":
    case "WAITING_APPROVAL":
    case "WAITING_ACCEPTANCE":
      return "AWAITING";
    case "SEND_PROPOSAL":
    case "SEND_CONTRACT":
    case "DISCUSSING_Q":
      return "ACTIONABLE";
    default:
      return "ACTIONABLE";
  }
}
