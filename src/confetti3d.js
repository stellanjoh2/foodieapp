import * as THREE from 'three';

const GRAVITY = new THREE.Vector3(0, -6.2, 0);
const BASE_SPEED = 3.4;
const PARTICLE_TTL = 0.8;
const BURST_COUNT = 140;

let group = null;
let texture = null;
const spritePool = [];
const activeSprites = new Set();

function createConfettiTexture() {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    const padding = size * 0.2;
    ctx.fillRect(padding * 0.5, padding, size - padding, size - padding * 1.4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
}

function acquireSprite(material) {
    if (spritePool.length) {
        return spritePool.pop();
    }
    const sprite = new THREE.Sprite(material.clone());
    sprite.material.depthWrite = false;
    sprite.material.transparent = true;
    sprite.material.opacity = 0.95;
    sprite.material.side = THREE.DoubleSide;
    sprite.renderOrder = -5;
    return sprite;
}

function releaseSprite(sprite) {
    activeSprites.delete(sprite);
    if (group && sprite.parent === group) {
        group.remove(sprite);
    }
    spritePool.push(sprite);
}

export function initConfetti3D(scene) {
    if (group) return;
    texture = createConfettiTexture();
    const baseMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        opacity: 0.95
    });
    baseMaterial.side = THREE.DoubleSide;

    group = new THREE.Group();
    group.position.set(0, 0, 0);
    group.renderOrder = -5;
    scene.add(group);

    // warm pool
    for (let i = 0; i < 40; i++) {
        const sprite = acquireSprite(baseMaterial);
        spritePool.push(sprite);
    }

    // store base material on pool for cloning when empty
    spritePool.baseMaterial = baseMaterial;
}

function randomColor(target) {
    target.setHSL(THREE.MathUtils.randFloat(0, 1), 0.9, THREE.MathUtils.randFloat(0.45, 0.65));
}

export function spawnConfettiBurst() {
    if (!group || !texture) return;

    const baseMaterial = spritePool.baseMaterial;

    for (let i = 0; i < BURST_COUNT; i++) {
        const sprite = spritePool.length ? spritePool.pop() : acquireSprite(baseMaterial);
        if (!sprite.material.map) {
            sprite.material.map = texture;
            sprite.material.needsUpdate = true;
        }
        randomColor(sprite.material.color);
        sprite.material.opacity = 1.0;
        sprite.material.rotation = THREE.MathUtils.randFloatSpread(Math.PI);

        const height = THREE.MathUtils.randFloat(0.02, 0.035);
        const width = height * (16 / 9);
        sprite.scale.set(
            width,
            height,
            1
        );

        sprite.position.set(
            THREE.MathUtils.randFloatSpread(1.4),
            -1.3 + Math.random() * 0.06,
            -0.35 + Math.random() * 0.15
        );

        sprite.userData.velocity = new THREE.Vector3(
            THREE.MathUtils.randFloatSpread(2.4),
            BASE_SPEED + Math.random() * 2.5,
            THREE.MathUtils.randFloatSpread(0.6)
        );
        sprite.userData.angularVelocity = THREE.MathUtils.randFloatSpread(8);
        sprite.userData.life = 0;
        sprite.userData.ttl = PARTICLE_TTL;

        group.add(sprite);
        activeSprites.add(sprite);
    }
}

const tempVec = new THREE.Vector3();

export function updateConfetti3D(delta) {
    if (!activeSprites.size) return;

    activeSprites.forEach((sprite) => {
        const data = sprite.userData;
        data.life += delta;
        if (data.life >= data.ttl) {
            releaseSprite(sprite);
            return;
        }

        sprite.userData.velocity.addScaledVector(GRAVITY, delta);
        tempVec.copy(sprite.userData.velocity).multiplyScalar(delta);
        sprite.position.add(tempVec);

        sprite.material.rotation += sprite.userData.angularVelocity * delta;
        const fadeStart = data.ttl * 0.35;
        if (data.life >= fadeStart) {
            const fadeProgress = (data.life - fadeStart) / (data.ttl - fadeStart);
            sprite.material.opacity = 1 - fadeProgress;
        }
    });
}

export function disposeConfetti3D(scene) {
    activeSprites.forEach((sprite) => {
        releaseSprite(sprite);
    });
    if (group && scene) {
        scene.remove(group);
    }
    group = null;
    texture = null;
    spritePool.length = 0;
}
