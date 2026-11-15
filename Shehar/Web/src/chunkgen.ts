// City chunk geometry (port of City/ChunkBuilder.cs) on real terrain:
//  - terrain mesh coloured by OSM land use (parks, forest, river, campuses...)
//  - roads / footpaths / markings draped over the hills, junction fills, zebra crossings, speed breakers
//  - buildings seated on their lowest footprint point, 3 facade styles, shopfronts + signboards on busy streets
//  - trees, street lights, petrol pumps, food carts, elevated metro, and special landmark buildings
// Everything with one material is merged so a chunk costs ~10 draw calls.
import { RoadGraph } from './graph';
import { MeshBuilder, RGB, V3, v3, yawOf, GeoData, HeightFn } from './mesh';
import { pointInPoly, signedArea } from './triangulate';
import { AreaData, BuildingData, ChunkData, CityIndex, GlobalData, NodeFlags, RoadInfo } from './types';

export interface Ctx { idx: CityIndex; graph: RoadGraph; arms: Int16Array; maxW: Float32Array; lite: boolean; ter: HeightFn; global: GlobalData }

export function prepareCtx(idx: CityIndex, graph: RoadGraph, lite: boolean, ter: HeightFn, global: GlobalData): Ctx {
  const n = idx.nodeX.length, arms = new Int16Array(n), maxW = new Float32Array(n);
  for (const r of idx.roads) {
    if (r.rank < 1 || r.tunnel) continue;
    r.nodes.forEach((nd, i) => {
      arms[nd] += (i === 0 || i === r.nodes.length - 1) ? 1 : 2;
      if (r.drivable || r.type === 'busway') maxW[nd] = Math.max(maxW[nd], r.width);
    });
  }
  return { idx, graph, arms, maxW, lite, ter, global };
}
const isJunction = (c: Ctx, n: number) => c.arms[n] >= 3;
const jRad = (c: Ctx, n: number) => isJunction(c, n) ? c.maxW[n] * 0.5 + 1 : 0;

export interface SignalSpot { x: number; z: number; yaw: number; node: number; width: number }
export interface NameBoard { x: number; z: number; y: number; yaw: number; name: string }
export interface Special { name: string; pts: Float32Array; base: number; top: number }
export interface Collider { pts: Float32Array; base: number; top: number; minH: number }
export interface ChunkResult {
  cx: number; cz: number;
  groups: Record<string, GeoData>;
  colliders: Collider[];
  signals: SignalSpot[]; boards: NameBoard[]; specials: Special[];
  sidewalks: Float32Array; vendors: Float32Array; buildings: number;
}

const ROAD_Y = 0.12, RANK_STEP = 0.012, JUNCTION_Y = 0.24, SIDEWALK_Y = 0.27, TERRAIN_CELL = 12.5;
const WHITE: RGB = [255, 255, 255];
const PAINTS: RGB[] = [[240, 228, 200], [242, 222, 160], [236, 204, 196], [196, 218, 230], [205, 226, 204], [236, 236, 228],
  [214, 150, 118], [196, 194, 188], [246, 210, 176], [214, 204, 228], [250, 246, 236], [226, 196, 120], [230, 215, 190], [210, 220, 200]];
const GROUND: RGB = [138, 128, 110];
const LAND: Record<string, RGB> = {
  water: [62, 104, 118], park: [92, 136, 66], grass: [112, 146, 74], pitch: [104, 148, 72], cemetery: [110, 140, 76], forest: [70, 104, 50],
  sand: [184, 166, 126], construction: [170, 150, 116], campus: [168, 156, 128], military: [150, 150, 112], commercial: [150, 142, 132],
  industrial: [132, 128, 122], railway: [124, 116, 108], parking: [112, 110, 108], residential: [142, 132, 114],
};
const LAND_ORDER = ['residential', 'commercial', 'industrial', 'campus', 'military', 'railway', 'cemetery', 'construction', 'parking', 'grass', 'pitch', 'park', 'forest', 'sand', 'water'];

function hash(n: number): number { let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return x >>> 0; }
const h01 = (n: number, salt: number) => (hash(n * 31 + salt) & 0xffff) / 65535;
const strHash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; };
const lerp = (a: V3, b: V3, t: number) => v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

