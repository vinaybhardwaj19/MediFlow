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

class CanvasFleetTracker {
  constructor(containerId) {
    this.containerId = containerId;
    this.canvas = null;
    this.ctx = null;
    this.fleet = [];
    this._raf = null;
    this._buildings = [];
    this._roads = [];
    this._time = 0;
    this._pharmacyPos = { x: 0.5, y: 0.5 };
  }

  init() {
    const el = document.getElementById(this.containerId);
    if (!el) return;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;border-radius:inherit;cursor:grab;';
    el.innerHTML = '';
    el.appendChild(this.canvas);

    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Generate city layout
    this._generateCity();
    this._generateFleet();
    this._animate();
    this._updateFleetListUI();

    // Update badge
    const badge = document.getElementById('drone-count-badge');
    if (badge) badge.textContent = `${this.fleet.length} active`;
  }

  _resize() {
    const el = this.canvas.parentElement;
    this.canvas.width = el.clientWidth * (window.devicePixelRatio || 1);
    this.canvas.height = el.clientHeight * (window.devicePixelRatio || 1);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    this.W = el.clientWidth;
    this.H = el.clientHeight;
  }

  _generateCity() {
    // Roads (grid pattern)
    for (let i = 0; i < 8; i++) {
      this._roads.push({ x1: 0, y1: (i + 1) / 9, x2: 1, y2: (i + 1) / 9, h: false });
      this._roads.push({ x1: (i + 1) / 9, y1: 0, x2: (i + 1) / 9, y2: 1, h: true });
    }

    // Buildings (random placement in grid cells)
    for (let gx = 0; gx < 8; gx++) {
      for (let gy = 0; gy < 8; gy++) {
        if (Math.random() > 0.6) continue;
        const cx = (gx + 0.5) / 9 + (Math.random() - 0.5) * 0.04;
        const cy = (gy + 0.5) / 9 + (Math.random() - 0.5) * 0.04;
        const w = 0.02 + Math.random() * 0.03;
        const h = 0.02 + Math.random() * 0.03;
        const height = 15 + Math.random() * 40;
        const hue = [220, 240, 260, 200][Math.floor(Math.random() * 4)];
        this._buildings.push({ x: cx, y: cy, w, h, height, hue });
      }
    }
  }

  _generateFleet() {
    this.fleet = [
      { id: 'DRN-001', type: 'drone', x: 0.2, y: 0.3, tx: 0.7, ty: 0.8, battery: 87, order: 'ORD-8492A', eta: 8 },
      { id: 'BKE-014', type: 'bike',  x: 0.6, y: 0.2, tx: 0.3, ty: 0.6, battery: 94, order: 'ORD-7721B', eta: 12 },
      { id: 'VAN-003', type: 'van',   x: 0.8, y: 0.7, tx: 0.2, ty: 0.3, battery: 72, order: 'ORD-6539C', eta: 18 },
      { id: 'DRN-007', type: 'drone', x: 0.4, y: 0.8, tx: 0.9, ty: 0.2, battery: 65, order: 'ORD-9102D', eta: 5 },
      { id: 'BKE-022', type: 'bike',  x: 0.1, y: 0.6, tx: 0.8, ty: 0.4, battery: 88, order: 'ORD-4418E', eta: 15 },
    ];
  }

  _animate() {
    this._time += 0.016;
    const { ctx, W, H } = this;
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    // Grid glow
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 0.5;
    for (const r of this._roads) {
      ctx.beginPath();
      ctx.moveTo(r.x1 * W, r.y1 * H);
      ctx.lineTo(r.x2 * W, r.y2 * H);
      ctx.stroke();
    }
    ctx.restore();

    // Roads
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    for (const r of this._roads) {
      ctx.beginPath();
      ctx.moveTo(r.x1 * W, r.y1 * H);
      ctx.lineTo(r.x2 * W, r.y2 * H);
      ctx.stroke();
    }
    ctx.restore();

    // Buildings (isometric-like)
    this._buildings.forEach(b => {
      const bx = b.x * W, by = b.y * H;
      const bw = b.w * W, bh = b.h * H;
      const offset = b.height * 0.3;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(bx + 4, by + 4, bw, bh);

      // Top face (3D effect)
      ctx.fillStyle = `hsla(${b.hue}, 40%, 25%, 0.6)`;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + offset * 0.3, by - offset * 0.3);
      ctx.lineTo(bx + bw + offset * 0.3, by - offset * 0.3);
      ctx.lineTo(bx + bw, by);
      ctx.fill();

      // Side face
      ctx.fillStyle = `hsla(${b.hue}, 35%, 20%, 0.6)`;
      ctx.beginPath();
      ctx.moveTo(bx + bw, by);
      ctx.lineTo(bx + bw + offset * 0.3, by - offset * 0.3);
      ctx.lineTo(bx + bw + offset * 0.3, by + bh - offset * 0.3);
      ctx.lineTo(bx + bw, by + bh);
      ctx.fill();

      // Front face
      ctx.fillStyle = `hsla(${b.hue}, 30%, 18%, 0.7)`;
      ctx.fillRect(bx, by, bw, bh);

      // Window lights
      ctx.fillStyle = `hsla(50, 80%, 70%, ${0.2 + Math.sin(this._time * 2 + b.x * 20) * 0.15})`;
      for (let wx = 0; wx < 3; wx++) {
        for (let wy = 0; wy < 4; wy++) {
          if (Math.random() > 0.7) continue;
          ctx.fillRect(bx + 2 + wx * (bw / 3.5), by + 2 + wy * (bh / 5), bw * 0.15, bh * 0.1);
        }
      }
    });

