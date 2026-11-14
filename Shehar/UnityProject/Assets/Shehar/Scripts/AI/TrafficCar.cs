// AI driver for ambient traffic. Follows the real OSM road graph, keeps LEFT on two-way roads (India),
// respects one-way streets, stops for the OSM traffic signals, slows for speed breakers and sharp turns,
// keeps distance from vehicles/pedestrians ahead, honks when stuck, and yields to emergency sirens.
// Runs kinematically for performance; becomes a full physics vehicle when hit or hijacked.
using Shehar.Audio;
using Shehar.City;
using Shehar.Core;
using Shehar.Player;
using Shehar.Vehicles;
using UnityEngine;

namespace Shehar.AI
{
    public sealed class TrafficCar : MonoBehaviour
    {
        public VehicleController Vc;
        public TrafficManager Manager;
        public bool Active = true;
        public float Personality = 1f;    // speed multiplier
        int from, to, prevNode = -1;
        float s;                          // metres along current edge
        float speed;                      // m/s
        float laneOffset;
        float blockedTime, honkCooldown, knockedTime;
        Vector3 smoothPos;
        float visualSteer;
        VehicleAudio audioSrc;
        public bool Knocked { get; private set; }

        RoadGraph G { get { return CityWorld.Instance.Graph; } }

        public void Init(TrafficManager m, int a, int b, float startS)
        {
            Manager = m; from = a; to = b; s = startS; prevNode = -1;
            Active = true; Knocked = false; knockedTime = 0; blockedTime = 0;
            Personality = Random.Range(0.75f, 1.1f);
            speed = 0;
            laneOffset = ComputeLane();
            var p = EdgePoint(); smoothPos = p;
            Vc.Teleport(p, Quaternion.LookRotation(EdgeDir()));
            Vc.IsKinematic = true;
            Vc.Occupied = false;
            Vc.Health = 100; Vc.EngineRunning = true;
            if (audioSrc == null) audioSrc = VehicleAudio.Attach(Vc, false);
        }

        float ComputeLane()
        {
            int e = G.EdgeBetween(from, to);
            if (e < 0) return 0;
            var road = G.RoadOfEdge(e);
            float w = road.width;
            if (road.oneway != 0)
            {
                int lanes = Mathf.Max(1, road.lanes > 0 ? road.lanes : Mathf.RoundToInt(w / 3.3f));
                int lane = Random.Range(0, lanes);
                return -w / 2 + (lane + 0.5f) * w / lanes; // any lane of a one-way road
            }
            // two-way: drive on the LEFT half; two-wheelers hug the kerb
            float lw = Vc.Spec.TwoWheeler ? w * 0.4f : w * 0.25f;
            return lw;
        }

        Vector3 NodePos(int n) { return new Vector3(G.X[n], Ground.ColliderTop, G.Z[n]); }
        Vector3 EdgeDir() { Vector3 d = NodePos(to) - NodePos(from); d.y = 0; return d.sqrMagnitude < 1e-4f ? Vector3.forward : d.normalized; }
        float EdgeLen() { return Vector3.Distance(NodePos(from), NodePos(to)); }

        Vector3 EdgePoint()
        {
            Vector3 a = NodePos(from), dir = EdgeDir();
            Vector3 left = new Vector3(-dir.z, 0, dir.x);
            return a + dir * s + left * laneOffset;
        }

        int ChooseNext(int node, int cameFrom)
        {
            int deg = G.Degree(node);
            int best = -1; float bestScore = float.MinValue;
            Vector3 inDir = (NodePos(node) - NodePos(cameFrom)).normalized;
            for (int k = 0; k < deg; k++)
            {
                var nb = G.GetNeighbor(node, k);
                if (!nb.CarOk || nb.Node == cameFrom) continue;
                var road = G.RoadOfEdge(nb.Edge);
                if (road.drivable == 0) continue;
                Vector3 outDir = (NodePos(nb.Node) - NodePos(node)).normalized;
                float straight = Vector3.Dot(inDir, outDir);
                float score = straight * 1.2f + road.rank * 0.25f + Random.value * 1.6f;
                if (road.rank <= 1) score -= 2.5f; // avoid driveways / parking aisles
                if (!G.IsMain(nb.Node)) score -= 5f;
                if (score > bestScore) { bestScore = score; best = nb.Node; }
            }
            if (best < 0)
            {
                // dead end: U-turn if legal
                for (int k = 0; k < deg; k++) { var nb = G.GetNeighbor(node, k); if (nb.CarOk) return nb.Node; }
            }
            return best;
        }

