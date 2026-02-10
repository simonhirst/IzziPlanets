import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://unpkg.com/three@0.161.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.161.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.161.0/examples/jsm/postprocessing/UnrealBloomPass.js";

const canvas = document.getElementById("scene");
const tooltip = document.getElementById("tooltip");
const timeScaleInput = document.getElementById("timeScale");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03040a);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 6000);
camera.position.set(0, 42, 156);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 10;
controls.maxDistance = 800;
controls.target.set(0, 0, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.16;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.75, 0.18);
composer.addPass(bloomPass);

const loader = new THREE.TextureLoader();
const anisotropy = renderer.capabilities.getMaxAnisotropy();
const ASSET_BASE = "https://raw.githubusercontent.com/jeromeetienne/threex.planets/master/images/";

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(9, 9);
const pointerPx = new THREE.Vector2();
const clock = new THREE.Clock();

let pointerInside = false;
let hoveredPlanet = null;
let activePlanet = null;
let activeAngleIndex = 0;
let controlsDragging = false;
let timeWarp = Number(timeScaleInput.value || 42);
const activeOffset = new THREE.Vector3(0, 0, 0);
const tmpVecA = new THREE.Vector3();
const tmpVecB = new THREE.Vector3();

let pointerDownPos = null;
let cameraTransition = null;

const defaultCameraPosition = new THREE.Vector3(0, 42, 156);
const defaultTarget = new THREE.Vector3(0, 0, 0);
const focusAngles = [
  new THREE.Vector3(1.05, 0.34, 1.18),
  new THREE.Vector3(-1.2, 0.52, 1),
  new THREE.Vector3(0.24, 1.1, 0.44),
  new THREE.Vector3(-0.32, 0.26, -1.24),
];

const orbitalRoot = new THREE.Object3D();
orbitalRoot.rotation.x = THREE.MathUtils.degToRad(3.4);
scene.add(orbitalRoot);

const pickables = [];
const planets = [];

const planetDefs = [
  { name: "Mercury", radius: 0.8, orbitRadius: 12, orbitDays: 88, rotationDays: 58.6, tilt: 0.03, map: "mercurymap.jpg", color: 0xa6aaa7, roughness: 0.88, metalness: 0.02 },
  { name: "Venus", radius: 1.1, orbitRadius: 17, orbitDays: 225, rotationDays: -243, tilt: 177.4, map: "venusmap.jpg", color: 0xc9ab73, roughness: 0.72, metalness: 0.04 },
  { name: "Earth", radius: 1.16, orbitRadius: 23, orbitDays: 365, rotationDays: 1, tilt: 23.4, map: "earthmap1k.jpg", color: 0x4a81d0, roughness: 0.62, metalness: 0.02 },
  { name: "Mars", radius: 0.92, orbitRadius: 30, orbitDays: 687, rotationDays: 1.03, tilt: 25.2, map: "marsmap1k.jpg", color: 0xb35d3a, roughness: 0.84, metalness: 0.03 },
  { name: "Jupiter", radius: 2.9, orbitRadius: 44, orbitDays: 4331, rotationDays: 0.41, tilt: 3.1, map: "jupitermap.jpg", color: 0xc89e6f, roughness: 0.72, metalness: 0.01 },
  {
    name: "Saturn",
    radius: 2.45,
    orbitRadius: 58,
    orbitDays: 10747,
    rotationDays: 0.44,
    tilt: 26.7,
    map: "saturnmap.jpg",
    color: 0xd2bc89,
    roughness: 0.74,
    metalness: 0.01,
    ring: { inner: 3.2, outer: 5.7 },
  },
  { name: "Uranus", radius: 1.8, orbitRadius: 72, orbitDays: 30589, rotationDays: -0.72, tilt: 97.8, map: "uranusmap.jpg", color: 0x8db4cc, roughness: 0.72, metalness: 0.02 },
  { name: "Neptune", radius: 1.7, orbitRadius: 86, orbitDays: 59800, rotationDays: 0.67, tilt: 28.3, map: "neptunemap.jpg", color: 0x4a72cc, roughness: 0.74, metalness: 0.02 },
];

