// Axis convention (three.js, character faces -z): +rotation.x swings a hanging limb FORWARD.
// Articulated procedural humanoid with smooth, speed-driven animation (no stiff on/off poses):
//  - gait phase advances with distance travelled (stride length grows with speed) -> no foot sliding
//  - walk / jog / run blend continuously; knees and elbows bend; torso leans into acceleration and turns
//  - idle breathing + weight shift, jump anticipation, airborne tuck, landing squash, seated (driving) pose
//  - every joint eases toward its target angle, so transitions between states are always smooth
import * as THREE from 'three';
import { MeshBuilder, RGB, v3 } from './mesh';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const SKINS: RGB[] = [[198, 140, 100], [170, 115, 80], [140, 95, 65], [214, 165, 125], [120, 80, 55]];
const CLOTH: RGB[] = [[220, 40, 60], [240, 150, 30], [30, 120, 200], [40, 150, 90], [150, 50, 160], [245, 210, 60], [240, 240, 235], [180, 30, 100], [60, 60, 70]];

function part(mb: MeshBuilder): THREE.Mesh {
  const g = mb.finish(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(g.col, 3, true));
  geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
  const m = new THREE.Mesh(geo, MAT); m.castShadow = true;
  return m;
}
function joint(parent: THREE.Object3D, x: number, y: number, z: number, mb?: MeshBuilder) {
  const j = new THREE.Object3D(); j.position.set(x, y, z); parent.add(j);
  if (mb) j.add(part(mb));
  return j;
}

export interface Look { skin?: RGB; shirt?: RGB; pants?: RGB; saree?: boolean; hair?: RGB }

export class Character {
  root = new THREE.Group();
  private hips: THREE.Object3D; private spine: THREE.Object3D; private head: THREE.Object3D;
  private thigh: THREE.Object3D[] = []; private shin: THREE.Object3D[] = []; private foot: THREE.Object3D[] = [];
  private upper: THREE.Object3D[] = []; private fore: THREE.Object3D[] = [];
  private phase = Math.random() * 6; private breath = Math.random() * 6;
  private squash = 0; private runW = 0; private moveW = 0; private lean = 0; private roll = 0;
  seated = false; down = false; private downT = 0;

  constructor(look: Look = {}, detailed = true) {
    const r = () => Math.random();
    const skin = look.skin || SKINS[Math.floor(r() * SKINS.length)], shirt = look.shirt || CLOTH[Math.floor(r() * CLOTH.length)];
    const saree = look.saree ?? false, pants = look.pants || (r() < 0.6 ? [40, 45, 70] as RGB : [90, 80, 70] as RGB), hair: RGB = look.hair || [22, 18, 16];
    const seg = detailed ? 8 : 5;
    this.hips = joint(this.root, 0, 0.95, 0, (() => { const m = new MeshBuilder(); m.box(v3(0, 0, 0), 0.34, 0.2, 0.2, saree ? shirt : pants); return m; })());
    this.spine = joint(this.hips, 0, 0.08, 0, (() => {
      const m = new MeshBuilder();
      m.frustum(v3(0, 0, 0), 0.32, 0.19, 0.4, 0.22, 0.5, 0, shirt);
      m.box(v3(0, 0.56, 0), 0.1, 0.1, 0.1, skin);
      if (saree) m.box(v3(0.08, 0.3, 0.01), 0.12, 0.55, 0.25, [Math.min(255, shirt[0] + 30), shirt[1], shirt[2]]);
      return m;
    })());
    this.head = joint(this.spine, 0, 0.62, 0, (() => {
      const m = new MeshBuilder();
      m.blob(v3(0, 0.12, 0), 0.105, 0.125, 0.115, seg, seg - 2, skin);
      m.blob(v3(0, 0.17, -0.012), 0.112, 0.09, 0.118, seg, 3, hair);
      if (saree) m.blob(v3(0, 0.11, -0.11), 0.06, 0.06, 0.05, 6, 4, hair);
      m.box(v3(0, 0.11, 0.105), 0.03, 0.03, 0.03, [Math.max(0, skin[0] - 30), Math.max(0, skin[1] - 30), Math.max(0, skin[2] - 30)]); // nose hint
      return m;
    })());
    for (const s of [-1, 1]) {
      const legCol = saree ? skin : pants;
      const th = joint(this.hips, s * 0.1, -0.05, 0, (() => { const m = new MeshBuilder(); m.box(v3(0, -0.21, 0), 0.15, 0.44, 0.16, saree ? shirt : legCol); return m; })());
      const sh = joint(th, 0, -0.43, 0, (() => { const m = new MeshBuilder(); m.box(v3(0, -0.2, 0), 0.12, 0.42, 0.13, legCol); return m; })());
      const ft = joint(sh, 0, -0.42, 0, (() => { const m = new MeshBuilder(); m.box(v3(0, -0.03, 0.05), 0.11, 0.07, 0.25, [50, 35, 25]); return m; })());
      const ua = joint(this.spine, s * 0.25, 0.47, 0, (() => { const m = new MeshBuilder(); m.box(v3(0, -0.14, 0), 0.1, 0.3, 0.11, saree ? skin : shirt); return m; })());
      const fa = joint(ua, 0, -0.29, 0, (() => { const m = new MeshBuilder(); m.box(v3(0, -0.13, 0), 0.085, 0.27, 0.09, skin); m.box(v3(0, -0.29, 0.01), 0.08, 0.08, 0.06, skin); return m; })());
      this.thigh.push(th); this.shin.push(sh); this.foot.push(ft); this.upper.push(ua); this.fore.push(fa);
      ua.rotation.z = -s * 0.08;
    }
    if (saree) { const skirt = new MeshBuilder(); skirt.frustum(v3(0, -0.86, 0), 0.5, 0.38, 0.36, 0.25, 0.86, 0, shirt); this.hips.add(part(skirt)); }
  }