    // Pharmacy marker
    const px = this._pharmacyPos.x * W, py = this._pharmacyPos.y * H;
    ctx.save();
    const pulseR = 12 + Math.sin(this._time * 3) * 4;
    ctx.beginPath();
    ctx.arc(px, py, pulseR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.font = '14px sans-serif';
    ctx.fillText('💊', px - 7, py + 5);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.fillText('PHARMACY', px - 22, py + 22);
    ctx.restore();

    // Vehicles
    this.fleet.forEach(v => {
      const cfg = VEHICLE_TYPES[v.type];

      // Move toward target
      const dx = v.tx - v.x;
      const dy = v.ty - v.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.005) {
        v.x += (dx / dist) * cfg.speed * 0.003;
        v.y += (dy / dist) * cfg.speed * 0.003;
      } else {
        v.tx = 0.1 + Math.random() * 0.8;
        v.ty = 0.1 + Math.random() * 0.8;
        v.battery = Math.max(20, v.battery - Math.floor(Math.random() * 5));
      }

      const vx = v.x * W, vy = v.y * H;

      // Trail
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(v.tx * W, v.ty * H);
      ctx.stroke();
      ctx.restore();

      // Destination marker
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(v.tx * W, v.ty * H, 5 + Math.sin(this._time * 4) * 2, 0, Math.PI * 2);
      ctx.fillStyle = cfg.color;
      ctx.fill();
      ctx.restore();

      // Glow ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(vx, vy, 16 + Math.sin(this._time * 5 + v.x * 10) * 3, 0, Math.PI * 2);
      ctx.fillStyle = cfg.color + '22';
      ctx.fill();
      ctx.restore();

      // Vehicle icon
      ctx.font = '20px sans-serif';
      ctx.fillText(cfg.icon, vx - 10, vy + 7);

      // Label
      ctx.font = 'bold 8px Inter, sans-serif';
      ctx.fillStyle = cfg.color;
      ctx.fillText(v.id, vx - 16, vy - 14);
    });

    // Compass
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText('N ↑', W - 30, 20);
    ctx.restore();

    // Scale bar
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, H - 15);
    ctx.lineTo(60, H - 15);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '8px Inter, sans-serif';
    ctx.fillText('500m', 20, H - 20);
    ctx.restore();

    this._raf = requestAnimationFrame(() => this._animate());
  }

  _updateFleetListUI() {
    const list = document.getElementById('drone-fleet-list');
    if (!list) return;

    const update = () => {
      list.innerHTML = this.fleet.map(v => {
        const cfg = VEHICLE_TYPES[v.type];
        const battClass = v.battery > 50 ? 'high' : v.battery > 20 ? 'mid' : 'low';
        return `
          <div class="drone-item">
            <div class="drone-icon">${cfg.icon}</div>
            <div class="drone-info">
              <div class="drone-serial">${v.id} · ${cfg.label.toUpperCase()}</div>
              <div class="drone-status-text" style="color:${cfg.color}">EN ROUTE · ${v.order}</div>
            </div>
            <div class="drone-battery">
               <div class="battery-bar"><div class="battery-fill ${battClass}" style="width:${v.battery}%"></div></div>
               <span>${v.battery}%</span>
            </div>
          </div>`;
      }).join('');
    };

    update();
    this._listInterval = setInterval(update, 2000);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    clearInterval(this._listInterval);
  }
}

let _tracker = null;
let _leafletMap = null;
let _deliveryMarker = null;

export function initDroneTracker(containerId = 'drone-map-canvas') {
  if (_tracker) _tracker.destroy();
  _tracker = new CanvasFleetTracker(containerId);
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
      <div style="position:absolute; top:10px; right:10px; z-index:1000; background:rgba(10, 10, 26, 0.85); border:1px solid #6366f1; border-radius:8px; padding:10px; color:#fff; font-family:Inter, sans-serif; font-size:0.75rem; backdrop-filter:blur(4px); box-shadow:0 4px 15px rgba(99,102,241,0.3); display:flex; flex-direction:column; gap:5px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="display:inline-block; width:8px; height:8px; background:#10b981; border-radius:50%; animation:pulse 1.5s infinite;"></span>
          <span style="font-weight:bold; color:#6366f1;">Route Optimizer</span>
        </div>
        <div>Traffic: <span style="color:#10b981;">Optimal</span></div>
        <div>Route: <span style="color:#f59e0b;" id="ai-route-status">Calculating...</span></div>
        <div style="font-size:0.65rem; color:#888;">Powered by Leaflet.js</div>
      </div>
    `;
    container.appendChild(aiOverlay);
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

  // CartoDB Dark Matter tiles for a futuristic aesthetic
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19
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
