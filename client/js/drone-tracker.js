/**
 * drone-tracker.js — Self-contained 3D Fleet Tracker
 * No external API key needed. Canvas-based isometric city map with
 * animated delivery vehicles (drones, bikes, vans).
 */

const MAP_CENTER = { lat: 12.9716, lng: 77.5946 };
const VEHICLE_TYPES = {
  drone: { icon: '🚁', color: '#6366f1', speed: 0.8, label: 'Drone' },
  bike:  { icon: '🏍️', color: '#10b981', speed: 0.5, label: 'Bike' },
  van:   { icon: '🚐', color: '#f59e0b', speed: 0.3, label: 'Van' },
};

class LeafletFleetTracker {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.markers = new Map();
  }

  init() {
    const el = document.getElementById(this.containerId);
    if (!el || !window.L) return;

    el.innerHTML = '';
    this.map = window.L.map(this.containerId, {
      zoomControl: false,
      attributionControl: false
    }).setView([12.9716, 77.5946], 13); // Default Bengaluru

    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    this._generateFleet();
    this._animate();
    this._updateFleetListUI();

    const badge = document.getElementById('drone-count-badge');
    if (badge) badge.textContent = `${this.fleet.length} active`;
  }

  _generateFleet() {
    this.fleet = [
      { id: 'RDR-001', type: 'bike', lat: 12.9716, lng: 77.5946, tLat: 12.9800, tLng: 77.6000, battery: 87, order: 'ORD-8492A' },
      { id: 'RDR-014', type: 'bike', lat: 12.9650, lng: 77.5850, tLat: 12.9550, tLng: 77.5700, battery: 94, order: 'ORD-7721B' },
      { id: 'RDR-003', type: 'van',  lat: 12.9900, lng: 77.6200, tLat: 13.0100, tLng: 77.6400, battery: 72, order: 'ORD-6539C' },
    ];

    this.fleet.forEach(v => {
      const icon = window.L.divIcon({
        html: `<div style="font-size:1.5rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${v.type === 'bike' ? '🏍️' : '🚐'}</div>`,
        className: 'map-marker-icon',
        iconSize: [24, 24]
      });
      const m = window.L.marker([v.lat, v.lng], { icon }).addTo(this.map);
      this.markers.set(v.id, m);
    });
  }

  _animate() {
    this.fleet.forEach(v => {
      const step = 0.0001;
      const dLat = v.tLat - v.lat;
      const dLng = v.tLng - v.lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);

      if (dist > 0.001) {
        v.lat += (dLat / dist) * step;
        v.lng += (dLng / dist) * step;
      } else {
        v.tLat = v.lat + (Math.random() - 0.5) * 0.02;
        v.tLng = v.lng + (Math.random() - 0.5) * 0.02;
      }

      const m = this.markers.get(v.id);
      if (m) m.setLatLng([v.lat, v.lng]);
    });

    this._raf = requestAnimationFrame(() => this._animate());
  }

  _updateFleetListUI() {
    const list = document.getElementById('drone-fleet-list');
    if (!list) return;

    const update = () => {
      list.innerHTML = this.fleet.map(v => {
        const battClass = v.battery > 50 ? 'high' : v.battery > 20 ? 'mid' : 'low';
        return `
          <div class="drone-item">
            <div class="drone-icon">${v.type === 'bike' ? '🏍️' : '🚐'}</div>
            <div class="drone-info">
              <div class="drone-serial">${v.id} · ${v.type.toUpperCase()}</div>
              <div class="drone-status-text" style="color:var(--primary)">EN ROUTE · ${v.order}</div>
            </div>
            <div class="drone-battery">
               <div class="battery-bar"><div class="battery-fill ${battClass}" style="width:${v.battery}%"></div></div>
               <span>${v.battery}%</span>
            </div>
          </div>`;
      }).join('');
    };
    update();
    this._listInterval = setInterval(update, 3000);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    clearInterval(this._listInterval);
    if (this.map) this.map.remove();
  }
}

let _tracker = null;
let _leafletMap = null;
let _deliveryMarker = null;

export function initDroneTracker(containerId = 'drone-map-canvas') {
  if (_tracker) _tracker.destroy();
  _tracker = new LeafletFleetTracker(containerId);
  _tracker.init();
  return _tracker;
}

export function destroyDroneTracker() {
  _tracker?.destroy();
  _tracker = null;
}

