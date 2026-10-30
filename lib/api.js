// Thin fetch wrapper for the real backend (backend/, Fastify on :4010).
// Handles the two things every authenticated request needs and that are
// easy to forget on any individual call site: credentials so the session
// cookie actually goes with the request, and the CSRF header the backend's
// double-submit-cookie check requires on every mutating request (see
// backend/src/lib/csrf.ts) — read from the non-httpOnly nx_csrf cookie the
// backend sets at login, so no separate token-fetch round trip is needed.

// Local dev talks to the API directly. A deployed build sets NEXT_PUBLIC_API_BASE to an
// empty string so requests stay same-origin and are proxied to the backend by the
// rewrites in next.config.mjs (keeps session/CSRF cookies first-party).
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4010';

function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

// A 401 on anything except the sign-in calls themselves means the session is gone (expired, idle timeout, revoked,
// account suspended). SessionHeartbeat listens for this and sends the user to the sign-in page.
export const SESSION_EXPIRED_EVENT = 'nx:session-expired';
const SIGN_IN_PATHS = /^\/v1\/(admin\/)?auth\/(login|mfa|signup|forgot-password|reset-password|heartbeat)/;

// Re-issues the CSRF cookie for the current session (e.g. one that predates a deploy). Resolves to false when there is no session.
export async function refreshCsrf() {
  try {
    const response = await fetch(`${API_BASE}/v1/auth/heartbeat`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return response.ok;
  } catch { return false; }
}

export async function apiFetch(path, { method = 'GET', body, headers = {} } = {}, retried = false) {
  const isMutating = method !== 'GET';
  const csrf = isMutating ? readCookie('nx_csrf') : null;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null;
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (proxy/gateway HTML error page) — still surface it as an ApiError.
    if (!response.ok) throw new ApiError(response.status, null);
    throw new ApiError(response.status, { error: 'Malformed response from server' });
  }
  // A stale CSRF cookie is recoverable without signing in again: ask the heartbeat for a fresh one and retry once.
  if (response.status === 403 && !retried && String(data?.error || '').startsWith('CSRF_TOKEN') && (await refreshCsrf())) {
    return apiFetch(path, { method, body, headers }, true);
  }
  if (response.status === 401 && typeof window !== 'undefined' && !SIGN_IN_PATHS.test(path)) {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { reason: data?.error } }));
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

