# Chat World: an interactive Twitch chat overlay for OBS

Every viewer who chats in **twitch.tv/achimari** becomes a little pixel-art character that walks, jumps, dances and fights at the bottom of your stream.

## Install and run

Requirements: **Node.js 22 or newer**. There are no npm packages to install.

```bash
cd twitch-chat-world
npm start          # connects to your chat
npm run demo       # same, plus 14 fake viewers spamming commands (great for testing)
npm test           # self-checks (Node's built-in test runner)
```

Then open the dashboard at **http://127.0.0.1:7272/dashboard.html**.

## Twitch authentication

**You don't need to set any up.** The server reads your chat anonymously through Twitch's official chat WebSocket (`wss://irc-ws.chat.twitch.tv`, logged in as a read-only `justinfan` guest). Reading public chat needs no token, so there is nothing secret to store, leak or put in OBS.

You would only need an OAuth token if you later want the bot to *post* in chat. That isn't included.

To use a different channel, type it in the dashboard header (or set `channel` in `config.json`).

## OBS setup

1. **Sources → + → Browser**
2. URL: `http://127.0.0.1:7272/overlay.html`
3. Width **1920**, height **1080**
4. Leave "Custom CSS" as the OBS default. The page is already transparent.
5. Optional: tick **Refresh browser when scene becomes active**. The overlay restores every character after a refresh.

6. Sound: tick **Control audio via OBS** so the overlay gets its own mixer channel. Then press **Test sound on overlays** in the dashboard and watch that channel's meter. The dashboard's *Sound* box should list `OBS: ready`. OBS browser sources may play sound without a click. Normal browser tabs can't, and show `blocked` until you click in them.
7. Only one source should make sound. If you add the overlay a second time (another scene or a second preview), use `http://127.0.0.1:7272/overlay.html?silent=1` for the extra copy.

Keep `npm start` running while you stream. If the server restarts, the overlay reconnects by itself within about 2 seconds.

To move the world up (for example above a webcam or HUD), use **Distance from bottom** in the dashboard. Use **World height** to change how tall the decoration band is.

## Commands

