import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SC from './sculpt.js';
import * as TX from './tex.js';
import { collide, blocked, rayDist } from './museum.js';
import { NSPOT } from './render.js';
import { TAU, clamp, damp, dampAng, angDiff, yawOf, lerp, rng } from './util.js';

const mesh = (g, m, x = 0, y = 0, z = 0, cast = true) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o; };
const sphG = (r, a = 18, b = 12) => new THREE.SphereGeometry(r, a, b);
const std = (o) => new THREE.MeshStandardMaterial(o);

// ---------------- HERO ----------------
const S = 0.85;
export class Hero {
  constructor(scene, M) {
    this.g = new THREE.Group(); this.sq = new THREE.Group(); this.g.add(this.sq); scene.add(this.g);
    this.sq.add(mesh(SC.bustGeo({ nose: 0, seed: 1, h: 0.0135 }), M.marble));
    this.sq.scale.setScalar(S);
    const stone = std({ color: 0xe4ded0, roughness: 0.36 }), dark = std({ color: 0x3a3833, roughness: 0.5 });
    this.eyes = [-1, 1].map((s) => {
      const root = new THREE.Group(); root.position.set(s * 0.125, 1.25, 0.283); this.sq.add(root);
      const gaze = new THREE.Group(); root.add(gaze);
      gaze.add(mesh(sphG(0.06), stone, 0, 0, 0, false));
      const p = mesh(sphG(0.027, 12, 8), dark, 0, 0, 0.0535, false); p.scale.z = 0.35; gaze.add(p);
      const lid = mesh(new THREE.SphereGeometry(0.066, 16, 8, 0, TAU, 0, Math.PI / 2), stone, 0, 0, 0, false); root.add(lid);
      const brow = mesh(new THREE.CapsuleGeometry(0.017, 0.1, 4, 8), stone, s * 0.125, 1.352, 0.335, false); brow.rotation.z = Math.PI / 2; this.sq.add(brow);
      return { gaze, lid, brow, s };
    });
    this.noseAt = new THREE.Group(); this.noseAt.position.set(0, 1.17, 0.355); this.sq.add(this.noseAt);
    this.x = 0; this.z = 0; this.base = 0; this.air = 0; this.yaw = 0; this.tyaw = 0;
    this.hopping = false; this.ht = 0; this.hd = 0.25; this.vx = 0; this.vz = 0; this.hh = 0.3; this.cool = 0; this.sinceLand = 9; this.land = 0;
    this.moving = false; this.pushT = 0; this.frozen = false; this.onPad = null; this.t = 0; this.blink = 2; this.mood = 0; this.wink = 0;
    this.look = null; this.gy = 0; this.gp = 0; this.sneakHop = false; this.onLand = null; this.p = { x: 0, z: 0 };
  }
  place(x, z, yaw = 0) { this.x = x; this.z = z; this.yaw = this.tyaw = yaw; this.hopping = false; this.air = 0; this.sinceLand = 9; this.pushT = 0; }
  update(dt, ix, iz, sneak, W) {
    this.t += dt; this.pushT = Math.max(0, this.pushT - dt);
    if (this.hopping) {
      this.ht += dt / this.hd;
      this.p.x = this.x + this.vx * dt; this.p.z = this.z + this.vz * dt; collide(W, this.p, 0.36); this.x = this.p.x; this.z = this.p.z;
      this.air = Math.sin(Math.PI * Math.min(1, this.ht)) * this.hh;
      if (this.ht >= 1) { this.hopping = false; this.air = 0; this.land = 1; this.sinceLand = 0; this.cool = 0.03; if (this.onLand) this.onLand(this.sneakHop); }
    } else {
      this.sinceLand += dt; this.cool -= dt;
      if ((ix || iz) && this.cool <= 0 && !this.frozen) {
        const l = Math.hypot(ix, iz), dx = ix / l, dz = iz / l, dist = sneak ? 0.42 : 1.05;
        this.sneakHop = sneak; this.hd = sneak ? 0.3 : 0.25; this.hh = sneak ? 0.045 : 0.3;
        this.vx = dx * dist / this.hd; this.vz = dz * dist / this.hd; this.hopping = true; this.ht = 0; this.tyaw = yawOf(dx, dz);
      }
    }
    this.moving = this.hopping || this.sinceLand < 0.08 || this.pushT > 0;
    let pad = null; for (const p of W.pads) if (Math.hypot(p.x - this.x, p.z - this.z) < p.r) { pad = p; break; }
    this.onPad = pad; this.base = damp(this.base, pad ? pad.h : 0, 20, dt);
    this.yaw = dampAng(this.yaw, this.tyaw, 16, dt);
    this.land = Math.max(0, this.land - dt * 5);
    const k = this.hopping ? Math.sin(Math.PI * Math.min(1, this.ht)) : 0, sy = 1 + k * 0.1 - this.land * 0.16 * Math.sin(this.land * 3.2);
    this.sq.scale.set(S * (2 - sy), S * sy, S * (2 - sy));
    this.sq.rotation.x = k * (this.sneakHop ? 0.05 : 0.17);
    this.sq.rotation.z = this.hopping && this.sneakHop ? Math.sin(this.t * 22) * 0.04 : 0;
    this.g.position.set(this.x, this.base + this.air, this.z); this.g.rotation.y = this.yaw;
    // face
    let ty = 0, tp = 0;
    if (this.look) { ty = clamp(angDiff(this.yaw, yawOf(this.look.x - this.x, this.look.z - this.z)), -1.1, 1.1); tp = clamp(((this.look.y ?? 1.6) - 1.1) * 0.12, -0.3, 0.4); }
    else { ty = Math.sin(this.t * 0.7) * 0.25 * (this.moving ? 0 : 1); }
    this.gy = damp(this.gy, ty, 10, dt); this.gp = damp(this.gp, tp, 10, dt);
    this.blink -= dt; if (this.blink < -0.13) this.blink = 1.2 + Math.random() * 3.5;
    const mood = this.mood;
    for (const e of this.eyes) {
      e.gaze.rotation.set(-this.gp * 0.7, this.gy * 0.62, 0);
      let lid = this.blink < 0 ? 1.45 : (mood === 1 ? -0.25 : 0.12);
      if (this.wink > 0 && e.s > 0) lid = 1.45;
      e.lid.rotation.x = damp(e.lid.rotation.x, lid, 30, dt);
      const tilt = mood === 1 ? 0.38 : mood === 2 ? 0.1 : -0.28;
      e.brow.rotation.z = Math.PI / 2 + damp(e.brow.rotation.z - Math.PI / 2, e.s * tilt, 12, dt);
      e.brow.position.y = damp(e.brow.position.y, mood === 1 ? 1.372 : mood === 2 ? 1.38 : 1.35, 12, dt);
    }
    if (this.wink > 0) this.wink -= dt;
  }
}

