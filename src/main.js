import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const $ = (selector) => document.querySelector(selector);
const touchDevice = matchMedia('(hover: none) and (pointer: coarse)').matches;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b08);
scene.fog = new THREE.FogExp2(0x0a0e0a, 0.018);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, touchDevice ? 60 : 80);

// Performance policy:
// Keep the canvas visually fullscreen, but never let WebGL render at a huge 4K backbuffer.
// A 3840x2160 WebGL buffer is over 8 million pixels per frame; this game is designed to
// render internally around 720p and be upscaled by CSS.
const PERFORMANCE = {
  // 4K環境で重い場合、GPU負荷は解像度だけでなく
  // 画面全体に当たるライト数・HUD描画・視界線描画でも増えます。
  // そのため標準を 960x540 + ライト削減に寄せます。
  maxRenderWidth: 960,
  maxRenderHeight: 540,
  pixelRatio: 1,
  corridorLightLimit: 2,
  keyLightsEnabled: false,
  exitLightEnabled: false,
  enemyVisionEnabled: false,
  radarEnabled: true,
  radarHz: 8,
  hudHz: 10,
  lightAnimationHz: 15,
  enemySenseFarDistance: 14,
  enemyCaptureDistance: 1.45,
  enemyContactDistance: 1.8,
};

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', precision: 'mediump' });
renderer.setPixelRatio(PERFORMANCE.pixelRatio);
function resizeRenderer() {
  const width = Math.max(1, innerWidth);
  const height = Math.max(1, innerHeight);
  const aspect = width / height;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  let renderWidth = width;
  let renderHeight = height;
  const scale = Math.min(1, PERFORMANCE.maxRenderWidth / width, PERFORMANCE.maxRenderHeight / height);
  renderWidth = Math.max(1, Math.floor(width * scale));
  renderHeight = Math.max(1, Math.floor(height * scale));

  renderer.setSize(renderWidth, renderHeight, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
}
resizeRenderer();
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;
$('#game').append(renderer.domElement);

const ui = {
  dangerFlash: $('#danger-flash'),
  noiseBar: $('#noise-bar'),
  noiseValue: $('#noise-value'),
  detectBar: $('#detect-bar'),
  detectValue: $('#detect-value'),
  alertText: $('#alert-text'),
  moveMode: $('#move-mode'),
  batteryValue: $('#battery-value'),
  batteryBar: $('#battery-bar'),
};
const hudCache = { noise: -1, detection: -1, alert: '', moveMode: '', battery: -1 };

const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = 0.45;

const state = {
  started: false,
  ended: false,
  caught: false,
  caughtAt: 0,
  hidden: false,
  keyCount: 0,
  flashlight: true,
  battery: 100,
  detection: 0,
  alert: 'UNNOTICED',
  moveMode: 'WALKING',
  noise: 0,
  nearLocker: null,
  currentLocker: null,
  lockerFrontYaw: 0,
  lockerLookOffset: 0,
  lockerExitGraceUntil: 0,
  settingsOpen: false,
  allowExit: false,
  bob: 0,
};

const keys = {};
const mobileInput = {
  active: touchDevice,
  moveX: 0,
  moveY: 0,
  running: false,
};
const colliders = [];
const lockers = [];
const soundEvents = [];
const CELL = 4;
const GRID_W = 13;
const GRID_H = 19;
const GRID_HALF_W = (GRID_W - 1) / 2;
const GRID_HALF_H = (GRID_H - 1) / 2;
const REQUIRED_KEYS = 5;
const walkable = new Set();
const navNodes = new Map();

const material = (color, roughness = 0.82, metalness = 0.05) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const wallMat = material(0x27312a, 0.96);
const trimMat = material(0x121914, 0.72);
const floorMat = material(0x202722, 0.58);
const ceilingMat = material(0x111713, 0.9);
const metalMat = material(0x313c34, 0.42, 0.65);
const darkMat = material(0x080b09, 0.82);

function worldFromGrid(gx, gz) {
  return new THREE.Vector3((gx - GRID_HALF_W) * CELL, 0, (gz - GRID_HALF_H) * CELL);
}

function gridKey(gx, gz) {
  return `${gx},${gz}`;
}

function carve(gx, gz) {
  if (gx >= 0 && gx < GRID_W && gz >= 0 && gz < GRID_H) walkable.add(gridKey(gx, gz));
}

// A larger multi-loop maze: five long routes, six cross routes, and short dead ends.
for (let gz = 0; gz < GRID_H; gz += 1) carve(6, gz);
for (const gx of [1, 3, 9, 11]) for (let gz = 2; gz <= 17; gz += 1) carve(gx, gz);
for (const gz of [2, 5, 8, 11, 14, 17]) for (let gx = 1; gx <= 11; gx += 1) carve(gx, gz);
for (const [gx, fromZ, toZ] of [[4, 5, 8], [5, 11, 14], [7, 2, 5], [8, 14, 17]]) {
  for (let gz = fromZ; gz <= toZ; gz += 1) carve(gx, gz);
}

function addBox(x, y, z, w, h, d, mat, collide = false, wall = false, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  if (collide) colliders.push({ x, z, hw: w / 2, hz: d / 2 });
  return mesh;
}

const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

let corridorLightCount = 0;
for (const key of walkable) {
  const [gx, gz] = key.split(',').map(Number);
  const pos = worldFromGrid(gx, gz);
  navNodes.set(key, { key, gx, gz, x: pos.x, z: pos.z });
  addBox(pos.x, -0.12, pos.z, CELL + 0.04, 0.25, CELL + 0.04, floorMat, false, false, false);
  addBox(pos.x, 4.25, pos.z, CELL + 0.05, 0.18, CELL + 0.05, ceilingMat, false, false, false);

  for (const [dx, dz] of directions) {
    if (walkable.has(gridKey(gx + dx, gz + dz))) continue;
    if (dx !== 0) addBox(pos.x + dx * CELL / 2, 2.05, pos.z, 0.18, 4.2, CELL + 0.18, wallMat, true, true);
    else addBox(pos.x, 2.05, pos.z + dz * CELL / 2, CELL + 0.18, 4.2, 0.18, wallMat, true, true);
  }

  if ((gx * 5 + gz * 3) % 9 === 0) {
    const fixture = addBox(pos.x, 4.08, pos.z, 1.25, 0.08, 0.28, material(0xb8c3a1, 0.28), false, false, false);
    fixture.material.emissive = new THREE.Color(0x68745d);
    fixture.material.emissiveIntensity = 1.4;
    if (corridorLightCount < PERFORMANCE.corridorLightLimit) {
      const light = new THREE.PointLight(0xc2cbaa, 10, 10, 1.65);
      light.position.set(pos.x, 3.82, pos.z);
      scene.add(light);
      corridorLightCount += 1;
    }
  }
}

scene.add(new THREE.HemisphereLight(0x78877a, 0x111511, 0.54));
scene.add(new THREE.AmbientLight(0x354139, 0.38));

function localBox(group, x, y, z, w, h, d, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

function makeLocker(gx, gz, wallSide) {
  const cell = worldFromGrid(gx, gz);
  const group = new THREE.Group();
  localBox(group, 0, 0, -0.42, 1.08, 2.5, 0.08, metalMat);
  // Side panels stop before the door so a 180-degree view is not physically blocked.
  localBox(group, -0.52, 0, -0.08, 0.08, 2.5, 0.72, metalMat);
  localBox(group, 0.52, 0, -0.08, 0.08, 2.5, 0.72, metalMat);
  localBox(group, 0, 1.21, 0, 1.08, 0.08, 0.88, metalMat);
  localBox(group, 0, -1.21, 0, 1.08, 0.08, 0.88, metalMat);
  localBox(group, -0.44, 0, 0.44, 0.13, 2.35, 0.06, metalMat);
  localBox(group, 0.44, 0, 0.44, 0.13, 2.35, 0.06, metalMat);
  for (let y = 0.28; y <= 0.82; y += 0.18) localBox(group, 0, y, 0.46, 0.74, 0.055, 0.045, darkMat);
  localBox(group, 0.3, -0.18, 0.48, 0.05, 0.24, 0.04, darkMat);

  let yaw = 0;
  let x = cell.x;
  let z = cell.z;
  if (wallSide === 'west') {
    x -= 1.42;
    yaw = Math.PI / 2;
  } else if (wallSide === 'east') {
    x += 1.42;
    yaw = -Math.PI / 2;
  } else if (wallSide === 'north') {
    z -= 1.42;
    yaw = 0;
  } else {
    z += 1.42;
    yaw = Math.PI;
  }
  group.position.set(x, 1.25, z);
  group.rotation.y = yaw;
  scene.add(group);
  const sideways = Math.abs(Math.sin(yaw)) > 0.5;
  colliders.push({ x, z, hw: sideways ? 0.46 : 0.56, hz: sideways ? 0.56 : 0.46 });
  const locker = { group, x, z, yaw };
  lockers.push(locker);
  return locker;
}

makeLocker(1, 4, 'west');
makeLocker(11, 4, 'east');
makeLocker(1, 10, 'west');
makeLocker(11, 12, 'east');
makeLocker(3, 7, 'east');
makeLocker(9, 16, 'west');
makeLocker(6, 6, 'east');
makeLocker(6, 13, 'west');

// Cover objects leave the navigation centerline open while breaking sight lines.
const coverPoints = [];
const crateMat = material(0x443b2e, 0.92);
const cabinetMat = material(0x303a34, 0.5, 0.55);
function addCover(gx, gz, offsetX, offsetZ, type = 'crate') {
  const cell = worldFromGrid(gx, gz);
  const x = cell.x + offsetX;
  const z = cell.z + offsetZ;
  if (type === 'cabinet') {
    addBox(x, 1.15, z, 1.05, 2.3, 0.82, cabinetMat, true);
    addBox(x, 1.55, z + 0.425, 0.72, 0.06, 0.025, darkMat);
    addBox(x, 1.38, z + 0.425, 0.72, 0.06, 0.025, darkMat);
  } else {
    addBox(x, 0.58, z, 1.2, 1.16, 1.05, crateMat, true);
    addBox(x + 0.12, 1.42, z - 0.05, 0.86, 0.56, 0.82, crateMat);
  }
  coverPoints.push({ x, z });
}

addCover(6, 4, -1.05, 0, 'cabinet');
addCover(6, 9, 1.02, 0, 'crate');
addCover(3, 2, 0, 1.02, 'crate');
addCover(9, 2, 0, -1.02, 'cabinet');
addCover(3, 7, 0, -1.02, 'cabinet');
addCover(9, 7, 0, 1.02, 'crate');
addCover(3, 12, 0, 1.02, 'cabinet');
addCover(9, 12, 0, -1.02, 'crate');
addCover(1, 15, 1.02, 0, 'crate');
addCover(11, 10, -1.02, 0, 'cabinet');
addCover(5, 14, 0, 1.02, 'crate');
addCover(7, 5, 0, -1.02, 'cabinet');

// Exit door at the north end of the maze.
const exitPosition = worldFromGrid(6, 0);
const exitDoor = addBox(exitPosition.x, 1.45, exitPosition.z - 1.84, 2.15, 2.9, 0.14, material(0x303a33, 0.48, 0.6));
addBox(exitPosition.x, 3.45, exitPosition.z - 1.68, 1.2, 0.36, 0.08, material(0x1d6243, 0.35));
const exitLight = new THREE.PointLight(0x3acb88, 2.2, 4);
exitLight.position.set(exitPosition.x, 3.4, exitPosition.z - 0.7);
if (PERFORMANCE.exitLightEnabled) scene.add(exitLight);

const exitCounterCanvas = document.createElement('canvas');
exitCounterCanvas.width = 512;
exitCounterCanvas.height = 128;
const exitCounterContext = exitCounterCanvas.getContext('2d');
const exitCounterTexture = new THREE.CanvasTexture(exitCounterCanvas);
const exitCounter = new THREE.Sprite(new THREE.SpriteMaterial({ map: exitCounterTexture, transparent: true, depthTest: true }));
exitCounter.position.set(exitPosition.x, 3.45, exitPosition.z - 1.53);
exitCounter.scale.set(3.8, 0.95, 1);
scene.add(exitCounter);

function updateExitCounter() {
  exitCounterContext.clearRect(0, 0, 512, 128);
  exitCounterContext.fillStyle = 'rgba(4, 15, 10, .88)';
  exitCounterContext.fillRect(0, 0, 512, 128);
  exitCounterContext.strokeStyle = state.keyCount >= REQUIRED_KEYS ? '#70e0a5' : '#b8c9be';
  exitCounterContext.lineWidth = 5;
  exitCounterContext.strokeRect(4, 4, 504, 120);
  exitCounterContext.fillStyle = state.keyCount >= REQUIRED_KEYS ? '#70e0a5' : '#e0e8e3';
  exitCounterContext.font = 'bold 48px sans-serif';
  exitCounterContext.textAlign = 'center';
  exitCounterContext.textBaseline = 'middle';
  exitCounterContext.fillText(`必要な鍵 ${state.keyCount} / ${REQUIRED_KEYS}`, 256, 64);
  exitCounterTexture.needsUpdate = true;
}

// Five keys are sampled from different side-route locations every playthrough.
const keyCandidates = [
  [1, 3], [1, 6], [1, 9], [1, 13], [1, 16],
  [3, 4], [3, 10], [3, 15], [9, 3], [9, 6],
  [9, 10], [9, 15], [11, 4], [11, 7], [11, 13], [11, 16],
  [2, 5], [5, 11], [7, 14], [10, 8],
];
const keyMat = material(0xc2a44e, 0.25, 0.85);
const shuffledKeyCandidates = [...keyCandidates].sort(() => Math.random() - 0.5).slice(0, REQUIRED_KEYS);
const keyItems = shuffledKeyCandidates.map(([gx, gz], index) => {
  const keySpawn = worldFromGrid(gx, gz);
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 18), keyMat);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.35), keyMat);
  stem.position.z = 0.24;
  group.add(stem);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.06), keyMat);
  tooth.position.set(0.04, 0, 0.4);
  group.add(tooth);
  group.position.set(keySpawn.x + (index % 2 ? -0.6 : 0.6), 1.05, keySpawn.z);
  scene.add(group);
  const light = new THREE.PointLight(0xe2c466, 0.8, 2.2);
  light.position.copy(group.position);
  if (PERFORMANCE.keyLightsEnabled) scene.add(light);
  return { group, light, collected: false, baseY: 1.05, phase: index * 0.9 };
});
updateExitCounter();

