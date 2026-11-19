import * as THREE from 'three';
import { rng, clamp, lerp, TAU } from './util.js';

export const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export function toTex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// tileable value noise
const NT = new Float32Array(65536); { const r = rng(7); for (let i = 0; i < 65536; i++) NT[i] = r(); }
function vn(x, y, per) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % per) + per) % per, x1 = (x0 + 1) % per, y0 = ((yi % per) + per) % per, y1 = (y0 + 1) % per;
  const a = NT[x0 + y0 * 256], b = NT[x1 + y0 * 256], c = NT[x0 + y1 * 256], d = NT[x1 + y1 * 256];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, per = 256, oct = 4) {
  let s = 0, a = 0.5, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vn(x * f, y * f, Math.min(256, per * f)); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

// fn(u, v, o) writes o[0..2] colour (0..1 sRGB) and o[3] roughness; returns [colourCanvas, roughCanvas]
function gen(size, fn, rough = true) {
  const c = cv(size), g = c.getContext('2d'), im = g.createImageData(size, size), d = im.data;
  const c2 = rough ? cv(size) : null, g2 = rough ? c2.getContext('2d') : null, im2 = rough ? g2.createImageData(size, size) : null;
  const o = [0, 0, 0, 0.5];
  for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i += 4) {
    fn((x + 0.5) / size, (y + 0.5) / size, o);
    d[i] = o[0] * 255; d[i + 1] = o[1] * 255; d[i + 2] = o[2] * 255; d[i + 3] = 255;
    if (rough) { const q = o[3] * 255; im2.data[i] = q; im2.data[i + 1] = q; im2.data[i + 2] = q; im2.data[i + 3] = 255; }
  }
  g.putImageData(im, 0, 0); if (rough) g2.putImageData(im2, 0, 0);
  return [c, c2];
}
const pair = ([c, r]) => ({ map: toTex(c), rough: toTex(r, { srgb: false }) });

