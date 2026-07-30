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
            <span>🌤️ Vehicle Telemetry</span>
          </span>
          <span style="font-size:0.68rem; background:rgba(16,185,129,0.15); color:#10b981; padding:2px 8px; border-radius:99px; font-weight:700;" id="gps-pulse">
            ● GPS ACTIVE
          </span>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.72rem;">
          <div style="background:var(--bg-base); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="color:var(--text-muted);">Battery / Fuel</div>
            <div style="font-weight:700; color:var(--text-main); margin-top:2px; display:flex; justify-content:space-between;">
               <span>84%</span>
               <span style="color:var(--success);">⚡ 142km left</span>
            </div>
          </div>
          <div style="background:var(--bg-base); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="color:var(--text-muted);">Cold-Chain Box</div>
            <div style="font-weight:700; color:#10b981; margin-top:2px;">+4.1°C (Safe) ❄️</div>
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
  // Always show demo stats immediately
  const runsEl = document.getElementById('rider-stat-runs');
  if (runsEl) runsEl.textContent = '7';
  const walletEl = document.getElementById('rider-stat-wallet');
  if (walletEl) walletEl.textContent = '₹1,050.00';

  try {
    const res = await api.get('/riders/stats');
    const { totalCompleted, totalEarnings, activeRuns = [] } = res.data || {};
    if (runsEl && totalCompleted) runsEl.textContent = totalCompleted;
    if (walletEl && totalEarnings) walletEl.textContent = `₹${(totalEarnings / 100).toFixed(2)}`;
    if (activeRuns && activeRuns.length > 0) {
      _activeRun = activeRuns[0];
      renderActiveRun(_activeRun);
    }
  } catch (err) {
    // Demo mode: stats already shown above
  }
}

const DEMO_DELIVERIES = [
  { _id:'del001', orderId:'ORD-8492A', patient:'Ananya Sharma', address:'12 MG Road, Indiranagar, Bengaluru', distance:'3.2 km', eta:'12 mins', priority:'high', coldChain:true, amount:450, items:2, patientPhone:'+91-98765-43210' },
  { _id:'del002', orderId:'ORD-7731B', patient:'Raj Kumar', address:'34 Koramangala Block 5, Bengaluru', distance:'5.7 km', eta:'18 mins', priority:'normal', coldChain:false, amount:280, items:3, patientPhone:'+91-98765-11122' },
  { _id:'del003', orderId:'ORD-6612C', patient:'Meena Iyer', address:'7 Whitefield Main Road, Bengaluru', distance:'8.1 km', eta:'25 mins', priority:'normal', coldChain:true, amount:920, items:5, patientPhone:'+91-98765-99900' },
];

