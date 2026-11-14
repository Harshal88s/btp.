// Pedestrians wander the footpaths of loaded streets (and sometimes cross mid-block, as Pune pedestrians do).
// They get knocked down when hit by a moving vehicle; hits by the player are reported for fines / scoring.
using System;
using System.Collections.Generic;
using Shehar.City;
using Shehar.Player;
using Shehar.Vehicles;
using UnityEngine;
using Random = UnityEngine.Random;

namespace Shehar.AI
{
    public sealed class Pedestrian : MonoBehaviour
    {
        public Humanoid Model;
        Vector3 target;
        float speed, downTimer, repath;
        bool down, fleeing;
        public bool IsDown { get { return down; } }

        public void Init(Vector3 pos, bool flee)
        {
            transform.position = new Vector3(pos.x, Ground.ColliderTop, pos.z);
            down = false; Model.Down = false;
            fleeing = flee;
            speed = flee ? 3.2f : Random.Range(1.0f, 1.6f);
            target = transform.position + Random.insideUnitSphere * 15f;
            target.y = Ground.ColliderTop;
            repath = 0;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (down)
            {
                downTimer += dt;
                if (downTimer > 6f) { down = false; Model.Down = false; fleeing = true; speed = 2.5f; }
                return;
            }
            Vector3 to = target - transform.position; to.y = 0;
            repath -= dt;
            if (to.magnitude < 1.2f || repath <= 0)
            {
                target = PedestrianManager.Instance != null ? PedestrianManager.Instance.NextTarget(transform.position) : transform.position;
                repath = 25f;
                if (fleeing && Random.value < 0.3f) { fleeing = false; speed = Random.Range(1.0f, 1.6f); }
                return;
            }
            Vector3 step = to.normalized * speed * dt;
            transform.position += step;
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(to), dt * 6f);
            Model.Speed = speed;
        }

        void OnTriggerEnter(Collider c)
        {
            if (down || c.attachedRigidbody == null) return;
            var vc = c.attachedRigidbody.GetComponent<VehicleController>();
            if (vc == null) return;
            if (vc.SpeedKmh < 7f) return;
            down = true; downTimer = 0; Model.Down = true;
            Vector3 push = c.attachedRigidbody.velocity; push.y = 0;
            transform.position += push.normalized * 1.5f;
            var pc = PlayerController.Instance;
            if (pc != null && pc.Vehicle == vc) PedestrianManager.RaisePlayerHit(vc.SpeedKmh);
        }
    }

    public sealed class PedestrianManager : MonoBehaviour
    {
        public static PedestrianManager Instance { get; private set; }
        public static event Action<float> PlayerHitPedestrian;
        public int BaseMax = 26;
        readonly List<Pedestrian> peds = new List<Pedestrian>();
        readonly Stack<Pedestrian> pool = new Stack<Pedestrian>();
        readonly List<Vector3> spots = new List<Vector3>();
        float nextTick;
        System.Random rng = new System.Random(11);

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        public static void RaisePlayerHit(float kmh) { PlayerHitPedestrian?.Invoke(kmh); }

        public Vector3 NextTarget(Vector3 from)
        {
            var world = CityWorld.Instance;
            if (world == null) return from;
            world.SidewalkSpotsNear(from, 8f, 45f, spots);
            if (spots.Count == 0) return from + new Vector3(Random.Range(-10f, 10f), 0, Random.Range(-10f, 10f));
            // prefer continuing roughly the same way
            return spots[Random.Range(0, spots.Count)];
        }

        void Update()
        {
            var world = CityWorld.Instance; var player = PlayerController.Instance;
            if (world == null || world.Ctx == null || player == null || Time.time < nextTick) return;
            nextTick = Time.time + 0.4f;
            Vector3 pp = player.Position;
            int max = Mathf.RoundToInt(BaseMax * GameSettings.Current.PedestrianDensity);
            for (int i = peds.Count - 1; i >= 0; i--)
            {
                var p = peds[i];
                if ((p.transform.position - pp).magnitude > 140f) { peds.RemoveAt(i); p.gameObject.SetActive(false); pool.Push(p); }
            }
            if (peds.Count >= max) return;
            world.SidewalkSpotsNear(pp, 25f, 110f, spots);
            for (int k = 0; k < 3 && peds.Count < max && spots.Count > 0; k++)
                Spawn(spots[Random.Range(0, spots.Count)], false);
        }

        public void SpawnFleeing(Vector3 pos) { Spawn(pos, true); }

        void Spawn(Vector3 pos, bool flee)
        {
            Pedestrian p;
            if (pool.Count > 0) { p = pool.Pop(); p.gameObject.SetActive(true); }
            else
            {
                var go = new GameObject("Pedestrian");
                go.transform.SetParent(transform, false);
                go.layer = Layers.Character;
                var rb = go.AddComponent<Rigidbody>(); rb.isKinematic = true;
                var cap = go.AddComponent<CapsuleCollider>(); cap.isTrigger = true; cap.height = 1.7f; cap.radius = 0.35f; cap.center = new Vector3(0, 0.85f, 0);
                p = go.AddComponent<Pedestrian>();
                p.Model = Humanoid.Build(go.transform, rng);
                Layers.SetRecursive(go, Layers.Character);
            }
            p.Init(pos, flee);
            peds.Add(p);
        }

        public void ClearAll()
        {
            foreach (var p in peds) if (p != null) Destroy(p.gameObject);
            peds.Clear();
            while (pool.Count > 0) { var p = pool.Pop(); if (p != null) Destroy(p.gameObject); }
        }
    }
}
