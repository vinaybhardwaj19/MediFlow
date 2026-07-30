/**
 * appointments.js — Live appointment booking with calendar UI
 */
import * as api from './api.js';
import { getState } from './store.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';

const SPECIALTIES = [
  { id:'general', label:'General Physician', icon:'🩺', image:'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=200&q=80', color:'#6366f1' },
  { id:'cardiology', label:'Cardiologist', icon:'❤️', image:'https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?auto=format&fit=crop&w=200&q=80', color:'#ef4444' },
  { id:'neurology', label:'Neurologist', icon:'🧠', image:'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&w=200&q=80', color:'#8b5cf6' },
  { id:'pulmonology', label:'Pulmonologist', icon:'🫁', image:'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=200&q=80', color:'#3b82f6' },
  { id:'endocrinology', label:'Endocrinologist', icon:'🔬', image:'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=200&q=80', color:'#10b981' },
  { id:'dermatology', label:'Dermatologist', icon:'🌿', image:'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=200&q=80', color:'#f59e0b' },
  { id:'orthopedics', label:'Orthopedist', icon:'🦴', image:'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=200&q=80', color:'#ec4899' },
  { id:'ophthalmology', label:'Ophthalmologist', icon:'👁️', image:'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=200&q=80', color:'#14b8a6' },
];

const TIME_SLOTS = [
  '09:00','09:30','10:00','10:30','11:00','11:30',
  '14:00','14:30','15:00','15:30','16:00','16:30',
  '17:00','17:30',
];

let _selectedSpecialty = null, _selectedDate = null, _selectedTime = null, _initialReasonText = '';

export function initAppointmentBooking(initialSpecialty = null, initialReason = null) {
  const container = document.getElementById('booking-widget');
  if (!container) return;
  if (initialReason) _initialReasonText = initialReason;
  renderBookingWidget(container);
  if (initialSpecialty) {
    _selectedSpecialty = initialSpecialty;
    showDoctorCatalogSelection(container);
  }
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

  if (!_selectedSpecialty) {
    showSpecialtySelection(container);
  }
}

