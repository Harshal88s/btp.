/* Infinity Brawl — unofficial Marvel fan fighting game. Plain canvas + vanilla JS. */
(() => {
'use strict';
const W = 960, H = 540, GROUND = 452, ROUND_TIME = 60, ROUNDS_TO_WIN = 2, TAU = Math.PI * 2;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const store = { get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } };
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = c => clamp(Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt), 0, 255); return `rgb(${f(r)},${f(g)},${f(b)})`; }
const DEFAULT_KEYS = { p1: { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], crouch: ['ArrowDown'], punch: ['KeyZ', 'Numpad1'], kick: ['KeyX', 'Numpad2'], special: ['KeyC', 'Numpad3'], super: ['KeyV', 'Space', 'Numpad0'] },
  p2: { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], crouch: ['KeyS'], punch: ['KeyJ'], kick: ['KeyK'], special: ['KeyL'], super: ['KeyI', 'KeyU'] } };
const SETTINGS = Object.assign({ sens: 1, difficulty: 1, voice: 'auto', sfx: true, volume: .9, keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)) }, store.get('ib-settings', {}));
if (!SETTINGS.keys || !SETTINGS.keys.p1) SETTINGS.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
for (const p of ['p1', 'p2']) if (SETTINGS.keys[p].block && !SETTINGS.keys[p].crouch) { SETTINGS.keys[p].crouch = SETTINGS.keys[p].block; delete SETTINGS.keys[p].block; }
if (!['auto', 'clips', 'fx', 'off'].includes(SETTINGS.voice) || SETTINGS.voiceV !== 2) { SETTINGS.voice = 'fx'; SETTINGS.voiceV = 2; }
const saveSettings = () => store.set('ib-settings', SETTINGS);
const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ============================================================ */
/*  Roster                                                       */
/* ============================================================ */
const HEROES = [
  { id: 'ironman', name: 'Iron Man', alias: 'Tony Stark', villain: false, color: '#c8102e', line: 'I am Iron Man.', win: 'Sometimes you gotta run before you can walk.', hp: 100, stats: { power: 7, speed: 6, guard: 7 }, fly: true, scale: 1,
    special: { kind: 'repulsor', name: 'Repulsor Blast', desc: 'A fast beam of repulsor energy from the palm.' }, sup: { kind: 'unibeam', name: 'Unibeam', desc: 'The arc reactor fires a chest beam across the whole arena.' } },
  { id: 'cap', name: 'Captain America', alias: 'Steve Rogers', villain: false, color: '#1f4fa3', line: 'I can do this all day.', win: 'Avengers... assemble.', hp: 100, stats: { power: 6, speed: 6, guard: 9 }, scale: 1,
    special: { kind: 'shield', name: 'Shield Throw', desc: 'The vibranium shield flies out and ricochets back, hitting both ways.' }, sup: { kind: 'assemble', name: 'Avengers Assemble', desc: 'The team charges through the arena one after another.' } },
  { id: 'thor', name: 'Thor', alias: 'God of Thunder', villain: false, color: '#5b7fa6', line: 'Bring me Thanos!', win: 'I knew it. I am still worthy.', hp: 115, stats: { power: 9, speed: 5, guard: 7 }, fly: true, scale: 1.08,
    special: { kind: 'lightning', name: 'Lightning Strike', desc: 'Calls a bolt down on the opponent\'s position.' }, sup: { kind: 'stormbreaker', name: 'God of Thunder', desc: 'A storm of lightning tears across the whole stage.' } },
  { id: 'hulk', name: 'Hulk', alias: 'Bruce Banner', villain: false, color: '#3fa34d', line: 'HULK SMASH!', win: 'Puny god.', hp: 130, stats: { power: 10, speed: 3, guard: 8 }, scale: 1.24,
    special: { kind: 'clap', name: 'Thunder Clap', desc: 'A clap so loud it knocks anyone nearby off their feet.' }, sup: { kind: 'smash', name: 'Hulk Smash', desc: 'Leaps out of sight and lands on the opponent like a meteor.' } },
  { id: 'spiderman', name: 'Spider-Man', alias: 'Peter Parker', villain: false, color: '#d7262c', line: 'With great power comes great responsibility.', win: 'Just your friendly neighbourhood Spider-Man.', hp: 90, stats: { power: 5, speed: 10, guard: 4 }, doubleJump: true, scale: .96,
    special: { kind: 'web', name: 'Web Shot', desc: 'Webs the opponent and yanks them in close.' }, sup: { kind: 'webswing', name: 'Swing Kick Barrage', desc: 'Three swinging kicks across the arena.' } },
  { id: 'panther', name: 'Black Panther', alias: "T'Challa", villain: false, color: '#8b5cf6', line: 'Wakanda forever!', win: 'In my culture, death is not the end.', hp: 100, stats: { power: 7, speed: 8, guard: 6 }, scale: 1,
    special: { kind: 'kinetic', name: 'Kinetic Dash', desc: 'A vibranium-charged claw rush that knocks down.' }, sup: { kind: 'wakanda', name: 'Kinetic Release', desc: 'Stored energy explodes outward in purple waves.' } },
  { id: 'strange', name: 'Doctor Strange', alias: 'Stephen Strange', villain: false, color: '#f0b429', line: "Dormammu, I've come to bargain.", win: "We're in the endgame now.", hp: 100, stats: { power: 6, speed: 6, guard: 6 }, fly: true, scale: 1,
    special: { kind: 'portal', name: 'Sling Ring', desc: 'Steps through a portal and strikes from behind.' }, sup: { kind: 'bargain', name: 'Time Loop', desc: 'The Eye of Agamotto traps the opponent in a loop of hits.' } },
  { id: 'thanos', name: 'Thanos', alias: 'The Mad Titan', villain: true, color: '#7a3fb5', line: 'I am inevitable.', win: 'Perfectly balanced, as all things should be.', hp: 130, stats: { power: 10, speed: 3, guard: 9 }, scale: 1.26,
    special: { kind: 'powerstone', name: 'Power Stone Blast', desc: 'A heavy purple orb from the gauntlet.' }, sup: { kind: 'snap', name: 'The Snap', desc: 'One snap. Half the health bar turns to dust.' } },
  { id: 'loki', name: 'Loki', alias: 'God of Mischief', villain: true, color: '#2f8f4e', line: 'I am burdened with glorious purpose.', win: 'Did you really think I was gone?', hp: 90, stats: { power: 6, speed: 8, guard: 4 }, scale: 1,
    special: { kind: 'daggers', name: 'Dagger Fan', desc: 'Three daggers and an illusion left behind.' }, sup: { kind: 'purpose', name: 'Glorious Purpose', desc: 'An army of Lokis attacks from every side.' } },
  { id: 'venom', name: 'Venom', alias: 'Eddie Brock', villain: true, color: '#4a4a5a', line: 'We are Venom.', win: 'Eyes, lungs, pancreas. So many snacks.', hp: 110, stats: { power: 8, speed: 7, guard: 5 }, scale: 1.1,
    special: { kind: 'tendril', name: 'Symbiote Lash', desc: 'A long black tendril grabs from range and reels the opponent in.' }, sup: { kind: 'wearevenom', name: 'Symbiote Storm', desc: 'Tendrils erupt from everywhere at once.' } }
];

const ROSTER = HEROES;
const heroById = id => HEROES.find(h => h.id === id) || HEROES[0];
const styleId = id => id;

/* ============================================================ */
/*  Optional HD assets (drop files into assets/, see assets/README.md) */
/* ============================================================ */
const ASSET_BASE = (document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^/]*$/, '') : '') + 'assets/';
const assets = { sprites: {}, clips: {}, manifest: null, portraitCanvases: [], faded: {}, stages: {}, limbs: {} };
/* bust: image stops above the feet, so the fighter levitates and the hem fades out. cut = fraction of full body height the image covers. */
const SPRITE_META = { strange: { bust: true, cut: .8, hover: true }, thor: { bust: true, cut: .84, hover: true }, cap: { bust: true, cut: .9 }, ironman: { hover: true, cut: .96 } };
function fadedSprite(id, img) {
  if (assets.faded[id]) return assets.faded[id]; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'destination-out'; const g = x.createLinearGradient(0, img.height * .78, 0, img.height); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = g; x.fillRect(0, img.height * .78, img.width, img.height * .22);
  return assets.faded[id] = c;
}
function loadStageImages() { STAGES.forEach(st => { const img = new Image(); img.onload = () => { assets.stages[st.id] = img; }; img.onerror = () => {}; img.src = `${ASSET_BASE}stages/${st.id}.jpg`; const p = new Image(); p.onload = () => { assets.stages[st.id] = p; }; p.onerror = () => {}; p.src = `${ASSET_BASE}stages/${st.id}.png`; }); }
function loadSprites() {
  HEROES.forEach(h => { const img = new Image(); img.onload = () => { assets.sprites[h.id] = img; refreshPortraits(); }; img.onerror = () => {}; img.src = `${ASSET_BASE}sprites/${h.id}.png`; });
}
function tryAudio(base, ok) { const exts = ['mp3', 'ogg', 'wav', 'm4a']; let i = 0; const attempt = () => { if (i >= exts.length) return; const a = new Audio(); a.preload = 'auto'; a.addEventListener('loadedmetadata', () => ok(a), { once: true }); a.addEventListener('error', () => { i++; attempt(); }, { once: true }); a.src = `${base}.${exts[i]}`; }; attempt(); }
function loadClipChain(key, base, max = 4) { // base, base2, base3... stop at the first missing
  const list = assets.clips[key] = assets.clips[key] || []; if (list.loading) return; list.loading = true;
  const next = n => { if (n > max) return; tryAudio(n === 1 ? base : base + n, a => { list.push(a); next(n + 1); }); }; next(1);
}
const HERO_SOUNDS = ['intro', 'special', 'super', 'hit', 'win'], GLOBAL_SOUNDS = ['punch', 'kick', 'hit', 'block', 'ko', 'round'];
function loadHeroSounds(id) {
  if (assets.manifest) { const m = assets.manifest.sounds && assets.manifest.sounds[id]; if (!m) return; for (const name of HERO_SOUNDS) (m[name] || []).forEach(file => { const key = id + ':' + name; assets.clips[key] = assets.clips[key] || []; if (!assets.clips[key].some(a => a.dataset.file === file)) { const a = new Audio(ASSET_BASE + 'sounds/' + id + '/' + file); a.dataset.file = file; assets.clips[key].push(a); } }); return; }
  for (const name of HERO_SOUNDS) loadClipChain(id + ':' + name, `${ASSET_BASE}sounds/${id}/${name}`);
}
function loadGlobalSounds() {
  if (assets.manifest) { const g = assets.manifest.sounds && assets.manifest.sounds.global; if (g) for (const name of GLOBAL_SOUNDS) (g[name] || []).forEach(file => { assets.clips['g:' + name] = assets.clips['g:' + name] || []; assets.clips['g:' + name].push(new Audio(ASSET_BASE + 'sounds/' + file)); }); return; }
  for (const name of GLOBAL_SOUNDS) loadClipChain('g:' + name, `${ASSET_BASE}sounds/${name}`, 3);
}
function playClip(key, vol = 1) { const list = assets.clips[key]; if (!list || !list.length || !audio.on) return false; const src = pick(list); try { const a = src.cloneNode(); a.volume = Math.min(1, vol * SETTINGS.volume); a.play().catch(() => {}); } catch { return false; } return true; }
/* pitch, rate, voice slot (which English voice to prefer when several exist), vocal effect */
const VOICES = { ironman: [1, 1.15, 0, 'radio'], cap: [.75, .95, 1, 'none'], thor: [.5, .85, 2, 'thunder'], hulk: [.05, .55, 3, 'monster'], spiderman: [1.6, 1.25, 4, 'none'],
  panther: [.6, .9, 5, 'purr'], strange: [.7, .9, 6, 'mystic'], thanos: [.2, .65, 7, 'titan'], loki: [1.05, 1.05, 8, 'shimmer'], venom: [.01, .7, 9, 'monster'] };
function voiceFx(kind, dur) {
  if (!audio.on || !audio.ctx) return; const c = audio.ctx, t0 = c.currentTime, out = c.createGain(); out.gain.value = audio.vol * .9; out.connect(c.destination);
  const osc = (type, f0, f1, g, d) => { const o = c.createOscillator(), gg = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + d); gg.gain.setValueAtTime(g, t0); gg.gain.exponentialRampToValueAtTime(.0001, t0 + d); o.connect(gg).connect(out); o.start(t0); o.stop(t0 + d + .05); };
  switch (kind) {
    case 'monster': { osc('sawtooth', 62, 40, .12, dur); osc('square', 45, 30, .08, dur); const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 28; lg.gain.value = .25; lfo.connect(lg).connect(out.gain); lfo.start(t0); lfo.stop(t0 + dur); audio.crack(dur * .8, .25, 220, .4); break; }
    case 'titan': osc('sawtooth', 70, 52, .09, dur); osc('sine', 35, 30, .14, dur); break;
    case 'thunder': audio.crack(dur, .35, 140, .3); osc('sine', 55, 30, .12, dur * .8); break;
    case 'radio': audio.crack(.06, .4, 2200, 3); setTimeout(() => audio.crack(.05, .3, 2600, 3), dur * 1000); break;
    case 'mystic': [220, 277, 330].forEach((f, i) => osc('sine', f, f * 1.01, .035, dur + i * .2)); break;
    case 'purr': osc('sawtooth', 48, 42, .07, dur); break;
    case 'shimmer': [880, 1320, 1760].forEach((f, i) => setTimeout(() => osc('triangle', f, f * .98, .03, .4), i * 90)); break;
  }
}
let voiceList = []; try { voiceList = speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => { voiceList = speechSynthesis.getVoices(); }; } catch { /* no speech */ }
function speak(id, text) {
  if (!audio.on || SETTINGS.voice === 'off' || !('speechSynthesis' in window) || !text) return false;
  try { const u = new SpeechSynthesisUtterance(text); const [pitch, rate, slot, fx] = VOICES[styleId(id)] || [1, 1, 0, 'none']; u.pitch = pitch; u.rate = rate; u.volume = Math.min(1, SETTINGS.volume);
    const en = voiceList.filter(v => /^en/i.test(v.lang)); const deep = en.filter(v => /male|david|daniel|george|james|fred|alex|mark|rishi/i.test(v.name) && !/female|zira|samantha|victoria|karen|moira|tessa|fiona|susan|hazel/i.test(v.name));
    const pool = (['hulk', 'thanos', 'venom', 'thor', 'cap', 'panther'].includes(id) && deep.length) ? deep : en; if (pool.length) u.voice = pool[slot % pool.length];
    audio.init(); void fx;
    speechSynthesis.cancel(); speechSynthesis.speak(u); return true; } catch { return false; }
}
const heroClip = (id, name, vol) => playClip(id + ':' + name, vol);
/* Character sound design: non-verbal vocalisations and power sounds built from the synth. */
function charSfx(id, kind, scale = 1) {
  id = styleId(id); if (!audio.on) return; audio.init(); if (!audio.ctx) return; const c = audio.ctx, t0 = c.currentTime;
  const at = (ms, fn) => setTimeout(fn, ms * scale);
  const sweep = (type, f0, f1, dur, g) => { const o = c.createOscillator(), gg = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, c.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur); gg.gain.setValueAtTime(g * audio.vol, c.currentTime); gg.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur); o.connect(gg).connect(c.destination); o.start(); o.stop(c.currentTime + dur + .05); };
  const roar = (f, dur, g) => { sweep('sawtooth', f, f * 1.6, dur, g); sweep('square', f * .5, f * .9, dur, g * .6); audio.crack(dur, g * 2.2, 300 + f * 2, .5); };
  const laugh = (n, f) => { for (let i = 0; i < n; i++) at(i * 110, () => sweep('triangle', f * (1 + i * .04), f * .8, .09, .08)); };
  switch (id + ':' + kind) {
    case 'hulk:intro': roar(70, 1.2, .14); break; case 'hulk:special': roar(80, .5, .12); at(380, () => { audio.thump(50, .5, .6); audio.crack(.25, .7, 500, .6); }); break; case 'hulk:super': roar(60, 1.6, .16); at(1200, () => { audio.thump(40, .9, .8); audio.crack(.5, .9, 300, .5); }); break;
    case 'venom:intro': roar(45, 1.3, .12); audio.crack(1.2, .25, 2600, .3); break; case 'venom:special': audio.crack(.35, .5, 1800, .3); sweep('sawtooth', 300, 80, .4, .06); break; case 'venom:super': roar(40, 1.8, .14); for (let i = 0; i < 6; i++) at(900 + i * 180, () => audio.crack(.15, .5, 1200, .6)); break;
    case 'thanos:intro': sweep('sine', 60, 48, 1.4, .18); sweep('sawtooth', 90, 70, 1.4, .05); break; case 'thanos:special': sweep('sawtooth', 120, 400, .5, .07); sweep('sine', 60, 110, .5, .14); break; case 'thanos:super': for (let i = 0; i < 6; i++) at(i * 140, () => sweep('sine', 440 + i * 110, 440 + i * 110, .3, .06)); at(1150, () => audio.crack(.04, .9, 3500, 4)); at(1500, () => { audio.thump(36, 2.2, 1); audio.crack(1.6, .6, 240, .4); sweep('sawtooth', 50, 20, 2, .12); }); break;
    case 'thor:intro': audio.crack(.9, .5, 160, .3); sweep('sine', 70, 40, .9, .16); break; case 'thor:special': sweep('sawtooth', 800, 60, .35, .08); at(250, () => { audio.crack(.5, .8, 400, .4); audio.thump(60, .4, .5); }); break; case 'thor:super': sweep('sawtooth', 200, 1200, .9, .06); for (let i = 0; i < 5; i++) at(900 + i * 260, () => { audio.crack(.4, .8, 350 + i * 80, .4); audio.thump(55, .35, .45); }); break;
    case 'ironman:intro': audio.crack(.06, .4, 2200, 3); sweep('sine', 600, 1200, .25, .04); break; case 'ironman:special': sweep('sine', 400, 1800, .45, .08); at(380, () => { audio.crack(.12, .5, 2400, 1.5); sweep('sawtooth', 1200, 300, .25, .06); }); break; case 'ironman:super': sweep('sine', 200, 2400, 1, .08); at(950, () => { sweep('sawtooth', 900, 700, 1.6, .09); audio.crack(1.6, .3, 3000, .6); }); break;
    case 'cap:intro': audio.crack(.08, .5, 3200, 6); sweep('sine', 1400, 900, .5, .05); break; case 'cap:special': sweep('triangle', 2000, 1200, .4, .06); audio.crack(.25, .35, 2800, 3); break; case 'cap:super': [523, 659, 784, 1046].forEach((f, i) => at(i * 150, () => sweep('square', f, f, .5, .06))); at(900, () => { audio.crack(1.4, .5, 200, .3); }); break;
    case 'spiderman:intro': audio.crack(.08, .5, 4000, 4); break; case 'spiderman:special': audio.crack(.1, .6, 4200, 5); sweep('sine', 2400, 600, .2, .05); break; case 'spiderman:super': for (let i = 0; i < 4; i++) at(i * 350, () => { audio.crack(.1, .6, 4000, 5); sweep('sawtooth', 300, 900, .3, .05); }); break;
    case 'panther:intro': sweep('sawtooth', 55, 40, 1, .09); audio.crack(.9, .2, 180, .4); break; case 'panther:special': sweep('sine', 300, 1400, .4, .07); at(300, () => audio.crack(.12, .5, 2600, 2)); break; case 'panther:super': sweep('sine', 120, 900, 1, .09); at(950, () => { audio.thump(70, 1, .7); sweep('sawtooth', 1200, 100, 1.2, .08); }); break;
    case 'strange:intro': [220, 277, 330, 440].forEach((f, i) => at(i * 120, () => sweep('sine', f, f * 1.005, 1.2, .05))); break; case 'strange:special': audio.crack(.5, .3, 3500, .8); sweep('triangle', 600, 1800, .5, .05); break; case 'strange:super': for (let i = 0; i < 8; i++) at(i * 260, () => sweep('square', 1600, 1600, .04, .05)); [330, 415, 494].forEach(f => sweep('sine', f, f, 2.4, .04)); break;
    case 'loki:intro': laugh(5, 420); break; case 'loki:special': for (let i = 0; i < 3; i++) at(i * 70, () => sweep('sawtooth', 2000, 400, .15, .05)); at(300, () => laugh(3, 460)); break; case 'loki:super': laugh(6, 400); [880, 1320, 1760].forEach((f, i) => at(600 + i * 90, () => sweep('triangle', f, f * .98, .5, .04))); for (let i = 0; i < 5; i++) at(1000 + i * 220, () => audio.crack(.1, .5, 2000, 2)); break;
  }
}
/* Each character's punches and kicks carry a flavour on top of the base hit: metal, wet, electric, heavy... */
function attackSfx(id, kind) {
  id = styleId(id); if (!audio.on || !audio.ctx) return; const heavy = kind !== 'punch';
  switch (id) {
    case 'ironman': audio.crack(.08, .35, 3200, 4); audio.tone(1800, .08, 'square', .03, -900); break;
    case 'cap': audio.crack(.06, .3, 2800, 5); audio.tone(2200, .12, 'triangle', .04, -400); break;
    case 'thor': audio.crack(.1, .3, 2600, 2); audio.tone(900, .1, 'sawtooth', .03, 1500); break;
    case 'hulk': audio.thump(70, .22, .35); audio.crack(.15, .3, 400, .5); break;
    case 'spiderman': audio.crack(.05, .35, 4200, 6); break;
    case 'panther': audio.crack(heavy ? .14 : .1, .35, 2000, .7); audio.tone(300, .12, 'sine', .05, 900); break;
    case 'strange': audio.tone(1200, .15, 'sine', .05, 600); audio.crack(.08, .2, 3400, 3); break;
    case 'thanos': audio.thump(60, .25, .4); audio.crack(.12, .3, 600, .7); break;
    case 'loki': audio.crack(.07, .3, 3000, 3); audio.tone(1600, .1, 'triangle', .03, -600); break;
    case 'venom': audio.noise(.12, .3, 500); audio.crack(.1, .3, 900, .5); break;
  }
}
function heroVoice(id, name, text) {
  if (heroClip(id, name)) return true; const mode = SETTINGS.voice; if (mode === 'off' || mode === 'clips') return false;
  if (name === 'intro' || name === 'win') { charSfx(id, 'intro'); if (mode === 'auto') speak(id, text); return true; }
  return false;
}
(location.protocol === 'file:' ? Promise.resolve(null) : fetch(ASSET_BASE + 'manifest.json').then(r => r.ok ? r.json() : null).catch(() => null)).then(m => { if (m && typeof m === 'object') assets.manifest = m; }).finally(() => { loadGlobalSounds(); });
loadSprites();

