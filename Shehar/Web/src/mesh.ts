// Procedural geometry builder - port of City/MeshBuilder.cs.
// Geometry is authored in "data space" (x = east, y = up, z = north) with Unity's clockwise front faces, exactly
// like the C# version, and converted once in finish(): z is mirrored (three.js: north = -z) and triangle winding
// reversed, which keeps faces pointing the right way (verified with the WebGL preview of the Unity build).
import { triangulate } from './triangulate';

export type RGB = [number, number, number];
export interface V3 { x: number; y: number; z: number }
export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

export interface GeoData { pos: Float32Array; nrm: Float32Array; col: Uint8Array; uv: Float32Array; idx: Uint32Array }

const rotY = (x: number, z: number, yawDeg: number): [number, number] => {
  const r = yawDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [x * c + z * s, -x * s + z * c]; // Unity Euler(0,yaw,0)
};
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz) * 180 / Math.PI;

export interface HeightFn { h(x: number, z: number): number }

export class MeshBuilder {
  p: number[] = []; c: number[] = []; uv: number[] = []; t: number[] = [];
  /** constant lift for rigid objects (e.g. a building seated on the terrain) */
  baseY = 0;
  /** when set, every vertex is lifted by the terrain height at its own x/z (roads, markings, rails) */
  drape: HeightFn | null = null;
  get vertexCount() { return this.p.length / 3; }
  get empty() { return this.t.length === 0; }

  vert(x: number, y: number, z: number, col: RGB, u = 0, v = 0) {
    y += this.baseY + (this.drape ? this.drape.h(x, z) : 0);
    this.p.push(x, y, z); this.c.push(col[0], col[1], col[2]); this.uv.push(u, v);
    return this.p.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) { this.t.push(a, b, c); }

  quad(a: V3, b: V3, c: V3, d: V3, col: RGB, uvs?: number[]) {
    const u = uvs || [0, 0, 0, 1, 1, 1, 1, 0];
    const i = this.vert(a.x, a.y, a.z, col, u[0], u[1]); this.vert(b.x, b.y, b.z, col, u[2], u[3]);
    this.vert(c.x, c.y, c.z, col, u[4], u[5]); this.vert(d.x, d.y, d.z, col, u[6], u[7]);
    this.tri(i, i + 1, i + 2); this.tri(i, i + 2, i + 3);
  }

  /** Tapered box (base centre, bottom & top sizes x/z, height, top shift along local z), rotated by yaw. */
  frustum(base: V3, bx: number, bz: number, tx: number, tz: number, h: number, shiftZ: number, col: RGB, yaw = 0) {
    const P = (x: number, y: number, z: number): V3 => { const [rx, rz] = rotY(x, z, yaw); return v3(base.x + rx, base.y + y, base.z + rz); };
    bx /= 2; bz /= 2; tx /= 2; tz /= 2;
    const b0 = P(-bx, 0, -bz), b1 = P(bx, 0, -bz), b2 = P(bx, 0, bz), b3 = P(-bx, 0, bz);
    const t0 = P(-tx, h, -tz + shiftZ), t1 = P(tx, h, -tz + shiftZ), t2 = P(tx, h, tz + shiftZ), t3 = P(-tx, h, tz + shiftZ);
    this.quad(t0, t3, t2, t1, col); this.quad(b0, b1, b2, b3, col);
    this.quad(b0, t0, t1, b1, col); this.quad(b2, t2, t3, b3, col);
    this.quad(b3, t3, t0, b0, col); this.quad(b1, t1, t2, b2, col);
  }

  box(center: V3, sx: number, sy: number, sz: number, col: RGB, yaw = 0) {
    this.frustum(v3(center.x, center.y - sy / 2, center.z), sx, sz, sx, sz, sy, 0, col, yaw);
  }

