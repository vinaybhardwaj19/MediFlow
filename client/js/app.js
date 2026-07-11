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

// Global health score state
let _healthEngine = new HealthScoreEngine();
let _lastHealthScore = null;
let _lastVitals = {};

// ── PWA Service Worker Registration ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('[PWA] Service worker registered', reg.scope);
    }).catch(err => console.warn('[PWA] SW registration failed', err));
  });
}

// ── Particle system ───────────────────────────────────────────────────────────
let particles = null;

function initParticles() {
  if (particles) return;
  particles = new ParticleNetwork('hero-particles');
  particles.start();
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

  // Greeting
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetEl = document.getElementById('dash-greeting');
  if (greetEl) greetEl.textContent = `${greet}, ${user.firstName}! ⚡`;
  const nameEl = document.getElementById('sidebar-name');
  if (nameEl) nameEl.textContent = `${user.firstName} ${user.lastName}`;
  const roleEl = document.getElementById('sidebar-role');
  if (roleEl) roleEl.textContent = user.role?.toUpperCase();

  // Sidebar visibility by role
  const role = user.role;
  document.getElementById('side-vitals').style.display    = (role === 'patient' || role === 'doctor') ? 'flex' : 'none';
  document.getElementById('side-drone').style.display     = (role === 'patient' || role === 'pharmacist') ? 'flex' : 'none';
  document.getElementById('side-queue').style.display     = (role === 'doctor') ? 'flex' : 'none';
  document.getElementById('side-inventory').style.display = (role === 'pharmacist') ? 'flex' : 'none';

  // Fetch live data
  // Show skeletons
  const apptList = document.getElementById('appointments-list');
  const rxList   = document.getElementById('prescriptions-list');
  const ordersList = document.getElementById('orders-list');
  if (apptList)   apptList.innerHTML   = Array(3).fill('<div class="card skeleton" style="height: 70px; margin-bottom: 12px;"></div>').join('');
  if (rxList)     rxList.innerHTML     = Array(2).fill('<div class="card skeleton" style="height: 70px; margin-bottom: 12px;"></div>').join('');
  if (ordersList) ordersList.innerHTML = Array(2).fill('<div class="card skeleton" style="height: 70px; margin-bottom: 12px;"></div>').join('');

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
    renderAppointmentsList(appointments);
    if (role === 'doctor') renderDoctorQueue(appointments);
    renderPrescriptionsList(prescriptions);
    renderOrdersList(orders);
  } catch (err) {
    toastError('Dashboard', 'Could not load all data.');
  }

  // ── Ambient Biometric Monitor ─────────────────────────────────────────
  startECGSparkline('ecg-canvas');
  connectAmbientStream();
  initRealSensors();

  // Vitals subscription for health score
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

  // ── Drone Fleet Tracker ───────────────────────────────────────────────
  initDroneTracker('drone-map-canvas');

  // Health report from sidebar
  document.getElementById('xr-toggle-btn')?.addEventListener('click', () => {
    generateHealthReport(getState('user'), _lastVitals, _lastHealthScore);
  });

  // ── Analytics Charts ──────────────────────────────────────────────────
  initDashboardCharts();

  // ── QR Prescription Demo ──────────────────────────────────────────────
  demoPrescriptionQR('qr-container');
  document.getElementById('demo-qr-btn')?.addEventListener('click', () => demoPrescriptionQR('qr-container'));

  // ── Inject template sections into dashboard ───────────────────────────
  const dashContainer = document.querySelector('#page-dashboard .container');
  if (dashContainer) {
    const hsTpl = document.getElementById('health-score-template');
    if (hsTpl && !document.getElementById('dash-healthscore'))
      dashContainer.appendChild(hsTpl.content.cloneNode(true));
    if (role === 'patient') {
      const bookTpl = document.getElementById('booking-template');
      if (bookTpl && !document.getElementById('dash-booking'))
        dashContainer.appendChild(bookTpl.content.cloneNode(true));
    }
    if (role === 'doctor') {
      const docTpl = document.getElementById('doctor-tools-template');
      if (docTpl && !document.getElementById('dash-doctor-tools'))
        dashContainer.appendChild(docTpl.content.cloneNode(true));
    }
  }

  // ── AI Health Score Panel ─────────────────────────────────────────────
  initHealthScorePanel();

  // ── Appointment Booking Widget (patients) ─────────────────────────────
  if (role === 'patient') initAppointmentBooking();

  // ── Doctor Tools (prescription pad + ratings) ─────────────────────────
  if (role === 'doctor') {
    initPrescriptionPad();
    initDoctorRating();
    initOCRScanner();
    initMedicineScanner();
  }

  // ── Emergency SOS ─────────────────────────────────────────────────────
  initEmergencySOS();

  // ── AI Model Performance & Federated Learning Dashboard (v2.0) ────────
  initMLDashboard();

  // ── PDF Report ────────────────────────────────────────────────────────
  document.getElementById('download-report-btn')?.addEventListener('click', () => {
    generateHealthReport(getState('user'), _lastVitals, _lastHealthScore);
  });

  // Re-init scroll reveal
  initScrollReveal();
}

