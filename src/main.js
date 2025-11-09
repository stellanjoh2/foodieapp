/**
 * Main application entry point
 * Coordinates initialization, state management, and module communication
 */

import * as THREE from 'three';
import { initScene, startRenderLoop, getRenderer, getTopSpotlight } from './scene.js';
import { initModelLoader, loadModel } from './models.js';
import { initControls } from './controls.js';
import { initSelector, selectPrevious, selectNext, updateSelector, getSelectedItem, getSelectedIndex, getItemCount, addSpinImpulse } from './selector.js';
import { initPostProcessing, render as renderPostProcessing, setBloomEnabled, isBloomEnabled } from './postprocessing.js';
import { initOverlay, animateOverlaySelectionChange, updateOverlayContent, adjustQuantity } from './ui/overlay.js';
import { initShopkeeper } from './ui/shopkeeper.js';
import { getFoodDetailsByName } from './data/foodDetails.js';
import { loadSfx, playSfx } from './audio.js';
import { getPerformanceTier } from './utils.js';
import { initConfetti3D, spawnConfettiBurst, updateConfetti3D } from './confetti3d.js';

// Application state
const state = {
    initialized: false,
    lastFrameTime: performance.now(),
    audio: null,
    isMusicPlaying: false
};

const spotlightTarget = new THREE.Vector3();
const spotlightDesiredPosition = new THREE.Vector3();
let musicToggleButton = null;
const sfxCache = new Map();
const sfxLoads = new Map();
const SFX_CONFIG = {
    swipe: { path: 'Sounds/coin-4.wav', volume: 0.6 },
    cancel: { path: 'Sounds/cancel-1.wav', volume: 0.55 },
    ok: { path: 'Sounds/ok-2.wav', volume: 0.65 }
};

const loadingUIState = {
    screen: null,
    barFill: null,
    percentLabel: null,
    statusLabel: null,
    fakeTimer: null,
    fakeProgress: 0,
    actualProgress: 0,
    completed: false,
    displayComplete: false,
    hasError: false,
    startTime: 0,
    completionTimeout: null
};

/**
 * Initialize application
 */
async function init() {
    const container = document.getElementById('canvas-container');
    setupLoadingUI();
    setLoadingStatus('Loading kitchen assets…');
    updateLoadingProgress(0);

    // Prepare UI overlay (frosted panel) for future controls/info
    initOverlay();
        setupMusicToggle();
        document.addEventListener('overlay:quantity-change', handleQuantityChangeSound);
    initShopkeeper();

    try {
        // Initialize scene
        const { scene, camera } = initScene(container);
        initConfetti3D(scene);

        // Initialize model loader
        initModelLoader();

        // Load the GLB model
        // Path is relative to loader.setPath('3d-assets/')
        await loadModel('fast_food_stylized.glb', updateLoadingProgress);

        setLoadingStatus('Plating the menu…');

        // Initialize item selector (will extract and layout items)
        await initSelector(scene, camera);
        updateLoadingProgress(0.92);

        setLoadingStatus('Polishing controls…');

        // Initialize controls (keyboard and gamepad)
        initControls(
            container,
            handleNavigateLeft,   // onNavigateLeft
            handleNavigateRight,  // onNavigateRight
            null,                 // onRotate (optional)
            null,                 // onSelect (optional)
            toggleMusic,          // onToggleMusic
            toggleBloom,          // onToggleBloom
            decrementOverlayQuantity, // onQuantityDecrement
            incrementOverlayQuantity  // onQuantityIncrement
        );
        updateLoadingProgress(0.96);
        
        // Initialize post-processing with quality profile
        const renderer = getRenderer();
        const performanceTier = getPerformanceTier();
        const postProcessingConfig = getPostProcessingConfig(performanceTier);
        const composer = initPostProcessing(renderer, scene, camera, postProcessingConfig);
        updateLoadingProgress(0.98);

        // Populate overlay with initial selection
        updateOverlayWithCurrent();

        // Start render loop with post-processing
        startRenderLoop(update, composer ? renderPostProcessing : null);
        
        state.initialized = true;
        state.lastFrameTime = performance.now();
        state.audio = createBackgroundAudio();
        preloadSfx('swipe');
        updateMusicToggleButton();
        
        setLoadingStatus('Opening the shop…');
        updateLoadingProgress(1);
        completeLoadingUI();

    } catch (error) {
        console.error('Failed to initialize application:', error);
        failLoadingUI('Unable to open the shop. Please refresh.');
    }
}

/**
 * Handle navigation left
 */
function handleNavigateLeft() {
    handleNavigation(-1);
}

/**
 * Handle navigation right
 */
function handleNavigateRight() {
    handleNavigation(1);
}

/**
 * Update loop (called each frame)
 */
