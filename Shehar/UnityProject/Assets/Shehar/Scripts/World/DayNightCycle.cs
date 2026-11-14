// Time of day: sun / moon light, procedural sky colours, ambient light, fog, lit windows and street lamps.
// Sunrise ~06:00 and sunset ~18:00 (simplified; Pune's actual times vary ~06:00-07:10 / 17:55-19:15 by season).
using Shehar.City;
using UnityEngine;

namespace Shehar.World
{
    public sealed class DayNightCycle : MonoBehaviour
    {
        public static DayNightCycle Instance { get; private set; }
        public float Hour = 9f;
        public Light Sun;
        public float Night01 { get; private set; }
        public bool IsNight { get { return Night01 > 0.5f; } }
        public float Flash; // lightning flash (0..1), set by WeatherSystem

        static readonly int NightId = Shader.PropertyToID("_SheharNight");
        bool lastNight;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        public string Clock
        {
            get
            {
                int h = Mathf.FloorToInt(Hour) % 24, m = Mathf.FloorToInt((Hour - Mathf.Floor(Hour)) * 60f);
                return h.ToString("00") + ":" + m.ToString("00");
            }
        }

        public static DayNightCycle Create(Transform parent)
        {
            var go = new GameObject("DayNight");
            go.transform.SetParent(parent, false);
            var d = go.AddComponent<DayNightCycle>();
            Light sun = null;
            foreach (var l in FindObjectsOfType<Light>()) if (l.type == LightType.Directional) { sun = l; break; }
            if (sun == null)
            {
                sun = new GameObject("Sun").AddComponent<Light>();
                sun.type = LightType.Directional;
            }
            sun.shadows = GameSettings.Current.Shadows ? LightShadows.Soft : LightShadows.None;
            sun.shadowStrength = 0.75f;
            sun.shadowBias = 0.06f;
            d.Sun = sun;
            RenderSettings.sun = sun;
            if (Materials.Sky != null) RenderSettings.skybox = Materials.Sky;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            QualitySettings.shadowDistance = 160f;
            return d;
        }

        void Update()
        {
            float dayLen = Mathf.Max(1f, GameSettings.Current.DayLengthMinutes) * 60f;
            Hour = (Hour + Time.deltaTime * 24f / dayLen) % 24f;
            var w = WeatherSystem.Instance;
            float cloud = w != null ? w.Cloudiness : 0f;
            float haze = w != null ? w.Haze : 0f;

            float sunAlt = Mathf.Sin((Hour - 6f) / 12f * Mathf.PI);           // -1..1
            float angle = (Hour - 6f) / 12f * 180f;
            Night01 = Mathf.Clamp01(Mathf.InverseLerp(0.08f, -0.12f, sunAlt));
            float dusk = Mathf.Clamp01(1f - Mathf.Abs(sunAlt) / 0.3f);        // golden hour factor

            if (Sun != null)
            {
                if (sunAlt > -0.05f)
                {
                    Sun.transform.rotation = Quaternion.Euler(Mathf.Clamp(angle, 2f, 178f), -100f, 0);
                    Sun.color = Color.Lerp(new Color(1f, 0.96f, 0.88f), new Color(1f, 0.6f, 0.35f), dusk);
                    Sun.intensity = Mathf.Clamp01(sunAlt * 1.6f + 0.1f) * 1.25f * (1f - cloud * 0.65f) + Flash * 2f;
                }
                else
                {
                    Sun.transform.rotation = Quaternion.Euler(55f, 60f, 0);  // moonlight
                    Sun.color = new Color(0.62f, 0.72f, 1f);
                    Sun.intensity = 0.16f * (1f - cloud * 0.8f) + Flash * 2f;
                }
                Sun.shadowStrength = Mathf.Lerp(0.8f, 0.35f, Mathf.Max(cloud, Night01));
            }

            Color dayTop = Color.Lerp(new Color(0.24f, 0.48f, 0.86f), new Color(0.5f, 0.54f, 0.6f), cloud);
            Color dayHor = Color.Lerp(new Color(0.78f, 0.84f, 0.9f), new Color(0.7f, 0.72f, 0.74f), cloud);
            dayHor = Color.Lerp(dayHor, new Color(0.82f, 0.78f, 0.68f), haze);                // dusty haze
            Color duskHor = new Color(0.95f, 0.55f, 0.3f), duskTop = new Color(0.3f, 0.32f, 0.55f);
            Color nightTop = new Color(0.01f, 0.02f, 0.06f), nightHor = new Color(0.08f, 0.09f, 0.14f); // city glow
            Color top = Color.Lerp(Color.Lerp(dayTop, duskTop, dusk * (1 - cloud)), nightTop, Night01);
            Color hor = Color.Lerp(Color.Lerp(dayHor, duskHor, dusk * (1 - cloud) * 0.8f), nightHor, Night01);
            top += Color.white * Flash * 0.6f; hor += Color.white * Flash * 0.6f;

            if (Materials.Sky != null)
            {
                Materials.Sky.SetColor("_TopColor", top);
                Materials.Sky.SetColor("_HorizonColor", hor);
                Materials.Sky.SetColor("_GroundColor", hor * 0.6f);
                Materials.Sky.SetVector("_SunDir", sunAlt > -0.05f ? -Sun.transform.forward : -Sun.transform.forward);
                Materials.Sky.SetColor("_SunColor", (sunAlt > -0.05f ? Sun.color : new Color(0.7f, 0.75f, 0.85f)) * (1f - cloud * 0.9f));
                Materials.Sky.SetFloat("_SunSize", sunAlt > -0.05f ? 0.9985f : 0.9992f);
                Materials.Sky.SetFloat("_Stars", Night01 * (1f - cloud));
            }
            var cam = Camera.main;
            if (cam != null && RenderSettings.skybox == null) { cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = hor; }

            RenderSettings.ambientSkyColor = Color.Lerp(Color.Lerp(new Color(0.55f, 0.62f, 0.75f), new Color(0.55f, 0.56f, 0.6f), cloud), new Color(0.07f, 0.08f, 0.13f), Night01);
            RenderSettings.ambientEquatorColor = Color.Lerp(new Color(0.55f, 0.53f, 0.5f), new Color(0.09f, 0.08f, 0.09f), Night01);
            RenderSettings.ambientGroundColor = Color.Lerp(new Color(0.32f, 0.29f, 0.25f), new Color(0.04f, 0.04f, 0.05f), Night01);
            RenderSettings.fogColor = hor;
            RenderSettings.fogDensity = 0.0011f + (w != null ? w.FogExtra : 0f);

            Shader.SetGlobalFloat(NightId, Night01);
            Materials.SetLampsOn(Night01);
            if (IsNight != lastNight)
            {
                lastNight = IsNight;
                foreach (var vc in FindObjectsOfType<Vehicles.VehicleController>()) vc.LightsOn = IsNight;
            }
        }
    }
}
