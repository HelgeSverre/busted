import * as THREE from 'three';
import { createRender, U, MOON_DIR } from './render.js';
import { makeMaterials } from './kit.js';
import { buildMuseum, roomAt, ROOMS } from './museum.js';
import { Hero, Guard, Sleeper, SecCam, Laser, Rex, Roomba, Orrery, KeyItem, LabDoor, NOSES, makeNose, Tiles, Lights, makeDust, Marks } from './actors.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { clamp, damp, lerp, yawOf, smooth } from './util.js';

const G = window.BUSTED = { state: 'load', t: 0, keys: 0, reshelved: 0, time: 0, worn: null };
const ui = G.ui = new UI(), audio = G.audio = new Sound();
const canvas = document.getElementById('c');
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x030409);
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);
let R, W, M, hero, lights, marks, dust, moon, hemi, door, tiles, rex, roomba, orrery, sleeper;
let guards = [], cams = [], lasers = [], keys = [], noses = [], watchers = [];
const input = { keys: new Set(), act: false };
const camPos = new THREE.Vector3(-27, 3, 6), camTgt = new THREE.Vector3(-27, 1.2, -2), tmp = new THREE.Vector3();
const LR = new THREE.Vector3(), LU = new THREE.Vector3();

function envMap(renderer) {
  const s = new THREE.Scene(), bm = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.BackSide });
  s.add(new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), bm(0.02, 0.028, 0.05)));
  const panel = (x, y, z, w, h, r, g, b, ry = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
  panel(0, 9.5, -4, 14, 8, 1.6, 2.4, 4.5, 0, Math.PI / 2); panel(0, 3, -19, 6, 9, 1.0, 1.5, 3.0);
  panel(-19, 2, 4, 3, 3, 5, 3, 1.2, Math.PI / 2); panel(19, 2, -6, 3, 3, 5, 3, 1.2, -Math.PI / 2); panel(8, 1, 19, 4, 2, 2.5, 1.6, 0.8, Math.PI);
  const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(s, 0.03).texture; pm.dispose();
  return t;
}

