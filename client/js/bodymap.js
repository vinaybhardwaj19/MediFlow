/**
 * bodymap.js — Interactive 3D Digital Twin (Three.js)
 * Features 12 unique structures: 4 Patient Profiles x 3 Anatomical Systems.
 * Advanced UI: X-Ray Depth Slider, Micro-Animations, Pulse Heatmaps, and Voice Nav.
 */

import { speakText } from './voice-nav.js';
import { getState } from './store.js';

const BODY_REGIONS = {
  head: {
    label: 'Head & Brain',
    symptoms: ['headache','severe headache','migraine','dizziness','blurred vision','light sensitivity','confusion','memory loss','facial drooping'],
    color: '#f43f5e',
    image: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&w=200&q=80',
    targetPosition: { x: 0, y: 7.5, z: 10 },
    targetLookAt: { x: 0, y: 7.5, z: 0 }
  },
  chest: {
    label: 'Chest & Heart',
    symptoms: ['chest pain','chest tightness','shortness of breath','palpitations','irregular heartbeat','coughing blood','difficulty breathing'],
    color: '#ef4444',
    image: 'https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?auto=format&fit=crop&w=200&q=80',
    targetPosition: { x: 0, y: 4.5, z: 12 },
    targetLookAt: { x: 0, y: 4.5, z: 0 }
  },
  abdomen: {
    label: 'Abdomen & Stomach',
    symptoms: ['abdominal pain','nausea','vomiting','bloating','acid reflux','blood in stool','diarrhea','constipation'],
    color: '#f59e0b',
    image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=200&q=80',
    targetPosition: { x: 0, y: 1.5, z: 12 },
    targetLookAt: { x: 0, y: 1.5, z: 0 }
  },
  arms: {
    label: 'Arms & Hands',
    symptoms: ['arm weakness','shoulder pain','numbness','tingling','joint pain','swelling'],
    color: '#0ea5e9',
    image: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=200&q=80',
    targetPosition: { x: 0, y: 3.0, z: 15 },
    targetLookAt: { x: 0, y: 3.0, z: 0 }
  },
  legs: {
    label: 'Legs & Feet',
    symptoms: ['knee pain','leg numbness','back pain','hip pain','difficulty walking','ankle swelling','joint pain'],
    color: '#8b5cf6',
    image: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=200&q=80',
    targetPosition: { x: 0, y: -3.5, z: 15 },
    targetLookAt: { x: 0, y: -3.5, z: 0 }
  },
  skin: {
    label: 'Dermatology (Skin)',
    symptoms: ['skin rash','itching','redness','hives','eczema','dry skin','acne','hair loss','mole changes'],
    color: '#10b981',
    image: 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=200&q=80',
    targetPosition: { x: 0, y: 2.0, z: 22 },
    targetLookAt: { x: 0, y: 2.0, z: 0 }
  },
  mind: {
    label: 'Mental Health',
    symptoms: ['depression','anxiety','insomnia','panic attacks','mood swings','hopelessness','hallucinations'],
    color: '#a78bfa',
    image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=200&q=80',
    targetPosition: { x: 0, y: 7.5, z: 10 },
    targetLookAt: { x: 0, y: 7.5, z: 0 }
  },
};

const PROFILES = {
  man: { scaleY: 1.1, scaleX: 1.15, yOffset: 0.5, headScale: 1.0 },
  woman: { scaleY: 1.0, scaleX: 0.9, yOffset: 0, headScale: 1.0 },
  boy: { scaleY: 0.7, scaleX: 0.75, yOffset: -1.5, headScale: 1.25 },
  girl: { scaleY: 0.65, scaleX: 0.65, yOffset: -1.7, headScale: 1.25 }
};

let scene, camera, renderer, raycaster, mouse, controls;
let clock;
let hitboxMeshes = [];
let rootVisualGroup, skinGroup, skeletalGroup, nervousGroup;
let hitboxGroup;
let selectedRegion = null;
let activeSymptom = null; // For heatmaps
let animationFrameId;

