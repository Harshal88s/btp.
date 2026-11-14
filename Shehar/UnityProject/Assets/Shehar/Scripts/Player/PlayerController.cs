// The player: walks around on foot (CharacterController) and drives any road vehicle. Handles entering /
// exiting (right-hand side - Indian vehicles are right-hand drive), taking vehicles from traffic, horn,
// headlights, siren, vehicle reset, river (water) detection and distance tracking.
using System;
using Shehar.Audio;
using Shehar.City;
using Shehar.Vehicles;
using UnityEngine;

namespace Shehar.Player
{
    public sealed class PlayerController : MonoBehaviour
    {
        public static PlayerController Instance { get; private set; }

        public CharacterController Cc { get; private set; }
        public Humanoid Model { get; private set; }
        public VehicleController Vehicle { get; private set; }
        public bool InVehicle { get { return Vehicle != null; } }
        public Transform Focus { get { return InVehicle ? Vehicle.transform : transform; } }
        public Vector3 Position { get { return Focus.position; } }
        public Vector3 Velocity { get { return InVehicle ? Vehicle.Body.velocity : planarVel; } }
        public bool InputEnabled = true;
        /// <summary>Test / autopilot hook: when set, overrides throttle and steering input while driving.</summary>
        public float? ForcedThrottle, ForcedSteer;
        public VehicleController NearbyVehicle { get; private set; }
        public string Status;           // transient hint for the HUD (e.g. "Press R to flip vehicle")
        public float FootSpeed { get { return planarVel.magnitude; } }

        public event Action<VehicleController> EnteredVehicle, ExitedVehicle;
        public event Action Drowned;

        Vector3 planarVel; float vy;
        float waterCheck, waterTime, flipTime;
        VehicleAudio audioCache;

        public static PlayerController Create(Vector3 pos, Quaternion rot)
        {
            var go = new GameObject("Player");
            go.transform.SetPositionAndRotation(pos, rot);
            go.layer = Layers.Character;
            var pc = go.AddComponent<PlayerController>();
            pc.Cc = go.AddComponent<CharacterController>();
            pc.Cc.height = 1.75f; pc.Cc.radius = 0.3f; pc.Cc.center = new Vector3(0, 0.9f, 0);
            pc.Cc.stepOffset = 0.35f; pc.Cc.slopeLimit = 50f;
            pc.Model = Humanoid.Build(go.transform, new System.Random(7), Outfit.ShirtTrousers, new Color32(30, 90, 170, 255));
            Layers.SetRecursive(go, Layers.Character);
            return pc;
        }

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        void Update()
        {
            Status = null;
            if (InVehicle) DriveUpdate(); else FootUpdate();
            if (Time.time > waterCheck) { waterCheck = Time.time + 0.4f; CheckWater(); }
        }

        // ------------------------------------------------------------------ on foot
        void FootUpdate()
        {
            float dt = Time.deltaTime;
            Vector3 input = Vector3.zero;
            bool sprint = false;
            if (InputEnabled)
            {
                input = new Vector3(GameInput.Horizontal, 0, GameInput.Vertical);
                sprint = GameInput.Held(GameAction.Sprint);
            }
            float yaw = CameraRig.Instance != null ? CameraRig.Instance.Yaw : transform.eulerAngles.y;
            Vector3 dir = Quaternion.Euler(0, yaw, 0) * Vector3.ClampMagnitude(input, 1f);
            float speed = sprint ? 6.2f : 2.6f;
            planarVel = Vector3.MoveTowards(planarVel, dir * speed, dt * 18f);
            if (Cc.isGrounded)
            {
                vy = -1f;
                if (InputEnabled && GameInput.Down(GameAction.Handbrake)) vy = 5f;
            }
            else vy -= 20f * dt;
            Cc.Move((planarVel + Vector3.up * vy) * dt);
            if (planarVel.sqrMagnitude > 0.05f)
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(planarVel), dt * 12f);
            Model.Speed = planarVel.magnitude;
            if (transform.position.y < -5f) transform.position = new Vector3(transform.position.x, 1f, transform.position.z);

            NearbyVehicle = FindVehicle();
            if (InputEnabled && GameInput.Down(GameAction.EnterExit) && NearbyVehicle != null) EnterVehicle(NearbyVehicle);
        }

        readonly Collider[] overlap = new Collider[16];
        VehicleController FindVehicle()
        {
            int n = Physics.OverlapSphereNonAlloc(transform.position + Vector3.up, 4.5f, overlap, Layers.VehicleMask, QueryTriggerInteraction.Ignore);
            VehicleController best = null; float bd = float.MaxValue;
            for (int i = 0; i < n; i++)
            {
                var rb = overlap[i].attachedRigidbody;
                if (rb == null) continue;
                var vc = rb.GetComponent<VehicleController>();
                if (vc == null || vc.Occupied) continue;
                float d = (rb.position - transform.position).sqrMagnitude;
                if (d < bd) { bd = d; best = vc; }
            }
            return best;
        }

        public void EnterVehicle(VehicleController vc)
        {
            if (vc == null) return;
            var ai = vc.GetComponent<AI.TrafficCar>();
            if (ai != null) ai.Hijack(); // the driver gets out and walks off
            vc.IsKinematic = false;
            vc.Occupied = true;
            Vehicle = vc;
            Cc.enabled = false;
            Transform seatParent = vc.Spec.TwoWheeler && vc.Rig.Body != null ? vc.Rig.Body : vc.transform;
            transform.SetParent(seatParent, false);
            transform.localPosition = vc.Rig.DriverSeat - new Vector3(0, 0.9f, 0) * (vc.Spec.TwoWheeler ? 0.95f : 1f);
            transform.localRotation = Quaternion.identity;
            Model.Speed = 0;
            Model.Riding = vc.Spec.TwoWheeler;
            Model.Seated = !vc.Spec.TwoWheeler;
            planarVel = Vector3.zero;
            audioCache = VehicleAudio.Attach(vc, true);
            vc.LightsOn = World.DayNightCycle.Instance != null && World.DayNightCycle.Instance.IsNight;
            EnteredVehicle?.Invoke(vc);
        }

