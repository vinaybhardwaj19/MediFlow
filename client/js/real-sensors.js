/**
 * real-sensors.js — Real Webcam PPG (Photoplethysmography) Sensor Engine
 * ============================================================================
 * Implements real-time biometric sensing via hardware APIs:
 * 1. Webcam PPG for heart rate detection using green-channel intensity analysis.
 * 2. Web Speech API for AI voice assistant commands.
 * 3. DeviceMotion API for activity/posture detection.
 * 
 * NOTE: Webcam PPG provides ESTIMATED heart rate only. For clinical accuracy,
 * a medical-grade pulse oximeter or ECG device is required.
 * ============================================================================
 */

import { updateVitalsDisplay } from './ambient-monitor.js';
import { toastInfo, toastSuccess } from './toast.js';
import { navigate } from './router.js';

let _video = null;
let _canvas = null;
let _ctx = null;
let _stream = null;
let _ppgActive = false;

// ── 1. Webcam PPG Engine ─────────────────────────────────────────────────────
const PPG_SAMPLES = 256;       // ~8 seconds at 30fps
const MIN_SAMPLES_FOR_HR = 90; // Need at least ~3s of data
const ppgData = [];
const ppgTimes = [];
let lastPpgUpdate = 0;
let _signalQuality = 'WAITING'; // WAITING | LOW | FAIR | GOOD

export async function initRealSensorEngine() {
  _video = document.getElementById('sensing-video');
  _canvas = document.getElementById('sensing-canvas');
  _ctx = _canvas?.getContext('2d', { willReadFrequently: true });

  document.getElementById('real-sensor-btn')?.addEventListener('click', togglePPG);

  // Init Voice Commands
  initVoiceAssistant();

  // Init Device Motion
  initActivitySensing();
}

async function togglePPG() {
  if (_ppgActive) {
    stopPPG();
    return;
  }
  
  try {
    _stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    if (_video) {
      _video.srcObject = _stream;
      _video.play().catch(e => console.warn('Video play prevented:', e));
    }
    _ppgActive = true;
    _signalQuality = 'WAITING';
    ppgData.length = 0;
    ppgTimes.length = 0;
    document.getElementById('ppg-hud')?.classList.remove('hidden');
    document.getElementById('real-sensor-btn').textContent = '⏹ Stop Sensor';
    document.getElementById('ppg-hr-val').textContent = 'Calibrating...';
    updateQualityLabel();
    toastSuccess('Webcam PPG Active', 'Keep your face steady in front of the camera. Heart rate will be estimated from subtle skin colour changes.');
    requestAnimationFrame(processPPGFrame);
  } catch (err) {
    console.error('PPG Error:', err);
    toastInfo('Permission Required', 'Camera access is needed for webcam-based heart rate estimation.');
  }
}

function stopPPG() {
  _ppgActive = false;
  if (_stream) _stream.getTracks().forEach(t => t.stop());
  document.getElementById('ppg-hud')?.classList.add('hidden');
  document.getElementById('real-sensor-btn').textContent = '📷 Real PPG Sensor';
  _signalQuality = 'WAITING';
}

function processPPGFrame() {
  if (!_ppgActive || !_ctx) return;

  if (_video.readyState >= 2 && _video.videoWidth > 0) {
    // Sample the centre region of the face (forehead area gives best PPG signal)
    const cx = Math.floor(_video.videoWidth / 2);
    const cy = Math.floor(_video.videoHeight / 3); // Upper third — forehead region
    const size = Math.min(64, _video.videoWidth, _video.videoHeight);
    const sx = Math.max(0, cx - size / 2);
    const sy = Math.max(0, cy - size / 2);
    
    _ctx.drawImage(_video, sx, sy, size, size, 0, 0, 128, 128);
    const imgData = _ctx.getImageData(0, 0, 128, 128).data;

    // Extract average green channel intensity (PPG primarily uses green light)
    let g = 0, r = 0;
    const pixelCount = imgData.length / 4;
    for (let i = 0; i < imgData.length; i += 4) {
      r += imgData[i];
      g += imgData[i + 1];
    }
    const avgG = g / pixelCount;
    const avgR = r / pixelCount;
    
    ppgData.push(avgG);
    ppgTimes.push(Date.now());
    if (ppgData.length > PPG_SAMPLES) {
      ppgData.shift();
      ppgTimes.shift();
    }

    // Compute signal quality based on variance and brightness
    computeSignalQuality(avgG, avgR);
    drawPPGGraph();
    calculateHR();
  }

  requestAnimationFrame(processPPGFrame);
}

function computeSignalQuality(avgG, avgR) {
  if (ppgData.length < 30) {
    _signalQuality = 'WAITING';
    updateQualityLabel();
    return;
  }

  // Check if there's enough variation in the green channel (indicates blood flow pulsation)
  const recent = ppgData.slice(-30);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length;
  const stdDev = Math.sqrt(variance);
  
  // Coefficient of variation — indicates signal strength relative to mean
  const cv = (stdDev / mean) * 100;

  // Very low brightness = finger covering camera (good for PPG!)
  // Moderate brightness with subtle variation = face (acceptable for PPG)
  // No variation = no signal
  if (cv < 0.02) {
    _signalQuality = 'LOW';
  } else if (cv < 0.1) {
    _signalQuality = 'FAIR';
  } else {
    _signalQuality = 'GOOD';
  }
  
  updateQualityLabel();
}

