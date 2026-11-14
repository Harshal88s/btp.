// Turns one OSM chunk (ChunkData) into renderable geometry. Build() is thread-safe (pure data + maths) and runs on
// a worker thread; Instantiate() runs on the main thread and creates the GameObjects, meshes and colliders.
using System;
using System.Collections.Generic;
using Shehar.Core;
using UnityEngine;

namespace Shehar.City
{
    /// <summary>Read-only city context shared by chunk builders (safe to read from worker threads).</summary>
    public sealed class CityContext
    {
        public CityIndex Index;
        public RoadGraph Graph;
        public int[] NodeArms;        // number of road arms meeting at a node (>=3 = junction)
        public float[] NodeMaxWidth;  // widest drivable road at node
        public string RootPath;

        public void Prepare()
        {
            int n = Index.nodeX.Length;
            NodeArms = new int[n]; NodeMaxWidth = new float[n];
            foreach (var r in Index.roads)
            {
                if (r.rank < 1 || r.tunnel == 1) continue; // footways do not create junction cuts
                for (int i = 0; i < r.nodes.Length; i++)
                {
                    int nd = r.nodes[i];
                    NodeArms[nd] += (i == 0 || i == r.nodes.Length - 1) ? 1 : 2;
                    if (r.drivable == 1 || r.type == "busway") NodeMaxWidth[nd] = Mathf.Max(NodeMaxWidth[nd], r.width);
                }
            }
        }

        public bool IsJunction(int node) { return NodeArms[node] >= 3; }
        public float JunctionRadius(int node) { return IsJunction(node) ? NodeMaxWidth[node] * 0.5f + 1.0f : 0f; }
        public Vector3 NodePos(int node) { return new Vector3(Index.nodeX[node], 0, Index.nodeZ[node]); }
    }

    public struct PropSpot { public Vector3 Pos; public float Yaw; public int Node; public float Width; }

    /// <summary>Geometry for one chunk, produced off the main thread.</summary>
    public sealed class ChunkGeometry
    {
        public int Cx, Cz;
        public MeshBuilder[] Facades = new MeshBuilder[4];
        public MeshBuilder Roofs = new MeshBuilder(), RoofProps = new MeshBuilder(), Temples = new MeshBuilder();
        public Dictionary<string, MeshBuilder> Areas = new Dictionary<string, MeshBuilder>();
        public MeshBuilder Asphalt = new MeshBuilder(), AsphaltMajor = new MeshBuilder(), Markings = new MeshBuilder(),
            Sidewalks = new MeshBuilder(), Curbs = new MeshBuilder(), Parapets = new MeshBuilder(), Bumps = new MeshBuilder(),
            RailBed = new MeshBuilder(), Viaduct = new MeshBuilder(), Bark = new MeshBuilder(), Leaves = new MeshBuilder(),
            LampPoles = new MeshBuilder(), LampHeads = new MeshBuilder(), Props = new MeshBuilder(), Cloth = new MeshBuilder();
        public List<PropSpot> BumpSpots = new List<PropSpot>();
        public List<PropSpot> SignalSpots = new List<PropSpot>();
        public List<Vector3> VendorSpots = new List<Vector3>();
        public List<Vector3> SidewalkSpots = new List<Vector3>(); // for pedestrians
        public int BuildingCount;
        public ChunkGeometry() { for (int i = 0; i < Facades.Length; i++) Facades[i] = new MeshBuilder(); }
    }

    public static class ChunkBuilder
    {
        // Height levels (metres) keep coplanar layers apart; physics ground is at Ground.ColliderTop.
        public const float AreaBaseY = 0.004f, RoadBaseY = 0.03f, RoadRankStep = 0.006f, JunctionY = 0.092f, SidewalkY = 0.16f;

        static readonly Color32[] Paints =
        {
            new Color32(240, 228, 200, 255), new Color32(242, 222, 160, 255), new Color32(236, 204, 196, 255),
            new Color32(196, 218, 230, 255), new Color32(205, 226, 204, 255), new Color32(236, 236, 228, 255),
            new Color32(214, 150, 118, 255), new Color32(196, 194, 188, 255), new Color32(246, 210, 176, 255),
            new Color32(214, 204, 228, 255), new Color32(250, 246, 236, 255), new Color32(226, 196, 120, 255),
        };
        static readonly Color32 White = new Color32(255, 255, 255, 255), Yellow = new Color32(250, 205, 40, 255);

        static uint H(long v)
        {
            unchecked
            {
                ulong x = (ulong)v * 0x9E3779B97F4A7C15UL;
                x ^= x >> 29; x *= 0xBF58476D1CE4E5B9UL; x ^= x >> 32;
                return (uint)x;
            }
        }
        static float H01(long v, int salt) { return (H(v * 31 + salt) & 0xFFFF) / 65535f; }

