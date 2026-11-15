// Chunk streaming around the player (geometry built in a Web Worker), terrain, colliders, queries.
import * as THREE from 'three';
import { ChunkResult, Collider as RawCollider, NameBoard, Special } from './chunkgen';
import { RoadGraph } from './graph';
import { GeoData } from './mesh';
import { Terrain, FlatTerrain } from './terrain';
import { pointInPoly } from './triangulate';
import { CityIndex, GlobalData, Poi, roadDisplayName } from './types';
import * as T from './textures';

export interface Collider { pts: Float32Array; base: number; top: number; minH: number; x0: number; z0: number; x1: number; z1: number }
export interface SpecialInfo { name: string; fullName: string; x: number; z: number; srcX: number; srcZ: number; building: number; source: string }
export type Index = CityIndex & { terrain?: any; specials?: SpecialInfo[] };

export class World {
  graph!: RoadGraph;
  idx!: Index;
  global!: GlobalData;
  terrain: Terrain = new FlatTerrain();
  root = new THREE.Group();
  loadRadius = 600;
  onChunkAdded?: (r: ChunkResult, group: THREE.Group) => void;
  onChunkRemoved?: (key: number) => void;
  sidewalks = new Map<number, Float32Array>();
  vendors = new Map<number, Float32Array>();
  chunkSignals = new Map<number, { spots: ChunkResult['signals']; group: THREE.Group }>();
  chunkExtras = new Map<number, { boards: NameBoard[]; specials: Special[]; group: THREE.Group }>();
  private worker: Worker;
  private chunkRefs = new Map<number, string>();
  private loaded = new Map<number, THREE.Group>();
  private pending = new Set<number>();
  private colliderGrid = new Map<number, Collider[]>();
  private chunkColliders = new Map<number, Collider[]>();
  private waterPolys: number[][] = [];
  private places: Poi[] = [];
  readonly mats: Record<string, THREE.Material>;
  private readyResolve?: () => void;
  private chunkWait = new Map<number, () => void>();

