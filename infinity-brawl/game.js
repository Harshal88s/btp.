/* Infinity Brawl — unofficial Marvel fan fighting game. Plain canvas + vanilla JS. */
(() => {
'use strict';
const W = 960, H = 540, GROUND = 452, ROUND_TIME = 60, ROUNDS_TO_WIN = 2, TAU = Math.PI * 2;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const store = { get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } };
function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = c => clamp(Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt), 0, 255); return `rgb(${f(r)},${f(g)},${f(b)})`; }
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

/* ============================================================ */
/*  Audio                                                        */
/* ============================================================ */
const audio = {
  ctx: null, on: store.get('ib-sound', true),
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(freq, dur, type = 'square', gain = .08, slide = 0) { if (!this.on || !this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, c.currentTime); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur); g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + .02); },
  noise(dur, gain = .12, lp = 1200) { if (!this.on || !this.ctx) return; const c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = buf; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = gain; s.connect(f).connect(g).connect(c.destination); s.start(); },
  sfx(name) {
    switch (name) {
      case 'punch': this.noise(.08, .1, 900); break; case 'kick': this.noise(.12, .14, 600); break;
      case 'hit': this.tone(140, .12, 'square', .09, -80); this.noise(.1, .1, 500); break; case 'block': this.tone(520, .06, 'triangle', .05); break;
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
      ctx.fillStyle = o.glow ? '#fff' : '#bfefff'; ctx.shadowColor = '#7fd9ff'; ctx.shadowBlur = 8; poly(ctx, [[2, -4], [9, -6], [9, -2], [2, -1]], ctx.fillStyle); poly(ctx, [[12, -6], [19, -5], [19, -1], [12, -2]], ctx.fillStyle); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#8c6d12'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(5, 10); ctx.lineTo(17, 9); ctx.stroke(); break; }
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
      if (o.glow) { ctx.fillStyle = '#bfefff'; ctx.shadowColor = '#7fd9ff'; ctx.shadowBlur = 10; eyes('#dff6ff', 3); ctx.shadowBlur = 0; } break; }
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
    case 'block': p.handF = [22, -118]; p.handB = [26, -98]; p.lean = -4; p.footF = [10, 0]; p.footB = [-18, 0]; break;
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

function drawFighter(ctx, f, t, opts = {}) {
  const d = f.def, id = d.id, p = opts.pose || poseFor(f, t), sc = d.scale || 1;
  const skin = { hulk: '#4caf50', thanos: '#9b6bc9', venom: '#0e0e14', spiderman: '#d7262c', panther: '#17171f', ironman: '#b3121f' }[id] || '#f1c9a5';
  const C = {
    ironman: { torso: '#b3121f', limb: '#b3121f', glove: '#f0b429', boot: '#f0b429' }, cap: { torso: '#1f4fa3', limb: '#1f4fa3', glove: '#c8102e', boot: '#c8102e' },
    thor: { torso: '#3b434d', limb: '#2a2f36', glove: '#8f9aa8', boot: '#2a2f36' }, hulk: { torso: '#4caf50', limb: '#4caf50', glove: '#4caf50', boot: '#4caf50', leg: '#5b3a9b' },
    spiderman: { torso: '#d7262c', limb: '#2a4fb0', glove: '#d7262c', boot: '#d7262c', leg: '#2a4fb0' }, panther: { torso: '#17171f', limb: '#17171f', glove: '#20202a', boot: '#17171f' },
    strange: { torso: '#2a5fb8', limb: '#2a5fb8', glove: '#f1c9a5', boot: '#2b2b2b', leg: '#2b2b2b' }, thanos: { torso: '#d4a017', limb: '#9b6bc9', glove: '#9b6bc9', boot: '#3a2a55', leg: '#3a2a55' },
    loki: { torso: '#1f6b3a', limb: '#111', glove: '#d4a017', boot: '#111', leg: '#111' }, venom: { torso: '#0e0e14', limb: '#0e0e14', glove: '#0e0e14', boot: '#0e0e14' }
  }[id];
  ctx.save(); ctx.translate(f.x, f.y + p.dy); ctx.scale(f.facing * sc, sc); ctx.rotate(p.rot); ctx.globalAlpha = p.alpha * (opts.alpha == null ? 1 : opts.alpha) * (1 - (f.dust || 0));
  if (p.glow > 0 && !opts.flat) { ctx.save(); ctx.globalAlpha *= p.glow * .5; ctx.fillStyle = f.state === 'super' ? '#ffd166' : d.color; ctx.filter = 'blur(14px)'; ctx.beginPath(); ctx.ellipse(0, -85, 60, 95, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  if (f.flashHit > 0 && !opts.flat) ctx.filter = 'brightness(1.8) saturate(0)';
  if (opts.tint) ctx.filter = opts.tint;
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
      case 'ironman': poly(ctx, [[shX - 14, shY + 2], [shX + 14, shY + 2], [shX + 10, shY + 30], [shX - 10, shY + 30]], '#f0b429'); ctx.fillStyle = '#fff'; ctx.shadowColor = '#7fd9ff'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(shX, shY + 18, 6, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#f0b429'; ctx.fillRect(hipX - 12, hipY - 6, 24, 5); break;
      case 'cap': star(ctx, shX, shY + 20, 9, '#fff'); for (let i = -2; i <= 2; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#c8102e'; ctx.fillRect(hipX + i * 6 - 3, hipY - 20, 6, 22); } ctx.fillStyle = '#6b4a2b'; ctx.fillRect(hipX - 17, hipY, 34, 5); break;
      case 'thor': for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { ctx.fillStyle = '#c9d2dc'; ctx.beginPath(); ctx.arc(shX - 7 + c * 14, shY + 12 + r * 14, 5, 0, TAU); ctx.fill(); } break;
      case 'spiderman': ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(shX, shY + 4); ctx.lineTo(shX - 20 + i * 10, hipY + 4); ctx.stroke(); } for (let y = shY + 14; y < hipY; y += 10) { ctx.beginPath(); ctx.moveTo(shX - 18, y); ctx.lineTo(shX + 18, y + 3); ctx.stroke(); } ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(shX, shY + 22, 3, 7, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; for (let i = -1; i <= 1; i += 2) for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(shX, shY + 18 + j * 4); ctx.lineTo(shX + i * 10, shY + 12 + j * 7); ctx.stroke(); } break;
      case 'panther': ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(shX - 16, shY + 4); ctx.lineTo(shX, shY + 34); ctx.lineTo(shX + 16, shY + 4); ctx.moveTo(shX - 10, shY + 40); ctx.lineTo(shX, shY + 52); ctx.lineTo(shX + 10, shY + 40); ctx.stroke(); ctx.fillStyle = '#c9d2dc'; for (let i = -3; i <= 3; i++) poly(ctx, [[shX + i * 5 - 1.5, shY + 2 + Math.abs(i)], [shX + i * 5 + 1.5, shY + 2 + Math.abs(i)], [shX + i * 5, shY + 9 + Math.abs(i)]], '#c9d2dc'); break;
      case 'strange': ctx.fillStyle = '#1e4a92'; ctx.fillRect(shX - 2, shY + 2, 4, 50); ctx.fillStyle = '#f0b429'; ctx.fillRect(hipX - 17, hipY - 4, 34, 5); ctx.fillStyle = '#b3121f'; ctx.fillRect(hipX - 4, hipY, 8, 22); ctx.fillStyle = '#d4a017'; ctx.beginPath(); ctx.arc(shX, shY + 22, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#35c26b'; ctx.shadowColor = '#35c26b'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(shX, shY + 22, 3.5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; break;
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
function drawPortrait(ctx, d, size, t = 0) {
  ctx.clearRect(0, 0, size, size); const g = ctx.createLinearGradient(0, 0, 0, size); g.addColorStop(0, shade(d.color, -.4)); g.addColorStop(1, '#0b0d1a'); ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.save(); ctx.translate(size / 2, size * .8); const sc = size / 86; ctx.scale(sc, sc);
  const torso = { ironman: '#b3121f', cap: '#1f4fa3', thor: '#3b434d', hulk: '#4caf50', spiderman: '#d7262c', panther: '#17171f', strange: '#2a5fb8', thanos: '#d4a017', loki: '#1f6b3a', venom: '#0e0e14' }[d.id];
  ctx.fillStyle = torso; ctx.beginPath(); ctx.ellipse(0, 36, 36, 18, 0, 0, TAU); ctx.fill();
  const skin = { hulk: '#4caf50', thanos: '#9b6bc9', venom: '#0e0e14', spiderman: '#d7262c', panther: '#17171f', ironman: '#b3121f' }[d.id] || '#f1c9a5'; ctx.fillStyle = skin; ctx.fillRect(-6, 10, 12, 16);
  drawHead(ctx, d.id, { t }); ctx.restore();
}

/* ============================================================ */
/*  Stages                                                       */
/* ============================================================ */
const STAGES = [
  { name: 'New York Street', draw(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, '#0a0f2e'); g.addColorStop(1, '#3a2a6a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 400);
      ctx.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { ctx.globalAlpha = .3 + .7 * Math.abs(Math.sin(t * .001 + i)); ctx.fillRect((i * 193) % W, (i * 71) % 200, 2, 2); } ctx.globalAlpha = 1;
      for (let i = 0; i < 12; i++) { const x = i * 86 - 30, h = 140 + ((i * 53) % 150); ctx.fillStyle = i % 2 ? '#141a3a' : '#1a2148'; ctx.fillRect(x, 400 - h, 70, h); ctx.fillStyle = '#ffd98a'; for (let r = 0; r < h / 20 - 1; r++) for (let c = 0; c < 3; c++) if ((i * 5 + r * 3 + c) % 3 !== 0) { ctx.globalAlpha = .4 + .6 * ((i + r + c) % 3) / 2; ctx.fillRect(x + 10 + c * 20, 410 - h + r * 20, 9, 11); } ctx.globalAlpha = 1; }
      // tower with glowing A
      ctx.fillStyle = '#20284f'; poly(ctx, [[470, 400], [470, 120], [500, 60], [540, 60], [560, 130], [560, 400]], '#20284f'); ctx.fillStyle = '#3fa9ff'; ctx.shadowColor = '#3fa9ff'; ctx.shadowBlur = 14; ctx.font = 'bold 34px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 518, 120); ctx.shadowBlur = 0;
      // taxi
      ctx.save(); ctx.translate(140 + Math.sin(t * .002) * 3, 380); ctx.fillStyle = '#f5c518'; rrect(ctx, -70, -40, 140, 36, 8); ctx.fill(); rrect(ctx, -44, -62, 84, 30, 8); ctx.fill(); ctx.fillStyle = '#9fd3ff'; ctx.fillRect(-38, -58, 34, 22); ctx.fillRect(2, -58, 34, 22); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-42, 0, 13, 0, TAU); ctx.arc(42, 0, 13, 0, TAU); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(-10, -74, 20, 10); ctx.restore();
      ctx.fillStyle = '#3a3f55'; ctx.fillRect(0, 396, W, 10); ctx.fillStyle = '#2a2d3e'; ctx.fillRect(0, 406, W, H - 406); ctx.fillStyle = '#e8d35b'; for (let x = 0; x < W; x += 90) ctx.fillRect(x, 476, 50, 6);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 406, W, 8);
    } },
  { name: 'Wakanda', draw(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, '#2b0f4a'); g.addColorStop(.6, '#9b3fb5'); g.addColorStop(1, '#f28c28'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 400);
      ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(760, 300, 70, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a1b5a'; ctx.beginPath(); ctx.moveTo(0, 330); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 300 - Math.abs(Math.sin(x * .013)) * 90 - Math.sin(x * .05) * 10); ctx.lineTo(W, 400); ctx.lineTo(0, 400); ctx.fill();
      // panther statue silhouette
      ctx.fillStyle = '#1a0b2a'; ctx.save(); ctx.translate(180, 330); ctx.scale(1.6, 1.6); poly(ctx, [[-40, 0], [-36, -40], [-20, -60], [-6, -66], [-2, -80], [6, -70], [20, -72], [24, -60], [10, -56], [14, -30], [40, -10], [44, 0]], '#1a0b2a'); ctx.restore();
      // towers
      for (const [x, h] of [[600, 150], [640, 210], [690, 170], [860, 120]]) { ctx.fillStyle = '#2a1545'; rrect(ctx, x, 400 - h, 30, h, 6); ctx.fill(); ctx.fillStyle = '#9b5cff'; for (let y = 400 - h + 10; y < 390; y += 16) ctx.fillRect(x + 8, y, 14, 3); }
      ctx.fillStyle = '#4a2a6a'; ctx.fillRect(0, 396, W, 10); const fl = ctx.createLinearGradient(0, 406, 0, H); fl.addColorStop(0, '#5a3570'); fl.addColorStop(1, '#2a1540'); ctx.fillStyle = fl; ctx.fillRect(0, 406, W, H - 406);
      ctx.strokeStyle = 'rgba(155,92,255,.35)'; ctx.lineWidth = 2; for (let x = -60; x < W + 60; x += 70) { ctx.beginPath(); ctx.moveTo(x, 406); ctx.lineTo(x - 40, H); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(0, 470); ctx.lineTo(W, 470); ctx.stroke();
    } },
  { name: 'Titan', draw(ctx, t) {
      const g = ctx.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, '#2a0f08'); g.addColorStop(1, '#c2561e'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 400);
      ctx.strokeStyle = 'rgba(255,220,180,.35)'; ctx.lineWidth = 14; ctx.beginPath(); ctx.ellipse(700, 120, 260, 60, -.35, 0, TAU); ctx.stroke(); ctx.fillStyle = '#e8a060'; ctx.beginPath(); ctx.arc(700, 120, 70, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(680, 100, 20, 0, TAU); ctx.fill();
      for (let i = 0; i < 8; i++) { const x = (i * 140 + t * .01) % (W + 200) - 100; ctx.fillStyle = 'rgba(255,170,100,.15)'; ctx.beginPath(); ctx.ellipse(x, 200 + i * 20, 90, 18, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#5a2a14'; for (const [x, w, h] of [[60, 50, 160], [130, 30, 100], [820, 60, 190], [900, 40, 120], [420, 24, 90]]) { poly(ctx, [[x, 400], [x + w * .2, 400 - h], [x + w * .7, 400 - h * .9], [x + w, 400]], '#5a2a14'); }
      ctx.fillStyle = '#7a3a1a'; ctx.fillRect(0, 396, W, 10); const fl = ctx.createLinearGradient(0, 406, 0, H); fl.addColorStop(0, '#a4522a'); fl.addColorStop(1, '#5a2a14'); ctx.fillStyle = fl; ctx.fillRect(0, 406, W, H - 406);
      ctx.fillStyle = 'rgba(0,0,0,.15)'; for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.ellipse((i * 137) % W, 430 + (i * 29) % 100, 20 + (i % 4) * 8, 5, 0, 0, TAU); ctx.fill(); }
    } }
];

/* ============================================================ */
/*  Fighter                                                      */
/* ============================================================ */
const ATTACKS = { punch: { total: 300, a0: 70, a1: 180, dmg: 6, reach: 72, kb: 120, stun: 300 }, kick: { total: 520, a0: 140, a1: 290, dmg: 10, reach: 100, kb: 220, stun: 380 } };
class Fighter {
  constructor(def, side) { this.def = def; this.side = side; this.wins = 0; this.resetRound(); }
  resetRound() {
    this.x = this.side === 0 ? 280 : W - 280; this.y = GROUND; this.vx = 0; this.vy = 0; this.facing = this.side === 0 ? 1 : -1;
    this.maxHp = this.def.hp; this.hp = this.maxHp; this.meter = 0; this.state = 'idle'; this.t = 0; this.hitDone = false; this.combo = 0; this.comboT = 0;
    this.spCool = 0; this.flashHit = 0; this.grounded = true; this.frozen = false; this.specialKind = this.def.special.kind; this.actTotal = 500; this.pendingKnock = false; this.bindT = 0;
    this.jumps = 0; this.hovering = false; this.shieldOut = false; this.dust = 0; this.pullTo = null; this.tpDone = false; this.spLaunched = false;
  }
  get speed() { return 170 + this.def.stats.speed * 20; } get power() { return .75 + this.def.stats.power * .06; } get guard() { return 1.12 - this.def.stats.guard * .035; }
  canAct() { return ['idle', 'walk', 'jump', 'block'].includes(this.state); }
  setState(s, extra = {}) { this.state = s; this.t = 0; this.hitDone = false; if (s !== 'bound') this.pullTo = null; Object.assign(this, extra); }
  update(dt, inp, opp, game) {
    const ms = dt * 1000; this.t += ms; this.spCool = Math.max(0, this.spCool - ms); this.flashHit = Math.max(0, this.flashHit - ms);
    if (this.comboT > 0) { this.comboT -= ms; if (this.comboT <= 0) this.combo = 0; }
    if (this.frozen) return;
    if (this.canAct() || this.state === 'hit') this.facing = opp.x >= this.x ? 1 : -1;
    const s = this.state;
    if (s === 'punch' && this.t > ATTACKS.punch.total) this.setState('idle');
    if (s === 'kick' && this.t > ATTACKS.kick.total) this.setState('idle');
    if (s === 'hit' && this.t > this.stunT) this.setState(this.pendingKnock ? 'down' : 'idle');
    if (s === 'down' && this.t > 900) this.setState('getup');
    if (s === 'getup' && this.t > 300) this.setState('idle');
    if (s === 'bound') { if (this.pullTo) { const tx = this.pullTo.x + this.pullTo.facing * 70; this.x = lerp(this.x, tx, .12); } if (this.t > this.bindT) this.setState('idle'); }
    if (s === 'special') this.updateSpecial(opp, game);
    if (this.canAct() && game.phase === 'fight') {
      const blocking = inp.block && this.grounded;
      if (inp.super && this.meter >= 100 && this.grounded) game.startSuper(this, opp);
      else if (inp.special && this.spCool <= 0 && this.grounded) this.startSpecial(opp, game);
      else if (inp.punch && this.grounded) { this.setState('punch'); audio.sfx('punch'); }
      else if (inp.kick && this.grounded) { this.setState('kick'); audio.sfx('kick'); }
      else if (blocking) { if (this.state !== 'block') this.setState('block'); this.vx = 0; }
      else {
        if (this.state === 'block') this.setState('idle');
        const mv = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        if (this.grounded) { this.vx = mv * this.speed; if (mv !== 0 && this.state === 'idle') this.setState('walk'); if (mv === 0 && this.state === 'walk') this.setState('idle'); }
        else this.vx = lerp(this.vx, mv * this.speed * .9, .05);
        if (inp.jump) {
          if (this.grounded) { this.vy = -640; this.grounded = false; this.jumps = 1; this.hovering = false; this.setState('jump'); audio.sfx('whoosh'); }
          else if (this.jumps < 2 && (this.def.fly || this.def.doubleJump)) { this.vy = this.def.fly ? -420 : -520; this.jumps = 2; this.hovering = !!this.def.fly; audio.sfx('whoosh'); game.fx.push({ kind: 'ring', x: this.x, y: this.y, t: 0, life: 250, c: this.def.color, r: 40 }); }
        }
      }
    } else if (this.state === 'hit' || this.state === 'block') this.vx *= .85;
    else if (this.state !== 'special') this.vx *= .8;
    if (!this.grounded || this.state === 'jump') { this.vy += (this.hovering ? 900 : 1800) * dt; this.y += this.vy * dt; if (this.y >= GROUND) { this.y = GROUND; this.vy = 0; this.grounded = true; this.jumps = 0; this.hovering = false; if (this.state === 'jump') this.setState('idle'); } }
    this.x += this.vx * dt; this.x = clamp(this.x, 40, W - 40);
    const d = opp.x - this.x; if (Math.abs(d) < 46 && this.y === GROUND && opp.y === GROUND) { const push = (46 - Math.abs(d)) / 2 * (d > 0 ? -1 : 1); this.x = clamp(this.x + push, 40, W - 40); opp.x = clamp(opp.x - push, 40, W - 40); }
    const atk = ATTACKS[this.state]; if (atk && this.t >= atk.a0 && this.t <= atk.a1 && !this.hitDone && this.inReach(opp, atk.reach * (this.def.scale || 1))) { this.hitDone = true; game.applyHit(this, opp, atk.dmg * this.power, { kb: atk.kb, stun: atk.stun, knockdown: this.state === 'kick' && this.combo >= 3 }); }
  }
  inReach(opp, reach) { const dx = (opp.x - this.x) * this.facing; return dx > -10 && dx < reach + 20 && Math.abs(opp.y - this.y) < 110 && !['down', 'getup'].includes(opp.state); }
  startSpecial(opp, game) {
    const k = this.def.special.kind; this.specialKind = k; this.spCool = 1500; this.setState('special'); this.vx = 0; this.spLaunched = false; this.tpDone = false;
    this.actTotal = { repulsor: 420, shield: 380, lightning: 520, clap: 560, web: 440, kinetic: 460, portal: 520, powerstone: 500, daggers: 480, tendril: 480 }[k];
    this.targetX = opp.x; audio.sfx(k === 'lightning' ? 'thunder' : k === 'repulsor' ? 'beam' : 'special'); game.banner(this.def.special.name, this.side === 0 ? '#ff6b6b' : '#3fa9ff', 700, true);
  }
  updateSpecial(opp, game) {
    const k = this.specialKind, t = this.t, col = this.def.color, dmgM = this.power, hx = this.x + this.facing * 36, hy = this.y - 112;
    const fireAt = { repulsor: 160, shield: 180, lightning: 260, clap: 220, web: 150, powerstone: 220, daggers: 160, tendril: 140 }[k];
    if (fireAt != null && t >= fireAt && !this.spLaunched) {
      this.spLaunched = true;
      switch (k) {
        case 'repulsor': game.projectiles.push(new Projectile(this, hx, hy, this.facing * 980, 0, 9 * dmgM, { kind: 'beam', c: '#bfefff', kb: 180 })); break;
        case 'shield': this.shieldOut = true; game.projectiles.push(new Projectile(this, hx, hy - 6, this.facing * 760, 0, 7 * dmgM, { kind: 'shield', kb: 200, boomerang: 440 })); break;
        case 'lightning': { const tx = clamp(this.targetX, 40, W - 40); game.fx.push({ kind: 'bolt', x: tx, t: 0, life: 380, pts: boltPts(tx) }); game.fx.push({ kind: 'ring', x: tx, y: GROUND, t: 0, life: 300, c: '#bfefff', r: 70 }); game.shake(7); game.flash = .4; if (Math.abs(opp.x - tx) < 60 && opp.y > GROUND - 90 && !['down', 'getup'].includes(opp.state)) game.applyHit(this, opp, 12 * dmgM, { kb: 120, stun: 450 }); break; }
        case 'clap': game.fx.push({ kind: 'clap', x: hx - this.facing * 10, y: hy, dir: this.facing, t: 0, life: 420 }); game.shake(12); if (this.inReach(opp, 230)) game.applyHit(this, opp, 13 * dmgM, { kb: 460, stun: 420, knockdown: true }); audio.sfx('thunder'); break;
        case 'web': game.projectiles.push(new Projectile(this, hx, hy, this.facing * 820, 0, 4 * dmgM, { kind: 'web', kb: 20, bind: 750, pull: true })); break;
        case 'powerstone': game.projectiles.push(new Projectile(this, hx, hy, this.facing * 520, 0, 14 * dmgM, { kind: 'orb', c: '#9b5cff', kb: 300, knockdown: true })); break;
        case 'daggers': [-1, 0, 1].forEach(i => game.projectiles.push(new Projectile(this, hx, hy + i * 8, this.facing * 640, i * 110, 4.5 * dmgM, { kind: 'dagger', kb: 90 }))); game.fx.push({ kind: 'illusion', x: this.x - this.facing * 50, y: this.y, facing: this.facing, def: this.def, t: 0, life: 650 }); this.x = clamp(this.x + this.facing * 10, 40, W - 40); break;
        case 'tendril': game.fx.push({ kind: 'tendril', x1: hx, y1: hy, x2: hx + this.facing * 250, y2: hy + 6, t: 0, life: 360 }); if (this.inReach(opp, 270)) game.applyHit(this, opp, 9 * dmgM, { kb: 10, stun: 200, bind: 550, pull: this }); break;
      }
    }
    if (k === 'kinetic') { if (t > 80 && t < 360) { this.vx = this.facing * 780; this.x = clamp(this.x + this.vx / 60, 40, W - 40); if (t % 40 < 9) game.fx.push({ kind: 'trail', x: this.x, y: this.y, t: 0, life: 260, f: this, c: '#9b5cff' }); if (!this.hitDone && this.inReach(opp, 60)) { this.hitDone = true; game.applyHit(this, opp, 13 * dmgM, { kb: 340, stun: 420, knockdown: true }); game.fx.push({ kind: 'slash', x: opp.x, y: opp.y - 100, t: 0, life: 250, c: '#c9b8ff' }); } } else this.vx = 0; }
    if (k === 'portal') { if (t >= 120 && !this.portalA) { this.portalA = true; game.fx.push({ kind: 'portal', x: this.x, y: this.y - 80, t: 0, life: 500 }); } if (t >= 300 && !this.tpDone) { this.tpDone = true; this.x = clamp(opp.x - opp.facing * 70, 40, W - 40); this.facing = opp.x >= this.x ? 1 : -1; game.fx.push({ kind: 'portal', x: this.x, y: this.y - 80, t: 0, life: 500 }); if (this.inReach(opp, 110)) game.applyHit(this, opp, 13 * dmgM, { kb: 260, stun: 420, knockdown: true }); } }
    if (t >= this.actTotal) { this.portalA = false; this.setState('idle'); }
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
    if (!this.hitOut && Math.abs(opp.x - this.x) < 36 && this.y > opp.y - 165 && this.y < opp.y + 10 && !['down', 'getup'].includes(opp.state)) {
      if (this.boomerang) this.hitOut = true; else this.dead = true;
      if (this.bind) game.applyHit(this.owner, opp, this.dmg, { kb: this.kb, stun: 200, bind: this.bind, pull: this.pull ? this.owner : null }); else game.applyHit(this.owner, opp, this.dmg, { kb: this.kb, stun: 360, knockdown: this.knockdown });
      if (this.kind === 'web') game.fx.push({ kind: 'webline', a: this.owner, b: opp, t: 0, life: 700 });
    }
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y);
    switch (this.kind) {
      case 'beam': ctx.rotate(Math.atan2(this.vy, this.vx)); ctx.shadowColor = '#7fd9ff'; ctx.shadowBlur = 16; ctx.fillStyle = '#bfefff'; rrect(ctx, -34, -5, 44, 10, 5); ctx.fill(); ctx.fillStyle = '#fff'; rrect(ctx, -20, -2, 28, 4, 2); ctx.fill(); break;
      case 'shield': drawShield(ctx, 0, 0, this.rot, 1.15); break;
      case 'web': ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(this.owner.x + this.owner.facing * 36 - this.x, this.owner.y - 112 - this.y); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a + this.rot) * 14, Math.sin(a + this.rot) * 14); ctx.stroke(); } break;
      case 'orb': ctx.shadowColor = '#9b5cff'; ctx.shadowBlur = 22; ctx.fillStyle = '#9b5cff'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill(); ctx.fillStyle = '#e9ddff'; ctx.beginPath(); ctx.arc(-4, -4, 7, 0, TAU); ctx.fill(); break;
      case 'dagger': drawDagger(ctx, 0, 0, Math.atan2(this.vy, this.vx) + Math.PI / 2); break;
    }
    ctx.restore();
  }
}

/* ============================================================ */
/*  CPU                                                          */
/* ============================================================ */
const AI_LEVELS = [{ react: 420, aggro: .35, block: .15, special: .25, super: .4, idle: .35 }, { react: 260, aggro: .55, block: .4, special: .45, super: .7, idle: .2 }, { react: 140, aggro: .75, block: .65, special: .6, super: .95, idle: .08 }];
function cpuIntent(me, opp, game, dt) {
  const L = AI_LEVELS[game.difficulty]; me.ai = me.ai || { t: 0, plan: {}, until: 0 }; const ai = me.ai; ai.t += dt * 1000;
  const blank = { left: false, right: false, jump: false, block: false, punch: false, kick: false, special: false, super: false };
  if (ai.t < ai.until) return { ...blank, ...ai.plan, punch: false, kick: false, special: false, super: false, jump: false };
  ai.t = 0; ai.until = L.react * rnd(.6, 1.4); const plan = { ...blank }, dist = Math.abs(opp.x - me.x), toward = opp.x > me.x ? 'right' : 'left', away = toward === 'right' ? 'left' : 'right';
  const oppAttacking = ['punch', 'kick', 'special'].includes(opp.state), r = Math.random();
  const incoming = game.projectiles.some(p => p.owner !== me && Math.sign(p.vx) === Math.sign(me.x - p.x) && Math.abs(p.x - me.x) < 260);
  if (me.meter >= 100 && r < L.super && dist < 420) plan.super = true;
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
const readInput = m => ({ left: m.left.some(k => keys.has(k)), right: m.right.some(k => keys.has(k)), block: m.block.some(k => keys.has(k)), jump: m.jump.some(k => pressed.has(k)), punch: m.punch.some(k => pressed.has(k)), kick: m.kick.some(k => pressed.has(k)), special: m.special.some(k => pressed.has(k)), super: m.super.some(k => pressed.has(k)) });
const SUPER_HITS = { unibeam: 3, assemble: 4, stormbreaker: 4, smash: 2, webswing: 3, wakanda: 3, bargain: 5, snap: 1, purpose: 5, wearevenom: 4 };

const game = {
  screen: 'title', mode: 'cpu', difficulty: 1, stageIdx: 0, phase: 'idle', phaseT: 0, round: 1, timer: ROUND_TIME,
  fighters: [], projectiles: [], fx: [], banners: [], shakeT: 0, shakeA: 0, flash: 0, paused: false, cine: null, picks: [null, null], picker: 0, cursor: 0, winner: -1,
  tally: store.get('ib-tally', { w: 0, l: 0 }),
  startMatch() { this.fighters = [new Fighter(this.picks[0], 0), new Fighter(this.picks[1], 1)]; this.round = 1; const s = +$('#opt-stage').value; this.stageIdx = s >= 0 ? s : Math.floor(Math.random() * STAGES.length); this.difficulty = +$('#opt-diff').value; this.startRound(); },
  startRound() { this.fighters.forEach(f => f.resetRound()); this.projectiles = []; this.fx = []; this.banners = []; this.cine = null; this.timer = ROUND_TIME; this.phase = 'intro'; this.phaseT = 0; audio.sfx('round'); },
  banner(text, color, life = 900, small = false) { this.banners.push({ text, color, t: 0, life, small }); },
  shake(a) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = 220; },
  applyHit(att, def, dmg, o = {}) {
    if (def.state === 'ko' || (def.frozen && !o.cine)) return;
    const chainOk = def.state === 'hit' || def.state === 'bound';
    if (def.state === 'block' && !o.unblockable) {
      def.hp -= dmg * .2 * def.guard; def.vx = att.facing * (o.kb || 120) * .6; def.meter = Math.min(100, def.meter + dmg * .4); att.meter = Math.min(100, att.meter + dmg * .5);
      this.fx.push({ kind: 'spark', x: def.x + def.facing * 20, y: def.y - 100, t: 0, life: 180, c: '#9fd3ff', block: true }); audio.sfx('block'); if (def.hp <= 0) this.knockout(def); return;
    }
    att.combo = chainOk ? att.combo + 1 : 1; att.comboT = 1200;
    const scale = Math.max(.45, 1 - Math.max(0, att.combo - 2) * .12), real = Math.round(dmg * scale * def.guard * 10) / 10;
    def.hp -= real; att.meter = Math.min(100, att.meter + real * 1.3); def.meter = Math.min(100, def.meter + real * .9); def.vx = att.facing * (o.kb || 120); def.flashHit = 90;
    if (o.bind) def.setState('bound', { bindT: o.bind, vx: 0, pullTo: o.pull || null }); else def.setState('hit', { stunT: o.stun || 320, pendingKnock: !!o.knockdown });
    if (!def.grounded) def.vy = -200;
    this.fx.push({ kind: 'spark', x: def.x + def.facing * 18, y: def.y - 105 + rnd(-15, 15), t: 0, life: 220, c: o.cine ? '#ffd166' : '#fff' });
    this.fx.push({ kind: 'num', x: def.x, y: def.y - 175, t: 0, life: 700, text: String(Math.round(real)), c: o.cine ? '#ffd166' : (att.side === 0 ? '#ff6b6b' : '#3fa9ff') });
    this.shake(o.cine ? 8 : (real > 9 ? 5 : 2)); audio.sfx('hit'); if (att.combo >= 2) audio.sfx('tick');
    if (def.hp <= 0) this.knockout(def);
  },
  knockout(def) { def.hp = 0; def.setState('ko'); this.fighters.forEach(f => f.frozen = false); this.fighters[1 - def.side].wins++; this.phase = 'ko'; this.phaseT = 0; this.cine = null; this.banner('K.O.', '#e23636', 1800); audio.sfx('ko'); this.shake(14); this.flash = 1; },
  startSuper(att, def) {
    const kind = att.def.sup.kind, n = SUPER_HITS[kind]; att.meter = 0; att.setState('super'); att.vx = 0; def.frozen = true; att.frozen = true; att.shieldOut = false; this.projectiles = this.projectiles.filter(p => p.owner !== att);
    const total = kind === 'snap' ? Math.max(30, def.hp * .5) : 24 + att.def.stats.power * 1.4;
    const hits = []; const first = { smash: 1150, snap: 800, webswing: 700, unibeam: 650 }[kind] || 650, span = { smash: 120, snap: 0, webswing: 600 }[kind] ?? 700;
    for (let i = 0; i < n; i++) hits.push(first + i * (span / Math.max(1, n)));
    this.cine = { att, def, kind, t: 0, hits, dmgEach: total / n, connects: true, knockdown: ['smash', 'snap', 'wakanda'].includes(kind), end: { smash: 1800, snap: 2200 }[kind] || 1750, startX: att.x, startY: att.y, items: [], runners: [] };
    if (kind === 'assemble') { const allies = HEROES.filter(h => !h.villain && h.id !== att.def.id); for (let i = 0; i < 4; i++) this.cine.runners.push({ def: allies[(i * 2 + 1) % allies.length], x: att.facing > 0 ? -80 - i * 170 : W + 80 + i * 170, vx: att.facing * 1000, y: GROUND }); }
    if (kind === 'purpose') { for (let i = 0; i < 5; i++) this.cine.items.push({ clone: true, x: clamp(def.x + [-150, 150, -80, 80, 0][i], 40, W - 40), facing: [1, -1, 1, -1, def.x >= att.x ? -1 : 1][i], show: 450 + i * 140 }); }
    audio.sfx(kind === 'snap' ? 'super' : 'super'); this.banner(att.def.sup.name, '#ffd166', 1200); this.flash = .6; this.shake(6);
  },
  updateCine(dt) {
    const c = this.cine; c.t += dt * 1000; const { att, def, kind } = c, t = c.t;
    // choreography
    if (kind === 'smash') { if (t < 500) { /* crouch */ } else if (t < 900) { att.y = lerp(c.startY, -260, (t - 500) / 400); } else if (t < 1150) { att.x = clamp(def.x - att.facing * 36, 40, W - 40); att.y = lerp(-260, GROUND, (t - 900) / 250); } else att.y = GROUND; }
    if (kind === 'webswing') { const i = Math.floor((t - 550) / 300); if (t >= 550 && i < 3) { const p = ((t - 550) % 300) / 300, from = i % 2 === 0 ? (att.facing > 0 ? 80 : W - 80) : (att.facing > 0 ? W - 80 : 80), to = i % 2 === 0 ? (att.facing > 0 ? W - 80 : 80) : (att.facing > 0 ? 80 : W - 80); att.x = lerp(from, to, p); att.y = GROUND - 200 + Math.sin(p * Math.PI) * 190; att.facing = to > from ? 1 : -1; c.swing = true; } else if (t >= 1450) { att.y = GROUND; att.x = clamp(def.x - (def.x >= W / 2 ? -1 : 1) * -90, 40, W - 40); att.facing = def.x >= att.x ? 1 : -1; c.swing = false; } }
    if (kind === 'snap' && t > 300 && t < 800 && Math.floor(t / 60) !== Math.floor((t - dt * 1000) / 60)) this.fx.push({ kind: 'stoneglow', x: att.x + att.facing * 36 * att.def.scale, y: att.y - 150 * att.def.scale, t: 0, life: 300, i: Math.floor(t / 60) % 6 });
    for (const r of c.runners) r.x += r.vx * dt;
    while (c.hits.length && t >= c.hits[0]) {
      c.hits.shift(); const last = c.hits.length === 0;
      switch (kind) {
        case 'unibeam': this.fx.push({ kind: 'unibeam', x: att.x, y: att.y - 108, dir: att.facing, t: 0, life: 350 }); audio.sfx('beam'); break;
        case 'stormbreaker': this.fx.push({ kind: 'bolt', x: def.x, t: 0, life: 380, pts: boltPts(def.x) }); for (let i = 0; i < 2; i++) { const x = rnd(40, W - 40); this.fx.push({ kind: 'bolt', x, t: 0, life: 380, pts: boltPts(x) }); } this.flash = .5; this.shake(10); audio.sfx('thunder'); break;
        case 'smash': this.fx.push({ kind: 'crack', x: att.x, t: 0, life: 1000 }); this.fx.push({ kind: 'ring', x: att.x, y: GROUND, t: 0, life: 500, c: '#ffd166', r: 260 }); this.shake(22); this.flash = .5; audio.sfx('thunder'); break;
        case 'webswing': this.fx.push({ kind: 'slash', x: def.x, y: def.y - 100, t: 0, life: 250, c: '#fff' }); break;
        case 'wakanda': this.fx.push({ kind: 'ring', x: att.x, y: att.y - 80, t: 0, life: 600, c: '#9b5cff', r: 760 }); this.shake(8); break;
        case 'bargain': this.fx.push({ kind: 'glyph', x: def.x, y: def.y - 90, t: 0, life: 500 }); break;
        case 'snap': this.flash = 1; this.fx.push({ kind: 'snapwave', x: att.x, y: att.y - 150, t: 0, life: 900 }); def.dustT = 0; def.dusting = true; audio.sfx('snap'); this.shake(16); break;
        case 'purpose': { const cl = c.items[5 - c.hits.length - 1]; if (cl) this.fx.push({ kind: 'slash', x: def.x + (cl.x < def.x ? -20 : 20), y: def.y - 100, t: 0, life: 250, c: '#7dffb0' }); break; }
        case 'wearevenom': for (let i = 0; i < 3; i++) { const side = Math.random() < .5 ? -40 : W + 40; this.fx.push({ kind: 'tendril', x1: side, y1: rnd(0, GROUND), x2: def.x + rnd(-10, 10), y2: def.y - rnd(60, 130), t: 0, life: 360 }); } this.shake(6); break;
        case 'assemble': this.fx.push({ kind: 'slash', x: def.x, y: def.y - 100, t: 0, life: 250, c: '#fff' }); this.shake(6); break;
      }
      def.frozen = false; this.applyHit(att, def, c.dmgEach, { kb: last ? 260 : 40, stun: last ? 520 : 650, knockdown: last && c.knockdown, unblockable: true, cine: true }); if (!last) def.frozen = true;
    }
    if (def.dusting) { def.dustT = (def.dustT || 0) + dt * 1000; def.dust = def.dustT < 700 ? clamp(def.dustT / 700, 0, .85) : clamp(.85 - (def.dustT - 700) / 500, 0, .85); if (def.dustT < 700 && Math.random() < .6) this.fx.push({ kind: 'dust', x: def.x + rnd(-24, 24), y: def.y - rnd(0, 150), t: 0, life: 900, vx: att.facing * rnd(20, 80), vy: -rnd(20, 70) }); if (def.dustT > 1200) { def.dusting = false; def.dust = 0; } }
    if (t >= c.end) { att.frozen = false; def.frozen = false; att.y = GROUND; att.grounded = true; att.setState('idle'); if (!['hit', 'down', 'ko'].includes(def.state)) def.setState('idle'); def.dust = 0; def.dusting = false; this.cine = null; }
  },
  update(dt) {
    this.phaseT += dt * 1000; this.banners.forEach(b => b.t += dt * 1000); this.banners = this.banners.filter(b => b.t < b.life);
    if (this.shakeT > 0) { this.shakeT -= dt * 1000; if (this.shakeT <= 0) this.shakeA = 0; } this.flash = Math.max(0, this.flash - dt * 2.5);
    this.fx.forEach(e => { e.t += dt * 1000; if (e.kind === 'dust') { e.x += e.vx * dt; e.y += e.vy * dt; } }); this.fx = this.fx.filter(e => e.t < e.life);
    if (this.screen !== 'fight' || this.paused) return;
    const [a, b] = this.fighters;
    if (this.phase === 'intro' && this.phaseT > 2000) { this.phase = 'fight'; this.phaseT = 0; audio.sfx('round'); }
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
  timeUp() { const [a, b] = this.fighters, ra = a.hp / a.maxHp, rb = b.hp / b.maxHp; const loser = ra === rb ? (Math.random() < .5 ? a : b) : (ra < rb ? a : b); loser.setState('ko'); this.fighters[1 - loser.side].wins++; this.phase = 'ko'; this.phaseT = 0; this.cine = null; this.fighters.forEach(f => f.frozen = false); this.banner('TIME UP', '#ffd166', 1800); audio.sfx('ko'); },
  finish(w) {
    this.winner = w.side; this.screen = 'result'; audio.sfx('win');
    if (this.mode === 'cpu') { if (w.side === 0) this.tally.w++; else this.tally.l++; store.set('ib-tally', this.tally); }
    $('#res-title').textContent = this.mode === '2p' ? `PLAYER ${w.side + 1} WINS` : (w.side === 0 ? 'YOU WIN' : 'CPU WINS'); $('#res-title').style.color = w.side === 0 ? '#ff6b6b' : '#3fa9ff';
    $('#res-name').textContent = `${w.def.name} · ${w.def.alias}`; $('#res-line').textContent = `“${w.def.win}”`;
    $('#res-tally').textContent = this.mode === 'cpu' ? `Your record vs CPU: ${this.tally.w}W – ${this.tally.l}L` : `${this.fighters[0].def.name} ${this.fighters[0].wins} – ${this.fighters[1].wins} ${this.fighters[1].def.name}`;
    showScreen('result');
  },

  draw() {
    const t = performance.now(); ctx.save(); const dpr = canvas.width / W; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.shakeA > 0) ctx.translate(rnd(-this.shakeA, this.shakeA), rnd(-this.shakeA, this.shakeA));
    STAGES[this.stageIdx].draw(ctx, t);
    if (this.screen === 'fight' || this.screen === 'result') {
      const c = this.cine;
      if (c) { ctx.fillStyle = `rgba(0,0,0,${c.kind === 'snap' ? .7 : .55})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
      this.drawFxBack(t);
      if (c) for (const r of c.runners) drawFighter(ctx, { def: r.def, x: r.x, y: r.y, facing: Math.sign(r.vx), state: 'walk', t, vx: r.vx, flashHit: 0 }, t, { noProp: false });
      if (c && c.kind === 'purpose') for (const it of c.items) if (c.t >= it.show) drawFighter(ctx, { def: c.att.def, x: it.x, y: GROUND, facing: it.facing, state: c.t < it.show + 200 ? 'idle' : 'punch', t: c.t - it.show - 200, flashHit: 0 }, t, { alpha: .6, noShadow: true, tint: 'brightness(1.25) saturate(1.2)' });
      if (c && c.kind === 'webswing' && c.swing) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(W / 2, -10); ctx.lineTo(c.att.x + c.att.facing * 10, c.att.y - 185); ctx.stroke(); }
      const order = c ? [c.def, c.att] : [...this.fighters].sort((x, y) => (x.state === 'hit' ? 1 : 0) - (y.state === 'hit' ? 1 : 0));
      for (const f of order) f.draw(ctx, t);
      for (const p of this.projectiles) p.draw(ctx);
      this.drawFxFront(t); this.drawHud(t);
      if (this.phase === 'intro' && this.phaseT > 350 && this.phaseT < 1900) this.fighters.forEach(f => drawBubble(f, f.def.line, clamp((this.phaseT - 350) / 200, 0, 1)));
    }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * .85})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    for (const b of this.banners) { const p = b.t / b.life, a = p < .1 ? p / .1 : (p > .8 ? (1 - p) / .2 : 1), sc = b.small ? .5 : 1; ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, b.small ? 150 : H / 2 - 20); ctx.rotate(b.small ? 0 : -.04); ctx.scale(sc * (1 + (1 - a) * .3), sc * (1 + (1 - a) * .3)); ctx.font = '72px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(b.text, 0, 0); ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0); ctx.restore(); }
    if (this.screen === 'fight' && this.phase === 'intro') { const txt = this.phaseT < 1300 ? `ROUND ${this.round}` : 'FIGHT!'; ctx.save(); ctx.font = '84px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, W / 2, 230); ctx.fillStyle = this.phaseT < 1300 ? '#fff' : '#f0b429'; ctx.fillText(txt, W / 2, 230); ctx.restore(); }
    if (this.paused) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H); ctx.font = '64px Bangers, Impact, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PAUSED', W / 2, H / 2 - 20); ctx.font = '18px Rubik, sans-serif'; ctx.fillStyle = '#a3a9cc'; ctx.fillText('Esc / P to resume · Backspace to quit', W / 2, H / 2 + 30); }
    ctx.restore();
  },
  drawFxBack(t) {
    for (const e of this.fx) { const p = e.t / e.life, a = 1 - p;
      if (e.kind === 'bolt') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.shadowColor = '#7fd9ff'; ctx.shadowBlur = 22; ctx.beginPath(); e.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
      else if (e.kind === 'unibeam') { ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.shadowColor = '#7fd9ff'; ctx.shadowBlur = 30; ctx.fillStyle = 'rgba(191,239,255,.9)'; const h = 34 + Math.sin(e.t * .05) * 6; ctx.fillRect(e.dir > 0 ? e.x : -40, e.y - h / 2, e.dir > 0 ? W + 40 - e.x : e.x + 40, h); ctx.fillStyle = '#fff'; ctx.fillRect(e.dir > 0 ? e.x : -40, e.y - 6, e.dir > 0 ? W + 40 - e.x : e.x + 40, 12); ctx.restore(); }
      else if (e.kind === 'illusion') { drawFighter(ctx, { def: e.def, x: e.x, y: e.y, facing: e.facing, state: 'idle', t: 0, flashHit: 0 }, t, { alpha: a * .6, noShadow: true, tint: 'brightness(1.3)' }); }
      else if (e.kind === 'trail') { ctx.save(); ctx.globalAlpha = .35 * a; drawFighter(ctx, { ...e.f, x: e.x, y: e.y, state: 'special', t: 200 }, t, { flat: true, noShadow: true, noProp: true, tint: e.c ? 'saturate(0) brightness(.6) sepia(1) hue-rotate(220deg) saturate(4)' : null }); ctx.restore(); }
      else if (e.kind === 'portal') { ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.3); ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 5; ctx.shadowColor = '#ff8c1a'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.ellipse(e.x, e.y, 40 * Math.min(1, p * 3), 80 * Math.min(1, p * 3), 0, 0, TAU); ctx.stroke(); for (let i = 0; i < 10; i++) { const an = i / 10 * TAU + e.t * .02; ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(e.x + Math.cos(an) * 44, e.y + Math.sin(an) * 84, 2.5, 0, TAU); ctx.fill(); } ctx.restore(); }
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
      else if (e.kind === 'slash') { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = e.c; ctx.lineWidth = 4; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(e.x - 30, e.y - 30 + i * 14); ctx.lineTo(e.x + 30, e.y + 30 + i * 14); ctx.stroke(); } ctx.restore(); }
      else if (e.kind === 'glyph') { ctx.save(); ctx.globalAlpha = a; ctx.translate(e.x, e.y); ctx.rotate(e.t * .004); ctx.strokeStyle = '#35c26b'; ctx.lineWidth = 3; ctx.shadowColor = '#35c26b'; ctx.shadowBlur = 12; for (const r of [60, 85]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); } for (let i = 0; i < 12; i++) { const an = i / 12 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 60, Math.sin(an) * 60); ctx.lineTo(Math.cos(an) * 85, Math.sin(an) * 85); ctx.stroke(); } ctx.rotate(-e.t * .008); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -50); ctx.stroke(); ctx.restore(); }
      else if (e.kind === 'stoneglow') { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = STONES[e.i]; ctx.shadowColor = STONES[e.i]; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(e.x + Math.cos(e.i) * 14, e.y + Math.sin(e.i * 1.7) * 14, 6 + p * 10, 0, TAU); ctx.fill(); ctx.restore(); }
      else if (e.kind === 'dust') { ctx.save(); ctx.globalAlpha = a * .8; ctx.fillStyle = '#c9b8a8'; ctx.fillRect(e.x, e.y, 3, 3); ctx.restore(); }
    }
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
const screens = { title: $('#scr-title'), select: $('#scr-select'), result: $('#scr-result') };
function showScreen(name) { for (const k in screens) screens[k].hidden = k !== name; if (name) game.screen = name; }
function goTitle() { game.screen = 'title'; game.paused = false; showScreen('title'); }
function openSelect(mode) { game.mode = mode; game.picks = [null, null]; game.picker = 0; game.cursor = 0; game.screen = 'select'; $('#lbl-diff').hidden = mode !== 'cpu'; buildSelectGrid(); updateSelectHead(); showScreen('select'); }
function updateSelectHead() {
  const who = $('#sel-who'), p = game.picker; who.className = 'who ' + (p === 0 ? 'p1c' : 'p2c');
  who.textContent = p === 0 ? 'PLAYER 1 — CHOOSE YOUR FIGHTER' : (game.mode === 'cpu' ? 'CHOOSE YOUR OPPONENT (CPU)' : 'PLAYER 2 — CHOOSE YOUR FIGHTER');
  document.querySelectorAll('#select-grid .pick').forEach((el, i) => { el.classList.toggle('p1', game.picks[0] === HEROES[i]); el.classList.toggle('p2', game.picks[1] === HEROES[i]); el.querySelector('.t1').hidden = game.picks[0] !== HEROES[i]; el.querySelector('.t2').hidden = game.picks[1] !== HEROES[i]; el.style.outline = i === game.cursor ? `2px dashed ${p === 0 ? '#ff6b6b' : '#3fa9ff'}` : ''; });
  const d = HEROES[game.cursor]; $('#sel-bio').innerHTML = `<b>${esc(d.name)}</b> · ${esc(d.alias)} — <i>“${esc(d.line)}”</i><br>Special: <b>${esc(d.special.name)}</b> · Super: <b>${esc(d.sup.name)}</b>${d.fly ? ' · Flyer' : d.doubleJump ? ' · Double jump' : ''}`;
}
function buildSelectGrid() {
  const grid = $('#select-grid'); grid.innerHTML = '';
  HEROES.forEach((d, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pick' + (d.villain ? ' villain' : ''); b.setAttribute('role', 'option'); b.innerHTML = `<span class="tag t1" hidden>P1</span><span class="tag t2" hidden>${game.mode === 'cpu' ? 'CPU' : 'P2'}</span><canvas width="90" height="90"></canvas><span class="nm">${esc(d.name)}</span>`; drawPortrait(b.querySelector('canvas').getContext('2d'), d, 90); b.addEventListener('mouseenter', () => { game.cursor = i; updateSelectHead(); }); b.addEventListener('click', () => { game.cursor = i; confirmPick(); }); grid.appendChild(b); });
}
function confirmPick() { audio.init(); audio.sfx('ui'); game.picks[game.picker] = HEROES[game.cursor]; if (game.picker === 0) { game.picker = 1; game.cursor = (game.cursor + 1) % HEROES.length; updateSelectHead(); } else { showScreen(null); game.screen = 'fight'; game.startMatch(); } }
$('#btn-vs-cpu').addEventListener('click', () => { audio.init(); audio.sfx('ui'); openSelect('cpu'); });
$('#btn-vs-2p').addEventListener('click', () => { audio.init(); audio.sfx('ui'); openSelect('2p'); });
$('#scr-title').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('.title-art, .sub, .blink')) { audio.init(); openSelect('cpu'); } });
$('#btn-random').addEventListener('click', () => { game.cursor = Math.floor(Math.random() * HEROES.length); confirmPick(); });
$('#btn-back-title').addEventListener('click', goTitle);
$('#btn-rematch').addEventListener('click', () => { showScreen(null); game.screen = 'fight'; game.startMatch(); });
$('#btn-reselect').addEventListener('click', () => openSelect(game.mode));
$('#btn-home').addEventListener('click', goTitle);
$('#btn-sound').addEventListener('click', e => { audio.on = !audio.on; store.set('ib-sound', audio.on); e.currentTarget.textContent = audio.on ? '🔊 Sound on' : '🔇 Sound off'; e.currentTarget.setAttribute('aria-pressed', String(audio.on)); audio.init(); audio.sfx('ui'); });
$('#btn-sound').textContent = audio.on ? '🔊 Sound on' : '🔇 Sound off';

const GAME_KEYS = new Set([...Object.values(P1).flat(), ...Object.values(P2).flat(), 'Space', 'Enter', 'Escape', 'KeyP', 'Backspace']);
function isArenaVisible() { const r = $('#arena').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
window.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return; const inArena = game.screen !== 'title' || isArenaVisible();
  if (GAME_KEYS.has(e.code) && inArena) e.preventDefault(); if (e.repeat) return; keys.add(e.code); pressed.add(e.code);
  if (game.screen === 'title' && e.code === 'Enter' && inArena) { audio.init(); openSelect('cpu'); }
  if (game.screen === 'select') { const map = game.picker === 0 ? P1 : P2, cols = 5; let c = game.cursor; if (map.left.includes(e.code)) c--; if (map.right.includes(e.code)) c++; if (map.jump.includes(e.code)) c -= cols; if (map.block.includes(e.code)) c += cols; if (c !== game.cursor) { game.cursor = (c + HEROES.length) % HEROES.length; audio.sfx('tick'); updateSelectHead(); } if (map.punch.includes(e.code) || e.code === 'Enter') confirmPick(); if (e.code === 'Escape') goTitle(); }
  if (game.screen === 'fight') { if (e.code === 'Escape' || e.code === 'KeyP') { game.paused = !game.paused; audio.sfx('ui'); } if (game.paused && e.code === 'Backspace') goTitle(); }
  if (game.screen === 'result' && e.code === 'Enter') { showScreen(null); game.screen = 'fight'; game.startMatch(); }
});
window.addEventListener('keyup', e => keys.delete(e.code)); window.addEventListener('blur', () => keys.clear());

const touchEl = $('#touch'), coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; let touchOn = store.get('ib-touch', coarse);
function setTouch(on) { touchOn = on; touchEl.classList.toggle('show', on); touchEl.setAttribute('aria-hidden', String(!on)); $('#btn-touch').setAttribute('aria-pressed', String(on)); store.set('ib-touch', on); }
setTouch(touchOn); $('#btn-touch').addEventListener('click', () => setTouch(!touchOn));
touchEl.querySelectorAll('.tbtn').forEach(b => { const k = b.dataset.k; const down = e => { e.preventDefault(); audio.init(); if (!keys.has(k)) pressed.add(k); keys.add(k); b.classList.add('on'); }, up = e => { e.preventDefault(); keys.delete(k); b.classList.remove('on'); }; b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); b.addEventListener('contextmenu', e => e.preventDefault()); });

/* roster cards */
(function renderRoster() {
  const el = $('#roster');
  HEROES.forEach(d => { const c = document.createElement('article'); c.className = 'card'; c.style.setProperty('--c', d.color);
    const statRow = (l, v) => `<div class="stat"><span>${l}</span><span class="bar"><i style="width:${v * 10}%"></i></span><span>${v}</span></div>`;
    c.innerHTML = `<div class="top"><canvas width="152" height="152"></canvas><div><div class="nm">${esc(d.name)}</div><div class="ttl${d.villain ? ' v' : ''}">${d.villain ? 'Villain' : 'Hero'} · ${esc(d.alias)}</div></div></div><p class="quote">“${esc(d.line)}”</p>
      <div class="stats">${statRow('Power', d.stats.power)}${statRow('Speed', d.stats.speed)}${statRow('Guard', d.stats.guard)}</div>
      <div class="moves"><div><b>${esc(d.special.name)}</b> — ${esc(d.special.desc)}</div><div class="sup"><b>${esc(d.sup.name)}</b> — ${esc(d.sup.desc)}</div><div>HP ${d.hp}${d.fly ? ' · Flyer (double jump hover)' : d.doubleJump ? ' · Double jump' : ''}</div></div>`;
    drawPortrait(c.querySelector('canvas').getContext('2d'), d, 152); el.appendChild(c); });
})();

/* boot */
function fitCanvas() { const dpr = Math.min(2, window.devicePixelRatio || 1); if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; } }
$('#year').textContent = new Date().getFullYear(); game.stageIdx = Math.floor(Math.random() * STAGES.length);
let last = performance.now(), acc = 0; const STEP = 1 / 120;
function loop(now) { const dt = Math.min(.1, (now - last) / 1000); last = now; acc += dt; while (acc >= STEP) { game.update(STEP); pressed.clear(); acc -= STEP; } fitCanvas(); game.draw(); requestAnimationFrame(loop); }
document.addEventListener('visibilitychange', () => { if (document.hidden && game.screen === 'fight') game.paused = true; });
window.__infinityBrawl = { game, HEROES };
requestAnimationFrame(loop);
})();
