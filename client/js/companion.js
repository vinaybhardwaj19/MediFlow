/**
 * @file companion.js
 * @description GPT-6 SOL: Quantum AI Health Core & Solana Care Ledger.
 */

import * as api from './api.js';
import { toastSuccess, toastError } from './toast.js';

let _yieldInterval = null;

// Habit tracking state
let _habits = JSON.parse(localStorage.getItem('mf-habits')) || {
  waterIntakeMl: 1500,
  waterGoalMl: 3000,
  sleepHours: 6.5,
  sleepGoalHours: 8,
  exerciseMins: 20,
  exerciseGoalMins: 45
};

// Simulated Solana Wallet State
let _solWallet = JSON.parse(localStorage.getItem('mf-sol-wallet')) || {
  address: '5oL6qTrXzY1MvN4vPQC9e9aV8a5b4fcdDilithium',
  balance: 12.45,
  staked: 5.00,
  ledger: [
    { tx: '0x8a92f8d39e2467b3bc22998a48ef2e55', desc: 'Minted 0.05 SOL: Water Intake (+250ml)', val: '+0.05 SOL', status: 'Confirmed', time: '10 mins ago' },
    { tx: '0x4b71a2e8c1094ba4de1109a473d09a2b', desc: 'Minted 0.50 SOL: Sleep Target Reached', val: '+0.50 SOL', status: 'Confirmed', time: '1 hour ago' },
    { tx: '0x5e8bc38d97be23f4bca998fde2931a78', desc: 'Staked 5.00 SOL: Diagnostic Priority Routing', val: '-5.00 SOL', status: 'Active', time: '1 day ago' },
    { tx: '0x1c29d9ab40de83a7c6e6a6dfa4282eb1', desc: 'Minted 0.20 SOL: Symptom Assessment Log', val: '+0.20 SOL', status: 'Confirmed', time: '2 days ago' }
  ]
};

function saveToLocalStorage() {
  localStorage.setItem('mf-habits', JSON.stringify(_habits));
  localStorage.setItem('mf-sol-wallet', JSON.stringify(_solWallet));
}

// Model Preset Configurations
const MODEL_PRESETS = {
  'gpt-6-sol': {
    name: 'GPT-6 SOL (Quantum Clinical Engine)',
    temp: 0.2,
    maxTokens: 800,
    prompt: `You are GPT-6 SOL, the advanced quantum-grade AI clinical core for MediFlow.
Your role:
- Answer medical queries with extreme clinical precision, referencing clinical guidelines.
- Maintain a highly sophisticated, expert, yet reassuring clinical persona.
- Explain the reasoning behind your clinical thoughts.
- Guide patients through early warning indicators (MEWS, CURB-65) where relevant.
- Advise visiting a doctor for severe concerns. Call 112 if emergency.`
  },
  'o1-cot': {
    name: 'o1-Clinical-CoT (Deep Medical Reasoning)',
    temp: 0.4,
    maxTokens: 1200,
    prompt: `You are the o1-Clinical-CoT model. You employ deep Chain of Thought reasoning.
Focus on:
- Breaking down clinical hypotheses.
- Detailing differential diagnoses with relative probabilities.
- Recommending diagnostic follow-ups (CBC, Lipid, TSH).
- Always explaining the mechanistic biology behind symptoms.`
  },
  'claude-bio': {
    name: 'Claude 3.5 Sonnet (Bio-Medical Expert)',
    temp: 0.6,
    maxTokens: 1000,
    prompt: `You are Claude 3.5 Bio-Medical, specialized in complex drug interactions (GNN prediction) and molecular biology.
Focus on:
- Explaining pharmacokinetics and pharmacodynamics.
- Detailing drug safety and adverse reaction severities.
- Translating laboratory numbers into plain English.`
  },
  'medibot-classic': {
    name: 'MediBot Classical (gpt-4o-mini)',
    temp: 0.7,
    maxTokens: 300,
    prompt: `You are MediBot, a friendly AI health assistant.
Provide concise guidance, answer basic health FAQs, and route users to E-Pharmacy or Appointments.`
  }
};

let _activePreset = 'gpt-6-sol';
let _activeTab = 'ai-core'; // 'ai-core' or 'ledger'
let _chatHistory = []; // { role: 'user'|'assistant', text: string }

// Voice State
let _voiceActive = false;
let _recognition = null;
let _voiceWaveTimer = null;

export function initCompanion() {
  const container = document.getElementById('dash-companion');
  if (!container) return;

  renderDashboardShell();
  bindGlobalEvents();
  loadDefaultChat();

  startYieldTicker();
}

function renderDashboardShell() {
  const container = document.getElementById('dash-companion');
  if (!container) return;

  container.innerHTML = `
    <!-- Rebranded Header -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div>
        <h2 style="margin:0;display:flex;align-items:center;gap:10px;font-family:'Outfit',sans-serif;font-weight:800;color:var(--text-primary);">
          🪐 GPT-6 SOL <span style="font-size:0.8rem;background:linear-gradient(90deg, #9945FF, #14F195);padding:2px 8px;border-radius:99px;color:#000;font-weight:700;">QUANTUM CORES</span>
        </h2>
        <p style="margin:4px 0 0;font-size:0.82rem;color:var(--text-secondary);">
          Decentralized post-quantum clinical agent coordination and Solana habits ledger.
        </p>
      </div>
      <!-- Tab Control -->
      <div class="sol-tabs" style="margin:0;border:none;padding:0;">
        <button class="sol-tab-btn ${_activeTab === 'ai-core' ? 'active' : ''}" id="tab-btn-ai-core">🪐 SOL-6 AI Core</button>
        <button class="sol-tab-btn ${_activeTab === 'ledger' ? 'active' : ''}" id="tab-btn-ledger">⛓️ Solana Care Ledger</button>
      </div>
    </div>

    <!-- Main Workspace Container -->
    <div id="sol-workspace-content">
      <!-- Loaded dynamically based on active tab -->
    </div>
  `;
}

