// Entry point and state machine. Boots automatically in ANY scene (RuntimeInitializeOnLoadMethod), so the
// project needs no hand-authored scene content: open the project, open Assets/Scenes/Main.unity (or any
// empty scene) and press Play.
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Shehar.AI;
using Shehar.Audio;
using Shehar.City;
using Shehar.Missions;
using Shehar.Navigation;
using Shehar.Player;
using Shehar.UI;
using Shehar.Vehicles;
using Shehar.World;
using UnityEngine;

namespace Shehar
{
    public sealed class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        enum Screen { Main, CitySelect, ModeSelect, Garage, Missions, Career, Settings, Controls, Loading, Playing }
        enum Overlay { None, Pause, Map, Missions, Garage, Settings, Controls }

        Screen screen = Screen.Main, settingsBack = Screen.Main;
        Overlay overlay = Overlay.None;
        Camera cam;
        MenuScene menu;
        GameObject worldRoot;
        readonly Hud hud = new Hud();
        float loadProgress; string loadLabel = "";
        string selectedCity = "pune";
        GameMode selectedMode = GameMode.FreeRoam;
        string sessionVehicle = "hatch";
        string garageSel = "hatch";
        Vector2 scroll;
        GameAction? rebinding;
        VehicleController deliveredVehicle;
        float nextLandmarkCheck;
        string prompt; System.Action promptAction;
        readonly List<string> tips = new List<string>
        {
            "India drives on the LEFT. AI traffic keeps left on two-way roads - so should you.",
            "FC Road runs one-way northbound and JM Road southbound, exactly as mapped in OpenStreetMap.",
            "Traffic signals are placed at the real OSM signal locations. Jumping a red costs points in Driving Simulator.",
            "Speed breakers are real too (OSM traffic_calming). Hit them fast and your suspension will tell you.",
            "Press M for the city map. Right-click anywhere (or on a landmark) to set a GPS route.",
            "Out of fuel? Stop at any of Pune's petrol pumps on the map (green dots) and press F.",
            "Take an auto-rickshaw from traffic with E to start Rickshaw Fares from the Swargate marker.",
            "The Mula-Mutha is not for driving. Keep to the bridges.",
        };

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (Instance != null) return;
            var go = new GameObject("Shehar");
            DontDestroyOnLoad(go);
            go.AddComponent<GameManager>();
        }

        void Awake() { Instance = this; }

        void Start()
        {
            Application.targetFrameRate = 120;
            Time.fixedDeltaTime = 1f / 60f; // smoother raycast-suspension vehicle physics
            QualitySettings.vSyncCount = 1;
            Materials.Init();
            cam = Camera.main;
            if (cam == null)
            {
                var cgo = new GameObject("Main Camera") { tag = "MainCamera" };
                cam = cgo.AddComponent<Camera>();
                cgo.AddComponent<AudioListener>();
            }
            if (cam.GetComponent<AudioListener>() == null && FindObjectOfType<AudioListener>() == null) cam.gameObject.AddComponent<AudioListener>();
            DontDestroyOnLoad(cam.gameObject);
            cam.farClipPlane = 1600f;
            cam.allowHDR = true;
            VehicleAudio.MasterVolume = GameSettings.Current.Volume;
            AudioListener.volume = 1f;
            menu = MenuScene.Create(cam);
            if (!CityWorld.CityAvailable("pune"))
                HudMessages.Notify("City data missing: run Tools/osm_pipeline (see README)", UIKit.Bad, 20f);
        }

        // ================================================================== flow
        /// <summary>Starts a city directly (used by automated PlayMode tests and command-line runs).</summary>
        public void StartDirect(string cityId, GameMode mode)
        {
            selectedCity = cityId; selectedMode = mode;
            StartGame();
        }

        public bool IsPlaying { get { return screen == Screen.Playing; } }

        void StartGame()
        {
            GameState.Mode = selectedMode;
            GameState.CityId = selectedCity;
            SaveData.Reload();
            StartCoroutine(LoadRoutine());
        }

        IEnumerator LoadRoutine()
        {
            screen = Screen.Loading; overlay = Overlay.None;
            loadProgress = 0; loadLabel = "Preparing...";
            if (menu != null) { Destroy(menu.gameObject); menu = null; }
            yield return null;
            worldRoot = new GameObject("World");
            var world = worldRoot.AddComponent<CityWorld>();
            world.LoadRadius = GameSettings.Current.DrawDistance;
            world.NearRadius = Mathf.Min(400f, world.LoadRadius * 0.55f);
            yield return world.Load(selectedCity, (p, l) => { loadProgress = p; loadLabel = l; });
            if (world.Ctx == null) { loadLabel = "Could not load " + selectedCity + ". See console."; yield break; }

            DayNightCycle.Create(worldRoot.transform).Hour = selectedMode == GameMode.Story ? 8.5f : 9.5f;
            WeatherSystem.Create(worldRoot.transform);
            worldRoot.AddComponent<TrafficManager>();
            worldRoot.AddComponent<PedestrianManager>();
            GPSNavigator.Create(worldRoot.transform);
            var runner = new GameObject("Missions").AddComponent<MissionRunner>();
            runner.transform.SetParent(worldRoot.transform, false);
            runner.Build();
            runner.ShowStartMarkers(selectedMode != GameMode.FreeRoam);
            worldRoot.AddComponent<DrivingRules>();

            // player + starting vehicle at the spawn landmark
            Quaternion rot;
            Vector3 spawn = world.RoadPointNear(new Vector3(world.Index.spawnX, 0, world.Index.spawnZ), out rot);
            var player = PlayerController.Create(spawn + rot * Vector3.right * 3.5f, rot);
            player.transform.SetParent(null);
            player.ExitedVehicle += v => TrafficManager.Instance?.TrackAbandoned(v);
            player.Drowned += () => HudMessages.Notify("Splash! You ended up in the river. Stick to the bridges.", new Color(0.5f, 0.75f, 1f));
            world.Focus = player.transform;
            var rig = CameraRig.Create(cam);
            string vid = GameState.PersistentProgress ? SaveData.Current.SelectedVehicle : sessionVehicle;
            var vc = VehicleController.Spawn(VehicleSpec.Get(vid), spawn + Vector3.up * 0.4f, rot);
            DamageSmoke.Attach(vc);
            vc.Fuel = vc.Spec.FuelLitres * 0.8f;
            deliveredVehicle = vc;
            player.EnterVehicle(vc);
            screen = Screen.Playing;
            GameState.Playing = true;
            HudMessages.Clear();
            HudMessages.Big(world.Index.name.ToUpperInvariant(), Hud.ModeName(selectedMode) + "  ·  " + world.Index.spawnName, UIKit.Saffron, 4f);
            HudMessages.Notify("Map data © OpenStreetMap contributors (ODbL)", UIKit.Dim, 8f);
            HudMessages.Notify("W/S drive · A/D steer · Space handbrake · E exit · C camera · M map · Tab missions", Color.white, 10f);
            if (selectedMode == GameMode.Story) StartCoroutine(StoryIntro(runner));
            if (selectedMode == GameMode.DrivingSimulator)
                HudMessages.Notify("Driving Simulator: speed limits, red lights, one-ways and collisions are enforced.", UIKit.Saffron, 10f);
        }

        IEnumerator StoryIntro(MissionRunner runner)
        {
            yield return new WaitForSeconds(3f);
            string id = MissionLibrary.StoryId(SaveData.Current.StoryChapter);
            var m = runner.All.FirstOrDefault(x => x.Id == id);
            if (m != null) runner.Begin(m);
            else HudMessages.Notify("Story complete for " + CityWorld.Instance.Index.name + " - more chapters coming with new cities.", UIKit.Good, 8f);
        }

        void QuitToMenu()
        {
            StopAllCoroutines();
            Time.timeScale = 1f;
            GameState.Playing = false; GameState.Paused = false;
            if (GameState.PersistentProgress) SaveData.Current.Save(); else SaveData.Reload();
            TrafficManager.Instance?.ClearAll();
            PedestrianManager.Instance?.ClearAll();
            if (PlayerController.Instance != null)
            {
                var v = PlayerController.Instance.Vehicle;
                Destroy(PlayerController.Instance.gameObject);
                if (v != null) Destroy(v.gameObject);
            }
            if (deliveredVehicle != null) Destroy(deliveredVehicle.gameObject);
            if (worldRoot != null) Destroy(worldRoot);
            var rig = cam.GetComponent<CameraRig>(); if (rig != null) Destroy(rig);
            HudMessages.Clear();
            Cursor.lockState = CursorLockMode.None; Cursor.visible = true;
            menu = MenuScene.Create(cam);
            menu.Selected = selectedCity;
            screen = Screen.Main; overlay = Overlay.None;
        }

        // ================================================================== update
        void Update()
        {
            bool playing = screen == Screen.Playing;
            if (!playing) { Cursor.lockState = CursorLockMode.None; Cursor.visible = true; return; }
            if (rebinding != null) return;

            if (Input.GetKeyDown(GameInput.Get(GameAction.Pause)) || Input.GetKeyDown(KeyCode.JoystickButton7))
                overlay = overlay == Overlay.None ? Overlay.Pause : Overlay.None;
            else if (GameInput.Down(GameAction.Map) && (overlay == Overlay.None || overlay == Overlay.Map))
                overlay = overlay == Overlay.Map ? Overlay.None : Overlay.Map;
            else if (GameInput.Down(GameAction.Missions) && (overlay == Overlay.None || overlay == Overlay.Missions))
                overlay = overlay == Overlay.Missions ? Overlay.None : Overlay.Missions;

            bool paused = overlay != Overlay.None;
            GameState.Paused = paused;
            Time.timeScale = paused ? 0f : 1f;
            AudioListener.pause = paused;
            Cursor.lockState = paused ? CursorLockMode.None : CursorLockMode.Locked;
            Cursor.visible = paused;
            var pc = PlayerController.Instance;
            if (pc != null) pc.InputEnabled = !paused;
            if (CameraRig.Instance != null) CameraRig.Instance.LookEnabled = !paused;
            if (paused || pc == null) return;

            UpdateInteractions(pc);
            if (Time.time > nextLandmarkCheck) { nextLandmarkCheck = Time.time + 1f; CheckLandmarks(pc); }
        }

        void UpdateInteractions(PlayerController pc)
        {
            prompt = null; promptAction = null;
            var mr = MissionRunner.Instance;
            if (mr != null && mr.Prompt != null) { prompt = mr.Prompt; return; } // runner handles its own key
            var world = CityWorld.Instance;
            string key = GameInput.KeyName(GameInput.Get(GameAction.Interact));
            if (pc.InVehicle)
            {
                var v = pc.Vehicle;
                var fuel = world.NearestPoi(pc.Position, "fuel", 22f);
                if (fuel != null && v.SpeedKmh < 6f && v.Fuel < v.Spec.FuelLitres - 0.5f)
                {
                    float litres = v.Spec.FuelLitres - v.Fuel;
                    long cost = FreeVehicles ? 0 : (long)Mathf.Ceil(litres * 105f); // ~Rs 105 / L petrol in Pune (approx.)
                    prompt = "Press " + key + " to fill " + litres.ToString("0.0") + " L at " + (string.IsNullOrEmpty(fuel.name) ? "the petrol pump" : fuel.name) + (cost > 0 ? " (" + Fmt.INR(cost) + ")" : "");
                    promptAction = () =>
                    {
                        if (cost > 0 && !SaveData.Current.Spend(cost)) { HudMessages.Notify("Not enough money", UIKit.Bad); return; }
                        v.Fuel = v.Spec.FuelLitres;
                        if (cost > 0) HudMessages.Money(-cost, "Fuel");
                        else HudMessages.Notify("Tank full", UIKit.Good);
                        UiSound.Play(SoundSynth.Cash());
                    };
                }
                else if (v.Fuel <= 0)
                {
                    promptAction = () =>
                    {
                        if (!FreeVehicles && !SaveData.Current.Spend(300)) { HudMessages.Notify("Not enough money", UIKit.Bad); return; }
                        v.Fuel = 5f; HudMessages.Money(FreeVehicles ? 0 : -300, "Roadside fuel delivery (5 L)");
                    };
                }
            }
            if (promptAction == null)
            {
                foreach (var s in world.Vendors)
                {
                    if ((s - pc.Position).sqrMagnitude > (pc.InVehicle ? 64f : 16f)) continue;
                    if (pc.InVehicle && pc.Vehicle.SpeedKmh > 5f) break;
                    string[] snacks = { "vada pav", "cutting chai", "misal pav", "poha", "bhel" };
                    string snack = snacks[Mathf.Abs(Mathf.RoundToInt(s.x * 7 + s.z * 13)) % snacks.Length];
                    prompt = "Press " + key + " to buy " + snack + " (" + Fmt.INR(25) + ")";
                    promptAction = () =>
                    {
                        if (!SaveData.Current.Spend(25)) { HudMessages.Notify("Not enough money", UIKit.Bad); return; }
                        HudMessages.Money(-25, char.ToUpper(snack[0]) + snack.Substring(1) + " - delicious!");
                        if (pc.InVehicle) pc.Vehicle.Health = Mathf.Min(100, pc.Vehicle.Health + 0); // just flavour
                    };
                    break;
                }
            }
            if (promptAction != null && GameInput.Down(GameAction.Interact)) { promptAction(); promptAction = null; }
            if (prompt == null && !pc.InVehicle && pc.NearbyVehicle != null)
                prompt = "Press " + GameInput.KeyName(GameInput.Get(GameAction.EnterExit)) + " to drive the " + pc.NearbyVehicle.Spec.Name + (pc.NearbyVehicle.GetComponent<TrafficCar>() != null ? " (take it from its driver)" : "");
        }

        void CheckLandmarks(PlayerController pc)
        {
            var world = CityWorld.Instance;
            foreach (var l in world.Index.landmarks)
            {
                Vector3 d = new Vector3(l.x, 0, l.z) - pc.Position; d.y = 0;
                if (d.magnitude > 70f || SaveData.Current.LandmarksVisited.Contains(l.name)) continue;
                SaveData.Current.VisitLandmark(l.name);
                HudMessages.Notify("Landmark discovered: " + l.name, new Color(0.5f, 0.8f, 1f), 6f);
                if (GameState.Mode == GameMode.Career) { SaveData.Current.Earn(100); HudMessages.Money(100, "Explorer bonus"); }
            }
        }

        bool FreeVehicles { get { return GameState.Mode == GameMode.FreeRoam || GameState.Mode == GameMode.Missions || GameState.Mode == GameMode.DrivingSimulator; } }

        void DeliverVehicle(string id)
        {
            var pc = PlayerController.Instance;
            if (pc == null) return;
            if (!FreeVehicles && !SaveData.Current.Spend(100)) { HudMessages.Notify("Delivery costs " + Fmt.INR(100), UIKit.Bad); return; }
            if (deliveredVehicle != null && !deliveredVehicle.Occupied) Destroy(deliveredVehicle.gameObject);
            Quaternion rot;
            Vector3 p = CityWorld.Instance.RoadPointNear(pc.Position + pc.Focus.forward * 12f, out rot);
            var vc = VehicleController.Spawn(VehicleSpec.Get(id), p + Vector3.up * 0.4f, rot);
            DamageSmoke.Attach(vc);
            vc.Fuel = vc.Spec.FuelLitres * 0.8f;
            vc.LightsOn = DayNightCycle.Instance != null && DayNightCycle.Instance.IsNight;
            deliveredVehicle = vc;
            if (pc.InVehicle) pc.ExitVehicle(true);
            pc.EnterVehicle(vc);
            HudMessages.Notify(vc.Spec.Name + " delivered" + (FreeVehicles ? "" : " (" + Fmt.INR(100) + ")"), UIKit.Good);
            overlay = Overlay.None;
        }

        // ================================================================== GUI
        void OnGUI()
        {
            UIKit.Begin();
            float W = UIKit.W, H = UIKit.H;
            if (rebinding != null && Event.current.type == EventType.KeyDown && Event.current.keyCode != KeyCode.None)
            {
                if (Event.current.keyCode != KeyCode.Escape) GameInput.Set(rebinding.Value, Event.current.keyCode);
                rebinding = null; Event.current.Use();
            }
            if (rebinding != null && Event.current.type == EventType.MouseDown && Event.current.button > 1)
            {
                rebinding = null;
            }
            switch (screen)
            {
                case Screen.Main: MainMenu(W, H); break;
                case Screen.CitySelect: CitySelect(W, H); break;
                case Screen.ModeSelect: ModeSelect(W, H); break;
                case Screen.Garage: Garage(W, H, false); break;
                case Screen.Missions: MissionsCatalog(W, H); break;
                case Screen.Career: Career(W, H); break;
                case Screen.Settings: Settings(W, H, false); break;
                case Screen.Controls: Controls(W, H, false); break;
                case Screen.Loading: Loading(W, H); break;
                case Screen.Playing: Playing(W, H); break;
            }
        }

        void Header(float W, string title, string sub)
        {
            UIKit.Title(new Rect(60, 40, W - 120, 80), title, 56, Color.white);
            UIKit.Rect(new Rect(62, 112, 70, 4), UIKit.Saffron);
            UIKit.Rect(new Rect(132, 112, 70, 4), Color.white);
            UIKit.Rect(new Rect(202, 112, 70, 4), UIKit.IndiaGreen);
            if (sub != null) UIKit.Label(new Rect(62, 124, W - 120, 30), sub, 20, UIKit.Dim);
        }

        void MainMenu(float W, float H)
        {
            if (menu != null) menu.GarageView = false;
            UIKit.Rect(new Rect(0, 0, 560, H), new Color(0, 0, 0, 0.55f));
            UIKit.Title(new Rect(60, 70, 500, 110), "SHEHAR", 96, Color.white);
            UIKit.Label(new Rect(64, 175, 480, 30), "OPEN-WORLD INDIA", 24, UIKit.Saffron, TextAnchor.UpperLeft, true);
            UIKit.Rect(new Rect(64, 210, 80, 5), UIKit.Saffron); UIKit.Rect(new Rect(144, 210, 80, 5), Color.white); UIKit.Rect(new Rect(224, 210, 80, 5), UIKit.IndiaGreen);
            float y = 280;
            if (UIKit.Button(new Rect(60, y, 420, 56), "Start Game")) screen = Screen.CitySelect; y += 66;
            if (UIKit.Button(new Rect(60, y, 420, 56), "Select City")) screen = Screen.CitySelect; y += 66;
            if (UIKit.Button(new Rect(60, y, 420, 56), "Garage")) { screen = Screen.Garage; garageSel = SaveData.Current.SelectedVehicle; } y += 66;
            if (UIKit.Button(new Rect(60, y, 420, 56), "Missions")) screen = Screen.Missions; y += 66;
            if (UIKit.Button(new Rect(60, y, 420, 56), "Career Progress")) screen = Screen.Career; y += 66;
            if (UIKit.Button(new Rect(60, y, 420, 56), "Settings")) { settingsBack = Screen.Main; screen = Screen.Settings; } y += 66;
            if (UIKit.Button(new Rect(60, y, 420, 56), "Quit")) Application.Quit();
            UIKit.Label(new Rect(60, H - 80, 480, 60), "Prototype build · Pune is playable · Map data © OpenStreetMap contributors (ODbL)", 15, UIKit.Dim);
            DrawToasts();
        }

        void CitySelect(float W, float H)
        {
            if (menu != null) menu.GarageView = false;
            UIKit.Rect(new Rect(0, 0, 620, H), new Color(0, 0, 0, 0.6f));
            Header(620, "Explore India", "Pick a city on the map or from the list. Pins are placed by real latitude / longitude.");
            float y = 170;
            if (menu != null && menu.Selected != null) selectedCity = menu.Selected;
            foreach (var c in CityRegistry.Cities)
            {
                bool ok = c.Available;
                bool sel = selectedCity == c.Id;
                if (UIKit.Button(new Rect(60, y, 500, 46), (sel ? "▶ " : "") + c.Name + "   <size=15>" + c.State + (ok ? "" : "  ·  coming soon") + "</size>", true, ok ? UIKit.Saffron : UIKit.Dim))
                { selectedCity = c.Id; if (menu != null) menu.Selected = c.Id; }
                y += 52;
            }
            var info = CityRegistry.Get(selectedCity);
            var card = new Rect(W - 560, H - 300, 520, 260);
            UIKit.Panel(card);
            UIKit.Title(new Rect(card.x + 24, card.y + 16, 480, 50), info.Name, 40, Color.white);
            UIKit.Label(new Rect(card.x + 26, card.y + 66, 470, 26), info.Lat.ToString("0.0000") + "°N, " + info.Lon.ToString("0.0000") + "°E  ·  " + info.State, 17, UIKit.Dim);
            UIKit.Label(new Rect(card.x + 26, card.y + 96, 470, 90), info.Blurb, 18);
            bool avail = info.Available;
            if (!avail) UIKit.Label(new Rect(card.x + 26, card.y + 180, 470, 30), "City data not generated yet - pipeline: Tools/osm_pipeline", 15, UIKit.Saffron);
            if (UIKit.Button(new Rect(card.x + 24, card.yMax - 64, 220, 48), avail ? "Choose Mode" : "Coming soon", avail)) screen = Screen.ModeSelect;
            if (UIKit.Button(new Rect(card.x + 260, card.yMax - 64, 230, 48), "Back")) screen = Screen.Main;
        }

        void ModeSelect(float W, float H)
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.65f));
            Header(W, "Choose a mode - " + CityRegistry.Get(selectedCity).Name, null);
            var modes = new (GameMode m, string t, string d, bool ok)[]
            {
                (GameMode.FreeRoam, "Free Roam", "Explore the city without restrictions. Every vehicle is free from the garage.", true),
                (GameMode.Story, "Story Mode", "A structured storyline across real Pune landmarks. Progress is saved.", true),
                (GameMode.DrivingSimulator, "Driving Simulator", "Realistic rules: speed limits, red lights, one-way streets and collisions are scored. Includes the licence test.", true),
                (GameMode.Missions, "Mission Mode", "Taxi/rickshaw fares, deliveries, emergency runs, races and exploration challenges.", true),
                (GameMode.Career, "Career Mode", "Earn money, buy vehicles, pay fines and fuel. Everything is saved.", true),
                (GameMode.Multiplayer, "Multiplayer", "Drive the same city with friends. Planned for a future phase.", false),
            };
            float cw = Mathf.Min(560, (W - 180) / 3), ch = 190;
            for (int i = 0; i < modes.Length; i++)
            {
                var m = modes[i];
                var r = new Rect(60 + (i % 3) * (cw + 30), 190 + (i / 3) * (ch + 30), cw, ch);
                UIKit.Panel(r, selectedMode == m.m ? new Color(0.3f, 0.17f, 0.05f, 0.92f) : UIKit.PanelBg);
                UIKit.Title(new Rect(r.x + 20, r.y + 14, r.width - 40, 46), m.t, 32, m.ok ? Color.white : UIKit.Dim);
                UIKit.Label(new Rect(r.x + 22, r.y + 62, r.width - 44, 80), m.d, 18, m.ok ? UIKit.Text : UIKit.Dim);
                if (UIKit.Button(new Rect(r.x + 20, r.yMax - 58, r.width - 40, 44), m.ok ? (selectedMode == m.m ? "Selected" : "Select") : "Future phase", m.ok))
                    selectedMode = m.m;
            }
            float by = 190 + 2 * (ch + 30) + 10;
            if (UIKit.Button(new Rect(60, by, 320, 60), "PLAY", true, UIKit.Good)) StartGame();
            if (UIKit.Button(new Rect(400, by, 240, 60), "Back")) screen = Screen.CitySelect;
        }

        void Loading(float W, float H)
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0.03f, 0.04f, 0.07f, 1f));
            var info = CityRegistry.Get(selectedCity);
            UIKit.Title(new Rect(80, H * 0.3f, W - 160, 100), info.Name.ToUpperInvariant(), 90, Color.white);
            UIKit.Label(new Rect(84, H * 0.3f + 100, W - 160, 30), Hud.ModeName(selectedMode), 24, UIKit.Saffron, TextAnchor.UpperLeft, true);
            UIKit.Bar(new Rect(84, H * 0.62f, W - 168, 22), loadProgress, UIKit.Saffron);
            UIKit.Label(new Rect(84, H * 0.62f + 30, W - 168, 30), loadLabel, 20, UIKit.Dim);
            int tip = Mathf.FloorToInt(Time.unscaledTime / 6f) % tips.Count;
            UIKit.Label(new Rect(84, H * 0.75f, W - 168, 60), "TIP: " + tips[tip], 21);
            UIKit.Label(new Rect(84, H - 60, W - 168, 30), "Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).", 16, UIKit.Dim);
        }

        void Playing(float W, float H)
        {
            if (overlay != Overlay.Map) hud.Draw(prompt);
            switch (overlay)
            {
                case Overlay.Pause: Pause(W, H); break;
                case Overlay.Map: FullMap(W, H); break;
                case Overlay.Missions: MissionsOverlay(W, H); break;
                case Overlay.Garage: Garage(W, H, true); break;
                case Overlay.Settings: Settings(W, H, true); break;
                case Overlay.Controls: Controls(W, H, true); break;
            }
        }

        void Pause(float W, float H)
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.55f));
            UIKit.Panel(new Rect(60, 60, 470, H - 120));
            UIKit.Title(new Rect(90, 80, 400, 60), "PAUSED", 48, Color.white);
            float y = 170;
            if (UIKit.Button(new Rect(90, y, 410, 52), "Resume")) overlay = Overlay.None; y += 60;
            if (UIKit.Button(new Rect(90, y, 410, 52), "City Map")) overlay = Overlay.Map; y += 60;
            if (UIKit.Button(new Rect(90, y, 410, 52), "Missions")) overlay = Overlay.Missions; y += 60;
            if (UIKit.Button(new Rect(90, y, 410, 52), "Garage / Call a vehicle")) { overlay = Overlay.Garage; garageSel = sessionVehicle; } y += 60;
            var mr = MissionRunner.Instance;
            if (mr != null && mr.Active != null) { if (UIKit.Button(new Rect(90, y, 410, 52), "Abandon mission", true, UIKit.Bad)) { mr.Abort(); overlay = Overlay.None; } y += 60; }
            if (PlayerController.Instance != null && PlayerController.Instance.InVehicle)
            { if (UIKit.Button(new Rect(90, y, 410, 52), "Repair vehicle" + (FreeVehicles ? "" : " (" + Fmt.INR(500) + ")"))) { if (FreeVehicles || SaveData.Current.Spend(500)) { PlayerController.Instance.Vehicle.Repair(); overlay = Overlay.None; } } y += 60; }
            if (UIKit.Button(new Rect(90, y, 410, 52), "Weather: " + WeatherSystem.Label(WeatherSystem.Instance.Current)))
            {
                var w = WeatherSystem.Instance; var next = (WeatherKind)(((int)w.Current + 1) % 5);
                w.Set(next); if (GameSettings.Current.LockedWeather >= 0) { GameSettings.Current.LockedWeather = (int)next; GameSettings.Current.Save(); }
            }
            y += 60;
            if (UIKit.Button(new Rect(90, y, 410, 52), "Time: " + DayNightCycle.Instance.Clock + "  (+3 h)")) DayNightCycle.Instance.Hour = (DayNightCycle.Instance.Hour + 3f) % 24f; y += 60;
            if (UIKit.Button(new Rect(90, y, 410, 52), "Settings")) overlay = Overlay.Settings; y += 60;
            if (UIKit.Button(new Rect(90, y, 410, 52), "Controls")) overlay = Overlay.Controls; y += 60;
            if (UIKit.Button(new Rect(90, y, 410, 52), "Quit to Main Menu", true, UIKit.Bad)) QuitToMenu();
            // stats card
            var s = SaveData.Current;
            var r = new Rect(W - 520, 60, 460, 260);
            UIKit.Panel(r);
            UIKit.Label(new Rect(r.x + 24, r.y + 18, 420, 30), "SESSION", 18, UIKit.Saffron, TextAnchor.UpperLeft, true);
            UIKit.Label(new Rect(r.x + 24, r.y + 50, 420, 200),
                "Mode: " + Hud.ModeName(GameState.Mode) + "\nMoney: " + Fmt.INR(s.Money) + "\nDistance driven: " + s.DistanceKm.ToString("0.0") + " km\nLandmarks discovered: " + s.LandmarksVisited.Count + " / " + CityWorld.Instance.Index.landmarks.Length +
                "\nMissions passed: " + s.MissionsPassed + "\nTraffic signals mapped: " + CityWorld.Instance.Signals.SignalCount, 20);
        }

        void FullMap(float W, float H)
        {
            var r = new Rect(40, 90, W - 80, H - 130);
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.85f));
            UIKit.Title(new Rect(44, 24, W - 400, 60), CityWorld.Instance.Index.name + " - City Map", 40, Color.white);
            UIKit.Label(new Rect(W - 760, 36, 720, 50), "Scroll: zoom · Drag: pan · Right-click: set GPS (on a landmark or any street) · M: close", 18, UIKit.Dim, TextAnchor.UpperRight);
            hud.Map.DrawFullMap(r);
            var lg = new Rect(r.xMax - 250, r.y + 14, 236, 132);
            UIKit.Panel(lg, new Color(0, 0, 0, 0.7f));
            UIKit.Icon(UIKit.Circle, new Vector2(lg.x + 22, lg.y + 22), 12, 0, new Color(0.2f, 0.45f, 0.95f)); UIKit.Label(new Rect(lg.x + 38, lg.y + 10, 190, 24), "Landmark", 16);
            UIKit.Icon(UIKit.Circle, new Vector2(lg.x + 22, lg.y + 50), 12, 0, new Color(0.1f, 0.7f, 0.2f)); UIKit.Label(new Rect(lg.x + 38, lg.y + 38, 190, 24), "Petrol pump", 16);
            UIKit.Icon(UIKit.Circle, new Vector2(lg.x + 22, lg.y + 78), 12, 0, new Color(1f, 0.8f, 0.1f)); UIKit.Label(new Rect(lg.x + 38, lg.y + 66, 190, 24), "Mission", 16);
            UIKit.Icon(UIKit.Circle, new Vector2(lg.x + 22, lg.y + 106), 12, 0, new Color(0.65f, 0.3f, 1f)); UIKit.Label(new Rect(lg.x + 38, lg.y + 94, 190, 24), "GPS destination", 16);
            if (GPSNavigator.Instance.HasTarget && UIKit.Button(new Rect(44, H - 34, 240, 30), "Clear GPS route")) GPSNavigator.Instance.Clear();
            UIKit.Label(new Rect(W - 700, H - 34, 660, 30), "© OpenStreetMap contributors (ODbL)", 15, UIKit.Dim, TextAnchor.UpperRight);
        }

        void MissionsOverlay(float W, float H)
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.6f));
            var r = new Rect(60, 60, Mathf.Min(1100, W - 120), H - 120);
            UIKit.Panel(r);
            UIKit.Title(new Rect(r.x + 30, r.y + 18, 600, 60), "Missions - " + CityWorld.Instance.Index.name, 42, Color.white);
            var mr = MissionRunner.Instance;
            float y = r.y + 90;
            if (mr.Active != null)
            {
                UIKit.Label(new Rect(r.x + 30, y, r.width - 60, 28), "In progress: " + mr.Active.Title + " - " + mr.Objective, 20, UIKit.Saffron);
                y += 40;
            }
            if (GameState.Mode == GameMode.FreeRoam)
                UIKit.Label(new Rect(r.x + 30, y, r.width - 60, 28), "Free Roam has no mission markers, but you can still start any mission here.", 18, UIKit.Dim);
            y += 34;
            var rows = mr.All.Where(m => GameState.Mode != GameMode.Story || m.Story).ToList();
            var view = new Rect(r.x + 20, y, r.width - 40, r.yMax - y - 70);
            scroll = GUI.BeginScrollView(view, scroll, new Rect(0, 0, view.width - 20, rows.Count * 118));
            float ry = 0;
            foreach (var m in rows)
            {
                bool done = SaveData.Current.CompletedMissions.Contains(m.Id);
                var rr = new Rect(0, ry, view.width - 24, 108);
                UIKit.Rect(rr, new Color(1, 1, 1, 0.05f));
                UIKit.Label(new Rect(rr.x + 16, rr.y + 8, rr.width - 330, 28), m.Title + (done ? "  ✔" : ""), 23, done ? UIKit.Good : Color.white, TextAnchor.UpperLeft, true);
                UIKit.Label(new Rect(rr.x + 16, rr.y + 36, rr.width - 330, 24), m.Category + "  ·  start: " + m.StartLabel + (m.Reward > 0 ? "  ·  " + Fmt.INR(m.Reward) : "  ·  pay per job"), 16, UIKit.Saffron);
                UIKit.Label(new Rect(rr.x + 16, rr.y + 60, rr.width - 330, 48), m.Brief, 16, UIKit.Dim);
                string why = mr.CannotStart(m);
                if (UIKit.Button(new Rect(rr.xMax - 300, rr.y + 12, 140, 40), "GPS", true)) { GPSNavigator.Instance.SetTarget(m.Start, m.Title); overlay = Overlay.None; }
                if (UIKit.Button(new Rect(rr.xMax - 150, rr.y + 12, 140, 40), "Start", why == null, UIKit.Good)) { mr.Begin(m); overlay = Overlay.None; }
                if (why != null) UIKit.Label(new Rect(rr.xMax - 300, rr.y + 58, 290, 48), why, 14, UIKit.Bad);
                ry += 118;
            }
            GUI.EndScrollView();
            if (UIKit.Button(new Rect(r.x + 30, r.yMax - 62, 200, 48), "Close")) overlay = Overlay.None;
        }

        void MissionsCatalog(float W, float H)
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.6f));
            Header(W, "Missions", "Missions are built from real OpenStreetMap places once a city is loaded.");
            var cat = new[]
            {
                ("story_1", "Welcome to Pune", "Story 1 - Pune Station, Dagdusheth Halwai Ganpati, Fergusson College"),
                ("story_2", "Peshwa Heritage Trail", "Story 2 / Exploration - Shaniwar Wada, Lal Mahal, Kasba Ganpati, Nana Wada, Vishrambag Wada"),
                ("story_3", "FC Road - JM Road Night Sprint", "Story 3 / Race - the one-way pair, FC Road north and JM Road south"),
                ("rickshaw", "Rickshaw Fares", "Driving - 3 metered auto/taxi fares between real destinations"),
                ("delivery", "Hot Food Express", "Driving - timed delivery from an FC Road eatery"),
                ("ambulance", "Golden Hour", "Emergency - ambulance run to Sassoon Hospital"),
                ("explore", "Know Your City", "Exploration - discover three new landmarks"),
                ("licence", "Driving Licence Test", "Driving test - score 70+ with no violations"),
            };
            float y = 180;
            foreach (var (id, t, d) in cat)
            {
                bool done = SaveData.Current.CompletedMissions.Contains(id);
                UIKit.Panel(new Rect(60, y, Mathf.Min(1000, W - 120), 64));
                UIKit.Label(new Rect(84, y + 8, 900, 28), t + (done ? "   ✔ completed" : ""), 22, done ? UIKit.Good : Color.white, TextAnchor.UpperLeft, true);
                UIKit.Label(new Rect(84, y + 36, 900, 24), d, 16, UIKit.Dim);
                y += 72;
            }
            if (UIKit.Button(new Rect(60, y + 10, 220, 50), "Back")) screen = Screen.Main;
        }

        void Career(float W, float H)
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.6f));
            Header(W, "Career Progress", "Saved progress from Career and Story modes.");
            var s = SaveData.Current;
            UIKit.Panel(new Rect(60, 180, 700, 470));
            UIKit.Label(new Rect(90, 200, 640, 440),
                "Money: " + Fmt.INR(s.Money) + "\nVehicles owned: " + s.OwnedVehicles.Count + " / " + VehicleSpec.All.Count(v => v.Price >= 0) +
                "\nStory chapter: " + s.StoryChapter + " / 3\nMissions passed: " + s.MissionsPassed + "   failed: " + s.MissionsFailed +
                "\nRickshaw / taxi fares: " + s.Fares + "\nDeliveries: " + s.Deliveries + "\nDistance driven: " + s.DistanceKm.ToString("0.0") + " km" +
                "\nTotal earned: " + Fmt.INR(s.TotalEarned) + "\nFines paid: " + Fmt.INR(s.FinesPaid) +
                "\nLandmarks discovered: " + s.LandmarksVisited.Count + "\nBest licence test score: " + (s.BestLicenceScore > 0 ? s.BestLicenceScore + "/100" : "-"), 23);
            if (UIKit.Button(new Rect(60, 670, 220, 50), "Back")) screen = Screen.Main;
            if (UIKit.Button(new Rect(300, 670, 300, 50), "Reset career", true, UIKit.Bad)) { SaveData.Reset(); HudMessages.Notify("Career reset", UIKit.Bad); }
        }

        void Garage(float W, float H, bool inGame)
        {
            if (menu != null) { menu.GarageView = true; menu.ShowVehicle(garageSel); }
            if (inGame) UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.6f));
            var panel = new Rect(40, 40, 600, H - 80);
            UIKit.Panel(panel);
            UIKit.Title(new Rect(70, 56, 540, 60), "Garage", 46, Color.white);
            var s = SaveData.Current;
            bool free = inGame ? FreeVehicles : false;
            UIKit.Label(new Rect(72, 112, 540, 28), inGame ? (free ? "All vehicles are free in this mode." : "Buy with career money; delivery " + Fmt.INR(100) + ".") : "Career wallet: " + Fmt.INR(s.Money), 18, UIKit.Dim);
            float y = 150;
            foreach (var v in VehicleSpec.All)
            {
                if (v.Price < 0 && !(inGame && free)) continue;
                bool owned = s.Owns(v.Id) || (inGame && free);
                string tag = owned ? (s.SelectedVehicle == v.Id && !inGame ? "  ✔ selected" : "  owned") : "  " + Fmt.INR(v.Price);
                if (UIKit.Button(new Rect(64, y, 552, 44), v.Name + "<size=15>" + tag + "</size>", true, garageSel == v.Id ? UIKit.Saffron : (Color?)null)) garageSel = v.Id;
                y += 50;
            }
            var spec = VehicleSpec.Get(garageSel);
            var card = new Rect(W - 560, H - 420, 520, 380);
            UIKit.Panel(card);
            UIKit.Title(new Rect(card.x + 24, card.y + 14, 480, 50), spec.Name, 34, Color.white);
            UIKit.Label(new Rect(card.x + 26, card.y + 60, 470, 50), spec.Description, 17, UIKit.Dim);
            float sy = card.y + 118;
            Stat(card.x + 26, ref sy, "Top speed", spec.MaxSpeedKmh / 270f, Mathf.RoundToInt(spec.MaxSpeedKmh) + " km/h");
            Stat(card.x + 26, ref sy, "Acceleration", Mathf.Clamp01(spec.PowerKW / spec.Mass * 1000f / 180f), Mathf.RoundToInt(spec.PowerKW / spec.Mass * 1000f) + " W/kg");
            Stat(card.x + 26, ref sy, "Handling", Mathf.Clamp01(spec.Grip * spec.SteerDeg / 45f), spec.Wheels + " wheels");
            Stat(card.x + 26, ref sy, "Braking", Mathf.Clamp01(spec.BrakeG / 1.1f), spec.BrakeG.ToString("0.00") + " g");
            bool own = s.Owns(spec.Id) || (inGame && free);
            if (!own)
            {
                if (UIKit.Button(new Rect(card.x + 24, card.yMax - 64, 230, 48), "Buy " + Fmt.INR(spec.Price), s.Money >= spec.Price && spec.Price >= 0, UIKit.Good))
                {
                    s.Spend(spec.Price); s.OwnedVehicles.Add(spec.Id); s.SelectedVehicle = spec.Id;
                    if (!inGame || GameState.PersistentProgress) s.Save();
                    HudMessages.Notify(spec.Name + " purchased", UIKit.Good);
                }
            }
            else if (inGame)
            {
                if (UIKit.Button(new Rect(card.x + 24, card.yMax - 64, 230, 48), "Deliver to me", true, UIKit.Good)) { sessionVehicle = spec.Id; if (s.Owns(spec.Id)) s.SelectedVehicle = spec.Id; DeliverVehicle(spec.Id); }
            }
            else if (UIKit.Button(new Rect(card.x + 24, card.yMax - 64, 230, 48), "Select", true, UIKit.Good)) { s.SelectedVehicle = spec.Id; sessionVehicle = spec.Id; s.Save(); }
            if (UIKit.Button(new Rect(card.x + 270, card.yMax - 64, 220, 48), "Back")) { if (inGame) overlay = Overlay.Pause; else { screen = Screen.Main; } }
            if (!inGame) sessionVehicle = garageSel;
            DrawToasts();
        }

        static void Stat(float x, ref float y, string name, float v, string text)
        {
            UIKit.Label(new Rect(x, y, 150, 26), name, 18);
            UIKit.Bar(new Rect(x + 150, y + 4, 200, 16), v, UIKit.Saffron);
            UIKit.Label(new Rect(x + 360, y, 120, 26), text, 16, UIKit.Dim);
            y += 32;
        }

        void Settings(float W, float H, bool inGame)
        {
            if (inGame) UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.6f));
            var g = GameSettings.Current;
            var r = new Rect(60, 60, Mathf.Min(900, W - 120), H - 120);
            UIKit.Panel(r);
            UIKit.Title(new Rect(r.x + 30, r.y + 18, 600, 60), "Settings", 46, Color.white);
            float y = r.y + 100, x = r.x + 30, w = r.width - 60;
            g.MouseSensitivity = UIKit.Slider(new Rect(x, y, w, 40), "Mouse sensitivity", g.MouseSensitivity, 0.3f, 6f, g.MouseSensitivity.ToString("0.0")); y += 48;
            g.InvertY = UIKit.Toggle(new Rect(x, y, w * 0.6f, 44), "Invert mouse Y", g.InvertY); y += 52;
            g.DrawDistance = UIKit.Slider(new Rect(x, y, w, 40), "Draw distance (streaming radius)", g.DrawDistance, 350f, 1200f, Mathf.RoundToInt(g.DrawDistance) + " m"); y += 48;
            g.TrafficDensity = UIKit.Slider(new Rect(x, y, w, 40), "Traffic density", g.TrafficDensity, 0f, 2f, Mathf.RoundToInt(g.TrafficDensity * 100) + "%"); y += 48;
            g.PedestrianDensity = UIKit.Slider(new Rect(x, y, w, 40), "Pedestrian density", g.PedestrianDensity, 0f, 2f, Mathf.RoundToInt(g.PedestrianDensity * 100) + "%"); y += 48;
            g.Volume = UIKit.Slider(new Rect(x, y, w, 40), "Volume", g.Volume, 0f, 1f, Mathf.RoundToInt(g.Volume * 100) + "%"); y += 48;
            g.DayLengthMinutes = UIKit.Slider(new Rect(x, y, w, 40), "Length of a game day", g.DayLengthMinutes, 6f, 120f, Mathf.RoundToInt(g.DayLengthMinutes) + " min"); y += 48;
            g.Shadows = UIKit.Toggle(new Rect(x, y, w * 0.6f, 44), "Shadows", g.Shadows); y += 52;
            g.ShowFps = UIKit.Toggle(new Rect(x, y, w * 0.6f, 44), "Show FPS / streaming stats", g.ShowFps); y += 52;
            string weather = g.LockedWeather < 0 ? "Dynamic" : WeatherSystem.Label((WeatherKind)g.LockedWeather);
            UIKit.Label(new Rect(x, y, w * 0.45f, 44), "Weather", 20);
            if (UIKit.Button(new Rect(x + w * 0.45f, y, 260, 40), weather)) g.LockedWeather = g.LockedWeather >= 4 ? -1 : g.LockedWeather + 1;
            y += 52;
            VehicleAudio.MasterVolume = g.Volume;
            if (CityWorld.Instance != null) { CityWorld.Instance.LoadRadius = g.DrawDistance; CityWorld.Instance.NearRadius = Mathf.Min(400f, g.DrawDistance * 0.55f); }
            if (DayNightCycle.Instance != null && DayNightCycle.Instance.Sun != null) DayNightCycle.Instance.Sun.shadows = g.Shadows ? LightShadows.Soft : LightShadows.None;
            if (UIKit.Button(new Rect(x, r.yMax - 70, 260, 50), "Controls...")) { if (inGame) overlay = Overlay.Controls; else screen = Screen.Controls; }
            if (UIKit.Button(new Rect(x + 280, r.yMax - 70, 260, 50), "Save & back", true, UIKit.Good))
            {
                g.Save();
                if (inGame) overlay = Overlay.Pause; else screen = settingsBack;
            }
        }

        void Controls(float W, float H, bool inGame)
        {
            if (inGame) UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.6f));
            var r = new Rect(60, 40, Mathf.Min(1000, W - 120), H - 80);
            UIKit.Panel(r);
            UIKit.Title(new Rect(r.x + 30, r.y + 14, 700, 60), "Controls", 46, Color.white);
            UIKit.Label(new Rect(r.x + 32, r.y + 70, r.width - 60, 30), "Click a key to rebind it, then press the new key (Esc cancels). Gamepad: left stick, A handbrake, Y enter/exit, X interact, B camera, Start pause.", 16, UIKit.Dim);
            float y = r.y + 110;
            var actions = (GameAction[])System.Enum.GetValues(typeof(GameAction));
            for (int i = 0; i < actions.Length; i++)
            {
                var a = actions[i];
                float col = i < 8 ? 0 : 1;
                float yy = y + (i % 8) * 54;
                float x = r.x + 30 + col * (r.width / 2);
                UIKit.Label(new Rect(x, yy + 8, 260, 30), GameInput.Labels[(int)a], 18);
                string k = rebinding == a ? "press a key..." : GameInput.KeyName(GameInput.Get(a));
                if (UIKit.Button(new Rect(x + 250, yy, 180, 44), k, true, rebinding == a ? UIKit.Saffron : (Color?)null)) rebinding = a;
            }
            UIKit.Label(new Rect(r.x + 32, y + 8 * 54 + 6, r.width - 60, 30), "Mouse: look / orbit camera.   Shift: sprint on foot, boost in vehicles.   Space: jump on foot.", 17, UIKit.Dim);
            if (UIKit.Button(new Rect(r.x + 30, r.yMax - 66, 240, 48), "Reset defaults")) GameInput.ResetDefaults();
            if (UIKit.Button(new Rect(r.x + 290, r.yMax - 66, 240, 48), "Back", true, UIKit.Good)) { rebinding = null; if (inGame) overlay = Overlay.Settings; else screen = Screen.Settings; }
        }

        void DrawToasts()
        {
            float ty = UIKit.H - 60;
            for (int i = HudMessages.Toasts.Count - 1; i >= 0; i--)
            {
                var t = HudMessages.Toasts[i];
                if (Time.unscaledTime > t.Until) { HudMessages.Toasts.RemoveAt(i); continue; }
                UIKit.Label(new Rect(UIKit.W - 900, ty, 860, 30), t.Text, 18, t.Color, TextAnchor.UpperRight, true);
                ty -= 32;
            }
        }
    }
}