const textures = await loadTextures();
setupEnvironment();
setupSun();
buildSolarSystem();
setupInteraction();
animate();

async function loadTextures() {
  const textureRequests = [
    { key: "starfield", file: "galaxy_starfield.png", color: true },
    { key: "sun", file: "sunmap.jpg", color: true },
    { key: "earthClouds", file: "earthcloudmap.jpg", color: true },
    { key: "earthBump", file: "earthbump1k.jpg", color: false },
    { key: "earthSpec", file: "earthspec1k.jpg", color: false },
    { key: "saturnRingColor", file: "saturnringcolor.jpg", color: true },
    { key: "saturnRingPattern", file: "saturnringpattern.gif", color: false },
    ...planetDefs.map((planet) => ({ key: planet.name, file: planet.map, color: true })),
  ];

  const output = {};
  const loaded = await Promise.all(
    textureRequests.map(async (request) => {
      const texture = await loadTexture(request.file, request.color);
      return { key: request.key, texture };
    }),
  );

  for (const item of loaded) {
    output[item.key] = item.texture;
  }
  return output;
}

async function loadTexture(file, color = true) {
  try {
    const texture = await loader.loadAsync(`${ASSET_BASE}${file}`);
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
  } catch (error) {
    console.warn(`Texture failed to load: ${file}`, error);
    return null;
  }
}

function setupEnvironment() {
  const ambient = new THREE.AmbientLight(0x27364d, 0.16);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x6a9bd5, 0x0a101f, 0.15);
  scene.add(hemi);

  if (textures.starfield) {
    const starsShell = new THREE.Mesh(
      new THREE.SphereGeometry(2100, 64, 64),
      new THREE.MeshBasicMaterial({
        map: textures.starfield,
        side: THREE.BackSide,
      }),
    );
    scene.add(starsShell);
  }

  const starGeometry = new THREE.BufferGeometry();
  const starCount = 6500;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const radius = 380 + Math.random() * 1450;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    const idx = i * 3;
    starPositions[idx] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[idx + 1] = radius * Math.cos(phi);
    starPositions[idx + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starPoints = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xd8e8ff,
      size: 0.75,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  scene.add(starPoints);
}

function setupSun() {
  const sunMaterial = new THREE.MeshBasicMaterial({
    map: textures.sun || null,
    color: textures.sun ? 0xffffff : 0xffc66f,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5.9, 96, 96), sunMaterial);
  sun.name = "Sun";
  orbitalRoot.add(sun);

  const glowSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture(),
      color: 0xffde9d,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glowSprite.scale.setScalar(25);
  sun.add(glowSprite);

  const sunlight = new THREE.PointLight(0xfff0c2, 4.8, 0, 2.0);
  sunlight.castShadow = false;
  orbitalRoot.add(sunlight);
}