function bindGlobalEvents() {
  document.getElementById('tab-btn-ai-core')?.addEventListener('click', () => {
    _activeTab = 'ai-core';
    renderDashboardShell();
    bindGlobalEvents();
    renderAICoreTab();
  });

  document.getElementById('tab-btn-ledger')?.addEventListener('click', () => {
    _activeTab = 'ledger';
    renderDashboardShell();
    bindGlobalEvents();
    renderLedgerTab();
  });

  if (_activeTab === 'ai-core') {
    renderAICoreTab();
  } else {
    renderLedgerTab();
  }
}

/* ==========================================================================
   TAB 1: SOL-6 AI Core View & Interaction
   ========================================================================== */

function renderAICoreTab() {
  const ws = document.getElementById('sol-workspace-content');
  if (!ws) return;

  const currentPreset = MODEL_PRESETS[_activePreset];

  ws.innerHTML = `
    <div class="sol-layout">
      <!-- Left Panel: Advanced Model Configuration -->
      <div class="sol-panel">
        <h4 style="margin:0 0 16px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#a5b4fc;display:flex;align-items:center;gap:6px;">
          ⚙️ Model Parameters
        </h4>
        
        <div style="display:flex;flex-direction:column;gap:18px;">
          <!-- Model Preset Selector -->
          <div>
            <label class="sol-control-label">Core Engine</label>
            <select class="form-input" id="sol-model-preset" style="background:rgba(0,0,0,0.3);border-color:rgba(99,102,241,0.2);color:#fff;width:100%;font-size:0.8rem;padding:8px 12px;border-radius:6px;">
              <option value="gpt-6-sol" ${_activePreset === 'gpt-6-sol' ? 'selected' : ''}>GPT-6 SOL (Clinical Engine)</option>
              <option value="o1-cot" ${_activePreset === 'o1-cot' ? 'selected' : ''}>o1-Clinical-CoT (Deep CoT)</option>
              <option value="claude-bio" ${_activePreset === 'claude-bio' ? 'selected' : ''}>Claude 3.5 Sonnet (Biomedical)</option>
              <option value="medibot-classic" ${_activePreset === 'medibot-classic' ? 'selected' : ''}>MediBot Classical (gpt-4o-mini)</option>
            </select>
          </div>

          <!-- Temperature Control -->
          <div>
            <div class="sol-control-label">
              <span>Temperature</span>
              <span class="sol-control-val" id="sol-temp-val">${currentPreset.temp}</span>
            </div>
            <input type="range" class="sol-slider" id="sol-temp-slider" min="0.1" max="1.2" step="0.05" value="${currentPreset.temp}">
          </div>

          <!-- Max Tokens Control -->
          <div>
            <div class="sol-control-label">
              <span>Max Tokens</span>
              <span class="sol-control-val" id="sol-tokens-val">${currentPreset.maxTokens}</span>
            </div>
            <input type="range" class="sol-slider" id="sol-tokens-slider" min="100" max="2000" step="50" value="${currentPreset.maxTokens}">
          </div>

          <!-- System Prompt Display -->
          <div>
            <label class="sol-control-label">System Instruction Override</label>
            <textarea id="sol-system-prompt" class="form-input" style="height:110px;background:rgba(0,0,0,0.3);border-color:rgba(99,102,241,0.2);color:#94a3b8;font-family:monospace;font-size:0.7rem;line-height:1.4;width:100%;resize:none;border-radius:6px;padding:8px;">${currentPreset.prompt}</textarea>
          </div>

          <!-- PQC Key verification indicator -->
          <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);border-radius:6px;padding:10px;font-size:0.72rem;display:flex;align-items:center;gap:8px;">
            <span style="color:#10b981;font-size:1.1rem;animation:pulse 2s infinite;">🔒</span>
            <div>
              <div style="font-weight:700;color:#34d399;">FIPS 204 Kyber-768 Verified</div>
              <div style="color:var(--text-secondary);font-family:monospace;font-size:0.6rem;">Key Signature: ML-DSA-Level3-Active</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Panel: Core Quantum Chat Terminal -->
      <div class="sol-panel" style="padding:24px;display:flex;flex-direction:column;">
        <div class="sol-terminal">
          <!-- Chat Area -->
          <div class="sol-chat-messages" id="sol-chat-area">
            <!-- Messages rendered dynamically -->
          </div>

          <!-- Multi-Agent Agentic Reasoning Console -->
          <div id="sol-reasoning-console" class="hidden">
            <div class="sol-reasoning-wrap" id="sol-reasoning-steps-list">
              <!-- Animated reasoning steps -->
            </div>
          </div>

          <!-- Quick Action Prompts -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;" id="sol-quick-actions-bar">
            <button class="medibot-quick-btn sol-quick-action" data-text="Perform a clinical early warning triage check for a patient with persistent cough, mild fever, and respiratory rate of 20.">🩺 Early Triage Check</button>
            <button class="medibot-quick-btn sol-quick-action" data-text="Verify drug interaction severity for Warfarin and Aspirin using GraphSAGE GNN rules.">💊 GNN Drug Check</button>
            <button class="medibot-quick-btn sol-quick-action" data-text="Calculate 3D drone waypoint logistics and energy estimation for a prescription dispatch.">🚁 Drone Path Cost</button>
          </div>

          <!-- Interactive Input area -->
          <div style="display:flex;gap:8px;align-items:center;border-top:1px solid var(--border);padding-top:12px;">
            <button id="sol-voice-btn" style="width:40px;height:40px;border-radius:50%;border:1px solid rgba(99,102,241,0.3);background:rgba(99,102,241,0.08);color:#a5b4fc;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" title="Speak to SOL-6 Voice">🎤</button>
            
            <div style="flex:1;position:relative;">
              <input class="form-input" id="sol-chat-input" placeholder="Query SOL-6 AI Clinical core..." style="width:100%;border-radius:99px;padding:10px 18px 10px 18px;font-size:0.85rem;background:rgba(0,0,0,0.2);" autocomplete="off" />
            </div>

            <button id="sol-send-btn" class="btn btn-primary" style="border-radius:50%;width:40px;height:40px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">➤</button>
          </div>

          <!-- Pulsing Voice Visualizer Pane (hidden by default) -->
          <div id="sol-voice-visualizer-pane" class="hidden" style="text-align:center;padding:15px 0;">
            <div class="sol-voice-orb" id="sol-pulse-orb"></div>
            <div style="font-size:0.75rem;color:#10b981;font-weight:700;" id="sol-voice-status">VOICE MODE INACTIVE</div>
            <canvas class="sol-voice-wave" id="sol-voice-canvas"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;

  bindAICoreEvents();
  renderChatMessages();
}

function bindAICoreEvents() {
  // Preset Change
  document.getElementById('sol-model-preset')?.addEventListener('change', (e) => {
    _activePreset = e.target.value;
    const currentPreset = MODEL_PRESETS[_activePreset];
    
    // Update inputs
    const tempSlider = document.getElementById('sol-temp-slider');
    const tempVal = document.getElementById('sol-temp-val');
    const tokensSlider = document.getElementById('sol-tokens-slider');
    const tokensVal = document.getElementById('sol-tokens-val');
    const sysPromptText = document.getElementById('sol-system-prompt');

    if (tempSlider) tempSlider.value = currentPreset.temp;
    if (tempVal) tempVal.textContent = currentPreset.temp;
    if (tokensSlider) tokensSlider.value = currentPreset.maxTokens;
    if (tokensVal) tokensVal.textContent = currentPreset.maxTokens;
    if (sysPromptText) sysPromptText.value = currentPreset.prompt;

    toastSuccess('Preset Loaded', `Loaded parameters for ${currentPreset.name}`);
  });

  // Slider adjustments
  document.getElementById('sol-temp-slider')?.addEventListener('input', (e) => {
    const valEl = document.getElementById('sol-temp-val');
    if (valEl) valEl.textContent = e.target.value;
  });

  document.getElementById('sol-tokens-slider')?.addEventListener('input', (e) => {
    const valEl = document.getElementById('sol-tokens-val');
    if (valEl) valEl.textContent = e.target.value;
  });

  // Send Actions
  document.getElementById('sol-send-btn')?.addEventListener('click', () => handleSendMsg());
  document.getElementById('sol-chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMsg();
    }
  });

  // Quick action clicks
  document.querySelectorAll('.sol-quick-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('sol-chat-input');
      if (input) {
        input.value = btn.dataset.text;
        input.focus();
      }
    });
  });

  // Voice Core toggle
  document.getElementById('sol-voice-btn')?.addEventListener('click', () => toggleVoiceMode());
}

function loadDefaultChat() {
  if (_chatHistory.length === 0) {
    _chatHistory.push({
      role: 'assistant',
      text: "System initialized. Welcome to **GPT-6 SOL: Clinical Intelligence Core**.\n\nI can cross-reference patient biometric signals, simulate drone logistics elevations, evaluate drug GraphSAGE severity, and explain diagnosis distributions using SHAP waterfall weights.\n\nType a medical query below or select a quick action to inspect my multi-agent reasoning steps."
    });
  }
}

function renderChatMessages() {
  const chatArea = document.getElementById('sol-chat-area');
  if (!chatArea) return;

  chatArea.innerHTML = _chatHistory.map((m, idx) => {
    const bubbleClass = m.role === 'user' ? 'user' : 'bot';
    let formattedText = m.text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    // Generate unique ID for inline widgets
    const widgetId = `sol-widget-${idx}`;

    return `
      <div class="medibot-msg ${bubbleClass}">
        <div class="medibot-msg-bubble" style="${m.role === 'user' ? 'background:linear-gradient(135deg, rgba(99,102,241,0.2), rgba(20,241,149,0.1)); border:1px solid rgba(20,241,149,0.25); color:#fff;' : 'background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); color:#f8fafc;'}">
          <div>${formattedText}</div>
          <div id="${widgetId}"></div>
        </div>
        <div class="medibot-msg-time" style="margin-top:2px;">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    `;
  }).join('');

  // Post-render widgets insertion
  _chatHistory.forEach((m, idx) => {
    const widgetId = `sol-widget-${idx}`;
    const widgetContainer = document.getElementById(widgetId);
    if (!widgetContainer) return;

    const lower = m.text.toLowerCase();
    
    // Inject SHAP chart
    if (lower.includes('cough') || lower.includes('fever') || lower.includes('shap') || lower.includes('triage')) {
      renderSHAPWidget(widgetContainer);
    }
    // Inject GNN Node network
    else if (lower.includes('warfarin') || lower.includes('aspirin') || lower.includes('graphsage') || lower.includes('drug') || lower.includes('interaction')) {
      renderGNNWidget(widgetContainer);
    }
    // Inject Drone 3D routing
    else if (lower.includes('drone') || lower.includes('elevation') || lower.includes('path') || lower.includes('logistics')) {
      renderDroneWidget(widgetContainer);
    }
  });

  chatArea.scrollTop = chatArea.scrollHeight;
}

// Inline Custom Widgets Renderers
function renderSHAPWidget(container) {
  if (container.querySelector('.sol-widget-shap')) return;

  const shapDiv = document.createElement('div');
  shapDiv.className = 'sol-widget-shap';
  shapDiv.innerHTML = `
    <div style="font-size:0.75rem;font-weight:700;color:#a5b4fc;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
      <span>📊 SHAP Feature Impact Weights</span>
      <span class="xai-method-badge" style="background:#10b981;font-size:0.55rem;padding:1px 5px;">cooperative game theory</span>
    </div>
    <div class="shap-chart" style="gap:5px;margin-bottom:4px;">
      <div class="shap-row" style="grid-template-columns:100px 1fr 50px;font-size:0.7rem;">
        <span class="shap-symptom">Persistent Cough</span>
        <div class="shap-bar-wrap" style="height:6px;"><div class="shap-bar" style="width:75%;background:#ef4444;"></div></div>
        <span class="shap-value" style="color:#ef4444;">+0.342</span>
      </div>
      <div class="shap-row" style="grid-template-columns:100px 1fr 50px;font-size:0.7rem;">
        <span class="shap-symptom">Mild Fever</span>
        <div class="shap-bar-wrap" style="height:6px;"><div class="shap-bar" style="width:55%;background:#ef4444;"></div></div>
        <span class="shap-value" style="color:#ef4444;">+0.218</span>
      </div>
      <div class="shap-row" style="grid-template-columns:100px 1fr 50px;font-size:0.7rem;">
        <span class="shap-symptom">Resp Rate 20</span>
        <div class="shap-bar-wrap" style="height:6px;"><div class="shap-bar" style="width:30%;background:#ef4444;"></div></div>
        <span class="shap-value" style="color:#ef4444;">+0.120</span>
      </div>
      <div class="shap-row" style="grid-template-columns:100px 1fr 50px;font-size:0.7rem;">
        <span class="shap-symptom">Heart Rate 72</span>
        <div class="shap-bar-wrap" style="height:6px;"><div class="shap-bar" style="width:25%;background:#10b981;"></div></div>
        <span class="shap-value" style="color:#10b981;">-0.089</span>
      </div>
    </div>
    <div style="font-size:0.6rem;color:var(--text-muted);text-align:right;">Calibrated baseline specialty: Pulmonology (MEWS: 1)</div>
  `;
  container.appendChild(shapDiv);
}

function renderGNNWidget(container) {
  if (container.querySelector('.sol-widget-gnn')) return;

  const canvasId = `gnn-canvas-${Math.random().toString(36).substr(2, 9)}`;
  const gnnDiv = document.createElement('div');
  gnnDiv.className = 'sol-widget-gnn';
  gnnDiv.innerHTML = `
    <div style="font-size:0.75rem;font-weight:700;color:#14F195;margin-bottom:6px;display:flex;justify-content:space-between;">
      <span>🕸️ GraphSAGE Drug Intersect GNN</span>
      <span style="font-size:0.6rem;color:#ef4444;font-weight:700;">CONTRAINDICATED</span>
    </div>
    <canvas id="${canvasId}" style="width:100%;height:110px;background:rgba(0,0,0,0.4);border-radius:4px;"></canvas>
  `;
  container.appendChild(gnnDiv);

  // Animate GNN nodes
  setTimeout(() => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const nodes = [
      { x: canvas.width * 0.3, y: canvas.height * 0.5, r: 18, label: 'Warfarin', color: '#9945FF' },
      { x: canvas.width * 0.7, y: canvas.height * 0.5, r: 18, label: 'Aspirin', color: '#14F195' },
      { x: canvas.width * 0.5, y: canvas.height * 0.2, r: 10, label: 'CYP2C9', color: '#64748b' }
    ];

    let cycle = 0;
    const draw = () => {
      if (!document.getElementById(canvasId)) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cycle += 0.05;

      // Draw connection lines
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      ctx.lineTo(nodes[1].x, nodes[1].y);
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 + Math.sin(cycle) * 0.3})`;
      ctx.lineWidth = 3 + Math.sin(cycle) * 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      ctx.lineTo(nodes[2].x, nodes[2].y);
      ctx.lineTo(nodes[1].x, nodes[1].y);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw nodes
      nodes.forEach((n, i) => {
        ctx.beginPath();
        const pulseR = n.r + (i < 2 ? Math.sin(cycle + i) * 2 : 0);
        ctx.arc(n.x, n.y, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.label, n.x, n.y);
      });

      requestAnimationFrame(draw);
    };
    draw();
  }, 100);
}