// Enemy silhouette.
const enemy = new THREE.Group();
const enemyBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.15, 7, 10), material(0x101411, 0.8));
enemyBody.position.y = 1.05;
enemyBody.castShadow = false;
enemy.add(enemyBody);
const enemyHead = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 9), material(0x151916, 0.85));
enemyHead.position.y = 2;
enemy.add(enemyHead);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb7261c });
for (const x of [-0.1, 0.1]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6), eyeMat);
  eye.position.set(x, 2.04, 0.285);
  enemy.add(eye);
}
const enemyStart = worldFromGrid(1, 7);
enemy.position.set(enemyStart.x, 0, enemyStart.z);
scene.add(enemy);

const VISION_DISTANCE = 10.5;
const VISION_HALF_ANGLE = Math.acos(0.84);
const VISION_RAYS = 13;
const visionPositions = new Float32Array(VISION_RAYS * 2 * 3);
const enemyVisionGeometry = new THREE.BufferGeometry();
enemyVisionGeometry.setAttribute('position', new THREE.BufferAttribute(visionPositions, 3));
const enemyVisionMaterial = new THREE.LineBasicMaterial({
  color: 0xe8372d,
  transparent: true,
  opacity: 0.48,
  depthWrite: false,
});
const enemyVisionLines = new THREE.LineSegments(enemyVisionGeometry, enemyVisionMaterial);
enemyVisionLines.frustumCulled = false;
if (PERFORMANCE.enemyVisionEnabled) scene.add(enemyVisionLines);

