import { playTypeSound } from '../audio.js';

const INITIAL_DELAY_MS = 4000;
const APPEAR_INTERVAL_MS = 10000;
const TYPE_DELAY_MS = 650;
const TYPE_SPEED_MS = 14;
const HOLD_AFTER_TYPE_MS = 3500;

const APPEARANCES = [
    {
        text: 'Hii~! Welcome to the shop! Everything’s super fresh today!',
        expression: 'happy'
    },
    {
        text: 'Hehe… um, are you lost or just inspecting every grain of rice?',
        expression: 'neutral'
    },
    {
        text: 'Okaaaay, that’s like the fifth lap around the shelf… what’s the plan?',
        expression: 'grumpy'
    },
    {
        text: 'Tch—are you window-shopping or performing a full-on investigation?!',
        expression: 'grumpy'
    },
    {
        text: 'BUY. SOMETHING. BEFORE I PUT YOU ON SALE!!',
        expression: 'angry'
    }
];

let container = null;
let imageEl = null;
let textEl = null;
let hasVisibilityListener = false;
let upcomingTimeout = null;
let exitTimeout = null;
let typeTimeout = null;
let typeInterval = null;
let appearanceIndex = 0;

export function initShopkeeper() {
    if (container) {
        return;
    }

    container = document.querySelector('[data-shopkeeper]');
    if (!container) return;

    imageEl = container.querySelector('[data-shopkeeper-image]');
    textEl = container.querySelector('[data-shopkeeper-text]');

    if (!imageEl) {
        console.warn('Shopkeeper image element not found');
        resetState();
        return;
    }

    hideShopkeeper(true);
    scheduleNextAppearance(INITIAL_DELAY_MS);

    if (!hasVisibilityListener) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        hasVisibilityListener = true;
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        cancelTimers();
        hideShopkeeper(true);
    } else if (appearanceIndex < APPEARANCES.length) {
        scheduleNextAppearance(INITIAL_DELAY_MS);
    }
}

function scheduleNextAppearance(delay) {
    cancelTimers();
    upcomingTimeout = window.setTimeout(triggerAppearance, delay);
}

function triggerAppearance() {
    const { text, expression } = APPEARANCES[appearanceIndex];
    appearanceIndex = (appearanceIndex + 1) % APPEARANCES.length;

    showShopkeeper(expression);

    typeTimeout = window.setTimeout(() => {
        showSpeech(text);
    }, TYPE_DELAY_MS);

    upcomingTimeout = window.setTimeout(triggerAppearance, APPEAR_INTERVAL_MS);
}

function showShopkeeper(expression) {
    if (!container) return;
    imageEl.src = getExpressionAsset(expression);
    container.classList.add('is-visible');
}

function showSpeech(line) {
    if (!textEl) return;
    clearTypewriter();
    textEl.textContent = '';
    textEl.classList.add('is-visible');

    const characters = Array.from(line);
    let index = 0;

    typeInterval = window.setInterval(() => {
        if (index >= characters.length) {
            clearTypewriterInterval();
            scheduleExit();
            return;
        }
        const nextChar = characters[index++];
        textEl.textContent += nextChar;
        if (nextChar.trim()) {
            playTypeSound({
                frequency: 260 + Math.random() * 80,
                volume: 0.1
            });
        }
    }, TYPE_SPEED_MS);
}

function hideShopkeeper(forceImmediate = false) {
    if (!container) return;
    container.classList.remove('is-visible');
    clearTypewriter();
    if (!forceImmediate) {
        // no-op reserved for future easing tweaks
    }
}

function cancelTimers() {
    if (upcomingTimeout) {
        clearTimeout(upcomingTimeout);
        upcomingTimeout = null;
    }
    if (exitTimeout) {
        clearTimeout(exitTimeout);
        exitTimeout = null;
    }
    if (typeTimeout) {
        clearTimeout(typeTimeout);
        typeTimeout = null;
    }
    clearTypewriterInterval();
}

function resetState() {
    cancelTimers();
    container = null;
    imageEl = null;
    textEl = null;
    appearanceIndex = 0;
}

function clearTypewriterInterval() {
    if (typeInterval) {
        clearInterval(typeInterval);
        typeInterval = null;
    }
}

function clearTypewriter() {
    clearTypewriterInterval();
    if (textEl) {
        textEl.textContent = '';
        textEl.classList.remove('is-visible');
    }
}

function scheduleExit() {
    if (exitTimeout) {
        clearTimeout(exitTimeout);
    }
    exitTimeout = window.setTimeout(() => {
        hideShopkeeper();
    }, HOLD_AFTER_TYPE_MS);
}

function getExpressionAsset(expression) {
    switch (expression) {
        case 'happy':
            return 'Images/shopkeeper-neutral.PNG';
        case 'grumpy':
            return 'Images/shopkeeper-grumpy.PNG';
        case 'angry':
            return 'Images/shopkeeper-angry.PNG';
        case 'neutral':
        default:
            return 'Images/shopkeeper-neutral.PNG';
    }
}

