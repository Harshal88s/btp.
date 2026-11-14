// Procedural textures and the shared material library. Everything is generated at start-up so the project
// needs no binary art assets (keeps the repo small and licence-clean). Swap in authored textures later by
// assigning Materials.X.mainTexture.
using UnityEngine;

namespace Shehar.City
{
    public static class Materials
    {
        public static Material Asphalt, AsphaltMajor, Marking, Curb, Sidewalk, Ground, Grass, Park, Forest, Water, Sand,
            Campus, Residential, Commercial, Industrial, Parking, Railway, Roof, Concrete, RailTrack, Metal,
            VehicleBody, Glass, Chrome, Tyre, LightFront, LightRear, LightOff, Lamp, Plate, Leaves, Bark, Cloth,
            Skin, Unlit, UnlitAdditive, Sky, SignalRed, SignalAmber, SignalGreen, SignalOff, Marker;
        public static Material[] Facades;
        public static Shader Lit, Cutout, UnlitShader, SkyShader;
        static bool ready;

        public static void Init()
        {
            if (ready) return;
            ready = true;
            Lit = Resources.Load<Shader>("Shaders/CityLit") ?? Shader.Find("Shehar/CityLit");
            Cutout = Resources.Load<Shader>("Shaders/CityCutout") ?? Shader.Find("Shehar/CityCutout");
            UnlitShader = Resources.Load<Shader>("Shaders/UnlitTransparent") ?? Shader.Find("Shehar/UnlitTransparent");
            SkyShader = Resources.Load<Shader>("Shaders/Sky") ?? Shader.Find("Shehar/Sky");
            if (Lit == null) { Debug.LogError("[Shehar] CityLit shader missing - check Assets/Shehar/Resources/Shaders"); Lit = Shader.Find("Diffuse"); }

            Asphalt = Make(TexAsphalt(256, 1), 0.12f, worldUV: 0.125f, wet: 1f);
            AsphaltMajor = Make(TexAsphalt(256, 2), 0.14f, worldUV: 0.125f, wet: 1f);
            AsphaltMajor.color = new Color(0.86f, 0.86f, 0.88f);
            Marking = new Material(Cutout) { name = "Marking", mainTexture = TexDash() };
            Marking.SetFloat("_Cutoff", 0.5f);
            Curb = Make(TexCurb(), 0.1f, wet: 0.6f);
            Sidewalk = Make(TexPavers(), 0.1f, worldUV: 0.5f, wet: 0.7f);
            Ground = Make(TexNoise(256, new Color(0.62f, 0.55f, 0.43f), new Color(0.52f, 0.46f, 0.36f), 3), 0.05f, worldUV: 0.05f, wet: 0.5f);
            Grass = Make(TexNoise(128, new Color(0.47f, 0.58f, 0.3f), new Color(0.38f, 0.5f, 0.24f), 5), 0.05f, worldUV: 0.1f);
            Park = Make(TexNoise(128, new Color(0.36f, 0.55f, 0.26f), new Color(0.3f, 0.47f, 0.2f), 6), 0.05f, worldUV: 0.1f);
            Forest = Make(TexNoise(128, new Color(0.28f, 0.42f, 0.2f), new Color(0.35f, 0.38f, 0.22f), 7), 0.04f, worldUV: 0.08f);
            Sand = Make(TexNoise(128, new Color(0.74f, 0.66f, 0.5f), new Color(0.66f, 0.58f, 0.44f), 8), 0.05f, worldUV: 0.1f);
            Water = Make(TexNoise(128, new Color(0.22f, 0.36f, 0.38f), new Color(0.18f, 0.3f, 0.3f), 9), 0.88f, worldUV: 0.04f);
            Campus = Make(TexNoise(128, new Color(0.66f, 0.6f, 0.5f), new Color(0.6f, 0.55f, 0.45f), 10), 0.06f, worldUV: 0.06f, wet: 0.5f);
            Residential = Make(TexNoise(128, new Color(0.6f, 0.55f, 0.47f), new Color(0.55f, 0.5f, 0.42f), 11), 0.06f, worldUV: 0.06f, wet: 0.5f);
            Commercial = Make(TexNoise(128, new Color(0.64f, 0.6f, 0.56f), new Color(0.58f, 0.55f, 0.5f), 12), 0.08f, worldUV: 0.06f, wet: 0.6f);
            Industrial = Make(TexNoise(128, new Color(0.55f, 0.54f, 0.52f), new Color(0.5f, 0.49f, 0.47f), 13), 0.08f, worldUV: 0.06f, wet: 0.6f);
            Parking = Make(TexAsphalt(128, 3), 0.1f, worldUV: 0.15f, wet: 1f);
            Railway = Make(TexNoise(128, new Color(0.48f, 0.45f, 0.42f), new Color(0.4f, 0.38f, 0.35f), 14), 0.05f, worldUV: 0.1f);
            Roof = Make(TexNoise(128, new Color(0.62f, 0.6f, 0.57f), new Color(0.48f, 0.47f, 0.45f), 15), 0.1f, worldUV: 0.15f, wet: 0.5f);
            Concrete = Make(TexNoise(64, new Color(0.7f, 0.69f, 0.66f), new Color(0.62f, 0.61f, 0.58f), 16), 0.15f, wet: 0.5f);
            RailTrack = Make(TexRail(), 0.2f);
            Metal = Make(null, 0.6f); Metal.SetFloat("_Metallic", 0.7f);

            Facades = new Material[4];
            for (int i = 0; i < Facades.Length; i++)
            {
                Facades[i] = Make(TexFacade(i), i == 2 ? 0.45f : 0.12f, wet: 0.3f);
                Facades[i].name = "Facade" + i;
                Facades[i].SetFloat("_WindowGlow", 1f);
            }

            VehicleBody = Make(null, 0.72f); VehicleBody.SetFloat("_Metallic", 0.35f); VehicleBody.name = "VehicleBody";
            Glass = Make(null, 0.92f); Glass.color = new Color(0.12f, 0.16f, 0.2f); Glass.name = "Glass";
            Chrome = Make(null, 0.85f); Chrome.SetFloat("_Metallic", 0.9f);
            Tyre = Make(TexTyre(), 0.15f); Tyre.color = new Color(0.12f, 0.12f, 0.12f);
            LightFront = Emissive(new Color(1f, 0.97f, 0.85f), 1.6f);
            LightRear = Emissive(new Color(0.9f, 0.05f, 0.03f), 1.4f);
            LightOff = Make(null, 0.8f); LightOff.color = new Color(0.75f, 0.75f, 0.72f);
            Lamp = Emissive(new Color(1f, 0.82f, 0.55f), 0f);
            Plate = Make(null, 0.3f);
            Leaves = Make(TexNoise(64, new Color(0.3f, 0.48f, 0.22f), new Color(0.2f, 0.36f, 0.15f), 20), 0.1f);
            Bark = Make(TexNoise(64, new Color(0.36f, 0.27f, 0.2f), new Color(0.28f, 0.2f, 0.15f), 21), 0.05f);
            Cloth = Make(null, 0.1f);
            Skin = Make(null, 0.25f);
            SignalRed = Emissive(new Color(1f, 0.1f, 0.05f), 2f);
            SignalAmber = Emissive(new Color(1f, 0.6f, 0.05f), 2f);
            SignalGreen = Emissive(new Color(0.1f, 1f, 0.35f), 2f);
            SignalOff = Make(null, 0.6f); SignalOff.color = new Color(0.12f, 0.12f, 0.12f);

            Unlit = new Material(UnlitShader) { name = "Unlit" };
            UnlitAdditive = new Material(UnlitShader) { name = "UnlitAdditive" };
            UnlitAdditive.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.One);
            Marker = new Material(UnlitShader) { name = "Marker", mainTexture = TexMarkerGradient() };
            if (SkyShader != null) Sky = new Material(SkyShader) { name = "Sky" };
        }

