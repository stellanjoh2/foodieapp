let overlayRoot = null;
let overlayContent = null;

const COLLAPSE_DURATION_MS = 220; // matches CSS transition timing
const HOLD_DURATION_MS = 80; // time to stay collapsed before expanding
const NAME_FADE_DURATION_MS = 110;
const META_STAGGER_MS = 70;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 9;

let expandTimeout = null;
let nameRevealTimeout = null;
const metaRevealTimeouts = [];
let lockedHeight = null;
let currentDetails = null;
let currentItemKey = null;
let pendingDetails = null;
let isExpanding = false;

const quantityState = new Map();

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
    overlayRoot.addEventListener('transitionend', handleOverlayTransitionEnd);
    overlayRoot.style.overflow = 'visible';

    if (overlayContent) {
        overlayContent.addEventListener('click', handleOverlayClick);
    }

    if (currentDetails) {
        pendingDetails = { itemKey: currentItemKey, details: currentDetails };
        if (isOverlayReady()) {
            triggerContentReveal();
        }
    }
}

/**
 * Play a collapse / expand animation when navigation happens.
 * Scales the overlay down to 0, then brings it back smoothly.
 */
export function animateOverlaySelectionChange() {
    if (!overlayRoot) return;

    overlayRoot.classList.remove('ui-overlay-collapsed');
    void overlayRoot.offsetWidth; // force reflow

    cancelPendingAnimations();
    hideCurrentContent();

    overlayRoot.classList.add('ui-overlay-collapsed');
    isExpanding = false;

    window.clearTimeout(expandTimeout);
    expandTimeout = window.setTimeout(() => {
        isExpanding = true;
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
 * @param {string} itemKey
 * @param {{ displayName: string, price: number, calories: number }} details
 */
export function updateOverlayContent(itemKey, details) {
    cancelPendingAnimations();

    currentDetails = details;
    currentItemKey = itemKey;
    pendingDetails = { itemKey, details };

    if (isOverlayReady()) {
        triggerContentReveal();
    }
}

function renderOverlayContent(itemKey, details) {
    if (!overlayContent) return;

    const quantity = getQuantity(itemKey);

    overlayContent.innerHTML = `
        <div class="food-header">
            <span class="food-name" data-food-name></span>
        </div>
        <div class="food-meta-row is-hidden" data-meta-row>
            <div class="food-meta">
                ${createMetaItem('price', 'Price', formatPrice(details.price))}
                ${createMetaItem('calories', 'Energy', `${details.calories} kcal`)}
            </div>
            <div class="food-controls">
                <div class="quantity-control is-hidden" data-quantity-control role="group" aria-label="Quantity">
                    <button class="quantity-button" type="button" data-quantity-action="decrement" aria-label="Decrease quantity">
                        ${getIcon('minus')}
                    </button>
                    <span class="quantity-value" data-quantity-value>${quantity}</span>
                    <button class="quantity-button" type="button" data-quantity-action="increment" aria-label="Increase quantity">
                        ${getIcon('plus')}
                    </button>
                </div>
            </div>
        </div>
    `;
}

function createMetaItem(type, label, value) {
    return `
        <div class="food-meta-item is-hidden" data-meta-item="${type}">
            <span class="food-meta-icon" aria-hidden="true">${getIcon(type)}</span>
            <span class="food-meta-values">
                <span class="food-meta-label">${label}</span>
                <span class="food-meta-value">${value}</span>
            </span>
        </div>
    `;
}

function formatPrice(price) {
    const rounded = Math.round(price);
    return `$${rounded}`;
}

function getIcon(type) {
    switch (type) {
        case 'price':
            return `<img src="Images/coin.PNG" alt="Price icon">`;
        case 'calories':
            return `<img src="Images/heart.PNG" alt="Energy icon">`;
        case 'minus':
            return `<span aria-hidden="true">−</span>`;
        case 'plus':
            return `<span aria-hidden="true">+</span>`;
        default:
            return '';
    }
}

/**
 * Expose overlay root for future hooks/tests.
 */
export function getOverlayRoot() {
    return overlayRoot;
}

function handleOverlayClick(event) {
    const button = event.target.closest('[data-quantity-action]');
    if (!button) return;
    const action = button.getAttribute('data-quantity-action');
    changeQuantity(action);
}

function changeQuantity(action) {
    if (!currentItemKey || !overlayContent) return false;
    if (action !== 'increment' && action !== 'decrement') return false;

    let quantity = getQuantity(currentItemKey);
    const previousQuantity = quantity;
    if (action === 'increment') {
        quantity = Math.min(MAX_QUANTITY, quantity + 1);
    } else {
        quantity = Math.max(MIN_QUANTITY, quantity - 1);
    }

    if (quantity === previousQuantity) {
        const detail = {
            action,
            itemKey: currentItemKey,
            quantity,
            blocked: true
        };
        const changeEvent = new CustomEvent('overlay:quantity-change', {
            detail,
            bubbles: true
        });
        overlayContent.dispatchEvent(changeEvent);
        return false;
    }

    quantityState.set(currentItemKey, quantity);
    const valueEl = overlayContent?.querySelector('[data-quantity-value]');
    if (valueEl) {
        valueEl.textContent = `${quantity}`;
    }

    const detail = {
        action,
        itemKey: currentItemKey,
        quantity,
        blocked: false
    };
    const changeEvent = new CustomEvent('overlay:quantity-change', {
        detail,
        bubbles: true
    });
    overlayContent.dispatchEvent(changeEvent);
    return true;
}

export function adjustQuantity(action) {
    return changeQuantity(action);
}

function getQuantity(itemKey) {
    if (!itemKey) return MIN_QUANTITY;
    if (!quantityState.has(itemKey)) {
        quantityState.set(itemKey, MIN_QUANTITY);
    }
    return quantityState.get(itemKey);
}

function isOverlayReady() {
    return overlayRoot && !overlayRoot.classList.contains('ui-overlay-collapsed') && !isExpanding;
}

function handleOverlayTransitionEnd(event) {
    if (!overlayRoot || event.target !== overlayRoot || event.propertyName !== 'transform') return;
    const collapsed = overlayRoot.classList.contains('ui-overlay-collapsed');

    if (!collapsed && isExpanding) {
        isExpanding = false;
        if (pendingDetails) {
            triggerContentReveal();
        }
    }
}

function triggerContentReveal() {
    if (!pendingDetails || !overlayContent) return;

    const { itemKey, details } = pendingDetails;
    pendingDetails = null;

    renderOverlayContent(itemKey, details);
    setNameVisible(false);
    setMetaHidden(true);
    lockOverlayHeight(details.displayName);

    const nameEl = overlayContent.querySelector('[data-food-name]');
    if (!nameEl) return;
    nameEl.textContent = details.displayName;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            setNameVisible(true);
            scheduleMetaReveal();
        });
    });
}

