// Pune mission content. Every place used is looked up in the OSM-derived data at runtime (landmarks, POIs,
// road names); missions whose anchors are missing from the data are simply not registered.
// Characters (Aarav, the dispatcher, etc.) are fictional. Fares and fines are game values, not official tariffs.
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Shehar.City;
using Shehar.Core;
using Shehar.Player;
using Shehar.UI;
using Shehar.Vehicles;
using UnityEngine;

namespace Shehar.Missions
{
    public static class MissionLibrary
    {
        static readonly string[] StoryOrder = { "story_1", "story_2", "story_3" };
        public static int StoryIndex(string id) { return System.Array.IndexOf(StoryOrder, id); }
        public static string StoryId(int chapter) { return chapter >= 0 && chapter < StoryOrder.Length ? StoryOrder[chapter] : null; }

        static Vector3 V(Poi p) { return new Vector3(p.x, 0, p.z); }

        public static void Register(MissionRunner r)
        {
            var w = r.World;
            Poi L(string n) { return w.Landmark(n); }

            var station = L("Pune Railway Station"); var dagdu = L("Dagdusheth Halwai Ganpati"); var fergusson = L("Fergusson College");
            if (station != null && dagdu != null && fergusson != null)
                r.All.Add(new Mission
                {
                    Id = "story_1", Title = "Welcome to Pune", Category = "Story - Chapter 1", Story = true, Reward = 3000,
                    Brief = "Pick up your cousin Aarav from Pune Railway Station, take him for darshan at Dagdusheth Halwai Ganpati, then drop him at Fergusson College.",
                    Start = r.Kerb(V(station)), StartLabel = "Pune Railway Station",
                    Body = run => StoryWelcome(run, station, dagdu, fergusson)
                });

            string[] trail = { "Shaniwar Wada", "Lal Mahal", "Kasba Ganpati", "Nana Wada", "Vishrambag Wada" };
            var trailPois = trail.Select(L).Where(p => p != null).ToList();
            if (trailPois.Count >= 3)
                r.All.Add(new Mission
                {
                    Id = "story_2", Title = "Peshwa Heritage Trail", Category = "Story - Chapter 2 / Exploration", Story = true, Reward = 2500,
                    Brief = "Explore the old city (peths): visit " + string.Join(", ", trailPois.Select(p => p.name)) + ". Walk or drive.",
                    Start = r.Kerb(V(trailPois[0])), StartLabel = trailPois[0].name,
                    Body = run => HeritageTrail(run, trailPois)
                });

            var fc = RoadNodes(w, "Gopal Krushna Gokhale Path"); var jm = RoadNodes(w, "Jangli Maharaj Path");
            if (fc.Count > 0 && jm.Count > 0)
            {
                Vector3 fcStart = fc.OrderBy(p => p.z).First(), fcEnd = fc.OrderBy(p => p.z).Last();
                Vector3 jmStart = jm.OrderBy(p => p.z).Last(), jmEnd = jm.OrderBy(p => p.z).First();
                r.All.Add(new Mission
                {
                    Id = "story_3", Title = "FC Road - JM Road Night Sprint", Category = "Story - Chapter 3 / Race", Story = true, Reward = 4000,
                    Brief = "Time-trial the famous one-way pair: north up FC Road (Gopal Krishna Gokhale Path), across Shivajinagar and back south down JM Road.",
                    Start = fcStart, StartLabel = "FC Road (Deccan end)",
                    Body = run => Race(run, new[] { fcStart, fcEnd, jmStart, jmEnd })
                });
            }

            var swargate = L("Swargate Bus Stand") ?? L("Deccan Gymkhana");
            if (swargate != null)
                r.All.Add(new Mission
                {
                    Id = "rickshaw", Title = "Rickshaw Fares", Category = "Driving - Taxi / Auto", Reward = 0,
                    Brief = "Drive an auto-rickshaw or taxi and complete 3 metered fares between real Pune destinations.",
                    Requirement = "Auto-rickshaw or taxi", Start = r.Kerb(V(swargate)), StartLabel = swargate.name,
                    Check = () => IsCommercial(r.Player.Vehicle) ? null : "Needs an auto-rickshaw or taxi (Garage, or flag one down in traffic)",
                    Body = run => Fares(run, 3)
                });

            var vaishali = w.Index.pois.FirstOrDefault(p => p.kind == "food" && p.name == "Vaishali") ?? w.NearestPoi(V(fergusson ?? station), "food", 3000f, true);
            if (vaishali != null)
                r.All.Add(new Mission
                {
                    Id = "delivery", Title = "Hot Food Express", Category = "Driving - Delivery", Reward = 0,
                    Brief = "Collect an order at " + vaishali.name + " and deliver it hot - drive carefully, damage cuts your pay.",
                    Start = r.Kerb(V(vaishali)), StartLabel = vaishali.name,
                    Body = run => Delivery(run, vaishali)
                });

            var sassoon = w.Index.pois.FirstOrDefault(p => p.kind == "hospital" && p.name == "Sassoon Hospital")
                          ?? w.Index.pois.FirstOrDefault(p => p.kind == "hospital" && p.name.Contains("Hospital"));
            if (sassoon != null)
                r.All.Add(new Mission
                {
                    Id = "ambulance", Title = "Golden Hour", Category = "Driving - Emergency", Reward = 2500,
                    Brief = "Take the ambulance, siren on (" + GameInput.KeyName(GameInput.Get(GameAction.Siren)) + "), pick up a patient and rush them to " + sassoon.name + ".",
                    Start = r.Kerb(V(sassoon)), StartLabel = sassoon.name,
                    Body = run => Ambulance(run, sassoon)
                });

            var shaniwar = L("Shaniwar Wada") ?? L("Deccan Gymkhana");
            if (shaniwar != null)
                r.All.Add(new Mission
                {
                    Id = "explore", Title = "Know Your City", Category = "Exploration", Reward = 1500,
                    Brief = "Visit three Pune landmarks you have not seen yet. Any vehicle, or on foot.",
                    Start = r.Kerb(V(shaniwar)), StartLabel = shaniwar.name,
                    Body = run => Explore(run)
                });

            var sj = L("Shivajinagar Railway Station"); var pat = L("Pataleshwar Cave Temple"); var bal = L("Balgandharva Rangmandir"); var udyan = L("Chhatrapati Sambhaji Udyan");
            if (sj != null && pat != null && bal != null && udyan != null)
                r.All.Add(new Mission
                {
                    Id = "licence", Title = "Driving Licence Test", Category = "Driving test", Reward = 1000,
                    Brief = "Drive the examiner's route with no traffic violations: obey speed limits, signals and one-way streets. Score 70+ to pass.",
                    Start = r.Kerb(V(sj)), StartLabel = sj.name,
                    Body = run => LicenceTest(run, new[] { pat, bal, udyan })
                });
        }