function buildSolarSystem() {
  const orbitLineMaterial = new THREE.LineBasicMaterial({
    color: 0x32517c,
    transparent: true,
    opacity: 0.38,
  });

  for (const def of planetDefs) {
    const orbitLine = createOrbitLine(def.orbitRadius, orbitLineMaterial);
    orbitalRoot.add(orbitLine);

    const pivot = new THREE.Object3D();
    const anchor = new THREE.Object3D();
    pivot.rotation.y = Math.random() * Math.PI * 2;
    orbitalRoot.add(pivot);
    pivot.add(anchor);
    anchor.position.set(def.orbitRadius, 0, 0);

    let material;
    if (def.name === "Earth") {
      material = new THREE.MeshPhongMaterial({
        map: textures.Earth || null,
        bumpMap: textures.earthBump || null,
        bumpScale: 0.12,
        specularMap: textures.earthSpec || null,
        specular: new THREE.Color(0x314f72),
        shininess: 20,
        color: textures.Earth ? 0xffffff : def.color,
        emissive: new THREE.Color(0x131d2b),
        emissiveIntensity: 0.04,
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        map: textures[def.name] || null,
        color: textures[def.name] ? 0xffffff : def.color,
        roughness: def.roughness,
        metalness: def.metalness,
        emissive: new THREE.Color(0x0f1724),
        emissiveIntensity: 0.04,
      });
    }

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 80, 80), material);
    mesh.rotation.z = THREE.MathUtils.degToRad(def.tilt);
    mesh.userData.name = def.name;
    mesh.userData.pickable = true;
    anchor.add(mesh);
    pickables.push(mesh);

    let clouds = null;
    if (def.name === "Earth" && textures.earthClouds) {
      const cloudMaterial = new THREE.MeshPhongMaterial({
        map: textures.earthClouds,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
      });
      clouds = new THREE.Mesh(new THREE.SphereGeometry(def.radius * 1.026, 72, 72), cloudMaterial);
      mesh.add(clouds);
    }

    if (def.ring) {
      const ringGeometry = new THREE.RingGeometry(def.ring.inner, def.ring.outer, 180);
      const ringMaterial = new THREE.MeshStandardMaterial({
        map: textures.saturnRingColor || null,
        alphaMap: textures.saturnRingPattern || null,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        roughness: 0.68,
        metalness: 0.05,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.y = THREE.MathUtils.degToRad(10);
      mesh.add(ring);
    }

    const planet = {
      def,
      pivot,
      anchor,
      mesh,
      clouds,
      material,
      highlight: 0,
      spin: Math.random() * Math.PI * 2,
    };
    mesh.userData.planetRef = planet;
    planets.push(planet);
  }
}

function createOrbitLine(radius, material) {
  const points = [];
  const segments = 200;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
}

function createGlowTexture() {
  const size = 256;
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = size;
  glowCanvas.height = size;
  const ctx = glowCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 235, 182, 1)");
  gradient.addColorStop(0.35, "rgba(255, 196, 100, 0.72)");
  gradient.addColorStop(1, "rgba(255, 150, 24, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function setupInteraction() {
  controls.addEventListener("start", () => {
    controlsDragging = true;
    canvas.style.cursor = "grabbing";
  });

  controls.addEventListener("end", () => {
    controlsDragging = false;
    if (activePlanet) {
      activeOffset.copy(camera.position).sub(controls.target);
    }
    canvas.style.cursor = hoveredPlanet ? "pointer" : "grab";
  });

  timeScaleInput.addEventListener("input", () => {
    timeWarp = Number(timeScaleInput.value || 42);
  });

  canvas.addEventListener("pointermove", (event) => {
    pointerInside = true;
    pointerPx.set(event.clientX, event.clientY);
    updatePointerNdc(event);
  });

  canvas.addEventListener("pointerdown", (event) => {
    pointerDownPos = new THREE.Vector2(event.clientX, event.clientY);
    updatePointerNdc(event);
  });

  canvas.addEventListener("pointerup", (event) => {
    updatePointerNdc(event);
    if (!pointerDownPos) return;
    const dragDistance = pointerDownPos.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
    pointerDownPos = null;
    if (dragDistance < 4) {
      if (hoveredPlanet) {
        focusPlanet(hoveredPlanet);
      }
    }
  });

  canvas.addEventListener("pointerleave", () => {
    pointerInside = false;
    hoveredPlanet = null;
    tooltip.classList.add("hidden");
    pointerNdc.set(9, 9);
  });

  canvas.addEventListener("dblclick", () => {
    resetCamera();
  });

  window.addEventListener("resize", onResize);
}

function updatePointerNdc(event) {
  const bounds = canvas.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
}

function focusPlanet(planet) {
  if (activePlanet === planet) {
    activeAngleIndex = (activeAngleIndex + 1) % focusAngles.length;
  } else {
    activePlanet = planet;
    activeAngleIndex = 0;
  }

  const target = planet.mesh.getWorldPosition(tmpVecA).clone();
  const direction = focusAngles[activeAngleIndex].clone().normalize();
  const distance = Math.max(planet.def.radius * 6.6, 8.5);
  const cameraPosition = target.clone().add(direction.multiplyScalar(distance));
  cameraPosition.y += planet.def.radius * 0.45;

  activeOffset.copy(cameraPosition).sub(target);
  beginCameraTransition(cameraPosition, target, 1400);
}

