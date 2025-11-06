/**
 * User interaction controls
 * Handles keyboard, gamepad, mouse, and touch input
 */

import * as THREE from 'three';

let controls = {
    mouse: { x: 0, y: 0 },
    isDragging: false,
    previousMousePosition: { x: 0, y: 0 },
    gamepadIndex: null,
    gamepadConnected: false
};

/**
 * Initialize input controls
 * @param {HTMLElement} container - DOM container element
 * @param {Function} onNavigateLeft - Callback when navigating left
 * @param {Function} onNavigateRight - Callback when navigating right
 * @param {Function} onRotate - Callback when rotation occurs (deltaX, deltaY) - optional
 * @param {Function} onSelect - Callback when item is selected/clicked - optional
 */
export function initControls(container, onNavigateLeft, onNavigateRight, onRotate = null, onSelect = null) {
    // Keyboard events
    window.addEventListener('keydown', (event) => {
        handleKeyboard(event, onNavigateLeft, onNavigateRight);
    });

    // Gamepad events
    window.addEventListener('gamepadconnected', (event) => {
        console.log('Gamepad connected:', event.gamepad.id);
        controls.gamepadIndex = event.gamepad.index;
        controls.gamepadConnected = true;
    });

    window.addEventListener('gamepaddisconnected', (event) => {
        console.log('Gamepad disconnected');
        if (controls.gamepadIndex === event.gamepad.index) {
            controls.gamepadIndex = null;
            controls.gamepadConnected = false;
        }
    });

    // Mouse events (for rotation if needed)
    if (onRotate) {
        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('mouseup', onMouseUp);
    }

    if (onSelect) {
        container.addEventListener('click', onMouseClick);
    }

    // Touch events (mobile)
    if (onRotate) {
        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('touchmove', onTouchMove, { passive: false });
        container.addEventListener('touchend', onTouchEnd);
    }

    // Prevent context menu on right click
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    // Store callbacks
    controls.onNavigateLeft = onNavigateLeft;
    controls.onNavigateRight = onNavigateRight;
    controls.onRotate = onRotate;
    controls.onSelect = onSelect;

    // Start gamepad polling
    startGamepadPolling();
}

/**
 * Handle keyboard input
 * @param {KeyboardEvent} event - Keyboard event
 * @param {Function} onNavigateLeft - Left navigation callback
 * @param {Function} onNavigateRight - Right navigation callback
 */
function handleKeyboard(event, onNavigateLeft, onNavigateRight) {
    // Prevent default for arrow keys to avoid scrolling
    if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(event.key)) {
        event.preventDefault();
    }

    switch (event.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            if (onNavigateLeft) onNavigateLeft();
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            if (onNavigateRight) onNavigateRight();
            break;
    }
}

/**
 * Start polling for gamepad input
 */
function startGamepadPolling() {
    let lastButtonState = {};
    
    function pollGamepad() {
        if (!controls.gamepadConnected) {
            requestAnimationFrame(pollGamepad);
            return;
        }

        const gamepad = navigator.getGamepads()[controls.gamepadIndex];
        
        if (!gamepad) {
            requestAnimationFrame(pollGamepad);
            return;
        }

        // Check D-pad, shoulder buttons, and left stick for horizontal movement
        const dPadLeft = gamepad.buttons[14]?.pressed || false;  // D-pad left
        const dPadRight = gamepad.buttons[15]?.pressed || false;  // D-pad right
        const leftShoulder = gamepad.buttons[4]?.pressed || false;  // Left shoulder (L1)
        const rightShoulder = gamepad.buttons[5]?.pressed || false;  // Right shoulder (R1)
        const stickX = gamepad.axes[0];  // Left stick X axis
        
        // Combine all left inputs
        const leftPressed = dPadLeft || leftShoulder;
        // Combine all right inputs
        const rightPressed = dPadRight || rightShoulder;
        
        // Threshold for stick input to avoid drift
        const stickThreshold = 0.5;
        
        // Check if button was just pressed (not held)
        if (leftPressed && !lastButtonState.left) {
            if (controls.onNavigateLeft) controls.onNavigateLeft();
        }
        if (rightPressed && !lastButtonState.right) {
            if (controls.onNavigateRight) controls.onNavigateRight();
        }
        
        // Check stick input (only trigger once per direction change)
        if (stickX < -stickThreshold && !lastButtonState.stickLeft) {
            if (controls.onNavigateLeft) controls.onNavigateLeft();
            lastButtonState.stickLeft = true;
            lastButtonState.stickRight = false;
        } else if (stickX > stickThreshold && !lastButtonState.stickRight) {
            if (controls.onNavigateRight) controls.onNavigateRight();
            lastButtonState.stickRight = true;
            lastButtonState.stickLeft = false;
        } else if (Math.abs(stickX) < stickThreshold) {
            // Reset stick state when stick returns to center
            lastButtonState.stickLeft = false;
            lastButtonState.stickRight = false;
        }
        
        // Update button state
        lastButtonState.left = leftPressed;
        lastButtonState.right = rightPressed;
        
        requestAnimationFrame(pollGamepad);
    }
    
    pollGamepad();
}

/**
 * Mouse down handler
 */
function onMouseDown(event) {
    controls.isDragging = true;
    controls.previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
}

/**
 * Mouse move handler
 */
function onMouseMove(event) {
    if (!controls.isDragging) return;

    const deltaX = event.clientX - controls.previousMousePosition.x;
    const deltaY = event.clientY - controls.previousMousePosition.y;

    if (controls.onRotate) {
        controls.onRotate(deltaX, deltaY);
    }

    controls.previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
}

/**
 * Mouse up handler
 */
function onMouseUp() {
    controls.isDragging = false;
}

/**
 * Mouse click handler
 */
function onMouseClick(event) {
    if (controls.isDragging) {
        // Don't trigger select if it was a drag
        return;
    }

    if (controls.onSelect) {
        controls.onSelect(event);
    }
}

/**
 * Touch start handler
 */
function onTouchStart(event) {
    if (event.touches.length === 1) {
        controls.isDragging = true;
        controls.previousMousePosition = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY
        };
    }
}

/**
 * Touch move handler
 */
function onTouchMove(event) {
    if (event.touches.length === 1 && controls.isDragging) {
        event.preventDefault();

        const deltaX = event.touches[0].clientX - controls.previousMousePosition.x;
        const deltaY = event.touches[0].clientY - controls.previousMousePosition.y;

        if (controls.onRotate) {
            controls.onRotate(deltaX, deltaY);
        }

        controls.previousMousePosition = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY
        };
    }
}

/**
 * Touch end handler
 */
function onTouchEnd(event) {
    controls.isDragging = false;
    
    // Could add tap detection here for mobile selection
    if (event.changedTouches.length === 1 && controls.onSelect) {
        // Simple tap detection (no drag)
        controls.onSelect(event);
    }
}

/**
 * Get current control state
 * @returns {Object} Current control state
 */
export function getControls() {
    return controls;
}