        public void ExitVehicle(bool force = false)
        {
            var vc = Vehicle;
            if (vc == null) return;
            if (!force && vc.Body.velocity.magnitude > 7f) { Status = "Slow down to get out"; return; }
            Vector3 exit = vc.transform.TransformPoint(vc.Rig.ExitLocal);
            if (Physics.CheckCapsule(exit + Vector3.up * 0.4f, exit + Vector3.up * 1.5f, 0.3f, Layers.WorldMask | Layers.VehicleMask, QueryTriggerInteraction.Ignore))
            {
                Vector3 other = vc.Rig.ExitLocal; other.x = -other.x;
                exit = vc.transform.TransformPoint(other);
                if (Physics.CheckCapsule(exit + Vector3.up * 0.4f, exit + Vector3.up * 1.5f, 0.3f, Layers.WorldMask | Layers.VehicleMask, QueryTriggerInteraction.Ignore))
                    exit = vc.transform.position + Vector3.up * (vc.Spec.Height + 0.3f);
            }
            exit.y = Mathf.Max(exit.y, Ground.ColliderTop + 0.05f);
            transform.SetParent(null, true);
            transform.SetPositionAndRotation(exit, Quaternion.Euler(0, vc.transform.eulerAngles.y, 0));
            Cc.enabled = true;
            Model.Seated = false; Model.Riding = false;
            vc.In = new VehicleInput { Handbrake = true };
            vc.Occupied = false;
            vc.OwnedByPlayer = true;
            if (audioCache != null) audioCache.SetPlayer(false);
            Vehicle = null;
            ExitedVehicle?.Invoke(vc);
        }

        // ------------------------------------------------------------------ driving
        void DriveUpdate()
        {
            var vc = Vehicle;
            if (vc == null) return;
            if (ForcedThrottle.HasValue) { vc.In = new VehicleInput { Throttle = ForcedThrottle.Value, Steer = ForcedSteer ?? 0f }; return; }
            if (!InputEnabled) { vc.In = new VehicleInput { Handbrake = vc.SpeedKmh < 5 }; return; }
            vc.In = new VehicleInput
            {
                Throttle = GameInput.Vertical,
                Steer = GameInput.Horizontal,
                Handbrake = GameInput.Held(GameAction.Handbrake),
                Boost = GameInput.Held(GameAction.Sprint),
            };
            if (GameInput.Held(GameAction.Horn) && audioCache != null) audioCache.Horn();
            if (GameInput.Down(GameAction.Lights)) vc.LightsOn = !vc.LightsOn;
            if (GameInput.Down(GameAction.Siren) && vc.Spec.HornKind == "siren") vc.SirenOn = !vc.SirenOn;
            if (GameInput.Down(GameAction.Reset)) vc.ResetOnRoad();
            if (GameInput.Down(GameAction.EnterExit)) { ExitVehicle(); return; }

            if (vc.transform.up.y < 0.3f && vc.SpeedKmh < 8f)
            {
                flipTime += Time.deltaTime;
                if (flipTime > 1.5f) Status = "Vehicle overturned - press " + GameInput.KeyName(GameInput.Get(GameAction.Reset)) + " to reset";
            }
            else flipTime = 0;
            if (vc.Wrecked) Status = "Vehicle wrecked - press " + GameInput.KeyName(GameInput.Get(GameAction.EnterExit)) + " to get out";
            else if (vc.Fuel <= 0) Status = "Out of fuel! Press " + GameInput.KeyName(GameInput.Get(GameAction.Interact)) + " to call roadside fuel delivery (" + Fmt.INR(300) + ")";
            SaveData.Current.DistanceKm += vc.Body.velocity.magnitude * Time.deltaTime / 1000f;
        }

        void CheckWater()
        {
            var world = CityWorld.Instance;
            if (world == null || world.Ctx == null) return;
            Vector3 p = Position;
            if (world.IsWater(p))
            {
                waterTime += 0.4f;
                if (waterTime >= 0.8f)
                {
                    waterTime = 0;
                    Quaternion r;
                    Vector3 safe = world.RoadPointNear(p, out r);
                    if (InVehicle)
                    {
                        Vehicle.Health = Mathf.Max(0, Vehicle.Health - 25f);
                        Vehicle.Teleport(new Vector3(safe.x, Ground.ColliderTop + 0.3f, safe.z), r);
                    }
                    else
                    {
                        Cc.enabled = false;
                        transform.position = new Vector3(safe.x, Ground.ColliderTop + 0.1f, safe.z);
                        Cc.enabled = true;
                    }
                    AudioSource.PlayClipAtPoint(SoundSynth.Splash(), p, VehicleAudio.MasterVolume);
                    Drowned?.Invoke();
                }
            }
            else waterTime = 0;
        }

        public void TeleportTo(Vector3 p, Quaternion r)
        {
            if (InVehicle) { Vehicle.Teleport(p, r); return; }
            Cc.enabled = false;
            transform.SetPositionAndRotation(p, r);
            Cc.enabled = true;
        }
    }
}
