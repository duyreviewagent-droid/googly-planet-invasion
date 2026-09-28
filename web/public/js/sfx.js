// Every sound and every note of music in Googly-Planet Invasion is synthesised live with WebAudio — nothing to download.
// Instruments: plucked strings, horns, brass, pads, piano, bells, arps, synth leads, kits and an 808-ish synth bass.
// Songs: the title theme, the mothership, three invasion themes, the Guardian fight, and victory stingers — each
// galaxy plays them in its own key. Ambience: the saucer's engine hum, the tractor beam, rain and the deep-space drone.
let ctx = null, master = null, comp = null, sfxBus = null, musicBus = null, ambBus = null, ambFilter = null, verb = null, verbIn = null;
const VOL = { music: 0.36, sfx: 1, amb: 0.8 };
let musicOn = true, sfxOn = true;
try {
  musicOn = localStorage.getItem('gpi.music') !== '0'; sfxOn = localStorage.getItem('gpi.sfx') !== '0';
  for (const k of ['music', 'sfx', 'amb']) { const v = localStorage.getItem('gpi.vol.' + k); if (v !== null) VOL[k] = Math.max(0, Math.min(1, +v)); }
} catch { }

function buildGraph(c) {
  ctx = c;
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  // a brick-wall limiter and a soft clipper at the very end: nothing can ever get painfully loud
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
  const clip = ctx.createWaveShaper(), curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2); } clip.curve = curve;
  comp.connect(lim); lim.connect(clip); clip.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = 0.85; master.connect(comp);
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? VOL.sfx : 0; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? VOL.music : 0; musicBus.connect(master);
  // ambience goes through a filter so it sounds muffled when you're inside your shelter
  ambFilter = ctx.createBiquadFilter(); ambFilter.type = 'lowpass'; ambFilter.frequency.value = 18000; ambFilter.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = sfxOn ? VOL.amb : 0; ambBus.connect(ambFilter);
  // an outdoor reverb: a long, soft noise tail
  verb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 400 ? i / 400 : 1); }
  verb.buffer = ir; verbIn = ctx.createGain(); verbIn.gain.value = 1; verbIn.connect(verb);
  const vg = ctx.createGain(); vg.gain.value = 0.32; verb.connect(vg); vg.connect(master);
  noiseBuf = null; ksCache.clear();
}
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { buildGraph(new (window.AudioContext || window.webkitAudioContext)()); } catch { return; }
  music.start();
  ambience.start();
}
export const audioReady = () => !!ctx && ctx.state === 'running';
export function setMusic(on) { musicOn = on; try { localStorage.setItem('gpi.music', on ? '1' : '0'); } catch { } if (musicBus) musicBus.gain.setTargetAtTime(on ? VOL.music : 0, ctx.currentTime, 0.1); }
export function setSfx(on) { sfxOn = on; try { localStorage.setItem('gpi.sfx', on ? '1' : '0'); } catch { } if (sfxBus) { sfxBus.gain.setTargetAtTime(on ? VOL.sfx : 0, ctx.currentTime, 0.05); ambBus.gain.setTargetAtTime(on ? VOL.amb : 0, ctx.currentTime, 0.05); } }
export function setVolume(kind, v) {
  VOL[kind] = Math.max(0, Math.min(1, v)); try { localStorage.setItem('gpi.vol.' + kind, String(VOL[kind])); } catch { }
  if (!ctx) return;
  if (kind === 'music') musicBus.gain.setTargetAtTime(musicOn ? VOL.music : 0, ctx.currentTime, 0.05);
  if (kind === 'sfx') sfxBus.gain.setTargetAtTime(sfxOn ? VOL.sfx : 0, ctx.currentTime, 0.05);
  if (kind === 'amb') ambBus.gain.setTargetAtTime(sfxOn ? VOL.amb : 0, ctx.currentTime, 0.05);
}
export const audioState = () => ({ music: musicOn, sfx: sfxOn, vol: { ...VOL } });
const now = () => ctx ? ctx.currentTime : 0;
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ building blocks
let noiseBuf = null;
function nb() { if (!noiseBuf) { const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; } return noiseBuf; }
function env(g, t0, vol, attack, dur, curve = 'exp') {
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur); else { g.gain.setValueAtTime(vol, t0 + dur * 0.7); g.gain.linearRampToValueAtTime(0, t0 + dur); }
}
function sendTo(node, amt) { if (!amt) return; const s = ctx.createGain(); s.gain.value = amt; node.connect(s); s.connect(verbIn); }
function tone(f, t0, dur, { type = 'sine', vol = 0.3, attack = 0.004, slide = 0, out = sfxBus, send = 0, vib = 0, vibRate = 6, detune = 0, curve = 'exp' } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0); o.detune.value = detune;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t0 + dur);
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibRate; lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(f * vib, t0 + Math.min(0.25, dur * 0.4)); l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
  env(g, t0, vol, attack, dur, curve);
  o.connect(g); g.connect(out); sendTo(g, send);
  o.start(t0); o.stop(t0 + dur + 0.05);
  return o;
}
function noise(t0, dur, { vol = 0.3, f = 2000, q = 1, type = 'bandpass', slide = 0, out = sfxBus, attack = 0.002, send = 0, rate = 1, curve = 'exp' } = {}) {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = nb(); s.playbackRate.value = rate * (0.85 + Math.random() * 0.3);
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
  if (slide) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t0 + dur);
  const g = ctx.createGain(); env(g, t0, vol, attack, dur, curve);
  s.connect(fl); fl.connect(g); g.connect(out); sendTo(g, send);
  s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
}
// Karplus-Strong plucked string, cached per note
const ksCache = new Map();
function ksBuffer(m, bright = 0.5, dur = 1.6) {
  const key = m + ':' + bright + ':' + dur;
  if (ksCache.has(key)) return ksCache.get(key);
  const sr = ctx.sampleRate, n = Math.floor(sr * dur), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const f = midi(m), N = Math.max(2, Math.round(sr / f)), ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1) * (1 - bright * 0.5) + (i < N / 2 ? bright : -bright) * 0.5;
  const decay = 0.996 - (1 - bright) * 0.004 + Math.min(0.003, f / 200000);
  let p = 0, last = 0;
  for (let i = 0; i < n; i++) { const cur = ring[p], nxt = ring[(p + 1) % N]; const v = (cur + nxt) * 0.5 * decay; ring[p] = v; d[i] = cur; last = v; p = (p + 1) % N; }
  void last;
  ksCache.set(key, buf);
  return buf;
}
function pluck(m, t, { vol = 0.3, out = sfxBus, bright = 0.5, dur = 1.6, send = 0.2, bend = 0 } = {}) {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = ksBuffer(Math.round(m), bright, dur);
  if (bend) { s.playbackRate.setValueAtTime(Math.pow(2, -bend / 12), t); s.playbackRate.exponentialRampToValueAtTime(1, t + 0.12); }
  const g = ctx.createGain(); g.gain.value = vol;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
  s.connect(hp); hp.connect(g); g.connect(out); sendTo(g, send);
  s.start(t); s.stop(t + dur);
}
// positional: a gain/pan/lowpass chain for a world position relative to the listener
let listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
export function setListener(x, y, z, yaw) { listener = { x, y, z, rx: Math.cos(yaw), rz: -Math.sin(yaw) }; }
function at(pos, base = 1, reach = 7, bus = sfxBus) {
  if (!ctx) return null;
  if (!pos) { if (base === 1) return bus; const g = ctx.createGain(); g.gain.value = base; g.connect(bus); setTimeout(() => { try { g.disconnect(); } catch { } }, 4000); return g; }
  const dx = pos[0] - listener.x, dy = pos[1] - listener.y, dz = pos[2] - listener.z, d = Math.hypot(dx, dy, dz);
  const g = ctx.createGain(); g.gain.value = base / (1 + d / reach);
  const p = ctx.createStereoPanner(); p.pan.value = d > 0.1 ? Math.max(-1, Math.min(1, (dx * listener.rx + dz * listener.rz) / d)) * 0.9 : 0;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000 / (1 + d / 12);
  g.connect(lp); lp.connect(p); p.connect(bus);
  setTimeout(() => { try { g.disconnect(); lp.disconnect(); p.disconnect(); } catch { } }, 4000);
  return g;
}
const distTo = pos => pos ? Math.hypot(pos[0] - listener.x, pos[2] - listener.z) : 0;

