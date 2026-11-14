// PlayMode smoke test (Window > General > Test Runner > PlayMode > Run All).
// Boots the game, loads Pune from the OSM data, drives the starting car, checks streaming, traffic, GPS and
// mission start. Mirrors what a player does in the first minute.
using System.Collections;
using System.Linq;
using NUnit.Framework;
using Shehar.AI;
using Shehar.City;
using Shehar.Missions;
using Shehar.Navigation;
using Shehar.Player;
using UnityEngine;
using UnityEngine.TestTools;

namespace Shehar.Tests
{
    public class PuneSmokeTest
    {
        [UnityTest, Timeout(240000)]
        public IEnumerator LoadPuneDriveAndNavigate()
        {
            float t0 = Time.realtimeSinceStartup;
            while (GameManager.Instance == null && Time.realtimeSinceStartup - t0 < 10) yield return null;
            Assert.NotNull(GameManager.Instance, "GameManager did not boot");
            Assert.IsTrue(CityWorld.CityAvailable("pune"), "Pune data missing in StreamingAssets/Cities/pune");

            GameManager.Instance.StartDirect("pune", GameMode.Missions);
            t0 = Time.realtimeSinceStartup;
            while (!GameManager.Instance.IsPlaying && Time.realtimeSinceStartup - t0 < 180) yield return null;
            Assert.IsTrue(GameManager.Instance.IsPlaying, "City did not finish loading");

            var world = CityWorld.Instance;
            Assert.Greater(world.LoadedChunks, 4, "chunks around spawn not streamed");
            Assert.Greater(world.Graph.NodeCount, 20000, "road graph too small");
            Assert.NotNull(world.MapTexture, "map texture missing");

            var pc = PlayerController.Instance;
            Assert.NotNull(pc);
            Assert.IsTrue(pc.InVehicle, "player should start in a vehicle");
            Vector3 start = pc.Position;

            // drive forward for 5 seconds
            pc.ForcedThrottle = 1f; pc.ForcedSteer = 0f;
            yield return new WaitForSeconds(5f);
            float kmh = pc.Vehicle.SpeedKmh;
            pc.ForcedThrottle = -1f;
            yield return new WaitForSeconds(2f);
            pc.ForcedThrottle = null; pc.ForcedSteer = null;
            float moved = Vector3.Distance(start, pc.Position);
            Debug.Log("[Smoke] top speed " + kmh + " km/h, moved " + moved + " m, upright " + pc.Vehicle.transform.up.y);
            Assert.Greater(kmh, 15f, "car did not accelerate");
            Assert.Greater(moved, 10f, "car did not move");
            Assert.Greater(pc.Vehicle.transform.up.y, 0.7f, "car flipped over");

            yield return new WaitForSeconds(3f);
            Assert.Greater(TrafficManager.Instance.ActiveCount, 0, "no traffic spawned");

            var lm = world.Index.landmarks.First(l => l.name == "Shaniwar Wada");
            GPSNavigator.Instance.SetTarget(new Vector3(lm.x, 0, lm.z), lm.name);
            yield return null;
            Assert.Greater(GPSNavigator.Instance.Route.Count, 3, "GPS found no route");

            var mr = MissionRunner.Instance;
            Assert.GreaterOrEqual(mr.All.Count, 3, "fewer than 3 missions registered");
            var m = mr.All.First(x => x.Id == "explore");
            mr.Begin(m);
            yield return new WaitForSeconds(0.5f);
            Assert.NotNull(mr.Active, "mission did not start");
            mr.Abort();
        }
    }
}
