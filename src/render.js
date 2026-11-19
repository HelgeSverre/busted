import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const MOON_DIR = new THREE.Vector3(0.18, -0.88, 0.44).normalize();
export const NSPOT = 4;

// uniforms shared between passes and materials
export const U = {
  tRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() },
  tMoon: { value: null }, uMoonMat: { value: new THREE.Matrix4() },
  uTime: { value: 0 }, uMoonCol: { value: new THREE.Color(0.55, 0.72, 1.0) },
};

// planar reflection hook for polished floors
export function hookFloor(mat, strength = 0.5, blur = 1) {
  mat.customProgramCacheKey = () => 'floor';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tRefl = U.tRefl; sh.uniforms.uReflMat = U.uReflMat;
    sh.uniforms.uReflK = { value: new THREE.Vector2(strength, blur) };
    mat.userData.reflK = sh.uniforms.uReflK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflMat; varying vec4 vReflUv;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvReflUv = uReflMat * modelMatrix * vec4(transformed, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tRefl; uniform vec2 uReflK; varying vec4 vReflUv;')
      .replace('#include <opaque_fragment>', `{
        vec2 ruv = vReflUv.xy / vReflUv.w;
        float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float fres = 0.1 + 0.9 * (1.0 - ndv) * (1.0 - ndv) * (1.0 - ndv);
        float lod = roughnessFactor * 9.0 * uReflK.y;
        vec3 rc = textureLod(tRefl, ruv, lod).rgb;
        outgoingLight += rc * fres * uReflK.x * (1.0 - roughnessFactor * 0.9);
      }
      #include <opaque_fragment>`);
  };
  return mat;
}

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COMMON = `
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }`;

const AO_FS = `
  uniform sampler2D tDepth; uniform mat4 uProj, uProjInv; uniform vec2 uTexel; varying vec2 vUv;
  ${COMMON}
  vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 c = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return c.xyz / c.w; }
  void main(){
    float d0 = texture2D(tDepth, vUv).x;
    if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
    vec3 p = vpos(vUv);
    vec3 r = vpos(vUv + vec2(uTexel.x, 0.0)) - p, l = p - vpos(vUv - vec2(uTexel.x, 0.0));
    vec3 u = vpos(vUv + vec2(0.0, uTexel.y)) - p, b = p - vpos(vUv - vec2(0.0, uTexel.y));
    vec3 dx = abs(r.z) < abs(l.z) ? r : l, dy = abs(u.z) < abs(b.z) ? u : b;
    vec3 n = normalize(cross(dx, dy));
    vec3 t = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), bt = cross(n, t);
    float rot = ign(gl_FragCoord.xy) * 6.2831, occ = 0.0;
    const float RAD = 0.6;
    for (int i = 0; i < 14; i++) {
      float fi = float(i), a = fi * 2.39996 + rot, z = 1.0 - (fi + 0.5) / 14.0, rr = sqrt(1.0 - z * z);
      vec3 sv = (t * cos(a) * rr + bt * sin(a) * rr + n * z) * RAD * (0.25 + 0.75 * fract(fi * 0.618 + rot));
      vec3 sp = p + sv; vec4 c = uProj * vec4(sp, 1.0); vec2 suv = c.xy / c.w * 0.5 + 0.5;
      float sz = vpos(suv).z;
      occ += step(sp.z + 0.04, sz) * smoothstep(0.0, 1.0, RAD / max(abs(p.z - sz), 1e-4));
    }
    float ao = 1.0 - occ / 14.0;
    gl_FragColor = vec4(ao * ao);
  }`;

