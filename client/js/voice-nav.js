/**
 * voice-nav.js — Accessible AI Voice Navigation & TTS Assistant v2.1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * UPGRADES v2.1.0:
 *   - Multilingual Text-To-Speech (TTS) helper function speakText()
 *   - Voice recognition support for Indian languages (hi-IN, ta-IN, te-IN, en-IN)
 *   - Audio accessibility assistant for low-literacy users
 */

export function speakText(text, lang = 'hi-IN') {
  if (!('speechSynthesis' in window)) {
    console.warn("Speech Synthesis not supported in this browser.");
    return;
  }
  window.speechSynthesis.cancel(); // Stop ongoing speech
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95; // Slightly calmer pace
  utterance.pitch = 1.0;
  
  // Attempt to select language voice
  const voices = window.speechSynthesis.getVoices();
  const selectedVoice = voices.find(v => v.lang.startsWith(lang) || v.lang.startsWith(lang.split('-')[0]));
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  } else {
    utterance.lang = lang;
  }
  
  window.speechSynthesis.speak(utterance);
}

class VoiceAssistant {
  constructor() {
    this.btn = document.getElementById('voice-nav-btn');
    this.isListening = false;
    this.recognition = null;
    this.currentLang = 'hi-IN';

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = this.currentLang;

      this.recognition.onresult = (event) => this.handleCommand(event);
      this.recognition.onerror = (event) => this.handleError(event);
      this.recognition.onend = () => this.stopListening();
    } else {
      if (this.btn) this.btn.style.display = 'none';
      console.warn("Web Speech API not supported in this browser.");
    }
  }

  init() {
    if (!this.btn || !this.recognition) return;
    this.btn.addEventListener('click', () => {
      if (this.isListening) {
        this.stopListening();
      } else {
        this.startListening();
      }
    });
  }

  setLanguage(langCode) {
    this.currentLang = langCode;
    if (this.recognition) {
      this.recognition.lang = langCode;
    }
  }

  startListening() {
    try {
      if (this.recognition) this.recognition.lang = this.currentLang;
      this.recognition.start();
      this.isListening = true;
      this.btn.classList.add('glow-pulse');
      this.btn.style.background = 'rgba(239, 68, 68, 0.2)';
      this.btn.style.color = '#ef4444';
      this.btn.textContent = '🔴 Listening...';
      window.showToast?.('AI Assistant listening... Speak your command or symptoms', 'info');
    } catch (e) {
      console.error(e);
    }
  }

  stopListening() {
    try {
      this.recognition.stop();
    } catch (e) {}
    this.isListening = false;
    this.btn.classList.remove('glow-pulse');
    this.btn.style.background = '';
    this.btn.style.color = '';
    this.btn.textContent = '🎤';
  }

  handleCommand(event) {
    const transcript = event.results[0][0].transcript.toLowerCase();
    window.showToast?.(`You said: "${transcript}"`, 'info');

    if (transcript.includes('dashboard') || transcript.includes('home') || transcript.includes('घर')) {
      document.querySelector('[data-page="dashboard"]')?.click();
      speakText('Opening Dashboard', this.currentLang);
    } else if (transcript.includes('triage') || transcript.includes('symptom') || transcript.includes('बीमारी') || transcript.includes('लक्षण')) {
      document.querySelector('[data-page="triage"]')?.click();
      speakText('Opening Symptom Checker', this.currentLang);
    } else if (transcript.includes('pharmacy') || transcript.includes('medicine') || transcript.includes('दवा')) {
      document.querySelector('[data-page="pharmacy"]')?.click();
      speakText('Opening Pharmacy', this.currentLang);
    } else if (transcript.includes('consultation') || transcript.includes('doctor') || transcript.includes('डॉक्टर')) {
      document.querySelector('[data-page="consultation"]')?.click();
      speakText('Opening Doctor Consultation', this.currentLang);
    } else {
      window.showToast?.(`Understood: "${transcript}"`, 'info');
    }
  }

  handleError(event) {
    console.error("Speech recognition error:", event.error);
    window.showToast?.(`Voice recognition error: ${event.error}`, 'error');
    this.stopListening();
  }
}

export function initVoiceNav() {
  const assistant = new VoiceAssistant();
  assistant.init();
  if (window) window.voiceAssistant = assistant;
  return assistant;
}

