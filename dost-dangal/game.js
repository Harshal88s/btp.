/* Dost Dangal — a browser fighting game starring your friends.
   Plain canvas + vanilla JS. No build step, no dependencies. */
(() => {
'use strict';

/* ============================================================ */
/*  Constants & helpers                                          */
/* ============================================================ */
const W = 960, H = 540, GROUND = 452;
const ROUND_TIME = 60, ROUNDS_TO_WIN = 2, MAX_FIGHTERS = 12, STAT_BUDGET = 20;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const TAU = Math.PI * 2;

const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: ignore */ } }
};

/* ============================================================ */
/*  Catalog (what the Fighter Studio can choose from)            */
/* ============================================================ */
const SKINS = [
  { id: 'fair', label: 'Fair', c: '#f3cfae' }, { id: 'wheat', label: 'Wheatish', c: '#dca878' },
  { id: 'tan', label: 'Tan', c: '#bd8252' }, { id: 'brown', label: 'Brown', c: '#8f5b35' },
  { id: 'deep', label: 'Deep', c: '#5b3a22' }
];
const HAIRS = [
  ['short', 'Short'], ['spiky', 'Spiky'], ['curly', 'Curly'], ['long', 'Long'], ['bun', 'Bun'],
  ['buzz', 'Buzz cut'], ['mohawk', 'Mohawk'], ['cap', 'Cap'], ['beanie', 'Beanie'],
  ['hijab', 'Hijab'], ['turban', 'Turban'], ['bald', 'Bald']
];
const FACES = [['clean', 'Clean'], ['stubble', 'Stubble'], ['beard', 'Beard'], ['moustache', 'Moustache'], ['goatee', 'Goatee']];
const OUTFITS = [['tee', 'T-shirt'], ['hoodie', 'Hoodie'], ['kurta', 'Kurta'], ['shirt', 'Shirt'], ['jersey', 'Jersey'], ['saree', 'Saree'], ['blazer', 'Blazer'], ['tank', 'Tank top']];
const PROPS = [['none', 'None (throws a chappal)'], ['phone', 'Phone'], ['bat', 'Cricket bat'], ['book', 'Book'], ['chai', 'Chai glass'], ['guitar', 'Guitar'], ['dumbbell', 'Dumbbell'], ['laptop', 'Laptop'], ['bag', 'Backpack'], ['umbrella', 'Umbrella']];

const SPECIALS = {
  throw:    { label: 'Throw (fast projectile)',     desc: 'Hurls their prop straight ahead.' },
  lob:      { label: 'Lob (arcing throw)',          desc: 'Tosses the prop in a high arc that lands hard.' },
  triple:   { label: 'Triple shot',                 desc: 'Three quick projectiles in a spread.' },
  spin:     { label: 'Spin attack (multi-hit)',     desc: 'A whirling close-range attack that hits three times.' },
  dash:     { label: 'Dash punch',                  desc: 'Rushes forward with a shoulder charge.' },
  teleport: { label: 'Teleport strike',             desc: 'Vanishes and reappears behind the opponent for a knockdown hit.' },
  shout:    { label: 'Shout (close blast)',         desc: 'A short-range blast of pure volume.' },
  bind:     { label: 'Trap (stuns)',                desc: 'A slow projectile that freezes the opponent on hit.' }
};
const SUPERS = {
  wave:      { label: 'Shockwave (full screen)',   hits: 3, range: 2000 },
  rain:      { label: 'Rain from above',           hits: 4, range: 2000 },
  slam:      { label: 'Giant slam',                hits: 1, range: 330, knockdown: true },
  storm:     { label: 'Teleport storm',            hits: 5, range: 2000 },
  charge:    { label: 'Charge rush',               hits: 2, range: 2000 },
  spotlight: { label: 'Spotlight beam',            hits: 3, range: 2000 },
  stampede:  { label: 'Friends stampede',          hits: 4, range: 2000 },
  quake:     { label: 'Ground quake',              hits: 2, range: 2000, knockdown: true }
};

const STARTER_ROSTER = [
  { id: 'pri', name: 'Padhaku Pri', title: 'The Topper', quote: 'Syllabus kahan tak hua?', win: 'Pehle padh lete, phir ladte.',
    look: { skin: 'wheat', hair: 'bun', hairCol: '#2a1a12', face: 'clean', glasses: 'round', outfit: 'shirt', col1: '#f2ebdc', col2: '#2f6fb3', prop: 'book' },
    stats: { power: 5, speed: 6, guard: 8 }, special: { kind: 'throw', name: 'Notes Toss' }, sup: { kind: 'rain', name: 'Surprise Viva' } },
  { id: 'golu', name: 'Gym Bro Golu', title: 'Chest Day Everyday', quote: 'Bhai, protein liya aaj?', win: 'Light weight, baby.',
    look: { skin: 'tan', hair: 'buzz', hairCol: '#1b1b1b', face: 'stubble', glasses: 'none', outfit: 'tank', col1: '#1f1f1f', col2: '#f28c28', prop: 'dumbbell' },
    stats: { power: 10, speed: 3, guard: 6 }, special: { kind: 'lob', name: 'Protein Shake' }, sup: { kind: 'slam', name: 'Leg Day' } },
  { id: 'gunjan', name: 'Gamer Gunjan', title: 'Ranked Since Birth', quote: 'Ek aur match. Promise.', win: 'GG. Uninstall.',
    look: { skin: 'fair', hair: 'spiky', hairCol: '#3b1f6e', face: 'clean', glasses: 'none', outfit: 'hoodie', col1: '#4a2fbf', col2: '#38e38b', prop: 'phone' },
    stats: { power: 5, speed: 10, guard: 4 }, special: { kind: 'teleport', name: 'Lag Spike' }, sup: { kind: 'storm', name: 'Rage Quit' } },
  { id: 'chintu', name: 'Chai Chintu', title: 'Canteen Minister', quote: 'Chalo, chai peete hain.', win: 'Udhaar maaf nahi hoga.',
    look: { skin: 'brown', hair: 'curly', hairCol: '#1a1a1a', face: 'moustache', glasses: 'none', outfit: 'kurta', col1: '#d8a24a', col2: '#7b2d26', prop: 'chai' },
    stats: { power: 7, speed: 6, guard: 6 }, special: { kind: 'shout', name: 'Udhaar Reminder' }, sup: { kind: 'wave', name: 'Bill Aa Gaya' } }
];

/* ---- validation so imported / stored data cannot break the game ---- */
const enumOr = (v, list, fb) => list.includes(v) ? v : fb;
const colorOr = (v, fb) => /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? v : fb;
const strOr = (v, max, fb = '') => (typeof v === 'string' ? v : fb).replace(/[\u0000-\u001f]/g, '').slice(0, max);
function sanitizeFighter(raw, i) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const look = r.look || {}, st = r.stats || {}, sp = r.special || {}, su = r.sup || {};
  const stats = { power: clamp(+st.power || 6, 2, 10), speed: clamp(+st.speed || 6, 2, 10), guard: clamp(+st.guard || 6, 2, 10) };
  let over = stats.power + stats.speed + stats.guard - STAT_BUDGET;
  while (over > 0) { const k = ['power', 'speed', 'guard'].sort((a, b) => stats[b] - stats[a])[0]; stats[k]--; over--; }
  return {
    id: strOr(r.id, 24) || ('f' + Date.now().toString(36) + i),
    name: strOr(r.name, 16) || 'Fighter ' + (i + 1),
    title: strOr(r.title, 28), quote: strOr(r.quote, 60), win: strOr(r.win, 60),
    look: {
      skin: enumOr(look.skin, SKINS.map(s => s.id), 'wheat'),
      hair: enumOr(look.hair, HAIRS.map(h => h[0]), 'short'),
      hairCol: colorOr(look.hairCol, '#1b1b1b'),
      face: enumOr(look.face, FACES.map(f => f[0]), 'clean'),
      glasses: enumOr(look.glasses, ['none', 'round', 'square', 'shades'], 'none'),
      outfit: enumOr(look.outfit, OUTFITS.map(o => o[0]), 'tee'),
      col1: colorOr(look.col1, '#3a7bd5'), col2: colorOr(look.col2, '#f5c542'),
      prop: enumOr(look.prop, PROPS.map(p => p[0]), 'none')
    },
    stats,
    special: { kind: enumOr(sp.kind, Object.keys(SPECIALS), 'throw'), name: strOr(sp.name, 24) || 'Special' },
    sup: { kind: enumOr(su.kind, Object.keys(SUPERS), 'wave'), name: strOr(su.name, 24) || 'Super' }
  };
}
let ROSTER = (() => {
  const saved = store.get('dd-roster-v1', null);
  const list = Array.isArray(saved) && saved.length ? saved : STARTER_ROSTER;
  return list.slice(0, MAX_FIGHTERS).map(sanitizeFighter);
})();
const saveRoster = () => store.set('dd-roster-v1', ROSTER);
const skinColor = id => (SKINS.find(s => s.id === id) || SKINS[1]).c;
function shade(hex, amt) { // amt -1..1
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = c => clamp(Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/* ============================================================ */
/*  Audio (tiny synth, no files)                                 */
/* ============================================================ */
const audio = {
  ctx: null, on: store.get('dd-sound', true),
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(freq, dur, type = 'square', gain = .08, slide = 0) {
    if (!this.on || !this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + .02);
  },
  noise(dur, gain = .12, lp = 1200) {
    if (!this.on || !this.ctx) return; const c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = buf; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = gain;
    s.connect(f).connect(g).connect(c.destination); s.start();
  },
  sfx(name) {
    switch (name) {
      case 'punch': this.noise(.08, .1, 900); break;
      case 'kick': this.noise(.12, .14, 600); break;
      case 'hit': this.tone(140, .12, 'square', .09, -80); this.noise(.1, .1, 500); break;
      case 'block': this.tone(520, .06, 'triangle', .05); break;
      case 'whoosh': this.tone(300, .25, 'sawtooth', .04, 500); break;
      case 'special': this.tone(220, .3, 'sawtooth', .06, 660); break;
      case 'super': [0, .08, .16].forEach((d, i) => setTimeout(() => this.tone(110 * (i + 1), .5, 'square', .08), d * 1000)); this.noise(.5, .1, 300); break;
      case 'ko': this.tone(400, .7, 'sawtooth', .1, -350); break;
      case 'round': this.tone(440, .15, 'square', .06); setTimeout(() => this.tone(660, .25, 'square', .06), 150); break;
      case 'ui': this.tone(880, .05, 'square', .04); break;
      case 'win': [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.tone(f, .25, 'triangle', .07), i * 110)); break;
      case 'tick': this.tone(1200, .04, 'square', .03); break;
    }
  }
};

/* ============================================================ */
/*  Procedural character drawing                                  */
/* ============================================================ */
function limb(ctx, x1, y1, x2, y2, len, bend, width, color) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1;
  const slack = Math.max(0, len * len - d * d / 4);
  const h = Math.sqrt(slack) * .9, nx = -dy / d * bend, ny = dx / d * bend;
  const mx = (x1 + x2) / 2 + nx * h, my = (y1 + y2) / 2 + ny * h;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(mx, my); ctx.lineTo(x2, y2); ctx.stroke();
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function drawProp(ctx, prop, col2, x, y, rot = 0, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
  switch (prop) {
    case 'phone': ctx.fillStyle = '#111'; rrect(ctx, -6, -11, 12, 22, 2); ctx.fill(); ctx.fillStyle = '#5cc8ff'; ctx.fillRect(-4.5, -9, 9, 16); break;
    case 'bat': ctx.fillStyle = '#c99a5b'; rrect(ctx, -5, -34, 10, 46, 4); ctx.fill(); ctx.fillStyle = '#333'; rrect(ctx, -3, 10, 6, 14, 2); ctx.fill(); break;
    case 'book': ctx.fillStyle = col2; rrect(ctx, -9, -12, 18, 24, 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-7, -10, 2, 20); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(-3, -6, 9, 2); ctx.fillRect(-3, -1, 9, 2); break;
    case 'chai': ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(6, -9); ctx.lineTo(4.5, 9); ctx.lineTo(-4.5, 9); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#b86a2e'; ctx.beginPath(); ctx.moveTo(-5.4, -5); ctx.lineTo(5.4, -5); ctx.lineTo(4.5, 9); ctx.lineTo(-4.5, 9); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(6, -9); ctx.lineTo(4.5, 9); ctx.lineTo(-4.5, 9); ctx.closePath(); ctx.stroke(); break;
    case 'guitar': ctx.fillStyle = '#b5612b'; ctx.beginPath(); ctx.ellipse(0, 8, 13, 15, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, -8, 10, 10, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 6, 4, 0, TAU); ctx.fill(); ctx.fillStyle = '#3a2412'; ctx.fillRect(-2.5, -46, 5, 40); ctx.fillStyle = col2; ctx.fillRect(-4, -50, 8, 8); break;
    case 'dumbbell': ctx.fillStyle = '#444'; ctx.fillRect(-3, -18, 6, 36); ctx.fillStyle = '#222'; rrect(ctx, -9, -24, 18, 9, 2); ctx.fill(); rrect(ctx, -9, 15, 18, 9, 2); ctx.fill(); break;
    case 'laptop': ctx.fillStyle = '#9aa3ad'; rrect(ctx, -14, -9, 28, 18, 2); ctx.fill(); ctx.fillStyle = '#2b6fd6'; ctx.fillRect(-12, -7, 24, 14); ctx.fillStyle = '#fff'; ctx.fillRect(-9, -4, 10, 1.5); ctx.fillRect(-9, 0, 14, 1.5); break;
    case 'bag': ctx.fillStyle = col2; rrect(ctx, -11, -14, 22, 28, 6); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.25)'; rrect(ctx, -8, -2, 16, 10, 3); ctx.fill(); break;
    case 'umbrella': ctx.fillStyle = col2; ctx.beginPath(); ctx.arc(0, -20, 18, Math.PI, 0); ctx.fill(); ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, 18); ctx.arc(4, 18, 4, Math.PI, 0, true); ctx.stroke(); break;
    default: // chappal
      ctx.fillStyle = '#2c5fa8'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 16, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-6, 2); ctx.moveTo(0, -8); ctx.lineTo(6, 2); ctx.stroke();
  }
  ctx.restore();
}

