// Sound for the overlay: a synthesized default pack (Web Audio, no files) plus one shared policy for every sound,
// including meme MP3/video audio. Nothing is ever queued: a sound that can't play right now is dropped, so an
// unlock, refresh or reconnect never releases a backlog.

// ---------- synthesis helpers ----------
function env(p, t, dur, vol) {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4));
  p.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(ac, out, t, type, f0, f1, dur, vol) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g.gain, t, dur, vol);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}
const noiseBufs = new WeakMap();
function noise(ac, out, t, dur, vol, filter, f0, f1 = f0, q = 1) {
  let buf = noiseBufs.get(ac);
  if (!buf) {
    buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBufs.set(ac, buf);
  }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = buf; f.type = filter; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g.gain, t, dur, vol);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  return s;
}
const notes = (ac, out, t, type, freqs, step, dur, vol) => freqs.map((f, i) => tone(ac, out, t + i * step, type, f, f, dur, vol));
function wobble(ac, osc, t, dur, rate, depth) { // LFO on an oscillator's pitch
  const l = ac.createOscillator(), g = ac.createGain();
  l.frequency.value = rate; g.gain.value = depth;
  l.connect(g); g.connect(osc.frequency);
  l.start(t); l.stop(t + dur + 0.05);
  return l;
}

