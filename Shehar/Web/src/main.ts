// Shehar web: game bootstrap, main loop, player (on foot / driving / flying), camera, HUD, map, menus,
// tutorial, settings, cheat codes and the Rathi Maheshwari Hostel landmark.
// Coordinates: gameplay in data space (x east, z north, y up, yaw clockwise from north); three.js = (x, y, -z).
import * as THREE from 'three';
import './style.css';
import { Audio } from './audio';
import { OrbitCamera, Gyro, CamTarget } from './camera';
import { Character } from './character';
import { GPS, fmtDist } from './gps';
import { Helicopter } from './heli';
import { Input } from './input';
import { MapRaster } from './maprender';
import { GameApi, Mission, MissionRunner } from './missions';
import { settings, saveSettings, resetSettings, SLIDERS } from './settings';
import { signTexture, streetBoard } from './textures';
import { Obstacle, Pedestrians, Signals, Traffic, disposeModel } from './traffic';
import { Tutorial, TutStep } from './tutorial';
import { SPECS, Vehicle } from './vehicles';
import { World, SpecialInfo } from './world';
import type { NameBoard, Special } from './chunkgen';

THREE.ColorManagement.enabled = false; // vertex colours are authored as display colours

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const lowEnd = isTouch || (navigator.hardwareConcurrency || 8) <= 4;
const D2R = Math.PI / 180;
const TIPS = [
  'India drives on the LEFT – AI traffic keeps left on two-way roads.',
  'The hills are real: elevation comes from SRTM satellite data. Try driving up towards Taljai.',
  'Type the cheat HELIPUNE while driving to turn your car into a helicopter.',
  'Open the map and tap the hostel button to navigate to Rathi Maheshwari Hostel.',
  'Camera too fast or slow? Settings → Camera sensitivity.',
  'Stop at a petrol pump (green dot on the map) and press F to refuel.',
];

type Quality = 'low' | 'high';
type Anim = { type: 'enter' | 'exit'; v: Vehicle; stage: number; t: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number; yaw: number };

