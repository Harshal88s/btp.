// Shehar web: game bootstrap, main loop, player (on foot + driving), camera, HUD, map and menus.
// Coordinates: gameplay in data space (x east, z north, yaw clockwise from north); three.js space is (x, y, -z).
import * as THREE from 'three';
import './style.css';
import { Audio } from './audio';
import { GPS, fmtDist } from './gps';
import { Input } from './input';
import { MapRaster } from './maprender';
import { GameApi, Mission, MissionRunner } from './missions';
import { Humanoid, Obstacle, Pedestrians, Signals, Traffic, TrafficAgent, disposeModel } from './traffic';
import { SPECS, Vehicle, VClass } from './vehicles';
import { World } from './world';

THREE.ColorManagement.enabled = false; // vertex colours are authored as display colours

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const lowEnd = isTouch || (navigator.hardwareConcurrency || 8) <= 4;
const TIPS = [
  'India drives on the LEFT – AI traffic keeps left on two-way roads.',
  'FC Road is one-way northbound and JM Road southbound, exactly as in OpenStreetMap.',
  'Traffic lights stand at the real OSM signal locations.',
  'Press E (or the E button) near any vehicle to take it – even an auto-rickshaw from traffic.',
  'Open the map (M) and tap any street or landmark to set a GPS route.',
  'Stop at a petrol pump (green dot on the map) and press F to refuel.',
  'The Mula-Mutha river is not for driving – use the bridges.',
];

type Quality = 'low' | 'high';

