// Traffic signals at the real OSM `highway=traffic_signals` nodes. Signals within ~45 m are clustered into one
// junction controller; each controller alternates the "major axis" (direction of its highest-ranked road) and
// the cross axis. AI traffic and the Driving-Simulator rule checker query StateFor().
using System.Collections.Generic;
using Shehar.Core;
using UnityEngine;

namespace Shehar.City
{
    public enum SignalLight { Green, Amber, Red, None }

    public sealed class TrafficSignalSystem : MonoBehaviour
    {
        public const float GreenTime = 15f, AmberTime = 3f;
        const float Cycle = 2 * (GreenTime + AmberTime);

        CityContext ctx;
        readonly Dictionary<int, int> nodeCluster = new Dictionary<int, int>();
        readonly List<Vector2> clusterAxis = new List<Vector2>();
        readonly List<float> clusterOffset = new List<float>();
        readonly List<SignalPole> poles = new List<SignalPole>();
        float nextVisual;

        public int SignalCount { get { return nodeCluster.Count; } }

        public void Init(CityContext c)
        {
            ctx = c;
            var g = c.Graph;
            var sig = new List<int>();
            for (int n = 0; n < g.NodeCount; n++)
                if ((g.Flags[n] & NodeFlags.TrafficSignal) != 0 && g.Degree(n) > 0) sig.Add(n);
            var clusterOf = new int[sig.Count];
            for (int i = 0; i < sig.Count; i++) clusterOf[i] = -1;
            for (int i = 0; i < sig.Count; i++)
            {
                if (clusterOf[i] >= 0) continue;
                int cid = clusterAxis.Count;
                clusterOf[i] = cid;
                // flood-fill neighbours within 45 m
                var stack = new Stack<int>(); stack.Push(i);
                int bestRank = -1; Vector2 axis = Vector2.up;
                while (stack.Count > 0)
                {
                    int u = stack.Pop();
                    int nu = sig[u];
                    for (int k = 0; k < g.Degree(nu); k++)
                    {
                        var nb = g.GetNeighbor(nu, k);
                        var road = g.RoadOfEdge(nb.Edge);
                        if (road.rank > bestRank)
                        {
                            bestRank = road.rank;
                            axis = new Vector2(g.X[nb.Node] - g.X[nu], g.Z[nb.Node] - g.Z[nu]).normalized;
                        }
                    }
                    for (int j = 0; j < sig.Count; j++)
                        if (clusterOf[j] < 0 && g.Dist(nu, sig[j]) < 45f) { clusterOf[j] = cid; stack.Push(j); }
                }
                clusterAxis.Add(axis);
                clusterOffset.Add((cid * 7.31f) % Cycle);
            }
            for (int i = 0; i < sig.Count; i++) nodeCluster[sig[i]] = clusterOf[i];
        }

        public bool HasSignal(int node) { return nodeCluster.ContainsKey(node); }

        /// <summary>Light shown to a vehicle travelling in travelDir through a signal node.</summary>
        public SignalLight StateFor(int node, Vector3 travelDir)
        {
            if (!nodeCluster.TryGetValue(node, out int c)) return SignalLight.None;
            Vector2 d = new Vector2(travelDir.x, travelDir.z).normalized;
            bool major = Mathf.Abs(Vector2.Dot(d, clusterAxis[c])) >= 0.7071f;
            return PhaseLight(c, major);
        }

        SignalLight PhaseLight(int cluster, bool major)
        {
            float t = (Time.time + clusterOffset[cluster]) % Cycle;
            if (!major) t = (t + GreenTime + AmberTime) % Cycle;
            if (t < GreenTime) return SignalLight.Green;
            if (t < GreenTime + AmberTime) return SignalLight.Amber;
            return SignalLight.Red;
        }

        public float SecondsToChange(int node, Vector3 travelDir)
        {
            if (!nodeCluster.TryGetValue(node, out int c)) return 0;
            Vector2 d = new Vector2(travelDir.x, travelDir.z).normalized;
            bool major = Mathf.Abs(Vector2.Dot(d, clusterAxis[c])) >= 0.7071f;
            float t = (Time.time + clusterOffset[c]) % Cycle;
            if (!major) t = (t + GreenTime + AmberTime) % Cycle;
            if (t < GreenTime) return GreenTime - t;
            if (t < GreenTime + AmberTime) return GreenTime + AmberTime - t;
            return Cycle - t;
        }

