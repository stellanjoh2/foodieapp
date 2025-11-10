/**
 * Three.js scene setup and management
 * Handles scene, camera, renderer, lighting
 */

import * as THREE from 'three';
import { getDevicePixelRatio, setupVisibilityHandling, getPerformanceTier } from './utils.js';
import { updatePostProcessing } from './postprocessing.js';

let scene, camera, renderer;
let isRendering = true;
let topSpotLight = null;
let environmentMap = null;
const DEFAULT_ENV_INTENSITY = 2.0;
let environmentIntensity = DEFAULT_ENV_INTENSITY;
const lightingRegistry = [];
const gradientBaseColors = {
    top: '#e73827',
    middle: '#f0573a',
    bottom: '#f8aa3b'
};
let globalLightingAdjust = {
    hue: 0,
    saturation: 1,
    lightness: 1
};

/**
 * Initialize Three.js scene
 * @param {HTMLElement} container - DOM container for canvas
 * @returns {Object} Scene objects { scene, camera, renderer }
 */
export function initScene(container) {
    // Scene
    scene = new THREE.Scene();
    // Sunset gradient background (purple → pink → orange → yellow-orange)
    scene.background = createSunsetGradient(container.clientWidth, container.clientHeight);
    applyEnvironmentMap();

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000); // FOV lowered to 45
    camera.position.set(0, -0.1, 5);

    // Renderer
    const performanceTier = getPerformanceTier();
    const pixelRatioCap = performanceTier === 'low' ? 1.0 : performanceTier === 'medium' ? 1.2 : 1.5;
    const pixelRatio = Math.min(getDevicePixelRatio(), pixelRatioCap);
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true,
        powerPreference: performanceTier === 'low' ? 'low-power' : 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Ensure canvas sits behind UI overlays
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.zIndex = '300';
    container.appendChild(renderer.domElement);

    // Lighting
    setupLighting();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Pause rendering when tab is hidden
    setupVisibilityHandling(
        () => { isRendering = false; },
        () => { isRendering = true; }
    );

    return { scene, camera, renderer };
}

/**
 * Create VelvetSun gradient texture for background
 * Based on https://uigradients.com/#VelvetSun
 * Red at top, bright orange/yellow at bottom
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {THREE.Texture} Gradient texture
 */