function drawHead(ctx, look, opts = {}) {
  const skin = skinColor(look.skin), hc = look.hairCol, r = 20;
  const t = opts.t || 0, blink = (Math.floor(t / 2400) % 1 === 0) && (t % 2400) > 2300;
  // hair behind the head
  ctx.fillStyle = hc;
  if (look.hair === 'long') { rrect(ctx, -r - 3, -6, r * 2 + 6, 40, 8); ctx.fill(); }
  if (look.hair === 'hijab') { ctx.beginPath(); ctx.moveTo(-r - 6, -4); ctx.quadraticCurveTo(-r - 10, 36, 0, 36); ctx.quadraticCurveTo(r + 10, 36, r + 6, -4); ctx.closePath(); ctx.fill(); }
  if (look.hair === 'bun') { ctx.beginPath(); ctx.arc(-14, -20, 9, 0, TAU); ctx.fill(); }
  // face
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-r + 1, 2, 5, 0, TAU); ctx.fill(); // ear (back side)
  // facial hair
  const fh = shade(hc, -.1);
  if (look.face === 'beard') { ctx.fillStyle = fh; ctx.beginPath(); ctx.moveTo(-r + 2, 2); ctx.quadraticCurveTo(0, r + 10, r + 2, 4); ctx.lineTo(r - 2, 10); ctx.quadraticCurveTo(0, r + 2, -r + 4, 8); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(0, 8, r - 3, .15 * Math.PI, .85 * Math.PI); ctx.fill(); }
  if (look.face === 'stubble') { ctx.fillStyle = 'rgba(40,30,30,.28)'; ctx.beginPath(); ctx.arc(0, 4, r - 2, .1 * Math.PI, .9 * Math.PI); ctx.fill(); }
  if (look.face === 'goatee') { ctx.fillStyle = fh; ctx.beginPath(); ctx.ellipse(6, 15, 6, 5, 0, 0, TAU); ctx.fill(); }
  // eyes & mouth (facing +x)
  ctx.fillStyle = '#1a1210';
  if (blink) { ctx.fillRect(3, -3, 6, 2); ctx.fillRect(12, -3, 6, 2); }
  else { ctx.beginPath(); ctx.arc(6, -3, 2.4, 0, TAU); ctx.arc(15, -3, 2.4, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#1a1210'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(1, -9); ctx.lineTo(9, -10); ctx.moveTo(12, -10); ctx.lineTo(19, -9); ctx.stroke();
  ctx.strokeStyle = '#7a3b2e'; ctx.lineWidth = 2; ctx.beginPath();
  if (opts.mouth === 'open') { ctx.fillStyle = '#5a1f1a'; ctx.ellipse(12, 9, 4, 5, 0, 0, TAU); ctx.fill(); }
  else if (opts.mouth === 'grin') { ctx.arc(11, 6, 6, .1 * Math.PI, .9 * Math.PI); ctx.stroke(); }
  else { ctx.moveTo(7, 9); ctx.quadraticCurveTo(12, 12, 17, 8); ctx.stroke(); }
  if (look.face === 'moustache') { ctx.fillStyle = fh; ctx.beginPath(); ctx.ellipse(8, 5, 5, 2.6, -.2, 0, TAU); ctx.ellipse(16, 5, 5, 2.6, .2, 0, TAU); ctx.fill(); }
  // glasses
  if (look.glasses !== 'none') {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.8; ctx.fillStyle = look.glasses === 'shades' ? 'rgba(10,10,20,.85)' : 'rgba(180,220,255,.25)';
    const g = (x) => { ctx.beginPath(); if (look.glasses === 'round') ctx.arc(x, -3, 5, 0, TAU); else rrect(ctx, x - 5, -8, 10, 9, 2); ctx.fill(); ctx.stroke(); };
    g(6); g(15); ctx.beginPath(); ctx.moveTo(11, -3); ctx.lineTo(10, -3); ctx.moveTo(1, -4); ctx.lineTo(-r + 2, -2); ctx.stroke();
  }
  // hair on top
  ctx.fillStyle = hc;
  switch (look.hair) {
    case 'short': case 'long': case 'bun': ctx.beginPath(); ctx.arc(0, -2, r + 1, Math.PI, 0); ctx.lineTo(r + 1, -8); ctx.quadraticCurveTo(0, -14, -r - 1, -6); ctx.closePath(); ctx.fill(); break;
    case 'spiky': ctx.beginPath(); ctx.moveTo(-r - 1, -4); for (let i = 0; i < 6; i++) { const x = -r + i * (r * 2 / 5); ctx.lineTo(x + 3, -r - 12 - (i % 2) * 6); ctx.lineTo(x + 7, -r + 2); } ctx.lineTo(r + 1, -4); ctx.quadraticCurveTo(0, -r + 4, -r - 1, -4); ctx.fill(); break;
    case 'curly': for (let i = 0; i < 7; i++) { const a = Math.PI + i * (Math.PI / 6); ctx.beginPath(); ctx.arc(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2) - 2, 8, 0, TAU); ctx.fill(); } break;
    case 'buzz': ctx.fillStyle = shade(hc, .15); ctx.beginPath(); ctx.arc(0, -1, r + .5, Math.PI + .25, -.25); ctx.closePath(); ctx.fill(); break;
    case 'mohawk': ctx.beginPath(); ctx.moveTo(-10, -r + 4); for (let i = 0; i < 4; i++) { ctx.lineTo(-8 + i * 6, -r - 16); ctx.lineTo(-5 + i * 6, -r + 2); } ctx.lineTo(12, -r + 4); ctx.closePath(); ctx.fill(); break;
    case 'cap': ctx.beginPath(); ctx.arc(0, -3, r + 2, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = shade(hc, -.25); rrect(ctx, -2, -6, r + 16, 6, 3); ctx.fill(); break;
    case 'beanie': ctx.beginPath(); ctx.arc(0, -4, r + 2, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = shade(hc, -.2); rrect(ctx, -r - 3, -10, r * 2 + 6, 8, 3); ctx.fill(); ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(0, -r - 6, 5, 0, TAU); ctx.fill(); break;
    case 'hijab': ctx.beginPath(); ctx.arc(0, -1, r + 4, Math.PI * .95, Math.PI * .08); ctx.lineTo(r + 2, 8); ctx.quadraticCurveTo(0, 10, -r - 4, 6); ctx.closePath(); ctx.fill(); ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(3, 0, 15, 17, 0, 0, TAU); ctx.fill(); drawFaceAgain(ctx, look, blink, opts.mouth); break;
    case 'turban': ctx.beginPath(); ctx.ellipse(0, -14, r + 3, 15, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = shade(hc, .25); ctx.lineWidth = 2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * 2, -14 + i * 1.5, r + 1 - Math.abs(i), 12 - Math.abs(i) * 2, .15 * i, 0, TAU); ctx.stroke(); } break;
    case 'bald': ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-6, -13, 6, 3, -.4, 0, TAU); ctx.fill(); break;
  }
}
function drawFaceAgain(ctx, look, blink, mouth) { // re-draw features on top of a hijab oval
  ctx.fillStyle = '#1a1210';
  if (blink) { ctx.fillRect(3, -3, 6, 2); ctx.fillRect(12, -3, 6, 2); } else { ctx.beginPath(); ctx.arc(6, -3, 2.4, 0, TAU); ctx.arc(15, -3, 2.4, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#1a1210'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(1, -9); ctx.lineTo(9, -10); ctx.moveTo(12, -10); ctx.lineTo(18, -9); ctx.stroke();
  ctx.strokeStyle = '#7a3b2e'; ctx.lineWidth = 2; ctx.beginPath();
  if (mouth === 'open') { ctx.fillStyle = '#5a1f1a'; ctx.ellipse(12, 9, 4, 5, 0, 0, TAU); ctx.fill(); } else { ctx.moveTo(7, 9); ctx.quadraticCurveTo(12, 12, 17, 8); ctx.stroke(); }
}

/* Pose: joint targets in local space, feet at (0,0), facing +x. */
function poseFor(f, t) {
  const p = { lean: 0, rot: 0, dy: 0, headTilt: 0, mouth: 'calm',
    handF: [26, -96], handB: [-8, -102], footF: [14, 0], footB: [-14, 0], glow: 0, alpha: 1 };
  const s = f.state, st = f.t, prog = (a, b) => clamp((st - a) / (b - a), 0, 1), bell = x => Math.sin(clamp(x, 0, 1) * Math.PI);
  switch (s) {
    case 'idle': p.dy = Math.sin(t * .004) * 2; p.handF[1] += Math.sin(t * .004) * 2; break;
    case 'walk': { const ph = t * .012 * (f.vx < 0 ? -1 : 1); p.footF = [14 + Math.sin(ph) * 18, -Math.max(0, Math.sin(ph)) * 10]; p.footB = [-14 - Math.sin(ph) * 18, -Math.max(0, -Math.sin(ph)) * 10]; p.handF[0] += Math.sin(ph) * 6; break; }
    case 'jump': p.footF = [10, -34]; p.footB = [-6, -26]; p.handF = [30, -130]; p.handB = [-22, -125]; break;
    case 'punch': { const e = bell(prog(40, 260)); p.handF = [26 + e * 62, -108 + e * 4]; p.lean = e * 6; p.handB = [-14 - e * 6, -100]; p.mouth = e > .5 ? 'open' : 'calm'; break; }
    case 'kick': { const e = bell(prog(60, 420)); p.footF = [12 + e * 90, -e * 70]; p.lean = -e * 10; p.handF = [10 - e * 20, -110]; p.handB = [-20, -95]; p.footB = [-8, 0]; break; }
    case 'block': p.handF = [22, -118]; p.handB = [26, -98]; p.lean = -4; p.footF = [10, 0]; p.footB = [-18, 0]; break;
    case 'hit': { const e = 1 - prog(0, 320); p.lean = -14 * e; p.handF = [-4, -120 - 10 * e]; p.handB = [-22, -90]; p.headTilt = -.3 * e; p.mouth = 'open'; break; }
    case 'bound': p.lean = -2; p.handF = [12, -90]; p.handB = [-10, -92]; p.footF = [8, 0]; p.footB = [-8, 0]; p.mouth = 'open'; p.dy = Math.sin(t * .05) * 1.5; break;
    case 'down': case 'ko': { const e = prog(0, 260); p.rot = -Math.PI / 2 * e; p.dy = 0; p.handF = [10, -110]; p.handB = [-10, -110]; p.mouth = 'open'; p.footF = [10, 0]; p.footB = [-10, 0]; break; }
    case 'getup': { const e = 1 - prog(0, 300); p.rot = -Math.PI / 2 * e; p.handF = [10, -110]; p.handB = [-10, -110]; break; }
    case 'win': p.handB = [-14, -178 + Math.sin(t * .01) * 4]; p.handF = [26, -100]; p.mouth = 'grin'; p.dy = Math.abs(Math.sin(t * .008)) * -6; break;
    case 'special': { const e = bell(prog(0, f.actTotal || 500)); p.handF = [20 + e * 50, -130 + e * 10]; p.lean = e * 4; p.mouth = 'open'; p.glow = e;
      if (f.specialKind === 'spin') { p.rot = (st / 90) * TAU * 0; p.handF = [40, -100]; p.handB = [-40, -100]; p.footF = [30, 0]; p.footB = [-30, 0]; }
      if (f.specialKind === 'dash') { p.lean = 18; p.handF = [40, -100]; p.footB = [-30, 0]; }
      if (f.specialKind === 'teleport') { p.alpha = st < 180 ? 1 - st / 180 : (st < 300 ? 0 : clamp((st - 300) / 120, 0, 1)); p.handF = [50, -110]; }
      break; }
    case 'super': p.handF = [22, -176]; p.handB = [-18, -172]; p.mouth = 'open'; p.glow = 1; p.dy = -2 + Math.sin(t * .03) * 2; break;
    case 'taunt': p.handF = [34, -92]; p.handB = [-30, -92]; p.mouth = 'grin'; break;
  }
  return p;
}

function drawFighter(ctx, f, t, opts = {}) {
  const look = f.def.look, skin = skinColor(look.skin), p = opts.pose || poseFor(f, t);
  const c1 = look.col1, c2 = look.col2, c1d = shade(c1, -.25);
  ctx.save(); ctx.translate(f.x, f.y + p.dy); ctx.scale(f.facing, 1); ctx.rotate(p.rot); ctx.globalAlpha = p.alpha;
  if (p.glow > 0 && !opts.flat) { ctx.save(); ctx.globalAlpha = p.glow * .55; ctx.fillStyle = f.state === 'super' ? '#ffd166' : c2; ctx.beginPath(); ctx.ellipse(0, -85, 60, 95, 0, 0, TAU); ctx.filter = 'blur(14px)'; ctx.fill(); ctx.restore(); }
  if (f.flashHit > 0 && !opts.flat) ctx.filter = 'brightness(1.8) saturate(0)';
  // shadow
  if (!opts.noShadow) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, -p.dy + 2, 34, 7, 0, 0, TAU); ctx.fill(); }
  const hipY = -70, shY = -126, lean = p.lean;
  const hipX = lean * .4, shX = lean;
  // legs
  const legCol = { tee: '#2c3e66', hoodie: '#2a2a33', kurta: '#f1ead9', shirt: '#2b2b33', jersey: c1, saree: c1, blazer: c1d, tank: c2 }[look.outfit] || '#2c3e66';
  const legW = look.outfit === 'saree' ? 14 : 12;
  limb(ctx, hipX - 8, hipY, p.footB[0], p.footB[1], 38, -1, legW, shade(legCol, -.2));
  limb(ctx, hipX + 8, hipY, p.footF[0], p.footF[1], 38, -1, legW, legCol);
  // shoes
  ctx.fillStyle = look.outfit === 'kurta' ? '#6b3f1f' : '#1c1c1c';
  for (const ft of [p.footB, p.footF]) { rrect(ctx, ft[0] - 8, ft[1] - 5, 20, 8, 3); ctx.fill(); }
  // saree skirt / kurta hem
  if (look.outfit === 'saree') { ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(hipX - 16, hipY); ctx.lineTo(hipX + 16, hipY); ctx.lineTo(hipX + 26, -6); ctx.lineTo(hipX - 26, -6); ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.fillRect(hipX - 26, -12, 52, 6); }
  if (look.outfit === 'kurta') { ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(hipX - 18, hipY - 10); ctx.lineTo(hipX + 18, hipY - 10); ctx.lineTo(hipX + 22, hipY + 28); ctx.lineTo(hipX - 22, hipY + 28); ctx.closePath(); ctx.fill(); }
  // back arm (holds prop)
  const sleeve = ['tank', 'saree'].includes(look.outfit) ? skin : (look.outfit === 'jersey' ? c2 : c1);
  const armW = 10;
  limb(ctx, shX - 14, shY + 6, p.handB[0], p.handB[1], 34, 1, armW, shade(sleeve, -.15));
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(p.handB[0], p.handB[1], 6.5, 0, TAU); ctx.fill();
  if (look.prop !== 'none' && !opts.noProp && f.state !== 'special') drawProp(ctx, look.prop, c2, p.handB[0], p.handB[1] + 4, .25, .9);
  // torso
  ctx.fillStyle = c1;
  if (look.outfit === 'hoodie') { ctx.fillStyle = c1d; ctx.beginPath(); ctx.ellipse(shX - 4, shY - 8, 22, 14, 0, 0, TAU); ctx.fill(); ctx.fillStyle = c1; }
  ctx.beginPath(); ctx.moveTo(shX - 22, shY); ctx.lineTo(shX + 22, shY); ctx.lineTo(hipX + 17, hipY + 4); ctx.lineTo(hipX - 17, hipY + 4); ctx.closePath(); ctx.fill();
  switch (look.outfit) {
    case 'tee': ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(shX + 2, shY + 26, 9, 0, TAU); ctx.fill(); break;
    case 'hoodie': ctx.strokeStyle = c2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(shX - 4, shY + 4); ctx.lineTo(shX - 6, shY + 34); ctx.moveTo(shX + 4, shY + 4); ctx.lineTo(shX + 6, shY + 34); ctx.stroke(); ctx.fillStyle = c1d; rrect(ctx, hipX - 12, hipY - 14, 24, 12, 3); ctx.fill(); break;
    case 'kurta': ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(shX - 20, shY); ctx.lineTo(shX - 8, shY); ctx.lineTo(hipX + 14, hipY + 26); ctx.lineTo(hipX + 2, hipY + 26); ctx.closePath(); ctx.fill(); ctx.fillStyle = shade(c1, -.3); ctx.fillRect(shX - 1, shY + 2, 2, 24); break;
    case 'shirt': ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(shX - 8, shY); ctx.lineTo(shX, shY + 10); ctx.lineTo(shX + 8, shY); ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(shX + i * .5, shY + 16 + i * 11, 1.8, 0, TAU); ctx.fill(); } break;
    case 'jersey': ctx.fillStyle = c2; ctx.fillRect(shX - 22, shY + 14, 44, 6); ctx.font = 'bold 18px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('7', shX, shY + 44); break;
    case 'saree': ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(shX - 22, shY); ctx.lineTo(shX + 22, shY); ctx.lineTo(hipX + 17, shY + 30); ctx.lineTo(hipX - 17, shY + 30); ctx.closePath(); ctx.fill(); ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(shX - 24, shY - 6); ctx.lineTo(shX - 8, shY - 6); ctx.lineTo(hipX + 18, hipY + 4); ctx.lineTo(hipX - 18, hipY + 4); ctx.closePath(); ctx.fill(); break;
    case 'blazer': ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(shX - 9, shY); ctx.lineTo(shX + 9, shY); ctx.lineTo(hipX + 3, hipY); ctx.lineTo(hipX - 3, hipY); ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(shX - 3, shY + 4); ctx.lineTo(shX + 3, shY + 4); ctx.lineTo(hipX + 2, hipY - 4); ctx.lineTo(hipX - 2, hipY - 4); ctx.closePath(); ctx.fill(); break;
    case 'tank': ctx.fillStyle = skin; ctx.beginPath(); ctx.moveTo(shX - 22, shY); ctx.lineTo(shX - 10, shY); ctx.lineTo(shX - 14, shY + 14); ctx.closePath(); ctx.moveTo(shX + 22, shY); ctx.lineTo(shX + 10, shY); ctx.lineTo(shX + 14, shY + 14); ctx.closePath(); ctx.fill(); break;
  }
  // front arm
  limb(ctx, shX + 14, shY + 6, p.handF[0], p.handF[1], 34, -1, armW, sleeve);
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(p.handF[0], p.handF[1], 7, 0, TAU); ctx.fill();
  // neck + head
  ctx.fillStyle = skin; ctx.fillRect(shX - 5, shY - 12, 10, 14);
  ctx.save(); ctx.translate(shX + lean * .2, shY - 30); ctx.rotate(p.headTilt); drawHead(ctx, look, { t, mouth: p.mouth }); ctx.restore();
  ctx.restore();
}