        public static ChunkGeometry Build(ChunkData d, CityContext ctx)
        {
            var g = new ChunkGeometry { Cx = d.cx, Cz = d.cz };
            var idx = ctx.Index;
            float cs = idx.chunkSize;
            float x0 = idx.minX + d.cx * cs, z0 = idx.minZ + d.cz * cs;
            Rect bounds = new Rect(x0, z0, cs, cs);

            // ---------------- areas
            if (d.areas != null) foreach (var a in d.areas) AddArea(g, a);

            // ---------------- buildings
            var buildingBoxes = new List<Rect>();
            if (d.buildings != null)
                foreach (var b in d.buildings)
                {
                    AddBuilding(g, b);
                    buildingBoxes.Add(BoundsOf(b.pts));
                }
            g.BuildingCount = d.buildings == null ? 0 : d.buildings.Length;

            // ---------------- roads
            var junctionsDone = new HashSet<int>();
            var featuresDone = new HashSet<int>();
            var line = new List<Vector3>(64);
            if (d.roads != null)
                foreach (var piece in d.roads)
                {
                    var road = idx.roads[piece.road];
                    if (road.tunnel == 1) continue;
                    line.Clear();
                    foreach (int n in piece.nodes) line.Add(ctx.NodePos(n));
                    AddRoad(g, ctx, road, piece, line, bounds, junctionsDone, featuresDone, buildingBoxes, d.buildings);
                }

            // ---------------- rails / metro
            if (d.rails != null)
                foreach (var r in d.rails)
                {
                    var pts = ToLine(r.pts, 0);
                    if (pts.Count < 2) continue;
                    if (r.elevated == 1) AddViaduct(g, pts);
                    else g.RailBed.Ribbon(pts, 3.4f, 0, 0.035f, White, 2f);
                }

            // ---------------- OSM / park trees
            if (d.trees != null)
                for (int i = 0; i + 1 < d.trees.Length; i += 2)
                    AddTree(g, new Vector3(d.trees[i], 0, d.trees[i + 1]), (long)(d.trees[i] * 10) * 7919 + (long)(d.trees[i + 1] * 10));

            // ---------------- POI props: petrol pumps, food stalls
            foreach (var p in idx.pois)
            {
                if (!bounds.Contains(new Vector2(p.x, p.z))) continue;
                if (p.kind == "fuel") AddFuelStation(g, ctx, p);
                else if (p.kind == "food" || p.kind == "market") AddVendor(g, ctx, p);
            }
            return g;
        }

        // ------------------------------------------------------------------ areas
        public static float AreaY(string kind)
        {
            switch (kind)
            {
                case "residential": return 0.004f;
                case "commercial": return 0.005f;
                case "industrial": return 0.006f;
                case "campus": case "military": return 0.007f;
                case "railway": return 0.008f;
                case "cemetery": case "construction": return 0.009f;
                case "parking": return 0.012f;
                case "grass": return 0.014f;
                case "pitch": return 0.016f;
                case "park": return 0.018f;
                case "forest": case "sand": return 0.02f;
                case "water": return 0.022f;
            }
            return 0.003f;
        }

        public static void AddArea(ChunkGeometry g, AreaData a)
        {
            if (a.pts == null || a.pts.Length < 6) return;
            if (!g.Areas.TryGetValue(a.kind, out var mb)) g.Areas[a.kind] = mb = new MeshBuilder();
            Color32 c = White;
            if (a.kind == "pitch") c = new Color32(220, 240, 200, 255);
            mb.PolygonTop(a.pts, AreaY(a.kind), c, 0.1f);
        }

#if !SHEHAR_HEADLESS
        public static Material AreaMaterial(string kind)
        {
            switch (kind)
            {
                case "water": return Materials.Water;
                case "park": return Materials.Park;
                case "grass": case "pitch": case "cemetery": return Materials.Grass;
                case "forest": return Materials.Forest;
                case "sand": case "construction": return Materials.Sand;
                case "campus": case "military": return Materials.Campus;
                case "commercial": return Materials.Commercial;
                case "industrial": case "railway": return Materials.Industrial;
                case "parking": return Materials.Parking;
                default: return Materials.Residential;
            }
        }

#endif

        // ------------------------------------------------------------------ buildings
        static Rect BoundsOf(float[] p)
        {
            float a = float.MaxValue, b = float.MaxValue, c = float.MinValue, e = float.MinValue;
            for (int i = 0; i < p.Length; i += 2) { a = Mathf.Min(a, p[i]); b = Mathf.Min(b, p[i + 1]); c = Mathf.Max(c, p[i]); e = Mathf.Max(e, p[i + 1]); }
            return Rect.MinMaxRect(a, b, c, e);
        }

