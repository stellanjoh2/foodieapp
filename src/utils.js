/**
 * Utility functions for performance, device detection, and helpers
 */

/**
 * Get device pixel ratio, capped at 1.5 for performance
 * @returns {number} Device pixel ratio (max 1.5)
 */
export function getDevicePixelRatio() {
    return Math.min(window.devicePixelRatio || 1, 1.5);
}

/**
 * Basic performance tier heuristic using available hardware hints.
 * Returns 'low', 'medium', or 'high'.
 * @returns {('low'|'medium'|'high')}
 */
export function getPerformanceTier() {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    const mobile = isMobile();

    if (cores <= 2 || memory <= 2) {
        return 'low';
    }
    if (cores <= 4 || memory <= 4 || mobile) {
        return 'medium';
    }
    return 'high';
}

/**
 * Detect if device is mobile/tablet
 * @returns {boolean} True if mobile device
 */
export function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
}

/**
 * Request high-performance GPU preference
 * @returns {Promise<GPU>} GPU adapter
 */
export function requestHighPerformanceGPU() {
    if ('gpu' in navigator) {
        return navigator.gpu.requestAdapter({
            powerPreference: 'high-performance'
        });
    }
    return null;
}

/**
 * Pause animations when tab is hidden (performance optimization)
 * @param {Function} pauseCallback - Called when tab is hidden
 * @param {Function} resumeCallback - Called when tab is visible
 */
export function setupVisibilityHandling(pauseCallback, resumeCallback) {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pauseCallback();
        } else {
            resumeCallback();
        }
    });
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