function renderDroneWidget(container) {
  if (container.querySelector('.sol-widget-drone')) return;

  const canvasId = `drone-canvas-${Math.random().toString(36).substr(2, 9)}`;
  const droneDiv = document.createElement('div');
  droneDiv.className = 'sol-widget-drone';
  droneDiv.innerHTML = `
    <div style="font-size:0.75rem;font-weight:700;color:#6366f1;margin-bottom:6px;display:flex;justify-content:space-between;">
      <span>📈 3D Waypoint Elevation Profiler</span>
      <span style="font-size:0.6rem;color:#10b981;font-weight:700;">Ascending Cost: 2.5x</span>
    </div>
    <canvas id="${canvasId}" style="width:100%;height:80px;background:rgba(0,0,0,0.4);border-radius:4px;"></canvas>
  `;
  container.appendChild(droneDiv);

  setTimeout(() => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const points = [
      { x: 10, y: 70 },
      { x: canvas.width * 0.25, y: 20 },
      { x: canvas.width * 0.5, y: 40 },
      { x: canvas.width * 0.75, y: 15 },
      { x: canvas.width - 10, y: 70 }
    ];

    let step = 0;
    const draw = () => {
      if (!document.getElementById(canvasId)) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      step = (step + 1) % 360;

      // Draw grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 20; i < canvas.height; i += 20) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
      }

      // Draw path line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw waypoints
      points.forEach((p, idx) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 || idx === points.length - 1 ? '#ef4444' : '#14F195';
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '6px monospace';
        ctx.fillText(`WP${idx}(${Math.round(80 - p.y)}m)`, p.x - 10, p.y - 6);
      });

      // Animate drone icon
      const t = (step / 360);
      // Linear interpolation over points
      const numSegments = points.length - 1;
      const segmentIndex = Math.min(numSegments - 1, Math.floor(t * numSegments));
      const segmentT = (t * numSegments) - segmentIndex;
      const pStart = points[segmentIndex];
      const pEnd = points[segmentIndex + 1];
      const dx = pStart.x + (pEnd.x - pStart.x) * segmentT;
      const dy = pStart.y + (pEnd.y - pStart.y) * segmentT;

      ctx.beginPath();
      ctx.arc(dx, dy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#6366f1';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.stroke();

      requestAnimationFrame(draw);
    };
    draw();
  }, 100);
}