function drawPortrait(ctx, def, size, t = 0) {
  ctx.clearRect(0, 0, size, size);
  const c1 = def.look.col1; const g = ctx.createLinearGradient(0, 0, 0, size); g.addColorStop(0, shade(c1, -.55)); g.addColorStop(1, '#130f22');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.save(); ctx.translate(size / 2, size * .78); const sc = size / 86; ctx.scale(sc, sc);
  // shoulders
  ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(0, 36, 34, 18, 0, 0, TAU); ctx.fill();
  if (def.look.outfit === 'tank' || def.look.outfit === 'saree') { ctx.fillStyle = skinColor(def.look.skin); ctx.fillRect(-28, 26, 12, 14); ctx.fillRect(16, 26, 12, 14); }
  ctx.fillStyle = skinColor(def.look.skin); ctx.fillRect(-6, 10, 12, 16);
  drawHead(ctx, def.look, { t }); ctx.restore();
}

/* ============================================================ */
/*  Stages                                                       */
/* ============================================================ */
const STAGES = [
  { name: 'Hostel Terrace', draw(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1030'); g.addColorStop(.7, '#2a1a4a'); g.addColorStop(1, '#3a2458'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; for (let i = 0; i < 60; i++) { const x = (i * 157) % W, y = (i * 83) % 260; ctx.globalAlpha = .4 + .6 * Math.abs(Math.sin(t * .001 + i)); ctx.fillRect(x, y, 2, 2); } ctx.globalAlpha = 1;
      ctx.fillStyle = '#f6edc8'; ctx.beginPath(); ctx.arc(800, 90, 34, 0, TAU); ctx.fill(); ctx.fillStyle = '#e6dcb4'; ctx.beginPath(); ctx.arc(812, 80, 7, 0, TAU); ctx.arc(790, 100, 5, 0, TAU); ctx.fill();
      // skyline
      ctx.fillStyle = '#16122c'; for (let i = 0; i < 14; i++) { const x = i * 72 - 20, h = 90 + ((i * 37) % 110); ctx.fillRect(x, 330 - h, 60, h + 40); ctx.fillStyle = '#f5c542'; for (let r = 0; r < h / 22; r++) for (let c = 0; c < 3; c++) if ((i * 7 + r * 3 + c) % 4 !== 0) { ctx.globalAlpha = .5 + .5 * ((i + r + c) % 3) / 2; ctx.fillRect(x + 10 + c * 16, 345 - h + r * 22, 8, 10); } ctx.globalAlpha = 1; ctx.fillStyle = '#16122c'; }
      // water tank
      ctx.fillStyle = '#1b1b1b'; ctx.fillRect(120, 300, 6, 60); ctx.fillRect(184, 300, 6, 60); ctx.fillStyle = '#2d2d2d'; rrect(ctx, 100, 240, 110, 66, 10); ctx.fill(); ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.ellipse(155, 240, 55, 12, 0, 0, TAU); ctx.fill();
      // clothesline
      ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(560, 250); ctx.quadraticCurveTo(720, 275, 900, 245); ctx.stroke();
      [['#e74c3c', 590], ['#3498db', 650], ['#f1c40f', 715], ['#ecf0f1', 780], ['#9b59b6', 845]].forEach(([c, x], i) => { const sw = Math.sin(t * .002 + i) * 4, y = 252 + Math.sin((x - 560) / 340 * Math.PI) * 18; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34, y); ctx.lineTo(x + 30 + sw, y + 44); ctx.lineTo(x + 4 + sw, y + 44); ctx.closePath(); ctx.fill(); });
      // parapet & floor
      ctx.fillStyle = '#5a3f5e'; ctx.fillRect(0, 360, W, 40); ctx.fillStyle = '#4a3350'; for (let x = 0; x < W; x += 60) ctx.fillRect(x + 4, 364, 52, 32);
      ctx.fillStyle = '#6a5570'; ctx.fillRect(0, 400, W, 2);
      const fl = ctx.createLinearGradient(0, 400, 0, H); fl.addColorStop(0, '#7d6b7f'); fl.addColorStop(1, '#4b3c52'); ctx.fillStyle = fl; ctx.fillRect(0, 402, W, H - 402);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2; for (let x = -100; x < W + 100; x += 90) { ctx.beginPath(); ctx.moveTo(x, 402); ctx.lineTo(x - 60, H); ctx.stroke(); }
      // string lights
      for (let i = 0; i < 12; i++) { ctx.fillStyle = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0'][i % 4]; ctx.globalAlpha = .6 + .4 * Math.sin(t * .004 + i); ctx.beginPath(); ctx.arc(40 + i * 80, 20 + Math.sin(i * 1.3) * 8, 5, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    } },
  { name: 'Canteen', draw(ctx, t) {
      ctx.fillStyle = '#f3e3c3'; ctx.fillRect(0, 0, W, 400); ctx.fillStyle = '#e4cfa5'; ctx.fillRect(0, 0, W, 60);
      // ceiling fan
      ctx.save(); ctx.translate(480, 60); ctx.fillStyle = '#6b5a45'; ctx.fillRect(-3, -60, 6, 60); ctx.rotate(t * .02); ctx.fillStyle = '#8a7558'; for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); ctx.fillRect(-7, 0, 14, 90); } ctx.restore();
      // menu board
      ctx.fillStyle = '#1f2d24'; rrect(ctx, 60, 90, 260, 170, 6); ctx.fill(); ctx.strokeStyle = '#b8864f'; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = '#f7e9b0'; ctx.font = 'bold 20px Rubik, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('AAJ KA MENU', 80, 122);
      ctx.font = '15px Rubik, sans-serif'; ['Cutting chai ..... ₹10', 'Samosa .............. ₹15', 'Maggi ................ ₹40', 'Udhaar ....... band hai'].forEach((s, i) => ctx.fillText(s, 80, 152 + i * 26));
      // counter with glasses
      ctx.fillStyle = '#9c6b3c'; ctx.fillRect(640, 250, 290, 150); ctx.fillStyle = '#b98650'; ctx.fillRect(630, 240, 310, 14);
      for (let i = 0; i < 6; i++) { drawProp(ctx, 'chai', '#fff', 670 + i * 44, 226, 0, 1.1); }
      ctx.fillStyle = '#c0392b'; rrect(ctx, 820, 150, 100, 70, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NO CREDIT', 870, 180); ctx.fillText('NO EXCUSES', 870, 200);
      // windows
      ctx.fillStyle = '#9fd3ff'; for (const x of [400, 520]) { ctx.fillRect(x, 100, 90, 110); ctx.strokeStyle = '#6b5a45'; ctx.lineWidth = 5; ctx.strokeRect(x, 100, 90, 110); ctx.beginPath(); ctx.moveTo(x + 45, 100); ctx.lineTo(x + 45, 210); ctx.moveTo(x, 155); ctx.lineTo(x + 90, 155); ctx.stroke(); }
      // floor tiles
      ctx.fillStyle = '#d9c3a0'; ctx.fillRect(0, 400, W, H - 400);
      for (let y = 400; y < H; y += 28) for (let x = -40 + ((y / 28) % 2) * 28; x < W; x += 56) { ctx.fillStyle = ((x + y) / 28) % 2 ? '#c9ad84' : '#e3d2b3'; ctx.fillRect(x, y, 56, 28); }
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(0, 400, W, 6);
    } },
  { name: 'College Gate', draw(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, '#7cc4ff'); g.addColorStop(1, '#dff1ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 400);
      ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 5; i++) { const x = ((i * 230 + t * .02) % (W + 200)) - 100; ctx.beginPath(); ctx.arc(x, 70 + i * 25, 26, 0, TAU); ctx.arc(x + 30, 60 + i * 25, 34, 0, TAU); ctx.arc(x + 65, 72 + i * 25, 24, 0, TAU); ctx.fill(); }
      // trees
      for (const x of [60, 880]) { ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - 10, 260, 20, 140); ctx.fillStyle = '#2e8b57'; ctx.beginPath(); ctx.arc(x, 230, 70, 0, TAU); ctx.fill(); ctx.fillStyle = '#3fa66b'; ctx.beginPath(); ctx.arc(x - 30, 250, 40, 0, TAU); ctx.arc(x + 30, 240, 44, 0, TAU); ctx.fill(); }
      // gate
      ctx.fillStyle = '#c94f3d'; ctx.fillRect(250, 150, 50, 250); ctx.fillRect(660, 150, 50, 250); ctx.fillStyle = '#a63c2d'; ctx.fillRect(240, 130, 480, 36); ctx.fillStyle = '#f7e9b0'; ctx.fillRect(250, 166, 460, 50);
      ctx.fillStyle = '#1b2a44'; ctx.font = 'bold 26px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DOST COLLEGE OF ENGG.', 480, 202);
      ctx.strokeStyle = '#222'; ctx.lineWidth = 4; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(320 + i * 40, 230); ctx.lineTo(320 + i * 40, 400); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(300, 300); ctx.lineTo(660, 300); ctx.stroke();
      // banner
      ctx.fillStyle = '#f28c28'; rrect(ctx, 330, 90, 300, 34, 4); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Rubik, sans-serif'; ctx.fillText('TECHFEST 2026  ·  FIGHT NIGHT', 480, 114);
      // auto rickshaw
      ctx.save(); ctx.translate(790 + Math.sin(t * .003) * 2, 330); ctx.fillStyle = '#f5c542'; rrect(ctx, -60, -70, 120, 70, 14); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(-60, -40, 120, 30); ctx.fillStyle = '#9fd3ff'; ctx.fillRect(-50, -64, 50, 24); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-35, 6, 14, 0, TAU); ctx.arc(35, 6, 14, 0, TAU); ctx.fill(); ctx.restore();
      // road
      ctx.fillStyle = '#4c4c52'; ctx.fillRect(0, 400, W, H - 400); ctx.fillStyle = '#d8d8d8'; for (let x = 0; x < W; x += 80) ctx.fillRect(x, 470, 44, 6);
      ctx.fillStyle = '#9d9d9d'; ctx.fillRect(0, 396, W, 10);
    } }
];

