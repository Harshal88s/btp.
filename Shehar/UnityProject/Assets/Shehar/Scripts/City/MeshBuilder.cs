// Accumulates procedural geometry (vertices, uvs, colours, triangles) and turns it into a Unity Mesh.
// Building the vertex lists only uses value types and pure maths, so it is safe on worker threads;
// only ToMesh() must run on the main thread.
using System.Collections.Generic;
using Shehar.Core;
using UnityEngine;
#if !SHEHAR_HEADLESS
using UnityEngine.Rendering;
#endif

namespace Shehar.City
{
    public sealed class MeshBuilder
    {
        public readonly List<Vector3> V = new List<Vector3>(1024);
        public readonly List<Vector2> UV = new List<Vector2>(1024);
        public readonly List<Color32> C = new List<Color32>(1024);
        public readonly List<int> T = new List<int>(2048);
        readonly List<int> tmp = new List<int>(256);

        // Optional transform applied to every added vertex (used when composing vehicles / props).
        public Vector3 Offset = Vector3.zero;
        public Quaternion Rotation = Quaternion.identity;
        public float Scale = 1f;

        public int VertexCount { get { return V.Count; } }
        public bool IsEmpty { get { return T.Count == 0; } }

        public void ResetTransform() { Offset = Vector3.zero; Rotation = Quaternion.identity; Scale = 1f; }

        Vector3 X(Vector3 p) { return Offset + Rotation * (p * Scale); }

        public int AddVertex(Vector3 p, Vector2 uv, Color32 c)
        {
            V.Add(X(p)); UV.Add(uv); C.Add(c);
            return V.Count - 1;
        }

        public void Tri(int a, int b, int c) { T.Add(a); T.Add(b); T.Add(c); }

        /// <summary>Quad with vertices given clockwise as seen from the front (Unity front-face convention).</summary>
        public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color32 col, Vector2 uva, Vector2 uvb, Vector2 uvc, Vector2 uvd)
        {
            int i = AddVertex(a, uva, col); AddVertex(b, uvb, col); AddVertex(c, uvc, col); AddVertex(d, uvd, col);
            Tri(i, i + 1, i + 2); Tri(i, i + 2, i + 3);
        }

