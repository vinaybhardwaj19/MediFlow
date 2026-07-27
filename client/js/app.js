/**
 * app.js — Main application bootstrap.
 * Wires all modules: auth, router, vitals, drone, charts, QR, AI health,
 * appointments, voice nav, emergency SOS, medicine scanner, PDF reports.
 */
import { initRouter, registerHook, navigate } from './router.js';
import { initAuth, restoreSession, updateNavForUser } from './auth.js';
import { initTriage }       from './triage.js';
import { initPharmacy }     from './pharmacy.js';
import { initConsultation } from './consultation.js';
import * as api   from './api.js';
import { getState, setState } from './store.js';
import { toastError, toastSuccess, toastInfo } from './toast.js';
import {
  connectAmbientStream,
  startECGSparkline,
  startVitalSimulation,
  updateVitalsDisplay,
} from './ambient-monitor.js';
import { initDroneTracker } from './drone-tracker.js';
import { ParticleNetwork } from './particles.js';
import { initMediBot } from './medibot.js';
import { initBodyMap } from './bodymap.js';
import { initDashboardCharts, animateCounter } from './charts.js';
import { demoPrescriptionQR } from './qrcode.js';
import {
  HealthScoreEngine, drawHealthGauge, drawRiskRadar,
  initEmergencySOS, generateHealthReport,
  initVoiceNavigation, initMedicineScanner,
  initMLDashboard,
} from './health-ai.js';
import { initAppointmentBooking } from './appointments.js';
import {
  initPrescriptionPad, initDoctorRating,
  initMultilingualToggle, initOCRScanner,
} from './doctor-tools.js';

// Multi-Sensor RPM Imports
import { initLocationIntelligence, autoPromptGPS } from './location-intelligence.js';
import { initCompanion } from './companion.js';
import { initMarketplace } from './marketplace.js';
import { initLabs } from './labs.js';
import { initTimeline } from './timeline.js';
import { initRiderDashboard } from './rider-dashboard.js';
import { DeviceManager } from './device-manager.js';
import { initAdminPanel } from './admin.js';

// Global health score state
let _healthEngine = new HealthScoreEngine();
let _lastHealthScore = null;
let _lastVitals = {};

// ── PWA Cleanup (Hackathon Dev Mode) ──────────────────────────────────────────
async function cleanupServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      if (window.caches) {
        const names = await caches.keys();
        for (const name of names) await caches.delete(name);
      }
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();
    } catch (e) { console.warn('[SW] Cleanup failed', e); }
  }
}

// ── Particle system ───────────────────────────────────────────────────────────
let particles = null;
function initParticles() {
  if (particles) return;
  try {
    particles = new ParticleNetwork('hero-particles');
    particles.start();
  } catch (e) { console.warn('Particles failed', e); }
}

// ── Theme toggle ──────────────────────────────────────────────────────────────
function initThemeToggle() {
  const saved = localStorage.getItem('mf-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mf-theme', next);
  });
}

// ── Scroll reveal ─────────────────────────────────────────────────────────────
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ── Button ripple effect ──────────────────────────────────────────────────────
function initRippleEffect() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

// ── Hero stat counters ────────────────────────────────────────────────────────
function initHeroCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCounter('hero-stat-patients', 12847, 2500);
        animateCounter('hero-stat-doctors', 156, 2000);
        animateCounter('hero-stat-triage', 98, 1800, '', '%');
        animateCounter('hero-stat-response', 187, 2000, '<', 'ms');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });
  const bar = document.querySelector('.hero-stats-bar');
  if (bar) observer.observe(bar);
}

