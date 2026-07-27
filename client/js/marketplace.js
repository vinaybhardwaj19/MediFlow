/**
 * @file marketplace.js
 * @description Premium Doctor Marketplace module.
 * Enables patients to browse, search, and filter doctors by tiers, consulting fees, ratings, and experience.
 */

import * as api from './api.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';

let _doctors = [];

const DEMO_DOCTORS = [
  { _id: 'd1', userId: { firstName: 'Sanjay', lastName: 'Gupta' }, specializations: ['Cardiology'], experience: 18, consultationFee: 150000, ratings: { average: 4.9, count: 182 }, languages: ['English', 'Hindi'], bio: 'National expert in Interventional Cardiology and structural heart disease.', hospitalAffiliation: 'Apollo Hospitals, Delhi' },
  { _id: 'd2', userId: { firstName: 'Anjali', lastName: 'Sharma' }, specializations: ['Neurology'], experience: 14, consultationFee: 120000, ratings: { average: 4.8, count: 94 }, languages: ['English', 'Hindi', 'Punjabi'], bio: 'Specialist in migraine management, neuromuscular disorders, and neuro-rehabilitation.', hospitalAffiliation: 'Max Healthcare, Chandigarh' },
  { _id: 'd3', userId: { firstName: 'Ravi', lastName: 'Kumar' }, specializations: ['Pediatrics'], experience: 11, consultationFee: 80000, ratings: { average: 4.7, count: 68 }, languages: ['English', 'Hindi', 'Tamil'], bio: 'Top city pediatric practitioner focusing on child developmental care and immunizations.', hospitalAffiliation: 'Fortis Hospital, Bengaluru' },
  { _id: 'd4', userId: { firstName: 'Meera', lastName: 'Patel' }, specializations: ['Dermatology'], experience: 8, consultationFee: 60000, ratings: { average: 4.6, count: 42 }, languages: ['English', 'Gujarati'], bio: 'Specializes in clinical dermatology, skin cancer screenings, and advanced cosmetic procedures.', hospitalAffiliation: 'Skin Clinic, Mumbai' },
  { _id: 'd5', userId: { firstName: 'Vikram', lastName: 'Singh' }, specializations: ['Endocrinology'], experience: 22, consultationFee: 200000, ratings: { average: 5.0, count: 245 }, languages: ['English', 'Hindi', 'German'], bio: 'National expert on diabetic management, metabolic disorders, and thyroid dysfunctions.', hospitalAffiliation: 'AIIMS, Delhi' }
];

