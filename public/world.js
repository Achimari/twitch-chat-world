// Simulation + pixel-art rendering for the overlay canvas. Logical size is always 1920x1080.
import { COMMANDS } from './commands.js';

export const W = 1920, H = 1080;
const G = 2200, MARGIN = 40, GROUND = 24;
const FONT = '"Pixelify Sans", "Courier New", monospace';

const SKIN = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffe0bd', '#9be39b', '#b8a9ff'];
const SHIRT = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f1c40f', '#e67e22', '#1abc9c', '#ff6b9d', '#ecf0f1', '#34495e', '#ff4757', '#5352ed', '#26de81'];
const PANTS = ['#2c3e50', '#34495e', '#4a3728', '#1e3799', '#576574', '#222222', '#6d214f'];
const HAIR = ['#2d1b0e', '#5a3825', '#a0522d', '#e8c170', '#111111', '#c0392b', '#ff9ff3', '#48dbfb', '#f5f6fa', '#7bed9f'];
const HAT_TOP = [18, 20, 23, 22, 17]; // top of head+hat in units, per hat style
const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clampX = (x) => Math.min(W - MARGIN, Math.max(MARGIN, x));
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(Math.min(255, v * f));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
function readable(hex) { // lighten dark Twitch name colours so they show on any background
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const k = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? 0.45 : 0;
  return `rgb(${r + (255 - r) * k | 0},${g + (255 - g) * k | 0},${b + (255 - b) * k | 0})`;
}

// Appearance is derived from login + variant, so it survives refreshes and returning viewers.
export function makeLook(login, variant = 0) {
  const r = rng(hash(`${login}#${variant}`));
  const p = (a) => a[Math.floor(r() * a.length)];
  const shirt = p(SHIRT);
  return { skin: p(SKIN), shirt, sleeve: shade(shirt, 0.75), pants: p(PANTS), hair: p(HAIR), hairStyle: Math.floor(r() * 4), hat: r() < 0.5 ? Math.floor(r() * 5) : -1, hatColor: p(SHIRT) };
}

function makeLabel(text, color) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `600 16px ${FONT}`;
  c.width = Math.ceil(g.measureText(text).width) + 8; c.height = 22;
  g.font = `600 16px ${FONT}`; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(text, 4, 11);
  g.fillStyle = readable(color); g.fillText(text, 4, 11);
  return c;
}
function makeBubble(text) {
  const lines = [];
  let line = '';
  for (let w of text.split(/\s+/)) {
    if (w.length > 24) w = w.slice(0, 23) + '…';
    if (line && (line + ' ' + w).length > 24) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].slice(0, 22) + '…'; }
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `500 15px ${FONT}`;
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + 16, h = lines.length * 18 + 10;
  c.width = w; c.height = h + 6;
  g.fillStyle = '#111'; g.fillRect(2, 0, w - 4, h); g.fillRect(0, 2, w, h - 4);
  g.fillStyle = '#fff'; g.fillRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#111'; g.fillRect(w / 2 - 4, h - 2, 8, 4); g.fillRect(w / 2 - 2, h + 2, 4, 3);
  g.fillStyle = '#fff'; g.fillRect(w / 2 - 2, h - 2, 4, 3);
  g.fillStyle = '#111'; g.font = `500 15px ${FONT}`; g.textBaseline = 'top';
  lines.forEach((l, i) => g.fillText(l, 8, 6 + i * 18));
  return c;
}
function drawHeart(ctx, x, y, px, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) if (HEART[r][c] === 'X') ctx.fillRect(x + (c - 3.5) * px, y + (r - 3) * px, px, px);
}

class Char {
  constructor(w, u, drop) {
    this.w = w; this.login = u.login;
    this.x = rand(MARGIN * 3, W - MARGIN * 3); this.y = drop ? rand(250, 450) : 0; this.vx = 0; this.vy = 0;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.t = Math.random() * 10; this.walkT = 0; this.fxT = 0; this.wanderX = null; this.pause = rand(0.5, 3);
    this.act = null; this.actT = 0; this.mode = null; this.modeT = 0; this.modeTarget = null; this.approach = null;
    this.size = 1; this.targetSize = 1; this.sizeT = 0; this.ghostT = 0; this.cloudT = 0; this.knockT = 0; this.hidden = 0; this.boing = 0; this.rocketT = 0;
    this.alpha = 1; this.squash = 0; this.leaving = false; this.gone = false; this.crown = false; this.busy = false; this.bubble = null;
    this.boxed = false; this.beamT = 0; this.yeeted = false; this.loudBoing = false; // UFO escape + sound flags
    this.setUser(u);
  }
  setUser(u) { this.name = u.name || u.login; this.look = makeLook(u.login, u.variant || 0); this.color = u.color || this.look.shirt; this.stars = u.stars || 0; this.label = null; }
  get scale() { return this.w.cfg.characterSize * this.size; }
  get lying() { return (this.knockT > 0 && this.y < 2) || this.mode === 'sleep'; }
  blocked() { return this.knockT > 0 || this.hidden > 0 || this.busy || this.leaving || this.boxed || this.beamT > 0; }
  topY() { // screen y of the top of the head (or hat)
    const u = this.lying ? 10 : this.crown ? 21 : this.look.hat >= 0 ? HAT_TOP[this.look.hat] : 18;
    return this.w.gy - this.y - u * this.scale;
  }

  jump(p = 1) {
    if (this.blocked() || this.ghostT > 0 || this.y > 2) return;
    if (this.mode === 'sit' || this.mode === 'sleep') this.mode = null;
    this.vy = 820 * p; this.squash = 0.12;
    return true;
  }
  setAct(a, d) {
    if (this.blocked()) return false;
    if (this.mode === 'sit' || this.mode === 'sleep') this.mode = null;
    this.act = a; this.actT = d; this.approach = null;
    return true;
  }
  setMode(m, d, target = null) {
    if (this.blocked()) return;
    this.mode = m; this.modeT = d; this.modeTarget = target; this.act = null; this.approach = null; this.wanderX = null;
  }
  goTo(target, dist, then, speed = 220) {
    if (this.blocked()) return;
    this.mode = null; this.act = null; this.wanderX = null;
    this.approach = { target, dist, then, speed, t: 7 };
  }
  resize(s, d) { this.targetSize = s; this.sizeT = d; }
  knock(dir, power = 1) { // returns false when nothing happened, so callers skip the impact sound
    if (this.hidden > 0 || this.busy || this.leaving || this.boxed || this.beamT > 0) return false;
    this.knockT = 1.6; this.act = null; this.mode = null; this.approach = null; this.ghostT = 0;
    this.vx = dir * 320 * power; this.vy = 480 * power;
    return true;
  }
  say(text) { this.bubble = { img: null, text, t: 5 }; }
  leave() {
    this.leaving = true; this.act = null; this.mode = null; this.approach = null;
    this.w.burst(this.x, this.w.gy - this.y - 8 * this.scale, 14, '#dddddd');
  }

