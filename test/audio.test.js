// Sound policy and manager gating. Uses a stub AudioContext: this proves the rules, not real playback or OBS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoundPolicy, AudioManager, SOUNDS } from '../public/audio.js';

const def = (pri, gap = 0, dur = 1) => ({ pri, gap, dur });

test('voice limit: higher priority steals the lowest, equal or lower is dropped', () => {
  const p = new SoundPolicy(2, 100);
  let stopped = 0;
  const a = p.admit('a', def(1), 0); a.voice.stop = () => stopped++;
  p.admit('b', def(2), 1);
  assert.equal(p.admit('c', def(1), 2).why, 'voices', 'ambient never cuts an impact');
  assert.equal(p.admit('d', def(2), 3).ok, true, 'impact replaces the ambient voice');
  assert.equal(stopped, 1);
  assert.equal(p.admit('e', def(2), 4).why, 'voices', 'equal priority does not cut off');
  assert.equal(p.admit('f', def(3), 5).ok, true, 'result replaces the oldest impact');
  assert.deepEqual(p.voices.map((v) => v.name), ['d', 'f']);
  assert.equal(p.admit('f', def(1), 2000).ok, true, 'finished voices free their slot');
});

test('repeat gap and per-second budget; results bypass the budget', () => {
  const p = new SoundPolicy(10, 3);
  assert.equal(p.admit('x', def(1, 200), 0).ok, true);
  assert.equal(p.admit('x', def(1, 200), 100).why, 'repeat');
  p.admit('y', def(1), 110); p.admit('z', def(1), 120);
  assert.equal(p.admit('w', def(2), 130).why, 'budget');
  assert.equal(p.admit('win', def(3), 140).ok, true);
  assert.equal(p.admit('w', def(2), 1200).ok, true, 'budget window slides');
});

test('every sound in the pack has valid metadata', () => {
  for (const [k, s] of Object.entries(SOUNDS)) {
    assert.ok(['action', 'event'].includes(s.cat), k);
    assert.ok([1, 2, 3].includes(s.pri), k);
    assert.ok(s.dur > 0 && s.dur <= 2 && s.gap >= 0 && typeof s.fn === 'function', k);
  }
});

// Anything-goes stub: every property/call returns another stub, so the synthesis code runs without a browser.
function stub() {
  const f = function () {};
  const p = new Proxy(f, { get: (t, k) => (k in t ? t[k] : (t[k] = stub())), apply: () => stub() });
  return p;
}
function fakeContext(state) {
  const ctx = stub();
  Object.assign(ctx, { state, currentTime: 0, sampleRate: 100, createBuffer: () => ({ getChannelData: () => new Float32Array(100) }), resume: async () => { ctx.state = 'running'; ctx.onstatechange?.(); } });
  return ctx;
}

test('blocked context drops sounds and replays nothing after unlock', async () => {
  let t = 0;
  const ctx = fakeContext('suspended');
  const a = new AudioManager({ makeContext: () => ctx, now: () => t });
  assert.equal(a.state(), 'blocked');
  for (let i = 0; i < 20; i++) assert.equal(a.play('punch'), false);
  assert.equal(await a.unlock(), 'ready');
  assert.equal(a.policy.voices.length, 0, 'no backlog after unlock');
  t = 1000;
  assert.equal(a.play('punch'), true);
  assert.equal(a.play('nope'), false, 'unknown sound');
});

test('silent preview, disabled sound, levels and stop all', () => {
  const ctx = fakeContext('running');
  const silent = new AudioManager({ silent: true, makeContext: () => ctx });
  assert.equal(silent.state(), 'silent');
  assert.equal(silent.play('win'), false);
  silent.setSilent(false);
  assert.equal(silent.state(), 'ready');

  const a = new AudioManager({ makeContext: () => fakeContext('running'), now: () => 0 });
  a.setConfig({ master: 0.4, action: 0.5 });
  assert.equal(a.out.gain.value, 0.4);
  assert.equal(a.bus.action.gain.value, 0.5);
  assert.equal(a.play('win'), true);
  a.stopAll();
  assert.equal(a.policy.voices.length, 0);
  a.setConfig({ enabled: false });
  assert.equal(a.state(), 'off');
  assert.equal(a.play('win'), false);
});

test('media obeys the same policy: blocked video stays muted, rejected mp3 frees its voice', async () => {
  const listeners = {};
  const el = (tag, playOk) => ({ tagName: tag, muted: true, volume: 1, pause() {}, play: () => (playOk ? Promise.resolve() : Promise.reject(new Error('blocked'))), addEventListener: (k, fn) => { listeners[k] = fn; } });
  const blocked = new AudioManager({ makeContext: () => fakeContext('suspended') });
  const v = el('VIDEO', true);
  assert.equal(blocked.media(v), false);
  assert.equal(v.muted, true);

  const a = new AudioManager({ makeContext: () => fakeContext('running'), now: () => 0 });
  a.setConfig({ master: 0.5, media: 0.5 });
  const mp3 = el('AUDIO', false);
  assert.equal(a.media(mp3), true);
  assert.equal(mp3.volume, 0.25);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(a.policy.voices.length, 0, 'rejected playback released the voice');
});
