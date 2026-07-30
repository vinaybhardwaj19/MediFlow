/**
 * store.js — Minimal reactive state store (observer pattern) + Secure Storage.
 */

// ── Secure Storage Wrapper (XOR + Base64 Obfuscation) ────────────────────────
const STORE_KEY = 'm3d1fl0w_s3cur3_k3y_99x';
export function setSecureStorage(key, value) {
  try {
    const jsonStr = JSON.stringify(value);
    let xor = '';
    for (let i = 0; i < jsonStr.length; i++) {
      xor += String.fromCharCode(jsonStr.charCodeAt(i) ^ STORE_KEY.charCodeAt(i % STORE_KEY.length));
    }
    localStorage.setItem(key, btoa(encodeURIComponent(xor)));
  } catch (e) {
    console.error('Failed to secure store', e);
  }
}

export function getSecureStorage(key, defaultValue = null) {
  try {
    const b64 = localStorage.getItem(key);
    if (!b64) return defaultValue;
    const xor = decodeURIComponent(atob(b64));
    let jsonStr = '';
    for (let i = 0; i < xor.length; i++) {
      jsonStr += String.fromCharCode(xor.charCodeAt(i) ^ STORE_KEY.charCodeAt(i % STORE_KEY.length));
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn('Failed to parse secure storage, resetting key:', key);
    localStorage.removeItem(key);
    return defaultValue;
  }
}

let savedCart = getSecureStorage('mf_cart', []);
let savedAddresses = getSecureStorage('mf_addresses', []);

const _state = {
  user       : null,    // { id, role, firstName, lastName, email }
  accessToken: null,
  cart       : savedCart, // [{ medicine, quantity }]
  addresses  : savedAddresses, // [{ label, street, city, state, zipCode, coordinates }]
  triageResult: null,
};

const _listeners = {};

export function getState(key) { return _state[key]; }

export function setState(key, value) {
  _state[key] = value;
  if (key === 'cart') {
    setSecureStorage('mf_cart', value);
  }
  if (key === 'addresses') {
    setSecureStorage('mf_addresses', value);
  }
  (_listeners[key] || []).forEach(fn => fn(value));
}

export function subscribe(key, fn) {
  if (!_listeners[key]) _listeners[key] = [];
  _listeners[key].push(fn);
  return () => { _listeners[key] = _listeners[key].filter(f => f !== fn); }; // unsubscribe
}

// Cart helpers
export function cartAdd(medicine) {
  const existing = _state.cart.find(i => i.medicine._id === medicine._id);
  if (existing) { existing.quantity++; }
  else { _state.cart.push({ medicine, quantity: 1 }); }
  setState('cart', [..._state.cart]);
}

export function cartRemove(medicineId) {
  setState('cart', _state.cart.filter(i => i.medicine._id !== medicineId));
}

export function cartClear() { setState('cart', []); }

export function cartTotal() {
  return _state.cart.reduce((s, i) => s + i.medicine.price * i.quantity, 0);
}