export function initMarketplace() {
  const container = document.getElementById('dash-marketplace');
  if (!container) return;

  container.innerHTML = `
    <div class="card" style="margin-bottom:20px;padding:20px;">
      <h3 style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">🩺 Premium Doctor Marketplace</h3>
      <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:20px;">
        Consult with top city, state, or national healthcare experts. Select tier and filter by experience or consulting fee options.
      </p>

      <div class="card" style="padding:16px;background:rgba(255,255,255,0.01);margin-bottom:20px;">
        <form id="marketplace-filter-form" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;">
          <div>
            <label class="form-label" style="font-size:.75rem;">Specialty</label>
            <input class="form-input" id="mkt-specialty" placeholder="e.g. Cardiology" style="padding:6px 12px;height:auto;"/>
          </div>
          <div>
            <label class="form-label" style="font-size:.75rem;">Expertise Level</label>
            <select class="form-input" id="mkt-tier" style="padding:6px 12px;height:auto;">
              <option value="">All Tiers</option>
              <option value="national">National Experts</option>
              <option value="state">Top State Specialists</option>
              <option value="city">Top City Doctors</option>
              <option value="general">General Practitioners</option>
            </select>
          </div>
          <div>
            <label class="form-label" style="font-size:.75rem;">Max Fee (INR)</label>
            <select class="form-input" id="mkt-max-fee" style="padding:6px 12px;height:auto;">
              <option value="">No Limit</option>
              <option value="800">Under ₹800</option>
              <option value="1200">Under ₹1200</option>
              <option value="1500">Under ₹1500</option>
            </select>
          </div>
          <div style="display:flex;align-items:flex-end;">
            <button type="submit" class="btn btn-primary btn-sm" style="width:100%;height:38px;">🔍 Apply Filters</button>
          </div>
        </form>
      </div>

      <div id="doctor-marketplace-list" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;">
        <div class="loading-center"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  document.getElementById('marketplace-filter-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    loadDoctors();
  });

  loadDoctors();
}

async function loadDoctors() {
  const listEl = document.getElementById('doctor-marketplace-list');
  if (listEl) {
    listEl.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  }

  const specialty = document.getElementById('mkt-specialty')?.value || '';
  const tier = document.getElementById('mkt-tier')?.value || '';
  const maxFee = document.getElementById('mkt-max-fee')?.value || '';

  try {
    // Search database doctors
    const res = await api.get(`/doctors?limit=20`);
    const dbDoctors = res.data || [];
    _doctors = dbDoctors.length > 0 ? dbDoctors : DEMO_DOCTORS;

    // Filter local copies
    let filtered = _doctors;

    if (specialty) {
      const specLower = specialty.toLowerCase();
      filtered = filtered.filter(d => 
        d.specializations.some(s => s.toLowerCase().includes(specLower))
      );
    }

    if (maxFee) {
      const centsLimit = parseInt(maxFee) * 100;
      filtered = filtered.filter(d => d.consultationFee <= centsLimit);
    }

    // Mock tier classification if not present
    filtered.forEach(d => {
      if (!d.tier) {
        if (d.experience >= 18) d.tier = 'National Expert';
        else if (d.experience >= 13) d.tier = 'State Expert';
        else if (d.experience >= 8) d.tier = 'Top City Doctor';
        else d.tier = 'General Specialist';
      }
    });

    if (tier) {
      const tierLower = tier.toLowerCase();
      filtered = filtered.filter(d => d.tier.toLowerCase().includes(tierLower));
    }

    renderDoctors(filtered);

  } catch (err) {
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-danger);">Failed to retrieve marketplace catalog.</div>';
  }
}

function renderDoctors(doctors) {
  const listEl = document.getElementById('doctor-marketplace-list');
  if (!listEl) return;

  if (doctors.length === 0) {
    listEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary);">No physicians match the chosen filter constraints.</div>';
    return;
  }

  listEl.innerHTML = doctors.map(d => {
    const feeInINR = (d.consultationFee / 100).toFixed(2);
    const tierBadgeClass = d.tier.includes('National') ? 'badge-routine' : d.tier.includes('State') ? 'badge-primary' : 'badge-urgent';
    return `
      <div class="card fade-up" style="padding:16px;border-top:4px solid var(--primary);display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <div>
              <span class="badge ${tierBadgeClass}" style="margin-bottom:6px;">${d.tier || 'Doctor Specialist'}</span>
              <h4 style="margin:0;font-weight:700;">Dr. ${d.userId?.firstName || ''} ${d.userId?.lastName || ''}</h4>
              <div style="font-size:.78rem;color:var(--text-secondary);margin-top:2px;">${d.specializations.join(', ')}</div>
            </div>
            <div style="text-align:right;">
              <div style="color:var(--success);font-weight:700;font-size:1.1rem;">₹${feeInINR}</div>
              <div style="font-size:.65rem;color:var(--text-muted);">per session</div>
            </div>
          </div>
          <p style="font-size:.8rem;color:var(--text-secondary);margin:8px 0;line-height:1.4;">${d.bio || 'Consulting doctor at MediFlow networks.'}</p>
          <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:12px;">🏥 ${d.hospitalAffiliation || 'MediFlow Network Partner'}</div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:.75rem;color:var(--text-secondary);">
            ⭐ <b>${d.ratings?.average || '4.5'}</b> (${d.ratings?.count || 12} reviews) &middot; <b>${d.experience} yrs</b> exp
          </div>
          <button class="btn btn-primary btn-sm btn-book-marketplace" data-id="${d._id}" style="padding:4px 10px;font-size:.75rem;">Book Consult</button>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.btn-book-marketplace').forEach(btn => {
    btn.addEventListener('click', () => {
      const doc = doctors.find(item => item._id === btn.dataset.id);
      if (doc) {
        toastInfo('Booking initiated', `Creating slot reservation with Dr. ${doc.userId?.firstName || ''}...`);
        // Navigate to appointments tab / booking form
        window.location.hash = '#dashboard';
        const scrollEl = document.getElementById('dash-booking');
        if (scrollEl) scrollEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}