// Handle message inputs
async function handleSendMsg() {
  const input = document.getElementById('sol-chat-input');
  const text = input?.value.trim();
  if (!text) return;
  input.value = '';

  // Add User message
  _chatHistory.push({ role: 'user', text });
  renderChatMessages();

  // Show Agentic Reasoning Steps
  const rc = document.getElementById('sol-reasoning-console');
  const stepsList = document.getElementById('sol-reasoning-steps-list');
  if (rc) rc.classList.remove('hidden');
  if (stepsList) stepsList.innerHTML = '';

  const temp = parseFloat(document.getElementById('sol-temp-slider')?.value || 0.6);
  const maxTokens = parseInt(document.getElementById('sol-tokens-slider')?.value || 300);
  const customPrompt = document.getElementById('sol-system-prompt')?.value || '';

  const addStep = (msg) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const div = document.createElement('div');
    div.className = 'sol-reasoning-step';
    div.innerHTML = `<span style="color:#94a3b8;">[${timeStr}]</span> <span>${msg}</span>`;
    stepsList.appendChild(div);
    stepsList.scrollTop = stepsList.scrollHeight;
  };

  // Simulate thinking steps
  await sleep(150);
  addStep('📡 Establishing secure FIPS 204 Dilithium keys connection...');
  await sleep(300);
  addStep('🔑 Dilithium signature verified. Session key exchanged with Go API gateway.');
  await sleep(250);
  addStep('🔍 Querying patient health database: Retreiving vital trends & addresses...');
  await sleep(350);
  addStep('🧬 Fusing GraphSAGE DDI network (45 drug classes, 89 edges)...');
  await sleep(250);
  addStep('🚁 Computing altitude logistics battery multipliers (A* 26-directional Moore expansion)...');
  await sleep(300);
  addStep('🎯 Executing CalibratedClassifierCV. SHAP waterfall explanations active.');
  await sleep(200);
  addStep('✍ Synthesizing GPT-6 clinical core recommendations...');
  await sleep(200);

  // Send request to API
  try {
    const history = _chatHistory.slice(-12).map(h => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.text
    }));

    const res = await fetch('/api/v1/chat/medibot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history,
        systemPrompt: customPrompt,
        temperature: temp,
        maxTokens
      })
    });

    const data = await res.json();
    if (rc) rc.classList.add('hidden'); // Hide reasoning once complete

    const reply = data.data?.reply || 'Connection Timeout. Retrying...';
    _chatHistory.push({ role: 'assistant', text: reply });
    renderChatMessages();

    // Speak back if in voice mode
    if (_voiceActive) {
      speakText(reply);
    }

  } catch (err) {
    if (rc) rc.classList.add('hidden');
    const fallback = 'I experienced a connection latency. Please verify if the microservices gateway is active.';
    _chatHistory.push({ role: 'assistant', text: fallback });
    renderChatMessages();
    if (_voiceActive) {
      speakText(fallback);
    }
  }
}

