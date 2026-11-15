// GPS: A* route on the real road graph (one-way aware when driving), on-road ribbon, turn-by-turn with street names.
import * as THREE from 'three';
import { RoadGraph } from './graph';
import { MeshBuilder, v3 } from './mesh';
import { roadDisplayName } from './types';
import { geoOf } from './traffic';

export const fmtDist = (m: number) => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m';

export class GPS {
  target: { x: number; z: number; label: string } | null = null;
  route: [number, number][] = [];
  nodes: number[] = [];
  remaining = 0; instruction = ''; turn = 0;
  private progress = 0; private off = 0; private tick = 0; private carMode = true;
  private mesh: THREE.Mesh | null = null;
  private mat = new THREE.MeshBasicMaterial({ color: 0xa040f0, transparent: true, opacity: 0.65, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  beacon: THREE.Mesh;
  constructor(private g: RoadGraph, private scene: THREE.Object3D, private ter: { h(x: number, z: number): number } = { h: () => 0 }) {
    const geo = new THREE.CylinderGeometry(3, 3, 60, 20, 1, true); geo.translate(0, 30, 0);
    this.beacon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xa040f0, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
    this.beacon.visible = false; scene.add(this.beacon);
  }
  set(x: number, z: number, label: string, px: number, pz: number, car: boolean) {
    this.target = { x, z, label }; this.beacon.position.set(x, this.ter.h(x, z), -z); this.beacon.visible = true;
    this.recompute(px, pz, car);
  }
  clear() { this.target = null; this.route = []; this.nodes = []; this.instruction = ''; this.beacon.visible = false; if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; } }
  arrived(px: number, pz: number, r: number) { return !!this.target && Math.hypot(px - this.target.x, pz - this.target.z) < r; }

  recompute(px: number, pz: number, car: boolean) {
    if (!this.target) return;
    this.carMode = car; this.progress = 0;
    const g = this.g, a = g.nearestNode(px, pz, 400), b = g.nearestNode(this.target.x, this.target.z, 600);
    let p = g.findPath(a, b, car); if (!p && car) p = g.findPath(a, b, false);
    this.nodes = p || [];
    this.route = [[px, pz], ...this.nodes.map(n => [g.X[n], g.Z[n]] as [number, number]), [this.target.x, this.target.z]];
    this.draw(px, pz);
  }

  private draw(px: number, pz: number) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    const pts = [v3(px, 0, pz)]; let acc = 0;
    for (let i = Math.max(1, this.progress); i < this.route.length && acc < 700; i++) {
      acc += Math.hypot(this.route[i][0] - this.route[i - 1][0], this.route[i][1] - this.route[i - 1][1]);
      pts.push(v3(this.route[i][0], 0, this.route[i][1]));
    }
    if (pts.length < 2) return;
    const mb = new MeshBuilder(); mb.drape = this.ter; mb.ribbon(subdiv(pts, 5), 1.6, 0, 0.45, [255, 255, 255], 1e6);
    this.mesh = new THREE.Mesh(geoOf(mb), this.mat); this.mesh.renderOrder = 2;
    this.scene.add(this.mesh);
  }

  update(dt: number, px: number, pz: number, car: boolean) {
    if (!this.target || this.route.length < 2) return;
    if (car !== this.carMode) { this.recompute(px, pz, car); return; }
    let best = this.progress, bd = Infinity;
    for (let i = this.progress; i < Math.min(this.route.length - 1, this.progress + 25); i++) {
      const d = segDist(px, pz, this.route[i], this.route[i + 1]); if (d < bd) { bd = d; best = i; }
    }
    this.progress = best;
    let rem = Math.hypot(px - this.route[Math.min(best + 1, this.route.length - 1)][0], pz - this.route[Math.min(best + 1, this.route.length - 1)][1]);
    for (let i = best + 1; i < this.route.length - 1; i++) rem += Math.hypot(this.route[i + 1][0] - this.route[i][0], this.route[i + 1][1] - this.route[i][1]);
    this.remaining = rem;
    this.tick -= dt; if (this.tick > 0) return; this.tick = 0.5;
    if (bd > 28) { this.off += 0.5; if (this.off >= 1.5) { this.off = 0; this.recompute(px, pz, car); return; } } else this.off = 0;
    this.draw(px, pz);
    this.instr(px, pz);
  }

  private instr(px: number, pz: number) {
    const t = this.target!;
    if (Math.hypot(px - t.x, pz - t.z) < 40) { this.instruction = 'Arriving at ' + t.label; this.turn = 2; return; }
    const R = this.route; let acc = Math.hypot(px - R[Math.min(this.progress + 1, R.length - 1)][0], pz - R[Math.min(this.progress + 1, R.length - 1)][1]);
    for (let i = this.progress + 1; i < R.length - 1; i++) {
      const ax = R[i][0] - R[i - 1][0], az = R[i][1] - R[i - 1][1], bx = R[i + 1][0] - R[i][0], bz = R[i + 1][1] - R[i][1];
      if (Math.hypot(ax, az) > 1 && Math.hypot(bx, bz) > 1) {
        // clockwise-positive angle in data space (x east, z north): right turn > 0
        const ang = Math.atan2(ax * bz - az * bx, ax * bx + az * bz) * -180 / Math.PI;
        if (Math.abs(ang) > 35 && acc > 8) {
          let street = '';
          const ri = i - 1;
          if (ri >= 0 && ri + 1 < this.nodes.length) { const e = this.g.edgeBetween(this.nodes[ri], this.nodes[ri + 1]); if (e >= 0) street = roadDisplayName(this.g.roadOfEdge(e)); }
          this.turn = ang > 0 ? 1 : -1;
          this.instruction = (ang > 0 ? 'Turn right' : 'Turn left') + ' in ' + fmtDist(acc) + (street ? ' onto ' + street : '');
          return;
        }
      }
      acc += Math.hypot(R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]);
      if (acc > 1500) break;
    }
    this.turn = 0; this.instruction = 'Continue - ' + fmtDist(this.remaining) + ' to ' + t.label;
  }
}
function subdiv(l: { x: number; y: number; z: number }[], m: number) {
  const o = [l[0]];
  for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / m); for (let k = 1; k <= n; k++) o.push(v3(a.x + (b.x - a.x) * k / n, 0, a.z + (b.z - a.z) * k / n)); }
  return o;
}
function segDist(px: number, pz: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 < 1e-4 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2));
  return Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz);
}
