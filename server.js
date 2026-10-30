// Chat World server: Twitch chat -> presence/cooldowns -> overlays (SSE). Zero dependencies, Node 22+.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, EVENTS, ENVIRONMENTS, VOICE_PRESETS } from './public/commands.js';
import { Director, ACTIVITIES, INTENSITIES } from './director.js';

if (typeof WebSocket === 'undefined') {
  console.error(`\n  Chat World needs Node.js 22 or newer (you have ${process.version}).\n  Install the LTS from https://nodejs.org, open a new terminal, and run npm start again.\n`);
  process.exit(1);
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, 'public');
const CONFIG_FILE = process.env.CHAT_WORLD_CONFIG || path.join(ROOT, 'config.json'); // env override is for tests

const DEFAULTS = {
  channel: 'achimari',
  twitchEnabled: true,
  demo: false,
  host: '127.0.0.1',
  port: 7272,
  spawnOnChat: true,
  maxCharacters: 60,
  inactiveMinutes: 10,
  characterSize: 3,
  animationSpeed: 1,
  autoMove: true,
  environment: 'meadow',
  worldHeight: 260,
  bottomOffset: 0,
  showBubbles: true,
  maxParticles: 800,
  userCooldownMs: 1500,
  ignoreUsers: ['nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot', 'wizebot', 'sery_bot'],
  events: { enabled: true, minSeconds: 180, maxSeconds: 420, types: Object.fromEntries(EVENTS.map((e) => [e, true])) },
  commands: Object.fromEntries(Object.entries(COMMANDS).map(([k, d]) => [k, { enabled: true, cooldown: d.cooldown }])),
  voice: structuredClone(VOICE_PRESETS.english),
  audio: { enabled: true, master: 0.25, action: 0.8, event: 0.9, media: 0.8, maxVoices: 4, perSecond: 6 },
  // sessionActive is never saved: automatic activities need it switched on again after every restart.
  director: { enabled: true, sessionActive: false, paused: false, minMinutes: 4, maxMinutes: 7, minChatters: 1, recentMinutes: 10,
    intensity: 'normal', enrollSeconds: 25, hideSeconds: 20, resultSeconds: 6, hudOffset: 0,
    betting: true, betSeconds: 30 }, // goofy race prediction with free session-only play coins
};
const LIMITS = { port: [1, 65535], maxCharacters: [1, 150], inactiveMinutes: [1, 240], characterSize: [1, 8], animationSpeed: [0.25, 3], worldHeight: [80, 1080], bottomOffset: [0, 900], maxParticles: [0, 3000], userCooldownMs: [0, 60000] };

// Only keys that exist in base, with the same type, are accepted. This is the config sanitizer.
function merge(base, patch) {
  const out = structuredClone(base);
  if (!patch || typeof patch !== 'object') return out;
  for (const k of Object.keys(base)) {
    const b = base[k], p = patch[k];
    if (p === undefined) continue;
    if (Array.isArray(b)) { if (Array.isArray(p)) out[k] = p.map((s) => String(s).toLowerCase().trim()).filter(Boolean).slice(0, 500); }
    else if (b && typeof b === 'object') out[k] = merge(b, p);
    else if (typeof p === typeof b && (typeof p !== 'number' || Number.isFinite(p))) out[k] = p;
  }
  return out;
}
const clean = (s, max) => String(s ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').trim().slice(0, max);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function normalize(c) {
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) c[k] = clamp(c[k], lo, hi);
  c.channel = c.channel.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);
  if (!ENVIRONMENTS.includes(c.environment)) c.environment = DEFAULTS.environment;
  c.events.minSeconds = clamp(c.events.minSeconds, 10, 7200);
  c.events.maxSeconds = clamp(c.events.maxSeconds, c.events.minSeconds, 7200);
  for (const v of Object.values(c.commands)) v.cooldown = clamp(v.cooldown, 0, 3600);
  c.voice.lang = clean(c.voice.lang, 20) || 'en-US';
  const a = c.audio, d = c.director;
  for (const k of ['master', 'action', 'event', 'media']) a[k] = clamp(a[k], 0, 1);
  a.maxVoices = clamp(Math.round(a.maxVoices), 1, 16); a.perSecond = clamp(Math.round(a.perSecond), 1, 30);
  d.minMinutes = clamp(d.minMinutes, 1, 120); d.maxMinutes = clamp(d.maxMinutes, d.minMinutes, 240);
  d.minChatters = clamp(Math.round(d.minChatters), 1, 50); d.recentMinutes = clamp(d.recentMinutes, 1, 60);
  if (!INTENSITIES.includes(d.intensity)) d.intensity = 'normal';
  d.enrollSeconds = clamp(d.enrollSeconds, 10, 120); d.hideSeconds = clamp(d.hideSeconds, 5, 120);
  d.resultSeconds = clamp(d.resultSeconds, 3, 20); d.hudOffset = clamp(d.hudOffset, -600, 600); d.betSeconds = clamp(d.betSeconds, 15, 120);
  return c;
}

