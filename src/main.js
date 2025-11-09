/**
 * Main application entry point
 * Coordinates initialization, state management, and module communication
 */

import * as THREE from 'three';
import { initScene, startRenderLoop, getRenderer, getTopSpotlight, setEnvironmentReflectionIntensity, getLightingRegistry, getEnvironmentReflectionIntensity, getBackgroundGradientColors, setBackgroundGradientColors } from './scene.js';
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

    const getContrastColor = (hex) => {
        const clean = (hex || '').replace('#', '');
        if (clean.length !== 6) return '#ffffff';
        const r = parseInt(clean.substring(0, 2), 16);
        const g = parseInt(clean.substring(2, 4), 16);
        const b = parseInt(clean.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.6 ? '#2e1a12' : '#ffffff';
    };

    const setResetState = (button, { dirty = false, tint = null } = {}) => {
        if (!button) return;
        button.classList.toggle('is-dirty', !!dirty);
        if (dirty && tint) {
            button.style.background = tint;
            button.style.color = getContrastColor(tint);
        } else if (dirty) {
            button.style.background = '';
            button.style.color = '';
        } else {
            button.style.background = '';
            button.style.color = '';
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
            <span class="lighting-debug-title">Lighting Debug</span>
            <div class="lighting-debug-header-actions">
                <button type="button" class="lighting-debug-copy" data-action="copy-settings">Copy Settings</button>
                <button type="button" class="lighting-debug-close" aria-label="Hide lighting debug">×</button>
            </div>
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
        .lighting-debug-title {
            font-weight: 600;
            font-size: 1.05rem;
        }
        .lighting-debug-header-actions {
            display: flex;
            align-items: center;
            gap: 0.55rem;
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
            overflow-y: auto;
            max-height: calc(100vh - 7rem);
        }
        .lighting-debug-group {
            background: rgba(255,255,255,0.9);
            border: 1px solid rgba(0,0,0,0.06);
            border-radius: 12px;
            padding: 0.85rem 0.9rem 1rem;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
        }
        .lighting-debug-group h3 {
            margin: 0 0 0.75rem;
            font-size: 1.05rem;
            font-weight: 600;
        }
        .lighting-debug-field {
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
            font-size: 0.9rem;
            margin-bottom: 0.6rem;
        }
        .lighting-debug-field:last-child {
            margin-bottom: 0;
        }
        .lighting-debug-field label {
            font-weight: 500;
        }
        .lighting-debug-field-controls {
            display: grid;
            grid-template-columns: minmax(0,1fr) auto auto;
            align-items: center;
            gap: 0.55rem;
        }
        .lighting-debug-field input[type="range"] {
            flex: 1 1 auto;
            accent-color: #f0573a;
        }
        .lighting-debug-number {
            width: 4.4rem;
            padding: 0.25rem 0.35rem;
            border-radius: 8px;
            border: 1px solid rgba(0,0,0,0.12);
            background: rgba(255,255,255,0.9);
            font-family: inherit;
            font-size: 0.9rem;
            font-variant-numeric: tabular-nums;
            text-align: right;
        }
        .lighting-debug-reset {
            border: none;
            background: rgba(0,0,0,0.08);
            color: #8d7764;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.95rem;
            transition: background 140ms ease, transform 140ms ease;
        }
        .lighting-debug-reset:not(.is-dirty):hover {
            background: rgba(0,0,0,0.16);
        }
        .lighting-debug-reset:active {
            transform: scale(0.92);
        }
        .lighting-debug-reset.is-dirty {
            background: #f0573a;
            color: #ffffff;
        }
        .lighting-debug-hex {
            width: 6.4rem;
            padding: 0.25rem 0.35rem;
            border-radius: 8px;
            border: 1px solid rgba(0,0,0,0.12);
            background: rgba(255,255,255,0.9);
            font-family: inherit;
            font-size: 0.9rem;
            text-transform: uppercase;
            font-variant-numeric: tabular-nums;
        }
        .lighting-debug-hex.is-invalid {
            border-color: #d74b4b;
            box-shadow: 0 0 0 2px rgba(215,75,75,0.2);
        }
        .lighting-debug-field input[type="color"] {
            flex: 0 0 44px;
            height: 28px;
            border: 1px solid rgba(0,0,0,0.1);
            border-radius: 8px;
            background: transparent;
            cursor: pointer;
        }
        .lighting-debug-copy {
            border: none;
            background: rgba(240,87,58,0.18);
            color: #533822;
            padding: 0.45rem 0.75rem;
            border-radius: 999px;
            font-family: inherit;
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            transition: background 140ms ease, transform 140ms ease;
        }
        .lighting-debug-copy:hover {
            background: rgba(240,87,58,0.28);
        }
        .lighting-debug-copy:active {
            transform: translateY(1px);
        }
        .lighting-debug-copy.is-success {
            background: rgba(106,199,122,0.28);
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(panel);
    lightingDebugPanel = panel;
    lightingDebugStyle = style;

    const body = panel.querySelector('.lighting-debug-body');

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const formatNumber = (value, decimals = 2) => Number(value).toFixed(decimals);
    const normalizeHex = (value) => {
        let hex = String(value || '').trim();
        if (!hex) return null;
        if (!hex.startsWith('#')) hex = `#${hex}`;
        if (/^#([0-9a-f]{3})$/i.test(hex)) {
            const shorthand = hex.slice(1);
            hex = `#${shorthand.split('').map((c) => c + c).join('')}`;
        }
        if (!/^#([0-9a-f]{6})$/i.test(hex)) {
            return null;
        }
        return hex.toUpperCase();
    };
    const getContrastColor = (hex) => {
        const clean = (hex || '').replace('#', '');
        if (clean.length !== 6) return '#ffffff';
        const r = parseInt(clean.substring(0, 2), 16);
        const g = parseInt(clean.substring(2, 4), 16);
        const b = parseInt(clean.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.6 ? '#2e1a12' : '#ffffff';
    };
    const setResetState = (button, { dirty = false, tint = null } = {}) => {
        if (!button) return;
        button.classList.toggle('is-dirty', !!dirty);
        if (dirty && tint) {
            button.style.background = tint;
            button.style.color = getContrastColor(tint);
        } else if (dirty) {
            button.style.background = '';
            button.style.color = '';
        } else {
            button.style.background = '';
            button.style.color = '';
        }
    };

    const createRangeField = ({ label, min, max, step, value, original, decimals = 2, disabled = false, onChange }) => {
        const field = document.createElement('div');
        field.className = 'lighting-debug-field';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        field.appendChild(labelEl);

        const controls = document.createElement('div');
        controls.className = 'lighting-debug-field-controls';

        const range = document.createElement('input');
        range.type = 'range';
        range.min = min;
        range.max = max;
        range.step = step;
        range.value = value;
        range.disabled = disabled;

        const number = document.createElement('input');
        number.type = 'number';
        number.className = 'lighting-debug-number';
        number.min = min;
        number.max = max;
        number.step = step;
        number.value = formatNumber(value, decimals);
        number.disabled = disabled;

        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'lighting-debug-reset';
        reset.title = 'Reset to original value';
        reset.innerText = '×';
        reset.disabled = disabled;

        const originalValue = original ?? value;
        const tolerance = Math.max(Number(step) || 0.0001, 0.0001) * 0.35;

        const updateReset = (current) => {
            const dirty = Math.abs(current - originalValue) > tolerance;
            setResetState(reset, { dirty });
        };

        const applyValue = (inputValue) => {
            const clamped = clamp(inputValue, Number(min), Number(max));
            const fixed = parseFloat(formatNumber(clamped, decimals));
            range.value = fixed;
            number.value = formatNumber(fixed, decimals);
            if (typeof onChange === 'function') {
                onChange(fixed);
            }
            updateReset(fixed);
        };

        if (!disabled) {
            range.addEventListener('input', () => {
                applyValue(Number(range.value));
            });
            number.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    applyValue(Number(number.value));
                }
            });
            number.addEventListener('blur', () => {
                applyValue(Number(number.value));
            });
            reset.addEventListener('click', () => {
                applyValue(originalValue);
            });
        }

        updateReset(originalValue);
        controls.append(range, number, reset);
        field.appendChild(controls);
        return field;
    };

    const createColorField = ({ label, value, original, disabled = false, onChange }) => {
        const field = document.createElement('div');
        field.className = 'lighting-debug-field';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        field.appendChild(labelEl);

        const controls = document.createElement('div');
        controls.className = 'lighting-debug-field-controls';

        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'lighting-debug-hex';
        hexInput.value = value;
        hexInput.maxLength = 7;
        hexInput.placeholder = '#FFFFFF';
        hexInput.disabled = disabled;

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = value;
        colorInput.disabled = disabled;

        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'lighting-debug-reset';
        reset.title = 'Reset to original value';
        reset.innerText = '×';
        reset.disabled = disabled;

        const originalHex = original ?? value;

        const applyHex = (hex) => {
            const normalized = normalizeHex(hex);
            if (!normalized) {
                hexInput.value = colorInput.value.toUpperCase();
                return false;
            }
            hexInput.value = normalized;
            colorInput.value = normalized;
            if (typeof onChange === 'function') {
                onChange(normalized);
            }
            const dirty = normalized !== originalHex;
            setResetState(reset, { dirty, tint: dirty ? normalized : null });
            return true;
        };

        if (!disabled) {
            colorInput.addEventListener('input', () => {
                applyHex(colorInput.value);
            });
            const handleHexCommit = () => {
                if (!applyHex(hexInput.value)) {
                    hexInput.classList.add('is-invalid');
                    setTimeout(() => hexInput.classList.remove('is-invalid'), 800);
                }
            };
            hexInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    handleHexCommit();
                }
            });
            hexInput.addEventListener('blur', handleHexCommit);
            reset.addEventListener('click', () => {
                applyHex(originalHex);
            });
        }

        setResetState(reset, { dirty: false });
        controls.append(hexInput, colorInput, reset);
        field.appendChild(controls);
        return field;
    };

    lights.forEach((descriptor) => {
        const { light, label, intensityRange, intensityStep } = descriptor;
        const group = document.createElement('div');
        group.className = 'lighting-debug-group';

        const heading = document.createElement('h3');
        heading.textContent = label;
        group.appendChild(heading);

        const minIntensity = intensityRange ? intensityRange[0] : 0;
        const maxIntensity = intensityRange ? intensityRange[1] : 5;
        const step = intensityStep ?? 0.01;
        const originalIntensity = light.intensity;
        const intensityField = createRangeField({
            label: 'Intensity',
            min: minIntensity,
            max: maxIntensity,
            step: step,
            value: light.intensity,
            original: originalIntensity,
            onChange: (val) => {
                light.intensity = val;
                if (descriptor.type === 'SpotLight') {
                    light.visible = val > 0.01;
                }
                if (light.decay !== undefined && descriptor.type === 'PointLight') {
                    light.decay = 2.0;
                }
            }
        });
        group.appendChild(intensityField);

        if (light.color) {
            const originalColor = `#${light.color.getHexString().toUpperCase()}`;
            const colorField = createColorField({
                label: 'Color',
                value: originalColor,
                original: originalColor,
                onChange: (hex) => {
                    light.color.set(hex);
                }
            });
            group.appendChild(colorField);
        }

        body.appendChild(group);
    });

    const envOriginal = getEnvironmentReflectionIntensity();
    const envGroup = document.createElement('div');
    envGroup.className = 'lighting-debug-group';
    const envHeading = document.createElement('h3');
    envHeading.textContent = 'Environment';
    envGroup.appendChild(envHeading);
    envGroup.appendChild(createRangeField({
        label: 'Intensity',
        min: 0,
        max: 4,
        step: 0.05,
        value: envOriginal,
        original: envOriginal,
        onChange: (val) => setEnvironmentReflectionIntensity(val)
    }));
    body.appendChild(envGroup);

    const gradientState = getBackgroundGradientColors();
    const backgroundGroup = document.createElement('div');
    backgroundGroup.className = 'lighting-debug-group';
    const backgroundHeading = document.createElement('h3');
    backgroundHeading.textContent = 'Background';
    backgroundGroup.appendChild(backgroundHeading);
    backgroundGroup.appendChild(createColorField({
        label: 'Top Color',
        value: gradientState.top,
        original: gradientState.top,
        onChange: (hex) => setBackgroundGradientColors({ top: hex })
    }));
    backgroundGroup.appendChild(createColorField({
        label: 'Bottom Color',
        value: gradientState.bottom,
        original: gradientState.bottom,
        onChange: (hex) => setBackgroundGradientColors({ bottom: hex })
    }));
    body.appendChild(backgroundGroup);

    const bloomState = getBloomDebugSettings();
    const bloomOriginal = bloomState ? {
        strength: bloomState.strength,
        radius: bloomState.radius,
        threshold: bloomState.threshold
    } : null;
    const bloomGroup = document.createElement('div');
    bloomGroup.className = 'lighting-debug-group';
    const bloomHeading = document.createElement('h3');
    bloomHeading.textContent = 'Bloom';
    bloomGroup.appendChild(bloomHeading);
    bloomGroup.appendChild(createRangeField({
        label: 'Strength',
        min: 0,
        max: 4,
        step: 0.05,
        value: bloomState?.strength ?? 0,
        original: bloomOriginal?.strength ?? 0,
        disabled: !bloomState,
        onChange: (val) => setBloomDebugSettings({ strength: val })
    }));
    bloomGroup.appendChild(createRangeField({
        label: 'Radius',
        min: 0,
        max: 10,
        step: 0.1,
        value: bloomState?.radius ?? 0,
        original: bloomOriginal?.radius ?? 0,
        decimals: 1,
        disabled: !bloomState,
        onChange: (val) => setBloomDebugSettings({ radius: val })
    }));
    bloomGroup.appendChild(createRangeField({
        label: 'Threshold',
        min: 0,
        max: 1,
        step: 0.01,
        value: bloomState?.threshold ?? 0.96,
        original: bloomOriginal?.threshold ?? 0.96,
        disabled: !bloomState,
        onChange: (val) => setBloomDebugSettings({ threshold: val })
    }));
    if (!bloomState) {
        const message = document.createElement('p');
        message.textContent = 'Bloom controls unavailable (effect disabled or not initialised).';
        message.style.marginTop = '0.5rem';
        message.style.fontSize = '0.85rem';
        message.style.color = '#a25b39';
        bloomGroup.appendChild(message);
    }
    body.appendChild(bloomGroup);

    const copyButton = panel.querySelector('[data-action="copy-settings"]');
    copyButton.addEventListener('click', async () => {
        const payload = {
            lights: lights.map(({ id, label, light }) => ({
                id,
                label,
                intensity: Number(light.intensity.toFixed(3)),
                color: light.color ? `#${light.color.getHexString().toUpperCase()}` : null
            })),
            environment: {
                intensity: Number(getEnvironmentReflectionIntensity().toFixed(3))
            },
            backgroundGradient: getBackgroundGradientColors()
        };
        const bloomSnapshot = getBloomDebugSettings();
        if (bloomSnapshot) {
            payload.bloom = {
                strength: Number(bloomSnapshot.strength.toFixed(3)),
                radius: Number(bloomSnapshot.radius.toFixed(3)),
                threshold: Number(bloomSnapshot.threshold.toFixed(3))
            };
        }
        const text = JSON.stringify(payload, null, 2);
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                copyButton.classList.add('is-success');
                const originalLabel = copyButton.textContent;
                copyButton.textContent = 'Copied!';
                setTimeout(() => {
                    copyButton.classList.remove('is-success');
                    copyButton.textContent = originalLabel;
                }, 1600);
            } else {
                throw new Error('Clipboard API not available');
            }
        } catch (error) {
            console.warn('Copy failed, logging settings to console instead.', error);
            console.log('Lighting Settings\n', text);
        }
    });

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

