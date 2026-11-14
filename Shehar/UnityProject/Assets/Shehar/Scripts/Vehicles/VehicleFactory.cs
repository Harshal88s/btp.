// Builds low-poly procedural vehicle models (no external assets): Indian right-hand-drive cars, a three-wheeler
// auto-rickshaw with its yellow canopy, scooters/bikes, buses, a decorated goods truck, police and ambulance.
// Number plates follow Indian conventions: white plate for private vehicles, yellow for commercial; "MH 12" is Pune's RTO code.
using System.Collections.Generic;
using Shehar.City;
using UnityEngine;

namespace Shehar.Vehicles
{
    public sealed class WheelVisual
    {
        public Transform T;
        public Vector3 BaseLocal;
        public bool Front;
        public float Radius;
        public float Spin;
    }

    /// <summary>References into a built vehicle model, consumed by VehicleController / camera / player.</summary>
    public sealed class VehicleRig : MonoBehaviour
    {
        public VehicleSpec Spec;
        public Transform Body;
        public readonly List<WheelVisual> Wheels = new List<WheelVisual>();
        public MeshRenderer HeadLights, TailLights;
        public MeshRenderer[] Beacons;
        public Vector3 DriverHead;     // local, for first-person camera
        public Vector3 DriverSeat;     // local, where the player model sits
        public Vector3 ExitLocal;      // local, where the player steps out (right side: RHD)
        public string Plate;
        public Color Paint;
        public Transform Rider;

        void OnDestroy()
        {
            // procedural meshes and the per-vehicle physic material are not freed with the GameObject
            foreach (var mf in GetComponentsInChildren<MeshFilter>(true)) if (mf.sharedMesh != null) Destroy(mf.sharedMesh);
            foreach (var c in GetComponentsInChildren<Collider>(true)) if (c.sharedMaterial != null) Destroy(c.sharedMaterial);
        }
    }

    /// <summary>Frees procedural meshes (and listed per-instance materials) when the owning GameObject is destroyed.</summary>
    public sealed class OwnedAssets : MonoBehaviour
    {
        public readonly List<Material> Materials = new List<Material>();
        void OnDestroy()
        {
            foreach (var mf in GetComponentsInChildren<MeshFilter>(true)) if (mf.sharedMesh != null) Destroy(mf.sharedMesh);
            foreach (var m in Materials) if (m != null) Destroy(m);
        }
    }

    public static class VehicleFactory
    {
        static Material tailDim;
        static Font font;

        public static Font UIFont()
        {
            if (font != null) return font;
            string v = Application.unityVersion;
            int major = 0, minor = 0;
            var parts = v.Split('.');
            if (parts.Length > 1) { int.TryParse(parts[0], out major); int.TryParse(parts[1], out minor); }
            bool legacy = major > 2022 || (major == 2022 && minor >= 2) || major >= 6000;
            try { font = Resources.GetBuiltinResource<Font>(legacy ? "LegacyRuntime.ttf" : "Arial.ttf"); } catch { font = null; }
            if (font == null) { try { font = Resources.GetBuiltinResource<Font>(legacy ? "Arial.ttf" : "LegacyRuntime.ttf"); } catch { } }
            return font;
        }

        public static string RandomPlate(System.Random rng)
        {
            const string L = "ABCDEFGHJKLMNPRSTUVWXYZ";
            string rto = rng.NextDouble() < 0.8 ? "12" : "14"; // MH-12 Pune, MH-14 Pimpri-Chinchwad
            return "MH " + rto + " " + L[rng.Next(L.Length)] + L[rng.Next(L.Length)] + " " + rng.Next(1, 9999).ToString("0000");
        }