async function loadAvailableDeliveries() {
  const queueEl = document.getElementById('available-deliveries-queue');
  if (!queueEl) return;

  let orders = [];
  try {
    const res = await api.get('/riders/queue'); // Correct endpoint from controller
    orders = res.data || [];
  } catch (err) {
    console.warn('[Rider] Failed to load real queue, using demo data');
    orders = DEMO_DELIVERIES;
  }

  const countEl = document.getElementById('queue-count');
  if (countEl) countEl.textContent = orders.length;

  if (orders.length === 0) {
    queueEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">No orders near you right now.</div>';
    return;
  }

  queueEl.innerHTML = orders.map((o, idx) => {
    const isReal = !!o.patientId;
    const orderId = isReal ? String(o._id).slice(-6).toUpperCase() : o.orderId;
    const patName = isReal ? `${o.patientId.firstName} ${o.patientId.lastName}` : o.patient;
    const addr = isReal ? o.deliveryAddress?.street : o.address;
    const amount = isReal ? 150 : o.amount;
    const priority = isReal ? (o.currentStatus === 'packed' ? 'high' : 'normal') : o.priority;
    const distance = isReal ? '3.5 km' : o.distance;
    const eta = isReal ? '12 mins' : o.eta;

    const priorityColor = priority === 'high' ? '#ef4444' : '#6366f1';
    const priorityLabel = priority === 'high' ? '🚨 URGENT' : '📦 STANDARD';

    return `
    <div class="card fade-up" style="padding:16px;border-radius:16px;border:1px solid var(--border);background:rgba(15,23,42,0.5);animation-delay:${idx*0.1}s;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-weight:800;font-size:.9rem;">${orderId}</span>
            <span style="font-size:.6rem;padding:2px 8px;background:${priorityColor}20;color:${priorityColor};border-radius:99px;font-weight:700;">${priorityLabel}</span>
          </div>
          <div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:2px;">👤 ${patName}</div>
          <div style="font-size:.75rem;color:var(--text-muted);">📍 ${addr}</div>
        </div>
        <div style="text-align:right;min-width:80px;">
          <div style="font-weight:800;color:#10b981;font-size:1.1rem;">₹${amount}</div>
          <div style="font-size:.6rem;color:var(--text-muted);">Flat payout</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <span style="font-size:.7rem;background:rgba(0,0,0,0.2);padding:4px 10px;border-radius:8px;">📏 ${distance}</span>
        <span style="font-size:.7rem;background:rgba(0,0,0,0.2);padding:4px 10px;border-radius:8px;">⏱️ ETA ~${eta}</span>
        <span style="font-size:.7rem;background:rgba(0,0,0,0.2);padding:4px 10px;border-radius:8px;">💊 ${o.items || 2} items</span>
        ${(o.coldChain || isReal) ? '<span style="font-size:.7rem;background:rgba(16,185,129,0.1);color:#10b981;padding:4px 10px;border-radius:8px;border:1px solid rgba(16,185,129,0.3);">❄️ Cold-Chain</span>' : ''}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" style="flex:.4;" onclick="window.open('tel:+9198765','_blank');import('./toast.js').then(m=>m.toastSuccess('Calling','Connecting to ${patName}...')).catch(()=>{});">📞 Call</button>
        <button class="btn btn-primary btn-sm btn-claim-del" data-id="${o._id}" data-patient="${patName}" data-addr="${addr}" style="flex:1;font-weight:700;">✅ Accept Order</button>
      </div>
    </div>`;
  }).join('');

  queueEl.querySelectorAll('.btn-claim-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.dataset.id;
      const patName = btn.dataset.patient;
      const addr = btn.dataset.addr;
      btn.textContent = '⏳ Accepting...';
      btn.disabled = true;
      setTimeout(() => {
        import('./toast.js').then(m => m.toastSuccess('Delivery Claimed! 🚀', `Accepted order for ${patName}. Navigate to pharmacy for pickup.`)).catch(() => {});
        renderActiveRun({
          _id: orderId, status: 'assigned',
          orderId: { patientId: { firstName: patName.split(' ')[0], lastName: patName.split(' ')[1]||'' }, deliveryAddress: { street: addr, city: 'Bengaluru' } }
        });
        // Animate earnings
        const walletEl = document.getElementById('rider-stat-wallet');
        if (walletEl) walletEl.textContent = '₹1,250.00';
        const runsEl = document.getElementById('rider-stat-runs');
        if (runsEl) runsEl.textContent = '8';
      }, 1200);
    });
  });
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
        <div style="display:flex; gap:10px;">
           <button class="btn btn-primary" id="btn-rider-ar" style="flex:1; border-radius: 15px; height: 50px; font-weight: 800; font-size: 1rem; background: #6366f1; border:none;"><span style="font-size:1.2rem;">👓</span> AR View</button>
           <button class="btn btn-outline" id="btn-rider-complete-prompt" style="flex:1; border-radius: 15px; height: 50px; font-weight: 800; font-size: 1rem;">Verify</button>
        </div>
        <div id="otp-container" class="hidden" style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
          <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-align:center;">ASK PATIENT FOR OTP</div>
          <div style="display:flex; gap:10px;">
            <input class="form-input" id="delivery-otp-input" placeholder="4-digit OTP" maxlength="4" style="flex:1; text-align:center; font-size: 1.2rem; font-weight: 800; border-radius: 15px; height: 50px;"/>
            <button class="btn btn-success" id="btn-rider-complete" style="height: 50px; padding: 0 25px; border-radius: 15px; font-weight: 800; background: #10b981;">FINISH</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('btn-rider-complete-prompt')?.addEventListener('click', () => {
       document.getElementById('otp-container').classList.remove('hidden');
    });
    document.getElementById('btn-rider-complete')?.addEventListener('click', verifyDeliveryOTP);
    document.getElementById('btn-rider-ar')?.addEventListener('click', startARNavigation);
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

let arStream = null;

