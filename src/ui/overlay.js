let overlayRoot = null;
let overlayContent = null;

const COLLAPSE_DURATION_MS = 220; // matches CSS transition timing
const HOLD_DURATION_MS = 80; // time to stay collapsed before expanding

let expandTimeout = null;

/**
 * Initialize DOM overlay references.
 * Future-proofed for richer UI (buttons, labels, etc).
 */
export function initOverlay() {
    overlayRoot = document.querySelector('[data-overlay-root]');
    overlayContent = document.querySelector('[data-overlay-content]');

    if (!overlayRoot) {
        console.warn('UI overlay root not found');
        return;
    }

    overlayRoot.classList.remove('ui-overlay-collapsed');
}

/**
 * Play a collapse / expand animation when navigation happens.
 * Scales the overlay down to 0, then brings it back smoothly.
 */
export function animateOverlaySelectionChange() {
    if (!overlayRoot) return;

    // Reset any ongoing animation so we can retrigger it.
    overlayRoot.classList.remove('ui-overlay-collapsed');
    void overlayRoot.offsetWidth; // force reflow

    overlayRoot.classList.add('ui-overlay-collapsed');

    window.clearTimeout(expandTimeout);
    expandTimeout = window.setTimeout(() => {
        overlayRoot.classList.remove('ui-overlay-collapsed');
    }, COLLAPSE_DURATION_MS + HOLD_DURATION_MS);
}

/**
 * Placeholder for future UI composition (titles, buttons, etc).
 * @param {(root: HTMLElement, content: HTMLElement) => void} updater
 */
export function configureOverlay(updater) {
    if (!overlayRoot || !overlayContent || typeof updater !== 'function') return;
    updater(overlayRoot, overlayContent);
}

/**
 * Expose overlay root for future hooks/tests.
 */
export function getOverlayRoot() {
    return overlayRoot;
}