// ---------------- GUARD ----------------
const navy = std({ color: 0x1b2440, roughness: 0.7 }), blk = std({ color: 0x0c0c10, roughness: 0.45 }), glove = std({ color: 0xf2efe6, roughness: 0.6 }), goldM = std({ color: 0xd6a94a, roughness: 0.3, metalness: 1 });
const lens = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.6, 2.6) });
function guardRig(o) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const skin = std({ color: o.skin, roughness: 0.6 }), hair = std({ color: o.hair, roughness: 0.8 });
  const torso = mesh(new THREE.CapsuleGeometry(0.4, 0.5, 8, 20), navy, 0, 1.02, 0); torso.scale.set(o.fat, 1, o.fat * 0.86); body.add(torso);
  const belt = mesh(new THREE.TorusGeometry(0.405, 0.035, 8, 24), blk, 0, 0.8, 0); belt.rotation.x = Math.PI / 2; belt.scale.set(o.fat, o.fat * 0.86, 1); body.add(belt);
  for (let i = 0; i < 3; i++) body.add(mesh(sphG(0.03, 8, 6), goldM, 0, 0.98 + i * 0.16, 0.345 * o.fat - (i === 2 ? 0.02 : 0), false));
  body.add(mesh(sphG(0.05, 8, 6), goldM, -0.2 * o.fat, 1.3, 0.28 * o.fat, false));
  const head = new THREE.Group(); head.position.set(0, 1.76, 0); body.add(head);
  head.add(mesh(sphG(0.29, 24, 18), skin));
  const nose = mesh(sphG(0.085), skin, 0, -0.02, 0.29, false); nose.scale.set(1, 1.1, 1.25); head.add(nose);
  for (const s of [-1, 1]) {
    const m = mesh(sphG(0.09), hair, s * 0.095, -0.1, 0.25, false); m.scale.set(1.5, 0.5, 0.6); m.rotation.z = -s * 0.35; head.add(m);
    head.add(mesh(sphG(0.03, 8, 6), blk, s * 0.105, 0.07, 0.262, false));
    const br = mesh(sphG(0.05, 8, 6), hair, s * 0.105, 0.145, 0.25, false); br.scale.set(1.3, 0.3, 0.4); head.add(br);
  }
  head.add(mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.13, 24), navy, 0, 0.25, 0));
  head.add(mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.07, 24), navy, 0, 0.34, 0));
  const brim = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 20, 1, false, -Math.PI / 2, Math.PI), blk, 0, 0.19, 0.1); brim.rotation.y = Math.PI / 2; brim.scale.set(1, 1, 1); head.add(brim);
  head.add(mesh(sphG(0.045, 8, 6), goldM, 0, 0.27, 0.3, false));
  const hl = mesh(sphG(0.1), glove, -0.52 * o.fat, 0.98, 0.05), hr = new THREE.Group(); hr.position.set(0.46 * o.fat, 1.12, 0.3); body.add(hl, hr);
  hr.add(mesh(sphG(0.1), glove));
  const torch = mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.34, 12), blk, 0, 0.02, 0.16); torch.rotation.x = Math.PI / 2; hr.add(torch);
  const ln = mesh(new THREE.CircleGeometry(0.062, 12), lens, 0, 0.02, 0.335, false); hr.add(ln);
  const feet = [-1, 1].map((s) => { const f = mesh(sphG(0.14), blk, s * 0.17, 0.08, 0.05); f.scale.set(0.9, 0.55, 1.5); g.add(f); return f; });
  g.scale.setScalar(o.tall);
  return { g, body, head, hl, hr, feet };
}
export class Guard {
  constructor(scene, o) {
    Object.assign(this, { speed: 1.45, name: 'guard', tall: 1, fat: 1, skin: 0xe2ac8a, hair: 0x4a2f1c }, o);
    this.rig = guardRig(this); scene.add(this.rig.g);
    this.kind = 'guard'; this.alert = 0; this.doubt = 0; this.doubtRate = 0.24;
    this.reset();
  }
  reset() {
    const r = this.route[0]; this.x = r.x; this.z = r.z; this.wp = 1 % this.route.length; this.state = 'patrol'; this.timer = 0; this.alert = 0; this.doubt = 0; this.stuck = 0;
    const n = this.route[this.wp]; this.yaw = yawOf(n.x - r.x, n.z - r.z || 1e-6); this.lightYaw = this.yaw; this.walk = 0; this.t = Math.random() * 10; this.sway = 0; this.poi = null;
  }
  hear(x, z, loud) {
    if (this.state === 'stare' || this.state === 'carry') return;
    this.poi = { x, z };
    if (loud) { this.state = 'investigate'; this.timer = 9; } else if (this.state === 'patrol' || this.state === 'wait') { this.state = 'look'; this.timer = 1.3; }
  }
  sees(h, W) {
    const dx = h.x - this.x, dz = h.z - this.z, d = Math.hypot(dx, dz);
    if (d > 10.5) return false;
    if (d > 1.7 && Math.abs(angDiff(this.lightYaw, yawOf(dx, dz))) > 0.37) return false;
    return !blocked(W, this.x, this.z, h.x, h.z);
  }
  moveTo(tx, tz, dt, W, sp) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.12) return true;
    const st = Math.min(d, sp * dt), p = { x: this.x + dx / d * st, z: this.z + dz / d * st };
    collide(W, p, 0.38);
    if (this.avoid) { const hx = p.x - this.avoid.x, hz = p.z - this.avoid.z, hd = Math.hypot(hx, hz); if (hd < 0.95 && hd > 1e-3) { p.x = this.avoid.x + hx / hd * 0.95 + -hz / hd * sp * dt * 0.8; p.z = this.avoid.z + hz / hd * 0.95 + hx / hd * sp * dt * 0.8; } }
    const mv = Math.hypot(p.x - this.x, p.z - this.z);
    this.stuck = mv < st * 0.3 ? this.stuck + dt : Math.max(0, this.stuck - dt);
    this.x = p.x; this.z = p.z; this.walk += mv * 3.4;
    this.yaw = dampAng(this.yaw, yawOf(dx, dz), 6, dt);
    return false;
  }
  update(dt, G) {
    const W = G.W, h = G.hero; this.t += dt; this.avoid = h;
    let swayAmp = 0.42, face = null;
    if (this.state === 'patrol') {
      const n = this.route[this.wp];
      if (this.moveTo(n.x, n.z, dt, W, this.speed) || this.stuck > 1.5) { this.stuck = 0; if (n.wait) { this.state = 'wait'; this.timer = n.wait; this.face = n.face; } this.wp = (this.wp + 1) % this.route.length; }
    } else if (this.state === 'wait') {
      this.timer -= dt; swayAmp = 0.9; if (this.face !== undefined) face = this.face; if (this.timer <= 0) this.state = 'patrol';
    } else if (this.state === 'look') {
      this.timer -= dt; face = yawOf(this.poi.x - this.x, this.poi.z - this.z); swayAmp = 0.1; if (this.timer <= 0) this.state = 'patrol';
    } else if (this.state === 'investigate') {
      this.timer -= dt; const d = Math.hypot(this.poi.x - this.x, this.poi.z - this.z);
      if (d > 1.8 && this.stuck < 1.2 && this.timer > 3) this.moveTo(this.poi.x, this.poi.z, dt, W, this.speed * 1.5);
      else { face = yawOf(this.poi.x - this.x, this.poi.z - this.z); swayAmp = 0.8; this.timer = Math.min(this.timer, 2.6); }
      if (this.timer <= 0) { this.state = 'patrol'; this.stuck = 0; let b = 1e9; this.route.forEach((p, i) => { const q = Math.hypot(p.x - this.x, p.z - this.z); if (q < b && !blocked(W, this.x, this.z, p.x, p.z)) { b = q; this.wp = i; } }); }
    } else if (this.state === 'stare') {
      face = yawOf(h.x - this.x, h.z - this.z); swayAmp = 0;
    }
    if (face !== null) this.yaw = dampAng(this.yaw, face, 5, dt);
    this.sway = damp(this.sway, Math.sin(this.t * 0.85) * swayAmp, 4, dt);
    this.lightYaw = this.yaw + this.sway;
    // rig
    const r = this.rig, ph = this.walk, mv = this.state === 'patrol' || this.state === 'investigate' ? 1 : 0;
    r.g.position.set(this.x, 0, this.z); r.g.rotation.y = this.yaw;
    r.body.position.y = Math.abs(Math.sin(ph)) * 0.05 * mv; r.body.rotation.z = Math.sin(ph) * 0.03 * mv;
    r.feet[0].position.set(-0.17, 0.08 + Math.max(0, Math.sin(ph)) * 0.12 * mv, 0.05 + Math.cos(ph) * 0.2 * mv);
    r.feet[1].position.set(0.17, 0.08 + Math.max(0, -Math.sin(ph)) * 0.12 * mv, 0.05 - Math.cos(ph) * 0.2 * mv);
    r.hl.position.z = 0.05 - Math.cos(ph) * 0.16 * mv;
    r.hr.rotation.y = this.sway; r.head.rotation.y = this.sway * 0.7;
    r.head.rotation.z = this.state === 'stare' ? Math.sin(this.t * 2) * 0.12 + 0.15 : 0;
  }
  beam(W) {
    const ly = this.lightYaw, sx = Math.sin(ly), cz = Math.cos(ly), k = this.tall;
    const ox = this.x + (Math.cos(this.yaw) * 0.46 + Math.sin(this.yaw) * 0.3) * k, oz = this.z + (-Math.sin(this.yaw) * 0.46 + Math.cos(this.yaw) * 0.3) * k;
    return { x: ox + sx * 0.36, y: 1.14 * k, z: oz + cz * 0.36, dx: sx * 0.98, dy: -0.19, dz: cz * 0.98, half: 0.4, range: Math.min(15, rayDist(W, ox, oz, sx, cz, 15) + 1.2), r: 1.0, g: 0.86, b: 0.62, I: 26, shadow: true };
  }
  head() { return { x: this.x, y: 2.5 * this.tall, z: this.z }; }
}

