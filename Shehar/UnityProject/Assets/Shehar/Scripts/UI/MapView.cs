// Minimap (heading-up, rotating) and full-screen city map (pan / zoom / click-to-set GPS waypoint, hover shows
// real street name and WGS84 coordinates) drawn from the rasterised OSM map texture.
using Shehar.City;
using Shehar.Core;
using Shehar.Missions;
using Shehar.Navigation;
using Shehar.Player;
using UnityEngine;

namespace Shehar.UI
{
    public sealed class MapView
    {
        public float Zoom = 1f;          // full map: 1 = whole city fits
        public Vector2 Center;           // full map centre in world xz
        Vector2 dragStart; Vector2 centerStart; bool dragging;

        static Color Blip(string kind)
        {
            switch (kind)
            {
                case "fuel": return new Color(0.1f, 0.7f, 0.2f);
                case "mission": return new Color(1f, 0.8f, 0.1f);
                case "landmark": return new Color(0.2f, 0.45f, 0.95f);
                default: return Color.white;
            }
        }

        // ------------------------------------------------------------------ minimap
        public void DrawMinimap(Rect r, float viewMeters)
        {
            var world = CityWorld.Instance; var pc = PlayerController.Instance;
            if (world == null || world.MapTexture == null || pc == null) return;
            var idx = world.Index;
            Vector3 p = pc.Position;
            float yaw = CameraRig.Instance != null ? CameraRig.Instance.Yaw : pc.Focus.eulerAngles.y;
            float ppm = r.width / viewMeters;
            UIKit.Panel(new Rect(r.x - 6, r.y - 6, r.width + 12, r.height + 12), new Color(0, 0, 0, 0.75f));
            GUI.BeginGroup(r);
            Vector2 c = new Vector2(r.width / 2, r.height / 2);
            var m = GUI.matrix;
            GUIUtility.RotateAroundPivot(-yaw, c);
            float span = viewMeters * 1.6f;
            float size = world.MapTexture.width * world.MapMetersPerPixel;
            Rect uv = new Rect((p.x - span / 2 - idx.minX) / size, (p.z - span / 2 - idx.minZ) / size, span / size, span / size);
            var dest = new Rect(c.x - span * ppm / 2, c.y - span * ppm / 2, span * ppm, span * ppm);
            UIKit.Rect(dest, new Color(0.9f, 0.88f, 0.84f));
            GUI.DrawTextureWithTexCoords(dest, world.MapTexture, uv);
            Vector2 W2S(Vector3 q) { return c + new Vector2((q.x - p.x) * ppm, -(q.z - p.z) * ppm); }

            var gps = GPSNavigator.Instance;
            if (gps != null && gps.HasTarget && gps.Route.Count > 1)
            {
                for (int i = 1; i < gps.Route.Count; i++)
                {
                    Vector2 a = W2S(gps.Route[i - 1]), b = W2S(gps.Route[i]);
                    if ((a - c).magnitude > r.width * 1.2f && (b - c).magnitude > r.width * 1.2f) continue;
                    UIKit.Line(a, b, 5f, new Color(0.6f, 0.25f, 0.95f, 0.95f));
                }
            }
            foreach (var poi in idx.pois)
                if (poi.kind == "fuel") Dot(W2S(new Vector3(poi.x, 0, poi.z)), c, r, 9, Blip("fuel"), true);
            foreach (var l in idx.landmarks) Dot(W2S(new Vector3(l.x, 0, l.z)), c, r, 8, Blip("landmark"), true);
            var mr = MissionRunner.Instance;
            if (mr != null && mr.Active == null)
                foreach (var ms in mr.All) if (mr.IsVisibleStart(ms)) Dot(W2S(ms.Start), c, r, 13, Blip("mission"), true);
            if (gps != null && gps.HasTarget) Dot(W2S(gps.Target), c, r, 14, new Color(0.65f, 0.3f, 1f), true);
            GUI.matrix = m;
            UIKit.Icon(UIKit.Arrow, c, 22, (pc.Focus.eulerAngles.y - yaw), new Color(0.15f, 0.45f, 1f));
            // north indicator
            Vector2 north = c + (Vector2)(Quaternion.Euler(0, 0, -yaw) * new Vector2(0, -r.height / 2 + 14));
            UIKit.Icon(UIKit.Circle, north, 22, 0, new Color(0, 0, 0, 0.7f));
            UIKit.Label(new Rect(north.x - 11, north.y - 12, 22, 24), "N", 15, Color.white, TextAnchor.MiddleCenter, true, false);
            GUI.EndGroup();
            UIKit.Label(new Rect(r.x, r.yMax + 2, r.width, 18), "© OpenStreetMap contributors", 12, new Color(1, 1, 1, 0.6f), TextAnchor.UpperRight);
        }

        static void Dot(Vector2 pos, Vector2 c, Rect r, float size, Color col, bool clampToEdge)
        {
            Vector2 d = pos - c;
            float lim = r.width / 2 - 8;
            if (Mathf.Abs(d.x) > lim * 1.42f || Mathf.Abs(d.y) > lim * 1.42f)
            {
                if (!clampToEdge || size < 12) return;
                d = d.normalized * lim;
                pos = c + d;
            }
            UIKit.Icon(UIKit.Circle, pos, size + 3, 0, new Color(0, 0, 0, 0.6f));
            UIKit.Icon(UIKit.Circle, pos, size, 0, col);
        }