        public static GameObject Build(VehicleSpec s, Color paint, string plate, bool withRider = false)
        {
            Materials.Init();
            if (tailDim == null)
            {
                tailDim = new Material(Materials.LightRear) { name = "TailDim" };
                tailDim.SetColor("_EmissionColor", new Color(0.5f, 0.02f, 0.01f));
            }
            var root = new GameObject(s.Name);
            var rig = root.AddComponent<VehicleRig>();
            rig.Spec = s; rig.Plate = plate; rig.Paint = paint;
            var body = new GameObject("Body").transform;
            body.SetParent(root.transform, false);
            rig.Body = body;

            var paintMb = new MeshBuilder(); var glass = new MeshBuilder(); var dark = new MeshBuilder();
            var chrome = new MeshBuilder(); var head = new MeshBuilder(); var tail = new MeshBuilder(); var beaconR = new MeshBuilder(); var beaconB = new MeshBuilder();
            Color32 pc = paint;
            switch (s.Class)
            {
                case VehicleClass.AutoRickshaw: BuildAuto(s, rig, paintMb, glass, dark, head, tail); break;
                case VehicleClass.Scooter: case VehicleClass.Motorcycle: BuildTwoWheeler(s, rig, paintMb, dark, chrome, head, tail, withRider); break;
                case VehicleClass.Bus: BuildBus(s, rig, paintMb, glass, dark, head, tail); break;
                case VehicleClass.Truck: BuildTruck(s, rig, paintMb, glass, dark, head, tail); break;
                default: BuildCar(s, rig, paintMb, glass, dark, chrome, head, tail, beaconR, beaconB); break;
            }

            Part(body, "Paint", paintMb, Materials.VehicleBody);
            Part(body, "Glass", glass, Materials.Glass);
            Part(body, "Trim", dark, Materials.Tyre);
            Part(body, "Chrome", chrome, Materials.Chrome);
            rig.HeadLights = Part(body, "HeadLights", head, Materials.LightOff);
            rig.TailLights = Part(body, "TailLights", tail, tailDim);
            if (!beaconR.IsEmpty)
                rig.Beacons = new[] { Part(body, "BeaconRed", beaconR, Materials.SignalOff), Part(body, "BeaconBlue", beaconB, Materials.SignalOff) };

            BuildWheels(s, rig, root.transform);
            AddPlates(s, rig, body);
            return root;
        }

        public static Material TailDim { get { return tailDim; } }

        static MeshRenderer Part(Transform parent, string name, MeshBuilder mb, Material m)
        {
            if (mb.IsEmpty) return null;
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh(name);
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = m;
            return r;
        }