function update() {
    if (!state.initialized) return;
    
    // Calculate delta time for smooth animations
    const currentTime = performance.now();
    const deltaTime = (currentTime - state.lastFrameTime) / 1000; // Convert to seconds
    state.lastFrameTime = currentTime;
    
    // Update selector (animations, scrolling, etc.)
    updateSelector(deltaTime);
    updateConfetti3D(deltaTime);

    const spotlight = getTopSpotlight();
    const selectedItem = getSelectedItem();
    if (spotlight && selectedItem && selectedItem.mesh) {
        const mesh = selectedItem.mesh;
        mesh.updateMatrixWorld(true);
        
        mesh.getWorldPosition(spotlightTarget);
        spotlightTarget.y += 0.35;
        
        spotlightDesiredPosition.copy(spotlightTarget);
        spotlightDesiredPosition.y += 2.6;
        
        const followEase = 1 - Math.exp(-12 * Math.min(deltaTime, 0.1));
        
        spotlight.position.lerp(spotlightDesiredPosition, followEase);
        spotlight.target.position.lerp(spotlightTarget, followEase);
        spotlight.target.updateMatrixWorld(true);
    }
}

function updateOverlayWithCurrent() {
    const selected = getSelectedItem();
    if (!selected) return;
    const details = getFoodDetailsByName(selected.name);
    updateOverlayContent(selected.name, details);
}

function createBackgroundAudio() {
    if (typeof Audio === 'undefined') {
        return null;
    }

    const audio = new Audio('Music/food-store.mp3');
    audio.loop = true;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.volume = 0.45;
    return audio;
}

function preloadSfx(key) {
    if (sfxCache.has(key)) {
        return Promise.resolve(sfxCache.get(key));
    }
    if (sfxLoads.has(key)) {
        return sfxLoads.get(key);
    }
    const config = SFX_CONFIG[key];
    if (!config) return Promise.resolve(null);
    const promise = loadSfx(config.path)
        .then((asset) => {
            sfxCache.set(key, asset);
            return asset;
        })
        .catch((error) => {
            console.warn(`Failed to load ${key} SFX:`, error);
            return null;
        })
        .finally(() => {
            sfxLoads.delete(key);
        });
    sfxLoads.set(key, promise);
    return promise;
}

function playSfxKey(key, overrides = {}) {
    if (!state.initialized) return;
    const config = SFX_CONFIG[key];
    if (!config) return;
    const trigger = (asset) => {
        if (asset) {
            playSfx(asset, { ...config, ...overrides });
        }
    };
    const cached = sfxCache.get(key);
    if (cached) {
        trigger(cached);
        return;
    }
    preloadSfx(key).then(trigger);
}

function playSwipeSound() {
    playSfxKey('swipe');
}

function playCancelSound() {
    playSfxKey('cancel');
}

function playOkSound(playbackRate = 1.0) {
    playSfxKey('ok', { playbackRate });
}

function toggleMusic() {
    if (!state.initialized || !ensureAudio()) return;

    if (state.isMusicPlaying) {
        state.audio.pause();
        updateMusicPlaying(false);
        return;
    }

    const playPromise = state.audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
        playPromise
            .then(() => updateMusicPlaying(true))
            .catch((error) => {
                console.warn('Music playback prevented:', error);
                updateMusicPlaying(false);
            });
    } else {
        updateMusicPlaying(true);
    }
}

function toggleBloom() {
    const currentlyEnabled = isBloomEnabled();
    const nextState = !currentlyEnabled;
    setBloomEnabled(nextState);
}

function handleQuantityChangeSound(event) {
    const detail = event.detail || {};
    if (!detail.action) return;
    if (detail.blocked) {
        playCancelSound();
        return;
    }
    if (detail.action === 'increment') {
        playOkSound(1.0);
        const selected = getSelectedItem();
        if (selected?.mesh) {
            addSpinImpulse(selected.mesh);
        }
        spawnConfettiBurst();
    } else if (detail.action === 'decrement') {
        playCancelSound();
    }
}

function incrementOverlayQuantity() {
    adjustQuantity('increment');
}

function decrementOverlayQuantity() {
    adjustQuantity('decrement');
}

function setupMusicToggle() {
    musicToggleButton = document.querySelector('[data-music-toggle]');
    if (!musicToggleButton) return;
    musicToggleButton.addEventListener('click', () => {
        toggleMusic();
    });
    updateMusicToggleButton();
}

function updateMusicToggleButton() {
    if (!musicToggleButton) return;
    const active = state.isMusicPlaying;
    musicToggleButton.setAttribute('aria-pressed', active ? 'true' : 'false');
    musicToggleButton.classList.toggle('is-active', active);
}

function handleNavigation(step) {
    if (!state.initialized) return;
    const index = getSelectedIndex();
    const atBoundary = step < 0 ? index <= 0 : index >= getItemCount() - 1;
    if (atBoundary) {
        playCancelSound();
        return;
    }
    animateOverlaySelectionChange();
    (step < 0 ? selectPrevious : selectNext)();
    updateOverlayWithCurrent();
    playSwipeSound();
}

function ensureAudio() {
    if (state.audio) return true;
    state.audio = createBackgroundAudio();
    return Boolean(state.audio);
}

