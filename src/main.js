import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const $ = (selector) => document.querySelector(selector);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b08);
scene.fog = new THREE.FogExp2(0x0a0e0a, 0.018);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 110);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
$('#game').append(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = 0.45;

const state = {
  started: false,
  ended: false,
  hidden: false,
  key: false,
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
  settingsOpen: false,
  allowExit: false,
  bob: 0,
};

const keys = {};
const colliders = [];
const wallMeshes = [];
const lockers = [];
const soundEvents = [];
const CELL = 4;
const GRID_W = 9;
const GRID_H = 15;
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
  return new THREE.Vector3((gx - 4) * CELL, 0, (gz - 7) * CELL);
}

function gridKey(gx, gz) {
  return `${gx},${gz}`;
}

function carve(gx, gz) {
  if (gx >= 0 && gx < GRID_W && gz >= 0 && gz < GRID_H) walkable.add(gridKey(gx, gz));
}

// Central spine plus three cross-corridors and two side spines = four looping routes.
for (let gz = 0; gz < GRID_H; gz += 1) carve(4, gz);
for (let gz = 2; gz <= 12; gz += 1) {
  carve(1, gz);
  carve(7, gz);
}
for (const gz of [2, 7, 12]) for (let gx = 1; gx <= 7; gx += 1) carve(gx, gz);

function addBox(x, y, z, w, h, d, mat, collide = false, wall = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collide) colliders.push({ x, z, hw: w / 2, hz: d / 2 });
  if (wall) wallMeshes.push(mesh);
  return mesh;
}

const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

for (const key of walkable) {
  const [gx, gz] = key.split(',').map(Number);
  const pos = worldFromGrid(gx, gz);
  navNodes.set(key, { key, gx, gz, x: pos.x, z: pos.z });
  addBox(pos.x, -0.12, pos.z, CELL + 0.04, 0.25, CELL + 0.04, floorMat);
  addBox(pos.x, 4.25, pos.z, CELL + 0.05, 0.18, CELL + 0.05, ceilingMat);

  for (const [dx, dz] of directions) {
    if (walkable.has(gridKey(gx + dx, gz + dz))) continue;
    if (dx !== 0) addBox(pos.x + dx * CELL / 2, 2.05, pos.z, 0.18, 4.2, CELL + 0.18, wallMat, true, true);
    else addBox(pos.x, 2.05, pos.z + dz * CELL / 2, CELL + 0.18, 4.2, 0.18, wallMat, true, true);
  }

  if ((gx * 5 + gz * 3) % 7 === 0) {
    const fixture = addBox(pos.x, 4.08, pos.z, 1.25, 0.08, 0.28, material(0xb8c3a1, 0.28));
    fixture.material.emissive = new THREE.Color(0x68745d);
    fixture.material.emissiveIntensity = 1.4;
    const light = new THREE.PointLight(0xc2cbaa, 10, 12, 1.65);
    light.position.set(pos.x, 3.82, pos.z);
    scene.add(light);
  }
}

scene.add(new THREE.HemisphereLight(0x78877a, 0x111511, 0.54));
scene.add(new THREE.AmbientLight(0x354139, 0.38));

function localBox(group, x, y, z, w, h, d, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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
makeLocker(7, 5, 'east');
makeLocker(1, 10, 'west');
makeLocker(7, 9, 'east');
makeLocker(4, 5, 'east');
makeLocker(4, 10, 'west');

// Exit door at the north end of the maze.
const exitDoor = addBox(0, 1.45, -29.84, 2.15, 2.9, 0.14, material(0x303a33, 0.48, 0.6));
addBox(0, 3.45, -29.68, 1.2, 0.36, 0.08, material(0x1d6243, 0.35));
const exitLight = new THREE.PointLight(0x3acb88, 4.5, 5);
exitLight.position.set(0, 3.4, -28.7);
scene.add(exitLight);

// Key is placed at a different side-route location every playthrough.
const keyCandidates = [
  [1, 3], [1, 6], [1, 9], [1, 11],
  [7, 3], [7, 6], [7, 8], [7, 11],
  [2, 2], [6, 7], [2, 12], [6, 12],
];
const [keyGX, keyGZ] = keyCandidates[Math.floor(Math.random() * keyCandidates.length)];
const keySpawn = worldFromGrid(keyGX, keyGZ);
const keyGroup = new THREE.Group();
const keyMat = material(0xc2a44e, 0.25, 0.85);
const keyRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 18), keyMat);
keyRing.rotation.x = Math.PI / 2;
keyGroup.add(keyRing);
const keyStem = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.35), keyMat);
keyStem.position.z = 0.24;
keyGroup.add(keyStem);
const keyTooth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.06), keyMat);
keyTooth.position.set(0.04, 0, 0.4);
keyGroup.add(keyTooth);
keyGroup.position.set(keySpawn.x + 0.6, 1.05, keySpawn.z);
scene.add(keyGroup);
const keyLight = new THREE.PointLight(0xe2c466, 1.25, 2.5);
keyLight.position.copy(keyGroup.position);
scene.add(keyLight);

