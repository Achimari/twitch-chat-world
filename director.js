// Event director: one major event at a time, server-owned activity lifecycles, and automatic scheduling.
// Pure logic: clock, randomness, output and settings are injected so tests can drive it without real timers.
//
// Lifecycle: idle -> enroll -> active -> result -> idle, then a 4-7 minute gap before the next one.
//   ufo:  enroll = !play, active = !hide, result = who escaped
//   race: enroll = !bet red|blue N (play coins), active = the race (bets locked), result = pool split or refund
// Quick events (meteor, party, ...) only claim a short lock. Anything that arrives while the slot is taken is
// rejected, never queued.
import { randomInt } from 'node:crypto';
import { Wallet, payouts } from './wallet.js';

export const ACTIVITIES = ['ufo', 'race'];
export const SIDES = ['red', 'blue'];
const NAMES = { ufo: 'UFO escape', race: 'Goofy race' };
const COUNTDOWN_MS = 1500, WIN_MS = 5500, STUMBLE_MS = 450; // race timeline shared by every renderer
export const EVENT_SECONDS = { meteor: 7, party: 10, stampede: 6, crown: 3, confetti: 3, groupjump: 3 };
const INTENSITY = { calm: 1.5, normal: 1, lively: 0.7 }; // multiplies the gap between automatic activities
export const INTENSITIES = Object.keys(INTENSITY);
const QUIET_MS = 60000;  // after an activity, automatic quick events wait at least this long
const MAX_PLAYERS = 200;

export class Director {
  // settings() -> { enabled, sessionActive, paused, demo, minMinutes, maxMinutes, minChatters, intensity, enrollSeconds, hideSeconds, resultSeconds }
  // eligible() -> number of recent distinct chatters that count for automatic scheduling
  // coin() picks the race winner (0 = red, 1 = blue). Production uses node:crypto; tests inject it.
  constructor({ now = Date.now, random = Math.random, coin = () => randomInt(2), emit = () => {}, settings, eligible = () => 0 }) {
    Object.assign(this, { now, random, coin, emit, settings, eligible });
    this.wallet = new Wallet();
    this.lastType = null;
    this.ev = null;
    this.lock = null;          // { name, until } for quick events
    this.seq = 0;
    this.emptyStreak = 0;      // invitations nobody joined in a row: backs off the next one
    this.quietUntil = 0;
    this.stars = new Map();    // login -> session-only escape stars
    this.stats = { invites: 0, entrants: new Set(), completions: 0, empty: 0, canceled: 0 };
    this.reschedule();
  }

  reschedule() {
    const s = this.settings();
    const min = s.minMinutes * 60000, max = s.maxMinutes * 60000;
    this.nextAt = this.now() + (min + this.random() * (max - min)) * (INTENSITY[s.intensity] || 1) * (1 + this.emptyStreak);
  }
  busy() {
    if (this.ev) return `${NAMES[this.ev.type]} is running`;
    if (this.lock && this.lock.until > this.now()) return `${this.lock.name} is running`;
    return null;
  }
  // Claim the major-event slot for a quick event. Returns a reason when rejected.
  claim(name) {
    const b = this.busy();
    if (b) return b;
    this.lock = { name, until: this.now() + (EVENT_SECONDS[name] ?? 5) * 1000 };
    return null;
  }
  quiet() { return this.now() < this.quietUntil; }

  start(type = 'ufo', mode = 'manual') {
    if (!ACTIVITIES.includes(type)) return 'unknown activity';
    const s = this.settings();
    if (type === 'race' && !s.betting) return 'Race prediction is turned off';
    const b = this.busy();
    if (b) return b;
    const now = this.now();
    const id = `${now.toString(36)}-${++this.seq}`;
    this.ev = type === 'race'
      ? { id, type, mode, phase: 'enroll', endsAt: now + s.betSeconds * 1000, bets: [], race: null, result: null }
      : { id, type, mode, phase: 'enroll', endsAt: now + s.enrollSeconds * 1000, players: [], hidden: [], result: null };
    this.lastType = type;
    if (mode !== 'demo') this.stats.invites++;
    this.send('start');
    return null;
  }
  // Automatic rotation: never the same activity twice in a row when another is allowed.
  nextType() {
    const types = ACTIVITIES.filter((t) => t !== 'race' || this.settings().betting);
    const pool = types.length > 1 ? types.filter((t) => t !== this.lastType) : types;
    return pool[Math.floor(this.random() * pool.length)];
  }