/* ============================================================ */
/*  Fighter                                                      */
/* ============================================================ */
const ATTACKS = {
  punch: { total: 300, a0: 70, a1: 180, dmg: 6, reach: 72, kb: 120, stun: 300 },
  kick:  { total: 520, a0: 140, a1: 290, dmg: 10, reach: 100, kb: 220, stun: 380 }
};
class Fighter {
  constructor(def, side) { this.def = def; this.side = side; this.wins = 0; this.resetRound(); }
  resetRound() {
    this.x = this.side === 0 ? 280 : W - 280; this.y = GROUND; this.vx = 0; this.vy = 0; this.facing = this.side === 0 ? 1 : -1;
    this.hp = 100; this.maxHp = 100; this.meter = 0; this.state = 'idle'; this.t = 0; this.hitDone = false; this.combo = 0; this.comboT = 0;
    this.spCool = 0; this.flashHit = 0; this.grounded = true; this.frozen = false; this.specialKind = this.def.special.kind; this.spinHits = 0; this.actTotal = 500;
    this.pendingKnock = false; this.bindT = 0;
  }
  get speed() { return 170 + this.def.stats.speed * 20; }
  get power() { return .75 + this.def.stats.power * .06; }
  get guard() { return 1.12 - this.def.stats.guard * .035; }
  canAct() { return ['idle', 'walk', 'jump', 'block'].includes(this.state); }
  busy() { return !this.canAct(); }
  setState(s, extra = {}) { this.state = s; this.t = 0; this.hitDone = false; Object.assign(this, extra); }

  update(dt, inp, opp, game) {
    const ms = dt * 1000; this.t += ms; this.spCool = Math.max(0, this.spCool - ms); this.flashHit = Math.max(0, this.flashHit - ms);
    if (this.comboT > 0) { this.comboT -= ms; if (this.comboT <= 0) this.combo = 0; }
    if (this.frozen) return;
    // face the opponent while not mid-attack
    if (this.canAct() || this.state === 'hit') this.facing = opp.x >= this.x ? 1 : -1;
    const s = this.state;
    // timed state transitions
    if (s === 'punch' && this.t > ATTACKS.punch.total) this.setState('idle');
    if (s === 'kick' && this.t > ATTACKS.kick.total) this.setState('idle');
    if (s === 'hit' && this.t > this.stunT) this.setState(this.pendingKnock ? 'down' : 'idle');
    if (s === 'down' && this.t > 900) this.setState('getup');
    if (s === 'getup' && this.t > 300) this.setState('idle');
    if (s === 'bound' && this.t > this.bindT) this.setState('idle');
    if (s === 'special') this.updateSpecial(opp, game);
    if (['idle', 'walk', 'jump', 'block'].includes(this.state) && game.phase === 'fight') {
      const blocking = inp.block && this.grounded;
      if (inp.super && this.meter >= 100 && this.grounded) { game.startSuper(this, opp); }
      else if (inp.special && this.spCool <= 0 && this.grounded) { this.startSpecial(opp, game); }
      else if (inp.punch && this.grounded) { this.setState('punch'); audio.sfx('punch'); }
      else if (inp.kick && this.grounded) { this.setState('kick'); audio.sfx('kick'); }
      else if (blocking) { if (this.state !== 'block') this.setState('block'); this.vx = 0; }
      else {
        if (this.state === 'block') this.setState('idle');
        let mv = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        if (this.grounded) { this.vx = mv * this.speed; if (mv !== 0 && this.state === 'idle') this.setState('walk'); if (mv === 0 && this.state === 'walk') this.setState('idle'); }
        else this.vx = lerp(this.vx, mv * this.speed * .9, .05);
        if (inp.jump && this.grounded) { this.vy = -640; this.grounded = false; this.setState('jump'); audio.sfx('whoosh'); }
      }
    } else if (this.state === 'hit' || this.state === 'block') { this.vx *= .85; }
    else if (!['special'].includes(this.state)) this.vx *= .8;
    // physics
    if (!this.grounded || this.state === 'jump') { this.vy += 1800 * dt; this.y += this.vy * dt; if (this.y >= GROUND) { this.y = GROUND; this.vy = 0; this.grounded = true; if (this.state === 'jump') this.setState('idle'); } }
    this.x += this.vx * dt; this.x = clamp(this.x, 40, W - 40);
    // body push
    const d = opp.x - this.x; if (Math.abs(d) < 46 && this.y === GROUND && opp.y === GROUND) { const push = (46 - Math.abs(d)) / 2 * (d > 0 ? -1 : 1); this.x = clamp(this.x + push, 40, W - 40); opp.x = clamp(opp.x - push, 40, W - 40); }
    // melee hit detection
    const atk = ATTACKS[this.state]; if (atk && this.t >= atk.a0 && this.t <= atk.a1 && !this.hitDone) {
      if (this.inReach(opp, atk.reach)) { this.hitDone = true; game.applyHit(this, opp, atk.dmg * this.power, { kb: atk.kb, stun: atk.stun, knockdown: this.state === 'kick' && this.combo >= 3 }); }
    }
  }
  inReach(opp, reach) { const dx = (opp.x - this.x) * this.facing; return dx > -10 && dx < reach + 20 && Math.abs(opp.y - this.y) < 110 && !['down', 'getup'].includes(opp.state); }
  startSpecial(opp, game) {
    const k = this.def.special.kind; this.specialKind = k; this.spCool = 1500; this.setState('special'); this.spinHits = 0; this.vx = 0;
    this.actTotal = { throw: 420, lob: 460, triple: 520, spin: 620, dash: 460, teleport: 520, shout: 480, bind: 460 }[k];
    audio.sfx('special'); game.banner(this.def.special.name, this.side === 0 ? '#f28c28' : '#3fb7ff', 700, true);
    this.spLaunched = false;
  }
  updateSpecial(opp, game) {
    const k = this.specialKind, t = this.t, tot = this.actTotal, prop = this.def.look.prop, c2 = this.def.look.col2, dmgM = this.power;
    const fire = t >= 180 && !this.spLaunched;
    if (fire) {
      this.spLaunched = true; const hx = this.x + this.facing * 34, hy = this.y - 110;
      switch (k) {
        case 'throw': game.projectiles.push(new Projectile(this, hx, hy, this.facing * 620, 0, 9 * dmgM, { kind: 'prop', prop, c2, kb: 160 })); break;
        case 'lob': game.projectiles.push(new Projectile(this, hx, hy - 10, this.facing * 360, -400, 14 * dmgM, { kind: 'prop', prop, c2, g: 1250, kb: 220, knockdown: true, scale: 1.3 })); break;
        case 'triple': [-1, 0, 1].forEach(i => game.projectiles.push(new Projectile(this, hx, hy + i * 10, this.facing * 560, i * 120, 4.5 * dmgM, { kind: 'star', c2, kb: 90 }))); break;
        case 'bind': game.projectiles.push(new Projectile(this, hx, hy, this.facing * 300, 0, 4 * dmgM, { kind: 'rope', c2, bind: 1100 })); break;
        case 'shout': game.fx.push({ kind: 'shout', x: hx, y: hy, dir: this.facing, t: 0, life: 320, c: c2 }); if (this.inReach(opp, 150)) game.applyHit(this, opp, 12 * dmgM, { kb: 320, stun: 380 }); game.shake(6); break;
        case 'teleport': game.fx.push({ kind: 'poof', x: this.x, y: this.y - 80, t: 0, life: 300, c: c2 }); break;
      }
    }
    if (k === 'dash') { if (t > 80 && t < 360) { this.vx = this.facing * 760; this.x = clamp(this.x + this.vx / 60, 40, W - 40); if (t % 50 < 17) game.fx.push({ kind: 'trail', x: this.x, y: this.y, t: 0, life: 220, c: c2, f: this }); if (!this.hitDone && this.inReach(opp, 60)) { this.hitDone = true; game.applyHit(this, opp, 13 * dmgM, { kb: 340, stun: 420, knockdown: true }); } } else this.vx = 0; }
    if (k === 'spin') { if (t > 80 && t < 560) { this.vx = this.facing * 160; this.x = clamp(this.x + this.vx / 60, 40, W - 40); const hitIdx = Math.floor((t - 80) / 160); if (hitIdx > this.spinHits - 1 && hitIdx < 3) { this.spinHits = hitIdx + 1; if (this.inReach(opp, 90)) game.applyHit(this, opp, 5 * dmgM, { kb: 60, stun: 260, chain: true }); game.fx.push({ kind: 'ring', x: this.x, y: this.y - 80, t: 0, life: 200, c: c2, r: 60 }); } } }
    if (k === 'teleport' && t >= 300 && !this.tpDone) { this.tpDone = true; this.x = clamp(opp.x - opp.facing * 70, 40, W - 40); this.facing = opp.x >= this.x ? 1 : -1; game.fx.push({ kind: 'poof', x: this.x, y: this.y - 80, t: 0, life: 300, c: c2 }); if (this.inReach(opp, 110)) game.applyHit(this, opp, 14 * dmgM, { kb: 260, stun: 400, knockdown: true }); }
    if (t >= tot) { this.tpDone = false; this.setState('idle'); }
  }
  draw(ctx, t) { drawFighter(ctx, this, t); }
}

