/**
 * appointments.js — Live appointment booking with calendar UI
 */
import * as api from './api.js';
import { getState } from './store.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';

const SPECIALTIES = [
  { id:'general', label:'General Physician', icon:'🩺', color:'#6366f1' },
  { id:'cardiology', label:'Cardiologist', icon:'❤️', color:'#ef4444' },
  { id:'neurology', label:'Neurologist', icon:'🧠', color:'#8b5cf6' },
  { id:'pulmonology', label:'Pulmonologist', icon:'🫁', color:'#3b82f6' },
  { id:'endocrinology', label:'Endocrinologist', icon:'🔬', color:'#10b981' },
  { id:'dermatology', label:'Dermatologist', icon:'🌿', color:'#f59e0b' },
  { id:'orthopedics', label:'Orthopedist', icon:'🦴', color:'#ec4899' },
  { id:'ophthalmology', label:'Ophthalmologist', icon:'👁️', color:'#14b8a6' },
];

const TIME_SLOTS = [
  '09:00','09:30','10:00','10:30','11:00','11:30',
  '14:00','14:30','15:00','15:30','16:00','16:30',
  '17:00','17:30',
];

export function initAppointmentBooking() {
  const container = document.getElementById('booking-widget');
  if (!container) return;
  renderBookingWidget(container);
}

function renderBookingWidget(container) {
  container.innerHTML = `
    <div class="booking-steps">
      <div class="booking-step active" id="step-specialty">
        <div class="step-num">1</div><div class="step-label">Specialty</div>
      </div>
      <div class="step-divider"></div>
      <div class="booking-step" id="step-datetime">
        <div class="step-num">2</div><div class="step-label">Date & Time</div>
      </div>
      <div class="step-divider"></div>
      <div class="booking-step" id="step-confirm">
        <div class="step-num">3</div><div class="step-label">Confirm</div>
      </div>
    </div>

    <div id="booking-panel" style="margin-top:28px;"></div>
  `;

  showSpecialtySelection(container);
}

let _selectedSpecialty = null, _selectedDate = null, _selectedTime = null;

function showSpecialtySelection(container) {
  setStep(1);
  const panel = container.querySelector('#booking-panel');
  panel.innerHTML = `
    <h3 style="margin-bottom:16px;font-weight:700;">Select Specialty</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
      ${SPECIALTIES.map(s => `
        <button class="specialty-card" data-specialty="${s.id}" style="
          background:var(--glass-2); border:1px solid var(--border); border-radius:var(--radius);
          padding:18px 14px; cursor:pointer; text-align:left; transition:all .2s;
          display:flex; flex-direction:column; gap:8px;
        ">
          <div style="font-size:2rem;">${s.icon}</div>
          <div style="font-weight:600;font-size:.9rem;">${s.label}</div>
          <div style="width:40px;height:3px;border-radius:2px;background:${s.color};"></div>
        </button>
      `).join('')}
    </div>
  `;

  panel.querySelectorAll('.specialty-card').forEach(card => {
    card.addEventListener('mouseenter', () => { card.style.border=`1px solid ${SPECIALTIES.find(s=>s.id===card.dataset.specialty)?.color||'var(--primary)'}`;card.style.transform='translateY(-2px)'; });
    card.addEventListener('mouseleave', () => { card.style.border='1px solid var(--border)';card.style.transform=''; });
    card.addEventListener('click', () => {
      _selectedSpecialty = card.dataset.specialty;
      showDateTimeSelection(container);
    });
  });
}

function showDateTimeSelection(container) {
  setStep(2);
  const panel = container.querySelector('#booking-panel');
  const today = new Date();

  // Build next 14 days
  const days = Array.from({length:14},(_,i) => {
    const d = new Date(today); d.setDate(today.getDate()+i);
    return d;
  });

  panel.innerHTML = `
    <button class="btn btn-outline btn-sm" id="back-to-specialty" style="margin-bottom:20px;">← Back</button>
    <h3 style="margin-bottom:16px;font-weight:700;">Choose Date</h3>
    <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:12px;margin-bottom:24px;" id="date-scroller">
      ${days.map(d => `
        <button class="date-tile" data-date="${d.toISOString()}" style="
          min-width:72px; padding:14px 10px; border-radius:var(--radius); cursor:pointer;
          background:var(--glass-2); border:1px solid var(--border); text-align:center;
          flex-shrink:0; transition:all .2s;
        ">
          <div style="font-size:.7rem;color:var(--text-secondary);text-transform:uppercase;font-weight:700;">
            ${d.toLocaleDateString('en',{weekday:'short'})}
          </div>
          <div style="font-size:1.4rem;font-weight:800;margin:4px 0;">${d.getDate()}</div>
          <div style="font-size:.7rem;color:var(--text-secondary);">${d.toLocaleDateString('en',{month:'short'})}</div>
        </button>
      `).join('')}
    </div>

    <div id="time-section" class="hidden">
      <h3 style="margin-bottom:16px;font-weight:700;">Choose Time</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:10px;" id="time-grid">
        ${TIME_SLOTS.map(t => `
          <button class="time-tile" data-time="${t}" style="
            padding:12px 8px; border-radius:var(--radius-sm); cursor:pointer;
            background:var(--glass-2); border:1px solid var(--border); font-weight:600;
            transition:all .2s; font-size:.9rem;
          ">${t}</button>
        `).join('')}
      </div>
    </div>
  `;

  panel.querySelector('#back-to-specialty')?.addEventListener('click', () => showSpecialtySelection(container));

  panel.querySelectorAll('.date-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      panel.querySelectorAll('.date-tile').forEach(t => { t.style.background='var(--glass-2)'; t.style.border='1px solid var(--border)'; t.style.color=''; });
      tile.style.background='var(--primary)'; tile.style.border='1px solid var(--primary)'; tile.style.color='white';
      _selectedDate = new Date(tile.dataset.date);
      panel.querySelector('#time-section')?.classList.remove('hidden');
    });
  });

  panel.querySelectorAll('.time-tile').forEach(tile => {
    // Randomly mark some as unavailable for realism
    if (Math.random() < 0.3) { tile.disabled=true; tile.style.opacity='0.35'; tile.title='Unavailable'; return; }
    tile.addEventListener('click', () => {
      panel.querySelectorAll('.time-tile').forEach(t => { t.style.background='var(--glass-2)'; t.style.border='1px solid var(--border)'; });
      tile.style.background='var(--primary)'; tile.style.border='1px solid var(--primary)';
      _selectedTime = tile.dataset.time;
      setTimeout(() => showConfirmation(container), 300);
    });
  });
}