/** split long segments so draped ribbons follow the terrain */
function subdivide(line: V3[], maxSeg: number): V3[] {
  const out: V3[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / maxSeg);
    for (let k = 1; k <= n; k++) out.push(lerp(a, b, k / n));
  }
  return out;
}

export function buildChunk(d: ChunkData, ctx: Ctx): ChunkResult {
  const idx = ctx.idx, cs = idx.chunkSize, ter = ctx.ter;
  const x0 = idx.minX + d.cx * cs, z0 = idx.minZ + d.cz * cs;
  const inB = (x: number, z: number) => x >= x0 && x < x0 + cs && z >= z0 && z < z0 + cs;
  const G: Record<string, MeshBuilder> = {};
  const g = (name: string) => (G[name] ||= new MeshBuilder());
  const res: ChunkResult = { cx: d.cx, cz: d.cz, groups: {}, colliders: [], signals: [], boards: [], specials: [], sidewalks: new Float32Array(0), vendors: new Float32Array(0), buildings: 0 };
  const sidewalks: number[] = [], vendors: number[] = [];

  terrainMesh(g('terrain'), d, ctx, x0, z0, cs);

  const boxes: number[][] = [];
  for (const b of d.buildings || []) {
    addBuilding(G, g, b, ctx, res);
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (let i = 0; i < b.pts.length; i += 2) { bx0 = Math.min(bx0, b.pts[i]); bx1 = Math.max(bx1, b.pts[i]); bz0 = Math.min(bz0, b.pts[i + 1]); bz1 = Math.max(bz1, b.pts[i + 1]); }
    boxes.push([bx0, bz0, bx1, bz1]);
  }
  res.buildings = (d.buildings || []).length;

  const jDone = new Set<number>(), fDone = new Set<number>(), boardDone = new Set<string>();
  for (const piece of d.roads || []) {
    const road = idx.roads[piece.road];
    if (road.tunnel) continue;
    const line = piece.nodes.map(n => v3(idx.nodeX[n], 0, idx.nodeZ[n]));
    addRoad(ctx, road, piece.road, piece.nodes, line, inB, jDone, fDone, boardDone, boxes, g, sidewalks, res);
  }

  for (const r of d.rails || []) {
    const pts: V3[] = []; for (let i = 0; i + 1 < r.pts.length; i += 2) pts.push(v3(r.pts[i], 0, r.pts[i + 1]));
    if (pts.length < 2) continue;
    if (r.elevated) viaduct(g('solid'), pts, ter);
    else { const m = g('road'); m.drape = ter; m.ribbon(subdivide(pts, 6), 3.4, 0, 0.1, [110, 104, 98], 2); m.drape = null; }
  }

  const trees = d.trees || [];
  const step = ctx.lite ? 4 : 2;
  for (let i = 0; i + 1 < trees.length; i += step) tree(g('solid'), trees[i], trees[i + 1], Math.round(trees[i] * 10) * 7919 + Math.round(trees[i + 1] * 10), ctx.lite, ter);

  for (const p of idx.pois) {
    if (!inB(p.x, p.z)) continue;
    if (p.kind === 'fuel') fuelStation(g('solid'), ctx, p.x, p.z, p.name || '');
    else if ((p.kind === 'food' || p.kind === 'market') && !ctx.lite) vendor(g('solid'), ctx, p.x, p.z, p.name || '', vendors);
  }

  for (const k in G) if (!G[k].empty) res.groups[k] = G[k].finish();
  res.sidewalks = Float32Array.from(sidewalks);
  res.vendors = Float32Array.from(vendors);
  return res;
}

