/**
 * Post-processing effects
 * Handles all post-processing effects like vignette, color grading, etc.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let composer = null;
let bloomPass = null;

/**
 * Vignette shader based on three-vignette-background style
 * Replicates the vignette effect from https://github.com/mattdesl/three-vignette-background
 * Uses smoothstep for smooth vignette transitions
 */
const VignetteShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'smoothRange': { value: new THREE.Vector2(0.0, 1.0) }, // smoothstep low and high values
        'scale': { value: new THREE.Vector2(1.0, 1.0) }, // vignette scale
        'offset': { value: new THREE.Vector2(0.0, 0.0) }, // vignette offset
        'aspect': { value: 1.0 }, // aspect ratio
        'aspectCorrection': { value: false }, // whether to correct for aspect ratio
        'colorCenter': { value: new THREE.Color(0xffffff) }, // Center color (white/bright)
        'colorEdge': { value: new THREE.Color(0x3a1f0a) } // Edge color (dark orange)
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 smoothRange;
        uniform vec2 scale;
        uniform vec2 offset;
        uniform float aspect;
        uniform bool aspectCorrection;
        uniform vec3 colorCenter;
        uniform vec3 colorEdge;
        varying vec2 vUv;
        
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            
            // Calculate UV centered around (0, 0)
            vec2 uv = vUv * 2.0 - 1.0;
            
            // Apply aspect correction if needed
            if (aspectCorrection) {
                uv.x *= aspect;
            }
            
            // Apply scale and offset
            uv = uv * scale + offset;
            
            // Calculate distance from center
            float dist = length(uv);
            
            // Create vignette using smoothstep (matching three-vignette-background style)
            float vignette = 1.0 - smoothstep(smoothRange.x, smoothRange.y, dist);
            
            // Mix between center color (white/bright) and edge color (dark orange)
            vec3 vignetteColor = mix(colorEdge, colorCenter, vignette);
            
            // Apply vignette to texture
            texel.rgb *= vignetteColor;
            
            gl_FragColor = texel;
        }
    `
};

/**
 * Initialize post-processing
 * @param {THREE.WebGLRenderer} renderer - Three.js renderer
 * @param {THREE.Scene} scene - Three.js scene
 * @param {THREE.Camera} camera - Three.js camera
 * @returns {EffectComposer} Post-processing composer
 */
export function initPostProcessing(renderer, scene, camera) {
    // Create effect composer
    composer = new EffectComposer(renderer);
    
    // Add render pass (renders the scene)
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    // Add soft bloom pass for subtle glow on specular highlights only
    // Reduced strength and higher threshold to keep exposure similar but highlight speculars
    // Performance optimization: Render bloom at 0.5x resolution for better performance
    // (barely noticeable but significant performance gain)
    const bloomResolution = new THREE.Vector2(
        renderer.domElement.width * 0.5,   // Half resolution for performance
        renderer.domElement.height * 0.5
    );
    bloomPass = new UnrealBloomPass(
        bloomResolution,  // Lower resolution for performance
        0.45,  // Strength - 50% more intense (0.3 * 1.5 = 0.45)
        0.9,   // Radius - 50% larger bloom radius (0.6 * 1.5 = 0.9)
        0.8    // Threshold - higher threshold to only bloom very bright specular highlights (0.0 to 1.0)
    );
    composer.addPass(bloomPass);
    
    // Vignette disabled - bloom only
    
    return composer;
}

/**
 * Update post-processing (handle resize, etc.)
 * @param {number} width - New width
 * @param {number} height - New height
 */
export function updatePostProcessing(width, height) {
    if (composer) {
        composer.setSize(width, height);
        
        // Update bloom pass resolution (maintain half resolution for performance)
        if (bloomPass) {
            bloomPass.setSize(width * 0.5, height * 0.5);
        }
    }
}

/**
 * Render the post-processed scene
 */
export function render() {
    if (composer) {
        composer.render();
    }
}

/**
 * Get the post-processing composer
 * @returns {EffectComposer} Composer instance
 */
export function getComposer() {
    return composer;
}

