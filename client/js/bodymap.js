/**
 * bodymap.js — Interactive SVG Human Body Symptom Selector
 * Pure JS — clickable body regions that auto-populate symptoms.
 */

const BODY_REGIONS = {
  head: {
    label: 'Head & Brain',
    symptoms: ['headache','severe headache','migraine','dizziness','blurred vision','light sensitivity','confusion','memory loss','facial drooping'],
    path: 'M 150,30 C 120,30 100,55 100,80 C 100,110 120,130 150,130 C 180,130 200,110 200,80 C 200,55 180,30 150,30 Z',
    color: '#f43f5e',
  },
  neck: {
    label: 'Neck & Throat',
    symptoms: ['sore throat','stiff neck','neck pain','difficulty swallowing','swollen glands'],
    path: 'M 135,130 L 165,130 L 170,160 L 130,160 Z',
    color: '#fb923c',
  },
  chest: {
    label: 'Chest & Heart',
    symptoms: ['chest pain','chest tightness','shortness of breath','palpitations','irregular heartbeat','coughing blood','difficulty breathing'],
    path: 'M 100,160 L 200,160 L 215,240 Q 200,260 150,260 Q 100,260 85,240 Z',
    color: '#ef4444',
  },
  abdomen: {
    label: 'Abdomen & Stomach',
    symptoms: ['abdominal pain','nausea','vomiting','bloating','acid reflux','blood in stool','diarrhea','constipation'],
    path: 'M 95,260 Q 100,260 150,260 Q 200,260 205,260 L 200,340 Q 180,360 150,360 Q 120,360 100,340 Z',
    color: '#f59e0b',
  },
  leftArm: {
    label: 'Left Arm',
    symptoms: ['left arm pain','numbness','tingling','joint pain','swelling','weakness in limbs'],
    path: 'M 85,170 L 70,170 L 40,280 L 30,340 L 50,345 L 65,290 L 85,230 Z',
    color: '#0ea5e9',
  },
  rightArm: {
    label: 'Right Arm',
    symptoms: ['arm weakness','shoulder pain','reduced range','joint pain','swelling','numbness'],
    path: 'M 215,170 L 230,170 L 260,280 L 270,340 L 250,345 L 235,290 L 215,230 Z',
    color: '#0ea5e9',
  },
  legs: {
    label: 'Legs & Knees',
    symptoms: ['knee pain','leg numbness','back pain','hip pain','difficulty walking','ankle swelling','joint pain'],
    path: 'M 115,360 L 140,360 L 145,460 L 150,530 L 130,530 L 125,460 L 105,390 Z M 160,360 L 185,360 L 195,390 L 175,460 L 170,530 L 150,530 L 155,460 Z',
    color: '#8b5cf6',
  },
  skin: {
    label: 'Skin (General)',
    symptoms: ['skin rash','itching','redness','hives','eczema','dry skin','acne','hair loss','mole changes'],
    path: null, // This is a button, not a body region
    color: '#10b981',
  },
  mind: {
    label: 'Mental Health',
    symptoms: ['depression','anxiety','insomnia','panic attacks','mood swings','hopelessness','hallucinations'],
    path: null,
    color: '#a78bfa',
  },
};

let selectedRegion = null;

