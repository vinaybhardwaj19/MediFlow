/**
 * @file timeline.js
 * @description Patient unified care history timeline page widget.
 */

import * as api from './api.js';
import { toastError } from './toast.js';

export function initTimeline() {
  const container = document.getElementById('dash-timeline');
  if (!container) return;

  container.innerHTML = `
    <div class="card" style="margin-bottom:20px;padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
        <h3 style="margin:0;display:flex;align-items:center;gap:8px;">🕒 Searchable Care Timeline</h3>
        <div style="width:300px;max-width:100%;">
          <input class="form-input" id="timeline-search-input" placeholder="Search appointments, meds, diagnoses..." style="padding:6px 12px;height:auto;"/>
        </div>
      </div>
      <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:24px;">
        Unified historical log aggregating symptom triage checkers, prescriptions, orders, consultations, and laboratory reports.
      </p>

      <div style="position:relative;padding-left:30px;border-left:2px dashed var(--border);margin-left:15px;" id="timeline-events-container">
        <div class="loading-center"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  let debounceTimer;
  document.getElementById('timeline-search-input')?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadTimeline(e.target.value);
    }, 300);
  });

  loadTimeline();
}

async function loadTimeline(searchQuery = '') {
  const container = document.getElementById('timeline-events-container');
  if (!container) return;

  try {
    const res = await api.get(`/timeline?search=${encodeURIComponent(searchQuery)}`);
    const events = res.data || [];

    if (events.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--text-muted);font-size:.85rem;">
          No medical history matches the query "${searchQuery}".
        </div>
      `;
      return;
    }

    renderTimelineEvents(events);
  } catch (err) {
    container.innerHTML = '<div style="color:var(--text-danger);text-align:center;padding:40px;">Failed to aggregate timeline events.</div>';
  }
}

function renderTimelineEvents(events) {
  const container = document.getElementById('timeline-events-container');
  if (!container) return;

  container.innerHTML = events.map(e => {
    const formattedDate = new Date(e.date).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const isCritical = ['critical', 'failed', 'cancelled', 'emergency', 'CRITICAL', 'HIGH'].includes(e.badge);
    const badgeClass = isCritical ? 'badge-urgent' : 'badge-routine';

    return `
      <div class="timeline-event-card fade-up" style="position:relative;margin-bottom:24px; cursor:pointer;" onclick="window.handleTimelineAction('${e.type}', '${e.id}')">
        <!-- Timeline node marker -->
        <div style="position:absolute;left:-44px;top:4px;width:28px;height:28px;border-radius:50%;background:#0f172a;border:2px solid var(--primary);display:flex;align-items:center;justify-content:center;font-size:1rem;z-index:2;box-shadow:0 0 8px rgba(99,102,241,0.25);">
          ${e.icon || '🔔'}
        </div>
        
        <div class="card" style="padding:16px;background:rgba(255,255,255,0.01);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
            <div>
              <h4 style="margin:0;font-weight:700;font-size:.95rem;">${e.title}</h4>
              <span style="font-size:.7rem;color:var(--text-muted);">${formattedDate}</span>
            </div>
            <span class="badge ${badgeClass}" style="text-transform:uppercase;font-size:.65rem;padding:3px 6px;">${e.badge}</span>
          </div>
          <p style="font-size:.8rem;color:var(--text-secondary);margin:0;line-height:1.4;">${e.description}</p>
          <div style="margin-top:10px; font-size:0.65rem; color:var(--primary); font-weight:700; display:flex; align-items:center; gap:4px;">
            <span>VIEW DETAILS</span>
            <span>➜</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.handleTimelineAction = (type, id) => {
  if (type === 'appointment') {
    const sidebarItem = document.querySelector('.sidebar-item[data-section="appointments"]');
    if (sidebarItem) sidebarItem.click();
  } else if (type === 'order') {
    const sidebarItem = document.querySelector('.sidebar-item[data-section="orders"]');
    if (sidebarItem) sidebarItem.click();
  } else if (type === 'lab_report') {
    const sidebarItem = document.querySelector('.sidebar-item[data-section="labs"]');
    if (sidebarItem) sidebarItem.click();
  } else if (type === 'triage') {
    navigate('triage');
  }
};
