import { sculpt, smin, smax, sph, ell, cap, cyl, rbox, tor } from './sdf.js';
import { makeNoise } from './noise.js';
import { rng, TAU } from './util.js';

const NZ = makeNoise(1234);

// vertex colouring: veined marble with cavity darkening
export function marbleColor(base, vein, amt = 0.5, off = 0) {
  return (x, y, z, nx, ny, nz, ao, o) => {
    const w = NZ.fbm(x * 2.2 + off, y * 2.2, z * 2.2, 3) * 1.4;
    const n = NZ.fbm(x * 3.1 + w + off, y * 3.1 + w, z * 3.1 - w, 4);
    const v = Math.pow(Math.max(0, 1 - Math.abs(n) * 7), 2.2) * amt;
    const cl = 0.94 + NZ.n3(x * 1.3 + off, y * 1.3, z * 1.3) * 0.06;
    const a = 0.62 + 0.38 * Math.pow(ao, 0.8);
    o[0] = (base[0] * cl * (1 - v) + vein[0] * v) * a; o[1] = (base[1] * cl * (1 - v) + vein[1] * v) * a; o[2] = (base[2] * cl * (1 - v) + vein[2] * v) * a;
  };
}
const IVORY = [0.97, 0.95, 0.9], GREYV = [0.52, 0.53, 0.58];

export function bustGeo(o = {}) {
  const { nose = 1, hair = 'curls', beard = false, seed = 1, h = 0.02, tint = IVORY, wide = 1 } = o;
  const r = rng(seed * 7919 + 13);
  const curls = [];
  if (hair === 'curls') for (let i = 0; i < 90 && curls.length < 46; i++) {
    const az = r() * TAU, el = Math.asin(Math.min(1, r() * 1.25 - 0.3));
    const front = Math.cos(az);
    if (front > 0.25 ? el < 0.5 : el < -0.3 - (front < -0.5 ? 0.25 : 0)) continue;
    const ce = Math.cos(el);
    curls.push([Math.sin(az) * ce * 0.3, 1.22 + Math.sin(el) * 0.36, 0.02 + Math.cos(az) * ce * 0.33, 0.062 + r() * 0.03]);
  }
  const bc = [];
  if (beard) for (let i = 0; i < 26; i++) {
    const az = (r() - 0.5) * 2.7, el = -0.15 - r() * 0.95, ce = Math.cos(el);
    bc.push([Math.sin(az) * ce * 0.23, 1.06 + Math.sin(el) * 0.2, 0.07 + Math.cos(az) * ce * 0.22, 0.05 + r() * 0.025]);
  }
  const f = (x, y, z) => {
    x /= wide;
    const ax = Math.abs(x);
    let d = ell(x, y, z, 0, 1.22, 0.02, 0.30, 0.36, 0.33);
    d = smin(d, ell(x, y, z, 0, 1.04, 0.09, 0.21, 0.17, 0.21), 0.08);
    d = smin(d, sph(x, y, z, 0, 0.955, 0.215, 0.075), 0.06);
    d = smin(d, sph(ax, y, z, 0.15, 1.10, 0.19, 0.10), 0.07);
    d = smin(d, cap(x, y, z, -0.16, 1.335, 0.275, 0.16, 1.335, 0.275, 0.05), 0.05);
    d = smax(d, -sph(ax, y, z, 0.125, 1.25, 0.325, 0.068), 0.035);
    if (nose) {
      const k = nose;
      d = smin(d, cap(x, y, z, 0, 1.29, 0.31, 0, 1.15, 0.37 + 0.05 * k, 0.036 * k), 0.03);
      d = smin(d, sph(x, y, z, 0, 1.135, 0.365 + 0.045 * k, 0.05 * k), 0.02);
      d = smin(d, sph(ax, y, z, 0.045, 1.125, 0.345, 0.034), 0.02);
    } else {
      const s = Math.max(ell(x, y, z, 0, 1.17, 0.33, 0.07, 0.095, 0.06), z - 0.357 - (x * 0.3 + (y - 1.17) * 0.25));
      d = smin(d, s, 0.012);
    }
    d = smin(d, cap(ax, y, z, 0, 1.037, 0.312, 0.072, 1.024, 0.283, 0.02), 0.02);
    d = smin(d, cap(ax, y, z, 0, 1.0, 0.306, 0.06, 0.992, 0.28, 0.024), 0.02);
    d = smax(d, -cap(ax, y, z, 0, 1.019, 0.335, 0.088, 1.004, 0.29, 0.009), 0.008);
    d = smin(d, ell(ax, y, z, 0.30, 1.2, 0.0, 0.035, 0.085, 0.055), 0.03);
    d = smin(d, cap(x, y, z, 0, 0.70, -0.02, 0, 0.95, 0.0, 0.125), 0.06);
    let c = ell(x, y, z, 0, 0.52, -0.02, 0.50, 0.30, 0.25);
    c = smin(c, cap(x, y, z, -0.42, 0.63, 0.11, 0.10, 0.40, 0.24, 0.045), 0.04);
    c = smin(c, cap(x, y, z, -0.30, 0.73, 0.09, 0.26, 0.43, 0.22, 0.04), 0.04);
    c = smin(c, cap(x, y, z, 0.44, 0.61, 0.09, 0.20, 0.45, 0.20, 0.04), 0.04);
    c = smax(c, 0.34 - y, 0.04);
    d = smin(d, c, 0.07);
    d = smin(d, cyl(x, y, z, 0, 0.24, 0, 0.15, 0.12), 0.05);
    d = smin(d, smin(cyl(x, y, z, 0, 0.05, 0, 0.30, 0.05), tor(x, y, z, 0, 0.10, 0, 0.26, 0.035), 0.02), 0.04);
    if (y > 0.8) {
      if (hair === 'curls') { if (sph(x, y, z, 0, 1.25, 0, 0.5) < 0.12) for (const q of curls) d = smin(d, sph(x, y, z, q[0], q[1], q[2], q[3]), 0.035); }
      else if (hair === 'bun') {
        let hh = ell(x, y, z, 0, 1.27, -0.03, 0.325, 0.36, 0.35);
        hh = smax(hh, 1.36 - y - Math.max(0, z) * 0.55 + Math.sin(x * 40) * 0.004, 0.03);
        hh += Math.sin(Math.atan2(x, z + 0.4) * 22) * 0.004;
        d = smin(d, hh, 0.02); d = smin(d, sph(x, y, z, 0, 1.36, -0.36, 0.13), 0.04);
      } else if (hair === 'helmet') {
        let hh = ell(x, y, z, 0, 1.3, 0.0, 0.345, 0.37, 0.37);
        hh = smax(hh, 1.33 - y - Math.max(0, -z) * 0.5, 0.02);
        d = smin(d, hh, 0.015);
        for (let k = 0; k < 7; k++) { const a = -0.9 + k * 0.42, a2 = a + 0.42; d = smin(d, cap(x, y, z, 0, 1.3 + Math.cos(a) * 0.43, Math.sin(a) * 0.43, 0, 1.3 + Math.cos(a2) * 0.43, Math.sin(a2) * 0.43, 0.05), 0.02); }
        d = smin(d, cap(ax, y, z, 0.3, 1.32, 0.12, 0.26, 1.08, 0.2, 0.04), 0.03);
      }
      for (const q of bc) d = smin(d, sph(x, y, z, q[0], q[1], q[2], q[3]), 0.03);
    }
    return d * Math.min(1, wide);
  };
  const mc = marbleColor(tint, GREYV, 0.45, seed * 3.7);
  const col = (x, y, z, nx, ny, nz, ao, out) => {
    mc(x, y, z, nx, ny, nz, ao, out);
    if (!nose) { const dd = Math.hypot(x, y - 1.17, z - 0.36); if (dd < 0.085 && nz > 0.75) { const k = 0.62 + NZ.n3(x * 60, y * 60, z * 60) * 0.12; out[0] *= k; out[1] *= k * 0.97; out[2] *= k * 0.93; } }
  };
  return sculpt(f, [-0.62 * wide, -0.01, -0.5], [0.62 * wide, hair === 'helmet' ? 1.82 : 1.72, 0.56], h, col);
}