function rayColliderEntry(originX, originZ, dx, dz, collider, maxDistance, padding = 0.02) {
  let near = 0;
  let far = maxDistance;
  const minX = collider.x - collider.hw - padding;
  const maxX = collider.x + collider.hw + padding;
  if (Math.abs(dx) < 0.00001) {
    if (originX < minX || originX > maxX) return Infinity;
  } else {
    let entryX = (minX - originX) / dx;
    let exitX = (maxX - originX) / dx;
    if (entryX > exitX) [entryX, exitX] = [exitX, entryX];
    near = Math.max(near, entryX);
    far = Math.min(far, exitX);
    if (near > far) return Infinity;
  }

  const minZ = collider.z - collider.hz - padding;
  const maxZ = collider.z + collider.hz + padding;
  if (Math.abs(dz) < 0.00001) return originZ < minZ || originZ > maxZ ? Infinity : near;
  let entryZ = (minZ - originZ) / dz;
  let exitZ = (maxZ - originZ) / dz;
  if (entryZ > exitZ) [entryZ, exitZ] = [exitZ, entryZ];
  near = Math.max(near, entryZ);
  far = Math.min(far, exitZ);
  if (near > far) return Infinity;
  return near;
}

function visionRayDistance(originX, originZ, dx, dz) {
  let nearest = VISION_DISTANCE;
  for (const collider of colliders) {
    const entry = rayColliderEntry(originX, originZ, dx, dz, collider, nearest);
    if (entry < nearest) nearest = entry;
  }
  return Math.max(0.1, nearest - 0.03);
}

function updateEnemyVision() {
  for (let i = 0; i < VISION_RAYS; i += 1) {
    const offset = -VISION_HALF_ANGLE + (VISION_HALF_ANGLE * 2 * i) / (VISION_RAYS - 1);
    const angle = enemy.rotation.y + offset;
    const dx = Math.sin(angle);
    const dz = Math.cos(angle);
    const distance = visionRayDistance(enemy.position.x, enemy.position.z, dx, dz);
    const cursor = i * 6;
    visionPositions[cursor] = enemy.position.x;
    visionPositions[cursor + 1] = 0.08;
    visionPositions[cursor + 2] = enemy.position.z;
    visionPositions[cursor + 3] = enemy.position.x + dx * distance;
    visionPositions[cursor + 4] = 0.08;
    visionPositions[cursor + 5] = enemy.position.z + dz * distance;
  }
  if (!PERFORMANCE.enemyVisionEnabled) return;
  enemyVisionMaterial.opacity = state.alert === 'HUNTING' ? 0.78 : 0.48;
  enemyVisionGeometry.attributes.position.needsUpdate = true;
}

const enemyData = {
  speed: 1.25,
  path: [],
  mode: 'ROAMING',
  targetKey: null,
  repathAt: 0,
  investigateUntil: 0,
  investigateSpeed: 1.85,
  pauseUntil: 0,
  isMoving: false,
  alertMemory: 0,
  lastMemoryGainAt: -Infinity,
  lastHeardAt: -Infinity,
  lastHeardPosition: null,
  searchUntil: 0,
  lookAroundUntil: 0,
  lookBaseYaw: 0,
  coverCheckIndex: -1,
  coverCheckSuccess: false,
  nextCoverCheckAt: 0,
  coverLookYaw: 0,
};

function nearestNode(x, z) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of navNodes.values()) {
    const distance = Math.hypot(node.x - x, node.z - z);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

function findPath(startKey, targetKey) {
  if (!startKey || !targetKey || startKey === targetKey) return [];
  const queue = [startKey];
  const previous = new Map([[startKey, null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current === targetKey) break;
    const node = navNodes.get(current);
    for (const [dx, dz] of directions) {
      const nextKey = gridKey(node.gx + dx, node.gz + dz);
      if (!walkable.has(nextKey) || previous.has(nextKey)) continue;
      previous.set(nextKey, current);
      queue.push(nextKey);
    }
  }
  if (!previous.has(targetKey)) return [];
  const result = [];
  let cursor = targetKey;
  while (cursor && cursor !== startKey) {
    result.unshift(navNodes.get(cursor));
    cursor = previous.get(cursor);
  }
  return result;
}

function setEnemyDestination(x, z, mode = 'ROAMING') {
  const start = nearestNode(enemy.position.x, enemy.position.z);
  const target = nearestNode(x, z);
  if (!start || !target) return;
  enemyData.path = findPath(start.key, target.key);
  enemyData.targetKey = target.key;
  enemyData.mode = mode;
}

function chooseRandomEnemyRoute() {
  const choices = [...navNodes.values()].filter((node) => node.key !== enemyData.targetKey);
  const target = choices[Math.floor(Math.random() * choices.length)];
  setEnemyDestination(target.x, target.z, 'ROAMING');
}

function chooseCoverSearchRoute() {
  const origin = enemyData.lastHeardPosition || { x: enemy.position.x, z: enemy.position.z };
  let nearbyCovers = coverPoints.filter((cover) => Math.hypot(cover.x - origin.x, cover.z - origin.z) < 11);
  if (!nearbyCovers.length) nearbyCovers = coverPoints;
  const cover = nearbyCovers[Math.floor(Math.random() * nearbyCovers.length)];
  const nearbyNodes = [...navNodes.values()].filter((node) => Math.hypot(node.x - cover.x, node.z - cover.z) < 4.8);
  const target = nearbyNodes[Math.floor(Math.random() * nearbyNodes.length)] || nearestNode(cover.x, cover.z);
  if (target) {
    setEnemyDestination(target.x, target.z, 'SEARCHING');
    if (enemyData.path.length === 0) {
      enemyData.lookBaseYaw = enemy.rotation.y;
      enemyData.lookAroundUntil = clock.elapsedTime + 0.8 + Math.random();
    }
  }
}

// Flashlight.
const flashlight = new THREE.SpotLight(0xf4f1dc, 78, 46, Math.PI / 5.5, 0.86, 1.8);
flashlight.castShadow = false;
flashlight.shadow.mapSize.set(256, 256);
scene.add(flashlight);
scene.add(flashlight.target);
const fillLight = new THREE.PointLight(0xcbd5c1, 0.22, 2.2);
scene.add(fillLight);
const lockerViewLight = new THREE.SpotLight(0x9cac9f, 20, 11, Math.PI / 5, 0.65, 1.35);
lockerViewLight.visible = false;
scene.add(lockerViewLight);
scene.add(lockerViewLight.target);

// Procedural spatial audio.
let audio = null;
let seVolume = 80;
try {
  const storedVolume = localStorage.getItem('soundEffectVolume');
  const savedVolume = Number(storedVolume);
  if (storedVolume !== null && savedVolume >= 0 && savedVolume <= 100) seVolume = savedVolume;
} catch { /* Use default volume. */ }

function initAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.ratio.value = 5;
  compressor.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = 0.9 * (seVolume / 100);
  master.connect(compressor);
  const hum = ctx.createOscillator();
  const humGain = ctx.createGain();
  hum.type = 'sawtooth';
  hum.frequency.value = 48;
  humGain.gain.value = 0.012;
  hum.connect(humGain).connect(master);
  hum.start();
  const near = ctx.createOscillator();
  const nearGain = ctx.createGain();
  near.type = 'sine';
  near.frequency.value = 31;
  nearGain.gain.value = 0;
  near.connect(nearGain).connect(master);
  near.start();
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  audio = { ctx, master, nearGain, noiseBuffer, nextStep: 0, nextEnemyStep: 0, nextBeat: 0 };
}

function distanceAttenuation(distance, maxDistance, curve = 1.25) {
  return Math.pow(THREE.MathUtils.clamp(1 - distance / maxDistance, 0, 1), curve);
}

function thump(volume = 0.2, frequency = 78) {
  if (!audio) return;
  const { ctx, master } = audio;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(37, ctx.currentTime + 0.16);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
  oscillator.connect(gain).connect(master);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.26);
}