let currentProfile = 'man';
let xrayDepth = 0.0; // 0.0 = Skin, 0.5 = Skeletal, 1.0 = Nervous

// Camera Animation State
let isAnimatingCamera = false;
let targetCameraPos = new THREE.Vector3();
let targetControlsLookAt = new THREE.Vector3();

let symptomsCallback = null;

export function initBodyMap(onSymptomsSelected) {
  symptomsCallback = onSymptomsSelected;
  const container = document.getElementById('bodymap-container');
  if (!container) return;

  // Auto-detect profile from logged in user if available
  const user = getState('user');
  if (user) {
    const isChild = user.age && parseInt(user.age) < 18;
    const gender = (user.gender || 'male').toLowerCase();
    if (gender.includes('female') || gender.includes('woman') || gender.includes('girl')) {
      currentProfile = isChild ? 'girl' : 'woman';
    } else {
      currentProfile = isChild ? 'boy' : 'man';
    }
  }

  container.innerHTML = '';
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  clock = new THREE.Clock();

  scene = new THREE.Scene();
  scene.background = null; 
  scene.fog = new THREE.FogExp2(0x0a0f1c, 0.02);

  const rect = container.getBoundingClientRect();
  camera = new THREE.PerspectiveCamera(45, rect.width / rect.height || 1, 0.1, 1000);
  camera.position.set(0, 2, 25);

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(rect.width || 300, rect.height || 500);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  if (window.THREE.OrbitControls) {
     controls = new window.THREE.OrbitControls(camera, renderer.domElement);
     controls.enableDamping = true;
     controls.dampingFactor = 0.05;
     controls.minDistance = 5;
     controls.maxDistance = 40;
     controls.target.set(0, 2, 0);
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(10, 20, 15);
  scene.add(directionalLight);

  const backLight = new THREE.PointLight(0x3b82f6, 1.5);
  backLight.position.set(-10, 10, -10);
  scene.add(backLight);

  rootVisualGroup = new THREE.Group();
  scene.add(rootVisualGroup);

  skinGroup = new THREE.Group();
  skeletalGroup = new THREE.Group();
  nervousGroup = new THREE.Group();
  rootVisualGroup.add(skinGroup, skeletalGroup, nervousGroup);

  hitboxGroup = new THREE.Group();
  scene.add(hitboxGroup);

  buildAllModels();

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  function onMouseMove(event) {
    if (isAnimatingCamera) return; // Prevent raycasting during auto-pan

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(hitboxMeshes);
    
    // Reset highlights if no region or symptom is actively selected
    if (!selectedRegion) {
        rootVisualGroup.children.forEach(group => {
            group.children.forEach(mesh => {
                if (mesh.userData.isHighlightable) {
                    mesh.material.emissive.setHex(0x000000);
                }
            });
        });
    }

    if (intersects.length > 0) {
       document.body.style.cursor = 'pointer';
       const region = intersects[0].object.userData.region;
       
       if (!selectedRegion) {
           rootVisualGroup.children.forEach(group => {
               group.children.forEach(mesh => {
                   if (mesh.userData.region === region && mesh.userData.isHighlightable) {
                       mesh.material.emissive.setHex(0x1e3a8a); // Subtle hover glow
                   }
               });
           });
       }
       showRegionTooltip(region, event.clientX, event.clientY);
    } else {
       document.body.style.cursor = 'default';
       hideRegionTooltip();
    }
  }

  function onClick(event) {
     if (isAnimatingCamera) return;

     raycaster.setFromCamera(mouse, camera);
     const intersects = raycaster.intersectObjects(hitboxMeshes);
     
     if (intersects.length > 0) {
         const regionKey = intersects[0].object.userData.region;
         selectRegion(regionKey, BODY_REGIONS[regionKey], symptomsCallback);
     }
  }

  renderer.domElement.addEventListener('mousemove', onMouseMove, false);
  renderer.domElement.addEventListener('click', onClick, false);
  
  window.addEventListener('resize', () => {
      if(!container) return;
      const r = container.getBoundingClientRect();
      if(r.width && r.height) {
          camera.aspect = r.width / r.height;
          camera.updateProjectionMatrix();
          renderer.setSize(r.width, r.height);
      }
  });

  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    // 1. Camera Animation (Voice Nav / Auto Pan)
    if (isAnimatingCamera && controls) {
       camera.position.lerp(targetCameraPos, 0.05);
       controls.target.lerp(targetControlsLookAt, 0.05);
       if (camera.position.distanceTo(targetCameraPos) < 0.1) {
           isAnimatingCamera = false; // Reached target
       }
    }

    // 2. Micro-Animations
    // Breathing Chest (Slight scaling)
    const breathScale = 1.0 + Math.sin(time * 2) * 0.03;
    skinGroup.children.forEach(mesh => {
        if (mesh.userData.region === 'chest') mesh.scale.set(1, breathScale, breathScale);
    });
    skeletalGroup.children.forEach(mesh => {
        if (mesh.userData.region === 'chest' && mesh.userData.isRib) mesh.scale.set(breathScale, 1, breathScale);
    });

    // 3. X-Ray Opacity Blending & Heatmap Pulsing
    const pulseRed = (Math.sin(time * 6) * 0.5 + 0.5); // 0 to 1
    
    // Calculate global opacities based on slider depth (0.0 to 1.0)
    let skinOpacity = 0;
    let skeletonOpacity = 0;
    let nerveOpacity = 0;

    if (xrayDepth <= 0.5) {
        // Skin -> Skeleton
        skinOpacity = 1.0 - (xrayDepth * 2); // 1.0 to 0.0
        skeletonOpacity = xrayDepth * 2;     // 0.0 to 1.0
        nerveOpacity = 0.0;
    } else {
        // Skeleton -> Nervous
        skinOpacity = 0.0;
        skeletonOpacity = 1.0 - ((xrayDepth - 0.5) * 2); // 1.0 to 0.0
        nerveOpacity = (xrayDepth - 0.5) * 2;          // 0.0 to 1.0
    }

    // Apply Opacity & Heatmap Effects
    const applyLayerEffects = (group, baseOpacity) => {
        group.visible = baseOpacity > 0.01;
        if (!group.visible) return;

        group.children.forEach(mesh => {
            if (mesh.material) {
                // Base opacity logic
                let targetOpacity = baseOpacity;
                
                // If this region is selected, handle heatmap logic
                if (selectedRegion && mesh.userData.region === selectedRegion) {
                    if (activeSymptom) {
                        // High distress (Red Heatmap Pulse)
                        mesh.material.emissive.setHex(0xff0000);
                        mesh.material.emissiveIntensity = 0.5 + (pulseRed * 0.8);
                        targetOpacity = Math.max(targetOpacity, 0.8); // Ensure it's visible if in pain
                    } else {
                        // Just selected (Blue Glow)
                        mesh.material.emissive.setHex(0x3b82f6);
                        mesh.material.emissiveIntensity = 0.5;
                        targetOpacity = Math.max(targetOpacity, 0.5);
                    }
                } else if (mesh.userData.isHighlightable) {
                    // Reset non-selected
                    mesh.material.emissive.setHex(0x000000);
                    mesh.material.emissiveIntensity = 1.0;
                }

                // specific logic for nerves (they naturally pulse)
                if (group === nervousGroup && !selectedRegion) {
                    const localPulse = Math.sin(time * 3 + mesh.position.y) * 0.5 + 0.5;
                    mesh.material.opacity = targetOpacity * (0.4 + localPulse * 0.6);
                } else {
                    mesh.material.opacity = targetOpacity;
                }
            }
        });
    };

    applyLayerEffects(skinGroup, skinOpacity * 0.8); // Max skin opacity 0.8 so it looks holographic
    applyLayerEffects(skeletalGroup, skeletonOpacity * 0.9);
    applyLayerEffects(nervousGroup, nerveOpacity);

    if(controls) controls.update();
    renderer.render(scene, camera);
  }
  animate();

  buildUIOverlays(container);
}