        static void AddBuilding(ChunkGeometry g, BuildingData b)
        {
            if (b.pts == null || b.pts.Length < 6) return;
            float area = Mathf.Abs(Triangulator.SignedArea(b.pts));
            uint h = H(b.id);
            int style;
            string k = b.kind ?? "yes";
            bool worship = k == "worship", historic = k == "historic";
            if (historic) style = 1;
            else if (k == "commercial" || k == "office" || k == "retail" || k == "hotel") style = (h % 3 == 0) ? 0 : 2;
            else if (k == "apartments" || k == "residential") style = (h % 4 == 0) ? 3 : 0;
            else if (k == "house" || k == "detached" || k == "hut") style = (h % 2 == 0) ? 3 : 1;
            else style = (int)(h % 4 == 2 ? 2 : h % 3 == 0 ? 1 : h % 2 == 0 ? 0 : 3);
            if (b.levels >= 9 && style == 1) style = 2;

            Color32 paint = Paints[h % (uint)Paints.Length];
            if (style == 2) paint = new Color32(200, 205, 210, 255);
            if (historic) paint = new Color32(170, 140, 110, 255);
            if (worship) paint = new Color32(250, 236, 214, 255);
            paint.a = (byte)(h >> 8);

            float y0 = Mathf.Max(0, b.minH);
            float top = Mathf.Max(y0 + 2.5f, b.h);
            g.Facades[style].Walls(b.pts, y0, top, paint);
            Color32 roofCol = new Color32((byte)(180 + (h >> 4) % 40), (byte)(175 + (h >> 4) % 40), (byte)(168 + (h >> 4) % 40), 255);
            g.Roofs.PolygonTop(b.pts, top, roofCol, 0.15f);
            if (y0 > 0.5f) g.Roofs.PolygonTop(b.pts, y0, new Color32(150, 148, 142, 255), 0.15f, true); // underside of elevated stations / canopies

            Vector3 c = Centroid(b.pts);
            if (worship)
            {
                // temple shikhara (saffron spire) - typical of Pune's many mandirs
                float r = Mathf.Clamp(Mathf.Sqrt(area) * 0.3f, 1.2f, 6f);
                g.Temples.Frustum(new Vector3(c.x, top, c.z), new Vector2(r * 2, r * 2), new Vector2(r * 0.9f, r * 0.9f), r * 1.6f, 0, new Color32(236, 140, 50, 255));
                g.Temples.Cone(new Vector3(c.x, top + r * 1.6f, c.z), r * 0.45f, 0.05f, r * 1.4f, 8, new Color32(240, 160, 60, 255));
                g.Temples.Box(new Vector3(c.x, top + r * 3.0f + 0.9f, c.z + 0.35f), new Vector3(0.05f, 1.8f, 0.05f), new Color32(80, 60, 40, 255));
                g.Temples.Box(new Vector3(c.x, top + r * 3.0f + 1.5f, c.z + 0.7f), new Vector3(0.02f, 0.5f, 0.7f), new Color32(255, 120, 20, 255));
            }
            else if (area > 45 && b.levels >= 2 && H01(b.id, 3) > 0.35f)
            {
                // black plastic rooftop water tanks - a signature of Indian skylines
                int tanks = area > 300 ? 2 : 1;
                for (int t = 0; t < tanks; t++)
                {
                    Vector3 v = new Vector3(b.pts[2 * t], 0, b.pts[2 * t + 1]);
                    Vector3 p = Vector3.Lerp(c, v, 0.45f);
                    g.RoofProps.Cylinder(new Vector3(p.x, top + 0.65f, p.z), Vector3.up, 0.7f, 1.3f, 10, new Color32(25, 25, 28, 255));
                }
                if (H01(b.id, 4) > 0.6f)  // stair-head room
                    g.RoofProps.Box(new Vector3(c.x, top + 1.3f, c.z), new Vector3(2.6f, 2.6f, 3.2f), paint);
            }
        }

        static Vector3 Centroid(float[] p)
        {
            float x = 0, z = 0; int n = p.Length / 2;
            for (int i = 0; i < n; i++) { x += p[2 * i]; z += p[2 * i + 1]; }
            return new Vector3(x / n, 0, z / n);
        }

        // ------------------------------------------------------------------ roads
        public static float RoadY(RoadInfo r, int roadIndex)
        {
            return RoadBaseY + Mathf.Clamp(r.rank, 0, 9) * RoadRankStep + (roadIndex % 4) * 0.0009f;
        }

