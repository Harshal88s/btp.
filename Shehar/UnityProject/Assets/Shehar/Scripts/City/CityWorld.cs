// Loads a city (index + global data), builds the ground, and streams chunks around the player with two
// detail levels. JSON parsing and mesh generation run on worker threads; only Unity object creation is on
// the main thread and is budgeted per frame, so driving across the city never shows a loading screen.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Shehar.Core;
using UnityEngine;

namespace Shehar.City
{
    public static class Ground
    {
        public const float ColliderTop = 0.06f;
    }

    public sealed class CityWorld : MonoBehaviour
    {
        public static CityWorld Instance { get; private set; }

        public CityContext Ctx { get; private set; }
        public CityIndex Index { get { return Ctx.Index; } }
        public RoadGraph Graph { get { return Ctx.Graph; } }
        public GlobalData Global { get; private set; }
        public Texture2D MapTexture { get; private set; }
        public float MapMetersPerPixel { get; private set; }
        public TrafficSignalSystem Signals { get; private set; }

        public Transform Focus;
        public float LoadRadius = 700f;
        public float NearRadius = 380f;
        public int MaxConcurrentBuilds = 3;
        public float MainThreadBudgetMs = 6f;

        public readonly List<Vector3> Vendors = new List<Vector3>();
        public int LoadedChunks { get { return loaded.Count; } }
        public int PendingChunks { get { return pending.Count; } }

        sealed class Slot
        {
            public ChunkRef Ref;
            public Task<ChunkGeometry> Task;
            public GameObject Go;
            public ChunkLod Lod;
            public List<Vector3> Vendors, Sidewalks;
            public List<GameObject> Signals = new List<GameObject>();
        }

        readonly Dictionary<int, ChunkRef> chunkRefs = new Dictionary<int, ChunkRef>();
        readonly Dictionary<int, Slot> loaded = new Dictionary<int, Slot>();
        readonly Dictionary<int, Slot> pending = new Dictionary<int, Slot>();
        readonly List<int> tmpKeys = new List<int>();
        List<float[]> waterPolys = new List<float[]>();
        List<Poi> places = new List<Poi>();
        Transform chunkRoot;
        float nextScan;
        string root;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        static int Key(int cx, int cz) { return cx * 4096 + cz; }

        public static string CityRoot(string cityId)
        {
            return Path.Combine(Application.streamingAssetsPath, "Cities", cityId);
        }

        public static bool CityAvailable(string cityId)
        {
            return File.Exists(Path.Combine(CityRoot(cityId), "index.json"));
        }

        /// <summary>Loads index/global data, builds graph, ground, global features and map. progress(0..1, label).</summary>
        public IEnumerator Load(string cityId, Action<float, string> progress)
        {
            Materials.Init();
            root = CityRoot(cityId);
            progress(0.02f, "Reading OpenStreetMap road network...");
            var t1 = Task.Run(() =>
            {
                var idx = JsonUtility.FromJson<CityIndex>(File.ReadAllText(Path.Combine(root, "index.json")));
                var gl = JsonUtility.FromJson<GlobalData>(File.ReadAllText(Path.Combine(root, "global.json")));
                var ctx = new CityContext { Index = idx, RootPath = root };
                ctx.Graph = new RoadGraph(idx);
                ctx.Prepare();
                return (ctx, gl);
            });
            while (!t1.IsCompleted) { yield return null; }
            if (t1.IsFaulted) { Debug.LogException(t1.Exception); progress(1, "Failed to load city data: " + t1.Exception.InnerException.Message); yield break; }
            Ctx = t1.Result.ctx; Global = t1.Result.gl;
            foreach (var c in Index.chunks) chunkRefs[Key(c.cx, c.cz)] = c;
            foreach (var a in Global.areas) if (a.kind == "water") waterPolys.Add(a.pts);
            foreach (var p in Index.pois) if (p.kind == "place") places.Add(p);

            progress(0.25f, "Rasterising city map...");
            var tMap = Task.Run(() => MapRaster.Build(Ctx, Global, 2048));
            chunkRoot = new GameObject("Chunks").transform;
            chunkRoot.SetParent(transform, false);
            BuildGround();
            progress(0.3f, "Building river, parks and campuses...");
            var tGlobal = Task.Run(() =>
            {
                var g = new ChunkGeometry();
                foreach (var a in Global.areas) ChunkBuilder.AddArea(g, a);
                foreach (var w in Global.waterLines)
                {
                    var l = new List<Vector3>();
                    for (int i = 0; i + 1 < w.pts.Length; i += 2) l.Add(new Vector3(w.pts[i], 0, w.pts[i + 1]));
                    if (!g.Areas.TryGetValue("water", out var mb)) g.Areas["water"] = mb = new MeshBuilder();
                    mb.Ribbon(l, w.width, 0, 0.021f, new Color32(255, 255, 255, 255), 20f);
                }
                return g;
            });
            while (!tGlobal.IsCompleted) yield return null;
            if (!tGlobal.IsFaulted)
            {
                var go = ChunkBuilder.Instantiate(tGlobal.Result, transform, 0);
                go.name = "GlobalAreas";
            }
            else Debug.LogException(tGlobal.Exception);

            Signals = gameObject.AddComponent<TrafficSignalSystem>();
            Signals.Init(Ctx);

            while (!tMap.IsCompleted) { progress(0.4f, "Rasterising city map..."); yield return null; }
            if (!tMap.IsFaulted)
            {
                var r = tMap.Result;
                MapTexture = new Texture2D(r.Size, r.Size, TextureFormat.RGBA32, true) { name = "CityMap", wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear, anisoLevel = 2 };
                MapTexture.SetPixels32(r.Pixels);
                MapTexture.Apply(true);
                MapMetersPerPixel = r.MetersPerPixel;
            }
            else Debug.LogException(tMap.Exception);

            // pre-load the chunks around the spawn point so the player starts in a complete street
            Vector3 spawn = new Vector3(Index.spawnX, 0, Index.spawnZ);
            if (Focus == null)
            {
                var lf = new GameObject("LoadFocus").transform; // streaming centre until the player exists
                lf.SetParent(transform, false);
                lf.position = spawn;
                Focus = lf;
            }
            Scan(spawn);
            int total = Mathf.Max(1, pending.Count);
            while (pending.Count > 0)
            {
                Pump(spawn, 50f);
                progress(0.5f + 0.5f * (1f - pending.Count / (float)total), "Streaming " + Index.name + " around " + Index.spawnName + "...");
                yield return null;
            }
            progress(1f, "Ready");
        }

