/**
 * ambient-monitor.js — Real-Time Vital Signs Monitor & Ambient AI Alert Client
 * ============================================================================
 * Connects to the Triage Service SSE stream to receive real-time ambient AI
 * alerts. Renders a live vital-signs dashboard with animated ECG sparkline.
 * Drives the alert bar and alert timeline in the dashboard.
 * ============================================================================
 */

import { getState } from './store.js';

// ── Waveform Renderers ────────────────────────────────────────────────────────

const ECG_TEMPLATE = [0, 0, 0.05, 0.1, 0, -0.2, 1.0, -0.4, 0, 0.15, 0.1, 0, 0, 0, 0];
const SPO2_TEMPLATE = [0.2, 0.3, 0.5, 0.7, 0.9, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.1, 0.1, 0.1];

class WaveformMonitor {
  constructor(canvas, colour, template) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.colour  = colour;
    this.template = template;
    this.data    = Array(120).fill(0.3);
    this.templateIdx = 0;
    this.rafId   = null;
  }

  _tick() {
    this.data.push(this.template[this.templateIdx % this.template.length]);
    this.templateIdx++;
    if (this.data.length > 120) this.data.shift();
  }

  draw() {
    const { canvas, ctx, data, colour } = this;
    if (!canvas) return;
    const W = canvas.width  = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = colour;
    ctx.shadowBlur = 4;
    ctx.beginPath();

    const mid = H / 2;
    const amplitude = H * 0.4;
    const step = W / (data.length - 1);

    data.forEach((v, i) => {
      const x = i * step;
      const y = mid - v * amplitude;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  start() {
    const loop = () => {
      this._tick();
      this.draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() { if (this.rafId) cancelAnimationFrame(this.rafId); }
}

let _ecgMonitor = null;
let _spo2Monitor = null;

export function startECGSparkline(canvasId = 'ecg-canvas') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (_ecgMonitor) _ecgMonitor.stop();
  _ecgMonitor = new WaveformMonitor(canvas, '#f43f5e', ECG_TEMPLATE);
  _ecgMonitor.start();

  const spo2Canvas = document.getElementById('spo2-canvas');
  if (spo2Canvas) {
    if (_spo2Monitor) _spo2Monitor.stop();
    _spo2Monitor = new WaveformMonitor(spo2Canvas, '#3b82f6', SPO2_TEMPLATE);
    _spo2Monitor.start();
  }
}


// ── Alert Bar Controller ──────────────────────────────────────────────────────

class AlertBarController {
  constructor() {
    this.bar        = document.getElementById('ambient-alert-bar');
    this.inner      = this.bar?.querySelector('.alert-bar-inner');
    this.titleEl    = this.bar?.querySelector('.alert-bar-title');
    this.subEl      = this.bar?.querySelector('.alert-bar-sub');
    this.dismissBtn = this.bar?.querySelector('#alert-bar-dismiss');
    this._timeout   = null;

    this.dismissBtn?.addEventListener('click', () => this.hide());
  }

  show({ severity, alertType, anomalyScore, predictedEventMin, action }) {
    if (!this.bar) return;

    // Update content
    const severityLabels = {
      advisory:  '🔵 Advisory',
      warning:   '🟡 Warning',
      critical:  '🟠 Critical Alert',
      emergency: '🔴 EMERGENCY',
    };

    const actionLabels = {
      patient_notification:   'A notification has been sent to you.',
      schedule_consultation:  'A consultation has been automatically scheduled.',
      immediate_consultation: 'Immediate consultation initiated — check your schedule.',
      emergency_services:     'Emergency services have been notified.',
    };

    this.titleEl.textContent =
      `${severityLabels[severity] || severity}: ${(alertType || '').replace(/_/g,' ')}`;
    this.subEl.textContent =
      `Anomaly score: ${(anomalyScore * 100).toFixed(0)}%` +
      (predictedEventMin ? ` · Est. event: ${predictedEventMin} min` : '') +
      ` · ${actionLabels[action] || action}`;

    // Style
    this.inner.className = `alert-bar-inner ${severity}`;

    // Show
    this.bar.classList.add('visible');

    // Auto-dismiss non-emergency alerts after 12s
    clearTimeout(this._timeout);
    if (severity !== 'emergency') {
      this._timeout = setTimeout(() => this.hide(), 12_000);
    }
  }

  hide() {
    this.bar?.classList.remove('visible');
  }
}


// ── Vitals Display ────────────────────────────────────────────────────────────

function updateVitalTile(id, value, unit, trend) {
  const tile = document.getElementById(id);
  if (!tile) return;

  const valEl   = tile.querySelector('.vital-value');
  const trendEl = tile.querySelector('.vital-trend');

  if (valEl && value != null) {
    const formatted = typeof value === 'number' ? value.toFixed(value < 10 ? 1 : 0) : '—';
    if (valEl.textContent !== formatted) {
      valEl.textContent = formatted;
      valEl.classList.add('number-in');
      valEl.addEventListener('animationend', () => valEl.classList.remove('number-in'), { once: true });
    }
  }

  if (trendEl && trend) {
    const icons = { up: '↑', down: '↓', stable: '→' };
    trendEl.textContent = icons[trend] || '';
    trendEl.className = `vital-trend ${trend}`;
  }
}

function updateAnomalyBar(score) {
  const fill     = document.getElementById('anomaly-bar-fill');
  const scoreEl  = document.getElementById('anomaly-score-value');
  if (!fill) return;

  const pct = Math.round(score * 100);
  fill.style.width = `${pct}%`;
  fill.className = 'anomaly-fill ' + (
    score < 0.50 ? 'normal'   :
    score < 0.70 ? 'advisory' :
    score < 0.85 ? 'warning'  :
    score < 0.95 ? 'critical' : 'emergency'
  );

  if (scoreEl) {
    scoreEl.textContent = `${pct}%`;
    scoreEl.style.color = score >= 0.70 ? 'var(--alert-warning)' : 'var(--text-secondary)';
  }
}

function pushAlertToTimeline(alert) {
  const tl = document.getElementById('alert-timeline');
  if (!tl) return;

  const icons = {
    cardiac_arrhythmia:  '💓',
    hypoxic_episode:     '🫁',
    hypoglycemic_crash:  '🩸',
    hypertensive_crisis: '💉',
    fever_onset:         '🌡️',
    sleep_apnea_event:   '😴',
    composite_risk:      '⚠️',
  };

  const timeAgo = new Date(alert.timestamp).toLocaleTimeString();
  const item = document.createElement('div');
  item.className = 'alert-timeline-item fade-up';
  item.innerHTML = `
    <div class="timeline-dot ${alert.severity}">
      ${icons[alert.alert_type] || '🔔'}
    </div>
    <div class="timeline-content">
      <div class="timeline-title">${(alert.alert_type || '').replace(/_/g,' ')}</div>
      <div class="timeline-meta">${timeAgo} · ${alert.action_taken || ''}</div>
      <div class="timeline-score">Score: ${(alert.anomaly_score * 100).toFixed(0)}%</div>
    </div>
  `;

  // Prepend (newest first)
  tl.insertBefore(item, tl.firstChild);

  // Limit to 20 items
  while (tl.children.length > 20) tl.removeChild(tl.lastChild);
}


// ── SSE Connection ────────────────────────────────────────────────────────────

let _sseSource = null;
let _ecgSparkline = null;
const alertBar = new AlertBarController();

/**
 * Connect to the Triage Service SSE alert stream for the current patient.
 * Should be called once when the dashboard loads.
 */
export function connectAmbientStream() {
  const user = getState('user');
  if (!user) return;

  // Use DID if present, otherwise encode the user ID
  const did = user.did || `did:mediflow:${user._id}`;
  const encodedDid = encodeURIComponent(did);

  const triageUrl = (window.ENV_TRIAGE_URL || 'http://localhost:8002');
  const url = `${triageUrl}/api/triage/stream/${encodedDid}`;

  // Clean up any existing connection
  if (_sseSource) {
    _sseSource.close();
    _sseSource = null;
  }

  _sseSource = new EventSource(url);

  _sseSource.addEventListener('connected', () => {
    console.log('[AmbientMonitor] SSE stream connected');
    updateMonitoringStatus(true);
  });

  _sseSource.addEventListener('alert', (e) => {
    try {
      const alert = JSON.parse(e.data);
      console.log('[AmbientMonitor] Alert received:', alert);

      // 1. Show the alert bar
      alertBar.show({
        severity:          alert.severity,
        alertType:         alert.alert_type,
        anomalyScore:      alert.anomaly_score,
        predictedEventMin: alert.predicted_event_min,
        action:            alert.action_taken,
      });

      // 2. Update the anomaly bar
      updateAnomalyBar(alert.anomaly_score);

      // 3. Add to the timeline
      pushAlertToTimeline(alert);

    } catch (err) {
      console.warn('[AmbientMonitor] Failed to parse alert:', err);
    }
  });

  _sseSource.addEventListener('heartbeat', () => {
    // The stream is alive — could update a "last ping" indicator here
  });

  _sseSource.onerror = () => {
    // Browser will auto-retry SSE on error (per spec)
    updateMonitoringStatus(false);
  };
}

function updateMonitoringStatus(active) {
  const dot = document.getElementById('vitals-status-dot');
  const label = document.getElementById('vitals-status-label');
  if (dot) dot.className = `vitals-status-dot ${active ? '' : 'inactive'}`;
  if (label) label.textContent = active ? 'Live Monitoring' : 'Waiting for connection...';
}



/**
 * Ingest a simulated/real biometric reading and update all vital tiles.
 * @param {object} vitals
 */
export function updateVitalsDisplay(vitals) {
  updateVitalTile('vital-tile-hr',   vitals.heart_rate_bpm,       'bpm',   vitals.hr_trend);
  updateVitalTile('vital-tile-spo2', vitals.spo2_pct,             '%',     vitals.spo2_trend);
  updateVitalTile('vital-tile-sbp',  vitals.systolic_bp_mmhg,     'mmHg',  vitals.bp_trend);
  updateVitalTile('vital-tile-temp', vitals.body_temperature_c,   '°C',    vitals.temp_trend);
  updateVitalTile('vital-tile-gluc', vitals.glucose_mg_dl,        'mg/dL', vitals.gluc_trend);
  updateVitalTile('vital-tile-rr',   vitals.respiratory_rate,     'bpm',   vitals.rr_trend);

  if (_ecgSparkline && vitals.heart_rate_bpm) {
    _ecgSparkline.updateBPM(vitals.heart_rate_bpm);
  }
}

/**
 * Simulate live vitals (when no real IoT device is connected).
 * Generates realistic variations around healthy baseline values.
 */
export function startVitalSimulation() {
  let tick = 0;
  const profile = {
    hr:   72, spo2: 97.5, sbp: 120, temp: 36.8, gluc: 98, rr: 14,
  };

  const interval = setInterval(() => {
    tick++;

    // Healthy variations with occasional mild anomaly for demo
    const vitals = {
      heart_rate_bpm:     Math.round(profile.hr + (Math.random() - 0.5) * 6),
      spo2_pct:           parseFloat((profile.spo2 + (Math.random() - 0.5) * 0.8).toFixed(1)),
      systolic_bp_mmhg:   Math.round(profile.sbp + (Math.random() - 0.5) * 8),
      body_temperature_c: parseFloat((profile.temp + (Math.random() - 0.4) * 0.15).toFixed(2)),
      glucose_mg_dl:      Math.round(profile.gluc + (Math.random() - 0.5) * 8),
      respiratory_rate:   Math.round(profile.rr + (Math.random() - 0.5) * 2),
      hr_trend:   'stable',
      spo2_trend: 'stable',
      bp_trend:   'stable',
    };

    // Simulate a mildly elevated anomaly score at tick 30 (demonstrates anomaly detection)
    if (tick === 30) {
      vitals.spo2_pct = 92.4;
      vitals.heart_rate_bpm = 97;
      vitals.spo2_trend = 'down';
      vitals.hr_trend = 'up';

      updateAnomalyBar(0.72);
      alertBar.show({
        severity:          'warning',
        alertType:         'hypoxic_episode',
        anomalyScore:      0.72,
        predictedEventMin: 45,
        action:            'schedule_consultation',
      });
      pushAlertToTimeline({
        severity:     'warning',
        alert_type:   'hypoxic_episode',
        anomaly_score: 0.72,
        action_taken: 'consultation_created',
        timestamp:    new Date().toISOString(),
      });
    } else {
      updateAnomalyBar(0.12 + Math.random() * 0.08);
    }

    updateVitalsDisplay(vitals);
  }, 2000);  // Update every 2 seconds

  return () => clearInterval(interval);
}

export { alertBar };