/* ============================================================ */
/*  Audio                                                        */
/* ============================================================ */
const audio = {
  ctx: null, on: store.get('ib-sound', true),
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  get vol() { return SETTINGS.volume; },
  thump(freq, dur, gain) { if (!this.on || !this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(freq, c.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * .35), c.currentTime + dur); g.gain.setValueAtTime(gain * this.vol, c.currentTime); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + .02); },
  crack(dur, gain, freq, q = 1) { if (!this.on || !this.ctx) return; const c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2); const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain * this.vol; src.connect(f).connect(g).connect(c.destination); src.start(); },
  tone(freq, dur, type = 'square', gain = .08, slide = 0) { if (!this.on || !this.ctx) return; gain *= this.vol; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, c.currentTime); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur); g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + .02); },
  noise(dur, gain = .12, lp = 1200) { if (!this.on || !this.ctx) return; gain *= this.vol; const c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = buf; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = gain; s.connect(f).connect(g).connect(c.destination); s.start(); },
  sfx(name) {
    if (['punch', 'kick', 'hit', 'block', 'ko', 'round'].includes(name) && playClip('g:' + name, .9)) return;
    switch (name) {
      case 'punch': this.crack(.09, .35, 1600, .7); break; case 'kick': this.crack(.14, .4, 900, .8); this.thump(120, .12, .12); break;
      case 'hit': this.thump(110, .16, .35); this.crack(.07, .5, 2400, 1.2); break; case 'hithard': this.thump(70, .26, .45); this.crack(.12, .6, 1500, 1); this.crack(.2, .25, 300, .5); break;
      case 'block': this.tone(640, .07, 'triangle', .06, -200); this.crack(.05, .25, 3000, 2); break;
      case 'whoosh': this.tone(300, .25, 'sawtooth', .04, 500); break; case 'special': this.tone(220, .3, 'sawtooth', .06, 660); break;
      case 'thunder': this.noise(.6, .2, 400); this.tone(60, .5, 'sawtooth', .1, -30); break; case 'beam': this.tone(900, .35, 'sawtooth', .05, -500); break;
      case 'super': [0, .08, .16].forEach((d, i) => setTimeout(() => this.tone(110 * (i + 1), .5, 'square', .08), d * 1000)); this.noise(.5, .1, 300); break;
      case 'snap': this.noise(.05, .3, 4000); setTimeout(() => this.tone(80, 1.2, 'sine', .12, -60), 80); break;
      case 'ko': this.tone(400, .7, 'sawtooth', .1, -350); break; case 'round': this.tone(440, .15, 'square', .06); setTimeout(() => this.tone(660, .25, 'square', .06), 150); break;
      case 'ui': this.tone(880, .05, 'square', .04); break; case 'win': [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.tone(f, .25, 'triangle', .07), i * 110)); break; case 'tick': this.tone(1200, .04, 'square', .03); break;
    }
  }
};

/* ============================================================ */
/*  Drawing                                                      */
/* ============================================================ */
function limb(ctx, x1, y1, x2, y2, len, bend, width, color) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, slack = Math.max(0, len * len - d * d / 4), h = Math.sqrt(slack) * .9, nx = -dy / d * bend, ny = dx / d * bend;
  const mx = (x1 + x2) / 2 + nx * h, my = (y1 + y2) / 2 + ny * h;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(mx, my); ctx.lineTo(x2, y2); ctx.stroke();
}
function glow(ctx, x, y, rx, ry, color, alpha) { const r = Math.max(rx, ry); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx * 1.3, ry * 1.3, 0, 0, TAU); ctx.fill(); ctx.restore(); }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function poly(ctx, pts, fill) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } }
function star(ctx, x, y, r, fill) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .45 : r, a = -Math.PI / 2 + i / 10 * TAU; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
const STONES = ['#9b5cff', '#3fa9ff', '#e23636', '#f0b429', '#35c26b', '#ff8c1a'];

function drawShield(ctx, x, y, rot = 0, s = 1) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); const rings = [['#c8102e', 24], ['#f2f2f2', 18], ['#c8102e', 12], ['#1f4fa3', 7]]; for (const [c, r] of rings) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); } star(ctx, 0, 0, 6, '#fff'); ctx.restore(); }
function drawHammer(ctx, x, y, rot = 0, s = 1) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.fillStyle = '#5a3a1f'; rrect(ctx, -3, -6, 6, 40, 2); ctx.fill(); ctx.fillStyle = '#8f9aa8'; rrect(ctx, -16, -26, 32, 22, 3); ctx.fill(); ctx.fillStyle = '#c9d2dc'; ctx.fillRect(-14, -24, 28, 5); ctx.restore(); }
function drawGauntlet(ctx, x, y, s = 1) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#d4a017'; rrect(ctx, -12, -14, 24, 26, 7); ctx.fill(); ctx.fillStyle = '#b8860b'; ctx.fillRect(-12, -2, 24, 3); STONES.forEach((c, i) => { const px = [-7, 0, 7, -5, 5, 0][i], py = [-9, -11, -9, -2, -2, 4][i]; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, TAU); ctx.fill(); }); ctx.restore(); }
function drawDagger(ctx, x, y, rot = 0) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = '#d9dde3'; poly(ctx, [[0, -18], [4, -4], [0, 2], [-4, -4]], '#d9dde3'); ctx.fillStyle = '#d4a017'; ctx.fillRect(-6, 1, 12, 3); ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-2, 4, 4, 9); ctx.restore(); }

