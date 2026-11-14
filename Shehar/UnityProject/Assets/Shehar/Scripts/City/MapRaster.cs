// Rasterises the whole OSM extract (areas, water, buildings, roads, rails) into a texture used by the minimap
// and the full-screen map. Runs on a worker thread at load time; reads every chunk file once.
using System;
using System.Collections.Generic;
using System.IO;
using Shehar.Core;
using UnityEngine;

namespace Shehar.City
{
    public sealed class MapRaster
    {
        public int Size;
        public float MetersPerPixel;
        public Color32[] Pixels;
        float minX, minZ;

        static readonly Color32 Bg = new Color32(233, 229, 220, 255), Water = new Color32(140, 190, 230, 255),
            Park = new Color32(176, 214, 150, 255), Forest = new Color32(150, 196, 128, 255), Campus = new Color32(238, 228, 205, 255),
            Building = new Color32(214, 207, 196, 255), BuildingEdge = new Color32(196, 187, 174, 255),
            Minor = new Color32(255, 255, 255, 255), Major = new Color32(255, 222, 140, 255), Trunk = new Color32(248, 178, 102, 255),
            Rail = new Color32(130, 120, 140, 255), Metro = new Color32(150, 100, 200, 255), Foot = new Color32(245, 240, 232, 255);

        public static MapRaster Build(CityContext ctx, GlobalData gl, int size)
        {
            var idx = ctx.Index;
            var r = new MapRaster { Size = size, minX = idx.minX, minZ = idx.minZ };
            r.MetersPerPixel = Mathf.Max(idx.maxX - idx.minX, idx.maxZ - idx.minZ) / size;
            r.Pixels = new Color32[size * size];
            for (int i = 0; i < r.Pixels.Length; i++) r.Pixels[i] = Bg;

            var chunks = new List<ChunkData>();
            foreach (var c in idx.chunks)
                chunks.Add(JsonUtility.FromJson<ChunkData>(File.ReadAllText(Path.Combine(ctx.RootPath, "chunks", c.file))));

            void Areas(Func<string, bool> pred)
            {
                foreach (var a in gl.areas) if (pred(a.kind)) r.FillPoly(a.pts, AreaColor(a.kind));
                foreach (var ch in chunks) if (ch.areas != null) foreach (var a in ch.areas) if (pred(a.kind)) r.FillPoly(a.pts, AreaColor(a.kind));
            }
            Areas(k => k != "water");
            Areas(k => k == "water");
            foreach (var w in gl.waterLines) r.Polyline(w.pts, w.width, Water);
            foreach (var ch in chunks)
                if (ch.buildings != null)
                    foreach (var b in ch.buildings) { r.FillPoly(b.pts, Building); r.Outline(b.pts, BuildingEdge); }
            var nx = idx.nodeX; var nz = idx.nodeZ;
            var tmp = new List<float>();
            for (int pass = 0; pass < 3; pass++)
                foreach (var road in idx.roads)
                {
                    if (road.tunnel == 1) continue;
                    int band = road.rank >= 7 ? 2 : road.rank >= 5 ? 1 : 0;
                    if (band != pass) continue;
                    tmp.Clear();
                    foreach (int n in road.nodes) { tmp.Add(nx[n]); tmp.Add(nz[n]); }
                    Color32 c = road.rank == 0 ? Foot : band == 2 ? Trunk : band == 1 ? Major : Minor;
                    r.Polyline(tmp.ToArray(), Mathf.Max(road.width * 1.3f, road.rank == 0 ? 1.5f : 4f), c);
                }
            foreach (var ch in chunks)
                if (ch.rails != null)
                    foreach (var rl in ch.rails) r.Polyline(rl.pts, rl.elevated == 1 ? 6f : 3f, rl.kind == "rail" ? Rail : Metro);
            return r;
        }

        static Color32 AreaColor(string kind)
        {
            switch (kind)
            {
                case "water": return Water;
                case "park": case "grass": case "pitch": case "cemetery": return Park;
                case "forest": return Forest;
                case "campus": case "military": return Campus;
                case "commercial": return new Color32(240, 220, 215, 255);
                case "industrial": case "railway": return new Color32(222, 216, 225, 255);
                case "parking": return new Color32(225, 225, 225, 255);
                default: return new Color32(236, 232, 224, 255);
            }
        }

        public Vector2 ToPx(float x, float z) { return new Vector2((x - minX) / MetersPerPixel, (z - minZ) / MetersPerPixel); }

        void FillPoly(float[] pts, Color32 col)
        {
            int n = pts.Length / 2;
            if (n < 3) return;
            var px = new float[n]; var pz = new float[n];
            float ymin = float.MaxValue, ymax = float.MinValue;
            for (int i = 0; i < n; i++)
            {
                px[i] = (pts[2 * i] - minX) / MetersPerPixel; pz[i] = (pts[2 * i + 1] - minZ) / MetersPerPixel;
                ymin = Mathf.Min(ymin, pz[i]); ymax = Mathf.Max(ymax, pz[i]);
            }
            int y0 = Mathf.Max(0, Mathf.FloorToInt(ymin)), y1 = Mathf.Min(Size - 1, Mathf.CeilToInt(ymax));
            var xs = new List<float>(8);
            for (int y = y0; y <= y1; y++)
            {
                float sy = y + 0.5f;
                xs.Clear();
                for (int i = 0, j = n - 1; i < n; j = i++)
                    if ((pz[i] > sy) != (pz[j] > sy)) xs.Add(px[i] + (sy - pz[i]) * (px[j] - px[i]) / (pz[j] - pz[i]));
                xs.Sort();
                for (int k = 0; k + 1 < xs.Count; k += 2)
                {
                    int a = Mathf.Max(0, Mathf.CeilToInt(xs[k] - 0.5f)), b = Mathf.Min(Size - 1, Mathf.FloorToInt(xs[k + 1] - 0.5f));
                    for (int x = a; x <= b; x++) Pixels[y * Size + x] = col;
                }
            }
        }

        void Outline(float[] pts, Color32 col)
        {
            int n = pts.Length / 2;
            for (int i = 0; i < n; i++)
            {
                int j = (i + 1) % n;
                Line(pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1], 0.5f, col);
            }
        }

        void Polyline(float[] pts, float widthMeters, Color32 col)
        {
            float rad = Mathf.Max(0.5f, widthMeters / MetersPerPixel / 2f);
            for (int i = 0; i + 3 < pts.Length; i += 2) Line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], rad, col);
        }

        void Line(float ax, float az, float bx, float bz, float radPx, Color32 col)
        {
            Vector2 a = ToPx(ax, az), b = ToPx(bx, bz);
            float len = Vector2.Distance(a, b);
            int steps = Mathf.Max(1, Mathf.CeilToInt(len / 0.5f));
            int ir = Mathf.CeilToInt(radPx);
            float r2 = radPx * radPx;
            for (int s = 0; s <= steps; s++)
            {
                Vector2 p = Vector2.Lerp(a, b, s / (float)steps);
                int cx = Mathf.RoundToInt(p.x), cy = Mathf.RoundToInt(p.y);
                for (int dy = -ir; dy <= ir; dy++)
                    for (int dx = -ir; dx <= ir; dx++)
                    {
                        if (radPx > 1f && dx * dx + dy * dy > r2) continue;
                        int x = cx + dx, y = cy + dy;
                        if (x < 0 || y < 0 || x >= Size || y >= Size) continue;
                        Pixels[y * Size + x] = col;
                    }
            }
        }
    }
}
