// In-game heads-up display.
using Shehar.City;
using Shehar.Missions;
using Shehar.Navigation;
using Shehar.Player;
using Shehar.World;
using UnityEngine;

namespace Shehar.UI
{
    public sealed class Hud
    {
        public readonly MapView Map = new MapView();
        string lastZone; float zoneShownUntil; string zoneShown;
        float fpsAcc; int fpsFrames; float fps;

        public void Draw(string interactionPrompt)
        {
            var pc = PlayerController.Instance; var world = CityWorld.Instance;
            if (pc == null || world == null || world.Ctx == null) return;
            float W = UIKit.W, H = UIKit.H;

            // ---- minimap + location (bottom-left)
            var mm = new Rect(28, H - 300, 250, 250);
            float view = pc.InVehicle ? Mathf.Lerp(320f, 620f, Mathf.Clamp01(pc.Vehicle.SpeedKmh / 100f)) : 220f;
            Map.DrawMinimap(mm, view);
            string street = world.StreetName(pc.Position);
            string zone = world.ZoneName(pc.Position);
            UIKit.Label(new Rect(mm.x, mm.y - 58, 520, 30), street != "" ? street : "-", 22, Color.white, TextAnchor.LowerLeft, true);
            UIKit.Label(new Rect(mm.x, mm.y - 32, 520, 26), zone + ", " + world.Index.name, 17, UIKit.Dim, TextAnchor.LowerLeft);
            if (zone != lastZone) { lastZone = zone; zoneShown = zone; zoneShownUntil = Time.unscaledTime + 3.5f; }
            if (Time.unscaledTime < zoneShownUntil)
                UIKit.Title(new Rect(W - 760, H - 380, 700, 70), zoneShown, 46, new Color(1f, 0.85f, 0.45f, Mathf.Clamp01(zoneShownUntil - Time.unscaledTime)));

            // ---- top-right: money / time / weather / mode
            var save = SaveData.Current;
            UIKit.Title(new Rect(W - 420, 18, 395, 50), Fmt.INR(save.Money), 38, new Color(0.45f, 0.95f, 0.5f), TextAnchor.UpperRight);
            var dn = DayNightCycle.Instance; var ws = WeatherSystem.Instance;
            string tw = (dn != null ? dn.Clock : "") + "   " + (ws != null ? WeatherSystem.Label(ws.Current) : "");
            UIKit.Label(new Rect(W - 420, 66, 395, 28), tw, 22, Color.white, TextAnchor.UpperRight, true);
            UIKit.Label(new Rect(W - 420, 94, 395, 24), ModeName(GameState.Mode), 16, UIKit.Saffron, TextAnchor.UpperRight, true);

            // ---- vehicle cluster (bottom-right)
            if (pc.InVehicle)
            {
                var v = pc.Vehicle;
                var box = new Rect(W - 330, H - 230, 300, 200);
                UIKit.Panel(box, new Color(0, 0, 0, 0.55f));
                UIKit.Title(new Rect(box.x + 18, box.y + 8, 170, 80), Mathf.RoundToInt(v.SpeedKmh).ToString(), 64, Color.white);
                UIKit.Label(new Rect(box.x + 175, box.y + 40, 80, 30), "km/h", 20, UIKit.Dim);
                string gear = v.Gear < 0 ? "R" : v.SpeedKmh < 1 && v.In.Throttle == 0 ? "N" : v.Gear.ToString();
                UIKit.Title(new Rect(box.x + 240, box.y + 14, 50, 50), gear, 40, UIKit.Saffron);
                UIKit.Bar(new Rect(box.x + 18, box.y + 92, 264, 12), v.Rpm01, Color.Lerp(new Color(0.3f, 0.8f, 1f), new Color(1f, 0.3f, 0.2f), Mathf.InverseLerp(0.75f, 1f, v.Rpm01)));
                float fuel = v.Fuel / Mathf.Max(1f, v.Spec.FuelLitres);
                UIKit.Label(new Rect(box.x + 18, box.y + 110, 120, 24), "FUEL", 15, UIKit.Dim);
                UIKit.Bar(new Rect(box.x + 80, box.y + 113, 202, 16), fuel, fuel < 0.15f ? UIKit.Bad : new Color(1f, 0.75f, 0.2f), v.Fuel.ToString("0.0") + " L");
                UIKit.Label(new Rect(box.x + 18, box.y + 136, 120, 24), "BODY", 15, UIKit.Dim);
                UIKit.Bar(new Rect(box.x + 80, box.y + 139, 202, 16), v.Health / 100f, v.Health < 35 ? UIKit.Bad : UIKit.Good, Mathf.RoundToInt(v.Health) + "%");
                UIKit.Label(new Rect(box.x + 18, box.y + 162, 270, 30), v.Spec.Name + "   " + v.Rig.Plate, 15, UIKit.Dim);
                if (v.LightsOn) UIKit.Label(new Rect(box.x + 220, box.y + 64, 70, 24), "LIGHTS", 13, new Color(0.6f, 0.85f, 1f), TextAnchor.UpperRight, true);
                if (v.SirenOn) UIKit.Label(new Rect(box.x + 140, box.y + 64, 70, 24), "SIREN", 13, new Color(1f, 0.4f, 0.4f), TextAnchor.UpperRight, true);
            }

            // ---- driving rules: speed-limit sign + score
            var rules = DrivingRules.Instance;
            if (rules != null && rules.Enforcing && pc.InVehicle && rules.CurrentLimit > 0)
            {
                var sign = new Rect(W - 410, H - 140, 70, 70);
                UIKit.Icon(UIKit.Circle, sign.center, 74, 0, new Color(0.85f, 0.1f, 0.1f));
                UIKit.Icon(UIKit.Circle, sign.center, 58, 0, Color.white);
                UIKit.Label(sign, rules.CurrentLimit.ToString(), 26, Color.black, TextAnchor.MiddleCenter, true, false);
                UIKit.Label(new Rect(W - 520, H - 66, 180, 26), "Driving score " + rules.Score, 18, rules.Score >= 70 ? UIKit.Good : UIKit.Bad, TextAnchor.UpperRight, true);
            }

            // ---- GPS instruction + mission objective (top centre)
            float y = 18;
            var mr = MissionRunner.Instance;
            if (mr != null && mr.Active != null)
            {
                var r = new Rect(W / 2 - 430, y, 860, 64);
                UIKit.Panel(r, new Color(0, 0, 0, 0.6f));
                UIKit.Label(new Rect(r.x + 18, r.y + 6, r.width - 160, 26), mr.Active.Title.ToUpperInvariant(), 16, UIKit.Saffron, TextAnchor.UpperLeft, true);
                UIKit.Label(new Rect(r.x + 18, r.y + 28, r.width - 160, 32), mr.Objective ?? "", 21, Color.white, TextAnchor.UpperLeft, true);
                if (mr.TimerRunning)
                    UIKit.Title(new Rect(r.xMax - 140, r.y + 6, 125, 54), Fmt.Time(mr.TimeLeft), 38, mr.TimeLeft < 20 ? UIKit.Bad : Color.white);
                y += 74;
            }
            var gps = GPSNavigator.Instance;
            if (gps != null && gps.HasTarget && !string.IsNullOrEmpty(gps.Instruction))
            {
                var r = new Rect(W / 2 - 330, y, 660, 46);
                UIKit.Panel(r, new Color(0.25f, 0.1f, 0.4f, 0.75f));
                float ang = gps.TurnSign == 1 ? 90 : gps.TurnSign == -1 ? -90 : 0;
                if (gps.TurnSign == 2) UIKit.Icon(UIKit.Circle, new Vector2(r.x + 28, r.y + 23), 20, 0, Color.white);
                else UIKit.Icon(UIKit.Arrow, new Vector2(r.x + 28, r.y + 23), 28, ang, Color.white);
                UIKit.Label(new Rect(r.x + 54, r.y + 8, r.width - 170, 30), gps.Instruction, 19, Color.white, TextAnchor.UpperLeft, true);
                UIKit.Label(new Rect(r.xMax - 120, r.y + 10, 110, 30), Fmt.Dist(gps.RemainingMeters), 19, new Color(0.85f, 0.75f, 1f), TextAnchor.UpperRight, true);
            }

            // ---- toasts (left)
            float ty = 24;
            for (int i = HudMessages.Toasts.Count - 1; i >= 0; i--)
            {
                var t = HudMessages.Toasts[i];
                if (Time.unscaledTime > t.Until) { HudMessages.Toasts.RemoveAt(i); continue; }
            }
            foreach (var t in HudMessages.Toasts)
            {
                UIKit.Panel(new Rect(24, ty, 520, 34), new Color(0, 0, 0, 0.55f));
                UIKit.Label(new Rect(36, ty + 5, 500, 28), t.Text, 18, t.Color, TextAnchor.UpperLeft, true);
                ty += 40;
            }

            // ---- centre title (mission passed etc.)
            if (HudMessages.BigTitle != null && Time.unscaledTime < HudMessages.BigUntil)
            {
                float a = Mathf.Clamp01((HudMessages.BigUntil - Time.unscaledTime) * 2f);
                UIKit.Title(new Rect(0, H * 0.3f, W, 90), HudMessages.BigTitle, 72, new Color(HudMessages.BigColor.r, HudMessages.BigColor.g, HudMessages.BigColor.b, a));
                var st = UIKit.Style(28, new Color(1, 1, 1, a), TextAnchor.UpperCenter, true);
                GUI.Label(new Rect(0, H * 0.3f + 90, W, 40), HudMessages.BigSub, st);
            }

            // ---- dialogue subtitles
            if (HudMessages.Line != null && Time.unscaledTime < HudMessages.LineUntil)
            {
                var r = new Rect(W / 2 - 520, H - 210, 1040, 74);
                UIKit.Panel(r, new Color(0, 0, 0, 0.62f));
                UIKit.Label(new Rect(r.x + 20, r.y + 8, 300, 26), HudMessages.Speaker, 18, UIKit.Saffron, TextAnchor.UpperLeft, true);
                UIKit.Label(new Rect(r.x + 20, r.y + 32, r.width - 40, 40), HudMessages.Line, 21, Color.white, TextAnchor.UpperLeft, true);
            }

            // ---- interaction prompt / status
            string prompt = pc.Status ?? interactionPrompt;
            if (!string.IsNullOrEmpty(prompt))
            {
                var r = new Rect(W / 2 - 400, H - 122, 800, 44);
                UIKit.Panel(r, new Color(0, 0, 0, 0.6f));
                UIKit.Label(r, prompt, 21, Color.white, TextAnchor.MiddleCenter, true);
            }

            // ---- debug / perf
            fpsAcc += Time.unscaledDeltaTime; fpsFrames++;
            if (fpsAcc > 0.5f) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
            if (GameSettings.Current.ShowFps)
                UIKit.Label(new Rect(W - 420, 120, 395, 24), Mathf.RoundToInt(fps) + " FPS  |  chunks " + world.LoadedChunks + " (+" + world.PendingChunks + ")  |  traffic " +
                    (AI.TrafficManager.Instance != null ? AI.TrafficManager.Instance.ActiveCount : 0), 15, UIKit.Dim, TextAnchor.UpperRight);
        }

        public static string ModeName(GameMode m)
        {
            switch (m)
            {
                case GameMode.FreeRoam: return "FREE ROAM";
                case GameMode.Story: return "STORY";
                case GameMode.DrivingSimulator: return "DRIVING SIMULATOR";
                case GameMode.Missions: return "MISSION MODE";
                case GameMode.Career: return "CAREER";
                default: return "MULTIPLAYER";
            }
        }
    }
}
