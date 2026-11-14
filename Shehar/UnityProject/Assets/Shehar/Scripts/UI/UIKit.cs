// Immediate-mode UI toolkit (Unity IMGUI, no extra packages): resolution-independent layout at a virtual
// 1080p height, rounded panels, buttons with sounds, bars, rotated lines/arrows for the minimap and map.
using Shehar.Audio;
using UnityEngine;

namespace Shehar.UI
{
    public static class UIKit
    {
        public static readonly Color Saffron = new Color(1f, 0.6f, 0.2f), IndiaGreen = new Color(0.07f, 0.53f, 0.03f),
            Navy = new Color(0.12f, 0.23f, 0.54f), PanelBg = new Color(0.05f, 0.06f, 0.09f, 0.86f), Text = new Color(0.96f, 0.96f, 0.95f),
            Dim = new Color(0.7f, 0.72f, 0.76f), Good = new Color(0.35f, 0.9f, 0.45f), Bad = new Color(1f, 0.38f, 0.33f);

        public static float Scale { get; private set; } = 1f;
        public static float W { get { return Screen.width / Scale; } }
        public static float H { get { return Screen.height / Scale; } }

        static Texture2D white, round, arrow, circle;
        static GUIStyle label, button, panel, title;
        static Font font;

        public static Texture2D White { get { Init(); return white; } }
        public static Texture2D Arrow { get { Init(); return arrow; } }
        public static Texture2D Circle { get { Init(); return circle; } }