function playFootstep(volume, pitch = 1, pan = 0) {
  if (!audio || volume <= 0.006) return;
  const { ctx, master, noiseBuffer } = audio;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = noiseBuffer;
  source.playbackRate.value = pitch;
  filter.type = 'lowpass';
  filter.frequency.value = 520 * pitch;
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
  source.connect(filter).connect(gain);
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = THREE.MathUtils.clamp(pan, -1, 1);
    gain.connect(panner).connect(master);
  } else gain.connect(master);
  source.start();
}

function playEnemyFootstep(volume, pan = 0) {
  if (!audio || volume <= 0.006) return;
  const { ctx, master, noiseBuffer } = audio;
  const bus = ctx.createGain();
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const impact = ctx.createOscillator();
  const impactGain = ctx.createGain();
  source.buffer = noiseBuffer;
  source.playbackRate.value = 0.52;
  filter.type = 'lowpass';
  filter.frequency.value = 240;
  impact.type = 'triangle';
  impact.frequency.setValueAtTime(62, ctx.currentTime);
  impact.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 0.2);
  impactGain.gain.setValueAtTime(0.7, ctx.currentTime);
  impactGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
  bus.gain.setValueAtTime(volume, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
  source.connect(filter).connect(bus);
  impact.connect(impactGain).connect(bus);
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = THREE.MathUtils.clamp(pan, -1, 1);
    bus.connect(panner).connect(master);
  } else bus.connect(master);
  source.start();
  impact.start();
  impact.stop(ctx.currentTime + 0.24);
}

function playLockerSound(opening) {
  if (!audio) return;
  const { ctx, master, noiseBuffer } = audio;
  const squeak = ctx.createOscillator();
  const squeakGain = ctx.createGain();
  const clank = ctx.createBufferSource();
  const clankFilter = ctx.createBiquadFilter();
  const clankGain = ctx.createGain();
  squeak.type = 'sawtooth';
  squeak.frequency.setValueAtTime(opening ? 170 : 260, ctx.currentTime);
  squeak.frequency.exponentialRampToValueAtTime(opening ? 390 : 120, ctx.currentTime + 0.28);
  squeakGain.gain.setValueAtTime(0.13, ctx.currentTime);
  squeakGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
  clank.buffer = noiseBuffer;
  clank.playbackRate.value = 1.7;
  clankFilter.type = 'bandpass';
  clankFilter.frequency.value = 1250;
  clankGain.gain.setValueAtTime(0.32, ctx.currentTime);
  clankGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  squeak.connect(squeakGain).connect(master);
  clank.connect(clankFilter).connect(clankGain).connect(master);
  squeak.start();
  squeak.stop(ctx.currentTime + 0.34);
  clank.start();
}

function emitPlayerSound(strength, baseHearingRadius) {
  const hearingRadius = baseHearingRadius * (1 + enemyData.alertMemory * 0.28);
  const event = { x: camera.position.x, z: camera.position.z, strength, hearingRadius, age: 0, life: 2.4 };
  soundEvents.push(event);
  const distance = Math.hypot(enemy.position.x - event.x, enemy.position.z - event.z);
  if (distance <= hearingRadius) {
    const now = clock.elapsedTime;
    enemyData.lastHeardAt = now;
    enemyData.lastHeardPosition = { x: event.x, z: event.z };
    if (now - enemyData.lastMemoryGainAt > 0.85) {
      enemyData.alertMemory = THREE.MathUtils.clamp(
        enemyData.alertMemory + (strength > 70 ? 0.12 : 0.055),
        0,
        1,
      );
      enemyData.lastMemoryGainAt = now;
    }
    const noiseGain = (strength > 70 ? 5.5 : 1.8) * (1 + enemyData.alertMemory * 1.2);
    state.detection = Math.max(state.detection, strength > 70 ? 20 : 10);
    state.detection = THREE.MathUtils.clamp(state.detection + noiseGain, 0, 100);
    if (state.alert === 'HUNTING' && state.detection > 70) {
      setEnemyDestination(event.x, event.z, 'HUNTING');
      return;
    }
    const firstReaction = enemyData.mode !== 'INVESTIGATING';
    setEnemyDestination(event.x, event.z, 'INVESTIGATING');
    enemyData.investigateUntil = now + 3.5 + strength * 0.025;
    enemyData.searchUntil = now + 16;
    enemyData.investigateSpeed = strength > 70 ? 3.15 : strength > 30 ? 2.35 : 1.8;
    if (firstReaction) enemyData.pauseUntil = now + 0.7;
  }
}

function updateAudio(time) {
  if (!audio) return;
  const enemyDistance = enemy.position.distanceTo(camera.position);
  const proximity = distanceAttenuation(enemyDistance, 22, 1.05);
  audio.nearGain.gain.setTargetAtTime(proximity * 0.095, audio.ctx.currentTime, 0.14);

  const moving = state.noise > 0 && !state.hidden;
  if (moving && time > audio.nextStep) {
    const settings = state.moveMode === 'RUNNING'
      ? { volume: 0.72, pitch: 1.2, interval: 0.27, radius: 21 }
      : { volume: 0.46, pitch: 1, interval: 0.44, radius: 2 };
    playFootstep(settings.volume, settings.pitch, 0);
    emitPlayerSound(state.noise, settings.radius);
    audio.nextStep = time + settings.interval;
  }

  if (enemyData.isMoving && time > audio.nextEnemyStep) {
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const cameraRight = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const directionToEnemy = new THREE.Vector3().subVectors(enemy.position, camera.position).normalize();
    const pan = cameraRight.dot(directionToEnemy);
    const volume = distanceAttenuation(enemyDistance, 30, 1.15) * 1.05;
    playEnemyFootstep(volume, pan);
    audio.nextEnemyStep = time + (enemyData.speed > 2 ? 0.34 : 0.56);
  }

  if (proximity > 0.02 && time > audio.nextBeat) {
    const beatVolume = 0.12 + proximity * 0.92;
    thump(beatVolume, 86 + proximity * 17);
    setTimeout(() => thump(beatVolume * 0.74, 73 + proximity * 11), 110);
    audio.nextBeat = time + THREE.MathUtils.lerp(1.28, 0.34, proximity);
  }
}

function canMoveTo(x, z) {
  const maxX = GRID_HALF_W * CELL + CELL / 2 - 0.2;
  const maxZ = GRID_HALF_H * CELL + CELL / 2 - 0.2;
  if (x < -maxX || x > maxX || z < -maxZ || z > maxZ) return false;
  return !colliders.some((collider) =>
    Math.abs(x - collider.x) < collider.hw + 0.26 && Math.abs(z - collider.z) < collider.hz + 0.26);
}

function hasLineOfSight(from, to) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  if (distance < 0.001) return true;
  const dx = (to.x - from.x) / distance;
  const dz = (to.z - from.z) / distance;
  for (const collider of colliders) {
    if (rayColliderEntry(from.x, from.z, dx, dz, collider, distance, 0.04) < distance) return false;
  }
  return true;
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2100);
}

function enterLocker(locker) {
  state.hidden = true;
  state.noise = 0;
  state.currentLocker = locker;
  document.body.classList.add('hidden-in-locker');
  const inside = locker.group.localToWorld(new THREE.Vector3(0, 0.12, 0.39));
  const lookTarget = locker.group.localToWorld(new THREE.Vector3(0, 0.12, 4));
  camera.position.copy(inside);
  camera.lookAt(lookTarget);
  state.lockerFrontYaw = Math.atan2(Math.sin(locker.yaw + Math.PI), Math.cos(locker.yaw + Math.PI));
  state.lockerLookOffset = 0;
  camera.rotation.y = state.lockerFrontYaw;
  keys.KeyW = keys.KeyA = keys.KeyS = keys.KeyD = false;
  playLockerSound(true);
  emitPlayerSound(45, 6);
  showToast('ロッカーの中に隠れた');
}

