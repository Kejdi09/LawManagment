import { AuditLogRecord, Case, CaseState, CaseTask, CommEntry, Customer, CustomerHistoryRecord, CustomerNotification, DeletedRecord, HistoryRecord, Invoice, Meeting, Note, PortalData, PortalMessage, PortalNote, SearchResult, TeamSummary } from "./types";

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

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
export async function getAllCases(caseType?: string): Promise<Case[]> {
  const url = caseType ? `/api/cases?caseType=${caseType}` : "/api/cases";
  return api<Case[]>(url);
}

export async function getCasesPage(page: number, pageSize: number, sortBy = "caseId", sortDir: "asc" | "desc" = "asc"): Promise<PagedResult<Case>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sortBy,
    sortDir,
  });
  return api<PagedResult<Case>>(`/api/cases?${params.toString()}`);
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

export async function searchCases(query: string, caseType?: string): Promise<Case[]> {
  const q = encodeURIComponent(query);
  const typeParam = caseType ? `&caseType=${caseType}` : "";
  return api<Case[]>(`/api/cases?q=${q}${typeParam}`);
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

export async function getCustomersPage(page: number, pageSize: number, sortBy = "customerId", sortDir: "asc" | "desc" = "asc"): Promise<PagedResult<Customer>> {
  const key = `/api/customers?page=${encodeURIComponent(String(page))}&pageSize=${encodeURIComponent(String(pageSize))}&sortBy=${encodeURIComponent(sortBy)}&sortDir=${encodeURIComponent(sortDir)}`;
  if (_endpointCooldowns["/api/customers"] && _endpointCooldowns["/api/customers"] > Date.now()) {
    return { items: [], total: 0, page, pageSize, totalPages: 0 };
  }
  try {
    return await api<PagedResult<Customer>>(key);
  } catch (err) {
    console.warn(`getCustomersPage failed; backing off for ${COOLDOWN_MS / 1000}s`, err);
    _endpointCooldowns["/api/customers"] = Date.now() + COOLDOWN_MS;
    return { items: [], total: 0, page, pageSize, totalPages: 0 };
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
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
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

export async function getTeamSummary(): Promise<TeamSummary[]> {
  return api<TeamSummary[]>("/api/team/summary");
}

export async function getMeetings(): Promise<Meeting[]> {
  return api<Meeting[]>("/api/meetings");
}

export async function createMeeting(payload: Omit<Meeting, "meetingId" | "createdAt" | "createdBy">): Promise<Meeting> {
  return api<Meeting>("/api/meetings", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateMeeting(meetingId: string, patch: Partial<Meeting>): Promise<Meeting> {
  return api<Meeting>(`/api/meetings/${meetingId}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  await api(`/api/meetings/${meetingId}`, { method: "DELETE" });
}

// ── Global Search ──
export async function globalSearch(q: string): Promise<SearchResult> {
  return api<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`);
}

// ── Invoices ──
export async function getInvoices(filters?: { caseId?: string; customerId?: string }): Promise<Invoice[]> {
  const params = new URLSearchParams();
  if (filters?.caseId) params.set("caseId", filters.caseId);
  if (filters?.customerId) params.set("customerId", filters.customerId);
  const qs = params.toString();
  return api<Invoice[]>(qs ? `/api/invoices?${qs}` : "/api/invoices");
}

export async function createInvoice(payload: Omit<Invoice, "invoiceId" | "createdAt">): Promise<Invoice> {
  return api<Invoice>("/api/invoices", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateInvoice(invoiceId: string, patch: Partial<Invoice>): Promise<Invoice> {
  return api<Invoice>(`/api/invoices/${invoiceId}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  await api(`/api/invoices/${invoiceId}`, { method: "DELETE" });
}

// ── Communications Log ──
export async function getCommsLog(caseId: string): Promise<CommEntry[]> {
  return api<CommEntry[]>(`/api/cases/${caseId}/comms`);
}

export async function addCommEntry(caseId: string, payload: { channel: string; direction: string; summary: string }): Promise<CommEntry> {
  return api<CommEntry>(`/api/cases/${caseId}/comms`, { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteCommEntry(commId: string): Promise<void> {
  await api(`/api/comms/${commId}`, { method: "DELETE" });
}

// ── Client Portal ──
export async function generatePortalToken(customerId: string, expiresInDays = 30): Promise<{ token: string; expiresAt: string }> {
  return api("/api/portal/tokens", { method: "POST", body: JSON.stringify({ customerId, expiresInDays }) });
}

export async function getPortalToken(customerId: string): Promise<{ token: string; expiresAt: string } | null> {
  try {
    return await api<{ token: string; expiresAt: string } | null>(`/api/portal/tokens/${customerId}`);
  } catch {
    return null;
  }
}

export async function getPortalData(token: string): Promise<PortalData> {
  return api<PortalData>(`/api/portal/${token}`);
}

export async function revokePortalToken(customerId: string): Promise<void> {
  await api(`/api/portal/tokens/${customerId}`, { method: "DELETE" });
}

export async function extendPortalToken(
  customerId: string,
  days = 30
): Promise<{ token: string; expiresAt: string }> {
  return api<{ token: string; expiresAt: string }>(
    `/api/portal/tokens/${customerId}/extend`,
    { method: "PATCH", body: JSON.stringify({ days }) }
  );
}

export async function markProposalViewed(token: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/portal/${encodeURIComponent(token)}/proposal-viewed`, {
      method: "POST",
    });
  } catch {
    // non-blocking — ignore errors
  }
}

export async function getPortalNotes(customerId: string): Promise<PortalNote[]> {
  return api<PortalNote[]>(`/api/portal-notes/${customerId}`);
}

export async function addPortalNote(customerId: string, text: string): Promise<PortalNote> {
  return api<PortalNote>(`/api/portal-notes/${customerId}`, { method: "POST", body: JSON.stringify({ text }) });
}

export async function deletePortalNote(customerId: string, noteId: string): Promise<void> {
  await api(`/api/portal-notes/${customerId}/${noteId}`, { method: "DELETE" });
}

// ── Portal Chat ──
// Client-side (token-based, no auth needed)
export async function getPortalChatByToken(token: string): Promise<{ expired: boolean; messages: PortalMessage[] }> {
  const res = await fetch(`${API_URL}/api/portal/chat/${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function savePortalIntakeFields(token: string, fields: Partial<import("./types").ProposalFields>): Promise<void> {
  const res = await fetch(`${API_URL}/api/portal/${encodeURIComponent(token)}/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposalFields: fields }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

export async function respondToProposal(token: string, action: "accept" | "revision", note?: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/portal/${encodeURIComponent(token)}/respond-proposal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

export async function sendPortalMessage(token: string, text: string): Promise<PortalMessage> {
  const res = await fetch(`${API_URL}/api/portal/chat/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Admin-side (JWT auth)
export async function getAdminChat(customerId: string): Promise<PortalMessage[]> {
  return api<PortalMessage[]>(`/api/portal-chat/${customerId}`);
}

export async function sendAdminMessage(customerId: string, text: string): Promise<PortalMessage> {
  return api<PortalMessage>(`/api/portal-chat/${customerId}`, { method: "POST", body: JSON.stringify({ text }) });
}

export async function markChatRead(customerId: string): Promise<void> {
  await api(`/api/portal-chat/${customerId}/read`, { method: "PUT" });
}

export async function deletePortalChatMessage(customerId: string, messageId: string): Promise<void> {
  await api(`/api/portal-chat/${customerId}/${messageId}`, { method: "DELETE" });
}

export async function deletePortalChat(customerId: string): Promise<void> {
  await api(`/api/portal-chat/${customerId}`, { method: "DELETE" });
}

export async function getChatUnreadCounts(): Promise<Array<{ customerId: string; unreadCount: number }>> {
  return api<Array<{ customerId: string; unreadCount: number }>>(`/api/portal-chat/unread-counts`);
}

// ── Admin: Deleted Records ──
export async function getDeletedRecords(): Promise<DeletedRecord[]> {
  return api<DeletedRecord[]>('/api/admin/deleted-records');
}

export async function getDeletedRecord(recordId: string): Promise<DeletedRecord> {
  return api<DeletedRecord>(`/api/admin/deleted-records/${recordId}`);
}

export async function restoreDeletedRecord(recordId: string): Promise<void> {
  await api(`/api/admin/deleted-records/${recordId}/restore`, { method: 'POST' });
}

// ── Admin: Staff Management ──
export interface StaffUser {
  username: string;
  role: string;
  consultantName: string;
  lawyerName?: string;
  managerUsername?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffNames {
  clientLawyers: string[];
  intakeLawyers: string[];
  allLawyers: string[];
}

export async function getStaffUsers(): Promise<StaffUser[]> {
  return api<StaffUser[]>('/api/admin/users');
}

export async function createStaffUser(payload: { username: string; password: string; role: string; consultantName: string; managerUsername?: string }): Promise<StaffUser> {
  return api<StaffUser>('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateStaffUser(username: string, patch: { role?: string; consultantName?: string; managerUsername?: string; password?: string }): Promise<StaffUser> {
  return api<StaffUser>(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'PUT', body: JSON.stringify(patch) });
}

export async function deleteStaffUser(username: string): Promise<void> {
  await api(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
}

export async function getStaffNames(): Promise<StaffNames> {
  return api<StaffNames>('/api/admin/staff-names');
}
