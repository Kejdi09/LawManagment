import { AuditLogRecord, Case, CaseState, CaseTask, Customer, CustomerHistoryRecord, CustomerNotification, HistoryRecord, Note } from "./types";

// When VITE_API_URL is not set, use a relative base so the Vite dev proxy can forward `/api` calls.
const API_URL = import.meta.env.VITE_API_URL ?? "";

function getAuthHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Simple in-memory endpoint cooldowns to avoid repeated 404/network spam
const _endpointCooldowns: Record<string, number> = {};
const COOLDOWN_MS = 60_000; // 60s
const LONG_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h
const NOTIFICATION_COOLDOWN_KEY = "customer_notifications_cooldown_until";

function readNotificationCooldown(): number {
  try {
    const raw = localStorage.getItem(NOTIFICATION_COOLDOWN_KEY);
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeNotificationCooldown(until: number) {
  try {
    localStorage.setItem(NOTIFICATION_COOLDOWN_KEY, String(until));
  } catch {
    // ignore localStorage write errors
  }
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...(options?.headers || {}) },
    credentials: 'include',
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
  const key = "/api/customers";
  if (_endpointCooldowns[key] && _endpointCooldowns[key] > Date.now()) return [];
  try {
    return await api<Customer[]>(key);
  } catch (err) {
    console.warn(`getAllCustomers failed; backing off for ${COOLDOWN_MS / 1000}s`, err);
    _endpointCooldowns[key] = Date.now() + COOLDOWN_MS;
    return [];
  }
}

export async function getConfirmedClients(): Promise<Customer[]> {
  return api<Customer[]>("/api/confirmed-clients");
}

export async function updateConfirmedClient(customerId: string, patch: Partial<Customer>): Promise<Customer> {
  return api<Customer>(`/api/confirmed-clients/${customerId}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function deleteConfirmedClient(customerId: string): Promise<void> {
  await api(`/api/confirmed-clients/${customerId}`, { method: "DELETE" });
}

export async function getCustomerById(customerId: string): Promise<Customer | null> {
  // Try non-confirmed customers first, then fall back to confirmed-clients
  try {
    return await api<Customer>(`/api/customers/${customerId}`);
  } catch (err) {
    try {
      return await api<Customer>(`/api/confirmed-clients/${customerId}`);
    } catch (err2) {
      return null;
    }
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

export async function getCustomerNotifications(): Promise<CustomerNotification[]> {
  const key = "/api/customers/notifications";
  const now = Date.now();
  const persistedCooldownUntil = readNotificationCooldown();
  if (persistedCooldownUntil > now) return [] as CustomerNotification[];
  if (_endpointCooldowns[key] && _endpointCooldowns[key] > now) return [] as CustomerNotification[];
  try {
    return await api<CustomerNotification[]>(key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const isNotFound = /not found|404/i.test(message);
    const cooldownUntil = Date.now() + (isNotFound ? LONG_COOLDOWN_MS : COOLDOWN_MS);
    _endpointCooldowns[key] = cooldownUntil;
    if (isNotFound) {
      writeNotificationCooldown(cooldownUntil);
    }
    // If notifications endpoint is unavailable or returns 404, treat as empty list
    return [] as CustomerNotification[];
  }
}

export async function deleteCustomerNotification(notificationId: string): Promise<void> {
  await api(`/api/customers/notifications/${notificationId}`, { method: "DELETE" });
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

export async function getCustomerHistory(customerId: string): Promise<CustomerHistoryRecord[]> {
  return api<CustomerHistoryRecord[]>(`/api/customers/${customerId}/history`);
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

export async function deleteTask(taskId: string): Promise<void> {
  await api(`/api/tasks/${taskId}`, { method: "DELETE" });
}

// ── Documents ──
export type StoredDocument = {
  docId: string;
  ownerType: 'case' | 'customer';
  ownerId: string;
  filename?: string;
  originalName?: string;
  uploadedAt: string;
};

export async function getDocuments(ownerType: 'case' | 'customer', ownerId: string): Promise<StoredDocument[]> {
  const res = await fetch(`${API_URL}/api/documents?ownerType=${ownerType}&ownerId=${ownerId}`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch documents');
  return (await res.json()) as StoredDocument[];
}

export async function uploadDocument(ownerType: 'case' | 'customer', ownerId: string, file: File) {
  const form = new FormData();
  form.append('ownerType', ownerType);
  form.append('ownerId', ownerId);
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/documents/upload`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Upload failed');
  return await res.json();
}

export async function deleteDocument(docId: string) {
  await api(`/api/documents/${docId}`, { method: 'DELETE' });
}

export async function fetchDocumentBlob(docId: string): Promise<{ blob: Blob; fileName: string | null }> {
  const res = await fetch(`${API_URL}/api/documents/${docId}`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load document');
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  const fileName = match ? decodeURIComponent(match[1]) : null;
  return { blob, fileName };
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

export async function getAuditLogs(options?: {
  q?: string;
  action?: string;
  resource?: string;
  role?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<AuditLogRecord[]> {
  const params = new URLSearchParams();
  if (options?.q) params.set("q", options.q);
  if (options?.action) params.set("action", options.action);
  if (options?.resource) params.set("resource", options.resource);
  if (options?.role) params.set("role", options.role);
  if (options?.from) params.set("from", options.from);
  if (options?.to) params.set("to", options.to);
  if (typeof options?.page === "number") params.set("page", String(options.page));
  if (typeof options?.pageSize === "number") params.set("pageSize", String(options.pageSize));

  const path = params.toString() ? `/api/audit/logs?${params.toString()}` : "/api/audit/logs";
  const result = await api<AuditLogRecord[] | { items?: AuditLogRecord[] }>(path);
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.items) ? result.items : [];
}