        // ------------------------------------------------------------------ full map
        public void DrawFullMap(Rect r)
        {
            var world = CityWorld.Instance; var pc = PlayerController.Instance;
            if (world == null || world.MapTexture == null) return;
            var idx = world.Index;
            float size = world.MapTexture.width * world.MapMetersPerPixel;
            if (Center == Vector2.zero && pc != null) Center = new Vector2(pc.Position.x, pc.Position.z);
            float fit = Mathf.Max(idx.maxX - idx.minX, idx.maxZ - idx.minZ);
            float viewMeters = fit / Zoom;
            float ppm = r.height / viewMeters;
            var e = Event.current;

            UIKit.Rect(r, new Color(0.85f, 0.83f, 0.78f));
            GUI.BeginGroup(r);
            Vector2 c = new Vector2(r.width / 2, r.height / 2);
            Vector2 W2S(float x, float z) { return c + new Vector2((x - Center.x) * ppm, -(z - Center.y) * ppm); }
            Vector3 S2W(Vector2 s) { return new Vector3(Center.x + (s.x - c.x) / ppm, 0, Center.y - (s.y - c.y) / ppm); }
            float wv = r.width / ppm, hv = r.height / ppm;
            Rect uv = new Rect((Center.x - wv / 2 - idx.minX) / size, (Center.y - hv / 2 - idx.minZ) / size, wv / size, hv / size);
            GUI.DrawTextureWithTexCoords(new Rect(0, 0, r.width, r.height), world.MapTexture, uv);

            var gps = GPSNavigator.Instance;
            if (gps != null && gps.HasTarget)
                for (int i = 1; i < gps.Route.Count; i++)
                    UIKit.Line(W2S(gps.Route[i - 1].x, gps.Route[i - 1].z), W2S(gps.Route[i].x, gps.Route[i].z), 4f, new Color(0.6f, 0.25f, 0.95f, 0.95f));
            foreach (var poi in idx.pois) if (poi.kind == "fuel") UIKit.Icon(UIKit.Circle, W2S(poi.x, poi.z), 9, 0, Blip("fuel"));
            var labelStyleSize = Zoom > 2.5f ? 15 : 13;
            Poi hoverLm = null;
            foreach (var l in idx.landmarks)
            {
                Vector2 s = W2S(l.x, l.z);
                bool hover = (UIKit.Mouse - s).magnitude < 10f;
                if (hover) hoverLm = l;
                UIKit.Icon(UIKit.Circle, s, hover ? 16 : 11, 0, Blip("landmark"));
                UIKit.Label(new Rect(s.x + 8, s.y - 10, 260, 22), l.name, labelStyleSize, new Color(0.1f, 0.15f, 0.4f), TextAnchor.UpperLeft, true, false);
            }
            var mr = MissionRunner.Instance;
            if (mr != null)
                foreach (var ms in mr.All)
                    if (mr.IsVisibleStart(ms))
                    {
                        Vector2 s = W2S(ms.Start.x, ms.Start.z);
                        UIKit.Icon(UIKit.Circle, s, 16, 0, Blip("mission"));
                        UIKit.Label(new Rect(s.x - 8, s.y - 11, 16, 22), "M", 14, Color.black, TextAnchor.MiddleCenter, true, false);
                    }
            if (gps != null && gps.HasTarget) UIKit.Icon(UIKit.Circle, W2S(gps.Target.x, gps.Target.z), 16, 0, new Color(0.65f, 0.3f, 1f));
            if (pc != null) UIKit.Icon(UIKit.Arrow, W2S(pc.Position.x, pc.Position.z), 24, pc.Focus.eulerAngles.y, new Color(0.1f, 0.4f, 1f));

            // interaction
            Vector2 mouse = UIKit.Mouse; // already relative to the BeginGroup
            bool inside = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= r.width && mouse.y <= r.height;
            if (inside)
            {
                Vector3 wpos = S2W(mouse);
                var geo = new GeoFrame(idx);
                geo.ToLatLon(wpos.x, wpos.z, out double lat, out double lon);
                string street = world.StreetName(wpos);
                string info = (hoverLm != null ? "<b>" + hoverLm.name + "</b>   " : "") + (street != "" ? street + " · " : "") + world.ZoneName(wpos) +
                              "   (" + lat.ToString("0.00000") + "°N, " + lon.ToString("0.00000") + "°E)";
                UIKit.Panel(new Rect(10, r.height - 44, r.width - 20, 36), new Color(0, 0, 0, 0.7f));
                UIKit.Label(new Rect(20, r.height - 40, r.width - 40, 30), info, 18);
                if (e.type == EventType.ScrollWheel)
                {
                    Vector3 before = S2W(mouse);
                    Zoom = Mathf.Clamp(Zoom * (e.delta.y > 0 ? 0.85f : 1.18f), 1f, 14f);
                    float nppm = r.height / (fit / Zoom);
                    Center = new Vector2(before.x - (mouse.x - c.x) / nppm, before.z + (mouse.y - c.y) / nppm);
                    e.Use();
                }
                if (e.type == EventType.MouseDown && e.button == 0) { dragging = true; dragStart = mouse; centerStart = Center; e.Use(); }
                if (e.type == EventType.MouseDown && e.button == 1)
                {
                    if (gps != null)
                    {
                        if (hoverLm != null) gps.SetTarget(new Vector3(hoverLm.x, 0, hoverLm.z), hoverLm.name);
                        else gps.SetTarget(wpos, street != "" ? street : "Waypoint");
                    }
                    e.Use();
                }
            }
            if (dragging && e.type == EventType.MouseDrag)
            {
                Vector2 d = mouse - dragStart;
                Center = centerStart + new Vector2(-d.x / ppm, d.y / ppm);
                e.Use();
            }
            if (e.type == EventType.MouseUp) dragging = false;
            Center = new Vector2(Mathf.Clamp(Center.x, idx.minX, idx.maxX), Mathf.Clamp(Center.y, idx.minZ, idx.maxZ));
            GUI.EndGroup();
        }
    }
}