class Projectile {
  constructor(owner, x, y, vx, vy, dmg, o) { Object.assign(this, { owner, x, y, vx, vy, dmg, kind: o.kind, prop: o.prop, c2: o.c2, g: o.g || 0, kb: o.kb || 120, knockdown: !!o.knockdown, bind: o.bind || 0, scale: o.scale || 1, t: 0, dead: false, rot: 0 }); }
  update(dt, game) {
    this.t += dt * 1000; this.vy += this.g * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.rot += dt * 12 * Math.sign(this.vx);
    if (this.x < -60 || this.x > W + 60 || this.y > GROUND + 10) { if (this.y > GROUND + 10) game.fx.push({ kind: 'ring', x: this.x, y: GROUND, t: 0, life: 200, c: this.c2, r: 30 }); this.dead = true; return; }
    const opp = game.fighters[1 - this.owner.side];
    if (Math.abs(opp.x - this.x) < 34 && this.y > opp.y - 160 && this.y < opp.y + 10 && !['down', 'getup'].includes(opp.state)) {
      this.dead = true;
      if (this.bind) game.applyHit(this.owner, opp, this.dmg, { kb: 40, stun: 200, bind: this.bind }); else game.applyHit(this.owner, opp, this.dmg, { kb: this.kb, stun: 360, knockdown: this.knockdown });
    }
  }
  draw(ctx) {
    if (this.kind === 'prop') drawProp(ctx, this.prop, this.c2, this.x, this.y, this.rot, this.scale);
    else if (this.kind === 'star') { ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot); ctx.fillStyle = this.c2; ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 12, a = i / 10 * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.restore(); }
    else if (this.kind === 'rope') { ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot * .5); ctx.strokeStyle = this.c2; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.stroke(); ctx.restore(); }
  }
}

/* ============================================================ */
/*  CPU opponent                                                 */
/* ============================================================ */
const AI_LEVELS = [
  { react: 420, aggro: .35, block: .15, special: .25, super: .4, idle: .35 },
  { react: 260, aggro: .55, block: .4, special: .45, super: .7, idle: .2 },
  { react: 140, aggro: .75, block: .65, special: .6, super: .95, idle: .08 }
];
function cpuIntent(me, opp, game, dt) {
  const L = AI_LEVELS[game.difficulty]; me.ai = me.ai || { t: 0, plan: {}, until: 0 }; const ai = me.ai; ai.t += dt * 1000;
  const blank = { left: false, right: false, jump: false, block: false, punch: false, kick: false, special: false, super: false };
  if (ai.t < ai.until) return { ...blank, ...ai.plan, punch: false, kick: false, special: false, super: false, jump: false }; // held movement/block only
  ai.t = 0; ai.until = L.react * rnd(.6, 1.4); const plan = { ...blank }; const dist = Math.abs(opp.x - me.x), toward = opp.x > me.x ? 'right' : 'left', away = toward === 'right' ? 'left' : 'right';
  const oppAttacking = ['punch', 'kick', 'special'].includes(opp.state); const r = Math.random();
  const incoming = game.projectiles.some(p => p.owner !== me && Math.sign(p.vx) === Math.sign(me.x - p.x) && Math.abs(p.x - me.x) < 260);
  if (me.meter >= 100 && r < L.super && dist < 400) plan.super = true;
  else if ((oppAttacking && dist < 150 || incoming) && r < L.block) { plan.block = true; ai.until = 360; }
  else if (incoming && r < .5) { plan.jump = true; plan[toward] = true; }
  else if (dist > 230) { if (r < L.special && me.spCool <= 0) plan.special = true; else if (r < L.idle) { /* wait */ } else { plan[toward] = true; if (Math.random() < .15) plan.jump = true; } }
  else if (dist > 120) { if (r < L.aggro) plan[toward] = true; else if (r < L.aggro + .2 && me.spCool <= 0) plan.special = true; else if (r < L.aggro + .35) plan.kick = true; else plan[away] = true; }
  else { if (r < L.aggro * .6) plan.punch = true; else if (r < L.aggro) plan.kick = true; else if (r < L.aggro + .15 && me.spCool <= 0) plan.special = true; else if (r < L.aggro + .3) { plan.block = true; ai.until = 300; } else { plan[away] = true; ai.until = 250; } }
  ai.plan = plan; return plan;
}

/* ============================================================ */
/*  Game                                                         */
/* ============================================================ */
const canvas = $('#game'), ctx = canvas.getContext('2d');
const keys = new Set(), pressed = new Set();
const P1 = { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], block: ['KeyS'], punch: ['KeyJ'], kick: ['KeyK'], special: ['KeyL'], super: ['KeyI', 'KeyU'] };
const P2 = { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], block: ['ArrowDown'], punch: ['Comma', 'Numpad1'], kick: ['Period', 'Numpad2'], special: ['Slash', 'Numpad3'], super: ['Quote', 'Numpad0'] };
const readInput = map => ({
  left: map.left.some(k => keys.has(k)), right: map.right.some(k => keys.has(k)), block: map.block.some(k => keys.has(k)),
  jump: map.jump.some(k => pressed.has(k)), punch: map.punch.some(k => pressed.has(k)), kick: map.kick.some(k => pressed.has(k)),
  special: map.special.some(k => pressed.has(k)), super: map.super.some(k => pressed.has(k))
});