        static void Init()
        {
            if (white != null) return;
            white = new Texture2D(1, 1) { name = "UiWhite" }; white.SetPixel(0, 0, Color.white); white.Apply();
            int s = 32, rr = 10;
            round = new Texture2D(s, s, TextureFormat.RGBA32, false) { name = "UiRound", wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < s; y++)
                for (int x = 0; x < s; x++)
                {
                    float dx = Mathf.Max(0, Mathf.Max(rr - x, x - (s - 1 - rr))), dy = Mathf.Max(0, Mathf.Max(rr - y, y - (s - 1 - rr)));
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    round.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(rr - d + 0.5f)));
                }
            round.Apply();
            arrow = new Texture2D(32, 32, TextureFormat.RGBA32, false) { name = "UiArrow", wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < 32; y++)
                for (int x = 0; x < 32; x++)
                {
                    // upward-pointing chevron arrow
                    float fx = (x - 15.5f) / 16f, fy = (31 - y) / 31f; // fy = 0 at the tip (top)
                    bool inside = Mathf.Abs(fx) < fy * 0.85f && !(fy > 0.72f && Mathf.Abs(fx) < (fy - 0.72f) * 2.2f);
                    arrow.SetPixel(x, y, inside ? Color.white : new Color(1, 1, 1, 0));
                }
            arrow.Apply();
            circle = new Texture2D(32, 32, TextureFormat.RGBA32, false) { name = "UiCircle", wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < 32; y++)
                for (int x = 0; x < 32; x++)
                {
                    float d = Vector2.Distance(new Vector2(x, y), new Vector2(15.5f, 15.5f));
                    circle.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(15.5f - d)));
                }
            circle.Apply();
            font = Vehicles.VehicleFactory.UIFont();
        }

        /// <summary>Call at the start of every OnGUI.</summary>
        public static void Begin()
        {
            Init();
            Scale = Mathf.Max(0.5f, Screen.height / 1080f);
            GUI.matrix = Matrix4x4.TRS(Vector3.zero, Quaternion.identity, new Vector3(Scale, Scale, 1));
            if (label == null)
            {
                label = new GUIStyle(GUI.skin.label) { font = font, fontSize = 20, wordWrap = true, richText = true };
                label.normal.textColor = Text;
                title = new GUIStyle(label) { fontSize = 40, fontStyle = FontStyle.Bold, wordWrap = false };
                button = new GUIStyle(GUI.skin.button) { font = font, fontSize = 22, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleLeft, padding = new RectOffset(22, 12, 6, 6), border = new RectOffset(10, 10, 10, 10), richText = true };
                button.normal.background = round; button.hover.background = round; button.active.background = round;
                button.normal.textColor = Text; button.hover.textColor = Color.black; button.active.textColor = Color.black;
                panel = new GUIStyle { border = new RectOffset(10, 10, 10, 10), normal = { background = round } };
            }
        }

        public static GUIStyle Style(int size, Color c, TextAnchor align = TextAnchor.UpperLeft, bool bold = false, bool wrap = true)
        {
            var s = new GUIStyle(label) { fontSize = size, alignment = align, fontStyle = bold ? FontStyle.Bold : FontStyle.Normal, wordWrap = wrap };
            s.normal.textColor = c;
            return s;
        }

        public static void Rect(Rect r, Color c)
        {
            var old = GUI.color; GUI.color = c; GUI.DrawTexture(r, white); GUI.color = old;
        }

        public static void Panel(Rect r, Color? c = null)
        {
            var old = GUI.color; GUI.color = c ?? PanelBg;
            GUI.Box(r, GUIContent.none, panel);
            GUI.color = old;
        }

        public static void Label(Rect r, string text, int size = 20, Color? c = null, TextAnchor align = TextAnchor.UpperLeft, bool bold = false, bool shadow = true)
        {
            if (shadow)
            {
                var sh = Style(size, new Color(0, 0, 0, 0.75f), align, bold);
                GUI.Label(new Rect(r.x + 2, r.y + 2, r.width, r.height), text, sh);
            }
            GUI.Label(r, text, Style(size, c ?? Text, align, bold));
        }

        public static void Title(Rect r, string text, int size, Color c, TextAnchor align = TextAnchor.UpperLeft)
        {
            var s = new GUIStyle(title) { fontSize = size, alignment = align };
            s.normal.textColor = new Color(0, 0, 0, 0.7f);
            GUI.Label(new Rect(r.x + 3, r.y + 3, r.width, r.height), text, s);
            s.normal.textColor = c;
            GUI.Label(r, text, s);
        }

        public static bool Button(Rect r, string text, bool enabled = true, Color? accent = null)
        {
            Color a = accent ?? Saffron;
            bool hover = r.Contains(Event.current.mousePosition) && enabled;
            var old = GUI.color;
            GUI.color = !enabled ? new Color(0.25f, 0.25f, 0.28f, 0.8f) : hover ? a : new Color(0.12f, 0.13f, 0.17f, 0.92f);
            var st = new GUIStyle(button);
            st.normal.textColor = !enabled ? new Color(0.55f, 0.55f, 0.58f) : hover ? Color.black : Text;
            bool clicked = GUI.Button(r, text, st) && enabled;
            GUI.color = old;
            if (hover) Rect(new Rect(r.x, r.y + 6, 4, r.height - 12), Color.white);
            if (clicked) UiSound.Play(SoundSynth.Blip(), 0.5f);
            return clicked;
        }

        public static void Bar(Rect r, float v, Color c, string text = null)
        {
            Rect(r, new Color(0, 0, 0, 0.55f));
            Rect(new Rect(r.x + 2, r.y + 2, (r.width - 4) * Mathf.Clamp01(v), r.height - 4), c);
            if (text != null) Label(r, text, Mathf.RoundToInt(r.height * 0.7f), Color.white, TextAnchor.MiddleCenter, true);
        }

        public static float Slider(Rect r, string name, float v, float min, float max, string valueText)
        {
            Label(new Rect(r.x, r.y, r.width * 0.45f, r.height), name, 20);
            float nv = GUI.HorizontalSlider(new Rect(r.x + r.width * 0.45f, r.y + r.height * 0.4f, r.width * 0.4f, 20), v, min, max);
            Label(new Rect(r.x + r.width * 0.87f, r.y, r.width * 0.13f, r.height), valueText, 18, Dim);
            return nv;
        }

        public static bool Toggle(Rect r, string name, bool v)
        {
            Label(new Rect(r.x, r.y, r.width * 0.7f, r.height), name, 20);
            if (Button(new Rect(r.x + r.width * 0.72f, r.y, r.width * 0.28f, r.height - 4), v ? "  ON" : "  OFF", true, v ? Good : Dim)) return !v;
            return v;
        }

        /// <summary>Line between two points in the current GUI space.</summary>
        public static void Line(Vector2 a, Vector2 b, float width, Color c)
        {
            Vector2 d = b - a;
            float len = d.magnitude;
            if (len < 0.5f) return;
            float ang = Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg;
            var m = GUI.matrix;
            GUIUtility.RotateAroundPivot(ang, a);
            var old = GUI.color; GUI.color = c;
            GUI.DrawTexture(new Rect(a.x, a.y - width / 2, len, width), white);
            GUI.color = old;
            GUI.matrix = m;
        }

        public static void Icon(Texture2D tex, Vector2 center, float size, float angleDeg, Color c)
        {
            var m = GUI.matrix;
            if (Mathf.Abs(angleDeg) > 0.01f) GUIUtility.RotateAroundPivot(angleDeg, center);
            var old = GUI.color; GUI.color = c;
            GUI.DrawTexture(new Rect(center.x - size / 2, center.y - size / 2, size, size), tex);
            GUI.color = old;
            GUI.matrix = m;
        }

        /// <summary>Mouse position in virtual UI coordinates.</summary>
        public static Vector2 Mouse { get { return Event.current != null ? Event.current.mousePosition : Vector2.zero; } }
    }
}