  constructor(private base: string, lite: boolean) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.onMessage(e.data);
    this.worker.postMessage({ type: 'init', base, lite });
    this.mats = makeMaterials();
  }

  async load(progress: (p: number, label: string) => void) {
    progress(0.05, 'Downloading OpenStreetMap road network...');
    const ready = new Promise<void>(r => (this.readyResolve = r));
    this.idx = await (await fetch(this.base + 'index.json')).json();
    progress(0.25, 'Downloading terrain (Pune hills)...');
    if (this.idx.terrain) this.terrain = new Terrain(this.idx.terrain, await (await fetch(this.base + this.idx.terrain.file)).arrayBuffer());
    progress(0.35, 'Building road graph...');
    await new Promise(r => setTimeout(r, 0));
    this.graph = new RoadGraph(this.idx);
    this.global = await (await fetch(this.base + 'global.json')).json();
    for (const a of this.global.areas) if (a.kind === 'water') this.waterPolys.push(a.pts);
    for (const p of this.idx.pois) if (p.kind === 'place') this.places.push(p);
    for (const c of this.idx.chunks) this.chunkRefs.set(this.key(c.cx, c.cz), c.file);
    this.root.add(this.farTerrain());
    progress(0.45, 'Preparing streets...');
    await ready;
  }

  /** preload chunks around a point (used at spawn and after teleports) */
  async preload(x: number, z: number, radius: number, progress?: (f: number) => void) {
    const want = this.wanted(x, z, radius).filter(k => !this.loaded.has(k));
    let done = 0;
    await Promise.all(want.map(k => new Promise<void>(res => {
      if (this.loaded.has(k)) { res(); return; }
      this.chunkWait.set(k, () => { done++; progress?.(done / want.length); res(); });
      this.request(k, true);
    })));
  }

  key(cx: number, cz: number) { return cx * 4096 + cz; }

  private wanted(x: number, z: number, radius: number): number[] {
    const cs = this.idx.chunkSize, r = Math.ceil(radius / cs) + 1;
    const pcx = Math.floor((x - this.idx.minX) / cs), pcz = Math.floor((z - this.idx.minZ) / cs);
    const out: [number, number][] = [];
    for (let i = pcx - r; i <= pcx + r; i++)
      for (let j = pcz - r; j <= pcz + r; j++) {
        const k = this.key(i, j);
        if (!this.chunkRefs.has(k)) continue;
        const d = this.chunkDist(x, z, i, j);
        if (d <= radius) out.push([d, k]);
      }
    return out.sort((a, b) => a[0] - b[0]).map(o => o[1]);
  }

  private chunkDist(x: number, z: number, cx: number, cz: number) {
    const cs = this.idx.chunkSize, x0 = this.idx.minX + cx * cs, z0 = this.idx.minZ + cz * cs;
    return Math.hypot(Math.max(0, x0 - x, x - (x0 + cs)), Math.max(0, z0 - z, z - (z0 + cs)));
  }

  private request(k: number, force = false) {
    if (this.loaded.has(k) || this.pending.has(k)) return;
    if (!force && this.pending.size >= 4) return;
    this.pending.add(k);
    this.worker.postMessage({ type: 'chunk', key: k, file: this.chunkRefs.get(k) });
  }

  update(x: number, z: number) {
    if (!this.idx) return;
    for (const k of this.wanted(x, z, this.loadRadius)) { if (this.pending.size >= 4) break; this.request(k); }
    for (const [k, g] of this.loaded) {
      const cx = Math.floor(k / 4096), cz = k - cx * 4096;
      if (this.chunkDist(x, z, cx, cz) > this.loadRadius + 150) this.unload(k, g);
    }
  }

  private onMessage(m: any) {
    if (m.type === 'ready') this.readyResolve?.();
    else if (m.type === 'chunk') {
      this.pending.delete(m.key);
      const r: ChunkResult = m.result;
      if (this.loaded.has(m.key)) return;
      const g = new THREE.Group(); g.name = 'chunk' + m.key;
      for (const name in r.groups) {
        const mesh = this.mesh(r.groups[name], this.mats[name] || this.mats.solid);
        mesh.castShadow = name !== 'terrain' && name !== 'road' && name !== 'markings' && name !== 'shop';
        mesh.receiveShadow = true;
        if (name === 'markings') mesh.renderOrder = 1;
        g.add(mesh);
      }
      this.root.add(g);
      this.loaded.set(m.key, g);
      const cols: Collider[] = r.colliders.map((c: RawCollider) => {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let i = 0; i < c.pts.length; i += 2) { x0 = Math.min(x0, c.pts[i]); x1 = Math.max(x1, c.pts[i]); z0 = Math.min(z0, c.pts[i + 1]); z1 = Math.max(z1, c.pts[i + 1]); }
        return { pts: c.pts, base: c.base, top: c.top, minH: c.minH, x0, z0, x1, z1 };
      });
      this.chunkColliders.set(m.key, cols);
      for (const c of cols) this.forCells(c, k => { let l = this.colliderGrid.get(k); if (!l) this.colliderGrid.set(k, l = []); l.push(c); });
      this.sidewalks.set(m.key, r.sidewalks);
      this.vendors.set(m.key, r.vendors);
      this.chunkSignals.set(m.key, { spots: r.signals, group: g });
      this.chunkExtras.set(m.key, { boards: r.boards, specials: r.specials, group: g });
      this.onChunkAdded?.(r, g);
      this.chunkWait.get(m.key)?.(); this.chunkWait.delete(m.key);
    } else if (m.type === 'error') {
      console.error('chunk worker:', m.message);
      this.pending.delete(m.key);
      this.chunkWait.get(m.key)?.(); this.chunkWait.delete(m.key);
    }
  }

  private unload(k: number, g: THREE.Group) {
    this.root.remove(g);
    g.traverse(o => { const mm = o as THREE.Mesh; if (mm.geometry) mm.geometry.dispose(); });
    this.loaded.delete(k);
    for (const c of this.chunkColliders.get(k) || []) this.forCells(c, ck => {
      const l = this.colliderGrid.get(ck); if (!l) return;
      const i = l.indexOf(c); if (i >= 0) l.splice(i, 1);
    });
    this.chunkColliders.delete(k); this.chunkSignals.delete(k); this.chunkExtras.delete(k); this.sidewalks.delete(k); this.vendors.delete(k);
    this.onChunkRemoved?.(k);
  }

  private forCells(c: Collider, f: (k: number) => void) {
    for (let i = Math.floor((c.x0 - 2.5) / 20); i <= Math.floor((c.x1 + 2.5) / 20); i++)
      for (let j = Math.floor((c.z0 - 2.5) / 20); j <= Math.floor((c.z1 + 2.5) / 20); j++) f(i * 100003 + j);
  }

  mesh(gd: GeoData, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(gd.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(gd.nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(gd.col, 3, true));
    geo.setAttribute('uv', new THREE.BufferAttribute(gd.uv, 2));
    geo.setIndex(new THREE.BufferAttribute(gd.idx, 1));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    return m;
  }

  /** low-detail terrain of the whole extract (+ surroundings) so hills stay visible beyond the streamed chunks */
  private farTerrain(): THREE.Mesh {
    const t = this.terrain, i = this.idx, cell = 90, pad = 300;
    const x0 = i.minX - pad, z0 = i.minZ - pad, nx = Math.ceil((i.maxX - i.minX + 2 * pad) / cell), nz = Math.ceil((i.maxZ - i.minZ + 2 * pad) / cell);
    let hi = 60; for (let k = 0; k < t.h0.length; k += 37) hi = Math.max(hi, t.h0[k]);
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nz; j++) for (let k = 0; k <= nx; k++) {
      const x = x0 + k * cell, z = z0 + j * cell, h = t.h(x, z), f = Math.min(1, h / hi);
      pos.push(x, h - 1.5, -z);
      col.push(0.6 - f * 0.3, 0.55 - f * 0.08, 0.44 - f * 0.24); // dusty city basin -> green hill tops
    }
    for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
      const a = j * (nx + 1) + k, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, d, c, a, b, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.name = 'farTerrain';
    return m;
  }

  get loadedCount() { return this.loaded.size; }
  get pendingCount() { return this.pending.size; }

  /** ground height (m) at data-space x, z */
  h(x: number, z: number) { return this.terrain.h(x, z); }

  /** Push a circle (x,z,r) at height y out of buildings. Returns corrected position + normal or null. */
  collide(x: number, z: number, r: number, y: number): { x: number; z: number; nx: number; nz: number } | null {
    const list = this.colliderGrid.get(Math.floor(x / 20) * 100003 + Math.floor(z / 20));
    if (!list) return null;
    let hit: { x: number; z: number; nx: number; nz: number } | null = null;
    for (const c of list) {
      if (y > c.top + 0.2 || y + 1.8 < c.base + c.minH) continue; // above the roof, or under an elevated structure
      if (x < c.x0 - r || x > c.x1 + r || z < c.z0 - r || z > c.z1 + r) continue;
      const p = c.pts, n = p.length / 2;
      const inside = pointInPoly(p, x, z);
      let best = Infinity, bx = 0, bz = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = p[2 * j], az = p[2 * j + 1], ex = p[2 * i] - ax, ez = p[2 * i + 1] - az, l2 = ex * ex + ez * ez;
        const t = l2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const qx = ax + ex * t, qz = az + ez * t, d = Math.hypot(x - qx, z - qz);
        if (d < best) { best = d; bx = qx; bz = qz; }
      }
      if (!inside && best >= r) continue;
      let nx = x - bx, nz = z - bz; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (inside) { nx = -nx; nz = -nz; }
      x = bx + nx * (r + 0.01); z = bz + nz * (r + 0.01);
      hit = { x, z, nx, nz };
    }
    return hit;
  }

  /** highest roof under (x,z); -Infinity when none */
  roofAt(x: number, z: number): number {
    const list = this.colliderGrid.get(Math.floor(x / 20) * 100003 + Math.floor(z / 20));
    let best = -Infinity;
    if (list) for (const c of list) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && pointInPoly(c.pts, x, z)) best = Math.max(best, c.top);
    return best;
  }

  /** fraction (0..1) of the segment a->b that is free of terrain and buildings */
  rayFree(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    const steps = 12;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (y < this.terrain.h(x, z) + 0.4 || this.roofAt(x, z) > y) return Math.max(0, (s - 1) / steps);
    }
    return 1;
  }

  inBounds(x: number, z: number, m = 0) { return x >= this.idx.minX - m && x <= this.idx.maxX + m && z >= this.idx.minZ - m && z <= this.idx.maxZ + m; }

  streetName(x: number, z: number) { const [e] = this.graph.nearestEdge(x, z, 40); return e < 0 ? '' : roadDisplayName(this.graph.roadOfEdge(e)); }

  zoneName(x: number, z: number) {
    let best: Poi | null = null, bd = 1500 * 1500;
    for (const p of this.places) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
    return best ? best.name : this.idx.name;
  }

  isWater(x: number, z: number) {
    const [e, , d] = this.graph.nearestEdge(x, z, 40);
    if (e >= 0 && d < this.graph.roadOfEdge(e).width / 2 + 1.5) return false;
    for (const p of this.waterPolys) if (pointInPoly(p, x, z)) return true;
    return false;
  }

  landmark(name: string) { return this.idx.landmarks.find(l => l.name === name) || null; }

  /** road position near (x,z) on the LEFT lane for two-way roads; returns [x, z, yawDeg] */
  roadPointNear(x: number, z: number): [number, number, number] {
    const g = this.graph, n = g.nearestNode(x, z, 2000);
    if (n < 0) return [x, z, 0];
    for (let k = 0; k < g.degree(n); k++) {
      const nb = g.neighbor(n, k); if (!nb.carOk) continue;
      let dx = g.X[nb.node] - g.X[n], dz = g.Z[nb.node] - g.Z[n]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const road = g.roadOfEdge(nb.edge), off = road.oneway ? 0 : road.width * 0.25, adv = Math.min(6, g.edgeLen[nb.edge] * 0.4);
      return [g.X[n] - dz * off + dx * adv, g.Z[n] + dx * off + dz * adv, Math.atan2(dx, dz) * 180 / Math.PI];
    }
    return [g.X[n], g.Z[n], 0];
  }
}

function makeMaterials(): Record<string, THREE.Material> {
  const f = (t: THREE.Texture) => new THREE.MeshLambertMaterial({ vertexColors: true, map: t });
  return {
    terrain: f(T.ground()),
    road: f(T.asphalt()),
    facadeApt: f(T.facade('apt')),
    facadeGlass: f(T.facade('glass')),
    facadeOld: f(T.facade('old')),
    hostel: f(T.facade('hostel')),
    shop: new THREE.MeshLambertMaterial({ map: T.shopAtlas(), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    markings: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    lamps: new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x888070 }),
  };
}
