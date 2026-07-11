/**
 * health-ai.js — AI Health Score + Emergency SOS + Voice Nav + PDF Report + Scanner
 */

// ── Health Score Engine ────────────────────────────────────────────────────────
export class HealthScoreEngine {
  constructor() {
    this.weights = { hr:0.20, spo2:0.25, bp:0.20, temp:0.15, glucose:0.10, rr:0.10 };
  }
  compute(vitals={}) {
    const { hr=72, spo2=98, sbp=120, temp=37.0, glucose=95, rr=16 } = vitals;
    const scores = {
      hr: Math.max(0, 100 - Math.abs(hr-80)/80*200),
      spo2: spo2>=95?100:spo2>=90?60:20,
      bp: Math.max(0, 100 - Math.abs(sbp-120)/120*150),
      temp: Math.max(0, 100 - Math.abs(temp-37.0)/1.5*100),
      glucose: Math.max(0, 100 - (glucose>100?(glucose-100)/100:glucose<70?(70-glucose)/70:0)*150),
      rr: Math.max(0, 100 - Math.abs(rr-16)/16*200),
    };
    let total=0;
    for (const [k,w] of Object.entries(this.weights)) total += (scores[k]||70)*w;
    const score = Math.round(Math.min(100,Math.max(0,total)));
    return {
      score,
      grade: score>=85?'Excellent':score>=70?'Good':score>=50?'Fair':'Needs Attention',
      color: score>=85?'#10b981':score>=70?'#3b82f6':score>=50?'#f59e0b':'#ef4444',
      components: scores,
      risks: this._risks(vitals),
      recommendations: this._recs(vitals, scores),
    };
  }
  _risks(v) {
    const r=[];
    if(v.spo2<95) r.push({level:'high',label:'Low Oxygen Saturation',action:'Seek immediate medical attention'});
    if(v.hr>100) r.push({level:'medium',label:'Tachycardia',action:'Rest and monitor. Consult doctor if persistent.'});
    if(v.sbp>140) r.push({level:'high',label:'Hypertension Risk',action:'Reduce sodium, consult cardiologist.'});
    if(v.temp>38.5) r.push({level:'high',label:'Fever Detected',action:'Antipyretics + hydration. ER if >39.5°C'});
    if(v.glucose>126) r.push({level:'medium',label:'Elevated Glucose',action:'Monitor diet, consult endocrinologist.'});
    return r;
  }
  _recs(v, s) {
    const r=[];
    if(s.hr<70) r.push('🏃 30 min daily aerobic exercise improves cardiac efficiency');
    if(v.sbp>130) r.push('🧂 Reduce sodium to <2g/day and manage stress levels');
    if(v.glucose>100) r.push('🥗 Low-GI diet + post-meal walks regulate blood sugar');
    r.push('💧 Maintain 2–3L daily hydration');
    r.push('😴 7–8 hours quality sleep optimises all vitals');
    return r.slice(0,3);
  }
}

// ── Animated Gauge ─────────────────────────────────────────────────────────────
export function drawHealthGauge(canvasId, score, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx=canvas.width/2, cy=canvas.height/2, r=Math.min(cx,cy)-12;
  let cur=0;
  const draw = () => {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI*.75,Math.PI*2.25);
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=14; ctx.lineCap='round'; ctx.stroke();
    if (cur>0) {
      const g=ctx.createLinearGradient(0,0,canvas.width,0);
      g.addColorStop(0,color+'88'); g.addColorStop(1,color);
      ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI*.75,Math.PI*.75+(cur/100)*Math.PI*1.5);
      ctx.strokeStyle=g; ctx.lineWidth=14; ctx.lineCap='round'; ctx.stroke();
    }
    ctx.fillStyle=color; ctx.font=`bold ${Math.round(r*.55)}px Inter,system-ui`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(Math.round(cur),cx,cy-6);
    ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font=`${Math.round(r*.22)}px Inter,system-ui`;
    ctx.fillText('/ 100',cx,cy+r*.28);
    if(cur<score){ cur=Math.min(score,cur+1.8); requestAnimationFrame(draw); }
  };
  requestAnimationFrame(draw);
}

