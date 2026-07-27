/**
 * doctor-tools.js — Drug Interaction Checker, Prescription Pad, ICD-10, Rating System
 */
import * as api from './api.js';
import { getState } from './store.js';
import { toastSuccess, toastError, toastWarning } from './toast.js';

// ── Drug Interaction Database (client-side) ────────────────────────────────────
const INTERACTIONS = [
  { drugs:['warfarin','aspirin'], severity:'high', effect:'Increased bleeding risk — avoid combination' },
  { drugs:['metformin','alcohol'], severity:'high', effect:'Lactic acidosis risk — strictly avoid alcohol' },
  { drugs:['ssri','tramadol'], severity:'high', effect:'Serotonin syndrome risk — potentially fatal' },
  { drugs:['methotrexate','ibuprofen'], severity:'high', effect:'Toxic methotrexate levels — contraindicated' },
  { drugs:['atorvastatin','clarithromycin'], severity:'medium', effect:'Increased statin levels → muscle damage risk' },
  { drugs:['amlodipine','simvastatin'], severity:'medium', effect:'Elevated simvastatin exposure — monitor closely' },
  { drugs:['ciprofloxacin','antacids'], severity:'medium', effect:'Antacids reduce ciprofloxacin absorption by 50%' },
  { drugs:['losartan','potassium'], severity:'medium', effect:'Hyperkalemia risk — monitor potassium levels' },
  { drugs:['sertraline','diazepam'], severity:'low', effect:'Additive CNS depression — use with caution' },
  { drugs:['metoprolol','verapamil'], severity:'high', effect:'Severe bradycardia and heart block risk' },
  { drugs:['lisinopril','nsaids'], severity:'medium', effect:'Reduced antihypertensive effect + kidney stress' },
  { drugs:['digoxin','amiodarone'], severity:'high', effect:'Digoxin toxicity — requires dose reduction' },
  { drugs:['sildenafil','nitrates'], severity:'high', effect:'Severe hypotension — CONTRAINDICATED' },
  { drugs:['clopidogrel','omeprazole'], severity:'medium', effect:'Omeprazole reduces clopidogrel efficacy' },
  { drugs:['warfarin','ibuprofen'], severity:'high', effect:'Major bleeding risk — avoid NSAIDs with warfarin' },
];

const ICD10_CODES = [
  { code:'J06.9', label:'Acute upper respiratory infection, unspecified' },
  { code:'J11.1', label:'Influenza with other respiratory manifestations' },
  { code:'I10', label:'Essential (primary) hypertension' },
  { code:'E11.9', label:'Type 2 diabetes mellitus without complications' },
  { code:'J45.909', label:'Unspecified asthma, uncomplicated' },
  { code:'K21.0', label:'Gastro-oesophageal reflux disease with oesophagitis' },
  { code:'M54.5', label:'Low back pain' },
  { code:'R51', label:'Headache' },
  { code:'J00', label:'Acute nasopharyngitis (common cold)' },
  { code:'R05', label:'Cough' },
  { code:'R50.9', label:'Fever, unspecified' },
  { code:'A09', label:'Other and unspecified gastroenteritis and colitis' },
  { code:'N39.0', label:'Urinary tract infection, site not specified' },
  { code:'L30.9', label:'Dermatitis, unspecified' },
  { code:'F32.9', label:'Major depressive disorder, single episode, unspecified' },
  { code:'G43.909', label:'Migraine, unspecified, not intractable' },
  { code:'E55.9', label:'Vitamin D deficiency, unspecified' },
  { code:'I25.10', label:'Atherosclerotic heart disease — native coronary artery' },
  { code:'Z79.4', label:'Long-term (current) use of insulin' },
  { code:'B34.9', label:'Viral infection, unspecified' },
];