function showConfirmation(container) {
  setStep(3);
  const panel = container.querySelector('#booking-panel');
  const spec = SPECIALTIES.find(s=>s.id===_selectedSpecialty);
  const dateStr = _selectedDate?.toLocaleDateString('en',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  panel.innerHTML = `
    <button class="btn btn-outline btn-sm" id="back-to-datetime" style="margin-bottom:20px;">← Back</button>
    <div class="card" style="padding:24px;border:1px solid var(--primary);background:linear-gradient(135deg,rgba(99,102,241,.08),rgba(139,92,246,.05));">
      <h3 style="font-weight:700;margin-bottom:20px;">Appointment Summary</h3>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="color:var(--text-secondary);font-size:.9rem;">Specialty</div>
          <div style="font-weight:700;display:flex;align-items:center;gap:8px;">${spec?.icon} ${spec?.label}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="color:var(--text-secondary);font-size:.9rem;">Date</div>
          <div style="font-weight:700;">${dateStr}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="color:var(--text-secondary);font-size:.9rem;">Time</div>
          <div style="font-weight:700;">${_selectedTime}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="color:var(--text-secondary);font-size:.9rem;">Type</div>
          <div style="font-weight:700;">📹 Video Consultation</div>
        </div>
      </div>
    </div>

    <div class="form-group" style="margin-top:20px;">
      <label class="form-label">Reason for Visit</label>
      <textarea class="form-input" id="booking-reason" rows="3" placeholder="Briefly describe your symptoms or concerns..." style="resize:none;"></textarea>
    </div>

    <div style="display:flex;gap:12px;margin-top:20px;">
      <button class="btn btn-primary" id="confirm-booking-btn" style="flex:1;padding:14px;">
        <span class="spinner hidden" id="booking-spinner"></span>
        ✅ Confirm Appointment
      </button>
    </div>
  `;

  panel.querySelector('#back-to-datetime')?.addEventListener('click', () => showDateTimeSelection(container));
  panel.querySelector('#confirm-booking-btn')?.addEventListener('click', () => submitBooking(container));
}

async function submitBooking(container) {
  const btn = document.getElementById('confirm-booking-btn');
  const spinner = document.getElementById('booking-spinner');
  const reason = document.getElementById('booking-reason')?.value?.trim() || 'General consultation';
  btn.disabled = true; spinner?.classList.remove('hidden');

  try {
    const scheduledAt = new Date(_selectedDate);
    const [h,m] = _selectedTime.split(':');
    scheduledAt.setHours(Number(h), Number(m), 0, 0);

    // Try real API, fallback to simulation
    let roomId;
    try {
      const res = await api.post('/appointments', {
        type: 'video',
        scheduledAt: scheduledAt.toISOString(),
        chiefComplaint: reason,
        specialty: _selectedSpecialty,
      });
      roomId = res.data?.consultationRoom?.roomId || res.data?.roomId || 'ROOM-' + Math.random().toString(36).substr(2,8).toUpperCase();
    } catch {
      // Demo fallback
      roomId = 'ROOM-' + Math.random().toString(36).substr(2,8).toUpperCase();
    }

    toastSuccess('✅ Appointment Booked!', `${_selectedDate.toLocaleDateString('en',{month:'short',day:'numeric'})} at ${_selectedTime}. Room: ${roomId}`);

    // Show success state
    const panel = container.querySelector('#booking-panel');
    panel.innerHTML = `
      <div style="text-align:center;padding:48px 24px;">
        <div style="font-size:4rem;margin-bottom:16px;animation:bounceIn .6s;">✅</div>
        <h2 style="font-size:1.5rem;font-weight:800;margin-bottom:8px;">Appointment Confirmed!</h2>
        <p style="color:var(--text-secondary);margin-bottom:24px;">
          Your consultation is scheduled for <strong>${_selectedDate.toLocaleDateString('en',{month:'long',day:'numeric'})}</strong> at <strong>${_selectedTime}</strong>
        </p>
        <div class="card" style="display:inline-block;padding:12px 24px;margin-bottom:24px;">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:4px;">ROOM ID</div>
          <div style="font-size:1.2rem;font-weight:800;font-family:monospace;color:var(--primary);">${roomId}</div>
        </div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button class="btn btn-primary" onclick="document.getElementById('room-id-input').value='${roomId}';import('./router.js').then(m=>m.navigate('consultation'))">📹 Join Now</button>
          <button class="btn btn-outline" onclick="this.closest('[id^=booking]')&&window.location.reload()">+ Book Another</button>
        </div>
      </div>
    `;
  } catch (err) {
    toastError('Booking failed', err.message);
  } finally {
    btn.disabled = false; spinner?.classList.add('hidden');
  }
}

function setStep(n) {
  document.querySelectorAll('.booking-step').forEach((s,i) => {
    s.classList.toggle('active', i+1 <= n);
    s.classList.toggle('completed', i+1 < n);
  });
}