        static bool IsCommercial(VehicleController v)
        {
            return v != null && (v.Spec.Class == VehicleClass.AutoRickshaw || v.Spec.Class == VehicleClass.Taxi);
        }

        static List<Vector3> RoadNodes(CityWorld w, string name)
        {
            var l = new List<Vector3>();
            foreach (var r in w.Index.roads)
                if (r.name == name && r.drivable == 1)
                    foreach (int n in r.nodes) l.Add(new Vector3(w.Index.nodeX[n], 0, w.Index.nodeZ[n]));
            return l;
        }

        // ------------------------------------------------------------------ story 1
        static IEnumerator StoryWelcome(MissionRunner r, Poi station, Poi dagdu, Poi fergusson)
        {
            yield return r.Say("Aai (phone)", "Your cousin Aarav's train from Mumbai has reached Pune station. Go and pick him up, and don't make him wait!", 5f);
            Vector3 pick = r.Kerb(V(station));
            yield return r.GoTo(pick, "Pick up Aarav at Pune Railway Station", "Pune Railway Station", 18f, vehicle: true, stop: true);
            var aarav = r.SpawnPerson(r.Player.Position + r.Player.Focus.right * 3f, Outfit.Kurta);
            yield return r.Say("Aarav", "Arre bhau! Finally! First things first - take me to Dagdusheth Ganpati for darshan.", 4.5f);
            Object.Destroy(aarav);
            Vector3 temple = r.Kerb(V(dagdu));
            float t = r.RouteSeconds(r.Player.Position, temple, 7.5f, out float m) + 60f;
            yield return r.GoTo(temple, "Drive Aarav to Dagdusheth Halwai Ganpati", "Dagdusheth Halwai Ganpati", 22f, vehicle: true, stop: true, timeLimit: t);
            yield return r.Say("Aarav", "Ganpati Bappa Morya! The temple was founded by the sweet-maker Dagdusheth Halwai back in the 1890s, you know.", 5f);
            yield return r.Say("Aarav", "Now drop me at Fergusson College - my hostel is there. Mind the traffic on Laxmi Road!", 4f);
            Vector3 college = r.Kerb(V(fergusson));
            t = r.RouteSeconds(r.Player.Position, college, 7.5f, out m) + 70f;
            yield return r.GoTo(college, "Drop Aarav at Fergusson College", "Fergusson College", 25f, vehicle: true, stop: true, timeLimit: t);
            yield return r.Say("Aarav", "Thanks! Come back later - FC Road has the best food in Pune.", 3.5f);
        }