export function venusGeo() {
  const f = (x, y, z) => {
    const ax = Math.abs(x);
    let d = ell(x, y, z, 0, 0.55, 0, 0.33, 0.62, 0.27);
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.3, cx = Math.sin(a) * 0.27, cz = Math.cos(a) * 0.22; d = smin(d, cap(x, y, z, cx * 0.6, 1.02, cz * 0.6, cx * 1.25, 0.06, cz * 1.25, 0.05), 0.05); }
    d = smin(d, tor(x, y - (x * 0.35), z, 0, 1.03, 0, 0.26, 0.06), 0.05);
    d = smin(d, ell(x, y, z, 0.02, 1.22, 0, 0.19, 0.2, 0.14), 0.1);
    d = smin(d, ell(x, y, z, 0.03, 1.46, 0.01, 0.235, 0.2, 0.16), 0.1);
    d = smin(d, sph(ax, y, z, 0.105, 1.47, 0.125, 0.08), 0.05);
    d = smin(d, cap(ax, y, z, 0.2, 1.6, 0, 0.3, 1.5, -0.02, 0.07), 0.05);
    d = smax(d, ax - 0.335 + (y - 1.5) * 0.3, 0.015);
    d = smin(d, cap(x, y, z, 0.02, 1.6, 0, 0.04, 1.78, 0.02, 0.062), 0.05);
    d = smin(d, ell(x, y, z, 0.05, 1.9, 0.03, 0.12, 0.15, 0.14), 0.03);
    d = smin(d, sph(x, y, z, 0.05, 1.94, -0.13, 0.085), 0.03);
    d = smin(d, cap(x, y, z, 0.05, 1.92, 0.15, 0.05, 1.86, 0.185, 0.018), 0.012);
    d = smin(d, cyl(x, y, z, 0, 0.04, 0, 0.46, 0.04), 0.03);
    return d;
  };
  return sculpt(f, [-0.55, -0.01, -0.5], [0.55, 2.12, 0.5], 0.024, marbleColor([0.9, 0.88, 0.84], GREYV, 0.4, 9));
}