const DRUG_TEMPLATES = [
  { name:'Paracetamol 500mg', dose:'1 tablet', frequency:'Every 6–8 hours as needed', duration:'3–5 days', note:'Max 4g/day' },
  { name:'Amoxicillin 500mg', dose:'1 capsule', frequency:'Every 8 hours', duration:'7 days', note:'Complete full course' },
  { name:'Ibuprofen 400mg', dose:'1 tablet', frequency:'Every 8 hours with food', duration:'5 days', note:'Avoid on empty stomach' },
  { name:'Omeprazole 20mg', dose:'1 capsule', frequency:'Once daily before breakfast', duration:'14 days', note:'' },
  { name:'Cetirizine 10mg', dose:'1 tablet', frequency:'Once daily at bedtime', duration:'7 days', note:'May cause drowsiness' },
  { name:'Metformin 500mg', dose:'1 tablet', frequency:'Twice daily with meals', duration:'90 days', note:'Monitor blood glucose' },
  { name:'Atorvastatin 10mg', dose:'1 tablet', frequency:'Once at night', duration:'30 days', note:'Avoid grapefruit juice' },
  { name:'Salbutamol Inhaler', dose:'2 puffs', frequency:'Every 4–6 hours as needed', duration:'As required', note:'Shake before use' },
  { name:'Losartan 50mg', dose:'1 tablet', frequency:'Once daily', duration:'30 days', note:'Monitor BP and K+' },
  { name:'Vitamin D3 1000IU', dose:'1 tablet', frequency:'Once daily', duration:'90 days', note:'Take with fatty meal' },
];

export function checkDrugInteractions(drugList) {
  const lower = drugList.map(d => d.toLowerCase());
  const found = [];
  for (const interaction of INTERACTIONS) {
    const matches = interaction.drugs.filter(d => lower.some(l => l.includes(d)));
    if (matches.length >= 2) found.push(interaction);
  }
  return found;
}

// ── Prescription Pad ───────────────────────────────────────────────────────────
let _rxDrugs = [];

