/**
 * @file rider-dashboard.js
 * @description Delivery Rider Dashboard module.
 * Manages picking up orders, Leaflet navigation pathing, and verification via OTP.
 */

import * as api from './api.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';

let _activeRun = null;
let _riderMap = null;
let _riderRouteLine = null;

export function initRiderDashboard() {
  const container = document.getElementById('dash-rider');
  if (!container) return;

  renderRiderLayout();
  loadRiderStats();
  loadAvailableDeliveries();
  initRiderToggles();

  // Listen for Pharmacy order dispatches
  window.addEventListener('mf:dispatch-rider', (e) => {
    const detail = e.detail;
    toastInfo('🏍️ New Delivery Assigned', 'MediFlow Cold-Chain dispatch received in Rider Hub!');
    addSimulatedDeliveryToQueue(detail);
  });
}

function renderRiderLayout() {
  const container = document.getElementById('dash-rider');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 480px; margin: 0 auto; background: var(--bg-base); min-height: 80vh; padding-bottom: 50px;">

      <!-- Top Header / Status -->
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 15px 0; border-bottom: 1px solid var(--border);">
        <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--primary);">🏍️ Rider Hub</h3>
        <div style="display:flex; align-items:center; gap:10px;">
          <span id="rider-status-label" style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">OFFLINE</span>
          <label class="switch">
            <input type="checkbox" id="rider-online-toggle">
            <span class="slider round"></span>
          </label>
        </div>
      </div>

      <!-- Live Route & Environment Telemetry Widget -->
      <div class="card fade-up" style="margin-top: 15px; padding: 15px; background: rgba(99, 102, 241, 0.05); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; flex-wrap:wrap;">
          <span style="font-size:0.75rem; font-weight:800; color:var(--primary); display:flex; align-items:center; gap:6px;">
            <span>🌤️ Live Route Telemetry</span>
          </span>
          <span style="font-size:0.68rem; background:rgba(16,185,129,0.15); color:#10b981; padding:2px 8px; border-radius:99px; font-weight:700;">
            ● Active Navigation GPS
          </span>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.72rem;">
          <div style="background:var(--bg-base); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="color:var(--text-muted);">Weather & Traffic</div>
            <div style="font-weight:700; color:var(--text-main); margin-top:2px;">28°C Clear · Low Traffic 🟢</div>
          </div>
          <div style="background:var(--bg-base); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="color:var(--text-muted);">Cold-Chain Box</div>
            <div style="font-weight:700; color:#10b981; margin-top:2px;">+3.4°C (Safe 2-8°C) ❄️</div>
          </div>
        </div>
      </div>

      <!-- Earnings Card -->
      <div class="card" style="margin-top: 15px; padding: 20px; text-align: center; background: linear-gradient(135deg, var(--primary), #1e293b); color: white; border: none; border-radius: 20px; box-shadow: 0 10px 20px rgba(0,0,0,0.1);">
        <div style="font-size: 0.8rem; opacity: 0.8; margin-bottom: 5px;">Today's Earnings</div>
        <div style="font-size: 2.5rem; font-weight: 800;" id="rider-stat-wallet">₹0.00</div>
        <div style="display:flex; justify-content:center; gap:20px; margin-top:15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top:15px;">
           <div>
             <div style="font-size:1.1rem; font-weight:700;" id="rider-stat-runs">0</div>
             <div style="font-size:0.6rem; opacity:0.7;">Deliveries</div>
           </div>
           <div>
             <div style="font-size:1.1rem; font-weight:700;">24.8 km</div>
             <div style="font-size:0.6rem; opacity:0.7;">Distance</div>
           </div>
           <div>
             <div style="font-size:1.1rem; font-weight:700;">4.9 ★</div>
             <div style="font-size:0.6rem; opacity:0.7;">Rating</div>
           </div>
        </div>
      </div>

      <!-- Active Task Section -->
      <div id="active-delivery-run-container" style="margin-top: 25px;">
        <div style="text-align:center; padding:40px; color:var(--text-muted); font-size:0.85rem; border: 2px dashed var(--border); border-radius: 15px;">
           <img src="https://images.unsplash.com/photo-1558981403-c5f91cbba527?auto=format&fit=crop&w=100&q=80" style="width:60px; height:60px; border-radius:50%; margin-bottom:15px; object-fit:cover;">
           <div>Waiting for new orders...</div>
        </div>
      </div>

      <div id="rider-navigation-panel" class="hidden" style="margin-top:20px;">
        <div class="card" style="padding:0; overflow:hidden; border-radius: 15px;">
          <div id="rider-map" style="height:300px; z-index:1;"></div>
          <div id="delivery-action-controls" style="padding: 15px;"></div>
        </div>
      </div>

      <!-- Available Queue -->
      <div style="margin-top: 30px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
          <h4 style="font-weight:800; font-size: 1rem;">Orders Near You</h4>
          <span class="badge" style="background: var(--accent); color: white;" id="queue-count">0</span>
        </div>
        <div id="available-deliveries-queue" style="display: flex; flex-direction: column; gap: 12px;">
          <div class="loading-center"><div class="spinner"></div></div>
        </div>
      </div>

    </div>

    <style>
      /* Switch Styling */
      .switch { position: relative; display: inline-block; width: 44px; height: 22px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; }
      .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; }
      input:checked + .slider { background-color: var(--success); }
      input:checked + .slider:before { transform: translateX(22px); }
      .slider.round { border-radius: 34px; }
      .slider.round:before { border-radius: 50%; }
    </style>
  `;
}

function initRiderToggles() {
  const toggle = document.getElementById('rider-online-toggle');
  const label = document.getElementById('rider-status-label');

  toggle?.addEventListener('change', () => {
    if (toggle.checked) {
      label.textContent = 'ONLINE';
      label.style.color = 'var(--success)';
      toastSuccess('Status: Online', 'You are now visible for new delivery requests.');
      loadAvailableDeliveries();
    } else {
      label.textContent = 'OFFLINE';
      label.style.color = 'var(--text-muted)';
      toastInfo('Status: Offline', 'You will no longer receive new requests.');
    }
  });
}

async function loadRiderStats() {
  try {
    const res = await api.get('/riders/stats');
    const { totalCompleted, totalEarnings, activeRuns = [] } = res.data;

    const runsEl = document.getElementById('rider-stat-runs');
    if (runsEl) runsEl.textContent = totalCompleted;

    const walletEl = document.getElementById('rider-stat-wallet');
    if (walletEl) walletEl.textContent = `₹${(totalEarnings / 100).toFixed(2)}`;

    if (activeRuns.length > 0) {
      _activeRun = activeRuns[0];
      renderActiveRun(_activeRun);
    } else {
      _activeRun = null;
      // Clear Map
      if (_riderMap) {
        _riderMap.remove();
        _riderMap = null;
      }
      document.getElementById('rider-navigation-panel')?.classList.add('hidden');
    }
  } catch (err) {
    console.warn('Could not load rider stats', err);
  }
}

async function loadAvailableDeliveries() {
  const queueEl = document.getElementById('available-deliveries-queue');
  if (!queueEl) return;

  try {
    const res = await api.get('/riders/queue');
    const orders = res.data || [];

    const countEl = document.getElementById('queue-count');
    if (countEl) countEl.textContent = orders.length;

    if (orders.length === 0) {
      queueEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:.85rem;">Searching for orders...</div>';
      return;
    }

    queueEl.innerHTML = orders.map(o => `
      <div class="card" style="padding:16px; border-radius: 15px; border: 1px solid var(--border); box-shadow: 0 4px 10px rgba(0,0,0,0.02);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-weight:800; font-size: 0.9rem; margin-bottom: 5px;">Pickup: Central Pharmacy</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 2px;">📍 ${o.deliveryAddress?.street || 'N/A'}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${(Math.random() * 5).toFixed(1)} km away</div>
          </div>
          <div style="text-align:right;">
             <div style="font-weight:800; color: var(--success); font-size: 1rem;">₹150</div>
             <div style="font-size: 0.6rem; color: var(--text-muted);">Payout</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm btn-claim-run" data-id="${o._id}" style="width:100%; margin-top:15px; border-radius: 10px; height: 40px; font-weight: 700;">Accept Order</button>
      </div>
    `).join('');

    queueEl.querySelectorAll('.btn-claim-run').forEach(btn => {
      btn.addEventListener('click', () => {
        claimDelivery(btn.dataset.id);
      });
    });

  } catch (err) {
    queueEl.innerHTML = '<div style="font-size:.8rem;color:var(--text-danger);">Failed to load dispatch queue.</div>';
  }
}

async function claimDelivery(orderId) {
  toastInfo('Accepting run', 'Creating rider assignment...');
  try {
    await api.post('/riders/accept', { orderId });
    toastSuccess('Run Claimed', 'Order accepted! Navigate to the pharmacy for pickup.');
    loadRiderStats();
    loadAvailableDeliveries();
  } catch (err) {
    toastError('Acceptance Failed', err.message || 'Could not claim delivery.');
  }
}

function addSimulatedDeliveryToQueue(detail) {
  const queueEl = document.getElementById('available-deliveries-queue');
  if (!queueEl) return;
  const countBadge = document.getElementById('queue-count');

  const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
  const itemsCount = detail.order?.items?.length || 2;
  const totalAmount = detail.order?.totalAmount ? (detail.order.totalAmount / 100).toFixed(2) : '350.00';
  const estMins = detail.routingMeta?.estimatedMinutes || 12;

  const cardHtml = `
    <div class="card fade-up" style="padding:15px; border-radius:15px; border: 1px solid var(--primary-light, rgba(99,102,241,0.3)); background: var(--bg-card); position:relative; overflow:hidden;">
      <div style="position:absolute; top:0; right:0; background:#10b981; color:white; font-size:0.6rem; font-weight:800; padding:3px 10px; border-bottom-left-radius:8px;">
        ❄️ COLD-CHAIN SECURE (4.2°C)
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-size:0.75rem; font-weight:800; color:var(--primary);">📦 ${orderId}</span>
        <span style="font-size:0.75rem; color:var(--text-muted); margin-right:80px;">⚡ ETA ~${estMins}m</span>
      </div>
      <div style="font-size:0.85rem; font-weight:700; margin-bottom:4px;">Medical Prescription Order (${itemsCount} items)</div>
      <div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:12px;">📍 Ludhiana Hub &rarr; Patient Residence</div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:0.9rem; font-weight:800; color:#10b981;">₹${totalAmount} Payout</span>
        <button class="btn btn-primary btn-sm btn-claim-sim" style="border-radius:10px; font-weight:700;">Accept Delivery</button>
      </div>
    </div>
  `;

  queueEl.insertAdjacentHTML('afterbegin', cardHtml);
  if (countBadge) countBadge.textContent = parseInt(countBadge.textContent || '0') + 1;

  queueEl.querySelector('.btn-claim-sim')?.addEventListener('click', (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Accepted!';
    toastSuccess('Delivery Claimed', `Accepted order ${orderId}. Initializing route navigation...`);
    renderActiveRun({
      _id: orderId,
      status: 'assigned',
      orderId: {
        patientId: { firstName: 'Patient', lastName: '(MediFlow User)' },
        deliveryAddress: { street: '124 Model Town, Ludhiana' }
      }
    });
  });
}

function renderActiveRun(run) {
  const container = document.getElementById('active-delivery-run-container');
  if (!container) return;

  const o = run.orderId || {};
  const pt = o.patientId || {};
  
  container.innerHTML = `
    <div class="card" style="padding:20px; border-radius: 20px; border: 2px solid var(--primary); background: white;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <span class="badge" style="background: var(--primary); color: white; border-radius: 10px; padding: 5px 12px; font-size: 0.6rem;">ACTIVE ORDER</span>
        <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">#${run._id.toString().slice(-6).toUpperCase()}</span>
      </div>

      <div style="display:flex; gap:15px; margin-bottom:20px;">
        <img src="https://images.unsplash.com/photo-1511174511562-5f7f18b874f8?auto=format&fit=crop&w=80&q=80" style="width:50px; height:50px; background: var(--bg-base); border-radius: 12px; object-fit:cover;">
        <div>
          <div style="font-weight:800; font-size: 1rem;">${pt.firstName || 'Patient'} ${pt.lastName || ''}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">${o.deliveryAddress?.street || 'N/A'}</div>
        </div>
      </div>

      <div style="display:flex; gap:10px; margin-bottom:5px;">
        <button class="btn btn-outline" style="flex:1; border-radius: 12px; font-size: 0.8rem;">📞 Call</button>
        <button class="btn btn-outline" style="flex:1; border-radius: 12px; font-size: 0.8rem;">💬 Chat</button>
      </div>
    </div>
  `;

  // Render maps controls
  const controlsEl = document.getElementById('delivery-action-controls');
  if (!controlsEl) return;

  if (run.status === 'assigned') {
    controlsEl.innerHTML = `<button class="btn btn-primary" id="btn-rider-pickup" style="width:100%; border-radius: 15px; height: 50px; font-weight: 800; font-size: 1rem;">📦 Confirm Pickup</button>`;
    document.getElementById('btn-rider-pickup')?.addEventListener('click', () => updateStatus('picked_up'));
  } else if (run.status === 'picked_up') {
    controlsEl.innerHTML = `<button class="btn btn-success" id="btn-rider-transit" style="width:100%; border-radius: 15px; height: 50px; font-weight: 800; font-size: 1rem; background: #10b981;">🚀 Start Navigation</button>`;
    document.getElementById('btn-rider-transit')?.addEventListener('click', () => updateStatus('in_transit'));
  } else if (run.status === 'in_transit') {
    controlsEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
        <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-align:center;">ASK PATIENT FOR OTP</div>
        <div style="display:flex; gap:10px;">
          <input class="form-input" id="delivery-otp-input" placeholder="4-digit OTP" maxlength="4" style="flex:1; text-align:center; font-size: 1.2rem; font-weight: 800; border-radius: 15px; height: 50px;"/>
          <button class="btn btn-success" id="btn-rider-complete" style="height: 50px; padding: 0 25px; border-radius: 15px; font-weight: 800; background: #10b981;">FINISH</button>
        </div>
      </div>
    `;
    document.getElementById('btn-rider-complete')?.addEventListener('click', verifyDeliveryOTP);
  }

  // Show map panel
  document.getElementById('rider-navigation-panel').classList.remove('hidden');
  setTimeout(() => setupRiderMap(run, o), 100);
}