        // ------------------------------------------------------------------ story 2 / exploration
        static readonly Dictionary<string, string> Facts = new Dictionary<string, string>
        {
            { "Shaniwar Wada", "Seat of the Peshwas, completed in 1732. A fire in 1828 destroyed the palace; the fortified walls and gates survive." },
            { "Lal Mahal", "A reconstruction of the palace where the young Shivaji Maharaj lived with his mother Jijabai." },
            { "Kasba Ganpati", "Pune's presiding deity (gramadaivat) and the first of the 'manache' Ganpatis in the Ganeshotsav procession." },
            { "Nana Wada", "Built for Nana Phadnavis, the Peshwas' famous minister, in the late 18th century." },
            { "Vishrambag Wada", "Residence of the last Peshwa, Bajirao II, from the early 1800s - known for its carved wooden facade." },
            { "Dagdusheth Halwai Ganpati", "One of Pune's most visited temples, founded by the sweet-maker Dagdusheth Halwai in the 1890s." },
            { "Savitribai Phule Pune University", "The main building of Pune's university campus on Ganeshkhind Road." },
            { "Pataleshwar Cave Temple", "A rock-cut cave temple dedicated to Shiva, right next to busy JM Road." },
            { "Pune Railway Station", "Pune Junction - one of the busiest stations on the Mumbai-Chennai line." },
            { "Fergusson College", "Founded in 1885, the college gave FC Road its popular name." },
        };

        static IEnumerator HeritageTrail(MissionRunner r, List<Poi> stops)
        {
            yield return r.Say("Guide", "The peths of Pune hold three centuries of history. Visit each stop - on foot is fine, the lanes are narrow!", 5f);
            foreach (var p in stops)
            {
                yield return r.GoTo(V(p), "Visit " + p.name, p.name, 30f, vehicle: false);
                SaveData.Current.VisitLandmark(p.name);
                if (Facts.TryGetValue(p.name, out var f)) yield return r.Say(p.name, f, 5f);
            }
        }

