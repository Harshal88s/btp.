// Ear clipping (port of Core/Triangulator.cs). pts = flat x,z pairs. Returns CCW triangles.
export function signedArea(p: ArrayLike<number>): number {
  const n = p.length / 2; let a = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; }
  return a / 2;
}
const cross = (p: ArrayLike<number>, a: number, b: number, c: number) => {
  const ax = p[2 * a], az = p[2 * a + 1];
  return (p[2 * b] - ax) * (p[2 * c + 1] - az) - (p[2 * b + 1] - az) * (p[2 * c] - ax);
};
const sgn = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
function inTri(p: ArrayLike<number>, v: number, a: number, b: number, c: number) {
  const px = p[2 * v], pz = p[2 * v + 1];
  const d1 = sgn(px, pz, p[2 * a], p[2 * a + 1], p[2 * b], p[2 * b + 1]);
  const d2 = sgn(px, pz, p[2 * b], p[2 * b + 1], p[2 * c], p[2 * c + 1]);
  const d3 = sgn(px, pz, p[2 * c], p[2 * c + 1], p[2 * a], p[2 * a + 1]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
export function triangulate(p: ArrayLike<number>, out: number[]): void {
  const n = p.length / 2; if (n < 3) return;
  const idx: number[] = [];
  if (signedArea(p) >= 0) for (let i = 0; i < n; i++) idx.push(i); else for (let i = n - 1; i >= 0; i--) idx.push(i);
  let k = 0, fails = 0;
  while (idx.length > 3) {
    const m = idx.length; if (k >= m) k = 0;
    const a = idx[(k + m - 1) % m], b = idx[k], c = idx[(k + 1) % m];
    let ear = cross(p, a, b, c) > 1e-7;
    if (ear) for (const v of idx) { if (v === a || v === b || v === c) continue; if (inTri(p, v, a, b, c)) { ear = false; break; } }
    if (ear) { out.push(a, b, c); idx.splice(k, 1); fails = 0; if (k > 0) k--; continue; }
    k++;
    if (++fails >= m) {
      fails = 0; let best = 0, bc = Infinity;
      for (let q = 0; q < m; q++) { const cr = Math.abs(cross(p, idx[(q + m - 1) % m], idx[q], idx[(q + 1) % m])); if (cr < bc) { bc = cr; best = q; } }
      const A = idx[(best + m - 1) % m], B = idx[best], C = idx[(best + 1) % m];
      if (cross(p, A, B, C) > 0) out.push(A, B, C);
      idx.splice(best, 1); k = best;
    }
  }
  if (idx.length === 3 && cross(p, idx[0], idx[1], idx[2]) > 0) out.push(idx[0], idx[1], idx[2]);
}
export function pointInPoly(p: ArrayLike<number>, x: number, z: number): boolean {
  const n = p.length / 2; let ins = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}