function marbleAt(lx, ly, ox, m, o) {
  const wx = lx * m.sc + ox + fbm(lx * 4 + ox, ly * 4 + ox * 1.3, 256, 3) * m.warp, wy = ly * m.sc + ox * 0.7 + fbm(lx * 4 + ox + 9.1, ly * 4 + 3.3, 256, 3) * m.warp;
  const n = fbm(wx, wy, 256, 4), n2 = fbm(wx * 2.3 + 40, wy * 2.3, 256, 3);
  const v = Math.pow(Math.max(0, 1 - Math.abs(n - 0.5) * m.sharp), 2) * m.amt + Math.pow(Math.max(0, 1 - Math.abs(n2 - 0.5) * m.sharp * 1.6), 2) * m.amt * 0.5;
  const cl = 0.9 + fbm(lx * 2 + ox + 5, ly * 2 + ox, 256, 3) * 0.2, k = Math.min(1, v);
  for (let i = 0; i < 3; i++) o[i] = clamp(m.base[i] * cl * (1 - k) + m.vein[i] * k, 0, 1);
  o[3] = m.rough + k * 0.08;
}
export function marbleTiles(size, A, B, seed) {
  return pair(gen(size, (u, v, o) => {
    const tu = u * 2, tv = v * 2, ix = Math.floor(tu), iy = Math.floor(tv), lx = tu - ix, ly = tv - iy;
    marbleAt(lx, ly, ix * 37.1 + iy * 17.3 + seed, ((ix + iy) & 1) ? B : A, o);
    const e = Math.min(lx, 1 - lx, ly, 1 - ly);
    if (e < 0.008) { o[0] *= 0.5; o[1] *= 0.5; o[2] *= 0.5; o[3] = 0.7; }
  }));
}
export function parquet(size) {
  const n = 4, cells = 2 * n;
  return pair(gen(size, (u, v, o) => {
    const pu = u * cells, pv = v * cells, i = Math.floor(pu), j = Math.floor(pv), fu = pu - i, fv = pv - j;
    const m = (((i - j) % cells) + cells) % cells;
    let id, along, across;
    if (m < n) { id = j * 31 + 7; along = m + fu; across = fv; }
    else { id = i * 17 + 500 + ((j + (m - n)) % cells + cells) % cells * 3; along = (cells - 1 - m) + fv; across = fu; }
    const h = NT[(id * 97) & 65535], h2 = NT[(id * 389 + 11) & 65535];
    const grain = fbm(along * 0.7 + h * 50, across * 9 + h2 * 50, 256, 4), ring = Math.sin((across + grain * 1.4) * 16 + h * 30) * 0.5 + 0.5;
    const tone = 0.72 + h * 0.4, k = tone * (0.86 + grain * 0.2 + ring * 0.07);
    o[0] = 0.46 * k; o[1] = 0.27 * k; o[2] = 0.13 * k; o[3] = 0.3 + grain * 0.12;
    const e = Math.min(across, 1 - across, along, n - along);
    if (e < 0.03) { o[0] *= 0.5; o[1] *= 0.5; o[2] *= 0.5; o[3] = 0.6; }
  }));
}
export function plaster(size) {
  return pair(gen(size, (u, v, o) => {
    const n = fbm(u * 6, v * 6, 6, 5), s = fbm(u * 48, v * 48, 48, 2);
    const k = 0.84 + n * 0.14 + s * 0.05; o[0] = o[1] = o[2] = k; o[3] = 0.78 + s * 0.15;
  }));
}
export function concrete(size) {
  return pair(gen(size, (u, v, o) => {
    const n = fbm(u * 5, v * 5, 5, 5), s = vn(u * 200, v * 200, 200);
    const k = 0.74 + n * 0.16 + (s > 0.93 ? -0.1 : 0); o[0] = k; o[1] = k * 0.99; o[2] = k * 0.97; o[3] = 0.1 + n * 0.14;
  }));
}
export function lino(size) {
  return pair(gen(size, (u, v, o) => {
    const ix = Math.floor(u * 4), iy = Math.floor(v * 4), lx = u * 4 - ix, ly = v * 4 - iy, a = (ix + iy) & 1;
    const s = vn(u * 240, v * 240, 240), k = 0.92 + s * 0.12;
    o[0] = (a ? 0.80 : 0.52) * k; o[1] = (a ? 0.84 : 0.66) * k; o[2] = (a ? 0.78 : 0.60) * k; o[3] = 0.22 + s * 0.1;
    if (Math.min(lx, 1 - lx, ly, 1 - ly) < 0.012) { o[0] *= 0.7; o[1] *= 0.7; o[2] *= 0.7; }
  }));
}
export function normalFrom(canvas, strength = 1) {
  const s = canvas.width, src = canvas.getContext('2d').getImageData(0, 0, s, s).data, c = cv(s), g = c.getContext('2d'), im = g.createImageData(s, s);
  const H = (x, y) => src[(((x + s) % s) + ((y + s) % s) * s) * 4] / 255;
  for (let y = 0, i = 0; y < s; y++) for (let x = 0; x < s; x++, i += 4) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1);
    im.data[i] = (-dx / l * 0.5 + 0.5) * 255; im.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; im.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return toTex(c, { srgb: false });
}

// --- drawn textures ---
const SERIF = '"Didot","Bodoni 72","Bodoni MT","Playfair Display",Georgia,serif';
function grainOver(g, w, h, r, a = 0.06) {
  for (let i = 0; i < w * h / 40; i++) { g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${a * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}
export function medallion(size = 1024) {
  const c = cv(size), g = c.getContext('2d'), R = size / 2;
  g.translate(R, R);
  const ring = (r0, col) => { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r0 * R, 0, TAU); g.fill(); };
  ring(1, '#2c3a33'); ring(0.96, '#d9cdb4'); ring(0.9, '#7c2f25'); ring(0.86, '#e6dcc6');
  for (let i = 0; i < 32; i++) { g.fillStyle = i % 2 ? '#2c3a33' : '#c79a4a'; g.beginPath(); const a0 = i / 32 * TAU, a1 = (i + 1) / 32 * TAU; g.moveTo(Math.cos(a0) * R * 0.86, Math.sin(a0) * R * 0.86); g.lineTo(Math.cos((a0 + a1) / 2) * R * 0.74, Math.sin((a0 + a1) / 2) * R * 0.74); g.lineTo(Math.cos(a1) * R * 0.86, Math.sin(a1) * R * 0.86); g.fill(); }
  ring(0.7, '#e6dcc6');
  const star = (n, r0, r1, rot, c1, c2) => { for (let i = 0; i < n; i++) { const a = i / n * TAU + rot, w = TAU / n / 2; for (const s of [-1, 1]) { g.fillStyle = s < 0 ? c1 : c2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * r0, Math.sin(a) * R * r0); g.lineTo(Math.cos(a + s * w) * R * r1, Math.sin(a + s * w) * R * r1); g.fill(); } } };
  star(8, 0.5, 0.2, Math.PI / 8, '#b9853b', '#8a5f25'); star(4, 0.62, 0.17, Math.PI / 4, '#2c3a33', '#1c2622'); star(4, 0.68, 0.17, 0, '#7c2f25', '#57201a');
  ring(0.1, '#c79a4a'); ring(0.07, '#2c3a33');
  g.setTransform(1, 0, 0, 1, 0, 0);
  const im = g.getImageData(0, 0, size, size), d = im.data;
  for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i += 4) { const u = x / size * 9, v = y / size * 9, n = fbm(u + fbm(u * 2, v * 2, 256, 3) * 1.5, v, 256, 4), k = 0.86 + n * 0.25 - Math.pow(Math.max(0, 1 - Math.abs(n - 0.5) * 16), 2) * 0.18; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  g.putImageData(im, 0, 0);
  return toTex(c, { repeat: false });
}

