// Map raster (canvas 2D) for the minimap and full map: river/parks/campuses + all OSM roads + landmarks.
import { CityIndex, GlobalData } from './types';

const AREA: Record<string, string> = { water: '#8cbee6', park: '#b0d696', grass: '#b0d696', pitch: '#b0d696', forest: '#96c480', campus: '#eee4cd', military: '#eee4cd', cemetery: '#b0d696', commercial: '#f0dcd7', industrial: '#ded8e1', railway: '#ded8e1' };

export class MapRaster {
  canvas: HTMLCanvasElement; mpp: number; size: number;
  constructor(public idx: CityIndex, gl: GlobalData, size: number, ter?: { h(x: number, z: number): number }) {
    this.size = size;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = size;
    this.mpp = Math.max(idx.maxX - idx.minX, idx.maxZ - idx.minZ) / size;
    const g = this.canvas.getContext('2d')!;
    g.fillStyle = '#e9e5dc'; g.fillRect(0, 0, size, size);
    const P = (x: number, z: number): [number, number] => [(x - idx.minX) / this.mpp, size - (z - idx.minZ) / this.mpp];
    const order = ['residential', 'commercial', 'industrial', 'campus', 'military', 'railway', 'cemetery', 'grass', 'pitch', 'park', 'forest', 'water'];
    for (const k of order) {
      g.fillStyle = AREA[k] || '#ece8e0';
      for (const a of gl.areas) if (a.kind === k) { g.beginPath(); for (let i = 0; i < a.pts.length; i += 2) { const [x, y] = P(a.pts[i], a.pts[i + 1]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fill(); }
    }
    g.strokeStyle = '#8cbee6'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const w of gl.waterLines) { g.lineWidth = Math.max(1, w.width / this.mpp); g.beginPath(); for (let i = 0; i < w.pts.length; i += 2) { const [x, y] = P(w.pts[i], w.pts[i + 1]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    if (ter) this.hillshade(g, ter);
    const bands: [number, number, string][] = [[0, 0, '#f5f0e8'], [1, 4, '#ffffff'], [5, 6, '#ffde8c'], [7, 9, '#f8b266']];
    for (const [lo, hi, col] of bands) {
      g.strokeStyle = col;
      for (const r of idx.roads) {
        if (r.tunnel || r.rank < lo || r.rank > hi) continue;
        g.lineWidth = Math.max(r.rank === 0 ? 0.6 : 1.4, r.width * 1.3 / this.mpp);
        g.beginPath();
        r.nodes.forEach((n, i) => { const [x, y] = P(idx.nodeX[n], idx.nodeZ[n]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke();
      }
    }
  }
  /** shaded relief + green tint on high ground, computed from the SRTM terrain */
  private hillshade(g: CanvasRenderingContext2D, ter: { h(x: number, z: number): number }) {
    const S = Math.floor(this.size / 2), c = document.createElement('canvas'); c.width = c.height = S;
    const cg = c.getContext('2d')!, img = cg.createImageData(S, S), mpp = this.mpp * 2, d = mpp;
    let hi = 1; for (let j = 0; j < S; j += 8) for (let i = 0; i < S; i += 8) hi = Math.max(hi, ter.h(this.idx.minX + i * mpp, this.idx.minZ + (S - j) * mpp));
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = this.idx.minX + i * mpp, z = this.idx.minZ + (S - j) * mpp, h = ter.h(x, z), k0 = (i + j * S) * 4;
      if (x > this.idx.maxX || z > this.idx.maxZ) { img.data[k0] = img.data[k0 + 1] = img.data[k0 + 2] = 255; img.data[k0 + 3] = 255; continue; }
      const dx = (ter.h(x + d, z) - ter.h(x - d, z)) / (2 * d), dz = (ter.h(x, z + d) - ter.h(x, z - d)) / (2 * d);
      // light from the north-west, 45 deg elevation
      const nx = -dx * 3, nz = -dz * 3, l = Math.hypot(nx, nz, 1), shade = Math.max(0, (-nx * 0.5 + nz * 0.5 + 0.707) / l / 1.0);
      const k = (i + j * S) * 4, f = Math.min(1, Math.max(0, (h - 25) / (hi - 25)));
      img.data[k] = 255 * (0.72 + 0.28 * shade) * (1 - f * 0.35); img.data[k + 1] = 255 * (0.72 + 0.28 * shade) * (1 - f * 0.08); img.data[k + 2] = 255 * (0.72 + 0.28 * shade) * (1 - f * 0.4); img.data[k + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(c, 0, 0, this.size, this.size); g.restore();
  }
  /** world (data space) -> canvas pixel */
  px(x: number, z: number): [number, number] { return [(x - this.idx.minX) / this.mpp, this.size - (z - this.idx.minZ) / this.mpp]; }
}