function boot() {
  R = createRender(canvas, scene, camera);
  scene.environment = envMap(R.renderer); scene.environmentIntensity = 0.22;
  M = makeMaterials();
  W = G.W = buildMuseum(scene, M);
  R.sp.floors = W.floors; R.sp.ceilMats = Object.values(M).filter((m) => m.userData.ceil);
  for (const m of R.sp.ceilMats) { m.colorWrite = false; m.depthWrite = false; }
  R.bakeMoon(W.statics.filter((m) => m.castShadow && !m.material.userData.glass));

  hemi = new THREE.HemisphereLight(0x8ea6ea, 0x2c2530, 0.22); scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x8fa2dc, 0.32); fill.position.set(-4, 7, 10); scene.add(fill); G.fill = fill;
  moon = new THREE.DirectionalLight(0x9db9ff, 5.2); moon.castShadow = true; moon.shadow.mapSize.set(4096, 4096);
  Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 24, bottom: -24, near: 1, far: 190 }); moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.05;
  scene.add(moon, moon.target);
  LR.crossVectors(MOON_DIR, new THREE.Vector3(0, 1, 0)).normalize(); LU.crossVectors(LR, MOON_DIR).normalize();

  hero = G.hero = new Hero(scene, M); hero.place(W.home.x, W.home.z, 0);
  G.heroLight = new THREE.PointLight(0xdfe6ff, 10, 8, 2); scene.add(G.heroLight);
  const NORTH = Math.PI;
  guards = [
    new Guard(scene, { room: 'antiq', fat: 1.1, route: [{ x: -36.2, z: 3.4 }, { x: -17.8, z: 3.4 }, { x: -17.8, z: -3.8, wait: 1.6 }, { x: -36.2, z: -3.8, wait: 1.6 }] }),
    new Guard(scene, { room: 'gal', tall: 1.12, fat: 0.85, hair: 0x1a1a1a, skin: 0xc98f6b, route: [{ x: 17, z: -4.6, wait: 2.4, face: NORTH }, { x: 27, z: -4.6 }, { x: 37, z: -4.6, wait: 2.4, face: NORTH }, { x: 27, z: -4.6 }] }),
    new Guard(scene, { room: 'gal', fat: 1.2, tall: 0.95, hair: 0xb5562a, route: [{ x: 18, z: 5.8 }, { x: 38.5, z: 5.8 }, { x: 38.5, z: 2.2, wait: 1.2 }, { x: 18, z: 2.2, wait: 1.2 }] }),
    new Guard(scene, { room: 'mod', tall: 1.05, hair: 0xd9c9a0, skin: 0xf0c4a4, route: [{ x: 46, z: 5.4 }, { x: 66, z: 5.4 }, { x: 68, z: 0.2, wait: 1.5 }, { x: 46, z: 0 }] }),
    new Guard(scene, { room: 'mod', fat: 1.15, hair: 0x222222, skin: 0x9a6a4c, route: [{ x: 60, z: -1.3 }, { x: 67.3, z: -1.3 }, { x: 67.3, z: -6.4, wait: 2, face: -Math.PI / 2 }, { x: 60.4, z: -6.4 }] }),
  ];
  sleeper = new Sleeper(scene, W.anchors.sleeper.x, W.anchors.sleeper.z);
  cams = [
    new SecCam(scene, { x: 0, y: 6.9, z: -7.6 }, (a) => [Math.sin(a) * 7.2, -4.3 + Math.sin(a * 2) * 0.9], 2.3, 10),
    new SecCam(scene, { x: -68.7, y: 6.7, z: 0.5 }, (a) => [-64.4 + Math.sin(a) * 3.0, -0.8 + Math.sin(a * 2 + 0.7) * 4.8], 2.2, 11),
  ];
  cams[0].room = 'rot'; cams[1].room = 'dino';
  lasers = [new Laser(scene, { x0: 18.6, x1: 22.6, z0: -7.4, z1: 7.5, period: 6.5 }), new Laser(scene, { x0: 28.3, x1: 28.3, z0: -7.4, z1: 7.5, period: 1, blink: [2.4, 1.5] }), new Laser(scene, { x0: 33.4, x1: 37.4, z0: -7.4, z1: 7.5, period: 6.5, phase: 0.5 })];
  rex = new Rex(scene, M, -55.4, 0.35, -1); rex.room = 'dino';
  roomba = new Roomba(scene, -59, 4.2, { x0: -68.3, x1: -41.8, z0: -7.3, z1: 7.3 });
  orrery = new Orrery(scene, M);
  keys = ['gal', 'mod', 'dino'].map((id) => new KeyItem(scene, id, W.keySpots[id]));
  door = new LabDoor(scene, M, W);
  tiles = new Tiles(scene, W);
  noses = NOSES.map((n, i) => { const m = makeNose(n.id); const s = W.noseSpots[i]; m.position.set(s.x, s.y, s.z); m.scale.setScalar(1.25); scene.add(m); return { ...n, mesh: m, spot: s }; });
  lights = new Lights(scene, W, R.sp);
  marks = new Marks(scene); dust = makeDust(scene, U);
  R.sp.hideInRefl = [dust];
  watchers = [...guards, ...cams, rex];

  hero.onLand = (sneak) => {
    audio.hop(sneak); G.hops = (G.hops || 0) + 1; if (sneak) G.sneaks = (G.sneaks || 0) + 1;
    const room = roomAt(hero.x, hero.z);
    if (!sneak) { noise(hero.x, hero.z, false, 4.2, room); if (room === 'rot') sleeper.noise(hero.x, hero.z, false); }
    const ti = room === 'mod' ? tiles.at(hero.x, hero.z) : -1;
    if (ti >= 0 && ti !== G.lastTile) { audio.note(ti); noise(hero.x, hero.z, true, 16, room); if (tiles.step(ti)) { audio.chime(); } }
    G.lastTile = ti;
  };

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    audio.init(); audio.resume();
    if (e.code === 'KeyM') { audio.setMuted(!audio.muted); ui.mute(audio.muted); return; }
    if (G.state === 'title') { start(); return; }
    if (G.state === 'end' && G.et > 2) { location.reload(); return; }
    input.keys.add(e.code);
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') input.act = true;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => input.keys.clear());
  addEventListener('pointerdown', () => { audio.init(); audio.resume(); if (G.state === 'title') start(); });
  addEventListener('resize', resize); resize();
  G.state = 'title'; ui.press('PRESS ANY KEY'); ui.fade(0);
  hero.update(0.016, 0, 0, false, W);
  requestAnimationFrame(frame);
}