// sleeping guard at the desk
export class Sleeper {
  constructor(scene, x, z) {
    this.x = x; this.z = z; this.wake = 0; this.kind = 'sleeper'; this.t = 0;
    this.rig = guardRig({ fat: 1.18, tall: 1, skin: 0xd9a07c, hair: 0x9a9a9a });
    const r = this.rig; scene.add(r.g); r.g.position.set(x, -0.42, z);
    r.body.rotation.x = 0.42; r.head.rotation.x = 0.5; r.head.rotation.z = 0.3; r.hr.position.set(0.3, 1.22, 0.55); r.hl.position.set(-0.3, 1.22, 0.55); r.hr.children[1].visible = false; r.hr.children[2].visible = false;
    const chair = mesh(new THREE.BoxGeometry(0.8, 1.3, 0.12), std({ color: 0x2a1c14, roughness: 0.6 }), x, 0.75, z - 0.5); scene.add(chair);
  }
  reset() { this.wake = 0; }
  update(dt) {
    this.t += dt; this.wake = Math.max(0, this.wake - dt * 0.07);
    const b = Math.sin(this.t * 1.3); this.rig.body.scale.set(1 + b * 0.025, 1 + b * 0.02, 1 + b * 0.04);
    this.rig.head.rotation.z = 0.3 + b * 0.04 + (this.wake > 0.5 ? Math.sin(this.t * 14) * 0.05 * this.wake : 0);
  }
  noise(x, z, loud) { const d = Math.hypot(x - this.x, z - this.z); if (d < 6.5) this.wake += (0.13 + 0.2 * (1 - d / 6.5)) * (loud ? 2 : 1); }
  head() { return { x: this.x, y: 2.05, z: this.z + 0.4 }; }
}