        /// <summary>Splits a polyline into runs that avoid the circles around junction vertices.</summary>
        static List<List<Vector3>> Trim(List<Vector3> line, float[] rad)
        {
            var runs = new List<List<Vector3>>();
            List<Vector3> cur = null;
            for (int i = 0; i < line.Count - 1; i++)
            {
                Vector3 a = line[i], b = line[i + 1];
                float L = Vector3.Distance(a, b);
                float ra = rad[i], rb = rad[i + 1];
                if (ra + rb >= L - 0.05f) { if (cur != null && cur.Count > 1) runs.Add(cur); cur = null; continue; }
                Vector3 s = ra > 0 ? Vector3.Lerp(a, b, ra / L) : a;
                Vector3 e = rb > 0 ? Vector3.Lerp(a, b, 1 - rb / L) : b;
                if (cur == null || ra > 0) { if (cur != null && cur.Count > 1) runs.Add(cur); cur = new List<Vector3> { s }; }
                cur.Add(e);
                if (rb > 0) { runs.Add(cur); cur = null; }
            }
            if (cur != null && cur.Count > 1) runs.Add(cur);
            return runs;
        }

        static void AddRoad(ChunkGeometry g, CityContext ctx, RoadInfo road, RoadPiece piece, List<Vector3> line, Rect bounds,
                            HashSet<int> junctionsDone, HashSet<int> featuresDone, List<Rect> bboxes, BuildingData[] buildings)
        {
            int ridx = piece.road;
            bool foot = road.rank == 0 && road.type != "track";
            float y = RoadY(road, ridx);
            float w = road.width;

            if (foot || road.type == "pedestrian")
            {
                g.Sidewalks.Ribbon(line, Mathf.Max(1.5f, w), 0, foot ? 0.025f : y, White, 4f);
                return;
            }
            var target = road.rank >= 6 ? g.AsphaltMajor : g.Asphalt;
            target.Ribbon(line, w, 0, y, White, w);

            int n = line.Count;
            var rad = new float[n];
            for (int i = 0; i < n; i++) rad[i] = ctx.JunctionRadius(piece.nodes[i]);

            // junction fill discs (assigned to the chunk that owns the node so they are built once)
            for (int i = 0; i < n; i++)
            {
                int nd = piece.nodes[i];
                if (!ctx.IsJunction(nd) || ctx.NodeMaxWidth[nd] < 4.5f) continue;
                Vector3 p = line[i];
                if (!bounds.Contains(new Vector2(p.x, p.z)) || !junctionsDone.Add(nd)) continue;
                var disc = ctx.NodeMaxWidth[nd] >= 10 ? g.AsphaltMajor : g.Asphalt;
                disc.Disc(new Vector3(p.x, JunctionY, p.z), ctx.NodeMaxWidth[nd] * 0.55f, 14, White);
            }

            var runs = Trim(line, rad);
            bool twoWay = road.oneway == 0;
            bool marked = road.drivable == 1 && road.rank >= 3 && w >= 6.5f;
            foreach (var run in runs)
            {
                if (marked)
                {
                    float my = y + 0.002f;
                    if (twoWay)
                    {
                        g.Markings.Ribbon(run, 0.15f, 0, my, White, 6f);
                        if (w >= 12f)
                        {
                            g.Markings.Ribbon(run, 0.12f, w / 4, my, White, 6f);
                            g.Markings.Ribbon(run, 0.12f, -w / 4, my, White, 6f);
                        }
                    }
                    else
                    {
                        int lanes = road.lanes > 0 ? road.lanes : Mathf.Max(1, Mathf.RoundToInt(w / 3.3f));
                        for (int k = 1; k < lanes; k++) g.Markings.Ribbon(run, 0.12f, -w / 2 + k * w / lanes, my, White, 6f);
                    }
                    if (road.rank >= 6)
                    {
                        g.Markings.Ribbon(run, 0.12f, w / 2 - 0.35f, my, White, 1e6f);
                        g.Markings.Ribbon(run, 0.12f, -w / 2 + 0.35f, my, White, 1e6f);
                    }
                }
                // footpaths with painted black/yellow kerbs
                if (road.drivable == 1 && road.rank >= 3 && road.rank <= 8 && road.bridge == 0)
                {
                    float sw = road.rank >= 5 ? 2.4f : 1.6f;
                    var swRuns = Trim(run, new float[run.Count]); // run already trimmed at junctions
                    foreach (var r2 in swRuns)
                    {
                        g.Sidewalks.Ribbon(r2, sw, w / 2 + sw / 2 + 0.15f, SidewalkY, White, 4f);
                        g.Sidewalks.Ribbon(r2, sw, -(w / 2 + sw / 2 + 0.15f), SidewalkY, White, 4f);
                        g.Curbs.Ribbon(r2, 0.3f, w / 2 + 0.15f, SidewalkY + 0.002f, White, 2f);
                        g.Curbs.Ribbon(r2, 0.3f, -(w / 2 + 0.15f), SidewalkY + 0.002f, White, 2f);
                        if (road.rank >= 3 && road.rank <= 7) SampleAlong(r2, 25f, (p, dir) =>
                        {
                            var nrm = new Vector3(-dir.z, 0, dir.x);
                            g.SidewalkSpots.Add(p + nrm * (w / 2 + sw / 2 + 0.15f));
                            g.SidewalkSpots.Add(p - nrm * (w / 2 + sw / 2 + 0.15f));
                        });
                    }
                }
                if (road.bridge == 1 && road.drivable == 1)
                {
                    g.Parapets.Fence(run, w / 2 + 0.2f, y, y + 0.9f, White);
                    g.Parapets.Fence(run, -(w / 2 + 0.2f), y, y + 0.9f, White);
                }
                // street lights on main roads (alternating sides) + roadside trees on smaller streets
                if (road.drivable == 1 && road.rank >= 5 && road.bridge == 0)
                {
                    int count = 0;
                    SampleAlong(run, 38f, (p, dir) =>
                    {
                        float side = (count++ % 2 == 0) ? 1 : -1;
                        var nrm = new Vector3(-dir.z, 0, dir.x) * side;
                        AddLamp(g, p + nrm * (w / 2 + 0.7f), -nrm);
                    });
                }
                if (road.drivable == 1 && (road.rank == 3 || road.rank == 5 || road.rank == 6) && road.bridge == 0)
                {
                    int i2 = 0;
                    SampleAlong(run, 14f, (p, dir) =>
                    {
                        i2++;
                        long seed = road.id * 131 + i2;
                        if (H01(seed, 1) < 0.45f) return;
                        float side = H01(seed, 2) < 0.5f ? 1 : -1;
                        var nrm = new Vector3(-dir.z, 0, dir.x) * side;
                        Vector3 tp = p + nrm * (w / 2 + (road.rank >= 5 ? 2.0f : 1.4f));
                        if (InsideAnyBuilding(tp, bboxes, buildings)) return;
                        AddTree(g, tp, seed);
                    });
                }
            }

            // signals, speed breakers and zebra crossings on real OSM nodes
            if (road.drivable == 1)
                for (int i = 0; i < n; i++)
                {
                    int nd = piece.nodes[i];
                    int f = ctx.Index.nodeFlags[nd];
                    if ((f & 7) == 0 || !bounds.Contains(new Vector2(line[i].x, line[i].z)) || !featuresDone.Add(nd)) continue;
                    Vector3 dir = (i < n - 1 ? line[i + 1] - line[i] : line[i] - line[i - 1]); dir.y = 0; dir.Normalize();
                    float yaw = Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg;
                    if ((f & NodeFlags.TrafficSignal) != 0 && !ctx.IsJunction(nd))
                        g.SignalSpots.Add(new PropSpot { Pos = line[i], Yaw = yaw, Node = nd, Width = w });
                    else if ((f & NodeFlags.TrafficSignal) != 0)
                        g.SignalSpots.Add(new PropSpot { Pos = line[i], Yaw = yaw, Node = nd, Width = ctx.NodeMaxWidth[nd] });
                    if ((f & NodeFlags.SpeedBump) != 0)
                    {
                        g.BumpSpots.Add(new PropSpot { Pos = line[i], Yaw = yaw, Node = nd, Width = w });
                        var q = Quaternion.Euler(0, yaw, 0);
                        g.Bumps.Box(new Vector3(line[i].x, y + 0.045f, line[i].z), new Vector3(w, 0.09f, 0.7f), White, q);
                    }
                    if ((f & NodeFlags.Crossing) != 0 && road.rank >= 5 && !ctx.IsJunction(nd))
                    {
                        var nrm = new Vector3(-dir.z, 0, dir.x);
                        var across = new List<Vector3> { line[i] - nrm * (w / 2 - 0.3f), line[i] + nrm * (w / 2 - 0.3f) };
                        g.Markings.Ribbon(across, 3f, 0, y + 0.002f, White, 1.0f);
                    }
                }
        }