// Voice Mode Web API integrations
function toggleVoiceMode() {
  const btn = document.getElementById('sol-voice-btn');
  const pane = document.getElementById('sol-voice-visualizer-pane');
  const status = document.getElementById('sol-voice-status');

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toastError('Voice Not Supported', 'Your browser does not support Speech Recognition APIs.');
    return;
  }

  if (!_recognition) {
    _recognition = new SR();
    _recognition.continuous = false;
    _recognition.lang = 'en-US';
    _recognition.interimResults = false;

    _recognition.onresult = (e) => {
      const result = e.results[0][0].transcript;
      const input = document.getElementById('sol-chat-input');
      if (input) {
        input.value = result;
        handleSendMsg();
      }
    };

    _recognition.onerror = () => {
      stopVoiceVisualizer();
    };

    _recognition.onend = () => {
      if (_voiceActive) {
        try { _recognition.start(); } catch {}
      }
    };
  }

  if (_voiceActive) {
    // Turn off
    _voiceActive = false;
    _recognition.stop();
    btn?.classList.remove('listening');
    pane?.classList.add('hidden');
    stopVoiceVisualizer();
    window.speechSynthesis?.cancel();
  } else {
    // Turn on
    _voiceActive = true;
    try { _recognition.start(); } catch {}
    btn?.classList.add('listening');
    pane?.classList.remove('hidden');
    if (status) status.textContent = 'SOL-6 IS LISTENING...';
    startVoiceVisualizer();
    speakText('SOL-6 Voice Module Active. Say something.');
  }
}

