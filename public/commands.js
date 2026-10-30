// Central command registry. Shared by server.js (names, cooldowns, targets) and the overlay (visuals).
// Add a command = add an entry here. Fields:
//   desc      shown in dashboard/README
//   cooldown  default per-user cooldown in seconds (editable in dashboard)
//   target    true if it needs "@username" (server checks the target exists)
//   global    cooldown shared by everyone instead of per user
//   server(u) optional: runs on the server before broadcasting (e.g. persist appearance)
//   major     a big shared event: rejected while another major event/activity is running
//   activity  input for the running activity (UFO escape); routed to the server's event director, not the overlay
//   run(world, char, targetChar, msg)  runs in the overlay; msg.roll is a shared random 0..1

export const EVENTS = ['meteor', 'party', 'stampede', 'crown', 'confetti', 'groupjump'];
export const ENVIRONMENTS = ['meadow', 'night', 'beach', 'snow', 'minimal', 'none'];

const RANDOM_POOL = ['jump', 'dance', 'wave', 'spin', 'flip', 'explode', 'ghost', 'cloud', 'grow', 'shrink', 'run', 'sit', 'dab', 'moonwalk', 'fart', 'rocket', 'rage', 'sneeze', 'faint'];

// GIFs in public/memes/, used by !meme (random pick)
export const MEME_GIFS = ['amogus', 'angrypikachu', 'bruh', 'catvibe', 'chainsaw', 'coffindance', 'confused', 'cringe', 'elmo', 'facepalm', 'homerbushes', 'laughing', 'letsgo',
  'mathlady', 'mindblown', 'money', 'ohno', 'rickroll', 'sadpablo', 'sadviolin', 'shocked', 'sideeye', 'slowclap', 'success', 'thisisfine', 'victory'].map((n) => n + '.gif');

export const COMMANDS = {
  join:     { desc: 'Spawn your character', cooldown: 0, run: (w, c) => c.jump() },
  leave:    { desc: 'Remove your character', cooldown: 0 }, // handled by server
  play:     { desc: 'Join the activity that is inviting players (UFO escape)', cooldown: 0, activity: true },
  hide:     { desc: 'During UFO escape: hide in a box (players only)', cooldown: 0, activity: true },
  bet:      { desc: 'During a goofy race: !bet red 10 or !bet blue 10 (free play coins, 1-20)', cooldown: 0, activity: true },
  coins:    { desc: 'Show your play coins (100 free per stream session, no real value)', cooldown: 10, server: (u, s) => s.wallet.coins(u.login), run: (w, c, t, m) => w.coins(c, m.data) },
  jump:     { desc: 'Jump', cooldown: 2, run: (w, c) => c.jump() && w.sfx('jump') },
  dance:    { desc: 'Dance', cooldown: 4, run: (w, c) => c.setAct('dance', 6) },
  attack:   { desc: 'Punch @user', target: true, cooldown: 10, run: (w, c, t) => w.attack(c, t) },
  hug:      { desc: 'Hug @user', target: true, cooldown: 6, run: (w, c, t) => w.hug(c, t) },
  wave:     { desc: 'Wave to everyone', cooldown: 3, run: (w, c) => c.setAct('wave', 2.5) },
  sit:      { desc: 'Sit down', cooldown: 3, run: (w, c) => c.setMode('sit', 30) },
  sleep:    { desc: 'Fall asleep', cooldown: 3, run: (w, c) => c.setMode('sleep', 45) },
  run:      { desc: 'Run around', cooldown: 5, run: (w, c) => c.setMode('run', 6) },
  follow:   { desc: 'Follow @user', target: true, cooldown: 5, run: (w, c, t) => c.setMode('follow', 45, t) },
  fight:    { desc: 'Brawl with @user', target: true, cooldown: 15, run: (w, c, t, m) => w.fight(c, t, m.roll) },
  random:   { desc: 'Random animation', cooldown: 3, run: (w, c, t, m) => COMMANDS[RANDOM_POOL[Math.floor(m.roll * RANDOM_POOL.length)]].run(w, c, null, m) },
  // extras
  explode:  { desc: 'Explode into particles and respawn', cooldown: 15, run: (w, c) => w.explodeChar(c) },
  spin:     { desc: 'Spin rapidly', cooldown: 4, run: (w, c) => c.setAct('spin', 2) },
  flip:     { desc: 'Backflip', cooldown: 3, run: (w, c) => { if (c.jump(1.15)) w.sfx('jump'); c.setAct('flip', 0.75); } },
  love:     { desc: 'Send hearts to @user', target: true, cooldown: 6, run: (w, c, t) => w.love(c, t) },
  duel:     { desc: 'Quick-draw duel with @user', target: true, cooldown: 20, run: (w, c, t, m) => w.duel(c, t, m.roll) },
  highfive: { desc: 'High-five @user', target: true, cooldown: 5, run: (w, c, t) => w.highfive(c, t) },
  fireball: { desc: 'Throw a fireball at @user', target: true, cooldown: 12, run: (w, c, t) => w.fireball(c, t) },
  party:    { desc: 'Start a dance party for everyone', global: true, major: true, cooldown: 120, run: (w) => w.event('party') },
  grow:     { desc: 'Become giant for a bit', cooldown: 20, run: (w, c) => c.resize(2, 12) },
  shrink:   { desc: 'Become tiny for a bit', cooldown: 20, run: (w, c) => c.resize(0.5, 12) },
  ghost:    { desc: 'Turn into a floating ghost', cooldown: 20, run: (w, c) => { c.ghostT = 12; } },
  cloud:    { desc: 'Summon a personal rain cloud', cooldown: 20, run: (w, c) => { c.cloudT = 12; } },
  kick:     { desc: 'Kick the ball', cooldown: 5, run: (w, c) => w.kickBall(c) },
  bounce:   { desc: 'Jump on the trampoline', cooldown: 5, run: (w, c) => w.bounce(c, true) },
  // silly
  dab:      { desc: 'Dab', cooldown: 3, run: (w, c) => c.setAct('dab', 1.2) && w.text(c.x, c.topY() - 10, 'DAB', '#48dbfb', 24) },
  moonwalk: { desc: 'Moonwalk backwards', cooldown: 6, run: (w, c) => c.setMode('moonwalk', 5) },
  fart:     { desc: 'Fart and knock over neighbours', cooldown: 10, run: (w, c) => w.fart(c) },
  rocket:   { desc: 'Blast off into the sky', cooldown: 8, run: (w, c) => w.rocket(c) },
  rage:     { desc: 'Rage quit (steaming, shaking, giant)', cooldown: 15, run: (w, c) => { if (c.setAct('rage', 3)) { c.resize(1.6, 3); w.text(c.x, c.topY() - 20, 'RAAAGE!', '#ff4757', 32); } } },
  sneeze:   { desc: 'Sneeze yourself over', cooldown: 6, run: (w, c) => w.sneeze(c) },
  faint:    { desc: 'Dramatically faint', cooldown: 8, run: (w, c) => { c.knock(-c.facing, 0.35); w.text(c.x, c.topY() - 10, '*faints*', '#ffffff', 22); } },
  slap:     { desc: 'Slap @user across the screen', target: true, cooldown: 12, run: (w, c, t) => w.attack(c, t, ['SLAP!', 'SMACK!'], 1.5, 'slap') },
  yeet:     { desc: 'Yeet @user into the air', target: true, cooldown: 15, run: (w, c, t) => w.yeet(c, t) },
  zap:      { desc: 'Zap @user with lightning', target: true, cooldown: 10, run: (w, c, t) => w.zap(c, t) },
  kiss:     { desc: 'Kiss @user', target: true, cooldown: 8, run: (w, c, t) => w.kiss(c, t) },
  meme:     { desc: 'Show a random meme GIF on stream', global: true, cooldown: 30, run: (w, c, t, m) => { w.onMeme?.(MEME_GIFS[Math.floor(m.roll * MEME_GIFS.length)], m.roll); c.setAct('cheer', 1); } },
  newlook:  { desc: 'Get a new random appearance', cooldown: 30, server: (u) => { u.variant++; }, run: (w, c, t, m) => w.restyle(c, m.user) },
};

