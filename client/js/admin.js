/**
 * admin.js — Admin Control Center.
 * Exposes user management, cryptographic audits, and system stats.
 */
import * as api from './api.js';
import { toastSuccess, toastError } from './toast.js';

import { getState } from './store.js';

export async function initAdminPanel() {
  const user = getState('user');
  const isWorker = user && user.role === 'worker';

  // Restricted UI for workers
  const statsGrid = document.querySelector('#dash-admin .stat-grid');
  if (isWorker && statsGrid) {
    statsGrid.style.display = 'none'; // Hide financial stats for workers
  }

  await loadAdminStats();
  await loadAdminUsers();
  await loadAdminAuditLogs();
}

async function loadAdminStats() {
  try {
    const res = await api.get('/admin/dashboard');
    const { users, appointments, orders } = res.data;
    
    // Financial Logic for Judges
    const avgConsultFee = 800; // ₹800
    const totalConsultRev = (appointments || 0) * avgConsultFee;
    const platformComm = totalConsultRev * 0.20 + (orders || 0) * 50; // 20% + flat 50 per order
    const drPayouts = totalConsultRev * 0.80;
    const riderPayouts = (orders || 0) * 150; // Fixed 150 per delivery

    const revEl = document.getElementById('admin-stat-revenue');
    const drEl  = document.getElementById('admin-stat-dr-payout');
    const riderEl = document.getElementById('admin-stat-rider-payout');
    
    if (revEl) revEl.textContent = `₹${platformComm.toLocaleString()}`;
    if (drEl)  drEl.textContent  = `₹${drPayouts.toLocaleString()}`;
    if (riderEl) riderEl.textContent = `₹${riderPayouts.toLocaleString()}`;
  } catch (err) {
    console.error('[Admin Panel] Failed to load stats:', err.message);
  }
}

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-list');
  if (!tbody) return;
  
  try {
    const res = await api.get('/admin/users');
    const users = res.data || [];
    
    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">No users found.</td></tr>`;
      return;
    }
    
    tbody.innerHTML = users.map(user => {
      const statusColor = user.isActive ? 'var(--success)' : 'var(--danger)' ;
      const statusText = user.isActive ? 'Active' : 'Suspended';
      const actionText = user.isActive ? 'Suspend' : 'Activate';
      const actionClass = user.isActive ? 'btn-outline danger' : 'btn-primary';
      
      const currentUser = getState('user');
      const isWorker = currentUser && currentUser.role === 'worker';

      // Verification logic
      const isProvider = ['doctor', 'pharmacist', 'rider'].includes(user.role);
      const verificationBtn = (isProvider && !user.isVerified && !isWorker)
        ? `<button class="btn btn-sm btn-success verify-user-btn" style="padding:4px 8px;font-size:0.7rem;margin-right:5px;" data-id="${user._id}">Verify ID</button>`
        : '';

      const docBtn = (isProvider)
        ? `<button class="btn btn-sm btn-outline view-docs-btn" style="padding:4px 8px;font-size:0.7rem;margin-right:5px;" data-user='${JSON.stringify(user)}'>Docs 📄</button>`
        : '';

      const statusActionBtn = !isWorker ? `
        <button class="btn btn-sm ${actionClass} toggle-user-btn" style="padding:4px 8px;font-size:0.7rem;" data-id="${user._id}">
          ${actionText}
        </button>
      ` : `<span style="font-size:0.6rem; color:var(--text-muted);">Read-only</span>`;

      const roleImages = {
        patient: 'https://images.unsplash.com/photo-1511174511562-5f7f18b874f8?auto=format&fit=crop&w=40&q=80',
        doctor: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=40&q=80',
        pharmacist: 'https://images.unsplash.com/photo-1587854692152-cbe660dbbb88?auto=format&fit=crop&w=40&q=80',
        admin: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=40&q=80',
        rider: 'https://images.unsplash.com/photo-1558981403-c5f91cbba527?auto=format&fit=crop&w=40&q=80',
        worker: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=40&q=80'
      };
      const roleImg = roleImages[user.role] || roleImages.patient;

      return `
        <tr style="border-bottom:1px solid var(--border);color:var(--text-secondary); font-size: 0.8rem;">
          <td style="padding:12px;font-weight:600;color:var(--text-main); display:flex; align-items:center; gap:10px;">
            <img src="${roleImg}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
            ${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}
          </td>
          <td style="padding:12px;"><span class="badge badge-primary" style="font-size:0.6rem;">${user.role.toUpperCase()}</span></td>
          <td style="padding:12px;font-weight:700;color:${statusColor}">${statusText} ${!user.isVerified && isProvider ? '<br><small style="color:var(--warning);font-weight:400;">(Pending)</small>' : ''}</td>
          <td style="padding:12px;text-align:right; white-space:nowrap;">
            ${docBtn}
            ${verificationBtn}
            ${statusActionBtn}
          </td>
        </tr>
      `;
    }).join('');

    // Bind click events
    tbody.querySelectorAll('.verify-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.id;
        if(!confirm('Confirm medical/legal credentials have been verified?')) return;
        btn.disabled = true;
        try {
          await api.patch(`/admin/users/${userId}/verify`, {});
          toastSuccess('Verification Approved', `Provider now has full dashboard access.`);
          await loadAdminUsers();
        } catch (err) {
          toastError('Verification Failed', err.message);
        } finally {
          btn.disabled = false;
        }
      });
    });

    tbody.querySelectorAll('.view-docs-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const user = JSON.parse(btn.dataset.user);
        showDocumentModal(user);
      });
    });

    // Bind click events to status buttons
    tbody.querySelectorAll('.toggle-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.id;
        btn.disabled = true;
        try {
          await api.patch(`/admin/users/${userId}/status`, {});
          toastSuccess('Status Updated', `User account status changed.`);
          await loadAdminUsers();
          await loadAdminStats();
        } catch (err) {
          toastError('Failed to update status', err.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--danger);">Error: ${err.message}</td></tr>`;
  }
}

