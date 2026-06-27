import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const $ = (selector) => document.querySelector(selector);
const touchDevice = matchMedia('(hover: none) and (pointer: coarse)').matches;
const PERF_BUILD_ID = 'MOBILE-COIN-SHOP-FIX-20260627';
const INTERNAL_MAX_W = 1920;
const INTERNAL_MAX_H = 1080;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b08);
scene.fog = new THREE.FogExp2(0x0a0e0a, 0.018);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, touchDevice ? 60 : 80);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const RESOLUTION_TIERS = [1, 0.85, 0.7, 0.55];
let resolutionTierIndex = 0;
let dynamicResolutionScale = RESOLUTION_TIERS[resolutionTierIndex];
let lastResolutionAdjustAt = performance.now();
let highFpsSince = performance.now();
function getGameViewport() {
  const portraitPhone = touchDevice && window.innerHeight > window.innerWidth;
  return {
    width: Math.max(1, portraitPhone ? window.innerHeight : window.innerWidth),
    height: Math.max(1, portraitPhone ? window.innerWidth : window.innerHeight),
    portraitPhone,
  };
}
function applyRenderCap() {
  const { width: viewW, height: viewH, portraitPhone } = getGameViewport();
  const scale = Math.min(1, INTERNAL_MAX_W / viewW, INTERNAL_MAX_H / viewH) * dynamicResolutionScale;
  const renderW = Math.max(320, Math.round(viewW * scale));
  const renderH = Math.max(180, Math.round(viewH * scale));
  camera.aspect = viewW / viewH;
  camera.updateProjectionMatrix();
  renderer.setSize(renderW, renderH, false);
  renderer.domElement.style.width = portraitPhone ? '100vh' : '100vw';
  renderer.domElement.style.height = portraitPhone ? '100vw' : '100vh';
  renderer.domElement.dataset.renderCap = `${renderW}x${renderH}`;
  document.body.classList.toggle('mobile-portrait-landscape', portraitPhone);
}
applyRenderCap();
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
$('#game').append(renderer.domElement);
// Mobile play protection: disable text selection, long-press menu, pinch-zoom, and double-tap zoom.
document.addEventListener('contextmenu', (event) => {
  if (touchDevice) event.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });
document.addEventListener('touchmove', (event) => {
  if (touchDevice && event.touches.length > 1) event.preventDefault();
}, { passive: false });
let lastTouchEndAt = 0;
document.addEventListener('touchend', (event) => {
  const now = performance.now();
  if (touchDevice && now - lastTouchEndAt < 320) event.preventDefault();
  lastTouchEndAt = now;
}, { passive: false });
const perfPanel = $('#perf-panel');
let perfFrames = 0;
let perfLast = performance.now();
let perfFps = 0;

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
  hp: 100,
  coins: 0,
  nearShop: false,
  shopOpen: false,
  nextCoinAt: 0,
  noiseMultiplier: 1,
  breakerDurationMultiplier: 1,
  lightRangeMultiplier: 1,
  screenFlashUntil: 0,
  screenFlashColor: 'red',
  nextHealAt: 0,
  breakerOn: false,
  breakerOutAt: Infinity,
  seatedUntil: 0,
  nextRoarAt: 0,
  roarUntil: 0,
  shakeUntil: 0,
  shakePower: 0,
  nextSoundRippleAt: 0,
  nextTrapAt: 0,
  detection: 0,
  alert: 'UNNOTICED',
  moveMode: 'WALKING',
  noise: 0,
  nearLocker: null,
  nearBreaker: false,
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
const sonarReveals = [];
const noiseTraps = [];
const healItems = [];
const coinItems = [];
let shop = null;
const CELL = 4;
const GRID_W = 13;
const GRID_H = 19;
const GRID_HALF_W = (GRID_W - 1) / 2;
const GRID_HALF_H = (GRID_H - 1) / 2;
const REQUIRED_KEYS = 5;
const walkable = new Set();
const navNodes = new Map();

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();
function loadTexture(name, repeatX = 1, repeatY = 1) {
  const key = `${name}:${repeatX}:${repeatY}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const tex = textureLoader.load(`./textures/${name}`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  textureCache.set(key, tex);
  return tex;
}
const material = (color, roughness = 0.82, metalness = 0.05, map = null) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, map });
const wallMat = material(0x7d877f, 0.94, 0.02, loadTexture('school_wall_concrete.png', 2, 2));
const trimMat = material(0x31443e, 0.72, 0.04, loadTexture('school_wall_concrete.png', 1, 1));
const floorMat = material(0x8fa39a, 0.68, 0.02, loadTexture('school_floor_wet_tile.png', 2, 2));
const classroomFloorMat = material(0xa0744b, 0.72, 0.02, loadTexture('classroom_wood_floor.png', 2, 2));
const ceilingMat = material(0xd6d9d0, 0.88, 0.02, loadTexture('ceiling_tile_stained.png', 2, 2));
const metalMat = material(0x7c8780, 0.5, 0.55, loadTexture('locker_scratched_metal.png', 1, 1));
const darkMat = material(0x080b09, 0.82);
const doorMat = material(0x9a7853, 0.76, 0.04, loadTexture('old_door_wood.png', 1, 1));
const signMat = material(0x267556, 0.35, 0.03, loadTexture('blackboard_green.png', 1, 1));
function makeSonarTexture(base = '#121713', vein = '#2e0b08', shine = '#5f6b61') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1150; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const l = 7 + Math.random() * 32;
    ctx.strokeStyle = Math.random() < 0.72 ? 'rgba(105,118,106,.12)' : 'rgba(10,12,10,.35)';
    ctx.lineWidth = 0.55 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.sin(y * 0.08) * l, y + l);
    ctx.stroke();
  }
  for (let i = 0; i < 42; i += 1) {
    const x = 24 + Math.random() * 208;
    ctx.strokeStyle = `${vein}${Math.random() < 0.5 ? 'cc' : '88'}`;
    ctx.lineWidth = 0.7 + Math.random() * 1.7;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 16) ctx.lineTo(x + Math.sin(y * 0.055 + i) * (5 + Math.random() * 6), y);
    ctx.stroke();
  }
  const gloss = ctx.createRadialGradient(112, 70, 8, 112, 70, 150);
  gloss.addColorStop(0, `${shine}55`);
  gloss.addColorStop(0.45, 'rgba(80,92,84,.08)');
  gloss.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.6, 2.8);
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
function makeSonarNormalTexture(strength = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const n = (
        Math.sin(x * 0.19) * 0.35 +
        Math.sin(y * 0.23) * 0.28 +
        Math.sin((x + y) * 0.08) * 0.22 +
        (Math.random() - 0.5) * 0.38
      ) * strength;
      const i = (y * 256 + x) * 4;
      image.data[i] = THREE.MathUtils.clamp(128 + n * 44, 0, 255);
      image.data[i + 1] = THREE.MathUtils.clamp(128 + Math.sin(y * 0.11) * 36 * strength, 0, 255);
      image.data[i + 2] = 224;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.2, 3.4);
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
const sonarSkinNormal = makeSonarNormalTexture(1.1);
const sonarEarNormal = makeSonarNormalTexture(0.72);
const sonarSkinMat = new THREE.MeshStandardMaterial({
  color: 0x1d241f,
  roughness: 0.36,
  metalness: 0.02,
  map: makeSonarTexture('#101612', '#30100d', '#6f7b70'),
  normalMap: sonarSkinNormal,
  normalScale: new THREE.Vector2(0.42, 0.72),
  emissive: 0x020302,
  emissiveIntensity: 0.04,
});
const sonarEarMat = new THREE.MeshStandardMaterial({
  color: 0x7a2b22,
  roughness: 0.64,
  metalness: 0.01,
  map: makeSonarTexture('#32100e', '#8b342a', '#a45348'),
  normalMap: sonarEarNormal,
  normalScale: new THREE.Vector2(0.35, 0.55),
  side: THREE.DoubleSide,
});
const sonarMouthMat = new THREE.MeshStandardMaterial({
  color: 0x3d0605,
  roughness: 0.3,
  metalness: 0.01,
  map: makeSonarTexture('#210303', '#9a2119', '#70140f'),
  normalMap: sonarSkinNormal,
  normalScale: new THREE.Vector2(0.5, 0.65),
  emissive: 0x260302,
  emissiveIntensity: 0.18,
});

function worldFromGrid(gx, gz) {
  return new THREE.Vector3((gx - GRID_HALF_W) * CELL, 0, (gz - GRID_HALF_H) * CELL);
}

function gridKey(gx, gz) {
  return `${gx},${gz}`;
}

function carve(gx, gz) {
  if (gx >= 0 && gx < GRID_W && gz >= 0 && gz < GRID_H) walkable.add(gridKey(gx, gz));
}

const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const schoolRooms = [
  { id: 'breaker', name: 'ブレーカー室', gx0: 1, gx1: 3, gz0: 15, gz1: 17, connector: [[4, 16], [5, 16], [6, 16]], sign: { gx: 3.55, gz: 16, side: 'east' } },
  { id: 'classroom-a', name: '1年A組', gx0: 9, gx1: 11, gz0: 14, gz1: 17, connector: [[8, 16], [7, 16], [6, 16]], sign: { gx: 8.45, gz: 16, side: 'west' } },
  { id: 'science', name: '理科室', gx0: 1, gx1: 3, gz0: 1, gz1: 3, connector: [[4, 2], [5, 2], [6, 2]], sign: { gx: 3.55, gz: 2, side: 'east' } },
  { id: 'nurse', name: '保健室', gx0: 9, gx1: 11, gz0: 1, gz1: 3, connector: [[8, 2], [7, 2], [6, 2]], sign: { gx: 8.45, gz: 2, side: 'west' } },
  { id: 'staff', name: '職員室', gx0: 1, gx1: 4, gz0: 8, gz1: 10, connector: [[5, 9], [6, 9]], sign: { gx: 4.55, gz: 9, side: 'east' } },
  { id: 'music', name: '音楽室', gx0: 8, gx1: 11, gz0: 8, gz1: 10, connector: [[7, 9], [6, 9]], sign: { gx: 7.45, gz: 9, side: 'west' } },
];

function getRoomAt(gx, gz) {
  return schoolRooms.find((room) => gx >= room.gx0 && gx <= room.gx1 && gz >= room.gz0 && gz <= room.gz1) || null;
}

// Randomized school layout: a connected spine, classrooms, dead ends, and uneven loops.
for (let gz = 0; gz < GRID_H; gz += 1) carve(6, gz);
for (const gz of [2, 5, 8, 11, 14, 17]) {
  const leftEnd = 1 + Math.floor(Math.random() * 2);
  const rightEnd = 10 + Math.floor(Math.random() * 2);
  for (let gx = leftEnd; gx <= rightEnd; gx += 1) carve(gx, gz);
}
for (const gx of [1, 3, 9, 11]) {
  let z = 2 + Math.floor(Math.random() * 2);
  while (z < GRID_H - 1) {
    const length = 3 + Math.floor(Math.random() * 5);
    for (let step = 0; step < length && z < GRID_H - 1; step += 1, z += 1) carve(gx, z);
    z += 1 + Math.floor(Math.random() * 2);
  }
}
for (let i = 0; i < 16; i += 1) {
  const gx = 1 + Math.floor(Math.random() * (GRID_W - 2));
  const gz = 1 + Math.floor(Math.random() * (GRID_H - 2));
  if (walkable.has(gridKey(gx, gz))) {
    const [dx, dz] = directions[Math.floor(Math.random() * directions.length)];
    carve(gx + dx, gz + dz);
  }
}
for (let i = 0; i < 26; i += 1) {
  const seeds = [...walkable];
  const [startGx, startGz] = seeds[Math.floor(Math.random() * seeds.length)].split(',').map(Number);
  const [dx, dz] = directions[Math.floor(Math.random() * directions.length)];
  const length = 2 + Math.floor(Math.random() * 5);
  for (let step = 1; step <= length; step += 1) {
    const gx = startGx + dx * step;
    const gz = startGz + dz * step;
    if (gx <= 0 || gx >= GRID_W - 1 || gz <= 0 || gz >= GRID_H - 1) break;
    carve(gx, gz);
    if (Math.random() < 0.22) {
      const [branchDx, branchDz] = directions[Math.floor(Math.random() * directions.length)];
      carve(gx + branchDx, gz + branchDz);
    }
  }
}
carve(1, 17);
carve(2, 17);
carve(10, 1);
carve(11, 1);

for (const room of schoolRooms) {
  for (let gx = room.gx0; gx <= room.gx1; gx += 1) {
    for (let gz = room.gz0; gz <= room.gz1; gz += 1) carve(gx, gz);
  }
  for (const [gx, gz] of room.connector) carve(gx, gz);
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

function roomCenter(room) {
  return worldFromGrid((room.gx0 + room.gx1) / 2, (room.gz0 + room.gz1) / 2);
}

function addRoomBoundaryWalls(room) {
  const doorZ = Math.round(room.sign.gz);
  const doorOnEast = room.sign.side === 'east';
  const doorOnWest = room.sign.side === 'west';
  for (let gz = room.gz0; gz <= room.gz1; gz += 1) {
    const west = worldFromGrid(room.gx0, gz);
    const east = worldFromGrid(room.gx1, gz);
    if (!(doorOnWest && gz === doorZ)) {
      addBox(west.x - CELL / 2, 2.05, west.z, 0.18, 4.2, CELL + 0.18, wallMat, true, true, false);
    }
    if (!(doorOnEast && gz === doorZ)) {
      addBox(east.x + CELL / 2, 2.05, east.z, 0.18, 4.2, CELL + 0.18, wallMat, true, true, false);
    }
  }
  for (let gx = room.gx0; gx <= room.gx1; gx += 1) {
    const north = worldFromGrid(gx, room.gz0);
    const south = worldFromGrid(gx, room.gz1);
    addBox(north.x, 2.05, north.z - CELL / 2, CELL + 0.18, 4.2, 0.18, wallMat, true, true, false);
    addBox(south.x, 2.05, south.z + CELL / 2, CELL + 0.18, 4.2, 0.18, wallMat, true, true, false);
  }
}

const schoolLights = [];
let corridorLightCount = 0;
for (const key of walkable) {
  const [gx, gz] = key.split(',').map(Number);
  const pos = worldFromGrid(gx, gz);
  navNodes.set(key, { key, gx, gz, x: pos.x, z: pos.z });
  const room = getRoomAt(gx, gz);
  addBox(pos.x, -0.12, pos.z, CELL + 0.04, 0.25, CELL + 0.04, room ? classroomFloorMat : floorMat, false, false, false);
  addBox(pos.x, 4.25, pos.z, CELL + 0.05, 0.18, CELL + 0.05, ceilingMat, false, false, false);

  for (const [dx, dz] of directions) {
    if (walkable.has(gridKey(gx + dx, gz + dz))) continue;
    if (dx !== 0) addBox(pos.x + dx * CELL / 2, 2.05, pos.z, 0.18, 4.2, CELL + 0.18, wallMat, true, true);
    else addBox(pos.x, 2.05, pos.z + dz * CELL / 2, CELL + 0.18, 4.2, 0.18, wallMat, true, true);
  }

  if ((gx * 5 + gz * 3) % 9 === 0) {
    const fixture = addBox(pos.x, 4.08, pos.z, 1.25, 0.08, 0.28, material(0xdfe6d5, 0.28), false, false, false);
    fixture.material.emissive = new THREE.Color(0x68745d);
    fixture.material.emissiveIntensity = 1.4;
    if (corridorLightCount < 4) {
      const light = new THREE.PointLight(0xc2cbaa, 4.5, 8, 1.7);
      light.position.set(pos.x, 3.82, pos.z);
      scene.add(light);
      schoolLights.push(light);
      corridorLightCount += 1;
    }
  }

  // Wall-side decorative doors were removed because they looked usable but had no interaction.
}

for (const room of schoolRooms) addRoomBoundaryWalls(room);

const hemisphereLight = new THREE.HemisphereLight(0x78877a, 0x111511, 0.54);
const ambientLight = new THREE.AmbientLight(0x354139, 0.38);
scene.add(hemisphereLight);
scene.add(ambientLight);

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

function isLockerEntranceBlocked(gx, gz) {
  const pos = worldFromGrid(gx, gz);
  return schoolRooms.some((room) => {
    const sign = worldFromGrid(room.sign.gx, room.sign.gz);
    if (Math.hypot(pos.x - sign.x, pos.z - sign.z) < 3.15) return true;
    return room.connector.some(([cx, cz]) => Math.hypot(gx - cx, gz - cz) < 1.25);
  });
}

function makeSafeLocker(gx, gz, wallSide) {
  if (!walkable.has(gridKey(gx, gz)) || isLockerEntranceBlocked(gx, gz)) return null;
  const sideDelta = {
    west: [-1, 0],
    east: [1, 0],
    north: [0, -1],
    south: [0, 1],
  }[wallSide];
  if (!sideDelta || walkable.has(gridKey(gx + sideDelta[0], gz + sideDelta[1]))) return null;
  return makeLocker(gx, gz, wallSide);
}

[
  [1, 4, 'west'], [11, 4, 'east'], [1, 10, 'west'], [11, 12, 'east'],
  [2, 6, 'west'], [10, 6, 'east'], [2, 12, 'west'], [10, 14, 'east'],
].forEach(([gx, gz, wallSide]) => makeSafeLocker(gx, gz, wallSide));

// Cover objects leave the navigation centerline open while breaking sight lines.
const coverPoints = [];
const crateMat = material(0x443b2e, 0.92);
const cabinetMat = material(0x303a34, 0.5, 0.55);
function addCover(gx, gz, offsetX, offsetZ, type = 'crate') {
  // 通路中央の障害物は敵の経路を詰まらせるため、部屋内だけに置く。
  const room = getRoomAt(gx, gz);
  if (!room) return;
  const cell = worldFromGrid(gx, gz);
  const center = roomCenter(room);
  const awayX = Math.sign(cell.x - center.x) || Math.sign(offsetX);
  const awayZ = Math.sign(cell.z - center.z) || Math.sign(offsetZ);
  const x = cell.x + (awayX ? awayX * Math.max(1.18, Math.abs(offsetX)) : offsetX);
  const z = cell.z + (awayZ ? awayZ * Math.max(1.18, Math.abs(offsetZ)) : offsetZ);
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

function coverSearchNodes(cover) {
  const spots = [
    [cover.x + 2.2, cover.z],
    [cover.x - 2.2, cover.z],
    [cover.x, cover.z + 2.2],
    [cover.x, cover.z - 2.2],
    [cover.x + 1.55, cover.z + 1.55],
    [cover.x - 1.55, cover.z + 1.55],
    [cover.x + 1.55, cover.z - 1.55],
    [cover.x - 1.55, cover.z - 1.55],
  ];
  const seen = new Set();
  return spots
    .map(([x, z]) => nearestNode(x, z))
    .filter((node) => {
      if (!node || seen.has(node.key)) return false;
      seen.add(node.key);
      return Math.hypot(node.x - cover.x, node.z - cover.z) < 5.4;
    });
}

const walkableNodes = [...walkable].map((key) => {
  const [gx, gz] = key.split(',').map(Number);
  const pos = worldFromGrid(gx, gz);
  return { gx, gz, x: pos.x, z: pos.z, key };
});

function hasColliderOverlap(x, z, padding = 0.42) {
  return colliders.some((collider) =>
    Math.abs(x - collider.x) < collider.hw + padding && Math.abs(z - collider.z) < collider.hz + padding);
}

function isSafeSpawnPoint(x, z, padding = 0.46) {
  return !hasColliderOverlap(x, z, padding);
}

function findSafeNode(filter = () => true, fallback = null) {
  const choices = walkableNodes.filter((node) => filter(node) && isSafeSpawnPoint(node.x, node.z, 0.48));
  return choices[Math.floor(Math.random() * choices.length)] || fallback || walkableNodes.find((node) => isSafeSpawnPoint(node.x, node.z, 0.48)) || walkableNodes[0];
}
const exitRooms = schoolRooms.filter((room) => room.id !== 'breaker');
const exitRoom = exitRooms[Math.floor(Math.random() * exitRooms.length)] || schoolRooms[1];
const exitRoomCenter = roomCenter(exitRoom);
const exitWallSide = exitRoom.sign.side === 'east' ? 'west' : 'east';
const exitWallX = exitWallSide === 'west'
  ? worldFromGrid(exitRoom.gx0, exitRoom.gz0).x - CELL / 2 + 0.11
  : worldFromGrid(exitRoom.gx1, exitRoom.gz1).x + CELL / 2 - 0.11;
const exitPosition = new THREE.Vector3(exitWallX, 0, exitRoomCenter.z);
const exitNode = nearestNode(exitRoomCenter.x, exitRoomCenter.z) || walkableNodes[0];
const exitDoor = addBox(exitPosition.x, 1.45, exitPosition.z, 0.16, 2.35, 1.35, material(0x303a33, 0.48, 0.6), false, false, false);
addBox(exitPosition.x, 3.05, exitPosition.z, 0.09, 0.32, 1.05, material(0x1d6243, 0.35), false, false, false);
const exitLight = new THREE.PointLight(0x3acb88, 4.5, 6);
exitLight.position.set(exitPosition.x, 2.75, exitPosition.z);
scene.add(exitLight);
schoolLights.push(exitLight);

const breakerRoom = schoolRooms.find((room) => room.id === 'breaker');
const breakerCandidates = walkableNodes.filter((node) =>
  node.key !== exitNode.key && breakerRoom &&
  node.gx === breakerRoom.gx0 &&
  node.gz >= breakerRoom.gz0 && node.gz <= breakerRoom.gz1);
const breakerNode = breakerCandidates[Math.floor(Math.random() * breakerCandidates.length)] || walkableNodes[walkableNodes.length - 1];
const breakerPosition = new THREE.Vector3(breakerNode.x, 0, breakerNode.z);
// ブレーカーは必ずブレーカー室の西側の壁へ貼り付ける。床置き・中央置きは禁止。
const breakerWallSide = -1;
const breakerPanel = addBox(
  breakerPosition.x + breakerWallSide * 1.72,
  1.45,
  breakerPosition.z,
  0.18,
  1.35,
  0.82,
  material(0x252b28, 0.55, 0.45),
  true,
  false,
  false,
);
const breakerSwitch = addBox(
  breakerPosition.x + breakerWallSide * 1.58,
  1.78,
  breakerPosition.z,
  0.05,
  0.2,
  0.46,
  material(0xff6d4d, 0.32),
  false,
  false,
  false,
);
const breakerLight = new THREE.PointLight(0x7dffad, 0.35, 3.6);
breakerLight.position.set(breakerPosition.x + breakerWallSide * 1.35, 2.2, breakerPosition.z);
scene.add(breakerLight);
const breakerPlateSide = breakerWallSide < 0 ? 'west' : 'east';

const deskTopMat = material(0x8d6846, 0.76, 0.04, loadTexture('old_door_wood.png', 1, 1));
const chairMat = material(0x515a55, 0.58, 0.18, loadTexture('locker_scratched_metal.png', 1, 1));
const paperMat = material(0xd8d4bd, 0.92, 0.01);
const bookMat = material(0x344d70, 0.72, 0.02);

function addDeskSet(x, z, rot = 0) {
  const group = new THREE.Group();
  group.rotation.y = rot;
  localBox(group, 0, 0.72, 0, 1.18, 0.1, 0.7, deskTopMat);
  for (const sx of [-0.46, 0.46]) {
    for (const sz of [-0.25, 0.25]) localBox(group, sx, 0.36, sz, 0.07, 0.68, 0.07, chairMat);
  }
  localBox(group, -0.22, 0.8, -0.12, 0.32, 0.025, 0.22, paperMat);
  localBox(group, 0.26, 0.83, 0.16, 0.26, 0.06, 0.18, bookMat);
  localBox(group, 0, 0.43, 0.72, 0.56, 0.1, 0.42, chairMat);
  localBox(group, 0, 0.76, 0.87, 0.56, 0.62, 0.08, chairMat);
  group.position.set(x, 0, z);
  scene.add(group);
  colliders.push({ x, z, hw: Math.abs(Math.cos(rot)) > 0.5 ? 0.68 : 0.48, hz: Math.abs(Math.cos(rot)) > 0.5 ? 0.48 : 0.68 });
  return group;
}

function addShelf(x, z, w = 1.8, rot = 0) {
  const group = new THREE.Group();
  group.rotation.y = rot;
  localBox(group, 0, 0.92, 0, w, 1.84, 0.34, cabinetMat);
  for (let y = 0.36; y <= 1.48; y += 0.36) localBox(group, 0, y, 0.19, w * 0.88, 0.045, 0.045, darkMat);
  for (let i = 0; i < 5; i += 1) localBox(group, -w * 0.34 + i * w * 0.17, 1.05 + (i % 2) * 0.32, 0.21, 0.1, 0.32, 0.08, bookMat);
  group.position.set(x, 0, z);
  scene.add(group);
  colliders.push({ x, z, hw: Math.abs(Math.cos(rot)) > 0.5 ? w / 2 : 0.22, hz: Math.abs(Math.cos(rot)) > 0.5 ? 0.22 : w / 2 });
  return group;
}

function addFireExtinguisher(x, z, rot = 0) {
  const group = new THREE.Group();
  group.rotation.y = rot;
  localBox(group, 0, 0.68, 0, 0.34, 1.0, 0.18, material(0x5b1712, 0.42, 0.08), false);
  localBox(group, 0, 1.22, 0.01, 0.42, 0.14, 0.2, material(0x8a2b20, 0.35, 0.08), false);
  localBox(group, 0, 0.66, 0.12, 0.24, 0.34, 0.02, paperMat, false);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function addSinkRow(x, z, rot = 0) {
  const group = new THREE.Group();
  group.rotation.y = rot;
  localBox(group, 0, 0.78, 0, 2.2, 0.18, 0.48, material(0x707a73, 0.45, 0.28), false);
  localBox(group, 0, 0.46, -0.18, 2.2, 0.72, 0.12, material(0x4d5650, 0.5, 0.18), false);
  for (let i = 0; i < 3; i += 1) {
    const px = -0.72 + i * 0.72;
    localBox(group, px, 0.91, 0.02, 0.44, 0.035, 0.28, material(0x202824, 0.38, 0.38), false);
    localBox(group, px, 1.1, -0.12, 0.045, 0.26, 0.045, metalMat, false);
  }
  group.position.set(x, 0, z);
  scene.add(group);
  colliders.push({ x, z, hw: Math.abs(Math.cos(rot)) > 0.5 ? 1.16 : 0.28, hz: Math.abs(Math.cos(rot)) > 0.5 ? 0.28 : 1.16 });
  return group;
}

function addNightWindow(x, z, rot = 0, w = 1.7) {
  const group = new THREE.Group();
  group.rotation.y = rot;
  const glass = material(0x172025, 0.25, 0.12);
  glass.emissive = new THREE.Color(0x26333b);
  glass.emissiveIntensity = 0.42;
  localBox(group, 0, 2.15, 0, w, 0.82, 0.035, glass, false);
  localBox(group, 0, 2.15, 0.025, w + 0.14, 0.055, 0.045, metalMat, false);
  localBox(group, 0, 2.56, 0.025, w + 0.14, 0.055, 0.045, metalMat, false);
  localBox(group, 0, 1.74, 0.025, w + 0.14, 0.055, 0.045, metalMat, false);
  localBox(group, 0, 2.15, 0.03, 0.055, 0.86, 0.045, metalMat, false);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function addRoomFixtures(room) {
  const center = roomCenter(room);
  const backZ = worldFromGrid(room.gx0, room.gz0).z - CELL / 2 + 0.24;
  const frontZ = worldFromGrid(room.gx0, room.gz1).z + CELL / 2 - 0.28;
  if (room.id !== 'breaker') {
    addDeskSet(center.x - 1.05, center.z - 1.08, Math.random() < 0.5 ? 0 : Math.PI);
    addDeskSet(center.x + 1.05, center.z - 1.08, Math.random() < 0.5 ? 0 : Math.PI);
    if (room.gx1 - room.gx0 >= 3) addDeskSet(center.x, center.z + 0.5, Math.PI / 2);
    // Furniture is kept near room edges so entrances and walking routes stay playable.
    addBox(center.x, 1.55, backZ, 2.6, 1.05, 0.08, signMat, false, false, false);
    addShelf(center.x, frontZ, 1.7, 0);
    if (room.id === 'science') {
      addBox(center.x, 0.95, center.z + 1.05, 1.75, 0.14, 0.72, metalMat, true, false, false);
      addBox(center.x - 0.45, 1.14, center.z + 1.05, 0.22, 0.22, 0.22, material(0x355f72, 0.28, 0.02), false, false, false);
      addSinkRow(center.x + 0.95, center.z + 1.18, Math.PI / 2);
    } else if (room.id === 'nurse') {
      addBox(center.x + 0.78, 0.62, center.z + 1.18, 1.65, 0.32, 0.74, material(0xd8d8cf, 0.68, 0.02), true, false, false);
      addBox(center.x + 0.18, 0.95, center.z + 1.18, 0.42, 0.35, 0.68, paperMat, false, false, false);
    } else if (room.id === 'music') {
      addBox(center.x - 0.95, 0.78, center.z + 1.1, 1.15, 1.15, 0.28, material(0x3d2a1d, 0.7, 0.04), true, false, false);
      for (let i = 0; i < 4; i += 1) addBox(center.x - 1.25 + i * 0.2, 1.47, center.z + 1.26, 0.055, 0.38, 0.035, paperMat, false, false, false);
    }
    const sideX = room.sign.side === 'east'
      ? worldFromGrid(room.gx0, room.gz0).x - CELL / 2 + 0.08
      : worldFromGrid(room.gx1, room.gz1).x + CELL / 2 - 0.08;
    addNightWindow(sideX, center.z - 0.9, room.sign.side === 'east' ? Math.PI / 2 : -Math.PI / 2, 1.35);
  } else {
    addBox(center.x, 0.58, center.z + 1.1, 1.7, 1.16, 0.7, metalMat, true, false, false);
    addShelf(center.x - 0.92, center.z - 0.92, 1.2, Math.PI / 2);
  }
}

function addCorridorDetails() {
  addSinkRow(worldFromGrid(6, 8).x - 1.36, worldFromGrid(6, 8).z + 1.45, 0);
  addSinkRow(worldFromGrid(6, 13).x + 1.36, worldFromGrid(6, 13).z - 1.45, Math.PI);
  addFireExtinguisher(worldFromGrid(6, 5).x + 1.72, worldFromGrid(6, 5).z, -Math.PI / 2);
  addFireExtinguisher(worldFromGrid(6, 15).x - 1.72, worldFromGrid(6, 15).z, Math.PI / 2);
}

function addWallPlate(text, plateInfo) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(235, 239, 222, .94)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#3b4c43';
  context.lineWidth = 10;
  context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  context.fillStyle = '#203028';
  context.font = 'bold 58px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.55), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  const pos = worldFromGrid(plateInfo.gx, plateInfo.gz);
  const offset = plateInfo.side === 'east' ? 0.08 : -0.08;
  mesh.position.set(pos.x + offset, 2.55, pos.z);
  mesh.rotation.y = plateInfo.side === 'east' ? Math.PI / 2 : -Math.PI / 2;
  scene.add(mesh);
}

for (const room of schoolRooms) {
  addRoomFixtures(room);
  addWallPlate(room.name, room.sign);
}
addCorridorDetails();

const exitCounterCanvas = document.createElement('canvas');
exitCounterCanvas.width = 512;
exitCounterCanvas.height = 128;
const exitCounterContext = exitCounterCanvas.getContext('2d');
const exitCounterTexture = new THREE.CanvasTexture(exitCounterCanvas);
exitCounterTexture.colorSpace = THREE.SRGBColorSpace;
const exitCounter = new THREE.Mesh(
  new THREE.PlaneGeometry(3.8, 0.95),
  new THREE.MeshBasicMaterial({ map: exitCounterTexture, transparent: true, depthTest: true }),
);
const exitPlateOffset = exitWallSide === 'west' ? 0.105 : -0.105;
exitCounter.position.set(exitPosition.x + exitPlateOffset, 3.2, exitPosition.z);
exitCounter.rotation.y = exitWallSide === 'west' ? Math.PI / 2 : -Math.PI / 2;
scene.add(exitCounter);

function makeWallTextPlate(text, x, y, z, side, width = 1.35, height = 0.38, bg = 'rgba(235, 239, 222, .94)', fg = '#203028') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#3b4c43';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.fillStyle = fg;
  ctx.font = 'bold 58px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  const offset = side === 'west' ? 0.108 : -0.108;
  mesh.position.set(x + offset, y, z);
  mesh.rotation.y = side === 'west' ? Math.PI / 2 : -Math.PI / 2;
  scene.add(mesh);
  return mesh;
}
makeWallTextPlate('出口', exitPosition.x, 2.35, exitPosition.z, exitWallSide, 1.15, 0.36);
makeWallTextPlate('ブレーカー', breakerPanel.position.x, 2.38, breakerPanel.position.z, breakerPlateSide, 1.55, 0.38, 'rgba(238, 229, 198, .94)', '#2f2a1d');

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

// Five keys are sampled from safe positions that do not overlap furniture, lockers, walls, breaker, or exit.
const keyOffsets = [
  [0, 0], [0.72, 0], [-0.72, 0], [0, 0.72], [0, -0.72],
  [0.62, 0.62], [-0.62, 0.62], [0.62, -0.62], [-0.62, -0.62],
];
function findSafePickupPosition(node, used = []) {
  const base = worldFromGrid(node.gx, node.gz);
  for (const [ox, oz] of keyOffsets.sort(() => Math.random() - 0.5)) {
    const x = base.x + ox;
    const z = base.z + oz;
    if (horizontalDistance({ x, z }, exitDoor.position) < 3.2) continue;
    if (horizontalDistance({ x, z }, breakerPanel.position) < 2.2) continue;
    if (used.some((p) => Math.hypot(p.x - x, p.z - z) < 2.25)) continue;
    if (lockers.some((locker) => Math.hypot(locker.x - x, locker.z - z) < 1.65)) continue;
    if (!isSafeSpawnPoint(x, z, 0.78)) continue;
    return { x, z };
  }
  return null;
}
const keyCandidates = walkableNodes
  .filter((node) => node.key !== exitNode.key && node.key !== breakerNode.key && Math.hypot(node.gx - 6, node.gz - 18) > 3)
  .sort(() => Math.random() - 0.5);
const selectedKeySpawns = [];
for (const node of keyCandidates) {
  const pos = findSafePickupPosition(node, selectedKeySpawns);
  if (pos) selectedKeySpawns.push(pos);
  if (selectedKeySpawns.length >= REQUIRED_KEYS) break;
}
while (selectedKeySpawns.length < REQUIRED_KEYS) {
  const node = findSafeNode((candidate) => Math.hypot(candidate.gx - 6, candidate.gz - 18) > 2);
  const pos = findSafePickupPosition(node, selectedKeySpawns) || { x: node.x, z: node.z };
  selectedKeySpawns.push(pos);
}
const keyMat = material(0xc2a44e, 0.25, 0.85);
const keyItems = selectedKeySpawns.map((keySpawn, index) => {
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
  group.position.set(keySpawn.x, 1.05, keySpawn.z);
  scene.add(group);
  const light = new THREE.PointLight(0xe2c466, 1.25, 2.5);
  light.position.copy(group.position);
  scene.add(light);
  return { group, light, collected: false, baseY: 1.05, phase: index * 0.9 };
});
updateExitCounter();

// Enemy silhouette.
const enemy = new THREE.Group();
enemy.name = 'SONAR';
const sonarParts = {};
const proceduralSonarParts = [];
let externalSonarModel = null;
function deformOrganicGeometry(geometry, name, amount = 0.035) {
  const position = geometry.attributes.position;
  if (!position) return geometry;
  let seed = 0;
  for (let i = 0; i < name.length; i += 1) seed += name.charCodeAt(i) * (i + 1);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const wrinkle = Math.sin((x * 13.7 + y * 8.3 + seed) * 1.7)
      + Math.sin((z * 17.1 - y * 5.9 + seed) * 1.1)
      + Math.sin((x + z + seed) * 6.4);
    const scale = 1 + wrinkle * amount;
    position.setXYZ(i, x * scale, y * (1 + wrinkle * amount * 0.45), z * scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
function sonarPart(name, geometry, mat, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const useGeometry = deformOrganicGeometry(geometry.clone(), name, mat === sonarSkinMat ? 0.028 : mat === sonarEarMat ? 0.018 : 0.012);
  const mesh = new THREE.Mesh(useGeometry, mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  enemy.add(mesh);
  sonarParts[name] = mesh;
  proceduralSonarParts.push(mesh);
  return mesh;
}
function sonarEarMembrane(name, side) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(side * 0.28, 0.34, side * 0.72, 0.42, side * 0.78, 0.05);
  shape.bezierCurveTo(side * 0.82, -0.3, side * 0.42, -0.44, side * 0.12, -0.28);
  shape.bezierCurveTo(side * 0.02, -0.18, side * -0.02, -0.08, 0, 0);
  const mesh = sonarPart(name, new THREE.ShapeGeometry(shape, 10), sonarEarMat, [side * 0.18, 2.35, 0.075], [1.12, 1.12, 1.0], [0.05, side * -0.54, side * 0.08]);
  mesh.material = sonarEarMat;
  return mesh;
}
sonarEarMembrane('leftEarMembraneWide', -1);
sonarEarMembrane('rightEarMembraneWide', 1);
function sonarTube(name, points, radius, mat, tubularSegments = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return sonarPart(name, new THREE.TubeGeometry(curve, tubularSegments, radius, 8, false), mat, [0, 0, 0]);
}
function sonarVerticalMaw() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.045, 2.1);
  shape.bezierCurveTo(-0.13, 1.75, -0.12, 1.24, -0.045, 0.78);
  shape.bezierCurveTo(-0.01, 0.58, 0.01, 0.58, 0.045, 0.78);
  shape.bezierCurveTo(0.12, 1.24, 0.13, 1.75, 0.045, 2.1);
  shape.bezierCurveTo(0.015, 2.2, -0.015, 2.2, -0.045, 2.1);
  const maw = sonarPart('verticalChestMaw', new THREE.ShapeGeometry(shape, 16), sonarMouthMat, [0, 0, 0.305], [1, 1, 1], [0, 0, 0]);
  maw.material.side = THREE.DoubleSide;
  sonarTube('leftMawRim', [[-0.055, 2.08, 0.34], [-0.13, 1.68, 0.35], [-0.11, 1.1, 0.34], [-0.045, 0.76, 0.33]], 0.018, sonarMouthMat, 28);
  sonarTube('rightMawRim', [[0.055, 2.08, 0.34], [0.13, 1.68, 0.35], [0.11, 1.1, 0.34], [0.045, 0.76, 0.33]], 0.018, sonarMouthMat, 28);
  for (let i = 0; i < 12; i += 1) {
    const y = 0.86 + i * 0.095;
    const side = i % 2 ? -1 : 1;
    sonarPart(`mawNeedle${i}`, new THREE.ConeGeometry(0.014, 0.11, 7), paperMat, [side * 0.052, y, 0.365], [0.75, 1, 0.75], [Math.PI / 2, 0, side * 0.32]);
  }
}
sonarVerticalMaw();
sonarPart('body', new THREE.CapsuleGeometry(0.24, 1.34, 10, 18), sonarSkinMat, [0, 1.16, 0], [0.62, 1.24, 0.44]);
sonarPart('chestWetPlate', new THREE.SphereGeometry(0.26, 18, 12), sonarSkinMat, [0, 1.62, 0.08], [0.82, 1.42, 0.25]);
sonarPart('abdomen', new THREE.CapsuleGeometry(0.18, 0.92, 8, 14), sonarSkinMat, [0, 0.8, -0.02], [0.78, 1.05, 0.48]);
sonarPart('pelvis', new THREE.SphereGeometry(0.2, 14, 10), sonarSkinMat, [0, 0.35, -0.02], [0.82, 0.62, 0.54]);
sonarPart('ribCage', new THREE.BoxGeometry(0.42, 0.78, 0.14, 3, 8, 2), sonarSkinMat, [0, 1.57, 0.02], [1, 1, 1]);
sonarPart('head', new THREE.SphereGeometry(0.24, 20, 14), sonarSkinMat, [0, 2.32, 0.02], [0.72, 1.08, 0.64]);
sonarPart('facePlate', new THREE.SphereGeometry(0.16, 18, 10), darkMat, [0, 2.33, 0.15], [0.82, 1.12, 0.18]);
sonarPart('mouth', new THREE.BoxGeometry(0.07, 1.42, 0.04), sonarMouthMat, [0, 1.6, 0.245], [1.0, 1.0, 1.0]);
sonarPart('jaw', new THREE.BoxGeometry(0.24, 0.08, 0.12), sonarMouthMat, [0, 2.08, 0.27], [1.0, 1.0, 1.0]);
sonarPart('spine', new THREE.CylinderGeometry(0.025, 0.045, 1.54, 9), sonarMouthMat, [0, 1.32, -0.2], [1, 1, 1], [0.08, 0, 0]);
for (let i = 0; i < 10; i += 1) {
  sonarPart(`backVertebra${i}`, new THREE.SphereGeometry(0.04, 10, 6), sonarSkinMat, [0, 0.72 + i * 0.16, -0.31], [0.8, 0.48, 0.42]);
}
for (const side of [-1, 1]) {
  sonarPart(`scapula${side}`, new THREE.BoxGeometry(0.36, 0.035, 0.055, 3, 1, 1), sonarSkinMat, [side * 0.16, 1.72, -0.27], [1, 1, 1], [0.16, 0.05, side * 0.64]);
  sonarPart(`backTendon${side}`, new THREE.CylinderGeometry(0.012, 0.018, 1.05, 8), sonarMouthMat, [side * 0.13, 1.25, -0.33], [1, 1, 1], [0.04, 0, side * 0.12]);
}
for (let i = 0; i < 7; i += 1) {
  const y = 1.0 + i * 0.13;
  const width = 0.46 - Math.abs(i - 3) * 0.025;
  sonarPart(`ribLeft${i}`, new THREE.CylinderGeometry(0.01, 0.017, width, 8), sonarMouthMat, [-0.17, y, 0.045], [1, 1, 1], [0, 0, 1.06 + i * 0.025]);
  sonarPart(`ribRight${i}`, new THREE.CylinderGeometry(0.01, 0.017, width, 8), sonarMouthMat, [0.17, y, 0.045], [1, 1, 1], [0, 0, -1.06 - i * 0.025]);
}
for (let i = 0; i < 8; i += 1) {
  const y = 0.95 + i * 0.17;
  const w = 0.16 + i * 0.015;
  sonarPart(`mouthToothL${i}`, new THREE.BoxGeometry(0.025, 0.06, 0.025), paperMat, [-w * 0.22, y, 0.285], [1, 1, 1], [0, 0, -0.34]);
  sonarPart(`mouthToothR${i}`, new THREE.BoxGeometry(0.025, 0.06, 0.025), paperMat, [w * 0.22, y + 0.04, 0.285], [1, 1, 1], [0, 0, 0.34]);
}
sonarPart('leftEar', new THREE.SphereGeometry(0.34, 24, 14), sonarEarMat, [-0.42, 2.34, 0.01], [1.18, 1.64, 0.15], [0, 0.3, 0.26]);
sonarPart('rightEar', new THREE.SphereGeometry(0.34, 24, 14), sonarEarMat, [0.42, 2.34, 0.01], [1.18, 1.64, 0.15], [0, -0.3, -0.26]);
sonarPart('leftOuterEarRim', new THREE.TorusGeometry(0.38, 0.018, 8, 28), sonarMouthMat, [-0.44, 2.34, 0.02], [1.0, 1.35, 0.2], [0.02, 0.36, 0.28]);
sonarPart('rightOuterEarRim', new THREE.TorusGeometry(0.38, 0.018, 8, 28), sonarMouthMat, [0.44, 2.34, 0.02], [1.0, 1.35, 0.2], [0.02, -0.36, -0.28]);
for (let i = 0; i < 7; i += 1) {
  const spread = -0.18 + i * 0.12;
  sonarPart(`leftEarVein${i}`, new THREE.CylinderGeometry(0.006, 0.012, 0.48, 6), sonarMouthMat, [-0.46 + i * 0.028, 2.34 + spread * 0.2, 0.058], [1, 1, 1], [1.22, 0, 0.28 + i * 0.13]);
  sonarPart(`rightEarVein${i}`, new THREE.CylinderGeometry(0.006, 0.012, 0.48, 6), sonarMouthMat, [0.46 - i * 0.028, 2.34 + spread * 0.2, 0.058], [1, 1, 1], [1.22, 0, -0.28 - i * 0.13]);
}
for (const side of [-1, 1]) {
  const prefix = side < 0 ? 'left' : 'right';
  sonarPart(`${prefix}Shoulder`, new THREE.SphereGeometry(0.09, 12, 8), sonarSkinMat, [side * 0.3, 1.75, 0.02], [0.82, 0.74, 0.5]);
  sonarPart(`${prefix}UpperArm`, new THREE.CylinderGeometry(0.045, 0.068, 1.06, 10), sonarSkinMat, [side * 0.42, 1.16, 0.02], [1, 1, 1], [0.18, 0, side * 0.14]);
  sonarPart(`${prefix}Elbow`, new THREE.SphereGeometry(0.06, 10, 8), sonarMouthMat, [side * 0.52, 0.64, 0.05], [0.74, 0.68, 0.6]);
  sonarPart(`${prefix}ForeArm`, new THREE.CylinderGeometry(0.035, 0.055, 1.36, 10), sonarSkinMat, [side * 0.58, 0.38, 0.08], [1, 1, 1], [0.08, 0, side * 0.1]);
  sonarPart(`${prefix}Hand`, new THREE.SphereGeometry(0.08, 12, 8), sonarSkinMat, [side * 0.63, -0.34, 0.1], [0.64, 1.0, 0.42]);
  for (let i = 0; i < 4; i += 1) {
    sonarPart(`${prefix}Claw${i}`, new THREE.CylinderGeometry(0.008, 0.018, 0.5, 7), sonarMouthMat, [side * (0.55 + i * 0.052), -0.6, 0.16], [1, 1, 1], [0.72, 0, side * (0.15 + i * 0.05)]);
  }
  sonarPart(`${prefix}Thigh`, new THREE.CylinderGeometry(0.065, 0.09, 0.96, 10), sonarSkinMat, [side * 0.14, 0.52, -0.02], [1, 1, 1], [0.08, 0, side * 0.04]);
  sonarPart(`${prefix}Knee`, new THREE.SphereGeometry(0.065, 10, 8), sonarMouthMat, [side * 0.17, 0.06, 0.04], [0.62, 0.74, 0.56]);
  sonarPart(`${prefix}Shin`, new THREE.CylinderGeometry(0.04, 0.065, 1.02, 10), sonarSkinMat, [side * 0.18, -0.22, 0.08], [1, 1, 1], [-0.22, 0, side * -0.03]);
  sonarPart(`${prefix}Foot`, new THREE.BoxGeometry(0.16, 0.075, 0.5), sonarSkinMat, [side * 0.18, -0.78, 0.26]);
  for (let i = 0; i < 3; i += 1) {
    sonarPart(`${prefix}Toe${i}`, new THREE.CylinderGeometry(0.012, 0.017, 0.28, 5), sonarMouthMat, [side * (0.1 + i * 0.06), -0.82, 0.55], [1, 1, 1], [Math.PI / 2, 0, side * (0.18 + i * 0.08)]);
  }
}
const SONAR_BASE_SCALE = 1.34;
const sonarMawGlow = new THREE.PointLight(0x8b140e, 1.2, 3.2, 1.8);
sonarMawGlow.position.set(0, 1.55, 0.46);
enemy.add(sonarMawGlow);
enemy.scale.set(SONAR_BASE_SCALE, SONAR_BASE_SCALE, SONAR_BASE_SCALE);
const enemyStartNode = findSafeNode((node) => Math.hypot(node.gx - 6, node.gz - 18) > 7 && node.key !== exitNode.key && node.key !== breakerNode.key, walkableNodes[0]);
const enemyStart = new THREE.Vector3(enemyStartNode.x, 0, enemyStartNode.z);
enemy.position.set(enemyStart.x, 0, enemyStart.z);
scene.add(enemy);
function loadExternalSonarModel() {
  const loader = new OBJLoader();
  loader.load('./models/sonar.obj', (model) => {
    model.name = 'SONAR_EXTERNAL_OBJ';
    model.traverse((child) => {
      if (!child.isMesh) return;
      const n = child.name.toLowerCase();
      if (n.includes('ear')) child.material = sonarEarMat;
      else if (n.includes('maw') || n.includes('mouth') || n.includes('rib') || n.includes('spine') || n.includes('tendon')) child.material = sonarMouthMat;
      else if (n.includes('claw') || n.includes('tooth') || n.includes('toe')) child.material = paperMat;
      else if (n.includes('face')) child.material = darkMat;
      else child.material = sonarSkinMat;
      child.castShadow = false;
      child.receiveShadow = false;
      child.geometry.computeVertexNormals();
    });
    enemy.add(model);
    externalSonarModel = model;
    proceduralSonarParts.forEach((part) => { part.visible = false; });
  }, undefined, () => {
    proceduralSonarParts.forEach((part) => { part.visible = true; });
  });
}
loadExternalSonarModel();

const VISION_DISTANCE = 10.5;
const VISION_HALF_ANGLE = Math.acos(0.84);
const VISION_RAYS = 13;
const CAPTURE_DISTANCE = 0.55;
const MOVING_CAPTURE_DISTANCE = 1.18;
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
scene.add(enemyVisionLines);

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
  coverPeekUntil: 0,
  coverPeekYaw: 0,
  blockedChaseSince: 0,
  passByUntil: 0,
  trapRushUntil: 0,
  lookBackUntil: 0,
  lookBackYaw: 0,
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
  const inspectNodes = coverSearchNodes(cover);
  const target = inspectNodes[Math.floor(Math.random() * inspectNodes.length)] || nearestNode(cover.x, cover.z);
  if (target) {
    setEnemyDestination(target.x, target.z, 'SEARCHING');
    enemyData.coverLookYaw = Math.atan2(cover.x - target.x, cover.z - target.z);
    if (enemyData.path.length === 0) {
      enemyData.lookBaseYaw = enemyData.coverLookYaw;
      enemyData.lookAroundUntil = clock.elapsedTime + 1.0 + Math.random() * 0.8;
    }
  }
}

function choosePassByRoute(time) {
  const fromEnemyToPlayer = new THREE.Vector3(
    camera.position.x - enemy.position.x,
    0,
    camera.position.z - enemy.position.z,
  );
  if (fromEnemyToPlayer.lengthSq() < 0.001) fromEnemyToPlayer.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  fromEnemyToPlayer.normalize();
  const side = Math.random() < 0.5 ? -1 : 1;
  const sideways = new THREE.Vector3(fromEnemyToPlayer.z * side, 0, -fromEnemyToPlayer.x * side);
  const targetX = camera.position.x + fromEnemyToPlayer.x * 4.5 + sideways.x * (1.4 + Math.random() * 1.8);
  const targetZ = camera.position.z + fromEnemyToPlayer.z * 4.5 + sideways.z * (1.4 + Math.random() * 1.8);
  setEnemyDestination(targetX, targetZ, 'PASSING_BY');
  enemyData.passByUntil = time + 4.8;
  enemyData.lookBackUntil = 0;
  enemyData.lookBackYaw = Math.atan2(camera.position.x - enemy.position.x, camera.position.z - enemy.position.z)
    + (Math.random() < 0.5 ? -0.75 : 0.75);
  enemyData.pauseUntil = Math.max(enemyData.pauseUntil, time + 0.25);
}

// Flashlight.
const BASE_FLASHLIGHT_DISTANCE = 69;
const BASE_FLASHLIGHT_ANGLE = Math.PI / 5.5;
const flashlight = new THREE.SpotLight(0xf4f1dc, 117, BASE_FLASHLIGHT_DISTANCE, BASE_FLASHLIGHT_ANGLE, 0.86, 1.8);
flashlight.castShadow = !touchDevice;
flashlight.shadow.mapSize.set(256, 256);
scene.add(flashlight);
scene.add(flashlight.target);
const fillLight = new THREE.PointLight(0xcbd5c1, 0.36, 4.4);
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
  const caveBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const caveData = caveBuffer.getChannelData(0);
  let drift = 0;
  for (let i = 0; i < caveData.length; i += 1) {
    drift = drift * 0.992 + (Math.random() * 2 - 1) * 0.008;
    caveData[i] = drift;
  }
  const caveAir = ctx.createBufferSource();
  const caveHighpass = ctx.createBiquadFilter();
  const caveLowpass = ctx.createBiquadFilter();
  const caveGain = ctx.createGain();
  const caveDelay = ctx.createDelay();
  const caveEcho = ctx.createGain();
  caveAir.buffer = caveBuffer;
  caveAir.loop = true;
  caveHighpass.type = 'highpass';
  caveHighpass.frequency.value = 28;
  caveLowpass.type = 'lowpass';
  caveLowpass.frequency.value = 165;
  caveGain.gain.value = 0.075;
  caveDelay.delayTime.value = 0.42;
  caveEcho.gain.value = 0.12;
  caveAir.connect(caveHighpass).connect(caveLowpass).connect(caveGain).connect(master);
  caveGain.connect(caveDelay).connect(caveEcho).connect(master);
  caveAir.start();
  const cavePulse = ctx.createOscillator();
  const cavePulseGain = ctx.createGain();
  cavePulse.type = 'sine';
  cavePulse.frequency.value = 43;
  cavePulseGain.gain.value = 0.008;
  cavePulse.connect(cavePulseGain).connect(master);
  cavePulse.start();
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
  audio = { ctx, master, caveGain, caveLowpass, nearGain, noiseBuffer, nextStep: 0, nextEnemyStep: 0, nextBeat: 0 };
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

function playSonarRoar(volume = 0.62) {
  if (!audio) return;
  const { ctx, master, noiseBuffer } = audio;
  const bus = ctx.createGain();
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const growl = ctx.createBiquadFilter();
  const low = ctx.createOscillator();
  const sub = ctx.createOscillator();
  const lowGain = ctx.createGain();
  const subGain = ctx.createGain();
  source.buffer = noiseBuffer;
  source.loop = true;
  source.playbackRate.value = 0.22;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(95, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(430, ctx.currentTime + 1.05);
  filter.Q.value = 5.2;
  growl.type = 'lowpass';
  growl.frequency.value = 620;
  low.type = 'sawtooth';
  low.frequency.setValueAtTime(34, ctx.currentTime);
  low.frequency.exponentialRampToValueAtTime(18, ctx.currentTime + 1.45);
  lowGain.gain.setValueAtTime(volume * 0.68, ctx.currentTime);
  lowGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.65);
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(18, ctx.currentTime);
  sub.frequency.linearRampToValueAtTime(26, ctx.currentTime + 0.22);
  sub.frequency.exponentialRampToValueAtTime(14, ctx.currentTime + 1.55);
  subGain.gain.setValueAtTime(volume * 0.34, ctx.currentTime);
  subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.72);
  bus.gain.setValueAtTime(0.001, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(volume * 1.08, ctx.currentTime + 0.18);
  bus.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.82);
  source.connect(filter).connect(growl).connect(bus);
  low.connect(lowGain).connect(bus);
  sub.connect(subGain).connect(bus);
  bus.connect(master);
  source.start();
  low.start();
  sub.start();
  source.stop(ctx.currentTime + 1.86);
  low.stop(ctx.currentTime + 1.76);
  sub.stop(ctx.currentTime + 1.82);
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

function playCoinSound() {
  if (!audio) return;
  const { ctx, master } = audio;
  const gain = ctx.createGain();
  const first = ctx.createOscillator();
  const second = ctx.createOscillator();
  first.type = 'triangle';
  second.type = 'sine';
  first.frequency.setValueAtTime(880, ctx.currentTime);
  first.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.09);
  second.frequency.setValueAtTime(1760, ctx.currentTime + 0.045);
  second.frequency.exponentialRampToValueAtTime(1180, ctx.currentTime + 0.18);
  gain.gain.setValueAtTime(0.22, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
  first.connect(gain);
  second.connect(gain);
  gain.connect(master);
  first.start();
  second.start(ctx.currentTime + 0.04);
  first.stop(ctx.currentTime + 0.16);
  second.stop(ctx.currentTime + 0.22);
}

function playItemPickupSound() {
  if (!audio) return;
  const { ctx, master } = audio;
  const gain = ctx.createGain();
  const first = ctx.createOscillator();
  const second = ctx.createOscillator();
  first.type = 'sine';
  second.type = 'triangle';
  first.frequency.setValueAtTime(660, ctx.currentTime);
  first.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.12);
  second.frequency.setValueAtTime(1320, ctx.currentTime + 0.06);
  second.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.18, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.26);
  first.connect(gain);
  second.connect(gain);
  gain.connect(master);
  first.start();
  second.start(ctx.currentTime + 0.05);
  first.stop(ctx.currentTime + 0.2);
  second.stop(ctx.currentTime + 0.27);
}


function playTrapSound(volume = 0.55, pan = 0) {
  if (!audio || volume <= 0.006) return;
  const { ctx, master, noiseBuffer } = audio;
  const bus = ctx.createGain();
  const scrape = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const chirp = ctx.createOscillator();
  const chirpGain = ctx.createGain();
  scrape.buffer = noiseBuffer;
  scrape.playbackRate.value = 1.35;
  filter.type = 'bandpass';
  filter.frequency.value = 1450;
  filter.Q.value = 2.4;
  chirp.type = 'sine';
  chirp.frequency.setValueAtTime(920, ctx.currentTime);
  chirp.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.42);
  chirpGain.gain.setValueAtTime(0.28, ctx.currentTime);
  chirpGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.46);
  bus.gain.setValueAtTime(volume, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.72);
  scrape.connect(filter).connect(bus);
  chirp.connect(chirpGain).connect(bus);
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = THREE.MathUtils.clamp(pan, -1, 1);
    bus.connect(panner).connect(master);
  } else bus.connect(master);
  scrape.start();
  chirp.start();
  chirp.stop(ctx.currentTime + 0.48);
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

function reactToSoundEvent(event, now) {
  const distance = Math.hypot(enemy.position.x - event.x, enemy.position.z - event.z);
  const forceTrapResponse = event.forceTrapResponse === true;
  if (!forceTrapResponse && distance > event.hearingRadius) return;
  if (!forceTrapResponse && enemyData.mode === 'PASSING_BY' && now < enemyData.passByUntil) return;
  enemyData.lastHeardAt = now;
  enemyData.lastHeardPosition = { x: event.x, z: event.z };
  const strength = event.strength;
  if (now - enemyData.lastMemoryGainAt > 0.85) {
    enemyData.alertMemory = THREE.MathUtils.clamp(
      enemyData.alertMemory + (strength > 70 ? 0.18 : 0.035),
      0,
      1,
    );
    enemyData.lastMemoryGainAt = now;
  }
  // 歩き音は警戒度上昇をゆっくり、走り音はより危険にする。
  const noiseGain = (strength > 70 ? 9.0 : 1.15) * (1 + enemyData.alertMemory * 1.2);
  state.detection = Math.max(state.detection, strength > 70 ? 28 : 8);
  state.detection = THREE.MathUtils.clamp(state.detection + noiseGain, 0, 100);
  if (forceTrapResponse) {
    setEnemyDestination(event.x, event.z, 'TRAP_RUSH');
    enemyData.trapRushUntil = now + 18;
    enemyData.investigateUntil = now + 18;
    enemyData.searchUntil = now + 22;
    enemyData.investigateSpeed = 6.4;
    enemyData.pauseUntil = 0;
    enemyData.lookAroundUntil = 0;
    enemyData.passByUntil = 0;
    return;
  }
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

function emitWorldSound(x, z, strength, baseHearingRadius, forceRipple = false, options = {}) {
  const hearingRadius = baseHearingRadius * (1 + enemyData.alertMemory * 0.28);
  const now = clock.elapsedTime;
  const event = { x, z, strength, hearingRadius, age: 0, life: 2.4, ...options };
  if (forceRipple || now >= state.nextSoundRippleAt) {
    soundEvents.push(event);
    state.nextSoundRippleAt = now + 2.6;
  }
  reactToSoundEvent(event, now);
}

function emitPlayerSound(strength, baseHearingRadius) {
  emitWorldSound(camera.position.x, camera.position.z, strength, baseHearingRadius, false);
}

function updateAudio(time) {
  if (!audio) return;
  const enemyDistance = enemy.position.distanceTo(camera.position);
  const proximity = distanceAttenuation(enemyDistance, 22, 1.05);
  audio.caveGain.gain.setTargetAtTime(0.06 + Math.sin(time * 0.17) * 0.012, audio.ctx.currentTime, 0.8);
  audio.caveLowpass.frequency.setTargetAtTime(145 + Math.sin(time * 0.09) * 32, audio.ctx.currentTime, 1.1);
  audio.nearGain.gain.setTargetAtTime(proximity * 0.095, audio.ctx.currentTime, 0.14);

  const moving = state.noise > 0 && !state.hidden;
  if (moving && time > audio.nextStep) {
    const settings = state.moveMode === 'RUNNING'
      ? { volume: 0.72, pitch: 1.2, interval: 0.27, radius: 21 * state.noiseMultiplier }
      : { volume: 0.46, pitch: 1, interval: 0.44, radius: 3 * state.noiseMultiplier };
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

function canEnemyMoveTo(x, z) {
  const maxX = GRID_HALF_W * CELL + CELL / 2 - 0.2;
  const maxZ = GRID_HALF_H * CELL + CELL / 2 - 0.2;
  if (x < -maxX || x > maxX || z < -maxZ || z > maxZ) return false;
  return !colliders.some((collider) =>
    Math.abs(x - collider.x) < collider.hw + 0.34 && Math.abs(z - collider.z) < collider.hz + 0.34);
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

function applyBreakerVisual(on) {
  breakerLight.color.set(on ? 0x7dffad : 0xff2d1e);
  breakerLight.intensity = on ? 2.6 : 1.25;
  breakerPanel.material.color.set(on ? 0x26332c : 0x4d120d);
  breakerPanel.material.emissive = new THREE.Color(on ? 0x07170d : 0x4b0705);
  breakerPanel.material.emissiveIntensity = on ? 0.18 : 0.62;
  breakerSwitch.material.color.set(on ? 0x7dffad : 0xff2d1e);
  breakerSwitch.material.emissive = new THREE.Color(on ? 0x1b7a3f : 0x8f120b);
  breakerSwitch.material.emissiveIntensity = on ? 0.75 : 1.05;
}

function setBreaker(on, notify = true) {
  state.breakerOn = on;
  state.breakerOutAt = on ? clock.elapsedTime + 180 * state.breakerDurationMultiplier : Infinity;
  applyBreakerVisual(on);
  if (!notify) return;
  showToast(on ? 'ブレーカーを入れた：3分間、校内が明るくなる' : 'ブレーカーが落ちた');
}
applyBreakerVisual(false);

function updateSchoolLighting(time) {
  if (state.breakerOn && time >= state.breakerOutAt) setBreaker(false);
  const power = state.breakerOn ? 1 : 0;
  hemisphereLight.intensity = THREE.MathUtils.lerp(0.54, 3.8, power);
  ambientLight.intensity = THREE.MathUtils.lerp(0.38, 3.25, power);
  scene.fog.density = THREE.MathUtils.lerp(0.018, 0.0009, power);
  scene.background.set(power ? 0xc8d4d8 : 0x080b08);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.08, 2.25, power);
  for (const light of schoolLights) {
    light.intensity = THREE.MathUtils.lerp(2.2, 22.0, power);
    light.distance = THREE.MathUtils.lerp(8, 22, power);
  }
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
  if (state.nearBreaker) {
    if (!state.breakerOn) setBreaker(true);
    else showToast('ブレーカーは入っている');
    return;
  }
  if (state.nearShop) {
    openShop();
    return;
  }
  const nearbyKey = keyItems.find((item) => !item.collected && camera.position.distanceTo(item.group.position) < 2.15);
  if (nearbyKey) {
    nearbyKey.collected = true;
    nearbyKey.group.visible = false;
    nearbyKey.light.visible = false;
    state.keyCount += 1;
    playItemPickupSound();
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
  setBreaker(false, false);
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
  state.hp = 100;
  state.coins = 0;
  state.nearShop = false;
  state.shopOpen = false;
  state.nextCoinAt = 0;
  state.noiseMultiplier = 1;
  state.breakerDurationMultiplier = 1;
  state.lightRangeMultiplier = 1;
  state.screenFlashUntil = 0;
  state.nextHealAt = 0;
  state.detection = 0;
  state.alert = 'UNNOTICED';
  state.moveMode = 'WALKING';
  state.noise = 0;
  state.nearLocker = null;
  state.nearBreaker = false;
  state.nearShop = false;
  state.currentLocker = null;
  state.breakerOn = false;
  state.breakerOutAt = Infinity;
  setBreaker(false, false);
  state.seatedUntil = 0;
  state.roarUntil = 0;
  scheduleNextRoar(clock.elapsedTime);
  state.nextSoundRippleAt = 0;
  state.nextTrapAt = 0;
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
    coverPeekUntil: 0,
    coverPeekYaw: 0,
    blockedChaseSince: 0,
    passByUntil: 0,
    trapRushUntil: 0,
    lookBackUntil: 0,
    lookBackYaw: 0,
  });
  soundEvents.length = 0;
  sonarReveals.length = 0;
  for (const trap of noiseTraps) { scene.remove(trap.mesh); trap.mesh.geometry.dispose(); }
  noiseTraps.length = 0;
  for (const item of healItems) { scene.remove(item.group); scene.remove(item.light); }
  healItems.length = 0;
  for (const coin of coinItems) { scene.remove(coin.group); scene.remove(coin.light); }
  coinItems.length = 0;
  if (shop) shop.group.visible = true;
  spawnHealItem(clock.elapsedTime, true);
  scheduleNextCoin(clock.elapsedTime);
  scheduleNextHeal(clock.elapsedTime);
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
  if (!win) setBreaker(false, false);
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
  if (state.started && !state.ended && !state.caught && !state.settingsOpen && !state.shopOpen) openSettings();
});
$('#start-button').addEventListener('click', () => {
  state.started = true;
  initAudio();
  scheduleNextRoar(clock.elapsedTime);
  if (healItems.length === 0) {
    spawnHealItem(clock.elapsedTime, true);
    scheduleNextHeal(clock.elapsedTime);
  }
  if (coinItems.length === 0) scheduleNextCoin(clock.elapsedTime);
  document.body.classList.add('game-running');
  $('#start-screen').classList.remove('visible');
  lockPointer();
});
$('#shop-close')?.addEventListener('click', closeShop);
document.querySelectorAll('[data-shop-buy]').forEach((button) => {
  button.addEventListener('click', () => buyShopItem(button.dataset.shopBuy));
});
$('#restart-button').addEventListener('click', () => {
  state.allowExit = true;
  location.reload();
});
renderer.domElement.addEventListener('click', () => {
  if (!mobileInput.active && state.started && !state.ended && !state.caught && !state.settingsOpen && !controls.isLocked) lockPointer();
});
addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && state.shopOpen) { closeShop(); return; }
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

function toLandscapeInputDelta(dx, dy) {
  if (!document.body.classList.contains('mobile-portrait-landscape')) return { x: dx, y: dy };
  return { x: dy, y: -dx };
}

function setupTouchStick(element, onChange) {
  let pointerId = null;
  let bounds = null;
  const knob = element.querySelector('i');
  const update = (event) => {
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const radius = bounds.width * 0.36;
    const pointerDelta = toLandscapeInputDelta(event.clientX - centerX, event.clientY - centerY);
    const rawX = pointerDelta.x;
    const rawY = pointerDelta.y;
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
function bindMobileButton(selector, handler) {
  const element = $(selector);
  if (!element) return;
  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  }, { passive: false });
  element.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
}
bindMobileButton('#mobile-run-toggle', () => {
  mobileInput.running = !mobileInput.running;
  $('#mobile-run-toggle').classList.toggle('running', mobileInput.running);
  $('#mobile-run-toggle').textContent = mobileInput.running ? '走行中' : '歩行中';
});
bindMobileButton('#mobile-flashlight', () => {
  state.flashlight = !state.flashlight;
  $('#mobile-flashlight').classList.toggle('active', state.flashlight);
});
bindMobileButton('#mobile-action', interact);

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
  const rawDelta = toLandscapeInputDelta(event.clientX - cameraSwipeX, event.clientY - cameraSwipeY);
  const deltaX = rawDelta.x;
  const deltaY = rawDelta.y;
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
const playerStart = worldFromGrid(6, 18);
camera.position.set(playerStart.x, 1.68, playerStart.z);
camera.rotation.order = 'YXZ';



function flashScreen(color = 'red', duration = 0.32) {
  const time = clock.elapsedTime;
  state.screenFlashColor = color;
  state.screenFlashUntil = Math.max(state.screenFlashUntil, time + duration);
}

function damagePlayer(amount, reason = 'damage') {
  if (state.ended || state.caught) return;
  state.hp = THREE.MathUtils.clamp(state.hp - amount, 0, 100);
  flashScreen('red', 0.38);
  state.shakeUntil = Math.max(state.shakeUntil, clock.elapsedTime + 0.42);
  state.shakePower = Math.max(state.shakePower, 1.25);
  if (state.hp <= 0) {
    state.ended = true;
    controls.unlock();
    $('#message-kicker').textContent = reason === 'trap' ? '罠に倒れた' : '力尽きた';
    $('#message-title').textContent = 'GAME OVER';
    $('#message-body').textContent = '意識が闇に沈んでいく……';
    $('#message-screen').classList.add('visible');
  }
}

function healPlayer(amount) {
  if (state.ended || state.caught) return;
  const before = state.hp;
  state.hp = THREE.MathUtils.clamp(state.hp + amount, 0, 100);
  if (state.hp > before) flashScreen('green', 0.34);
}

function updateScreenFlash(time) {
  const flash = $('#screen-flash');
  if (!flash) return;
  if (time < state.screenFlashUntil) {
    const remain = state.screenFlashUntil - time;
    const opacity = Math.min(0.72, remain * 2.4);
    flash.style.opacity = opacity.toFixed(2);
    flash.className = state.screenFlashColor === 'green' ? 'green' : 'red';
  } else {
    flash.style.opacity = '0';
  }
}

const trapMat = new THREE.MeshBasicMaterial({ color: 0xf0cc65, transparent: true, opacity: 0.42, depthWrite: false });
const trapTriggeredMat = new THREE.MeshBasicMaterial({ color: 0xff5a42, transparent: true, opacity: 0.62, depthWrite: false });
function scheduleNextTrap(time) {
  state.nextTrapAt = time + 18 + Math.random() * 28;
}

function canPlaceTrapAt(x, z) {
  if (!isSafeSpawnPoint(x, z, 0.64)) return false;
  if (horizontalDistance({ x, z }, camera.position) < 3.5) return false;
  if (horizontalDistance({ x, z }, exitDoor.position) < 2.4) return false;
  if (horizontalDistance({ x, z }, breakerPanel.position) < 2.0) return false;
  if (noiseTraps.some((trap) => !trap.triggered && Math.hypot(trap.x - x, trap.z - z) < 5.2)) return false;
  return true;
}

function dropNoiseTrap(time) {
  const baseNode = nearestNode(enemy.position.x, enemy.position.z);
  const candidates = [baseNode, ...walkableNodes]
    .filter(Boolean)
    .filter((node) => Math.hypot(node.x - enemy.position.x, node.z - enemy.position.z) < 5.6)
    .sort(() => Math.random() - 0.5);
  const node = candidates.find((candidate) => canPlaceTrapAt(candidate.x, candidate.z));
  if (!node) return;
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 6, 24), trapMat.clone());
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(node.x, 0.035, node.z);
  scene.add(mesh);
  noiseTraps.push({ mesh, x: node.x, z: node.z, createdAt: time, triggered: false, removeAt: time + 160 });
  if (noiseTraps.length > 6) {
    const old = noiseTraps.shift();
    scene.remove(old.mesh);
    old.mesh.geometry.dispose();
  }
}

function updateNoiseTraps(dt, time) {
  if (!state.nextTrapAt) scheduleNextTrap(time);
  if (state.started && time >= state.nextTrapAt) {
    dropNoiseTrap(time);
    scheduleNextTrap(time);
  }
  for (let i = noiseTraps.length - 1; i >= 0; i -= 1) {
    const trap = noiseTraps[i];
    trap.mesh.rotation.z += dt * 0.8;
    trap.mesh.visible = state.breakerOn;
    trap.mesh.material.opacity = trap.triggered ? 0.38 + Math.sin(time * 9) * 0.12 : 0.32 + Math.sin(time * 3 + i) * 0.08;
    if (!trap.triggered && !state.hidden && horizontalDistance(camera.position, trap) < 1.12) {
      trap.triggered = true;
      trap.removeAt = time + 4.5;
      trap.mesh.material = trapTriggeredMat.clone();
      damagePlayer(40, 'trap');
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const cameraRight = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const directionToTrap = new THREE.Vector3(trap.x - camera.position.x, 0, trap.z - camera.position.z).normalize();
      playTrapSound(0.64, cameraRight.dot(directionToTrap));
      emitWorldSound(trap.x, trap.z, 100, 9999, true, { forceTrapResponse: true });
    }
    if (time >= trap.removeAt) {
      scene.remove(trap.mesh);
      trap.mesh.geometry.dispose();
      noiseTraps.splice(i, 1);
    }
  }
}


const healMat = new THREE.MeshStandardMaterial({ color: 0x2f8f5a, roughness: 0.45, metalness: 0.05, emissive: 0x0b2c18, emissiveIntensity: 0.35 });
const healCrossMat = new THREE.MeshBasicMaterial({ color: 0xdaf7df });

function scheduleNextHeal(time) {
  state.nextHealAt = time + 60 + Math.random() * 60;
}

function canPlaceHealAt(x, z, allowNearPlayer = false) {
  if (!isSafeSpawnPoint(x, z, 0.78)) return false;
  if (!allowNearPlayer && horizontalDistance({ x, z }, camera.position) < 5.5) return false;
  if (horizontalDistance({ x, z }, exitDoor.position) < 3.2) return false;
  if (horizontalDistance({ x, z }, breakerPanel.position) < 2.2) return false;
  if (keyItems.some((item) => !item.collected && horizontalDistance({ x, z }, item.group.position) < 2.0)) return false;
  if (noiseTraps.some((trap) => !trap.triggered && Math.hypot(trap.x - x, trap.z - z) < 2.0)) return false;
  if (healItems.some((item) => Math.hypot(item.x - x, item.z - z) < 5.0)) return false;
  return true;
}

function spawnHealItem(time, allowNearPlayer = false) {
  const candidates = walkableNodes
    .filter((node) => canPlaceHealAt(node.x, node.z, allowNearPlayer))
    .sort(() => Math.random() - 0.5);
  const node = candidates[0];
  if (!node) return;
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.34), healMat);
  group.add(box);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.21), healCrossMat);
  crossV.position.y = 0.14;
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.015, 0.07), healCrossMat);
  crossH.position.y = 0.145;
  group.add(crossV, crossH);
  group.position.set(node.x, 0.72, node.z);
  scene.add(group);
  const light = new THREE.PointLight(0x61ff8f, 1.4, 3.2);
  light.position.copy(group.position).add(new THREE.Vector3(0, 0.35, 0));
  scene.add(light);
  healItems.push({ group, light, x: node.x, z: node.z, baseY: 0.72, phase: Math.random() * Math.PI * 2, removeAt: time + 180 });
  if (healItems.length > 3) {
    const old = healItems.shift();
    scene.remove(old.group);
    scene.remove(old.light);
  }
}

function updateHealItems(dt, time) {
  if (!state.nextHealAt) scheduleNextHeal(time);
  if (state.started && time >= state.nextHealAt) {
    spawnHealItem(time);
    scheduleNextHeal(time);
  }
  for (let i = healItems.length - 1; i >= 0; i -= 1) {
    const item = healItems[i];
    item.group.rotation.y += dt * 1.25;
    item.group.position.y = item.baseY + Math.sin(time * 2.2 + item.phase) * 0.055;
    item.light.position.copy(item.group.position).add(new THREE.Vector3(0, 0.35, 0));
    if (!state.hidden && state.hp < 100 && horizontalDistance(camera.position, item) < 1.45) {
      healPlayer(30);
      scene.remove(item.group);
      scene.remove(item.light);
      healItems.splice(i, 1);
      continue;
    }
    if (time >= item.removeAt) {
      scene.remove(item.group);
      scene.remove(item.light);
      healItems.splice(i, 1);
    }
  }
}



const coinMat = new THREE.MeshStandardMaterial({ color: 0xd6a842, roughness: 0.36, metalness: 0.65, emissive: 0x3a2505, emissiveIntensity: 0.28 });
const shopMat = new THREE.MeshStandardMaterial({ color: 0x2d4b68, roughness: 0.62, metalness: 0.1, emissive: 0x061423, emissiveIntensity: 0.24 });
const shopAccentMat = new THREE.MeshBasicMaterial({ color: 0x9fe7ff });
const MAX_ACTIVE_COINS = 10;

function scheduleNextCoin(time) {
  state.nextCoinAt = time + 30;
}

function removeCoinAt(index) {
  const coin = coinItems[index];
  if (!coin) return;
  scene.remove(coin.group);
  scene.remove(coin.light);
  coinItems.splice(index, 1);
}

function canPlaceCoinAt(x, z) {
  if (!isSafeSpawnPoint(x, z, 0.55)) return false;
  if (horizontalDistance({ x, z }, camera.position) < 3.2) return false;
  if (horizontalDistance({ x, z }, exitDoor.position) < 2.6) return false;
  if (horizontalDistance({ x, z }, breakerPanel.position) < 2.0) return false;
  if (shop && horizontalDistance({ x, z }, shop) < 3.2) return false;
  if (keyItems.some((item) => !item.collected && horizontalDistance({ x, z }, item.group.position) < 1.7)) return false;
  if (healItems.some((item) => horizontalDistance({ x, z }, item) < 1.7)) return false;
  if (noiseTraps.some((trap) => !trap.triggered && horizontalDistance({ x, z }, trap) < 1.6)) return false;
  if (coinItems.some((coin) => horizontalDistance({ x, z }, coin) < 3.0)) return false;
  return true;
}

function spawnCoin(time) {
  if (coinItems.filter((coin) => !coin.collected).length >= MAX_ACTIVE_COINS) return;
  const candidates = walkableNodes
    .filter((node) => canPlaceCoinAt(node.x, node.z))
    .sort(() => Math.random() - 0.5);
  const node = candidates[0];
  if (!node) return;
  const group = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.045, 20), coinMat);
  coin.rotation.x = Math.PI / 2;
  group.add(coin);
  group.position.set(node.x, 0.72, node.z);
  scene.add(group);
  const light = new THREE.PointLight(0xffcc62, 0.7, 2.8);
  light.position.copy(group.position).add(new THREE.Vector3(0, 0.3, 0));
  scene.add(light);
  coinItems.push({ group, light, x: node.x, z: node.z, baseY: 0.72, phase: Math.random() * Math.PI * 2, removeAt: time + 150, collected: false });
}

function updateCoins(dt, time) {
  if (!state.nextCoinAt) scheduleNextCoin(time);
  if (state.started && time >= state.nextCoinAt) {
    spawnCoin(time);
    scheduleNextCoin(time);
  }
  for (let i = coinItems.length - 1; i >= 0; i -= 1) {
    const coin = coinItems[i];
    if (coin.collected) {
      removeCoinAt(i);
      continue;
    }
    coin.group.rotation.y += dt * 2.7;
    coin.group.position.y = coin.baseY + Math.sin(time * 2.8 + coin.phase) * 0.05;
    coin.light.position.copy(coin.group.position).add(new THREE.Vector3(0, 0.28, 0));
    if (!state.hidden && horizontalDistance(camera.position, coin) < 1.25) {
      coin.collected = true;
      state.coins += 1;
      playCoinSound();
      removeCoinAt(i);
      updateHUD();
      continue;
    }
    if (time >= coin.removeAt) {
      removeCoinAt(i);
    }
  }
}

function canPlaceShopAt(x, z) {
  if (!isSafeSpawnPoint(x, z, 0.86)) return false;
  if (horizontalDistance({ x, z }, camera.position) < 5.5) return false;
  if (horizontalDistance({ x, z }, enemyStart) < 4.5) return false;
  if (horizontalDistance({ x, z }, exitDoor.position) < 4.0) return false;
  if (horizontalDistance({ x, z }, breakerPanel.position) < 4.0) return false;
  if (keyItems.some((item) => horizontalDistance({ x, z }, item.group.position) < 3.0)) return false;
  return true;
}

function createShop() {
  const candidates = walkableNodes
    .filter((node) => canPlaceShopAt(node.x, node.z))
    .sort(() => Math.random() - 0.5);
  const node = candidates[0] || walkableNodes[Math.floor(walkableNodes.length / 2)];
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 0.42), shopMat);
  body.position.y = 0.86;
  group.add(body);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 0.05), shopAccentMat);
  sign.position.set(0, 1.56, 0.25);
  group.add(sign);
  const coinMark = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 16), coinMat);
  coinMark.position.set(0, 1.56, 0.3);
  coinMark.rotation.x = Math.PI / 2;
  group.add(coinMark);
  group.position.set(node.x, 0, node.z);
  scene.add(group);
  shop = { group, x: node.x, z: node.z };
}

function setShopMessage(text) {
  const message = $('#shop-message');
  if (message) message.textContent = text;
}

function openShop() {
  state.shopOpen = true;
  $('#shop-screen')?.classList.add('visible');
  setShopMessage(`所持コイン：${state.coins}`);
  if (controls.isLocked) controls.unlock();
}

function closeShop() {
  state.shopOpen = false;
  $('#shop-screen')?.classList.remove('visible');
  if (state.started && !state.ended && !state.caught && !mobileInput.active) lockPointer();
}

function spendCoins(cost) {
  if (state.coins < cost) return false;
  state.coins -= cost;
  updateHUD();
  return true;
}

const SHOP_PRICES = {
  heal: 3,
  noise: 20,
  breaker: 20,
  light: 10,
};

function buyShopItem(type) {
  if (type === 'heal') {
    if (state.hp >= 100) return setShopMessage('HP満タンなので回復できない');
    if (!spendCoins(SHOP_PRICES.heal)) return setShopMessage(`コインが足りない（回復：${SHOP_PRICES.heal}コイン）`);
    healPlayer(100);
    return setShopMessage(`全回復した / 所持コイン：${state.coins}`);
  }
  if (type === 'noise') {
    if (state.noiseMultiplier <= 0.5) return setShopMessage('ノイズ半減は購入済み');
    if (!spendCoins(SHOP_PRICES.noise)) return setShopMessage(`コインが足りない（ノイズ半減：${SHOP_PRICES.noise}コイン）`);
    state.noiseMultiplier = 0.5;
    return setShopMessage(`ノイズ音が半分になった / 所持コイン：${state.coins}`);
  }
  if (type === 'breaker') {
    if (state.breakerDurationMultiplier >= 2) return setShopMessage('ブレーカー強化は購入済み');
    if (!spendCoins(SHOP_PRICES.breaker)) return setShopMessage(`コインが足りない（ブレーカー強化：${SHOP_PRICES.breaker}コイン）`);
    state.breakerDurationMultiplier = 2;
    if (state.breakerOn) state.breakerOutAt = clock.elapsedTime + Math.max(0, state.breakerOutAt - clock.elapsedTime) * 2;
    return setShopMessage(`ブレーカーON時間が2倍になった / 所持コイン：${state.coins}`);
  }
  if (type === 'light') {
    if (state.lightRangeMultiplier >= 2) return setShopMessage('ライト範囲強化は購入済み');
    if (!spendCoins(SHOP_PRICES.light)) return setShopMessage(`コインが足りない（ライト範囲2倍：${SHOP_PRICES.light}コイン）`);
    state.lightRangeMultiplier = 2;
    return setShopMessage(`ライト範囲が2倍になった / 所持コイン：${state.coins}`);
  }
}

createShop();

function scheduleNextRoar(time) {
  state.nextRoarAt = time + 60 + Math.random() * 120;
}

function triggerSonarRoar(time) {
  state.roarUntil = time + 3;
  state.shakeUntil = Math.max(state.shakeUntil, time + 3);
  state.shakePower = Math.max(state.shakePower, 1.35);
  scheduleNextRoar(time);
  playSonarRoar(0.72);
  const distance = Math.hypot(enemy.position.x - camera.position.x, enemy.position.z - camera.position.z);
  const runningDetectionRange = 22;
  enemyData.pauseUntil = Math.max(enemyData.pauseUntil, state.roarUntil);
  enemyData.lookAroundUntil = Math.max(enemyData.lookAroundUntil, state.roarUntil);
  enemyData.path = [];
  enemyData.isMoving = false;
  if (!state.hidden && distance <= runningDetectionRange) {
    state.seatedUntil = time + 5;
    state.noise = 0;
    state.shakeUntil = Math.max(state.shakeUntil, time + 3);
    state.shakePower = Math.max(state.shakePower, 1.75);
    // しりもち音：歩き音の2倍の範囲で、少しだけ警戒度を上げる。
    emitWorldSound(camera.position.x, camera.position.z, 28, 6, true);
    mobileInput.moveX = mobileInput.moveY = 0;
    keys.KeyW = keys.KeyA = keys.KeyS = keys.KeyD = false;
  }
}

function updateSonarRoar(time) {
  if (!state.nextRoarAt) scheduleNextRoar(time);
  if (time >= state.nextRoarAt) triggerSonarRoar(time);
}

function updatePlayer(dt) {
  const time = clock.elapsedTime;
  if (state.hidden) {
    state.battery = Math.min(100, state.battery + dt * 1.35);
    return;
  }
  if (time < state.seatedUntil) {
    state.noise = 0;
    state.moveMode = 'WALKING';
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.92, dt * 10);
    return;
  }
  if ((!controls.isLocked && !mobileInput.active)) return;
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
  state.noise = active ? (running ? 88 : 38) * state.noiseMultiplier : 0;
  if (active && running && !state.hidden) {
    const memoryBoost = 1 + enemyData.alertMemory * 0.6;
    state.detection = THREE.MathUtils.clamp(state.detection + dt * 1.25 * memoryBoost, 0, 100);
    enemyData.alertMemory = THREE.MathUtils.clamp(enemyData.alertMemory + dt * 0.004, 0, 1);
  }
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
  } else {
    state.battery = Math.min(100, state.battery + dt * 1.05);
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

function updateSonarModel(dt, time) {
  const chase = enemyData.mode === 'HUNTING';
  const roaring = time < state.roarUntil;
  const investigate = enemyData.mode === 'INVESTIGATING' || enemyData.mode === 'SEARCHING';
  const breathe = Math.sin(time * (chase ? 8.5 : 3.2));
  enemy.scale.y = SONAR_BASE_SCALE + breathe * (chase ? 0.04 : 0.022);
  if (sonarParts.leftEar && sonarParts.rightEar) {
    const earOpen = roaring ? 0.62 : chase ? 0.42 : investigate ? 0.28 : 0.12;
    const twitch = Math.sin(time * 19) * (chase ? 0.07 : 0.025);
    sonarParts.leftEar.rotation.z = 0.18 + earOpen + twitch;
    sonarParts.rightEar.rotation.z = -0.18 - earOpen - twitch;
    sonarParts.leftEar.scale.y = 1.48 + Math.abs(breathe) * 0.1;
    sonarParts.rightEar.scale.y = 1.48 + Math.abs(breathe) * 0.1;
  }
  if (sonarParts.head) sonarParts.head.rotation.x = chase ? -0.22 + breathe * 0.03 : breathe * 0.02;
  if (sonarParts.mouth) sonarParts.mouth.scale.x = roaring ? 2.05 + Math.abs(breathe) * 0.35 : chase ? 1.55 + Math.abs(breathe) * 0.25 : 1.0;
  const armSwing = Math.sin(time * (chase ? 7.2 : 3.4));
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? 'left' : 'right';
    const upper = sonarParts[`${prefix}UpperArm`];
    const fore = sonarParts[`${prefix}ForeArm`];
    if (upper) upper.rotation.x = (chase ? -0.42 : 0.12) + armSwing * 0.12 * side;
    if (fore) fore.rotation.x = (chase ? -0.35 : 0.08) - armSwing * 0.08 * side;
  }
}

function updateEnemy(dt, time) {
  if (state.ended) return;
  const roaring = time < state.roarUntil;
  if (!isSafeSpawnPoint(enemy.position.x, enemy.position.z, 0.36)) {
    const safe = nearestNode(enemy.position.x, enemy.position.z) || enemyStartNode;
    enemy.position.set(safe.x, 0, safe.z);
    enemyData.path = [];
  }
  const distance = Math.hypot(enemy.position.x - camera.position.x, enemy.position.z - camera.position.z);
  const enemyEye = enemy.position.clone().add(new THREE.Vector3(0, 1.7, 0));
  const playerEye = camera.position.clone();
  toPlayer.subVectors(playerEye, enemyEye);
  toPlayer.y = 0;
  const enemyForward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.quaternion);
  const facing = enemyForward.dot(toPlayer.clone().normalize());
  const exitGraceActive = time < state.lockerExitGraceUntil;
  const lineOfSightToPlayer = hasLineOfSight(enemyEye, playerEye);
  let passByActive = enemyData.mode === 'PASSING_BY' && time < enemyData.passByUntil;
  const visible = !passByActive && !state.hidden && !exitGraceActive && distance < 10.5 && facing > 0.84 && lineOfSightToPlayer;
  const blockedChase = !state.hidden
    && !exitGraceActive
    && enemyData.mode === 'HUNTING'
    && distance < 4.8
    && !lineOfSightToPlayer;
  if (blockedChase) {
    if (!enemyData.blockedChaseSince) enemyData.blockedChaseSince = time;
    if (time - enemyData.blockedChaseSince > 0.65) {
      state.detection = Math.min(state.detection, 18);
      state.alert = 'UNNOTICED';
      enemyData.alertMemory = Math.max(0, enemyData.alertMemory - 0.28);
      enemyData.blockedChaseSince = 0;
      choosePassByRoute(time);
      passByActive = true;
    }
  } else {
    enemyData.blockedChaseSince = 0;
  }
  const nearbySharedCover = !state.hidden && !exitGraceActive && enemyData.mode === 'SEARCHING'
    ? coverPoints.findIndex((cover) =>
      Math.hypot(camera.position.x - cover.x, camera.position.z - cover.z) < 1.75
      && Math.hypot(enemy.position.x - cover.x, enemy.position.z - cover.z) < 2.45)
    : -1;
  if (nearbySharedCover >= 0 && (nearbySharedCover !== enemyData.coverCheckIndex || time >= enemyData.nextCoverCheckAt)) {
    enemyData.coverCheckIndex = nearbySharedCover;
    enemyData.coverCheckSuccess = Math.random() < 0.38 + enemyData.alertMemory * 0.42;
    enemyData.nextCoverCheckAt = time + 2.6 + Math.random() * 1.2;
    const playerDirection = Math.atan2(camera.position.x - enemy.position.x, camera.position.z - enemy.position.z);
    enemyData.coverLookYaw = playerDirection + (enemyData.coverCheckSuccess ? 0 : (Math.random() < 0.5 ? -0.88 : 0.88));
    enemyData.coverPeekYaw = enemyData.coverLookYaw;
    enemyData.coverPeekUntil = time + 1.25 + Math.random() * 0.55;
    enemyData.lookAroundUntil = Math.max(enemyData.lookAroundUntil, enemyData.coverPeekUntil);
  } else if (nearbySharedCover < 0) {
    enemyData.coverCheckIndex = -1;
    enemyData.coverCheckSuccess = false;
    enemyData.coverPeekUntil = 0;
  }
  const coverPeekActive = nearbySharedCover >= 0 && time < enemyData.coverPeekUntil;
  const coverPeekFacing = coverPeekActive
    && Math.cos(enemyData.coverPeekYaw - Math.atan2(camera.position.x - enemy.position.x, camera.position.z - enemy.position.z)) > 0.72;
  const checkingSameCover = nearbySharedCover >= 0 && enemyData.coverCheckSuccess && coverPeekFacing;

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
  if (!passByActive && !state.hidden && !exitGraceActive && distance < 1.8) state.detection += 90 * dt;
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

  if (passByActive) {
    state.alert = 'UNNOTICED';
    enemyData.speed = 2.6;
    state.detection = Math.max(0, state.detection - 42 * dt);
  } else if (enemyData.mode === 'TRAP_RUSH' && time < enemyData.trapRushUntil) {
    state.alert = 'SUSPICIOUS';
    enemyData.speed = 6.4;
  } else if (state.detection > 70 && !state.hidden) {
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
  if (!roaring && enemyData.path.length === 0) {
    if (enemyData.mode === 'PASSING_BY' && time < enemyData.passByUntil) {
      enemyData.lookBackUntil = time + 0.7 + Math.random() * 0.75;
    } else if (enemyData.mode === 'TRAP_RUSH') {
      enemyData.mode = 'SEARCHING';
      enemyData.searchUntil = Math.max(enemyData.searchUntil, time + 7);
      enemyData.lookBaseYaw = enemy.rotation.y;
      enemyData.lookAroundUntil = time + 1.0;
    } else if (enemyData.mode === 'SEARCHING' && time >= enemyData.lookAroundUntil) chooseCoverSearchRoute();
    else if (!['INVESTIGATING', 'SEARCHING', 'PASSING_BY', 'TRAP_RUSH'].includes(enemyData.mode)) chooseRandomEnemyRoute();
  }
  const target = enemyData.path[0];
  if (!roaring && target && time >= enemyData.pauseUntil && time >= enemyData.lookAroundUntil) {
    const direction = new THREE.Vector3(target.x - enemy.position.x, 0, target.z - enemy.position.z);
    if (direction.length() < 0.18) {
      enemyData.path.shift();
      if (enemyData.path.length === 0 && enemyData.mode === 'SEARCHING') {
        enemyData.lookBaseYaw = enemyData.coverLookYaw || enemy.rotation.y;
        enemyData.lookAroundUntil = time + 1.0 + Math.random() * 1.1;
      }
    }
    else {
      direction.normalize();
      const nextX = enemy.position.x + direction.x * enemyData.speed * dt;
      const nextZ = enemy.position.z + direction.z * enemyData.speed * dt;
      if (canEnemyMoveTo(nextX, nextZ)) {
        enemy.position.x = nextX;
        enemy.position.z = nextZ;
        enemy.rotation.y = Math.atan2(direction.x, direction.z);
        enemyData.isMoving = true;
      } else {
        const safe = nearestNode(enemy.position.x, enemy.position.z) || enemyStartNode;
        if (!isSafeSpawnPoint(enemy.position.x, enemy.position.z, 0.36)) enemy.position.set(safe.x, 0, safe.z);
        enemyData.path = [];
        if (enemyData.mode === 'HUNTING') choosePassByRoute(time);
        else enemyData.lookAroundUntil = Math.max(enemyData.lookAroundUntil, time + 0.8);
      }
    }
  }
  if (roaring) {
    enemyData.isMoving = false;
    const roarTurn = Math.sin(time * 4.2) * 0.18;
    enemy.rotation.y += roarTurn * dt;
  }
  if (enemyData.mode === 'SEARCHING' && enemyData.path.length === 0 && time < enemyData.lookAroundUntil) {
    enemy.rotation.y = enemyData.lookBaseYaw + Math.sin(time * 3.1) * 1.18;
  }
  if (coverPeekActive && enemyData.mode === 'SEARCHING') {
    const turnDelta = Math.atan2(
      Math.sin(enemyData.coverPeekYaw - enemy.rotation.y),
      Math.cos(enemyData.coverPeekYaw - enemy.rotation.y),
    );
    enemy.rotation.y += turnDelta * Math.min(1, dt * 7.5);
  }
  if (enemyData.mode === 'PASSING_BY' && time < enemyData.lookBackUntil) {
    const turnDelta = Math.atan2(
      Math.sin(enemyData.lookBackYaw - enemy.rotation.y),
      Math.cos(enemyData.lookBackYaw - enemy.rotation.y),
    );
    enemy.rotation.y += turnDelta * Math.min(1, dt * 5.2);
  } else if (enemyData.mode === 'PASSING_BY' && time >= enemyData.passByUntil) {
    enemyData.mode = 'ROAMING';
    enemyData.path = [];
    enemyData.lookBackUntil = 0;
  }
  enemy.position.y = enemyData.isMoving ? Math.abs(Math.sin(time * (enemyData.speed > 2 ? 5.5 : 3.5))) * 0.035 : 0;

  $('#danger-flash').style.opacity = state.alert === 'HUNTING'
    ? '0.12'
    : state.hidden && distance < 6 ? '0.035' : '0';
  const playerMoving = !state.hidden && state.noise > 6;
  const captureDistance = playerMoving ? MOVING_CAPTURE_DISTANCE : CAPTURE_DISTANCE;
  const clearAtContactRange = !passByActive && distance < captureDistance && lineOfSightToPlayer;
  if (!state.hidden && !exitGraceActive && clearAtContactRange) startCaughtCutscene();
}

function updateInteraction() {
  state.nearLocker = null;
  state.nearBreaker = false;
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
  state.nearBreaker = horizontalDistance(camera.position, breakerPanel.position) < 2.35;
  state.nearShop = Boolean(shop && horizontalDistance(camera.position, shop) < 2.6);
  const actionPrefix = mobileInput.active ? '' : '[ E ] ';
  if (state.hidden) prompt = `${actionPrefix}ロッカーから出る`;
  else if (state.nearLocker) prompt = `${actionPrefix}ロッカーの中に隠れる`;
  else if (state.nearBreaker) prompt = state.breakerOn ? `${actionPrefix}ブレーカーは入っている` : `${actionPrefix}ブレーカーを入れる`;
  else if (state.nearShop) prompt = `${actionPrefix}ショップを開く`;
  else if (nearbyKey) prompt = `${actionPrefix}鍵を拾う（${state.keyCount} / ${REQUIRED_KEYS}）`;
  else if (horizontalDistance(camera.position, exitDoor.position) < 3.6) {
    prompt = state.keyCount >= REQUIRED_KEYS
      ? `${actionPrefix}鍵を使って脱出`
      : `${actionPrefix}出口（鍵 ${state.keyCount} / ${REQUIRED_KEYS}）`;
  }
  $('#prompt').textContent = mobileInput.active ? '' : prompt;
  const mobileAction = $('#mobile-action');
  const actionLabel = prompt.replace(/^\[ E \]\s*/, '');
  mobileAction.textContent = actionLabel || '調べる';
  mobileAction.classList.toggle('visible', mobileInput.active && Boolean(prompt) && !state.caught);
}

const alertLabels = { UNNOTICED: '未発見', SUSPICIOUS: '警戒中', HUNTING: '追跡中' };
const movementLabels = { WALKING: '歩行', RUNNING: '走行', HIDING: '隠れている', SEATED: 'しりもち' };
function updateHUD() {
  $('#noise-bar').style.width = `${state.noise}%`;
  $('#noise-value').textContent = String(Math.round(state.noise)).padStart(2, '0');
  $('#detect-bar').style.width = `${state.detection}%`;
  $('#detect-value').textContent = String(Math.round(state.detection)).padStart(2, '0');
  $('#alert-text').textContent = alertLabels[state.alert];
  $('#alert-text').parentElement.classList.toggle('danger', state.alert === 'HUNTING');
  $('#move-mode').textContent = movementLabels[state.hidden ? 'HIDING' : clock.elapsedTime < state.seatedUntil ? 'SEATED' : state.moveMode];
  $('#battery-value').textContent = `${Math.ceil(state.battery)}%`;
  $('#battery-bar').style.width = `${state.battery}%`;
  const hpBar = $('#hp-bar');
  if (hpBar) hpBar.style.width = `${state.hp}%`;
  const coinValue = $('#coin-value');
  if (coinValue) coinValue.textContent = String(state.coins);
}

function updateLight(time) {
  updateSchoolLighting(time);
  flashlight.visible = state.flashlight && !state.hidden;
  fillLight.visible = flashlight.visible;
  lockerViewLight.visible = state.hidden;
  lockerViewLight.position.copy(camera.position);
  camera.getWorldDirection(forward);
  lockerViewLight.target.position.copy(camera.position).addScaledVector(forward, 5);
  flashlight.position.copy(camera.position).addScaledVector(forward, 0.12);
  const flashlightReach = BASE_FLASHLIGHT_DISTANCE * state.lightRangeMultiplier;
  flashlight.distance = flashlightReach;
  flashlight.angle = Math.min(Math.PI / 2.75, BASE_FLASHLIGHT_ANGLE * state.lightRangeMultiplier);
  flashlight.target.position.copy(camera.position).addScaledVector(forward, Math.max(12, flashlightReach * 0.18));
  fillLight.position.copy(camera.position);
  flashlight.intensity = 117 * (state.battery < 15 ? 0.68 : 1);
  for (const item of keyItems) {
    item.group.rotation.y = time * 0.9 + item.phase;
    item.group.position.y = item.baseY + Math.sin(time * 2 + item.phase) * 0.06;
  }
}

const minimap = $('#minimap');
const radar = minimap.getContext('2d');
function radarPoint(x, z, scale = 8.2) {
  return {
    x: minimap.width / 2 + (x - camera.position.x) * scale,
    y: minimap.height / 2 + (z - camera.position.z) * scale,
  };
}

function angleDelta(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function updateRadar(dt, time) {
  radar.clearRect(0, 0, minimap.width, minimap.height);
  radar.fillStyle = 'rgba(3,9,6,.92)';
  radar.fillRect(0, 0, minimap.width, minimap.height);
  const centerX = minimap.width / 2;
  const centerY = minimap.height / 2;
  const radarRadius = Math.min(minimap.width, minimap.height) * 0.46;
  const worldRadius = 14;
  const scale = radarRadius / worldRadius;
  const sweep = time * 1.45;
  sonarReveals.push({ angle: sweep, age: 0, life: 3.2 });
  if (sonarReveals.length > 28) sonarReveals.shift();
  for (let i = sonarReveals.length - 1; i >= 0; i -= 1) {
    sonarReveals[i].age += dt;
    if (sonarReveals[i].age >= sonarReveals[i].life) sonarReveals.splice(i, 1);
  }

  radar.save();
  radar.beginPath();
  radar.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
  radar.clip();
  radar.strokeStyle = 'rgba(96,137,110,.18)';
  radar.lineWidth = 1;
  for (let r = 1; r <= 3; r += 1) {
    radar.beginPath();
    radar.arc(centerX, centerY, r * radarRadius / 3, 0, Math.PI * 2);
    radar.stroke();
  }

  const radarCellWidth = CELL * scale;
  const radarCellHeight = CELL * scale;
  for (const node of navNodes.values()) {
    const dx = node.x - camera.position.x;
    const dz = node.z - camera.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > worldRadius) continue;
    const nodeAngle = Math.atan2(dz, dx);
    let revealAlpha = 0;
    for (const reveal of sonarReveals) {
      const progress = reveal.age / reveal.life;
      const matched = angleDelta(nodeAngle, reveal.angle) < 0.34 + progress * 0.08;
      if (matched) revealAlpha = Math.max(revealAlpha, (1 - progress) * 0.33);
    }
    if (revealAlpha <= 0.01) continue;
    const p = radarPoint(node.x, node.z, scale);
    radar.fillStyle = `rgba(100,145,116,${revealAlpha})`;
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
    const p = radarPoint(event.x, event.z, scale);
    const progress = event.age / event.life;
    radar.strokeStyle = `rgba(225,181,78,${1 - progress})`;
    radar.lineWidth = 1.5;
    const hearingRadiusPixels = event.hearingRadius * scale;
    radar.beginPath();
    radar.arc(p.x, p.y, 2 + progress * hearingRadiusPixels, 0, Math.PI * 2);
    radar.stroke();
  }

  const playerPoint = { x: centerX, y: centerY };
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

  const enemyPoint = radarPoint(enemy.position.x, enemy.position.z, scale);
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
      scale,
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

  radar.strokeStyle = 'rgba(105,220,148,.38)';
  radar.beginPath();
  radar.moveTo(playerPoint.x, playerPoint.y);
  radar.lineTo(playerPoint.x + Math.cos(sweep) * radarRadius, playerPoint.y + Math.sin(sweep) * radarRadius);
  radar.stroke();
  radar.restore();
  radar.strokeStyle = 'rgba(105,190,137,.38)';
  radar.lineWidth = 1.2;
  radar.beginPath();
  radar.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
  radar.stroke();
}

let nextVisionUpdate = 0;
let radarAccumulator = 1;
let hudAccumulator = 1;
let interactionAccumulator = 1;
function updateScreenShake(time) {
  const app = $('#app');
  if (!app) return;
  if (time < state.shakeUntil) {
    const remain = Math.max(0, state.shakeUntil - time);
    const power = state.shakePower * Math.min(1, remain / 0.55);
    const x = (Math.sin(time * 72.3) + Math.sin(time * 39.7)) * 2.4 * power;
    const y = (Math.cos(time * 66.1) + Math.sin(time * 51.9)) * 1.8 * power;
    app.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
  } else {
    app.style.transform = '';
    state.shakePower = 0;
  }
}

function adjustDynamicResolution(now) {
  if (!perfFps) return;
  if (perfFps < 42 && now - lastResolutionAdjustAt > 2800 && resolutionTierIndex < RESOLUTION_TIERS.length - 1) {
    resolutionTierIndex += 1;
    dynamicResolutionScale = RESOLUTION_TIERS[resolutionTierIndex];
    lastResolutionAdjustAt = now;
    highFpsSince = now;
    applyRenderCap();
  } else if (perfFps > 57) {
    if (now - highFpsSince > 8500 && now - lastResolutionAdjustAt > 6000 && resolutionTierIndex > 0) {
      resolutionTierIndex -= 1;
      dynamicResolutionScale = RESOLUTION_TIERS[resolutionTierIndex];
      lastResolutionAdjustAt = now;
      highFpsSince = now;
      applyRenderCap();
    }
  } else {
    highFpsSince = now;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  const time = clock.elapsedTime;
  if (state.caught) {
    updateCaughtCutscene(time);
  } else if (state.started && !state.ended && !state.settingsOpen && !state.shopOpen) {
    updateSonarRoar(time);
    updatePlayer(dt);
    updateLockerView();
    updateEnemy(dt, time);
    updateNoiseTraps(dt, time);
    updateHealItems(dt, time);
    updateCoins(dt, time);
    updateSonarModel(dt, time);
    if (time >= nextVisionUpdate) {
      updateEnemyVision();
      nextVisionUpdate = time + 1 / 12;
    }
    interactionAccumulator += dt;
    if (interactionAccumulator >= 0.12) {
      updateInteraction();
      interactionAccumulator = 0;
    }
    hudAccumulator += dt;
    if (hudAccumulator >= 0.10) {
      updateHUD();
      hudAccumulator = 0;
    }
    updateLight(time);
    updateAudio(time);
  }
  radarAccumulator += dt;
  if (radarAccumulator >= 1 / 6) {
    updateRadar(radarAccumulator, time);
    radarAccumulator = 0;
  }
  updateScreenShake(time);
  updateScreenFlash(time);
  renderer.render(scene, camera);
  perfFrames += 1;
  const now = performance.now();
  if (now - perfLast >= 500) {
    perfFps = Math.round((perfFrames * 1000) / (now - perfLast));
    perfFrames = 0;
    perfLast = now;
    adjustDynamicResolution(now);
    const info = renderer.info.render;
    if (perfPanel) {
      perfPanel.textContent = `${PERF_BUILD_ID}\nFPS ${perfFps} / draw ${info.calls} / tris ${info.triangles}\nrender ${renderer.domElement.width}x${renderer.domElement.height} / scale ${dynamicResolutionScale.toFixed(2)}\nwindow ${innerWidth}x${innerHeight}`;
    }
  }
}

chooseRandomEnemyRoute();
animate();

addEventListener('resize', applyRenderCap);