/* head: facing +x, origin at head centre, radius ~20 */
function drawHead(ctx, h, o = {}) {
  const r = 20, t = o.t || 0, mouth = o.mouth || 'calm';
  const eyes = (c = '#1a1210', w = 2.4) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(6, -3, w, 0, TAU); ctx.arc(15, -3, w, 0, TAU); ctx.fill(); };
  const brows = (angry = false) => { ctx.strokeStyle = '#1a1210'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1, -9 + (angry ? 2 : 0)); ctx.lineTo(9, -10 - (angry ? 2 : 0)); ctx.moveTo(12, -10 - (angry ? 2 : 0)); ctx.lineTo(19, -9 + (angry ? 2 : 0)); ctx.stroke(); };
  const mouthDraw = (col = '#7a3b2e') => { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); if (mouth === 'open') { ctx.fillStyle = '#4a1612'; ctx.ellipse(12, 9, 4, 5, 0, 0, TAU); ctx.fill(); } else if (mouth === 'grin') { ctx.arc(11, 6, 6, .1 * Math.PI, .9 * Math.PI); ctx.stroke(); } else { ctx.moveTo(7, 9); ctx.quadraticCurveTo(12, 12, 17, 8); ctx.stroke(); } };
  const face = (skin) => { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-r + 1, 2, 5, 0, TAU); ctx.fill(); };
  switch (h) {
    case 'ironman': {
      ctx.fillStyle = '#b3121f'; rrect(ctx, -r - 1, -r - 2, r * 2 + 2, r * 2 + 6, 12); ctx.fill();
      poly(ctx, [[-2, -r + 2], [r + 1, -r + 6], [r + 1, 14], [6, r + 2], [-6, r + 1], [-8, -4]], '#f0b429');
      ctx.fillStyle = '#b3121f'; ctx.fillRect(-r - 1, 4, 8, 10);
      ctx.fillStyle = o.glow ? '#fff' : '#bfefff'; poly(ctx, [[2, -4], [9, -6], [9, -2], [2, -1]], ctx.fillStyle); poly(ctx, [[12, -6], [19, -5], [19, -1], [12, -2]], ctx.fillStyle); ctx.strokeStyle = '#8c6d12'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(5, 10); ctx.lineTo(17, 9); ctx.stroke(); break; }
    case 'cap': {
      face('#f1c9a5'); eyes(); brows(); mouthDraw();
      ctx.fillStyle = '#1f4fa3'; ctx.beginPath(); ctx.arc(0, -1, r + 1.5, Math.PI * .9, Math.PI * .12); ctx.lineTo(r + 2, -7); ctx.quadraticCurveTo(0, -3, -r - 1, 1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1f4fa3'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r + 1, 3); ctx.quadraticCurveTo(-r - 2, 16, -4, 19); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 6, -11);
      poly(ctx, [[-8, -16], [-22, -13], [-22, -9], [-8, -10]], '#fff'); break; }
    case 'thor': {
      ctx.fillStyle = '#e8c45c'; rrect(ctx, -r - 6, -8, r * 2 + 8, 40, 10); ctx.fill();
      face('#f1c9a5'); eyes('#2b6fd6'); brows(); 
      ctx.fillStyle = '#d9b14a'; ctx.beginPath(); ctx.moveTo(-r + 3, 4); ctx.quadraticCurveTo(0, r + 10, r + 1, 5); ctx.lineTo(r - 1, 12); ctx.quadraticCurveTo(0, r + 3, -r + 5, 10); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(1, 9, r - 3, .2 * Math.PI, .8 * Math.PI); ctx.fill();
      mouthDraw('#5a2a1e');
      ctx.fillStyle = '#e8c45c'; ctx.beginPath(); ctx.arc(0, -3, r + 1, Math.PI, 0); ctx.lineTo(r + 1, -9); ctx.quadraticCurveTo(2, -16, -r - 1, -5); ctx.closePath(); ctx.fill();
      if (o.glow) { ctx.fillStyle = '#bfefff'; eyes('#dff6ff', 3); } break; }
    case 'hulk': {
      ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(0, 1, r + 3, r + 1, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-r - 1, 2, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.moveTo(-r - 3, -6); ctx.quadraticCurveTo(-4, -r - 14, r + 2, -8); ctx.lineTo(r + 2, -2); ctx.quadraticCurveTo(8, -r - 2, -r - 3, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.moveTo(-r, -8); ctx.lineTo(-10, -r - 10); ctx.lineTo(-2, -r - 2); ctx.lineTo(6, -r - 12); ctx.lineTo(12, -r); ctx.lineTo(r + 2, -r - 4); ctx.lineTo(r + 3, -4); ctx.quadraticCurveTo(0, -12, -r, -4); ctx.closePath(); ctx.fill();
      eyes('#1a1a1a'); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(9, -7); ctx.moveTo(12, -7); ctx.lineTo(21, -11); ctx.stroke();
      ctx.fillStyle = '#2a0f0f'; rrect(ctx, 4, 7, 15, 7, 2); ctx.fill(); ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(5 + i * 3.6, 7, 2.4, 3); break; }
    case 'spiderman': {
      ctx.fillStyle = '#d7262c'; ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * .32; ctx.beginPath(); ctx.moveTo(3, -4); ctx.lineTo(3 + Math.cos(a) * 26, -4 + Math.sin(a) * 26); ctx.stroke(); } for (let rr = 6; rr < 24; rr += 6) { ctx.beginPath(); ctx.arc(3, -4, rr, -Math.PI * .95, Math.PI * .3); ctx.stroke(); }
      const eye = (x, flip) => { ctx.save(); ctx.translate(x, -2); ctx.scale(flip, 1); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(-7, -8); ctx.quadraticCurveTo(9, -10, 8, 1); ctx.quadraticCurveTo(4, 8, -6, 2); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-5, -6); ctx.quadraticCurveTo(7, -8, 6, 0); ctx.quadraticCurveTo(3, 6, -4, 1); ctx.closePath(); ctx.fill(); ctx.restore(); };
      eye(12, 1); eye(0, -1); break; }
    case 'panther': {
      ctx.fillStyle = '#17171f'; ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, TAU); ctx.fill();
      poly(ctx, [[-14, -14], [-10, -r - 12], [-2, -17]], '#17171f'); poly(ctx, [[6, -17], [12, -r - 12], [16, -13]], '#17171f');
      ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-12, -14); ctx.lineTo(-9, -24); ctx.moveTo(8, -15); ctx.lineTo(11, -24); ctx.moveTo(-6, 6); ctx.lineTo(-2, 16); ctx.moveTo(18, 6); ctx.lineTo(16, 15); ctx.stroke();
      ctx.fillStyle = '#e6ecf2'; poly(ctx, [[1, -5], [9, -8], [10, -2], [3, 0]], '#e6ecf2'); poly(ctx, [[12, -8], [20, -5], [19, 0], [12, -2]], '#e6ecf2'); break; }
    case 'strange': {
      ctx.fillStyle = '#2a2320'; rrect(ctx, -r - 2, -10, r * 2 + 4, 22, 8); ctx.fill();
      face('#f1c9a5'); eyes(); brows(); mouthDraw();
      ctx.fillStyle = '#2a2320'; ctx.beginPath(); ctx.ellipse(10, 6, 5, 2.6, .1, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(12, 15, 5, 5, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -3, r + 1, Math.PI, 0); ctx.lineTo(r + 1, -8); ctx.quadraticCurveTo(0, -14, -r - 1, -4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b9b9b9'; poly(ctx, [[-r - 1, -4], [-14, -10], [-13, 2], [-r - 1, 4]], '#b9b9b9'); ctx.fillRect(-4, -r - 1, 3, 5); break; }
    case 'thanos': {
      ctx.fillStyle = '#9b6bc9'; rrect(ctx, -r - 2, -r, r * 2 + 4, r * 2 + 10, 12); ctx.fill(); ctx.beginPath(); ctx.arc(-r - 1, 2, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7a4fa6'; rrect(ctx, -10, 6, 30, 20, 8); ctx.fill(); ctx.strokeStyle = '#5f3b86'; ctx.lineWidth = 1.5; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-4 + i * 7, 10); ctx.lineTo(-4 + i * 7, 24); ctx.stroke(); }
      eyes('#3fa9ff'); brows(true); ctx.strokeStyle = '#4a2a6a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, 7); ctx.lineTo(18, 7); ctx.stroke(); break; }
    case 'loki': {
      ctx.fillStyle = '#1a1a1a'; rrect(ctx, -r - 4, -6, r * 2 + 4, 40, 8); ctx.fill();
      face('#f3d9c6'); eyes('#2f8f4e'); brows(); ctx.strokeStyle = '#7a3b2e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, 9); ctx.quadraticCurveTo(13, 13, 18, 6); ctx.stroke();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(0, -3, r + 1, Math.PI, 0); ctx.lineTo(r + 1, -8); ctx.quadraticCurveTo(0, -14, -r - 1, -4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d4a017'; rrect(ctx, -r - 2, -r - 2, r * 2 + 4, 12, 4); ctx.fill();
      ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-10, -r); ctx.quadraticCurveTo(-26, -r - 30, -6, -r - 44); ctx.stroke(); ctx.beginPath(); ctx.moveTo(10, -r); ctx.quadraticCurveTo(-4, -r - 30, 16, -r - 44); ctx.stroke(); break; }
    case 'venom': {
      ctx.fillStyle = '#0e0e14'; ctx.beginPath(); ctx.ellipse(1, 1, r + 2, r + 3, 0, 0, TAU); ctx.fill();
      const veye = (x, flip) => { ctx.save(); ctx.translate(x, -4); ctx.scale(flip, 1); poly(ctx, [[-10, -4], [-2, -12], [10, -6], [12, 2], [4, 8], [-8, 4]], '#f4f4f4'); ctx.restore(); };
      veye(12, 1); veye(-2, -1);
      ctx.fillStyle = '#2a0b0b'; ctx.beginPath(); ctx.moveTo(-8, 8); ctx.quadraticCurveTo(8, 22, r + 2, 6); ctx.quadraticCurveTo(8, 12, -8, 8); ctx.fill();
      ctx.fillStyle = '#fff'; for (let i = 0; i < 7; i++) { const x = -6 + i * 4.4, y = 9 + Math.sin(i / 6 * Math.PI) * 4; poly(ctx, [[x, y], [x + 2, y + 5], [x + 4, y]], '#fff'); poly(ctx, [[x, y + 9 - Math.sin(i / 6 * Math.PI) * 3], [x + 2, y + 4], [x + 4, y + 9 - Math.sin(i / 6 * Math.PI) * 3]], '#fff'); }
      if (mouth === 'open' || mouth === 'grin') { ctx.strokeStyle = '#e06c8a'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(10, 14); ctx.quadraticCurveTo(22, 22, 26 + Math.sin(t * .02) * 3, 30); ctx.stroke(); } break; }
  }
}

function poseFor(f, t) {
  const p = { lean: 0, rot: 0, dy: 0, headTilt: 0, mouth: 'calm', handF: [26, -96], handB: [-8, -102], footF: [14, 0], footB: [-14, 0], glow: 0, alpha: 1 };
  const s = f.state, st = f.t, prog = (a, b) => clamp((st - a) / (b - a), 0, 1), bell = x => Math.sin(clamp(x, 0, 1) * Math.PI);
  switch (s) {
    case 'idle': p.dy = Math.sin(t * .004) * 2; p.handF[1] += Math.sin(t * .004) * 2; break;
    case 'walk': { const ph = t * .012 * (f.vx < 0 ? -1 : 1) * f.facing; p.footF = [14 + Math.sin(ph) * 18, -Math.max(0, Math.sin(ph)) * 10]; p.footB = [-14 - Math.sin(ph) * 18, -Math.max(0, -Math.sin(ph)) * 10]; p.handF[0] += Math.sin(ph) * 6; break; }
    case 'jump': p.footF = [10, -34]; p.footB = [-6, -26]; p.handF = [30, -130]; p.handB = [-22, -125]; if (f.hovering) { p.footF = [8, -12]; p.footB = [-8, -10]; p.handF = [34, -70]; p.handB = [-30, -70]; p.glow = .5; } break;
    case 'punch': { const e = bell(prog(40, 260)); p.handF = [26 + e * 62, -108 + e * 4]; p.lean = e * 6; p.handB = [-14 - e * 6, -100]; p.mouth = e > .5 ? 'open' : 'calm'; break; }
    case 'kick': { const e = bell(prog(60, 420)); p.footF = [12 + e * 90, -e * 70]; p.lean = -e * 10; p.handF = [10 - e * 20, -110]; p.handB = [-20, -95]; p.footB = [-8, 0]; break; }
    case 'crouch': p.dy = 34; p.footF = [24, -34]; p.footB = [-22, -34]; p.handF = [26, -80]; p.handB = [-10, -84]; p.lean = 6; break;
    case 'uppercut': { const e = bell(prog(40, 300)); p.dy = 34 * (1 - e); p.handF = [20 + e * 20, -90 - e * 110]; p.handB = [-16, -90]; p.lean = e * 4; p.mouth = 'open'; break; }
    case 'sweep': { const e = bell(prog(60, 320)); p.dy = 30; p.footF = [20 + e * 90, -30 + e * 20]; p.footB = [-20, -30]; p.handF = [10, -70]; p.handB = [-20, -70]; p.lean = -e * 8; break; }
    case 'hit': { const e = 1 - prog(0, 320); p.lean = -14 * e; p.handF = [-4, -120 - 10 * e]; p.handB = [-22, -90]; p.headTilt = -.3 * e; p.mouth = 'open'; break; }
    case 'bound': p.lean = -2; p.handF = [12, -90]; p.handB = [-10, -92]; p.footF = [8, 0]; p.footB = [-8, 0]; p.mouth = 'open'; p.dy = Math.sin(t * .05) * 1.5; break;
    case 'down': case 'ko': { const e = prog(0, 260); p.rot = -Math.PI / 2 * e; p.handF = [10, -110]; p.handB = [-10, -110]; p.mouth = 'open'; p.footF = [10, 0]; p.footB = [-10, 0]; break; }
    case 'getup': { const e = 1 - prog(0, 300); p.rot = -Math.PI / 2 * e; p.handF = [10, -110]; p.handB = [-10, -110]; break; }
    case 'win': p.handB = [-14, -178 + Math.sin(t * .01) * 4]; p.handF = [26, -100]; p.mouth = 'grin'; p.dy = Math.abs(Math.sin(t * .008)) * -6; break;
    case 'special': { const k = f.specialKind, e = bell(prog(0, f.actTotal || 500)); p.handF = [20 + e * 50, -130 + e * 10]; p.lean = e * 4; p.mouth = 'open'; p.glow = e;
      if (k === 'clap') { const c = st < 220 ? st / 220 : 1; p.handF = [lerp(40, 24, c), -120]; p.handB = [lerp(-40, 20, c), -120]; p.footF = [24, 0]; p.footB = [-24, 0]; }
      if (k === 'lightning') { p.handF = [10, -180]; p.handB = [-10, -100]; }
      if (k === 'kinetic') { p.lean = 18; p.handF = [44, -90]; p.handB = [-30, -110]; p.footB = [-30, 0]; }
      if (k === 'portal') { p.alpha = st < 200 ? 1 : (st < 300 ? 0 : 1); p.handF = [50, -110]; }
      if (k === 'web' || k === 'tendril') { p.handF = [60, -118]; p.handB = [-10, -100]; }
      if (k === 'shield') { const c = st < 180 ? st / 180 : 1; p.handB = [lerp(-30, 50, c), lerp(-150, -115, c)]; p.handF = [10, -100]; }
      if (k === 'daggers') { p.handF = [56, -120]; p.handB = [-30, -140]; }
      break; }
    case 'super': p.handF = [22, -176]; p.handB = [-18, -172]; p.mouth = 'open'; p.glow = 1; p.dy = -2 + Math.sin(t * .03) * 2;
      if (f.def.sup.kind === 'snap') { p.handF = [36, -150]; p.handB = [-20, -100]; }
      if (f.def.sup.kind === 'unibeam') { p.handF = [34, -90]; p.handB = [-34, -90]; p.lean = 4; }
      if (f.def.sup.kind === 'webswing') { p.handF = [10, -190]; p.handB = [0, -100]; p.footF = [40, -40]; p.footB = [-10, -10]; p.dy = 0; }
      if (f.def.sup.kind === 'smash') { p.handF = [30, -150]; p.handB = [-30, -150]; p.footF = [20, -20]; p.footB = [-20, -20]; }
      break;
  }
  return p;
}

/* Sample arm / leg colours from the sprite so drawn limbs match the costume. */
function limbColors(id, img) {
  if (assets.limbs[id]) return assets.limbs[id];
  let arm = heroById(id).color, leg = arm;
  try { const c = document.createElement('canvas'); c.width = 24; c.height = 48; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 48);
    const avg = (y0, y1) => { const d = x.getImageData(0, y0, 24, y1 - y0).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return n ? `rgb(${r / n | 0},${g / n | 0},${b / n | 0})` : null; };
    arm = avg(12, 22) || arm; leg = avg(30, 44) || leg; } catch { /* tainted canvas on file:// — keep fallback colours */ }
  return assets.limbs[id] = { arm, leg };
}
function drawSpriteFighter(ctx, f, t, img, opts = {}) {
  const d = f.def, sc = d.scale || 1, meta = SPRITE_META[d.id] || d.meta || {}, cut = meta.cut || 1, full = 182 * sc, hgt = full * cut, wdt = img.width / img.height * hgt;
  const s = f.state, st = f.t, prog = (a, b) => clamp((st - a) / (b - a), 0, 1), bell = x => Math.sin(clamp(x, 0, 1) * Math.PI);
  const T = { dx: 0, rot: 0, sx: 1, sy: 1, dy: 0, glow: 0, hRot: 0, tRot: 0, lRot: 0, arm: 0, leg: 0, armB: 0, armUp: 0, legLow: 0 };
  switch (s) {
    case 'idle': T.sy = 1 + Math.sin(t * .004) * .012; T.hRot = Math.sin(t * .003) * .03; T.tRot = Math.sin(t * .004) * .015; break;
    case 'walk': { const ph = Math.sin(t * .015); T.lRot = ph * .16; T.tRot = -ph * .05 + clamp(f.vx * f.facing * .00012, -.08, .08); T.hRot = ph * .04; T.dy = -Math.abs(ph) * 5; break; }
    case 'jump': T.lRot = .18; T.tRot = .06; T.hRot = -.08; if (f.hovering) { T.lRot = .05; T.glow = .4; } break;
    case 'punch': { const e = bell(prog(20, 200)); T.dx = e * 22; T.tRot = e * .22; T.hRot = -e * .12; T.arm = e; T.lRot = -e * .08; break; }
    case 'kick': { const e = bell(prog(50, 340)); T.dx = e * 12; T.lRot = -e * .55; T.tRot = -e * .2; T.hRot = e * .1; T.leg = e; break; }
    case 'crouch': T.sy = .82; T.sx = 1.06; T.tRot = .12; T.hRot = -.05; T.lRot = .1; break;
    case 'uppercut': { const e = bell(prog(40, 300)); T.sy = lerp(.82, 1.06, e); T.sx = lerp(1.06, .98, e); T.tRot = -.15 * e; T.hRot = -.15 * e; T.armUp = e; T.dy = -e * 10; break; }
    case 'sweep': { const e = bell(prog(60, 320)); T.sy = .8; T.sx = 1.06; T.tRot = -.1 * e; T.lRot = -.5 * e; T.leg = e; T.legLow = 1; break; }
    case 'hit': { const e = 1 - prog(0, f.stunT || 320); T.hRot = -.4 * e; T.tRot = -.25 * e; T.dx = -e * 10; T.lRot = .1 * e; break; }
    case 'bound': T.hRot = Math.sin(t * .05) * .08; T.tRot = Math.sin(t * .04) * .05; break;
    case 'down': case 'ko': T.rot = -Math.PI / 2 * prog(0, 260); break;
    case 'getup': T.rot = -Math.PI / 2 * (1 - prog(0, 300)); break;
    case 'win': T.sy = 1 + Math.abs(Math.sin(t * .008)) * .05; T.dy = -Math.abs(Math.sin(t * .008)) * 12; T.hRot = -.15; T.tRot = -.08; T.armB = Math.abs(Math.sin(t * .008)); break;
    case 'special': { const e = bell(prog(0, f.actTotal || 500)); T.dx = e * 12; T.glow = e; T.tRot = e * .18; T.hRot = -e * .08; T.arm = ['throw', 'repulsor', 'shield', 'web', 'tendril', 'powerstone', 'daggers', 'lightning'].includes(f.specialKind) ? e : 0; if (f.specialKind === 'kinetic' || f.specialKind === 'dash') { T.rot = .22; T.lRot = .15; } if (f.specialKind === 'clap') { T.armB = e; T.arm = e * .6; } break; }
    case 'super': T.glow = 1; T.tRot = -.12; T.hRot = -.14; T.armB = 1; T.dy = -4 + Math.sin(t * .03) * 2; break;
  }
  if (f.dashT > 0) { T.rot = .18; T.lRot = .2; }
  if (meta.hover) T.dy += -10 + Math.sin(t * .0028 + f.side) * 4;
  let A; if (opts.flat) A = T; else if (opts.noUpdate) A = f.anim || T; else { A = f.anim || (f.anim = { ...T }); const k = ['down', 'ko', 'getup'].includes(s) ? 1 : .3; for (const key in T) A[key] = lerp(A[key], T[key], k); }
  const src = meta.bust ? fadedSprite(d.id, img) : img, lc = limbColors(d.id, img);
  ctx.save(); ctx.translate(f.x, f.y); ctx.globalAlpha = (opts.alpha == null ? 1 : opts.alpha) * (1 - (f.dust || 0)) * (s === 'special' && f.specialKind === 'portal' && st > 200 && st < 300 ? 0 : 1);
  if (!opts.noShadow) { const lift = clamp((GROUND - f.y) / 300, 0, 1); ctx.fillStyle = `rgba(0,0,0,${.38 - lift * .2})`; ctx.beginPath(); ctx.ellipse(0, 3, wdt * .34 * (1 - lift * .3), 7 * (1 - lift * .3), 0, 0, TAU); ctx.fill(); }
  if (meta.hover && !opts.flat) { // thruster / levitation glow
    const col = d.id === 'ironman' ? '#7fd9ff' : d.color;
    if (d.id === 'ironman') { for (const ox of [-wdt * .14, wdt * .14]) { const fl = 18 + Math.sin(t * .03 + ox) * 6; glow(ctx, ox, -10 + A.dy + fl * .5, 9, fl * .8, col, .8); } }
    else glow(ctx, 0, -14, wdt * .3, 14, col, .55);
  } else if (meta.bust && !opts.flat) glow(ctx, 0, -8, wdt * .34, 10, '#9aa0b8', .3);
  ctx.translate(0, A.dy); ctx.scale(f.facing, 1); ctx.rotate(A.rot);
  if (A.glow > .02 && !opts.flat) glow(ctx, 0, -full / 2, wdt * .5, full * .52, s === 'super' ? '#ffd166' : d.color, A.glow * .45);
  const flashing = f.flashHit > 0 && !opts.flat;
  ctx.translate(A.dx, 0); ctx.scale(A.sx, A.sy);
  // ---- three-band puppet: legs (pivot hips, top), torso (pivot hips, bottom), head (pivot neck, bottom) ----
  const ih = src.height, iw = src.width, hipY = -full + hgt * .56, neckY = -full + hgt * .2, ov = .035;
  const band = (y0, y1, px, py, rot, dyOff = 0) => { const sy0 = Math.max(0, (y0 - ov) * ih), sy1 = Math.min(ih, (y1 + ov) * ih); const dh = (sy1 - sy0) / ih * hgt, dy0 = -full + sy0 / ih * hgt; ctx.save(); ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py + dyOff); ctx.drawImage(src, 0, sy0, iw, sy1 - sy0, -wdt / 2, dy0, wdt, dh); ctx.restore(); };
  // back arm (behind body) when raised / blocking
  const shoulderY = -full + hgt * .33, shX = wdt * .2;
  const limbStroke = (x0, y0, cx1, cy1, x1, y1, w, col) => { for (const [ww, cc] of [[w + 5, 'rgba(0,0,0,.45)'], [w, col]]) { ctx.strokeStyle = cc; ctx.lineWidth = ww; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx1, cy1, x1, y1); ctx.stroke(); } };
  const fist = (x, y, r, col) => { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, TAU); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(x - r * .3, y - r * .3, r * .45, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + r * .45, y + i * r * .5, r * .22, 0, TAU); ctx.stroke(); } };
  if (A.armB > .05) { const ex = -shX - 8 - A.armB * 12 * sc, ey = shoulderY + 10 - A.armB * 58 * sc; limbStroke(-shX, shoulderY + 4, -shX - 22 * sc, shoulderY - 10, ex, ey, 11 * sc, lc.arm); fist(ex, ey, 8.5 * sc, lc.arm); }
  // leg (kick) drawn behind torso
  if (A.leg > .05) { const hx = wdt * .08, hy = hipY, kx = hx + A.leg * 88 * sc, ky = A.legLow > .5 ? hy + 40 * sc : hy + (1 - A.leg) * 60 * sc - A.leg * 6; limbStroke(hx, hy, hx + 30 * sc, hy + 14, kx, ky, 15 * sc, lc.leg); ctx.save(); ctx.translate(kx, ky); ctx.fillStyle = 'rgba(0,0,0,.45)'; rrect(ctx, -16 * sc, -11 * sc, 40 * sc, 22 * sc, 8); ctx.fill(); ctx.fillStyle = shade(d.color, -.35); rrect(ctx, -14 * sc, -9 * sc, 36 * sc, 18 * sc, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.2)'; rrect(ctx, -10 * sc, -7 * sc, 20 * sc, 6 * sc, 3); ctx.fill(); ctx.restore(); for (let i = -1; i <= 1; i++) { ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(kx - 30, ky + i * 8); ctx.lineTo(kx - 60 - A.leg * 25, ky + i * 10); ctx.stroke(); } }
  band(.54, 1, 0, hipY, A.lRot * (A.leg > .05 ? .35 : 1));
  band(.18, .56, 0, hipY, A.tRot);
  band(0, .22, 0, neckY, A.hRot + A.tRot);
  if (flashing) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= .6; band(.54, 1, 0, hipY, A.lRot * (A.leg > .05 ? .35 : 1)); band(.18, .56, 0, hipY, A.tRot); band(0, .22, 0, neckY, A.hRot + A.tRot); ctx.restore(); }
  if (A.armUp > .05) { const fx = shX + 26 * sc, fy = shoulderY + 30 - A.armUp * 120 * sc; limbStroke(shX, shoulderY, shX + 34 * sc, shoulderY + 10, fx, fy, 11 * sc, lc.arm); fist(fx, fy, 11 * sc, lc.arm); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(fx + i * 9, fy + 24); ctx.lineTo(fx + i * 11, fy + 54 + A.armUp * 20); ctx.stroke(); } }
  // front arm punch / throw
  if (A.arm > .05) { const fx = shX + A.arm * 66 * sc, fy = shoulderY - 2 * sc + (1 - A.arm) * 24; limbStroke(shX, shoulderY, shX + 22 * sc, shoulderY + 16, fx, fy, 11 * sc, lc.arm); fist(fx, fy, 11 * sc, d.id === 'thanos' ? '#d4a017' : lc.arm);
    ctx.save(); ctx.translate(fx, fy);
    if (s === 'punch') { ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-24, i * 8); ctx.lineTo(-56 - A.arm * 20, i * 10); ctx.stroke(); } }
    ctx.restore(); }
  ctx.restore();
}
function drawFighter(ctx, f, t, opts = {}) {
  const img = assets.sprites[f.def.id]; if (img && !opts.vector) return drawSpriteFighter(ctx, f, t, img, opts);
  const d = f.def, id = d.vecId || d.id, p = opts.pose || poseFor(f, t), sc = d.scale || 1;
  const skin = { hulk: '#4caf50', thanos: '#9b6bc9', venom: '#0e0e14', spiderman: '#d7262c', panther: '#17171f', ironman: '#b3121f' }[id] || '#f1c9a5';
  const C = {
    ironman: { torso: '#b3121f', limb: '#b3121f', glove: '#f0b429', boot: '#f0b429' }, cap: { torso: '#1f4fa3', limb: '#1f4fa3', glove: '#c8102e', boot: '#c8102e' },
    thor: { torso: '#3b434d', limb: '#2a2f36', glove: '#8f9aa8', boot: '#2a2f36' }, hulk: { torso: '#4caf50', limb: '#4caf50', glove: '#4caf50', boot: '#4caf50', leg: '#5b3a9b' },
    spiderman: { torso: '#d7262c', limb: '#2a4fb0', glove: '#d7262c', boot: '#d7262c', leg: '#2a4fb0' }, panther: { torso: '#17171f', limb: '#17171f', glove: '#20202a', boot: '#17171f' },
    strange: { torso: '#2a5fb8', limb: '#2a5fb8', glove: '#f1c9a5', boot: '#2b2b2b', leg: '#2b2b2b' }, thanos: { torso: '#d4a017', limb: '#9b6bc9', glove: '#9b6bc9', boot: '#3a2a55', leg: '#3a2a55' },
    loki: { torso: '#1f6b3a', limb: '#111', glove: '#d4a017', boot: '#111', leg: '#111' }, venom: { torso: '#0e0e14', limb: '#0e0e14', glove: '#0e0e14', boot: '#0e0e14' }
  }[id];
  ctx.save(); ctx.translate(f.x, f.y + p.dy); ctx.scale(f.facing * sc, sc); ctx.rotate(p.rot); ctx.globalAlpha = p.alpha * (opts.alpha == null ? 1 : opts.alpha) * (1 - (f.dust || 0));
  if (p.glow > 0 && !opts.flat) glow(ctx, 0, -85, 60, 95, f.state === 'super' ? '#ffd166' : d.color, p.glow * .5);
  
  if (!opts.noShadow) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, -p.dy / sc + 2, 34, 7, 0, 0, TAU); ctx.fill(); }
  const hipY = -70, shY = -126, lean = p.lean, hipX = lean * .4, shX = lean;
  // cape (behind)
  const cape = { thor: '#b3121f', strange: '#b3121f', loki: '#1f6b3a' }[id];
  if (cape) { const sway = Math.sin(t * .006) * 6 + (f.vx ? -f.vx * .02 : 0); ctx.fillStyle = cape; ctx.beginPath(); ctx.moveTo(shX - 22, shY + 2); ctx.lineTo(shX + 16, shY + 2); ctx.quadraticCurveTo(shX + 4 + sway, hipY + 20, shX - 2 + sway * 2, hipY + 50); ctx.lineTo(shX - 46 + sway * 2, hipY + 52); ctx.quadraticCurveTo(shX - 40 + sway, hipY, shX - 22, shY + 2); ctx.closePath(); ctx.fill(); if (id === 'strange') { ctx.fillStyle = '#8f0f1a'; poly(ctx, [[shX - 26, shY - 6], [shX - 14, shY - 14], [shX + 14, shY - 14], [shX + 22, shY - 6], [shX + 16, shY + 2], [shX - 22, shY + 2]], '#8f0f1a'); } }
  // legs
  const legCol = C.leg || C.limb, legW = id === 'hulk' || id === 'thanos' ? 16 : 12;
  limb(ctx, hipX - 8, hipY, p.footB[0], p.footB[1], 38, -1, legW, shade(legCol, -.2)); limb(ctx, hipX + 8, hipY, p.footF[0], p.footF[1], 38, -1, legW, legCol);
  if (id === 'hulk') { ctx.fillStyle = '#5b3a9b'; poly(ctx, [[hipX - 20, hipY - 4], [hipX + 20, hipY - 4], [hipX + 22, hipY + 26], [hipX + 14, hipY + 20], [hipX + 6, hipY + 30], [hipX - 4, hipY + 22], [hipX - 12, hipY + 30], [hipX - 22, hipY + 24]], '#5b3a9b'); }
  ctx.fillStyle = C.boot; for (const ft of [p.footB, p.footF]) { if (id === 'hulk') { ctx.fillStyle = '#4caf50'; rrect(ctx, ft[0] - 9, ft[1] - 5, 22, 9, 4); ctx.fill(); } else { rrect(ctx, ft[0] - 8, ft[1] - 5, 20, 8, 3); ctx.fill(); } }
  // back arm
  const armW = id === 'hulk' || id === 'thanos' ? 15 : 10;
  limb(ctx, shX - 14, shY + 6, p.handB[0], p.handB[1], 34, 1, armW, shade(C.limb, -.15)); ctx.fillStyle = C.glove; ctx.beginPath(); ctx.arc(p.handB[0], p.handB[1], armW * .65, 0, TAU); ctx.fill();
  if (id === 'cap' && !f.shieldOut && !opts.noProp) drawShield(ctx, p.handB[0] - 6, p.handB[1] + 2, .2, 1.05);
  if (id === 'loki' && !opts.noProp) drawDagger(ctx, p.handB[0] + 4, p.handB[1] - 4, .6);
  // torso
  if (id === 'hulk') { ctx.fillStyle = '#4caf50'; poly(ctx, [[shX - 30, shY - 2], [shX + 30, shY - 2], [hipX + 20, hipY + 4], [hipX - 20, hipY + 4]], '#4caf50'); ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(shX, shY + 10); ctx.lineTo(hipX, hipY); ctx.moveTo(shX - 20, shY + 14); ctx.quadraticCurveTo(shX - 8, shY + 24, shX - 1, shY + 12); ctx.moveTo(shX + 20, shY + 14); ctx.quadraticCurveTo(shX + 8, shY + 24, shX + 1, shY + 12); ctx.stroke(); }
  else if (id === 'thanos') { ctx.fillStyle = '#9b6bc9'; poly(ctx, [[shX - 30, shY - 2], [shX + 30, shY - 2], [hipX + 20, hipY + 4], [hipX - 20, hipY + 4]], '#9b6bc9'); poly(ctx, [[shX - 24, shY + 2], [shX + 24, shY + 2], [hipX + 16, hipY + 2], [hipX - 16, hipY + 2]], '#2b4a8a'); ctx.fillStyle = '#d4a017'; poly(ctx, [[shX - 30, shY - 4], [shX - 6, shY + 2], [shX - 10, shY + 16], [shX - 30, shY + 12]], '#d4a017'); poly(ctx, [[shX + 30, shY - 4], [shX + 6, shY + 2], [shX + 10, shY + 16], [shX + 30, shY + 12]], '#d4a017'); ctx.fillRect(shX - 3, shY + 2, 6, 46); }
  else {
    poly(ctx, [[shX - 22, shY], [shX + 22, shY], [hipX + 17, hipY + 4], [hipX - 17, hipY + 4]], C.torso);
    switch (id) {
      case 'ironman': poly(ctx, [[shX - 14, shY + 2], [shX + 14, shY + 2], [shX + 10, shY + 30], [shX - 10, shY + 30]], '#f0b429'); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(shX, shY + 18, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#f0b429'; ctx.fillRect(hipX - 12, hipY - 6, 24, 5); break;
      case 'cap': star(ctx, shX, shY + 20, 9, '#fff'); for (let i = -2; i <= 2; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#c8102e'; ctx.fillRect(hipX + i * 6 - 3, hipY - 20, 6, 22); } ctx.fillStyle = '#6b4a2b'; ctx.fillRect(hipX - 17, hipY, 34, 5); break;
      case 'thor': for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { ctx.fillStyle = '#c9d2dc'; ctx.beginPath(); ctx.arc(shX - 7 + c * 14, shY + 12 + r * 14, 5, 0, TAU); ctx.fill(); } break;
      case 'spiderman': ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(shX, shY + 4); ctx.lineTo(shX - 20 + i * 10, hipY + 4); ctx.stroke(); } for (let y = shY + 14; y < hipY; y += 10) { ctx.beginPath(); ctx.moveTo(shX - 18, y); ctx.lineTo(shX + 18, y + 3); ctx.stroke(); } ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(shX, shY + 22, 3, 7, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; for (let i = -1; i <= 1; i += 2) for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(shX, shY + 18 + j * 4); ctx.lineTo(shX + i * 10, shY + 12 + j * 7); ctx.stroke(); } break;
      case 'panther': ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(shX - 16, shY + 4); ctx.lineTo(shX, shY + 34); ctx.lineTo(shX + 16, shY + 4); ctx.moveTo(shX - 10, shY + 40); ctx.lineTo(shX, shY + 52); ctx.lineTo(shX + 10, shY + 40); ctx.stroke(); ctx.fillStyle = '#c9d2dc'; for (let i = -3; i <= 3; i++) poly(ctx, [[shX + i * 5 - 1.5, shY + 2 + Math.abs(i)], [shX + i * 5 + 1.5, shY + 2 + Math.abs(i)], [shX + i * 5, shY + 9 + Math.abs(i)]], '#c9d2dc'); break;
      case 'strange': ctx.fillStyle = '#1e4a92'; ctx.fillRect(shX - 2, shY + 2, 4, 50); ctx.fillStyle = '#f0b429'; ctx.fillRect(hipX - 17, hipY - 4, 34, 5); ctx.fillStyle = '#b3121f'; ctx.fillRect(hipX - 4, hipY, 8, 22); ctx.fillStyle = '#d4a017'; ctx.beginPath(); ctx.arc(shX, shY + 22, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#35c26b'; ctx.beginPath(); ctx.arc(shX, shY + 22, 3.5, 0, TAU); ctx.fill(); break;
      case 'loki': poly(ctx, [[shX - 10, shY], [shX + 10, shY], [hipX + 6, hipY + 4], [hipX - 6, hipY + 4]], '#111'); ctx.fillStyle = '#d4a017'; ctx.fillRect(shX - 22, shY, 44, 4); ctx.fillRect(hipX - 17, hipY - 4, 34, 4); break;
      case 'venom': ctx.fillStyle = '#f4f4f4'; poly(ctx, [[shX, shY + 6], [shX + 8, shY + 20], [shX + 22, shY + 2], [shX + 12, shY + 26], [shX + 20, hipY + 2], [shX + 4, shY + 36], [shX, hipY + 2], [shX - 4, shY + 36], [shX - 20, hipY + 2], [shX - 12, shY + 26], [shX - 22, shY + 2], [shX - 8, shY + 20]], '#f4f4f4'); break;
    }
  }
  // front arm
  limb(ctx, shX + 14, shY + 6, p.handF[0], p.handF[1], 34, -1, armW, C.limb);
  if (id === 'thanos') drawGauntlet(ctx, p.handF[0], p.handF[1], 1); else { ctx.fillStyle = C.glove; ctx.beginPath(); ctx.arc(p.handF[0], p.handF[1], armW * .7, 0, TAU); ctx.fill(); }
  if (id === 'ironman') { ctx.fillStyle = '#bfefff'; ctx.beginPath(); ctx.arc(p.handF[0], p.handF[1], 3, 0, TAU); ctx.fill(); }
  if (id === 'panther') { ctx.strokeStyle = '#c9d2dc'; ctx.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(p.handF[0] + 2, p.handF[1] + i * 3); ctx.lineTo(p.handF[0] + 12, p.handF[1] + i * 4); ctx.stroke(); } }
  if (id === 'thor' && !opts.noProp) drawHammer(ctx, p.handF[0] + 4, p.handF[1] - 2, f.state === 'special' ? -1.2 : -.3, 1);
  if (id === 'loki' && !opts.noProp) drawDagger(ctx, p.handF[0] + 6, p.handF[1] - 2, .9);
  // neck + head
  ctx.fillStyle = skin; ctx.fillRect(shX - 5, shY - 12, 10, 14);
  ctx.save(); ctx.translate(shX + lean * .2, shY - 30); ctx.rotate(p.headTilt); drawHead(ctx, id, { t, mouth: p.mouth, glow: f.state === 'super' || p.glow > .5 }); ctx.restore();
  ctx.restore();
}
function refreshPortraits() { for (const [cv, d] of assets.portraitCanvases) if (cv.isConnected) drawPortrait(cv.getContext('2d'), d, cv.width); }
function drawPortrait(ctx, d, size, t = 0) {
  ctx.clearRect(0, 0, size, size);
  const img = assets.sprites[d.id];
  if (img) { const g = ctx.createLinearGradient(0, 0, 0, size); g.addColorStop(0, shade(d.color, -.3)); g.addColorStop(1, '#0b0d1a'); ctx.fillStyle = g; ctx.fillRect(0, 0, size, size); const side = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - side) / 2, 0, side, side, 0, 0, size, size); return; } const g = ctx.createLinearGradient(0, 0, 0, size); g.addColorStop(0, shade(d.color, -.4)); g.addColorStop(1, '#0b0d1a'); ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.save(); ctx.translate(size / 2, size * .8); const sc = size / 86; ctx.scale(sc, sc);
  const vid = d.vecId || d.id; const torso = { ironman: '#b3121f', cap: '#1f4fa3', thor: '#3b434d', hulk: '#4caf50', spiderman: '#d7262c', panther: '#17171f', strange: '#2a5fb8', thanos: '#d4a017', loki: '#1f6b3a', venom: '#0e0e14' }[vid];
  ctx.fillStyle = torso; ctx.beginPath(); ctx.ellipse(0, 36, 36, 18, 0, 0, TAU); ctx.fill();
  const skin = { hulk: '#4caf50', thanos: '#9b6bc9', venom: '#0e0e14', spiderman: '#d7262c', panther: '#17171f', ironman: '#b3121f' }[vid] || '#f1c9a5'; ctx.fillStyle = skin; ctx.fillRect(-6, 10, 12, 16);
  drawHead(ctx, vid, { t }); ctx.restore();
}

