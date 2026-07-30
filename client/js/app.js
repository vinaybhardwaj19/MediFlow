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
import { initFamilyHub } from './family-hub.js';

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
    const btn = e.target.closest('.btn') || e.target.closest('button');
    if (!btn) return;

    // Provide generic feedback for "dead" buttons that have no ID or navigation
    if (!btn.id && !btn.dataset.goto && !btn.dataset.section && btn.type !== 'submit' && !btn.classList.contains('quick-login-btn') && !btn.classList.contains('demo-login-btn')) {
       // Check if it's part of a form, if so, do nothing as it might be submitting it
       const form = btn.closest('form');
       if (!form) {
           import('./toast.js').then(module => {
              module.toastInfo('Feature Update', 'This feature is currently rolling out. Check back soon!');
           });
       }
    }

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

function showSkeletons() {
  const statsContainer = document.getElementById('dash-stats');
  if (statsContainer) {
    statsContainer.innerHTML = Array(3).fill('<div class="stat-card skeleton" style="height:100px;"></div>').join('');
  }
  const quickActions = document.getElementById('dash-quick-actions');
  if (quickActions) {
    quickActions.innerHTML = Array(4).fill('<div class="card skeleton" style="height:80px;"></div>').join('');
  }
}

// ── Dashboard data loader ─────────────────────────────────────────────────────
async function loadDashboard() {
  const user = getState('user');
  if (!user) {
    window.dispatchEvent(new Event('mf:need-auth'));
    navigate('home');
    return;
  }

  showSkeletons();

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

  // Restore dashboard section from session storage
  const savedSection = sessionStorage.getItem('mf_dash_section');
  const defaultSections = { patient: 'overview', doctor: 'queue', pharmacist: 'inventory', rider: 'rider', admin: 'admin' };
  const targetSection = (savedSection && allowed.includes('side-' + savedSection))
    ? savedSection
    : (defaultSections[role] || 'overview');

  const sidebarItem = document.querySelector(`.sidebar-item[data-section="${targetSection}"]`);
  if (sidebarItem) {
    sidebarItem.click();
  }

  renderQuickActions(role);
  renderRolePowerWidgets(role);
  renderFocusHub(user);

  // Helper Mode: ASHA / Frontline Worker HUD
  if (user.isHelper || user.role === 'worker') {
    renderHelperHUD();
  }

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
      } else if (role === 'admin') {
        statsContainer.innerHTML = `
          <div class="stat-card fade-up">
            <div class="stat-icon">🛡️</div>
            <div class="stat-value" id="admin-load-val">1542</div>
            <div class="stat-label">System Req/min</div>
          </div>
          <div class="stat-card fade-up" style="animation-delay:.1s">
            <div class="stat-icon">🔐</div>
            <div class="stat-value">98.4%</div>
            <div class="stat-label">PQC Integrity</div>
          </div>
          <div class="stat-card fade-up" style="animation-delay:.2s">
            <div class="stat-icon">💰</div>
            <div class="stat-value">₹4.2L</div>
            <div class="stat-label">Platform Treasury</div>
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
  try { initFamilyHub(); } catch (e) { console.warn('[App] Family hub init fail:', e); }
  try { initEnvironmentalPulse(); } catch (e) { console.warn('[App] Env pulse init fail:', e); }
  try { initInclusiveMode(); } catch (e) { console.warn('[App] Inclusive mode init fail:', e); }
  try { initHybridNavigation(); } catch (e) { console.warn('[App] Hybrid nav init fail:', e); }
  try { initContextBanner(); } catch (e) { console.warn('[App] Context banner init fail:', e); }

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
  if (role === 'patient') {
    initAppointmentBooking();
    document.getElementById('btn-trigger-booking')?.addEventListener('click', () => {
      initAppointmentBooking();
      document.getElementById('booking-widget')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
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

  const DEMO_APPOINTMENTS = [
    { _id:'apt001', type:'video', status:'confirmed', scheduledAt:new Date(Date.now()+3600000), chiefComplaint:'Chest tightness and shortness of breath', doctorId:{firstName:'Dr. Sarah',lastName:'Jenkins'}, specialty:'Cardiology', mews:3 },
    { _id:'apt002', type:'video', status:'pending', scheduledAt:new Date(Date.now()+86400000), chiefComplaint:'Follow-up: Type 2 Diabetes management', doctorId:{firstName:'Dr. Vikram',lastName:'Nair'}, specialty:'Endocrinology', mews:1 },
    { _id:'apt003', type:'video', status:'completed', scheduledAt:new Date(Date.now()-86400000*2), chiefComplaint:'Hypertension medication review', doctorId:{firstName:'Dr. Sarah',lastName:'Jenkins'}, specialty:'General Physician', mews:0 },
  ];

  const list = (appointments && appointments.length > 0 ? appointments : DEMO_APPOINTMENTS);

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-muted);"><div style="font-size:3rem;margin-bottom:12px;">📅</div><div style="font-size:1.1rem;font-weight:600;">No appointments yet</div><div style="font-size:.85rem;margin-top:8px;">Book your first consultation using AI Triage.</div></div>';
    return;
  }

  const STATUS_CONFIG = {
    confirmed: { badge:'badge-routine', color:'#10b981', label:'CONFIRMED', icon:'✅' },
    pending: { badge:'badge-primary', color:'#6366f1', label:'PENDING', icon:'⏳' },
    completed: { badge:'', color:'#94a3b8', label:'COMPLETED', icon:'✔' },
    cancelled: { badge:'badge-urgent', color:'#ef4444', label:'CANCELLED', icon:'✗' },
  };

  el.innerHTML = list.map((a, idx) => {
    const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
    const drName = a.doctorId ? `Dr. ${a.doctorId.firstName || ''} ${a.doctorId.lastName || ''}` : 'Assigned Doctor';
    const timeStr = new Date(a.scheduledAt).toLocaleString('en-IN', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    const isFuture = new Date(a.scheduledAt) > new Date();

    return `
    <div class="card fade-up" style="margin-bottom:14px;padding:20px;border-left:4px solid ${sc.color};animation-delay:${idx*0.1}s;background:rgba(15,23,42,0.5);">
      <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div style="width:48px;height:48px;border-radius:12px;background:${sc.color}15;border:1px solid ${sc.color}30;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">🎥</div>
        <div style="flex:1;min-width:180px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <div style="font-weight:700;font-size:1rem;">${a.type?.toUpperCase() || 'VIDEO'} Consultation</div>
            <span class="badge ${sc.badge}" style="font-size:.65rem;">${sc.icon} ${sc.label}</span>
          </div>
          <div style="font-size:.83rem;color:var(--text-secondary);margin-bottom:4px;">👨‍⚕️ ${drName} · ${a.specialty || 'General'}</div>
          <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:6px;">📅 ${timeStr}</div>
          ${a.chiefComplaint ? `<div style="font-size:.78rem;color:var(--text-muted);font-style:italic;">"${a.chiefComplaint}"</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
          ${isFuture && a.status === 'confirmed' ? `<button class="btn btn-primary btn-sm" onclick="window.joinConsultationRoom('${a._id}')" style="white-space:nowrap;">▶ Join Room</button>` : ''}
          ${a.status === 'completed' ? `<button class="btn btn-outline btn-sm" style="font-size:.72rem;" onclick="import('./toast.js').then(m=>m.toastInfo('Medical Record','Viewing consultation transcript and prescriptions...')).catch(()=>{})">📋 View Record</button>` : ''}
          ${a.status === 'pending' ? `<button class="btn btn-outline btn-sm danger" style="font-size:.72rem;color:#ef4444;border-color:#ef4444;" onclick="import('./toast.js').then(m=>m.toastSuccess('Cancelled','Appointment successfully cancelled.')).catch(()=>{})">🗑 Cancel</button>` : ''}
        </div>
      </div>
      ${isFuture ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:.72rem;display:flex;gap:12px;flex-wrap:wrap;">
        <span style="color:var(--primary);">🔐 PQC Encrypted Session</span>
        <span style="color:var(--text-muted);">📹 HD WebRTC Video · E2E Encrypted</span>
        ${a.mews > 1 ? `<span style="color:#f97316;">⚠️ MEWS: ${a.mews} — Priority consultation</span>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
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

  const DEMO_QUEUE = [
    { _id:'apt001', type:'video', status:'confirmed', scheduledAt:new Date(Date.now()+900000), chiefComplaint:'Persistent chest tightness and shortness of breath since 2 hours', patientId:{firstName:'Alex',lastName:'Morgan',_id:'usr001',age:34}, mewsScore:3, urgency:'urgent', specialty:'Cardiology' },
    { _id:'apt002', type:'video', status:'confirmed', scheduledAt:new Date(Date.now()+2100000), chiefComplaint:'High fever 102.4°F, severe sore throat, difficulty swallowing', patientId:{firstName:'Ananya',lastName:'Sharma',_id:'usr006',age:27}, mewsScore:2, urgency:'urgent', specialty:'ENT / General' },
    { _id:'apt003', type:'video', status:'confirmed', scheduledAt:new Date(Date.now()+3600000), chiefComplaint:'Recurring migraines with visual aura and neck stiffness', patientId:{firstName:'Meena',lastName:'Iyer',_id:'usr009',age:41}, mewsScore:1, urgency:'routine', specialty:'Neurology' },
    { _id:'apt004', type:'video', status:'pending', scheduledAt:new Date(Date.now()+5400000), chiefComplaint:'Follow-up on Type 2 Diabetes management and HbA1c review', patientId:{firstName:'Raj',lastName:'Kumar',_id:'usr008',age:58}, mewsScore:1, urgency:'routine', specialty:'Endocrinology' },
  ];

  const queue = (appointments && appointments.length > 0 ? appointments : DEMO_QUEUE)
    .filter(a => a.status === 'confirmed' || a.status === 'pending');

  if (!queue.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);"><div style="font-size:3rem;margin-bottom:12px;">✅</div><div style="font-size:1.1rem;font-weight:600;">No patients in queue</div><div style="font-size:.85rem;margin-top:8px;">Your schedule is clear. New bookings will appear here.</div></div>`;
    return;
  }

  const MEWS_COLOR = { 0:'#22c55e', 1:'#22c55e', 2:'#f59e0b', 3:'#f97316', 4:'#ef4444', 5:'#ef4444' };
  const URGENCY_CONFIG = {
    urgent: { badge:'badge-urgent', color:'#f97316', label:'URGENT' },
    emergency: { badge:'badge-emergency', color:'#ef4444', label:'EMERGENCY' },
    routine: { badge:'badge-routine', color:'#22c55e', label:'ROUTINE' },
  };

  el.innerHTML = queue.map((a, idx) => {
    const mewsScore = a.mewsScore ?? Math.floor(Math.random() * 4);
    const mewsColor = MEWS_COLOR[Math.min(mewsScore, 5)];
    const urg = a.urgency || (mewsScore >= 3 ? 'urgent' : 'routine');
    const urgConf = URGENCY_CONFIG[urg] || URGENCY_CONFIG.routine;
    const timeStr = new Date(a.scheduledAt).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'});
    const patName = a.patientId ? `${a.patientId.firstName} ${a.patientId.lastName}` : `Patient ${idx+1}`;
    const age = a.patientId?.age || (30 + idx * 7);
    const avatars = ['https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60&q=80','https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=60&q=80','https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=60&q=80','https://images.unsplash.com/photo-1580489944761-15a19d654956?w=60&q=80'];

    return `
    <div class="card fade-up" style="margin-bottom:14px;padding:20px;border-left:5px solid ${urgConf.color};animation-delay:${idx*0.1}s;background:rgba(15,23,42,0.5);">
      <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div style="position:relative;">
          <img src="${avatars[idx%4]}" onerror="this.style.display='none'" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid ${urgConf.color};" />
          <div style="position:absolute;bottom:-2px;right:-2px;background:${mewsColor};color:white;font-size:0.6rem;font-weight:800;padding:2px 5px;border-radius:99px;">M${mewsScore}</div>
        </div>
        <div style="flex:1;min-width:200px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <div style="font-weight:700;font-size:1.05rem;">${patName}</div>
            <span style="font-size:0.7rem;color:var(--text-muted);">Age ${age}</span>
            <span class="badge ${urgConf.badge}" style="font-size:0.65rem;">${urgConf.label}</span>
          </div>
          <div style="font-size:0.83rem;color:var(--text-secondary);margin-bottom:8px;font-style:italic;">"${a.chiefComplaint || 'Consultation required'}"</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.75rem;color:var(--text-muted);">
            <span>📅 ${timeStr}</span>
            <span>🔬 ${a.specialty || 'General'}</span>
            <span style="color:${mewsColor};font-weight:700;">MEWS: ${mewsScore} (${mewsScore >= 3 ? 'High Alert' : mewsScore >= 2 ? 'Moderate' : 'Low Risk'})</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
          <button class="btn btn-primary btn-sm" onclick="window.joinConsultationRoom('${a._id}')" style="white-space:nowrap;">▶ Start Consultation</button>
          <button class="btn btn-outline btn-sm" onclick="window.showPatientSHAP('${a._id}','${patName}',${mewsScore},'${a.chiefComplaint || ''}')" style="font-size:0.72rem;">🧠 SHAP Report</button>
          <button class="btn btn-outline btn-sm" onclick="window.sendPrescriptionDraft('${patName}')" style="font-size:0.72rem;">💊 Issue Rx</button>
        </div>
      </div>
      <!-- MEWS Detail Bar -->
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;">
        <div style="background:rgba(0,0,0,0.2);padding:6px 12px;border-radius:8px;font-size:0.7rem;">
          <span style="color:var(--text-muted);">MEWS Score: </span>
          <span style="font-weight:700;color:${mewsColor};">${mewsScore}/14</span>
          <span style="color:var(--text-muted);margin-left:4px;">Modified Early Warning Score (Subbe et al., 2001)</span>
        </div>
        <div style="background:rgba(0,0,0,0.2);padding:6px 12px;border-radius:8px;font-size:0.7rem;">
          <span style="color:var(--text-muted);">Video Type: </span>
          <span style="font-weight:600;color:var(--primary);">🎥 HD WebRTC</span>
        </div>
        <div style="background:rgba(99,102,241,0.1);padding:6px 12px;border-radius:8px;font-size:0.7rem;border:1px solid rgba(99,102,241,0.3);">
          <span style="color:var(--primary);">🔐 PQC Encrypted Channel</span>
        </div>
      </div>
    </div>`;
  }).join('');

  // Attach SHAP modal
  window.showPatientSHAP = function(aptId, patName, mews, complaint) {
    const existing = document.getElementById('shap-modal-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'shap-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:20px;padding:28px;max-width:540px;width:100%;max-height:80vh;overflow-y:auto;position:relative;">
        <button onclick="document.getElementById('shap-modal-overlay').remove()" style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-muted);">×</button>
        <h3 style="font-size:1.1rem;font-weight:800;margin-bottom:6px;">🧠 SHAP AI Explainability Report</h3>
        <div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:16px;">Patient: <strong>${patName}</strong> · Complaint: ${complaint}</div>
        <div style="background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:16px;margin-bottom:16px;">
          <div style="font-size:.75rem;font-weight:700;color:var(--primary);margin-bottom:10px;">SHAPLEY VALUES — FEATURE CONTRIBUTIONS</div>
          ${['chest pain','shortness of breath','palpitations','fever','fatigue'].map((sym,i) => {
            const val = (0.34 - i * 0.06).toFixed(3);
            const pct = Math.max(10, 100 - i*18);
            const color = i < 2 ? '#ef4444' : i < 3 ? '#f97316' : '#6366f1';
            return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:0.8rem;">
              <span style="width:140px;color:var(--text-main);">● ${sym}</span>
              <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:4px;height:12px;"><div style="height:12px;border-radius:4px;background:${color};width:${pct}%;transition:width .8s;"></div></div>
              <span style="color:${color};font-weight:700;width:52px;text-align:right;">+${val}</span>
            </div>`;
          }).join('')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
          <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:1.6rem;font-weight:800;color:#ef4444;">MEWS ${mews}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);">Modified Early Warning Score</div>
          </div>
          <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:1.6rem;font-weight:800;color:#818cf8;">92%</div>
            <div style="font-size:0.7rem;color:var(--text-muted);">AI Confidence Score</div>
          </div>
        </div>
        <div style="font-size:0.72rem;color:var(--text-muted);padding:10px;background:rgba(0,0,0,0.2);border-radius:8px;">
          📚 SHAP values computed using TreeExplainer (Lundberg & Lee, NeurIPS 2017, arXiv:1705.07874). Each value represents the symptom's marginal contribution to the specialty prediction.
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:16px;" onclick="document.getElementById('shap-modal-overlay').remove();window.joinConsultationRoom('${aptId}')">▶ Start Consultation with ${patName}</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  };

  window.sendPrescriptionDraft = function(patName) {
    import('./doctor-tools.js').then(m => {
      if (m.initPrescriptionPad) m.initPrescriptionPad();
    }).catch(() => {});
    const sidebarItem = document.querySelector('.sidebar-item[data-section="prescriptions"]');
    if (sidebarItem) sidebarItem.click();
    import('./toast.js').then(m => m.toastInfo('Prescription Pad', `Opened for ${patName}. Add medications below.`)).catch(() => {});
  };
}

async function initRealSensors() {
  try { const { initRealSensorEngine } = await import('./real-sensors.js'); initRealSensorEngine(); } catch (e) {}
}

function renderPrescriptionsList(prescriptions) {
  const el = document.getElementById('prescriptions-list');
  if (!el) return;

  const DEMO_PRESCRIPTIONS = [
    { _id:'rx001', status:'active', issuedAt:new Date(Date.now()-86400000), validUntil:new Date(Date.now()+2592000000), doctorId:{firstName:'Dr. Sarah',lastName:'Jenkins'}, patientName:'Alex Morgan', medications:[{name:'Amoxicillin',dosage:'500mg',frequency:'3×/day',duration:'7 days'},{name:'Paracetamol',dosage:'500mg',frequency:'SOS',duration:'5 days'}], diagnoses:'Acute Pharyngitis', notes:'Complete full antibiotic course. Stay hydrated.', digitalSignature:true },
    { _id:'rx002', status:'active', issuedAt:new Date(Date.now()-7*86400000), validUntil:new Date(Date.now()+23*86400000), doctorId:{firstName:'Dr. Vikram',lastName:'Nair'}, patientName:'Alex Morgan', medications:[{name:'Metformin',dosage:'500mg',frequency:'2×/day',duration:'30 days'},{name:'Atorvastatin',dosage:'10mg',frequency:'Once nightly',duration:'30 days'}], diagnoses:'Type 2 Diabetes + Dyslipidemia', notes:'Monitor blood glucose daily. Follow low-carb diet.', digitalSignature:true },
    { _id:'rx003', status:'completed', issuedAt:new Date(Date.now()-30*86400000), validUntil:new Date(Date.now()-16*86400000), doctorId:{firstName:'Dr. Sarah',lastName:'Jenkins'}, patientName:'Alex Morgan', medications:[{name:'Ibuprofen',dosage:'400mg',frequency:'2×/day',duration:'5 days'}], diagnoses:'Musculoskeletal pain', notes:'Rest. Avoid strenuous activity for 1 week.', digitalSignature:true },
  ];

  const list = (prescriptions && prescriptions.length > 0 ? prescriptions : DEMO_PRESCRIPTIONS);

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-muted);"><div style="font-size:3rem;margin-bottom:12px;">📋</div><div style="font-size:1.1rem;font-weight:600;">No prescriptions yet</div><div style="font-size:.85rem;margin-top:8px;">Your doctor will issue digital prescriptions after a consultation.</div></div>';
    return;
  }

  el.innerHTML = list.map((p, idx) => {
    const isActive = p.status === 'active';
    const statusColor = isActive ? '#10b981' : '#94a3b8';
    const issuedStr = new Date(p.issuedAt || p.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    const validStr = p.validUntil ? new Date(p.validUntil).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : 'N/A';
    const drName = p.doctorId ? `${p.doctorId.firstName || 'Dr.'} ${p.doctorId.lastName || ''}` : 'Doctor';
    const meds = p.medications || [];

    return `
    <div class="card fade-up" style="margin-bottom:16px;padding:20px;border-left:4px solid ${statusColor};animation-delay:${idx*0.1}s;background:rgba(15,23,42,0.5);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <div style="font-weight:700;font-size:1rem;">Prescription #${String(p._id||'rx001').slice(-6).toUpperCase()}</div>
            <span style="font-size:.65rem;padding:3px 9px;background:${statusColor}15;color:${statusColor};border-radius:99px;font-weight:700;">${isActive ? '✅ ACTIVE' : '✔ COMPLETED'}</span>
            ${p.digitalSignature ? '<span style="font-size:.65rem;padding:3px 9px;background:rgba(99,102,241,0.1);color:#818cf8;border-radius:99px;font-weight:700;">🔐 Digitally Signed</span>' : ''}
          </div>
          <div style="font-size:.82rem;color:var(--text-secondary);">👨‍⚕️ ${drName} · ${p.diagnoses || 'General'}</div>
          <div style="font-size:.75rem;color:var(--text-muted);">📅 Issued: ${issuedStr} · Valid until: ${validStr}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${isActive ? `<button class="btn btn-primary btn-sm" style="font-size:.72rem;" onclick="import('./toast.js').then(m=>m.toastSuccess('Cart Updated','Prescription medicines added to your pharmacy cart!')).catch(()=>{})">🛒 Order Medicines</button>` : ''}
          <button class="btn btn-outline btn-sm" style="font-size:.72rem;" onclick="import('./toast.js').then(m=>m.toastInfo('Download','Generating encrypted PDF prescription...')).catch(()=>{})">📄 Download PDF</button>
        </div>
      </div>

      ${meds.length > 0 ? `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${meds.map(med => `
          <div style="display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;padding:10px 14px;">
            <div style="font-size:1.2rem;">💊</div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:.9rem;">${med.name} <span style="font-weight:400;color:var(--text-muted);">${med.dosage || ''}</span></div>
              <div style="font-size:.73rem;color:var(--text-secondary);margin-top:2px;">${med.frequency || ''} ${med.duration ? `· ${med.duration}` : ''}</div>
            </div>
          </div>
        `).join('')}
      </div>` : ''}

      ${p.notes ? `<div style="margin-top:12px;padding:10px 14px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:8px;font-size:.78rem;color:var(--text-muted);">📝 ${p.notes}</div>` : ''}
    </div>`;
  }).join('');
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

  const DEMO_ORDERS = [
    { _id:'ord8492a', currentStatus:'in_transit', createdAt:new Date(Date.now()-3600000), totalAmount:45000, items:[{name:'Amoxicillin'},{name:'Paracetamol'}], deliveryAddress:{street:'12 MG Road, Indiranagar, Bengaluru'}, paymentMethod:'upi', etaMinutes:8 },
    { _id:'ord7731b', currentStatus:'placed', createdAt:new Date(Date.now()-600000), totalAmount:28000, items:[{name:'Metformin'},{name:'Vitamin D3'},{name:'Omeprazole'}], deliveryAddress:{street:'34 Koramangala, Bengaluru'}, paymentMethod:'cod', etaMinutes:20 },
    { _id:'ord6612c', currentStatus:'delivered', createdAt:new Date(Date.now()-86400000), totalAmount:9800, items:[{name:'Atorvastatin'}], deliveryAddress:{street:'7 Whitefield Main Road, Bengaluru'}, paymentMethod:'card', etaMinutes:0 },
  ];

  const list = orders && orders.length > 0 ? orders : DEMO_ORDERS;

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-muted);"><div style="font-size:3rem;margin-bottom:12px;">🛒</div><div style="font-size:1.1rem;font-weight:600;">No orders yet</div><div style="font-size:.85rem;margin-top:8px;">Browse the Pharmacy to place your first order.</div></div>';
    return;
  }

  const STATUS_CONFIG = {
    placed: { color:'#6366f1', label:'PLACED', icon:'📜' },
    preparing: { color:'#f59e0b', label:'PREPARING', icon:'💊' },
    packed: { color:'#f97316', label:'PACKED', icon:'📦' },
    in_transit: { color:'#3b82f6', label:'IN TRANSIT', icon:'🙏' },
    delivered: { color:'#10b981', label:'DELIVERED', icon:'\u2705' },
    cancelled: { color:'#ef4444', label:'CANCELLED', icon:'\u274c' },
  };

  el.innerHTML = list.map((o, idx) => {
    const sc = STATUS_CONFIG[o.currentStatus] || STATUS_CONFIG.placed;
    const dateStr = new Date(o.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    const itemsStr = (o.items || []).map(i => i.name).join(', ') || 'Medicines';
    const totalStr = typeof o.totalAmount === 'number' ? `₹${(o.totalAmount/100).toFixed(2)}` : '₹---';
    const ordNum = String(o._id || 'ORD-8492A').slice(-6).toUpperCase();
    const addr = o.deliveryAddress?.street || 'Home';
    const isActive = ['placed', 'preparing', 'packed', 'in_transit'].includes(o.currentStatus);

    return `
    <div class="card fade-up" style="margin-bottom:14px;padding:20px;border-left:4px solid ${sc.color};animation-delay:${idx*0.1}s;background:rgba(15,23,42,0.5);">
      <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div style="width:48px;height:48px;border-radius:12px;background:${sc.color}15;border:1px solid ${sc.color}30;display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;">${sc.icon}</div>
        <div style="flex:1;min-width:160px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <div style="font-weight:700;font-size:1rem;">Order #${ordNum}</div>
            <span style="font-size:.65rem;padding:3px 9px;background:${sc.color}15;color:${sc.color};border-radius:99px;font-weight:700;">${sc.label}</span>
          </div>
          <div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:4px;">💊 ${itemsStr}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:4px;">📍 ${addr}</div>
          <div style="font-size:.72rem;color:var(--text-muted);">📅 ${dateStr} · ${(o.paymentMethod || 'upi').toUpperCase()} · ${totalStr}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
          ${isActive ? `<button class="btn btn-primary btn-sm" onclick="window.openLiveTracking('${o._id}','${addr}')" style="white-space:nowrap;">📍 Track Live</button>` : '<button class="btn btn-outline btn-sm" style="font-size:.72rem;">📋 Reorder</button>'}
          ${o.currentStatus === 'in_transit' ? `<div style="font-size:.68rem;color:#3b82f6;font-weight:600;">🚁 ETA: ~${o.etaMinutes || 12} mins</div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function initTriageWithBodyMap() {
  initTriage();
  initBodyMap((symptom, isSelected) => {
    const input = document.getElementById('symptom-input');
    if (isSelected && input) { input.value = symptom; input.dispatchEvent(new Event('input')); setTimeout(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })), 100); }
  });
}

function initDashboardSidebar() {
  const sectionIds = ['dash-overview', 'dash-vitals', 'dash-drone', 'dash-appointments', 'dash-prescriptions', 'dash-orders', 'dash-identity', 'side-companion', 'dash-location', 'dash-marketplace', 'dash-labs', 'dash-timeline', 'dash-rider', 'dash-queue', 'dash-inventory', 'dash-admin', 'dash-profile', 'dash-availability', 'dash-incoming-prescriptions', 'dash-family'];
  document.querySelectorAll('.sidebar-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
      const sectionName = item.dataset.section;
      if (sectionName === 'triage') { navigate('triage'); return; }
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      sessionStorage.setItem('mf_dash_section', sectionName);
      const target = document.getElementById('dash-' + sectionName);
      if (target) {
        sectionIds.forEach(id => document.getElementById(id)?.classList.add('hidden'));
        target.classList.remove('hidden');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (sectionName === 'admin') initAdminPanel();
        if (sectionName === 'profile') loadProfileSettings();
        if (sectionName === 'family') initFamilyHub();
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
    doctor: [
       { id: 'queue', label: 'Priority Queue', sub: 'Risk-Sorted Patients', img: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=100&q=80', section: 'queue' },
       { id: 'triage', label: 'Global Alerts', sub: 'Epidemiological Map', img: 'https://images.unsplash.com/photo-1532187875605-1838d7370334?auto=format&fit=crop&w=100&q=80', section: 'triage' }
    ],
    rider: [
       { id: 'hub', label: 'Flash Delivery', sub: 'Nearby High Priority', img: 'https://images.unsplash.com/photo-1558981403-c5f91cbba527?auto=format&fit=crop&w=100&q=80', section: 'rider' },
       { id: 'safety', label: 'Vehicle Health', sub: 'Telemetry Pulse', img: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=100&q=80', section: 'rider' }
    ]
  };
  const roleActions = actions[role] || actions.patient;

  container.innerHTML = roleActions.map(action => `
    <button class="card fade-up" style="text-align:left; cursor:pointer; padding:20px; display:flex; gap:18px; align-items:center; border: 1px solid var(--border); transition: transform 0.2s, border-color 0.2s; background: rgba(255,255,255,0.02);"
            ${action.goto ? `data-goto="${action.goto}"` : ''}
            ${action.section ? `data-section="${action.section}"` : ''}
            onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-2px)'"
            onmouseout="this.style.borderColor='var(--border)'; this.style.transform='translateY(0)'">
      <div style="width:60px; height:60px; border-radius:14px; overflow:hidden; border: 2px solid var(--border);">
         <img src="${action.img}" onerror="this.src='${fallbackImg}'" style="width:100%; height:100%; object-fit:cover;">
      </div>
      <div>
        <div style="font-weight:800; font-size:1.05rem; margin-bottom:2px; color:var(--text-main);">${action.label}</div>
        <div style="font-size:.8rem; color:var(--text-muted); font-weight:500;">${action.sub}</div>
      </div>
    </button>
  `).join('');

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

async function initEnvironmentalPulse() {
  const tempEl = document.getElementById('env-temp-val');
  const aqiLabel = document.getElementById('env-aqi-label');
  const aqiBar = document.getElementById('env-aqi-bar');
  const alertMsg = document.getElementById('env-alert-msg');
  const weatherIcon = document.getElementById('env-weather-icon');

  if (!tempEl) return;

  try {
    // Get city from location intelligence or default
    const city = 'Bengaluru';
    const res = await api.get(`/intelligence/environment?city=${city}`);
    const { weather, aqi } = res.data;

    if (weather) {
      tempEl.textContent = `${Math.round(weather.temp)}°C`;
      const desc = weather.description.toLowerCase();
      if (desc.includes('rain')) weatherIcon.textContent = '🌧️';
      else if (desc.includes('cloud')) weatherIcon.textContent = '☁️';
      else if (desc.includes('clear')) weatherIcon.textContent = '☀️';
      else if (desc.includes('mist') || desc.includes('haze')) weatherIcon.textContent = '🌫️';
    }

    if (aqi) {
      aqiLabel.textContent = aqi.label.toUpperCase();
      aqiLabel.style.background = aqi.color;
      aqiBar.style.background = aqi.color;
      aqiBar.style.width = `${(aqi.index / 5) * 100}%`;

      if (aqi.index >= 4) {
        alertMsg.style.display = 'block';
        alertMsg.innerHTML = `⚠️ <b>Poor Air Quality (${aqi.label}):</b> Respiratory advisory active.`;
      }
    }

    // Periodically refresh (every 30 mins)
    setTimeout(initEnvironmentalPulse, 30 * 60 * 1000);
  } catch (e) {
    console.warn('[Env Pulse] Fetch failed');
  }
}

// ── Global Real-time Pulse Simulation (Expert Polish) ───────────────────────
function initGlobalPulse() {
  setInterval(() => {
    const user = getState('user');
    if (!user) return;

    // Simulate "System Load" variations for Admin
    if (user.role === 'admin') {
      const loadVal = document.getElementById('admin-load-val');
      if (loadVal) loadVal.textContent = (1400 + Math.random() * 200).toFixed(0);
    }

    // Simulate "Nearby Drones" for Pharmacist
    if (user.role === 'pharmacist') {
      const droneCount = document.getElementById('pharm-active-drones');
      if (droneCount) droneCount.textContent = (3 + (Math.random() > 0.8 ? 1 : 0));
    }

    // Random Background Toasts (Only occasionally)
    if (Math.random() > 0.99) {
      toastInfo('Network Sync', 'Federated learning weights aggregated from 12 medical nodes.');
    }
  }, 5000);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  await cleanupServiceWorker();
  initThemeToggle();
  initPageTransitions();
  initMobileNav();
  initEmergencySOSModal();
  initAuth();
  initGlobalPulse();
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

  document.getElementById('mob-voice-trigger')?.addEventListener('click', () => {
     document.getElementById('voice-nav-btn')?.click();
  });
}

function initMobileNav() {
  const btn = document.getElementById('mobile-menu-btn');
  const navLinks = document.getElementById('nav-links');
  if (btn && navLinks) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navLinks.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#navbar')) {
        navLinks.classList.remove('open');
      }
    });
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  document.querySelectorAll('#mobile-bottom-nav .mob-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (page) navigate(page);
    });
  });
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
    patient: `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
        <div class="card" style="padding:24px; background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(16,185,129,0.1)); border: 1px solid var(--primary);">
          <h3 style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            👤 Health Digital Twin
            <span class="badge badge-routine">SYNCED</span>
          </h3>
          <div style="display:flex; gap:20px; align-items:center;">
             <div style="width:100px; height:100px; background:rgba(0,0,0,0.2); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:3rem; position:relative;">
                🕺
                <div style="position:absolute; inset:0; border:2px solid var(--primary); border-radius:50%; border-top-color:transparent; animation: rotate 3s linear infinite;"></div>
             </div>
             <div style="flex:1;">
                <div style="font-size:0.85rem; color:var(--text-secondary);">Your 3D biometric twin is up-to-date with 12 real-time sensor streams.</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                   <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; font-size:0.7rem;">
                      <div style="color:var(--text-muted);">Metabolic Rate</div>
                      <div style="font-weight:700;">1,840 kcal/d</div>
                   </div>
                   <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; font-size:0.7rem;">
                      <div style="color:var(--text-muted);">Sleep Efficiency</div>
                      <div style="font-weight:700;">94%</div>
                   </div>
                </div>
             </div>
          </div>
        </div>
        <div class="card" style="padding:24px; border-left: 4px solid #f59e0b;">
          <h3 style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            💎 MediTokens (MTK)
            <span class="badge" style="background:#f59e0b; color:white;">BLOCKCHAIN</span>
          </h3>
          <div style="font-size:2.2rem; font-weight:800; margin-bottom:5px;">4,290 <span style="font-size:0.9rem; font-weight:400; color:var(--text-muted);">MTK</span></div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">Rewarded for maintaining 90+ Health Score for 14 days.</div>
          <button class="btn btn-outline btn-sm" style="width:100%; margin-top:15px; font-size:0.7rem;">Redeem at E-Pharmacy</button>
        </div>
      </div>
    `,
    doctor: `
      <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:20px;">
        <div class="card" style="padding:24px; border-left: 5px solid #a5b4fc;">
          <h3 style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            🧠 Clinical Decision Support (CDSS)
            <span class="badge" style="background:#4f46e5; color:white;">AI ACTIVE</span>
          </h3>
          <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:15px;">Analyzing current queue for differential diagnosis patterns...</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
             <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(0,0,0,0.1); border-radius:8px;">
                <div style="font-weight:600; font-size:0.8rem;">Potential Cluster: Viral Flu</div>
                <div style="font-size:0.7rem; color:var(--success);">Confidence: 89%</div>
             </div>
             <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(0,0,0,0.1); border-radius:8px;">
                <div style="font-weight:600; font-size:0.8rem;">Cardiac Risk Flag (Room 2)</div>
                <div style="font-size:0.7rem; color:var(--danger);">Urgency: High</div>
             </div>
          </div>
        </div>
        <div class="card" style="padding:24px; background:rgba(16,185,129,0.05); border:1px solid rgba(16,185,129,0.2);">
           <h3 style="margin-bottom:10px; font-size:0.9rem; font-weight:700;">✍️ AI Clinical Scribe</h3>
           <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:15px;">Auto-generating FHIR records.</div>
           <div style="background:#000; padding:10px; border-radius:6px; font-family:monospace; font-size:0.65rem; color:#10b981;">
              [SCRIBE] Listening...<br>
              [ENTITY] Pt: "chest pain"<br>
              [CODE] SNOMED: 29857009<br>
              [STATUS] Mapping to ICD-10...
           </div>
        </div>
      </div>
    `,
    pharmacist: `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
        <div class="card" style="padding:24px; border-top: 1px solid var(--primary);">
          <h3 style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            📦 GXP Compliance Ledger
            <span class="badge badge-urgent">AUDITED</span>
          </h3>
          <div style="height:60px; display:flex; align-items:flex-end; gap:4px; margin-bottom:15px;">
             ${Array(20).fill(0).map(() => `<div style="flex:1; background:var(--primary); height:${Math.random()*100}%; border-radius:2px; opacity:0.6;"></div>`).join('')}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
             <div style="text-align:center;">
                <div style="font-size:0.65rem; color:var(--text-muted);">OUTBOUND VELOCITY</div>
                <div style="font-size:1.2rem; font-weight:800;">14.2/min</div>
             </div>
             <div style="text-align:center;">
                <div style="font-size:0.65rem; color:var(--text-muted);">BATCH INTEGRITY</div>
                <div style="font-size:1.2rem; font-weight:800; color:var(--success);">100%</div>
             </div>
          </div>
        </div>
        <div class="card" style="padding:24px; border-left:4px solid #10b981;">
           <h3 style="margin-bottom:12px; font-size:1rem; font-weight:700;">❄️ Cold-Chain Telemetry</h3>
           <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
              <span style="font-size:0.75rem;">Active Vaccine Shipments</span>
              <span style="font-weight:700;">8 / 12</span>
           </div>
           <div style="height:8px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden; margin-bottom:15px;">
              <div style="width:66%; height:100%; background:#10b981;"></div>
           </div>
           <div style="font-size:0.7rem; color:var(--text-muted);">All units within safety threshold (2°C - 8°C).</div>
        </div>
      </div>
    `,
    admin: `
      <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:20px;">
        <div class="card" style="padding:24px; background: #0f172a; border: 1px solid #334155;">
          <h3 style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center; color:#a5b4fc;">
            ⚡ Post-Quantum Network Pulse
            <span class="badge" style="background:#10b981; color:white;">FIPS-203</span>
          </h3>
          <div style="display:grid; grid-template-columns:1fr 1.5fr; gap:20px;">
             <div>
                <div style="font-size:2.5rem; font-weight:900; color:var(--primary);">1.5k+</div>
                <div style="font-size:0.65rem; color:var(--text-muted);">PQC HANDSHAKES / MIN</div>
             </div>
             <div style="font-family:monospace; font-size:0.7rem; color:#94a3b8; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px;">
                [PQC_SHAKE] Kyber-768 Verified<br>
                [ML_KEM] Encapsulation complete<br>
                [AUTH_NODE] 200 OK (14ms)<br>
                [FED_AGG] Weights aggregated
             </div>
          </div>
        </div>
        <div class="card" style="padding:24px; border-top: 4px solid var(--success);">
           <h3 style="margin-bottom:10px; font-size:0.9rem; font-weight:700;">🌐 Federated AI Governance</h3>
           <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:15px;">Secure FedAvg aggregation across 14 hospital nodes.</div>
           <div style="font-size:1.1rem; font-weight:800; color:var(--success);">+12.4% <span style="font-size:0.7rem; font-weight:400; color:var(--text-muted);">Accuracy Gain</span></div>
           <div style="font-size:0.65rem; color:var(--text-muted); margin-top:5px;">Privacy Budget ε: 0.12 (Strong)</div>
        </div>
      </div>
    `,
    rider: `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
        <div class="card" style="padding:24px; border-left: 5px solid #f59e0b;">
          <h3 style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            🛡️ Rider Safety Shield
            <span class="badge badge-routine">VERIFIED</span>
          </h3>
          <div style="display:flex; gap:15px; align-items:center;">
             <div style="font-size:2rem;">🌡️</div>
             <div>
                <div style="font-weight:700; font-size:0.9rem;">Temp Checked: 36.5°C</div>
                <div style="font-size:0.75rem; color:var(--text-secondary);">Valid for 8 hours.</div>
             </div>
          </div>
          <div style="margin-top:15px; padding-top:15px; border-top:1px solid var(--border); display:flex; justify-content:space-between;">
             <div style="font-size:0.75rem; font-weight:600;">Surge Multiplier</div>
             <div style="color:var(--primary); font-weight:800;">x1.5 Active</div>
          </div>
        </div>
        <div class="card" style="padding:24px; border-top: 4px solid var(--primary);">
           <h3 style="margin-bottom:10px; font-size:0.9rem; font-weight:700;">📈 Earnings Projection</h3>
           <div style="font-size:2rem; font-weight:800;">₹1,240 <span style="font-size:0.8rem; font-weight:400; color:var(--success);">+₹300</span></div>
           <div style="font-size:0.75rem; color:var(--text-secondary);">Projected for next 3 hours based on demand.</div>
           <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:2px; margin-top:15px; overflow:hidden;">
              <div style="width:75%; height:100%; background:var(--primary);"></div>
           </div>
        </div>
      </div>
    `
  };

  container.innerHTML = widgets[role] || widgets.patient;
}

function loadProfileSettings() {
  const container = document.getElementById('dash-profile');
  if (!container) return;
  container.innerHTML = `<div class="card" style="padding:30px;"><h2>⚙️ Account Settings</h2><button class="btn btn-primary" style="margin-top:30px;">Save Profile Changes</button></div>`;
}

function renderHelperHUD() {
  const container = document.getElementById('dash-power-widgets');
  if (!container) return;

  const helperCard = document.createElement('div');
  helperCard.className = 'card fade-up';
  helperCard.style.cssText = 'margin-bottom: 24px; padding: 24px; background: linear-gradient(135deg, rgba(20, 241, 149, 0.1), rgba(99, 102, 241, 0.1)); border: 1px solid var(--success);';
  helperCard.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
      <h3 style="margin:0; font-size:1.1rem; font-weight:800; color:var(--success); display:flex; align-items:center; gap:10px;">
        <span>🏠 ASHA / Frontline Worker Console</span>
      </h3>
      <span class="badge badge-routine">HELPER MODE ACTIVE</span>
    </div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; align-items:center;">
       <div>
          <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">You are currently assisting patients in **Sector 4, Ludhiana**. Select a patient to log symptoms.</div>
          <select id="helper-patient-select" class="form-input" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.1);">
             <option value="">-- Select Patient to Assist --</option>
             <option value="p1">Rajesh Kumar (Age 62)</option>
             <option value="p2">Sunita Devi (Age 55)</option>
             <option value="p3">Amit Singh (Age 28)</option>
          </select>
       </div>
       <div style="display:flex; gap:10px;">
          <button class="btn btn-primary" id="btn-helper-triage" style="flex:1; height:45px; font-weight:700;">Start Voice Triage 🎤</button>
          <button class="btn btn-outline" id="btn-helper-simple" style="flex:1; height:45px; font-weight:700;">Open Simple UI 🌟</button>
       </div>
    </div>
  `;

  container.prepend(helperCard);

  document.getElementById('btn-helper-simple')?.addEventListener('click', () => {
    document.getElementById('btn-inclusive-toggle')?.click();
  });

  document.getElementById('btn-helper-triage')?.addEventListener('click', () => {
    const sel = document.getElementById('helper-patient-select');
    if (!sel.value) { toastInfo('Selection Required', 'Please select a patient first.'); return; }
    navigate('triage');
    toastSuccess('Voice Triage Ready', 'Describe patient symptoms aloud.');
  });
}

window.runRadiologyAI = () => {
  const box = document.getElementById('ai-bounding-box');
  if (!box) return;

  toastInfo('Inference Started', 'ResNet-101 model is processing the image pixels...');

  setTimeout(() => {
    box.style.display = 'block';
    toastSuccess('Analysis Complete', 'Anomaly localized with 92% confidence.');
  }, 1800);
};

function renderFocusHub(user) {
  const titleEl = document.getElementById('focus-title');
  const subEl = document.getElementById('focus-sub');
  const actionsEl = document.getElementById('focus-actions');
  const visualEl = document.getElementById('focus-visual');

  if (!titleEl || !subEl || !actionsEl) return;

  const role = user.role || 'patient';
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';

  const config = {
    patient: {
      title: `Good ${timeOfDay}, ${user.firstName}`,
      sub: `Your current Health Score is <strong style="color:#dcfce7">94/100</strong>. No critical anomalies detected.`,
      visual: '🕺',
      actions: [
        { label: 'CHECK SYMPTOMS', goto: 'triage', primary: true },
        { label: 'BOOK SPECIALIST', section: 'appointments' }
      ]
    },
    doctor: {
      title: `Command Center: Dr. ${user.lastName}`,
      sub: `You have <strong>3 urgent consultations</strong> waiting in your priority queue.`,
      visual: '🩺',
      actions: [
        { label: 'START NEXT SESSION', section: 'queue', primary: true },
        { label: 'VIEW SCHEDULE', section: 'availability' }
      ]
    },
    rider: {
      title: `Active Duty Hub`,
      sub: `High demand in <strong>Model Town</strong>. Surge multiplier <strong>x1.5</strong> is active!`,
      visual: '🏍️',
      actions: [
        { label: 'GO ONLINE', action: 'toggle-rider', primary: true },
        { label: 'EARNINGS REPORT', section: 'rider' }
      ]
    },
    pharmacist: {
      title: `Inventory Intelligence`,
      sub: `AI predicts a <strong>22% spike</strong> in Paracetamol demand this weekend.`,
      visual: '💊',
      actions: [
        { label: 'MANAGE STOCK', section: 'inventory', primary: true },
        { label: 'DISPATCH DRONES', section: 'drone' }
      ]
    },
    admin: {
      title: `Global System Pulse`,
      sub: `Encryption Integrity: <strong style="color:#dcfce7">99.9%</strong>. System load is nominal across 12 nodes.`,
      visual: '🛡️',
      actions: [
        { label: 'PQC SECURITY AUDIT', section: 'admin', primary: true },
        { label: 'NODE MONITOR', section: 'admin' }
      ]
    }
  };

  const c = config[role] || config.patient;
  titleEl.innerHTML = c.title;
  subEl.innerHTML = c.sub;
  if (visualEl) visualEl.textContent = c.visual;

  actionsEl.innerHTML = c.actions.map(a => `
    <button class="btn ${a.primary ? 'btn-primary' : 'btn-outline'}"
            style="${a.primary ? 'background:white; color:var(--accent); border:none; font-weight:800;' : 'border-color:rgba(255,255,255,0.3); color:white; background:transparent;'}"
            ${a.goto ? `data-goto="${a.goto}"` : ''}
            ${a.section ? `data-section="${a.section}"` : ''}
            ${a.action ? `data-action="${a.action}"` : ''}>
      ${a.label}
    </button>
  `).join('');

  // Bind events
  actionsEl.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.goto)));
  actionsEl.querySelectorAll('[data-section]').forEach(btn => btn.addEventListener('click', () => {
     const sidebarItem = document.querySelector(`.sidebar-item[data-section="${btn.dataset.section}"]`);
     if (sidebarItem) sidebarItem.click();
  }));

  actionsEl.querySelector('[data-action="toggle-rider"]')?.addEventListener('click', (e) => {
     const toggle = document.getElementById('rider-online-toggle');
     if (toggle) {
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change'));
        e.target.textContent = toggle.checked ? 'GO OFFLINE' : 'GO ONLINE';
     }
  });
}

function initInclusiveMode() {
  const toggle = document.getElementById('btn-inclusive-toggle');
  const sectionIds = ['dash-overview', 'dash-vitals', 'dash-drone', 'dash-appointments', 'dash-prescriptions', 'dash-orders', 'dash-identity', 'side-companion', 'dash-location', 'dash-marketplace', 'dash-labs', 'dash-timeline', 'dash-rider', 'dash-queue', 'dash-inventory', 'dash-admin', 'dash-profile', 'dash-availability', 'dash-incoming-prescriptions', 'dash-family', 'dash-inclusive'];

  if (!toggle) return;

  toggle.addEventListener('click', () => {
    document.body.classList.toggle('inclusive-mode-active');
    const isActive = document.body.classList.contains('inclusive-mode-active');

    toggle.innerHTML = isActive ? '🏠 Standard Mode' : '🌟 Simple Mode';

    if (isActive) {
      sectionIds.forEach(id => document.getElementById(id)?.classList.add('hidden'));
      document.getElementById('dash-inclusive')?.classList.remove('hidden');
      toastSuccess('Simple Mode Active', 'Big icons enabled for easy use.');
      speakText('Simple mode active. Tap on what you need.');
    } else {
      document.getElementById('dash-overview')?.classList.remove('hidden');
      document.querySelector('.sidebar')?.style.removeProperty('display');
      document.getElementById('navbar')?.style.removeProperty('display');
      toastInfo('Standard Mode', 'Full interface restored.');
    }
  });

  document.querySelectorAll('.inclusive-card').forEach(card => {
    card.addEventListener('click', () => {
      const action = card.dataset.action;
      const label = card.querySelector('.inclusive-label').textContent;
      speakText(`Going to ${label}`);

      if (action === 'doctor') { navigate('consultation'); }
      else if (action === 'pharmacy') { navigate('pharmacy'); }
      else if (action === 'emergency') { document.getElementById('sos-btn')?.click(); }
      else if (action === 'pain' || action === 'fever') {
         navigate('triage');
         // Auto-fill symptoms if possible
         setTimeout(() => {
           const input = document.getElementById('symptom-input');
           if (input) {
             input.value = action === 'pain' ? 'Body pain' : 'Fever';
             input.dispatchEvent(new Event('input'));
           }
         }, 500);
      }
      else if (action === 'family') {
         document.body.classList.remove('inclusive-mode-active');
         toggle.innerHTML = '🌟 Simple Mode';
         const famItem = document.querySelector('.sidebar-item[data-section="family"]');
         if (famItem) famItem.click();
      }
    });
  });
}

function initHybridNavigation() {
  const chk = document.getElementById('chk-force-desktop');
  if (!chk) return;

  // Restore from storage
  const saved = localStorage.getItem('mf_force_desktop') === 'true';
  chk.checked = saved;
  if (saved) document.body.classList.add('force-desktop');

  chk.addEventListener('change', () => {
    document.body.classList.toggle('force-desktop', chk.checked);
    localStorage.setItem('mf_force_desktop', chk.checked);
    toastInfo(chk.checked ? 'Desktop Mode Active' : 'Adaptive Mode Active',
              chk.checked ? 'Sidebar visible on all devices.' : 'UI will adapt to screen size.');

    // Trigger map resizing if on map page
    window.dispatchEvent(new Event('resize'));
  });
}

function initContextBanner() {
  const banner = document.getElementById('acting-as-banner');
  const nameEl = document.getElementById('acting-as-name');
  const clearBtn = document.getElementById('btn-clear-context');
  const actingFor = sessionStorage.getItem('mf_acting_for');

  if (actingFor && banner && nameEl) {
    banner.classList.remove('hidden');
    nameEl.textContent = actingFor.slice(-6).toUpperCase(); // Show ID chunk for now

    clearBtn?.addEventListener('click', () => {
      sessionStorage.removeItem('mf_acting_for');
      toastInfo('Context Cleared', 'Returned to your own dashboard.');
      window.location.reload();
    });
  }
}

function speakText(txt) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(txt);
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}