// ── Health Score Panel ────────────────────────────────────────────────────────
function initHealthScorePanel() {
  // Seed with default values so gauge appears immediately
  const defaultVitals = { hr:72, spo2:98, sbp:118, temp:36.8, glucose:92, rr:15 };
  _lastVitals = defaultVitals;
  _lastHealthScore = _healthEngine.compute(defaultVitals);
  updateHealthScorePanel(_lastHealthScore);
}

function updateHealthScorePanel(hs) {
  if (!hs) return;
  // Draw gauge
  drawHealthGauge('health-score-gauge', hs.score, hs.color);
  // Draw radar
  drawRiskRadar('health-radar-canvas', hs.components);
  // Update grade
  const gradeEl = document.getElementById('health-grade-label');
  if (gradeEl) { gradeEl.textContent = hs.grade; gradeEl.style.color = hs.color; }
  // Risk list
  const riskList = document.getElementById('health-risk-list');
  if (riskList) {
    if (hs.risks.length === 0) {
      riskList.innerHTML = '<div style="color:var(--success);font-size:.85rem;">✅ No critical risks detected</div>';
    } else {
      riskList.innerHTML = hs.risks.map(r => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);
          background:${r.level==='high'?'rgba(239,68,68,.1)':r.level==='medium'?'rgba(245,158,11,.1)':'rgba(16,185,129,.1)'};
          border-left:3px solid ${r.level==='high'?'#ef4444':r.level==='medium'?'#f59e0b':'#10b981'};
          margin-bottom:8px;">
          <span>${r.level==='high'?'🔴':r.level==='medium'?'🟡':'🟢'}</span>
          <div>
            <div style="font-weight:600;font-size:.85rem;">${r.label}</div>
            <div style="font-size:.78rem;color:var(--text-secondary);">${r.action}</div>
          </div>
        </div>
      `).join('');
    }
  }
  // Recommendations
  const recEl = document.getElementById('health-recommendations');
  if (recEl) {
    recEl.innerHTML = hs.recommendations.map(r => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;
        border-bottom:1px solid var(--border);font-size:.85rem;">${r}</div>
    `).join('');
  }
}