// ── Risk Radar ─────────────────────────────────────────────────────────────────
export function drawRiskRadar(canvasId, components) {
  const canvas=document.getElementById(canvasId); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const cx=canvas.width/2,cy=canvas.height/2,r=Math.min(cx,cy)-20;
  const labels=Object.keys(components), vals=Object.values(components), n=labels.length;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for(let ring=1;ring<=4;ring++){
    ctx.beginPath();
    labels.forEach((_,i)=>{
      const a=(Math.PI*2*i/n)-Math.PI/2;
      const x=cx+Math.cos(a)*(r*ring/4),y=cy+Math.sin(a)*(r*ring/4);
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.closePath(); ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1; ctx.stroke();
  }
  labels.forEach((_,i)=>{
    const a=(Math.PI*2*i/n)-Math.PI/2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);
    ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='10px Inter,system-ui';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(labels[i].toUpperCase(),cx+Math.cos(a)*(r+14),cy+Math.sin(a)*(r+14));
  });
  const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
  grad.addColorStop(0,'rgba(99,102,241,0.6)'); grad.addColorStop(1,'rgba(99,102,241,0.1)');
  ctx.beginPath();
  vals.forEach((v,i)=>{
    const a=(Math.PI*2*i/n)-Math.PI/2;
    const x=cx+Math.cos(a)*(r*v/100),y=cy+Math.sin(a)*(r*v/100);
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  });
  ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
  ctx.strokeStyle='#6366f1'; ctx.lineWidth=2; ctx.stroke();
  vals.forEach((v,i)=>{
    const a=(Math.PI*2*i/n)-Math.PI/2;
    ctx.beginPath(); ctx.arc(cx+Math.cos(a)*(r*v/100),cy+Math.sin(a)*(r*v/100),4,0,Math.PI*2);
    ctx.fillStyle='#a5b4fc'; ctx.fill();
  });
}

// ── Emergency SOS ──────────────────────────────────────────────────────────────
let _sosTimer=null, _sosCD=10;
export function initEmergencySOS() {
  const btn=document.getElementById('sos-btn');
  const modal=document.getElementById('sos-modal');
  const cancelBtn=document.getElementById('sos-cancel');
  const countdownEl=document.getElementById('sos-countdown');
  if(!btn) return;
  btn.addEventListener('click',()=>{
    _sosCD=10; modal?.classList.remove('hidden');
    if(countdownEl) countdownEl.textContent=_sosCD;
    clearInterval(_sosTimer);
    _sosTimer=setInterval(()=>{
      _sosCD--;
      if(countdownEl) countdownEl.textContent=_sosCD;
      if(_sosCD<=0){
        clearInterval(_sosTimer); modal?.classList.add('hidden');
        import('./toast.js').then(({toastError})=>toastError('🚨 SOS ACTIVATED','Emergency team dispatched. Nearest ER: 2.3km, ETA: 8 mins'));
      }
    },1000);
  });
  cancelBtn?.addEventListener('click',()=>{ clearInterval(_sosTimer); modal?.classList.add('hidden'); });
}

// ── PDF Health Report ─────────────────────────────────────────────────────────
export function generateHealthReport(user, vitals, hs) {
  const w=window.open('','_blank','width=850,height=700');
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>MediFlow Health Report</title>
  <style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#1a1a2e}
  .hdr{display:flex;justify-content:space-between;border-bottom:3px solid #6366f1;padding-bottom:20px;margin-bottom:30px}
  .logo{font-size:24px;font-weight:900;color:#6366f1}.sec h2{font-size:16px;color:#6366f1;border-bottom:1px solid #e5e7eb;padding-bottom:8px}
  .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px}.vbox{background:#f8fafc;border-radius:8px;padding:12px;text-align:center}
  .vval{font-size:24px;font-weight:700}.vlbl{font-size:11px;color:#666}
  .sc{width:120px;height:120px;border-radius:50%;border:8px solid ${hs?.color||'#6366f1'};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:900;color:${hs?.color||'#6366f1'};margin:0 auto 10px}
  .ri{padding:8px 12px;border-radius:6px;margin-bottom:8px;font-size:13px}
  .rh{background:#fef2f2;border-left:4px solid #ef4444;color:#991b1b}
  .rm{background:#fffbeb;border-left:4px solid #f59e0b;color:#92400e}
  .rl{background:#f0fdf4;border-left:4px solid #10b981;color:#065f46}
  .ftr{text-align:center;font-size:11px;color:#999;margin-top:40px;border-top:1px solid #e5e7eb;padding-top:20px}
  </style></head><body>
  <div class="hdr"><div><div class="logo">🏥 MediFlow</div><div style="font-size:14px;color:#666">AI Health Report</div></div>
  <div style="text-align:right"><div style="font-weight:600">${user?.firstName||'Patient'} ${user?.lastName||''}</div>
  <div style="font-size:12px;color:#666">${new Date().toLocaleString()}</div>
  <div style="font-size:12px;color:#666">Report ID: MF-${Date.now().toString(36).toUpperCase()}</div></div></div>
  <div style="display:grid;grid-template-columns:1fr 2fr;gap:30px;margin-bottom:30px">
  <div class="sec"><h2>AI Health Score</h2><div class="sc">${hs?.score||78}</div>
  <div style="text-align:center;font-size:20px;font-weight:700;color:${hs?.color||'#6366f1'}">${hs?.grade||'Good'}</div></div>
  <div class="sec"><h2>Current Vitals</h2><div class="grid">
  <div class="vbox"><div class="vval">${vitals?.hr||72}</div><div class="vlbl">HR (bpm)</div></div>
  <div class="vbox"><div class="vval">${vitals?.spo2||98}%</div><div class="vlbl">SpO₂</div></div>
  <div class="vbox"><div class="vval">${vitals?.sbp||120}</div><div class="vlbl">Sys BP</div></div>
  <div class="vbox"><div class="vval">${vitals?.temp||37.0}°C</div><div class="vlbl">Temp</div></div>
  <div class="vbox"><div class="vval">${vitals?.glucose||95}</div><div class="vlbl">Glucose</div></div>
  <div class="vbox"><div class="vval">${vitals?.rr||16}</div><div class="vlbl">Resp Rate</div></div>
  </div></div></div>
  ${hs?.risks?.length?`<div class="sec"><h2>Risk Assessment</h2>${hs.risks.map(r=>`<div class="ri r${r.level[0]}"><strong>${r.label}</strong>: ${r.action}</div>`).join('')}</div>`:''}
  ${hs?.recommendations?.length?`<div class="sec"><h2>AI Recommendations</h2><ul>${hs.recommendations.map(r=>`<li>${r}</li>`).join('')}</ul></div>`:''}
  <div class="ftr">Generated by <strong>MediFlow AI v2.0</strong> · Smart Telemedicine Platform · Always consult a licensed professional.</div>
  </body></html>`);
  w.document.close();
  setTimeout(()=>{ try{w.print();}catch(e){} },800);
}

// ── Voice Navigation ───────────────────────────────────────────────────────────
let _voiceActive=false, _recognition=null;
export function initVoiceNavigation(navigateFn) {
  const btn=document.getElementById('voice-nav-btn'); if(!btn) return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ btn.style.opacity='0.4'; btn.title='Voice not supported'; return; }
  _recognition=new SR();
  _recognition.continuous=false; _recognition.lang='en-US'; _recognition.interimResults=false;
  _recognition.onresult=(e)=>{ _handleCmd(e.results[0][0].transcript.toLowerCase(), navigateFn); _stopVoice(btn); };
  _recognition.onerror=()=>_stopVoice(btn);
  _recognition.onend=()=>_stopVoice(btn);
  btn.addEventListener('click',()=>{ if(_voiceActive){_recognition.stop();_stopVoice(btn);}else _startVoice(btn); });
}
function _startVoice(btn){ _voiceActive=true; btn?.classList.add('listening'); try{_recognition?.start();}catch{}
  import('./toast.js').then(({toastInfo})=>toastInfo?.('🎤 Listening','Say: "dashboard", "pharmacy", "triage", "consult", "emergency"'));
}
function _stopVoice(btn){ _voiceActive=false; btn?.classList.remove('listening'); }
function _handleCmd(cmd, nav) {
  const map={home:['home','landing'],dashboard:['dashboard','overview','stats'],
    triage:['triage','symptom','diagnose'],pharmacy:['pharmacy','medicine','order'],
    consultation:['consult','video','doctor','call']};
  for(const [r,kws] of Object.entries(map)){
    if(kws.some(k=>cmd.includes(k))){ nav(r); _speak(`Going to ${r}`); return; }
  }
  if(cmd.includes('emergency')||cmd.includes('sos')||cmd.includes('help')){
    document.getElementById('sos-btn')?.click(); _speak('Emergency SOS activated'); return;
  }
  _speak('Command not recognized');
}
function _speak(t){ const u=new SpeechSynthesisUtterance(t); u.rate=1.1; window.speechSynthesis?.speak(u); }

// ── Medicine Barcode Scanner ───────────────────────────────────────────────────
export function initMedicineScanner() {
  const btn=document.getElementById('scan-medicine-btn');
  const modal=document.getElementById('scanner-modal');
  const closeBtn=document.getElementById('scanner-close');
  const video=document.getElementById('scanner-video');
  const statusEl=document.getElementById('scanner-status');
  let stream=null;
  if(!btn) return;
  btn.addEventListener('click',async()=>{
    modal?.classList.remove('hidden');
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      if(video) video.srcObject=stream;
      if(statusEl) statusEl.textContent='📡 Point camera at barcode or QR code...';
      setTimeout(()=>_simScan(stream,modal,statusEl),3000);
    }catch{
      if(statusEl) statusEl.textContent='⚠ Camera unavailable — demo mode active';
      setTimeout(()=>_simScan(null,modal,statusEl),1500);
    }
  });
  closeBtn?.addEventListener('click',()=>{ stream?.getTracks().forEach(t=>t.stop()); modal?.classList.add('hidden'); });
}
function _simScan(stream,modal,statusEl){
  stream?.getTracks().forEach(t=>t.stop());
  if(statusEl) statusEl.textContent='✅ Medicine identified!';
  const meds=['Paracetamol 500mg','Amoxicillin 250mg','Metformin 850mg','Ibuprofen 400mg','Cetirizine 10mg'];
  const med=meds[Math.floor(Math.random()*meds.length)];
  setTimeout(()=>{
    modal?.classList.add('hidden');
    import('./toast.js').then(({toastSuccess})=>toastSuccess('🔍 Scanned',`Found: ${med}`));
    const inp=document.getElementById('med-search');
    if(inp){ inp.value=med.split(' ')[0]; inp.dispatchEvent(new Event('input')); }
    import('./router.js').then(({navigate})=>navigate('pharmacy'));
  },800);
}

// ── Sparkline Trend ───────────────────────────────────────────────────────────
export class TrendSparkline {
  constructor(canvasId, color='#6366f1', maxPoints=60) {
    this.canvas=document.getElementById(canvasId); this.color=color; this.data=[]; this.max=maxPoints;
  }
  push(v){ this.data.push(v); if(this.data.length>this.max) this.data.shift(); this.render(); }
  render(){
    if(!this.canvas||this.data.length<2) return;
    const ctx=this.canvas.getContext('2d'), w=this.canvas.width, h=this.canvas.height;
    ctx.clearRect(0,0,w,h);
    const mn=Math.min(...this.data), mx=Math.max(...this.data), rng=mx-mn||1;
    const grad=ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,this.color+'44'); grad.addColorStop(1,this.color+'00');
    ctx.beginPath();
    this.data.forEach((v,i)=>{
      const x=(i/(this.max-1))*w, y=h-((v-mn)/rng)*(h-4)-2;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.strokeStyle=this.color; ctx.lineWidth=2; ctx.stroke();
    ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
  }
}

// ── AI Model Performance & Federated Learning Dashboard (v2.0) ───────────────
export async function initMLDashboard() {
  const specAccEl     = document.getElementById('ml-specialty-acc');
  const urgAccEl      = document.getElementById('ml-urgency-acc');
  const brierEl       = document.getElementById('ml-brier');
  const cvAccEl       = document.getElementById('ml-cv-acc');
  const featuresEl    = document.getElementById('ml-features');
  const shapEl        = document.getElementById('ml-shap');

  const nodesGrid     = document.getElementById('federated-nodes-grid');
  const fedAccuracyEl = document.getElementById('fed-accuracy');
  const fedGainEl     = document.getElementById('fed-gain');

  if (!specAccEl) return; // Only run on dashboard page containing ML elements

  try {
    // 1. Fetch ML Metrics
    const metricsRes = await api.get('/triage/ml/metrics');
    if (metricsRes?.data) {
      const m = metricsRes.data;
      specAccEl.textContent  = `${(m.specialtyAccuracy * 100).toFixed(1)}%`;
      urgAccEl.textContent   = `${(m.urgencyAccuracy * 100).toFixed(1)}%`;
      brierEl.textContent    = m.brierScore.toFixed(4);
      cvAccEl.textContent    = `${(m.cvMeanAccuracy * 100).toFixed(1)}%`;
      featuresEl.textContent = m.nFeatureTokens || m.features;
      shapEl.textContent     = m.shapEnabled ? 'SHAP' : 'Fallback';
    }

    // 2. Fetch Federated Learning Stats
    const fedRes = await api.get('/triage/ml/federated');
    if (fedRes?.data) {
      const f = fedRes.data;
      fedAccuracyEl.textContent = `${(f.federatedAccuracy * 100).toFixed(1)}%`;
      fedGainEl.textContent     = `+${(f.fedGain * 100).toFixed(1)}%`;

      if (f.hospitals && f.hospitals.length) {
        nodesGrid.innerHTML = f.hospitals.map(h => `
          <div class="card" style="border-top:3px solid var(--success);padding:18px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <span style="font-weight:700;font-size:.9rem;color:var(--text-primary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden;max-width:180px;" title="${h.name}">
                🏦 ${h.name}
              </span>
              <span class="badge badge-routine" style="font-size:.65rem;padding:2px 6px;">${h.privacyBudget}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;">
              <div style="background:rgba(255,255,255,.02);padding:10px;border-radius:6px;border:1px solid var(--border);">
                <div style="font-size:.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">Local Samples</div>
                <div style="font-size:1.1rem;font-weight:800;color:var(--text-primary);">${h.localSamples}</div>
              </div>
              <div style="background:rgba(255,255,255,.02);padding:10px;border-radius:6px;border:1px solid var(--border);">
                <div style="font-size:.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">Local Accuracy</div>
                <div style="font-size:1.1rem;font-weight:800;color:var(--primary);">${(h.localAccuracy * 100).toFixed(1)}%</div>
              </div>
            </div>
            <div style="margin-top:12px;font-size:.72rem;color:var(--text-muted);display:flex;justify-content:space-between;">
              <span>Rounds completed: ${h.rounds}</span>
              <span>Updated: ${h.lastUpdated}</span>
            </div>
          </div>
        `).join('');
      } else {
        nodesGrid.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-secondary);font-size:.85rem;">
            No hospitals in federated learning network.
          </div>`;
      }
    }
  } catch (err) {
    console.error('[MLDashboard] Failed to initialize:', err);
  }
}

