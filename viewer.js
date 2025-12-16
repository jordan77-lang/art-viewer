// Parthenon Cavalcade Viewer - Three.js Implementation
// Version 1.1 - Updated zoom controls
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ============================================
// CONFIGURATION & STATE
// ============================================
const CONFIG = {
    modelPath: './cavalcade_parthenon_marbles.glb',
    cameraFOV: 45,
    cameraNear: 0.1,
    cameraFar: 1000,
    initialCameraPosition: new THREE.Vector3(0, 2, 5),
    autoRotateSpeed: 0.5,
    lightingPresets: {
        neutral: { ambient: 0.5, directional: 1.0, exposure: 1.0, color: 0xffffff },
        warm: { ambient: 0.4, directional: 1.2, exposure: 1.1, color: 0xfff5e6 },
        cool: { ambient: 0.6, directional: 0.8, exposure: 0.9, color: 0xe6f0ff },
        dramatic: { ambient: 0.2, directional: 1.5, exposure: 1.2, color: 0xffe4c4 }
    }
};

// Annotations will be placed by clicking directly on the model
// Start empty - users add their own annotations on the actual geometry
const DEFAULT_ANNOTATIONS = [];

// Application State
const state = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    model: null,
    modelBoundingBox: null,
    autoRotate: false,
    currentLighting: 'neutral',
    annotations: [...DEFAULT_ANNOTATIONS],
    tourIndex: -1,
    isTourActive: false,
    isMeasuring: false,
    measurePoints: [],
    measureMarkers: [],
    measureLine: null,
    isAddingAnnotation: false,
    pendingAnnotationPosition: null,
    previewMarker: null,
    placedMarker: null,
    annotationMarkers: [],
    lights: {},
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2()
};

// ============================================
// INITIALIZATION
// ============================================
function init() {
    setupScene();
    setupCamera();
    setupRenderer();
    setupControls();
    setupLights();
    loadModel();
    setupEventListeners();
    animate();
}

function setupScene() {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x1a1a1a);
}

function setupCamera() {
    const container = document.getElementById('canvas-container');
    const aspect = container.clientWidth / container.clientHeight;
    
    state.camera = new THREE.PerspectiveCamera(
        CONFIG.cameraFOV,
        aspect,
        CONFIG.cameraNear,
        CONFIG.cameraFar
    );
    state.camera.position.copy(CONFIG.initialCameraPosition);
}

function setupRenderer() {
    const canvas = document.getElementById('viewer-canvas');
    
    state.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true // Required for screenshots
    });
    
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.setSize(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight);
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1.0;
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

function setupControls() {
    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.autoRotate = state.autoRotate;
    state.controls.autoRotateSpeed = CONFIG.autoRotateSpeed;
    state.controls.minDistance = 1;
    state.controls.maxDistance = 20;
    state.controls.target.set(0, 0.5, 0);
}

function setupLights() {
    // Ambient light
    state.lights.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    state.scene.add(state.lights.ambient);
    
    // Main directional light (sun-like)
    state.lights.directional = new THREE.DirectionalLight(0xffffff, 1.0);
    state.lights.directional.position.set(5, 10, 7);
    state.lights.directional.castShadow = true;
    state.lights.directional.shadow.mapSize.width = 2048;
    state.lights.directional.shadow.mapSize.height = 2048;
    state.lights.directional.shadow.camera.near = 0.5;
    state.lights.directional.shadow.camera.far = 50;
    state.scene.add(state.lights.directional);
    
    // Fill light
    state.lights.fill = new THREE.DirectionalLight(0xffffff, 0.3);
    state.lights.fill.position.set(-5, 5, -5);
    state.scene.add(state.lights.fill);
    
    // Rim light for edge definition
    state.lights.rim = new THREE.DirectionalLight(0xffffff, 0.2);
    state.lights.rim.position.set(0, 5, -10);
    state.scene.add(state.lights.rim);
}

// ============================================
// MODEL LOADING
// ============================================
function loadModel() {
    const loader = new GLTFLoader();
    
    // Optional: Setup Draco decoder for compressed models
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(dracoLoader);
    
    loader.load(
        CONFIG.modelPath,
        (gltf) => onModelLoaded(gltf),
        (progress) => onLoadProgress(progress),
        (error) => onLoadError(error)
    );
}

