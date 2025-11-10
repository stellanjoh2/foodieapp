/**
 * 3D model loading and management
 * Handles GLB loading, material/texture management, mesh extraction
 * 
 * ⚠️ CRITICAL TEXTURE PRESERVATION RULE:
 * =====================================
 * NEVER allow food items to lose their textures - they must NEVER be gray or black.
 * 
 * When cloning meshes:
 * - ALWAYS share texture references (don't clone textures)
 * - ALWAYS copy all texture properties (map, normalMap, roughnessMap, etc.)
 * - ALWAYS validate textures exist after cloning
 * - ALWAYS have fallback recovery mechanisms
 * 
 * The getFoodItem() function has built-in safeguards - do NOT modify it
 * in ways that could break texture preservation.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyFresnelToMaterial } from './fresnel.js';
import { registerFresnelMaterial } from './scene.js';

const ENV_REFLECTION_INTENSITY = 2.2;

let loader;
let loadedModel = null;
let foodItems = {};

/**
 * Initialize model loader
 */
export function initModelLoader() {
    loader = new GLTFLoader();
    // Set path to GLB location - textures are referenced relative to GLB
    // GLB is in 3d-assets/, textures are in 3d-assets/textures/
    loader.setPath('3d-assets/');
}

/**
 * Load the main GLB model
 * @param {string} path - Path to GLB file
 * @returns {Promise<THREE.Group>} Loaded model group
 */
export async function loadModel(path, onProgress) {
    return new Promise((resolve, reject) => {
        loader.load(
            path,
            async (gltf) => {
                loadedModel = gltf.scene;
                                
                // If textures are missing, load them from textures folder
                // Wait for all textures to load before extracting/cloning meshes
                await loadExternalTextures(gltf.scene);
                
                // Extract individual food items from the model (after textures are loaded)
                extractFoodItems(gltf.scene);
                
                if (typeof onProgress === 'function') {
                    try {
                        onProgress(1);
                    } catch (error) {
                        console.warn('Progress callback failed during completion', error);
                    }
                }

                resolve(gltf.scene);
            },
            (progress) => {
                if (typeof onProgress === 'function' && progress.total) {
                    try {
                        onProgress(progress.loaded / progress.total);
                    } catch (error) {
                        console.warn('Progress callback failed', error);
                    }
                }
            },
            (error) => {
                console.error('Error loading model:', error);
                reject(error);
            }
        );
    });
}

/**
 * Load external textures from textures folder
 * Maps mesh names to texture files
 * @param {THREE.Group} scene - The loaded scene
 */
async function loadExternalTextures(scene) {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setPath('3d-assets/textures/');

    const textureAliases = {
        chicken_legs: 'chicken_legs',
        coffee: 'coffee',
        pizza: 'pizza',
        ice_cream: 'ice_cream',
        taco: 'taco',
        donut: 'donut',
        french_fries: 'french_fries',
        hot_dog: 'hot_dog',
        burger: 'burger'
    };

    const baseTextures = [
        {
            suffix: 'BaseColor.png',
            label: 'base color',
            apply: (texture, material) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                material.map = texture;
            }
        },
        {
            suffix: 'Normal.png',
            label: 'normal map',
            apply: (texture, material) => {
                material.normalMap = texture;
            }
        },
        {
            suffix: 'Roughness.png',
            label: 'roughness map',
            apply: (texture, material) => {
                material.roughnessMap = texture;
                material.roughness = 1.0;
            }
        },
        {
            suffix: 'Metalness.png',
            label: 'metalness map',
            apply: (texture, material) => {
                material.metalnessMap = texture;
                material.metalness = 1.0;
            }
        }
    ];

    const optionalTextures = [
        {
            suffix: 'Transmission.png',
            label: 'transmission map',
            filter: (alias) => alias === 'coffee',
            apply: (texture, material) => {
                material.transmission = 1.0;
                if (material.transmissionMap !== undefined) {
                    material.transmissionMap = texture;
                }
            }
        }
    ];

    const loadTasks = [];
    scene.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const alias = textureAliases[child.name.toLowerCase()];
        if (!alias) return;

        if (!(child.material instanceof THREE.MeshStandardMaterial)) {
            child.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
        }
        applyEnvironmentIntensity(child.material);

        baseTextures.forEach(({ suffix, apply, label }) => {
            loadTasks.push(loadTextureAsset(
                textureLoader,
                `${alias}_${suffix}`,
                child.material,
                apply,
                `${label} for ${child.name}`
            ));
        });

        optionalTextures.forEach(({ filter, suffix, apply, label }) => {
            if (filter(alias)) {
                loadTasks.push(loadTextureAsset(
                    textureLoader,
                    `${alias}_${suffix}`,
                    child.material,
                    apply,
                    `${label} for ${child.name}`
                ));
            }
        });
    });

    await Promise.all(loadTasks);
}

