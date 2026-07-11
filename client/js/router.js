/**
 * router.js — Hash-based SPA router.
 * Maps #hash → page <div> visibility toggle.
 * Guards protected pages that require authentication.
 */
import { getState } from './store.js';

const PAGES = ['home','dashboard','triage','pharmacy','consultation'];
const AUTH_REQUIRED = new Set(['dashboard','consultation']);

let _current = null;
const _hooks = {};       // page → onEnter callback (fires every visit)
const _initDone = {};   // page → true once one-time init has run

export function registerHook(page, fn) { _hooks[page] = fn; }

function showPage(name) {
  if (!PAGES.includes(name)) name = 'home';

  // Auth guard
  if (AUTH_REQUIRED.has(name) && !getState('user')) {
    window.dispatchEvent(new CustomEvent('mf:need-auth', { detail: name }));
    return;
  }

  PAGES.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    if (el) {
      const isTarget = p === name;
      el.classList.toggle('hidden', !isTarget);
      // Page enter animation
      if (isTarget && _current !== null && _current !== name) {
        el.classList.remove('page-enter');
        void el.offsetWidth; // force reflow
        el.classList.add('page-enter');
      }
    }
  });

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === name);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Fire the hook every time, not just on first visit
  _hooks[name]?.();
  _current = name;
}

export function navigate(page) {
  window.location.hash = page;
}

export function currentPage() { return _current; }

// Listen to hash changes
window.addEventListener('hashchange', () => {
  const page = window.location.hash.replace('#', '') || 'home';
  showPage(page);
});

// Initial load
export function initRouter() {
  const page = window.location.hash.replace('#', '') || 'home';
  showPage(page);
}
