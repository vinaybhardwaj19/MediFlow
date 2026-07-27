/**
 * triage.js — ES Module for Symptom Triage & XAI Explanation
 */

export function initTriage() {
  console.log('[Triage Module] Initialized');
}

export async function checkSymptoms(symptoms, vitalSigns = {}) {
  const res = await fetch('/api/v1/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symptoms, vitalSigns })
  });
  return await res.json();
}
