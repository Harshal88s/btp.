// GPS: fastest legal route over the OSM road graph (A*, one-way aware when driving), drawn as a ribbon on the
// road and on the minimap, with turn-by-turn instructions using real street names and automatic re-routing.
using System.Collections.Generic;
using Shehar.City;
using Shehar.Core;
using Shehar.Player;
using UnityEngine;

namespace Shehar.Navigation
{
    public sealed class GPSNavigator : MonoBehaviour
    {
        public static GPSNavigator Instance { get; private set; }

        public bool HasTarget { get; private set; }
        public Vector3 Target { get; private set; }
        public string TargetLabel { get; private set; }
        public readonly List<Vector3> Route = new List<Vector3>();
        public float RemainingMeters { get; private set; }
        public string Instruction { get; private set; }
        public int TurnSign { get; private set; }  // -1 left, 0 straight, 1 right, 2 arrive
        public float ArriveRadius = 20f;

        readonly List<int> routeNodes = new List<int>();
        LineRenderer line;
        GameObject beacon;
        float nextCheck, offRouteTime;
        int progressIndex;
        bool lastCarMode;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        public static GPSNavigator Create(Transform parent)
        {
            var go = new GameObject("GPS");
            go.transform.SetParent(parent, false);
            var g = go.AddComponent<GPSNavigator>();
            g.line = go.AddComponent<LineRenderer>();
            g.line.alignment = LineAlignment.TransformZ;
            go.transform.rotation = Quaternion.Euler(90, 0, 0); // ribbon lies flat on the road
            g.line.widthMultiplier = 1.5f;
            g.line.numCornerVertices = 2;
            g.line.sharedMaterial = new Material(Materials.Unlit) { name = "GPSLine" };
            g.line.startColor = g.line.endColor = new Color(0.62f, 0.25f, 0.95f, 0.6f);
            g.line.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            g.line.positionCount = 0;
            g.beacon = MarkerFactory.Beacon(go.transform, new Color(0.62f, 0.25f, 0.95f, 0.5f), 3f, 60f);
            g.beacon.SetActive(false);
            return g;
        }

        public void SetTarget(Vector3 p, string label)
        {
            Target = new Vector3(p.x, 0, p.z);
            TargetLabel = label;
            HasTarget = true;
            beacon.transform.position = Target;
            beacon.SetActive(true);
            Recompute();
        }

        public void Clear()
        {
            HasTarget = false;
            Route.Clear(); routeNodes.Clear();
            line.positionCount = 0;
            beacon.SetActive(false);
            Instruction = null;
        }

        public void Recompute()
        {
            Route.Clear(); routeNodes.Clear(); progressIndex = 0;
            var world = CityWorld.Instance; var pc = PlayerController.Instance;
            if (!HasTarget || world == null || world.Ctx == null || pc == null) return;
            var g = world.Graph;
            Vector3 p = pc.Position;
            lastCarMode = pc.InVehicle;
            int a = g.NearestNode(p.x, p.z, 400f), b = g.NearestNode(Target.x, Target.z, 600f);
            List<int> path = g.FindPath(a, b, lastCarMode);
            if (path == null && lastCarMode) path = g.FindPath(a, b, false); // fall back ignoring one-ways
            Route.Add(new Vector3(p.x, 0, p.z));
            if (path != null)
            {
                routeNodes.AddRange(path);
                foreach (int n in path) Route.Add(new Vector3(g.X[n], 0, g.Z[n]));
            }
            Route.Add(Target);
            UpdateLine(p);
        }

        void UpdateLine(Vector3 p)
        {
            // draw the next ~700 m only
            var pts = new List<Vector3>();
            float acc = 0;
            pts.Add(new Vector3(p.x, 0.28f, p.z));
            for (int i = Mathf.Max(1, progressIndex); i < Route.Count && acc < 700f; i++)
            {
                acc += Vector3.Distance(Route[i - 1], Route[i]);
                pts.Add(new Vector3(Route[i].x, 0.28f, Route[i].z));
            }
            line.positionCount = pts.Count;
            line.SetPositions(pts.ToArray());
        }

        void Update()
        {
            if (!HasTarget) return;
            var pc = PlayerController.Instance;
            if (pc == null || Route.Count < 2) return;
            Vector3 p = pc.Position; p.y = 0;
            if (pc.InVehicle != lastCarMode) Recompute();

            // advance along the route
            int best = progressIndex; float bd = float.MaxValue;
            for (int i = progressIndex; i < Mathf.Min(Route.Count - 1, progressIndex + 25); i++)
            {
                float d = DistToSeg(p, Route[i], Route[i + 1]);
                if (d < bd) { bd = d; best = i; }
            }
            progressIndex = best;
            RemainingMeters = Vector3.Distance(p, Route[Mathf.Min(best + 1, Route.Count - 1)]);
            for (int i = best + 1; i < Route.Count - 1; i++) RemainingMeters += Vector3.Distance(Route[i], Route[i + 1]);

            if (Time.time > nextCheck)
            {
                nextCheck = Time.time + 0.5f;
                if (bd > 28f) { offRouteTime += 0.5f; if (offRouteTime >= 1.5f) { offRouteTime = 0; Recompute(); return; } }
                else offRouteTime = 0;
                UpdateLine(p);
                ComputeInstruction(p);
            }
        }