function leaveLocker() {
  const locker = state.currentLocker;
  const outside = locker.group.localToWorld(new THREE.Vector3(0, 0.43, 1.05));
  const lookTarget = locker.group.localToWorld(new THREE.Vector3(0, 0.43, 4));
  camera.position.copy(outside);
  camera.lookAt(lookTarget);
  state.hidden = false;
  state.currentLocker = null;
  state.lockerExitGraceUntil = clock.elapsedTime + 1.4;
  state.detection = Math.min(state.detection, 55);
  document.body.classList.remove('hidden-in-locker');
  playLockerSound(false);
  emitPlayerSound(45, 6);
  showToast('ロッカーから出た');
}

function interact() {
  if (state.hidden) {
    leaveLocker();
    return;
  }
  if (state.nearLocker) {
    enterLocker(state.nearLocker);
    return;
  }
  const nearbyKey = keyItems.find((item) => !item.collected && camera.position.distanceTo(item.group.position) < 2.15);
  if (nearbyKey) {
    nearbyKey.collected = true;
    nearbyKey.group.visible = false;
    nearbyKey.light.visible = false;
    state.keyCount += 1;
    updateExitCounter();
    $('#objective-text').textContent = state.keyCount >= REQUIRED_KEYS
      ? '出口へ向かう'
      : `鍵を探す ${state.keyCount} / ${REQUIRED_KEYS}`;
    showToast(`鍵を手に入れた　${state.keyCount} / ${REQUIRED_KEYS}`);
    return;
  }
  if (horizontalDistance(camera.position, exitDoor.position) < 3.6) {
    if (state.keyCount >= REQUIRED_KEYS) endGame(true);
    else showToast(`鍵が足りない　${state.keyCount} / ${REQUIRED_KEYS}`);
  }
}

function startCaughtCutscene() {
  if (state.caught) return;
  state.caught = true;
  state.caughtAt = clock.elapsedTime;
  state.noise = 0;
  Object.keys(keys).forEach((key) => { keys[key] = false; });
  if (controls.isLocked) controls.unlock();
  document.body.classList.add('caught-cutscene');
}

function respawnPlayer() {
  state.caught = false;
  state.ended = false;
  state.hidden = false;
  state.keyCount = 0;
  state.flashlight = true;
  state.battery = 100;
  state.detection = 0;
  state.alert = 'UNNOTICED';
  state.moveMode = 'WALKING';
  state.noise = 0;
  state.nearLocker = null;
  state.currentLocker = null;
  state.lockerExitGraceUntil = clock.elapsedTime + 1;
  state.settingsOpen = false;
  mobileInput.moveX = mobileInput.moveY = 0;
  mobileInput.running = false;
  $('#mobile-run-toggle').classList.remove('running');
  $('#mobile-run-toggle').textContent = '歩行中';
  document.body.classList.remove('caught-cutscene', 'hidden-in-locker');
  camera.position.set(playerStart.x, 1.68, playerStart.z);
  camera.rotation.set(0, 0, 0);
  for (const item of keyItems) {
    item.collected = false;
    item.group.visible = true;
    item.light.visible = true;
  }
  updateExitCounter();
  $('#objective-text').textContent = `鍵を探す 0 / ${REQUIRED_KEYS}`;
  enemy.position.set(enemyStart.x, 0, enemyStart.z);
  Object.assign(enemyData, {
    speed: 1.25,
    path: [],
    mode: 'ROAMING',
    targetKey: null,
    repathAt: 0,
    investigateUntil: 0,
    investigateSpeed: 1.85,
    pauseUntil: 0,
    isMoving: false,
    alertMemory: 0,
    lastMemoryGainAt: -Infinity,
    lastHeardAt: -Infinity,
    lastHeardPosition: null,
    searchUntil: 0,
    lookAroundUntil: 0,
    lookBaseYaw: 0,
    coverCheckIndex: -1,
    coverCheckSuccess: false,
    nextCoverCheckAt: 0,
    coverLookYaw: 0,
  });
  soundEvents.length = 0;
  chooseRandomEnemyRoute();
  showToast('意識を取り戻した');
  if (!mobileInput.active) lockPointer();
}

function updateCaughtCutscene(time) {
  const progress = THREE.MathUtils.clamp((time - state.caughtAt) / 1.75, 0, 1);
  const enemyFace = enemy.position.clone().add(new THREE.Vector3(0, 1.78, 0));
  const away = camera.position.clone().sub(enemyFace).setY(0).normalize();
  const targetPosition = enemyFace.clone().addScaledVector(away.lengthSq() ? away : new THREE.Vector3(0, 0, 1), 0.52);
  targetPosition.y = 1.58;
  camera.position.lerp(targetPosition, 0.045 + progress * 0.08);
  camera.lookAt(enemyFace);
  $('#danger-flash').style.opacity = String(0.45 + Math.sin(time * 18) * 0.2);
  if (progress >= 1) respawnPlayer();
}

function endGame(win) {
  state.ended = true;
  controls.unlock();
  $('#message-kicker').textContent = win ? '脱出成功' : '見つかった';
  $('#message-title').textContent = win ? '生還' : '捕獲';
  $('#message-body').textContent = win
    ? '背後で、まだ何かが扉を叩いている。'
    : '速すぎた。うるさすぎた。もう一度、静かに。';
  $('#message-screen').classList.add('visible');
}

function openSettings() {
  state.settingsOpen = true;
  $('#settings-screen').classList.add('visible');
  $('#settings-close').textContent = state.started ? 'ゲームに戻る' : '閉じる';
  $('#settings-quit').disabled = !state.started;
  if (controls.isLocked) controls.unlock();
}

function closeSettings() {
  state.settingsOpen = false;
  $('#settings-screen').classList.remove('visible');
  if (state.started && !state.ended && !state.caught) lockPointer();
}

function lockPointer() {
  if (mobileInput.active) return;
  try {
    controls.lock(true);
  } catch {
    controls.lock(false);
  }
}

const sensitivitySlider = $('#sensitivity-slider');
sensitivitySlider.addEventListener('input', () => {
  const value = Number(sensitivitySlider.value);
  controls.pointerSpeed = value / 100;
  $('#sensitivity-value').textContent = String(value);
  try { localStorage.setItem('mouseSensitivity', String(value)); } catch { /* Storage may be disabled. */ }
});
let savedSensitivity = 0;
try { savedSensitivity = Number(localStorage.getItem('mouseSensitivity')); } catch { /* Use default sensitivity. */ }
if (savedSensitivity >= 15 && savedSensitivity <= 120) {
  sensitivitySlider.value = String(savedSensitivity);
  sensitivitySlider.dispatchEvent(new Event('input'));
}

const seVolumeSlider = $('#se-volume-slider');
seVolumeSlider.value = String(seVolume);
$('#se-volume-value').textContent = `${seVolume}%`;
seVolumeSlider.addEventListener('input', () => {
  seVolume = Number(seVolumeSlider.value);
  $('#se-volume-value').textContent = `${seVolume}%`;
  try { localStorage.setItem('soundEffectVolume', String(seVolume)); } catch { /* Storage may be disabled. */ }
  if (audio) audio.master.gain.setTargetAtTime(0.9 * (seVolume / 100), audio.ctx.currentTime, 0.035);
});

$('#settings-button').addEventListener('click', openSettings);
$('#settings-close').addEventListener('click', closeSettings);
$('#settings-quit').addEventListener('click', () => {
  state.allowExit = true;
  location.reload();
});
controls.addEventListener('unlock', () => {
  if (state.started && !state.ended && !state.caught && !state.settingsOpen) openSettings();
});
$('#start-button').addEventListener('click', () => {
  state.started = true;
  initAudio();
  document.body.classList.add('game-running');
  $('#start-screen').classList.remove('visible');
  lockPointer();
});
$('#restart-button').addEventListener('click', () => {
  state.allowExit = true;
  location.reload();
});
renderer.domElement.addEventListener('click', () => {
  if (!mobileInput.active && state.started && !state.ended && !state.caught && !state.settingsOpen && !controls.isLocked) lockPointer();
});
addEventListener('keydown', (event) => {
  if (state.started && !state.ended && (event.ctrlKey || event.metaKey)) event.preventDefault();
}, { capture: true });
addEventListener('keydown', (event) => {
  keys[event.code] = true;
  if (event.code === 'Escape' && state.started && !state.ended && !event.repeat) {
    if (state.settingsOpen) closeSettings();
    else openSettings();
  }
  if (event.code === 'KeyE' && !event.repeat) interact();
  if (event.code === 'KeyF' && !event.repeat) {
    state.flashlight = !state.flashlight;
    showToast(state.flashlight ? '懐中電灯を点けた' : '懐中電灯を消した');
  }
});
addEventListener('keyup', (event) => { keys[event.code] = false; });
addEventListener('mousemove', (event) => {
  if (!state.hidden || !controls.isLocked) return;
  state.lockerLookOffset = THREE.MathUtils.clamp(
    state.lockerLookOffset - event.movementX * 0.002 * controls.pointerSpeed,
    -Math.PI / 2,
    Math.PI / 2,
  );
});
addEventListener('beforeunload', (event) => {
  if (state.started && !state.ended && !state.allowExit) {
    event.preventDefault();
    event.returnValue = '';
  }
});

