// Mission framework: coroutine-scripted missions built from reusable stages (go to a place, stop, timed legs,
// dialogue). All destinations are real OSM landmarks / POIs / road nodes of the loaded city - nothing invented.
using System;
using System.Collections;
using System.Collections.Generic;
using Shehar.Audio;
using Shehar.City;
using Shehar.Core;
using Shehar.Navigation;
using Shehar.Player;
using Shehar.UI;
using Shehar.Vehicles;
using UnityEngine;

namespace Shehar.Missions
{
    public sealed class Mission
    {
        public string Id, Title, Category, Brief, StartLabel, Requirement;
        public int Reward;
        public bool Story;
        public Vector3 Start;
        public Func<MissionRunner, IEnumerator> Body;
        public Func<string> Check; // returns a reason string when the mission cannot start now
    }

    public sealed class MissionRunner : MonoBehaviour
    {
        public static MissionRunner Instance { get; private set; }
        public readonly List<Mission> All = new List<Mission>();
        public Mission Active { get; private set; }
        public string Objective;
        public float TimeLeft;
        public bool TimerRunning;
        public string Prompt { get; private set; }
        public Mission NearbyStart { get; private set; }
        public long PendingReward;
        public event Action<Mission, bool> Finished;

        bool needVehicle; float outOfVehicle;
        readonly List<GameObject> startMarkers = new List<GameObject>();
        GameObject objectiveMarker;
        readonly List<GameObject> spawned = new List<GameObject>();
        Coroutine running;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        public CityWorld World { get { return CityWorld.Instance; } }
        public PlayerController Player { get { return PlayerController.Instance; } }
        public GPSNavigator Gps { get { return GPSNavigator.Instance; } }

        public void Build()
        {
            All.Clear();
            MissionLibrary.Register(this);
        }

        public void ShowStartMarkers(bool show)
        {
            foreach (var m in startMarkers) if (m != null) Destroy(m);
            startMarkers.Clear();
            if (!show) return;
            foreach (var m in All)
            {
                if (m.Story && GameState.Mode != GameMode.Story && GameState.Mode != GameMode.Career && GameState.Mode != GameMode.Missions) continue;
                if (m.Category == "Driving test" && GameState.Mode != GameMode.DrivingSimulator && GameState.Mode != GameMode.Career) continue;
                var b = MarkerFactory.Beacon(transform, new Color(1f, 0.78f, 0.1f, 0.45f), 2.5f, 25f);
                b.transform.position = new Vector3(m.Start.x, 0, m.Start.z);
                b.name = "MissionStart_" + m.Id;
                startMarkers.Add(b);
            }
        }

        public bool IsVisibleStart(Mission m)
        {
            foreach (var g in startMarkers) if (g != null && g.name == "MissionStart_" + m.Id) return true;
            return false;
        }

        public string CannotStart(Mission m)
        {
            if (Active != null) return "Another mission is in progress";
            if (m.Check != null) return m.Check();
            return null;
        }

        public void Begin(Mission m)
        {
            string why = CannotStart(m);
            if (why != null) { HudMessages.Notify(why, new Color(1f, 0.6f, 0.4f)); return; }
            Active = m; Objective = ""; TimerRunning = false; outOfVehicle = 0; needVehicle = false; PendingReward = m.Reward;
            HudMessages.Big(m.Title.ToUpperInvariant(), m.Category, new Color(1f, 0.8f, 0.2f), 3.5f);
            running = StartCoroutine(Wrap(m));
        }

        IEnumerator Wrap(Mission m)
        {
            yield return m.Body(this);
            if (Active == m) Complete(PendingReward);
        }

        public void Complete(long reward, string note = null)
        {
            var m = Active;
            if (m == null) return;
            Cleanup();
            var save = SaveData.Current;
            save.Earn(reward);
            save.MissionsPassed++;
            if (!save.CompletedMissions.Contains(m.Id)) save.CompletedMissions.Add(m.Id);
            if (m.Story && GameState.Mode == GameMode.Story) save.StoryChapter = Mathf.Max(save.StoryChapter, MissionLibrary.StoryIndex(m.Id) + 1);
            if (GameState.PersistentProgress) save.Save();
            HudMessages.Big("MISSION PASSED", "+" + Fmt.INR(reward) + (note != null ? "   " + note : ""), new Color(0.35f, 0.95f, 0.45f), 5f);
            UiSound.Play(SoundSynth.Jingle(true));
            Finished?.Invoke(m, true);
        }

        public void Fail(string reason)
        {
            var m = Active;
            if (m == null) return;
            if (running != null) StopCoroutine(running);
            StopAllCoroutines();
            Cleanup();
            SaveData.Current.MissionsFailed++;
            HudMessages.Big("MISSION FAILED", reason, new Color(1f, 0.35f, 0.3f), 5f);
            UiSound.Play(SoundSynth.Jingle(false));
            Finished?.Invoke(m, false);
        }

        public void Abort() { if (Active != null) Fail("Mission abandoned"); }

        void Cleanup()
        {
            Active = null; Objective = null; TimerRunning = false;
            if (Gps != null) Gps.Clear();
            if (objectiveMarker != null) Destroy(objectiveMarker);
            foreach (var g in spawned) if (g != null) Destroy(g);
            spawned.Clear();
            if (DrivingRules.Instance != null) DrivingRules.Instance.TestActive = false;
        }

