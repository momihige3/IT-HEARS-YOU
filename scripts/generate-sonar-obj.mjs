import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('public/models');
fs.mkdirSync(outDir, { recursive: true });

let vertices = [];
let faces = [];
let lines = ['# IT HEARS YOU - external SONAR creature model', '# generated from reference proportions', 's 1'];

function v(x, y, z) {
  vertices.push([x, y, z]);
  return vertices.length;
}

function begin(name) {
  lines.push(`o ${name}`);
  lines.push(`g ${name}`);
}

function flush() {
  for (const [x, y, z] of vertices) lines.push(`v ${x.toFixed(5)} ${y.toFixed(5)} ${z.toFixed(5)}`);
  for (const f of faces) lines.push(`f ${f.join(' ')}`);
  vertices = [];
  faces = [];
}

function rotate([x, y, z], [rx, ry, rz]) {
  let cy = Math.cos(rx), sy = Math.sin(rx);
  [y, z] = [y * cy - z * sy, y * sy + z * cy];
  cy = Math.cos(ry); sy = Math.sin(ry);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  cy = Math.cos(rz); sy = Math.sin(rz);
  [x, y] = [x * cy - y * sy, x * sy + y * cy];
  return [x, y, z];
}

function ellipsoid(name, center, scale, seg = 28, rings = 18, rot = [0, 0, 0], deform = 0.025) {
  begin(name);
  const ids = [];
  for (let r = 0; r <= rings; r += 1) {
    const phi = -Math.PI / 2 + (Math.PI * r) / rings;
    const row = [];
    for (let s = 0; s <= seg; s += 1) {
      const theta = (Math.PI * 2 * s) / seg;
      let x = Math.cos(phi) * Math.cos(theta);
      let y = Math.sin(phi);
      let z = Math.cos(phi) * Math.sin(theta);
      const wrinkle = 1 + deform * (Math.sin(theta * 5 + r * 0.7) + Math.sin(phi * 9 + s * 0.21));
      [x, y, z] = rotate([x * scale[0] * wrinkle, y * scale[1] * wrinkle, z * scale[2] * wrinkle], rot);
      row.push(v(center[0] + x, center[1] + y, center[2] + z));
    }
    ids.push(row);
  }
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < seg; s += 1) faces.push([ids[r][s], ids[r + 1][s], ids[r + 1][s + 1], ids[r][s + 1]]);
  }
  flush();
}

function cylinderBetween(name, a, b, ra, rb, seg = 18, wobble = 0.02) {
  begin(name);
  const ax = a[0], ay = a[1], az = a[2];
  const bx = b[0], by = b[1], bz = b[2];
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 1;
  const dir = [dx / len, dy / len, dz / len];
  const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let ux = up[1] * dir[2] - up[2] * dir[1];
  let uy = up[2] * dir[0] - up[0] * dir[2];
  let uz = up[0] * dir[1] - up[1] * dir[0];
  const uLen = Math.hypot(ux, uy, uz) || 1;
  ux /= uLen; uy /= uLen; uz /= uLen;
  const vx = dir[1] * uz - dir[2] * uy;
  const vy = dir[2] * ux - dir[0] * uz;
  const vz = dir[0] * uy - dir[1] * ux;
  const rows = 7;
  const ids = [];
  for (let r = 0; r <= rows; r += 1) {
    const t = r / rows;
    const row = [];
    const radius = ra * (1 - t) + rb * t;
    const cx = ax * (1 - t) + bx * t;
    const cy = ay * (1 - t) + by * t;
    const cz = az * (1 - t) + bz * t;
    for (let s = 0; s <= seg; s += 1) {
      const th = (Math.PI * 2 * s) / seg;
      const w = 1 + Math.sin(t * 9 + th * 3) * wobble;
      row.push(v(cx + (ux * Math.cos(th) + vx * Math.sin(th)) * radius * w, cy + (uy * Math.cos(th) + vy * Math.sin(th)) * radius * w, cz + (uz * Math.cos(th) + vz * Math.sin(th)) * radius * w));
    }
    ids.push(row);
  }
  for (let r = 0; r < rows; r += 1) {
    for (let s = 0; s < seg; s += 1) faces.push([ids[r][s], ids[r + 1][s], ids[r + 1][s + 1], ids[r][s + 1]]);
  }
  flush();
}

function ear(name, side) {
  begin(name);
  const rows = 9, cols = 18;
  const ids = [];
  for (let r = 0; r <= rows; r += 1) {
    const y = -0.46 + (0.92 * r) / rows;
    const half = Math.sin((r / rows) * Math.PI) * 0.55;
    const row = [];
    for (let c = 0; c <= cols; c += 1) {
      const t = -1 + (2 * c) / cols;
      const x = side * (0.34 + half * Math.abs(t));
      const z = 0.05 + Math.cos(t * Math.PI / 2) * 0.08 - Math.abs(t) * 0.05;
      const curl = side * t * 0.1;
      row.push(v(x + curl, 2.34 + y, z - 0.04 * Math.abs(t)));
    }
    ids.push(row);
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) faces.push([ids[r][c], ids[r + 1][c], ids[r + 1][c + 1], ids[r][c + 1]]);
  }
  flush();
}

