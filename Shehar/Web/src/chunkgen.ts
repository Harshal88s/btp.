// City chunk geometry - port of City/ChunkBuilder.cs, tuned for the browser: everything that shares a material
// is merged (facades / solid vertex-coloured / markings / lamps) so a chunk costs ~4 draw calls on mobile.
import { RoadGraph } from './graph';
import { MeshBuilder, RGB, V3, v3, yawOf, GeoData } from './mesh';
import { signedArea } from './triangulate';
import { AreaData, BuildingData, ChunkData, CityIndex, NodeFlags, RoadInfo } from './types';

export interface Ctx { idx: CityIndex; graph: RoadGraph; arms: Int16Array; maxW: Float32Array; lite: boolean }

export function prepareCtx(idx: CityIndex, graph: RoadGraph, lite: boolean): Ctx {
  const n = idx.nodeX.length, arms = new Int16Array(n), maxW = new Float32Array(n);
  for (const r of idx.roads) {
    if (r.rank < 1 || r.tunnel) continue;
    r.nodes.forEach((nd, i) => {
      arms[nd] += (i === 0 || i === r.nodes.length - 1) ? 1 : 2;
      if (r.drivable || r.type === 'busway') maxW[nd] = Math.max(maxW[nd], r.width);
    });
  }
  return { idx, graph, arms, maxW, lite };
}
const isJunction = (c: Ctx, n: number) => c.arms[n] >= 3;
const jRad = (c: Ctx, n: number) => isJunction(c, n) ? c.maxW[n] * 0.5 + 1 : 0;

export interface SignalSpot { x: number; z: number; yaw: number; node: number; width: number }
export interface ChunkResult {
  cx: number; cz: number;
  facade?: GeoData; solid?: GeoData; markings?: GeoData; lamps?: GeoData;
  colliders: { pts: Float32Array; minH: number }[];
  signals: SignalSpot[]; sidewalks: Float32Array; vendors: Float32Array; buildings: number;
}

// heights (m) - wider gaps than Unity for browser depth precision
const ROAD_Y = 0.05, RANK_STEP = 0.012, JUNCTION_Y = 0.17, SIDEWALK_Y = 0.2;
const WHITE: RGB = [255, 255, 255];
const PAINTS: RGB[] = [[240, 228, 200], [242, 222, 160], [236, 204, 196], [196, 218, 230], [205, 226, 204], [236, 236, 228],
  [214, 150, 118], [196, 194, 188], [246, 210, 176], [214, 204, 228], [250, 246, 236], [226, 196, 120]];
const AREA_COL: Record<string, RGB> = {
  water: [64, 104, 116], park: [96, 140, 70], grass: [118, 148, 78], pitch: [112, 150, 76], cemetery: [118, 148, 78], forest: [72, 108, 52],
  sand: [188, 168, 128], construction: [178, 160, 124], campus: [170, 156, 130], military: [170, 156, 130], commercial: [166, 156, 146],
  industrial: [146, 142, 136], railway: [140, 132, 124], parking: [100, 100, 104], residential: [156, 144, 124],
};
const AREA_Y: Record<string, number> = {
  residential: 0.004, commercial: 0.006, industrial: 0.008, campus: 0.01, military: 0.01, railway: 0.012, cemetery: 0.014, construction: 0.014,
  parking: 0.018, grass: 0.022, pitch: 0.026, park: 0.03, forest: 0.034, sand: 0.034, water: 0.038,
};

function hash(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return x >>> 0;
}
const h01 = (n: number, salt: number) => (hash(n * 31 + salt) & 0xffff) / 65535;
const strHash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; };

export function addArea(solid: MeshBuilder, a: AreaData) {
  if (!a.pts || a.pts.length < 6) return;
  solid.polygonTop(a.pts, AREA_Y[a.kind] ?? 0.003, AREA_COL[a.kind] ?? AREA_COL.residential);
}