        void ComputeInstruction(Vector3 p)
        {
            var world = CityWorld.Instance;
            if (Vector3.Distance(p, Target) < ArriveRadius * 2f) { Instruction = "Arriving at " + TargetLabel; TurnSign = 2; return; }
            float acc = Vector3.Distance(p, Route[Mathf.Min(progressIndex + 1, Route.Count - 1)]);
            for (int i = progressIndex + 1; i < Route.Count - 1; i++)
            {
                Vector3 a = Route[i] - Route[i - 1], b = Route[i + 1] - Route[i];
                if (a.sqrMagnitude > 1f && b.sqrMagnitude > 1f)
                {
                    float ang = Vector3.SignedAngle(a, b, Vector3.up);
                    if (Mathf.Abs(ang) > 35f && acc > 8f)
                    {
                        string street = "";
                        int ri = i - 1; // index into routeNodes is i-1 (Route[0] is the player)
                        if (ri >= 0 && ri + 1 < routeNodes.Count)
                        {
                            int e = world.Graph.EdgeBetween(routeNodes[ri], routeNodes[ri + 1]);
                            if (e >= 0) street = world.Graph.RoadOfEdge(e).DisplayName;
                        }
                        TurnSign = ang > 0 ? 1 : -1;
                        Instruction = (ang > 0 ? "Turn right" : "Turn left") + " in " + Fmt.Dist(acc) + (street != "" ? " onto " + street : "");
                        return;
                    }
                }
                acc += Vector3.Distance(Route[i], Route[i + 1]);
                if (acc > 1500f) break;
            }
            TurnSign = 0;
            Instruction = "Continue straight - " + Fmt.Dist(RemainingMeters) + " to " + TargetLabel;
        }

        public bool Arrived(Vector3 p, float radius)
        {
            p.y = 0;
            return HasTarget && Vector3.Distance(p, Target) < radius;
        }

        static float DistToSeg(Vector3 p, Vector3 a, Vector3 b)
        {
            Vector3 ab = b - a; ab.y = 0;
            float l2 = ab.sqrMagnitude;
            float t = l2 < 1e-4f ? 0 : Mathf.Clamp01(Vector3.Dot(p - a, ab) / l2);
            Vector3 q = a + ab * t - p; q.y = 0;
            return q.magnitude;
        }
    }

    /// <summary>Glowing vertical beams / rings used for GPS destinations and mission markers.</summary>
    public static class MarkerFactory
    {
        public static GameObject Beacon(Transform parent, Color c, float radius, float height)
        {
            Materials.Init();
            var go = new GameObject("Beacon");
            go.transform.SetParent(parent, false);
            var mb = new MeshBuilder();
            int seg = 24;
            for (int i = 0; i < seg; i++)
            {
                float a0 = i * Mathf.PI * 2 / seg, a1 = (i + 1) * Mathf.PI * 2 / seg;
                Vector3 d0 = new Vector3(Mathf.Cos(a0), 0, Mathf.Sin(a0)) * radius, d1 = new Vector3(Mathf.Cos(a1), 0, Mathf.Sin(a1)) * radius;
                mb.Quad(d0, d0 + Vector3.up * height, d1 + Vector3.up * height, d1, Color.white, new Vector2(0, 0), new Vector2(0, 1), new Vector2(1, 1), new Vector2(1, 0));
            }
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("Beacon");
            var r = go.AddComponent<MeshRenderer>();
            var m = new Material(Materials.Marker) { color = c };
            r.sharedMaterial = m;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var ring = new GameObject("Ring");
            ring.transform.SetParent(go.transform, false);
            var rb = new MeshBuilder();
            rb.Ribbon(Circle(radius, 32), 0.6f, 0, 0.15f, Color.white, 1e6f);
            ring.AddComponent<MeshFilter>().sharedMesh = rb.ToMesh("Ring");
            var rr = ring.AddComponent<MeshRenderer>();
            rr.sharedMaterial = new Material(Materials.Unlit) { color = new Color(c.r, c.g, c.b, 0.85f) };
            rr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        static List<Vector3> Circle(float r, int n)
        {
            var l = new List<Vector3>();
            for (int i = 0; i <= n; i++) { float a = i * Mathf.PI * 2 / n; l.Add(new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r)); }
            return l;
        }
    }
}
