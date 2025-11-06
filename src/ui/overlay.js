let overlayRoot = null;
let overlayContent = null;

const COLLAPSE_DURATION_MS = 220; // matches CSS transition timing
const HOLD_DURATION_MS = 80; // time to stay collapsed before expanding

let expandTimeout = null;
let currentDetails = null;

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

    if (currentDetails) {
        renderOverlayContent(currentDetails);
    }
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
 * Update overlay information for the currently selected asset.
 * @param {{ displayName: string, price: number, calories: number, deliveryMinutes: number }} details
 */
export function updateOverlayContent(details) {
    currentDetails = details;
    if (!overlayContent || !details) return;
    renderOverlayContent(details);
}

function renderOverlayContent(details) {
    if (!overlayContent) return;

    overlayContent.innerHTML = `
        <div class="food-header">
            <span class="food-name">${details.displayName}</span>
        </div>
        <div class="food-meta">
            ${createMetaItem('price', 'Price', formatPrice(details.price))}
            ${createMetaItem('calories', 'Energy', `${details.calories} kcal`)}
            ${createMetaItem('delivery', 'Delivery', formatDelivery(details.deliveryMinutes))}
        </div>
    `;
}

function createMetaItem(type, label, value) {
    return `
        <div class="food-meta-item">
            <span class="food-meta-icon" aria-hidden="true">${getIcon(type)}</span>
            <span class="food-meta-values">
                <span class="food-meta-label">${label}</span>
                <span class="food-meta-value">${value}</span>
            </span>
        </div>
    `;
}

function formatPrice(price) {
    return `$${price.toFixed(2)}`;
}

function formatDelivery(minutes) {
    if (minutes <= 0) return 'Ready now';
    return `${minutes} min`;
}

function getIcon(type) {
    switch (type) {
        case 'price':
            return `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3.5c-4.694 0-8.5 2.313-8.5 5.167 0 2.853 3.806 5.166 8.5 5.166s8.5-2.313 8.5-5.166C20.5 5.813 16.694 3.5 12 3.5Z"/>
                    <path d="M3.5 8.667V12c0 2.853 3.806 5.166 8.5 5.166S20.5 14.853 20.5 12V8.667"/>
                    <path d="M3.5 12.333V15.5c0 2.667 3.806 4.834 8.5 4.834s8.5-2.167 8.5-4.834v-3.167"/>
                </svg>
            `;
        case 'calories':
            return `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20c-4-2.65-6.5-5.42-6.5-8.47 0-2.18 1.56-3.96 3.5-3.96 1.22 0 2.29.65 3 1.67.71-1.02 1.78-1.67 3-1.67 1.94 0 3.5 1.78 3.5 3.96 0 3.05-2.5 5.82-6.5 8.47Z" fill="currentColor" fill-opacity="0.18"/>
                    <path d="M12 20c-4-2.65-6.5-5.42-6.5-8.47 0-2.18 1.56-3.96 3.5-3.96 1.22 0 2.29.65 3 1.67.71-1.02 1.78-1.67 3-1.67 1.94 0 3.5 1.78 3.5 3.96 0 3.05-2.5 5.82-6.5 8.47Z"/>
                </svg>
            `;
        case 'delivery':
        default:
            return `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3.5 15.5h13.25"/>
                    <path d="M16.75 12h2.75l1.5 2.5v3h-3.25"/>
                    <circle cx="8" cy="17.5" r="1.8" fill="currentColor" fill-opacity="0.18"/>
                    <circle cx="8" cy="17.5" r="1.8"/>
                    <circle cx="18" cy="17.5" r="1.8" fill="currentColor" fill-opacity="0.18"/>
                    <circle cx="18" cy="17.5" r="1.8"/>
                    <path d="M13.5 9.5l-1.5 3.5"/>
                    <path d="M6.5 15.5l2-5h5"/>
                </svg>
            `;
    }
}

/**
 * Expose overlay root for future hooks/tests.
 */
export function getOverlayRoot() {
    return overlayRoot;
}