export function buildChunk(d: ChunkData, ctx: Ctx): ChunkResult {
  const idx = ctx.idx, cs = idx.chunkSize;
  const x0 = idx.minX + d.cx * cs, z0 = idx.minZ + d.cz * cs;
  const inB = (x: number, z: number) => x >= x0 && x < x0 + cs && z >= z0 && z < z0 + cs;
  const facade = new MeshBuilder(), solid = new MeshBuilder(), markings = new MeshBuilder(), lamps = new MeshBuilder();
  const res: ChunkResult = { cx: d.cx, cz: d.cz, colliders: [], signals: [], sidewalks: new Float32Array(0), vendors: new Float32Array(0), buildings: 0 };
  const sidewalks: number[] = [], vendors: number[] = [];

  for (const a of d.areas || []) addArea(solid, a);

  const boxes: number[][] = [];
  for (const b of d.buildings || []) {
    addBuilding(facade, solid, b, ctx.lite);
    const xs = b.pts.filter((_, i) => i % 2 === 0), zs = b.pts.filter((_, i) => i % 2 === 1);
    boxes.push([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]);
    res.colliders.push({ pts: Float32Array.from(b.pts), minH: b.minH });
  }
  res.buildings = (d.buildings || []).length;

  const jDone = new Set<number>(), fDone = new Set<number>();
  for (const piece of d.roads || []) {
    const road = idx.roads[piece.road];
    if (road.tunnel) continue;
    const line = piece.nodes.map(n => v3(idx.nodeX[n], 0, idx.nodeZ[n]));
    addRoad(ctx, road, piece.road, piece.nodes, line, inB, jDone, fDone, boxes, solid, markings, lamps, sidewalks, res);
  }

  for (const r of d.rails || []) {
    const pts: V3[] = []; for (let i = 0; i + 1 < r.pts.length; i += 2) pts.push(v3(r.pts[i], 0, r.pts[i + 1]));
    if (pts.length < 2) continue;
    if (r.elevated) viaduct(solid, pts); else solid.ribbon(pts, 3.4, 0, 0.06, [110, 104, 98], 2);
  }

  const trees = d.trees || [];
  const step = ctx.lite ? 4 : 2; // lite mode keeps half the park trees
  for (let i = 0; i + 1 < trees.length; i += step) tree(solid, trees[i], trees[i + 1], Math.round(trees[i] * 10) * 7919 + Math.round(trees[i + 1] * 10), ctx.lite);

  for (const p of idx.pois) {
    if (!inB(p.x, p.z)) continue;
    if (p.kind === 'fuel') fuelStation(solid, ctx, p.x, p.z, p.name || '');
    else if ((p.kind === 'food' || p.kind === 'market') && !ctx.lite) vendor(solid, ctx, p.x, p.z, p.name || '', vendors);
  }

  if (!facade.empty) res.facade = facade.finish();
  if (!solid.empty) res.solid = solid.finish();
  if (!markings.empty) res.markings = markings.finish();
  if (!lamps.empty) res.lamps = lamps.finish();
  res.sidewalks = Float32Array.from(sidewalks);
  res.vendors = Float32Array.from(vendors);
  return res;
}