export function initPrescriptionPad() {
  const container = document.getElementById('prescription-pad');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <h3 style="font-weight:700;margin:0;">📋 Digital Prescription Pad</h3>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-outline btn-sm" id="icd-lookup-btn">🔢 ICD-10 Lookup</button>
        <button class="btn btn-primary btn-sm" id="generate-rx-btn">📄 Issue Prescription</button>
      </div>
    </div>

    <!-- ICD-10 Suggester -->
    <div id="icd-panel" class="hidden" style="margin-bottom:20px;background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
      <div style="font-weight:600;margin-bottom:12px;font-size:.9rem;">🔢 ICD-10 Code Finder</div>
      <input class="form-input" id="icd-search" placeholder="Search diagnosis (e.g. hypertension, diabetes)..." style="margin-bottom:12px;"/>
      <div id="icd-results" style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;"></div>
      <div id="icd-selected" style="margin-top:10px;font-size:.85rem;color:var(--primary);font-weight:600;"></div>
    </div>

    <!-- Drug Quick-Add -->
    <div style="margin-bottom:16px;">
      <label class="form-label">Quick-Add Medicine</label>
      <div style="display:flex;gap:10px;">
        <select class="form-input" id="drug-template-select" style="flex:1;">
          <option value="">-- Select common medicine --</option>
          ${DRUG_TEMPLATES.map((d,i) => `<option value="${i}">${d.name}</option>`).join('')}
        </select>
        <button class="btn btn-outline" id="add-drug-btn">+ Add</button>
      </div>
    </div>

    <!-- Custom drug entry -->
    <div style="display:grid;grid-template-columns:2fr 1fr 2fr 1fr;gap:10px;margin-bottom:16px;" id="custom-drug-row">
      <input class="form-input" id="custom-drug-name" placeholder="Medicine name..." />
      <input class="form-input" id="custom-drug-dose" placeholder="Dose" />
      <input class="form-input" id="custom-drug-freq" placeholder="Frequency" />
      <button class="btn btn-outline btn-sm" id="add-custom-drug-btn">+ Add</button>
    </div>

    <!-- Drug Interaction Alert -->
    <div id="interaction-alert" class="hidden" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.5);border-radius:var(--radius-sm);padding:14px;margin-bottom:16px;">
      <div style="font-weight:700;color:#ef4444;margin-bottom:8px;">⚠️ Drug Interaction Warning</div>
      <div id="interaction-list"></div>
    </div>

    <!-- Rx List -->
    <div id="rx-drug-list" style="margin-bottom:20px;min-height:60px;"></div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">
      <div class="form-group">
        <label class="form-label">Allotted Refills (Usage Limit)</label>
        <input class="form-input" id="rx-usage-limit" type="number" value="1" min="1" max="10" />
        <small style="color:var(--text-muted); font-size:0.65rem;">How many times patient can buy this set.</small>
      </div>
      <div class="form-group">
        <label class="form-label">Validity (Days)</label>
        <select class="form-input" id="rx-validity">
          <option value="7">7 Days (Acute)</option>
          <option value="30" selected>30 Days (Standard)</option>
          <option value="90">90 Days (Chronic)</option>
        </select>
      </div>
    </div>

    <!-- Patient notes -->
    <div class="form-group" style="margin-bottom:12px;">
      <label class="form-label">Clinical Notes</label>
      <textarea class="form-input" id="rx-notes" rows="3" placeholder="Diagnosis, e.g. Patient has chest pain and fever. Started Amoxicillin 500mg once daily for 7 days." style="resize:none;"></textarea>
    </div>

    <!-- AI Clinical Assistant Panel -->
    <div style="margin-bottom:20px;">
      <button class="btn btn-outline btn-sm" id="ai-parse-notes-btn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;border:1px dashed var(--primary);background:rgba(99,102,241,0.05);">
        <span>⚡</span> AI Clinical Assistant (Parse Notes)
      </button>
      <div id="ai-nlp-results" class="hidden" style="margin-top:12px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;">
        <div style="font-size:.78rem;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">💡 AI Extracted Entities</div>
        <div id="ai-nlp-lists" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>
    </div>
  `;

  _rxDrugs = [];
  renderRxList();
  wireRxPad();
}

function wireRxPad() {
  // ICD toggle
  document.getElementById('icd-lookup-btn')?.addEventListener('click', () => {
    document.getElementById('icd-panel')?.classList.toggle('hidden');
    populateICD('');
  });

  // ICD search
  document.getElementById('icd-search')?.addEventListener('input', (e) => populateICD(e.target.value));

  // Add from template
  document.getElementById('add-drug-btn')?.addEventListener('click', () => {
    const sel = document.getElementById('drug-template-select');
    const idx = parseInt(sel.value);
    if (isNaN(idx)) return;
    const drug = DRUG_TEMPLATES[idx];
    _rxDrugs.push({ ...drug });
    sel.value = '';
    checkInteractionsAndRender();
  });

  // Add custom drug
  document.getElementById('add-custom-drug-btn')?.addEventListener('click', () => {
    const name = document.getElementById('custom-drug-name')?.value.trim();
    const dose = document.getElementById('custom-drug-dose')?.value.trim();
    const freq = document.getElementById('custom-drug-freq')?.value.trim();
    if (!name) return;
    _rxDrugs.push({ name, dose: dose||'As directed', frequency: freq||'As directed', duration:'As directed', note:'' });
    document.getElementById('custom-drug-name').value = '';
    document.getElementById('custom-drug-dose').value = '';
    document.getElementById('custom-drug-freq').value = '';
    checkInteractionsAndRender();
  });

  // Issue prescription
  document.getElementById('generate-rx-btn')?.addEventListener('click', issueRx);

  // AI Parse Clinical Notes
  document.getElementById('ai-parse-notes-btn')?.addEventListener('click', async () => {
    const notes = document.getElementById('rx-notes')?.value.trim();
    if (!notes) {
      toastWarning('Empty notes', 'Please type some clinical notes first.');
      return;
    }
    const resultsPanel = document.getElementById('ai-nlp-results');
    const listsContainer = document.getElementById('ai-nlp-lists');
    
    try {
      const res = await api.post('/triage/nlp/extract', { notes });
      if (res?.data) {
        const data = res.data;
        resultsPanel?.classList.remove('hidden');
        
        let html = '';
        
        // 1. Render extracted symptoms/findings
        const symptoms = data.entities.filter(e => e.category === 'symptom');
        if (symptoms.length) {
          html += `
            <div>
              <div style="font-size:.72rem;color:var(--text-secondary);font-weight:700;margin-bottom:4px;">Symptoms & Findings:</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${symptoms.map(s => `
                  <span class="badge" style="font-size:.72rem;background:${s.negated ? 'rgba(255,255,255,0.05)' : 'var(--primary-glow)'};color:${s.negated ? 'var(--text-muted)' : 'var(--text-primary)'};text-decoration:${s.negated ? 'line-through' : 'none'};" title="${s.label} (${s.code})">
                    ${s.text} ${s.negated ? '(negated)' : ''}
                  </span>
                `).join('')}
              </div>
            </div>`;
        }
        
        // 2. Render extracted conditions (ICD-10 mapping)
        const conditions = data.entities.filter(e => e.category === 'condition');
        if (conditions.length) {
          html += `
            <div style="margin-top:6px;">
              <div style="font-size:.72rem;color:var(--text-secondary);font-weight:700;margin-bottom:4px;">Suspected Diagnoses:</div>
              <div style="display:flex;flex-direction:column;gap:4px;">
                ${conditions.map(c => `
                  <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);padding:6px 10px;border-radius:4px;border:1px solid var(--border);">
                    <span style="font-size:.76rem;" title="${c.label}"><strong>${c.code}</strong> — ${c.text}</span>
                    <button class="btn btn-outline btn-sm" style="font-size:.65rem;padding:2px 6px;" onclick="document.getElementById('icd-panel').classList.remove('hidden');document.getElementById('icd-selected').textContent = '✅ Selected: ${c.code} — ${c.label}';document.getElementById('icd-panel').dataset.selectedCode = '${c.code}';document.getElementById('icd-panel').dataset.selectedLabel = '${c.label}';">
                      Apply ICD
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>`;
        }

        // 3. Render extracted prescriptions
        if (data.prescriptions && data.prescriptions.length) {
          html += `
            <div style="margin-top:6px;">
              <div style="font-size:.72rem;color:var(--text-secondary);font-weight:700;margin-bottom:4px;">Suggested Rx Auto-fill:</div>
              <div style="display:flex;flex-direction:column;gap:4px;">
                ${data.prescriptions.map((p, idx) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(16,185,129,.05);padding:6px 10px;border-radius:4px;border:1px solid rgba(16,185,129,.2);">
                    <div style="font-size:.76rem;">
                      <strong>${p.name}</strong> <small style="color:var(--text-secondary);">${p.dose} &middot; ${p.frequency} &middot; ${p.duration}</small>
                    </div>
                    <button class="btn btn-primary btn-sm btn-auto-add" style="font-size:.65rem;padding:2px 6px;background:var(--success);border-color:var(--success);" data-idx="${idx}">
                      + Add Rx
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>`;
        }

        if (!html) {
          html = '<div style="font-size:.78rem;color:var(--text-muted);">No medical entities identified in the notes. Try typing: "Patient has headache and fever. Prescribed Metformin 500mg once daily for 30 days."</div>';
        }

        if (listsContainer) {
          listsContainer.innerHTML = html;
          
          // Attach listeners to + Add Rx buttons
          listsContainer.querySelectorAll('.btn-auto-add').forEach(btn => {
            btn.addEventListener('click', () => {
              const idx = parseInt(btn.dataset.idx);
              const drug = data.prescriptions[idx];
              _rxDrugs.push({
                name: drug.name,
                dose: drug.dose,
                frequency: drug.frequency,
                duration: drug.duration,
                note: `Auto-extracted from notes (RxNorm: ${drug.code})`
              });
              btn.disabled = true;
              btn.textContent = 'Added';
              checkInteractionsAndRender();
            });
          });
        }
      }
    } catch (err) {
      toastError('NLP parsing failed', err.message);
    }
  });
}

