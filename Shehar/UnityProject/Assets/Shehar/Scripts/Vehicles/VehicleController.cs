// Raycast-suspension vehicle physics shared by every road vehicle (player-driven or physics-released traffic).
// Per wheel: spring/damper suspension, slip-angle lateral force and drive/brake force combined in a friction
// circle; power-limited engine with automatic gearbox (for HUD/audio), aerodynamic drag, anti-roll bars and an
// upright stabiliser for two/three-wheelers. AI traffic runs this component in kinematic mode (no physics) until
// it is hit or hijacked.
using System;
using Shehar.City;
using UnityEngine;

namespace Shehar.Vehicles
{
    public struct VehicleInput
    {
        public float Throttle;   // -1 (brake / reverse) .. 1 (accelerate)
        public float Steer;      // -1 left .. 1 right
        public bool Handbrake, Boost;
    }

    [RequireComponent(typeof(Rigidbody))]
    public sealed class VehicleController : MonoBehaviour
    {
        public static float WeatherGrip = 1f;

        public VehicleSpec Spec;
        public VehicleRig Rig;
        public Rigidbody Body;
        public VehicleInput In;

        public float Health = 100f;
        public float Fuel;
        public bool EngineRunning = true;
        public bool LightsOn, SirenOn, Occupied, OwnedByPlayer;
        public float ForwardSpeed { get; private set; }
        public float SpeedKmh { get; private set; }
        public int Gear { get; private set; } = 1;
        public float Rpm01 { get; private set; }
        public float TyreSlip { get; private set; }
        public bool Braking { get; private set; }
        public bool Grounded { get; private set; }
        public bool Wrecked { get { return Health <= 0; } }
        public float VisualSteer;     // degrees; AI sets this in kinematic mode
        public event Action<float, Collision> Crashed;

        struct PhysWheel
        {
            public Vector3 Mount; public bool Front, Drive, Grounded;
            public float PrevComp, HitDist, Comp;
        }
        PhysWheel[] wheels;
        int[] visualMap;
        float restLen, springK, damperC, steerAngle, cgHeight;
        int driveCount, rearCount;
        bool lastBraking, lastLights;
        float beaconTimer;

        public bool IsKinematic
        {
            get { return Body != null && Body.isKinematic; }
            set
            {
                if (Body == null) return;
                Body.isKinematic = value;
                Body.interpolation = value ? RigidbodyInterpolation.None : RigidbodyInterpolation.Interpolate;
                Body.collisionDetectionMode = value ? CollisionDetectionMode.Discrete : CollisionDetectionMode.ContinuousDynamic;
            }
        }

        /// <summary>Creates a complete drivable vehicle (model + physics) at a position.</summary>
        public static VehicleController Spawn(VehicleSpec spec, Vector3 pos, Quaternion rot, Color? paint = null, string plate = null, bool kinematic = false, bool rider = false)
        {
            var rng = new System.Random(Guid.NewGuid().GetHashCode());
            Color c = paint ?? spec.Palette[rng.Next(spec.Palette.Length)];
            var go = VehicleFactory.Build(spec, c, plate ?? VehicleFactory.RandomPlate(rng), rider);
            go.transform.SetPositionAndRotation(pos, rot);
            var vc = go.AddComponent<VehicleController>();
            vc.Setup(spec, go.GetComponent<VehicleRig>(), kinematic);
            return vc;
        }