  // null = acceptable; '' = not for the current event (ignore silently); other text = tell the viewer why not.
  check(login, cmd, args = []) {
    const e = this.ev;
    if (!e || e.phase !== (cmd === 'hide' ? 'active' : 'enroll')) return '';
    if (cmd === 'bet') {
      if (e.type !== 'race') return '';
      const side = String(args[0] || '').toLowerCase(), amt = String(args[1] || '');
      if (!SIDES.includes(side)) return 'Try !bet red 10 or !bet blue 10';
      if (e.bets.some((b) => b.login === login)) return 'Only one bet per race';
      return this.wallet.check(login, e.id, /^\d{1,4}$/.test(amt) ? Number(amt) : NaN);
    }
    if (e.type !== 'ufo') return '';
    const joined = e.players.some((p) => p.login === login);
    if (cmd === 'play') return !joined && e.players.length < MAX_PLAYERS ? null : '';
    if (cmd === 'hide') return joined && !e.hidden.includes(login) ? null : '';
    return '';
  }
  // Event input. Duplicates, late and wrong-phase inputs are ignored. Returns true if accepted.
  input(login, cmd, name = login, countable = true, args = []) {
    if (this.check(login, cmd, args) !== null) return false;
    const e = this.ev;
    if (cmd === 'bet') {
      const side = String(args[0]).toLowerCase(), stake = Number(args[1]);
      if (this.wallet.stake(login, e.id, stake, name)) return false;
      e.bets.push({ login, name, side, stake });
      if (countable && e.mode !== 'demo') this.stats.entrants.add(login);
      this.send('bet', login, { left: this.wallet.coins(login) });
      return true;
    }
    if (cmd === 'play') {
      e.players.push({ login, name });
      if (countable && e.mode !== 'demo') this.stats.entrants.add(login);
    } else e.hidden.push(login);
    this.send(cmd, login);
    return true;
  }
  // A participant left, was moderated, evicted or removed. Race bets stay: coins belong to the login, not the character.
  remove(login) {
    const e = this.ev;
    if (!e || e.type !== 'ufo' || !e.players.some((p) => p.login === login)) return;
    e.players = e.players.filter((p) => p.login !== login);
    e.hidden = e.hidden.filter((l) => l !== login);
    if (e.phase === 'active' && !e.players.length) return this.finish('empty');
    this.send('leave', login);
  }
  cancel() {
    this.lock = null;
    if (this.ev) this.finish('canceled');
  }

  tick() {
    const now = this.now(), e = this.ev;
    if (e) {
      if (now < e.endsAt) return;
      const s = this.settings();
      if (e.type === 'race') return this.raceTick(e, now, s);
      if (e.phase === 'enroll') {
        if (!e.players.length) return this.finish('empty');
        e.phase = 'active'; e.endsAt = now + s.hideSeconds * 1000;
        this.send('active');
      } else if (e.phase === 'active') {
        // The server alone decides who escaped. The one-time reward happens on this single transition.
        const hid = new Set(e.hidden);
        const escaped = e.players.filter((p) => hid.has(p.login)), caught = e.players.filter((p) => !hid.has(p.login));
        const stars = {};
        for (const p of escaped) { const n = (this.stars.get(p.login) || 0) + 1; this.stars.set(p.login, n); stars[p.login] = n; }
        const coins = {}; // small capped play-coin grant for taking part
        for (const p of e.players) { const n = this.wallet.grant(p.login, p.name); if (n) coins[p.login] = n; }
        e.phase = 'result'; e.endsAt = now + s.resultSeconds * 1000; e.result = { escaped, caught, stars, coins };
        this.send('result');
      } else this.finish('done');
      return;
    }
    if (now >= this.nextAt && !this.waitReason()) this.start(this.nextType(), this.settings().sessionActive ? 'live' : 'demo');
  }

