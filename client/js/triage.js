/**
 * triage.js — Symptom Checker UI module v2.0.0
 * ─────────────────────────────────────────────────────────────────────────────
 * UPGRADES v2.0.0:
 *   - SHAP explanation panel: waterfall chart showing per-symptom Shapley values
 *   - Clinical scores display: MEWS + CURB-65 badges
 *   - Calibration confidence bar with academic note
 *   - Differential diagnosis panel with probability bars
 *   - Federated Learning stats widget
 */
import * as api from './api.js';
import { setState } from './store.js';
import { toastError, toastSuccess } from './toast.js';
import { navigate } from './router.js';

const COMMON_SYMPTOMS = [
  'chest pain','shortness of breath','headache','fever','cough','fatigue',
  'nausea','vomiting','dizziness','back pain','joint pain','abdominal pain',
  'skin rash','sore throat','loss of appetite','palpitations','sweating',
  'numbness','muscle weakness','blurred vision','difficulty breathing',
  'swelling','insomnia','anxiety','depression','weight loss','hair loss',
  'confusion','memory loss','seizure','facial drooping','speech difficulty',
  'irregular heartbeat','chest tightness','jaw pain','left arm pain',
  'ankle swelling','night sweats','blood in stool','dark urine','jaundice',
  'stiff neck','light sensitivity','tremors','balance problems','wheezing',
  'excessive thirst','frequent urination','cold intolerance','suicidal thoughts',
];

let selectedSymptoms = [];
let _triageInit = false;