function scheduleMetaReveal() {
    nameRevealTimeout = window.setTimeout(() => {
        revealMetaSequential();
    }, NAME_FADE_DURATION_MS);
}

function hideCurrentContent() {
    if (!overlayContent) return;
    setNameVisible(false);
    setMetaHidden(true);
}

function cancelPendingAnimations() {
    if (nameRevealTimeout !== null) {
        window.clearTimeout(nameRevealTimeout);
        nameRevealTimeout = null;
    }
    while (metaRevealTimeouts.length) {
        const timeoutId = metaRevealTimeouts.pop();
        window.clearTimeout(timeoutId);
    }
    setMetaHidden(true);
    setNameVisible(false);
}

function revealMetaSequential() {
    const { metaRow, metaItems, quantityControl } = getMetaElements();
    if (!metaRow) return;

    metaRow.classList.remove('is-hidden');

    const priceItem = metaItems.find(item => item.dataset.metaItem === 'price');
    const energyItem = metaItems.find(item => item.dataset.metaItem === 'calories');
    const others = metaItems.filter(item => item !== priceItem && item !== energyItem);

    const sequence = [priceItem, energyItem, ...others, quantityControl].filter(Boolean);

    sequence.forEach((element, index) => {
        const timeoutId = window.setTimeout(() => {
            element.classList.remove('is-hidden');
        }, index * META_STAGGER_MS);
        metaRevealTimeouts.push(timeoutId);
    });
}

function lockOverlayHeight(displayName) {
    if (!overlayRoot || !overlayContent) return;

    const tempWrapper = document.createElement('div');
    tempWrapper.style.position = 'absolute';
    tempWrapper.style.visibility = 'hidden';
    tempWrapper.style.pointerEvents = 'none';
    tempWrapper.style.left = '0';
    tempWrapper.style.top = '0';
    tempWrapper.style.transform = 'none';
    tempWrapper.style.width = `${overlayContent.getBoundingClientRect().width}px`;

    const tempContent = overlayContent.cloneNode(true);
    tempContent.querySelectorAll('.is-hidden').forEach(el => el.classList.remove('is-hidden'));
    tempWrapper.appendChild(tempContent);
    document.body.appendChild(tempWrapper);

    const measuredHeight = Math.ceil(tempWrapper.getBoundingClientRect().height + 32);

    document.body.removeChild(tempWrapper);

    if (!lockedHeight || Math.abs(lockedHeight - measuredHeight) > 1) {
        lockedHeight = measuredHeight;
        overlayRoot.style.height = `${measuredHeight}px`;
        overlayRoot.style.minHeight = `${measuredHeight}px`;
        overlayRoot.style.maxHeight = `${measuredHeight}px`;
    }
}

function getMetaElements() {
    if (!overlayContent) {
        return { metaRow: null, metaItems: [], quantityControl: null };
    }
    const metaRow = overlayContent.querySelector('[data-meta-row]');
    const metaItems = metaRow ? Array.from(metaRow.querySelectorAll('.food-meta-item')) : [];
    const quantityControl = overlayContent.querySelector('[data-quantity-control]');
    return { metaRow, metaItems, quantityControl };
}

function setMetaHidden(hidden) {
    const { metaRow, metaItems, quantityControl } = getMetaElements();
    if (metaRow) metaRow.classList.toggle('is-hidden', hidden);
    metaItems.forEach(item => item.classList.toggle('is-hidden', hidden));
    if (quantityControl) quantityControl.classList.toggle('is-hidden', hidden);
}

function setNameVisible(visible) {
    const nameEl = overlayContent?.querySelector('[data-food-name]');
    if (!nameEl) return;
    nameEl.classList.toggle('is-visible', visible);
}


function easeOutCubic(t) {
    const inv = 1 - t;
    return 1 - inv * inv * inv;
}