        void BuildGround()
        {
            float m = 1500f;
            float x0 = Index.minX - m, x1 = Index.maxX + m, z0 = Index.minZ - m, z1 = Index.maxZ + m;
            var mb = new MeshBuilder();
            var c = new Color32(255, 255, 255, 255);
            mb.Quad(new Vector3(x0, 0, z0), new Vector3(x0, 0, z1), new Vector3(x1, 0, z1), new Vector3(x1, 0, z0), c);
            var g = new GameObject("Ground");
            g.transform.SetParent(transform, false);
            g.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("Ground");
            var mr = g.AddComponent<MeshRenderer>();
            mr.sharedMaterial = Materials.Ground;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var col = new GameObject("GroundCollider");
            col.transform.SetParent(transform, false);
            var bc = col.AddComponent<BoxCollider>();
            bc.center = new Vector3((x0 + x1) / 2, Ground.ColliderTop - 5f, (z0 + z1) / 2);
            bc.size = new Vector3(x1 - x0, 10f, z1 - z0);
            // invisible boundary of the playable OSM extract
            float pad = 40f, hgt = 60f;
            Wall("BoundaryW", new Vector3(Index.minX - pad, hgt / 2, (Index.minZ + Index.maxZ) / 2), new Vector3(2, hgt, Index.maxZ - Index.minZ + 2 * pad));
            Wall("BoundaryE", new Vector3(Index.maxX + pad, hgt / 2, (Index.minZ + Index.maxZ) / 2), new Vector3(2, hgt, Index.maxZ - Index.minZ + 2 * pad));
            Wall("BoundaryS", new Vector3((Index.minX + Index.maxX) / 2, hgt / 2, Index.minZ - pad), new Vector3(Index.maxX - Index.minX + 2 * pad, hgt, 2));
            Wall("BoundaryN", new Vector3((Index.minX + Index.maxX) / 2, hgt / 2, Index.maxZ + pad), new Vector3(Index.maxX - Index.minX + 2 * pad, hgt, 2));
        }

        void Wall(string name, Vector3 c, Vector3 size)
        {
            var w = new GameObject(name);
            w.transform.SetParent(transform, false);
            w.transform.position = c;
            w.AddComponent<BoxCollider>().size = size;
        }

        void Update()
        {
            if (Ctx == null || Focus == null) return;
            Vector3 p = Focus.position;
            if (Time.unscaledTime > nextScan) { nextScan = Time.unscaledTime + 0.3f; Scan(p); }
            Pump(p, MainThreadBudgetMs);
        }