        static bool InsideAnyBuilding(Vector3 p, List<Rect> boxes, BuildingData[] buildings)
        {
            if (buildings == null) return false;
            var v = new Vector2(p.x, p.z);
            for (int i = 0; i < boxes.Count; i++)
            {
                Rect r = boxes[i];
                r.xMin -= 1.5f; r.yMin -= 1.5f; r.xMax += 1.5f; r.yMax += 1.5f;
                if (r.Contains(v)) return true;
            }
            return false;
        }

        static void SampleAlong(List<Vector3> run, float step, Action<Vector3, Vector3> f)
        {
            float acc = step * 0.5f;
            for (int i = 0; i < run.Count - 1; i++)
            {
                Vector3 a = run[i], b = run[i + 1];
                float L = Vector3.Distance(a, b);
                if (L < 0.01f) continue;
                Vector3 dir = (b - a) / L;
                while (acc <= L) { f(a + dir * acc, dir); acc += step; }
                acc -= L;
            }
        }

        static List<Vector3> ToLine(float[] pts, float y)
        {
            var l = new List<Vector3>(pts.Length / 2);
            for (int i = 0; i + 1 < pts.Length; i += 2) l.Add(new Vector3(pts[i], y, pts[i + 1]));
            return l;
        }

        // ------------------------------------------------------------------ props
        public static void AddLamp(ChunkGeometry g, Vector3 p, Vector3 towardRoad)
        {
            var grey = new Color32(120, 122, 125, 255);
            g.LampPoles.Cylinder(new Vector3(p.x, 4f, p.z), Vector3.up, 0.09f, 8f, 6, grey, false);
            Vector3 arm = p + towardRoad * 1.2f;
            g.LampPoles.Box(new Vector3((p.x + arm.x) / 2, 7.9f, (p.z + arm.z) / 2), new Vector3(0.08f, 0.08f, 1.3f), grey,
                Quaternion.LookRotation(towardRoad));
            g.LampHeads.Box(new Vector3(arm.x, 7.8f, arm.z), new Vector3(0.35f, 0.12f, 0.7f), White, Quaternion.LookRotation(towardRoad));
        }