let cfg;
try { cfg = normalize(merge(DEFAULTS, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')))); }
catch (e) { if (e.code !== 'ENOENT') console.warn('config.json unreadable, using defaults:', e.message); cfg = normalize(merge(DEFAULTS, {})); }
if (!fs.existsSync(CONFIG_FILE)) saveConfig();
if (process.argv.includes('--demo')) cfg.demo = true;
// demo is never persisted, so fake viewers can't show up on a real stream after a restart
function saveConfig() { fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...cfg, demo: false, director: { ...cfg.director, sessionActive: false } }, null, 2)); }

// ---------- overlays (Server-Sent Events) ----------
const clients = new Set();
function broadcast(msg) {
  const s = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(s);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000).unref();

// ---------- presence ----------
const users = new Map();     // login -> { login, name, color, variant, lastSeen, lastCmd }
const variants = new Map();  // login -> appearance variant; survives leave/return for this session
const cooldowns = new Map(); // "login:cmd" or "cmd" -> ready-at ms
const recent = new Map();    // login -> last Twitch chat ms. Only real chat counts towards automatic activities.
let crownLogin = null, recentCrowns = [];
const pub = (u) => ({ login: u.login, name: u.name, color: u.color, variant: u.variant, stars: director.stars.get(u.login) || 0 });
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function spawn(login, name, color) {
  if (users.size >= cfg.maxCharacters) {
    const idlest = [...users.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0];
    removeUser(idlest.login, 'evicted');
  }
  const u = { login, name, color, variant: variants.get(login) || 0, lastSeen: Date.now(), lastCmd: 0 };
  users.set(login, u);
  broadcast({ t: 'spawn', user: pub(u) });
  return u;
}
function removeUser(login, reason) {
  if (!users.delete(login)) return;
  broadcast({ t: 'despawn', login, reason });
  director.remove(login);
  if (crownLogin === login) crownLogin = null;
}

let winStart = 0, winCount = 0;
const overGlobalLimit = () => { const n = Date.now(); if (n - winStart > 1000) { winStart = n; winCount = 0; } return ++winCount > 25; };

