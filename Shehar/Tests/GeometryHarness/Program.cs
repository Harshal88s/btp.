// Headless run of the real city-generation code over every chunk of a city.
//   dotnet run -c Release -- [city] [exportCenterX exportCenterZ exportRadius]
// Checks: no exceptions, no NaN/Inf vertices, valid indices, sane heights; prints totals and timing.
// Exports: Tools/preview/out/<city>_region.json (meshes for the WebGL preview) and <city>_map.ppm (map raster).
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Shehar.City;
using Shehar.Core;
using UnityEngine;

static class Program
{
    static int Main(string[] args)
    {
        string city = args.Length > 0 ? args[0] : "pune";
        string root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
        string dir = Path.Combine(root, "UnityProject/Assets/StreamingAssets/Cities", city);
        string outDir = Path.Combine(root, "Tools/preview/out");
        Directory.CreateDirectory(outDir);

        var sw = Stopwatch.StartNew();
        var idx = JsonUtility.FromJson<CityIndex>(File.ReadAllText(Path.Combine(dir, "index.json")));
        var gl = JsonUtility.FromJson<GlobalData>(File.ReadAllText(Path.Combine(dir, "global.json")));
        var ctx = new CityContext { Index = idx, RootPath = dir };
        ctx.Graph = new RoadGraph(idx);
        ctx.Prepare();
        Console.WriteLine($"index + graph: {sw.ElapsedMilliseconds} ms");

        float cx = args.Length > 3 ? float.Parse(args[1], CultureInfo.InvariantCulture) : idx.spawnX;
        float cz = args.Length > 3 ? float.Parse(args[2], CultureInfo.InvariantCulture) : idx.spawnZ;
        float rad = args.Length > 3 ? float.Parse(args[3], CultureInfo.InvariantCulture) : 420f;

        // ---------------- build every chunk in parallel (as the game does on worker threads)
        sw.Restart();
        var results = new ConcurrentBag<ChunkGeometry>();
        var errors = new ConcurrentBag<string>();
        long verts = 0, tris = 0, buildings = 0, signals = 0, bumps = 0, vendors = 0, sidewalkSpots = 0;
        int bad = 0;
        var times = new ConcurrentBag<double>();
        Parallel.ForEach(idx.chunks, c =>
        {
            var t = Stopwatch.StartNew();
            try
            {
                var data = JsonUtility.FromJson<ChunkData>(File.ReadAllText(Path.Combine(dir, "chunks", c.file)));
                var g = ChunkBuilder.Build(data, ctx);
                times.Add(t.Elapsed.TotalMilliseconds);
                int b = Validate(g);
                System.Threading.Interlocked.Add(ref bad, b);
                results.Add(g);
            }
            catch (Exception ex) { errors.Add(c.file + ": " + ex); }
        });
        foreach (var g in results)
        {
            foreach (var mb in All(g)) { verts += mb.V.Count; tris += mb.T.Count / 3; }
            buildings += g.BuildingCount; signals += g.SignalSpots.Count; bumps += g.BumpSpots.Count; vendors += g.VendorSpots.Count; sidewalkSpots += g.SidewalkSpots.Count;
        }
        var tl = times.OrderBy(x => x).ToList();
        Console.WriteLine($"built {results.Count}/{idx.chunks.Length} chunks in {sw.ElapsedMilliseconds} ms wall; per chunk median {tl[tl.Count / 2]:F1} ms, p95 {tl[(int)(tl.Count * 0.95)]:F1} ms, max {tl.Last():F1} ms");
        Console.WriteLine($"geometry: {verts:N0} vertices, {tris:N0} triangles, {buildings:N0} buildings, {signals} signal poles, {bumps} speed breakers, {vendors} vendor stalls, {sidewalkSpots:N0} pedestrian spots");
        foreach (var e in errors.Take(5)) Console.WriteLine("ERROR " + e);
        Console.WriteLine(bad == 0 ? "validation: all vertices finite, indices in range, heights within [-1, 200] m" : $"validation: {bad} problems");

        // global areas
        var gg = new ChunkGeometry();
        foreach (var a in gl.areas) ChunkBuilder.AddArea(gg, a);
        Console.WriteLine($"global areas: {gl.areas.Length} polygons -> {gg.Areas.Values.Sum(m => m.V.Count):N0} vertices");

        // ---------------- export a region for the browser preview
        var region = results.Where(g =>
        {
            float x0 = idx.minX + g.Cx * idx.chunkSize + idx.chunkSize / 2f, z0 = idx.minZ + g.Cz * idx.chunkSize + idx.chunkSize / 2f;
            return Math.Abs(x0 - cx) < rad + idx.chunkSize / 2 && Math.Abs(z0 - cz) < rad + idx.chunkSize / 2;
        }).ToList();
        region.Add(gg);
        var sb = new StringBuilder();
        sb.Append("{\"center\":[").Append(F(cx)).Append(',').Append(F(cz)).Append("],\"radius\":").Append(F(rad)).Append(",\"groups\":[");
        bool first = true;
        foreach (var (name, pick) in Groups())
        {
            var mbs = region.Select(pick).Where(m => m != null && !m.IsEmpty).ToList();
            if (mbs.Count == 0) continue;
            if (!first) sb.Append(',');
            first = false;
            sb.Append("{\"name\":\"").Append(name).Append("\",\"pos\":[");
            int baseIdx = 0; var idxs = new StringBuilder(); var cols = new StringBuilder();
            bool fp = true;
            foreach (var mb in mbs)
            {
                for (int i = 0; i < mb.V.Count; i++)
                {
                    var v = mb.V[i]; var c = mb.C[i];
                    if (!fp) { sb.Append(','); cols.Append(','); }
                    fp = false;
                    // Unity (left-handed) -> three.js (right-handed): mirror z so north stays north
                    sb.Append(F(v.x - cx)).Append(',').Append(F(v.y)).Append(',').Append(F(-(v.z - cz)));
                    cols.Append(c.r).Append(',').Append(c.g).Append(',').Append(c.b);
                }
                // mirroring z (handedness change) must be paired with reversed winding: (a,b,c) -> (a,c,b)
                for (int ti = 0; ti + 2 < mb.T.Count; ti += 3)
                {
                    if (idxs.Length > 0) idxs.Append(',');
                    idxs.Append(mb.T[ti] + baseIdx).Append(',').Append(mb.T[ti + 2] + baseIdx).Append(',').Append(mb.T[ti + 1] + baseIdx);
                }
                baseIdx += mb.V.Count;
            }
            sb.Append("],\"col\":[").Append(cols).Append("],\"idx\":[").Append(idxs).Append("]}");
        }
        sb.Append("],\"landmarks\":[");
        sb.Append(string.Join(",", idx.landmarks.Where(l => Math.Abs(l.x - cx) < rad && Math.Abs(l.z - cz) < rad)
            .Select(l => "{\"name\":\"" + l.name + "\",\"x\":" + F(l.x - cx) + ",\"z\":" + F(-(l.z - cz)) + "}")));
        sb.Append("]}");
        string regionPath = Path.Combine(outDir, city + "_region.json");
        File.WriteAllText(regionPath, sb.ToString());
        Console.WriteLine($"exported {region.Count - 1} chunks around ({cx:F0},{cz:F0}) r={rad} -> {regionPath} ({new FileInfo(regionPath).Length / 1e6:F1} MB)");

        // ---------------- map raster (same code the game uses for the minimap / full map)
        sw.Restart();
        var map = MapRaster.Build(ctx, gl, 2048);
        string ppm = Path.Combine(outDir, city + "_map.ppm");
        using (var f = File.Create(ppm))
        {
            var header = Encoding.ASCII.GetBytes($"P6\n{map.Size} {map.Size}\n255\n");
            f.Write(header, 0, header.Length);
            var row = new byte[map.Size * 3];
            for (int y = map.Size - 1; y >= 0; y--) // texture row 0 = south; image row 0 = north
            {
                for (int x = 0; x < map.Size; x++) { var c = map.Pixels[y * map.Size + x]; row[3 * x] = c.r; row[3 * x + 1] = c.g; row[3 * x + 2] = c.b; }
                f.Write(row, 0, row.Length);
            }
        }
        Console.WriteLine($"map raster {map.Size}px ({map.MetersPerPixel:F2} m/px) in {sw.ElapsedMilliseconds} ms -> {ppm}");
        return errors.IsEmpty && bad == 0 ? 0 : 1;
    }

