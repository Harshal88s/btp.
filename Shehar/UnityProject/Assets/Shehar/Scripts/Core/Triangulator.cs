// Ear-clipping triangulation for simple polygons (building roofs, parks, water bodies).
// Input: flat array of x,z pairs with counter-clockwise winding (positive signed area), no repeated closing vertex.
// Output: indices of counter-clockwise triangles (callers flip them for Unity's clockwise front faces).
using System;
using System.Collections.Generic;

namespace Shehar.Core
{
    public static class Triangulator
    {
        public static float SignedArea(float[] p)
        {
            int n = p.Length / 2; double a = 0;
            for (int i = 0; i < n; i++)
            {
                int j = (i + 1) % n;
                a += (double)p[2 * i] * p[2 * j + 1] - (double)p[2 * j] * p[2 * i + 1];
            }
            return (float)(a * 0.5);
        }

        /// <summary>Triangulates; returns false only when the fallback fan had to be used for part of the polygon.</summary>
        public static bool Triangulate(float[] p, List<int> outTris)
        {
            int n = p.Length / 2;
            if (n < 3) return false;
            var idx = new List<int>(n);
            if (SignedArea(p) >= 0) for (int i = 0; i < n; i++) idx.Add(i);
            else for (int i = n - 1; i >= 0; i--) idx.Add(i);

            bool clean = true;
            int k = 0, fails = 0;
            while (idx.Count > 3)
            {
                int m = idx.Count;
                if (k >= m) k = 0;
                int a = idx[(k + m - 1) % m], b = idx[k], c = idx[(k + 1) % m];
                if (IsEar(p, idx, a, b, c))
                {
                    outTris.Add(a); outTris.Add(b); outTris.Add(c);
                    idx.RemoveAt(k);
                    fails = 0;
                    if (k > 0) k--;
                    continue;
                }
                k++;
                if (++fails >= m)
                {
                    // self-intersecting or numerically degenerate: drop the most degenerate vertex as a fan triangle
                    clean = false; fails = 0;
                    int best = 0; float bestCr = float.MaxValue;
                    for (int q = 0; q < m; q++)
                    {
                        float cr = Math.Abs(Cross(p, idx[(q + m - 1) % m], idx[q], idx[(q + 1) % m]));
                        if (cr < bestCr) { bestCr = cr; best = q; }
                    }
                    a = idx[(best + m - 1) % m]; b = idx[best]; c = idx[(best + 1) % m];
                    if (Cross(p, a, b, c) > 0) { outTris.Add(a); outTris.Add(b); outTris.Add(c); }
                    idx.RemoveAt(best);
                    k = best;
                }
            }
            if (idx.Count == 3 && Cross(p, idx[0], idx[1], idx[2]) > 0)
            {
                outTris.Add(idx[0]); outTris.Add(idx[1]); outTris.Add(idx[2]);
            }
            return clean;
        }

        static bool IsEar(float[] p, List<int> idx, int a, int b, int c)
        {
            if (Cross(p, a, b, c) <= 1e-7f) return false; // reflex or degenerate corner
            for (int q = 0; q < idx.Count; q++)
            {
                int v = idx[q];
                if (v == a || v == b || v == c) continue;
                if (InTriangle(p, v, a, b, c)) return false;
            }
            return true;
        }

        static float Cross(float[] p, int a, int b, int c)
        {
            float ax = p[2 * a], az = p[2 * a + 1];
            return (p[2 * b] - ax) * (p[2 * c + 1] - az) - (p[2 * b + 1] - az) * (p[2 * c] - ax);
        }

        static bool InTriangle(float[] p, int v, int a, int b, int c)
        {
            float px = p[2 * v], pz = p[2 * v + 1];
            float d1 = Sign(px, pz, p[2 * a], p[2 * a + 1], p[2 * b], p[2 * b + 1]);
            float d2 = Sign(px, pz, p[2 * b], p[2 * b + 1], p[2 * c], p[2 * c + 1]);
            float d3 = Sign(px, pz, p[2 * c], p[2 * c + 1], p[2 * a], p[2 * a + 1]);
            bool neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
            return !(neg && pos);
        }

        static float Sign(float px, float pz, float ax, float az, float bx, float bz)
        {
            return (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
        }

        public static bool PointInPolygon(float[] p, float x, float z)
        {
            int n = p.Length / 2; bool inside = false;
            for (int i = 0, j = n - 1; i < n; j = i++)
            {
                float xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
                if ((zi > z) != (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi + 1e-12f) + xi) inside = !inside;
            }
            return inside;
        }
    }
}
