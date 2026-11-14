// AI traffic (keeps LEFT, one-way aware, stops at OSM signals, slows for speed breakers/turns, follows),
// traffic-signal controllers on the real OSM signal nodes, and footpath pedestrians.
import * as THREE from 'three';
import { RoadGraph } from './graph';
import { SignalSpot } from './chunkgen';
import { NodeFlags } from './types';
import { MeshBuilder, RGB, v3 } from './mesh';
import { SPECS, Spec, VClass, Vehicle } from './vehicles';
import { World } from './world';

// ---------------------------------------------------------------- signals
export type Light = 'green' | 'amber' | 'red' | 'none';
const GREEN = 15, AMBER = 3, CYCLE = 2 * (GREEN + AMBER);

export class Signals {
  private cluster = new Map<number, number>();
  private axis: [number, number][] = [];
  private offset: number[] = [];
  private poles: { cluster: number; major: THREE.MeshBasicMaterial[]; minor: THREE.MeshBasicMaterial[]; obj: THREE.Object3D; chunk: number }[] = [];
  time = 0;
  constructor(private g: RoadGraph) {
    const sig: number[] = [];
    for (let n = 0; n < g.n; n++) if ((g.flags[n] & NodeFlags.TrafficSignal) && g.degree(n) > 0) sig.push(n);
    const cl = new Int32Array(sig.length).fill(-1);
    for (let i = 0; i < sig.length; i++) {
      if (cl[i] >= 0) continue;
      const cid = this.axis.length; cl[i] = cid;
      const stack = [i]; let bestRank = -1, ax: [number, number] = [0, 1];
      while (stack.length) {
        const u = stack.pop()!, nu = sig[u];
        for (let k = 0; k < g.degree(nu); k++) {
          const nb = g.neighbor(nu, k), road = g.roadOfEdge(nb.edge);
          if (road.rank > bestRank) { bestRank = road.rank; const dx = g.X[nb.node] - g.X[nu], dz = g.Z[nb.node] - g.Z[nu], l = Math.hypot(dx, dz) || 1; ax = [dx / l, dz / l]; }
        }
        for (let j = 0; j < sig.length; j++) if (cl[j] < 0 && g.dist(nu, sig[j]) < 45) { cl[j] = cid; stack.push(j); }
      }
      this.axis.push(ax); this.offset.push((cid * 7.31) % CYCLE);
    }
    sig.forEach((n, i) => this.cluster.set(n, cl[i]));
  }
  get count() { return this.cluster.size; }
  private phase(c: number, major: boolean): Light {
    let t = (this.time + this.offset[c]) % CYCLE;
    if (!major) t = (t + GREEN + AMBER) % CYCLE;
    return t < GREEN ? 'green' : t < GREEN + AMBER ? 'amber' : 'red';
  }
  stateFor(node: number, dx: number, dz: number): Light {
    const c = this.cluster.get(node); if (c === undefined) return 'none';
    const l = Math.hypot(dx, dz) || 1, a = this.axis[c];
    return this.phase(c, Math.abs((dx * a[0] + dz * a[1]) / l) >= 0.7071);
  }
  addPole(s: SignalSpot, parent: THREE.Object3D, chunk: number) {
    const c = this.cluster.get(s.node); if (c === undefined) return;
    const a = this.axis[c];
    const r = s.yaw * Math.PI / 180, rx = Math.cos(r), rz = -Math.sin(r); // road's right vector (data space)
    const px = s.x - rx * (s.width / 2 + 1.2), pz = s.z - rz * (s.width / 2 + 1.2); // left kerb
    const obj = new THREE.Group();
    obj.position.set(px, 0, -pz);
    obj.rotation.y = -Math.atan2(a[0], a[1]);
    const pole = new THREE.Mesh(POLE_GEO, POLE_MAT); obj.add(pole);
    const major: THREE.MeshBasicMaterial[] = [], minor: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 3; i++) {
      const y = 5.05 - i * 0.42;
      const m1 = new THREE.MeshBasicMaterial({ color: 0x202020 }), m2 = new THREE.MeshBasicMaterial({ color: 0x202020 });
      for (const z of [0.29, -0.29]) { const b = new THREE.Mesh(LAMP_GEO_Z, m1); b.position.set(0, y, z); obj.add(b); }
      for (const x of [0.29, -0.29]) { const b = new THREE.Mesh(LAMP_GEO_X, m2); b.position.set(x, y, 0); obj.add(b); }
      major.push(m1); minor.push(m2);
    }
    parent.add(obj);
    this.poles.push({ cluster: c, major, minor, obj, chunk });
  }
  removeChunk(chunk: number) {
    this.poles = this.poles.filter(p => { if (p.chunk !== chunk) return true; p.major.concat(p.minor).forEach(m => m.dispose()); return false; });
  }
  update(dt: number) {
    this.time += dt;
    for (const p of this.poles) {
      paint(p.major, this.phase(p.cluster, true));
      paint(p.minor, this.phase(p.cluster, false));
    }
  }
}
const COLS: Record<string, number[]> = { red: [0xff2010, 0x202020, 0x202020], amber: [0x202020, 0xffa010, 0x202020], green: [0x202020, 0x202020, 0x20ff60] };
function paint(m: THREE.MeshBasicMaterial[], l: Light) { const c = COLS[l] || COLS.red; for (let i = 0; i < 3; i++) m[i].color.setHex(c[i]); }
const POLE_GEO = (() => { const mb = new MeshBuilder(); mb.cylinder(v3(0, 2.2, 0), v3(0, 1, 0), 0.08, 4.4, 6, [40, 40, 42], false); mb.box(v3(0, 4.6, 0), 0.55, 1.3, 0.55, [40, 40, 42]); return geoOf(mb); })();
const POLE_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const LAMP_GEO_Z = new THREE.BoxGeometry(0.26, 0.26, 0.05), LAMP_GEO_X = new THREE.BoxGeometry(0.05, 0.26, 0.26);