// source: 'twitch' (real chat), 'demo' (fake viewers) or 'test' (dashboard test chat, skips cooldowns)
function handleChat({ login, name, color, text }, source = 'twitch') {
  login = String(login || '').toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(login) || cfg.ignoreUsers.includes(login)) return;
  const test = source === 'test';
  name = clean(name, 25) || login;
  color = /^#[0-9a-f]{6}$/i.test(color || '') ? color : null;
  text = clean(text, 300);
  const m = text.match(/^!(\w+)(?:\s+@?(\w+))?/);
  const cmd = m?.[1].toLowerCase();
  const def = Object.hasOwn(COMMANDS, cmd ?? '') ? COMMANDS[cmd] : null;
  const now = Date.now();

  if (source === 'twitch') recent.set(login, now);

  let u = users.get(login);
  if (cmd === 'leave' && def) return u && removeUser(login, 'leave');
  // !play / !hide / !bet: only during the right phase, deduplicated by the director, and outside the ordinary
  // per-user cooldowns so a preceding !dance can't swallow them. The global spam cap still applies.
  if (def?.activity) {
    if (!cfg.commands[cmd].enabled) return;
    const args = text.split(/\s+/).slice(1), why = director.check(login, cmd, args);
    if (why === '' || overGlobalLimit()) return;
    if (!u && (why === null || cfg.spawnOnChat)) u = spawn(login, name, color); // opting in spawns you even with spawn-on-chat off
    if (!u) return;
    u.name = name; if (color) u.color = color;
    u.lastSeen = now;
    if (why) return note(login, why); // e.g. "Not enough coins (you have 4)"
    director.input(login, cmd, u.name, source !== 'demo', args);
    return;
  }
  if (!u) {
    if (!cfg.spawnOnChat && cmd !== 'join') return;
    u = spawn(login, name, color);
  } else {
    u.name = name;
    if (color) u.color = color;
  }
  u.lastSeen = now;

  if (!def) {
    if (!text.startsWith('!')) broadcast({ t: 'chat', login, text: text.slice(0, 90) });
    return;
  }
  if (!cfg.commands[cmd].enabled) return;
  const key = def.global ? cmd : `${login}:${cmd}`;
  if (!test && (now - u.lastCmd < cfg.userCooldownMs || (cooldowns.get(key) || 0) > now)) return;
  let target = null;
  if (def.target) {
    target = m[2]?.toLowerCase();
    if (!target || target === login || !users.has(target)) return;
  }
  if (overGlobalLimit()) return;
  if (def.major && director.claim(cmd)) return; // e.g. !party while another big event is on
  u.lastCmd = now;
  cooldowns.set(key, now + cfg.commands[cmd].cooldown * 1000);
  const data = def.server?.(u, { wallet: director.wallet }) ?? null;
  variants.set(login, u.variant);
  broadcast({ t: 'cmd', cmd, user: pub(u), target, roll: Math.random(), data });
}
// Short feedback above a viewer's character (rejected bets etc.), at most one every 3 s per viewer.
const notes = new Map();
function note(login, text) {
  const now = Date.now();
  if ((notes.get(login) || 0) > now) return;
  notes.set(login, now + 3000);
  broadcast({ t: 'note', login, text });
}

setInterval(() => {
  const now = Date.now(), cutoff = now - cfg.inactiveMinutes * 60000;
  for (const u of [...users.values()]) if (u.lastSeen < cutoff) removeUser(u.login, 'inactive');
  for (const [k, t] of cooldowns) if (t < now) cooldowns.delete(k);
  for (const [k, t] of recent) if (t < now - 3600000) recent.delete(k);
  for (const [k, t] of notes) if (t < now) notes.delete(k);
  let changed = false;
  for (const [k, o] of outputs) if (o.at < now - 45000) { outputs.delete(k); changed = true; }
  if (changed) broadcastOutputs();
}, 15000).unref();

// ---------- events ----------
// Quick events (meteor, party, ...) keep their own timer. They skip a turn while paused, while another major
// event runs, or for a minute after an activity, and never repeat the previous type if another is enabled.
const DEMO_LOGINS = new Set();
const director = new Director({
  emit: (msg) => { broadcast(msg); pushStatus(); },
  settings: () => ({ ...cfg.director, demo: cfg.demo }),
  eligible: () => {
    const cut = Date.now() - cfg.director.recentMinutes * 60000;
    let n = 0;
    for (const [login, t] of recent) if (t >= cut && users.has(login)) n++;
    if (cfg.demo) for (const l of users.keys()) if (DEMO_LOGINS.has(l) && !recent.has(l)) n++;
    return n;
  },
});
let lastStatus = '';
function pushStatus() {
  const s = director.status(), j = JSON.stringify(s);
  if (j !== lastStatus) { lastStatus = j; broadcast({ t: 'director', status: s }); }
}
setInterval(() => { director.tick(); pushStatus(); }, 250).unref();

