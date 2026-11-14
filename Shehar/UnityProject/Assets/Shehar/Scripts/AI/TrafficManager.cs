// Spawns / recycles ambient traffic around the player on the real road network, weighted towards a typical
// Pune street mix (lots of two-wheelers and auto-rickshaws). Density scales with the settings slider.
using System.Collections.Generic;
using Shehar.City;
using Shehar.Player;
using Shehar.Vehicles;
using UnityEngine;

namespace Shehar.AI
{
    public sealed class TrafficManager : MonoBehaviour
    {
        public static TrafficManager Instance { get; private set; }
        public int BaseMaxCars = 26;
        public float SpawnMin = 90f, SpawnMax = 260f, DespawnDist = 330f;
        public int ActiveCount { get { return cars.Count; } }

        readonly List<TrafficCar> cars = new List<TrafficCar>();
        readonly Dictionary<string, Stack<TrafficCar>> pool = new Dictionary<string, Stack<TrafficCar>>();
        readonly List<VehicleController> abandoned = new List<VehicleController>();
        float nextTick;

        // ASSUMPTION: approximate urban Pune mix (two-wheelers dominate registrations), tuned for gameplay
        static readonly (string id, float w)[] Mix =
        {
            ("hatch", 22), ("sedan", 9), ("suv", 9), ("auto", 18), ("scooter", 16), ("bike", 13), ("taxi", 3), ("bus", 4), ("truck", 3), ("police", 1),
        };

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void TrackAbandoned(VehicleController vc) { if (vc != null && !abandoned.Contains(vc)) abandoned.Add(vc); }

        public void Release(TrafficCar tc) { cars.Remove(tc); }

        void Update()
        {
            var world = CityWorld.Instance; var player = PlayerController.Instance;
            if (world == null || world.Ctx == null || player == null || Time.time < nextTick) return;
            nextTick = Time.time + 0.25f;
            Vector3 pp = player.Position;
            int max = Mathf.RoundToInt(BaseMaxCars * GameSettings.Current.TrafficDensity);

            for (int i = cars.Count - 1; i >= 0; i--)
            {
                var c = cars[i];
                if (c == null) { cars.RemoveAt(i); continue; }
                float d = (c.transform.position - pp).magnitude;
                if (d > DespawnDist || (c.Knocked && d > 120f && !Visible(c.transform.position)) || cars.Count > max && d > SpawnMin && !Visible(c.transform.position))
                    Recycle(c, i);
            }
            for (int i = abandoned.Count - 1; i >= 0; i--)
            {
                var v = abandoned[i];
                if (v == null) { abandoned.RemoveAt(i); continue; }
                if (v.Occupied) continue;
                if ((v.transform.position - pp).magnitude > 400f) { Destroy(v.gameObject); abandoned.RemoveAt(i); }
            }
            for (int tries = 0; tries < 6 && cars.Count < max; tries++) TrySpawn(world, pp);
        }

        bool Visible(Vector3 p)
        {
            var cam = Camera.main;
            if (cam == null) return false;
            Vector3 v = cam.WorldToViewportPoint(p);
            return v.z > 0 && v.x > -0.1f && v.x < 1.1f && v.y > -0.1f && v.y < 1.1f;
        }

        readonly Collider[] tmp = new Collider[4];

        void TrySpawn(CityWorld world, Vector3 pp)
        {
            var g = world.Graph;
            float ang = Random.value * Mathf.PI * 2f, r = Random.Range(SpawnMin, SpawnMax);
            Vector3 probe = pp + new Vector3(Mathf.Cos(ang), 0, Mathf.Sin(ang)) * r;
            if (!world.InBounds(probe, -20f) || !world.IsChunkLoadedAt(probe)) return;
            int n = g.NearestNode(probe.x, probe.z, 60f, true, node =>
            {
                for (int k = 0; k < g.Degree(node); k++)
                {
                    var nb = g.GetNeighbor(node, k);
                    if (nb.CarOk && g.RoadOfEdge(nb.Edge).traffic == 1) return true;
                }
                return false;
            });
            if (n < 0) return;
            Vector3 np = new Vector3(g.X[n], 0, g.Z[n]);
            if ((np - pp).magnitude < SpawnMin * 0.8f) return;
            if (Visible(np) && (np - pp).magnitude < 170f) return;
            if (Physics.OverlapSphereNonAlloc(np + Vector3.up, 9f, tmp, Layers.VehicleMask, QueryTriggerInteraction.Ignore) > 0) return;
            var options = new List<int>();
            for (int k = 0; k < g.Degree(n); k++)
            {
                var nb = g.GetNeighbor(n, k);
                if (nb.CarOk && g.RoadOfEdge(nb.Edge).traffic == 1) options.Add(nb.Node);
            }
            if (options.Count == 0) return;
            int next = options[Random.Range(0, options.Count)];
            var road = g.RoadOfEdge(g.EdgeBetween(n, next));
            var spec = PickSpec(road);
            var tc = Get(spec);
            tc.Init(this, n, next, 0.5f);
            cars.Add(tc);
        }

        static VehicleSpec PickSpec(Core.RoadInfo road)
        {
            float total = 0;
            foreach (var m in Mix) total += m.w;
            float r = Random.value * total;
            foreach (var m in Mix)
            {
                r -= m.w;
                if (r <= 0)
                {
                    var s = VehicleSpec.Get(m.id);
                    if ((s.Class == VehicleClass.Bus || s.Class == VehicleClass.Truck) && road.width < 7f) return VehicleSpec.Get("auto");
                    return s;
                }
            }
            return VehicleSpec.Get("hatch");
        }

        TrafficCar Get(VehicleSpec spec)
        {
            if (pool.TryGetValue(spec.Id, out var st) && st.Count > 0)
            {
                var c = st.Pop();
                if (c != null) { c.gameObject.SetActive(true); return c; }
            }
            var vc = VehicleController.Spawn(spec, Vector3.zero, Quaternion.identity, null, null, true, spec.TwoWheeler);
            vc.LightsOn = World.DayNightCycle.Instance != null && World.DayNightCycle.Instance.IsNight;
            vc.transform.SetParent(transform, true);
            World.DamageSmoke.Attach(vc);
            var tc = vc.gameObject.AddComponent<TrafficCar>();
            tc.Vc = vc;
            return tc;
        }

        void Recycle(TrafficCar c, int index)
        {
            cars.RemoveAt(index);
            if (c.Vc == null || c.Vc.Occupied) return;
            c.Vc.IsKinematic = true;
            c.gameObject.SetActive(false);
            if (!pool.TryGetValue(c.Vc.Spec.Id, out var st)) pool[c.Vc.Spec.Id] = st = new Stack<TrafficCar>();
            if (st.Count < 6) st.Push(c); else Destroy(c.gameObject);
        }

        public void ClearAll()
        {
            foreach (var c in cars) if (c != null) Destroy(c.gameObject);
            cars.Clear();
            foreach (var st in pool.Values) foreach (var c in st) if (c != null) Destroy(c.gameObject);
            pool.Clear();
            foreach (var v in abandoned) if (v != null) Destroy(v.gameObject);
            abandoned.Clear();
        }
    }
}