export function geoOf(mb: MeshBuilder) {
  const g = mb.finish(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(g.col, 3, true));
  geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
  return geo;
}

// ---------------------------------------------------------------- traffic
const MIX: [VClass, number][] = [['hatch', 22], ['sedan', 9], ['suv', 9], ['auto', 18], ['scooter', 16], ['bike', 13], ['taxi', 3], ['bus', 4], ['truck', 3], ['police', 1]];

export interface Obstacle { x: number; z: number; r: number }

export class TrafficAgent {
  from = 0; to = 0; s = 0; speed = 0; lane = 0; pers = 1; blocked = 0; knocked = 0; peek = -1; peekFrom = -1;
  sx = 0; sz = 0;
  constructor(public veh: Vehicle, private g: RoadGraph) {}

  init(a: number, b: number) {
    this.from = a; this.to = b; this.s = 0.5; this.speed = 0; this.knocked = 0; this.blocked = 0; this.peek = -1;
    this.pers = 0.75 + Math.random() * 0.35;
    this.lane = this.computeLane();
    const [x, z] = this.edgePoint(); this.sx = x; this.sz = z;
    const [dx, dz] = this.dir();
    this.veh.x = x; this.veh.z = z; this.veh.yaw = Math.atan2(dx, dz) * 180 / Math.PI;
  }
  private dir(): [number, number] { const g = this.g; const dx = g.X[this.to] - g.X[this.from], dz = g.Z[this.to] - g.Z[this.from], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
  private len() { return this.g.dist(this.from, this.to); }
  private computeLane() {
    const e = this.g.edgeBetween(this.from, this.to); if (e < 0) return 0;
    const road = this.g.roadOfEdge(e), w = road.width;
    if (road.oneway) { const lanes = Math.max(1, road.lanes || Math.round(w / 3.3)); return -w / 2 + (Math.floor(Math.random() * lanes) + 0.5) * w / lanes; }
    return this.veh.spec.two ? w * 0.4 : w * 0.25; // keep LEFT (India)
  }
  private edgePoint(): [number, number] {
    const g = this.g, [dx, dz] = this.dir();
    return [g.X[this.from] + dx * this.s - dz * this.lane, g.Z[this.from] + dz * this.s + dx * this.lane];
  }
  private choose(node: number, came: number): number {
    const g = this.g; let best = -1, bs = -Infinity;
    const ix = g.X[node] - g.X[came], iz = g.Z[node] - g.Z[came], il = Math.hypot(ix, iz) || 1;
    for (let k = 0; k < g.degree(node); k++) {
      const nb = g.neighbor(node, k); if (!nb.carOk || nb.node === came) continue;
      const road = g.roadOfEdge(nb.edge); if (!road.drivable) continue;
      const ox = g.X[nb.node] - g.X[node], oz = g.Z[nb.node] - g.Z[node], ol = Math.hypot(ox, oz) || 1;
      let sc = (ix * ox + iz * oz) / il / ol * 1.2 + road.rank * 0.25 + Math.random() * 1.6;
      if (road.rank <= 1) sc -= 2.5; if (!g.isMain(nb.node)) sc -= 5;
      if (sc > bs) { bs = sc; best = nb.node; }
    }
    if (best < 0) for (let k = 0; k < g.degree(node); k++) { const nb = g.neighbor(node, k); if (nb.carOk) return nb.node; }
    return best;
  }
  private peekNext() { if (this.peek >= 0 && this.peekFrom === this.to) return this.peek; this.peekFrom = this.to; this.peek = this.choose(this.to, this.from); return this.peek; }

  update(dt: number, signals: Signals, obstacles: Obstacle[], sirenNear: boolean): boolean {
    const g = this.g;
    if (this.knocked > 0) { this.knocked -= dt; this.speed = 0; this.veh.v = 0; return false; }
    const e = g.edgeBetween(this.from, this.to), road = e >= 0 ? g.roadOfEdge(e) : null;
    let target = Math.min((road ? road.speed : 30) / 3.6 * this.pers * 1.05, this.veh.maxV * 0.9);
    let L = this.len(), remain = L - this.s;
    let [dx, dz] = this.dir();
    const nx = this.peekNext();
    if (nx >= 0) {
      const ox = g.X[nx] - g.X[this.to], oz = g.Z[nx] - g.Z[this.to], ol = Math.hypot(ox, oz) || 1;
      const turn = Math.acos(Math.max(-1, Math.min(1, (dx * ox + dz * oz) / ol))) * 180 / Math.PI;
      if (turn > 25 && remain < 25) target = Math.min(target, 9 - (turn - 25) / 90 * 4.5 + remain * 0.25);
    }
    const f = g.flags[this.to];
    if ((f & NodeFlags.SpeedBump) && remain < 20) target = Math.min(target, 3.5 + remain * 0.15);
    if (f & NodeFlags.TrafficSignal) {
      const l = signals.stateFor(this.to, dx, dz), stop = remain - 6;
      if ((l === 'red' || (l === 'amber' && stop > this.speed * 1.2)) && stop > -2) target = Math.min(target, Math.max(0, stop) * 0.6);
    }
    // obstacles ahead
    const fx = Math.sin(this.veh.yaw * Math.PI / 180), fz = Math.cos(this.veh.yaw * Math.PI / 180);
    const look = 4 + this.speed * 1.7, half = this.veh.spec.L / 2, width = this.veh.spec.two ? 0.9 : 1.6;
    for (const o of obstacles) {
      const rx = o.x - this.veh.x, rz = o.z - this.veh.z;
      const along = rx * fx + rz * fz - half; if (along < 0 || along > look) continue;
      if (Math.abs(rx * fz - rz * fx) > width + o.r) continue;
      target = Math.min(target, Math.max(0, along - 1.5) * 0.55);
    }
    if (sirenNear) target = Math.min(target, 3);
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), (target > this.speed ? 2.6 : 7) * dt);
    let honk = false;
    if (this.speed < 0.3 && target < 0.5) { this.blocked += dt; if (this.blocked > 2.5 && Math.random() < 0.01) { honk = true; this.blocked = 0; } } else this.blocked = 0;
    this.s += this.speed * dt;
    let guard = 0;
    while (this.s >= L && guard++ < 4) {
      this.s -= L;
      const n2 = this.peekNext();
      if (n2 < 0) { this.s = L; this.speed = 0; break; }
      this.from = this.to; this.to = n2; this.peek = -1;
      this.lane = this.computeLane(); L = this.len(); [dx, dz] = this.dir();
    }
    const [px, pz] = this.edgePoint();
    const k = 1 - Math.exp(-dt * 6);
    this.sx += (px - this.sx) * k; this.sz += (pz - this.sz) * k;
    const want = Math.atan2(dx, dz) * 180 / Math.PI;
    let d = ((want - this.veh.yaw + 540) % 360) - 180;
    const maxTurn = (40 + this.speed * 18) * dt;
    d = Math.max(-maxTurn, Math.min(maxTurn, d));
    this.veh.yaw += d;
    this.veh.steer += ((d / Math.max(dt, 1e-3)) * 0.4 - this.veh.steer) * Math.min(1, dt * 5);
    this.veh.steer = Math.max(-this.veh.spec.steer, Math.min(this.veh.spec.steer, this.veh.steer));
    this.veh.x = this.sx; this.veh.z = this.sz; this.veh.v = this.speed;
    this.veh.braking = this.speed < target - 0.5 || target < 0.5;
    return honk;
  }
}