let eventTimer, lastAuto = null;
function scheduleEvents() {
  clearTimeout(eventTimer);
  const e = cfg.events;
  if (!e.enabled) return;
  const sec = e.minSeconds + Math.random() * (e.maxSeconds - e.minSeconds);
  eventTimer = setTimeout(() => {
    const on = EVENTS.filter((n) => e.types[n]);
    const types = on.length > 1 ? on.filter((n) => n !== lastAuto) : on;
    if (types.length && users.size && !cfg.director.paused && !director.quiet()) {
      const name = pick(types);
      if (!triggerEvent(name)) lastAuto = name;
    }
    scheduleEvents();
  }, sec * 1000);
  eventTimer.unref?.();
}
// Returns null when the event started, or the reason it was rejected.
function triggerEvent(name) {
  if (ACTIVITIES.includes(name)) return director.start(name, 'manual');
  if (!EVENTS.includes(name)) return 'unknown event';
  if (name === 'crown' && !users.size) return 'nobody to crown';
  const busy = director.claim(name);
  if (busy) return busy;
  const msg = { t: 'event', name };
  if (name === 'crown') { // rotate: skip the last few crowned viewers when possible
    const all = [...users.keys()], fresh = all.filter((l) => !recentCrowns.includes(l));
    crownLogin = msg.login = pick(fresh.length ? fresh : all);
    recentCrowns = [crownLogin, ...recentCrowns].slice(0, Math.min(5, all.length - 1));
  }
  broadcast(msg);
  pushStatus();
  return null;
}
// Stop effects: end the activity, pause all automatic scheduling (reversible with Resume), clear every overlay.
function stopEffects() {
  director.cancel();
  applyConfig({ director: { paused: true } });
  broadcast({ t: 'stop' });
}

// ---------- audio outputs (each overlay reports whether it can actually play sound) ----------
const outputs = new Map(); // id -> { id, label, state, at }
const AUDIO_STATES = ['ready', 'blocked', 'silent', 'off', 'unsupported'];
const broadcastOutputs = () => broadcast({ t: 'audio', outputs: [...outputs.values()] });

// ---------- Twitch chat (anonymous, read-only: no token needed or stored) ----------
let ws = null, twitchStatus = 'off', retry = 0, retryTimer, lastMsgAt = 0;
function setStatus(s) { twitchStatus = s; broadcast({ t: 'status', twitch: s }); }

function connectTwitch() {
  clearTimeout(retryTimer);
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  if (!cfg.twitchEnabled || !cfg.channel) return setStatus('off');
  setStatus('connecting');
  const sock = ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  sock.onopen = () => {
    lastMsgAt = Date.now();
    sock.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    sock.send('PASS SCHMOOPIIE');
    sock.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`);
    sock.send(`JOIN #${cfg.channel}`);
  };
  sock.onmessage = (e) => {
    lastMsgAt = Date.now();
    for (const line of String(e.data).split('\r\n')) if (line) onIrc(sock, line);
  };
  sock.onerror = () => {}; // onclose follows
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    const delay = Math.min(30000, 1000 * 2 ** retry++);
    setStatus('reconnecting');
    console.log(`Twitch disconnected, retrying in ${delay / 1000}s`);
    retryTimer = setTimeout(connectTwitch, delay);
  };
}
// Keepalive: ping every minute, drop the socket if Twitch went silent.
setInterval(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (Date.now() - lastMsgAt > 150000) ws.close();
  else ws.send('PING :tmi.twitch.tv');
}, 60000).unref();

export function parseIrc(line) {
  const tags = {};
  let rest = line;
  if (rest[0] === '@') {
    const i = rest.indexOf(' ');
    for (const kv of rest.slice(1, i).split(';')) { const j = kv.indexOf('='); tags[kv.slice(0, j)] = kv.slice(j + 1); }
    rest = rest.slice(i + 1);
  }
  let prefix = '';
  if (rest[0] === ':') { const i = rest.indexOf(' '); prefix = rest.slice(1, i); rest = rest.slice(i + 1); }
  const ti = rest.indexOf(' :');
  const trailing = ti >= 0 ? rest.slice(ti + 2) : '';
  const parts = (ti >= 0 ? rest.slice(0, ti) : rest).split(' ');
  return { tags, nick: prefix.split('!')[0], command: parts[0], params: parts.slice(1), trailing };
}