  cylinder(center: V3, axis: V3, r: number, len: number, seg: number, col: RGB, caps = true) {
    const al = Math.hypot(axis.x, axis.y, axis.z); const A = v3(axis.x / al, axis.y / al, axis.z / al);
    const ref = Math.abs(A.y) > 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
    let u = crossV(A, ref); u = norm(u); const w = crossV(A, u);
    const a = v3(center.x - A.x * len / 2, center.y - A.y * len / 2, center.z - A.z * len / 2);
    const b = v3(center.x + A.x * len / 2, center.y + A.y * len / 2, center.z + A.z * len / 2);
    for (let i = 0; i < seg; i++) {
      const a0 = i * Math.PI * 2 / seg, a1 = (i + 1) * Math.PI * 2 / seg;
      const d0 = v3((u.x * Math.cos(a0) + w.x * Math.sin(a0)) * r, (u.y * Math.cos(a0) + w.y * Math.sin(a0)) * r, (u.z * Math.cos(a0) + w.z * Math.sin(a0)) * r);
      const d1 = v3((u.x * Math.cos(a1) + w.x * Math.sin(a1)) * r, (u.y * Math.cos(a1) + w.y * Math.sin(a1)) * r, (u.z * Math.cos(a1) + w.z * Math.sin(a1)) * r);
      this.quad(add(a, d1), add(b, d1), add(b, d0), add(a, d0), col);
      if (caps) {
        let c0 = this.vert(a.x, a.y, a.z, col); this.vert(a.x + d1.x, a.y + d1.y, a.z + d1.z, col); this.vert(a.x + d0.x, a.y + d0.y, a.z + d0.z, col);
        this.tri(c0, c0 + 1, c0 + 2);
        c0 = this.vert(b.x, b.y, b.z, col); this.vert(b.x + d0.x, b.y + d0.y, b.z + d0.z, col); this.vert(b.x + d1.x, b.y + d1.y, b.z + d1.z, col);
        this.tri(c0, c0 + 1, c0 + 2);
      }
    }
  }

  cone(base: V3, r0: number, r1: number, h: number, seg: number, col: RGB) {
    const top = v3(base.x, base.y + h, base.z);
    for (let i = 0; i < seg; i++) {
      const a0 = i * Math.PI * 2 / seg, a1 = (i + 1) * Math.PI * 2 / seg;
      const d0 = v3(Math.cos(a0), 0, Math.sin(a0)), d1 = v3(Math.cos(a1), 0, Math.sin(a1));
      this.quad(add(base, scl(d0, r0)), add(top, scl(d0, r1)), add(top, scl(d1, r1)), add(base, scl(d1, r0)), col);
    }
  }

  blob(c: V3, rx: number, ry: number, rz: number, seg: number, rings: number, col: RGB) {
    const start = this.vertexCount;
    for (let r = 0; r <= rings; r++) {
      const phi = Math.PI * r / rings;
      for (let s = 0; s <= seg; s++) {
        const th = 2 * Math.PI * s / seg;
        this.vert(c.x + Math.sin(phi) * Math.cos(th) * rx, c.y + Math.cos(phi) * ry, c.z + Math.sin(phi) * Math.sin(th) * rz, col);
      }
    }
    for (let r = 0; r < rings; r++)
      for (let s = 0; s < seg; s++) {
        const a = start + r * (seg + 1) + s, b = a + seg + 1;
        this.tri(a, a + 1, b + 1); this.tri(a, b + 1, b);
      }
  }

  polygonTop(pts: ArrayLike<number>, y: number, col: RGB, uvScale = 0.1, down = false) {
    const tris: number[] = [];
    triangulate(pts, tris);
    if (!tris.length) return;
    const n = pts.length / 2, s = this.vertexCount;
    for (let i = 0; i < n; i++) this.vert(pts[2 * i], y, pts[2 * i + 1], col, pts[2 * i] * uvScale, pts[2 * i + 1] * uvScale);
    for (let i = 0; i < tris.length; i += 3)
      if (down) this.tri(s + tris[i], s + tris[i + 1], s + tris[i + 2]); else this.tri(s + tris[i], s + tris[i + 2], s + tris[i + 1]);
  }