export class Traffic {
  agents: TrafficAgent[] = [];
  max = 24;
  private tick = 0;
  constructor(private world: World, private scene: THREE.Object3D, private signals: Signals) {}

  update(dt: number, px: number, pz: number, camFx: number, camFz: number, obstacles: Obstacle[], sirenNear: boolean, onHonk: (v: Vehicle) => void) {
    const all = obstacles.concat(this.agents.map(a => ({ x: a.veh.x, z: a.veh.z, r: a.veh.radius })));
    for (const a of this.agents) {
      if (a.update(dt, this.signals, all, sirenNear)) onHonk(a.veh);
      a.veh.sync(dt);
    }
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.25;
    this.agents = this.agents.filter(a => {
      const d = Math.hypot(a.veh.x - px, a.veh.z - pz);
      if (d > 330 || (this.agents.length > this.max && d > 90 && !this.visible(a.veh.x - px, a.veh.z - pz, camFx, camFz))) { this.scene.remove(a.veh.model.group); disposeModel(a.veh); return false; }
      return true;
    });
    for (let i = 0; i < 4 && this.agents.length < this.max; i++) this.trySpawn(px, pz, camFx, camFz);
  }

  private visible(rx: number, rz: number, fx: number, fz: number) { const l = Math.hypot(rx, rz) || 1; return (rx * fx + rz * fz) / l > 0.5; }