function populateICD(query) {
  const results = document.getElementById('icd-results');
  if (!results) return;
  const filtered = query
    ? ICD10_CODES.filter(c => c.label.toLowerCase().includes(query.toLowerCase()) || c.code.includes(query))
    : ICD10_CODES.slice(0, 8);
  results.innerHTML = filtered.map(c => `
    <div class="icd-item" data-code="${c.code}" style="
      padding:8px 12px;border-radius:var(--radius-sm);cursor:pointer;
      background:var(--glass-1);border:1px solid var(--border);
      display:flex;gap:10px;align-items:center;transition:all .15s;
    ">
      <span style="font-family:monospace;font-size:.8rem;color:var(--primary);font-weight:700;min-width:60px;">${c.code}</span>
      <span style="font-size:.85rem;">${c.label}</span>
    </div>
  `).join('');
  results.querySelectorAll('.icd-item').forEach(item => {
    item.addEventListener('click', () => {
      const code = item.dataset.code;
      const label = ICD10_CODES.find(c => c.code === code)?.label;
      document.getElementById('icd-selected').textContent = `✅ Selected: ${code} — ${label}`;
      document.getElementById('icd-panel').dataset.selectedCode = code;
      document.getElementById('icd-panel').dataset.selectedLabel = label;
    });
  });
}