class Game implements GameApi {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; cam: OrbitCamera; gyro = new Gyro();
  world!: World; graph!: World['graph']; gps!: GPS; signals!: Signals; traffic!: Traffic; peds!: Pedestrians; missions!: MissionRunner; map!: MapRaster;
  input: Input; audio = new Audio(); quality: Quality;
  sun = new THREE.DirectionalLight(0xffffff, 1.0 * Math.PI); hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6a5a48, 0.6 * Math.PI);
  sky!: THREE.Mesh; rain: THREE.LineSegments | null = null; raining = false;
  headlight: THREE.SpotLight | null = null;
  // player
  veh: Vehicle | null = null; parked: Vehicle[] = [];
  foot = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, vy: 0, grounded: true, windup: 0, speed: 0, turn: 0, accel: 0 };
  char = new Character({ shirt: [30, 90, 170], pants: [40, 45, 70], skin: [176, 122, 86] });
  anim: Anim | null = null;
  firstPerson = false; hour = 10; money = 10000; missionMode = false; running = false; paused = false;
  markers: { x: number; z: number; mesh: THREE.Mesh; m: Mission }[] = [];
  hostel: SpecialInfo | null = null; hostelSigned = new Set<number>(); hostelReached = false; hostelLabel: THREE.Sprite | null = null; hostelBeam: THREE.Mesh | null = null;
  tut: Tutorial | null = null; stats = { moved: 0, camTurn: 0, sprinted: false, jumped: false, camToggled: false, entered: false, drove: false, honked: false, mapOpened: false, cheatOpened: false, flew: false, settingsOpened: false };
  private last = performance.now(); private hudT = 0; private waterT = 0; private landT = 0; private fpsAcc = 0; private fpsN = 0;
  private toasts: { el: HTMLElement; until: number }[] = []; private bigUntil = 0; private sayUntil = 0;
  private prompt = ''; private promptAction: (() => void) | null = null; private seen = new Set<string>();
  private lastSpeed = 0;

  constructor() {
    this.quality = settings.quality === 'high' ? 'high' : settings.quality === 'low' ? 'low' : (lowEnd ? 'low' : 'high');
    this.renderer = new THREE.WebGLRenderer({ canvas: $('c') as HTMLCanvasElement, antialias: this.quality === 'high', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.4, 2600);
    this.cam = new OrbitCamera(this.camera);
    this.input = new Input($('touch'));
    addEventListener('resize', () => this.resize()); this.resize();
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog(0xb8c8d8, 300, 900);
    this.sky = this.makeSky(); this.scene.add(this.sky);
    this.scene.add(this.char.root);
    try { this.money = Number(localStorage.getItem('shehar_money') || 10000); for (const s of JSON.parse(localStorage.getItem('shehar_seen') || '[]')) this.seen.add(s); } catch { /* private mode */ }
    // desktop: click to capture the mouse (pointer lock) for free camera look; drag works as a fallback
    const c = $('c');
    let drag = false, lx = 0, ly = 0;
    c.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || !this.running) return;
      if (!document.pointerLockElement && !this.paused) c.requestPointerLock?.();
      drag = true; lx = e.clientX; ly = e.clientY;
    });
    addEventListener('pointerup', () => (drag = false));
    addEventListener('mousemove', e => {
      if (document.pointerLockElement === c) this.input.mouseLook(e.movementX, e.movementY);
      else if (drag) { this.input.mouseLook(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; }
    });
    this.applyQuality();
  }

  makeSky(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(2000, 24, 12), col: number[] = [], pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 2000; col.push(1, 1, 1, ); void y; }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -1;
    return m;
  }
  paintSky(top: THREE.Color, horizon: THREE.Color) {
    const geo = this.sky.geometry, pos = geo.getAttribute('position'), col = geo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const f = Math.pow(Math.max(0, pos.getY(i) / 2000), 0.5); const c = horizon.clone().lerp(top, f); col.setXYZ(i, c.r, c.g, c.b); }
    col.needsUpdate = true;
  }

  applyQuality() {
    const high = this.quality === 'high';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 1.5 : 1));
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    if (high) { this.sun.shadow.mapSize.set(2048, 2048); Object.assign(this.sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 600 }); this.sun.shadow.bias = -0.0005; }
    if (this.world) this.world.loadRadius = high ? 620 : 380;
    if (this.traffic) this.traffic.max = high ? 24 : 12;
    if (this.peds) this.peds.max = high ? 18 : 6;
    this.camera.far = 2600; this.camera.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.Fog; fog.near = high ? 320 : 200; fog.far = high ? 1100 : 650;
    $('qLabel').textContent = high ? 'High' : 'Low';
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    $('rotate').classList.toggle('hidden', !(isTouch && innerHeight > innerWidth && this.running));
  }

  async start(mode: 'deccan' | 'hostel' | 'missions') {
    this.missionMode = mode === 'missions';
    this.audio.start(); this.audio.volume = settings.volume;
    $('menu').classList.add('hidden'); $('loading').classList.remove('hidden');
    let tip = 0; $('loadTip').textContent = 'TIP: ' + TIPS[0];
    const tipT = setInterval(() => { tip = (tip + 1) % TIPS.length; $('loadTip').textContent = 'TIP: ' + TIPS[tip]; }, 5000);
    this.world = new World('/cities/pune/', this.quality === 'low');
    this.applyQuality();
    this.scene.add(this.world.root);
    const prog = (p: number, l: string) => { ($('loadBar') as HTMLElement).style.width = Math.round(p * 100) + '%'; $('loadLabel').textContent = l; };
    try { await this.world.load(prog); } catch (e) { clearInterval(tipT); $('loadLabel').textContent = 'Could not load city data: ' + e; return; }
    this.graph = this.world.graph;
    this.hostel = (this.world.idx.specials || [])[0] || null;
    this.map = new MapRaster(this.world.idx, this.world.global, this.quality === 'high' ? 2048 : 1536, this.world.terrain);
    this.signals = new Signals(this.graph); this.signals.h = (x, z) => this.world.h(x, z);
    this.world.onChunkAdded = (r, g) => this.decorateChunk(this.world.key(r.cx, r.cz), r.signals, r.boards, r.specials, g);
    this.world.onChunkRemoved = k => { this.signals.removeChunk(k); this.hostelSigned.delete(k); };
    this.traffic = new Traffic(this.world, this.scene, this.signals);
    this.peds = new Pedestrians(this.world, this.scene);
    this.gps = new GPS(this.graph, this.scene, this.world.terrain);
    this.missions = new MissionRunner(this);
    this.applyQuality();
    if (this.hostel) this.hostelBeacon(this.hostel);
    // spawn on foot next to a parked car (so the tutorial can teach getting in)
    const at = mode === 'hostel' && this.hostel ? [this.hostel.x, this.hostel.z - 40] : [this.world.idx.spawnX, this.world.idx.spawnZ];
    const [sx, sz, syaw] = this.world.roadPointNear(at[0], at[1]);
    await this.world.preload(sx, sz, 300, f => prog(0.5 + 0.5 * f, 'Streaming streets around you...'));
    for (const [k, cs] of this.world.chunkSignals) this.decorateChunk(k, cs.spots, this.world.chunkExtras.get(k)!.boards, this.world.chunkExtras.get(k)!.specials, cs.group);
    clearInterval(tipT);
    const car = new Vehicle(SPECS.hatch, [180, 20, 20]);
    car.x = sx; car.z = sz; car.yaw = syaw; car.sync(0, this.world.terrain);
    this.scene.add(car.model.group); this.parked.push(car);
    const r = syaw * D2R;
    this.foot.x = sx + Math.cos(r) * (car.spec.W / 2 + 2.2) + Math.sin(r) * 2; this.foot.z = sz - Math.sin(r) * (car.spec.W / 2 + 2.2) + Math.cos(r) * 2;
    this.foot.y = this.world.h(this.foot.x, this.foot.z); this.foot.yaw = syaw;
    this.cam.snapBehind(syaw);
    if (this.missionMode) this.placeMarkers();
    $('loading').classList.add('hidden'); $('hud').classList.remove('hidden'); $('utilBar').classList.remove('hidden');
    if (isTouch) { $('touch').classList.remove('hidden'); document.body.classList.add('touch'); }
    this.running = true; this.resize();
    this.big('PUNE', (mode === 'hostel' ? 'Bibwewadi · Rathi Maheshwari Hostel' : mode === 'missions' ? 'Missions' : 'Free roam · ' + this.world.idx.spawnName), '#ff9933');
    this.toast('Map © OpenStreetMap contributors · terrain SRTM', '#aab0bb');
    if (!settings.tutorialDone) setTimeout(() => this.startTutorial(), 1200);
    else this.toast(isTouch ? 'Left thumb: move · right side: look · E: get in the red car' : 'Click to look around with the mouse · WASD move · E: get in the red car');
    if (isTouch) document.documentElement.requestFullscreen?.().catch(() => {});
  }

  placeMarkers() {
    const geo = new THREE.CylinderGeometry(2.5, 2.5, 25, 20, 1, true); geo.translate(0, 12.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc81a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    for (const m of this.missions.all) { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(m.x, this.world.h(m.x, m.z), -m.z); this.scene.add(mesh); this.markers.push({ x: m.x, z: m.z, mesh, m }); }
  }

  // ---------------------------------------------------------------- landmark: Rathi Maheshwari Hostel
  /** always-visible gold beam + floating name above the hostel (works before its chunk is streamed in) */
  hostelBeacon(h: SpecialInfo) {
    const y = this.world.h(h.x, h.z);
    const geo = new THREE.CylinderGeometry(3, 3, 140, 20, 1, true); geo.translate(0, 70, 0);
    const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffc81a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(h.x, y, -h.z); this.scene.add(beam);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture('RATHI MAHESHWARI HOSTEL', 'Bibwewadi – Kondhwa, Pune', '#0b2a5b', '#ffd21a'), fog: false, depthTest: false }));
    label.scale.set(56, 14, 1); label.position.set(h.x, y + 48, -h.z); label.renderOrder = 10; this.scene.add(label);
    this.hostelLabel = label; this.hostelBeam = beam;
  }

  /** per-chunk props created on the main thread: signal poles, street-name boards, hostel signage */
  decorateChunk(key: number, signals: any[], boards: NameBoard[], specials: Special[], g: THREE.Group) {
    for (const s of signals) this.signals.addPole(s, g, key);
    if (this.quality === 'high' || boards.length <= 2) for (const b of boards.slice(0, 3)) {
      const grp = new THREE.Group(); grp.position.set(b.x, b.y, -b.z); grp.rotation.y = -(b.yaw + 90) * D2R;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), new THREE.MeshLambertMaterial({ color: 0x777777 })); pole.position.y = 1.6; grp.add(pole);
      const m = new THREE.MeshBasicMaterial({ map: streetBoard(b.name), side: THREE.DoubleSide });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), m); board.position.y = 3.3; grp.add(board);
      g.add(grp);
    }
    for (const sp of specials) {
      if (this.hostelSigned.has(key)) continue;
      this.hostelSigned.add(key);
      // longest footprint edge -> the big rooftop sign runs along it, readable from both sides
      let best = 0, ax = 0, az = 0, bx = 0, bz = 0; const n = sp.pts.length / 2;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, l = Math.hypot(sp.pts[2 * j] - sp.pts[2 * i], sp.pts[2 * j + 1] - sp.pts[2 * i + 1]); if (l > best) { best = l; ax = sp.pts[2 * i]; az = sp.pts[2 * i + 1]; bx = sp.pts[2 * j]; bz = sp.pts[2 * j + 1]; } }
      let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += sp.pts[2 * i]; cz += sp.pts[2 * i + 1]; } cx /= n; cz /= n;
      const len = Math.min(best * 0.9, 34), yaw = Math.atan2(bx - ax, bz - az);
      const grp = new THREE.Group(); grp.position.set(cx, sp.top, -cz); grp.rotation.y = -yaw + Math.PI / 2;
      const tex = signTexture('RATHI MAHESHWARI HOSTEL', 'Seth Shri G. B. Rathi Maheshwari Hostel · ABMECT');
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      for (const side of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(len, len / 4), mat); p.position.set(0, 1.6 + len / 8, side * 0.06); p.rotation.y = side > 0 ? 0 : Math.PI; grp.add(p); }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, len / 4 + 0.4, 0.1), new THREE.MeshLambertMaterial({ color: 0x222222 })); frame.position.y = 1.6 + len / 8; grp.add(frame);
      for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 0.25), new THREE.MeshLambertMaterial({ color: 0x555555 })); post.position.set(s * len * 0.4, 0.9, 0); grp.add(post); }
      // ground-level name band on the long facade
      const band = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(best * 0.8, 24), 1.4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, nx = (bz - az) / best, nz = -(bx - ax) / best;
      band.position.set(mx + nx * 0.15, sp.base + 3.8, -(mz + nz * 0.15)); band.rotation.y = -yaw + Math.PI / 2;
      g.add(grp, band);
    }
  }

  // ---------------------------------------------------------------- GameApi
  pos(): [number, number] { return this.veh ? [this.veh.x, this.veh.z] : [this.foot.x, this.foot.z]; }
  speed() { return this.veh ? Math.abs(this.veh.v) : Math.hypot(this.foot.vx, this.foot.vz); }
  vehicle() { return this.veh && !this.veh.heli ? this.veh : this.veh; }
  toast(t: string, c = '#ffffff') {
    const el = document.createElement('div'); el.textContent = t; el.style.color = c; $('toasts').appendChild(el);
    this.toasts.push({ el, until: performance.now() + 5000 });
    while (this.toasts.length > 5) this.toasts.shift()!.el.remove();
  }
  big(t: string, sub: string, c: string) { $('bigT').textContent = t; $('bigT').style.color = c; $('bigS').textContent = sub; $('big').classList.remove('hidden'); this.bigUntil = performance.now() + 3500; }
  say(who: string, line: string, sec: number) { $('dlgWho').textContent = who; $('dlgLine').textContent = line; $('dialog').classList.remove('hidden'); this.sayUntil = performance.now() + sec * 1000; }
  earn(n: number, why: string) { this.money += n; this.toast((n >= 0 ? '+₹' : '-₹') + Math.abs(n).toLocaleString('en-IN') + '  ' + why, n >= 0 ? '#6ef07f' : '#ff7a6a'); this.save(); }
  setHour(h: number) { this.hour = h; }
  chime(ok: boolean) { this.audio.chime(ok); }
  marker(x: number, z: number, color: number) {
    const geo = new THREE.CylinderGeometry(4, 4, 40, 20, 1, true); geo.translate(0, 20, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, this.world.h(x, z), -z); this.scene.add(m);
    return () => { this.scene.remove(m); geo.dispose(); (m.material as THREE.Material).dispose(); };
  }
  person(x: number, z: number) { const h = new Character(); h.root.position.set(x, this.world.h(x, z), -z); this.scene.add(h.root); return () => { this.scene.remove(h.root); h.dispose(); }; }
  save() { try { localStorage.setItem('shehar_money', String(this.money)); localStorage.setItem('shehar_seen', JSON.stringify([...this.seen])); } catch { /* ignore */ } }

  // ---------------------------------------------------------------- vehicles: enter / exit with animation
  private seatWorld(v: Vehicle): [number, number, number] {
    const p = v.model.body.localToWorld(new THREE.Vector3(v.model.headX, v.model.seatY - 0.95, v.model.headZ));
    return [p.x, p.y, -p.z];
  }
  private doorPoint(v: Vehicle): [number, number] {
    const r = v.yaw * D2R, rx = Math.cos(r), rz = -Math.sin(r), fx = Math.sin(r), fz = Math.cos(r);
    const side = v.heli ? 3 : v.spec.W / 2 + 0.75, fwd = v.heli ? 0.8 : -v.model.headZ; // driver's (right-hand) side
    return [v.x + rx * side + fx * fwd, v.z + rz * side + fz * fwd];
  }

  beginEnter(v: Vehicle) {
    const agent = this.traffic?.agents.find(a => a.veh === v);
    if (agent) {
      this.traffic.release(agent); v.ai = false; v.v = 0;
      if (v.spec.two) { this.scene.remove(v.model.group); disposeModel(v); v.model = new Vehicle(v.spec, undefined, v.plate).model; this.scene.add(v.model.group); v.sync(0, this.world.terrain); }
      this.toast('You took the ' + v.spec.name + ' – the driver walks off grumbling', '#ffd24d');
    }
    v.occupied = true;
    const [dx, dz] = this.doorPoint(v);
    this.anim = { type: 'enter', v, stage: 0, t: 0, ax: this.foot.x, ay: this.foot.y, az: this.foot.z, bx: dx, by: this.world.h(dx, dz), bz: dz, yaw: this.foot.yaw };
  }

  beginExit() {
    const v = this.veh; if (!v) return;
    if (v.heli && !v.heli.landed) { this.toast('Land first (descend until the skids touch down)'); return; }
    if (!v.heli && Math.abs(v.v) > 7) { this.toast('Slow down to get out'); return; }
    const [sx, sy, sz] = this.seatWorld(v);
    let [dx, dz] = this.doorPoint(v);
    if (this.world.collide(dx, dz, 0.35, this.world.h(dx, dz))) { const r = v.yaw * D2R; dx -= Math.cos(r) * (v.spec.W + 1.5); dz += Math.sin(r) * (v.spec.W + 1.5); }
    this.char.root.removeFromParent(); this.scene.add(this.char.root);
    this.anim = { type: 'exit', v, stage: 0, t: 0, ax: sx, ay: sy, az: sz, bx: dx, by: this.world.h(dx, dz), bz: dz, yaw: v.yaw };
    this.char.seated = true;
    this.placeChar(sx, sy, sz, v.yaw);
  }

  private placeChar(x: number, y: number, z: number, yaw: number) { this.char.root.position.set(x, y, -z); this.char.root.rotation.set(0, -yaw * D2R, 0); }

  private stepAnim(dt: number) {
    const a = this.anim!, v = a.v, door = !!v.model.door && !v.heli;
    a.t += dt;
    if (a.type === 'enter') {
      if (a.stage === 0) { // walk to the driver's door
        const ddx = a.bx - this.foot.x, ddz = a.bz - this.foot.z, d = Math.hypot(ddx, ddz);
        if (d < 0.25 || a.t > 2.5) { a.stage = 1; a.t = 0; this.foot.vx = this.foot.vz = 0; }
        else {
          const sp = Math.min(2.6, d * 4); this.foot.vx = ddx / d * sp; this.foot.vz = ddz / d * sp;
          this.foot.x += this.foot.vx * dt; this.foot.z += this.foot.vz * dt; this.foot.y = this.world.h(this.foot.x, this.foot.z);
          this.turnFoot(Math.atan2(ddx, ddz) / D2R, dt);
          this.char.animate(dt, sp, 0, this.foot.turn);
          this.placeChar(this.foot.x, this.foot.y, this.foot.z, this.foot.yaw);
        }
      } else if (a.stage === 1) { // face the car, open the door
        this.turnFoot(v.yaw - 90, dt);
        this.char.animate(dt, 0);
        this.placeChar(this.foot.x, this.foot.y, this.foot.z, this.foot.yaw);
        v.doorOpen = door ? Math.min(1, a.t / 0.35) : 1;
        if (a.t > (door ? 0.4 : 0.1)) { a.stage = 2; a.t = 0; this.char.seated = true; }
      } else if (a.stage === 2) { // slide into the seat
        const [sx, sy, sz] = this.seatWorld(v), k = Math.min(1, a.t / 0.45), e = k * k * (3 - 2 * k);
        this.char.animate(dt, 0);
        this.placeChar(this.foot.x + (sx - this.foot.x) * e, this.foot.y + (sy - this.foot.y) * e, this.foot.z + (sz - this.foot.z) * e, this.foot.yaw + (((v.yaw - this.foot.yaw + 540) % 360) - 180) * e);
        if (k >= 1) {
          a.stage = 3; a.t = 0;
          v.model.body.add(this.char.root); this.char.root.position.set(v.model.headX, v.model.seatY - 0.95, v.model.headZ); this.char.root.rotation.set(0, 0, 0);
        }
      } else { // close the door
        this.char.animate(dt, 0);
        v.doorOpen = door ? Math.max(0, 1 - a.t / 0.3) : 0;
        if (a.t > 0.32) { this.anim = null; this.veh = v; this.parked = this.parked.filter(p => p !== v); this.stats.entered = true; this.char.root.visible = !this.firstPerson; }
      }
    } else {
      if (a.stage === 0) { v.v *= 0.8; v.doorOpen = door ? Math.min(1, a.t / 0.3) : 1; this.char.animate(dt, 0); if (a.t > (door ? 0.32 : 0.05)) { a.stage = 1; a.t = 0; } }
      else if (a.stage === 1) {
        const k = Math.min(1, a.t / 0.45), e = k * k * (3 - 2 * k);
        if (k > 0.5) this.char.seated = false;
        this.char.animate(dt, 0.3);
        this.placeChar(a.ax + (a.bx - a.ax) * e, a.ay + (a.by - a.ay) * e, a.az + (a.bz - a.az) * e, v.yaw + 90 * e);
        if (k >= 1) { a.stage = 2; a.t = 0; }
      } else {
        v.doorOpen = door ? Math.max(0, 1 - a.t / 0.3) : 0;
        this.char.animate(dt, 0);
        if (a.t > 0.32) {
          this.anim = null; v.occupied = false; v.v = 0; v.braking = true; this.parked.push(v); this.veh = null;
          Object.assign(this.foot, { x: a.bx, z: a.bz, y: a.by, vx: 0, vz: 0, vy: 0, yaw: v.yaw + 90, grounded: true });
          this.char.root.visible = true;
        }
      }
    }
  }

  private turnFoot(target: number, dt: number) {
    const d = ((target - this.foot.yaw + 540) % 360) - 180, max = 600 * settings.moveSensitivity * dt;
    const step = Math.max(-max, Math.min(max, d * Math.min(1, dt * 12)));
    this.foot.yaw += step; this.foot.turn = step / Math.max(dt, 1e-3);
  }

  private nearestVehicle(): Vehicle | null {
    let best: Vehicle | null = null, bd = 4.5;
    for (const v of this.parked.concat(this.traffic.agents.map(a => a.veh))) {
      const d = Math.hypot(v.x - this.foot.x, v.z - this.foot.z) - v.spec.L * 0.3;
      if (d < bd && Math.abs(v.y - this.foot.y) < 4) { bd = d; best = v; }
    }
    return best;
  }

  // ---------------------------------------------------------------- cheats
  cheat(code: string): string {
    const c = code.trim().toUpperCase().replace(/\s+/g, '');
    const v = this.veh;
    switch (c) {
      case 'HELIPUNE': case 'HELICOPTER':
        if (!v) return 'Get into a car first, then type HELIPUNE.';
        if (v.heli) return 'You are already flying!';
        v.heli = new Helicopter(v, v.spec.colors[0]);
        v.v = 0; this.audio.chime(true); this.big('HELICOPTER!', 'Space = up · Shift = down · W/S = fly · A/D = turn', '#ffd21a');
        return 'Cheat activated: your car is transforming into a helicopter.';
      case 'CARMODE': case 'LANDCAR':
        if (!v || !v.heli) return 'You are not in a helicopter.';
        if (!v.heli.landed) return 'Land first, then type CARMODE.';
        v.heli.reverting = true; return 'Transforming back into a car.';
      case 'MONSOON': this.setRain(!this.raining); return this.raining ? 'Monsoon rain started.' : 'Rain stopped.';
      case 'NIGHTRIDER': this.hour = 21.5; return 'Night time.';
      case 'SUNRISE': this.hour = 7; return 'Good morning, Pune!';
      case 'FULLTANK': if (v) { v.fuel = 1; v.health = 100; } return 'Vehicle repaired and refuelled.';
      case 'RICKSHAW': {
        const [px, pz] = this.pos(), [x, z, y] = this.world.roadPointNear(px + 6, pz + 6);
        const a = new Vehicle(SPECS.auto); a.x = x; a.z = z; a.yaw = y; a.sync(0, this.world.terrain); this.scene.add(a.model.group); this.parked.push(a);
        return 'An auto-rickshaw is waiting for you nearby.';
      }
      default: return 'Unknown code.';
    }
  }

  // ---------------------------------------------------------------- loop
  frame = () => {
    requestAnimationFrame(this.frame);
    const now = performance.now(); let dt = (now - this.last) / 1000; this.last = now;
    if (!this.running) return;
    dt = Math.min(dt, 0.05);
    this.fpsAcc += dt; this.fpsN++;
    this.input.poll();
    this.handleActions();
    if (!this.paused) this.step(dt);
    this.updateCamera(dt);
    this.updateEnv(dt);
    this.updateHud(dt);
    this.tut?.update();
    this.renderer.render(this.scene, this.camera);
  };

  private handleActions() {
    const i = this.input;
    if (i.take('pause')) this.togglePause();
    if (i.take('map')) this.openMap();
    if (i.take('missions')) this.openMissions();
    if (i.take('cheat')) this.openCheat();
    if (this.paused || this.anim) { for (const a of ['enter', 'interact', 'camera', 'reset', 'jump'] as const) i.take(a); return; }
    if (i.take('camera')) { this.firstPerson = !this.firstPerson; this.stats.camToggled = true; this.char.root.visible = !(this.firstPerson && this.veh); }
    if (i.take('enter')) { if (this.veh) this.beginExit(); else { const v = this.nearestVehicle(); if (v) this.beginEnter(v); } }
    if (i.take('reset') && this.veh && !this.veh.heli) { const [x, z, y] = this.world.roadPointNear(this.veh.x, this.veh.z); Object.assign(this.veh, { x, z, yaw: y, v: 0 }); }
    if (i.take('interact')) this.promptAction?.();
    if (i.take('jump') && !this.veh && this.foot.grounded && this.foot.windup <= 0) this.foot.windup = 0.0001;
  }

  private step(dt: number) {
    const i = this.input, w = this.world;
    this.hour = (this.hour + dt * 24 / (24 * 60)) % 24;
    this.signals.update(dt);
    if (this.anim) this.stepAnim(dt);
    else if (this.veh) {
      const v = this.veh;
      if (v.heli) this.stepHeli(v, dt);
      else {
        const r = v.yaw * D2R, slope = w.terrain.slope(v.x, v.z, Math.sin(r), Math.cos(r), 2) * Math.sign(v.v || 1);
        v.drive({ throttle: i.throttle, steer: i.steer, handbrake: i.handbrake, boost: i.boost }, dt, this.raining ? 0.78 : 1, slope * Math.sign(v.v || 1), settings.steerSensitivity);
        this.collideVehicle(v);
        if (i.horn) { this.audio.horn(v.spec.horn); this.stats.honked = true; }
        this.audio.engine(v.health > 0 && v.fuel > 0, Math.min(1, Math.abs(v.v) / v.maxV), v.spec.three ? 'auto' : v.spec.two ? 'two' : (v.spec.id === 'bus' || v.spec.id === 'truck') ? 'heavy' : 'car');
        v.sync(dt, w.terrain);
        if (v.kmh > 25) this.stats.drove = true;
      }
    } else this.stepFoot(dt);
    for (const p of this.parked) if (!p.heli) p.sync(dt, w.terrain); else p.heli.sync(dt);
    this.parked = this.parked.filter(p => { const [px, pz] = this.pos(); if (Math.hypot(p.x - px, p.z - pz) > 450) { this.scene.remove(p.model.group); p.heli?.dispose(); disposeModel(p); return false; } return true; });
    const [px, pz] = this.pos();
    const obstacles: Obstacle[] = [];
    if (this.veh && !this.veh.heli) obstacles.push({ x: this.veh.x, z: this.veh.z, r: this.veh.radius });
    else if (!this.veh) obstacles.push({ x: this.foot.x, z: this.foot.z, r: 0.4 });
    for (const p of this.parked) if (!p.heli || p.heli.landed) obstacles.push({ x: p.x, z: p.z, r: p.heli ? 5 : p.radius });
    for (const p of this.peds.peds) if (p.down <= 0) obstacles.push({ x: p.x, z: p.z, r: 0.4 });
    const cy = this.cam.heading * D2R;
    this.traffic.update(dt, px, pz, Math.sin(cy), Math.cos(cy), obstacles, false, v => { if (Math.hypot(v.x - px, v.z - pz) < 60) this.audio.horn(v.spec.horn, 0.05); });
    const movers = this.traffic.agents.map(a => a.veh); if (this.veh && !this.veh.heli) movers.push(this.veh);
    this.peds.update(dt, px, pz, movers, () => { this.toast('Careful – you knocked a pedestrian over!', '#ff7a6a'); this.cam.shake = 0.6; }, this.veh);
    w.update(px, pz);
    this.gps.update(dt, px, pz, !!this.veh && !this.veh.heli);
    this.missions.update(dt);
    this.updateInteractions(px, pz);
    this.waterT -= dt;
    if (this.waterT <= 0 && !(this.veh && this.veh.heli)) {
      this.waterT = 0.4;
      if (w.isWater(px, pz)) {
        const [x, z, y] = w.roadPointNear(px, pz);
        if (this.veh) { Object.assign(this.veh, { x, z, yaw: y, v: 0 }); this.veh.health = Math.max(0, this.veh.health - 25); } else { this.foot.x = x; this.foot.z = z; }
        this.toast('Splash! You ended up in the river. Use the bridges (or a helicopter!).', '#8cc8ff'); this.audio.thump(8);
      }
    }
    this.landT -= dt;
    if (this.landT <= 0) {
      this.landT = 1;
      for (const l of w.idx.landmarks) if (!this.seen.has(l.name) && Math.hypot(l.x - px, l.z - pz) < 70) { this.seen.add(l.name); this.toast('Landmark discovered: ' + l.name, '#8cc8ff'); this.save(); }
      if (this.hostel && !this.hostelReached && Math.hypot(this.hostel.x - px, this.hostel.z - pz) < 60) {
        this.hostelReached = true; this.big('RATHI MAHESHWARI HOSTEL', 'Seth Shri G. B. Rathi Maheshwari Hostel · Bibwewadi–Kondhwa, Pune', '#ffd21a');
        if (this.gps.target && this.gps.target.label.startsWith('Rathi')) this.gps.clear();
      }
    }
  }

  private stepFoot(dt: number) {
    const i = this.input, f = this.foot, w = this.world, ms = settings.moveSensitivity;
    // camera-relative analog movement: walk / jog by stick deflection, sprint with Shift / SPRINT
    const mag = Math.min(1, Math.hypot(i.steer, i.throttle)), yaw = this.cam.heading * D2R;
    const top = i.boost ? 6.4 : mag < 0.55 ? 1.7 : 1.7 + (mag - 0.55) / 0.45 * 1.9;
    const target = mag < 0.08 ? 0 : top;
    let tx = 0, tz = 0;
    if (target > 0) {
      const ix = i.steer / (mag || 1), iz = i.throttle / (mag || 1);
      tx = (Math.sin(yaw) * iz + Math.cos(yaw) * ix) * target; tz = (Math.cos(yaw) * iz - Math.sin(yaw) * ix) * target;
    }
    const accel = (f.grounded ? 10 : 2.5) * ms, decel = (f.grounded ? 13 : 2) * ms;
    const dvx = tx - f.vx, dvz = tz - f.vz, dl = Math.hypot(dvx, dvz), lim = (target > Math.hypot(f.vx, f.vz) ? accel : decel) * dt;
    if (dl > 0) { const k = Math.min(1, lim / dl); f.vx += dvx * k; f.vz += dvz * k; }
    const sp = Math.hypot(f.vx, f.vz);
    f.accel = (sp - f.speed) / Math.max(dt, 1e-3); f.speed = sp;
    if (sp > 0.25) this.turnFoot(Math.atan2(f.vx, f.vz) / D2R, dt); else f.turn *= 0.8;
    f.x += f.vx * dt; f.z += f.vz * dt;
    const hit = w.collide(f.x, f.z, 0.35, f.y); if (hit) { f.x = hit.x; f.z = hit.z; const d = f.vx * hit.nx + f.vz * hit.nz; if (d < 0) { f.vx -= d * hit.nx; f.vz -= d * hit.nz; } }
    // jump: short wind-up crouch, then launch
    if (f.windup > 0) { f.windup += dt; if (f.windup > 0.13) { f.windup = 0; f.vy = 5.2; f.grounded = false; this.stats.jumped = true; } }
    const ground = w.h(f.x, f.z);
    if (!f.grounded || f.vy > 0) { f.vy -= 15 * dt; f.y += f.vy * dt; if (f.y <= ground) { this.char.land(-f.vy); f.y = ground; f.vy = 0; f.grounded = true; } }
    else f.y += (ground - f.y) * Math.min(1, dt * 20);
    if (sp > 5) this.stats.sprinted = true;
    this.stats.moved += sp * dt;
    this.char.animate(dt, sp, f.accel, f.turn, f.grounded, f.vy, f.windup > 0 ? Math.min(1, f.windup / 0.13) : 0);
    this.placeChar(f.x, f.y, f.z, f.yaw);
    this.audio.engine(false, 0, 'car');
  }

  private stepHeli(v: Vehicle, dt: number) {
    const h = v.heli!, i = this.input, w = this.world;
    if (h.morph < 1 && !h.reverting) { h.morphStep(dt); v.sync(dt, w.terrain); if (h.morph >= 1) { h.landed = true; v.y = Math.max(v.y, w.h(v.x, v.z)); } this.audio.engine(true, h.morph * 0.4, 'heli'); return; }
    if (h.reverting) {
      const done = h.morphStep(dt); h.sync(dt);
      if (done) { h.dispose(); v.heli = null; v.v = 0; this.toast('Back on four wheels.'); }
      return;
    }
    const impact = h.fly({ forward: i.throttle, turn: i.steer, up: i.handbrake, down: i.down, boost: i.boost && false }, dt,
      (x, z) => Math.max(w.h(x, z), w.roofAt(x, z)), (x, z, r, y) => w.collide(x, z, r, y), settings.steerSensitivity);
    if (impact > 6) { v.health = Math.max(0, v.health - impact); this.audio.thump(impact); this.cam.shake = Math.min(1, impact / 15); }
    if (!h.landed) this.stats.flew = true;
    h.sync(dt);
    this.audio.engine(true, 0.35 + h.rpm * 0.5, 'heli');
  }

  private collideVehicle(v: Vehicle) {
    const [fx, fz] = v.forward(), off = Math.max(0, v.spec.L / 2 - v.radius);
    for (const s of [off, -off, 0]) {
      const cx = v.x + fx * s, cz = v.z + fz * s;
      const hit = this.world.collide(cx, cz, v.radius, v.y + 0.5);
      if (!hit) continue;
      v.x += hit.x - cx; v.z += hit.z - cz;
      const impact = Math.abs(v.v) * Math.abs(fx * hit.nx + fz * hit.nz);
      if (impact > 2) { v.health = Math.max(0, v.health - (impact - 2) * 3.5); this.audio.thump(impact); this.cam.shake = Math.min(1, impact / 12); }
      v.v *= impact > 3 ? -0.25 : 0.92;
    }
    for (const o of this.traffic.agents.map(a => a.veh).concat(this.parked)) {
      if (o === v || o.heli) continue;
      const dx = v.x - o.x, dz = v.z - o.z, d = Math.hypot(dx, dz), min = v.radius + o.radius + 0.4;
      if (d >= min || d < 1e-3) continue;
      const nx = dx / d, nz = dz / d; v.x += nx * (min - d); v.z += nz * (min - d);
      const rel = Math.abs(v.v - o.v);
      const a = this.traffic.agents.find(x => x.veh === o);
      if (rel > 3) { if (a) a.knocked = 5; v.health = Math.max(0, v.health - rel * 1.2); this.audio.thump(rel); this.cam.shake = Math.min(1, rel / 12); }
      v.v *= 0.6;
    }
    const idx = this.world.idx, m = 30;
    v.x = Math.max(idx.minX - m, Math.min(idx.maxX + m, v.x)); v.z = Math.max(idx.minZ - m, Math.min(idx.maxZ + m, v.z));
  }

  private updateInteractions(px: number, pz: number) {
    this.prompt = ''; this.promptAction = null;
    if (this.anim) return;
    const ms = this.missions;
    if (!ms.active && this.missionMode) for (const mk of this.markers) {
      if (Math.hypot(mk.x - px, mk.z - pz) < 9) {
        const why = ms.canStart(mk.m);
        this.prompt = why ? mk.m.title + ' – ' + why : 'Press F to start: ' + mk.m.title;
        if (!why) this.promptAction = () => ms.start(mk.m);
        return;
      }
    }
    if (this.veh) {
      const v = this.veh;
      if (v.heli) { if (v.heli.landed && v.heli.morph >= 1) this.prompt = 'Landed – press E to get out, or cheat CARMODE to turn back into a car'; return; }
      if (Math.abs(v.v) < 2 && v.fuel < 0.97) {
        const fuel = this.world.idx.pois.find(p => p.kind === 'fuel' && Math.hypot(p.x - px, p.z - pz) < 22);
        if (fuel) {
          const cost = Math.ceil((1 - v.fuel) * 35 * 105);
          this.prompt = 'Press F to fill up at ' + (fuel.name || 'the petrol pump') + ' (₹' + cost.toLocaleString('en-IN') + ')';
          this.promptAction = () => { if (this.money < cost) { this.toast('Not enough money'); return; } v.fuel = 1; this.earn(-cost, 'Fuel'); };
          return;
        }
      }
      if (v.fuel <= 0) { this.prompt = 'Out of fuel! Press F for roadside delivery (₹300)'; this.promptAction = () => { v.fuel = 0.2; this.earn(-300, 'Roadside fuel'); }; return; }
      if (v.health <= 0) { this.prompt = 'Vehicle wrecked – press E to get out'; return; }
    } else {
      const nv = this.nearestVehicle();
      if (nv) { this.prompt = (isTouch ? 'Tap E' : 'Press E') + ' to get into the ' + (nv.heli ? 'helicopter' : nv.spec.name); return; }
      for (const arr of this.world.vendors.values()) for (let k = 0; k < arr.length; k += 2) {
        if (Math.hypot(arr[k] - px, arr[k + 1] - pz) < 4) {
          const snack = ['vada pav', 'cutting chai', 'misal pav', 'poha', 'bhel'][Math.abs(Math.round(arr[k] * 7 + arr[k + 1] * 13)) % 5];
          this.prompt = 'Press F to buy ' + snack + ' (₹25)';
          this.promptAction = () => this.earn(-25, snack + ' – delicious!');
          return;
        }
      }
    }
  }

  night() { const a = Math.sin((this.hour - 6) / 12 * Math.PI); return Math.max(0, Math.min(1, (0.08 - a) / 0.2)); }

  private updateCamera(dt: number) {
    const [lx, ly] = this.input.consumeLook();
    this.cam.look(lx, ly);
    if (Math.abs(lx) > 0) this.stats.camTurn += Math.abs(lx * settings.cameraSensitivity * 0.18);
    const [gy, gp] = this.gyro.take(); this.cam.gyro(gy, gp);
    let t: CamTarget;
    const v = this.veh;
    if (v && !this.anim) {
      const fp = this.firstPerson ? (() => { const p = v.model.body.localToWorld(new THREE.Vector3(v.model.headX, v.heli ? 2.2 : v.model.headY, v.heli ? -1.2 : v.model.headZ)); return { x: p.x, y: p.y + 0.05, z: -p.z }; })() : undefined;
      t = v.heli ? { x: v.x, y: v.y, z: v.z, heading: v.yaw, speed: Math.abs(v.heli.fwd), dist: 17, height: 3.2, firstPerson: fp }
        : { x: v.x, y: v.y, z: v.z, heading: v.yaw, speed: Math.abs(v.v), dist: 3 + v.spec.L * 0.85, height: v.spec.H * 0.75 + 0.5, firstPerson: fp };
      this.camera.fov += ((this.firstPerson ? 70 : 62) + Math.min(1, v.kmh / 140) * 14 - this.camera.fov) * Math.min(1, dt * 3);
    } else {
      const f = this.foot, p = this.anim ? this.char.root.position : null;
      const x = p ? p.x : f.x, y = p ? p.y : f.y, z = p ? -p.z : f.z;
      t = { x, y, z, heading: f.yaw, speed: f.speed, dist: 4.3, height: 1.55, firstPerson: this.firstPerson ? { x: x + Math.sin(f.yaw * D2R) * 0.15, y: y + 1.66, z: z + Math.cos(f.yaw * D2R) * 0.15 } : undefined };
      this.camera.fov += ((this.firstPerson ? 70 : 62) - this.camera.fov) * Math.min(1, dt * 3);
    }
    this.char.root.visible = !(this.firstPerson && (this.veh || !this.anim));
    this.cam.update(dt, t, (ax, ay, az, bx, by, bz) => this.world.rayFree(ax, ay, az, bx, by, bz));
    this.camera.updateProjectionMatrix();
  }

  private updateEnv(dt: number) {
    if (!this.world?.idx) return;
    const [px, pz] = this.pos(), cpos = this.camera.position;
    this.sky.position.copy(cpos);
    if (this.hostel && this.hostelLabel) { // big floating name from afar; fades out close up where the rooftop sign is readable
      const d = Math.hypot(this.hostel.x - cpos.x, this.hostel.z + cpos.z), f = Math.max(0, Math.min(1, (d - 120) / 200));
      (this.hostelLabel.material as THREE.SpriteMaterial).opacity = f; this.hostelLabel.visible = f > 0.02;
      const s = 20 + Math.min(1, d / 1500) * 36; this.hostelLabel.scale.set(s, s / 4, 1);
      (this.hostelBeam!.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.16 * f;
    }
    const alt = Math.sin((this.hour - 6) / 12 * Math.PI), ang = (this.hour - 6) / 12 * Math.PI, night = this.night();
    const sd = new THREE.Vector3(-Math.cos(ang) * 0.9, Math.max(0.15, Math.sin(ang)), 0.35).normalize();
    const gy = this.veh ? this.veh.y : this.foot.y;
    this.sun.position.set(px + sd.x * 200, gy + sd.y * 200, -pz + sd.z * 200); this.sun.target.position.set(px, gy, -pz);
    const dusk = Math.max(0, 1 - Math.abs(alt) / 0.3), wet = this.raining ? 1 : 0;
    // at night the directional light becomes a pale-blue moon so the city stays readable
    this.sun.intensity = Math.PI * (night > 0.5 ? 0.32 : Math.max(0.05, Math.min(0.95, alt * 1.4 + 0.1))) * (1 - wet * 0.45);
    if (night > 0.5) this.sun.color.setRGB(0.62, 0.7, 0.95); else this.sun.color.setRGB(1, 0.95 - dusk * 0.35, 0.85 - dusk * 0.5);
    this.hemi.intensity = Math.PI * (0.62 - night * 0.3) * (1 - wet * 0.15);
    this.hemi.color.setRGB(0.81 - night * 0.35, 0.88 - night * 0.3, 1);
    const day = new THREE.Color(0.62, 0.74, 0.88).lerp(new THREE.Color(0.55, 0.58, 0.62), wet), duskC = new THREE.Color(0.95, 0.58, 0.38), nightC = new THREE.Color(0.07, 0.09, 0.16);
    const horizon = day.clone().lerp(duskC, dusk * 0.7 * (1 - wet)).lerp(nightC, night);
    const top = new THREE.Color(0.25, 0.47, 0.85).lerp(new THREE.Color(0.42, 0.45, 0.5), wet).lerp(new THREE.Color(0.25, 0.3, 0.55), dusk * 0.5).lerp(new THREE.Color(0.01, 0.02, 0.05), night);
    this.paintSkyThrottled(top, horizon);
    this.scene.background = horizon; (this.scene.fog as THREE.Fog).color.copy(horizon);
    const fog = this.scene.fog as THREE.Fog, high = this.quality === 'high';
    fog.far = (high ? 1100 : 650) * (1 - wet * 0.45); fog.near = (high ? 320 : 200) * (1 - wet * 0.5);
    (this.world.mats.lamps as THREE.MeshBasicMaterial).color.setRGB(0.5 + night * 0.5, 0.48 + night * 0.4, 0.42 + night * 0.2);
    (this.world.mats.road as THREE.MeshLambertMaterial).color.setScalar(1 - wet * 0.3);
    // headlight at night (high quality only)
    const v = this.veh;
    if (high && v && !v.heli && night > 0.5) {
      if (!this.headlight) { this.headlight = new THREE.SpotLight(0xfff2d0, 60, 70, 0.55, 0.5, 1); this.scene.add(this.headlight, this.headlight.target); }
      const [fx, fz] = v.forward();
      this.headlight.position.set(v.x + fx * 2, v.y + 1.0, -(v.z + fz * 2)); this.headlight.target.position.set(v.x + fx * 25, v.y, -(v.z + fz * 25)); this.headlight.visible = true;
    } else if (this.headlight) this.headlight.visible = false;
    if (this.rain) {
      const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute, a = pos.array as Float32Array, n = a.length / 6;
      for (let k = 0; k < n; k++) {
        let y = a[k * 6 + 1] - 28 * dt;
        if (y < cpos.y - 15) { a[k * 6] = cpos.x + (Math.random() - 0.5) * 70; a[k * 6 + 2] = cpos.z + (Math.random() - 0.5) * 70; y = cpos.y + 20 + Math.random() * 10; }
        a[k * 6 + 1] = y; a[k * 6 + 3] = a[k * 6] + 0.05; a[k * 6 + 4] = y + 0.7; a[k * 6 + 5] = a[k * 6 + 2];
      }
      pos.needsUpdate = true;
    }
  }
  private skyT = 0;
  private paintSkyThrottled(top: THREE.Color, horizon: THREE.Color) { if ((this.skyT -= 1) <= 0) { this.skyT = 20; this.paintSky(top, horizon); } }

  setRain(on: boolean) {
    this.raining = on;
    if (on && !this.rain) {
      const n = this.quality === 'high' ? 3500 : 1400, a = new Float32Array(n * 6), c = this.camera.position;
      for (let k = 0; k < n; k++) { const x = c.x + (Math.random() - 0.5) * 70, y = c.y + Math.random() * 35 - 15, z = c.z + (Math.random() - 0.5) * 70; a.set([x, y, z, x, y + 0.7, z], k * 6); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d4e2, transparent: true, opacity: 0.55 }));
      this.rain.frustumCulled = false; this.scene.add(this.rain);
    } else if (!on && this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain = null; }
  }

  private updateHud(dt: number) {
    const now = performance.now();
    for (const t of this.toasts) if (now > t.until) t.el.remove();
    this.toasts = this.toasts.filter(t => now <= t.until);
    if (now > this.bigUntil) $('big').classList.add('hidden');
    if (now > this.sayUntil) $('dialog').classList.add('hidden');
    this.drawMinimap();
    this.hudT -= dt; if (this.hudT > 0) return; this.hudT = 0.1;
    const [px, pz] = this.pos();
    $('money').textContent = '₹' + this.money.toLocaleString('en-IN');
    const hh = Math.floor(this.hour), mi = Math.floor((this.hour - hh) * 60);
    $('clock').textContent = String(hh).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + (this.raining ? '  ☔ rain' : '');
    const v = this.veh;
    const alt = v && v.heli ? Math.round(v.y - this.world.h(v.x, v.z)) : 0;
    $('streetName').textContent = v && v.heli ? 'Flying · ' + alt + ' m above ground' : (this.world.streetName(px, pz) || '–');
    { const zn = this.world.zoneName(px, pz); $('zoneName').textContent = (zn && zn !== 'Pune' ? zn + ', ' : '') + 'Pune · ' + Math.round(this.world.terrain.asl(px, pz)) + ' m elevation'; }
    $('speedo').classList.toggle('hidden', !v);
    if (v) {
      $('spd').textContent = String(Math.round(v.heli ? Math.abs(v.heli.fwd) * 3.6 : v.kmh));
      ($('fuel') as HTMLElement).style.width = Math.round(v.fuel * 100) + '%';
      ($('hp') as HTMLElement).style.width = Math.round(v.health) + '%';
      ($('hp') as HTMLElement).style.background = v.health < 35 ? '#ff5a4d' : '#5cd66a';
      $('vname').textContent = (v.heli ? 'Helicopter (cheat)' : v.spec.name) + '  ·  ' + v.plate;
    }
    // context-sensitive touch labels
    $('bBrake').textContent = !v ? 'JUMP' : v.heli ? 'UP ↑' : 'BRAKE';
    $('bBoost').textContent = !v ? 'SPRINT' : v.heli ? 'DOWN ↓' : 'BOOST';
    const ms = this.missions;
    $('objective').classList.toggle('hidden', !ms.active);
    if (ms.active) {
      $('objTitle').textContent = ms.active.title.toUpperCase(); $('objText').textContent = ms.objective;
      $('objTimer').textContent = ms.timerOn ? Math.floor(ms.timeLeft / 60) + ':' + String(Math.floor(ms.timeLeft % 60)).padStart(2, '0') : '';
    }
    const g = this.gps;
    $('gps').classList.toggle('hidden', !g.target || !g.instruction);
    if (g.target) {
      $('gpsText').textContent = v && v.heli ? 'Fly to ' + g.target.label : g.instruction; $('gpsDist').textContent = fmtDist(v && v.heli ? Math.hypot(g.target.x - px, g.target.z - pz) : g.remaining);
      ($('gpsArrow') as HTMLElement).style.transform = 'rotate(' + (g.turn === 1 ? 90 : g.turn === -1 ? -90 : 0) + 'deg)';
      $('gpsArrow').innerHTML = g.turn === 2 ? '&#x25C9;' : '&#x2191;';
    }
    const pr = $('prompt'); pr.classList.toggle('hidden', !this.prompt); pr.textContent = this.prompt;
    if (this.fpsAcc > 1) { $('fps').textContent = Math.round(this.fpsN / this.fpsAcc) + ' fps'; this.fpsAcc = 0; this.fpsN = 0; }
  }

  private drawMinimap() {
    const c = $('miniCanvas') as HTMLCanvasElement, g = c.getContext('2d')!, S = c.width, m = this.map;
    if (!m) return;
    const [px, pz] = this.pos(), spd = this.veh ? (this.veh.heli ? Math.abs(this.veh.heli.fwd) * 3.6 : this.veh.kmh) : 0;
    const view = this.veh ? (this.veh.heli ? 900 : 300 + Math.min(1, spd / 100) * 300) : 200, scale = S / view * m.mpp, heading = this.cam.heading;
    g.save(); g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2); g.rotate(-heading * D2R);
    const [cx, cy] = m.px(px, pz);
    g.drawImage(m.canvas, -cx * scale, -cy * scale, m.size * scale, m.size * scale);
    const P = (x: number, z: number) => { const [qx, qy] = m.px(x, z); return [(qx - cx) * scale, (qy - cy) * scale]; };
    if (this.gps.target && this.gps.route.length > 1) {
      g.strokeStyle = '#9b40f0'; g.lineWidth = 4; g.beginPath();
      this.gps.route.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    }
    const dot = (x: number, z: number, col: string, r: number, clamp = false) => {
      let [a, b] = P(x, z); const d = Math.hypot(a, b), lim = S / 2 - 8;
      if (d > lim) { if (!clamp) return; a = a / d * lim; b = b / d * lim; }
      g.fillStyle = col; g.beginPath(); g.arc(a, b, r, 0, 7); g.fill();
    };
    for (const p of this.world.idx.pois) if (p.kind === 'fuel') dot(p.x, p.z, '#1a9a35', 4);
    for (const l of this.world.idx.landmarks) dot(l.x, l.z, '#2f62e8', 4);
    if (!this.missions.active) for (const mk of this.markers) dot(mk.x, mk.z, '#ffc81a', 6);
    if (this.hostel) { dot(this.hostel.x, this.hostel.z, '#000', 8, true); dot(this.hostel.x, this.hostel.z, '#ffd21a', 6, true); }
    if (this.gps.target) dot(this.gps.target.x, this.gps.target.z, '#a040f0', 6, true);
    g.restore();
    const hy = (this.veh ? this.veh.yaw : this.foot.yaw) - heading;
    g.save(); g.translate(S / 2, S / 2); g.rotate(hy * D2R);
    g.fillStyle = '#1e5bff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  // ---------------------------------------------------------------- overlays
  setPaused(p: boolean) { this.paused = p; if (p) document.exitPointerLock?.(); }
  togglePause(force?: boolean) {
    this.setPaused(force ?? !this.paused);
    $('pause').classList.toggle('hidden', !this.paused);
    $('abortBtn').classList.toggle('hidden', !this.missions?.active);
    if (!this.paused) for (const id of ['missions', 'mapView', 'cheat', 'settingsView']) $(id).classList.add('hidden');
  }
  closeOverlays() { this.setPaused(false); this.input.typing = false; for (const id of ['pause', 'missions', 'mapView', 'cheat', 'settingsView']) $(id).classList.add('hidden'); }

  navigateHostel() {
    if (!this.hostel) { this.toast('Hostel location unavailable'); return; }
    const [px, pz] = this.pos();
    this.gps.set(this.hostel.x, this.hostel.z, 'Rathi Maheshwari Hostel', px, pz, !!this.veh && !this.veh.heli);
    this.hostelReached = false;
    this.toast('GPS set: Rathi Maheshwari Hostel – ' + fmtDist(this.gps.remaining || Math.hypot(this.hostel.x - px, this.hostel.z - pz)), '#ffd24d');
  }

  async fastTravel(x: number, z: number, label: string) {
    this.closeOverlays(); this.setPaused(true); this.toast('Travelling to ' + label + '...', '#ffd24d');
    const [rx, rz, ry] = this.world.roadPointNear(x, z);
    await this.world.preload(rx, rz, 260);
    if (this.veh) { Object.assign(this.veh, { x: rx, z: rz, yaw: ry, v: 0 }); if (this.veh.heli) { this.veh.y = this.world.h(rx, rz) + 40; this.veh.heli.landed = false; } else this.veh.y = this.world.h(rx, rz); }
    else Object.assign(this.foot, { x: rx, z: rz, y: this.world.h(rx, rz), vx: 0, vz: 0 });
    this.cam.snapBehind(ry); this.setPaused(false);
  }

  openCheat() {
    this.setPaused(true); this.stats.cheatOpened = true;
    $('cheat').classList.remove('hidden'); $('cheatMsg').textContent = '';
    const inp = $<HTMLInputElement>('cheatInput'); inp.value = ''; this.input.typing = true;
    setTimeout(() => inp.focus(), 50);
  }

  openSettings() {
    this.setPaused(true); this.stats.settingsOpened = true;
    $('pause').classList.add('hidden'); $('settingsView').classList.remove('hidden');
  }

  openMissions() {
    this.setPaused(true); $('pause').classList.add('hidden');
    const list = $('missionList'); list.innerHTML = '';
    for (const m of this.missions.all) {
      const row = document.createElement('div'); row.className = 'mrow';
      const why = this.missions.canStart(m);
      row.innerHTML = `<div class="t"><b>${m.title}</b><small>${m.category} · start: ${m.startLabel}${m.reward ? ' · ₹' + m.reward.toLocaleString('en-IN') : ''}</small><small>${m.brief}</small>${why ? `<small style="color:#ff8a7a">${why}</small>` : ''}</div>`;
      const gps = document.createElement('button'); gps.className = 'btn'; gps.textContent = 'GPS';
      gps.onclick = () => { const [px, pz] = this.pos(); this.gps.set(m.x, m.z, m.title, px, pz, !!this.veh); this.closeOverlays(); };
      const go = document.createElement('button'); go.className = 'btn primary'; go.textContent = 'Start'; go.disabled = !!why; if (why) go.style.opacity = '0.4';
      go.onclick = () => { this.closeOverlays(); this.missions.start(m); };
      row.append(gps, go); list.appendChild(row);
    }
    $('missions').classList.remove('hidden');
  }

  openMap() {
    this.setPaused(true); this.stats.mapOpened = true;
    $('pause').classList.add('hidden'); $('mapView').classList.remove('hidden');
    const cv = $('mapCanvas') as HTMLCanvasElement, m = this.map;
    let [cx, cy] = m.px(...this.pos()), zoom = Math.max(innerWidth, innerHeight) / 1100;
    const draw = () => {
      if ($('mapView').classList.contains('hidden')) return;
      const dpr = Math.min(devicePixelRatio || 1, 2); if (cv.width !== innerWidth * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
      const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0b1020'; g.fillRect(0, 0, innerWidth, innerHeight);
      g.save(); g.translate(innerWidth / 2, innerHeight / 2); g.scale(zoom, zoom); g.translate(-cx, -cy);
      g.drawImage(m.canvas, 0, 0);
      if (this.gps.target) { g.strokeStyle = '#9b40f0'; g.lineWidth = 4 / zoom; g.beginPath(); this.gps.route.forEach(([x, z], i) => { const [a, b] = m.px(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
      for (const p of this.world.idx.pois) if (p.kind === 'fuel') { const [a, b] = m.px(p.x, p.z); g.fillStyle = '#1a9a35'; g.beginPath(); g.arc(a, b, 4 / zoom, 0, 7); g.fill(); }
      for (const mk of this.markers) { const [a, b] = m.px(mk.x, mk.z); g.fillStyle = '#ffc81a'; g.beginPath(); g.arc(a, b, 7 / zoom, 0, 7); g.fill(); }
      g.font = `bold ${13 / zoom}px system-ui, sans-serif`;
      for (const l of this.world.idx.landmarks) {
        if (l.kind === 'hostel') continue;
        const [a, b] = m.px(l.x, l.z), hill = /Hill|Tekdi|Parvati/.test(l.name);
        g.fillStyle = hill ? '#1d5e1d' : '#2f62e8'; g.beginPath(); g.arc(a, b, 5 / zoom, 0, 7); g.fill();
        g.fillStyle = hill ? '#1d5e1d' : '#152a6a'; g.font = `bold ${(hill ? 16 : 13) / zoom}px system-ui, sans-serif`; g.fillText((hill ? '▲ ' : '') + l.name, a + 7 / zoom, b - 5 / zoom);
      }
      if (this.hostel) { // highlighted landmark
        const [a, b] = m.px(this.hostel.x, this.hostel.z), r = 11 / zoom;
        g.fillStyle = '#ffd21a'; g.strokeStyle = '#7a1414'; g.lineWidth = 3 / zoom; g.beginPath();
        for (let k = 0; k < 10; k++) { const ang = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; g.lineTo(a + Math.cos(ang) * rr, b + Math.sin(ang) * rr); }
        g.closePath(); g.fill(); g.stroke();
        g.font = `900 ${17 / zoom}px system-ui, sans-serif`; g.lineWidth = 4 / zoom; g.strokeStyle = '#fff'; g.strokeText('RATHI MAHESHWARI HOSTEL', a + 14 / zoom, b + 6 / zoom); g.fillStyle = '#7a1414'; g.fillText('RATHI MAHESHWARI HOSTEL', a + 14 / zoom, b + 6 / zoom);
      }
      const [qx, qy] = m.px(...this.pos());
      g.save(); g.translate(qx, qy); g.rotate((this.veh ? this.veh.yaw : this.foot.yaw) * D2R); g.scale(1 / zoom, 1 / zoom);
      g.fillStyle = '#1e5bff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -12); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.fill(); g.stroke(); g.restore();
      if (this.gps.target) { const [a, b] = m.px(this.gps.target.x, this.gps.target.z); g.fillStyle = '#a040f0'; g.beginPath(); g.arc(a, b, 8 / zoom, 0, 7); g.fill(); }
      g.restore();
      requestAnimationFrame(draw); // live: shows the player's position in real time
    };
    const toWorld = (sx: number, sy: number): [number, number] => {
      const mx = (sx - innerWidth / 2) / zoom + cx, my = (sy - innerHeight / 2) / zoom + cy;
      return [m.idx.minX + mx * m.mpp, m.idx.minZ + (m.size - my) * m.mpp];
    };
    const ptrs = new Map<number, { x: number; y: number }>(); let moved = 0, pinch0 = 0, zoom0 = zoom;
    cv.onpointerdown = e => { try { cv.setPointerCapture(e.pointerId); } catch { /* */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; } };
    cv.onpointermove = e => {
      const p = ptrs.get(e.pointerId);
      const [wx, wz] = toWorld(e.clientX, e.clientY);
      $('mapInfo').textContent = (this.world.streetName(wx, wz) || '–') + ' · ' + this.world.zoneName(wx, wz) + ' · ' + Math.round(this.world.terrain.asl(wx, wz)) + ' m';
      if (!p) return;
      if (ptrs.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...ptrs.values()]; zoom = Math.max(0.25, Math.min(8, zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / (pinch0 || 1))); moved += 10; }
      else { const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy); cx -= dx / zoom; cy -= dy / zoom; p.x = e.clientX; p.y = e.clientY; }
    };
    cv.onpointerup = e => {
      ptrs.delete(e.pointerId);
      if (moved >= 8) return;
      const [wx, wz] = toWorld(e.clientX, e.clientY);
      let label = this.world.streetName(wx, wz) || 'Waypoint', tx = wx, tz = wz;
      const near = (x: number, z: number) => { const [a, b] = m.px(x, z); return Math.hypot((a - cx) * zoom + innerWidth / 2 - e.clientX, (b - cy) * zoom + innerHeight / 2 - e.clientY) < 20; };
      for (const l of this.world.idx.landmarks) if (near(l.x, l.z)) { label = l.name; tx = l.x; tz = l.z; }
      if (this.hostel && near(this.hostel.x, this.hostel.z)) { label = 'Rathi Maheshwari Hostel'; tx = this.hostel.x; tz = this.hostel.z; }
      const [px2, pz2] = this.pos(); this.gps.set(tx, tz, label, px2, pz2, !!this.veh && !this.veh.heli);
      $('mapInfo').textContent = 'GPS set: ' + label + ' (' + fmtDist(this.gps.remaining || Math.hypot(tx - px2, tz - pz2)) + ')';
    };
    cv.onwheel = e => { zoom = Math.max(0.25, Math.min(8, zoom * (e.deltaY > 0 ? 0.87 : 1.15))); e.preventDefault(); };
    $('mapHostel').onclick = () => { this.navigateHostel(); if (this.hostel) [cx, cy] = m.px(this.hostel.x, this.hostel.z); };
    $('mapTravel').onclick = () => { if (this.hostel) this.fastTravel(this.hostel.x, this.hostel.z, 'Rathi Maheshwari Hostel'); };
    $('mapMe').onclick = () => { [cx, cy] = m.px(...this.pos()); };
    $('mapInfo').textContent = 'Tap any street or landmark to set your GPS route';
    requestAnimationFrame(draw);
  }

  startTutorial() {
    const st = this.stats, pos0 = () => st.moved;
    void pos0;
    const steps: TutStep[] = [
      { title: 'Welcome to Shehar – Pune', text: 'A quick tour of the controls, one at a time. You can skip it any time and replay it from Settings.' },
      { title: 'Walk and run', text: 'Use W A S D (or arrow keys) to walk. Movement is relative to the camera.', touchText: 'Put your LEFT thumb anywhere on the left half of the screen and slide it to walk. Push further to run.', keys: ['W', 'A', 'S', 'D'], touchKeys: ['Left thumb'], touchHighlight: ['#joyZone'], done: () => st.moved > 6 },
      { title: 'Look around', text: 'Click the game once to capture the mouse, then move the mouse to rotate the camera around you. Press Esc to release it.', touchText: 'Drag on the RIGHT side of the screen to rotate the camera. (Phones can also use the gyroscope – enable it in Settings.)', keys: ['Mouse'], touchKeys: ['Right side drag'], touchHighlight: ['#lookZone'], done: () => st.camTurn > 80 },
      { title: 'Sprint', text: 'Hold Shift while moving to sprint.', touchText: 'Hold SPRINT while moving to run fast.', keys: ['Shift'], touchKeys: ['SPRINT'], touchHighlight: ['#bBoost'], done: () => st.sprinted },
      { title: 'Jump', text: 'Press Space to jump.', touchText: 'Tap JUMP to jump.', keys: ['Space'], touchKeys: ['JUMP'], touchHighlight: ['#bBrake'], done: () => st.jumped },
      { title: 'Camera view', text: 'Press C to switch between third-person and first-person view.', touchText: 'Tap CAM to switch between third-person and first-person view.', keys: ['C'], touchKeys: ['CAM'], touchHighlight: ['#bCam'], done: () => st.camToggled },
      { title: 'Get into a car', text: 'Walk up to the red car and press E. Your character walks to the driver’s door (right side – India is right-hand drive), opens it and gets in. You can take any car, auto-rickshaw or bike on the road the same way.', touchText: 'Walk to the red car and tap E. You can take any vehicle on the road the same way.', keys: ['E'], touchKeys: ['E'], touchHighlight: ['#bEnter'], done: () => st.entered },
      { title: 'Drive', text: 'W accelerates, S brakes and reverses, A / D steer. Space is the handbrake for sharp turns, Shift boosts. India drives on the LEFT.', touchText: 'Left thumb: push up to accelerate, pull down to brake / reverse, left-right to steer. BRAKE = handbrake, BOOST = boost.', keys: ['W', 'S', 'A', 'D', 'Space', 'Shift'], touchKeys: ['Left thumb', 'BRAKE', 'BOOST'], touchHighlight: ['#joyZone', '#bBrake', '#bBoost'], done: () => st.drove },
      { title: 'Horn, reset and exit', text: 'H honks (very Pune). R puts the car back on the road if you get stuck. E gets you out.', touchText: 'HORN honks, RESET puts the car back on the road, E gets you out.', keys: ['H', 'R', 'E'], touchKeys: ['HORN', 'RESET', 'E'], touchHighlight: ['#bHorn', '#bReset', '#bEnter'], done: () => st.honked },
      { title: 'Map and navigation', text: 'Press M to open the map: drag to pan, scroll to zoom, click a street or landmark to set the GPS. The \u{1F3E0} Hostel button navigates to Rathi Maheshwari Hostel.', touchText: 'Tap MAP: drag to pan, pinch to zoom, tap a street to set the GPS. The \u{1F3E0} Hostel button navigates to Rathi Maheshwari Hostel.', keys: ['M'], touchKeys: ['MAP', '\u{1F3E0} Hostel'], highlight: ['#uHostel'], touchHighlight: ['#bMap', '#uHostel'], done: () => st.mapOpened },
      { title: 'Cheat codes', text: 'Press ` (backquote) or T, or click Cheats, then type a code. While driving, type HELIPUNE to turn your car into a helicopter!', touchText: 'Tap Cheats and type a code. While driving, type HELIPUNE to turn your car into a helicopter!', keys: ['`', 'T'], touchKeys: ['Cheats'], highlight: ['#uCheat'], touchHighlight: ['#uCheat'], done: () => st.cheatOpened },
      { title: 'Flying the helicopter', text: 'Space = climb, Shift = descend, W / S = fly forward / back, A / D = turn. Land gently, then press E to step out or type CARMODE to turn back into a car.', touchText: 'UP / DOWN buttons climb and descend; the left thumb flies forward and turns. Land, then tap E or use cheat CARMODE.', keys: ['Space', 'Shift', 'W', 'S', 'A', 'D'], touchKeys: ['UP', 'DOWN', 'Left thumb'], touchHighlight: ['#bBrake', '#bBoost'] },
      { title: 'Sensitivity and settings', text: 'Open ⚙ Settings to tune camera, movement and steering sensitivity, camera distance, auto-follow speed, gyroscope and graphics quality. Changes apply instantly.', keys: ['⚙ Settings'], touchKeys: ['⚙ Settings'], highlight: ['#uSettings'], touchHighlight: ['#uSettings'], done: () => st.settingsOpened },
      { title: 'You’re ready!', text: 'Explore Pune freely – no police, no wanted levels. Head to the hills, find the landmarks, or navigate to Rathi Maheshwari Hostel.' },
    ];
    this.tut = new Tutorial(steps, isTouch, () => { settings.tutorialDone = true; saveSettings(); this.tut = null; });
    this.tut.start();
  }
}

// ---------------------------------------------------------------- boot + UI wiring
const game = new Game();
requestAnimationFrame(game.frame);
$('controlsHelp').innerHTML = isTouch
  ? 'Left thumb: move / drive · right side: look · JUMP/BRAKE · SPRINT/BOOST · E: get in/out · F: interact · Cheats: HELIPUNE'
  : 'WASD move/drive · mouse look (click to capture) · Space jump/handbrake · Shift sprint/boost · E enter/exit · F interact · C camera · M map · ` or T cheats · Esc pause';
$('playFree').onclick = () => game.start('deccan');
$('playHostel').onclick = () => game.start('hostel');
$('playMissions').onclick = () => game.start('missions');
$<HTMLSelectElement>('quality').value = settings.quality;
$('quality').onchange = () => { settings.quality = ($<HTMLSelectElement>('quality').value as any); saveSettings(); };
$('menuSettings').onclick = () => { $('settingsView').classList.remove('hidden'); };
$('menuTutorial').onclick = () => { settings.tutorialDone = false; saveSettings(); game.toast('The tutorial will start when you begin playing.'); };
$('mapClose').onclick = () => game.closeOverlays();
$('uHostel').onclick = () => game.navigateHostel();
$('uCheat').onclick = () => game.openCheat();
$('uSettings').onclick = () => game.openSettings();
$('uHelp').onclick = () => { if (!game.tut) game.startTutorial(); };
const runCheat = () => { const r = game.cheat($<HTMLInputElement>('cheatInput').value); $('cheatMsg').textContent = r; if (!r.startsWith('Unknown') && !r.startsWith('Get') && !r.startsWith('Land') && !r.startsWith('You are')) setTimeout(() => game.closeOverlays(), 700); };
$('cheatGo').onclick = runCheat;
$('cheatInput').addEventListener('keydown', e => { if (e.key === 'Enter') runCheat(); if (e.key === 'Escape') game.closeOverlays(); e.stopPropagation(); });
$('cheatClose').onclick = () => game.closeOverlays();
// settings panel
const sl = $('sliders');
for (const s of SLIDERS) {
  const row = document.createElement('div'); row.className = 'srow';
  row.innerHTML = `<label>${s.label}</label><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${settings[s.key]}" data-k="${s.key}"/><span class="val">${Number(settings[s.key]).toFixed(2)}</span>`;
  const inp = row.querySelector('input')!, val = row.querySelector('.val')!;
  inp.oninput = () => { (settings as any)[s.key] = Number(inp.value); val.textContent = Number(inp.value).toFixed(2); if (s.key === 'volume') { game.audio.volume = settings.volume; if (game.audio.master) game.audio.master.gain.value = settings.volume; } saveSettings(); };
  sl.appendChild(row);
}
const syncToggles = () => { $('gyroBtn').textContent = settings.gyroEnabled ? 'On' : 'Off'; $('invBtn').textContent = settings.invertY ? 'On' : 'Off'; ($<HTMLSelectElement>('qualitySet')).value = settings.quality; };
syncToggles();
$('gyroBtn').onclick = async () => {
  if (!settings.gyroEnabled) {
    const ok = game.gyro.supported && await game.gyro.enable();
    if (!ok) { game.toast('Gyroscope not available on this device / browser.'); return; }
  }
  settings.gyroEnabled = !settings.gyroEnabled; saveSettings(); syncToggles();
};
$('invBtn').onclick = () => { settings.invertY = !settings.invertY; saveSettings(); syncToggles(); };
$('qualitySet').onchange = () => { settings.quality = ($<HTMLSelectElement>('qualitySet').value as any); saveSettings(); game.quality = settings.quality === 'high' ? 'high' : settings.quality === 'low' ? 'low' : (lowEnd ? 'low' : 'high'); game.applyQuality(); };
$('setReset').onclick = () => { resetSettings(); location.reload(); };
$('setTut').onclick = () => { $('settingsView').classList.add('hidden'); if (game.running) { game.closeOverlays(); game.startTutorial(); } else { settings.tutorialDone = false; saveSettings(); } };
$('setClose').onclick = () => { $('settingsView').classList.add('hidden'); if (game.running) game.closeOverlays(); };
for (const b of document.querySelectorAll<HTMLButtonElement>('#pause [data-a], #missions [data-a]')) b.onclick = () => {
  const a = b.dataset.a;
  if (a === 'resume' || a === 'close') game.closeOverlays();
  else if (a === 'missions') game.openMissions();
  else if (a === 'map') game.openMap();
  else if (a === 'hostel') { game.navigateHostel(); game.closeOverlays(); }
  else if (a === 'travel') { if (game.hostel) game.fastTravel(game.hostel.x, game.hostel.z, 'Rathi Maheshwari Hostel'); }
  else if (a === 'settings') game.openSettings();
  else if (a === 'cheat') { $('pause').classList.add('hidden'); game.openCheat(); }
  else if (a === 'time') game.hour = (game.hour + 3) % 24;
  else if (a === 'rain') game.setRain(!game.raining);
  else if (a === 'quality') { game.quality = game.quality === 'high' ? 'low' : 'high'; game.applyQuality(); }
  else if (a === 'abort') { game.missions.abort(); game.closeOverlays(); }
  else if (a === 'quit') location.reload();
};
(window as any).shehar = game; // debugging / automated tests
