/**
 * voice-nav.js
 * Implements Web Speech API for AI voice navigation and commands.
 */

class VoiceAssistant {
  constructor() {
    this.btn = document.getElementById('voice-nav-btn');
    this.isListening = false;
    this.recognition = null;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

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

  startListening() {
    try {
      this.recognition.start();
      this.isListening = true;
      this.btn.classList.add('glow-pulse');
      this.btn.style.background = 'rgba(239, 68, 68, 0.2)';
      this.btn.style.color = '#ef4444';
      this.btn.textContent = '🔴 Listening...';
      window.showToast?.('AI Assistant listening... Say "Dashboard", "Triage", or "Pharmacy"', 'info');
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

    if (transcript.includes('dashboard') || transcript.includes('home')) {
      document.querySelector('[data-page="dashboard"]')?.click();
    } else if (transcript.includes('triage') || transcript.includes('symptom')) {
      document.querySelector('[data-page="triage"]')?.click();
    } else if (transcript.includes('pharmacy') || transcript.includes('medicine')) {
      document.querySelector('[data-page="pharmacy"]')?.click();
    } else if (transcript.includes('consultation') || transcript.includes('call doctor')) {
      document.querySelector('[data-page="consultation"]')?.click();
    } else {
      window.showToast?.(`Sorry, I didn't understand the command.`, 'error');
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
  return assistant;
}
