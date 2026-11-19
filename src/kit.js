import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as TX from './tex.js';
import { hookFloor } from './render.js';

export function prep(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  return g;
}
// box-projected world-space UVs
export function worldUV(g, s) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) * s, p.getZ(i) * s);
    else if (ax >= az) uv.setXY(i, p.getZ(i) * s, p.getY(i) * s);
    else uv.setXY(i, p.getX(i) * s, p.getY(i) * s);
  }
  return g;
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
export const xf = (x, y, z, ry = 0, s = 1, rx = 0, rz = 0) => M4.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')), typeof s === 'number' ? S.set(s, s, s) : S.set(s[0], s[1], s[2])).clone();

export class Builder {
  constructor(scene) { this.scene = scene; this.map = new Map(); this.room = 'x'; this.meshes = []; }
  add(mat, g, m) {
    g = prep(g); if (m) g.applyMatrix4(m);
    const key = this.room + '|' + mat.uuid;
    if (!this.map.has(key)) this.map.set(key, { mat, list: [] });
    this.map.get(key).list.push(g);
    return g;
  }
  box(mat, x0, y0, z0, x1, y1, z1, uvs = 0.5) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return worldUV(this.add(mat, g), uvs);
  }
  // box centred at x,z sitting on y
  cbox(mat, x, y, z, w, h, d, ry = 0, uvs = 0.5) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
    const p = prep(g); worldUV(p, uvs); p.applyMatrix4(xf(x, y, z, ry));
    return this.add(mat, p);
  }
  cyl(mat, x, y, z, r0, r1, h, seg = 24, m) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(0, h / 2, 0);
    return this.add(mat, g, m || xf(x, y, z));
  }
  sph(mat, x, y, z, r, sc, seg = 20) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.7 | 0));
    return this.add(mat, g, xf(x, y, z, 0, sc || 1));
  }
  lathe(mat, pts, x, y, z, seg = 32, s = 1) {
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg);
    return this.add(mat, g, xf(x, y, z, 0, s));
  }
  finalize() {
    for (const { mat, list } of this.map.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = mat.userData.cast !== false; mesh.receiveShadow = mat.userData.recv !== false;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh); this.meshes.push(mesh);
    }
    this.map.clear();
    return this.meshes;
  }
}