let pr = Math.min(devicePixelRatio || 1, 2), ft = 16, ftN = 0;
function resize() { const w = innerWidth, h = innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); R.setSize(w, h, pr); dust.material.uniforms.uPx.value = h * pr / 60; }

function start() { G.state = 'play'; G.time = 0; ui.title(false); ui.showHud(true); ui.hint(true); G.said = {}; G.queue = []; }

function noise(x, z, loud, radius, room) { for (const g of guards) if (g.room === room && Math.hypot(g.x - x, g.z - z) < radius) g.hear(x, z, loud); }

function caught(w) {
  if (G.state !== 'play') return;
  G.state = 'caught'; G.ct = 0; G.reshelved++; hero.frozen = true; hero.mood = 1; G.by = w;
  audio.spotted(); audio.caught(); if (w.kind === 'rex') audio.roar();
  const line = w.kind === 'guard' ? ['Who keeps moving this one?', 'Back you go.', 'Not again.', 'Honestly.'][G.reshelved % 4] : w.kind === 'sleeper' ? 'Wha— who?' : w.kind === 'rex' ? 'RRRAAAGH' : 'bzzt';
  ui.say('caught', line, () => w.head(), 2.2);
}
function respawn() {
  const room = roomAt(hero.x, hero.z); let best = null, bd = 1e9;
  for (const p of W.pads) { if (p.room !== room) continue; const d = Math.hypot(p.x - hero.x, p.z - hero.z); if (d < bd) { bd = d; best = p; } }
  if (!best) best = { x: W.home.x, z: W.home.z };
  hero.place(best.x, best.z, 0);
  for (const w of watchers) { w.reset(); w.sus = 0; w.blind = 0; } sleeper.reset();
}

const sayQ = (id, lines, pos) => { G.queue.push(...lines.map((text) => ({ id, text, pos }))); };

