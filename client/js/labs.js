/**
 * @file labs.js
 * @description Lab Tests booking and digital diagnostic reports upload and AI XAI explanation engine.
 */

import * as api from './api.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';

let _reports = [];

export function initLabs() {
  const container = document.getElementById('dash-labs');
  if (!container) return;

  renderLabsUI();
  loadLabHistory();
}

function renderLabsUI() {
  const container = document.getElementById('dash-labs');
  if (!container) return;

  container.innerHTML = `
    <div class="card" style="margin-bottom:20px;padding:20px;">
      <h3 style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">🧪 Diagnostic Laboratory & Scans Hub</h3>
      <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:20px;">
        Book home collection lab tests, view digital reports, and translate complex laboratory reports into plain English using MediFlow AI.
      </p>

      <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:20px;">
        <!-- Test Booking Catalog -->
        <div>
          <h4 style="margin-bottom:12px;font-weight:600;">Book a Lab Test</h4>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <!-- CBC -->
            <div class="card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.01);">
              <div>
                <div style="font-weight:700;font-size:.85rem;">Complete Blood Count (CBC)</div>
                <div style="font-size:.7rem;color:var(--text-muted);">Includes Hemoglobin, WBC, RBC &amp; Platelets</div>
              </div>
              <button class="btn btn-primary btn-sm btn-book-test" data-test="Complete Blood Count (CBC)" style="padding:4px 8px;font-size:.7rem;">Book ₹299</button>
            </div>
            <!-- Lipid Profile -->
            <div class="card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.01);">
              <div>
                <div style="font-weight:700;font-size:.85rem;">Lipid profile / Cholesterol Check</div>
                <div style="font-size:.7rem;color:var(--text-muted);">HDL, LDL, VLDL, Triglycerides</div>
              </div>
              <button class="btn btn-primary btn-sm btn-book-test" data-test="Lipid Profile" style="padding:4px 8px;font-size:.7rem;">Book ₹499</button>
            </div>
            <!-- Thyroid Function -->
            <div class="card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.01);">
              <div>
                <div style="font-weight:700;font-size:.85rem;">Thyroid Stimulating Hormone (TSH)</div>
                <div style="font-size:.7rem;color:var(--text-muted);">T3, T4, TSH hormone screening</div>
              </div>
              <button class="btn btn-primary btn-sm btn-book-test" data-test="TSH Thyroid Profile" style="padding:4px 8px;font-size:.7rem;">Book ₹599</button>
            </div>
            <!-- Fasting Blood Glucose -->
            <div class="card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.01);">
              <div>
                <div style="font-weight:700;font-size:.85rem;">Fasting Blood Sugar &amp; HbA1c</div>
                <div style="font-size:.7rem;color:var(--text-muted);">Diabetes monitoring &amp; average glycemic index</div>
              </div>
              <button class="btn btn-primary btn-sm btn-book-test" data-test="Fasting Glucose & HbA1c" style="padding:4px 8px;font-size:.7rem;">Book ₹349</button>
            </div>
          </div>
        </div>

        <!-- History & Explainer -->
        <div style="border-left:1px solid var(--border);padding-left:20px;">
          <h4 style="margin-bottom:12px;font-weight:600;">Digital Reports &amp; AI Explanations</h4>
          <div id="lab-history-list" style="max-height:300px;overflow-y:auto;padding-right:5px;">
            <div class="loading-center"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Explanation Modal (Injected) -->
    <div id="xai-modal" class="modal hidden" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999;display:flex;align-items:center;justify-content:center;">
      <div class="card" style="width:90%;max-width:600px;max-height:80%;overflow-y:auto;padding:24px;border:1px solid var(--primary);position:relative;">
        <button id="xai-close-btn" style="position:absolute;top:15px;right:15px;background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer;">✕</button>
        <div id="xai-content-box"></div>
      </div>
    </div>
  `;

  // Bind close modal
  document.getElementById('xai-close-btn')?.addEventListener('click', () => {
    document.getElementById('xai-modal').classList.add('hidden');
  });

  // Bind test booking clicks
  container.querySelectorAll('.btn-book-test').forEach(btn => {
    btn.addEventListener('click', () => {
      const test = btn.dataset.test;
      bookLabTest(test);
    });
  });
}

async function bookLabTest(testName) {
  toastInfo('Booking Slot', `Scheduling home sample collection for ${testName}...`);
  try {
    await api.post('/labs/book', {
      testName,
      labName: 'MediFlow Diagnostics Lab'
    });
    toastSuccess('Booked Successfully', `Sample collection scheduled for tomorrow. We will notify you.`);
    loadLabHistory();
  } catch (err) {
    toastError('Booking Error', 'Could not schedule booking.');
  }
}

async function loadLabHistory() {
  const historyList = document.getElementById('lab-history-list');
  if (!historyList) return;

  try {
    const res = await api.get('/labs/history');
    _reports = res.data || [];

    if (_reports.length === 0) {
      historyList.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:.85rem;">No diagnostics tests booked yet.</div>';
      return;
    }

    renderHistoryList(_reports);
  } catch (err) {
    historyList.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-danger);">Failed to load digital lab reports.</div>';
  }
}