        // ------------------------------------------------------------------ cars
        static void BuildCar(VehicleSpec s, VehicleRig rig, MeshBuilder paint, MeshBuilder glass, MeshBuilder dark, MeshBuilder chrome,
                             MeshBuilder head, MeshBuilder tail, MeshBuilder beaconR, MeshBuilder beaconB)
        {
            float L = s.Length, W = s.Width, H = s.Height, R = s.WheelRadius;
            float clear = R * 0.55f;
            float belt = clear + (H - clear) * (s.Class == VehicleClass.Sports ? 0.5f : 0.48f);
            Color32 pc = rig.Paint;
            float Lc = L * 0.5f, zc = -L * 0.03f, topK = 0.68f;
            switch (s.Class)
            {
                case VehicleClass.Hatchback: Lc = L * 0.6f; zc = -L * 0.1f; topK = 0.78f; break;
                case VehicleClass.SUV: case VehicleClass.Police: Lc = L * 0.7f; zc = -L * 0.1f; topK = 0.86f; break;
                case VehicleClass.Sports: Lc = L * 0.42f; zc = -L * 0.08f; topK = 0.55f; break;
                case VehicleClass.Ambulance: Lc = L * 0.8f; zc = -L * 0.08f; topK = 0.95f; belt = clear + (H - clear) * 0.42f; break;
            }
            paint.Frustum(new Vector3(0, clear, 0), new Vector2(W, L), new Vector2(W * 0.97f, L * 0.95f), belt - clear, 0, pc);
            if (s.Class == VehicleClass.Ambulance)
            {
                // tall van body behind a short cab glass
                paint.Box(new Vector3(0, (belt + H) / 2, zc - Lc * 0.12f), new Vector3(W * 0.97f, H - belt, Lc * 0.78f), pc);
                glass.Frustum(new Vector3(0, belt, zc + Lc * 0.36f), new Vector2(W * 0.95f, Lc * 0.2f), new Vector2(W * 0.9f, Lc * 0.12f), H - belt - 0.15f, -0.05f, new Color32(255, 255, 255, 255));
                paint.Box(new Vector3(0, belt + 0.25f, zc), new Vector3(W * 0.985f, 0.18f, Lc * 0.98f), new Color32(200, 20, 20, 255));
            }
            else
            {
                glass.Frustum(new Vector3(0, belt, zc), new Vector2(W * 0.92f, Lc), new Vector2(W * 0.78f, Lc * topK), H - belt - 0.06f, -Lc * 0.04f, new Color32(255, 255, 255, 255));
                paint.Box(new Vector3(0, H - 0.03f, zc - Lc * 0.04f), new Vector3(W * 0.78f, 0.07f, Lc * topK * 0.98f), pc);
                // pillars
                for (int sx = -1; sx <= 1; sx += 2)
                    paint.Box(new Vector3(sx * W * 0.43f, (belt + H) / 2, zc - Lc * 0.04f), new Vector3(0.05f, H - belt, 0.12f), pc);
            }
            var trim = new Color32(30, 30, 32, 255);
            dark.Box(new Vector3(0, clear + 0.14f, L / 2 + 0.02f), new Vector3(W * 0.98f, 0.26f, 0.12f), trim);
            dark.Box(new Vector3(0, clear + 0.14f, -L / 2 - 0.02f), new Vector3(W * 0.98f, 0.26f, 0.12f), trim);
            dark.Box(new Vector3(0, belt - 0.16f, L / 2 + 0.01f), new Vector3(W * 0.45f, 0.14f, 0.05f), trim); // grille
            for (int sx = -1; sx <= 1; sx += 2)
            {
                head.Box(new Vector3(sx * W * 0.34f, belt - 0.14f, L / 2 + 0.01f), new Vector3(0.34f, 0.12f, 0.05f), Color.white);
                tail.Box(new Vector3(sx * W * 0.37f, belt - 0.12f, -L / 2 - 0.01f), new Vector3(0.3f, 0.12f, 0.05f), Color.white);
                dark.Box(new Vector3(sx * (W / 2 + 0.06f), belt + 0.05f, zc + Lc * 0.38f), new Vector3(0.12f, 0.1f, 0.08f), trim); // mirrors
            }
            // interior: dashboard + right-hand-drive steering wheel (India)
            dark.Box(new Vector3(0, belt - 0.02f, zc + Lc * 0.4f), new Vector3(W * 0.86f, 0.2f, 0.3f), new Color32(45, 42, 40, 255));
            float sxw = W * 0.22f;
            dark.Cylinder(new Vector3(sxw, belt + 0.1f, zc + Lc * 0.3f), new Vector3(0, 0.45f, -1f), 0.17f, 0.035f, 14, trim);
            dark.Box(new Vector3(sxw, clear + 0.35f, zc - Lc * 0.05f), new Vector3(0.5f, 0.35f, 0.5f), new Color32(70, 60, 55, 255));
            dark.Box(new Vector3(-sxw, clear + 0.35f, zc - Lc * 0.05f), new Vector3(0.5f, 0.35f, 0.5f), new Color32(70, 60, 55, 255));
            rig.DriverHead = new Vector3(sxw, belt + 0.38f, zc - Lc * 0.06f);
            rig.DriverSeat = new Vector3(sxw, clear + 0.4f, zc - Lc * 0.05f);
            rig.ExitLocal = new Vector3(W / 2 + 0.9f, 0, zc);

            if (s.Class == VehicleClass.Taxi)
            {
                paint.Box(new Vector3(0, H + 0.12f, zc), new Vector3(0.6f, 0.2f, 0.22f), new Color32(250, 205, 20, 255));
                Label(rig.Body, "TAXI", new Vector3(0, H + 0.12f, zc + 0.115f), 0, 0.09f, Color.black);
                Label(rig.Body, "TAXI", new Vector3(0, H + 0.12f, zc - 0.115f), 180, 0.09f, Color.black);
            }
            if (s.Class == VehicleClass.Police)
            {
                paint.Box(new Vector3(0, belt - 0.05f, 0), new Vector3(W * 0.985f, 0.14f, L * 0.9f), new Color32(25, 60, 150, 255));
                dark.Box(new Vector3(0, H + 0.05f, zc), new Vector3(W * 0.6f, 0.08f, 0.25f), trim);
                beaconR.Box(new Vector3(-W * 0.16f, H + 0.14f, zc), new Vector3(W * 0.26f, 0.1f, 0.22f), Color.white);
                beaconB.Box(new Vector3(W * 0.16f, H + 0.14f, zc), new Vector3(W * 0.26f, 0.1f, 0.22f), Color.white);
                Label(rig.Body, "POLICE", new Vector3(W / 2 + 0.005f, belt + 0.12f, 0), 90, 0.12f, new Color(0.1f, 0.2f, 0.55f));
                Label(rig.Body, "POLICE", new Vector3(-W / 2 - 0.005f, belt + 0.12f, 0), -90, 0.12f, new Color(0.1f, 0.2f, 0.55f));
            }
            if (s.Class == VehicleClass.Ambulance)
            {
                beaconR.Box(new Vector3(-W * 0.3f, H + 0.06f, zc + Lc * 0.3f), new Vector3(0.3f, 0.12f, 0.2f), Color.white);
                beaconB.Box(new Vector3(W * 0.3f, H + 0.06f, zc + Lc * 0.3f), new Vector3(0.3f, 0.12f, 0.2f), Color.white);
                var t = Label(rig.Body, "AMBULANCE", new Vector3(0, belt + 0.02f, L / 2 + 0.03f), 0, 0.09f, new Color(0.8f, 0.05f, 0.05f));
                t.transform.localScale = new Vector3(-t.transform.localScale.x, t.transform.localScale.y, 1); // mirrored for rear-view mirrors
                Label(rig.Body, "AMBULANCE", new Vector3(W / 2 + 0.005f, (belt + H) / 2, -0.4f), 90, 0.16f, new Color(0.8f, 0.05f, 0.05f));
            }
        }

