/**
 * auth.js — Login, register, logout, and session restore.
 */
import * as api  from './api.js';
import { setState, getState } from './store.js';
import { toastSuccess, toastError } from './toast.js';
import { navigate } from './router.js';

// ── Session restore from localStorage ────────────────────────────────────────
export async function restoreSession() {
  const token = api.getToken();
  if (!token) return false;
  const decoded = api.decodeToken(token);
  if (!decoded || decoded.exp * 1000 < Date.now()) {
    // Try refresh
    try {
      const res = await api.post('/auth/refresh', {});
      api.setToken(res.data.accessToken);
    } catch { api.setToken(null); return false; }
  }
  try {
    const res = await api.get('/auth/me');
    setState('user', res.data);
    return true;
  } catch { api.setToken(null); return false; }
}

// ── Login ─────────────────────────────────────────────────────────────────────
export async function login(email, password) {
  const res = await api.post('/auth/login', { email, password });
  api.setToken(res.data.accessToken);
  setState('user', res.data.user);
  return res.data.user;
}

// ── Register ──────────────────────────────────────────────────────────────────
export async function register(payload) {
  const res = await api.post('/auth/register', payload);
  return res.data;
}

// ── Logout ────────────────────────────────────────────────────────────────────
export async function logout() {
  try { await api.post('/auth/logout', {}); } catch {}
  api.setToken(null);
  setState('user', null);
  toastSuccess('Signed out', 'See you again soon.');
  navigate('home');
}

// ── UI wiring ─────────────────────────────────────────────────────────────────
export function initAuth() {
  const modal    = document.getElementById('auth-modal');
  const loginWrap = document.getElementById('login-form-wrap');
  const regWrap   = document.getElementById('register-form-wrap');

  const openModal  = () => modal.classList.remove('hidden');
  const closeModal = () => modal.classList.add('hidden');

  document.getElementById('nav-auth-btn')?.addEventListener('click', openModal);

  // Close on backdrop click
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // Toggle forms
  document.getElementById('switch-to-register')?.addEventListener('click', () => {
    loginWrap.classList.add('hidden'); regWrap.classList.remove('hidden');
  });
  document.getElementById('switch-to-login')?.addEventListener('click', () => {
    regWrap.classList.add('hidden'); loginWrap.classList.remove('hidden');
  });

  // Login submit
  document.getElementById('login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl  = document.getElementById('login-error');
    const spinner = document.getElementById('login-spinner');
    const btn    = document.getElementById('login-submit');
    errEl.classList.add('hidden');
    spinner.classList.remove('hidden'); btn.disabled = true;
    try {
      const user = await login(
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-password').value,
      );
      closeModal();
      updateNavForUser(user);
      toastSuccess('Welcome back!', `Signed in as ${user.firstName}`);
      navigate('dashboard');
    } catch (err) {
      errEl.classList.remove('hidden');
      errEl.querySelector('span').textContent = err.message;
    } finally { spinner.classList.add('hidden'); btn.disabled = false; }
  });

  // Register submit
  document.getElementById('register-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl  = document.getElementById('reg-error');
    const spinner = document.getElementById('reg-spinner');
    const btn    = document.getElementById('reg-submit');
    errEl.classList.add('hidden');
    spinner.classList.remove('hidden'); btn.disabled = true;
    try {
      await register({
        firstName: document.getElementById('reg-first').value.trim(),
        lastName : document.getElementById('reg-last').value.trim(),
        email    : document.getElementById('reg-email').value.trim(),
        password : document.getElementById('reg-password').value,
        role     : document.getElementById('reg-role').value,
      });
      toastSuccess('Account created!', 'Please sign in with your new account.');
      regWrap.classList.add('hidden'); loginWrap.classList.remove('hidden');
    } catch (err) {
      errEl.classList.remove('hidden');
      const msgs = err.errors?.length ? err.errors.map(e => e.message).join(', ') : err.message;
      errEl.querySelector('span').textContent = msgs;
    } finally { spinner.classList.add('hidden'); btn.disabled = false; }
  });

  // Logout
  document.getElementById('nav-logout-btn')?.addEventListener('click', logout);

  // Session expired event
  window.addEventListener('mf:session-expired', () => {
    setState('user', null);
    updateNavForUser(null);
    toastError('Session expired', 'Please sign in again.');
    openModal();
  });

  // Auth required redirect
  window.addEventListener('mf:need-auth', () => openModal());

  // Exhibition Quick Access
  document.querySelectorAll('.demo-login-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const role = btn.dataset.demoRole;
      const btnText = btn.textContent;
      btn.textContent = '...';
      try {
        // We'll use a special exhibition-mode login if the server supports it,
        // or just use pre-seeded credentials.
        const user = await login(`${role}@mediflow.com`, 'Demo1234!');
        toastSuccess('Demo Access', `Authenticated as ${role.toUpperCase()} — Welcome to MediFlow.`);
        // Add a small delay to show success toast
        setTimeout(() => {
          navigate('dashboard');
        }, 1000);
      } catch (err) {
        toastError('Demo Mode', 'Exhibition credentials not seeded yet.');
      } finally {
        btn.textContent = btnText;
      }
    });
  });
}

export function updateNavForUser(user) {
  const authBtn   = document.getElementById('nav-auth-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');
  if (user) {
    authBtn?.classList.add('hidden');
    logoutBtn?.classList.remove('hidden');
  } else {
    authBtn?.classList.remove('hidden');
    logoutBtn?.classList.add('hidden');
  }
}