function updateMusicPlaying(playing) {
    state.isMusicPlaying = playing;
    updateMusicToggleButton();
}

function getPostProcessingConfig(tier) {
    switch (tier) {
        case 'low':
            return {
                enabled: true,
                renderScale: 0.6,
                bloomStrength: 0.3,
                bloomRadius: 1.0,
                bloomThreshold: 0.95
            };
        case 'medium':
            return {
                enabled: true,
                renderScale: 0.75,
                bloomStrength: 0.47,
                bloomRadius: 1.5,
                bloomThreshold: 0.955
            };
        default:
            return {
                enabled: true,
                renderScale: 0.9,
                bloomStrength: 0.64,
                bloomRadius: 2.0,
                bloomThreshold: 0.96
            };
    }
}

function setupLoadingUI() {
    const screen = document.getElementById('loading-screen');
    const barFill = screen?.querySelector('[data-loading-bar]');
    const percentLabel = screen?.querySelector('[data-loading-percent]');
    const statusLabel = screen?.querySelector('[data-loading-status]');

    loadingUIState.screen = screen || null;
    loadingUIState.barFill = barFill || null;
    loadingUIState.percentLabel = percentLabel || null;
    loadingUIState.statusLabel = statusLabel || null;
    loadingUIState.fakeProgress = 0;
    loadingUIState.actualProgress = 0;
    loadingUIState.completed = false;
    loadingUIState.displayComplete = false;
    loadingUIState.hasError = false;
    loadingUIState.startTime = performance.now();

    if (loadingUIState.fakeTimer) {
        clearInterval(loadingUIState.fakeTimer);
    }
    if (loadingUIState.completionTimeout) {
        clearTimeout(loadingUIState.completionTimeout);
        loadingUIState.completionTimeout = null;
    }

    if (screen) {
        screen.classList.remove('is-complete', 'is-hidden', 'has-error');
        screen.style.removeProperty('pointer-events');
    }

    syncLoadingBar(0);

    loadingUIState.fakeTimer = window.setInterval(() => {
        if (loadingUIState.completed) return;
        loadingUIState.fakeProgress = Math.min(
            loadingUIState.fakeProgress + (Math.random() * 2 + 0.5),
            94
        );
        syncLoadingBar();
    }, 160);
}

function setLoadingStatus(message) {
    if (loadingUIState.statusLabel) {
        loadingUIState.statusLabel.textContent = message;
    }
}

function updateLoadingProgress(fraction) {
    if (!loadingUIState.screen) return;
    const clamped = Math.max(0, Math.min(1, fraction || 0));
    loadingUIState.actualProgress = Math.max(
        loadingUIState.actualProgress,
        clamped * 100
    );
    syncLoadingBar();
}

function completeLoadingUI() {
    if (!loadingUIState.screen || loadingUIState.completed) return;
    loadingUIState.completed = true;
    const finalize = () => {
        if (loadingUIState.fakeTimer) {
            clearInterval(loadingUIState.fakeTimer);
            loadingUIState.fakeTimer = null;
        }
        loadingUIState.displayComplete = true;
        syncLoadingBar(100);
        requestAnimationFrame(() => {
            loadingUIState.screen?.classList.add('is-complete');
        });
    };

    const elapsed = performance.now() - loadingUIState.startTime;
    const remaining = Math.max(0, 1000 - elapsed);

    if (remaining > 0) {
        loadingUIState.completionTimeout = window.setTimeout(() => {
            loadingUIState.completionTimeout = null;
            finalize();
        }, remaining);
    } else {
        finalize();
    }
}

function failLoadingUI(message) {
    if (loadingUIState.fakeTimer) {
        clearInterval(loadingUIState.fakeTimer);
        loadingUIState.fakeTimer = null;
    }
    if (loadingUIState.completionTimeout) {
        clearTimeout(loadingUIState.completionTimeout);
        loadingUIState.completionTimeout = null;
    }
    loadingUIState.completed = true;
    loadingUIState.hasError = true;
    if (loadingUIState.screen) {
        loadingUIState.screen.classList.add('has-error');
        loadingUIState.screen.classList.remove('is-complete');
    }
    if (loadingUIState.percentLabel) {
        loadingUIState.percentLabel.textContent = '—';
    }
    setLoadingStatus(message);
}

function syncLoadingBar(forceValue) {
    const value = forceValue !== undefined
        ? forceValue
        : (loadingUIState.displayComplete
            ? 100
            : Math.min(
                99,
                Math.max(loadingUIState.fakeProgress, loadingUIState.actualProgress)
            ));

    if (loadingUIState.barFill) {
        loadingUIState.barFill.style.width = `${value}%`;
    }
    if (loadingUIState.percentLabel) {
        loadingUIState.percentLabel.textContent = `${Math.round(value)}%`;
    }

    if (value >= 100 && loadingUIState.screen && !loadingUIState.hasError) {
        loadingUIState.screen.classList.add('is-complete');
        setTimeout(() => {
            loadingUIState.screen?.classList.add('is-hidden');
        }, 700);
    }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