const game = {
  screen: 'title', mode: 'cpu', difficulty: 1, stageIdx: 0, phase: 'idle', phaseT: 0, round: 1, timer: ROUND_TIME,
  fighters: [], projectiles: [], fx: [], banners: [], shakeT: 0, shakeA: 0, flash: 0, paused: false, cine: null, picks: [null, null], picker: 0, cursor: 0, winner: -1,
  tally: store.get('dd-tally', { w: 0, l: 0 }),
  startMatch() {
    this.fighters = [new Fighter(this.picks[0], 0), new Fighter(this.picks[1], 1)]; this.round = 1; this.winner = -1;
    const s = +$('#opt-stage').value; this.stageIdx = s >= 0 ? s : Math.floor(Math.random() * STAGES.length); this.difficulty = +$('#opt-diff').value;
    this.startRound();
  },
  startRound() { this.fighters.forEach(f => f.resetRound()); this.projectiles = []; this.fx = []; this.banners = []; this.cine = null; this.timer = ROUND_TIME; this.phase = 'intro'; this.phaseT = 0; audio.sfx('round'); },
  banner(text, color, life = 900, small = false) { this.banners.push({ text, color, t: 0, life, small }); },
  shake(a) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = 220; },
  applyHit(att, def, dmg, o = {}) {
    if (def.state === 'ko' || def.frozen && !o.cine) return;
    const chainOk = def.state === 'hit' || def.state === 'bound';
    if (def.state === 'block' && !o.unblockable) {
      def.hp -= dmg * .2 * def.guard; def.vx = att.facing * (o.kb || 120) * .6; def.meter = Math.min(100, def.meter + dmg * .4); att.meter = Math.min(100, att.meter + dmg * .5);
      this.fx.push({ kind: 'spark', x: def.x + def.facing * 20, y: def.y - 100, t: 0, life: 180, c: '#9fd3ff', block: true }); audio.sfx('block'); def.flashHit = 0;
      if (def.hp <= 0) this.knockout(def); return;
    }
    att.combo = chainOk ? att.combo + 1 : 1; att.comboT = 1200;
    const scale = Math.max(.45, 1 - Math.max(0, att.combo - 2) * .12); const real = Math.round(dmg * scale * def.guard * 10) / 10;
    def.hp -= real; att.meter = Math.min(100, att.meter + real * 1.3); def.meter = Math.min(100, def.meter + real * .9);
    def.vx = att.facing * (o.kb || 120); def.flashHit = 90; def.frozenHit = false;
    if (o.bind) def.setState('bound', { bindT: o.bind, vx: 0 }); else def.setState('hit', { stunT: o.stun || 320, pendingKnock: !!o.knockdown });
    if (!def.grounded) def.vy = -200;
    this.fx.push({ kind: 'spark', x: def.x + def.facing * 18, y: def.y - 105 + rnd(-15, 15), t: 0, life: 220, c: o.cine ? '#ffd166' : '#fff' });
    this.fx.push({ kind: 'num', x: def.x, y: def.y - 170, t: 0, life: 700, text: String(Math.round(real)), c: o.cine ? '#ffd166' : (att.side === 0 ? '#f28c28' : '#3fb7ff') });
    this.shake(o.cine ? 8 : (real > 9 ? 5 : 2)); audio.sfx('hit'); if (att.combo >= 2) audio.sfx('tick');
    if (def.hp <= 0) this.knockout(def);
  },
  knockout(def) { def.hp = 0; def.setState('ko'); this.fighters.forEach(f => f.frozen = false); const w = this.fighters[1 - def.side]; w.wins++; this.phase = 'ko'; this.phaseT = 0; this.cine = null; this.banner('K.O.', '#ef4e4e', 1800); audio.sfx('ko'); this.shake(14); this.flash = 1; },
  startSuper(att, def) {
    const S = SUPERS[att.def.sup.kind]; att.meter = 0; att.setState('super'); att.vx = 0; def.frozen = true; att.frozen = true;
    const total = 24 + att.def.stats.power * 1.4, dist = Math.abs(def.x - att.x), connects = dist <= S.range;
    const hits = []; for (let i = 0; i < S.hits; i++) hits.push(650 + i * (700 / S.hits));
    this.cine = { att, def, kind: att.def.sup.kind, t: 0, hits, dmgEach: total / S.hits, connects, knockdown: !!S.knockdown, end: 1750, lastHit: 1400, startX: att.x, items: [] };
    audio.sfx('super'); this.banner(att.def.sup.name, '#ffd166', 1200); this.flash = .6; this.shake(6);
  },
  updateCine(dt) {
    const c = this.cine; c.t += dt * 1000; const { att, def, kind } = c;
    while (c.hits.length && c.t >= c.hits[0]) {
      c.hits.shift(); const last = c.hits.length === 0;
      if (kind === 'storm') { att.x = clamp(def.x + (Math.random() < .5 ? -1 : 1) * 60, 40, W - 40); att.facing = def.x >= att.x ? 1 : -1; this.fx.push({ kind: 'poof', x: att.x, y: att.y - 80, t: 0, life: 250, c: att.def.look.col2 }); }
      if (kind === 'charge') { att.x = clamp(def.x - att.facing * 50, 40, W - 40); for (let i = 0; i < 5; i++) this.fx.push({ kind: 'trail', x: lerp(c.startX, att.x, i / 5), y: att.y, t: 0, life: 300, c: att.def.look.col2, f: att }); }
      if (kind === 'slam') { att.x = clamp(def.x - att.facing * 40, 40, W - 40); this.fx.push({ kind: 'ring', x: att.x, y: GROUND, t: 0, life: 400, c: '#ffd166', r: 180 }); this.shake(18); }
      if (kind === 'quake') { this.fx.push({ kind: 'crack', x: def.x, t: 0, life: 900 }); this.shake(14); }
      if (kind === 'wave') this.fx.push({ kind: 'ring', x: att.x, y: att.y - 80, t: 0, life: 500, c: att.def.look.col2, r: 700 });
      if (kind === 'rain') for (let i = 0; i < 4; i++) c.items.push({ x: def.x + rnd(-120, 120), y: -40 - i * 60, vy: rnd(700, 1000), prop: att.def.look.prop, rot: rnd(0, TAU) });
      if (kind === 'spotlight') this.fx.push({ kind: 'beam', x: def.x, t: 0, life: 350 });
      if (kind === 'stampede') for (let i = 0; i < 2; i++) c.items.push({ runner: true, x: att.facing > 0 ? -60 - i * 90 : W + 60 + i * 90, vx: att.facing * 900, look: pick(ROSTER).look });
      if (c.connects) { def.frozen = false; this.applyHit(att, def, c.dmgEach, { kb: last ? 260 : 40, stun: last ? 500 : 600, knockdown: last && c.knockdown, unblockable: true, cine: true }); if (!last) def.frozen = true; }
      else if (c.hits.length === 0) this.banner('MISSED!', '#9fd3ff', 700, true);
    }
    for (const it of c.items) { if (it.runner) it.x += it.vx * dt; else { it.y += it.vy * dt; it.rot += dt * 6; } }
    if (c.t >= c.end) { att.frozen = false; def.frozen = false; att.setState('idle'); if (def.state !== 'hit' && def.state !== 'down' && def.state !== 'ko') def.setState('idle'); this.cine = null; }
  },
  update(dt) {
    const t = performance.now();
    this.phaseT += dt * 1000; this.banners.forEach(b => b.t += dt * 1000); this.banners = this.banners.filter(b => b.t < b.life);
    if (this.shakeT > 0) { this.shakeT -= dt * 1000; if (this.shakeT <= 0) this.shakeA = 0; } this.flash = Math.max(0, this.flash - dt * 2.5);
    this.fx.forEach(e => e.t += dt * 1000); this.fx = this.fx.filter(e => e.t < e.life);
    if (this.screen !== 'fight' || this.paused) return;
    const [a, b] = this.fighters;
    if (this.phase === 'intro') { if (this.phaseT > 1500) { this.phase = 'fight'; this.phaseT = 0; audio.sfx('round'); } }
    if (this.phase === 'fight') {
      if (this.cine) this.updateCine(dt); else { this.timer -= dt; if (this.timer <= 0) { this.timer = 0; this.timeUp(); } }
      const i1 = this.cine ? {} : readInput(P1), i2 = this.cine ? {} : (this.mode === '2p' ? readInput(P2) : cpuIntent(b, a, this, dt));
      a.update(dt, i1, b, this); b.update(dt, i2, a, this);
      for (const p of this.projectiles) p.update(dt, this); this.projectiles = this.projectiles.filter(p => !p.dead);
    } else if (this.phase === 'ko') {
      a.update(dt, {}, b, this); b.update(dt, {}, a, this);
      const alive = this.fighters.find(f => f.state !== 'ko' && f.hp > 0); if (alive && this.phaseT > 600 && alive.state !== 'win') alive.setState('win');
      if (this.phaseT > 2200) { const w = this.fighters.find(f => f.wins >= ROUNDS_TO_WIN); if (w) this.finish(w); else { this.round++; this.startRound(); } }
    }
  },
  timeUp() { const [a, b] = this.fighters; const loser = a.hp === b.hp ? (Math.random() < .5 ? a : b) : (a.hp < b.hp ? a : b); loser.setState('ko'); this.fighters[1 - loser.side].wins++; this.phase = 'ko'; this.phaseT = 0; this.cine = null; this.fighters.forEach(f => f.frozen = false); this.banner('TIME UP', '#ffd166', 1800); audio.sfx('ko'); },
  finish(w) {
    this.winner = w.side; this.screen = 'result'; audio.sfx('win');
    if (this.mode === 'cpu') { if (w.side === 0) this.tally.w++; else this.tally.l++; store.set('dd-tally', this.tally); }
    $('#res-title').textContent = this.mode === '2p' ? `PLAYER ${w.side + 1} WINS` : (w.side === 0 ? 'YOU WIN' : 'CPU WINS'); $('#res-title').style.color = w.side === 0 ? '#f28c28' : '#3fb7ff';
    $('#res-name').textContent = w.def.name + (w.def.title ? ' · ' + w.def.title : ''); $('#res-line').textContent = w.def.win ? `“${w.def.win}”` : '';
    $('#res-tally').textContent = this.mode === 'cpu' ? `Your record vs CPU: ${this.tally.w}W – ${this.tally.l}L` : `${this.fighters[0].def.name} ${this.fighters[0].wins} – ${this.fighters[1].wins} ${this.fighters[1].def.name}`;
    showScreen('result');
  },

  /* ---------------- drawing ---------------- */
  draw() {
    const t = performance.now(); ctx.save();
    const dpr = canvas.width / W; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.shakeA > 0) ctx.translate(rnd(-this.shakeA, this.shakeA), rnd(-this.shakeA, this.shakeA));
    STAGES[this.stageIdx].draw(ctx, t);
    if (this.screen === 'fight' || this.screen === 'result') {
      const c = this.cine;
      if (c) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(-20, -20, W + 40, H + 40); this.drawCineBack(c); }
      const order = c ? [c.def, c.att] : [...this.fighters].sort((x, y) => (x.state === 'hit' ? 1 : 0) - (y.state === 'hit' ? 1 : 0));
      for (const e of this.fx) if (e.kind === 'trail') { ctx.save(); ctx.globalAlpha = .35 * (1 - e.t / e.life); drawFighter(ctx, { ...e.f, x: e.x, y: e.y, state: 'special', t: 200 }, t, { flat: true, noShadow: true, noProp: true }); ctx.restore(); }
      for (const f of order) f.draw(ctx, t);
      for (const p of this.projectiles) p.draw(ctx);
      if (c) this.drawCineFront(c);
      this.drawFx(t); this.drawHud(t);
    }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * .8})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    for (const b of this.banners) { const p = b.t / b.life, a = p < .1 ? p / .1 : (p > .8 ? (1 - p) / .2 : 1), sc = b.small ? .5 : 1; ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, b.small ? 150 : H / 2 - 20); ctx.scale(sc * (1 + (1 - a) * .3), sc * (1 + (1 - a) * .3)); ctx.font = '64px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(b.text, 0, 0); ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0); ctx.restore(); }
    if (this.screen === 'fight' && this.phase === 'intro') { const txt = this.phaseT < 900 ? `ROUND ${this.round}` : 'FIGHT!'; ctx.save(); ctx.font = '72px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, W / 2, H / 2 - 20); ctx.fillStyle = this.phaseT < 900 ? '#fff' : '#f28c28'; ctx.fillText(txt, W / 2, H / 2 - 20); ctx.restore(); }
    if (this.paused) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H); ctx.font = '56px Bungee, Impact, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PAUSED', W / 2, H / 2 - 20); ctx.font = '18px Rubik, sans-serif'; ctx.fillStyle = '#b3a8cf'; ctx.fillText('Esc / P to resume · Backspace to quit', W / 2, H / 2 + 30); }
    ctx.restore();
  },
  drawCineBack(c) {
    const { att, kind, t } = c; const col = att.def.look.col2;
    if (kind === 'spotlight') { for (const e of this.fx) if (e.kind === 'beam') { const a = 1 - e.t / e.life; ctx.fillStyle = `rgba(255,230,120,${.55 * a})`; ctx.beginPath(); ctx.moveTo(e.x - 20, -20); ctx.lineTo(e.x + 20, -20); ctx.lineTo(e.x + 110, GROUND); ctx.lineTo(e.x - 110, GROUND); ctx.closePath(); ctx.fill(); } }
    if (kind === 'stampede') for (const it of c.items) if (it.runner) drawFighter(ctx, { def: { look: it.look }, x: it.x, y: GROUND, facing: Math.sign(it.vx), state: 'walk', t, vx: it.vx, flashHit: 0 }, performance.now(), { flat: true, noProp: true });
    if (t < 600) { ctx.fillStyle = `rgba(255,209,102,${.12 + .1 * Math.sin(t * .03)})`; ctx.fillRect(0, 0, W, H); }
    void col;
  },
  drawCineFront(c) {
    const { kind, att } = c;
    if (kind === 'rain') for (const it of c.items) if (!it.runner && it.y < GROUND + 20) drawProp(ctx, it.prop, att.def.look.col2, it.x, it.y, it.rot, 1.6);
    for (const e of this.fx) if (e.kind === 'crack') { const a = 1 - e.t / e.life; ctx.strokeStyle = `rgba(20,10,10,${a})`; ctx.lineWidth = 4; ctx.beginPath(); for (let i = -4; i <= 4; i++) { ctx.moveTo(e.x, GROUND); ctx.lineTo(e.x + i * 50 + rnd(-6, 6), GROUND + 30 + Math.abs(i) * 12); } ctx.stroke(); }
  },
  drawFx(t) {
    for (const e of this.fx) {
      const p = e.t / e.life, a = 1 - p;
      if (e.kind === 'spark') { ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(p * 2); ctx.fillStyle = e.c; ctx.globalAlpha = a; const r = e.block ? 18 : 26 + p * 20; ctx.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * .35 : r, an = i / 8 * TAU; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); ctx.restore(); }
      else if (e.kind === 'num') { ctx.save(); ctx.globalAlpha = a; ctx.font = '26px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText(e.text, e.x, e.y - p * 40); ctx.fillStyle = e.c; ctx.fillText(e.text, e.x, e.y - p * 40); ctx.restore(); }
      else if (e.kind === 'ring') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = e.c; ctx.lineWidth = 6 * a + 1; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * p + 10, (e.r * p + 10) * (e.y >= GROUND ? .3 : 1), 0, 0, TAU); ctx.stroke(); ctx.restore(); }
      else if (e.kind === 'poof') { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = e.c; for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; ctx.beginPath(); ctx.arc(e.x + Math.cos(an) * 40 * p, e.y + Math.sin(an) * 40 * p, 10 * a, 0, TAU); ctx.fill(); } ctx.restore(); }
      else if (e.kind === 'shout') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = e.c; ctx.lineWidth = 5; const base = e.dir < 0 ? Math.PI : 0; for (let i = 0; i < 3; i++) { const r = 20 + i * 25 + p * 60; ctx.beginPath(); ctx.arc(e.x, e.y, r, base - .6, base + .6); ctx.stroke(); } ctx.restore(); }
    }
  },
  drawHud(t) {
    const [a, b] = this.fighters; ctx.save(); ctx.textBaseline = 'alphabetic';
    const bar = (f, right) => {
      const x = right ? W - 40 - 380 : 40, y = 26, w = 380, h = 22; ctx.fillStyle = 'rgba(0,0,0,.6)'; rrect(ctx, x - 3, y - 3, w + 6, h + 6, 6); ctx.fill();
      ctx.fillStyle = '#3b1d1d'; ctx.fillRect(x, y, w, h); const hp = clamp(f.hp / f.maxHp, 0, 1), ww = w * hp; const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, hp > .35 ? '#4fe08a' : '#ff6b6b'); g.addColorStop(1, hp > .35 ? '#1d9a55' : '#c0392b'); ctx.fillStyle = g; ctx.fillRect(right ? x + w - ww : x, y, ww, h);
      // meter
      const my = y + h + 8, mh = 8; ctx.fillStyle = 'rgba(0,0,0,.6)'; rrect(ctx, x - 3, my - 2, w * .7 + 6, mh + 4, 4); ctx.fill(); ctx.fillStyle = '#2a2340'; ctx.fillRect(right ? x + w * .3 : x, my, w * .7, mh); const mw = w * .7 * (f.meter / 100); ctx.fillStyle = f.meter >= 100 ? (Math.sin(t * .02) > 0 ? '#fff6c2' : '#ffd166') : '#f5c542'; ctx.fillRect(right ? x + w - mw : x, my, mw, mh);
      // name & round pips
      ctx.font = '15px Bungee, Impact, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = right ? 'right' : 'left'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; const nx = right ? x + w : x; ctx.strokeText(f.def.name.toUpperCase(), nx, y + h + 34); ctx.fillText(f.def.name.toUpperCase(), nx, y + h + 34);
      for (let i = 0; i < ROUNDS_TO_WIN; i++) { ctx.fillStyle = i < f.wins ? '#ffd166' : 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(right ? x + w * .3 - 14 - i * 20 : x + w * .7 + 14 + i * 20, my + 4, 6, 0, TAU); ctx.fill(); }
      if (f.meter >= 100) { ctx.font = '11px Bungee, Impact, sans-serif'; ctx.fillStyle = '#ffd166'; ctx.textAlign = right ? 'left' : 'right'; ctx.fillText('SUPER READY', right ? x + w * .3 - 70 : x + w * .7 + 70, my + 8); }
    };
    bar(a, false); bar(b, true);
    // timer
    ctx.fillStyle = 'rgba(0,0,0,.65)'; rrect(ctx, W / 2 - 42, 14, 84, 46, 8); ctx.fill(); ctx.font = '30px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = this.timer < 10 ? '#ff6b6b' : '#fff'; ctx.fillText(String(Math.ceil(this.timer)).padStart(2, '0'), W / 2, 50);
    // combo
    for (const f of this.fighters) if (f.combo >= 2 && f.comboT > 0) { const right = f.side === 1; ctx.save(); ctx.globalAlpha = clamp(f.comboT / 400, 0, 1); ctx.font = '30px Bungee, Impact, sans-serif'; ctx.textAlign = right ? 'right' : 'left'; ctx.lineWidth = 6; ctx.strokeStyle = '#000'; const txt = `${f.combo} HIT COMBO`; ctx.strokeText(txt, right ? W - 40 : 40, 140); ctx.fillStyle = right ? '#3fb7ff' : '#f28c28'; ctx.fillText(txt, right ? W - 40 : 40, 140); ctx.restore(); }
    ctx.restore();
  }
};