function buildAllModels() {
    // Clear previous
    while(skinGroup.children.length > 0) skinGroup.remove(skinGroup.children[0]);
    while(skeletalGroup.children.length > 0) skeletalGroup.remove(skeletalGroup.children[0]);
    while(nervousGroup.children.length > 0) nervousGroup.remove(nervousGroup.children[0]);
    while(hitboxGroup.children.length > 0) hitboxGroup.remove(hitboxGroup.children[0]);
    hitboxMeshes = [];

    const prof = PROFILES[currentProfile];
    rootVisualGroup.scale.set(prof.scaleX, prof.scaleY, 1);
    rootVisualGroup.position.y = prof.yOffset;
    
    hitboxGroup.scale.set(prof.scaleX, prof.scaleY, 1);
    hitboxGroup.position.y = prof.yOffset;

    // Build Universal Hitboxes (Invisible)
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const createHitbox = (geo, x, y, z, region) => {
        const mesh = new THREE.Mesh(geo, hitboxMat);
        mesh.position.set(x, y, z);
        mesh.userData = { region };
        hitboxGroup.add(mesh);
        hitboxMeshes.push(mesh);
    };

    createHitbox(new THREE.BoxGeometry(2.5, 3.5, 2.5), 0, 7.5, 0, 'head'); // Head
    createHitbox(new THREE.BoxGeometry(4, 3.5, 2.5), 0, 4.2, 0, 'chest'); // Chest
    createHitbox(new THREE.BoxGeometry(3.5, 3, 2.5), 0, 1.5, 0, 'abdomen'); // Abdomen
    createHitbox(new THREE.BoxGeometry(1.5, 7, 1.5), -2.5, 3, 0, 'arms'); // L Arm
    createHitbox(new THREE.BoxGeometry(1.5, 7, 1.5), 2.5, 3, 0, 'arms'); // R Arm
    createHitbox(new THREE.BoxGeometry(1.8, 8, 1.8), -1, -3.5, 0, 'legs'); // L Leg
    createHitbox(new THREE.BoxGeometry(1.8, 8, 1.8), 1, -3.5, 0, 'legs'); // R Leg

    buildSkinSystem(prof);
    buildSkeletalSystem(prof);
    buildNervousSystem(prof);
}

