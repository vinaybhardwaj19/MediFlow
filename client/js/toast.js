/**
 * toast.js — Non-blocking notification system.
 */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function toast(title, msg = '', type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const icons     = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <div class="toast-icon">${icons[type] || '📢'}</div>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      ${msg ? `<div class="toast-msg">${escHtml(msg)}</div>` : ''}
    </div>
    <button class="toast-close" title="Dismiss" style="background:none;border:none;cursor:pointer;color:inherit;font-size:1rem;padding:0 4px;opacity:.6;line-height:1;">✕</button>`;
  const dismiss = () => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 300);
  };
  el.querySelector('.toast-close').addEventListener('click', dismiss);
  container.appendChild(el);
  setTimeout(dismiss, duration);
}

export const toastSuccess = (t, m) => toast(t, m, 'success');
export const toastError   = (t, m) => toast(t, m, 'error');
export const toastInfo    = (t, m) => toast(t, m, 'info');
export const toastWarning = (t, m) => toast(t, m, 'warning');
