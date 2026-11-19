import * as THREE from 'three';

// --- signed distance primitives (plain functions, no closures per sample) ---
export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);
export const sph = (x, y, z, cx, cy, cz, r) => Math.hypot(x - cx, y - cy, z - cz) - r;
export const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz);
  if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return k0 * (k0 - 1) / k1;
};
export const cap = (x, y, z, ax, ay, az, bx, by, bz, r) => {
  const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
};
export const cyl = (x, y, z, cx, cy, cz, r, h) => {
  const d = Math.hypot(x - cx, z - cz) - r, e = Math.abs(y - cy) - h;
  return Math.min(Math.max(d, e), 0) + Math.hypot(Math.max(d, 0), Math.max(e, 0));
};
export const rbox = (x, y, z, cx, cy, cz, hx, hy, hz, r) => {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
export const tor = (x, y, z, cx, cy, cz, R, r) => Math.hypot(Math.hypot(x - cx, z - cz) - R, y - cy) - r;

const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

// Surface-nets mesher. f(x,y,z) -> distance; b0/b1 bounds; h cell size.
// color(x,y,z,nx,ny,nz,ao,out) optional -> writes rgb into out.
export function sculpt(f, b0, b1, h, color) {
  const nx = Math.ceil((b1[0] - b0[0]) / h) + 1, ny = Math.ceil((b1[1] - b0[1]) / h) + 1, nz = Math.ceil((b1[2] - b0[2]) / h) + 1;
  const vals = new Float32Array(nx * ny * nz);
  let i = 0;
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) vals[i++] = f(b0[0] + x * h, b0[1] + y * h, b0[2] + z * h);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cell = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [], cv = new Float32Array(8);
  for (let z = 0; z < cz; z++) for (let y = 0; y < cy; y++) for (let x = 0; x < cx; x++) {
    let mask = 0;
    for (let k = 0; k < 8; k++) { const v = vals[(x + (k & 1)) + nx * ((y + ((k >> 1) & 1)) + ny * (z + ((k >> 2) & 1)))]; cv[k] = v; if (v < 0) mask |= 1 << k; }
    if (mask === 0 || mask === 255) continue;
    let px = 0, py = 0, pz = 0, n = 0;
    for (const [a, b] of EDGES) {
      if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      px += (a & 1) + ((b & 1) - (a & 1)) * t; py += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; pz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; n++;
    }
    cell[x + cx * (y + cy * z)] = pos.length / 3;
    pos.push(b0[0] + (x + px / n) * h, b0[1] + (y + py / n) * h, b0[2] + (z + pz / n) * h);
  }
  const ind = [];
  const C = (x, y, z) => cell[x + cx * (y + cy * z)];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) ind.push(a, c, b, a, d, c); else ind.push(a, b, c, a, c, d); };
  for (let z = 0; z < cz; z++) for (let y = 0; y < cy; y++) for (let x = 0; x < cx; x++) {
    const v0 = vals[x + nx * (y + ny * z)];
    if (y > 0 && z > 0 && (v0 < 0) !== (vals[x + 1 + nx * (y + ny * z)] < 0)) quad(C(x, y, z), C(x, y - 1, z), C(x, y - 1, z - 1), C(x, y, z - 1), v0 < 0);
    if (x > 0 && z > 0 && (v0 < 0) !== (vals[x + nx * (y + 1 + ny * z)] < 0)) quad(C(x, y, z), C(x, y, z - 1), C(x - 1, y, z - 1), C(x - 1, y, z), v0 < 0);
    if (x > 0 && y > 0 && (v0 < 0) !== (vals[x + nx * (y + ny * (z + 1))] < 0)) quad(C(x, y, z), C(x - 1, y, z), C(x - 1, y - 1, z), C(x, y - 1, z), v0 < 0);
  }
  const nv = pos.length / 3, P = new Float32Array(pos), N = new Float32Array(nv * 3), Cc = color ? new Float32Array(nv * 3) : null;
  const e = h * 0.5, out = [1, 1, 1];
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    const d = f(x, y, z); x -= gx * d; y -= gy * d; z -= gz * d;
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z; N[v * 3] = gx; N[v * 3 + 1] = gy; N[v * 3 + 2] = gz;
    if (Cc) {
      const r1 = h * 3, r2 = h * 9;
      const ao = Math.max(0, Math.min(1, 0.5 * f(x + gx * r1, y + gy * r1, z + gz * r1) / r1 + 0.5 * f(x + gx * r2, y + gy * r2, z + gz * r2) / r2));
      color(x, y, z, gx, gy, gz, ao, out); Cc[v * 3] = out[0]; Cc[v * 3 + 1] = out[1]; Cc[v * 3 + 2] = out[2];
    }
  }
  // fix winding against gradient
  let agree = 0, tot = 0;
  for (let t = 0; t < ind.length; t += 3 * Math.max(1, Math.floor(ind.length / 900))) {
    const a = ind[t] * 3, b = ind[t + 1] * 3, c = ind[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    if (fx * N[a] + fy * N[a + 1] + fz * N[a + 2] > 0) agree++; tot++;
  }
  if (agree < tot / 2) for (let t = 0; t < ind.length; t += 3) { const s = ind[t + 1]; ind[t + 1] = ind[t + 2]; ind[t + 2] = s; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (Cc) g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  g.setIndex(ind);
  return g;
}