/* ============================================================ */
/*  Stages                                                       */
/* ============================================================ */
const STAGES = [
  { id: 'newyork', name: 'New York Street', floor: '#1b1d2a', grade: 'rgba(40,60,140,.10)',
    back(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, '#05070f'); g.addColorStop(.6, '#141a3c'); g.addColorStop(1, '#3a2456'); ctx.fillStyle = g; ctx.fillRect(-200, -100, W + 400, 520);
      for (const [depth, col, h0, w0, y0] of [[0, '#0e1230', 150, 60, 400], [1, '#141a3a', 200, 72, 400], [2, '#1c2248', 260, 84, 402]]) {
        for (let i = -2; i < 16; i++) { const x = i * (w0 + 6) - 100 + depth * 23, h = h0 * .5 + ((i * 53 + depth * 31) % 100) * (1 + depth * .5); ctx.fillStyle = col; ctx.fillRect(x, y0 - h, w0, h); if (depth === 2) { ctx.fillStyle = 'rgba(255,214,140,.75)'; for (let r = 0; r < h / 18 - 1; r++) for (let c = 0; c < 3; c++) if ((i * 5 + r * 3 + c) % 4 !== 0) { ctx.globalAlpha = .25 + .55 * (((i + r + c) * 7) % 5) / 4; ctx.fillRect(x + 10 + c * 24, y0 - h + 10 + r * 18, 8, 9); } ctx.globalAlpha = 1; } }
      }
      poly(ctx, [[470, 402], [470, 120], [500, 60], [540, 60], [560, 130], [560, 402]], '#1a2150'); glow(ctx, 518, 110, 30, 30, '#3fa9ff', .6); ctx.fillStyle = '#5fc0ff'; ctx.font = 'bold 34px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 518, 120);
      const neon = (x, y, w, h, c) => { glow(ctx, x + w / 2, y + h / 2, w * .8, h * 2.2, c, .35); ctx.fillStyle = c; rrect(ctx, x, y, w, h, 3); ctx.fill(); };
      neon(120, 250, 90, 14, '#ff3d7f'); neon(130, 272, 60, 10, '#ff3d7f'); neon(760, 230, 120, 16, '#35e0ff'); neon(790, 254, 60, 10, '#f0b429'); neon(300, 300, 50, 10, '#35c26b');
      ctx.fillStyle = 'rgba(80,110,200,.12)'; ctx.fillRect(-200, 300, W + 400, 110);
    },
    live(ctx, t) {
      ctx.strokeStyle = 'rgba(190,210,255,.28)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 70; i++) { const x = ((i * 97 + t * .9) % (W + 200)) - 100, y = ((i * 211 + t * 1.3) % 500) - 60; ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 26); } ctx.stroke();
      for (let i = 0; i < 5; i++) { const q = ((t * .0004 + i * .2) % 1); ctx.fillStyle = `rgba(200,200,220,${.18 * (1 - q)})`; ctx.beginPath(); ctx.ellipse(650 + Math.sin(q * 6 + i) * 20, 400 - q * 120, 24 + q * 30, 12 + q * 10, 0, 0, TAU); ctx.fill(); }
    },
    floorDraw(ctx) {
      const fl = ctx.createLinearGradient(0, 396, 0, H); fl.addColorStop(0, '#2b2e40'); fl.addColorStop(1, '#101220'); ctx.fillStyle = fl; ctx.fillRect(-200, 396, W + 400, H - 396 + 100);
      ctx.fillStyle = '#4a4f66'; ctx.fillRect(-200, 394, W + 400, 6); ctx.fillStyle = 'rgba(232,211,91,.7)'; for (let x = -200; x < W + 200; x += 90) ctx.fillRect(x, 478, 50, 5);
      for (const [x, c, w] of [[165, '#ff3d7f', 90], [820, '#35e0ff', 120], [325, '#35c26b', 50]]) { const g = ctx.createLinearGradient(0, 400, 0, 500); g.addColorStop(0, hexA(c, .16)); g.addColorStop(1, hexA(c, 0)); ctx.fillStyle = g; ctx.fillRect(x - 10, 400, w + 20, 100); }
    } },
  { id: 'wakanda', name: 'Wakanda', floor: '#3a2250', grade: 'rgba(160,80,255,.08)',
    back(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, '#1a0a33'); g.addColorStop(.55, '#8a2f9e'); g.addColorStop(.85, '#ff8a3c'); g.addColorStop(1, '#ffd08a'); ctx.fillStyle = g; ctx.fillRect(-200, -100, W + 400, 520);
      glow(ctx, 760, 300, 110, 110, '#ffd08a', .5); ctx.fillStyle = '#fff1c8'; ctx.beginPath(); ctx.arc(760, 300, 64, 0, TAU); ctx.fill();
      for (const [depth, col, amp] of [[0, 'rgba(70,30,110,.55)', 70], [1, 'rgba(50,22,85,.8)', 95], [2, '#2a1248', 120]]) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-200, 400); for (let x = -200; x <= W + 200; x += 24) ctx.lineTo(x, 330 - Math.abs(Math.sin(x * .011 + depth * 1.7)) * amp - Math.sin(x * .05 + depth) * 8 + depth * 18); ctx.lineTo(W + 200, 400); ctx.fill(); }
      ctx.save(); ctx.translate(180, 352); ctx.scale(1.7, 1.7); poly(ctx, [[-40, 0], [-36, -40], [-20, -60], [-6, -66], [-2, -80], [6, -70], [20, -72], [24, -60], [10, -56], [14, -30], [40, -10], [44, 0]], '#140820'); ctx.restore();
      for (const [x, h] of [[600, 150], [640, 210], [690, 170], [860, 120], [905, 160]]) { ctx.fillStyle = '#1e0f3a'; rrect(ctx, x, 400 - h, 30, h, 6); ctx.fill(); ctx.fillStyle = '#c9a8ff'; for (let y = 400 - h + 10; y < 390; y += 16) ctx.fillRect(x + 8, y, 14, 3); }
      ctx.fillStyle = 'rgba(255,140,80,.12)'; ctx.fillRect(-200, 320, W + 400, 90);
    },
    live(ctx, t) { for (let i = 0; i < 22; i++) { const q = (t * .0002 + i * .137) % 1, x = (i * 173 + Math.sin(t * .001 + i) * 30) % (W + 100) - 50, y = 400 - q * 260; ctx.fillStyle = `rgba(255,220,140,${.6 * Math.sin(q * Math.PI)})`; ctx.fillRect(x, y, 2.5, 2.5); } },
    floorDraw(ctx, t) {
      const fl = ctx.createLinearGradient(0, 396, 0, H); fl.addColorStop(0, '#5a3570'); fl.addColorStop(1, '#1f0f33'); ctx.fillStyle = fl; ctx.fillRect(-200, 396, W + 400, H - 396 + 100);
      ctx.fillStyle = '#6b4a86'; ctx.fillRect(-200, 394, W + 400, 6);
      ctx.strokeStyle = `rgba(180,140,255,${.35 + .2 * Math.sin(t * .003)})`; ctx.lineWidth = 2; ctx.beginPath(); for (let x = -200; x < W + 300; x += 90) { ctx.moveTo(x, 400); ctx.lineTo(x - 60, H + 40); } ctx.moveTo(-200, 470); ctx.lineTo(W + 200, 470); ctx.stroke();
    } },
  { id: 'titan', name: 'Titan', floor: '#5a2a14', grade: 'rgba(255,120,40,.12)',
    back(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, '#1a0804'); g.addColorStop(.5, '#7a2e14'); g.addColorStop(1, '#d9772f'); ctx.fillStyle = g; ctx.fillRect(-200, -100, W + 400, 520);
      ctx.strokeStyle = 'rgba(255,220,180,.35)'; ctx.lineWidth = 16; ctx.beginPath(); ctx.ellipse(700, 120, 280, 64, -.35, 0, TAU); ctx.stroke(); glow(ctx, 700, 120, 120, 120, '#ffb070', .5); ctx.fillStyle = '#f0a868'; ctx.beginPath(); ctx.arc(700, 120, 74, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(680, 100, 20, 0, TAU); ctx.arc(720, 140, 12, 0, TAU); ctx.fill();
      for (const [depth, col] of [[0, 'rgba(90,40,20,.5)'], [1, '#4a1e0e']]) for (const [x, w, h] of [[40, 70, 170], [150, 36, 110], [800, 80, 200], [900, 50, 130], [420, 30, 95], [560, 46, 120]]) { const xx = x + depth * 60, hh = h * (depth ? 1 : .7); poly(ctx, [[xx, 402], [xx + w * .2, 402 - hh], [xx + w * .7, 402 - hh * .9], [xx + w, 402]], col); }
      ctx.fillStyle = 'rgba(255,140,60,.16)'; ctx.fillRect(-200, 300, W + 400, 110);
    },
    live(ctx, t) {
      for (let i = 0; i < 8; i++) { const x = ((i * 140 + t * .02 * (1 + i % 3)) % (W + 400)) - 200; ctx.fillStyle = `rgba(255,170,100,${.1 + (i % 3) * .04})`; ctx.beginPath(); ctx.ellipse(x, 190 + i * 22, 120, 20, 0, 0, TAU); ctx.fill(); }
      for (let i = 0; i < 34; i++) { const q = (t * .00025 + i * .071) % 1, x = (i * 131 + Math.sin(t * .002 + i) * 40) % (W + 200) - 100, y = 420 - q * 420; ctx.fillStyle = `rgba(255,${120 + Math.floor(q * 80)},40,${.8 * (1 - q)})`; ctx.fillRect(x, y, 2.5, 2.5); }
    },
    floorDraw(ctx) {
      const fl = ctx.createLinearGradient(0, 396, 0, H); fl.addColorStop(0, '#a4522a'); fl.addColorStop(1, '#3a180a'); ctx.fillStyle = fl; ctx.fillRect(-200, 396, W + 400, H - 396 + 100); ctx.fillStyle = '#7a3a1a'; ctx.fillRect(-200, 394, W + 400, 6);
      ctx.strokeStyle = 'rgba(20,8,4,.45)'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 14; i++) { const x = (i * 137) % W; ctx.moveTo(x, 410); ctx.lineTo(x + 30, 450); ctx.lineTo(x + 10, 500); } ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.15)'; for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.ellipse((i * 137) % W, 430 + (i * 29) % 100, 20 + (i % 4) * 8, 5, 0, 0, TAU); ctx.fill(); }
    } },
  { id: 'arena', name: "Grandmaster's Arena", floor: '#4a3a2a', grade: 'rgba(255,60,160,.08)',
    back(ctx) {
      ctx.fillStyle = '#120a1a'; ctx.fillRect(-200, -100, W + 400, 520);
      for (let tier = 0; tier < 4; tier++) { const y = 150 + tier * 55, col = ['#1b1030', '#241540', '#2e1b52', '#3a2466'][tier]; ctx.fillStyle = col; ctx.fillRect(-200, y, W + 400, 60); for (let i = -4; i < 60; i++) { const x = i * 22 + (tier % 2) * 11, h = 18 + ((i * 7 + tier) % 5) * 2; ctx.fillStyle = `hsl(${(i * 47 + tier * 90) % 360}, 45%, ${18 + tier * 4}%)`; ctx.beginPath(); ctx.arc(x, y + 24, 6, 0, TAU); ctx.fill(); ctx.fillRect(x - 7, y + 30, 14, h); } }
      for (const [x, c] of [[80, '#ff3d7f'], [300, '#f0b429'], [520, '#35e0ff'], [740, '#ff8c1a'], [900, '#b14cff']]) { poly(ctx, [[x, 40], [x + 60, 40], [x + 52, 150], [x + 30, 170], [x + 8, 150]], c); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 8, 60, 44, 4); }
      ctx.fillStyle = '#3a2a4a'; ctx.fillRect(-200, 370, W + 400, 30); ctx.fillStyle = '#f0b429'; for (let x = -200; x < W + 200; x += 40) ctx.fillRect(x, 380, 20, 4);
      ctx.fillStyle = 'rgba(255,80,160,.10)'; ctx.fillRect(-200, 300, W + 400, 110);
    },
    live(ctx, t) {
      for (let i = 0; i < 3; i++) { const sx = 160 + i * 320, ang = Math.sin(t * .0012 + i * 2) * .5; ctx.save(); ctx.globalAlpha = .13; ctx.translate(sx, 0); ctx.rotate(ang); poly(ctx, [[-14, 0], [14, 0], [120, 460], [-120, 460]], ['#ff3d7f', '#35e0ff', '#f0b429'][i]); ctx.restore(); }
      ctx.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { const k = Math.floor(t / 90) + i * 17; const x = (k * 53) % W, tier = k % 4; if ((k % 7) === 0) { ctx.beginPath(); ctx.arc(x, 150 + tier * 55 + 18, 3, 0, TAU); ctx.fill(); } }
    },
    floorDraw(ctx) {
      const fl = ctx.createLinearGradient(0, 396, 0, H); fl.addColorStop(0, '#8a6a46'); fl.addColorStop(1, '#3a2a1a'); ctx.fillStyle = fl; ctx.fillRect(-200, 396, W + 400, H - 396 + 100); ctx.fillStyle = '#a07e52'; ctx.fillRect(-200, 394, W + 400, 6);
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(W / 2, 470, 380, 36, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.ellipse(W / 2, 470, 120, 12, 0, 0, TAU); ctx.stroke();
    } }
];
const stageCache = {};
function stageLayer(st, key, drawFn) {
  let c = stageCache[st.id + key]; if (c) return c; c = document.createElement('canvas'); c.width = W + 400; c.height = key === 'back' ? 620 : 300; const x = c.getContext('2d'); x.translate(200, key === 'back' ? 100 : -396 + 0); drawFn(x, 0); stageCache[st.id + key] = c; return c;
}
function drawStage(ctx, idx, t, px) {
  const st = STAGES[idx], img = assets.stages[st.id];
  ctx.save(); ctx.translate(px * .4, 0);
  if (img) { const s = Math.max((W + 200) / img.width, 420 / img.height); const w = img.width * s, h = img.height * s; ctx.drawImage(img, (W - w) / 2, 400 - h, w, h); }
  else { ctx.drawImage(stageLayer(st, 'back', st.back), -200, -100); st.live(ctx, t); }
  ctx.restore();
  if (img) { ctx.fillStyle = 'rgba(10,8,16,.85)'; ctx.fillRect(-200, 396, W + 400, 200); const g = ctx.createLinearGradient(0, 396, 0, H); g.addColorStop(0, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(0,0,0,.4)'); ctx.fillStyle = g; ctx.fillRect(-200, 396, W + 400, 200); }
  else if (st.id === 'wakanda') st.floorDraw(ctx, t);
  else ctx.drawImage(stageLayer(st, 'floor', st.floorDraw), -200, 396);
}

/* ============================================================ */
/*  Fighter                                                      */
/* ============================================================ */
const ATTACKS = { punch: { total: 230, a0: 50, a1: 150, dmg: 6, reach: 76, kb: 130, stun: 300 }, kick: { total: 400, a0: 100, a1: 230, dmg: 10, reach: 104, kb: 230, stun: 380 },
  uppercut: { total: 460, a0: 90, a1: 220, dmg: 11, reach: 70, kb: 140, stun: 600, launch: true }, sweep: { total: 440, a0: 110, a1: 240, dmg: 8, reach: 96, kb: 160, stun: 400, knockdown: true } };
const SPECIAL_DMG = 12, SUPER_DMG = 30, SP_SLOW = 1.7;
class Fighter {
  constructor(def, side) { this.def = def; this.side = side; this.wins = 0; this.resetRound(); }
  resetRound() {
    this.x = this.side === 0 ? 280 : W - 280; this.y = GROUND; this.vx = 0; this.vy = 0; this.facing = this.side === 0 ? 1 : -1;
    this.maxHp = this.def.hp; this.hp = this.maxHp; this.meter = 0; this.state = 'idle'; this.t = 0; this.hitDone = false; this.combo = 0; this.comboT = 0;
    this.spCool = 0; this.flashHit = 0; this.grounded = true; this.frozen = false; this.specialKind = this.def.special.kind; this.actTotal = 500; this.pendingKnock = false; this.bindT = 0;
    this.jumps = 0; this.hovering = false; this.shieldOut = false; this.dust = 0; this.pullTo = null; this.tpDone = false; this.spLaunched = false; this.dashT = 0; this.dashDir = 0; this.lastTap = { left: -1e9, right: -1e9 }; this.anim = null; this.wasAir = false;
  }
  get speed() { return (230 + this.def.stats.speed * 24) * SETTINGS.sens; } get power() { return .75 + this.def.stats.power * .06; } get guard() { return 1.12 - this.def.stats.guard * .035; }
  canAct() { return ['idle', 'walk', 'jump', 'crouch'].includes(this.state); }
  get crouched() { return ['crouch', 'uppercut', 'sweep'].includes(this.state); }
  setState(s, extra = {}) { this.state = s; this.t = 0; this.hitDone = false; if (s !== 'bound') this.pullTo = null; Object.assign(this, extra); }
  update(dt, inp, opp, game) {
    const ms = dt * 1000; this.t += ms; this.spCool = Math.max(0, this.spCool - ms); this.flashHit = Math.max(0, this.flashHit - ms);
    if (this.comboT > 0) { this.comboT -= ms; if (this.comboT <= 0) this.combo = 0; }
    if (this.frozen) return;
    if (this.canAct() || this.state === 'hit') this.facing = opp.x >= this.x ? 1 : -1;
    const s = this.state;
    if (s === 'punch' && this.t > ATTACKS.punch.total) this.setState('idle');
    if (s === 'kick' && this.t > ATTACKS.kick.total) this.setState('idle');
    if (s === 'uppercut' && this.t > ATTACKS.uppercut.total) this.setState('idle');
    if (s === 'sweep' && this.t > ATTACKS.sweep.total) this.setState('idle');
    if (s === 'hit' && this.t > this.stunT) this.setState(this.pendingKnock ? 'down' : 'idle');
    if (s === 'down' && this.t > 900) this.setState('getup');
    if (s === 'getup' && this.t > 300) this.setState('idle');
    if (s === 'bound') { if (this.pullTo) { const tx = this.pullTo.x + this.pullTo.facing * 70; this.x = lerp(this.x, tx, .12); } if (this.t > this.bindT) this.setState('idle'); }
    if (s === 'special') this.updateSpecial(opp, game);
    if (this.canAct() && game.phase === 'fight') {
      const crouching = inp.crouch && this.grounded;
      if (inp.super && this.meter >= 100 && this.grounded) game.startSuper(this, opp);
      else if (inp.special && this.spCool <= 0 && this.grounded) this.startSpecial(opp, game);
      else if (inp.punch && crouching) { this.setState('uppercut'); audio.sfx('kick'); audio.sfx('whoosh'); attackSfx(this.def.id, 'kick'); game.fx.push({ kind: 'swipe', f: this, dy: -80, t: 0, life: 260, delay: 90, big: true, up: true }); }
      else if (inp.kick && crouching) { this.setState('sweep'); audio.sfx('kick'); attackSfx(this.def.id, 'kick'); game.fx.push({ kind: 'swipe', f: this, dy: -22, t: 0, life: 260, delay: 110, big: true }); }
      else if (inp.punch && this.grounded) { this.setState('punch'); audio.sfx('punch'); attackSfx(this.def.id, 'punch'); game.fx.push({ kind: 'swipe', f: this, dy: -108, t: 0, life: 200, delay: 60 }); game.fx.push({ kind: 'flare', f: this, id: this.def.id, dy: -104, reach: 74, t: 0, life: 230, delay: 40 }); }
      else if (inp.kick && this.grounded) { this.setState('kick'); audio.sfx('kick'); attackSfx(this.def.id, 'kick'); game.fx.push({ kind: 'swipe', f: this, dy: -60, t: 0, life: 260, delay: 130, big: true }); game.fx.push({ kind: 'flare', f: this, id: this.def.id, dy: -58, reach: 100, t: 0, life: 300, delay: 100 }); }
      else if (crouching) { if (this.state !== 'crouch') this.setState('crouch'); this.vx = 0; }
      else {
        if (this.state === 'crouch') this.setState('idle');
        const mv = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), now = performance.now();
        for (const dir of ['left', 'right']) if (inp[dir + 'Tap']) { if (now - this.lastTap[dir] < 330 && this.grounded && this.dashT <= 0) { this.dashT = 170; this.dashDir = dir === 'right' ? 1 : -1; audio.sfx('whoosh'); } this.lastTap[dir] = now; }
        if (this.dashT > 0) { this.dashT -= ms; this.vx = this.dashDir * this.speed * 2.4; if (Math.floor(this.t / 30) !== Math.floor((this.t - ms) / 30)) game.fx.push({ kind: 'trail', x: this.x, y: this.y, t: 0, life: 220, f: this }); }
        else if (this.grounded) { this.vx = lerp(this.vx, mv * this.speed, .55); if (Math.abs(this.vx) < 15) this.vx = 0; if (mv !== 0 && this.state === 'idle') this.setState('walk'); if (mv === 0 && this.state === 'walk') this.setState('idle'); }
        else this.vx = lerp(this.vx, mv * this.speed * .95, .08);
        if (inp.jump) {
          if (this.grounded) { this.vy = -720 * (0.85 + SETTINGS.sens * .15); this.grounded = false; this.jumps = 1; this.hovering = false; this.setState('jump'); audio.sfx('whoosh'); game.fx.push({ kind: 'puff', x: this.x, y: this.y, t: 0, life: 300 }); }
          else if (this.jumps < 2 && (this.def.fly || this.def.doubleJump)) { this.vy = this.def.fly ? -460 : -560; this.jumps = 2; this.hovering = !!this.def.fly; audio.sfx('whoosh'); game.fx.push({ kind: 'ring', x: this.x, y: this.y, t: 0, life: 250, c: this.def.color, r: 40 }); }
        }
      }
    } else if (this.state === 'hit' || this.state === 'crouch') this.vx *= .85;
    else if (this.state !== 'special') this.vx *= .8;
    if (!this.grounded || this.state === 'jump') { this.vy += (this.hovering ? 1000 : 2100) * dt; this.y += this.vy * dt; if (this.y >= GROUND) { this.y = GROUND; this.vy = 0; this.grounded = true; this.jumps = 0; this.hovering = false; if (this.state === 'jump') this.setState('idle'); game.fx.push({ kind: 'puff', x: this.x, y: this.y, t: 0, life: 350, big: true }); } }
    this.x += this.vx * dt; this.x = clamp(this.x, 40, W - 40);
    const d = opp.x - this.x; if (Math.abs(d) < 46 && this.y === GROUND && opp.y === GROUND) { const push = (46 - Math.abs(d)) / 2 * (d > 0 ? -1 : 1); this.x = clamp(this.x + push, 40, W - 40); opp.x = clamp(opp.x - push, 40, W - 40); }
    const atk = ATTACKS[this.state]; if (atk && this.t >= atk.a0 && this.t <= atk.a1 && !this.hitDone && this.inReach(opp, atk.reach * (this.def.scale || 1))) { this.hitDone = true; game.applyHit(this, opp, atk.dmg * this.power, { kb: atk.kb, stun: atk.stun, knockdown: !!atk.knockdown || (this.state === 'kick' && this.combo >= 3), launch: !!atk.launch }); }
  }
  inReach(opp, reach) { const dx = (opp.x - this.x) * this.facing; const yTol = this.state === 'uppercut' ? 170 : 110; return dx > -10 && dx < reach + 20 && Math.abs(opp.y - this.y) < yTol && !['down', 'getup'].includes(opp.state); }
  startSpecial(opp, game) {
    const k = this.def.special.kind; this.specialKind = k; this.spCool = 2200; this.setState('special'); this.vx = 0; this.spLaunched = false; this.tpDone = false;
    this.actTotal = { repulsor: 420, shield: 380, lightning: 520, clap: 560, web: 440, kinetic: 460, portal: 520, powerstone: 500, daggers: 480, tendril: 480 }[k] * SP_SLOW;
    game.focus = { att: this, def: opp, t: 0, dur: this.actTotal }; opp.frozen = true; opp.vx = 0;
    this.targetX = opp.x; audio.sfx(k === 'lightning' ? 'thunder' : k === 'repulsor' ? 'beam' : 'special'); heroVoice(this.def.id, 'special', null); charSfx(this.def.id, 'special', 1 / .7);
    game.fx.push({ kind: 'charge', f: this, t: 0, life: 220, c: this.def.color }); game.fx.push({ kind: 'sig', f: this, id: this.def.id, t: 0, life: this.actTotal, phase: 'special' }); game.banner(this.def.special.name, this.side === 0 ? '#ff6b6b' : '#3fa9ff', 700, true);
  }
  updateSpecial(opp, game) {
    const k = this.specialKind, t = this.t / SP_SLOW, col = this.def.color, dmgM = 1, hx = this.x + this.facing * 36, hy = this.y - 112, D = SPECIAL_DMG;
    const fireAt = { repulsor: 160, shield: 180, lightning: 260, clap: 220, web: 150, powerstone: 220, daggers: 160, tendril: 140 }[k];
    if (fireAt != null && t >= fireAt && !this.spLaunched) {
      this.spLaunched = true;
      switch (k) {
        case 'repulsor': game.projectiles.push(new Projectile(this, hx, hy, this.facing * 980, 0, D, { kind: 'beam', c: '#bfefff', kb: 180 })); break;
        case 'shield': this.shieldOut = true; game.projectiles.push(new Projectile(this, hx, hy - 6, this.facing * 760, 0, D / 2, { kind: 'shield', kb: 200, boomerang: 440 })); break;
        case 'lightning': { const tx = clamp(this.targetX, 40, W - 40); game.fx.push({ kind: 'bolt', x: tx, t: 0, life: 380, pts: boltPts(tx) }); game.fx.push({ kind: 'ring', x: tx, y: GROUND, t: 0, life: 300, c: '#bfefff', r: 70 }); game.shake(7); game.flash = .4; if (Math.abs(opp.x - tx) < 60 && opp.y > GROUND - 90 && !['down', 'getup'].includes(opp.state)) game.applyHit(this, opp, D, { kb: 120, stun: 450, flat: true }); break; }
        case 'clap': game.fx.push({ kind: 'clap', x: hx - this.facing * 10, y: hy, dir: this.facing, t: 0, life: 420 }); for (let i = 0; i < 14; i++) game.fx.push({ kind: 'debris', x: this.x + this.facing * rnd(20, 120), y: GROUND, vx: this.facing * rnd(120, 420), vy: -rnd(200, 520), t: 0, life: 700, c: '#c9b8a8' }); game.shake(12); if (this.inReach(opp, 230)) game.applyHit(this, opp, D, { kb: 460, stun: 420, knockdown: true, flat: true }); audio.sfx('thunder'); break;
        case 'web': game.projectiles.push(new Projectile(this, hx, hy, this.facing * 820, 0, D, { kind: 'web', kb: 20, bind: 750, pull: true })); break;
        case 'powerstone': game.projectiles.push(new Projectile(this, hx, hy, this.facing * 520, 0, D, { kind: 'orb', c: '#9b5cff', kb: 300, knockdown: true })); break;
        case 'daggers': [-1, 0, 1].forEach(i => game.projectiles.push(new Projectile(this, hx, hy + i * 8, this.facing * 640, i * 110, D / 3, { kind: 'dagger', kb: 90 }))); game.fx.push({ kind: 'illusion', x: this.x - this.facing * 50, y: this.y, facing: this.facing, def: this.def, t: 0, life: 650 }); this.x = clamp(this.x + this.facing * 10, 40, W - 40); break;
        case 'tendril': game.fx.push({ kind: 'tendril', x1: hx, y1: hy, x2: hx + this.facing * 250, y2: hy + 6, t: 0, life: 360 }); if (this.inReach(opp, 270)) game.applyHit(this, opp, D, { kb: 10, stun: 200, bind: 550, pull: this, flat: true }); break;
      }
    }
    if (k === 'kinetic') { if (t > 80 && t < 360) { this.vx = this.facing * 780 / SP_SLOW; this.x = clamp(this.x + this.vx / 60, 40, W - 40); if (t % 40 < 9) game.fx.push({ kind: 'trail', x: this.x, y: this.y, t: 0, life: 260, f: this, c: '#9b5cff' }); if (!this.hitDone && this.inReach(opp, 60)) { this.hitDone = true; game.applyHit(this, opp, D, { kb: 340, stun: 420, knockdown: true, flat: true }); game.fx.push({ kind: 'slash', x: opp.x, y: opp.y - 100, t: 0, life: 250, c: '#c9b8ff' }); } } else this.vx = 0; }
    if (k === 'portal') { if (t >= 120 && !this.portalA) { this.portalA = true; game.fx.push({ kind: 'portal', x: this.x, y: this.y - 80, t: 0, life: 500 }); } if (t >= 300 && !this.tpDone) { this.tpDone = true; this.x = clamp(opp.x - opp.facing * 70, 40, W - 40); this.facing = opp.x >= this.x ? 1 : -1; game.fx.push({ kind: 'portal', x: this.x, y: this.y - 80, t: 0, life: 500 }); if (this.inReach(opp, 110)) game.applyHit(this, opp, D, { kb: 260, stun: 420, knockdown: true, flat: true }); } }
    if (this.t >= this.actTotal) { this.portalA = false; this.setState('idle'); if (game.focus && game.focus.att === this) { game.focus = null; if (opp.frozen) opp.frozen = false; } }
  }
  draw(ctx, t) { drawFighter(ctx, this, t); }
}
function boltPts(x) { const pts = [[x + rnd(-40, 40), 0]]; for (let y = 60; y < GROUND; y += 55) pts.push([x + rnd(-28, 28), y]); pts.push([x, GROUND]); return pts; }

class Projectile {
  constructor(owner, x, y, vx, vy, dmg, o) { Object.assign(this, { owner, x, y, vx, vy, dmg, kind: o.kind, c: o.c, kb: o.kb || 120, knockdown: !!o.knockdown, bind: o.bind || 0, pull: !!o.pull, boomerang: o.boomerang || 0, t: 0, dead: false, rot: 0, phase: 0, startX: x, hitOut: false }); }
  update(dt, game) {
    this.t += dt * 1000; this.rot += dt * 14 * Math.sign(this.vx || 1); const opp = game.fighters[1 - this.owner.side];
    if (this.boomerang) {
      if (this.phase === 0 && Math.abs(this.x - this.startX) > this.boomerang) { this.phase = 1; this.hitOut = false; }
      if (this.phase === 1) { const o = this.owner, tx = o.x, ty = o.y - 110, dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy); if (d < 30) { this.dead = true; o.shieldOut = false; return; } this.vx = dx / d * 820; this.vy = dy / d * 820; }
      else if (this.x < 20 || this.x > W - 20) { this.phase = 1; this.hitOut = false; }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (!this.boomerang && (this.x < -80 || this.x > W + 80 || this.y > GROUND + 10 || this.y < -80)) { this.dead = true; return; }
    const top = opp.crouched ? opp.y - 95 : opp.y - 165; // crouching ducks under high shots
    if (!this.hitOut && Math.abs(opp.x - this.x) < 36 && this.y > top && this.y < opp.y + 10 && !['down', 'getup'].includes(opp.state)) {
      if (this.boomerang) this.hitOut = true; else this.dead = true;
      if (this.bind) game.applyHit(this.owner, opp, this.dmg, { kb: this.kb, stun: 200, bind: this.bind, pull: this.pull ? this.owner : null, flat: true }); else game.applyHit(this.owner, opp, this.dmg, { kb: this.kb, stun: 360, knockdown: this.knockdown, flat: true });
      if (this.kind === 'web') game.fx.push({ kind: 'webline', a: this.owner, b: opp, t: 0, life: 700 });
    }
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y);
    switch (this.kind) {
      case 'beam': ctx.rotate(Math.atan2(this.vy, this.vx)); ctx.fillStyle = '#bfefff'; rrect(ctx, -34, -5, 44, 10, 5); ctx.fill(); ctx.fillStyle = '#fff'; rrect(ctx, -20, -2, 28, 4, 2); ctx.fill(); break;
      case 'shield': drawShield(ctx, 0, 0, this.rot, 1.15); break;
      case 'web': ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(this.owner.x + this.owner.facing * 36 - this.x, this.owner.y - 112 - this.y); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a + this.rot) * 14, Math.sin(a + this.rot) * 14); ctx.stroke(); } break;
      case 'orb': ctx.fillStyle = '#9b5cff'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill(); ctx.fillStyle = '#e9ddff'; ctx.beginPath(); ctx.arc(-4, -4, 7, 0, TAU); ctx.fill(); break;
      case 'dagger': drawDagger(ctx, 0, 0, Math.atan2(this.vy, this.vx) + Math.PI / 2); break;
    }
    ctx.restore();
  }
}

