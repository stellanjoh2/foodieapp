/**
 * Main application entry point
 * Coordinates initialization, state management, and module communication
 */

import * as THREE from 'three';
import { initScene, startRenderLoop, getRenderer, getTopSpotlight, setEnvironmentReflectionIntensity, getLightingRegistry, getEnvironmentReflectionIntensity } from './scene.js';
import { initModelLoader, loadModel } from './models.js';
import { initControls } from './controls.js';
import { initSelector, selectPrevious, selectNext, updateSelector, getSelectedItem, getSelectedIndex, getItemCount, addSpinImpulse } from './selector.js';
import { initPostProcessing, render as renderPostProcessing, setBloomEnabled, isBloomEnabled, getBloomDebugSettings, setBloomDebugSettings } from './postprocessing.js';
import { initOverlay, animateOverlaySelectionChange, updateOverlayContent, adjustQuantity } from './ui/overlay.js';
import { initShopkeeper } from './ui/shopkeeper.js';
import { getFoodDetailsByName } from './data/foodDetails.js';
import { loadSfx, playSfx } from './audio.js';
import { getPerformanceTier } from './utils.js';
import { initConfetti3D, spawnConfettiBurst, updateConfetti3D } from './confetti3d.js';

let walletAmountEl = null;

// Application state
const state = {
    initialized: false,
    lastFrameTime: performance.now(),
    audio: null,
    isMusicPlaying: false,
    currentItemPrice: 0,
    wallet: {
        balance: 250,
        initial: 250
    }
};

const spotlightTarget = new THREE.Vector3();
const spotlightDesiredPosition = new THREE.Vector3();
let musicToggleButton = null;
const sfxCache = new Map();
const sfxLoads = new Map();
let lightingDebugPanel = null;
let lightingDebugStyle = null;
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
    walletAmountEl = document.querySelector('[data-wallet-amount]');
    updateWalletDisplay();
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
        setupLightingDebugTrigger();
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
    state.currentItemPrice = details?.price ?? 0;
    updateOverlayContent(selected.name, details);
}