function addBuilding(facade: MeshBuilder, solid: MeshBuilder, b: BuildingData, lite: boolean) {
  if (!b.pts || b.pts.length < 6) return;
  const h = hash(b.id);
  const k = b.kind || 'yes';
  const worship = k === 'worship', historic = k === 'historic';
  let paint = PAINTS[h % PAINTS.length];
  if (k === 'commercial' || k === 'office' || k === 'retail' || k === 'hotel') paint = h % 3 ? [200, 205, 212] : paint;
  if (historic) paint = [170, 140, 110];
  if (worship) paint = [250, 236, 214];
  const y0 = Math.max(0, b.minH || 0), top = Math.max(y0 + 2.5, b.h);
  facade.walls(b.pts, y0, top, paint);
  const rv = 180 + ((h >> 4) % 40);
  solid.polygonTop(b.pts, top, [rv, rv - 4, rv - 10]);
  if (y0 > 0.5) solid.polygonTop(b.pts, y0, [215, 212, 204], 0.1, true); // underside of elevated metro stations: kept light (lit only by sky bounce)
  let cx = 0, cz = 0; const n = b.pts.length / 2;
  for (let i = 0; i < n; i++) { cx += b.pts[2 * i]; cz += b.pts[2 * i + 1]; }
  cx /= n; cz /= n;
  const area = Math.abs(signedArea(b.pts));
  if (worship) {
    const r = Math.min(6, Math.max(1.2, Math.sqrt(area) * 0.3));
    solid.frustum(v3(cx, top, cz), r * 2, r * 2, r * 0.9, r * 0.9, r * 1.6, 0, [236, 140, 50]);
    solid.cone(v3(cx, top + r * 1.6, cz), r * 0.45, 0.05, r * 1.4, 8, [240, 160, 60]);
    solid.box(v3(cx, top + r * 3.0 + 1.5, cz + 0.7), 0.02, 0.5, 0.7, [255, 120, 20]);
  } else if (!lite && area > 45 && b.levels >= 2 && h01(b.id, 3) > 0.35) {
    const p = v3(cx + (b.pts[0] - cx) * 0.45, top + 0.65, cz + (b.pts[1] - cz) * 0.45);
    solid.cylinder(p, v3(0, 1, 0), 0.7, 1.3, 8, [28, 28, 30]); // black rooftop water tank
  }
}

function trim(line: V3[], rad: number[]): V3[][] {
  const runs: V3[][] = []; let cur: V3[] | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), ra = rad[i], rb = rad[i + 1];
    if (ra + rb >= L - 0.05) { if (cur && cur.length > 1) runs.push(cur); cur = null; continue; }
    const s = ra > 0 ? lerp(a, b, ra / L) : a, e = rb > 0 ? lerp(a, b, 1 - rb / L) : b;
    if (!cur || ra > 0) { if (cur && cur.length > 1) runs.push(cur); cur = [s]; }
    cur.push(e);
    if (rb > 0) { runs.push(cur); cur = null; }
  }
  if (cur && cur.length > 1) runs.push(cur);
  return runs;
}
const lerp = (a: V3, b: V3, t: number) => v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

function along(run: V3[], step: number, f: (x: number, z: number, dx: number, dz: number) => void) {
  let acc = step * 0.5;
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i], b = run[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.01) continue;
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    while (acc <= L) { f(a.x + dx * acc, a.z + dz * acc, dx, dz); acc += step; }
    acc -= L;
  }
}