function loadTextureAsset(loader, file, material, applyTexture, label) {
    return new Promise((resolve, reject) => {
        loader.load(
            file,
            (texture) => {
                texture.flipY = false;
                applyTexture(texture, material);
                applyEnvironmentIntensity(material);
                material.needsUpdate = true;
                resolve();
            },
            undefined,
            (error) => {
                console.error(`Failed to load ${label}:`, error);
                reject(error);
            }
        );
    });
}

/**
 * Extract individual food items from the loaded model
 * The GLB contains multiple meshes - we extract them by name for reuse
 * @param {THREE.Group} model - The loaded model group
 */
function extractFoodItems(model) {
    model.traverse((child) => {
        if (!child.isMesh) return;
        const key = resolveFoodKey(child.name);
        if (!key) return;
        child.castShadow = true;
        child.receiveShadow = true;
        foodItems[key] = { mesh: child };
    });
}

const FOOD_MATCHERS = [
    { key: 'burger', patterns: ['burger'] },
    { key: 'chicken', patterns: ['chicken', 'legs'] },
    { key: 'coffee', patterns: ['coffee'] },
    { key: 'donut', patterns: ['donut'] },
    { key: 'fries', patterns: ['fries', 'french'] },
    { key: 'hotdog', patterns: ['hotdog', 'hot_dog'] },
    { key: 'icecream', patterns: ['ice', 'cream'] },
    { key: 'pizza', patterns: ['pizza'] },
    { key: 'taco', patterns: ['taco'] }
];

function resolveFoodKey(name) {
    const lower = name.toLowerCase();
    for (const { key, patterns } of FOOD_MATCHERS) {
        if (patterns.some((fragment) => lower.includes(fragment))) {
            return key;
        }
    }
    return null;
}

/**
 * Get a specific food item mesh (cloned for independent use)
 * CRITICAL: This function ALWAYS preserves textures - never allows gray/black meshes
 * @param {string} itemName - Name of the food item
 * @returns {THREE.Mesh} Cloned mesh or null if not found
 */