function createSunsetGradient(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // VelvetSun gradient: dark red at top → bright orange/yellow at bottom
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    
    const topAdjusted = getAdjustedColorFromHex(gradientBaseColors.top);
    const middleAdjusted = getAdjustedColorFromHex(gradientBaseColors.middle);
    const bottomAdjusted = getAdjustedColorFromHex(gradientBaseColors.bottom);

    // Top: Dark red/velvet red
    gradient.addColorStop(0, `#${topAdjusted.getHexString()}`);      // Dark red/velvet red
    
    // Transition through red-orange
    gradient.addColorStop(0.5, `#${middleAdjusted.getHexString()}`);    // Bright red-orange
    
    // Bottom: Bright orange/yellow
    gradient.addColorStop(1, `#${bottomAdjusted.getHexString()}`);      // Bright orange-yellow
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

/**
 * Setup scene lighting - matching VelvetSun sunset gradient
 * Reduced saturation (75% less) with studio point lights on sides
 */
function setupLighting() {
    // Ambient light - desaturated warm tint (75% less saturation)
    // Mix warm color with white for subtle warmth
    // Brightened by 20%: 0.6 * 1.2 = 0.72
    const ambientLight = new THREE.AmbientLight(0xfefaf0, 0.95832); // +10%
    scene.add(ambientLight);
    registerLightControl({
        id: 'ambient',
        label: 'Ambient',
        light: ambientLight,
        type: 'AmbientLight',
        intensityRange: [0, 2]
    });

    // Main directional light - desaturated warm tone (75% less saturation)
    // Positioned from above/behind to simulate sunset lighting
    // Brightened by 20%: 1.0 * 1.2 = 1.2
    const directionalLight = new THREE.DirectionalLight(0xfef5f0, 1.91664); // +10%
    directionalLight.position.set(3, 8, 5); // From above and behind (sunset angle)
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    scene.add(directionalLight);
    registerLightControl({
        id: 'key',
        label: 'Key Directional',
        light: directionalLight,
        type: 'DirectionalLight',
        intensityRange: [0, 4]
    });

    topSpotLight = new THREE.SpotLight(0xfff3d6, 2.2, 14, Math.PI / 6, 0.35, 1);
    topSpotLight.position.set(0, 6, 0);
    topSpotLight.target.position.set(0, 0, 0);
    topSpotLight.visible = topSpotLight.intensity > 0.01;
    topSpotLight.castShadow = false;
    topSpotLight.shadow.mapSize.width = 4096;
    topSpotLight.shadow.mapSize.height = 4096;
    topSpotLight.shadow.camera.near = 0.3;
    topSpotLight.shadow.camera.far = 25;
    scene.add(topSpotLight);
    scene.add(topSpotLight.target);
    registerLightControl({
        id: 'spot',
        label: 'Top Spotlight',
        light: topSpotLight,
        type: 'SpotLight',
        intensityRange: [0, 6],
        intensityStep: 0.01
    });

    // Fill light - desaturated warm tone from the front
    // Brightened by 20%: 0.4 * 1.2 = 0.48
    const fillLight = new THREE.DirectionalLight(0xfef8f0, 0.63888); // +10%
    fillLight.position.set(-3, 2, 3); // From front-left
    scene.add(fillLight);
    registerLightControl({
        id: 'fill',
        label: 'Fill Directional',
        light: fillLight,
        type: 'DirectionalLight',
        intensityRange: [0, 2]
    });
    
    // Rim light - desaturated warm tone from behind
    // Brightened by 20%: 0.3 * 1.2 = 0.36
    const rimLight = new THREE.DirectionalLight(0xfef5f0, 0.47916); // +10%
    rimLight.position.set(-2, 4, -5); // From behind
    scene.add(rimLight);
    registerLightControl({
        id: 'rim',
        label: 'Rim Directional',
        light: rimLight,
        type: 'DirectionalLight',
        intensityRange: [0, 2]
    });
    
    // Studio point lights - left and right sides for studio-like lighting
    // Positioned closer to food items at the same level (Y=0) for even side illumination
    // Using strong saturated colors from VelvetSun gradient
    // Left side point light - strong dark red from top of gradient
    // Brightened by 20%: 2.5 * 1.2 = 3.0
    const leftPointLight = new THREE.PointLight(0xe73827, 3.993, 50); // +10%
    leftPointLight.position.set(-4, 0, 0); // Left side, closer to food items, same level
    scene.add(leftPointLight);
    registerLightControl({
        id: 'pointLeft',
        label: 'Left Point',
        light: leftPointLight,
        type: 'PointLight',
        intensityRange: [0, 8],
        intensityStep: 0.01
    });
    
    // Right side point light - strong orange-yellow from bottom of gradient
    // Brightened by 20%: 2.5 * 1.2 = 3.0
    const rightPointLight = new THREE.PointLight(0xf8aa3b, 3.993, 50); // +10%
    rightPointLight.position.set(4, 0, 0); // Right side, closer to food items, same level
    scene.add(rightPointLight);
    registerLightControl({
        id: 'pointRight',
        label: 'Right Point',
        light: rightPointLight,
        type: 'PointLight',
        intensityRange: [0, 8],
        intensityStep: 0.01
    });
}

function applyEnvironmentMap() {
    if (environmentMap) {
        scene.environment = environmentMap;
        setSceneEnvironmentIntensity(environmentIntensity);
        return;
    }

    const loader = new THREE.TextureLoader();
    loader.load(
        'Images/hdri_sky_782.jpg',
        (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.encoding = THREE.sRGBEncoding;
            environmentMap = texture;
            if (scene) {
                scene.environment = environmentMap;
                setSceneEnvironmentIntensity(environmentIntensity);
            }
        },
        undefined,
        (error) => {
            console.warn('Failed to load HDRI environment texture:', error);
        }
    );
}

function setSceneEnvironmentIntensity(intensity) {
    if (!scene) return;
    const applyIntensity = (material) => {
        if (!material) return;
        if (Array.isArray(material)) {
            material.forEach(applyIntensity);
            return;
        }
        if ('envMapIntensity' in material) {
            material.envMapIntensity = intensity;
            material.needsUpdate = true;
        }
    };

    scene.traverse((child) => {
        if (child.isMesh || child.isPoints || child.isLine) {
            applyIntensity(child.material);
        }
    });
}

export function setEnvironmentReflectionIntensity(intensity = DEFAULT_ENV_INTENSITY) {
    environmentIntensity = intensity;
    setSceneEnvironmentIntensity(environmentIntensity);
}

export function getEnvironmentReflectionIntensity() {
    return environmentIntensity;
}

export function getLightingRegistry() {
    return lightingRegistry;
}

function registerLightControl(entry) {
    lightingRegistry.push({
        intensityRange: [0, 5],
        intensityStep: 0.01,
        originalColor: entry.light && entry.light.color ? entry.light.color.clone() : null,
        ...entry
    });
}

export function getTopSpotlight() {
    return topSpotLight;
}

function updateSceneBackgroundGradient() {
    if (!scene || !renderer) return;
    const parent = renderer.domElement.parentElement;
    const width = parent ? parent.clientWidth : renderer.domElement.width;
    const height = parent ? parent.clientHeight : renderer.domElement.height;
    scene.background = createSunsetGradient(width, height);
}

export function getBackgroundGradientColors() {
    return { ...gradientBaseColors };
}

export function setBackgroundGradientColors(update = {}) {
    Object.assign(gradientBaseColors, update);
    if (update.top || update.bottom) {
        const topColor = new THREE.Color(gradientBaseColors.top);
        const bottomColor = new THREE.Color(gradientBaseColors.bottom);
        const middleColor = topColor.clone().lerp(bottomColor, 0.5);
        gradientBaseColors.middle = `#${middleColor.getHexString()}`;
    }
    updateSceneBackgroundGradient();
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function adjustHSL(hsl) {
    const hue = THREE.MathUtils.euclideanModulo(hsl.h + (globalLightingAdjust.hue / 360), 1);
    const saturation = clamp01(hsl.s * globalLightingAdjust.saturation);
    const lightness = clamp01(hsl.l * globalLightingAdjust.lightness);
    return { h: hue, s: saturation, l: lightness };
}

function getAdjustedColorFromHex(hex) {
    const baseColor = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    baseColor.getHSL(hsl);
    const adjusted = adjustHSL(hsl);
    const result = new THREE.Color();
    result.setHSL(adjusted.h, adjusted.s, adjusted.l);
    return result;
}

export function getAdjustedGradientColors() {
    const top = getAdjustedColorFromHex(gradientBaseColors.top);
    const middle = getAdjustedColorFromHex(gradientBaseColors.middle);
    const bottom = getAdjustedColorFromHex(gradientBaseColors.bottom);
    return {
        top: `#${top.getHexString().toUpperCase()}`,
        middle: `#${middle.getHexString().toUpperCase()}`,
        bottom: `#${bottom.getHexString().toUpperCase()}`
    };
}

function invertAdjustHSL(hsl) {
    const hue = THREE.MathUtils.euclideanModulo(hsl.h - (globalLightingAdjust.hue / 360), 1);
    const saturation = clamp01(globalLightingAdjust.saturation === 0 ? 0 : hsl.s / globalLightingAdjust.saturation);
    const lightness = clamp01(globalLightingAdjust.lightness === 0 ? 0 : hsl.l / globalLightingAdjust.lightness);
    return { h: hue, s: saturation, l: lightness };
}

function getBaseColorFromAdjustedHex(hex) {
    const adjustedColor = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    adjustedColor.getHSL(hsl);
    const original = invertAdjustHSL(hsl);
    const color = new THREE.Color();
    color.setHSL(original.h, original.s, original.l);
    return color;
}

export function setLightBaseColor(descriptor, adjustedHex) {
    if (!descriptor || !descriptor.light) return;
    const baseColor = getBaseColorFromAdjustedHex(adjustedHex);
    updateLightOriginalColor(descriptor, baseColor);
    applyGlobalLightingAdjustments();
}

export function setBackgroundColorFromAdjusted(position, adjustedHex) {
    if (!['top', 'bottom'].includes(position)) return;
    const baseColor = getBaseColorFromAdjustedHex(adjustedHex);
    const update = { [position]: `#${baseColor.getHexString()}` };
    setBackgroundGradientColors(update);
}

function applyGlobalLightingAdjustments() {
    lightingRegistry.forEach((entry) => {
        const light = entry.light;
        if (!light || !entry.originalColor || !light.color) return;
        const base = entry.originalColor.clone();
        const hsl = { h: 0, s: 0, l: 0 };
        base.getHSL(hsl);

        const adjusted = adjustHSL(hsl);
        light.color.setHSL(adjusted.h, adjusted.s, adjusted.l);
    });
    updateSceneBackgroundGradient();
}

export function getGlobalLightingAdjustments() {
    return { ...globalLightingAdjust };
}

export function setGlobalLightingAdjustments(update = {}) {
    globalLightingAdjust = {
        ...globalLightingAdjust,
        ...update
    };
    applyGlobalLightingAdjustments();
}

export function updateLightOriginalColor(entry, color) {
    if (!entry) return;
    if (!color) {
        entry.originalColor = null;
        return;
    }
    entry.originalColor = color.clone ? color.clone() : new THREE.Color(color);
    applyGlobalLightingAdjustments();
}

/**
 * Handle window resize
 */
function onWindowResize() {
    const container = renderer.domElement.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    
    // Update post-processing composer size
    updatePostProcessing(width, height);
    
    // Update sunset gradient background to match new size
    scene.background = createSunsetGradient(width, height);
}

/**
 * Start render loop
 * @param {Function} updateCallback - Called each frame for animations/updates
 * @param {Function} postProcessRender - Optional post-processing render function
 */
export function startRenderLoop(updateCallback, postProcessRender = null) {
    function animate() {
        requestAnimationFrame(animate);
        
        if (isRendering) {
            updateCallback();
            
            // Use post-processing render if available, otherwise use standard render
            if (postProcessRender) {
                postProcessRender();
            } else {
                renderer.render(scene, camera);
            }
        }
    }
    
    animate();
}

/**
 * Get scene reference
 * @returns {THREE.Scene} Scene object
 */
export function getScene() {
    return scene;
}

/**
 * Get camera reference
 * @returns {THREE.PerspectiveCamera} Camera object
 */
export function getCamera() {
    return camera;
}

/**
 * Get renderer reference
 * @returns {THREE.WebGLRenderer} Renderer object
 */
export function getRenderer() {
    return renderer;
}