  private trySpawn(px: number, pz: number, fx: number, fz: number) {
    const g = this.world.graph, ang = Math.random() * Math.PI * 2, r = 90 + Math.random() * 170;
    const x = px + Math.cos(ang) * r, z = pz + Math.sin(ang) * r;
    if (!this.world.inBounds(x, z, -20)) return;
    const ok = (n: number) => { for (let k = 0; k < g.degree(n); k++) { const nb = g.neighbor(n, k); if (nb.carOk && g.roadOfEdge(nb.edge).traffic) return true; } return false; };
    const n = g.nearestNode(x, z, 60, true, ok); if (n < 0) return;
    const nx = g.X[n], nz = g.Z[n];
    if (Math.hypot(nx - px, nz - pz) < 72) return;
    if (this.visible(nx - px, nz - pz, fx, fz) && Math.hypot(nx - px, nz - pz) < 170) return;
    for (const a of this.agents) if (Math.hypot(a.veh.x - nx, a.veh.z - nz) < 9) return;
    const opts: number[] = [];
    for (let k = 0; k < g.degree(n); k++) { const nb = g.neighbor(n, k); if (nb.carOk && g.roadOfEdge(nb.edge).traffic) opts.push(nb.node); }
    if (!opts.length) return;
    const next = opts[Math.floor(Math.random() * opts.length)];
    const road = g.roadOfEdge(g.edgeBetween(n, next));
    let spec = pick();
    if ((spec.id === 'bus' || spec.id === 'truck') && road.width < 7) spec = SPECS.auto;
    const veh = new Vehicle(spec, undefined, undefined, !!spec.two);
    veh.ai = true;
    const a = new TrafficAgent(veh, g); a.init(n, next);
    this.scene.add(veh.model.group);
    veh.sync(0);
    this.agents.push(a);
  }