        public static void AddTree(ChunkGeometry g, Vector3 p, long seed)
        {
            float s = 0.75f + H01(seed, 7) * 0.6f;
            var trunk = new Color32(255, 255, 255, 255);
            byte gv = (byte)(200 + H01(seed, 8) * 55);
            var leaf = new Color32((byte)(gv * 0.85f), gv, (byte)(gv * 0.75f), 255);
            if (H01(seed, 9) < 0.18f)
            {
                // Ashoka (mast) tree: tall slim column
                g.Bark.Cylinder(new Vector3(p.x, 1.5f * s, p.z), Vector3.up, 0.12f * s, 3f * s, 5, trunk, false);
                g.Leaves.Blob(new Vector3(p.x, 5.5f * s, p.z), new Vector3(1.1f, 4.2f, 1.1f) * s, 6, 4, leaf);
            }
            else
            {
                // neem / banyan style broad canopy
                g.Bark.Cylinder(new Vector3(p.x, 2f * s, p.z), Vector3.up, 0.22f * s, 4f * s, 6, trunk, false);
                g.Leaves.Blob(new Vector3(p.x, 5.2f * s, p.z), new Vector3(3.2f, 2.3f, 3.2f) * s, 7, 4, leaf);
                g.Leaves.Blob(new Vector3(p.x + 1.2f * s, 6.4f * s, p.z - 0.6f * s), new Vector3(2.0f, 1.6f, 2.0f) * s, 6, 3, leaf);
            }
        }

        static void AddViaduct(ChunkGeometry g, List<Vector3> pts)
        {
            const float H = 12f;
            var deck = new List<Vector3>(pts.Count);
            foreach (var p in pts) deck.Add(new Vector3(p.x, 0, p.z));
            var conc = new Color32(215, 212, 205, 255);
            g.Viaduct.Ribbon(deck, 9f, 0, H, conc, 9f);
            g.Viaduct.Ribbon(deck, 9f, 0, H - 1.2f, new Color32(170, 168, 162, 255), 9f, 0, true);
            g.Viaduct.Fence(deck, 4.5f, H - 1.2f, H + 1.0f, conc);
            g.Viaduct.Fence(deck, -4.5f, H - 1.2f, H + 1.0f, conc);
            g.RailBed.Ribbon(deck, 3f, 2.1f, H + 0.05f, White, 2f);
            g.RailBed.Ribbon(deck, 3f, -2.1f, H + 0.05f, White, 2f);
            SampleAlong(deck, 28f, (p, dir) =>
            {
                g.Viaduct.Box(new Vector3(p.x, (H - 1.2f) / 2, p.z), new Vector3(1.8f, H - 1.2f, 1.8f), conc, Quaternion.LookRotation(dir));
                g.Viaduct.Box(new Vector3(p.x, H - 1.6f, p.z), new Vector3(7.5f, 1.0f, 2.2f), conc, Quaternion.LookRotation(dir));
            });
        }

