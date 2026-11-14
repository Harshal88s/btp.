// Chunk streaming around the player (Web Worker builds geometry), building colliders, water test, queries.
import * as THREE from 'three';
import { ChunkResult } from './chunkgen';
import { RoadGraph } from './graph';
import { GeoData } from './mesh';
import { pointInPoly } from './triangulate';
import { CityIndex, GlobalData, Poi, roadDisplayName } from './types';

export interface Collider { pts: Float32Array; minH: number; x0: number; z0: number; x1: number; z1: number }

export class World {
  graph!: RoadGraph;
  idx!: CityIndex;
  global!: GlobalData;
  root = new THREE.Group();
  loadRadius = 600;
  onChunkAdded?: (r: ChunkResult, group: THREE.Group) => void;
  onChunkRemoved?: (key: number) => void;
  sidewalks = new Map<number, Float32Array>();
  /** signal spots of loaded chunks (so poles can be created for chunks loaded before the signal system existed) */
  chunkSignals = new Map<number, { spots: ChunkResult['signals']; group: THREE.Group }>();
  vendors = new Map<number, Float32Array>();
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
    progress(0.3, 'Building road graph...');
    await new Promise(r => setTimeout(r, 0));
    this.graph = new RoadGraph(this.idx);
    this.global = await (await fetch(this.base + 'global.json')).json();
    for (const a of this.global.areas) if (a.kind === 'water') this.waterPolys.push(a.pts);
    for (const p of this.idx.pois) if (p.kind === 'place') this.places.push(p);
    for (const c of this.idx.chunks) this.chunkRefs.set(this.key(c.cx, c.cz), c.file);
    progress(0.45, 'Preparing river, parks and campuses...');
    await ready;
    // preload the chunks around the spawn point
    const sx = this.idx.spawnX, sz = this.idx.spawnZ;
    const want = this.wanted(sx, sz, 260);
    let done = 0;
    await Promise.all(want.map(k => new Promise<void>(res => {
      this.chunkWait.set(k, () => { done++; progress(0.5 + 0.5 * done / want.length, 'Streaming ' + this.idx.name + ' around ' + this.idx.spawnName + '...'); res(); });
      this.request(k);
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
    const dx = Math.max(0, x0 - x, x - (x0 + cs)), dz = Math.max(0, z0 - z, z - (z0 + cs));
    return Math.hypot(dx, dz);
  }

  private request(k: number) {
    if (this.loaded.has(k) || this.pending.has(k)) return;
    this.pending.add(k);
    this.worker.postMessage({ type: 'chunk', key: k, file: this.chunkRefs.get(k) });
  }

  /** call every frame with the player position */
  update(x: number, z: number) {
    if (!this.idx) return;
    for (const k of this.wanted(x, z, this.loadRadius)) { if (this.pending.size >= 4) break; this.request(k); }
    for (const [k, g] of this.loaded) {
      const cx = Math.floor(k / 4096), cz = k - cx * 4096;
      if (this.chunkDist(x, z, cx, cz) > this.loadRadius + 150) this.unload(k, g);
    }
  }

  private onMessage(m: any) {
    if (m.type === 'ready') {
      const mesh = this.mesh(m.global, this.mats.solid);
      mesh.name = 'GlobalAreas'; mesh.receiveShadow = true;
      this.root.add(mesh);
      this.readyResolve?.();
    } else if (m.type === 'chunk') {
      this.pending.delete(m.key);
      const r: ChunkResult = m.result;
      const g = new THREE.Group();
      g.name = 'chunk' + m.key;
      if (r.facade) { const f = this.mesh(r.facade, this.mats.facade); f.castShadow = true; g.add(f); }
      if (r.solid) { const s = this.mesh(r.solid, this.mats.solid); s.castShadow = true; s.receiveShadow = true; g.add(s); }
      if (r.markings) g.add(this.mesh(r.markings, this.mats.markings));
      if (r.lamps) g.add(this.mesh(r.lamps, this.mats.lamps));
      this.root.add(g);
      this.loaded.set(m.key, g);
      const cols: Collider[] = r.colliders.map(c => {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let i = 0; i < c.pts.length; i += 2) { x0 = Math.min(x0, c.pts[i]); x1 = Math.max(x1, c.pts[i]); z0 = Math.min(z0, c.pts[i + 1]); z1 = Math.max(z1, c.pts[i + 1]); }
        return { pts: c.pts, minH: c.minH, x0, z0, x1, z1 };
      });
      this.chunkColliders.set(m.key, cols);
      for (const c of cols) this.forCells(c, k => { let l = this.colliderGrid.get(k); if (!l) this.colliderGrid.set(k, l = []); l.push(c); });
      this.sidewalks.set(m.key, r.sidewalks);
      this.chunkSignals.set(m.key, { spots: r.signals, group: g });
      this.vendors.set(m.key, r.vendors);
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
    g.traverse(o => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
    this.loaded.delete(k);
    for (const c of this.chunkColliders.get(k) || []) this.forCells(c, ck => {
      const l = this.colliderGrid.get(ck); if (!l) return;
      const i = l.indexOf(c); if (i >= 0) l.splice(i, 1);
    });
    this.chunkColliders.delete(k); this.chunkSignals.delete(k); this.sidewalks.delete(k); this.vendors.delete(k);
    this.onChunkRemoved?.(k);
  }

  private forCells(c: Collider, f: (k: number) => void) {
    // 2.5 m margin so circles near a cell border still see buildings registered in the neighbouring cell
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

  get loadedCount() { return this.loaded.size; }
  get pendingCount() { return this.pending.size; }

  /** Push a circle (x,z,r) out of buildings. Returns corrected position and hit normal or null. */
  collide(x: number, z: number, r: number, y = 0.5): { x: number; z: number; nx: number; nz: number } | null {
    const list = this.colliderGrid.get(Math.floor(x / 20) * 100003 + Math.floor(z / 20));
    if (!list) return null;
    let hit: { x: number; z: number; nx: number; nz: number } | null = null;
    for (const c of list) {
      if (c.minH > y + 1.5) continue; // elevated structures (metro stations) - pass underneath
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

  /** road position near (x,z), on the LEFT lane for two-way roads; returns [x, z, yawDeg] */
  roadPointNear(x: number, z: number): [number, number, number] {
    const g = this.graph, n = g.nearestNode(x, z, 2000);
    if (n < 0) return [x, z, 0];
    for (let k = 0; k < g.degree(n); k++) {
      const nb = g.neighbor(n, k); if (!nb.carOk) continue;
      let dx = g.X[nb.node] - g.X[n], dz = g.Z[nb.node] - g.Z[n]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const road = g.roadOfEdge(nb.edge), off = road.oneway ? 0 : road.width * 0.25, adv = Math.min(6, g.edgeLen[nb.edge] * 0.4);
      // left of travel direction in data space (x east, z north) is (-dz, dx)
      return [g.X[n] - dz * off + dx * adv, g.Z[n] + dx * off + dz * adv, Math.atan2(dx, dz) * 180 / Math.PI];
    }
    return [g.X[n], g.Z[n], 0];
  }
}

function facadeTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efefef'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 54, 64, 10);           // balcony slab shadow
  g.fillStyle = '#5a6878'; g.fillRect(12, 14, 40, 30);                  // window
  g.fillStyle = '#3c3a38'; g.fillRect(31, 14, 2, 30); g.fillRect(12, 28, 40, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; // colour management is off: no sRGB decode
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}

function makeMaterials(): Record<string, THREE.Material> {
  return {
    facade: new THREE.MeshLambertMaterial({ vertexColors: true, map: facadeTexture() }),
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    markings: new THREE.MeshBasicMaterial({ color: 0xe8e8e2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    lamps: new THREE.MeshBasicMaterial({ color: 0x888070 }),
  };
}
