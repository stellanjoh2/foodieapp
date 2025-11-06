import * as THREE from 'three';

let panel = null;
let panelMaterial = null;
let panelScene = null; // separate scene to avoid bloom
let planeZ = 0.1; // slightly in front of items near origin

export function initFrostedPanel(_scene, camera) {
    if (panel) return panel;

    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);

    // Rounded-rect alpha mask in shader; no actual blur yet (approximation test)
    panelMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
            uColor: { value: new THREE.Color(1, 1, 1) },
            uAlpha: { value: 0.10 }, // 10% white fill
            uRadius: { value: 0.08 }, // corner radius in UV units
            uShadow: { value: 0.15 }
        },
        vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
        `,
        fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uAlpha;
        uniform float uRadius;
        uniform float uShadow;

        // Signed distance to rounded rect (centered at 0.5,0.5, size 1x1 in UV)
        float sdRoundRect(vec2 p, vec2 b, float r) {
            vec2 q = abs(p) - b + vec2(r);
            return length(max(q, 0.0)) - r;
        }

        void main() {
            // Map UV to centered coords
            vec2 p = vUv - 0.5;
            // Inner half-size (slightly inset for border softness)
            vec2 halfSize = vec2(0.5 - 0.02);
            float d = sdRoundRect(p, halfSize, uRadius);

            // Smooth edge for anti-aliasing
            float aa = fwidth(d);
            float mask = 1.0 - smoothstep(0.0, aa, d);

            // Subtle inner shadow for depth
            float shadow = smoothstep(-0.02, 0.2, d) * uShadow;

            vec3 color = uColor;
            float alpha = uAlpha * mask;
            alpha = clamp(alpha, 0.0, 1.0);
            gl_FragColor = vec4(color, alpha);
            // Premultiply-ish shadowing
            gl_FragColor.rgb *= (1.0 - shadow * mask);
            if (gl_FragColor.a <= 0.001) discard;
        }
        `
    });

    panel = new THREE.Mesh(geometry, panelMaterial);
    panel.renderOrder = 999; // render on top
    panelMaterial.toneMapped = false; // don't affect bloom tonemapping

    // Create a separate scene so bloom pass doesn't touch the panel
    panelScene = new THREE.Scene();
    panelScene.add(panel);

    updatePanelTransform(camera);

    window.addEventListener('resize', () => updatePanelTransform(camera));

    return panel;
}

function updatePanelTransform(camera) {
    if (!panel) return;

    // Distance from camera to plane at planeZ (assuming camera looks at origin on -Z)
    const distance = Math.abs(camera.position.z - planeZ);
    const vFov = camera.fov * Math.PI / 180;
    const viewHeight = 2 * Math.tan(vFov / 2) * distance;
    const viewWidth = viewHeight * camera.aspect;

    // Popup size as fraction of view
    const popupWidth = viewWidth * 0.50; // 50% of screen width
    const popupHeight = viewHeight * 0.20;

    panel.scale.set(popupWidth, popupHeight, 1);

    // Position near bottom of view with slight margin
    const margin = viewHeight * 0.08; // doubled margin from bottom
    const y = -viewHeight / 2 + popupHeight / 2 + margin;
    panel.position.set(0, y, planeZ);
}

export function setFrostedVisibility(visible) {
    if (panel) panel.visible = visible;
}

export function renderFrostedPanel(renderer, camera) {
    if (!panel || !panelScene) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false; // render on top of composer output
    renderer.render(panelScene, camera);
    renderer.autoClear = autoClear;
}