function renderHistoryList(reports) {
  const listEl = document.getElementById('lab-history-list');
  if (!listEl) return;

  listEl.innerHTML = reports.map(r => {
    const isCompleted = r.status === 'completed';
    const dateStr = new Date(r.bookingDate || r.createdAt).toLocaleDateString();
    
    return `
      <div class="card" style="padding:14px;margin-bottom:10px;background:rgba(255,255,255,0.01);border-left:3px solid ${isCompleted ? '#10b981' : '#f59e0b'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:700;font-size:.85rem;">${r.testName}</div>
            <div style="font-size:.7rem;color:var(--text-secondary);margin-top:2px;">Scheduled: ${dateStr} &middot; Lab: ${r.labName}</div>
          </div>
          <span class="badge ${isCompleted ? 'badge-routine' : 'badge-primary'}">${r.status.toUpperCase()}</span>
        </div>
        
        ${isCompleted ? `
          <div style="display:flex;gap:10px;margin-top:10px;align-items:center;border-top:1px solid var(--border);padding-top:10px;">
            <button class="btn btn-primary btn-sm btn-explain-ai" data-id="${r._id}" style="padding:2px 8px;font-size:.7rem;">✨ AI Explainer</button>
            <span style="font-size:.65rem;color:var(--text-muted);">PDF Report uploaded.</span>
          </div>
        ` : `
          <div style="display:flex;gap:10px;margin-top:10px;align-items:center;border-top:1px solid var(--border);padding-top:10px;">
            <button class="btn btn-outline btn-sm btn-simulate-upload" data-id="${r._id}" style="padding:2px 8px;font-size:.7rem;border-color:rgba(16,185,129,0.3);color:#10b981;">📄 Upload Sample Results</button>
          </div>
        `}
      </div>
    `;
  }).join('');

  // Bind AI Explainer
  listEl.querySelectorAll('.btn-explain-ai').forEach(btn => {
    btn.addEventListener('click', () => {
      explainLabReport(btn.dataset.id);
    });
  });

  // Bind Simulate Upload
  listEl.querySelectorAll('.btn-simulate-upload').forEach(btn => {
    btn.addEventListener('click', () => {
      simulateReportUpload(btn.dataset.id);
    });
  });
}

async function explainLabReport(reportId) {
  const modal = document.getElementById('xai-modal');
  const box = document.getElementById('xai-content-box');
  
  if (!modal || !box) return;

  box.innerHTML = '<div class="loading-center" style="padding:40px;"><div class="spinner spinner-lg"></div><div style="margin-top:12px;font-size:.85rem;color:var(--text-secondary);">AI is translating diagnostic variables into plain English...</div></div>';
  modal.classList.remove('hidden');

  try {
    const res = await api.post(`/labs/explain/${reportId}`);
    const explanation = res.data.explanation;
    
    // Parse markdown text
    let html = explanation
      .replace(/### (.*)/g, '<h4 style="font-weight:700;margin:14px 0 6px 0;color:var(--primary);">$1</h4>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\* (.*)/g, '<div style="margin:6px 0;display:flex;align-items:flex-start;gap:6px;font-size:.85rem;"><span style="color:var(--primary);">•</span><div>$1</div></div>');

    // Sample Visual Biomarker Cards Gauge
    const biomarkerGauges = `
      <div style="margin: 16px 0; display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Biomarker Visual Status Cards</div>
        
        <div class="card" style="padding:12px; background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.3); border-radius:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; font-size:0.85rem;">LDL Cholesterol</span>
            <span class="badge" style="background:#ef4444; color:#fff;">158 mg/dL (Elevated)</span>
          </div>
          <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:4px;">Reference Range: < 100 mg/dL</div>
          <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:99px; margin-top:8px; overflow:hidden;">
            <div style="width:78%; height:100%; background:linear-gradient(90deg, #10b981, #f59e0b, #ef4444); border-radius:99px;"></div>
          </div>
        </div>

        <div class="card" style="padding:12px; background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.3); border-radius:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; font-size:0.85rem;">Hemoglobin (Hb)</span>
            <span class="badge badge-routine">13.8 g/dL (Normal)</span>
          </div>
          <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:4px;">Reference Range: 12.0 - 16.0 g/dL</div>
          <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:99px; margin-top:8px; overflow:hidden;">
            <div style="width:55%; height:100%; background:#10b981; border-radius:99px;"></div>
          </div>
        </div>
      </div>
    `;

    box.innerHTML = `
      <div style="margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:12px;">
        <h3 style="margin:0;font-weight:700;display:flex;align-items:center;gap:6px;">✨ Gemini AI Diagnostic Explainer Report</h3>
        <span style="font-size:.7rem;color:var(--text-muted);">Translating diagnostic clinical markers into patient plain English</span>
      </div>
      ${biomarkerGauges}
      <div>${html}</div>
    `;
  } catch (err) {
    box.innerHTML = '<div style="color:var(--text-danger);text-align:center;padding:40px;">Could not retrieve AI report explanation. Please try again.</div>';
  }
}

async function simulateReportUpload(reportId) {
  const r = _reports.find(item => item._id === reportId);
  if (!r) return;

  let mockResults = {};
  const test = r.testName.toLowerCase();
  
  if (test.includes('cbc')) {
    mockResults = { hemoglobin: '11.4 g/dL', wbc: '11,200 /mcL', platelets: '280,000 /mcL' };
  } else if (test.includes('lipid')) {
    mockResults = { cholesterol: '238 mg/dL', ldl: '158 mg/dL', hdl: '42 mg/dL' };
  } else if (test.includes('thyroid') || test.includes('tsh')) {
    mockResults = { tsh: '5.2 uIU/mL' };
  } else {
    mockResults = { fbs: '124 mg/dL', hba1c: '6.4%' };
  }

  toastInfo('Processing lab report', 'Uploading clinical results into the system...');

  try {
    await api.post('/labs/upload', {
      reportId,
      reportUrl: '/reports/lab_report.pdf',
      results: mockResults
    });
    toastSuccess('Report Processed', 'PDF Lab Report compiled and explained by AI.');
    loadLabHistory();
  } catch (err) {
    toastError('Upload failed', 'Failed to complete lab report upload.');
  }
}
