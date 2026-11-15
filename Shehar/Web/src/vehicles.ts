// Vehicles: unbranded Indian archetypes, procedural low-poly models (right-hand drive, Indian plates) and an
// arcade driving model (bicycle-model steering, grip-limited cornering, handbrake drifts, bounce on collisions).
// All gameplay maths is in data space: x = east, z = north, yaw = degrees clockwise from north.
import * as THREE from 'three';
import { MeshBuilder, RGB, v3 } from './mesh';

export type VClass = 'hatch' | 'sedan' | 'suv' | 'sports' | 'auto' | 'scooter' | 'bike' | 'taxi' | 'bus' | 'truck';
export interface Spec {
  id: VClass; name: string; maxKmh: number; accel: number; brake: number; steer: number; grip: number;
  L: number; W: number; H: number; wb: number; track: number; R: number; two?: boolean; three?: boolean; commercial?: boolean;
  colors: RGB[]; horn: number;
}
export const SPECS: Record<VClass, Spec> = {
  hatch: { id: 'hatch', name: 'Compact Hatchback', maxKmh: 150, accel: 5.0, brake: 9, steer: 34, grip: 8.5, L: 3.7, W: 1.62, H: 1.52, wb: 2.42, track: 1.38, R: 0.29, colors: [[218, 218, 220], [180, 20, 20], [240, 240, 240], [40, 76, 150], [115, 115, 120]], horn: 420 },
  sedan: { id: 'sedan', name: 'Family Sedan', maxKmh: 180, accel: 5.5, brake: 9, steer: 33, grip: 8.8, L: 4.4, W: 1.72, H: 1.48, wb: 2.65, track: 1.5, R: 0.31, colors: [[242, 242, 242], [30, 30, 36], [140, 143, 152], [90, 38, 30]], horn: 410 },
  suv: { id: 'suv', name: 'Seven-Seater SUV', maxKmh: 175, accel: 5.2, brake: 8.5, steer: 32, grip: 8.0, L: 4.6, W: 1.86, H: 1.85, wb: 2.75, track: 1.58, R: 0.37, colors: [[22, 22, 24], [235, 235, 235], [64, 76, 56], [128, 26, 26]], horn: 380 },
  sports: { id: 'sports', name: 'Sports Coupe', maxKmh: 260, accel: 8.5, brake: 11, steer: 32, grip: 10.5, L: 4.5, W: 1.9, H: 1.25, wb: 2.65, track: 1.62, R: 0.33, colors: [[242, 140, 12], [205, 14, 14], [14, 64, 166], [242, 216, 26]], horn: 470 },
  auto: { id: 'auto', name: 'Auto-rickshaw', maxKmh: 55, accel: 2.6, brake: 6, steer: 40, grip: 6.0, L: 2.65, W: 1.3, H: 1.75, wb: 1.95, track: 1.15, R: 0.2, three: true, commercial: true, colors: [[22, 22, 22]], horn: 330 },
  scooter: { id: 'scooter', name: '110cc Scooter', maxKmh: 85, accel: 3.6, brake: 7, steer: 30, grip: 7.5, L: 1.8, W: 0.7, H: 1.15, wb: 1.26, track: 0.36, R: 0.25, two: true, colors: [[240, 240, 240], [26, 102, 190], [190, 26, 38], [52, 52, 52]], horn: 610 },
  bike: { id: 'bike', name: '150cc Motorcycle', maxKmh: 115, accel: 5.0, brake: 8, steer: 28, grip: 8.0, L: 2.0, W: 0.75, H: 1.1, wb: 1.33, track: 0.36, R: 0.31, two: true, colors: [[26, 26, 26], [190, 14, 14], [26, 52, 152]], horn: 640 },
  taxi: { id: 'taxi', name: 'City Taxi', maxKmh: 165, accel: 5.0, brake: 9, steer: 33, grip: 8.5, L: 4.25, W: 1.7, H: 1.5, wb: 2.6, track: 1.48, R: 0.3, commercial: true, colors: [[242, 242, 236]], horn: 420 },
  bus: { id: 'bus', name: 'City Bus', maxKmh: 80, accel: 1.8, brake: 5, steer: 38, grip: 5.5, L: 11.5, W: 2.55, H: 3.2, wb: 6.1, track: 2.05, R: 0.5, commercial: true, colors: [[216, 90, 30], [38, 115, 64], [52, 90, 166]], horn: 240 },
  truck: { id: 'truck', name: 'Goods Truck', maxKmh: 80, accel: 1.9, brake: 5, steer: 36, grip: 5.5, L: 8.5, W: 2.5, H: 3.4, wb: 4.8, track: 2.0, R: 0.5, commercial: true, colors: [[242, 128, 12], [26, 90, 178], [204, 26, 26]], horn: 250 },
};

