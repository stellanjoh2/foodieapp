/**
 * Item selector system
 * Manages horizontal layout of 3D food items with selection
 */

import * as THREE from 'three';
import { getAllFoodItems } from './models.js';
import { isMobile } from './utils.js';

let items = [];
let itemGroup = null;
let selectedIndex = 0;
let itemSpacing = 1.90; // Distance between items horizontally (25% more spacing than original)
let itemScale = 1;
let floatingTime = 0; // Time accumulator for floating animation

const baseRotationSpeed = 0.5; // radians per second (base speed)
const SPIN_IMPULSE_DURATION = 0.5; // seconds
const SPIN_IMPULSE_ROTATION = Math.PI; // 180 degrees
const JUMP_IMPULSE_DURATION = 0.25; // seconds
const JUMP_IMPULSE_HEIGHT = 0.22; // units

// Define display order: hearty meals first, desserts last
const itemOrder = [
    'burger',
    'pizza',
    'chicken',
    'hotdog',
    'taco',
    'fries',
    'coffee',
    'donut',
    'icecream'
];

/**
 * Per-asset scale and position adjustments
 * These allow fine-tuning individual items without breaking animations
 * Format: { scale: multiplier, position: { x, y, z } offset, rotation: { x, y, z } in degrees }
 * Scale is multiplied with base scale (1.0 = no change, 1.2 = 20% larger)
 * Position is added to the base position (0 = no change)
 * Rotation overrides the default 25° forward tilt (x-axis)
 */
const assetAdjustments = {
    'burger': { scale: 0.9, position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 30, y: 0, z: 0 } }, // 10% smaller, 10% up, 30° tilt
    'chicken': { scale: 0.9, position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 30, y: 0, z: 0 } }, // 10% smaller, 10% up, 30° tilt
    'donut': { scale: 1.0, position: { x: 0, y: 0, z: 0 }, rotation: { x: 30, y: 0, z: 30 } }, // Tilt around Z-axis (X-axis 30°, Z-axis 30°)
    'fries': { scale: 1.0, position: { x: 0, y: 0.05, z: 0 }, rotation: { x: 30, y: 0, z: 0 } }, // 5% up, 30° tilt
    'pizza': { scale: 1.0, position: { x: 0, y: 0.05, z: 0 }, rotation: { x: 30, y: 0, z: 0 } }, // 5% up, 30° tilt
    'icecream': { scale: 1.0, position: { x: 0, y: 0.05, z: 0 }, rotation: { x: 30, y: 0, z: 0 } }, // Original size (1.0), 5% up, 30° tilt
    'coffee': { scale: 1.1, position: { x: 0, y: 0, z: 0 }, rotation: { x: 30, y: 0, z: 0 } }, // Scaled to 1.1, 30° tilt
    'taco': { scale: 1.0, position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 30, y: 0, z: 0 } }, // Moved up 0.1 units, 30° tilt
    'hotdog': { scale: 1.0, position: { x: 0, y: 0.05, z: 0 }, rotation: { x: 30, y: 0, z: 0 } }, // Moved up 0.05 units, 30° tilt
};

/**
 * Initialize the item selector
 * @param {THREE.Scene} scene - Three.js scene
 * @param {THREE.Camera} camera - Camera to position for straight-on view
 * @returns {Promise<void>}
 */
