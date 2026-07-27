/**
 * @file gemini.js
 * @description Google Gemini 1.5 Flash & Vision API Integration for MediFlow.
 * Provides ultra-fast clinical advice and multimodal handwritten prescription OCR scanning.
 */

const logger = require('./logger');

/**
 * Calls Google Gemini 1.5 Flash Text API
 */
async function callGemini(prompt, systemInstruction = '') {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    logger.info('[Gemini] GEMINI_API_KEY not configured — operating in offline fallback mode.');
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const contents = [];
  if (typeof prompt === 'string') {
    contents.push({ role: 'user', parts: [{ text: prompt }] });
  } else if (Array.isArray(prompt)) {
    prompt.forEach(p => {
      contents.push({
        role: p.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: p.content || p.text || '' }]
      });
    });
  }

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 800,
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.warn(`[Gemini] API error (${res.status}): ${errText}`);
      return null;
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const responseText = candidate?.content?.parts?.[0]?.text;

    return responseText || null;
  } catch (err) {
    logger.error(`[Gemini] Fetch exception: ${err.message}`);
    return null;
  }
}

/**
 * Calls Google Gemini 1.5 Vision API to scan handwritten doctor prescriptions
 * @param {string} base64Image - Base64 encoded image string (jpeg/png)
 * @param {string} mimeType - Image mime type (default: image/jpeg)
 */
async function callGeminiVision(base64Image, mimeType = 'image/jpeg') {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    logger.info('[Gemini Vision] API key missing — returning simulated OCR result.');
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const promptText = `You are a medical OCR specialist. Extract all medication details from this prescription.
Return ONLY a raw JSON array of objects with keys: "name", "dosage", "frequency", "duration", "matchedCategory".
Example: [{"name":"Amoxicillin","dosage":"500mg","frequency":"Twice daily","duration":"5 days","matchedCategory":"antibiotic"}]`;

  const payload = {
    contents: [{
      parts: [
        { text: promptText },
        {
          inlineData: {
            mimeType,
            data: base64Image.replace(/^data:image\/\w+;base64,/, '')
          }
        }
      ]
    }]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    logger.error(`[Gemini Vision] Exception: ${err.message}`);
    return null;
  }
}

module.exports = {
  callGemini,
  callGeminiVision
};
