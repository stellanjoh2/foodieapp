/**
 * Lightweight audio helpers for background music and sound effects.
 * Uses Web Audio API for low-latency SFX playback when available,
 * while falling back to HTMLAudioElement as a safe default.
 */

let audioContext = null;

function supportsWebAudio() {
    return typeof window !== 'undefined' &&
        ('AudioContext' in window || 'webkitAudioContext' in window);
}

function getAudioContext() {
    if (!supportsWebAudio()) {
        return null;
    }
    if (!audioContext) {
        const ContextClass = window.AudioContext || window.webkitAudioContext;
        audioContext = new ContextClass();
    }
    return audioContext;
}

export async function loadSfx(url) {
    if (!supportsWebAudio()) {
        const audio = new Audio(url);
        audio.preload = 'auto';
        return { type: 'html', audio };
    }

    const context = getAudioContext();
    if (!context) {
        return null;
    }

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    return {
        type: 'buffer',
        buffer: audioBuffer
    };
}

export function playSfx(loadedSfx, { volume = 1.0 } = {}) {
    if (!loadedSfx) return;

    if (loadedSfx.type === 'html') {
        const audio = loadedSfx.audio;
        try {
            audio.currentTime = 0;
        } catch (error) {
            console.warn('Unable to reset audio element', error);
        }
        audio.volume = volume;
        audio.play().catch((error) => {
            console.warn('Audio element playback prevented:', error);
        });
        return;
    }

    const context = getAudioContext();
    if (!context) return;

    // Some browsers require user interaction before playback.
    if (context.state === 'suspended') {
        context.resume().catch(() => { /* ignore */ });
    }

    const source = context.createBufferSource();
    source.buffer = loadedSfx.buffer;

    const gainNode = context.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(context.destination);
    source.start();
}

export function disposeAudio() {
    if (audioContext) {
        audioContext.close().catch(() => { /* ignore */ });
        audioContext = null;
    }
}

export function playTypeSound({
    frequency = 280,
    duration = 0.08,
    volume = 0.08
} = {}) {
    const context = getAudioContext();
    if (!context) return;

    if (context.state === 'suspended') {
        context.resume().catch(() => { /* ignore */ });
    }

    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();

    const baseFreq = frequency + Math.random() * 40;

    osc.type = 'sine';
    osc.frequency.value = baseFreq;

    gain.gain.value = volume;
    filter.type = 'lowpass';
    filter.frequency.value = baseFreq * 3;

    const now = context.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(volume * 0.4, now + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);

    osc.start(now);
    osc.stop(now + duration);
}

