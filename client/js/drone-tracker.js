/**
 * drone-tracker.js — Self-contained 3D Fleet Tracker (Mapbox GL)
 * 3D Fleet Command Center with extruded buildings and live telemetry.
 */

const MAP_CENTER = { lat: 12.9716, lng: 77.5946 };
const VEHICLE_TYPES = {
  drone: { icon: '🚁', color: '#6366f1', speed: 0.8, label: 'Drone' },
  bike:  { icon: '🏍️', color: '#10b981', speed: 0.5, label: 'Bike' },
  van:   { icon: '🚐', color: '#f59e0b', speed: 0.3, label: 'Van' },
};

class MapboxFleetTracker {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.markers = new Map();
  }

  init() {
    const el = document.getElementById(this.containerId);
    if (!el || !window.mapboxgl) {
      console.warn("Mapbox GL not loaded.");
      return;
    }

    el.innerHTML = '';
    // Dummy token to satisfy SDK. We use custom raster tiles + custom geojson to bypass auth.
    window.mapboxgl.accessToken = 'pk.eyJ1IjoiZGVtbyIsImEiOiJjbDF2b2V5b2MweDByM2NxZ3Z4a2cweWwyIn0.DEMO_TOKEN';

    this.map = new window.mapboxgl.Map({
      container: this.containerId,
      style: {
        'version': 8,
        'sources': {
          'raster-tiles': {
            'type': 'raster',
            'tiles': ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
            'tileSize': 256
          },
          'mock-buildings': {
             'type': 'geojson',
             'data': this._getMockBuildings()
          }
        },
        'layers': [
          {
            'id': 'simple-tiles',
            'type': 'raster',
            'source': 'raster-tiles',
            'minzoom': 0,
            'maxzoom': 22
          },
          {
            'id': '3d-buildings',
            'source': 'mock-buildings',
            'type': 'fill-extrusion',
            'paint': {
               'fill-extrusion-color': ['get', 'color'],
               'fill-extrusion-height': ['get', 'height'],
               'fill-extrusion-base': 0,
               'fill-extrusion-opacity': 0.6
            }
          }
        ]
      },
      center: [77.5946, 12.9716],
      zoom: 15.5,
      pitch: 60, // 3D Pitch
      bearing: -20,
      antialias: true,
      interactive: true
    });

    this.map.on('load', () => {
      this._generateFleet();
      this._animate();
      this._updateFleetListUI();
      
      // Auto-rotate camera slowly for command center feel
      this._rotateCamera();
    });

    const badge = document.getElementById('drone-count-badge');
    if (badge) badge.textContent = `3 active`;
  }

  _rotateCamera() {
     if(!this.map) return;
     const bearing = this.map.getBearing();
     this.map.easeTo({ bearing: bearing + 5, duration: 3000, easing: (t) => t });
     this._rotateInterval = setTimeout(() => this._rotateCamera(), 3000);
  }

  _getMockBuildings() {
    // Generates some mock 3D cubes around the center to simulate a 3D city
    const features = [];
    for(let i=0; i<30; i++) {
       const lng = 77.5946 + (Math.random() - 0.5) * 0.02;
       const lat = 12.9716 + (Math.random() - 0.5) * 0.02;
       const size = 0.0002 + Math.random() * 0.0003;
       const height = 20 + Math.random() * 150;
       
       features.push({
         'type': 'Feature',
         'properties': {
            'color': Math.random() > 0.8 ? '#4f46e5' : '#1e293b',
            'height': height
         },
         'geometry': {
            'type': 'Polygon',
            'coordinates': [[
               [lng-size, lat-size],
               [lng+size, lat-size],
               [lng+size, lat+size],
               [lng-size, lat+size],
               [lng-size, lat-size]
            ]]
         }
       });
    }
    // Add central pharmacy hub
    features.push({
         'type': 'Feature',
         'properties': { 'color': '#10b981', 'height': 200 },
         'geometry': {
            'type': 'Polygon',
            'coordinates': [[
               [77.5942, 12.9712],
               [77.5950, 12.9712],
               [77.5950, 12.9720],
               [77.5942, 12.9720],
               [77.5942, 12.9712]
            ]]
         }
    });
    return { 'type': 'FeatureCollection', 'features': features };
  }

  _generateFleet() {
    this.fleet = [
      { id: 'RDR-001', type: 'bike', lat: 12.9716, lng: 77.5946, tLat: 12.9800, tLng: 77.6000, battery: 87, order: 'ORD-8492A' },
      { id: 'DRN-X14', type: 'drone', lat: 12.9650, lng: 77.5850, tLat: 12.9550, tLng: 77.5700, battery: 94, order: 'ORD-7721B' },
      { id: 'VAN-003', type: 'van',  lat: 12.9900, lng: 77.6200, tLat: 13.0100, tLng: 77.6400, battery: 72, order: 'ORD-6539C' },
    ];

    this.fleet.forEach(v => {
      const el = document.createElement('div');
      el.className = 'mapbox-marker';
      el.style.fontSize = v.type === 'drone' ? '2rem' : '1.5rem';
      el.style.textShadow = '0 0 10px rgba(99,102,241,0.8)';
      el.innerHTML = VEHICLE_TYPES[v.type].icon;
      
      const m = new window.mapboxgl.Marker(el)
         .setLngLat([v.lng, v.lat])
         .addTo(this.map);
      this.markers.set(v.id, m);
    });
  }

  _animate() {
    if(!this.map) return;
    this.fleet.forEach(v => {
      const step = 0.0002;
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
      if (m) m.setLngLat([v.lng, v.lat]);
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
          <div class="drone-item card" style="padding:15px; margin-bottom:10px; border-left:3px solid ${VEHICLE_TYPES[v.type].color}; background:rgba(15,23,42,0.6);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
               <div style="display:flex; align-items:center; gap:12px;">
                 <div style="font-size:1.5rem;">${VEHICLE_TYPES[v.type].icon}</div>
                 <div>
                   <div style="font-weight:800; font-size:0.9rem;">${v.id} <span style="font-size:0.65rem; padding:2px 6px; background:rgba(255,255,255,0.1); border-radius:4px;">${VEHICLE_TYPES[v.type].label}</span></div>
                   <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">ORD: ${v.order} &middot; EN ROUTE</div>
                 </div>
               </div>
               <div style="text-align:right;">
                  <div style="font-size:0.8rem; font-weight:700; color:${battClass === 'high' ? '#10b981' : '#f59e0b'};">${v.battery}%</div>
                  <div style="font-size:0.6rem; color:var(--text-secondary);">BATTERY</div>
               </div>
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
    clearTimeout(this._rotateInterval);
    if (this.map) this.map.remove();
    this.map = null;
  }
}

let _tracker = null;
let _leafletMap = null; // Used for simple 2D view like live-tracking
let _deliveryMarker = null;

export function initDroneTracker(containerId = 'drone-map-canvas') {
  if (_tracker) _tracker.destroy();
  _tracker = new MapboxFleetTracker(containerId);
  _tracker.init();
  return _tracker;
}

export function destroyDroneTracker() {
  _tracker?.destroy();
  _tracker = null;
}

// ── Real Map Delivery Tracking (Ludhiana) - Fallback Leaflet ─────────────────
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