function updatePlay(dt) {
  G.time += dt;
  const k = input.keys;
  let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0), iz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
  const sneak = k.has('ShiftLeft') || k.has('ShiftRight');
  hero.update(dt, ix, iz, sneak, W);
  const room = G.room = roomAt(hero.x, hero.z), art = !!ROOMS[room].artSafe, safe = !!hero.onPad || art;
  for (const g of guards) g.update(dt, G);
  sleeper.update(dt); for (const c of cams) c.update(dt); for (const l of lasers) l.update(dt);
  rex.update(dt, G); roomba.update(dt, G);

  // detection
  let seenBy = null, maxA = 0, maxD = 0;
  for (const w of watchers) {
    if (G.noDetect) break;
    const sees = w.sees(hero, W);
    if (w.kind === 'guard') { w.blind = (w.blind || 0) - dt; w.susT = (w.susT || 0) - dt; if (w.susT <= 0) w.sus = 0; }
    if (sees) {
      seenBy = seenBy || w;
      if (hero.moving) { w.alert += dt * (w.kind === 'guard' ? 3.3 : 2.6); if (w.kind === 'guard' && w.state !== 'stare') { w.state = 'stare'; audio.huh(); } }
      else {
        w.alert = Math.max(0, w.alert - dt * 0.5);
        if (!safe && w.doubtRate && !(w.blind > 0)) {
          w.doubt += dt * w.doubtRate * (1 + (w.sus || 0));
          if (w.doubt > 0.3 && w.state !== 'stare') { w.state = 'stare'; audio.huh(); ui.say('g' + guards.indexOf(w), w.sus ? 'You again.' : ['…Was that there before?', '…Odd.', 'Hm.'][guards.indexOf(w) % 3], () => w.head(), 2.4); }
          if (w.doubt >= 0.85 && !w.sus) { w.sus = 1; w.susT = 50; w.doubt = 0; w.blind = 6; w.state = 'patrol'; ui.say('g' + guards.indexOf(w), ['Must be new.', 'I need a holiday.', 'Huh. Fine.'][guards.indexOf(w) % 3], () => w.head(), 2.4); }
        } else if (w.kind === 'guard') {
          w.doubt = Math.max(0, w.doubt - dt * 0.3);
          if (art && (w.artT || 0) <= 0) { w.artT = 14; w.state = 'look'; w.poi = { x: hero.x, z: hero.z }; w.timer = 2.2; audio.huh(); ui.say('g' + guards.indexOf(w), ['Hm. Bold.', 'Derivative.', 'Is this one new?', 'The absence of nose. It speaks.', 'I prefer the early work.'][Math.floor(Math.random() * 5)], () => w.head(), 2.6); }
        }
      }
    } else { w.alert = Math.max(0, w.alert - dt * 0.9); w.doubt = Math.max(0, w.doubt - dt * 0.2); if (w.kind === 'guard' && w.state === 'stare' && w.doubt < 0.12 && w.alert < 0.1) w.state = 'patrol'; }
    if (w.kind === 'guard') { w.artT = (w.artT || 0) - dt; if (w.state === 'stare' && safe && !hero.moving && w.alert < 0.05) { w.doubt = Math.max(0, w.doubt - dt * 0.5); if (w.doubt < 0.12) w.state = 'patrol'; } }
    maxA = Math.max(maxA, w.alert); maxD = Math.max(maxD, w.doubt);
    if (w.alert >= 1 || w.doubt >= 1) { caught(w); break; }
  }
  if (sleeper.wake >= 1 && !G.noDetect) caught(sleeper);
  G.lastSeen = seenBy; G.maxA = maxA; G.maxD = maxD;
  hero.look = seenBy ? seenBy.head() : null; hero.mood = seenBy ? 1 : G.worn ? 2 : 0;
  ui.eye(maxA > 0.05 ? 2 : seenBy ? 1 : 0);
  // lasers
  G.laserCd = (G.laserCd || 0) - dt;
  if (room === 'gal' && G.laserCd <= 0) for (const l of lasers) if (l.hits(hero)) { G.laserCd = 2.5; audio.alarm(); noise(hero.x, hero.z, true, 60, 'gal'); G.flash = 1; break; }

  // keys, door
  for (const key of keys) {
    if (key.got) continue;
    if (Math.hypot(key.spot.x - hero.x, key.spot.z - hero.z) < 1.35 && (key.id !== 'mod' || tiles.done)) { key.got = true; G.keys++; ui.setKeys(G.keys); door.setKeys(G.keys); audio.key(); hero.land = 1; }
  }
  const dd = Math.hypot(hero.x, hero.z + 8);
  if (dd < 4.2 && room === 'rot') {
    if (G.keys >= 3) { if (!door.opening) { door.opening = true; audio.unlock(); } }
    else if (dd < 2.6 && !G.said.door) { G.said.door = 8; ui.say('door', `Locked. ${G.keys} of 3.`, { x: 0, y: 3.4, z: -8 }, 2.6); }
  }
  if (G.said.door > 0) { G.said.door -= dt; if (G.said.door <= 0) G.said.door = 0; }

  // noses
  if (room === 'lab') {
    let near = null, nd = 1.0;
    for (const n of noses) { if (n === G.worn) continue; const d = Math.abs(n.spot.x - hero.x); if (d < nd && Math.abs(n.spot.z - hero.z) < 2.2) { nd = d; near = n; } }
    if (near) {
      ui.say('pick', 'E', { x: near.spot.x, y: near.spot.y + 0.45, z: near.spot.z }, 0.2, 'k');
      if (input.act) {
        if (G.worn) { const o = G.worn; scene.add(o.mesh); o.mesh.position.set(o.spot.x, o.spot.y, o.spot.z); o.mesh.rotation.set(0, 0, 0); o.mesh.scale.setScalar(1.25); }
        hero.noseAt.add(near.mesh); near.mesh.position.set(0, 0, 0); near.mesh.scale.setScalar(1); G.worn = near; audio.boop(); hero.land = 1; hero.wink = 0.35; G.sparkle = 1;
      }
    }
  } else if (G.worn) startEnding();
  input.act = false;

  // chatter
  for (const t of W.talkers) {
    if (G.said[t.id]) continue;
    if (Math.hypot(t.x - hero.x, t.z - hero.z) < t.r && (t.id !== 'philo' || G.time > 1.2)) { G.said[t.id] = 1; sayQ(t.id, t.lines, { x: t.x, y: t.y + 0.25, z: t.z }); }
  }
  G.qt = (G.qt || 0) - dt;
  if (G.queue.length && G.qt <= 0) { const q = G.queue.shift(); ui.say('talk', q.text, q.pos, 3.0); G.qt = 3.2; }
  if (art && !hero.moving && hero.sinceLand > 2.5 && !G.said.untitled) { G.said.untitled = 1; ui.say('art', 'Untitled (Man, Noseless)', () => ({ x: hero.x, y: 0.1, z: hero.z + 0.9 }), 3.5, 'k'); }
  if ((G.hops > 8 && G.sneaks > 2) || G.time > 40) ui.hint(false);
}

