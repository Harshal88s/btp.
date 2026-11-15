// Terrain height field from the SRTM-based DEM (AWS Terrain Tiles), resampled to a 12.5 m grid by
// Tools/osm_pipeline/fetch_dem.py. Heights are returned relative to the lowest point of the extract
// (so the city sits near y = 0); h() is bilinear and used by meshes AND physics so they always agree.
export interface TerrainMeta { file: string; cell: number; x0: number; z0: number; nx: number; nz: number; base: number; scale: number }

export class Terrain {
  readonly h0: Float32Array;
  constructor(readonly meta: TerrainMeta, raw: ArrayBuffer) {
    const q = new Int16Array(raw);
    this.h0 = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) this.h0[i] = q[i] * meta.scale;
  }
  /** height (m above the extract's lowest point) at data-space x (east), z (north) */
  h(x: number, z: number): number {
    const m = this.meta;
    let fx = (x - m.x0) / m.cell, fz = (z - m.z0) / m.cell;
    fx = Math.max(0, Math.min(m.nx - 1.001, fx)); fz = Math.max(0, Math.min(m.nz - 1.001, fz));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * m.nx + ix, g = this.h0;
    return (g[i] * (1 - tx) + g[i + 1] * tx) * (1 - tz) + (g[i + m.nx] * (1 - tx) + g[i + m.nx + 1] * tx) * tz;
  }
  /** absolute elevation above sea level */
  asl(x: number, z: number) { return this.h(x, z) + this.meta.base; }
  /** slope along a direction (rise per metre) */
  slope(x: number, z: number, dx: number, dz: number, d = 2) { return (this.h(x + dx * d, z + dz * d) - this.h(x - dx * d, z - dz * d)) / (2 * d); }
}

/** flat fallback when no DEM is shipped */
export class FlatTerrain extends Terrain {
  constructor() { super({ file: '', cell: 1000, x0: -1e5, z0: -1e5, nx: 2, nz: 2, base: 0, scale: 0 }, new Int16Array(4).buffer); }
  h() { return 0; }
}