function createVisualPart(parentGroup, geo, mat, x, y, z, region, extraData = {}) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.userData = { region: region, isHighlightable: true, ...extraData };
    parentGroup.add(mesh);
    return mesh;
}

function buildSkinSystem(prof) {
    const material = new THREE.MeshPhysicalMaterial({
        color: 0x0ea5e9, metalness: 0.1, roughness: 0.1, transmission: 0.9,
        transparent: true, opacity: 0.8, side: THREE.DoubleSide
    });

    const headGeo = new THREE.SphereGeometry(1.2, 32, 32);
    headGeo.scale(prof.headScale, prof.headScale, prof.headScale);
    createVisualPart(skinGroup, headGeo, material.clone(), 0, 7.5, 0, 'head');
    createVisualPart(skinGroup, new THREE.CylinderGeometry(0.5, 0.6, 1, 16), material.clone(), 0, 6.2, 0, 'chest'); // neck
    createVisualPart(skinGroup, new THREE.BoxGeometry(3.2, 2.8, 1.6), material.clone(), 0, 4.5, 0, 'chest');
    createVisualPart(skinGroup, new THREE.BoxGeometry(2.8, 2.2, 1.5), material.clone(), 0, 2.2, 0, 'abdomen');
    createVisualPart(skinGroup, new THREE.CylinderGeometry(0.5, 0.35, 4.5, 16), material.clone(), -2.2, 3.5, 0, 'arms');
    createVisualPart(skinGroup, new THREE.CylinderGeometry(0.5, 0.35, 4.5, 16), material.clone(), 2.2, 3.5, 0, 'arms');
    createVisualPart(skinGroup, new THREE.CylinderGeometry(0.6, 0.4, 5, 16), material.clone(), -0.9, -1.5, 0, 'legs');
    createVisualPart(skinGroup, new THREE.CylinderGeometry(0.6, 0.4, 5, 16), material.clone(), 0.9, -1.5, 0, 'legs');
}

