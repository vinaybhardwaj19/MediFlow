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
  if (protocol === 'file:') return 'http://localhost:5000/api/v1';
  // If we are on port 5000, use relative path. Otherwise, point to 5000.
  if (port === '5000') return '/api/v1';
  return `${protocol}//${hostname}:5000/api/v1`;
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
    console.error('[API Network Error]', networkErr);
    throw new Error('Network error — check your connection.');
  }

  // Auto-refresh on 401 (skip for auth endpoints)
  if (res.status === 401 && retry && !path.includes('/auth/login') && !path.includes('/auth/register')) {
    try {
      await _refresh();
      return request(method, path, body, false);
    } catch {
      window.dispatchEvent(new Event('mf:session-expired'));
      throw new Error('Session expired');
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
