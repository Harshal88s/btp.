// Drivable road network + spatial lookup + A* (port of Core/RoadGraph.cs, which is unit-tested on this data).
import { CityIndex, NodeFlags, RoadInfo } from './types';

export interface Neighbor { node: number; edge: number; carOk: boolean }

const CELL = 50;
const key = (cx: number, cz: number) => cx * 100003 + cz;
const cellOf = (v: number) => Math.floor(v / CELL);

export class RoadGraph {
  readonly X: number[]; readonly Z: number[]; readonly flags: number[]; readonly n: number;
  readonly edgeLen: Float32Array;
  private adjStart: Int32Array; private adjNode: Int32Array; private adjEdge: Int32Array; private adjOk: Uint8Array;
  private nodeGrid = new Map<number, number[]>(); private edgeGrid = new Map<number, number[]>();
  private maxSpeed = 1;
  private g?: Float32Array; private came?: Int32Array; private stamp?: Int32Array; private cur = 0;

  constructor(readonly idx: CityIndex) {
    this.X = idx.nodeX; this.Z = idx.nodeZ; this.flags = idx.nodeFlags; this.n = this.X.length;
    const E = idx.edgeA.length;
    this.edgeLen = new Float32Array(E);
    const deg = new Int32Array(this.n + 1);
    for (let i = 0; i < E; i++) {
      const a = idx.edgeA[i], b = idx.edgeB[i];
      this.edgeLen[i] = Math.max(0.1, Math.hypot(this.X[b] - this.X[a], this.Z[b] - this.Z[a]));
      deg[a]++; deg[b]++;
    }
    this.adjStart = new Int32Array(this.n + 1);
    for (let i = 0; i < this.n; i++) this.adjStart[i + 1] = this.adjStart[i] + deg[i];
    const tot = this.adjStart[this.n];
    this.adjNode = new Int32Array(tot); this.adjEdge = new Int32Array(tot); this.adjOk = new Uint8Array(tot);
    const fill = new Int32Array(this.n);
    for (let i = 0; i < E; i++) {
      const a = idx.edgeA[i], b = idx.edgeB[i], d = idx.edgeDir[i];
      let k = this.adjStart[a] + fill[a]++; this.adjNode[k] = b; this.adjEdge[k] = i; this.adjOk[k] = (d & 1) ? 1 : 0;
      k = this.adjStart[b] + fill[b]++; this.adjNode[k] = a; this.adjEdge[k] = i; this.adjOk[k] = (d & 2) ? 1 : 0;
    }
    for (const r of idx.roads) if (r.drivable) this.maxSpeed = Math.max(this.maxSpeed, r.speed);
    for (let i = 0; i < this.n; i++) if (this.degree(i) > 0) this.add(this.nodeGrid, key(cellOf(this.X[i]), cellOf(this.Z[i])), i);
    for (let i = 0; i < E; i++) {
      const a = idx.edgeA[i], b = idx.edgeB[i];
      for (let cx = cellOf(Math.min(this.X[a], this.X[b])); cx <= cellOf(Math.max(this.X[a], this.X[b])); cx++)
        for (let cz = cellOf(Math.min(this.Z[a], this.Z[b])); cz <= cellOf(Math.max(this.Z[a], this.Z[b])); cz++)
          this.add(this.edgeGrid, key(cx, cz), i);
    }
  }
  private add(m: Map<number, number[]>, k: number, v: number) { let l = m.get(k); if (!l) m.set(k, l = []); l.push(v); }

  degree(n: number) { return this.adjStart[n + 1] - this.adjStart[n]; }
  neighbor(n: number, i: number): Neighbor { const k = this.adjStart[n] + i; return { node: this.adjNode[k], edge: this.adjEdge[k], carOk: this.adjOk[k] === 1 }; }
  isMain(n: number) { return (this.flags[n] & NodeFlags.MainNetwork) !== 0; }
  roadOfEdge(e: number): RoadInfo { return this.idx.roads[this.idx.edgeRoad[e]]; }
  dist(a: number, b: number) { return Math.hypot(this.X[b] - this.X[a], this.Z[b] - this.Z[a]); }