// ── Real Map Delivery Tracking (Ludhiana) ────────────────────────────────────
export function startRealDeliveryTracking(containerId = 'delivery-map-container') {
  const container = document.getElementById(containerId);
  if (!container || !window.L) return;
  container.style.display = 'block';
  container.style.position = 'relative';

  // Inject route optimization overlay
  let aiOverlay = document.getElementById('ai-route-overlay');
  if (!aiOverlay) {
    aiOverlay = document.createElement('div');
    aiOverlay.id = 'ai-route-overlay';
    aiOverlay.innerHTML = `
      <div style="position:absolute; top:10px; right:10px; z-index:1000; background:rgba(10, 10, 26, 0.85); border:1px solid #6366f1; border-radius:8px; padding:10px; color:#fff; font-family:Inter, sans-serif; font-size:0.75rem; backdrop-filter:blur(4px); box-shadow:0 4px 15px rgba(99,102,241,0.3); display:flex; flex-direction:column; gap:5px; min-width:140px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="display:inline-block; width:8px; height:8px; background:#10b981; border-radius:50%; animation:pulse 1.5s infinite;"></span>
          <span style="font-weight:bold; color:#6366f1;">BIKER TELEMETRY</span>
        </div>
        <div style="display:flex; justify-content:space-between;"><span>Speed:</span><span style="color:#10b981;" id="tele-speed">24 km/h</span></div>
        <div style="display:flex; justify-content:space-between;"><span>Box Temp:</span><span style="color:#10b981;" id="tele-temp">4.2°C</span></div>
        <div style="display:flex; justify-content:space-between;"><span>GPS:</span><span style="color:#10b981;">Strong</span></div>
        <div style="display:flex; justify-content:space-between;"><span>Driver:</span><span style="color:#fff;">Alex L.</span></div>
        <div style="font-size:0.65rem; color:#888; margin-top:5px; border-top:1px solid #334155; padding-top:5px;">ID: LUD-4298-X</div>
      </div>
    `;
    container.appendChild(aiOverlay);
  }

  const containerEl = document.getElementById(containerId);
  if (containerEl) {
    containerEl.style.display = 'block';
    containerEl.style.height = '320px';
  }

  // If map already exists, clear it
  if (_leafletMap) {
    _leafletMap.remove();
    _leafletMap = null;
  }

  // Define Ludhiana Route
  const LUDHIANA_ROUTE = [
    [30.9010, 75.8573], // Start (Pharmacy)
    [30.8985, 75.8550],
    [30.8950, 75.8500],
    [30.8900, 75.8450],
    [30.8850, 75.8400], // End (Home)
  ];

  _leafletMap = window.L.map(containerId, {
    zoomControl: false,
    attributionControl: false,
  }).setView(LUDHIANA_ROUTE[0], 14);

  // Google Hybrid satellite tiles for an extremely premium drone tracking view
  window.L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20
  }).addTo(_leafletMap);

  // Draw the Route
  const routeLine = window.L.polyline(LUDHIANA_ROUTE, { color: '#6366f1', weight: 4, opacity: 0.8, dashArray: '10, 10' }).addTo(_leafletMap);
  _leafletMap.fitBounds(routeLine.getBounds(), { padding: [20, 20] });

  // Icons
  const pharmacyIcon = window.L.divIcon({ html: '<div style="font-size:1.5rem;text-shadow:0 2px 4px rgba(0,0,0,0.5);">🏥</div>', className: 'map-icon', iconSize: [24, 24] });
  const homeIcon = window.L.divIcon({ html: '<div style="font-size:1.5rem;text-shadow:0 2px 4px rgba(0,0,0,0.5);">🏠</div>', className: 'map-icon', iconSize: [24, 24] });
  const bikeIcon = window.L.divIcon({ html: '<div style="font-size:2rem;transform:scaleX(-1);text-shadow:0 2px 5px rgba(0,0,0,0.8);background:var(--primary);border-radius:50%;padding:4px;border:2px solid white;">🏍️</div>', className: 'map-icon', iconSize: [40, 40], iconAnchor: [20, 20] });

  window.L.marker(LUDHIANA_ROUTE[0], { icon: pharmacyIcon }).addTo(_leafletMap);
  window.L.marker(LUDHIANA_ROUTE[LUDHIANA_ROUTE.length - 1], { icon: homeIcon }).addTo(_leafletMap);

  _deliveryMarker = window.L.marker(LUDHIANA_ROUTE[0], { icon: bikeIcon }).addTo(_leafletMap);

  // Animate Marker
  let currentSegment = 0;
  let progress = 0;
  const speed = 0.005; // Adjust for animation speed
  let aiStatusUpdated = false;

  function animate() {
    if (!_leafletMap) return; // Map destroyed
    if (currentSegment >= LUDHIANA_ROUTE.length - 1) {
      // Reached destination, trigger UI update if needed
      const statusEl = document.getElementById('ai-route-status');
      if (statusEl) {
        statusEl.textContent = 'Arrived';
        statusEl.style.color = '#10b981';
      }
      return;
    }

    if (!aiStatusUpdated && progress > 0.5) {
        const statusEl = document.getElementById('ai-route-status');
        if (statusEl) {
          statusEl.textContent = 'Path Optimized';
          statusEl.style.color = '#10b981';
        }
        aiStatusUpdated = true;
    }

    progress += speed;
    if (progress >= 1) {
      progress = 0;
      currentSegment++;
    }

    if (currentSegment < LUDHIANA_ROUTE.length - 1) {
      const p1 = LUDHIANA_ROUTE[currentSegment];
      const p2 = LUDHIANA_ROUTE[currentSegment + 1];
      const lat = p1[0] + (p2[0] - p1[0]) * progress;
      const lng = p1[1] + (p2[1] - p1[1]) * progress;
      _deliveryMarker.setLatLng([lat, lng]);

      // Update Telemetry
      const speedEl = document.getElementById('tele-speed');
      const tempEl = document.getElementById('tele-temp');
      if (speedEl && Math.random() > 0.8) {
        const speed = 20 + Math.floor(Math.random() * 15);
        speedEl.textContent = `${speed} km/h`;
        if (tempEl) {
           const temp = (4.0 + Math.random() * 0.5).toFixed(1);
           tempEl.textContent = `${temp}°C`;
           tempEl.style.color = temp > 4.4 ? '#fbbf24' : '#10b981';
        }
      }

      // Update ETA
      const etaEl = document.getElementById('track-eta');
      if (etaEl) {
        const remainingSegments = (LUDHIANA_ROUTE.length - 1 - currentSegment) - progress;
        etaEl.textContent = Math.max(1, Math.ceil(remainingSegments * 3));
      }

      requestAnimationFrame(animate);
    }
  }

  // Start animation after a short delay
  setTimeout(() => {
    requestAnimationFrame(animate);
  }, 1000);
}