export function randomPlate(): string {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ', r = (n: number) => Math.floor(Math.random() * n);
  return 'MH ' + (Math.random() < 0.8 ? '12' : '14') + ' ' + L[r(L.length)] + L[r(L.length)] + ' ' + String(1 + r(9998)).padStart(4, '0');
}

const plateTexCache = new Map<string, THREE.Texture>();
function plateTexture(text: string, commercial: boolean): THREE.Texture {
  const k = text + commercial;
  let t = plateTexCache.get(k);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = commercial ? '#ffd21a' : '#ffffff'; g.fillRect(0, 0, 128, 32);
  g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 30);
  g.fillStyle = '#111'; g.font = 'bold 19px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 17);
  t = new THREE.CanvasTexture(c);
  if (plateTexCache.size > 60) plateTexCache.clear();
  plateTexCache.set(k, t);
  return t;
}

const sharedMats = {
  body: new THREE.MeshLambertMaterial({ vertexColors: true }),
  head: new THREE.MeshBasicMaterial({ color: 0xfff6dc }),
  tail: new THREE.MeshBasicMaterial({ color: 0x8a0a06 }),
  tailOn: new THREE.MeshBasicMaterial({ color: 0xff2010 }),
  tyre: new THREE.MeshLambertMaterial({ color: 0x1c1c1c }),
};

export interface VehicleModel { group: THREE.Group; body: THREE.Group; wheels: { obj: THREE.Object3D; front: boolean; r: number }[]; tail: THREE.Mesh; head: THREE.Mesh; seatY: number; headY: number; headX: number; headZ: number; door: THREE.Object3D | null }

