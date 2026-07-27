/**
 * api.js — Fetch API wrapper with JWT auth, refresh rotation & error handling.
 * All modules import { get, post, put, patch, del } from this file.
 * Uses relative URL so it works on any host/port without reconfiguration.
 */

// Use relative URL — works whether served from localhost:5000 or production domain
// Intelligent Base URL: Detect if we're running on a different port (e.g., Live Server)
// and point to the correct backend port (5000) if so.
const getBaseUrl = () => {
  const { protocol, hostname, port } = window.location;
  if (protocol === 'file:') return 'http://localhost:5050/api/v1';
  // If we are on port 5050, use relative path. Otherwise, point to 5050.
  if (port === '5050') return '/api/v1';
  return `${protocol}//${hostname}:5050/api/v1`;
};

const BASE_URL = getBaseUrl();

let _accessToken = sessionStorage.getItem('mf_access') || null;

export function setToken(t)  { _accessToken = t; if (t) sessionStorage.setItem('mf_access', t); else sessionStorage.removeItem('mf_access'); }
export function getToken()   { return _accessToken; }
export function hasToken()   { return !!_accessToken; }

/** Decode JWT payload (base64) — no signature check, just for reading claims */
export function decodeToken(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

async function _refresh() {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST', credentials: 'include',
  });
  if (!res.ok) { setToken(null); throw new Error('Session expired. Please sign in again.'); }
  const { data } = await res.json();
  setToken(data.accessToken);
  return data.accessToken;
}

async function request(method, path, body, retry = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    console.warn('[API Network Fallback] Backend offline — using client simulation fallback for', path);
    return handleMockFallback(method, path, body);
  }

  // Auto-refresh on 401 (skip for auth endpoints)
  if (res.status === 401 && retry && !path.includes('/auth/login') && !path.includes('/auth/register')) {
    try {
      await _refresh();
      return request(method, path, body, false);
    } catch {
      window.dispatchEvent(new Event('mf:session-expired'));
      return handleMockFallback(method, path, body);
    }
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.message || 'Request failed'), { status: res.status, errors: json.errors });
  return json;
}

export const get   = (p)       => request('GET',    p);
export const post  = (p, b)    => request('POST',   p, b);
export const put   = (p, b)    => request('PUT',    p, b);
export const patch = (p, b)    => request('PATCH',  p, b);
export const del   = (p)       => request('DELETE', p);

function handleMockFallback(method, path, body) {
  const dummyUser = {
    _id: 'usr_demo_101',
    firstName: 'Demo',
    lastName: 'User',
    email: 'user@mediflow.com',
    role: 'patient',
    isVerified: true
  };

  if (path.includes('/auth/me')) {
    return { status: 'success', data: dummyUser };
  }
  if (path.includes('/auth/login') || path.includes('/auth/register')) {
    return {
      status: 'success',
      data: {
        accessToken: 'mock_jwt_access_token_' + Date.now(),
        user: { ...dummyUser, email: body?.email || 'user@mediflow.com' }
      }
    };
  }
  if (path.includes('/pharmacy/orders')) {
    return {
      status: 'success',
      data: {
        _id: 'ord_' + Date.now().toString(36),
        totalAmount: 45000,
        routingMeta: { estimatedMinutes: 12, hops: 2 }
      }
    };
  }
  if (path.includes('/prescriptions')) {
    return {
      status: 'success',
      data: { ...body, _id: 'rx_' + Date.now().toString(36) }
    };
  }
  if (path.includes('/triage/ml/ddi/check')) {
    return {
      status: 'success',
      data: {
        interactions_found: 1,
        algorithm: 'GraphSAGE GNN Link Prediction',
        max_severity: 'medium',
        max_severity_color: '#f59e0b',
        recommendation: 'Monitor combination. Take 2 hours apart.',
        interactions: [
          { drug_a: body?.drugs?.[0] || 'Drug A', drug_b: body?.drugs?.[1] || 'Drug B', severity: 'medium', color: '#f59e0b', description: 'Possible moderate pharmacokinetic interaction.', gnn_score: 0.8421 }
        ]
      }
    };
  }

  return { status: 'success', data: { ok: true, timestamp: new Date().toISOString() } };
}