        static void AddFuelStation(ChunkGeometry g, CityContext ctx, Poi p)
        {
            int e = ctx.Graph.NearestEdge(p.x, p.z, out float t, out float dist, 80f);
            float yaw = 0;
            if (e >= 0)
            {
                int a = ctx.Index.edgeA[e], b = ctx.Index.edgeB[e];
                yaw = Mathf.Atan2(ctx.Index.nodeX[b] - ctx.Index.nodeX[a], ctx.Index.nodeZ[b] - ctx.Index.nodeZ[a]) * Mathf.Rad2Deg;
            }
            var q = Quaternion.Euler(0, yaw, 0);
            Vector3 c = new Vector3(p.x, 0, p.z);
            var white = new Color32(240, 240, 240, 255);
            var accent = new Color32((byte)(200 + H((p.name ?? "").GetHashCode()) % 55), 60, 40, 255);
            g.Props.Box(c + Vector3.up * 5.4f, new Vector3(16f, 0.8f, 9f), white, q);                 // canopy
            g.Props.Box(c + Vector3.up * 5.0f, new Vector3(16.1f, 0.25f, 9.1f), accent, q);           // fascia band
            for (int i = -1; i <= 1; i += 2)
                for (int j = -1; j <= 1; j += 2)
                    g.Props.Box(c + q * new Vector3(i * 5.5f, 2.5f, j * 2.8f), new Vector3(0.4f, 5f, 0.4f), white, q);
            for (int i = -1; i <= 1; i += 2)
            {
                g.Props.Box(c + q * new Vector3(i * 3f, 0.9f, 0), new Vector3(0.9f, 1.8f, 0.6f), accent, q); // dispensers
                g.Props.Box(c + q * new Vector3(i * 3f, 0.15f, 0), new Vector3(1.6f, 0.3f, 3.5f), new Color32(200, 200, 195, 255), q);
            }
        }

        static void AddVendor(ChunkGeometry g, CityContext ctx, Poi p)
        {
            // place a hand-cart stall on the footpath of the nearest street (ASSUMPTION: decorative, at real food/market POIs)
            int e = ctx.Graph.NearestEdge(p.x, p.z, out float t, out float dist, 40f);
            if (e < 0) return;
            int a = ctx.Index.edgeA[e], b = ctx.Index.edgeB[e];
            var road = ctx.Graph.RoadOfEdge(e);
            Vector3 A = ctx.NodePos(a), B = ctx.NodePos(b);
            Vector3 on = Vector3.Lerp(A, B, t);
            Vector3 dir = (B - A).normalized;
            Vector3 nrm = new Vector3(-dir.z, 0, dir.x);
            if (Vector3.Dot(new Vector3(p.x, 0, p.z) - on, nrm) < 0) nrm = -nrm;
            Vector3 c = on + nrm * (road.width / 2 + 1.4f);
            var q = Quaternion.LookRotation(-nrm);
            uint h = H((p.name ?? "").GetHashCode());
            var wood = new Color32(150, 100, 60, 255);
            g.Props.Box(c + Vector3.up * 0.9f, new Vector3(1.9f, 0.15f, 1.0f), wood, q);
            g.Props.Box(c + Vector3.up * 0.55f, new Vector3(1.8f, 0.6f, 0.9f), new Color32(80, 120, 160, 255), q);
            for (int i = -1; i <= 1; i += 2)
                g.Props.Cylinder(c + q * new Vector3(i * 0.7f, 0.3f, 0.5f), q * Vector3.right, 0.3f, 0.08f, 8, new Color32(40, 40, 40, 255));
            g.Props.Cylinder(c + Vector3.up * 1.7f, Vector3.up, 0.04f, 1.6f, 5, new Color32(90, 90, 90, 255), false);
            Color32[] umb = { new Color32(220, 40, 40, 255), new Color32(30, 120, 200, 255), new Color32(250, 180, 30, 255), new Color32(30, 150, 80, 255) };
            g.Cloth.Cone(c + Vector3.up * 2.3f, 1.4f, 0.05f, 0.6f, 8, umb[h % 4]);
            // the vendor
            Vector3 v = c + q * new Vector3(0, 0, -0.9f);
            var shirt = umb[(h >> 3) % 4];
            g.Props.Box(v + Vector3.up * 0.45f, new Vector3(0.3f, 0.9f, 0.22f), new Color32(60, 60, 70, 255), q);
            g.Props.Box(v + Vector3.up * 1.2f, new Vector3(0.42f, 0.6f, 0.25f), shirt, q);
            g.Props.Blob(v + Vector3.up * 1.65f, new Vector3(0.12f, 0.14f, 0.12f), 6, 4, new Color32(150, 100, 70, 255));
            g.VendorSpots.Add(c);
        }

#if !SHEHAR_HEADLESS
        // ------------------------------------------------------------------ main thread
        public static GameObject Instantiate(ChunkGeometry g, Transform parent, int layerDefault)
        {
            var root = new GameObject("Chunk_" + g.Cx + "_" + g.Cz);
            root.transform.SetParent(parent, false);
            var lod = root.AddComponent<ChunkLod>();

            for (int i = 0; i < g.Facades.Length; i++)
            {
                var go = Part(root, "Buildings" + i, g.Facades[i], Materials.Facades[i], lod.Core, collider: true);
                if (go != null) lod.Colliders.Add(go.GetComponent<MeshCollider>());
            }
            Part(root, "Roofs", g.Roofs, Materials.Roof, lod.Core);
            Part(root, "RoofProps", g.RoofProps, Materials.Concrete, lod.Detail);
            Part(root, "Temples", g.Temples, Materials.Concrete, lod.Core);
            foreach (var kv in g.Areas) Part(root, "Area_" + kv.Key, kv.Value, AreaMaterial(kv.Key), lod.Core, shadows: false);
            Part(root, "Roads", g.Asphalt, Materials.Asphalt, lod.Core, shadows: false);
            Part(root, "RoadsMajor", g.AsphaltMajor, Materials.AsphaltMajor, lod.Core, shadows: false);
            Part(root, "Markings", g.Markings, Materials.Marking, lod.Detail, shadows: false);
            Part(root, "Footpaths", g.Sidewalks, Materials.Sidewalk, lod.Core, shadows: false);
            Part(root, "Kerbs", g.Curbs, Materials.Curb, lod.Detail, shadows: false);
            var par = Part(root, "Parapets", g.Parapets, Materials.Concrete, lod.Core, collider: true);
            if (par != null) lod.Colliders.Add(par.GetComponent<MeshCollider>());
            Part(root, "SpeedBreakers", g.Bumps, Materials.Curb, lod.Detail, shadows: false);
            Part(root, "Rails", g.RailBed, Materials.RailTrack, lod.Core, shadows: false);
            var via = Part(root, "MetroViaduct", g.Viaduct, Materials.Concrete, lod.Core, collider: true);
            if (via != null) lod.Colliders.Add(via.GetComponent<MeshCollider>());
            Part(root, "TreeTrunks", g.Bark, Materials.Bark, lod.Detail);
            Part(root, "TreeLeaves", g.Leaves, Materials.Leaves, lod.Core);
            Part(root, "LampPoles", g.LampPoles, Materials.Metal, lod.Detail);
            Part(root, "LampHeads", g.LampHeads, Materials.Lamp, lod.Detail, shadows: false);
            var props = Part(root, "Props", g.Props, Materials.Concrete, lod.Detail);
            Part(root, "Umbrellas", g.Cloth, Materials.Cloth, lod.Detail);

            // physical speed breakers (OSM traffic_calming) - box colliders the suspension rolls over
            foreach (var b in g.BumpSpots)
            {
                var go = new GameObject("SpeedBreaker");
                go.transform.SetParent(root.transform, false);
                go.transform.position = new Vector3(b.Pos.x, Ground.ColliderTop + 0.035f, b.Pos.z);
                go.transform.rotation = Quaternion.Euler(0, b.Yaw, 0);
                var bc = go.AddComponent<BoxCollider>();
                bc.size = new Vector3(b.Width, 0.07f, 0.7f);
                lod.Colliders.Add(bc);
                lod.Detail.Add(go);
            }
            return root;
        }