// ── Dashboard data loader ─────────────────────────────────────────────────────
async function loadDashboard() {
  const user = getState('user');
  if (!user) return;

  if (user.role !== 'patient' && user.role !== 'admin' && !user.isVerified) {
    renderOnboardingScreen(user);
    return;
  }

  const proGrid = document.getElementById('dash-pro-grid');
  if (proGrid) proGrid.style.display = 'grid';

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetEl = document.getElementById('dash-greeting');
  if (greetEl) greetEl.textContent = `${greet}, ${user.firstName}! ⚡`;

  const nameEl = document.getElementById('sidebar-name');
  if (nameEl) nameEl.textContent = `${user.firstName} ${user.lastName}`;

  const roleEl = document.getElementById('sidebar-role');
  if (roleEl) roleEl.textContent = user.role?.toUpperCase();

  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    const iconDiv = avatarEl.querySelector('div');
    if (iconDiv) {
      const defaultAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80';
      const roleImages = {
        patient: 'https://images.unsplash.com/photo-1511174511562-5f7f18b874f8?auto=format&fit=crop&w=120&q=80',
        doctor: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=120&q=80',
        pharmacist: 'https://images.unsplash.com/photo-1587854692152-cbe660dbbb88?auto=format&fit=crop&w=120&q=80',
        admin: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=120&q=80',
        rider: 'https://images.unsplash.com/photo-1558981403-c5f91cbba527?auto=format&fit=crop&w=120&q=80'
      };
      const imgUrl = (user.profileImage && (user.profileImage.startsWith('http://') || user.profileImage.startsWith('https://'))) 
        ? user.profileImage 
        : (roleImages[user.role] || defaultAvatar);

      iconDiv.innerHTML = `<img src="${imgUrl}" onerror="this.src='${defaultAvatar}'" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);">`;
    }
  }

  const role = user.role;
  const setSidebarDisplay = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? 'flex' : 'none';
  };

  const vitalsPanel = document.getElementById('dash-vitals');
  if (vitalsPanel) {
    const showVitals = ['patient', 'doctor', 'admin'].includes(role);
    vitalsPanel.style.display = showVitals ? 'block' : 'none';
  }

  const dashProBottom = document.querySelector('.dash-pro-bottom');
  if (dashProBottom) {
    if (['rider', 'pharmacist'].includes(role)) {
      dashProBottom.style.gridTemplateColumns = '1fr';
    } else {
      dashProBottom.style.gridTemplateColumns = '1fr 340px';
    }
  }

  const roleSidebars = {
    patient: [
      'side-overview', 'side-triage', 'side-vitals', 'side-appointments', 'side-marketplace',
      'side-prescriptions', 'side-orders', 'side-location', 'side-labs', 'side-timeline', 'side-companion', 'side-profile'
    ],
    doctor: [
      'side-overview', 'side-queue', 'side-triage', 'side-prescriptions', 'side-doc-comm',
      'side-availability', 'side-profile'
    ],
    pharmacist: [
      'side-overview', 'side-inventory', 'side-incoming-prescriptions', 'side-pharm-comm',
      'side-orders', 'side-profile'
    ],
    rider: [
      'side-overview', 'side-rider', 'side-rider-comm', 'side-profile'
    ],
    admin: [
      'side-overview', 'side-admin', 'side-identity', 'side-drone', 'side-profile'
    ]
  };

  const allowed = roleSidebars[role] || roleSidebars.patient;
  const allSidebars = [
    'side-overview', 'side-triage', 'side-vitals', 'side-companion', 'side-location', 'side-marketplace',
    'side-labs', 'side-timeline', 'side-rider', 'side-rider-comm', 'side-drone', 'side-queue',
    'side-incoming-prescriptions', 'side-inventory', 'side-pharm-comm', 'side-doc-comm', 'side-availability', 'side-admin',
    'side-appointments', 'side-prescriptions', 'side-orders', 'side-identity', 'side-profile'
  ];

  allSidebars.forEach(id => {
    setSidebarDisplay(id, allowed.includes(id));
  });

  const defaultSections = { patient: 'overview', doctor: 'queue', pharmacist: 'inventory', rider: 'rider', admin: 'admin' };
  const targetSection = defaultSections[role] || 'overview';
  const sidebarItem = document.querySelector(`.sidebar-item[data-section="${targetSection}"]`);
  if (sidebarItem && !sidebarItem.classList.contains('active')) {
    sidebarItem.click();
  }

  renderQuickActions(role);
  renderRolePowerWidgets(role);

  try {
    const [appts, prescRes, ordersRes] = await Promise.all([
      api.get('/appointments?limit=50').catch(() => ({ data: [] })),
      api.get('/prescriptions?limit=10').catch(() => ({ data: [] })),
      api.get('/pharmacy/orders?limit=10').catch(() => ({ data: [] })),
    ]);
    const appointments  = appts?.data || [];
    const prescriptions = prescRes?.data || [];
    const orders        = ordersRes?.data || [];

    const apptEl = document.getElementById('stat-appointments');
    if (apptEl) apptEl.textContent = appointments.length;
    const rxEl = document.getElementById('stat-prescriptions');
    if (rxEl) rxEl.textContent = prescriptions.length || '0';

    const statsContainer = document.getElementById('dash-stats');
    if (statsContainer) {
      if (role === 'rider') {
        const earnings = orders.filter(o => o.currentStatus === 'delivered').length * 150;
        statsContainer.innerHTML = `
          <div class="stat-card fade-up">
            <div class="stat-icon">💰</div>
            <div class="stat-value">₹${earnings}</div>
            <div class="stat-label">Today's Earnings</div>
          </div>
          <div class="stat-card fade-up" style="animation-delay:.1s">
            <div class="stat-icon">🏍️</div>
            <div class="stat-value">${orders.length}</div>
            <div class="stat-label">Total Runs</div>
          </div>
          <div class="stat-card fade-up" style="animation-delay:.2s">
            <div class="stat-icon">⭐</div>
            <div class="stat-value">4.9</div>
            <div class="stat-label">Rider Rating</div>
          </div>
        `;
      } else if (role === 'pharmacist') {
         statsContainer.innerHTML = `
          <div class="stat-card fade-up">
            <div class="stat-icon">📦</div>
            <div class="stat-value">${orders.filter(o => o.currentStatus === 'placed').length}</div>
            <div class="stat-label">New Orders</div>
          </div>
          <div class="stat-card fade-up" style="animation-delay:.1s">
            <div class="stat-icon">🚁</div>
            <div class="stat-value">3</div>
            <div class="stat-label">Active Drones</div>
          </div>
          <div class="stat-card fade-up" style="animation-delay:.2s">
            <div class="stat-icon">⚠️</div>
            <div class="stat-value">2</div>
            <div class="stat-label">Low Stock Alerts</div>
          </div>
        `;
      } else if (role === 'doctor') {
        const earnings = appointments.filter(a => a.status === 'completed').length * 800 * 0.80;
        statsContainer.innerHTML = `
          <div class="stat-card fade-up">
            <div class="stat-icon">👥</div>
            <div class="stat-value">${appointments.length}</div>
            <div class="stat-label">Total Patients</div>
          </div>
          <div class="stat-card fade-up" style="animation-delay:.1s">
            <div class="stat-icon">💰</div>
            <div class="stat-value">₹${earnings}</div>
            <div class="stat-label">Consultation Revenue</div>
          </div>
          <div class="stat-card fade-up" style="animation-delay:.2s">
            <div class="stat-icon">📋</div>
            <div class="stat-value">${prescriptions.length}</div>
            <div class="stat-label">Rx Issued</div>
          </div>
        `;
      }
    }

    renderAppointmentsList(appointments.length ? appointments : [
      { _id: 'mock1', type: 'video', status: 'completed', scheduledAt: new Date(Date.now() - 86400000), chiefComplaint: 'Follow-up on previous lab results', doctorId: { firstName: 'Vikram', lastName: 'Nair' } },
      { _id: 'mock2', type: 'video', status: 'confirmed', scheduledAt: new Date(Date.now() + 3600000), chiefComplaint: 'Persistent migraine and sensitivity to light', doctorId: { firstName: 'Sarah', lastName: 'Chen' } }
    ]);
    if (role === 'doctor') renderDoctorQueue(appointments);
    renderPrescriptionsList(prescriptions.length ? prescriptions : [
      { _id: 'rx1', medications: [{ name: 'Paracetamol' }, { name: 'Cetirizine' }], issuedAt: new Date(), status: 'active', doctorId: { firstName: 'Vikram', lastName: 'Nair' } }
    ]);
    renderOrdersList(orders);
  } catch (err) { console.warn('Dashboard data partial fail', err); }

  try {
    startECGSparkline('ecg-canvas');
    connectAmbientStream();
    initRealSensors();
  } catch (e) { console.warn('Vitals init fail', e); }

  try { initLocationIntelligence(); } catch (e) { console.warn('[App] Location init fail:', e); }
  try { initCompanion(); } catch (e) { console.warn('[App] Companion init fail:', e); }
  try { initMarketplace(); } catch (e) { console.warn('[App] Marketplace init fail:', e); }
  try { initLabs(); } catch (e) { console.warn('[App] Labs init fail:', e); }
  try { initTimeline(); } catch (e) { console.warn('[App] Timeline init fail:', e); }
  try { initRiderDashboard(); } catch (e) { console.warn('[App] Rider dashboard init fail:', e); }

  document.getElementById('btn-toggle-devices')?.addEventListener('click', () => {
    document.getElementById('device-manager-panel')?.classList.toggle('hidden');
  });

  const mvForm = document.getElementById('manual-vitals-form');
  mvForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      heartRate: parseInt(document.getElementById('mv-hr').value),
      spo2: parseInt(document.getElementById('mv-spo2').value),
      bloodPressure: `${document.getElementById('mv-sbp').value}/${document.getElementById('mv-dbp').value}`,
      temperature: parseFloat(document.getElementById('mv-temp').value),
      glucose: parseInt(document.getElementById('mv-gluc').value)
    };
    window.dispatchEvent(new CustomEvent('mf:vitals-update', { detail: data }));
    updateVitalsDisplay(data);
    document.getElementById('manual-vitals-modal')?.classList.add('hidden');
    toastSuccess('Vitals Logged', 'Manual measurements injected.');
  });

  window.addEventListener('mf:devices-update', (e) => {
    updateVitalsDisplay(e.detail);
    window.dispatchEvent(new CustomEvent('mf:vitals-update', { detail: e.detail }));
  });

  window.addEventListener('mf:vitals-update', (e) => {
    _lastVitals = { ...(_lastVitals || {}), ...e.detail };
    _lastHealthScore = _healthEngine.compute(_lastVitals);
    updateHealthScorePanel(_lastHealthScore);
  });

  let _stopSim = null;
  document.getElementById('sim-vitals-btn')?.addEventListener('click', () => {
    const statusLabel = document.getElementById('vitals-status-label');
    if (_stopSim) {
      _stopSim(); _stopSim = null;
      document.getElementById('sim-vitals-btn').textContent = '▶ Demo Simulation';
      if (statusLabel) statusLabel.textContent = 'Waiting for connection...';
    } else {
      _stopSim = startVitalSimulation();
      document.getElementById('sim-vitals-btn').textContent = '⏹ Stop Simulation';
      if (statusLabel) statusLabel.textContent = 'Demo Mode (Simulated)';
    }
  });

  initDroneTracker('drone-map-canvas');
  document.getElementById('xr-toggle-btn')?.addEventListener('click', () => {
    generateHealthReport(getState('user'), _lastVitals, _lastHealthScore);
  });
  initDashboardCharts();
  demoPrescriptionQR('qr-container');

  const dashContainer = document.querySelector('#page-dashboard .container');
  if (dashContainer) {
    const hsTpl = document.getElementById('health-score-template');
    if (hsTpl && !document.getElementById('dash-healthscore')) dashContainer.appendChild(hsTpl.content.cloneNode(true));
    if (role === 'patient') {
      const bookTpl = document.getElementById('booking-template');
      if (bookTpl && !document.getElementById('dash-booking')) dashContainer.appendChild(bookTpl.content.cloneNode(true));
    }
    if (role === 'doctor') {
      const docTpl = document.getElementById('doctor-tools-template');
      if (docTpl && !document.getElementById('dash-doctor-tools')) dashContainer.appendChild(docTpl.content.cloneNode(true));
    }
  }

  initHealthScorePanel();
  if (role === 'patient') initAppointmentBooking();
  if (role === 'doctor') {
    initPrescriptionPad();
    initDoctorRating();
    initOCRScanner();
    initMedicineScanner();
  }
  initEmergencySOS();
  initMLDashboard();
  document.getElementById('download-report-btn')?.addEventListener('click', () => {
    generateHealthReport(getState('user'), _lastVitals, _lastHealthScore);
  });
  initScrollReveal();
  renderRoleSpecificInsights(role);
}

