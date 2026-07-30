/**
 * @file family-hub.js
 * @description Frontend module for multi-generational health collaboration.
 */

import * as api from './api.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';

let _activeVitalsInterval = null;

export async function initFamilyHub() {
  const container = document.getElementById('dash-family');
  if (!container) return;

  renderFamilyShell(container);
  await loadFamilyData();
}

function renderFamilyShell(container) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <div>
        <h2 class="section-title" style="margin:0;">👨‍👩‍👧‍👦 Family Health Hub</h2>
        <p class="section-sub">Monitor your family circle's wellbeing and shared records.</p>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-create-family">+ Create Circle</button>
    </div>

    <div style="display:grid; grid-template-columns: 320px 1fr; gap:24px; align-items:flex-start;">
      <!-- Left: Family Circles List -->
      <div class="card" style="padding:20px;">
        <h3 style="font-size:0.9rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:15px;">My Circles</h3>
        <div id="family-circles-list" style="display:flex; flex-direction:column; gap:12px;">
           <div class="loading-center"><div class="spinner"></div></div>
        </div>
        <div id="invite-section" class="hidden" style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border);">
           <h4 style="font-size:0.8rem; font-weight:700; margin-bottom:10px;">Invite Member</h4>
           <div style="display:flex; gap:8px;">
              <input type="email" id="invite-email" placeholder="email@example.com" class="form-input" style="font-size:0.8rem; padding:8px;" />
              <button class="btn btn-primary btn-sm" id="btn-send-invite">Invite</button>
           </div>
        </div>
      </div>

      <!-- Right: Member Detail & Vitals Monitor -->
      <div id="family-member-view" class="card" style="padding:24px; min-height:400px; display:flex; flex-direction:column; justify-content:center; align-items:center; background:rgba(255,255,255,0.01);">
        <div style="text-align:center; color:var(--text-muted);">
          <div style="font-size:3rem; margin-bottom:15px;">🔍</div>
          <div>Select a family member to view their real-time health pulse.</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-create-family')?.addEventListener('click', async () => {
    const name = prompt('Enter a name for your Family Circle (e.g. "Home", "Parents"):');
    if (name) {
      try {
        await api.post('/family/create', { name });
        toastSuccess('Circle Created', `Family circle "${name}" is now active.`);
        loadFamilyData();
      } catch (err) { toastError('Creation Failed', err.message); }
    }
  });
}

async function loadFamilyData() {
  try {
    const res = await api.get('/family/circles');
    const circles = res.data || [];
    renderCircles(circles);
  } catch (err) {
    document.getElementById('family-circles-list').innerHTML = '<div style="font-size:0.8rem; color:var(--text-danger);">Failed to load family circles.</div>';
  }
}

function renderCircles(circles) {
  const list = document.getElementById('family-circles-list');
  if (!list) return;

  if (circles.length === 0) {
    list.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); text-align:center;">No circles found. Create one to get started.</div>';
    return;
  }

  list.innerHTML = circles.map(c => `
    <div class="family-circle-item" style="margin-bottom:15px;">
       <div style="font-weight:700; font-size:0.85rem; color:var(--primary); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          ${c.name}
          <span style="font-size:0.6rem; background:rgba(99,102,241,0.1); padding:2px 6px; border-radius:4px;">${c.members.length} members</span>
       </div>
       <div style="display:flex; flex-direction:column; gap:8px;">
          ${c.members.map(m => {
            const user = m.userId;
            const isActive = m.status === 'active';
            return `
              <div class="member-pill ${isActive ? 'active' : 'pending'}" data-user-id="${user._id}" data-family-id="${c._id}" style="display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:10px; background:rgba(255,255,255,0.03); border:1px solid var(--border); cursor:pointer;">
                <img src="${user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60&q=80'}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;" />
                <div style="flex:1;">
                   <div style="font-size:0.8rem; font-weight:600;">${user.firstName} ${user.lastName}</div>
                   <div style="font-size:0.6rem; text-transform:uppercase; color:${isActive ? 'var(--success)' : 'var(--warning)'}; font-weight:700;">${isActive ? m.role : 'INVITE PENDING'}</div>
                </div>
              </div>
            `;
          }).join('')}
       </div>
       <button class="btn btn-outline btn-sm btn-invite-trigger" data-id="${c._id}" style="width:100%; margin-top:8px; font-size:0.65rem; height:24px;">+ Invite Member</button>
    </div>
  `).join('');

  list.querySelectorAll('.member-pill.active').forEach(pill => {
    pill.addEventListener('click', () => {
      const userId = pill.dataset.userId;
      const familyId = pill.dataset.familyId;
      const circle = circles.find(c => c._id === familyId);
      const member = circle.members.find(m => m.userId._id === userId);
      showMemberMonitor(member.userId);
    });
  });

  list.querySelectorAll('.btn-invite-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('invite-section').classList.remove('hidden');
      document.getElementById('btn-send-invite').dataset.familyId = btn.dataset.id;
      document.getElementById('invite-email').focus();
    });
  });

  document.getElementById('btn-send-invite')?.addEventListener('click', async (e) => {
    const email = document.getElementById('invite-email').value.trim();
    const familyId = e.target.dataset.familyId;
    if (email) {
      try {
        await api.post(`/family/invite/${familyId}`, { email, role: 'dependent' });
        toastSuccess('Invite Sent', `Sent to ${email}. awaiting acceptance.`);
        document.getElementById('invite-section').classList.add('hidden');
        loadFamilyData();
      } catch (err) { toastError('Invite Failed', err.message); }
    }
  });
}