// ------------------------------------------------------------------ instruments (used by the music and a few stingers)
const INST = {
  guitar(m, t, d, v, out) { pluck(m, t, { vol: v * 1.1, out, bright: 0.45, dur: Math.max(1, d + 0.6), send: 0.25 }); },
  oud(m, t, d, v, out) { pluck(m, t, { vol: v * 1.2, out, bright: 0.75, dur: 1.2, send: 0.3, bend: Math.random() < 0.3 ? 1 : 0 }); },
  harp(m, t, d, v, out) { pluck(m, t, { vol: v, out, bright: 0.3, dur: 2.4, send: 0.5 }); },
  flute(m, t, d, v, out) {
    const f = midi(m);
    tone(f, t, d + 0.12, { type: 'sine', vol: v * 0.8, attack: 0.06, out, send: 0.45, vib: 0.012, vibRate: 5.2, curve: 'lin' });
    tone(f * 2, t, d + 0.1, { type: 'sine', vol: v * 0.12, attack: 0.07, out, curve: 'lin' });
    noise(t, Math.min(0.25, d), { f: f * 2, q: 4, vol: v * 0.18, out, attack: 0.03 });
  },
  whistle(m, t, d, v, out) { tone(midi(m), t, d + 0.08, { type: 'sine', vol: v * 0.7, attack: 0.03, out, send: 0.35, vib: 0.02, vibRate: 6.5, curve: 'lin' }); },
  horn(m, t, d, v, out) {
    const f = midi(m), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = o2.type = 'sawtooth'; o1.frequency.value = f; o2.frequency.value = f; o2.detune.value = 7;
    fl.type = 'lowpass'; fl.Q.value = 1.5; fl.frequency.setValueAtTime(f * 1.2, t); fl.frequency.linearRampToValueAtTime(f * 4, t + 0.08); fl.frequency.exponentialRampToValueAtTime(f * 2.2, t + d);
    env(g, t, v * 0.35, 0.05, d + 0.15, 'lin');
    o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(out); sendTo(g, 0.4);
    for (const o of [o1, o2]) { o.start(t); o.stop(t + d + 0.2); }
  },
  pad(m, t, d, v, out) {
    const f = midi(m), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    fl.type = 'lowpass'; fl.frequency.value = Math.min(2400, f * 5); fl.Q.value = 0.5;
    env(g, t, v * 0.16, Math.min(0.8, d * 0.4), d + 0.6, 'lin');
    fl.connect(g); g.connect(out); sendTo(g, 0.6);
    for (const dt of [-9, 0, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(fl); o.start(t); o.stop(t + d + 0.7); }
  },
  piano(m, t, d, v, out) {
    const f = midi(m), g = ctx.createGain(); g.connect(out); sendTo(g, 0.35);
    g.gain.value = 1;
    [[1, 1, 1.6], [2, 0.4, 0.9], [3, 0.18, 0.6], [4.01, 0.08, 0.35]].forEach(([k, a, dd]) => tone(f * k, t, Math.max(0.4, dd * (1.4 - m / 120)), { type: 'sine', vol: v * a * 0.5, out: g, attack: 0.003 }));
    noise(t, 0.02, { f: 2500, q: 1, vol: v * 0.08, out: g });
  },
  marimba(m, t, d, v, out) { const f = midi(m); tone(f, t, 0.5, { type: 'sine', vol: v * 0.7, out, send: 0.3 }); tone(f * 4, t, 0.06, { type: 'sine', vol: v * 0.2, out }); tone(f * 10, t, 0.02, { type: 'sine', vol: v * 0.05, out }); },
  kalimba(m, t, d, v, out) { const f = midi(m); tone(f, t, 1.1, { type: 'sine', vol: v * 0.6, out, send: 0.5 }); tone(f * 5.95, t, 0.12, { type: 'sine', vol: v * 0.12, out }); },
  bell(m, t, d, v, out) { const f = midi(m); tone(f, t, 2.2, { type: 'sine', vol: v * 0.45, out, send: 0.7 }); tone(f * 2.76, t, 1.1, { type: 'sine', vol: v * 0.12, out, send: 0.6 }); tone(f * 5.4, t, 0.5, { type: 'sine', vol: v * 0.05, out }); },
  pizz(m, t, d, v, out) { pluck(m, t, { vol: v, out, bright: 0.2, dur: 0.6, send: 0.3 }); },
  bass(m, t, d, v, out) {
    const f = midi(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f / 2;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(200, t + d);
    env(g, t, v * 0.5, 0.008, d + 0.1);
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(out);
    for (const x of [o, o2]) { x.start(t); x.stop(t + d + 0.15); }
  },
  synthbass(m, t, d, v, out) {
    const f = midi(m), o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.Q.value = 7; fl.frequency.setValueAtTime(1400, t); fl.frequency.exponentialRampToValueAtTime(160, t + d);
    env(g, t, v * 0.32, 0.005, d + 0.05); o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.1);
  },
  brass(m, t, d, v, out) { INST.horn(m, t, d, v * 1.2, out); INST.horn(m + 12, t, d, v * 0.4, out); },
};
// drums
const DRUM = {
  k(t, v, out) { tone(150, t, 0.28, { vol: v * 0.9, slide: 0.3, out }); noise(t, 0.012, { f: 3500, vol: v * 0.15, out }); },
  s(t, v, out) { noise(t, 0.16, { f: 1900, q: 0.7, vol: v * 0.45, out, send: 0.25 }); tone(200, t, 0.08, { vol: v * 0.22, type: 'triangle', out }); },
  brush(t, v, out) { noise(t, 0.12, { f: 4200, q: 0.6, vol: v * 0.2, out, attack: 0.02 }); },
  h(t, v, out) { noise(t, 0.03, { f: 9000, type: 'highpass', vol: v * 0.12, out }); },
  o(t, v, out) { noise(t, 0.18, { f: 8000, type: 'highpass', vol: v * 0.1, out }); },
  sh(t, v, out) { noise(t, 0.06, { f: 6500, q: 1.2, vol: v * 0.12, out, attack: 0.015 }); },
  dum(t, v, out) { tone(110, t, 0.35, { vol: v * 0.8, slide: 0.55, out, send: 0.2 }); noise(t, 0.05, { f: 400, vol: v * 0.2, out }); },
  tek(t, v, out) { noise(t, 0.05, { f: 3200, q: 3, vol: v * 0.35, out, send: 0.15 }); tone(620, t, 0.04, { vol: v * 0.12, out }); },
  taiko(t, v, out) { tone(95, t, 0.9, { vol: v * 1.1, slide: 0.45, out, send: 0.55 }); noise(t, 0.25, { f: 180, type: 'lowpass', vol: v * 0.5, out }); },
  rim(t, v, out) { noise(t, 0.02, { f: 2600, q: 8, vol: v * 0.3, out }); tone(1700, t, 0.02, { vol: v * 0.1, out }); },
  tim(t, v, out) { tone(82, t, 1.1, { vol: v * 0.7, slide: 0.9, out, send: 0.5 }); noise(t, 0.3, { f: 200, type: 'lowpass', vol: v * 0.25, out }); },
  clap(t, v, out) { for (let i = 0; i < 3; i++) noise(t + i * 0.011, 0.09, { f: 1400, q: 1, vol: v * 0.3, out, send: 0.3 }); },
};

// ------------------------------------------------------------------ googly voices: little formant squeaks
function voice(pos, pitch, pattern, vol = 0.12) {
  if (!ctx) return; const t = now(), o = at(pos, vol * 10, 8);
  for (const [dt, f0, f1, dur, vowel] of pattern) {
    const osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * pitch, t + dt); osc.frequency.exponentialRampToValueAtTime(f1 * pitch, t + dt + dur);
    const formants = { a: [800, 1200], e: [500, 1900], i: [300, 2300], o: [500, 900], u: [350, 700] }[vowel || 'a'];
    env(g, t + dt, 0.45, 0.015, dur);
    osc.connect(g);
    for (const ff of formants) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff * (0.9 + pitch * 0.1); bp.Q.value = 6; g.connect(bp); bp.connect(o); }
    osc.start(t + dt); osc.stop(t + dt + dur + 0.05);
  }
}