        static IEnumerator Explore(MissionRunner r)
        {
            var w = r.World;
            var seen = SaveData.Current.LandmarksVisited;
            var pos = r.Player.Position;
            var list = w.Index.landmarks.Where(l => !seen.Contains(l.name)).OrderBy(l => (V(l) - pos).sqrMagnitude).Take(3).ToList();
            if (list.Count < 3) list = w.Index.landmarks.OrderBy(l => Random.value).Take(3).ToList();
            foreach (var p in list)
            {
                yield return r.GoTo(V(p), "Find " + p.name, p.name, 35f, vehicle: false);
                SaveData.Current.VisitLandmark(p.name);
                HudMessages.Notify("Landmark discovered: " + p.name, new Color(0.5f, 0.8f, 1f));
                if (Facts.TryGetValue(p.name, out var f)) yield return r.Say(p.name, f, 4.5f);
            }
        }

        // ------------------------------------------------------------------ race
        static IEnumerator Race(MissionRunner r, Vector3[] waypoints)
        {
            var g = r.World.Graph;
            var pts = new List<Vector3>();
            for (int i = 0; i + 1 < waypoints.Length; i++)
            {
                var path = g.FindPath(g.NearestNode(waypoints[i].x, waypoints[i].z), g.NearestNode(waypoints[i + 1].x, waypoints[i + 1].z), true);
                if (path == null) continue;
                foreach (int n in path) pts.Add(new Vector3(g.X[n], 0, g.Z[n]));
            }
            var cps = new List<Vector3>();
            float acc = 0;
            for (int i = 1; i < pts.Count; i++)
            {
                acc += Vector3.Distance(pts[i - 1], pts[i]);
                if (acc >= 230f) { cps.Add(pts[i]); acc = 0; }
            }
            if (pts.Count > 0) cps.Add(pts[pts.Count - 1]);
            float total = 0;
            for (int i = 1; i < pts.Count; i++) total += Vector3.Distance(pts[i - 1], pts[i]);

            yield return r.GoTo(waypoints[0], "Go to the start line on FC Road", "FC Road start", 18f, vehicle: true, stop: true);
            if (World.DayNightCycle.Instance != null) World.DayNightCycle.Instance.Hour = 22.5f;
            yield return r.Say("Race marshal", "FC Road northbound, swing through Shivajinagar, then JM Road south. Both are one-way - stay with the flow!", 4f);
            for (int c = 3; c > 0; c--) { HudMessages.Big(c.ToString(), "", Color.white, 0.9f); yield return new WaitForSeconds(1f); }
            HudMessages.Big("GO!", "", new Color(0.4f, 1f, 0.4f), 1f);
            float par = total / 13.5f + 20f;
            float start = Time.time;
            yield return r.Checkpoints(cps, "FC-JM Sprint", 16f, par, true);
            float time = Time.time - start;
            r.PendingReward = (long)(4000 + Mathf.Max(0, par - time) * 40f);
            HudMessages.Notify("Lap time " + Fmt.Time(time) + "  (par " + Fmt.Time(par) + ", " + Fmt.Dist(total) + ")", new Color(0.6f, 0.9f, 1f), 7f);
        }

        // ------------------------------------------------------------------ fares
        static readonly string[] FareKinds = { "food", "college", "rail_station", "bus_station", "hospital", "mall", "cinema", "attraction", "hotel" };

        static Poi RandomPoi(CityWorld w, Vector3 from, float min, float max)
        {
            var c = w.Index.pois.Where(p => FareKinds.Contains(p.kind) && !string.IsNullOrEmpty(p.name))
                .Where(p => { float d = (V(p) - from).magnitude; return d >= min && d <= max; }).ToList();
            return c.Count == 0 ? null : c[Random.Range(0, c.Count)];
        }