// ---------- the default pack ----------
// cat: which level slider applies. pri: 1 ambient, 2 impact, 3 result (results win voice and budget fights).
// dur: seconds the voice is held. gap: ms before the same sound may play again.
const S = (cat, pri, dur, gap, fn) => ({ cat, pri, dur, gap, fn });
export const SOUNDS = {
  jump:     S('action', 1, 0.12, 150, (a, o, t) => [tone(a, o, t, 'square', 300, 620, 0.1, 0.18)]),
  boing:    S('action', 1, 0.35, 250, (a, o, t) => { const s = tone(a, o, t, 'sine', 180, 520, 0.32, 0.5); return [s, wobble(a, s, t, 0.32, 14, 40)]; }),
  punch:    S('action', 2, 0.18, 90, (a, o, t) => [noise(a, o, t, 0.12, 0.9, 'lowpass', 900, 200), tone(a, o, t, 'sine', 130, 50, 0.16, 0.7)]),
  slap:     S('action', 2, 0.12, 90, (a, o, t) => [noise(a, o, t, 0.09, 1, 'highpass', 1800), tone(a, o, t, 'triangle', 900, 300, 0.06, 0.4)]),
  fart:     S('action', 2, 0.5, 200, (a, o, t) => { const s = tone(a, o, t, 'sawtooth', 95, 60, 0.45, 0.35); return [s, wobble(a, s, t, 0.45, 23, 25), noise(a, o, t, 0.3, 0.15, 'lowpass', 400)]; }),
  whoosh:   S('action', 2, 0.35, 150, (a, o, t) => [noise(a, o, t, 0.35, 0.6, 'bandpass', 400, 2600, 2)]),
  thud:     S('action', 1, 0.2, 150, (a, o, t) => [tone(a, o, t, 'sine', 140, 45, 0.18, 0.6), noise(a, o, t, 0.1, 0.3, 'lowpass', 400)]),
  rocket:   S('action', 2, 0.7, 300, (a, o, t) => [noise(a, o, t, 0.7, 0.5, 'lowpass', 500, 3500), tone(a, o, t, 'sawtooth', 110, 700, 0.7, 0.12)]),
  sneezeUp: S('action', 1, 0.3, 300, (a, o, t) => [tone(a, o, t, 'sine', 320, 700, 0.28, 0.18)]),
  sneeze:   S('action', 2, 0.25, 200, (a, o, t) => [noise(a, o, t, 0.25, 0.8, 'highpass', 2500, 5000)]),
  zapCast:  S('action', 1, 0.1, 150, (a, o, t) => [tone(a, o, t, 'square', 1200, 2400, 0.09, 0.12)]),
  zap:      S('action', 2, 0.22, 100, (a, o, t) => [noise(a, o, t, 0.15, 0.6, 'bandpass', 3200, 3200, 3), tone(a, o, t, 'sawtooth', 1800, 200, 0.2, 0.25)]),
  fireCast: S('action', 1, 0.25, 150, (a, o, t) => [noise(a, o, t, 0.25, 0.4, 'bandpass', 300, 1400, 2)]),
  fireHit:  S('action', 2, 0.45, 120, (a, o, t) => [noise(a, o, t, 0.4, 0.9, 'lowpass', 1500, 100), tone(a, o, t, 'sine', 90, 40, 0.3, 0.6)]),
  boom:     S('action', 2, 0.6, 200, (a, o, t) => [noise(a, o, t, 0.6, 1, 'lowpass', 1200, 60), tone(a, o, t, 'sine', 80, 30, 0.5, 0.7)]),
  meteor:   S('event', 1, 0.4, 500, (a, o, t) => [noise(a, o, t, 0.4, 0.6, 'lowpass', 900, 60)]),
  brawl:    S('action', 2, 0.6, 400, (a, o, t) => [0, 0.17, 0.36].flatMap((d) => [noise(a, o, t + d, 0.1, 0.7, 'lowpass', 900, 200), tone(a, o, t + d, 'sine', 140, 60, 0.12, 0.5)])),
  tick:     S('action', 1, 0.07, 120, (a, o, t) => [tone(a, o, t, 'square', 880, 880, 0.06, 0.15)]),
  go:       S('action', 2, 0.18, 150, (a, o, t) => [tone(a, o, t, 'square', 1320, 1320, 0.15, 0.2), noise(a, o, t, 0.12, 0.6, 'highpass', 1500)]),
  sparkle:  S('action', 1, 0.25, 250, (a, o, t) => notes(a, o, t, 'sine', [1568, 2093, 2637], 0.05, 0.12, 0.12)),
  clap:     S('action', 2, 0.12, 150, (a, o, t) => [0, 0.025].map((d) => noise(a, o, t + d, 0.08, 1, 'bandpass', 1500, 1500, 0.8))),
  win:      S('event', 3, 0.55, 300, (a, o, t) => notes(a, o, t, 'triangle', [523, 659, 784, 1047], 0.09, 0.16, 0.3)),
  fail:     S('event', 3, 0.7, 300, (a, o, t) => [tone(a, o, t, 'sawtooth', 392, 370, 0.3, 0.18), tone(a, o, t + 0.32, 'sawtooth', 330, 250, 0.4, 0.18)]),
  stinger:  S('event', 3, 0.6, 1000, (a, o, t) => [...notes(a, o, t, 'square', [392, 523, 659], 0.07, 0.1, 0.12), tone(a, o, t + 0.21, 'triangle', 784, 784, 0.35, 0.3)]),
  alarm:    S('event', 2, 0.5, 1000, (a, o, t) => notes(a, o, t, 'square', [700, 900, 700, 900], 0.12, 0.1, 0.12)),
  join:     S('event', 1, 0.1, 150, (a, o, t) => [tone(a, o, t, 'sine', 660, 990, 0.08, 0.2)]),
  hide:     S('event', 2, 0.15, 120, (a, o, t) => [tone(a, o, t, 'square', 500, 220, 0.12, 0.15), noise(a, o, t, 0.06, 0.4, 'lowpass', 800)]),
  beam:     S('event', 2, 1.3, 1000, (a, o, t) => { const s = tone(a, o, t, 'sine', 300, 900, 1.2, 0.25); return [s, wobble(a, s, t, 1.2, 9, 60)]; }),
  coin:     S('event', 1, 0.15, 120, (a, o, t) => [tone(a, o, t, 'square', 988, 988, 0.05, 0.12), tone(a, o, t + 0.05, 'square', 1319, 1319, 0.09, 0.12)]),
  cash:     S('event', 3, 0.5, 300, (a, o, t) => notes(a, o, t, 'square', [988, 1319, 1568, 1976, 2637], 0.06, 0.08, 0.1)),
  squeak:   S('event', 2, 0.25, 300, (a, o, t) => { const s = tone(a, o, t, 'square', 1400, 700, 0.2, 0.12); return [s, wobble(a, s, t, 0.2, 30, 200)]; }),
  test:     S('event', 3, 0.55, 300, (a, o, t) => notes(a, o, t, 'triangle', [523, 659, 784, 1047], 0.09, 0.16, 0.3)),
};
const MEDIA = { cat: 'media', pri: 2, dur: 30, gap: 0 }; // held until the media ends (30 s cap)

// ---------- policy: voices, priorities, budget, repeat gap ----------
export class SoundPolicy {
  constructor(maxVoices = 4, perSecond = 6) { this.max = maxVoices; this.perSecond = perSecond; this.voices = []; this.last = new Map(); this.recent = []; }
  admit(name, def, now) {
    this.voices = this.voices.filter((v) => v.end > now);
    this.recent = this.recent.filter((t) => now - t < 1000);
    if (now - (this.last.get(name) ?? -Infinity) < def.gap) return { ok: false, why: 'repeat' };
    if (def.pri < 3 && this.recent.length >= this.perSecond) return { ok: false, why: 'budget' };
    if (this.voices.length >= this.max) {
      const low = this.voices.reduce((a, b) => (b.pri < a.pri ? b : a)); // oldest of the lowest priority
      if (low.pri >= def.pri) return { ok: false, why: 'voices' };
      this.release(low); low.stop?.();
    }
    const voice = { name, pri: def.pri, end: now + def.dur * 1000, stop: null };
    this.voices.push(voice); this.last.set(name, now); this.recent.push(now);
    return { ok: true, voice };
  }
  release(v) { const i = this.voices.indexOf(v); if (i >= 0) this.voices.splice(i, 1); }
  clear() { const vs = this.voices; this.voices = []; for (const v of vs) v.stop?.(); }
}