function onModelLoaded(gltf) {
    state.model = gltf.scene;
    
    // Calculate bounding box for proper framing
    const box = new THREE.Box3().setFromObject(state.model);
    state.modelBoundingBox = box;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Center the model
    state.model.position.sub(center);
    state.model.position.y += size.y / 2;
    
    // Enable shadows on all meshes
    state.model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Enhance material if needed
            if (child.material) {
                child.material.side = THREE.DoubleSide;
            }
        }
    });
    
    state.scene.add(state.model);
    
    // Adjust camera to fit model
    const maxDim = Math.max(size.x, size.y, size.z);
    const cameraDistance = maxDim * 2;
    state.camera.position.set(0, size.y * 0.5, cameraDistance);
    state.controls.target.set(0, size.y * 0.3, 0);
    state.controls.update();
    
    // Update controls limits based on model size - allow very close zoom
    state.controls.minDistance = maxDim * 0.1;
    state.controls.maxDistance = maxDim * 5;
    
    // Hide loading screen
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.add('hidden');
    
    // Initialize annotations
    updateAnnotationList();
    updateAnnotationLabels();
    updateTourProgress();
    
    console.log('Model loaded successfully');
}

function onLoadProgress(progress) {
    if (progress.total > 0) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        document.getElementById('progress-fill').style.width = `${percent}%`;
        document.getElementById('progress-text').textContent = `${percent}%`;
    }
}

function onLoadError(error) {
    console.error('Error loading model:', error);
    document.getElementById('loading-screen').innerHTML = `
        <div class="loader">
            <p style="color: #f44336;">Error loading model</p>
            <p style="font-size: 0.8rem; color: #888;">Please check that the GLB file exists</p>
        </div>
    `;
}

// ============================================
// LIGHTING CONTROLS
// ============================================
function setLightingPreset(preset) {
    const settings = CONFIG.lightingPresets[preset];
    if (!settings) return;
    
    state.currentLighting = preset;
    
    // Update lights
    state.lights.ambient.intensity = settings.ambient;
    state.lights.directional.intensity = settings.directional;
    state.lights.directional.color.setHex(settings.color);
    
    // Update renderer exposure
    state.renderer.toneMappingExposure = settings.exposure;
    
    // Update UI
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === preset);
    });
    
    // Update exposure slider
    document.getElementById('exposure-slider').value = settings.exposure;
}

function setExposure(value) {
    state.renderer.toneMappingExposure = parseFloat(value);
}

// ============================================
// ANNOTATION SYSTEM
// ============================================
function updateAnnotationList() {
    const list = document.getElementById('annotation-list');
    const countEl = document.getElementById('annotation-count');
    
    countEl.textContent = `(${state.annotations.length})`;
    
    if (state.annotations.length === 0) {
        list.innerHTML = '<p class="no-annotations">Click "Annotate" then click on the model to add annotations.</p>';
        return;
    }
    
    list.innerHTML = '';
    state.annotations.forEach((annotation, index) => {
        const card = document.createElement('div');
        card.className = `annotation-card ${state.tourIndex === index ? 'active' : ''}`;
        card.innerHTML = `
            <div class="annotation-card-header">
                <div class="annotation-card-number">${index + 1}</div>
                <div class="annotation-card-title">${annotation.title}</div>
                <button class="annotation-delete" title="Delete annotation">×</button>
            </div>
            <div class="annotation-card-description">${annotation.description}</div>
        `;
        
        // Click on card to focus
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('annotation-delete')) {
                focusAnnotation(index);
            }
        });
        
        // Click on X to delete
        const deleteBtn = card.querySelector('.annotation-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteAnnotation(index);
        });
        
        list.appendChild(card);
    });
}

function deleteAnnotation(index) {
    // Remove annotation from array
    state.annotations.splice(index, 1);
    
    // Renumber remaining annotations
    state.annotations.forEach((annotation, i) => {
        annotation.id = i + 1;
    });
    
    // Reset tour index if needed
    if (state.tourIndex >= state.annotations.length) {
        state.tourIndex = state.annotations.length - 1;
    }
    if (state.annotations.length === 0) {
        state.tourIndex = -1;
        document.getElementById('info-panel').classList.add('hidden');
    }
    
    // Update all UI
    updateAnnotationList();
    updateAnnotationLabels();
    update3DAnnotationMarkers();
    updateTourProgress();
}

function updateAnnotationLabels() {
    const container = document.getElementById('annotation-labels');
    container.innerHTML = '';
    
    state.annotations.forEach((annotation, index) => {
        const label = document.createElement('div');
        label.className = 'annotation-label';
        label.dataset.index = index;
        label.innerHTML = `
            <div class="annotation-dot ${state.tourIndex === index ? 'active' : ''}">${index + 1}</div>
        `;
        label.addEventListener('click', () => focusAnnotation(index));
        container.appendChild(label);
    });
}