/* ============================================================ */
/*  CPU                                                          */
/* ============================================================ */
const AI_LEVELS = [{ react: 540, aggro: .3, block: .1, special: .18, super: .3, idle: .4 }, { react: 280, aggro: .55, block: .4, special: .45, super: .7, idle: .2 }, { react: 120, aggro: .82, block: .72, special: .65, super: 1, idle: .05 }];
function cpuIntent(me, opp, game, dt) {
  const L = AI_LEVELS[game.difficulty]; me.ai = me.ai || { t: 0, plan: {}, until: 0 }; const ai = me.ai; ai.t += dt * 1000;
  const blank = { left: false, right: false, jump: false, crouch: false, punch: false, kick: false, special: false, super: false };
  if (ai.t < ai.until) return { ...blank, ...ai.plan, punch: false, kick: false, special: false, super: false, jump: false };
  ai.t = 0; ai.until = L.react * rnd(.6, 1.4); const plan = { ...blank }, dist = Math.abs(opp.x - me.x), toward = opp.x > me.x ? 'right' : 'left', away = toward === 'right' ? 'left' : 'right';
  const oppAttacking = ['punch', 'kick', 'special'].includes(opp.state), r = Math.random();
  const incoming = game.projectiles.some(p => p.owner !== me && Math.sign(p.vx) === Math.sign(me.x - p.x) && Math.abs(p.x - me.x) < 260);
  if (me.meter >= 100 && r < L.super && dist < 420) plan.super = true;
  else if (incoming && r < L.block) { plan.crouch = true; ai.until = 420; }
  else if (oppAttacking && dist < 150 && r < L.block) { plan.crouch = true; plan.punch = Math.random() < .6; ai.until = 300; }
  else if (incoming && r < .5) { plan.jump = true; plan[toward] = true; }
  else if (dist > 230) { if (r < L.special && me.spCool <= 0) plan.special = true; else if (r < L.idle) { /* wait */ } else { plan[toward] = true; if (Math.random() < .15) plan.jump = true; } }
  else if (dist > 120) { if (r < L.aggro) plan[toward] = true; else if (r < L.aggro + .2 && me.spCool <= 0) plan.special = true; else if (r < L.aggro + .35) plan.kick = true; else plan[away] = true; }
  else { if (r < L.aggro * .6) plan.punch = true; else if (r < L.aggro) plan.kick = true; else if (r < L.aggro + .15 && me.spCool <= 0) plan.special = true; else if (r < L.aggro + .3) { plan.crouch = true; plan.kick = Math.random() < .5; plan.punch = !plan.kick; ai.until = 300; } else { plan[away] = true; ai.until = 250; } }
  ai.plan = plan; return plan;
}

/* ============================================================ */
/*  Game                                                         */
/* ============================================================ */
const canvas = $('#game'), ctx = canvas.getContext('2d');
const keys = new Set(), pressed = new Set();
const ACTIONS = ['left', 'right', 'jump', 'crouch', 'punch', 'kick', 'special', 'super'];
let ARROWS, WASD, BOTH, P1, P2, GAME_KEYS;
function rebuildKeymaps() {
  ARROWS = Object.fromEntries(ACTIONS.map(k => [k, [...(SETTINGS.keys.p1[k] || []), 'T_' + k]]));
  WASD = Object.fromEntries(ACTIONS.map(k => [k, [...(SETTINGS.keys.p2[k] || [])]]));
  BOTH = Object.fromEntries(ACTIONS.map(k => [k, [...ARROWS[k], ...WASD[k]]]));
  P1 = game && game.mode === '2p' ? ARROWS : BOTH; P2 = WASD;
  GAME_KEYS = new Set([...Object.values(BOTH).flat(), 'Space', 'Enter', 'Escape', 'KeyP', 'Backspace']);
}
const readInput = m => ({ left: m.left.some(k => keys.has(k)), right: m.right.some(k => keys.has(k)), leftTap: m.left.some(k => pressed.has(k)), rightTap: m.right.some(k => pressed.has(k)), crouch: m.crouch.some(k => keys.has(k)), jump: m.jump.some(k => pressed.has(k)), punch: m.punch.some(k => pressed.has(k)), kick: m.kick.some(k => pressed.has(k)), special: m.special.some(k => pressed.has(k)), super: m.super.some(k => pressed.has(k)) });
const SUPER_HITS = { unibeam: 3, assemble: 4, stormbreaker: 4, smash: 2, webswing: 3, wakanda: 3, bargain: 5, snap: 1, purpose: 5, wearevenom: 4 };