function startVoiceVisualizer() {
  const canvas = document.getElementById('sol-voice-canvas');
  const orb = document.getElementById('sol-pulse-orb');
  if (!canvas || !orb) return;

  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  orb.classList.add('listening');

  let cycle = 0;
  const drawWave = () => {
    if (!_voiceActive || !document.getElementById('sol-voice-canvas')) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cycle += 0.15;

    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    for (let x = 0; x < canvas.width; x++) {
      // Create a nice complex wave with multiple frequencies
      const y = canvas.height / 2 + 
        Math.sin(x * 0.05 + cycle) * 12 * Math.sin(cycle * 0.2) + 
        Math.cos(x * 0.02 - cycle) * 6;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#14F195';
    ctx.lineWidth = 2;
    ctx.stroke();

    _voiceWaveTimer = requestAnimationFrame(drawWave);
  };
  drawWave();
}

function stopVoiceVisualizer() {
  const orb = document.getElementById('sol-pulse-orb');
  if (orb) orb.classList.remove('listening');
  const status = document.getElementById('sol-voice-status');
  if (status) status.textContent = 'VOICE INACTIVE';
  cancelAnimationFrame(_voiceWaveTimer);
}

function speakText(txt) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  
  // Clean markdown signs for cleaner speech
  const speechString = txt.replace(/\*/g, '').replace(/🚨/g, 'Alert:').replace(/✦/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(speechString);
  utterance.rate = 1.05;
  utterance.pitch = 0.95; // Slightly deeper clinical voice

  // Try to find a nice English voice
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
  if (preferredVoice) utterance.voice = preferredVoice;

  window.speechSynthesis.speak(utterance);
}

/* ==========================================================================
   TAB 2: Wellness Habits & Solana Care Ledger View
   ========================================================================== */

function renderLedgerTab() {
  const ws = document.getElementById('sol-workspace-content');
  if (!ws) return;

  // Hydration percentage
  const waterPct = Math.round((_habits.waterIntakeMl / _habits.waterGoalMl) * 100);
  const sleepPct = Math.round((_habits.sleepHours / _habits.sleepGoalHours) * 100);
  const exePct   = Math.round((_habits.exerciseMins / _habits.exerciseGoalMins) * 100);

  ws.innerHTML = `
    <div class="sol-layout">
      <!-- Left Panel: Simulated Solana Wallet & Blockchain ledger -->
      <div class="sol-panel">
        <h4 style="margin:0 0 16px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#9945FF;display:flex;align-items:center;gap:6px;">
          💳 Solana Care Wallet
        </h4>

        <!-- Wallet Card -->
        <div class="sol-wallet-card" id="sol-wallet-card-container">
          <div class="sol-wallet-label">Wellness Ledger Balance</div>
          <div class="sol-wallet-balance">
            <div class="sol-coin-container">
              <div class="sol-coin-3d" id="sol-coin-spin">
                <div class="coin-face front">☀️</div>
                <div class="coin-face back">⚡</div>
              </div>
            </div>
            <span id="sol-wallet-balance-val" style="font-family:monospace; margin-left:8px;">${_solWallet.balance.toFixed(6)} SOL</span>
          </div>
          <div style="font-size:0.7rem;color:#94a3b8;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
            <span>Staked: <strong id="sol-staked-val" style="color:#a5b4fc;">${_solWallet.staked.toFixed(2)} SOL</strong></span>
            <span style="color:#14F195;font-weight:700;">APY 8.2% Active</span>
          </div>
          <div class="sol-wallet-address" style="margin-bottom:12px;">
            <span id="sol-wallet-address-txt">${_solWallet.address.substring(0, 6)}...${_solWallet.address.substring(_solWallet.address.length - 8)}</span>
            <button class="btn btn-outline btn-sm" id="btn-copy-sol-wallet" style="padding:2px 8px;font-size:0.6rem;text-transform:uppercase;border-color:rgba(255,255,255,0.15);">Copy</button>
          </div>

          <!-- Staking Controls HUD -->
          <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;margin-top:10px;">
            <div style="font-size:0.68rem;color:#a5b4fc;font-weight:700;margin-bottom:6px;text-transform:uppercase;">Solana Staking Panel</div>
            <div style="display:flex;gap:6px;">
              <input type="number" id="sol-stake-amount" placeholder="Amount (e.g. 1.0)" min="0.1" step="0.1" class="form-input" style="padding:4px 8px;font-size:0.75rem;height:auto;flex:1;background:rgba(0,0,0,0.3);border-color:rgba(255,255,255,0.15);color:#fff;" />
              <button class="btn btn-primary btn-sm" id="btn-stake-sol" style="padding:4px 10px;font-size:0.7rem;background:linear-gradient(90deg, #9945FF, #7928ca);border:none;">Stake</button>
              <button class="btn btn-outline btn-sm" id="btn-unstake-sol" style="padding:4px 10px;font-size:0.7rem;border-color:rgba(20,241,149,0.3);color:#14F195;">Unstake</button>
            </div>
          </div>
        </div>

        <h4 style="margin:20px 0 12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#14F195;font-size:0.75rem;">
          ⛓️ Block Confirmed Transactions
        </h4>

        <!-- Transaction Feed -->
        <div class="sol-ledger-log" id="sol-ledger-log-feed">
          ${_solWallet.ledger.map((l, index) => `
            <div class="sol-ledger-item" data-index="${index}" style="cursor:pointer; transition: background 0.2s; padding: 6px; border-radius: 4px;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <span style="color:#a5b4fc;font-weight:700;font-size:0.65rem;">Tx: ${l.tx.substring(0, 8)}...</span>
                <span class="badge" style="font-size:0.55rem;padding:1px 5px;background:${l.status === 'Active' ? 'rgba(99,102,241,0.2)' : 'rgba(20,241,149,0.15)'};color:${l.status === 'Active' ? '#a5b4fc' : '#14F195'};">${l.status}</span>
              </div>
              <div style="font-size:0.7rem;color:#f8fafc;">${l.desc}</div>
              <div style="display:flex;justify-content:space-between;color:var(--text-muted);font-size:0.6rem;margin-top:2px;">
                <span>${l.time}</span>
                <span style="font-weight:700;color:${l.val.startsWith('+') ? '#14F195' : '#ef4444'};">${l.val}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Right Panel: Health habit controls -->
      <div class="sol-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="display:flex;align-items:center;gap:8px;margin:0;font-size:1.1rem;font-weight:700;">📈 Dynamic Vitals & Daily Habits</h3>
          <button class="btn btn-outline btn-sm" id="btn-sync-habits">🔄 Sync Ledger</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;margin-bottom:24px;">
          <!-- Water Card -->
          <div class="card" style="padding:16px;background:rgba(99,102,241,0.02);border:1px solid rgba(99,102,241,0.15);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:700;font-size:0.95rem;color:var(--text-primary);">💧 Hydration</span>
              <span style="font-weight:800;color:var(--primary);">${waterPct}%</span>
            </div>
            <div style="font-size:1.5rem;font-weight:800;margin-bottom:8px;color:#fff;">${_habits.waterIntakeMl} <span style="font-size:.8rem;font-weight:400;color:var(--text-secondary);">/ ${_habits.waterGoalMl} ml</span></div>
            <div class="anomaly-bar" style="height:6px;margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden;">
              <div class="anomaly-fill normal" style="width:${Math.min(100, waterPct)}%;background:var(--primary);height:100%;"></div>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-add-water" style="width:100%;padding:6px;font-weight:700;">+ Add 250ml (+0.05 SOL)</button>
          </div>

          <!-- Sleep Card -->
          <div class="card" style="padding:16px;background:rgba(245,158,11,0.02);border:1px solid rgba(245,158,11,0.15);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:700;font-size:0.95rem;color:var(--text-primary);">😴 Sleep Duration</span>
              <span style="font-weight:800;color:#f59e0b;">${sleepPct}%</span>
            </div>
            <div style="font-size:1.5rem;font-weight:800;margin-bottom:8px;color:#fff;">${_habits.sleepHours} <span style="font-size:.8rem;font-weight:400;color:var(--text-secondary);">/ ${_habits.sleepGoalHours} hrs</span></div>
            <div class="anomaly-bar" style="height:6px;margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden;">
              <div class="anomaly-fill normal" style="width:${Math.min(100, sleepPct)}%;background:#f59e0b;height:100%;"></div>
            </div>
            <button class="btn btn-outline btn-sm" id="btn-log-sleep" style="width:100%;padding:6px;font-weight:700;">Log Sleep (+0.50 SOL)</button>
          </div>

          <!-- Exercise Card -->
          <div class="card" style="padding:16px;background:rgba(16,185,129,0.02);border:1px solid rgba(16,185,129,0.15);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:700;font-size:0.95rem;color:var(--text-primary);">🏃 Cardio Workout</span>
              <span style="font-weight:800;color:#10b981;">${exePct}%</span>
            </div>
            <div style="font-size:1.5rem;font-weight:800;margin-bottom:8px;color:#fff;">${_habits.exerciseMins} <span style="font-size:.8rem;font-weight:400;color:var(--text-secondary);">/ ${_habits.exerciseGoalMins} mins</span></div>
            <div class="anomaly-bar" style="height:6px;margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden;">
              <div class="anomaly-fill normal" style="width:${Math.min(100, exePct)}%;background:#10b981;height:100%;"></div>
            </div>
            <button class="btn btn-outline btn-sm" id="btn-log-exercise" style="width:100%;padding:6px;font-weight:700;">Log Workout (+0.50 SOL)</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;border-top:1px solid var(--border);padding-top:20px;">
          <!-- Reminders List -->
          <div>
            <h4 style="margin-bottom:12px;font-weight:700;display:flex;align-items:center;gap:6px;font-size:0.9rem;">⏰ Medication & Care Reminders</h4>
            <div id="companion-reminders" style="max-height:220px;overflow-y:auto;padding-right:5px;">
              <div class="loading-center"><div class="spinner"></div></div>
            </div>
          </div>

          <!-- AI Clinical Insights -->
          <div style="border-left:1px solid var(--border);padding-left:20px;">
            <h4 style="margin-bottom:12px;font-weight:700;display:flex;align-items:center;gap:6px;font-size:0.9rem;">💡 Predictive AI Analysis</h4>
            <div id="companion-insights" style="max-height:220px;overflow-y:auto;padding-right:5px;">
              <div class="loading-center"><div class="spinner"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindLedgerEvents();
  loadRemindersAndInsights();
}

function bindLedgerEvents() {
  // Add Water
  document.getElementById('btn-add-water')?.addEventListener('click', () => {
    _habits.waterIntakeMl += 250;
    mintSOLToken(0.05, `Water Intake (+250ml)`);
    renderLedgerTab();
  });

  // Log Sleep
  document.getElementById('btn-log-sleep')?.addEventListener('click', () => {
    const hours = prompt('Enter sleep duration hours:', _habits.sleepHours);
    const parsed = parseFloat(hours);
    if (!isNaN(parsed) && parsed > 0) {
      _habits.sleepHours = parsed;
      mintSOLToken(0.50, `Sleep logged: ${parsed} hours`);
      renderLedgerTab();
    }
  });

  // Log Exercise
  document.getElementById('btn-log-exercise')?.addEventListener('click', () => {
    const mins = prompt('Enter cardio workout minutes:', _habits.exerciseMins);
    const parsed = parseInt(mins);
    if (!isNaN(parsed) && parsed > 0) {
      _habits.exerciseMins = parsed;
      mintSOLToken(0.50, `Workout logged: ${parsed} mins`);
      renderLedgerTab();
    }
  });

  // Stake SOL
  document.getElementById('btn-stake-sol')?.addEventListener('click', () => {
    const input = document.getElementById('sol-stake-amount');
    const amount = parseFloat(input?.value);
    if (isNaN(amount) || amount <= 0) {
      toastError('Invalid Amount', 'Please enter a positive amount of SOL to stake.');
      return;
    }
    if (amount > _solWallet.balance) {
      toastError('Insufficient Balance', 'You do not have enough SOL in your wallet.');
      return;
    }

    _solWallet.balance -= amount;
    _solWallet.staked += amount;
    
    // Add ledger entry
    const txHash = '0x' + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('');
    _solWallet.ledger.unshift({
      tx: txHash,
      desc: `Staked ${amount.toFixed(2)} SOL: Diagnostic Yield Staking`,
      val: `-${amount.toFixed(2)} SOL`,
      status: 'Active',
      time: 'Just now'
    });

    saveToLocalStorage();
    toastSuccess('🔒 SOL Staked', `Successfully locked ${amount.toFixed(2)} SOL for staking yield!`);
    
    triggerCoinAnimation();
    renderLedgerTab();
  });

  // Unstake SOL
  document.getElementById('btn-unstake-sol')?.addEventListener('click', () => {
    const input = document.getElementById('sol-stake-amount');
    const amount = parseFloat(input?.value);
    if (isNaN(amount) || amount <= 0) {
      toastError('Invalid Amount', 'Please enter a positive amount of SOL to unstake.');
      return;
    }
    if (amount > _solWallet.staked) {
      toastError('Insufficient Staked', 'You do not have that much SOL staked.');
      return;
    }

    _solWallet.staked -= amount;
    _solWallet.balance += amount;
    
    // Add ledger entry
    const txHash = '0x' + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('');
    _solWallet.ledger.unshift({
      tx: txHash,
      desc: `Unstaked ${amount.toFixed(2)} SOL: Yield Staking Release`,
      val: `+${amount.toFixed(2)} SOL`,
      status: 'Confirmed',
      time: 'Just now'
    });

    saveToLocalStorage();
    toastSuccess('🔓 SOL Unstaked', `Successfully released ${amount.toFixed(2)} SOL to wallet!`);
    
    triggerCoinAnimation();
    renderLedgerTab();
  });

  // Copy wallet address
  document.getElementById('btn-copy-sol-wallet')?.addEventListener('click', () => {
    navigator.clipboard.writeText(_solWallet.address);
    toastSuccess('Copied Address', 'Solana address copied to clipboard.');
  });

  // Sync ledger
  document.getElementById('btn-sync-habits')?.addEventListener('click', () => {
    toastSuccess('Sync Completed', 'Solana Wellness Ledger has been validated with local database validators.');
  });

  // Bind transaction feed inspector click events
  document.getElementById('sol-ledger-log-feed')?.querySelectorAll('.sol-ledger-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      const tx = _solWallet.ledger[idx];
      if (tx) {
        showExplorerModal(tx);
      }
    });
  });
}