// ---------------- SECURITY CAMERA ----------------
export class SecCam {
  constructor(scene, mount, path, radius = 2.3, period = 9) {
    Object.assign(this, { mount, path, radius, period }); this.kind = 'camera'; this.t = 0; this.alert = 0; this.doubt = 0; this.doubtRate = 0; this.sx = 0; this.sz = 0;
    this.g = new THREE.Group(); this.g.position.set(mount.x, mount.y, mount.z); scene.add(this.g);
    this.g.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.5), blk)); this.g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), blk, 0, 0.3, -0.1));
    this.led = mesh(sphG(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) }), 0.07, 0.07, 0.26, false); this.g.add(this.led);
  }
  reset() { this.alert = 0; }
  update(dt) { this.t += dt; const p = this.path(this.t / this.period * TAU); this.sx = p[0]; this.sz = p[1]; this.g.lookAt(this.sx, 0, this.sz); this.led.visible = (this.t * 2 % 1) < 0.6; }
  sees(h) { return Math.hypot(h.x - this.sx, h.z - this.sz) < this.radius; }
  beam() {
    const m = this.mount, dx = this.sx - m.x, dy = -m.y, dz = this.sz - m.z, l = Math.hypot(dx, dy, dz);
    return { x: m.x, y: m.y, z: m.z, dx: dx / l, dy: dy / l, dz: dz / l, half: Math.atan(this.radius / l) * 1.05, range: l + 3, r: 1.0, g: 0.28, b: 0.22, I: 34, shadow: false };
  }
  head() { return { x: this.sx, y: 1.9, z: this.sz }; }
}

// ---------------- LASER ----------------
const laserMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.25, 0.2) }), laserOff = new THREE.MeshBasicMaterial({ color: 0x2a0606 });
export class Laser {
  constructor(scene, o) {
    Object.assign(this, o); this.t = 0; this.on = true; this.x = o.x0;
    this.g = new THREE.Group(); scene.add(this.g);
    for (const z of [o.z0, o.z1]) { this.g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.72, 10), blk, 0, 0.36, z)); this.g.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), blk, 0, 0.72, z)); this.g.add(mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.05, 12), goldM, 0, 0.025, z)); }
    this.b = mesh(new THREE.CylinderGeometry(0.018, 0.018, Math.abs(o.z1 - o.z0), 6), laserMat, 0, 0.72, (o.z0 + o.z1) / 2, false); this.b.rotation.x = Math.PI / 2; this.g.add(this.b);
  }
  update(dt) {
    this.t += dt;
    this.x = this.x0 + (this.x1 - this.x0) * (0.5 - 0.5 * Math.cos((this.t / this.period + (this.phase || 0)) * TAU));
    this.on = this.blink ? ((this.t + (this.phase || 0) * this.blink[0]) % (this.blink[0] + this.blink[1])) < this.blink[0] : true;
    this.g.position.x = this.x; this.b.material = this.on ? laserMat : laserOff; this.b.scale.x = this.b.scale.z = this.on ? 1 + Math.sin(this.t * 40) * 0.2 : 0.5;
  }
  hits(h) { return this.on && Math.abs(h.x - this.x) < 0.4 && h.z > this.z0 && h.z < this.z1; }
}