function createBackgroundAudio() {
    if (typeof Audio === 'undefined') {
        return null;
    }

    const audio = new Audio('Music/pet-store.mp3');
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
    const action = detail.action;
    if (!action) return;

    if (detail.blocked) {
        if (action === 'increment') {
            playCancelSound();
        }
        return;
    }

    const price = Math.max(0, state.currentItemPrice || 0);

    if (action === 'increment') {
        if (price > 0) {
            state.wallet.balance = Math.max(0, state.wallet.balance - price);
        }
        playOkSound(1.0);
        const selected = getSelectedItem();
        if (selected?.mesh) {
            addSpinImpulse(selected.mesh);
        }
        spawnConfettiBurst();
    } else if (action === 'decrement') {
        if (price > 0) {
            state.wallet.balance = Math.min(state.wallet.initial, state.wallet.balance + price);
        }
        playCancelSound();
    }

    updateWalletDisplay();
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

function updateWalletDisplay() {
    if (!walletAmountEl) return;
    walletAmountEl.textContent = `$${Math.round(state.wallet.balance)}`;
    const indicator = walletAmountEl.closest('.wallet-indicator');
    if (indicator) {
        indicator.classList.toggle('is-empty', state.wallet.balance <= 0);
        indicator.classList.toggle('is-low', state.wallet.balance > 0 && state.wallet.balance < 100);
    }
}

function setupLightingDebugPanel() {
    const lights = getLightingRegistry();
    if (!lights.length) return;

    if (lightingDebugPanel) {
        lightingDebugPanel.remove();
        lightingDebugPanel = null;
    }
    if (lightingDebugStyle) {
        lightingDebugStyle.remove();
        lightingDebugStyle = null;
    }

    const panel = document.createElement('div');
    panel.className = 'lighting-debug-panel';
    panel.innerHTML = `
        <header class="lighting-debug-header">
            <span>Lighting Debug v2</span>
            <button type="button" class="lighting-debug-close" aria-label="Hide lighting debug">×</button>
        </header>
        <div class="lighting-debug-body"></div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .lighting-debug-panel {
            position: fixed;
            bottom: 1.5rem;
            left: 1.5rem;
            background: rgba(255, 255, 255, 0.94);
            border-radius: 16px;
            box-shadow: 0 18px 40px rgba(0,0,0,0.18);
            width: 320px;
            max-height: calc(100vh - 3rem);
            overflow: hidden auto;
            font-family: 'DynaPuff', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #533822;
            z-index: 9999;
        }
        .lighting-debug-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.8rem 1rem;
            background: rgba(240, 87, 58, 0.18);
            border-bottom: 1px solid rgba(0,0,0,0.08);
            font-weight: 600;
        }
        .lighting-debug-header button {
            border: none;
            background: transparent;
            color: inherit;
            font-size: 1.4rem;
            cursor: pointer;
            line-height: 1;
        }
        .lighting-debug-body {
            padding: 0.8rem 1rem 1rem;
            display: grid;
            gap: 1rem;
        }
        .lighting-debug-group {
            background: rgba(255,255,255,0.9);
            border: 1px solid rgba(0,0,0,0.06);
            border-radius: 12px;
            padding: 0.75rem;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
        }
        .lighting-debug-group h3 {
            margin: 0 0 0.6rem;
            font-size: 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 600;
        }
        .lighting-debug-field {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            font-size: 0.9rem;
            margin-bottom: 0.4rem;
        }
        .lighting-debug-field:last-child {
            margin-bottom: 0;
        }
        .lighting-debug-field label {
            flex: 0 0 80px;
            font-weight: 500;
        }
        .lighting-debug-field input[type="range"] {
            flex: 1;
            accent-color: #f0573a;
        }
        .lighting-debug-field input[type="color"] {
            flex: 0 0 44px;
            height: 28px;
            border: 1px solid rgba(0,0,0,0.1);
            border-radius: 8px;
            background: transparent;
            cursor: pointer;
        }
        .lighting-debug-value {
            font-variant-numeric: tabular-nums;
            min-width: 3.6ch;
            text-align: right;
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(panel);
    lightingDebugPanel = panel;
    lightingDebugStyle = style;

    const body = panel.querySelector('.lighting-debug-body');

    const createGroup = (descriptor) => {
        const { light, label, type } = descriptor;
        const group = document.createElement('div');
        group.className = 'lighting-debug-group';
        const groupId = `light-${descriptor.id}`;
        const minIntensity = Array.isArray(descriptor.intensityRange) ? descriptor.intensityRange[0] : (descriptor.minIntensity ?? 0);
        const maxIntensity = Array.isArray(descriptor.intensityRange) ? descriptor.intensityRange[1] : (descriptor.maxIntensity ?? 5);
        const intensityStep = descriptor.intensityStep ?? 0.01;
        group.innerHTML = `
            <h3>${label}<span>${type}</span></h3>
            <div class="lighting-debug-field">
                <label for="${groupId}-intensity">Intensity</label>
                <input id="${groupId}-intensity" type="range" min="${minIntensity}" max="${maxIntensity}" step="${intensityStep}" value="${light.intensity.toFixed(2)}">
                <span class="lighting-debug-value" data-value>${light.intensity.toFixed(2)}</span>
            </div>
            <div class="lighting-debug-field">
                <label for="${groupId}-color">Color</label>
                <input id="${groupId}-color" type="color" value="#${light.color.getHexString()}">
            </div>
        `;

        const intensityInput = group.querySelector(`#${groupId}-intensity`);
        const intensityValue = group.querySelector('[data-value]');
        intensityInput.addEventListener('input', () => {
            const value = Number(intensityInput.value);
            light.intensity = value;
            if (type === 'SpotLight') {
                light.visible = value > 0.01;
            }
            if (light.decay !== undefined && type === 'PointLight') {
                light.decay = 2.0;
            }
            intensityValue.textContent = value.toFixed(2);
        });
        if (type === 'SpotLight') {
            light.visible = light.intensity > 0.01;
        }

        const colorInput = group.querySelector(`#${groupId}-color`);
        colorInput.addEventListener('input', () => {
            light.color.set(colorInput.value);
        });

        body.appendChild(group);
    };

    lights.forEach(createGroup);

    const envGroup = document.createElement('div');
    envGroup.className = 'lighting-debug-group';
    const currentEnv = getEnvironmentReflectionIntensity();
    envGroup.innerHTML = `
        <h3>Environment<span>Reflection</span></h3>
        <div class="lighting-debug-field">
            <label for="env-intensity">Intensity</label>
            <input id="env-intensity" type="range" min="0" max="4" step="0.05" value="${currentEnv.toFixed(2)}">
            <span class="lighting-debug-value" data-value>${currentEnv.toFixed(2)}</span>
        </div>
    `;
    const envSlider = envGroup.querySelector('#env-intensity');
    const envValue = envGroup.querySelector('[data-value]');
    envSlider.addEventListener('input', () => {
        const value = Number(envSlider.value);
        envValue.textContent = value.toFixed(2);
        setEnvironmentReflectionIntensity(value);
    });
    body.appendChild(envGroup);

    const bloom = getBloomDebugSettings();
    const bloomGroup = document.createElement('div');
    bloomGroup.className = 'lighting-debug-group';
    const bloomActive = Boolean(bloom);
    const bloomStrength = bloom?.strength ?? 0;
    const bloomRadius = bloom?.radius ?? 0;
    const bloomThreshold = bloom?.threshold ?? 0.96;
    bloomGroup.innerHTML = `
        <h3>Bloom<span>Post FX</span></h3>
        <div class="lighting-debug-field">
            <label for="bloom-strength">Strength</label>
            <input id="bloom-strength" type="range" min="0" max="4" step="0.05" value="${bloomStrength.toFixed(2)}" ${bloomActive ? '' : 'disabled'}>
            <span class="lighting-debug-value" data-value-strength>${bloomStrength.toFixed(2)}</span>
        </div>
        <div class="lighting-debug-field">
            <label for="bloom-radius">Radius</label>
            <input id="bloom-radius" type="range" min="0" max="10" step="0.1" value="${bloomRadius.toFixed(1)}" ${bloomActive ? '' : 'disabled'}>
            <span class="lighting-debug-value" data-value-radius>${bloomRadius.toFixed(1)}</span>
        </div>
        <div class="lighting-debug-field">
            <label for="bloom-threshold">Threshold</label>
            <input id="bloom-threshold" type="range" min="0" max="1" step="0.01" value="${bloomThreshold.toFixed(2)}" ${bloomActive ? '' : 'disabled'}>
            <span class="lighting-debug-value" data-value-threshold>${bloomThreshold.toFixed(2)}</span>
        </div>
        ${bloomActive ? '' : '<p style="margin-top:0.5rem;font-size:0.85rem;color:#a25b39;">Bloom controls unavailable (effect disabled or not initialised).</p>'}
    `;

    const strengthInput = bloomGroup.querySelector('#bloom-strength');
    const radiusInput = bloomGroup.querySelector('#bloom-radius');
    const thresholdInput = bloomGroup.querySelector('#bloom-threshold');
    const strengthValue = bloomGroup.querySelector('[data-value-strength]');
    const radiusValue = bloomGroup.querySelector('[data-value-radius]');
    const thresholdValue = bloomGroup.querySelector('[data-value-threshold]');

    if (bloomActive) {
        strengthInput.addEventListener('input', () => {
            const strength = Number(strengthInput.value);
            strengthValue.textContent = strength.toFixed(2);
            setBloomDebugSettings({ strength });
        });
        radiusInput.addEventListener('input', () => {
            const radius = Number(radiusInput.value);
            radiusValue.textContent = radius.toFixed(1);
            setBloomDebugSettings({ radius });
        });
        thresholdInput.addEventListener('input', () => {
            const threshold = Number(thresholdInput.value);
            thresholdValue.textContent = threshold.toFixed(2);
            setBloomDebugSettings({ threshold });
        });
    }

    body.appendChild(bloomGroup);

    const closeButton = panel.querySelector('.lighting-debug-close');
    closeButton.addEventListener('click', () => {
        panel.remove();
        style.remove();
        lightingDebugPanel = null;
        lightingDebugStyle = null;
    });
}

function teardownLightingDebugPanel() {
    if (lightingDebugPanel) {
        lightingDebugPanel.remove();
        lightingDebugPanel = null;
    }
    if (lightingDebugStyle) {
        lightingDebugStyle.remove();
        lightingDebugStyle = null;
    }
}

function setupLightingDebugTrigger() {
    const togglePanel = () => {
        if (lightingDebugPanel) {
            teardownLightingDebugPanel();
        } else {
            setupLightingDebugPanel();
        }
    };

    window.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        if (event.key && event.key.toLowerCase() === 'l') {
            togglePanel();
        }
    });

    console.info('ℹ️ Press the "L" key to toggle the lighting debug panel.');
}

