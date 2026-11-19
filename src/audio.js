// Generative heist-jazz score + synthesized effects. No samples.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CH = [[38, 41, 45, 48], [43, 46, 50, 53], [38, 41, 45, 48], [45, 49, 52, 55]]; // Dm7 Gm7 Dm7 A7
const BLUES = [62, 65, 67, 68, 69, 72, 74, 77];
const HUM = [69, -1, 72, 74, -1, 72, 69, -1, 67, -1, 69, 65, -1, -1, 62, -1];

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.tension = 0; this.humVol = 0; this.snoreVol = 0; this.step = 0; this.next = 0; this.level = 1; }
  init() {
    if (this.ctx) return;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0.8;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(C.destination);
    // hall reverb
    const len = C.sampleRate * 2.6, ir = C.createBuffer(2, len, C.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.rev = C.createConvolver(); this.rev.buffer = ir; const rg = C.createGain(); rg.gain.value = 0.42; this.rev.connect(rg); rg.connect(this.master);
    this.music = C.createGain(); this.music.gain.value = 0.55; this.lp = C.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 6000;
    this.music.connect(this.lp); this.lp.connect(this.master); this.lp.connect(this.rev);
    this.sfx = C.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master); this.sfx.connect(this.rev);
    const nb = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; this.noiseBuf = nb;
    // tension cluster
    this.ten = C.createGain(); this.ten.gain.value = 0; this.ten.connect(this.master); this.ten.connect(this.rev);
    for (const m of [74, 75, 80, 86]) { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); const g = C.createGain(); g.gain.value = 0.035; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = mtof(m) * 1.5; f.Q.value = 2; const l = C.createOscillator(); l.frequency.value = 9 + Math.random() * 3; const lg = C.createGain(); lg.gain.value = 0.03; l.connect(lg); lg.connect(g.gain); o.connect(f); f.connect(g); g.connect(this.ten); o.start(); l.start(); }
    // guard hum
    this.hum = C.createOscillator(); this.hum.type = 'sine'; this.humG = C.createGain(); this.humG.gain.value = 0; this.humPan = C.createStereoPanner(); this.hum.connect(this.humG); this.humG.connect(this.humPan); this.humPan.connect(this.master); this.humPan.connect(this.rev); this.hum.start();
    const vib = C.createOscillator(); vib.frequency.value = 5.5; const vg = C.createGain(); vg.gain.value = 5; vib.connect(vg); vg.connect(this.hum.frequency); vib.start();
    this.next = C.currentTime + 0.1;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  tone(type, f, t, a, peak, d, dest, f2) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    this.env(g, t, a, peak, d); o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + a + d + 0.05); return o;
  }
  noise(t, a, peak, d, type, freq, q, dest) {
    const C = this.ctx, s = C.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1; const g = C.createGain();
    this.env(g, t, a, peak, d); s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random()); s.stop(t + a + d + 0.05); return f;
  }
  update(dt) {
    if (!this.ctx) return;
    const C = this.ctx, now = C.currentTime;
    this.ten.gain.setTargetAtTime(this.tension * 0.9, now, 0.15);
    this.lp.frequency.setTargetAtTime(6500 - this.tension * 5600, now, 0.2);
    this.humG.gain.setTargetAtTime(this.humVol * (this.humGate ? 0.06 : 0.008), now, 0.05);
    const beat = 60 / 104, e8 = beat / 2;
    while (this.next < now + 0.15) {
      const s = this.step, t = this.next, bar = Math.floor(s / 8) % 4, b8 = s % 8, ch = CH[bar], m = this.music;
      if (this.level > 0) {
        if (b8 % 2 === 0) { // walking bass
          const q = b8 / 2, note = q === 0 ? ch[0] : q === 3 ? CH[(bar + 1) % 4][0] + (Math.random() < 0.5 ? 1 : -1) : ch[(q + (bar % 2)) % 4] + (Math.random() < 0.2 ? 12 : 0);
          this.tone('triangle', mtof(note), t, 0.008, 0.5, 0.42, m); this.tone('sine', mtof(note) * 2, t, 0.005, 0.12, 0.12, m);
        }
        this.noise(t, 0.004, b8 % 4 === 2 ? 0.09 : 0.045, 0.07, 'highpass', 6500, 1, m);
        if (b8 === 2 || b8 === 6) this.noise(t, 0.002, 0.2, 0.05, 'bandpass', 1900, 3, m);
        if (this.level > 1 && (b8 === 3 || b8 === 7) && Math.random() < 0.5) this.noise(t, 0.03, 0.05, 0.18, 'bandpass', 4200, 0.8, m);
        if (Math.floor(s / 8) % 2 === 1 && Math.random() < 0.42 * this.level) { const n = BLUES[Math.floor(Math.random() * BLUES.length)] + (bar === 3 ? 1 : 0) * 0; this.tone('sine', mtof(n), t, 0.004, 0.16, 0.9, m); this.tone('sine', mtof(n) * 4, t, 0.002, 0.03, 0.25, m); }
      }
      const hn = HUM[s % 16]; if (hn > 0) this.hum.frequency.setTargetAtTime(mtof(hn + 12), t, 0.02);
      this.humGate = hn > 0;
      this.next += b8 % 2 === 0 ? e8 * 1.3 : e8 * 0.7; this.step++;
    }
    if (this.snoreVol > 0.02) { this.snT = (this.snT || 0) - dt; if (this.snT <= 0) { this.snT = 2.9; const f = this.noise(now, 0.7, 0.16 * this.snoreVol, 0.6, 'bandpass', 260, 5); f.frequency.linearRampToValueAtTime(190, now + 1.2); this.noise(now + 1.5, 0.5, 0.07 * this.snoreVol, 0.6, 'bandpass', 900, 4); } }
  }
  hop(sneak) { if (!this.ctx) return; const t = this.ctx.currentTime; if (sneak) { this.noise(t, 0.002, 0.05, 0.04, 'bandpass', 2400, 2); return; } this.tone('sine', 130, t, 0.003, 0.5, 0.11, null, 55); this.noise(t, 0.002, 0.22, 0.06, 'lowpass', 900, 1); }
  key() { if (!this.ctx) return; const t = this.ctx.currentTime; [76, 81, 88, 93].forEach((n, i) => { this.tone('sine', mtof(n), t + i * 0.07, 0.004, 0.22, 0.7); this.tone('triangle', mtof(n) * 2.01, t + i * 0.07, 0.002, 0.05, 0.3); }); }
  alarm() { if (!this.ctx) return; const t = this.ctx.currentTime; for (let i = 0; i < 4; i++) this.tone('square', i % 2 ? 660 : 880, t + i * 0.13, 0.005, 0.11, 0.1); }
  huh() { if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.tone('sawtooth', 150, t, 0.03, 0.14, 0.28, null, 230); void o; }
  spotted() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone('sawtooth', 300, t, 0.01, 0.22, 0.3, null, 620); this.noise(t, 0.005, 0.2, 0.2, 'bandpass', 3000, 1); }
  caught() { if (!this.ctx) return; const t = this.ctx.currentTime; [58, 57, 56, 55].forEach((n, i) => { const o = this.tone('sawtooth', mtof(n), t + 0.35 + i * 0.36, 0.03, 0.2, i === 3 ? 0.9 : 0.3, null, i === 3 ? mtof(n - 1.5) : undefined); void o; }); }
  growl() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone('sawtooth', 62, t, 0.2, 0.3, 1.2, null, 44); this.noise(t, 0.2, 0.2, 1.0, 'lowpass', 300, 2); }
  stir() { if (!this.ctx) return; const t = this.ctx.currentTime; for (let i = 0; i < 5; i++) this.noise(t + i * 0.16, 0.002, 0.14, 0.05, 'bandpass', 1500 + i * 200, 6); }
  roar() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone('sawtooth', 110, t, 0.08, 0.55, 1.6, null, 48); this.tone('square', 83, t, 0.1, 0.25, 1.4, null, 40); this.noise(t, 0.05, 0.5, 1.5, 'bandpass', 700, 0.7); }
  bonk() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone('sine', 420, t, 0.003, 0.25, 0.12, null, 240); this.tone('square', 1200, t + 0.12, 0.003, 0.06, 0.08); }
  note(i) { if (!this.ctx) return; const t = this.ctx.currentTime, n = [60, 62, 64, 65, 67, 69, 71, 72][i]; this.tone('sine', mtof(n), t, 0.004, 0.4, 1.2); this.tone('sine', mtof(n) * 3, t, 0.002, 0.08, 0.4); this.tone('triangle', mtof(n) * 2, t, 0.003, 0.1, 0.6); }
  unlock() { if (!this.ctx) return; const t = this.ctx.currentTime; for (let i = 0; i < 3; i++) { this.tone('square', 190, t + i * 0.38, 0.002, 0.25, 0.05); this.noise(t + i * 0.38, 0.002, 0.3, 0.08, 'bandpass', 1300, 4); } const f = this.noise(t + 1.3, 0.4, 0.12, 1.6, 'bandpass', 420, 9); f.frequency.linearRampToValueAtTime(760, t + 3); }
  boop() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone('sine', 520, t, 0.004, 0.3, 0.14, null, 880); this.tone('sine', 1320, t + 0.1, 0.004, 0.14, 0.2); }
  chime() { if (!this.ctx) return; const t = this.ctx.currentTime; [72, 76, 79, 84, 88].forEach((n, i) => this.tone('sine', mtof(n), t + i * 0.09, 0.004, 0.2, 1.2)); }
  fanfare() { if (!this.ctx) return; const t = this.ctx.currentTime; [[62, 0], [66, 0.18], [69, 0.36], [74, 0.54], [74, 0.9], [78, 0.9], [81, 0.9]].forEach(([n, d]) => { this.tone('sawtooth', mtof(n), t + d, 0.02, 0.12, d > 0.8 ? 1.8 : 0.3, this.music); this.tone('sine', mtof(n + 12), t + d, 0.01, 0.1, d > 0.8 ? 1.8 : 0.3); }); }
  wink() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone('sine', 1760, t, 0.002, 0.2, 0.5); this.tone('sine', 2637, t + 0.06, 0.002, 0.14, 0.6); }
}
