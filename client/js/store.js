/**
 * store.js — Minimal reactive state store (observer pattern).
 * No framework dependency — modules subscribe to state slices.
 */

let savedCart = [];
try {
  const c = localStorage.getItem('mf_cart');
  if (c) savedCart = JSON.parse(c);
} catch (e) {
  console.warn('Failed to parse cart from storage', e);
}

const _state = {
  user       : null,    // { id, role, firstName, lastName, email }
  accessToken: null,
  cart       : savedCart, // [{ medicine, quantity }]
  triageResult: null,
};

const _listeners = {};

export function getState(key) { return _state[key]; }

export function setState(key, value) {
  _state[key] = value;
  if (key === 'cart') {
    localStorage.setItem('mf_cart', JSON.stringify(value));
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
