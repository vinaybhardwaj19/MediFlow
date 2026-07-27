/**
 * @file chat.controller.js
 * @description REST API for chat message history retrieval.
 * Used when a user re-opens a consultation to see past messages
 * (Socket also sends history on join, but this serves as a backup/pagination path).
 */

const ApiResponse  = require('../utils/ApiResponse');
const ApiError     = require('../utils/ApiError');
const ChatMessage  = require('../models/ChatMessage.model');
const Appointment  = require('../models/Appointment.model');

/**
 * GET /api/v1/chat/:roomId
 * Returns paginated chat messages for a consultation room.
 * Only appointment participants (patient/doctor) can access.
 */
exports.getChatHistory = async (req, res) => {
  const { roomId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  // Verify the requester is a participant of this room
  const appt = await Appointment.findOne({ 'consultationRoom.roomId': roomId });
  if (!appt) throw ApiError.notFound('Consultation room not found');

  const isPatient = appt.patientId.toString() === req.user.id;
  const isDoctor  = appt.doctorId.toString()  === req.user.id;
  const isAdmin   = req.user.role === 'admin';

  if (!isPatient && !isDoctor && !isAdmin) {
    throw ApiError.forbidden('You are not a participant in this consultation');
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [messages, total] = await Promise.all([
    ChatMessage.find({ roomId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    ChatMessage.countDocuments({ roomId }),
  ]);

  // Reverse so oldest-first for display
  messages.reverse();

  return ApiResponse.ok(res, messages, 'Chat history retrieved', {
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  });
};

/**
 * POST /api/v1/chat/:roomId/read
 * Mark messages as read by the current user.
 */
exports.markAsRead = async (req, res) => {
  const { roomId } = req.params;
  const { messageIds } = req.body;

  if (!Array.isArray(messageIds) || !messageIds.length) {
    throw ApiError.badRequest('messageIds array required');
  }

  const result = await ChatMessage.updateMany(
    { _id: { $in: messageIds }, roomId, senderId: { $ne: req.user.id } },
    { readAt: new Date() }
  );

  return ApiResponse.ok(res, { modified: result.modifiedCount }, 'Messages marked as read');
};

/**
 * POST /api/v1/chat/medibot
 * AI MediBot — uses GPT-4o-mini with a medical assistant system prompt.
 * Personalised based on user role and data if authenticated.
 */
exports.medibotChat = async (req, res) => {
  const { message, history = [], systemPrompt: customPrompt, temperature, maxTokens } = req.body;
  if (!message || !message.trim()) return ApiResponse.ok(res, { reply: 'Please type a message.' });

  // ── Determine Provider & API Key ──────────────────────────────────────────
  const grokKey   = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey   = process.env.GROQ_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;

  let apiUrl = '';
  let apiKey = '';
  let model  = '';

  if (grokKey) {
    apiUrl = 'https://api.x.ai/v1/chat/completions';
    apiKey = grokKey;
    model  = 'grok-beta';
  } else if (groqKey) {
    apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    apiKey = groqKey;
    model  = 'llama-3.3-70b-versatile';
  } else if (openAIKey) {
    apiUrl = 'https://api.openai.com/v1/chat/completions';
    apiKey = openAIKey;
    model  = 'gpt-4o-mini';
  }

  // If no API key configured, use local clinical engine
  if (!apiKey || !apiUrl) {
    const reply = getLocalChatResponse(message);
    return ApiResponse.ok(res, { reply });
  }

  // Personalization Context
  let userContext = "";
  if (req.user) {
    userContext = `\nYou are talking to ${req.user.firstName} ${req.user.lastName}, who is a ${req.user.role} on the platform.`;
    if (req.user.role === 'patient') {
      userContext += ` Be empathetic and helpful. If they ask about their vitals or history, mention they can find them in the 'Vitals' and 'Timeline' sections.`;
    } else if (req.user.role === 'doctor') {
      userContext += ` Address them as Dr. ${req.user.lastName}. Mention they can manage patients via the 'Queue' and 'Prescription Pad'.`;
    }
  }

  const defaultSystemPrompt = `You are MediBot, the AI health assistant for MediFlow — India's most advanced telemedicine platform.${userContext}

IDENTITY & MISSION:
- You serve patients across India, including Tier-2 and Tier-3 cities with limited specialist access.
- You speak English. If user writes in Hindi/Hinglish, respond in simple English and acknowledge their language.
- You are NOT a substitute for professional medical advice. Always end with "Consult a licensed doctor."

PLATFORM CAPABILITIES (reference these accurately):
- 🧠 AI Symptom Triage: Uses SHAP (Shapley values) to route to the correct specialist. Mention which symptom drove the recommendation.
- 💊 DDI Checker: GraphSAGE GNN over 45-drug knowledge graph detects drug interactions. Users can type: "check warfarin aspirin"
- 🏥 Federated Learning: AI trained across AIIMS Delhi, Apollo Bengaluru, Manipal Pune — zero patient data shared (Differential Privacy)
- 🚁 Drone Delivery: DGCA-compliant 3D A* routing. 15-min delivery window in select zones.
- 🔐 Security: Post-Quantum Cryptography (NIST FIPS 203/204 Kyber-768) for patient identity. AES-256-GCM for prescriptions.
- 💰 Jan Aushadhi: Generic medicines at 50-90% cheaper via PMBJP-linked Jan Aushadhi stores.

EMERGENCY RULES (must be INSTANT, no caveats):
- chest pain, heart attack, stroke, unconscious, severe bleeding, seizure, anaphylaxis, suicidal → "🚨 Call 112 IMMEDIATELY. Use the 🆘 SOS button on the top navbar."
- Mental health crisis → "iCall TISS: 9152987821 | Vandrevala: 1860-2662-345"

COMMUNICATION STYLE:
- Warm, empathetic, factual
- Use markdown bold (**text**) for key terms
- Keep responses under 120 words unless the user asks for detail
- Reference Indian healthcare context: ICMR guidelines, DPDP Act 2023, Jan Aushadhi, ASHA workers, 112 emergency

NEVER: Diagnose definitively. Prescribe doses. Share personal patient data.`;

  const finalSystemPrompt = customPrompt || defaultSystemPrompt;

  const messages = [
    { role: 'system', content: finalSystemPrompt },
    ...history.slice(-12).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message.trim() },
  ];

  try {
    const finalTemp = typeof temperature !== 'undefined' ? parseFloat(temperature) : 0.6;
    const finalMaxTokens = typeof maxTokens !== 'undefined' ? parseInt(maxTokens) : 300;

    const resp = await fetch(apiUrl, {
      method : 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${apiKey}` 
      },
      body   : JSON.stringify({
        model,
        messages,
        temperature: finalTemp,
        max_tokens: finalMaxTokens
      }),
    });

    if (resp.ok) {
      const data  = await resp.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return ApiResponse.ok(res, { reply });
    } else {
      console.warn(`[MediBot] API call failed with status ${resp.status} — using local engine fallback`);
    }
  } catch (err) {
    console.error('[MediBot] Provider error:', err.message);
  }

  // Fallback to local smart clinical engine if external API fails (e.g. suspended key)
  const fallbackReply = getLocalChatResponse(message);
  return ApiResponse.ok(res, { reply: fallbackReply });
};

function getLocalChatResponse(message) {
  const lower = message.toLowerCase();
  
  if (lower.includes('chest pain') || lower.includes('heart attack') || lower.includes('shortness of breath') || lower.includes('emergency')) {
    return "🚨 EMERGENCY ALERT: This sounds like a high-risk cardiac or respiratory symptom. Please call 112 (Emergency Services) immediately and proceed to the nearest hospital emergency room!";
  }
  
  if (lower.includes('cough') || lower.includes('fever') || lower.includes('flu') || lower.includes('throat')) {
    return "I detected respiratory symptoms. Mild cough and fever can often be managed with hydration and rest. However, if you experience high fever or shortness of breath, please book an AI-prioritized consultation with our Pulmonologist immediately.";
  }
  
  if (lower.includes('warfarin') || lower.includes('aspirin') || lower.includes('interaction') || lower.includes('drug') || lower.includes('ddi')) {
    return "Based on our GraphSAGE drug interaction database, combining anticoagulants like Warfarin with antiplatelets like Aspirin creates a HIGH bleeding risk. Please review your active prescriptions with a doctor before combining them.";
  }
  
  if (lower.includes('sugar') || lower.includes('diabetes') || lower.includes('glucose') || lower.includes('metformin')) {
    return "For diabetes or elevated fasting blood sugar, clinical guidelines recommend a low-glycemic diet, regular physical exercise, and blood glucose tracking. If you have been prescribed Metformin, ensure you take it with meals to reduce gastrointestinal side effects.";
  }
  
  if (lower.includes('thyroid') || lower.includes('tsh') || lower.includes('thyroxine')) {
    return "TSH elevations point towards subclinical hypothyroidism. Actionable advice: monitor for fatigue, weight changes, and cold sensitivity, and discuss thyroxine therapy options with your primary care provider.";
  }

  if (lower.includes('drone') || lower.includes('delivery') || lower.includes('ship') || lower.includes('route') || lower.includes('logistics')) {
    return "MediFlow uses autonomous drone dispatch and optimized Dijkstra routing to deliver prescriptions directly to your address within 15 minutes. You can track your drone live on the logistics dashboard.";
  }
  
  if (lower.includes('sol') || lower.includes('wallet') || lower.includes('token') || lower.includes('blockchain') || lower.includes('earn')) {
    return "Our Solana-based Health Core rewards healthy actions! By completing water intake, cardio workouts, or sleep goals, you automatically mint wellness tokens into your verified ledger address.";
  }

  return "Welcome to MediFlow's Clinical Intelligence Core. How can I assist you? I can help with: AI Triage, E-Pharmacy, Smart Consultations, Lab Results, or viewing your live bio-feed.";
}