        void Scan(Vector3 p)
        {
            float cs = Index.chunkSize;
            int r = Mathf.CeilToInt(LoadRadius / cs) + 1;
            int pcx = Mathf.FloorToInt((p.x - Index.minX) / cs), pcz = Mathf.FloorToInt((p.z - Index.minZ) / cs);
            var want = new List<(float d, ChunkRef c)>();
            for (int i = pcx - r; i <= pcx + r; i++)
                for (int j = pcz - r; j <= pcz + r; j++)
                {
                    if (!chunkRefs.TryGetValue(Key(i, j), out var c)) continue;
                    float d = ChunkDist(p, i, j);
                    if (d <= LoadRadius) want.Add((d, c));
                }
            want.Sort((a, b) => a.d.CompareTo(b.d));
            foreach (var (d, c) in want)
            {
                int k = Key(c.cx, c.cz);
                if (loaded.ContainsKey(k) || pending.ContainsKey(k)) continue;
                if (pending.Count >= MaxConcurrentBuilds * 4) break;
                var slot = new Slot { Ref = c };
                string path = Path.Combine(root, "chunks", c.file);
                var ctx = Ctx;
                slot.Task = Task.Run(() => ChunkBuilder.Build(JsonUtility.FromJson<ChunkData>(File.ReadAllText(path)), ctx));
                pending[k] = slot;
            }
            // LOD + unload
            tmpKeys.Clear();
            foreach (var kv in loaded)
            {
                float d = ChunkDist(p, kv.Value.Ref.cx, kv.Value.Ref.cz);
                if (d > LoadRadius + 160f) tmpKeys.Add(kv.Key);
                else if (kv.Value.Lod != null) kv.Value.Lod.SetNear(d <= NearRadius);
            }
            foreach (int k in tmpKeys) Unload(k);
        }

        float ChunkDist(Vector3 p, int cx, int cz)
        {
            float cs = Index.chunkSize;
            float x0 = Index.minX + cx * cs, z0 = Index.minZ + cz * cs;
            float dx = Mathf.Max(0, Mathf.Max(x0 - p.x, p.x - (x0 + cs)));
            float dz = Mathf.Max(0, Mathf.Max(z0 - p.z, p.z - (z0 + cs)));
            return Mathf.Sqrt(dx * dx + dz * dz);
        }

        void Pump(Vector3 p, float budgetMs)
        {
            float start = Time.realtimeSinceStartup;
            while (true)
            {
                int bestKey = -1; float bestD = float.MaxValue;
                foreach (var kv in pending)
                {
                    if (!kv.Value.Task.IsCompleted) continue;
                    float d = ChunkDist(p, kv.Value.Ref.cx, kv.Value.Ref.cz);
                    if (d < bestD) { bestD = d; bestKey = kv.Key; }
                }
                if (bestKey < 0) return;
                var slot = pending[bestKey];
                pending.Remove(bestKey);
                if (slot.Task.IsFaulted) { Debug.LogException(slot.Task.Exception); continue; }
                if (bestD > LoadRadius + 160f) continue; // player moved away meanwhile
                var g = slot.Task.Result;
                slot.Task = null;
                slot.Go = ChunkBuilder.Instantiate(g, chunkRoot, 0);
                slot.Lod = slot.Go.GetComponent<ChunkLod>();
                slot.Lod.SetNear(bestD <= NearRadius);
                slot.Vendors = g.VendorSpots;
                slot.Sidewalks = g.SidewalkSpots;
                Vendors.AddRange(g.VendorSpots);
                foreach (var s in g.SignalSpots)
                {
                    var sg = Signals.CreatePole(s, slot.Go.transform);
                    if (sg != null) slot.Signals.Add(sg);
                }
                loaded[bestKey] = slot;
                if ((Time.realtimeSinceStartup - start) * 1000f > budgetMs) return;
            }
        }

        void Unload(int k)
        {
            var s = loaded[k];
            loaded.Remove(k);
            if (s.Vendors != null) foreach (var v in s.Vendors) Vendors.Remove(v);
            foreach (var sg in s.Signals) Signals.Forget(sg);
            if (s.Go != null) Destroy(s.Go);
        }

        public void ClearAll()
        {
            tmpKeys.Clear(); tmpKeys.AddRange(loaded.Keys);
            foreach (var k in tmpKeys) Unload(k);
            pending.Clear();
        }

        // ------------------------------------------------------------------ queries
        public bool InBounds(Vector3 p, float margin = 0)
        {
            return p.x >= Index.minX - margin && p.x <= Index.maxX + margin && p.z >= Index.minZ - margin && p.z <= Index.maxZ + margin;
        }

        public bool IsChunkLoadedAt(Vector3 p)
        {
            float cs = Index.chunkSize;
            int cx = Mathf.FloorToInt((p.x - Index.minX) / cs), cz = Mathf.FloorToInt((p.z - Index.minZ) / cs);
            int k = Key(cx, cz);
            return loaded.ContainsKey(k) || !chunkRefs.ContainsKey(k);
        }