function updateQualityLabel() {
  const qualEl = document.getElementById('ppg-quality');
  if (!qualEl) return;
  
  const colors = { WAITING: 'var(--text-muted)', LOW: '#ef4444', FAIR: '#f59e0b', GOOD: 'var(--success)' };
  qualEl.textContent = `QUAL: ${_signalQuality}`;
  qualEl.style.color = colors[_signalQuality] || 'var(--text-muted)';
}

function drawPPGGraph() {
  const gCanvas = document.getElementById('ppg-graph');
  if (!gCanvas) return;
  const ctx = gCanvas.getContext('2d');
  const W = gCanvas.width, H = gCanvas.height;
  ctx.clearRect(0, 0, W, H);
  
  if (ppgData.length < 2) return;
  
  // Use colour coding based on signal quality
  const qualColors = { WAITING: '#64748b', LOW: '#ef4444', FAIR: '#f59e0b', GOOD: '#6366f1' };
  ctx.strokeStyle = qualColors[_signalQuality] || '#6366f1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  const min = Math.min(...ppgData);
  const max = Math.max(...ppgData);
  const range = max - min || 1;

  ppgData.forEach((v, i) => {
    const x = (i / PPG_SAMPLES) * W;
    const y = H - ((v - min) / range) * H;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function calculateHR() {
  const now = Date.now();
  if (now - lastPpgUpdate < 2500 || ppgData.length < MIN_SAMPLES_FOR_HR) return;

  // Smooth the data with a moving average to reduce noise
  const smoothed = [];
  const windowSize = 5;
  for (let i = 0; i < ppgData.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - Math.floor(windowSize / 2)); j <= Math.min(ppgData.length - 1, i + Math.floor(windowSize / 2)); j++) {
      sum += ppgData[j];
      count++;
    }
    smoothed.push(sum / count);
  }

  // Detrend: subtract rolling baseline to isolate pulsatile component
  const detrended = [];
  const baselineWindow = 30;
  for (let i = 0; i < smoothed.length; i++) {
    let baseSum = 0, baseCount = 0;
    for (let j = Math.max(0, i - baselineWindow); j <= Math.min(smoothed.length - 1, i + baselineWindow); j++) {
      baseSum += smoothed[j];
      baseCount++;
    }
    detrended.push(smoothed[i] - (baseSum / baseCount));
  }

  // Count zero-crossings (positive direction) as a frequency estimator
  let zeroCrossings = 0;
  for (let i = 1; i < detrended.length; i++) {
    if (detrended[i - 1] < 0 && detrended[i] >= 0) {
      zeroCrossings++;
    }
  }

  // Also count peaks above a threshold
  const absMax = Math.max(...detrended.map(Math.abs));
  const threshold = absMax * 0.3;
  let peaks = 0;
  for (let i = 1; i < detrended.length - 1; i++) {
    if (detrended[i] > threshold && detrended[i] > detrended[i - 1] && detrended[i] > detrended[i + 1]) {
      peaks++;
    }
  }

  // Calculate actual time window in seconds
  const timeWindowSec = (ppgTimes[ppgTimes.length - 1] - ppgTimes[0]) / 1000;
  if (timeWindowSec <= 1) return;

  // Use peak count for HR estimation (more reliable than zero-crossings for PPG)
  const estHR = Math.round((peaks / timeWindowSec) * 60);
  
  // Physiologically plausible range: 40–180 BPM
  const isPlausible = estHR >= 40 && estHR <= 180;
  
  const hrEl = document.getElementById('ppg-hr-val');
  if (hrEl) {
    if (!isPlausible || _signalQuality === 'LOW' || _signalQuality === 'WAITING') {
      hrEl.textContent = _signalQuality === 'WAITING' ? 'Calibrating...' : `~${estHR > 180 ? '—' : estHR} BPM (weak signal)`;
    } else {
      hrEl.textContent = `${estHR} BPM`;
    }
  }

  // Only update vitals display with REAL webcam HR — no fake values for other vitals
  if (isPlausible && _signalQuality !== 'LOW') {
    updateVitalsDisplay({ 
      heart_rate_bpm: estHR,
      hr_trend: estHR > 90 ? 'up' : estHR < 65 ? 'down' : 'stable',
    });
  }
  
  lastPpgUpdate = now;
}

// ── 2. AI Voice Assistant ────────────────────────────────────────────────────
function initVoiceAssistant() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const command = event.results[event.results.length - 1][0].transcript.toLowerCase();
    console.log('[MediBot Voice]', command);
    
    if (command.includes('vitals') || command.includes('dashboard')) navigate('dashboard');
    if (command.includes('pharmacy') || command.includes('medicine')) navigate('pharmacy');
    if (command.includes('triage') || command.includes('symptom')) navigate('triage');
    if (command.includes('consult') || command.includes('doctor')) navigate('consultation');
    
    toastInfo('Voice Command', `Recognized: "${command}"`);
  };

  // Auto-start if user interacts
  document.addEventListener('click', () => {
    try { recognition.start(); } catch {}
  }, { once: true });
}

// ── 3. Device Motion Sensing ─────────────────────────────────────────────────
function initActivitySensing() {
  window.addEventListener('devicemotion', (event) => {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const total = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
    const activity = total > 15 ? 'Running' : total > 11 ? 'Walking' : 'Resting';
    
    // update some UI if needed
    const statusLabel = document.getElementById('vitals-status-label');
    if (statusLabel && activity !== 'Resting') {
       statusLabel.textContent = `Activity: ${activity}`;
    }
  });
}