/* ============================================================ */
/*  Screens / UI                                                 */
/* ============================================================ */
const screens = { title: $('#scr-title'), select: $('#scr-select'), result: $('#scr-result') };
function showScreen(name) { for (const k in screens) screens[k].hidden = k !== name; if (name) game.screen = name; }
function goTitle() { game.screen = 'title'; game.paused = false; showScreen('title'); }
function openSelect(mode) {
  if (ROSTER.length < 1) return; game.mode = mode; game.picks = [null, null]; game.picker = 0; game.cursor = 0; game.screen = 'select';
  $('#lbl-diff').hidden = mode !== 'cpu'; buildSelectGrid(); updateSelectHead(); showScreen('select');
}
function updateSelectHead() {
  const who = $('#sel-who'); const p = game.picker; who.className = 'who ' + (p === 0 ? 'p1c' : 'p2c');
  who.textContent = p === 0 ? 'PLAYER 1 — PICK YOUR DOST' : (game.mode === 'cpu' ? 'PICK YOUR RIVAL (CPU)' : 'PLAYER 2 — PICK YOUR DOST');
  document.querySelectorAll('#select-grid .pick').forEach((el, i) => { el.classList.toggle('p1', game.picks[0] === ROSTER[i]); el.classList.toggle('p2', game.picks[1] === ROSTER[i]); el.classList.toggle('cur', i === game.cursor); el.querySelector('.t1').hidden = game.picks[0] !== ROSTER[i]; el.querySelector('.t2').hidden = game.picks[1] !== ROSTER[i]; el.style.outline = i === game.cursor ? `2px dashed ${p === 0 ? '#f28c28' : '#3fb7ff'}` : ''; });
  showBio(ROSTER[game.cursor]);
}
function showBio(def) { if (!def) return; $('#sel-bio').innerHTML = `<b>${esc(def.name)}</b>${def.title ? ' · ' + esc(def.title) : ''} — ${def.quote ? '“' + esc(def.quote) + '”' : ''} <br>Special: <b>${esc(def.special.name)}</b> (${SPECIALS[def.special.kind].label.toLowerCase()}) · Super: <b>${esc(def.sup.name)}</b>`; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function buildSelectGrid() {
  const grid = $('#select-grid'); grid.innerHTML = ''; grid.style.gridTemplateColumns = `repeat(${Math.min(4, Math.max(2, ROSTER.length))}, minmax(0, 1fr))`;
  ROSTER.forEach((def, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pick'; b.setAttribute('role', 'option'); b.innerHTML = `<span class="tag t1" hidden>P1</span><span class="tag t2" hidden>${game.mode === 'cpu' ? 'CPU' : 'P2'}</span><canvas width="86" height="86"></canvas><span class="nm">${esc(def.name)}</span>`;
    drawPortrait(b.querySelector('canvas').getContext('2d'), def, 86);
    b.addEventListener('mouseenter', () => { game.cursor = i; updateSelectHead(); });
    b.addEventListener('click', () => { game.cursor = i; confirmPick(); });
    grid.appendChild(b);
  });
}
function confirmPick() {
  audio.init(); audio.sfx('ui'); game.picks[game.picker] = ROSTER[game.cursor];
  if (game.picker === 0) { game.picker = 1; game.cursor = (game.cursor + 1) % ROSTER.length; updateSelectHead(); }
  else { showScreen(null); game.screen = 'fight'; game.startMatch(); }
}
$('#btn-vs-cpu').addEventListener('click', () => { audio.init(); audio.sfx('ui'); openSelect('cpu'); });
$('#btn-vs-2p').addEventListener('click', () => { audio.init(); audio.sfx('ui'); openSelect('2p'); });
$('#scr-title').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('.title-art, .sub, .blink')) { audio.init(); openSelect('cpu'); } });
$('#btn-random').addEventListener('click', () => { game.cursor = Math.floor(Math.random() * ROSTER.length); confirmPick(); });
$('#btn-back-title').addEventListener('click', goTitle);
$('#btn-rematch').addEventListener('click', () => { showScreen(null); game.screen = 'fight'; game.startMatch(); });
$('#btn-reselect').addEventListener('click', () => openSelect(game.mode));
$('#btn-home').addEventListener('click', goTitle);
$('#btn-sound').addEventListener('click', e => { audio.on = !audio.on; store.set('dd-sound', audio.on); e.currentTarget.textContent = audio.on ? '🔊 Sound on' : '🔇 Sound off'; e.currentTarget.setAttribute('aria-pressed', String(audio.on)); audio.init(); audio.sfx('ui'); });
$('#btn-sound').textContent = audio.on ? '🔊 Sound on' : '🔇 Sound off';

/* keyboard */
const GAME_KEYS = new Set([...Object.values(P1).flat(), ...Object.values(P2).flat(), 'Space', 'Enter', 'Escape', 'KeyP', 'Backspace']);
window.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  const inArena = game.screen !== 'title' || isArenaVisible();
  if (GAME_KEYS.has(e.code) && inArena) e.preventDefault();
  if (e.repeat) return; keys.add(e.code); pressed.add(e.code);
  if (game.screen === 'title' && e.code === 'Enter' && inArena) { audio.init(); openSelect('cpu'); }
  if (game.screen === 'select') {
    const map = game.picker === 0 ? P1 : P2, cols = Math.min(4, Math.max(2, ROSTER.length)); let c = game.cursor;
    if (map.left.includes(e.code)) c--; if (map.right.includes(e.code)) c++; if (map.jump.includes(e.code)) c -= cols; if (map.block.includes(e.code)) c += cols;
    if (c !== game.cursor) { game.cursor = (c + ROSTER.length) % ROSTER.length; audio.sfx('tick'); updateSelectHead(); }
    if (map.punch.includes(e.code) || e.code === 'Enter') confirmPick();
    if (e.code === 'Escape') goTitle();
  }
  if (game.screen === 'fight') {
    if (e.code === 'Escape' || e.code === 'KeyP') { game.paused = !game.paused; audio.sfx('ui'); }
    if (game.paused && e.code === 'Backspace') goTitle();
  }
  if (game.screen === 'result' && e.code === 'Enter') { showScreen(null); game.screen = 'fight'; game.startMatch(); }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
function isArenaVisible() { const r = $('#arena').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }

/* touch pad */
const touchEl = $('#touch'); const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
let touchOn = store.get('dd-touch', coarse);
function setTouch(on) { touchOn = on; touchEl.classList.toggle('show', on); touchEl.setAttribute('aria-hidden', String(!on)); $('#btn-touch').setAttribute('aria-pressed', String(on)); store.set('dd-touch', on); }
setTouch(touchOn); $('#btn-touch').addEventListener('click', () => setTouch(!touchOn));
touchEl.querySelectorAll('.tbtn').forEach(b => {
  const k = b.dataset.k; const down = e => { e.preventDefault(); audio.init(); if (!keys.has(k)) pressed.add(k); keys.add(k); b.classList.add('on'); }; const up = e => { e.preventDefault(); keys.delete(k); b.classList.remove('on'); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); b.addEventListener('contextmenu', e => e.preventDefault());
});