export function makeMaterials() {
  const std = (o, ud) => { const m = new THREE.MeshStandardMaterial(o); if (ud) Object.assign(m.userData, ud); return m; };
  const pl = TX.plaster(512), plN = TX.normalFrom(pl.map.image, 1.2);
  const wall = (c) => std({ color: c, map: pl.map, roughnessMap: pl.rough, roughness: 1, normalMap: plN, normalScale: new THREE.Vector2(0.25, 0.25) });
  const floor = (t, k, blur, extra = {}) => hookFloor(std({ map: t.map, roughnessMap: t.rough, roughness: 1, metalness: 0, envMapIntensity: 0.15, ...extra }, { cast: false, floor: true }), k, blur);
  const cream = { base: [0.86, 0.81, 0.70], vein: [0.55, 0.48, 0.40], sc: 5, warp: 1.2, sharp: 16, amt: 0.4, rough: 0.1 };
  const terra = { base: [0.55, 0.24, 0.17], vein: [0.86, 0.74, 0.62], sc: 5, warp: 1.3, sharp: 20, amt: 0.5, rough: 0.12 };
  const white = { base: [0.9, 0.89, 0.86], vein: [0.5, 0.52, 0.56], sc: 5, warp: 1.3, sharp: 18, amt: 0.45, rough: 0.08 };
  const black = { base: [0.07, 0.085, 0.08], vein: [0.75, 0.78, 0.74], sc: 5, warp: 1.5, sharp: 22, amt: 0.6, rough: 0.07 };
  const green = { base: [0.09, 0.2, 0.16], vein: [0.7, 0.8, 0.72], sc: 5, warp: 1.5, sharp: 20, amt: 0.55, rough: 0.08 };
  const M = {
    wallAntiq: wall(0x8a3327), wallRot: wall(0xcbbfa6), wallGal: wall(0x1d4a40), wallDino: wall(0x1c2a4a), wallMod: wall(0xe8e5de), wallLab: wall(0x9fb9a6),
    ceil: std({ color: 0xd8d2c4, roughness: 0.9 }),
    ceilDark: std({ color: 0x1c1b1b, roughness: 0.7 }),
    whiteV: std({ vertexColors: true, roughness: 0.82 }),
    slate: std({ color: 0x1d2024, roughness: 0.4 }),
    cut: std({ color: 0x14151a, roughness: 0.9 }),
    trim: std({ color: 0xe6dfcf, roughness: 0.55, map: pl.map }),
    trimDark: std({ color: 0x22201f, roughness: 0.5, metalness: 0.3 }),
    stone: std({ color: 0xd9d1bf, roughness: 0.6, map: pl.map }),
    wood: std({ color: 0x3b2416, roughness: 0.62 }),
    panelRed: std({ color: 0x4d1a15, roughness: 0.32 }),
    woodLight: std({ color: 0x8a5a33, roughness: 0.5 }),
    leather: std({ color: 0x4a1f1a, roughness: 0.4 }),
    velvet: std({ color: 0x8c1722, roughness: 0.95 }),
    gold: std({ color: 0xd6a94a, roughness: 0.3, metalness: 1, envMapIntensity: 4.5 }),
    brass: std({ color: 0xb8893a, roughness: 0.35, metalness: 1, envMapIntensity: 2.6 }),
    bronze: std({ color: 0x5b4126, roughness: 0.42, metalness: 0.9, envMapIntensity: 2.4 }),
    steel: std({ color: 0xaab0b8, roughness: 0.25, metalness: 1, envMapIntensity: 2.6 }),
    black: std({ color: 0x101114, roughness: 0.5, metalness: 0.4 }),
    terracotta: std({ map: TX.vaseTex(), roughness: 0.7 }),
    bone: std({ color: 0xd9c9a2, roughness: 0.7 }),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 1.1) }),
    bulbDim: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.05, 0.55) }),
    moonGlass: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 1.5) }),
    skyGlass: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.3, 2.6), side: THREE.DoubleSide }),
    glass: std({ color: 0xcfe6ff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 9, depthWrite: false }, { cast: false, glass: true }),
    red: std({ color: 0xc8201c, roughness: 0.12, envMapIntensity: 2.5 }),
    yellow: std({ color: 0xe8b21a, roughness: 0.35 }),
    blue: std({ color: 0x2247c9, roughness: 0.3 }),
    whiteMatte: std({ color: 0xeeeeea, roughness: 0.85 }),
    mirror: std({ color: 0xffffff, roughness: 0.03, metalness: 1, envMapIntensity: 2.2 }),
    marble: std({ vertexColors: true, roughness: 0.38, envMapIntensity: 0.5 }),
    boneV: std({ vertexColors: true, roughness: 0.7, envMapIntensity: 0.3 }),
    floorAntiq: floor(TX.marbleTiles(1024, cream, terra, 1), 0.65, 1),
    floorRot: floor(TX.marbleTiles(1024, white, cream, 5), 0.9, 1),
    floorDino: floor(TX.marbleTiles(1024, black, green, 9), 1.0, 1),
    floorGal: floor(TX.parquet(1024), 0.75, 1),
    floorMod: floor(TX.concrete(512), 0.6, 1),
    floorLab: floor(TX.lino(512), 0.6, 1),
    medallion: floor({ map: TX.medallion(1024), rough: null }, 0.9, 1, { roughness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  for (const k of ['bulb', 'bulbDim', 'moonGlass', 'skyGlass']) M[k].userData.cast = false;
  M.ceil.userData.ceil = true; M.skyGlass.userData.ceil = true; M.ceilDark.userData.ceil = true;
  return M;
}
