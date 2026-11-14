// Traffic-rule enforcement for Driving Simulator mode, Career mode and the licence test:
// speed limit of the current OSM road, red lights at the real signals, wrong-way driving on one-way streets,
// collisions and hitting pedestrians. Fines are game values (inspired by, not equal to, Motor Vehicles Act fines).
using System.Collections.Generic;
using Shehar.AI;
using Shehar.City;
using Shehar.Core;
using Shehar.Player;
using Shehar.UI;
using Shehar.Vehicles;
using UnityEngine;

namespace Shehar.Missions
{
    public sealed class DrivingRules : MonoBehaviour
    {
        public static DrivingRules Instance { get; private set; }
        public bool TestActive;
        public int Score = 100;
        public int CurrentLimit { get; private set; }
        public readonly List<string> Log = new List<string>();
        float tick, overT, wrongT, cooldownSpeed, cooldownWrong;
        int lastSignal = -1;
        VehicleController hooked;

        public bool Enforcing { get { return TestActive || GameState.Mode == GameMode.DrivingSimulator || GameState.Mode == GameMode.Career; } }

        void Awake() { Instance = this; PedestrianManager.PlayerHitPedestrian += OnPedestrian; }
        void OnDestroy() { if (Instance == this) Instance = null; PedestrianManager.PlayerHitPedestrian -= OnPedestrian; }

        public void BeginTest() { TestActive = true; Score = 100; Log.Clear(); }

        void Violation(string what, int points, long fine)
        {
            if (!Enforcing) return;
            Score = Mathf.Max(0, Score - points);
            Log.Add(what);
            if (Log.Count > 8) Log.RemoveAt(0);
            if (GameState.FinesApply && fine > 0)
            {
                SaveData.Current.Earn(-fine);
                HudMessages.Money(-fine, "Fine: " + what);
            }
            else HudMessages.Notify("Violation: " + what + "  (-" + points + ")", new Color(1f, 0.5f, 0.4f));
        }

        void OnPedestrian(float kmh) { Violation("Hit a pedestrian", 25, 2000); }

        void OnCrash(float dv, Collision c)
        {
            if (dv > 3.5f && c.rigidbody != null) Violation("Collision with a vehicle", 5, 500);
        }

        void Update()
        {
            var pc = PlayerController.Instance; var world = CityWorld.Instance;
            if (pc == null || world == null || world.Ctx == null) return;
            var vc = pc.Vehicle;
            if (vc != hooked)
            {
                if (hooked != null) hooked.Crashed -= OnCrash;
                hooked = vc;
                if (vc != null) vc.Crashed += OnCrash;
            }
            if (vc == null || Time.time < tick) return;
            const float dt = 0.2f;
            tick = Time.time + dt;
            cooldownSpeed -= dt; cooldownWrong -= dt;
            var g = world.Graph;
            Vector3 p = vc.transform.position, v = vc.Body.velocity; v.y = 0;
            float speed = v.magnitude;
            int e = g.NearestEdge(p.x, p.z, out float t, out float dist, 20f);
            if (e < 0) { CurrentLimit = 0; return; }
            var road = g.RoadOfEdge(e);
            CurrentLimit = road.speed;
            if (!Enforcing) return;

            // overspeeding (10 % tolerance)
            if (vc.SpeedKmh > road.speed * 1.1f + 2f) { overT += dt; if (overT > 2f && cooldownSpeed <= 0) { Violation("Overspeeding: " + Mathf.RoundToInt(vc.SpeedKmh) + " km/h in a " + road.speed + " zone", 5, 1000); cooldownSpeed = 8f; overT = 0; } }
            else overT = 0;

            // wrong way on one-way streets
            int dir = world.Index.edgeDir[e];
            if (dir != 3 && speed > 3f && dist < road.width * 0.6f)
            {
                int a = world.Index.edgeA[e], b = world.Index.edgeB[e];
                Vector3 legal = new Vector3(g.X[b] - g.X[a], 0, g.Z[b] - g.Z[a]).normalized;
                if (dir == 2) legal = -legal;
                if (Vector3.Dot(v.normalized, legal) < -0.6f) { wrongT += dt; if (wrongT > 1.5f && cooldownWrong <= 0) { Violation("Wrong-way driving on " + (road.DisplayName != "" ? road.DisplayName : "a one-way street"), 10, 500); cooldownWrong = 10f; wrongT = 0; } }
                else wrongT = 0;
            }

            // red lights at OSM signal nodes
            int n = g.NearestNode(p.x, p.z, 9f, false, node => (g.Flags[node] & NodeFlags.TrafficSignal) != 0);
            if (n >= 0 && n != lastSignal && speed > 3f && world.Signals != null)
            {
                lastSignal = n;
                if (world.Signals.StateFor(n, v) == SignalLight.Red) Violation("Jumped a red light", 10, 1000);
            }
            if (n < 0) lastSignal = -1;
        }
    }
}
