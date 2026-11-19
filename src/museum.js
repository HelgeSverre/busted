import * as THREE from 'three';
import { Builder, prep, worldUV, xf } from './kit.js';
import * as TX from './tex.js';
import * as SC from './sculpt.js';
import { TAU } from './util.js';

export const H = 8;
export const ROOMS = {
  dino: { x0: -69, x1: -41, z0: -8, z1: 8 }, antiq: { x0: -40, x1: -14, z0: -8, z1: 8 }, rot: { x0: -13, x1: 13, z0: -8, z1: 8 },
  gal: { x0: 14, x1: 42, z0: -8, z1: 8 }, mod: { x0: 43, x1: 69, z0: -8, z1: 8, artSafe: true }, lab: { x0: -8, x1: 8, z0: -21, z1: -9 },
};
export function roomAt(x, z) { if (z < -8.5) return 'lab'; if (x < -40.5) return 'dino'; if (x < -13.5) return 'antiq'; if (x < 13.5) return 'rot'; if (x < 42.5) return 'gal'; return 'mod'; }

export function buildMuseum(scene, M) {
  const B = new Builder(scene);
  const front = new THREE.Group(); scene.add(front);
  const BF = new Builder(front);
  const W = { boxes: [], circles: [], pads: [], emitters: [], talkers: [], extras: new THREE.Group(), front, labDoor: { x0: -1.7, z0: -9, x1: 1.7, z1: -8, tall: true, on: true }, keySpots: {}, noseSpots: [], anchors: {} };
  scene.add(W.extras);
  W.boxes.push(W.labDoor);
  const colBox = (x0, z0, x1, z1, tall = true) => W.boxes.push({ x0, z0, x1, z1, tall, on: true });
  const colCirc = (x, z, r, tall = true) => W.circles.push({ x, z, r, tall });
  const emit = (x, y, z, col, I, room) => W.emitters.push({ x, y, z, col: new THREE.Color(col), I, w: 0, light: null, room });
  const WARM = 0xffb469, COOL = 0xcfe0ff;
  const single = (geo, mat, x, y, z, ry = 0, rx = 0, parent = W.extras) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const texMat = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.5, ...o });

  // local-frame helper: build boxes in a rotated/translated frame
  const L = (m, b = B) => ({
    box(mat, x0, y0, z0, x1, y1, z1, uvs = 0.5) { const g = prep(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); worldUV(g, uvs); g.applyMatrix4(m); b.add(mat, g); },
    sph(mat, x, y, z, r, sc) { const g = new THREE.SphereGeometry(r, 18, 12); if (sc) g.scale(sc[0], sc[1], sc[2]); g.translate(x, y, z); b.add(mat, g, m); },
    cyl(mat, x, y, z, r0, r1, h, seg = 16) { const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(x, y + h / 2, z); b.add(mat, g, m); },
    plane(geo, mat, x, y, z, rx = 0) { const p = new THREE.Mesh(geo, mat); p.position.set(x, y, z); p.rotation.x = rx; const g = new THREE.Group(); g.applyMatrix4(m); g.add(p); p.receiveShadow = true; W.extras.add(g); return p; },
  });

  // ---------- shell ----------
  function wallX(b, mat, xa, xb, z0, z1, holes = []) {
    let x = xa;
    for (const h of holes.slice().sort((p, q) => p.a - q.a)) {
      if (h.a > x) b.box(mat, x, 0, z0, h.a, H, z1);
      if (h.y0 > 0) b.box(mat, h.a, 0, z0, h.b, h.y0, z1);
      if (h.y1 < H) b.box(mat, h.a, h.y1, z0, h.b, H, z1);
      x = h.b;
    }
    if (x < xb) b.box(mat, x, 0, z0, xb, H, z1);
  }
  function ceiling(xa, xb, za, zb, holes = []) {
    let x = xa;
    for (const h of holes.slice().sort((p, q) => p.x0 - q.x0)) {
      if (h.x0 > x) B.box(M.ceil, x, H, za, h.x0, H + 0.5, zb);
      B.box(M.ceil, h.x0, H, za, h.x1, H + 0.5, h.z0); B.box(M.ceil, h.x0, H, h.z1, h.x1, H + 0.5, zb);
      B.box(M.skyGlass, h.x0, H + 0.3, h.z0, h.x1, H + 0.34, h.z1);
      for (let mx = h.x0 + 1.25; mx < h.x1 - 0.3; mx += 1.25) B.box(M.ceilDark, mx - 0.045, H + 0.02, h.z0, mx + 0.045, H + 0.14, h.z1);
      B.box(M.ceilDark, h.x0, H + 0.02, (h.z0 + h.z1) / 2 - 0.045, h.x1, H + 0.14, (h.z0 + h.z1) / 2 + 0.045);
      x = h.x1;
    }
    if (x < xb) B.box(M.ceil, x, H, za, xb, H + 0.5, zb);
  }
  function windowN(xc) {
    const a = xc - 1.2, b = xc + 1.2;
    B.box(M.moonGlass, a, 2.4, -8.64, b, 6.8, -8.6);
    B.box(M.trimDark, xc - 0.04, 2.4, -8.68, xc + 0.04, 6.8, -8.56);
    for (const y of [3.5, 4.6, 5.7]) B.box(M.trimDark, a, y - 0.035, -8.68, b, y + 0.035, -8.56);
    B.box(M.trim, a - 0.2, 2.3, -8, a, 7, -7.93); B.box(M.trim, b, 2.3, -8, b + 0.2, 7, -7.93); B.box(M.trim, a - 0.2, 6.8, -8, b + 0.2, 7.02, -7.9);
    B.box(M.trim, a - 0.28, 2.2, -8.1, b + 0.28, 2.4, -7.8);
    return { a, b, y0: 2.4, y1: 6.8 };
  }
  function trims(r, wains, groundHoles = [], b0 = B, xa = r.x0, xb = r.x1, sides = true) {
    const segs = []; let x = xa; const rail = wains === M.stone || wains === M.panelRed ? M.trim : wains;
    for (const h of groundHoles) { segs.push([x, h.a]); x = h.b; } segs.push([x, xb]);
    for (const [a, b] of segs) {
      b0.box(M.trim, a, 0, -8, b, 0.28, -7.93);
      if (wains) { b0.box(wains, a, 0.28, -8, b, 1.25, -7.965); b0.box(rail, a, 1.25, -8, b, 1.37, -7.92); for (let px = a + 1; px < b - 0.5; px += 2) { b0.box(wains, px + 0.12, 0.4, -7.965, px + 1.88, 1.13, -7.945); } }
    }
    b0.box(M.trim, xa, 7.5, -8, xb, H, -7.78); b0.box(M.trim, xa, 7.32, -8, xb, 7.5, -7.9);
    if (sides) for (const [xw, s] of [[r.x0, 1], [r.x1, -1]]) {
      const x0 = Math.min(xw, xw + s * 0.07), x1 = Math.max(xw, xw + s * 0.07);
      B.box(M.trim, x0, 0, -8, x1, 0.28, 4.6);
      if (wains) { B.box(wains, Math.min(xw, xw + s * 0.035), 0.28, -8, Math.max(xw, xw + s * 0.035), 1.25, 4.6); B.box(rail, Math.min(xw, xw + s * 0.08), 1.25, -8, Math.max(xw, xw + s * 0.08), 1.37, 4.6); }
      B.box(M.trim, Math.min(xw, xw + s * 0.22), 7.5, -8, Math.max(xw, xw + s * 0.22), H, 8);
    }
  }
  function floor(mat, x0, z0, x1, z1, s) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    worldUV(B.add(mat, g), s);
  }
  function divider(xw, mw, me) {
    B.box(mw, xw, 0, -8, xw + 0.5, H, 4.6); B.box(me, xw + 0.5, 0, -8, xw + 1, H, 4.6);
    B.box(mw, xw, 4.4, 4.6, xw + 0.5, H, 8.6); B.box(me, xw + 0.5, 4.4, 4.6, xw + 1, H, 8.6);
    B.box(M.trim, xw - 0.09, 0, 4.6, xw + 1.09, 4.58, 4.74); B.box(M.trim, xw - 0.09, 4.36, 4.74, xw + 1.09, 4.58, 8.6);
    colBox(xw, -9, xw + 1, 4.66);
  }

  // ---------- props ----------
  function plinth(x, z, w, h, mat = M.stone, tall = false) {
    B.cbox(mat, x, 0, z, w + 0.18, 0.14, w + 0.18); B.cbox(mat, x, 0.14, z, w, h - 0.28, w); B.cbox(mat, x, h - 0.14, z, w + 0.14, 0.14, w + 0.14);
    colBox(x - w / 2 - 0.09, z - w / 2 - 0.09, x + w / 2 + 0.09, z + w / 2 + 0.09, tall);
  }
  function placard(x, z, lines, ry = 0, y = 0.72) {
    const m = xf(x, 0, z, ry);
    L(m).cyl(M.brass, 0, 0, 0, 0.02, 0.02, y, 8); L(m).cyl(M.brass, 0, 0, 0, 0.11, 0.09, 0.03, 12);
    L(m).plane(new THREE.PlaneGeometry(0.56, 0.28), texMat(TX.label(lines), { roughness: 0.6 }), 0, y + 0.06, 0.01, -0.75);
  }
  function pad(x, z, room, text = ['ON LOAN', '_back soon']) {
    B.lathe(M.stone, [[0, 0], [0.82, 0], [0.82, 0.04], [0.76, 0.07], [0.76, 0.18], [0.72, 0.22], [0, 0.22]], x, 0, z, 36);
    W.pads.push({ x, z, r: 0.74, h: 0.22, room });
    placard(x + 0.75, z + 0.85, text, 0, 0.5);
  }
  function column(b, x, z, r = 0.5, h = 7) {
    b.lathe(M.stone, [[0, 0], [r * 1.45, 0], [r * 1.45, 0.18], [r * 1.25, 0.2], [r * 1.32, 0.3], [r * 1.12, 0.4], [r, 0.46], [r * 0.98, h * 0.4], [r * 0.86, h - 0.55], [r * 0.93, h - 0.5], [r * 0.86, h - 0.45], [r * 1.2, h - 0.22], [r * 1.3, h - 0.2], [0, h - 0.2]], x, 0, z, 28);
    b.cbox(M.stone, x, h - 0.2, z, r * 2.9, 0.2, r * 2.9); b.cbox(M.stone, x, h, z, r * 2.4, H - h, r * 2.4);
    colCirc(x, z, r * 1.35);
  }
  function sconce(x, y, z, nx, nz, room) {
    const m = xf(x, y, z, Math.atan2(nx, nz));
    const l = L(m); l.box(M.brass, -0.07, -0.22, 0, 0.07, 0.2, 0.03); l.box(M.brass, -0.025, -0.06, 0.03, 0.025, -0.01, 0.26); l.cyl(M.brass, 0, -0.06, 0.25, 0.05, 0.07, 0.08, 10); l.sph(M.bulb, 0, 0.14, 0.25, 0.13);
    emit(x + nx * 0.9, y + 0.15, z + nz * 0.9, WARM, 20, room);
  }
  function painting(x, y, z, w, h, map, nx, nz, lines, room, light = true) {
    const m = xf(x, y, z, Math.atan2(nx, nz)), l = L(m), t = 0.13;
    l.box(M.gold, -w / 2 - t, -h / 2 - t, 0, w / 2 + t, -h / 2, 0.1); l.box(M.gold, -w / 2 - t, h / 2, 0, w / 2 + t, h / 2 + t, 0.1);
    l.box(M.gold, -w / 2 - t, -h / 2, 0, -w / 2, h / 2, 0.1); l.box(M.gold, w / 2, -h / 2, 0, w / 2 + t, h / 2, 0.1);
    l.box(M.gold, -w / 2 - t - 0.04, -h / 2 - t - 0.04, 0, w / 2 + t + 0.04, h / 2 + t + 0.04, 0.035);
    l.plane(new THREE.PlaneGeometry(w, h), texMat(map, { roughness: 0.32, envMapIntensity: 0.6 }), 0, 0, 0.05);
    if (light) {
      l.box(M.brass, -w * 0.3, h / 2 + 0.34, 0.3, w * 0.3, h / 2 + 0.4, 0.4); l.box(M.bulbDim, -w * 0.28, h / 2 + 0.325, 0.31, w * 0.28, h / 2 + 0.34, 0.39);
      l.box(M.brass, -0.02, h / 2 + 0.2, 0, 0.02, h / 2 + 0.36, 0.34);
      emit(x + nx * 1.5, y + h * 0.35, z + nz * 1.5, 0xffc88a, 11, room);
    }
    if (lines) l.plane(new THREE.PlaneGeometry(0.42, 0.21), texMat(TX.label(lines), { roughness: 0.7 }), w / 2 + 0.5, -h / 2 + 0.15, 0.012);
  }
  function bench(x, z, alongX = true) {
    const w = alongX ? 2.4 : 0.75, d = alongX ? 0.75 : 2.4;
    B.cbox(M.wood, x, 0, z, w - 0.2, 0.4, d - 0.2); B.cbox(M.leather, x, 0.4, z, w, 0.13, d);
    colBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, false);
  }
  function ropes(x0, x1, z) {
    const n = Math.max(1, Math.round((x1 - x0) / 2.2)), dx = (x1 - x0) / n;
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * dx;
      B.cyl(M.brass, x, 0, z, 0.16, 0.14, 0.035, 16); B.cyl(M.brass, x, 0.03, z, 0.03, 0.03, 0.9, 10); B.sph(M.brass, x, 0.97, z, 0.055);
      if (i < n) B.add(M.velvet, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 0.9, z), new THREE.Vector3(x + dx / 2, 0.52, z), new THREE.Vector3(x + dx, 0.9, z)), 14, 0.024, 6));
    }
    colBox(x0 - 0.1, z - 0.12, x1 + 0.1, z + 0.12, false);
  }
  function vase(x, y, z, s = 1) {
    B.lathe(M.terracotta, [[0, 0], [0.14, 0], [0.16, 0.04], [0.1, 0.1], [0.2, 0.3], [0.34, 0.6], [0.38, 0.85], [0.32, 1.1], [0.18, 1.28], [0.12, 1.4], [0.13, 1.5], [0.2, 1.56], [0.18, 1.6], [0.1, 1.58], [0, 1.58]], x, y, z, 32, s);
    for (const sg of [-1, 1]) { const g = new THREE.TorusGeometry(0.17, 0.028, 8, 14, Math.PI); g.rotateZ(-sg * Math.PI / 2); g.translate(sg * 0.2, 1.3, 0); B.add(M.black, g, xf(x, y, z, 0, s)); }
    colCirc(x, z, 0.42 * s, false);
  }
  function signpost(x, z, text, arrow) {
    B.cyl(M.brass, x, 0, z, 0.2, 0.17, 0.04, 16); B.cyl(M.brass, x, 0.04, z, 0.025, 0.025, 1.45, 10);
    B.box(M.brass, x - 0.62, 1.42, z - 0.02, x + 0.62, 1.78, z + 0.015);
    single(new THREE.PlaneGeometry(1.2, 0.3), texMat(TX.signTex(text, arrow), { roughness: 0.4, metalness: 0.2 }), x, 1.6, z + 0.02);
    colCirc(x, z, 0.2, false);
  }
  function cabinet(x, z, w, d, h, tall = true) {
    B.cbox(M.wood, x, 0, z, w, 0.8, d); B.cbox(M.wood, x, h - 0.12, z, w + 0.06, 0.12, d + 0.06);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cbox(M.wood, x + sx * (w / 2 - 0.04), 0.8, z + sz * (d / 2 - 0.04), 0.08, h - 0.92, 0.08);
    B.cbox(M.wood, x, 0.8, z - d / 2 + 0.03, w, h - 0.92, 0.05);
    B.cbox(M.glass, x, 0.8, z + d / 2 - 0.03, w - 0.16, h - 0.92, 0.02);
    B.cbox(M.velvet, x, 0.8, z, w - 0.2, 0.03, d - 0.2);
    for (let i = 0; i < 3; i++) { const px = x + (i - 1) * (w - 0.5) / 2.4; B.sph(M.bone, px, 0.95 + (i % 2) * 0.05, z + 0.05, 0.12 + (i % 2) * 0.05, [1, 0.7 + i * 0.25, 0.8]); if (h > 1.6) B.sph(M.bone, px, 1.42, z - 0.1, 0.09, [1.6, 0.5, 0.6]); }
    if (h > 1.6) B.cbox(M.wood, x, 1.3, z, w - 0.1, 0.03, d - 0.1);
    colBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, tall);
  }
  function keyStand(id, x, z) {
    B.cbox(M.stone, x, 0, z, 0.66, 0.1, 0.66); B.cbox(M.stone, x, 0.1, z, 0.5, 0.72, 0.5); B.cbox(M.stone, x, 0.82, z, 0.64, 0.1, 0.64);
    B.sph(M.velvet, x, 0.96, z, 0.24, [1, 0.32, 1]);
    colCirc(x, z, 0.42, false); W.keySpots[id] = { x, y: 1.45, z };
  }
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.3 });
  function bust(x, z, ry, o, ph, s = 0.82) {
    plinth(x, z, 0.78, ph, M.stone, true);
    const m = single(SC.bustGeo(o), M.marble, x, ph, z, ry); m.scale.setScalar(s);
    for (const sg of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 10), eyeMat); e.position.set(sg * 0.125 * (o.wide || 1), 1.25, 0.283); m.add(e); }
    return { x, z, y: ph + 1.75 * s };
  }

  const track = (x, z, I = 40, room) => emit(x, 5.2, z + 2.4, 0xffe0b4, I * 0.7, room);
  // ================= ANTIQUITIES =================
  let r = ROOMS.antiq; B.room = 'antiq';
  floor(M.floorAntiq, r.x0 - 0.5, -8, r.x1 + 0.5, 8.6, 1 / 3.2);
  wallX(B, M.wallAntiq, r.x0 - 0.5, r.x1 + 0.5, -9, -8, [windowN(-35), windowN(-27), windowN(-19)]);
  ceiling(r.x0 - 0.5, r.x1 + 0.5, -9, 8.6, [{ x0: -37.5, x1: -32.5, z0: -5.6, z1: -2.6 }, { x0: -30.2, x1: -26.4, z0: -7.4, z1: -4.4 }, { x0: -22.5, x1: -17.5, z0: -5.6, z1: -2.6 }]);
  trims(r, M.panelRed);
  const philo = bust(-31, -6.6, 0, { beard: true, seed: 3, nose: 1.25 }, 1.15);
  placard(-30.2, -5.9, ['PHILOSOPHER', 'Greek, c. 300 BC', '_marble']);
  const soldier = bust(-23, -6.6, 0, { hair: 'helmet', seed: 5, nose: 1 }, 1.15);
  placard(-22.2, -5.9, ['HEAD OF A SOLDIER', 'Roman, 1st century', '_marble']);
  const lady = bust(-38.4, -2.6, Math.PI / 2, { hair: 'bun', seed: 8, nose: 0.85, wide: 0.92 }, 1.15);
  const baldy = bust(-15.6, -2.6, -Math.PI / 2, { hair: 'bald', seed: 11, nose: 1.5, wide: 1.08 }, 1.15);
  B.lathe(M.stone, [[0, 0], [0.75, 0], [0.75, 0.1], [0.66, 0.14], [0.66, 0.42], [0.72, 0.46], [0.72, 0.52], [0, 0.52]], -33.5, 0, 0.6, 32); colCirc(-33.5, 0.6, 0.78);
  single(SC.venusGeo(), M.marble, -33.5, 0.52, 0.6, 0.35);
  placard(-32.5, 1.6, ['VENUS', 'Hellenistic copy', '_arms not included']);
  plinth(-18, -6.3, 0.9, 0.5); vase(-18, 0.5, -6.3, 1.25); vase(-16.2, 0, -5.5, 1.0); vase(-38.6, 0, 1.6, 1.1);
  B.cyl(M.stone, -21, 0, 0.9, 0.56, 0.54, 0.85, 20); colCirc(-21, 0.9, 0.62, false);
  B.add(M.stone, new THREE.CylinderGeometry(0.5, 0.52, 0.8, 20), xf(-19.9, 0.5, 1.5, 0.4, 1, 0, 1.45));
  colCirc(-19.8, 1.5, 0.55, false);
  pad(-27, -2, 'antiq', ['PORTRAIT OF AN UNKNOWN MAN', 'Roman, c. 120 AD', '_marble (nose missing)']);
  W.home = { x: -27, z: -2 };
  track(-27, -2, 46, 'antiq'); track(-31, -6.6, 34, 'antiq'); track(-23, -6.6, 34, 'antiq'); track(-33.5, 0.6, 38, 'antiq');
  { // conservation notice on an easel
    const m = xf(-24.5, 0, -1.7, -0.3), l = L(m);
    l.box(M.woodLight, -0.36, 0, -0.02, -0.31, 1.7, 0.02); l.box(M.woodLight, 0.31, 0, -0.02, 0.36, 1.7, 0.02); l.box(M.woodLight, -0.4, 0.62, 0, 0.4, 0.67, 0.1); l.box(M.woodLight, -0.025, 0, -0.5, 0.025, 1.6, -0.46);
    l.plane(new THREE.PlaneGeometry(0.74, 0.92), texMat(TX.label(['NOTICE', 'NOSE REMOVED', 'FOR RESTORATION', '_We apologise for', '_any inconvenience.'], 384, 480), { roughness: 0.8 }), 0, 1.15, 0.04, -0.12);
    colCirc(-24.5, -1.7, 0.4, false);
  }
  pad(-37.3, 6.1, 'antiq'); pad(-16.9, 6.2, 'antiq', ['TEMPORARILY REMOVED', '_for cleaning']);
  bench(-27, 5.6);
  sconce(-31, 4.6, -8, 0, 1, 'antiq'); sconce(-23, 4.6, -8, 0, 1, 'antiq'); sconce(-39, 4.2, -8, 0, 1, 'antiq'); sconce(-15, 4.2, -8, 0, 1, 'antiq');
  signpost(-15.4, 3.9, 'ROTUNDA', 1); signpost(-38.6, 3.9, 'NATURAL HISTORY', -1);
  W.talkers.push({ id: 'philo', ...philo, r: 7, lines: ['Psst. Flatface.', 'Your nose is in the Restoration Lab.', 'Three locks. One key in each wing.', 'When the light finds you — be marble.'] });
  W.talkers.push({ id: 'soldier', ...soldier, r: 2.6, lines: ["I've held this expression since 60 AD."] });
  W.talkers.push({ id: 'lady', ...lady, r: 2.6, lines: ['The night guard hums. Listen for it.'] });
  W.talkers.push({ id: 'baldy', ...baldy, r: 2.6, lines: ['Empty plinths are safe. Nobody questions a plinth.'] });
  W.talkers.push({ id: 'venus', x: -33.5, z: 0.6, y: 2.75, r: 2.8, lines: ['If you find any arms in there…'] });

  // ================= ROTUNDA =================
  r = ROOMS.rot; B.room = 'rot';
  floor(M.floorRot, r.x0 - 0.5, -8, r.x1 + 0.5, 8.6, 1 / 3.2);
  { const g = new THREE.CircleGeometry(5.6, 64); g.rotateX(-Math.PI / 2); g.translate(0, 0.004, 0); B.add(M.medallion, g); }
  wallX(B, M.wallRot, r.x0 - 0.5, -9, -9, -8); wallX(B, M.wallRot, 9, r.x1 + 0.5, -9, -8);
  BF.room = 'front';
  wallX(BF, M.wallRot, -9, 9, -9, -8, [{ a: -1.7, b: 1.7, y0: 0, y1: 4.4 }]);
  { // ceiling with oculus
    const sh = new THREE.Shape(); sh.moveTo(r.x0 - 0.5, -8.6); sh.lineTo(r.x1 + 0.5, -8.6); sh.lineTo(r.x1 + 0.5, 9); sh.lineTo(r.x0 - 0.5, 9); sh.closePath();
    const hole = new THREE.Path(); hole.absarc(-1.6, 4, 3, 0, TAU, true); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false, curveSegments: 40 }); g.rotateX(-Math.PI / 2); g.translate(0, H, 0);
    B.add(M.ceil, g);
    const d = new THREE.CircleGeometry(3, 40); d.rotateX(Math.PI / 2); d.translate(-1.6, H + 0.3, -4); B.add(M.skyGlass, d);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; B.add(M.ceilDark, new THREE.BoxGeometry(6, 0.12, 0.09), xf(-1.6, H + 0.08, -4, a)); }
  }
  trims(r, M.stone, [], B, -13, -9, true); trims(r, M.stone, [], B, 9, 13, false); trims(r, M.stone, [{ a: -2.1, b: 2.1 }], BF, -9, 9, false);
  for (const [cx, cz] of [[7.5, 0], [-7.5, 0]]) column(B, cx, cz);
  for (const [cx, cz] of [[6.5, -3.75], [3.75, -6.5], [-3.75, -6.5], [-6.5, -3.75]]) column(BF, cx, cz);
  { // lab door surround
    BF.box(M.trim, -2.1, 0, -8, -1.7, 4.8, -7.84); BF.box(M.trim, 1.7, 0, -8, 2.1, 4.8, -7.84); BF.box(M.trim, -2.3, 4.4, -8, 2.3, 4.95, -7.8);
    const tri = new THREE.Shape(); tri.moveTo(-2.5, 0); tri.lineTo(2.5, 0); tri.lineTo(0, 1.1); tri.closePath();
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.22, bevelEnabled: false }); g.translate(0, 4.95, -8); BF.add(M.trim, g);
    const sg = single(new THREE.PlaneGeometry(2.4, 0.6), texMat(TX.signTex('RESTORATION', 0), { roughness: 0.4 }), 0, 6.55, -7.97, 0, 0, front);
    sg.castShadow = false;
    for (const sx of [-2.9, 2.9]) { BF.cbox(M.stone, sx, 0, -7.35, 0.7, 0.9, 0.7); BF.lathe(M.bronze, [[0, 0], [0.2, 0], [0.12, 0.12], [0.3, 0.4], [0.36, 0.7], [0.26, 0.95], [0.3, 1.02], [0.24, 1.02], [0.2, 0.95], [0, 0.9]], sx, 0.9, -7.35, 24); colBox(sx - 0.4, -7.75, sx + 0.4, -6.95, false); }
    W.anchors.locks = [[-0.7, 4.68, -7.78], [0, 4.68, -7.78], [0.7, 4.68, -7.78]];
  }
  { // security desk
    B.box(M.wood, 7.2, 0, 3.0, 10.0, 1.0, 3.85); B.box(M.woodLight, 7.1, 1.0, 2.95, 10.1, 1.06, 3.9); colBox(7.2, 3.0, 10.0, 3.85, false);
    B.cyl(M.black, 9.3, 1.06, 3.4, 0.09, 0.07, 0.03, 12); B.box(M.black, 9.28, 1.06, 3.38, 9.32, 1.5, 3.42); B.add(M.brass, new THREE.ConeGeometry(0.16, 0.2, 14, 1, true), xf(9.18, 1.52, 3.4, 0, 1, 0, 0.5)); B.sph(M.bulb, 9.16, 1.5, 3.4, 0.055);
    emit(9.0, 1.7, 3.2, WARM, 16, 'rot');
    B.cyl(M.whiteMatte, 7.6, 1.06, 3.5, 0.05, 0.05, 0.12, 12);
    for (let i = 0; i < 2; i++) { B.box(M.black, 7.95 + i * 0.62, 1.06, 3.1, 8.5 + i * 0.62, 1.5, 3.16); single(new THREE.PlaneGeometry(0.5, 0.38), new THREE.MeshBasicMaterial({ map: TX.monitorTex(i + 1), color: new THREE.Color(1.6, 1.6, 1.6) }), 8.225 + i * 0.62, 1.29, 3.09, Math.PI).castShadow = false; }
    W.anchors.sleeper = { x: 8.6, z: 2.25 }; colCirc(8.6, 2.25, 0.55, false);
  }
  pad(-10.9, 5.9, 'rot'); pad(10.9, -5.6, 'rot'); pad(-10.6, -5.6, 'rot', ['GONE TO LUNCH', '_since 1987']);
  sconce(-11, 4.4, -8, 0, 1, 'rot'); sconce(11, 4.4, -8, 0, 1, 'rot'); sconce(-13, 4.2, -2, 1, 0, 'rot'); sconce(13, 4.2, -2, -1, 0, 'rot');
  signpost(-11.5, 3.9, 'ANTIQUITIES', -1); signpost(11.6, 4.4, 'GALLERY', 1);
  colCirc(0, 0, 1.75, false);

  // ================= GALLERY =================
  r = ROOMS.gal; B.room = 'gal';
  floor(M.floorGal, r.x0 - 0.5, -8, r.x1 + 0.5, 8.6, 1);
  wallX(B, M.wallGal, r.x0 - 0.5, r.x1 + 0.5, -9, -8);
  ceiling(r.x0 - 0.5, r.x1 + 0.5, -9, 8.6, [{ x0: 16.5, x1: 21.5, z0: -5.6, z1: -2.6 }, { x0: 25, x1: 30, z0: -5.6, z1: -2.6 }, { x0: 33.5, x1: 38.5, z0: -5.6, z1: -2.6 }]);
  trims(r, M.wood);
  const NP = [[17.4, 1.5, 1.9, 'portrait', ['THE DUKE', '_oil on canvas']], [21.5, 2.7, 1.7, 'landscape', ['EVENING, WITH CYPRESS', '_oil on canvas']], [25.5, 1.4, 1.8, 'portrait', ['A GENTLEMAN, PROBABLY', '_oil on panel']], [29.4, 2.2, 1.6, 'still', ['FRUIT, UNEATEN', '_oil on canvas']], [33.3, 1.6, 2.0, 'portrait', ['THE COUNTESS', '_oil on canvas']], [37.3, 2.5, 1.6, 'landscape', ['A HILL', '_oil on canvas']], [40.7, 1.3, 1.7, 'portrait', ['SELF-PORTRAIT', '_with nose']]];
  NP.forEach(([x, w, h, kind, lines], i) => painting(x, 3.5, -8, w, h, TX.painting(kind, i + 1, Math.round(256 * w / Math.max(w, h)), Math.round(256 * h / Math.max(w, h)) * 1), 0, 1, lines, 'gal'));
  painting(14, 3.4, -3.4, 2.4, 1.6, TX.painting('landscape', 21, 384, 256), 1, 0, null, 'gal'); painting(42, 3.4, -3.6, 2.0, 1.5, TX.painting('still', 22, 384, 288), -1, 0, null, 'gal'); painting(42, 3.4, 1.2, 1.4, 1.8, TX.painting('portrait', 23, 256, 330), -1, 0, null, 'gal', false);
  ropes(15.2, 37.2, -6.7);
  bench(24.2, 0); bench(30.8, 0);
  keyStand('gal', 40.3, -5.9);
  pad(15.7, 1.4, 'gal'); pad(26.6, -2.6, 'gal', ['ON LOAN', '_to somewhere nicer']); pad(40.5, 1.9, 'gal');
  signpost(15.4, 4.3, 'ROTUNDA', -1); signpost(40.7, 4.3, 'MODERN ART', 1);
  W.talkers.push({ id: 'duke', x: 17.4, z: -7.6, y: 4.9, r: 3.4, lines: ['Nice face. Where is the rest of it?'] });

  // ================= MODERN =================
  r = ROOMS.mod; B.room = 'mod';
  floor(M.floorMod, r.x0 - 0.5, -8, r.x1 + 0.5, 8.6, 1 / 6);
  wallX(B, M.wallMod, r.x0 - 0.5, 70, -9, -8, [windowN(46.5), windowN(65.5)]);
  ceiling(r.x0 - 0.5, 70, -9, 8.6, [{ x0: 47.5, x1: 51.5, z0: -5.8, z1: -3 }, { x0: 54, x1: 58, z0: -5.8, z1: -3 }, { x0: 60.5, x1: 64.5, z0: -5.8, z1: -3 }]);
  trims(r, null);
  B.sph(M.red, 47.6, 1.0, -3.6, 1.0, 1, 40); B.sph(M.red, 47.6, 2.55, -3.6, 0.72, 1, 36); B.sph(M.red, 47.6, 3.62, -3.6, 0.46, 1, 30); colCirc(47.6, -3.6, 1.05);
  placard(49.0, -2.6, ['UNTITLED (RED)', '_lacquer, confidence']);
  B.add(M.mirror, new THREE.BoxGeometry(2, 2, 2), xf(64.6, 1.08, -3.8, 0.5)); B.cbox(M.black, 64.6, 0, -3.8, 1.5, 0.08, 1.5, 0.5); colCirc(64.6, -3.8, 1.5);
  B.cbox(M.whiteMatte, 56, 0, -5.6, 2.8, 0.3, 2.0); single(SC.blobGeo(), M.whiteV, 56, 0.3, -5.6, 0.2); colBox(54.6, -6.6, 57.4, -4.6);
  for (const [dx, dz, rz, ry] of [[0, 0, 0.5, 0.2], [0.7, 0.5, -0.35, 1.3], [-0.5, 0.6, 0.2, 2.4]]) B.add(M.yellow, new THREE.BoxGeometry(0.28, 4.2, 0.28), xf(66.4 + dx, 1.9, 3.6 + dz, ry, 1, 0.25, rz));
  colCirc(66.6, 3.9, 1.25);
  placard(64.9, 5.2, ['THREE BEAMS', '_steel, leaning']);
  painting(69, 3.3, -4.2, 2.2, 2.2, TX.painting('#1f3fd0', 31, 128, 128), -1, 0, ['BLUE', '_blue'], 'mod', false); painting(69, 3.3, -0.4, 1.8, 2.2, TX.painting('#efece4', 32, 128, 128), -1, 0, ['WHITE ON WHITE', '_on white'], 'mod', false);
  painting(43, 3.3, -3.4, 2.4, 2.4, TX.painting('abstract', 33, 256, 256), 1, 0, ['COMPOSITION', '_with shapes'], 'mod', false);
  { const nm = new THREE.MeshBasicMaterial({ map: TX.neonTex('is this art?', '#ff4fa3'), transparent: true, color: new THREE.Color(2.6, 2.6, 2.6), depthWrite: false, blending: THREE.AdditiveBlending });
    single(new THREE.PlaneGeometry(7.2, 1.8), nm, 56, 5.3, -7.96).castShadow = false; emit(56, 4.9, -6.6, 0xff5fae, 26, 'mod'); }
  emit(49, 5.2, 1, COOL, 17, 'mod'); emit(63, 5.2, 1, COOL, 17, 'mod'); emit(56, 5.5, -3, COOL, 14, 'mod');
  B.cbox(M.whiteMatte, 56, 0, -1.6, 0.8, 0.95, 0.8); colBox(55.55, -2.05, 56.45, -1.15, false);
  W.keySpots.mod = { x: 56, y: 1.5, z: -1.6 }; W.anchors.vitrine = { x: 56, y: 0.95, z: -1.6 };
  placard(57.0, -0.9, ['UNTITLED (KEY)', '_brass, locked glass']);
  W.tiles = []; for (let i = 0; i < 8; i++) W.tiles.push({ x0: 49.2 + i * 1.7, x1: 49.2 + (i + 1) * 1.7, z0: 1.6, z1: 3.3 });
  placard(48.3, 3.9, ['PLEASE STEP ON THE ART', '_light, sound, liability']);
  signpost(44.5, 4.3, 'GALLERY', -1);
  pad(44.8, 1.4, 'mod', ['UNTITLED (ABSENCE)', '_air, plinth']); pad(67.4, -0.4, 'mod', ['THIS SPACE', '_intentionally left blank']);
  W.anchors.dots = { x: 56, y: 3.35, z: -7.95 };

  // ================= NATURAL HISTORY =================
  r = ROOMS.dino; B.room = 'dino';
  floor(M.floorDino, -70, -8, r.x1 + 0.5, 8.6, 1 / 4);
  wallX(B, M.wallDino, -70, r.x1 + 0.5, -9, -8, [windowN(-64.5), windowN(-55), windowN(-45.5)]);
  ceiling(-70, r.x1 + 0.5, -9, 8.6, [{ x0: -63.5, x1: -50, z0: -6.6, z1: -3.8 }]);
  trims(r, M.wood);
  B.box(M.slate, -63, 0, -3.2, -47.6, 0.35, 1.2); B.box(M.brass, -63.05, 0.3, -3.25, -47.55, 0.345, -3.2); B.box(M.brass, -63.05, 0.3, 1.2, -47.55, 0.345, 1.25); B.box(M.brass, -63.05, 0.3, -3.2, -63, 0.345, 1.2); B.box(M.brass, -47.6, 0.3, -3.2, -47.55, 0.345, 1.2); colBox(-63, -3.2, -47.6, 1.2, false);
  placard(-55, 1.9, ['TYRANNOSAURUS', 'Late Cretaceous', '_light sleeper']);
  cabinet(-50.6, 4.6, 1.2, 1.2, 2.1); cabinet(-56.8, 5.9, 1.2, 1.2, 2.1); cabinet(-60.5, -6.6, 2.6, 1.0, 2.0); cabinet(-50.5, -6.6, 2.6, 1.0, 2.0);
  for (const [fx, sd] of [[-59.8, 4], [-50.2, 9]]) { B.box(M.stone, fx - 0.75, 3.0, -8, fx + 0.75, 4.5, -7.9); single(new THREE.PlaneGeometry(1.3, 1.3), texMat(TX.fossilTex(sd), { roughness: 0.8 }), fx, 3.75, -7.89); sconce(fx, 5.5, -8, 0, 1, 'dino'); }
  plinth(-43.4, -5.9, 0.9, 0.8);
  { const g = new THREE.IcosahedronGeometry(0.5, 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 9) * Math.cos(p.getY(i) * 7 + p.getZ(i) * 5) * 0.16; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); } g.computeVertexNormals(); B.add(M.black, g, xf(-43.4, 1.15, -5.9)); }
  placard(-42.5, -5.0, ['METEORITE', '_please touch']);
  keyStand('dino', -66.6, -5.3);
  pad(-43.2, 2.2, 'dino'); pad(-54.2, 6.7, 'dino'); pad(-63.6, 6.3, 'dino', ['EXTINCT', '_back never']);
  signpost(-42.6, 4.3, 'ANTIQUITIES', 1);
  sconce(-69, 4.2, 2, 1, 0, 'dino'); sconce(-41, 4.2, -3, -1, 0, 'dino');

  // ================= LAB =================
  r = ROOMS.lab; B.room = 'lab';
  floor(M.floorLab, -8, -21, 8, -8, 1 / 2);
  B.box(M.wallLab, -9, 0, -22, -8, H, -9); B.box(M.wallLab, 8, 0, -22, 9, H, -9); B.box(M.wallLab, -9, 0, -22, 9, H, -21);
  colBox(-9.5, -22, -8, -9); colBox(8, -22, 9.5, -9); colBox(-9, -22.5, 9, -21);
  ceiling(-9, 9, -22, -9, [{ x0: -5.5, x1: -0.5, z0: -19.6, z1: -17 }]);
  B.box(M.trim, -8, 0, -21, 8, 0.2, -20.94);
  B.box(M.woodLight, -5.4, 0.84, -15.65, 5.4, 0.92, -14.35); for (const [lx, lz] of [[-5.2, -15.5], [5.2, -15.5], [-5.2, -14.5], [5.2, -14.5]]) B.cbox(M.steel, lx, 0, lz, 0.07, 0.84, 0.07);
  colBox(-5.4, -15.65, 5.4, -14.35, false);
  for (let i = 0; i < 8; i++) { const x = -4.55 + i * 1.3; B.cyl(M.brass, x, 0.92, -15, 0.09, 0.07, 0.02, 12); B.cyl(M.brass, x, 0.94, -15, 0.012, 0.012, 0.22, 6); W.noseSpots.push({ x, y: 1.24, z: -15 }); }
  for (const lx of [-3.2, 3.3]) { B.cyl(M.black, lx, 0.92, -15.45, 0.1, 0.08, 0.03, 12); B.add(M.black, new THREE.CylinderGeometry(0.014, 0.014, 0.7, 6), xf(lx, 1.25, -15.4, 0, 1, 0.25)); B.add(M.black, new THREE.CylinderGeometry(0.014, 0.014, 0.6, 6), xf(lx, 1.72, -15.12, 0, 1, 1.15)); B.add(M.steel, new THREE.ConeGeometry(0.15, 0.2, 14, 1, true), xf(lx, 1.78, -14.84, 0, 1, 0.5)); B.sph(M.bulb, lx, 1.76, -14.86, 0.05); emit(lx, 1.9, -14.6, WARM, 15, 'lab'); }
  emit(-4, 5.5, -13, COOL, 26, 'lab'); emit(4.5, 5.5, -17, COOL, 26, 'lab');
  B.box(M.wood, -7.6, 0, -20.9, 7.6, 0.9, -20.1); B.box(M.woodLight, -7.7, 0.9, -20.95, 7.7, 0.96, -20.05); colBox(-7.7, -21, 7.7, -20.05, false);
  B.box(M.woodLight, -7.6, 2.2, -20.95, 7.6, 2.26, -20.55); B.box(M.woodLight, -7.6, 3.1, -20.95, 7.6, 3.16, -20.55);
  const jarCols = [M.red, M.yellow, M.blue, M.whiteMatte, M.terracotta, M.bronze];
  for (let i = 0; i < 20; i++) { const x = -7.2 + i * 0.75 + (i % 3) * 0.05, y = i % 2 ? 2.26 : 3.16, hh = 0.25 + (i % 4) * 0.07; B.cyl(jarCols[i % 6], x, y, -20.75, 0.11, 0.11, hh, 12); B.cyl(M.steel, x, y + hh, -20.75, 0.115, 0.115, 0.03, 12); }
  for (let i = 0; i < 7; i++) { const x = -6.5 + i * 2.05; if (i % 2) { B.cyl(M.whiteMatte, x, 0.96, -20.5, 0.13, 0.11, 0.2, 14); for (let k = 0; k < 4; k++) B.add(M.woodLight, new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5), xf(x + (k - 1.5) * 0.04, 1.2, -20.5, k, 1, 0.25)); } else B.cbox(M.stone, x, 0.96, -20.5, 0.4, 0.3 + (i % 3) * 0.1, 0.3, 0.3 * i); }
  { // crate of arms
    B.cbox(M.woodLight, -6.5, 0, -11.4, 1.3, 0.8, 1.0, 0.15); colBox(-7.2, -12, -5.8, -10.8, false);
    for (let i = 0; i < 5; i++) { const g = new THREE.CapsuleGeometry(0.075, 0.75, 6, 12); B.add(M.stone, g, xf(-6.9 + i * 0.2, 0.95, -11.4 + (i % 2) * 0.2 - 0.1, i, 1, 0.3 + (i % 3) * 0.2, (i - 2) * 0.22)); B.sph(M.stone, -6.9 + i * 0.2 + (i - 2) * 0.09, 1.42, -11.4 + (i % 2) * 0.2 - 0.02, 0.1, [1, 1.2, 0.7]); }
    single(new THREE.PlaneGeometry(0.9, 0.3), texMat(TX.label(['ARMS (ASSORTED)'], 384, 128, { bg: '#c9a878' }), { roughness: 0.8 }), -6.42, 0.45, -10.88, 0.15);
    B.cbox(M.steel, 6.4, 0, -11.6, 1.2, 0.06, 0.8); B.cbox(M.steel, 6.4, 0.5, -11.6, 1.2, 0.04, 0.8); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cbox(M.steel, 6.4 + sx * 0.55, 0, -11.6 + sz * 0.35, 0.04, 0.9, 0.04);
    for (let i = 0; i < 5; i++) B.sph(M.stone, 6.0 + i * 0.2, 0.62, -11.6 + (i % 2) * 0.15, 0.07, [0.6, 1.2, 0.9]);
    single(new THREE.PlaneGeometry(0.7, 0.24), texMat(TX.label(['EARS'], 256, 96, { bg: '#c9a878' }), { roughness: 0.8 }), 6.4, 0.3, -11.19);
    colBox(5.8, -12, 7, -11.2, false);
  }

  // ---------- shell: dividers, ends, south cut ----------
  B.room = 'shell';
  divider(-41, M.wallDino, M.wallAntiq); divider(-14, M.wallAntiq, M.wallRot); divider(13, M.wallRot, M.wallGal); divider(42, M.wallGal, M.wallMod);
  B.box(M.wallDino, -70.5, 0, -9, -69, H, 8.6); B.box(M.wallMod, 69, 0, -9, 70.5, H, 8.6);
  colBox(-72, -10, -69, 10); colBox(69, -10, 72, 10);
  B.box(M.cut, -70.5, 0, 8, 70.5, 0.9, 8.6); colBox(-72, 8, 72, 10, false);
  colBox(-72, -9.6, -1.7, -8); colBox(1.7, -9.6, 72, -8);

  W.statics = B.finalize().concat(BF.finalize());
  W.floors = W.statics.filter((m) => m.material.userData.floor);
  return W;
}

