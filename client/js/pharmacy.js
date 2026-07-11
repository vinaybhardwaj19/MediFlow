/**
 * pharmacy.js — E-Pharmacy module with medicine search, cart, and order routing.
 */
import * as api from './api.js';
import { cartAdd, cartRemove, cartClear, cartTotal, getState, setState, subscribe } from './store.js';
import { toastSuccess, toastError, toastInfo } from './toast.js';
import { startRealDeliveryTracking } from './drone-tracker.js';

const DEMO_MEDICINES = [
  { _id:'m1', name:'Paracetamol', genericName:'Acetaminophen', brand:'Calpol', price:1500, category:'otc',          requiresPrescription:false, dosageForms:['tablet'], emoji:'💊', images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m2', name:'Amoxicillin', genericName:'Amoxicillin',  brand:'Mox',    price:8500, category:'prescription',   requiresPrescription:true,  dosageForms:['capsule'], emoji:'💉', images: ['https://images.unsplash.com/photo-1471864190281-ad5fe9bb0724?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m3', name:'Metformin',   genericName:'Metformin',     brand:'Glycomet',price:4200,category:'prescription',  requiresPrescription:true,  dosageForms:['tablet'], emoji:'🟡', images: ['https://images.unsplash.com/photo-1576091160550-2173bdd99625?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m4', name:'Cough Syrup', genericName:'Dextromethorphan', brand:'Vicks', price:2800, category:'otc', requiresPrescription:false, dosageForms:['syrup'], emoji:'🔵', images: ['https://images.unsplash.com/photo-1587854692152-cbe660dbbb88?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m5', name:'Omeprazole',  genericName:'Omeprazole',    brand:'Prilosec',price:5500,category:'prescription',  requiresPrescription:true,  dosageForms:['capsule'],emoji:'🔴', images: ['https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m6', name:'Vitamin D3',  genericName:'Cholecalciferol',brand:'D-Rise',price:3200,category:'otc',            requiresPrescription:false, dosageForms:['capsule'],emoji:'☀️', images: ['https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m7', name:'Ibuprofen',   genericName:'Ibuprofen',     brand:'Brufen', price:2200, category:'otc',           requiresPrescription:false, dosageForms:['tablet'], emoji:'🟠', images: ['https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&w=400&q=80'] },
  { _id:'m8', name:'Atorvastatin',genericName:'Atorvastatin',  brand:'Lipitor',price:9800, category:'prescription',  requiresPrescription:true,  dosageForms:['tablet'], emoji:'🟣', images: ['https://images.unsplash.com/photo-1550572017-edb79a558509?auto=format&fit=crop&w=400&q=80'] },
];

let allMedicines = [];
let debounceTimer;

export function initPharmacy() {
  loadMedicines();
  bindSearch();
  bindCart();
  subscribe('cart', renderCartBadge);
}

async function loadMedicines() {
  const grid = document.getElementById('medicine-grid');
  // Show skeleton loaders
  if (grid) {
    grid.innerHTML = Array(8).fill(
      `<div class="medicine-card skeleton" style="height: 280px;"></div>`
    ).join('');
  }
  try {
    const res = await api.get('/pharmacy/medicines?limit=20');
    allMedicines = res.data?.length ? res.data : DEMO_MEDICINES;
  } catch {
    allMedicines = DEMO_MEDICINES; // Demo fallback for exhibition
  }
  renderGrid(allMedicines);
}

function renderGrid(medicines) {
  const grid  = document.getElementById('medicine-grid');
  const empty = document.getElementById('pharmacy-empty');
  if (!medicines.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = medicines.map(m => {
    const cartItem = getState('cart').find(i => i.medicine._id === m._id);
    const inCart = !!cartItem;
    const qty = cartItem?.quantity || 0;
    const mediaHtml = (m.images && m.images.length > 0)
      ? `<img src="${m.images[0]}" alt="${m.name}" class="med-photo" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="med-emoji" style="display:none;">${m.emoji || '💊'}</div>`
      : `<div class="med-emoji">${m.emoji || '💊'}</div>`;

    const addBtn = inCart
      ? `<div class="qty-stepper" data-id="${m._id}">
           <button class="qty-btn qty-dec" data-id="${m._id}">−</button>
           <span class="qty-val">${qty}</span>
           <button class="qty-btn qty-inc" data-id="${m._id}">+</button>
         </div>`
      : `<button class="btn btn-primary btn-sm add-to-cart" data-id="${m._id}" style="width:100%;">+ Add to Cart</button>`;

    return `
    <div class="medicine-card fade-up" data-id="${m._id}">
      <div class="med-media-container">${mediaHtml}</div>
      <div>
        <div class="med-name">${m.name}</div>
        <div class="med-generic">${m.genericName || ''} &middot; ${m.brand || m.manufacturer || ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <span class="badge ${m.category === 'otc' ? 'badge-routine' : 'badge-primary'}">${m.category.toUpperCase()}</span>
        ${m.requiresPrescription ? '<span class="badge badge-urgent">Rx Required</span>' : ''}
      </div>
      <div class="med-price">₹${(m.price / 100).toFixed(2)}</div>
      ${addBtn}
    </div>`;
  }).join('');

  // Add to cart buttons
  grid.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      const med = medicines.find(m => m._id === btn.dataset.id);
      if (!med) return;
      cartAdd(med);
      toastSuccess('Added to cart', med.name);
      renderGrid(medicines); // re-render to show stepper
    });
  });

  // Qty stepper buttons
  grid.querySelectorAll('.qty-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const med = medicines.find(m => m._id === btn.dataset.id);
      if (med) { cartAdd(med); renderGrid(medicines); }
    });
  });
  grid.querySelectorAll('.qty-dec').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const cartItem = getState('cart').find(i => i.medicine._id === id);
      if (!cartItem) return;
      if (cartItem.quantity <= 1) {
        cartRemove(id);
        toastInfo('Removed', 'Item removed from cart');
      } else {
        // Decrement: remove and re-add with qty-1
        cartRemove(id);
        const med = medicines.find(m => m._id === id);
        for (let i = 0; i < cartItem.quantity - 1; i++) cartAdd(med);
      }
      renderGrid(medicines);
    });
  });
}

