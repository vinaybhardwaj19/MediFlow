/**
 * auth.js — ES Module for Authentication
 */

export function initAuth() {
  const authBtn = document.getElementById('nav-auth-btn');
  if (authBtn) {
    authBtn.addEventListener('click', () => {
      console.log('[Auth Module] Sign in modal requested.');
    });
  }
}

export async function loginUser(email, password) {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return await res.json();
}
