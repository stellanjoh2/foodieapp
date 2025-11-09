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
        particleCount: 180,
        spread: 80,
        startVelocity: 65,
        gravity: 1.1,
        ticks: 200,
        scalar: 1.4,
        origin: { x: 0.5, y: 0.6 }
    });
}

export function disposeConfetti() {
    confettiInstance = null;
}