class Game implements GameApi {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  world!: World; graph!: World['graph']; gps!: GPS; signals!: Signals; traffic!: Traffic; peds!: Pedestrians; missions!: MissionRunner; map!: MapRaster;
  input: Input; audio = new Audio();
  quality: Quality;
  // three.js r155+ uses physical light units: intensities are multiplied by PI to match the intended brightness
  sun = new THREE.DirectionalLight(0xffffff, 1.0 * Math.PI); hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6a5a48, 0.6 * Math.PI);
  headlight: THREE.SpotLight | null = null;
  // player
  veh: Vehicle | null = null; parked: Vehicle[] = [];
  foot = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0 }; human = new Humanoid([30, 90, 170], false);
  camYaw = 0; camPitch = 12; orbitYaw = 0; orbitPitch = 0; idle = 0; firstPerson = false; camPos = new THREE.Vector3(); shake = 0;
  hour = 10; money = 10000; missionMode = false; running = false; paused = false;
  markers: { x: number; z: number; mesh: THREE.Mesh; m: Mission }[] = [];
  private last = performance.now(); private hudT = 0; private waterT = 0; private landT = 0; private fpsAcc = 0; private fpsN = 0;
  private toasts: { el: HTMLElement; until: number }[] = [];
  private bigUntil = 0; private sayUntil = 0;
  private prompt = ''; private promptAction: (() => void) | null = null;
  private seen = new Set<string>();

  constructor() {
    const q = ($<HTMLSelectElement>('quality').value);
    this.quality = q === 'high' ? 'high' : q === 'low' ? 'low' : (lowEnd ? 'low' : 'high');
    this.renderer = new THREE.WebGLRenderer({ canvas: $('c') as HTMLCanvasElement, antialias: this.quality === 'high', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.4, 1500);
    this.input = new Input($('touch'));
    this.applyQuality();
    addEventListener('resize', () => this.resize()); this.resize();
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog(0xb8c8d8, 250, 650);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshLambertMaterial({ color: 0x7d7466 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; this.scene.add(ground);
    this.scene.add(this.human.root);
    try { this.money = Number(localStorage.getItem('shehar_money') || 10000); for (const s of JSON.parse(localStorage.getItem('shehar_seen') || '[]')) this.seen.add(s); } catch { /* private mode */ }
    // desktop mouse orbit
    let drag = false, lx = 0, ly = 0;
    const c = $('c');
    c.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') { drag = true; lx = e.clientX; ly = e.clientY; } });
    addEventListener('pointerup', () => (drag = false));
    addEventListener('pointermove', e => { if (drag && e.pointerType === 'mouse') { this.input.mouseLook(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; } });
  }

  applyQuality() {
    const high = this.quality === 'high';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 1.5 : 1));
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    if (high) { this.sun.shadow.mapSize.set(2048, 2048); Object.assign(this.sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 500 }); this.sun.shadow.bias = -0.0005; }
    if (this.world) this.world.loadRadius = high ? 600 : 360;
    if (this.traffic) this.traffic.max = high ? 24 : 12;
    if (this.peds) this.peds.max = high ? 18 : 6;
    this.camera.far = high ? 1500 : 700;
    if (this.scene.fog) { (this.scene.fog as THREE.Fog).near = high ? 250 : 150; (this.scene.fog as THREE.Fog).far = high ? 650 : 390; }
    this.camera.updateProjectionMatrix();
    $('qLabel').textContent = high ? 'High' : 'Low';
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    $('rotate').classList.toggle('hidden', !(isTouch && innerHeight > innerWidth && this.running));
  }

  async start(missionMode: boolean) {
    this.missionMode = missionMode;
    this.audio.start();
    $('menu').classList.add('hidden'); $('loading').classList.remove('hidden');
    let tip = 0; $('loadTip').textContent = 'TIP: ' + TIPS[0];
    const tipT = setInterval(() => { tip = (tip + 1) % TIPS.length; $('loadTip').textContent = 'TIP: ' + TIPS[tip]; }, 5000);
    this.world = new World('/cities/pune/', this.quality === 'low');
    this.world.loadRadius = this.quality === 'high' ? 600 : 360;
    this.scene.add(this.world.root);
    try {
      await this.world.load((p, l) => { ($('loadBar') as HTMLElement).style.width = Math.round(p * 100) + '%'; $('loadLabel').textContent = l; });
    } catch (e) {
      clearInterval(tipT); $('loadLabel').textContent = 'Could not load city data: ' + e; return;
    }
    clearInterval(tipT);
    this.graph = this.world.graph;
    this.map = new MapRaster(this.world.idx, this.world.global, this.quality === 'high' ? 2048 : 1536);
    this.signals = new Signals(this.graph);
    this.world.onChunkAdded = (r, g) => { for (const s of r.signals) this.signals.addPole(s, g, this.world.key(r.cx, r.cz)); };
    this.world.onChunkRemoved = k => this.signals.removeChunk(k);
    for (const [k, cs] of this.world.chunkSignals) for (const s of cs.spots) this.signals.addPole(s, cs.group, k); // chunks preloaded before signals existed
    this.traffic = new Traffic(this.world, this.scene, this.signals);
    this.peds = new Pedestrians(this.world, this.scene);
    this.gps = new GPS(this.graph, this.scene);
    this.missions = new MissionRunner(this);
    this.applyQuality();
    // spawn in the starting car at the real spawn landmark
    const [sx, sz, syaw] = this.world.roadPointNear(this.world.idx.spawnX, this.world.idx.spawnZ);
    const car = new Vehicle(SPECS.hatch, [180, 20, 20]);
    car.x = sx; car.z = sz; car.yaw = syaw; this.camYaw = syaw;
    this.scene.add(car.model.group);
    this.enter(car);
    if (missionMode) this.placeMarkers();
    $('loading').classList.add('hidden'); $('hud').classList.remove('hidden');
    if (isTouch) { $('touch').classList.remove('hidden'); document.body.classList.add('touch'); }
    this.running = true; this.resize();
    this.big('PUNE', (missionMode ? 'MISSIONS' : 'FREE ROAM') + ' · ' + this.world.idx.spawnName, '#ff9933');
    this.toast('Map data © OpenStreetMap contributors (ODbL)', '#aab0bb');
    this.toast(isTouch ? 'Left thumb: drive · E: get in/out · MAP: set GPS' : 'WASD drive · Space handbrake · E in/out · C camera · M map · Tab missions');
    if (missionMode) this.toast('Yellow beams are missions – drive in and press F, or open Missions from the menu', '#ffd24d');
    if (isTouch) document.documentElement.requestFullscreen?.().catch(() => {});
  }

  placeMarkers() {
    const geo = new THREE.CylinderGeometry(2.5, 2.5, 25, 20, 1, true); geo.translate(0, 12.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc81a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    for (const m of this.missions.all) {
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(m.x, 0, -m.z); this.scene.add(mesh);
      this.markers.push({ x: m.x, z: m.z, mesh, m });
    }
  }

  // ---------------------------------------------------------------- GameApi
  pos(): [number, number] { return this.veh ? [this.veh.x, this.veh.z] : [this.foot.x, this.foot.z]; }
  speed() { return this.veh ? Math.abs(this.veh.v) : Math.hypot(this.foot.vx, this.foot.vz); }
  vehicle() { return this.veh; }
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
    m.position.set(x, 0, -z); this.scene.add(m);
    return () => { this.scene.remove(m); geo.dispose(); (m.material as THREE.Material).dispose(); };
  }
  person(x: number, z: number) { const h = new Humanoid(); h.root.position.set(x, 0.06, -z); this.scene.add(h.root); return () => { this.scene.remove(h.root); h.dispose(); }; }
  save() { try { localStorage.setItem('shehar_money', String(this.money)); localStorage.setItem('shehar_seen', JSON.stringify([...this.seen])); } catch { /* ignore */ } }

  // ---------------------------------------------------------------- vehicles
  enter(v: Vehicle) {
    const agent = this.traffic?.agents.find(a => a.veh === v);
    if (agent) {
      this.traffic.release(agent);
      v.ai = false;
      if (v.spec.two) { // the rider gets off: rebuild the bike without them
        const old = v.model.group; this.scene.remove(old); disposeModel(v);
        v.model = new Vehicle(v.spec, undefined, v.plate).model; this.scene.add(v.model.group);
      }
      this.toast('You took the ' + v.spec.name + ' – the driver walks off grumbling', '#ffd24d');
    }
    this.parked = this.parked.filter(p => p !== v);
    this.veh = v; v.occupied = true;
    v.model.body.add(this.human.root);
    this.human.root.position.set(v.model.headX, v.model.seatY - 0.9, v.model.headZ);
    this.human.root.rotation.set(0, 0, 0);
    this.human.animate(0, 0, true);
    this.human.root.visible = !this.firstPerson;
  }

  exit() {
    const v = this.veh; if (!v) return;
    if (Math.abs(v.v) > 7) { this.toast('Slow down to get out'); return; }
    v.model.body.remove(this.human.root); this.scene.add(this.human.root);
    const r = v.yaw * Math.PI / 180, rx = Math.cos(r), rz = -Math.sin(r); // right side (driver side in India)
    let x = v.x + rx * (v.spec.W / 2 + 0.9), z = v.z + rz * (v.spec.W / 2 + 0.9);
    if (this.world.collide(x, z, 0.35)) { x = v.x - rx * (v.spec.W / 2 + 0.9); z = v.z - rz * (v.spec.W / 2 + 0.9); }
    this.foot = { x, z, yaw: v.yaw, vx: 0, vz: 0 };
    this.human.root.visible = true;
    v.occupied = false; v.v = 0; v.braking = true;
    this.parked.push(v); this.veh = null;
  }

  private nearestVehicle(): Vehicle | null {
    let best: Vehicle | null = null, bd = 4.5;
    const all = this.parked.concat(this.traffic.agents.map(a => a.veh));
    for (const v of all) { const d = Math.hypot(v.x - this.foot.x, v.z - this.foot.z) - v.spec.L * 0.3; if (d < bd) { bd = d; best = v; } }
    return best;
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
    this.updateHud(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private handleActions() {
    const i = this.input;
    if (i.take('pause')) { this.togglePause(); }
    if (i.take('map')) { this.openMap(); }
    if (i.take('missions')) { this.openMissions(); }
    if (this.paused) { i.take('enter'); i.take('interact'); i.take('camera'); i.take('reset'); return; }
    if (i.take('camera')) { this.firstPerson = !this.firstPerson; this.human.root.visible = !(this.firstPerson && this.veh); }
    if (i.take('enter')) { if (this.veh) this.exit(); else { const v = this.nearestVehicle(); if (v) this.enter(v); } }
    if (i.take('reset') && this.veh) { const [x, z, y] = this.world.roadPointNear(this.veh.x, this.veh.z); Object.assign(this.veh, { x, z, yaw: y, v: 0 }); }
    if (i.take('interact')) this.promptAction?.();
    if (i.take('lights')) { /* headlights follow the clock automatically */ }
  }

  private step(dt: number) {
    const i = this.input;
    this.hour = (this.hour + dt * 24 / (24 * 60)) % 24; // 24-minute day
    this.signals.update(dt);
    const wet = 1;
    if (this.veh) {
      const v = this.veh;
      v.drive({ throttle: i.throttle, steer: i.steer, handbrake: i.handbrake, boost: i.boost }, dt, wet);
      this.collideVehicle(v, dt);
      if (i.horn) this.audio.horn(v.spec.horn);
      this.audio.engine(v.health > 0 && v.fuel > 0, Math.min(1, Math.abs(v.v) / v.maxV), v.spec.three ? 'auto' : v.spec.two ? 'two' : (v.spec.id === 'bus' || v.spec.id === 'truck') ? 'heavy' : 'car');
      v.sync(dt);
    } else {
      this.audio.engine(false, 0, 'car');
      const yaw = this.camYaw * Math.PI / 180, mx = i.steer, mz = i.throttle, sp = i.boost ? 6.2 : 2.6;
      const tx = (Math.sin(yaw) * mz + Math.cos(yaw) * mx) * sp, tz = (Math.cos(yaw) * mz - Math.sin(yaw) * mx) * sp;
      const k = Math.min(1, dt * 10); this.foot.vx += (tx - this.foot.vx) * k; this.foot.vz += (tz - this.foot.vz) * k;
      this.foot.x += this.foot.vx * dt; this.foot.z += this.foot.vz * dt;
      const hit = this.world.collide(this.foot.x, this.foot.z, 0.35); if (hit) { this.foot.x = hit.x; this.foot.z = hit.z; }
      const s = Math.hypot(this.foot.vx, this.foot.vz);
      if (s > 0.2) this.foot.yaw = Math.atan2(this.foot.vx, this.foot.vz) * 180 / Math.PI;
      this.human.root.position.set(this.foot.x, 0.06, -this.foot.z);
      this.human.root.rotation.y = -this.foot.yaw * Math.PI / 180;
      this.human.animate(s, dt);
    }
    for (const p of this.parked) p.sync(dt);
    this.parked = this.parked.filter(p => { const [px, pz] = this.pos(); if (Math.hypot(p.x - px, p.z - pz) > 400) { this.scene.remove(p.model.group); disposeModel(p); return false; } return true; });
    const [px, pz] = this.pos();
    const obstacles: Obstacle[] = [];
    if (this.veh) obstacles.push({ x: this.veh.x, z: this.veh.z, r: this.veh.radius });
    else obstacles.push({ x: this.foot.x, z: this.foot.z, r: 0.4 });
    for (const p of this.parked) obstacles.push({ x: p.x, z: p.z, r: p.radius });
    for (const p of this.peds.peds) if (p.down <= 0) obstacles.push({ x: p.x, z: p.z, r: 0.4 });
    const cy = this.camYaw * Math.PI / 180;
    this.traffic.update(dt, px, pz, Math.sin(cy), Math.cos(cy), obstacles, false, v => { if (Math.hypot(v.x - px, v.z - pz) < 60) this.audio.horn(v.spec.horn, 0.05); });
    const movers = this.traffic.agents.map(a => a.veh); if (this.veh) movers.push(this.veh);
    this.peds.update(dt, px, pz, movers, () => { this.toast('You hit a pedestrian!', '#ff7a6a'); this.shake = 0.6; }, this.veh);
    this.world.update(px, pz);
    this.gps.update(dt, px, pz, !!this.veh);
    this.missions.update(dt);
    this.updateInteractions(px, pz);
    this.waterT -= dt;
    if (this.waterT <= 0) {
      this.waterT = 0.4;
      if (this.world.isWater(px, pz)) {
        const [x, z, y] = this.world.roadPointNear(px, pz);
        if (this.veh) { Object.assign(this.veh, { x, z, yaw: y, v: 0 }); this.veh.health = Math.max(0, this.veh.health - 25); } else { this.foot.x = x; this.foot.z = z; }
        this.toast('Splash! You ended up in the Mula-Mutha. Stick to the bridges.', '#8cc8ff'); this.audio.thump(8);
      }
    }
    this.landT -= dt;
    if (this.landT <= 0) {
      this.landT = 1;
      for (const l of this.world.idx.landmarks) if (!this.seen.has(l.name) && Math.hypot(l.x - px, l.z - pz) < 70) { this.seen.add(l.name); this.toast('Landmark discovered: ' + l.name, '#8cc8ff'); this.save(); }
    }
    // headlight spot at night (high quality only)
    const night = this.night();
    if (this.quality === 'high' && this.veh && night > 0.5) {
      if (!this.headlight) { this.headlight = new THREE.SpotLight(0xfff2d0, 60, 70, 0.55, 0.5, 1); this.scene.add(this.headlight, this.headlight.target); }
      const [fx, fz] = this.veh.forward();
      this.headlight.position.set(this.veh.x + fx * 2, 1.0, -(this.veh.z + fz * 2));
      this.headlight.target.position.set(this.veh.x + fx * 25, 0, -(this.veh.z + fz * 25));
      this.headlight.visible = true;
    } else if (this.headlight) this.headlight.visible = false;
  }

  private collideVehicle(v: Vehicle, dt: number) {
    const [fx, fz] = v.forward(), off = Math.max(0, v.spec.L / 2 - v.radius);
    for (const s of [off, -off, 0]) {
      const cx = v.x + fx * s, cz = v.z + fz * s;
      const hit = this.world.collide(cx, cz, v.radius);
      if (!hit) continue;
      v.x += hit.x - cx; v.z += hit.z - cz;
      const impact = Math.abs(v.v) * Math.abs(fx * hit.nx + fz * hit.nz);
      if (impact > 2) { v.health = Math.max(0, v.health - (impact - 2) * 3.5); this.audio.thump(impact); this.shake = Math.min(1, impact / 12); }
      v.v *= impact > 3 ? -0.25 : 0.92;
    }
    for (const a of this.traffic.agents) {
      const o = a.veh, dx = v.x - o.x, dz = v.z - o.z, d = Math.hypot(dx, dz), min = v.radius + o.radius + 0.4;
      if (d >= min || d < 1e-3) continue;
      const nx = dx / d, nz = dz / d; v.x += nx * (min - d); v.z += nz * (min - d);
      const rel = Math.abs(v.v - o.v * (fx * Math.sin(o.yaw * Math.PI / 180) + fz * Math.cos(o.yaw * Math.PI / 180)));
      if (rel > 3) { a.knocked = 5; v.health = Math.max(0, v.health - rel * 1.2); this.audio.thump(rel); this.shake = Math.min(1, rel / 12); this.audio.horn(o.spec.horn, 0.08); }
      v.v *= 0.6;
    }
    const idx = this.world.idx, m = 30;
    v.x = Math.max(idx.minX - m, Math.min(idx.maxX + m, v.x)); v.z = Math.max(idx.minZ - m, Math.min(idx.maxZ + m, v.z));
  }

  private updateInteractions(px: number, pz: number) {
    this.prompt = ''; this.promptAction = null;
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
      if (nv) { this.prompt = 'Press E to drive the ' + nv.spec.name; return; }
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
    let target: THREE.Vector3, pos: THREE.Vector3;
    if (this.veh) {
      const v = this.veh;
      this.orbitYaw += lx; this.orbitPitch = Math.max(-10, Math.min(45, this.orbitPitch + ly * 0.5));
      if (lx === 0 && ly === 0) { this.idle += dt; if (this.idle > 1.5 && Math.abs(v.v) > 2) { this.orbitYaw *= 1 - Math.min(1, dt * 2.5); this.orbitPitch *= 1 - Math.min(1, dt * 2.5); } } else this.idle = 0;
      let d = ((v.yaw - this.camYaw + 540) % 360) - 180; this.camYaw += d * Math.min(1, dt * 4);
      if (this.firstPerson) {
        const r = -v.yaw * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
        const hx = v.model.headX, hz = v.model.headZ; // local three coords
        pos = new THREE.Vector3(v.x + hx * cs + hz * sn, v.model.headY + 0.06, -v.z - hx * sn + hz * cs);
        const yaw = (v.yaw + this.orbitYaw) * Math.PI / 180, pit = (4 + this.orbitPitch) * Math.PI / 180;
        target = pos.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pit), -Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)));
        this.camPos.copy(pos);
      } else {
        const dist = 3 + v.spec.L * 0.85, yaw = (this.camYaw + this.orbitYaw) * Math.PI / 180, pit = (11 + this.orbitPitch) * Math.PI / 180;
        target = new THREE.Vector3(v.x, v.spec.H * 0.75 + 0.4, -v.z);
        const want = target.clone().add(new THREE.Vector3(-Math.sin(yaw) * Math.cos(pit) * dist, Math.sin(pit) * dist, Math.cos(yaw) * Math.cos(pit) * dist));
        this.camPos.lerp(want, 1 - Math.exp(-dt * 12));
        pos = this.camPos;
      }
      this.camera.fov += ((this.firstPerson ? 70 : 62) + Math.min(1, v.kmh / 140) * 14 - this.camera.fov) * Math.min(1, dt * 3);
    } else {
      this.camYaw += lx; this.camPitch = Math.max(-20, Math.min(60, this.camPitch + ly * 0.5));
      const yaw = this.camYaw * Math.PI / 180, pit = this.camPitch * Math.PI / 180;
      if (this.firstPerson) {
        pos = new THREE.Vector3(this.foot.x, 1.62, -this.foot.z);
        target = pos.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pit), -Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)));
        this.camPos.copy(pos);
      } else {
        target = new THREE.Vector3(this.foot.x, 1.55, -this.foot.z);
        const want = target.clone().add(new THREE.Vector3(-Math.sin(yaw) * Math.cos(pit) * 3.8, Math.sin(pit) * 3.8 + 0.3, Math.cos(yaw) * Math.cos(pit) * 3.8));
        this.camPos.lerp(want, 1 - Math.exp(-dt * 16));
        pos = this.camPos;
      }
      this.camera.fov += ((this.firstPerson ? 70 : 62) - this.camera.fov) * Math.min(1, dt * 3);
    }
    if (pos.y < 0.3) pos.y = 0.3;
    this.camera.position.copy(pos);
    if (this.shake > 0.01) { this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3; this.shake = Math.max(0, this.shake - dt * 2.5); }
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    // sun + shadow follow the player; day / night
    const [px, pz] = this.pos(), alt = Math.sin((this.hour - 6) / 12 * Math.PI), ang = (this.hour - 6) / 12 * Math.PI, night = this.night();
    const sd = new THREE.Vector3(-Math.cos(ang) * 0.9, Math.max(0.15, Math.sin(ang)), 0.35).normalize();
    this.sun.position.set(px + sd.x * 200, sd.y * 200, -pz + sd.z * 200); this.sun.target.position.set(px, 0, -pz);
    const dusk = Math.max(0, 1 - Math.abs(alt) / 0.3);
    this.sun.intensity = Math.PI * (night > 0.5 ? 0.15 : Math.max(0.05, Math.min(0.95, alt * 1.4 + 0.1)));
    this.sun.color.setRGB(1, 0.95 - dusk * 0.35, 0.85 - dusk * 0.5);
    this.hemi.intensity = Math.PI * (0.62 - night * 0.45);
    const day = new THREE.Color(0.62, 0.74, 0.88), duskC = new THREE.Color(0.9, 0.55, 0.38), nightC = new THREE.Color(0.04, 0.05, 0.1);
    const sky = day.clone().lerp(duskC, dusk * 0.7).lerp(nightC, night);
    this.scene.background = sky; (this.scene.fog as THREE.Fog).color.copy(sky);
    (this.world.mats.lamps as THREE.MeshBasicMaterial).color.setRGB(0.5 + night * 0.5, 0.48 + night * 0.4, 0.42 + night * 0.2);
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
    const h = Math.floor(this.hour), mi = Math.floor((this.hour - h) * 60);
    $('clock').textContent = String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
    $('streetName').textContent = this.world.streetName(px, pz) || '–';
    $('zoneName').textContent = this.world.zoneName(px, pz) + ', Pune';
    const v = this.veh;
    $('speedo').classList.toggle('hidden', !v);
    if (v) {
      $('spd').textContent = String(Math.round(v.kmh));
      ($('fuel') as HTMLElement).style.width = Math.round(v.fuel * 100) + '%';
      ($('hp') as HTMLElement).style.width = Math.round(v.health) + '%';
      ($('hp') as HTMLElement).style.background = v.health < 35 ? '#ff5a4d' : '#5cd66a';
      $('vname').textContent = v.spec.name + '  ·  ' + v.plate;
    }
    const ms = this.missions;
    $('objective').classList.toggle('hidden', !ms.active);
    if (ms.active) {
      $('objTitle').textContent = ms.active.title.toUpperCase(); $('objText').textContent = ms.objective;
      $('objTimer').textContent = ms.timerOn ? Math.floor(ms.timeLeft / 60) + ':' + String(Math.floor(ms.timeLeft % 60)).padStart(2, '0') : '';
      ($('objTimer') as HTMLElement).style.color = ms.timerOn && ms.timeLeft < 20 ? '#ff5a4d' : '#fff';
    }
    const g = this.gps;
    $('gps').classList.toggle('hidden', !g.target || !g.instruction);
    if (g.target) {
      $('gpsText').textContent = g.instruction; $('gpsDist').textContent = fmtDist(g.remaining);
      ($('gpsArrow') as HTMLElement).style.transform = 'rotate(' + (g.turn === 1 ? 90 : g.turn === -1 ? -90 : 0) + 'deg)';
      $('gpsArrow').innerHTML = g.turn === 2 ? '&#x25C9;' : '&#x2191;';
    }
    const pr = $('prompt'); pr.classList.toggle('hidden', !this.prompt); pr.textContent = this.prompt;
    if (this.fpsAcc > 1) { $('fps').textContent = Math.round(this.fpsN / this.fpsAcc) + ' fps · ' + this.world.loadedCount + ' chunks · ' + this.traffic.agents.length + ' cars'; this.fpsAcc = 0; this.fpsN = 0; }
  }

  private drawMinimap() {
    const c = $('miniCanvas') as HTMLCanvasElement, g = c.getContext('2d')!, S = c.width, m = this.map;
    const [px, pz] = this.pos(), view = this.veh ? 300 + Math.min(1, this.veh.kmh / 100) * 300 : 200, scale = S / view * m.mpp;
    g.save(); g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2); g.rotate(-this.camYaw * Math.PI / 180);
    const [cx, cy] = m.px(px, pz);
    g.drawImage(m.canvas, -cx * scale, -cy * scale, m.size * scale, m.size * scale);
    const P = (x: number, z: number) => { const [qx, qy] = m.px(x, z); return [(qx - cx) * scale, (qy - cy) * scale]; };
    if (this.gps.target && this.gps.route.length > 1) {
      g.strokeStyle = '#9b40f0'; g.lineWidth = 4; g.beginPath();
      this.gps.route.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    }
    const dot = (x: number, z: number, col: string, r: number) => { const [a, b] = P(x, z); if (Math.hypot(a, b) > S / 2 - 4) return; g.fillStyle = col; g.beginPath(); g.arc(a, b, r, 0, 7); g.fill(); };
    for (const p of this.world.idx.pois) if (p.kind === 'fuel') dot(p.x, p.z, '#1a9a35', 4);
    for (const l of this.world.idx.landmarks) dot(l.x, l.z, '#2f62e8', 4);
    if (!this.missions.active) for (const mk of this.markers) dot(mk.x, mk.z, '#ffc81a', 6);
    if (this.gps.target) dot(this.gps.target.x, this.gps.target.z, '#a040f0', 6);
    g.restore();
    const hy = (this.veh ? this.veh.yaw : this.foot.yaw) - this.camYaw;
    g.save(); g.translate(S / 2, S / 2); g.rotate(hy * Math.PI / 180);
    g.fillStyle = '#1e5bff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
    ($('miniN') as HTMLElement).style.transform = `translate(-50%, 0) rotate(${-this.camYaw}deg)`;
    ($('miniN') as HTMLElement).style.transformOrigin = '50% ' + (S / 2 - 4) + 'px';
  }

  // ---------------------------------------------------------------- overlays
  togglePause(force?: boolean) {
    this.paused = force ?? !this.paused;
    $('pause').classList.toggle('hidden', !this.paused);
    $('abortBtn').classList.toggle('hidden', !this.missions?.active);
    if (!this.paused) { $('missions').classList.add('hidden'); $('mapView').classList.add('hidden'); }
  }

  openMissions() {
    this.paused = true; $('pause').classList.add('hidden');
    const list = $('missionList'); list.innerHTML = '';
    let done: string[] = []; try { done = JSON.parse(localStorage.getItem('shehar_done') || '[]'); } catch { /* ignore */ }
    for (const m of this.missions.all) {
      const row = document.createElement('div'); row.className = 'mrow';
      const why = this.missions.canStart(m);
      row.innerHTML = `<div class="t"><b>${m.title}${done.includes(m.id) ? ' ✔' : ''}</b><small>${m.category} · start: ${m.startLabel}${m.reward ? ' · ₹' + m.reward.toLocaleString('en-IN') : ''}</small><small>${m.brief}</small>${why ? `<small style="color:#ff8a7a">${why}</small>` : ''}</div>`;
      const gps = document.createElement('button'); gps.className = 'btn'; gps.textContent = 'GPS';
      gps.onclick = () => { const [px, pz] = this.pos(); this.gps.set(m.x, m.z, m.title, px, pz, !!this.veh); this.closeOverlays(); };
      const go = document.createElement('button'); go.className = 'btn primary'; go.textContent = 'Start';
      go.disabled = !!why; if (why) go.style.opacity = '0.4';
      go.onclick = () => { this.closeOverlays(); this.missions.start(m); };
      row.append(gps, go); list.appendChild(row);
    }
    $('missions').classList.remove('hidden');
  }

  closeOverlays() { this.paused = false; for (const id of ['pause', 'missions', 'mapView']) $(id).classList.add('hidden'); }

  openMap() {
    this.paused = true; $('pause').classList.add('hidden'); $('mapView').classList.remove('hidden');
    const cv = $('mapCanvas') as HTMLCanvasElement, m = this.map;
    const [px, pz] = this.pos();
    let [cx, cy] = m.px(px, pz), zoom = Math.max(innerWidth, innerHeight) / 900;
    const draw = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
      const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0b1020'; g.fillRect(0, 0, innerWidth, innerHeight);
      g.save(); g.translate(innerWidth / 2, innerHeight / 2); g.scale(zoom, zoom); g.translate(-cx, -cy);
      g.drawImage(m.canvas, 0, 0);
      if (this.gps.target) { g.strokeStyle = '#9b40f0'; g.lineWidth = 4 / zoom; g.beginPath(); this.gps.route.forEach(([x, z], i) => { const [a, b] = m.px(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
      for (const p of this.world.idx.pois) if (p.kind === 'fuel') { const [a, b] = m.px(p.x, p.z); g.fillStyle = '#1a9a35'; g.beginPath(); g.arc(a, b, 4 / zoom, 0, 7); g.fill(); }
      for (const mk of this.markers) { const [a, b] = m.px(mk.x, mk.z); g.fillStyle = '#ffc81a'; g.beginPath(); g.arc(a, b, 7 / zoom, 0, 7); g.fill(); }
      g.font = `bold ${13 / zoom}px system-ui, sans-serif`;
      for (const l of this.world.idx.landmarks) { const [a, b] = m.px(l.x, l.z); g.fillStyle = '#2f62e8'; g.beginPath(); g.arc(a, b, 5 / zoom, 0, 7); g.fill(); g.fillStyle = '#152a6a'; g.fillText(l.name, a + 7 / zoom, b - 5 / zoom); }
      const [qx, qy] = m.px(...this.pos());
      g.save(); g.translate(qx, qy); g.rotate((this.veh ? this.veh.yaw : this.foot.yaw) * Math.PI / 180); g.scale(1 / zoom, 1 / zoom);
      g.fillStyle = '#1e5bff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -12); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.fill(); g.stroke(); g.restore();
      if (this.gps.target) { const [a, b] = m.px(this.gps.target.x, this.gps.target.z); g.fillStyle = '#a040f0'; g.beginPath(); g.arc(a, b, 8 / zoom, 0, 7); g.fill(); }
      g.restore();
    };
    const toWorld = (sx: number, sy: number): [number, number] => {
      const mx = (sx - innerWidth / 2) / zoom + cx, my = (sy - innerHeight / 2) / zoom + cy;
      return [m.idx.minX + mx * m.mpp, m.idx.minZ + (m.size - my) * m.mpp];
    };
    const ptrs = new Map<number, { x: number; y: number }>(); let moved = 0, pinch0 = 0, zoom0 = zoom;
    cv.onpointerdown = e => { try { cv.setPointerCapture(e.pointerId); } catch { /* best-effort */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; } };
    cv.onpointermove = e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      if (ptrs.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...ptrs.values()]; zoom = Math.max(0.3, Math.min(8, zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / (pinch0 || 1))); moved += 10; }
      else { const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy); cx -= dx / zoom; cy -= dy / zoom; p.x = e.clientX; p.y = e.clientY; }
      const [wx, wz] = toWorld(e.clientX, e.clientY);
      $('mapInfo').textContent = (this.world.streetName(wx, wz) || '–') + ' · ' + this.world.zoneName(wx, wz);
      draw();
    };
    cv.onpointerup = e => {
      ptrs.delete(e.pointerId);
      if (moved < 8) {
        const [wx, wz] = toWorld(e.clientX, e.clientY);
        let label = this.world.streetName(wx, wz) || 'Waypoint', tx = wx, tz = wz;
        for (const l of this.world.idx.landmarks) { const [a, b] = m.px(l.x, l.z), [sa, sb] = [(a - cx) * zoom + innerWidth / 2, (b - cy) * zoom + innerHeight / 2]; if (Math.hypot(sa - e.clientX, sb - e.clientY) < 18) { label = l.name; tx = l.x; tz = l.z; } }
        const [px2, pz2] = this.pos(); this.gps.set(tx, tz, label, px2, pz2, !!this.veh);
        $('mapInfo').textContent = 'GPS set: ' + label + ' (' + fmtDist(this.gps.remaining || Math.hypot(tx - px2, tz - pz2)) + ')';
        draw();
      }
    };
    cv.onwheel = e => { zoom = Math.max(0.3, Math.min(8, zoom * (e.deltaY > 0 ? 0.87 : 1.15))); draw(); e.preventDefault(); };
    $('mapInfo').textContent = 'Tap any street or landmark to set your GPS route';
    draw();
  }
}