// ------------------------------------------------------------------ space instruments
INST.arp = (m, t, d, v, out) => {
  const f = midi(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f * 1.003;
  fl.type = 'lowpass'; fl.Q.value = 4; fl.frequency.setValueAtTime(f * 7, t); fl.frequency.exponentialRampToValueAtTime(f * 1.5, t + Math.min(0.3, d + 0.1));
  env(g, t, v * 0.22, 0.004, Math.min(0.5, d + 0.2));
  o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(out); sendTo(g, 0.35);
  for (const x of [o, o2]) { x.start(t); x.stop(t + d + 0.3); }
};
INST.lead = (m, t, d, v, out) => {
  const f = midi(m), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  fl.type = 'lowpass'; fl.frequency.value = f * 5; fl.Q.value = 1;
  env(g, t, v * 0.2, 0.02, d + 0.12, 'lin'); fl.connect(g); g.connect(out); sendTo(g, 0.5);
  for (const [type, det] of [['square', -6], ['sawtooth', 6]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.01, t + 0.3); l.connect(lg); lg.connect(o.frequency); o.connect(fl); o.start(t); o.stop(t + d + 0.2); l.start(t); l.stop(t + d + 0.2); }
};
INST.choir = (m, t, d, v, out) => {
  const f = midi(m), g = ctx.createGain(); env(g, t, v * 0.1, Math.min(0.9, d * 0.4), d + 0.8, 'lin'); g.connect(out); sendTo(g, 0.8);
  for (const det of [-8, 0, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; for (const ff of [700, 1150]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 5; o.connect(bp); bp.connect(g); } o.start(t); o.stop(t + d + 0.9); }
};
INST.glass = (m, t, d, v, out) => { const f = midi(m); tone(f, t, 1.8, { type: 'sine', vol: v * 0.4, out, send: 0.8 }); tone(f * 3.01, t, 0.9, { type: 'sine', vol: v * 0.1, out, send: 0.7 }); tone(f * 5.43, t, 0.3, { type: 'sine', vol: v * 0.05, out }); };
INST.vibes = (m, t, d, v, out) => { const f = midi(m); tone(f, t, 1.6, { type: 'sine', vol: v * 0.55, out, send: 0.45, vib: 0.004, vibRate: 5.5 }); tone(f * 4, t, 0.3, { type: 'sine', vol: v * 0.08, out, send: 0.3 }); };
INST.stab = (m, t, d, v, out) => { for (const iv of [0, 7, 12, 15]) INST.horn(m + iv, t, Math.min(0.18, d), v * 0.7, out); };
DRUM.gate = (t, v, out) => { noise(t, 0.28, { f: 1600, q: 0.6, vol: v * 0.5, out, send: 0.7, curve: 'lin' }); tone(180, t, 0.1, { vol: v * 0.3, type: 'triangle', out }); };
DRUM.boom = (t, v, out) => { tone(52, t, 0.9, { vol: v * 1.1, slide: 0.5, out, send: 0.4 }); noise(t, 0.08, { f: 300, vol: v * 0.3, out }); };

// ------------------------------------------------------------------ the songs
// chords: one per bar as [root semitone, quality]; mel: 8 notes a bar (semitones above root+24, '.' rest, '-' hold);
// drum patterns are 16 steps a bar; form plays the sections in order and loops. Every galaxy transposes the music.
const Q = { M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], D7: [0, 4, 7, 10], s4: [0, 5, 7], s2: [0, 2, 7], m9: [0, 3, 7, 14], M9: [0, 4, 7, 14], add9: [0, 4, 7, 14] };
const mel = s => s.trim().split(/\s+/).map(x => x === '.' ? null : x === '-' ? '-' : +x);
const SONGS = {
  // the title: floating in space — glassy bells, a choir and a slow arpeggio
  menu: {
    bpm: 84, root: 40, swing: 0, lead: 'glass', comp: 'arp', bass: 'bass', pad: 'choir', kit: { k: 'x.......x.......', h: '....x.......x...' }, comp_pat: 'arp', form: 'AB',
    A: { chords: [[0, 'm9'], [-4, 'M9'], [-7, 'M9'], [-2, 's2']], mel: mel('19 - - - 17 - 15 -  14 - - - 12 - - -  15 - - - 14 - 12 -  10 - - - . . . .') },
    B: { chords: [[-4, 'M9'], [-2, 'add9'], [0, 'm9'], [-5, 's4']], mel: mel('20 - - - 19 - 17 -  19 - - - 22 - - -  24 - - - 22 - 19 -  17 - - - 14 - - -') },
  },
  // the mothership: a chill groove for shopping and planning
  hangar: {
    bpm: 92, root: 43, swing: 0.2, lead: 'vibes', comp: 'piano', bass: 'bass', kit: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx', sh: '..x...x...x...x.' }, comp_pat: 'block', form: 'AB',
    A: { chords: [[0, 'M7'], [5, 'M7'], [2, 'm7'], [7, 'D7']], mel: mel('16 - 19 - 21 - . .  19 - 16 - 14 - . .  12 - 14 - 16 - 19 -  17 - - - . . . .') },
    B: { chords: [[-3, 'm7'], [2, 'm7'], [5, 'M7'], [7, 's4']], mel: mel('12 - 16 - 19 - 21 -  21 - 19 - 16 - . .  17 - 21 - 24 - 21 -  19 - - - . . . .') },
  },
  // invading: driving synthwave
  invade1: {
    bpm: 118, root: 38, swing: 0, lead: 'lead', comp: 'arp', bass: 'synthbass', bassPat: 'sixteen', pad: 'pad', kit: { k: 'x...x...x...x...', gate: '....x.......x...', h: '..x...x...x...x.' }, comp_pat: 'arp16', form: 'AABB',
    A: { chords: [[0, 'm'], [-4, 'M'], [-7, 'M'], [-2, 'M']], mel: mel('12 - - 15 - - 17 -  15 - - 12 - - 10 -  12 - - 15 - - 19 -  17 - - - 15 - - -') },
    B: { chords: [[-4, 'M'], [-2, 'M'], [0, 'm'], [-5, 'M']], mel: mel('20 - - 19 - - 17 -  19 - - 17 - - 15 -  17 - 19 - 20 - 22 -  24 - - - - - . .') },
  },
  invade2: {
    bpm: 126, root: 41, swing: 0, lead: 'lead', comp: 'arp', bass: 'synthbass', bassPat: 'sixteen', kit: { k: 'x..x..x.x..x..x.', clap: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' }, comp_pat: 'arp16', form: 'AB',
    A: { chords: [[0, 'm'], [0, 'm'], [3, 'M'], [5, 'M']], mel: mel('12 - 15 - 12 - 10 -  12 - - - 7 - - -  15 - 17 - 19 - 17 -  15 - - - 14 - - -') },
    B: { chords: [[-4, 'M'], [-2, 'M'], [3, 'M'], [-5, 'M']], mel: mel('20 - 19 - 17 - 15 -  17 - 15 - 14 - 12 -  15 - 17 - 19 - 22 -  19 - - - - - . .') },
  },
  invade3: {
    bpm: 110, root: 36, swing: 0.1, lead: 'brass', comp: 'stab', bass: 'synthbass', bassPat: 'sixteen', pad: 'choir', kit: { k: 'x.......x.x.....', gate: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', boom: 'x...............' }, comp_pat: 'stabs', form: 'AB',
    A: { chords: [[0, 'm'], [1, 'M'], [-2, 'M'], [0, 'm']], mel: mel('12 - - - 13 - 12 -  10 - - - 12 - - -  15 - - - 13 - 12 -  12 - - - . . . .') },
    B: { chords: [[-4, 'M'], [-2, 'M'], [1, 'M'], [-5, 'M']], mel: mel('20 - - - 19 - 17 -  17 - - - 15 - 13 -  13 - 15 - 17 - 19 -  19 - - - - - . .') },
  },
  // the Guardian
  boss: {
    bpm: 148, root: 40, swing: 0, lead: 'brass', comp: 'stab', bass: 'synthbass', bassPat: 'sixteen', pad: 'choir', kit: { k: 'x.x.x...x.x.x...', clap: '....x.......x..x', h: 'xxxxxxxxxxxxxxxx', taiko: 'x..x..x...x.x...' }, comp_pat: 'stabs', form: 'AB',
    A: { chords: [[0, 'm'], [1, 'M'], [0, 'm'], [-2, 'M']], mel: mel('12 - 13 - 12 - 10 -  12 - 13 - 15 - 13 -  12 - 13 - 12 - 10 -  7 - - - 10 - - -') },
    B: { chords: [[-4, 'M'], [-2, 'M'], [1, 'M'], [-5, 'D7']], mel: mel('20 - 19 - 17 - 15 -  17 - 15 - 13 - 12 -  13 - 15 - 17 - 19 -  19 - - - - - . .') },
  },
  // planet painted!
  win: {
    bpm: 120, root: 43, swing: 0.1, lead: 'brass', comp: 'arp', bass: 'bass', bassPat: 'walk', pad: 'choir', kit: { k: 'x.......x.......', s: '....x.......x.x.', h: 'x.x.x.x.x.x.x.x.' }, comp_pat: 'arp', form: 'AB',
    A: { chords: [[0, 'M7'], [5, 'M7'], [2, 'm7'], [7, 'D7']], mel: mel('12 - 16 - 19 - 24 -  21 - 19 - 17 - 16 -  14 - 17 - 21 - 19 17  19 - - - . . . .') },
    B: { chords: [[5, 'M7'], [4, 'm7'], [2, 'm7'], [7, 'D7']], mel: mel('21 - 24 - 21 - 19 -  19 - 16 - 12 - 16 -  14 - 17 - 21 - 24 -  24 - - - . . . .') },
  },
};
const VOICE_VOL = { glass: 0.3, vibes: 0.26, bell: 0.26, piano: 0.3, brass: 0.16, horn: 0.2, lead: 0.34 };
export const SONG_NAMES = Object.keys(SONGS);
let transpose = 0;
export function setKey(galaxy) { transpose = [0, 3, -2, 5, 1, -3, 4, -1, 2, 6][galaxy % 10] || 0; }

export const music = {
  song: 'menu', step: 0, next: 0, gain: null, started: false,
  start() { if (this.started) return; this.started = true; this.newGain(0.4); this.tick(); },
  newGain(fade) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(1, ctx.currentTime + fade); g.connect(musicBus);
    if (this.gain) { const old = this.gain; old.gain.cancelScheduledValues(ctx.currentTime); old.gain.setValueAtTime(old.gain.value, ctx.currentTime); old.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.4); setTimeout(() => { try { old.disconnect(); } catch { } }, 2500); }
    this.gain = g;
  },
  play(name) {
    if (this.song === name) return;
    this.song = name; this.step = 0;
    if (ctx && this.started) { this.newGain(name === 'boss' ? 0.6 : 1.8); this.next = ctx.currentTime + 0.1; }
  },
  tick() { if (!ctx) return; if (ctx.state === 'running') this.fill(ctx.currentTime + 0.2); setTimeout(() => this.tick(), 50); },
  fill(until) {
    const S = SONGS[this.song] || SONGS.menu, spb = 60 / S.bpm / 4, out = this.gain, base = S.root + transpose;
    if (this.next < ctx.currentTime - 0.5) this.next = ctx.currentTime + 0.05;
    while (this.next < until) {
      const step = this.step, s = step % 16, bar = Math.floor(step / 16), secIdx = Math.floor(bar / 4) % S.form.length, sec = S[S.form[secIdx]], b4 = bar % 4;
      const [cr, cq] = sec.chords[b4], chord = Q[cq], root = base + cr;
      const t = this.next + (s % 2 ? spb * S.swing : 0);
      for (const k in S.kit) { const p = S.kit[k]; if (p[s] === 'x') DRUM[k](t, (s % 4 === 0 ? 1 : 0.72) * (0.9 + Math.random() * 0.2), out); }
      if (S.bass) {
        if (S.bassPat === 'walk') { if (s % 4 === 0) { const seq = [0, chord[1], chord[2], (chord[3] ?? 12) - 1]; INST[S.bass](root - 12 + seq[s / 4], t, spb * 3.6, 0.8, out); } }
        else if (S.bassPat === 'sixteen') { if (s % 2 === 0) INST[S.bass](root - 12 + (s % 8 === 6 ? 12 : s === 14 ? 7 : 0), t, spb * 1.6, s % 4 === 0 ? 0.9 : 0.6, out); }
        else if (s === 0 || s === 6 || s === 10) { const iv = s === 0 ? 0 : s === 6 ? 7 : 12; INST[S.bass](root - 12 + iv, t, spb * (s === 0 ? 5 : 3), s === 0 ? 0.9 : 0.65, out); }
      }
      const pat = S.comp_pat;
      if (pat === 'arp' && s % 2 === 0) { const seq = [0, 1, 2, 3, 2, 1, 0, 2]; const iv = chord[seq[(s / 2) % 8] % chord.length]; INST.arp(root + 12 + iv + (s >= 8 ? 12 : 0), t, spb * 1.6, 0.35, out); }
      if (pat === 'arp16') { const seq = [0, 1, 2, 1, 0, 2, 1, 2]; const iv = chord[seq[s % 8] % chord.length]; INST.arp(root + 12 + iv + (bar % 2 ? 12 : 0), t, spb * 0.8, s % 4 === 0 ? 0.36 : 0.24, out); }
      if (pat === 'block' && (s === 0 || s === 10)) chord.forEach((iv, i) => INST[S.comp](root + 12 + iv, t + i * 0.015, spb * 6, 0.09, out));
      if (pat === 'stabs' && (s === 3 || s === 6 || s === 11) && bar % 2 === 0) INST.stab(root + 12, t, spb * 1.5, 0.28, out);
      if (S.pad && s === 0) chord.forEach(iv => INST[S.pad](root + 12 + iv, t, spb * 16, 0.3, out));
      if (s % 2 === 0) {
        const mi = b4 * 8 + s / 2, note = sec.mel[mi];
        if (note !== null && note !== '-' && note !== undefined) {
          let len = 1; while (sec.mel[mi + len] === '-' && (mi + len) % 8 !== 0) len++;
          INST[S.lead](base + 24 + note, t, spb * 2 * len - 0.02, VOICE_VOL[S.lead] || 0.22, out);
        }
      }
      this.next += spb; this.step++;
    }
  },
};

// ------------------------------------------------------------------ ambience: persistent nodes (no feedback loops anywhere)
function loopNoise(f, q, type = 'bandpass', rate = 1) {
  const s = ctx.createBufferSource(); s.buffer = nb(); s.loop = true; s.playbackRate.value = rate;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); s.start();
  return { s, fl, g };
}
function loopOsc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0; o.connect(g); o.start(); return { o, g }; }
export const ambience = {
  loops: null,
  start() {
    if (!ctx || this.loops) return;
    const L = this.loops = {};
    L.drone = loopNoise(90, 0.7, 'lowpass', 0.5); L.drone.g.connect(ambBus);
    L.hum = loopOsc('sawtooth', 55); L.humF = ctx.createBiquadFilter(); L.humF.type = 'lowpass'; L.humF.frequency.value = 240; L.hum.o.disconnect(); L.hum.o.connect(L.humF); L.humF.connect(L.hum.g); L.hum.g.connect(ambBus);
    L.hum2 = loopOsc('sine', 110.5); L.hum2.g.connect(ambBus);
    L.wind = loopNoise(700, 0.5); L.wind.g.connect(ambBus);
    L.beam = loopOsc('sine', 320); L.beamL = ctx.createOscillator(); L.beamL.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 60; L.beamL.connect(lg); lg.connect(L.beam.o.frequency); L.beamL.start(); L.beam.g.connect(ambBus);
    L.beamN = loopNoise(2400, 3); L.beamN.g.connect(ambBus);
    L.rain = loopNoise(5000, 0.4, 'highpass'); L.rain.g.connect(ambBus);
    L.alarm = loopOsc('square', 880); L.alarmF = ctx.createBiquadFilter(); L.alarmF.type = 'lowpass'; L.alarmF.frequency.value = 1800; L.alarm.o.disconnect(); L.alarm.o.connect(L.alarmF); L.alarmF.connect(L.alarm.g); L.alarm.g.connect(sfxBus);
    this.t = 0;
  },
  /** st: { space: 0..1 (deep space drone), engine: 0..1 (speed), alt: 0..1, beam: bool, rain: 0..1, alarm: bool } */
  update(dt, st) {
    if (!ctx || !this.loops) return;
    const L = this.loops, T = ctx.currentTime, k = 0.25; this.t += dt;
    const set = (g, v) => g.gain.setTargetAtTime(v, T, k);
    set(L.drone.g, 0.35 * (st.space ?? 1));
    set(L.hum.g, st.engine != null ? 0.05 + st.engine * 0.07 : 0); L.hum.o.frequency.setTargetAtTime(48 + (st.engine || 0) * 30, T, 0.3); L.humF.frequency.setTargetAtTime(200 + (st.engine || 0) * 500, T, 0.3);
    set(L.hum2.g, st.engine != null ? 0.03 : 0); L.hum2.o.frequency.setTargetAtTime(110 + Math.sin(this.t * 0.8) * 1.5, T, 0.3);
    set(L.wind.g, (st.alt != null ? (1 - st.alt) * 0.06 : 0) * (st.atmo ?? 1)); L.wind.fl.frequency.setTargetAtTime(500 + (st.engine || 0) * 900, T, 0.4);
    set(L.beam.g, st.beam ? 0.05 : 0); set(L.beamN.g, st.beam ? 0.05 : 0);
    set(L.rain.g, (st.rain || 0) * 0.14);
    set(L.alarm.g, st.alarm && Math.sin(this.t * 9) > 0 ? 0.035 : 0);
  },
};