const VOL_FS = `
  uniform sampler2D tDepth, tMoon; uniform mat4 uInvVP, uMoonMat; uniform vec3 uCam, uMoonCol; uniform float uTime, uDensity;
  uniform vec4 uSpotPos[${NSPOT}]; uniform vec4 uSpotDir[${NSPOT}]; uniform vec3 uSpotCol[${NSPOT}];
  varying vec2 vUv;
  ${COMMON}
  void main(){
    float d = texture2D(tDepth, vUv).x;
    vec4 w = uInvVP * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec3 wp = w.xyz / w.w;
    vec3 ray = wp - uCam; float len = min(length(ray), 90.0); vec3 dir = normalize(ray);
    float t0 = 0.0;
    if (uCam.y > 8.0 && dir.y < 0.0) t0 = (8.0 - uCam.y) / dir.y;
    if (uCam.z > 8.0 && dir.z < 0.0) t0 = max(t0, (8.0 - uCam.z) / dir.z);
    vec3 acc = vec3(0.0);
    if (t0 < len) {
      const int N = 30; float seg = (len - t0) / float(N), jit = ign(gl_FragCoord.xy);
      for (int i = 0; i < N; i++) {
        vec3 p = uCam + dir * (t0 + (float(i) + jit) * seg);
        float dens = 0.45 + 0.9 * n3(p * 0.42 + vec3(uTime * 0.05, -uTime * 0.03, uTime * 0.04));
        vec4 lp = uMoonMat * vec4(p, 1.0);
        vec2 luv = lp.xy * 0.5 + 0.5;
        float lit = step(lp.z * 0.5 + 0.5 - 0.0015, texture2D(tMoon, luv).r) * step(p.y, 8.0) * step(0.0, p.y) * step(abs(luv.x - 0.5), 0.499) * step(abs(luv.y - 0.5), 0.499);
        acc += uMoonCol * lit * dens;
        for (int s = 0; s < ${NSPOT}; s++) {
          vec3 L = p - uSpotPos[s].xyz; float dist = length(L); float ca = dot(L / max(dist, 1e-3), uSpotDir[s].xyz);
          float cone = smoothstep(uSpotDir[s].w, mix(uSpotDir[s].w, 1.0, 0.5), ca);
          float fall = clamp(1.0 - dist / uSpotPos[s].w, 0.0, 1.0);
          acc += uSpotCol[s] * cone * fall * fall / (0.6 + dist * dist * 0.12) * dens;
        }
      }
      acc *= seg * uDensity;
    }
    gl_FragColor = vec4(acc, 1.0);
  }`;

const COMP_FS = `
  uniform sampler2D tScene, tAO, tVol; uniform vec2 uHT; uniform float uAO; varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tScene, vUv).rgb;
    float ao = 0.0; vec3 vol = vec3(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)) * uHT;
      ao += texture2D(tAO, vUv + o * 1.2).r; vol += texture2D(tVol, vUv + o * 1.6).rgb;
    }
    ao /= 9.0; vol /= 9.0;
    float lum = dot(c, vec3(0.3, 0.6, 0.1));
    ao = mix(1.0, mix(ao, 1.0, smoothstep(1.0, 3.0, lum)), uAO);
    gl_FragColor = vec4(c * ao + vol, 1.0);
  }`;

const FIN_FS = `
  uniform sampler2D tDiffuse, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uFocus, uAperture, uTime, uFade, uAlert, uWarm; varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float viewZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
  void main(){
    float z = viewZ(vUv);
    float coc = clamp(abs(z - uFocus) / uFocus - 0.12, 0.0, 1.0) * uAperture;
    vec3 col = vec3(0.0); float wsum = 0.0;
    float rot = hash(vUv * uRes) * 6.2831;
    vec2 asp = vec2(uRes.y / uRes.x, 1.0);
    for (int i = 0; i < 18; i++) {
      float fi = float(i), r = sqrt((fi + 0.5) / 18.0), a = fi * 2.39996 + rot;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * coc * asp;
      float zc = viewZ(uv);
      float wgt = (zc < z - 1.0) ? clamp(abs(zc - uFocus) / uFocus - 0.12, 0.0, 1.0) * 3.0 + 0.05 : 1.0;
      col += texture2D(tDiffuse, uv).rgb * wgt; wsum += wgt;
    }
    col /= wsum;
    vec2 q = vUv - 0.5;
    col *= 1.0 - dot(q, q) * 0.75;
    float l = dot(col, vec3(0.3, 0.6, 0.1));
    col = mix(vec3(l), col, 1.1);
    col *= mix(vec3(0.96, 1.0, 1.06), vec3(1.08, 1.0, 0.9), uWarm);
    col += vec3(0.9, 0.08, 0.05) * uAlert * smoothstep(0.25, 0.75, length(q));
    col += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * 0.02;
    gl_FragColor = vec4(max(col, 0.0) * uFade, 1.0);
  }`;

