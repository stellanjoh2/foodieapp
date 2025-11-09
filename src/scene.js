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
    
    // Top: Dark red/velvet red
    gradient.addColorStop(0, '#e73827');      // Dark red/velvet red
    
    // Transition through red-orange
    gradient.addColorStop(0.5, '#f0573a');    // Bright red-orange
    
    // Bottom: Bright orange/yellow
    gradient.addColorStop(1, '#f8aa3b');      // Bright orange-yellow
    
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

    topSpotLight = new THREE.SpotLight(0xfff3d6, 2.2, 14, Math.PI / 6, 0.35, 1);
    topSpotLight.position.set(0, 6, 0);
    topSpotLight.target.position.set(0, 0, 0);
    topSpotLight.visible = false;
    topSpotLight.castShadow = false;
    topSpotLight.shadow.mapSize.width = 4096;
    topSpotLight.shadow.mapSize.height = 4096;
    topSpotLight.shadow.camera.near = 0.3;
    topSpotLight.shadow.camera.far = 25;
    scene.add(topSpotLight);
    scene.add(topSpotLight.target);

    // Fill light - desaturated warm tone from the front
    // Brightened by 20%: 0.4 * 1.2 = 0.48
    const fillLight = new THREE.DirectionalLight(0xfef8f0, 0.63888); // +10%
    fillLight.position.set(-3, 2, 3); // From front-left
    scene.add(fillLight);
    
    // Rim light - desaturated warm tone from behind
    // Brightened by 20%: 0.3 * 1.2 = 0.36
    const rimLight = new THREE.DirectionalLight(0xfef5f0, 0.47916); // +10%
    rimLight.position.set(-2, 4, -5); // From behind
    scene.add(rimLight);
    
    // Studio point lights - left and right sides for studio-like lighting
    // Positioned closer to food items at the same level (Y=0) for even side illumination
    // Using strong saturated colors from VelvetSun gradient
    // Left side point light - strong dark red from top of gradient
    // Brightened by 20%: 2.5 * 1.2 = 3.0
    const leftPointLight = new THREE.PointLight(0xe73827, 3.993, 50); // +10%
    leftPointLight.position.set(-4, 0, 0); // Left side, closer to food items, same level
    scene.add(leftPointLight);
    
    // Right side point light - strong orange-yellow from bottom of gradient
    // Brightened by 20%: 2.5 * 1.2 = 3.0
    const rightPointLight = new THREE.PointLight(0xf8aa3b, 3.993, 50); // +10%
    rightPointLight.position.set(4, 0, 0); // Right side, closer to food items, same level
    scene.add(rightPointLight);
}

function applyEnvironmentMap() {
    if (environmentMap) {
        scene.environment = environmentMap;
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
            }
        },
        undefined,
        (error) => {
            console.warn('Failed to load HDRI environment texture:', error);
        }
    );
}

export function getTopSpotlight() {
    return topSpotLight;
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