// Enemy silhouette.
const enemy = new THREE.Group();
const enemyBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.15, 7, 10), material(0x101411, 0.8));
enemyBody.position.y = 1.05;
enemyBody.castShadow = true;
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

// Flashlight.
const flashlight = new THREE.SpotLight(0xf4f1dc, 56, 25, Math.PI / 9, 0.48, 1.35);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(512, 512);
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
function initAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.ratio.value = 5;
  compressor.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = 0.72;
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

function emitPlayerSound(strength) {
  const hearingRadius = (3.5 + strength * 0.2) * (1 + enemyData.alertMemory * 0.28);
  const event = { x: camera.position.x, z: camera.position.z, strength, hearingRadius, age: 0, life: 2.4 };
  soundEvents.push(event);
  const distance = Math.hypot(enemy.position.x - event.x, enemy.position.z - event.z);
  if (distance <= hearingRadius) {
    const now = clock.elapsedTime;
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
    if (state.alert === 'HUNTING') {
      setEnemyDestination(event.x, event.z, 'HUNTING');
      return;
    }
    const firstReaction = enemyData.mode !== 'INVESTIGATING';
    setEnemyDestination(event.x, event.z, 'INVESTIGATING');
    enemyData.investigateUntil = now + 3.5 + strength * 0.025;
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
      ? { volume: 0.72, pitch: 1.2, interval: 0.27 }
      : { volume: 0.46, pitch: 1, interval: 0.44 };
    playFootstep(settings.volume, settings.pitch, 0);
    emitPlayerSound(state.noise);
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
    playFootstep(volume, 0.62, pan);
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
  if (x < -17.8 || x > 17.8 || z < -29.8 || z > 29.8) return false;
  return !colliders.some((collider) =>
    Math.abs(x - collider.x) < collider.hw + 0.26 && Math.abs(z - collider.z) < collider.hz + 0.26);
}

function hasLineOfSight(from, to) {
  const distance = from.distanceTo(to);
  const steps = Math.ceil(distance / 0.3);
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = THREE.MathUtils.lerp(from.x, to.x, t);
    const z = THREE.MathUtils.lerp(from.z, to.z, t);
    if (colliders.some((c) => Math.abs(x - c.x) < c.hw + 0.04 && Math.abs(z - c.z) < c.hz + 0.04)) return false;
  }
  return true;
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
  document.body.classList.remove('hidden-in-locker');
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
  if (!state.key && camera.position.distanceTo(keyGroup.position) < 1.8) {
    state.key = true;
    keyGroup.visible = false;
    keyLight.visible = false;
    $('#objective-text').textContent = '出口へ向かう';
    showToast('古びた鍵を手に入れた');
    return;
  }
  if (camera.position.distanceTo(exitDoor.position) < 2.5) {
    if (state.key) endGame(true);
    else showToast('鍵がかかっている');
  }
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
  if (state.started && !state.ended) lockPointer();
}