function setDay() {
  moon.color.setRGB(1, 0.84, 0.62); moon.intensity = 3.4; hemi.color.setRGB(1, 0.93, 0.84); hemi.groundColor.setRGB(0.45, 0.36, 0.3); hemi.intensity = 0.62;
  U.uMoonCol.value.setRGB(1.0, 0.78, 0.5); M.moonGlass.color.setRGB(1.5, 1.25, 0.9); M.skyGlass.color.setRGB(1.8, 1.6, 1.3); lights.dim = 0.15;
  scene.environmentIntensity = 0.4; R.sp.volMat.uniforms.uDensity.value = 0.03; G.heroLight.intensity = 0; G.fill.intensity = 0.5; G.fill.color.setRGB(1, 0.9, 0.8);
}
function startEnding() {
  if (G.state !== 'play') return;
  G.state = 'ending'; G.et = 0; G.ep = 0; hero.frozen = true; ui.showHud(false); ui.hint(false); ui.eye(0); audio.fanfare(); audio.level = 0;
}
function updateEnding(dt) {
  const e = G.et += dt, g = guards[0];
  if (e < 1.3) ui.fade(e / 1.2);
  if (G.ep === 0 && e >= 1.3) { G.ep = 1; ui.fade(1, 'MORNING'); setDay(); hero.place(W.home.x, W.home.z, 0); hero.base = 0.22; hero.mood = 0; hero.look = null; for (const w of watchers) w.reset(); g.x = -31.5; g.z = 1.6; g.yaw = Math.PI / 2; g.state = 'script'; g.day = true; G.cine = 1; audio.level = 2; }
  if (e > 3.2 && e < 4.4) ui.fade(1 - (e - 3.2) / 1.1, e > 3.3 ? '' : undefined);
  if (e >= 4.4 && G.ep === 1) { G.ep = 2; ui.fade(0, ''); }
  hero.update(dt, 0, 0, false, W);
  if (G.ep >= 1) {
    if (e < 7.6) { g.moveTo(-28.7, 0.7, dt, W, 1.3); }
    else if (e < 10.6) { g.yaw = dampA(g.yaw, yawOf(hero.x - g.x, hero.z - g.z), 4, dt); hero.look = g.head(); hero.mood = 1; if (G.ep === 2) { G.ep = 3; audio.huh(); ui.say('g0', '…Huh.', () => g.head(), 2.2); } }
    else if (e < 16) { if (G.ep === 3) { G.ep = 4; ui.say('g0', 'Nice nose.', () => g.head(), 2.4); } if (e > 11.6) g.moveTo(-18, 3.4, dt, W, 1.4); if (e > 12.6) { hero.look = { x: hero.x, y: 1.4, z: hero.z + 6 }; hero.mood = 2; } }
    if (G.ep === 4 && e > 13.4) { G.ep = 5; hero.wink = 0.55; audio.wink(); }
    if (G.ep === 5 && e > 15.2) { G.ep = 6; G.state = 'end'; G.et = 0; const m = Math.floor(G.time / 60), s = Math.floor(G.time % 60); ui.end(`<h2>PORTRAIT OF AN UNKNOWN MAN</h2><p>Roman, c. 120 AD</p><p><em>${G.worn.label}</em></p><div class="rule"></div><small>ONE NIGHT · ${m}:${String(s).padStart(2, '0')}</small><small>RE-SHELVED × ${G.reshelved}</small>`); }
    const r = g.rig, ph = g.walk; g.t += dt; r.g.position.set(g.x, 0, g.z); r.g.rotation.y = g.yaw; r.body.position.y = Math.abs(Math.sin(ph)) * 0.05;
    r.feet[0].position.set(-0.17, 0.08 + Math.max(0, Math.sin(ph)) * 0.12, 0.05 + Math.cos(ph) * 0.2); r.feet[1].position.set(0.17, 0.08 + Math.max(0, -Math.sin(ph)) * 0.12, 0.05 - Math.cos(ph) * 0.2);
  }
}
const dampA = (a, b, k, dt) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * (1 - Math.exp(-k * dt)); };