function addRoad(ctx: Ctx, road: RoadInfo, ri: number, nodes: number[], line: V3[], inB: (x: number, z: number) => boolean,
  jDone: Set<number>, fDone: Set<number>, boxes: number[][], solid: MeshBuilder, markings: MeshBuilder, lamps: MeshBuilder, sw: number[], res: ChunkResult) {
  const foot = road.rank === 0 && road.type !== 'track';
  const y = ROAD_Y + Math.min(9, road.rank) * RANK_STEP + (ri % 4) * 0.002, w = road.width;
  if (foot || road.type === 'pedestrian') { solid.ribbon(line, Math.max(1.5, w), 0, foot ? 0.045 : y, [150, 142, 130], 4); return; }
  const asphalt: RGB = road.rank >= 6 ? [74, 74, 77] : [82, 82, 84];
  solid.ribbon(line, w, 0, y, asphalt, w);
  const n = line.length, rad = nodes.map(nd => jRad(ctx, nd));
  for (let i = 0; i < n; i++) {
    const nd = nodes[i];
    if (!isJunction(ctx, nd) || ctx.maxW[nd] < 4.5 || !inB(line[i].x, line[i].z) || jDone.has(nd)) continue;
    jDone.add(nd);
    solid.disc(v3(line[i].x, JUNCTION_Y, line[i].z), ctx.maxW[nd] * 0.55, 14, ctx.maxW[nd] >= 10 ? [74, 74, 77] : [82, 82, 84]);
  }
  const runs = trim(line, rad);
  const marked = road.drivable && road.rank >= 3 && w >= 6.5, twoWay = road.oneway === 0, my = y + 0.004;
  for (const run of runs) {
    if (marked) {
      if (twoWay) { dashed(markings, run, 0, my, 0.15); if (w >= 12) { dashed(markings, run, w / 4, my, 0.12); dashed(markings, run, -w / 4, my, 0.12); } }
      else { const lanes = road.lanes > 0 ? road.lanes : Math.max(1, Math.round(w / 3.3)); for (let k = 1; k < lanes; k++) dashed(markings, run, -w / 2 + k * w / lanes, my, 0.12); }
      if (road.rank >= 6) { markings.ribbon(run, 0.12, w / 2 - 0.35, my, WHITE, 1e6); markings.ribbon(run, 0.12, -w / 2 + 0.35, my, WHITE, 1e6); }
    }
    if (road.drivable && road.rank >= 3 && road.rank <= 8 && !road.bridge) {
      const swW = road.rank >= 5 ? 2.4 : 1.6, off = w / 2 + swW / 2 + 0.15;
      solid.ribbon(run, swW, off, SIDEWALK_Y, [150, 144, 134], 4);
      solid.ribbon(run, swW, -off, SIDEWALK_Y, [150, 144, 134], 4);
      solid.ribbon(run, 0.3, w / 2 + 0.15, SIDEWALK_Y + 0.004, [235, 190, 40], 2);  // painted kerbs
      solid.ribbon(run, 0.3, -(w / 2 + 0.15), SIDEWALK_Y + 0.004, [235, 190, 40], 2);
      if (road.rank <= 7) along(run, 25, (x, z, dx, dz) => { sw.push(x - dz * off, z + dx * off, x + dz * off, z - dx * off); });
    }
    if (road.bridge && road.drivable) { solid.fence(run, w / 2 + 0.2, y, y + 0.9, [180, 178, 172]); solid.fence(run, -(w / 2 + 0.2), y, y + 0.9, [180, 178, 172]); }
    if (road.drivable && road.rank >= 5 && !road.bridge && !ctx.lite) {
      let c = 0;
      along(run, 38, (x, z, dx, dz) => { const s = (c++ % 2) ? -1 : 1; lamp(solid, lamps, x - dz * s * (w / 2 + 0.7), z + dx * s * (w / 2 + 0.7), dz * s, -dx * s); });
    }
    if (road.drivable && (road.rank === 3 || road.rank === 5 || road.rank === 6) && !road.bridge) {
      let i2 = 0;
      along(run, ctx.lite ? 22 : 14, (x, z, dx, dz) => {
        i2++; const seed = road.id * 131 + i2;
        if (h01(seed, 1) < 0.45) return;
        const s = h01(seed, 2) < 0.5 ? 1 : -1, o = w / 2 + (road.rank >= 5 ? 2.0 : 1.4);
        const tx = x - dz * s * o, tz = z + dx * s * o;
        for (const b of boxes) if (tx > b[0] - 1.5 && tx < b[2] + 1.5 && tz > b[1] - 1.5 && tz < b[3] + 1.5) return;
        tree(solid, tx, tz, seed, ctx.lite);
      });
    }
  }
  if (!road.drivable) return;
  for (let i = 0; i < n; i++) {
    const nd = nodes[i], f = ctx.idx.nodeFlags[nd];
    if (!(f & 7) || !inB(line[i].x, line[i].z) || fDone.has(nd)) continue;
    fDone.add(nd);
    let dx = (i < n - 1 ? line[i + 1].x - line[i].x : line[i].x - line[i - 1].x), dz = (i < n - 1 ? line[i + 1].z - line[i].z : line[i].z - line[i - 1].z);
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const yaw = yawOf(dx, dz);
    if (f & NodeFlags.TrafficSignal) res.signals.push({ x: line[i].x, z: line[i].z, yaw, node: nd, width: isJunction(ctx, nd) ? ctx.maxW[nd] : w });
    if (f & NodeFlags.SpeedBump) solid.box(v3(line[i].x, y + 0.045, line[i].z), w, 0.09, 0.7, [230, 190, 30], yaw);
    if ((f & NodeFlags.Crossing) && road.rank >= 5 && !isJunction(ctx, nd)) {
      const nx = -dz, nz = dx;
      // zebra: stripes across the road
      for (let s = -w / 2 + 0.5; s < w / 2 - 0.3; s += 1.0)
        markings.box(v3(line[i].x + nx * s, y + 0.006, line[i].z + nz * s), 0.5, 0.01, 3, WHITE, yaw);
    }
  }
}

