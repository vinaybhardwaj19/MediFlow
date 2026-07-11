/**
 * medibot.js — MediFlow AI Chat Assistant Widget
 */
import { navigate } from './router.js';

const TRIGGERS = {
  emergency: ['emergency','chest pain','can\'t breathe','heart attack','stroke','suicide'],
  symptoms: ['headache','fever','cough','pain','nausea','dizzy','tired','breathing','rash','ache','hurt','sore'],
  appointment: ['appointment','book','schedule','doctor','consult','visit'],
  pharmacy: ['medicine','drug','pharmacy','prescription','pill','tablet','order'],
  triage: ['triage','symptom check','check symptoms','diagnosis','what\'s wrong'],
  about: ['how does','features','about','what is mediflow','tell me'],
  thanks: ['thanks','thank you','thx','appreciate'],
  greet: ['hi','hello','hey','good morning','good evening'],
};

const REPLIES = {
  emergency: "🚨 **This sounds like an emergency!**\n\nPlease call **112** immediately.\n\n• Chest pain → Call ambulance NOW\n• Difficulty breathing → Sit upright, call 112\n• Heavy bleeding → Apply pressure, call 112",
  symptoms: "I notice you're describing symptoms. 🩺 Our **AI Symptom Checker** uses ML to recommend the right specialist.\n\nWould you like me to open it?",
  appointment: "I can help you book a consultation! 📅\n\n• **Video Consultation** — Real-time with a specialist\n• **Chat Consultation** — Async messaging\n\nWant to start a video consultation?",
  pharmacy: "Our E-Pharmacy has a wide catalog! 💊\n\nSearch medicines, compare prices, and get optimal delivery routing.\n\nShall I take you to the pharmacy?",
  triage: "Our AI uses **Random Forest + Gradient Boosting** on clinical data. 🧠\n\nIt identifies the right specialist, urgency level, and confidence scores.\n\nWant me to open the Symptom Checker?",
  about: "MediFlow is an **AI-powered telemedicine platform** 🏥\n\n🧠 AI Triage — ML-based symptom analysis\n📹 Video Consult — Real-time WebRTC consultations\n💊 E-Pharmacy — Medicine ordering & delivery\n📊 Vital Monitoring — IoT health tracking\n📋 Digital Prescriptions — Doctor prescription pad\n🔐 Secure Auth — JWT-based authentication",
  thanks: "You're welcome! 😊 Anything else you'd like to know?",
  greet: "Hello! 👋 I'm MediBot, your AI health assistant. How can I help you today?",
  fallback: "I can help with:\n\n• 🩺 Symptom checking\n• 📅 Booking appointments\n• 💊 Pharmacy orders\n• ❓ Platform features\n\nWhat would you like to know?",
};

class MediBot {
  constructor() {
    this.messages = [];
    this.isOpen = false;
    this._bound = false;
  }

  init() {
    if (this._bound) return;
    this._bound = true;

    document.getElementById('medibot-toggle')?.addEventListener('click', () => this.toggle());
    document.getElementById('medibot-close')?.addEventListener('click', () => this.close());
    document.getElementById('medibot-send')?.addEventListener('click', () => this.handleSend());
    document.getElementById('medibot-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.handleSend(); }
    });

    document.querySelectorAll('.medibot-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if (['triage','consultation','pharmacy'].includes(a)) {
          this.addBotMessage(`Taking you to ${a}... 🚀`);
          setTimeout(() => navigate(a), 800);
        } else if (a === 'about') {
          this.addBotMessage(REPLIES.about);
        }
      });
    });

    setTimeout(() => {
      if (!this.messages.length) this.addBotMessage(REPLIES.greet);
    }, 500);
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  open() {
    this.isOpen = true;
    document.getElementById('medibot-panel')?.classList.add('open');
    document.getElementById('medibot-toggle')?.classList.add('active');
    setTimeout(() => document.getElementById('medibot-input')?.focus(), 300);
  }

  close() {
    this.isOpen = false;
    document.getElementById('medibot-panel')?.classList.remove('open');
    document.getElementById('medibot-toggle')?.classList.remove('active');
  }

  handleSend() {
    const input = document.getElementById('medibot-input');
    const text = input?.value.trim();
    if (!text) return;
    input.value = '';
    this.addUserMessage(text);
    this.processInput(text);
  }

  processInput(text) {
    const lower = text.toLowerCase();
    this.showTyping();

    let response = REPLIES.fallback;
    let delay = 800 + Math.random() * 600;

    if (TRIGGERS.emergency.some(t => lower.includes(t))) {
      response = REPLIES.emergency; delay = 400;
    } else if (lower.includes('yes') && this.messages.length > 2) {
      const last = [...this.messages].reverse().find(m => m.role === 'bot');
      if (last?.text.includes('Symptom Checker')) {
        response = "Opening AI Symptom Checker! 🧠";
        setTimeout(() => navigate('triage'), 1200);
      } else if (last?.text.includes('consultation')) {
        response = "Opening consultation room! 📹";
        setTimeout(() => navigate('consultation'), 1200);
      } else if (last?.text.includes('pharmacy')) {
        response = "Opening pharmacy! 💊";
        setTimeout(() => navigate('pharmacy'), 1200);
      } else { response = "Great! What would you like to do next?"; }
    } else if (TRIGGERS.symptoms.some(t => lower.includes(t))) { response = REPLIES.symptoms; }
    else if (TRIGGERS.appointment.some(t => lower.includes(t))) { response = REPLIES.appointment; }
    else if (TRIGGERS.pharmacy.some(t => lower.includes(t))) { response = REPLIES.pharmacy; }
    else if (TRIGGERS.about.some(t => lower.includes(t))) { response = REPLIES.about; }
    else if (TRIGGERS.triage.some(t => lower.includes(t))) { response = REPLIES.triage; }
    else if (TRIGGERS.thanks.some(t => lower.includes(t))) { response = REPLIES.thanks; }
    else if (TRIGGERS.greet.some(t => lower.includes(t))) { response = REPLIES.greet; }

    setTimeout(() => { this.hideTyping(); this.addBotMessage(response); }, delay);
  }

  addUserMessage(text) {
    this.messages.push({ role: 'user', text });
    this._render('user', text);
  }

  addBotMessage(text) {
    this.messages.push({ role: 'bot', text });
    this._render('bot', text);
  }

  _render(role, text) {
    const c = document.getElementById('medibot-messages');
    if (!c) return;
    const el = document.createElement('div');
    el.className = `medibot-msg ${role}`;
    const fmt = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    const time = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    el.innerHTML = `<div class="medibot-msg-bubble">${fmt}</div><div class="medibot-msg-time">${time}</div>`;
    c.appendChild(el);
    c.scrollTop = c.scrollHeight;
  }

  showTyping() { document.getElementById('medibot-typing')?.classList.remove('hidden'); }
  hideTyping() { document.getElementById('medibot-typing')?.classList.add('hidden'); }
}

const medibot = new MediBot();
export function initMediBot() { medibot.init(); }
export { medibot };
