/**
 * Interactive 3D Wallpaper
 * Engine: Three.js + math.js
 */

(function () {
  'use strict';

  // --- State & Variables ---
  let scene, camera, renderer, controls;
  let gridHelper;
  let worldGroup; // Group containing customAxesGroup and rootGroup (scales for mirroring)
  let customAxesGroup;
  let rootGroup; // Group containing user geometry (points, lines, math meshes)
  let mathMeshGroup;
  let particlesMesh, ambientLight, dirLight1, dirLight2;

  // Mirror State (1 = normal, -1 = mirrored)
  const mirrorState = { x: 1, y: 1, z: 1 };

  // Object Rotation State (図形自体の回転)
  let objectRotZ = 0;        // In radians (horizontal)
  let objectRotVertical = 0; // In radians (vertical / X-tilt)
  const TWO_PI = Math.PI * 2;
  let previousFrameTime = null;
  let spinAxis = 'z';        // 'z' | 'vertical' | 'both'

  // Theme & Interaction State
  let currentTheme = 'light'; // Default: 'light' (白基調), toggle to 'dark'
  let currentMode = 'rotate';  // 'rotate' | 'pan' | 'draw'
  let autoSpin = false;
  let drawHeight = 0;          // Current Z height for drawing
  let currentPlotRange = 6.0;  // Range: [-currentPlotRange, currentPlotRange]

  const defaultColors = {
    surface: '#0284c7',
    point: '#0284c7',
    line: '#0ea5e9',
    axisX: '#ef4444',
    axisY: '#10b981',
    axisZ: '#2563eb'
  };
  let colors = { ...defaultColors };
  const drawnPoints = [];      // [{ position: Vector3, mesh: Mesh, lineMesh: Line|null }]
  let loopPoints = false;       // Whether to close loop between first and last point
  let loopLineMesh = null;     // Mesh connecting first and last point
  let polygonFillMesh = null;
  let polygonOutlineMeshes = [];
  let connectPoints = true;
  let fillPolygon = false;
  let lineWidth = 2;
  let pointSize = 0.24;

  // Formula State
  let formulaType = 'explicit'; // 'explicit' | 'parametric'
  let autoSpinSpeed = 1.0;

  // Display Settings
  const displaySettings = {
    grid: true,
    axes: true,
    particles: true,
    eco: true
  };

  // Custom Light State (光源の位置調整)
  let customLightEnabled = false;
  const defaultLightState = {
    x: 15,
    y: 20,
    z: 25,
    intensity: 0.7,
    color: '#38bdf8'
  };
  const lightState = { ...defaultLightState };
  let lightMarkerGroup = null;
  let lightBeamLine = null;
  let lightBulbMesh = null;
  let lightGlowMesh = null;

  // Rendering Demand State (Eco / Power Saving)
  let renderFramesRemaining = 60;
  let animationFrameId = null;
  function requestRender(frames = 30) {
    renderFramesRemaining = Math.max(renderFramesRemaining, frames);
    if (animationFrameId === null) animationFrameId = requestAnimationFrame(animate);
  }

  // --- 2-Step Point Plotting State (1. XY Plane -> 2. Z Height) ---
  let plotStep = 'step1_xy'; // 'step1_xy' | 'step2_z'
  const pendingPoint = { x: 0, y: 0, z: 0 };
  const localDrawPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // Local XY Plane (Z = 0)
  const step2VerticalPlane = new THREE.Plane(); // Camera-facing vertical plane for height adjustment

  // Plot Helpers & Visual Guides
  let ghostMarker;          // XY snap preview (Step 1)
  let step1PreviewLine;     // Line preview from last point to ghostMarker (Step 1)
  let zGuideGroup;          // Group containing all Step 2 visual guides
  let zFloorAnchorMesh;     // Circle/Ring on XY plane at (x, y, 0)
  let zAxisFullLineMesh;    // Vertical dashed guide axis line (from -25 to +25)
  let zAxisRodMesh;         // Solid vertical rod from (x, y, 0) to (x, y, z)
  let zHeightSphereMesh;    // Sphere at (x, y, z)
  let zPreviewLineMesh;     // Preview line from last point to current (x, y, z)

  // Raycasting
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Preset Explicit Formulas (z = f(x, y))
  const presets = {
    ripple: "sin(sqrt(x^2 + y^2) * 1.5) / (sqrt(x^2 + y^2) * 0.5 + 1) * 2",
    saddle: "0.15 * (x^2 - y^2)",
    hills: "cos(x * 1.2) * sin(y * 1.2) * 1.5",
    sombrero: "sin(sqrt(x^2 + y^2)) * 1.8",
    paraboloid: "(x^2 + y^2) / 8 - 2",
    eggcarton: "0.8 * (sin(x * 1.5) + sin(y * 1.5))"
  };

  // Preset Parametric Surfaces ((x,y,z) = f(u, v))
  const parametricPresets = {
    torus: {
      name: "トーラス",
      x: "(4 + 1.2 * cos(v)) * cos(u)",
      y: "(4 + 1.2 * cos(v)) * sin(u)",
      z: "1.2 * sin(v)",
      uMin: "0", uMax: "2 * pi",
      vMin: "0", vMax: "2 * pi"
    },
    mobius: {
      name: "メビウスの帯",
      x: "(3.5 + v * cos(u / 2)) * cos(u)",
      y: "(3.5 + v * cos(u / 2)) * sin(u)",
      z: "v * sin(u / 2)",
      uMin: "0", uMax: "2 * pi",
      vMin: "-1.2", vMax: "1.2"
    },
    klein: {
      name: "クラインの壺",
      x: "(2.5 + cos(u / 2) * sin(v) - sin(u / 2) * sin(2 * v)) * cos(u)",
      y: "(2.5 + cos(u / 2) * sin(v) - sin(u / 2) * sin(2 * v)) * sin(u)",
      z: "sin(u / 2) * sin(v) + cos(u / 2) * sin(2 * v) * 1.4",
      uMin: "0", uMax: "2 * pi",
      vMin: "0", vMax: "2 * pi"
    },
    helix: {
      name: "螺旋曲面",
      x: "(3 + 0.8 * cos(v)) * cos(u)",
      y: "(3 + 0.8 * cos(v)) * sin(u)",
      z: "u * 0.55 + 0.8 * sin(v)",
      uMin: "-2 * pi", uMax: "2 * pi",
      vMin: "0", vMax: "2 * pi"
    },
    lissajous: {
      name: "リサージュ立体",
      x: "3.5 * sin(2 * u) + 0.8 * cos(v)",
      y: "3.5 * cos(3 * u) + 0.8 * sin(v)",
      z: "2.2 * sin(4 * u) + 0.8 * sin(v)",
      uMin: "-pi", uMax: "pi",
      vMin: "-pi", vMax: "pi"
    },
    sphere: {
      name: "球体",
      x: "4 * sin(u) * cos(v)",
      y: "4 * sin(u) * sin(v)",
      z: "4 * cos(u)",
      uMin: "0", uMax: "pi",
      vMin: "0", vMax: "2 * pi"
    }
  };

  // --- Initialization ---
  function init() {
    const container = document.getElementById('canvas-container');

    // 1. Scene setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf8fafc, 0.02);

    // World group (supports XYZ mirroring)
    worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // Root group for user drawings and math objects (supports manual/auto rotation)
    rootGroup = new THREE.Group();
    worldGroup.add(rootGroup);

    mathMeshGroup = new THREE.Group();
    rootGroup.add(mathMeshGroup);

    // 2. Camera setup (Mathematical coordinate system: Z is UP)
    // 自然で直交対称が美しく見える黄金アングル (X=18, Y=-18, Z=14)
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.up.set(0, 0, 1); // Mathematical convention: Z is vertical
    camera.position.set(18, -18, 14);

    // 3. Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.maxDistance = 80;
    controls.minDistance = 2;
    controls.target.set(0, 0, 0);
    controls.addEventListener('change', () => requestRender(25));

    // 5. Lighting
    ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    dirLight1 = new THREE.DirectionalLight(0x0284c7, 0.7);
    dirLight1.position.set(15, 20, 25);
    scene.add(dirLight1);

    dirLight2 = new THREE.DirectionalLight(0xf43f5e, 0.4);
    dirLight2.position.set(-15, -20, -10);
    scene.add(dirLight2);

    // Light marker helper
    createLightMarker();

    // 6. Helpers (Custom 3D Axes with Cones + Grid)
    setupCustomAxes();
    setupGrid();
    createBackgroundParticles();

    // 7. Interactive 2-Step Plot Helpers
    createPlotHelpers();

    // 8. Event Listeners & UI Binding
    setupEventListeners();
    setupUI();

    // 9. Restore Saved State (Theme, Math, Points, Mirror, Rotation)
    restoreSavedState();

    // 10. Wallpaper Engine Listener
    setupWallpaperEngineListener();

    // 11. Start Animation Loop
    animate();
  }

  // --- Theme Management (Light / Dark) ---
  function setTheme(theme) {
    currentTheme = theme;
    const isDark = (theme === 'dark');

    // Update Body CSS class
    document.body.classList.toggle('theme-dark', isDark);

    // Update Three.js scene background & fog
    const bgColor = isDark ? 0x080a10 : 0xf8fafc;
    scene.background = new THREE.Color(bgColor);
    scene.fog.color = new THREE.Color(bgColor);

    // Update Lights
    ambientLight.intensity = isDark ? 0.65 : 0.85;
    if (!customLightEnabled) {
      dirLight1.intensity = isDark ? 0.9 : 0.7;
      dirLight1.color.setHex(isDark ? 0x38bdf8 : 0x0284c7);
    } else {
      updateLight(false);
    }

    // Update Particles
    if (particlesMesh) {
      particlesMesh.material.opacity = isDark ? 0.35 : 0.18;
      particlesMesh.material.color.setHex(isDark ? 0x38bdf8 : 0x64748b);
    }

    // Rebuild Grid with theme colors
    rebuildGrid(isDark);

    // Update Theme Toggle Button Title
    const btnTheme = document.getElementById('btn-toggle-theme');
    if (btnTheme) {
      btnTheme.title = isDark ? 'ライトモードに切り替え (Tキー)' : 'ダークモードに切り替え (Tキー)';
    }

    saveState();
  }

  function toggleTheme() {
    setTheme(currentTheme === 'light' ? 'dark' : 'light');
  }

  // --- Grid Helper ---
  function setupGrid() {
    rebuildGrid(currentTheme === 'dark');
  }

  function rebuildGrid(isDark = (currentTheme === 'dark')) {
    if (gridHelper) scene.remove(gridHelper);

    // 描画範囲（currentPlotRange）に合わせてグリッドサイズも動的に伸縮
    const gridSize = Math.max(20, Math.ceil((currentPlotRange * 2 + 6) / 4) * 4);
    const gridDivisions = gridSize;
    const centerColor = isDark ? 0x38bdf8 : 0x94a3b8;
    const gridColor = isDark ? 0x1e293b : 0xe2e8f0;

    gridHelper = new THREE.GridHelper(gridSize, gridDivisions, centerColor, gridColor);
    gridHelper.rotation.x = Math.PI / 2; // Lie on XY plane (Z=0)
    gridHelper.position.z = 0;
    gridHelper.renderOrder = 0;
    scene.add(gridHelper);
  }

  // --- Custom 3D Axes with Cones (Arrows) & Negative Directions ---
  function setupCustomAxes() {
    if (customAxesGroup && worldGroup) {
      worldGroup.remove(customAxesGroup);
    }
    customAxesGroup = new THREE.Group();
    customAxesGroup.renderOrder = 2;

    // 描画範囲（currentPlotRange）に合わせて軸の長さを動的に決定
    const axisLength = Math.max(10, currentPlotRange * 1.5);
    const coneRadius = 0.36;
    const coneHeight = 1.2;

    // Axis definitions: name, positive direction, negative direction, color
    const axesData = [
      { name: 'X', dir: new THREE.Vector3(1, 0, 0), colorHex: parseInt(colors.axisX.replace('#', '0x')) },
      { name: 'Y', dir: new THREE.Vector3(0, 1, 0), colorHex: parseInt(colors.axisY.replace('#', '0x')) },
      { name: 'Z', dir: new THREE.Vector3(0, 0, 1), colorHex: parseInt(colors.axisZ.replace('#', '0x')) }
    ];

    axesData.forEach(axis => {
      // 1. Positive Line (Solid & Vibrant)
      const posGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        axis.dir.clone().multiplyScalar(axisLength)
      ]);
      const posMat = new THREE.LineBasicMaterial({
        color: axis.colorHex,
        linewidth: 2.5
      });
      const posLine = new THREE.Line(posGeom, posMat);
      customAxesGroup.add(posLine);

      // 2. Positive Arrow Head: Triangular Cone (三角錐 / コーン - 正方向の目印)
      const coneGeom = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
      const coneMat = new THREE.MeshStandardMaterial({
        color: axis.colorHex,
        roughness: 0.3,
        metalness: 0.2
      });
      const coneMesh = new THREE.Mesh(coneGeom, coneMat);

      // Align cone's default orientation (0,1,0) to target axis.dir
      const up = new THREE.Vector3(0, 1, 0);
      coneMesh.quaternion.setFromUnitVectors(up, axis.dir);
      // Position cone at the tip
      coneMesh.position.copy(axis.dir.clone().multiplyScalar(axisLength));
      customAxesGroup.add(coneMesh);

      // 3. Negative Line (Dashed / Semi-transparent to clearly differentiate negative direction)
      const negGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        axis.dir.clone().multiplyScalar(-axisLength)
      ]);
      const negLineGeom = negGeom.clone();
      const lineDistances = [0, axisLength];
      negLineGeom.setAttribute('lineDistance', new THREE.Float32BufferAttribute(lineDistances, 1));

      const negMat = new THREE.LineDashedMaterial({
        color: axis.colorHex,
        dashSize: 0.5,
        gapSize: 0.3,
        transparent: true,
        opacity: 0.55
      });
      const negLine = new THREE.Line(negLineGeom, negMat);
      negLine.computeLineDistances();
      customAxesGroup.add(negLine);
    });

    worldGroup.add(customAxesGroup);
  }

  function updateAxesColors() {
    setupCustomAxes();

    const elX = document.querySelector('#axes-legend .axis-x');
    const elY = document.querySelector('#axes-legend .axis-y');
    const elZ = document.querySelector('#axes-legend .axis-z');
    if (elX) elX.style.color = colors.axisX;
    if (elY) elY.style.color = colors.axisY;
    if (elZ) elZ.style.color = colors.axisZ;
  }

  // --- Background Particles ---
  function createBackgroundParticles() {
    const particleCount = 140;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 120;
      positions[i + 1] = (Math.random() - 0.5) * 120;
      positions[i + 2] = (Math.random() - 0.5) * 120;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: 0.9,
      color: 0x64748b,
      transparent: true,
      opacity: 0.18,
      blending: THREE.NormalBlending
    });

    particlesMesh = new THREE.Points(geometry, material);
    scene.add(particlesMesh);
  }

  // --- Light Marker & Custom Position (光源の位置調整) ---
  function createLightMarker() {
    if (lightMarkerGroup) {
      scene.remove(lightMarkerGroup);
    }
    lightMarkerGroup = new THREE.Group();
    lightMarkerGroup.visible = false;
    scene.add(lightMarkerGroup);

    // 1. Center glowing bulb
    const bulbGeom = new THREE.SphereGeometry(0.5, 16, 16);
    const bulbMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8
    });
    lightBulbMesh = new THREE.Mesh(bulbGeom, bulbMat);
    lightMarkerGroup.add(lightBulbMesh);

    // 2. Translucent halo ring / glow sphere
    const glowGeom = new THREE.SphereGeometry(0.85, 12, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });
    lightGlowMesh = new THREE.Mesh(glowGeom, glowMat);
    lightMarkerGroup.add(lightGlowMesh);

    // 3. Beam line to origin (dashed line)
    const beamGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(lightState.x, lightState.y, lightState.z),
      new THREE.Vector3(0, 0, 0)
    ]);
    beamGeom.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, 50], 1));
    const beamMat = new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 0.5,
      gapSize: 0.3,
      transparent: true,
      opacity: 0.55
    });
    lightBeamLine = new THREE.Line(beamGeom, beamMat);
    lightBeamLine.computeLineDistances();
    lightBeamLine.visible = false;
    scene.add(lightBeamLine);
  }

  function updateLight(updateInputs = true) {
    if (!dirLight1) return;

    if (customLightEnabled) {
      dirLight1.position.set(lightState.x, lightState.y, lightState.z);
      dirLight1.intensity = lightState.intensity;
      dirLight1.color.set(lightState.color);

      if (lightMarkerGroup) {
        lightMarkerGroup.position.set(lightState.x, lightState.y, lightState.z);
        lightMarkerGroup.visible = true;
      }
      if (lightBulbMesh && lightBulbMesh.material) {
        lightBulbMesh.material.color.set(lightState.color);
      }
      if (lightGlowMesh && lightGlowMesh.material) {
        lightGlowMesh.material.color.set(lightState.color);
      }
      if (lightBeamLine) {
        const pts = [
          new THREE.Vector3(lightState.x, lightState.y, lightState.z),
          new THREE.Vector3(0, 0, 0)
        ];
        lightBeamLine.geometry.setFromPoints(pts);
        lightBeamLine.computeLineDistances();
        lightBeamLine.visible = true;
      }
    } else {
      dirLight1.position.set(defaultLightState.x, defaultLightState.y, defaultLightState.z);
      const isDark = (currentTheme === 'dark');
      dirLight1.intensity = isDark ? 0.9 : 0.7;
      dirLight1.color.setHex(isDark ? 0x38bdf8 : 0x0284c7);

      if (lightMarkerGroup) lightMarkerGroup.visible = false;
      if (lightBeamLine) lightBeamLine.visible = false;
    }

    // UI sync
    const valX = document.getElementById('light-x-val');
    const valY = document.getElementById('light-y-val');
    const valZ = document.getElementById('light-z-val');
    const valInt = document.getElementById('light-intensity-val');

    if (valX) valX.textContent = lightState.x.toFixed(1);
    if (valY) valY.textContent = lightState.y.toFixed(1);
    if (valZ) valZ.textContent = lightState.z.toFixed(1);
    if (valInt) valInt.textContent = lightState.intensity.toFixed(2);

    if (updateInputs) {
      const slX = document.getElementById('light-x-slider');
      const slY = document.getElementById('light-y-slider');
      const slZ = document.getElementById('light-z-slider');
      const slInt = document.getElementById('light-intensity-slider');
      const cpColor = document.getElementById('light-color-picker');

      if (slX && document.activeElement !== slX) slX.value = lightState.x;
      if (slY && document.activeElement !== slY) slY.value = lightState.y;
      if (slZ && document.activeElement !== slZ) slZ.value = lightState.z;
      if (slInt && document.activeElement !== slInt) slInt.value = lightState.intensity;
      if (cpColor) cpColor.value = lightState.color;
    }

    requestRender(20);
  }

  function setCustomLightEnabled(enabled) {
    customLightEnabled = enabled;
    const btnToggle = document.getElementById('toggle-custom-light');
    const controlsContainer = document.getElementById('light-controls-container');

    if (btnToggle) btnToggle.classList.toggle('active', customLightEnabled);
    if (controlsContainer) controlsContainer.classList.toggle('light-controls-active', customLightEnabled);

    updateLight(true);
    saveState();
  }

  // --- 2-Step Plot Helpers & Visuals (Step 1: Pick XY -> Step 2: Z Height) ---
  function createPlotHelpers() {
    const pointColorHex = parseInt(colors.point.replace('#', '0x'));
    const lineColorHex = parseInt(colors.line.replace('#', '0x'));

    // 1. Step 1: Ghost Marker (Ring + dot on XY plane)
    const ghostGroup = new THREE.Group();
    const ringGeom = new THREE.RingGeometry(0.18, 0.28, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: pointColorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ghostGroup.add(ringMesh);

    const dotGeom = new THREE.SphereGeometry(0.12, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({
      color: pointColorHex,
      transparent: true,
      opacity: 0.95
    });
    const dotMesh = new THREE.Mesh(dotGeom, dotMat);
    ghostGroup.add(dotMesh);

    ghostMarker = ghostGroup;
    ghostMarker.visible = false;
    rootGroup.add(ghostMarker);

    // Step 1: Preview Line from last point to ghostMarker
    const step1LineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0)
    ]);
    const step1LineMat = new THREE.LineDashedMaterial({
      color: lineColorHex,
      dashSize: 0.35,
      gapSize: 0.2,
      transparent: true,
      opacity: 0.65
    });
    step1PreviewLine = new THREE.Line(step1LineGeom, step1LineMat);
    step1PreviewLine.visible = false;
    rootGroup.add(step1PreviewLine);

    // 2. Step 2: Z-Guide Group
    zGuideGroup = new THREE.Group();
    zGuideGroup.visible = false;

    // (a) Floor Anchor: Double ring on the floor (Z = 0)
    const anchorGeom = new THREE.RingGeometry(0.24, 0.38, 32);
    const anchorMat = new THREE.MeshBasicMaterial({
      color: pointColorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    zFloorAnchorMesh = new THREE.Mesh(anchorGeom, anchorMat);
    zGuideGroup.add(zFloorAnchorMesh);

    const anchorDotGeom = new THREE.CircleGeometry(0.08, 16);
    const anchorDotMesh = new THREE.Mesh(anchorDotGeom, anchorMat);
    zGuideGroup.add(anchorDotMesh);

    // (b) Full Vertical Dashed Guide Axis (reference vertical line)
    const fullAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -25),
      new THREE.Vector3(0, 0, 25)
    ]);
    fullAxisGeom.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, 50], 1));
    const fullAxisMat = new THREE.LineDashedMaterial({
      color: 0x2563eb,
      dashSize: 0.45,
      gapSize: 0.3,
      transparent: true,
      opacity: 0.45
    });
    zAxisFullLineMesh = new THREE.Line(fullAxisGeom, fullAxisMat);
    zAxisFullLineMesh.computeLineDistances();
    zGuideGroup.add(zAxisFullLineMesh);

    // (c) Vertical Rod from (x, y, 0) to (x, y, z)
    const rodGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0)
    ]);
    const rodMat = new THREE.LineBasicMaterial({
      color: lineColorHex,
      linewidth: 3,
      transparent: true,
      opacity: 0.95
    });
    zAxisRodMesh = new THREE.Line(rodGeom, rodMat);
    zGuideGroup.add(zAxisRodMesh);

    // (d) Height Sphere (the actual point being adjusted)
    const topSphereGeom = new THREE.SphereGeometry(0.26, 16, 16);
    const topSphereMat = new THREE.MeshStandardMaterial({
      color: pointColorHex,
      emissive: pointColorHex,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.4
    });
    zHeightSphereMesh = new THREE.Mesh(topSphereGeom, topSphereMat);
    zGuideGroup.add(zHeightSphereMesh);

    // (e) Preview connection line to previous point
    const previewLineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0)
    ]);
    const previewLineMat = new THREE.LineDashedMaterial({
      color: lineColorHex,
      dashSize: 0.35,
      gapSize: 0.2,
      transparent: true,
      opacity: 0.85
    });
    zPreviewLineMesh = new THREE.Line(previewLineGeom, previewLineMat);
    zPreviewLineMesh.visible = false;
    zGuideGroup.add(zPreviewLineMesh);

    rootGroup.add(zGuideGroup);
  }

  // --- Local Raycasting in rootGroup Space ---
  function getLocalRay() {
    raycaster.setFromCamera(mouse, camera);
    rootGroup.updateMatrixWorld();
    const inverseWorld = new THREE.Matrix4().copy(rootGroup.matrixWorld).invert();
    return raycaster.ray.clone().applyMatrix4(inverseWorld);
  }

  // --- Step 1: Update XY Preview on Floor Plane ---
  function updateStep1Preview(localRay) {
    const intersect = new THREE.Vector3();
    const hasIntersect = localRay.intersectPlane(localDrawPlane, intersect);

    if (hasIntersect) {
      ghostMarker.visible = true;
      ghostMarker.position.set(intersect.x, intersect.y, 0);

      // Connect preview line to last point
      if (drawnPoints.length > 0) {
        const lastPos = drawnPoints[drawnPoints.length - 1].position;
        const pts = [lastPos, new THREE.Vector3(intersect.x, intersect.y, 0)];
        step1PreviewLine.geometry.setFromPoints(pts);
        step1PreviewLine.computeLineDistances();
        step1PreviewLine.visible = true;
      } else {
        step1PreviewLine.visible = false;
      }

      updateCoordinateDisplay(intersect.x, intersect.y, 0, '(XY決定)');
      updateHint('【ステップ 1/2】XY 平面上の位置をクリックしてください');
    } else {
      ghostMarker.visible = false;
      step1PreviewLine.visible = false;
    }
  }

  // --- Step 2: Transition from XY Pick to Z Height Adjustment ---
  function startStep2(x, y) {
    pendingPoint.x = x;
    pendingPoint.y = y;
    pendingPoint.z = 0;
    plotStep = 'step2_z';

    ghostMarker.visible = false;
    step1PreviewLine.visible = false;
    zGuideGroup.visible = true;

    // Position static floor anchor and full vertical axis at (x, y)
    zFloorAnchorMesh.position.set(x, y, 0);
    zAxisFullLineMesh.position.set(x, y, 0);

    // Setup camera-facing vertical plane passing through (x, y, 0)
    updateVerticalPlane();

    // Initial update of height visuals
    updateZHeightVisuals();
  }

  function updateVerticalPlane() {
    const localRay = getLocalRay();
    // Normal vector pointing from (pendingPoint.x, pendingPoint.y, 0) towards camera in local space
    const normal = new THREE.Vector3(localRay.origin.x - pendingPoint.x, localRay.origin.y - pendingPoint.y, 0);
    if (normal.lengthSq() < 0.0001) {
      normal.set(1, 0, 0);
    } else {
      normal.normalize();
    }
    step2VerticalPlane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(pendingPoint.x, pendingPoint.y, 0));
  }

  function updateStep2HeightFromRay(localRay) {
    updateVerticalPlane();
    const hit = new THREE.Vector3();
    const hasHit = localRay.intersectPlane(step2VerticalPlane, hit);

    if (hasHit) {
      let z = hit.z;
      // Soft snap to 0 near ground
      if (Math.abs(z) < 0.15) z = 0;
      pendingPoint.z = Math.max(-20, Math.min(20, z));
      updateZHeightVisuals();
    }
  }

  function updateZHeightVisuals() {
    const x = pendingPoint.x;
    const y = pendingPoint.y;
    const z = pendingPoint.z;

    // 1. Rod from floor to current z
    const rodPts = [
      new THREE.Vector3(x, y, 0),
      new THREE.Vector3(x, y, z)
    ];
    zAxisRodMesh.geometry.setFromPoints(rodPts);

    // 2. Top sphere at current height
    zHeightSphereMesh.position.set(x, y, z);

    // 3. Preview line to previous point
    if (drawnPoints.length > 0) {
      const lastPos = drawnPoints[drawnPoints.length - 1].position;
      const prevPts = [lastPos, new THREE.Vector3(x, y, z)];
      zPreviewLineMesh.geometry.setFromPoints(prevPts);
      zPreviewLineMesh.computeLineDistances();
      zPreviewLineMesh.visible = true;
    } else {
      zPreviewLineMesh.visible = false;
    }

    const sign = z >= 0 ? '+' : '';
    updateCoordinateDisplay(x, y, z, `[Z決定中: ${sign}${z.toFixed(2)}]`);
    updateHint(`【ステップ 2/2】マウス上下で高さZを指定: ${sign}${z.toFixed(2)} → クリックで確定 (右クリック/Escで取消)`);
  }

  // --- Commit Step 2 (Point Confirmed) ---
  function commitStep2() {
    const x = pendingPoint.x;
    const y = pendingPoint.y;
    const z = pendingPoint.z;

    addPoint(x, y, z);

    plotStep = 'step1_xy';
    zGuideGroup.visible = false;
    if (currentMode === 'draw') {
      ghostMarker.visible = true;
      updateHint(`点 (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) を配置しました。次のXY位置をクリックしてください`);
    }
  }

  // --- Cancel Step 2 (Back to Step 1) ---
  function cancelStep2() {
    plotStep = 'step1_xy';
    zGuideGroup.visible = false;
    if (currentMode === 'draw') {
      ghostMarker.visible = true;
      updateHint('高さ指定をキャンセルしました。XY 平面上の位置をクリックしてください');
    }
  }

  // --- Point Plotting Logic ---
  function addPoint(x, y, z) {
    const position = new THREE.Vector3(x, y, z);
    const pointColorHex = parseInt(colors.point.replace('#', '0x'));
    const lineColorHex = parseInt(colors.line.replace('#', '0x'));

    // Glowing point sphere
    const sphereGeom = new THREE.SphereGeometry(pointSize, 12, 10);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: pointColorHex,
      emissive: pointColorHex,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.3
    });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.position.copy(position);
    rootGroup.add(sphere);

    // Connect line to previous point if available
    let lineMesh = null;
    if (connectPoints && drawnPoints.length > 0) {
      const prevPos = drawnPoints[drawnPoints.length - 1].position;
      lineMesh = createConnection(prevPos, position, lineColorHex);
      if (lineMesh) rootGroup.add(lineMesh);
    }

    drawnPoints.push({ position, mesh: sphere, lineMesh });
    updateLoopLine();
    updatePolygonFill();
    requestRender(20);
    saveState();
  }

  function createConnection(start, end, color = parseInt(colors.line.replace('#', '0x'))) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (!length) return null;
    const radius = Math.max(0.004, lineWidth * 0.006);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 6, 1, false),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15 })
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  }

  function updatePolygonFill() {
    if (polygonFillMesh) {
      rootGroup.remove(polygonFillMesh);
      polygonFillMesh.geometry.dispose();
      polygonFillMesh.material.dispose();
      polygonFillMesh = null;
    }
    polygonOutlineMeshes.forEach(mesh => {
      rootGroup.remove(mesh);
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
    polygonOutlineMeshes = [];
    if (!fillPolygon || drawnPoints.length < 4) return;

    const points = [];
    drawnPoints.forEach(({ position }) => {
      if (!points.some(point => point.distanceToSquared(position) < 1e-10)) points.push(position.clone());
    });
    if (points.length < 4) return;

    let scale = 1;
    points.forEach(point => { scale = Math.max(scale, point.length()); });
    const epsilon = scale * 1e-8;
    const epsilonSq = epsilon * epsilon;
    const p0 = 0;
    let p1 = -1;
    let farthestSq = 0;
    for (let i = 1; i < points.length; i++) {
      const distanceSq = points[i].distanceToSquared(points[p0]);
      if (distanceSq > farthestSq) { farthestSq = distanceSq; p1 = i; }
    }
    if (p1 < 0 || farthestSq <= epsilonSq) return;

    let p2 = -1;
    let lineDistanceSq = 0;
    const seedLine = points[p1].clone().sub(points[p0]);
    for (let i = 0; i < points.length; i++) {
      if (i === p0 || i === p1) continue;
      const distanceSq = points[i].clone().sub(points[p0]).cross(seedLine).lengthSq() / seedLine.lengthSq();
      if (distanceSq > lineDistanceSq) { lineDistanceSq = distanceSq; p2 = i; }
    }
    if (p2 < 0 || lineDistanceSq <= epsilonSq) return;

    const seedNormal = points[p1].clone().sub(points[p0]).cross(points[p2].clone().sub(points[p0])).normalize();
    let p3 = -1;
    let planeDistance = 0;
    for (let i = 0; i < points.length; i++) {
      if (i === p0 || i === p1 || i === p2) continue;
      const distance = Math.abs(seedNormal.dot(points[i].clone().sub(points[p0])));
      if (distance > planeDistance) { planeDistance = distance; p3 = i; }
    }

    const vertexIndices = [];
    const addVertex = (index) => {
      if (!vertexIndices.includes(index)) vertexIndices.push(index);
      return index;
    };
    const triangleIndices = [];
    const hullEdges = new Map();

    if (p3 < 0 || planeDistance <= epsilon) {
      // Entire point set is coplanar: compute and fill its 2D convex boundary.
      const origin = points[p0];
      const normal = seedNormal;
      const axisU = points[p1].clone().sub(origin).normalize();
      const axisV = normal.clone().cross(axisU).normalize();
      const projected = points.map((point, index) => {
        const offset = point.clone().sub(origin);
        return { index, x: offset.dot(axisU), y: offset.dot(axisV) };
      }).sort((a, b) => a.x - b.x || a.y - b.y);
      const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const lower = [];
      projected.forEach(point => {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= epsilonSq) lower.pop();
        lower.push(point);
      });
      const upper = [];
      for (let i = projected.length - 1; i >= 0; i--) {
        const point = projected[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= epsilonSq) upper.pop();
        upper.push(point);
      }
      const boundary = lower.slice(0, -1).concat(upper.slice(0, -1));
      if (boundary.length < 3) return;
      boundary.forEach(({ index }) => addVertex(index));
      const contour = boundary.map(point => new THREE.Vector2(point.x, point.y));
      THREE.ShapeUtils.triangulateShape(contour, []).forEach(face => {
        triangleIndices.push(...face.map(vertex => vertexIndices[vertex]));
      });
      for (let i = 0; i < vertexIndices.length; i++) {
        const a = vertexIndices[i], b = vertexIndices[(i + 1) % vertexIndices.length];
        hullEdges.set(`${Math.min(a, b)}:${Math.max(a, b)}`, [a, b]);
      }
    } else {
      // Incremental 3D convex hull. Each visible triangle is replaced by the
      // triangles joining the new point to the visible region's horizon.
      const interior = points[p0].clone().add(points[p1]).add(points[p2]).add(points[p3]).multiplyScalar(0.25);
      const makeFace = (a, b, c) => {
        const normal = points[b].clone().sub(points[a]).cross(points[c].clone().sub(points[a]));
        if (normal.dot(interior.clone().sub(points[a])) > 0) [b, c] = [c, b];
        return { a, b, c };
      };
      let faces = [
        makeFace(p0, p1, p2), makeFace(p0, p3, p1),
        makeFace(p0, p2, p3), makeFace(p1, p3, p2)
      ];
      const seed = new Set([p0, p1, p2, p3]);
      for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        if (seed.has(pointIndex)) continue;
        const visibleFaces = new Set();
        faces.forEach((face, faceIndex) => {
          const normal = points[face.b].clone().sub(points[face.a]).cross(points[face.c].clone().sub(points[face.a]));
          if (normal.dot(points[pointIndex].clone().sub(points[face.a])) > epsilon * normal.length()) visibleFaces.add(faceIndex);
        });
        if (visibleFaces.size === 0) continue;

        const horizon = new Map();
        faces.forEach((face, faceIndex) => {
          if (!visibleFaces.has(faceIndex)) return;
          [[face.a, face.b], [face.b, face.c], [face.c, face.a]].forEach(([a, b]) => {
            const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
            const edge = horizon.get(key);
            if (edge) edge.count++;
            else horizon.set(key, { a, b, count: 1 });
          });
        });
        faces = faces.filter((_, faceIndex) => !visibleFaces.has(faceIndex));
        horizon.forEach(edge => {
          if (edge.count === 1) {
            const face = makeFace(edge.a, edge.b, pointIndex);
            const areaVector = points[face.b].clone().sub(points[face.a]).cross(points[face.c].clone().sub(points[face.a]));
            if (areaVector.lengthSq() > epsilonSq) faces.push(face);
          }
        });
      }

      faces.forEach(({ a, b, c }) => {
        [a, b, c].forEach(addVertex);
        triangleIndices.push(a, b, c);
        [[a, b], [b, c], [c, a]].forEach(([start, end]) => {
          const key = `${Math.min(start, end)}:${Math.max(start, end)}`;
          hullEdges.set(key, [start, end]);
        });
      });
    }

    if (!triangleIndices.length) return;
    const positions = [];
    vertexIndices.forEach(index => positions.push(points[index].x, points[index].y, points[index].z));
    const remap = new Map(vertexIndices.map((index, localIndex) => [index, localIndex]));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(triangleIndices.map(index => remap.get(index)));
    geometry.computeVertexNormals();
    polygonFillMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: colors.surface,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.32,
      roughness: 0.55,
      flatShading: true,
      depthWrite: false
    }));
    rootGroup.add(polygonFillMesh);

    if (connectPoints) {
      hullEdges.forEach(([start, end]) => {
        const edge = createConnection(points[start], points[end]);
        if (edge) {
          polygonOutlineMeshes.push(edge);
          rootGroup.add(edge);
        }
      });
    }
  }

  function rebuildDrawnGeometry() {
    drawnPoints.forEach((point, index) => {
      if (point.mesh) {
        rootGroup.remove(point.mesh);
        point.mesh.geometry.dispose();
        point.mesh.material.dispose();
      }
      if (point.lineMesh) {
        rootGroup.remove(point.lineMesh);
        point.lineMesh.geometry?.dispose();
        point.lineMesh.material?.dispose();
      }
      const color = parseInt(colors.point.replace('#', '0x'));
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(pointSize, 12, 10),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.3 })
      );
      sphere.position.copy(point.position);
      point.mesh = sphere;
      rootGroup.add(sphere);
      point.lineMesh = connectPoints && index > 0
        ? createConnection(drawnPoints[index - 1].position, point.position)
        : null;
      if (point.lineMesh) rootGroup.add(point.lineMesh);
    });
    updateLoopLine();
    updatePolygonFill();
    requestRender(20);
  }

  function updateLoopLine() {
    if (loopLineMesh) {
      rootGroup.remove(loopLineMesh);
      if (loopLineMesh.geometry) loopLineMesh.geometry.dispose();
      if (loopLineMesh.material) loopLineMesh.material.dispose();
      loopLineMesh = null;
    }

    if (connectPoints && loopPoints && drawnPoints.length >= 3) {
      const firstPos = drawnPoints[0].position;
      const lastPos = drawnPoints[drawnPoints.length - 1].position;
      loopLineMesh = createConnection(lastPos, firstPos);
      rootGroup.add(loopLineMesh);
    }

    const btnLoop = document.getElementById('btn-loop-points');
    if (btnLoop) {
      btnLoop.classList.toggle('active', loopPoints);
    }

    requestRender(15);
  }

  function applyDisplaySettings() {
    if (gridHelper) gridHelper.visible = displaySettings.grid;
    if (customAxesGroup) customAxesGroup.visible = displaySettings.axes;
    if (particlesMesh) particlesMesh.visible = displaySettings.particles;

    const btnGrid = document.getElementById('toggle-grid');
    const btnAxes = document.getElementById('toggle-axes');
    const btnParticles = document.getElementById('toggle-particles');
    const btnEco = document.getElementById('toggle-eco');

    if (btnGrid) btnGrid.classList.toggle('active', displaySettings.grid);
    if (btnAxes) btnAxes.classList.toggle('active', displaySettings.axes);
    if (btnParticles) btnParticles.classList.toggle('active', displaySettings.particles);
    if (btnEco) btnEco.classList.toggle('active', displaySettings.eco);

    requestRender(25);
  }

  function updatePointColors() {
    const pointColorHex = parseInt(colors.point.replace('#', '0x'));
    const lineColorHex = parseInt(colors.line.replace('#', '0x'));

    drawnPoints.forEach(p => {
      if (p.mesh && p.mesh.material) {
        p.mesh.material.color.setHex(pointColorHex);
        p.mesh.material.emissive.setHex(pointColorHex);
      }
      if (p.lineMesh && p.lineMesh.material) {
        p.lineMesh.material.color.setHex(lineColorHex);
      }
    });

    if (polygonFillMesh) polygonFillMesh.material.color.set(colors.surface);

    if (loopLineMesh && loopLineMesh.material) {
      loopLineMesh.material.color.setHex(lineColorHex);
    }

    // Update helpers color
    if (ghostMarker) {
      ghostMarker.children.forEach(c => {
        if (c.material) c.material.color.setHex(pointColorHex);
      });
    }
    if (step1PreviewLine && step1PreviewLine.material) {
      step1PreviewLine.material.color.setHex(lineColorHex);
    }
    if (zFloorAnchorMesh && zFloorAnchorMesh.material) {
      zFloorAnchorMesh.material.color.setHex(pointColorHex);
    }
    if (zAxisRodMesh && zAxisRodMesh.material) {
      zAxisRodMesh.material.color.setHex(lineColorHex);
    }
    if (zHeightSphereMesh && zHeightSphereMesh.material) {
      zHeightSphereMesh.material.color.setHex(pointColorHex);
      zHeightSphereMesh.material.emissive.setHex(pointColorHex);
    }
    if (zPreviewLineMesh && zPreviewLineMesh.material) {
      zPreviewLineMesh.material.color.setHex(lineColorHex);
    }
    requestRender(20);
  }

  function undoLastPoint() {
    if (plotStep === 'step2_z') {
      cancelStep2();
    }
    if (drawnPoints.length === 0) return;
    const last = drawnPoints.pop();
    if (last.mesh) {
      rootGroup.remove(last.mesh);
      last.mesh.geometry.dispose();
      last.mesh.material.dispose();
    }
    if (last.lineMesh) {
      rootGroup.remove(last.lineMesh);
      last.lineMesh.geometry?.dispose();
      last.lineMesh.material?.dispose();
    }

    updateLoopLine();
    updatePolygonFill();

    if (currentMode === 'draw' && plotStep === 'step1_xy') {
      const localRay = getLocalRay();
      updateStep1Preview(localRay);
    }
    requestRender(20);
    saveState();
  }

  function clearAllPoints() {
    if (plotStep === 'step2_z') {
      cancelStep2();
    }
    while (drawnPoints.length > 0) {
      const item = drawnPoints.pop();
      if (item.mesh) {
        rootGroup.remove(item.mesh);
        item.mesh.geometry.dispose();
        item.mesh.material.dispose();
      }
      if (item.lineMesh) {
        rootGroup.remove(item.lineMesh);
        item.lineMesh.geometry?.dispose();
        item.lineMesh.material?.dispose();
      }
    }
    if (step1PreviewLine) step1PreviewLine.visible = false;
    if (zPreviewLineMesh) zPreviewLineMesh.visible = false;
    updateLoopLine();
    updatePolygonFill();
    requestRender(20);
    saveState();
  }

  // --- Math Formula Surface Generation ---
  function generateMathMesh(expressionStr, style = 'both') {
    clearMathMesh();

    if (!expressionStr || expressionStr.trim() === '') return;

    let compiledExpr;
    try {
      compiledExpr = math.compile(expressionStr);
    } catch (e) {
      alert('数式の構文エラーです: ' + e.message);
      return;
    }

    const range = currentPlotRange;
    const xMin = -range, xMax = range;
    const yMin = -range, yMax = range;
    const segments = 60; // Resolution
    const dx = (xMax - xMin) / segments;
    const dy = (yMax - yMin) / segments;

    const vertices = [];
    const colorsArr = [];
    const indices = [];

    // Calculate Grid & Z values
    let zMin = Infinity, zMax = -Infinity;
    const grid = [];

    for (let i = 0; i <= segments; i++) {
      grid[i] = [];
      const x = xMin + i * dx;
      for (let j = 0; j <= segments; j++) {
        const y = yMin + j * dy;
        let z = 0;
        try {
          const val = compiledExpr.evaluate({ x, y, r: Math.sqrt(x * x + y * y) });
          z = (typeof val === 'number' && isFinite(val)) ? val : 0;
        } catch {
          z = 0;
        }
        z = Math.max(-18, Math.min(18, z));
        grid[i][j] = z;
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
      }
    }

    const zRange = (zMax - zMin) || 1;

    // Color gradient based on base surface color (colors.surface)
    const baseColor = new THREE.Color(colors.surface);
    const hsl = {};
    baseColor.getHSL(hsl);
    const colorLow = new THREE.Color().setHSL((hsl.h + 0.08) % 1, hsl.s, Math.max(0.2, hsl.l - 0.2));
    const colorMid = baseColor.clone();
    const colorHigh = new THREE.Color().setHSL((hsl.h - 0.08 + 1) % 1, hsl.s, Math.min(0.85, hsl.l + 0.2));

    for (let i = 0; i <= segments; i++) {
      const x = xMin + i * dx;
      for (let j = 0; j <= segments; j++) {
        const y = yMin + j * dy;
        const z = grid[i][j];
        vertices.push(x, y, z);

        const t = (z - zMin) / zRange;
        const vertexColor = new THREE.Color();
        if (t < 0.5) {
          vertexColor.copy(colorLow).lerp(colorMid, t * 2);
        } else {
          vertexColor.copy(colorMid).lerp(colorHigh, (t - 0.5) * 2);
        }
        colorsArr.push(vertexColor.r, vertexColor.g, vertexColor.b);
      }
    }

    // Quad indices to triangles
    const rowSize = segments + 1;
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const a = i * rowSize + j;
        const b = (i + 1) * rowSize + j;
        const c = (i + 1) * rowSize + (j + 1);
        const d = i * rowSize + (j + 1);

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsArr, 3));
    geometry.computeVertexNormals();

    // Solid Surface Mesh
    if (style === 'surface' || style === 'both') {
      const solidMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.35,
        metalness: 0.2,
        transparent: true,
        opacity: style === 'both' ? 0.82 : 0.95
      });
      const solidMesh = new THREE.Mesh(geometry, solidMat);
      mathMeshGroup.add(solidMesh);
    }

    // Wireframe Mesh
    if (style === 'wireframe' || style === 'both') {
      const wireMat = new THREE.MeshBasicMaterial({
        color: baseColor.clone().offsetHSL(0, 0, currentTheme === 'light' ? -0.25 : 0.2),
        wireframe: true,
        transparent: true,
        opacity: style === 'both' ? 0.25 : 0.75
      });
      const wireMesh = new THREE.Mesh(geometry, wireMat);
      mathMeshGroup.add(wireMesh);
    }

    requestRender(30);
    saveState();
  }

  function clearMathMesh() {
    while (mathMeshGroup.children.length > 0) {
      const obj = mathMeshGroup.children.pop();
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
    requestRender(20);
    saveState();
  }

  // --- Parametric Surface Generation ((x, y, z) = f(u, v)) ---
  function generateParametricMesh(exprXStr, exprYStr, exprZStr, uMinVal, uMaxVal, vMinVal, vMaxVal, style = 'both') {
    clearMathMesh();

    let compiledX, compiledY, compiledZ;
    let uMin, uMax, vMin, vMax;

    try {
      compiledX = math.compile(exprXStr);
      compiledY = math.compile(exprYStr);
      compiledZ = math.compile(exprZStr);

      const scopeEval = { pi: Math.PI, e: Math.E };
      uMin = math.evaluate(String(uMinVal), scopeEval);
      uMax = math.evaluate(String(uMaxVal), scopeEval);
      vMin = math.evaluate(String(vMinVal), scopeEval);
      vMax = math.evaluate(String(vMaxVal), scopeEval);
    } catch (e) {
      alert('媒介変数方程式または範囲の構文エラーです: ' + e.message);
      return;
    }

    const segmentsU = 50;
    const segmentsV = 50;
    const du = (uMax - uMin) / segmentsU;
    const dv = (vMax - vMin) / segmentsV;

    const vertices = [];
    const colorsArr = [];
    const indices = [];

    let zMin = Infinity, zMax = -Infinity;
    const pointsGrid = [];

    for (let i = 0; i <= segmentsU; i++) {
      pointsGrid[i] = [];
      const u = uMin + i * du;
      for (let j = 0; j <= segmentsV; j++) {
        const v = vMin + j * dv;
        let x = 0, y = 0, z = 0;
        try {
          const scope = { u, v, pi: Math.PI, e: Math.E };
          const valX = compiledX.evaluate(scope);
          const valY = compiledY.evaluate(scope);
          const valZ = compiledZ.evaluate(scope);

          x = (typeof valX === 'number' && isFinite(valX)) ? valX : 0;
          y = (typeof valY === 'number' && isFinite(valY)) ? valY : 0;
          z = (typeof valZ === 'number' && isFinite(valZ)) ? valZ : 0;
        } catch {
          x = 0; y = 0; z = 0;
        }

        // Clamp to prevent overflow
        x = Math.max(-25, Math.min(25, x));
        y = Math.max(-25, Math.min(25, y));
        z = Math.max(-25, Math.min(25, z));

        pointsGrid[i][j] = new THREE.Vector3(x, y, z);
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
      }
    }

    const zRange = (zMax - zMin) || 1;
    const baseColor = new THREE.Color(colors.surface);
    const hsl = {};
    baseColor.getHSL(hsl);
    const colorLow = new THREE.Color().setHSL((hsl.h + 0.08) % 1, hsl.s, Math.max(0.2, hsl.l - 0.2));
    const colorMid = baseColor.clone();
    const colorHigh = new THREE.Color().setHSL((hsl.h - 0.08 + 1) % 1, hsl.s, Math.min(0.85, hsl.l + 0.2));

    for (let i = 0; i <= segmentsU; i++) {
      for (let j = 0; j <= segmentsV; j++) {
        const pt = pointsGrid[i][j];
        vertices.push(pt.x, pt.y, pt.z);

        const t = (pt.z - zMin) / zRange;
        const vertexColor = new THREE.Color();
        if (t < 0.5) {
          vertexColor.copy(colorLow).lerp(colorMid, t * 2);
        } else {
          vertexColor.copy(colorMid).lerp(colorHigh, (t - 0.5) * 2);
        }
        colorsArr.push(vertexColor.r, vertexColor.g, vertexColor.b);
      }
    }

    const rowSize = segmentsV + 1;
    for (let i = 0; i < segmentsU; i++) {
      for (let j = 0; j < segmentsV; j++) {
        const a = i * rowSize + j;
        const b = (i + 1) * rowSize + j;
        const c = (i + 1) * rowSize + (j + 1);
        const d = i * rowSize + (j + 1);

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsArr, 3));
    geometry.computeVertexNormals();

    // Solid Surface Mesh
    if (style === 'surface' || style === 'both') {
      const solidMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.35,
        metalness: 0.2,
        transparent: true,
        opacity: style === 'both' ? 0.82 : 0.95
      });
      const solidMesh = new THREE.Mesh(geometry, solidMat);
      mathMeshGroup.add(solidMesh);
    }

    // Wireframe Mesh
    if (style === 'wireframe' || style === 'both') {
      const wireMat = new THREE.MeshBasicMaterial({
        color: baseColor.clone().offsetHSL(0, 0, currentTheme === 'light' ? -0.25 : 0.2),
        wireframe: true,
        transparent: true,
        opacity: style === 'both' ? 0.25 : 0.75
      });
      const wireMesh = new THREE.Mesh(geometry, wireMat);
      mathMeshGroup.add(wireMesh);
    }

    requestRender(30);
    saveState();
  }

  function generateCurrentMesh() {
    const style = document.getElementById('mesh-style').value;
    if (formulaType === 'explicit') {
      const expr = document.getElementById('formula-input').value;
      generateMathMesh(expr, style);
    } else {
      const exprX = document.getElementById('param-x').value;
      const exprY = document.getElementById('param-y').value;
      const exprZ = document.getElementById('param-z').value;
      const uMin = document.getElementById('param-u-min').value;
      const uMax = document.getElementById('param-u-max').value;
      const vMin = document.getElementById('param-v-min').value;
      const vMax = document.getElementById('param-v-max').value;
      generateParametricMesh(exprX, exprY, exprZ, uMin, uMax, vMin, vMax, style);
    }
  }

  // --- Interaction & Events ---
  function setupEventListeners() {
    window.addEventListener('resize', () => {
      onWindowResize();
      requestRender(30);
    });

    const canvasElem = renderer.domElement;

    // Pointer move over canvas
    window.addEventListener('pointermove', (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      if (currentMode === 'draw') {
        const localRay = getLocalRay();
        if (plotStep === 'step1_xy') {
          updateStep1Preview(localRay);
        } else if (plotStep === 'step2_z') {
          updateStep2HeightFromRay(localRay);
        }
        requestRender(10);
      }
    });

    // Pointer down: click to add / confirm point
    canvasElem.addEventListener('pointerdown', (event) => {
      requestRender(30);
      if (currentMode !== 'draw') return;

      // Right Click: cancel step 2 if in progress
      if (event.button === 2) {
        if (plotStep === 'step2_z') {
          cancelStep2();
        }
        return;
      }

      // Left Click:
      if (event.button === 0) {
        const localRay = getLocalRay();
        if (plotStep === 'step1_xy') {
          const intersect = new THREE.Vector3();
          if (localRay.intersectPlane(localDrawPlane, intersect)) {
            startStep2(intersect.x, intersect.y);
          }
        } else if (plotStep === 'step2_z') {
          commitStep2();
        }
      }
    });

    // Prevent context menu on canvas in draw mode so right click cancels smoothly
    canvasElem.addEventListener('contextmenu', (event) => {
      if (currentMode === 'draw') {
        event.preventDefault();
      }
    });

    // Mouse Wheel to adjust drawing height (Z) in Step 2
    window.addEventListener('wheel', (event) => {
      requestRender(25);
      if (currentMode === 'draw' && plotStep === 'step2_z') {
        event.preventDefault();
        const delta = (event.deltaY > 0 ? -0.25 : 0.25);
        pendingPoint.z = Math.max(-20, Math.min(20, pendingPoint.z + delta));
        updateZHeightVisuals();
      }
    }, { passive: false });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (event) => {
      requestRender(30);
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return;

      const key = event.key.toLowerCase();
      if (key === 'h') {
        toggleUI();
      } else if (key === 't') {
        toggleTheme();
      } else if (key === 'z' && (event.ctrlKey || event.metaKey)) {
        undoLastPoint();
      } else if (key === 'escape') {
        if (currentMode === 'draw' && plotStep === 'step2_z') {
          cancelStep2();
        } else {
          setMode('rotate');
        }
      } else if (key === 'enter') {
        if (currentMode === 'draw' && plotStep === 'step2_z') {
          commitStep2();
        }
      }
    });

    // Power Saving: Handle visibility change (pause render on tab switch / window hidden)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        requestRender(60);
      }
    });
  }

  // --- UI Setup & Bindings ---
  function setupUI() {
    // Mode Buttons
    const btnRotate = document.getElementById('btn-mode-rotate');
    const btnPan = document.getElementById('btn-mode-pan');
    const btnDraw = document.getElementById('btn-mode-draw');

    btnRotate.addEventListener('click', () => setMode('rotate'));
    if (btnPan) btnPan.addEventListener('click', () => setMode('pan'));
    btnDraw.addEventListener('click', () => setMode('draw'));

    // Actions
    document.getElementById('btn-undo-point').addEventListener('click', undoLastPoint);
    document.getElementById('btn-clear-points').addEventListener('click', clearAllPoints);

    // Center Origin Button (原点を画面中心に戻す)
    const btnCenterOrigin = document.getElementById('btn-center-origin');
    if (btnCenterOrigin) {
      btnCenterOrigin.addEventListener('click', centerOrigin);
    }
    const btnLegendCenter = document.getElementById('btn-legend-center');
    if (btnLegendCenter) {
      btnLegendCenter.addEventListener('click', centerOrigin);
    }

    // Reset View Button (初期視点に戻す)
    const btnResetView = document.getElementById('btn-reset-view');
    if (btnResetView) {
      btnResetView.addEventListener('click', resetCameraView);
    }

    // Auto Spin Toggle
    const btnAutoSpin = document.getElementById('btn-auto-spin');
    const spinLabel = btnAutoSpin.querySelector('.spin-label');
    btnAutoSpin.addEventListener('click', () => {
      autoSpin = !autoSpin;
      btnAutoSpin.classList.toggle('active', autoSpin);
      if (spinLabel) {
        spinLabel.textContent = autoSpin ? '自転: ON' : '自転';
      }
    });

    // Formula Type Switcher (Explicit vs Parametric)
    const btnTypeExplicit = document.getElementById('btn-type-explicit');
    const btnTypeParametric = document.getElementById('btn-type-parametric');
    const explicitSec = document.getElementById('explicit-formula-section');
    const parametricSec = document.getElementById('parametric-formula-section');

    function switchFormulaType(type) {
      formulaType = type;
      if (btnTypeExplicit) btnTypeExplicit.classList.toggle('active', type === 'explicit');
      if (btnTypeParametric) btnTypeParametric.classList.toggle('active', type === 'parametric');
      if (explicitSec) explicitSec.style.display = (type === 'explicit' ? 'block' : 'none');
      if (parametricSec) parametricSec.style.display = (type === 'parametric' ? 'block' : 'none');
      generateCurrentMesh();
      saveState();
    }

    if (btnTypeExplicit) btnTypeExplicit.addEventListener('click', () => switchFormulaType('explicit'));
    if (btnTypeParametric) btnTypeParametric.addEventListener('click', () => switchFormulaType('parametric'));

    // Math Preset Dropdown (Explicit)
    const presetSelect = document.getElementById('math-preset');
    const formulaInput = document.getElementById('formula-input');

    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const selected = presetSelect.value;
        if (selected !== 'custom' && presets[selected]) {
          formulaInput.value = presets[selected];
          generateCurrentMesh();
        }
      });
    }

    // Parametric Preset Dropdown
    const paramPresetSelect = document.getElementById('parametric-preset');
    if (paramPresetSelect) {
      paramPresetSelect.addEventListener('change', () => {
        const selected = paramPresetSelect.value;
        if (selected !== 'custom' && parametricPresets[selected]) {
          const p = parametricPresets[selected];
          const inX = document.getElementById('param-x');
          const inY = document.getElementById('param-y');
          const inZ = document.getElementById('param-z');
          const inUMin = document.getElementById('param-u-min');
          const inUMax = document.getElementById('param-u-max');
          const inVMin = document.getElementById('param-v-min');
          const inVMax = document.getElementById('param-v-max');
          if (inX) inX.value = p.x;
          if (inY) inY.value = p.y;
          if (inZ) inZ.value = p.z;
          if (inUMin) inUMin.value = p.uMin;
          if (inUMax) inUMax.value = p.uMax;
          if (inVMin) inVMin.value = p.vMin;
          if (inVMax) inVMax.value = p.vMax;
          generateCurrentMesh();
        }
      });
    }

    // Generate Math Button
    document.getElementById('btn-generate-mesh').addEventListener('click', generateCurrentMesh);

    // Clear Math Button
    document.getElementById('btn-clear-mesh').addEventListener('click', clearMathMesh);

    // Mesh Style Change
    document.getElementById('mesh-style').addEventListener('change', generateCurrentMesh);

    // Range Slider
    const rangeSlider = document.getElementById('range-slider');
    const rangeVal = document.getElementById('range-val');
    if (rangeSlider && rangeVal) {
      rangeSlider.value = currentPlotRange;
      rangeVal.textContent = `±${Number(currentPlotRange).toFixed(1)}`;
      rangeSlider.addEventListener('input', (e) => {
        currentPlotRange = parseFloat(e.target.value);
        rangeVal.textContent = `±${currentPlotRange.toFixed(1)}`;
        rebuildGrid();
        setupCustomAxes();
        generateCurrentMesh();
      });
    }

    // Color Pickers
    const inputColorSurface = document.getElementById('color-surface');
    const inputColorPoint = document.getElementById('color-point');
    const inputColorLine = document.getElementById('color-line');
    const inputColorAxisX = document.getElementById('color-axis-x');
    const inputColorAxisY = document.getElementById('color-axis-y');
    const inputColorAxisZ = document.getElementById('color-axis-z');

    function syncColorInputs() {
      if (inputColorSurface) inputColorSurface.value = colors.surface;
      if (inputColorPoint) inputColorPoint.value = colors.point;
      if (inputColorLine) inputColorLine.value = colors.line;
      if (inputColorAxisX) inputColorAxisX.value = colors.axisX;
      if (inputColorAxisY) inputColorAxisY.value = colors.axisY;
      if (inputColorAxisZ) inputColorAxisZ.value = colors.axisZ;
    }
    syncColorInputs();

    if (inputColorSurface) {
      inputColorSurface.addEventListener('input', (e) => {
        colors.surface = e.target.value;
        generateCurrentMesh();
        saveState();
      });
    }

    if (inputColorPoint) {
      inputColorPoint.addEventListener('input', (e) => {
        colors.point = e.target.value;
        updatePointColors();
        saveState();
      });
    }

    if (inputColorLine) {
      inputColorLine.addEventListener('input', (e) => {
        colors.line = e.target.value;
        updatePointColors();
        saveState();
      });
    }

    if (inputColorAxisX) {
      inputColorAxisX.addEventListener('input', (e) => {
        colors.axisX = e.target.value;
        updateAxesColors();
        saveState();
      });
    }

    if (inputColorAxisY) {
      inputColorAxisY.addEventListener('input', (e) => {
        colors.axisY = e.target.value;
        updateAxesColors();
        saveState();
      });
    }

    if (inputColorAxisZ) {
      inputColorAxisZ.addEventListener('input', (e) => {
        colors.axisZ = e.target.value;
        updateAxesColors();
        saveState();
      });
    }

    // Swatches
    document.querySelectorAll('.color-swatches .swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const targetId = swatch.parentElement.getAttribute('data-target');
        const color = swatch.getAttribute('data-color');
        if (targetId && color) {
          const inputEl = document.getElementById(targetId);
          if (inputEl) {
            inputEl.value = color;
            inputEl.dispatchEvent(new Event('input'));
          }
        }
      });
    });

    // Reset Colors
    const btnResetColors = document.getElementById('btn-reset-colors');
    if (btnResetColors) {
      btnResetColors.addEventListener('click', () => {
        colors = { ...defaultColors };
        syncColorInputs();
        updateAxesColors();
        updatePointColors();
        generateCurrentMesh();
        saveState();
      });
    }

    // Color Section Accordion Toggle
    const colorToggle = document.getElementById('color-toggle');
    const colorAccordion = document.querySelector('.color-accordion');
    if (colorToggle && colorAccordion) {
      colorToggle.addEventListener('click', () => {
        colorAccordion.classList.toggle('collapsed');
      });
    }

    // Object Rotation Accordion Toggle
    const rotationToggle = document.getElementById('rotation-toggle');
    const rotationAccordion = document.getElementById('rotation-accordion');
    if (rotationToggle && rotationAccordion) {
      rotationToggle.addEventListener('click', () => {
        rotationAccordion.classList.toggle('collapsed');
      });
    }

    // Mirror Accordion Toggle
    const mirrorToggle = document.getElementById('mirror-toggle');
    const mirrorAccordion = document.getElementById('mirror-accordion');
    if (mirrorToggle && mirrorAccordion) {
      mirrorToggle.addEventListener('click', () => {
        mirrorAccordion.classList.toggle('collapsed');
      });
    }

    // Display & Grid Settings Accordion Toggle
    const displayToggle = document.getElementById('display-toggle');
    const displayAccordion = document.getElementById('display-accordion');
    if (displayToggle && displayAccordion) {
      displayToggle.addEventListener('click', () => {
        displayAccordion.classList.toggle('collapsed');
      });
    }

    // Display & Eco Switches
    const toggleGrid = document.getElementById('toggle-grid');
    if (toggleGrid) {
      toggleGrid.addEventListener('click', () => {
        displaySettings.grid = !displaySettings.grid;
        applyDisplaySettings();
        saveState();
      });
    }

    const toggleAxes = document.getElementById('toggle-axes');
    if (toggleAxes) {
      toggleAxes.addEventListener('click', () => {
        displaySettings.axes = !displaySettings.axes;
        applyDisplaySettings();
        saveState();
      });
    }

    const toggleParticles = document.getElementById('toggle-particles');
    if (toggleParticles) {
      toggleParticles.addEventListener('click', () => {
        displaySettings.particles = !displaySettings.particles;
        applyDisplaySettings();
        saveState();
      });
    }

    const toggleEco = document.getElementById('toggle-eco');
    if (toggleEco) {
      toggleEco.addEventListener('click', () => {
        displaySettings.eco = !displaySettings.eco;
        applyDisplaySettings();
        saveState();
      });
    }

    // Loop Points Button
    const btnLoop = document.getElementById('btn-loop-points');
    if (btnLoop) {
      btnLoop.addEventListener('click', () => {
        loopPoints = !loopPoints;
        updateLoopLine();
        saveState();
      });
    }

    const connectToggle = document.getElementById('toggle-connect-points');
    const fillToggle = document.getElementById('toggle-fill-polygon');
    const lineWidthInput = document.getElementById('line-width');
    const lineWidthValue = document.getElementById('line-width-value');
    const pointSizeInput = document.getElementById('point-size');
    const pointSizeValue = document.getElementById('point-size-value');
    const setSwitch = (button, enabled) => {
      if (!button) return;
      button.classList.toggle('active', enabled);
      button.setAttribute('aria-checked', String(enabled));
    };

    if (connectToggle) connectToggle.addEventListener('click', () => {
      connectPoints = !connectPoints;
      setSwitch(connectToggle, connectPoints);
      rebuildDrawnGeometry();
      saveState();
    });
    if (fillToggle) fillToggle.addEventListener('click', () => {
      fillPolygon = !fillPolygon;
      setSwitch(fillToggle, fillPolygon);
      updatePolygonFill();
      requestRender(20);
      saveState();
    });
    if (lineWidthInput) lineWidthInput.addEventListener('input', () => {
      lineWidth = Number(lineWidthInput.value);
      if (lineWidthValue) lineWidthValue.value = String(lineWidth);
      rebuildDrawnGeometry();
      saveState();
    });
    if (pointSizeInput) pointSizeInput.addEventListener('input', () => {
      pointSize = Number(pointSizeInput.value);
      if (pointSizeValue) pointSizeValue.value = pointSize.toFixed(2);
      rebuildDrawnGeometry();
      saveState();
    });

    // Light Settings Accordion Toggle
    const lightToggle = document.getElementById('light-toggle');
    const lightAccordion = document.getElementById('light-accordion');
    if (lightToggle && lightAccordion) {
      lightToggle.addEventListener('click', () => {
        lightAccordion.classList.toggle('collapsed');
      });
    }

    // Custom Light Position Toggle (位置調整をするかしないか)
    const toggleCustomLight = document.getElementById('toggle-custom-light');
    if (toggleCustomLight) {
      toggleCustomLight.addEventListener('click', () => {
        setCustomLightEnabled(!customLightEnabled);
      });
    }

    // Light Sliders
    const lightXSlider = document.getElementById('light-x-slider');
    const lightYSlider = document.getElementById('light-y-slider');
    const lightZSlider = document.getElementById('light-z-slider');
    const lightIntensitySlider = document.getElementById('light-intensity-slider');
    const lightColorPicker = document.getElementById('light-color-picker');

    if (lightXSlider) {
      lightXSlider.addEventListener('input', (e) => {
        lightState.x = parseFloat(e.target.value);
        lightPresetBtns.forEach(b => b.classList.remove('active'));
        updateLight(false);
        saveState();
      });
    }

    if (lightYSlider) {
      lightYSlider.addEventListener('input', (e) => {
        lightState.y = parseFloat(e.target.value);
        lightPresetBtns.forEach(b => b.classList.remove('active'));
        updateLight(false);
        saveState();
      });
    }

    if (lightZSlider) {
      lightZSlider.addEventListener('input', (e) => {
        lightState.z = parseFloat(e.target.value);
        lightPresetBtns.forEach(b => b.classList.remove('active'));
        updateLight(false);
        saveState();
      });
    }

    if (lightIntensitySlider) {
      lightIntensitySlider.addEventListener('input', (e) => {
        lightState.intensity = parseFloat(e.target.value);
        updateLight(false);
        saveState();
      });
    }

    if (lightColorPicker) {
      lightColorPicker.addEventListener('input', (e) => {
        lightState.color = e.target.value;
        updateLight(false);
        saveState();
      });
    }

    // Light Presets
    const lightPresetBtns = document.querySelectorAll('button[data-light-preset]');
    lightPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.getAttribute('data-light-preset');
        if (presetKey === 'top-right') {
          lightState.x = 15; lightState.y = 20; lightState.z = 25;
        } else if (presetKey === 'front-top') {
          lightState.x = 0; lightState.y = -25; lightState.z = 25;
        } else if (presetKey === 'overhead') {
          lightState.x = 0; lightState.y = 0; lightState.z = 35;
        } else if (presetKey === 'side-low') {
          lightState.x = 30; lightState.y = 5; lightState.z = 8;
        }
        lightPresetBtns.forEach(b => b.classList.toggle('active', b === btn));
        updateLight(true);
        saveState();
      });
    });

    // Reset Light Button
    const btnResetLight = document.getElementById('btn-reset-light');
    if (btnResetLight) {
      btnResetLight.addEventListener('click', () => {
        Object.assign(lightState, defaultLightState);
        lightPresetBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-light-preset') === 'top-right'));
        updateLight(true);
        saveState();
      });
    }

    // Rotation Sliders & Controls
    const rotZSlider = document.getElementById('rot-z-slider');
    const rotVerticalSlider = document.getElementById('rot-vertical-slider');

    if (rotZSlider) {
      rotZSlider.addEventListener('input', (e) => {
        objectRotZ = rotationFromSlider(e.target.value);
        if (objectRotZ === 0) e.target.value = 0;
        applyObjectRotation(false);
        saveState();
      });
    }

    if (rotVerticalSlider) {
      rotVerticalSlider.addEventListener('input', (e) => {
        objectRotVertical = rotationFromSlider(e.target.value);
        if (objectRotVertical === 0) e.target.value = 0;
        applyObjectRotation(false);
        saveState();
      });
    }

    // Spin Axis Selector (.pill-btn)
    const spinPillBtns = document.querySelectorAll('.pill-btn[data-spin-axis]');
    spinPillBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const axis = btn.getAttribute('data-spin-axis');
        if (axis) {
          spinAxis = axis;
          spinPillBtns.forEach(b => b.classList.toggle('active', b === btn));
          saveState();
        }
      });
    });

    // Reset Rotation Button
    const btnResetRotation = document.getElementById('btn-reset-rotation');
    if (btnResetRotation) {
      btnResetRotation.addEventListener('click', () => {
        objectRotZ = 0;
        objectRotVertical = 0;
        applyObjectRotation(true);
        saveState();
      });
    }

    // Mirror Buttons (X, Y, Z Inversion)
    const btnMirrorX = document.getElementById('btn-mirror-x');
    const btnMirrorY = document.getElementById('btn-mirror-y');
    const btnMirrorZ = document.getElementById('btn-mirror-z');

    if (btnMirrorX) {
      btnMirrorX.addEventListener('click', () => {
        mirrorState.x *= -1;
        applyMirror();
        saveState();
      });
    }

    if (btnMirrorY) {
      btnMirrorY.addEventListener('click', () => {
        mirrorState.y *= -1;
        applyMirror();
        saveState();
      });
    }

    if (btnMirrorZ) {
      btnMirrorZ.addEventListener('click', () => {
        mirrorState.z *= -1;
        applyMirror();
        saveState();
      });
    }

    // Reset Mirror Button
    const btnResetMirror = document.getElementById('btn-reset-mirror');
    if (btnResetMirror) {
      btnResetMirror.addEventListener('click', () => {
        mirrorState.x = 1;
        mirrorState.y = 1;
        mirrorState.z = 1;
        applyMirror();
        saveState();
      });
    }

    // Panel collapse toggle
    const panelHeader = document.getElementById('panel-toggle');
    const topLeftPanel = document.getElementById('top-left-panel');
    panelHeader.addEventListener('click', () => {
      topLeftPanel.classList.toggle('collapsed');
    });

    // Theme Toggle Button
    document.getElementById('btn-toggle-theme').addEventListener('click', toggleTheme);

    // UI Hide Button
    document.getElementById('btn-toggle-ui').addEventListener('click', toggleUI);
  }

  // --- Object Rotation & Mirror Application ---
  function applyObjectRotation(updateInputs = true) {
    objectRotZ = normalizeRotation(objectRotZ);
    objectRotVertical = normalizeRotation(objectRotVertical);
    if (rootGroup) {
      rootGroup.rotation.z = objectRotZ;
      rootGroup.rotation.x = objectRotVertical;
    }
    const radZ = Number(objectRotZ.toFixed(2));
    const radVert = Number(objectRotVertical.toFixed(2));

    const sliderZ = document.getElementById('rot-z-slider');
    const valZ = document.getElementById('rot-z-val');
    const sliderVert = document.getElementById('rot-vertical-slider');
    const valVert = document.getElementById('rot-vertical-val');

    if (valZ) valZ.textContent = `${radZ.toFixed(2)} rad`;
    if (valVert) valVert.textContent = `${radVert.toFixed(2)} rad`;

    if (updateInputs) {
      if (sliderZ && document.activeElement !== sliderZ) sliderZ.value = objectRotZ;
      if (sliderVert && document.activeElement !== sliderVert) sliderVert.value = objectRotVertical;
    }
  }

  function normalizeRotation(angle) {
    return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  }

  function rotationFromSlider(value) {
    const angle = parseFloat(value);
    return angle >= TWO_PI - 1e-6 ? 0 : normalizeRotation(angle);
  }

  function applyMirror() {
    if (worldGroup) {
      worldGroup.scale.set(mirrorState.x, mirrorState.y, mirrorState.z);
    }
    const btnX = document.getElementById('btn-mirror-x');
    const btnY = document.getElementById('btn-mirror-y');
    const btnZ = document.getElementById('btn-mirror-z');

    if (btnX) btnX.classList.toggle('active', mirrorState.x === -1);
    if (btnY) btnY.classList.toggle('active', mirrorState.y === -1);
    if (btnZ) btnZ.classList.toggle('active', mirrorState.z === -1);
  }

  function setMode(mode) {
    currentMode = mode;
    const btnRotate = document.getElementById('btn-mode-rotate');
    const btnPan = document.getElementById('btn-mode-pan');
    const btnDraw = document.getElementById('btn-mode-draw');

    btnRotate.classList.toggle('active', mode === 'rotate');
    btnRotate.setAttribute('aria-selected', mode === 'rotate' ? 'true' : 'false');
    if (btnPan) {
      btnPan.classList.toggle('active', mode === 'pan');
      btnPan.setAttribute('aria-selected', mode === 'pan' ? 'true' : 'false');
    }
    btnDraw.classList.toggle('active', mode === 'draw');
    btnDraw.setAttribute('aria-selected', mode === 'draw' ? 'true' : 'false');

    if (mode === 'rotate') {
      controls.enabled = true;
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      if (plotStep === 'step2_z') cancelStep2();
      if (ghostMarker) ghostMarker.visible = false;
      if (step1PreviewLine) step1PreviewLine.visible = false;
      if (zGuideGroup) zGuideGroup.visible = false;
      updateHint('左ドラッグで視点を自由に回転 / 右ドラッグまたはShift+ドラッグで移動');
    } else if (mode === 'pan') {
      controls.enabled = true;
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
      if (plotStep === 'step2_z') cancelStep2();
      if (ghostMarker) ghostMarker.visible = false;
      if (step1PreviewLine) step1PreviewLine.visible = false;
      if (zGuideGroup) zGuideGroup.visible = false;
      updateHint('左ドラッグで原点・画面を移動 / ホイールでズーム');
    } else {
      controls.enabled = false;
      plotStep = 'step1_xy';
      if (ghostMarker) ghostMarker.visible = true;
      if (zGuideGroup) zGuideGroup.visible = false;
      updateHint('【ステップ 1/2】XY 平面上の位置をクリックしてください');
    }
  }

  function centerOrigin() {
    // Keep camera orientation & distance, move focus target to origin (0, 0, 0)
    const offset = camera.position.clone().sub(controls.target);
    controls.target.set(0, 0, 0);
    camera.position.copy(offset);
    controls.update();
    updateHint('原点を画面中心に合わせました');
  }

  function resetCameraView() {
    camera.position.set(16, -18, 14);
    camera.up.set(0, 0, 1);
    controls.target.set(0, 0, 0);
    controls.update();
    updateHint('視点を初期位置にリセットしました');
  }

  function toggleUI() {
    document.body.classList.toggle('ui-hidden');
  }

  function updateCoordinateDisplay(x, y, z, statusTag = '') {
    const el = document.getElementById('coord-readout');
    if (el) {
      const sign = z >= 0 ? '+' : '';
      const tag = statusTag ? ` ${statusTag}` : '';
      el.textContent = `X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${sign}${z.toFixed(2)}${tag}`;
    }
  }

  function updateHint(text) {
    const el = document.getElementById('mode-hint');
    if (el) el.textContent = text;
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- Wallpaper Engine Properties Integration ---
  function setupWallpaperEngineListener() {
    window.wallpaperPropertyListener = {
      applyUserProperties: function (properties) {
        if (!properties) return;

        // Theme: "light" | "dark"
        if (properties.theme) {
          setTheme(properties.theme.value === 'dark' ? 'dark' : 'light');
        }

        // Scheme color: "r g b" (0-1 floats) or hex string
        if (properties.schemecolor) {
          const sc = properties.schemecolor.value;
          let hexColor = colors.surface;
          if (typeof sc === 'string') {
            const parts = sc.split(' ').map(Number);
            if (parts.length >= 3) {
              const r = Math.round(parts[0] * 255);
              const g = Math.round(parts[1] * 255);
              const b = Math.round(parts[2] * 255);
              hexColor = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            } else if (sc.startsWith('#')) {
              hexColor = sc;
            }
          }
          colors.surface = hexColor;
          const inSurf = document.getElementById('color-surface');
          if (inSurf) inSurf.value = hexColor;
          generateCurrentMesh();
        }

        // Auto Spin: boolean
        if (properties.autospin) {
          autoSpin = Boolean(properties.autospin.value);
          const btnAutoSpin = document.getElementById('btn-auto-spin');
          if (btnAutoSpin) {
            btnAutoSpin.classList.toggle('active', autoSpin);
            const spinLabel = btnAutoSpin.querySelector('.spin-label');
            if (spinLabel) spinLabel.textContent = autoSpin ? '自転: ON' : '自転';
          }
          requestRender(30);
        }

        // Spin Speed: number
        if (properties.spinspeed) {
          autoSpinSpeed = parseFloat(properties.spinspeed.value) || 1.0;
        }

        // Show Grid: boolean
        if (properties.showgrid) {
          displaySettings.grid = Boolean(properties.showgrid.value);
          applyDisplaySettings();
        }

        // Show Axes: boolean
        if (properties.showaxes) {
          displaySettings.axes = Boolean(properties.showaxes.value);
          applyDisplaySettings();
        }

        // Eco Mode: boolean
        if (properties.ecomode) {
          displaySettings.eco = Boolean(properties.ecomode.value);
          applyDisplaySettings();
        }

        // Custom Light Position: boolean
        if (properties.customlight !== undefined) {
          setCustomLightEnabled(Boolean(properties.customlight.value));
        }
      }
    };
  }

  // --- Persistence (localStorage) ---
  function saveState() {
    try {
      const state = {
        theme: currentTheme,
        plotRange: currentPlotRange,
        colors: colors,
        points: drawnPoints.map(p => ({ x: p.position.x, y: p.position.y, z: p.position.z })),
        loopPoints: loopPoints,
        connectPoints,
        fillPolygon,
        lineWidth,
        pointSize,
        formulaType: formulaType,
        formula: document.getElementById('formula-input') ? document.getElementById('formula-input').value : '',
        paramX: document.getElementById('param-x') ? document.getElementById('param-x').value : '',
        paramY: document.getElementById('param-y') ? document.getElementById('param-y').value : '',
        paramZ: document.getElementById('param-z') ? document.getElementById('param-z').value : '',
        paramUMin: document.getElementById('param-u-min') ? document.getElementById('param-u-min').value : '',
        paramUMax: document.getElementById('param-u-max') ? document.getElementById('param-u-max').value : '',
        paramVMin: document.getElementById('param-v-min') ? document.getElementById('param-v-min').value : '',
        paramVMax: document.getElementById('param-v-max') ? document.getElementById('param-v-max').value : '',
        paramPreset: document.getElementById('parametric-preset') ? document.getElementById('parametric-preset').value : 'torus',
        style: document.getElementById('mesh-style') ? document.getElementById('mesh-style').value : 'both',
        mirror: mirrorState,
        rotZ: objectRotZ,
        rotVertical: objectRotVertical,
        spinAxis: spinAxis,
        autoSpin: autoSpin,
        autoSpinSpeed: autoSpinSpeed,
        displaySettings: displaySettings,
        customLight: {
          enabled: customLightEnabled,
          x: lightState.x,
          y: lightState.y,
          z: lightState.z,
          intensity: lightState.intensity,
          color: lightState.color
        }
      };
      localStorage.setItem('3d_wallpaper_state', JSON.stringify(state));
    } catch (e) {
      // Ignore storage errors in restricted contexts
    }
  }

  function restoreSavedState() {
    try {
      const raw = localStorage.getItem('3d_wallpaper_state');
      if (raw) {
        const state = JSON.parse(raw);
        // Theme
        setTheme(state.theme || 'light');

        // Plot Range
        if (state.plotRange) {
          currentPlotRange = parseFloat(state.plotRange);
          const rangeSlider = document.getElementById('range-slider');
          const rangeVal = document.getElementById('range-val');
          if (rangeSlider) rangeSlider.value = currentPlotRange;
          if (rangeVal) rangeVal.textContent = `±${currentPlotRange.toFixed(1)}`;
        }

        // Display Settings
        if (state.displaySettings) {
          Object.assign(displaySettings, state.displaySettings);
        }
        applyDisplaySettings();

        // Custom Light Position & Settings
        if (state.customLight) {
          if (state.customLight.x !== undefined) lightState.x = state.customLight.x;
          if (state.customLight.y !== undefined) lightState.y = state.customLight.y;
          if (state.customLight.z !== undefined) lightState.z = state.customLight.z;
          if (state.customLight.intensity !== undefined) lightState.intensity = state.customLight.intensity;
          if (state.customLight.color !== undefined) lightState.color = state.customLight.color;
          setCustomLightEnabled(Boolean(state.customLight.enabled));
        } else {
          setCustomLightEnabled(false);
        }

        // Colors
        if (state.colors) {
          colors = { ...defaultColors, ...state.colors };
          updateAxesColors();
          updatePointColors();
          const inSurf = document.getElementById('color-surface');
          const inPt = document.getElementById('color-point');
          const inLn = document.getElementById('color-line');
          const inAx = document.getElementById('color-axis-x');
          const inAy = document.getElementById('color-axis-y');
          const inAz = document.getElementById('color-axis-z');
          if (inSurf) inSurf.value = colors.surface;
          if (inPt) inPt.value = colors.point;
          if (inLn) inLn.value = colors.line;
          if (inAx) inAx.value = colors.axisX;
          if (inAy) inAy.value = colors.axisY;
          if (inAz) inAz.value = colors.axisZ;
        }

        // Mirror
        if (state.mirror) {
          mirrorState.x = state.mirror.x || 1;
          mirrorState.y = state.mirror.y || 1;
          mirrorState.z = state.mirror.z || 1;
          applyMirror();
        }

        // Rotation
        if (state.rotZ !== undefined || state.rotVertical !== undefined) {
          objectRotZ = typeof state.rotZ === 'number' ? state.rotZ : 0;
          objectRotVertical = typeof state.rotVertical === 'number' ? state.rotVertical : 0;
          applyObjectRotation(true);
        }

        // Spin Axis & Speed
        if (state.spinAxis) {
          spinAxis = state.spinAxis;
          const spinPillBtns = document.querySelectorAll('.pill-btn[data-spin-axis]');
          spinPillBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-spin-axis') === spinAxis));
        }
        if (state.autoSpinSpeed) {
          autoSpinSpeed = state.autoSpinSpeed;
        }
        if (state.autoSpin) {
          autoSpin = state.autoSpin;
          const btnAutoSpin = document.getElementById('btn-auto-spin');
          if (btnAutoSpin) {
            btnAutoSpin.classList.toggle('active', autoSpin);
            const spinLabel = btnAutoSpin.querySelector('.spin-label');
            if (spinLabel) spinLabel.textContent = autoSpin ? '自転: ON' : '自転';
          }
        }

        // Mesh Style
        if (state.style) {
          const styleEl = document.getElementById('mesh-style');
          if (styleEl) styleEl.value = state.style;
        }

        // Parametric inputs
        if (state.paramX) {
          const inX = document.getElementById('param-x');
          const inY = document.getElementById('param-y');
          const inZ = document.getElementById('param-z');
          const inUMin = document.getElementById('param-u-min');
          const inUMax = document.getElementById('param-u-max');
          const inVMin = document.getElementById('param-v-min');
          const inVMax = document.getElementById('param-v-max');
          const pSelect = document.getElementById('parametric-preset');
          if (inX) inX.value = state.paramX;
          if (inY) inY.value = state.paramY;
          if (inZ) inZ.value = state.paramZ;
          if (inUMin) inUMin.value = state.paramUMin;
          if (inUMax) inUMax.value = state.paramUMax;
          if (inVMin) inVMin.value = state.paramVMin;
          if (inVMax) inVMax.value = state.paramVMax;
          if (pSelect && state.paramPreset) pSelect.value = state.paramPreset;
        }

        // Formula Type & Generation
        if (state.formulaType) {
          formulaType = state.formulaType;
          const btnTypeExplicit = document.getElementById('btn-type-explicit');
          const btnTypeParametric = document.getElementById('btn-type-parametric');
          const explicitSec = document.getElementById('explicit-formula-section');
          const parametricSec = document.getElementById('parametric-formula-section');
          if (btnTypeExplicit) btnTypeExplicit.classList.toggle('active', formulaType === 'explicit');
          if (btnTypeParametric) btnTypeParametric.classList.toggle('active', formulaType === 'parametric');
          if (explicitSec) explicitSec.style.display = (formulaType === 'explicit' ? 'block' : 'none');
          if (parametricSec) parametricSec.style.display = (formulaType === 'parametric' ? 'block' : 'none');
        }

        if (state.formula) {
          const fInput = document.getElementById('formula-input');
          if (fInput) fInput.value = state.formula;
        }

        // Points & Loop
        connectPoints = state.connectPoints !== false;
        fillPolygon = Boolean(state.fillPolygon);
        lineWidth = Number.isFinite(state.lineWidth) ? state.lineWidth : 2;
        pointSize = Number.isFinite(state.pointSize) ? state.pointSize : 0.24;
        const connectToggle = document.getElementById('toggle-connect-points');
        const fillToggle = document.getElementById('toggle-fill-polygon');
        const lineWidthInput = document.getElementById('line-width');
        const lineWidthValue = document.getElementById('line-width-value');
        const pointSizeInput = document.getElementById('point-size');
        const pointSizeValue = document.getElementById('point-size-value');
        if (connectToggle) {
          connectToggle.classList.toggle('active', connectPoints);
          connectToggle.setAttribute('aria-checked', String(connectPoints));
        }
        if (fillToggle) {
          fillToggle.classList.toggle('active', fillPolygon);
          fillToggle.setAttribute('aria-checked', String(fillPolygon));
        }
        if (lineWidthInput) lineWidthInput.value = String(lineWidth);
        if (lineWidthValue) lineWidthValue.value = String(lineWidth);
        if (pointSizeInput) pointSizeInput.value = String(pointSize);
        if (pointSizeValue) pointSizeValue.value = pointSize.toFixed(2);
        if (state.loopPoints !== undefined) {
          loopPoints = Boolean(state.loopPoints);
        }
        if (state.points && Array.isArray(state.points)) {
          state.points.forEach(p => addPoint(p.x, p.y, p.z));
        }
        updateLoopLine();
        updatePolygonFill();

        generateCurrentMesh();
      } else {
        setTheme('light');
        applyDisplaySettings();
        setCustomLightEnabled(false);
        generateCurrentMesh();
      }
    } catch (e) {
      setTheme('light');
      applyDisplaySettings();
      setCustomLightEnabled(false);
      generateCurrentMesh();
    }
    requestRender(60);
  }

  // --- Animation Loop with Demand-driven Power Saving (Eco mode) ---
  function animate() {
    animationFrameId = null;

    // Completely pause rendering when document is hidden (background / minimized)
    if (document.hidden) return;

    const now = performance.now();
    const deltaSeconds = previousFrameTime === null ? 0 : Math.min((now - previousFrameTime) / 1000, 0.05);
    previousFrameTime = now;
    let shouldRender = !displaySettings.eco || autoSpin || renderFramesRemaining > 0;

    if (controls.enabled) {
      const dampingActive = controls.update();
      if (dampingActive) {
        shouldRender = true;
        renderFramesRemaining = Math.max(renderFramesRemaining, 8);
      }
    }

    if (autoSpin) {
      const speed = autoSpinSpeed || 1.0;
      if (spinAxis === 'z' || spinAxis === 'both') {
        objectRotZ = normalizeRotation(objectRotZ + 0.18 * speed * deltaSeconds);
      }
      if (spinAxis === 'vertical' || spinAxis === 'both') {
        objectRotVertical = normalizeRotation(objectRotVertical + 0.12 * speed * deltaSeconds);
      }
      applyObjectRotation(true);
      shouldRender = true;
    }

    if (renderFramesRemaining > 0) {
      renderFramesRemaining--;
    }

    if (shouldRender) {
      renderer.render(scene, camera);
    }

    if (!displaySettings.eco || autoSpin || renderFramesRemaining > 0 || (controls.enabled && shouldRender)) {
      animationFrameId = requestAnimationFrame(animate);
    }
  }

  // Run when DOM is ready
  window.addEventListener('DOMContentLoaded', init);
})();