  /** Outward walls of a CCW footprint; uv = (bays, floors) for a tiling facade texture. */
  walls(pts: ArrayLike<number>, y0: number, y1: number, col: RGB, bay = 3.4, floorH = 3.2) {
    const n = pts.length / 2; let run = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = pts[2 * i], az = pts[2 * i + 1], bx = pts[2 * j], bz = pts[2 * j + 1];
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.01) continue;
      const u0 = Math.round(run / bay), u1 = u0 + Math.max(1, Math.round(len / bay)); run += len;
      const v0 = y0 / floorH, v1 = y1 / floorH;
      this.quad(v3(ax, y0, az), v3(ax, y1, az), v3(bx, y1, bz), v3(bx, y0, bz), col, [u0, v0, u0, v1, u1, v1, u1, v0]);
    }
  }

  ribbon(line: V3[], width: number, offset: number, y: number, col: RGB, vScale: number, flip = false) {
    const n = line.length; if (n < 2) return;
    let v = 0, pl = -1, pr = -1;
    for (let i = 0; i < n; i++) {
      let ix = i > 0 ? line[i].x - line[i - 1].x : line[1].x - line[0].x, iz = i > 0 ? line[i].z - line[i - 1].z : line[1].z - line[0].z;
      let ox = i < n - 1 ? line[i + 1].x - line[i].x : ix, oz = i < n - 1 ? line[i + 1].z - line[i].z : iz;
      let l = Math.hypot(ix, iz) || 1; ix /= l; iz /= l; l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
      const nix = -iz, niz = ix, nox = -oz, noz = ox;
      let mx = nix + nox, mz = niz + noz; const ml = Math.hypot(mx, mz);
      if (ml < 1e-4) { mx = nox; mz = noz; } else { mx /= ml; mz /= ml; }
      const sc = Math.min(2.5, 1 / Math.max(0.35, mx * nox + mz * noz));
      if (i > 0) v += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z) / vScale;
      const cx = line[i].x + mx * offset * sc, cz = line[i].z + mz * offset * sc, cy = y + line[i].y;
      const li = this.vert(cx + mx * width / 2 * sc, cy, cz + mz * width / 2 * sc, col, 0, v);
      const ri = this.vert(cx - mx * width / 2 * sc, cy, cz - mz * width / 2 * sc, col, 1, v);
      if (pl >= 0) { if (flip) { this.tri(pl, ri, li); this.tri(pl, pr, ri); } else { this.tri(pl, li, ri); this.tri(pl, ri, pr); } }
      pl = li; pr = ri;
    }
  }

  fence(line: V3[], offset: number, y0: number, y1: number, col: RGB) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1]; const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const nx = -dz / len * offset, nz = dx / len * offset;
      const A0 = v3(a.x + nx, a.y + y0, a.z + nz), A1 = v3(a.x + nx, a.y + y1, a.z + nz), B0 = v3(b.x + nx, b.y + y0, b.z + nz), B1 = v3(b.x + nx, b.y + y1, b.z + nz);
      this.quad(A0, A1, B1, B0, col); this.quad(B0, B1, A1, A0, col);
    }
  }

  disc(c: V3, r: number, seg: number, col: RGB) {
    const ci = this.vert(c.x, c.y, c.z, col);
    let first = -1, prev = -1;
    for (let i = 0; i <= seg; i++) {
      const a = -i * Math.PI * 2 / seg;
      const k = i === seg ? first : this.vert(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r, col);
      if (i === 0) first = k;
      if (prev >= 0) this.tri(ci, prev, k);
      prev = k;
    }
  }

  /** Convert to three.js space (mirror z, reverse winding) with smooth-ish per-vertex normals. */
  finish(): GeoData {
    const nv = this.p.length / 3;
    const pos = new Float32Array(this.p.length);
    for (let i = 0; i < nv; i++) { pos[3 * i] = this.p[3 * i]; pos[3 * i + 1] = this.p[3 * i + 1]; pos[3 * i + 2] = -this.p[3 * i + 2]; }
    const idx = new Uint32Array(this.t.length);
    for (let i = 0; i < this.t.length; i += 3) { idx[i] = this.t[i]; idx[i + 1] = this.t[i + 2]; idx[i + 2] = this.t[i + 1]; }
    const nrm = new Float32Array(this.p.length);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
      const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const k of [a, b, c]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
    }
    for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
    return { pos, nrm, col: Uint8Array.from(this.c), uv: Float32Array.from(this.uv), idx };
  }
}

const add = (a: V3, b: V3) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const scl = (a: V3, s: number) => v3(a.x * s, a.y * s, a.z * s);
const crossV = (a: V3, b: V3) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a: V3) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return v3(a.x / l, a.y / l, a.z / l); };