function renderOnboardingScreen(user) {
  const container = document.querySelector('#page-dashboard .container');
  if (!container) return;
  const proGrid = document.getElementById('dash-pro-grid');
  if (proGrid) proGrid.style.display = 'none';
  const roleLabels = { doctor: 'Medical Practitioner', pharmacist: 'Licensed Pharmacist', rider: 'Delivery Partner' };
  const roleColors = { doctor: '#6366f1', pharmacist: '#10b981', rider: '#f59e0b' };

  container.innerHTML = `
    <div style="max-width: 600px; margin: 60px auto; text-align: center;" class="reveal">
      <div id="onboarding-icon" style="font-size: 4rem; margin-bottom: 20px;">🛡️</div>
      <h2 id="onboarding-title" style="font-weight: 800; font-size: 2rem; margin-bottom: 10px;">Verification Pending</h2>
      <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 30px;">
        Welcome to the MediFlow Provider Network, ${user.firstName}. To enable full access, please complete your professional identity verification.
      </p>
      <div id="kyc-step-container" class="card" style="text-align: left; padding: 25px; border-left: 5px solid ${roleColors[user.role]};">
        <h3 style="font-size: 1rem; margin-bottom: 15px;">Final Step: Identity Verification</h3>
        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 20px;">
          Please upload a digital copy of your <b>${user.role === 'doctor' ? 'Medical License' : user.role === 'pharmacist' ? 'Pharmacy Reg' : 'Driving License'}</b>.
        </p>
        <div id="upload-area" style="border: 2px dashed var(--border); padding: 30px; border-radius: 12px; text-align: center; cursor: pointer; background: rgba(99,102,241,0.02); transition: all 0.3s;"
             onclick="document.getElementById('kyc-file').click();">
          <div style="font-size: 2rem; margin-bottom: 10px;">📄</div>
          <div style="font-weight: 700; font-size: 0.9rem;">Click to upload document</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 5px;">PDF, PNG or JPG (Max 5MB)</div>
          <input type="file" id="kyc-file" style="display:none;">
        </div>
        <button class="btn btn-primary" id="btn-submit-kyc" style="width: 100%; margin-top: 20px;" disabled>Submit for Review</button>
      </div>
      <div id="onboarding-checklist" class="card hidden" style="text-align: left; padding: 25px; border-left: 5px solid ${roleColors[user.role]};">
        <h3 style="font-size: 1rem; margin-bottom: 15px;">Onboarding Checklist</h3>
        <ul style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px;">
          <li style="display: flex; align-items: center; gap: 10px; font-size: 0.9rem;">
            <span style="color: var(--success);">✅</span> Account Registration Created
          </li>
          <li style="display: flex; align-items: center; gap: 10px; font-size: 0.9rem;">
            <span style="color: var(--warning);">⏳</span> AI Document Verification (Active)
          </li>
          <li style="display: flex; align-items: center; gap: 10px; font-size: 0.9rem; opacity: 0.5;">
            <span>⭕</span> Dashboard Access Enabled
          </li>
        </ul>
      </div>
      <button class="btn btn-outline" style="margin-top: 25px;" id="onboarding-signout-btn">Sign Out & Exit</button>
    </div>
  `;
  const fileInput = document.getElementById('kyc-file');
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const uploadArea = document.getElementById('upload-area');
      const submitBtn = document.getElementById('btn-submit-kyc');
      if (uploadArea) uploadArea.innerHTML = `<div style="color:var(--success); font-weight:700;">✅ ${file.name}</div>`;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
  document.getElementById('btn-submit-kyc')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-submit-kyc');
    if (btn) { btn.innerHTML = '<span class="spinner"></span> Verifying...'; btn.disabled = true; }
    setTimeout(() => {
      document.getElementById('kyc-step-container')?.classList.add('hidden');
      document.getElementById('onboarding-checklist')?.classList.remove('hidden');
      toastSuccess('Success', 'Credentials uploaded.');
    }, 2000);
  });
  document.getElementById('onboarding-signout-btn')?.addEventListener('click', () => window.dispatchEvent(new Event('mf:signout')));
}

