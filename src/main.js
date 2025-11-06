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
import { getFoodDetailsByName } from './data/foodDetails.js';

// Application state
const state = {
    initialized: false,
    lastFrameTime: performance.now()
};

/**
 * Initialize application
 */
async function init() {
    const container = document.getElementById('canvas-container');
    const loadingEl = document.getElementById('loading');

    // Prepare UI overlay (frosted panel) for future controls/info
    initOverlay();

    try {
        // Initialize scene
        const { scene, camera } = initScene(container);

        // Initialize model loader
        initModelLoader();

        // Load the GLB model
        // Path is relative to loader.setPath('3d-assets/')
        loadingEl.textContent = 'Loading 3D model...';
        await loadModel('fast_food_stylized.glb');
        
        console.log('Available food items:', getAvailableFoodItems());

        // Initialize item selector (will extract and layout items)
        loadingEl.textContent = 'Setting up item selector...';
        await initSelector(scene, camera);

        // Initialize controls (keyboard and gamepad)
        initControls(
            container,
            handleNavigateLeft,   // onNavigateLeft
            handleNavigateRight,  // onNavigateRight
            null,                 // onRotate (optional)
            null                  // onSelect (optional)
        );

        // Initialize post-processing with soft bloom
        const renderer = getRenderer();
        initPostProcessing(renderer, scene, camera);

        // Populate overlay with initial selection
        updateOverlayWithCurrent();

        // Start render loop with post-processing
        startRenderLoop(update, renderPostProcessing);

        // Hide loading indicator
        loadingEl.style.display = 'none';
        
        state.initialized = true;
        state.lastFrameTime = performance.now();
        
        console.log('Application initialized successfully');
        console.log('Use arrow keys or gamepad to navigate items');

    } catch (error) {
        console.error('Failed to initialize application:', error);
        loadingEl.textContent = 'Error loading application';
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

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