        static IEnumerator Fares(MissionRunner r, int count)
        {
            long earned = 0;
            for (int i = 0; i < count; i++)
            {
                var w = r.World;
                var pick = RandomPoi(w, r.Player.Position, 250f, 900f) ?? RandomPoi(w, r.Player.Position, 100f, 2000f);
                if (pick == null) yield break;
                Vector3 pp = r.Kerb(V(pick));
                yield return r.GoTo(pp, "Fare " + (i + 1) + "/" + count + ": pick up the passenger at " + pick.name, pick.name, 16f, true, true, -1f, IsCommercial, "Get back in your auto / taxi");
                var drop = RandomPoi(w, pp, 900f, 2600f) ?? RandomPoi(w, pp, 400f, 4000f);
                if (drop == null) yield break;
                string[] lines = { "Bhau, " + drop.name + " - and take the shortcut!", "To " + drop.name + " please. Meter chalu karo.", drop.name + " jaana hai. I'm late!", "Can you drop me at " + drop.name + "?" };
                yield return r.Say("Passenger", lines[Random.Range(0, lines.Length)], 3f);
                Vector3 dp = r.Kerb(V(drop));
                float t = r.RouteSeconds(pp, dp, 7.5f, out float meters) + 45f;
                float start = Time.time;
                yield return r.GoTo(dp, "Drive the passenger to " + drop.name, drop.name, 16f, true, true, t, IsCommercial, "Get back in your auto / taxi");
                // meter-style fare: base for the first 1.5 km then per-km (game values, approximate)
                float km = meters / 1000f;
                long fare = (long)(26 + Mathf.Max(0, km - 1.5f) * 17f);
                long tip = (Time.time - start) < t * 0.6f ? 20 : 0;
                earned += fare + tip;
                SaveData.Current.Fares++;
                HudMessages.Money(fare + tip, "Fare " + Fmt.Dist(meters) + (tip > 0 ? " + tip" : ""));
            }
            r.PendingReward = earned + 150; // completion bonus
        }

        // ------------------------------------------------------------------ delivery
        static IEnumerator Delivery(MissionRunner r, Poi shop)
        {
            yield return r.GoTo(r.Kerb(V(shop)), "Collect the order at " + shop.name, shop.name, 16f, true, true);
            yield return r.Say(shop.name, "Order is packed - deliver it while it's hot! Don't bang the vehicle around.", 3f);
            var w = r.World; var g = w.Graph;
            Vector3 from = r.Player.Position, dest = from;
            string street = "";
            for (int k = 0; k < 60; k++)
            {
                float ang = Random.value * Mathf.PI * 2, d = Random.Range(800f, 2000f);
                Vector3 probe = from + new Vector3(Mathf.Cos(ang), 0, Mathf.Sin(ang)) * d;
                if (!w.InBounds(probe, -100f)) continue;
                int n = g.NearestNode(probe.x, probe.z, 150f, true, node =>
                {
                    for (int j = 0; j < g.Degree(node); j++) if (g.RoadOfEdge(g.GetNeighbor(node, j).Edge).rank == 3) return true;
                    return false;
                });
                if (n < 0) continue;
                dest = new Vector3(g.X[n], 0, g.Z[n]);
                street = w.StreetName(dest);
                break;
            }
            string label = (street != "" ? street + ", " : "") + w.ZoneName(dest);
            float health0 = r.Player.InVehicle ? r.Player.Vehicle.Health : 100f;
            float t = r.RouteSeconds(from, dest, 8f, out float meters) + 40f;
            yield return r.GoTo(dest, "Deliver to the customer on " + label, label, 18f, true, true, t);
            float damage = r.Player.InVehicle ? Mathf.Max(0, health0 - r.Player.Vehicle.Health) : 0;
            long pay = (long)Mathf.Max(80, 250 + meters / 1000f * 40f - damage * 4f);
            SaveData.Current.Deliveries++;
            r.PendingReward = pay;
            if (damage > 5) HudMessages.Notify("Food got a bit shaken up - pay reduced", new Color(1f, 0.7f, 0.4f));
        }

