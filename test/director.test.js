// Event director lifecycle, scheduling and fairness, driven by a fake clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Director } from '../director.js';

function setup(over = {}) {
  let t = 1_000_000;
  const msgs = [];
  const s = { enabled: true, sessionActive: true, paused: false, demo: false, minMinutes: 4, maxMinutes: 7, minChatters: 1, intensity: 'normal', enrollSeconds: 25, hideSeconds: 20, resultSeconds: 6, ...over };
  const env = { eligible: 3 };
  const d = new Director({ now: () => t, random: () => 0.5, emit: (m) => msgs.push(m), settings: () => s, eligible: () => env.eligible });
  const advance = (sec) => { t += sec * 1000; d.tick(); };
  return { d, s, env, msgs, advance, now: () => t, cues: () => msgs.map((m) => m.cue) };
}

test('zero entrants: ends quietly, backs off the next invitation', () => {
  const { d, advance, cues, now } = setup();
  assert.equal(d.start(), null);
  const plainGap = d.nextAt - now();
  advance(25);
  assert.equal(d.ev, null);
  assert.deepEqual(cues(), ['start', 'empty']);
  assert.equal(d.stats.empty, 1);
  assert.equal(d.emptyStreak, 1);
  assert.ok(d.nextAt - now() > plainGap * 1.9, 'next invitation waits longer');
});

test('one entrant who hides escapes and gets exactly one star', () => {
  const { d, advance, cues } = setup();
  d.start();
  assert.equal(d.input('alice', 'play'), true);
  advance(25);
  assert.equal(d.ev.phase, 'active');
  assert.equal(d.input('alice', 'hide'), true);
  advance(20);
  assert.equal(d.ev.phase, 'result');
  assert.deepEqual(d.ev.result.escaped.map((p) => p.login), ['alice']);
  assert.deepEqual(d.ev.result.stars, { alice: 1 });
  advance(1); advance(1); // ticks during result must not re-award
  assert.equal(d.stars.get('alice'), 1);
  advance(6);
  assert.equal(d.ev, null);
  assert.deepEqual(cues(), ['start', 'play', 'active', 'hide', 'result', 'done']);
  assert.equal(d.stats.completions, 1);
});

test('many entrants: hidden escape, the rest are caught; duplicates, late and wrong-phase inputs ignored', () => {
  const { d, advance } = setup();
  d.start();
  assert.equal(d.input('bob', 'hide'), false, 'hide during enrollment');
  for (const l of ['a', 'b', 'c', 'd']) assert.equal(d.input(l, 'play'), true);
  assert.equal(d.input('a', 'play'), false, 'duplicate join');
  advance(25);
  assert.equal(d.input('late', 'play'), false, 'join after enrollment');
  assert.equal(d.input('outsider', 'hide'), false, 'non-participant hide');
  assert.equal(d.input('a', 'hide'), true);
  assert.equal(d.input('a', 'hide'), false, 'repeat hide');
  assert.equal(d.input('c', 'hide'), true);
  advance(20);
  assert.equal(d.input('b', 'hide'), false, 'hide after deadline');
  assert.deepEqual(d.ev.result.escaped.map((p) => p.login), ['a', 'c']);
  assert.deepEqual(d.ev.result.caught.map((p) => p.login), ['b', 'd']);
  assert.equal(d.stats.entrants.size, 4);
});

test('one major event at a time, nothing queued', () => {
  const { d, advance } = setup();
  assert.equal(d.claim('meteor'), null);
  assert.match(d.start(), /meteor/);
  assert.match(d.claim('party'), /meteor/);
  advance(8);
  assert.equal(d.start(), null);
  assert.match(d.claim('party'), /UFO/);
  assert.match(d.start(), /UFO/);
  d.cancel();
  assert.equal(d.ev, null);
  assert.equal(d.busy(), null);
  assert.equal(d.stats.canceled, 1);
});

test('participant removal; last active player leaving ends the event', () => {
  const { d, advance, cues } = setup();
  d.start();
  d.input('a', 'play'); d.input('b', 'play');
  d.remove('a');
  assert.deepEqual(d.ev.players.map((p) => p.login), ['b']);
  advance(25);
  d.input('b', 'hide');
  d.remove('b');
  assert.equal(d.ev, null);
  assert.equal(cues().at(-1), 'empty');
  d.remove('nobody'); // no event: harmless
});

test('automatic scheduling needs session, chatters, no pause; demo path is separate', () => {
  const { d, s, env, advance } = setup({ sessionActive: false });
  advance(8 * 60);
  assert.equal(d.ev, null);
  assert.match(d.waitReason(), /session/);
  s.demo = true;
  advance(1);
  assert.equal(d.ev?.mode, 'demo', 'demo mode runs automatic events without a live session');
  assert.equal(d.stats.invites, 0, 'demo runs are not counted');
  d.cancel();
  s.demo = false; s.sessionActive = true; s.paused = true;
  advance(8 * 60);
  assert.equal(d.ev, null);
  assert.match(d.waitReason(), /paused/);
  s.paused = false; env.eligible = 0;
  advance(8 * 60);
  assert.match(d.waitReason(), /Waiting for 1/);
  env.eligible = 2;
  advance(1);
  assert.equal(d.ev?.mode, 'live');
});

test('gap respects interval and intensity', () => {
  const { d, s, now } = setup({ intensity: 'calm' });
  d.reschedule();
  assert.equal(Math.round(d.nextAt - now()), 495000);
  s.intensity = 'lively'; d.reschedule();
  assert.equal(Math.round(d.nextAt - now()), 231000);
});

test('every message carries the full public event, so any client (or a snapshot) can rebuild it', () => {
  const { d, msgs, advance } = setup();
  d.start(); d.input('a', 'play'); advance(25); d.input('a', 'hide');
  assert.deepEqual(msgs.at(-1).ev, d.public());
  const snap = d.public();
  snap.players.push({ login: 'x' }); // mutating a snapshot can't change server state
  assert.equal(d.ev.players.length, 1);
});