export async function initSelector(scene, camera) {
    // Get all food items from the loaded model
    let allItems = getAllFoodItems();
    
    if (allItems.length === 0) {
        console.warn('No food items found to display');
        return;
    }
    
    // Reorder items: ice cream first, burger last
    // Create a map for quick lookup
    const itemsMap = {};
    allItems.forEach(item => {
        itemsMap[item.name] = item;
    });
    
    // Build ordered array
    items = [];
    itemOrder.forEach(name => {
        if (itemsMap[name]) {
            items.push(itemsMap[name]);
        }
    });
    
    // Add any remaining items that weren't in the order array
    allItems.forEach(item => {
        if (!itemOrder.includes(item.name)) {
            items.push(item);
        }
    });
    
    console.log(`Initializing selector with ${items.length} items`);
    console.log('Order:', items.map(i => i.name));
    
    // Create a group to hold all items
    itemGroup = new THREE.Group();
    
    // Calculate item spacing and scale
    // Adjust scale for mobile to ensure single item fills screen nicely
    const isMobileDevice = isMobile();
    itemScale = calculateItemScale(items);
    if (isMobileDevice) {
        // Scale down items to half size on mobile
        itemScale *= 0.5; // Half size on mobile
    }
    
    // Position items horizontally with perfect Y alignment
    items.forEach((item, index) => {
        const mesh = item.mesh;
        
        // Get per-asset adjustments if they exist
        const adjustments = assetAdjustments[item.name] || { scale: 1.0, position: { x: 0, y: 0, z: 0 } };
        
        // Apply scale with per-asset multiplier
        const adjustedScale = itemScale * adjustments.scale;
        mesh.scale.set(adjustedScale, adjustedScale, adjustedScale);
        
        // Store the per-asset scale multiplier for animation calculations
        mesh.userData.assetScaleMultiplier = adjustments.scale;
        
        // Position horizontally with ice cream at left (index 0)
        // Ice cream starts at index 0, burger at last index
        // Since geometry is centered, all items align at Y=0
        const xOffset = index * itemSpacing;
        
        // Apply per-asset position offset
        const adjustedX = xOffset + adjustments.position.x;
        const adjustedY = 0 + adjustments.position.y;
        const adjustedZ = 0 + adjustments.position.z;
        
        // Position at adjusted coordinates
        mesh.position.set(adjustedX, adjustedY, adjustedZ);
        
        // Tilt items 30 degrees forward (around X-axis) to see more from top
        // This gives a better view as items rotate around Y-axis
        // Allow per-asset rotation overrides
        const rotationX = adjustments.rotation?.x ?? 30;
        const rotationY = adjustments.rotation?.y ?? 0;
        const rotationZ = adjustments.rotation?.z ?? 0;
        
        // Convert to radians
        const rotationXRad = rotationX * Math.PI / 180;
        const rotationYRad = rotationY * Math.PI / 180;
        const rotationZRad = rotationZ * Math.PI / 180;
        
        // CRITICAL: Set rotation directly and ensure it's applied
        mesh.rotation.set(rotationXRad, rotationYRad, rotationZRad);
        
        // Debug log for problematic items
        if (['coffee', 'chicken', 'burger'].includes(item.name)) {
            console.log(`✓ Applied rotation to ${item.name}: x=${rotationX}°, y=${rotationY}°, z=${rotationZ}°`);
            console.log(`  Mesh rotation after set:`, mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
        }
        
        // Store original position with adjustments for reference
        // We'll restore this position each frame (animations won't break)
        mesh.userData.originalPosition = { x: adjustedX, y: adjustedY, z: adjustedZ };
        
        // Store original rotation X and Z (Y will be animated for spinning)
        mesh.userData.originalRotationX = rotationXRad;
        mesh.userData.originalRotationZ = rotationZRad;
        
        // Initialize target scale to prevent glitches
        mesh.userData.targetScale = index === 0 ? 1.5 : 1.0; // First item (ice cream) is selected
        
        // Initialize rotation speed (selected items spin faster)
        mesh.userData.targetRotationSpeed = index === 0 ? 3.0 : 0.5; // 3.0x for selected, 0.5x for unselected
        mesh.userData.currentRotationSpeed = mesh.userData.targetRotationSpeed;

        // No per-asset spin axis state; handled during rotation update
        
        // Add to group
        itemGroup.add(mesh);
    });
    
    // Position camera - adjust for mobile vs desktop
    // Mobile: closer camera to fill screen with single food item
    // Desktop: showing selected item with partially cropped adjacent items
    // Reuse isMobileDevice from above
    if (isMobileDevice) {
        // Mobile: closer camera, centered vertically for single item focus
        camera.position.set(0, 0, 1.76); // 20% closer than 2.2
    } else {
        // Desktop: showing selected item with partially cropped adjacent items
        camera.position.set(0, -0.40, 2.66); // Moved down 15% total (relative to view distance)
    }
    camera.lookAt(0, 0, 0);
    
    // Center view on ice cream (first item, index 0)
    itemGroup.position.x = -0 * itemSpacing; // Center on first item
    
    // Add item group to scene
    scene.add(itemGroup);
    
    // Set initial selection to ice cream (index 0)
    selectedIndex = 0;
    updateSelection();
    
    return itemGroup;
}

/**
 * Calculate appropriate scale for items based on their bounding boxes
 * @param {Array} items - Array of food items
 * @returns {number} Scale factor
 */
function calculateItemScale(items) {
    if (items.length === 0) return 1;
    
    // Get bounding box of first item to determine scale
    const box = new THREE.Box3();
    box.setFromObject(items[0].mesh);
    
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    
    // Scale items to be roughly 1 unit tall
    return 1 / maxDimension;
}

/**
 * Move selection left (towards ice cream)
 */
export function selectPrevious() {
    if (items.length === 0) return;
    
    // Don't go before ice cream (index 0) - hard stop
    if (selectedIndex > 0) {
        selectedIndex--;
        updateSelection();
        scrollToSelected();
    }
}

/**
 * Move selection right (towards burger)
 */
export function selectNext() {
    if (items.length === 0) return;
    
    // Don't go beyond burger (last index) - hard stop
    if (selectedIndex < items.length - 1) {
        selectedIndex++;
        updateSelection();
        scrollToSelected();
    }
}

/**
 * Update visual selection (highlight, scale, etc.)
 */
function updateSelection() {
    if (!itemGroup) return;
    
    items.forEach((item, index) => {
        const mesh = item.mesh;
        const isSelected = index === selectedIndex;
        
        // Scale selected item 1.5x compared to non-selected (1.0x)
        const targetScale = isSelected ? 1.5 : 1.0;
        
        // Rotation speed: selected items spin 3.0x, unselected spin at 0.5x
        const targetRotationSpeed = isSelected ? 3.0 : 0.5;
        
        // Set target scale - smooth interpolation will handle the transition
        // Don't immediately set scale, let the update loop handle it smoothly
        mesh.userData.targetScale = targetScale;
        mesh.userData.targetRotationSpeed = targetRotationSpeed;
        mesh.userData.isSelected = isSelected;
        
        // Ensure we always have a target scale set (prevents undefined glitches)
        if (mesh.userData.targetScale === undefined) {
            mesh.userData.targetScale = 1.0;
        }
    });
}

/**
 * Scroll items horizontally to center the selected item
 */
function scrollToSelected() {
    if (!itemGroup) return;
    
    // Calculate target X position to center selected item
    // Since items are positioned starting at x=0 and going right,
    // we need to shift left to center the selected item
    const targetX = -selectedIndex * itemSpacing;
    
    // Store target position for animation
    itemGroup.userData.targetX = targetX;
}

/**
 * Update selector (called each frame for animations)
 * @param {number} deltaTime - Time since last frame (in seconds)
 */
export function updateSelector(deltaTime = 0.016) {
    if (!itemGroup) return;
    
    // Clamp deltaTime to prevent large jumps
    const clampedDelta = Math.min(deltaTime, 0.1);
    
    // Update floating animation time (accumulate over time)
    floatingTime += clampedDelta;
    
    // Smoothly scroll to target position using exponential smoothing
    if (itemGroup.userData.targetX !== undefined) {
        const currentX = itemGroup.position.x;
        const targetX = itemGroup.userData.targetX;
        const distance = targetX - currentX;
        
        // Exponential smoothing - smoother and more natural
        // Use frame-rate independent lerp speed
        const lerpFactor = 1 - Math.exp(-12 * clampedDelta); // Adjust 12 for speed
        
        itemGroup.position.x += distance * lerpFactor;
        
        // Stop when very close (smaller threshold to prevent glitches)
        if (Math.abs(distance) < 0.001) {
            itemGroup.position.x = targetX;
            delete itemGroup.userData.targetX;
        }
    }
    
    // Update item scales with smooth, seamless animation
    items.forEach((item, index) => {
        const mesh = item.mesh;
        
        // Initialize scale if not set
        if (mesh.userData.targetScale === undefined) {
            mesh.userData.targetScale = 1.0;
        }
        
        // Get current normalized scale (accounting for per-asset scale multiplier)
        const assetScaleMultiplier = mesh.userData.assetScaleMultiplier || 1.0;
        const baseScale = itemScale * assetScaleMultiplier;
        const currentScale = mesh.scale.x / baseScale;
        const targetScale = mesh.userData.targetScale;
        
        // Use exponential smoothing for seamless transitions
        // Frame-rate independent for consistent smoothness
        const lerpFactor = 1 - Math.exp(-10 * clampedDelta); // Adjust 10 for speed
        
        // Smooth interpolation (respecting per-asset scale multiplier)
        const newScale = currentScale + (targetScale - currentScale) * lerpFactor;
        const finalScale = newScale * baseScale;
        
        // Apply scale smoothly
        mesh.scale.set(finalScale, finalScale, finalScale);
        
        // Ensure position stays fixed (no position changes on selection)
        // Only scale affects the item
        if (mesh.userData.originalPosition) {
            const origPos = mesh.userData.originalPosition;
            const phaseOffset = index * 0.5;
            const floatSpeed = mesh.userData.isSelected ? 1.5 : 1.2;
            const floatAmplitude = 0.06875;
            const floatingOffset = Math.sin(floatingTime * floatSpeed + phaseOffset) * floatAmplitude;

            let jumpOffset = 0;
            if (mesh.userData.jumpImpulses && mesh.userData.jumpImpulses.length) {
                let totalJump = 0;
                mesh.userData.jumpImpulses = mesh.userData.jumpImpulses.filter((impulse) => {
                    impulse.elapsed += clampedDelta;
                    const progress = Math.min(1, impulse.elapsed / JUMP_IMPULSE_DURATION);
                    const offset = Math.sin(progress * Math.PI) * JUMP_IMPULSE_HEIGHT;
                    totalJump += offset;
                    return progress < 1;
                });
                jumpOffset = totalJump;
            }

            mesh.position.set(origPos.x, origPos.y + floatingOffset + jumpOffset, origPos.z);
        }
        
        // Ensure rotation X and Z stay fixed (only Y or Z rotates for spinning)
        if (mesh.userData.originalRotationX !== undefined) {
            mesh.rotation.x = mesh.userData.originalRotationX;
        }
        if (mesh.userData.originalRotationZ !== undefined) {
            mesh.rotation.z = mesh.userData.originalRotationZ;
        }
    });
    
    // Make items spin around their own axis
    // Use frame-rate independent rotation with variable speed based on selection
    items.forEach((item) => {
        const mesh = item.mesh;
        
        // Initialize rotation speed if not set
        if (mesh.userData.targetRotationSpeed === undefined) {
            mesh.userData.targetRotationSpeed = 0.5;
        }
        if (mesh.userData.currentRotationSpeed === undefined) {
            mesh.userData.currentRotationSpeed = 0.5;
        }
        
        // Smoothly transition rotation speed when selection changes
        const currentSpeed = mesh.userData.currentRotationSpeed;
        const targetSpeed = mesh.userData.targetRotationSpeed;
        const speedDifference = targetSpeed - currentSpeed;
        
        // Use exponential smoothing for speed transition (same as scale)
        const speedLerpFactor = 1 - Math.exp(-10 * clampedDelta);
        const newSpeed = currentSpeed + speedDifference * speedLerpFactor;
        mesh.userData.currentRotationSpeed = newSpeed;
        
        // Apply rotation with current speed multiplier
        const actualRotationSpeed = baseRotationSpeed * newSpeed;
        mesh.rotation.y += actualRotationSpeed * clampedDelta;

        if (mesh.userData.spinImpulses && mesh.userData.spinImpulses.length) {
            mesh.userData.spinImpulses = mesh.userData.spinImpulses.filter((impulse) => {
                const prevProgress = impulse.elapsed / SPIN_IMPULSE_DURATION;
                impulse.elapsed += clampedDelta;
                const nextProgress = Math.min(1, impulse.elapsed / SPIN_IMPULSE_DURATION);
                const prevAngle = impulse.angle;
                const eased = easeOutCubic(nextProgress);
                const totalAngle = SPIN_IMPULSE_ROTATION * eased;
                const deltaAngle = totalAngle - prevAngle;
                mesh.rotation.y += deltaAngle;
                impulse.angle = totalAngle;
                return nextProgress < 1;
            });
        }

    });
}

function easeOutCubic(t) {
    const inv = 1 - t;
    return 1 - inv * inv * inv;
}

export function addSpinImpulse(mesh) {
    if (!mesh) return;
    if (!mesh.userData.spinImpulses) {
        mesh.userData.spinImpulses = [];
    }
    mesh.userData.spinImpulses.push({ elapsed: 0, angle: 0 });
    if (!mesh.userData.jumpImpulses) {
        mesh.userData.jumpImpulses = [];
    }
    mesh.userData.jumpImpulses.push({ elapsed: 0 });
}

/**
 * Get currently selected item
 * @returns {Object} Selected item {name, mesh} or null
 */
export function getSelectedItem() {
    if (items.length === 0 || selectedIndex >= items.length) return null;
    return items[selectedIndex];
}

/**
 * Get selected index
 * @returns {number} Current selected index
 */
export function getSelectedIndex() {
    return selectedIndex;
}

/**
 * Get total item count
 * @returns {number} Number of items
 */
export function getItemCount() {
    return items.length;
}

