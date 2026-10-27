// Smoke checks for the IRC parser and command registry. Run: npm test
import assert from 'node:assert/strict';
import { parseIrc } from './server.js';
import { COMMANDS } from './public/commands.js';

const m = parseIrc('@color=#FF0000;display-name=Foo_Bar;login=foo_bar :foo_bar!foo_bar@foo_bar.tmi.twitch.tv PRIVMSG #achimari :!hug @Someone hi there');
assert.equal(m.command, 'PRIVMSG');
assert.equal(m.nick, 'foo_bar');
assert.equal(m.tags['display-name'], 'Foo_Bar');
assert.equal(m.params[0], '#achimari');
assert.equal(m.trailing, '!hug @Someone hi there');
assert.equal(parseIrc('PING :tmi.twitch.tv').trailing, 'tmi.twitch.tv');
assert.equal(parseIrc(':tmi.twitch.tv CLEARCHAT #achimari :baduser').trailing, 'baduser');

for (const [k, d] of Object.entries(COMMANDS)) {
  assert.match(k, /^[a-z]+$/, k);
  assert.equal(typeof d.desc, 'string', k);
  assert.equal(typeof d.cooldown, 'number', k);
}
console.log('ok');
process.exit(0);
