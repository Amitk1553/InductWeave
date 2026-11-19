const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

let tokenGetter = async () => null;

/** Set from a component inside ClerkProvider so every request carries the session token. */
export const setTokenGetter = (fn) => {
  tokenGetter = fn;
};

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, query } = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const token = await tokenGetter();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?', { status: 0, code: 'NETWORK' });
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(e?.message ?? `Request failed (${res.status})`, { status: res.status, code: e?.code, details: e?.details });
  }
  return data;
}

export const api = {
  me: () => request('/api/me'),
  setDevRole: (role) => request('/api/dev/role', { method: 'POST', body: { role } }),

  employees: () => request('/api/employees'),
  createEmployee: (body, simulate) => request('/api/employees', { method: 'POST', body, query: { simulate } }),

  plan: (planId) => request(`/api/onboarding/${planId}`),
  generatePlan: (employeeId, simulate) => request(`/api/onboarding/generate/${employeeId}`, { method: 'POST', query: { simulate } }),
  approvePlan: (planId) => request(`/api/onboarding/${planId}/approve`, { method: 'POST' }),
  rejectPlan: (planId, reason) => request(`/api/onboarding/${planId}/reject`, { method: 'POST', body: { reason } }),

  tasks: (params) => request('/api/tasks', { query: params }),
  createTask: (body) => request('/api/tasks', { method: 'POST', body }),
  patchTask: (id, body) => request(`/api/tasks/${id}`, { method: 'PATCH', body }),
  confirmTask: (id) => request(`/api/tasks/${id}/confirm`, { method: 'POST' }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
  setTaskStatus: (id, status) => request(`/api/tasks/${id}/status`, { method: 'PATCH', body: { status } }),

  chatSend: (message) => request('/api/chat', { method: 'POST', body: { message } }),
  chatHistory: () => request('/api/chat/history'),
  contactHr: (messageId) => request('/api/chat/contact-hr', { method: 'POST', body: { messageId } }),

  dashboardStats: () => request('/api/dashboard/stats'),
  escalations: (status) => request('/api/escalations', { query: { status } }),
  scanEscalations: () => request('/api/escalation/scan', { method: 'POST' }),
  resolveEscalation: (id) => request(`/api/escalations/${id}/resolve`, { method: 'POST' }),
  audit: (employeeId) => request('/api/audit', { query: { employeeId } }),
  metrics: () => request('/api/observability/metrics'),
};