        // ------------------------------------------------------------------ ambulance
        static IEnumerator Ambulance(MissionRunner r, Poi hospital)
        {
            var pc = r.Player;
            if (!pc.InVehicle || pc.Vehicle.Spec.Class != VehicleClass.Ambulance)
            {
                Quaternion rot;
                Vector3 p = r.World.RoadPointNear(pc.Position + pc.Focus.forward * 10f, out rot);
                var amb = VehicleController.Spawn(VehicleSpec.Get("ambulance"), p + Vector3.up * 0.3f, rot, null, null);
                Audio.VehicleAudio.Attach(amb, false);
                AI.TrafficManager.Instance?.TrackAbandoned(amb);
                yield return r.Say("Control room", "Emergency call! Your ambulance is parked right next to you - get in and switch the siren on.", 4f);
                while (!pc.InVehicle || pc.Vehicle.Spec.Class != VehicleClass.Ambulance)
                {
                    r.Objective = "Get in the ambulance (" + GameInput.KeyName(GameInput.Get(GameAction.EnterExit)) + ")";
                    yield return null;
                }
            }
            var g = r.World.Graph;
            Vector3 from = pc.Position, patient = from;
            for (int k = 0; k < 60; k++)
            {
                float ang = Random.value * Mathf.PI * 2, d = Random.Range(700f, 1400f);
                Vector3 probe = from + new Vector3(Mathf.Cos(ang), 0, Mathf.Sin(ang)) * d;
                if (!r.World.InBounds(probe, -100f)) continue;
                int n = g.NearestNode(probe.x, probe.z, 150f);
                if (n >= 0) { patient = new Vector3(g.X[n], 0, g.Z[n]); break; }
            }
            string where = r.World.StreetName(patient);
            float t1 = r.RouteSeconds(from, patient, 9f, out float m1) + 40f;
            yield return r.GoTo(patient, "Reach the patient" + (where != "" ? " on " + where : ""), "Patient", 18f, true, true, t1,
                v => v.Spec.Class == VehicleClass.Ambulance, "Get back in the ambulance");
            var person = r.SpawnPerson(pc.Position + pc.Focus.right * 3f);
            yield return r.Say("Paramedic", "Patient loaded! Get to " + hospital.name + " - every minute counts.", 3f);
            Object.Destroy(person);
            Vector3 hp = r.Kerb(V(hospital));
            float t2 = r.RouteSeconds(pc.Position, hp, 9f, out float m2) + 45f;
            yield return r.GoTo(hp, "Rush the patient to " + hospital.name, hospital.name, 22f, true, true, t2,
                v => v.Spec.Class == VehicleClass.Ambulance, "Get back in the ambulance");
            yield return r.Say("Doctor", "Just in time. Well driven.", 2.5f);
        }

        // ------------------------------------------------------------------ driving test
        static IEnumerator LicenceTest(MissionRunner r, Poi[] stops)
        {
            var rules = DrivingRules.Instance;
            yield return r.Say("RTO examiner", "Start the test. Keep to the speed limit, stop at red signals, never go the wrong way on a one-way street.", 5f);
            if (rules != null) rules.BeginTest();
            foreach (var s in stops)
            {
                yield return r.GoTo(r.Kerb(V(s)), "Licence test: drive to " + s.name + "  (score " + (rules != null ? rules.Score : 100) + ")", s.name, 18f, true, true);
                if (rules != null && rules.Score < 40) { r.Fail("Too many violations - test failed (score " + rules.Score + ")"); yield break; }
            }
            int score = rules != null ? rules.Score : 100;
            if (rules != null) rules.TestActive = false;
            if (score < 70) { r.Fail("Score " + score + "/100 - you need 70 to pass"); yield break; }
            SaveData.Current.BestLicenceScore = Mathf.Max(SaveData.Current.BestLicenceScore, score);
            r.PendingReward = 1000 + score * 10;
            HudMessages.Notify("Licence test score: " + score + "/100", new Color(0.5f, 1f, 0.6f), 6f);
        }
    }
}