async function checkInteractionsAndRender() {
  const names = _rxDrugs.map(d => d.name);
  const alertEl = document.getElementById('interaction-alert');
  const listEl = document.getElementById('interaction-list');

  if (names.length < 2) {
    alertEl?.classList.add('hidden');
    renderRxList();
    return;
  }

  try {
    const res = await api.post('/triage/ml/ddi/check', { drugs: names });
    if (res?.data && res.data.interactions_found > 0) {
      const data = res.data;
      alertEl?.classList.remove('hidden');
      if (listEl) {
        listEl.innerHTML = `
          <div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:10px;">
             GNN Link Prediction Algorithm: <strong>${data.algorithm}</strong>
          </div>
          ${data.interactions.map(i => `
            <div style="margin-bottom:10px;font-size:.85rem;border-bottom:1px solid rgba(255,255,255,.05);padding-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${i.drug_a.toUpperCase()} + ${i.drug_b.toUpperCase()}</strong>
                <span style="color:${i.color};font-size:.72rem;font-weight:700;padding:2px 6px;background:${i.color}18;border:1px solid ${i.color}40;border-radius:4px;">
                  ${i.severity.toUpperCase()}
                </span>
              </div>
              <div style="color:var(--text-secondary);font-size:.8rem;margin-top:4px;">${i.description}</div>
              <div style="color:var(--text-muted);font-size:.72rem;margin-top:2px;">
                Link prediction score: <code>${(i.gnn_score).toFixed(4)}</code> (Grover & Leskovec, 2016)
              </div>
            </div>
          `).join('')}
          <div style="font-size:.82rem;font-weight:700;color:${data.max_severity_color};margin-top:8px;padding:8px 10px;background:${data.max_severity_color}10;border-radius:6px;border-left:3px solid ${data.max_severity_color};">
            ${data.recommendation}
          </div>
        `;
      }
      if (data.max_severity === 'contraindicated' || data.max_severity === 'severe') {
        toastWarning('⚠️ DDI Alert', `High-risk GNN drug interaction detected!`);
      }
    } else {
      alertEl?.classList.add('hidden');
    }
  } catch (err) {
    console.error('[DDI Check Error]', err);
    // Silent fallback to local DB check if backend offline
    const localInteractions = checkDrugInteractions(names);
    if (localInteractions.length > 0) {
      alertEl?.classList.remove('hidden');
      if (listEl) listEl.innerHTML = localInteractions.map(i => `
        <div style="margin-bottom:6px;font-size:.85rem;">
          <strong>${i.drugs.join(' + ')}</strong>
          <span style="color:#ef4444;font-size:.75rem;margin-left:6px;padding:2px 6px;background:rgba(239,68,68,.15);border-radius:4px;">LOCAL WARNING</span>
          <div style="color:var(--text-secondary);font-size:.8rem;">${i.effect}</div>
        </div>
      `).join('');
    } else {
      alertEl?.classList.add('hidden');
    }
  }
  renderRxList();
}

