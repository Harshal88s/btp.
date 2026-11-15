// Helicopter cheat: transforms the current car into a working helicopter (and back).
// Flight model: rotor spool-up, collective (climb / descend), cyclic (fly forward / back), yaw, banking,
// hover hold, landing on the ground or on rooftops, and building collision.
import * as THREE from 'three';
import { MeshBuilder, RGB, v3 } from './mesh';
import { Vehicle } from './vehicles';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
function geo(mb: MeshBuilder) {
  const g = mb.finish(), b = new THREE.BufferGeometry();
  b.setAttribute('position', new THREE.BufferAttribute(g.pos, 3)); b.setAttribute('normal', new THREE.BufferAttribute(g.nrm, 3));
  b.setAttribute('color', new THREE.BufferAttribute(g.col, 3, true)); b.setIndex(new THREE.BufferAttribute(g.idx, 1));
  return b;
}

export function buildHeli(paint: RGB) {
  const group = new THREE.Group(), body = new MeshBuilder(), glass: RGB = [40, 60, 80], dark: RGB = [40, 40, 44];
  body.blob(v3(0, 1.6, 0.2), 1.25, 1.15, 2.3, 12, 8, paint);                 // fuselage
  body.blob(v3(0, 1.75, 1.35), 1.0, 0.85, 1.3, 12, 8, glass);                // cockpit bubble (front)
  body.cylinder(v3(0, 1.85, -3.4), v3(0, 0.08, -1), 0.28, 4.6, 8, paint);    // tail boom
  body.box(v3(0, 2.6, -5.5), 0.12, 1.4, 0.9, paint);                         // fin
  body.box(v3(0, 1.95, -5.3), 1.6, 0.08, 0.5, paint);                        // stabiliser
  body.box(v3(0, 2.95, 0), 0.5, 0.5, 0.9, dark);                             // rotor mast housing
  for (const s of [-1, 1]) {
    body.cylinder(v3(s * 1.0, 0.18, 0.2), v3(0, 0, 1), 0.07, 3.8, 6, dark);  // skids
    body.box(v3(s * 0.85, 0.6, 1.0), 0.07, 0.85, 0.07, dark); body.box(v3(s * 0.85, 0.6, -0.6), 0.07, 0.85, 0.07, dark);
  }
  body.box(v3(0, 1.2, 2.1), 0.5, 0.2, 0.1, [255, 240, 200]);                  // landing light
  const bodyMesh = new THREE.Mesh(geo(body), MAT); bodyMesh.castShadow = true; group.add(bodyMesh);
  const rotor = new THREE.Group(); rotor.position.set(0, 3.3, 0); group.add(rotor);
  const r = new MeshBuilder();
  for (let k = 0; k < 4; k++) { const a = k * 90; r.box(v3(Math.sin(a * Math.PI / 180) * 3.6, 0, Math.cos(a * Math.PI / 180) * 3.6), 0.35, 0.05, 7.2, dark, a); }
  r.cylinder(v3(0, 0, 0), v3(0, 1, 0), 0.25, 0.3, 8, dark);
  const rm = new THREE.Mesh(geo(r), MAT); rm.castShadow = true; rotor.add(rm);
  const tail = new THREE.Group(); tail.position.set(0.2, 2.6, 5.6); group.add(tail);
  const tr = new MeshBuilder(); tr.box(v3(0, 0, 0), 0.04, 1.5, 0.18, dark); tr.box(v3(0, 0, 0), 0.04, 0.18, 1.5, dark);
  tail.add(new THREE.Mesh(geo(tr), MAT));
  return { group, rotor, tail };
}

export interface HeliControls { forward: number; turn: number; up: boolean; down: boolean; boost: boolean }

export class Helicopter {
  model: ReturnType<typeof buildHeli>;
  rpm = 0; vy = 0; fwd = 0; side = 0; landed = true; morph = 0; reverting = false;
  pitch = 0; roll = 0;
  constructor(public v: Vehicle, paint: RGB) {
    this.model = buildHeli(paint);
    this.model.group.scale.setScalar(0.001);
    v.model.group.add(this.model.group);
  }

