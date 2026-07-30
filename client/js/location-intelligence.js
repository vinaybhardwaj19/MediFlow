/**
 * @file location-intelligence.js
 * @description Location permission, manual location selector, and nearby provider list using Leaflet.
 */

import * as api from './api.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';

let _map = null;
let _googleMap = null;
let _currentPos = { lat: 12.9716, lng: 77.5946 }; // Default Bengaluru
let _markers = [];
let _googleMarkers = [];
let _preferredProvider = null;
let _tileLayer = null;
let _currentTheme = 'carto-dark';
let _userLocationDetails = { city: 'Bengaluru', state: 'Karnataka', area: 'Indiranagar' };

export async function initLocationIntelligence() {
  const container = document.getElementById('dash-location');
  if (!container) return;

  // Load Config (API Keys)
  let config = { googleMapsApiKey: '' };
  try {
    const res = await api.get('/config');
    config = res.data;
  } catch (err) {
    console.warn('Failed to load client config:', err);
  }

  // Render location HUD html
  container.innerHTML = `
    <div id="dash-location-banner"></div>
    <div class="card" style="margin-bottom:20px;padding:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;display:flex;align-items:center;gap:8px;">📍 Location Intelligence & Healthcare Finder</h3>
        <div id="map-provider-badge" class="badge badge-routine">Leaflet Engine</div>
      </div>
      <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:16px;">
        Allow location access to automatically find the nearest medical infrastructure in your city/locality. You can also drag the marker to select your location manually.
      </p>
      
      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="btn-gps-locate" style="height:auto;">🧭 GPS Locate</button>
        <div style="flex:1;min-width:160px;">
          <select class="form-input" id="provider-type-filter" style="padding:6px 12px;height:auto;">
            <option value="">All Providers Nearby</option>
            <option value="hospital">🏥 Hospitals & Emergency</option>
            <option value="doctor">🩺 Specialists & Clinics</option>
            <option value="medical_store">💊 Medical Stores</option>
            <option value="laboratory">🧪 Labs & Diagnostics</option>
            <option value="emergency_center">🚨 Emergency Centers</option>
            <option value="ambulance_service">🚑 Ambulance Stations</option>
          </select>
        </div>
        <div style="flex:1;min-width:160px;">
          <select class="form-input" id="map-theme-filter" style="padding:6px 12px;height:auto;background:rgba(99,102,241,0.08);border-color:rgba(99,102,241,0.25);color:#a5b4fc;font-weight:700;">
            <option value="google-silver">⚪ Theme: Google Silver</option>
            <option value="carto-light">☁️ Theme: Leaflet Light</option>
            <option value="carto-dark">🌌 Theme: CartoDB Dark</option>
            <option value="google-road">🗺️ Theme: Google Road</option>
            <option value="google-satellite">🛰️ Theme: Google Satellite</option>
            <option value="google-terrain">⛰️ Theme: Google Terrain</option>
          </select>
        </div>
      </div>

      <div id="location-map" style="height:320px;border-radius:var(--radius);border:1px solid var(--border);margin-bottom:20px;z-index:1;"></div>

      <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:20px;height:350px;overflow:hidden;flex-wrap:wrap;">
        <div>
          <h4 style="margin-bottom:12px;font-weight:600;">Nearest Providers</h4>
          <div id="provider-list-items" style="height:300px;overflow-y:auto;padding-right:5px;">
            <div class="loading-center"><div class="spinner"></div></div>
          </div>
        </div>
        <div style="border-left:1px solid var(--border);padding-left:20px;">
          <h4 style="margin-bottom:12px;font-weight:600;">Preferred Facility</h4>
          <div id="preferred-provider-card" class="card" style="padding:16px;background:rgba(255,255,255,0.02);">
            <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.85rem;">
              No preferred medical facility saved yet. Click "Save Preferred" on a provider.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind events
  document.getElementById('btn-gps-locate')?.addEventListener('click', requestGPS);
  document.getElementById('provider-type-filter')?.addEventListener('change', loadNearbyProviders);
  document.getElementById('map-theme-filter')?.addEventListener('change', (e) => {
    _currentTheme = e.target.value;
    setupMap();
  });

  // Load Google Maps SDK if key exists
  if (config.googleMapsApiKey) {
    loadGoogleMapsSDK(config.googleMapsApiKey);
  }

  // Auto prompt for GPS permission on enter
  autoPromptGPS();

  // Initialize Map
  setTimeout(setupMap, 100);
}

function loadGoogleMapsSDK(apiKey) {
  const script = document.getElementById('google-maps-sdk');
  if (script && !script.src) {
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.onload = () => {
      const badge = document.getElementById('map-provider-badge');
      if (badge) {
        badge.textContent = 'Google Maps SDK';
        badge.style.background = 'var(--accent)';
      }
      console.log('[Location] Google Maps SDK loaded successfully.');
      if (_currentTheme.startsWith('google-')) {
        try { setupMap(); } catch (e) { console.warn('[Location] Google setupMap fail:', e); }
      }
    };
    script.onerror = () => {
      console.warn('[Location] Google Maps SDK failed to load. Falling back to Leaflet tiles.');
      _currentTheme = 'carto-dark';
      try { setupMap(); } catch (e) {}
    };
    window.gm_authFailure = () => {
      console.warn('[Location] Google Maps auth failure. Falling back to Carto dark tile layer.');
      const badge = document.getElementById('map-provider-badge');
      if (badge) { badge.textContent = 'Leaflet Maps'; badge.style.background = 'var(--primary)'; }
    };
  }
}

function updateMapTileLayer() {
  if (!_map) return;
  if (_tileLayer) {
    _map.removeLayer(_tileLayer);
  }

  let url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  let opts = { subdomains: 'abcd', maxZoom: 19 };

  if (_currentTheme === 'carto-light') {
    url = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  } else if (_currentTheme === 'google-road' || _currentTheme === 'google-silver') {
    url = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    opts = { maxZoom: 20 };
  } else if (_currentTheme === 'google-satellite') {
    url = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
    opts = { maxZoom: 20 };
  } else if (_currentTheme === 'google-terrain') {
    url = 'https://mt1.google.com/vt/lyrs=t&x={x}&y={y}&z={z}';
    opts = { maxZoom: 20 };
  }

  _tileLayer = window.L.tileLayer(url, opts).addTo(_map);
}

function setupMap() {
  try {
    const mapDiv = document.getElementById('location-map');
    if (!mapDiv) return;

  const badge = document.getElementById('map-provider-badge');

  // Clean up Leaflet map if exists
  if (_map) {
    _map.remove();
    _map = null;
  }

  // Clean up Google markers if they exist
  if (_googleMarkers) {
    _googleMarkers.forEach(m => m.setMap(null));
    _googleMarkers = [];
  }
  _googleMap = null;

  // Clear innerHTML of map container to avoid conflicts
  mapDiv.innerHTML = '';

  const isGoogleTheme = _currentTheme.startsWith('google-');
  const googleAvailable = typeof window.google === 'object' && typeof window.google.maps === 'object';

  if (isGoogleTheme && googleAvailable) {
    if (badge) {
      badge.textContent = 'Google Maps Engine';
      badge.style.background = 'var(--accent)';
    }

    let mapTypeId = window.google.maps.MapTypeId.ROADMAP;
    let styles = [];
    if (_currentTheme === 'google-silver') {
      styles = [
        { "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }] },
        { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
        { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
        { "elementType": "labels.text.stroke", "stylers": [{ "color": "#f5f5f5" }] },
        { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
        { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
        { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
        { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
        { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
        { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] },
        { "featureType": "road.arterial", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
        { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#dadada" }] },
        { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
        { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
        { "featureType": "transit.line", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
        { "featureType": "transit.station", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
        { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#c9c9c9" }] },
        { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }
      ];
    }
    if (_currentTheme === 'google-satellite') mapTypeId = window.google.maps.MapTypeId.HYBRID;
    if (_currentTheme === 'google-terrain') mapTypeId = window.google.maps.MapTypeId.TERRAIN;

    _googleMap = new window.google.maps.Map(mapDiv, {
      center: { lat: _currentPos.lat, lng: _currentPos.lng },
      zoom: 13,
      mapTypeId: mapTypeId,
      styles: styles,
      disableDefaultUI: false
    });

    const userMarker = new window.google.maps.Marker({
      position: { lat: _currentPos.lat, lng: _currentPos.lng },
      map: _googleMap,
      draggable: true,
      title: 'Your Location'
    });

    userMarker.addListener('dragend', () => {
      const pos = userMarker.getPosition();
      _currentPos = { lat: pos.lat(), lng: pos.lng() };
      _googleMap.panTo(pos);
      loadNearbyProviders();
    });

    loadNearbyProviders();
  } else {
    if (badge) {
      badge.textContent = 'Leaflet Engine';
      badge.style.background = 'var(--primary)';
    }

    _map = window.L.map('location-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([_currentPos.lat, _currentPos.lng], 13);

    updateMapTileLayer();

    // Draw user marker
    const userMarker = window.L.marker([_currentPos.lat, _currentPos.lng], {
      draggable: true,
      title: 'Your Location'
    }).addTo(_map);

    userMarker.on('dragend', function (event) {
      const marker = event.target;
      const position = marker.getLatLng();
      _currentPos = { lat: position.lat, lng: position.lng };
      _map.panTo(new window.L.LatLng(_currentPos.lat, _currentPos.lng));
      loadNearbyProviders();
    });

    loadNearbyProviders();
  } } catch (err) { console.warn('[Location] setupMap fail:', err); }
}

export async function autoPromptGPS() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        _currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        await reverseGeocode(_currentPos.lat, _currentPos.lng);
        toastSuccess('Location Granted 📍', `Services mapped to ${_userLocationDetails.area}, ${_userLocationDetails.city}`);
        setupMap();
        updateLocationHeaderUI();
      },
      (err) => {
        console.warn('[Location] GPS permission skipped/denied:', err);
        reverseGeocode(_currentPos.lat, _currentPos.lng);
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  }
}

export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { 'Accept-Language': 'en' }
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const details = {
        display_name: data.display_name,
        city: addr.city || addr.town || addr.county || 'Bengaluru',
        state: addr.state || 'Karnataka',
        area: addr.suburb || addr.neighbourhood || addr.residential || addr.city_district || 'Central',
        road: addr.road || '',
        house_number: addr.house_number || '',
        postcode: addr.postcode || ''
      };
      _userLocationDetails = details;
      updateLocationHeaderUI();
      return details;
    }
  } catch (e) {
    console.warn('Reverse geocode fallback:', e);
  }
  return null;
}

function updateLocationHeaderUI() {
  const badge = document.getElementById('location-active-badge');
  if (badge) {
    badge.innerHTML = `📍 <b>${_userLocationDetails.area}, ${_userLocationDetails.city}</b> (${_userLocationDetails.state})`;
  }
  const banner = document.getElementById('dash-location-banner');
  if (banner) {
    banner.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:12px;margin-bottom:15px;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:1.4rem;">📍</span>
          <div>
            <div style="font-weight:700;font-size:0.9rem;color:var(--primary);">Detected Locality: ${_userLocationDetails.area}, ${_userLocationDetails.city} (${_userLocationDetails.state})</div>
            <div style="font-size:0.75rem;color:var(--text-secondary);">Showing top-rated specialists & emergency facilities in your city.</div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" id="btn-recenter-gps">🎯 Recenter GPS</button>
      </div>
    `;
    document.getElementById('btn-recenter-gps')?.addEventListener('click', requestGPS);
  }
}