/** builds a model in three space; local forward is -z, right-hand-drive seat at +x */
export function buildModel(s: Spec, paint: RGB, plate: string, rider = false): VehicleModel {
  const mb = new MeshBuilder(), head = new MeshBuilder(), tail = new MeshBuilder();
  const { L, W, H, R } = s;
  const trim: RGB = [32, 32, 34], glass: RGB = [36, 48, 60];
  let headY = H * 0.85, headX = 0, headZ = 0, seatY = 0.5;
  let doorDef: { mb: MeshBuilder; x: number; y: number; z: number } | null = null;
  if (s.id === 'auto') {
    const black: RGB = [22, 22, 22], yellow: RGB = [245, 196, 20];
    mb.box(v3(0, 0.36, -0.15), W, 0.12, L * 0.8, black);
    mb.frustum(v3(0, 0.42, -0.55), W, 1.25, W * 0.98, 1.2, 0.45, 0, black);
    mb.frustum(v3(0, 0.3, L / 2 - 0.35), 0.62, 0.7, 0.5, 0.35, 0.9, -0.1, black);
    mb.frustum(v3(0, H - 0.12, -0.2), W * 1.02, L * 0.78, W * 0.9, L * 0.68, 0.14, -0.05, yellow);
    mb.box(v3(0, (0.9 + H) / 2, -L * 0.36), W * 0.98, H - 0.95, 0.05, yellow);
    mb.box(v3(0, 0.62, -L * 0.36 + 0.02), W * 0.9, 0.16, 0.05, [40, 120, 60]);
    for (const sx of [-1, 1]) for (const z of [L * 0.17, -L * 0.34]) mb.box(v3(sx * W * 0.48, (0.85 + H) / 2, z), 0.04, H - 0.85, 0.04, black);
    mb.box(v3(0, 1.32, L * 0.18), W * 0.78, 0.6, 0.03, glass);
    mb.box(v3(0, 0.72, -0.62), W * 0.9, 0.18, 0.55, [80, 50, 40]);
    head.box(v3(0, 0.95, L / 2 - 0.2), 0.22, 0.18, 0.05, [255, 255, 255]);
    for (const sx of [-1, 1]) tail.box(v3(sx * W * 0.42, 0.55, -L * 0.36 - 0.03), 0.1, 0.08, 0.04, [255, 255, 255]);
    headY = 1.45; headZ = 0.3; seatY = 0.78;
  } else if (s.two) {
    const scooter = s.id === 'scooter';
    if (scooter) {
      mb.frustum(v3(0, 0.2, 0.45), 0.42, 0.25, 0.36, 0.18, 0.85, 0.05, paint);
      mb.box(v3(0, 0.3, -0.05), 0.3, 0.12, 0.6, paint);
      mb.frustum(v3(0, 0.3, -0.45), 0.42, 0.7, 0.36, 0.6, 0.42, 0, paint);
    } else {
      mb.frustum(v3(0, 0.75, 0.22), 0.32, 0.5, 0.26, 0.38, 0.22, -0.03, paint);
      mb.box(v3(0, 0.55, 0), 0.22, 0.3, 0.6, trim);
      mb.box(v3(0, 0.82, -0.62), 0.24, 0.12, 0.45, paint);
    }
    mb.box(v3(0, 0.8, -0.25), 0.3, 0.1, 0.7, [20, 20, 20]);
    mb.box(v3(0, 1.05, L / 2 - 0.33), 0.72, 0.04, 0.04, [190, 190, 190]);
    head.box(v3(0, 0.98, L / 2 - 0.22), 0.16, 0.14, 0.06, [255, 255, 255]);
    tail.box(v3(0, 0.82, -L / 2 + 0.1), 0.14, 0.06, 0.04, [255, 255, 255]);
    if (rider) {
      const shirt: RGB = [40 + Math.random() * 190, 40 + Math.random() * 190, 40 + Math.random() * 190];
      mb.box(v3(0, 1.2, -0.18), 0.42, 0.6, 0.25, shirt);
      mb.blob(v3(0, 1.62, -0.12), 0.15, 0.16, 0.17, 6, 4, [30, 30, 30]);
      for (const sx of [-1, 1]) { mb.box(v3(sx * 0.13, 0.78, 0.02), 0.13, 0.14, 0.5, [40, 40, 60]); mb.box(v3(sx * 0.25, 1.25, 0.22), 0.09, 0.09, 0.5, shirt); }
    }
    headY = 1.55; headZ = -0.1; seatY = 0.85;
  } else if (s.id === 'bus' || s.id === 'truck') {
    const clear = s.id === 'bus' ? 0.45 : 0.55;
    if (s.id === 'bus') {
      mb.box(v3(0, (clear + 1.55) / 2, 0), W, 1.55 - clear, L, paint);
      mb.box(v3(0, (2.65 + H) / 2, 0), W, H - 2.65, L, [238, 238, 232]);
      mb.box(v3(0, 2.1, -0.3), W + 0.01, 1.1, L - 1.4, glass);
      mb.box(v3(0, 2.0, L / 2 - 0.01), W * 0.94, 1.3, 0.04, glass);
      for (let i = 0; i < 7; i++) mb.box(v3(0, 2.1, -L / 2 + 0.9 + i * (L - 1.8) / 6), W + 0.02, 1.1, 0.08, paint);
    } else {
      const cab = 2.2;
      mb.box(v3(0, (clear + 2.7) / 2, L / 2 - cab / 2), W * 0.98, 2.7 - clear, cab, paint);
      mb.box(v3(0, 2.1, L / 2 + 0.005), W * 0.85, 0.75, 0.04, glass);
      mb.box(v3(0, 2.85, L / 2 - cab / 2 + 0.1), W * 0.9, 0.3, cab * 0.8, [220, 40, 40]);
      mb.box(v3(0, (1.1 + H) / 2, -cab / 2 + 0.05), W, H - 1.1, L - cab - 0.2, [150, 95, 50]);
      for (let i = 0; i < 4; i++) mb.box(v3(0, 1.4 + i * 0.5, -L / 2 + 0.06), W * 1.001, 0.08, 0.05, i % 2 ? [30, 120, 60] : [250, 200, 20]);
    }
    for (const sx of [-1, 1]) { head.box(v3(sx * W * 0.37, 0.9, L / 2 + 0.01), 0.28, 0.18, 0.05, [255, 255, 255]); tail.box(v3(sx * W * 0.41, 0.95, -L / 2 - 0.01), 0.2, 0.2, 0.05, [255, 255, 255]); }
    headY = 2.25; headX = W * 0.28; headZ = L / 2 - 1.1; seatY = 1.55;
  } else {
    const clear = R * 0.55, belt = clear + (H - clear) * 0.48;
    let Lc = L * 0.5, zc = -L * 0.03, topK = 0.68;
    if (s.id === 'hatch') { Lc = L * 0.6; zc = -L * 0.1; topK = 0.78; }
    if (s.id === 'suv') { Lc = L * 0.7; zc = -L * 0.1; topK = 0.86; }
    if (s.id === 'sports') { Lc = L * 0.42; zc = -L * 0.08; topK = 0.55; }
    mb.frustum(v3(0, clear, 0), W, L, W * 0.97, L * 0.95, belt - clear, 0, paint);
    mb.frustum(v3(0, belt, zc), W * 0.92, Lc, W * 0.78, Lc * topK, H - belt - 0.06, -Lc * 0.04, glass);
    mb.box(v3(0, H - 0.03, zc - Lc * 0.04), W * 0.78, 0.07, Lc * topK * 0.98, paint);
    for (const sx of [-1, 1]) mb.box(v3(sx * W * 0.43, (belt + H) / 2, zc - Lc * 0.04), 0.05, H - belt, 0.12, paint);
    mb.box(v3(0, clear + 0.14, L / 2 + 0.02), W * 0.98, 0.26, 0.12, trim);
    mb.box(v3(0, clear + 0.14, -L / 2 - 0.02), W * 0.98, 0.26, 0.12, trim);
    for (const sx of [-1, 1]) {
      head.box(v3(sx * W * 0.34, belt - 0.14, L / 2 + 0.01), 0.34, 0.12, 0.05, [255, 255, 255]);
      tail.box(v3(sx * W * 0.37, belt - 0.12, -L / 2 - 0.01), 0.3, 0.12, 0.05, [255, 255, 255]);
      mb.box(v3(sx * (W / 2 + 0.06), belt + 0.05, zc + Lc * 0.38), 0.12, 0.1, 0.08, trim);
    }
    mb.box(v3(0, belt - 0.02, zc + Lc * 0.4), W * 0.86, 0.2, 0.3, [45, 42, 40]);          // dashboard
    mb.cylinder(v3(W * 0.22, belt + 0.1, zc + Lc * 0.3), v3(0, 0.45, -1), 0.17, 0.035, 10, trim); // RHD steering wheel
    if (s.id === 'taxi') mb.box(v3(0, H + 0.12, zc), 0.6, 0.2, 0.22, [250, 205, 20]);
    // driver door (right side - Indian cars are right-hand drive): separate panel hinged at its front edge
    const door = new MeshBuilder();
    door.box(v3(0.03, (belt - clear) / 2 + 0.02, -0.5), 0.05, belt - clear - 0.06, 1.0, paint);
    door.box(v3(0.08, belt - 0.12, -0.85), 0.05, 0.04, 0.16, [200, 200, 200]); // handle
    doorDef = { mb: door, x: W / 2 + 0.005, y: clear, z: zc + Lc * 0.38 };
    headY = belt + 0.38; headX = W * 0.22; headZ = zc - Lc * 0.06; seatY = clear + 0.4;
  }
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const bodyMesh = new THREE.Mesh(toGeo(mb), sharedMats.body); bodyMesh.castShadow = true; body.add(bodyMesh);
  const headMesh = new THREE.Mesh(toGeo(head), sharedMats.head); body.add(headMesh);
  const tailMesh = new THREE.Mesh(toGeo(tail), sharedMats.tail); body.add(tailMesh);
  // number plates (front + rear); two-wheelers rear only
  const plateY = s.two ? 0.72 : s.id === 'auto' ? 0.5 : (s.id === 'bus' || s.id === 'truck') ? 0.75 : R * 0.55 + 0.32;
  const pg = new THREE.PlaneGeometry(0.52, 0.13), pm = new THREE.MeshBasicMaterial({ map: plateTexture(plate, !!s.commercial) });
  if (!s.two) { const f = new THREE.Mesh(pg, pm); f.position.set(0, plateY, -(L / 2 + 0.075)); f.rotation.y = Math.PI; body.add(f); }
  const r = new THREE.Mesh(pg, pm); r.position.set(0, plateY, L / 2 + 0.075); body.add(r);
  // wheels
  const wheels: VehicleModel['wheels'] = [];
  const tw = s.two || s.three ? 0.12 : s.id === 'bus' || s.id === 'truck' ? 0.35 : 0.22;
  const wgeo = new THREE.CylinderGeometry(R, R, tw, 12); wgeo.rotateZ(Math.PI / 2);
  const pos: [number, number, boolean][] = [];
  const hb = s.wb / 2, ht = s.track / 2;
  if (s.two) pos.push([0, hb, true], [0, -hb, false]);
  else if (s.three) pos.push([0, hb, true], [-ht, -hb, false], [ht, -hb, false]);
  else { pos.push([-ht, hb, true], [ht, hb, true], [-ht, -hb, false], [ht, -hb, false]); if (s.id === 'bus' || s.id === 'truck') pos.push([-ht, -hb + 1.3, false], [ht, -hb + 1.3, false]); }
  for (const [x, z, front] of pos) {
    const pivot = new THREE.Object3D(); pivot.position.set(x, R, -z);
    const w = new THREE.Mesh(wgeo, sharedMats.tyre); pivot.add(w);
    group.add(pivot); wheels.push({ obj: pivot, front, r: R });
  }
  let doorPivot: THREE.Object3D | null = null;
  if (doorDef) {
    doorPivot = new THREE.Object3D(); doorPivot.position.set(doorDef.x, doorDef.y, -doorDef.z);
    const dm = new THREE.Mesh(toGeo(doorDef.mb), sharedMats.body); dm.castShadow = true; doorPivot.add(dm); body.add(doorPivot);
  }
  return { group, body, wheels, tail: tailMesh, head: headMesh, seatY, headY, headX, headZ: -headZ, door: doorPivot };
}