function updateAnnotationPositions() {
    const container = document.getElementById('annotation-labels');
    const labels = container.querySelectorAll('.annotation-label');
    
    labels.forEach((label, index) => {
        const annotation = state.annotations[index];
        if (!annotation) return;
        
        // Project 3D position to 2D screen coordinates
        const pos = annotation.position.clone();
        pos.project(state.camera);
        
        // Check if annotation is in front of camera
        if (pos.z > 1) {
            label.style.display = 'none';
            return;
        }
        
        label.style.display = 'block';
        
        const rect = container.getBoundingClientRect();
        const x = (pos.x * 0.5 + 0.5) * rect.width;
        const y = (-pos.y * 0.5 + 0.5) * rect.height;
        
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
    });
}

function focusAnnotation(index) {
    const annotation = state.annotations[index];
    if (!annotation) return;
    
    state.tourIndex = index;
    
    // Show info panel
    document.getElementById('info-title').textContent = annotation.title;
    document.getElementById('info-description').textContent = annotation.description;
    document.getElementById('info-panel').classList.remove('hidden');
    
    // Animate camera to look at annotation
    const targetPosition = annotation.position.clone();
    const cameraOffset = new THREE.Vector3(0.5, 0.3, 1.5);
    const newCameraPos = targetPosition.clone().add(cameraOffset);
    
    // Smooth camera transition
    animateCamera(newCameraPos, targetPosition);
    
    // Update UI - highlight active card in footer
    updateAnnotationList();
    updateAnnotationLabels();
    updateTourProgress();
}

function animateCamera(newPosition, newTarget, duration = 1000) {
    const startPosition = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const startTime = performance.now();
    
    function update() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);
        
        state.camera.position.lerpVectors(startPosition, newPosition, eased);
        state.controls.target.lerpVectors(startTarget, newTarget, eased);
        state.controls.update();
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    update();
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// ============================================
// TOUR SYSTEM
// ============================================
function startTour() {
    if (state.annotations.length === 0) {
        alert('No annotations yet! Add some annotations first by clicking the "Annotate" button and clicking on the model.');
        return;
    }
    
    state.isTourActive = true;
    state.tourIndex = 0;
    focusAnnotation(0);
    
    document.getElementById('btn-tour-start').innerHTML = `
        <span class="icon">⏹</span>
        <span>End Tour</span>
    `;
}

function endTour() {
    state.isTourActive = false;
    state.tourIndex = -1;
    document.getElementById('info-panel').classList.add('hidden');
    updateTourProgress();
    updateAnnotationLabels();
    
    document.getElementById('btn-tour-start').innerHTML = `
        <span class="icon">🎓</span>
        <span>Start Tour</span>
    `;
}

function nextTourStop() {
    if (state.tourIndex < state.annotations.length - 1) {
        focusAnnotation(state.tourIndex + 1);
    }
}

function prevTourStop() {
    if (state.tourIndex > 0) {
        focusAnnotation(state.tourIndex - 1);
    }
}

function updateTourProgress() {
    const total = state.annotations.length;
    const current = state.tourIndex >= 0 ? state.tourIndex + 1 : 0;
    
    document.getElementById('tour-progress').textContent = `${current} / ${total}`;
    document.getElementById('btn-tour-prev').disabled = state.tourIndex <= 0;
    document.getElementById('btn-tour-next').disabled = state.tourIndex >= total - 1 || state.tourIndex < 0;
}

// ============================================
// MEASUREMENT TOOL
// ============================================
function toggleMeasureMode() {
    state.isMeasuring = !state.isMeasuring;
    clearMeasurement();
    
    document.getElementById('btn-measure').classList.toggle('active', state.isMeasuring);
    document.getElementById('measurement-display').classList.toggle('hidden', !state.isMeasuring);
    
    if (state.isMeasuring) {
        state.renderer.domElement.style.cursor = 'crosshair';
    } else {
        state.renderer.domElement.style.cursor = 'grab';
    }
}

function clearMeasurement() {
    state.measurePoints = [];
    
    // Remove markers
    state.measureMarkers.forEach(marker => state.scene.remove(marker));
    state.measureMarkers = [];
    
    // Remove line
    if (state.measureLine) {
        state.scene.remove(state.measureLine);
        state.measureLine = null;
    }
    
    document.getElementById('measurement-result').textContent = '';
}