        // ------------------------------------------------------------------ visuals
        sealed class SignalPole
        {
            public GameObject Go; public int Cluster;
            public MeshRenderer[] MajorLamps = new MeshRenderer[3], MinorLamps = new MeshRenderer[3];
            public SignalLight LastMajor = SignalLight.None, LastMinor = SignalLight.None;
        }

        public GameObject CreatePole(PropSpot s, Transform parent)
        {
            if (!nodeCluster.TryGetValue(s.Node, out int c)) return null;
            var axis = clusterAxis[c];
            Vector3 major = new Vector3(axis.x, 0, axis.y);
            Vector3 side = Quaternion.Euler(0, s.Yaw, 0) * Vector3.right;
            // poles stand on the LEFT kerb (India drives on the left)
            Vector3 pos = s.Pos - side * (s.Width * 0.5f + 1.2f);
            var go = new GameObject("Signal");
            go.transform.SetParent(parent, false);
            go.transform.position = new Vector3(pos.x, 0, pos.z);
            go.transform.rotation = Quaternion.LookRotation(major);

            var mb = new MeshBuilder();
            var dark = new Color32(40, 40, 42, 255);
            mb.Cylinder(new Vector3(0, 2.2f, 0), Vector3.up, 0.08f, 4.4f, 6, dark, false);
            mb.Box(new Vector3(0, 4.6f, 0), new Vector3(0.55f, 1.3f, 0.55f), dark);
            Part(go, "Pole", mb, Materials.Metal);
            var pole = new SignalPole { Go = go, Cluster = c };
            for (int i = 0; i < 3; i++)
            {
                float y = 5.05f - i * 0.42f;
                pole.MajorLamps[i] = Lamp(go, new[] { new Vector3(0, y, 0.29f), new Vector3(0, y, -0.29f) }, true);
                pole.MinorLamps[i] = Lamp(go, new[] { new Vector3(0.29f, y, 0), new Vector3(-0.29f, y, 0) }, false);
            }
            poles.Add(pole);
            UpdatePole(pole, true);
            return go;
        }

        MeshRenderer Lamp(GameObject parent, Vector3[] at, bool facesZ)
        {
            var mb = new MeshBuilder();
            foreach (var p in at)
                mb.Box(p, facesZ ? new Vector3(0.26f, 0.26f, 0.05f) : new Vector3(0.05f, 0.26f, 0.26f), new Color32(255, 255, 255, 255));
            return Part(parent, "Lamp", mb, Materials.SignalOff);
        }

        static MeshRenderer Part(GameObject parent, string name, MeshBuilder mb, Material m)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh(name);
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return r;
        }

        public void Forget(GameObject go)
        {
            poles.RemoveAll(p => p.Go == go);
        }

        void Update()
        {
            if (Time.time < nextVisual) return;
            nextVisual = Time.time + 0.2f;
            foreach (var p in poles) UpdatePole(p, false);
        }

        void UpdatePole(SignalPole p, bool force)
        {
            if (p.Go == null) return;
            var a = PhaseLight(p.Cluster, true);
            var b = PhaseLight(p.Cluster, false);
            if (force || a != p.LastMajor) { Apply(p.MajorLamps, a); p.LastMajor = a; }
            if (force || b != p.LastMinor) { Apply(p.MinorLamps, b); p.LastMinor = b; }
        }

        static void Apply(MeshRenderer[] lamps, SignalLight s)
        {
            lamps[0].sharedMaterial = s == SignalLight.Red ? Materials.SignalRed : Materials.SignalOff;
            lamps[1].sharedMaterial = s == SignalLight.Amber ? Materials.SignalAmber : Materials.SignalOff;
            lamps[2].sharedMaterial = s == SignalLight.Green ? Materials.SignalGreen : Materials.SignalOff;
        }
    }
}