// ---------------- REX ----------------
export class Rex {
  constructor(scene, M, x, y, z) {
    this.kind = 'rex'; this.alert = 0; this.doubt = 0; this.doubtRate = 0; this.t = 0; this.phase = 0; this.awake = 0; this.yawL = 0;
    const g = this.g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.PI / 2; scene.add(g);
    const parts = [], bone = (ax, ay, az, bx, by, bz, r) => {
      const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz), l = a.distanceTo(b), c = new THREE.CylinderGeometry(r * 0.8, r, l, 8);
      const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()), new THREE.Vector3(1, 1, 1));
      c.applyMatrix4(m); parts.push(c);
      for (const p of [a, b]) { const s = sphG(r * 1.5, 8, 6); s.translate(p.x, p.y, p.z); parts.push(s); }
    };
    const spine = new THREE.CatmullRomCurve3([[0, 1.5, -6.8], [0, 2.0, -5], [0, 2.7, -3], [0, 3.1, -1], [0, 3.2, 0.4], [0, 3.5, 1.8], [0, 3.95, 3.0], [0, 4.35, 3.7], [0, 4.7, 4.2]].map((p) => new THREE.Vector3(...p)));
    for (let i = 0; i <= 44; i++) {
      const u = i / 44, p = spine.getPoint(u), tn = spine.getTangent(u), k = 0.06 + 0.16 * Math.sin(Math.PI * Math.min(1, u * 1.15)) ;
      const v = new THREE.CylinderGeometry(k, k, 0.14, 8); v.rotateX(Math.PI / 2);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tn); v.applyQuaternion(q); v.translate(p.x, p.y, p.z); parts.push(v);
      if (u > 0.25) { const s = new THREE.BoxGeometry(0.04, k * 2.4, 0.1); s.translate(0, k * 1.5, 0); s.applyQuaternion(q); s.translate(p.x, p.y, p.z); parts.push(s); }
    }
    for (let i = 0; i < 10; i++) {
      const u = 0.62 + i * 0.027, p = spine.getPoint(u), w = 0.55 + Math.sin(i / 9 * Math.PI) * 0.4, d = 1.2 + Math.sin(i / 9 * Math.PI) * 0.7;
      for (const s of [-1, 1]) parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, p.y, p.z), new THREE.Vector3(s * w, p.y - 0.25, p.z), new THREE.Vector3(s * w * 0.95, p.y - d * 0.7, p.z + 0.1), new THREE.Vector3(s * w * 0.45, p.y - d, p.z + 0.25)]), 12, 0.035, 5));
    }
    for (const s of [-1, 1]) {
      bone(s * 0.45, 3.15, 0.2, s * 0.62, 1.95, 0.95, 0.13); bone(s * 0.62, 1.95, 0.95, s * 0.6, 0.85, 0.05, 0.1); bone(s * 0.6, 0.85, 0.05, s * 0.6, 0.18, 0.5, 0.08);
      for (const t of [-0.22, 0, 0.22]) bone(s * 0.6, 0.18, 0.5, s * 0.6 + t, 0.08, 1.05, 0.05);
      bone(s * 0.4, 3.6, 3.0, s * 0.5, 3.1, 3.3, 0.05); bone(s * 0.5, 3.1, 3.3, s * 0.42, 2.9, 3.65, 0.04);
      const pel = sphG(0.45, 10, 8); pel.scale(0.35, 1, 1.3); pel.translate(s * 0.4, 3.1, 0.1); parts.push(pel);
    }
    const sk = mesh(mergeGeometries(parts.map((p) => { const n = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; })), M.bone); g.add(sk);
    for (const [px, py, pz] of [[0, 0, 0.2], [0, 0, 2.9], [0, 0, -3]]) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, spine.getPoint(pz > 2 ? 0.75 : pz > 0 ? 0.52 : 0.28).y, 8), M.steel, px, spine.getPoint(pz > 2 ? 0.75 : pz > 0 ? 0.52 : 0.28).y / 2, pz));
    this.headG = new THREE.Group(); this.headG.position.set(0, 4.7, 4.2); g.add(this.headG);
    const tilt = this.tilt = new THREE.Group(); this.headG.add(tilt);
    const skull = mesh(SC.rexSkullGeo(), M.boneV, 0, 0.1, 0.95); skull.scale.setScalar(1.15); tilt.add(skull);
    this.jaw = mesh(SC.rexJawGeo(), M.boneV, 0, -0.3, -0.45); skull.add(this.jaw);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const s of [-1, 1]) skull.add(mesh(sphG(0.09, 10, 8), this.eyeMat, s * 0.33, 0.1, -0.02, false));
    this.wx = x; this.wz = z; this.wy = y;
  }
  reset() { this.alert = 0; this.phase = 0; this.t = 0; }
  update(dt, G) {
    this.t += dt; const c = this.t % 13;
    // 0-6.5 asleep, 6.5-7.6 stirring, 7.6-12.2 awake sweep, 12.2-13 settling
    const want = c > 7.6 && c < 12.2 ? 1 : 0; this.stir = c > 6.5 && c <= 7.6;
    this.awake = damp(this.awake, want, 5, dt);
    const sweep = Math.sin((c - 7.6) / 4.6 * TAU) * 1.75;
    this.yawL = damp(this.yawL, want ? sweep : 0, 3, dt);
    this.headG.rotation.y = this.yawL; this.tilt.rotation.x = 0.1 + this.awake * 0.32 + (this.stir ? Math.sin(this.t * 30) * 0.02 : 0);
    const breath = Math.sin(this.t * 1.1);
    this.jaw.rotation.x = want ? 0.12 + Math.sin(this.t * 5) * 0.03 : 0.22 + breath * 0.14;
    const e = this.stir ? (Math.sin(this.t * 25) > 0 ? 2 : 0) : this.awake * 5; this.eyeMat.color.setRGB(e, e * 0.45, e * 0.05);
    if (want && !this.was) G.audio.growl(); if (this.stir && !this.wasStir) G.audio.stir(); this.was = want; this.wasStir = this.stir;
  }
  get hx() { return this.wx + 4.2; } get hz() { return this.wz; }
  get wyaw() { return Math.PI / 2 + this.yawL; }
  sees(h, W) {
    if (this.awake < 0.8) return false;
    const dx = h.x - this.hx, dz = h.z - this.hz, d = Math.hypot(dx, dz);
    if (d > 17 || d < 0.5) return false;
    if (Math.abs(angDiff(this.wyaw, yawOf(dx, dz))) > 0.34) return false;
    return !blocked(W, this.hx, this.hz, h.x, h.z);
  }
  beam(W) {
    if (this.awake < 0.05) return null;
    const a = this.wyaw, sx = Math.sin(a), cz = Math.cos(a);
    return { x: this.hx + sx * 1.6, y: this.wy + 4.75, z: this.hz + cz * 1.6, dx: sx * 0.9, dy: -0.44, dz: cz * 0.9, half: 0.36, range: Math.min(19, rayDist(W, this.hx, this.hz, sx, cz, 19) + 1.5), r: 1.0, g: 0.5, b: 0.12, I: 44 * this.awake, shadow: true };
  }
  head() { return { x: this.hx + Math.sin(this.wyaw) * 1.4, y: this.wy + 6.4, z: this.hz + Math.cos(this.wyaw) * 1.4 }; }
}

