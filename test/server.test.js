// Server integration: real HTTP + two SSE clients, chat routing, cooldown interplay, locks, moderation, channel reset.
// The director's clock is faked; config goes to a temp file so your config.json is never touched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chatworld-'));
process.env.CHAT_WORLD_CONFIG = path.join(tmp, 'config.json');
const { server, director, handleChat, applyConfig, users } = await import('../server.js');

let base, t = 5_000_000;
const clients = [];
director.now = () => t;
const advance = (sec) => { t += sec * 1000; director.tick(); };

function sse() {
  const ctl = new AbortController(), msgs = [];
  const ready = fetch(base + '/events', { signal: ctl.signal }).then(async (res) => {
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            for (const line of chunk.split('\n')) if (line.startsWith('data: ')) msgs.push(JSON.parse(line.slice(6)));
          }
        }
      } catch {}
    })();
    while (!msgs.length) await new Promise((r) => setTimeout(r, 5));
  });
  const c = { msgs, close: () => ctl.abort(), ready };
  clients.push(c);
  return c;
}
const settle = () => new Promise((r) => setTimeout(r, 30));
const post = (route, body = {}) => fetch(`${base}/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const chat = (login, text, source = 'twitch') => handleChat({ login, name: login, text }, source);
const evs = (c) => c.msgs.filter((m) => m.t === 'ev');

before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  applyConfig({ twitchEnabled: false, director: { sessionActive: false } });
});
after(() => { for (const c of clients) c.close(); server.closeAllConnections(); server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('UFO escape end to end: two clients agree, cooldowns don\'t block event input, refresh restores state', async () => {
  const a = sse(), b = sse();
  await Promise.all([a.ready, b.ready]);
  applyConfig({ spawnOnChat: false });

  assert.deepEqual(await post('event', { name: 'ufo' }), { ok: true });
  chat('alice', 'hello');
  assert.equal(users.has('alice'), false, 'spawn-on-chat off');
  chat('alice', '!play');
  assert.equal(users.has('alice'), true, '!play spawns even with spawn-on-chat off');
  chat('bob', '!join'); chat('bob', '!dance'); chat('bob', '!play'); // !play right after a command still counts
  chat('bob', '!play'); chat('bob', '!play');
  chat('nightbot', '!play');
  chat('carol', '!hide');
  assert.deepEqual(director.ev.players.map((p) => p.login), ['alice', 'bob']);

  advance(25);
  chat('bob', '!jump'); chat('bob', '!hide');
  chat('bob', '!hide');
  chat('carol', '!hide');
  assert.deepEqual(director.ev.hidden, ['bob']);

  advance(20);
  assert.deepEqual(director.ev.result.escaped.map((p) => p.login), ['bob']);
  await settle();
  const late = sse(); // OBS refresh mid-result
  await late.ready;
  const snap = late.msgs[0];
  assert.equal(snap.t, 'state');
  assert.deepEqual(snap.ev, evs(a).at(-1).ev, 'snapshot = latest live event state');
  assert.equal(snap.users.find((u) => u.login === 'bob').stars, 1);
  assert.equal(evs(late).length, 0, 'a reconnect gets a snapshot, not a replay of cues');

  advance(6);
  await settle();
  assert.equal(director.ev, null);
  assert.deepEqual(evs(a), evs(b), 'both overlays saw identical participants, decisions, deadlines and result');
  assert.deepEqual(evs(a).map((m) => m.cue), ['start', 'play', 'play', 'active', 'hide', 'result', 'done']);
  const st = await fetch(base + '/api/state').then((r) => r.json());
  assert.equal(st.users.find((u) => u.login === 'bob').stars, 1, 'no duplicate reward from repeated snapshots');
  applyConfig({ spawnOnChat: true });
});

test('competing triggers are rejected while an activity runs; skip releases', async () => {
  assert.equal((await post('event', { name: 'ufo' })).ok, true);
  assert.match((await post('event', { name: 'meteor' })).reason, /UFO/);
  assert.match((await post('meme', { value: 'party' })).reason, /UFO/, 'voice trigger');
  assert.match((await post('event', { name: 'ufo' })).reason, /UFO/);
  const c = sse(); await c.ready;
  chat('dave', '!party');
  await settle();
  assert.equal(c.msgs.some((m) => m.t === 'cmd' && m.cmd === 'party'), false, '!party command rejected');
  await post('skip');
  assert.equal(director.ev, null);
  assert.equal((await post('event', { name: 'confetti' })).ok, true);
  t += 10000;
});

test('moderation, removal and channel change release participants', async () => {
  await post('event', { name: 'ufo' });
  chat('erin', '!play'); chat('frank', '!play');
  await post('remove', { login: 'erin' });
  assert.deepEqual(director.ev.players.map((p) => p.login), ['frank']);
  applyConfig({ channel: 'someoneelse' });
  assert.equal(director.ev, null, 'activity canceled on channel change');
  assert.equal(users.size, 0, 'old channel characters cleared');
  assert.equal(director.status().eligible, 0);
});

test('demo/test chatters never count as live audience; stop effects pauses until resumed', async () => {
  chat('pixelpete', 'hi', 'demo');
  chat('tester', 'hi', 'test');
  assert.equal(director.status().eligible, 0);
  chat('realviewer', 'hi', 'twitch');
  assert.equal(director.status().eligible, 1);

  await post('event', { name: 'ufo' });
  const c = sse(); await c.ready;
  await post('stop');
  await settle();
  assert.equal(director.ev, null);
  assert.ok(c.msgs.some((m) => m.t === 'stop'));
  assert.equal(director.status().reason, 'Automatic events are paused');
  applyConfig({ director: { paused: false, sessionActive: true } });
  assert.equal(director.status().reason, null);
  t = director.nextAt;
  director.tick();
  assert.equal(director.ev?.mode, 'live', 'automatic activity starts when everything allows it');
  director.cancel();
});

test('race over HTTP: bets through chat, feedback, cooldown bypass, refresh mid-race, refund on stop', async () => {
  applyConfig({ director: { paused: false } });
  director.coin = () => 1; // blue wins (production draws with node:crypto)
  const c = sse(); await c.ready;
  assert.deepEqual(await post('event', { name: 'race' }), { ok: true });
  chat('gina', '!dance'); chat('gina', '!bet blue 15'); // right after a command: still accepted
  chat('gina', '!bet blue 15');                       // duplicate
  chat('hank', '!bet red 50');                        // oversized -> note
  chat('hank', '!bet red 6');
  chat('ivy', '!bet purple 3');
  await settle();
  assert.deepEqual(director.ev.bets.map((b) => [b.login, b.side, b.stake]), [['gina', 'blue', 15], ['hank', 'red', 6]]);
  assert.ok(c.msgs.some((m) => m.t === 'note' && m.login === 'hank' && /1 to 20/.test(m.text)));
  assert.ok(c.msgs.some((m) => m.t === 'note' && m.login === 'ivy' && /!bet red 10/.test(m.text)));
  assert.equal(c.msgs.find((m) => m.cue === 'bet' && m.login === 'gina').left, 85);
  t = director.ev.endsAt; director.tick();
  const late = sse(); await late.ready; // OBS refresh mid-race gets the same timeline
  assert.deepEqual(late.msgs[0].ev.race, director.ev.race);
  t = director.ev.endsAt; director.tick();
  assert.deepEqual(director.ev.result.returns.map((x) => [x.login, x.ret]), [['gina', 21], ['hank', 0]]);
  t = director.ev.endsAt; director.tick();
  assert.deepEqual([director.wallet.coins('gina'), director.wallet.coins('hank')], [106, 94]);
  chat('hank', '!coins'); // bets never touched hank's ordinary command cooldown
  await settle();
  assert.equal(c.msgs.findLast((m) => m.t === 'cmd' && m.cmd === 'coins').data, 94);

  t += 10000;
  await post('event', { name: 'race' });
  chat('gina', '!bet red 20');
  await post('stop');
  assert.equal(director.wallet.coins('gina'), 106, 'stop refunds unsettled stakes');
  applyConfig({ director: { sessionActive: false } });
  applyConfig({ director: { sessionActive: true, paused: false } });
  assert.equal(director.wallet.coins('gina'), 100, 'new stream session resets the economy');
  director.cancel();
});

test('config migration: old config without audio/director gets defaults; sessionActive is never saved', () => {
  const saved = JSON.parse(fs.readFileSync(process.env.CHAT_WORLD_CONFIG, 'utf8'));
  assert.equal(saved.director.sessionActive, false);
  assert.equal(saved.audio.master, 0.25);
  assert.equal(saved.audio.maxVoices, 4);
  applyConfig({ audio: { master: 7, maxVoices: -3 }, director: { intensity: 'bogus', enrollSeconds: 1 } });
  const s2 = JSON.parse(fs.readFileSync(process.env.CHAT_WORLD_CONFIG, 'utf8'));
  assert.equal(s2.audio.master, 1);
  assert.equal(s2.audio.maxVoices, 1);
  assert.equal(s2.director.intensity, 'normal');
  assert.equal(s2.director.enrollSeconds, 10);
});