async function updateStatus(nextStatus) {
  toastInfo('Updating status', 'Propagating update downstream...');
  try {
    await api.post('/riders/update-status', {
      deliveryId: _activeRun._id,
      status: nextStatus
    });
    toastSuccess('Status Updated', `Delivery is now marked as ${nextStatus.replace('_', ' ')}.`);
    loadRiderStats();
  } catch (err) {
    toastError('Update Failed', 'Failed to update delivery status.');
  }
}

async function verifyDeliveryOTP() {
  const otpVal = document.getElementById('delivery-otp-input')?.value;
  if (!otpVal) {
    toastError('Validation Error', 'Please input the 4-digit code provided by the patient.');
    return;
  }

  toastInfo('Verifying', 'Matching code hashes...');
  try {
    await api.post('/riders/confirm-otp', {
      deliveryId: _activeRun._id,
      otp: otpVal
    });
    toastSuccess('Delivery Confirmed', 'OTP Match! Flat earnings added to your wallet.');
    _activeRun = null;
    loadRiderStats();
    loadAvailableDeliveries();
  } catch (err) {
    toastError('OTP Match Error', err.message || 'Incorrect OTP code. Try again.');
  }
}

async function setupRiderMap(run, order) {
  const mapDiv = document.getElementById('rider-map');
  if (!mapDiv) return;

  // Pharmacy location (Ludhiana or Bengaluru default)
  let pharmacyLatLng = [30.9010, 75.8573];
  const city = order.deliveryAddress?.city?.toLowerCase() || '';
  if (city.includes('bengaluru') || city.includes('bangalore')) {
    pharmacyLatLng = [12.9716, 77.5946];
  }
  
  // Patient destination coords
  const patientLatLng = order.deliveryAddress?.coordinates 
    ? [order.deliveryAddress.coordinates.lat || 30.8850, order.deliveryAddress.coordinates.lng || 75.8400]
    : [30.8850, 75.8400];

  if (!_riderMap) {
    _riderMap = window.L.map('rider-map', {
      zoomControl: false,
      attributionControl: false
    }).setView(pharmacyLatLng, 13);

    // Google Maps Road layer for active rider navigation
    window.L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20
    }).addTo(_riderMap);
  } else {
    _riderMap.invalidateSize();
  }

  // Remove existing markers & lines
  _riderMap.eachLayer(layer => {
    if (layer instanceof window.L.Marker || layer instanceof window.L.Polyline) {
      _riderMap.removeLayer(layer);
    }
  });

  const pharmacyIcon = window.L.divIcon({ html: '🏥', className: 'rider-map-icon', iconSize: [24, 24] });
  const homeIcon = window.L.divIcon({ html: '🏠', className: 'rider-map-icon', iconSize: [24, 24] });

  window.L.marker(pharmacyLatLng, { icon: pharmacyIcon }).addTo(_riderMap);
  window.L.marker(patientLatLng, { icon: homeIcon }).addTo(_riderMap);

  // Fetch real coordinates from OpenRouteService via backend
  let routeCoords = [
    pharmacyLatLng,
    [ (pharmacyLatLng[0] + patientLatLng[0]) / 2, (pharmacyLatLng[1] + patientLatLng[1]) / 2 ],
    patientLatLng
  ];

  try {
    const res = await api.get(`/riders/route/${run._id}`);
    if (res.data && res.data.coordinates && res.data.coordinates.length > 0) {
      routeCoords = res.data.coordinates;
      console.log('[Rider Map] Loaded real route coordinates from OpenRouteService:', res.data.source);
    }
  } catch (err) {
    console.warn('[Rider Map] Failed to fetch driving route, using fallback polyline:', err);
  }

  _riderRouteLine = window.L.polyline(routeCoords, { color: '#6366f1', weight: 4, opacity: 0.8, dashArray: '8, 8' }).addTo(_riderMap);
  _riderMap.fitBounds(_riderRouteLine.getBounds(), { padding: [15, 15] });
}