function resetCamera() {
  activePlanet = null;
  activeAngleIndex = 0;
  beginCameraTransition(defaultCameraPosition, defaultTarget, 1400);
}

function beginCameraTransition(endPosition, endTarget, durationMs) {
  cameraTransition = {
    startedAt: performance.now(),
    durationMs,
    startPosition: camera.position.clone(),
    startTarget: controls.target.clone(),
    endPosition: endPosition.clone(),
    endTarget: endTarget.clone(),
  };
  controls.enabled = false;
}

function updateCameraTransition(nowMs) {
  if (!cameraTransition) return;

  const elapsed = nowMs - cameraTransition.startedAt;
  const t = THREE.MathUtils.clamp(elapsed / cameraTransition.durationMs, 0, 1);
  const eased = easeInOutQuint(t);

  camera.position.lerpVectors(cameraTransition.startPosition, cameraTransition.endPosition, eased);
  controls.target.lerpVectors(cameraTransition.startTarget, cameraTransition.endTarget, eased);

  if (t >= 1) {
    controls.enabled = true;
    cameraTransition = null;
  }
}

function easeInOutQuint(t) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function updateHover() {
  if (!pointerInside) return;
  raycaster.setFromCamera(pointerNdc, camera);
  const intersections = raycaster.intersectObjects(pickables, false);
  hoveredPlanet = intersections.length > 0 ? intersections[0].object.userData.planetRef : null;
  canvas.style.cursor = hoveredPlanet ? "pointer" : controlsDragging ? "grabbing" : "grab";

  if (hoveredPlanet) {
    tooltip.textContent = `${hoveredPlanet.def.name} - click to shift angle`;
    tooltip.style.left = `${pointerPx.x}px`;
    tooltip.style.top = `${pointerPx.y}px`;
    tooltip.classList.remove("hidden");
  } else {
    tooltip.classList.add("hidden");
  }
}

function animate(nowMs = 0) {
  requestAnimationFrame(animate);

  const deltaSeconds = Math.min(clock.getDelta(), 0.05);
  const simulatedDays = deltaSeconds * timeWarp * 2.6;

  updateHover();
  updateCameraTransition(nowMs);

  for (const planet of planets) {
    const orbitStep = (Math.PI * 2 * simulatedDays) / planet.def.orbitDays;
    const spinSign = Math.sign(planet.def.rotationDays) || 1;
    const spinStep = ((Math.PI * 2 * simulatedDays) / Math.abs(planet.def.rotationDays)) * spinSign;

    planet.pivot.rotation.y += orbitStep;
    planet.spin += spinStep;
    planet.mesh.rotation.y = planet.spin;

    if (planet.clouds) {
      planet.clouds.rotation.y += deltaSeconds * 0.08 * timeWarp;
    }

    const highlightTarget = hoveredPlanet === planet ? 1 : activePlanet === planet ? 0.7 : 0;
    planet.highlight += (highlightTarget - planet.highlight) * (1 - Math.exp(-deltaSeconds * 11));
    const pulse = 1 + planet.highlight * 0.085;
    planet.mesh.scale.setScalar(pulse);
    planet.material.emissiveIntensity = 0.04 + planet.highlight * 0.28;
  }

  if (activePlanet && !cameraTransition) {
    const followTarget = activePlanet.mesh.getWorldPosition(tmpVecB);
    const followStrength = 1 - Math.exp(-deltaSeconds * 6);
    controls.target.lerp(followTarget, followStrength);
    if (!controlsDragging) {
      const desiredPosition = followTarget.clone().add(activeOffset);
      camera.position.lerp(desiredPosition, followStrength);
    } else {
      activeOffset.copy(camera.position).sub(controls.target);
    }
  }

  controls.autoRotate = !activePlanet && !cameraTransition && !controlsDragging;
  controls.update();
  composer.render();
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
}
