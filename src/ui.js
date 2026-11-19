import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const v = new THREE.Vector3();

export class UI {
  constructor() {
    this.keys = [...$('keys').children]; this.bub = new Map(); this.box = $('bubbles');
    this.fadeEl = $('fade'); this.fadeText = $('fadeText'); this.eyeEl = $('eye');
  }
  setKeys(n) { this.keys.forEach((k, i) => k.classList.toggle('on', i < n)); }
  showHud(on) { $('keys').style.opacity = on ? 1 : 0; }
  hint(on) { $('hint').style.opacity = on ? 1 : 0; }
  eye(s) { if (s !== this._eye) { this._eye = s; this.eyeEl.className = s ? 's' + s : ''; } }
  press(t) { $('press').textContent = t; }
  title(on) { $('card').style.opacity = on ? 1 : 0; }
  end(html) { $('title').style.display = 'none'; $('card').className = 't'; const e = $('end'); e.style.display = 'block'; e.innerHTML = html; $('card').style.opacity = 1; }
  fade(a, text) { this.fadeEl.style.opacity = a; if (text !== undefined) this.fadeText.textContent = text; }
  mute(m) { $('mute').style.opacity = m ? 0.9 : 0.45; $('mute').textContent = m ? 'M · MUTED' : 'M'; }
  // id: unique key; pos: {x,y,z} or function returning it
  say(id, text, pos, dur = 3, cls = '') {
    let b = this.bub.get(id);
    if (!b) { b = { el: document.createElement('div') }; this.box.appendChild(b.el); this.bub.set(id, b); }
    b.el.className = 'b ' + cls; b.el.textContent = text; b.pos = pos; b.t = dur; b.el.offsetWidth; b.el.classList.add('on');
  }
  hush(id) { const b = this.bub.get(id); if (b) b.t = Math.min(b.t, 0); }
  update(dt, cam, w, h) {
    for (const [id, b] of this.bub) {
      b.t -= dt;
      if (b.t <= 0) { b.el.classList.remove('on'); if (b.t < -0.4) { b.el.remove(); this.bub.delete(id); } continue; }
      const p = typeof b.pos === 'function' ? b.pos() : b.pos;
      v.set(p.x, p.y, p.z).project(cam);
      if (v.z > 1) { b.el.style.display = 'none'; continue; }
      b.el.style.display = ''; b.el.style.left = clampN((v.x * 0.5 + 0.5) * w, 90, w - 90) + 'px'; b.el.style.top = Math.max(60, (-v.y * 0.5 + 0.5) * h - 12) + 'px';
    }
  }
}
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));