function renderRxList() {
  const el = document.getElementById('rx-drug-list');
  if (!el) return;
  if (!_rxDrugs.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.85rem;">No medicines added yet</div>';
    return;
  }
  el.innerHTML = _rxDrugs.map((d, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;margin-bottom:8px;
      background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-sm);border-left:4px solid var(--primary);">
      <div style="flex:1;">
        <div style="font-weight:700;">${d.name}</div>
        <div style="font-size:.78rem;color:var(--text-secondary);">${d.dose} · ${d.frequency} · ${d.duration}${d.note?` — <em>${d.note}</em>`:''}</div>
      </div>
      <button onclick="this.closest('[data-rx-idx]')" data-rx-idx="${i}" style="
        background:rgba(239,68,68,.15);border:none;color:#ef4444;width:28px;height:28px;
        border-radius:50%;cursor:pointer;font-size:1rem;line-height:1;
      " class="rm-drug-btn">✕</button>
    </div>
  `).join('');
  el.querySelectorAll('.rm-drug-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.rxIdx);
      _rxDrugs.splice(idx, 1);
      checkInteractionsAndRender();
    });
  });
}

async function issueRx() {
  if (!_rxDrugs.length) { toastError('Prescription', 'Add at least one medicine first.'); return; }
  const notes = document.getElementById('rx-notes')?.value?.trim() || '';
  const icdPanel = document.getElementById('icd-panel');
  const icdCode = icdPanel?.dataset.selectedCode || '';
  const icdLabel = icdPanel?.dataset.selectedLabel || '';

  const usageLimit = parseInt(document.getElementById('rx-usage-limit')?.value) || 1;
  const validityDays = parseInt(document.getElementById('rx-validity')?.value) || 30;
  const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

  try {
    const payload = {
      id: 'rx_' + Date.now().toString(36),
      patientName: 'John Doe',
      medications: _rxDrugs.map(d => ({ name: d.name, dosage: d.dose, frequency: d.frequency, duration: d.duration, instructions: d.note })),
      notes,
      diagnosis: icdLabel,
      icdCode,
      maxUsageCount: usageLimit,
      expiresAt,
      issuedAt: new Date().toISOString(),
    };
    await api.post('/prescriptions', payload).catch(() => {});

    // Save to local storage & dispatch event for Pharmacy & Rider pipeline sync
    const existingRx = JSON.parse(localStorage.getItem('mf-prescriptions') || '[]');
    existingRx.unshift(payload);
    localStorage.setItem('mf-prescriptions', JSON.stringify(existingRx));
    localStorage.setItem('mf-latest-rx', JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('mf:prescription-issued', { detail: payload }));

    toastSuccess('✅ Prescription Issued', `${_rxDrugs.length} medicine(s) prescribed & dispatched to Pharmacy Queue!`);
    _rxDrugs = [];
    renderRxList();
    document.getElementById('rx-notes').value = '';
  } catch (err) {
    toastError('Error', err.message);
  }
}

// ── Doctor Rating System ───────────────────────────────────────────────────────
export function initDoctorRating() {
  const container = document.getElementById('doctor-rating-widget');
  if (!container) return;

  // Demo ratings data
  const ratings = [
    { patient: 'Alice M.', stars: 5, comment: 'Excellent consultation, very thorough and patient.', date: '2026-04-25' },
    { patient: 'Raj K.', stars: 5, comment: 'Diagnosed my condition perfectly. Highly recommended!', date: '2026-04-22' },
    { patient: 'Sarah T.', stars: 4, comment: 'Very knowledgeable doctor. Wait time was a bit long.', date: '2026-04-18' },
    { patient: 'Mohammed A.', stars: 5, comment: 'Outstanding care. The video call quality was perfect.', date: '2026-04-15' },
  ];

  const avg = (ratings.reduce((s, r) => s + r.stars, 0) / ratings.length).toFixed(1);

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:20px;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid var(--border);">
      <div style="text-align:center;">
        <div style="font-size:3rem;font-weight:900;color:var(--primary);">${avg}</div>
        <div style="color:#f59e0b;font-size:1.2rem;">${'⭐'.repeat(Math.round(avg))}</div>
        <div style="font-size:.75rem;color:var(--text-secondary);">${ratings.length} reviews</div>
      </div>
      <div style="flex:1;">
        ${[5,4,3,2,1].map(n => {
          const count = ratings.filter(r => r.stars === n).length;
          const pct = Math.round(count / ratings.length * 100);
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:.8rem;">
            <span style="min-width:24px;">${n}⭐</span>
            <div style="flex:1;background:var(--glass-3);border-radius:4px;height:8px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:4px;transition:width 1s;"></div>
            </div>
            <span style="min-width:24px;color:var(--text-secondary);">${count}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${ratings.map(r => `
        <div style="padding:14px;background:var(--glass-2);border-radius:var(--radius-sm);border:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <div style="font-weight:600;font-size:.9rem;">👤 ${r.patient}</div>
            <div style="font-size:.75rem;color:var(--text-secondary);">${r.date}</div>
          </div>
          <div style="color:#f59e0b;font-size:.9rem;margin-bottom:4px;">${'⭐'.repeat(r.stars)}</div>
          <div style="font-size:.85rem;color:var(--text-secondary);font-style:italic;">"${r.comment}"</div>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-outline btn-sm" style="width:100%;margin-top:16px;" id="write-review-btn">✍️ Write a Review</button>
    <div id="review-form" class="hidden" style="margin-top:16px;">
      <div style="display:flex;gap:8px;margin-bottom:12px;" id="star-input">
        ${[1,2,3,4,5].map(n => `<button data-star="${n}" class="star-btn" style="font-size:1.5rem;background:none;border:none;cursor:pointer;opacity:.4;transition:all .15s;">⭐</button>`).join('')}
      </div>
      <textarea class="form-input" id="review-comment" rows="2" placeholder="Share your experience..." style="resize:none;margin-bottom:10px;"></textarea>
      <button class="btn btn-primary btn-sm" id="submit-review-btn">Submit Review</button>
    </div>
  `;

  // Wire review form
  let selectedStars = 0;
  document.getElementById('write-review-btn')?.addEventListener('click', () => {
    document.getElementById('review-form')?.classList.toggle('hidden');
  });
  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedStars = parseInt(btn.dataset.star);
      document.querySelectorAll('.star-btn').forEach((b, i) => {
        b.style.opacity = i < selectedStars ? '1' : '0.4';
      });
    });
  });
  document.getElementById('submit-review-btn')?.addEventListener('click', () => {
    if (!selectedStars) { toastError('Rating', 'Please select a star rating.'); return; }
    toastSuccess('⭐ Review Submitted!', 'Thank you for your feedback.');
    document.getElementById('review-form')?.classList.add('hidden');
  });
}

// ── Multilingual UI Toggle ─────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    'nav-home': 'Home', 'nav-dashboard': 'Dashboard', 'nav-triage': 'Symptom Checker',
    'nav-pharmacy': 'Pharmacy', 'nav-consult': 'Consult',
    'hero-title-1': 'Intelligent Telemedicine,', 'hero-title-2': 'For Modern Healthcare',
    'hero-sub': 'Real-time health monitoring via IoT wearables, ML-based symptom triage, secure video consultations, and smart pharmacy delivery.',
    'btn-get-started': 'Get Started Free →', 'btn-triage': '🧠 Try AI Triage',
    'nav-signin': 'Sign In', 'nav-signout': 'Sign Out',
  },
  hi: {
    'nav-home': 'होम', 'nav-dashboard': 'डैशबोर्ड', 'nav-triage': 'लक्षण जाँच',
    'nav-pharmacy': 'फार्मेसी', 'nav-consult': 'परामर्श',
    'hero-title-1': 'बुद्धिमान टेलीमेडिसिन,', 'hero-title-2': 'आधुनिक स्वास्थ्य सेवा के लिए',
    'hero-sub': 'IoT वियरेबल्स द्वारा रीयल-टाइम स्वास्थ्य निगरानी, ML-आधारित लक्षण ट्राइएज, सुरक्षित वीडियो परामर्श, और स्मार्ट फार्मेसी डिलीवरी।',
    'btn-get-started': 'मुफ्त शुरू करें →', 'btn-triage': '🧠 AI ट्राइएज आज़माएं',
    'nav-signin': 'साइन इन', 'nav-signout': 'साइन आउट',
  },
};

let _currentLang = 'en';

export function initMultilingualToggle() {
  const btn = document.getElementById('lang-toggle-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    _currentLang = _currentLang === 'en' ? 'hi' : 'en';
    btn.textContent = _currentLang === 'en' ? '🌐 EN' : '🌐 हिं';
    applyTranslations(_currentLang);
  });
}

function applyTranslations(lang) {
  const t = TRANSLATIONS[lang];
  if (!t) return;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key]) el.textContent = t[key];
  });
}

// ── OCR Prescription Scanner (Demo) ───────────────────────────────────────────
export function initOCRScanner() {
  const btn = document.getElementById('ocr-scan-btn');
  const modal = document.getElementById('ocr-modal');
  const closeBtn = document.getElementById('ocr-close');
  const video = document.getElementById('ocr-video');
  const resultEl = document.getElementById('ocr-result');
  let stream = null;

  if (!btn) return;

  btn.addEventListener('click', async () => {
    modal?.classList.remove('hidden');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (video) video.srcObject = stream;
      // Auto-simulate OCR after 3s
      setTimeout(() => simulateOCR(stream, resultEl, modal), 3000);
    } catch {
      if (resultEl) resultEl.textContent = '⚠ Camera unavailable — demo mode active';
      setTimeout(() => simulateOCR(null, resultEl, modal), 1500);
    }
  });

  closeBtn?.addEventListener('click', () => {
    stream?.getTracks().forEach(t => t.stop());
    modal?.classList.add('hidden');
  });
}

function simulateOCR(stream, resultEl, modal) {
  stream?.getTracks().forEach(t => t.stop());
  const demoText = `Patient: John Doe, 45M
Rx:
1. Amoxicillin 500mg — TDS × 7 days
2. Paracetamol 500mg — SOS
3. Vitamin C 500mg — OD × 30 days
Diagnosis: Acute URTI (J06.9)
Dr. B. Harrington | Date: ${new Date().toLocaleDateString()}`;

  if (resultEl) {
    resultEl.innerHTML = `<div style="font-family:monospace;white-space:pre-wrap;font-size:.85rem;color:var(--primary);padding:16px;background:rgba(99,102,241,.05);border-radius:var(--radius-sm);border:1px solid rgba(99,102,241,.2);">${demoText}</div>`;
  }
  import('./toast.js').then(({ toastSuccess }) => toastSuccess('📷 OCR Complete', 'Prescription digitized successfully'));
}