const game = {
  screen: 'title', mode: 'cpu', difficulty: 1, stageIdx: 0, phase: 'idle', phaseT: 0, round: 1, timer: ROUND_TIME,
  fighters: [], projectiles: [], fx: [], banners: [], hitstop: 0, focus: null, ts: 1, letterbox: 0, shakeT: 0, shakeA: 0, flash: 0, paused: false, cine: null, picks: [null, null], picker: 0, cursor: 0, winner: -1,
  tally: store.get('ib-tally', { w: 0, l: 0 }),
  startMatch() { this.fighters = [new Fighter(this.picks[0], 0), new Fighter(this.picks[1], 1)]; this.picks.forEach(d => loadHeroSounds(d.id)); this.introPlayed = [false, false]; this.round = 1; const s = +$('#opt-stage').value; this.stageIdx = s >= 0 ? s : Math.floor(Math.random() * STAGES.length); this.difficulty = +$('#opt-diff').value; SETTINGS.difficulty = this.difficulty; saveSettings(); this.startRound(); },
  startRound() { this.introPlayed = [false, false]; this.focus = null; this.fighters.forEach(f => f.resetRound()); this.projectiles = []; this.fx = []; this.banners = []; this.cine = null; this.timer = ROUND_TIME; this.phase = 'intro'; this.phaseT = 0; audio.sfx('round'); },
  banner(text, color, life = 900, small = false) { this.banners.push({ text, color, t: 0, life, small }); },
  shake(a) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = 220; },
  applyHit(att, def, dmg, o = {}) {
    if (def.state === 'ko' || (def.frozen && !o.cine && !o.flat)) return;
    const chainOk = def.state === 'hit' || def.state === 'bound';
    att.combo = chainOk ? att.combo + 1 : 1; att.comboT = 1200;
    const scale = Math.max(.45, 1 - Math.max(0, att.combo - 2) * .12), real = o.flat ? Math.round(dmg * 10) / 10 : Math.round(dmg * scale * def.guard * 10) / 10;
    if (o.launch) { def.grounded = false; def.vy = -560; def.y -= 2; }
    def.hp -= real; att.meter = Math.min(100, att.meter + real * 1.3); def.meter = Math.min(100, def.meter + real * .9); def.vx = att.facing * (o.kb || 120); def.flashHit = 90;
    if (o.bind) def.setState('bound', { bindT: o.bind, vx: 0, pullTo: o.pull || null }); else def.setState('hit', { stunT: o.stun || 320, pendingKnock: !!o.knockdown });
    if (!def.grounded) def.vy = -200;
    this.fx.push({ kind: 'spark', x: def.x + def.facing * 18, y: def.y - 105 + rnd(-15, 15), t: 0, life: 220, c: o.cine ? '#ffd166' : '#fff' });
    this.fx.push({ kind: 'num', x: def.x, y: def.y - 175, t: 0, life: 700, text: String(Math.round(real)), c: o.cine ? '#ffd166' : (att.side === 0 ? '#ff6b6b' : '#3fa9ff') });
    this.shake(o.cine ? 8 : (real > 9 ? 5 : 2)); audio.sfx(real > 8 || o.cine ? 'hithard' : 'hit'); this.hitstop = Math.max(this.hitstop || 0, o.cine ? 110 : (real > 8 ? 85 : 55)); this.fx.push({ kind: 'impact', x: def.x + def.facing * 14, y: def.y - 100 * (def.def.scale || 1), t: 0, life: 260, big: real > 8 }); if (real > 7 || o.cine) heroClip(def.def.id, 'hit', .8); if (att.combo >= 2) audio.sfx('tick');
    if (def.hp <= 0) this.knockout(def);
  },
  knockout(def) { def.hp = 0; def.setState('ko'); this.focus = null; this.fighters.forEach(f => f.frozen = false); this.fighters[1 - def.side].wins++; this.phase = 'ko'; this.phaseT = 0; this.cine = null; this.banner('K.O.', '#e23636', 1800); audio.sfx('ko'); this.shake(14); this.flash = 1; },
  startSuper(att, def) {
    const kind = att.def.sup.kind, n = SUPER_HITS[kind]; att.meter = 0; att.setState('super'); att.vx = 0; def.frozen = true; att.frozen = true; att.shieldOut = false; this.projectiles = this.projectiles.filter(p => p.owner !== att);
    const total = SUPER_DMG;
    const hits = []; const first = { smash: 1550, snap: 1500, webswing: 1050, unibeam: 1000 }[kind] || 1000, span = { smash: 120, snap: 0, webswing: 900 }[kind] ?? 1100;
    for (let i = 0; i < n; i++) hits.push(first + i * (span / Math.max(1, n)));
    this.cine = { att, def, kind, t: 0, hits, dmgEach: total / n, connects: true, knockdown: ['smash', 'snap', 'wakanda'].includes(kind), end: { smash: 2500, snap: 3600 }[kind] || 2700, startX: att.x, startY: att.y, items: [], runners: [] };
    if (kind === 'assemble') { const allies = HEROES.filter(h => !h.villain && h.id !== att.def.id); for (let i = 0; i < 4; i++) this.cine.runners.push({ def: allies[(i * 2 + 1) % allies.length], x: att.facing > 0 ? -80 - i * 190 - 350 : W + 80 + i * 190 + 350, vx: att.facing * 900, y: GROUND }); }
    if (kind === 'purpose') { for (let i = 0; i < 5; i++) this.cine.items.push({ clone: true, x: clamp(def.x + [-150, 150, -80, 80, 0][i], 40, W - 40), facing: [1, -1, 1, -1, def.x >= att.x ? -1 : 1][i], show: 750 + i * 160 }); }
    heroVoice(att.def.id, 'super', null); charSfx(att.def.id, 'super', 1 / .5); this.banner(att.def.sup.name, '#ffd166', 1200);
    this.fx.push({ kind: 'speedlines', f: att, t: 0, life: 700 }); this.fx.push({ kind: 'aura', f: att, t: 0, life: this.cine.end, c: att.def.color }); this.fx.push({ kind: 'sig', f: att, id: att.def.id, t: 0, life: this.cine.end, phase: 'super' }); this.flash = .6; this.shake(6);
  },
  updateCine(dt) {
    const c = this.cine; c.t += dt * 1000; const { att, def, kind } = c, t = c.t;
    // choreography
    if (kind === 'smash') { if (t < 900) { /* crouch & roar */ } else if (t < 1300) { att.y = lerp(c.startY, -260, (t - 900) / 400); } else if (t < 1550) { att.x = clamp(def.x - att.facing * 36, 40, W - 40); att.y = lerp(-260, GROUND, (t - 1300) / 250); } else att.y = GROUND; }
    if (kind === 'webswing') { const i = Math.floor((t - 900) / 300); if (t >= 900 && i < 3) { const p = ((t - 900) % 300) / 300, from = i % 2 === 0 ? (att.facing > 0 ? 80 : W - 80) : (att.facing > 0 ? W - 80 : 80), to = i % 2 === 0 ? (att.facing > 0 ? W - 80 : 80) : (att.facing > 0 ? 80 : W - 80); att.x = lerp(from, to, p); att.y = GROUND - 200 + Math.sin(p * Math.PI) * 190; att.facing = to > from ? 1 : -1; c.swing = true; } else if (t >= 1800) { att.y = GROUND; att.x = clamp(def.x - (def.x >= W / 2 ? -1 : 1) * -90, 40, W - 40); att.facing = def.x >= att.x ? 1 : -1; c.swing = false; } }
    if (kind === 'snap' && t > 300 && t < 1500 && Math.floor(t / 60) !== Math.floor((t - dt * 1000) / 60)) this.fx.push({ kind: 'stoneglow', x: att.x + att.facing * 36 * att.def.scale, y: att.y - 150 * att.def.scale, t: 0, life: 300, i: Math.floor(t / 60) % 6 });
    for (const r of c.runners) r.x += r.vx * dt;
    while (c.hits.length && t >= c.hits[0]) {
      c.hits.shift(); const last = c.hits.length === 0;
      switch (kind) {
        case 'unibeam': this.fx.push({ kind: 'unibeam', x: att.x, y: att.y - 108, dir: att.facing, t: 0, life: 350 }); audio.sfx('beam'); break;
        case 'stormbreaker': this.fx.push({ kind: 'bolt', x: def.x, t: 0, life: 380, pts: boltPts(def.x) }); for (let i = 0; i < 2; i++) { const x = rnd(40, W - 40); this.fx.push({ kind: 'bolt', x, t: 0, life: 380, pts: boltPts(x) }); } this.flash = .5; this.shake(10); audio.sfx('thunder'); break;
        case 'smash': for (let i = 0; i < 22; i++) this.fx.push({ kind: 'debris', x: att.x + rnd(-40, 40), y: GROUND, vx: rnd(-520, 520), vy: -rnd(300, 800), t: 0, life: 900, c: pick(['#6b5a4a', '#8a7a6a', '#4a3a2a']) }); this.fx.push({ kind: 'crack', x: att.x, t: 0, life: 1000 }); this.fx.push({ kind: 'ring', x: att.x, y: GROUND, t: 0, life: 500, c: '#ffd166', r: 260 }); this.shake(22); this.flash = .5; audio.sfx('thunder'); break;
        case 'webswing': this.fx.push({ kind: 'slash', x: def.x, y: def.y - 100, t: 0, life: 250, c: '#fff' }); break;
        case 'wakanda': this.fx.push({ kind: 'ring', x: att.x, y: att.y - 80, t: 0, life: 600, c: '#9b5cff', r: 760 }); this.shake(8); break;
        case 'bargain': this.fx.push({ kind: 'glyph', x: def.x, y: def.y - 90, t: 0, life: 500 }); break;
        case 'snap': this.flash = 1; this.fx.push({ kind: 'snapwave', x: att.x, y: att.y - 150, t: 0, life: 900 }); this.fx.push({ kind: 'universe', x: att.x + att.facing * 46, y: att.y - 150 * (att.def.scale || 1), t: 0, life: 2000 }); def.dustT = 0; def.dusting = true; this.shake(16); break;
        case 'purpose': { const cl = c.items[5 - c.hits.length - 1]; if (cl) this.fx.push({ kind: 'slash', x: def.x + (cl.x < def.x ? -20 : 20), y: def.y - 100, t: 0, life: 250, c: '#7dffb0' }); break; }
        case 'wearevenom': for (let i = 0; i < 3; i++) { const side = Math.random() < .5 ? -40 : W + 40; this.fx.push({ kind: 'tendril', x1: side, y1: rnd(0, GROUND), x2: def.x + rnd(-10, 10), y2: def.y - rnd(60, 130), t: 0, life: 360 }); } this.shake(6); break;
        case 'assemble': this.fx.push({ kind: 'slash', x: def.x, y: def.y - 100, t: 0, life: 250, c: '#fff' }); this.shake(6); break;
      }
      def.frozen = false; this.applyHit(att, def, c.dmgEach, { kb: last ? 260 : 40, stun: last ? 520 : 650, knockdown: last && c.knockdown, unblockable: true, cine: true, flat: true }); if (!last) def.frozen = true;
    }
    if (def.dusting) { def.dustT = (def.dustT || 0) + dt * 1000; def.dust = def.dustT < 700 ? clamp(def.dustT / 700, 0, .85) : clamp(.85 - (def.dustT - 700) / 500, 0, .85); if (def.dustT < 700 && Math.random() < .6) this.fx.push({ kind: 'dust', x: def.x + rnd(-24, 24), y: def.y - rnd(0, 150), t: 0, life: 900, vx: att.facing * rnd(20, 80), vy: -rnd(20, 70) }); if (def.dustT > 1200) { def.dusting = false; def.dust = 0; } }
    if (t >= c.end) { att.frozen = false; def.frozen = false; att.y = GROUND; att.grounded = true; att.setState('idle'); if (!['hit', 'down', 'ko'].includes(def.state)) def.setState('idle'); def.dust = 0; def.dusting = false; this.cine = null; }
  },
  update(dt) {
    // slow motion: supers run at 45% speed, specials at 70%; banners, shake and hit-stop stay in real time
    const tsTarget = this.cine ? .5 : (this.focus ? .7 : 1); this.ts = lerp(this.ts, tsTarget, tsTarget < this.ts ? .25 : .08); if (Math.abs(this.ts - tsTarget) < .01) this.ts = tsTarget;
    this.letterbox = lerp(this.letterbox, this.cine ? 1 : 0, .12);
    const rdt = dt; dt = dt * this.ts;
    this.phaseT += rdt * 1000; this.banners.forEach(b => b.t += rdt * 1000); this.banners = this.banners.filter(b => b.t < b.life);
    if (this.shakeT > 0) { this.shakeT -= rdt * 1000; if (this.shakeT <= 0) this.shakeA = 0; } this.flash = Math.max(0, this.flash - rdt * 2.5);
    this.fx.forEach(e => { e.t += dt * 1000; if (e.kind === 'dust') { e.x += e.vx * dt; e.y += e.vy * dt; } }); this.fx = this.fx.filter(e => e.t < e.life);
    if (this.screen !== 'fight' || this.paused) return;
    const [a, b] = this.fighters;
    if (this.cine && Math.floor(this.cine.t / 110) !== Math.floor((this.cine.t - dt * 1000) / 110)) this.fx.push({ kind: 'ghost', f: this.cine.att, x: this.cine.att.x, y: this.cine.att.y, state: this.cine.att.state, t: 0, life: 420 });
    if (this.phase === 'intro') { if (this.phaseT > 350 && !this.introPlayed[0]) { this.introPlayed[0] = true; heroVoice(a.def.id, 'intro', a.def.line); } if (this.phaseT > 1250 && !this.introPlayed[1]) { this.introPlayed[1] = true; heroVoice(b.def.id, 'intro', b.def.line); } if (this.phaseT > 2200) { this.phase = 'fight'; this.phaseT = 0; audio.sfx('round'); } }
    if (this.hitstop > 0) { this.hitstop -= rdt * 1000; return; }
    if (this.phase === 'fight') {
      if (this.cine) this.updateCine(dt); else { this.timer -= dt; if (this.timer <= 0) { this.timer = 0; this.timeUp(); } }
      if (this.focus) { this.focus.t += dt * 1000; if (this.focus.t > this.focus.dur + 300 || this.focus.att.state !== 'special') { if (this.focus.def.frozen) this.focus.def.frozen = false; this.focus = null; } }
      const i1 = this.cine ? {} : readInput(P1), i2 = this.cine ? {} : (this.mode === '2p' ? readInput(P2) : cpuIntent(b, a, this, dt));
      a.update(dt, i1, b, this); b.update(dt, i2, a, this);
      for (const p of this.projectiles) p.update(dt, this); this.projectiles = this.projectiles.filter(p => !p.dead);
    } else if (this.phase === 'ko') {
      a.update(dt, {}, b, this); b.update(dt, {}, a, this);
      const alive = this.fighters.find(f => f.state !== 'ko' && f.hp > 0); if (alive && this.phaseT > 600 && alive.state !== 'win') alive.setState('win');
      if (this.phaseT > 2200) { const w = this.fighters.find(f => f.wins >= ROUNDS_TO_WIN); if (w) this.finish(w); else { this.round++; this.startRound(); } }
    }
  },
  timeUp() { const [a, b] = this.fighters, ra = a.hp / a.maxHp, rb = b.hp / b.maxHp; const loser = ra === rb ? (Math.random() < .5 ? a : b) : (ra < rb ? a : b); loser.setState('ko'); this.fighters[1 - loser.side].wins++; this.phase = 'ko'; this.phaseT = 0; this.cine = null; this.fighters.forEach(f => f.frozen = false); this.banner('TIME UP', '#ffd166', 1800); audio.sfx('ko'); },
  finish(w) {
    this.winner = w.side; this.screen = 'result'; audio.sfx('win'); heroVoice(w.def.id, 'win', w.def.win);
    if (this.mode === 'cpu') { if (w.side === 0) this.tally.w++; else this.tally.l++; store.set('ib-tally', this.tally); }
    $('#res-title').textContent = this.mode === '2p' ? `PLAYER ${w.side + 1} WINS` : (w.side === 0 ? 'YOU WIN' : 'CPU WINS'); $('#res-title').style.color = w.side === 0 ? '#ff6b6b' : '#3fa9ff';
    $('#res-name').textContent = `${w.def.name} · ${w.def.alias}`; $('#res-line').textContent = `“${w.def.win}”`;
    $('#res-tally').textContent = this.mode === 'cpu' ? `Your record vs CPU: ${this.tally.w}W – ${this.tally.l}L` : `${this.fighters[0].def.name} ${this.fighters[0].wins} – ${this.fighters[1].wins} ${this.fighters[1].def.name}`;
    showScreen('result');
  },

  draw() {
    const t = performance.now(); ctx.save(); const dpr = canvas.width / W; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // dynamic camera: zooms in when fighters are close, follows the midpoint
    const cam = this.cam || (this.cam = { z: 1.06, x: W / 2 }); let zT = 1.06, xT = W / 2;
    if (this.fighters.length && (this.screen === 'fight' || this.screen === 'result')) { const [a, b] = this.fighters; const dist = Math.abs(a.x - b.x); zT = clamp(1.3 - dist / W * .55, 1.06, 1.24); xT = (a.x + b.x) / 2; if (this.focus) { zT = 1.32; xT = lerp(this.focus.att.x, this.focus.def.x, .35); } if (this.cine) { zT = Math.max(zT, 1.26); xT = lerp(this.cine.att.x, this.cine.def.x, .45); } }
    cam.z = lerp(cam.z, zT, .04); cam.x = lerp(cam.x, xT, .08);
    const lim = (W - W / cam.z) / 2 - 2, px = clamp((cam.x - W / 2) * .5, -lim, lim);
    ctx.save();
    if (this.shakeA > 0) ctx.translate(rnd(-this.shakeA, this.shakeA), rnd(-this.shakeA, this.shakeA));
    ctx.translate(W / 2, H * .66); ctx.scale(cam.z, cam.z); ctx.translate(-W / 2 - px, -H * .66);
    drawStage(ctx, this.stageIdx, t, px);
    if (this.screen === 'fight' || this.screen === 'result') {
      const c = this.cine;
      if (c) { ctx.fillStyle = `rgba(0,0,0,${c.kind === 'snap' ? .7 : .55})`; ctx.fillRect(-200, -200, W + 400, H + 400); }
      else if (this.focus) { const q = clamp(this.focus.t / 150, 0, 1) * clamp((this.focus.dur - this.focus.t) / 200, 0, 1); ctx.fillStyle = `rgba(0,0,0,${.45 * q})`; ctx.fillRect(-200, -200, W + 400, H + 400); const f = this.focus.att, sg = ctx.createRadialGradient(f.x, f.y - 90, 20, f.x, f.y - 90, 260); sg.addColorStop(0, `rgba(255,255,255,${.12 * q})`); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(-200, -200, W + 400, H + 400); }
      this.drawFxBack(t);
      if (c) for (const r of c.runners) drawFighter(ctx, { def: r.def, x: r.x, y: r.y, facing: Math.sign(r.vx), state: 'walk', t, vx: r.vx, flashHit: 0 }, t, { noProp: false });
      if (c && c.kind === 'purpose') for (const it of c.items) if (c.t >= it.show) drawFighter(ctx, { def: c.att.def, x: it.x, y: GROUND, facing: it.facing, state: c.t < it.show + 200 ? 'idle' : 'punch', t: c.t - it.show - 200, flashHit: 0 }, t, { alpha: .6, noShadow: true });
      if (c && c.kind === 'webswing' && c.swing) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(W / 2, -10); ctx.lineTo(c.att.x + c.att.facing * 10, c.att.y - 185); ctx.stroke(); }
      const order = c ? [c.def, c.att] : [...this.fighters].sort((x, y) => (x.state === 'hit' ? 1 : 0) - (y.state === 'hit' ? 1 : 0));
      // floor reflection
      ctx.save(); ctx.beginPath(); ctx.rect(-200, GROUND, W + 400, 200); ctx.clip(); ctx.translate(0, GROUND * 2); ctx.scale(1, -1); ctx.globalAlpha = .22;
      for (const f of order) drawFighter(ctx, f, t, { noShadow: true, noUpdate: true, flat: true });
      ctx.restore(); const rg = ctx.createLinearGradient(0, GROUND, 0, GROUND + 90); const fc = STAGES[this.stageIdx].floor; rg.addColorStop(0, fc + '00'); rg.addColorStop(1, fc + 'ee'); ctx.fillStyle = rg; ctx.fillRect(-200, GROUND, W + 400, 200);
      for (const f of order) f.draw(ctx, t);
      for (const p of this.projectiles) p.draw(ctx);
      this.drawFxFront(t);
      if (this.phase === 'intro') { if (this.phaseT > 350 && this.phaseT < 1250) drawBubble(this.fighters[0], this.fighters[0].def.line, clamp((this.phaseT - 350) / 200, 0, 1)); if (this.phaseT > 1250 && this.phaseT < 2150) drawBubble(this.fighters[1], this.fighters[1].def.line, clamp((this.phaseT - 1250) / 200, 0, 1)); }
    }
    ctx.restore();
    // colour grade + vignette (screen space)
    ctx.fillStyle = STAGES[this.stageIdx].grade; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (this.screen === 'fight' || this.screen === 'result') {
      this.drawHud(t);
    }
    if (this.letterbox > .01) { const h = 46 * this.letterbox; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h); ctx.fillStyle = `rgba(255,255,255,${.55 * this.letterbox})`; ctx.font = '13px Rubik, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('SLOW MOTION', W - 16, H - h / 2); }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * .85})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    for (const b of this.banners) { const p = b.t / b.life, a = p < .1 ? p / .1 : (p > .8 ? (1 - p) / .2 : 1), sc = b.small ? .5 : 1; ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, b.small ? 150 : H / 2 - 20); ctx.rotate(b.small ? 0 : -.04); ctx.scale(sc * (1 + (1 - a) * .3), sc * (1 + (1 - a) * .3)); ctx.font = '72px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(b.text, 0, 0); ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0); ctx.restore(); }
    if (this.screen === 'fight' && this.phase === 'intro') { if (this.round === 1 && this.phaseT < 2200) { ctx.save(); ctx.font = '600 15px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,.6)'; rrect(ctx, W / 2 - 300, 300, 600, 30, 8); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(this.mode === 'cpu' ? 'ARROWS or WASD move · ↓ crouch (↓+punch uppercut, ↓+kick sweep) · Z/J punch · X/K kick · C/L special · V/I super' : 'P1: ARROWS + Z X C V    ·    P2: WASD + J K L I', W / 2, 321); ctx.restore(); } const txt = this.phaseT < 1500 ? `ROUND ${this.round}` : 'FIGHT!'; ctx.save(); ctx.font = '84px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, W / 2, 230); ctx.fillStyle = this.phaseT < 1500 ? '#fff' : '#f0b429'; ctx.fillText(txt, W / 2, 230); ctx.restore(); }
    if (this.paused) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H); ctx.font = '64px Bangers, Impact, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PAUSED', W / 2, H / 2 - 20); ctx.font = '18px Rubik, sans-serif'; ctx.fillStyle = '#a3a9cc'; ctx.fillText('Esc / P resume · O settings · Backspace quit', W / 2, H / 2 + 30); }
    ctx.restore();
  },
  drawFxBack(t) {
    for (const e of this.fx) { const p = e.t / e.life, a = 1 - p;
      if (e.kind === 'ghost') { ctx.save(); ctx.globalAlpha = .3 * a; drawFighter(ctx, { ...e.f, x: e.x, y: e.y, state: e.state, t: e.f.t, anim: e.f.anim }, t, { noShadow: true, noUpdate: true }); ctx.restore(); }
      else if (e.kind === 'speedlines') { const f = e.f; ctx.save(); ctx.globalAlpha = a * .7; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 28; i++) { const an = i / 28 * TAU + e.t * .002, r0 = 90 + ((i * 37) % 60), r1 = 900; ctx.moveTo(f.x + Math.cos(an) * r0, f.y - 90 + Math.sin(an) * r0); ctx.lineTo(f.x + Math.cos(an) * r1, f.y - 90 + Math.sin(an) * r1); } ctx.stroke(); ctx.restore(); }
      else if (e.kind === 'aura') { const f = e.f, sc = f.def.scale || 1; ctx.save(); ctx.globalAlpha = Math.min(1, a * 2) * .9; for (let i = 0; i < 14; i++) { const an = e.t * .004 + i / 14 * TAU, r = 70 * sc + Math.sin(e.t * .006 + i) * 14, yy = f.y - 95 * sc + Math.sin(an * 2) * 60 * sc; ctx.fillStyle = i % 3 ? e.c : '#fff'; ctx.beginPath(); ctx.arc(f.x + Math.cos(an) * r, yy, 3 + (i % 3), 0, TAU); ctx.fill(); } ctx.restore(); }
      else if (e.kind === 'charge') { const f = e.f; ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = e.c; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y - 90, 120 * a + 20, 0, TAU); ctx.stroke(); for (let i = 0; i < 8; i++) { const an = i / 8 * TAU + e.t * .01; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(f.x + Math.cos(an) * (110 * a + 20), f.y - 90 + Math.sin(an) * (110 * a + 20), 3, 0, TAU); ctx.fill(); } ctx.restore(); }
      else if (e.kind === 'sig') { this.drawSignature(e, t); }
      if (e.kind === 'bolt') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); e.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
      else if (e.kind === 'unibeam') { ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.fillStyle = 'rgba(191,239,255,.9)'; const h = 34 + Math.sin(e.t * .05) * 6; ctx.fillRect(e.dir > 0 ? e.x : -40, e.y - h / 2, e.dir > 0 ? W + 40 - e.x : e.x + 40, h); ctx.fillStyle = '#fff'; ctx.fillRect(e.dir > 0 ? e.x : -40, e.y - 6, e.dir > 0 ? W + 40 - e.x : e.x + 40, 12); ctx.restore(); }
      else if (e.kind === 'illusion') { drawFighter(ctx, { def: e.def, x: e.x, y: e.y, facing: e.facing, state: 'idle', t: 0, flashHit: 0 }, t, { alpha: a * .6, noShadow: true }); }
      else if (e.kind === 'trail') { ctx.save(); ctx.globalAlpha = .35 * a; drawFighter(ctx, { ...e.f, x: e.x, y: e.y, state: 'special', t: 200 }, t, { flat: true, noShadow: true, noProp: true }); ctx.restore(); }
      else if (e.kind === 'portal') { ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.3); ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(e.x, e.y, 40 * Math.min(1, p * 3), 80 * Math.min(1, p * 3), 0, 0, TAU); ctx.stroke(); for (let i = 0; i < 10; i++) { const an = i / 10 * TAU + e.t * .02; ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(e.x + Math.cos(an) * 44, e.y + Math.sin(an) * 84, 2.5, 0, TAU); ctx.fill(); } ctx.restore(); }
      else if (e.kind === 'crack') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#1a0a05'; ctx.lineWidth = 4; ctx.beginPath(); for (let i = -4; i <= 4; i++) { ctx.moveTo(e.x, GROUND); ctx.lineTo(e.x + i * 50 + Math.sin(i * 9) * 6, GROUND + 30 + Math.abs(i) * 12); } ctx.stroke(); ctx.restore(); }
      else if (e.kind === 'webline') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.a.x + e.a.facing * 36, e.a.y - 112); ctx.lineTo(e.b.x, e.b.y - 100); ctx.stroke(); ctx.restore(); }
      else if (e.kind === 'tendril') { ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.4); const q = Math.min(1, p * 2.5), mx = lerp(e.x1, e.x2, .5), my = Math.min(e.y1, e.y2) - 60; ctx.strokeStyle = '#0e0e14'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(e.x1, e.y1); const ex = lerp(e.x1, e.x2, q), ey = lerp(e.y1, e.y2, q); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke(); ctx.strokeStyle = '#3a3a4a'; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = '#0e0e14'; ctx.beginPath(); ctx.arc(ex, ey, 10, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) poly(ctx, [[ex - 8 + i * 4, ey - 2], [ex - 6 + i * 4, ey + 5], [ex - 4 + i * 4, ey - 2]], '#fff'); ctx.restore(); }
      else if (e.kind === 'snapwave') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(e.x, e.y, 30 + p * 700 + i * 40, 0, TAU); ctx.stroke(); } ctx.restore(); }
    }
  },
  drawFxFront(t) {
    for (const e of this.fx) { const p = e.t / e.life, a = 1 - p;
      if (e.kind === 'spark') { ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(p * 2); ctx.fillStyle = e.c; ctx.globalAlpha = a; const r = e.block ? 18 : 26 + p * 20; ctx.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * .35 : r, an = i / 8 * TAU; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); ctx.restore(); }
      else if (e.kind === 'num') { ctx.save(); ctx.globalAlpha = a; ctx.font = '30px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText(e.text, e.x, e.y - p * 40); ctx.fillStyle = e.c; ctx.fillText(e.text, e.x, e.y - p * 40); ctx.restore(); }
      else if (e.kind === 'ring') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = e.c; ctx.lineWidth = 6 * a + 1; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * p + 10, (e.r * p + 10) * (e.y >= GROUND ? .3 : 1), 0, 0, TAU); ctx.stroke(); ctx.restore(); }
      else if (e.kind === 'clap') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; for (let i = 0; i < 4; i++) { const r = 30 + i * 30 + p * 170; ctx.beginPath(); ctx.arc(e.x, e.y, r, e.dir > 0 ? -.9 : Math.PI - .9, e.dir > 0 ? .9 : Math.PI + .9); ctx.stroke(); } ctx.font = '40px Bangers, Impact, sans-serif'; ctx.fillStyle = '#ffd166'; ctx.textAlign = 'center'; ctx.fillText('CLAP!', e.x + e.dir * (60 + p * 60), e.y - 40 - p * 30); ctx.restore(); }
      else if (e.kind === 'impact') { ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = a; const r = (e.big ? 44 : 30) * (0.6 + p * .8); ctx.fillStyle = '#fff'; ctx.beginPath(); for (let i = 0; i < 14; i++) { const rr = i % 2 ? r * .55 : r, an = i / 14 * TAU + e.t * .004; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); ctx.fillStyle = e.big ? '#ffd166' : '#ff9f43'; ctx.beginPath(); for (let i = 0; i < 14; i++) { const rr = (i % 2 ? r * .55 : r) * .62, an = i / 14 * TAU + e.t * .004; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); if (e.big) { ctx.font = '28px Bangers, Impact, sans-serif'; ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('POW!', 0, 0); } ctx.restore(); }
      else if (e.kind === 'flare') { if (e.t > e.delay) { const q = (e.t - e.delay) / (e.life - e.delay), f = e.f, sc = f.def.scale || 1, x = f.x + f.facing * (e.reach * (0.5 + q * .6)) * sc, y = f.y + e.dy * sc; ctx.save(); ctx.globalAlpha = (1 - q) * .95; ctx.translate(x, y); ctx.scale(f.facing, 1);
        switch (styleId(e.id)) {
          case 'panther': ctx.strokeStyle = '#d9c8ff'; ctx.lineWidth = 3; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-30, -26 + i * 14); ctx.lineTo(26 + q * 20, 14 + i * 14); ctx.stroke(); } break;
          case 'venom': ctx.strokeStyle = '#0e0e14'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-40, 10); ctx.quadraticCurveTo(0, -30 - q * 20, 30 + q * 20, 0); ctx.stroke(); ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) poly(ctx, [[10 + i * 8, -6], [13 + i * 8, 2], [16 + i * 8, -6]], '#fff'); break;
          case 'ironman': ctx.fillStyle = '#bfefff'; ctx.beginPath(); ctx.arc(0, 0, 8 + q * 10, 0, TAU); ctx.fill(); break;
          case 'thor': ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { let px = 0, py = 0; ctx.beginPath(); ctx.moveTo(0, 0); for (let k = 0; k < 3; k++) { px += rnd(-18, 22); py += rnd(-18, 18); ctx.lineTo(px, py); } ctx.stroke(); } break;
          case 'hulk': ctx.fillStyle = 'rgba(200,190,170,.7)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-10 + i * 10, 8 + Math.sin(i) * 6 - q * 20, 6 + q * 6, 0, TAU); ctx.fill(); } break;
          case 'spiderman': ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(an) * (10 + q * 16), Math.sin(an) * (10 + q * 16)); ctx.stroke(); } break;
          case 'strange': ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 10 + q * 14, 0, TAU); ctx.stroke(); for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + e.t * .01; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 10, Math.sin(an) * 10); ctx.lineTo(Math.cos(an) * (18 + q * 10), Math.sin(an) * (18 + q * 10)); ctx.stroke(); } break;
          case 'thanos': ctx.fillStyle = '#9b5cff'; ctx.beginPath(); ctx.arc(0, 0, 7 + q * 12, 0, TAU); ctx.fill(); break;
          case 'loki': ctx.fillStyle = '#7dffb0'; for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + q * 3; ctx.beginPath(); ctx.arc(Math.cos(an) * (8 + q * 18), Math.sin(an) * (8 + q * 18), 2.5, 0, TAU); ctx.fill(); } break;
          case 'cap': star(ctx, 0, 0, 10 + q * 8, 'rgba(255,255,255,.9)'); break;
        } ctx.restore(); } }
      else if (e.kind === 'universe') { ctx.save(); const q = p; ctx.globalAlpha = Math.min(1, (1 - q) * 1.6); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (let i = 0; i < 16; i++) { const an = i / 16 * TAU + .3; let x = e.x, y = e.y; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += Math.cos(an + (k % 2 ? .4 : -.4)) * 90 * q; y += Math.sin(an + (k % 2 ? .4 : -.4)) * 90 * q; ctx.lineTo(x, y); } ctx.stroke(); } for (let i = 0; i < 60; i++) { const an = i * 2.4 + e.t * .001, r = (1 - q) * 520 + 20, px = e.x + Math.cos(an) * r * (1 + (i % 5) * .1), py = e.y + Math.sin(an) * r * .6; ctx.fillStyle = ['#fff', '#9b5cff', '#f0b429', '#3fa9ff'][i % 4]; ctx.globalAlpha = (1 - q) * .9; ctx.fillRect(px, py, 2 + (i % 3), 2 + (i % 3)); } ctx.globalAlpha = q < .5 ? q * 1.4 : (1 - q) * 1.4; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e.x, e.y, 30 + q * 90, 0, TAU); ctx.fill(); ctx.restore(); }
      else if (e.kind === 'debris') { e.vy += 1400 / 120; e.x += e.vx / 120; e.y += e.vy / 120; if (e.y > GROUND) { e.y = GROUND; e.vy *= -.4; } ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = e.c; ctx.translate(e.x, e.y); ctx.rotate(e.t * .01); ctx.fillRect(-4, -4, 8, 8); ctx.restore(); }
      else if (e.kind === 'puff') { const n = e.big ? 7 : 4; ctx.save(); ctx.globalAlpha = a * .5; ctx.fillStyle = '#d8d0c4'; for (let i = 0; i < n; i++) { const an = Math.PI + (i / (n - 1)) * Math.PI, r = (e.big ? 28 : 16) * p + 8; ctx.beginPath(); ctx.arc(e.x + Math.cos(an) * r * 1.6, e.y - 4 + Math.sin(an) * r * .5, (e.big ? 8 : 5) * (1 - p * .5), 0, TAU); ctx.fill(); } ctx.restore(); }
      else if (e.kind === 'swipe') { if (e.t > e.delay) { const q = (e.t - e.delay) / (e.life - e.delay), f = e.f, sc = f.def.scale || 1; ctx.save(); ctx.globalAlpha = 1 - q; ctx.translate(f.x + f.facing * (e.big ? 70 : 60) * sc, f.y + e.dy * sc); ctx.scale(f.facing, 1); if (e.up) ctx.rotate(-1.3); ctx.strokeStyle = '#fff'; ctx.lineWidth = e.big ? 6 : 4; ctx.beginPath(); ctx.arc(0, 0, (e.big ? 34 : 24) + q * 14, -1.1, 1.1); ctx.stroke(); ctx.restore(); } }
      else if (e.kind === 'slash') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = e.c; ctx.lineWidth = 4; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(e.x - 30, e.y - 30 + i * 14); ctx.lineTo(e.x + 30, e.y + 30 + i * 14); ctx.stroke(); } ctx.restore(); }
      else if (e.kind === 'glyph') { ctx.save(); ctx.globalAlpha = a; ctx.translate(e.x, e.y); ctx.rotate(e.t * .004); ctx.strokeStyle = '#35c26b'; ctx.lineWidth = 3; for (const r of [60, 85]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); } for (let i = 0; i < 12; i++) { const an = i / 12 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 60, Math.sin(an) * 60); ctx.lineTo(Math.cos(an) * 85, Math.sin(an) * 85); ctx.stroke(); } ctx.rotate(-e.t * .008); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -50); ctx.stroke(); ctx.restore(); }
      else if (e.kind === 'stoneglow') { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = STONES[e.i]; ctx.beginPath(); ctx.arc(e.x + Math.cos(e.i) * 14, e.y + Math.sin(e.i * 1.7) * 14, 6 + p * 10, 0, TAU); ctx.fill(); ctx.restore(); }
      else if (e.kind === 'dust') { ctx.save(); ctx.globalAlpha = a * .8; ctx.fillStyle = '#c9b8a8'; ctx.fillRect(e.x, e.y, 3, 3); ctx.restore(); }
    }
  },
  drawSignature(e, t) {
    const f = e.f, sc = f.def.scale || 1, p = e.t / e.life, cx = f.x, cy = f.y - 95 * sc, sup = e.phase === 'super';
    ctx.save();
    switch (styleId(e.id)) {
      case 'thor': { ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 2; for (let i = 0; i < (sup ? 7 : 4); i++) { const an = (i / 5) * TAU + e.t * .02; let x = cx + Math.cos(an) * 30 * sc, y = cy + Math.sin(an) * 60 * sc; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rnd(-25, 25); y += rnd(-25, 25); ctx.lineTo(x, y); } ctx.stroke(); } break; }
      case 'ironman': { const a = sup ? 1 : Math.sin(p * Math.PI); ctx.globalAlpha = a; ctx.fillStyle = '#bfefff'; ctx.beginPath(); ctx.arc(cx + f.facing * 8 * sc, cy + 6 * sc, (sup ? 16 : 9) * sc * (1 + Math.sin(e.t * .03) * .2), 0, TAU); ctx.fill(); if (!sup && p < .5) { ctx.beginPath(); ctx.arc(cx + f.facing * 46 * sc, cy - 10 * sc, 12 * p * 2 * sc, 0, TAU); ctx.fill(); } break; }
      case 'strange': { ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2.5; for (const side of sup ? [-1, 1] : [1]) { const hx = cx + f.facing * side * 42 * sc, hy = cy - 6 * sc; ctx.save(); ctx.translate(hx, hy); ctx.rotate(e.t * .005 * side); for (const r of [14, 22, 30]) { ctx.beginPath(); ctx.arc(0, 0, r * sc, 0, TAU); ctx.stroke(); } for (let i = 0; i < 8; i++) { const an = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 14 * sc, Math.sin(an) * 14 * sc); ctx.lineTo(Math.cos(an) * 30 * sc, Math.sin(an) * 30 * sc); ctx.stroke(); } ctx.restore(); for (let i = 0; i < 6; i++) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(hx + rnd(-30, 30), hy + rnd(-30, 30), 1.5, 0, TAU); ctx.fill(); } } break; }
      case 'panther': { ctx.strokeStyle = '#9b5cff'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { const q = ((e.t * .002) + i / 3) % 1; ctx.globalAlpha = 1 - q; ctx.beginPath(); ctx.ellipse(cx, cy, (20 + q * 70) * sc, (40 + q * 90) * sc, 0, 0, TAU); ctx.stroke(); } break; }
      case 'thanos': { for (let i = 0; i < 6; i++) { const an = e.t * .006 + i / 6 * TAU, hx = cx + f.facing * 46 * sc, hy = cy + 10 * sc; ctx.fillStyle = STONES[i]; ctx.beginPath(); ctx.arc(hx + Math.cos(an) * 22 * sc, hy + Math.sin(an) * 22 * sc, 4, 0, TAU); ctx.fill(); } break; }
      case 'venom': { ctx.fillStyle = '#0e0e14'; for (let i = 0; i < 8; i++) { const q = ((e.t * .0015) + i * .13) % 1, x = cx + Math.sin(i * 2.3) * 30 * sc, y = cy - 60 * sc + q * 170 * sc; ctx.beginPath(); ctx.ellipse(x, y, 3, 7 + q * 6, 0, 0, TAU); ctx.fill(); } if (sup) { ctx.strokeStyle = '#0e0e14'; ctx.lineWidth = 6; ctx.lineCap = 'round'; for (let i = 0; i < 5; i++) { const an = e.t * .003 + i / 5 * TAU; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + Math.cos(an) * 60 * sc, cy + Math.sin(an) * 60 * sc, cx + Math.cos(an + .8) * 110 * sc, cy + Math.sin(an + .8) * 100 * sc); ctx.stroke(); } } break; }
      case 'loki': { for (let i = 0; i < 10; i++) { const an = e.t * .004 + i / 10 * TAU, r = (50 + Math.sin(e.t * .01 + i) * 15) * sc; ctx.fillStyle = i % 2 ? '#7dffb0' : '#d4a017'; ctx.globalAlpha = .5 + .5 * Math.sin(e.t * .02 + i); ctx.beginPath(); ctx.arc(cx + Math.cos(an) * r, cy + Math.sin(an) * r * 1.4, 2.5, 0, TAU); ctx.fill(); } break; }
      case 'spiderman': { ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const an = -Math.PI / 2 + (i - 2.5) * .35; ctx.beginPath(); ctx.moveTo(cx + f.facing * 40 * sc, cy - 10 * sc); ctx.lineTo(cx + f.facing * 40 * sc + Math.cos(an) * 40 * p * sc * f.facing, cy - 10 * sc + Math.sin(an) * 40 * p * sc); ctx.stroke(); } break; }
      case 'hulk': { if (sup) { ctx.strokeStyle = '#35c26b'; ctx.lineWidth = 4; for (let i = 0; i < 3; i++) { const q = ((e.t * .003) + i / 3) % 1; ctx.globalAlpha = 1 - q; ctx.beginPath(); ctx.arc(cx, cy, (30 + q * 100) * sc, 0, TAU); ctx.stroke(); } } break; }
      case 'cap': { if (sup) { for (let i = 0; i < 3; i++) { const q = ((e.t * .0025) + i / 3) % 1; ctx.globalAlpha = 1 - q; drawShield(ctx, cx + f.facing * (40 + q * 120) * sc, cy - 20 * sc - q * 30, e.t * .02, .6 + q * .6); } } break; }
    }
    ctx.restore();
  },
  drawHud(t) {
    const [a, b] = this.fighters; ctx.save();
    const bar = (f, right) => {
      const x = right ? W - 40 - 380 : 40, y = 26, w = 380, h = 22; ctx.fillStyle = 'rgba(0,0,0,.6)'; rrect(ctx, x - 3, y - 3, w + 6, h + 6, 4); ctx.fill();
      ctx.fillStyle = '#3b1d1d'; ctx.fillRect(x, y, w, h); const hp = clamp(f.hp / f.maxHp, 0, 1), ww = w * hp; const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, hp > .35 ? '#4fe08a' : '#ff6b6b'); g.addColorStop(1, hp > .35 ? '#1d9a55' : '#c0392b'); ctx.fillStyle = g; ctx.fillRect(right ? x + w - ww : x, y, ww, h);
      const my = y + h + 8, mh = 8; ctx.fillStyle = 'rgba(0,0,0,.6)'; rrect(ctx, x - 3, my - 2, w * .7 + 6, mh + 4, 3); ctx.fill(); ctx.fillStyle = '#2a2340'; ctx.fillRect(right ? x + w * .3 : x, my, w * .7, mh); const mw = w * .7 * (f.meter / 100); ctx.fillStyle = f.meter >= 100 ? (Math.sin(t * .02) > 0 ? '#fff6c2' : '#ffd166') : '#f0b429'; ctx.fillRect(right ? x + w - mw : x, my, mw, mh);
      ctx.font = '20px Bangers, Impact, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = right ? 'right' : 'left'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; const nx = right ? x + w : x; ctx.strokeText(f.def.name.toUpperCase(), nx, y + h + 36); ctx.fillText(f.def.name.toUpperCase(), nx, y + h + 36);
      for (let i = 0; i < ROUNDS_TO_WIN; i++) { ctx.fillStyle = i < f.wins ? '#ffd166' : 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(right ? x + w * .3 - 14 - i * 20 : x + w * .7 + 14 + i * 20, my + 4, 6, 0, TAU); ctx.fill(); }
      if (f.meter >= 100) { ctx.font = '13px Bangers, Impact, sans-serif'; ctx.fillStyle = '#ffd166'; ctx.textAlign = right ? 'left' : 'right'; ctx.fillText('SUPER READY', right ? x + w * .3 - 70 : x + w * .7 + 70, my + 8); }
    };
    bar(a, false); bar(b, true);
    ctx.fillStyle = 'rgba(0,0,0,.65)'; rrect(ctx, W / 2 - 42, 14, 84, 46, 6); ctx.fill(); ctx.font = '36px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = this.timer < 10 ? '#ff6b6b' : '#fff'; ctx.fillText(String(Math.ceil(this.timer)).padStart(2, '0'), W / 2, 50);
    for (const f of this.fighters) if (f.combo >= 2 && f.comboT > 0) { const right = f.side === 1; ctx.save(); ctx.globalAlpha = clamp(f.comboT / 400, 0, 1); ctx.font = '34px Bangers, Impact, sans-serif'; ctx.textAlign = right ? 'right' : 'left'; ctx.lineWidth = 6; ctx.strokeStyle = '#000'; const txt = `${f.combo} HIT COMBO`; ctx.strokeText(txt, right ? W - 40 : 40, 140); ctx.fillStyle = right ? '#3fa9ff' : '#ff6b6b'; ctx.fillText(txt, right ? W - 40 : 40, 140); ctx.restore(); }
    ctx.restore();
  }
};
function drawBubble(f, text, a) {
  ctx.save(); ctx.globalAlpha = a; ctx.font = '600 15px Rubik, sans-serif'; const pad = 12, w = Math.min(300, ctx.measureText(text).width + pad * 2), lines = wrapText(text, w - pad * 2), h = lines.length * 20 + pad * 1.4;
  const x = clamp(f.x - w / 2, 10, W - w - 10), y = f.y - 175 * (f.def.scale || 1) - h - 10; ctx.fillStyle = '#fff'; rrect(ctx, x, y, w, h, 10); ctx.fill(); poly(ctx, [[clamp(f.x - 8, x + 12, x + w - 24), y + h - 1], [clamp(f.x + 8, x + 24, x + w - 12), y + h - 1], [f.x, y + h + 12]], '#fff');
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + pad * .7 + i * 20)); ctx.restore();
}
function wrapText(text, maxW) { const words = text.split(' '), lines = []; let cur = ''; for (const wd of words) { const tst = cur ? cur + ' ' + wd : wd; if (ctx.measureText(tst).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = tst; } if (cur) lines.push(cur); return lines; }

/* ============================================================ */
/*  Screens / UI                                                 */
/* ============================================================ */
const screens = { title: $('#scr-title'), select: $('#scr-select'), result: $('#scr-result'), settings: $('#scr-settings') };
function showScreen(name) { for (const k in screens) screens[k].hidden = k !== name; if (name) game.screen = name; }
function goTitle() { game.screen = 'title'; game.paused = false; game.hitstop = 0; showScreen('title'); }
function openSelect(mode) { game.mode = mode; rebuildKeymaps(); $('#opt-diff').value = String(SETTINGS.difficulty); game.picks = [null, null]; game.picker = 0; game.cursor = 0; game.screen = 'select'; $('#lbl-diff').hidden = mode !== 'cpu'; buildSelectGrid(); updateSelectHead(); showScreen('select'); }
function updateSelectHead() {
  const who = $('#sel-who'), p = game.picker; who.className = 'who ' + (p === 0 ? 'p1c' : 'p2c');
  who.textContent = p === 0 ? 'PLAYER 1 — CHOOSE YOUR FIGHTER' : (game.mode === 'cpu' ? 'CHOOSE YOUR OPPONENT (CPU)' : 'PLAYER 2 — CHOOSE YOUR FIGHTER');
  document.querySelectorAll('#select-grid .pick').forEach((el, i) => { el.classList.toggle('p1', game.picks[0] === ROSTER[i]); el.classList.toggle('p2', game.picks[1] === ROSTER[i]); el.querySelector('.t1').hidden = game.picks[0] !== ROSTER[i]; el.querySelector('.t2').hidden = game.picks[1] !== ROSTER[i]; el.style.outline = i === game.cursor ? `2px dashed ${p === 0 ? '#ff6b6b' : '#3fa9ff'}` : ''; });
  const d = ROSTER[game.cursor]; $('#sel-bio').innerHTML = `<b>${esc(d.name)}</b> · ${esc(d.alias)} — <i>“${esc(d.line)}”</i><br>Special: <b>${esc(d.special.name)}</b> · Super: <b>${esc(d.sup.name)}</b>${d.fly ? ' · Flyer' : d.doubleJump ? ' · Double jump' : ''}`;
}
function buildSelectGrid() {
  const grid = $('#select-grid'); grid.innerHTML = ''; assets.portraitCanvases = assets.portraitCanvases.filter(([cv]) => cv.isConnected && !cv.closest('#select-grid'));
  ROSTER.forEach((d, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pick' + (d.villain ? ' villain' : ''); b.setAttribute('role', 'option'); b.innerHTML = `<span class="tag t1" hidden>P1</span><span class="tag t2" hidden>${game.mode === 'cpu' ? 'CPU' : 'P2'}</span><canvas width="90" height="90"></canvas><span class="nm">${esc(d.name)}</span>`; drawPortrait(b.querySelector('canvas').getContext('2d'), d, 90); assets.portraitCanvases.push([b.querySelector('canvas'), d]); b.addEventListener('mouseenter', () => { game.cursor = i; updateSelectHead(); }); b.addEventListener('click', () => { game.cursor = i; confirmPick(); }); grid.appendChild(b); });
}
function confirmPick() { audio.init(); audio.sfx('ui'); game.picks[game.picker] = ROSTER[game.cursor]; if (game.picker === 0) { game.picker = 1; game.cursor = (game.cursor + 1) % ROSTER.length; updateSelectHead(); } else { showScreen(null); game.screen = 'fight'; game.startMatch(); } }
$('#btn-vs-cpu').addEventListener('click', () => { audio.init(); audio.sfx('ui'); openSelect('cpu'); });
$('#btn-vs-2p').addEventListener('click', () => { audio.init(); audio.sfx('ui'); openSelect('2p'); });
$('#scr-title').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('.title-art, .sub, .blink')) { audio.init(); openSelect('cpu'); } });
$('#btn-random').addEventListener('click', () => { game.cursor = Math.floor(Math.random() * ROSTER.length); confirmPick(); });
$('#btn-back-title').addEventListener('click', goTitle);
/* ---------------- settings screen ---------------- */
const rebind = { active: false, player: 'p1', action: 'punch' };
const KEYNAMES = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', Comma: ',', Period: '.', Slash: '/', Quote: "'", Semicolon: ';', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=' };
const keyName = c => KEYNAMES[c] || c.replace(/^Key|^Digit|^Numpad/, m => m === 'Numpad' ? 'Num ' : '');
function renderBindings() {
  const el = $('#bind-table'); const rows = ACTIONS.map(a => `<tr><td>${a[0].toUpperCase() + a.slice(1)}</td>` + ['p1', 'p2'].map(p => `<td><button type="button" class="bind${rebind.active && rebind.player === p && rebind.action === a ? ' waiting' : ''}" data-p="${p}" data-a="${a}">${rebind.active && rebind.player === p && rebind.action === a ? 'Press a key…' : (SETTINGS.keys[p][a] || []).map(keyName).join(' / ') || '—'}</button></td>`).join('') + '</tr>').join('');
  el.innerHTML = `<thead><tr><th>Action</th><th>Player 1</th><th>Player 2</th></tr></thead><tbody>${rows}</tbody>`;
  el.querySelectorAll('.bind').forEach(b => b.addEventListener('click', () => { rebind.active = true; rebind.player = b.dataset.p; rebind.action = b.dataset.a; renderBindings(); }));
}
let settingsFrom = 'title';
function openSettings(from) { settingsFrom = from || game.screen; game.paused = game.screen === 'fight'; $('#set-sens').value = SETTINGS.sens; $('#set-sens-out').textContent = Math.round(SETTINGS.sens * 100) + '%'; $('#set-diff').value = String(SETTINGS.difficulty); $('#set-voice').value = SETTINGS.voice; $('#set-vol').value = SETTINGS.volume; $('#set-vol-out').textContent = Math.round(SETTINGS.volume * 100) + '%'; $('#set-sfx').checked = audio.on; renderBindings(); for (const k in screens) screens[k].hidden = k !== 'settings'; game.prevScreen = game.screen; game.screen = 'settings'; }
function closeSettings() { rebind.active = false; const back = game.prevScreen || 'title'; if (back === 'fight') { showScreen(null); game.screen = 'fight'; game.paused = true; } else showScreen(back); }
$('#btn-settings').addEventListener('click', () => { audio.init(); audio.sfx('ui'); openSettings('title'); });
$('#btn-settings-result').addEventListener('click', () => openSettings('result'));
$('#btn-settings-close').addEventListener('click', closeSettings);
$('#set-sens').addEventListener('input', e => { SETTINGS.sens = +e.target.value; $('#set-sens-out').textContent = Math.round(SETTINGS.sens * 100) + '%'; saveSettings(); });
$('#set-diff').addEventListener('change', e => { SETTINGS.difficulty = +e.target.value; $('#opt-diff').value = e.target.value; game.difficulty = SETTINGS.difficulty; saveSettings(); });
$('#set-voice').addEventListener('change', e => { SETTINGS.voice = e.target.value; saveSettings(); if (SETTINGS.voice === 'auto') speak('thor', 'Bring me Thanos!'); else if (SETTINGS.voice === 'fx') charSfx('hulk', 'intro'); });
$('#set-vol').addEventListener('input', e => { SETTINGS.volume = +e.target.value; $('#set-vol-out').textContent = Math.round(SETTINGS.volume * 100) + '%'; saveSettings(); });
$('#set-vol').addEventListener('change', () => { audio.init(); audio.sfx('hithard'); });
$('#set-sfx').addEventListener('change', e => { audio.on = e.target.checked; store.set('ib-sound', audio.on); $('#btn-sound').textContent = audio.on ? '🔊 Sound on' : '🔇 Sound off'; $('#btn-sound').setAttribute('aria-pressed', String(audio.on)); });
$('#set-reset-keys').addEventListener('click', () => { SETTINGS.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS)); saveSettings(); rebuildKeymaps(); renderBindings(); });
$('#opt-diff').addEventListener('change', e => { SETTINGS.difficulty = +e.target.value; saveSettings(); });
$('#opt-diff').value = String(SETTINGS.difficulty);
/* ---------------- fullscreen ---------------- */
let fsUserExited = false;
function requestDeviceFullscreen() { try { const el = document.documentElement; const req = el.requestFullscreen || el.webkitRequestFullscreen; if (req && !document.fullscreenElement) { const p = req.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } } catch { /* iframe or browser without fullscreen: in-page layout still applies */ } try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch { /* ignore */ } }
function setFullscreen(on, opts = {}) {
  document.body.classList.toggle('fs', on); $('#btn-fs').setAttribute('aria-pressed', String(on)); $('#fs-exit').hidden = !on;
  if (on) { if (!opts.auto) requestDeviceFullscreen(); setTouch(touchOn || coarse); window.scrollTo(0, 0); }
  else { try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch { /* ignore */ } }
}
const landscape = () => matchMedia('(orientation: landscape)').matches;
function autoFullscreen() { if (!coarse) return; if (landscape() && !fsUserExited && !document.body.classList.contains('fs')) setFullscreen(true, { auto: true }); if (!landscape()) { fsUserExited = false; if (document.body.classList.contains('fs') && !document.fullscreenElement) setFullscreen(false); } }
window.addEventListener('resize', () => setTimeout(autoFullscreen, 60)); window.addEventListener('orientationchange', () => setTimeout(autoFullscreen, 120));
// the first touch inside fullscreen layout is a user gesture: use it to ask the browser for real fullscreen
document.addEventListener('pointerdown', () => { if (document.body.classList.contains('fs') && coarse && !document.fullscreenElement) requestDeviceFullscreen(); }, { passive: true });
$('#btn-fs').addEventListener('click', () => setFullscreen(!document.body.classList.contains('fs')));
$('#btn-fs-title').addEventListener('click', () => { audio.init(); setFullscreen(true); });
$('#fs-exit').addEventListener('click', () => { fsUserExited = true; setFullscreen(false); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('fs') && coarse) { /* keep in-page fullscreen layout on phones */ } });
$('#btn-rematch').addEventListener('click', () => { showScreen(null); game.screen = 'fight'; game.startMatch(); });
$('#btn-reselect').addEventListener('click', () => openSelect(game.mode));
$('#btn-home').addEventListener('click', goTitle);
$('#btn-sound').addEventListener('click', e => { audio.on = !audio.on; store.set('ib-sound', audio.on); e.currentTarget.textContent = audio.on ? '🔊 Sound on' : '🔇 Sound off'; e.currentTarget.setAttribute('aria-pressed', String(audio.on)); audio.init(); audio.sfx('ui'); });
$('#btn-sound').textContent = audio.on ? '🔊 Sound on' : '🔇 Sound off';