function cone(name, base, tip, radius, seg = 12) {
  begin(name);
  const tipId = v(...tip);
  const centerId = v(...base);
  const ids = [];
  for (let s = 0; s <= seg; s += 1) {
    const th = (Math.PI * 2 * s) / seg;
    ids.push(v(base[0] + Math.cos(th) * radius, base[1], base[2] + Math.sin(th) * radius));
  }
  for (let s = 0; s < seg; s += 1) {
    faces.push([tipId, ids[s], ids[s + 1]]);
    faces.push([centerId, ids[s + 1], ids[s]]);
  }
  flush();
}

// Main body proportions: tall, thin, wet black humanoid, roughly 2.4m scale in local units.
ellipsoid('skin_torso_long_wet', [0, 1.18, 0], [0.22, 0.78, 0.16], 36, 22);
ellipsoid('skin_chest_sunken', [0, 1.62, 0.06], [0.26, 0.34, 0.12], 36, 18);
ellipsoid('skin_pelvis_bony', [0, 0.43, -0.02], [0.2, 0.18, 0.15], 28, 14);
ellipsoid('skin_head_eyeless', [0, 2.32, 0.04], [0.18, 0.27, 0.15], 36, 20);
ellipsoid('face_black_smooth_plate', [0, 2.34, 0.18], [0.13, 0.18, 0.035], 28, 16);
ear('ear_left_huge_membrane', -1);
ear('ear_right_huge_membrane', 1);

// Vertical open maw from mouth through torso.
cylinderBetween('mouth_left_wet_rim', [-0.06, 2.1, 0.28], [-0.08, 0.78, 0.25], 0.025, 0.018, 14);
cylinderBetween('mouth_right_wet_rim', [0.06, 2.1, 0.28], [0.08, 0.78, 0.25], 0.025, 0.018, 14);
cylinderBetween('mouth_dark_split_core', [0, 2.08, 0.295], [0, 0.72, 0.29], 0.045, 0.03, 16);
for (let i = 0; i < 14; i += 1) cone(`tooth_maw_${i}`, [(i % 2 ? -0.055 : 0.055), 1.95 - i * 0.085, 0.34], [0, 1.9 - i * 0.085, 0.305], 0.012, 8);

// Back bones, ribs, and tendons.
cylinderBetween('spine_exposed_back', [0, 2.05, -0.24], [0, 0.58, -0.28], 0.035, 0.024, 14);
for (let i = 0; i < 11; i += 1) ellipsoid(`skin_back_vertebra_${i}`, [0, 0.68 + i * 0.14, -0.34], [0.05, 0.035, 0.025], 14, 8);
for (let i = 0; i < 8; i += 1) {
  const y = 1.02 + i * 0.12;
  cylinderBetween(`rib_left_${i}`, [-0.03, y, 0.05], [-0.28 + i * 0.01, y + 0.02, 0.02], 0.012, 0.009, 8);
  cylinderBetween(`rib_right_${i}`, [0.03, y, 0.05], [0.28 - i * 0.01, y + 0.02, 0.02], 0.012, 0.009, 8);
}

for (const side of [-1, 1]) {
  cylinderBetween(`skin_upper_arm_${side}`, [side * 0.24, 1.68, 0.02], [side * 0.48, 0.82, 0.06], 0.06, 0.042, 18);
  cylinderBetween(`skin_forearm_long_${side}`, [side * 0.48, 0.82, 0.06], [side * 0.62, -0.28, 0.13], 0.047, 0.03, 18);
  ellipsoid(`skin_hand_withered_${side}`, [side * 0.64, -0.38, 0.14], [0.055, 0.1, 0.04], 18, 10);
  for (let i = 0; i < 4; i += 1) cone(`claw_hand_${side}_${i}`, [side * (0.58 + i * 0.045), -0.48, 0.17], [side * (0.58 + i * 0.055), -0.83, 0.24], 0.015, 8);
  cylinderBetween(`skin_thigh_${side}`, [side * 0.14, 0.38, 0], [side * 0.18, -0.18, 0.07], 0.075, 0.052, 18);
  cylinderBetween(`skin_shin_digitigrade_${side}`, [side * 0.18, -0.18, 0.07], [side * 0.2, -0.78, 0.25], 0.052, 0.035, 18);
  ellipsoid(`skin_foot_long_${side}`, [side * 0.2, -0.86, 0.42], [0.08, 0.04, 0.22], 18, 8);
  for (let i = 0; i < 3; i += 1) cone(`claw_toe_${side}_${i}`, [side * (0.14 + i * 0.05), -0.88, 0.58], [side * (0.13 + i * 0.065), -0.9, 0.82], 0.012, 8);
  cylinderBetween(`tendon_back_arm_${side}`, [side * 0.12, 1.92, -0.28], [side * 0.42, 0.72, -0.2], 0.012, 0.008, 8);
}

fs.writeFileSync(path.join(outDir, 'sonar.obj'), `${lines.join('\n')}\n`);
console.log(`Wrote ${path.join(outDir, 'sonar.obj')}`);