        static Material Make(Texture2D tex, float gloss, float worldUV = 0f, float wet = 0f)
        {
            var m = new Material(Lit);
            if (tex != null) { m.mainTexture = tex; m.name = tex.name; }
            m.SetFloat("_Glossiness", gloss);
            m.SetFloat("_WorldUV", worldUV);
            m.SetFloat("_WetAffected", wet);
            return m;
        }

        static Material Emissive(Color c, float intensity)
        {
            var m = Make(null, 0.6f);
            m.color = c;
            m.SetColor("_EmissionColor", c * intensity);
            return m;
        }

        public static void SetLampsOn(float night)
        {
            if (Lamp != null) Lamp.SetColor("_EmissionColor", new Color(1f, 0.8f, 0.5f) * (0.1f + 2.4f * night));
        }

        // ------------------------------------------------------------------ texture helpers
        static float Hash(int x, int y, int seed)
        {
            unchecked
            {
                uint h = (uint)(x * 374761393 + y * 668265263 + seed * 2147483647);
                h = (h ^ (h >> 13)) * 1274126177u;
                return ((h ^ (h >> 16)) & 0xFFFFFF) / (float)0xFFFFFF;
            }
        }

        /// <summary>Tileable value noise (period = size/cell).</summary>
        static float Noise(float x, float y, int period, int seed)
        {
            int x0 = Mathf.FloorToInt(x), y0 = Mathf.FloorToInt(y);
            float fx = x - x0, fy = y - y0;
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
            int X0 = ((x0 % period) + period) % period, Y0 = ((y0 % period) + period) % period;
            int X1 = (X0 + 1) % period, Y1 = (Y0 + 1) % period;
            float a = Hash(X0, Y0, seed), b = Hash(X1, Y0, seed), c = Hash(X0, Y1, seed), d = Hash(X1, Y1, seed);
            return Mathf.Lerp(Mathf.Lerp(a, b, fx), Mathf.Lerp(c, d, fx), fy);
        }