function dashed(mb: MeshBuilder, run: V3[], off: number, y: number, width: number) {
  // explicit 3 m dashes every 6 m (no texture needed)
  let acc = 0, on = true, seg: V3[] = [];
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i], b = run[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.01) continue;
    let t = 0;
    while (t < L) {
      const left = 3 - acc, step = Math.min(left, L - t);
      const p0 = lerp(a, b, t / L), p1 = lerp(a, b, (t + step) / L);
      if (on) { if (!seg.length) seg.push(p0); seg.push(p1); }
      t += step; acc += step;
      if (acc >= 3 - 1e-6) { if (on && seg.length > 1) mb.ribbon(seg, width, off, y, WHITE, 1e6); seg = []; on = !on; acc = 0; }
    }
  }
  if (on && seg.length > 1) mb.ribbon(seg, width, off, y, WHITE, 1e6);
}

function lamp(solid: MeshBuilder, lamps: MeshBuilder, x: number, z: number, tx: number, tz: number) {
  const g: RGB = [120, 122, 125];
  solid.cylinder(v3(x, 4, z), v3(0, 1, 0), 0.09, 8, 5, g, false);
  const yaw = yawOf(tx, tz);
  solid.box(v3(x + tx * 0.6, 7.9, z + tz * 0.6), 0.08, 0.08, 1.3, g, yaw);
  lamps.box(v3(x + tx * 1.2, 7.8, z + tz * 1.2), 0.35, 0.12, 0.7, [255, 220, 160], yaw);
}

export function tree(solid: MeshBuilder, x: number, z: number, seed: number, lite: boolean) {
  const s = 0.75 + h01(seed, 7) * 0.6, gv = 140 + h01(seed, 8) * 50;
  const leaf: RGB = [gv * 0.55, gv, gv * 0.45], bark: RGB = [92, 70, 52];
  if (h01(seed, 9) < 0.18) {
    solid.cylinder(v3(x, 1.5 * s, z), v3(0, 1, 0), 0.12 * s, 3 * s, 4, bark, false);
    solid.blob(v3(x, 5.5 * s, z), 1.1 * s, 4.2 * s, 1.1 * s, lite ? 5 : 6, 3, leaf);
  } else {
    solid.cylinder(v3(x, 2 * s, z), v3(0, 1, 0), 0.22 * s, 4 * s, 5, bark, false);
    solid.blob(v3(x, 5.2 * s, z), 3.2 * s, 2.3 * s, 3.2 * s, lite ? 5 : 7, lite ? 3 : 4, leaf);
  }
}

function viaduct(solid: MeshBuilder, pts: V3[]) {
  const H = 12, c: RGB = [205, 202, 195];
  solid.ribbon(pts, 9, 0, H, c, 9);
  solid.ribbon(pts, 9, 0, H - 1.2, [160, 158, 152], 9, true);
  solid.fence(pts, 4.5, H - 1.2, H + 1, c); solid.fence(pts, -4.5, H - 1.2, H + 1, c);
  solid.ribbon(pts, 3, 2.1, H + 0.05, [110, 104, 98], 2); solid.ribbon(pts, 3, -2.1, H + 0.05, [110, 104, 98], 2);
  along(pts, 28, (x, z, dx, dz) => {
    const yaw = yawOf(dx, dz);
    solid.box(v3(x, (H - 1.2) / 2, z), 1.8, H - 1.2, 1.8, c, yaw);
    solid.box(v3(x, H - 1.6, z), 7.5, 1, 2.2, c, yaw);
  });
}

