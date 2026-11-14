// Core tests: load the real OSM-derived city data, then check graph connectivity, routing between real
// landmarks, triangulation of every building/area polygon, and chunk/index consistency.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using Shehar.Core;

static class Program
{
    static int failures = 0;
    static void Check(bool ok, string what)
    {
        Console.WriteLine((ok ? "  PASS " : "  FAIL ") + what);
        if (!ok) failures++;
    }

    static T Load<T>(string path) =>
        JsonSerializer.Deserialize<T>(File.ReadAllText(path), new JsonSerializerOptions { IncludeFields = true });

    static int Main(string[] args)
    {
        string city = args.Length > 0 ? args[0] : "pune";
        string dir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../UnityProject/Assets/StreamingAssets/Cities", city));
        if (args.Length > 1) dir = args[1];
        Console.WriteLine("City data: " + dir);
        var sw = Stopwatch.StartNew();
        var idx = Load<CityIndex>(Path.Combine(dir, "index.json"));
        var gl = Load<GlobalData>(Path.Combine(dir, "global.json"));
        Console.WriteLine($"Loaded index in {sw.ElapsedMilliseconds} ms: {idx.nodeX.Length} nodes, {idx.edgeA.Length} edges, {idx.roads.Length} roads, {idx.pois.Length} POIs, {idx.landmarks.Length} landmarks");

        Console.WriteLine("[index]");
        Check(idx.nodeX.Length == idx.nodeZ.Length && idx.nodeX.Length == idx.nodeFlags.Length, "node arrays aligned");
        Check(idx.edgeA.Length == idx.edgeB.Length && idx.edgeA.Length == idx.edgeRoad.Length && idx.edgeA.Length == idx.edgeDir.Length, "edge arrays aligned");
        Check(idx.edgeA.All(a => a >= 0 && a < idx.nodeX.Length) && idx.edgeB.All(b => b >= 0 && b < idx.nodeX.Length), "edge endpoints valid");
        Check(idx.edgeRoad.All(r => r >= 0 && r < idx.roads.Length), "edge road refs valid");
        Check(idx.chunks.All(c => File.Exists(Path.Combine(dir, "chunks", c.file))), "all chunk files exist");
        var geo = new GeoFrame(idx);
        geo.ToLocal(18.5195, 73.8553, out float swx, out float swz); // Shaniwar Wada published coordinates (approx.)
        var sw2 = idx.landmarks.First(l => l.name == "Shaniwar Wada");
        float err = (float)Math.Sqrt((swx - sw2.x) * (swx - sw2.x) + (swz - sw2.z) * (swz - sw2.z));
        Console.WriteLine($"     Shaniwar Wada: data ({sw2.x:F0},{sw2.z:F0}) vs reference lat/lon -> ({swx:F0},{swz:F0}); offset {err:F0} m");
        Check(err < 150, "projection round-trip places Shaniwar Wada within 150 m of its reference coordinate");

        Console.WriteLine("[graph]");
        sw.Restart();
        var g = new RoadGraph(idx);
        Console.WriteLine($"     graph built in {sw.ElapsedMilliseconds} ms");
        int main = Enumerable.Range(0, g.NodeCount).Count(g.IsMain);
        Check(main > 15000, $"main connected network has {main} nodes");

        var pairs = new (string, string)[] {
            ("Pune Railway Station", "Savitribai Phule Pune University"),
            ("Deccan Gymkhana", "Shaniwar Wada"),
            ("Swargate Bus Stand", "Fergusson College"),
            ("Shivajinagar Railway Station", "Dagdusheth Halwai Ganpati"),
            ("Fergusson College", "Pune Railway Station"),
        };
        foreach (var (from, to) in pairs)
        {
            var a = idx.landmarks.First(l => l.name == from);
            var b = idx.landmarks.First(l => l.name == to);
            int na = g.NearestNode(a.x, a.z), nb = g.NearestNode(b.x, b.z);
            sw.Restart();
            var path = g.FindPath(na, nb, car: true);
            long ms = sw.ElapsedMilliseconds;
            float straight = (float)Math.Sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
            bool ok = path != null;
            float len = ok ? g.PathLength(path) : 0;
            var names = ok ? path.Zip(path.Skip(1), (u, v) => g.EdgeBetween(u, v)).Where(e => e >= 0)
                .Select(e => g.RoadOfEdge(e).DisplayName).Where(n => n != "").Distinct().Take(6) : Enumerable.Empty<string>();
            Console.WriteLine($"     {from} -> {to}: straight {straight:F0} m, route {len:F0} m, {ms} ms via {string.Join(" > ", names)}");
            Check(ok && len >= straight && len < straight * 2.2f, $"car route {from} -> {to} exists with plausible length");
            // one-way legality: every step must be car-legal
            bool legal = ok;
            for (int i = 1; ok && i < path.Count; i++)
            {
                bool found = false;
                for (int k = 0; k < g.Degree(path[i - 1]); k++)
                {
                    var n = g.GetNeighbor(path[i - 1], k);
                    if (n.Node == path[i] && n.CarOk) found = true;
                }
                legal &= found;
            }
            Check(legal, "route respects one-way streets");
        }
        int ne = g.NearestEdge(sw2.x, sw2.z, out float t, out float d, 200);
        Check(ne >= 0, $"nearest road to Shaniwar Wada: {(ne >= 0 ? g.RoadOfEdge(ne).DisplayName : "-")} ({d:F0} m)");
        var fc = idx.roads.Where(r => r.alt == "FC Road").ToList();
        var jm = idx.roads.Where(r => r.alt == "JM Road").ToList();
        Check(fc.Count > 0 && jm.Count > 0, $"FC Road ({fc.Count} ways) and JM Road ({jm.Count} ways) present");

        Console.WriteLine("[polygons]");
        int polys = 0, fallback = 0, empty = 0, maxN = 0; double areaErr = 0;
        sw.Restart();
        var tris = new List<int>();
        IEnumerable<float[]> all = gl.areas.Select(x => x.pts);
        foreach (var c in idx.chunks)
        {
            var ch = Load<ChunkData>(Path.Combine(dir, "chunks", c.file));
            all = all.Concat(ch.buildings.Select(b => b.pts).Concat(ch.areas.Select(a => a.pts)).ToList());
            foreach (var p in ch.roads) if (p.nodes.Length < 2 || p.road < 0 || p.road >= idx.roads.Length) failures++;
        }
        foreach (var p in all)
        {
            polys++; tris.Clear(); maxN = Math.Max(maxN, p.Length / 2);
            if (!Triangulator.Triangulate(p, tris)) fallback++;
            if (tris.Count == 0) { empty++; continue; }
            double sum = 0;
            for (int i = 0; i < tris.Count; i += 3)
            {
                float[] tp = { p[2 * tris[i]], p[2 * tris[i] + 1], p[2 * tris[i + 1]], p[2 * tris[i + 1] + 1], p[2 * tris[i + 2]], p[2 * tris[i + 2] + 1] };
                sum += Triangulator.SignedArea(tp);
            }
            double A = Math.Abs(Triangulator.SignedArea(p));
            if (A > 1) areaErr = Math.Max(areaErr, Math.Abs(sum - A) / A);
        }
        Console.WriteLine($"     {polys} polygons (largest {maxN} vertices) triangulated in {sw.ElapsedMilliseconds} ms; {fallback} needed fallback, {empty} empty");
        Check(empty == 0, "every polygon produced triangles");
        Check(fallback < polys * 0.01, "fewer than 1% of polygons needed the degenerate fallback");
        Console.WriteLine($"     worst area mismatch for clean triangulations incl. fallback: {areaErr:P1}");

        Console.WriteLine(failures == 0 ? "ALL CORE TESTS PASSED" : failures + " FAILURE(S)");
        return failures == 0 ? 0 : 1;
    }
}
