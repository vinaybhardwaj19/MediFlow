/**
 * main.js — Vite SPA Modular Entry Point
 */

import { initAuth } from './modules/auth.js';
import { initTriage } from './modules/triage.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[MediFlow SPA] Application Initialized via Vite Module Bundler');
  initAuth();
  initTriage();
});
