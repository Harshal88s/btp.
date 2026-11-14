// Background thread: downloads chunk JSON and builds all geometry so the main thread only uploads buffers.
import { buildChunk, prepareCtx, addArea, Ctx, ChunkResult } from './chunkgen';
import { RoadGraph } from './graph';
import { MeshBuilder } from './mesh';
import { CityIndex, GlobalData } from './types';

let ctx: Ctx | null = null;
let base = '';

function transfers(r: ChunkResult): Transferable[] {
  const t: Transferable[] = [];
  for (const g of [r.facade, r.solid, r.markings, r.lamps]) if (g) t.push(g.pos.buffer, g.nrm.buffer, g.col.buffer, g.uv.buffer, g.idx.buffer);
  for (const c of r.colliders) t.push(c.pts.buffer);
  t.push(r.sidewalks.buffer, r.vendors.buffer);
  return t;
}

self.onmessage = async (ev: MessageEvent) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      base = m.base;
      const idx: CityIndex = await (await fetch(base + 'index.json')).json();
      ctx = prepareCtx(idx, new RoadGraph(idx), m.lite);
      const gl: GlobalData = await (await fetch(base + 'global.json')).json();
      const mb = new MeshBuilder();
      for (const a of gl.areas) addArea(mb, a);
      for (const w of gl.waterLines) {
        const l = []; for (let i = 0; i + 1 < w.pts.length; i += 2) l.push({ x: w.pts[i], y: 0, z: w.pts[i + 1] });
        mb.ribbon(l, w.width, 0, 0.037, [64, 104, 116], 20);
      }
      const g = mb.finish();
      (self as any).postMessage({ type: 'ready', global: g }, [g.pos.buffer, g.nrm.buffer, g.col.buffer, g.uv.buffer, g.idx.buffer]);
    } else if (m.type === 'chunk' && ctx) {
      const data = await (await fetch(base + 'chunks/' + m.file)).json();
      const r = buildChunk(data, ctx);
      (self as any).postMessage({ type: 'chunk', key: m.key, result: r }, transfers(r));
    }
  } catch (e) {
    (self as any).postMessage({ type: 'error', key: m.key, message: String(e) });
  }
};