function setupTouchStick(element, onChange) {
  let pointerId = null;
  let bounds = null;
  const knob = element.querySelector('i');
  const update = (event) => {
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const radius = bounds.width * 0.36;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const distance = Math.hypot(rawX, rawY) || 1;
    const scale = Math.min(1, radius / distance);
    const x = rawX * scale;
    const y = rawY * scale;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    onChange(x / radius, y / radius);
  };
  element.addEventListener('pointerdown', (event) => {
    if (!state.started || state.caught) return;
    event.preventDefault();
    pointerId = event.pointerId;
    bounds = element.getBoundingClientRect();
    element.setPointerCapture(pointerId);
    update(event);
  });
  element.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    update(event);
  });
  const release = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    knob.style.transform = '';
    onChange(0, 0);
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
}

setupTouchStick($('#move-stick'), (x, y) => { mobileInput.moveX = x; mobileInput.moveY = y; });
$('#mobile-run-toggle').addEventListener('click', () => {
  mobileInput.running = !mobileInput.running;
  $('#mobile-run-toggle').classList.toggle('running', mobileInput.running);
  $('#mobile-run-toggle').textContent = mobileInput.running ? '走行中' : '歩行中';
});
$('#mobile-flashlight').addEventListener('click', () => {
  state.flashlight = !state.flashlight;
  $('#mobile-flashlight').classList.toggle('active', state.flashlight);
});
$('#mobile-action').addEventListener('click', interact);

let cameraSwipePointer = null;
let cameraSwipeX = 0;
let cameraSwipeY = 0;
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!mobileInput.active || !state.started || state.caught || state.settingsOpen) return;
  cameraSwipePointer = event.pointerId;
  cameraSwipeX = event.clientX;
  cameraSwipeY = event.clientY;
  renderer.domElement.setPointerCapture(cameraSwipePointer);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (event.pointerId !== cameraSwipePointer) return;
  event.preventDefault();
  const deltaX = event.clientX - cameraSwipeX;
  const deltaY = event.clientY - cameraSwipeY;
  cameraSwipeX = event.clientX;
  cameraSwipeY = event.clientY;
  const sensitivity = 0.0042 * (controls.pointerSpeed / 0.45);
  if (state.hidden) {
    state.lockerLookOffset = THREE.MathUtils.clamp(
      state.lockerLookOffset - deltaX * sensitivity,
      -Math.PI / 2,
      Math.PI / 2,
    );
  } else {
    camera.rotation.y -= deltaX * sensitivity;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - deltaY * sensitivity, -1.35, 1.35);
  }
});
const releaseCameraSwipe = (event) => {
  if (event.pointerId === cameraSwipePointer) cameraSwipePointer = null;
};
renderer.domElement.addEventListener('pointerup', releaseCameraSwipe);
renderer.domElement.addEventListener('pointercancel', releaseCameraSwipe);

const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const toPlayer = new THREE.Vector3();
const enemyEyeTemp = new THREE.Vector3();
const playerEyeTemp = new THREE.Vector3();
const enemyForwardTemp = new THREE.Vector3();
const enemyMoveDirection = new THREE.Vector3();
const playerStart = worldFromGrid(6, 18);
camera.position.set(playerStart.x, 1.68, playerStart.z);
camera.rotation.order = 'YXZ';

function updatePlayer(dt) {
  if ((!controls.isLocked && !mobileInput.active) || state.hidden) return;
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();
  move.set(0, 0, 0);
  if (keys.KeyW) move.add(forward);
  if (keys.KeyS) move.sub(forward);
  if (keys.KeyD) move.add(right);
  if (keys.KeyA) move.sub(right);
  if (mobileInput.active) {
    move.addScaledVector(forward, -mobileInput.moveY);
    move.addScaledVector(right, mobileInput.moveX);
  }
  const active = move.lengthSq() > 0;
  if (active) move.normalize();
  const running = keys.ShiftLeft || keys.ShiftRight || mobileInput.running;
  const speed = running ? 4.7 : 2.35;
  state.moveMode = running ? 'RUNNING' : 'WALKING';
  state.noise = active ? (running ? 88 : 38) : 0;
  const nextX = camera.position.x + move.x * speed * dt;
  const nextZ = camera.position.z + move.z * speed * dt;
  if (canMoveTo(nextX, camera.position.z)) camera.position.x = nextX;
  if (canMoveTo(camera.position.x, nextZ)) camera.position.z = nextZ;
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.68, dt * 9);
  if (active) {
    state.bob += dt * speed * (running ? 2.1 : 1.65);
    camera.position.y += Math.sin(state.bob * 3.6) * (running ? 0.038 : 0.022);
  }
  if (state.flashlight) {
    state.battery = Math.max(0, state.battery - dt * 0.18);
    if (state.battery <= 0) state.flashlight = false;
  }
}

function updateLockerView() {
  if (!state.hidden || !state.currentLocker) return;
  state.noise = 0;
  const inside = state.currentLocker.group.localToWorld(new THREE.Vector3(0, 0.12, 0.39));
  camera.position.copy(inside);
  camera.rotation.y = state.lockerFrontYaw + state.lockerLookOffset;
  camera.rotation.x = 0;
  camera.rotation.z = 0;
}