| Command | What happens |
|---|---|
| `!join` | Spawn your character (any chat message also spawns you, unless that's turned off) |
| `!leave` | Remove your character |
| `!play` | Join the activity that is currently inviting players (UFO escape). Works even when spawn-on-chat is off |
| `!hide` | During UFO escape, players hide in a box |
| `!bet red 10` / `!bet blue 10` | During a goofy race, back a chicken with 1–20 free play coins |
| `!coins` | Show your play-coin balance (100 free per stream session, no real value) |
| `!jump` | Jump |
| `!dance` | Dance with music notes |
| `!attack @user` | Run over and punch them (POW!) |
| `!hug @user` | Walk over and hug, with hearts |
| `!wave` | Wave to everyone |
| `!sit` | Sit down |
| `!sleep` | Lie down and snore (Zzz) |
| `!run` | Sprint around the screen |
| `!follow @user` | Follow them around, copying their jumps |
| `!fight @user` | A cartoon brawl in a dust cloud; one wins, one is K.O.'d |
| `!random` | A random animation |
| `!explode` | Blow up into particles, knocking over neighbours, then respawn |
| `!spin` | Spin rapidly |
| `!flip` | Backflip |
| `!love @user` | Fire a stream of hearts at them |
| `!duel @user` | Pace apart, 3‑2‑1 countdown, quick draw |
| `!highfive @user` | High-five |
| `!fireball @user` | Throw a fireball (splash damage!) |
| `!party` | Dance party for everyone (2‑minute global cooldown) |
| `!grow` / `!shrink` | Become giant or tiny for 12 s |
| `!ghost` | Turn into a floating, see-through ghost |
| `!cloud` | A personal rain cloud follows you |
| `!kick` | Run to the beach ball and kick it |
| `!bounce` | Bounce on the trampoline |
| `!newlook` | Get a new random appearance (kept for the session) |
| `!dab` | Dab |
| `!moonwalk` | Moonwalk backwards with music notes |
| `!fart` | Green cloud that knocks over everyone nearby |
| `!rocket` | Blast off into the sky on a flame trail |
| `!rage` | Turn red, steam, shake and grow |
| `!sneeze` | ACHOO! knocks yourself over |
| `!faint` | Dramatically faint |
| `!slap @user` | Slap them across the screen |
| `!yeet @user` | Throw them into the air |
| `!zap @user` | Lightning bolt |
| `!kiss @user` | MWAH! with hearts |
| `!meme` | Random meme GIF on stream (30 s global cooldown) |

Your appearance comes from your username, so it stays the same if you leave and come back, after OBS refreshes, and between streams.

## Voice memes

Say a phrase on stream and a meme pops up on the overlay.

1. Open the dashboard in **Chrome or Edge** and click **Start listening** in *Voice memes*. Allow the microphone.
2. Keep that tab open while you stream (OBS itself doesn't listen; the dashboard does).
3. Edit the list, one per line, as `phrase=meme`:

```
bruh=💀 bruh                 big text / emoji
no way=noway.gif             image from public/memes/ (png, gif, jpg, webp)
emotional damage=damage.mp4  video with sound (mp4, webm)
oof=oof.mp3                  sound only
party time=party             any special event: meteor, party, stampede, crown, confetti, groupjump, ufo, race
```

**Load preset…** swaps in a ready-made list: `english` (default) or `russian` (switches the language to `ru-RU`, phrases like *погнали, да ладно, кринж, ору, помянем, браво, вечеринка, метеорит*). Presets live in `VOICE_PRESETS` in `public/commands.js`.

26 Giphy GIFs come with it in `public/memes/` (list in `MEME_GIFS` in `public/commands.js`; `!meme` picks from it). Add your own with lowercase file names. Set **Language** to the one you speak (`en-US`, `lv-LV`, `ru-RU`, ...). Each button under the list fires that meme by hand. The preview in the dashboard is muted so you don't hear sounds twice; OBS plays them (enable **Control audio via OBS** on the Browser Source to mix it).

Speech recognition is Chrome's built-in one, which sends your mic audio to Google's speech service while listening.

## Sound

Common actions now make short synthesized sounds (Web Audio; no files to install), timed to the moment the action happens. They don't play when the chat command arrives:

| Action | Sound |
|---|---|
| `!jump`, `!flip`, `!bounce` | blip at takeoff, boing on each trampoline bounce |
| `!attack`, `!slap` | punch / slap at contact (nothing if the target was hiding or busy) |
| `!fart`, `!rocket`, `!explode` | toot, ignition roar, boom |
| `!yeet` | whoosh when thrown, thud on landing |
| `!sneeze` | rising "ah…" then burst |
| `!zap`, `!fireball` | cast cue, then a distinct impact |
| `!fight`, `!duel` | one brawl cue / 3-2-1 ticks and a draw cue, then one victory jingle |
| `!hug`, `!kiss`, `!love`, `!highfive` | sparkle / clap |
| Events and UFO escape | stinger on invitation, short cues for join/hide/beam, win or "wah-wah" result |

Idle wandering, walking and chat messages are silent.

Controls (dashboard → *Sound*, saved in `config.json` under `audio`):

- **Sound on**, **Master volume** (default 25 %), and separate **Actions**, **Events** and **Meme media** levels. Meme MP3s and videos use the same controls.
- **Max sounds at once** (default 4) and **Max new sounds per second** (default 6). When it's busy, results win over impacts and impacts win over ambient sounds. The same sound can't repeat within a short gap. A sound that can't play is dropped, never queued, so nothing builds up into a burst after a click, refresh or reconnect. A meme video that isn't allowed sound plays muted.
- **Stop effects** silences everything at once (see Activities).
- **Test sound on overlays** plays a jingle on every overlay that isn't silent.
- **Preview sound** unmutes the dashboard's preview and plays the test sound. It's off by default so you don't hear everything twice, and a click in the dashboard can't unlock OBS, which is a separate browser.
- The box at the top lists every connected overlay and whether it can actually play sound: `ready`, `blocked` (needs a click in that page), `silent` (preview or `?silent=1`) or `off`.

## Activities: UFO escape

An activity is a short game that viewers opt into:

1. A UFO flies into the world band with a stinger: **"UFO inspection! Type !play to join — 25 seconds."** The joined count and countdown stay on screen.
2. Players then have **20 seconds** to type `!hide`. Their first `!hide` puts them in a cardboard box. Repeating it does nothing.
3. The UFO beams up everyone who didn't hide, lets them hang there, and drops them back (harmlessly). Viewers who didn't join carry on as normal.
4. The result shows for about 6 seconds: who escaped and who was inspected (up to 6 names each, then "+N more"). Each escapee gets a session-only ★ next to their name. Stars reset when the server restarts.

One player is enough. If nobody joins, it ends quietly. The server decides everything (players, who hid, deadlines, result, stars). The overlay only draws it, so OBS and the preview always agree. Refreshing OBS mid-activity restores the current phase and countdown without replaying sounds or giving out stars twice.

`!play` and `!hide` skip the normal per-user command cooldown, so typing `!dance` just before `!play` doesn't eat your entry. Duplicates are ignored, and the global spam cap (25 commands per second) still applies.

## Goofy race prediction (free play coins)

Two chickens, red and blue, line up at the start and the panel says **"Red or blue? !bet red 10 / !bet blue 10 — closes in 30 seconds"**. It shows both pools and bet counts while betting is open. Then betting locks, there's a 3-2-1-GO countdown, and the chickens race across the band. They squawk when they stumble, and a jingle and confetti mark the finish. The result shows the winner and who got paid how much.

**Play coins are free points for fun, kept only for this session.** They can't be bought, cashed out, transferred or won as prizes, and they have nothing to do with Twitch Channel Points or Bits.

- Everyone starts a stream session with **100 coins** (`!coins` shows yours). Bets are one per viewer per race, a whole number from **1 to 20**, and only coins you actually have. There is no "all in", no automatic bets, and no refills. Taking part in a completed UFO escape earns **+5 coins**, up to 25 per session.
- **No house cut.** Stakes come off your balance when the bet is accepted. After the race, the **whole pool** is shared among winning bets in proportion to their stakes, original stakes included. Your return therefore depends on the closing pool, not a fixed multiplier. Rounding: everyone gets the rounded-down share, and leftover coins go one at a time to the largest remainders (ties go to whoever bet first). Every coin of the pool is paid out, never more.
- **Refunds:** every stake comes back if nobody backed the winner, if everyone bet on the same side, or if the race is canceled, skipped or stopped (including Stop effects and a channel change). A race nobody bets on ends quietly.
- **Fair:** the server draws the winner with `node:crypto` only after betting locks, with equal odds for red and blue. Bets, balances, streaks and who is watching don't influence it. The race animation (including stumbles) is generated by the server and only shows the outcome. The browser never decides it.
- **Settled once:** balances, stakes and results live on the server and are keyed by round. Refreshing OBS, reconnecting, repeating `!bet`, leaving and coming back, or messages arriving twice can't create coins, take a stake twice or pay out twice.
- **Sessions:** switching **Stream session active** on, changing channel, or restarting the server starts a new economy, with fresh 100s and fresh stars and stats. An OBS refresh doesn't.
- Feedback: an accepted bet shows `10 on RED · 90 left` above your character. A rejected one explains why (`Stake must be a whole number from 1 to 20`, `Not enough coins (you have 4)`, `Only one bet per race`). After the race, winners show `+N coins!` and others show `-N` or `refund N`. Sounds are capped per round.
- Dashboard: **Race prediction (play coins)** switches it off entirely, both automatic and manual. Use **Start goofy race** and **Race betting window (s)**, and the session leaderboard appears under the stats.

### When activities start automatically

Dashboard → *Activities*. Settings are saved under `director` in `config.json`.

- **Stream session active** must be on. It is never saved, so it is off after every server restart. Being connected to chat doesn't count as being live. With **demo mode** on, activities also run for testing with the fake viewers, and those runs aren't counted in the stats.
- The gap after the previous activity is a random **4–7 minutes**. **Intensity** stretches or shortens it: calm ×1.5, normal ×1, lively ×0.7.
- At least **Min recent chatters** (default 1) must have chatted on Twitch in the last **10 minutes** and still have a character. Demo and test-chat users don't count unless demo mode is on. This counts chatters, not viewers.
- If nobody joins, the next gap grows (×2, ×3, up to ×4) until someone plays again.
- Automatic activities alternate between UFO escape and the goofy race, if race prediction is on. With the 4–7 minute gap, games never run back to back.
- **One big event at a time.** While an activity or quick event (meteor, party, …) is running, the dashboard buttons, voice triggers and `!party` are rejected with a reason. Nothing is queued. The random quick-event timer skips its turn, never repeats the previous type when another one is enabled, and waits a minute after an activity. Crown rotates through the last few winners.
- **Pause / Resume automatic events** pauses both timers. **Skip / cancel** ends the running activity (refunding any race stakes). **Start UFO escape** / **Start goofy race** run one now, even if the session is off.
- **Stop effects** stops all sound and media, clears every effect and the activity on all overlays, and pauses automatic events until you press **Resume**. Characters and the server keep working.
- Join, hide and result times are adjustable (raise them if your stream delay is long). **Announcement position** moves the panel up or down from the top of the world band.
- The status line shows what is running, the next start time or why it's waiting. It also shows this session's invitations, unique entrants, completions, invitations nobody joined, and cancellations (kept in memory only).

Changing the channel cancels any activity and removes every character, so nobody carries over from the old chat. Participants who leave, are timed out, banned, removed or evicted simply drop out. If the last hiding player leaves, the activity ends.

## Dashboard

- Connect or disconnect Twitch, change channel, toggle demo mode
- Live preview of the overlay (checker, dark or light backdrop)
- **Test chat**: send any message or command as any username, with no Twitch needed
- Trigger special events: meteor shower, dance party, stampede, crown, confetti, group jump
- Random events: on/off, min/max seconds between, which types can occur
- The character list, with a remove button on each
- Character size, animation speed, max characters, max particles, inactivity timeout, auto-movement, chat bubbles, environment (meadow, night, beach, snow, minimal, none)
- Per-command enable/disable and cooldown
- Activities (session switch, start/skip/pause, timing, intensity, status and counts) and Sound (levels, limits, output status, test/preview), described above

Every change saves to `config.json` immediately and is pushed live to OBS.

## Configuration

`config.example.json` shows every option. `config.json` is created on first run. When you update, your existing `config.json` is kept. New settings (`audio`, `director`, and the `play`/`hide` command toggles) get their defaults and are written back the first time the server saves. Automatic activities stay off until you switch on **Stream session active**. Two settings need a server restart:

- `port` (default 7272)
- `host` (default `127.0.0.1`, this computer only). Use `0.0.0.0` only if OBS runs on a different PC, because the dashboard has no password.

## Adding a custom command

Open `public/commands.js` and add an entry:

```js
wiggle: { desc: 'Wiggle!', cooldown: 3, run: (w, c) => c.setAct('dance', 1.5) },
```

Restart the server. The command appears in the dashboard and works in chat.

Useful building blocks inside `run(world, char, target, msg)`:

- **Character:** `c.jump(power)`, `c.setAct(name, seconds)`, `c.setMode('sit'|'sleep'|'run'|'follow', seconds, target)`, `c.goTo(targetOrPoint, distance, thenFn)`, `c.resize(scale, seconds)`, `c.knock(direction, power)`, `c.say(text)`
- **World:** `w.burst(x, y, count, colors)`, `w.hearts(x, y, n)`, `w.confetti(x, y, n)`, `w.text(x, y, 'TEXT', color, size)`, `w.explosion(x, y, radius, power)`, `w.shoot(x, y, w.headOf(target), { kind: 'heart'|'fire'|'bolt', onHit })`, `w.after(seconds, fn)`, `w.event('party')`
- **Shared outcomes:** use `msg.roll` (a 0–1 random number from the server) for anything random, so OBS and the preview show the same winner.

Add `target: true` if the command needs `@username`, and `global: true` for one shared cooldown.

## Safety and performance

- Spam protection: a minimum gap between each user's commands (default 1.5 s), a cooldown per command, and a global cap of 25 commands per second
- Usernames are validated, and chat text has control characters stripped and is truncated. Text is drawn on a canvas, never inserted as HTML.
- Users who are timed out or banned are removed instantly. Known bots are ignored (editable list).
- Characters inactive for 10 minutes fade out. At the character cap, the least-recently-active viewer is replaced.
- Particles are hard-capped (`maxParticles`), and so are sounds (voices, budget, repeat gap). Frame rate hasn't been benchmarked on streaming hardware. Check it on your own PC with your usual character count.
- Twitch reconnects with backoff; a ping watchdog catches silent dead connections.

## Files

```
server.js            Twitch chat, presence, cooldowns, config, events, demo bots, HTTP + live updates
director.js          event director: one-major-event lock, UFO escape + goofy race lifecycles, automatic scheduling
wallet.js            free session-only play coins: balances, held stakes, pool split, once-only settlement
public/commands.js   command registry (edit this to add commands)
public/audio.js      synthesized sound pack, sound policy (voices/priority/budget), audio manager
public/world.js      simulation, physics, pixel-art rendering, particles, events, UFO escape visuals
public/overlay.html  OBS Browser Source page
public/dashboard.html control panel
config.example.json  all options with defaults
test.js, test/       self-checks (npm test): parser/registry, director, sound policy, wallet/race, server + two SSE clients
```

## Manual stream test checklist

The automated tests check the rules, not real audio, OBS or performance. Before relying on this live:

1. `npm run demo`, open the dashboard. *Sound* should list `OBS: ready` once the Browser Source is loaded.
2. **Test sound on overlays**: you hear one jingle, OBS's meter moves, and the dashboard preview stays silent.
3. **Start UFO escape**: one stinger. Type `!play` in your real chat (or Test chat). Your character spawns, `JOINED!` appears and the count goes up.
4. After the join window, type `!hide` once: your character is in a box. Type it again: nothing changes.
5. Result: the right names, the beam and drop, one jingle, and ★1 on escapees. Refresh the OBS source during each phase: the phase and countdown come back with no repeated sounds.
6. Press **Start UFO escape** or **meteor** while one is running: you get a "Not started" reason. **Skip / cancel** releases it.
7. **Stop effects**: silence, the overlay clears, *Waiting: paused*. **Resume** brings automation back.
8. Turn off demo, switch on **Stream session active**, and check that the status explains the wait (gap or chatters).
9. **Start goofy race**: bet `!bet red 10` from one account and `!bet blue 5` from another. Try `!bet red 50`, `!bet red 2.5` and a second bet, and check that each one is refused with a reason. Watch the countdown, stumbles and finish, then check the payouts with `!coins`. Refresh OBS mid-race: the chickens continue from the same spot. Start another race, bet, then press **Stop effects**: `!coins` shows the stake refunded.
10. Spam a few `!fart`/`!slap` commands. Sound should stay bounded, with no endless wall of sound. Note the frame rate on your PC with your usual number of characters.