        void Setup(VehicleSpec spec, VehicleRig rig, bool kinematic)
        {
            Spec = spec; Rig = rig;
            Fuel = spec.FuelLitres * 0.75f;
            Body = GetComponent<Rigidbody>();
            Body.mass = spec.Mass;
            Body.drag = 0f;
            Body.angularDrag = spec.TwoWheeler ? 2f : 0.6f;
            float R = spec.WheelRadius;
            restLen = spec.TwoWheeler ? 0.22f : spec.Mass > 5000 ? 0.32f : spec.Class == VehicleClass.SUV || spec.Class == VehicleClass.Police ? 0.34f : 0.28f;

            // collider: body box above the wheels (suspension holds it off the ground)
            float bottom = R * 0.75f + restLen * 0.25f;
            var bc = gameObject.AddComponent<BoxCollider>();
            float w = spec.TwoWheeler ? 0.55f : spec.Width;
            bc.size = new Vector3(w, Mathf.Max(0.4f, spec.Height - bottom), spec.Length);
            bc.center = new Vector3(0, bottom + bc.size.y / 2, 0);
            var pm = new PhysicMaterial("VehicleBody") { dynamicFriction = 0.3f, staticFriction = 0.3f, bounciness = 0.05f, frictionCombine = PhysicMaterialCombine.Minimum };
            bc.sharedMaterial = pm;

            cgHeight = spec.TwoWheeler ? 0.55f : Mathf.Lerp(0.45f, 1.1f, Mathf.InverseLerp(1.2f, 3.4f, spec.Height));
            Body.centerOfMass = new Vector3(0, cgHeight * (spec.TwoWheeler || spec.Class == VehicleClass.AutoRickshaw ? 0.6f : 0.75f), 0);

            float hb = spec.WheelBase / 2, ht = spec.Track / 2;
            float my = R + restLen * 0.5f;
            if (spec.TwoWheeler) ht = 0.2f; // two outrigger contact points per wheel keep the bike from falling over
            if (spec.Class == VehicleClass.AutoRickshaw)
                wheels = new[]
                {
                    new PhysWheel { Mount = new Vector3(0, my, hb), Front = true },
                    new PhysWheel { Mount = new Vector3(-ht, my, -hb), Drive = true },
                    new PhysWheel { Mount = new Vector3(ht, my, -hb), Drive = true },
                };
            else
            {
                bool rwd = spec.RearDrive;
                wheels = new[]
                {
                    new PhysWheel { Mount = new Vector3(-ht, my, hb), Front = true, Drive = !rwd },
                    new PhysWheel { Mount = new Vector3(ht, my, hb), Front = true, Drive = !rwd },
                    new PhysWheel { Mount = new Vector3(-ht, my, -hb), Drive = rwd },
                    new PhysWheel { Mount = new Vector3(ht, my, -hb), Drive = rwd },
                };
            }
            driveCount = 0; rearCount = 0;
            foreach (var wh in wheels) { if (wh.Drive) driveCount++; if (!wh.Front) rearCount++; }
            int n = wheels.Length;
            springK = spec.Mass * 9.81f / (n * restLen * 0.5f);
            damperC = 2f * 0.38f * Mathf.Sqrt(springK * spec.Mass / n);

            visualMap = new int[rig.Wheels.Count];
            for (int i = 0; i < rig.Wheels.Count; i++)
            {
                float best = float.MaxValue;
                for (int j = 0; j < n; j++)
                {
                    var a = rig.Wheels[i].BaseLocal; var b = wheels[j].Mount;
                    float d = (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z);
                    if (d < best) { best = d; visualMap[i] = j; }
                }
            }
            Layers.SetRecursive(gameObject, Layers.Vehicle);
            IsKinematic = kinematic;
            if (!kinematic) Body.WakeUp();
        }

