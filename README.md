# Chat World: an interactive Twitch chat overlay for OBS

Every viewer who chats in **twitch.tv/achimari** becomes a little pixel-art character that walks, jumps, dances and fights at the bottom of your stream.

## Install and run

Requirements: **Node.js 22 or newer**. There are no npm packages to install.

```bash
cd twitch-chat-world
npm start          # connects to your chat
npm run demo       # same, plus 14 fake viewers spamming commands (great for testing)
npm test           # quick self-check
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

Keep `npm start` running while you stream. If the server restarts, the overlay reconnects by itself within about 2 seconds.

To move the world up (for example above a webcam or HUD), use **Distance from bottom** in the dashboard. Use **World height** to change how tall the decoration band is.

## Commands

| Command | What happens |
|---|---|
| `!join` | Spawn your character (any chat message also spawns you, unless that's turned off) |
| `!leave` | Remove your character |
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
party time=party             any special event: meteor, party, stampede, crown, confetti, groupjump
```

**Load preset…** swaps in a ready-made list: `english` (default) or `russian` (switches the language to `ru-RU`, phrases like *погнали, да ладно, кринж, ору, помянем, браво, вечеринка, метеорит*). Presets live in `VOICE_PRESETS` in `public/commands.js`.

26 Giphy GIFs come with it in `public/memes/` (list in `MEME_GIFS` in `public/commands.js`; `!meme` picks from it). Add your own with lowercase file names. Set **Language** to the one you speak (`en-US`, `lv-LV`, `ru-RU`, ...). Each button under the list fires that meme by hand. The preview in the dashboard is muted so you don't hear sounds twice; OBS plays them (enable **Control audio via OBS** on the Browser Source to mix it).

Speech recognition is Chrome's built-in one, which sends your mic audio to Google's speech service while listening.

## Dashboard

- Connect or disconnect Twitch, change channel, toggle demo mode
- Live preview of the overlay (checker, dark or light backdrop)
- **Test chat**: send any message or command as any username, with no Twitch needed
- Trigger special events: meteor shower, dance party, stampede, crown, confetti, group jump
- Random events: on/off, min/max seconds between, which types can occur
- The character list, with a remove button on each
- Character size, animation speed, max characters, max particles, inactivity timeout, auto-movement, chat bubbles, environment (meadow, night, beach, snow, minimal, none)
- Per-command enable/disable and cooldown

Every change saves to `config.json` immediately and is pushed live to OBS.

## Configuration

`config.example.json` shows every option. `config.json` is created on first run. Two settings need a server restart:

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
- Particles are hard-capped (`maxParticles`). Tested at 60 FPS with 114 characters, a dance party and a meteor shower running at once.
- Twitch reconnects with backoff; a ping watchdog catches silent dead connections.

## Files

```
server.js            Twitch chat, presence, cooldowns, config, events, demo bots, HTTP + live updates
public/commands.js   command registry (edit this to add commands)
public/world.js      simulation, physics, pixel-art rendering, particles, events
public/overlay.html  OBS Browser Source page
public/dashboard.html control panel
config.example.json  all options with defaults
test.js              self-check (npm test)
```