rebuildKeymaps();
$('#arena').addEventListener('pointerdown', () => { try { $('#arena').focus({ preventScroll: true }); } catch { /* ignore */ } });
function isArenaVisible() { const r = $('#arena').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
window.addEventListener('keydown', e => {
  if (rebind.active) { e.preventDefault(); if (e.code !== 'Escape') { SETTINGS.keys[rebind.player][rebind.action] = [e.code]; saveSettings(); rebuildKeymaps(); } rebind.active = false; renderBindings(); return; }
  if (e.target.matches('input, textarea, select')) return; const inArena = game.screen !== 'title' || isArenaVisible();
  if (game.screen === 'settings') { if (e.code === 'Escape') closeSettings(); return; }
  if (GAME_KEYS.has(e.code) && inArena) e.preventDefault(); if (e.repeat) return; keys.add(e.code); pressed.add(e.code);
  if (game.screen === 'title' && e.code === 'Enter' && inArena) { audio.init(); openSelect('cpu'); }
  if (game.screen === 'select') { const map = (game.picker === 0 || game.mode === 'cpu') ? BOTH : P2, cols = 5; let c = game.cursor; if (map.left.includes(e.code)) c--; if (map.right.includes(e.code)) c++; if (map.jump.includes(e.code)) c -= cols; if (map.block.includes(e.code)) c += cols; if (c !== game.cursor) { game.cursor = (c + ROSTER.length) % ROSTER.length; audio.sfx('tick'); updateSelectHead(); } if (map.punch.includes(e.code) || e.code === 'Enter') confirmPick(); if (e.code === 'Escape') goTitle(); }
  if (game.screen === 'fight') { if (e.code === 'Escape' || e.code === 'KeyP') { game.paused = !game.paused; audio.sfx('ui'); } if (game.paused && e.code === 'Backspace') goTitle(); if (game.paused && e.code === 'KeyO') openSettings('fight'); }
  if (game.screen === 'result' && e.code === 'Enter') { showScreen(null); game.screen = 'fight'; game.startMatch(); }
});
window.addEventListener('keyup', e => keys.delete(e.code)); window.addEventListener('blur', () => keys.clear());

const touchEl = $('#touch'); let touchOn = store.get('ib-touch', coarse);
function setTouch(on) { touchOn = on; touchEl.classList.toggle('show', on); touchEl.setAttribute('aria-hidden', String(!on)); $('#btn-touch').setAttribute('aria-pressed', String(on)); store.set('ib-touch', on); }
setTouch(touchOn); $('#btn-touch').addEventListener('click', () => setTouch(!touchOn));
touchEl.querySelectorAll('.tbtn').forEach(b => { const k = 'T_' + b.dataset.k; const down = e => { e.preventDefault(); audio.init(); if (!keys.has(k)) pressed.add(k); keys.add(k); b.classList.add('on'); }, up = e => { e.preventDefault(); keys.delete(k); b.classList.remove('on'); }; b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); b.addEventListener('contextmenu', e => e.preventDefault()); });