  nearestNode(x: number, z: number, maxDist = 400, mainOnly = true, filter?: (n: number) => boolean): number {
    let best = -1, bd = maxDist * maxDist;
    const r = Math.ceil(maxDist / CELL), cx = cellOf(x), cz = cellOf(z);
    for (let ring = 0; ring <= r; ring++) {
      for (let i = cx - ring; i <= cx + ring; i++)
        for (let j = cz - ring; j <= cz + ring; j++) {
          if (Math.abs(i - cx) !== ring && Math.abs(j - cz) !== ring) continue;
          const l = this.nodeGrid.get(key(i, j)); if (!l) continue;
          for (const n of l) {
            if (mainOnly && !this.isMain(n)) continue;
            if (filter && !filter(n)) continue;
            const dx = this.X[n] - x, dz = this.Z[n] - z, d = dx * dx + dz * dz;
            if (d < bd) { bd = d; best = n; }
          }
        }
      if (best >= 0 && Math.sqrt(bd) < ring * CELL) break;
    }
    return best;
  }

  /** nearest edge: returns [edge, t, dist] or [-1, 0, Infinity] */
  nearestEdge(x: number, z: number, maxDist = 60): [number, number, number] {
    let best = -1, bt = 0, bd = Infinity;
    const r = Math.ceil(maxDist / CELL), cx = cellOf(x), cz = cellOf(z);
    for (let i = cx - r; i <= cx + r; i++)
      for (let j = cz - r; j <= cz + r; j++) {
        const l = this.edgeGrid.get(key(i, j)); if (!l) continue;
        for (const e of l) {
          const [d, t] = this.segDist(x, z, this.idx.edgeA[e], this.idx.edgeB[e]);
          if (d < bd) { bd = d; best = e; bt = t; }
        }
      }
    return bd > maxDist ? [-1, 0, Infinity] : [best, bt, bd];
  }

  segDist(px: number, pz: number, a: number, b: number): [number, number] {
    const ax = this.X[a], az = this.Z[a], dx = this.X[b] - ax, dz = this.Z[b] - az, l2 = dx * dx + dz * dz;
    const t = l2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    return [Math.hypot(ax + t * dx - px, az + t * dz - pz), t];
  }

  edgeBetween(a: number, b: number) {
    for (let k = this.adjStart[a]; k < this.adjStart[a + 1]; k++) if (this.adjNode[k] === b) return this.adjEdge[k];
    return -1;
  }

  /** Fastest legal route (seconds), one-way aware when car = true. */
  findPath(start: number, goal: number, car = true): number[] | null {
    if (start < 0 || goal < 0) return null;
    if (!this.g) { this.g = new Float32Array(this.n); this.came = new Int32Array(this.n); this.stamp = new Int32Array(this.n); }
    const g = this.g!, came = this.came!, stamp = this.stamp!;
    const cur = ++this.cur;
    const h = (a: number) => this.dist(a, goal) / this.maxSpeed * 3.6;
    const heap = new MinHeap();
    g[start] = 0; came[start] = -1; stamp[start] = cur; heap.push(start, h(start));
    let expanded = 0;
    while (heap.size > 0) {
      const [u, f] = heap.pop();
      if (u === goal) { const p: number[] = []; for (let n = goal; n !== -1; n = came[n]) p.push(n); return p.reverse(); }
      if (f - h(u) > g[u] + 1e-3) continue;
      if (++expanded > 200000) break;
      for (let k = this.adjStart[u]; k < this.adjStart[u + 1]; k++) {
        if (car && !this.adjOk[k]) continue;
        const e = this.adjEdge[k], v = this.adjNode[k], road = this.roadOfEdge(e);
        let cost = this.edgeLen[e] / Math.max(10, road.speed) * 3.6;
        if (road.rank <= 1) cost *= 1.6;
        if (this.flags[v] & NodeFlags.TrafficSignal) cost += 8;
        const ng = g[u] + cost;
        if (stamp[v] !== cur || ng < g[v]) { stamp[v] = cur; g[v] = ng; came[v] = u; heap.push(v, ng + h(v)); }
      }
    }
    return null;
  }

  pathLength(p: number[]) { let l = 0; for (let i = 1; i < p.length; i++) l += this.dist(p[i - 1], p[i]); return l; }
}

class MinHeap {
  private it: number[] = []; private k: number[] = [];
  get size() { return this.it.length; }
  push(item: number, key: number) {
    const it = this.it, k = this.k; let i = it.length; it.push(item); k.push(key);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; it[i] = it[p]; k[i] = k[p]; i = p; }
    it[i] = item; k[i] = key;
  }
  pop(): [number, number] {
    const it = this.it, k = this.k, top = it[0], tk = k[0];
    const li = it.pop()!, lk = k.pop()!;
    if (it.length > 0) {
      let i = 0; const n = it.length;
      while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; it[i] = it[c]; k[i] = k[c]; i = c; }
      it[i] = li; k[i] = lk;
    }
    return [top, tk];
  }
}
