// Play-coin wallet, pool split, and the goofy race lifecycle (winner injected, so no "hope the dice behave").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Wallet, payouts, START_COINS, GRANT_CAP } from '../wallet.js';
import { Director } from '../director.js';

test('stake validation: invalid, negative, fractional, oversized, insufficient, duplicate, closed', () => {
  const w = new Wallet();
  for (const bad of [0, -5, 2.5, 21, NaN, Infinity, '10']) assert.match(w.check('a', 'r1', bad), /whole number/, String(bad));
  assert.equal(w.stake('a', 'r1', 20), null);
  assert.match(w.stake('a', 'r1', 5), /one bet/);
  w.account('poor').coins = 3;
  assert.match(w.stake('poor', 'r1', 4), /Not enough coins \(you have 3\)/);
  w.refund('r1');
  assert.match(w.stake('b', 'r1', 5), /closed/, 'a settled round accepts nothing');
});

test('reservations: coins held by one round cannot be spent again elsewhere', () => {
  const w = new Wallet();
  w.account('a').coins = 25;
  assert.equal(w.stake('a', 'r1', 20), null);
  assert.equal(w.coins('a'), 5);
  assert.match(w.stake('a', 'r2', 20), /Not enough/);
  assert.equal(w.stake('a', 'r2', 5), null);
  assert.equal(w.coins('a'), 0);
});

test('pool split conserves every coin with deterministic rounding', () => {
  const bets = [
    { login: 'a', side: 'red', stake: 7 }, { login: 'b', side: 'red', stake: 3 }, { login: 'c', side: 'red', stake: 3 },
    { login: 'd', side: 'blue', stake: 11 }, { login: 'e', side: 'blue', stake: 1 },
  ];
  const p = payouts(bets, 'red'); // pool 25, winning stakes 13: 13.46 / 5.77 / 5.77 -> 13, 5, 5 + 2 leftovers
  assert.deepEqual([...p], [['a', 13], ['b', 6], ['c', 6]]);
  assert.equal([...p.values()].reduce((x, y) => x + y), 25);
  assert.deepEqual([...payouts(bets, 'red')], [...p], 'same input, same answer');
  assert.equal(payouts(bets, 'green').size, 0);
  for (let n = 0; n < 200; n++) { // conservation over many shapes (deterministic pseudo-data, not a fairness test)
    const bs = Array.from({ length: 1 + (n % 9) }, (_, i) => ({ login: 'u' + i, side: (n * 7 + i * 3) % 2 ? 'red' : 'blue', stake: 1 + ((n * 13 + i * 5) % 20) }));
    const pool = bs.reduce((x, b) => x + b.stake, 0), out = payouts(bs, 'red');
    if (out.size) assert.equal([...out.values()].reduce((x, y) => x + y), pool);
  }
});

test('settlement happens once; refunds restore balances; payout totals are checked', () => {
  const w = new Wallet();
  w.stake('a', 'r', 10); w.stake('b', 'r', 10);
  assert.throws(() => w.settle('r', new Map([['a', 25]])), /payout/);
  assert.equal(w.settle('r', new Map([['a', 20]])), true);
  assert.equal(w.settle('r', new Map([['a', 20]])), false, 'second settle pays nothing');
  assert.equal(w.refund('r'), false);
  assert.deepEqual([w.coins('a'), w.coins('b')], [110, 90]);
});

test('participation grant is capped; new session resets the economy', () => {
  const w = new Wallet();
  let total = 0;
  for (let i = 0; i < 10; i++) total += w.grant('a');
  assert.equal(total, GRANT_CAP);
  assert.equal(w.coins('a'), START_COINS + GRANT_CAP);
  const s = w.session;
  w.reset();
  assert.equal(w.session, s + 1);
  assert.equal(w.coins('a'), START_COINS);
});