        // ------------------------------------------------------------------ auto-rickshaw
        static void BuildAuto(VehicleSpec s, VehicleRig rig, MeshBuilder paint, MeshBuilder glass, MeshBuilder dark, MeshBuilder head, MeshBuilder tail)
        {
            float L = s.Length, W = s.Width, H = s.Height;
            var black = new Color32(22, 22, 22, 255);
            var yellow = new Color32(245, 196, 20, 255);
            var green = new Color32(40, 120, 60, 255);
            paint.Box(new Vector3(0, 0.36f, -0.15f), new Vector3(W, 0.12f, L * 0.8f), black);                      // floor pan
            paint.Frustum(new Vector3(0, 0.42f, -0.55f), new Vector2(W, 1.25f), new Vector2(W * 0.98f, 1.2f), 0.45f, 0, black); // rear tub
            paint.Frustum(new Vector3(0, 0.3f, L / 2 - 0.35f), new Vector2(0.62f, 0.7f), new Vector2(0.5f, 0.35f), 0.9f, -0.1f, black); // front cowl
            paint.Box(new Vector3(0, 1.0f, L / 2 - 0.42f), new Vector3(W * 0.82f, 0.06f, 0.08f), yellow);
            // canopy (yellow hood) and its frame
            paint.Frustum(new Vector3(0, H - 0.12f, -0.2f), new Vector2(W * 1.02f, L * 0.78f), new Vector2(W * 0.9f, L * 0.68f), 0.14f, -0.05f, yellow);
            paint.Box(new Vector3(0, (0.9f + H) / 2, -L * 0.36f), new Vector3(W * 0.98f, H - 0.95f, 0.05f), yellow);
            paint.Box(new Vector3(0, 0.62f, -L * 0.36f + 0.02f), new Vector3(W * 0.9f, 0.16f, 0.05f), green);
            for (int sx = -1; sx <= 1; sx += 2)
            {
                dark.Box(new Vector3(sx * W * 0.48f, (0.85f + H) / 2, L * 0.17f), new Vector3(0.04f, H - 0.85f, 0.04f), black);
                dark.Box(new Vector3(sx * W * 0.48f, (0.85f + H) / 2, -L * 0.34f), new Vector3(0.04f, H - 0.85f, 0.04f), black);
            }
            glass.Box(new Vector3(0, 1.32f, L * 0.18f), new Vector3(W * 0.78f, 0.6f, 0.03f), new Color32(255, 255, 255, 255));
            dark.Box(new Vector3(0, 0.72f, -0.62f), new Vector3(W * 0.9f, 0.18f, 0.55f), new Color32(80, 50, 40, 255)); // passenger bench
            dark.Box(new Vector3(0, 0.95f, -0.9f), new Vector3(W * 0.9f, 0.45f, 0.1f), new Color32(80, 50, 40, 255));
            dark.Box(new Vector3(0, 0.72f, 0.35f), new Vector3(0.45f, 0.14f, 0.4f), new Color32(60, 40, 35, 255));     // driver seat
            dark.Box(new Vector3(0, 1.12f, 0.92f), new Vector3(0.75f, 0.04f, 0.04f), new Color32(160, 160, 160, 255)); // handlebar
            head.Box(new Vector3(0, 0.95f, L / 2 - 0.2f), new Vector3(0.22f, 0.18f, 0.05f), Color.white);
            for (int sx = -1; sx <= 1; sx += 2)
                tail.Box(new Vector3(sx * W * 0.42f, 0.55f, -L * 0.36f - 0.03f), new Vector3(0.1f, 0.08f, 0.04f), Color.white);
            rig.DriverHead = new Vector3(0, 1.45f, 0.3f);
            rig.DriverSeat = new Vector3(0, 0.78f, 0.35f);
            rig.ExitLocal = new Vector3(W / 2 + 0.8f, 0, 0.2f);
        }

