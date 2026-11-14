// Drivable road network built from OSM ways: adjacency, spatial lookup and A* routing (GPS + AI).
// Pure C# (no UnityEngine) so it can be unit-tested against the real Pune data outside the engine.
using System;
using System.Collections.Generic;

namespace Shehar.Core
{
    public struct Neighbor
    {
        public int Node;      // neighbouring graph node
        public int Edge;      // edge index into CityIndex.edgeA/edgeB
        public bool CarOk;    // true when a car may legally drive Node(from) -> Node (respects one-way)
    }

    public sealed class RoadGraph
    {
        public readonly CityIndex Index;
        public readonly int NodeCount;
        public readonly float[] X, Z;
        public readonly int[] Flags;
        public readonly float[] EdgeLength;

        readonly int[] adjStart;
        readonly Neighbor[] adj;
        readonly float maxSpeed;

        const float Cell = 50f;
        readonly Dictionary<long, List<int>> nodeGrid = new Dictionary<long, List<int>>();
        readonly Dictionary<long, List<int>> edgeGrid = new Dictionary<long, List<int>>();

        public RoadGraph(CityIndex index)
        {
            Index = index;
            X = index.nodeX; Z = index.nodeZ; Flags = index.nodeFlags;
            NodeCount = X.Length;
            int e = index.edgeA.Length;
            EdgeLength = new float[e];
            var degree = new int[NodeCount + 1];
            for (int i = 0; i < e; i++)
            {
                int a = index.edgeA[i], b = index.edgeB[i];
                float dx = X[b] - X[a], dz = Z[b] - Z[a];
                EdgeLength[i] = Math.Max(0.1f, (float)Math.Sqrt(dx * dx + dz * dz));
                degree[a]++; degree[b]++;
            }
            adjStart = new int[NodeCount + 1];
            for (int i = 0; i < NodeCount; i++) adjStart[i + 1] = adjStart[i] + degree[i];
            adj = new Neighbor[adjStart[NodeCount]];
            var fill = new int[NodeCount];
            for (int i = 0; i < e; i++)
            {
                int a = index.edgeA[i], b = index.edgeB[i], dir = index.edgeDir[i];
                adj[adjStart[a] + fill[a]++] = new Neighbor { Node = b, Edge = i, CarOk = (dir & 1) != 0 };
                adj[adjStart[b] + fill[b]++] = new Neighbor { Node = a, Edge = i, CarOk = (dir & 2) != 0 };
            }
            maxSpeed = 1f;
            foreach (var r in index.roads) if (r.drivable == 1) maxSpeed = Math.Max(maxSpeed, r.speed);

            for (int n = 0; n < NodeCount; n++)
                if (Degree(n) > 0) Add(nodeGrid, Key(X[n], Z[n]), n);
            for (int i = 0; i < e; i++)
            {
                int a = index.edgeA[i], b = index.edgeB[i];
                int x0 = CellOf(Math.Min(X[a], X[b])), x1 = CellOf(Math.Max(X[a], X[b]));
                int z0 = CellOf(Math.Min(Z[a], Z[b])), z1 = CellOf(Math.Max(Z[a], Z[b]));
                for (int cx = x0; cx <= x1; cx++)
                    for (int cz = z0; cz <= z1; cz++)
                        Add(edgeGrid, Pack(cx, cz), i);
            }
        }

        static int CellOf(float v) { return (int)Math.Floor(v / Cell); }
        static long Pack(int cx, int cz) { return ((long)cx << 32) ^ (uint)cz; }
        static long Key(float x, float z) { return Pack(CellOf(x), CellOf(z)); }
        static void Add(Dictionary<long, List<int>> g, long k, int v)
        {
            if (!g.TryGetValue(k, out var l)) g[k] = l = new List<int>(4);
            l.Add(v);
        }

        public int Degree(int n) { return adjStart[n + 1] - adjStart[n]; }

        public Neighbor GetNeighbor(int n, int i) { return adj[adjStart[n] + i]; }

        public bool IsMain(int n) { return (Flags[n] & NodeFlags.MainNetwork) != 0; }

        public RoadInfo RoadOfEdge(int edge) { return Index.roads[Index.edgeRoad[edge]]; }

        public float Dist(int a, int b)
        {
            float dx = X[b] - X[a], dz = Z[b] - Z[a];
            return (float)Math.Sqrt(dx * dx + dz * dz);
        }

        /// <summary>Nearest node with at least one drivable edge. Returns -1 if none within maxDist.</summary>
        public int NearestNode(float x, float z, float maxDist = 400f, bool mainNetworkOnly = true, Func<int, bool> filter = null)
        {
            int best = -1; float bestD = maxDist * maxDist;
            int r = (int)Math.Ceiling(maxDist / Cell);
            int cx = CellOf(x), cz = CellOf(z);
            for (int ring = 0; ring <= r; ring++)
            {
                for (int i = cx - ring; i <= cx + ring; i++)
                    for (int j = cz - ring; j <= cz + ring; j++)
                    {
                        if (Math.Abs(i - cx) != ring && Math.Abs(j - cz) != ring) continue;
                        if (!nodeGrid.TryGetValue(Pack(i, j), out var list)) continue;
                        foreach (int n in list)
                        {
                            if (mainNetworkOnly && !IsMain(n)) continue;
                            if (filter != null && !filter(n)) continue;
                            float dx = X[n] - x, dz = Z[n] - z, d = dx * dx + dz * dz;
                            if (d < bestD) { bestD = d; best = n; }
                        }
                    }
                // once a hit is closer than the next ring can possibly be, stop
                if (best >= 0 && Math.Sqrt(bestD) < ring * Cell) break;
            }
            return best;
        }

