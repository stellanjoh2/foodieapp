import confetti from 'https://cdn.skypack.dev/canvas-confetti';

let confettiInstance = null;

export function initConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    if (confettiInstance) return;

    const container = document.getElementById('canvas-container');
    if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    confettiInstance = confetti.create(canvas, {
        resize: true,
        useWorker: true
    });
}

export function fireConfettiBlast() {
    if (!confettiInstance) return;

    confettiInstance({
        particleCount: 220,
        spread: 120,
        startVelocity: 75,
        decay: 0.88,
        gravity: 0.8,
        ticks: 240,
        scalar: 1.6,
        origin: { x: 0.5, y: 0.85 }
    });
}

export function disposeConfetti() {
    confettiInstance = null;
}