// ------------------------------------------------------------------ terrain
function terrainMesh(m: MeshBuilder, d: ChunkData, ctx: Ctx, x0: number, z0: number, cs: number) {
  const n = Math.round(cs / TERRAIN_CELL), ter = ctx.ter;
  // candidate land-use polygons: this chunk's areas + large global ones overlapping it
  const polys: { kind: string; pts: number[]; bb: number[] }[] = [];
  const add = (a: AreaData) => {
    let ax0 = Infinity, az0 = Infinity, ax1 = -Infinity, az1 = -Infinity;
    for (let i = 0; i < a.pts.length; i += 2) { ax0 = Math.min(ax0, a.pts[i]); ax1 = Math.max(ax1, a.pts[i]); az0 = Math.min(az0, a.pts[i + 1]); az1 = Math.max(az1, a.pts[i + 1]); }
    if (ax1 < x0 - 13 || ax0 > x0 + cs + 13 || az1 < z0 - 13 || az0 > z0 + cs + 13) return;
    polys.push({ kind: a.kind, pts: a.pts, bb: [ax0, az0, ax1, az1] });
  };
  for (const a of d.areas || []) add(a);
  for (const a of ctx.global.areas) add(a);
  polys.sort((a, b) => LAND_ORDER.indexOf(a.kind) - LAND_ORDER.indexOf(b.kind));
  const lines = ctx.global.waterLines.filter(w => w.width >= 6);
  const colAt = (x: number, z: number): RGB => {
    let c = GROUND;
    for (const p of polys) if (x >= p.bb[0] && x <= p.bb[2] && z >= p.bb[1] && z <= p.bb[3] && pointInPoly(p.pts, x, z)) c = LAND[p.kind] || c;
    if (c !== LAND.water) for (const w of lines) for (let i = 0; i + 3 < w.pts.length; i += 2) {
      const ax = w.pts[i], az = w.pts[i + 1], bx = w.pts[i + 2], bz = w.pts[i + 3];
      if (Math.max(ax, bx) < x - 40 || Math.min(ax, bx) > x + 40 || Math.max(az, bz) < z - 40 || Math.min(az, bz) > z + 40) continue;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + t * dx - x, az + t * dz - z) < w.width * 0.5) return LAND.water;
    }
    // subtle variation + greener, darker hillsides
    const hn = h01(Math.round(x * 0.3) * 73856093 ^ Math.round(z * 0.3) * 19349663, 5) * 14 - 7;
    return [c[0] + hn, c[1] + hn, c[2] + hn * 0.6];
  };
  const start = m.vertexCount;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * TERRAIN_CELL, z = z0 + j * TERRAIN_CELL;
      m.vert(x, ter.h(x, z), z, colAt(x, z), x / 7, z / 7);
    }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = start + j * (n + 1) + i, b = a + 1, c = a + n + 1, e = c + 1;
      // Unity-style clockwise (as seen from above) -> faces up after finish()
      m.tri(a, c, e); m.tri(a, e, b);
    }
}

// ------------------------------------------------------------------ buildings
function addBuilding(G: Record<string, MeshBuilder>, g: (n: string) => MeshBuilder, b: BuildingData, ctx: Ctx, res: ChunkResult) {
  if (!b.pts || b.pts.length < 6) return;
  const ter = ctx.ter, h = hash(b.id), k = b.kind || 'yes';
  let base = Infinity, cx = 0, cz = 0; const n = b.pts.length / 2;
  for (let i = 0; i < n; i++) { base = Math.min(base, ter.h(b.pts[2 * i], b.pts[2 * i + 1])); cx += b.pts[2 * i]; cz += b.pts[2 * i + 1]; }
  cx /= n; cz /= n;
  const worship = k === 'worship', historic = k === 'historic', hostel = k === 'hostel';
  const commercial = k === 'commercial' || k === 'office' || k === 'retail' || k === 'hotel';
  let style = historic ? 'facadeOld' : commercial && h % 3 ? 'facadeGlass' : (k === 'house' || k === 'detached') && h % 2 ? 'facadeOld' : 'facadeApt';
  if (hostel) style = 'hostel';
  let paint = PAINTS[h % PAINTS.length];
  if (style === 'facadeGlass') paint = [196, 205, 214];
  if (historic) paint = [176, 146, 116];
  if (worship) paint = [250, 236, 214];
  if (hostel) paint = [255, 255, 255];
  const y0 = Math.max(0, b.minH || 0), top = Math.max(y0 + 2.5, b.h);
  const wall = g(style);
  wall.baseY = base;
  wall.walls(b.pts, y0 > 0.5 ? y0 : -1.5, top, paint); // extends below grade so slopes never show gaps
  wall.baseY = 0;
  const solid = g('solid');
  solid.baseY = base;
  const rv = 182 + ((h >>> 4) % 36);
  solid.polygonTop(b.pts, top, [rv, rv - 4, rv - 10]);
  if (y0 > 0.5) solid.polygonTop(b.pts, y0, [215, 212, 204], 0.1, true);
  const area = Math.abs(signedArea(b.pts));
  if (!ctx.lite && !worship && area > 60 && top > 7) solid.fence(ring(b.pts), 0, top, top + 0.9, [rv - 10, rv - 14, rv - 20]); // roof parapet
  if (worship) {
    const r = Math.min(6, Math.max(1.2, Math.sqrt(area) * 0.3));
    solid.frustum(v3(cx, top, cz), r * 2, r * 2, r * 0.9, r * 0.9, r * 1.6, 0, [236, 140, 50]);
    solid.cone(v3(cx, top + r * 1.6, cz), r * 0.45, 0.05, r * 1.4, 8, [240, 160, 60]);
    solid.box(v3(cx, top + r * 3.0 + 1.5, cz + 0.7), 0.02, 0.5, 0.7, [255, 120, 20]);
  } else if (!ctx.lite && area > 45 && b.levels >= 2 && h01(b.id, 3) > 0.35) {
    solid.cylinder(v3(cx + (b.pts[0] - cx) * 0.45, top + 0.65, cz + (b.pts[1] - cz) * 0.45), v3(0, 1, 0), 0.7, 1.3, 8, [28, 28, 30]); // Sintex-style tank
  }
  solid.baseY = 0;
  // shopfronts (rolling shutters + signboards) on ground floors facing busy streets
  if (!hostel && !worship && !historic && y0 < 0.5 && top > 4) shopfronts(g('shop'), b, ctx, base, h);
  res.colliders.push({ pts: Float32Array.from(b.pts), base, top: base + top, minH: y0 });
  if (hostel) res.specials.push({ name: b.name, pts: Float32Array.from(b.pts), base, top: base + top });
}