// Fetches a file (CSV etc.) with the session cookie and saves it through the browser.
export async function apiDownload(path, fallbackName = 'download.csv') {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!response.ok) {
    let body = null;
    try { body = await response.json(); } catch { /* non-JSON error body */ }
    throw new ApiError(response.status, body);
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const reportsApi = {
  types: () => apiFetch('/v1/reports/types'),
  list: () => apiFetch('/v1/reports'),
  generate: (body) => apiFetch('/v1/reports', { method: 'POST', body }),
  get: (id) => apiFetch(`/v1/reports/${id}`),
  // format 'csv' saves the API file as-is; 'xlsx' converts the same rows to an Excel workbook.
  download: async (id, name, format = 'csv') => {
    if (format !== 'xlsx') return apiDownload(`/v1/reports/${id}/download`, name);
    const response = await fetch(`${API_BASE}/v1/reports/${id}/download`, { credentials: 'include' });
    if (!response.ok) { let body = null; try { body = await response.json(); } catch { /* non-JSON */ } throw new ApiError(response.status, body); }
    const { parseCsv, saveRows } = await import('./exportFile');
    await saveRows(parseCsv(await response.text()), (name || 'report').replace(/\.csv$/i, ''), 'xlsx');
  },
  admin: (kind) => apiFetch(`/v1/admin/reports/${kind}`),
};

export const adminApi = {
  login: (email, password) => apiFetch('/v1/admin/auth/login', { method: 'POST', body: { email, password } }),
  forgotPassword: (email) => apiFetch('/v1/admin/auth/forgot-password', { method: 'POST', body: { email } }),
  verifyMfa: (mfaToken, code) => apiFetch('/v1/admin/auth/mfa', { method: 'POST', body: { mfaToken, code } }),
  logout: () => apiFetch('/v1/admin/auth/logout', { method: 'POST' }),
  me: () => apiFetch('/v1/admin/me'),
  sellers: (params = {}) => apiFetch(`/v1/admin/sellers?${new URLSearchParams(params)}`),
  sellerDetail: (sellerId) => apiFetch(`/v1/admin/sellers/${sellerId}`),
  setSellerState: (sellerId, state, note) => apiFetch(`/v1/admin/sellers/${sellerId}/state`, { method: 'POST', body: { state, note } }),
  kycQueue: (status) => apiFetch(`/v1/admin/kyc${status ? `?status=${status}` : ''}`),
  kycDecision: (sellerId, decision, rejectionReason) => apiFetch(`/v1/admin/kyc/${sellerId}/decision`, { method: 'POST', body: { decision, rejectionReason } }),
  couriers: () => apiFetch('/v1/admin/couriers'),
  rateCardOverview: (search) => apiFetch(`/v1/admin/rate-cards/overview${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createCourier: (body) => apiFetch('/v1/admin/couriers', { method: 'POST', body }),
  aggregatorCouriers: (aggregator) => apiFetch(`/v1/admin/aggregators/${aggregator}/couriers`),
  setSellerCourierAccess: (sellerId, body) => apiFetch(`/v1/admin/sellers/${sellerId}/courier-access`, { method: 'PUT', body }),
  publishRateCard: (sellerId, body) => apiFetch(`/v1/admin/sellers/${sellerId}/rate-cards`, { method: 'POST', body }),
  zones: () => apiFetch('/v1/admin/courier-zones'),
  createZone: (zoneCode, destinationPrefix, label) => apiFetch('/v1/admin/courier-zones', { method: 'POST', body: { zoneCode, destinationPrefix, label } }),
  shipments: (params = {}) => apiFetch(`/v1/admin/shipments?${new URLSearchParams(params)}`),
  orders: (params = {}) => apiFetch(`/v1/admin/orders?${new URLSearchParams(params)}`),
  ndr: (params = {}) => apiFetch(`/v1/admin/ndr?${new URLSearchParams(params)}`),
  dashboardAnalytics: (days = 30, range = null) => apiFetch(`/v1/admin/analytics/dashboard?${new URLSearchParams(range ? { days, from: range.from, to: range.to } : { days })}`),
  wallets: (params = {}) => apiFetch(`/v1/admin/wallets?${new URLSearchParams(params)}`),
  search: (q) => apiFetch(`/v1/admin/search?${new URLSearchParams({ q })}`),
  pincodeBlocks: () => apiFetch('/v1/admin/pincode-blocks'),
  blockPincodes: (pincodes, note) => apiFetch('/v1/admin/pincode-blocks', { method: 'POST', body: { pincodes, note } }),
  openPincodes: (pincodes) => apiFetch('/v1/admin/pincode-blocks/open', { method: 'POST', body: { pincodes } }),
  pickups: () => apiFetch('/v1/admin/pickups'),
  invoices: (params = {}) => apiFetch(`/v1/admin/invoices?${new URLSearchParams(params)}`),
  codRemittances: (params = {}) => apiFetch(`/v1/admin/cod-remittances?${new URLSearchParams(params)}`),
  jobs: (params = {}) => apiFetch(`/v1/admin/jobs?${new URLSearchParams(params)}`),
  retryJob: (jobId) => apiFetch(`/v1/admin/jobs/${jobId}/retry`, { method: 'POST' }),
  auditEvents: (params = {}) => apiFetch(`/v1/admin/audit-events?${new URLSearchParams(params)}`),
  webhookDeliveries: (params = {}) => apiFetch(`/v1/admin/webhook-deliveries?${new URLSearchParams(params)}`),
  sessions: () => apiFetch('/v1/admin/sessions'),
  revokeSession: (sessionId) => apiFetch(`/v1/admin/sessions/${sessionId}`, { method: 'DELETE' }),
};