export function blobGeo() {
  const f = (x, y, z) => {
    let d = sph(x, y, z, 0, 1.05, 0, 0.72);
    d = smin(d, sph(x, y, z, 0.62, 1.6, 0.1, 0.44), 0.35);
    d = smin(d, sph(x, y, z, -0.55, 0.6, 0.1, 0.5), 0.3);
    d = smin(d, ell(x, y, z, 0.15, 0.4, 0, 0.95, 0.36, 0.5), 0.3);
    d = smax(d, -cap(x, y, z, 0.05, 1.05, -1, 0.05, 1.05, 1, 0.3), 0.18);
    d = smax(d, -sph(x, y, z, 0.75, 1.62, 0.5, 0.2), 0.1);
    return d;
  };
  return sculpt(f, [-1.2, 0, -0.85], [1.25, 2.15, 0.85], 0.035, (x, y, z, nx, ny, nz, ao, o) => { const a = 0.6 + 0.4 * ao; o[0] = o[1] = o[2] = a; });
}

const boneCol = (x, y, z, nx, ny, nz, ao, o) => {
  const n = 0.9 + NZ.fbm(x * 5, y * 5, z * 5, 3) * 0.14, a = 0.35 + 0.65 * Math.pow(ao, 0.9);
  o[0] = 0.86 * n * a; o[1] = 0.78 * n * a; o[2] = 0.62 * n * a;
};
export function rexSkullGeo() {
  const f = (x, y, z) => {
    const ax = Math.abs(x);
    let d = ell(x, y, z, 0, 0.05, -0.25, 0.40, 0.40, 0.50);
    d = smin(d, ell(x, y, z, 0, -0.02, 0.55, 0.27, 0.27, 0.80), 0.15);
    d = smin(d, rbox(x, y, z, 0, -0.08, 1.0, 0.17, 0.17, 0.32, 0.1), 0.1);
    d = smin(d, sph(ax, y, z, 0.27, 0.34, 0.02, 0.11), 0.08);
    d = smax(d, -sph(ax, y, z, 0.41, 0.10, -0.02, 0.17), 0.05);
    d = smax(d, -ell(ax, y, z, 0.31, 0.02, 0.48, 0.12, 0.13, 0.22), 0.05);
    d = smax(d, -sph(ax, y, z, 0.43, 0.0, -0.48, 0.16), 0.05);
    d = smax(d, -sph(ax, y, z, 0.15, 0.08, 1.24, 0.06), 0.03);
    d = smax(d, -ell(x, y, z, 0, -0.34, 0.45, 0.19, 0.2, 0.85), 0.05);
    d = smax(d, -0.27 - y, 0.03);
    for (let i = 0; i < 9; i++) { const tz = 0.16 + i * 0.125, tx = 0.245 - Math.max(0, i - 4) * 0.022; d = smin(d, cap(ax, y, z, tx, -0.25, tz, tx, -0.4 + (i % 2) * 0.035, tz + 0.02, 0.03), 0.012); }
    return d;
  };
  return sculpt(f, [-0.62, -0.5, -0.82], [0.62, 0.58, 1.42], 0.02, boneCol);
}
export function rexJawGeo() {
  const f = (x, y, z) => {
    const ax = Math.abs(x);
    let d = cap(ax, y, z, 0.36, 0, 0, 0.14, -0.13, 1.56, 0.075);
    d = smin(d, sph(x, y, z, 0, -0.13, 1.6, 0.14), 0.08);
    d = smin(d, cap(ax, y, z, 0.36, 0, 0, 0.37, 0.2, -0.06, 0.08), 0.05);
    for (let i = 0; i < 8; i++) { const tz = 0.68 + i * 0.118, tx = 0.275 - i * 0.0185; d = smin(d, cap(ax, y, z, tx, -0.06 - i * 0.008, tz, tx, 0.09 - (i % 2) * 0.03, tz, 0.027), 0.012); }
    return d;
  };
  return sculpt(f, [-0.52, -0.32, -0.2], [0.52, 0.34, 1.8], 0.02, boneCol);
}