function addMeasurePoint(point) {
    // Create marker sphere
    const geometry = new THREE.SphereGeometry(0.02, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xC9A227 });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(point);
    state.scene.add(marker);
    state.measureMarkers.push(marker);
    
    state.measurePoints.push(point.clone());
    
    if (state.measurePoints.length === 2) {
        // Calculate and display distance
        const distance = state.measurePoints[0].distanceTo(state.measurePoints[1]);
        document.getElementById('measurement-result').textContent = 
            `Distance: ${distance.toFixed(3)} units`;
        
        // Draw line between points
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(state.measurePoints);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xC9A227, linewidth: 2 });
        state.measureLine = new THREE.Line(lineGeometry, lineMaterial);
        state.scene.add(state.measureLine);
    }
}

// ============================================
// ADD ANNOTATION MODE
// ============================================
function createAnnotationMarker(position, index, isPreview = false) {
    // Create a 3D marker that hovers over the model surface
    const group = new THREE.Group();
    
    // Size multiplier for preview (make it bigger and more visible)
    const scale = isPreview ? 1.5 : 1.0;
    
    // Main sphere
    const sphereGeometry = new THREE.SphereGeometry(0.035 * scale, 32, 32);
    const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: isPreview ? 0x00ff00 : 0xC9A227,
        transparent: true,
        opacity: isPreview ? 0.9 : 1.0
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    group.add(sphere);
    
    // Outer ring for visibility
    const ringGeometry = new THREE.RingGeometry(0.045 * scale, 0.06 * scale, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: isPreview ? 0x00ff00 : 0xffffff, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.lookAt(state.camera.position);
    group.add(ring);
    
    // Pin/line going to surface
    const pinGeometry = new THREE.CylinderGeometry(0.005 * scale, 0.005 * scale, 0.06 * scale, 8);
    const pinMaterial = new THREE.MeshBasicMaterial({ color: isPreview ? 0x00ff00 : 0xffffff });
    const pin = new THREE.Mesh(pinGeometry, pinMaterial);
    pin.position.y = -0.03 * scale;
    group.add(pin);
    
    // Position slightly above the surface
    group.position.copy(position);
    group.position.y += 0.06 * scale; // Lift above surface
    
    group.userData = { index, isPreview };
    
    return group;
}

function update3DAnnotationMarkers() {
    // Remove old markers
    state.annotationMarkers.forEach(marker => state.scene.remove(marker));
    state.annotationMarkers = [];
    
    // Create new markers for each annotation
    state.annotations.forEach((annotation, index) => {
        const marker = createAnnotationMarker(annotation.position, index);
        state.scene.add(marker);
        state.annotationMarkers.push(marker);
    });
}

function toggleAddAnnotationMode() {
    state.isAddingAnnotation = !state.isAddingAnnotation;
    
    document.getElementById('btn-add-annotation').classList.toggle('active', state.isAddingAnnotation);
    document.getElementById('annotation-modal').classList.toggle('hidden', !state.isAddingAnnotation);
    
    if (state.isAddingAnnotation) {
        state.renderer.domElement.style.cursor = 'crosshair';
        state.pendingAnnotationPosition = null;
        document.getElementById('btn-save-annotation').disabled = true;
        document.getElementById('annotation-title').value = '';
        document.getElementById('annotation-description').value = '';
        document.getElementById('annotation-instruction').textContent = 'Click on the model to place your marker';
        document.getElementById('annotation-instruction').style.color = '';
        
        // Create preview marker (hidden initially)
        if (state.previewMarker) {
            state.scene.remove(state.previewMarker);
        }
        state.previewMarker = createAnnotationMarker(new THREE.Vector3(0, -1000, 0), -1, true);
        state.previewMarker.visible = false;
        state.scene.add(state.previewMarker);
    } else {
        state.renderer.domElement.style.cursor = 'grab';
        // Remove preview marker
        if (state.previewMarker) {
            state.scene.remove(state.previewMarker);
            state.previewMarker = null;
        }
        // Remove placed marker
        if (state.placedMarker) {
            state.scene.remove(state.placedMarker);
            state.placedMarker = null;
        }
    }
}

function updatePreviewMarker(point) {
    if (state.previewMarker && point) {
        state.previewMarker.position.copy(point);
        state.previewMarker.position.y += 0.05;
        state.previewMarker.visible = true;
    }
}

function setAnnotationPosition(point) {
    state.pendingAnnotationPosition = point.clone();
    document.getElementById('btn-save-annotation').disabled = false;
    document.getElementById('annotation-instruction').textContent = '✓ Point selected! Now enter details below.';
    document.getElementById('annotation-instruction').style.color = '#4CAF50';
    document.getElementById('annotation-title').focus();
    
    // Hide the hover preview marker
    if (state.previewMarker) {
        state.previewMarker.visible = false;
    }
    
    // Create/update the placed marker (shows where annotation will be)
    if (state.placedMarker) {
        state.scene.remove(state.placedMarker);
    }
    state.placedMarker = createPlacedMarker(point);
    state.scene.add(state.placedMarker);
}

function createPlacedMarker(position) {
    // Create a pulsing marker to show where annotation is placed
    const group = new THREE.Group();
    
    // Main sphere - bright green
    const sphereGeometry = new THREE.SphereGeometry(0.04, 32, 32);
    const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 1.0
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    group.add(sphere);
    
    // Outer ring - white
    const ringGeometry = new THREE.RingGeometry(0.055, 0.07, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    group.add(ring);
    
    // Second outer ring - green glow effect
    const outerRingGeometry = new THREE.RingGeometry(0.08, 0.1, 32);
    const outerRingMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5
    });
    const outerRing = new THREE.Mesh(outerRingGeometry, outerRingMaterial);
    group.add(outerRing);
    
    // Pin/line going to surface
    const pinGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.08, 8);
    const pinMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const pin = new THREE.Mesh(pinGeometry, pinMaterial);
    pin.position.y = -0.04;
    group.add(pin);
    
    // Position above surface
    group.position.copy(position);
    group.position.y += 0.1;
    
    group.userData = { isPlaced: true };
    
    return group;
}