function onIrc(sock, line) {
  const m = parseIrc(line);
  switch (m.command) {
    case 'PING': sock.send(`PONG :${m.trailing}`); break;
    case 'RECONNECT': sock.close(); break;
    case 'ROOMSTATE': retry = 0; if (twitchStatus !== 'connected') { setStatus('connected'); console.log(`Twitch: joined #${cfg.channel}`); } break;
    case 'CLEARCHAT': if (m.trailing) removeUser(m.trailing.toLowerCase(), 'moderated'); break;
    case 'PRIVMSG': {
      const text = m.trailing.replace(/^\u0001ACTION (.*)\u0001$/, '$1');
      handleChat({ login: m.tags.login || m.nick, name: m.tags['display-name'], color: m.tags.color, text }, 'twitch');
      break;
    }
  }
}

// ---------- demo mode ----------
const DEMO_NAMES = ['PixelPete', 'MossyMuffin', 'ByteBandit', 'Captain_Noodle', 'LunaLoops', 'TurboTaco', 'SirSnaccs', 'GlitchGoblin', 'NeonNarwhal', 'PotatoPilot', 'Fizzwick', 'QuietQuokka', 'RetroRaccoon', 'CosmicCrumpet'];
const DEMO_CHAT = ['hello chat!', 'lets gooo', 'PogChamp', 'this overlay is so cute', 'gg', 'who wants to fight?', 'lol', 'hi achimari!', 'first time here', 'vibing'];
let demoTimer;
for (const n of DEMO_NAMES) DEMO_LOGINS.add(n.toLowerCase());
function demoTick() {
  clearTimeout(demoTimer);
  if (!cfg.demo) return;
  const name = pick(DEMO_NAMES), login = name.toLowerCase();
  let text = pick(DEMO_CHAT);
  const phase = director.ev?.phase, type = director.ev?.type;
  if (type === 'race' && phase === 'enroll' && Math.random() < 0.3) text = `!bet ${pick(['red', 'blue'])} ${1 + Math.floor(Math.random() * 20)}`;
  else if (type === 'ufo' && phase === 'enroll' && Math.random() < 0.35) text = '!play';
  else if (type === 'ufo' && phase === 'active' && Math.random() < 0.25) text = '!hide'; // some forget, so somebody gets inspected
  else if (users.has(login) && Math.random() < 0.65) {
    const cmd = pick(Object.keys(COMMANDS).filter((c) => !['leave', 'join', 'party'].includes(c) && !COMMANDS[c].activity));
    const others = [...users.keys()].filter((l) => l !== login);
    if (!COMMANDS[cmd].target || others.length) text = `!${cmd}${COMMANDS[cmd].target ? ' @' + pick(others) : ''}`;
  }
  handleChat({ login, name, text }, 'demo');
  demoTimer = setTimeout(demoTick, 500 + Math.random() * 1500);
  demoTimer.unref?.();
}
function stopDemo() {
  clearTimeout(demoTimer);
  for (const n of DEMO_NAMES) removeUser(n.toLowerCase(), 'demo');
}

