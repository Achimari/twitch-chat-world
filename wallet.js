// Free, session-only play coins. No purchases, cash value, transfers or prizes: just points for a funny reveal.
// Stakes leave the balance when accepted and are held per round until that round is settled or refunded,
// exactly once. Everything is in memory: a server restart or a new stream session starts a fresh economy.

export const START_COINS = 100;
export const MIN_STAKE = 1, MAX_STAKE = 20;
export const GRANT = 5, GRANT_CAP = 25; // per completed non-betting activity / per login per session

export class Wallet {
  constructor() { this.reset(); }
  reset() {
    this.session = (this.session || 0) + 1;
    this.accounts = new Map(); // login -> { coins, name, granted }
    this.held = new Map();     // roundId -> Map(login -> stake)
    this.closed = new Set();   // roundIds already settled/refunded
  }
  account(login, name) {
    let a = this.accounts.get(login);
    if (!a) this.accounts.set(login, a = { coins: START_COINS, name: name || login, granted: 0 }); // once per session
    if (name) a.name = name;
    return a;
  }
  coins(login) { return this.account(login).coins; }

  // Validation lives in one place. Returns null when the stake is acceptable, else a reason for the viewer.
  check(login, roundId, amount) {
    if (this.closed.has(roundId)) return 'Betting is closed';
    if (this.held.get(roundId)?.has(login)) return 'Only one bet per round';
    if (!Number.isInteger(amount) || amount < MIN_STAKE || amount > MAX_STAKE) return `Stake must be a whole number from ${MIN_STAKE} to ${MAX_STAKE}`;
    const have = this.coins(login);
    if (have < amount) return `Not enough coins (you have ${have})`;
    return null;
  }
  stake(login, roundId, amount, name) {
    const why = this.check(login, roundId, amount);
    if (why) return why;
    this.account(login, name).coins -= amount;
    if (!this.held.has(roundId)) this.held.set(roundId, new Map());
    this.held.get(roundId).set(login, amount);
    return null;
  }
  // Pay out a round. credits must hand back exactly the held total (no house cut, nothing minted).
  // Returns false if the round was already settled, so a repeated call can never pay twice.
  settle(roundId, credits) {
    const held = this.held.get(roundId);
    this.closed.add(roundId);
    if (!held) return false;
    const total = [...held.values()].reduce((a, b) => a + b, 0);
    const paid = [...credits.values()].reduce((a, b) => a + b, 0);
    if (paid !== total) throw new Error(`payout ${paid} != pool ${total}`);
    this.held.delete(roundId);
    for (const [login, n] of credits) this.account(login).coins += n;
    return true;
  }
  refund(roundId) { return this.settle(roundId, new Map(this.held.get(roundId) || [])); }
  // Small capped reward for taking part in an ordinary activity. Returns the amount actually granted.
  grant(login, name) {
    const a = this.account(login, name), n = Math.min(GRANT, GRANT_CAP - a.granted);
    if (n <= 0) return 0;
    a.coins += n; a.granted += n;
    return n;
  }
  top(n = 5) {
    return [...this.accounts.entries()].sort((a, b) => b[1].coins - a[1].coins || a[0].localeCompare(b[0])).slice(0, n).map(([login, a]) => ({ login, name: a.name, coins: a.coins }));
  }
}

// Parimutuel split: the whole pool goes back to winning stakes in proportion, including their own stake.
// Each winner gets floor(pool * stake / winningStakes); leftover coins go one each to the largest fractional
// remainders, ties broken by who bet first. Sum of returns === pool, always.
export function payouts(bets, winner) {
  const pool = bets.reduce((a, b) => a + b.stake, 0);
  const wins = bets.map((b, i) => ({ ...b, i })).filter((b) => b.side === winner);
  const W = wins.reduce((a, b) => a + b.stake, 0);
  const out = new Map();
  if (!W) return out;
  for (const b of wins) { b.ret = Math.floor((pool * b.stake) / W); b.frac = (pool * b.stake) % W; }
  let left = pool - wins.reduce((a, b) => a + b.ret, 0);
  for (const b of [...wins].sort((x, y) => y.frac - x.frac || x.i - y.i)) if (left-- > 0) b.ret++;
  for (const b of wins) out.set(b.login, b.ret);
  return out;
}