        /// <summary>Sidewalk sample points from loaded chunks within radius (for pedestrian spawning).</summary>
        public void SidewalkSpotsNear(Vector3 p, float minR, float maxR, List<Vector3> result)
        {
            result.Clear();
            float a = minR * minR, b = maxR * maxR;
            foreach (var s in loaded.Values)
            {
                if (s.Sidewalks == null) continue;
                foreach (var v in s.Sidewalks)
                {
                    float d = (v.x - p.x) * (v.x - p.x) + (v.z - p.z) * (v.z - p.z);
                    if (d >= a && d <= b) result.Add(v);
                }
            }
        }

        public string StreetName(Vector3 p)
        {
            int e = Graph.NearestEdge(p.x, p.z, out float t, out float d, 40f);
            if (e < 0) return "";
            return Graph.RoadOfEdge(e).DisplayName;
        }

        public RoadInfo RoadAt(Vector3 p, out float distance)
        {
            int e = Graph.NearestEdge(p.x, p.z, out float t, out distance, 40f);
            return e < 0 ? null : Graph.RoadOfEdge(e);
        }

        public string ZoneName(Vector3 p)
        {
            Poi best = null; float bd = 1500f * 1500f;
            foreach (var pl in places)
            {
                float d = (pl.x - p.x) * (pl.x - p.x) + (pl.z - p.z) * (pl.z - p.z);
                if (d < bd) { bd = d; best = pl; }
            }
            return best == null ? Index.name : best.name;
        }

        public bool IsWater(Vector3 p)
        {
            var road = RoadAt(p, out float rd);
            if (road != null && rd < road.width * 0.5f + 1.5f) return false; // on a bridge / riverside road
            foreach (var poly in waterPolys)
                if (Triangulator.PointInPolygon(poly, p.x, p.z)) return true;
            foreach (var w in Global.waterLines)
            {
                if (w.width < 10f) continue;
                for (int i = 0; i + 3 < w.pts.Length; i += 2)
                {
                    float d = SegDist(p.x, p.z, w.pts[i], w.pts[i + 1], w.pts[i + 2], w.pts[i + 3]);
                    if (d < w.width * 0.45f) return true;
                }
            }
            return false;
        }

        static float SegDist(float px, float pz, float ax, float az, float bx, float bz)
        {
            float dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
            float t = l2 < 1e-6f ? 0 : Mathf.Clamp01(((px - ax) * dx + (pz - az) * dz) / l2);
            float qx = ax + t * dx - px, qz = az + t * dz - pz;
            return Mathf.Sqrt(qx * qx + qz * qz);
        }

        public Poi NearestPoi(Vector3 p, string kind, float maxDist, bool namedOnly = false)
        {
            Poi best = null; float bd = maxDist * maxDist;
            foreach (var poi in Index.pois)
            {
                if (poi.kind != kind || (namedOnly && string.IsNullOrEmpty(poi.name))) continue;
                float d = (poi.x - p.x) * (poi.x - p.x) + (poi.z - p.z) * (poi.z - p.z);
                if (d < bd) { bd = d; best = poi; }
            }
            return best;
        }

        public Poi Landmark(string name)
        {
            foreach (var l in Index.landmarks) if (l.name == name) return l;
            return null;
        }

        /// <summary>A drivable road position near p (main network) and the heading along that road.</summary>
        public Vector3 RoadPointNear(Vector3 p, out Quaternion rot, float leftOffset = 0f)
        {
            int n = Graph.NearestNode(p.x, p.z, 2000f);
            rot = Quaternion.identity;
            if (n < 0) return new Vector3(p.x, Ground.ColliderTop, p.z);
            Vector3 pos = new Vector3(Graph.X[n], Ground.ColliderTop, Graph.Z[n]);
            for (int k = 0; k < Graph.Degree(n); k++)
            {
                var nb = Graph.GetNeighbor(n, k);
                if (!nb.CarOk) continue;
                Vector3 dir = new Vector3(Graph.X[nb.Node] - pos.x, 0, Graph.Z[nb.Node] - pos.z).normalized;
                rot = Quaternion.LookRotation(dir);
                float w = Graph.RoadOfEdge(nb.Edge).width;
                // India drives on the LEFT: keep left of the centre line on two-way roads
                if (Graph.RoadOfEdge(nb.Edge).oneway == 0) pos += Vector3.Cross(Vector3.up, dir) * -(w * 0.25f + leftOffset);
                pos += dir * Mathf.Min(6f, Graph.EdgeLength[nb.Edge] * 0.4f);
                break;
            }
            return pos;
        }
    }
}