        void FixedUpdate()
        {
            if (Body == null || Body.isKinematic || wheels == null) return;
            float dt = Time.fixedDeltaTime;
            Vector3 up = transform.up, fwd = transform.forward;
            Vector3 v = Body.velocity;
            float speed = v.magnitude;
            ForwardSpeed = Vector3.Dot(v, fwd);
            SpeedKmh = speed * 3.6f;

            float thr = Mathf.Clamp(In.Throttle, -1f, 1f);
            bool canDrive = EngineRunning && Fuel > 0 && !Wrecked;
            float drive = 0, brake = 0; bool reverse = false;
            if (thr > 0.01f) { if (ForwardSpeed < -0.6f) brake = thr; else drive = thr; }
            else if (thr < -0.01f) { if (ForwardSpeed > 0.6f) brake = -thr; else { drive = thr; reverse = true; } }
            if (!canDrive) drive = 0;
            Braking = brake > 0.1f || In.Handbrake;

            float power = Spec.PowerKW * 1000f * (In.Boost ? 1.3f : 1f);
            float tractionCap = Spec.Mass * 9.81f * Spec.Grip * (Spec.RearDrive ? 0.55f : 0.5f) * 1.6f;
            float engineF = Mathf.Min(tractionCap, power / Mathf.Max(Mathf.Abs(ForwardSpeed), 2.5f));
            float vmax = reverse ? 7f : Spec.MaxSpeed * (In.Boost ? 1.08f : 1f);
            float over = Mathf.Abs(ForwardSpeed) / vmax;
            if (over > 1f) engineF = 0; else if (over > 0.92f) engineF *= (1f - over) / 0.08f;
            float driveForce = drive * engineF;

            float steerMax = Spec.SteerDeg * Mathf.Lerp(1f, Spec.TwoWheeler ? 0.3f : 0.22f, Mathf.Clamp01(speed / 38f));
            steerAngle = Mathf.MoveTowards(steerAngle, In.Steer * steerMax, Spec.SteerDeg * 3.5f * dt);
            VisualSteer = steerAngle;

            int n = wheels.Length;
            float brakeTotal = Spec.BrakeG * Spec.Mass * 9.81f;
            float mu = Spec.Grip * WeatherGrip;
            bool parking = Mathf.Abs(thr) < 0.01f && speed < 0.8f && !In.Handbrake;
            float slipMax = 0;
            Grounded = false;
            float liftPoint = Spec.TwoWheeler ? cgHeight * 0.9f : cgHeight * 0.55f;

            for (int i = 0; i < n; i++)
            {
                ref PhysWheel wh = ref wheels[i];
                Vector3 origin = transform.TransformPoint(wh.Mount);
                float R = Spec.WheelRadius;
                if (Physics.Raycast(origin, -up, out RaycastHit hit, restLen + R, Layers.WheelMask, QueryTriggerInteraction.Ignore))
                {
                    wh.Grounded = true; Grounded = true;
                    float comp = Mathf.Clamp(1f - (hit.distance - R) / restLen, 0f, 1.2f);
                    float compVel = (comp - wh.PrevComp) * restLen / dt;
                    wh.PrevComp = comp; wh.Comp = comp; wh.HitDist = hit.distance;
                    float fz = Mathf.Max(0f, springK * comp * restLen + damperC * compVel);
                    if (comp >= 1f) fz += (comp - 1f) * springK * restLen * 4f; // bump stop
                    Body.AddForceAtPosition(up * fz, origin);

                    Vector3 wf = wh.Front ? Quaternion.AngleAxis(steerAngle, up) * fwd : fwd;
                    wf = Vector3.ProjectOnPlane(wf, hit.normal).normalized;
                    Vector3 wr = Vector3.Cross(hit.normal, wf);
                    Vector3 pv = Body.GetPointVelocity(hit.point);
                    float vLong = Vector3.Dot(pv, wf), vLat = Vector3.Dot(pv, wr);

                    bool hb = In.Handbrake && !wh.Front;
                    float wMu = mu * (hb ? 0.45f : 1f);
                    float fmax = wMu * Mathf.Max(fz, 0f);
                    float slipAngle = Mathf.Atan2(vLat, Mathf.Abs(vLong) + 0.6f);
                    float fy = -Mathf.Clamp(slipAngle / 0.13f, -1f, 1f) * fmax;
                    float massShare = Spec.Mass / n;
                    if (speed < 4f)
                    {
                        float fyLow = Mathf.Clamp(-vLat * massShare / dt * 0.5f, -fmax, fmax);
                        fy = Mathf.Lerp(fyLow, fy, speed / 4f);
                    }

                    float fx = 0;
                    if (wh.Drive && driveCount > 0) fx += driveForce / driveCount;
                    float bf = brake * brakeTotal / n;
                    if (hb) bf += brakeTotal * 0.7f / Mathf.Max(1, rearCount);
                    if (parking) bf = brakeTotal / n;
                    if (bf > 0) fx -= Mathf.Sign(vLong) * Mathf.Min(bf, Mathf.Abs(vLong) * massShare / dt);
                    fx -= vLong * massShare * 0.012f; // rolling resistance

                    float tot = Mathf.Sqrt(fx * fx + fy * fy);
                    if (tot > fmax && tot > 1e-3f) { float s = fmax / tot; fx *= s; fy *= s; }
                    slipMax = Mathf.Max(slipMax, Mathf.Abs(slipAngle) / 0.35f, hb ? Mathf.Abs(vLong) / 15f : 0f);
                    Body.AddForceAtPosition(wf * fx + wr * fy, hit.point + up * liftPoint);
                }
                else
                {
                    wh.Grounded = false; wh.PrevComp = 0; wh.Comp = 0; wh.HitDist = restLen + Spec.WheelRadius;
                }
            }
            TyreSlip = Mathf.Clamp01(slipMax);

            // anti-roll bars
            if (n == 4)
            {
                AntiRoll(0, 1, Spec.Mass * 6f);
                AntiRoll(2, 3, Spec.Mass * 4f);
            }
            else if (n == 3) AntiRoll(1, 2, Spec.Mass * 8f);

            // aero
            Body.AddForce(-v * speed * 0.5f * 1.2f * Spec.Drag * Spec.FrontalArea);
            if (Grounded) Body.AddForce(-up * speed * speed * Spec.Mass * 0.0025f);

            // keep two- and three-wheelers upright (the rider balances them)
            if (Spec.TwoWheeler || Spec.Class == VehicleClass.AutoRickshaw)
            {
                Vector3 axis = Vector3.Cross(up, Vector3.up);
                float roll = Vector3.Dot(axis, fwd);
                float rollRate = Vector3.Dot(Body.angularVelocity, fwd);
                Body.AddTorque(fwd * (roll * 40f - rollRate * 6f), ForceMode.Acceleration);
            }

            // gearbox (display + audio only; the engine model is power-limited)
            int gears = Spec.Class == VehicleClass.AutoRickshaw ? 4 : Spec.Class == VehicleClass.Scooter ? 1 : 5;
            float vf = Mathf.Clamp01(Mathf.Abs(ForwardSpeed) / Spec.MaxSpeed);
            float gf = vf * gears;
            Gear = reverse && ForwardSpeed < -0.3f ? -1 : Mathf.Clamp(1 + Mathf.FloorToInt(gf), 1, gears);
            float inGear = gears == 1 ? vf : gf - Mathf.Floor(gf);
            Rpm01 = Mathf.Clamp01(Mathf.Lerp(Rpm01, 0.18f + inGear * 0.75f + Mathf.Abs(drive) * 0.12f, dt * 6f));
            if (!EngineRunning || Fuel <= 0) Rpm01 = 0;

            // fuel (time-compressed consumption so refuelling matters inside the play area)
            if (EngineRunning && Fuel > 0)
                Fuel = Mathf.Max(0, Fuel - (Mathf.Abs(ForwardSpeed) * dt * Spec.LitresPer100Km / 100000f * 12f * (0.6f + Mathf.Abs(drive))
                                            + dt * Spec.LitresPer100Km * 0.00004f));
        }