// Voice meme presets, picked in the dashboard. "phrase=meme": text/emoji, a file in public/memes/, or an event name.
export const VOICE_PRESETS = {
  english: { lang: 'en-US', triggers: [
    "let's go=letsgo.gif", 'bruh=bruh.gif', 'no way=shocked.gif', 'mind blown=mindblown.gif', 'are you serious=facepalm.gif',
    "that's hilarious=laughing.gif", 'cringe=cringe.gif', 'rest in peace=coffindance.gif', 'so sad=sadviolin.gif', 'well done=slowclap.gif',
    'this is fine=thisisfine.gif', 'i won=victory.gif', 'money=money.gif', 'good game=🏆 gg', 'easy=😎 ez',
    'oh no=ohno.gif', "i'm confused=confused.gif", 'what the=mathlady.gif', 'suspicious=sideeye.gif', 'impostor=amogus.gif', 'vibe=catvibe.gif',
    'chaos=chainsaw.gif', 'mission accomplished=success.gif', "i'm out=homerbushes.gif", 'so lonely=sadpablo.gif', 'never gonna=rickroll.gif',
    "i'm angry=angrypikachu.gif", 'burn it all=elmo.gif',
    'party time=party', 'ufo=ufo', 'race time=race', 'meteor=meteor', 'confetti=confetti', 'everybody jump=groupjump', 'stampede=stampede', 'crown=crown',
  ] },
  russian: { lang: 'ru-RU', triggers: [
    'погнали=letsgo.gif', 'поехали=letsgo.gif', 'братан=bruh.gif', 'да ладно=shocked.gif', 'не может быть=shocked.gif',
    'взрыв мозга=mindblown.gif', 'серьезно=facepalm.gif', 'ору=laughing.gif', 'смешно=laughing.gif', 'кринж=cringe.gif',
    'помянем=coffindance.gif', 'земля пухом=coffindance.gif', 'грустно=sadviolin.gif', 'браво=slowclap.gif', 'все нормально=thisisfine.gif',
    'я выиграл=victory.gif', 'победа=victory.gif', 'деньги=money.gif', 'хорошая игра=🏆 gg', 'изи=😎 изи', 'привет чат=👋 привет, чат!',
    'ой нет=ohno.gif', 'не понял=confused.gif', 'что происходит=mathlady.gif', 'подозрительно=sideeye.gif', 'предатель=amogus.gif', 'кайф=catvibe.gif',
    'хаос=chainsaw.gif', 'миссия выполнена=success.gif', 'я ушел=homerbushes.gif', 'одиноко=sadpablo.gif', 'рикролл=rickroll.gif',
    'бесит=angrypikachu.gif', 'гори все огнем=elmo.gif',
    'вечеринка=party', 'нло=ufo', 'гонка=race', 'метеорит=meteor', 'конфетти=confetti', 'все прыгаем=groupjump', 'бежим=stampede', 'корона=crown',
  ] },
};
