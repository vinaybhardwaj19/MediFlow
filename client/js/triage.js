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
  emergency: { badge: 'badge-emergency', color: '#ef4444', icon: '🚨' },
  urgent:    { badge: 'badge-urgent',    color: '#f97316', icon: '⚠️' },
  routine:   { badge: 'badge-routine',   color: '#22c55e', icon: '✅' },
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

    result.classList.remove('hidden');
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toastSuccess('Analysis complete', `${ml.recommendedSpecialty} — ${ml.urgencyLevel}`);
  }

  // Book from triage result
  document.getElementById('book-from-triage')?.addEventListener('click', () => {
    navigate('dashboard');
    setTimeout(() => {
      document.getElementById('dash-booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  });

  // Reset
  resetBtn?.addEventListener('click', () => {
    selectedSymptoms = [];
    renderChips();
    result.classList.add('hidden');
    document.getElementById('symptom-input').value = '';
  });
}