        void AntiRoll(int l, int r, float stiffness)
        {
            var a = wheels[l]; var b = wheels[r];
            float diff = a.Comp - b.Comp;
            if (Mathf.Abs(diff) < 1e-4f) return;
            float f = diff * stiffness;
            if (a.Grounded) Body.AddForceAtPosition(transform.up * f, transform.TransformPoint(a.Mount));
            if (b.Grounded) Body.AddForceAtPosition(transform.up * -f, transform.TransformPoint(b.Mount));
        }

        void Update()
        {
            if (Rig == null) return;
            float dt = Time.deltaTime;
            bool kin = IsKinematic;
            float steer = kin ? VisualSteer : steerAngle;
            float fwdSpeed = kin ? Vector3.Dot(kinVelocity, transform.forward) : ForwardSpeed;
            for (int i = 0; i < Rig.Wheels.Count; i++)
            {
                var wv = Rig.Wheels[i];
                float drop = 0;
                if (!kin && wheels != null)
                {
                    var ph = wheels[visualMap[i]];
                    drop = Mathf.Clamp(ph.HitDist - wv.Radius - restLen * 0.5f, -restLen * 0.5f, restLen * 0.5f);
                }
                wv.T.localPosition = wv.BaseLocal - new Vector3(0, drop, 0);
                wv.Spin = (wv.Spin + fwdSpeed / wv.Radius * dt * Mathf.Rad2Deg) % 360f;
                wv.T.localRotation = Quaternion.Euler(0, wv.Front ? steer : 0, 0) * Quaternion.Euler(wv.Spin, 0, 0);
            }
            if (Spec.TwoWheeler && Rig.Body != null)
            {
                float sp = kin ? kinVelocity.magnitude : Body.velocity.magnitude;
                float lean = -steer / Mathf.Max(1f, Spec.SteerDeg) * Mathf.Clamp01(sp / 6f) * 28f;
                Rig.Body.localRotation = Quaternion.Slerp(Rig.Body.localRotation, Quaternion.Euler(0, 0, lean), dt * 6f);
            }
            if (Braking != lastBraking || LightsOn != lastLights)
            {
                lastBraking = Braking; lastLights = LightsOn;
                if (Rig.TailLights != null) Rig.TailLights.sharedMaterial = Braking ? Materials.LightRear : VehicleFactory.TailDim;
                if (Rig.HeadLights != null) Rig.HeadLights.sharedMaterial = LightsOn ? Materials.LightFront : Materials.LightOff;
            }
            if (Rig.Beacons != null)
            {
                beaconTimer += dt;
                bool on = SirenOn && (beaconTimer % 0.5f) < 0.25f;
                if (Rig.Beacons[0] != null) Rig.Beacons[0].sharedMaterial = on ? Materials.SignalRed : Materials.SignalOff;
                if (Rig.Beacons[1] != null) Rig.Beacons[1].sharedMaterial = SirenOn && !on ? BlueBeacon : Materials.SignalOff;
            }
        }

