import confetti from 'https://cdn.skypack.dev/canvas-confetti';

let confettiInstance = null;
let resizeObserver = null;
let resizeHandler = null;

export function initConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    if (confettiInstance) return;

    confettiInstance = confetti.create(canvas, {
        resize: true,
        useWorker: true
    });

    const container = document.getElementById('canvas-container');
    const updateSize = () => {
        const width = container?.clientWidth ?? window.innerWidth;
        const height = container?.clientHeight ?? window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    };

    updateSize();

    if (container && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(container);
    } else {
        resizeHandler = updateSize;
        window.addEventListener('resize', resizeHandler);
    }
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
    if (resizeObserver) {
        const container = document.getElementById('canvas-container');
        if (container) {
            resizeObserver.unobserve(container);
        }
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }
    confettiInstance = null;
}