        void Update()
        {
            Prompt = null; NearbyStart = null;
            var pc = Player;
            if (pc == null) return;
            if (Active == null)
            {
                foreach (var m in All)
                {
                    if (!IsVisibleStart(m)) continue;
                    Vector3 d = pc.Position - m.Start; d.y = 0;
                    if (d.magnitude < 9f)
                    {
                        NearbyStart = m;
                        string why = CannotStart(m);
                        Prompt = why == null ? "Press " + GameInput.KeyName(GameInput.Get(GameAction.Interact)) + " to start: " + m.Title + "  (" + Fmt.INR(m.Reward) + ")" : m.Title + " - " + why;
                        if (why == null && GameInput.Down(GameAction.Interact)) Begin(m);
                        break;
                    }
                }
                return;
            }
            if (TimerRunning)
            {
                TimeLeft -= Time.deltaTime;
                if (TimeLeft <= 0) { Fail("Out of time"); return; }
            }
            if (needVehicle)
            {
                if (!pc.InVehicle) { outOfVehicle += Time.deltaTime; if (outOfVehicle > 45f) { Fail("You abandoned the job"); return; } }
                else outOfVehicle = 0;
                if (pc.InVehicle && pc.Vehicle.Wrecked) { Fail("Your vehicle was wrecked"); return; }
            }
        }

        // ------------------------------------------------------------------ reusable stages
        public IEnumerator Say(string speaker, string line, float seconds = 4f)
        {
            HudMessages.Say(speaker, line, seconds);
            float t = 0;
            while (t < seconds) { t += Time.deltaTime; yield return null; }
        }

        /// <summary>Drive (or walk) to a position. stop = must come to a halt inside the radius.</summary>
        public IEnumerator GoTo(Vector3 pos, string objective, string label, float radius = 16f, bool vehicle = true, bool stop = false, float timeLimit = -1f, Predicate<VehicleController> vehicleOk = null, string vehicleHint = null)
        {
            pos.y = 0;
            needVehicle = vehicle;
            Gps.SetTarget(pos, label);
            if (objectiveMarker != null) Destroy(objectiveMarker);
            objectiveMarker = MarkerFactory.Beacon(transform, new Color(1f, 0.85f, 0.15f, 0.5f), Mathf.Min(radius * 0.5f, 6f), 40f);
            objectiveMarker.transform.position = pos;
            if (timeLimit > 0) { TimeLeft = timeLimit; TimerRunning = true; }
            while (true)
            {
                var pc = Player;
                bool okVehicle = !vehicle || (pc.InVehicle && (vehicleOk == null || vehicleOk(pc.Vehicle)));
                Objective = okVehicle ? objective : (vehicleHint ?? "Get back in a vehicle") + "  -  " + objective;
                Vector3 d = pc.Position - pos; d.y = 0;
                if (d.magnitude < radius && okVehicle)
                {
                    if (!stop || pc.Velocity.magnitude < 2.5f) break;
                    Objective = "Stop the vehicle";
                }
                yield return null;
            }
            TimerRunning = false;
            Gps.Clear();
            if (objectiveMarker != null) Destroy(objectiveMarker);
            UiSound.Play(SoundSynth.Blip());
        }

        /// <summary>Checkpoint sequence (races, tours). Returns when all are passed.</summary>
        public IEnumerator Checkpoints(List<Vector3> pts, string name, float radius, float timeLimit, bool vehicle = true)
        {
            needVehicle = vehicle;
            if (timeLimit > 0) { TimeLeft = timeLimit; TimerRunning = true; }
            for (int i = 0; i < pts.Count; i++)
            {
                Vector3 p = pts[i]; p.y = 0;
                Gps.SetTarget(p, name + " checkpoint " + (i + 1));
                if (objectiveMarker != null) Destroy(objectiveMarker);
                objectiveMarker = MarkerFactory.Beacon(transform, new Color(0.2f, 0.85f, 1f, 0.5f), radius * 0.6f, 30f);
                objectiveMarker.transform.position = p;
                while (true)
                {
                    var pc = Player;
                    Objective = name + ": checkpoint " + (i + 1) + " / " + pts.Count + (vehicle && !pc.InVehicle ? "  (get in a vehicle!)" : "");
                    Vector3 d = pc.Position - p; d.y = 0;
                    if (d.magnitude < radius && (!vehicle || pc.InVehicle)) break;
                    yield return null;
                }
                UiSound.Play(SoundSynth.Blip());
            }
            TimerRunning = false;
            Gps.Clear();
            if (objectiveMarker != null) Destroy(objectiveMarker);
        }

        public GameObject SpawnPerson(Vector3 pos, Outfit? outfit = null)
        {
            var go = new GameObject("MissionNPC");
            go.transform.position = new Vector3(pos.x, Ground.ColliderTop, pos.z);
            var h = Humanoid.Build(go.transform, new System.Random(Environment.TickCount), outfit);
            h.Speed = 0;
            var beacon = MarkerFactory.Beacon(go.transform, new Color(0.3f, 0.6f, 1f, 0.6f), 0.6f, 2.6f);
            beacon.transform.localPosition = Vector3.zero;
            spawned.Add(go);
            return go;
        }

        public void Track(GameObject go) { spawned.Add(go); }

        /// <summary>Estimated legal driving time between two points along the road graph (seconds) at avg speed.</summary>
        public float RouteSeconds(Vector3 a, Vector3 b, float avgSpeed, out float meters)
        {
            var g = World.Graph;
            var path = g.FindPath(g.NearestNode(a.x, a.z, 500f), g.NearestNode(b.x, b.z, 500f), true);
            meters = path != null ? g.PathLength(path) : Vector3.Distance(a, b) * 1.4f;
            return meters / avgSpeed;
        }

        /// <summary>Road node position on the main network near p, offset to the kerb (left side).</summary>
        public Vector3 Kerb(Vector3 p)
        {
            Quaternion r;
            return World.RoadPointNear(p, out r, 1.5f);
        }
    }
}