  update(dt) {
    const w = this.w;
    this.t += dt;
    if (this.leaving) { this.alpha -= dt * 2; this.y += 80 * dt; if (this.alpha <= 0) this.gone = true; return; }
    if (this.hidden > 0) {
      if ((this.hidden -= dt) <= 0) { this.x = rand(MARGIN * 3, W - MARGIN * 3); this.y = 400; this.vy = 0; this.vx = 0; w.burst(this.x, w.gy - 400, 12, '#ffffff'); }
      return;
    }
    for (const k of ['actT', 'modeT', 'sizeT', 'ghostT', 'cloudT', 'knockT', 'rocketT']) if (this[k] > 0) this[k] -= dt;
    if (this.act && this.actT <= 0) this.act = null;
    if (this.mode && this.modeT <= 0) this.mode = null;
    if (this.sizeT <= 0) this.targetSize = 1;
    this.size += (this.targetSize - this.size) * Math.min(1, dt * 6);
    if (this.squash > 0) this.squash -= dt;
    if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
    if (this.busy) return; // inside a fight cloud
    if (this.beamT > 0) { // UFO tractor beam: float up, hang there awkwardly, then drop
      this.vx = 0; this.vy = 0;
      this.y += (150 - this.y) * Math.min(1, dt * 2.5);
      if ((this.beamT -= dt) <= 0) { this.knockT = 1.2; w.text(this.x, this.topY() - 10, pick(['PLOP', 'BOINK', 'RETURNED']), '#a29bfe', 22); }
      return;
    }

    // Decide desired horizontal speed.
    let speed = 0;
    if (this.knockT > 0 || this.boxed) { /* tumbling, or hiding in a box */ }
    else if (this.act) {
      if (this.act === 'cheer' && this.y < 1) this.vy = 420;
    }
    else if (this.approach) {
      const a = this.approach, tg = a.target;
      if (tg.gone || tg.hidden > 0 || (a.t -= dt) <= 0) this.approach = null;
      else {
        const dx = tg.x - this.x;
        if (Math.abs(dx) <= a.dist) { this.facing = Math.sign(dx) || this.facing; this.approach = null; a.then(); }
        else speed = Math.sign(dx) * a.speed;
      }
    }
    else if (this.mode === 'follow') {
      const tg = this.modeTarget;
      if (!tg || tg.gone) this.mode = null;
      else {
        const dx = tg.x - this.x;
        if (Math.abs(dx) > 60) speed = Math.sign(dx) * Math.min(320, Math.abs(dx) * 2.5);
        else if (tg.vy > 500 && tg.y < 40) this.jump(); // copy their jumps
      }
    }
    else if (this.mode === 'run') speed = this.facing * 340;
    else if (this.mode === 'moonwalk') speed = -this.facing * 110;
    else if (!this.mode && w.cfg.autoMove) speed = this.wander(dt);
    if (speed && this.mode !== 'moonwalk') this.facing = Math.sign(speed);

    this.effects(dt);

    // Physics.
    if (this.ghostT > 0) {
      this.y += (60 + Math.sin(this.t * 2.5) * 18 - this.y) * Math.min(1, dt * 3); this.vy = 0;
    } else {
      this.vy -= G * dt; this.y += this.vy * dt;
      if (this.y <= 0) {
        if (this.vy < -300 && this.boing > 0 && w.onTramp(this.x)) {
          this.boing--; this.vy = 1100; w.tramp.sq = 1; w.text(this.x, w.gy - 40, 'BOING', '#48dbfb', 20);
          if (this.loudBoing) w.sfx('boing'); // only for !bounce, idle bouncing stays quiet
        } else {
          if (this.vy < -600) { w.dust(this.x, 5); this.squash = 0.1; }
          if (this.yeeted && this.vy < -300) w.sfx('thud');
          this.y = 0; this.vy = 0; this.yeeted = false;
        }
      }
    }
    this.vx += (speed - this.vx) * Math.min(1, dt * (this.y < 1 ? 10 : 1.5));
    this.x += this.vx * dt;
    if (this.x < MARGIN || this.x > W - MARGIN) {
      this.x = clampX(this.x);
      if (this.mode === 'run') this.facing = this.x < W / 2 ? 1 : -1;
      if (this.mode === 'moonwalk') this.facing = this.x < W / 2 ? -1 : 1;
    }
    this.walkT += Math.abs(this.vx) * dt * 0.09;
  }

  wander(dt) {
    if (this.wanderX === null) {
      if ((this.pause -= dt) > 0) return 0;
      const r = Math.random();
      if (r < 0.04) this.w.kickBall(this);
      else if (r < 0.06) this.w.bounce(this);
      else this.wanderX = clampX(this.x + rand(-450, 450));
      return 0;
    }
    const dx = this.wanderX - this.x;
    if (Math.abs(dx) > 10) return Math.sign(dx) * 75;
    this.wanderX = null; this.pause = rand(1, 6);
    const r = Math.random();
    if (r < 0.1) this.jump();
    else if (r < 0.15) this.setAct('wave', 2);
    else if (r < 0.18) this.setMode('sit', rand(5, 12));
    else if (r < 0.2) this.setAct('dance', 3);
    return 0;
  }

  effects(dt) {
    const w = this.w;
    if ((this.fxT -= dt) > 0) return;
    this.fxT = 0.12;
    if (this.rocketT > 0) for (let i = 0; i < 4; i++) w.part({ x: this.x + rand(-6, 6), y: w.gy - this.y + 4, vx: rand(-60, 60), vy: rand(150, 350), life: 0.4, size: rand(5, 9), color: pick(['#ff6a00', '#ffd000', '#ff3d00', '#999999']) });
    if (this.act === 'rage') w.part({ x: this.x + rand(-12, 12), y: this.topY(), vx: rand(-40, 40), vy: -120, life: 0.5, size: 6, color: 'rgba(255,255,255,0.7)' });
    if ((this.act === 'dance' || this.mode === 'moonwalk') && Math.random() < 0.3) w.text(this.x + rand(-15, 15), this.topY(), '♪', pick(['#ff6b9d', '#48dbfb', '#feca57']), 20);
    else if (this.act === 'hug' && Math.random() < 0.4) w.part({ kind: 'heart', x: this.x + rand(-10, 10), y: this.topY(), vx: 0, vy: -70, life: 1, size: 2, color: '#ff4d6d' });
    else if (this.mode === 'sleep' && Math.random() < 0.12) w.text(this.x - this.facing * 10 * this.scale, w.gy - 12 * this.scale, 'z', '#ffffff', 18, -40, 25 * -this.facing);
    else if ((this.mode === 'run' || Math.abs(this.vx) > 250) && this.y < 1) w.dust(this.x - this.facing * 10, 1);
    if (this.cloudT > 0) for (let i = 0; i < 2; i++) w.part({ x: this.x + rand(-22, 22), y: this.topY() - 52, vx: 0, vy: 420, life: 0.3, size: 3, color: '#7ec8ff' });
  }