// ---------- manager ----------
const newContext = () => { const C = globalThis.AudioContext || globalThis.webkitAudioContext; return C ? new C() : null; };

export class AudioManager {
  constructor({ silent = false, makeContext = newContext, now = () => performance.now() } = {}) {
    this.silent = silent; this.makeContext = makeContext; this.now = now;
    this.cfg = { enabled: true, master: 0.25, action: 0.8, event: 0.9, media: 0.8, maxVoices: 4, perSecond: 6 };
    this.policy = new SoundPolicy(this.cfg.maxVoices, this.cfg.perSecond);
    this.ctx = null; this.unsupported = false; this.bus = {}; this.mediaEls = new Set();
    this.onchange = null;
    if (!silent) this.ensure();
  }
  ensure() {
    if (this.ctx || this.unsupported) return;
    try { this.ctx = this.makeContext(); } catch { this.ctx = null; }
    if (!this.ctx) { this.unsupported = true; return; }
    this.out = this.ctx.createGain(); this.out.connect(this.ctx.destination);
    for (const cat of ['action', 'event']) { this.bus[cat] = this.ctx.createGain(); this.bus[cat].connect(this.out); }
    this.ctx.onstatechange = () => this.onchange?.();
    this.levels();
  }
  // ready: can play now. blocked: the browser wants a click/key in this page first. silent: preview/extra source.
  state() {
    if (this.silent) return 'silent';
    if (!this.cfg.enabled) return 'off';
    if (!this.ctx) return 'unsupported';
    return this.ctx.state === 'running' ? 'ready' : 'blocked';
  }
  setSilent(v) { this.silent = !!v; if (this.silent) this.stopAll(); else this.ensure(); this.onchange?.(); }
  unlock() {
    if (this.silent) return Promise.resolve(this.state());
    this.ensure();
    const p = this.ctx?.state === 'running' ? null : this.ctx?.resume?.();
    return Promise.resolve(p).catch(() => {}).then(() => { this.onchange?.(); return this.state(); });
  }
  setConfig(a) {
    if (!a) return;
    Object.assign(this.cfg, a);
    this.policy.max = this.cfg.maxVoices; this.policy.perSecond = this.cfg.perSecond;
    if (!this.cfg.enabled) this.stopAll();
    this.levels();
    this.onchange?.();
  }
  levels() {
    if (this.ctx) { this.out.gain.value = this.cfg.master; for (const c in this.bus) this.bus[c].gain.value = this.cfg[c]; }
    for (const el of this.mediaEls) el.volume = this.mediaVolume();
  }
  mediaVolume() { return Math.min(1, Math.max(0, this.cfg.master * this.cfg.media)); }

  play(name) {
    const def = SOUNDS[name];
    if (!def || this.state() !== 'ready') return false;
    const r = this.policy.admit(name, def, this.now());
    if (!r.ok) return false;
    const nodes = def.fn(this.ctx, this.bus[def.cat], this.ctx.currentTime + 0.01);
    r.voice.stop = () => { for (const n of nodes) try { n.stop(); } catch {} };
    return true;
  }
  // Meme MP3/video audio goes through the same controls. A video that may not make sound still plays, muted.
  media(el) {
    const video = el.tagName === 'VIDEO';
    const r = this.state() === 'ready' ? this.policy.admit('media', MEDIA, this.now()) : { ok: false };
    if (!r.ok) { el.muted = true; return false; }
    const v = r.voice;
    const done = () => { this.policy.release(v); this.mediaEls.delete(el); };
    v.stop = () => { el.pause(); done(); };
    el.volume = this.mediaVolume(); el.muted = false;
    this.mediaEls.add(el);
    el.addEventListener('ended', done); el.addEventListener('error', done); el.addEventListener('pause', done);
    el.addEventListener('loadedmetadata', () => { if (Number.isFinite(el.duration)) v.end = Math.min(v.end, this.now() + el.duration * 1000 + 500); });
    if (!video) el.play().catch(done); // rejected playback: release the voice, nothing pretends it played
    return true;
  }
  stopAll() {
    this.policy.clear();
    for (const el of this.mediaEls) el.pause();
    this.mediaEls.clear();
  }
}