async function requestGPS() {
  if (!navigator.geolocation) {
    toastError('Not Supported', 'Geolocation is not supported by your browser.');
    return;
  }
  toastInfo('Locating', 'Acquiring GPS coordinates...');
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      _currentPos = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      await reverseGeocode(_currentPos.lat, _currentPos.lng);
      toastSuccess('Location Updated 📍', `Center moved to ${_userLocationDetails.city}`);
      setupMap();
    },
    (err) => {
      console.warn('Geolocation error:', err);
      toastError('Permission Denied', 'Using default city coordinates. Drag marker on map to adjust.');
      setupMap();
    }
  );
}

async function loadNearbyProviders() {
  const filterType = document.getElementById('provider-type-filter')?.value || '';
  const listEl = document.getElementById('provider-list-items');
  if (listEl) {
    listEl.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  }

  // Clear existing markers
  if (_map && _markers) {
    _markers.forEach(m => _map.removeLayer(m));
  }
  _markers = [];

  if (_googleMarkers) {
    _googleMarkers.forEach(m => m.setMap(null));
  }
  _googleMarkers = [];

  try {
    const res = await api.get(`/providers/nearby?lat=${_currentPos.lat}&lng=${_currentPos.lng}&type=${filterType}&radius=15`);
    const providers = res.data || [];

    if (providers.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">No medical providers found within 15km.</div>';
      return;
    }

    renderProvidersList(providers);
    renderMapMarkers(providers);
  } catch (err) {
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-danger);">Failed to load nearest providers.</div>';
  }
}