  draw(ctx) {
    if (this.hidden > 0 || this.busy) return;
    const w = this.w, s = this.scale;
    const sx = Math.round(this.x + (this.act === 'rage' ? rand(-3, 3) : 0)), sy = Math.round(w.gy - this.y);
    if (this.boxed) { // cardboard box with eyes peeking out of the handle hole
      const r = (c, x, y, ww, hh) => { ctx.fillStyle = c; ctx.fillRect(sx + x * s, sy + y * s, ww * s, hh * s); };
      ctx.globalAlpha = this.alpha;
      r('#8a5a2b', -7, -13, 14, 13); r('#b5835a', -6, -12, 12, 11); r('#d9b382', -6, -12, 12, 2); r('#8a5a2b', -1, -12, 2, 11);
      r('#1b1b1b', -4, -8, 5, 2); if (Math.sin(this.t * 1.7) > -0.8) { r('#ffffff', -4, -8, 1, 1); r('#ffffff', -1, -8, 1, 1); }
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = this.alpha * (this.ghostT > 0 ? 0.5 : 1);
    if (this.ghostT <= 0 && w.cfg.environment !== 'none') {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      const sw = Math.max(6, 9 * s - this.y * 0.05);
      ctx.fillRect(sx - sw / 2, w.gy - 2, sw, 4);
    }
    if (this.cloudT > 0) {
      const cy = this.topY() - 64;
      ctx.fillStyle = '#9aa5b1'; ctx.fillRect(sx - 30, cy + 4, 60, 12); ctx.fillRect(sx - 18, cy - 6, 30, 12);
      ctx.fillStyle = '#c8d0d8'; ctx.fillRect(sx - 14, cy - 4, 18, 6);
    }
    ctx.save();
    ctx.translate(sx, sy);
    let rot = 0;
    if (this.act === 'spin') rot = this.t * 20;
    else if (this.act === 'flip') rot = -(1 - this.actT / 0.75) * Math.PI * 2;
    else if (this.knockT > 0 && this.y > 2) rot = -this.t * 12;
    if (this.lying) { ctx.translate(0, -5 * s); ctx.rotate(-Math.PI / 2 * this.facing); }
    else if (rot) { ctx.translate(0, -9 * s); ctx.rotate(rot * this.facing); ctx.translate(0, 9 * s); }
    const q = this.squash > 0 ? this.squash * 2 : 0;
    ctx.scale(s * this.facing * (1 + q), s * (1 - q));
    this.drawBody(ctx);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawBody(ctx) {
    const L = this.look, t = this.t, act = this.act;
    const r = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const moving = Math.abs(this.vx) > 15 && this.y < 1;
    const air = this.y > 1 && this.ghostT <= 0;
    const sit = this.mode === 'sit';
    const knocked = this.knockT > 0;
    let b = 0;
    if (sit) b = 3;
    else if (moving) b = Math.sin(this.walkT * 2) > 0.3 ? -1 : 0;
    else if (act === 'dance') b = Math.sin(t * 12) > 0 ? -1 : 0;
    else if (!air) b = Math.sin(t * 2.2) > 0.75 ? 1 : 0;

    let back = 'down', front = 'down';
    if (act === 'wave') front = Math.sin(t * 14) > 0 ? 'up' : 'out';
    else if (act === 'dance') { const p = Math.sin(t * 6) > 0; back = p ? 'up' : 'out'; front = p ? 'out' : 'up'; }
    else if (act === 'attack' || act === 'cast' || act === 'love' || act === 'duel') front = 'fwd';
    else if (act === 'hug') back = front = 'fwd';
    else if (act === 'highfive') front = 'up';
    else if (act === 'cheer' || act === 'rage') back = front = 'up';
    else if (act === 'dab') { back = 'out'; front = 'fwd'; }
    else if (knocked || this.ghostT > 0 || air) back = front = 'out';
    else if (this.mode === 'run' || Math.abs(this.vx) > 200) { const p = Math.sin(this.walkT * 2) > 0; back = p ? 'fwd' : 'down'; front = p ? 'down' : 'fwd'; }

    const arm = (kind, isFront) => {
      const c = isFront ? L.shirt : L.sleeve, x = isFront ? 3 : -5, d = isFront ? 1 : -1;
      if (kind === 'down') { r(c, x, -9 + b, 2, 3); r(L.skin, x, -6 + b, 2, 1); }
      else if (kind === 'up') { r(c, x, -12 + b, 2, 3); r(L.skin, x, -13 + b, 2, 1); }
      else if (kind === 'out') { r(c, x + d, -10 + b, 2, 2); r(c, x + d * 2, -11 + b, 2, 1); r(L.skin, x + d * 3, -12 + b, 2, 1); }
      else { r(c, 2, -9 + b + (isFront ? 0 : -1), 4, 2); r(L.skin, 6, -9 + b + (isFront ? 0 : -1), 1, 2); } // fwd
    };

    // legs
    const shoe = '#1b1b1b';
    if (sit) { r(L.pants, -3, -3, 8, 3); r(shoe, 5, -3, 1, 3); }
    else if (act === 'kick') { r(L.pants, -3, -5, 2, 4); r(shoe, -3, -1, 3, 1); r(L.pants, 1, -5, 5, 2); r(shoe, 6, -6, 1, 3); }
    else {
      let la = 0;
      if (moving) la = Math.round(Math.sin(this.walkT * 2) * 1.5);
      else if (act === 'dance') la = Math.sin(t * 12) > 0 ? 1 : 0;
      else if (air) la = -1;
      r(L.pants, -3 + la, -5, 2, 4); r(shoe, -3 + la, -1, 3, 1);
      r(L.pants, 1 - la, -5, 2, 4); r(shoe, 1 - la, -1, 3, 1);
    }
    arm(back, false);
    r(L.shirt, -3, -9 + b, 6, 4); r(L.pants, -3, -5 + b, 6, 1);
    arm(front, true);

    // head
    const hy = -16 + b, eye = '#1b1b1b';
    r(L.skin, -4, hy, 8, 7);
    switch (L.hairStyle) {
      case 0: r(L.hair, -4, hy - 1, 8, 2); r(L.hair, -4, hy + 1, 2, 3); break;
      case 1: r(L.hair, -4, hy - 1, 8, 2); r(L.hair, -4, hy + 1, 1, 2); r(L.hair, -3, hy - 2, 1, 1); r(L.hair, 0, hy - 2, 1, 1); r(L.hair, 3, hy - 2, 1, 1); break;
      case 2: r(L.hair, -4, hy - 1, 8, 2); r(L.hair, -5, hy, 3, 7); break;
      default: r(L.hair, -4, hy - 1, 8, 1);
    }
    if (knocked) { r(eye, 1, hy + 2, 1, 1); r(eye, 3, hy + 2, 1, 1); r(eye, 2, hy + 3, 1, 1); r(eye, 1, hy + 4, 1, 1); r(eye, 3, hy + 4, 1, 1); }
    else if (this.mode === 'sleep' || t % 4 < 0.12) { r(eye, 1, hy + 4, 1, 1); r(eye, 3, hy + 4, 1, 1); }
    else { r(eye, 1, hy + 2, 1, 2); r(eye, 3, hy + 2, 1, 2); }
    if (act === 'rage') { r('#c0392b', -4, hy, 8, 3); r(eye, 0, hy + 2, 2, 1); r(eye, 3, hy + 2, 2, 1); r(eye, 1, hy + 5, 3, 1); }
    if (act === 'dance' || act === 'hug' || act === 'cheer' || act === 'love' || act === 'highfive' || act === 'wave') r('#a33', 2, hy + 5, 2, 1);
    if (act === 'love' || act === 'hug') r('#ff8fab', 0, hy + 4, 1, 1);

    if (this.crown) {
      const g = '#ffd32a';
      r(g, -4, hy - 3, 8, 2); r(g, -4, hy - 5, 1, 2); r(g, -1, hy - 5, 2, 2); r(g, 3, hy - 5, 1, 2); r('#e74c3c', -1, hy - 3, 2, 1);
      return;
    }
    const hc = L.hatColor;
    switch (L.hat) {
      case 0: r(hc, -4, hy - 2, 8, 2); r(hc, 4, hy - 1, 3, 1); break; // cap
      case 1: r(hc, -4, hy - 3, 8, 3); r('#ffffff', -1, hy - 4, 2, 1); break; // beanie
      case 2: r('#222', -3, hy - 7, 6, 6); r('#222', -5, hy - 1, 10, 1); r(hc, -3, hy - 3, 6, 1); break; // top hat
      case 3: r(hc, -3, hy - 2, 6, 1); r(hc, -2, hy - 3, 4, 1); r(hc, -1, hy - 5, 2, 2); r('#ffd32a', -1, hy - 6, 2, 1); break; // party hat
      case 4: r(hc, -4, hy + 1, 8, 1); break; // headband
    }
  }

  drawLabel(ctx) {
    if (this.hidden > 0 || this.busy) return;
    if (!this.label) this.label = makeLabel(this.stars ? `${this.name} ★${this.stars}` : this.name, this.color);
    ctx.globalAlpha = Math.max(0, this.alpha);
    const top = Math.round((this.boxed ? this.w.gy - this.y - 13 * this.scale : this.topY()) - this.label.height - 4);
    ctx.drawImage(this.label, Math.round(this.x - this.label.width / 2), top);
    if (this.bubble && this.w.cfg.showBubbles) {
      const img = this.bubble.img ||= makeBubble(this.bubble.text);
      ctx.globalAlpha = Math.min(1, this.bubble.t * 2) * this.alpha;
      ctx.drawImage(img, Math.round(clampX(this.x) - img.width / 2), top - img.height - 2);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- environments (pre-rendered once per config change) ----------
function blob(g, cx, cy, rad, color, step = 6) {
  g.fillStyle = color;
  for (let y = -rad; y <= rad; y += step) for (let x = -rad; x <= rad; x += step) if (x * x + y * y <= rad * rad) g.fillRect(cx + x, cy + y, step, step);
}
function groundStrip(g, gy, top, bottom, r) {
  g.fillStyle = bottom; g.fillRect(0, gy, W, GROUND);
  g.fillStyle = top; g.fillRect(0, gy, W, 6);
  for (let x = 0; x < W; x += 6) { const h = Math.floor(r() * 3); if (h) g.fillRect(x, gy - h * 2, 6, h * 2); }
  g.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 120; i++) g.fillRect(Math.floor(r() * W / 4) * 4, gy + 8 + Math.floor(r() * 3) * 4, 4, 4);
}
const ENV = {
  meadow(g, gy, hgt, r) {
    const th = Math.min(hgt * 0.8, 170);
    for (const x of [90, 330, W - 380, W - 120]) {
      g.fillStyle = '#6b4423'; g.fillRect(x - 8, gy - th * 0.55, 16, th * 0.55);
      blob(g, x, gy - th * 0.7, th * 0.28, '#2e7d32'); blob(g, x - th * 0.12, gy - th * 0.75, th * 0.18, '#43a047'); blob(g, x + th * 0.1, gy - th * 0.62, th * 0.15, '#388e3c');
    }
    for (const x of [560, 1050, 1500]) { blob(g, x, gy - 14, 22, '#388e3c'); blob(g, x + 22, gy - 10, 16, '#43a047'); }
    groundStrip(g, gy, '#4caf50', '#7a4f2b', r);
    for (let i = 0; i < 45; i++) {
      const x = Math.floor(r() * W / 4) * 4;
      g.fillStyle = '#2e7d32'; g.fillRect(x + 2, gy - 8, 2, 8);
      g.fillStyle = pick(['#ff6b9d', '#feca57', '#ffffff', '#a29bfe']); g.fillRect(x, gy - 12, 6, 4); g.fillRect(x + 2, gy - 14, 2, 8);
    }
  },
  night(g, gy, hgt, r) {
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(r() * W), h = 14 + r() * 18;
      g.fillStyle = '#d8cfc0'; g.fillRect(x - 3, gy - h, 6, h);
      g.fillStyle = pick(['#00e5ff', '#e056fd', '#7bed9f']); g.fillRect(x - 12, gy - h - 8, 24, 8); g.fillRect(x - 8, gy - h - 12, 16, 4);
    }
    groundStrip(g, gy, '#6c3fb0', '#24163d', r);
  },
  beach(g, gy, hgt, r) {
    const th = Math.min(hgt * 0.85, 190);
    for (const x of [120, W - 160]) {
      for (let i = 0; i < th; i += 8) { g.fillStyle = i % 16 ? '#8d6e4a' : '#a1805a'; g.fillRect(x + Math.sin(i / th * 2) * 20, gy - i, 14, 8); }
      const tx = x + Math.sin(2) * 20 + 7, ty = gy - th;
      g.fillStyle = '#2e8b57';
      for (const d of [-1, 1]) for (let i = 0; i < 9; i++) { g.fillRect(tx + d * i * 8 - 4, ty + i * i * 0.8, 10, 6); g.fillRect(tx + d * i * 6 - 4, ty - 10 + i * 3, 8, 6); }
    }
    g.fillStyle = '#e1b866'; g.fillRect(820, gy - 30, 60, 30); g.fillRect(830, gy - 46, 14, 16); g.fillRect(858, gy - 46, 14, 16);
    g.fillStyle = '#e74c3c'; g.fillRect(848, gy - 70, 2, 24); g.fillRect(850, gy - 70, 12, 8);
    groundStrip(g, gy, '#f5deb3', '#e1b866', r);
  },
  snow(g, gy, hgt, r) {
    const th = Math.min(hgt * 0.8, 180);
    for (const x of [100, 260, W - 300, W - 110]) {
      g.fillStyle = '#5d4037'; g.fillRect(x - 6, gy - 20, 12, 20);
      for (let i = 0; i < 5; i++) { const wdt = (5 - i) * th * 0.09 + 10; g.fillStyle = i % 2 ? '#1b5e20' : '#2e7d32'; g.fillRect(x - wdt / 2, gy - 20 - (i + 1) * th * 0.16, wdt, th * 0.16); g.fillStyle = '#ffffff'; g.fillRect(x - wdt / 2, gy - 20 - (i + 1) * th * 0.16, wdt, 4); }
    }
    blob(g, 1200, gy - 18, 20, '#ffffff', 4); blob(g, 1200, gy - 50, 14, '#ffffff', 4);
    g.fillStyle = '#111'; g.fillRect(1194, gy - 56, 4, 4); g.fillRect(1204, gy - 56, 4, 4); g.fillStyle = '#ff7f00'; g.fillRect(1200, gy - 50, 10, 4);
    groundStrip(g, gy, '#ffffff', '#cfdcf0', r);
  },
  minimal(g, gy) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, gy, W, GROUND); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, gy, W, 2); },
  none() {},
};