// ------------------------------------------------------------------ sound effects
export const sfx = {
  click() { if (!ctx) return; const t = now(); tone(1800, t, 0.03, { vol: 0.07 }); noise(t, 0.012, { f: 4000, q: 2, vol: 0.05 }); },
  hover() { if (!ctx) return; tone(1400, now(), 0.02, { vol: 0.025 }); },
  nope() { if (!ctx) return; const t = now(); tone(220, t, 0.12, { type: 'square', vol: 0.07 }); tone(180, t + 0.12, 0.2, { type: 'square', vol: 0.07 }); },
  buy() { if (!ctx) return; const t = now(); noise(t, 0.05, { f: 3000, q: 2, vol: 0.2 }); [76, 79, 84, 88].forEach((m, i) => INST.glass(m, t + 0.05 + i * 0.07, 0.3, 0.5, sfxBus)); tone(220, t, 0.4, { type: 'sawtooth', vol: 0.05, slide: 4, send: 0.3 }); },
  coin(n = 1) { if (!ctx) return; const t = now(); for (let i = 0; i < Math.min(n, 8); i++) { tone(midi(88), t + i * 0.06, 0.08, { type: 'square', vol: 0.035 }); tone(midi(95), t + i * 0.06 + 0.05, 0.22, { type: 'square', vol: 0.035, send: 0.2 }); } },
  gem() { if (!ctx) return; const t = now(); [84, 88, 91, 96, 100].forEach((m, i) => INST.bell(m, t + i * 0.08, 1, 0.22, sfxBus)); },
  chat() { if (!ctx) return; tone(1200, now(), 0.05, { vol: 0.05 }); },
  join() { if (!ctx) return; const t = now(); INST.glass(76, t, 0.2, 0.4, sfxBus); INST.glass(83, t + 0.08, 0.2, 0.4, sfxBus); },
  // a wet paint glob leaving the cannon
  paint(pos, big = false) {
    if (!ctx) return; const t = now(), o = at(pos, big ? 2.2 : 1.5, 14);
    tone(big ? 160 : 260, t, 0.12, { type: 'sine', vol: 0.3, slide: 0.45, out: o });
    noise(t, 0.07, { f: 1300, q: 1.2, vol: 0.22, out: o, slide: 0.5 });
    noise(t + 0.01, 0.1, { f: 500, q: 2, vol: 0.12, out: o, send: 0.1 });
    tone(big ? 90 : 520, t + 0.02, 0.06, { type: 'triangle', vol: 0.06, slide: 1.8, out: o });
  },
  // SPLAT
  splat(pos, big = false) {
    if (!ctx) return; const t = now(), d = distTo(pos); if (d > 170) return; const o = at(pos, big ? 2.6 : 1.6, big ? 30 : 16);
    noise(t, big ? 0.35 : 0.14, { f: big ? 500 : 900, q: 0.7, vol: big ? 0.5 : 0.3, out: o, slide: 0.35, send: 0.15 });
    tone(big ? 70 : 140, t, big ? 0.3 : 0.1, { vol: big ? 0.45 : 0.18, slide: 0.5, out: o });
    for (let i = 0; i < (big ? 6 : 2); i++) noise(t + 0.03 + Math.random() * 0.12, 0.03, { f: rnd(1500, 3500), q: 4, vol: 0.06, out: o });
  },
  bomb(pos) { if (!ctx) return; const t = now(), o = at(pos, 1.3, 14); tone(120, t, 0.35, { type: 'sine', vol: 0.4, slide: 0.4, out: o }); noise(t, 0.3, { f: 700, q: 0.8, vol: 0.3, out: o, slide: 0.4 }); tone(900, t, 0.5, { type: 'sine', vol: 0.05, slide: 0.3, out: o, send: 0.3 }); },
  dry() { if (!ctx) return; const t = now(); noise(t, 0.08, { f: 600, q: 3, vol: 0.12 }); tone(140, t, 0.1, { type: 'square', vol: 0.03, slide: 0.6 }); },
  laser(pos, big = false) {
    if (!ctx) return; const t = now(), d = distTo(pos); if (d > 160) return; const o = at(pos, big ? 1.4 : 1, 20);
    if (big) { tone(300, t, 0.5, { type: 'sawtooth', vol: 0.08, slide: 0.3, out: o, send: 0.4 }); noise(t, 0.3, { f: 400, q: 1, vol: 0.2, out: o, slide: 0.5 }); }
    else { tone(1600, t, 0.14, { type: 'square', vol: 0.05, slide: 0.25, out: o, send: 0.25 }); tone(800, t, 0.1, { type: 'sawtooth', vol: 0.04, slide: 0.3, out: o }); }
  },
  flak(pos) { if (!ctx) return; const t = now(), o = at(pos, 1.2, 18); tone(90, t, 0.18, { vol: 0.3, slide: 0.5, out: o }); noise(t, 0.12, { f: 1200, q: 0.8, vol: 0.25, out: o, send: 0.2 }); tone(1200, t, 0.1, { type: 'square', vol: 0.03, slide: 0.4, out: o }); },
  shipHit() { if (!ctx) return; const t = now(); noise(t, 0.2, { f: 900, q: 0.8, vol: 0.4, send: 0.2 }); tone(70, t, 0.3, { vol: 0.5, slide: 0.5 }); for (let i = 0; i < 4; i++) tone(rnd(2500, 4200), t + i * 0.03, 0.2, { type: 'triangle', vol: 0.025 }); },
  shieldHit() { if (!ctx) return; const t = now(); tone(880, t, 0.25, { type: 'sine', vol: 0.12, slide: 0.6, send: 0.4 }); tone(1320, t, 0.18, { type: 'sine', vol: 0.06, slide: 0.5 }); noise(t, 0.1, { f: 5000, q: 2, vol: 0.08 }); },
  hitmark(kill = false) { if (!ctx) return; const t = now(); tone(kill ? 2400 : 1700, t, 0.05, { type: 'square', vol: 0.04 }); if (kill) tone(3200, t + 0.04, 0.08, { type: 'sine', vol: 0.05 }); },
  boom(pos, size = 1) {
    if (!ctx) return; const t = now(), d = distTo(pos); if (d > 260) return; const o = at(pos, 1.6 * size, 30 * size);
    tone(55, t, 0.8 * size, { vol: 0.8, slide: 0.4, out: o, send: 0.5 }); noise(t, 0.6 * size, { f: 700, q: 0.5, vol: 0.6, out: o, slide: 0.3, send: 0.5 });
    noise(t + 0.05, 1.2 * size, { f: 2500, q: 0.4, vol: 0.12, out: o, slide: 0.25 });
    for (let i = 0; i < 6 * size; i++) noise(t + 0.1 + Math.random() * 0.6 * size, 0.04, { f: rnd(1000, 4000), q: 3, vol: 0.08, out: o });
  },
  fizz(pos) { if (!ctx) return; const t = now(), o = at(pos, 1, 14); noise(t, 0.3, { f: 6000, q: 1, vol: 0.18, out: o, slide: 0.4 }); tone(1200, t, 0.2, { type: 'sine', vol: 0.06, slide: 1.6, out: o }); },
  scrub(pos) { if (!ctx) return; const t = now(), d = distTo(pos); if (d > 70) return; const o = at(pos, 0.5, 10); noise(t, 0.3, { f: rnd(1800, 3000), q: 2, vol: 0.12, out: o, attack: 0.05 }); },
  abduct(pos, id = 1) { if (!ctx) return; const t = now(); tone(300, t, 0.6, { type: 'sine', vol: 0.12, slide: 3, send: 0.5 }); voice(pos, 1.2 + (id % 5) * 0.08, [[0, 500, 1100, 0.4, 'i'], [0.4, 900, 1300, 0.25, 'e']], 0.09); [79, 84, 88].forEach((m, i) => INST.glass(m, t + 0.35 + i * 0.07, 0.3, 0.4, sfxBus)); },
  scream(pos) { if (!ctx) return; voice(pos, rnd(1.1, 1.5), [[0, 700, 1100, 0.4, 'a'], [0.4, 1000, 700, 0.25, 'i']], 0.07); },
  warp() { if (!ctx) return; const t = now(); noise(t, 2.4, { f: 200, q: 1, vol: 0.4, slide: 18, attack: 1.2, send: 0.6, curve: 'lin' }); tone(60, t, 2.4, { type: 'sawtooth', vol: 0.1, slide: 8, attack: 1, send: 0.5, curve: 'lin' }); tone(40, t + 2.2, 1, { vol: 0.6, slide: 0.5, send: 0.6 }); noise(t + 2.2, 0.8, { f: 800, q: 0.6, vol: 0.4, slide: 0.2, send: 0.6 }); },
  launch() { if (!ctx) return; const t = now(); tone(80, t, 1.2, { type: 'sawtooth', vol: 0.1, slide: 3, attack: 0.3, send: 0.4, curve: 'lin' }); noise(t, 1.2, { f: 400, q: 0.8, vol: 0.25, slide: 4, attack: 0.3, curve: 'lin' }); },
  down() { if (!ctx) return; const t = now(); tone(440, t, 1.4, { type: 'sawtooth', vol: 0.08, slide: 0.2, send: 0.4 }); sfx.boom(null, 1.2); voice(null, 1, [[0.2, 500, 200, 0.8, 'o']], 0.1); },
  up() { if (!ctx) return; const t = now(); [60, 64, 67, 72, 76].forEach((m, i) => INST.glass(m, t + i * 0.08, 1, 0.35, sfxBus)); tone(200, t, 0.8, { type: 'sine', vol: 0.1, slide: 3, send: 0.4 }); },
  nuke() {
    if (!ctx) return; const t = now();
    tone(900, t, 1.2, { type: 'sine', vol: 0.12, slide: 0.1, send: 0.5 }); DRUM.boom(t + 1, 1.4, sfxBus); DRUM.taiko(t + 1, 1.2, sfxBus);
    noise(t + 1, 3, { f: 900, q: 0.4, vol: 0.6, slide: 0.15, send: 0.8 });
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => INST.glass(m, t + 1.2 + i * 0.09, 1, 0.4, sfxBus));
  },
  bossAlert() { if (!ctx) return; const t = now(); for (let i = 0; i < 3; i++) { DRUM.taiko(t + i * 0.45, 1, sfxBus); INST.brass(40 + i, t + i * 0.45, 0.35, 0.4, sfxBus); } voice(null, 0.5, [[1.4, 140, 90, 1, 'o']], 0.2); },
  bossRoar(pos) { if (!ctx) return; voice(pos, 0.45, [[0, 160, 90, 0.9, 'a'], [0.8, 120, 70, 0.6, 'o']], 0.25); },
  shieldDown() { if (!ctx) return; const t = now(); for (let i = 0; i < 5; i++) tone(1400 - i * 200, t + i * 0.07, 0.2, { type: 'sine', vol: 0.08, send: 0.5 }); noise(t, 0.8, { f: 3000, q: 0.5, vol: 0.2, slide: 0.2, send: 0.5 }); },
  tick() { if (!ctx) return; tone(1320, now(), 0.05, { type: 'square', vol: 0.04 }); },
  percent() { if (!ctx) return; const t = now(); tone(midi(84), t, 0.12, { type: 'sine', vol: 0.06, send: 0.3 }); tone(midi(91), t + 0.06, 0.2, { type: 'sine', vol: 0.06, send: 0.3 }); },
  conquer() {
    if (!ctx) return; const t = now();
    [55, 60, 64, 67, 72, 76, 79, 84].forEach((m, i) => INST.brass(m, t + i * 0.1, i === 7 ? 1.4 : 0.2, 0.4, sfxBus));
    [0, 0.4, 0.7, 1].forEach(d => DRUM.tim(t + d, 1, sfxBus));
    for (let i = 0; i < 30; i++) noise(t + 0.9 + Math.random() * 1.8, 0.05, { f: 2500 + Math.random() * 4000, q: 6, vol: 0.08 });
    voice(null, 1.1, [[0.8, 400, 650, 0.2, 'a'], [1.02, 650, 800, 0.5, 'i']], 0.1);
  },
  yay(id = 1) { if (!ctx) return; voice(null, 0.85 + ((id * 37) % 10) / 20, [[0, 400, 600, 0.15, 'a'], [0.17, 600, 750, 0.25, 'i']], 0.09); },
  ouch() { if (!ctx) return; voice(null, 1, [[0, 600, 380, 0.13, 'o']], 0.07); },
  lowHull() { if (!ctx) return; const t = now(); tone(660, t, 0.12, { type: 'square', vol: 0.04 }); tone(440, t + 0.14, 0.12, { type: 'square', vol: 0.04 }); },
  spawn() { if (!ctx) return; const t = now(); tone(500, t, 0.2, { type: 'sawtooth', vol: 0.03, slide: 2 }); },
};

