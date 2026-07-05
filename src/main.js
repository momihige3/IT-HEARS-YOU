import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const $ = (selector) => document.querySelector(selector);
const touchDevice = matchMedia('(hover: none) and (pointer: coarse)').matches;
const INTERNAL_MAX_W = 1920;
const INTERNAL_MAX_H = 1080;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b08);
scene.fog = new THREE.FogExp2(0x0a0e0a, 0.018);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, touchDevice ? 60 : 80);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const RESOLUTION_TIERS = [1, 0.85, 0.7, 0.55, 0.42, 0.32];
let resolutionTierIndex = 0;
let dynamicResolutionScale = RESOLUTION_TIERS[resolutionTierIndex];
let lastResolutionAdjustAt = performance.now();
let highFpsSince = performance.now();
let lastPointerLockAttemptAt = 0;
let suppressEscapeUntil = 0;
let ignoreMouseMoveUntil = 0;
const MAX_POINTER_MOVEMENT = 240;
function getGameViewport() {
  const portraitPhone = touchDevice && matchMedia('(orientation: portrait)').matches;
  const stableScreenW = Math.max(1, window.screen?.width || 0);
  const stableScreenH = Math.max(1, window.screen?.height || 0);
  const rawW = portraitPhone
    ? stableScreenW
    : Math.max(1, window.visualViewport?.width || window.innerWidth);
  const rawH = portraitPhone
    ? stableScreenH
    : Math.max(1, window.visualViewport?.height || window.innerHeight);
  const longSide = Math.max(rawW, rawH);
  const shortSide = Math.min(rawW, rawH);
  return {
    width: portraitPhone ? longSide : rawW,
    height: portraitPhone ? shortSide : rawH,
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
  document.documentElement.style.setProperty('--game-landscape-w', `${viewW}px`);
  document.documentElement.style.setProperty('--game-landscape-h', `${viewH}px`);
  renderer.domElement.style.width = portraitPhone ? '100vh' : '100vw';
  renderer.domElement.style.height = portraitPhone ? '100vw' : '100vh';
  renderer.domElement.dataset.renderCap = `${renderW}x${renderH}`;
  document.body.classList.toggle('mobile-portrait-landscape', portraitPhone);
}

function tuneInitialResolutionForViewport() {
  const { width, height } = getGameViewport();
  const pixels = width * height;
  const preferredTier = pixels >= 7_000_000 ? 2 : pixels >= 4_000_000 ? 1 : 0;
  if (resolutionTierIndex >= preferredTier) return;
  resolutionTierIndex = preferredTier;
  dynamicResolutionScale = RESOLUTION_TIERS[resolutionTierIndex];
  lastResolutionAdjustAt = performance.now();
  applyRenderCap();
}
applyRenderCap();
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
$('#game').append(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = 'none';
const eyeScareElement = $('#eye-scare');
const eyeScarePreload = new Image();
eyeScarePreload.decoding = 'async';
eyeScarePreload.onload = () => eyeScareElement?.classList.add('image-ready');
eyeScarePreload.src = './images/eye_scare.png';
if (eyeScarePreload.complete && eyeScarePreload.naturalWidth > 0) eyeScareElement?.classList.add('image-ready');
const gameOverPreloadImages = ['./images/eye_scare.png', './images/daruma_gameover.png'].map((src) => {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  return image;
});
// Mobile play protection: disable text selection, long-press menu, pinch-zoom, and double-tap zoom.
document.addEventListener('contextmenu', (event) => {
  if (touchDevice || state?.mapMode === 'train') event.preventDefault();
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
let perfFrames = 0;
let perfLast = performance.now();
let perfFps = 0;

const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = 0.45;

const COIN_STORAGE_KEY = 'it-hears-you-coins';
const SHOP_UPGRADES_STORAGE_KEY = 'it-hears-you-shop-upgrades';
function loadPersistentCoins() {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(COIN_STORAGE_KEY) || '0', 10) || 0);
  } catch {
    return 0;
  }
}
function savePersistentCoins() {
  try {
    localStorage.setItem(COIN_STORAGE_KEY, String(Math.max(0, Math.floor(state.coins))));
  } catch {
    // Storage can be unavailable in private/browser-restricted modes; gameplay still works in-memory.
  }
}
function loadPersistentShopUpgrades() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHOP_UPGRADES_STORAGE_KEY) || '{}');
    const purchased = parsed.purchased || {};
    const enabled = parsed.enabled || {};
    const legacy = (key) => parsed[key] === true;
    const owned = (key) => purchased[key] === true || legacy(key);
    const active = (key) => owned(key) && enabled[key] !== false;
    return {
      purchased: {
        noise: owned('noise'),
        breaker: owned('breaker'),
        light: owned('light'),
        stun: owned('stun'),
        breakerSkip: owned('breakerSkip'),
        map: owned('map'),
        radar: owned('radar'),
      },
      enabled: {
        noise: active('noise'),
        breaker: active('breaker'),
        light: active('light'),
        stun: active('stun'),
        breakerSkip: active('breakerSkip'),
        map: active('map'),
        radar: active('radar'),
      },
    };
  } catch {
    return {
      purchased: { noise: false, breaker: false, light: false, stun: false, breakerSkip: false, map: false, radar: false },
      enabled: { noise: false, breaker: false, light: false, stun: false, breakerSkip: false, map: false, radar: false },
    };
  }
}
function savePersistentShopUpgrades() {
  try {
    const purchased = state.shopPurchased || {};
    localStorage.setItem(SHOP_UPGRADES_STORAGE_KEY, JSON.stringify({
      purchased,
      enabled: {
        noise: state.noiseMultiplier <= 0.5,
        breaker: state.breakerDurationMultiplier >= 2,
        light: state.lightRangeMultiplier >= 2,
        stun: state.ghostStunTimeMultiplier <= 0.5,
        breakerSkip: state.breakerMiniGameSkip === true,
        map: state.hasFullMap === true,
        radar: state.hasRadar === true,
      },
      // Legacy flags are kept for older saves/tools that only inspect booleans.
      noise: purchased.noise === true,
      breaker: purchased.breaker === true,
      light: purchased.light === true,
      stun: purchased.stun === true,
      breakerSkip: purchased.breakerSkip === true,
      map: purchased.map === true,
      radar: purchased.radar === true,
    }));
  } catch {
    // Storage can be unavailable in private/browser-restricted modes; gameplay still works in-memory.
  }
}
const savedShopUpgrades = loadPersistentShopUpgrades();

function syncUnlockUI() {
  document.body.classList.toggle('map-unlocked', state?.hasFullMap === true);
  document.body.classList.toggle('radar-locked', state?.hasRadar !== true);
}

const state = {
  started: false,
  loading: false,
  ended: false,
  caught: false,
  caughtAt: 0,
  hidden: false,
  keyCount: 0,
  flashlight: true,
  battery: 100,
  hp: 100,
  coins: loadPersistentCoins(),
  nearShop: false,
  shopOpen: false,
  nextCoinAt: 0,
  shopPurchased: { ...savedShopUpgrades.purchased },
  noiseMultiplier: savedShopUpgrades.enabled.noise ? 0.5 : 1,
  breakerDurationMultiplier: savedShopUpgrades.enabled.breaker ? 2 : 1,
  lightRangeMultiplier: savedShopUpgrades.enabled.light ? 2 : 1,
  ghostStunTimeMultiplier: savedShopUpgrades.enabled.stun ? 0.5 : 1,
  breakerMiniGameSkip: savedShopUpgrades.enabled.breakerSkip === true,
  hasFullMap: savedShopUpgrades.enabled.map === true,
  hasRadar: savedShopUpgrades.enabled.radar === true,
  mapMode: 'school',
  screenFlashUntil: 0,
  screenFlashColor: 'red',
  nextHealAt: 0,
  breakerOn: false,
  breakerOutAt: Infinity,
  seatedUntil: 0,
  nextRoarAt: 0,
  roarUntil: 0,
  nextRoarDamageAt: Infinity,
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
  floorLevel: 1,
  currentLocker: null,
  lockerFrontYaw: 0,
  lockerLookOffset: 0,
  lockerExitGraceUntil: 0,
  lockerHideAt: -Infinity,
  lockerHideStartDetection: 0,
  ghostLightSeconds: 0,
  ghostStunCount: 0,
  nextGhostIllusionAt: Infinity,
  ghostIllusionQueue: 0,
  fakeOfudaAlertUntil: 0,
  fullMapOpen: false,
  breakerGameOpen: false,
  nextEyeScareAt: Infinity,
  eyeScareUntil: 0,
  settingsOpen: false,
  allowExit: false,
  bob: 0,
};

const TRAIN_OFFSET_X = -120;
const TRAIN_START_Z = 18;
const TRAIN_CAR_LENGTH = 36;
const TRAIN_CAR_COUNT = 10;
const TRAIN_WIDTH = 4.2;
const trainRuntimeObjects = [];
const darumaState = {
  active: false,
  game: 1,
  sequenceIndex: 0,
  nextSyllableAt: Infinity,
  finalDaAt: -Infinity,
  freezeUntilNext: false,
  nextRoundAt: Infinity,
  eyesClosed: false,
  lastX: 0,
  lastZ: 0,
  resetUsed: false,
  ghostActive: false,
  ghostUntil: 0,
  ghostNextAt: Infinity,
  noiseUntil: 0,
  speedRound: false,
  hyperSpeedRound: false,
  skipRound: false,
  skipFinalStarted: false,
  invincible: false,
  clearBannerUntil: 0,
  monster: null,
  ghost: null,
};

const keys = {};
const movementKeyCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);
const mobileInput = {
  active: touchDevice,
  moveX: 0,
  moveY: 0,
  running: false,
};
syncUnlockUI();
const colliders = [];
const COLLIDER_BUCKET_SIZE = 6;
let colliderSpatialCount = -1;
let colliderSpatialBuckets = new Map();
const schoolRuntimeObjects = [];
const lockers = [];
const soundEvents = [];
const sonarReveals = [];
const noiseTraps = [];
const healItems = [];
const coinItems = [];
const fakeOfudaItems = [];
let shop = null;
const selectedMapCache = {
  school: { ready: true, generatedAt: performance.now() },
  mansion: { ready: false, generatedAt: 0 },
};
const CELL = 4;
const GRID_W = 25;
const GRID_H = 19;
const GRID_HALF_W = (GRID_W - 1) / 2;
const GRID_HALF_H = (GRID_H - 1) / 2;
const MANSION_OFFSET_X = 96;
const MANSION_CENTER_Z = -12;
const MANSION_MIN_IX = -6;
const MANSION_MAX_IX = 6;
const MANSION_MIN_IZ = -9;
const MANSION_MAX_IZ = 10;
const REQUIRED_KEYS = 5;
const KEY_DETECTION_FLOOR_STEP = 10;
const walkable = new Set();
const navNodes = new Map();
const schoolFloorMeshes = [];
const schoolCeilingMeshes = [];
const mansionFloorMeshes = [];
const mansionCeilingMeshes = [];

function inSchoolBounds(x, z) {
  const maxX = GRID_HALF_W * CELL + CELL / 2;
  const maxZ = GRID_HALF_H * CELL + CELL / 2;
  return x >= -maxX && x <= maxX && z >= -maxZ && z <= maxZ;
}

function inMansionBounds(x, z) {
  const margin = CELL * 1.25;
  return x >= MANSION_OFFSET_X + MANSION_MIN_IX * CELL - CELL / 2 - margin
    && x <= MANSION_OFFSET_X + MANSION_MAX_IX * CELL + CELL / 2 + margin
    && z >= MANSION_CENTER_Z + MANSION_MIN_IZ * CELL - CELL / 2 - margin
    && z <= MANSION_CENTER_Z + MANSION_MAX_IZ * CELL + CELL / 2 + margin;
}

function markSharedObject(object) {
  if (!object) return object;
  object.userData.preserveOnMapCleanup = true;
  return object;
}

const cleanupPosition = new THREE.Vector3();
function getWorldXZ(object) {
  object.updateWorldMatrix?.(true, false);
  object.getWorldPosition(cleanupPosition);
  return { x: cleanupPosition.x, z: cleanupPosition.z };
}

function removeSceneObject(object) {
  if (!object || object.userData?.preserveOnMapCleanup) return;
  object.traverse?.((child) => {
    if (child.geometry) child.geometry.dispose();
  });
  object.removeFromParent?.();
}

function removeArrayItemsByBounds(items, shouldRemove, removeObject) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    const pos = item?.position
      ? item.position
      : item?.group
        ? getWorldXZ(item.group)
        : item;
    if (!pos || !shouldRemove(pos.x, pos.z)) continue;
    removeObject?.(item);
    items.splice(i, 1);
  }
}

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
const sonarSkinFileMap = loadTexture('sonar_skin_wet.png', 1.7, 2.8);
const sonarEarFileMap = loadTexture('sonar_ear_red.png', 1.15, 1.15);
const sonarMouthFileMap = loadTexture('sonar_mouth_dark.png', 1.2, 2.2);
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
  color: 0x8a938b,
  roughness: 0.31,
  metalness: 0.02,
  map: sonarSkinFileMap,
  normalMap: sonarSkinNormal,
  normalScale: new THREE.Vector2(0.68, 0.96),
  emissive: 0x070a07,
  emissiveIntensity: 0.055,
});
const sonarEarMat = new THREE.MeshStandardMaterial({
  color: 0xc48a78,
  roughness: 0.48,
  metalness: 0.01,
  map: sonarEarFileMap,
  normalMap: sonarEarNormal,
  normalScale: new THREE.Vector2(0.52, 0.78),
  side: THREE.DoubleSide,
});
const sonarMouthMat = new THREE.MeshStandardMaterial({
  color: 0xb5382c,
  roughness: 0.24,
  metalness: 0.01,
  map: sonarMouthFileMap,
  normalMap: sonarSkinNormal,
  normalScale: new THREE.Vector2(0.62, 0.82),
  emissive: 0x260302,
  emissiveIntensity: 0.24,
});

function worldFromGrid(gx, gz) {
  return new THREE.Vector3((gx - GRID_HALF_W) * CELL, 0, (gz - GRID_HALF_H) * CELL);
}

function gridFromWorld(x, z) {
  return {
    gx: Math.round(x / CELL + GRID_HALF_W),
    gz: Math.round(z / CELL + GRID_HALF_H),
  };
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
  { id: 'breaker', name: '倉庫', gx0: 1, gx1: 3, gz0: 15, gz1: 17, connector: [[4, 16], [5, 16], [6, 16]], sign: { gx: 3.55, gz: 16, side: 'east' } },
  { id: 'classroom-a', name: '1年A組', gx0: 9, gx1: 11, gz0: 14, gz1: 17, connector: [[8, 16], [7, 16], [6, 16]], sign: { gx: 8.45, gz: 16, side: 'west' } },
  { id: 'science', name: '理科室', gx0: 1, gx1: 3, gz0: 1, gz1: 3, connector: [[4, 2], [5, 2], [6, 2]], sign: { gx: 3.55, gz: 2, side: 'east' } },
  { id: 'nurse', name: '保健室', gx0: 9, gx1: 11, gz0: 1, gz1: 3, connector: [[8, 2], [7, 2], [6, 2]], sign: { gx: 8.45, gz: 2, side: 'west' } },
  { id: 'staff', name: '職員室', gx0: 1, gx1: 4, gz0: 8, gz1: 10, connector: [[5, 9], [6, 9]], sign: { gx: 4.55, gz: 9, side: 'east' } },
  { id: 'music', name: '音楽室', gx0: 8, gx1: 11, gz0: 8, gz1: 10, connector: [[7, 9], [6, 9]], sign: { gx: 7.45, gz: 9, side: 'west' } },
  { id: 'classroom-b', name: '2年B組', gx0: 17, gx1: 22, gz0: 14, gz1: 17, connector: [[16, 16], [15, 16], [14, 16]], sign: { gx: 16.45, gz: 16, side: 'west' } },
  { id: 'art', name: '美術室', gx0: 17, gx1: 22, gz0: 8, gz1: 10, connector: [[16, 9], [15, 9], [14, 9]], sign: { gx: 16.45, gz: 9, side: 'west' } },
  { id: 'library', name: '図書室', gx0: 17, gx1: 22, gz0: 1, gz1: 3, connector: [[16, 2], [15, 2], [14, 2]], sign: { gx: 16.45, gz: 2, side: 'west' } },
];

function getRoomAt(gx, gz) {
  return schoolRooms.find((room) => gx >= room.gx0 && gx <= room.gx1 && gz >= room.gz0 && gz <= room.gz1) || null;
}

function shuffledDirections() {
  return [...directions].sort(() => Math.random() - 0.5);
}

// Randomized school layout: carve a true maze first, then attach rooms to it.
function carveSchoolMaze() {
  const visited = new Set();
  const stack = [{ gx: 1, gz: 1 }];
  visited.add(gridKey(1, 1));
  carve(1, 1);
  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = shuffledDirections()
      .map(([dx, dz]) => ({ gx: current.gx + dx * 2, gz: current.gz + dz * 2, dx, dz }))
      .filter((next) => next.gx > 0 && next.gx < GRID_W - 1 && next.gz > 0 && next.gz < GRID_H - 1 && !visited.has(gridKey(next.gx, next.gz)));
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const next = choices[0];
    carve(current.gx + next.dx, current.gz + next.dz);
    carve(next.gx, next.gz);
    visited.add(gridKey(next.gx, next.gz));
    stack.push({ gx: next.gx, gz: next.gz });
  }
  // Add a few loops and dead-end side branches so runs do not feel identical.
  for (let i = 0; i < 14; i += 1) {
    const gx = 1 + Math.floor(Math.random() * (GRID_W - 2));
    const gz = 1 + Math.floor(Math.random() * (GRID_H - 2));
    const [dx, dz] = directions[Math.floor(Math.random() * directions.length)];
    carve(gx, gz);
    carve(gx + dx, gz + dz);
  }
}

carveSchoolMaze();
carve(6, 18);
carve(6, 17);

for (const room of schoolRooms) {
  for (let gx = room.gx0; gx <= room.gx1; gx += 1) {
    for (let gz = room.gz0; gz <= room.gz1; gz += 1) carve(gx, gz);
  }
  for (const [gx, gz] of room.connector) carve(gx, gz);
}

function carvePath(gx0, gz0, gx1, gz1) {
  let gx = gx0;
  let gz = gz0;
  const horizontalFirst = Math.random() < 0.5;
  const carveHorizontal = () => {
    while (gx !== gx1) {
      carve(gx, gz);
      gx += Math.sign(gx1 - gx);
    }
  };
  const carveVertical = () => {
    while (gz !== gz1) {
      carve(gx, gz);
      gz += Math.sign(gz1 - gz);
    }
  };
  if (horizontalFirst) {
    carveHorizontal();
    carveVertical();
  } else {
    carveVertical();
    carveHorizontal();
  }
  carve(gx1, gz1);
}

function ensureSchoolBackRoute() {
  // Keep the layout maze-like, but never allow the start/front side to be sealed
  // away from the far rooms. This route intentionally bends several times instead
  // of restoring the old straight central hallway.
  const route = [
    [6, 18], [6, 17], [5, 17], [5, 14],
    [3, 14], [3, 11], [7, 11], [7, 7],
    [5, 7], [5, 4], [6, 4], [6, 2],
    [12, 2], [18, 2], [18, 9], [18, 16], [12, 16], [6, 16],
  ];
  for (let i = 0; i < route.length - 1; i += 1) {
    carvePath(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1]);
  }
  // Connect each room's doorway to the guaranteed route/maze so random room
  // linking cannot leave a required room stranded behind walls.
  for (const room of schoolRooms) {
    const [doorGx, doorGz] = room.connector[room.connector.length - 1] || [Math.round((room.gx0 + room.gx1) / 2), Math.round((room.gz0 + room.gz1) / 2)];
    const nearestRoute = route
      .map(([gx, gz]) => ({ gx, gz, distance: Math.abs(gx - doorGx) + Math.abs(gz - doorGz) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearestRoute) carvePath(doorGx, doorGz, nearestRoute.gx, nearestRoute.gz);
  }
  carvePath(6, 2, 18, 2);
  carvePath(6, 9, 18, 9);
  carvePath(6, 16, 18, 16);
  carvePath(12, 2, 12, 16);
  carvePath(18, 2, 18, 16);
}

ensureSchoolBackRoute();

// Extra room-to-room connectors make the map less dependent on the center spine,
// while every branch still remains reachable from the main school route.
const roomAnchors = schoolRooms.map((room) => ({
  gx: Math.round((room.gx0 + room.gx1) / 2),
  gz: Math.round((room.gz0 + room.gz1) / 2),
}));
for (let i = 0; i < roomAnchors.length - 1; i += 1) {
  if (Math.random() < 0.92) carvePath(roomAnchors[i].gx, roomAnchors[i].gz, roomAnchors[i + 1].gx, roomAnchors[i + 1].gz);
}

function roomOpeningKey(room, side, index) {
  return `${room.id}:${side}:${index}`;
}

const roomOpenings = new Set();

function addRoomOpening(room, side, index) {
  roomOpenings.add(roomOpeningKey(room, side, index));
}

function registerRoomOpenings() {
  for (const room of schoolRooms) {
    const side = room.sign.side;
    const doorIndex = Math.round(side === 'east' || side === 'west' ? room.sign.gz : room.sign.gx);
    addRoomOpening(room, side, doorIndex);
    const candidates = [];
    for (let gz = room.gz0; gz <= room.gz1; gz += 1) {
      if (walkable.has(gridKey(room.gx0 - 1, gz))) candidates.push({ side: 'west', index: gz, score: Math.abs(gz - doorIndex) + 0.1 });
      if (walkable.has(gridKey(room.gx1 + 1, gz))) candidates.push({ side: 'east', index: gz, score: Math.abs(gz - doorIndex) + 0.1 });
    }
    for (let gx = room.gx0; gx <= room.gx1; gx += 1) {
      if (walkable.has(gridKey(gx, room.gz0 - 1))) candidates.push({ side: 'north', index: gx, score: Math.abs(gx - ((room.gx0 + room.gx1) / 2)) + 0.35 });
      if (walkable.has(gridKey(gx, room.gz1 + 1))) candidates.push({ side: 'south', index: gx, score: Math.abs(gx - ((room.gx0 + room.gx1) / 2)) + 0.35 });
    }
    const unique = candidates
      .filter((candidate) => roomOpeningKey(room, candidate.side, candidate.index) !== roomOpeningKey(room, side, doorIndex))
      .sort((a, b) => a.score - b.score);
    for (const candidate of unique.slice(0, 2)) addRoomOpening(room, candidate.side, candidate.index);
  }
}

function isRoomOpening(room, side, index) {
  return roomOpenings.has(roomOpeningKey(room, side, index));
}
for (let i = 0; i < 8; i += 1) {
  const a = roomAnchors[Math.floor(Math.random() * roomAnchors.length)];
  const b = roomAnchors[Math.floor(Math.random() * roomAnchors.length)];
  if (a && b && a !== b) carvePath(a.gx, a.gz, b.gx, b.gz);
}
registerRoomOpenings();

function addBox(x, y, z, w, h, d, mat, collide = false, wall = false, castShadow = true, kind = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  if (mansionBuilt && inMansionBounds(x, z)) registerMansionObject(mesh);
  else if (inSchoolBounds(x, z)) schoolRuntimeObjects.push(mesh);
  if (collide) colliders.push({ x, z, hw: w / 2, hz: d / 2, wall, kind });
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
    if (!(doorOnWest && gz === doorZ) && !isRoomOpening(room, 'west', gz)) {
      addBox(west.x - CELL / 2, 2.05, west.z, 0.36, 4.2, CELL + 0.36, wallMat, true, true, false);
    }
    if (!(doorOnEast && gz === doorZ) && !isRoomOpening(room, 'east', gz)) {
      addBox(east.x + CELL / 2, 2.05, east.z, 0.36, 4.2, CELL + 0.36, wallMat, true, true, false);
    }
  }
  for (let gx = room.gx0; gx <= room.gx1; gx += 1) {
    const north = worldFromGrid(gx, room.gz0);
    const south = worldFromGrid(gx, room.gz1);
    if (!isRoomOpening(room, 'north', gx)) {
      addBox(north.x, 2.05, north.z - CELL / 2, CELL + 0.36, 4.2, 0.36, wallMat, true, true, false);
    }
    if (!isRoomOpening(room, 'south', gx)) {
      addBox(south.x, 2.05, south.z + CELL / 2, CELL + 0.36, 4.2, 0.36, wallMat, true, true, false);
    }
  }
}

const schoolLights = [];
let corridorLightCount = 0;
for (const key of walkable) {
  const [gx, gz] = key.split(',').map(Number);
  const pos = worldFromGrid(gx, gz);
  navNodes.set(key, { key, gx, gz, x: pos.x, z: pos.z });
  const room = getRoomAt(gx, gz);
  const floor = addBox(pos.x, -0.12, pos.z, CELL + 0.04, 0.25, CELL + 0.04, room ? classroomFloorMat : floorMat, false, false, false);
  floor.userData.mapMode = 'school';
  floor.userData.mapSurface = 'floor';
  floor.userData.gridKey = key;
  schoolFloorMeshes.push(floor);
  const ceiling = addBox(pos.x, 4.25, pos.z, CELL + 0.05, 0.18, CELL + 0.05, ceilingMat, false, false, false);
  ceiling.userData.mapMode = 'school';
  ceiling.userData.mapSurface = 'ceiling';
  ceiling.userData.gridKey = key;
  schoolCeilingMeshes.push(ceiling);

  for (const [dx, dz] of directions) {
    if (walkable.has(gridKey(gx + dx, gz + dz))) continue;
    if (dx !== 0) addBox(pos.x + dx * CELL / 2, 2.05, pos.z, 0.36, 4.2, CELL + 0.36, wallMat, true, true);
    else addBox(pos.x, 2.05, pos.z + dz * CELL / 2, CELL + 0.36, 4.2, 0.36, wallMat, true, true);
  }

  if ((gx * 5 + gz * 3) % 9 === 0) {
    const fixture = addBox(pos.x, 4.08, pos.z, 1.25, 0.08, 0.28, material(0xdfe6d5, 0.28), false, false, false);
    fixture.material.emissive = new THREE.Color(0x68745d);
    fixture.material.emissiveIntensity = 1.4;
    if (corridorLightCount < 12) {
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
markSharedObject(hemisphereLight);
markSharedObject(ambientLight);
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

function addLockerSpotlight(x, z, yaw, mansion = false) {
  const light = new THREE.PointLight(0xdde7ff, mansion ? 1.05 : 0.85, 4.6, 1.7);
  light.position.set(x - Math.sin(yaw) * 0.95, 2.35, z - Math.cos(yaw) * 0.95);
  light.castShadow = false;
  scene.add(light);
  schoolLights.push(light);
  if (mansion) {
    registerMansionObject(light);
  } else {
    markSharedObject(light);
  }
  return light;
}

function createMansionLockerAt(x, z, yaw) {
  const group = new THREE.Group();
  localBox(group, 0, 1.2, -0.34, 1.15, 2.4, 0.14, mansionTrimMat);
  localBox(group, -0.55, 1.2, 0, 0.12, 2.4, 0.8, mansionTrimMat);
  localBox(group, 0.55, 1.2, 0, 0.12, 2.4, 0.8, mansionTrimMat);
  localBox(group, 0, 2.42, 0, 1.15, 0.12, 0.86, mansionTrimMat);
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  group.userData.locker = true;
  scene.add(group);
  registerMansionObject(group);
  lockers.push({ group, x, z, yaw, insideLocalY: 1.46, outsideLocalY: 1.68 });
  colliders.push({ x, z, hw: Math.abs(Math.sin(yaw)) > 0.5 ? 0.46 : 0.62, hz: Math.abs(Math.sin(yaw)) > 0.5 ? 0.62 : 0.46 });
  addLockerSpotlight(x, z, yaw, true);
  return group;
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
    x -= 1.22;
    yaw = Math.PI / 2;
  } else if (wallSide === 'east') {
    x += 1.22;
    yaw = -Math.PI / 2;
  } else if (wallSide === 'north') {
    z -= 1.22;
    yaw = 0;
  } else {
    z += 1.22;
    yaw = Math.PI;
  }
  group.position.set(x, 1.25, z);
  group.rotation.y = yaw;
  scene.add(group);
  const sideways = Math.abs(Math.sin(yaw)) > 0.5;
  colliders.push({ x, z, hw: sideways ? 0.46 : 0.56, hz: sideways ? 0.56 : 0.46 });
  const locker = { group, x, z, yaw };
  lockers.push(locker);
  addLockerSpotlight(x, z, yaw, false);
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

function schoolLockerCount() {
  return lockers.filter((locker) => !inMansionBounds(locker.x, locker.z)).length;
}

function ensureMinimumSchoolLockers(minCount = 5) {
  if (schoolLockerCount() >= minCount) return;
  const sides = [
    ['west', [-1, 0]],
    ['east', [1, 0]],
    ['north', [0, -1]],
    ['south', [0, 1]],
  ];
  const candidates = [...walkable]
    .map((key) => key.split(',').map(Number))
    .filter(([gx, gz]) => gx > 0 && gx < GRID_W - 1 && gz > 0 && gz < GRID_H - 1)
    .sort(() => Math.random() - 0.5);
  for (const [gx, gz] of candidates) {
    if (schoolLockerCount() >= minCount) break;
    if (isLockerEntranceBlocked(gx, gz)) continue;
    const pos = worldFromGrid(gx, gz);
    if (lockers.some((locker) => !inMansionBounds(locker.x, locker.z) && Math.hypot(locker.x - pos.x, locker.z - pos.z) < 5.5)) continue;
    for (const [side, delta] of sides.sort(() => Math.random() - 0.5)) {
      if (walkable.has(gridKey(gx + delta[0], gz + delta[1]))) continue;
      if (makeSafeLocker(gx, gz, side)) break;
    }
  }
}

function gameRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] / 0x100000000;
  }
  return Math.random();
}

function shuffleCopy(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(gameRandom() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

[
  [1, 4, 'west'], [11, 4, 'east'], [1, 10, 'west'], [11, 12, 'east'],
  [2, 6, 'west'], [10, 6, 'east'], [2, 12, 'west'], [10, 14, 'east'],
].forEach(([gx, gz, wallSide]) => makeSafeLocker(gx, gz, wallSide));
ensureMinimumSchoolLockers(5);

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
  let x = cell.x + (awayX ? awayX * Math.max(1.18, Math.abs(offsetX)) : offsetX);
  let z = cell.z + (awayZ ? awayZ * Math.max(1.18, Math.abs(offsetZ)) : offsetZ);
  if (isInSchoolEntranceClearZone(x, z, 3.15)) {
    const sign = worldFromGrid(room.sign.gx, room.sign.gz);
    const awayFromDoorX = center.x - sign.x;
    const awayFromDoorZ = center.z - sign.z;
    const len = Math.hypot(awayFromDoorX, awayFromDoorZ) || 1;
    x = center.x + (awayFromDoorX / len) * 1.25;
    z = center.z + (awayFromDoorZ / len) * 1.25;
  }
  if (type === 'cabinet') {
    addBox(x, 1.15, z, 1.05, 2.3, 0.82, cabinetMat, true, false, true, 'furniture');
    addBox(x, 1.55, z + 0.425, 0.72, 0.06, 0.025, darkMat);
    addBox(x, 1.38, z + 0.425, 0.72, 0.06, 0.025, darkMat);
  } else {
    addBox(x, 0.58, z, 1.2, 1.16, 1.05, crateMat, true, false, true, 'furniture');
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

function hasNonWallColliderOverlap(x, z, padding = 0.42) {
  return colliders.some((collider) =>
    !collider.wall
    && Math.abs(x - collider.x) < collider.hw + padding
    && Math.abs(z - collider.z) < collider.hz + padding);
}

function hasFurnitureOverlap(x, z, padding = 0.42) {
  return colliders.some((collider) =>
    collider.kind === 'furniture'
    && Math.abs(x - collider.x) < collider.hw + padding
    && Math.abs(z - collider.z) < collider.hz + padding);
}

function isObjectInLockerFrontZone(locker, x, z, hw = 0, hz = 0, padding = 0.22) {
  const frontX = Math.sin(locker.yaw || 0);
  const frontZ = Math.cos(locker.yaw || 0);
  const sideX = Math.cos(locker.yaw || 0);
  const sideZ = -Math.sin(locker.yaw || 0);
  const dx = x - locker.x;
  const dz = z - locker.z;
  const forward = dx * frontX + dz * frontZ;
  const lateral = dx * sideX + dz * sideZ;
  const radius = Math.max(hw, hz) + padding;
  return forward > 0.18 && forward < 3.05 + radius && Math.abs(lateral) < 1.05 + radius;
}

function isAnyLockerFrontBlockedByObject(x, z, hw = 0, hz = 0, padding = 0.22) {
  return lockers.some((locker) => isObjectInLockerFrontZone(locker, x, z, hw, hz, padding));
}

function isNearSchoolDoorOrConnector(x, z, minDistance = 2.35, includeConnectors = true) {
  return schoolRooms.some((room) => {
    const sign = worldFromGrid(room.sign.gx, room.sign.gz);
    if (Math.hypot(x - sign.x, z - sign.z) < minDistance + 0.55) return true;
    if (!includeConnectors) return false;
    return room.connector.some(([gx, gz]) => {
      const pos = worldFromGrid(gx, gz);
      return Math.hypot(x - pos.x, z - pos.z) < minDistance;
    });
  });
}

function schoolDoorWorldPoints(room) {
  const points = [];
  const sign = worldFromGrid(room.sign.gx, room.sign.gz);
  points.push({ x: sign.x, z: sign.z });
  for (const [gx, gz] of room.connector) {
    const pos = worldFromGrid(gx, gz);
    points.push({ x: pos.x, z: pos.z });
  }
  for (let gz = room.gz0; gz <= room.gz1; gz += 1) {
    if (isRoomOpening(room, 'west', gz)) {
      const p = worldFromGrid(room.gx0, gz);
      points.push({ x: p.x - CELL / 2, z: p.z });
    }
    if (isRoomOpening(room, 'east', gz)) {
      const p = worldFromGrid(room.gx1, gz);
      points.push({ x: p.x + CELL / 2, z: p.z });
    }
  }
  for (let gx = room.gx0; gx <= room.gx1; gx += 1) {
    if (isRoomOpening(room, 'north', gx)) {
      const p = worldFromGrid(gx, room.gz0);
      points.push({ x: p.x, z: p.z - CELL / 2 });
    }
    if (isRoomOpening(room, 'south', gx)) {
      const p = worldFromGrid(gx, room.gz1);
      points.push({ x: p.x, z: p.z + CELL / 2 });
    }
  }
  return points;
}

function isNearSchoolEntranceStrict(x, z, radius = 4.4) {
  return schoolRooms.some((room) =>
    schoolDoorWorldPoints(room).some((point) => Math.hypot(x - point.x, z - point.z) < radius));
}

function schoolRoomById(id) {
  return schoolRooms.find((room) => room.id === id) || null;
}

function schoolRoomAtWorld(x, z) {
  const { gx, gz } = gridFromWorld(x, z);
  return getRoomAt(gx, gz);
}

function isInSchoolEntranceClearZone(x, z, radius = 2.65) {
  return schoolRooms.some((room) => {
    const sign = worldFromGrid(room.sign.gx, room.sign.gz);
    if (Math.hypot(x - sign.x, z - sign.z) < radius) return true;
    const doorCell = room.connector[0];
    if (doorCell) {
      const door = worldFromGrid(doorCell[0], doorCell[1]);
      if (Math.hypot(x - door.x, z - door.z) < radius * 0.82) return true;
    }
    return false;
  });
}

function isLockerFrontClear(x, z, yaw, padding = 0.24) {
  const virtualLocker = { x, z, yaw };
  return !colliders.some((collider) =>
    !collider.wall
    && isObjectInLockerFrontZone(virtualLocker, collider.x, collider.z, collider.hw, collider.hz, padding));
}

function isClearOfMansionUtilities(x, z, minDistance = 3.2) {
  if (mansionExit && Math.hypot(x - mansionExit.x, z - mansionExit.z) < minDistance) return false;
  if (mansionBreakerPanel && Math.hypot(x - mansionBreakerPanel.position.x, z - mansionBreakerPanel.position.z) < minDistance) return false;
  if (mansionShop && Math.hypot(x - mansionShop.x, z - mansionShop.z) < minDistance) return false;
  return true;
}

function canPlaceFurnitureAt(x, z, hw = 0.72, hz = 0.72, padding = 0.56) {
  if (colliders.some((collider) =>
    Math.abs(x - collider.x) < collider.hw + hw + padding
    && Math.abs(z - collider.z) < collider.hz + hz + padding)) return false;
  if (inSchoolBounds(x, z) && isInSchoolEntranceClearZone(x, z, 2.2 + Math.max(hw, hz) * 0.32)) return false;
  if (lockers.some((locker) => Math.hypot(locker.x - x, locker.z - z) < 2.1 + padding)) return false;
  if (isAnyLockerFrontBlockedByObject(x, z, hw, hz, padding)) return false;
  if (shop && horizontalDistance({ x, z }, shop) < 2.4 + padding) return false;
  if (mansionShop && horizontalDistance({ x, z }, mansionShop) < 2.4 + padding) return false;
  if (mansionBreakerPanel && horizontalDistance({ x, z }, mansionBreakerPanel.position) < 2.2 + padding) return false;
  return true;
}

function isSafeSpawnPoint(x, z, padding = 0.46) {
  return !hasColliderOverlap(x, z, padding);
}

function findSafeNode(filter = () => true, fallback = null) {
  const choices = walkableNodes.filter((node) => filter(node) && isSafeSpawnPoint(node.x, node.z, 0.48));
  return choices[Math.floor(Math.random() * choices.length)] || fallback || walkableNodes.find((node) => isSafeSpawnPoint(node.x, node.z, 0.48)) || walkableNodes[0];
}

const mansionFloorMat = material(0x6b4b35, 0.9, 0.02, loadTexture('old_door_wood.png', 2.6, 2.6));
const mansionWallMat = material(0x5b554b, 0.96, 0.02, loadTexture('ceiling_tile_stained.png', 1.5, 1.5));
const mansionTrimMat = material(0x2b1d17, 0.82, 0.04, loadTexture('old_door_wood.png', 1.2, 1.2));
const clothWhiteMat = new THREE.MeshStandardMaterial({ color: 0xdad5c8, roughness: 0.94, metalness: 0.0, emissive: 0x181714, emissiveIntensity: 0.08 });
const hairMat = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.96, metalness: 0.0 });
const mansionNodes = [];
const mansionRuntimeObjects = [];
let mansionStartPoint = null;
let mansionExit = null;
let mansionBreakerPanel = null;
let mansionBreakerSwitch = null;
let mansionBreakerLight = null;
let mansionShop = null;
var mansionBuilt = false;
let sonarExternalLoadStarted = false;

const MANSION_RENDER_RADIUS = 30;

function registerMansionObject(object) {
  if (object) mansionRuntimeObjects.push(object);
  return object;
}

function clearMansionMapRuntime() {
  for (const object of [...new Set(mansionRuntimeObjects)]) removeSceneObject(object);
  mansionRuntimeObjects.length = 0;
  mansionNodes.length = 0;
  mansionFloorMeshes.length = 0;
  mansionCeilingMeshes.length = 0;
  removeArrayItemsByBounds(colliders, (x, z) => inMansionBounds(x, z));
  colliderSpatialCount = -1;
  colliderSpatialBuckets = new Map();
  removeArrayItemsByBounds(lockers, (x, z) => inMansionBounds(x, z));
  removeArrayItemsByBounds(schoolLights, (x, z) => inMansionBounds(x, z));
  keyItems.forEach((item) => {
    item.mansionPosition = null;
  });
  fakeOfudaItems.forEach((item) => {
    item.mansionPosition = null;
  });
  mansionStartPoint = null;
  mansionExit = null;
  mansionBreakerPanel = null;
  mansionBreakerSwitch = null;
  mansionBreakerLight = null;
  mansionShop = null;
  mansionPathGraphCount = -1;
  mansionPathNodeByKey = new Map();
  mansionPathNeighbors = new Map();
  mansionBuilt = false;
}

function addStairMarker(x, z, label = '2F') {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 2.2), mansionTrimMat);
  base.position.y = 0.08;
  group.add(base);
  for (let i = 0; i < 5; i += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.95 - i * 0.18, 0.16, 0.34), mansionFloorMat);
    step.position.set(0, 0.24 + i * 0.16, -0.72 + i * 0.34);
    group.add(step);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(9,8,6,.86)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e1d6bd';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 48);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.52),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }),
  );
  sign.position.set(0, 1.35, -1.12);
  group.add(sign);
  scene.add(group);
  return group;
}

function buildMansionSecondFloor() {
  if (mansionBuilt) return;
  mansionBuilt = true;
  const offsetX = MANSION_OFFSET_X;
  const cells = [];
  const mansionCellKeys = new Set();
  const mansionCellKey = (ix, iz) => `${ix},${iz}`;
  const addMansionCell = (ix, iz, force = false) => {
    if (ix < MANSION_MIN_IX || ix > MANSION_MAX_IX || iz < MANSION_MIN_IZ || iz > MANSION_MAX_IZ) return false;
    const norm = Math.hypot(ix / 5.9, iz / 8.8);
    const forced = (ix === 0 && iz === 10)
      || (ix === 0 && iz === 0)
      || (ix === 6 && iz === -9)
      || (ix === -6 && iz === 9);
    if (norm > 1.08 && !forced && !force) return false;
    mansionCellKeys.add(mansionCellKey(ix, iz));
    return true;
  };
  const carveMansionLine = (ix0, iz0, ix1, iz1, force = false, horizontalFirstOverride = null) => {
    let ix = ix0;
    let iz = iz0;
    addMansionCell(ix, iz, force);
    const horizontalFirst = horizontalFirstOverride ?? (Math.random() < 0.5);
    const stepX = () => {
      while (ix !== ix1) {
        ix += Math.sign(ix1 - ix);
        addMansionCell(ix, iz, force);
      }
    };
    const stepZ = () => {
      while (iz !== iz1) {
        iz += Math.sign(iz1 - iz);
        addMansionCell(ix, iz, force);
      }
    };
    if (horizontalFirst) {
      stepX();
      stepZ();
    } else {
      stepZ();
      stepX();
    }
    addMansionCell(ix1, iz1, force);
  };
  const growMansionBranch = (seedIx, seedIz, steps) => {
    let ix = seedIx;
    let iz = seedIz;
    addMansionCell(ix, iz);
    const firstDirection = shuffledDirections()[0];
    for (let i = 0; i < steps; i += 1) {
      const [dx, dz] = i < 2 ? firstDirection : shuffledDirections()[0];
      const nextIx = ix + dx;
      const nextIz = iz + dz;
      if (!addMansionCell(nextIx, nextIz)) continue;
      ix = nextIx;
      iz = nextIz;
      // Occasional one-cell side pockets create dead ends without opening the
      // whole floor into a plaza.
      if (Math.random() < 0.1) {
        const [sideDx, sideDz] = shuffledDirections()[0];
        addMansionCell(ix + sideDx, iz + sideDz);
      }
    }
  };
  // Small central plaza: only the center and three exits are guaranteed.
  addMansionCell(0, 0);
  addMansionCell(0, 1);
  addMansionCell(1, 0);
  addMansionCell(-1, 0);
  // Required routes. They stay narrow and bend, so the mansion remains a maze.
  carveMansionLine(0, 10, 0, 4, true, false);
  carveMansionLine(0, 4, -3, 4, true, true);
  carveMansionLine(-3, 4, -3, 1, true, false);
  carveMansionLine(-3, 1, 0, 1, true, true);
  carveMansionLine(0, 1, -2, 6, true, false);
  carveMansionLine(-2, 6, -6, 9, true, true);
  carveMansionLine(1, 0, 3, -3, true, false);
  carveMansionLine(3, -3, 6, -9, true, true);
  carveMansionLine(-1, 0, -4, -2, true, true);
  carveMansionLine(-4, -2, -5, -6, true, false);
  // Outer circulation loop: keep the mansion maze narrow, but make the outer
  // edge usable as a loop so exploration is not trapped in a single central path.
  carveMansionLine(-6, 9, -6, -9, true, false);
  carveMansionLine(-6, -9, 6, -9, true, true);
  carveMansionLine(6, -9, 6, 9, true, false);
  carveMansionLine(6, 9, -6, 9, true, true);
  carveMansionLine(-3, 4, -6, 4, true, true);
  carveMansionLine(3, -3, 6, -3, true, true);
  carveMansionLine(0, 4, 0, 9, true, false);
  const branchSeeds = [...mansionCellKeys]
    .map((key) => key.split(',').map(Number))
    .sort(() => Math.random() - 0.5)
    .slice(0, 12);
  for (const [ix, iz] of branchSeeds) growMansionBranch(ix, iz, 4 + Math.floor(Math.random() * 4));
  // A few tiny loops keep navigation from feeling like a single snake, while
  // still leaving most grid cells as walls.
  for (let i = 0; i < 5; i += 1) {
    const from = branchSeeds[Math.floor(Math.random() * branchSeeds.length)] || [0, 0];
    const to = branchSeeds[Math.floor(Math.random() * branchSeeds.length)] || [0, 0];
    if (Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) <= 5) carveMansionLine(from[0], from[1], to[0], to[1]);
  }
  const mansionProtectedSpot = (x, z) => {
    const ix = Math.round((x - offsetX) / CELL);
    const iz = Math.round((z - MANSION_CENTER_Z) / CELL);
    const outerLoop = Math.abs(ix) === 6 || iz === 9 || iz === -9;
    return outerLoop
      || Math.hypot(x - offsetX, z - 28) < 5.2
      || Math.hypot(x - (offsetX - 26), z - 24) < 8.0
      || (z > 20 && x > offsetX - 30 && x < offsetX + 6);
  };
  for (let ix = -6; ix <= 6; ix += 1) {
    for (let iz = -9; iz <= 10; iz += 1) {
      if (!mansionCellKeys.has(mansionCellKey(ix, iz))) continue;
      const x = offsetX + ix * CELL;
      const z = MANSION_CENTER_Z + iz * CELL;
      cells.push({ x, z });
      mansionNodes.push({ x, z });
      const floor = addBox(x, -0.11, z, CELL + 0.04, 0.22, CELL + 0.04, mansionFloorMat, false, false, false);
      floor.userData.mapMode = 'mansion';
      floor.userData.mapSurface = 'floor';
      mansionFloorMeshes.push(floor);
      const ceiling = addBox(x, 4.15, z, CELL + 0.02, 0.18, CELL + 0.02, mansionWallMat, false, false, false);
      ceiling.userData.mapMode = 'mansion';
      ceiling.userData.mapSurface = 'ceiling';
      mansionCeilingMeshes.push(ceiling);
      if ((ix + iz * 2) % 7 === 0) {
        const lamp = new THREE.PointLight(0xffd9a6, 2.1, 9, 1.9);
        lamp.position.set(x, 3.2, z);
        scene.add(lamp);
        schoolLights.push(lamp);
        registerMansionObject(lamp);
      }
    }
  }
  const hasCell = (x, z) => cells.some((cell) => Math.abs(cell.x - x) < 0.01 && Math.abs(cell.z - z) < 0.01);
  for (const cell of cells) {
    for (const [dx, dz] of [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]]) {
      if (hasCell(cell.x + dx, cell.z + dz)) continue;
      if (dx !== 0) addBox(cell.x + dx / 2, 2.05, cell.z, 0.2, 4.1, CELL + 0.18, mansionWallMat, true, true, false);
      else addBox(cell.x, 2.05, cell.z + dz / 2, CELL + 0.18, 4.1, 0.2, mansionWallMat, true, true, false);
    }
    if (mansionProtectedSpot(cell.x, cell.z)) {
      // Keep the mansion spawn point and breaker route clear.
    } else if (Math.random() < 0.18) {
      const rot = Math.random() < 0.5 ? 0 : Math.PI / 2;
      const fx = cell.x + (Math.random() < 0.5 ? -1.2 : 1.2);
      const fz = cell.z + (Math.random() < 0.5 ? -1.1 : 1.1);
      if (canPlaceFurnitureAt(fx, fz, Math.abs(Math.cos(rot)) > 0.5 ? 0.85 : 0.22, Math.abs(Math.cos(rot)) > 0.5 ? 0.22 : 0.85, 0.72)
        && canEnemyMoveIgnoringFurniture(cell.x, cell.z, 0.38)) {
        addShelf(fx, fz, 1.7, rot);
      }
    } else if (Math.random() < 0.2) {
      const rot = Math.random() < 0.5 ? 0 : Math.PI / 2;
      const fx = cell.x + (Math.random() - 0.5) * 1.4;
      const fz = cell.z + (Math.random() - 0.5) * 1.4;
      if (canPlaceFurnitureAt(fx, fz, Math.abs(Math.cos(rot)) > 0.5 ? 0.58 : 0.88, Math.abs(Math.cos(rot)) > 0.5 ? 0.88 : 0.58, 0.72)
        && canEnemyMoveIgnoringFurniture(cell.x, cell.z, 0.38)) {
        addDeskSet(fx, fz, rot);
      }
    }
  }
  mansionStartPoint = { x: offsetX, z: 28 };
  const mansionExitSides = [
    { x: -1, z: 0, label: 'west', doorW: 0.16, doorD: 1.55 },
    { x: 1, z: 0, label: 'east', doorW: 0.16, doorD: 1.55 },
    { x: 0, z: -1, label: 'north', doorW: 1.55, doorD: 0.16 },
    { x: 0, z: 1, label: 'south', doorW: 1.55, doorD: 0.16 },
  ];
  const wallInnerSurface = CELL / 2 - 0.1;
  const wallMountOffset = (side, thickness = 0.16) => wallInnerSurface - thickness / 2 + 0.005;
  const wallMountPoint = (node, side, thickness = 0.16) => ({
    x: node.x + side.x * wallMountOffset(side, thickness),
    z: node.z + side.z * wallMountOffset(side, thickness),
  });
  const hasMansionNodeNear = (x, z, radius = 0.55) =>
    mansionNodes.some((node) => Math.hypot(node.x - x, node.z - z) <= radius);
  const isMansionWallFacingSide = (node, side) =>
    !hasMansionNodeNear(node.x + side.x * CELL, node.z + side.z * CELL, 0.55);
  const mansionNodeDegree = (node) => directions.reduce((count, [dx, dz]) =>
    count + (hasMansionNodeNear(node.x + dx * CELL, node.z + dz * CELL, 0.55) ? 1 : 0), 0);
  const isMansionEntranceLikeNode = (node) => mansionNodeDegree(node) >= 3;
  const isNearMansionEntranceLikeNode = (x, z, radius = 5.2) =>
    mansionNodes.some((node) => isMansionEntranceLikeNode(node) && Math.hypot(node.x - x, node.z - z) < radius);
  const isInteriorMansionNode = (node) => {
    const ix = Math.round((node.x - offsetX) / CELL);
    const iz = Math.round((node.z - MANSION_CENTER_Z) / CELL);
    return Math.abs(ix) <= 4 && iz >= -7 && iz <= 8;
  };
  const choosePlacement = (placements, preferInterior = true) => {
    const shuffled = shuffleCopy(placements);
    if (!preferInterior) return shuffled[0] || null;
    const interior = shuffled.filter((placement) => isInteriorMansionNode(placement.node));
    return (interior.length >= 4 ? interior : shuffled)[0] || null;
  };
  const randomWallPlacement = (nodes, sides, avoid = () => true, preferInterior = true) => {
    const placements = shuffleCopy(nodes)
      .filter(avoid)
      .flatMap((node) => shuffleCopy(sides)
        .filter((side) => isMansionWallFacingSide(node, side))
        .map((side) => ({ node, side })));
    return choosePlacement(placements, preferInterior);
  };
  const wallExitFallbacks = shuffleCopy(mansionNodes)
    .filter((node) => !isMansionEntranceLikeNode(node))
    .flatMap((node) => shuffleCopy(mansionExitSides)
      .filter((side) => isMansionWallFacingSide(node, side)
        && !isNearMansionEntranceLikeNode(
          wallMountPoint(node, side, side.x ? side.doorW : side.doorD).x,
          wallMountPoint(node, side, side.x ? side.doorW : side.doorD).z,
          4.6,
        )
        && !hasNonWallColliderOverlap(
          wallMountPoint(node, side, side.x ? side.doorW : side.doorD).x,
          wallMountPoint(node, side, side.x ? side.doorW : side.doorD).z,
          0.2,
        ))
      .map((side) => ({ node, side })));
  const mansionExitCandidates = shuffleCopy(mansionNodes)
    .filter((node) => Math.hypot(node.x - mansionStartPoint.x, node.z - mansionStartPoint.z) > 10)
    .filter((node) => !isMansionEntranceLikeNode(node))
    .flatMap((node) => shuffleCopy(mansionExitSides)
      .filter((side) => isMansionWallFacingSide(node, side)
        && canEnemyMoveTo(node.x - side.x * 0.72, node.z - side.z * 0.72, 0.48)
        && !isNearMansionEntranceLikeNode(
          wallMountPoint(node, side, side.x ? side.doorW : side.doorD).x,
          wallMountPoint(node, side, side.x ? side.doorW : side.doorD).z,
          4.6,
        )
        && !hasNonWallColliderOverlap(
          wallMountPoint(node, side, side.x ? side.doorW : side.doorD).x,
          wallMountPoint(node, side, side.x ? side.doorW : side.doorD).z,
          0.2,
        ))
      .map((side) => ({ node, side })));
  const mansionExitPlacement = choosePlacement(mansionExitCandidates)
    || choosePlacement(wallExitFallbacks)
    || randomWallPlacement(mansionNodes, mansionExitSides, (node) => Math.hypot(node.x - mansionStartPoint.x, node.z - mansionStartPoint.z) > 8)
    || { node: shuffleCopy(mansionNodes)[0], side: shuffleCopy(mansionExitSides)[0] };
  const mansionExitNode = mansionExitPlacement.node;
  const mansionExitSide = mansionExitPlacement.side;
  const exitDoorMount = wallMountPoint(mansionExitNode, mansionExitSide, mansionExitSide.x ? mansionExitSide.doorW : mansionExitSide.doorD);
  const exitDoorX = exitDoorMount.x;
  const exitDoorZ = exitDoorMount.z;
  mansionExit = {
    mesh: addBox(exitDoorX, 1.45, exitDoorZ, mansionExitSide.doorW, 2.35, mansionExitSide.doorD, doorMat, false, false, false),
    x: exitDoorX,
    z: exitDoorZ,
    approachX: mansionExitNode.x,
    approachZ: mansionExitNode.z,
  };
  addBox(exitDoorX + mansionExitSide.x * -0.08, 2.85, exitDoorZ + mansionExitSide.z * -0.08, mansionExitSide.doorW === 0.16 ? 0.08 : 1.65, 0.34, mansionExitSide.doorD === 0.16 ? 0.08 : 1.65, material(0x123f2a, 0.32, 0.02), false, false, false);
  addBox(exitDoorX + mansionExitSide.x * -0.14, 1.48, exitDoorZ + mansionExitSide.z * -0.14, mansionExitSide.doorW === 0.16 ? 0.05 : 1.2, 1.7, mansionExitSide.doorD === 0.16 ? 0.05 : 1.2, material(0x1f1712, 0.72, 0.08), false, false, false);
  addBox(exitDoorX + mansionExitSide.x * -0.18, 1.48, exitDoorZ + mansionExitSide.z * -0.18, mansionExitSide.doorW === 0.16 ? 0.04 : 0.82, 1.2, mansionExitSide.doorD === 0.16 ? 0.04 : 0.82, material(0x0b0d0c, 0.5, 0.08), false, false, false);
  makeWallTextPlate('出口', exitDoorX + mansionExitSide.x * -0.24, 3.08, exitDoorZ + mansionExitSide.z * -0.24, mansionExitSide.label, 1.35, 0.34, 'rgba(18,70,46,.96)', '#d9ffe8');
  const exitGlow = new THREE.PointLight(0xa6d7ff, 2.8, 6);
  exitGlow.position.set(mansionExit.x, 2.6, mansionExit.z);
  scene.add(exitGlow);
  schoolLights.push(exitGlow);
  registerMansionObject(exitGlow);
  const mansionWallSideOptions = [
    { x: -1, z: 0, yaw: Math.PI / 2, panelW: 0.18, panelD: 1.1 },
    { x: 1, z: 0, yaw: -Math.PI / 2, panelW: 0.18, panelD: 1.1 },
    { x: 0, z: -1, yaw: 0, panelW: 1.1, panelD: 0.18 },
    { x: 0, z: 1, yaw: Math.PI, panelW: 1.1, panelD: 0.18 },
  ];
  const wallBreakerFallbacks = shuffleCopy(mansionNodes)
    .filter((node) => !mansionExit || Math.hypot(node.x - mansionExit.approachX, node.z - mansionExit.approachZ) > IMPORTANT_OBJECT_CLEARANCE)
    .filter((node) => !isMansionEntranceLikeNode(node))
    .flatMap((node) => shuffleCopy(mansionWallSideOptions)
      .filter((side) => isMansionWallFacingSide(node, side)
        && !isNearMansionEntranceLikeNode(
          wallMountPoint(node, side, side.x ? side.panelW : side.panelD).x,
          wallMountPoint(node, side, side.x ? side.panelW : side.panelD).z,
          4.8,
        )
        && !hasNonWallColliderOverlap(
          wallMountPoint(node, side, side.x ? side.panelW : side.panelD).x,
          wallMountPoint(node, side, side.x ? side.panelW : side.panelD).z,
          0.18,
        ))
      .map((side) => ({ node, side })));
  const breakerCandidates = shuffleCopy(mansionNodes)
    .filter((node) => Math.hypot(node.x - mansionStartPoint.x, node.z - mansionStartPoint.z) > 6)
    .filter((node) => !mansionExit || Math.hypot(node.x - mansionExit.approachX, node.z - mansionExit.approachZ) > IMPORTANT_OBJECT_CLEARANCE)
    .filter((node) => !isMansionEntranceLikeNode(node))
    .flatMap((node) => shuffleCopy(mansionWallSideOptions)
      .filter((side) => isMansionWallFacingSide(node, side)
        && canEnemyMoveTo(node.x - Math.sign(side.x) * 0.58, node.z - Math.sign(side.z) * 0.58, 0.44)
        && !isNearMansionEntranceLikeNode(
          wallMountPoint(node, side, side.x ? side.panelW : side.panelD).x,
          wallMountPoint(node, side, side.x ? side.panelW : side.panelD).z,
          4.8,
        )
        && !hasNonWallColliderOverlap(
          wallMountPoint(node, side, side.x ? side.panelW : side.panelD).x,
          wallMountPoint(node, side, side.x ? side.panelW : side.panelD).z,
          0.18,
        ))
      .map((side) => ({ node, side })));
  const breakerPlacement = choosePlacement(breakerCandidates)
    || choosePlacement(wallBreakerFallbacks)
    || randomWallPlacement(
      mansionNodes,
      mansionWallSideOptions,
      (node) => !mansionExit || Math.hypot(node.x - mansionExit.approachX, node.z - mansionExit.approachZ) > Math.max(IMPORTANT_OBJECT_CLEARANCE, 8),
    )
    || { node: shuffleCopy(mansionNodes).find((node) => !mansionExit || Math.hypot(node.x - mansionExit.approachX, node.z - mansionExit.approachZ) > Math.max(IMPORTANT_OBJECT_CLEARANCE, 8)) || shuffleCopy(mansionNodes)[0], side: shuffleCopy(mansionWallSideOptions)[0] };
  const breakerAnchor = breakerPlacement.node;
  const breakerSide = breakerPlacement.side;
  const breakerMount = wallMountPoint(breakerAnchor, breakerSide, breakerSide.x ? breakerSide.panelW : breakerSide.panelD);
  const breakerSwitchX = breakerMount.x - breakerSide.x * 0.095;
  const breakerSwitchZ = breakerMount.z - breakerSide.z * 0.095;
  mansionBreakerPanel = addBox(breakerMount.x, 1.45, breakerMount.z, breakerSide.panelW, 1.35, breakerSide.panelD, material(0x241915, 0.62, 0.32), true, false, false);
  mansionBreakerSwitch = addBox(breakerSwitchX, 1.78, breakerSwitchZ, breakerSide.panelW > breakerSide.panelD ? 0.55 : 0.05, 0.2, breakerSide.panelW > breakerSide.panelD ? 0.05 : 0.55, material(0xff6d4d, 0.32), false, false, false);
  mansionBreakerLight = new THREE.PointLight(0x7dffad, 0.35, 3.6);
  mansionBreakerLight.position.set(breakerMount.x - breakerSide.x * 0.28, 2.2, breakerMount.z - breakerSide.z * 0.28);
  scene.add(mansionBreakerLight);
  registerMansionObject(mansionBreakerLight);
  applyBreakerVisual(false);
  const shopGroup = new THREE.Group();
  localBox(shopGroup, 0, 0.86, 0, 1.45, 1.35, 0.55, material(0x2a2032, 0.72, 0.08));
  localBox(shopGroup, 0, 1.68, 0.31, 1.1, 0.24, 0.05, material(0x8ac8ff, 0.36, 0.02));
  const mansionShopNode = mansionNodes
    .filter((node) => Math.hypot(node.x - mansionStartPoint.x, node.z - mansionStartPoint.z) > 9)
    .filter((node) => !mansionExit || Math.hypot(node.x - mansionExit.x, node.z - mansionExit.z) > EXIT_SHOP_CLEARANCE)
    .filter((node) => Math.hypot(node.x - breakerAnchor.x, node.z - breakerAnchor.z) > IMPORTANT_OBJECT_CLEARANCE)
    .sort(() => Math.random() - 0.5)[0]
    || mansionNodes
      .filter((node) => !mansionExit || Math.hypot(node.x - mansionExit.x, node.z - mansionExit.z) > EXIT_SHOP_CLEARANCE)
      .filter((node) => Math.hypot(node.x - breakerAnchor.x, node.z - breakerAnchor.z) > IMPORTANT_OBJECT_CLEARANCE)
      .sort((a, b) => Math.hypot(b.x - mansionExit.x, b.z - mansionExit.z) - Math.hypot(a.x - mansionExit.x, a.z - mansionExit.z))[0]
    || nearestMansionNode(offsetX + 12, 12)
    || { x: offsetX + 12, z: 12 };
  const mansionShopSide = [
    { x: -1.18, z: 0, yaw: Math.PI / 2 },
    { x: 1.18, z: 0, yaw: -Math.PI / 2 },
    { x: 0, z: -1.18, yaw: 0 },
    { x: 0, z: 1.18, yaw: Math.PI },
  ].find((side) => canEnemyMoveTo(mansionShopNode.x - side.x * 0.75, mansionShopNode.z - side.z * 0.75, 0.24)) || { x: 0, z: 0, yaw: 0 };
  shopGroup.position.set(mansionShopNode.x + mansionShopSide.x, 0, mansionShopNode.z + mansionShopSide.z);
  shopGroup.rotation.y = mansionShopSide.yaw;
  scene.add(shopGroup);
  registerMansionObject(shopGroup);
  mansionShop = { group: shopGroup, x: shopGroup.position.x, z: shopGroup.position.z };
  colliders.push({
    x: mansionShop.x,
    z: mansionShop.z,
    hw: Math.abs(Math.sin(shopGroup.rotation.y)) > 0.5 ? 0.34 : 0.72,
    hz: Math.abs(Math.sin(shopGroup.rotation.y)) > 0.5 ? 0.72 : 0.34,
  });
  const mansionLockerNodes = mansionNodes
    .filter((node) => Math.hypot(node.x - mansionStartPoint.x, node.z - mansionStartPoint.z) > 7)
    .filter((node) => !mansionExit || Math.hypot(node.x - mansionExit.x, node.z - mansionExit.z) > 7)
    .filter((node) => isClearOfMansionUtilities(node.x, node.z, 6.2))
    .sort(() => Math.random() - 0.5)
    .slice(0, 28);
  let placedMansionLockers = 0;
  for (const node of mansionLockerNodes) {
    if (placedMansionLockers >= 10) break;
    const hasWallBehindLocker = (side) => {
      const probeX = node.x + Math.sign(side.x) * CELL;
      const probeZ = node.z + Math.sign(side.z) * CELL;
      return !hasMansionNodeNear(probeX, probeZ, 0.55);
    };
    const canUseMansionLockerSide = (side) => {
      const x = node.x + side.x;
      const z = node.z + side.z;
      const exitX = node.x - side.x * 0.75;
      const exitZ = node.z - side.z * 0.75;
      const sideStepX = side.z;
      const sideStepZ = -side.x;
      const clearancePoints = [
        [exitX, exitZ, 1.0],
        [exitX + sideStepX * 0.75, exitZ + sideStepZ * 0.75, 0.78],
        [exitX - sideStepX * 0.75, exitZ - sideStepZ * 0.75, 0.78],
        [exitX - side.x * 0.62, exitZ - side.z * 0.62, 0.82],
      ];
      return !hasColliderOverlap(x, z, 0.34)
        && hasWallBehindLocker(side)
        && isClearOfMansionUtilities(x, z, 6.2)
        && isClearOfMansionUtilities(exitX, exitZ, 5.4)
        && !hasFurnitureOverlap(node.x, node.z, 1.45)
        && !hasFurnitureOverlap(x, z, 1.75)
        && isLockerFrontClear(x, z, side.yaw, 0.38)
        && clearancePoints.every(([px, pz, padding]) => !hasFurnitureOverlap(px, pz, padding))
        && canEnemyMoveTo(exitX, exitZ, 0.8)
        && canEnemyMoveTo(exitX + sideStepX * 0.62, exitZ + sideStepZ * 0.62, 0.62)
        && canEnemyMoveTo(exitX - sideStepX * 0.62, exitZ - sideStepZ * 0.62, 0.62);
    };
    const sideOptions = [
      { x: -1.58, z: 0, yaw: Math.PI / 2 },
      { x: 1.58, z: 0, yaw: -Math.PI / 2 },
      { x: 0, z: -1.58, yaw: 0 },
      { x: 0, z: 1.58, yaw: Math.PI },
    ].filter(canUseMansionLockerSide);
    const side = sideOptions[0];
    if (!side) continue;
    const x = node.x + side.x;
    const z = node.z + side.z;
    const yaw = side.yaw;
    if (hasColliderOverlap(x, z, 0.28)) continue;
    const group = new THREE.Group();
    localBox(group, 0, 1.2, -0.34, 1.15, 2.4, 0.14, mansionTrimMat);
    localBox(group, -0.55, 1.2, 0, 0.12, 2.4, 0.8, mansionTrimMat);
    localBox(group, 0.55, 1.2, 0, 0.12, 2.4, 0.8, mansionTrimMat);
    localBox(group, 0, 2.42, 0, 1.15, 0.12, 0.86, mansionTrimMat);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    group.userData.locker = true;
    scene.add(group);
    registerMansionObject(group);
    lockers.push({ group, x, z, yaw, insideLocalY: 1.46, outsideLocalY: 1.68 });
    colliders.push({ x, z, hw: Math.abs(Math.sin(yaw)) > 0.5 ? 0.46 : 0.62, hz: Math.abs(Math.sin(yaw)) > 0.5 ? 0.62 : 0.46 });
    addLockerSpotlight(x, z, yaw, true);
    placedMansionLockers += 1;
  }
  if (placedMansionLockers < 6) {
    const fallbackNodes = mansionNodes
      .filter((node) => Math.hypot(node.x - mansionStartPoint.x, node.z - mansionStartPoint.z) > 5.5)
      .filter((node) => !mansionExit || Math.hypot(node.x - mansionExit.x, node.z - mansionExit.z) > 6)
      .filter((node) => isClearOfMansionUtilities(node.x, node.z, 6.2))
      .sort(() => Math.random() - 0.5);
    for (const node of fallbackNodes) {
      if (placedMansionLockers >= 6) break;
      if (lockers.some((locker) => inMansionBounds(locker.x, locker.z) && Math.hypot(locker.x - node.x, locker.z - node.z) < 6)) continue;
      const side = [
        { x: -1.48, z: 0, yaw: Math.PI / 2 },
        { x: 1.48, z: 0, yaw: -Math.PI / 2 },
        { x: 0, z: -1.48, yaw: 0 },
        { x: 0, z: 1.48, yaw: Math.PI },
      ].find((candidate) => {
        const behindX = node.x + candidate.x * 1.25;
        const behindZ = node.z + candidate.z * 1.25;
        const exitX = node.x - candidate.x * 0.7;
        const exitZ = node.z - candidate.z * 0.7;
        return !nearestMansionNode(behindX, behindZ, 1.05)
          && !hasColliderOverlap(node.x + candidate.x, node.z + candidate.z, 0.32)
          && !hasFurnitureOverlap(node.x, node.z, 1.45)
          && !hasFurnitureOverlap(node.x + candidate.x, node.z + candidate.z, 1.7)
          && isClearOfMansionUtilities(node.x + candidate.x, node.z + candidate.z, 6.2)
          && isClearOfMansionUtilities(exitX, exitZ, 5.4)
          && isLockerFrontClear(node.x + candidate.x, node.z + candidate.z, candidate.yaw, 0.38)
          && canEnemyMoveTo(exitX, exitZ, 0.62);
      });
      if (!side) continue;
      const x = node.x + side.x;
      const z = node.z + side.z;
      const yaw = side.yaw;
      const group = new THREE.Group();
      localBox(group, 0, 1.2, -0.34, 1.15, 2.4, 0.14, mansionTrimMat);
      localBox(group, -0.55, 1.2, 0, 0.12, 2.4, 0.8, mansionTrimMat);
      localBox(group, 0.55, 1.2, 0, 0.12, 2.4, 0.8, mansionTrimMat);
      localBox(group, 0, 2.42, 0, 1.15, 0.12, 0.86, mansionTrimMat);
      group.position.set(x, 0, z);
      group.rotation.y = yaw;
      group.userData.locker = true;
      scene.add(group);
      registerMansionObject(group);
      lockers.push({ group, x, z, yaw, insideLocalY: 1.46, outsideLocalY: 1.68 });
      colliders.push({ x, z, hw: Math.abs(Math.sin(yaw)) > 0.5 ? 0.46 : 0.62, hz: Math.abs(Math.sin(yaw)) > 0.5 ? 0.62 : 0.46 });
      addLockerSpotlight(x, z, yaw, true);
      placedMansionLockers += 1;
    }
  }
  if (placedMansionLockers < 8) {
    const forcedLockerNodes = mansionNodes
      .filter((node) => Math.hypot(node.x - mansionStartPoint.x, node.z - mansionStartPoint.z) > 4.5)
      .filter((node) => !mansionExit || Math.hypot(node.x - mansionExit.x, node.z - mansionExit.z) > 5)
      .filter((node) => isClearOfMansionUtilities(node.x, node.z, 6.2))
      .sort(() => Math.random() - 0.5);
    for (const node of forcedLockerNodes) {
      if (placedMansionLockers >= 8) break;
      if (lockers.some((locker) => inMansionBounds(locker.x, locker.z) && Math.hypot(locker.x - node.x, locker.z - node.z) < 4.5)) continue;
      const side = [
        { x: -1.22, z: 0, yaw: Math.PI / 2 },
        { x: 1.22, z: 0, yaw: -Math.PI / 2 },
        { x: 0, z: -1.22, yaw: 0 },
        { x: 0, z: 1.22, yaw: Math.PI },
      ].find((candidate) => {
        const exitX = node.x - candidate.x * 0.8;
        const exitZ = node.z - candidate.z * 0.8;
        return !hasColliderOverlap(node.x + candidate.x, node.z + candidate.z, 0.22)
          && !hasFurnitureOverlap(node.x, node.z, 1.35)
          && !hasFurnitureOverlap(node.x + candidate.x, node.z + candidate.z, 1.6)
          && isClearOfMansionUtilities(node.x + candidate.x, node.z + candidate.z, 6.2)
          && isClearOfMansionUtilities(exitX, exitZ, 5.4)
          && isLockerFrontClear(node.x + candidate.x, node.z + candidate.z, candidate.yaw, 0.38)
          && canEnemyMoveTo(exitX, exitZ, 0.48);
      });
      if (!side) continue;
      createMansionLockerAt(node.x + side.x, node.z + side.z, side.yaw);
      placedMansionLockers += 1;
    }
  }
}
const exitRooms = schoolRooms.filter((room) => room.id !== 'breaker');
const exitRoom = exitRooms[Math.floor(Math.random() * exitRooms.length)] || schoolRooms[1];
const exitRoomCenter = roomCenter(exitRoom);
const exitWallSide = exitRoom.sign.side === 'east' ? 'west' : 'east';
const exitWallX = exitWallSide === 'west'
  ? worldFromGrid(exitRoom.gx0, exitRoom.gz0).x - CELL / 2 + 0.11
  : worldFromGrid(exitRoom.gx1, exitRoom.gz1).x + CELL / 2 - 0.11;
const distanceFromSchoolEntrances = (room, x, z) =>
  schoolDoorWorldPoints(room).reduce((min, point) => Math.min(min, Math.hypot(x - point.x, z - point.z)), Infinity);
const exitCandidateNodes = walkableNodes
  .filter((node) => node.gx >= exitRoom.gx0 && node.gx <= exitRoom.gx1)
  .filter((node) => node.gz >= exitRoom.gz0 && node.gz <= exitRoom.gz1)
  .filter((node) => !isNearSchoolEntranceStrict(exitWallX, node.z, 4.8))
  .sort(() => Math.random() - 0.5);
const exitNode = exitCandidateNodes[0]
  || walkableNodes
    .filter((node) => node.gx >= exitRoom.gx0 && node.gx <= exitRoom.gx1)
    .filter((node) => node.gz >= exitRoom.gz0 && node.gz <= exitRoom.gz1)
    .sort((a, b) => distanceFromSchoolEntrances(exitRoom, exitWallX, b.z) - distanceFromSchoolEntrances(exitRoom, exitWallX, a.z))[0]
  || nearestNode(roomCenter(exitRoom).x, roomCenter(exitRoom).z)
  || walkableNodes[0];
const exitPosition = new THREE.Vector3(exitWallX, 0, exitRoomCenter.z);
exitPosition.z = exitNode.z;
const exitDoor = addBox(exitPosition.x, 1.45, exitPosition.z, 0.16, 2.35, 1.35, material(0x303a33, 0.48, 0.6), false, false, false);
addBox(exitPosition.x, 3.05, exitPosition.z, 0.09, 0.32, 1.05, material(0x1d6243, 0.35), false, false, false);
const exitLight = new THREE.PointLight(0x3acb88, 4.5, 6);
exitLight.position.set(exitPosition.x, 2.75, exitPosition.z);
scene.add(exitLight);
schoolLights.push(exitLight);

const breakerRoom = schoolRooms
  .filter((room) => room !== exitRoom)
  .sort(() => Math.random() - 0.5)[0]
  || schoolRooms.find((room) => room.id === 'breaker');
// ブレーカーは選ばれた部屋の入口と反対側の壁へ貼り付ける。床置き・中央置きは禁止。
const breakerWallSide = breakerRoom?.sign?.side === 'west' ? 1 : -1;
const breakerWallX = breakerWallSide < 0
  ? worldFromGrid(breakerRoom.gx0, breakerRoom.gz0).x - CELL / 2 + 0.11
  : worldFromGrid(breakerRoom.gx1, breakerRoom.gz1).x + CELL / 2 - 0.11;
const schoolBreakerCandidateScore = (node) => {
  const x = breakerWallX;
  const z = node.z;
  const lockerPenalty = lockers
    .filter((locker) => !inMansionBounds(locker.x, locker.z))
    .reduce((score, locker) => score + Math.max(0, 7 - Math.hypot(locker.x - x, locker.z - z)) * 12, 0);
  const doorPenalty = isNearSchoolDoorOrConnector(x, z, 3.4) ? 80 : 0;
  const objectPenalty = hasNonWallColliderOverlap(x, z, 1.2) ? 60 : 0;
  return lockerPenalty + doorPenalty + objectPenalty + Math.random();
};
const breakerCandidates = walkableNodes
  .filter((node) => node.key !== exitNode.key && breakerRoom)
  .filter((node) => node.gx >= breakerRoom.gx0 && node.gx <= breakerRoom.gx1)
  .filter((node) => node.gz >= breakerRoom.gz0 && node.gz <= breakerRoom.gz1)
  .filter((node) => !isNearSchoolDoorOrConnector(breakerWallX, node.z, 3.0))
  .filter((node) => !isNearSchoolEntranceStrict(breakerWallX, node.z, 4.8))
  .filter((node) => !lockers.some((locker) => !inMansionBounds(locker.x, locker.z) && Math.hypot(locker.x - breakerWallX, locker.z - node.z) < 5.5))
  .filter((node) => !hasNonWallColliderOverlap(breakerWallX, node.z, 1.0))
  .sort((a, b) => schoolBreakerCandidateScore(a) - schoolBreakerCandidateScore(b));
const breakerFallbackCandidates = walkableNodes
  .filter((node) => node.key !== exitNode.key && breakerRoom)
  .filter((node) => node.gx >= breakerRoom.gx0 && node.gx <= breakerRoom.gx1)
  .filter((node) => node.gz >= breakerRoom.gz0 && node.gz <= breakerRoom.gz1)
  .filter((node) => !isNearSchoolEntranceStrict(breakerWallX, node.z, 3.6))
  .sort((a, b) => schoolBreakerCandidateScore(a) - schoolBreakerCandidateScore(b));
const breakerNode = breakerCandidates[0] || breakerFallbackCandidates[0] || walkableNodes[walkableNodes.length - 1];
const breakerPosition = new THREE.Vector3(breakerWallX, 0, breakerNode.z);
const breakerPanel = addBox(
  breakerPosition.x,
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
  breakerPosition.x - breakerWallSide * 0.08,
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
breakerLight.position.set(breakerPosition.x - breakerWallSide * 0.24, 2.2, breakerPosition.z);
scene.add(breakerLight);
const breakerPlateSide = breakerWallSide < 0 ? 'west' : 'east';

const deskTopMat = material(0x8d6846, 0.76, 0.04, loadTexture('old_door_wood.png', 1, 1));
const chairMat = material(0x515a55, 0.58, 0.18, loadTexture('locker_scratched_metal.png', 1, 1));
const paperMat = material(0xd8d4bd, 0.92, 0.01);
const bookMat = material(0x344d70, 0.72, 0.02);

function addDeskSet(x, z, rot = 0) {
  const sideways = Math.abs(Math.cos(rot)) <= 0.5;
  const hw = sideways ? 0.88 : 0.58;
  const hz = sideways ? 0.58 : 0.88;
  const group = new THREE.Group();
  group.rotation.y = rot;
  localBox(group, 0, 0.72, 0, 1.18, 0.1, 0.7, deskTopMat);
  localBox(group, 0, 0.36, 0, 0.58, 0.5, 0.28, darkMat);
  localBox(group, -0.22, 0.8, -0.12, 0.32, 0.025, 0.22, paperMat);
  localBox(group, 0.26, 0.83, 0.16, 0.26, 0.06, 0.18, bookMat);
  localBox(group, 0, 0.34, 0.68, 0.54, 0.1, 0.4, darkMat);
  group.position.set(x, 0, z);
  scene.add(group);
  if (inMansionBounds(x, z)) registerMansionObject(group);
  colliders.push({ x, z, hw, hz, kind: 'furniture' });
  return group;
}

function addShelf(x, z, w = 1.8, rot = 0) {
  const hw = Math.abs(Math.cos(rot)) > 0.5 ? w / 2 : 0.18;
  const hz = Math.abs(Math.cos(rot)) > 0.5 ? 0.18 : w / 2;
  const group = new THREE.Group();
  group.rotation.y = rot;
  localBox(group, 0, 0.92, 0, w, 1.84, 0.34, cabinetMat);
  for (let y = 0.36; y <= 1.48; y += 0.36) localBox(group, 0, y, 0.19, w * 0.88, 0.045, 0.045, darkMat);
  for (let i = 0; i < 5; i += 1) localBox(group, -w * 0.34 + i * w * 0.17, 1.05 + (i % 2) * 0.32, 0.21, 0.1, 0.32, 0.08, bookMat);
  group.position.set(x, 0, z);
  scene.add(group);
  if (inMansionBounds(x, z)) registerMansionObject(group);
  colliders.push({ x, z, hw, hz, kind: 'furniture' });
  return group;
}

function addSinkRow(x, z, rot = 0) {
  const hw = Math.abs(Math.cos(rot)) > 0.5 ? 1.16 : 0.28;
  const hz = Math.abs(Math.cos(rot)) > 0.5 ? 0.28 : 1.16;
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
  colliders.push({ x, z, hw, hz, kind: 'furniture' });
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
  const leftX = worldFromGrid(room.gx0, room.gz0).x - CELL / 2 + 1.15;
  const rightX = worldFromGrid(room.gx1, room.gz1).x + CELL / 2 - 1.15;
  const tryDeskSet = (x, z, rot = 0) => {
    const sideways = Math.abs(Math.cos(rot)) <= 0.5;
    const hw = sideways ? 0.88 : 0.58;
    const hz = sideways ? 0.58 : 0.88;
    if (canPlaceFurnitureAt(x, z, hw, hz, 0.42)) addDeskSet(x, z, rot);
  };
  if (room.id !== 'breaker') {
    tryDeskSet(leftX, center.z - 1.25, Math.random() < 0.5 ? 0 : Math.PI);
    tryDeskSet(rightX, center.z - 1.25, Math.random() < 0.5 ? 0 : Math.PI);
    if (room.gx1 - room.gx0 >= 3 && room.id !== 'science') tryDeskSet(center.x, center.z + 1.35, Math.PI / 2);
    // Furniture is kept near room edges so entrances and walking routes stay playable.
    const northOpen = Array.from({ length: room.gx1 - room.gx0 + 1 }, (_, i) => room.gx0 + i)
      .some((gx) => isRoomOpening(room, 'north', gx));
    const southOpen = Array.from({ length: room.gx1 - room.gx0 + 1 }, (_, i) => room.gx0 + i)
      .some((gx) => isRoomOpening(room, 'south', gx));
    if (!northOpen) addBox(center.x, 1.55, backZ, 2.6, 1.05, 0.08, signMat, false, false, false);
    if (!southOpen) addShelf(center.x, frontZ, 1.7, 0);
    if (room.id === 'science') {
      addBox(leftX, 0.95, center.z + 1.35, 1.75, 0.14, 0.72, metalMat, true, false, false, 'furniture');
      addBox(leftX - 0.45, 1.14, center.z + 1.35, 0.22, 0.22, 0.22, material(0x355f72, 0.28, 0.02), false, false, false);
      addSinkRow(rightX, center.z + 1.3, Math.PI / 2);
    } else if (room.id === 'nurse') {
      addBox(rightX, 0.62, center.z + 1.18, 1.65, 0.32, 0.74, material(0xd8d8cf, 0.68, 0.02), true, false, false, 'furniture');
      addBox(rightX - 0.42, 0.95, center.z + 1.18, 0.42, 0.35, 0.68, paperMat, false, false, false);
    } else if (room.id === 'music') {
      addBox(leftX, 0.78, center.z + 1.1, 1.15, 1.15, 0.28, material(0x3d2a1d, 0.7, 0.04), true, false, false, 'furniture');
    }
    const sideX = room.sign.side === 'east'
      ? worldFromGrid(room.gx0, room.gz0).x - CELL / 2 + 0.08
      : worldFromGrid(room.gx1, room.gz1).x + CELL / 2 - 0.08;
    const windowZChoices = [center.z - 1.45, center.z + 1.45, center.z]
      .filter((z) => !isNearSchoolEntranceStrict(sideX, z, 4.2))
      .sort(() => Math.random() - 0.5);
    const windowZ = windowZChoices[0];
    if (Number.isFinite(windowZ)) addNightWindow(sideX, windowZ, room.sign.side === 'east' ? Math.PI / 2 : -Math.PI / 2, 1.35);
  } else {
    addBox(center.x, 0.58, center.z + 1.1, 1.7, 1.16, 0.7, metalMat, true, false, false);
    addShelf(center.x - 0.92, center.z - 0.92, 1.2, Math.PI / 2);
  }
}

function addCorridorDetails() {
  addSinkRow(worldFromGrid(6, 8).x - 1.36, worldFromGrid(6, 8).z + 1.45, 0);
  addSinkRow(worldFromGrid(6, 13).x + 1.36, worldFromGrid(6, 13).z - 1.45, Math.PI);
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
  if (side === 'north' || side === 'south') {
    const offset = side === 'north' ? 0.108 : -0.108;
    mesh.position.set(x, y, z + offset);
    mesh.rotation.y = side === 'north' ? 0 : Math.PI;
  } else {
    const offset = side === 'west' ? 0.108 : -0.108;
    mesh.position.set(x + offset, y, z);
    mesh.rotation.y = side === 'west' ? Math.PI / 2 : -Math.PI / 2;
  }
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
const IMPORTANT_OBJECT_CLEARANCE = 4.0;
const EXIT_SHOP_CLEARANCE = 6.0;

function activeExitPointForMode(mode = state.mapMode) {
  return mode === 'mansion' && mansionExit ? mansionExit : exitDoor.position;
}

function pointOnCurrentWalkableMap(x, z, mode = state.mapMode, maxDistance = 1.35) {
  const nodes = mode === 'mansion' ? mansionNodes : walkableNodes;
  return nodes.some((node) => Math.hypot(node.x - x, node.z - z) <= maxDistance);
}

function pickupNearRestrictedUtility(x, z, mode = state.mapMode) {
  const point = { x, z };
  const activeBreaker = mode === 'mansion' && mansionBreakerPanel ? mansionBreakerPanel.position : breakerPanel.position;
  const activeShop = mode === 'mansion' && mansionShop ? mansionShop : shop;
  const activeExit = activeExitPointForMode(mode);
  if (activeExit && horizontalDistance(point, activeExit) < IMPORTANT_OBJECT_CLEARANCE) return true;
  if (activeBreaker && horizontalDistance(point, activeBreaker) < IMPORTANT_OBJECT_CLEARANCE) return true;
  if (activeShop && horizontalDistance(point, activeShop) < IMPORTANT_OBJECT_CLEARANCE) return true;
  return lockers.some((locker) => {
    const isMansionLocker = inMansionBounds(locker.x, locker.z);
    if ((mode === 'mansion') !== isMansionLocker) return false;
    return Math.hypot(locker.x - x, locker.z - z) < IMPORTANT_OBJECT_CLEARANCE;
  });
}

function keyItemTooCloseToImportantObjects(x, z, mode = state.mapMode, used = []) {
  if (!pointOnCurrentWalkableMap(x, z, mode)) return true;
  if (pickupNearRestrictedUtility(x, z, mode)) return true;
  if (used.some((p) => Math.hypot(p.x - x, p.z - z) < IMPORTANT_OBJECT_CLEARANCE)) return true;
  return false;
}

function findSafePickupPosition(node, used = []) {
  const base = worldFromGrid(node.gx, node.gz);
  if (!walkable.has(node.key)) return null;
  for (const [ox, oz] of keyOffsets.slice().sort(() => Math.random() - 0.5)) {
    const x = base.x + ox;
    const z = base.z + oz;
    if (keyItemTooCloseToImportantObjects(x, z, 'school', used)) continue;
    if (!canMoveTo(x, z)) continue;
    if (!isSafeSpawnPoint(x, z, 1.05)) continue;
    if (coverPoints.some((cover) => Math.hypot(cover.x - x, cover.z - z) < 1.65)) continue;
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
  const remaining = walkableNodes
    .filter((candidate) => Math.hypot(candidate.gx - 6, candidate.gz - 18) > 2)
    .sort(() => Math.random() - 0.5);
  const node = remaining.find((candidate) => findSafePickupPosition(candidate, selectedKeySpawns))
    || findSafeNode((candidate) => Math.hypot(candidate.gx - 6, candidate.gz - 18) > 2);
  const pos = findSafePickupPosition(node, selectedKeySpawns);
  if (!pos) break;
  selectedKeySpawns.push(pos);
}
const keyMat = material(0xc2a44e, 0.25, 0.85);
const ofudaMat = new THREE.MeshBasicMaterial({ color: 0xf1e4bc, side: THREE.DoubleSide });
const ofudaInkMat = new THREE.MeshBasicMaterial({ color: 0x2a1710 });
const ofudaSealMat = new THREE.MeshBasicMaterial({ color: 0x8f1e18 });

function createOfudaModel(fake = false) {
  const group = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.BoxGeometry(fake ? 0.395 : 0.38, 0.014, fake ? 0.805 : 0.78),
    fake ? new THREE.MeshBasicMaterial({ color: 0xf3e1ba, side: THREE.DoubleSide }) : ofudaMat,
  );
  group.add(paper);
  const edgeMat = new THREE.MeshBasicMaterial({ color: fake ? 0xbfa171 : 0xb69b6f });
  for (const [x, z, w, d] of [
    [0, -0.395, fake ? 0.34 : 0.36, fake ? 0.009 : 0.018],
    [0, 0.395, fake ? 0.32 : 0.34, fake ? 0.009 : 0.018],
    [-0.195, 0, fake ? 0.008 : 0.016, fake ? 0.7 : 0.74],
    [0.195, 0, fake ? 0.008 : 0.016, fake ? 0.68 : 0.72],
  ]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.018, d), edgeMat);
    edge.position.set(x, 0.004, z);
    group.add(edge);
  }
  const topSeal = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.02, 0.14),
    fake ? new THREE.MeshBasicMaterial({ color: 0x9f2c25 }) : ofudaSealMat,
  );
  topSeal.position.z = -0.25;
  topSeal.position.y = 0.012;
  group.add(topSeal);
  const sealCore = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.021, 0.08), ofudaInkMat);
  sealCore.position.set(0, 0.016, -0.25);
  group.add(sealCore);
  for (let i = 0; i < 7; i += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.2 - (i % 3) * 0.025, 0.02, 0.018), ofudaInkMat);
    line.position.z = -0.08 + i * 0.075;
    line.position.x = (i % 2 ? -0.025 : 0.025);
    line.position.y = 0.015;
    group.add(line);
  }
  const sideA = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.02, 0.58), ofudaInkMat);
  sideA.position.x = -0.13;
  sideA.position.z = 0.06;
  sideA.position.y = 0.015;
  const sideB = sideA.clone();
  sideB.position.x = 0.13;
  group.add(sideA, sideB);
  for (let i = 0; i < 6; i += 1) {
    const fiber = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.019, 0.16 + Math.random() * 0.14), edgeMat);
    fiber.position.set(-0.15 + i * 0.06, 0.018, -0.22 + Math.random() * 0.58);
    fiber.rotation.y = (Math.random() - 0.5) * 0.7;
    group.add(fiber);
  }
  if (fake) {
    const curseGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.43, 0.006, 0.83),
      new THREE.MeshBasicMaterial({ color: 0x8f211e, transparent: true, opacity: 0.045, side: THREE.DoubleSide }),
    );
    curseGlow.position.y = -0.006;
    group.add(curseGlow);
  }
  group.rotation.x = -Math.PI / 2;
  group.visible = false;
  return group;
}

const keyItems = selectedKeySpawns.map((keySpawn, index) => {
  const group = new THREE.Group();
  markSharedObject(group);
  const keyModel = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 18), keyMat);
  ring.rotation.x = Math.PI / 2;
  keyModel.add(ring);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.35), keyMat);
  stem.position.z = 0.24;
  keyModel.add(stem);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.06), keyMat);
  tooth.position.set(0.04, 0, 0.4);
  keyModel.add(tooth);
  const ofudaModel = createOfudaModel();
  group.add(keyModel, ofudaModel);
  group.position.set(keySpawn.x, 1.05, keySpawn.z);
  scene.add(group);
  const light = new THREE.PointLight(0xe2c466, 1.25, 2.5);
  markSharedObject(light);
  light.position.copy(group.position);
  scene.add(light);
  return {
    group,
    light,
    collected: false,
    baseY: 1.05,
    phase: index * 0.9,
    keyModel,
    ofudaModel,
    schoolPosition: { x: keySpawn.x, z: keySpawn.z },
    mansionPosition: null,
  };
});
updateExitCounter();

for (let i = 0; i < 4; i += 1) {
  const group = new THREE.Group();
  markSharedObject(group);
  const model = createOfudaModel(true);
  model.visible = true;
  group.add(model);
  group.visible = false;
  scene.add(group);
  const light = new THREE.PointLight(0xff6655, 0.75, 2.2);
  markSharedObject(light);
  light.visible = false;
  scene.add(light);
  fakeOfudaItems.push({ group, light, collected: false, baseY: 1.05, phase: i * 1.7, mansionPosition: null });
}

function placeKeyItemsForMode(mode) {
  const respawnMode = mode;
  const used = [];
  if (mode === 'mansion') {
    const mansionKeyPositions = [];
    const chooseMansionKeyNode = (minSpacing, strict = true) => {
      const candidates = mansionNodes
        .filter((node) => !strict || isSafeSpawnPoint(node.x, node.z, 0.82))
        .filter((node) => !pickupNearRestrictedUtility(node.x, node.z, 'mansion'))
        .filter((node) => !mansionExit || Math.hypot(node.x - mansionExit.x, node.z - mansionExit.z) > (strict ? 8 : 4))
        .filter((node) => !mansionStartPoint || Math.hypot(node.x - mansionStartPoint.x, node.z - mansionStartPoint.z) > (strict ? 6 : 3))
        .filter((node) => !mansionKeyPositions.some((p) => Math.hypot(p.x - node.x, p.z - node.z) < minSpacing))
        .sort(() => Math.random() - 0.5);
      return candidates[0] || null;
    };
    for (let i = 0; i < REQUIRED_KEYS; i += 1) {
      const node = chooseMansionKeyNode(8, true)
        || chooseMansionKeyNode(5, true)
        || chooseMansionKeyNode(3, false)
        || mansionNodes.find((candidate) => !mansionKeyPositions.some((p) => Math.hypot(p.x - candidate.x, p.z - candidate.z) < 2))
        || mansionNodes[i % Math.max(1, mansionNodes.length)]
        || { x: MANSION_OFFSET_X + i * 2, z: MANSION_CENTER_Z };
      mansionKeyPositions.push({ x: node.x, z: node.z });
    }
    keyItems.forEach((item, index) => {
      item.mansionPosition = mansionKeyPositions[index] || mansionKeyPositions[mansionKeyPositions.length - 1] || { x: MANSION_OFFSET_X, z: MANSION_CENTER_Z };
    });
  }
  for (const item of keyItems) {
    let pos = item.schoolPosition;
    if (mode === 'mansion') {
      if (!item.mansionPosition) {
        const choices = mansionNodes
          .filter((node) => isSafeSpawnPoint(node.x, node.z, 0.95))
          .filter((node) => !pickupNearRestrictedUtility(node.x, node.z, 'mansion'))
          .filter((node) => !used.some((p) => Math.hypot(p.x - node.x, p.z - node.z) < 9))
          .filter((node) => !mansionExit || Math.hypot(node.x - mansionExit.x, node.z - mansionExit.z) > 10)
          .sort(() => Math.random() - 0.5);
        item.mansionPosition = choices[0]
          || mansionNodes.find((node) => !pickupNearRestrictedUtility(node.x, node.z, 'mansion'))
          || mansionNodes[Math.floor(Math.random() * mansionNodes.length)]
          || { x: MANSION_OFFSET_X, z: MANSION_CENTER_Z };
      }
      pos = item.mansionPosition;
    }
    used.push(pos);
    item.group.position.set(pos.x, 1.05, pos.z);
    item.keyModel.visible = mode !== 'mansion';
    item.ofudaModel.visible = mode === 'mansion';
    item.light.position.copy(item.group.position);
    item.collected = false;
    item.group.visible = true;
    item.light.visible = true;
  }
  state.keyCount = 0;
  updateExitCounter();
  if (respawnMode === 'mansion') $('#objective-text').textContent = `お札を集める 0 / ${REQUIRED_KEYS}`;
  $('#objective-text').textContent = mode === 'mansion'
    ? `お札を集める 0 / ${REQUIRED_KEYS}`
    : `鍵を探す 0 / ${REQUIRED_KEYS}`;
  placeFakeOfudaItems(mode);
}

function placeFakeOfudaItems(mode) {
  for (const fake of fakeOfudaItems) {
    fake.collected = false;
    fake.group.visible = mode === 'mansion';
    fake.light.visible = mode === 'mansion';
    if (mode !== 'mansion') continue;
    const choices = mansionNodes
      .filter((node) => !pickupNearRestrictedUtility(node.x, node.z, 'mansion'))
      .filter((node) => keyItems.every((item) => Math.hypot(item.group.position.x - node.x, item.group.position.z - node.z) > 4.5))
      .filter((node) => fakeOfudaItems.every((item) => !item.mansionPosition || Math.hypot(item.mansionPosition.x - node.x, item.mansionPosition.z - node.z) > 5))
      .sort(() => Math.random() - 0.5);
    const node = choices[0]
      || mansionNodes.find((candidate) => !pickupNearRestrictedUtility(candidate.x, candidate.z, 'mansion'))
      || mansionNodes[Math.floor(Math.random() * mansionNodes.length)]
      || { x: MANSION_OFFSET_X, z: MANSION_CENTER_Z };
    fake.mansionPosition = { x: node.x, z: node.z };
    fake.group.position.set(node.x, fake.baseY, node.z);
    fake.light.position.copy(fake.group.position);
  }
}

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
function ensureModelUv(geometry) {
  if (geometry.attributes.uv && geometry.attributes.uv.count === geometry.attributes.position.count) return;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = new THREE.Vector3();
  box.getSize(size);
  const pos = geometry.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  const invX = 1 / Math.max(0.001, size.x);
  const invY = 1 / Math.max(0.001, size.y);
  const invZ = 1 / Math.max(0.001, size.z);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = (x - box.min.x) * invX;
    const ny = (y - box.min.y) * invY;
    const nz = (z - box.min.z) * invZ;
    const sideBias = Math.abs(x) > Math.abs(z);
    uvs[i * 2] = sideBias ? nz : nx;
    uvs[i * 2 + 1] = ny;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}
function loadExternalSonarModel() {
  if (sonarExternalLoadStarted || externalSonarModel) return;
  sonarExternalLoadStarted = true;
  const finalizeLoadedModel = (model) => {
    enemy.add(model);
    externalSonarModel = model;
    proceduralSonarParts.forEach((part) => { part.visible = false; });
  };
  const loadObjFallback = () => {
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
        ensureModelUv(child.geometry);
        child.geometry.computeVertexNormals();
      });
      finalizeLoadedModel(model);
    }, undefined, () => {
      proceduralSonarParts.forEach((part) => { part.visible = true; });
    });
  };
  const gltfLoader = new GLTFLoader();
  gltfLoader.load('./models/sonar_blender_v1.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'SONAR_BLENDER_V1_GLB';
    model.scale.setScalar(0.49);
    model.position.y = 0.49;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;
      if (child.geometry) child.geometry.computeVertexNormals();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const matItem of materials) {
          matItem.side = THREE.DoubleSide;
          if ('roughness' in matItem) matItem.roughness = Math.min(matItem.roughness, 0.46);
          if ('metalness' in matItem) matItem.metalness = 0.02;
        }
      }
    });
    finalizeLoadedModel(model);
  }, undefined, loadObjFallback);
}

function createWomanEnemy() {
  const group = new THREE.Group();
  const detailParts = [];
  const dress = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.45, 6, 12), clothWhiteMat);
  dress.position.y = 1.05;
  dress.scale.set(0.92, 1.18, 0.72);
  group.add(dress);
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.55, 12, 3, true), clothWhiteMat);
  robe.position.y = 0.78;
  robe.rotation.y = Math.PI / 18;
  group.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 9), new THREE.MeshStandardMaterial({ color: 0xc7b8aa, roughness: 0.9 }));
  head.position.y = 2.12;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.88), hairMat);
  hair.position.set(0, 2.06, 0.02);
  hair.scale.set(0.86, 1.32, 0.72);
  group.add(hair);
  for (let i = 0; i < 6; i += 1) {
    const strand = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.35 + Math.random() * 0.55, 0.018), hairMat);
    const angle = -0.85 + (i / 5) * 1.7;
    strand.position.set(Math.sin(angle) * 0.18, 1.48 - Math.random() * 0.18, 0.18 + Math.cos(angle) * 0.08);
    strand.rotation.z = -angle * 0.12;
    strand.rotation.x = 0.08 + Math.random() * 0.12;
    group.add(strand);
    detailParts.push(strand);
  }
  const faceShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.34), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.58, side: THREE.DoubleSide }));
  faceShadow.position.set(0, 2.1, 0.215);
  group.add(faceShadow);
  for (let i = 0; i < 5; i += 1) {
    const rag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38 + Math.random() * 0.28, 0.025), clothWhiteMat);
    rag.position.set(-0.26 + i * 0.13, 0.05, 0.18 + (Math.random() - 0.5) * 0.12);
    rag.rotation.z = (Math.random() - 0.5) * 0.28;
    group.add(rag);
    detailParts.push(rag);
  }
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.92, 4, 6), clothWhiteMat);
    arm.position.set(side * 0.34, 1.18, 0.04);
    arm.rotation.z = side * 0.28;
    group.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xb8aa9d, roughness: 0.92 }));
    hand.position.set(side * 0.48, 0.68, 0.1);
    group.add(hand);
  }
  const glow = new THREE.PointLight(0xdde8ff, 0.12, 2.2);
  glow.position.set(0, 1.55, 0);
  group.add(glow);
  group.traverse((child) => {
    child.userData.proceduralGhost = true;
  });
  const start = mansionNodes[Math.floor(mansionNodes.length * 0.5)] || { x: MANSION_OFFSET_X, z: MANSION_CENTER_Z };
  group.position.set(start.x, 0, start.z);
  group.visible = false;
  scene.add(group);
  return {
    group,
    x: start.x,
    z: start.z,
    target: null,
    nextPhaseAt: 60,
    phaseChargeUntil: 0,
    phaseUntil: 0,
    stunnedUntil: 0,
    phasingVisual: false,
    visualMaterials: [],
    externalModel: null,
    detailParts,
    lastSightCheckAt: -Infinity,
    cachedSeesPlayer: false,
    repathAt: 0,
    hiddenRedirectAt: 0,
    emergeStartedAt: 0,
    emergeUntil: 0,
    speed: 1.35,
  };
}

const womanEnemy = createWomanEnemy();
markSharedObject(womanEnemy.group);
const WOMAN_MODEL_UPRIGHT_X = -Math.PI / 2;
const WOMAN_MODEL_FORWARD_YAW = Math.PI;
const WOMAN_MODEL_STUN_X = 0;
const ghostDouble = createWomanEnemy();
markSharedObject(ghostDouble.group);
ghostDouble.group.visible = false;
ghostDouble.active = false;
ghostDouble.spawnAt = Infinity;
ghostDouble.despawnAt = 0;
ghostDouble.runChaseSpeed = 0;
ghostDouble.visualMaterials = [];
ghostDouble.group.traverse((child) => {
  if (!child.material) return;
  const materials = Array.isArray(child.material) ? child.material : [child.material];
  for (const matItem of materials) {
    matItem.transparent = true;
    matItem.opacity = 0.42;
    matItem.emissive = matItem.emissive || new THREE.Color(0x000000);
    matItem.emissive.setHex(0x1a2032);
    matItem.emissiveIntensity = Math.max(matItem.emissiveIntensity || 0, 0.16);
    ghostDouble.visualMaterials.push(matItem);
  }
});

const ghostIllusions = Array.from({ length: 10 }, () => {
  const illusion = createWomanEnemy();
  markSharedObject(illusion.group);
  illusion.group.visible = false;
  illusion.active = false;
  illusion.despawnAt = 0;
  illusion.speed = 5.2;
  illusion.target = new THREE.Vector3();
  illusion.clingUntil = 0;
  illusion.group.traverse((child) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const matItem of materials) {
      matItem.transparent = true;
      matItem.opacity = Math.min(matItem.opacity ?? 1, 0.48);
      matItem.depthWrite = false;
    }
  });
  return illusion;
});
const ghostEmergeEffect = new THREE.Mesh(
  new THREE.CircleGeometry(1.45, 28),
  new THREE.MeshBasicMaterial({ color: 0x5a0606, transparent: true, opacity: 0, depthWrite: false }),
);
ghostEmergeEffect.rotation.x = -Math.PI / 2;
ghostEmergeEffect.visible = false;
markSharedObject(ghostEmergeEffect);
scene.add(ghostEmergeEffect);
womanEnemy.group.traverse((child) => {
  if (!child.material) return;
  const materials = Array.isArray(child.material) ? child.material : [child.material];
  for (const matItem of materials) womanEnemy.visualMaterials.push(matItem);
});

function loadExternalWomanModel() {
  if (womanEnemy.externalModel) return;
  const loader = new GLTFLoader();
  loader.load('./models/yurei_woman_v1.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'YUREI_WOMAN_V1_GLB';
    model.rotation.set(WOMAN_MODEL_UPRIGHT_X, WOMAN_MODEL_FORWARD_YAW, 0);
    model.position.set(0, -0.03, 0);
    model.scale.setScalar(1.02);
    model.traverse((child) => {
      if (!child.isMesh && !child.isLight) return;
      child.frustumCulled = true;
      child.castShadow = false;
      child.receiveShadow = false;
      if (child.geometry) child.geometry.computeVertexNormals();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const matItem of materials) {
          matItem.side = THREE.DoubleSide;
          matItem.roughness = Math.max(matItem.roughness ?? 0.85, 0.82);
          matItem.needsUpdate = true;
        }
      }
    });
    for (const child of womanEnemy.group.children) {
      if (child.userData.proceduralGhost) child.visible = false;
    }
    womanEnemy.externalModel = model;
    womanEnemy.visualMaterials = [];
    womanEnemy.detailParts = [];
    model.traverse((child) => {
      if (!child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const matItem of materials) womanEnemy.visualMaterials.push(matItem);
    });
    womanEnemy.group.add(model);
    applyExternalWomanModelToGhostDouble(model);
  }, undefined, () => {
    // Keep the procedural ghost as a safe fallback if the external model fails.
  });
}

loadExternalWomanModel();

function applyExternalWomanModelToGhostDouble(sourceModel) {
  if (!sourceModel || ghostDouble.externalModel) return;
  const clone = sourceModel.clone(true);
  clone.name = 'YUREI_WOMAN_V1_DOUBLE_GLB';
  clone.rotation.set(WOMAN_MODEL_UPRIGHT_X, WOMAN_MODEL_FORWARD_YAW, 0);
  ghostDouble.visualMaterials = [];
  clone.traverse((child) => {
    child.frustumCulled = true;
    child.castShadow = false;
    child.receiveShadow = false;
    if (!child.material) return;
    if (Array.isArray(child.material)) child.material = child.material.map((matItem) => matItem.clone());
    else child.material = child.material.clone();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const matItem of materials) {
      matItem.transparent = true;
      matItem.opacity = 0.42;
      matItem.depthWrite = false;
      if (matItem.emissive) {
        matItem.emissive.setHex(0x1a2032);
        matItem.emissiveIntensity = Math.max(matItem.emissiveIntensity || 0, 0.16);
      }
      matItem.needsUpdate = true;
      ghostDouble.visualMaterials.push(matItem);
    }
  });
  for (const child of ghostDouble.group.children) {
    if (child.userData.proceduralGhost) child.visible = false;
  }
  ghostDouble.externalModel = clone;
  ghostDouble.group.add(clone);
  applyExternalWomanModelToIllusions(sourceModel);
}

function applyExternalWomanModelToIllusions(sourceModel) {
  if (!sourceModel) return;
  for (let index = 0; index < ghostIllusions.length; index += 1) {
    const illusion = ghostIllusions[index];
    if (illusion.externalModel) continue;
    const clone = sourceModel.clone(true);
    clone.name = `YUREI_WOMAN_ILLUSION_${index}`;
    clone.rotation.set(WOMAN_MODEL_UPRIGHT_X, WOMAN_MODEL_FORWARD_YAW, 0);
    illusion.visualMaterials = [];
    clone.traverse((child) => {
      child.frustumCulled = true;
      child.castShadow = false;
      child.receiveShadow = false;
      if (!child.material) return;
      if (Array.isArray(child.material)) child.material = child.material.map((matItem) => matItem.clone());
      else child.material = child.material.clone();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const matItem of materials) {
        matItem.transparent = true;
        matItem.opacity = 0.34;
        matItem.depthWrite = false;
        if (matItem.emissive) {
          matItem.emissive.setHex(0x2d3145);
          matItem.emissiveIntensity = Math.max(matItem.emissiveIntensity || 0, 0.22);
        }
        matItem.needsUpdate = true;
        illusion.visualMaterials.push(matItem);
      }
    });
    for (const child of illusion.group.children) {
      if (child.userData.proceduralGhost) child.visible = false;
    }
    illusion.externalModel = clone;
    illusion.group.add(clone);
  }
}

function setWomanVisualPose(stunned = false) {
  womanEnemy.group.rotation.x = 0;
  womanEnemy.group.rotation.z = 0;
  if (womanEnemy.externalModel) {
    womanEnemy.externalModel.rotation.set(stunned ? WOMAN_MODEL_STUN_X : WOMAN_MODEL_UPRIGHT_X, WOMAN_MODEL_FORWARD_YAW, 0);
    womanEnemy.externalModel.position.set(0, stunned ? -0.42 : -0.03, 0);
  }
}

function setWomanPhasingVisual(active) {
  if (womanEnemy.phasingVisual === active) return;
  womanEnemy.phasingVisual = active;
  for (const matItem of womanEnemy.visualMaterials) {
    matItem.transparent = active;
    matItem.opacity = active ? 0.52 : 1;
    matItem.depthWrite = !active;
    matItem.needsUpdate = true;
  }
}

const VISION_DISTANCE = 10.5;
const VISION_HALF_ANGLE = Math.acos(0.84);
const VISION_RAYS = 5;
const CAPTURE_DISTANCE = 0.55;
const MOVING_CAPTURE_DISTANCE = 1.55;
const MOVING_CLOSE_CAPTURE_DISTANCE = 1.25;
const WALL_PIN_CAPTURE_DISTANCE = 2.05;
const POUNCE_TRIGGER_DISTANCE = 2.0;
const POUNCE_DURATION = 1.0;
const POUNCE_CAPTURE_DISTANCE = 1.45;
const POUNCE_LANDING_CAPTURE_DISTANCE = 1.7;
const RECENT_SIGHT_MEMORY = 5.0;
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
markSharedObject(enemyVisionLines);
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

function enemyVisionAlertRatio() {
  return THREE.MathUtils.clamp(Math.max(state.detection, enemyData.alertMemory * 100) / 100, 0, 1);
}

function currentEnemyVisionDistance() {
  const ratio = enemyVisionAlertRatio();
  const huntBonus = state.alert === 'HUNTING' ? 1.6 : state.alert === 'SUPER_ALERT' ? 0.9 : 0;
  const lowAlertScale = state.detection <= 40 ? 0.5 : 1;
  return (8.2 + ratio * 6.2 + huntBonus) * lowAlertScale;
}

function currentEnemyVisionHalfAngle() {
  const ratio = enemyVisionAlertRatio();
  const lowAlertScale = state.detection <= 40 ? 0.5 : 1;
  return THREE.MathUtils.lerp(Math.PI / 13, Math.PI / 5.2, ratio) * lowAlertScale;
}

function currentEnemyVisionFacingThreshold() {
  return Math.cos(currentEnemyVisionHalfAngle());
}

function visionRayDistance(originX, originZ, dx, dz, maxDistance = currentEnemyVisionDistance()) {
  let nearest = maxDistance;
  const rayMinX = Math.min(originX, originX + dx * maxDistance) - 0.2;
  const rayMaxX = Math.max(originX, originX + dx * maxDistance) + 0.2;
  const rayMinZ = Math.min(originZ, originZ + dz * maxDistance) - 0.2;
  const rayMaxZ = Math.max(originZ, originZ + dz * maxDistance) + 0.2;
  const candidates = colliderCandidatesInAabb(rayMinX, rayMaxX, rayMinZ, rayMaxZ);
  for (const collider of candidates) {
    if (collider.x + collider.hw < rayMinX || collider.x - collider.hw > rayMaxX
      || collider.z + collider.hz < rayMinZ || collider.z - collider.hz > rayMaxZ) continue;
    const entry = rayColliderEntry(originX, originZ, dx, dz, collider, nearest);
    if (entry < nearest) nearest = entry;
  }
  return Math.max(0.1, nearest - 0.03);
}

function updateEnemyVision() {
  const visionSource = state.mapMode === 'mansion' ? womanEnemy.group : enemy;
  if (state.mapMode === 'mansion' && clock.elapsedTime < womanEnemy.stunnedUntil) {
    enemyVisionLines.visible = false;
    return;
  }
  if (state.mapMode === 'mansion'
    && horizontalDistance(visionSource.position, camera.position) > MANSION_RENDER_RADIUS) {
    enemyVisionLines.visible = false;
    return;
  }
  enemyVisionLines.visible = true;
  const lowAlertScale = state.detection <= 40 ? 0.5 : 1;
  const mansionAlertScale = THREE.MathUtils.lerp(0.55, 1.15, enemyVisionAlertRatio()) * lowAlertScale;
  const visionDistance = state.mapMode === 'mansion' ? 13.5 * mansionAlertScale : currentEnemyVisionDistance();
  const visionHalfAngle = state.mapMode === 'mansion' ? (Math.PI / 4.2) * mansionAlertScale : currentEnemyVisionHalfAngle();
  for (let i = 0; i < VISION_RAYS; i += 1) {
    const offset = -visionHalfAngle + (visionHalfAngle * 2 * i) / (VISION_RAYS - 1);
    const angle = visionSource.rotation.y + offset;
    const dx = Math.sin(angle);
    const dz = Math.cos(angle);
    const distance = visionRayDistance(visionSource.position.x, visionSource.position.z, dx, dz, visionDistance);
    const cursor = i * 6;
    visionPositions[cursor] = visionSource.position.x;
    visionPositions[cursor + 1] = 0.08;
    visionPositions[cursor + 2] = visionSource.position.z;
    visionPositions[cursor + 3] = visionSource.position.x + dx * distance;
    visionPositions[cursor + 4] = 0.08;
    visionPositions[cursor + 5] = visionSource.position.z + dz * distance;
  }
  enemyVisionMaterial.opacity = state.alert === 'HUNTING' ? 0.78 : state.alert === 'SUPER_ALERT' ? 0.62 : 0.42;
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
  lastSawPlayerAt: -Infinity,
  lastSeenPlayerPosition: null,
  soundSourceTarget: null,
  soundChaseStartedAt: -Infinity,
  pounceUntil: 0,
  pounceStartedAt: 0,
  pounceFrom: null,
  pounceTarget: null,
  wallSoundRepathUntil: 0,
  superSearchUntil: 0,
  stuckSince: 0,
  lastMoveX: enemy.position.x,
  lastMoveZ: enemy.position.z,
  lastTargetDistance: Infinity,
  recentTargetKeys: [],
  wallSlideAttempts: 0,
  oscillationSince: 0,
  oscillationAnchorX: enemy.position.x,
  oscillationAnchorZ: enemy.position.z,
  lastRoomJumpAt: -Infinity,
  recoveryJump: null,
  loopEscapeUntil: 0,
  closeRangeStuckSince: 0,
  closeRangeAnchorX: enemy.position.x,
  closeRangeAnchorZ: enemy.position.z,
  globalStuckSince: 0,
  globalStuckAnchorX: enemy.position.x,
  globalStuckAnchorZ: enemy.position.z,
  lastUnstuckRouteAt: -Infinity,
};

function nearestNode(x, z) {
  let best = null;
  let bestDistance = Infinity;
  const radarNodes = state.mapMode === 'mansion' ? mansionNodes : [...navNodes.values()];
  for (const node of radarNodes) {
    const distance = Math.hypot(node.x - x, node.z - z);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

function nearestReachableNode(x, z, maxProbeDistance = 8) {
  const probe = new THREE.Vector3(x, 1.1, z);
  const sorted = [...navNodes.values()]
    .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const visible = sorted.find((node) =>
    Math.hypot(node.x - x, node.z - z) <= maxProbeDistance
    && canEnemyMoveTo(node.x, node.z)
    && hasLineOfSight(probe, new THREE.Vector3(node.x, 1.1, node.z)));
  return visible || sorted.find((node) => canEnemyMoveTo(node.x, node.z)) || sorted[0] || null;
}

function nearestPathableNodeTo(x, z) {
  return [...navNodes.values()]
    .filter((node) => canEnemyMoveTo(node.x, node.z, 0.18))
    .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0]
    || nearestNode(x, z);
}

function enemyGridPosition() {
  return {
    gx: Math.round(enemy.position.x / CELL + GRID_HALF_W),
    gz: Math.round(enemy.position.z / CELL + GRID_HALF_H),
  };
}

function resetEnemyNavigationAfterRelocation(x, z, time) {
  enemyData.path = [];
  enemyData.stuckSince = 0;
  enemyData.wallSlideAttempts = 0;
  enemyData.oscillationSince = 0;
  enemyData.oscillationAnchorX = x;
  enemyData.oscillationAnchorZ = z;
  enemyData.lastTargetDistance = Infinity;
  enemyData.lastRoomJumpAt = time;
  enemyData.pauseUntil = Math.max(enemyData.pauseUntil, time + 0.12);
}

function startEnemyRecoveryJump(target, time, after = 'resume') {
  if (!target || time - enemyData.lastRoomJumpAt < 3.0) return false;
  if (!canEnemyMoveIgnoringFurniture(target.x, target.z, 0.2)) return false;
  if (hasWallBetweenPoints(enemy.position.x, enemy.position.z, target.x, target.z, 0.1)) return false;
  enemyData.recoveryJump = {
    fromX: enemy.position.x,
    fromZ: enemy.position.z,
    toX: target.x,
    toZ: target.z,
    startedAt: time,
    duration: THREE.MathUtils.clamp(Math.hypot(target.x - enemy.position.x, target.z - enemy.position.z) / 7.5, 0.45, 1.15),
    after,
  };
  enemyData.path = [];
  enemyData.isMoving = true;
  enemyData.pauseUntil = 0;
  enemyData.lookAroundUntil = 0;
  enemy.rotation.y = Math.atan2(target.x - enemy.position.x, target.z - enemy.position.z);
  return true;
}

function updateEnemyRecoveryJump(time) {
  const jump = enemyData.recoveryJump;
  if (!jump) return false;
  const progress = THREE.MathUtils.clamp((time - jump.startedAt) / jump.duration, 0, 1);
  const eased = progress < 0.5
    ? 2 * progress * progress
    : 1 - ((-2 * progress + 2) ** 2) / 2;
  enemy.position.x = THREE.MathUtils.lerp(jump.fromX, jump.toX, eased);
  enemy.position.z = THREE.MathUtils.lerp(jump.fromZ, jump.toZ, eased);
  enemy.position.y = Math.sin(progress * Math.PI) * 0.55;
  enemyData.isMoving = true;
  if (progress < 1) return true;
  enemy.position.set(jump.toX, 0, jump.toZ);
  enemyData.recoveryJump = null;
  resetEnemyNavigationAfterRelocation(jump.toX, jump.toZ, time);
  if (jump.after === 'player' && !state.hidden && state.detection > 62) {
    setEnemyDestinationViaCorridor(camera.position.x, camera.position.z, enemyData.mode === 'HUNTING' ? 'HUNTING' : 'SEARCHING', true);
  } else if (jump.after === 'sound' && enemyData.lastHeardPosition) {
    setEnemyDestinationToSoundSource(enemyData.lastHeardPosition.x, enemyData.lastHeardPosition.z, enemyData.mode === 'HUNTING' ? 'HUNTING' : 'INVESTIGATING', enemyData.lastHeardPosition.roomId);
  } else {
    chooseRandomEnemyRoute(enemyData.mode === 'SEARCHING' ? 'SEARCHING' : 'ROAMING');
  }
  return true;
}

function jumpEnemyToRoomEntrance(time) {
  if (time - enemyData.lastRoomJumpAt < 3.0) return false;
  const { gx, gz } = enemyGridPosition();
  const room = getRoomAt(gx, gz);
  if (!room) return false;
  const connectorPoints = room.connector
    .map(([cgx, cgz]) => {
      const pos = worldFromGrid(cgx, cgz);
      return { x: pos.x, z: pos.z };
    })
    .filter((pos) => canEnemyMoveTo(pos.x, pos.z, 0.22))
    .sort((a, b) => Math.hypot(a.x - enemy.position.x, a.z - enemy.position.z)
      - Math.hypot(b.x - enemy.position.x, b.z - enemy.position.z));
  const entrance = connectorPoints[0];
  if (!entrance) return false;
  return startEnemyRecoveryJump(entrance, time, !state.hidden && state.detection > 62 ? 'player' : 'random');
}

function schoolNodeDegree(node) {
  return directions.reduce((count, [dx, dz]) =>
    count + (walkable.has(gridKey(node.gx + dx, node.gz + dz)) ? 1 : 0), 0);
}

function jumpEnemyToCorridorEscape(time) {
  if (time - enemyData.lastRoomJumpAt < 3.0) return false;
  const current = nearestReachableNode(enemy.position.x, enemy.position.z, 8) || nearestNode(enemy.position.x, enemy.position.z);
  if (!current) return false;
  const candidates = [...navNodes.values()]
    .filter((node) => node.key !== current.key && node.key !== enemyData.targetKey)
    .filter((node) => !enemyData.recentTargetKeys.slice(0, 4).includes(node.key))
    .filter((node) => canEnemyMoveTo(node.x, node.z, 0.22))
    .map((node) => {
      const path = findPath(current.key, node.key);
      if (!path.length && current.key !== node.key) return null;
      const distance = Math.hypot(node.x - enemy.position.x, node.z - enemy.position.z);
      const degreeBonus = schoolNodeDegree(node) >= 3 ? -8 : 0;
      const roomPenalty = getRoomAt(node.gx, node.gz) ? 4 : 0;
      return { node, score: Math.abs(distance - 9) + path.length * 0.4 + degreeBonus + roomPenalty };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);
  const escape = candidates[0]?.node;
  if (!escape) return false;
  return startEnemyRecoveryJump(escape, time, !state.hidden && state.detection > 62 ? 'player' : 'random');
}

function recoverEnemyFromOscillation(time) {
  return jumpEnemyToRoomEntrance(time) || jumpEnemyToCorridorEscape(time);
}

function findPath(startKey, targetKey) {
  if (!startKey || !targetKey || startKey === targetKey) return [];
  const startNode = navNodes.get(startKey);
  const targetNode = navNodes.get(targetKey);
  const queue = [startKey];
  const previous = new Map([[startKey, null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current === targetKey) break;
    const node = navNodes.get(current);
    for (const [dx, dz] of directions) {
      const nextKey = gridKey(node.gx + dx, node.gz + dz);
      if (!walkable.has(nextKey) || previous.has(nextKey)) continue;
      const nextNode = navNodes.get(nextKey);
      if (
        nextKey !== targetKey
        && nextKey !== startKey
        && nextNode
        && !canEnemyMoveIgnoringFurniture(nextNode.x, nextNode.z, 0.18)
      ) continue;
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
  return result.filter((node) => node === targetNode || node === startNode || canEnemyMoveIgnoringFurniture(node.x, node.z, 0.18));
}

function reachableSchoolNodesFrom(startKey) {
  if (!startKey) return [];
  const queue = [startKey];
  const seen = new Set([startKey]);
  const result = [];
  while (queue.length) {
    const current = queue.shift();
    const node = navNodes.get(current);
    if (!node) continue;
    result.push(node);
    for (const [dx, dz] of directions) {
      const nextKey = gridKey(node.gx + dx, node.gz + dz);
      if (!walkable.has(nextKey) || seen.has(nextKey)) continue;
      const nextNode = navNodes.get(nextKey);
      if (!nextNode || !canEnemyMoveIgnoringFurniture(nextNode.x, nextNode.z, 0.18)) continue;
      seen.add(nextKey);
      queue.push(nextKey);
    }
  }
  return result;
}

function rememberEnemyTarget(key) {
  if (!key) return;
  enemyData.recentTargetKeys = [key, ...enemyData.recentTargetKeys.filter((recent) => recent !== key)].slice(0, 8);
}

function commitEnemyPath(path, target, mode) {
  enemyData.path = path;
  enemyData.targetKey = target?.key || null;
  enemyData.mode = mode;
  rememberEnemyTarget(enemyData.targetKey);
}

function setEnemyDestination(x, z, mode = 'ROAMING') {
  const start = nearestReachableNode(enemy.position.x, enemy.position.z);
  const target = nearestPathableNodeTo(x, z);
  if (!start || !target) return false;
  let path = findPath(start.key, target.key);
  let finalTarget = target;
  if (!path.length && start.key !== target.key) {
    const connected = reachableSchoolNodesFrom(start.key);
    const alternatives = (connected.length ? connected : [...navNodes.values()])
      .filter((node) => node.key === target.key || canEnemyMoveTo(node.x, node.z, 0.18))
      .filter((node) => node.key !== start.key)
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    for (const candidate of alternatives) {
      path = findPath(start.key, candidate.key);
      if (path.length) {
        finalTarget = candidate;
        break;
      }
    }
  }
  if (!path.length && start.key === finalTarget.key) {
    if (Math.hypot(enemy.position.x - x, enemy.position.z - z) > 1.2) {
      return false;
    }
  }
  commitEnemyPath(path, finalTarget, mode);
  return path.length > 0 || Math.hypot(enemy.position.x - finalTarget.x, enemy.position.z - finalTarget.z) <= 1.2;
}

function setEnemyDestinationNear(x, z, mode = 'ROAMING', radius = 2.2) {
  const start = nearestReachableNode(enemy.position.x, enemy.position.z);
  if (!start) return false;
  const soundProbe = new THREE.Vector3(x, 1.1, z);
  const candidates = [...navNodes.values()]
    .filter((node) => canEnemyMoveTo(node.x, node.z, 0.18))
    .filter((node) => Math.hypot(node.x - x, node.z - z) <= radius + 2.4)
    .map((node) => {
      const path = findPath(start.key, node.key);
      if (!path.length && start.key !== node.key) return null;
      const roomPenalty = getRoomAt(node.gx, node.gz) ? 5.5 : 0;
      const sightBonus = hasLineOfSight(new THREE.Vector3(node.x, 1.1, node.z), soundProbe) ? -4.5 : 0;
      const exactDistance = Math.hypot(node.x - x, node.z - z);
      const pathCost = path.length * 1.25;
      return { node, path, score: exactDistance + pathCost + roomPenalty + sightBonus };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);
  const best = candidates[0];
  if (best) {
    commitEnemyPath(best.path, best.node, mode);
    return true;
  }
  setEnemyDestination(x, z, mode);
  return enemyData.mode === mode;
}

function setEnemyDestinationToSoundSource(x, z, mode = 'INVESTIGATING', roomId = null) {
  const start = nearestReachableNode(enemy.position.x, enemy.position.z);
  if (!start) return false;
  enemyData.soundSourceTarget = { x, z, roomId };
  enemyData.soundChaseStartedAt = clock.elapsedTime;
  const soundProbe = new THREE.Vector3(x, 1.1, z);
  const soundGrid = gridFromWorld(x, z);
  const soundRoom = schoolRoomById(roomId) || getRoomAt(soundGrid.gx, soundGrid.gz);
  const roomCenterPoint = soundRoom ? roomCenter(soundRoom) : null;
  const allCandidates = [...navNodes.values()]
    .filter((node) => canEnemyMoveIgnoringFurniture(node.x, node.z, 0.18))
    .map((node) => {
      const path = findPath(start.key, node.key);
      if (!path.length && start.key !== node.key) return null;
      const distanceToSound = Math.hypot(node.x - x, node.z - z);
      const nodeRoom = getRoomAt(node.gx, node.gz);
      const sameRoomBonus = soundRoom && nodeRoom?.id === soundRoom.id ? -85 : 0;
      const wrongSidePenalty = soundRoom && nodeRoom?.id !== soundRoom.id ? 75 : 0;
      const roomDepthBonus = soundRoom && nodeRoom?.id === soundRoom.id && roomCenterPoint
        ? -Math.max(0, 8 - Math.hypot(node.x - roomCenterPoint.x, node.z - roomCenterPoint.z)) * 1.8
        : 0;
      const lineBonus = hasLineOfSight(new THREE.Vector3(node.x, 1.1, node.z), soundProbe) ? -2.5 : 0;
      return {
        node,
        path,
        sameRoom: Boolean(soundRoom && nodeRoom?.id === soundRoom.id),
        score: distanceToSound * 3.2 + path.length * 0.72 + lineBonus + sameRoomBonus + wrongSidePenalty + roomDepthBonus,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);
  const candidates = soundRoom && allCandidates.some((candidate) => candidate.sameRoom)
    ? allCandidates.filter((candidate) => candidate.sameRoom)
    : allCandidates;
  const best = candidates[0];
  if (!best) return setEnemyDestinationViaCorridor(x, z, mode, true);
  const exactTarget = canEnemyMoveIgnoringFurniture(x, z, 0.18)
    && !hasWallBetweenPoints(best.node.x, best.node.z, x, z, 0.08)
    ? { x, z, key: 'sound-source' }
    : null;
  const roomInteriorTarget = soundRoom && !exactTarget
    ? { x: best.node.x, z: best.node.z, key: `sound-room-${soundRoom.id}` }
    : null;
  commitEnemyPath(exactTarget ? [...best.path, exactTarget] : roomInteriorTarget ? [...best.path, roomInteriorTarget] : best.path, best.node, mode);
  return true;
}

function setEnemyDestinationViaCorridor(x, z, mode = 'INVESTIGATING', forceCenterRoute = false) {
  if (!forceCenterRoute) return setEnemyDestinationNear(x, z, mode, 6.8);
  const start = nearestReachableNode(enemy.position.x, enemy.position.z);
  if (!start) return false;
  const targetProbe = new THREE.Vector3(x, 1.1, z);
  const targetCandidates = [...navNodes.values()]
    .filter((node) => Math.hypot(node.x - x, node.z - z) <= 9.2)
    .filter((node) => canEnemyMoveTo(node.x, node.z))
    .sort((a, b) => {
      const aSight = hasLineOfSight(new THREE.Vector3(a.x, 1.1, a.z), targetProbe) ? -5 : 0;
      const bSight = hasLineOfSight(new THREE.Vector3(b.x, 1.1, b.z), targetProbe) ? -5 : 0;
      const aRoom = getRoomAt(a.gx, a.gz) ? 4 : 0;
      const bRoom = getRoomAt(b.gx, b.gz) ? 4 : 0;
      return Math.hypot(a.x - x, a.z - z) + aRoom + aSight
        - (Math.hypot(b.x - x, b.z - z) + bRoom + bSight);
    });
  const centerCandidates = [...navNodes.values()]
    .filter((node) => [6, 12, 18].includes(node.gx) && node.key !== start.key)
    .filter((node) => canEnemyMoveTo(node.x, node.z))
    .sort((a, b) => Math.hypot(a.x - enemy.position.x, a.z - enemy.position.z)
      - Math.hypot(b.x - enemy.position.x, b.z - enemy.position.z));
  let best = null;
  for (const center of centerCandidates.slice(0, 10)) {
    const toCenter = findPath(start.key, center.key);
    if (!toCenter.length && start.key !== center.key) continue;
    for (const target of targetCandidates.slice(0, 14)) {
      const toTarget = findPath(center.key, target.key);
      if (!toTarget.length && center.key !== target.key) continue;
      const score = toCenter.length * 1.1
        + toTarget.length
        + Math.hypot(target.x - x, target.z - z) * 0.45
        + Math.abs(center.gz - target.gz) * 0.08;
      if (!best || score < best.score) best = { center, target, path: [...toCenter, ...toTarget], score };
    }
  }
  if (best?.path?.length) {
    commitEnemyPath(best.path, best.target, mode);
    return true;
  }
  return setEnemyDestinationNear(x, z, mode, 8.6);
}

function chooseRandomEnemyRoute(mode = 'ROAMING') {
  const alertSpread = THREE.MathUtils.clamp((state.detection + enemyData.alertMemory * 55) / 100, 0, 1);
  let choices = [...navNodes.values()]
    .filter((node) => node.key !== enemyData.targetKey)
    .filter((node) => !enemyData.recentTargetKeys.includes(node.key));
  if (alertSpread > 0.45 && Math.random() < alertSpread) {
    choices = choices
      .filter((node) => Math.hypot(node.x - enemy.position.x, node.z - enemy.position.z) > 10 * alertSpread)
      .sort((a, b) =>
        Math.hypot(b.x - camera.position.x, b.z - camera.position.z)
        - Math.hypot(a.x - camera.position.x, a.z - camera.position.z));
  }
  if (!choices.length) choices = [...navNodes.values()].filter((node) => node.key !== enemyData.targetKey);
  const shuffled = shuffleCopy(choices)
    .filter((node) => Math.hypot(node.x - enemy.position.x, node.z - enemy.position.z) > CELL * 1.2);
  for (const target of shuffled.slice(0, 12)) {
    if (setEnemyDestination(target.x, target.z, mode)) return;
  }
  const fallback = [...navNodes.values()]
    .filter((node) => node.key !== enemyData.targetKey)
    .sort((a, b) => Math.hypot(b.x - enemy.position.x, b.z - enemy.position.z) - Math.hypot(a.x - enemy.position.x, a.z - enemy.position.z))[0];
  if (fallback) setEnemyDestination(fallback.x, fallback.z, mode);
}

function chooseOuterLoopRoute(time, mode = 'SEARCHING') {
  const edgeScore = (node) => Math.min(node.gx, GRID_W - 1 - node.gx, node.gz, GRID_H - 1 - node.gz);
  const choices = [...navNodes.values()]
    .filter((node) => node.key !== enemyData.targetKey)
    .filter((node) => !enemyData.recentTargetKeys.slice(0, 10).includes(node.key))
    .filter((node) => canEnemyMoveIgnoringFurniture(node.x, node.z, 0.18))
    .filter((node) => Math.hypot(node.x - enemy.position.x, node.z - enemy.position.z) > CELL * 2.2)
    .sort((a, b) => {
      const aScore = edgeScore(a) * 4 - Math.hypot(a.x - enemy.position.x, a.z - enemy.position.z) * 0.35 + Math.random() * 6;
      const bScore = edgeScore(b) * 4 - Math.hypot(b.x - enemy.position.x, b.z - enemy.position.z) * 0.35 + Math.random() * 6;
      return aScore - bScore;
    });
  for (const target of choices.slice(0, 8)) {
    if (!setEnemyDestination(target.x, target.z, mode)) continue;
    enemyData.loopEscapeUntil = time + 8;
    enemyData.searchUntil = Math.max(enemyData.searchUntil, time + 10);
    enemyData.repathAt = time + 1.4;
    return true;
  }
  return false;
}

function chooseSuperAlertRoute(time) {
  const farNodes = [...navNodes.values()]
    .filter((node) => node.key !== enemyData.targetKey)
    .filter((node) => !enemyData.recentTargetKeys.slice(0, 5).includes(node.key))
    .filter((node) =>
      Math.hypot(node.x - enemy.position.x, node.z - enemy.position.z) > 14
      || Math.hypot(node.x - camera.position.x, node.z - camera.position.z) > 11)
    .sort((a, b) =>
      (Math.hypot(b.x - enemy.position.x, b.z - enemy.position.z) + Math.random() * 10)
      - (Math.hypot(a.x - enemy.position.x, a.z - enemy.position.z) + Math.random() * 10));
  const target = farNodes[0] || [...navNodes.values()].filter((node) => node.key !== enemyData.targetKey)[0];
  if (target) setEnemyDestination(target.x, target.z, 'SEARCHING');
  enemyData.searchUntil = Math.max(enemyData.searchUntil, time + 30);
  enemyData.lookAroundUntil = Math.max(enemyData.lookAroundUntil, time + 0.8);
}

function chooseCoverSearchRoute(preferredCover = null) {
  const origin = enemyData.lastHeardPosition || { x: enemy.position.x, z: enemy.position.z };
  const alertWideSearch = state.detection > 62 || enemyData.alertMemory > 0.58;
  let nearbyCovers = alertWideSearch
    ? coverPoints
    : coverPoints.filter((cover) => Math.hypot(cover.x - origin.x, cover.z - origin.z) < 11);
  if (!nearbyCovers.length) nearbyCovers = coverPoints;
  if (alertWideSearch) {
    nearbyCovers = nearbyCovers
      .filter((cover) => Math.hypot(cover.x - enemy.position.x, cover.z - enemy.position.z) > 12)
      .sort(() => Math.random() - 0.5);
    if (!nearbyCovers.length) nearbyCovers = coverPoints.slice().sort(() => Math.random() - 0.5);
  }
  const cover = preferredCover || nearbyCovers[Math.floor(Math.random() * nearbyCovers.length)];
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

function chooseCoverSearchRouteNearPlayer() {
  const nearestCover = coverPoints
    .filter((cover) => Math.hypot(cover.x - camera.position.x, cover.z - camera.position.z) < 4.2)
    .sort((a, b) =>
      Math.hypot(a.x - camera.position.x, a.z - camera.position.z)
      - Math.hypot(b.x - camera.position.x, b.z - camera.position.z))[0];
  if (nearestCover) chooseCoverSearchRoute(nearestCover);
  else chooseCoverSearchRoute();
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

function nearestRoomToPoint(x, z) {
  const exact = schoolRoomAtWorld(x, z);
  if (exact) return exact;
  return schoolRooms
    .map((room) => {
      const center = roomCenter(room);
      return { room, distance: Math.hypot(center.x - x, center.z - z) };
    })
    .sort((a, b) => a.distance - b.distance)[0]?.room || null;
}

function routeEnemyToPlayerNearestRoom(time) {
  const room = nearestRoomToPoint(camera.position.x, camera.position.z);
  if (!room) return false;
  const start = nearestReachableNode(enemy.position.x, enemy.position.z, 12) || nearestNode(enemy.position.x, enemy.position.z);
  if (!start) return false;
  const roomCenterPoint = roomCenter(room);
  const entranceNodes = room.connector
    .map(([gx, gz]) => navNodes.get(gridKey(gx, gz)) || nearestNode(worldFromGrid(gx, gz).x, worldFromGrid(gx, gz).z))
    .filter(Boolean);
  const interiorNodes = [...navNodes.values()]
    .filter((node) => node.gx >= room.gx0 && node.gx <= room.gx1 && node.gz >= room.gz0 && node.gz <= room.gz1)
    .filter((node) => canEnemyMoveIgnoringFurniture(node.x, node.z, 0.16))
    .sort((a, b) => Math.hypot(a.x - camera.position.x, a.z - camera.position.z)
      - Math.hypot(b.x - camera.position.x, b.z - camera.position.z));
  const targets = [...interiorNodes.slice(0, 6), ...entranceNodes];
  let best = null;
  for (const entrance of entranceNodes.length ? entranceNodes : [nearestNode(roomCenterPoint.x, roomCenterPoint.z)]) {
    if (!entrance) continue;
    const toEntrance = findPath(start.key, entrance.key);
    if (!toEntrance.length && start.key !== entrance.key) continue;
    for (const target of targets) {
      if (!target) continue;
      const toTarget = target.key === entrance.key ? [] : findPath(entrance.key, target.key);
      if (!toTarget.length && target.key !== entrance.key) continue;
      const score = toEntrance.length + toTarget.length * 0.8 + Math.hypot(target.x - camera.position.x, target.z - camera.position.z) * 0.25;
      if (!best || score < best.score) best = { path: [...toEntrance, ...toTarget], target, score };
    }
  }
  if (!best?.path?.length) {
    const target = targets[0] || nearestNode(roomCenterPoint.x, roomCenterPoint.z);
    if (!target) return false;
    if (!setEnemyDestination(target.x, target.z, state.detection > 70 ? 'HUNTING' : 'SEARCHING')) return false;
  } else {
    commitEnemyPath(best.path, best.target, state.detection > 70 ? 'HUNTING' : 'SEARCHING');
  }
  enemyData.closeRangeStuckSince = 0;
  enemyData.closeRangeAnchorX = enemy.position.x;
  enemyData.closeRangeAnchorZ = enemy.position.z;
  enemyData.searchUntil = Math.max(enemyData.searchUntil, time + 12);
  enemyData.investigateUntil = Math.max(enemyData.investigateUntil, time + 8);
  enemyData.pauseUntil = 0;
  enemyData.lookAroundUntil = 0;
  enemyData.repathAt = time + 0.6;
  return true;
}

function forceEnemyUnstuckRoute(time, reason = 'stuck') {
  if (time - enemyData.lastUnstuckRouteAt < 0.85) return false;
  enemyData.lastUnstuckRouteAt = time;
  enemyData.pauseUntil = 0;
  enemyData.lookAroundUntil = 0;
  enemyData.coverPeekUntil = 0;
  enemyData.blockedChaseSince = 0;
  enemyData.mode = state.detection > 55 || reason === 'near-player' ? 'SEARCHING' : enemyData.mode;
  const routedToRoom = routeEnemyToPlayerNearestRoom(time);
  if (routedToRoom && enemyData.path.length) return true;
  if (chooseOuterLoopRoute(time, enemyData.mode === 'ROAMING' ? 'ROAMING' : 'SEARCHING')) return true;
  const anchor = nearestReachableNode(enemy.position.x, enemy.position.z, 12) || nearestNode(enemy.position.x, enemy.position.z) || enemyStartNode;
  const candidates = [...navNodes.values()]
    .filter((node) => node.key !== anchor?.key)
    .filter((node) => canEnemyMoveIgnoringFurniture(node.x, node.z, 0.14))
    .sort((a, b) => Math.hypot(b.x - camera.position.x, b.z - camera.position.z)
      - Math.hypot(a.x - camera.position.x, a.z - camera.position.z));
  for (const target of candidates.slice(0, 10)) {
    if (setEnemyDestination(target.x, target.z, 'SEARCHING')) return true;
  }
  return anchor ? startEnemyRecoveryJump(anchor, time, reason === 'sound' ? 'sound' : 'random') : false;
}

function recoverEnemyNavigation(time) {
  const anchor = nearestReachableNode(enemy.position.x, enemy.position.z, 10) || nearestNode(enemy.position.x, enemy.position.z) || enemyStartNode;
  if (anchor && Math.hypot(enemy.position.x - anchor.x, enemy.position.z - anchor.z) < 2.8) {
    const after = enemyData.lastHeardPosition && time < enemyData.wallSoundRepathUntil
      ? 'sound'
      : (!state.hidden && state.detection > 70 ? 'player' : 'random');
    if (startEnemyRecoveryJump(anchor, time, after)) return;
  }
  enemyData.path = [];
  enemyData.stuckSince = 0;
  enemyData.wallSlideAttempts = 0;
  enemyData.oscillationSince = 0;
  enemyData.oscillationAnchorX = enemy.position.x;
  enemyData.oscillationAnchorZ = enemy.position.z;
  enemyData.lastTargetDistance = Infinity;
  enemyData.pauseUntil = Math.max(enemyData.pauseUntil, time + 0.18);
  if (!state.hidden && state.detection > 70) {
    setEnemyDestinationViaCorridor(camera.position.x, camera.position.z, state.alert === 'HUNTING' ? 'HUNTING' : 'SEARCHING', true);
    enemyData.repathAt = time + 1.1;
  } else if (enemyData.lastHeardPosition && time < enemyData.wallSoundRepathUntil) {
    setEnemyDestinationViaCorridor(enemyData.lastHeardPosition.x, enemyData.lastHeardPosition.z, 'INVESTIGATING', true);
  } else {
    chooseRandomEnemyRoute(enemyData.mode === 'SEARCHING' ? 'SEARCHING' : 'ROAMING');
  }
}

// Flashlight.
const BASE_FLASHLIGHT_DISTANCE = 69;
const BASE_FLASHLIGHT_ANGLE = Math.PI / 5.5;
const flashlight = new THREE.SpotLight(0xf4f1dc, 117, BASE_FLASHLIGHT_DISTANCE, BASE_FLASHLIGHT_ANGLE, 0.86, 1.8);
flashlight.castShadow = !touchDevice;
flashlight.shadow.mapSize.set(256, 256);
markSharedObject(flashlight);
markSharedObject(flashlight.target);
scene.add(flashlight);
scene.add(flashlight.target);
const fillLight = new THREE.PointLight(0xcbd5c1, 0.36, 4.4);
markSharedObject(fillLight);
scene.add(fillLight);
const lockerViewLight = new THREE.SpotLight(0x9cac9f, 20, 11, Math.PI / 5, 0.65, 1.35);
lockerViewLight.visible = false;
markSharedObject(lockerViewLight);
markSharedObject(lockerViewLight.target);
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
  const voice = ctx.createOscillator();
  const throat = ctx.createOscillator();
  const voiceFilter = ctx.createBiquadFilter();
  const throatFilter = ctx.createBiquadFilter();
  const lowGain = ctx.createGain();
  const subGain = ctx.createGain();
  const voiceGain = ctx.createGain();
  const throatGain = ctx.createGain();
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
  voice.type = 'sawtooth';
  voice.frequency.setValueAtTime(88, ctx.currentTime);
  voice.frequency.linearRampToValueAtTime(64, ctx.currentTime + 0.55);
  voice.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 1.5);
  voiceFilter.type = 'bandpass';
  voiceFilter.frequency.setValueAtTime(720, ctx.currentTime);
  voiceFilter.frequency.linearRampToValueAtTime(380, ctx.currentTime + 1.2);
  voiceFilter.Q.value = 9;
  voiceGain.gain.setValueAtTime(0.001, ctx.currentTime);
  voiceGain.gain.exponentialRampToValueAtTime(volume * 0.48, ctx.currentTime + 0.12);
  voiceGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.72);
  throat.type = 'square';
  throat.frequency.setValueAtTime(54, ctx.currentTime);
  throat.frequency.linearRampToValueAtTime(71, ctx.currentTime + 0.2);
  throat.frequency.exponentialRampToValueAtTime(36, ctx.currentTime + 1.52);
  throatFilter.type = 'bandpass';
  throatFilter.frequency.setValueAtTime(310, ctx.currentTime);
  throatFilter.frequency.linearRampToValueAtTime(155, ctx.currentTime + 1.1);
  throatFilter.Q.value = 13;
  throatGain.gain.setValueAtTime(0.001, ctx.currentTime);
  throatGain.gain.exponentialRampToValueAtTime(volume * 0.36, ctx.currentTime + 0.08);
  throatGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.78);
  bus.gain.setValueAtTime(0.001, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(volume * 1.08, ctx.currentTime + 0.18);
  bus.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.82);
  source.connect(filter).connect(growl).connect(bus);
  low.connect(lowGain).connect(bus);
  sub.connect(subGain).connect(bus);
  voice.connect(voiceFilter).connect(voiceGain).connect(bus);
  throat.connect(throatFilter).connect(throatGain).connect(bus);
  bus.connect(master);
  source.start();
  low.start();
  sub.start();
  voice.start();
  throat.start();
  source.stop(ctx.currentTime + 1.86);
  low.stop(ctx.currentTime + 1.76);
  sub.stop(ctx.currentTime + 1.82);
  voice.stop(ctx.currentTime + 1.82);
  throat.stop(ctx.currentTime + 1.84);
}

function playClearSound() {
  if (!audio) return;
  const { ctx, master } = audio;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.001, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(0.38, ctx.currentTime + 0.04);
  bus.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.25);
  bus.connect(master);
  [392, 523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = index === 0 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + index * 0.09);
    gain.gain.setValueAtTime(0.001, ctx.currentTime + index * 0.09);
    gain.gain.exponentialRampToValueAtTime(0.18 / (index + 1), ctx.currentTime + index * 0.09 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.95 + index * 0.07);
    oscillator.connect(gain).connect(bus);
    oscillator.start(ctx.currentTime + index * 0.09);
    oscillator.stop(ctx.currentTime + 1.18 + index * 0.06);
  });
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
  const heardClearly = forceTrapResponse || distance <= event.hearingRadius;
  if (!heardClearly) {
    const rangeRatio = event.hearingRadius / Math.max(distance, 0.001);
    const distantFalloff = THREE.MathUtils.clamp(rangeRatio * rangeRatio, 0.08, 0.45);
    const distantGain = (event.strength > 70 ? 0.64 : 0.11) * distantFalloff * (1 + enemyData.alertMemory * 0.35);
    setDetection(Math.max(state.detection, event.strength > 70 ? detectionFloor() + 2 : state.detection) + distantGain);
    if (now - enemyData.lastMemoryGainAt > 2.5) {
      enemyData.alertMemory = THREE.MathUtils.clamp(
        enemyData.alertMemory + (event.strength > 70 ? 0.035 : 0.008),
        0,
        1,
      );
      enemyData.lastMemoryGainAt = now;
    }
    return;
  }
  if (!forceTrapResponse && enemyData.mode === 'PASSING_BY' && now < enemyData.passByUntil) return;
  enemyData.lastHeardAt = now;
  enemyData.lastHeardPosition = { x: event.x, z: event.z, roomId: event.roomId || null };
  const wallBlockedSound = !hasLineOfSight(
    enemy.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
    new THREE.Vector3(event.x, 1.4, event.z),
  );
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
  setDetection(Math.max(state.detection, strength > 70 ? 28 : 8) + noiseGain);
  if (forceTrapResponse) {
    setEnemyDestinationViaCorridor(event.x, event.z, 'TRAP_RUSH', wallBlockedSound);
    enemyData.trapRushUntil = now + 18;
    enemyData.investigateUntil = now + 18;
    enemyData.searchUntil = now + 22;
    enemyData.investigateSpeed = 6.4;
    enemyData.pauseUntil = 0;
    enemyData.lookAroundUntil = 0;
    enemyData.passByUntil = 0;
    return;
  }
  if (state.detection >= 100 || enemyData.alertMemory >= 0.95) {
    setEnemyDestinationToSoundSource(event.x, event.z, 'HUNTING', event.roomId);
    enemyData.wallSoundRepathUntil = wallBlockedSound ? now + 10 : enemyData.wallSoundRepathUntil;
    enemyData.investigateUntil = now + 12;
    enemyData.searchUntil = now + 18;
    enemyData.investigateSpeed = Math.max(enemyData.investigateSpeed, 6.0);
    enemyData.pauseUntil = 0;
    return;
  }
  if (state.alert === 'HUNTING' && state.detection > 70) {
    if (state.detection > 92 || wallBlockedSound) setEnemyDestinationToSoundSource(event.x, event.z, 'HUNTING', event.roomId);
    else setEnemyDestinationViaCorridor(event.x, event.z, 'HUNTING', wallBlockedSound);
    enemyData.wallSoundRepathUntil = wallBlockedSound ? now + 8 : enemyData.wallSoundRepathUntil;
    enemyData.investigateSpeed = Math.max(enemyData.investigateSpeed, wallBlockedSound ? 5.8 : 3.4);
    return;
  }
  const firstReaction = enemyData.mode !== 'INVESTIGATING';
  if (wallBlockedSound || event.roomId) setEnemyDestinationToSoundSource(event.x, event.z, 'INVESTIGATING', event.roomId);
  else setEnemyDestinationViaCorridor(event.x, event.z, 'INVESTIGATING', false);
  enemyData.investigateUntil = now + 3.5 + strength * 0.025 + (wallBlockedSound ? 4 : 0);
  enemyData.searchUntil = now + 16 + (wallBlockedSound ? 8 : 0);
  enemyData.investigateSpeed = wallBlockedSound ? 5.4 : strength > 70 ? 3.15 : strength > 30 ? 2.35 : 1.8;
  enemyData.wallSoundRepathUntil = wallBlockedSound ? now + 8 : enemyData.wallSoundRepathUntil;
  if (firstReaction) enemyData.pauseUntil = wallBlockedSound ? 0 : now + 0.7;
}

function emitWorldSound(x, z, strength, baseHearingRadius, forceRipple = false, options = {}) {
  const hearingRadius = baseHearingRadius * (1 + enemyData.alertMemory * 0.28);
  const now = clock.elapsedTime;
  const soundRoom = state.mapMode === 'school' ? schoolRoomAtWorld(x, z) : null;
  const event = { x, z, strength, hearingRadius, age: 0, life: 2.4, roomId: soundRoom?.id || null, ...options };
  if (forceRipple || now >= state.nextSoundRippleAt) {
    soundEvents.push(event);
    state.nextSoundRippleAt = now + 2.6;
  }
  if (state.mapMode === 'mansion') reactWomanToSoundEvent(event, now);
  else reactToSoundEvent(event, now);
}

function emitPlayerSound(strength, baseHearingRadius) {
  emitWorldSound(camera.position.x, camera.position.z, strength, baseHearingRadius, false);
}

function isPlayerInWaterTrap() {
  if (state.mapMode !== 'mansion' || !noiseTraps.length) return false;
  return noiseTraps.some((trap) => {
    if (!trap.water) return false;
    const dx = camera.position.x - trap.x;
    const dz = camera.position.z - trap.z;
    return dx * dx + dz * dz < trap.waterRadius * trap.waterRadius;
  });
}

function updateAudio(time) {
  if (!audio) return;
  const activeEnemyPosition = state.mapMode === 'mansion' ? womanEnemy.group.position : enemy.position;
  const enemyDistance = activeEnemyPosition.distanceTo(camera.position);
  const proximity = distanceAttenuation(enemyDistance, 22, 1.05);
  audio.caveGain.gain.setTargetAtTime(0.06 + Math.sin(time * 0.17) * 0.012, audio.ctx.currentTime, 0.8);
  audio.caveLowpass.frequency.setTargetAtTime(145 + Math.sin(time * 0.09) * 32, audio.ctx.currentTime, 1.1);
  audio.nearGain.gain.setTargetAtTime((state.mapMode === 'mansion' ? 0 : proximity) * 0.095, audio.ctx.currentTime, 0.14);

  const moving = state.noise > 0 && !state.hidden;
  if (moving && time > audio.nextStep) {
    const inWater = isPlayerInWaterTrap();
    const settings = state.moveMode === 'RUNNING'
      ? { volume: 0.72, pitch: 1.2, interval: 0.27, radius: 31.5 * state.noiseMultiplier }
      : { volume: 0.46, pitch: 1, interval: 0.44, radius: 3 * state.noiseMultiplier };
    playFootstep(settings.volume * (inWater ? 3 : 1), settings.pitch * (inWater ? 0.86 : 1), 0);
    emitPlayerSound(state.noise * (inWater ? 3 : 1), settings.radius * (inWater ? 2 : 1));
    audio.nextStep = time + settings.interval;
  }

  if (state.mapMode !== 'mansion' && enemyData.isMoving && time > audio.nextEnemyStep) {
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

  if (state.mapMode !== 'mansion' && proximity > 0.02 && time > audio.nextBeat) {
    const beatVolume = 0.12 + proximity * 0.92;
    thump(beatVolume, 86 + proximity * 17);
    setTimeout(() => thump(beatVolume * 0.74, 73 + proximity * 11), 110);
    audio.nextBeat = time + THREE.MathUtils.lerp(1.28, 0.34, proximity);
  }
}

function isInsidePlayableBounds(x, z) {
  const maxX = GRID_HALF_W * CELL + CELL / 2 - 0.2;
  const maxZ = GRID_HALF_H * CELL + CELL / 2 - 0.2;
  const inSchool = x >= -maxX && x <= maxX && z >= -maxZ && z <= maxZ;
  const inMansion = inMansionBounds(x, z);
  return inSchool || inMansion;
}

function colliderBucketKey(ix, iz) {
  return `${ix},${iz}`;
}

function rebuildColliderSpatialIndex() {
  if (colliderSpatialCount === colliders.length) return;
  const buckets = new Map();
  for (const collider of colliders) {
    const minIx = Math.floor((collider.x - collider.hw) / COLLIDER_BUCKET_SIZE);
    const maxIx = Math.floor((collider.x + collider.hw) / COLLIDER_BUCKET_SIZE);
    const minIz = Math.floor((collider.z - collider.hz) / COLLIDER_BUCKET_SIZE);
    const maxIz = Math.floor((collider.z + collider.hz) / COLLIDER_BUCKET_SIZE);
    for (let ix = minIx; ix <= maxIx; ix += 1) {
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        const key = colliderBucketKey(ix, iz);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(collider);
      }
    }
  }
  colliderSpatialBuckets = buckets;
  colliderSpatialCount = colliders.length;
}

function colliderCandidatesInAabb(minX, maxX, minZ, maxZ) {
  rebuildColliderSpatialIndex();
  const minIx = Math.floor(minX / COLLIDER_BUCKET_SIZE);
  const maxIx = Math.floor(maxX / COLLIDER_BUCKET_SIZE);
  const minIz = Math.floor(minZ / COLLIDER_BUCKET_SIZE);
  const maxIz = Math.floor(maxZ / COLLIDER_BUCKET_SIZE);
  const result = [];
  const seen = new Set();
  for (let ix = minIx; ix <= maxIx; ix += 1) {
    for (let iz = minIz; iz <= maxIz; iz += 1) {
      const bucket = colliderSpatialBuckets.get(colliderBucketKey(ix, iz));
      if (!bucket) continue;
      for (const collider of bucket) {
        if (seen.has(collider)) continue;
        seen.add(collider);
        result.push(collider);
      }
    }
  }
  return result;
}

function canMoveTo(x, z) {
  if (!isInsidePlayableBounds(x, z)) return false;
  const candidates = colliderCandidatesInAabb(x - 0.32, x + 0.32, z - 0.32, z + 0.32);
  return !candidates.some((collider) =>
    Math.abs(x - collider.x) < collider.hw + 0.26 && Math.abs(z - collider.z) < collider.hz + 0.26);
}

function canEnemyMoveTo(x, z, padding = 0.16) {
  if (!isInsidePlayableBounds(x, z)) return false;
  const candidates = colliderCandidatesInAabb(x - padding - 0.08, x + padding + 0.08, z - padding - 0.08, z + padding + 0.08);
  return !candidates.some((collider) => {
    const effectivePadding = collider.kind === 'furniture' ? padding * 0.35 : padding;
    return Math.abs(x - collider.x) < collider.hw + effectivePadding
      && Math.abs(z - collider.z) < collider.hz + effectivePadding;
  });
}

function canEnemyMoveIgnoringFurniture(x, z, padding = 0.16) {
  if (!isInsidePlayableBounds(x, z)) return false;
  const candidates = colliderCandidatesInAabb(x - padding - 0.08, x + padding + 0.08, z - padding - 0.08, z + padding + 0.08);
  return !candidates.some((collider) =>
    collider.wall
    && Math.abs(x - collider.x) < collider.hw + padding
    && Math.abs(z - collider.z) < collider.hz + padding);
}

function hasWallBetweenPoints(fromX, fromZ, toX, toZ, padding = 0.06) {
  const distance = Math.hypot(toX - fromX, toZ - fromZ);
  if (distance < 0.001) return false;
  const dx = (toX - fromX) / distance;
  const dz = (toZ - fromZ) / distance;
  const minX = Math.min(fromX, toX) - 0.25;
  const maxX = Math.max(fromX, toX) + 0.25;
  const minZ = Math.min(fromZ, toZ) - 0.25;
  const maxZ = Math.max(fromZ, toZ) + 0.25;
  return colliderCandidatesInAabb(minX, maxX, minZ, maxZ)
    .some((collider) => collider.wall && rayColliderEntry(fromX, fromZ, dx, dz, collider, distance, padding) < distance);
}

function canEnemyFurnitureHopTo(x, z, maxDistance = 1.65) {
  const distance = Math.hypot(x - enemy.position.x, z - enemy.position.z);
  return distance <= maxDistance
    && canEnemyMoveIgnoringFurniture(x, z, 0.18)
    && !hasWallBetweenPoints(enemy.position.x, enemy.position.z, x, z, 0.08);
}

function hasLineOfSight(from, to) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  if (distance < 0.001) return true;
  const dx = (to.x - from.x) / distance;
  const dz = (to.z - from.z) / distance;
  const minX = Math.min(from.x, to.x) - 0.25;
  const maxX = Math.max(from.x, to.x) + 0.25;
  const minZ = Math.min(from.z, to.z) - 0.25;
  const maxZ = Math.max(from.z, to.z) + 0.25;
  const candidates = colliderCandidatesInAabb(minX, maxX, minZ, maxZ);
  for (const collider of candidates) {
    if (collider.x + collider.hw < minX || collider.x - collider.hw > maxX
      || collider.z + collider.hz < minZ || collider.z - collider.hz > maxZ) continue;
    if (rayColliderEntry(from.x, from.z, dx, dz, collider, distance, 0.04) < distance) return false;
  }
  return true;
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function faceEnemyToPlayer() {
  enemy.rotation.y = Math.atan2(camera.position.x - enemy.position.x, camera.position.z - enemy.position.z);
}

function detectionFloor() {
  return Math.min(50, state.keyCount * KEY_DETECTION_FLOOR_STEP);
}

function setDetection(value) {
  state.detection = THREE.MathUtils.clamp(value, detectionFloor(), 100);
}

function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2100);
}

function applyBreakerVisual(on) {
  const applySet = (panel, switchMesh, light) => {
    if (!panel || !switchMesh || !light) return;
    light.color.set(on ? 0x7dffad : 0xff2d1e);
    light.intensity = on ? 2.6 : 1.25;
    panel.material.color.set(on ? 0x26332c : 0x4d120d);
    panel.material.emissive = new THREE.Color(on ? 0x07170d : 0x4b0705);
    panel.material.emissiveIntensity = on ? 0.18 : 0.62;
    switchMesh.material.color.set(on ? 0x7dffad : 0xff2d1e);
    switchMesh.material.emissive = new THREE.Color(on ? 0x1b7a3f : 0x8f120b);
    switchMesh.material.emissiveIntensity = on ? 0.75 : 1.05;
  };
  applySet(breakerPanel, breakerSwitch, breakerLight);
  applySet(mansionBreakerPanel, mansionBreakerSwitch, mansionBreakerLight);
}

function setBreaker(on, notify = true) {
  state.breakerOn = on;
  state.breakerOutAt = on ? clock.elapsedTime + 180 * state.breakerDurationMultiplier : Infinity;
  applyBreakerVisual(on);
  if (!notify) return;
  if (!on) showToast('ブレーカーをOFFにした');
}
applyBreakerVisual(false);

const breakerGame = {
  sequence: [],
  inputIndex: 0,
  showing: false,
};

function setBreakerGameMessage(text) {
  const message = $('#breaker-game-message');
  if (message) message.textContent = text;
}

function clearBreakerGridClasses() {
  document.querySelectorAll('[data-breaker-cell]').forEach((button) => {
    button.classList.remove('lit', 'correct', 'wrong');
  });
}

function makeBreakerSequence() {
  const cells = Array.from({ length: 9 }, (_, index) => index).sort(() => Math.random() - 0.5);
  return cells.slice(0, 5);
}

async function showBreakerSequence() {
  breakerGame.showing = true;
  clearBreakerGridClasses();
  for (let count = 3; count >= 1; count -= 1) {
    if (!state.breakerGameOpen) return;
    setBreakerGameMessage(`${count}秒後に開始`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!state.breakerGameOpen) return;
  setBreakerGameMessage('光った順番を覚えてください');
  await nextFrame();
  for (const index of breakerGame.sequence) {
    if (!state.breakerGameOpen) return;
    const button = document.querySelector(`[data-breaker-cell="${index}"]`);
    button?.classList.add('lit');
    await new Promise((resolve) => setTimeout(resolve, 310));
    button?.classList.remove('lit');
    await new Promise((resolve) => setTimeout(resolve, 145));
  }
  breakerGame.inputIndex = 0;
  breakerGame.showing = false;
  setBreakerGameMessage('光った順に5回押してください');
}

function openBreakerGame() {
  if (state.breakerOn) {
    setBreaker(false);
    return;
  }
  if (state.breakerMiniGameSkip) {
    setBreaker(true, false);
    showToast('ブレーカーを即時ONにした');
    return;
  }
  state.breakerGameOpen = true;
  breakerGame.sequence = makeBreakerSequence();
  breakerGame.inputIndex = 0;
  $('#breaker-game-screen')?.classList.add('visible');
  if (controls.isLocked) controls.unlock();
  showBreakerSequence();
}

function closeBreakerGame() {
  state.breakerGameOpen = false;
  breakerGame.showing = false;
  $('#breaker-game-screen')?.classList.remove('visible');
  clearBreakerGridClasses();
  if (state.started && !state.ended && !state.caught && !mobileInput.active) lockPointer();
}

function handleBreakerCell(index) {
  if (!state.breakerGameOpen || breakerGame.showing) return;
  const button = document.querySelector(`[data-breaker-cell="${index}"]`);
  const expected = breakerGame.sequence[breakerGame.inputIndex];
  if (index !== expected) {
    button?.classList.add('wrong');
    setBreakerGameMessage('失敗。もう一度順番を表示します');
    breakerGame.inputIndex = 0;
    setTimeout(() => {
      button?.classList.remove('wrong');
      if (state.breakerGameOpen) showBreakerSequence();
    }, 420);
    return;
  }
  button?.classList.add('correct');
  setTimeout(() => button?.classList.remove('correct'), 240);
  breakerGame.inputIndex += 1;
  setBreakerGameMessage(`成功 ${breakerGame.inputIndex} / 5`);
  if (breakerGame.inputIndex >= breakerGame.sequence.length) {
    setBreaker(true, false);
    showToast('ブレーカーをONにした');
    closeBreakerGame();
  }
}

function updateMansionDistanceCulling() {
  if (state.mapMode !== 'mansion') {
    for (const object of mansionRuntimeObjects) {
      if (object) object.visible = false;
    }
    return;
  }
  const radiusSq = MANSION_RENDER_RADIUS * MANSION_RENDER_RADIUS;
  const power = state.breakerOn ? 1 : 0;
  scene.background.set(0x000000);
  scene.fog.density = state.breakerOn ? 0.065 : 0.105;
  hemisphereLight.intensity = THREE.MathUtils.lerp(0.16, 2.4, power);
  ambientLight.intensity = THREE.MathUtils.lerp(0.08, 1.85, power);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(0.86, 1.72, power);
  for (const object of mansionRuntimeObjects) {
    if (!object) continue;
    if (object.userData?.locker) {
      object.visible = true;
      continue;
    }
    const pos = getWorldXZ(object);
    object.visible = ((pos.x - camera.position.x) ** 2 + (pos.z - camera.position.z) ** 2) <= radiusSq;
    if (object.isLight) {
      object.intensity = object === mansionBreakerLight
        ? THREE.MathUtils.lerp(1.25, 2.6, power)
        : THREE.MathUtils.lerp(0.55, 8.5, power);
      object.distance = object === mansionBreakerLight
        ? 3.6
        : THREE.MathUtils.lerp(7, 18, power);
    }
  }
  for (const item of keyItems) {
    if (item.collected) continue;
    const near = item.group.position.distanceToSquared(camera.position) <= radiusSq;
    const close = item.group.position.distanceToSquared(camera.position) < 7 * 7;
    const inView = near && (close || isPointInPlayerView(item.group.position.x, item.group.position.z, MANSION_RENDER_RADIUS, Math.PI / 2.1));
    item.group.visible = inView;
    item.light.visible = inView && item.light.position.distanceToSquared(camera.position) < 18 * 18;
  }
  for (const item of fakeOfudaItems) {
    if (item.collected) continue;
    const near = state.mapMode === 'mansion' && item.group.position.distanceToSquared(camera.position) <= radiusSq;
    const inView = near && isPointInPlayerView(item.group.position.x, item.group.position.z, MANSION_RENDER_RADIUS, Math.PI / 2.1);
    item.group.visible = inView;
    item.light.visible = inView && item.light.position.distanceToSquared(camera.position) < 18 * 18;
  }
}

function updateSchoolDistanceCulling() {
  const visible = state.mapMode === 'school';
  for (let i = schoolRuntimeObjects.length - 1; i >= 0; i -= 1) {
    const object = schoolRuntimeObjects[i];
    if (!object?.parent) {
      schoolRuntimeObjects.splice(i, 1);
      continue;
    }
    object.visible = visible;
  }
}

function updateSchoolLighting(time) {
  if (state.breakerOn && time >= state.breakerOutAt) setBreaker(false);
  if (state.mapMode === 'mansion') return;
  if (time < (updateSchoolLighting.nextAt || 0) && updateSchoolLighting.lastBreakerOn === state.breakerOn) return;
  updateSchoolLighting.nextAt = time + 0.35;
  updateSchoolLighting.lastBreakerOn = state.breakerOn;
  const power = state.breakerOn ? 1 : 0;
  hemisphereLight.intensity = THREE.MathUtils.lerp(0.54, 3.8, power);
  ambientLight.intensity = THREE.MathUtils.lerp(0.38, 3.25, power);
  scene.fog.density = THREE.MathUtils.lerp(0.018, 0.0009, power);
  scene.background.set(power ? 0xc8d4d8 : 0x080b08);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.08, 2.25, power);
  for (const light of schoolLights) {
    if (!light.isLight) continue;
    light.intensity = THREE.MathUtils.lerp(2.2, 22.0, power);
    light.distance = THREE.MathUtils.lerp(8, 22, power);
  }
}

function enterLocker(locker) {
  state.hidden = true;
  state.noise = 0;
  state.currentLocker = locker;
  state.lockerHideAt = clock.elapsedTime;
  state.lockerHideStartDetection = state.detection;
  document.body.classList.add('hidden-in-locker');
  const insideY = locker.insideLocalY ?? 0.12;
  const inside = locker.group.localToWorld(new THREE.Vector3(0, insideY, 0.39));
  const lookTarget = locker.group.localToWorld(new THREE.Vector3(0, insideY, 4));
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
  const outsideY = locker.outsideLocalY ?? 0.43;
  const outside = locker.group.localToWorld(new THREE.Vector3(0, outsideY, 1.05));
  const lookTarget = locker.group.localToWorld(new THREE.Vector3(0, outsideY, 4));
  camera.position.copy(outside);
  camera.lookAt(lookTarget);
  state.hidden = false;
  state.currentLocker = null;
  state.lockerHideAt = -Infinity;
  state.lockerExitGraceUntil = clock.elapsedTime + 1.4;
  setDetection(Math.min(state.detection, 55));
  document.body.classList.remove('hidden-in-locker');
  playLockerSound(false);
  emitPlayerSound(45, 6);
  showToast('ロッカーから出た');
}

function notifyEnemyOfKeyPickup(item) {
  if (!item?.group) return;
  const time = clock.elapsedTime;
  const pickupPosition = item.group.position;
  const x = pickupPosition.x;
  const z = pickupPosition.z;
  if (state.mapMode === 'mansion') {
    if (womanEnemy?.group && time >= womanEnemy.stunnedUntil) {
      setWomanRoutedTarget(x, z, time, false);
      womanEnemy.repathAt = time + 0.45;
      womanEnemy.speed = Math.max(womanEnemy.speed || 0, 3.35);
      womanEnemy.target = womanEnemy.path?.[0] || womanEnemy.target || { x, z };
    }
    setDetection(Math.max(state.detection, 52));
    return;
  }
  const room = schoolRoomAtWorld(x, z);
  const mode = state.detection >= 82 || enemyData.alertMemory > 0.72 ? 'HUNTING' : 'SEARCHING';
  enemyData.lastHeardAt = time;
  enemyData.lastHeardPosition = { x, z, roomId: room?.id || null };
  enemyData.pauseUntil = 0;
  enemyData.lookAroundUntil = 0;
  enemyData.investigateUntil = Math.max(enemyData.investigateUntil, time + 9);
  enemyData.searchUntil = Math.max(enemyData.searchUntil, time + 18);
  enemyData.investigateSpeed = Math.max(enemyData.investigateSpeed, mode === 'HUNTING' ? 6.0 : 4.2);
  enemyData.alertMemory = THREE.MathUtils.clamp(enemyData.alertMemory + 0.16, 0, 1);
  setDetection(Math.max(state.detection, 58));
  setEnemyDestinationToSoundSource(x, z, mode, room?.id || null);
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
    if (state.breakerOn) setBreaker(false);
    else openBreakerGame();
    return;
  }
  if (state.nearShop) {
    openShop();
    return;
  }
  const nearbyFakeOfuda = state.mapMode === 'mansion'
    ? fakeOfudaItems.find((item) => !item.collected && camera.position.distanceTo(item.group.position) < 2.15)
    : null;
  if (nearbyFakeOfuda) {
    triggerFakeOfudaTrap(nearbyFakeOfuda);
    return;
  }
  const nearbyKey = keyItems.find((item) => !item.collected && camera.position.distanceTo(item.group.position) < 2.15);
  if (nearbyKey) {
    nearbyKey.collected = true;
    nearbyKey.group.visible = false;
    nearbyKey.light.visible = false;
    state.keyCount += 1;
    setDetection(Math.max(state.detection, detectionFloor()));
    playItemPickupSound();
    notifyEnemyOfKeyPickup(nearbyKey);
    updateExitCounter();
    if (state.mapMode === 'mansion') {
      $('#objective-text').textContent = state.keyCount >= REQUIRED_KEYS
        ? '屋敷の出口へ向かえ'
        : `お札を集める ${state.keyCount} / ${REQUIRED_KEYS}`;
      showToast(`お札を手に入れた　${state.keyCount} / ${REQUIRED_KEYS}`);
      return;
    }
    $('#objective-text').textContent = state.keyCount >= REQUIRED_KEYS
      ? '出口へ向かう'
      : `鍵を探す ${state.keyCount} / ${REQUIRED_KEYS}`;
    showToast(`鍵を手に入れた　${state.keyCount} / ${REQUIRED_KEYS}`);
    return;
  }
  if (state.mapMode === 'mansion' && mansionExit && horizontalDistance(camera.position, mansionExit) < 3.8) {
    if (state.keyCount >= REQUIRED_KEYS) endGame(true);
    else showToast(`お札が足りない　${state.keyCount} / ${REQUIRED_KEYS}`);
    return;
  }
  if (state.mapMode !== 'mansion' && horizontalDistance(camera.position, exitDoor.position) < 3.6) {
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

function stopMobileGameplayInput() {
  mobileInput.moveX = 0;
  mobileInput.moveY = 0;
  mobileInput.running = false;
  cameraSwipePointer = null;
  const runButton = $('#mobile-run-toggle');
  runButton?.classList.remove('running');
  if (runButton) runButton.textContent = '歩行中';
  $('#mobile-action')?.classList.remove('visible');
  const knob = $('#move-stick i');
  if (knob) knob.style.transform = '';
}

function respawnPlayer() {
  const respawnMode = state.mapMode;
  state.caught = false;
  state.ended = false;
  state.hidden = false;
  state.keyCount = 0;
  state.flashlight = true;
  state.battery = 100;
  state.hp = 100;
  state.nearShop = false;
  state.shopOpen = false;
  state.nextCoinAt = 0;
  const savedUpgrades = loadPersistentShopUpgrades();
  state.shopPurchased = { ...savedUpgrades.purchased };
  state.noiseMultiplier = savedUpgrades.enabled.noise ? 0.5 : 1;
  state.breakerDurationMultiplier = savedUpgrades.enabled.breaker ? 2 : 1;
  state.lightRangeMultiplier = savedUpgrades.enabled.light ? 2 : 1;
  state.ghostStunTimeMultiplier = savedUpgrades.enabled.stun ? 0.5 : 1;
  state.breakerMiniGameSkip = savedUpgrades.enabled.breakerSkip === true;
  state.hasFullMap = savedUpgrades.enabled.map === true;
  state.hasRadar = savedUpgrades.enabled.radar === true;
  syncUnlockUI();
  state.ghostLightSeconds = 0;
    state.ghostStunCount = 0;
    state.nextGhostIllusionAt = Infinity;
    state.ghostIllusionQueue = 0;
  state.fakeOfudaAlertUntil = 0;
  state.screenFlashUntil = 0;
  state.nextHealAt = 0;
  state.detection = 0;
  state.alert = 'UNNOTICED';
  state.moveMode = 'WALKING';
  state.noise = 0;
  state.nearLocker = null;
  state.nearBreaker = false;
  state.floorLevel = respawnMode === 'mansion' ? 2 : 1;
  state.nearShop = false;
  state.currentLocker = null;
  state.lockerHideAt = -Infinity;
  state.lockerHideStartDetection = 0;
  state.breakerOn = false;
  state.breakerOutAt = Infinity;
  setBreaker(false, false);
  state.seatedUntil = 0;
  state.roarUntil = 0;
  state.nextRoarDamageAt = Infinity;
  scheduleNextRoar(clock.elapsedTime);
  state.nextSoundRippleAt = 0;
  state.nextTrapAt = 0;
  state.lockerExitGraceUntil = clock.elapsedTime + 1;
  state.settingsOpen = false;
  state.fullMapOpen = false;
  state.breakerGameOpen = false;
  $('#full-map-screen')?.classList.remove('visible');
  $('#breaker-game-screen')?.classList.remove('visible');
  mobileInput.moveX = mobileInput.moveY = 0;
  mobileInput.running = false;
  $('#mobile-run-toggle').classList.remove('running');
  $('#mobile-run-toggle').textContent = '歩行中';
  document.body.classList.remove('caught-cutscene', 'hidden-in-locker');
  $('#mobile-controls')?.classList.remove('disabled');
  if (respawnMode === 'mansion' && mansionStartPoint) {
    const safeStart = nearestSafeMansionNode(mansionStartPoint.x, mansionStartPoint.z) || mansionStartPoint;
    camera.position.set(safeStart.x, 1.68, safeStart.z);
    camera.rotation.set(0, 0, 0);
  } else {
    camera.position.set(playerStart.x, 1.68, playerStart.z);
    camera.rotation.set(0, 0, 0);
  }
  const womanStart = respawnMode === 'mansion'
    ? [...mansionNodes]
      .filter((node) => Math.hypot(node.x - camera.position.x, node.z - camera.position.z) > 22)
      .sort((a, b) => Math.hypot(b.x - camera.position.x, b.z - camera.position.z) - Math.hypot(a.x - camera.position.x, a.z - camera.position.z))[0]
      || mansionNodes[Math.floor(mansionNodes.length * 0.5)]
      || { x: MANSION_OFFSET_X, z: MANSION_CENTER_Z }
    : mansionNodes[Math.floor(mansionNodes.length * 0.5)] || { x: MANSION_OFFSET_X, z: MANSION_CENTER_Z };
  womanEnemy.group.position.set(womanStart.x, 0, womanStart.z);
  womanEnemy.target = null;
  womanEnemy.nextPhaseAt = clock.elapsedTime + 60;
  womanEnemy.phaseChargeUntil = 0;
  womanEnemy.phaseUntil = 0;
  womanEnemy.stunnedUntil = 0;
  womanEnemy.repathAt = 0;
  womanEnemy.hiddenRedirectAt = 0;
  womanEnemy.emergeStartedAt = 0;
  womanEnemy.emergeUntil = 0;
  ghostEmergeEffect.visible = false;
  womanEnemy.group.rotation.x = 0;
  womanEnemy.group.rotation.z = 0;
  womanEnemy.group.scale.setScalar(1);
  setWomanVisualPose(false);
  ghostDouble.group.visible = false;
  ghostDouble.active = false;
  ghostDouble.spawnAt = respawnMode === 'mansion' ? clock.elapsedTime + 60 : Infinity;
  ghostDouble.despawnAt = 0;
  ghostDouble.target = null;
  for (const illusion of ghostIllusions) {
    illusion.group.visible = false;
    illusion.active = false;
    illusion.despawnAt = 0;
  }
  state.nextEyeScareAt = respawnMode === 'mansion' ? clock.elapsedTime + 30 : Infinity;
  state.eyeScareUntil = 0;
  setWomanPhasingVisual(false);
  placeKeyItemsForMode(respawnMode);
  updateExitCounter();
  $('#objective-text').textContent = `鍵を探す 0 / ${REQUIRED_KEYS}`;
  if (respawnMode === 'mansion') $('#objective-text').textContent = `お札を集める 0 / ${REQUIRED_KEYS}`;
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
    lastSawPlayerAt: -Infinity,
    lastSeenPlayerPosition: null,
    soundSourceTarget: null,
    soundChaseStartedAt: -Infinity,
    pounceUntil: 0,
    pounceStartedAt: 0,
    pounceFrom: null,
    pounceTarget: null,
    wallSoundRepathUntil: 0,
    superSearchUntil: 0,
    stuckSince: 0,
    lastMoveX: enemyStart.x,
    lastMoveZ: enemyStart.z,
    lastTargetDistance: Infinity,
    recentTargetKeys: [],
    recoveryJump: null,
    loopEscapeUntil: 0,
  });
  soundEvents.length = 0;
  sonarReveals.length = 0;
  for (const trap of noiseTraps) { scene.remove(trap.mesh); trap.mesh.geometry.dispose(); }
  noiseTraps.length = 0;
  for (const item of healItems) { scene.remove(item.group); scene.remove(item.light); }
  healItems.length = 0;
  for (const coin of coinItems) { scene.remove(coin.group); scene.remove(coin.light); }
  coinItems.length = 0;
  if (shop) shop.group.visible = respawnMode !== 'mansion';
  if (respawnMode === 'school') {
    spawnHealItem(clock.elapsedTime, true);
    scheduleNextHeal(clock.elapsedTime);
    chooseRandomEnemyRoute();
  }
  scheduleNextCoin(clock.elapsedTime);
  savePersistentCoins();
  updateHUD();
  showToast('意識を取り戻した');
  if (!mobileInput.active) lockPointer();
}

function updateCaughtCutscene(time) {
  const progress = THREE.MathUtils.clamp((time - state.caughtAt) / 1.75, 0, 1);
  const activeEnemy = state.mapMode === 'mansion' ? womanEnemy.group : enemy;
  const enemyFace = activeEnemy.position.clone().add(new THREE.Vector3(0, state.mapMode === 'mansion' ? 1.45 : 1.78, 0));
  const away = camera.position.clone().sub(enemyFace).setY(0).normalize();
  const targetPosition = enemyFace.clone().addScaledVector(away.lengthSq() ? away : new THREE.Vector3(0, 0, 1), 0.52);
  targetPosition.y = 1.58;
  camera.position.lerp(targetPosition, 0.045 + progress * 0.08);
  camera.lookAt(enemyFace);
  $('#danger-flash').style.opacity = String(0.45 + Math.sin(time * 18) * 0.2);
  if (progress >= 1) {
    $('#danger-flash').style.opacity = '0';
    respawnPlayer();
  }
}

function endGame(win) {
  state.ended = true;
  state.allowExit = true;
  state.fullMapOpen = false;
  state.breakerGameOpen = false;
  ghostDouble.group.visible = false;
  ghostDouble.active = false;
  $('#eye-scare')?.classList.remove('visible');
  if (state.mapMode === 'train') {
    Object.values(darumaAudio).forEach((sound) => {
      sound.pause();
      sound.currentTime = 0;
    });
  }
  document.body.classList.remove('eyes-closed', 'train-noise', 'train-mode');
  document.body.classList.remove('ghost-eye-danger', 'ghost-heartbeat', 'train-clear', 'train-gameover-ghost', 'train-gameover-daruma');
  stopMobileGameplayInput();
  if (!win) setBreaker(false, false);
  if (win) playClearSound();
  controls.unlock();
  document.body.classList.remove('hidden-in-locker');
  $('#mobile-controls')?.classList.add('disabled');
  $('#mobile-action')?.classList.remove('visible');
  $('#message-kicker').textContent = win ? '脱出成功' : '見つかった';
  $('#message-title').textContent = win ? '生還' : '捕獲';
  $('#message-body').textContent = win
    ? '背後で、まだ何かが扉を叩いている。'
    : '速すぎた。うるさすぎた。もう一度、静かに。';
  $('#message-screen').classList.add('visible');
  $('#full-map-screen')?.classList.remove('visible');
  $('#breaker-game-screen')?.classList.remove('visible');
}

function clearMovementInput() {
  Object.keys(keys).forEach((key) => { keys[key] = false; });
  mobileInput.moveX = 0;
  mobileInput.moveY = 0;
  mobileInput.running = false;
  state.noise = 0;
  const runButton = $('#mobile-run-toggle');
  runButton?.classList.remove('running');
  if (runButton) runButton.textContent = '歩行中';
  const knob = $('#move-stick i');
  if (knob) knob.style.transform = '';
}

function openSettings() {
  if (state.settingsOpen) return;
  clearMovementInput();
  state.settingsOpen = true;
  $('#settings-screen').classList.add('visible');
  $('#settings-close').textContent = state.started ? 'ゲームに戻る' : '閉じる';
  $('#settings-quit').disabled = !state.started;
  if (controls.isLocked) controls.unlock();
}

function closeSettings() {
  if (!state.settingsOpen) return;
  clearMovementInput();
  state.settingsOpen = false;
  $('#settings-screen').classList.remove('visible');
  resumeGameplayPointerLock();
}

function lockPointer(force = false) {
  if (mobileInput.active || controls.isLocked) return;
  const now = performance.now();
  if (!force && now - lastPointerLockAttemptAt < 220) return;
  lastPointerLockAttemptAt = now;
  ignoreMouseMoveUntil = now + 240;
  try {
    // Use standard pointer lock for reliability. `unadjustedMovement:true` can fail
    // asynchronously on some browsers and leave the OS cursor active over the game.
    controls.lock(false);
  } catch {
    controls.lock(false);
  }
}

function setLoading(visible, detail = 'マップを準備しています...') {
  state.loading = visible;
  const loading = $('#loading-screen');
  const detailNode = $('#loading-detail');
  if (detailNode) detailNode.textContent = detail;
  loading?.classList.toggle('visible', visible);
}

function canResumePointerLock() {
  return !mobileInput.active
    && state.started
    && !state.loading
    && !state.ended
    && !state.caught
    && !state.settingsOpen
    && !state.shopOpen
    && !state.fullMapOpen
    && !state.breakerGameOpen;
}

function resumeGameplayPointerLock() {
  clearMovementInput();
  if (!canResumePointerLock()) return;
  try {
    renderer.domElement.focus({ preventScroll: true });
  } catch {
    renderer.domElement.focus();
  }
  lockPointer(true);
  requestAnimationFrame(() => {
    if (!controls.isLocked && canResumePointerLock()) lockPointer(true);
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
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
document.addEventListener('mousemove', (event) => {
  if (!controls.isLocked) return;
  const now = performance.now();
  const moveX = Math.abs(event.movementX || 0);
  const moveY = Math.abs(event.movementY || 0);
  if (now < ignoreMouseMoveUntil || moveX > MAX_POINTER_MOVEMENT || moveY > MAX_POINTER_MOVEMENT) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, { capture: true, passive: false });
controls.addEventListener('lock', () => {
  ignoreMouseMoveUntil = performance.now() + 180;
});
controls.addEventListener('unlock', () => {
  clearMovementInput();
  if (
    state.started
    && !state.ended
    && !state.caught
    && !state.loading
    && !state.settingsOpen
    && !state.shopOpen
    && !state.fullMapOpen
    && !state.breakerGameOpen
    && document.hasFocus()
  ) {
    suppressEscapeUntil = performance.now() + 350;
    openSettings();
  }
});

const darumaSyllables = [
  { char: 'だ', src: './audio/daruma_da1.mp3', slow: false },
  { char: 'る', src: './audio/daruma_ru.mp3', slow: false },
  { char: 'ま', src: './audio/daruma_ma.mp3', slow: false },
  { char: 'さ', src: './audio/daruma_sa.mp3', slow: false },
  { char: 'ん', src: './audio/daruma_n1.mp3', slow: false },
  { char: 'が', src: './audio/daruma_ga.mp3', slow: false },
  { char: 'こ', src: './audio/daruma_ko.mp3', slow: true },
  { char: 'ろ', src: './audio/daruma_ro.mp3', slow: true },
  { char: 'ん', src: './audio/daruma_n2.mp3', slow: true },
];
const darumaFinalSounds = ['./audio/daruma_da2.mp3', './audio/daruma_da3.mp3'];
const darumaAudio = [...darumaSyllables.map((item) => item.src), ...darumaFinalSounds].reduce((acc, src) => {
  const element = new Audio(src);
  element.preload = 'auto';
  element.volume = Math.min(1, Math.max(0, seVolume / 100));
  acc[src] = element;
  return acc;
}, {});

function addTrainObject(object) {
  trainRuntimeObjects.push(object);
  scene.add(object);
  return object;
}

function clearTrainRuntime() {
  for (const object of trainRuntimeObjects) removeSceneObject(object);
  trainRuntimeObjects.length = 0;
  darumaState.monster = null;
  darumaState.ghost = null;
}

function trainCarStartZ(game = darumaState.game) {
  return TRAIN_START_Z - (game - 1) * TRAIN_CAR_LENGTH;
}

function trainDarumaZ(game = darumaState.game) {
  return trainCarStartZ(game) - TRAIN_CAR_LENGTH + 1.65;
}

function setDarumaFacingPlayer(facingPlayer) {
  if (!darumaState.monster) return;
  darumaState.monster.rotation.y = facingPlayer ? 0 : Math.PI;
}

function makeDarumaMonster() {
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grd = ctx.createRadialGradient(210, 150, 10, 250, 280, 360);
  grd.addColorStop(0, '#c9261e');
  grd.addColorStop(0.48, '#8a0808');
  grd.addColorStop(1, '#260203');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i += 1) {
    ctx.strokeStyle = Math.random() < 0.72 ? 'rgba(255,130,72,.12)' : 'rgba(20,0,0,.28)';
    ctx.lineWidth = 0.6 + Math.random() * 2.4;
    const x = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, Math.random() * 512);
    ctx.bezierCurveTo(x + Math.random() * 80 - 40, 160, x + Math.random() * 140 - 70, 330, x + Math.random() * 90 - 45, 512);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(18,0,0,.32)';
  for (let i = 0; i < 22; i += 1) {
    ctx.beginPath();
    ctx.ellipse(256 + (Math.random() - 0.5) * 330, 120 + Math.random() * 300, 22 + Math.random() * 60, 5 + Math.random() * 15, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const darumaTex = new THREE.CanvasTexture(canvas);
  darumaTex.colorSpace = THREE.SRGBColorSpace;
  const redMat = new THREE.MeshStandardMaterial({
    color: 0x9b0b08,
    roughness: 0.52,
    metalness: 0.02,
    map: darumaTex,
    emissive: 0x250000,
    emissiveIntensity: 0.16,
  });
  const faceMat = new THREE.MeshStandardMaterial({ color: 0xe0c1a1, roughness: 0.72, metalness: 0.0 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x070000, roughness: 0.46, metalness: 0.05 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xa57a20, roughness: 0.5, metalness: 0.35, emissive: 0x2c1500, emissiveIntensity: 0.18 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.32, 48, 36), redMat);
  body.scale.set(1.08, 1.26, 0.96);
  body.position.y = 1.22;
  group.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.82, 36, 18), faceMat);
  belly.scale.set(0.92, 0.68, 0.12);
  belly.position.set(0, 0.98, 1.08);
  group.add(belly);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.92, 40, 22), faceMat);
  face.scale.set(1.08, 0.72, 0.16);
  face.position.set(0, 1.69, 1.02);
  group.add(face);
  for (const sx of [-0.33, 0.33]) {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.24, 28, 16), new THREE.MeshStandardMaterial({ color: 0xf4ead9, roughness: 0.3 }));
    eyeWhite.scale.set(1, 0.92, 0.2);
    eyeWhite.position.set(sx, 1.78, 1.16);
    group.add(eyeWhite);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), blackMat);
    eye.scale.set(1, 1, 0.22);
    eye.position.set(sx, 1.78, 1.31);
    group.add(eye);
  }
  for (const sx of [-1.18, 1.18]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.56, 8, 14), redMat);
    arm.position.set(sx, 1.1, 0.12);
    arm.rotation.z = sx < 0 ? -0.38 : 0.38;
    group.add(arm);
  }
  const base = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.09, 12, 56), goldMat);
  base.position.y = 0.22;
  base.rotation.x = Math.PI / 2;
  group.add(base);
  const top = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.055, 10, 40), goldMat);
  top.position.y = 2.46;
  top.rotation.x = Math.PI / 2;
  group.add(top);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, 1.1, 0.2);
  group.add(spotTarget);
  const spot = new THREE.SpotLight(0xffe2b0, 3.6, 11, Math.PI / 5.6, 0.45, 1.4);
  spot.position.set(0, 4.0, 1.1);
  spot.target = spotTarget;
  group.add(spot);
  group.position.set(TRAIN_OFFSET_X, 0, trainDarumaZ(1));
  group.rotation.y = Math.PI;
  addTrainObject(group);
  return group;
}

function makeTrainGhost() {
  const group = new THREE.Group();
  const ghostMaterial = clothWhiteMat.clone();
  ghostMaterial.transparent = true;
  ghostMaterial.opacity = 0.64;
  const dress = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.62, 6, 12), ghostMaterial);
  dress.position.y = 1.03;
  dress.scale.set(0.78, 1.12, 0.5);
  dress.userData.trainGhostFallback = true;
  group.add(dress);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 9), new THREE.MeshStandardMaterial({ color: 0xc7b8aa, roughness: 0.9, transparent: true, opacity: 0.92 }));
  head.position.y = 2.12;
  head.userData.trainGhostFallback = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.88), hairMat.clone());
  hair.position.set(0, 2.06, 0.02);
  hair.scale.set(0.86, 1.32, 0.72);
  hair.userData.trainGhostFallback = true;
  group.add(hair);
  for (let i = 0; i < 7; i += 1) {
    const rag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62 + Math.random() * 0.42, 0.024), ghostMaterial);
    rag.position.set(-0.25 + i * 0.085, 0.23 + Math.random() * 0.08, 0.17 + (Math.random() - 0.5) * 0.1);
    rag.rotation.z = (Math.random() - 0.5) * 0.3;
    rag.userData.trainGhostFallback = true;
    group.add(rag);
  }
  for (let i = 0; i < 10; i += 1) {
    const strand = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.35 + Math.random() * 0.65, 0.018), hairMat.clone());
    const angle = -0.92 + (i / 9) * 1.84;
    strand.position.set(Math.sin(angle) * 0.2, 1.46 - Math.random() * 0.18, 0.2 + Math.cos(angle) * 0.08);
    strand.rotation.z = -angle * 0.13;
    strand.rotation.x = 0.1 + Math.random() * 0.12;
    strand.userData.trainGhostFallback = true;
    group.add(strand);
  }
  const faceShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.38), new THREE.MeshBasicMaterial({ color: 0x020101, transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
  faceShadow.position.set(0, 2.1, 0.218);
  faceShadow.userData.trainGhostFallback = true;
  group.add(faceShadow);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.92, 4, 6), ghostMaterial);
    arm.position.set(side * 0.34, 1.18, 0.04);
    arm.rotation.z = side * 0.28;
    arm.userData.trainGhostFallback = true;
    group.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xb8aa9d, roughness: 0.92, transparent: true, opacity: 0.9 }));
    hand.position.set(side * 0.48, 0.68, 0.1);
    hand.userData.trainGhostFallback = true;
    group.add(hand);
  }
  for (const sx of [-0.12, 0.12]) {
    const eye = new THREE.PointLight(0xff1212, 3.2, 4, 1.8);
    eye.position.set(sx, 2.12, 0.25);
    eye.userData.trainGhostFallback = true;
    group.add(eye);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff1111 }));
    dot.position.copy(eye.position);
    dot.userData.trainGhostFallback = true;
    group.add(dot);
  }
  const eyeTexture = textureLoader.load('./images/eye_scare.png');
  eyeTexture.colorSpace = THREE.SRGBColorSpace;
  const eyePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.85, 1.12),
    new THREE.MeshBasicMaterial({
      map: eyeTexture,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  eyePlane.position.set(0, 1.65, 0.28);
  eyePlane.userData.trainGhostImageFallback = true;
  group.add(eyePlane);
  group.traverse((child) => {
    if (child.userData.trainGhostFallback) child.visible = false;
  });
  const loader = new GLTFLoader();
  loader.load('./models/yurei_woman_v1.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'TRAIN_YUREI_WOMAN_GLB';
    model.scale.setScalar(0.62);
    model.rotation.set(WOMAN_MODEL_UPRIGHT_X, WOMAN_MODEL_FORWARD_YAW, 0);
    model.position.set(0, -0.02, 0);
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const matItem of materials) {
        matItem.transparent = true;
        matItem.opacity = Math.min(matItem.opacity ?? 1, 0.92);
        if ('roughness' in matItem) matItem.roughness = Math.max(matItem.roughness, 0.74);
        if ('metalness' in matItem) matItem.metalness = 0;
      }
    });
    group.traverse((child) => {
      if (child.userData.trainGhostFallback || child.userData.trainGhostImageFallback) child.visible = false;
    });
    group.add(model);
  }, undefined, () => {
    group.traverse((child) => {
      if (child.userData.trainGhostFallback) child.visible = false;
      if (child.userData.trainGhostImageFallback) child.visible = true;
    });
  });
  group.scale.setScalar(1.14);
  group.visible = false;
  addTrainObject(group);
  return group;
}

function buildTrainMap() {
  clearTrainRuntime();
  const floor = new THREE.MeshStandardMaterial({ color: 0x272b2d, roughness: 0.76, metalness: 0.12 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x5d6366, roughness: 0.82, metalness: 0.08 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x253d59, roughness: 0.7, metalness: 0.05 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x111517, roughness: 0.65, metalness: 0.25 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x071012, roughness: 0.38, metalness: 0.18, emissive: 0x061d28, emissiveIntensity: 0.35 });
  const adMat = new THREE.MeshStandardMaterial({ color: 0xd8d4be, roughness: 0.7, metalness: 0.0 });
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x5e3d27, roughness: 0.82, metalness: 0.02 });
  const totalLength = TRAIN_CAR_COUNT * TRAIN_CAR_LENGTH;
  const centerZ = TRAIN_START_Z - totalLength / 2;
  const box = (x, y, z, w, h, d, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    addTrainObject(mesh);
    return mesh;
  };
  box(TRAIN_OFFSET_X, -0.08, centerZ, TRAIN_WIDTH, 0.16, totalLength + 1.2, floor);
  box(TRAIN_OFFSET_X, 3.05, centerZ, TRAIN_WIDTH, 0.16, totalLength + 1.2, wall);
  box(TRAIN_OFFSET_X - TRAIN_WIDTH / 2, 1.55, centerZ, 0.16, 3.1, totalLength + 1.2, wall);
  box(TRAIN_OFFSET_X + TRAIN_WIDTH / 2, 1.55, centerZ, 0.16, 3.1, totalLength + 1.2, wall);
  box(TRAIN_OFFSET_X, 1.55, TRAIN_START_Z + 0.56, TRAIN_WIDTH, 3.1, 0.16, wall);
  for (let i = 0; i < TRAIN_CAR_COUNT; i += 1) {
    const carCenterZ = TRAIN_START_Z - i * TRAIN_CAR_LENGTH - TRAIN_CAR_LENGTH / 2;
    const segmentOffsets = [-TRAIN_CAR_LENGTH * 0.31, -TRAIN_CAR_LENGTH * 0.08, TRAIN_CAR_LENGTH * 0.18, TRAIN_CAR_LENGTH * 0.37];
    for (const [side, x] of [['L', TRAIN_OFFSET_X - 1.45], ['R', TRAIN_OFFSET_X + 1.45]]) {
      for (let s = 0; s < segmentOffsets.length; s += 1) {
        if ((i + s + (side === 'L' ? 0 : 1)) % 5 === 0) continue;
        const z = carCenterZ + segmentOffsets[s];
        box(x, 0.5, z, 0.74, 0.34, 2.7, seat);
        box(x + (side === 'L' ? -0.24 : 0.24), 0.93, z, 0.12, 0.82, 2.7, seat);
        if ((i + s) % 4 === 1) box(x, 0.9, z + 0.52, 0.38, 0.25, 0.5, bagMat);
      }
    }
    box(TRAIN_OFFSET_X - 1.9, 1.72, carCenterZ, 0.04, 0.5, TRAIN_CAR_LENGTH - 2.8, windowMat);
    box(TRAIN_OFFSET_X + 1.9, 1.72, carCenterZ, 0.04, 0.5, TRAIN_CAR_LENGTH - 2.8, windowMat);
    box(TRAIN_OFFSET_X - 1.88, 2.38, carCenterZ - TRAIN_CAR_LENGTH * 0.18, 0.045, 0.32, 1.5, adMat);
    box(TRAIN_OFFSET_X + 1.88, 2.38, carCenterZ + TRAIN_CAR_LENGTH * 0.18, 0.045, 0.32, 1.5, adMat);
    box(TRAIN_OFFSET_X, 2.22, carCenterZ, 0.08, 0.08, TRAIN_CAR_LENGTH - 2.1, trim);
    for (const dz of [-TRAIN_CAR_LENGTH * 0.28, 0, TRAIN_CAR_LENGTH * 0.28]) {
      box(TRAIN_OFFSET_X - 0.72, 1.42, carCenterZ + dz, 0.055, 2.76, 0.055, trim);
      box(TRAIN_OFFSET_X + 0.72, 1.42, carCenterZ + dz, 0.055, 2.76, 0.055, trim);
    }
    if (i > 0) box(TRAIN_OFFSET_X, 1.55, TRAIN_START_Z - i * TRAIN_CAR_LENGTH, TRAIN_WIDTH, 2.9, 0.08, trim);
    for (const dz of [-TRAIN_CAR_LENGTH * 0.28, 0, TRAIN_CAR_LENGTH * 0.28]) {
      box(TRAIN_OFFSET_X, 2.86, carCenterZ + dz, 1.05, 0.055, 0.32, new THREE.MeshStandardMaterial({ color: 0xdfefff, emissive: 0xaed7ff, emissiveIntensity: 0.9, roughness: 0.28 }));
      const lamp = new THREE.PointLight(0xc9e6ff, 0.62, 6.5, 1.6);
      lamp.position.set(TRAIN_OFFSET_X, 2.68, carCenterZ + dz);
      addTrainObject(lamp);
    }
  }
  darumaState.monster = makeDarumaMonster();
  darumaState.ghost = makeTrainGhost();
}

function setTrainPhrase() {
  const phrase = $('#daruma-phrase');
  if (!phrase) return;
  phrase.innerHTML = '';
  const finalRedActive = Number.isFinite(darumaState.nextRoundAt)
    && darumaState.sequenceIndex > 9
    && clock.elapsedTime < darumaState.nextRoundAt;
  const chars = darumaState.skipRound && finalRedActive
    ? ['だ', 'る', 'ま', 'だ']
    : ['だ', 'る', 'ま', 'さ', 'ん', 'が', 'こ', 'ろ', 'ん', 'だ'];
  chars.forEach((char, index) => {
    const span = document.createElement('span');
    span.textContent = char;
    if (darumaState.skipRound && finalRedActive) span.classList.add('final');
    else if (darumaState.skipRound && index < Math.min(darumaState.sequenceIndex, 3)) span.classList.add('skip-fill');
    else if (index < darumaState.sequenceIndex) span.classList.add('read');
    if (!darumaState.skipRound && index === 9 && finalRedActive) span.classList.add('final');
    phrase.appendChild(span);
  });
  const car = $('#daruma-car');
  if (car) car.textContent = `${Math.min(darumaState.game, 10)} / 10`;
}

function randomDarumaDelay(slow = false, final = false) {
  if (darumaState.hyperSpeedRound) return 0.05;
  if (darumaState.speedRound) return 0.1;
  if (final) return 0.1 + Math.random() * 1.9;
  const t = Math.random();
  return 0.1 + t * 0.9;
}

function playDarumaSound(src, delay) {
  const sound = darumaAudio[src];
  if (!sound) return;
  sound.pause();
  sound.currentTime = 0;
  sound.volume = Math.min(1, Math.max(0, seVolume / 100));
  sound.playbackRate = THREE.MathUtils.clamp(0.72 / Math.max(delay, 0.12), 0.55, 1.85);
  sound.play().catch(() => {});
}

function triggerDarumaFinalDa(time, delay, src) {
  if (!darumaState.eyesClosed) playDarumaSound(src, delay);
  darumaState.sequenceIndex = darumaState.skipRound ? 10 : darumaSyllables.length + 1;
  darumaState.finalDaAt = time;
  darumaState.freezeUntilNext = false;
  darumaState.nextSyllableAt = Infinity;
  darumaState.nextRoundAt = time + delay;
  darumaState.lastX = camera.position.x;
  darumaState.lastZ = camera.position.z;
  darumaState.skipFinalStarted = true;
  setDarumaFacingPlayer(true);
}

function startDarumaRound(time = clock.elapsedTime) {
  darumaState.sequenceIndex = 0;
  darumaState.finalDaAt = -Infinity;
  darumaState.freezeUntilNext = false;
  const patternRoll = Math.random();
  darumaState.skipRound = patternRoll < 0.05;
  darumaState.hyperSpeedRound = !darumaState.skipRound && patternRoll < 0.15;
  darumaState.speedRound = !darumaState.skipRound && !darumaState.hyperSpeedRound && patternRoll < 0.4;
  darumaState.skipFinalStarted = false;
  darumaState.nextSyllableAt = time + 0.12;
  darumaState.nextRoundAt = Infinity;
  darumaState.lastX = camera.position.x;
  darumaState.lastZ = camera.position.z;
  setDarumaFacingPlayer(false);
  setTrainPhrase();
}

function showTrainClearBanner(count) {
  const banner = $('#train-clear-banner');
  if (!banner) return;
  if (count === 10) {
    banner.innerHTML = `10/<span class="danger">11</span> クリア`;
  } else {
    banner.textContent = `${count}/10 クリア`;
  }
  darumaState.clearBannerUntil = clock.elapsedTime + 3;
  document.body.classList.add('train-clear');
}

function resetTrainCarPosition() {
  camera.position.set(TRAIN_OFFSET_X, 1.55, trainCarStartZ(Math.min(darumaState.game, 10)) - 1.0);
  camera.rotation.set(0, 0, 0);
  darumaState.lastX = camera.position.x;
  darumaState.lastZ = camera.position.z;
}

function initTrainStage() {
  buildTrainMap();
  darumaState.active = true;
  darumaState.game = 1;
  darumaState.resetUsed = false;
  darumaState.eyesClosed = false;
  darumaState.ghostActive = false;
  darumaState.ghostUntil = 0;
  darumaState.ghostNextAt = Infinity;
  darumaState.noiseUntil = 0;
  resetTrainCarPosition();
  if (darumaState.monster) darumaState.monster.position.z = trainDarumaZ(1);
  if (darumaState.ghost) darumaState.ghost.visible = false;
  startDarumaRound(clock.elapsedTime + 0.3);
  setTrainPhrase();
}

function endTrainGameOver(kind = 'daruma') {
  if (kind !== 'daruma') {
    Object.values(darumaAudio).forEach((sound) => {
      sound.pause();
      sound.currentTime = 0;
    });
  }
  document.body.classList.remove('eyes-closed', 'train-noise');
  document.body.classList.remove('ghost-eye-danger', 'ghost-heartbeat', 'train-clear', 'train-gameover-ghost', 'train-gameover-daruma');
  darumaState.ghostActive = false;
  darumaState.ghostNextAt = Infinity;
  if (darumaState.ghost) darumaState.ghost.visible = false;
  if (kind === 'ghost') {
    document.body.classList.add('train-gameover-ghost');
    $('#message-kicker').textContent = '\u5e7d\u970a\u306b\u6355\u307e\u3063\u305f';
    $('#message-title').textContent = 'GAME OVER';
    $('#message-body').textContent = '\u76ee\u3092\u9589\u3058\u308b\u306e\u304c\u3001\u5c11\u3057\u9045\u304b\u3063\u305f\u3002';
    state.ended = true;
    state.allowExit = true;
    controls.unlock();
    $('#message-screen').classList.add('visible');
    return;
  }
  document.body.classList.add('train-gameover-daruma');
  $('#message-kicker').textContent = '\u3060\u308b\u307e\u306b\u6355\u307e\u3063\u305f';
  $('#message-title').textContent = 'GAME OVER';
  $('#message-body').textContent = '\u300c\u3060\u300d\u306e\u5f8c\u306b\u3001\u52d5\u3044\u3066\u3057\u307e\u3063\u305f\u3002';
  state.ended = true;
  state.allowExit = true;
  controls.unlock();
  $('#message-screen').classList.add('visible');
}
function restartTrainStageFromGameOver() {
  Object.values(darumaAudio).forEach((sound) => {
    sound.pause();
    sound.currentTime = 0;
  });
  state.ended = false;
  state.caught = false;
  state.hp = 100;
  state.allowExit = false;
  state.fullMapOpen = false;
  state.breakerGameOpen = false;
  state.settingsOpen = false;
  $('#message-screen')?.classList.remove('visible');
  $('#settings-screen')?.classList.remove('visible');
  document.body.classList.add('game-running', 'train-mode');
  document.body.classList.remove('eyes-closed', 'train-noise');
  document.body.classList.remove('ghost-eye-danger', 'ghost-heartbeat', 'train-clear', 'train-gameover-ghost', 'train-gameover-daruma');
  clearMovementInput();
  initTrainStage();
  updateHUD();
  lockPointer(true);
}

function advanceTrainGame() {
  const time = clock.elapsedTime;
  showTrainClearBanner(Math.min(darumaState.game, 10));
  state.hp = Math.min(100, state.hp + 40);
  updateHUD();
  if (darumaState.game === 10 && !darumaState.resetUsed) {
    darumaState.resetUsed = true;
    document.body.classList.add('train-noise');
    darumaState.noiseUntil = time + 3;
    setTimeout(() => document.body.classList.remove('train-noise'), 3000);
    resetTrainCarPosition();
    darumaState.game = 11;
    if (darumaState.monster) darumaState.monster.position.z = trainDarumaZ(10);
    startDarumaRound(time + 3.05);
    return;
  }
  if (darumaState.game >= 11) {
    endGame(true);
    return;
  }
  darumaState.game += 1;
  resetTrainCarPosition();
  if (darumaState.monster) darumaState.monster.position.z = trainDarumaZ(Math.min(darumaState.game, 10));
  startDarumaRound(time + 0.45);
}

function clearSpawnedPickupRuntime() {
  for (const item of healItems) {
    scene.remove(item.group);
    scene.remove(item.light);
  }
  healItems.length = 0;
  for (const coin of coinItems) {
    removeSceneObject(coin.group);
    scene.remove(coin.light);
  }
  coinItems.length = 0;
  for (const trap of noiseTraps) removeSceneObject(trap.mesh);
  noiseTraps.length = 0;
}

function surfaceExistsAt(meshes, x, z) {
  return meshes.some((mesh) => mesh?.parent
    && Math.abs(mesh.position.x - x) < 0.25
    && Math.abs(mesh.position.z - z) < 0.25);
}

function registerSchoolSurface(mesh, surface, key) {
  mesh.userData.mapMode = 'school';
  mesh.userData.mapSurface = surface;
  mesh.userData.gridKey = key;
  if (surface === 'floor') schoolFloorMeshes.push(mesh);
  else schoolCeilingMeshes.push(mesh);
  return mesh;
}

function registerMansionSurface(mesh, surface) {
  mesh.userData.mapMode = 'mansion';
  mesh.userData.mapSurface = surface;
  if (surface === 'floor') mansionFloorMeshes.push(mesh);
  else mansionCeilingMeshes.push(mesh);
  return mesh;
}

function validateMapIntegrity(mode = state.mapMode, repair = false) {
  const errors = [];
  const inspectNode = (mapMode, key, x, z, floorMeshes, ceilingMeshes, makeFloor, makeCeiling) => {
    if (!surfaceExistsAt(floorMeshes, x, z)) {
      errors.push(`${mapMode}:${key}:missing-floor`);
      if (repair) makeFloor();
    }
    if (!surfaceExistsAt(ceilingMeshes, x, z)) {
      errors.push(`${mapMode}:${key}:missing-ceiling`);
      if (repair) makeCeiling();
    }
  };

  if (mode === 'school') {
    for (const [key, node] of navNodes) {
      const room = getRoomAt(node.gx, node.gz);
      inspectNode(
        'school',
        key,
        node.x,
        node.z,
        schoolFloorMeshes,
        schoolCeilingMeshes,
        () => registerSchoolSurface(addBox(node.x, -0.12, node.z, CELL + 0.04, 0.25, CELL + 0.04, room ? classroomFloorMat : floorMat, false, false, false), 'floor', key),
        () => registerSchoolSurface(addBox(node.x, 4.25, node.z, CELL + 0.05, 0.18, CELL + 0.05, ceilingMat, false, false, false), 'ceiling', key),
      );
    }
  }

  if (mode === 'mansion') {
    for (const node of mansionNodes) {
      const key = `${Math.round((node.x - MANSION_OFFSET_X) / CELL)},${Math.round((node.z - MANSION_CENTER_Z) / CELL)}`;
      inspectNode(
        'mansion',
        key,
        node.x,
        node.z,
        mansionFloorMeshes,
        mansionCeilingMeshes,
        () => registerMansionSurface(addBox(node.x, -0.11, node.z, CELL + 0.04, 0.22, CELL + 0.04, mansionFloorMat, false, false, false), 'floor'),
        () => registerMansionSurface(addBox(node.x, 4.15, node.z, CELL + 0.02, 0.18, CELL + 0.02, mansionWallMat, false, false, false), 'ceiling'),
      );
    }
  }

  if (repair && errors.length) {
    const remaining = validateMapIntegrity(mode, false).errors;
    return { ok: remaining.length === 0, repaired: errors.length, errors: remaining };
  }
  return { ok: errors.length === 0, repaired: 0, errors };
}

async function debugWalkAllMapCells(mode = state.mapMode) {
  const originalPosition = camera.position.clone();
  const originalRotation = camera.rotation.clone();
  const nodes = mode === 'mansion'
    ? mansionNodes.map((node) => ({ x: node.x, z: node.z }))
    : [...navNodes.values()].map((node) => ({ x: node.x, z: node.z }));
  const result = validateMapIntegrity(mode, true);
  for (let i = 0; i < nodes.length; i += 1) {
    camera.position.set(nodes[i].x, 1.68, nodes[i].z);
    renderer.render(scene, camera);
    if (i % 16 === 0) await nextFrame();
  }
  camera.position.copy(originalPosition);
  camera.rotation.copy(originalRotation);
  renderer.render(scene, camera);
  return { mode, walked: nodes.length, ...result };
}

window.__debugWalkAllMapCells = debugWalkAllMapCells;
window.__validateMapIntegrity = validateMapIntegrity;

function purgeUnselectedMapRuntime(mode) {
  if (mode === 'train') {
    for (const child of [...scene.children]) {
      if (child.userData?.preserveOnMapCleanup) continue;
      const pos = getWorldXZ(child);
      if (inSchoolBounds(pos.x, pos.z) || inMansionBounds(pos.x, pos.z)) removeSceneObject(child);
    }
    removeArrayItemsByBounds(colliders, (x, z) => inSchoolBounds(x, z) || inMansionBounds(x, z));
    removeArrayItemsByBounds(lockers, (x, z) => inSchoolBounds(x, z) || inMansionBounds(x, z), (locker) => removeSceneObject(locker.group));
    removeArrayItemsByBounds(schoolLights, (x, z) => inSchoolBounds(x, z) || inMansionBounds(x, z), (light) => scene.remove(light));
    schoolRuntimeObjects.length = 0;
    schoolFloorMeshes.length = 0;
    schoolCeilingMeshes.length = 0;
    clearMansionMapRuntime();
    clearSpawnedPickupRuntime();
    soundEvents.length = 0;
    sonarReveals.length = 0;
    if (enemy.parent) enemy.parent.remove(enemy);
    enemy.visible = false;
    womanEnemy.group.visible = false;
    return;
  }
  const removeSchool = mode === 'mansion';
  const shouldRemoveSceneChild = removeSchool
    ? (x, z) => inSchoolBounds(x, z)
    : (x, z) => inMansionBounds(x, z);
  const shouldRemoveRuntimeItem = removeSchool
    ? (x, z) => !inMansionBounds(x, z)
    : (x, z) => inMansionBounds(x, z);

  for (const child of [...scene.children]) {
    if (child.userData?.preserveOnMapCleanup) continue;
    const pos = getWorldXZ(child);
    if (shouldRemoveSceneChild(pos.x, pos.z)) removeSceneObject(child);
  }

  removeArrayItemsByBounds(colliders, shouldRemoveRuntimeItem);
  removeArrayItemsByBounds(lockers, shouldRemoveRuntimeItem, (locker) => removeSceneObject(locker.group));
  removeArrayItemsByBounds(schoolLights, shouldRemoveSceneChild, (light) => scene.remove(light));

  if (removeSchool) {
    schoolRuntimeObjects.length = 0;
    schoolFloorMeshes.length = 0;
    schoolCeilingMeshes.length = 0;
  } else {
    clearMansionMapRuntime();
  }

  clearSpawnedPickupRuntime();
  soundEvents.length = 0;
  sonarReveals.length = 0;

  if (mode === 'mansion') {
    if (enemy.parent) enemy.parent.remove(enemy);
    enemy.visible = false;
    womanEnemy.group.visible = true;
  } else {
    if (!enemy.parent) scene.add(enemy);
    enemy.visible = true;
    womanEnemy.group.visible = false;
  }
}

async function prepareSelectedMapCache(mode) {
  if (mode === 'train') {
    setLoading(true, '電車ステージを準備しています...');
    await nextFrame();
    buildTrainMap();
    selectedMapCache.train = { ready: true, generatedAt: performance.now() };
    await nextFrame();
    return;
  }
  if (mode === 'mansion') {
    setLoading(true, '屋敷マップをランダム生成しています...');
    await nextFrame();
    clearMansionMapRuntime();
    buildMansionSecondFloor();
    selectedMapCache.mansion.ready = true;
    selectedMapCache.mansion.generatedAt = performance.now();
    await nextFrame();
    return;
  }
  const cache = selectedMapCache[mode];
  if (cache?.ready) {
    setLoading(true, mode === 'mansion' ? '屋敷マップのキャッシュを読み込んでいます...' : '学校マップのキャッシュを読み込んでいます...');
    await nextFrame();
    return;
  }
  setLoading(true, mode === 'mansion' ? '屋敷マップをランダム生成しています...' : '学校マップをランダム生成しています...');
  await nextFrame();
  if (mode === 'mansion') buildMansionSecondFloor();
  if (cache) {
    cache.ready = true;
    cache.generatedAt = performance.now();
  }
  await nextFrame();
}

async function startGame(mode = 'school') {
  if (state.loading || state.started) return;
  if (mode === 'school' && schoolFloorMeshes.length === 0) {
    sessionStorage.setItem('pendingMapStart', 'school');
    state.allowExit = true;
    location.reload();
    return;
  }
  tuneInitialResolutionForViewport();
  setLoading(true, mode === 'mansion' ? '屋敷マップを生成しています...' : '学校マップを準備しています...');
  await nextFrame();
  state.mapMode = mode;
  state.floorLevel = mode === 'mansion' ? 2 : 1;
  await prepareSelectedMapCache(mode);
  if (mode === 'train') {
    await nextFrame();
    purgeUnselectedMapRuntime(mode);
    initTrainStage();
    enemy.visible = false;
    womanEnemy.group.visible = false;
    state.hasRadar = false;
    state.hasFullMap = false;
  } else if (mode === 'mansion') {
    await nextFrame();
    purgeUnselectedMapRuntime(mode);
    const integrity = validateMapIntegrity(mode, true);
    document.body.dataset.mapIntegrity = JSON.stringify({ mode, ...integrity });
    if (!integrity.ok) console.error('Map integrity failed after mansion generation', integrity);
    enemy.visible = false;
    womanEnemy.group.visible = true;
  } else {
    loadExternalSonarModel();
    await nextFrame();
    purgeUnselectedMapRuntime(mode);
    const integrity = validateMapIntegrity(mode, true);
    document.body.dataset.mapIntegrity = JSON.stringify({ mode, ...integrity });
    if (!integrity.ok) console.error('Map integrity failed after school generation', integrity);
    enemy.visible = true;
    womanEnemy.group.visible = false;
  }
  setLoading(true, 'アイテムと敵を配置しています...');
  await nextFrame();
  if (mode !== 'train') placeKeyItemsForMode(mode);
  if (mode === 'train') {
    resetTrainCarPosition();
    $('#objective-text').textContent = 'だるまに触れる';
  } else if (mode === 'mansion' && mansionStartPoint) {
    const safeStart = nearestSafeMansionNode(mansionStartPoint.x, mansionStartPoint.z) || mansionStartPoint;
    camera.position.set(safeStart.x, 1.68, safeStart.z);
    camera.rotation.set(0, 0, 0);
    womanEnemy.nextPhaseAt = clock.elapsedTime + 60;
    womanEnemy.phaseChargeUntil = 0;
    womanEnemy.stunnedUntil = 0;
    state.ghostLightSeconds = 0;
  state.ghostStunCount = 0;
  state.nextGhostIllusionAt = Infinity;
  state.ghostIllusionQueue = 0;
    womanEnemy.hiddenRedirectAt = 0;
    womanEnemy.emergeStartedAt = 0;
    womanEnemy.emergeUntil = 0;
    ghostEmergeEffect.visible = false;
    womanEnemy.group.rotation.x = 0;
    womanEnemy.group.rotation.z = 0;
    womanEnemy.group.scale.setScalar(1);
    setWomanVisualPose(false);
    ghostDouble.group.visible = false;
    ghostDouble.active = false;
    ghostDouble.spawnAt = clock.elapsedTime + 60;
    ghostDouble.despawnAt = 0;
    ghostDouble.target = null;
    for (const illusion of ghostIllusions) {
      illusion.group.visible = false;
      illusion.active = false;
      illusion.despawnAt = 0;
    }
    scheduleNextEyeScare(clock.elapsedTime);
    setWomanPhasingVisual(false);
    womanEnemy.target = nearestMansionNode(safeStart.x, safeStart.z, 14);
  } else {
    camera.position.set(playerStart.x, 1.68, playerStart.z);
    camera.rotation.set(0, 0, 0);
  }
  setLoading(true, 'ゲームを開始しています...');
  await nextFrame();
  state.started = true;
  state.fullMapOpen = false;
  state.breakerGameOpen = false;
  initAudio();
  scheduleNextRoar(clock.elapsedTime);
  if (mode === 'school' && healItems.length === 0) {
    spawnHealItem(clock.elapsedTime, true);
    scheduleNextHeal(clock.elapsedTime);
  }
  if (mode !== 'train' && coinItems.length === 0) scheduleNextCoin(clock.elapsedTime);
  document.body.classList.add('game-running');
  document.body.classList.toggle('train-mode', mode === 'train');
  $('#mobile-controls')?.classList.remove('disabled');
  $('#start-screen').classList.remove('visible');
  $('#full-map-screen')?.classList.remove('visible');
  $('#breaker-game-screen')?.classList.remove('visible');
  setLoading(false);
  lockPointer(true);
}

document.querySelectorAll('[data-map-start]').forEach((button) => {
  button.addEventListener('click', () => {
    lockPointer(true);
    startGame(button.dataset.mapStart || 'school');
  });
});
const pendingMapStart = sessionStorage.getItem('pendingMapStart');
if (pendingMapStart) {
  sessionStorage.removeItem('pendingMapStart');
  setTimeout(() => startGame(pendingMapStart), 80);
}
const debugWalkMap = new URLSearchParams(location.search).get('debugWalk');
if (debugWalkMap === 'school' || debugWalkMap === 'mansion') {
  setTimeout(async () => {
    try {
      await startGame(debugWalkMap);
      const result = await debugWalkAllMapCells(debugWalkMap);
      document.body.dataset.debugWalkResult = JSON.stringify(result);
      console.info('debugWalkResult', result);
    } catch (error) {
      document.body.dataset.debugWalkResult = JSON.stringify({ mode: debugWalkMap, ok: false, error: String(error) });
      console.error('debugWalk failed', error);
    }
  }, 120);
}
$('#shop-close')?.addEventListener('click', closeShop);
document.querySelectorAll('[data-shop-buy]').forEach((button) => {
  button.addEventListener('click', () => buyShopItem(button.dataset.shopBuy));
});
$('#breaker-game-close')?.addEventListener('click', closeBreakerGame);
document.querySelectorAll('[data-breaker-cell]').forEach((button) => {
  button.addEventListener('click', () => handleBreakerCell(Number(button.dataset.breakerCell)));
});
$('#restart-button').addEventListener('click', () => {
  if (state.mapMode === 'train') {
    restartTrainStageFromGameOver();
    return;
  }
  state.allowExit = true;
  location.reload();
});
$('#restart-button').addEventListener('pointerup', (event) => {
  if (!mobileInput.active) return;
  event.preventDefault();
  event.stopPropagation();
  if (state.mapMode === 'train') {
    restartTrainStageFromGameOver();
    return;
  }
  state.allowExit = true;
  location.reload();
}, { passive: false });
$('#radar-panel')?.addEventListener('pointerup', (event) => {
  if (!mobileInput.active || !state.started || state.ended || state.caught) return;
  event.preventDefault();
  event.stopPropagation();
  toggleFullMap();
}, { passive: false });
$('#full-map-close')?.addEventListener('click', () => toggleFullMap(false));
$('#full-map-close')?.addEventListener('pointerup', (event) => {
  if (!mobileInput.active) return;
  event.preventDefault();
  event.stopPropagation();
  toggleFullMap(false);
}, { passive: false });
renderer.domElement.addEventListener('click', () => {
  if (!mobileInput.active && state.started && !state.ended && !state.caught && !state.settingsOpen && !state.shopOpen && !state.fullMapOpen && !state.breakerGameOpen && !controls.isLocked) lockPointer();
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (mobileInput.active) return;
  if (!state.started || state.ended || state.caught || state.settingsOpen || state.shopOpen || state.fullMapOpen || state.breakerGameOpen) return;
  if (controls.isLocked) return;
  event.preventDefault();
  lockPointer();
}, { passive: false });
addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && state.shopOpen) {
    event.preventDefault();
    event.stopImmediatePropagation();
    clearMovementInput();
    closeShop();
    return;
  }
  if (state.started && !state.ended && (event.ctrlKey || event.metaKey)) event.preventDefault();
}, { capture: true });
addEventListener('keydown', (event) => {
  if (event.code === 'Digit5') {
    if (state.started && state.mapMode === 'train') {
      event.preventDefault();
      keys.Digit5 = true;
    }
    return;
  }
  if (movementKeyCodes.has(event.code)) {
    event.preventDefault();
    if (state.started && !state.ended && !state.caught && !state.settingsOpen && !state.shopOpen && !state.fullMapOpen && !state.breakerGameOpen && controls.isLocked) {
      keys[event.code] = true;
    }
    return;
  }
  if (event.code === 'KeyM' && state.started && !event.repeat) {
    event.preventDefault();
    if (state.mapMode === 'train') return;
    toggleFullMap();
    return;
  }
  if (event.code === 'Escape' && state.started && !state.ended && !event.repeat) {
    if (performance.now() < suppressEscapeUntil) {
      event.preventDefault();
      return;
    }
    if (state.breakerGameOpen) {
      closeBreakerGame();
      return;
    }
    if (state.fullMapOpen) {
      toggleFullMap(false);
      return;
    }
    if (state.settingsOpen) closeSettings();
    else openSettings();
    return;
  }
  if (state.settingsOpen || state.shopOpen || state.breakerGameOpen || state.fullMapOpen) return;
  if (event.code === 'KeyE' && !event.repeat) interact();
  if (event.code === 'KeyF' && !event.repeat) {
    state.flashlight = !state.flashlight;
    showToast(state.flashlight ? '懐中電灯を点けた' : '懐中電灯を消した');
  }
});
addEventListener('keyup', (event) => {
  if (event.code === 'Digit5') keys.Digit5 = false;
  if (movementKeyCodes.has(event.code)) keys[event.code] = false;
});
addEventListener('mousedown', (event) => {
  if (state.mapMode !== 'train' || !state.started || state.ended || state.caught) return;
  if (event.button !== 2) return;
  event.preventDefault();
  darumaState.eyesClosed = true;
  document.body.classList.add('eyes-closed');
  Object.values(darumaAudio).forEach((sound) => {
    sound.pause();
    sound.currentTime = 0;
  });
}, { passive: false });
addEventListener('mouseup', (event) => {
  if (event.button !== 2) return;
  darumaState.eyesClosed = false;
  document.body.classList.remove('eyes-closed');
}, { passive: false });
const mobileCloseEyesButton = $('#mobile-close-eyes');
mobileCloseEyesButton?.addEventListener('pointerdown', (event) => {
  if (state.mapMode !== 'train' || !state.started || state.ended || state.caught) return;
  event.preventDefault();
  event.stopPropagation();
  darumaState.eyesClosed = true;
  document.body.classList.add('eyes-closed');
  Object.values(darumaAudio).forEach((sound) => {
    sound.pause();
    sound.currentTime = 0;
  });
  try { mobileCloseEyesButton.setPointerCapture(event.pointerId); } catch { /* Ignore capture failure. */ }
}, { passive: false });
const releaseMobileCloseEyes = (event) => {
  if (state.mapMode !== 'train') return;
  event.preventDefault();
  event.stopPropagation();
  darumaState.eyesClosed = false;
  document.body.classList.remove('eyes-closed');
};
mobileCloseEyesButton?.addEventListener('pointerup', releaseMobileCloseEyes, { passive: false });
mobileCloseEyesButton?.addEventListener('pointercancel', releaseMobileCloseEyes, { passive: false });
addEventListener('blur', clearMovementInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearMovementInput();
});
addEventListener('mousemove', (event) => {
  if (!state.hidden || !controls.isLocked) return;
  state.lockerLookOffset = THREE.MathUtils.clamp(
    state.lockerLookOffset - event.movementX * 0.002 * controls.pointerSpeed,
    -Math.PI / 2,
    Math.PI / 2,
  );
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
bindMobileButton('#mobile-map-button', () => {
  toggleFullMap();
});
$('#pc-map-hint')?.addEventListener('click', (event) => {
  event.preventDefault();
  toggleFullMap();
});
function bindMobileActionButton() {
  const element = $('#mobile-action');
  if (!element) return;
  let activePointer = null;
  let triggered = false;
  element.addEventListener('pointerdown', (event) => {
    if (!state.started || state.ended || state.caught) return;
    event.preventDefault();
    event.stopPropagation();
    activePointer = event.pointerId;
    triggered = false;
    try { element.setPointerCapture(activePointer); } catch { /* Pointer capture may not be available. */ }
  }, { passive: false });
  const release = (event) => {
    if (activePointer !== event.pointerId || triggered) return;
    event.preventDefault();
    event.stopPropagation();
    triggered = true;
    activePointer = null;
    try { element.releasePointerCapture(event.pointerId); } catch { /* Already released. */ }
    requestAnimationFrame(() => {
      if (!state.ended && !state.caught) interact();
    });
  };
  element.addEventListener('pointerup', release, { passive: false });
  element.addEventListener('pointercancel', () => {
    activePointer = null;
    triggered = false;
  });
  element.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
}
bindMobileActionButton();

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
const tmpViewVector = new THREE.Vector3();
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
    if (state.mapMode === 'train' && reason === 'train-ghost') {
      endTrainGameOver('ghost');
      return;
    }
    state.ended = true;
    stopMobileGameplayInput();
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

function isPointInPlayerView(x, z, maxDistance = 22, halfAngle = Math.PI / 3.2) {
  tmpViewVector.set(x - camera.position.x, 0, z - camera.position.z);
  const distanceSq = tmpViewVector.lengthSq();
  if (distanceSq > maxDistance * maxDistance || distanceSq < 0.0001) return distanceSq < 0.8;
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  tmpViewVector.normalize();
  return forward.dot(tmpViewVector) >= Math.cos(halfAngle);
}

const trapMat = new THREE.MeshBasicMaterial({ color: 0xf0cc65, transparent: true, opacity: 0.42, depthWrite: false });
const trapTriggeredMat = new THREE.MeshBasicMaterial({ color: 0xff5a42, transparent: true, opacity: 0.62, depthWrite: false });
const waterTrapMat = new THREE.MeshBasicMaterial({ color: 0x5aa7b8, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
const MAX_MANSION_WATER_TRAPS = 10;
const WATER_TRAP_RADIUS = 10;
function scheduleNextTrap(time) {
  state.nextTrapAt = time + 18 + Math.random() * 28;
}

function canPlaceTrapAt(x, z) {
  if (!isSafeSpawnPoint(x, z, 0.64)) return false;
  if (horizontalDistance({ x, z }, camera.position) < 3.5) return false;
  if (state.mapMode === 'mansion') {
    if (mansionExit && horizontalDistance({ x, z }, mansionExit) < 4.0) return false;
    if (mansionBreakerPanel && horizontalDistance({ x, z }, mansionBreakerPanel.position) < 2.0) return false;
  } else {
    if (horizontalDistance({ x, z }, exitDoor.position) < 2.4) return false;
    if (horizontalDistance({ x, z }, breakerPanel.position) < 2.0) return false;
  }
  if (noiseTraps.some((trap) => !trap.triggered && Math.hypot(trap.x - x, trap.z - z) < 5.2)) return false;
  return true;
}

function canPlaceWaterTrapAt(x, z) {
  if (state.mapMode === 'mansion' && !nearestMansionNode(x, z)) return false;
  return !noiseTraps.some((trap) => trap.water
    && Math.hypot(trap.x - x, trap.z - z) < WATER_TRAP_RADIUS + trap.waterRadius + 0.8);
}

function createWaterTrap(x, z, time, duration = 180) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(WATER_TRAP_RADIUS, 32), waterTrapMat.clone());
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.025, z);
  mesh.renderOrder = 3;
  scene.add(mesh);
  noiseTraps.push({ mesh, x, z, createdAt: time, triggered: true, water: true, waterRadius: WATER_TRAP_RADIUS, removeAt: time + duration });
}

function dropNoiseTrap(time) {
  if (state.mapMode === 'mansion') {
    const activeWater = noiseTraps.filter((trap) => trap.water);
    if (activeWater.length >= MAX_MANSION_WATER_TRAPS) {
      const old = activeWater.sort((a, b) => a.createdAt - b.createdAt)[0];
      const index = noiseTraps.indexOf(old);
      if (index >= 0) {
        scene.remove(old.mesh);
        old.mesh.geometry.dispose();
        noiseTraps.splice(index, 1);
      }
    }
    const origin = womanEnemy.group.position;
    const candidates = [nearestMansionNode(origin.x, origin.z), ...mansionNodes]
      .filter(Boolean)
      .filter((node) => Math.hypot(node.x - origin.x, node.z - origin.z) < 18)
      .sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z));
    const node = candidates.find((candidate) => canPlaceWaterTrapAt(candidate.x, candidate.z));
    if (!node) return;
    createWaterTrap(node.x, node.z, time, 180);
    emitWorldSound(node.x, node.z, 70, 16, true);
    return;
  }
  const baseNode = state.mapMode === 'mansion'
    ? nearestMansionNode(womanEnemy.group.position.x, womanEnemy.group.position.z)
    : nearestNode(enemy.position.x, enemy.position.z);
  const sourceNodes = state.mapMode === 'mansion' ? mansionNodes : walkableNodes;
  const origin = state.mapMode === 'mansion' ? womanEnemy.group.position : enemy.position;
  const candidates = [baseNode, ...sourceNodes]
    .filter(Boolean)
    .filter((node) => Math.hypot(node.x - origin.x, node.z - origin.z) < (state.mapMode === 'mansion' ? 18 : 5.6))
    .sort(() => Math.random() - 0.5);
  const node = candidates.find((candidate) => canPlaceTrapAt(candidate.x, candidate.z));
  if (!node) return;
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 6, 24), trapMat.clone());
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(node.x, 0.035, node.z);
  scene.add(mesh);
  noiseTraps.push({ mesh, x: node.x, z: node.z, createdAt: time, triggered: false, water: false, waterRadius: 0, removeAt: time + 160 });
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
    const distanceToTrap = horizontalDistance(camera.position, trap);
    const inView = isPointInPlayerView(trap.x, trap.z, state.mapMode === 'mansion' ? 18 : 16, Math.PI / 2.7);
    if (trap.water && distanceToTrap > 54) {
      trap.mesh.visible = false;
      if (time >= trap.removeAt) {
        scene.remove(trap.mesh);
        trap.mesh.geometry.dispose();
        noiseTraps.splice(i, 1);
      }
      continue;
    }
    trap.mesh.visible = trap.water
      ? state.mapMode === 'mansion' && distanceToTrap < 54
      : state.mapMode === 'mansion' ? distanceToTrap < 24 && inView : state.breakerOn && distanceToTrap < 18 && inView;
    if (trap.mesh.visible) {
      trap.mesh.rotation.z += dt * 0.8;
      trap.mesh.material.opacity = trap.water ? 0.18 + Math.sin(time * 2) * 0.04 : trap.triggered ? 0.38 + Math.sin(time * 9) * 0.12 : 0.32 + Math.sin(time * 3 + i) * 0.08;
    }
    if (!trap.triggered && !state.hidden && inView && distanceToTrap < 1.12) {
      if (state.mapMode === 'mansion') {
        scene.remove(trap.mesh);
        trap.mesh.geometry.dispose();
        noiseTraps.splice(i, 1);
        continue;
      }
      trap.triggered = true;
      trap.water = false;
      trap.waterRadius = 0;
      trap.removeAt = time + 8;
      trap.mesh.material = trapTriggeredMat.clone();
      trap.x = camera.position.x;
      trap.z = camera.position.z;
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const cameraRight = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const directionToTrap = new THREE.Vector3(trap.x - camera.position.x, 0, trap.z - camera.position.z).normalize();
      playTrapSound(0.64, cameraRight.dot(directionToTrap));
      state.seatedUntil = Math.max(state.seatedUntil, time + 5);
      damagePlayer(18, 'trap');
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
  const nurseCandidates = candidates.filter((node) => getRoomAt(node.gx, node.gz)?.id === 'nurse');
  const node = (nurseCandidates.length && Math.random() < 0.72)
    ? nurseCandidates[Math.floor(Math.random() * nurseCandidates.length)]
    : candidates[0];
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
  if (state.mapMode === 'mansion') return;
  if (!state.nextHealAt) scheduleNextHeal(time);
  if (state.started && time >= state.nextHealAt) {
    spawnHealItem(time);
    scheduleNextHeal(time);
  }
  for (let i = healItems.length - 1; i >= 0; i -= 1) {
    const item = healItems[i];
    const distanceSq = item.group.position.distanceToSquared(camera.position);
    const near = distanceSq < 20 * 20;
    const inView = near && isPointInPlayerView(item.x, item.z, 20, Math.PI / 2.4);
    item.group.visible = inView;
    item.light.visible = inView && distanceSq < 14 * 14;
    if (inView) {
      item.group.rotation.y += dt * 1.25;
      item.group.position.y = item.baseY + Math.sin(time * 2.2 + item.phase) * 0.055;
      item.light.position.copy(item.group.position).add(new THREE.Vector3(0, 0.35, 0));
    }
    if (!state.hidden && state.hp < 100 && near && horizontalDistance(camera.position, item) < 1.45) {
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
  state.nextCoinAt = time + 20;
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
  const activeExit = state.mapMode === 'mansion' && mansionExit ? mansionExit : exitDoor.position;
  const activeBreaker = state.mapMode === 'mansion' && mansionBreakerPanel ? mansionBreakerPanel.position : breakerPanel.position;
  const activeShop = state.mapMode === 'mansion' && mansionShop ? mansionShop : shop;
  if (activeExit && horizontalDistance({ x, z }, activeExit) < 2.6) return false;
  if (activeBreaker && horizontalDistance({ x, z }, activeBreaker) < 2.0) return false;
  if (activeShop && horizontalDistance({ x, z }, activeShop) < 3.2) return false;
  if (keyItems.some((item) => !item.collected && horizontalDistance({ x, z }, item.group.position) < 1.7)) return false;
  if (healItems.some((item) => horizontalDistance({ x, z }, item) < 1.7)) return false;
  if (noiseTraps.some((trap) => !trap.triggered && horizontalDistance({ x, z }, trap) < 1.6)) return false;
  if (coinItems.some((coin) => horizontalDistance({ x, z }, coin) < 3.0)) return false;
  return true;
}

function spawnCoin(time) {
  if (coinItems.filter((coin) => !coin.collected).length >= MAX_ACTIVE_COINS) return;
  const sourceNodes = state.mapMode === 'mansion' ? mansionNodes : walkableNodes;
  const candidates = sourceNodes
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
    const distanceSq = coin.group.position.distanceToSquared(camera.position);
    const near = distanceSq < 18 * 18;
    const inView = near && isPointInPlayerView(coin.x, coin.z, 18, Math.PI / 2.4);
    coin.group.visible = inView;
    coin.light.visible = inView && distanceSq < 13 * 13;
    if (inView) {
      coin.group.rotation.y += dt * 2.7;
      coin.group.position.y = coin.baseY + Math.sin(time * 2.8 + coin.phase) * 0.05;
      coin.light.position.copy(coin.group.position).add(new THREE.Vector3(0, 0.28, 0));
    }
    if (!state.hidden && near && horizontalDistance(camera.position, coin) < 1.25) {
      coin.collected = true;
      state.coins += 1;
      savePersistentCoins();
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
  const node = nearestNode(x, z);
  const room = node ? getRoomAt(node.gx, node.gz) : null;
  if (!room) return false;
  const roomCenterPoint = roomCenter(room);
  const doorPoint = worldFromGrid(room.sign.gx, room.sign.gz);
  if (horizontalDistance({ x, z }, doorPoint) < 4.8) return false;
  if (horizontalDistance({ x, z }, roomCenterPoint) > 4.4) return false;
  if (!isSafeSpawnPoint(x, z, 0.86)) return false;
  if (horizontalDistance({ x, z }, camera.position) < 5.5) return false;
  if (horizontalDistance({ x, z }, enemyStart) < 4.5) return false;
  if (horizontalDistance({ x, z }, exitDoor.position) < EXIT_SHOP_CLEARANCE) return false;
  if (horizontalDistance({ x, z }, breakerPanel.position) < IMPORTANT_OBJECT_CLEARANCE) return false;
  if (keyItems.some((item) => horizontalDistance({ x, z }, item.group.position) < IMPORTANT_OBJECT_CLEARANCE)) return false;
  return true;
}

function canPlaceShopHardFallbackAt(x, z) {
  const node = nearestNode(x, z);
  if (!node || !getRoomAt(node.gx, node.gz)) return false;
  if (!pointOnCurrentWalkableMap(x, z, 'school', 2.1)) return false;
  if (horizontalDistance({ x, z }, exitDoor.position) < EXIT_SHOP_CLEARANCE) return false;
  if (horizontalDistance({ x, z }, breakerPanel.position) < IMPORTANT_OBJECT_CLEARANCE) return false;
  if (keyItems.some((item) => horizontalDistance({ x, z }, item.group.position) < IMPORTANT_OBJECT_CLEARANCE)) return false;
  return !lockers.some((locker) => !inMansionBounds(locker.x, locker.z) && Math.hypot(locker.x - x, locker.z - z) < IMPORTANT_OBJECT_CLEARANCE);
}

function shopWallPositionForRoom(room) {
  const center = roomCenter(room);
  const preferWest = room.sign.side === 'east';
  const wallX = preferWest
    ? worldFromGrid(room.gx0, room.gz0).x - CELL / 2 + 0.72
    : worldFromGrid(room.gx1, room.gz1).x + CELL / 2 - 0.72;
  return {
    x: wallX,
    z: center.z,
    yaw: preferWest ? Math.PI / 2 : -Math.PI / 2,
  };
}

function createShop() {
  const candidates = schoolRooms
    .filter((room) => room.id !== 'breaker')
    .map((room) => ({ room, ...shopWallPositionForRoom(room) }))
    .filter((candidate) => canPlaceShopAt(candidate.x, candidate.z))
    .sort(() => Math.random() - 0.5);
  const fallbackCandidates = schoolRooms
    .filter((room) => room.id !== 'breaker')
    .map((room) => ({ room, ...shopWallPositionForRoom(room) }))
    .filter((candidate) => canPlaceShopHardFallbackAt(candidate.x, candidate.z))
    .sort((a, b) => horizontalDistance({ x: b.x, z: b.z }, exitDoor.position) - horizontalDistance({ x: a.x, z: a.z }, exitDoor.position));
  const node = candidates[0] || fallbackCandidates[0];
  if (!node) return;
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
  group.rotation.y = node.yaw || 0;
  scene.add(group);
  shop = { group, x: node.x, z: node.z };
  colliders.push({
    x: shop.x,
    z: shop.z,
    hw: Math.abs(Math.sin(group.rotation.y)) > 0.5 ? 0.34 : 0.72,
    hz: Math.abs(Math.sin(group.rotation.y)) > 0.5 ? 0.72 : 0.34,
  });
}

function setShopMessage(text) {
  const message = $('#shop-message');
  if (message) message.textContent = text;
}

function updateShopButtons() {
  document.querySelectorAll('[data-shop-buy]').forEach((button) => {
    const type = button.dataset.shopBuy;
    const purchased = state.shopPurchased?.[type] === true;
    const active = isShopUpgradeActive(type);
    button.classList.toggle('purchased', purchased);
    button.classList.toggle('inactive', purchased && !active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function openShop() {
  state.shopOpen = true;
  $('#shop-screen')?.classList.add('visible');
  setShopMessage(`所持コイン：${state.coins}`);
  updateShopButtons();
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
  savePersistentCoins();
  updateHUD();
  return true;
}

const SHOP_PRICES = {
  heal: 3,
  noise: 20,
  breaker: 20,
  light: 10,
  stun: 20,
  breakerSkip: 50,
  map: 50,
  radar: 100,
};

function isShopUpgradeActive(type) {
  if (type === 'noise') return state.noiseMultiplier <= 0.5;
  if (type === 'breaker') return state.breakerDurationMultiplier >= 2;
  if (type === 'light') return state.lightRangeMultiplier >= 2;
  if (type === 'stun') return state.ghostStunTimeMultiplier <= 0.5;
  if (type === 'breakerSkip') return state.breakerMiniGameSkip === true;
  if (type === 'map') return state.hasFullMap === true;
  if (type === 'radar') return state.hasRadar === true;
  return false;
}

function setShopUpgradeActive(type, active) {
  if (type === 'noise') state.noiseMultiplier = active ? 0.5 : 1;
  if (type === 'breaker') {
    if (state.breakerOn && Number.isFinite(state.breakerOutAt)) {
      const remaining = Math.max(0, state.breakerOutAt - clock.elapsedTime);
      state.breakerOutAt = clock.elapsedTime + remaining * (active ? 2 : 0.5);
    }
    state.breakerDurationMultiplier = active ? 2 : 1;
  }
  if (type === 'light') state.lightRangeMultiplier = active ? 2 : 1;
  if (type === 'stun') state.ghostStunTimeMultiplier = active ? 0.5 : 1;
  if (type === 'breakerSkip') state.breakerMiniGameSkip = active;
  if (type === 'map') state.hasFullMap = active;
  if (type === 'radar') state.hasRadar = active;
  syncUnlockUI();
  savePersistentShopUpgrades();
  updateShopButtons();
}

function shopUpgradeLabel(type) {
  return {
    noise: 'ノイズ半減',
    breaker: 'ブレーカーON時間2倍',
    light: 'ライト範囲2倍',
    stun: 'ライトスタン時間半減',
    breakerSkip: 'ブレーカーミニゲームスキップ',
    map: '全体マップ',
    radar: 'レーダー',
  }[type] || type;
}

function buyOrToggleShopUpgrade(type) {
  const label = shopUpgradeLabel(type);
  if (state.shopPurchased?.[type]) {
    const nextActive = !isShopUpgradeActive(type);
    setShopUpgradeActive(type, nextActive);
    return setShopMessage(`${label}を${nextActive ? 'ON' : 'OFF'}にした / 所持コイン：${state.coins}`);
  }
  const price = SHOP_PRICES[type];
  if (!spendCoins(price)) return setShopMessage(`コインが足りない（${label}：${price}コイン）`);
  state.shopPurchased[type] = true;
  setShopUpgradeActive(type, true);
  return setShopMessage(`${label}を購入してONにした / 所持コイン：${state.coins}`);
}

function buyShopItem(type) {
  if (['noise', 'breaker', 'light', 'stun', 'breakerSkip', 'map', 'radar'].includes(type)) {
    return buyOrToggleShopUpgrade(type);
  }
  if (type === 'breakerSkip') {
    if (state.breakerMiniGameSkip) return setShopMessage('ブレーカーミニゲームスキップは購入済み');
    if (!spendCoins(SHOP_PRICES.breakerSkip)) return setShopMessage(`コインが足りない（ミニゲームスキップ：${SHOP_PRICES.breakerSkip}コイン）`);
    state.breakerMiniGameSkip = true;
    savePersistentShopUpgrades();
    updateShopButtons();
    return setShopMessage(`ブレーカーON時のミニゲームをスキップ可能 / 所持コイン：${state.coins}`);
  }
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
    savePersistentShopUpgrades();
    updateShopButtons();
    return setShopMessage(`ノイズ音が半分になった / 所持コイン：${state.coins}`);
  }
  if (type === 'breaker') {
    if (state.breakerDurationMultiplier >= 2) return setShopMessage('ブレーカー強化は購入済み');
    if (!spendCoins(SHOP_PRICES.breaker)) return setShopMessage(`コインが足りない（ブレーカー強化：${SHOP_PRICES.breaker}コイン）`);
    state.breakerDurationMultiplier = 2;
    if (state.breakerOn) state.breakerOutAt = clock.elapsedTime + Math.max(0, state.breakerOutAt - clock.elapsedTime) * 2;
    savePersistentShopUpgrades();
    updateShopButtons();
    return setShopMessage(`ブレーカーON時間が2倍になった / 所持コイン：${state.coins}`);
  }
  if (type === 'light') {
    if (state.lightRangeMultiplier >= 2) return setShopMessage('ライト範囲強化は購入済み');
    if (!spendCoins(SHOP_PRICES.light)) return setShopMessage(`コインが足りない（ライト範囲2倍：${SHOP_PRICES.light}コイン）`);
    state.lightRangeMultiplier = 2;
    savePersistentShopUpgrades();
    updateShopButtons();
    return setShopMessage(`ライト範囲が2倍になった / 所持コイン：${state.coins}`);
  }
  if (type === 'stun') {
    if (state.ghostStunTimeMultiplier <= 0.5) return setShopMessage('ライトスタン短縮は購入済み');
    if (!spendCoins(SHOP_PRICES.stun)) return setShopMessage(`コインが足りない（ライトスタン短縮：${SHOP_PRICES.stun}コイン）`);
    state.ghostStunTimeMultiplier = 0.5;
    savePersistentShopUpgrades();
    updateShopButtons();
    return setShopMessage(`ライトスタンまでの時間が半分になった / 所持コイン：${state.coins}`);
  }
}

createShop();

function scheduleNextRoar(time) {
  state.nextRoarAt = time + 60 + Math.random() * 120;
}

function triggerSonarRoar(time) {
  state.roarUntil = time + 3;
  state.nextRoarDamageAt = time;
  state.shakeUntil = Math.max(state.shakeUntil, time + 3);
  state.shakePower = Math.max(state.shakePower, 1.35);
  scheduleNextRoar(time);
  playSonarRoar(0.72);
  const distance = Math.hypot(enemy.position.x - camera.position.x, enemy.position.z - camera.position.z);
  const runningDetectionRange = 22;
  enemyData.pauseUntil = Math.max(enemyData.pauseUntil, state.roarUntil);
  enemyData.lookAroundUntil = Math.max(enemyData.lookAroundUntil, time + 0.65);
  enemyData.isMoving = false;
  enemyData.globalStuckSince = 0;
  enemyData.globalStuckAnchorX = enemy.position.x;
  enemyData.globalStuckAnchorZ = enemy.position.z;
  if (!state.hidden && distance <= 30) {
    damagePlayer(20, 'roar');
  }
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
  if (state.mapMode !== 'school') return;
  if (!state.nextRoarAt) scheduleNextRoar(time);
  if (time >= state.nextRoarAt) triggerSonarRoar(time);
  if (time < state.roarUntil) {
    const elapsed = Math.min(0.2, Math.max(0, time - (state.nextRoarDamageAt || time)));
    const distance = Math.hypot(enemy.position.x - camera.position.x, enemy.position.z - camera.position.z);
    if (elapsed > 0 && !state.hidden && distance <= 30) damagePlayer(elapsed * 10, 'roar');
    state.nextRoarDamageAt = time;
  } else {
    state.nextRoarDamageAt = time;
  }
}

function updateDarumaStage(dt, time) {
  if (state.mapMode !== 'train' || !darumaState.active || state.ended || state.caught) return;
  darumaState.invincible = Boolean(keys.Digit5);
  if (darumaState.invincible) {
    state.hp = 100;
    document.body.classList.remove('ghost-eye-danger', 'ghost-heartbeat');
    if (darumaState.ghostActive) {
      darumaState.ghostActive = false;
      darumaState.ghostNextAt = time + 10 + Math.random() * 20;
      if (darumaState.ghost) darumaState.ghost.visible = false;
    }
    updateHUD();
    return;
  }
  if (time >= darumaState.noiseUntil) document.body.classList.remove('train-noise');
  if (time >= darumaState.clearBannerUntil) document.body.classList.remove('train-clear');
  if (darumaState.nextRoundAt !== Infinity && time >= darumaState.nextRoundAt) startDarumaRound(time);
  if (time >= darumaState.nextSyllableAt && darumaState.nextRoundAt === Infinity) {
    if (darumaState.skipRound && darumaState.sequenceIndex >= 3 && !darumaState.skipFinalStarted) {
      const delay = randomDarumaDelay(false, true);
      triggerDarumaFinalDa(time, delay, './audio/daruma_da2.mp3');
    } else if (darumaState.sequenceIndex < darumaSyllables.length) {
      const syllable = darumaSyllables[darumaState.sequenceIndex];
      const finalIsNext = darumaState.sequenceIndex === darumaSyllables.length - 1;
      const delay = finalIsNext ? randomDarumaDelay(true, true) : randomDarumaDelay(syllable.slow, false);
      if (!darumaState.eyesClosed) playDarumaSound(syllable.src, delay);
      darumaState.sequenceIndex += 1;
      darumaState.nextSyllableAt = time + delay;
    } else if (darumaState.sequenceIndex === darumaSyllables.length) {
      const delay = 3 + Math.random() * 3;
      const src = darumaFinalSounds[Math.floor(Math.random() * darumaFinalSounds.length)];
      triggerDarumaFinalDa(time, delay, src);
    }
    setTrainPhrase();
  }
  darumaState.freezeUntilNext = Number.isFinite(darumaState.nextRoundAt)
    && time >= darumaState.finalDaAt + 0.4
    && time < darumaState.nextRoundAt;
  if (time - darumaState.finalDaAt >= 2) setTrainPhrase();

  if (darumaState.game >= 4 && darumaState.nextRoundAt === Infinity && darumaState.sequenceIndex > 0 && !darumaState.ghostActive) {
    if (darumaState.ghostNextAt === Infinity) darumaState.ghostNextAt = time + 10 + Math.random() * 20;
    if (time >= darumaState.ghostNextAt) {
      darumaState.ghostActive = true;
      darumaState.ghostUntil = time + 3 + Math.random() * 3;
      darumaState.nextGhostDamageAt = time;
      if (darumaState.ghost) {
        darumaState.ghost.visible = true;
      }
    }
  }
  if (darumaState.ghostActive) {
    if (time >= darumaState.ghostUntil || darumaState.nextRoundAt !== Infinity) {
      darumaState.ghostActive = false;
      darumaState.ghostNextAt = time + 10 + Math.random() * 20;
      document.body.classList.remove('ghost-eye-danger', 'ghost-heartbeat');
      if (darumaState.ghost) darumaState.ghost.visible = false;
    } else {
      if (darumaState.ghost) {
        camera.getWorldDirection(forward);
        darumaState.ghost.position.copy(camera.position).addScaledVector(forward, 2);
        darumaState.ghost.position.y = 0;
        darumaState.ghost.lookAt(camera.position.x, camera.position.y, camera.position.z);
      }
      if (!darumaState.eyesClosed && time >= (darumaState.nextGhostDamageAt || 0)) {
        document.body.classList.add('ghost-eye-danger');
        document.body.classList.remove('ghost-heartbeat');
        damagePlayer(1, 'train-ghost');
        darumaState.nextGhostDamageAt = time + 0.1;
      } else {
        document.body.classList.toggle('ghost-eye-danger', !darumaState.eyesClosed);
        document.body.classList.toggle('ghost-heartbeat', darumaState.eyesClosed);
      }
    }
  } else {
    document.body.classList.remove('ghost-eye-danger', 'ghost-heartbeat');
  }
}

function updatePlayer(dt) {
  const time = clock.elapsedTime;
  if (state.mapMode === 'train') {
    if ((!controls.isLocked && !mobileInput.active) || state.ended || state.caught) return;
    const movingForward = keys.KeyW || mobileInput.moveY < -0.25;
    state.moveMode = movingForward ? 'WALKING' : 'WALKING';
    state.noise = 0;
    if (movingForward && !state.settingsOpen && !state.fullMapOpen) {
      const trainSpeedMultiplier = keys.Digit5 ? 3 : 1;
      camera.position.z -= 2.25 * trainSpeedMultiplier * dt;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, TRAIN_OFFSET_X, dt * 8);
      camera.position.y = 1.55;
    }
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, TRAIN_OFFSET_X - 0.72, TRAIN_OFFSET_X + 0.72);
    const minZ = trainDarumaZ(Math.min(darumaState.game, 10)) + 0.95;
    const maxZ = trainCarStartZ(Math.min(darumaState.game, 10)) - 0.55;
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, minZ, maxZ);
    if (keys.KeyA || keys.KeyS || keys.KeyD || keys.ShiftLeft || keys.ShiftRight) {
      keys.KeyA = keys.KeyS = keys.KeyD = keys.ShiftLeft = keys.ShiftRight = false;
    }
    const moved = Math.hypot(camera.position.x - darumaState.lastX, camera.position.z - darumaState.lastZ);
    const freezeWindowActive = Number.isFinite(darumaState.nextRoundAt)
      && time >= darumaState.finalDaAt + 0.4
      && time < darumaState.nextRoundAt;
    if (!darumaState.invincible && freezeWindowActive && moved > 0.035) {
      endTrainGameOver('daruma');
      return;
    }
    darumaState.lastX = camera.position.x;
    darumaState.lastZ = camera.position.z;
    if (camera.position.z <= trainDarumaZ(Math.min(darumaState.game, 10)) + 1.08) advanceTrainGame();
    return;
  }
  if (state.hidden) {
    state.battery = Math.min(100, state.battery + dt * 1.35);
    const hideProgress = THREE.MathUtils.clamp((time - state.lockerHideAt) / 5, 0, 1);
    const eased = 1 - (1 - hideProgress) ** 3;
    setDetection(THREE.MathUtils.lerp(state.lockerHideStartDetection, detectionFloor(), eased));
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
  if (active && !state.hidden) {
    enemyData.alertMemory = THREE.MathUtils.clamp(enemyData.alertMemory + dt * (running ? 0.0014 : 0.0004), 0, 1);
  }
  const nextX = camera.position.x + move.x * speed * dt;
  const nextZ = camera.position.z + move.z * speed * dt;
  if (canMoveTo(nextX, camera.position.z)) camera.position.x = nextX;
  if (canMoveTo(camera.position.x, nextZ)) camera.position.z = nextZ;
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.68, dt * 9);
  if (!active) state.bob = 0;
  if (state.flashlight) {
    const ghostDrain = isFlashlightHittingWoman() ? 10 : 1;
    state.battery = Math.max(0, state.battery - dt * 0.54 * ghostDrain);
    if (state.battery <= 0) state.flashlight = false;
  } else {
    state.battery = Math.min(100, state.battery + dt * 1.05);
  }
}

function updateAmbientMovementSuspicion(dt) {
  if (!state.started || state.ended || state.caught || state.hidden || clock.elapsedTime < state.seatedUntil) return;
  if (state.noise <= 1) return;
  const running = state.moveMode === 'RUNNING';
  const baseGain = running ? 1.5 : 0.12;
  const enemyPosition = state.mapMode === 'mansion' && womanEnemy?.group ? womanEnemy.group.position : enemy.position;
  const distance = enemyPosition ? Math.hypot(enemyPosition.x - camera.position.x, enemyPosition.z - camera.position.z) : 0;
  const distanceScale = distance > 40 ? 0.18 : distance > 26 ? 0.34 : distance > 16 ? 0.62 : 1;
  const memoryScale = 1 + enemyData.alertMemory * 0.25;
  const waterScale = isPlayerInWaterTrap() ? 1.45 : 1;
  setDetection(state.detection + dt * baseGain * memoryScale * waterScale * distanceScale);
  enemyData.alertMemory = THREE.MathUtils.clamp(
    enemyData.alertMemory + dt * (running ? 0.0024 : 0.0007),
    0,
    1,
  );
}

function updateLockerView() {
  if (!state.hidden || !state.currentLocker) return;
  state.noise = 0;
  const insideY = state.currentLocker.insideLocalY ?? 0.12;
  const inside = state.currentLocker.group.localToWorld(new THREE.Vector3(0, insideY, 0.39));
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

function startEnemyPounce(time) {
  if (state.hidden || state.caught || state.ended) return false;
  if (enemyData.mode === 'POUNCING' && time < enemyData.pounceUntil) return false;
  const target = { x: camera.position.x, z: camera.position.z };
  enemyData.mode = 'POUNCING';
  enemyData.path = [];
  enemyData.pounceStartedAt = time;
  enemyData.pounceUntil = time + POUNCE_DURATION;
  enemyData.pounceFrom = { x: enemy.position.x, z: enemy.position.z };
  enemyData.pounceTarget = { x: target.x, z: target.z };
  enemyData.speed = 0;
  enemyData.isMoving = false;
  enemyData.pauseUntil = 0;
  enemyData.lookAroundUntil = 0;
  return true;
}

function updateEnemyPounce(time) {
  if (enemyData.mode !== 'POUNCING') return false;
  const from = enemyData.pounceFrom;
  const target = enemyData.pounceTarget;
  if (!from || !target) {
    enemyData.mode = 'SEARCHING';
    return false;
  }
  const progress = THREE.MathUtils.clamp((time - enemyData.pounceStartedAt) / POUNCE_DURATION, 0, 1);
  const eased = progress < 0.5
    ? 2 * progress * progress
    : 1 - ((-2 * progress + 2) ** 2) / 2;
  enemy.position.x = THREE.MathUtils.lerp(from.x, target.x, eased);
  enemy.position.z = THREE.MathUtils.lerp(from.z, target.z, eased);
  enemy.position.y = Math.sin(progress * Math.PI) * 0.78;
  const yaw = Math.atan2(target.x - from.x, target.z - from.z);
  if (Number.isFinite(yaw)) enemy.rotation.y = yaw;
  enemyData.isMoving = true;
  $('#danger-flash').style.opacity = '0.18';
  const pounceCanSeePlayer = hasLineOfSight(
    enemy.position.clone().add(new THREE.Vector3(0, 1.65, 0)),
    camera.position.clone(),
  );
  if (!state.hidden && !state.caught && pounceCanSeePlayer && Math.hypot(enemy.position.x - camera.position.x, enemy.position.z - camera.position.z) < POUNCE_CAPTURE_DISTANCE) {
    startCaughtCutscene();
    return true;
  }
  if (progress >= 1) {
    if (!state.hidden && !state.caught && pounceCanSeePlayer && Math.hypot(target.x - camera.position.x, target.z - camera.position.z) < POUNCE_LANDING_CAPTURE_DISTANCE) {
      startCaughtCutscene();
      return true;
    }
    enemy.position.y = 0;
    enemyData.mode = 'SEARCHING';
    enemyData.searchUntil = Math.max(enemyData.searchUntil, time + 7);
    enemyData.lastHeardPosition = { x: target.x, z: target.z };
    enemyData.lookBaseYaw = enemy.rotation.y;
    enemyData.lookAroundUntil = time + 1.2;
    setEnemyDestinationNear(target.x, target.z, 'SEARCHING', 2.4);
  }
  return true;
}

function updateEnemy(dt, time) {
  if (state.mapMode === 'mansion') return;
  if (state.ended) return;
  if (updateEnemyRecoveryJump(time)) return;
  const roaring = time < state.roarUntil;
  if (!isSafeSpawnPoint(enemy.position.x, enemy.position.z, 0.18)) {
    const safe = nearestNode(enemy.position.x, enemy.position.z) || enemyStartNode;
    if (!startEnemyRecoveryJump(safe, time, state.detection > 70 ? 'player' : 'random')) {
      enemy.position.set(safe.x, 0, safe.z);
      enemyData.path = [];
    }
  }
  const distance = Math.hypot(enemy.position.x - camera.position.x, enemy.position.z - camera.position.z);
  const globalDrift = Math.hypot(enemy.position.x - enemyData.globalStuckAnchorX, enemy.position.z - enemyData.globalStuckAnchorZ);
  const shouldBeNavigating = !roaring
    && !enemyData.recoveryJump
    && enemyData.mode !== 'POUNCING'
    && (
      enemyData.path.length > 0
      || ['SEARCHING', 'INVESTIGATING', 'HUNTING', 'TRAP_RUSH'].includes(enemyData.mode)
      || state.detection > 45
      || enemyData.alertMemory > 0.35
      || enemyData.soundSourceTarget
    );
  if (shouldBeNavigating && globalDrift < 0.72) {
    if (!enemyData.globalStuckSince) enemyData.globalStuckSince = time;
    const stuckLimit = enemyData.path.length === 0 ? 2.4 : 3.6;
    if (time - enemyData.globalStuckSince > stuckLimit) {
      forceEnemyUnstuckRoute(time, distance <= 5 ? 'near-player' : enemyData.soundSourceTarget ? 'sound' : 'stuck');
      enemyData.globalStuckSince = time;
      enemyData.globalStuckAnchorX = enemy.position.x;
      enemyData.globalStuckAnchorZ = enemy.position.z;
    }
  } else {
    enemyData.globalStuckSince = 0;
    enemyData.globalStuckAnchorX = enemy.position.x;
    enemyData.globalStuckAnchorZ = enemy.position.z;
  }
  if (!state.hidden) {
    const closeDrift = Math.hypot(enemy.position.x - enemyData.closeRangeAnchorX, enemy.position.z - enemyData.closeRangeAnchorZ);
    if (closeDrift < 1.15) {
      if (!enemyData.closeRangeStuckSince) enemyData.closeRangeStuckSince = time;
      if (time - enemyData.closeRangeStuckSince > 5) forceEnemyUnstuckRoute(time, distance <= 5 ? 'near-player' : 'stuck');
    } else {
      enemyData.closeRangeStuckSince = 0;
      enemyData.closeRangeAnchorX = enemy.position.x;
      enemyData.closeRangeAnchorZ = enemy.position.z;
    }
  } else {
    enemyData.closeRangeStuckSince = 0;
    enemyData.closeRangeAnchorX = enemy.position.x;
    enemyData.closeRangeAnchorZ = enemy.position.z;
  }
  const enemyEye = enemy.position.clone().add(new THREE.Vector3(0, 1.7, 0));
  const playerEye = camera.position.clone();
  toPlayer.subVectors(playerEye, enemyEye);
  toPlayer.y = 0;
  const enemyForward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.quaternion);
  const facing = enemyForward.dot(toPlayer.clone().normalize());
  const exitGraceActive = time < state.lockerExitGraceUntil;
  const lineOfSightToPlayer = hasLineOfSight(enemyEye, playerEye);
  const visionDistance = currentEnemyVisionDistance();
  const visionFacingThreshold = currentEnemyVisionFacingThreshold();
  if (updateEnemyPounce(time)) return;
  const highAlertSearch = !state.hidden
    && !exitGraceActive
    && (state.detection > 58 || enemyData.alertMemory > 0.55 || enemyData.mode === 'HUNTING')
    && distance < 5.2
    && ['HUNTING', 'SEARCHING', 'INVESTIGATING'].includes(enemyData.mode);
  let passByActive = enemyData.mode === 'PASSING_BY' && time < enemyData.passByUntil;
  const visible = !passByActive
    && !state.hidden
    && !exitGraceActive
    && distance < visionDistance
    && lineOfSightToPlayer
    && (facing > visionFacingThreshold || highAlertSearch);
  if (visible) {
    enemyData.lastSawPlayerAt = time;
    enemyData.lastSeenPlayerPosition = { x: camera.position.x, z: camera.position.z };
  }
  const recentSightActive = time - enemyData.lastSawPlayerAt <= RECENT_SIGHT_MEMORY;
  if (!state.hidden
    && !exitGraceActive
    && (state.alert === 'HUNTING' || enemyData.mode === 'HUNTING' || state.detection > 70)
    && !lineOfSightToPlayer
    && recentSightActive
    && distance <= POUNCE_TRIGGER_DISTANCE) {
    startEnemyPounce(time);
    return;
  }
  const blockedChase = !state.hidden
    && !exitGraceActive
    && !enemyData.soundSourceTarget
    && (state.alert === 'HUNTING' || enemyData.mode === 'HUNTING' || state.detection > 70 || recentSightActive)
    && ['HUNTING', 'SEARCHING', 'INVESTIGATING'].includes(enemyData.mode)
    && distance < 5.4
    && !lineOfSightToPlayer;
  if (blockedChase) {
    if (!enemyData.blockedChaseSince) enemyData.blockedChaseSince = time;
    if (time - enemyData.blockedChaseSince > 10) {
      setDetection(detectionFloor());
      state.alert = 'UNNOTICED';
      enemyData.mode = 'PASSING_BY';
      enemyData.searchUntil = 0;
      enemyData.investigateUntil = 0;
      enemyData.alertMemory = Math.max(0, enemyData.alertMemory - 0.42);
      enemyData.blockedChaseSince = 0;
      enemyData.coverPeekUntil = 0;
      enemyData.lookAroundUntil = 0;
      choosePassByRoute(time);
      passByActive = true;
    } else if (time - enemyData.blockedChaseSince > 0.65) {
      if (state.detection > 58 || enemyData.alertMemory > 0.48) {
        setDetection(Math.max(state.detection, 72));
        state.alert = 'HUNTING';
        enemyData.mode = 'SEARCHING';
        enemyData.searchUntil = Math.max(enemyData.searchUntil, time + 10);
        enemyData.lookBaseYaw = enemy.rotation.y;
        enemyData.lookAroundUntil = Math.max(enemyData.lookAroundUntil, time + 2.8);
        enemyData.coverPeekYaw = Math.atan2(camera.position.x - enemy.position.x, camera.position.z - enemy.position.z);
        enemyData.coverPeekUntil = Math.max(enemyData.coverPeekUntil, time + 2.8);
        enemyData.lastHeardPosition = { x: camera.position.x, z: camera.position.z };
        setEnemyDestinationViaCorridor(camera.position.x, camera.position.z, 'SEARCHING', true);
      } else {
        setDetection(Math.min(state.detection, 18));
        state.alert = 'UNNOTICED';
        enemyData.alertMemory = Math.max(0, enemyData.alertMemory - 0.28);
        enemyData.blockedChaseSince = 0;
        choosePassByRoute(time);
        passByActive = true;
      }
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
    && (
      highAlertSearch
      || Math.cos(enemyData.coverPeekYaw - Math.atan2(camera.position.x - enemy.position.x, camera.position.z - enemy.position.z)) > 0.72
    );
  const checkingSameCover = nearbySharedCover >= 0 && enemyData.coverCheckSuccess && coverPeekFacing;

  if (visible) {
    state.detection += (13 - distance) * 13 * (1 + enemyData.alertMemory * 0.45) * dt;
    if (time - enemyData.lastMemoryGainAt > 2.4) {
      enemyData.alertMemory = THREE.MathUtils.clamp(enemyData.alertMemory + 0.06, 0, 1);
      enemyData.lastMemoryGainAt = time;
    }
  } else {
    const baseCalmRate = ['INVESTIGATING', 'SEARCHING'].includes(enemyData.mode) ? 4.2 : 7.5;
    const calmRate = Math.max(1.6, baseCalmRate * (1 - enemyData.alertMemory * 0.62));
    state.detection -= calmRate * dt;
  }
  if (checkingSameCover) state.detection += (72 + enemyData.alertMemory * 35) * dt;
  enemyData.alertMemory = Math.max(0, enemyData.alertMemory - dt * 0.0025);
  if (!passByActive && !state.hidden && !exitGraceActive && distance < 1.8) state.detection += 90 * dt;
  setDetection(state.detection);

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
    setDetection(state.detection - 42 * dt);
  } else if (enemyData.mode === 'TRAP_RUSH' && time < enemyData.trapRushUntil) {
    state.alert = 'SUSPICIOUS';
    enemyData.speed = 6.4;
  } else if (state.detection > 70 && !state.hidden && visible) {
    state.alert = 'HUNTING';
    enemyData.mode = 'HUNTING';
    enemyData.speed = 5.2 + state.detection * 0.006;
    if (time > enemyData.repathAt) {
      if (lineOfSightToPlayer) setEnemyDestination(camera.position.x, camera.position.z, 'HUNTING');
      else setEnemyDestinationViaCorridor(camera.position.x, camera.position.z, 'HUNTING');
      enemyData.repathAt = time + 0.48;
    }
  } else if (state.detection > 70 && !state.hidden) {
    state.alert = 'SUPER_ALERT';
    enemyData.mode = 'SEARCHING';
    enemyData.speed = 3.55 + enemyData.alertMemory * 0.9;
    if (time >= enemyData.superSearchUntil) {
      enemyData.superSearchUntil = time + 30;
      enemyData.searchUntil = Math.max(enemyData.searchUntil, enemyData.superSearchUntil);
      chooseSuperAlertRoute(time);
      enemyData.repathAt = time + 2.2;
    } else if (enemyData.path.length === 0 || time > enemyData.repathAt) {
      chooseSuperAlertRoute(time);
      enemyData.repathAt = time + 3.0 + Math.random() * 1.6;
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
  if (enemyData.soundSourceTarget && !state.hidden && ['HUNTING', 'INVESTIGATING', 'SEARCHING'].includes(enemyData.mode)) {
    const soundChaseTime = Math.max(0, time - enemyData.soundChaseStartedAt);
    const accel = THREE.MathUtils.clamp(1 + soundChaseTime * 0.28, 1, 2);
    enemyData.speed = Math.min(enemyData.speed * accel, 11.2);
  }

  enemyData.isMoving = false;
  if (!roaring && enemyData.path.length === 0) {
    if (enemyData.soundSourceTarget
      && !state.hidden
      && ['HUNTING', 'INVESTIGATING', 'SEARCHING'].includes(enemyData.mode)
      && Math.hypot(enemy.position.x - enemyData.soundSourceTarget.x, enemy.position.z - enemyData.soundSourceTarget.z) > 1.1
      && time > enemyData.repathAt) {
      setEnemyDestinationToSoundSource(enemyData.soundSourceTarget.x, enemyData.soundSourceTarget.z, enemyData.mode === 'HUNTING' ? 'HUNTING' : 'INVESTIGATING', enemyData.soundSourceTarget.roomId);
      enemyData.repathAt = time + 0.75;
      enemyData.searchUntil = Math.max(enemyData.searchUntil, time + 10);
      enemyData.investigateUntil = Math.max(enemyData.investigateUntil, time + 8);
    } else if (enemyData.mode === 'PASSING_BY' && time < enemyData.passByUntil) {
      enemyData.lookBackUntil = time + 0.7 + Math.random() * 0.75;
    } else if (enemyData.mode === 'TRAP_RUSH') {
      enemyData.mode = 'SEARCHING';
      enemyData.searchUntil = Math.max(enemyData.searchUntil, time + 7);
      enemyData.lookBaseYaw = enemy.rotation.y;
      enemyData.lookAroundUntil = time + 1.0;
    } else if (enemyData.mode === 'SEARCHING' && time >= enemyData.lookAroundUntil) {
      if (state.detection > 62 && Math.random() < 0.45) chooseSuperAlertRoute(time);
      else chooseCoverSearchRoute();
    }
    else if (!['INVESTIGATING', 'SEARCHING', 'PASSING_BY', 'TRAP_RUSH'].includes(enemyData.mode)) chooseRandomEnemyRoute();
  }
  const target = enemyData.path[0];
  if (!roaring && target && time >= enemyData.pauseUntil && time >= enemyData.lookAroundUntil) {
    const direction = new THREE.Vector3(target.x - enemy.position.x, 0, target.z - enemy.position.z);
    const distanceToPathTarget = direction.length();
    if (distanceToPathTarget < (target.key === 'sound-source' ? 0.34 : 0.18)) {
      if (target.key === 'sound-source') enemyData.soundSourceTarget = null;
      enemyData.path.shift();
      enemyData.stuckSince = 0;
      enemyData.wallSlideAttempts = 0;
      enemyData.lastTargetDistance = Infinity;
      if (enemyData.path.length === 0 && enemyData.mode === 'SEARCHING') {
        enemyData.lookBaseYaw = enemyData.coverLookYaw || enemy.rotation.y;
        enemyData.lookAroundUntil = time + 1.0 + Math.random() * 1.1;
      }
    }
    else {
      direction.normalize();
      const nextX = enemy.position.x + direction.x * enemyData.speed * dt;
      const nextZ = enemy.position.z + direction.z * enemyData.speed * dt;
      let movedThisFrame = false;
      if (canEnemyMoveTo(nextX, nextZ)) {
        enemy.position.x = nextX;
        enemy.position.z = nextZ;
        enemy.rotation.y = Math.atan2(direction.x, direction.z);
        enemyData.isMoving = true;
        enemyData.wallSlideAttempts = 0;
        movedThisFrame = true;
      } else if (canEnemyFurnitureHopTo(nextX, nextZ, 1.4)) {
        enemy.position.x = nextX;
        enemy.position.z = nextZ;
        enemy.rotation.y = Math.atan2(direction.x, direction.z);
        enemyData.isMoving = true;
        enemyData.wallSlideAttempts = Math.max(0, enemyData.wallSlideAttempts - 1);
        movedThisFrame = true;
      } else {
        const slideStep = Math.max(enemyData.speed * dt, 0.18);
        const rotateDir = (angle) => ({
          x: direction.x * Math.cos(angle) - direction.z * Math.sin(angle),
          z: direction.x * Math.sin(angle) + direction.z * Math.cos(angle),
        });
        const slideOptions = [
          rotateDir(Math.PI / 4),
          rotateDir(-Math.PI / 4),
          rotateDir(Math.PI / 2),
          rotateDir(-Math.PI / 2),
          rotateDir((Math.PI * 3) / 4),
          rotateDir((-Math.PI * 3) / 4),
        ].sort((a, b) =>
          Math.hypot(enemy.position.x + a.x * slideStep - target.x, enemy.position.z + a.z * slideStep - target.z)
          - Math.hypot(enemy.position.x + b.x * slideStep - target.x, enemy.position.z + b.z * slideStep - target.z));
        const slide = slideOptions.find((option) =>
          canEnemyMoveTo(enemy.position.x + option.x * slideStep, enemy.position.z + option.z * slideStep)
          || canEnemyFurnitureHopTo(enemy.position.x + option.x * slideStep, enemy.position.z + option.z * slideStep));
        if (slide) {
          enemy.position.x += slide.x * slideStep;
          enemy.position.z += slide.z * slideStep;
          enemy.rotation.y = Math.atan2(slide.x, slide.z);
          enemyData.isMoving = true;
          enemyData.wallSlideAttempts += 1;
          movedThisFrame = true;
          if (enemyData.wallSlideAttempts > 3) {
            if (enemyData.soundSourceTarget) {
              setEnemyDestinationToSoundSource(
                enemyData.soundSourceTarget.x,
                enemyData.soundSourceTarget.z,
                enemyData.mode === 'HUNTING' ? 'HUNTING' : 'INVESTIGATING',
                enemyData.soundSourceTarget.roomId,
              );
              enemyData.repathAt = time + 0.6;
            } else if (enemyData.path.length > 1) {
              enemyData.path.shift();
              enemyData.wallSlideAttempts = 0;
            } else {
              chooseOuterLoopRoute(time, enemyData.mode === 'ROAMING' ? 'ROAMING' : 'SEARCHING');
            }
          }
        } else {
          const safe = nearestNode(enemy.position.x, enemy.position.z) || enemyStartNode;
          if (!isSafeSpawnPoint(enemy.position.x, enemy.position.z, 0.18) || enemyData.wallSlideAttempts > 3) {
            const anchor = nearestReachableNode(enemy.position.x, enemy.position.z, 10) || safe;
            const after = enemyData.lastHeardPosition && time < enemyData.wallSoundRepathUntil
              ? 'sound'
              : (!state.hidden && state.detection > 70 ? 'player' : 'random');
            if (startEnemyRecoveryJump(anchor, time, after)) return;
          }
          if (!recoverEnemyFromOscillation(time)) recoverEnemyNavigation(time);
        }
      }
      if (movedThisFrame) {
        const newDistanceToPathTarget = Math.hypot(target.x - enemy.position.x, target.z - enemy.position.z);
        const anchorDrift = Math.hypot(enemy.position.x - enemyData.oscillationAnchorX, enemy.position.z - enemyData.oscillationAnchorZ);
        if (anchorDrift < 0.42) {
          if (!enemyData.oscillationSince) enemyData.oscillationSince = time;
        } else {
          enemyData.oscillationSince = 0;
          enemyData.oscillationAnchorX = enemy.position.x;
          enemyData.oscillationAnchorZ = enemy.position.z;
        }
        if (enemyData.oscillationSince && time - enemyData.oscillationSince > 0.95) {
          if (forceEnemyUnstuckRoute(time, distance <= 5 ? 'near-player' : 'oscillation')) return;
          if (recoverEnemyFromOscillation(time)) return;
        }
        const improving = !Number.isFinite(enemyData.lastTargetDistance)
          || newDistanceToPathTarget < enemyData.lastTargetDistance - 0.035;
        if (improving) {
          enemyData.stuckSince = 0;
          enemyData.lastTargetDistance = newDistanceToPathTarget;
        } else {
          if (!enemyData.stuckSince) enemyData.stuckSince = time;
          if (time - enemyData.stuckSince > 0.85 || enemyData.wallSlideAttempts > 5) {
            if (!forceEnemyUnstuckRoute(time, distance <= 5 ? 'near-player' : 'stuck') && !recoverEnemyFromOscillation(time)) recoverEnemyNavigation(time);
          }
        }
        enemyData.lastMoveX = enemy.position.x;
        enemyData.lastMoveZ = enemy.position.z;
      } else if (!enemyData.stuckSince) {
        enemyData.stuckSince = time;
      } else if (time - enemyData.stuckSince > 0.55) {
        if (!forceEnemyUnstuckRoute(time, distance <= 5 ? 'near-player' : 'blocked') && !recoverEnemyFromOscillation(time)) recoverEnemyNavigation(time);
      }
    }
  }
  if (roaring) {
    enemyData.isMoving = false;
    const roarTurn = Math.sin(time * 4.2) * 0.18;
    enemy.rotation.y += roarTurn * dt;
  }
  if (enemyData.mode === 'SEARCHING' && enemyData.path.length === 0 && time < enemyData.lookAroundUntil) {
    if (!state.hidden && distance <= 5 && enemyData.closeRangeStuckSince && time - enemyData.closeRangeStuckSince > 2.2) {
      if (forceEnemyUnstuckRoute(time, 'near-player')) return;
    }
    const sweepProgress = (time * (state.detection > 58 || enemyData.alertMemory > 0.55 ? 2.35 : 1.25)) % (Math.PI * 2);
    enemy.rotation.y = enemyData.lookBaseYaw + sweepProgress;
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
  const playerRunning = playerMoving && state.moveMode === 'RUNNING';
  const captureDistance = playerMoving ? MOVING_CAPTURE_DISTANCE : CAPTURE_DISTANCE;
  const visibleCapture = distance < captureDistance && visible;
  const closeMovingCapture = playerRunning
    && state.alert === 'HUNTING'
    && lineOfSightToPlayer
    && visible
    && distance < MOVING_CLOSE_CAPTURE_DISTANCE;
  const wallPinCapture = !passByActive
    && !state.hidden
    && !exitGraceActive
    && lineOfSightToPlayer
    && visible
    && distance < WALL_PIN_CAPTURE_DISTANCE
    && (state.alert === 'HUNTING' || enemyData.mode === 'HUNTING' || state.detection > 70 || recentSightActive);
  if (wallPinCapture) {
    enemyData.path = [];
    enemyData.isMoving = false;
    enemyData.pauseUntil = Math.max(enemyData.pauseUntil, time + 0.22);
    faceEnemyToPlayer();
  }
  const clearAtContactRange = !passByActive && (visibleCapture || closeMovingCapture || wallPinCapture);
  if (!state.hidden && !exitGraceActive && clearAtContactRange) startCaughtCutscene();
}

function nearestMansionNode(x, z, minDistance = 0) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of mansionNodes) {
    const distance = Math.hypot(node.x - x, node.z - z);
    if (distance < minDistance || distance >= bestDistance) continue;
    best = node;
    bestDistance = distance;
  }
  return best || mansionNodes[0] || null;
}

function nearestSafeMansionNode(x, z, minDistance = 0) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of mansionNodes) {
    const distance = Math.hypot(node.x - x, node.z - z);
    if (distance < minDistance || distance >= bestDistance || !isSafeSpawnPoint(node.x, node.z, 0.78)) continue;
    best = node;
    bestDistance = distance;
  }
  return best || nearestMansionNode(x, z, minDistance);
}

function mansionNodeKey(node) {
  return `${Math.round(node.x * 10) / 10},${Math.round(node.z * 10) / 10}`;
}

let mansionPathGraphCount = -1;
let mansionPathNodeByKey = new Map();
let mansionPathNeighbors = new Map();

function buildMansionPathGraph() {
  if (mansionPathGraphCount === mansionNodes.length) return;
  mansionPathNodeByKey = new Map();
  mansionPathNeighbors = new Map();
  for (const node of mansionNodes) mansionPathNodeByKey.set(mansionNodeKey(node), node);
  for (const node of mansionNodes) {
    const key = mansionNodeKey(node);
    const neighbors = [];
    for (const [dx, dz] of [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]]) {
      const candidate = mansionPathNodeByKey.get(`${Math.round((node.x + dx) * 10) / 10},${Math.round((node.z + dz) * 10) / 10}`);
      if (!candidate) continue;
      const midX = (candidate.x + node.x) / 2;
      const midZ = (candidate.z + node.z) / 2;
      if (canEnemyMoveIgnoringFurniture(candidate.x, candidate.z, 0.22) && canEnemyMoveIgnoringFurniture(midX, midZ, 0.22)) neighbors.push(candidate);
    }
    mansionPathNeighbors.set(key, neighbors);
  }
  mansionPathGraphCount = mansionNodes.length;
}

function findMansionPath(startNode, targetNode) {
  if (!startNode || !targetNode) return [];
  buildMansionPathGraph();
  const startKey = mansionNodeKey(startNode);
  const targetKey = mansionNodeKey(targetNode);
  if (startKey === targetKey) return [targetNode];
  const queue = [startKey];
  const previous = new Map([[startKey, null]]);
  while (queue.length) {
    const key = queue.shift();
    const node = mansionPathNodeByKey.get(key);
    if (!node) continue;
    const neighbors = mansionPathNeighbors.get(key) || [];
    for (const neighbor of neighbors) {
      const nextKey = mansionNodeKey(neighbor);
      if (previous.has(nextKey)) continue;
      previous.set(nextKey, key);
      if (nextKey === targetKey) {
        const path = [targetNode];
        let walkKey = key;
        while (walkKey && walkKey !== startKey) {
          const walkNode = mansionPathNodeByKey.get(walkKey);
          if (walkNode) path.unshift(walkNode);
          walkKey = previous.get(walkKey);
        }
        return path.slice(0, 10);
      }
      queue.push(nextKey);
    }
  }
  return [];
}

function setWomanRoutedTarget(x, z, time, direct = false) {
  if (direct || hasLineOfSight(womanEnemy.group.position.clone().setY(1.1), cleanupPosition.set(x, 1.1, z))) {
    womanEnemy.path = [];
    womanEnemy.target = { x, z };
    return;
  }
  if (time < (womanEnemy.pathRepathAt || 0) && womanEnemy.path?.length) {
    womanEnemy.target = womanEnemy.path[0];
    return;
  }
  const start = nearestSafeMansionNode(womanEnemy.group.position.x, womanEnemy.group.position.z);
  const goal = nearestSafeMansionNode(x, z);
  const path = findMansionPath(start, goal);
  womanEnemy.path = path.length ? path : [];
  womanEnemy.pathRepathAt = time + 0.85;
  womanEnemy.target = womanEnemy.path[0] || goal || { x, z };
}

function isFlashlightHittingWoman() {
  const now = clock.elapsedTime;
  if (now < (isFlashlightHittingWoman.cachedUntil || 0)) return isFlashlightHittingWoman.cachedValue;
  const finish = (value) => {
    isFlashlightHittingWoman.cachedUntil = now + 0.18;
    isFlashlightHittingWoman.cachedValue = value;
    return value;
  };
  if (!state.flashlight || state.battery <= 0 || state.mapMode !== 'mansion') return finish(false);
  if (now < womanEnemy.stunnedUntil) return finish(false);
  camera.getWorldDirection(forward);
  const base = womanEnemy.group.position;
  const targetOffsets = [
    [0, 1.55, 0],
    [0, 1.18, 0],
    [0, 0.85, 0],
    [0.34, 1.22, 0],
    [-0.34, 1.22, 0],
  ];
  for (const [ox, oy, oz] of targetOffsets) {
    const targetX = base.x + ox;
    const targetY = base.y + oy;
    const targetZ = base.z + oz;
    const dx = targetX - camera.position.x;
    const dy = targetY - camera.position.y;
    const dz = targetZ - camera.position.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > 100 || distanceSq < 0.001) continue;
    const invDistance = 1 / Math.sqrt(distanceSq);
    const centered = forward.x * dx * invDistance + forward.y * dy * invDistance + forward.z * dz * invDistance;
    const distance = Math.sqrt(distanceSq);
    const requiredCentering = THREE.MathUtils.lerp(0.965, 0.985, THREE.MathUtils.clamp(distance / 10, 0, 1));
    if (centered < requiredCentering) continue;
    const target = cleanupPosition.set(targetX, targetY, targetZ);
    if (hasLineOfSight(camera.position, target)) return finish(true);
  }
  return finish(false);
}

function updateGhostStunReticle(active) {
  const reticle = $('#ghost-stun-reticle');
  if (!reticle) return;
  const required = 3 * state.ghostStunTimeMultiplier;
  const progress = active ? THREE.MathUtils.clamp(state.ghostLightSeconds / required, 0, 1) : 0;
  reticle.style.setProperty('--stun-progress', progress.toFixed(3));
  reticle.classList.toggle('visible', active);
}

function triggerFakeOfudaTrap(item) {
  item.collected = true;
  item.group.visible = false;
  item.light.visible = false;
  state.fakeOfudaAlertUntil = clock.elapsedTime + 13;
  setDetection(100);
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const targetX = camera.position.x + forward.x * 15;
  const targetZ = camera.position.z + forward.z * 15;
  const node = nearestSafeMansionNode(targetX, targetZ, 0) || nearestMansionNode(targetX, targetZ) || { x: targetX, z: targetZ };
  womanEnemy.group.position.set(node.x, -1.8, node.z);
  womanEnemy.group.rotation.set(0, Math.atan2(camera.position.x - node.x, camera.position.z - node.z), 0);
  womanEnemy.group.scale.setScalar(1);
  womanEnemy.target = null;
  womanEnemy.emergeStartedAt = clock.elapsedTime;
  womanEnemy.emergeUntil = clock.elapsedTime + 3;
  ghostEmergeEffect.position.set(node.x, 0.035, node.z);
  ghostEmergeEffect.scale.setScalar(0.25);
  ghostEmergeEffect.material.opacity = 0.78;
  ghostEmergeEffect.visible = true;
  womanEnemy.stunnedUntil = 0;
  womanEnemy.phaseChargeUntil = 0;
  womanEnemy.phaseUntil = 0;
  setWomanPhasingVisual(true);
  showToast('偽のお札だった');
}

function reactWomanToSoundEvent(event, now) {
  if (now < womanEnemy.stunnedUntil) return;
  const distance = Math.hypot(womanEnemy.group.position.x - event.x, womanEnemy.group.position.z - event.z);
  if (distance <= event.hearingRadius || event.forceTrapResponse) {
    womanEnemy.target = { x: event.x, z: event.z };
    womanEnemy.repathAt = now + 3.5;
    womanEnemy.speed = event.strength > 70 ? 3.05 : 2.05;
    setDetection(Math.max(state.detection, event.strength > 70 ? 34 : 14) + (event.strength > 70 ? 13 : 4));
  } else {
    const ratio = event.hearingRadius / Math.max(distance, 0.001);
    if (ratio > 0.12) setDetection(state.detection + ratio * (event.strength > 70 ? 2.4 : 0.55));
  }
}

function scheduleNextEyeScare(time) {
  state.nextEyeScareAt = time + 30;
}

const eyeScareSounds = [
  { src: './audio/mitsuketa.mp3', calmOnly: false },
  { src: './audio/doko_ni_iruno.mp3', calmOnly: true },
  { src: './audio/kocchi_ni_kinasai.mp3', calmOnly: false },
].map((item) => {
  const element = new Audio(item.src);
  element.preload = 'auto';
  element.volume = Math.min(1, Math.max(0, seVolume / 300));
  element.load();
  return { ...item, element };
});

function playEyeScareSound() {
  if (seVolume <= 0) return;
  const candidates = eyeScareSounds.filter((item) => !item.calmOnly || state.detection < 50);
  const sound = candidates[Math.floor(Math.random() * candidates.length)]?.element;
  if (!sound) return;
  sound.pause();
  sound.currentTime = 0;
  sound.volume = Math.min(1, Math.max(0, seVolume / 300));
  sound.play().catch(() => {});
}

function updateEyeScare(time) {
  const eye = eyeScareElement;
  if (!eye) return;
  if (state.mapMode !== 'mansion' || !state.started || state.ended || state.caught) {
    if (updateEyeScare.wasActive) {
      eye.classList.remove('visible');
      eye.style.opacity = '';
      eye.style.transform = '';
      updateEyeScare.wasActive = false;
    }
    return;
  }
  if (!Number.isFinite(state.nextEyeScareAt)) scheduleNextEyeScare(time);
  if (time >= state.nextEyeScareAt) {
    if (!eye.classList.contains('image-ready')) {
      scheduleNextEyeScare(time + 3);
    } else {
      playEyeScareSound();
      state.eyeScareUntil = time + 1;
      scheduleNextEyeScare(time + 1);
    }
  }
  const active = time < state.eyeScareUntil;
  if (active !== updateEyeScare.wasActive) {
    eye.classList.toggle('visible', active);
    updateEyeScare.wasActive = active;
  }
  if (active) {
    const progress = THREE.MathUtils.clamp(1 - (state.eyeScareUntil - time), 0, 1);
    const pulse = Math.sin(progress * Math.PI);
    const baseScale = touchDevice ? 1.0 : 1.04;
    const pulseScale = touchDevice ? 0.012 : 0.035;
    eye.style.opacity = String(0.12 + pulse * 0.78);
    eye.style.transform = `scale(${(baseScale + pulse * pulseScale).toFixed(3)})`;
  } else if (updateEyeScare.lastCleared !== state.eyeScareUntil) {
    eye.style.opacity = '';
    eye.style.transform = '';
    updateEyeScare.lastCleared = state.eyeScareUntil;
  }
}

function spawnGhostDouble(time) {
  const candidates = mansionNodes
    .filter((node) => Math.hypot(node.x - camera.position.x, node.z - camera.position.z) > 9)
    .sort(() => Math.random() - 0.5);
  const node = candidates[0] || nearestMansionNode(womanEnemy.group.position.x, womanEnemy.group.position.z, 10);
  if (!node) return;
  ghostDouble.group.position.set(node.x, 0.28, node.z);
  ghostDouble.group.rotation.set(0, Math.random() * Math.PI * 2, 0);
  ghostDouble.group.visible = true;
  ghostDouble.active = true;
  ghostDouble.despawnAt = time + 60;
  ghostDouble.target = nearestMansionNode(node.x, node.z, 8);
  ghostDouble.repathAt = time + 0.8;
  ghostDouble.runChaseSpeed = 0;
}

function despawnGhostDouble(time) {
  ghostDouble.group.visible = false;
  ghostDouble.active = false;
  ghostDouble.target = null;
  ghostDouble.runChaseSpeed = 0;
  ghostDouble.spawnAt = time + 60;
  ghostDouble.despawnAt = 0;
}

function updateGhostDouble(dt, time) {
  if (state.mapMode !== 'mansion' || state.ended || state.caught) {
    ghostDouble.group.visible = false;
    return;
  }
  if (!Number.isFinite(ghostDouble.spawnAt)) ghostDouble.spawnAt = time + 60;
  if (!ghostDouble.active) {
    if (time >= ghostDouble.spawnAt) spawnGhostDouble(time);
    return;
  }
  if (time >= ghostDouble.despawnAt) {
    despawnGhostDouble(time);
    return;
  }
  const playerRunningInMansion = !state.hidden && state.moveMode === 'RUNNING' && state.noise > 8;
  if (playerRunningInMansion) {
    ghostDouble.target = { x: camera.position.x, z: camera.position.z };
    ghostDouble.runChaseSpeed = Math.min(24, (ghostDouble.runChaseSpeed || 7.5) + dt * 5.5);
    ghostDouble.repathAt = time + 0.18;
  } else if (ghostDouble.runChaseSpeed > 0) {
    ghostDouble.runChaseSpeed = 0;
    ghostDouble.target = null;
    ghostDouble.repathAt = 0;
  }
  if (!playerRunningInMansion && (!ghostDouble.target || time >= ghostDouble.repathAt || Math.hypot(ghostDouble.group.position.x - ghostDouble.target.x, ghostDouble.group.position.z - ghostDouble.target.z) < 0.7)) {
    const node = mansionNodes
      .filter((candidate) => Math.hypot(candidate.x - ghostDouble.group.position.x, candidate.z - ghostDouble.group.position.z) > 8)
      .sort(() => Math.random() - 0.5)[0] || nearestMansionNode(ghostDouble.group.position.x, ghostDouble.group.position.z, 6);
    if (node) ghostDouble.target = { x: node.x, z: node.z };
    ghostDouble.repathAt = time + 1.2 + Math.random() * 1.8;
  }
  if (ghostDouble.target) {
    const dx = ghostDouble.target.x - ghostDouble.group.position.x;
    const dz = ghostDouble.target.z - ghostDouble.group.position.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.05) {
      const speed = playerRunningInMansion ? ghostDouble.runChaseSpeed : 4.8;
      const step = speed * dt;
      const prevX = ghostDouble.group.position.x;
      const prevZ = ghostDouble.group.position.z;
      // Doppelganger is a ghostly harassment effect: it should always phase through walls/furniture.
      ghostDouble.group.position.x += (dx / len) * step;
      ghostDouble.group.position.z += (dz / len) * step;
      const moveX = ghostDouble.group.position.x - prevX;
      const moveZ = ghostDouble.group.position.z - prevZ;
      if (Math.hypot(moveX, moveZ) > 0.001) ghostDouble.group.rotation.y = Math.atan2(moveX, moveZ);
    }
  }
  ghostDouble.group.position.y = 0.28 + Math.sin(time * 2.4 + 1.7) * 0.1;
  if (!state.hidden && Math.hypot(ghostDouble.group.position.x - camera.position.x, ghostDouble.group.position.z - camera.position.z) < 0.82) {
    state.seatedUntil = Math.max(state.seatedUntil, time + 5);
    state.hp = Math.max(1, state.hp - 8);
    emitWorldSound(camera.position.x, camera.position.z, 45, 8, true);
    showToast('幽霊の分身に足をすくわれた');
    despawnGhostDouble(time);
  }
}

function scheduleGhostIllusions(time, delay = null) {
  state.nextGhostIllusionAt = time + (delay ?? (60 + Math.random() * 60));
}

function scheduleNextQueuedGhostIllusion(time) {
  state.nextGhostIllusionAt = time + 1 + Math.random() * 9;
}

function spawnGhostIllusions(time) {
  if (state.mapMode !== 'mansion') return;
  if (state.hidden) {
    if (state.ghostIllusionQueue > 0) scheduleNextQueuedGhostIllusion(time);
    else scheduleGhostIllusions(time);
    return;
  }
  if (state.ghostIllusionQueue <= 0) state.ghostIllusionQueue = 10;
  if (ghostIllusions.some((illusion) => illusion.active)) return;
  const illusion = ghostIllusions.find((item) => !item.active);
  if (!illusion) return;
  let node = null;
  for (let attempt = 0; attempt < 8 && !node; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 6 + Math.random() * 7;
    const rawX = camera.position.x + Math.sin(angle) * distance;
    const rawZ = camera.position.z + Math.cos(angle) * distance;
    const candidate = nearestMansionNode(rawX, rawZ, 4);
    if (candidate && Math.hypot(candidate.x - camera.position.x, candidate.z - camera.position.z) > 4.5) node = candidate;
  }
  node ||= nearestMansionNode(camera.position.x, camera.position.z, 10) || { x: camera.position.x + 8, z: camera.position.z };
  illusion.group.position.set(node.x, 0.28, node.z);
  illusion.group.rotation.set(0, Math.atan2(camera.position.x - node.x, camera.position.z - node.z), 0);
  if (illusion.externalModel) illusion.externalModel.rotation.set(WOMAN_MODEL_UPRIGHT_X, WOMAN_MODEL_FORWARD_YAW, 0);
  illusion.target.set(camera.position.x, 0.28, camera.position.z);
  illusion.clingUntil = 0;
  illusion.group.visible = true;
  illusion.active = true;
  illusion.despawnAt = time + 5.5;
  illusion.speed = 10.5 + Math.random() * 1.8;
  state.ghostIllusionQueue = Math.max(0, state.ghostIllusionQueue - 1);
  if (state.ghostIllusionQueue <= 0) scheduleGhostIllusions(time);
  else state.nextGhostIllusionAt = Infinity;
}

function updateGhostIllusions(dt, time) {
  if (state.mapMode !== 'mansion' || state.ended || state.caught || state.ghostStunCount < 2) {
    if (state.ghostIllusionQueue > 0 || ghostIllusions.some((illusion) => illusion.active || illusion.group.visible)) {
      for (const illusion of ghostIllusions) {
        illusion.group.visible = false;
        illusion.active = false;
      }
    }
    state.ghostIllusionQueue = 0;
    return;
  }
  if (!Number.isFinite(state.nextGhostIllusionAt)) scheduleGhostIllusions(time);
  if (time >= state.nextGhostIllusionAt) spawnGhostIllusions(time);
  for (const illusion of ghostIllusions) {
    if (!illusion.active) continue;
    if (time >= illusion.despawnAt) {
      illusion.group.visible = false;
      illusion.active = false;
      illusion.clingUntil = 0;
      if (state.ghostIllusionQueue > 0) scheduleNextQueuedGhostIllusion(time);
      continue;
    }
    if (time < illusion.clingUntil) {
      camera.getWorldDirection(forward);
      illusion.group.position.set(
        camera.position.x + forward.x * 0.78,
        camera.position.y - 0.34,
        camera.position.z + forward.z * 0.78,
      );
      illusion.group.rotation.y = camera.rotation.y + Math.PI;
      if (illusion.externalModel) illusion.externalModel.rotation.set(WOMAN_MODEL_UPRIGHT_X, WOMAN_MODEL_FORWARD_YAW, 0);
      continue;
    }
    const dx = illusion.target.x - illusion.group.position.x;
    const dz = illusion.target.z - illusion.group.position.z;
    const len = Math.hypot(dx, dz);
    if (!state.hidden && Math.hypot(camera.position.x - illusion.group.position.x, camera.position.z - illusion.group.position.z) < 0.82) {
      illusion.clingUntil = time + 5;
      illusion.despawnAt = illusion.clingUntil;
      state.seatedUntil = Math.max(state.seatedUntil, time + 1.2);
      flashScreen('red', 0.42);
      continue;
    }
    if (len < 0.45) {
      illusion.group.visible = false;
      illusion.active = false;
      if (state.ghostIllusionQueue > 0) scheduleNextQueuedGhostIllusion(time);
      continue;
    }
    const step = illusion.speed * dt;
    illusion.group.position.x += (dx / Math.max(0.001, len)) * step;
    illusion.group.position.z += (dz / Math.max(0.001, len)) * step;
    illusion.group.position.y = 0.24 + Math.sin(time * 5 + len) * 0.06;
    illusion.group.rotation.y = Math.atan2(dx, dz);
    if (illusion.externalModel) illusion.externalModel.rotation.set(WOMAN_MODEL_UPRIGHT_X, WOMAN_MODEL_FORWARD_YAW, 0);
  }
}

function updateWomanEnemy(dt, time) {
  if (!womanEnemy || state.ended) {
    updateGhostStunReticle(false);
    return;
  }
  if (state.mapMode !== 'mansion') {
    womanEnemy.group.visible = false;
    updateGhostStunReticle(false);
    return;
  }
  womanEnemy.group.visible = true;
  if (time < (womanEnemy.emergeUntil || 0)) {
    const progress = THREE.MathUtils.clamp((time - (womanEnemy.emergeStartedAt || time)) / 3, 0, 1);
    womanEnemy.group.position.y = THREE.MathUtils.lerp(-1.8, 0.28, progress);
    womanEnemy.group.rotation.x = 0;
    womanEnemy.group.rotation.z = 0;
    womanEnemy.group.scale.setScalar(THREE.MathUtils.lerp(0.65, 1, progress));
    setWomanVisualPose(false);
    ghostEmergeEffect.visible = true;
    ghostEmergeEffect.scale.setScalar(0.35 + progress * 1.15);
    ghostEmergeEffect.material.opacity = 0.72 * (1 - progress * 0.55);
    setWomanPhasingVisual(true);
    enemyVisionLines.visible = false;
    setDetection(100);
    return;
  } else if (womanEnemy.emergeUntil) {
    womanEnemy.emergeUntil = 0;
    ghostEmergeEffect.visible = false;
    womanEnemy.group.position.y = 0.28;
    womanEnemy.group.rotation.x = 0;
    womanEnemy.group.rotation.z = 0;
    womanEnemy.group.scale.setScalar(1);
    setWomanVisualPose(false);
    setWomanPhasingVisual(false);
  }
  if (time < state.fakeOfudaAlertUntil) setDetection(100);
  const stunned = time < womanEnemy.stunnedUntil;
  if (stunned) {
    state.ghostLightSeconds = 0;
    updateGhostStunReticle(false);
    setWomanPhasingVisual(false);
    womanEnemy.target = null;
    setWomanVisualPose(true);
    womanEnemy.group.position.y = 0.18 + Math.sin(time * 1.6) * 0.006;
    setDetection(state.detection - dt * 9);
    state.alert = state.detection > 35 ? 'SUSPICIOUS' : 'UNNOTICED';
    return;
  }
  setWomanVisualPose(false);
  if (time >= womanEnemy.nextPhaseAt) {
    womanEnemy.phaseChargeUntil = time + 1.0;
    womanEnemy.phaseUntil = time + 11.0;
    womanEnemy.nextPhaseAt = time + 60;
  }
  const phaseCharging = time < womanEnemy.phaseChargeUntil;
  let phasing = !phaseCharging && time < womanEnemy.phaseUntil;
  if (!phasing && !canEnemyMoveTo(womanEnemy.group.position.x, womanEnemy.group.position.z, 0.18)) {
    womanEnemy.exitingWallPhase = true;
  }
  if (womanEnemy.exitingWallPhase) {
    phasing = true;
    if (canEnemyMoveTo(womanEnemy.group.position.x, womanEnemy.group.position.z, 0.18)) womanEnemy.exitingWallPhase = false;
  }
  setWomanPhasingVisual(phaseCharging || phasing);
  if (phaseCharging) {
    womanEnemy.target = null;
    womanEnemy.group.scale.setScalar(1 + Math.sin(time * 28) * 0.035);
    womanEnemy.group.position.y = Math.sin(time * 34) * 0.055;
    enemyVisionLines.visible = false;
    updateGhostStunReticle(false);
    return;
  }
  womanEnemy.group.scale.setScalar(1);
  const playerOnSecondFloor = state.mapMode === 'mansion';
  const distance = Math.hypot(womanEnemy.group.position.x - camera.position.x, womanEnemy.group.position.z - camera.position.z);
  if (distance > MANSION_RENDER_RADIUS) {
    womanEnemy.group.visible = false;
    for (const part of womanEnemy.detailParts) part.visible = false;
    enemyVisionLines.visible = false;
    updateGhostStunReticle(false);
    setDetection(state.detection - dt * 5.8);
    return;
  }
  if (state.hidden) {
    womanEnemy.cachedSeesPlayer = false;
    if (time >= (womanEnemy.hiddenRedirectAt || 0)) {
      const roamChoices = mansionNodes
        .filter((node) => Math.hypot(node.x - camera.position.x, node.z - camera.position.z) > 12)
        .filter((node) => Math.hypot(node.x - womanEnemy.group.position.x, node.z - womanEnemy.group.position.z) > 7)
        .sort(() => Math.random() - 0.5);
      const roamNode = roamChoices.find((node) => canEnemyMoveTo(node.x, node.z, 0.28)) || nearestMansionNode(womanEnemy.group.position.x, womanEnemy.group.position.z, 10);
      if (roamNode) womanEnemy.target = { x: roamNode.x, z: roamNode.z };
      womanEnemy.hiddenRedirectAt = time + 2.4;
      womanEnemy.repathAt = time + 2.4;
    }
    state.ghostLightSeconds = 0;
    updateGhostStunReticle(false);
    setDetection(state.detection - dt * 24);
    state.alert = state.detection > 35 ? 'SUSPICIOUS' : 'UNNOTICED';
  }
  womanEnemy.group.visible = true;
  const hideGhostDetails = distance < 8 || (perfFps > 0 && perfFps < 58 && distance < 22);
  for (const part of womanEnemy.detailParts) part.visible = !hideGhostDetails;
  const flashlightHit = !state.hidden && isFlashlightHittingWoman();
  state.ghostLightSeconds = flashlightHit ? state.ghostLightSeconds + dt : Math.max(0, state.ghostLightSeconds - dt * 1.8);
  updateGhostStunReticle(flashlightHit);
  if (state.ghostLightSeconds >= 3 * state.ghostStunTimeMultiplier) {
    womanEnemy.stunnedUntil = time + 10;
    setWomanVisualPose(true);
    womanEnemy.group.position.y = 0.18;
    state.ghostLightSeconds = 0;
    state.ghostStunCount += 1;
    if (state.ghostStunCount === 2) {
      state.ghostIllusionQueue = 10;
      scheduleGhostIllusions(time, 3);
    } else if (state.ghostStunCount > 2 && !Number.isFinite(state.nextGhostIllusionAt)) {
      scheduleGhostIllusions(time, 8);
    }
    updateGhostStunReticle(false);
    setWomanPhasingVisual(false);
    enemyVisionLines.visible = false;
    showToast('幽霊が怯んだ：10秒間スタン');
    return;
  }
  const ghostEye = womanEnemy.group.position.clone().add(new THREE.Vector3(0, 1.65, 0));
  const playerEye = camera.position.clone();
  const ghostForward = new THREE.Vector3(0, 0, 1).applyQuaternion(womanEnemy.group.quaternion);
  const toGhostPlayer = playerEye.clone().sub(ghostEye).setY(0).normalize();
  if (time - womanEnemy.lastSightCheckAt > 0.65) {
    const lowAlertScale = state.detection <= 40 ? 0.5 : 1;
    const ghostVisionDistance = 14.5 * THREE.MathUtils.lerp(0.55, 1.15, enemyVisionAlertRatio()) * lowAlertScale;
    const ghostVisionHalfAngle = (Math.PI / 4.2) * THREE.MathUtils.lerp(0.55, 1.15, enemyVisionAlertRatio()) * lowAlertScale;
    womanEnemy.cachedSeesPlayer = !stunned
      && playerOnSecondFloor
      && !state.hidden
      && distance < ghostVisionDistance
      && ghostForward.dot(toGhostPlayer) > Math.cos(ghostVisionHalfAngle)
      && hasLineOfSight(ghostEye, playerEye);
    womanEnemy.lastSightCheckAt = time;
  }
  const ghostSeesPlayer = womanEnemy.cachedSeesPlayer;
  if (ghostSeesPlayer) {
    setDetection(state.detection + dt * (distance < 6 ? 22 : 7));
  } else if (!state.hidden) {
    setDetection(state.detection - dt * 5.8);
  }
  state.alert = state.detection > 70 ? 'HUNTING' : state.detection > 35 ? 'SUSPICIOUS' : 'UNNOTICED';
  if (!state.hidden && playerOnSecondFloor && (ghostSeesPlayer || state.detection > 70 || distance < 6.5)) {
    setWomanRoutedTarget(camera.position.x, camera.position.z, time, phasing || ghostSeesPlayer);
    womanEnemy.speed = phasing ? 6.4 : 4.1;
  } else if (!womanEnemy.target || time >= womanEnemy.repathAt || Math.hypot(womanEnemy.group.position.x - womanEnemy.target.x, womanEnemy.group.position.z - womanEnemy.target.z) < 0.7) {
    const recentTargets = womanEnemy.recentTargets || [];
    const roamNode = mansionNodes
      .filter((node) => Math.hypot(node.x - womanEnemy.group.position.x, node.z - womanEnemy.group.position.z) > 10)
      .filter((node) => !recentTargets.some((target) => Math.hypot(target.x - node.x, target.z - node.z) < 6))
      .sort(() => Math.random() - 0.5)[0]
      || nearestMansionNode(womanEnemy.group.position.x, womanEnemy.group.position.z, 8);
    if (roamNode) {
      womanEnemy.target = { x: roamNode.x, z: roamNode.z };
      womanEnemy.recentTargets = [...recentTargets, { x: roamNode.x, z: roamNode.z }].slice(-5);
    }
    womanEnemy.path = [];
    womanEnemy.repathAt = time + 5 + Math.random() * 4;
    womanEnemy.speed = phasing ? 4.8 : 2.5;
  }
  if (flashlightHit) {
    womanEnemy.speed *= distance <= 5 ? 0.2 : 0.5;
    setDetection(Math.max(state.detection - dt * 7, detectionFloor()));
  }
  if (womanEnemy.target) {
    if (womanEnemy.path?.length && Math.hypot(womanEnemy.group.position.x - womanEnemy.target.x, womanEnemy.group.position.z - womanEnemy.target.z) < 0.75) {
      womanEnemy.path.shift();
      if (womanEnemy.path.length) womanEnemy.target = womanEnemy.path[0];
    }
    const dx = womanEnemy.target.x - womanEnemy.group.position.x;
    const dz = womanEnemy.target.z - womanEnemy.group.position.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.05) {
      const step = womanEnemy.speed * dt;
      const prevX = womanEnemy.group.position.x;
      const prevZ = womanEnemy.group.position.z;
      const nx = womanEnemy.group.position.x + (dx / len) * step;
      const nz = womanEnemy.group.position.z + (dz / len) * step;
      if (phasing || canEnemyMoveIgnoringFurniture(nx, nz, 0.28)) {
        womanEnemy.group.position.x = nx;
        womanEnemy.group.position.z = nz;
      } else {
        const sideA = { x: dz / len, z: -dx / len };
        const sideB = { x: -dz / len, z: dx / len };
        const slide = [sideA, sideB].find((side) => canEnemyMoveIgnoringFurniture(womanEnemy.group.position.x + side.x * step, womanEnemy.group.position.z + side.z * step, 0.28));
        if (slide) {
          womanEnemy.group.position.x += slide.x * step;
          womanEnemy.group.position.z += slide.z * step;
        } else {
          setWomanRoutedTarget(camera.position.x, camera.position.z, time - 1, false);
          womanEnemy.repathAt = time + 0.35;
        }
      }
      const moveX = womanEnemy.group.position.x - prevX;
      const moveZ = womanEnemy.group.position.z - prevZ;
      if (Math.hypot(moveX, moveZ) > 0.001) {
        const moveYaw = Math.atan2(moveX, moveZ);
        womanEnemy.group.rotation.y = moveYaw;
      }
    }
  }
  womanEnemy.group.position.y = 0.28 + Math.sin(time * 2.2) * 0.11;
  if (!state.hidden && playerOnSecondFloor && ghostSeesPlayer && distance < (phasing ? 1.35 : 0.78)) startCaughtCutscene();
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
  const nearbyFakeOfuda = state.mapMode === 'mansion'
    ? fakeOfudaItems.find((item) => !item.collected && camera.position.distanceTo(item.group.position) < 2.15)
    : null;
  const activeBreaker = state.mapMode === 'mansion' && mansionBreakerPanel ? mansionBreakerPanel : breakerPanel;
  const activeShop = state.mapMode === 'mansion' && mansionShop ? mansionShop : shop;
  state.nearBreaker = horizontalDistance(camera.position, activeBreaker.position) < 2.35;
  state.nearShop = Boolean(activeShop && horizontalDistance(camera.position, activeShop) < 2.6);
  const actionPrefix = mobileInput.active ? '' : '[ E ] ';
  if (state.hidden) prompt = `${actionPrefix}ロッカーから出る`;
  else if (state.nearLocker) prompt = `${actionPrefix}ロッカーの中に隠れる`;
  else if (state.nearBreaker) prompt = state.breakerOn ? `${actionPrefix}ブレーカーをOFFにする` : `${actionPrefix}ブレーカーをONにする`;
  else if (state.nearShop) prompt = `${actionPrefix}ショップを開く`;
  else if (nearbyFakeOfuda) prompt = `${actionPrefix}お札を拾う`;
  else if (nearbyKey) prompt = state.mapMode === 'mansion'
    ? `${actionPrefix}お札を拾う（${state.keyCount} / ${REQUIRED_KEYS}）`
    : `${actionPrefix}鍵を拾う（${state.keyCount} / ${REQUIRED_KEYS}）`;
  else if (state.mapMode === 'mansion' && mansionExit && horizontalDistance(camera.position, mansionExit) < 3.8) {
    prompt = state.keyCount >= REQUIRED_KEYS
      ? `${actionPrefix}屋敷から出る`
      : `${actionPrefix}出口（お札 ${state.keyCount} / ${REQUIRED_KEYS}）`;
  }
  else if (state.mapMode !== 'mansion' && horizontalDistance(camera.position, exitDoor.position) < 3.6) {
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

const alertLabels = { UNNOTICED: '未発見', SUSPICIOUS: '警戒中', SUPER_ALERT: '超警戒', HUNTING: '追跡中' };
const movementLabels = { WALKING: '歩行', RUNNING: '走行', HIDING: '隠れている', SEATED: 'しりもち' };
function updateHUD() {
  syncUnlockUI();
  $('#noise-bar').style.width = `${state.noise}%`;
  $('#noise-value').textContent = String(Math.round(state.noise)).padStart(2, '0');
  $('#detect-bar').style.width = `${state.detection}%`;
  $('#detect-value').textContent = String(Math.round(state.detection)).padStart(2, '0');
  $('#alert-text').textContent = alertLabels[state.alert];
  $('#alert-text').parentElement.classList.toggle('danger', state.alert === 'HUNTING' || state.alert === 'SUPER_ALERT');
  $('#move-mode').textContent = movementLabels[state.hidden ? 'HIDING' : clock.elapsedTime < state.seatedUntil ? 'SEATED' : state.moveMode];
  $('#battery-value').textContent = `${Math.ceil(state.battery)}%`;
  $('#battery-bar').style.width = `${state.battery}%`;
  const hpBar = $('#hp-bar');
  if (hpBar) hpBar.style.width = `${state.hp}%`;
  const coinValue = $('#coin-value');
  if (coinValue) coinValue.textContent = String(state.coins);
  const breakerHud = $('#breaker-hud');
  const breakerValue = $('#breaker-value');
  if (breakerHud && breakerValue) {
    breakerHud.classList.toggle('off', !state.breakerOn);
    if (state.breakerOn) {
      const remaining = Math.max(0, state.breakerOutAt - clock.elapsedTime);
      const minutes = Math.floor(remaining / 60);
      const seconds = Math.floor(remaining % 60).toString().padStart(2, '0');
      breakerValue.textContent = `残り ${minutes}:${seconds}`;
    } else {
      breakerValue.textContent = 'OFF';
    }
  }
}

function updateLight(time) {
  updateSchoolLighting(time);
  if (time >= (updateLight.staticNextAt || 0)) {
    updateLight.staticNextAt = time + 0.25;
    const activeLightDistance = state.mapMode === 'mansion' ? 24 : 20;
    const activeLightDistanceSq = activeLightDistance * activeLightDistance;
    for (const light of schoolLights) {
      if (!light.isLight) continue;
      light.visible = light.position.distanceToSquared(camera.position) < activeLightDistanceSq
        && isPointInPlayerView(light.position.x, light.position.z, activeLightDistance + 4, Math.PI / 1.9);
    }
    if (breakerLight) breakerLight.visible = state.mapMode !== 'mansion' && breakerLight.position.distanceToSquared(camera.position) < 18 * 18;
    if (mansionBreakerLight) mansionBreakerLight.visible = state.mapMode === 'mansion' && mansionBreakerLight.position.distanceToSquared(camera.position) < 18 * 18;
  }
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
    const near = !item.collected && item.group.position.distanceToSquared(camera.position) < 20 * 20;
    const inView = near && isPointInPlayerView(item.group.position.x, item.group.position.z, 20, Math.PI / 2.3);
    item.group.visible = !item.collected && (state.mapMode !== 'mansion' || inView);
    item.light.visible = inView && item.group.position.distanceToSquared(camera.position) < 14 * 14;
    if (inView) {
      item.group.rotation.y = time * 0.9 + item.phase;
      item.group.position.y = item.baseY + Math.sin(time * 2 + item.phase) * 0.06;
    }
  }
  for (const item of fakeOfudaItems) {
    const near = state.mapMode === 'mansion' && !item.collected && item.group.position.distanceToSquared(camera.position) < 18 * 18;
    const inView = near && isPointInPlayerView(item.group.position.x, item.group.position.z, 18, Math.PI / 2.3);
    item.group.visible = inView;
    item.light.visible = inView && item.group.position.distanceToSquared(camera.position) < 13 * 13;
    if (inView) {
      item.group.rotation.y = time * 0.9 + item.phase;
      item.group.position.y = item.baseY + Math.sin(time * 2.1 + item.phase) * 0.06;
    }
  }
}

const minimap = $('#minimap');
const radar = minimap.getContext('2d');
const fullMapCanvas = $('#full-map-canvas');
const fullMapContext = fullMapCanvas?.getContext('2d');
function radarPoint(x, z, scale = 8.2) {
  return {
    x: minimap.width / 2 + (x - camera.position.x) * scale,
    y: minimap.height / 2 + (z - camera.position.z) * scale,
  };
}

function angleDelta(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function currentMapNodes() {
  return state.mapMode === 'mansion' ? mansionNodes : [...navNodes.values()];
}

function toggleFullMap(force = null) {
  if (force === false) {
    const wasOpen = state.fullMapOpen;
    state.fullMapOpen = false;
    $('#full-map-screen')?.classList.remove('visible');
    if (wasOpen) resumeGameplayPointerLock();
    return;
  }
  if (!state.started || state.loading || state.ended || state.caught || state.settingsOpen || state.shopOpen || state.breakerGameOpen) return;
  if (!state.hasFullMap) {
    showToast(state.shopPurchased?.map ? '全体マップはショップでONにすると使える' : '全体マップはショップで購入すると使える');
    return;
  }
  state.fullMapOpen = force === null ? !state.fullMapOpen : force;
  $('#full-map-screen')?.classList.toggle('visible', state.fullMapOpen);
  if (state.fullMapOpen) {
    clearMovementInput();
    if (controls.isLocked) controls.unlock();
    drawFullMap();
  } else {
    resumeGameplayPointerLock();
  }
}

function drawFullMap() {
  if (!fullMapContext || !fullMapCanvas) return;
  const ctx = fullMapContext;
  const nodes = currentMapNodes();
  ctx.clearRect(0, 0, fullMapCanvas.width, fullMapCanvas.height);
  ctx.fillStyle = '#020403';
  ctx.fillRect(0, 0, fullMapCanvas.width, fullMapCanvas.height);
  if (!nodes.length) return;
  const lockerSource = lockers.filter((locker) => state.mapMode === 'mansion' ? inMansionBounds(locker.x, locker.z) : !inMansionBounds(locker.x, locker.z));
  const xs = nodes.map((node) => node.x);
  const zs = nodes.map((node) => node.z);
  const minX = Math.min(...xs) - CELL * 1.2;
  const maxX = Math.max(...xs) + CELL * 1.2;
  const minZ = Math.min(...zs) - CELL * 1.2;
  const maxZ = Math.max(...zs) + CELL * 1.2;
  const scale = Math.min(
    (fullMapCanvas.width - 64) / Math.max(1, maxX - minX),
    (fullMapCanvas.height - 64) / Math.max(1, maxZ - minZ),
  );
  const mapWidth = (maxX - minX) * scale;
  const mapHeight = (maxZ - minZ) * scale;
  const mapOffsetX = (fullMapCanvas.width - mapWidth) / 2;
  const mapOffsetY = (fullMapCanvas.height - mapHeight) / 2;
  const toMap = (x, z) => ({
    x: mapOffsetX + (x - minX) * scale,
    y: mapOffsetY + (z - minZ) * scale,
  });
  ctx.fillStyle = '#0b0e0c';
  ctx.fillRect(24, 24, fullMapCanvas.width - 48, fullMapCanvas.height - 48);
  const cellSize = Math.max(5, CELL * scale * 0.92);
  const nodeKey = (x, z) => `${Math.round(x * 10) / 10},${Math.round(z * 10) / 10}`;
  const nodeSet = new Set(nodes.map((node) => nodeKey(node.x, node.z)));
  ctx.fillStyle = '#294236';
  for (const node of nodes) {
    const p = toMap(node.x, node.z);
    ctx.fillRect(p.x - cellSize / 2, p.y - cellSize / 2, cellSize, cellSize);
  }
  const wallSource = colliders.filter((collider) => collider.wall
    && (state.mapMode === 'mansion' ? inMansionBounds(collider.x, collider.z) : inSchoolBounds(collider.x, collider.z)));
  ctx.fillStyle = '#020202';
  for (const wall of wallSource) {
    const p = toMap(wall.x, wall.z);
    const width = Math.max(2.5, wall.hw * 2 * scale);
    const height = Math.max(2.5, wall.hz * 2 * scale);
    ctx.fillRect(p.x - width / 2, p.y - height / 2, width, height);
  }
  if (state.mapMode === 'school') {
    const wallThickness = Math.max(4, CELL * scale * 0.2);
    const drawWallRect = (worldX, worldZ, width, height) => {
      const p = toMap(worldX, worldZ);
      ctx.fillRect(p.x - width / 2, p.y - height / 2, width, height);
    };
    ctx.fillStyle = '#000000';
    for (const room of schoolRooms) {
      const doorZ = Math.round(room.sign.gz);
      const doorOnWest = room.sign.side === 'west';
      const doorOnEast = room.sign.side === 'east';
      for (let gz = room.gz0; gz <= room.gz1; gz += 1) {
        const west = worldFromGrid(room.gx0, gz);
        const east = worldFromGrid(room.gx1, gz);
        if (!(doorOnWest && gz === doorZ) && !isRoomOpening(room, 'west', gz)) drawWallRect(west.x - CELL / 2, west.z, wallThickness, CELL * scale);
        if (!(doorOnEast && gz === doorZ) && !isRoomOpening(room, 'east', gz)) drawWallRect(east.x + CELL / 2, east.z, wallThickness, CELL * scale);
      }
      for (let gx = room.gx0; gx <= room.gx1; gx += 1) {
        const north = worldFromGrid(gx, room.gz0);
        const south = worldFromGrid(gx, room.gz1);
        if (!isRoomOpening(room, 'north', gx)) drawWallRect(north.x, north.z - CELL / 2, CELL * scale, wallThickness);
        if (!isRoomOpening(room, 'south', gx)) drawWallRect(south.x, south.z + CELL / 2, CELL * scale, wallThickness);
      }
    }
  }
  ctx.strokeStyle = state.mapMode === 'school' ? '#020202' : '#789082';
  ctx.lineWidth = state.mapMode === 'school' ? Math.max(4, CELL * scale * 0.22) : Math.max(3, CELL * scale * 0.12);
  ctx.lineCap = 'square';
  for (const node of nodes) {
    const p = toMap(node.x, node.z);
    const half = cellSize / 2;
    for (const [dx, dz, ax, az, bx, bz] of [
      [CELL, 0, half, -half, half, half],
      [-CELL, 0, -half, -half, -half, half],
      [0, CELL, -half, half, half, half],
      [0, -CELL, -half, -half, half, -half],
    ]) {
      if (nodeSet.has(nodeKey(node.x + dx, node.z + dz))) continue;
      ctx.beginPath();
      ctx.moveTo(p.x + ax, p.y + az);
      ctx.lineTo(p.x + bx, p.y + bz);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(126,156,136,.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(24, 24, fullMapCanvas.width - 48, fullMapCanvas.height - 48);
  const drawMarker = (point, label, color, size = 9) => {
    if (!point) return;
    const p = toMap(point.x ?? point.position?.x, point.z ?? point.position?.z);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#071008';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#071008';
    ctx.font = `bold ${Math.max(10, size)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, p.y + 0.5);
    ctx.restore();
  };
  for (const locker of lockerSource) drawMarker(locker, 'L', '#9ba8b8', 6.5);
  const breakerMarker = state.mapMode === 'mansion' && mansionBreakerPanel
    ? { x: mansionBreakerPanel.position.x, z: mansionBreakerPanel.position.z }
    : { x: breakerPanel.position.x, z: breakerPanel.position.z };
  drawMarker(breakerMarker, 'ブ', '#76e695', 10);
  drawMarker(state.mapMode === 'mansion' && mansionShop ? mansionShop : shop, 'シ', '#84cfff', 10);
  drawMarker(state.mapMode === 'mansion' && mansionExit ? mansionExit : { x: exitDoor.position.x, z: exitDoor.position.z }, '出', '#ffe07a', 11);
  drawMarker({ x: camera.position.x, z: camera.position.z }, '自', '#ffffff', 9);
  ctx.fillStyle = '#c8d5ce';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(state.mapMode === 'mansion' ? '屋敷' : '学校', 34, 26);
}

function updateRadar(dt, time) {
  if (!state.started || state.loading) return;
  syncUnlockUI();
  if (state.mapMode === 'train') return;
  if (!state.hasRadar) return;
  radar.clearRect(0, 0, minimap.width, minimap.height);
  radar.fillStyle = 'rgba(3,9,6,.92)';
  radar.fillRect(0, 0, minimap.width, minimap.height);
  const centerX = minimap.width / 2;
  const centerY = minimap.height / 2;
  const radarRadius = Math.min(minimap.width, minimap.height) * 0.46;
  const worldRadius = 14;
  const scale = radarRadius / worldRadius;
  const sweep = time * 1.45;

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

  const drawUtilityMarker = (target, label, color) => {
    if (!target) return;
    const dx = target.x - camera.position.x;
    const dz = target.z - camera.position.z;
    const distance = Math.hypot(dx, dz);
    const clampedDistance = Math.min(distance, worldRadius);
    const angle = Math.atan2(dz, dx);
    const x = centerX + Math.cos(angle) * clampedDistance * scale;
    const y = centerY + Math.sin(angle) * clampedDistance * scale;
    const edge = distance > worldRadius;
    radar.save();
    radar.fillStyle = edge ? 'rgba(7,10,8,.78)' : color;
    radar.strokeStyle = color;
    radar.lineWidth = edge ? 2.2 : 1.2;
    radar.beginPath();
    radar.arc(x, y, edge ? 9 : 5.5, 0, Math.PI * 2);
    radar.fill();
    radar.stroke();
    radar.fillStyle = edge ? color : '#071008';
    radar.font = edge ? 'bold 13px sans-serif' : 'bold 9px sans-serif';
    radar.textAlign = 'center';
    radar.textBaseline = 'middle';
    radar.fillText(label, x, y + 0.5);
    radar.restore();
  };
  const breakerMarker = state.mapMode === 'mansion' && mansionBreakerPanel
    ? { x: mansionBreakerPanel.position.x, z: mansionBreakerPanel.position.z }
    : { x: breakerPanel.position.x, z: breakerPanel.position.z };
  const shopMarker = state.mapMode === 'mansion' && mansionShop ? mansionShop : shop;
  drawUtilityMarker(breakerMarker, 'ブ', '#8effa8');
  drawUtilityMarker(shopMarker, 'シ', '#8fd8ff');

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

  const activeEnemy = state.mapMode === 'mansion' ? womanEnemy.group : enemy;
  const enemyPoint = radarPoint(activeEnemy.position.x, activeEnemy.position.z, scale);
  const radarForward = new THREE.Vector3(0, 0, 1).applyQuaternion(activeEnemy.quaternion);
  const visionDirection = Math.atan2(radarForward.z, radarForward.x);
  const visionHalfAngle = state.mapMode === 'mansion' ? Math.PI / 4.2 : currentEnemyVisionHalfAngle();
  const visionDistance = state.mapMode === 'mansion' ? 13.5 : currentEnemyVisionDistance();
  const enemyStunnedOnRadar = state.mapMode === 'mansion' && time < womanEnemy.stunnedUntil;
  if (!enemyStunnedOnRadar) {
    radar.beginPath();
    radar.moveTo(enemyPoint.x, enemyPoint.y);
    for (let i = 0; i <= 14; i += 1) {
      const angle = visionDirection - visionHalfAngle + (visionHalfAngle * 2 * i) / 14;
      const point = radarPoint(
        activeEnemy.position.x + Math.cos(angle) * visionDistance,
        activeEnemy.position.z + Math.sin(angle) * visionDistance,
        scale,
      );
      radar.lineTo(point.x, point.y);
    }
    radar.closePath();
    radar.fillStyle = state.alert === 'HUNTING'
      ? 'rgba(239,65,52,.24)'
      : state.alert === 'SUPER_ALERT' ? 'rgba(239,132,52,.2)' : 'rgba(208,82,62,.12)';
    radar.fill();
    radar.strokeStyle = 'rgba(239,92,76,.38)';
    radar.lineWidth = 1;
    radar.stroke();
  }

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
let cullingAccumulator = 1;
let schoolEnemyAccumulator = 1;
let mansionEnemyAccumulator = 1;
let ghostEffectAccumulator = 1;
let perfSampleAccumulator = 0;
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
  const activeGameplay = state.started
    && !state.loading
    && !state.ended
    && !state.caught
    && !state.settingsOpen
    && !state.shopOpen
    && !state.fullMapOpen
    && !state.breakerGameOpen
    && controls.isLocked;
  if (activeGameplay) {
    highFpsSince = now;
    return;
  }
  const dropCooldown = activeGameplay ? 5200 : 2800;
  if (perfFps < 48 && now - lastResolutionAdjustAt > dropCooldown && resolutionTierIndex < RESOLUTION_TIERS.length - 1) {
    resolutionTierIndex += 1;
    dynamicResolutionScale = RESOLUTION_TIERS[resolutionTierIndex];
    lastResolutionAdjustAt = now;
    highFpsSince = now;
    applyRenderCap();
  } else if (!activeGameplay && perfFps > 57) {
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

function shouldUpdateSchoolEnemy(dt) {
  if (state.mapMode !== 'school') return false;
  const distance = Math.hypot(enemy.position.x - camera.position.x, enemy.position.z - camera.position.z);
  const urgent = state.alert === 'HUNTING' || state.detection > 55 || enemyData.mode === 'HUNTING' || distance < 20;
  const interval = urgent ? 0 : distance > 34 ? 0.65 : 0.22;
  if (interval <= 0) return true;
  schoolEnemyAccumulator += dt;
  if (schoolEnemyAccumulator < interval) return false;
  schoolEnemyAccumulator = 0;
  return true;
}

function shouldUpdateMansionEnemy(dt) {
  return state.mapMode === 'mansion';
}

function shouldUpdateGhostEffects(dt) {
  if (state.mapMode !== 'mansion') return false;
  const activeIllusion = ghostIllusions.some((illusion) => illusion.active);
  const urgent = ghostDouble.active || activeIllusion || state.ghostIllusionQueue > 0 || state.ghostStunCount >= 2;
  const interval = urgent ? 0 : 0.75;
  if (interval <= 0) return true;
  ghostEffectAccumulator += dt;
  if (ghostEffectAccumulator < interval) return false;
  ghostEffectAccumulator = 0;
  return true;
}

function recordPerformanceSnapshot() {
  const info = renderer.info;
  const snapshot = {
    fps: perfFps,
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    points: info.render.points,
    lines: info.render.lines,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    resolution: renderer.domElement.dataset.renderCap || '',
    map: state.mapMode,
    time: Math.round(clock.elapsedTime),
  };
  try {
    localStorage.setItem('it-hears-you-last-perf', JSON.stringify(snapshot));
  } catch {
    // Ignore storage errors; this is diagnostic only.
  }
  window.__IT_HEARS_YOU_PERF__ = snapshot;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  const time = clock.elapsedTime;
  if (state.loading) {
    renderer.render(scene, camera);
    return;
  }
  if (state.caught) {
    updateCaughtCutscene(time);
  } else if (state.started && !state.ended && !state.settingsOpen && !state.shopOpen && !state.fullMapOpen && !state.breakerGameOpen) {
    updateSonarRoar(time);
    updatePlayer(dt);
    updateLockerView();
    updateDarumaStage(dt, time);
    if (shouldUpdateSchoolEnemy(dt)) updateEnemy(dt, time);
    if (shouldUpdateMansionEnemy(dt)) updateWomanEnemy(dt, time);
    if (shouldUpdateGhostEffects(dt)) {
      updateGhostDouble(dt, time);
      updateGhostIllusions(dt, time);
    }
    if (state.mapMode !== 'train') {
      updateAmbientMovementSuspicion(dt);
      updateNoiseTraps(dt, time);
      updateHealItems(dt, time);
      updateCoins(dt, time);
      updateSonarModel(dt, time);
    }
    if (time >= nextVisionUpdate) {
      if (state.mapMode !== 'train') updateEnemyVision();
      nextVisionUpdate = time + (state.mapMode === 'mansion' ? 0.5 : 1 / 12);
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
    cullingAccumulator += dt;
    if (cullingAccumulator >= 0.25) {
      if (state.mapMode !== 'train') {
        updateSchoolDistanceCulling();
        updateMansionDistanceCulling();
      }
      cullingAccumulator = 0;
    }
    updateAudio(time);
  }
  radarAccumulator += dt;
  if (radarAccumulator >= 0.25) {
    updateRadar(radarAccumulator, time);
    radarAccumulator = 0;
  }
  if (state.fullMapOpen) drawFullMap();
  updateScreenShake(time);
  updateScreenFlash(time);
  updateEyeScare(time);
  renderer.render(scene, camera);
  perfFrames += 1;
  const now = performance.now();
  if (now - perfLast >= 500) {
    perfFps = Math.round((perfFrames * 1000) / (now - perfLast));
    perfFrames = 0;
    perfLast = now;
    adjustDynamicResolution(now);
  }
  perfSampleAccumulator += dt;
  if (perfSampleAccumulator >= 5) {
    recordPerformanceSnapshot();
    perfSampleAccumulator = 0;
  }
}

chooseRandomEnemyRoute();
animate();

let resizeApplyTimer = 0;
function scheduleRenderCapUpdate() {
  clearTimeout(resizeApplyTimer);
  resizeApplyTimer = setTimeout(applyRenderCap, touchDevice ? 180 : 0);
}
addEventListener('resize', scheduleRenderCapUpdate);
addEventListener('orientationchange', () => setTimeout(applyRenderCap, 320));
window.visualViewport?.addEventListener('resize', scheduleRenderCapUpdate);