function varnish(g, w, h, r) {
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(40,24,8,0)'); vg.addColorStop(1, 'rgba(30,18,6,0.5)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(20,12,4,0.13)'; g.lineWidth = 0.7;
  for (let i = 0; i < 70; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 34; y += (r() - 0.5) * 34; g.lineTo(x, y); } g.stroke(); }
  grainOver(g, w, h, r, 0.07);
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
function portrait(g, w, h, r) {
  const hue = r() * 360;
  const bg = g.createRadialGradient(w * 0.5, h * 0.4, 10, w * 0.5, h * 0.5, h * 0.75);
  bg.addColorStop(0, hsl(hue, 26, 38)); bg.addColorStop(1, hsl(hue, 32, 12));
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const cx = w * (0.46 + r() * 0.08), hy = h * 0.4, hr = w * 0.19;
  g.fillStyle = hsl((hue + 150 + r() * 60) % 360, 42, 27); g.beginPath(); g.moveTo(cx - w * 0.42, h); g.quadraticCurveTo(cx - w * 0.36, h * 0.6, cx, h * 0.58); g.quadraticCurveTo(cx + w * 0.36, h * 0.6, cx + w * 0.42, h); g.fill();
  g.fillStyle = '#e9e2d0'; for (let i = 0; i < 13; i++) { const a = Math.PI * (0.05 + i / 12 * 0.9); g.beginPath(); g.ellipse(cx + Math.cos(a) * hr * 1.15, hy + hr * 0.95 + Math.sin(a) * hr * 0.42, hr * 0.26, hr * 0.2, a, 0, TAU); g.fill(); }
  const wig = r() < 0.5;
  g.fillStyle = wig ? '#d8d2c2' : hsl(25, 30, 14);
  g.beginPath(); g.ellipse(cx, hy - hr * 0.2, hr * 1.25, hr * 1.2, 0, 0, TAU); g.fill();
  if (wig) for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(cx + (i < 4 ? -1 : 1) * hr * 1.1, hy - hr * 0.2 + (i % 4) * hr * 0.42, hr * 0.3, 0, TAU); g.fill(); }
  const skin = hsl(22 + r() * 10, 42, 62 + r() * 12);
  g.fillStyle = skin; g.beginPath(); g.ellipse(cx, hy, hr * 0.86, hr * 1.12, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(200,80,70,0.3)'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * hr * 0.5, hy + hr * 0.32, hr * 0.22, 0, TAU); g.fill(); }
  for (const s of [-1, 1]) { g.fillStyle = '#f4efe6'; g.beginPath(); g.ellipse(cx + s * hr * 0.36, hy - hr * 0.16, hr * 0.14, hr * 0.085, 0, 0, TAU); g.fill(); g.fillStyle = '#20140c'; g.beginPath(); g.arc(cx + s * hr * 0.36 + hr * 0.03, hy - hr * 0.16, hr * 0.065, 0, TAU); g.fill(); }
  g.strokeStyle = '#2a1a10'; g.lineWidth = hr * 0.06; g.lineCap = 'round';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * hr * 0.18, hy - hr * 0.36); g.lineTo(cx + s * hr * 0.55, hy - hr * 0.4 + r() * hr * 0.1); g.stroke(); }
  // the nose: always magnificent
  const nl = hr * (0.75 + r() * 0.5), nw = hr * (0.3 + r() * 0.2);
  g.fillStyle = hsl(18, 48, 56); g.beginPath(); g.moveTo(cx - hr * 0.05, hy - hr * 0.2); g.quadraticCurveTo(cx + nw * 1.5, hy + nl * 0.55, cx + nw * 0.5, hy + nl * 0.72); g.quadraticCurveTo(cx - nw * 0.4, hy + nl * 0.8, cx - nw * 0.5, hy + nl * 0.5); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,240,220,0.5)'; g.beginPath(); g.ellipse(cx + nw * 0.35, hy + nl * 0.45, nw * 0.16, nl * 0.2, -0.3, 0, TAU); g.fill();
  g.strokeStyle = '#6e2c22'; g.lineWidth = hr * 0.05; g.beginPath(); g.moveTo(cx - hr * 0.25, hy + hr * 0.72); g.quadraticCurveTo(cx, hy + hr * (0.68 + r() * 0.14), cx + hr * 0.25, hy + hr * 0.72); g.stroke();
  if (r() < 0.45) { g.fillStyle = '#16100c'; g.beginPath(); g.ellipse(cx, hy - hr * 1.02, hr * 1.5, hr * 0.2, 0, 0, TAU); g.fill(); g.fillRect(cx - hr * 0.75, hy - hr * 1.8, hr * 1.5, hr * 0.8); }
}
function landscape(g, w, h, r) {
  const hue = [18, 32, 200, 280][Math.floor(r() * 4)];
  const sky = g.createLinearGradient(0, 0, 0, h * 0.7); sky.addColorStop(0, hsl(hue + 190, 35, 34)); sky.addColorStop(1, hsl(hue, 70, 72));
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = hsl(hue + 20, 90, 84); g.beginPath(); g.arc(w * (0.25 + r() * 0.5), h * (0.3 + r() * 0.15), w * 0.07, 0, TAU); g.fill();
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,245,230,${0.25 + r() * 0.2})`; g.beginPath(); g.ellipse(r() * w, h * (0.1 + r() * 0.3), w * (0.1 + r() * 0.12), h * 0.018, 0, 0, TAU); g.fill(); }
  for (let L = 0; L < 5; L++) {
    const y0 = h * (0.48 + L * 0.1), ph = r() * 10, amp = h * (0.07 - L * 0.008);
    g.fillStyle = hsl(95 + L * 12 + r() * 20, 30 + L * 4, 44 - L * 7);
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, y0 + Math.sin(x / w * 5 + ph) * amp + Math.sin(x / w * 13 + ph * 2) * amp * 0.3);
    g.lineTo(w, h); g.fill();
    for (let k = 0; k < 3 + L; k++) { const x = r() * w, y = y0 + Math.sin(x / w * 5 + ph) * amp + 4, s = h * (0.03 + L * 0.014); g.fillStyle = hsl(140, 35, 16 - L * 2); g.beginPath(); g.ellipse(x, y - s, s * 0.28, s, 0, 0, TAU); g.fill(); }
    if (L === 2) { const x = w * (0.3 + r() * 0.4), y = y0 - 2; g.fillStyle = '#e8d9b8'; g.fillRect(x, y - h * 0.035, w * 0.07, h * 0.035); g.fillStyle = '#9a4a32'; g.beginPath(); g.moveTo(x - 3, y - h * 0.035); g.lineTo(x + w * 0.035, y - h * 0.06); g.lineTo(x + w * 0.07 + 3, y - h * 0.035); g.fill(); }
  }
}
function stillLife(g, w, h, r) {
  const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#2a2119'); bg.addColorStop(1, '#0d0a08'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4a2c18'; g.fillRect(0, h * 0.68, w, h * 0.32); g.fillStyle = 'rgba(255,220,170,0.08)'; g.fillRect(0, h * 0.68, w, 4);
  g.fillStyle = '#c9bfa8'; g.beginPath(); g.ellipse(w * 0.45, h * 0.7, w * 0.3, h * 0.07, 0, 0, Math.PI); g.fill(); g.fillStyle = '#8f8672'; g.beginPath(); g.ellipse(w * 0.45, h * 0.7, w * 0.3, h * 0.025, 0, 0, TAU); g.fill();
  const fruit = (x, y, s, hu) => { const gr = g.createRadialGradient(x - s * 0.3, y - s * 0.3, s * 0.1, x, y, s); gr.addColorStop(0, hsl(hu, 80, 68)); gr.addColorStop(1, hsl(hu, 70, 22)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); };
  for (let i = 0; i < 6; i++) fruit(w * (0.25 + i * 0.075 + r() * 0.03), h * (0.63 - r() * 0.06), w * (0.055 + r() * 0.03), [8, 30, 48, 95, 350, 20][i]);
  for (let i = 0; i < 14; i++) fruit(w * 0.68 + (i % 4) * w * 0.035 + r() * 4, h * 0.66 - Math.floor(i / 4) * w * 0.035, w * 0.022, 285);
  g.fillStyle = '#17301f'; g.beginPath(); g.moveTo(w * 0.8, h * 0.7); g.lineTo(w * 0.8, h * 0.4); g.lineTo(w * 0.83, h * 0.34); g.lineTo(w * 0.83, h * 0.24); g.lineTo(w * 0.87, h * 0.24); g.lineTo(w * 0.87, h * 0.34); g.lineTo(w * 0.9, h * 0.4); g.lineTo(w * 0.9, h * 0.7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(w * 0.815, h * 0.42, 3, h * 0.2);
}
function abstract(g, w, h, r) {
  g.fillStyle = hsl(40, 30, 90); g.fillRect(0, 0, w, h);
  const pal = ['#d23b2a', '#1f4fa0', '#f0c330', '#141414', '#e8794a', '#2f8f7a'];
  for (let i = 0; i < 7; i++) { g.fillStyle = pal[Math.floor(r() * pal.length)]; const k = r(); if (k < 0.4) g.fillRect(r() * w * 0.8, r() * h * 0.8, w * (0.1 + r() * 0.4), h * (0.1 + r() * 0.4)); else if (k < 0.75) { g.beginPath(); g.arc(r() * w, r() * h, w * (0.08 + r() * 0.22), 0, TAU); g.fill(); } else { g.save(); g.translate(r() * w, r() * h); g.rotate(r() * 3); g.fillRect(-w, -4, w * 2, 8 + r() * 10); g.restore(); } }
}
export function painting(kind, seed, w = 320, h = 400) {
  const c = cv(w, h), g = c.getContext('2d'), r = rng(seed * 101 + 5);
  if (kind === 'portrait') portrait(g, w, h, r); else if (kind === 'landscape') landscape(g, w, h, r); else if (kind === 'still') stillLife(g, w, h, r);
  else if (kind === 'abstract') abstract(g, w, h, r); else { g.fillStyle = kind; g.fillRect(0, 0, w, h); grainOver(g, w, h, r, 0.05); }
  if (kind === 'portrait' || kind === 'landscape' || kind === 'still') varnish(g, w, h, r); else grainOver(g, w, h, r, 0.03);
  return toTex(c, { repeat: false });
}
export function label(lines, w = 384, h = 192, o = {}) {
  const c = cv(w, h), g = c.getContext('2d');
  g.fillStyle = o.bg || '#efe8d6'; g.fillRect(0, 0, w, h);
  g.strokeStyle = o.rule || 'rgba(60,40,20,0.35)'; g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = o.fg || '#2a2218'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length, lh = (h - 36) / n;
  lines.forEach((t, i) => {
    let size = Math.min(lh * (i === 0 ? 0.74 : 0.56), 64); const it = t.startsWith('_'); if (it) t = t.slice(1);
    g.font = `${it ? 'italic ' : ''}${i === 0 ? '700 ' : ''}${size}px ${SERIF}`;
    while (g.measureText(t).width > w - 44 && size > 8) { size -= 2; g.font = `${it ? 'italic ' : ''}${i === 0 ? '700 ' : ''}${size}px ${SERIF}`; }
    g.fillText(t, w / 2, 18 + lh * (i + 0.5));
  });
  return toTex(c, { repeat: false });
}
export function signTex(text, arrow) {
  const c = cv(512, 128), g = c.getContext('2d');
  g.fillStyle = '#15231f'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#c9a24e'; g.lineWidth = 3; g.strokeRect(7, 7, 498, 114);
  g.fillStyle = '#e2bf6a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 46; g.font = `700 ${size}px ${SERIF}`; const full = (arrow < 0 ? '←  ' : '') + text.split('').join(' ') + (arrow > 0 ? '  →' : '');
  while (g.measureText(full).width > 460) { size -= 2; g.font = `700 ${size}px ${SERIF}`; }
  g.fillText(full, 256, 66);
  return toTex(c, { repeat: false });
}
export function neonTex(text, color, w = 1024, h = 256) {
  const c = cv(w, h), g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `italic 700 ${h * 0.56}px ${SERIF}`; g.lineJoin = 'round';
  g.shadowColor = color; g.shadowBlur = 40; g.strokeStyle = color; g.lineWidth = 9; g.strokeText(text, w / 2, h / 2); g.strokeText(text, w / 2, h / 2);
  g.shadowBlur = 0; g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeText(text, w / 2, h / 2);
  return toTex(c, { repeat: false });
}
export function dotsTex(colors) {
  const c = cv(512, 128), g = c.getContext('2d');
  colors.forEach((col, i) => { const x = 512 * (i + 0.5) / colors.length; g.shadowColor = col; g.shadowBlur = 30; g.fillStyle = col; g.beginPath(); g.arc(x, 64, 26, 0, TAU); g.fill(); g.fill(); g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(x, 64, 12, 0, TAU); g.fill(); });
  return toTex(c, { repeat: false });
}
export function vaseTex() {
  const c = cv(512, 256), g = c.getContext('2d');
  g.fillStyle = '#b5552f'; g.fillRect(0, 0, 512, 256);
  const r = rng(3); grainOver(g, 512, 256, r, 0.08);
  g.fillStyle = '#17110d';
  g.fillRect(0, 0, 512, 34); g.fillRect(0, 222, 512, 34); g.fillRect(0, 60, 512, 6); g.fillRect(0, 196, 512, 6);
  for (let i = 0; i < 16; i++) { const x = i * 32; g.fillRect(x + 4, 74, 24, 5); g.fillRect(x + 4, 74, 5, 22); g.fillRect(x + 4, 92, 16, 5); g.fillRect(x + 16, 83, 5, 12); }
  for (let i = 0; i < 8; i++) { const x = i * 64 + 32; g.beginPath(); g.ellipse(x, 150, 9, 22, 0, 0, TAU); g.fill(); g.beginPath(); g.arc(x, 120, 8, 0, TAU); g.fill(); g.fillRect(x - 20, 138, 40, 5); g.fillRect(x - 9, 168, 5, 24); g.fillRect(x + 4, 168, 5, 24); }
  g.fillStyle = '#b5552f'; for (let i = 0; i < 32; i++) g.fillRect(i * 16 + 4, 10, 8, 14);
  return toTex(c);
}
export function fossilTex(seed) {
  const c = cv(256), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#6f6a5c'; g.fillRect(0, 0, 256, 256); grainOver(g, 256, 256, r, 0.12);
  g.strokeStyle = '#c9bfa2'; g.lineCap = 'round';
  g.beginPath(); for (let a = 0; a < 26; a += 0.05) { const rr = 4 + a * 4.1, x = 128 + Math.cos(a) * rr, y = 128 + Math.sin(a) * rr; g.lineWidth = 2 + a * 0.5; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
  g.strokeStyle = 'rgba(60,54,44,0.7)'; g.lineWidth = 2;
  for (let a = 3; a < 26; a += 0.33) { const r0 = 4 + a * 4.1 - 5 - a * 0.25, r1 = 4 + a * 4.1 + 5 + a * 0.25; g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1); g.stroke(); }
  return toTex(c, { repeat: false });
}
export function monitorTex(seed) {
  const c = cv(128, 96), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#0c1a16'; g.fillRect(0, 0, 128, 96);
  g.strokeStyle = '#5fe0b0'; g.lineWidth = 1.5; g.strokeRect(14 + r() * 20, 20 + r() * 10, 60 + r() * 30, 44); g.beginPath(); g.moveTo(10, 78); g.lineTo(118, 78); g.stroke();
  g.fillStyle = '#5fe0b0'; g.fillRect(8, 6, 26, 5); g.fillStyle = '#ff5a4a'; g.beginPath(); g.arc(116, 9, 4, 0, TAU); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < 96; y += 3) g.fillRect(0, y, 128, 1);
  return toTex(c, { repeat: false });
}
export function iconTex(ch, bg, fg) {
  const c = cv(128), g = c.getContext('2d');
  g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.fill(); g.strokeStyle = fg; g.lineWidth = 5; g.stroke();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 86px ${SERIF}`; g.fillText(ch, 64, 70);
  return toTex(c, { repeat: false });
}
export function softDot() {
  const c = cv(64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return toTex(c, { repeat: false });
}
