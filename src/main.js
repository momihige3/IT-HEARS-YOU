import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const $ = (selector) => document.querySelector(selector);
const touchDevice = matchMedia('(hover: none) and (pointer: coarse)').matches;
const PERF_BUILD_ID = 'ROOM-BREAKER-FLASHLIGHT-20260626';
const INTERNAL_MAX_W = 1280;
const INTERNAL_MAX_H = 720;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b08);
scene.fog = new THREE.FogExp2(0x0a0e0a, 0.018);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, touchDevice ? 60 : 80);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
function applyRenderCap() {
  const viewW = Math.max(1, window.innerWidth);
  const viewH = Math.max(1, window.innerHeight);
  const scale = Math.min(1, INTERNAL_MAX_W / viewW, INTERNAL_MAX_H / viewH);
  const renderW = Math.max(320, Math.round(viewW * scale));
  const renderH = Math.max(180, Math.round(viewH * scale));
  camera.aspect = viewW / viewH;
  camera.updateProjectionMatrix();
  renderer.setSize(renderW, renderH, false);
  renderer.domElement.style.width = '100vw';
  renderer.domElement.style.height = '100vh';
  renderer.domElement.dataset.renderCap = `${renderW}x${renderH}`;
}
applyRenderCap();
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
$('#game').append(renderer.domElement);
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
  breakerOn: false,
  breakerOutAt: Infinity,
  nextSoundRippleAt: 0,
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
const sonarSkinMat = material(0x4b5a4f, 0.82, 0.04, loadTexture('sonar_skin_wet.png', 1, 1));
const sonarEarMat = material(0x6f2a23, 0.86, 0.02, loadTexture('sonar_ear_red.png', 1, 1));
const sonarMouthMat = material(0x4a0806, 0.7, 0.02, loadTexture('sonar_mouth_dark.png', 1, 1));

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
const classroomNodes = walkableNodes.filter((node) =>
  node.gz < GRID_H - 3 && Math.abs(node.gx - 6) > 1 && (node.gx + node.gz) % 2 === 0);
const exitNode = classroomNodes[Math.floor(Math.random() * classroomNodes.length)] || walkableNodes[0];
const exitPosition = new THREE.Vector3(exitNode.x, 0, exitNode.z);
const exitDoor = addBox(exitPosition.x, 1.45, exitPosition.z, 0.14, 2.9, 2.15, material(0x303a33, 0.48, 0.6));
addBox(exitPosition.x, 3.45, exitPosition.z, 0.08, 0.36, 1.2, material(0x1d6243, 0.35));
const exitLight = new THREE.PointLight(0x3acb88, 4.5, 5);
exitLight.position.set(exitPosition.x, 3.4, exitPosition.z);
scene.add(exitLight);
schoolLights.push(exitLight);

const breakerRoom = schoolRooms.find((room) => room.id === 'breaker');
const breakerCandidates = walkableNodes.filter((node) =>
  node.key !== exitNode.key && breakerRoom && node.gx >= breakerRoom.gx0 && node.gx <= breakerRoom.gx1 && node.gz >= breakerRoom.gz0 && node.gz <= breakerRoom.gz1);
const breakerNode = breakerCandidates[Math.floor(Math.random() * breakerCandidates.length)] || walkableNodes[walkableNodes.length - 1];
const breakerPosition = new THREE.Vector3(breakerNode.x, 0, breakerNode.z);
const breakerWallSide = breakerNode.gx <= GRID_HALF_W ? -1 : 1;
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