function showMemberMonitor(user) {
  const view = document.getElementById('family-member-view');
  if (!view) return;

  if (_activeVitalsInterval) clearInterval(_activeVitalsInterval);

  view.innerHTML = `
    <div style="width:100%; text-align:left;">
       <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px;">
          <img src="${user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80'}" style="width:64px; height:64px; border-radius:50%; border:2px solid var(--primary); padding:2px;" />
          <div>
             <h3 style="margin:0;">${user.firstName} ${user.lastName}</h3>
             <div style="font-size:0.8rem; color:var(--text-muted);">${user.email}</div>
          </div>
          <div style="margin-left:auto;">
             <span class="badge badge-routine" style="display:flex; align-items:center; gap:5px; animation:pulse 2s infinite;">
                <span style="width:6px; height:6px; background:#10b981; border-radius:50%;"></span>
                LIVE PULSE
             </span>
          </div>
       </div>

       <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:24px;">
          <div class="card" style="padding:20px; text-align:center; background:rgba(239,68,68,0.03); border:1px solid rgba(239,68,68,0.2);">
             <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; font-weight:700; margin-bottom:8px;">Heart Rate</div>
             <div style="font-size:2.5rem; font-weight:800; color:#ef4444;" id="fam-v-hr">--</div>
             <div style="font-size:0.8rem; color:var(--text-secondary);">BPM</div>
          </div>
          <div class="card" style="padding:20px; text-align:center; background:rgba(59,130,246,0.03); border:1px solid rgba(59,130,246,0.2);">
             <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; font-weight:700; margin-bottom:8px;">O₂ Saturation</div>
             <div style="font-size:2.5rem; font-weight:800; color:#3b82f6;" id="fam-v-spo2">--</div>
             <div style="font-size:0.8rem; color:var(--text-secondary);">% SpO₂</div>
          </div>
       </div>

       <div>
          <h4 style="font-size:0.9rem; margin-bottom:12px; font-weight:700;">Shared Records</h4>
          <div style="display:flex; gap:12px;">
             <button class="btn btn-outline btn-sm" style="flex:1;">📜 View Prescriptions</button>
             <button class="btn btn-outline btn-sm" style="flex:1;">🧪 Lab Reports</button>
          </div>
       </div>

       <!-- ASHA Helper Action -->
       <div style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border);">
          <button class="btn btn-primary" id="btn-assume-context" style="width:100%; height:48px; font-weight:800; background:linear-gradient(135deg, #10b981, #6366f1); border:none;">
            🚀 Manage Dashboard as ${user.firstName}
          </button>
          <p style="font-size:0.65rem; color:var(--text-muted); text-align:center; margin-top:8px;">
            ASHA Mode: This will filter the entire app to show only ${user.firstName}'s health data.
          </p>
       </div>
    </div>
  `;

  document.getElementById('btn-assume-context')?.addEventListener('click', () => {
    sessionStorage.setItem('mf_acting_for', user._id);
    toastSuccess('Context Switched', `Now managing MediFlow for ${user.firstName}.`);
    window.location.hash = '#dashboard';
    window.location.reload(); // Reload to re-fetch all data with header
  });

  // Start Vitals Polling
  const fetchVitals = async () => {
    try {
      const res = await api.get(`/family/vitals/${user._id}`);
      if (res.data) {
        document.getElementById('fam-v-hr').textContent = res.data.heartRate;
        document.getElementById('fam-v-spo2').textContent = res.data.spo2;
      }
    } catch (e) { console.warn('Family vitals polling failed'); }
  };

  fetchVitals();
  _activeVitalsInterval = setInterval(fetchVitals, 3000);
}