class ScenePass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera;
    this.floors = []; this.ceilMats = []; this.hideInRefl = [];
    this.vcam = new THREE.PerspectiveCamera();
    const dt = new THREE.DepthTexture(4, 4); dt.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthTexture: dt });
    this.reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.aoRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType });
    this.volRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    U.tRefl.value = this.reflRT.texture;
    const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    this.aoMat = mk(AO_FS, { tDepth: { value: dt }, uProj: { value: camera.projectionMatrix }, uProjInv: { value: camera.projectionMatrixInverse }, uTexel: { value: new THREE.Vector2() } });
    const spots = { pos: [], dir: [], col: [] };
    for (let i = 0; i < NSPOT; i++) { spots.pos.push(new THREE.Vector4(0, -99, 0, 1)); spots.dir.push(new THREE.Vector4(0, -1, 0, 0.9)); spots.col.push(new THREE.Vector3()); }
    this.spots = spots;
    this.volMat = mk(VOL_FS, { tDepth: { value: dt }, tMoon: U.tMoon, uInvVP: { value: new THREE.Matrix4() }, uMoonMat: U.uMoonMat, uCam: { value: new THREE.Vector3() }, uMoonCol: U.uMoonCol, uTime: U.uTime, uDensity: { value: 0.075 }, uSpotPos: { value: spots.pos }, uSpotDir: { value: spots.dir }, uSpotCol: { value: spots.col } });
    this.compMat = mk(COMP_FS, { tScene: { value: this.sceneRT.texture }, tAO: { value: this.aoRT.texture }, tVol: { value: this.volRT.texture }, uHT: { value: new THREE.Vector2() }, uAO: { value: 0.9 } });
    this.fsq = new FullScreenQuad(this.aoMat);
    this.q = new THREE.Vector4(); this.clip = new THREE.Vector4(); this.plane = new THREE.Plane(); this.m = new THREE.Matrix4();
    this.reflOn = true;
  }
  setSize(w, h) {
    this.sceneRT.setSize(w, h);
    const d = this.sceneRT.depthTexture; d.image.width = w; d.image.height = h; d.needsUpdate = true;
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    this.reflRT.setSize(hw, hh); this.aoRT.setSize(hw, hh); this.volRT.setSize(hw, hh);
    this.aoMat.uniforms.uTexel.value.set(1 / hw, 1 / hh); this.compMat.uniforms.uHT.value.set(1 / hw, 1 / hh);
  }
  updateVCam() {
    const c = this.camera, v = this.vcam;
    c.updateMatrixWorld();
    const e = c.matrixWorld.elements;
    v.position.set(e[12], -e[13], e[14]);
    v.up.set(e[4], -e[5], e[6]);
    const tx = e[12] - e[8], ty = e[13] - e[9], tz = e[14] - e[10];
    v.lookAt(tx, -ty, tz);
    v.updateMatrixWorld();
    v.projectionMatrix.copy(c.projectionMatrix);
    U.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);
    // oblique near plane at y = 0
    this.plane.set(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(v.matrixWorldInverse);
    const cp = this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant), pm = v.projectionMatrix.elements, q = this.q;
    q.x = (Math.sign(cp.x) + pm[8]) / pm[0]; q.y = (Math.sign(cp.y) + pm[9]) / pm[5]; q.z = -1; q.w = (1 + pm[10]) / pm[14];
    cp.multiplyScalar(2 / cp.dot(q));
    pm[2] = cp.x; pm[6] = cp.y; pm[10] = cp.z + 1 - 0.003; pm[14] = cp.w;
    v.projectionMatrixInverse.copy(v.projectionMatrix).invert();
  }
  render(renderer, writeBuffer) {
    const { scene, camera } = this;
    camera.updateMatrixWorld();
    if (this.reflOn) {
      this.updateVCam();
      for (const f of this.floors) f.visible = false;
      const vis = this.hideInRefl.map((o) => o.visible); for (const o of this.hideInRefl) o.visible = false;
      for (const m of this.ceilMats) { m.colorWrite = true; m.depthWrite = true; }
      renderer.shadowMap.autoUpdate = true;
      renderer.setRenderTarget(this.reflRT); renderer.render(scene, this.vcam);
      for (const f of this.floors) f.visible = true;
      this.hideInRefl.forEach((o, i) => { o.visible = vis[i]; });
      for (const m of this.ceilMats) { m.colorWrite = false; m.depthWrite = false; }
      renderer.shadowMap.autoUpdate = false;
    } else renderer.shadowMap.autoUpdate = true;
    renderer.setRenderTarget(this.sceneRT); renderer.render(scene, camera);
    renderer.shadowMap.autoUpdate = true;
    this.fsq.material = this.aoMat; renderer.setRenderTarget(this.aoRT); this.fsq.render(renderer);
    const vu = this.volMat.uniforms;
    vu.uInvVP.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    vu.uCam.value.setFromMatrixPosition(camera.matrixWorld);
    this.fsq.material = this.volMat; renderer.setRenderTarget(this.volRT); this.fsq.render(renderer);
    this.fsq.material = this.compMat; renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.fsq.render(renderer);
  }
}