function addRoomFixtures(room) {
  const center = worldFromGrid((room.gx0 + room.gx1) / 2, (room.gz0 + room.gz1) / 2);
  if (room.id !== 'breaker') {
    addBox(center.x, 1.02, center.z - 1.25, 2.15, 0.08, 0.72, classroomFloorMat, true, false, false);
    addBox(center.x, 1.58, center.z + 1.58, 2.6, 1.05, 0.08, signMat, false, false, false);
  } else {
    addBox(center.x, 0.58, center.z + 1.1, 1.7, 1.16, 0.7, metalMat, true, false, false);
  }
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

const exitCounterCanvas = document.createElement('canvas');
exitCounterCanvas.width = 512;
exitCounterCanvas.height = 128;
const exitCounterContext = exitCounterCanvas.getContext('2d');
const exitCounterTexture = new THREE.CanvasTexture(exitCounterCanvas);
const exitCounter = new THREE.Sprite(new THREE.SpriteMaterial({ map: exitCounterTexture, transparent: true, depthTest: true }));
exitCounter.position.set(exitPosition.x, 3.45, exitPosition.z);
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
const keyCandidates = walkableNodes
  .filter((node) => node.key !== exitNode.key && node.key !== breakerNode.key && Math.hypot(node.gx - 6, node.gz - 18) > 3)
  .map((node) => [node.gx, node.gz]);
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
function sonarPart(name, geometry, mat, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  enemy.add(mesh);
  sonarParts[name] = mesh;
  return mesh;
}
sonarPart('body', new THREE.CapsuleGeometry(0.26, 1.28, 5, 8), sonarSkinMat, [0, 1.14, 0], [0.72, 1.18, 0.5]);
sonarPart('ribCage', new THREE.BoxGeometry(0.46, 0.7, 0.18), sonarSkinMat, [0, 1.55, 0.02], [1, 1, 1]);
sonarPart('head', new THREE.SphereGeometry(0.24, 10, 8), sonarSkinMat, [0, 2.28, 0.03], [0.78, 1.1, 0.72]);
sonarPart('mouth', new THREE.BoxGeometry(0.08, 1.18, 0.035), sonarMouthMat, [0, 1.67, 0.235], [1.0, 1.0, 1.0]);
sonarPart('leftEar', new THREE.SphereGeometry(0.28, 10, 8), sonarEarMat, [-0.36, 2.32, 0.02], [1.08, 1.48, 0.18], [0, 0.28, 0.18]);
sonarPart('rightEar', new THREE.SphereGeometry(0.28, 10, 8), sonarEarMat, [0.36, 2.32, 0.02], [1.08, 1.48, 0.18], [0, -0.28, -0.18]);
for (const side of [-1, 1]) {
  const prefix = side < 0 ? 'left' : 'right';
  sonarPart(`${prefix}UpperArm`, new THREE.CylinderGeometry(0.055, 0.075, 0.92, 6), sonarSkinMat, [side * 0.42, 1.22, 0.02], [1, 1, 1], [0.14, 0, side * 0.12]);
  sonarPart(`${prefix}ForeArm`, new THREE.CylinderGeometry(0.04, 0.06, 1.12, 6), sonarSkinMat, [side * 0.55, 0.55, 0.07], [1, 1, 1], [0.08, 0, side * 0.1]);
  sonarPart(`${prefix}Hand`, new THREE.SphereGeometry(0.08, 8, 6), sonarSkinMat, [side * 0.6, -0.05, 0.09], [0.7, 1.0, 0.45]);
  for (let i = 0; i < 3; i += 1) {
    sonarPart(`${prefix}Claw${i}`, new THREE.CylinderGeometry(0.012, 0.018, 0.32, 5), sonarMouthMat, [side * (0.55 + i * 0.055), -0.22, 0.13], [1, 1, 1], [0.55, 0, side * (0.15 + i * 0.05)]);
  }
  sonarPart(`${prefix}Thigh`, new THREE.CylinderGeometry(0.07, 0.095, 0.92, 6), sonarSkinMat, [side * 0.16, 0.55, 0], [1, 1, 1], [0.04, 0, side * 0.04]);
  sonarPart(`${prefix}Shin`, new THREE.CylinderGeometry(0.045, 0.07, 0.92, 6), sonarSkinMat, [side * 0.18, -0.14, 0.06], [1, 1, 1], [-0.12, 0, side * -0.03]);
  sonarPart(`${prefix}Foot`, new THREE.BoxGeometry(0.16, 0.08, 0.38), sonarSkinMat, [side * 0.18, -0.62, 0.19]);
}
enemy.scale.set(1.18, 1.18, 1.18);
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
const flashlight = new THREE.SpotLight(0xf4f1dc, 117, 138, Math.PI / 2.75, 0.86, 1.8);
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
  const now = clock.elapsedTime;
  const event = { x: camera.position.x, z: camera.position.z, strength, hearingRadius, age: 0, life: 2.4 };
  if (now >= state.nextSoundRippleAt) {
    soundEvents.push(event);
    state.nextSoundRippleAt = now + 2.6;
  }
  const distance = Math.hypot(enemy.position.x - event.x, enemy.position.z - event.z);
  if (distance <= hearingRadius) {
    if (enemyData.mode === 'PASSING_BY' && now < enemyData.passByUntil) return;
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
  audio.caveGain.gain.setTargetAtTime(0.06 + Math.sin(time * 0.17) * 0.012, audio.ctx.currentTime, 0.8);
  audio.caveLowpass.frequency.setTargetAtTime(145 + Math.sin(time * 0.09) * 32, audio.ctx.currentTime, 1.1);
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

function setBreaker(on) {
  state.breakerOn = on;
  state.breakerOutAt = on ? clock.elapsedTime + 180 : Infinity;
  breakerLight.color.set(on ? 0x7dffad : 0xff6d4d);
  breakerLight.intensity = on ? 2.6 : 0.35;
  breakerSwitch.material.color.set(on ? 0x7dffad : 0xff6d4d);
  breakerSwitch.material.emissive = new THREE.Color(on ? 0x1b7a3f : 0x5a120c);
  breakerSwitch.material.emissiveIntensity = on ? 0.75 : 0.35;
  showToast(on ? 'ブレーカーを入れた：3分間、校内が明るくなる' : 'ブレーカーが落ちた');
}

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
  state.nearBreaker = false;
  state.currentLocker = null;
  state.breakerOn = false;
  state.breakerOutAt = Infinity;
  state.nextSoundRippleAt = 0;
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
    lookBackUntil: 0,
    lookBackYaw: 0,
  });
  soundEvents.length = 0;
  sonarReveals.length = 0;
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
  if (state.hidden) {
    state.battery = Math.min(100, state.battery + dt * 1.35);
  } else if (state.flashlight) {
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
  const investigate = enemyData.mode === 'INVESTIGATING' || enemyData.mode === 'SEARCHING';
  const breathe = Math.sin(time * (chase ? 8.5 : 3.2));
  enemy.scale.y = 1.18 + breathe * (chase ? 0.035 : 0.018);
  if (sonarParts.leftEar && sonarParts.rightEar) {
    const earOpen = chase ? 0.42 : investigate ? 0.28 : 0.12;
    const twitch = Math.sin(time * 19) * (chase ? 0.07 : 0.025);
    sonarParts.leftEar.rotation.z = 0.18 + earOpen + twitch;
    sonarParts.rightEar.rotation.z = -0.18 - earOpen - twitch;
    sonarParts.leftEar.scale.y = 1.48 + Math.abs(breathe) * 0.1;
    sonarParts.rightEar.scale.y = 1.48 + Math.abs(breathe) * 0.1;
  }
  if (sonarParts.head) sonarParts.head.rotation.x = chase ? -0.22 + breathe * 0.03 : breathe * 0.02;
  if (sonarParts.mouth) sonarParts.mouth.scale.x = chase ? 1.55 + Math.abs(breathe) * 0.25 : 1.0;
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
  if (enemyData.path.length === 0) {
    if (enemyData.mode === 'PASSING_BY' && time < enemyData.passByUntil) {
      enemyData.lookBackUntil = time + 0.7 + Math.random() * 0.75;
    } else if (enemyData.mode === 'SEARCHING' && time >= enemyData.lookAroundUntil) chooseCoverSearchRoute();
    else if (!['INVESTIGATING', 'SEARCHING', 'PASSING_BY'].includes(enemyData.mode)) chooseRandomEnemyRoute();
  }
  const target = enemyData.path[0];
  if (target && time >= enemyData.pauseUntil && time >= enemyData.lookAroundUntil) {
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
        enemyData.path = [];
        if (enemyData.mode === 'HUNTING') choosePassByRoute(time);
        else enemyData.lookAroundUntil = Math.max(enemyData.lookAroundUntil, time + 0.8);
      }
    }
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
    ? String(0.13 + Math.sin(time * 7) * 0.07)
    : state.hidden && distance < 6 ? String(0.05 + Math.sin(time * 4) * 0.025) : '0';
  const clearAtCloseRange = !passByActive && distance < 1.45 && lineOfSightToPlayer;
  const fullyDetected = state.detection >= 99.5 && visible;
  if (!state.hidden && !exitGraceActive && (clearAtCloseRange || fullyDetected)) startCaughtCutscene();
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
  if (state.hidden) prompt = '[ E ] ロッカーから出る';
  else if (state.nearLocker) prompt = '[ E ] ロッカーの中に隠れる';
  else if (state.nearBreaker) prompt = state.breakerOn ? '[ E ] ブレーカーは入っている' : '[ E ] ブレーカーを入れる';
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
  $('#noise-bar').style.width = `${state.noise}%`;
  $('#noise-value').textContent = String(Math.round(state.noise)).padStart(2, '0');
  $('#detect-bar').style.width = `${state.detection}%`;
  $('#detect-value').textContent = String(Math.round(state.detection)).padStart(2, '0');
  $('#alert-text').textContent = alertLabels[state.alert];
  $('#alert-text').parentElement.classList.toggle('danger', state.alert === 'HUNTING');
  $('#move-mode').textContent = movementLabels[state.hidden ? 'HIDING' : state.moveMode];
  $('#battery-value').textContent = `${Math.ceil(state.battery)}%`;
  $('#battery-bar').style.width = `${state.battery}%`;
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
  flashlight.target.position.copy(camera.position).addScaledVector(forward, 24);
  fillLight.position.copy(camera.position);
  flashlight.intensity = (Math.random() < 0.006 ? 27 : 117) * (state.battery < 15 ? 0.55 + Math.sin(time * 17) * 0.35 : 1);
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
  renderer.render(scene, camera);
  perfFrames += 1;
  const now = performance.now();
  if (now - perfLast >= 500) {
    perfFps = Math.round((perfFrames * 1000) / (now - perfLast));
    perfFrames = 0;
    perfLast = now;
    const info = renderer.info.render;
    if (perfPanel) {
      perfPanel.textContent = `${PERF_BUILD_ID}\nFPS ${perfFps} / draw ${info.calls} / tris ${info.triangles}\nrender ${renderer.domElement.width}x${renderer.domElement.height} / window ${innerWidth}x${innerHeight}`;
    }
  }
}

chooseRandomEnemyRoute();
animate();

addEventListener('resize', applyRenderCap);