  /** transformation progress 0..1 (car -> helicopter), reversed when reverting */
  morphStep(dt: number): boolean {
    this.morph = Math.max(0, Math.min(1, this.morph + (this.reverting ? -dt : dt) / 1.6));
    const t = this.morph, ease = t * t * (3 - 2 * t);
    const car = this.v.model.body, wheels = this.v.model.wheels;
    car.scale.setScalar(Math.max(0.001, 1 - ease));
    car.rotation.y = ease * Math.PI * 2;
    for (const w of wheels) w.obj.scale.setScalar(Math.max(0.001, 1 - ease));
    this.model.group.scale.setScalar(Math.max(0.001, ease));
    this.model.group.rotation.y = (1 - ease) * -Math.PI;
    this.model.rotor.rotation.y += dt * 30 * ease;
    return this.reverting ? t <= 0 : t >= 1;
  }

  /** returns impact speed when hitting something (for sound / damage) */
  fly(c: HeliControls, dt: number, ground: (x: number, z: number) => number, collide: (x: number, z: number, r: number, y: number) => { x: number; z: number } | null, steerSens = 1): number {
    const v = this.v;
    this.rpm = Math.min(1, this.rpm + dt * 0.6);
    const lift = this.rpm > 0.85;
    const targetVy = lift ? (c.up ? 9 : 0) - (c.down ? 7 : 0) : -2;
    this.vy += (targetVy - this.vy) * Math.min(1, dt * 2.2);
    const maxF = c.boost ? 62 : 40;
    this.fwd += ((lift && !this.landed ? c.forward * maxF : 0) - this.fwd) * Math.min(1, dt * (Math.abs(c.forward) > 0.05 ? 0.9 : 0.6));
    const yawRate = (this.landed ? 0.25 : 1) * c.turn * 70 * steerSens;
    v.yaw += yawRate * dt;
    const r = v.yaw * Math.PI / 180;
    let nx = v.x + Math.sin(r) * this.fwd * dt, nz = v.z + Math.cos(r) * this.fwd * dt;
    let ny = v.y + this.vy * dt;
    let impact = 0;
    const hit = collide(nx, nz, 4.2, ny);
    if (hit) { impact = Math.abs(this.fwd); nx = hit.x; nz = hit.z; this.fwd *= -0.25; }
    const g = ground(nx, nz) + 0.02;
    if (ny <= g) {
      if (this.vy < -4) impact = Math.max(impact, -this.vy);
      ny = g; this.vy = Math.max(0, this.vy); this.landed = !(c.up && lift); this.fwd *= 0.85;
    } else this.landed = false;
    ny = Math.min(ny, 650);
    v.x = nx; v.z = nz; v.y = ny; v.v = this.fwd;
    // body attitude: nose down when flying forward, bank into turns
    this.pitch += ((this.landed ? 0 : -c.forward * 0.22 - (this.fwd / maxF) * 0.08) - this.pitch) * Math.min(1, dt * 3);
    this.roll += ((this.landed ? 0 : -c.turn * 0.25 * Math.min(1, Math.abs(this.fwd) / 10 + 0.3)) - this.roll) * Math.min(1, dt * 3);
    return impact;
  }

  sync(dt: number) {
    const m = this.v.model;
    m.group.position.set(this.v.x, this.v.y, -this.v.z);
    m.group.rotation.set(this.pitch, -this.v.yaw * Math.PI / 180, this.roll, 'YXZ');
    this.model.rotor.rotation.y += dt * (4 + this.rpm * 32);
    this.model.tail.rotation.x += dt * (6 + this.rpm * 45);
  }

  dispose() {
    this.v.model.group.remove(this.model.group);
    this.model.group.traverse(o => { const mm = o as THREE.Mesh; if (mm.geometry) mm.geometry.dispose(); });
    this.v.model.body.scale.setScalar(1); this.v.model.body.rotation.set(0, 0, 0);
    for (const w of this.v.model.wheels) w.obj.scale.setScalar(1);
  }
}