function buildSkeletalSystem(prof) {
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8, metalness: 0.1, transparent: true });
    
    // Skull
    const skullGeo = new THREE.SphereGeometry(1.0, 16, 16);
    skullGeo.scale(prof.headScale, prof.headScale, prof.headScale);
    createVisualPart(skeletalGroup, skullGeo, boneMat.clone(), 0, 7.5, 0, 'head');

    // Spine & Ribs (Chest)
    createVisualPart(skeletalGroup, new THREE.CylinderGeometry(0.3, 0.3, 3, 8), boneMat.clone(), 0, 4.5, 0, 'chest'); 
    for(let i=0; i<5; i++) {
        const rib = new THREE.TorusGeometry(1.1 + (Math.sin(i)*0.2), 0.1, 8, 24, Math.PI);
        const ribMesh = createVisualPart(skeletalGroup, rib, boneMat.clone(), 0, 5.5 - (i*0.5), 0.3, 'chest', { isRib: true });
        ribMesh.rotation.x = Math.PI / 2;
    }

    // Pelvis (Abdomen)
    createVisualPart(skeletalGroup, new THREE.BoxGeometry(2.2, 1.2, 1), boneMat.clone(), 0, 2.0, 0, 'abdomen');

    // Arms
    createVisualPart(skeletalGroup, new THREE.CylinderGeometry(0.2, 0.15, 2, 8), boneMat.clone(), -2.2, 4.5, 0, 'arms'); // humerus
    createVisualPart(skeletalGroup, new THREE.CylinderGeometry(0.15, 0.1, 2, 8), boneMat.clone(), -2.2, 2.3, 0, 'arms'); // radius/ulna
    createVisualPart(skeletalGroup, new THREE.CylinderGeometry(0.2, 0.15, 2, 8), boneMat.clone(), 2.2, 4.5, 0, 'arms'); 
    createVisualPart(skeletalGroup, new THREE.CylinderGeometry(0.15, 0.1, 2, 8), boneMat.clone(), 2.2, 2.3, 0, 'arms'); 

    // Legs
    createVisualPart(skeletalGroup, new THREE.CylinderGeometry(0.25, 0.2, 2.5, 8), boneMat.clone(), -0.9, 0, 0, 'legs'); // femur
    createVisualPart(skeletalGroup, new THREE.CylinderGeometry(0.2, 0.15, 2.5, 8), boneMat.clone(), -0.9, -2.7, 0, 'legs'); // tibia
    createVisualPart(skeletalGroup, new THREE.CylinderGeometry(0.25, 0.2, 2.5, 8), boneMat.clone(), 0.9, 0, 0, 'legs'); 
    createVisualPart(skeletalGroup, new THREE.CylinderGeometry(0.2, 0.15, 2.5, 8), boneMat.clone(), 0.9, -2.7, 0, 'legs'); 
}

function buildNervousSystem(prof) {
    const nerveMat = new THREE.MeshBasicMaterial({ color: 0xfde047, wireframe: true, transparent: true });
    
    // Brain
    const brainGeo = new THREE.SphereGeometry(0.9, 12, 12);
    brainGeo.scale(prof.headScale, prof.headScale, prof.headScale);
    createVisualPart(nervousGroup, brainGeo, nerveMat.clone(), 0, 7.5, 0, 'head');

    // Spinal Cord
    createVisualPart(nervousGroup, new THREE.CylinderGeometry(0.15, 0.15, 5.5, 6), nerveMat.clone(), 0, 3.5, 0, 'chest');
    
    // Branching nerves
    const branchMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, transparent: true });
    
    const addNerves = (startX, startY, endX, endY, region, count) => {
        for(let i=0; i<count; i++) {
            const points = [];
            points.push(new THREE.Vector3(startX, startY, 0));
            points.push(new THREE.Vector3(startX + (endX-startX)/2 + (Math.random()-0.5), startY + (endY-startY)/2, (Math.random()-0.5)));
            points.push(new THREE.Vector3(endX + (Math.random()-0.5)*0.8, endY, (Math.random()-0.5)*0.8));
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geo, branchMat.clone());
            line.userData = { region: region, isHighlightable: true };
            nervousGroup.add(line);
        }
    };

    // Chest nerves
    addNerves(0, 4.5, 1.8, 4.5, 'chest', 12);
    addNerves(0, 4.5, -1.8, 4.5, 'chest', 12);
    
    // Abdomen nerves
    addNerves(0, 2.5, 1.5, 1.8, 'abdomen', 15);
    addNerves(0, 2.5, -1.5, 1.8, 'abdomen', 15);

    // Arms nerves
    addNerves(0, 5.0, -2.5, 0.5, 'arms', 10);
    addNerves(0, 5.0, 2.5, 0.5, 'arms', 10);

    // Legs nerves
    addNerves(0, 1.0, -1.2, -4.5, 'legs', 12);
    addNerves(0, 1.0, 1.2, -4.5, 'legs', 12);
}