window.addEventListener('mf:signout', () => import('./auth.js').then(auth => auth.logout()));

function initHealthScorePanel() {
  const defaultVitals = { hr:72, spo2:98, sbp:118, temp:36.8, glucose:92, rr:15 };
  _lastVitals = defaultVitals;
  _lastHealthScore = _healthEngine.compute(defaultVitals);
  updateHealthScorePanel(_lastHealthScore);
}

function updateHealthScorePanel(hs) {
  if (!hs) return;
  drawHealthGauge('health-score-gauge', hs.score, hs.color);
  drawRiskRadar('health-radar-canvas', hs.components);
  const gradeEl = document.getElementById('health-grade-label');
  if (gradeEl) { gradeEl.textContent = hs.grade; gradeEl.style.color = hs.color; }
  const riskList = document.getElementById('health-risk-list');
  if (riskList) {
    riskList.innerHTML = hs.risks.length === 0 ? '<div style="color:var(--success);font-size:.85rem;">✅ No critical risks detected</div>' : hs.risks.map(r => `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);background:${r.level==='high'?'rgba(239,68,68,.1)':r.level==='medium'?'rgba(245,158,11,.1)':'rgba(16,185,129,.1)'};border-left:3px solid ${r.level==='high'?'#ef4444':r.level==='medium'?'#f59e0b':'#10b981'};margin-bottom:8px;">
        <span>${r.level==='high'?'🔴':'🟡'}</span>
        <div><div style="font-weight:600;font-size:.85rem;">${r.label}</div><div style="font-size:.78rem;color:var(--text-secondary);">${r.action}</div></div>
      </div>`).join('');
  }
  const recEl = document.getElementById('health-recommendations');
  if (recEl) recEl.innerHTML = hs.recommendations.map(r => `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);font-size:.85rem;">${r}</div>`).join('');
}