function saveAnnotation() {
    const title = document.getElementById('annotation-title').value.trim();
    const description = document.getElementById('annotation-description').value.trim();
    
    if (!title || !state.pendingAnnotationPosition) return;
    
    const newAnnotation = {
        id: state.annotations.length + 1,
        title,
        description: description || 'No description provided.',
        position: state.pendingAnnotationPosition.clone()
    };
    
    state.annotations.push(newAnnotation);
    
    // Remove the placed marker before creating the permanent one
    if (state.placedMarker) {
        state.scene.remove(state.placedMarker);
        state.placedMarker = null;
    }
    
    updateAnnotationList();
    updateAnnotationLabels();
    update3DAnnotationMarkers();
    updateTourProgress();
    
    toggleAddAnnotationMode();
}

function cancelAnnotation() {
    toggleAddAnnotationMode();
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function toggleAutoRotate() {
    state.autoRotate = !state.autoRotate;
    state.controls.autoRotate = state.autoRotate;
    document.getElementById('btn-auto-rotate').classList.toggle('active', state.autoRotate);
}

function resetView() {
    if (!state.modelBoundingBox) return;
    
    const size = state.modelBoundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const newPosition = new THREE.Vector3(0, size.y * 0.5, maxDim * 2);
    const newTarget = new THREE.Vector3(0, size.y * 0.3, 0);
    
    animateCamera(newPosition, newTarget);
}

function takeScreenshot() {
    // First render the 3D scene to make sure it's up to date
    state.renderer.render(state.scene, state.camera);
    
    // Use html2canvas to capture the full window (excluding control panel)
    if (typeof html2canvas !== 'undefined') {
        // Temporarily hide the control panel
        const controlPanel = document.querySelector('.control-panel');
        controlPanel.style.display = 'none';
        
        html2canvas(document.getElementById('app'), {
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#1a1a1a'
        }).then(canvas => {
            // Restore the control panel
            controlPanel.style.display = '';
            
            const link = document.createElement('a');
            link.download = `parthenon-cavalcade-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(() => {
            // Restore control panel on error
            controlPanel.style.display = '';
        });
    } else {
        // Fallback to just the 3D canvas if html2canvas isn't loaded
        const dataURL = state.renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `parthenon-cavalcade-${Date.now()}.png`;
        link.href = dataURL;
        link.click();
    }
}

function toggleFullscreen() {
    const container = document.getElementById('canvas-container');
    
    if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => {
            console.log('Fullscreen error:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height);
}

// ============================================
// RAYCASTING & INTERACTION
// ============================================
function getMousePosition(event) {
    const rect = state.renderer.domElement.getBoundingClientRect();
    state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function onCanvasClick(event) {
    if (!state.model) return;
    
    getMousePosition(event);
    state.raycaster.setFromCamera(state.mouse, state.camera);
    
    // First check if clicking on an annotation marker
    if (!state.isMeasuring && !state.isAddingAnnotation && state.annotationMarkers.length > 0) {
        const markerIntersects = state.raycaster.intersectObjects(state.annotationMarkers, true);
        if (markerIntersects.length > 0) {
            // Find the parent group to get the index
            let obj = markerIntersects[0].object;
            while (obj.parent && obj.userData.index === undefined) {
                obj = obj.parent;
            }
            if (obj.userData.index !== undefined && !obj.userData.isPreview) {
                focusAnnotation(obj.userData.index);
                return;
            }
        }
    }
    
    // Then check model intersection
    const intersects = state.raycaster.intersectObject(state.model, true);
    
    if (intersects.length > 0) {
        const point = intersects[0].point;
        
        if (state.isMeasuring && state.measurePoints.length < 2) {
            addMeasurePoint(point);
        } else if (state.isAddingAnnotation) {
            setAnnotationPosition(point);
        }
    }
}

function onCanvasMouseMove(event) {
    if (!state.model) return;
    if (!state.isAddingAnnotation) return;
    
    getMousePosition(event);
    state.raycaster.setFromCamera(state.mouse, state.camera);
    const intersects = state.raycaster.intersectObject(state.model, true);
    
    if (intersects.length > 0 && state.previewMarker) {
        const point = intersects[0].point;
        state.previewMarker.position.copy(point);
        state.previewMarker.position.y += 0.09; // Lift above surface (1.5x scale)
        state.previewMarker.visible = true;
    } else if (state.previewMarker) {
        state.previewMarker.visible = false;
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Window resize
    window.addEventListener('resize', onWindowResize);
    
    // Canvas interaction
    state.renderer.domElement.addEventListener('click', onCanvasClick);
    state.renderer.domElement.addEventListener('mousemove', onCanvasMouseMove);
    
    // View controls
    document.getElementById('btn-auto-rotate').addEventListener('click', toggleAutoRotate);
    document.getElementById('btn-reset-view').addEventListener('click', resetView);
    
    // Tools
    document.getElementById('btn-add-annotation').addEventListener('click', toggleAddAnnotationMode);
    document.getElementById('btn-screenshot').addEventListener('click', takeScreenshot);
    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
    
    // Tour controls
    document.getElementById('btn-tour-start').addEventListener('click', () => {
        if (state.isTourActive) {
            endTour();
        } else {
            startTour();
        }
    });
    document.getElementById('btn-tour-prev').addEventListener('click', prevTourStop);
    document.getElementById('btn-tour-next').addEventListener('click', nextTourStop);
    
    // Info panel
    document.getElementById('info-close').addEventListener('click', () => {
        document.getElementById('info-panel').classList.add('hidden');
    });
    
    // Annotation modal
    document.getElementById('btn-cancel-annotation').addEventListener('click', cancelAnnotation);
    document.getElementById('btn-save-annotation').addEventListener('click', saveAnnotation);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        switch(e.key) {
            case 'r':
                toggleAutoRotate();
                break;
            case 'f':
                toggleFullscreen();
                break;
            case 's':
                if (e.ctrlKey) {
                    e.preventDefault();
                    takeScreenshot();
                }
                break;
            case 'Escape':
                if (state.isAddingAnnotation) cancelAnnotation();
                if (state.isTourActive) endTour();
                break;
            case 'ArrowRight':
                if (state.isTourActive) nextTourStop();
                break;
            case 'ArrowLeft':
                if (state.isTourActive) prevTourStop();
                break;
        }
    });
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls
    state.controls.update();
    
    // Update annotation label positions (2D overlay)
    updateAnnotationPositions();
    
    // Make 3D annotation markers face the camera (billboard effect)
    state.annotationMarkers.forEach(marker => {
        marker.children.forEach(child => {
            if (child.geometry && child.geometry.type === 'RingGeometry') {
                child.lookAt(state.camera.position);
            }
        });
    });
    
    // Also update preview marker to face camera
    if (state.previewMarker) {
        state.previewMarker.children.forEach(child => {
            if (child.geometry && child.geometry.type === 'RingGeometry') {
                child.lookAt(state.camera.position);
            }
        });
    }
    
    // Render
    state.renderer.render(state.scene, state.camera);
}

// ============================================
// START APPLICATION
// ============================================
document.addEventListener('DOMContentLoaded', init);