        // ------------------------------------------------------------------ two-wheelers
        static void BuildTwoWheeler(VehicleSpec s, VehicleRig rig, MeshBuilder paint, MeshBuilder dark, MeshBuilder chrome, MeshBuilder head, MeshBuilder tail, bool withRider)
        {
            float L = s.Length, R = s.WheelRadius;
            Color32 pc = rig.Paint;
            var trim = new Color32(25, 25, 25, 255);
            bool scooter = s.Class == VehicleClass.Scooter;
            if (scooter)
            {
                paint.Frustum(new Vector3(0, 0.2f, 0.45f), new Vector2(0.42f, 0.25f), new Vector2(0.36f, 0.18f), 0.85f, 0.05f, pc); // apron
                paint.Box(new Vector3(0, 0.3f, -0.05f), new Vector3(0.3f, 0.12f, 0.6f), pc);                                          // floorboard
                paint.Frustum(new Vector3(0, 0.3f, -0.45f), new Vector2(0.42f, 0.7f), new Vector2(0.36f, 0.6f), 0.42f, 0, pc);       // rear body
            }
            else
            {
                paint.Frustum(new Vector3(0, 0.75f, 0.22f), new Vector2(0.32f, 0.5f), new Vector2(0.26f, 0.38f), 0.22f, -0.03f, pc);  // tank
                dark.Box(new Vector3(0, 0.55f, 0.0f), new Vector3(0.22f, 0.3f, 0.6f), trim);                                         // engine
                chrome.Cylinder(new Vector3(0.16f, 0.35f, -0.4f), new Vector3(0, 0.15f, -1f), 0.05f, 0.7f, 8, new Color32(200, 200, 200, 255)); // exhaust
                paint.Box(new Vector3(0, 0.82f, -0.62f), new Vector3(0.24f, 0.12f, 0.45f), pc);                                      // tail
            }
            dark.Box(new Vector3(0, 0.8f, -0.25f), new Vector3(0.3f, 0.1f, 0.7f), new Color32(20, 20, 20, 255));                       // seat
            dark.Cylinder(new Vector3(0, 0.6f, L / 2 - 0.42f), new Vector3(0, 1f, 0.35f), 0.03f, 1.0f, 6, trim);                      // fork
            chrome.Box(new Vector3(0, 1.05f, L / 2 - 0.33f), new Vector3(0.72f, 0.04f, 0.04f), new Color32(190, 190, 190, 255));      // handlebar
            head.Box(new Vector3(0, 0.98f, L / 2 - 0.22f), new Vector3(0.16f, 0.14f, 0.06f), Color.white);
            tail.Box(new Vector3(0, 0.82f, -L / 2 + 0.1f), new Vector3(0.14f, 0.06f, 0.04f), Color.white);
            rig.DriverHead = new Vector3(0, 1.55f, -0.1f);
            rig.DriverSeat = new Vector3(0, 0.85f, -0.2f);
            rig.ExitLocal = new Vector3(0.9f, 0, 0);
            if (withRider)
            {
                var riderMb = new MeshBuilder();
                dark = riderMb; // rider is its own part so it can be removed when the bike is taken
                var shirt = new Color32((byte)Random.Range(40, 230), (byte)Random.Range(40, 230), (byte)Random.Range(40, 230), 255);
                dark.Box(new Vector3(0, 1.2f, -0.18f), new Vector3(0.42f, 0.6f, 0.25f), shirt);
                dark.Blob(new Vector3(0, 1.62f, -0.12f), new Vector3(0.15f, 0.16f, 0.17f), 8, 5, new Color32(30, 30, 30, 255)); // helmet
                for (int sx = -1; sx <= 1; sx += 2)
                {
                    dark.Box(new Vector3(sx * 0.13f, 0.78f, 0.02f), new Vector3(0.13f, 0.14f, 0.5f), new Color32(40, 40, 60, 255));
                    dark.Box(new Vector3(sx * 0.25f, 1.25f, 0.22f), new Vector3(0.09f, 0.09f, 0.5f), shirt);
                }
                var riderPart = Part(rig.Body, "Rider", riderMb, Materials.Tyre);
                if (riderPart != null) rig.Rider = riderPart.transform;
            }
        }