function renderAppointmentsList(appointments) {
  const el = document.getElementById('appointments-list');
  if (!el) return;
  if (!appointments.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">No appointments yet.</div>'; return; }
  el.innerHTML = appointments.map(a => `<div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:16px;padding:16px; flex-wrap:wrap;"><div style="font-size:1.8rem;">📅</div><div style="flex:1; min-width: 200px;"><div style="font-weight:600;">${a.type?.toUpperCase() || 'VIDEO'} consultation ${a.doctorId ? `· Dr. ${a.doctorId.firstName || ''} ${a.doctorId.lastName || ''}` : ''}</div><div style="font-size:.85rem;color:var(--text-secondary);">${new Date(a.scheduledAt).toLocaleString()}</div></div><div style="display:flex; gap:8px; align-items:center;"><span class="badge ${a.status === 'confirmed' ? 'badge-routine' : 'badge-primary'}">${a.status?.toUpperCase()}</span>${a.status==='confirmed' ? `<button class="btn btn-primary btn-sm" onclick="window.joinConsultationRoom('${a._id}')">Join Room</button>` : ''}</div></div>`).join('');
}

window.joinConsultationRoom = async (id) => {
  try {
    const res = await api.get(`/appointments/${id}/room-token`);
    const { roomId, token } = res.data;
    navigate('consultation');
    setTimeout(() => {
      document.getElementById('room-id-input').value = roomId;
      document.getElementById('room-token-input').value = token;
    }, 200);
  } catch (e) { toastError('Room Error', 'Could not fetch token.'); }
};

function renderDoctorQueue(appointments) {
  const el = document.getElementById('doctor-queue-list');
  if (!el) return;
  const queue = appointments.filter(a => a.status === 'confirmed');
  if (!queue.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Queue is empty.</div>'; return; }
  el.innerHTML = queue.map(a => `<div class="card fade-up" style="margin-bottom:12px;padding:20px;border-left:4px solid var(--primary);"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;"><div><div style="font-weight:700;font-size:1.1rem;">${a.patientId?.firstName || 'Patient'} ${a.patientId?.lastName || ''}</div><div style="font-size:.8rem;color:var(--text-secondary);">Reason: ${a.chiefComplaint || 'Checkup'}</div></div><button class="btn btn-primary btn-sm" onclick="window.joinConsultationRoom('${a._id}')">Start Consultation</button></div></div>`).join('');
}

async function initRealSensors() {
  try { const { initRealSensorEngine } = await import('./real-sensors.js'); initRealSensorEngine(); } catch (e) {}
}

function renderPrescriptionsList(prescriptions) {
  const el = document.getElementById('prescriptions-list');
  if (!el) return;
  if (!prescriptions.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">No prescriptions yet.</div>'; return; }
  el.innerHTML = prescriptions.map(p => `<div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:16px;padding:16px;border-left:4px solid var(--primary);"><div style="font-size:1.8rem;">📋</div><div style="flex:1;"><div style="font-weight:600;">${p.medications?.map(m=>m.name).join(', ') || 'Prescription'}</div><div style="font-size:.85rem;color:var(--text-secondary);">Dr. ${p.doctorId?.firstName||'Doctor'} &middot; ${new Date(p.issuedAt||p.createdAt).toLocaleDateString()}</div></div><span class="badge ${p.status==='active'?'badge-routine':'badge-primary'}">${p.status?.toUpperCase()||'ACTIVE'}</span></div>`).join('');
}

window.openLiveTracking = function(orderId, address) {
  window.location.hash = '#dashboard';
  const trackingSec = document.getElementById('dash-live-tracking');
  if (trackingSec) {
    trackingSec.classList.remove('hidden');
    trackingSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (orderId) {
      const idEl = document.getElementById('track-id');
      if (idEl) idEl.textContent = String(orderId).slice(-6).toUpperCase();
    }
    if (address) {
      const addrEl = document.getElementById('track-address');
      if (addrEl) addrEl.textContent = address;
    }
    const mapContainer = document.getElementById('delivery-map-container');
    if (mapContainer) mapContainer.style.display = 'block';
    
    // Import drone tracker dynamically if needed and start live map tracking
    import('./drone-tracker.js').then(module => {
      if (module.startRealDeliveryTracking) {
        module.startRealDeliveryTracking('delivery-map-container');
      }
    }).catch(() => {});
  }
};

function renderOrdersList(orders) {
  const el = document.getElementById('orders-list');
  if (!el) return;
  if (!orders.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">No orders yet.</div>'; return; }
  el.innerHTML = orders.map(o => `
    <div class="card" style="margin-bottom:12px;padding:16px;border-left:4px solid var(--primary);">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="font-size:1.8rem;">🛒</div>
        <div style="flex:1;min-width:200px;">
          <div style="font-weight:700;">Order #${o._id?.slice(-8).toUpperCase()}</div>
          <div style="font-size:.85rem;color:var(--text-secondary);">₹${((o.totalAmount||0)/100).toFixed(2)} &middot; ${new Date(o.createdAt).toLocaleDateString()}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge badge-primary">${(o.currentStatus||'placed').toUpperCase()}</span>
          <button class="btn btn-outline btn-sm" onclick="window.openLiveTracking('${o._id||'ORD-8492A'}', '${o.deliveryAddress?.street || 'Home'}')">📍 Track Live Map</button>
        </div>
      </div>
    </div>
  `).join('');
}

function initTriageWithBodyMap() {
  initTriage();
  initBodyMap((symptom, isSelected) => {
    const input = document.getElementById('symptom-input');
    if (isSelected && input) { input.value = symptom; input.dispatchEvent(new Event('input')); setTimeout(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })), 100); }
  });
}

function initDashboardSidebar() {
  const sectionIds = ['dash-overview', 'dash-vitals', 'dash-drone', 'dash-appointments', 'dash-prescriptions', 'dash-orders', 'dash-identity', 'side-companion', 'dash-location', 'dash-marketplace', 'dash-labs', 'dash-timeline', 'dash-rider', 'dash-queue', 'dash-inventory', 'dash-admin', 'dash-profile', 'dash-availability', 'dash-incoming-prescriptions'];
  document.querySelectorAll('.sidebar-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
      const sectionName = item.dataset.section;
      if (sectionName === 'triage') { navigate('triage'); return; }
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const target = document.getElementById('dash-' + sectionName);
      if (target) {
        sectionIds.forEach(id => document.getElementById(id)?.classList.add('hidden'));
        target.classList.remove('hidden');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (sectionName === 'admin') initAdminPanel();
        if (sectionName === 'profile') loadProfileSettings();
      }
    });
  });
}