        void FixedUpdate()
        {
            if (Vc == null || CityWorld.Instance == null) return;
            if (!Active)
            {
                if (Knocked) knockedTime += Time.fixedDeltaTime; // stays a physics wreck until despawned
                return;
            }
            float dt = Time.fixedDeltaTime;
            float len = EdgeLen();
            int e = G.EdgeBetween(from, to);
            var road = e >= 0 ? G.RoadOfEdge(e) : null;
            float limit = road != null ? road.speed / 3.6f : 8f;
            float target = Mathf.Min(limit * Personality * 1.05f, Vc.Spec.MaxSpeed * 0.9f);
            float remain = len - s;

            // turn ahead
            Vector3 dir = EdgeDir();
            int next = PeekNext();
            if (next >= 0)
            {
                Vector3 nd = (NodePos(next) - NodePos(to)).normalized;
                float turn = Vector3.Angle(dir, nd);
                if (turn > 25f && remain < 25f) target = Mathf.Min(target, Mathf.Lerp(9f, 4.5f, (turn - 25f) / 90f) + remain * 0.25f);
            }
            int flags = G.Flags[to];
            // speed breakers (OSM traffic_calming)
            if ((flags & NodeFlags.SpeedBump) != 0 && remain < 20f) target = Mathf.Min(target, 3.5f + remain * 0.15f);
            // traffic signals at the end of this edge
            var sig = CityWorld.Instance.Signals;
            if ((flags & NodeFlags.TrafficSignal) != 0 && sig != null)
            {
                var light = sig.StateFor(to, dir);
                float stopDist = remain - 6f;
                bool mustStop = light == SignalLight.Red || (light == SignalLight.Amber && stopDist > speed * 1.2f);
                if (mustStop && stopDist > -2f) target = Mathf.Min(target, Mathf.Max(0, stopDist) * 0.6f);
            }
            // obstacles ahead (vehicles, pedestrians, the player)
            float look = 4f + speed * 1.7f;
            Vector3 front = transform.position + Vector3.up * 0.8f + transform.forward * (Vc.Spec.Length * 0.5f + 0.3f);
            if (Physics.SphereCast(front, Vc.Spec.TwoWheeler ? 0.5f : 0.9f, transform.forward, out RaycastHit hit, look, Layers.VehicleMask | Layers.CharacterMask, QueryTriggerInteraction.Collide))
            {
                if (hit.rigidbody != Vc.Body)
                {
                    float gap = hit.distance - 1.5f;
                    target = Mathf.Min(target, Mathf.Max(0, gap) * 0.55f);
                }
            }
            // yield to emergency vehicles with siren: slow and squeeze left
            var pv = PlayerController.Instance != null ? PlayerController.Instance.Vehicle : null;
            if (pv != null && pv.SirenOn && (pv.transform.position - transform.position).sqrMagnitude < 50f * 50f) target = Mathf.Min(target, 3f);

            float accel = target > speed ? 2.6f : 7f;
            speed = Mathf.MoveTowards(speed, target, accel * dt);
            if (speed < 0.3f && target < 0.5f)
            {
                blockedTime += dt;
                honkCooldown -= dt;
                if (blockedTime > 2.5f && honkCooldown <= 0 && Random.value < 0.02f) { audioSrc?.Horn(); honkCooldown = Random.Range(2f, 6f); }
            }
            else blockedTime = 0;
            if (Random.value < 0.0004f) audioSrc?.Horn(); // ambient Indian-traffic honking

            s += speed * dt;
            int guard = 0;
            while (s >= len && guard++ < 4)
            {
                s -= len;
                int nx = PeekNext();
                if (nx < 0) { s = len; speed = 0; break; }
                prevNode = from; from = to; to = nx; peek = -1;
                laneOffset = Mathf.Lerp(laneOffset, ComputeLane(), 1f);
                len = EdgeLen();
                dir = EdgeDir();
            }

            Vector3 p = EdgePoint();
            smoothPos = Vector3.Lerp(smoothPos, p, 1f - Mathf.Exp(-dt * 6f));
            Vector3 vel = (smoothPos - Vc.Body.position) / dt;
            Quaternion want = Quaternion.LookRotation(dir);
            Quaternion rot = Quaternion.RotateTowards(Vc.Body.rotation, want, (40f + speed * 18f) * dt);
            float yawRate = Mathf.DeltaAngle(Vc.Body.rotation.eulerAngles.y, rot.eulerAngles.y) / dt;
            visualSteer = Mathf.Lerp(visualSteer, Mathf.Clamp(yawRate * 0.4f, -Vc.Spec.SteerDeg, Vc.Spec.SteerDeg), dt * 5f);
            Vc.Body.MovePosition(smoothPos);
            Vc.Body.MoveRotation(rot);
            Vc.SetKinematicMotion(vel, visualSteer, speed < target - 0.5f || target < 0.5f);
        }

        int peek = -1, peekFrom = -1;
        int PeekNext()
        {
            if (peek >= 0 && peekFrom == to) return peek;
            peekFrom = to;
            peek = ChooseNext(to, from);
            return peek;
        }

        void OnCollisionEnter(Collision c)
        {
            if (!Active || c.rigidbody == null || c.rigidbody.isKinematic) return;
            if (c.relativeVelocity.magnitude < 4f) return;
            // hit by a physics vehicle: become a ragdoll vehicle for a while
            Active = false; Knocked = true; knockedTime = 0;
            Vc.IsKinematic = false;
            Vc.Body.velocity = transform.forward * speed;
            Vc.In = new VehicleInput { Handbrake = true };
            audioSrc?.Horn();
        }

        /// <summary>Player takes this vehicle: AI stops and the driver walks away.</summary>
        public void Hijack()
        {
            Active = false; Knocked = false;
            if (Manager != null) Manager.Release(this);
            Vc.IsKinematic = false;
            Vc.Body.velocity = transform.forward * speed;
            Vector3 exit = Vc.transform.TransformPoint(Vc.Rig.ExitLocal + new Vector3(0.6f, 0, 0));
            PedestrianManager.Instance?.SpawnFleeing(exit);
            Destroy(this);
        }
    }
}
