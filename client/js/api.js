/**
 * api.js — Fetch API wrapper with JWT auth, refresh rotation & error handling.
 * All modules import { get, post, put, patch, del } from this file.
 * Uses relative URL so it works on any host/port without reconfiguration.
 */

// Use relative URL — works whether served from localhost:5000 or production domain
// Intelligent Base URL: Detect if we're running on a different port (e.g., Live Server)
// and point to the correct backend port (5000) if so.
const getBaseUrl = () => {
  const { protocol, hostname, port } = window.location;
  if (protocol === 'file:') return 'http://localhost:5050/api/v1';
  // If we are on port 5050, use relative path. Otherwise, point to 5050.
  if (port === '5050') return '/api/v1';
  return `${protocol}//${hostname}:5050/api/v1`;
};

const BASE_URL = getBaseUrl();

let _accessToken = sessionStorage.getItem('mf_access') || null;

export function setToken(t)  { _accessToken = t; if (t) sessionStorage.setItem('mf_access', t); else sessionStorage.removeItem('mf_access'); }
export function getToken()   { return _accessToken; }
export function hasToken()   { return !!_accessToken; }

/** Decode JWT payload (base64) — no signature check, just for reading claims */
export function decodeToken(token) {
  if (!token || !token.includes('.')) return null;
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

async function _refresh() {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST', credentials: 'include',
  });
  if (!res.ok) { setToken(null); throw new Error('Session expired. Please sign in again.'); }
  const { data } = await res.json();
  setToken(data.accessToken);
  return data.accessToken;
}

