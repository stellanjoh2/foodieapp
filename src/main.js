/**
 * Main application entry point
 * Coordinates initialization, state management, and module communication
 */

import { initScene, startRenderLoop, getScene, getCamera, getRenderer } from './scene.js';
import { initModelLoader, loadModel, getAvailableFoodItems } from './models.js';
import { initControls } from './controls.js';
import { initSelector, selectPrevious, selectNext, updateSelector, getSelectedItem, getSelectedIndex, getItemCount } from './selector.js';
import { initPostProcessing, render as renderPostProcessing } from './postprocessing.js';
import { initOverlay, animateOverlaySelectionChange, updateOverlayContent } from './ui/overlay.js';
import { initShopkeeper } from './ui/shopkeeper.js';
import { getFoodDetailsByName } from './data/foodDetails.js';
import { loadSfx, playSfx } from './audio.js';
import { getPerformanceTier } from './utils.js';

// Application state
const state = {
    initialized: false,
    lastFrameTime: performance.now(),
    audio: null,
    isMusicPlaying: false,
    sfx: {
        swipe: null,
        loadingSwipe: null
    }
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
    initShopkeeper();

    try {
        // Initialize scene
        const { scene, camera } = initScene(container);

        // Initialize model loader
        initModelLoader();

        // Load the GLB model
        // Path is relative to loader.setPath('3d-assets/')
        await loadModel('fast_food_stylized.glb', updateLoadingProgress);
        
        console.log('Available food items:', getAvailableFoodItems());

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
            toggleMusic           // onToggleMusic
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
        preloadSwipeSfx();
        
        setLoadingStatus('Opening the shop…');
        updateLoadingProgress(1);
        completeLoadingUI();

        console.log('Application initialized successfully');
        console.log('Use arrow keys or gamepad to navigate items');

    } catch (error) {
        console.error('Failed to initialize application:', error);
        failLoadingUI('Unable to open the shop. Please refresh.');
    }
}

/**
 * Handle navigation left
 */
function handleNavigateLeft() {
    if (!state.initialized) return;

    const currentIndex = getSelectedIndex();
    if (currentIndex <= 0) return; // hard stop reached

    animateOverlaySelectionChange();
    selectPrevious();
    updateOverlayWithCurrent();
    playSwipeSound();

    const selected = getSelectedItem();
    if (selected) {
        console.log('Selected:', selected.name);
    }
}

/**
 * Handle navigation right
 */
function handleNavigateRight() {
    if (!state.initialized) return;

    const currentIndex = getSelectedIndex();
    const itemCount = getItemCount();
    if (currentIndex >= itemCount - 1) return; // hard stop reached

    animateOverlaySelectionChange();
    selectNext();
    updateOverlayWithCurrent();
    playSwipeSound();

    const selected = getSelectedItem();
    if (selected) {
        console.log('Selected:', selected.name);
    }
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

function preloadSwipeSfx() {
    if (state.sfx.swipe || state.sfx.loadingSwipe) {
        return state.sfx.loadingSwipe;
    }
    const loadPromise = loadSfx('Sounds/coin-4.wav')
        .then((asset) => {
            state.sfx.swipe = asset;
            return asset;
        })
        .catch((error) => {
            console.warn('Failed to load swipe SFX:', error);
            return null;
        })
        .finally(() => {
            state.sfx.loadingSwipe = null;
        });
    state.sfx.loadingSwipe = loadPromise;
    return loadPromise;
}

function playSwipeSound() {
    if (!state.initialized) return;

    if (state.sfx.swipe) {
        playSfx(state.sfx.swipe, { volume: 0.6 });
        return;
    }

    preloadSwipeSfx().then((asset) => {
        if (asset) {
            playSfx(asset, { volume: 0.6 });
        }
    });
}

function toggleMusic() {
    if (!state.initialized) return;
    if (!state.audio) {
        state.audio = createBackgroundAudio();
        if (!state.audio) return;
    }

    if (state.isMusicPlaying) {
        state.audio.pause();
        state.isMusicPlaying = false;
        console.log('Music paused');
    } else {
        const playPromise = state.audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(() => {
                state.isMusicPlaying = true;
                console.log('Music playing');
            }).catch((error) => {
                console.warn('Music playback prevented:', error);
            });
        } else {
            state.isMusicPlaying = true;
            console.log('Music playing');
        }
    }
}

function getPostProcessingConfig(tier) {
    switch (tier) {
        case 'low':
            return {
                enabled: false
            };
        case 'medium':
            return {
                enabled: true,
                renderScale: 0.35,
                bloomStrength: 0.42,
                bloomRadius: 0.72,
                bloomThreshold: 0.85
            };
        default:
            return {
                enabled: true,
                renderScale: 0.5,
                bloomStrength: 0.54,
                bloomRadius: 1.08,
                bloomThreshold: 0.8
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