        public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color32 col)
        {
            Quad(a, b, c, d, col, new Vector2(0, 0), new Vector2(0, 1), new Vector2(1, 1), new Vector2(1, 0));
        }

        /// <summary>Axis-aligned (in builder space) box with hard edges.</summary>
        public void Box(Vector3 center, Vector3 size, Color32 col, Quaternion? rot = null)
        {
            Frustum(center - new Vector3(0, size.y / 2, 0), new Vector2(size.x, size.z), new Vector2(size.x, size.z), size.y, 0, col, rot);
        }

        /// <summary>
        /// Tapered box: bottom rectangle at baseCenter, top rectangle (topSize) raised by height and shifted
        /// forward (+z) by topShiftZ. Used for car cabins, bus fronts, temple shikharas.
        /// </summary>
        public void Frustum(Vector3 baseCenter, Vector2 bottom, Vector2 top, float height, float topShiftZ, Color32 col, Quaternion? rot = null)
        {
            Quaternion r = rot ?? Quaternion.identity;
            float bx = bottom.x / 2, bz = bottom.y / 2, tx = top.x / 2, tz = top.y / 2;
            Vector3 P(float x, float y, float z) { return baseCenter + r * new Vector3(x, y, z); }
            Vector3 b0 = P(-bx, 0, -bz), b1 = P(bx, 0, -bz), b2 = P(bx, 0, bz), b3 = P(-bx, 0, bz);
            Vector3 t0 = P(-tx, height, -tz + topShiftZ), t1 = P(tx, height, -tz + topShiftZ), t2 = P(tx, height, tz + topShiftZ), t3 = P(-tx, height, tz + topShiftZ);
            Quad(t0, t3, t2, t1, col);          // top
            Quad(b0, b1, b2, b3, col);          // bottom
            Quad(b0, t0, t1, b1, col);          // back (-z)
            Quad(b2, t2, t3, b3, col);          // front (+z)
            Quad(b3, t3, t0, b0, col);          // left (-x)
            Quad(b1, t1, t2, b2, col);          // right (+x)
        }

        /// <summary>Cylinder along an axis through center. Caps included.</summary>
        public void Cylinder(Vector3 center, Vector3 axis, float radius, float length, int seg, Color32 col, bool caps = true)
        {
            axis.Normalize();
            Vector3 u = Vector3.Cross(axis, Mathf.Abs(axis.y) > 0.9f ? Vector3.right : Vector3.up).normalized;
            Vector3 w = Vector3.Cross(axis, u);
            Vector3 a = center - axis * (length / 2), b = center + axis * (length / 2);
            for (int i = 0; i < seg; i++)
            {
                float a0 = i * Mathf.PI * 2 / seg, a1 = (i + 1) * Mathf.PI * 2 / seg;
                Vector3 d0 = (u * Mathf.Cos(a0) + w * Mathf.Sin(a0)) * radius, d1 = (u * Mathf.Cos(a1) + w * Mathf.Sin(a1)) * radius;
                Quad(a + d1, b + d1, b + d0, a + d0, col, new Vector2((i + 1) / (float)seg, 0), new Vector2((i + 1) / (float)seg, 1), new Vector2(i / (float)seg, 1), new Vector2(i / (float)seg, 0));
                if (caps)
                {
                    int c0 = AddVertex(a, new Vector2(0.5f, 0.5f), col), c1 = AddVertex(a + d1, Vector2.zero, col), c2 = AddVertex(a + d0, Vector2.zero, col);
                    Tri(c0, c1, c2);
                    int e0 = AddVertex(b, new Vector2(0.5f, 0.5f), col), e1 = AddVertex(b + d0, Vector2.zero, col), e2 = AddVertex(b + d1, Vector2.zero, col);
                    Tri(e0, e1, e2);
                }
            }
        }

        /// <summary>Cone / tapered cylinder pointing up (+y) - used for trees, temple tops, traffic cones.</summary>
        public void Cone(Vector3 baseCenter, float r0, float r1, float height, int seg, Color32 col)
        {
            Vector3 top = baseCenter + Vector3.up * height;
            for (int i = 0; i < seg; i++)
            {
                float a0 = i * Mathf.PI * 2 / seg, a1 = (i + 1) * Mathf.PI * 2 / seg;
                Vector3 d0 = new Vector3(Mathf.Cos(a0), 0, Mathf.Sin(a0)), d1 = new Vector3(Mathf.Cos(a1), 0, Mathf.Sin(a1));
                Quad(baseCenter + d0 * r0, top + d0 * r1, top + d1 * r1, baseCenter + d1 * r0, col);
                if (r1 > 0.001f)
                {
                    int c = AddVertex(top, Vector2.zero, col), p = AddVertex(top + d1 * r1, Vector2.zero, col), q = AddVertex(top + d0 * r1, Vector2.zero, col);
                    Tri(c, p, q);
                }
            }
        }

        /// <summary>Low-poly ellipsoid (tree canopies, heads, domes).</summary>
        public void Blob(Vector3 center, Vector3 radii, int seg, int rings, Color32 col)
        {
            int start = V.Count;
            for (int r = 0; r <= rings; r++)
            {
                float phi = Mathf.PI * r / rings;
                for (int s = 0; s <= seg; s++)
                {
                    float th = 2 * Mathf.PI * s / seg;
                    Vector3 p = new Vector3(Mathf.Sin(phi) * Mathf.Cos(th) * radii.x, Mathf.Cos(phi) * radii.y, Mathf.Sin(phi) * Mathf.Sin(th) * radii.z);
                    AddVertex(center + p, new Vector2(s / (float)seg, r / (float)rings), col);
                }
            }
            for (int r = 0; r < rings; r++)
                for (int s = 0; s < seg; s++)
                {
                    int a = start + r * (seg + 1) + s, b = a + seg + 1;
                    Tri(a, a + 1, b + 1); Tri(a, b + 1, b);
                }
        }

        /// <summary>Flat, upward-facing polygon at height y (pts = x,z pairs). uvScale > 0 maps world xz to uv.</summary>
        public bool PolygonTop(float[] pts, float y, Color32 col, float uvScale = 0.1f, bool facingDown = false)
        {
            tmp.Clear();
            Triangulator.Triangulate(pts, tmp);
            if (tmp.Count == 0) return false;
            int n = pts.Length / 2, start = V.Count;
            for (int i = 0; i < n; i++)
                AddVertex(new Vector3(pts[2 * i], y, pts[2 * i + 1]), new Vector2(pts[2 * i] * uvScale, pts[2 * i + 1] * uvScale), col);
            for (int i = 0; i < tmp.Count; i += 3)
            {
                if (facingDown) Tri(start + tmp[i], start + tmp[i + 1], start + tmp[i + 2]);
                else Tri(start + tmp[i], start + tmp[i + 2], start + tmp[i + 1]); // CCW -> Unity CW (faces up)
            }
            return true;
        }

        /// <summary>
        /// Vertical walls along a counter-clockwise footprint from y0 to y1, facing outwards.
        /// UV: u = metres along perimeter / bay, v = metres up / floor, so a facade texture tile = one window bay x one floor.
        /// </summary>
        public void Walls(float[] pts, float y0, float y1, Color32 col, float bay = 3.4f, float floorH = 3.2f)
        {
            int n = pts.Length / 2;
            float run = 0;
            for (int i = 0; i < n; i++)
            {
                int j = (i + 1) % n;
                Vector3 a = new Vector3(pts[2 * i], 0, pts[2 * i + 1]), b = new Vector3(pts[2 * j], 0, pts[2 * j + 1]);
                float len = Vector3.Distance(a, b);
                if (len < 0.01f) continue;
                // snap the bay count so windows don't get cut at corners
                float u0 = Mathf.Round(run / bay), u1 = u0 + Mathf.Max(1, Mathf.Round(len / bay));
                run += len;
                float v0 = y0 / floorH, v1 = y1 / floorH;
                // CCW footprint seen from above -> outward side is to the right of a->b
                Quad(new Vector3(a.x, y0, a.z), new Vector3(a.x, y1, a.z), new Vector3(b.x, y1, b.z), new Vector3(b.x, y0, b.z), col,
                     new Vector2(u0, v0), new Vector2(u0, v1), new Vector2(u1, v1), new Vector2(u1, v0));
            }
        }

        /// <summary>
        /// Ribbon along a polyline (roads, rails, rivers). offset shifts the ribbon sideways (left positive).
        /// UV: u across (0..1), v = metres along / vScale.
        /// </summary>
        public void Ribbon(IList<Vector3> line, float width, float offset, float y, Color32 col, float vScale, float startV = 0, bool flip = false)
        {
            int n = line.Count;
            if (n < 2) return;
            float v = startV;
            int prevL = -1, prevR = -1;
            for (int i = 0; i < n; i++)
            {
                Vector3 dirIn = i > 0 ? (line[i] - line[i - 1]) : (line[1] - line[0]);
                Vector3 dirOut = i < n - 1 ? (line[i + 1] - line[i]) : dirIn;
                dirIn.y = 0; dirOut.y = 0;
                dirIn.Normalize(); dirOut.Normalize();
                Vector3 nIn = new Vector3(-dirIn.z, 0, dirIn.x), nOut = new Vector3(-dirOut.z, 0, dirOut.x);
                Vector3 miter = (nIn + nOut);
                float ml = miter.magnitude;
                miter = ml < 1e-4f ? nOut : miter / ml;
                float scale = 1f / Mathf.Max(0.35f, Vector3.Dot(miter, nOut)); // limit spikes at sharp corners
                scale = Mathf.Min(scale, 2.5f);
                if (i > 0) v += Vector3.Distance(line[i], line[i - 1]) / vScale;
                Vector3 c = new Vector3(line[i].x, y + line[i].y, line[i].z) + miter * offset * scale;
                Vector3 l = c + miter * (width / 2) * scale, r = c - miter * (width / 2) * scale;
                int li = AddVertex(l, new Vector2(0, v), col), ri = AddVertex(r, new Vector2(1, v), col);
                if (prevL >= 0)
                {
                    if (flip) { Tri(prevL, ri, li); Tri(prevL, prevR, ri); }
                    else { Tri(prevL, li, ri); Tri(prevL, ri, prevR); }
                }
                prevL = li; prevR = ri;
            }
        }

        /// <summary>Vertical double-sided wall following a polyline at a sideways offset (bridge parapets, fences, viaduct edges).</summary>
        public void Fence(IList<Vector3> line, float offset, float y0, float y1, Color32 col, float uScale = 2f)
        {
            float u = 0;
            for (int i = 0; i < line.Count - 1; i++)
            {
                Vector3 a = line[i], b = line[i + 1];
                Vector3 d = b - a; d.y = 0;
                float len = d.magnitude;
                if (len < 0.01f) continue;
                Vector3 n = new Vector3(-d.z, 0, d.x) / len * offset;
                Vector3 a0 = a + n, b0 = b + n;
                float u1 = u + len / uScale;
                Vector3 A0 = new Vector3(a0.x, a.y + y0, a0.z), A1 = new Vector3(a0.x, a.y + y1, a0.z);
                Vector3 B0 = new Vector3(b0.x, b.y + y0, b0.z), B1 = new Vector3(b0.x, b.y + y1, b0.z);
                Quad(A0, A1, B1, B0, col, new Vector2(u, 0), new Vector2(u, 1), new Vector2(u1, 1), new Vector2(u1, 0));
                Quad(B0, B1, A1, A0, col, new Vector2(u1, 0), new Vector2(u1, 1), new Vector2(u, 1), new Vector2(u, 0));
                u = u1;
            }
        }

        /// <summary>Flat disc (junction fill, roundabouts, manholes).</summary>
        public void Disc(Vector3 center, float radius, int seg, Color32 col, float uvScale = 0.1f)
        {
            int c = AddVertex(center, new Vector2(center.x * uvScale, center.z * uvScale), col);
            int first = -1, prev = -1;
            for (int i = 0; i <= seg; i++)
            {
                float a = -i * Mathf.PI * 2 / seg;
                Vector3 p = center + new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a)) * radius;
                int k = i == seg ? first : AddVertex(p, new Vector2(p.x * uvScale, p.z * uvScale), col);
                if (i == 0) first = k;
                if (prev >= 0) Tri(c, prev, k);
                prev = k;
            }
        }

        public void Append(MeshBuilder other)
        {
            int baseIndex = V.Count;
            for (int i = 0; i < other.V.Count; i++) { V.Add(X(other.V[i])); UV.Add(other.UV[i]); C.Add(other.C[i]); }
            for (int i = 0; i < other.T.Count; i++) T.Add(other.T[i] + baseIndex);
        }

#if !SHEHAR_HEADLESS
        public Mesh ToMesh(string name = "mesh")
        {
            var m = new Mesh { name = name };
            if (V.Count > 65000) m.indexFormat = IndexFormat.UInt32;
            m.SetVertices(V);
            m.SetUVs(0, UV);
            m.SetColors(C);
            m.SetTriangles(T, 0);
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }
#endif

        public void Clear() { V.Clear(); UV.Clear(); C.Clear(); T.Clear(); ResetTransform(); }
    }
}