    static string F(float v) => v.ToString("0.##", CultureInfo.InvariantCulture);

    static IEnumerable<MeshBuilder> All(ChunkGeometry g)
    {
        foreach (var f in g.Facades) yield return f;
        foreach (var a in g.Areas.Values) yield return a;
        yield return g.Roofs; yield return g.RoofProps; yield return g.Temples; yield return g.Asphalt; yield return g.AsphaltMajor;
        yield return g.Markings; yield return g.Sidewalks; yield return g.Curbs; yield return g.Parapets; yield return g.Bumps;
        yield return g.RailBed; yield return g.Viaduct; yield return g.Bark; yield return g.Leaves; yield return g.LampPoles;
        yield return g.LampHeads; yield return g.Props; yield return g.Cloth;
    }

    static IEnumerable<(string, Func<ChunkGeometry, MeshBuilder>)> Groups()
    {
        for (int i = 0; i < 4; i++) { int k = i; yield return ("facade" + k, g => g.Facades[k]); }
        foreach (var kind in new[] { "residential", "commercial", "industrial", "campus", "military", "railway", "cemetery", "construction", "parking", "grass", "pitch", "park", "forest", "sand", "water" })
            yield return ("area_" + kind, g => g.Areas.TryGetValue(kind, out var m) ? m : null);
        yield return ("roofs", g => g.Roofs); yield return ("roofprops", g => g.RoofProps); yield return ("temples", g => g.Temples);
        yield return ("asphalt", g => g.Asphalt); yield return ("asphaltMajor", g => g.AsphaltMajor); yield return ("markings", g => g.Markings);
        yield return ("sidewalks", g => g.Sidewalks); yield return ("curbs", g => g.Curbs); yield return ("parapets", g => g.Parapets);
        yield return ("bumps", g => g.Bumps); yield return ("rail", g => g.RailBed); yield return ("viaduct", g => g.Viaduct);
        yield return ("bark", g => g.Bark); yield return ("leaves", g => g.Leaves); yield return ("lamppoles", g => g.LampPoles);
        yield return ("lampheads", g => g.LampHeads); yield return ("props", g => g.Props); yield return ("cloth", g => g.Cloth);
    }

    static int Validate(ChunkGeometry g)
    {
        int bad = 0;
        foreach (var mb in All(g))
        {
            foreach (var v in mb.V)
                if (float.IsNaN(v.x) || float.IsNaN(v.y) || float.IsNaN(v.z) || float.IsInfinity(v.x) || float.IsInfinity(v.z) || v.y < -1f || v.y > 200f) bad++;
            foreach (int t in mb.T) if (t < 0 || t >= mb.V.Count) bad++;
            if (mb.T.Count % 3 != 0 || mb.V.Count != mb.UV.Count || mb.V.Count != mb.C.Count) bad++;
        }
        return bad;
    }
}