function lockPointer() {
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

$('#settings-button').addEventListener('click', openSettings);
$('#settings-close').addEventListener('click', closeSettings);
$('#settings-quit').addEventListener('click', () => {
  state.allowExit = true;
  location.reload();
});
controls.addEventListener('unlock', () => {
  if (state.started && !state.ended && !state.settingsOpen) openSettings();
});
$('#start-button').addEventListener('click', () => {
  state.started = true;
  initAudio();
  $('#start-screen').classList.remove('visible');
  lockPointer();
});
$('#restart-button').addEventListener('click', () => {
  state.allowExit = true;
  location.reload();
});
renderer.domElement.addEventListener('click', () => {
  if (state.started && !state.ended && !state.settingsOpen && !controls.isLocked) lockPointer();
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

const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const toPlayer = new THREE.Vector3();
const playerStart = worldFromGrid(4, 14);
camera.position.set(playerStart.x, 1.68, playerStart.z);

function updatePlayer(dt) {
  if (!controls.isLocked || state.hidden) return;
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();
  move.set(0, 0, 0);
  if (keys.KeyW) move.add(forward);
  if (keys.KeyS) move.sub(forward);
  if (keys.KeyD) move.add(right);
  if (keys.KeyA) move.sub(right);
  const active = move.lengthSq() > 0;
  if (active) move.normalize();
  const running = keys.ShiftLeft || keys.ShiftRight;
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
  const inside = state.currentLocker.group.localToWorld(new THREE.Vector3(0, 0.12, 0.39));
  camera.position.copy(inside);
  camera.rotation.y = state.lockerFrontYaw + state.lockerLookOffset;
  camera.rotation.x = 0;
  camera.rotation.z = 0;
}

function updateEnemy(dt, time) {
  if (state.ended) return;
  const distance = enemy.position.distanceTo(camera.position);
  const enemyEye = enemy.position.clone().add(new THREE.Vector3(0, 1.7, 0));
  const playerEye = camera.position.clone();
  toPlayer.subVectors(playerEye, enemyEye);
  toPlayer.y = 0;
  const enemyForward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.quaternion);
  const facing = enemyForward.dot(toPlayer.clone().normalize());
  const visible = !state.hidden && distance < 10.5 && facing > 0.32 && hasLineOfSight(enemyEye, playerEye);

  if (visible) {
    state.detection += (13 - distance) * 13 * (1 + enemyData.alertMemory * 0.45) * dt;
    if (time - enemyData.lastMemoryGainAt > 2.4) {
      enemyData.alertMemory = THREE.MathUtils.clamp(enemyData.alertMemory + 0.06, 0, 1);
      enemyData.lastMemoryGainAt = time;
    }
  } else {
    const baseCalmRate = enemyData.mode === 'INVESTIGATING' ? 2.3 : 4.5;
    const calmRate = Math.max(0.65, baseCalmRate * (1 - enemyData.alertMemory * 0.82));
    state.detection -= calmRate * dt;
  }
  enemyData.alertMemory = Math.max(0, enemyData.alertMemory - dt * 0.0025);
  if (!state.hidden && distance < 1.8) state.detection += 90 * dt;
  state.detection = THREE.MathUtils.clamp(state.detection, 0, 100);

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
  } else {
    if (enemyData.mode !== 'ROAMING') {
      enemyData.mode = 'ROAMING';
      enemyData.path = [];
    }
    state.alert = state.detection > 25 ? 'SUSPICIOUS' : 'UNNOTICED';
    enemyData.speed = state.alert === 'SUSPICIOUS' ? 2.75 : 1.3;
  }

  enemyData.isMoving = false;
  if (enemyData.path.length === 0) chooseRandomEnemyRoute();
  const target = enemyData.path[0];
  if (target && time >= enemyData.pauseUntil) {
    const direction = new THREE.Vector3(target.x - enemy.position.x, 0, target.z - enemy.position.z);
    if (direction.length() < 0.18) enemyData.path.shift();
    else {
      direction.normalize();
      enemy.position.addScaledVector(direction, enemyData.speed * dt);
      enemy.rotation.y = Math.atan2(direction.x, direction.z);
      enemyData.isMoving = true;
    }
  }
  enemy.position.y = enemyData.isMoving ? Math.abs(Math.sin(time * (enemyData.speed > 2 ? 5.5 : 3.5))) * 0.035 : 0;

  $('#danger-flash').style.opacity = state.alert === 'HUNTING'
    ? String(0.13 + Math.sin(time * 7) * 0.07)
    : state.hidden && distance < 6 ? String(0.05 + Math.sin(time * 4) * 0.025) : '0';
  if (distance < 0.82 && !state.hidden) endGame(false);
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
  if (state.hidden) prompt = '[ E ] ロッカーから出る';
  else if (state.nearLocker) prompt = '[ E ] ロッカーの中に隠れる';
  else if (!state.key && camera.position.distanceTo(keyGroup.position) < 1.8) prompt = '[ E ] 鍵を拾う';
  else if (camera.position.distanceTo(exitDoor.position) < 2.5) prompt = state.key ? '[ E ] 鍵を使って脱出' : '[ E ] 扉を調べる';
  $('#prompt').textContent = prompt;
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
  flashlight.visible = state.flashlight && !state.hidden;
  fillLight.visible = flashlight.visible;
  lockerViewLight.visible = state.hidden;
  lockerViewLight.position.copy(camera.position);
  camera.getWorldDirection(forward);
  lockerViewLight.target.position.copy(camera.position).addScaledVector(forward, 5);
  flashlight.position.copy(camera.position).addScaledVector(forward, 0.12);
  flashlight.target.position.copy(camera.position).addScaledVector(forward, 8);
  fillLight.position.copy(camera.position);
  flashlight.intensity = (Math.random() < 0.006 ? 12 : 56) * (state.battery < 15 ? 0.55 + Math.sin(time * 17) * 0.35 : 1);
  keyGroup.rotation.y = time * 0.9;
  keyGroup.position.y = 1.05 + Math.sin(time * 2) * 0.06;
}

const minimap = $('#minimap');
const radar = minimap.getContext('2d');
function radarPoint(x, z) {
  return {
    x: ((x + 18) / 36) * minimap.width,
    y: ((z + 30) / 60) * minimap.height,
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
  for (const node of navNodes.values()) {
    const p = radarPoint(node.x, node.z);
    radar.fillRect(p.x - 9.5, p.y - 5.5, 19, 11);
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

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  const time = clock.elapsedTime;
  if (state.started && !state.ended && !state.settingsOpen) {
    updatePlayer(dt);
    updateLockerView();
    updateEnemy(dt, time);
    updateInteraction();
    updateHUD();
    updateLight(time);
    updateAudio(time);
    updateRadar(dt, time);
  } else updateRadar(dt, time);
  renderer.render(scene, camera);
}

chooseRandomEnemyRoute();
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