function buildUIOverlays(container) {
   let tooltip = document.getElementById('bodymap-tooltip');
   if (!tooltip) {
       tooltip = document.createElement('div');
       tooltip.id = 'bodymap-tooltip';
       tooltip.className = 'bodymap-tooltip hidden';
       container.appendChild(tooltip);
   }

   let controlsUI = document.getElementById('bodymap-controls');
   if (!controlsUI) {
       controlsUI = document.createElement('div');
       controlsUI.id = 'bodymap-controls';
       controlsUI.className = 'bodymap-controls';
       controlsUI.style.cssText = 'position:absolute; top:20px; left:20px; display:flex; flex-direction:column; gap:20px; z-index:10; background:rgba(15, 23, 42, 0.75); padding:20px; border-radius:16px; border:1px solid rgba(255,255,255,0.1); backdrop-filter:blur(10px); width:280px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);';
       
       const profileHTML = `
           <div>
               <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:10px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Patient Profile</div>
               <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                   ${Object.keys(PROFILES).map(p => `<button class="btn btn-sm btn-outline profile-btn ${p===currentProfile?'active':''}" data-val="${p}" style="text-transform:capitalize;">${p}</button>`).join('')}
               </div>
           </div>
       `;

       const sliderHTML = `
           <div style="margin-top:10px;">
               <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:10px; text-transform:uppercase; letter-spacing:1px; font-weight:600; display:flex; justify-content:space-between;">
                   <span>Skin</span><span>Skeleton</span><span>Nerves</span>
               </div>
               <input type="range" id="xray-depth-slider" min="0" max="100" value="0" class="xray-slider" style="width:100%;">
           </div>
       `;
       
       const voiceActionHTML = `
           <div style="margin-top:10px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.1);">
               <button id="voice-nav-mock-btn" class="btn btn-outline" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px;">
                   <span style="font-size:1.2rem;">🎙️</span> Speak Issue
               </button>
           </div>
       `;

       controlsUI.innerHTML = profileHTML + sliderHTML + voiceActionHTML;
       container.appendChild(controlsUI);

       // Attach events
       controlsUI.querySelectorAll('.profile-btn').forEach(btn => {
           btn.addEventListener('click', (e) => {
               controlsUI.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
               e.target.classList.add('active');
               currentProfile = e.target.dataset.val;
               buildAllModels();
           });
       });

       const slider = document.getElementById('xray-depth-slider');
       slider.addEventListener('input', (e) => {
           xrayDepth = parseInt(e.target.value) / 100.0;
       });

       // Mock Voice command to trigger camera auto-pan
       document.getElementById('voice-nav-mock-btn').addEventListener('click', () => {
           const regions = Object.keys(BODY_REGIONS);
           const randomRegion = regions[Math.floor(Math.random() * regions.length)];
           
           speakText(`Zooming into ${BODY_REGIONS[randomRegion].label}`, 'en-US');
           
           // Trigger smooth camera animation
           isAnimatingCamera = true;
           const target = BODY_REGIONS[randomRegion];
           const prof = PROFILES[currentProfile];
           
           targetCameraPos.set(target.targetPosition.x, target.targetPosition.y + prof.yOffset, target.targetPosition.z);
           targetControlsLookAt.set(target.targetLookAt.x, target.targetLookAt.y + prof.yOffset, target.targetLookAt.z);
           
           // Also open the symptom panel automatically
           selectRegion(randomRegion, target, symptomsCallback);
       });
   }

   const extras = document.createElement('div');
   extras.className = 'bodymap-extras';
   extras.style.cssText = 'position:absolute; bottom:20px; left:20px; display:flex; gap:10px; z-index:10;';
   
   ['skin', 'mind'].forEach(key => {
     const r = BODY_REGIONS[key];
     const btn = document.createElement('button');
     btn.className = 'bodymap-extra-btn btn btn-outline btn-sm';
     btn.style.borderColor = r.color;
     btn.style.color = r.color;
     btn.textContent = key === 'skin' ? 'Dermatology' : 'Mental Health';
     btn.addEventListener('click', (e) => {
       selectExtraRegion(key, r, symptomsCallback, e);
     });
     extras.appendChild(btn);
   });
   container.appendChild(extras);

   let panel = document.getElementById('bodymap-symptom-panel');
   if (!panel) {
       panel = document.createElement('div');
       panel.id = 'bodymap-symptom-panel';
       panel.className = 'bodymap-symptom-panel hidden';
       panel.style.cssText = 'position:absolute; right:20px; top:20px; width:320px; max-height:90%; overflow-y:auto; background:rgba(15, 23, 42, 0.85); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:20px; box-shadow:0 20px 50px rgba(0,0,0,0.6); backdrop-filter:blur(12px); z-index:10;';
       container.appendChild(panel);
   }
}

