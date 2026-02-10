const canvas = document.getElementById("scene");
const tooltip = document.getElementById("tooltip");
const timeScaleInput = document.getElementById("timeScale");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
  logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin("anonymous");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03040b);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 52000000);
camera.position.set(0, 40, 170);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 9;
controls.maxDistance = 24000000;
controls.target.set(0, 0, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.2;

const query = new URLSearchParams(window.location.search);
if (query.get("view") === "galaxy") {
  camera.position.set(0, 3200, 9400);
  controls.autoRotate = false;
} else if (query.get("view") === "universe") {
  camera.position.set(0, 2200000, 7800000);
  controls.autoRotate = false;
} else if (query.get("view") === "all") {
  camera.position.set(0, 6400000, 21000000);
  controls.autoRotate = false;
}

const root = new THREE.Object3D();
root.rotation.x = THREE.Math.degToRad(3.8);
scene.add(root);

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(9, 9);
const pointerPx = new THREE.Vector2();
const clock = new THREE.Clock();

let pointerInside = false;
let hoveredPlanet = null;
let selectedPlanet = null;
let selectedAngleIndex = 0;
let controlsDragging = false;
let cameraTween = null;
let pointerDownPos = null;
let timeWarp = Number(timeScaleInput.value || 0.35);
const selectedCameraOffset = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

const defaultCamPos = new THREE.Vector3(0, 40, 170);
const defaultTarget = new THREE.Vector3(0, 0, 0);
const viewAngles = [
  new THREE.Vector3(1.1, 0.35, 1.2),
  new THREE.Vector3(-1.18, 0.56, 0.9),
  new THREE.Vector3(0.26, 1.2, 0.46),
  new THREE.Vector3(-0.34, 0.2, -1.24),
];

const pickables = [];
const planets = [];
const orbitLines = [];
let earthPlanetRef = null;
let moonRef = null;
let galaxyGroup = null;
let milkyWayBand = null;
let galacticCenterGlow = null;
let solarSystemMarker = null;
let solarSystemLabel = null;
let universeGroup = null;
let universeField = null;
let universeClusters = null;
let milkyWayUniverseMarker = null;
let milkyWayUniverseLabel = null;
let universeLabel = null;

const GALAXY_RADIUS = 18000;
const SOLAR_GALACTIC_RADIUS = GALAXY_RADIUS * 0.62;
const GALAXY_REVEAL_START = 900;
const GALAXY_REVEAL_FULL = 5200;
const UNIVERSE_RADIUS = 24000000;
const UNIVERSE_REVEAL_START = 18000;
const UNIVERSE_REVEAL_FULL = 2600000;

const EARTH_TEXTURES = {
  day: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_day_4096.jpg",
  normal: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg",
  specular: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg",
  lights: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_lights_2048.png",
  clouds: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png",
  moon: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg",
};

const defs = [
  { name: "Mercury", radius: 0.8, orbitRadius: 13, orbitDays: 88, spinDays: 58.6, tilt: 0.03, color: 0xa4abae, roughness: 0.95 },
  { name: "Venus", radius: 1.15, orbitRadius: 18, orbitDays: 225, spinDays: -243, tilt: 177.4, color: 0xd5b079, roughness: 0.82 },
  { name: "Earth", radius: 1.2, orbitRadius: 24, orbitDays: 365, spinDays: 1, tilt: 23.4, color: 0x4e86d8, roughness: 0.65 },
  { name: "Mars", radius: 0.95, orbitRadius: 31, orbitDays: 687, spinDays: 1.03, tilt: 25.2, color: 0xb3623f, roughness: 0.9 },
  { name: "Jupiter", radius: 3.15, orbitRadius: 45, orbitDays: 4331, spinDays: 0.41, tilt: 3.1, color: 0xcfa070, roughness: 0.78 },
  { name: "Saturn", radius: 2.7, orbitRadius: 59, orbitDays: 10747, spinDays: 0.44, tilt: 26.7, color: 0xd6bf8e, roughness: 0.78, ring: { inner: 3.45, outer: 5.8, color: 0xd8c49a } },
  { name: "Uranus", radius: 1.92, orbitRadius: 73, orbitDays: 30589, spinDays: -0.72, tilt: 97.8, color: 0x8fb8ce, roughness: 0.77 },
  { name: "Neptune", radius: 1.8, orbitRadius: 87, orbitDays: 59800, spinDays: 0.67, tilt: 28.3, color: 0x4d76cc, roughness: 0.79 },
];

setupLighting();
setupBackgroundStars();
setupMilkyWay();
setupUniverse();
setupSun();
setupPlanets();
setupEvents();
loadEarthAssets();
animate();

function setupLighting() {
  scene.add(new THREE.AmbientLight(0x2a3652, 0.17));
  scene.add(new THREE.HemisphereLight(0x688fc0, 0x090f1e, 0.14));
  root.add(new THREE.PointLight(0xfff0c0, 4.5, 0, 2));
}

function setupBackgroundStars() {
  const starGeo = new THREE.BufferGeometry();
  const count = 9000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 1200 + Math.random() * 34000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.Math.randFloatSpread(2));
    const id = i * 3;
    positions[id] = r * Math.sin(phi) * Math.cos(theta);
    positions[id + 1] = r * Math.cos(phi);
    positions[id + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xdde9ff,
      size: 0.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
  );
  scene.add(stars);
}