// ---------------- ROOMBA ----------------
export class Roomba {
  constructor(scene, x, z, bounds) {
    this.x = x; this.z = z; this.b = bounds; this.yaw = 0.7; this.t = 0; this.turn = 0;
    const g = this.g = new THREE.Group(); scene.add(g);
    g.add(mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.13, 28), std({ color: 0x2b2f36, roughness: 0.3, metalness: 0.4 }), 0, 0.085, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 24), std({ color: 0x8c96a5, roughness: 0.25, metalness: 0.9 }), 0, 0.16, 0));
    this.led = mesh(sphG(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 1.2) }), 0, 0.17, 0.3, false); g.add(this.led);
    for (const s of [-1, 1]) { const e = mesh(sphG(0.07, 10, 8), glove, s * 0.12, 0.2, 0.2, false); e.add(mesh(sphG(0.03, 8, 6), blk, 0, 0.01, 0.05, false)); g.add(e); }
  }
  update(dt, G) {
    this.t += dt;
    if (this.turn > 0) { this.turn -= dt; this.yaw += dt * 2.6 * this.dir; }
    else {
      const p = { x: this.x + Math.sin(this.yaw) * 1.25 * dt, z: this.z + Math.cos(this.yaw) * 1.25 * dt };
      const ex = p.x, ez = p.z; collide(G.W, p, 0.5);
      p.x = clamp(p.x, this.b.x0, this.b.x1); p.z = clamp(p.z, this.b.z0, this.b.z1);
      if (Math.hypot(p.x - ex, p.z - ez) > 1e-4) { this.turn = 0.5 + Math.random() * 0.9; this.dir = Math.random() < 0.5 ? -1 : 1; }
      this.x = p.x; this.z = p.z;
    }
    const h = G.hero, dx = h.x - this.x, dz = h.z - this.z, d = Math.hypot(dx, dz);
    if (d < 0.88 && d > 1e-3 && !h.onPad) { const k = (0.88 - d); h.p.x = h.x + dx / d * k; h.p.z = h.z + dz / d * k; collide(G.W, h.p, 0.36); h.x = h.p.x; h.z = h.p.z; h.pushT = 0.25; if (this.turn <= 0) { this.turn = 0.7; this.dir = 1; G.audio.bonk(); } }
    this.g.position.set(this.x, 0, this.z); this.g.rotation.y = this.yaw;
  }
}

// ---------------- ORRERY ----------------
export class Orrery {
  constructor(scene, M) {
    const g = this.g = new THREE.Group(); scene.add(g);
    const base = mesh(new THREE.LatheGeometry([[0, 0], [1.6, 0], [1.6, 0.12], [1.45, 0.16], [1.45, 0.3], [0.7, 0.42], [0.3, 0.6], [0.16, 0.9], [0.12, 2.3], [0, 2.3]].map((p) => new THREE.Vector2(p[0], p[1])), 40), M.bronze); g.add(base);
    g.add(mesh(sphG(0.5, 28, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.3, 0.9) }), 0, 2.75, 0, false));
    this.rings = [];
    const pm = [M.blue, M.red, M.whiteMatte, M.terracotta, M.steel];
    [1.3, 1.85, 2.4, 2.95].forEach((R, i) => {
      const p = new THREE.Group(); p.position.y = 2.75; p.rotation.set(0.12 * (i - 1.5), i, 0.1 * (1.5 - i)); g.add(p);
      const q = new THREE.Group(); p.add(q);
      const t = mesh(new THREE.TorusGeometry(R, 0.022, 8, 80), M.brass); t.rotation.x = Math.PI / 2; q.add(t);
      q.add(mesh(sphG(0.11 + (i % 3) * 0.06, 16, 12), pm[i], R, 0, 0));
      if (i === 2) { const moon = mesh(sphG(0.05, 10, 8), M.whiteMatte, R + 0.3, 0.05, 0); q.add(moon); }
      this.rings.push({ q, sp: 0.5 / (i + 1) });
    });
    const arm = mesh(new THREE.TorusGeometry(3.3, 0.03, 8, 90), M.brass, 0, 2.75, 0); g.add(arm); this.arm = arm;
    const arm2 = mesh(new THREE.TorusGeometry(3.3, 0.03, 8, 90), M.brass, 0, 2.75, 0); arm2.rotation.y = Math.PI / 2; g.add(arm2);
  }
  update(dt) { for (const r of this.rings) r.q.rotation.y += dt * r.sp; }
}

// ---------------- KEYS, DOOR, NOSES, TILES ----------------
export function keyMesh() {
  const g = new THREE.Group(), m = std({ color: 0xe0b24e, roughness: 0.22, metalness: 1, emissive: 0x6a4a10, emissiveIntensity: 0.6 });
  const bow = mesh(new THREE.TorusGeometry(0.11, 0.03, 8, 20), m, 0, 0.2, 0); g.add(bow);
  g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 8), m, 0, -0.07, 0));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.045, 0.03), m, 0.055, -0.2, 0)); g.add(mesh(new THREE.BoxGeometry(0.07, 0.045, 0.03), m, 0.04, -0.12, 0));
  return g;
}
export class KeyItem {
  constructor(scene, id, spot) {
    this.id = id; this.spot = spot; this.got = false; this.t = Math.random() * 5; this.fly = 0; this.locked = false;
    this.g = keyMesh(); this.g.scale.setScalar(1.5); scene.add(this.g);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.softDot(), color: new THREE.Color(2.2, 1.6, 0.5), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.scale.setScalar(1.6); scene.add(this.glow);
  }
  update(dt) {
    this.t += dt;
    if (this.got) { this.fly += dt; this.g.position.y += dt * 2.2; this.g.rotation.y += dt * 14; const s = Math.max(0, 1.5 * (1 - this.fly / 0.8)); this.g.scale.setScalar(s); this.glow.material.opacity = Math.max(0, 0.5 - this.fly); if (this.fly > 0.8) { this.g.visible = false; this.glow.visible = false; } return; }
    this.g.position.set(this.spot.x, this.spot.y + Math.sin(this.t * 2) * 0.06, this.spot.z); this.g.rotation.y = this.t * 1.4;
    this.glow.position.copy(this.g.position); this.glow.material.opacity = 0.4 + Math.sin(this.t * 3) * 0.12;
  }
}
export class LabDoor {
  constructor(scene, M, W) {
    this.W = W; this.open = 0; this.opening = false; this.leaves = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Group(); p.position.set(s * 1.7, 0, -8.45); W.front.add(p);
      const d = mesh(new THREE.BoxGeometry(1.68, 4.36, 0.12), M.wood, -s * 0.85, 2.19, 0); p.add(d);
      for (const y of [1.1, 3.1]) d.add(mesh(new THREE.BoxGeometry(1.2, 1.5, 0.03), M.woodLight, 0, y - 2.19, 0.07, false));
      d.add(mesh(sphG(0.07, 12, 8), M.brass, -s * 0.65, -0.1, 0.12, false));
      this.leaves.push({ p, s });
    }
    this.lamps = W.anchors.locks.map(([x, y, z]) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.15) }); const l = mesh(sphG(0.09, 12, 8), m, x, y, z, false); W.front.add(l); W.front.add(mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 16), M.brass, x, y, z - 0.03, false)); return m; });
  }
  setKeys(n) { this.lamps.forEach((m, i) => { if (i < n) m.color.setRGB(0.3, 3.2, 0.9); else m.color.setRGB(3, 0.25, 0.15); }); }
  update(dt) {
    if (this.opening) this.open = Math.min(1, this.open + dt * 0.55);
    const k = this.open * this.open * (3 - 2 * this.open);
    for (const l of this.leaves) l.p.rotation.y = -l.s * k * 1.75;
    this.W.labDoor.on = this.open < 0.55;
  }
}

