# Food Shop Item Selector

A Three.js-based food item selector with interactive 3D models.

## Project Structure

```
Foodapp/
├── src/                    # Source code (readable, unminified)
│   ├── main.js            # Main application entry point
│   ├── scene.js           # Three.js scene setup
│   ├── models.js          # 3D model loading and management
│   ├── selector.js        # Horizontal item selector layout
│   ├── controls.js        # User interaction controls (keyboard, gamepad)
│   ├── animations.js      # Animation management
│   └── utils.js           # Utility functions
├── fast_food_stylized_glb/ # 3D assets (GLB files, textures)
├── index.html             # Main HTML file
└── README.md              # This file
```

## Architecture

### Module Boundaries
- **main.js**: Application initialization, state management, coordination
- **scene.js**: Three.js scene, camera, renderer setup, lighting
- **models.js**: GLB loading, mesh extraction, food item management
- **selector.js**: Horizontal item layout, selection, scrolling animations
- **controls.js**: User input handling (keyboard, gamepad, mouse, touch)
- **animations.js**: GSAP timelines and animation sequences (future)
- **utils.js**: Helper functions, performance utilities

### Data Flow
1. **Initialization**: main.js → scene.js → models.js → selector.js
2. **User Input**: controls.js → main.js → selector.js
3. **Rendering**: scene.js render loop → selector.js updates → models.js

## Development

### Local Server
Three.js requires HTTP server (ES modules). Run:
```bash
python3 -m http.server 8000
# or
npx serve
```

Then open: `http://localhost:8000`

## Performance Targets
- **Frame Rate**: 60fps target
- **Device Pixel Ratio**: Capped at 1.5
- **Mobile**: Adaptive rendering based on device capabilities

## Features

### Item Selector
- Horizontal layout of 3D food items
- Camera positioned straight-on, showing ~3 items at once
- Selected item centered on screen
- Smooth scrolling animations

### Controls
- **Keyboard**: Arrow keys (← →) or A/D keys to navigate
- **Gamepad**: D-pad left/right or left stick horizontal axis
- Automatically detects connected gamepads

### GLB Analysis
On load, the application will:
- Analyze the GLB file structure
- Log all mesh names found in the console
- Extract food items by matching mesh names
- Display extracted items in the selector

## Notes
- Source code stays readable (no minification in dev)
- Complex logic includes inline documentation
- Test each feature incrementally
- Check browser console for GLB mesh analysis on load

## Production Tips
- **Compression & caching**: when deploying behind a static host or CDN, enable Brotli/Gzip and send long-lived cache headers for `/3d-assets`, `/Images`, `/Music`, and `/Sounds`.
- **Bundling**: if the JS bundle grows, consider introducing a build step (Vite/Rollup) so Three.js and app modules can be code-split and tree-shaken before deployment.
- **Asset pipelines**: precompress textures and audio beyond dev defaults; ship `.basis`/`.ktx2` textures and `.ogg` audio where supported for lighter downloads.

## Other Projects

- **Gridzone** – A retro-inspired arena puzzler where you chain tactical moves across an isometric grid. Under the candy visuals sits a lightweight ECS-style core that keeps combos, power-ups, and enemy AI running at 60 fps.
- **Foodieapp** – This immersive Three.js menu highlights dishes with HDR lighting, bloom-tuned specular highlights, and haptic-friendly controls across desktop, mobile, and gamepad.
- **Carholo** – A WebXR concept that drops holographic car models into your space. Gestures, baked ambient occlusion, and adaptive assets keep the AR experience smooth on mid-range hardware.


