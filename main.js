const canvas = document.getElementById("scene");
const tooltip = document.getElementById("tooltip");
const timeScaleInput = document.getElementById("timeScale");
const positionModeInput = document.getElementById("positionMode");
const scaleFill = document.getElementById("scaleFill");
const scaleThumb = document.getElementById("scaleThumb");
const infoBar = document.getElementById("infoBar");
const infoLabel = document.getElementById("infoLabel");
const btnReset = document.getElementById("btnReset");
const planetNav = document.getElementById("planetNav");
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
const query = new URLSearchParams(window.location.search);

const QUALITY_PRESETS = {
  low: {
    q: 0.28, pixelRatioCap: 1, minPixelRatio: 0.72, logDepth: false, maxAnisotropy: 2,
    uiMs: 120, hoverMs: 66, liveMs: 160, planetSegments: 40, atmoSegments: 28, moonSegments: 16, ringSegments: 96, sunSegments: 48,
  },
  medium: {
    q: 0.55, pixelRatioCap: 1.35, minPixelRatio: 0.8, logDepth: false, maxAnisotropy: 4,
    uiMs: 90, hoverMs: 50, liveMs: 100, planetSegments: 56, atmoSegments: 40, moonSegments: 22, ringSegments: 144, sunSegments: 72,
  },
  high: {
    q: 1, pixelRatioCap: 1.75, minPixelRatio: 0.95, logDepth: true, maxAnisotropy: 8,
    uiMs: 60, hoverMs: 33, liveMs: 50, planetSegments: 80, atmoSegments: 64, moonSegments: 32, ringSegments: 200, sunSegments: 96,
  },
};

function inferQualityTier() {
  if (isMobile) return "low";
  var mem = navigator.deviceMemory || 0;
  var cores = navigator.hardwareConcurrency || 0;
  if ((mem && mem <= 4) || (cores && cores <= 4)) return "low";
  if ((mem && mem <= 8) || (cores && cores <= 8)) return "medium";
  return "high";
}

var requestedQuality = (query.get("quality") || "").toLowerCase();
const qualityTier = QUALITY_PRESETS[requestedQuality] ? requestedQuality : inferQualityTier();
const quality = QUALITY_PRESETS[qualityTier];
const Q = quality.q;
const UI_UPDATE_INTERVAL_MS = quality.uiMs;
const HOVER_UPDATE_INTERVAL_MS = quality.hoverMs;
const LIVE_UPDATE_INTERVAL_MS = quality.liveMs;
const PLANET_SEGMENTS = quality.planetSegments;
const ATMO_SEGMENTS = quality.atmoSegments;
const MOON_SEGMENTS = quality.moonSegments;
const RING_SEGMENTS = quality.ringSegments;
const SUN_SEGMENTS = quality.sunSegments;

const maxDevicePixelRatio = Math.min(window.devicePixelRatio || 1, quality.pixelRatioCap);
const minPixelRatio = Math.min(maxDevicePixelRatio, quality.minPixelRatio);
let currentPixelRatio = maxDevicePixelRatio;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: "high-performance", logarithmicDepthBuffer: quality.logDepth });
renderer.setPixelRatio(currentPixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), quality.maxAnisotropy);
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin("anonymous");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020308);
const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.01, 52000000);
camera.position.set(0, 40, 170);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 2;
controls.maxDistance = 24000000;
controls.target.set(0, 0, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.18;

if (query.get("view") === "galaxy") { camera.position.set(0, 3200, 9400); controls.autoRotate = false; }
else if (query.get("view") === "universe") { camera.position.set(0, 2200000, 7800000); controls.autoRotate = false; }
else if (query.get("view") === "all") { camera.position.set(0, 6400000, 21000000); controls.autoRotate = false; }

const root = new THREE.Object3D();
root.rotation.x = THREE.Math.degToRad(3.8);
scene.add(root);

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(9, 9);
const pointerPx = new THREE.Vector2();
const pointerUpPos = new THREE.Vector2();
const clock = new THREE.Clock();
let pointerInside = false, hoveredPlanet = null, selectedPlanet = null, selectedAngleIndex = 0;
let controlsDragging = false, cameraTween = null, pointerDownPos = null;

// Exponential slider mapping: 0-100 → 0.01 to 365 sim-days/sec
// Gives fine control at slow speeds and big range at high speeds
const POSITION_MODE_SIM = "sim";
const POSITION_MODE_LIVE = "live";

function sliderToTimeWarp(v) {
  if (v <= 0) return 0.01;
  return 0.01 * Math.pow(36500, v / 100);
}
var timeWarpTarget = sliderToTimeWarp(Number(timeScaleInput.value));
var timeWarp = timeWarpTarget;
var positionMode = positionModeInput ? positionModeInput.value : POSITION_MODE_SIM;
const selectedCameraOffset = new THREE.Vector3();
const selectedCameraTarget = new THREE.Vector3();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const defaultCamPos = new THREE.Vector3(0, 40, 170);
const defaultTarget = new THREE.Vector3(0, 0, 0);
const viewAngles = [
  new THREE.Vector3(1.1, 0.35, 1.2), new THREE.Vector3(-1.18, 0.56, 0.9),
  new THREE.Vector3(0.26, 1.2, 0.46), new THREE.Vector3(-0.34, 0.2, -1.24),
];

const pickables = [], planets = [], orbitLines = [], allMoonRefs = [];
let earthPlanetRef = null;
let galaxyGroup = null, milkyWayBand = null, galacticCenterGlow = null;
let solarSystemMarker = null, solarSystemLabel = null;
let universeGroup = null, universeField = null, universeClusters = null;
let milkyWayUniverseMarker = null, milkyWayUniverseLabel = null, universeLabel = null;
let asteroidBeltMesh = null, kuiperBeltMesh = null;
const namedGalaxies = [];
const nebulaeMeshes = [];
const asteroidBeltFadeMaterials = [];
let planetNavItems = [];
let lastScalePct = -1;
let lastInfoLabel = "__init__";
let lastInfoVisible = false;
let lastActivePlanetName = "__init__";
let lastScaleDist = -1;
let uiElapsedMs = UI_UPDATE_INTERVAL_MS;
let hoverElapsedMs = HOVER_UPDATE_INTERVAL_MS;
let lastLiveUpdateMs = 0;
let frameStatsElapsedMs = 0;
let frameStatsCount = 0;
let dynamicResolutionElapsedMs = 0;
const adaptiveResolutionEnabled = query.get("adaptiveRes") !== "off";

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
  { name: "Mercury", radius: 0.8, orbitRadius: 13, orbitDays: 88, spinDays: 58.6, tilt: 0.03, color: 0xa4abae, roughness: 0.95, moons: [] },
  { name: "Venus", radius: 1.15, orbitRadius: 18, orbitDays: 225, spinDays: -243, tilt: 177.4, color: 0xd5b079, roughness: 0.82,
    atmo: { color: 0xe8c87a, opacity: 0.25, scale: 1.12 }, moons: [] },
  { name: "Earth", radius: 1.2, orbitRadius: 24, orbitDays: 365, spinDays: 1, tilt: 23.4, color: 0x4e86d8, roughness: 0.65,
    moons: [{ name: "Moon", rf: 0.28, of: 2.9, od: 27.32, color: 0xb8bfca, tilt: 5.1 }] },
  { name: "Mars", radius: 0.95, orbitRadius: 31, orbitDays: 687, spinDays: 1.03, tilt: 25.2, color: 0xb3623f, roughness: 0.9,
    moons: [
      { name: "Phobos", rf: 0.05, of: 1.8, od: 0.32, color: 0x8a7d6b },
      { name: "Deimos", rf: 0.035, of: 2.6, od: 1.26, color: 0x9a8d7b }
    ] },
  { name: "Jupiter", radius: 3.15, orbitRadius: 45, orbitDays: 4331, spinDays: 0.41, tilt: 3.1, color: 0xcfa070, roughness: 0.78,
    moons: [
      { name: "Io", rf: 0.09, of: 1.65, od: 1.77, color: 0xccaa33 },
      { name: "Europa", rf: 0.08, of: 2.0, od: 3.55, color: 0xc8bfa0 },
      { name: "Ganymede", rf: 0.13, of: 2.6, od: 7.15, color: 0x887766 },
      { name: "Callisto", rf: 0.12, of: 3.4, od: 16.69, color: 0x665544 }
    ] },
  { name: "Saturn", radius: 2.7, orbitRadius: 59, orbitDays: 10747, spinDays: 0.44, tilt: 26.7, color: 0xd6bf8e, roughness: 0.78,
    ring: { inner: 3.2, outer: 6.4 },
    moons: [
      { name: "Titan", rf: 0.15, of: 4.2, od: 15.95, color: 0xc4a050, atmo: 0xdd9944 },
      { name: "Rhea", rf: 0.06, of: 3.2, od: 4.52, color: 0xbbbbcc },
      { name: "Enceladus", rf: 0.04, of: 2.5, od: 1.37, color: 0xeeeeff },
      { name: "Dione", rf: 0.05, of: 2.8, od: 2.74, color: 0xaabbcc },
      { name: "Tethys", rf: 0.05, of: 2.65, od: 1.89, color: 0xccccdd },
      { name: "Mimas", rf: 0.03, of: 2.2, od: 0.94, color: 0xbbbbbb }
    ] },
  { name: "Uranus", radius: 1.92, orbitRadius: 73, orbitDays: 30589, spinDays: -0.72, tilt: 97.8, color: 0x8fb8ce, roughness: 0.77,
    ring: { inner: 2.4, outer: 2.9, opacity: 0.25, color: 0x667788 },
    moons: [
      { name: "Titania", rf: 0.08, of: 2.8, od: 8.71, color: 0x998888 },
      { name: "Oberon", rf: 0.08, of: 3.2, od: 13.46, color: 0x887777 },
      { name: "Ariel", rf: 0.06, of: 2.2, od: 2.52, color: 0xaaaaaa },
      { name: "Umbriel", rf: 0.06, of: 2.5, od: 4.14, color: 0x666677 },
      { name: "Miranda", rf: 0.04, of: 1.8, od: 1.41, color: 0xbbbbbb }
    ] },
  { name: "Neptune", radius: 1.8, orbitRadius: 87, orbitDays: 59800, spinDays: 0.67, tilt: 28.3, color: 0x4d76cc, roughness: 0.79,
    moons: [
      { name: "Triton", rf: 0.14, of: 2.6, od: -5.88, color: 0xaabbcc },
      { name: "Proteus", rf: 0.04, of: 1.9, od: 1.12, color: 0x888899 }
    ] },
];

