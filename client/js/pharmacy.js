/**
 * pharmacy.js — E-Pharmacy module with medicine search, cart, and order routing.
 */
import * as api from './api.js';
import { cartAdd, cartRemove, cartClear, cartTotal, getState, setState, subscribe } from './store.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';
import { startRealDeliveryTracking } from './drone-tracker.js';
import { reverseGeocode } from './location-intelligence.js';

const DEMO_MEDICINES = [
  { _id:'m1', name:'Paracetamol', genericName:'Acetaminophen', brand:'Calpol', price:1500, category:'otc',          requiresPrescription:false, dosageForms:['tablet'], emoji:'💊', images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m2', name:'Amoxicillin', genericName:'Amoxicillin',  brand:'Mox',    price:8500, category:'prescription',   requiresPrescription:true,  dosageForms:['capsule'], emoji:'💉', images: ['https://images.unsplash.com/photo-1550572017-edb79a558509?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m3', name:'Metformin',   genericName:'Metformin',     brand:'Glycomet',price:4200,category:'prescription',  requiresPrescription:true,  dosageForms:['tablet'], emoji:'🟡', images: ['https://images.unsplash.com/photo-1576091160550-2173bdd99625?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m4', name:'Cough Syrup', genericName:'Dextromethorphan', brand:'Vicks', price:2800, category:'otc', requiresPrescription:false, dosageForms:['syrup'], emoji:'🔵', images: ['https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m5', name:'Omeprazole',  genericName:'Omeprazole',    brand:'Prilosec',price:5500,category:'prescription',  requiresPrescription:true,  dosageForms:['capsule'],emoji:'🔴', images: ['https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m6', name:'Vitamin D3',  genericName:'Cholecalciferol',brand:'D-Rise',price:3200,category:'otc',            requiresPrescription:false, dosageForms:['capsule'],emoji:'☀️', images: ['https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m7', name:'Ibuprofen',   genericName:'Ibuprofen',     brand:'Brufen', price:2200, category:'otc',           requiresPrescription:false, dosageForms:['tablet'], emoji:'🟠', images: ['https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m8', name:'Atorvastatin',genericName:'Atorvastatin',  brand:'Lipitor',price:9800, category:'prescription',  requiresPrescription:true,  dosageForms:['tablet'], emoji:'🟣', images: ['https://images.unsplash.com/photo-1550572017-edb79a558509?auto=format&fit=crop&w=400&q=80'] },
];

let allMedicines = [];
let debounceTimer;
let _currentOrderCoords = null;
let _pickerMap = null;
let _pickerMarker = null;

export function initPharmacy() {
  loadMedicines();
  bindSearch();
  bindCart();
  bindRxUpload();
  bindSnapToCart(); // New
  subscribe('cart', renderCartBadge);
  renderCartBadge(getState('cart') || []);

  // Listen for prescriptions issued by Doctor in Doctor Tools
  window.addEventListener('mf:prescription-issued', (e) => {
    const rx = e.detail;
    if (rx && rx.medications) {
      toastInfo('📋 Prescription Received', `Doctor issued Rx for ${rx.patientName || 'Patient'} (${rx.medications.length} items)`);
      // Auto match prescription items into cart
      rx.medications.forEach(mItem => {
        const foundMed = allMedicines.find(m => m.name.toLowerCase().includes(mItem.name.toLowerCase()));
        if (foundMed) cartAdd(foundMed);
      });
      renderCartBadge(getState('cart') || []);
    }
  });

  // If pharmacist, load inventory and cold-chain telemetry
  const user = getState('user');
  if (user?.role === 'pharmacist') {
    loadInventory();
    renderPharmacistColdChainWidget();
  }
}

function renderPharmacistColdChainWidget() {
  const container = document.querySelector('#page-pharmacy .container') || document.getElementById('dash-pharmacist');
  if (!container || document.getElementById('pharmacist-coldchain-panel')) return;

  const widget = document.createElement('div');
  widget.id = 'pharmacist-coldchain-panel';
  widget.className = 'card fade-up';
  widget.style.cssText = 'margin-bottom: 25px; padding: 20px; background: var(--glass-1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 16px;';
  widget.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px; flex-wrap:wrap; gap:10px;">
      <h3 style="font-size: 1.1rem; font-weight: 800; color: #10b981; display:flex; align-items:center; gap:8px;">
        <span>❄️ Cold-Chain Telemetry & AI Reorder Hub</span>
      </h3>
      <span style="font-size: 0.72rem; padding: 3px 10px; background: rgba(16,185,129,0.15); color: #10b981; border-radius: 99px; font-weight: 700;">
        ● WHO Cold Chain Certified
      </span>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
      <div style="background: var(--bg-base); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Vaccine Fridge Unit #1</div>
        <div style="font-size: 1.4rem; font-weight: 800; color: #10b981;">+2.8°C <span style="font-size:0.75rem; font-weight:600;">(Target 2-8°C)</span></div>
        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Status: Optimal Range ✅</div>
      </div>
      <div style="background: var(--bg-base); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Insulin Storage Unit #2</div>
        <div style="font-size: 1.4rem; font-weight: 800; color: #10b981;">+3.1°C <span style="font-size:0.75rem; font-weight:600;">(Target 2-8°C)</span></div>
        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Humidity: 44% RH (Optimal)</div>
      </div>
      <div style="background: var(--bg-base); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">🤖 AI Reorder Predictor</div>
        <div style="font-size: 0.85rem; font-weight: 700; color: #f59e0b;">Paracetamol & Amoxicillin</div>
        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Predicted Out of Stock in 36h ⚡</div>
      </div>
      <div style="background: var(--bg-base); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">🚁 Active Drone Fleet</div>
        <div style="font-size: 1.4rem; font-weight: 800; color: #6366f1;">2 Drones Ready</div>
        <div style="font-size: 0.7rem; color: #6366f1; margin-top: 4px;">Battery 98% · 3D A* Pre-flight Passed</div>
      </div>
    </div>

    <div style="background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); border-radius: 10px; padding: 10px 15px; font-size: 0.78rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <span>💡 <b>AI Stock Forecast:</b> High demand expected for Seasonal Antihistamines over next 48h.</span>
      <button class="btn btn-sm btn-primary" onclick="window.MediFlowToast?.toastSuccess('Auto-Reorder Dispatched', 'Sun Pharma Hub order #SP-8839 placed via API')">Trigger Auto-Reorder</button>
    </div>
  `;

  container.insertBefore(widget, container.firstChild);
}

function bindRxUpload() {
  const btn = document.getElementById('btn-upload-rx');
  const modal = document.getElementById('rx-upload-modal');
  const closeBtn = document.getElementById('close-rx-upload');
  const dropzone = document.getElementById('rx-dropzone');
  const fileInput = document.getElementById('rx-file-input');

  if (!btn) return;

  btn.addEventListener('click', () => {
    const user = getState('user');
    if (!user) { window.dispatchEvent(new Event('mf:need-auth')); return; }
    modal.classList.remove('hidden');
    resetOCRUI();
  });

  closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));

  dropzone?.addEventListener('click', () => fileInput.click());

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleRxOCR(e.target.files[0]);
    }
  });

  document.getElementById('btn-add-all-rx')?.addEventListener('click', () => {
     const items = document.querySelectorAll('.rx-ocr-item.matched');
     items.forEach(el => {
        const id = el.dataset.id;
        const med = allMedicines.find(m => m._id === id);
        if (med) cartAdd(med);
     });
     toastSuccess('Added to Cart', `${items.length} medicines extracted from Rx added.`);
     modal.classList.add('hidden');
  });
}

function bindSnapToCart() {
  const btn = document.getElementById('btn-scan-cabinet');
  const modal = document.getElementById('snap-cart-modal');
  const closeBtn = document.getElementById('close-snap-cart');
  const dropzone = document.getElementById('snap-dropzone');
  const fileInput = document.getElementById('snap-file-input');

  if (!btn) return;

  btn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    resetSnapUI();
  });

  closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
  dropzone?.addEventListener('click', () => fileInput.click());

  fileInput?.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      handleSnapVision(file);
    }
  });
}

function resetSnapUI() {
  document.getElementById('snap-dropzone').classList.remove('hidden');
  document.getElementById('snap-loading').classList.add('hidden');
  document.getElementById('snap-results').classList.add('hidden');
}

async function handleSnapVision(file) {
  const dropzone = document.getElementById('snap-dropzone');
  const loading = document.getElementById('snap-loading');
  const results = document.getElementById('snap-results');
  const list = document.getElementById('snap-item-list');

  dropzone.classList.add('hidden');
  loading.classList.remove('hidden');

  try {
    // Convert to base64 for vision API
    const reader = new FileReader();
    const base64Promise = new Promise((resolve) => {
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    const base64 = await base64Promise;

    // Call Gemini 1.5 Flash Vision
    const res = await api.post('/chat/medibot', {
      message: "Identify all medicines in this image. Return a JSON array of names.",
      context: { image: base64, type: 'vision' }
    });

    loading.classList.add('hidden');
    results.classList.remove('hidden');

    // Simulate identified items for demo if API returns generic response
    const identified = ['Paracetamol', 'Metformin', 'Omeprazole'];
    const matched = allMedicines.filter(m =>
      identified.some(name => m.name.toLowerCase().includes(name.toLowerCase()))
    );

    list.innerHTML = matched.map(m => `
      <div class="snap-result-item card" data-id="${m._id}" style="padding:12px; display:flex; justify-content:space-between; align-items:center; border-left:4px solid var(--accent);">
        <div style="display:flex; align-items:center; gap:12px;">
           <img src="${m.images[0]}" style="width:40px; height:40px; border-radius:6px; object-fit:cover;" />
           <div>
              <div style="font-weight:700; font-size:0.85rem;">${m.name}</div>
              <div style="font-size:0.7rem; color:var(--text-muted);">${m.brand}</div>
           </div>
        </div>
        <span class="badge" style="background:rgba(99,102,241,0.1); color:var(--accent);">98% Match</span>
      </div>
    `).join('');

    document.getElementById('btn-add-snapped').onclick = () => {
      matched.forEach(m => cartAdd(m));
      toastSuccess('Success', 'Identified items added to cart.');
      modal.classList.add('hidden');
    };

  } catch (err) {
    toastError('Vision AI Failed', 'Could not process image.');
    resetSnapUI();
  }
}

async function handleRxOCR(file) {
  const dropzone = document.getElementById('rx-dropzone');
  const loading = document.getElementById('rx-ocr-loading');
  const results = document.getElementById('rx-ocr-results');
  const list = document.getElementById('rx-medicine-list');

  dropzone.classList.add('hidden');
  loading.classList.remove('hidden');

  // Simulate AI Processing delay
  setTimeout(() => {
    loading.classList.add('hidden');
    results.classList.remove('hidden');

    // Simulated OCR matches
    const extractedNames = ['Amoxicillin', 'Paracetamol', 'Cetirizine'];
    const matched = [];

    extractedNames.forEach(name => {
       const found = allMedicines.find(m => m.name.toLowerCase().includes(name.toLowerCase()));
       if (found) matched.push(found);
    });

    list.innerHTML = matched.map(m => `
      <div class="rx-ocr-item matched card" data-id="${m._id}" style="padding:10px; display:flex; justify-content:space-between; align-items:center; background:rgba(16,185,129,0.05); border-color:rgba(16,185,129,0.2);">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.2rem;">💊</span>
          <div>
            <div style="font-weight:700; font-size:0.85rem;">${m.name}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary);">${m.brand}</div>
            <div style="font-size:0.75rem; margin-top:4px; display:flex; gap:6px;">
              <span class="badge" title="Morning Dose" style="background:rgba(234,179,8,0.15); color:#eab308;">☀️ Morning</span>
              <span class="badge" title="Night Dose" style="background:rgba(99,102,241,0.15); color:#6366f1;">🌙 Night</span>
              <span class="badge" title="After Meal" style="background:rgba(34,197,94,0.15); color:#22c55e;">🍽️ After Food</span>
            </div>
          </div>
        </div>
        <span class="badge badge-routine" style="font-size:0.6rem;">VERIFIED</span>
      </div>
    `).join('');

    if (matched.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No matching medicines found in our database.</div>';
    }
  }, 2500);
}

function openAddressPicker() {
  const modal = document.getElementById('address-picker-modal');
  modal.classList.remove('hidden');

  const lat = 12.9716, lng = 77.5946; // Bengaluru default

  if (!_pickerMap) {
    _pickerMap = window.L.map('address-picker-map').setView([lat, lng], 15);
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19
    }).addTo(_pickerMap);

    // Center crosshair marker (fixed in middle of map)
    const icon = window.L.divIcon({
      html: '<div style="font-size:2rem; margin-top:-16px; margin-left:-8px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">📍</div>',
      className: 'picker-pin'
    });
    _pickerMarker = window.L.marker(_pickerMap.getCenter(), { icon, interactive: false }).addTo(_pickerMap);

    _pickerMap.on('move', () => {
      _pickerMarker.setLatLng(_pickerMap.getCenter());
    });

    _pickerMap.on('moveend', async () => {
      const center = _pickerMap.getCenter();
      const addrEl = document.getElementById('picker-detected-address');
      addrEl.textContent = 'Identifying location...';
      const details = await reverseGeocode(center.lat, center.lng);
      if (details) {
        addrEl.textContent = details.display_name;
      } else {
        addrEl.textContent = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
      }
    });

    document.getElementById('btn-confirm-address').addEventListener('click', () => {
      const center = _pickerMap.getCenter();
      const displayAddr = document.getElementById('picker-detected-address').textContent;
      const label = document.getElementById('picker-address-label').value.trim() || 'Other';

      document.getElementById('checkout-address').value = displayAddr;
      _currentOrderCoords = { lat: center.lat, lng: center.lng };

      // Save to store
      const saved = getState('addresses') || [];
      const newAddr = {
        id: 'addr_' + Date.now(),
        label: label,
        fullAddress: displayAddr,
        coordinates: _currentOrderCoords
      };
      setState('addresses', [newAddr, ...saved.slice(0, 4)]); // Keep last 5

      modal.classList.add('hidden');
      toastSuccess('Address Set 📍', `Delivery point pinned to ${label}`);
    });
  } else {
    setTimeout(() => _pickerMap.invalidateSize(), 100);
  }
}

async function loadInventory() {
  const list = document.getElementById('inventory-list');
  if (!list) return;

  const DEMO_INVENTORY = [
    { _id:'inv001', name:'Paracetamol 500mg', brand:'Calpol', stock:2400, minStock:500, category:'OTC', unit:'tablets', status:'ok', coldChain:false, trend:'+12%' },
    { _id:'inv002', name:'Amoxicillin 500mg', brand:'Mox', stock:342, minStock:400, category:'Prescription', unit:'capsules', status:'low', coldChain:false, trend:'-8%' },
    { _id:'inv003', name:'Metformin 500mg', brand:'Glycomet', stock:1860, minStock:300, category:'Prescription', unit:'tablets', status:'ok', coldChain:false, trend:'+5%' },
    { _id:'inv004', name:'Insulin Glargine 100IU', brand:'Lantus', stock:48, minStock:100, category:'Prescription', unit:'vials', status:'critical', coldChain:true, trend:'-22%' },
    { _id:'inv005', name:'Atorvastatin 10mg', brand:'Lipitor', stock:920, minStock:200, category:'Prescription', unit:'tablets', status:'ok', coldChain:false, trend:'+3%' },
    { _id:'inv006', name:'COVID Vaccine (Covishield)', brand:'AstraZeneca', stock:210, minStock:50, category:'Vaccine', unit:'doses', status:'ok', coldChain:true, trend:'+18%' },
  ];

  let items = DEMO_INVENTORY;
  try {
    const res = await api.get('/inventory');
    if (res.data && res.data.length > 0) items = res.data;
  } catch {}

  renderInventory(items);
}

function renderInventory(items) {
  const list = document.getElementById('inventory-list');
  if (!list) return;

  if (!items || items.length === 0) {
    list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">No inventory records found.</div>';
    return;
  }

  const STATUS_CONFIG = {
    ok: { color:'#10b981', label:'In Stock', icon:'✅' },
    low: { color:'#f59e0b', label:'Low Stock', icon:'⚠️' },
    critical: { color:'#ef4444', label:'CRITICAL', icon:'🚨' },
  };

  list.innerHTML = items.map((item, idx) => {
    const name = item.name || item.medicineId?.name || 'Unknown';
    const brand = item.brand || item.medicineId?.brand || '';
    const stock = item.stock ?? 0;
    const minStock = item.minStock ?? item.reorderLevel ?? 50;
    const stockStatus = stock <= 0 ? 'critical' : stock < minStock ? 'low' : 'ok';
    const conf = STATUS_CONFIG[item.status || stockStatus];
    const predictedDemand = Math.floor(stock * 0.3) + 20;
    const riskPct = Math.min(100, Math.round((stock / Math.max(1, minStock)) * 100));
    const trend = item.trend || (stockStatus === 'ok' ? '+5%' : '-12%');
    const trendColor = trend.startsWith('+') ? '#10b981' : '#ef4444';

    return `
    <div class="card fade-up" style="padding:18px;border-left:4px solid ${conf.color};animation-delay:${idx*0.08}s;background:rgba(15,23,42,0.5);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <div style="font-weight:700;font-size:.95rem;">${name}</div>
            ${item.coldChain ? '<span style="font-size:.65rem;padding:2px 7px;background:rgba(16,185,129,0.15);color:#10b981;border-radius:99px;border:1px solid rgba(16,185,129,0.3);">\u2744\ufe0f Cold-Chain</span>' : ''}
          </div>
          <div style="font-size:.75rem;color:var(--text-muted);">${brand} · ${item.category || 'General'} · ${item.unit || 'units'}</div>
        </div>
        <div style="text-align:right;">
          <span style="font-size:.65rem;padding:3px 9px;background:${conf.color}15;color:${conf.color};border-radius:99px;font-weight:700;">${conf.icon} ${conf.label}</span>
        </div>
      </div>

      <!-- Stock bar -->
      <div style="margin:10px 0;">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:4px;">
          <span style="color:var(--text-muted);">Stock Level</span>
          <span style="font-weight:700;color:${conf.color};">${stock.toLocaleString()} / ${minStock.toLocaleString()} min</span>
        </div>
        <div style="background:rgba(255,255,255,0.05);border-radius:4px;height:8px;">
          <div style="height:8px;border-radius:4px;background:${conf.color};width:${Math.min(100, riskPct)}%;transition:width 1s ease;"></div>
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;align-items:center;">
        <div style="font-size:.7rem;color:var(--text-muted);">🔮 AI Forecast: ~${predictedDemand}/week</div>
        <div style="font-size:.7rem;color:${trendColor};font-weight:700;">📈 ${trend} demand</div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-outline btn-sm" style="font-size:.65rem;padding:3px 8px;" onclick="import('./toast.js').then(m=>m.toastSuccess('Reorder Sent','Purchase order placed for ${name.replace(/'/g, '')}')).catch(()=>{})">📦 Reorder</button>
          ${item.coldChain ? '<button class="btn btn-outline btn-sm" style="font-size:.65rem;padding:3px 8px;color:#10b981;border-color:#10b981;" onclick="import(\"./toast.js\").then(m=>m.toastInfo(\"Cold-Chain\",\"Temp: +3.1\u00b0C | Humidity: 44% RH | Status: OK\")).catch(()=>{})">❄️ Temp Log</button>' : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function loadMedicines() {
  const grid = document.getElementById('medicine-grid');
  // Show skeleton loaders
  if (grid) {
    grid.innerHTML = Array(8).fill(
      `<div class="medicine-card skeleton" style="height: 280px;"></div>`
    ).join('');
  }
  try {
    const res = await api.get('/pharmacy/medicines?limit=20');
    allMedicines = res.data?.length ? res.data : DEMO_MEDICINES;
    // Map backend response to ensure images are present
    allMedicines = allMedicines.map(m => {
       const media = getMedicineMedia(m);
       return { ...m, images: [media.image] };
    });
  } catch {
    allMedicines = DEMO_MEDICINES; // Offline catalogue fallback
  }
  renderGrid(allMedicines);
}

function getMedicineMedia(m) {
  const name = (m.name || '').toLowerCase();
  const brand = (m.brand || '').toLowerCase();
  const generic = (m.genericName || m.generic || '').toLowerCase();
  
  if (name.includes('paracetamol') || brand.includes('calpol') || generic.includes('acetaminophen')) {
    return { image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80', emoji: '💊' };
  }
  if (name.includes('amoxicillin') || brand.includes('mox') || name.includes('azithromycin')) {
    return { image: 'https://images.unsplash.com/photo-1550572017-edb79a558509?auto=format&fit=crop&w=400&q=80', emoji: '💉' };
  }
  if (name.includes('cough') || name.includes('syrup') || brand.includes('vicks')) {
    return { image: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&w=400&q=80', emoji: '🔵' };
  }
  if (name.includes('metformin') || generic.includes('metformin') || name.includes('glycomet')) {
    return { image: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&w=400&q=80', emoji: '🟡' };
  }
  if (name.includes('omeprazole') || generic.includes('omeprazole')) {
    return { image: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=400&q=80', emoji: '🔴' };
  }
  if (name.includes('vitamin d3') || generic.includes('cholecalciferol') || name.includes('vitamin d')) {
    return { image: 'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?auto=format&fit=crop&w=400&q=80', emoji: '☀️' };
  }
  if (name.includes('ibuprofen') || generic.includes('ibuprofen') || brand.includes('brufen')) {
    return { image: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&w=400&q=80', emoji: '🟠' };
  }
  if (name.includes('atorvastatin') || generic.includes('atorvastatin') || brand.includes('lipitor')) {
    return { image: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&w=400&q=80', emoji: '🟣' };
  }

  // Check if existing image is valid HTTP/HTTPS URL
  const existing = m.images && m.images.length > 0 ? m.images[0] : '';
  const isValidUrl = existing && (existing.startsWith('http://') || existing.startsWith('https://') || existing.startsWith('data:image'));

  return {
    image: isValidUrl ? existing : 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
    emoji: m.emoji || '💊'
  };
}

function renderGrid(medicines) {
  const grid  = document.getElementById('medicine-grid');
  const empty = document.getElementById('pharmacy-empty');
  if (!medicines.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = medicines.map(m => {
    const media = getMedicineMedia(m);
    const cartItem = getState('cart').find(i => i.medicine._id === m._id);
    const inCart = !!cartItem;
    const qty = cartItem?.quantity || 0;
    const mediaHtml = media.image
      ? `<img src="${media.image}" alt="${m.name}" class="med-photo" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80'" />`
      : `<div class="med-emoji">${media.emoji}</div>`;

    const addBtn = inCart
      ? `<div class="qty-stepper" data-id="${m._id}">
           <button class="qty-btn qty-dec" data-id="${m._id}">−</button>
           <span class="qty-val">${qty}</span>
           <button class="qty-btn qty-inc" data-id="${m._id}">+</button>
         </div>`
      : `<button class="btn btn-primary btn-sm add-to-cart" data-id="${m._id}" style="width:100%;">+ Add to Cart</button>`;

    const riskBadge = m.isHighRisk ? '<span class="badge badge-danger" style="font-size:0.55rem; background:rgba(239,68,68,0.1); color:#ef4444;">⚠️ HEAVY MEDICINE</span>' : '';

    return `
    <div class="medicine-card fade-up" data-id="${m._id}">
      <div class="med-media-container">${mediaHtml}</div>
      <div style="min-height:45px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
           <div class="med-name">${m.name}</div>
           <button class="btn-hear-rx" data-name="${m.name}" data-brand="${m.brand}" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">🔊</button>
           ${riskBadge}
        </div>
        <div class="med-generic">${m.genericName || m.generic || ''} &middot; ${m.brand || m.manufacturer || ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <span class="badge ${m.category === 'otc' ? 'badge-routine' : 'badge-primary'}">${m.category.toUpperCase()}</span>
        ${(m.requiresPrescription || m.isHighRisk) ? '<span class="badge badge-urgent">Rx Required</span>' : ''}
      </div>
      <div class="med-price">₹${(m.price / 100).toFixed(2)}</div>
      ${addBtn}
    </div>`;
  }).join('');

  // Add to cart buttons
  grid.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      const med = medicines.find(m => m._id === btn.dataset.id);
      if (!med) return;
      cartAdd(med);
      toastSuccess('Added to cart', med.name);
      renderGrid(medicines); // re-render to show stepper
    });
  });

  // Qty stepper buttons
  grid.querySelectorAll('.qty-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const med = medicines.find(m => m._id === btn.dataset.id);
      if (med) { cartAdd(med); renderGrid(medicines); }
    });
  });
  grid.querySelectorAll('.qty-dec').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const cartItem = getState('cart').find(i => i.medicine._id === id);
      if (!cartItem) return;
      if (cartItem.quantity <= 1) {
        cartRemove(id);
        toastInfo('Removed', 'Item removed from cart');
      } else {
        // Decrement: remove and re-add with qty-1
        cartRemove(id);
        const med = medicines.find(m => m._id === id);
        for (let i = 0; i < cartItem.quantity - 1; i++) cartAdd(med);
      }
      renderGrid(medicines);
    });
  });

  // Hear Instructions
  grid.querySelectorAll('.btn-hear-rx').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const brand = btn.dataset.brand;
      const med = medicines.find(m => m.name === name);
      const msg = med?.requiresPrescription
        ? `This is ${name}, also known as ${brand}. It is a prescription medicine. Please consult a doctor for dosage.`
        : `This is ${name}. You can take this for common relief. Follow the pack instructions.`;

      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(msg);
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }
    });
  });
}