function ring(p: number[]): V3[] { const r: V3[] = []; for (let i = 0; i < p.length; i += 2) r.push(v3(p[i], 0, p[i + 1])); r.push(r[0]); return r; }

const SIGN_ROWS = 12;
function shopfronts(m: MeshBuilder, b: BuildingData, ctx: Ctx, base: number, h: number) {
  const n = b.pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = b.pts[2 * i], az = b.pts[2 * i + 1], bx = b.pts[2 * j], bz = b.pts[2 * j + 1];
    const len = Math.hypot(bx - ax, bz - az); if (len < 4) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const [e, t, dist] = ctx.graph.nearestEdge(mx, mz, 14);
    if (e < 0) continue;
    const road = ctx.graph.roadOfEdge(e);
    if (road.rank < 4 || dist > road.width / 2 + 9) continue;
    // outward normal of a CCW footprint is to the right of a->b; it must point towards the road
    const nx = (bz - az) / len, nz = -(bx - ax) / len;
    const ea = ctx.idx.edgeA[e], eb = ctx.idx.edgeB[e];
    const rx = ctx.graph.X[ea] + (ctx.graph.X[eb] - ctx.graph.X[ea]) * t, rz = ctx.graph.Z[ea] + (ctx.graph.Z[eb] - ctx.graph.Z[ea]) * t;
    if ((rx - mx) * nx + (rz - mz) * nz <= 0) continue;
    const segs = Math.max(1, Math.round(len / 3.6)), o1 = 0.06, o2 = 0.22;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const px0 = ax + (bx - ax) * t0 + nx * o1, pz0 = az + (bz - az) * t0 + nz * o1, px1 = ax + (bx - ax) * t1 + nx * o1, pz1 = az + (bz - az) * t1 + nz * o1;
      // shutter region of the atlas: v 0.0 .. 0.25
      m.quad(v3(px0, base, pz0), v3(px0, base + 3, pz0), v3(px1, base + 3, pz1), v3(px1, base, pz1), [255, 255, 255], [0, 0, 0, 0.25, 1, 0.25, 1, 0]);
    }
    const row = (hash(h + i * 7) % SIGN_ROWS), v0 = 0.25 + row * 0.75 / SIGN_ROWS, v1 = v0 + 0.75 / SIGN_ROWS;
    const sx0 = ax + nx * o2, sz0 = az + nz * o2, sx1 = bx + nx * o2, sz1 = bz + nz * o2;
    m.quad(v3(sx0, base + 3.05, sz0), v3(sx0, base + 3.85, sz0), v3(sx1, base + 3.85, sz1), v3(sx1, base + 3.05, sz1), [255, 255, 255], [0, v0, 0, v1, 1, v1, 1, v0]);
  }
}

// ------------------------------------------------------------------ roads
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