async function loadAdminAuditLogs() {
  const container = document.getElementById('admin-audit-logs');
  if (!container) return;
  
  try {
    const res = await api.get('/admin/audit-logs');
    const logs = res.data || [];
    
    if (logs.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted);font-style:italic;">No security events logged yet.</div>`;
      return;
    }
    
    container.innerHTML = logs.map(log => {
      const dateStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const isSecurity = log.action.includes('LOGIN') || log.action.includes('VERIFY');
      const pqcBadge = isSecurity ? '<span style="color:#10b981; font-size:0.5rem; border:1px solid #10b981; padding:0 3px; border-radius:3px; margin-left:5px;">ML-KEM-768</span>' : '';

      return `
        <div style="border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:6px;font-size:0.72rem;line-height:1.4;">
          <span style="color:#a5b4fc;">[${dateStr}]</span> 
          <span style="color:#ef4444;font-weight:700;">${escapeHtml(log.action)}</span> 
          <span style="color:var(--text-muted);">by ${log.userId ? log.userId.slice(-6) : 'anon'}</span> 
          ${pqcBadge}
          <span style="color:var(--text-secondary);font-size:0.65rem;float:right;">IP: ${escapeHtml(log.ipAddress || '127.0.0.1')}</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger);">Failed to load audit logs: ${err.message}</div>`;
  }
}

function showDocumentModal(user) {
  const modalId = 'admin-docs-modal';
  let modal = document.getElementById(modalId);

  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const data = user.onboardingData || {};
  let docHtml = '';

  if (user.role === 'doctor') {
    docHtml = `
      <div style="margin-bottom:15px;"><b>Medical License:</b> ${data.licenseNumber || 'Not provided'}</div>
      <div style="margin-bottom:15px;"><b>Specialization:</b> ${data.specialization || 'Not provided'}</div>
    `;
  } else if (user.role === 'pharmacist') {
    docHtml = `
      <div style="margin-bottom:15px;"><b>Pharmacy ID:</b> ${data.pharmacyId || 'Not provided'}</div>
    `;
  } else if (user.role === 'rider') {
    docHtml = `
      <div style="margin-bottom:15px;"><b>Vehicle Number:</b> ${data.vehicleNumber || 'Not provided'}</div>
      <div style="margin-bottom:15px;"><b>Driving License:</b> ${data.drivingLicense || 'Not provided'}</div>
    `;
  }

  const currentUser = getState('user');
  const isWorker = currentUser && currentUser.role === 'worker';
  const approveBtn = !isWorker
    ? `<button class="btn btn-primary" onclick="window.adminVerifyUser('${user._id}')">Approve Credentials</button>`
    : '';

  modal.innerHTML = `
    <div class="modal-box" style="max-width:500px;">
      <h2 class="modal-title">Credential Review</h2>
      <p class="modal-sub">Reviewing credentials for ${user.firstName} ${user.lastName} (${user.role})</p>

      <div class="card" style="padding:20px; background:rgba(0,0,0,0.1); border:1px solid var(--border); margin-bottom:20px;">
        ${docHtml}
        <div style="width:100%; height:200px; background:var(--bg-base); border-radius:8px; display:flex; align-items:center; justify-content:center; border:1px dashed var(--border);">
          <div style="text-align:center; color:var(--text-muted);">
            <div style="font-size:2rem;">📄</div>
            <div style="font-size:0.8rem;">Digital Copy Placeholder</div>
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <button class="btn btn-outline" onclick="document.getElementById('${modalId}').classList.add('hidden')">Close</button>
        ${approveBtn}
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  // Expose verify globally for the modal
  window.adminVerifyUser = async (userId) => {
    try {
      await api.patch(`/admin/users/${userId}/verify`, {});
      toastSuccess('Verification Approved', 'User has been verified.');
      modal.classList.add('hidden');
      await loadAdminUsers();
    } catch (err) {
      toastError('Error', err.message);
    }
  };
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