function bindSearch() {
  const searchInput = document.getElementById('med-search');
  const catFilter   = document.getElementById('med-category');
  const doFilter = () => {
    const q   = searchInput.value.trim().toLowerCase();
    const cat = catFilter.value;
    const filtered = allMedicines.filter(m =>
      (!q   || m.name.toLowerCase().includes(q) || (m.genericName || '').toLowerCase().includes(q)) &&
      (!cat || m.category === cat)
    );
    renderGrid(filtered);
  };
  searchInput.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(doFilter, 250); });
  catFilter.addEventListener('change', doFilter);
}

function renderCartBadge(cart) {
  const badge    = document.getElementById('cart-badge');
  const countEl  = document.getElementById('cart-count');
  const totalEl  = document.getElementById('cart-total');
  if (!cart.length) { badge.classList.add('hidden'); return; }
  badge.classList.remove('hidden');
  countEl.textContent = `${cart.reduce((s,i) => s + i.quantity, 0)} item${cart.length > 1 ? 's' : ''}`;
  totalEl.textContent = `₹${(cartTotal() / 100).toFixed(2)}`;
}

function bindCart() {
  document.getElementById('cart-badge')?.addEventListener('click', openCheckout);
  
  // Checkout UI bindings
  document.getElementById('close-checkout')?.addEventListener('click', () => {
    document.getElementById('checkout-modal').classList.add('hidden');
  });
  
  document.getElementById('checkout-form')?.addEventListener('submit', handlePayment);
}