export function initBodyMap(onSymptomsSelected) {
  const container = document.getElementById('bodymap-container');
  if (!container) return;

  // Build SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 300 560');
  svg.setAttribute('class', 'bodymap-svg');
  svg.id = 'bodymap-svg';

  // Body outline (background silhouette)
  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  outline.setAttribute('d', 'M 150,25 C 115,25 95,52 95,82 C 95,112 115,135 150,135 C 185,135 205,112 205,82 C 205,52 185,25 150,25 Z M 132,135 L 168,135 L 172,160 L 128,160 Z M 95,160 L 205,160 L 220,245 Q 205,265 150,265 Q 95,265 80,245 Z M 90,265 Q 95,265 150,265 Q 205,265 210,265 L 205,345 Q 185,365 150,365 Q 115,365 95,345 Z M 80,170 L 65,170 L 35,285 L 25,345 L 50,350 L 70,295 L 85,230 Z M 220,170 L 235,170 L 265,285 L 275,345 L 250,350 L 230,295 L 215,230 Z M 110,365 L 142,365 L 148,465 L 155,535 L 125,535 L 120,465 L 100,395 Z M 158,365 L 190,365 L 200,395 L 180,465 L 175,535 L 145,535 L 152,465 Z');
  outline.setAttribute('fill', 'rgba(99,102,241,0.06)');
  outline.setAttribute('stroke', 'rgba(99,102,241,0.15)');
  outline.setAttribute('stroke-width', '1');
  svg.appendChild(outline);

  // Interactive regions
  Object.entries(BODY_REGIONS).forEach(([key, region]) => {
    if (!region.path) return;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', region.path);
    path.setAttribute('fill', 'transparent');
    path.setAttribute('stroke', 'transparent');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('data-region', key);
    path.setAttribute('class', 'bodymap-region');
    path.style.cursor = 'pointer';
    path.style.transition = 'all 0.3s ease';

    path.addEventListener('mouseenter', () => {
      if (selectedRegion !== key) {
        path.setAttribute('fill', region.color + '20');
        path.setAttribute('stroke', region.color);
      }
      showRegionTooltip(key, region);
    });

    path.addEventListener('mouseleave', () => {
      if (selectedRegion !== key) {
        path.setAttribute('fill', 'transparent');
        path.setAttribute('stroke', 'transparent');
      }
      hideRegionTooltip();
    });

    path.addEventListener('click', () => {
      selectRegion(key, region, path, svg, onSymptomsSelected);
    });

    svg.appendChild(path);
  });

  container.innerHTML = '';
  container.appendChild(svg);

  // Add tooltip element
  const tooltip = document.createElement('div');
  tooltip.id = 'bodymap-tooltip';
  tooltip.className = 'bodymap-tooltip hidden';
  container.appendChild(tooltip);

  // Add non-body region buttons (skin, mental health)
  const extras = document.createElement('div');
  extras.className = 'bodymap-extras';
  ['skin', 'mind'].forEach(key => {
    const r = BODY_REGIONS[key];
    const btn = document.createElement('button');
    btn.className = 'bodymap-extra-btn';
    btn.style.setProperty('--region-color', r.color);
    btn.textContent = r.label;
    btn.addEventListener('click', () => {
      selectExtraRegion(key, r, onSymptomsSelected);
    });
    extras.appendChild(btn);
  });
  container.appendChild(extras);

  // Symptom panel
  const panel = document.createElement('div');
  panel.id = 'bodymap-symptom-panel';
  panel.className = 'bodymap-symptom-panel hidden';
  container.appendChild(panel);
}

function selectRegion(key, region, path, svg, callback) {
  // Deselect previous
  svg.querySelectorAll('.bodymap-region').forEach(p => {
    p.setAttribute('fill', 'transparent');
    p.setAttribute('stroke', 'transparent');
  });

  selectedRegion = key;
  path.setAttribute('fill', region.color + '30');
  path.setAttribute('stroke', region.color);

  showSymptomPanel(key, region, callback);
}

function selectExtraRegion(key, region, callback) {
  selectedRegion = key;
  document.querySelectorAll('.bodymap-extra-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  showSymptomPanel(key, region, callback);
}

function showSymptomPanel(key, region, callback) {
  const panel = document.getElementById('bodymap-symptom-panel');
  if (!panel) return;

  panel.className = 'bodymap-symptom-panel';
  panel.innerHTML = `
    <div class="bm-panel-header" style="--c:${region.color}">
      <span class="bm-panel-dot" style="background:${region.color}"></span>
      <span>${region.label}</span>
    </div>
    <div class="bm-panel-symptoms">
      ${region.symptoms.map(s => `
        <button class="bm-symptom-chip" data-symptom="${s}">${s}</button>
      `).join('')}
    </div>
  `;

  panel.querySelectorAll('.bm-symptom-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      if (callback) callback(chip.dataset.symptom, chip.classList.contains('selected'));
    });
  });
}

function showRegionTooltip(key, region) {
  const tip = document.getElementById('bodymap-tooltip');
  if (!tip) return;
  tip.textContent = region.label;
  tip.style.borderColor = region.color;
  tip.classList.remove('hidden');
}

function hideRegionTooltip() {
  document.getElementById('bodymap-tooltip')?.classList.add('hidden');
}