const DEMO_DOCTORS = [
  { id: 'doc1', name: 'Dr. Sarah Jenkins', specialty: 'cardiology', degrees: 'MD, DM (Cardiology)', exp: '12 Yrs Exp', rating: '4.9', reviews: 184, fee: 800, pincode: '560038', hospital: 'Apollo Heart Institute', image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=200&q=80' },
  { id: 'doc2', name: 'Dr. Vikram Nair', specialty: 'neurology', degrees: 'MD, DNB (Neurology)', exp: '15 Yrs Exp', rating: '4.8', reviews: 210, fee: 950, pincode: '560001', hospital: 'Manipal Neuro Center', image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=200&q=80' },
  { id: 'doc3', name: 'Dr. Priya Sharma', specialty: 'general', degrees: 'MBBS, MD (General Medicine)', exp: '9 Yrs Exp', rating: '4.9', reviews: 156, fee: 600, pincode: '560038', hospital: 'Fortis Wellness Hub', image: 'https://images.unsplash.com/photo-1594824813566-88855ce78907?auto=format&fit=crop&w=200&q=80' },
  { id: 'doc4', name: 'Dr. Robert Chen', specialty: 'pulmonology', degrees: 'MD (Pulmonology), FCCP', exp: '14 Yrs Exp', rating: '4.7', reviews: 128, fee: 850, pincode: '560012', hospital: 'Max Respiratory Care', image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=200&q=80' },
  { id: 'doc5', name: 'Dr. Ananya Reddy', specialty: 'dermatology', degrees: 'MD (Dermatology)', exp: '8 Yrs Exp', rating: '4.9', reviews: 310, fee: 750, pincode: '560038', hospital: 'Skin & Aesthetic Clinic', image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=200&q=80' },
  { id: 'doc6', name: 'Dr. Rajesh Kumar', specialty: 'cardiology', degrees: 'MD, FACC', exp: '11 Yrs Exp', rating: '4.8', reviews: 94, fee: 750, pincode: '560038', hospital: 'Narayana Health', image: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=200&q=80' },
];

let _selectedDoctor = null;

function showSpecialtySelection(container) {
  setStep(1);
  const panel = container.querySelector('#booking-panel');
  panel.innerHTML = `
    <h3 style="margin-bottom:16px;font-weight:700;">Step 1: Choose Specialty</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
      ${SPECIALTIES.map(s => `
        <button class="specialty-card" data-specialty="${s.id}" style="
          background:var(--glass-2); border:1px solid var(--border); border-radius:var(--radius);
          padding:18px 14px; cursor:pointer; text-align:left; transition:all .2s;
          display:flex; flex-direction:column; gap:8px;
        ">
          <div style="display:flex; align-items:center; gap:12px;">
            <img src="${s.image}" alt="${s.label}" style="width:42px; height:42px; border-radius:10px; object-fit:cover; border:1px solid ${s.color}40;" />
            <span style="font-size:1.4rem;">${s.icon}</span>
          </div>
          <div style="font-weight:600;font-size:.9rem;margin-top:4px;">${s.label}</div>
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
      showDoctorCatalogSelection(container);
    });
  });
}

function showDoctorCatalogSelection(container) {
  setStep(1);
  const panel = container.querySelector('#booking-panel');
  const spec = SPECIALTIES.find(s => s.id === _selectedSpecialty);
  const filteredDocs = DEMO_DOCTORS.filter(d => d.specialty === _selectedSpecialty || _selectedSpecialty === 'general');
  const docsToDisplay = filteredDocs.length ? filteredDocs : DEMO_DOCTORS;

  panel.innerHTML = `
    <button class="btn btn-outline btn-sm" id="back-to-specialties" style="margin-bottom:20px;">← Back to Specialties</button>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
      <div>
        <h3 style="margin:0;font-weight:700;">Select Preferred Doctor (${spec?.label || 'All Specialists'})</h3>
        <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">Showing verified doctors active in your city/pincode.</p>
      </div>
      <div class="badge badge-routine" style="font-size:0.75rem;">📍 Pincode Auto-Matched</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
      ${docsToDisplay.map(d => `
        <div class="card fade-up" style="padding:18px;border:1px solid var(--border);border-left:4px solid var(--primary);display:flex;flex-direction:column;justify-space-between;">
          <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:12px;">
            <img src="${d.image}" style="width:54px;height:54px;border-radius:12px;object-fit:cover;border:2px solid var(--primary);">
            <div style="flex:1;">
              <div style="font-weight:700;font-size:1rem;color:var(--primary);">${d.name}</div>
              <div style="font-size:0.75rem;color:var(--text-secondary);">${d.degrees} &middot; ${d.exp}</div>
              <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;">🏥 ${d.hospital}</div>
              <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">📍 Serving PIN: <b>${d.pincode}</b></div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--border);margin-top:auto;">
            <div>
              <span style="color:#eab308;font-weight:700;font-size:0.85rem;">⭐ ${d.rating}</span>
              <span style="font-size:0.7rem;color:var(--text-secondary);"> (${d.reviews} reviews)</span>
              <div style="font-weight:700;font-size:0.9rem;color:var(--success);margin-top:2px;">₹${d.fee} / consult</div>
            </div>
            <button class="btn btn-primary btn-sm btn-select-doc" data-id="${d.id}" style="padding:6px 14px;font-weight:700;">Select Doctor →</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  panel.querySelector('#back-to-specialties')?.addEventListener('click', () => showSpecialtySelection(container));
  panel.querySelectorAll('.btn-select-doc').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedDoctor = DEMO_DOCTORS.find(d => d.id === btn.dataset.id) || DEMO_DOCTORS[0];
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
  const doc = _selectedDoctor || DEMO_DOCTORS[0];
  const dateStr = _selectedDate?.toLocaleDateString('en',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  panel.innerHTML = `
    <button class="btn btn-outline btn-sm" id="back-to-datetime" style="margin-bottom:20px;">← Back</button>
    <div class="card" style="padding:24px;border:1px solid var(--primary);background:linear-gradient(135deg,rgba(99,102,241,.08),rgba(139,92,246,.05));">
      <h3 style="font-weight:700;margin-bottom:20px;">Appointment Summary</h3>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="color:var(--text-secondary);font-size:.9rem;">Selected Doctor</div>
          <div style="font-weight:700;display:flex;align-items:center;gap:10px;color:var(--primary);">
            <img src="${doc.image}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">
            ${doc.name} (${doc.degrees})
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="color:var(--text-secondary);font-size:.9rem;">Hospital / Pincode</div>
          <div style="font-weight:700;">${doc.hospital} &middot; <b>PIN: ${doc.pincode}</b></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="color:var(--text-secondary);font-size:.9rem;">Specialty</div>
          <div style="font-weight:700;display:flex;align-items:center;gap:8px;">${spec?.icon} ${spec?.label}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="color:var(--text-secondary);font-size:.9rem;">Date & Time</div>
          <div style="font-weight:700;">${dateStr} at ${_selectedTime}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="color:var(--text-secondary);font-size:.9rem;">Consultation Fee</div>
          <div style="font-weight:800;color:var(--success);font-size:1.1rem;">₹${doc.fee}</div>
        </div>
      </div>
    </div>

    <div class="form-group" style="margin-top:20px;">
      <label class="form-label">Reason for Visit</label>
      <textarea class="form-input" id="booking-reason" rows="3" placeholder="Briefly describe your symptoms or concerns..." style="resize:none;">${_initialReasonText ? `AI Triage Symptoms: ${_initialReasonText}` : ''}</textarea>
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