export class World {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.cfg = { characterSize: 3, animationSpeed: 1, autoMove: true, environment: 'meadow', worldHeight: 260, bottomOffset: 0, showBubbles: true, maxParticles: 800 };
    this.chars = new Map(); this.parts = []; this.shots = []; this.fx = []; this.timers = [];
    this.ball = { x: W * 0.35, y: 0, vx: 0, vy: 0, r: 16, rot: 0 };
    this.tramp = { x: W * 0.68, w: 130, sq: 0 };
    this.partyT = 0; this.banner = null; this.bg = null; this.ambientT = 0; this.time = 0;
    this.sfx = () => {};      // the overlay plugs the audio manager in; the world only says *when*
    this.activity = null;     // UFO escape visuals for the server-owned event in this.activity.ev
    this.clockOffset = 0;     // server clock - local clock, so countdowns follow server deadlines
    this.cues = new Set();    // "eventId:cue:login" already acted on, so repeats never replay sounds
  }
  get gy() { return H - this.cfg.bottomOffset - GROUND; }
  setConfig(c) {
    Object.assign(this.cfg, c);
    this.bg = null;
    for (const ch of this.chars.values()) ch.label = null;
  }
  after(sec, fn) { this.timers.push({ t: sec, fn }); }
  all() { return [...this.chars.values()].filter((c) => !c.leaving); }

  // ---------- server messages ----------
  handle(msg) {
    switch (msg.t) {
      case 'state': { // full snapshot on every (re)connect: restore silently, never replay cues
        this.setConfig(msg.cfg);
        if (msg.now) this.clockOffset = msg.now - Date.now();
        const keep = new Set(msg.users.map((u) => u.login));
        for (const k of this.chars.keys()) if (!keep.has(k)) this.chars.delete(k);
        for (const u of msg.users) { const c = this.chars.get(u.login); if (!c) this.chars.set(u.login, new Char(this, u, false)); else if (c.stars !== (u.stars || 0)) { c.stars = u.stars || 0; c.label = null; } }
        for (const c of this.chars.values()) c.crown = c.login === msg.crown;
        this.setActivity(msg.ev ?? null, null);
        break;
      }
      case 'ev': if (msg.now) this.clockOffset = msg.now - Date.now(); this.setActivity(msg.ev, msg); break;
      case 'stop': this.stopEffects(); break;
      case 'sfx': this.sfx(msg.name); break;
      case 'config': this.setConfig(msg.cfg); break;
      case 'spawn': this.spawn(msg.user); break;
      case 'despawn': this.chars.get(msg.login)?.leave(); break;
      case 'chat': this.chars.get(msg.login)?.say(msg.text); break;
      case 'note': { const c = this.chars.get(msg.login); if (c) this.text(c.x, c.topY() - 30, msg.text, '#ffd32a', 18, -40); break; }
      case 'event': this.event(msg.name, msg); break;
      case 'cmd': {
        const def = COMMANDS[msg.cmd];
        const c = this.spawn(msg.user);
        const t = msg.target ? this.chars.get(msg.target) : null;
        if (!def?.run || (def.target && (!t || t === c || t.leaving))) return;
        def.run(this, c, t, msg);
      }
    }
  }
  spawn(u) {
    const old = this.chars.get(u.login);
    if (old && !old.leaving) return old;
    const c = new Char(this, u, true);
    this.chars.set(u.login, c);
    this.burst(c.x, this.gy - c.y, 14, c.look.shirt);
    return c;
  }

  // ---------- effects primitives ----------
  part(p) { if (this.parts.length < this.cfg.maxParticles) { p.max = p.life; this.parts.push(p); } }
  burst(x, y, n, color, speed = 260) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = rand(0.3, 1) * speed; this.part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 100, g: 700, life: rand(0.4, 0.9), size: rand(3, 7), color: Array.isArray(color) ? pick(color) : color }); }
  }
  dust(x, n) { for (let i = 0; i < n; i++) this.part({ x: x + rand(-8, 8), y: this.gy - 2, vx: rand(-60, 60), vy: rand(-80, -20), g: 100, life: rand(0.3, 0.6), size: rand(3, 6), color: 'rgba(220,220,220,0.8)' }); }
  text(x, y, str, color, size = 28, vy = -80, vx = 0) { this.part({ kind: 'text', x, y, vx, vy, life: 1.2, text: str, color, size }); }
  hearts(x, y, n) { for (let i = 0; i < n; i++) this.part({ kind: 'heart', x, y, vx: rand(-120, 120), vy: rand(-220, -60), g: 150, life: rand(0.8, 1.4), size: 2, color: pick(['#ff4d6d', '#ff8fab', '#ff006e']) }); }
  confetti(x, y, n) { for (let i = 0; i < n; i++) this.part({ x, y, vx: rand(-350, 350), vy: rand(-500, -100), g: 400, life: rand(1.5, 2.5), size: rand(4, 7), color: pick(['#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#ff6b81', '#eccc68', '#a29bfe']), floor: true }); }
  shoot(x, y, getTarget, o) { this.shots.push({ x, y, get: getTarget, speed: o.speed || 600, kind: o.kind, onHit: o.onHit, life: 5 }); }
  headOf(c) { return () => (c.gone || c.hidden > 0 ? null : { x: c.x, y: this.gy - c.y - 10 * c.scale }); }
  explosion(x, y, radius, power) {
    for (let i = 0; i < 30; i++) this.part({ x, y, vx: rand(-420, 420), vy: rand(-650, -100), g: 900, life: rand(0.4, 0.9), size: rand(4, 10), color: pick(['#ff4d00', '#ffa600', '#ffd000', '#666666', '#999999']) });
    this.fx.push({ t: 0.15, draw: (ctx) => { ctx.fillStyle = 'rgba(255,240,180,0.55)'; blob(ctx, x, y, radius * 0.6, 'rgba(255,240,180,0.55)', 8); } });
    for (const c of this.chars.values()) { const dx = c.x - x; if (Math.abs(dx) < radius && c.y < 80) c.knock(Math.sign(dx) || 1, power); }
  }
  onTramp(x) { return Math.abs(x - this.tramp.x) < this.tramp.w / 2; }

  // ---------- interactions (used by commands.js) ----------
  attack(a, b, words = ['POW!', 'BAM!', 'WHACK!', 'BONK!'], power = 0.8, sound = 'punch') {
    a.goTo(b, 10 * a.scale, () => {
      if (!a.setAct('attack', 0.45)) return;
      this.after(0.12, () => {
        const d = Math.sign(b.x - a.x) || a.facing;
        if (b.gone || !b.knock(d, power)) return; // missed (target hiding/busy): no fake impact
        this.sfx(sound);
        this.text(b.x, b.topY() - 10, pick(words), '#ffd32a', 30);
        this.burst(b.x - d * 10, this.gy - b.y - 10 * b.scale, 10, '#ffffff');
      });
    }, 280);
  }
  hug(a, b) {
    a.goTo(b, 7 * a.scale, () => {
      if (!a.setAct('hug', 2.2)) return;
      b.facing = Math.sign(a.x - b.x) || -a.facing;
      b.setAct('hug', 2.2);
      this.hearts((a.x + b.x) / 2, a.topY() - 10, 8);
      this.sfx('sparkle');
    });
  }
  highfive(a, b) {
    a.goTo(b, 9 * a.scale, () => {
      if (!a.setAct('highfive', 0.8)) return;
      b.facing = Math.sign(a.x - b.x) || -a.facing;
      b.setAct('highfive', 0.8);
      this.after(0.2, () => { const x = (a.x + b.x) / 2, y = a.topY(); this.burst(x, y, 14, ['#ffd32a', '#ffffff']); this.text(x, y - 20, 'HIGH FIVE!', '#ffd32a', 24); this.sfx('clap'); });
    });
  }
  love(a, b) {
    a.facing = Math.sign(b.x - a.x) || a.facing;
    a.setAct('love', 1.5);
    for (let i = 0; i < 5; i++) this.after(i * 0.2, () => {
      if (a.gone) return;
      this.shoot(a.x, this.gy - a.y - 12 * a.scale, this.headOf(b), { kind: 'heart', speed: 420, onHit: () => { this.hearts(b.x, b.topY(), 4); this.sfx('sparkle'); } });
    });
  }
  fireball(a, b) {
    a.facing = Math.sign(b.x - a.x) || a.facing;
    if (!a.setAct('cast', 0.6)) return;
    this.after(0.25, () => {
      if (a.gone) return;
      this.sfx('fireCast');
      this.shoot(a.x + a.facing * 20, this.gy - a.y - 9 * a.scale, this.headOf(b), {
        kind: 'fire', speed: 750, onHit: () => { this.sfx('fireHit'); this.explosion(b.x, this.gy - b.y - 8 * b.scale, 60, 0.7); this.text(b.x, b.topY() - 10, 'TOASTY!', '#ff9f1a', 26); },
      });
    });
  }
  explodeChar(c) {
    if (c.blocked()) return;
    const y = this.gy - c.y - 8 * c.scale;
    c.hidden = 2.5; c.act = null; c.mode = null; c.approach = null; c.ghostT = 0; c.cloudT = 0;
    this.explosion(c.x, y, 100, 0.6);
    this.burst(c.x, y, 24, [c.look.shirt, c.look.skin, c.look.pants, c.look.hair], 420);
    this.text(c.x, y - 40, 'KABOOM!', '#ff4d00', 34);
    this.sfx('boom');
  }
  fight(a, b, roll) {
    a.goTo(b, 12 * a.scale, () => {
      if (a.blocked() || b.blocked()) return;
      const x = (a.x + b.x) / 2, s = Math.max(a.scale, b.scale);
      a.busy = b.busy = true; a.bubble = b.bubble = null;
      this.sfx('brawl');
      this.fx.push({
        t: 3,
        tick: (dt, f) => { if (Math.random() < dt * 4) this.text(x + rand(-50, 50), this.gy - 20 * s - rand(0, 30), pick(['POW', 'BIFF', 'ZAP', '!!', '#@%']), pick(['#ffd32a', '#ff4757', '#ffffff']), 22); if (a.gone || b.gone) f.t = 0; },
        draw: (ctx) => {
          const cy = this.gy - 9 * s;
          for (let i = 0; i < 9; i++) { const ang = Math.random() * 6.28, rr = Math.random() * 30, sz = 22 + Math.random() * 16; ctx.fillStyle = i % 2 ? '#eeeeee' : '#bbbbbb'; ctx.fillRect(x + Math.cos(ang) * rr - sz / 2, cy + Math.sin(ang) * rr * 0.6 - sz / 2, sz, sz); }
          for (const c of [a, b]) { ctx.fillStyle = c.look.skin; ctx.fillRect(x + rand(-48, 40), cy + rand(-36, 24), 8, 8); ctx.fillStyle = c.look.shirt; ctx.fillRect(x + rand(-48, 40), cy + rand(-30, 20), 10, 6); }
        },
        end: () => {
          a.busy = b.busy = false;
          if (a.gone || b.gone) return;
          a.x = clampX(x - 20); b.x = clampX(x + 20);
          const [win, lose] = roll < 0.5 ? [a, b] : [b, a];
          lose.knock(Math.sign(lose.x - x) || 1, 0.9);
          win.setAct('cheer', 2);
          this.sfx('win');
          this.text(win.x, win.topY() - 20, 'WINNER!', '#2ed573', 30);
          this.text(lose.x, this.gy - 60, 'K.O.', '#ff4757', 28);
          this.burst(x, this.gy - 30, 16, ['#ffffff', '#ffd32a']);
        },
      });
    }, 280);
  }
  duel(a, b, roll) {
    const side = Math.sign(a.x - b.x) || 1;
    const spot = { x: clampX(b.x + side * 260) };
    a.goTo(spot, 12, () => {
      if (b.blocked() || a.blocked()) return;
      a.facing = Math.sign(b.x - a.x) || 1; b.facing = -a.facing;
      a.setAct('duel', 2.6); b.setAct('duel', 2.6);
      const mx = (a.x + b.x) / 2, my = this.gy - 140;
      ['3', '2', '1'].forEach((n, i) => this.after(i * 0.55, () => { if (a.gone || b.gone) return; this.text(mx, my, n, '#ffffff', 40, -30); this.sfx('tick'); }));
      this.after(1.7, () => {
        if (a.gone || b.gone) return;
        const [win, lose] = roll < 0.5 ? [a, b] : [b, a];
        this.text(mx, my, 'DRAW!', '#ffd32a', 44, -30);
        this.sfx('go');
        this.shoot(win.x + win.facing * 20, this.gy - win.y - 8 * win.scale, this.headOf(lose), {
          kind: 'bolt', speed: 2600, onHit: () => { lose.knock(win.facing, 0.8); this.burst(lose.x, lose.topY(), 12, '#ffffff'); win.setAct('cheer', 1.5); this.text(win.x, win.topY() - 20, 'FASTEST!', '#2ed573', 26); this.sfx('win'); },
        });
      });
    }, 240);
  }
  kickBall(c) {
    c.goTo(this.ball, 40, () => {
      if (!c.setAct('kick', 0.35)) return;
      const d = Math.sign(this.ball.x - c.x) || c.facing;
      this.ball.vx = d * rand(650, 1000); this.ball.vy = rand(450, 850);
      this.dust(this.ball.x, 4);
    });
  }
  bounce(c, loud = false) { c.goTo(this.tramp, this.tramp.w / 3, () => { c.boing = 3; c.loudBoing = loud; c.jump(0.9); }); }
  fart(c) {
    if (c.blocked()) return;
    this.sfx('fart');
    for (let i = 0; i < 18; i++) this.part({ x: c.x - c.facing * 8, y: this.gy - c.y - 6 * c.scale, vx: -c.facing * rand(40, 220), vy: rand(-80, 20), g: -40, life: rand(0.8, 1.6), size: rand(8, 16), color: pick(['rgba(140,200,60,0.6)', 'rgba(110,170,40,0.5)']) });
    this.text(c.x - c.facing * 40, this.gy - c.y - 30, pick(['PFFFT', 'BRAAP', 'TOOT']), '#9be15d', 26);
    for (const o of this.chars.values()) if (o !== c && Math.abs(o.x - c.x) < 140 && o.y < 40) o.knock(Math.sign(o.x - c.x) || 1, 0.5);
  }
  rocket(c) {
    if (c.blocked() || c.y > 2) return;
    c.rocketT = 0.6; c.jump(2.2); c.setAct('cheer', 0.6);
    this.sfx('rocket');
    this.text(c.x, this.gy - 40, 'LIFTOFF!', '#ff9f1a', 28);
  }
  zap(a, b) {
    a.facing = Math.sign(b.x - a.x) || a.facing;
    if (!a.setAct('cast', 0.5)) return;
    this.sfx('zapCast');
    this.shoot(a.x + a.facing * 20, this.gy - a.y - 9 * a.scale, this.headOf(b), {
      kind: 'bolt', speed: 2200, onHit: () => { if (!b.knock(a.facing, 0.6)) return; this.sfx('zap'); this.burst(b.x, b.topY(), 16, ['#fff200', '#ffffff', '#48dbfb']); this.text(b.x, b.topY() - 10, 'ZAP!', '#fff200', 30); },
    });
  }
  yeet(a, b) {
    a.goTo(b, 9 * a.scale, () => {
      if (b.blocked() || !a.setAct('cheer', 1)) return;
      b.knock(Math.sign(b.x - a.x) || a.facing, 2.2);
      b.yeeted = true; this.sfx('whoosh');
      this.text(a.x, a.topY() - 20, 'YEET!', '#ffffff', 34);
    }, 280);
  }
  kiss(a, b) {
    a.goTo(b, 7 * a.scale, () => {
      if (!a.setAct('love', 1.2)) return;
      b.facing = Math.sign(a.x - b.x) || -a.facing;
      b.setAct('love', 1.2);
      this.text((a.x + b.x) / 2, a.topY() - 20, 'MWAH!', '#ff6b9d', 28);
      this.sfx('sparkle');
      this.hearts((a.x + b.x) / 2, a.topY(), 14);
    });
  }
  sneeze(c) {
    if (!c.setAct('cheer', 0.3)) return;
    this.text(c.x, c.topY() - 10, 'ACHOO!', '#ffffff', 30);
    this.sfx('sneezeUp');
    this.after(0.3, () => { if (!c.knock(-c.facing, 0.6)) return; this.sfx('sneeze'); this.burst(c.x + c.facing * 20, this.gy - c.y - 13 * c.scale, 14, ['#b8f5b0', '#ffffff']); });
  }
  coins(c, n) { if (typeof n !== 'number') return; this.text(c.x, c.topY() - 26, `${n} coins`, '#ffd32a', 22, -50); this.sfx('coin'); }
  restyle(c, user) { c.setUser(user); this.confetti(c.x, c.topY(), 20); this.text(c.x, c.topY() - 20, 'NEW LOOK!', '#ffffff', 22); }

  meteor() {
    const x = rand(0, W), tx = clampX(x + rand(-300, 300)), top = this.gy - this.cfg.worldHeight - 300;
    this.shoot(x, top, () => ({ x: tx, y: this.gy }), { kind: 'meteor', speed: 900, onHit: () => { this.sfx('meteor'); this.explosion(tx, this.gy - 6, 110, 0.8); } });
  }

  // ---------- special events ----------
  event(name, msg = {}) {
    const all = this.all();
    let banner = null;
    switch (name) {
      case 'meteor': banner = 'METEOR SHOWER!'; for (let i = 0; i < 18; i++) this.after(i * 0.35 + Math.random() * 0.3, () => this.meteor()); break;
      case 'party': banner = 'DANCE PARTY!'; this.partyT = 10; for (const c of all) c.setAct('dance', 10); break;
      case 'stampede': banner = 'STAMPEDE!'; for (const c of all) { c.facing = Math.random() < 0.5 ? -1 : 1; c.setMode('run', 6); } break;
      case 'crown': {
        const c = this.chars.get(msg.login) || pick(all);
        if (!c) return;
        for (const o of this.chars.values()) o.crown = false;
        c.crown = true; c.jump();
        this.burst(c.x, c.topY(), 20, ['#ffd32a', '#ffffff']);
        banner = `${c.name.toUpperCase()} GOT THE CROWN!`;
        break;
      }
      case 'confetti': banner = 'CONFETTI!'; for (let i = 0; i < 8; i++) this.after(i * 0.15, () => this.confetti(rand(100, W - 100), this.gy - this.cfg.worldHeight * 0.8, 40)); break;
      case 'groupjump': banner = 'EVERYBODY JUMP!'; for (const c of all) this.after((c.x / W) * 1.5, () => c.jump(1.1)); break;
    }
    if (banner) { this.banner = { text: banner, t: 3 }; this.sfx('stinger'); }
  }

  // ---------- UFO escape: the server decides everything, this only renders it ----------
  setActivity(ev, msg) {
    const live = !!msg, cue = msg?.cue;
    if (!ev) {
      for (const c of this.chars.values()) if (c.boxed) { c.boxed = false; if (live && cue === 'done') { c.setAct('cheer', 1.5); this.confetti(c.x, c.topY(), 10); } }
      if (this.activity) { this.activity.ev = null; this.activity.leaveT = 1.5; }
      this.cues.clear();
      return;
    }
    if (this.activity?.id !== ev.id) { this.activity = { id: ev.id, x: -160, tx: W / 2, bob: 0, scan: 0, retarget: 0, leaveT: 0, sounds: 0, betSounds: 0, seenT: null }; this.cues.clear(); }
    this.activity.ev = ev;
    const hidden = new Set(ev.hidden || []);
    for (const c of this.chars.values()) {
      if (hidden.has(c.login) && !c.boxed) { c.act = null; c.mode = null; c.approach = null; c.ghostT = 0; }
      c.boxed = hidden.has(c.login);
    }
    // Sounds and one-off animations only for live messages, once per cue. Snapshots restore silently.
    const key = `${ev.id}:${cue}:${msg?.login || ''}`;
    if (!live || this.cues.has(key)) return;
    this.cues.add(key);
    const c = msg.login && this.chars.get(msg.login);
    if (ev.type === 'race') return this.raceCue(ev, msg, c);
    switch (cue) {
      case 'start': this.sfx('stinger'); break;
      case 'play': if (c) { c.jump(); this.text(c.x, c.topY() - 16, 'JOINED!', '#48dbfb', 20); } this.sfx('join'); break;
      case 'active': this.sfx('alarm'); break;
      case 'hide': if (c) { this.burst(c.x, this.gy - 20, 10, ['#d9b382', '#8a5a2b']); this.text(c.x, c.topY() - 30, 'HIDDEN!', '#d9b382', 20); } this.sfx('hide'); break;
      case 'result': {
        const r = ev.result;
        for (const p of r.caught) {
          const ch = this.chars.get(p.login);
          if (ch && !ch.leaving && !ch.busy && ch.hidden <= 0) Object.assign(ch, { act: null, mode: null, approach: null, knockT: 0, ghostT: 0, beamT: 2.4 });
        }
        for (const [login, n] of Object.entries(r.stars)) { const ch = this.chars.get(login); if (ch) { ch.stars = n; ch.label = null; } }
        for (const [login, n] of Object.entries(r.coins || {})) { const ch = this.chars.get(login); if (ch) this.after(2.6, () => this.text(ch.x, ch.topY() - 34, `+${n} coins`, '#ffd32a', 18, -40)); }
        if (r.caught.length) this.sfx('beam');
        this.after(r.caught.length ? 2.4 : 0.2, () => this.sfx(r.escaped.length ? 'win' : 'fail'));
        break;
      }
    }
  }
  asfx(name) { const a = this.activity; if (a && a.sounds++ < 14) this.sfx(name); } // per-round sound cap
  raceCue(ev, msg, c) {
    const pools = this.pools(ev);
    switch (msg.cue) {
      case 'start': this.sfx('stinger'); break;
      case 'bet': {
        const b = ev.bets.find((x) => x.login === msg.login);
        if (c && b) this.text(c.x, c.topY() - 30, `${b.stake} on ${b.side.toUpperCase()} · ${msg.left} left`, b.side === 'red' ? '#ff6b6b' : '#54a0ff', 18, -40);
        if (this.activity.betSounds++ < 5) this.sfx('coin'); // bets get their own small cap
        break;
      }
      case 'active': this.activity.seenT = -2000; break; // live start: play the whole countdown
      case 'result': {
        const r = ev.result;
        for (const x of r.returns) {
          const ch = this.chars.get(x.login);
          if (!ch || ch.leaving) continue;
          const won = !r.refund && x.ret > 0;
          this.text(ch.x, ch.topY() - 30, r.refund ? `refund ${x.ret}` : won ? `+${x.ret} coins!` : `-${x.stake}`, won ? '#ffd32a' : '#dfe4ea', won ? 22 : 18, -45);
          if (won) ch.setAct('cheer', 1.5); else if (!r.refund && Math.random() < 0.5) ch.setAct('rage', 1);
        }
        this.asfx(r.refund ? 'coin' : 'cash');
        break;
      }
    }
    return pools;
  }
  pools(ev) {
    const p = { red: 0, blue: 0, nred: 0, nblue: 0 };
    for (const b of ev.bets) { p[b.side] += b.stake; p['n' + b.side]++; }
    return p;
  }
  // Where each chicken is t ms after the start. Stumbles pause it; the server-chosen winner always finishes first.
  raceProgress(r, side, t) {
    if (t <= 0) return 0;
    let paused = 0;
    for (const s of r.stumbles[side]) paused += Math.max(0, Math.min(r.stumbleMs, t - s));
    return Math.min(1, (t - paused) / (r.finish[side] - r.stumbles[side].length * r.stumbleMs));
  }
  updateRace(a) { // sounds and text at timeline beats; anything before we first saw this race stays silent
    const r = a.ev?.race;
    if (!r) return;
    const t = Date.now() + this.clockOffset - r.startAt, mid = W / 2, my = this.gy - this.cfg.worldHeight + 110;
    if (a.seenT === null) a.seenT = t;
    const beat = (at) => at > a.seenT && at <= t && (a.lastT ?? a.seenT) < at;
    for (const [at, txt] of [[-1500, '3'], [-1000, '2'], [-500, '1'], [0, 'GO!']]) if (beat(at)) { this.text(mid, my, txt, '#ffffff', 44, -30); this.asfx(at ? 'tick' : 'go'); }
    for (const side of ['red', 'blue']) {
      for (const st of r.stumbles[side]) if (beat(st)) { this.text(this.racerX(r, side, t), this.gy - 80, pick(['SQUAWK!', 'BAWK!', 'OOPS']), '#ffffff', 22); this.asfx('squeak'); }
    }
    if (beat(r.finish[r.winner])) { this.confetti(W - 140, this.gy - 120, 30); this.text(W - 140, this.gy - 140, `${r.winner.toUpperCase()} WINS!`, r.winner === 'red' ? '#ff6b6b' : '#54a0ff', 34); this.asfx('win'); }
    a.lastT = t;
  }
  racerX(r, side, t) { return 140 + (W - 280) * this.raceProgress(r, side, t); }
  drawRace(ctx, a) {
    const ev = a.ev, r = ev?.race ?? a.lastRace, gy = this.gy;
    if (ev?.race) a.lastRace = ev.race;
    const t = r ? Date.now() + this.clockOffset - r.startAt : -1;
    ctx.globalAlpha = ev ? 1 : Math.max(0, a.leaveT / 1.5);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#111' : '#fff'; ctx.fillRect(W - 140, gy - 90 + i * 12, 8, 12); ctx.fillStyle = i % 2 ? '#fff' : '#111'; ctx.fillRect(W - 132, gy - 90 + i * 12, 8, 12); }
    ctx.fillStyle = '#ddd'; ctx.fillRect(140, gy - 34, 4, 34);
    for (const [side, lane, color] of [['blue', -18, '#54a0ff'], ['red', 0, '#ff6b6b']]) {
      const x = r ? this.racerX(r, side, Math.min(t, r.finish[side])) : 140;
      const stumbling = r && r.stumbles[side].some((s) => t >= s && t < s + r.stumbleMs);
      const running = r && t > 0 && t < r.finish[side] && !stumbling;
      this.drawChicken(ctx, x, gy + lane, color, running, stumbling);
    }
    ctx.globalAlpha = 1;
  }
  drawChicken(ctx, x, y, color, running, stumbling) {
    const s = 3, leg = running ? (Math.sin(this.time * 30) > 0 ? 1 : -1) : 0, hop = running ? Math.abs(Math.sin(this.time * 15)) * 6 : 0;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y - hop));
    if (stumbling) ctx.rotate(0.9); else if (!running) ctx.translate(0, Math.sin(this.time * 4 + x) > 0.8 ? 3 : 0); // idle pecking
    const r = (c, px, py, w, h) => { ctx.fillStyle = c; ctx.fillRect(px * s, py * s, w * s, h * s); };
    r('#ffa502', -2 + leg, -3, 1, 3); r('#ffa502', 1 - leg, -3, 1, 3);
    r('#f1f2f6', -7, -11, 3, 3); r('#ffffff', -5, -9, 9, 6); r('#dfe4ea', -4, -6, 6, 2);
    r('#ffffff', 2, -14, 4, 5); r('#ff4757', 3, -15, 2, 1); r('#111111', 4, -13, 1, 1); r('#ffa502', 6, -12, 2, 1); r('#ff4757', 5, -10, 1, 1);
    r(color, 1, -10, 4, 2); r(color, -1, -9, 2, 3);
    ctx.restore();
  }
  updateActivity(dt) {
    const a = this.activity;
    if (!a) return;
    if (a.ev?.type === 'race' || a.race) { a.race = true; this.updateRace(a); if (!a.ev && (a.leaveT -= dt) <= 0) this.activity = null; return; }
    if (!a.ev) { a.x += 900 * dt; a.bob -= 400 * dt; if ((a.leaveT -= dt) <= 0) this.activity = null; return; }
    if ((a.retarget -= dt) <= 0) { a.retarget = rand(2, 4); a.tx = rand(260, W - 260); } // cosmetic only
    a.x += (a.tx - a.x) * Math.min(1, dt * 0.8);
    a.bob = Math.sin(this.time * 2) * 6;
    a.scan += dt;
  }
  cone(ctx, x, y, bx, half, color) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y); ctx.lineTo(bx + half, this.gy); ctx.lineTo(bx - half, this.gy); ctx.fill();
  }
  drawActivity(ctx) {
    const a = this.activity;
    if (!a) return;
    if (a.race) return this.drawRace(ctx, a);
    const gy = this.gy, ux = a.x, uy = Math.min(Math.max(gy - this.cfg.worldHeight + 110, 60), gy - 120) + a.bob;
    if (a.ev?.phase === 'active') this.cone(ctx, ux, uy + 14, ux + Math.sin(a.scan * 1.3) * 220, 70, 'rgba(180,255,170,0.16)');
    for (const c of this.chars.values()) if (c.beamT > 0) this.cone(ctx, ux, uy + 14, c.x, 36, 'rgba(162,155,254,0.32)');
    const r = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(ux + x), Math.round(uy + y), w, h); };
    r('rgba(160,230,255,0.85)', -22, -26, 44, 18); r('rgba(255,255,255,0.7)', -12, -22, 10, 6);
    r('#8395a7', -60, -8, 120, 14); r('#c8d6e5', -60, -8, 120, 4); r('#576574', -44, 6, 88, 8);
    for (let i = 0; i < 5; i++) r(Math.floor(this.time * 6 + i) % 2 ? '#feca57' : '#ff6b6b', -48 + i * 22, -2, 8, 6);
  }
  // Instructions, countdown, joined count and results, at the top of the world band (moved by director.hudOffset).
  drawHud(ctx) {
    const ev = this.activity?.ev;
    if (!ev) return;
    const left = ev.endsAt - Date.now() - this.clockOffset, secs = Math.max(0, Math.ceil(left / 1000)), n = ev.players?.length ?? 0;
    const names = (list) => {
      const shown = list.slice(0, 6).map((p) => (p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name)).join(', ');
      return list.length > 6 ? `${shown} +${list.length - 6} more` : shown;
    };
    const d = this.cfg.director || {};
    let l1, l2, color = '#ffd32a', total = d.enrollSeconds;
    if (ev.type === 'race') {
      const p = this.pools(ev), names = (list) => list.slice(0, 5).map((x) => `${x.name.length > 14 ? x.name.slice(0, 13) + '…' : x.name} +${x.ret}`).join(', ') + (list.length > 5 ? ` +${list.length - 5} more` : '');
      if (ev.phase === 'enroll') {
        l1 = `Red or blue? !bet red 10 / !bet blue 10 — closes in ${secs} seconds`;
        l2 = `RED ${p.red} (${p.nred}) · BLUE ${p.blue} (${p.nblue}) · return depends on the closing pool · free play coins`; total = d.betSeconds;
      } else if (ev.phase === 'active') {
        l1 = `Bets locked! RED ${p.red} vs BLUE ${p.blue}`; l2 = `The whole pool of ${p.red + p.blue} goes to the winning side, no house cut`; color = '#54a0ff'; total = 0;
      } else {
        const r = ev.result, winners = r.returns.filter((x) => x.side === r.winner);
        l1 = `${r.winner.toUpperCase()} CHICKEN WINS!`; color = r.winner === 'red' ? '#ff6b6b' : '#54a0ff'; total = d.resultSeconds;
        l2 = r.refund || `Paid: ${names(winners)} (pool ${r.pools.red + r.pools.blue} split by stake)`;
      }
    } else if (ev.phase === 'enroll') { l1 = `UFO inspection! Type !play to join — ${secs} seconds`; l2 = n ? `${n} joined` : 'One player is enough!'; }
    else if (ev.phase === 'active') { l1 = `HIDE! Players, type !hide — ${secs}s`; l2 = `${ev.hidden.length} of ${n} hidden`; color = '#7bed9f'; total = d.hideSeconds; }
    else {
      const r = ev.result;
      l1 = r.escaped.length ? `Escaped: ${names(r.escaped)} ★` : 'Nobody hid!';
      l2 = r.caught.length ? `Inspected and returned: ${names(r.caught)}` : 'The aliens leave empty-handed!';
      if (Object.keys(r.coins || {}).length) l2 += ' · players earned play coins';
      color = r.escaped.length ? '#2ed573' : '#ff6b6b'; total = d.resultSeconds;
    }
    const y = Math.min(H - 70, Math.max(10, this.gy - this.cfg.worldHeight + 8 + (d.hudOffset || 0)));
    ctx.font = `700 28px ${FONT}`; const w1 = ctx.measureText(l1).width;
    ctx.font = `600 20px ${FONT}`; const w2 = ctx.measureText(l2).width;
    const pw = Math.min(W - 40, Math.max(w1, w2) + 40), px = W / 2 - pw / 2;
    ctx.fillStyle = 'rgba(10,10,20,0.72)'; ctx.fillRect(px, y, pw, 66);
    if (total) { ctx.fillStyle = color; ctx.fillRect(px, y + 62, pw * Math.min(1, Math.max(0, left / (total * 1000))), 4); }
    ctx.textAlign = 'center';
    ctx.font = `700 28px ${FONT}`; ctx.fillStyle = color; ctx.fillText(l1, W / 2, y + 31, pw - 20);
    ctx.font = `600 20px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.fillText(l2, W / 2, y + 55, pw - 20);
    ctx.textAlign = 'start';
  }
  // Stop effects: drop every transient visual and override. Characters and the crown stay.
  stopEffects() {
    this.parts.length = 0; this.shots.length = 0; this.fx.length = 0; this.timers.length = 0;
    this.banner = null; this.partyT = 0; this.activity = null; this.cues.clear();
    for (const c of this.chars.values()) {
      Object.assign(c, { busy: false, boxed: false, beamT: 0, rocketT: 0, ghostT: 0, cloudT: 0, sizeT: 0, boing: 0, act: null, mode: null, approach: null, yeeted: false });
      if (c.hidden > 0) c.hidden = 0.01; // exploded characters respawn next frame
    }
  }

  // ---------- loop ----------
  update(dt) {
    dt *= this.cfg.animationSpeed;
    this.time += dt;
    for (let i = this.timers.length; i--;) { const tm = this.timers[i]; if ((tm.t -= dt) <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    const list = [...this.chars.values()];
    for (const c of list) { c.update(dt); if (c.gone && this.chars.get(c.login) === c) this.chars.delete(c.login); }
    this.collide(list);
    this.updateBall(dt, list);
    this.tramp.sq = Math.max(0, this.tramp.sq - dt * 4);

    for (let i = this.shots.length; i--;) {
      const s = this.shots[i], tg = s.get();
      const done = () => { this.shots[i] = this.shots[this.shots.length - 1]; this.shots.pop(); };
      if (!tg) { done(); continue; }
      const dx = tg.x - s.x, dy = tg.y - s.y, d = Math.hypot(dx, dy);
      if (d < 18 || (s.life -= dt) <= 0) { done(); s.onHit?.(); continue; }
      const step = Math.min(d, s.speed * dt);
      s.x += (dx / d) * step; s.y += (dy / d) * step;
      if (s.kind === 'fire' || s.kind === 'meteor') this.part({ x: s.x + rand(-6, 6), y: s.y + rand(-6, 6), vx: rand(-30, 30), vy: rand(-60, 0), life: 0.35, size: s.kind === 'meteor' ? 9 : 6, color: pick(['#ff6a00', '#ffd000', '#ff3d00']) });
    }
    for (let i = this.fx.length; i--;) {
      const f = this.fx[i];
      f.tick?.(dt, f);
      if ((f.t -= dt) <= 0) { this.fx.splice(i, 1); f.end?.(); }
    }
    for (let i = this.parts.length; i--;) {
      const p = this.parts[i];
      if ((p.life -= dt) <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.floor && p.y > this.gy) { p.y = this.gy; p.vy *= -0.3; p.vx *= 0.6; }
    }
    if (this.partyT > 0) { this.partyT -= dt; if (Math.random() < dt * 3) this.confetti(rand(100, W - 100), this.gy - this.cfg.worldHeight, 6); }
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    this.updateActivity(dt);
    this.ambient(dt);
  }

  collide(list) {
    const ground = list.filter((c) => c.y < 2 && !c.hidden && !c.busy && !c.leaving && !c.act && c.ghostT <= 0 && c.knockT <= 0);
    ground.sort((a, b) => a.x - b.x);
    const base = Math.min(9 * this.cfg.characterSize, (W - 2 * MARGIN) / (ground.length + 1));
    for (let i = 1; i < ground.length; i++) {
      const a = ground[i - 1], b = ground[i], o = base * (a.size + b.size) / 2 - (b.x - a.x);
      if (o > 0) { a.x = clampX(a.x - o * 0.25); b.x = clampX(b.x + o * 0.25); }
    }
  }

  updateBall(dt, list) {
    const b = this.ball;
    b.vy -= G * dt; b.y += b.vy * dt;
    if (b.y < 0) { b.y = 0; b.vy = b.vy < -150 ? -b.vy * 0.6 : 0; }
    if (b.y === 0) b.vx *= Math.max(0, 1 - dt * 1.5);
    b.x += b.vx * dt;
    if (b.x < b.r || b.x > W - b.r) { b.x = Math.min(W - b.r, Math.max(b.r, b.x)); b.vx = -b.vx * 0.8; }
    b.rot += (b.vx * dt) / b.r;
    for (const c of list) {
      if (c.hidden > 0 || c.busy || c.ghostT > 0 || c.leaving) continue;
      const dx = b.x - c.x, reach = b.r + 4 * c.scale;
      if (Math.abs(dx) < reach && b.y < 16 * c.scale && c.y < b.y + 2 * b.r) {
        const d = Math.sign(dx) || c.facing;
        b.x = c.x + d * reach;
        b.vx = d * Math.max(Math.abs(b.vx) * 0.5, Math.abs(c.vx) + 120);
        if (b.y < 4) b.vy = Math.max(b.vy, 200);
      }
    }
  }

  ambient(dt) {
    const env = this.cfg.environment;
    if (env !== 'snow' && env !== 'night') return;
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    this.ambientT = env === 'snow' ? 0.08 : 0.5;
    const top = this.gy - this.cfg.worldHeight;
    if (env === 'snow') this.part({ x: rand(0, W), y: top, vx: rand(-20, 20), vy: rand(40, 80), life: this.cfg.worldHeight / 50, size: 3, color: 'rgba(255,255,255,0.8)' });
    else this.part({ x: rand(0, W), y: rand(top + 40, this.gy - 20), vx: rand(-15, 15), vy: rand(-15, 15), life: 3, size: 3, color: '#eaff7b' });
  }

  // ---------- render ----------
  draw() {
    const ctx = this.ctx, gy = this.gy, top = gy - this.cfg.worldHeight;
    ctx.clearRect(0, 0, W, H);
    if (!this.bg) {
      const c = document.createElement('canvas');
      c.width = W; c.height = this.cfg.worldHeight + GROUND;
      ENV[this.cfg.environment]?.(c.getContext('2d'), this.cfg.worldHeight, this.cfg.worldHeight, rng(42));
      this.bg = c;
    }
    ctx.drawImage(this.bg, 0, top);

    if (this.partyT > 0) {
      ctx.globalAlpha = Math.min(1, this.partyT) * 0.16;
      for (let i = 0; i < 5; i++) {
        const x = (i + 0.5) * W / 5, a = Math.sin(this.time * 1.5 + i * 1.3) * 0.5;
        ctx.fillStyle = `hsl(${(this.time * 120 + i * 70) % 360},100%,60%)`;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + Math.tan(a - 0.15) * (gy - top), gy); ctx.lineTo(x + Math.tan(a + 0.15) * (gy - top), gy); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // trampoline
    const t = this.tramp, ty = gy - 10 + t.sq * 5;
    ctx.fillStyle = '#333'; ctx.fillRect(t.x - t.w / 2 + 6, gy - 10, 6, 10); ctx.fillRect(t.x + t.w / 2 - 12, gy - 10, 6, 10);
    ctx.fillStyle = '#1e90ff'; ctx.fillRect(t.x - t.w / 2, gy - 12, 10, 5); ctx.fillRect(t.x + t.w / 2 - 10, gy - 12, 10, 5);
    ctx.fillStyle = '#222'; ctx.fillRect(t.x - t.w / 2 + 10, ty - 2, t.w - 20, 4);

    // ball
    const b = this.ball, BC = ['#ff4757', '#ffffff', '#1e90ff', '#ffd32a'];
    ctx.save(); ctx.translate(Math.round(b.x), Math.round(gy - b.y - b.r)); ctx.rotate(b.rot);
    for (let y = -b.r; y < b.r; y += 4) for (let x = -b.r; x < b.r; x += 4) {
      if ((x + 2) ** 2 + (y + 2) ** 2 > b.r * b.r) continue;
      ctx.fillStyle = BC[Math.floor(((Math.atan2(y + 2, x + 2) + Math.PI) / (Math.PI * 2)) * 4) % 4]; ctx.fillRect(x, y, 4, 4);
    }
    ctx.restore();

    const list = [...this.chars.values()];
    this.drawActivity(ctx);
    for (const c of list) c.draw(ctx);
    for (const f of this.fx) f.draw?.(ctx);

    for (const s of this.shots) {
      if (s.kind === 'heart') drawHeart(ctx, s.x, s.y, 3, '#ff4d6d');
      else if (s.kind === 'fire') { ctx.fillStyle = '#ff6a00'; ctx.fillRect(s.x - 9, s.y - 9, 18, 18); ctx.fillStyle = '#ffd000'; ctx.fillRect(s.x - 5, s.y - 5, 10, 10); }
      else if (s.kind === 'meteor') { ctx.fillStyle = '#ff6a00'; ctx.fillRect(s.x - 16, s.y - 16, 32, 32); ctx.fillStyle = '#5a4a42'; ctx.fillRect(s.x - 12, s.y - 12, 24, 24); ctx.fillStyle = '#3d322c'; ctx.fillRect(s.x - 4, s.y - 8, 8, 8); }
      else { ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x - 14, s.y - 2, 28, 4); }
    }

    for (const p of this.parts) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 2);
      if (p.kind === 'heart') drawHeart(ctx, p.x, p.y, p.size, p.color);
      else if (p.kind === 'text') {
        ctx.font = `700 ${p.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000'; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
      } else { ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    }
    ctx.globalAlpha = 1;

    for (const c of list) c.drawLabel(ctx);
    this.drawHud(ctx);

    if (this.banner) {
      ctx.globalAlpha = Math.min(1, this.banner.t * 2);
      ctx.font = `700 48px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 8; ctx.lineJoin = 'round';
      const by = Math.max(60, top + 50) + Math.sin(this.time * 6) * 4;
      ctx.strokeStyle = '#000'; ctx.strokeText(this.banner.text, W / 2, by);
      ctx.fillStyle = '#ffd32a'; ctx.fillText(this.banner.text, W / 2, by);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'start';
  }
}