function along(run: V3[], step: number, f: (x: number, z: number, dx: number, dz: number) => void) {
  let acc = step * 0.5;
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i], b = run[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.01) continue;
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    while (acc <= L) { f(a.x + dx * acc, a.z + dz * acc, dx, dz); acc += step; }
    acc -= L;
  }
}

function addRoad(ctx: Ctx, road: RoadInfo, ri: number, nodes: number[], line0: V3[], inB: (x: number, z: number) => boolean,
  jDone: Set<number>, fDone: Set<number>, boardDone: Set<string>, boxes: number[][], g: (n: string) => MeshBuilder, sw: number[], res: ChunkResult) {
  const ter = ctx.ter, foot = road.rank === 0 && road.type !== 'track';
  const y = ROAD_Y + Math.min(9, road.rank) * RANK_STEP + (ri % 4) * 0.003, w = road.width;
  const rd = g('road'), mk = g('markings'), solid = g('solid');
  rd.drape = ter; mk.drape = ter;
  const line = subdivide(line0, 6);
  if (foot || road.type === 'pedestrian') { rd.ribbon(line, Math.max(1.5, w), 0, foot ? 0.09 : y, [176, 168, 154], 3); rd.drape = null; mk.drape = null; return; }
  rd.ribbon(line, w, 0, y, road.rank >= 6 ? [92, 92, 96] : [102, 101, 102], 4);
  const n = line0.length, rad = nodes.map(nd => jRad(ctx, nd));
  for (let i = 0; i < n; i++) {
    const nd = nodes[i];
    if (!isJunction(ctx, nd) || ctx.maxW[nd] < 4.5 || !inB(line0[i].x, line0[i].z) || jDone.has(nd)) continue;
    jDone.add(nd);
    rd.disc(v3(line0[i].x, JUNCTION_Y, line0[i].z), ctx.maxW[nd] * 0.55, 16, ctx.maxW[nd] >= 10 ? [92, 92, 96] : [102, 101, 102]);
    // blue Pune street-name board at junctions of main roads (real OSM names)
    if (road.rank >= 5 && road.name && !boardDone.has(road.name) && !ctx.lite) {
      boardDone.add(road.name);
      const a = line0[Math.min(i + 1, n - 1)], b = line0[Math.max(i - 1, 0)];
      const dx = a.x - b.x, dz = a.z - b.z, l = Math.hypot(dx, dz) || 1, off = ctx.maxW[nd] * 0.55 + 2;
      const bx = line0[i].x + (-dz / l) * off, bz = line0[i].z + (dx / l) * off;
      res.boards.push({ x: bx, z: bz, y: ter.h(bx, bz), yaw: yawOf(dx, dz), name: road.alt && road.alt.length <= 12 ? road.alt : road.name });
    }
  }
  const runs = trim(line0, rad).map(r => subdivide(r, 6));
  const marked = road.drivable && road.rank >= 3 && w >= 6.5, twoWay = road.oneway === 0, my = y + 0.006;
  for (const run of runs) {
    if (marked) {
      if (twoWay) { dashed(mk, run, 0, my, 0.15); if (w >= 12) { dashed(mk, run, w / 4, my, 0.12); dashed(mk, run, -w / 4, my, 0.12); } }
      else { const lanes = road.lanes > 0 ? road.lanes : Math.max(1, Math.round(w / 3.3)); for (let k = 1; k < lanes; k++) dashed(mk, run, -w / 2 + k * w / lanes, my, 0.12); }
      if (road.rank >= 6) { mk.ribbon(run, 0.12, w / 2 - 0.35, my, WHITE, 1e6); mk.ribbon(run, 0.12, -w / 2 + 0.35, my, WHITE, 1e6); }
    }
    if (road.drivable && road.rank >= 3 && road.rank <= 8 && !road.bridge) {
      const swW = road.rank >= 5 ? 2.4 : 1.6, off = w / 2 + swW / 2 + 0.15;
      rd.ribbon(run, swW, off, SIDEWALK_Y, [168, 160, 150], 3);
      rd.ribbon(run, swW, -off, SIDEWALK_Y, [168, 160, 150], 3);
      kerb(mk, run, w / 2 + 0.15, SIDEWALK_Y + 0.006); kerb(mk, run, -(w / 2 + 0.15), SIDEWALK_Y + 0.006);
      if (road.rank <= 7) along(run, 25, (x, z, dx, dz) => { sw.push(x - dz * off, z + dx * off, x + dz * off, z - dx * off); });
    }
    if (road.bridge && road.drivable) { solid.drape = ter; solid.fence(run, w / 2 + 0.2, y, y + 0.9, [180, 178, 172]); solid.fence(run, -(w / 2 + 0.2), y, y + 0.9, [180, 178, 172]); solid.drape = null; }
    if (road.drivable && road.rank >= 5 && !road.bridge && !ctx.lite) {
      let c = 0;
      along(run, 34, (x, z, dx, dz) => { const s = (c++ % 2) ? -1 : 1; lamp(solid, g('lamps'), x - dz * s * (w / 2 + 0.7), z + dx * s * (w / 2 + 0.7), dz * s, -dx * s, ter); });
    }
    if (road.drivable && (road.rank === 3 || road.rank === 5 || road.rank === 6) && !road.bridge) {
      let i2 = 0;
      along(run, ctx.lite ? 22 : 13, (x, z, dx, dz) => {
        i2++; const seed = road.id * 131 + i2;
        if (h01(seed, 1) < 0.42) return;
        const s = h01(seed, 2) < 0.5 ? 1 : -1, o = w / 2 + (road.rank >= 5 ? 2.0 : 1.4);
        const tx = x - dz * s * o, tz = z + dx * s * o;
        for (const b of boxes) if (tx > b[0] - 1.5 && tx < b[2] + 1.5 && tz > b[1] - 1.5 && tz < b[3] + 1.5) return;
        tree(solid, tx, tz, seed, ctx.lite, ter);
      });
    }
    // speed-limit signs on main roads (Indian style red ring)
    if (road.drivable && road.rank >= 5 && !ctx.lite && run.length > 3) {
      const a = run[1], b = run[0], dx = a.x - b.x, dz = a.z - b.z, l = Math.hypot(dx, dz) || 1;
      const sx = a.x + (-dz / l) * (w / 2 + 1.2), sz = a.z + (dx / l) * (w / 2 + 1.2);
      speedSign(solid, sx, sz, ter.h(sx, sz), yawOf(-dx, -dz));
    }
  }
  rd.drape = null; mk.drape = null;
  if (!road.drivable) return;
  for (let i = 0; i < n; i++) {
    const nd = nodes[i], f = ctx.idx.nodeFlags[nd];
    if (!(f & 7) || !inB(line0[i].x, line0[i].z) || fDone.has(nd)) continue;
    fDone.add(nd);
    let dx = (i < n - 1 ? line0[i + 1].x - line0[i].x : line0[i].x - line0[i - 1].x), dz = (i < n - 1 ? line0[i + 1].z - line0[i].z : line0[i].z - line0[i - 1].z);
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const yaw = yawOf(dx, dz), hy = ter.h(line0[i].x, line0[i].z);
    if (f & NodeFlags.TrafficSignal) res.signals.push({ x: line0[i].x, z: line0[i].z, yaw, node: nd, width: isJunction(ctx, nd) ? ctx.maxW[nd] : w });
    if (f & NodeFlags.SpeedBump) { solid.baseY = hy; solid.box(v3(line0[i].x, y + 0.045, line0[i].z), w, 0.09, 0.7, [230, 190, 30], yaw); solid.baseY = 0; }
    if ((f & NodeFlags.Crossing) && road.rank >= 5 && !isJunction(ctx, nd)) {
      const nx = -dz, nz = dx;
      mk.baseY = hy;
      for (let s = -w / 2 + 0.5; s < w / 2 - 0.3; s += 1.0) mk.box(v3(line0[i].x + nx * s, y + 0.01, line0[i].z + nz * s), 0.5, 0.01, 3, WHITE, yaw);
      mk.baseY = 0;
    }
  }
}

