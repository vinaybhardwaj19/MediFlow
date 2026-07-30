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

  // Handle demo tokens (non-JWT)
  if (!token.includes('.')) {
    const stored = sessionStorage.getItem('mf_demo_user');
    if (stored) {
      setState('user', JSON.parse(stored));
      return true;
    }
    return false;
  }

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

  // Role field toggle
  const roleSelect = document.getElementById('reg-role');
  const extraFields = document.getElementById('role-extra-fields');
  roleSelect?.addEventListener('change', (e) => {
    const role = e.target.value;
    const isPublic = ['patient', 'admin', 'worker'].includes(role);
    extraFields.classList.toggle('hidden', isPublic);
    document.getElementById('extra-doctor').classList.toggle('hidden', role !== 'doctor');
    document.getElementById('extra-pharmacist').classList.toggle('hidden', role !== 'pharmacist');
    document.getElementById('extra-rider').classList.toggle('hidden', role !== 'rider');

    // Highlight if helper role
    if (role === 'worker') {
      toastInfo('Frontline Worker', 'Worker accounts act as Helpers for uneducated patients.');
    }
  });

  // Quick Login Buttons
  document.querySelectorAll('.quick-login-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.email;
      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      if (emailInput) emailInput.value = email;
      if (passInput) passInput.value = 'Demo1234!';

      // Visual feedback
      const originalText = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span>';

      // Auto-submit after 300ms for a "Pro" automated feel
      setTimeout(() => {
        document.getElementById('login-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        btn.textContent = originalText;
      }, 400);
    });
  });

  // Login submit
  document.getElementById('login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl  = document.getElementById('login-error');
    const spinner = document.getElementById('login-spinner');
    const btn    = document.getElementById('login-submit');
    errEl.classList.add('hidden');
    spinner.classList.remove('hidden'); btn.disabled = true;

    const email = document.getElementById('login-email').value.trim() || 'patient@mediflow.com';
    const password = document.getElementById('login-password').value || 'Demo1234!';

    let user;
    try {
      user = await login(email, password);
    } catch (err) {
      toastError('Login Failed', err.message || 'Could not connect to authentication server.');
      spinner.classList.add('hidden'); btn.disabled = false;
      return;
    }

    closeModal();
    updateNavForUser(user);
    toastSuccess('Welcome back!', `Signed in as ${user.firstName}`);

    // Redirect to saved destination or dashboard
    const redirect = sessionStorage.getItem('mf_redirect');
    if (redirect) {
      sessionStorage.removeItem('mf_redirect');
      navigate(redirect);
    } else {
      navigate('dashboard');
    }
    spinner.classList.add('hidden'); btn.disabled = false;
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
      const role = document.getElementById('reg-role').value;
      const payload = {
        firstName: document.getElementById('reg-first').value.trim(),
        lastName : document.getElementById('reg-last').value.trim(),
        email    : document.getElementById('reg-email').value.trim(),
        password : document.getElementById('reg-password').value,
        role     : role,
      };

      // Add role-specific data to metadata if applicable
      if (role === 'doctor') {
        payload.licenseNumber = document.getElementById('reg-license').value;
        payload.specialization = document.getElementById('reg-spec').value;
      } else if (role === 'pharmacist') {
        payload.pharmacyId = document.getElementById('reg-pharm-id').value;
      } else if (role === 'rider') {
        payload.vehicleNumber = document.getElementById('reg-vehicle').value;
        payload.drivingLicense = document.getElementById('reg-dl').value;
      }

      await register(payload);
      toastSuccess('Account created!', 'Application submitted for review.');
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

  // Quick Access demo accounts (pre-seeded with seed.js)
  // Credentials: {Role}@gmail.com / Demo1234!
  document.querySelectorAll('.demo-login-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const role = btn.dataset.demoRole;
      const btnText = btn.textContent;
      btn.textContent = '...';
      try {
        // Capitalize first letter for email: patient -> Patient@gmail.com
        const emailRole = role.charAt(0).toUpperCase() + role.slice(1);
        const user = await login(`${emailRole}@gmail.com`, 'Demo1234!');
        toastSuccess('Demo Access', `Authenticated as ${role.toUpperCase()} — Welcome to MediFlow.`);

        // Redirect to saved destination or dashboard
        const redirect = sessionStorage.getItem('mf_redirect');
        setTimeout(() => {
          if (redirect) {
            sessionStorage.removeItem('mf_redirect');
            navigate(redirect);
          } else {
            navigate('dashboard');
          }
        }, 1000);
      } catch (err) {
        toastError('Login Failed', 'Demo credentials not seeded yet. Run: npm run seed');
      } finally {
        btn.textContent = btnText;
      }
    });
  });
}

export function updateNavForUser(user) {
  const authBtn   = document.getElementById('nav-auth-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');
  const patientLinks = document.querySelectorAll('.nav-link[data-page="triage"], .nav-link[data-page="pharmacy"], .nav-link[data-page="consultation"]');
  
  if (user) {
    authBtn?.classList.add('hidden');
    logoutBtn?.classList.remove('hidden');
    
    // Providers don't need patient shop/triage links in navbar
    const isPatient = user.role === 'patient';
    patientLinks.forEach(link => {
      link.classList.toggle('hidden', !isPatient);
    });
  } else {
    authBtn?.classList.remove('hidden');
    logoutBtn?.classList.add('hidden');
    
    // Show basic public features for logged-out guests
    patientLinks.forEach(link => {
      if (link.dataset.page === 'consultation') {
        link.classList.add('hidden');
      } else {
        link.classList.remove('hidden');
      }
    });
  }
}

