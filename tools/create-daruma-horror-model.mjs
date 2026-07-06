import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.FileReader ??= class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    }).catch((error) => {
      this.error = error;
      this.onerror?.(error);
      this.onloadend?.();
    });
  }
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'models');
const outPath = path.join(outDir, 'daruma_horror_preview.glb');

const scene = new THREE.Scene();

const redMat = new THREE.MeshStandardMaterial({
  color: 0x8b0705,
  roughness: 0.84,
  metalness: 0.02,
  emissive: 0x190000,
  emissiveIntensity: 0.08,
});
const darkRedMat = new THREE.MeshStandardMaterial({
  color: 0x260101,
  roughness: 0.92,
  metalness: 0,
});
const blackMat = new THREE.MeshStandardMaterial({
  color: 0x030101,
  roughness: 0.78,
  metalness: 0.02,
});
const faceMat = new THREE.MeshStandardMaterial({
  color: 0xc6a07d,
  roughness: 0.96,
  metalness: 0,
});
const dirtMat = new THREE.MeshStandardMaterial({
  color: 0x4b2a16,
  roughness: 1,
  metalness: 0,
});
const goldMat = new THREE.MeshStandardMaterial({
  color: 0x8d681e,
  roughness: 0.82,
  metalness: 0.08,
  emissive: 0x130900,
  emissiveIntensity: 0.08,
});

const rootGroup = new THREE.Group();
rootGroup.name = 'DARUMA_HORROR_PREVIEW';
scene.add(rootGroup);

function mesh(geometry, material, name, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.set(...position);
  object.scale.set(...scale);
  object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  rootGroup.add(object);
  return object;
}

function addPlane(name, material, x, y, z, w, h, rot = [0, 0, 0]) {
  return mesh(new THREE.PlaneGeometry(w, h, 1, 1), material, name, [x, y, z], [1, 1, 1], rot);
}

function roundedRectGeometry(width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return new THREE.ShapeGeometry(shape, 32);
}

// Heavy oval Daruma shell: tall, weathered, and slightly asymmetric.
const body = mesh(new THREE.SphereGeometry(1.42, 96, 64), redMat, 'scarred_red_lacquer_body', [0, 1.22, 0], [1.04, 1.2, 0.92]);
const lowerMass = mesh(new THREE.SphereGeometry(1.22, 80, 48), redMat, 'heavy_lower_lacquer_mass', [0, 0.78, 0.03], [1.08, 0.78, 0.9]);
mesh(roundedRectGeometry(2.26, 0.98, 0.22), darkRedMat, 'deep_shadow_face_recess', [0, 1.72, 1.36]);
mesh(roundedRectGeometry(2.02, 0.78, 0.17), faceMat, 'flat_old_paper_face_panel', [0, 1.72, 1.39]);

// Eyes: no cute highlight, just deep black glossy holes.
for (const sx of [-0.37, 0.37]) {
  mesh(new THREE.SphereGeometry(0.19, 48, 28), blackMat, `dead_black_eye_${sx < 0 ? 'L' : 'R'}`, [sx, 1.79, 1.48], [1.08, 1.26, 0.12]);
  mesh(new THREE.TorusGeometry(0.205, 0.018, 12, 60), dirtMat, `dirty_sunken_eye_rim_${sx < 0 ? 'L' : 'R'}`, [sx, 1.79, 1.465], [1.08, 1.24, 0.05]);
}

// Nose curls and mouth are flat brush strokes, not protruding red lumps.
for (const sx of [-1, 1]) {
  const nose = mesh(new THREE.TorusGeometry(0.105, 0.012, 8, 42, Math.PI * 1.05), darkRedMat, `flat_blood_red_nose_curl_${sx < 0 ? 'L' : 'R'}`, [sx * 0.13, 1.58, 1.49], [0.9, 0.95, 0.035], [0, 0, sx * -0.85]);
  nose.material = nose.material.clone();
  nose.material.color.setHex(0x8b0807);
}
mesh(new THREE.BoxGeometry(0.43, 0.025, 0.012), blackMat, 'thin_hard_downturned_mouth', [0, 1.47, 1.505], [1, 1, 1], [0, 0, -0.025]);

// Sharp black brush decorations around eyes and cheeks.
for (const sx of [-1, 1]) {
  for (let i = 0; i < 7; i += 1) {
    addPlane(
      `upper_black_brush_${sx < 0 ? 'L' : 'R'}_${i}`,
      blackMat,
      sx * (0.34 + i * 0.045),
      2.02 - i * 0.018,
      1.5,
      0.26 - i * 0.014,
      0.035,
      [0, 0, sx * (0.34 + i * 0.055)],
    );
  }
  for (let i = 0; i < 6; i += 1) {
    addPlane(
      `cheek_black_brush_${sx < 0 ? 'L' : 'R'}_${i}`,
      blackMat,
      sx * (0.48 + i * 0.052),
      1.48 + i * 0.013,
      1.5,
      0.32 - i * 0.02,
      0.042,
      [0, 0, sx * (-0.22 + i * 0.045)],
    );
  }
}

// Gold weathered body marks from the reference.
for (const sx of [-1, 1]) {
  for (let i = 0; i < 5; i += 1) {
    mesh(
      new THREE.CapsuleGeometry(0.035, 0.58 - i * 0.035, 8, 18),
      goldMat,
      `aged_gold_side_mark_${sx < 0 ? 'L' : 'R'}_${i}`,
      [sx * (0.62 + i * 0.13), 0.72 + i * 0.06, 1.16 - i * 0.035],
      [1, 1, 0.08],
      [0.04, 0, sx * (0.25 + i * 0.055)],
    );
  }
}
for (let i = 0; i < 3; i += 1) {
  mesh(new THREE.CapsuleGeometry(0.055, 0.34, 8, 18), goldMat, `aged_gold_bottom_drop_${i}`, [-0.24 + i * 0.24, 0.28, 1.16], [1, 1, 0.08], [0, 0, 0]);
}

// Scratches, chips, and grime: small geometry decals for a non-cute horror finish.
const scratchMat = new THREE.MeshStandardMaterial({ color: 0x180403, roughness: 1, metalness: 0 });
for (let i = 0; i < 90; i += 1) {
  const x = (Math.random() - 0.5) * 2.05;
  const y = 0.35 + Math.random() * 2.15;
  const z = 1.2 + Math.random() * 0.035;
  const len = 0.035 + Math.random() * 0.18;
  const thin = 0.005 + Math.random() * 0.011;
  addPlane(`random_lacquer_scratch_${i}`, scratchMat, x, y, z, len, thin, [0, 0, Math.random() * Math.PI]);
}
for (let i = 0; i < 26; i += 1) {
  mesh(
    new THREE.SphereGeometry(0.018 + Math.random() * 0.035, 10, 6),
    dirtMat,
    `face_stain_or_chip_${i}`,
    [(Math.random() - 0.5) * 1.45, 1.42 + Math.random() * 0.58, 1.52],
    [1, 0.55, 0.08],
  );
}

// Flatten the base so it feels like a heavy object, not a toy ball.
mesh(new THREE.CylinderGeometry(1.12, 1.22, 0.12, 96), darkRedMat, 'flat_heavy_blackened_base', [0, 0.18, 0], [1, 1, 0.9]);

rootGroup.scale.setScalar(1.18);

await fs.mkdir(outDir, { recursive: true });

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(scene, {
  binary: true,
  trs: false,
  onlyVisible: true,
  truncateDrawRange: true,
});
await fs.writeFile(outPath, Buffer.from(result));
console.log(`Wrote ${outPath}`);