function renderQuickActions(role) {
  const container = document.getElementById('dash-quick-actions');
  if (!container) return;
  const fallbackImg = 'https://images.unsplash.com/photo-1576091160550-2173bdd99625?auto=format&fit=crop&w=100&q=80';
  const actions = {
    patient: [
      { id: 'triage', label: 'AI Triage', sub: 'Instant Symptom Check', img: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&w=100&q=80', goto: 'triage' },
      { id: 'pharmacy', label: 'E-Pharmacy', sub: 'AI Prescription Fill', img: 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=100&q=80', goto: 'pharmacy' },
      { id: 'consultation', label: 'Smart Consult', sub: 'WebRTC HD Video', img: 'https://images.unsplash.com/photo-1576091160550-2173bdd99625?auto=format&fit=crop&w=100&q=80', goto: 'consultation' },
      { id: 'insights', label: 'Health AI Pulse', sub: 'Real-time Predictions', img: 'https://images.unsplash.com/photo-1551288049-bbbda536339a?auto=format&fit=crop&w=100&q=80', section: 'vitals' }
    ],
    doctor: [{ id: 'queue', label: 'Priority Queue', sub: 'Risk-Sorted Patients', img: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=100&q=80', section: 'queue' }],
    rider: [{ id: 'hub', label: 'Flash Delivery', sub: 'Nearby High Priority', img: 'https://images.unsplash.com/photo-1558981403-c5f91cbba527?auto=format&fit=crop&w=100&q=80', section: 'rider' }]
  };
  const roleActions = actions[role] || actions.patient;
  container.innerHTML = roleActions.map(action => `<button class="card" style="text-align:left;cursor:pointer;padding:18px; display:flex; gap:15px; align-items:center;" ${action.goto ? `data-goto="${action.goto}"` : ''} ${action.section ? `data-section="${action.section}"` : ''}><img src="${action.img}" onerror="this.src='${fallbackImg}'" style="width:50px; height:50px; border-radius:10px; object-fit:cover; border:1px solid var(--primary);"><div><div style="font-weight:700;margin-bottom:2px;">${action.label}</div><div style="font-size:.8rem;color:var(--text-secondary);">${action.sub}</div></div></button>`).join('');
  container.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.goto)));
  container.querySelectorAll('[data-section]').forEach(btn => btn.addEventListener('click', () => { const sidebarItem = document.querySelector(`.sidebar-item[data-section="${btn.dataset.section}"]`); if (sidebarItem) sidebarItem.click(); }));
}

function initQuickActions() {
  document.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.goto)));
  document.getElementById('hero-get-started')?.addEventListener('click', () => getState('user') ? navigate('dashboard') : window.dispatchEvent(new Event('mf:need-auth')));
  document.getElementById('hero-triage-btn')?.addEventListener('click', () => navigate('triage'));
}