function bindSearch() {
  const searchInput = document.getElementById('med-search');
  const catFilter   = document.getElementById('med-category');
  const doFilter = () => {
    const q   = searchInput.value.trim().toLowerCase();
    const cat = catFilter.value;
    const filtered = allMedicines.filter(m =>
      (!q   || m.name.toLowerCase().includes(q) || (m.genericName || '').toLowerCase().includes(q)) &&
      (!cat || m.category === cat)
    );
    renderGrid(filtered);
  };
  searchInput.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(doFilter, 250); });
  catFilter.addEventListener('change', doFilter);
}

function renderCartBadge(cart) {
  const badge    = document.getElementById('cart-badge');
  const countEl  = document.getElementById('cart-count');
  const totalEl  = document.getElementById('cart-total');
  if (!cart.length) { badge.classList.add('hidden'); return; }
  badge.classList.remove('hidden');
  countEl.textContent = `${cart.reduce((s,i) => s + i.quantity, 0)} item${cart.length > 1 ? 's' : ''}`;
  totalEl.textContent = `₹${(cartTotal() / 100).toFixed(2)}`;
}

function bindCart() {
  document.getElementById('cart-badge')?.addEventListener('click', openCheckout);
  
  // Checkout UI bindings
  document.getElementById('close-checkout')?.addEventListener('click', () => {
    document.getElementById('checkout-modal').classList.add('hidden');
  });

  document.getElementById('btn-open-map-picker')?.addEventListener('click', openAddressPicker);
  document.getElementById('close-address-picker')?.addEventListener('click', () => {
    document.getElementById('address-picker-modal').classList.add('hidden');
  });

  // Saved addresses listener
  document.getElementById('checkout-saved-addresses')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      const addr = getState('addresses').find(a => a.id === val);
      if (addr) {
        document.getElementById('checkout-address').value = addr.fullAddress;
        _currentOrderCoords = addr.coordinates;
      }
    }
  });

  // Subscription Toggle Toast
  document.getElementById('chk-subscribe-save')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      toastSuccess('Subscription Active 🔁', '15% discount will be applied to this recurring order.');
    }
  });

  // Payment method selection
  const grid = document.getElementById('payment-methods-grid');
  const hiddenInput = document.getElementById('checkout-payment');
  const appsContainer = document.getElementById('popular-apps-container');

  grid?.querySelectorAll('.payment-method-card').forEach(card => {
    card.addEventListener('click', () => {
      grid.querySelectorAll('.payment-method-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const val = card.dataset.value;
      hiddenInput.value = val;

      if (val === 'upi') {
        appsContainer?.classList.remove('hidden');
      } else {
        appsContainer?.classList.add('hidden');
      }
    });
  });
  
  document.getElementById('checkout-form')?.addEventListener('submit', handlePayment);
}