function updateEnemy(dt, time) {
  if (state.ended) return;

  const dxToPlayer = camera.position.x - enemy.position.x;
  const dzToPlayer = camera.position.z - enemy.position.z;
  const distance = Math.hypot(dxToPlayer, dzToPlayer);
  const exitGraceActive = time < state.lockerExitGraceUntil;
  const canSensePlayer = !state.hidden && !exitGraceActive;

  // Heavy checks such as line-of-sight/capture should not run when the player is far away.
  // The enemy can still move, patrol, investigate, and react to sounds; only direct capture
  // and visual detection are gated by distance/facing first.
  let visible = false;
  let checkingSameCover = false;
  let nearbySharedCover = -1;

  if (canSensePlayer && distance <= PERFORMANCE.enemySenseFarDistance) {
    enemyEyeTemp.set(enemy.position.x, enemy.position.y + 1.7, enemy.position.z);
    playerEyeTemp.copy(camera.position);
    toPlayer.subVectors(playerEyeTemp, enemyEyeTemp);
    toPlayer.y = 0;

    enemyForwardTemp.set(0, 0, 1).applyQuaternion(enemy.quaternion);
    const facing = enemyForwardTemp.dot(toPlayer.normalize());

    if (distance < VISION_DISTANCE && facing > 0.84) {
      visible = hasLineOfSight(enemyEyeTemp, playerEyeTemp);
    }

    if (enemyData.mode === 'SEARCHING') {
      nearbySharedCover = coverPoints.findIndex((cover) =>
        Math.hypot(camera.position.x - cover.x, camera.position.z - cover.z) < 1.75
        && Math.hypot(enemy.position.x - cover.x, enemy.position.z - cover.z) < 2.45);
    }
  }

  if (nearbySharedCover >= 0 && (nearbySharedCover !== enemyData.coverCheckIndex || time >= enemyData.nextCoverCheckAt)) {
    enemyData.coverCheckIndex = nearbySharedCover;
    enemyData.coverCheckSuccess = Math.random() < 0.45 + enemyData.alertMemory * 0.35;
    enemyData.nextCoverCheckAt = time + 3;
    const playerDirection = Math.atan2(camera.position.x - enemy.position.x, camera.position.z - enemy.position.z);
    enemyData.coverLookYaw = playerDirection + (enemyData.coverCheckSuccess ? 0 : (Math.random() < 0.5 ? -0.72 : 0.72));
    enemyData.lookAroundUntil = Math.max(enemyData.lookAroundUntil, enemyData.nextCoverCheckAt + 0.35);
  } else if (nearbySharedCover < 0) {
    enemyData.coverCheckIndex = -1;
    enemyData.coverCheckSuccess = false;
  }
  checkingSameCover = nearbySharedCover >= 0 && enemyData.coverCheckSuccess;

  if (visible) {
    state.detection += (13 - distance) * 13 * (1 + enemyData.alertMemory * 0.45) * dt;
    if (time - enemyData.lastMemoryGainAt > 2.4) {
      enemyData.alertMemory = THREE.MathUtils.clamp(enemyData.alertMemory + 0.06, 0, 1);
      enemyData.lastMemoryGainAt = time;
    }
  } else {
    const baseCalmRate = ['INVESTIGATING', 'SEARCHING'].includes(enemyData.mode) ? 2.3 : 4.5;
    const calmRate = Math.max(0.65, baseCalmRate * (1 - enemyData.alertMemory * 0.82));
    state.detection -= calmRate * dt;
  }
  if (checkingSameCover) state.detection += (72 + enemyData.alertMemory * 35) * dt;
  enemyData.alertMemory = Math.max(0, enemyData.alertMemory - dt * 0.0025);
  if (canSensePlayer && distance < PERFORMANCE.enemyContactDistance) state.detection += 90 * dt;
  state.detection = THREE.MathUtils.clamp(state.detection, 0, 100);

  if (visible && state.detection <= 70) {
    setEnemyDestination(camera.position.x, camera.position.z, 'INVESTIGATING');
    enemyData.investigateUntil = time + 2.2;
    enemyData.investigateSpeed = Math.max(enemyData.investigateSpeed, state.detection > 25 ? 3.15 : 2.35);
  }

  if (enemyData.mode === 'INVESTIGATING' && time - enemyData.lastHeardAt > 0.85 && enemyData.path.length === 0) {
    enemyData.mode = 'SEARCHING';
    enemyData.searchUntil = Math.max(enemyData.searchUntil, time + 12);
    enemyData.lookBaseYaw = enemy.rotation.y;
    enemyData.lookAroundUntil = time + 1.1;
  }

  if (state.detection > 70 && !state.hidden) {
    state.alert = 'HUNTING';
    enemyData.mode = 'HUNTING';
    enemyData.speed = 5.2 + state.detection * 0.006;
    if (time > enemyData.repathAt) {
      setEnemyDestination(camera.position.x, camera.position.z, 'HUNTING');
      enemyData.repathAt = time + 0.48;
    }
  } else if (enemyData.mode === 'INVESTIGATING' && time < enemyData.investigateUntil) {
    state.alert = 'SUSPICIOUS';
    enemyData.speed = Math.max(enemyData.investigateSpeed, 2.45);
  } else if (enemyData.mode === 'SEARCHING' && time < enemyData.searchUntil) {
    state.alert = 'SUSPICIOUS';
    enemyData.speed = 2.15 + enemyData.alertMemory * 0.7;
  } else {
    if (enemyData.mode !== 'ROAMING') {
      enemyData.mode = 'ROAMING';
      enemyData.path = [];
    }
    state.alert = state.detection > 25 ? 'SUSPICIOUS' : 'UNNOTICED';
    enemyData.speed = state.alert === 'SUSPICIOUS' ? 2.75 : 1.3;
  }

  enemyData.isMoving = false;
  if (enemyData.path.length === 0) {
    if (enemyData.mode === 'SEARCHING' && time >= enemyData.lookAroundUntil) chooseCoverSearchRoute();
    else if (!['INVESTIGATING', 'SEARCHING'].includes(enemyData.mode)) chooseRandomEnemyRoute();
  }
  const target = enemyData.path[0];
  if (target && time >= enemyData.pauseUntil && time >= enemyData.lookAroundUntil) {
    enemyMoveDirection.set(target.x - enemy.position.x, 0, target.z - enemy.position.z);
    if (enemyMoveDirection.length() < 0.18) {
      enemyData.path.shift();
      if (enemyData.path.length === 0 && enemyData.mode === 'SEARCHING') {
        enemyData.lookBaseYaw = enemy.rotation.y;
        enemyData.lookAroundUntil = time + 0.9 + Math.random() * 1.2;
      }
    }
    else {
      enemyMoveDirection.normalize();
      enemy.position.addScaledVector(enemyMoveDirection, enemyData.speed * dt);
      enemy.rotation.y = Math.atan2(enemyMoveDirection.x, enemyMoveDirection.z);
      enemyData.isMoving = true;
    }
  }
  if (enemyData.mode === 'SEARCHING' && enemyData.path.length === 0 && time < enemyData.lookAroundUntil) {
    enemy.rotation.y = enemyData.lookBaseYaw + Math.sin(time * 3.1) * 1.05;
  }
  if (nearbySharedCover >= 0 && enemyData.mode === 'SEARCHING') {
    const turnDelta = Math.atan2(
      Math.sin(enemyData.coverLookYaw - enemy.rotation.y),
      Math.cos(enemyData.coverLookYaw - enemy.rotation.y),
    );
    enemy.rotation.y += turnDelta * Math.min(1, dt * 5.5);
  }
  enemy.position.y = enemyData.isMoving ? Math.abs(Math.sin(time * (enemyData.speed > 2 ? 5.5 : 3.5))) * 0.035 : 0;

  ui.dangerFlash.style.opacity = state.alert === 'HUNTING'
    ? String(0.13 + Math.sin(time * 7) * 0.07)
    : state.hidden && distance < 6 ? String(0.05 + Math.sin(time * 4) * 0.025) : '0';

  let clearAtCloseRange = false;
  if (canSensePlayer && distance < PERFORMANCE.enemyCaptureDistance) {
    enemyEyeTemp.set(enemy.position.x, enemy.position.y + 1.7, enemy.position.z);
    playerEyeTemp.copy(camera.position);
    clearAtCloseRange = hasLineOfSight(enemyEyeTemp, playerEyeTemp);
  }
  const fullyDetected = state.detection >= 99.5 && (visible || checkingSameCover);
  if (canSensePlayer && (clearAtCloseRange || fullyDetected)) startCaughtCutscene();
}

function updateInteraction() {
  state.nearLocker = null;
  let bestDistance = 1.5;
  for (const locker of lockers) {
    const distance = Math.hypot(camera.position.x - locker.x, camera.position.z - locker.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      state.nearLocker = locker;
    }
  }
  let prompt = '';
  const nearbyKey = keyItems.find((item) => !item.collected && camera.position.distanceTo(item.group.position) < 2.15);
  if (state.hidden) prompt = '[ E ] ロッカーから出る';
  else if (state.nearLocker) prompt = '[ E ] ロッカーの中に隠れる';
  else if (nearbyKey) prompt = `[ E ] 鍵を拾う（${state.keyCount} / ${REQUIRED_KEYS}）`;
  else if (horizontalDistance(camera.position, exitDoor.position) < 3.6) {
    prompt = state.keyCount >= REQUIRED_KEYS
      ? '[ E ] 鍵を使って脱出'
      : `[ E ] 出口（鍵 ${state.keyCount} / ${REQUIRED_KEYS}）`;
  }
  $('#prompt').textContent = prompt;
  const mobileAction = $('#mobile-action');
  const actionLabel = prompt.replace(/^\[ E \]\s*/, '');
  mobileAction.textContent = actionLabel || '調べる';
  mobileAction.classList.toggle('visible', mobileInput.active && Boolean(prompt) && !state.caught);
}