// ---------- collision & sight ----------
export function collide(W, p, r) {
  for (let it = 0; it < 2; it++) {
    for (const b of W.boxes) {
      if (!b.on) continue;
      const cx = Math.max(b.x0, Math.min(b.x1, p.x)), cz = Math.max(b.z0, Math.min(b.z1, p.z));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
      else { const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z, m = Math.min(l, rr, t, bb); if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r; }
    }
    for (const c of W.circles) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m) { if (d < 1e-6) p.x += m; else { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } }
    }
  }
}
// true when the segment a->b is blocked by a tall collider
export function blocked(W, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  for (const b of W.boxes) {
    if (!b.tall || !b.on) continue;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < b.x0 || ax > b.x1) continue; } else { let u0 = (b.x0 - ax) / dx, u1 = (b.x1 - ax) / dx; if (u0 > u1) { const s = u0; u0 = u1; u1 = s; } t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) continue; }
    if (Math.abs(dz) < 1e-9) { if (az < b.z0 || az > b.z1) continue; } else { let u0 = (b.z0 - az) / dz, u1 = (b.z1 - az) / dz; if (u0 > u1) { const s = u0; u0 = u1; u1 = s; } t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) continue; }
    return true;
  }
  const l2 = dx * dx + dz * dz;
  for (const c of W.circles) {
    if (!c.tall) continue;
    const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / (l2 || 1)));
    if (Math.hypot(ax + dx * t - c.x, az + dz * t - c.z) < c.r * 0.9) return true;
  }
  return false;
}
// distance along a ray until a tall box is hit (for clipping beams)
export function rayDist(W, ax, az, dx, dz, max) {
  let best = max;
  for (const b of W.boxes) {
    if (!b.tall || !b.on) continue;
    let t0 = 0, t1 = best, ok = true;
    for (const [o, d, lo, hi] of [[ax, dx, b.x0, b.x1], [az, dz, b.z0, b.z1]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } }
      else { let u0 = (lo - o) / d, u1 = (hi - o) / d; if (u0 > u1) { const s = u0; u0 = u1; u1 = s; } t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) { ok = false; break; } }
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
}