export function createRender(canvas, scene, camera) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
  const sp = new ScenePass(scene, camera);
  composer.addPass(sp);
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.38, 0.8, 0.95);
  composer.addPass(bloom);
  const fin = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tDepth: { value: sp.sceneRT.depthTexture }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.5 }, uFar: { value: 200 }, uFocus: { value: 18 }, uAperture: { value: 0.012 }, uTime: U.uTime, uFade: { value: 1 }, uAlert: { value: 0 }, uWarm: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: FIN_FS,
  });
  fin.uniforms.tDepth.value = sp.sceneRT.depthTexture;
  composer.addPass(fin);
  composer.addPass(new OutputPass());

  // static moon depth map for volumetric shafts and dust
  const moonCam = new THREE.OrthographicCamera(-78, 78, 21, -21, 1, 220);
  const mc = new THREE.Vector3(0, 4, -6);
  { const rt = new THREE.Vector3(1, 0, 0).addScaledVector(MOON_DIR, -MOON_DIR.x).normalize(); moonCam.up.crossVectors(rt, MOON_DIR).normalize(); }
  moonCam.position.copy(mc).addScaledVector(MOON_DIR, -110); moonCam.lookAt(mc); moonCam.updateMatrixWorld(); moonCam.updateProjectionMatrix();
  const moonRT = new THREE.WebGLRenderTarget(4096, 1104, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  U.tMoon.value = moonRT.texture;
  U.uMoonMat.value.multiplyMatrices(moonCam.projectionMatrix, moonCam.matrixWorldInverse);
  function bakeMoon(meshes) {
    const s = new THREE.Scene(), mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }' });
    for (const m of meshes) { const c = new THREE.Mesh(m.geometry, mat); c.matrixAutoUpdate = false; m.updateMatrixWorld(); c.matrix.copy(m.matrixWorld); s.add(c); }
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0xffffff, 1); renderer.setRenderTarget(moonRT); renderer.render(s, moonCam); renderer.setRenderTarget(null); renderer.setClearColor(cc, ca);
  }
  return {
    renderer, composer, bloom, fin, sp, bakeMoon,
    setSize(w, h, pr) {
      renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
      composer.setPixelRatio(pr); composer.setSize(w, h);
      sp.setSize(Math.floor(w * pr), Math.floor(h * pr));
      fin.uniforms.uRes.value.set(w * pr, h * pr);
    },
    render() { fin.uniforms.uTime.value = U.uTime.value; fin.uniforms.uNear.value = camera.near; fin.uniforms.uFar.value = camera.far; composer.render(); },
  };
}
