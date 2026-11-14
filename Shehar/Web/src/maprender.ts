// Map raster (canvas 2D) for the minimap and full map: river/parks/campuses + all OSM roads + landmarks.
import { CityIndex, GlobalData } from './types';

const AREA: Record<string, string> = { water: '#8cbee6', park: '#b0d696', grass: '#b0d696', pitch: '#b0d696', forest: '#96c480', campus: '#eee4cd', military: '#eee4cd', cemetery: '#b0d696', commercial: '#f0dcd7', industrial: '#ded8e1', railway: '#ded8e1' };

export class MapRaster {
  canvas: HTMLCanvasElement; mpp: number; size: number;
  constructor(public idx: CityIndex, gl: GlobalData, size: number) {
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
  /** world (data space) -> canvas pixel */
  px(x: number, z: number): [number, number] { return [(x - this.idx.minX) / this.mpp, this.size - (z - this.idx.minZ) / this.mpp]; }
}