function renderAppointmentsList(appointments) {
  const el = document.getElementById('appointments-list');
  if (!appointments.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">No appointments yet.</div>';
    return;
  }
  el.innerHTML = appointments.map(a => {
    const isUpcoming = a.status === 'confirmed' || a.status === 'pending';
    const canCancel = isUpcoming;
    const canJoin = a.status === 'confirmed';
    
    return `
    <div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:16px;padding:16px; flex-wrap:wrap;">
      <div style="font-size:1.8rem;">📅</div>
      <div style="flex:1; min-width: 200px;">
        <div style="font-weight:600;">
          ${a.type?.toUpperCase() || 'VIDEO'} consultation
          ${a.doctorId ? `· Dr. ${a.doctorId.firstName || ''} ${a.doctorId.lastName || ''}` : ''}
        </div>
        <div style="font-size:.85rem;color:var(--text-secondary);">
          ${new Date(a.scheduledAt).toLocaleString()}
        </div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <span class="badge ${a.status === 'confirmed' ? 'badge-routine' : a.status === 'cancelled' ? 'badge-emergency' : 'badge-primary'}">
          ${a.status?.toUpperCase()}
        </span>
        ${canJoin ? `<button class="btn btn-primary btn-sm" onclick="window.joinConsultationRoom('${a._id}')">Join Room</button>` : ''}
        ${canCancel ? `<button class="btn btn-outline btn-sm" onclick="window.cancelAppointment('${a._id}')">Cancel</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

window.cancelAppointment = async (id) => {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;
  try {
    await api.patch(`/appointments/${id}/cancel`, { reason: 'Cancelled by patient' });
    toastSuccess('Cancelled', 'Appointment cancelled successfully');
    loadDashboard();
  } catch (e) {
    toastError('Error', e.message || 'Failed to cancel appointment');
  }
};

window.joinConsultationRoom = async (appointmentId) => {
  if (!appointmentId) { toastError('Room Error', 'No appointment ID found'); return; }
  try {
    const res = await api.get(`/appointments/${appointmentId}/room-token`);
    const { roomId, token } = res.data;
    import('./router.js').then(({ navigate }) => navigate('consultation'));
    setTimeout(() => {
      const roomInput  = document.getElementById('room-id-input');
      const tokenInput = document.getElementById('room-token-input');
      if (roomInput)  roomInput.value  = roomId;
      if (tokenInput) tokenInput.value = token;
    }, 200);
  } catch (e) {
    toastError('Room Error', 'Could not fetch room token. Ask your doctor to confirm the appointment first.');
  }
};

function renderDoctorQueue(appointments) {
  const el = document.getElementById('doctor-queue-list');
  const queue = appointments.filter(a => a.status === 'confirmed');
  if (!queue.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Queue is empty.</div>';
    return;
  }
  el.innerHTML = queue.map(a => `
    <div class="card fade-up" style="margin-bottom:12px;padding:20px;border-left:4px solid var(--primary);">
       <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
             <div style="font-weight:700;font-size:1.1rem;">${a.patientId?.firstName || 'Patient'} ${a.patientId?.lastName || ''}</div>
             <div style="font-size:.8rem;color:var(--text-secondary);">${a.reason || 'General Checkup'}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.location.hash='#consultation'">Start Call</button>
       </div>
       <div style="display:flex;gap:15px;font-size:.75rem;">
          <span style="color:var(--vital-hr);">❤️ 78 bpm</span>
          <span style="color:var(--vital-spo2);">🫁 98%</span>
          <span style="color:var(--success);">✅ Vitals Stable</span>
       </div>
    </div>
  `).join('');
}

async function initRealSensors() {
  const { initRealSensorEngine } = await import('./real-sensors.js');
  initRealSensorEngine();
}

function renderPrescriptionsList(prescriptions) {
  const el = document.getElementById('prescriptions-list');
  if (!el) return;
  if (!prescriptions.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">No prescriptions yet.</div>';
    return;
  }
  el.innerHTML = prescriptions.map(p => `
    <div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:16px;padding:16px;border-left:4px solid var(--primary);">
      <div style="font-size:1.8rem;">📋</div>
      <div style="flex:1;">
        <div style="font-weight:600;">${p.medications?.map(m=>m.name).join(', ') || 'Prescription'}</div>
        <div style="font-size:.85rem;color:var(--text-secondary);">
          Dr. ${p.doctorId?.firstName||'Doctor'} ${p.doctorId?.lastName||''} &middot; 
          ${new Date(p.issuedAt||p.createdAt).toLocaleDateString()}
        </div>
      </div>
      <span class="badge ${p.status==='active'?'badge-routine':'badge-primary'}">${p.status?.toUpperCase()||'ACTIVE'}</span>
    </div>`).join('');
}

function renderOrdersList(orders) {
  const el = document.getElementById('orders-list');
  if (!el) return;
  if (!orders.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);"><div style="font-size:3rem;margin-bottom:12px;">📦</div>No orders yet. <a href="#pharmacy" style="color:var(--primary);">Visit the pharmacy</a></div>';
    return;
  }
  const statusColor = { placed:'badge-primary', processing:'badge-urgent', dispatched:'badge-routine', delivered:'badge-routine', cancelled:'badge-emergency' };
  el.innerHTML = orders.map(o => `
    <div class="card" style="margin-bottom:12px;padding:16px;border-left:4px solid var(--primary);">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="font-size:1.8rem;">🛒</div>
        <div style="flex:1;min-width:200px;">
          <div style="font-weight:700;">${o.items?.map(i => i.name || 'Medicine').join(', ') || 'Order #' + o._id?.slice(-6)}</div>
          <div style="font-size:.85rem;color:var(--text-secondary);">
            ₹${((o.totalAmount||0)/100).toFixed(2)} &middot; ${new Date(o.createdAt).toLocaleDateString()}
            ${o.estimatedDelivery ? ` &middot; ETA: ${new Date(o.estimatedDelivery).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge ${statusColor[o.currentStatus] || 'badge-primary'}">${(o.currentStatus||'placed').toUpperCase()}</span>
          ${o.currentStatus !== 'delivered' && o.currentStatus !== 'cancelled' ?
            `<button class="btn btn-outline btn-sm" onclick="window.location.hash='#dashboard';document.getElementById('dash-live-tracking')?.classList.remove('hidden')">Track</button>`
          : ''}
        </div>
      </div>
    </div>`).join('');
}

// ── Triage with body map ──────────────────────────────────────────────────────
function initTriageWithBodyMap() {
  initTriage();

  // Initialize body map with callback to add symptoms
  initBodyMap((symptom, isSelected) => {
    const input = document.getElementById('symptom-input');
    if (isSelected) {
      // Simulate adding the symptom via the triage input
      if (input) {
        input.value = symptom;
        input.dispatchEvent(new Event('input'));
        // Trigger Enter key to add the chip
        setTimeout(() => {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        }, 100);
      }
    }
  });
}

// ── Sidebar navigation ──────────────────────────────────────────────────────
function initDashboardSidebar() {
  const sectionIds = [
    'dash-overview', 'dash-vitals', 'dash-drone',
    'dash-appointments', 'dash-prescriptions', 'dash-orders',
    'dash-identity',
  ];

  document.querySelectorAll('.sidebar-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const target = document.getElementById('dash-' + item.dataset.section);
      if (target) {
        // Show hidden section if needed
        target.classList.remove('hidden');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ── Quick action cards ────────────────────────────────────────────────────────
function initQuickActions() {
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.goto));
  });
  document.getElementById('hero-get-started')?.addEventListener('click', () => {
    if (getState('user')) navigate('dashboard');
    else window.dispatchEvent(new Event('mf:need-auth'));
  });
  document.getElementById('hero-triage-btn')?.addEventListener('click', () => navigate('triage'));
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  // 1. Init theme
  initThemeToggle();

  // 2. Init auth UI
  initAuth();

  // 3. Restore session (silent)
  const restored = await restoreSession();
  if (restored) {
    updateNavForUser(getState('user'));
  }

  // 4. Register page hooks
  registerHook('dashboard',    loadDashboard);
  registerHook('triage',       initTriageWithBodyMap);
  registerHook('pharmacy',     initPharmacy);
  registerHook('consultation', initConsultation);

  // 5. Init sidebar + quick actions
  initDashboardSidebar();
  initQuickActions();

  // 6. Start router
  initRouter();

  // 7. Init particles on hero
  initParticles();

  // 8. Init MediBot
  initMediBot();

  // 9. Init scroll reveal & ripple effects
  initScrollReveal();
  initRippleEffect();

  // 10. Init hero counters
  initHeroCounters();

  // 11. Voice Navigation (global)
  initVoiceNavigation(navigate);

  // 12. Medicine Barcode Scanner
  initMedicineScanner();

  // 13. Emergency SOS (global)
  initEmergencySOS();

  // 14. Multilingual toggle
  initMultilingualToggle();

  // 15. OCR Prescription Scanner
  initOCRScanner();

  // 16. Doctor Rating (always render if element present)
  initDoctorRating();
}

bootstrap().catch(err => console.error('[MediFlow] Bootstrap error:', err));