  raceTick(e, now, s) {
    if (e.phase === 'enroll') {
      if (!e.bets.length) return this.finish('empty');
      // Betting is locked. Only now is the winner drawn: fair 50/50, independent of bets, balances and viewers.
      const winner = SIDES[this.coin()], loser = SIDES.find((x) => x !== winner);
      const finish = { [winner]: WIN_MS, [loser]: WIN_MS + 400 + Math.floor(this.random() * 700) };
      const stumbles = {};
      for (const side of SIDES) { // cosmetic, but chosen here so every overlay shows the same race
        const n = Math.floor(this.random() * 3);
        stumbles[side] = Array.from({ length: n }, () => 700 + Math.floor(this.random() * (WIN_MS - 2200))).sort((a, b) => a - b);
      }
      e.race = { winner, startAt: now + COUNTDOWN_MS, finish, stumbles, stumbleMs: STUMBLE_MS };
      e.phase = 'active'; e.endsAt = e.race.startAt + finish[loser] + 800;
      this.send('active');
    } else if (e.phase === 'active') {
      const pools = Object.fromEntries(SIDES.map((x) => [x, e.bets.filter((b) => b.side === x).reduce((a, b) => a + b.stake, 0)]));
      const total = pools.red + pools.blue, win = pools[e.race.winner];
      const refund = !win ? 'Nobody backed the winner: all stakes refunded' : win === total ? 'Everyone picked the same side: all stakes refunded' : null;
      const credits = refund ? new Map(e.bets.map((b) => [b.login, b.stake])) : payouts(e.bets, e.race.winner);
      this.wallet.settle(e.id, credits); // once only: a second call finds nothing held
      e.phase = 'result'; e.endsAt = now + s.resultSeconds * 1000;
      e.result = { winner: e.race.winner, pools, refund, returns: e.bets.map((b) => ({ login: b.login, name: b.name, side: b.side, stake: b.stake, ret: credits.get(b.login) || 0, coins: this.wallet.coins(b.login) })) };
      this.send('result');
    } else this.finish('done');
  }

  // A new stream session starts a fresh economy (and fresh stars/stats). Unsettled stakes are refunded first.
  newSession() {
    this.cancel();
    this.wallet.reset();
    this.stars.clear();
    this.stats = { invites: 0, entrants: new Set(), completions: 0, empty: 0, canceled: 0 };
  }

  finish(outcome) {
    const { id, mode, type } = this.ev;
    if (type === 'race') this.wallet.refund(id); // no-op if already settled; refunds on cancel/stop/channel change
    this.ev = null;
    this.lock = null;
    if (mode !== 'demo') this.stats[{ done: 'completions', empty: 'empty' }[outcome] || 'canceled']++;
    if (outcome === 'empty') this.emptyStreak = Math.min(3, this.emptyStreak + 1);
    else if (outcome === 'done') this.emptyStreak = 0;
    this.quietUntil = this.now() + QUIET_MS;
    this.reschedule();
    this.emit({ t: 'ev', ev: null, cue: outcome, id, now: this.now() });
  }

  // Why an automatic activity isn't starting (null = it starts once nextAt passes).
  waitReason() {
    const s = this.settings();
    if (!s.enabled) return 'Activities are turned off';
    if (s.paused) return 'Automatic events are paused';
    if (!s.sessionActive && !s.demo) return 'Stream session is not active';
    const b = this.busy();
    if (b) return b;
    const n = this.eligible();
    if (n < s.minChatters) return `Waiting for ${s.minChatters} recent chatter${s.minChatters > 1 ? 's' : ''} (${n} now)`;
    return null;
  }

  public() { return this.ev && structuredClone(this.ev); }
  send(cue, login = null, extra = {}) { this.emit({ t: 'ev', ev: this.public(), cue, login, now: this.now(), ...extra }); }
  status() {
    const st = this.stats;
    return {
      running: this.ev ? this.ev.type : this.busy(), reason: this.ev ? null : this.waitReason(), nextAt: Math.round(this.nextAt),
      eligible: this.eligible(), backoff: this.emptyStreak, session: this.wallet.session, leaderboard: this.wallet.top(5),
      stats: { invites: st.invites, entrants: st.entrants.size, completions: st.completions, empty: st.empty, canceled: st.canceled },
    };
  }
}