function dashed(mb: MeshBuilder, run: V3[], off: number, y: number, width: number) {
  let acc = 0, on = true, seg: V3[] = [];
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i], b = run[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.01) continue;
    let t = 0;
    while (t < L) {
      const step = Math.min(3 - acc, L - t), p0 = lerp(a, b, t / L), p1 = lerp(a, b, (t + step) / L);
      if (on) { if (!seg.length) seg.push(p0); seg.push(p1); }
      t += step; acc += step;
      if (acc >= 3 - 1e-6) { if (on && seg.length > 1) mb.ribbon(seg, width, off, y, WHITE, 1e6); seg = []; on = !on; acc = 0; }
    }
  }
  if (on && seg.length > 1) mb.ribbon(seg, width, off, y, WHITE, 1e6);
}

/** black-and-yellow painted kerb (alternating 1 m blocks) */
function kerb(mb: MeshBuilder, run: V3[], off: number, y: number) {
  let acc = 0, yellow = true, seg: V3[] = [];
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i], b = run[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.01) continue;
    let t = 0;
    while (t < L) {
      const step = Math.min(1 - acc, L - t), p0 = lerp(a, b, t / L), p1 = lerp(a, b, (t + step) / L);
      if (!seg.length) seg.push(p0); seg.push(p1);
      t += step; acc += step;
      if (acc >= 1 - 1e-6) { if (seg.length > 1) mb.ribbon(seg, 0.3, off, y, yellow ? [236, 190, 30] : [34, 34, 34], 1e6); seg = []; yellow = !yellow; acc = 0; }
    }
  }
  if (seg.length > 1) mb.ribbon(seg, 0.3, off, y, yellow ? [236, 190, 30] : [34, 34, 34], 1e6);
}