function openCheckout() {
  const cart = getState('cart');
  if (!cart.length) {
    toastInfo('Cart is Empty', 'Add some medicines before checking out.');
    return;
  }
  const user = getState('user');
  if (!user) { window.dispatchEvent(new Event('mf:need-auth')); return; }

  // Update modal totals
  const total = (cartTotal() / 100).toFixed(2);
  document.getElementById('checkout-subtotal').textContent = `₹${total}`;
  document.getElementById('checkout-total').textContent = `₹${total}`;

  // Render cart items summary
  const itemsEl = document.getElementById('checkout-items-list');
  if (itemsEl) {
    itemsEl.innerHTML = cart.map(i => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:.9rem;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${i.medicine.images?.[0] ? `<img src="${i.medicine.images[0]}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;">` : '<span style="font-size:1.4rem;">💊</span>'}
          <div>
            <div style="font-weight:600;">${i.medicine.name}</div>
            <div style="color:var(--text-secondary);font-size:.8rem;">${i.medicine.brand || ''} &times; ${i.quantity}</div>
          </div>
        </div>
        <div style="font-weight:700;">₹${((i.medicine.price * i.quantity)/100).toFixed(2)}</div>
      </div>`).join('');
  }

  // Show modal
  document.getElementById('checkout-modal').classList.remove('hidden');
}

async function handlePayment(e) {
  e.preventDefault();
  
  const addressInput = document.getElementById('checkout-address');
  const paymentInput = document.getElementById('checkout-payment');
  
  if (!addressInput.value.trim()) {
    toastError('Validation', 'Please enter your delivery address');
    return;
  }

  const btn = document.getElementById('btn-confirm-pay');
  const spinner = document.getElementById('pay-spinner');
  const text = document.getElementById('pay-text');
  
  text.classList.add('hidden');
  spinner.classList.remove('hidden');
  btn.disabled = true;
  
  // Simulate payment gateway delay
  await new Promise(r => setTimeout(r, 1500));
  
  await placeOrder({
    address: addressInput.value.trim(),
    paymentMethod: paymentInput.value,
  });

  document.getElementById('checkout-modal').classList.add('hidden');
  text.classList.remove('hidden');
  spinner.classList.add('hidden');
  btn.disabled = false;
}

async function placeOrder(orderData) {
  const cart = getState('cart');
  if (!cart.length) return;

  try {
    const items = cart.map(i => ({ medicineId: i.medicine._id, quantity: i.quantity, unitPrice: i.medicine.price }));
    
    // Simulate coordinates based on address (Ludhiana region roughly)
    const mockCoordinates = {
      type: 'Point',
      coordinates: [75.8573 + (Math.random() * 0.05), 30.9010 + (Math.random() * 0.05)]
    };

    const payload = {
      items,
      deliveryAddress: {
        street: orderData.address,
        city: 'Ludhiana',
        state: 'Punjab',
        zipCode: '141001',
        country: 'India',
        coordinates: mockCoordinates
      },
      paymentMethod: orderData.paymentMethod
    };

    const res = await api.post('/pharmacy/orders', payload);
    const routingMeta = res.data?.routingMeta || { estimatedMinutes: 15, hops: 1 };
    
    cartClear();
    toastSuccess('Order Confirmed', 'Payment successful. Your order is being processed.');
    startLiveTracking(routingMeta);
  } catch (err) {
    toastError('Order failed', err.message);
    document.getElementById('checkout-modal').classList.add('hidden');
    document.getElementById('btn-confirm-pay').disabled = false;
    document.getElementById('pay-spinner').classList.add('hidden');
    document.getElementById('pay-text').classList.remove('hidden');
  }
}

function startLiveTracking(routingMeta) {
  // Hide other sections, show tracking
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  document.getElementById('dash-live-tracking').classList.remove('hidden');
  document.getElementById('dash-live-tracking').scrollIntoView({ behavior: 'smooth', block: 'start' });
  
  const etaMinutes = Math.round(routingMeta.estimatedMinutes || 12);
  
  // Reset UI
  document.getElementById('track-bar').style.width = '10%';
  document.getElementById('track-eta').textContent = etaMinutes;
  document.getElementById('step-dispatch').style.opacity = '0.5';
  document.getElementById('step-arrive').style.opacity = '0.5';
  
  // Start the Leaflet Map animation
  startRealDeliveryTracking('delivery-map-container');
  
  // Animation simulation using dynamic ETA
  setTimeout(() => {
    document.getElementById('track-bar').style.width = '50%';
    document.getElementById('step-dispatch').style.opacity = '1';
    document.getElementById('step-dispatch').classList.add('active');
    document.getElementById('track-eta').textContent = Math.max(1, Math.round(etaMinutes / 2));
    toastInfo('Dispatched', 'Your order is out for delivery!');
  }, 4000);
  
  setTimeout(() => {
    document.getElementById('track-bar').style.width = '100%';
    document.getElementById('step-arrive').style.opacity = '1';
    document.getElementById('step-arrive').classList.add('active');
    document.getElementById('track-eta').textContent = '1';
    toastSuccess('Arriving', 'Driver is at your location!');
  }, 9000);
}