        // ------------------------------------------------------------------ bus & truck
        static void BuildBus(VehicleSpec s, VehicleRig rig, MeshBuilder paint, MeshBuilder glass, MeshBuilder dark, MeshBuilder head, MeshBuilder tail)
        {
            float L = s.Length, W = s.Width, H = s.Height, clear = 0.45f;
            Color32 pc = rig.Paint;
            var white = new Color32(238, 238, 232, 255);
            paint.Box(new Vector3(0, (clear + 1.55f) / 2, 0), new Vector3(W, 1.55f - clear, L), pc);
            paint.Box(new Vector3(0, (2.65f + H) / 2, 0), new Vector3(W, H - 2.65f, L), white);
            glass.Box(new Vector3(0, 2.1f, -0.3f), new Vector3(W + 0.01f, 1.1f, L - 1.4f), Color.white);
            glass.Box(new Vector3(0, 2.0f, L / 2 - 0.01f), new Vector3(W * 0.94f, 1.3f, 0.04f), Color.white);
            paint.Box(new Vector3(0, 2.1f, L / 2 - 0.35f), new Vector3(W, 1.1f, 0.7f), pc);
            for (int i = 0; i < 7; i++)
                paint.Box(new Vector3(0, 2.1f, -L / 2 + 0.9f + i * (L - 1.8f) / 6f), new Vector3(W + 0.02f, 1.1f, 0.08f), pc);
            dark.Box(new Vector3(0, H - 0.35f, L / 2 + 0.01f), new Vector3(W * 0.8f, 0.3f, 0.04f), new Color32(20, 20, 20, 255));
            Label(rig.Body, "DECCAN - SWARGATE", new Vector3(0, H - 0.35f, L / 2 + 0.04f), 0, 0.06f, new Color(1f, 0.6f, 0.1f));
            for (int sx = -1; sx <= 1; sx += 2)
            {
                head.Box(new Vector3(sx * W * 0.38f, 0.8f, L / 2 + 0.01f), new Vector3(0.3f, 0.15f, 0.05f), Color.white);
                tail.Box(new Vector3(sx * W * 0.4f, 0.9f, -L / 2 - 0.01f), new Vector3(0.2f, 0.3f, 0.05f), Color.white);
            }
            dark.Box(new Vector3(W * 0.3f, 1.4f, L / 2 - 1.0f), new Vector3(0.5f, 0.35f, 0.5f), new Color32(60, 60, 60, 255));
            rig.DriverHead = new Vector3(W * 0.28f, 2.25f, L / 2 - 1.1f);
            rig.DriverSeat = new Vector3(W * 0.28f, 1.55f, L / 2 - 1.1f);
            rig.ExitLocal = new Vector3(W / 2 + 1f, 0, L / 2 - 1.5f);
        }