  /** remove agent without destroying the vehicle (player takes it) */
  release(a: TrafficAgent) { this.agents = this.agents.filter(x => x !== a); }

  clear() { for (const a of this.agents) { this.scene.remove(a.veh.model.group); disposeModel(a.veh); } this.agents = []; }
}

function pick(): Spec {
  const tot = MIX.reduce((s, m) => s + m[1], 0); let r = Math.random() * tot;
  for (const [id, w] of MIX) { r -= w; if (r <= 0) return SPECS[id]; }
  return SPECS.hatch;
}

export function disposeModel(v: Vehicle) {
  // every geometry belongs to this vehicle; only the plate material is per-vehicle (its texture is cached/shared)
  v.model.group.traverse(o => { const m = o as THREE.Mesh; if (!m.geometry) return; m.geometry.dispose(); const mat = m.material as THREE.MeshBasicMaterial; if (mat && mat.map) mat.dispose(); });
}

// ---------------------------------------------------------------- pedestrians
const SKIN: RGB[] = [[198, 140, 100], [170, 115, 80], [140, 95, 65], [214, 165, 125]];
const CLOTH: RGB[] = [[220, 40, 60], [240, 150, 30], [30, 120, 200], [40, 150, 90], [150, 50, 160], [245, 210, 60], [240, 240, 235], [180, 30, 100]];
const HUMAN_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

export class Humanoid {
  root = new THREE.Group(); legL: THREE.Object3D; legR: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D; phase = Math.random() * 6;
  constructor(shirt?: RGB, saree = Math.random() < 0.35) {
    const skin = SKIN[Math.floor(Math.random() * SKIN.length)], cloth = shirt || CLOTH[Math.floor(Math.random() * CLOTH.length)];
    const pants: RGB = Math.random() < 0.6 ? [40, 45, 70] : [90, 80, 70];
    const t = new MeshBuilder();
    t.frustum(v3(0, 0.9, 0), 0.34, 0.2, 0.42, 0.23, 0.58, 0, cloth);
    if (saree) t.frustum(v3(0, 0.04, 0), 0.5, 0.38, 0.34, 0.24, 0.88, 0, cloth);
    t.blob(v3(0, 1.67, 0), 0.105, 0.125, 0.115, 7, 5, skin);
    t.blob(v3(0, 1.72, -0.015), 0.11, 0.09, 0.115, 7, 3, [20, 18, 16]);
    this.root.add(new THREE.Mesh(geoOf(t), HUMAN_MAT));
    const limb = (x: number, y: number, len: number, w: number, col: RGB) => {
      const p = new THREE.Object3D(); p.position.set(x, y, 0);
      const mb = new MeshBuilder(); mb.box(v3(0, -len / 2, 0), w, len, w, col);
      p.add(new THREE.Mesh(geoOf(mb), HUMAN_MAT)); this.root.add(p); return p;
    };
    this.legL = limb(-0.1, 0.9, 0.86, 0.14, saree ? skin : pants); this.legR = limb(0.1, 0.9, 0.86, 0.14, saree ? skin : pants);
    this.armL = limb(-0.25, 1.45, 0.62, 0.1, saree ? skin : cloth); this.armR = limb(0.25, 1.45, 0.62, 0.1, saree ? skin : cloth);
    this.root.traverse(o => { o.castShadow = true; });
  }
  animate(speed: number, dt: number, seated = false) {
    if (seated) { for (const l of [this.legL, this.legR]) l.rotation.x = 1.4; for (const a of [this.armL, this.armR]) a.rotation.x = 1.0; return; }
    this.phase += dt * (2.2 + speed * 1.6);
    const amp = Math.min(1, speed / 1.4) * (speed > 3.5 ? 0.85 : 0.55), s = Math.sin(this.phase) * amp;
    this.legL.rotation.x = s; this.legR.rotation.x = -s; this.armL.rotation.x = -s * 0.8; this.armR.rotation.x = s * 0.8;
  }
  dispose() { this.root.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
}

export class Pedestrians {
  peds: { h: Humanoid; x: number; z: number; tx: number; tz: number; speed: number; down: number; yaw: number }[] = [];
  max = 18;
  private tick = 0;
  constructor(private world: World, private scene: THREE.Object3D) {}