function fuelStation(solid: MeshBuilder, ctx: Ctx, x: number, z: number, name: string) {
  const [e] = ctx.graph.nearestEdge(x, z, 80);
  let yaw = 0;
  if (e >= 0) { const a = ctx.idx.edgeA[e], b = ctx.idx.edgeB[e]; yaw = yawOf(ctx.idx.nodeX[b] - ctx.idx.nodeX[a], ctx.idx.nodeZ[b] - ctx.idx.nodeZ[a]); }
  const r = yaw * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
  const P = (lx: number, ly: number, lz: number) => v3(x + lx * cs + lz * sn, ly, z - lx * sn + lz * cs);
  const white: RGB = [240, 240, 240], accent: RGB = [200 + (hash(strHash(name)) % 55), 60, 40];
  solid.box(v3(x, 5.4, z), 16, 0.8, 9, white, yaw);
  solid.box(v3(x, 5.0, z), 16.1, 0.25, 9.1, accent, yaw);
  for (const i of [-1, 1]) for (const j of [-1, 1]) solid.box(P(i * 5.5, 2.5, j * 2.8), 0.4, 5, 0.4, white, yaw);
  for (const i of [-1, 1]) { solid.box(P(i * 3, 0.9, 0), 0.9, 1.8, 0.6, accent, yaw); solid.box(P(i * 3, 0.15, 0), 1.6, 0.3, 3.5, [200, 200, 195], yaw); }
}

function vendor(solid: MeshBuilder, ctx: Ctx, px: number, pz: number, name: string, out: number[]) {
  const [e, t] = ctx.graph.nearestEdge(px, pz, 40); if (e < 0) return;
  const a = ctx.idx.edgeA[e], b = ctx.idx.edgeB[e], road = ctx.graph.roadOfEdge(e);
  const ax = ctx.idx.nodeX[a], az = ctx.idx.nodeZ[a], bx = ctx.idx.nodeX[b], bz = ctx.idx.nodeZ[b];
  const ox = ax + (bx - ax) * t, oz = az + (bz - az) * t;
  let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  let nx = -dz, nz = dx; if ((px - ox) * nx + (pz - oz) * nz < 0) { nx = -nx; nz = -nz; }
  const cx = ox + nx * (road.width / 2 + 1.4), cz = oz + nz * (road.width / 2 + 1.4), yaw = yawOf(-nx, -nz);
  const h = hash(strHash(name));
  const umb: RGB[] = [[220, 40, 40], [30, 120, 200], [250, 180, 30], [30, 150, 80]];
  solid.box(v3(cx, 0.9, cz), 1.9, 0.15, 1.0, [150, 100, 60], yaw);
  solid.box(v3(cx, 0.55, cz), 1.8, 0.6, 0.9, [80, 120, 160], yaw);
  solid.cylinder(v3(cx, 1.7, cz), v3(0, 1, 0), 0.04, 1.6, 4, [90, 90, 90], false);
  solid.cone(v3(cx, 2.3, cz), 1.4, 0.05, 0.6, 8, umb[h % 4]);
  const vx = cx + nx * 0.9, vz = cz + nz * 0.9;
  solid.box(v3(vx, 0.45, vz), 0.3, 0.9, 0.22, [60, 60, 70], yaw);
  solid.box(v3(vx, 1.2, vz), 0.42, 0.6, 0.25, umb[(h >> 3) % 4], yaw);
  solid.blob(v3(vx, 1.65, vz), 0.12, 0.14, 0.12, 5, 3, [150, 100, 70]);
  out.push(cx, cz);
}