function toGeo(mb: MeshBuilder): THREE.BufferGeometry {
  const g = mb.finish(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(g.col, 3, true));
  geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
  return geo;
}

export interface Controls { throttle: number; steer: number; handbrake: boolean; boost: boolean }

export class Vehicle {
  x = 0; z = 0; yaw = 0; v = 0; steer = 0; health = 100; fuel = 1;
  drift = 0; yawRate = 0; braking = false; occupied = false; ai = false;
  heli: import('./heli').Helicopter | null = null;
  model: VehicleModel; spin = 0; pitch = 0; roll = 0;
  readonly radius: number;
  constructor(public spec: Spec, paint?: RGB, public plate = randomPlate(), rider = false) {
    this.model = buildModel(spec, paint || spec.colors[Math.floor(Math.random() * spec.colors.length)], plate, rider);
    this.radius = Math.max(0.45, spec.W * 0.55);
  }
  get kmh() { return Math.abs(this.v) * 3.6; }
  get maxV() { return this.spec.maxKmh / 3.6; }

  /** arcade physics step (player-driven) */
  /** slope = rise per metre along the heading (from the terrain); steerSens from settings */
  drive(c: Controls, dt: number, grip = 1, slope = 0, steerSens = 1) {
    const s = this.spec, v = this.v, sp = Math.abs(v);
    const steerMax = s.steer * (1 - 0.75 * Math.min(1, sp / 40)) * Math.min(1.4, 0.6 + 0.4 * steerSens);
    this.steer += Math.sign(c.steer * steerMax - this.steer) * Math.min(Math.abs(c.steer * steerMax - this.steer), s.steer * 4 * steerSens * dt);
    const dead = this.health <= 0 || this.fuel <= 0;
    let a = 0;
    this.braking = false;
    const vmax = this.maxV * (c.boost ? 1.12 : 1);
    if (c.throttle > 0.05) {
      if (v < -0.5) { a = s.brake * c.throttle; this.braking = true; }
      else if (!dead) a = s.accel * (c.boost ? 1.35 : 1) * c.throttle * Math.max(0, 1 - (v / vmax) ** 2);
    } else if (c.throttle < -0.05) {
      if (v > 0.5) { a = s.brake * c.throttle; this.braking = true; }
      else if (!dead) a = v > -6 ? s.accel * 0.6 * c.throttle : 0;
    } else a = -Math.sign(v) * Math.min(Math.abs(v) / dt, 1.2);
    if (c.handbrake) { a += -Math.sign(v) * Math.min(Math.abs(v) / dt, 5.5); this.braking = true; }
    a -= 9.81 * Math.max(-0.35, Math.min(0.35, slope)) * 0.85; // gravity on Pune's slopes
    this.v = v + a * dt - v * Math.abs(v) * 0.0012 * dt;
    if (Math.abs(this.v) < 0.05 && Math.abs(c.throttle) < 0.05) this.v = 0;
    // steering: bicycle model limited by tyre grip (lateral acceleration)
    let yawRate = this.v / s.wb * Math.tan(this.steer * Math.PI / 180);
    const gripA = s.grip * grip * (c.handbrake ? 0.55 : 1);
    if (sp > 0.5) yawRate = Math.max(-gripA / sp, Math.min(gripA / sp, yawRate));
    const targetDrift = c.handbrake && sp > 7 ? Math.sign(this.steer) * Math.min(35, sp * 1.5) : 0;
    this.drift += (targetDrift - this.drift) * Math.min(1, dt * (targetDrift ? 2.5 : 3.5));
    if (c.handbrake && sp > 7) yawRate *= 1.35;
    this.yawRate = yawRate;
    this.yaw += yawRate * dt * 180 / Math.PI;
    const mv = (this.yaw - this.drift * 0.6) * Math.PI / 180;
    this.x += Math.sin(mv) * this.v * dt;
    this.z += Math.cos(mv) * this.v * dt;
    if (!dead) this.fuel = Math.max(0, this.fuel - (0.0001 + Math.abs(this.v) * 0.00003 * (c.throttle > 0 ? 1.4 : 0.6)) * dt);
    this.pitch += ((a * 0.004) - this.pitch) * Math.min(1, dt * 5);
    this.roll += ((yawRate * this.v * 0.006) - this.roll) * Math.min(1, dt * 5);
  }