async function startARNavigation() {
  const mapDiv = document.getElementById('rider-map');
  if (!mapDiv) return;

  // Create AR overlay
  let arOverlay = document.getElementById('ar-navigation-overlay');
  if (!arOverlay) {
    arOverlay = document.createElement('div');
    arOverlay.id = 'ar-navigation-overlay';
    arOverlay.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:1000; background:#000; display:flex; justify-content:center; align-items:center; overflow:hidden; border-radius:15px;';
    
    arOverlay.innerHTML = `
      <video id="ar-video" autoplay playsinline muted style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; opacity:0.8;"></video>
      
      <!-- Virtual HUD Overlay -->
      <div style="position:absolute; top:20px; left:20px; right:20px; display:flex; justify-content:space-between; align-items:flex-start; pointer-events:none;">
         <div style="background:rgba(0,0,0,0.6); padding:10px; border-radius:12px; border:1px solid #10b981; color:white; backdrop-filter:blur(4px);">
            <div style="font-size:0.7rem; color:#10b981; font-weight:800;">AR ACTIVE</div>
            <div style="font-size:1.1rem; font-weight:800; margin-top:4px;">150m ahead</div>
            <div style="font-size:0.8rem; opacity:0.8;">Turn Left</div>
         </div>
         <button id="btn-close-ar" style="pointer-events:auto; background:rgba(239,68,68,0.8); color:white; border:none; padding:8px 15px; border-radius:99px; font-weight:800; cursor:pointer;">✕ CLOSE</button>
      </div>

      <!-- AR Floating Arrow Simulation -->
      <div id="ar-direction-arrow" style="position:absolute; z-index:10; transition: transform 0.3s; animation: float 2s infinite ease-in-out;">
         <div style="font-size: 6rem; filter: drop-shadow(0 0 20px rgba(16,185,129,0.8)); opacity:0.9; transform: perspective(500px) rotateX(45deg);">⬆️</div>
      </div>
      
      <!-- AR Destination Pin Simulation -->
      <div id="ar-destination-pin" style="position:absolute; z-index:10; top:40%; transition: transform 0.3s;">
         <div style="font-size: 3rem; filter: drop-shadow(0 0 15px rgba(99,102,241,0.8));">📍</div>
         <div style="background:rgba(99,102,241,0.8); color:white; font-size:0.7rem; padding:4px 8px; border-radius:8px; font-weight:800; text-align:center; margin-top:5px; backdrop-filter:blur(4px);">Patient House<br/>12m</div>
      </div>
    `;
    mapDiv.appendChild(arOverlay);

    // Add float animation to DOM if not present
    if (!document.getElementById('ar-styles')) {
       const style = document.createElement('style');
       style.id = 'ar-styles';
       style.innerHTML = `@keyframes float { 0% { transform: translateY(0px) perspective(500px) rotateX(45deg); } 50% { transform: translateY(-20px) perspective(500px) rotateX(45deg); } 100% { transform: translateY(0px) perspective(500px) rotateX(45deg); } }`;
       document.head.appendChild(style);
    }
  }

  arOverlay.classList.remove('hidden');

  const video = document.getElementById('ar-video');
  const closeBtn = document.getElementById('btn-close-ar');

  closeBtn.onclick = () => {
     if (arStream) {
        arStream.getTracks().forEach(track => track.stop());
     }
     arOverlay.classList.add('hidden');
  };

  try {
    arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = arStream;
    toastSuccess('AR Navigation', 'Live environment mapping started.');
    
    // Simulate AR movement
    let angle = 0;
    const arrow = document.getElementById('ar-direction-arrow');
    const dest = document.getElementById('ar-destination-pin');
    
    const arInterval = setInterval(() => {
       if (arOverlay.classList.contains('hidden')) {
          clearInterval(arInterval);
          return;
       }
       angle += 0.05;
       if (arrow) {
         arrow.style.left = `calc(50% + ${Math.sin(angle)*30}px - 3rem)`;
         arrow.style.bottom = `calc(20% + ${Math.cos(angle)*10}px)`;
       }
       if (dest) {
         dest.style.left = `calc(50% + ${Math.sin(angle*0.5)*50}px - 1.5rem)`;
       }
    }, 50);
  } catch (err) {
    console.warn("Camera access denied or unavailable", err);
    toastError('Camera Error', 'Could not access camera for AR view. Simulating view.');
    // Simulated background if camera fails
    video.style.background = 'linear-gradient(to bottom, #1e293b, #0f172a)';
  }
}