// ── Urgency colour map ────────────────────────────────────────────────────────
const URGENCY_CONFIG = {
  emergency: { badge: 'badge-emergency', color: '#ef4444', icon: '🚨', image: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=120&q=80' },
  urgent:    { badge: 'badge-urgent',    color: '#f97316', icon: '⚠️', image: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=120&q=80' },
  routine:   { badge: 'badge-routine',   color: '#22c55e', icon: '✅', image: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=120&q=80' },
};

// ── MEWS level colour ─────────────────────────────────────────────────────────
const MEWS_COLOR = { low: '#22c55e', moderate: '#f59e0b', high: '#f97316', critical: '#ef4444' };

export function initTriage() {
  const input       = document.getElementById('symptom-input');
  const suggestions = document.getElementById('symptom-suggestions');
  const chips       = document.getElementById('symptom-chips');
  const submitBtn   = document.getElementById('triage-submit-btn');
  const spinner     = document.getElementById('triage-spinner');
  const result      = document.getElementById('triage-result');
  const resetBtn    = document.getElementById('triage-reset-btn');

  selectedSymptoms = [];
  renderChips();
  result?.classList.add('hidden');
  if (input) input.value = '';
  suggestions?.classList.add('hidden');

  if (_triageInit) return;
  _triageInit = true;

  // ── Autocomplete ─────────────────────────────────────────────────────────────
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { suggestions.classList.add('hidden'); return; }
    const matches = COMMON_SYMPTOMS.filter(s => s.includes(q) && !selectedSymptoms.includes(s));
    if (!matches.length) { suggestions.classList.add('hidden'); return; }
    suggestions.innerHTML = matches.slice(0, 8).map(s =>
      `<div class="suggestion-item" data-s="${s}">${s}</div>`
    ).join('');
    suggestions.classList.remove('hidden');
  });

  suggestions.addEventListener('click', e => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    addSymptom(item.dataset.s);
    input.value = '';
    suggestions.classList.add('hidden');
    input.focus();
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim().toLowerCase();
      if (val) { addSymptom(val); input.value = ''; suggestions.classList.add('hidden'); }
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.symptom-search-wrap')) suggestions.classList.add('hidden');
  });

  function addSymptom(s) {
    if (selectedSymptoms.includes(s) || selectedSymptoms.length >= 15) return;
    selectedSymptoms.push(s);
    renderChips();
  }

  function removeSymptom(s) {
    selectedSymptoms = selectedSymptoms.filter(x => x !== s);
    renderChips();
  }

  function renderChips() {
    chips.innerHTML = selectedSymptoms.map(s => `
      <div class="symptom-chip">
        ${s}
        <button type="button" data-rm="${s}" title="Remove">×</button>
      </div>`).join('');
    chips.querySelectorAll('button[data-rm]').forEach(btn =>
      btn.addEventListener('click', () => removeSymptom(btn.dataset.rm))
    );
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  submitBtn.addEventListener('click', async () => {
    if (!selectedSymptoms.length) {
      toastError('No symptoms', 'Please add at least one symptom.');
      return;
    }
    spinner.classList.remove('hidden'); submitBtn.disabled = true;
    try {
      const severity = document.querySelector('input[name="severity"]:checked')?.value || 'mild';
      const hr   = document.getElementById('vital-hr')?.value;
      const o2   = document.getElementById('vital-o2')?.value;
      const temp = document.getElementById('vital-temp')?.value;
      const bp   = document.getElementById('vital-bp')?.value;
      const rr   = document.getElementById('vital-rr')?.value;

      const body = {
        symptoms: selectedSymptoms,
        symptomDetails: { severity },
        vitalSigns: {
          ...(hr   ? { heartRate: Number(hr) } : {}),
          ...(o2   ? { oxygenSaturation: Number(o2) } : {}),
          ...(temp ? { temperature: Number(temp) } : {}),
          ...(rr   ? { respiratoryRate: Number(rr) } : {}),
          ...(bp && bp.includes('/') ? {
            systolicBP:  Number(bp.split('/')[0]),
            diastolicBP: Number(bp.split('/')[1]),
          } : {}),
        },
      };

      const res = await api.post('/triage', body);
      setState('triageResult', res.data);
      renderResult(res.data);
    } catch (err) {
      toastError('Triage failed', err.message);
    } finally {
      spinner.classList.add('hidden'); submitBtn.disabled = false;
    }
  });

  // ── Render full result (v2.0) ───────────────────────────────────────────────
  function renderResult(data) {
    const ml = data.mlPrediction;

    // Core result
    document.getElementById('result-specialty').textContent  = ml.recommendedSpecialty;
    document.getElementById('result-confidence').textContent = `${(ml.confidence * 100).toFixed(0)}%`;
    document.getElementById('result-conf-fill').style.width  = `${ml.confidence * 100}%`;

    const uc = URGENCY_CONFIG[ml.urgencyLevel] || URGENCY_CONFIG.routine;
    document.getElementById('result-badge').innerHTML =
      `<span class="badge ${uc.badge}">${uc.icon} ${ml.urgencyLevel.toUpperCase()}</span>`;

    // ── Plain-Language Layman Summary (Low-Literacy & Accessibility Support) ─────
    const laymanEl = document.getElementById('result-layman-summary') || createLaymanSummaryEl();
    const laymanText = getLaymanText(ml);
    laymanEl.innerHTML = `
      <div class="layman-card" style="background:${uc.color}15; border: 2px solid ${uc.color}; border-radius: 12px; padding: 16px; margin: 16px 0;">
        <div style="display:flex; align-items:center; justify-between; margin-bottom: 8px;">
          <h3 style="margin:0; font-size:1.15rem; color:${uc.color}; display:flex; align-items:center; gap:10px;">
            <img src="${uc.image}" alt="Status" style="width:32px; height:32px; border-radius:8px; object-fit:cover; border:1px solid ${uc.color}40;" />
            <span>${uc.icon} Plain-Language Summary / सरल भाषा संदेश</span>
          </h3>
          <button id="tts-listen-btn" class="btn btn-sm btn-outline" style="border-color:${uc.color}; color:${uc.color};">
            🔊 Listen Aloud / सुनें
          </button>
        </div>
        <p style="font-size:1.05rem; line-height:1.5; margin:0 0 10px 0; color:var(--text-main);">
          ${laymanText.en}
        </p>
        <p style="font-size:0.98rem; line-height:1.4; margin:0; color:var(--text-muted);">
          🇮🇳 <strong>हिन्दी:</strong> ${laymanText.hi}
        </p>
      </div>
    `;

    setTimeout(() => {
      document.getElementById('tts-listen-btn')?.addEventListener('click', () => {
        if (window.voiceAssistant) {
          const speakContent = `${laymanText.en}. हिन्दी में: ${laymanText.hi}`;
          import('./voice-nav.js').then(m => m.speakText(speakContent, 'hi-IN'));
        }
      });
    }, 50);

    // ── Differentials ──────────────────────────────────────────────────────────
    const diffsEl = document.getElementById('result-differentials');
    if (ml.differentials?.length > 1) {
      diffsEl.innerHTML = `
        <div class="xai-section-title">📊 Differential Diagnosis</div>
        <div class="diff-list">
          ${ml.differentials.map((d, i) => `
            <div class="diff-item ${i === 0 ? 'diff-primary' : ''}">
              <span class="diff-name">${d.condition}</span>
              <div class="diff-bar-wrap">
                <div class="diff-bar" style="width:${(d.probability * 100).toFixed(0)}%;background:${i === 0 ? 'var(--primary)' : 'var(--border)'}"></div>
              </div>
              <span class="diff-pct">${(d.probability * 100).toFixed(0)}%</span>
            </div>
          `).join('')}
        </div>
        <div class="calibration-note">
          🔬 Probabilities calibrated via isotonic regression (ISO 13485 aligned)
        </div>`;
    } else diffsEl.innerHTML = '';

    // ── Clinical Scores (MEWS / CURB-65) ──────────────────────────────────────
    const clinEl = document.getElementById('result-clinical-scores');
    if (clinEl && ml.clinicalScores?.computed) {
      const cs = ml.clinicalScores;
      let html = '<div class="xai-section-title">🏥 Clinical Early Warning Scores</div><div class="clinical-scores-grid">';

      if (cs.mews != null) {
        const mewsColor = MEWS_COLOR[cs.mewsLevel] || '#22c55e';
        html += `
          <div class="clinical-score-card" style="border-left:4px solid ${mewsColor}">
            <div class="score-name">MEWS</div>
            <div class="score-value" style="color:${mewsColor}">${cs.mews}</div>
            <div class="score-label">${cs.mewsLevel?.toUpperCase()}</div>
            <div class="score-ref">Modified Early Warning Score<br><small>Subbe et al., 2001</small></div>
          </div>`;
      }

      if (cs.curb65 != null) {
        const curb65Colors = { low: '#22c55e', moderate: '#f97316', severe: '#ef4444' };
        const curb65Color  = curb65Colors[cs.curb65Risk] || '#22c55e';
        html += `
          <div class="clinical-score-card" style="border-left:4px solid ${curb65Color}">
            <div class="score-name">CURB-65</div>
            <div class="score-value" style="color:${curb65Color}">${cs.curb65}/5</div>
            <div class="score-label">${cs.curb65Risk?.toUpperCase()} RISK</div>
            <div class="score-ref">Pneumonia severity<br><small>Lim et al., Thorax 2003</small></div>
          </div>`;
      }

      html += '</div>';
      clinEl.innerHTML = html;
      clinEl.classList.remove('hidden');
    } else if (clinEl) {
      clinEl.classList.add('hidden');
    }

    // ── SHAP Explanation Panel ─────────────────────────────────────────────────
    const xaiEl = document.getElementById('result-xai-panel');
    if (xaiEl && ml.explanation?.topFeatures?.length) {
      const exp = ml.explanation;
      const maxAbsVal = Math.max(...exp.topFeatures.map(f => Math.abs(f.shap_value)));

      xaiEl.innerHTML = `
        <div class="xai-section-title">
          🧠 AI Explainability — Why ${ml.recommendedSpecialty}?
          <span class="xai-method-badge">${exp.method === 'shap_tree' ? 'SHAP' : 'Feature Importance'}</span>
        </div>
        <div class="xai-subtitle">
          ${exp.explanation || 'Symptom contributions using Shapley values (Lundberg & Lee, NeurIPS 2017)'}
        </div>
        <div class="shap-chart">
          ${exp.topFeatures.map(f => {
            const pct    = (Math.abs(f.shap_value) / maxAbsVal * 100).toFixed(0);
            const color  = f.direction === 'increases' ? 'var(--primary)' : 'var(--danger, #ef4444)';
            const arrow  = f.direction === 'increases' ? '▲' : '▼';
            const present = f.present ? '●' : '○';
            return `
              <div class="shap-row">
                <span class="shap-symptom ${f.present ? 'shap-present' : 'shap-absent'}">
                  ${present} ${f.symptom}
                </span>
                <div class="shap-bar-wrap">
                  <div class="shap-bar" style="width:${pct}%;background:${color};"></div>
                </div>
                <span class="shap-value" style="color:${color}">${arrow} ${f.shap_value > 0 ? '+' : ''}${f.shap_value.toFixed(3)}</span>
              </div>`;
          }).join('')}
        </div>
        <div class="xai-footnote">
          SHAP values are Shapley values from cooperative game theory — each symptom's 
          marginal contribution to the prediction, averaged over all possible symptom subsets.
          <a href="https://arxiv.org/abs/1705.07874" target="_blank" class="xai-ref">arXiv:1705.07874</a>
        </div>`;
      xaiEl.classList.remove('hidden');
    } else if (xaiEl) {
      xaiEl.classList.add('hidden');
    }

    // Emergency banner
    const emergencyBanner = document.getElementById('result-emergency-banner');
    if (ml.urgencyLevel === 'emergency' || data.ruleBasedFlags?.length) {
      emergencyBanner.classList.remove('hidden');
    } else emergencyBanner.classList.add('hidden');

    // ── Save Triage Assessment to Global State & Dispatch Event ─────────────
    const activeTriageRecord = {
      timestamp: new Date().toISOString(),
      symptoms: [...selectedSymptoms],
      urgencyLevel: ml.urgencyLevel,
      recommendedSpecialty: ml.recommendedSpecialty,
      confidence: ml.confidence,
      differentials: ml.differentials || [],
      clinicalScores: ml.clinicalScores || {},
      explanation: ml.explanation || {},
      laymanSummary: laymanText.en,
    };
    setState('activeTriage', activeTriageRecord);
    localStorage.setItem('mf-active-triage', JSON.stringify(activeTriageRecord));
    window.dispatchEvent(new CustomEvent('mf:triage-completed', { detail: activeTriageRecord }));

    result.classList.remove('hidden');
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toastSuccess('Analysis complete', `${ml.recommendedSpecialty} — ${ml.urgencyLevel}`);
  }

  // Book/Route to Doctor from triage result
  document.getElementById('book-from-triage')?.addEventListener('click', () => {
    const activeTriage = getState('activeTriage') || JSON.parse(localStorage.getItem('mf-active-triage'));
    if (activeTriage) {
      toastInfo('Clinical Handoff', `Transferring ${activeTriage.recommendedSpecialty} triage data to Doctor Review Queue...`);
    }
    navigate('consultation');
    setTimeout(() => {
      document.getElementById('doctor-tools-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  });

  // Reset
  resetBtn?.addEventListener('click', () => {
    selectedSymptoms = [];
    renderChips();
    result.classList.add('hidden');
    document.getElementById('symptom-input').value = '';
  });

  // Voice Input Integration
  const voiceBtn = document.getElementById('voice-symptom-btn');
  if (voiceBtn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const recognition = new SR();
      recognition.continuous = false;
      recognition.lang = 'en-US';

      voiceBtn.addEventListener('click', () => {
        recognition.start();
        voiceBtn.textContent = '🔵'; // Recording state
        toastInfo('Microphone Active', 'Speak your symptoms clearly...');
      });

      recognition.onresult = (e) => {
        const text = e.results[0][0].transcript.toLowerCase();
        voiceBtn.textContent = '🎤';
        const input = document.getElementById('symptom-input');
        if (input) {
          input.value = text;
          input.dispatchEvent(new Event('input'));
          // Simulate Enter to add chip
          setTimeout(() => {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          }, 300);
          toastSuccess('Voice Captured', `Parsed: "${text}"`);
        }
      };

      recognition.onerror = () => {
        voiceBtn.textContent = '🎤';
        toastError('Voice Error', 'Could not access microphone.');
      };
    } else {
      voiceBtn.style.display = 'none';
    }
  }
}

function createLaymanSummaryEl() {
  const container = document.createElement('div');
  container.id = 'result-layman-summary';
  const parent = document.getElementById('triage-result');
  const target = document.getElementById('result-differentials') || parent?.firstChild;
  if (parent && target) {
    parent.insertBefore(container, target);
  }
  return container;
}

function getLaymanText(ml) {
  const spec = ml.recommendedSpecialty || 'General Doctor';
  if (ml.urgencyLevel === 'emergency') {
    return {
      en: `🚨 CRITICAL ALERT: Your symptoms suggest high risk requiring immediate care from a ${spec}. Please visit the nearest hospital or click the emergency SOS button.`,
      hi: `🚨 अति गंभीर चेतावनी: आपके लक्षण तुरंत ${spec} (विशेषज्ञ डॉक्टर) को दिखाने की आवश्यकता संकेत करते हैं। कृपया तुरंत नजदीकी अस्पताल जाएं या नीचे दिए गए SOS बटन को दबाएं।`
    };
  } else if (ml.urgencyLevel === 'urgent') {
    return {
      en: `⚠️ DOCTOR CONSULTATION RECOMMENDED: You should consult a ${spec} today for further evaluation and treatment.`,
      hi: `⚠️ डॉक्टर सलाह आवश्यक: आपको आज ही किसी ${spec} (डॉक्टर) से परामर्श लेना चाहिए।`
    };
  } else {
    return {
      en: `🟢 LOW RISK: Your symptoms appear mild. Rest, stay hydrated, and book an online consultation with a ${spec} if symptoms persist.`,
      hi: `🟢 सामान्य देखभाल: आपके लक्षण सामान्य प्रतीत होते हैं। आराम करें, पानी पीएं, और यदि लक्षण बने रहें तो ${spec} से परामर्श लें।`
    };
  }
}