// ---------- config changes ----------
function applyConfig(patch) {
  const prev = cfg;
  cfg = normalize(merge(cfg, patch));
  cfg.port = prev.port; cfg.host = prev.host; // need a restart; edit config.json
  saveConfig();
  // New stream session = fresh play-coin economy. An OBS refresh or a reconnect never resets it.
  if (cfg.director.sessionActive && !prev.director.sessionActive) director.newSession();
  // New channel = new audience: nobody, no activity and no coins carry over from the old chat.
  if (cfg.channel !== prev.channel) {
    director.newSession();
    for (const l of [...users.keys()]) removeUser(l, 'channel');
    recent.clear(); crownLogin = null; recentCrowns = [];
  }
  if (cfg.channel !== prev.channel || cfg.twitchEnabled !== prev.twitchEnabled) { retry = 0; connectTwitch(); }
  if (JSON.stringify(cfg.events) !== JSON.stringify(prev.events)) scheduleEvents();
  if (cfg.demo !== prev.demo) cfg.demo ? demoTick() : stopDemo();
  const d = cfg.director, pd = prev.director;
  if (!d.enabled || (!cfg.demo && director.ev?.mode === 'demo')) director.cancel();
  if (!director.ev && (cfg.demo !== prev.demo || ['sessionActive', 'paused', 'minMinutes', 'maxMinutes', 'intensity'].some((k) => d[k] !== pd[k]))) director.reschedule();
  while (users.size > cfg.maxCharacters) removeUser([...users.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0].login, 'evicted');
  broadcast({ t: 'config', cfg });
  pushStatus();
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const commandMeta = Object.fromEntries(Object.entries(COMMANDS).map(([k, d]) => [k, { desc: d.desc, target: !!d.target, global: !!d.global, activity: !!d.activity }]));
const state = () => ({ cfg, users: [...users.values()].map(pub), twitch: twitchStatus, commands: commandMeta, events: EVENTS, environments: ENVIRONMENTS, voicePresets: VOICE_PRESETS,
  activities: ACTIVITIES, intensities: INTENSITIES, ev: director.public(), director: director.status(), crown: crownLogin, outputs: [...outputs.values()], now: Date.now() });

function json(res, body, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function api(req, res, route) {
  if (req.method === 'GET' && route === 'state') return json(res, state());
  // Requiring a JSON content type forces a CORS preflight, which we never answer,
  // so other websites in your browser can't drive this API.
  if (req.method !== 'POST' || !String(req.headers['content-type']).startsWith('application/json')) return json(res, { error: 'bad request' }, 400);
  let body = '';
  req.on('data', (d) => { body += d; if (body.length > 65536) req.destroy(); });
  req.on('end', () => {
    let b;
    try { b = JSON.parse(body || '{}'); } catch { return json(res, { error: 'bad json' }, 400); }
    let reason = null;
    switch (route) {
      case 'config': applyConfig(b); break;
      case 'remove': removeUser(String(b.login || '').toLowerCase(), 'removed'); break;
      case 'clear': for (const l of [...users.keys()]) removeUser(l, 'removed'); break;
      case 'event': reason = triggerEvent(String(b.name)); break;
      case 'meme': { // voice triggers: an event name goes through the same one-major-event rule
        const v = clean(b.value, 120);
        if (EVENTS.includes(v) || ACTIVITIES.includes(v)) reason = triggerEvent(v);
        else if (v) broadcast({ t: 'meme', value: v, roll: Math.random() });
        break;
      }
      case 'chat': handleChat({ login: b.login, name: b.login, text: b.text }, 'test'); break;
      case 'skip': director.cancel(); break;
      case 'stop': stopEffects(); break;
      case 'sfx': broadcast({ t: 'sfx', name: 'test' }); break; // only the test sound can be triggered remotely
      case 'audio': {
        const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
        if (!id || !AUDIO_STATES.includes(b.state)) return json(res, { error: 'bad request' }, 400);
        if (!outputs.has(id) && outputs.size >= 20) outputs.delete(outputs.keys().next().value);
        const prev = outputs.get(id);
        outputs.set(id, { id, label: clean(b.label, 30) || 'overlay', state: b.state, at: Date.now() });
        if (prev?.state !== b.state || prev?.label !== outputs.get(id).label) broadcastOutputs();
        break;
      }
      default: return json(res, { error: 'not found' }, 404);
    }
    json(res, reason ? { ok: false, reason } : { ok: true });
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`retry: 2000\ndata: ${JSON.stringify({ t: 'state', ...state() })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname.startsWith('/api/')) return api(req, res, url.pathname.slice(5));
  if (url.pathname === '/') { res.writeHead(302, { Location: '/dashboard.html' }); return res.end(); }
  let file;
  try { file = path.join(PUB, path.normalize(decodeURIComponent(url.pathname))); } catch { file = ''; }
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(404); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

export { server, director, handleChat, applyConfig, users };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(cfg.port, cfg.host, () => {
    const base = `http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.port}`;
    console.log(`\n  Chat World running\n  Dashboard: ${base}/dashboard.html\n  OBS URL:   ${base}/overlay.html\n  Channel:   #${cfg.channel}${cfg.demo ? '  (demo mode on)' : ''}\n`);
    connectTwitch();
    scheduleEvents();
    if (cfg.demo) demoTick();
  });
}