function speedSign(m: MeshBuilder, x: number, z: number, base: number, yaw: number) {
  m.baseY = base;
  m.cylinder(v3(x, 1.25, z), v3(0, 1, 0), 0.04, 2.5, 5, [150, 150, 150], false);
  const r = yaw * Math.PI / 180, fx = Math.sin(r), fz = Math.cos(r);
  m.cylinder(v3(x, 2.7, z), v3(fx, 0, fz), 0.36, 0.03, 14, [210, 30, 30]);
  m.cylinder(v3(x + fx * 0.02, 2.7, z + fz * 0.02), v3(fx, 0, fz), 0.27, 0.03, 14, [245, 245, 245]);
  m.box(v3(x + fx * 0.04, 2.7, z + fz * 0.04), 0.06, 0.2, 0.01, [20, 20, 20], yaw + 90);
  m.box(v3(x + fx * 0.04 + Math.cos(r) * 0.08, 2.7, z + fz * 0.04 - Math.sin(r) * 0.08), 0.06, 0.2, 0.01, [20, 20, 20], yaw + 90);
  m.baseY = 0;
}

function lamp(solid: MeshBuilder, lamps: MeshBuilder, x: number, z: number, tx: number, tz: number, ter: HeightFn) {
  const gc: RGB = [120, 122, 125], b = ter.h(x, z);
  solid.baseY = b; lamps.baseY = b;
  solid.cylinder(v3(x, 4, z), v3(0, 1, 0), 0.09, 8, 5, gc, false);
  const yaw = yawOf(tx, tz);
  solid.box(v3(x + tx * 0.6, 7.9, z + tz * 0.6), 0.08, 0.08, 1.3, gc, yaw);
  lamps.box(v3(x + tx * 1.2, 7.8, z + tz * 1.2), 0.35, 0.12, 0.7, [255, 220, 160], yaw);
  solid.baseY = 0; lamps.baseY = 0;
}

export function tree(solid: MeshBuilder, x: number, z: number, seed: number, lite: boolean, ter: HeightFn) {
  const s = 0.75 + h01(seed, 7) * 0.6, gv = 130 + h01(seed, 8) * 60;
  const leaf: RGB = [gv * 0.52, gv, gv * 0.42], bark: RGB = [92, 70, 52];
  solid.baseY = ter.h(x, z) - 0.2;
  const kind = h01(seed, 9);
  if (kind < 0.18) {
    solid.cylinder(v3(x, 1.5 * s, z), v3(0, 1, 0), 0.12 * s, 3 * s, 4, bark, false);
    solid.blob(v3(x, 5.5 * s, z), 1.1 * s, 4.2 * s, 1.1 * s, lite ? 5 : 6, 3, leaf);
  } else if (kind < 0.27) {
    // coconut / palm
    solid.cylinder(v3(x, 4 * s, z), v3(0.06, 1, 0), 0.16 * s, 8 * s, 5, [120, 100, 76], false);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; solid.box(v3(x + Math.cos(a) * 1.5 * s, 8 * s, z + Math.sin(a) * 1.5 * s), 3 * s, 0.08, 0.5 * s, [70, 120, 50], -a * 180 / Math.PI); }
  } else {
    solid.cylinder(v3(x, 2 * s, z), v3(0, 1, 0), 0.22 * s, 4 * s, 5, bark, false);
    solid.blob(v3(x, 5.2 * s, z), 3.2 * s, 2.3 * s, 3.2 * s, lite ? 5 : 7, lite ? 3 : 4, leaf);
    if (!lite) solid.blob(v3(x + 1.2 * s, 6.3 * s, z - 0.6 * s), 2 * s, 1.6 * s, 2 * s, 6, 3, [leaf[0] * 0.9, leaf[1] * 0.92, leaf[2] * 0.9]);
  }
  solid.baseY = 0;
}