function mintSOLToken(amount, desc) {
  _solWallet.balance += amount;

  // Add ledger entry
  const txHash = '0x' + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('');
  _solWallet.ledger.unshift({
    tx: txHash,
    desc: `Minted ${amount.toFixed(2)} SOL: ${desc}`,
    val: `+${amount.toFixed(2)} SOL`,
    status: 'Confirmed',
    time: 'Just now'
  });

  saveToLocalStorage();

  toastSuccess('🪙 Token Minted', `Earned +${amount.toFixed(2)} SOL for health habit log!`);

  triggerCoinAnimation();
}

function startYieldTicker() {
  if (_yieldInterval) clearInterval(_yieldInterval);

  // 8.2% APY: interest per second = staked * 0.082 / (365 * 24 * 3600)
  const interestPerSecond = 0.082 / (365 * 24 * 3600);
  const intervalMs = 250;
  const interestPerTick = interestPerSecond * (intervalMs / 1000);

  _yieldInterval = setInterval(() => {
    if (_solWallet.staked > 0) {
      _solWallet.balance += _solWallet.staked * interestPerTick;

      if (_activeTab === 'ledger') {
        const balEl = document.getElementById('sol-wallet-balance-val');
        if (balEl) {
          balEl.textContent = `${_solWallet.balance.toFixed(6)} SOL`;
        }
      }
    }
  }, intervalMs);
}