/* roster cards */
function renderRoster() {
  const el = $('#roster'); el.innerHTML = ''; assets.portraitCanvases = assets.portraitCanvases.filter(([cv]) => cv.isConnected && !cv.closest('#roster'));
  ROSTER.forEach(d => { const c = document.createElement('article'); c.className = 'card'; c.style.setProperty('--c', d.color);
    const statRow = (l, v) => `<div class="stat"><span>${l}</span><span class="bar"><i style="width:${v * 10}%"></i></span><span>${v}</span></div>`;
    c.innerHTML = `<div class="top"><canvas width="152" height="152"></canvas><div><div class="nm">${esc(d.name)}</div><div class="ttl${d.villain ? ' v' : ''}">${d.villain ? 'Villain' : 'Hero'} · ${esc(d.alias)}</div></div></div><p class="quote">“${esc(d.line)}”</p>
      <div class="stats">${statRow('Power', d.stats.power)}${statRow('Speed', d.stats.speed)}${statRow('Guard', d.stats.guard)}</div>
      <div class="moves"><div><b>${esc(d.special.name)}</b> — ${esc(d.special.desc)}</div><div class="sup"><b>${esc(d.sup.name)}</b> — ${esc(d.sup.desc)}</div><div>HP ${d.hp}${d.fly ? ' · Flyer (double jump hover)' : d.doubleJump ? ' · Double jump' : ''}</div></div>`;
    drawPortrait(c.querySelector('canvas').getContext('2d'), d, 152); assets.portraitCanvases.push([c.querySelector('canvas'), d]);
    el.appendChild(c); });
}
renderRoster();

/* boot */
function fitCanvas() { const dpr = Math.min(coarse ? 1.25 : 1.5, window.devicePixelRatio || 1); if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; } }
$('#year').textContent = new Date().getFullYear(); game.stageIdx = Math.floor(Math.random() * STAGES.length); loadStageImages();
let last = performance.now(), acc = 0; const STEP = 1 / 120;
function loop(now) { const dt = Math.min(.1, (now - last) / 1000); last = now; acc += dt; while (acc >= STEP) { game.update(STEP); pressed.clear(); acc -= STEP; } fitCanvas(); game.draw(); requestAnimationFrame(loop); }
document.addEventListener('visibilitychange', () => { if (document.hidden && game.screen === 'fight') game.paused = true; });
window.__infinityBrawl = { game, HEROES, assets, SETTINGS };
autoFullscreen();
requestAnimationFrame(loop);
})();