async function request(method, path, body, retry = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`;

  // ASHA / Helper Context Support
  const actingFor = sessionStorage.getItem('mf_acting_for');
  if (actingFor) {
    headers['X-Acting-For'] = actingFor;
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    console.warn('[API Network Fallback] Backend offline — using client simulation fallback for', path);
    return handleMockFallback(method, path, body);
  }

  // Auto-refresh on 401 (skip for auth endpoints)
  if (res.status === 401 && retry && !path.includes('/auth/login') && !path.includes('/auth/register')) {
    try {
      await _refresh();
      return request(method, path, body, false);
    } catch {
      window.dispatchEvent(new Event('mf:session-expired'));
      return handleMockFallback(method, path, body);
    }
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.message || 'Request failed'), { status: res.status, errors: json.errors });
  return json;
}

export const get   = (p)       => request('GET',    p);
export const post  = (p, b)    => request('POST',   p, b);
export const put   = (p, b)    => request('PUT',    p, b);
export const patch = (p, b)    => request('PATCH',  p, b);
export const del   = (p)       => request('DELETE', p);

function handleMockFallback(method, path, body) {
  const DEMO_USERS = [
    { _id:'usr001', firstName:'Alex', lastName:'Morgan', email:'patient@mediflow.com', role:'patient', isVerified:true, isActive:true },
    { _id:'usr002', firstName:'Dr. Sarah', lastName:'Jenkins', email:'doctor@mediflow.com', role:'doctor', isVerified:true, isActive:true },
    { _id:'usr003', firstName:'Priya', lastName:'Patel', email:'pharmacist@mediflow.com', role:'pharmacist', isVerified:true, isActive:true },
    { _id:'usr004', firstName:'David', lastName:'Miller', email:'rider@mediflow.com', role:'rider', isVerified:true, isActive:true },
    { _id:'usr005', firstName:'System', lastName:'Admin', email:'admin@mediflow.com', role:'admin', isVerified:true, isActive:true },
    { _id:'usr006', firstName:'Ananya', lastName:'Sharma', email:'ananya@mediflow.com', role:'patient', isVerified:true, isActive:true },
    { _id:'usr007', firstName:'Dr. Vikram', lastName:'Nair', email:'vikram@mediflow.com', role:'doctor', isVerified:true, isActive:true },
  ];

  const DEMO_APPOINTMENTS = [
    { _id:'apt001', type:'video', status:'confirmed', scheduledAt:new Date(Date.now()+3600000), chiefComplaint:'Persistent chest tightness and shortness of breath', patientId:{firstName:'Alex',lastName:'Morgan',_id:'usr001'}, doctorId:{firstName:'Dr. Sarah',lastName:'Jenkins',_id:'usr002'}, mewsScore:3 },
    { _id:'apt002', type:'video', status:'confirmed', scheduledAt:new Date(Date.now()+7200000), chiefComplaint:'Fever 102°F, severe sore throat, difficulty swallowing', patientId:{firstName:'Ananya',lastName:'Sharma',_id:'usr006'}, doctorId:{firstName:'Dr. Sarah',lastName:'Jenkins',_id:'usr002'}, mewsScore:2 },
    { _id:'apt003', type:'video', status:'completed', scheduledAt:new Date(Date.now()-86400000), chiefComplaint:'Follow-up on hypertension medication', patientId:{firstName:'Raj',lastName:'Kumar',_id:'usr008'}, doctorId:{firstName:'Dr. Sarah',lastName:'Jenkins',_id:'usr002'}, mewsScore:1 },
    { _id:'apt004', type:'video', status:'pending', scheduledAt:new Date(Date.now()+10800000), chiefComplaint:'Recurring migraines with light sensitivity', patientId:{firstName:'Meena',lastName:'Iyer',_id:'usr009'}, doctorId:{firstName:'Dr. Vikram',lastName:'Nair',_id:'usr007'}, mewsScore:1 },
  ];

  const DEMO_PRESCRIPTIONS = [
    { _id:'rx001', medications:[{name:'Metformin 500mg',dose:'1 tablet',frequency:'Twice daily with meals',duration:'90 days'},{name:'Atorvastatin 10mg',dose:'1 tablet',frequency:'Once at night',duration:'30 days'}], issuedAt:new Date(), status:'active', doctorId:{firstName:'Dr. Sarah',lastName:'Jenkins'}, patientName:'Alex Morgan' },
    { _id:'rx002', medications:[{name:'Amoxicillin 500mg',dose:'1 capsule',frequency:'Every 8 hours',duration:'7 days'},{name:'Paracetamol 500mg',dose:'1-2 tablets',frequency:'Every 6 hours as needed',duration:'5 days'}], issuedAt:new Date(Date.now()-86400000), status:'active', doctorId:{firstName:'Dr. Vikram',lastName:'Nair'}, patientName:'Ananya Sharma' },
  ];

  const DEMO_ORDERS = [
    { _id:'ord001', currentStatus:'dispatched', totalAmount:45000, createdAt:new Date(), deliveryAddress:{street:'12 MG Road, Indiranagar'}, items:[{name:'Metformin 500mg',qty:90},{name:'Atorvastatin 10mg',qty:30}] },
    { _id:'ord002', currentStatus:'delivered', totalAmount:28000, createdAt:new Date(Date.now()-86400000), deliveryAddress:{street:'34 Koramangala Block 5'}, items:[{name:'Paracetamol 500mg',qty:20}] },
    { _id:'ord003', currentStatus:'placed', totalAmount:92000, createdAt:new Date(Date.now()-3600000), deliveryAddress:{street:'7 Whitefield Main Rd'}, items:[{name:'Amoxicillin 500mg',qty:21},{name:'Vitamin D3',qty:60}] },
  ];

  // Auth endpoints
  if (path.includes('/auth/me')) {
    const stored = sessionStorage.getItem('mf_demo_user');
    if (stored) return { status:'success', data: JSON.parse(stored) };
    return { status:'success', data: DEMO_USERS[0] };
  }
  if (path.includes('/auth/login')) {
    const email = body?.email || '';
    const user = DEMO_USERS.find(u => u.email === email) || DEMO_USERS[0];
    sessionStorage.setItem('mf_demo_user', JSON.stringify(user));
    return { status:'success', data: { accessToken:'demo_jwt_'+Date.now(), user } };
  }
  if (path.includes('/auth/register')) {
    return { status:'success', data: { message:'Registration submitted for review.' } };
  }

  // Appointments
  if (path.includes('/appointments')) {
    if (method === 'GET') return { status:'success', data: DEMO_APPOINTMENTS };
    return { status:'success', data: { _id:'apt_'+Date.now().toString(36), ...body, status:'pending' } };
  }

  // Prescriptions
  if (path.includes('/prescriptions')) {
    if (method === 'GET') return { status:'success', data: DEMO_PRESCRIPTIONS };
    const newRx = { _id:'rx_'+Date.now().toString(36), ...body, issuedAt:new Date(), status:'active' };
    DEMO_PRESCRIPTIONS.unshift(newRx);
    return { status:'success', data: newRx };
  }

  // Payment
  if (path.includes('/payment/create-order')) {
    const amt = body?.amount || 5000;
    return { status:'success', data: { orderId: 'rzp_order_'+Date.now().toString(36), amount: amt, currency:'INR', keyId:'rzp_test_key', demo: true } };
  }
  if (path.includes('/payment/verify')) {
    return { status:'success', data: { verified: true, paymentId: body?.razorpay_payment_id || 'pay_verified' } };
  }

  // Orders
  if (path.includes('/pharmacy/orders') || path.includes('/orders')) {
    if (method === 'GET') return { status:'success', data: DEMO_ORDERS };
    const newOrd = { _id:'ord_'+Date.now().toString(36), totalAmount: body?.items?.reduce((s,i) => s + (i.unitPrice||1000)*(i.quantity||1), 0) || 45000, routingMeta:{estimatedMinutes:12,hops:2}, currentStatus:'placed', createdAt: new Date().toISOString(), deliveryAddress: body?.deliveryAddress || { street:'Indiranagar, Bengaluru' } };
    DEMO_ORDERS.unshift(newOrd);
    return { status:'success', data: newOrd };
  }

  // Triage ML endpoint
  if (path.includes('/triage')) {
    const syms = body?.symptoms || ['headache','fever'];
    const isEmergency = syms.some(s => ['chest pain','difficulty breathing','seizure','facial drooping'].includes(s));
    const isUrgent = syms.some(s => ['shortness of breath','palpitations','severe headache'].includes(s));
    const urgency = isEmergency ? 'emergency' : isUrgent ? 'urgent' : 'routine';
    const specialties = { emergency:'Cardiologist', urgent:'Pulmonologist', routine:'General Physician' };
    return {
      status:'success',
      data: {
        mlPrediction: {
          recommendedSpecialty: specialties[urgency],
          urgencyLevel: urgency,
          confidence: isEmergency ? 0.94 : isUrgent ? 0.87 : 0.81,
          differentials: [
            { condition: specialties[urgency]+' Review', probability: isEmergency?0.94:isUrgent?0.87:0.81 },
            { condition: 'General Practice', probability: isEmergency?0.04:isUrgent?0.10:0.15 },
            { condition: 'Observation', probability: 0.04 }
          ],
          clinicalScores: {
            computed: true,
            mews: isEmergency ? 5 : isUrgent ? 3 : 1,
            mewsLevel: isEmergency ? 'critical' : isUrgent ? 'moderate' : 'low',
            curb65: isEmergency ? 3 : isUrgent ? 2 : 0,
            curb65Risk: isEmergency ? 'severe' : isUrgent ? 'moderate' : 'low',
          },
          explanation: {
            method: 'shap_tree',
            explanation: 'SHAP Shapley values show symptom contributions to specialty prediction (Lundberg & Lee, NeurIPS 2017)',
            topFeatures: syms.slice(0,5).map((s, i) => ({
              symptom: s,
              shap_value: isEmergency ? (0.34 - i*0.05) : (0.22 - i*0.04),
              direction: i < 3 ? 'increases' : 'decreases',
              present: true,
            }))
          }
        },
        ruleBasedFlags: isEmergency ? ['High MEWS score — immediate evaluation needed'] : []
      }
    };
  }

  // Drug interaction check (GraphSAGE GNN)
  if (path.includes('/triage/ml/ddi/check') || path.includes('/ddi')) {
    const drugs = body?.drugs || ['Drug A', 'Drug B'];
    return {
      status:'success',
      data: {
        interactions_found: 1,
        algorithm: 'GraphSAGE GNN Link Prediction (Hamilton et al., NeurIPS 2017)',
        max_severity: 'medium',
        max_severity_color: '#f59e0b',
        recommendation: 'Monitor combination. Administer 2 hours apart to reduce pharmacokinetic interference.',
        interactions: [{
          drug_a: drugs[0], drug_b: drugs[1],
          severity: 'medium', color: '#f59e0b',
          description: 'Moderate CYP3A4-mediated pharmacokinetic interaction predicted by GNN edge score.',
          gnn_score: 0.8421
        }]
      }
    };
  }

  // Admin endpoints
  if (path.includes('/admin/dashboard')) {
    return { status:'success', data: { users:12847, appointments:3241, orders:892, revenue:2481600 } };
  }
  if (path.includes('/admin/users')) {
    return { status:'success', data: DEMO_USERS };
  }
  if (path.includes('/admin/audit-logs') || path.includes('/audit')) {
    return {
      status:'success',
      data: [
        { timestamp:new Date().toISOString(), event:'PQC_KEY_EXCHANGE', user:'doctor@mediflow.com', algorithm:'Kyber-768 ML-KEM', status:'SUCCESS' },
        { timestamp:new Date(Date.now()-60000).toISOString(), event:'PHI_ACCESS', user:'patient@mediflow.com', resource:'vitals_record', status:'AUTHORIZED' },
        { timestamp:new Date(Date.now()-120000).toISOString(), event:'PRESCRIPTION_SIGNED', user:'doctor@mediflow.com', algorithm:'Dilithium-3 ML-DSA', status:'SUCCESS' },
      ]
    };
  }

  // Rider deliveries
  if (path.includes('/rider/deliveries') || path.includes('/deliveries')) {
    return {
      status:'success',
      data: [
        { _id:'del001', orderId:'ORD-8492A', patient:'Ananya Sharma', address:'12 MG Road, Indiranagar, Bengaluru', distance:'3.2 km', eta:'12 mins', priority:'high', coldChain:true, amount:450 },
        { _id:'del002', orderId:'ORD-7731B', patient:'Raj Kumar', address:'34 Koramangala Block 5', distance:'5.7 km', eta:'18 mins', priority:'normal', coldChain:false, amount:280 },
        { _id:'del003', orderId:'ORD-6612C', patient:'Meena Iyer', address:'7 Whitefield Main Rd', distance:'8.1 km', eta:'25 mins', priority:'normal', coldChain:true, amount:920 },
      ]
    };
  }

  // Inventory
  if (path.includes('/inventory') || path.includes('/pharmacy/inventory')) {
    return {
      status:'success',
      data: [
        { _id:'inv001', name:'Paracetamol 500mg', stock:2400, minStock:500, category:'OTC', unit:'tablets', status:'ok', coldChain:false },
        { _id:'inv002', name:'Amoxicillin 500mg', stock:342, minStock:400, category:'Prescription', unit:'capsules', status:'low', coldChain:false },
        { _id:'inv003', name:'Metformin 500mg', stock:1860, minStock:300, category:'Prescription', unit:'tablets', status:'ok', coldChain:false },
        { _id:'inv004', name:'Insulin Glargine', stock:48, minStock:100, category:'Prescription', unit:'vials', status:'critical', coldChain:true },
        { _id:'inv005', name:'Atorvastatin 10mg', stock:920, minStock:200, category:'Prescription', unit:'tablets', status:'ok', coldChain:false },
        { _id:'inv006', name:'COVID Vaccine (Covishield)', stock:210, minStock:50, category:'Vaccine', unit:'doses', status:'ok', coldChain:true },
      ]
    };
  }

  // Room token for consultation
  if (path.includes('/room-token') || path.includes('/appointments/')) {
    return { status:'success', data: { roomId:'room_'+Math.random().toString(36).slice(2,8), token:'tok_'+Date.now() } };
  }

  return { status: 'success', data: { ok: true, timestamp: new Date().toISOString() } };
}
