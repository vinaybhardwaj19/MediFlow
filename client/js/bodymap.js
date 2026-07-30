/**
 * bodymap.js — Interactive 3D Digital Twin (Three.js)
 * Replaces the 2D SVG bodymap with a 3D neon holographic human.
 */

import { speakText } from './voice-nav.js';

const BODY_REGIONS = {
  head: {
    label: 'Head & Brain',
    symptoms: ['headache','severe headache','migraine','dizziness','blurred vision','light sensitivity','confusion','memory loss','facial drooping'],
    color: '#f43f5e',
    image: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&w=200&q=80',
  },
  chest: {
    label: 'Chest & Heart',
    symptoms: ['chest pain','chest tightness','shortness of breath','palpitations','irregular heartbeat','coughing blood','difficulty breathing'],
    color: '#ef4444',
    image: 'https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?auto=format&fit=crop&w=200&q=80',
  },
  abdomen: {
    label: 'Abdomen & Stomach',
    symptoms: ['abdominal pain','nausea','vomiting','bloating','acid reflux','blood in stool','diarrhea','constipation'],
    color: '#f59e0b',
    image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=200&q=80',
  },
  arms: {
    label: 'Arms & Hands',
    symptoms: ['arm weakness','shoulder pain','numbness','tingling','joint pain','swelling'],
    color: '#0ea5e9',
    image: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=200&q=80',
  },
  legs: {
    label: 'Legs & Feet',
    symptoms: ['knee pain','leg numbness','back pain','hip pain','difficulty walking','ankle swelling','joint pain'],
    color: '#8b5cf6',
    image: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=200&q=80',
  },
  skin: {
    label: 'Skin (General)',
    symptoms: ['skin rash','itching','redness','hives','eczema','dry skin','acne','hair loss','mole changes'],
    color: '#10b981',
    image: 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=200&q=80',
  },
  mind: {
    label: 'Mental Health',
    symptoms: ['depression','anxiety','insomnia','panic attacks','mood swings','hopelessness','hallucinations'],
    color: '#a78bfa',
    image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=200&q=80',
  },
};

let scene, camera, renderer, raycaster, mouse, controls;
let bodyMeshes = [];
let selectedRegion = null;
let animationFrameId;

export function initBodyMap(onSymptomsSelected) {
  const container = document.getElementById('bodymap-container');
  if (!container) return;

  // Clear container
  container.innerHTML = '';
  
  // Clean up previous instances if any
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  bodyMeshes = [];

  // 1. Setup Scene, Camera, Renderer
  scene = new THREE.Scene();
  scene.background = null; // Transparent background
  scene.fog = new THREE.FogExp2(0x0f172a, 0.05);

  const rect = container.getBoundingClientRect();
  camera = new THREE.PerspectiveCamera(45, rect.width / rect.height || 1, 0.1, 1000);
  camera.position.set(0, 5, 20);

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(rect.width || 300, rect.height || 500);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // 2. Controls
  if (THREE.OrbitControls) {
     controls = new THREE.OrbitControls(camera, renderer.domElement);
     controls.enableDamping = true;
     controls.dampingFactor = 0.05;
     controls.minDistance = 10;
     controls.maxDistance = 30;
     controls.target.set(0, 3, 0);
  }

  // 3. Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0x6366f1, 0.8);
  directionalLight.position.set(5, 10, 7);
  scene.add(directionalLight);

  const backLight = new THREE.PointLight(0x10b981, 0.5);
  backLight.position.set(-5, 5, -5);
  scene.add(backLight);

  // 4. Create Cyberpunk Hologram Human
  createHolographicHuman();

  // 5. Interaction (Raycasting)
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  function onMouseMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(bodyMeshes);
    
    // Reset colors
    bodyMeshes.forEach(mesh => {
       if (mesh.userData.region !== selectedRegion) {
           mesh.material.emissive.setHex(0x000000);
           mesh.material.opacity = 0.4;
       }
    });

    if (intersects.length > 0) {
       document.body.style.cursor = 'pointer';
       const mesh = intersects[0].object;
       if (mesh.userData.region !== selectedRegion) {
          mesh.material.emissive.setHex(0x6366f1);
          mesh.material.opacity = 0.8;
       }
       showRegionTooltip(mesh.userData.region, event.clientX, event.clientY);
    } else {
       document.body.style.cursor = 'default';
       hideRegionTooltip();
    }
  }

  function onClick(event) {
     raycaster.setFromCamera(mouse, camera);
     const intersects = raycaster.intersectObjects(bodyMeshes);
     
     if (intersects.length > 0) {
         const mesh = intersects[0].object;
         const regionKey = mesh.userData.region;
         
         bodyMeshes.forEach(m => {
             m.material.emissive.setHex(0x000000);
             m.material.opacity = 0.4;
         });

         mesh.material.emissive.set(BODY_REGIONS[regionKey].color);
         mesh.material.opacity = 0.9;
         
         selectRegion(regionKey, BODY_REGIONS[regionKey], onSymptomsSelected);
     }
  }

  renderer.domElement.addEventListener('mousemove', onMouseMove, false);
  renderer.domElement.addEventListener('click', onClick, false);
  
  // Handle Resize
  window.addEventListener('resize', () => {
      if(!container) return;
      const r = container.getBoundingClientRect();
      if(r.width && r.height) {
          camera.aspect = r.width / r.height;
          camera.updateProjectionMatrix();
          renderer.setSize(r.width, r.height);
      }
  });

  // 6. Animation Loop
  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if(controls) controls.update();
    
    // Gentle rotation of the whole body group if needed
    // scene.rotation.y += 0.005;
    
    renderer.render(scene, camera);
  }
  animate();

  // 7. Add UI overlays (Tooltips, Extra Buttons, Symptom Panel)
  buildUIOverlays(container, onSymptomsSelected);
}

