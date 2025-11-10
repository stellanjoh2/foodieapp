/**
 * Fresnel shader utility for Three.js
 * Adds rim lighting effect to materials using onBeforeCompile
 * Based on fresnel effect (dot(normal, viewDirection))
 */

import * as THREE from 'three';

/**
 * Apply fresnel effect to a material
 * Creates rim lighting/glow effect at edges of the mesh
 * @param {THREE.Material} material - Material to apply fresnel to
 * @param {Object} options - Fresnel options
 * @param {THREE.Color|number} options.color - Fresnel rim color (default: warm white/orange)
 * @param {number} options.intensity - Intensity of fresnel effect (default: 0.5)
 * @param {number} options.power - Power/exponent of fresnel (default: 2.0, higher = more edge-focused)
 * @param {number} options.bias - Bias/offset of fresnel (default: 0.0)
 */
export function applyFresnelToMaterial(material, options = {}) {
    const {
        color = new THREE.Color(0xfff5e6), // Warm white/orange tint
        intensity = 0.5,
        power = 2.0,
        bias = 0.0
    } = options;

    // Convert color to THREE.Color if it's a number
    const fresnelColor = color instanceof THREE.Color ? color : new THREE.Color(color);
    
    if (!material.userData) {
        material.userData = {};
    }
    material.userData.fresnelBase = {
        color: color instanceof THREE.Color ? color.clone() : new THREE.Color(color),
        intensity,
        power,
        bias
    };
    // Store original onBeforeCompile if it exists
    const originalOnBeforeCompile = material.onBeforeCompile;
    
    // Inject fresnel shader code
    material.onBeforeCompile = (shader) => {
        // Call original onBeforeCompile if it exists
        if (originalOnBeforeCompile) {
            originalOnBeforeCompile(shader);
        }

        // Add fresnel uniforms
        shader.uniforms.fresnelColor = { value: fresnelColor };
        shader.uniforms.fresnelIntensity = { value: intensity };
        shader.uniforms.fresnelPower = { value: power };
        shader.uniforms.fresnelBias = { value: bias };

        // Add varying declaration in vertex shader
        shader.vertexShader = shader.vertexShader.replace(
            'void main() {',
            `
            varying vec3 vFresnelWorldNormal;
            varying vec3 vFresnelWorldPosition;
            void main() {
            `
        );

        // Calculate world normal and position in vertex shader
        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            `
            #include <worldpos_vertex>
            vFresnelWorldNormal = normalize(mat3(modelMatrix) * normal);
            vFresnelWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            `
        );

        // Add uniforms and varying in fragment shader
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `
            #include <common>
            uniform vec3 fresnelColor;
            uniform float fresnelIntensity;
            uniform float fresnelPower;
            uniform float fresnelBias;
            varying vec3 vFresnelWorldNormal;
            varying vec3 vFresnelWorldPosition;
            `
        );

        // Calculate fresnel factor and add to emissive before output
        // Use the correct Three.js shader structure for MeshStandardMaterial
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `
            #include <emissivemap_fragment>
            
            // Calculate fresnel effect (rim lighting)
            // Use camera position and world position (avoid naming conflicts)
            vec3 fresnelViewDir = normalize(cameraPosition - vFresnelWorldPosition);
            vec3 fresnelNormal = normalize(vFresnelWorldNormal);
            float fresnelFactor = pow(1.0 - max(dot(fresnelNormal, fresnelViewDir), 0.0), fresnelPower);
            fresnelFactor = max(fresnelFactor - fresnelBias, 0.0);
            fresnelFactor = fresnelFactor * fresnelIntensity;
            
            // Add fresnel to emissive (use totalEmissiveRadiance for MeshStandardMaterial)
            vec3 fresnelEmission = fresnelColor * fresnelFactor;
            totalEmissiveRadiance += fresnelEmission;
            `
        );

        material.userData.fresnelUniforms = {
            color: shader.uniforms.fresnelColor,
            intensity: shader.uniforms.fresnelIntensity,
            power: shader.uniforms.fresnelPower,
            bias: shader.uniforms.fresnelBias
        };

        if (material.userData.pendingFresnelUpdate) {
            updateFresnelMaterial(material, material.userData.pendingFresnelUpdate);
            delete material.userData.pendingFresnelUpdate;
        }
    };

    // Mark material as needing update
    material.needsUpdate = true;
}

/**
 * Apply fresnel to all materials in a mesh
 * @param {THREE.Mesh} mesh - Mesh to apply fresnel to
 * @param {Object} options - Fresnel options
 */
export function applyFresnelToMesh(mesh, options = {}) {
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => applyFresnelToMaterial(mat, options));
        } else {
            applyFresnelToMaterial(mesh.material, options);
        }
    }
}

export function updateFresnelMaterial(material, options = {}) {
    if (!material) return;
    if (!material.userData) {
        material.userData = {};
    }

    const uniforms = material.userData.fresnelUniforms;
    if (!uniforms) {
        material.userData.pendingFresnelUpdate = {
            ...material.userData.pendingFresnelUpdate,
            ...options
        };
        return;
    }

    const { color, intensity, power, bias } = options;
    if (color !== undefined) {
        const col = color instanceof THREE.Color ? color : new THREE.Color(color);
        uniforms.color.value.copy(col);
    }
    if (intensity !== undefined) {
        uniforms.intensity.value = intensity;
    }
    if (power !== undefined) {
        uniforms.power.value = power;
    }
    if (bias !== undefined) {
        uniforms.bias.value = bias;
    }
    material.needsUpdate = true;
}