// ---------------------------------------------------------------- boot
const game = new Game();
requestAnimationFrame(game.frame);
$('controlsHelp').innerHTML = isTouch
  ? 'Left thumb anywhere: steer &amp; accelerate (pull back = brake/reverse) · right side: drag to look · BRAKE = handbrake · E = get in/out (any car, even traffic) · F = interact'
  : 'W/S accelerate/brake · A/D steer · Space handbrake · Shift boost · E enter/exit · F interact · H horn · C camera · M map · Tab missions · R reset · Esc pause · mouse drag: look · gamepad supported';
$('playFree').onclick = () => game.start(false);
$('playMissions').onclick = () => game.start(true);
$('quality').onchange = () => { const q = ($<HTMLSelectElement>('quality').value); game.quality = q === 'high' ? 'high' : q === 'low' ? 'low' : (lowEnd ? 'low' : 'high'); game.applyQuality(); };
$('mapClose').onclick = () => game.closeOverlays();
for (const b of document.querySelectorAll<HTMLButtonElement>('#pause [data-a], #missions [data-a]')) b.onclick = () => {
  const a = b.dataset.a;
  if (a === 'resume' || a === 'close') game.closeOverlays();
  else if (a === 'missions') game.openMissions();
  else if (a === 'map') game.openMap();
  else if (a === 'time') game.hour = (game.hour + 3) % 24;
  else if (a === 'quality') { game.quality = game.quality === 'high' ? 'low' : 'high'; game.applyQuality(); }
  else if (a === 'abort') { game.missions.abort(); game.closeOverlays(); }
  else if (a === 'quit') location.reload();
};
(window as any).shehar = game; // handy for debugging / automated tests
export type { VClass, TrafficAgent };