function initHeroTypewriter() {
  const el = document.getElementById('hero-typewriter');
  if (!el) return;
  const phrases = ['For Modern Healthcare', 'Powered by Explainable AI', 'With Federated Privacy', 'Across Every Specialist', 'In Real Time, Always'];
  let idx = 0, charIdx = 0, deleting = false;
  function tick() {
    const phrase = phrases[idx];
    if (!deleting) {
      el.textContent = phrase.slice(0, ++charIdx);
      if (charIdx === phrase.length) { deleting = true; setTimeout(tick, 2200); return; }
    } else {
      el.textContent = phrase.slice(0, --charIdx);
      if (charIdx === 0) { deleting = false; idx = (idx + 1) % phrases.length; }
    }
    setTimeout(tick, deleting ? 35 : 70);
  }
  setTimeout(tick, 1000);
}

function initPageTransitions() {
  const style = document.createElement('style');
  style.textContent = `.page { animation: pageFadeIn .35s ease both; } @keyframes pageFadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`;
  document.head.appendChild(style);
}

function initRoleSwitcher() {
  const bar = document.getElementById('m3-role-bar');
  if (!bar) return;

  bar.querySelectorAll('.m3-role-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedRole = btn.dataset.role;
      bar.querySelectorAll('.m3-role-pill').forEach(b => {
        const isTarget = b.dataset.role === selectedRole;
        b.classList.toggle('btn-primary', isTarget);
        b.classList.toggle('btn-outline', !isTarget);
      });

      const roleUserMap = {
        patient:    { firstName: 'Alex', lastName: 'Morgan', role: 'patient', isVerified: true, email: 'patient@mediflow.com' },
        doctor:     { firstName: 'Dr. Sarah', lastName: 'Jenkins', role: 'doctor', isVerified: true, email: 'doctor@mediflow.com', specialty: 'Cardiology' },
        pharmacist: { firstName: 'Priya', lastName: 'Patel', role: 'pharmacist', isVerified: true, email: 'pharmacist@mediflow.com' },
        rider:      { firstName: 'David', lastName: 'Miller', role: 'rider', isVerified: true, email: 'rider@mediflow.com' },
        lab:        { firstName: 'Dr. Robert', lastName: 'Chen', role: 'lab', isVerified: true, email: 'lab@mediflow.com' },
        admin:      { firstName: 'System', lastName: 'Administrator', role: 'admin', isVerified: true, email: 'admin@mediflow.com' },
      };

      const user = roleUserMap[selectedRole] || roleUserMap.patient;
      setState('user', user);
      updateNavForUser(user);

      toastSuccess('Role Switched', `Activated ${selectedRole.toUpperCase()} Professional Interface`);

      if (selectedRole === 'doctor') {
        navigate('consultation');
      } else if (selectedRole === 'pharmacist') {
        navigate('pharmacy');
      } else if (selectedRole === 'triage') {
        navigate('triage');
      } else {
        navigate('dashboard');
      }
    });
  });
}