function viaduct(solid: MeshBuilder, pts0: V3[], ter: HeightFn) {
  const H = 12, c: RGB = [205, 202, 195], pts = subdivide(pts0, 10);
  solid.drape = ter;
  solid.ribbon(pts, 9, 0, H, c, 9);
  solid.ribbon(pts, 9, 0, H - 1.2, [160, 158, 152], 9, true);
  solid.fence(pts, 4.5, H - 1.2, H + 1, c); solid.fence(pts, -4.5, H - 1.2, H + 1, c);
  solid.ribbon(pts, 3, 2.1, H + 0.05, [110, 104, 98], 2); solid.ribbon(pts, 3, -2.1, H + 0.05, [110, 104, 98], 2);
  solid.drape = null;
  along(pts, 28, (x, z, dx, dz) => {
    const yaw = yawOf(dx, dz), b = ter.h(x, z);
    solid.baseY = b;
    solid.box(v3(x, (H - 1.2) / 2 - 1, z), 1.8, H + 0.8, 1.8, c, yaw);
    solid.box(v3(x, H - 1.6, z), 7.5, 1, 2.2, c, yaw);
    solid.baseY = 0;
  });
}

function fuelStation(solid: MeshBuilder, ctx: Ctx, x: number, z: number, name: string) {
  const [e] = ctx.graph.nearestEdge(x, z, 80);
  let yaw = 0;
  if (e >= 0) { const a = ctx.idx.edgeA[e], b = ctx.idx.edgeB[e]; yaw = yawOf(ctx.idx.nodeX[b] - ctx.idx.nodeX[a], ctx.idx.nodeZ[b] - ctx.idx.nodeZ[a]); }
  const r = yaw * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
  const P = (lx: number, ly: number, lz: number) => v3(x + lx * cs + lz * sn, ly, z - lx * sn + lz * cs);
  const white: RGB = [240, 240, 240], accent: RGB = [200 + (hash(strHash(name)) % 55), 60, 40];
  solid.baseY = ctx.ter.h(x, z);
  solid.box(v3(x, 5.4, z), 16, 0.8, 9, white, yaw);
  solid.box(v3(x, 5.0, z), 16.1, 0.25, 9.1, accent, yaw);
  for (const i of [-1, 1]) for (const j of [-1, 1]) solid.box(P(i * 5.5, 2.5, j * 2.8), 0.4, 5, 0.4, white, yaw);
  for (const i of [-1, 1]) { solid.box(P(i * 3, 0.9, 0), 0.9, 1.8, 0.6, accent, yaw); solid.box(P(i * 3, 0.15, 0), 1.6, 0.3, 3.5, [200, 200, 195], yaw); }
  solid.baseY = 0;
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
  solid.baseY = ctx.ter.h(cx, cz) + 0.2;
  solid.box(v3(cx, 0.9, cz), 1.9, 0.15, 1.0, [150, 100, 60], yaw);
  solid.box(v3(cx, 0.55, cz), 1.8, 0.6, 0.9, [80, 120, 160], yaw);
  solid.cylinder(v3(cx, 1.7, cz), v3(0, 1, 0), 0.04, 1.6, 4, [90, 90, 90], false);
  solid.cone(v3(cx, 2.3, cz), 1.4, 0.05, 0.6, 8, umb[h & 3]);
  const vx = cx + nx * 0.9, vz = cz + nz * 0.9;
  solid.box(v3(vx, 0.45, vz), 0.3, 0.9, 0.22, [60, 60, 70], yaw);
  solid.box(v3(vx, 1.2, vz), 0.42, 0.6, 0.25, umb[(h >>> 3) & 3], yaw);
  solid.blob(v3(vx, 1.65, vz), 0.12, 0.14, 0.12, 5, 3, [150, 100, 70]);
  solid.baseY = 0;
  out.push(cx, cz);
}