        static GameObject Part(GameObject root, string name, MeshBuilder mb, Material mat, List<GameObject> group, bool collider = false, bool shadows = true)
        {
            if (mb == null || mb.IsEmpty) return null;
            var go = new GameObject(name);
            go.transform.SetParent(root.transform, false);
            var mesh = mb.ToMesh(name);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = shadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = true;
            if (collider)
            {
                var mc = go.AddComponent<MeshCollider>();
                mc.sharedMesh = mesh;
            }
            group.Add(go);
            return go;
        }
#endif
    }

#if !SHEHAR_HEADLESS
    /// <summary>Two-level detail switch for a streamed chunk: far chunks keep only the core silhouette, no colliders.</summary>
    public sealed class ChunkLod : MonoBehaviour
    {
        public readonly List<GameObject> Core = new List<GameObject>();
        public readonly List<GameObject> Detail = new List<GameObject>();
        public readonly List<Collider> Colliders = new List<Collider>();
        public bool Near { get; private set; } = true;

        public void SetNear(bool near)
        {
            if (near == Near) return;
            Near = near;
            foreach (var d in Detail) if (d != null) d.SetActive(near);
            foreach (var c in Colliders) if (c != null) c.enabled = near;
            foreach (var c in Core)
                if (c != null)
                {
                    var r = c.GetComponent<MeshRenderer>();
                    if (r != null && r.shadowCastingMode != UnityEngine.Rendering.ShadowCastingMode.Off && !near)
                        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                    else if (r != null && near && c.name.StartsWith("Buildings")) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
                }
        }

        void OnDestroy()
        {
            foreach (var mf in GetComponentsInChildren<MeshFilter>(true)) if (mf.sharedMesh != null) Destroy(mf.sharedMesh);
        }
    }
#endif
}