  private ease(o: THREE.Object3D, axis: 'x' | 'y' | 'z', target: number, k: number) { o.rotation[axis] += (target - o.rotation[axis]) * k; }

  /** speed m/s (horizontal), accel m/s^2 forward, turn rate deg/s, grounded flag, vertical speed, jump wind-up 0..1 */
  animate(dt: number, speed: number, accel = 0, turn = 0, grounded = true, vy = 0, windup = 0) {
    const k = 1 - Math.exp(-dt * 14), kSlow = 1 - Math.exp(-dt * 6);
    if (this.down) {
      this.downT = Math.min(1, this.downT + dt * 3);
      this.root.children[0].rotation.x = -1.45 * this.downT;
      return;
    } else if (this.downT > 0) { this.downT = Math.max(0, this.downT - dt * 2); this.root.children[0].rotation.x = -1.45 * this.downT; }
    if (this.seated) {
      for (const t of this.thigh) this.ease(t, 'x', 1.45, k);   // thighs forward
      for (const s of this.shin) this.ease(s, 'x', -1.35, k);   // knees bent, shins down
      for (const u of this.upper) this.ease(u, 'x', 0.9, k);    // hands to the steering wheel
      for (const f of this.fore) this.ease(f, 'x', 0.5, k);
      this.ease(this.spine, 'x', 0.05, k);                      // slight recline this.ease(this.spine, 'z', 0, k);
      this.hips.position.y += (0.95 - this.hips.position.y) * k;
      return;
    }
    this.moveW += ((speed > 0.15 ? 1 : 0) - this.moveW) * kSlow;
    this.runW += ((Math.max(0, Math.min(1, (speed - 2.6) / 2.2))) - this.runW) * kSlow;
    const stride = 1.35 + this.runW * 1.25;                // metres per full gait cycle (two steps)
    this.phase += (speed / stride) * Math.PI * 2 * dt;
    this.breath += dt * (1.6 + this.runW * 2);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = this.moveW * (0.45 + this.runW * 0.45);
    const knee = this.moveW * (0.55 + this.runW * 0.95);
    const airborne = !grounded;
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1, sw = s * sg;
      // knee flexes (shin swings back = negative) during the back-swing / lift of each leg
      let thighT = sw * amp, shinT = -(Math.max(0, -Math.sin(this.phase + (i ? Math.PI : 0) + 0.6)) * knee + 0.05), footT = -thighT * 0.4;
      let upT = -sw * amp * (0.75 + this.runW * 0.3), foreT = (0.15 + this.runW * 1.05) * this.moveW + 0.1; // elbows bend forward
      if (airborne) { thighT = 0.55 + (i ? -0.25 : 0.1); shinT = -0.9; footT = 0.3; upT = 0.5; foreT = 0.6; }
      if (windup > 0) { thighT = 0.45 * windup; shinT = -0.9 * windup; footT = 0.45 * windup; upT = -0.35 * windup; }
      this.ease(this.thigh[i], 'x', thighT, k); this.ease(this.shin[i], 'x', shinT, k); this.ease(this.foot[i], 'x', footT, k);
      this.ease(this.upper[i], 'x', upT, k); this.ease(this.fore[i], 'x', foreT, k);
    }
    // torso: lean forward with speed / acceleration, roll into turns, bob and hip sway, breathing when idle
    this.lean += ((this.runW * 0.22 + this.moveW * 0.04 + Math.max(-0.15, Math.min(0.2, accel * 0.025)) + (airborne ? 0.1 : 0)) - this.lean) * kSlow;
    this.roll += ((Math.max(-0.25, Math.min(0.25, -turn * Math.PI / 180 * speed * 0.03))) - this.roll) * kSlow;
    this.spine.rotation.x = -this.lean + (1 - this.moveW) * Math.sin(this.breath) * 0.015; // negative = lean forward
    this.spine.rotation.z = this.roll;
    this.spine.rotation.y = s * amp * 0.25;
    this.hips.rotation.y = -s * amp * 0.2;
    this.head.rotation.x = this.lean * 0.6; // keep eyes on the horizon
    if (!grounded && vy < -1) this.squash = 0;
    this.squash = Math.max(0, this.squash - dt * 4);
    const bob = Math.abs(c) * (0.025 + this.runW * 0.05) * this.moveW;
    const hipsY = 0.95 - bob - this.squash * 0.18 - windup * 0.16 - (this.moveW * this.runW * 0.04);
    this.hips.position.y += (hipsY - this.hips.position.y) * k;
    this.hips.position.x = (1 - this.moveW) * Math.sin(this.breath * 0.37) * 0.015;
  }
  land(impact: number) { this.squash = Math.min(1, impact / 7); }
  dispose() { this.root.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
}