function initMobileBottomNav() {
  const mobNav = document.getElementById('mobile-bottom-nav');
  if (!mobNav) return;

  mobNav.querySelectorAll('.mob-nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const page = item.dataset.page;
      mobNav.querySelectorAll('.mob-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      navigate(page);
    });
  });
}

let _sosInterval = null;
function initEmergencySOSModal() {
  const sosBtn = document.getElementById('sos-btn');
  const sosModal = document.getElementById('sos-modal');
  const cancelBtn = document.getElementById('sos-cancel-btn');
  const countdownEl = document.getElementById('sos-countdown');

  if (!sosBtn || !sosModal) return;

  sosBtn.addEventListener('click', () => {
    sosModal.classList.remove('hidden');
    let seconds = 5;
    if (countdownEl) countdownEl.textContent = seconds;

    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);

    if (_sosInterval) clearInterval(_sosInterval);
    _sosInterval = setInterval(() => {
      seconds--;
      if (countdownEl) countdownEl.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(_sosInterval);
        sosModal.classList.add('hidden');
        toastSuccess('Emergency Dispatched', 'GPS coordinates & health record sent to nearest hospital unit.');
        navigate('triage');
      }
    }, 1000);
  });

  cancelBtn?.addEventListener('click', () => {
    if (_sosInterval) clearInterval(_sosInterval);
    sosModal.classList.add('hidden');
    toastInfo('SOS Cancelled', 'Emergency dispatch has been aborted.');
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  await cleanupServiceWorker();
  initThemeToggle();
  initPageTransitions();
  initRoleSwitcher();
  initMobileBottomNav();
  initEmergencySOSModal();
  initAuth();
  const restored = await restoreSession();
  if (restored) updateNavForUser(getState('user'));
  registerHook('dashboard', loadDashboard);
  registerHook('triage', initTriageWithBodyMap);
  registerHook('pharmacy', initPharmacy);
  registerHook('consultation', initConsultation);
  initDashboardSidebar();
  initQuickActions();
  initRouter();
  initParticles();
  initMediBot();
  initScrollReveal();
  initRippleEffect();
  initHeroCounters();
  initHeroTypewriter();
  initVoiceNavigation(navigate);
  initMedicineScanner();
  initEmergencySOS();
  initMultilingualToggle();
  initOCRScanner();
  initDoctorRating();
  autoPromptGPS();
}
bootstrap().catch(err => console.error('[MediFlow] Bootstrap error:', err));

function renderRoleSpecificInsights(role) {
  const container = document.getElementById('alert-timeline');
  if (!container) return;
  const insights = {
    patient: [{ title: 'AI Health Tip', text: 'Based on your recent heart rate trends, 15 mins of mindfulness could improve recovery.', img: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=60&q=80' }],
    rider: [{ title: 'Earning Surge', text: 'High demand in Indiranagar. +₹40 per delivery!', img: 'https://images.unsplash.com/photo-1558981403-c5f91cbba527?auto=format&fit=crop&w=60&q=80' }]
  };
  const roleInsights = insights[role] || insights.patient;
  container.innerHTML = roleInsights.map(ins => `<div class="card" style="padding:15px; margin-bottom:12px; border-left:4px solid var(--primary); background:rgba(99,102,241,0.03);"><div style="display:flex; gap:12px; align-items:center;"><img src="${ins.img}" style="width:40px; height:40px; border-radius:8px; object-fit:cover;"><div><div style="font-weight:700; font-size:0.9rem;">${ins.title}</div><div style="font-size:0.8rem; color:var(--text-secondary);">${ins.text}</div></div></div></div>`).join('');
}

function renderRolePowerWidgets(role) {
  const container = document.getElementById('dash-power-widgets');
  if (!container) return;
  const widgets = {
    patient: `<div class="card" style="padding:24px; border: 1px solid var(--primary);"><h3 style="margin-bottom:15px;">👤 Health Digital Twin</h3><div style="display:flex; gap:20px; align-items:center;"><div style="font-size:3rem;">🕺</div><div style="flex:1;"><div style="font-size:0.85rem; color:var(--text-secondary);">Your 3D biometric twin is up-to-date.</div></div></div></div>`
  };
  container.innerHTML = widgets[role] || widgets.patient;
}

function loadProfileSettings() {
  const container = document.getElementById('dash-profile');
  if (!container) return;
  container.innerHTML = `<div class="card" style="padding:30px;"><h2>⚙️ Account Settings</h2><button class="btn btn-primary" style="margin-top:30px;">Save Profile Changes</button></div>`;
}

window.runRadiologyAI = () => {
  const box = document.getElementById('ai-bounding-box');
  if (box) { box.style.display = 'block'; toastSuccess('Analysis Complete', 'Anomaly localized.'); }
};