  private spots(px: number, pz: number, min: number, max: number): [number, number][] {
    const out: [number, number][] = [];
    for (const arr of this.world.sidewalks.values())
      for (let i = 0; i < arr.length; i += 2) { const d = Math.hypot(arr[i] - px, arr[i + 1] - pz); if (d >= min && d <= max) out.push([arr[i], arr[i + 1]]); }
    return out;
  }

  update(dt: number, px: number, pz: number, vehicles: Vehicle[], onPlayerHit: () => void, playerVeh: Vehicle | null) {
    for (const p of this.peds) {
      if (p.down > 0) { p.down -= dt; if (p.down <= 0) p.h.root.rotation.x = 0; continue; }
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      if (d < 1.2) {
        const s = this.spots(p.x, p.z, 8, 45);
        if (s.length) { const t = s[Math.floor(Math.random() * s.length)]; p.tx = t[0]; p.tz = t[1]; }
        else { p.tx = p.x + (Math.random() - 0.5) * 20; p.tz = p.z + (Math.random() - 0.5) * 20; }
      } else { p.x += dx / d * p.speed * dt; p.z += dz / d * p.speed * dt; p.yaw = Math.atan2(dx, dz); }
      for (const v of vehicles) {
        if (v.kmh < 7) continue;
        if (Math.hypot(v.x - p.x, v.z - p.z) < v.radius + 0.4) {
          p.down = 6; p.h.root.rotation.x = -1.45;
          const [fx, fz] = v.forward(); p.x += fx * 1.5; p.z += fz * 1.5;
          if (v === playerVeh) onPlayerHit();
          break;
        }
      }
      p.h.root.position.set(p.x, 0.06, -p.z);
      p.h.root.rotation.y = -p.yaw;
      p.h.animate(p.down > 0 ? 0 : p.speed, dt);
    }
    this.tick -= dt; if (this.tick > 0) return; this.tick = 0.5;
    this.peds = this.peds.filter(p => { if (Math.hypot(p.x - px, p.z - pz) > 140) { this.scene.remove(p.h.root); p.h.dispose(); return false; } return true; });
    if (this.peds.length < this.max) {
      const s = this.spots(px, pz, 25, 110);
      for (let i = 0; i < 3 && s.length && this.peds.length < this.max; i++) {
        const [x, z] = s[Math.floor(Math.random() * s.length)];
        const h = new Humanoid(); this.scene.add(h.root);
        this.peds.push({ h, x, z, tx: x, tz: z, speed: 1 + Math.random() * 0.6, down: 0, yaw: 0 });
      }
    }
  }
  clear() { for (const p of this.peds) { this.scene.remove(p.h.root); p.h.dispose(); } this.peds = []; }
}