        static Material blueBeacon;
        static Material BlueBeacon
        {
            get
            {
                if (blueBeacon == null)
                {
                    blueBeacon = new Material(Materials.SignalGreen) { name = "BeaconBlue" };
                    blueBeacon.color = new Color(0.1f, 0.3f, 1f);
                    blueBeacon.SetColor("_EmissionColor", new Color(0.1f, 0.3f, 1f) * 2.5f);
                }
                return blueBeacon;
            }
        }

        // kinematic (AI) velocity for wheel spin / audio
        Vector3 kinVelocity;
        public void SetKinematicMotion(Vector3 velocity, float visualSteer, bool braking)
        {
            kinVelocity = velocity;
            VisualSteer = visualSteer;
            Braking = braking;
            SpeedKmh = velocity.magnitude * 3.6f;
            ForwardSpeed = Vector3.Dot(velocity, transform.forward);
            Rpm01 = Mathf.Lerp(Rpm01, 0.2f + Mathf.Clamp01(velocity.magnitude / Mathf.Max(1, Spec.MaxSpeed)) * 0.7f, Time.deltaTime * 3f);
        }

        void OnCollisionEnter(Collision c)
        {
            if (Body == null || Body.isKinematic) return;
            float dv = c.impulse.magnitude / Body.mass;
            if (dv < 1.5f) return;
            float robustness = 2200f / (Spec.Mass + 1200f);
            if (dv > 2.5f) Health = Mathf.Max(0, Health - (dv - 2.5f) * 6.5f * robustness);
            if (Health <= 0) EngineRunning = false;
            Crashed?.Invoke(dv, c);
        }

        /// <summary>Puts the vehicle back on the nearest road, upright, facing along it.</summary>
        public void ResetOnRoad()
        {
            var world = CityWorld.Instance;
            Vector3 p = transform.position; Quaternion r = Quaternion.LookRotation(Vector3.ProjectOnPlane(transform.forward, Vector3.up));
            if (world != null) p = world.RoadPointNear(transform.position, out r);
            p.y = Ground.ColliderTop + 0.3f;
            Teleport(p, r);
        }

        public void Teleport(Vector3 p, Quaternion r)
        {
            bool kin = IsKinematic;
            if (!kin) { Body.velocity = Vector3.zero; Body.angularVelocity = Vector3.zero; }
            Body.position = p; Body.rotation = r;
            transform.SetPositionAndRotation(p, r);
            if (wheels != null) for (int i = 0; i < wheels.Length; i++) wheels[i].PrevComp = 0.5f;
        }

        public void Repair() { Health = 100f; EngineRunning = true; }
    }
}