export const NOSES = [
  { id: 'roman', label: 'Marble (nose restored)' }, { id: 'carrot', label: 'Marble, carrot' }, { id: 'clown', label: 'Marble, rubber' }, { id: 'pig', label: 'Marble, pork' },
  { id: 'beak', label: 'Marble, bronze' }, { id: 'pine', label: 'Marble, pine' }, { id: 'button', label: 'Marble, porcelain' }, { id: 'gold', label: 'Marble, gold' },
];
function noseGeoRoman() {
  const a = new THREE.CapsuleGeometry(0.036, 0.15, 6, 12); a.rotateX(-0.6); a.translate(0, 0.045, 0.03);
  const b = sphG(0.052, 14, 10); b.translate(0, -0.035, 0.075);
  const c = sphG(0.034, 10, 8); c.translate(0.045, -0.045, 0.04); const d = c.clone(); d.translate(-0.09, 0, 0);
  return mergeGeometries([a, b, c, d].map((g) => g.toNonIndexed()));
}
export function makeNose(id) {
  const g = new THREE.Group(); let m;
  if (id === 'roman') g.add(mesh(noseGeoRoman(), std({ color: 0xe9e3d6, roughness: 0.36 })));
  else if (id === 'gold') g.add(mesh(noseGeoRoman(), std({ color: 0xe2b24a, roughness: 0.18, metalness: 1 })));
  else if (id === 'carrot') { m = mesh(new THREE.ConeGeometry(0.055, 0.44, 14), std({ color: 0xf07a1c, roughness: 0.6 }), 0, 0, 0.2); m.rotation.x = Math.PI / 2; g.add(m); }
  else if (id === 'clown') g.add(mesh(sphG(0.09, 20, 14), std({ color: 0xe0151c, roughness: 0.12 }), 0, -0.01, 0.06));
  else if (id === 'pig') { m = mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.1, 20), std({ color: 0xf2a1a8, roughness: 0.5 }), 0, -0.01, 0.04); m.rotation.x = Math.PI / 2; m.scale.set(1.15, 1, 0.9); g.add(m); for (const s of [-1, 1]) g.add(mesh(sphG(0.022, 8, 6), std({ color: 0x8a3a44 }), s * 0.035, -0.01, 0.09, false)); }
  else if (id === 'beak') { m = mesh(new THREE.ConeGeometry(0.065, 0.36, 12), std({ color: 0x6b4a26, roughness: 0.35, metalness: 0.9 }), 0, -0.03, 0.15); m.rotation.x = Math.PI / 2 + 0.3; m.scale.x = 0.7; g.add(m); }
  else if (id === 'pine') { m = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.56, 8), std({ color: 0xb98a55, roughness: 0.7 }), 0, 0, 0.26); m.rotation.x = Math.PI / 2; g.add(m); const l = mesh(sphG(0.035, 8, 6), std({ color: 0x4f9a3a, roughness: 0.6 }), 0.03, 0.04, 0.42, false); l.scale.set(1.4, 0.3, 0.8); g.add(l); }
  else g.add(mesh(sphG(0.04, 14, 10), std({ color: 0xf6f3ee, roughness: 0.1 }), 0, -0.02, 0.025));
  return g;
}

const TILE_HUES = [0, 0.08, 0.15, 0.33, 0.5, 0.6, 0.75, 0.88];
export class Tiles {
  constructor(scene, W) {
    this.W = W; this.tiles = W.tiles.map((t, i) => {
      const c = new THREE.Color().setHSL(TILE_HUES[i], 0.9, 0.55), m = std({ color: 0x15161a, roughness: 0.15, emissive: c, emissiveIntensity: 0.12 });
      const o = mesh(new THREE.BoxGeometry(t.x1 - t.x0 - 0.08, 0.03, t.z1 - t.z0 - 0.08), m, (t.x0 + t.x1) / 2, 0.016, (t.z0 + t.z1) / 2, false); scene.add(o);
      return { m, glow: 0, c };
    });
    this.seq = [2, 5, 1, 6]; this.prog = 0; this.done = false;
    const a = W.anchors.dots, dm = new THREE.MeshBasicMaterial({ map: TX.dotsTex(this.seq.map((i) => '#' + new THREE.Color().setHSL(TILE_HUES[i], 0.9, 0.55).getHexString())), transparent: true, color: new THREE.Color(2, 2, 2), depthWrite: false });
    const d = mesh(new THREE.PlaneGeometry(3.2, 0.8), dm, a.x, a.y, a.z, false); scene.add(d);
    const v = W.anchors.vitrine; this.cover = mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), std({ color: 0xcfe6ff, roughness: 0.03, transparent: true, opacity: 0.2, envMapIntensity: 9, depthWrite: false }), v.x, v.y + 0.46, v.z, false); scene.add(this.cover); this.lift = 0;
  }
  at(x, z) { for (let i = 0; i < this.W.tiles.length; i++) { const t = this.W.tiles[i]; if (x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1) return i; } return -1; }
  step(i) {
    this.tiles[i].glow = 1;
    if (this.done) return false;
    if (i === this.seq[this.prog]) this.prog++; else this.prog = i === this.seq[0] ? 1 : 0;
    if (this.prog >= this.seq.length) { this.done = true; return true; }
    return false;
  }
  update(dt) {
    for (const t of this.tiles) { t.glow = Math.max(0, t.glow - dt * 1.4); t.m.emissiveIntensity = 0.12 + t.glow * 3.2; }
    if (this.done) { this.lift = Math.min(1, this.lift + dt * 0.8); this.cover.position.y = this.W.anchors.vitrine.y + 0.46 + this.lift * 1.6; this.cover.material.opacity = 0.2 * (1 - this.lift); }
  }
}