// ------------------------------------------------------------------ ?audiotest=1: render every sound offline and measure it
export async function audioTest(onRow) {
  const out = {}, saved = { ctx, master, comp, sfxBus, musicBus, ambBus, ambFilter, verb, verbIn, noiseBuf, song: music.song, gain: music.gain, loops: ambience.loops };
  const wasOn = [musicOn, sfxOn]; musicOn = sfxOn = true;
  const run = async (name, secs, fn) => {
    const oc = new OfflineAudioContext(2, Math.floor(44100 * secs), 44100);
    buildGraph(oc); music.gain = null; ambience.loops = null;
    try { fn(); } catch (e) { out[name] = { err: e.message }; onRow?.(name, out[name]); return; }
    const buf = await oc.startRendering(), d = buf.getChannelData(0);
    let s = 0, pk = 0; for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); }
    out[name] = { rms: +Math.sqrt(s / d.length).toFixed(4), peak: +pk.toFixed(3) };
    onRow?.(name, out[name]);
  };
  for (const k of Object.keys(sfx)) await run('sfx.' + k, 2.8, () => sfx[k](null));
  for (const n of Object.keys(SONGS)) await run('song.' + n, 8, () => { music.song = n; music.step = 0; music.next = 0; music.gain = ctx.createGain(); music.gain.connect(musicBus); music.fill(7.8); });
  await run('amb.fly', 5, () => { ambience.start(); for (let i = 0; i < 40; i++) ambience.update(0.1, { space: 0.5, engine: 1, alt: 0.2, beam: true, rain: 1, alarm: true }); });
  Object.assign(music, { song: saved.song, gain: saved.gain }); ambience.loops = saved.loops;
  ({ ctx, master, comp, sfxBus, musicBus, ambBus, ambFilter, verb, verbIn, noiseBuf } = saved);
  [musicOn, sfxOn] = wasOn;
  return out;
}