/* ============================================================ */
/*  Fighter Studio (editor)                                      */
/* ============================================================ */
const ed = { editingId: null, pose: 0, poses: ['idle', 'punch', 'kick', 'block', 'win', 'super'], t: 0 };
const fill = (sel, items) => { const el = $(sel); el.innerHTML = items.map(([v, l]) => `<option value="${v}">${l}</option>`).join(''); };
fill('#ed-skin', SKINS.map(s => [s.id, s.label])); fill('#ed-hair', HAIRS); fill('#ed-face', FACES); fill('#ed-outfit', OUTFITS); fill('#ed-prop', PROPS);
fill('#ed-spkind', Object.entries(SPECIALS).map(([k, v]) => [k, v.label])); fill('#ed-sukind', Object.entries(SUPERS).map(([k, v]) => [k, v.label]));
const F = id => $('#ed-' + id);
function formToDef() {
  return sanitizeFighter({ id: ed.editingId || undefined, name: F('name').value.trim(), title: F('title').value.trim(), quote: F('quote').value.trim(), win: F('win').value.trim(),
    look: { skin: F('skin').value, hair: F('hair').value, hairCol: F('haircol').value, face: F('face').value, glasses: F('glasses').value, outfit: F('outfit').value, col1: F('col1').value, col2: F('col2').value, prop: F('prop').value },
    stats: { power: +F('power').value, speed: +F('speed').value, guard: +F('guard').value },
    special: { kind: F('spkind').value, name: F('spname').value.trim() }, sup: { kind: F('sukind').value, name: F('suname').value.trim() } }, ROSTER.length);
}
function defToForm(d) {
  F('name').value = d.name; F('title').value = d.title; F('quote').value = d.quote; F('win').value = d.win; F('skin').value = d.look.skin; F('hair').value = d.look.hair; F('haircol').value = d.look.hairCol; F('face').value = d.look.face; F('glasses').value = d.look.glasses; F('outfit').value = d.look.outfit; F('col1').value = d.look.col1; F('col2').value = d.look.col2; F('prop').value = d.look.prop;
  F('power').value = d.stats.power; F('speed').value = d.stats.speed; F('guard').value = d.stats.guard; F('spkind').value = d.special.kind; F('spname').value = d.special.name; F('sukind').value = d.sup.kind; F('suname').value = d.sup.name; refreshStats();
}
function refreshStats() {
  ['power', 'speed', 'guard'].forEach(k => $('#o-' + k).textContent = F(k).value);
  const sum = +F('power').value + +F('speed').value + +F('guard').value; const b = $('#ed-budget'); b.textContent = `${sum} / ${STAT_BUDGET} points`; b.classList.toggle('over', sum > STAT_BUDGET); return sum <= STAT_BUDGET;
}
function msg(el, text, err = false) { el.textContent = text; el.classList.toggle('err', err); clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; }, 3500); }
function newFighter() { ed.editingId = null; F('delete').hidden = true; defToForm(sanitizeFighter({ name: '', look: { col1: pick(['#3a7bd5', '#e04f5f', '#2fb879', '#8e44ad', '#f28c28']), col2: pick(['#f5c542', '#fff', '#38e38b', '#3fb7ff']) }, special: { name: '' }, sup: { name: '' } }, ROSTER.length)); F('name').value = ''; F('spname').value = ''; F('suname').value = ''; $('#ed-preview-name').textContent = 'New fighter'; }
function editFighter(id) { const d = ROSTER.find(f => f.id === id); if (!d) return; ed.editingId = id; F('delete').hidden = false; defToForm(d); $('#ed-preview-name').textContent = d.name; $('#studio').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
$('#ed-form').addEventListener('submit', e => {
  e.preventDefault(); const m = $('#ed-msg');
  if (!F('name').value.trim()) return msg(m, 'Give your fighter a name.', true);
  if (!refreshStats()) return msg(m, `Stats over budget. Keep the total at ${STAT_BUDGET} or less.`, true);
  const def = formToDef(); const idx = ROSTER.findIndex(f => f.id === def.id);
  if (idx >= 0) ROSTER[idx] = def; else { if (ROSTER.length >= MAX_FIGHTERS) return msg(m, `Roster is full (${MAX_FIGHTERS}). Delete one first.`, true); ROSTER.push(def); }
  saveRoster(); renderRoster(); ed.editingId = def.id; F('delete').hidden = false; msg(m, `Saved ${def.name}. They are in the roster now.`); audio.init(); audio.sfx('win');
});
F('new').addEventListener('click', newFighter);
F('delete').addEventListener('click', () => {
  const d = ROSTER.find(f => f.id === ed.editingId); if (!d) return;
  if (F('delete').dataset.arm !== '1') { F('delete').dataset.arm = '1'; F('delete').textContent = 'Really delete?'; setTimeout(() => { F('delete').dataset.arm = ''; F('delete').textContent = 'Delete'; }, 2500); return; }
  ROSTER = ROSTER.filter(f => f.id !== d.id); saveRoster(); renderRoster(); F('delete').dataset.arm = ''; F('delete').textContent = 'Delete'; newFighter(); msg($('#ed-msg'), `Deleted ${d.name}.`);
});
F('pose').addEventListener('click', () => { ed.pose = (ed.pose + 1) % ed.poses.length; });
F('randomise').addEventListener('click', () => {
  F('skin').value = pick(SKINS).id; F('hair').value = pick(HAIRS)[0]; F('haircol').value = pick(['#1b1b1b', '#3a2412', '#6b3a1f', '#b55a2b', '#d8c27a', '#c0392b', '#3b1f6e', '#2a7f8f']); F('face').value = pick(FACES)[0]; F('glasses').value = pick(['none', 'none', 'round', 'square', 'shades']);
  F('outfit').value = pick(OUTFITS)[0]; F('col1').value = pick(['#3a7bd5', '#e04f5f', '#2fb879', '#8e44ad', '#f28c28', '#1f1f1f', '#f2ebdc', '#d8a24a']); F('col2').value = pick(['#f5c542', '#ffffff', '#38e38b', '#3fb7ff', '#7b2d26', '#2f6fb3']); F('prop').value = pick(PROPS)[0];
});
['power', 'speed', 'guard'].forEach(k => F(k).addEventListener('input', refreshStats));
F('name').addEventListener('input', () => { $('#ed-preview-name').textContent = F('name').value.trim() || 'New fighter'; });
const pvCanvas = $('#ed-preview'), pvCtx = pvCanvas.getContext('2d');
function drawPreview(t) {
  let def; try { def = formToDef(); } catch { return; }
  pvCtx.clearRect(0, 0, 300, 360); const g = pvCtx.createLinearGradient(0, 0, 0, 360); g.addColorStop(0, shade(def.look.col1, -.6)); g.addColorStop(1, '#1b1530'); pvCtx.fillStyle = g; pvCtx.fillRect(0, 0, 300, 360);
  pvCtx.fillStyle = 'rgba(255,255,255,.06)'; pvCtx.fillRect(0, 300, 300, 60);
  const st = ed.poses[ed.pose]; const cyc = { idle: 2000, punch: 300, kick: 520, block: 1000, win: 2000, super: 1000 }[st];
  const f = { def, x: 150, y: 300, facing: 1, state: st, t: (t % cyc), vx: 0, flashHit: 0, actTotal: 500, specialKind: 'throw' };
  pvCtx.save(); pvCtx.translate(150, 300); pvCtx.scale(1.35, 1.35); pvCtx.translate(-150, -300); drawFighter(pvCtx, f, t); pvCtx.restore();
  pvCtx.fillStyle = 'rgba(255,255,255,.55)'; pvCtx.font = '12px Rubik, sans-serif'; pvCtx.textAlign = 'right'; pvCtx.fillText(st.toUpperCase(), 290, 350);
}

/* roster cards */
function renderRoster() {
  const el = $('#roster'); el.innerHTML = '';
  ROSTER.forEach(d => {
    const c = document.createElement('article'); c.className = 'card';
    const statRow = (l, v) => `<div class="stat"><span>${l}</span><span class="bar"><i style="width:${v * 10}%"></i></span><span>${v}</span></div>`;
    c.innerHTML = `<div class="top"><canvas width="144" height="144"></canvas><div><div class="nm">${esc(d.name)}</div><div class="ttl">${esc(d.title || 'Fighter')}</div></div></div>
      ${d.quote ? `<p class="quote">“${esc(d.quote)}”</p>` : ''}
      <div class="stats">${statRow('Power', d.stats.power)}${statRow('Speed', d.stats.speed)}${statRow('Guard', d.stats.guard)}</div>
      <div class="moves"><div><b>${esc(d.special.name)}</b> — ${SPECIALS[d.special.kind].desc}</div><div class="sup"><b>${esc(d.sup.name)}</b> — ${SUPERS[d.sup.kind].label}, needs full meter.</div></div>
      <div class="actions"><button type="button" data-act="edit">Edit</button><button type="button" data-act="dup">Duplicate</button></div>`;
    drawPortrait(c.querySelector('canvas').getContext('2d'), d, 144);
    c.querySelector('[data-act="edit"]').addEventListener('click', () => editFighter(d.id));
    c.querySelector('[data-act="dup"]').addEventListener('click', () => { if (ROSTER.length >= MAX_FIGHTERS) return; const cp = sanitizeFighter({ ...JSON.parse(JSON.stringify(d)), id: undefined, name: (d.name + ' 2').slice(0, 16) }, ROSTER.length); ROSTER.push(cp); saveRoster(); renderRoster(); });
    el.appendChild(c);
  });
  if (ROSTER.length < MAX_FIGHTERS) { const add = document.createElement('button'); add.type = 'button'; add.className = 'card empty'; add.innerHTML = `<div class="nm">+ Add a friend</div><div class="bio">${MAX_FIGHTERS - ROSTER.length} slots left</div>`; add.addEventListener('click', () => { newFighter(); $('#studio').scrollIntoView({ behavior: 'smooth' }); F('name').focus(); }); el.appendChild(add); }
  $('#share-code').value = JSON.stringify(ROSTER);
  if (game.screen === 'select') { game.cursor = Math.min(game.cursor, ROSTER.length - 1); buildSelectGrid(); updateSelectHead(); }
}
$('#btn-copy').addEventListener('click', async () => { const ta = $('#share-code'); ta.value = JSON.stringify(ROSTER); try { await navigator.clipboard.writeText(ta.value); msg($('#share-msg'), 'Copied. Paste it to a friend.'); } catch { ta.focus(); ta.select(); msg($('#share-msg'), 'Select the text and copy it manually.'); } });
$('#btn-import').addEventListener('click', () => {
  const sm = $('#share-msg'); let data; try { data = JSON.parse($('#share-code').value); } catch { return msg(sm, 'That code is not valid. Paste the whole thing.', true); }
  if (!Array.isArray(data) || !data.length) return msg(sm, 'The code has no fighters in it.', true);
  const incoming = data.slice(0, MAX_FIGHTERS).map(sanitizeFighter); const ids = new Set(ROSTER.map(f => f.id)); let added = 0, updated = 0;
  for (const f of incoming) { const i = ROSTER.findIndex(r => r.id === f.id); if (i >= 0) { ROSTER[i] = f; updated++; } else if (ROSTER.length < MAX_FIGHTERS) { ROSTER.push(f); added++; } }
  void ids; saveRoster(); renderRoster(); msg(sm, `Imported: ${added} new, ${updated} updated.`);
});
$('#btn-reset').addEventListener('click', e => { const b = e.currentTarget; if (b.dataset.arm !== '1') { b.dataset.arm = '1'; b.textContent = 'Really reset? This removes your fighters.'; setTimeout(() => { b.dataset.arm = ''; b.textContent = 'Reset to starter roster'; }, 3000); return; } ROSTER = STARTER_ROSTER.map(sanitizeFighter); saveRoster(); renderRoster(); newFighter(); b.dataset.arm = ''; b.textContent = 'Reset to starter roster'; msg($('#share-msg'), 'Starter roster restored.'); });
$('.share').addEventListener('toggle', () => { $('#share-code').value = JSON.stringify(ROSTER); });

/* ============================================================ */
/*  Boot & loop                                                  */
/* ============================================================ */
function fitCanvas() { const dpr = Math.min(2, window.devicePixelRatio || 1); if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; } }
$('#year').textContent = new Date().getFullYear();
renderRoster(); newFighter(); game.stageIdx = Math.floor(Math.random() * STAGES.length);
let last = performance.now(), acc = 0; const STEP = 1 / 120;
function loop(now) {
  let dt = Math.min(.1, (now - last) / 1000); last = now; acc += dt;
  while (acc >= STEP) { game.update(STEP); pressed.clear(); acc -= STEP; }
  fitCanvas(); game.draw();
  if (isStudioVisible()) drawPreview(now);
  requestAnimationFrame(loop);
}
function isStudioVisible() { const r = pvCanvas.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
document.addEventListener('visibilitychange', () => { if (document.hidden && game.screen === 'fight') game.paused = true; });
window.__dostDangal = { game, get roster() { return ROSTER; } }; // debug hook
requestAnimationFrame(loop);
})();