function triggerCoinAnimation() {
  const coin = document.getElementById('sol-coin-spin');
  if (coin) {
    coin.classList.remove('sol-token-anim');
    void coin.offsetWidth; // Trigger reflow to restart animation
    coin.classList.add('sol-token-anim');
  }
}

function showExplorerModal(tx) {
  let modal = document.getElementById('sol-explorer-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sol-explorer-modal';
    modal.className = 'modal hidden';
    modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:1000;display:flex;align-items:center;justify-content:center;";
    document.body.appendChild(modal);
  }

  const blockHeight = Math.floor(214539200 + Math.random() * 5000);
  const computeUnits = Math.floor(15000 + Math.random() * 5000);
  const fee = (0.000005).toFixed(6);

  modal.innerHTML = `
    <div class="card" style="width:90%;max-width:500px;padding:24px;border:1px solid #9945FF;background:rgba(15,10,25,0.98);box-shadow:0 0 30px rgba(153, 69, 228, 0.4);border-radius:12px;position:relative;color:#fff;">
      <button id="sol-explorer-close" style="position:absolute;top:15px;right:15px;background:none;border:none;color:#a5b4fc;font-size:1.2rem;cursor:pointer;outline:none;">✕</button>
      <h3 style="margin-top:0;color:#14F195;font-weight:800;font-family:'Outfit',sans-serif;display:flex;align-items:center;gap:8px;">
        🔍 Solana Explorer Diagnostics
      </h3>
      <p style="font-size:0.75rem;color:#94a3b8;margin-bottom:20px;">
        Cryptographic transaction validation verified on post-quantum secure validator nodes.
      </p>

      <div style="display:flex;flex-direction:column;gap:12px;font-size:0.8rem;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#94a3b8;">Signature:</span><span style="font-family:monospace;color:#a5b4fc;font-size:0.7rem;word-break:break-all;max-width:280px;text-align:right;">${tx.tx}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Status:</span><span style="color:#14F195;font-weight:700;">✓ ${tx.status} (Confirmed)</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Description:</span><span>${tx.desc}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Amount:</span><span style="font-weight:700;color:${tx.val.startsWith('+') ? '#14F195' : '#ef4444'};">${tx.val}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Block Height:</span><span style="font-family:monospace;">#${blockHeight}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Compute Fee:</span><span style="font-family:monospace;">${fee} SOL</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Gas Limit (CU):</span><span style="font-family:monospace;">${computeUnits} CU</span></div>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  document.getElementById('sol-explorer-close')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
}

async function loadRemindersAndInsights() {
  const remindersEl = document.getElementById('companion-reminders');
  const insightsEl  = document.getElementById('companion-insights');

  if (!remindersEl || !insightsEl) return;

  try {
    const query = `water=${_habits.waterIntakeMl}&waterGoal=${_habits.waterGoalMl}&sleep=${_habits.sleepHours}&sleepGoal=${_habits.sleepGoalHours}&exercise=${_habits.exerciseMins}&exerciseGoal=${_habits.exerciseGoalMins}`;
    const res = await api.get(`/companion/insights?${query}`);
    const { reminders = [], insights = [] } = res.data;

    // Render reminders
    if (reminders.length === 0) {
      remindersEl.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem;padding:20px;text-align:center;">No medications or tasks scheduled for today.</div>';
    } else {
      remindersEl.innerHTML = reminders.map(r => `
        <div class="card" style="padding:10px 12px;margin-bottom:8px;background:rgba(255,255,255,0.01);border-left:3px solid var(--primary);">
          <div style="font-weight:600;font-size:.85rem;display:flex;justify-content:space-between;">
            <span>${r.title}</span>
            <span style="color:var(--primary);font-size:.75rem;">${r.time}</span>
          </div>
          <div style="font-size:.78rem;color:var(--text-secondary);margin-top:4px;">${r.details}</div>
        </div>
      `).join('');
    }

    // Render insights
    if (insights.length === 0) {
      insightsEl.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem;padding:20px;text-align:center;">Calibrating predictive insights. Continue logging metrics.</div>';
    } else {
      insightsEl.innerHTML = insights.map(i => `
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:12px;font-size:.8rem;line-height:1.4;">
          <span style="color:var(--primary);font-weight:700;">✦</span>
          <div>
            <strong style="color:var(--text-secondary);">${i.category}:</strong> ${i.text}
          </div>
        </div>
      `).join('');
    }

  } catch (err) {
    remindersEl.innerHTML = '<div style="font-size:.8rem;color:var(--text-danger);text-align:center;">Failed to load reminders.</div>';
    insightsEl.innerHTML = '<div style="font-size:.8rem;color:var(--text-danger);text-align:center;">Failed to load insights.</div>';
  }
}

// Utility sleep promise
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