        static void BuildTruck(VehicleSpec s, VehicleRig rig, MeshBuilder paint, MeshBuilder glass, MeshBuilder dark, MeshBuilder head, MeshBuilder tail)
        {
            float L = s.Length, W = s.Width, H = s.Height, clear = 0.55f;
            Color32 pc = rig.Paint;
            float cabL = 2.2f;
            paint.Box(new Vector3(0, (clear + 2.7f) / 2, L / 2 - cabL / 2), new Vector3(W * 0.98f, 2.7f - clear, cabL), pc);
            glass.Box(new Vector3(0, 2.1f, L / 2 + 0.005f), new Vector3(W * 0.85f, 0.75f, 0.04f), Color.white);
            paint.Box(new Vector3(0, 2.85f, L / 2 - cabL / 2 + 0.1f), new Vector3(W * 0.9f, 0.3f, cabL * 0.8f), new Color32(220, 40, 40, 255)); // painted visor
            var wood = new Color32(150, 95, 50, 255);
            paint.Box(new Vector3(0, (1.1f + H) / 2, -cabL / 2 + 0.05f), new Vector3(W, H - 1.1f, L - cabL - 0.2f), wood);
            paint.Box(new Vector3(0, 1.05f, -cabL / 2 + 0.05f), new Vector3(W, 0.2f, L - cabL - 0.2f), new Color32(40, 40, 40, 255));
            for (int i = 0; i < 4; i++)
                paint.Box(new Vector3(0, 1.4f + i * 0.5f, -L / 2 + 0.06f), new Vector3(W * 1.001f, 0.08f, 0.05f), i % 2 == 0 ? new Color32(250, 200, 20, 255) : new Color32(30, 120, 60, 255));
            Label(rig.Body, "HORN OK PLEASE", new Vector3(0, 1.75f, -L / 2 - 0.04f), 180, 0.11f, new Color(0.85f, 0.1f, 0.1f));
            for (int sx = -1; sx <= 1; sx += 2)
            {
                head.Box(new Vector3(sx * W * 0.37f, 0.95f, L / 2 + 0.01f), new Vector3(0.28f, 0.2f, 0.05f), Color.white);
                tail.Box(new Vector3(sx * W * 0.42f, 0.95f, -L / 2 - 0.01f), new Vector3(0.2f, 0.15f, 0.05f), Color.white);
            }
            rig.DriverHead = new Vector3(W * 0.27f, 2.35f, L / 2 - 1.1f);
            rig.DriverSeat = new Vector3(W * 0.27f, 1.6f, L / 2 - 1.1f);
            rig.ExitLocal = new Vector3(W / 2 + 1f, 0, L / 2 - 1.2f);
        }