        /// <summary>Nearest edge to a point; returns edge index or -1, with the projection parameter t (0..1, from edgeA to edgeB).</summary>
        public int NearestEdge(float x, float z, out float t, out float dist, float maxDist = 60f)
        {
            t = 0; dist = float.MaxValue;
            int best = -1;
            int r = (int)Math.Ceiling(maxDist / Cell);
            int cx = CellOf(x), cz = CellOf(z);
            for (int i = cx - r; i <= cx + r; i++)
                for (int j = cz - r; j <= cz + r; j++)
                {
                    if (!edgeGrid.TryGetValue(Pack(i, j), out var list)) continue;
                    foreach (int e in list)
                    {
                        float d = PointSegDist(x, z, Index.edgeA[e], Index.edgeB[e], out float tt);
                        if (d < dist) { dist = d; best = e; t = tt; }
                    }
                }
            if (dist > maxDist) return -1;
            return best;
        }

        public float PointSegDist(float px, float pz, int a, int b, out float t)
        {
            float ax = X[a], az = Z[a], bx = X[b], bz = Z[b];
            float dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
            t = l2 < 1e-6f ? 0 : Math.Max(0, Math.Min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
            float qx = ax + t * dx - px, qz = az + t * dz - pz;
            return (float)Math.Sqrt(qx * qx + qz * qz);
        }

        // ------------------------------------------------------------------ A*
        float[] gScore; int[] cameFrom; int[] stamp; int curStamp;

        /// <summary>
        /// Fastest route (travel time using per-road speed) between two nodes.
        /// car = true respects one-way restrictions. Returns node list (start..goal) or null.
        /// </summary>
        public List<int> FindPath(int start, int goal, bool car = true, int maxExpanded = 200000)
        {
            if (start < 0 || goal < 0) return null;
            if (gScore == null) { gScore = new float[NodeCount]; cameFrom = new int[NodeCount]; stamp = new int[NodeCount]; }
            curStamp++;
            var open = new MinHeap(256);
            gScore[start] = 0; cameFrom[start] = -1; stamp[start] = curStamp;
            open.Push(start, Heuristic(start, goal));
            int expanded = 0;
            while (open.Count > 0)
            {
                int u = open.Pop(out float f);
                if (u == goal) return Reconstruct(goal);
                float gu = gScore[u];
                if (f - Heuristic(u, goal) > gu + 1e-3f) continue; // stale heap entry
                if (++expanded > maxExpanded) break;
                for (int k = adjStart[u]; k < adjStart[u + 1]; k++)
                {
                    var nb = adj[k];
                    if (car && !nb.CarOk) continue;
                    var road = Index.roads[Index.edgeRoad[nb.Edge]];
                    float speed = Math.Max(10, road.speed);
                    float cost = EdgeLength[nb.Edge] / speed * 3.6f;          // seconds
                    if (road.rank <= 1) cost *= 1.6f;                          // avoid service lanes / parking aisles
                    if ((Flags[nb.Node] & NodeFlags.TrafficSignal) != 0) cost += 8f; // expected signal wait
                    float g = gu + cost;
                    int v = nb.Node;
                    if (stamp[v] != curStamp || g < gScore[v])
                    {
                        stamp[v] = curStamp; gScore[v] = g; cameFrom[v] = u;
                        open.Push(v, g + Heuristic(v, goal));
                    }
                }
            }
            return null;
        }

        float Heuristic(int a, int b) { return Dist(a, b) / maxSpeed * 3.6f; }

        List<int> Reconstruct(int goal)
        {
            var path = new List<int>();
            for (int n = goal; n != -1; n = cameFrom[n]) path.Add(n);
            path.Reverse();
            return path;
        }

        public float PathLength(List<int> path)
        {
            float len = 0;
            for (int i = 1; i < path.Count; i++) len += Dist(path[i - 1], path[i]);
            return len;
        }

        /// <summary>Edge connecting two adjacent nodes (or -1).</summary>
        public int EdgeBetween(int a, int b)
        {
            for (int k = adjStart[a]; k < adjStart[a + 1]; k++) if (adj[k].Node == b) return adj[k].Edge;
            return -1;
        }

        sealed class MinHeap
        {
            int[] items; float[] keys; public int Count;
            public MinHeap(int cap) { items = new int[cap]; keys = new float[cap]; }
            public void Push(int item, float key)
            {
                if (Count == items.Length) { Array.Resize(ref items, Count * 2); Array.Resize(ref keys, Count * 2); }
                int i = Count++;
                while (i > 0)
                {
                    int p = (i - 1) >> 1;
                    if (keys[p] <= key) break;
                    items[i] = items[p]; keys[i] = keys[p]; i = p;
                }
                items[i] = item; keys[i] = key;
            }
            public int Pop(out float key)
            {
                int top = items[0]; key = keys[0];
                int last = items[--Count]; float lk = keys[Count];
                int i = 0;
                while (true)
                {
                    int c = 2 * i + 1;
                    if (c >= Count) break;
                    if (c + 1 < Count && keys[c + 1] < keys[c]) c++;
                    if (keys[c] >= lk) break;
                    items[i] = items[c]; keys[i] = keys[c]; i = c;
                }
                items[i] = last; keys[i] = lk;
                return top;
            }
        }
    }
}