function setupMilkyWay() {
  galaxyGroup = new THREE.Group();
  galaxyGroup.rotation.set(THREE.Math.degToRad(26), THREE.Math.degToRad(-14), THREE.Math.degToRad(8));
  scene.add(galaxyGroup);

  const armGeo = new THREE.BufferGeometry();
  const armCount = 46000;
  const armPos = new Float32Array(armCount * 3);
  const armCol = new Float32Array(armCount * 3);
  const warm = new THREE.Color(0xffe6bc);
  const cool = new THREE.Color(0x90b9ff);
  const spiralTightness = 0.00095;

  for (let i = 0; i < armCount; i += 1) {
    const armIndex = i % 4;
    const basePhase = armIndex * (Math.PI / 2);
    const radius = 240 + Math.pow(Math.random(), 0.68) * GALAXY_RADIUS;
    const spiral = radius * spiralTightness;
    const jitter = THREE.Math.randFloatSpread(0.32);
    const angle = basePhase + spiral + jitter;
    const thickness = THREE.Math.randFloatSpread(100) * (0.28 + radius / GALAXY_RADIUS);
    const idx = i * 3;
    armPos[idx] = Math.cos(angle) * radius;
    armPos[idx + 1] = thickness;
    armPos[idx + 2] = Math.sin(angle) * radius;

    const mix = Math.min(1, radius / GALAXY_RADIUS) * (0.4 + Math.random() * 0.6);
    const color = warm.clone().lerp(cool, mix);
    armCol[idx] = color.r;
    armCol[idx + 1] = color.g;
    armCol[idx + 2] = color.b;
  }

  armGeo.setAttribute("position", new THREE.BufferAttribute(armPos, 3));
  armGeo.setAttribute("color", new THREE.BufferAttribute(armCol, 3));

  milkyWayBand = new THREE.Points(
    armGeo,
    new THREE.PointsMaterial({
      size: 4.6,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  galaxyGroup.add(milkyWayBand);

  galacticCenterGlow = new THREE.Mesh(
    new THREE.SphereGeometry(850, 52, 52),
    new THREE.MeshBasicMaterial({
      color: 0xd2e1ff,
      transparent: true,
      opacity: 0.04,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  galaxyGroup.add(galacticCenterGlow);

  const solarAngle = THREE.Math.degToRad(224);
  const solarPosition = new THREE.Vector3(
    Math.cos(solarAngle) * SOLAR_GALACTIC_RADIUS,
    14,
    Math.sin(solarAngle) * SOLAR_GALACTIC_RADIUS,
  );
  galaxyGroup.position.copy(solarPosition).multiplyScalar(-1);

  solarSystemMarker = new THREE.Mesh(
    new THREE.SphereGeometry(95, 18, 18),
    new THREE.MeshBasicMaterial({
      color: 0x9ec7ff,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  solarSystemMarker.position.copy(solarPosition);
  galaxyGroup.add(solarSystemMarker);

  solarSystemLabel = makeTextSprite("Solar System (Orion Arm)");
  solarSystemLabel.position.copy(solarPosition.clone().add(new THREE.Vector3(0, 340, 0)));
  solarSystemLabel.material.opacity = 0;
  galaxyGroup.add(solarSystemLabel);

  const tether = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), solarPosition]),
    new THREE.LineBasicMaterial({
      color: 0x6c89b8,
      transparent: true,
      opacity: 0.04,
    }),
  );
  galaxyGroup.add(tether);
}

function setupUniverse() {
  universeGroup = new THREE.Group();
  scene.add(universeGroup);

  const fieldGeo = new THREE.BufferGeometry();
  const fieldCount = 140000;
  const fieldPos = new Float32Array(fieldCount * 3);
  const fieldCol = new Float32Array(fieldCount * 3);
  const violet = new THREE.Color(0xb7bcff);
  const amber = new THREE.Color(0xffd2a8);
  const cyan = new THREE.Color(0xa3d7ff);

  for (let i = 0; i < fieldCount; i += 1) {
    const radius = 220000 + Math.pow(Math.random(), 0.56) * UNIVERSE_RADIUS;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.Math.randFloatSpread(2));
    const idx = i * 3;
    fieldPos[idx] = radius * Math.sin(phi) * Math.cos(theta);
    fieldPos[idx + 1] = radius * Math.cos(phi);
    fieldPos[idx + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const m = Math.random();
    const c = m < 0.33 ? violet.clone().lerp(cyan, Math.random()) : amber.clone().lerp(violet, Math.random());
    fieldCol[idx] = c.r;
    fieldCol[idx + 1] = c.g;
    fieldCol[idx + 2] = c.b;
  }

  fieldGeo.setAttribute("position", new THREE.BufferAttribute(fieldPos, 3));
  fieldGeo.setAttribute("color", new THREE.BufferAttribute(fieldCol, 3));
  universeField = new THREE.Points(
    fieldGeo,
    new THREE.PointsMaterial({
      size: 620,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  universeGroup.add(universeField);

  const clusterGeo = new THREE.BufferGeometry();
  const clusterCount = 5200;
  const clusterPos = new Float32Array(clusterCount * 3);
  for (let i = 0; i < clusterCount; i += 1) {
    const radius = 460000 + Math.pow(Math.random(), 0.7) * UNIVERSE_RADIUS;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.Math.randFloatSpread(2));
    const idx = i * 3;
    clusterPos[idx] = radius * Math.sin(phi) * Math.cos(theta);
    clusterPos[idx + 1] = radius * Math.cos(phi);
    clusterPos[idx + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  clusterGeo.setAttribute("position", new THREE.BufferAttribute(clusterPos, 3));
  universeClusters = new THREE.Points(
    clusterGeo,
    new THREE.PointsMaterial({
      color: 0xeadfff,
      size: 1900,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  universeGroup.add(universeClusters);

  milkyWayUniverseMarker = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 24),
    new THREE.MeshBasicMaterial({
      color: 0x8eb7ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  universeGroup.add(milkyWayUniverseMarker);

  milkyWayUniverseLabel = makeTextSprite("Milky Way (our galaxy)");
  milkyWayUniverseLabel.position.set(0, 26000, 0);
  milkyWayUniverseLabel.scale.set(62000, 9200, 1);
  milkyWayUniverseLabel.material.opacity = 0;
  universeGroup.add(milkyWayUniverseLabel);

  universeLabel = makeTextSprite("Observable Universe");
  universeLabel.position.set(0, 260000, -90000);
  universeLabel.scale.set(320000, 46000, 1);
  universeLabel.material.opacity = 0;
  universeGroup.add(universeLabel);
}

function setupSun() {
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(6.2, 96, 96),
    new THREE.MeshBasicMaterial({ color: 0xffbf5f }),
  );
  root.add(sun);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture(),
      color: 0xffdd98,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.set(28, 28, 1);
  sun.add(glow);
}

function setupPlanets() {
  const orbitLineMat = new THREE.LineBasicMaterial({
    color: 0x35537f,
    transparent: true,
    opacity: 0.4,
  });

  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i];

    const orbitLine = createOrbit(def.orbitRadius, orbitLineMat);
    root.add(orbitLine);
    orbitLines.push(orbitLine);

    const orbitPivot = new THREE.Object3D();
    orbitPivot.rotation.y = Math.random() * Math.PI * 2;
    root.add(orbitPivot);

    const anchor = new THREE.Object3D();
    anchor.position.x = def.orbitRadius;
    orbitPivot.add(anchor);

    const material = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: def.roughness,
      metalness: 0.03,
      emissive: new THREE.Color(0x101829),
      emissiveIntensity: 0.05,
    });

    if (def.name === "Earth") {
      material.roughness = 0.56;
      material.metalness = 0.0;
      material.emissive = new THREE.Color(0x1a2439);
      material.emissiveIntensity = 0.12;
    }

    const planetMesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 80, 80), material);
    planetMesh.rotation.z = THREE.Math.degToRad(def.tilt);
    anchor.add(planetMesh);
    pickables.push(planetMesh);

    let cloudMesh = null;
    let atmosphereMesh = null;
    if (def.name === "Earth") {
      cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius * 1.028, 64, 64),
        new THREE.MeshPhongMaterial({
          color: 0xd9ecff,
          transparent: true,
          opacity: 0.13,
          depthWrite: false,
          emissive: new THREE.Color(0x5f87c5),
          emissiveIntensity: 0.12,
        }),
      );
      planetMesh.add(cloudMesh);

      atmosphereMesh = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius * 1.08, 64, 64),
        new THREE.MeshBasicMaterial({
          color: 0x7ab3ff,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          depthWrite: false,
        }),
      );
      planetMesh.add(atmosphereMesh);
    }

    if (def.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(def.ring.inner, def.ring.outer, 200),
        new THREE.MeshStandardMaterial({
          color: def.ring.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.82,
          roughness: 0.92,
          metalness: 0.02,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.rotation.y = THREE.Math.degToRad(12);
      planetMesh.add(ring);
    }

    const planet = {
      def,
      orbitPivot,
      anchor,
      mesh: planetMesh,
      clouds: cloudMesh,
      atmosphere: atmosphereMesh,
      material,
      highlight: 0,
      spin: Math.random() * Math.PI * 2,
    };
    planetMesh.userData.planet = planet;
    planets.push(planet);
    if (def.name === "Earth") {
      earthPlanetRef = planet;
      setupMoon(planet);
    }
  }
}

function loadEarthAssets() {
  Promise.all([
    loadTexture(EARTH_TEXTURES.day, true),
    loadTexture(EARTH_TEXTURES.normal, false),
    loadTexture(EARTH_TEXTURES.specular, false),
    loadTexture(EARTH_TEXTURES.lights, true),
    loadTexture(EARTH_TEXTURES.clouds, true),
    loadTexture(EARTH_TEXTURES.moon, true),
  ]).then(([day, normal, specular, lights, clouds, moon]) => {
    applyEarthAssets({ day, normal, specular, lights, clouds, moon });
  });
}

function loadTexture(url, isColor) {
  return new Promise((resolve) => {
    textureLoader.load(
      url,
      (texture) => {
        configureTexture(texture, isColor);
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
}

function configureTexture(texture, isColor) {
  texture.anisotropy = maxAnisotropy;
  texture.encoding = isColor ? THREE.sRGBEncoding : THREE.LinearEncoding;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
}

function applyEarthAssets(assets) {
  if (!earthPlanetRef) return;

  const earthMaterial = earthPlanetRef.material;
  if (assets.day) {
    earthMaterial.map = assets.day;
    earthMaterial.color.setHex(0xffffff);
  }
  if (assets.normal) {
    earthMaterial.normalMap = assets.normal;
    earthMaterial.normalScale = new THREE.Vector2(0.8, 0.8);
  }
  if (assets.specular) {
    earthMaterial.roughnessMap = assets.specular;
    earthMaterial.roughness = 0.53;
  }
  if (assets.lights) {
    earthMaterial.emissiveMap = assets.lights;
    earthMaterial.emissive = new THREE.Color(0x9fc3ff);
    earthMaterial.emissiveIntensity = 0.32;
  }
  earthMaterial.needsUpdate = true;

  if (earthPlanetRef.clouds && assets.clouds) {
    const cloudMaterial = earthPlanetRef.clouds.material;
    cloudMaterial.map = assets.clouds;
    cloudMaterial.alphaMap = assets.clouds;
    cloudMaterial.opacity = 0.52;
    cloudMaterial.needsUpdate = true;
  }

  if (moonRef && assets.moon) {
    moonRef.material.map = assets.moon;
    moonRef.material.color.setHex(0xffffff);
    moonRef.material.needsUpdate = true;
  }
}

function setupMoon(earthPlanet) {
  const moonOrbitRadius = earthPlanet.def.radius * 2.9;
  const moonOrbit = createOrbit(
    moonOrbitRadius,
    new THREE.LineBasicMaterial({
      color: 0x7a8ea9,
      transparent: true,
      opacity: 0.45,
    }),
  );
  earthPlanet.anchor.add(moonOrbit);
  orbitLines.push(moonOrbit);

  const moonPivot = new THREE.Object3D();
  moonPivot.rotation.z = THREE.Math.degToRad(5.1);
  earthPlanet.anchor.add(moonPivot);

  const moonAnchor = new THREE.Object3D();
  moonAnchor.position.x = moonOrbitRadius;
  moonPivot.add(moonAnchor);

  const moonMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8bfca,
    roughness: 0.92,
    metalness: 0.01,
    emissive: new THREE.Color(0x0f1218),
    emissiveIntensity: 0.06,
  });
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(earthPlanet.def.radius * 0.28, 48, 48),
    moonMaterial,
  );
  moonAnchor.add(moonMesh);

  moonRef = {
    orbitPivot: moonPivot,
    mesh: moonMesh,
    material: moonMaterial,
    orbitDays: 27.32,
    spinDays: 27.32,
    spin: Math.random() * Math.PI * 2,
  };
}

function createOrbit(radius, material) {
  const points = [];
  const segments = 200;
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  line.userData.baseOpacity = material.opacity !== undefined ? material.opacity : 1;
  return line;
}

function createGlowTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255, 240, 200, 1)");
  g.addColorStop(0.35, "rgba(255, 192, 96, 0.72)");
  g.addColorStop(1, "rgba(255, 150, 32, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function makeTextSprite(text) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = "700 56px Space Grotesk, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(196,220,255,0.95)";
  ctx.fillText(text, c.width / 2, c.height / 2);
  const texture = new THREE.CanvasTexture(c);
  texture.encoding = THREE.sRGBEncoding;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2100, 330, 1);
  return sprite;
}

function setupEvents() {
  controls.addEventListener("start", () => {
    controlsDragging = true;
    canvas.style.cursor = "grabbing";
  });
  controls.addEventListener("end", () => {
    controlsDragging = false;
    if (selectedPlanet) {
      selectedCameraOffset.copy(camera.position).sub(controls.target);
    }
    canvas.style.cursor = hoveredPlanet ? "pointer" : "grab";
  });

  timeScaleInput.addEventListener("input", () => {
    timeWarp = Number(timeScaleInput.value || 0.35);
  });

  canvas.addEventListener("pointermove", (e) => {
    pointerInside = true;
    pointerPx.set(e.clientX, e.clientY);
    updatePointer(e);
  });

  canvas.addEventListener("pointerdown", (e) => {
    pointerDownPos = new THREE.Vector2(e.clientX, e.clientY);
    updatePointer(e);
  });

  canvas.addEventListener("pointerup", (e) => {
    updatePointer(e);
    if (!pointerDownPos) return;
    const distance = pointerDownPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY));
    pointerDownPos = null;
    if (distance < 4 && hoveredPlanet) {
      focusPlanet(hoveredPlanet);
    }
  });

  canvas.addEventListener("pointerleave", () => {
    pointerInside = false;
    hoveredPlanet = null;
    tooltip.classList.add("hidden");
    pointerNdc.set(9, 9);
  });

  canvas.addEventListener("dblclick", () => {
    selectedPlanet = null;
    selectedAngleIndex = 0;
    startCameraTween(defaultCamPos, defaultTarget, 1200);
  });

  window.addEventListener("resize", onResize);
}

function updatePointer(e) {
  const bounds = canvas.getBoundingClientRect();
  pointerNdc.x = ((e.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointerNdc.y = -((e.clientY - bounds.top) / bounds.height) * 2 + 1;
}

function focusPlanet(planet) {
  if (selectedPlanet === planet) {
    selectedAngleIndex = (selectedAngleIndex + 1) % viewAngles.length;
  } else {
    selectedPlanet = planet;
    selectedAngleIndex = 0;
  }

  const target = planet.mesh.getWorldPosition(v1).clone();
  const dir = viewAngles[selectedAngleIndex].clone().normalize();
  const distance = Math.max(planet.def.radius * 6.6, 9.2);
  const position = target.clone().add(dir.multiplyScalar(distance));
  position.y += planet.def.radius * 0.45;

  selectedCameraOffset.copy(position).sub(target);
  startCameraTween(position, target, 1300);
}

function startCameraTween(endPos, endTarget, durationMs) {
  cameraTween = {
    startedAt: performance.now(),
    durationMs,
    startPos: camera.position.clone(),
    startTarget: controls.target.clone(),
    endPos: endPos.clone(),
    endTarget: endTarget.clone(),
  };
  controls.enabled = false;
}

function updateCameraTween(now) {
  if (!cameraTween) return;
  const t = Math.min((now - cameraTween.startedAt) / cameraTween.durationMs, 1);
  const e = easeInOutQuint(t);
  camera.position.lerpVectors(cameraTween.startPos, cameraTween.endPos, e);
  controls.target.lerpVectors(cameraTween.startTarget, cameraTween.endTarget, e);
  if (t >= 1) {
    controls.enabled = true;
    cameraTween = null;
  }
}

function easeInOutQuint(t) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function updateHover() {
  if (!pointerInside) return;
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  hoveredPlanet = hits.length > 0 ? hits[0].object.userData.planet : null;
  canvas.style.cursor = hoveredPlanet ? "pointer" : controlsDragging ? "grabbing" : "grab";

  if (hoveredPlanet) {
    tooltip.textContent = hoveredPlanet.def.name + " - click to shift angle";
    tooltip.style.left = pointerPx.x + "px";
    tooltip.style.top = pointerPx.y + "px";
    tooltip.classList.remove("hidden");
  } else {
    tooltip.classList.add("hidden");
  }
}

function updateScaleContext() {
  const cameraDistance = camera.position.distanceTo(controls.target);
  const galaxyAlpha = THREE.MathUtils.clamp(
    (cameraDistance - GALAXY_REVEAL_START) / (GALAXY_REVEAL_FULL - GALAXY_REVEAL_START),
    0,
    1,
  );
  const universeAlpha = THREE.MathUtils.clamp(
    (cameraDistance - UNIVERSE_REVEAL_START) / (UNIVERSE_REVEAL_FULL - UNIVERSE_REVEAL_START),
    0,
    1,
  );

  if (milkyWayBand) {
    milkyWayBand.material.opacity = (0.05 + galaxyAlpha * 0.46) * (1 - universeAlpha * 0.45);
  }
  if (galacticCenterGlow) {
    galacticCenterGlow.material.opacity = (0.04 + galaxyAlpha * 0.18) * (1 - universeAlpha * 0.5);
  }
  if (solarSystemMarker) {
    solarSystemMarker.material.opacity = (0.08 + galaxyAlpha * 0.58) * (1 - universeAlpha * 0.65);
    const markerScale = 1 + galaxyAlpha * 2.3 - universeAlpha * 1.6;
    solarSystemMarker.scale.set(markerScale, markerScale, markerScale);
  }
  if (solarSystemLabel) {
    solarSystemLabel.material.opacity = Math.pow(galaxyAlpha, 1.3) * (1 - universeAlpha * 0.7) * 0.95;
  }

  if (universeField) {
    universeField.material.opacity = universeAlpha * 0.86;
  }
  if (universeClusters) {
    universeClusters.material.opacity = universeAlpha * 0.58;
  }
  if (milkyWayUniverseMarker) {
    milkyWayUniverseMarker.material.opacity = universeAlpha * 0.82;
    const s = 1 + universeAlpha * 0.8;
    milkyWayUniverseMarker.scale.set(s, s, s);
  }
  if (milkyWayUniverseLabel) {
    milkyWayUniverseLabel.material.opacity = Math.pow(universeAlpha, 1.2) * 0.96;
  }
  if (universeLabel) {
    universeLabel.material.opacity = Math.pow(universeAlpha, 1.5) * 0.9;
  }

  for (let i = 0; i < orbitLines.length; i += 1) {
    const line = orbitLines[i];
    const base = line.userData.baseOpacity || 0.4;
    line.material.opacity = base * (1 - galaxyAlpha * 0.82) * (1 - universeAlpha * 0.8);
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const simDays = dt * timeWarp * 0.55;

  updateHover();
  updateCameraTween(now || 0);

  for (let i = 0; i < planets.length; i += 1) {
    const p = planets[i];
    const orbitStep = (Math.PI * 2 * simDays) / p.def.orbitDays;
    const spinSign = Math.sign(p.def.spinDays) || 1;
    const spinStep = ((Math.PI * 2 * simDays) / Math.abs(p.def.spinDays)) * spinSign;
    p.orbitPivot.rotation.y += orbitStep;
    p.spin += spinStep;
    p.mesh.rotation.y = p.spin;

    if (p.clouds) {
      p.clouds.rotation.y += dt * timeWarp * 0.09;
    }
    if (p.atmosphere) {
      p.atmosphere.rotation.y += dt * 0.02;
    }

    const h = hoveredPlanet === p ? 1 : selectedPlanet === p ? 0.7 : 0;
    p.highlight += (h - p.highlight) * (1 - Math.exp(-dt * 10));
    const scale = 1 + p.highlight * 0.085;
    p.mesh.scale.set(scale, scale, scale);
    p.material.emissiveIntensity = 0.05 + p.highlight * 0.3;
  }

  if (moonRef) {
    const moonOrbitStep = (Math.PI * 2 * simDays) / moonRef.orbitDays;
    const moonSpinStep = (Math.PI * 2 * simDays) / moonRef.spinDays;
    moonRef.orbitPivot.rotation.y += moonOrbitStep;
    moonRef.spin += moonSpinStep;
    moonRef.mesh.rotation.y = moonRef.spin;
  }

  if (selectedPlanet && !cameraTween) {
    const followTarget = selectedPlanet.mesh.getWorldPosition(v2);
    const alpha = 1 - Math.exp(-dt * 6);
    controls.target.lerp(followTarget, alpha);
    if (!controlsDragging) {
      camera.position.lerp(followTarget.clone().add(selectedCameraOffset), alpha);
    } else {
      selectedCameraOffset.copy(camera.position).sub(controls.target);
    }
  }

  updateScaleContext();
  controls.autoRotate = !selectedPlanet && !cameraTween && !controlsDragging;
  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