function selectRegion(key, region, callback) {
  selectedRegion = key;
  activeSymptom = null; // reset heatmap
  showSymptomPanel(key, region, callback);
}

function selectExtraRegion(key, region, callback, event) {
  selectedRegion = key;
  activeSymptom = null;
  document.querySelectorAll('.bodymap-extra-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  showSymptomPanel(key, region, callback);
}

function showSymptomPanel(key, region, callback) {
  const panel = document.getElementById('bodymap-symptom-panel');
  if (!panel) return;

  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:15px;">
      <div style="display:flex; align-items:center; gap:12px;">
          <img src="${region.image}" alt="${region.label}" style="width:48px; height:48px; border-radius:10px; object-fit:cover; border:2px solid ${region.color};" />
          <div>
              <div style="font-weight:800; color:${region.color}; font-size:1.2rem; line-height:1.2;">${region.label}</div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Select symptom to map distress</div>
          </div>
      </div>
      <button id="close-symptom-panel" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:1.2rem;">&times;</button>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
      ${region.symptoms.map(s => `
        <button class="bm-symptom-chip" data-symptom="${s}" style="padding:8px 14px; border-radius:20px; font-size:0.85rem; cursor:pointer; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:var(--text-main); transition:all 0.2s;">
           ${s}
        </button>
      `).join('')}
    </div>
  `;

  document.getElementById('close-symptom-panel').addEventListener('click', () => {
      panel.classList.add('hidden');
      selectedRegion = null;
      activeSymptom = null;
      // Also reset camera to default
      isAnimatingCamera = true;
      targetCameraPos.set(0, 2, 25);
      targetControlsLookAt.set(0, 2, 0);
  });

  panel.querySelectorAll('.bm-symptom-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      // Toggle logic
      const isSelected = chip.classList.contains('selected');
      panel.querySelectorAll('.bm-symptom-chip').forEach(c => {
          c.classList.remove('selected');
          c.style.background = 'rgba(255,255,255,0.05)';
          c.style.borderColor = 'rgba(255,255,255,0.1)';
          c.style.color = 'var(--text-main)';
      });

      if (!isSelected) {
         chip.classList.add('selected');
         chip.style.background = region.color;
         chip.style.borderColor = region.color;
         chip.style.color = '#fff';
         activeSymptom = chip.dataset.symptom; // Triggers heatmap in render loop
      } else {
         activeSymptom = null;
      }
      
      if (callback) callback(chip.dataset.symptom, !isSelected);
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