const alertLabels = { UNNOTICED: '未発見', SUSPICIOUS: '警戒中', HUNTING: '追跡中' };
const movementLabels = { WALKING: '歩行', RUNNING: '走行', HIDING: '隠れている' };
function updateHUD() {
  const noise = Math.round(state.noise);
  const detection = Math.round(state.detection);
  const battery = Math.ceil(state.battery);
  const moveMode = state.hidden ? 'HIDING' : state.moveMode;

  if (hudCache.noise !== noise) {
    hudCache.noise = noise;
    ui.noiseBar.style.width = `${noise}%`;
    ui.noiseValue.textContent = String(noise).padStart(2, '0');
  }
  if (hudCache.detection !== detection) {
    hudCache.detection = detection;
    ui.detectBar.style.width = `${detection}%`;
    ui.detectValue.textContent = String(detection).padStart(2, '0');
  }
  if (hudCache.alert !== state.alert) {
    hudCache.alert = state.alert;
    ui.alertText.textContent = alertLabels[state.alert];
    ui.alertText.parentElement.classList.toggle('danger', state.alert === 'HUNTING');
  }
  if (hudCache.moveMode !== moveMode) {
    hudCache.moveMode = moveMode;
    ui.moveMode.textContent = movementLabels[moveMode];
  }
  if (hudCache.battery !== battery) {
    hudCache.battery = battery;
    ui.batteryValue.textContent = `${battery}%`;
    ui.batteryBar.style.width = `${battery}%`;
  }
}

function updateLight(time) {
  flashlight.visible = state.flashlight && !state.hidden;
  fillLight.visible = flashlight.visible;
  lockerViewLight.visible = state.hidden;
  lockerViewLight.position.copy(camera.position);
  camera.getWorldDirection(forward);
  lockerViewLight.target.position.copy(camera.position).addScaledVector(forward, 5);
  flashlight.position.copy(camera.position).addScaledVector(forward, 0.12);
  flashlight.target.position.copy(camera.position).addScaledVector(forward, 8);
  fillLight.position.copy(camera.position);
  flashlight.intensity = (Math.random() < 0.006 ? 18 : 78) * (state.battery < 15 ? 0.55 + Math.sin(time * 17) * 0.35 : 1);
  for (const item of keyItems) {
    item.group.rotation.y = time * 0.9 + item.phase;
    item.group.position.y = item.baseY + Math.sin(time * 2 + item.phase) * 0.06;
  }
}

const minimap = $('#minimap');
const radar = minimap.getContext('2d');
function radarPoint(x, z) {
  return {
    x: ((x + (GRID_HALF_W + 0.5) * CELL) / (GRID_W * CELL)) * minimap.width,
    y: ((z + (GRID_HALF_H + 0.5) * CELL) / (GRID_H * CELL)) * minimap.height,
  };
}

function updateRadar(dt, time) {
  radar.clearRect(0, 0, minimap.width, minimap.height);
  radar.fillStyle = 'rgba(8,18,12,.72)';
  radar.fillRect(0, 0, minimap.width, minimap.height);
  radar.strokeStyle = 'rgba(96,137,110,.18)';
  radar.lineWidth = 1;
  for (let r = 1; r <= 3; r += 1) {
    radar.beginPath();
    radar.arc(minimap.width / 2, minimap.height / 2, r * 28, 0, Math.PI * 2);
    radar.stroke();
  }

  radar.fillStyle = 'rgba(94,126,105,.22)';
  const radarCellWidth = minimap.width / GRID_W;
  const radarCellHeight = minimap.height / GRID_H;
  for (const node of navNodes.values()) {
    const p = radarPoint(node.x, node.z);
    radar.fillRect(
      p.x - radarCellWidth * 0.47,
      p.y - radarCellHeight * 0.47,
      radarCellWidth * 0.94,
      radarCellHeight * 0.94,
    );
  }

  for (let i = soundEvents.length - 1; i >= 0; i -= 1) {
    const event = soundEvents[i];
    event.age += dt;
    if (event.age >= event.life) {
      soundEvents.splice(i, 1);
      continue;
    }
    const p = radarPoint(event.x, event.z);
    const progress = event.age / event.life;
    radar.strokeStyle = `rgba(225,181,78,${1 - progress})`;
    radar.lineWidth = 1.5;
    const hearingRadiusPixels = event.hearingRadius * 4.1;
    radar.beginPath();
    radar.arc(p.x, p.y, 2 + progress * hearingRadiusPixels, 0, Math.PI * 2);
    radar.stroke();
  }

  const playerPoint = radarPoint(camera.position.x, camera.position.z);
  radar.save();
  radar.translate(playerPoint.x, playerPoint.y);
  radar.rotate(-camera.rotation.y);
  radar.fillStyle = '#dce7df';
  radar.beginPath();
  radar.moveTo(0, -6);
  radar.lineTo(4.5, 5);
  radar.lineTo(-4.5, 5);
  radar.closePath();
  radar.fill();
  radar.restore();

  const enemyPoint = radarPoint(enemy.position.x, enemy.position.z);
  const radarForward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.quaternion);
  const visionDirection = Math.atan2(radarForward.z, radarForward.x);
  const visionHalfAngle = VISION_HALF_ANGLE;
  radar.beginPath();
  radar.moveTo(enemyPoint.x, enemyPoint.y);
  for (let i = 0; i <= 14; i += 1) {
    const angle = visionDirection - visionHalfAngle + (visionHalfAngle * 2 * i) / 14;
    const point = radarPoint(
      enemy.position.x + Math.cos(angle) * VISION_DISTANCE,
      enemy.position.z + Math.sin(angle) * VISION_DISTANCE,
    );
    radar.lineTo(point.x, point.y);
  }
  radar.closePath();
  radar.fillStyle = state.alert === 'HUNTING' ? 'rgba(239,65,52,.24)' : 'rgba(208,82,62,.12)';
  radar.fill();
  radar.strokeStyle = 'rgba(239,92,76,.38)';
  radar.lineWidth = 1;
  radar.stroke();

  radar.fillStyle = `rgba(239,65,52,${0.72 + Math.sin(time * 6) * 0.25})`;
  radar.shadowColor = '#ef4134';
  radar.shadowBlur = 7;
  radar.beginPath();
  radar.arc(enemyPoint.x, enemyPoint.y, 3.4, 0, Math.PI * 2);
  radar.fill();
  radar.shadowBlur = 0;

  const sweep = time * 0.85;
  radar.strokeStyle = 'rgba(105,190,137,.22)';
  radar.beginPath();
  radar.moveTo(playerPoint.x, playerPoint.y);
  radar.lineTo(playerPoint.x + Math.cos(sweep) * 80, playerPoint.y + Math.sin(sweep) * 80);
  radar.stroke();
}

let nextVisionUpdate = 0;
let radarAccumulator = 1;
let hudAccumulator = 1;
let lightAccumulator = 1;
let lastLightUpdateTime = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  const time = clock.elapsedTime;
  if (state.caught) {
    updateCaughtCutscene(time);
  } else if (state.started && !state.ended && !state.settingsOpen) {
    updatePlayer(dt);
    updateLockerView();
    updateEnemy(dt, time);
    if (PERFORMANCE.enemyVisionEnabled && time >= nextVisionUpdate) {
      updateEnemyVision();
      nextVisionUpdate = time + 1 / 8;
    }
    updateInteraction();
    hudAccumulator += dt;
    if (hudAccumulator >= 1 / PERFORMANCE.hudHz) {
      updateHUD();
      hudAccumulator = 0;
    }
    lightAccumulator += dt;
    if (lightAccumulator >= 1 / PERFORMANCE.lightAnimationHz) {
      updateLight(time);
      lastLightUpdateTime = time;
      lightAccumulator = 0;
    }
    updateAudio(time);
  }
  radarAccumulator += dt;
  if (PERFORMANCE.radarEnabled && radarAccumulator >= 1 / PERFORMANCE.radarHz) {
    updateRadar(radarAccumulator, time);
    radarAccumulator = 0;
  }
  renderer.render(scene, camera);
}

chooseRandomEnemyRoute();
animate();

addEventListener('resize', resizeRenderer);