function updateCaught(dt) {
  const c = G.ct += dt;
  hero.update(dt, 0, 0, false, W);
  if (c > 0.9 && c < 1.5) ui.fade((c - 0.9) / 0.5);
  if (c >= 1.5 && !G.cdone) { G.cdone = true; ui.fade(1, 'RE-SHELVED'); respawn(); }
  if (c > 2.5) ui.fade(1 - (c - 2.5) / 0.6, c > 2.6 ? '' : undefined);
  if (c >= 3.1) { ui.fade(0, ''); G.state = 'play'; hero.frozen = false; hero.mood = 0; G.cdone = false; }
}

function step(dt) {
  G.t += dt; U.uTime.value = G.t;
  if (G.state === 'play') updatePlay(dt);
  else if (G.state === 'caught') updateCaught(dt);
  else if (G.state === 'ending' || G.state === 'end') { if (G.state === 'end') { G.et += dt; hero.update(dt, 0, 0, false, W); } else updateEnding(dt); }
  else if (G.state === 'title') { hero.update(dt, 0, 0, false, W); guards[0].update(dt, G); }
  orrery.update(dt); door.update(dt); tiles.update(dt); for (const key of keys) key.update(dt);
  if (G.worn) G.worn.mesh.rotation.set(0, 0, 0); for (const n of noses) if (n !== G.worn) n.mesh.rotation.y = Math.sin(G.t * 0.8 + n.spot.x) * 0.25;

  // camera
  const lab = hero.z < -8.6; W.front.visible = !lab; cams[0].g.visible = !lab;
  let fd;
  if (G.free) { camera.position.set(...G.free.p); camTgt.set(...G.free.t); fd = G.free.fd ?? 0.011; }
  else if (G.state === 'title' || G.cine) {
    const a = G.cine ? 0.25 : Math.sin(G.t * 0.12) * 0.5;
    camPos.set(W.home.x + Math.sin(a) * 5.2, G.cine ? 1.9 : 2.5 + Math.sin(G.t * 0.1) * 0.3, W.home.z + Math.cos(a) * 5.2 + (G.cine ? 0.6 : 0)); camTgt.set(W.home.x - (G.cine ? 0.5 : 0), 1.25, W.home.z);
    camera.position.lerp(camPos, 1 - Math.exp(-(G.cine ? 50 : 2) * dt)); fd = 0.03;
  } else {
    const tz = clamp(hero.z - 1.4, -19.5, 2.6), pitch = lab ? 0.7 : 0.5, dist = lab ? 14 : 17;
    camTgt.x = damp(camTgt.x, hero.x, 5, dt); camTgt.z = damp(camTgt.z, tz, 4, dt); camTgt.y = damp(camTgt.y, 1.0, 4, dt);
    camPos.set(camTgt.x, camTgt.y + Math.sin(pitch) * dist, camTgt.z + Math.cos(pitch) * dist);
    camera.position.lerp(camPos, 1 - Math.exp(-3.2 * dt)); fd = 0.011;
  }
  if (G.shake > 0) { G.shake -= dt; camera.position.x += (Math.random() - 0.5) * G.shake * 0.3; }
  camera.lookAt(camTgt);
  const fu = R.fin.uniforms;
  fu.uFocus.value = damp(fu.uFocus.value, camera.position.distanceTo(tmp.set(hero.x, 1.1, hero.z)), 6, dt); fu.uAperture.value = damp(fu.uAperture.value, fd, 3, dt);
  G.flash = Math.max(0, (G.flash || 0) - dt * 1.5);
  fu.uAlert.value = damp(fu.uAlert.value, Math.max(G.flash * 0.8, G.state === 'play' ? Math.max(G.maxA || 0, (G.maxD || 0) * 0.6) * 0.55 : G.state === 'caught' ? 0.6 : 0), 8, dt);
  fu.uWarm.value = G.cine ? 1 : 0;

  G.heroLight.position.set(hero.x + 0.4, 2.6, hero.z + 2.6);
  // moon shadow follows the view, snapped to texels
  const fx = camTgt.x, fz = camTgt.z, tex = 60 / 4096;
  tmp.set(fx, 0, fz); const a = tmp.dot(LR), b = tmp.dot(LU);
  tmp.addScaledVector(LR, Math.round(a / tex) * tex - a).addScaledVector(LU, Math.round(b / tex) * tex - b);
  moon.target.position.copy(tmp); moon.position.copy(tmp).addScaledVector(MOON_DIR, -90); moon.target.updateMatrixWorld();

  // beams and practical lights
  const beams = [];
  if (!G.cine) { for (const g of guards) beams.push(g.beam(W)); for (const c of cams) beams.push(c.beam()); beams.push(rex.beam(W)); }
  lights.update(dt, fx, fz, beams);

  // marks
  marks.begin();
  if (G.state === 'play' || G.state === 'caught') {
    for (const g of guards) { if (g.alert > 0.04) marks.put(g.head(), '!', 0.55 + g.alert * 0.5); else if (g.doubt > 0.04 || g.state === 'look' || g.state === 'investigate' || g.state === 'stare') marks.put(g.head(), '?', 0.5 + g.doubt * 0.5); }
    if (Math.abs(hero.x) < 14) marks.put(sleeper.head(), sleeper.wake > 0.55 ? '?' : 'z', 0.38 + sleeper.wake * 0.5 + Math.sin(G.t * 1.3) * 0.04);
    for (const c of cams) if (c.alert > 0.04) marks.put(c.head(), '!', 0.5 + c.alert * 0.5);
    if (rex.alert > 0.04) marks.put(rex.head(), '!', 0.8 + rex.alert * 0.6); else if (rex.stir) marks.put(rex.head(), '?', 0.8);
  } else if (G.state === 'ending' && G.ep === 3) marks.put(guards[0].head(), '?', 0.6);
  marks.end();

  // audio mix
  let hv = 0, hp = 0;
  for (const g of guards) { const d = Math.hypot(g.x - hero.x, g.z - hero.z), v = clamp(1 - d / 17, 0, 1); if (v > hv) { hv = v; hp = clamp((g.x - camTgt.x) / 12, -1, 1); } }
  audio.humVol = G.state === 'play' ? hv : 0; if (audio.humPan) audio.humPan.pan.value = hp;
  audio.snoreVol = clamp(1 - Math.hypot(sleeper.x - hero.x, sleeper.z - hero.z) / 14, 0, 1) * (G.state === 'play' ? 1 : 0);
  audio.tension = G.state === 'play' ? clamp(Math.max(G.maxA || 0, G.maxD || 0, G.lastSeen ? 0.3 : 0), 0, 1) : 0;
  audio.update(dt);
  ui.update(dt, camera, innerWidth, innerHeight);
}

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - last; last = now;
  const dt = Math.min(0.05, raw / 1000 || 0.016);
  step(dt);
  R.render();
  // adaptive resolution
  if (raw < 200) { ft = lerp(ft, raw, 0.05); if (++ftN > 90) { ftN = 0; const max = Math.min(devicePixelRatio || 1, 2); if (ft > 22 && pr > 0.6) { pr = Math.max(0.6, pr - 0.15); resize(); } else if (ft < 14 && pr < max) { pr = Math.min(max, pr + 0.1); resize(); } } }
}