        // ------------------------------------------------------------------ wheels & plates
        static void BuildWheels(VehicleSpec s, VehicleRig rig, Transform root)
        {
            var list = new List<(Vector3 p, bool front)>();
            float R = s.WheelRadius, hb = s.WheelBase / 2, ht = s.Track / 2;
            if (s.TwoWheeler) { list.Add((new Vector3(0, R, hb), true)); list.Add((new Vector3(0, R, -hb), false)); }
            else if (s.Class == VehicleClass.AutoRickshaw)
            {
                list.Add((new Vector3(0, R, hb), true));
                list.Add((new Vector3(-ht, R, -hb), false)); list.Add((new Vector3(ht, R, -hb), false));
            }
            else
            {
                list.Add((new Vector3(-ht, R, hb), true)); list.Add((new Vector3(ht, R, hb), true));
                list.Add((new Vector3(-ht, R, -hb), false)); list.Add((new Vector3(ht, R, -hb), false));
                if (s.Wheels == 6) { list.Add((new Vector3(-ht, R, -hb + 1.3f), false)); list.Add((new Vector3(ht, R, -hb + 1.3f), false)); }
            }
            float tw = s.TwoWheeler ? 0.12f : s.Class == VehicleClass.AutoRickshaw ? 0.12f : s.Wheels == 6 ? 0.35f : 0.22f;
            foreach (var (p, front) in list)
            {
                var go = new GameObject(front ? "WheelFront" : "WheelRear");
                go.transform.SetParent(root, false);
                go.transform.localPosition = p;
                var mb = new MeshBuilder();
                mb.Cylinder(Vector3.zero, Vector3.right, R, tw, 16, Color.white);
                var hub = new MeshBuilder();
                hub.Cylinder(Vector3.zero, Vector3.right, R * 0.55f, tw + 0.012f, 10, Color.white);
                go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("Tyre");
                go.AddComponent<MeshRenderer>().sharedMaterial = Materials.Tyre;
                var h = new GameObject("Hub");
                h.transform.SetParent(go.transform, false);
                h.AddComponent<MeshFilter>().sharedMesh = hub.ToMesh("Hub");
                h.AddComponent<MeshRenderer>().sharedMaterial = Materials.Chrome;
                rig.Wheels.Add(new WheelVisual { T = go.transform, BaseLocal = p, Front = front, Radius = R });
            }
        }

        static void AddPlates(VehicleSpec s, VehicleRig rig, Transform body)
        {
            float L = s.Length;
            float y = s.TwoWheeler ? 0.72f : s.Class == VehicleClass.AutoRickshaw ? 0.5f : s.WheelRadius * 0.55f + 0.32f;
            if (s.Class == VehicleClass.Bus || s.Class == VehicleClass.Truck) y = 0.75f;
            Color bg = s.Commercial ? new Color(1f, 0.82f, 0.1f) : Color.white;
            if (!s.TwoWheeler) Plate(body, rig.Plate, new Vector3(0, y, L / 2 + 0.07f), 0, bg);
            Plate(body, rig.Plate, new Vector3(0, y, -L / 2 - 0.07f), 180, bg);
        }

        static void Plate(Transform parent, string text, Vector3 pos, float yaw, Color bg)
        {
            var go = new GameObject("Plate");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localRotation = Quaternion.Euler(0, yaw, 0);
            var mb = new MeshBuilder();
            mb.Box(Vector3.zero, new Vector3(0.52f, 0.13f, 0.01f), bg);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("Plate");
            go.AddComponent<MeshRenderer>().sharedMaterial = Materials.Plate;
            Label(go.transform, text, new Vector3(0, 0, 0.007f), 0, 0.045f, Color.black);
        }

        public static TextMesh Label(Transform parent, string text, Vector3 pos, float yaw, float charSize, Color c)
        {
            var go = new GameObject("Text");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localRotation = Quaternion.Euler(0, yaw + 180f, 0); // TextMesh faces -z; flip to face outward
            var tm = go.AddComponent<TextMesh>();
            var f = UIFont();
            if (f != null) { tm.font = f; go.GetComponent<MeshRenderer>().sharedMaterial = f.material; }
            tm.text = text;
            tm.characterSize = charSize;
            tm.fontSize = 48;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.alignment = TextAlignment.Center;
            tm.color = c;
            go.transform.localScale = new Vector3(0.25f, 0.25f, 1f);
            return tm;
        }
    }
}