export function getFoodItem(itemName) {
    if (!foodItems[itemName]) return null;
    
    const originalMesh = foodItems[itemName].mesh;
    
    // Clone geometry
    const clonedGeometry = originalMesh.geometry.clone();
    
    /**
     * Clone material while preserving ALL texture references
     * This ensures textures are NEVER lost - meshes will NEVER be gray
     */
    function cloneMaterialWithTextures(originalMat) {
        if (!originalMat) return null;
        
        // Create new material with same type as original
        const clonedMat = originalMat.clone();
        
        // CRITICAL: Overwrite ALL texture properties with original references
        // This ensures textures are shared, not cloned or lost
        if (originalMat.map) clonedMat.map = originalMat.map;
        if (originalMat.normalMap) clonedMat.normalMap = originalMat.normalMap;
        if (originalMat.roughnessMap) clonedMat.roughnessMap = originalMat.roughnessMap;
        if (originalMat.metalnessMap) clonedMat.metalnessMap = originalMat.metalnessMap;
        if (originalMat.emissiveMap) clonedMat.emissiveMap = originalMat.emissiveMap;
        if (originalMat.aoMap) clonedMat.aoMap = originalMat.aoMap;
        if (originalMat.transmissionMap) clonedMat.transmissionMap = originalMat.transmissionMap;
        if (originalMat.alphaMap) clonedMat.alphaMap = originalMat.alphaMap;
        if (originalMat.displacementMap) clonedMat.displacementMap = originalMat.displacementMap;
        if (originalMat.lightMap) clonedMat.lightMap = originalMat.lightMap;
        if (originalMat.envMap) clonedMat.envMap = originalMat.envMap;
        applyEnvironmentIntensity(clonedMat);
        
        // Copy texture-related properties
        if (originalMat.roughness !== undefined) clonedMat.roughness = originalMat.roughness;
        if (originalMat.metalness !== undefined) clonedMat.metalness = originalMat.metalness;
        if (originalMat.transmission !== undefined) clonedMat.transmission = originalMat.transmission;
        if (originalMat.color !== undefined) clonedMat.color.copy(originalMat.color);
        
        // Apply fresnel shader effect for rim lighting
        // Warm pink/peach color matching the middle of VelvetSun gradient (#f0573a)
        // Use the gradient's middle color (bright red-orange) for rim lighting
        const rimLightColor = new THREE.Color(0xf0573a); // Middle of VelvetSun gradient (bright red-orange)
        const hsl = {};
        rimLightColor.getHSL(hsl);
        // Increase saturation and brightness for rim lighting
        hsl.s = Math.min(1.0, hsl.s * 1.2); // Increase saturation by 20%
        hsl.l = Math.min(1.0, hsl.l * 1.625); // Brighten 25% more over previous 1.3 (1.3*1.25=1.625)
        // Keep the warm red-orange hue (already correct from the gradient color)
        rimLightColor.setHSL(hsl.h, hsl.s, hsl.l);
        
        const fresnelConfig = {
            color: rimLightColor,
            intensity: 1.3365, // Reduced by 10% from 1.485
            power: 4.17,
            bias: 0.0
        };
        applyFresnelToMaterial(clonedMat, fresnelConfig);
        registerFresnelMaterial(clonedMat, fresnelConfig);
        
        // Force material update
        clonedMat.needsUpdate = true;
        
        // Validate: Ensure we have at least a base color map
        if (!clonedMat.map && originalMat.map) {
            console.warn(`⚠️ Texture map missing for ${itemName} - reassigning from original`);
            clonedMat.map = originalMat.map;
        }
        
        return clonedMat;
    }
    
    // Clone material(s) with texture preservation
    let clonedMaterial;
    if (originalMesh.material) {
        if (Array.isArray(originalMesh.material)) {
            clonedMaterial = originalMesh.material.map(mat => cloneMaterialWithTextures(mat));
        } else {
            clonedMaterial = cloneMaterialWithTextures(originalMesh.material);
        }
    } else {
        // If no material exists, create a default one (shouldn't happen after texture loading)
        console.warn(`⚠️ No material found for ${itemName} - creating default material`);
        clonedMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    }
    
    // Create new mesh with cloned geometry and material
    const clonedMesh = new THREE.Mesh(clonedGeometry, clonedMaterial);
    clonedMesh.castShadow = true;
    clonedMesh.receiveShadow = true;
    
    // Center the geometry pivot point so rotation happens around center
    // This ensures items rotate around their own center, not orbiting
    if (clonedMesh.geometry) {
        // Calculate bounding box to verify center
        clonedMesh.geometry.computeBoundingBox();
        const box = clonedMesh.geometry.boundingBox;
        
        // Center the geometry around origin (0,0,0)
        clonedMesh.geometry.center();
        
        // Verify centering worked
        clonedMesh.geometry.computeBoundingBox();
        const centeredBox = clonedMesh.geometry.boundingBox;
        const center = new THREE.Vector3();
        centeredBox.getCenter(center);
        
        // Ensure center is at origin (within small tolerance)
        if (Math.abs(center.x) > 0.001 || Math.abs(center.y) > 0.001 || Math.abs(center.z) > 0.001) {
            console.warn(`⚠️ Geometry center for ${itemName} not at origin:`, center);
            // Manual centering if needed
            const offset = center.clone().multiplyScalar(-1);
            clonedMesh.geometry.translate(offset.x, offset.y, offset.z);
        }
        
        // Reset mesh position to origin after centering
        clonedMesh.position.set(0, 0, 0);
        
        // Reset mesh rotation to ensure clean state (will be set in selector)
        clonedMesh.rotation.set(0, 0, 0);
    }
    
    // Final validation: Check if textures are present
    const hasTexture = clonedMaterial && clonedMaterial.map;
    if (!hasTexture) {
        console.error(`❌ CRITICAL: Cloned mesh for ${itemName} has NO texture!`);
        // Try to get texture from original as last resort
        if (originalMesh.material && originalMesh.material.map) {
            clonedMaterial.map = originalMesh.material.map;
            clonedMaterial.needsUpdate = true;
            console.log(`✓ Recovered texture for ${itemName} from original mesh`);
        }
    }
    
    return clonedMesh;
}

function applyEnvironmentIntensity(material) {
    if (!material) return;
    if (Array.isArray(material)) {
        material.forEach(applyEnvironmentIntensity);
        return;
    }
    if ('envMapIntensity' in material) {
        material.envMapIntensity = ENV_REFLECTION_INTENSITY;
    }
}

/**
 * Get all food items as an array (for the selector)
 * @returns {Array<{name: string, mesh: THREE.Mesh}>} Array of food items
 */
export function getAllFoodItems() {
    return Object.keys(foodItems).map(name => ({
        name: name,
        mesh: getFoodItem(name)
    })).filter(item => item.mesh !== null);
}

/**
 * Get all available food item names
 * @returns {string[]} Array of food item names
 */
export function getAvailableFoodItems() {
    return Object.keys(foodItems);
}

/**
 * Get the loaded model group
 * @returns {THREE.Group} Loaded model or null
 */
export function getLoadedModel() {
    return loadedModel;
}

