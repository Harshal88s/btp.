// Background thread: downloads chunk JSON and builds all geometry so the main thread only uploads buffers.
import { buildChunk, prepareCtx, Ctx, ChunkResult } from './chunkgen';
import { RoadGraph } from './graph';
import { Terrain, FlatTerrain } from './terrain';
import { CityIndex, GlobalData } from './types';

let ctx: Ctx | null = null;
let base = '';

function transfers(r: ChunkResult): Transferable[] {
  const t: Transferable[] = [];
  for (const k in r.groups) { const g = r.groups[k]; t.push(g.pos.buffer, g.nrm.buffer, g.col.buffer, g.uv.buffer, g.idx.buffer); }
  for (const c of r.colliders) t.push(c.pts.buffer);
  t.push(r.sidewalks.buffer, r.vendors.buffer);
  return t;
}

self.onmessage = async (ev: MessageEvent) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      base = m.base;
      const idx: CityIndex & { terrain?: any } = await (await fetch(base + 'index.json')).json();
      const gl: GlobalData = await (await fetch(base + 'global.json')).json();
      const ter = idx.terrain ? new Terrain(idx.terrain, await (await fetch(base + idx.terrain.file)).arrayBuffer()) : new FlatTerrain();
      ctx = prepareCtx(idx, new RoadGraph(idx), m.lite, ter, gl);
      (self as any).postMessage({ type: 'ready' });
    } else if (m.type === 'chunk' && ctx) {
      const data = await (await fetch(base + 'chunks/' + m.file)).json();
      const r = buildChunk(data, ctx);
      (self as any).postMessage({ type: 'chunk', key: m.key, result: r }, transfers(r));
    }
  } catch (e) {
    (self as any).postMessage({ type: 'error', key: m.key, message: String(e) });
  }
};