function race(winner = 0) {
  let t = 1_000_000;
  const msgs = [];
  const s = { enabled: true, sessionActive: true, paused: false, demo: false, minMinutes: 4, maxMinutes: 7, minChatters: 1, intensity: 'normal', enrollSeconds: 25, hideSeconds: 20, resultSeconds: 6, betting: true, betSeconds: 30 };
  const d = new Director({ now: () => t, random: () => 0.5, coin: () => winner, emit: (m) => msgs.push(m), settings: () => s, eligible: () => 2 });
  const toEnd = () => { t = d.ev.endsAt; d.tick(); };
  return { d, s, msgs, toEnd, bet: (l, side, n) => d.input(l, 'bet', l, true, [side, String(n)]) };
}

test('race: bets lock, injected winner, whole pool returned, settled once even if ticked again', () => {
  const { d, msgs, toEnd, bet } = race(0); // 0 = red
  assert.equal(d.start('race'), null);
  assert.equal(bet('a', 'red', 10), true);
  assert.equal(bet('b', 'blue', 20), true);
  assert.equal(bet('a', 'blue', 5), false, 'one bet per login per round');
  assert.equal(d.check('c', 'bet', ['green', '5']), 'Try !bet red 10 or !bet blue 10');
  assert.match(d.check('c', 'bet', ['red', '1.5']), /whole number/);
  assert.match(d.check('c', 'bet', ['red', '-3']), /whole number/);
  assert.equal(d.check('c', 'play'), '', 'UFO commands are ignored during a race');
  assert.equal(msgs.at(-1).left, 80, 'bet feedback carries the remaining balance');
  toEnd();
  assert.equal(d.ev.phase, 'active');
  assert.equal(d.ev.race.winner, 'red');
  assert.equal(bet('c', 'red', 5), false, 'late bet');
  assert.ok(d.ev.race.finish.red < d.ev.race.finish.blue, 'winner finishes first in the shared timeline');
  toEnd();
  assert.equal(d.ev.result.refund, null);
  assert.deepEqual(d.ev.result.returns.map((x) => [x.login, x.ret]), [['a', 30], ['b', 0]]);
  assert.deepEqual([d.wallet.coins('a'), d.wallet.coins('b')], [120, 80]);
  d.wallet.settle(d.ev.id, new Map([['a', 30]])); // a stray repeat can't pay again
  d.tick(); toEnd();
  assert.equal(d.ev, null);
  assert.deepEqual([d.wallet.coins('a'), d.wallet.coins('b')], [120, 80]);
});

test('race refunds: one-sided pool, nobody backed winner, cancel/stop mid-race; zero bets ends quietly', () => {
  for (const [winner, sides] of [[0, ['red', 'red']], [1, ['red', 'red']]]) {
    const { d, toEnd, bet } = race(winner);
    d.start('race'); bet('a', sides[0], 10); bet('b', sides[1], 7);
    toEnd(); toEnd();
    assert.ok(d.ev.result.refund);
    assert.deepEqual([d.wallet.coins('a'), d.wallet.coins('b')], [100, 100]);
  }
  const { d, toEnd, bet, msgs } = race();
  d.start('race'); bet('a', 'red', 10); toEnd();
  d.cancel();
  assert.equal(d.wallet.coins('a'), 100, 'cancel during the race refunds');
  d.start('race'); toEnd();
  assert.equal(d.ev, null);
  assert.equal(msgs.at(-1).cue, 'empty');
});

test('race disable switch, rotation, and new session reset', () => {
  const { d, s, bet } = race();
  s.betting = false;
  assert.match(d.start('race'), /turned off/);
  assert.equal(d.nextType(), 'ufo');
  s.betting = true;
  d.lastType = 'ufo';
  assert.equal(d.nextType(), 'race', 'never the same activity twice in a row');
  d.start('race'); bet('a', 'red', 10);
  d.newSession();
  assert.equal(d.ev, null);
  assert.equal(d.wallet.coins('a'), 100, 'fresh session, fresh 100');
  assert.equal(d.stats.invites, 0);
});

test('the production winner draw uses node:crypto, not Math.random or bets', () => {
  const src = fs.readFileSync(new URL('../director.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ randomInt \} from 'node:crypto'/);
  assert.match(src, /coin = \(\) => randomInt\(2\)/);
  assert.match(src, /const winner = SIDES\[this\.coin\(\)\]/);
});