  /** writes x/z/yaw into the three.js object (three space: x, -z, rotation.y = -yaw) */
  y = 0; tPitch = 0; tRoll = 0; doorOpen = 0;
  sync(dt: number, ter?: { h(x: number, z: number): number }) {
    const m = this.model;
    if (ter) {
      // sit on the terrain: height at the centre, pitch / roll from the ground under the wheels
      const r = this.yaw * Math.PI / 180, fx = Math.sin(r), fz = Math.cos(r), rx = Math.cos(r), rz = -Math.sin(r);
      const hb = Math.max(1.6, this.spec.wb * 0.75), ht = Math.max(1.2, this.spec.track * 0.9); // wide baseline smooths SRTM noise
      const hf = ter.h(this.x + fx * hb, this.z + fz * hb), hr = ter.h(this.x - fx * hb, this.z - fz * hb);
      const hR = ter.h(this.x + rx * ht, this.z + rz * ht), hL = ter.h(this.x - rx * ht, this.z - rz * ht);
      const k = Math.min(1, dt * 10);
      this.y += ((hf + hr + hR + hL) / 4 - this.y) * (this.y === 0 ? 1 : k);
      const pt = Math.max(-0.2, Math.min(0.2, Math.atan2(hf - hr, 2 * hb))), rl = this.spec.two ? 0 : Math.max(-0.1, Math.min(0.1, Math.atan2(hR - hL, 2 * ht)));
      this.tPitch += (pt - this.tPitch) * k;
      this.tRoll += (rl - this.tRoll) * k;
    }
    m.group.position.set(this.x, this.y + 0.06, -this.z);
    m.group.rotation.set(this.tPitch, -this.yaw * Math.PI / 180, this.tRoll, 'YXZ');
    if (m.door) m.door.rotation.y = this.doorOpen * 1.15;
    const two = this.spec.two;
    m.body.rotation.x = two ? 0 : this.pitch;
    m.body.rotation.z = two ? Math.max(-0.5, Math.min(0.5, -this.steer / this.spec.steer * Math.min(1, Math.abs(this.v) / 6) * 0.45)) : this.roll;
    this.spin += this.v / this.spec.R * dt;
    for (const w of m.wheels) {
      w.obj.rotation.set(0, w.front ? -this.steer * Math.PI / 180 : 0, 0);
      (w.obj.children[0] as THREE.Object3D).rotation.x = -this.spin;
    }
    m.tail.material = this.braking ? sharedMats.tailOn : sharedMats.tail;
  }

  forward(): [number, number] { const r = this.yaw * Math.PI / 180; return [Math.sin(r), Math.cos(r)]; }
}