function createHolographicHuman() {
   // Material for hologram
   const material = new THREE.MeshPhysicalMaterial({
       color: 0x6366f1,
       metalness: 0.1,
       roughness: 0.2,
       transmission: 0.9,
       transparent: true,
       opacity: 0.4,
       side: THREE.DoubleSide,
       wireframe: true
   });

   const createPart = (geo, x, y, z, region) => {
       const mesh = new THREE.Mesh(geo, material.clone());
       mesh.position.set(x, y, z);
       mesh.userData = { region: region };
       scene.add(mesh);
       bodyMeshes.push(mesh);
       return mesh;
   };

   // Head
   createPart(new THREE.SphereGeometry(1, 16, 16), 0, 7.5, 0, 'head');
   
   // Neck (Attached to Chest logic)
   createPart(new THREE.CylinderGeometry(0.4, 0.5, 1, 16), 0, 6.2, 0, 'chest');

   // Chest
   createPart(new THREE.BoxGeometry(3, 2.5, 1.5), 0, 4.5, 0, 'chest');

   // Abdomen
   createPart(new THREE.BoxGeometry(2.6, 2, 1.4), 0, 2.2, 0, 'abdomen');

   // Left Arm
   createPart(new THREE.CylinderGeometry(0.4, 0.3, 4, 16), -2.2, 3.5, 0, 'arms');
   // Right Arm
   createPart(new THREE.CylinderGeometry(0.4, 0.3, 4, 16), 2.2, 3.5, 0, 'arms');

   // Left Leg
   createPart(new THREE.CylinderGeometry(0.5, 0.4, 4.5, 16), -0.8, -1.2, 0, 'legs');
   // Right Leg
   createPart(new THREE.CylinderGeometry(0.5, 0.4, 4.5, 16), 0.8, -1.2, 0, 'legs');
   
   // Add glowing particle nodes at joints
   const sphereGeo = new THREE.SphereGeometry(0.2, 8, 8);
   const glowMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
   const joints = [
       [-2.2, 1.5, 0], [2.2, 1.5, 0], // hands
       [-0.8, -3.5, 0], [0.8, -3.5, 0], // feet
       [0, 4.5, 0.8] // heart center
   ];
   joints.forEach(pos => {
       const node = new THREE.Mesh(sphereGeo, glowMat);
       node.position.set(...pos);
       scene.add(node);
   });
}

