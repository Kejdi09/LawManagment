import { Case, CaseState, CaseTask, Customer, HistoryRecord, Note } from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  // Handle endpoints that return no content or non-JSON bodies gracefully
  const txt = await res.text();
  if (!txt) return null as unknown as T;
  try {
    return JSON.parse(txt) as T;
  } catch {
    // If response is not valid JSON, return raw text casted to expected type
    return txt as unknown as T;
  }
}

// ── Cases ──
export async function getAllCases(): Promise<Case[]> {
  return api<Case[]>("/api/cases");
}

export async function getCasesByState(state: CaseState): Promise<Case[]> {
  return api<Case[]>(`/api/cases?state=${state}`);
}

export async function getCaseById(caseId: string): Promise<Case | null> {
  try {
    return await api<Case>(`/api/cases/${caseId}`);
  } catch {
    return null;
  }
}

export async function getCasesByCustomer(customerId: string): Promise<Case[]> {
  return api<Case[]>(`/api/customers/${customerId}/cases`);
}

export async function searchCases(query: string): Promise<Case[]> {
  const q = encodeURIComponent(query);
  return api<Case[]>(`/api/cases?q=${q}`);
}

export async function createCase(payload: Omit<Case, "caseId" | "lastStateChange">): Promise<Case> {
  return api<Case>("/api/cases", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateCase(caseId: string, patch: Partial<Case>): Promise<Case> {
  return api<Case>(`/api/cases/${caseId}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function deleteCase(caseId: string): Promise<void> {
  await api(`/api/cases/${caseId}`, { method: "DELETE" });
}

// ── Customers ──
export async function getAllCustomers(): Promise<Customer[]> {
  return api<Customer[]>("/api/customers");
}

export async function getCustomerById(customerId: string): Promise<Customer | null> {
  try {
    return await api<Customer>(`/api/customers/${customerId}`);
  } catch {
    return null;
  }
}

export async function createCustomer(payload: Omit<Customer, "customerId">): Promise<Customer> {
  return api<Customer>("/api/customers", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateCustomer(customerId: string, patch: Partial<Customer>): Promise<Customer> {
  return api<Customer>(`/api/customers/${customerId}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function deleteCustomer(customerId: string): Promise<void> {
  await api(`/api/customers/${customerId}`, { method: "DELETE" });
}

// ── History ──
export async function getHistoryByCaseId(caseId: string): Promise<HistoryRecord[]> {
  return api<HistoryRecord[]>(`/api/cases/${caseId}/history`);
}

export async function addHistory(caseId: string, stateFrom: CaseState, stateIn: CaseState): Promise<HistoryRecord> {
  return api<HistoryRecord>(`/api/cases/${caseId}/history`, {
    method: "POST",
    body: JSON.stringify({ stateFrom, stateIn }),
  });
}

export async function getCustomerHistory(customerId: string): Promise<any[]> {
  return api<any[]>(`/api/customers/${customerId}/history`);
}

// ── Notes ──
export async function getNotesByCaseId(caseId: string): Promise<Note[]> {
  return api<Note[]>(`/api/cases/${caseId}/notes`);
}

export async function addNote(caseId: string, noteText: string): Promise<Note> {
  return api<Note>(`/api/cases/${caseId}/notes`, { method: "POST", body: JSON.stringify({ noteText }) });
}

// ── Tasks ──
export async function getTasksByCaseId(caseId: string): Promise<CaseTask[]> {
  return api<CaseTask[]>(`/api/cases/${caseId}/tasks`);
}

export async function addTask(caseId: string, title: string, dueDate: string | null): Promise<CaseTask> {
  return api<CaseTask>(`/api/cases/${caseId}/tasks`, { method: "POST", body: JSON.stringify({ title, dueDate }) });
}

export async function toggleTask(taskId: string): Promise<CaseTask> {
  return api<CaseTask>(`/api/tasks/${taskId}/toggle`, { method: "POST" });
}

// ── KPIs ──
export async function getKPIs() {
  return api(`/api/kpis`);
}

// ── State transitions ──
export async function changeState(caseId: string, newState: CaseState): Promise<HistoryRecord> {
  const current = await getCaseById(caseId);
  if (!current) throw new Error("Case not found");
  return addHistory(caseId, current.state, newState);
}

// ── Background rules ── (now driven by backend; keep placeholder)
export async function checkAutomaticRules() {
  return { deletedCustomers: [], deletedCases: [], inactivityReminders: [], sendReminders: [] };
}