// ---------------- LIGHT POOLS ----------------
export class Lights {
  constructor(scene, W, sp) {
    this.W = W; this.sp = sp; this.pts = [];
    for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffffff, 0, 13, 2); l.userData.em = null; scene.add(l); this.pts.push(l); }
    this.spots = [];
    for (let i = 0; i < NSPOT; i++) {
      const l = new THREE.SpotLight(0xffffff, 0, 16, 0.4, 0.55, 1.0); l.position.set(0, -50, 0); l.target.position.set(0, -51, 0); scene.add(l, l.target);
      if (i < 2) { l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.camera.near = 0.4; l.shadow.camera.far = 22; l.shadow.bias = -0.003; l.shadow.normalBias = 0.03; }
      this.spots.push(l);
    }
  }
  update(dt, fx, fz, beams) {
    const E = this.W.emitters;
    for (const e of E) e.d = Math.hypot(e.x - fx, e.z - fz);
    const want = E.slice().sort((a, b) => a.d - b.d).slice(0, this.pts.length);
    for (const e of E) {
      const on = want.includes(e) && e.d < 30;
      if (on && !e.light) { const free = this.pts.find((l) => !l.userData.em); if (free) { free.userData.em = e; e.light = free; free.position.set(e.x, e.y, e.z); free.color.copy(e.col); e.w = 0; } }
      if (e.light) { e.w = clamp(e.w + (on ? dt * 3 : -dt * 3), 0, 1); e.light.intensity = e.I * e.w * (this.dim ?? 1); if (!on && e.w <= 0) { e.light.userData.em = null; e.light = null; } }
    }
    // beams: shadowed first
    const bs = beams.filter(Boolean); for (const b of bs) b.d = Math.hypot(b.x - fx, b.z - fz) - (b.shadow ? 3 : 0);
    bs.sort((a, b) => a.d - b.d);
    const sh = bs.filter((b) => b.shadow).slice(0, 2), rest = bs.filter((b) => !sh.includes(b)).slice(0, NSPOT - 2);
    const slots = [sh[0], sh[1], rest[0], rest[1]], u = this.sp.spots;
    for (let i = 0; i < NSPOT; i++) {
      const b = slots[i], l = this.spots[i];
      if (!b) { l.intensity = 0; u.col[i].set(0, 0, 0); continue; }
      l.position.set(b.x, b.y, b.z); l.target.position.set(b.x + b.dx, b.y + b.dy, b.z + b.dz); l.target.updateMatrixWorld();
      l.angle = Math.min(1.2, b.half * 1.15); l.distance = b.range * 1.25; l.color.setRGB(b.r, b.g, b.b); l.intensity = b.I;
      u.pos[i].set(b.x, b.y, b.z, b.range * 1.15); u.dir[i].set(b.dx, b.dy, b.dz, Math.cos(b.half * 1.1)); u.col[i].set(b.r, b.g, b.b).multiplyScalar(b.I * 0.09);
    }
  }
}

// ---------------- DUST ----------------
export function makeDust(scene, U) {
  const N = 3200, pos = new Float32Array(N * 3), sd = new Float32Array(N), r = rng(99);
  for (let i = 0; i < N; i++) { const lab = i % 12 === 0; pos[i * 3] = lab ? -8 + r() * 16 : -69 + r() * 138; pos[i * 3 + 1] = 0.2 + r() * 7.3; pos[i * 3 + 2] = lab ? -21 + r() * 12 : -8 + r() * 16; sd[i] = r() * 100; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { tMoon: U.tMoon, uMoonMat: U.uMoonMat, uTime: U.uTime, uMoonCol: U.uMoonCol, uPx: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform sampler2D tMoon; uniform mat4 uMoonMat; uniform float uTime, uPx; attribute float aSeed; varying float vA;
      void main(){ vec3 p = position; p.x += sin(uTime * 0.11 + aSeed) * 0.7; p.y += sin(uTime * 0.07 + aSeed * 1.7) * 0.5; p.z += cos(uTime * 0.09 + aSeed * 2.3) * 0.7;
        vec4 lp = uMoonMat * vec4(p, 1.0); float lit = step(lp.z * 0.5 + 0.5 - 0.0015, texture2D(tMoon, lp.xy * 0.5 + 0.5).r) * step(abs(lp.x), 0.998) * step(abs(lp.y), 0.998);
        vA = (0.03 + lit * 0.9) * (0.5 + 0.5 * sin(uTime * 1.3 + aSeed * 5.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * (0.5 + fract(aSeed) * 0.9) * 7.0 / -mv.z; }`,
    fragmentShader: `uniform vec3 uMoonCol; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(q)); gl_FragColor = vec4(uMoonCol * 1.6 * a * vA, 1.0); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
  return p;
}

// ---------------- MARKS (? / ! above watchers) ----------------
export class Marks {
  constructor(scene) {
    this.q = TX.iconTex('?', '#f2c94c', '#2a2218'); this.e = TX.iconTex('!', '#e2412f', '#fff4e6'); this.z = TX.iconTex('z', '#cfe0ff', '#1b2440');
    this.pool = []; this.scene = scene;
  }
  begin() { this.n = 0; }
  put(p, kind, s) {
    let m = this.pool[this.n];
    if (!m) { m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.q, depthTest: false, transparent: true })); m.renderOrder = 10; this.scene.add(m); this.pool.push(m); }
    this.n++; m.visible = true; m.material.map = kind === '!' ? this.e : kind === 'z' ? this.z : this.q; m.position.set(p.x, p.y, p.z); m.scale.setScalar(s);
  }
  end() { for (let i = this.n; i < this.pool.length; i++) this.pool[i].visible = false; }
}