function buildUIOverlays(container, onSymptomsSelected) {
   // Add tooltip element
   let tooltip = document.getElementById('bodymap-tooltip');
   if (!tooltip) {
       tooltip = document.createElement('div');
       tooltip.id = 'bodymap-tooltip';
       tooltip.className = 'bodymap-tooltip hidden';
       container.appendChild(tooltip);
   }

   // Add non-body region buttons (skin, mental health)
   const extras = document.createElement('div');
   extras.className = 'bodymap-extras';
   extras.style.cssText = 'position:absolute; bottom:20px; left:20px; display:flex; gap:10px; z-index:10;';
   
   ['skin', 'mind'].forEach(key => {
     const r = BODY_REGIONS[key];
     const btn = document.createElement('button');
     btn.className = 'bodymap-extra-btn btn btn-outline btn-sm';
     btn.style.borderColor = r.color;
     btn.style.color = r.color;
     btn.textContent = r.label;
     btn.addEventListener('click', (e) => {
       selectExtraRegion(key, r, onSymptomsSelected, e);
     });
     extras.appendChild(btn);
   });
   container.appendChild(extras);

   // Symptom panel
   let panel = document.getElementById('bodymap-symptom-panel');
   if (!panel) {
       panel = document.createElement('div');
       panel.id = 'bodymap-symptom-panel';
       panel.className = 'bodymap-symptom-panel hidden';
       panel.style.cssText = 'position:absolute; right:20px; top:20px; width:300px; max-height:80%; overflow-y:auto; background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:15px; box-shadow:0 10px 30px rgba(0,0,0,0.5); z-index:10;';
       container.appendChild(panel);
   }
}

function selectRegion(key, region, callback) {
  selectedRegion = key;
  speakText(`${region.label}. Select your symptoms.`, 'hi-IN');
  showSymptomPanel(key, region, callback);
}

function selectExtraRegion(key, region, callback, event) {
  selectedRegion = key;
  document.querySelectorAll('.bodymap-extra-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  
  // Reset all 3D meshes
  bodyMeshes.forEach(m => {
     m.material.emissive.setHex(0x000000);
     m.material.opacity = 0.4;
  });

  speakText(`${region.label}. Select your symptoms.`, 'hi-IN');
  showSymptomPanel(key, region, callback);
}

function showSymptomPanel(key, region, callback) {
  const panel = document.getElementById('bodymap-symptom-panel');
  if (!panel) return;

  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px; border-bottom:1px solid var(--border); padding-bottom:10px;">
      <img src="${region.image}" alt="${region.label}" style="width:36px; height:36px; border-radius:8px; object-fit:cover;" />
      <div style="font-weight:800; color:${region.color}; font-size:1.1rem;">${region.label}</div>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
      ${region.symptoms.map(s => `
        <button class="bm-symptom-chip" data-symptom="${s}" style="padding:6px 12px; border-radius:20px; font-size:0.8rem; cursor:pointer; background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text-main); transition:all 0.2s;">
           + ${s}
        </button>
      `).join('')}
    </div>
  `;

  panel.querySelectorAll('.bm-symptom-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      if (chip.classList.contains('selected')) {
         chip.style.background = region.color;
         chip.style.borderColor = region.color;
         chip.style.color = '#fff';
      } else {
         chip.style.background = 'rgba(255,255,255,0.05)';
         chip.style.borderColor = 'var(--border)';
         chip.style.color = 'var(--text-main)';
      }
      if (callback) callback(chip.dataset.symptom, chip.classList.contains('selected'));
    });
  });
}

function showRegionTooltip(regionKey, x, y) {
  const tip = document.getElementById('bodymap-tooltip');
  if (!tip || !BODY_REGIONS[regionKey]) return;
  const region = BODY_REGIONS[regionKey];
  tip.textContent = region.label;
  tip.style.borderColor = region.color;
  tip.style.left = (x + 15) + 'px';
  tip.style.top = (y + 15) + 'px';
  tip.classList.remove('hidden');
}

function hideRegionTooltip() {
  document.getElementById('bodymap-tooltip')?.classList.add('hidden');
}