/* ---- Procedural Textures ---- */
function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

var _particleTex = null;
function getParticleTexture() {
  if (_particleTex) return _particleTex;
  var c = makeCanvas(64, 64), ctx = c.getContext("2d");
  var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.5, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  _particleTex = new THREE.CanvasTexture(c);
  return _particleTex;
}

function createMercuryTexture() {
  const c = makeCanvas(512, 256), ctx = c.getContext("2d");
  ctx.fillStyle = "#8a8d92"; ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * 512, y = Math.random() * 256, r = Math.random() * 12 + 1;
    const b = 130 + Math.random() * 30;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${b|0},${b+2|0},${b+5|0})`; ctx.fill();
    if (r > 5) { ctx.strokeStyle = "rgba(160,163,170,0.4)"; ctx.lineWidth = 0.8; ctx.stroke(); }
  }
  for (let i = 0; i < 6; i++) {
    ctx.beginPath(); ctx.arc(Math.random() * 512, Math.random() * 256, Math.random() * 40 + 15, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(95,98,105,0.25)"; ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

function createVenusTexture() {
  const c = makeCanvas(512, 256), ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#d4a855"); g.addColorStop(0.3, "#c89d4a"); g.addColorStop(0.5, "#ddb560");
  g.addColorStop(0.7, "#c49845"); g.addColorStop(1, "#d4a855");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 3) {
    ctx.fillStyle = `rgba(220,190,120,${(0.06 + Math.random() * 0.08).toFixed(3)})`;
    ctx.fillRect(Math.sin(y * 0.04) * 20, y, 512, 2);
  }
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * 512, y = Math.random() * 256, r = Math.random() * 25 + 10;
    const gd = ctx.createRadialGradient(x, y, 0, x, y, r);
    gd.addColorStop(0, "rgba(230,200,140,0.15)"); gd.addColorStop(1, "rgba(200,170,100,0)");
    ctx.fillStyle = gd; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

function createMarsTexture() {
  const c = makeCanvas(512, 256), ctx = c.getContext("2d");
  ctx.fillStyle = "#b3623f"; ctx.fillRect(0, 0, 512, 256);
  const cols = ["#a85535", "#c46e48", "#8b4a30", "#d47a52", "#994422"];
  for (let i = 0; i < 400; i++) {
    ctx.beginPath(); ctx.arc(Math.random() * 512, Math.random() * 256, Math.random() * 18 + 2, 0, Math.PI * 2);
    ctx.fillStyle = cols[i % 5] + "50"; ctx.fill();
  }
  [[200,130,55,35],[380,100,40,30],[100,160,45,25]].forEach(function(d) {
    ctx.beginPath(); ctx.ellipse(d[0], d[1], d[2], d[3], 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(80,50,30,0.35)"; ctx.fill();
  });
  // Polar caps
  var pg = ctx.createRadialGradient(256, 0, 0, 256, 0, 70);
  pg.addColorStop(0, "rgba(240,235,225,0.85)"); pg.addColorStop(0.6, "rgba(220,215,200,0.3)"); pg.addColorStop(1, "rgba(180,160,140,0)");
  ctx.fillStyle = pg; ctx.fillRect(0, 0, 512, 70);
  pg = ctx.createRadialGradient(256, 256, 0, 256, 256, 55);
  pg.addColorStop(0, "rgba(240,235,225,0.8)"); pg.addColorStop(0.6, "rgba(220,215,200,0.3)"); pg.addColorStop(1, "rgba(180,160,140,0)");
  ctx.fillStyle = pg; ctx.fillRect(0, 190, 512, 66);
  // Olympus Mons
  ctx.beginPath(); ctx.arc(140, 88, 18, 0, Math.PI * 2); ctx.fillStyle = "rgba(150,85,50,0.35)"; ctx.fill();
  // Valles Marineris
  ctx.beginPath(); ctx.moveTo(180, 135); ctx.bezierCurveTo(230, 132, 300, 138, 360, 130);
  ctx.strokeStyle = "rgba(70,40,25,0.4)"; ctx.lineWidth = 2.5; ctx.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

function createJupiterTexture() {
  const c = makeCanvas(1024, 512), ctx = c.getContext("2d");
  ctx.fillStyle = "#c4976a"; ctx.fillRect(0, 0, 1024, 512);
  var bands = [[0,35,"#d4a878"],[35,25,"#8b6644"],[60,40,"#dbb888"],[100,30,"#a07050"],
    [130,50,"#e0c090"],[180,25,"#9a6848"],[205,45,"#d8b080"],[250,30,"#c09060"],
    [280,50,"#e8c898"],[330,30,"#a87858"],[360,45,"#d4a878"],[405,25,"#8b6644"],
    [430,40,"#dbb888"],[470,42,"#c49868"]];
  for (var bi = 0; bi < bands.length; bi++) {
    var b = bands[bi];
    ctx.fillStyle = b[2]; ctx.fillRect(0, b[0], 1024, b[1]);
    for (var x = 0; x < 1024; x += 2) {
      var w = Math.sin(x * 0.03) * 3 + Math.sin(x * 0.08) * 1.5;
      ctx.fillStyle = b[2] + "60"; ctx.fillRect(x, b[0] + b[1] + w - 2, 2, 4);
    }
  }
  // Great Red Spot
  var sx = 680, sy = 280;
  var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 48);
  sg.addColorStop(0, "#c84020"); sg.addColorStop(0.4, "#b83818");
  sg.addColorStop(0.7, "#d06040"); sg.addColorStop(1, "rgba(200,140,100,0)");
  ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(sx, sy, 50, 28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx, sy, 35, 18, 0.2, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(180,70,40,0.35)"; ctx.lineWidth = 2; ctx.stroke();
  for (var i = 0; i < 5; i++) {
    var fx = Math.random() * 1024, fy = Math.random() * 512, fr = Math.random() * 10 + 4;
    var fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
    fg.addColorStop(0, "rgba(200,160,120,0.25)"); fg.addColorStop(1, "rgba(180,140,100,0)");
    ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(fx, fy, fr * 1.5, fr, 0, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

function createSaturnTexture() {
  const c = makeCanvas(512, 256), ctx = c.getContext("2d");
  ctx.fillStyle = "#d6bf8e"; ctx.fillRect(0, 0, 512, 256);
  [[0,30,"#dcc89a"],[30,20,"#c4a878"],[50,35,"#e0d0a0"],[85,25,"#c8b080"],
   [110,40,"#d8c490"],[150,20,"#bca070"],[170,35,"#e0cc98"],[205,25,"#ccb484"],[230,26,"#d8c490"]
  ].forEach(function(b) { ctx.fillStyle = b[2]; ctx.fillRect(0, b[0], 512, b[1]); });
  // North polar hexagon
  ctx.beginPath();
  for (var i = 0; i < 6; i++) {
    var a = (i / 6) * Math.PI * 2 - Math.PI / 2, px = 256 + Math.cos(a) * 28, py = 14 + Math.sin(a) * 7;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.strokeStyle = "rgba(180,160,120,0.2)"; ctx.lineWidth = 1.5; ctx.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

function createSaturnRingTexture() {
  const c = makeCanvas(1024, 64), ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 1024, 64);
  [[0,60,0.08,"160,150,130"],[60,200,0.25,"170,155,130"],[210,450,0.85,"210,195,165"],
   [450,490,0.04,"80,75,65"],[490,680,0.6,"195,180,155"],[680,688,0.02,"50,45,40"],
   [688,750,0.55,"190,175,150"],[770,785,0.45,"200,190,170"],
   [810,880,0.06,"170,160,145"],[900,1024,0.03,"180,175,168"]
  ].forEach(function(r) {
    for (var x = r[0]; x < r[1]; x++) {
      var lt = (x - r[0]) / (r[1] - r[0]), n = Math.random() * 0.12;
      var a = r[2] * (0.7 + 0.3 * Math.sin(lt * Math.PI)) + n * r[2];
      ctx.fillStyle = "rgba(" + r[3] + "," + Math.min(1, a) + ")"; ctx.fillRect(x, 0, 1, 64);
    }
  });
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; return t;
}

function createUranusTexture() {
  const c = makeCanvas(256, 128), ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  [[0,"#6a9daf"],[0.2,"#7fb5c8"],[0.4,"#8fc4d2"],[0.5,"#9acad8"],
   [0.6,"#8fc4d2"],[0.8,"#7fb5c8"],[1,"#6a9daf"]].forEach(function(s) { g.addColorStop(s[0], s[1]); });
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
  for (var y = 0; y < 128; y += 3) {
    ctx.fillStyle = "rgba(160,200,220," + (Math.random() * 0.05).toFixed(3) + ")"; ctx.fillRect(0, y, 256, 2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

function createNeptuneTexture() {
  const c = makeCanvas(512, 256), ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  [[0,"#3058a8"],[0.2,"#3d68b8"],[0.4,"#4878cc"],[0.5,"#4d80d4"],
   [0.6,"#4878cc"],[0.8,"#3d68b8"],[1,"#3058a8"]].forEach(function(s) { g.addColorStop(s[0], s[1]); });
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  for (var y = 0; y < 256; y += 3) {
    ctx.fillStyle = "rgba(80,130,220," + (0.04 + Math.random() * 0.04).toFixed(3) + ")";
    ctx.fillRect(Math.sin(y * 0.05) * 12, y, 512, 2);
  }
  ctx.beginPath(); ctx.ellipse(300, 140, 32, 16, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(30,45,100,0.45)"; ctx.fill();
  ctx.beginPath(); ctx.ellipse(340, 125, 14, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(180,210,255,0.2)"; ctx.fill();
  ctx.fillStyle = "rgba(120,170,240,0.1)"; ctx.fillRect(0, 90, 512, 7); ctx.fillRect(0, 170, 512, 5);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

const textureMakers = { Mercury: createMercuryTexture, Venus: createVenusTexture, Mars: createMarsTexture,
  Jupiter: createJupiterTexture, Saturn: createSaturnTexture, Uranus: createUranusTexture, Neptune: createNeptuneTexture };

// Approximate heliocentric orbital elements (Paul Schlyter low-precision model).
// Days are measured from JD 2451543.5 (2000-01-00 00:00 UTC).
const ORBITAL_ELEMENTS = {
  Mercury: { N0: 48.3313, N1: 3.24587e-5, i0: 7.0047, i1: 5.0e-8, w0: 29.1241, w1: 1.01444e-5, a0: 0.387098, a1: 0, e0: 0.205635, e1: 5.59e-10, M0: 168.6562, M1: 4.0923344368 },
  Venus: { N0: 76.6799, N1: 2.4659e-5, i0: 3.3946, i1: 2.75e-8, w0: 54.891, w1: 1.38374e-5, a0: 0.72333, a1: 0, e0: 0.006773, e1: -1.302e-9, M0: 48.0052, M1: 1.6021302244 },
  Earth: { N0: 0, N1: 0, i0: 0, i1: 0, w0: 282.9404, w1: 4.70935e-5, a0: 1.0, a1: 0, e0: 0.016709, e1: -1.151e-9, M0: 356.047, M1: 0.9856002585 },
  Mars: { N0: 49.5574, N1: 2.11081e-5, i0: 1.8497, i1: -1.78e-8, w0: 286.5016, w1: 2.92961e-5, a0: 1.523688, a1: 0, e0: 0.093405, e1: 2.516e-9, M0: 18.6021, M1: 0.5240207766 },
  Jupiter: { N0: 100.4542, N1: 2.76854e-5, i0: 1.303, i1: -1.557e-7, w0: 273.8777, w1: 1.64505e-5, a0: 5.20256, a1: 0, e0: 0.048498, e1: 4.469e-9, M0: 19.895, M1: 0.0830853001 },
  Saturn: { N0: 113.6634, N1: 2.3898e-5, i0: 2.4886, i1: -1.081e-7, w0: 339.3939, w1: 2.97661e-5, a0: 9.55475, a1: 0, e0: 0.055546, e1: -9.499e-9, M0: 316.967, M1: 0.0334442282 },
  Uranus: { N0: 74.0005, N1: 1.3978e-5, i0: 0.7733, i1: 1.9e-8, w0: 96.6612, w1: 3.0565e-5, a0: 19.18171, a1: -1.55e-8, e0: 0.047318, e1: 7.45e-9, M0: 142.5905, M1: 0.011725806 },
  Neptune: { N0: 131.7806, N1: 3.0173e-5, i0: 1.77, i1: -2.55e-7, w0: 272.8461, w1: -6.027e-6, a0: 30.05826, a1: 3.313e-8, e0: 0.008606, e1: 2.15e-9, M0: 260.2471, M1: 0.005995147 },
  Pluto: { N0: 110.30347, N1: 0, i0: 17.14175, i1: 0, w0: 113.76329, w1: 0, a0: 39.48168677, a1: 0, e0: 0.24880766, e1: 0, M0: 14.53, M1: 0.0039757 },
};

/* ---- Init ---- */
setupLighting();
setupBackgroundStars();
setupMilkyWay();
setupUniverse();
setupSun();
setupPlanets();
setupAsteroidBelt();
setupKuiperBelt();
setupEvents();
setupUI();
updateUI();
loadEarthAssets();
animate();

function setupLighting() {
  scene.add(new THREE.AmbientLight(0x2a3652, 0.2));
  scene.add(new THREE.HemisphereLight(0x688fc0, 0x090f1e, 0.16));
  root.add(new THREE.PointLight(0xfff0c0, 4.5, 0, 2));
}

function setupBackgroundStars() {
  addStarLayer(12000 * Q | 0, 1200, 36000, 0xdde9ff, 0.9, 0.75);
  addStarLayer(6000 * Q | 0, 30000, 50000, 0xc8d8ff, 0.5, 0.35);
  var geo = new THREE.BufferGeometry(), n = 2500 * Q | 0;
  var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  var tints = [new THREE.Color(0xff8866), new THREE.Color(0xffcc88), new THREE.Color(0x88aaff), new THREE.Color(0xaaccff)];
  for (var i = 0; i < n; i++) {
    var r = 2000 + Math.random() * 42000, th = Math.random() * Math.PI * 2, ph = Math.acos(THREE.Math.randFloatSpread(2));
    pos[i*3] = r*Math.sin(ph)*Math.cos(th); pos[i*3+1] = r*Math.cos(ph); pos[i*3+2] = r*Math.sin(ph)*Math.sin(th);
    var c = tints[i % tints.length]; col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, map: getParticleTexture() })));
}

function addStarLayer(count, minR, maxR, color, size, opacity) {
  var geo = new THREE.BufferGeometry(), pos = new Float32Array(count * 3);
  for (var i = 0; i < count; i++) {
    var r = minR + Math.random() * (maxR - minR), th = Math.random() * Math.PI * 2, ph = Math.acos(THREE.Math.randFloatSpread(2));
    pos[i*3] = r*Math.sin(ph)*Math.cos(th); pos[i*3+1] = r*Math.cos(ph); pos[i*3+2] = r*Math.sin(ph)*Math.sin(th);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: color, size: size * 1.3, sizeAttenuation: true, transparent: true, opacity: opacity, depthWrite: false, map: getParticleTexture() })));
}

function setupSun() {
  var sun = new THREE.Mesh(new THREE.SphereGeometry(6.2, SUN_SEGMENTS, SUN_SEGMENTS), new THREE.MeshBasicMaterial({ color: 0xffbf5f }));
  root.add(sun);
  var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: createGlowTexture(0xfff0c8, 0xffc060, 0xff9620), color: 0xffdd98, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(30, 30, 1); sun.add(glow);
  var corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: createGlowTexture(0xffeedd, 0xffaa55, 0xff6600), color: 0xffccaa, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  corona.scale.set(60, 60, 1); sun.add(corona);
  var sunShellSegments = Math.max(24, (SUN_SEGMENTS * 0.66) | 0);
  sun.add(new THREE.Mesh(new THREE.SphereGeometry(6.35, sunShellSegments, sunShellSegments), new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false })));
}

function setupPlanets() {
  var orbitLineMat = new THREE.LineBasicMaterial({ color: 0x35537f, transparent: true, opacity: 0.4 });
  var moonOrbitLineMat = new THREE.LineBasicMaterial({ color: 0x5a6e8a, transparent: true, opacity: 0.25 });
  for (var di = 0; di < defs.length; di++) {
    var def = defs[di];
    var orbitLine = createOrbit(def.orbitRadius, orbitLineMat);
    root.add(orbitLine); orbitLines.push(orbitLine);
    var orbitPivot = new THREE.Object3D();
    orbitPivot.rotation.y = Math.random() * Math.PI * 2;
    root.add(orbitPivot);
    var anchor = new THREE.Object3D();
    anchor.position.x = def.orbitRadius;
    orbitPivot.add(anchor);

    var matOpts = { color: def.color, roughness: def.roughness, metalness: 0.03, emissive: new THREE.Color(0x101829), emissiveIntensity: 0.05 };
    if (textureMakers[def.name]) { matOpts.map = textureMakers[def.name](); matOpts.color = 0xffffff; }
    if (def.name === "Earth") {
      matOpts.roughness = 0.56; matOpts.metalness = 0.0;
      matOpts.emissive = new THREE.Color(0x1a2439); matOpts.emissiveIntensity = 0.12;
      delete matOpts.map; matOpts.color = def.color;
    }
    var material = new THREE.MeshStandardMaterial(matOpts);
    var planetMesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius, PLANET_SEGMENTS, PLANET_SEGMENTS), material);
    planetMesh.rotation.z = THREE.Math.degToRad(def.tilt);
    anchor.add(planetMesh);
    pickables.push(planetMesh);

    var atmosphereMesh = null, cloudMesh = null;
    if (def.atmo) {
      atmosphereMesh = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius * def.atmo.scale, ATMO_SEGMENTS, ATMO_SEGMENTS),
        new THREE.MeshBasicMaterial({ color: def.atmo.color, transparent: true, opacity: def.atmo.opacity, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false })
      );
      planetMesh.add(atmosphereMesh);
    }
    if (def.name === "Earth") {
      cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius * 1.028, ATMO_SEGMENTS, ATMO_SEGMENTS),
        new THREE.MeshPhongMaterial({ color: 0xd9ecff, transparent: true, opacity: 0.13, depthWrite: false, emissive: new THREE.Color(0x5f87c5), emissiveIntensity: 0.12 }));
      planetMesh.add(cloudMesh);
      atmosphereMesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius * 1.08, ATMO_SEGMENTS, ATMO_SEGMENTS),
        new THREE.MeshBasicMaterial({ color: 0x7ab3ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false }));
      planetMesh.add(atmosphereMesh);
    }

    if (def.ring) {
      var ringMat;
      var ringGeo = new THREE.RingGeometry(def.ring.inner, def.ring.outer, RING_SEGMENTS, 8);
      // Fix UVs: remap from 2D projection to radial (U = inner→outer, V = 0.5)
      var ringUvs = ringGeo.attributes.uv;
      var ringPositions = ringGeo.attributes.position;
      for (var ri = 0; ri < ringUvs.count; ri++) {
        var rx = ringPositions.getX(ri), ry = ringPositions.getY(ri);
        var rr = Math.sqrt(rx * rx + ry * ry);
        ringUvs.setXY(ri, (rr - def.ring.inner) / (def.ring.outer - def.ring.inner), 0.5);
      }
      if (def.name === "Saturn") {
        var ringTex = createSaturnRingTexture();
        ringMat = new THREE.MeshBasicMaterial({ map: ringTex, side: THREE.DoubleSide, transparent: true, depthWrite: false });
      } else {
        ringMat = new THREE.MeshStandardMaterial({ color: def.ring.color || 0x667788, side: THREE.DoubleSide, transparent: true, opacity: def.ring.opacity || 0.3, roughness: 0.9, metalness: 0.02 });
      }
      var ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2; ring.rotation.y = THREE.Math.degToRad(12);
      planetMesh.add(ring);
    }

    var planet = { def: def, orbitPivot: orbitPivot, anchor: anchor, mesh: planetMesh, clouds: cloudMesh, atmosphere: atmosphereMesh, material: material, highlight: 0, spin: Math.random() * Math.PI * 2 };
    planetMesh.userData.planet = planet;
    planets.push(planet);
    if (def.name === "Earth") earthPlanetRef = planet;

    // Moons
    for (var mi = 0; mi < def.moons.length; mi++) {
      var md = def.moons[mi];
      var moonOrbitR = def.radius * md.of;
      var moonOrbit = createOrbit(moonOrbitR, moonOrbitLineMat);
      anchor.add(moonOrbit); orbitLines.push(moonOrbit);
      var moonPivot = new THREE.Object3D();
      if (md.tilt) moonPivot.rotation.z = THREE.Math.degToRad(md.tilt);
      anchor.add(moonPivot);
      var moonAnchor = new THREE.Object3D();
      moonAnchor.position.x = moonOrbitR;
      moonPivot.add(moonAnchor);
      var moonMat = new THREE.MeshStandardMaterial({ color: md.color, roughness: 0.9, metalness: 0.01, emissive: new THREE.Color(0x0f1218), emissiveIntensity: 0.04 });
      var moonMesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius * md.rf, MOON_SEGMENTS, MOON_SEGMENTS), moonMat);
      moonAnchor.add(moonMesh);
      if (md.atmo) {
        moonMesh.add(new THREE.Mesh(new THREE.SphereGeometry(def.radius * md.rf * 1.15, Math.max(12, (MOON_SEGMENTS * 0.75) | 0), Math.max(12, (MOON_SEGMENTS * 0.75) | 0)),
          new THREE.MeshBasicMaterial({ color: md.atmo, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false })));
      }
      allMoonRefs.push({ orbitPivot: moonPivot, mesh: moonMesh, material: moonMat, orbitDays: Math.abs(md.od), spinDays: Math.abs(md.od), spin: Math.random() * Math.PI * 2, retrograde: md.od < 0, name: md.name, parentPlanet: def.name });
    }
  }
}

function setupAsteroidBelt() {
  var beltGroup = new THREE.Group();
  root.add(beltGroup);

  // Radial distribution: main belt 36-42, with density peaks and Kirkwood gaps
  function beltRadius() {
    var r = 36 + Math.random() * 6;
    // Kirkwood gaps at ~37.5 and ~40.5 (simplified)
    if (Math.abs(r - 37.5) < 0.25 || Math.abs(r - 40.5) < 0.2) r += (Math.random() - 0.5) * 1.2;
    // Density peak around 38.5-39.5
    if (Math.random() < 0.3) r = 38.2 + Math.random() * 1.6;
    return r;
  }

  // Layer 1: Dense fine dust (many tiny particles)
  var dustCount = 8000 * Q | 0;
  var dustGeo = new THREE.BufferGeometry();
  var dustPos = new Float32Array(dustCount * 3), dustCol = new Float32Array(dustCount * 3);
  for (var i = 0; i < dustCount; i++) {
    var r = beltRadius(), a = Math.random() * Math.PI * 2;
    var ySpread = THREE.Math.randFloatSpread(1.8) * (1 - 0.4 * Math.abs(r - 39) / 3);
    dustPos[i*3] = Math.cos(a) * r; dustPos[i*3+1] = ySpread; dustPos[i*3+2] = Math.sin(a) * r;
    var g = 0.38 + Math.random() * 0.18;
    dustCol[i*3] = g * 1.05; dustCol[i*3+1] = g * 0.98; dustCol[i*3+2] = g * 0.88;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute("color", new THREE.BufferAttribute(dustCol, 3));
  var pTex = getParticleTexture();
  beltGroup.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.12, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, map: pTex
  })));

  // Layer 2: Medium rocks
  var medCount = 4000 * Q | 0;
  var medGeo = new THREE.BufferGeometry();
  var medPos = new Float32Array(medCount * 3), medCol = new Float32Array(medCount * 3);
  var rockTints = [[0.55,0.48,0.40],[0.50,0.50,0.48],[0.62,0.55,0.45],[0.45,0.42,0.38],[0.58,0.52,0.44]];
  for (var i = 0; i < medCount; i++) {
    var r = beltRadius(), a = Math.random() * Math.PI * 2;
    var ySpread = THREE.Math.randFloatSpread(2.2) * (1 - 0.3 * Math.abs(r - 39) / 3);
    medPos[i*3] = Math.cos(a) * r; medPos[i*3+1] = ySpread; medPos[i*3+2] = Math.sin(a) * r;
    var t = rockTints[i % rockTints.length], v = 0.85 + Math.random() * 0.3;
    medCol[i*3] = t[0] * v; medCol[i*3+1] = t[1] * v; medCol[i*3+2] = t[2] * v;
  }
  medGeo.setAttribute("position", new THREE.BufferAttribute(medPos, 3));
  medGeo.setAttribute("color", new THREE.BufferAttribute(medCol, 3));
  beltGroup.add(new THREE.Points(medGeo, new THREE.PointsMaterial({
    size: 0.3, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, map: pTex
  })));

  // Layer 3: Larger rocks (sparse, bigger)
  var lgCount = 1200 * Q | 0;
  var lgGeo = new THREE.BufferGeometry();
  var lgPos = new Float32Array(lgCount * 3), lgCol = new Float32Array(lgCount * 3);
  for (var i = 0; i < lgCount; i++) {
    var r = beltRadius(), a = Math.random() * Math.PI * 2;
    lgPos[i*3] = Math.cos(a) * r; lgPos[i*3+1] = THREE.Math.randFloatSpread(2.8); lgPos[i*3+2] = Math.sin(a) * r;
    var g = 0.48 + Math.random() * 0.22;
    lgCol[i*3] = g * 1.1; lgCol[i*3+1] = g; lgCol[i*3+2] = g * 0.85;
  }
  lgGeo.setAttribute("position", new THREE.BufferAttribute(lgPos, 3));
  lgGeo.setAttribute("color", new THREE.BufferAttribute(lgCol, 3));
  beltGroup.add(new THREE.Points(lgGeo, new THREE.PointsMaterial({
    size: 0.6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.65, depthWrite: false, map: pTex
  })));

  // Layer 4: Subtle dust glow band (additive, gives the belt a soft haze)
  var glowCount = 3000 * Q | 0;
  var glowGeo = new THREE.BufferGeometry();
  var glowPos = new Float32Array(glowCount * 3);
  for (var i = 0; i < glowCount; i++) {
    var r = 36.5 + Math.random() * 5, a = Math.random() * Math.PI * 2;
    glowPos[i*3] = Math.cos(a) * r; glowPos[i*3+1] = THREE.Math.randFloatSpread(1.0); glowPos[i*3+2] = Math.sin(a) * r;
  }
  glowGeo.setAttribute("position", new THREE.BufferAttribute(glowPos, 3));
  beltGroup.add(new THREE.Points(glowGeo, new THREE.PointsMaterial({
    color: 0xc4a882, size: 1.8, sizeAttenuation: true, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, map: pTex
  })));

  // Named asteroids as small meshes: Ceres, Vesta, Pallas, Hygiea
  var namedAsteroids = [
    { name: "Ceres", r: 0.28, orbit: 39.2, color: 0x9a9590, roughness: 0.92 },
    { name: "Vesta", r: 0.16, orbit: 37.8, color: 0xb8a888, roughness: 0.88 },
    { name: "Pallas", r: 0.15, orbit: 39.8, color: 0x888890, roughness: 0.9 },
    { name: "Hygiea", r: 0.12, orbit: 40.6, color: 0x706860, roughness: 0.94 },
  ];
  for (var ai = 0; ai < namedAsteroids.length; ai++) {
    var ad = namedAsteroids[ai];
    var aPivot = new THREE.Object3D();
    aPivot.rotation.y = Math.random() * Math.PI * 2;
    beltGroup.add(aPivot);
    var aAnchor = new THREE.Object3D();
    aAnchor.position.set(ad.orbit, THREE.Math.randFloatSpread(0.6), 0);
    aPivot.add(aAnchor);
    var aMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(ad.r, 3),
      new THREE.MeshStandardMaterial({ color: ad.color, roughness: ad.roughness, metalness: 0.04 })
    );
    aMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    aAnchor.add(aMesh);
    // Slow orbit (4-6 year period range, scaled)
    var orbDays = 1600 + ai * 400;
    planets.push({ def: { name: ad.name, orbitDays: orbDays, spinDays: 0.38, radius: ad.r }, orbitPivot: aPivot, anchor: aAnchor, mesh: aMesh, material: aMesh.material, highlight: 0, spin: Math.random() * 6 });
    pickables.push(aMesh);
    aMesh.userData.planet = planets[planets.length - 1];
  }

  asteroidBeltMesh = beltGroup;
  asteroidBeltFadeMaterials.length = 0;
  asteroidBeltMesh.traverse(function(child) {
    if ((child.isMesh || child.isPoints) && child.material && child.material.transparent) {
      child.material._baseOp = child.material.opacity;
      asteroidBeltFadeMaterials.push(child.material);
    }
  });
}

function setupKuiperBelt() {
  var kCount = 3000 * Q | 0;
  var geo = new THREE.BufferGeometry(), count = kCount, pos = new Float32Array(count * 3);
  for (var i = 0; i < count; i++) {
    var r = 95 + Math.random() * 40, angle = Math.random() * Math.PI * 2;
    pos[i*3] = Math.cos(angle) * r; pos[i*3+1] = THREE.Math.randFloatSpread(3); pos[i*3+2] = Math.sin(angle) * r;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  kuiperBeltMesh = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x889aaa, size: 0.25, sizeAttenuation: true, transparent: true, opacity: 0.4, depthWrite: false, map: getParticleTexture() }));
  root.add(kuiperBeltMesh);

  // Pluto
  var plutoOrbit = createOrbit(105, new THREE.LineBasicMaterial({ color: 0x556677, transparent: true, opacity: 0.2 }));
  root.add(plutoOrbit); orbitLines.push(plutoOrbit);
  var plutoPivot = new THREE.Object3D(); plutoPivot.rotation.y = Math.random() * Math.PI * 2; root.add(plutoPivot);
  var plutoAnchor = new THREE.Object3D(); plutoAnchor.position.x = 105; plutoPivot.add(plutoAnchor);
  var plutoMesh = new THREE.Mesh(new THREE.SphereGeometry(0.45, MOON_SEGMENTS, MOON_SEGMENTS), new THREE.MeshStandardMaterial({ color: 0xccbbaa, roughness: 0.92 }));
  plutoAnchor.add(plutoMesh);
  // Charon
  var charonPivot = new THREE.Object3D(); plutoAnchor.add(charonPivot);
  var charonAnchor = new THREE.Object3D(); charonAnchor.position.x = 0.9; charonPivot.add(charonAnchor);
  var charonSegments = Math.max(12, (MOON_SEGMENTS * 0.75) | 0);
  var charonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, charonSegments, charonSegments), new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.9 }));
  charonAnchor.add(charonMesh);
  allMoonRefs.push({ orbitPivot: charonPivot, mesh: charonMesh, material: charonMesh.material, orbitDays: 6.39, spinDays: 6.39, spin: 0, retrograde: false, name: "Charon" });
  var plutoObj = { def: { name: "Pluto", orbitDays: 90560, spinDays: -6.39, radius: 0.45 }, orbitPivot: plutoPivot, anchor: plutoAnchor, mesh: plutoMesh, material: plutoMesh.material, highlight: 0, spin: 0 };
  planets.push(plutoObj); pickables.push(plutoMesh); plutoMesh.userData.planet = plutoObj;
}

function setupMilkyWay() {
  galaxyGroup = new THREE.Group();
  galaxyGroup.rotation.set(THREE.Math.degToRad(26), THREE.Math.degToRad(-14), THREE.Math.degToRad(8));
  scene.add(galaxyGroup);

  var armCount = 56000 * Q | 0, armPos = new Float32Array(armCount * 3), armCol = new Float32Array(armCount * 3);
  var warm = new THREE.Color(0xffe6bc), cool = new THREE.Color(0x90b9ff);
  for (var i = 0; i < armCount; i++) {
    var armIndex = i % 4, basePhase = armIndex * (Math.PI / 2);
    var radius = 240 + Math.pow(Math.random(), 0.68) * GALAXY_RADIUS;
    var angle = basePhase + radius * 0.00095 + THREE.Math.randFloatSpread(0.32);
    var thickness = THREE.Math.randFloatSpread(100) * (0.28 + radius / GALAXY_RADIUS);
    armPos[i*3] = Math.cos(angle) * radius; armPos[i*3+1] = thickness; armPos[i*3+2] = Math.sin(angle) * radius;
    var mix = Math.min(1, radius / GALAXY_RADIUS) * (0.4 + Math.random() * 0.6);
    armCol[i*3] = warm.r + (cool.r - warm.r) * mix;
    armCol[i*3+1] = warm.g + (cool.g - warm.g) * mix;
    armCol[i*3+2] = warm.b + (cool.b - warm.b) * mix;
  }
  var armGeo = new THREE.BufferGeometry();
  armGeo.setAttribute("position", new THREE.BufferAttribute(armPos, 3));
  armGeo.setAttribute("color", new THREE.BufferAttribute(armCol, 3));
  milkyWayBand = new THREE.Points(armGeo, new THREE.PointsMaterial({ size: 6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, map: getParticleTexture() }));
  galaxyGroup.add(milkyWayBand);

  // Galactic center bar
  var barGeo = new THREE.BufferGeometry(), barCount = 6000 * Q | 0;
  var barPos = new Float32Array(barCount * 3), barCol = new Float32Array(barCount * 3);
  for (var i = 0; i < barCount; i++) {
    var t = (Math.random() - 0.5) * 2;
    barPos[i*3] = t * 3200 + THREE.Math.randFloatSpread(270);
    barPos[i*3+1] = THREE.Math.randFloatSpread(60);
    barPos[i*3+2] = THREE.Math.randFloatSpread(900) * (1 - Math.abs(t) * 0.5);
    var bright = 0.7 + Math.random() * 0.3;
    barCol[i*3] = bright; barCol[i*3+1] = 0.9 * bright; barCol[i*3+2] = 0.7 * bright;
  }
  barGeo.setAttribute("position", new THREE.BufferAttribute(barPos, 3));
  barGeo.setAttribute("color", new THREE.BufferAttribute(barCol, 3));
  var galacticBar = new THREE.Points(barGeo, new THREE.PointsMaterial({ size: 7, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, map: getParticleTexture() }));
  galacticBar.rotation.y = THREE.Math.degToRad(30);
  galaxyGroup.add(galacticBar);

  galacticCenterGlow = new THREE.Mesh(new THREE.SphereGeometry(850, 52, 52),
    new THREE.MeshBasicMaterial({ color: 0xd2e1ff, transparent: true, opacity: 0.04, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  galaxyGroup.add(galacticCenterGlow);

  // Sagittarius A*
  galaxyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(60, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffeecc, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false })));

  // Nebulae
  var nebData = [
    { pos: [5500, 30, -3200], r: 350, color: 0xff6688, name: "Orion Nebula" },
    { pos: [-4200, 50, 6800], r: 280, color: 0x66aaff, name: "Eagle Nebula" },
    { pos: [7800, -20, 4500], r: 320, color: 0xff88aa, name: "Carina Nebula" },
    { pos: [-2800, 40, -8200], r: 250, color: 0x88ffaa, name: "Ring Nebula" },
    { pos: [9200, 15, -1200], r: 200, color: 0xaa88ff, name: "Helix Nebula" },
    { pos: [-6500, -30, -4800], r: 300, color: 0xff9966, name: "Crab Nebula" },
  ];
  for (var ni = 0; ni < nebData.length; ni++) {
    var nd = nebData[ni];
    var nebMesh = new THREE.Mesh(new THREE.SphereGeometry(nd.r, 24, 24),
      new THREE.MeshBasicMaterial({ color: nd.color, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    nebMesh.position.set(nd.pos[0], nd.pos[1], nd.pos[2]);
    galaxyGroup.add(nebMesh); nebulaeMeshes.push(nebMesh);
    var label = makeTextSprite(nd.name);
    label.position.set(nd.pos[0], nd.pos[1] + nd.r + 120, nd.pos[2]);
    label.scale.set(1200, 190, 1); label.material.opacity = 0;
    galaxyGroup.add(label); nebulaeMeshes.push(label);
  }

  // Solar system position
  var solarAngle = THREE.Math.degToRad(224);
  var solarPosition = new THREE.Vector3(Math.cos(solarAngle) * SOLAR_GALACTIC_RADIUS, 14, Math.sin(solarAngle) * SOLAR_GALACTIC_RADIUS);
  galaxyGroup.position.copy(solarPosition).multiplyScalar(-1);

  solarSystemMarker = new THREE.Mesh(new THREE.SphereGeometry(95, 18, 18),
    new THREE.MeshBasicMaterial({ color: 0x9ec7ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
  solarSystemMarker.position.copy(solarPosition); galaxyGroup.add(solarSystemMarker);

  solarSystemLabel = makeTextSprite("Solar System (Orion Arm)");
  solarSystemLabel.position.copy(solarPosition.clone().add(new THREE.Vector3(0, 340, 0)));
  solarSystemLabel.material.opacity = 0; galaxyGroup.add(solarSystemLabel);

  // Tether line
  galaxyGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), solarPosition]),
    new THREE.LineBasicMaterial({ color: 0x6c89b8, transparent: true, opacity: 0.04 })));

  // Spiral arm labels
  var armLabels = [
    { text: "Perseus Arm", pos: [8000, 200, -4000] },
    { text: "Sagittarius Arm", pos: [-3000, 200, 7000] },
    { text: "Scutum-Centaurus Arm", pos: [-7000, 200, -5000] },
    { text: "Norma Arm", pos: [4000, 200, 8000] },
  ];
  for (var ai = 0; ai < armLabels.length; ai++) {
    var al = armLabels[ai];
    var alabel = makeTextSprite(al.text);
    alabel.position.set(al.pos[0], al.pos[1], al.pos[2]);
    alabel.scale.set(2400, 380, 1); alabel.material.opacity = 0;
    galaxyGroup.add(alabel); nebulaeMeshes.push(alabel);
  }
}

function setupUniverse() {
  universeGroup = new THREE.Group(); scene.add(universeGroup);
  var fieldCount = 160000 * Q | 0, fieldPos = new Float32Array(fieldCount * 3), fieldCol = new Float32Array(fieldCount * 3);
  var violet = new THREE.Color(0xb7bcff), amber = new THREE.Color(0xffd2a8), cyan = new THREE.Color(0xa3d7ff);
  for (var i = 0; i < fieldCount; i++) {
    var r = 220000 + Math.pow(Math.random(), 0.56) * UNIVERSE_RADIUS;
    var th = Math.random() * Math.PI * 2, ph = Math.acos(THREE.Math.randFloatSpread(2));
    fieldPos[i*3] = r*Math.sin(ph)*Math.cos(th); fieldPos[i*3+1] = r*Math.cos(ph); fieldPos[i*3+2] = r*Math.sin(ph)*Math.sin(th);
    var m = Math.random(), mix = Math.random();
    if (m < 0.33) {
      fieldCol[i*3] = violet.r + (cyan.r - violet.r) * mix;
      fieldCol[i*3+1] = violet.g + (cyan.g - violet.g) * mix;
      fieldCol[i*3+2] = violet.b + (cyan.b - violet.b) * mix;
    } else {
      fieldCol[i*3] = amber.r + (violet.r - amber.r) * mix;
      fieldCol[i*3+1] = amber.g + (violet.g - amber.g) * mix;
      fieldCol[i*3+2] = amber.b + (violet.b - amber.b) * mix;
    }
  }
  var fieldGeo = new THREE.BufferGeometry();
  fieldGeo.setAttribute("position", new THREE.BufferAttribute(fieldPos, 3));
  fieldGeo.setAttribute("color", new THREE.BufferAttribute(fieldCol, 3));
  universeField = new THREE.Points(fieldGeo, new THREE.PointsMaterial({ size: 820, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: getParticleTexture() }));
  universeGroup.add(universeField);

  // Cosmic web filaments
  var webGeo = new THREE.BufferGeometry(), webCount = 20000 * Q | 0, webPos = new Float32Array(webCount * 3);
  var filaments = [];
  for (var f = 0; f < 80; f++) {
    var th1 = Math.random() * Math.PI * 2, ph1 = Math.acos(THREE.Math.randFloatSpread(2));
    var r1 = 500000 + Math.random() * UNIVERSE_RADIUS * 0.7;
    var s = new THREE.Vector3(r1*Math.sin(ph1)*Math.cos(th1), r1*Math.cos(ph1), r1*Math.sin(ph1)*Math.sin(th1));
    var th2 = Math.random() * Math.PI * 2, ph2 = Math.acos(THREE.Math.randFloatSpread(2));
    var r2 = 500000 + Math.random() * UNIVERSE_RADIUS * 0.7;
    var e = new THREE.Vector3(r2*Math.sin(ph2)*Math.cos(th2), r2*Math.cos(ph2), r2*Math.sin(ph2)*Math.sin(th2));
    filaments.push({ start: s, end: e });
  }
  for (var i = 0; i < webCount; i++) {
    var fil = filaments[i % filaments.length], t = Math.random(), spread = 80000;
    webPos[i*3] = fil.start.x + (fil.end.x - fil.start.x) * t + THREE.Math.randFloatSpread(spread);
    webPos[i*3+1] = fil.start.y + (fil.end.y - fil.start.y) * t + THREE.Math.randFloatSpread(spread);
    webPos[i*3+2] = fil.start.z + (fil.end.z - fil.start.z) * t + THREE.Math.randFloatSpread(spread);
  }
  webGeo.setAttribute("position", new THREE.BufferAttribute(webPos, 3));
  universeClusters = new THREE.Points(webGeo, new THREE.PointsMaterial({ color: 0xd8d0ff, size: 3000, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: getParticleTexture() }));
  universeGroup.add(universeClusters);

  // Named galaxies
  var galaxyDefs = [
    { name: "Andromeda (M31)", dist: 420000, dx: 0.8, dy: 0.15, dz: 1.2, size: 32000, color: 0xc8b8ff, particles: 8000, tilt: 0.6 },
    { name: "Triangulum (M33)", dist: 520000, dx: -0.4, dy: 0.3, dz: 1.5, size: 14000, color: 0xaabbff, particles: 3000, tilt: 1.1 },
    { name: "Large Magellanic Cloud", dist: 180000, dx: 1.6, dy: -0.8, dz: 0.4, size: 10000, color: 0xccddff, particles: 4000, tilt: 0.3, irregular: true },
    { name: "Small Magellanic Cloud", dist: 220000, dx: 1.5, dy: -0.7, dz: 0.7, size: 5000, color: 0xbbccee, particles: 2000, tilt: 0.5, irregular: true },
    { name: "Centaurus A", dist: 900000, dx: -1.2, dy: 0.4, dz: -0.6, size: 18000, color: 0xffddbb, particles: 3000, tilt: 0.9 },
    { name: "Sombrero Galaxy (M104)", dist: 1100000, dx: 0.3, dy: 0.8, dz: -1.1, size: 12000, color: 0xffe8cc, particles: 2500, tilt: 1.4 },
    { name: "Whirlpool Galaxy (M51)", dist: 1400000, dx: -0.9, dy: -0.3, dz: 1.0, size: 10000, color: 0xbbccff, particles: 2500, tilt: 0.2 },
    { name: "Pinwheel Galaxy (M101)", dist: 1600000, dx: 1.1, dy: 0.6, dz: -0.8, size: 14000, color: 0xaabbee, particles: 2000, tilt: 0.8 },
  ];
  for (var gi = 0; gi < galaxyDefs.length; gi++) {
    var gd = galaxyDefs[gi];
    var dir = new THREE.Vector3(gd.dx, gd.dy, gd.dz).normalize();
    var center = dir.multiplyScalar(gd.dist);
    var group = new THREE.Group();
    group.position.copy(center);
    group.rotation.set(gd.tilt, Math.random() * Math.PI * 2, Math.random() * 0.5);

    var gGeo = new THREE.BufferGeometry();
    var gPCount = gd.particles * Q | 0;
    var gPos = new Float32Array(gPCount * 3), gCol = new Float32Array(gPCount * 3);
    var baseCol = new THREE.Color(gd.color);
    for (var pi = 0; pi < gPCount; pi++) {
      var x, y, z;
      if (gd.irregular) {
        var gr = Math.random() * gd.size * 0.5, ga = Math.random() * Math.PI * 2;
        x = Math.cos(ga) * gr + THREE.Math.randFloatSpread(gd.size * 0.2);
        z = Math.sin(ga) * gr + THREE.Math.randFloatSpread(gd.size * 0.2);
        y = THREE.Math.randFloatSpread(gd.size * 0.15);
      } else {
        var arm = pi % 2, gr = Math.pow(Math.random(), 0.6) * gd.size * 0.5;
        var spiral = gr * 0.0008 + arm * Math.PI, jitter = THREE.Math.randFloatSpread(0.4);
        x = Math.cos(spiral + jitter) * gr; z = Math.sin(spiral + jitter) * gr;
        y = THREE.Math.randFloatSpread(gd.size * 0.04);
      }
      gPos[pi*3] = x; gPos[pi*3+1] = y; gPos[pi*3+2] = z;
      var bright = 0.6 + Math.random() * 0.4;
      gCol[pi*3] = baseCol.r * bright; gCol[pi*3+1] = baseCol.g * bright; gCol[pi*3+2] = baseCol.b * bright;
    }
    gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3));
    gGeo.setAttribute("color", new THREE.BufferAttribute(gCol, 3));
    var pts = new THREE.Points(gGeo, new THREE.PointsMaterial({ size: gd.size * 0.016, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: getParticleTexture() }));
    group.add(pts);
    var gGlow = new THREE.Mesh(new THREE.SphereGeometry(gd.size * 0.12, 16, 16),
      new THREE.MeshBasicMaterial({ color: gd.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(gGlow);
    var gLabel = makeTextSprite(gd.name);
    gLabel.position.set(0, gd.size * 0.4, 0);
    gLabel.scale.set(gd.size * 1.5, gd.size * 0.22, 1);
    gLabel.material.opacity = 0;
    group.add(gLabel);
    universeGroup.add(group);
    namedGalaxies.push({ group: group, points: pts, glow: gGlow, label: gLabel });
  }

  milkyWayUniverseMarker = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x8eb7ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
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

function loadEarthAssets() {
  Promise.all([
    loadTexture(EARTH_TEXTURES.day, true), loadTexture(EARTH_TEXTURES.normal, false),
    loadTexture(EARTH_TEXTURES.specular, false), loadTexture(EARTH_TEXTURES.lights, true),
    loadTexture(EARTH_TEXTURES.clouds, true), loadTexture(EARTH_TEXTURES.moon, true),
  ]).then(function(textures) {
    var day = textures[0], normal = textures[1], specular = textures[2], lights = textures[3], clouds = textures[4], moonTex = textures[5];
    if (!earthPlanetRef) return;
    var em = earthPlanetRef.material;
    if (day) { em.map = day; em.color.setHex(0xffffff); }
    if (normal) { em.normalMap = normal; em.normalScale = new THREE.Vector2(0.8, 0.8); }
    if (specular) { em.roughnessMap = specular; em.roughness = 0.53; }
    if (lights) { em.emissiveMap = lights; em.emissive = new THREE.Color(0x9fc3ff); em.emissiveIntensity = 0.32; }
    em.needsUpdate = true;
    if (earthPlanetRef.clouds && clouds) {
      var cm = earthPlanetRef.clouds.material; cm.map = clouds; cm.alphaMap = clouds; cm.opacity = 0.52; cm.needsUpdate = true;
    }
    if (moonTex) {
      for (var i = 0; i < allMoonRefs.length; i++) {
        if (allMoonRefs[i].name === "Moon" && allMoonRefs[i].parentPlanet === "Earth") {
          allMoonRefs[i].material.map = moonTex; allMoonRefs[i].material.color.setHex(0xffffff); allMoonRefs[i].material.needsUpdate = true;
        }
      }
    }
  });
}

function loadTexture(url, isColor) {
  return new Promise(function(resolve) {
    textureLoader.load(url, function(tex) {
      tex.anisotropy = maxAnisotropy;
      tex.encoding = isColor ? THREE.sRGBEncoding : THREE.LinearEncoding;
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      resolve(tex);
    }, undefined, function() { resolve(null); });
  });
}

function createOrbit(radius, material) {
  var pts = [];
  for (var i = 0; i <= 200; i++) { var a = (i / 200) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
  var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material);
  line.userData.baseOpacity = material.opacity !== undefined ? material.opacity : 1;
  return line;
}

function createGlowTexture(inner, mid, outer) {
  var c = makeCanvas(256, 256), ctx = c.getContext("2d");
  var ci = new THREE.Color(inner || 0xfff0c8), cm = new THREE.Color(mid || 0xffc060), co = new THREE.Color(outer || 0xff9620);
  var g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(" + (ci.r*255|0) + "," + (ci.g*255|0) + "," + (ci.b*255|0) + ",1)");
  g.addColorStop(0.35, "rgba(" + (cm.r*255|0) + "," + (cm.g*255|0) + "," + (cm.b*255|0) + ",0.72)");
  g.addColorStop(1, "rgba(" + (co.r*255|0) + "," + (co.g*255|0) + "," + (co.b*255|0) + ",0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function makeTextSprite(text) {
  var c = makeCanvas(1024, 160), ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 1024, 160);
  ctx.font = "700 56px Space Grotesk, Arial, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(196,220,255,0.95)"; ctx.fillText(text, 512, 80);
  var tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2100, 330, 1);
  return sprite;
}

function degToRad(d) { return d * Math.PI / 180; }
function normalizeDeg(d) {
  var n = d % 360;
  return n < 0 ? n + 360 : n;
}
function julianDayFromUnixMs(ms) {
  return ms / 86400000 + 2440587.5;
}
function solveEccentricAnomaly(M, e) {
  var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (var i = 0; i < 7; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}
function getHeliocentricCoordsAU(name, d) {
  var el = ORBITAL_ELEMENTS[name];
  if (!el) return null;

  var N = degToRad(normalizeDeg(el.N0 + el.N1 * d));
  var i = degToRad(el.i0 + el.i1 * d);
  var w = degToRad(normalizeDeg(el.w0 + el.w1 * d));
  var a = el.a0 + el.a1 * d;
  var e = el.e0 + el.e1 * d;
  var M = degToRad(normalizeDeg(el.M0 + el.M1 * d));
  var E = solveEccentricAnomaly(M, e);

  var xv = a * (Math.cos(E) - e);
  var yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  var v = Math.atan2(yv, xv);
  var r = Math.sqrt(xv * xv + yv * yv);
  var vw = v + w;

  var xh = r * (Math.cos(N) * Math.cos(vw) - Math.sin(N) * Math.sin(vw) * Math.cos(i));
  var yh = r * (Math.sin(N) * Math.cos(vw) + Math.cos(N) * Math.sin(vw) * Math.cos(i));
  var zh = r * (Math.sin(vw) * Math.sin(i));
  return { x: xh, y: yh, z: zh, a: el.a0 };
}
function applyLivePlanetPositions(unixMs) {
  var d = julianDayFromUnixMs(unixMs) - 2451543.5;
  for (var i = 0; i < planets.length; i++) {
    var p = planets[i];
    var coords = getHeliocentricCoordsAU(p.def.name, d);
    if (!coords) continue;
    var scale = p.def.orbitRadius / coords.a;
    p.anchor.position.set(coords.x * scale, coords.z * scale, coords.y * scale);
    p.orbitPivot.rotation.y = 0;
  }
}
function setPositionMode(mode) {
  positionMode = mode === POSITION_MODE_LIVE ? POSITION_MODE_LIVE : POSITION_MODE_SIM;
  if (timeScaleInput) timeScaleInput.disabled = positionMode === POSITION_MODE_LIVE;

  if (positionMode === POSITION_MODE_LIVE) {
    var liveNow = Date.now();
    applyLivePlanetPositions(liveNow);
    lastLiveUpdateMs = liveNow;
    return;
  }
  lastLiveUpdateMs = 0;

  for (var i = 0; i < planets.length; i++) {
    var p = planets[i];
    var hadLiveCoords = !!ORBITAL_ELEMENTS[p.def.name];
    if (!hadLiveCoords) continue;
    var angle = Math.atan2(p.anchor.position.z, p.anchor.position.x);
    p.anchor.position.set(p.def.orbitRadius, 0, 0);
    if (!Number.isNaN(angle)) p.orbitPivot.rotation.y = angle;
  }
}

/* ---- UI ---- */
function setupUI() {
  // Planet nav — ordered by distance from Sun with AU values
  var navPlanets = [
    { name: "Mercury", au: "0.4", color: "#a4abae" },
    { name: "Venus",   au: "0.7", color: "#d5b079" },
    { name: "Earth",   au: "1.0", color: "#4e86d8" },
    { name: "Mars",    au: "1.5", color: "#b3623f" },
    { name: "Jupiter", au: "5.2", color: "#cfa070" },
    { name: "Saturn",  au: "9.5", color: "#d6bf8e" },
    { name: "Uranus",  au: "19",  color: "#8fb8ce" },
    { name: "Neptune", au: "30",  color: "#4d76cc" }
  ];
  var header = document.createElement("div");
  header.className = "planet-nav-header";
  header.textContent = "Solar System";
  planetNav.appendChild(header);

  for (var i = 0; i < navPlanets.length; i++) {
    (function(np) {
      var btn = document.createElement("button");
      btn.className = "planet-item";
      btn.innerHTML =
        '<span class="planet-dot" style="--dot-color:' + np.color + '"></span>' +
        '<span class="planet-name">' + np.name + '</span>' +
        '<span class="planet-au">' + np.au + ' au</span>';
      btn.dataset.planet = np.name;
      btn.addEventListener("click", function() {
        for (var p = 0; p < planets.length; p++) {
          if (planets[p].def.name === np.name) { focusPlanet(planets[p]); break; }
        }
      });
      planetNav.appendChild(btn);
    })(navPlanets[i]);
  }
  planetNavItems = planetNav ? Array.prototype.slice.call(planetNav.querySelectorAll(".planet-item")) : [];
}

function updateUI() {
  var dist = camera.position.distanceTo(controls.target);
  // Scale bar position: map camera distance to 0-100%
  // Sun ~2-50, Asteroids ~50-200, Kuiper ~200-900, Milky Way ~900-18000, Local Group ~18000-2600000, Universe ~2600000+
  var pct = 0;
  if (dist < 50) pct = (dist / 50) * 18;
  else if (dist < 200) pct = 18 + ((dist - 50) / 150) * 14;
  else if (dist < GALAXY_REVEAL_START) pct = 32 + ((dist - 200) / (GALAXY_REVEAL_START - 200)) * 23;
  else if (dist < UNIVERSE_REVEAL_START) pct = 55 + ((dist - GALAXY_REVEAL_START) / (UNIVERSE_REVEAL_START - GALAXY_REVEAL_START)) * 23;
  else if (dist < UNIVERSE_REVEAL_FULL) pct = 78 + ((dist - UNIVERSE_REVEAL_START) / (UNIVERSE_REVEAL_FULL - UNIVERSE_REVEAL_START)) * 22;
  else pct = 100;
  pct = Math.min(100, Math.max(0, pct));
  if (Math.abs(pct - lastScalePct) > 0.12) {
    if (scaleFill) scaleFill.style.width = pct + "%";
    if (scaleThumb) scaleThumb.style.left = pct + "%";
    lastScalePct = pct;
  }

  // Info bar: show context label
  var label = "";
  if (selectedPlanet) {
    label = selectedPlanet.def.name;
  } else if (dist > UNIVERSE_REVEAL_FULL * 0.5) {
    label = "Observable Universe";
  } else if (dist > UNIVERSE_REVEAL_START) {
    label = "Local Group";
  } else if (dist > GALAXY_REVEAL_FULL * 0.5) {
    label = "Milky Way Galaxy";
  } else if (dist > GALAXY_REVEAL_START) {
    label = "Orion Arm";
  } else if (dist > 200) {
    label = "Outer Solar System";
  } else if (dist > 50) {
    label = "Inner Solar System";
  }
  if (label !== lastInfoLabel) {
    if (infoLabel) infoLabel.textContent = label;
    lastInfoLabel = label;
  }
  var visible = !!label;
  if (visible !== lastInfoVisible) {
    if (infoBar) {
      if (visible) infoBar.classList.add("visible");
      else infoBar.classList.remove("visible");
    }
    lastInfoVisible = visible;
  }

  // Planet nav active state
  var activePlanet = selectedPlanet ? selectedPlanet.def.name : "";
  if (activePlanet !== lastActivePlanetName) {
    for (var i = 0; i < planetNavItems.length; i++) {
      if (activePlanet && planetNavItems[i].dataset.planet === activePlanet) planetNavItems[i].classList.add("active");
      else planetNavItems[i].classList.remove("active");
    }
    lastActivePlanetName = activePlanet;
  }
}

/* ---- Events ---- */
function setupEvents() {
  controls.addEventListener("start", function() { controlsDragging = true; canvas.style.cursor = "grabbing"; });
  controls.addEventListener("end", function() {
    controlsDragging = false;
    if (selectedPlanet) selectedCameraOffset.copy(camera.position).sub(controls.target);
    canvas.style.cursor = hoveredPlanet ? "pointer" : "grab";
  });
  timeScaleInput.addEventListener("input", function() { timeWarpTarget = sliderToTimeWarp(Number(timeScaleInput.value)); });
  if (positionModeInput) {
    positionModeInput.addEventListener("change", function() { setPositionMode(positionModeInput.value); });
  }
  canvas.addEventListener("pointermove", function(e) { pointerInside = true; pointerPx.set(e.clientX, e.clientY); updatePointer(e); });
  canvas.addEventListener("pointerdown", function(e) { pointerInside = true; pointerDownPos = new THREE.Vector2(e.clientX, e.clientY); updatePointer(e); });
  canvas.addEventListener("pointerup", function(e) {
    pointerInside = true;
    updatePointer(e); if (!pointerDownPos) return;
    updateHover();
    pointerUpPos.set(e.clientX, e.clientY);
    var d = pointerDownPos.distanceTo(pointerUpPos); pointerDownPos = null;
    if (d < 4 && hoveredPlanet) focusPlanet(hoveredPlanet);
  });
  canvas.addEventListener("pointerleave", function() { pointerInside = false; hoveredPlanet = null; tooltip.classList.add("hidden"); pointerNdc.set(9, 9); });
  canvas.addEventListener("dblclick", function() { selectedPlanet = null; selectedAngleIndex = 0; startCameraTween(defaultCamPos, defaultTarget, 1200); });
  if (btnReset) btnReset.addEventListener("click", function() { selectedPlanet = null; selectedAngleIndex = 0; startCameraTween(defaultCamPos, defaultTarget, 1200); });
  var onResize = function() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight, false); };
  window.addEventListener("resize", onResize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
  document.addEventListener("touchmove", function(e) { if (e.target === canvas) e.preventDefault(); }, { passive: false });
}

function updatePointer(e) {
  var b = canvas.getBoundingClientRect();
  pointerNdc.x = ((e.clientX - b.left) / b.width) * 2 - 1;
  pointerNdc.y = -((e.clientY - b.top) / b.height) * 2 + 1;
}

function focusPlanet(planet) {
  if (selectedPlanet === planet) { selectedAngleIndex = (selectedAngleIndex + 1) % viewAngles.length; }
  else { selectedPlanet = planet; selectedAngleIndex = 0; }
  var target = planet.mesh.getWorldPosition(v1).clone();
  var dir = viewAngles[selectedAngleIndex].clone().normalize();
  var dist = Math.max(planet.def.radius * 6.6, 9.2);
  var pos = target.clone().add(dir.multiplyScalar(dist));
  pos.y += planet.def.radius * 0.45;
  selectedCameraOffset.copy(pos).sub(target);
  startCameraTween(pos, target, 1300);
}

function startCameraTween(endPos, endTarget, durationMs) {
  cameraTween = { startedAt: performance.now(), durationMs: durationMs, startPos: camera.position.clone(), startTarget: controls.target.clone(), endPos: endPos.clone(), endTarget: endTarget.clone() };
  controls.enabled = false;
}

function updateCameraTween(now) {
  if (!cameraTween) return;
  var t = Math.min((now - cameraTween.startedAt) / cameraTween.durationMs, 1);
  var e = t < 0.5 ? 16*t*t*t*t*t : 1 - Math.pow(-2*t+2, 5) / 2;
  camera.position.lerpVectors(cameraTween.startPos, cameraTween.endPos, e);
  controls.target.lerpVectors(cameraTween.startTarget, cameraTween.endTarget, e);
  if (t >= 1) { controls.enabled = true; cameraTween = null; }
}

function updateHover() {
  if (!pointerInside) return;
  raycaster.setFromCamera(pointerNdc, camera);
  var hits = raycaster.intersectObjects(pickables, false);
  hoveredPlanet = hits.length > 0 ? hits[0].object.userData.planet : null;
  canvas.style.cursor = hoveredPlanet ? "pointer" : controlsDragging ? "grabbing" : "grab";
  if (hoveredPlanet) {
    tooltip.textContent = hoveredPlanet.def.name + " \u2013 click to focus";
    tooltip.style.left = pointerPx.x + "px"; tooltip.style.top = pointerPx.y + "px";
    tooltip.classList.remove("hidden");
  } else { tooltip.classList.add("hidden"); }
}

function updateScaleContext() {
  var dist = camera.position.distanceTo(controls.target);
  if (lastScaleDist >= 0 && Math.abs(dist - lastScaleDist) < 0.02) return;
  lastScaleDist = dist;
  var gA = THREE.MathUtils.clamp((dist - GALAXY_REVEAL_START) / (GALAXY_REVEAL_FULL - GALAXY_REVEAL_START), 0, 1);
  var uA = THREE.MathUtils.clamp((dist - UNIVERSE_REVEAL_START) / (UNIVERSE_REVEAL_FULL - UNIVERSE_REVEAL_START), 0, 1);

  if (milkyWayBand) milkyWayBand.material.opacity = (0.05 + gA * 0.5) * (1 - uA * 0.45);
  if (galacticCenterGlow) galacticCenterGlow.material.opacity = (0.04 + gA * 0.2) * (1 - uA * 0.5);
  if (solarSystemMarker) {
    solarSystemMarker.material.opacity = (0.08 + gA * 0.58) * (1 - uA * 0.65);
    var s = 1 + gA * 2.3 - uA * 1.6; solarSystemMarker.scale.set(s, s, s);
  }
  if (solarSystemLabel) solarSystemLabel.material.opacity = Math.pow(gA, 1.3) * (1 - uA * 0.7) * 0.95;
  for (var i = 0; i < nebulaeMeshes.length; i++) nebulaeMeshes[i].material.opacity = Math.pow(gA, 1.5) * (1 - uA * 0.7) * 0.6;

  if (asteroidBeltMesh) {
    var beltFade = 1 - gA * 0.9;
    for (var bi = 0; bi < asteroidBeltFadeMaterials.length; bi++) {
      var mat = asteroidBeltFadeMaterials[bi];
      mat.opacity = mat._baseOp * beltFade;
    }
  }
  if (kuiperBeltMesh) kuiperBeltMesh.material.opacity = 0.4 * (1 - gA * 0.9);

  if (universeField) universeField.material.opacity = uA * 0.86;
  if (universeClusters) universeClusters.material.opacity = uA * 0.45;
  if (milkyWayUniverseMarker) { milkyWayUniverseMarker.material.opacity = uA * 0.82; var us = 1 + uA * 0.8; milkyWayUniverseMarker.scale.set(us, us, us); }
  if (milkyWayUniverseLabel) milkyWayUniverseLabel.material.opacity = Math.pow(uA, 1.2) * 0.96;
  if (universeLabel) universeLabel.material.opacity = Math.pow(uA, 1.5) * 0.9;

  for (var i = 0; i < namedGalaxies.length; i++) {
    namedGalaxies[i].points.material.opacity = uA * 0.7;
    namedGalaxies[i].glow.material.opacity = uA * 0.25;
    namedGalaxies[i].label.material.opacity = Math.pow(uA, 1.3) * 0.85;
  }
  for (var i = 0; i < orbitLines.length; i++) {
    var base = orbitLines[i].userData.baseOpacity || 0.4;
    orbitLines[i].material.opacity = base * (1 - gA * 0.82) * (1 - uA * 0.8);
  }
}

function maybeAdjustResolution(dtMs) {
  if (!adaptiveResolutionEnabled) return;

  frameStatsElapsedMs += dtMs;
  frameStatsCount += 1;
  dynamicResolutionElapsedMs += dtMs;

  if (dynamicResolutionElapsedMs < 1200 || frameStatsCount < 24) return;

  var avgFrameMs = frameStatsElapsedMs / frameStatsCount;
  frameStatsElapsedMs = 0;
  frameStatsCount = 0;
  dynamicResolutionElapsedMs = 0;

  var nextRatio = currentPixelRatio;
  if (avgFrameMs > 23 && currentPixelRatio > minPixelRatio) nextRatio = Math.max(minPixelRatio, currentPixelRatio - 0.12);
  else if (avgFrameMs < 15 && currentPixelRatio < maxDevicePixelRatio) nextRatio = Math.min(maxDevicePixelRatio, currentPixelRatio + 0.08);

  if (Math.abs(nextRatio - currentPixelRatio) > 0.01) {
    currentPixelRatio = nextRatio;
    renderer.setPixelRatio(currentPixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  var dt = Math.min(clock.getDelta(), 0.05);
  var dtMs = dt * 1000;
  var nowMs = Date.now();
  var simDays = 0;
  if (positionMode === POSITION_MODE_SIM) {
    // Smooth interpolation toward target speed — prevents jerky jumps
    timeWarp += (timeWarpTarget - timeWarp) * (1 - Math.exp(-dt * 8));
    simDays = dt * timeWarp;
  } else if (!lastLiveUpdateMs || (nowMs - lastLiveUpdateMs) >= LIVE_UPDATE_INTERVAL_MS) {
    applyLivePlanetPositions(nowMs);
    lastLiveUpdateMs = nowMs;
  }
  hoverElapsedMs += dtMs;
  if (hoverElapsedMs >= HOVER_UPDATE_INTERVAL_MS || controlsDragging) {
    updateHover();
    hoverElapsedMs = 0;
  }
  updateCameraTween(now || 0);

  for (var i = 0; i < planets.length; i++) {
    var p = planets[i];
    if (positionMode === POSITION_MODE_SIM || !ORBITAL_ELEMENTS[p.def.name]) {
      p.orbitPivot.rotation.y += (Math.PI * 2 * simDays) / p.def.orbitDays;
      var spinSign = Math.sign(p.def.spinDays) || 1;
      p.spin += ((Math.PI * 2 * simDays) / Math.abs(p.def.spinDays)) * spinSign;
      p.mesh.rotation.y = p.spin;
    } else {
      var spinSignLive = Math.sign(p.def.spinDays) || 1;
      var rotCycles = (nowMs / 86400000) / Math.abs(p.def.spinDays);
      var spin = (rotCycles - Math.floor(rotCycles)) * Math.PI * 2;
      p.mesh.rotation.y = spin * spinSignLive;
    }
    if (p.clouds) p.clouds.rotation.y += simDays * 0.15;
    if (p.atmosphere) p.atmosphere.rotation.y += dt * 0.02;
    var h = hoveredPlanet === p ? 1 : selectedPlanet === p ? 0.7 : 0;
    p.highlight += (h - p.highlight) * (1 - Math.exp(-dt * 10));
    var scale = 1 + p.highlight * 0.085;
    p.mesh.scale.set(scale, scale, scale);
    p.material.emissiveIntensity = 0.05 + p.highlight * 0.3;
  }

  for (var i = 0; i < allMoonRefs.length; i++) {
    var m = allMoonRefs[i];
    if (positionMode === POSITION_MODE_SIM) {
      m.orbitPivot.rotation.y += (m.retrograde ? -1 : 1) * (Math.PI * 2 * simDays) / m.orbitDays;
      m.spin += (Math.PI * 2 * simDays) / m.spinDays;
      m.mesh.rotation.y = m.spin;
    } else {
      var moonDir = m.retrograde ? -1 : 1;
      var moonOrbCycles = (nowMs / 86400000) / m.orbitDays;
      m.orbitPivot.rotation.y = moonDir * (moonOrbCycles - Math.floor(moonOrbCycles)) * Math.PI * 2;
      var moonSpinCycles = (nowMs / 86400000) / m.spinDays;
      m.mesh.rotation.y = (moonSpinCycles - Math.floor(moonSpinCycles)) * Math.PI * 2;
    }
  }

  if (selectedPlanet && !cameraTween) {
    var ft = selectedPlanet.mesh.getWorldPosition(v2);
    var alpha = 1 - Math.exp(-dt * 6);
    controls.target.lerp(ft, alpha);
    if (!controlsDragging) {
      selectedCameraTarget.copy(ft).add(selectedCameraOffset);
      camera.position.lerp(selectedCameraTarget, alpha);
    }
    else selectedCameraOffset.copy(camera.position).sub(controls.target);
  }

  updateScaleContext();
  uiElapsedMs += dtMs;
  if (uiElapsedMs >= UI_UPDATE_INTERVAL_MS) {
    updateUI();
    uiElapsedMs = 0;
  }
  controls.autoRotate = !selectedPlanet && !cameraTween && !controlsDragging;
  controls.update();
  maybeAdjustResolution(dtMs);
  renderer.render(scene, camera);
}

setPositionMode(positionMode);