G.dbg = {
  sim(sec, keys = {}) { const old = new Set(input.keys); for (const k of Object.keys(keys)) if (keys[k]) input.keys.add(k); const n = Math.round(sec * 60); for (let i = 0; i < n; i++) step(1 / 60); input.keys = old; return G.dbg.info(); },
  tp(x, z) { hero.place(x, z, 0); camTgt.set(x, 1, clamp(z - 1.4, -19.5, 2.6)); step(0.016); camera.position.copy(camPos); return G.dbg.info(); },
  info() { return { state: G.state, room: G.room, x: +hero.x.toFixed(2), z: +hero.z.toFixed(2), keys: G.keys, reshelved: G.reshelved, seen: G.lastSeen ? G.lastSeen.kind : null, a: +(G.maxA || 0).toFixed(2), d: +(G.maxD || 0).toFixed(2), wake: +sleeper.wake.toFixed(2), tiles: tiles.prog, door: +door.open.toFixed(2), worn: G.worn ? G.worn.id : null, pr, ft: +ft.toFixed(1), calls: R.renderer.info.render.calls, tris: R.renderer.info.render.triangles }; },
  start() { if (G.state === 'title') start(); },
  give(n = 3) { G.keys = n; ui.setKeys(n); door.setKeys(n); for (const k of keys.slice(0, n)) { k.got = true; k.fly = 1; } },
  act() { input.act = true; },
  cam(x, y, z, tx, ty, tz, fd) { G.free = x === undefined ? null : { p: [x, y, z], t: [tx, ty, tz], fd }; step(0.016); },
  day: () => setDay(),
  G, get R() { return R; }, get W() { return W; },
};

requestAnimationFrame(() => requestAnimationFrame(boot));