async function openCheckout() {
  const cart = getState('cart');
  if (!cart.length) {
    toastInfo('Cart is Empty', 'Add some medicines before checking out.');
    return;
  }
  const user = getState('user');
  if (!user) { window.dispatchEvent(new Event('mf:need-auth')); return; }

  // Load saved addresses into dropdown
  const savedAddrs = getState('addresses') || [];
  const addrSelect = document.getElementById('checkout-saved-addresses');
  if (addrSelect) {
    addrSelect.innerHTML = '<option value="">-- Saved --</option>' +
      savedAddrs.map(a => `<option value="${a.id}">${a.label}</option>`).join('');
  }

  // Check if any medicine in cart requires a prescription
  const rxRequired = cart.some(i => i.medicine.requiresPrescription || i.medicine.isHighRisk);
  const rxSection = document.getElementById('checkout-rx-section');
  const rxSelect  = document.getElementById('checkout-rx-select');

  if (rxRequired) {
    rxSection?.classList.remove('hidden');
    // Fetch active prescriptions
    try {
      const res = await api.get('/prescriptions?status=active');
      const prescriptions = res.data || [];
      if (rxSelect) {
        rxSelect.innerHTML = '<option value="">-- Select Active Prescription --</option>' +
          prescriptions.map(p => {
             const date = new Date(p.createdAt).toLocaleDateString();
             const remaining = (p.maxUsageCount || 1) - (p.usedCount || 0);
             return `<option value="${p._id}">Rx Issued: ${date} (${remaining} refills left)</option>`;
          }).join('');
      }
    } catch (err) {
      console.error('Failed to load prescriptions', err);
    }
  } else {
    rxSection?.classList.add('hidden');
  }

  // Update modal totals
  const total = (cartTotal() / 100).toFixed(2);
  document.getElementById('checkout-subtotal').textContent = `₹${total}`;
  document.getElementById('checkout-total').textContent = `₹${total}`;

  // Render cart items summary
  const itemsEl = document.getElementById('checkout-items-list');
  if (itemsEl) {
    itemsEl.innerHTML = cart.map(i => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:.9rem;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${i.medicine.images?.[0] ? `<img src="${i.medicine.images[0]}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;">` : '<span style="font-size:1.4rem;">💊</span>'}
          <div>
            <div style="font-weight:600;">${i.medicine.name}</div>
            <div style="color:var(--text-secondary);font-size:.8rem;">${i.medicine.brand || ''} &times; ${i.quantity}</div>
          </div>
        </div>
        <div style="font-weight:700;">₹${((i.medicine.price * i.quantity)/100).toFixed(2)}</div>
      </div>`).join('');
  }

  // Show modal
  document.getElementById('checkout-modal').classList.remove('hidden');
}

async function handlePayment(e) {
  e.preventDefault();
  
  const addressInput = document.getElementById('checkout-address');
  const paymentInput = document.getElementById('checkout-payment');
  const rxSelect = document.getElementById('checkout-rx-select');
  const rxSection = document.getElementById('checkout-rx-section');
  const isSubscribed = document.getElementById('chk-subscribe-save')?.checked || false;

  const addressVal = addressInput?.value.trim() || '100 Feet Rd, Indiranagar, Bengaluru';

  // Prescription validation
  if (rxSection && !rxSection.classList.contains('hidden') && !rxSelect.value) {
    toastError('Prescription Required', 'Please select a valid doctor authorization for high-risk items.');
    return;
  }

  const btn = document.getElementById('btn-confirm-pay');
  const spinner = document.getElementById('pay-spinner');
  const text = document.getElementById('pay-text');
  const paymentMethod = paymentInput?.value || 'upi';
  const prescriptionId = rxSelect?.value || null;

  if (text) text.classList.add('hidden');
  if (spinner) spinner.classList.remove('hidden');
  if (btn) btn.disabled = true;

  const resetPayBtn = () => {
    if (text) text.classList.remove('hidden');
    if (spinner) spinner.classList.add('hidden');
    if (btn) btn.disabled = false;
  };
  
  // Use Razorpay or Hackathon Simulated Razorpay Modal
  if (paymentMethod === 'card' || paymentMethod === 'upi' || paymentMethod === 'netbanking') {
    try {
      let totalAmount = cartTotal(); // in paise
      if (isSubscribed) totalAmount = Math.round(totalAmount * 0.85); // Apply 15% discount

      const orderRes = await api.post('/payment/create-order', { amount: totalAmount });
      const { orderId, amount, currency, keyId, demo } = orderRes.data || {};

      // Hackathon Demo Mode or Fake Payment Fallback
      if (demo || !keyId || keyId === 'rzp_test_key') {
        document.getElementById('checkout-modal')?.classList.add('hidden');
        showHackathonPaymentModal(amount || totalAmount, addressVal, paymentMethod, prescriptionId);
        resetPayBtn();
        return;
      }

      // Load official Razorpay SDK if live key exists
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      const user = getState('user');
      const rzp = new window.Razorpay({
        key: keyId,
        amount: amount || totalAmount,
        currency: currency || 'INR',
        name: 'MediFlow Sentinel',
        description: 'Express Medicine Delivery',
        order_id: orderId,
        prefill: {
          name: user ? `${user.firstName} ${user.lastName}` : 'Hackathon Patient',
          email: user?.email || 'patient@mediflow.com',
          contact: user?.phone || '9876543210',
        },
        theme: { color: '#6366f1' },
        handler: async (response) => {
          try {
            await api.post('/payment/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toastSuccess('Payment Successful 💳', `Payment ID: ${response.razorpay_payment_id.slice(-8)}`);
            await placeOrder({
              address: addressVal,
              paymentMethod,
              razorpayPaymentId: response.razorpay_payment_id,
              prescriptionId
            });
          } catch (verifyErr) {
            toastError('Payment Verification Failed', 'Please retry transaction.');
          } finally {
            resetPayBtn();
          }
        },
        modal: {
          ondismiss: () => {
            resetPayBtn();
            toastInfo('Payment Cancelled', 'Your cart remains saved.');
          }
        }
      });
      rzp.open();
      document.getElementById('checkout-modal')?.classList.add('hidden');
      return;
    } catch (err) {
      console.warn('[Payment] Razorpay fallback trigger:', err.message);
      document.getElementById('checkout-modal')?.classList.add('hidden');
      showHackathonPaymentModal(cartTotal(), addressVal, paymentMethod, prescriptionId);
      resetPayBtn();
      return;
    }
  }
  
  // Cash on Delivery — place order directly
  await placeOrder({
    address: addressVal,
    paymentMethod: paymentMethod || 'cod',
    prescriptionId
  });

  document.getElementById('checkout-modal')?.classList.add('hidden');
  resetPayBtn();
}

function showHackathonPaymentModal(amountPaise, address, paymentMethod, prescriptionId) {
  let modal = document.getElementById('hackathon-rzp-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'hackathon-rzp-modal';
    modal.className = 'modal-backdrop';
    document.body.appendChild(modal);
  }

  modal.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:16px;';

  const inr = ((amountPaise || 5000) / 100).toFixed(2);
  const payId = 'pay_rzp_hkthn_' + Math.random().toString(36).substring(2, 9).toUpperCase();

  modal.innerHTML = `
    <div class="modal-card fade-up" style="max-width:420px;width:100%;border-radius:20px;background:#0f172a;color:#f8fafc;border:1px solid #334155;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.8);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:1px solid #1e293b;padding-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;width:38px;height:38px;border-radius:10px;display:grid;place-content:center;font-weight:800;font-size:1.1rem;">₹</div>
          <div>
            <div style="font-weight:700;font-size:1.05rem;color:#f8fafc;">Razorpay Gateway</div>
            <div style="font-size:0.75rem;color:#94a3b8;">MediFlow Express Checkout</div>
          </div>
        </div>
        <button id="close-rzp-sim" style="background:rgba(255,255,255,0.05);border:none;color:#94a3b8;width:32px;height:32px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">&times;</button>
      </div>

      <div style="background:#1e293b;border-radius:14px;padding:18px;margin-bottom:20px;text-align:center;border:1px solid rgba(255,255,255,0.05);">
        <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:4px;">Total Amount to Pay</div>
        <div style="font-size:2.2rem;font-weight:800;color:#38bdf8;">₹${inr}</div>
        <div style="font-size:0.75rem;color:#64748b;margin-top:4px;">Order Ref: ${payId}</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;">
        <button id="btn-approve-rzp-demo" style="background:linear-gradient(135deg, #10b981, #059669);color:#ffffff;border:none;padding:14px;border-radius:12px;font-weight:700;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(16,185,129,0.35);">
          <span>⚡ Complete Payment (₹${inr})</span>
        </button>
        <button id="btn-cancel-rzp-demo" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:11px;border-radius:12px;font-weight:600;font-size:0.85rem;cursor:pointer;">
          Cancel
        </button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  modal.classList.remove('hidden');

  const hideRzpModal = () => {
    modal.style.display = 'none';
    modal.classList.add('hidden');
  };

  document.getElementById('close-rzp-sim')?.addEventListener('click', hideRzpModal);
  document.getElementById('btn-cancel-rzp-demo')?.addEventListener('click', hideRzpModal);

  document.getElementById('btn-approve-rzp-demo')?.addEventListener('click', async () => {
    hideRzpModal();
    toastSuccess('Payment Approved 💳', `Payment ID: ${payId}`);
    await placeOrder({
      address: address || '100 Feet Rd, Indiranagar, Bengaluru',
      paymentMethod: paymentMethod || 'upi',
      razorpayPaymentId: payId,
      prescriptionId: prescriptionId || null
    });
  });
}

async function placeOrder(orderData) {
  const cart = getState('cart');
  if (!cart.length) return;

  const items = cart.map(i => ({ medicineId: i.medicine._id, quantity: i.quantity, unitPrice: i.medicine.price }));

  // Use map picker coordinates if available, otherwise randomize slightly around Bengaluru
  const lat = _currentOrderCoords?.lat || 12.9716 + (Math.random() * 0.03);
  const lng = _currentOrderCoords?.lng || 77.5946 + (Math.random() * 0.03);

  const payload = {
    items,
    deliveryAddress: {
      street: orderData.address || '100 Feet Rd, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      zipCode: '560038',
      country: 'India',
      coordinates: { lat, lng }
    },
    paymentMethod: orderData.paymentMethod || 'upi',
    prescriptionId: orderData.prescriptionId || null
  };

  let routingMeta = { estimatedMinutes: 12, hops: 1 };
  let confirmedOrder = payload;

  try {
    const res = await api.post('/pharmacy/orders', payload);
    confirmedOrder = res.data || payload;
    routingMeta = res.data?.routingMeta || routingMeta;
  } catch (err) {
    console.warn('[Pharmacy] API order fallback:', err.message);
  }

  // Notify Rider Dashboard of new delivery task
  window.dispatchEvent(new CustomEvent('mf:dispatch-rider', { detail: { order: confirmedOrder, routingMeta } }));

  cartClear();
  toastSuccess('Order Confirmed! 🚚', 'Payment completed. Express drone delivery dispatched.');
  
  document.getElementById('checkout-modal')?.classList.add('hidden');
  document.getElementById('btn-confirm-pay')?.removeAttribute('disabled');
  document.getElementById('pay-spinner')?.classList.add('hidden');
  document.getElementById('pay-text')?.classList.remove('hidden');

  startLiveTracking(routingMeta);
}

function startLiveTracking(routingMeta) {
  // Hide other sections, show tracking
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  document.getElementById('dash-live-tracking').classList.remove('hidden');
  document.getElementById('dash-live-tracking').scrollIntoView({ behavior: 'smooth', block: 'start' });
  
  const etaMinutes = Math.round(routingMeta.estimatedMinutes || 12);
  const logEl = document.getElementById('automation-logs');

  const addLog = (text, color = '#94a3b8') => {
    const div = document.createElement('div');
    div.style.color = color;
    div.textContent = `[${new Date().toLocaleTimeString([], {hour12:false})}] ${text}`;
    logEl.prepend(div);
  };

  // Reset UI
  document.getElementById('track-bar').style.width = '5%';
  document.getElementById('track-eta').textContent = etaMinutes;
  document.getElementById('step-dispatch').style.opacity = '0.5';
  document.getElementById('step-arrive').style.opacity = '0.5';

  // Phase 1: Automation Workflow Triggers
  setTimeout(() => {
    addLog('[Trigger] Payment Captured via Razorpay', '#10b981');
    addLog('[Status] Dark-Store Verification: Pharmacist Priya P.', '#60a5fa');
    addLog('[Action] Reducing Inventory: Amoxicillin -1', '#f87171');
    document.getElementById('track-bar').style.width = '25%';
  }, 1500);

  setTimeout(() => {
    addLog('[Action] Notifying Pharmacist Hub...', '#60a5fa');
    addLog('[Status] Cold-Chain Integrity: VERIFIED at 3.2°C', '#10b981');
    document.getElementById('track-bar').style.width = '40%';
  }, 3500);

  setTimeout(() => {
    addLog('[Trigger] Order Marked as PACKED', '#fbbf24');
    addLog('[Action] Finding nearest available Biker in Ludhiana...', '#60a5fa');
    document.getElementById('track-bar').style.width = '55%';
    document.getElementById('step-pack').style.opacity = '1';
    document.getElementById('step-pack').querySelector('.step-icon').textContent = '✅';
  }, 5500);

  // Phase 2: Biker Assignment & Map Start
  setTimeout(() => {
    addLog('[Trigger] Biker Found: Alex (ID: LUD-429)', '#10b981');
    addLog('[Action] Pushing coordinates to Rider App', '#60a5fa');

    document.getElementById('track-bar').style.width = '70%';
    document.getElementById('step-dispatch').style.opacity = '1';
    document.getElementById('step-dispatch').classList.add('active');
    document.getElementById('track-eta').textContent = Math.max(1, Math.round(etaMinutes / 2));

    // Start the Real Biker Map
    startRealDeliveryTracking('delivery-map-container');
    toastInfo('Biker Assigned', 'Alex is heading to the pharmacy to pick up your order.');
  }, 7500);

  setTimeout(() => {
    addLog('[Status] Package Picked Up - Biker in Transit', '#10b981');
    addLog('[Action] Monitoring Real-time GPS: 30.9010, 75.8573', '#94a3b8');
  }, 9500);
}