let _routePolyline = null;

const PROVIDER_MEDIA = {
  doctor: {
    label: 'Doctor Clinic',
    color: '#8b5cf6',
    image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=200&q=80',
    icon: '🩺'
  },
  medical_store: {
    label: 'Pharmist Shop',
    color: '#10b981',
    image: 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=200&q=80',
    icon: '💊'
  },
  hospital: {
    label: 'Hospital Center',
    color: '#ef4444',
    image: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?auto=format&fit=crop&w=200&q=80',
    icon: '🏥'
  },
  laboratory: {
    label: 'Diagnostic Lab',
    color: '#f59e0b',
    image: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=200&q=80',
    icon: '🧪'
  },
  emergency_center: {
    label: 'Emergency Unit',
    color: '#dc2626',
    image: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=200&q=80',
    icon: '🚨'
  },
  ambulance_service: {
    label: 'Ambulance Station',
    color: '#f97316',
    image: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=200&q=80',
    icon: '🚑'
  }
};

function renderProvidersList(providers) {
  const listEl = document.getElementById('provider-list-items');
  if (!listEl) return;

  listEl.innerHTML = providers.map(p => {
    const cfg = PROVIDER_MEDIA[p.type] || PROVIDER_MEDIA.hospital;
    const pincode = p.address?.pincode || p.pincode || '560038';
    const coords = p.address?.coordinates?.coordinates || [77.5946, 12.9716];
    const targetLng = coords[0];
    const targetLat = coords[1];
    const dist = parseFloat(p.distanceKm || 1.8).toFixed(1);
    const etaMins = Math.ceil(dist * 3.5);

    return `
    <div class="card provider-item-card" data-id="${p._id}" data-lat="${targetLat}" data-lng="${targetLng}" style="padding:14px;margin-bottom:10px;display:flex;align-items:center;gap:14px;background:rgba(255,255,255,0.015);border-left:4px solid ${cfg.color};cursor:pointer;transition:all 0.2s;">
      <img src="${cfg.image}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;border:2px solid ${cfg.color};" alt="${p.name}">
      <div style="flex:1;">
        <div style="font-weight:700;font-size:.9rem;display:flex;align-items:center;gap:6px;">
          ${p.name}
          <span style="font-size:0.65rem;padding:2px 6px;border-radius:99px;background:${cfg.color}20;color:${cfg.color};font-weight:700;">${cfg.label}</span>
        </div>
        <div style="font-size:.75rem;color:var(--text-secondary);margin-top:2px;">${p.address?.street || ''}, ${p.address?.city || ''} &middot; <b>PIN: ${pincode}</b></div>
        <div style="font-size:.75rem;color:var(--primary);font-weight:600;margin-top:2px;">📍 ${dist} km away &middot; ⏱️ ~${etaMins} mins drive</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
        <button class="btn btn-primary btn-sm btn-nav-route" data-lat="${targetLat}" data-lng="${targetLng}" data-name="${p.name}" style="padding:5px 10px;font-size:.72rem;font-weight:700;">🗺️ Navigate</button>
        <button class="btn btn-outline btn-sm btn-pref-save" data-id="${p._id}" style="padding:3px 8px;font-size:.68rem;">Save Preferred</button>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.provider-item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const lat = parseFloat(card.dataset.lat);
      const lng = parseFloat(card.dataset.lng);
      drawRouteToFacility(lat, lng);
    });
  });

  listEl.querySelectorAll('.btn-nav-route').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      const name = btn.dataset.name;
      drawRouteToFacility(lat, lng);
      openExternalGPS(lat, lng, name);
    });
  });

  listEl.querySelectorAll('.btn-pref-save').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = providers.find(item => item._id === btn.dataset.id);
      if (p) savePreferredProvider(p);
    });
  });
}

function drawRouteToFacility(destLat, destLng) {
  if (_map) {
    if (_routePolyline) {
      _map.removeLayer(_routePolyline);
    }
    const points = [
      [_currentPos.lat, _currentPos.lng],
      [destLat, destLng]
    ];
    _routePolyline = window.L.polyline(points, {
      color: '#6366f1',
      weight: 5,
      opacity: 0.8,
      dashArray: '8, 8'
    }).addTo(_map);
    _map.fitBounds(_routePolyline.getBounds(), { padding: [40, 40] });
    toastInfo('Route Formed 🗺️', 'Live GPS path drawn on map.');
  }
}

function openExternalGPS(lat, lng, name) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, '_blank');
  toastSuccess('Launching Navigation 🚗', `Opening Google Maps turn-by-turn directions to ${name}`);
}

function renderMapMarkers(providers) {
  const isGoogleTheme = _currentTheme.startsWith('google-');
  const googleAvailable = typeof window.google === 'object' && typeof window.google.maps === 'object';

  if (isGoogleTheme && googleAvailable && _googleMap) {
    providers.forEach(p => {
      const coords = p.address.coordinates.coordinates;
      const lng = coords[0];
      const lat = coords[1];
      const cfg = PROVIDER_MEDIA[p.type] || PROVIDER_MEDIA.hospital;

      const marker = new window.google.maps.Marker({
        position: { lat, lng },
        map: _googleMap,
        title: `${p.name} (${cfg.label})`
      });

      const infowindow = new window.google.maps.InfoWindow({
        content: `
          <div style="color:#000;padding:6px;max-width:200px;font-family:sans-serif;">
            <img src="${cfg.image}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:6px;">
            <strong>${p.name}</strong><br/>
            <span style="color:${cfg.color};font-weight:bold;">${cfg.label}</span><br/>
            PIN: ${p.address?.pincode || '560038'}<br/>
            <button style="margin-top:6px;width:100%;background:${cfg.color};color:#fff;border:none;padding:5px;border-radius:4px;font-weight:bold;cursor:pointer;" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}','_blank')">🗺️ GPS Directions</button>
          </div>`
      });

      marker.addListener('click', () => infowindow.open({ anchor: marker, map: _googleMap }));
      _googleMarkers.push(marker);
    });
  } else if (_map) {
    providers.forEach(p => {
      const coords = p.address.coordinates.coordinates;
      const lng = coords[0];
      const lat = coords[1];
      const cfg = PROVIDER_MEDIA[p.type] || PROVIDER_MEDIA.hospital;
      const pincode = p.address?.pincode || p.pincode || '560038';
      const dist = parseFloat(p.distanceKm || 1.8).toFixed(1);
      const etaMins = Math.ceil(dist * 3.5);

      const icon = window.L.divIcon({
        html: `
          <div style="
            position:relative; width:44px; height:44px; border-radius:50%; border:3px solid ${cfg.color};
            box-shadow:0 4px 14px rgba(0,0,0,0.5); overflow:hidden; background:#102a43; cursor:pointer;
            transform:translate(-50%, -50%); transition:transform 0.2s;
          " title="${p.name}">
            <img src="${cfg.image}" style="width:100%;height:100%;object-fit:cover;" alt="${p.name}">
          </div>`,
        className: 'photo-provider-pin',
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      const m = window.L.marker([lat, lng], { icon }).addTo(_map);
      m.bindPopup(`
        <div style="font-family:sans-serif;padding:6px;max-width:210px;">
          <img src="${cfg.image}" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:8px;">
          <div style="font-weight:bold;font-size:0.95rem;color:${cfg.color};">${p.name}</div>
          <div style="font-size:0.78rem;color:#475569;margin-top:2px;"><b>Category:</b> ${cfg.label}</div>
          <div style="font-size:0.78rem;color:#475569;"><b>Service PIN:</b> ${pincode}</div>
          <div style="font-size:0.78rem;color:#475569;"><b>Distance:</b> ${dist} km (~${etaMins} mins)</div>
          <div style="display:flex;gap:6px;margin-top:10px;">
            <button style="flex:1;background:${cfg.color};color:#fff;border:none;padding:6px;border-radius:6px;font-size:0.72rem;font-weight:bold;cursor:pointer;" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}','_blank')">🚗 GPS Drive</button>
            <button style="flex:1;background:#6366f1;color:#fff;border:none;padding:6px;border-radius:6px;font-size:0.72rem;font-weight:bold;cursor:pointer;" onclick="import('./router.js').then(m=>m.navigate('${p.type==='doctor'?'consultation':p.type==='medical_store'?'pharmacy':'dashboard'}'))">Select</button>
          </div>
        </div>
      `);
      _markers.push(m);
    });
  }
}

function savePreferredProvider(provider) {
  _preferredProvider = provider;
  const prefEl = document.getElementById('preferred-provider-card');
  if (!prefEl) return;

  const emojis = {
    hospital: '🏥',
    doctor: '🩺',
    medical_store: '💊',
    laboratory: '🧪',
    emergency_center: '🚨',
    ambulance_service: '🚑'
  };

  prefEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="font-size:2rem;">${emojis[provider.type] || '🏥'}</div>
      <div>
        <div style="font-weight:700;font-size:1rem;color:var(--primary);">${provider.name}</div>
        <div style="font-size:.8rem;color:var(--text-secondary);margin-top:4px;">${provider.address?.street || ''}</div>
        <div style="font-size:.8rem;color:var(--text-secondary);">Phone: ${provider.phone || 'N/A'}</div>
        <div style="font-size:.8rem;color:var(--success);margin-top:6px;font-weight:600;">✓ Active Routing Link Established</div>
      </div>
    </div>
  `;
  toastSuccess('Saved Preferred', `${provider.name} registered as your primary care node.`);
}