        static float Fbm(int px, int py, int size, int seed)
        {
            float v = 0, amp = 0.5f; int period = 4;
            for (int o = 0; o < 5; o++)
            {
                v += amp * Noise(px * period / (float)size, py * period / (float)size, period, seed + o * 17);
                amp *= 0.5f; period *= 2;
            }
            return v;
        }

        static Texture2D NewTex(int w, int h, string name)
        {
            return new Texture2D(w, h, TextureFormat.RGBA32, true)
            { name = name, wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Trilinear, anisoLevel = 4 };
        }

        static Texture2D TexNoise(int size, Color a, Color b, int seed)
        {
            var t = NewTex(size, size, "Noise" + seed);
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float n = Fbm(x, y, size, seed);
                    float grain = Hash(x, y, seed + 99) * 0.08f;
                    px[y * size + x] = Color.Lerp(a, b, Mathf.Clamp01(n * 1.4f - 0.2f)) * (0.96f + grain);
                }
            t.SetPixels32(px); t.Apply(true);
            return t;
        }

        static Texture2D TexAsphalt(int size, int seed)
        {
            var t = NewTex(size, size, "Asphalt" + seed);
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float n = Fbm(x, y, size, seed * 31);
                    float g = 0.27f + n * 0.12f + Hash(x, y, seed) * 0.07f;
                    float patch = Fbm(x + 50, y + 13, size, seed * 7 + 3);
                    if (patch > 0.62f) g *= 0.82f;                // repaired patches (very Indian roads)
                    if (patch < 0.3f) g = Mathf.Lerp(g, 0.42f, 0.35f); // dusty worn areas
                    px[y * size + x] = new Color(g, g * 0.99f, g * 0.97f, 1);
                }
            t.SetPixels32(px); t.Apply(true);
            return t;
        }

        static Texture2D TexDash()
        {
            // 1 texel wide strip: v in [0,0.5) painted, [0.5,1) empty -> dashed line when v = metres / 6
            var t = NewTex(8, 64, "Dash");
            for (int y = 0; y < 64; y++)
                for (int x = 0; x < 8; x++)
                    t.SetPixel(x, y, y < 32 ? new Color(0.95f, 0.95f, 0.92f, 1) : new Color(1, 1, 1, 0));
            t.Apply(true);
            return t;
        }

        static Texture2D TexCurb()
        {
            // alternating black / yellow kerb paint, 1 m each when v = metres / 2
            var t = NewTex(8, 32, "Curb");
            for (int y = 0; y < 32; y++)
                for (int x = 0; x < 8; x++)
                    t.SetPixel(x, y, y < 16 ? new Color(0.95f, 0.78f, 0.1f) : new Color(0.1f, 0.1f, 0.1f));
            t.Apply(true);
            return t;
        }

        static Texture2D TexPavers()
        {
            int s = 64;
            var t = NewTex(s, s, "Pavers");
            for (int y = 0; y < s; y++)
                for (int x = 0; x < s; x++)
                {
                    int bx = (x + ((y / 16) % 2) * 8) / 16, by = y / 16;
                    bool joint = (x + ((y / 16) % 2) * 8) % 16 == 0 || y % 16 == 0;
                    float h = Hash(bx, by, 5);
                    Color c = h > 0.7f ? new Color(0.6f, 0.36f, 0.3f) : new Color(0.62f, 0.6f, 0.56f);
                    c *= 0.9f + Hash(x, y, 7) * 0.15f;
                    if (joint) c *= 0.6f;
                    t.SetPixel(x, y, c);
                }
            t.Apply(true);
            return t;
        }

        static Texture2D TexRail()
        {
            int w = 32, h = 32;
            var t = NewTex(w, h, "Rail");
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    Color c = new Color(0.42f, 0.4f, 0.37f) * (0.85f + Hash(x, y, 3) * 0.3f); // ballast
                    if (y % 16 < 4 && x > 2 && x < w - 3) c = new Color(0.45f, 0.42f, 0.4f); // concrete sleepers
                    if (x == 8 || x == 9 || x == 22 || x == 23) c = new Color(0.55f, 0.55f, 0.58f); // rails
                    t.SetPixel(x, y, c);
                }
            t.Apply(true);
            return t;
        }

        static Texture2D TexTyre()
        {
            var t = NewTex(32, 8, "Tyre");
            for (int y = 0; y < 8; y++)
                for (int x = 0; x < 32; x++)
                    t.SetPixel(x, y, (x % 4 == 0) ? new Color(0.5f, 0.5f, 0.5f) : Color.white);
            t.Apply(true);
            return t;
        }

        static Texture2D TexMarkerGradient()
        {
            var t = NewTex(4, 64, "MarkerGrad");
            t.wrapMode = TextureWrapMode.Clamp;
            for (int y = 0; y < 64; y++)
                for (int x = 0; x < 4; x++)
                    t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Pow(1 - y / 63f, 1.5f)));
            t.Apply(true);
            return t;
        }

        /// <summary>
        /// One window bay x one floor facade tile (white wall, tinted per building by vertex colour).
        /// Alpha = 0 marks glass (glows at night). Styles: 0 apartment w/ balcony slab, 1 old wada (small
        /// wooden windows), 2 commercial glazing, 3 plain block with grille windows.
        /// </summary>
        static Texture2D TexFacade(int style)
        {
            int s = 64;
            var t = NewTex(s, s, "Facade" + style);
            var px = new Color32[s * s];
            for (int y = 0; y < s; y++)
                for (int x = 0; x < s; x++)
                {
                    float stain = Fbm(x, y * 3, s, 40 + style) * 0.18f;          // monsoon streaks
                    Color wall = Color.white * (0.92f - stain) + Color.black * 0f;
                    wall.a = 1;
                    Color c = wall;
                    bool glass = false;
                    switch (style)
                    {
                        case 0:
                            glass = x > 10 && x < 54 && y > 18 && y < 52;
                            if (y < 8) c = wall * 0.75f;                                   // balcony slab shadow
                            if (glass && (x == 32 || y == 35)) { glass = false; c = new Color(0.35f, 0.33f, 0.3f); }
                            break;
                        case 1:
                            glass = x > 20 && x < 44 && y > 16 && y < 48;
                            if (!glass && x > 16 && x < 48 && y > 12 && y < 52) c = new Color(0.42f, 0.27f, 0.16f); // wooden frame
                            if (glass && (x - 20) % 8 == 0) { glass = false; c = new Color(0.3f, 0.2f, 0.12f); }
                            if (y < 5) c = new Color(0.5f, 0.35f, 0.22f);                   // wooden cornice
                            break;
                        case 2:
                            glass = y > 6 && y < 60 && x > 2 && x < 62;
                            if (glass && x % 21 == 0) { glass = false; c = new Color(0.6f, 0.62f, 0.65f); }
                            break;
                        default:
                            glass = x > 14 && x < 50 && y > 20 && y < 50;
                            if (glass && (x % 6 == 0)) { glass = false; c = new Color(0.25f, 0.25f, 0.27f); } // window grille
                            break;
                    }
                    if (glass)
                    {
                        float refl = 0.25f + 0.25f * (y / (float)s) + Hash(x / 8, y / 8, style) * 0.08f;
                        c = new Color(refl * 0.55f, refl * 0.65f, refl * 0.8f, 0f);
                    }
                    else c.a = 1f;
                    px[y * s + x] = c;
                }
            t.SetPixels32(px); t.Apply(true);
            return t;
        }
    }
}
