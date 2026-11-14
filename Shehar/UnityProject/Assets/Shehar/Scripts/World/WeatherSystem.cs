// Dynamic weather: clear, cloudy, dusty haze / fog, monsoon rain and thunderstorms. Rain wets the roads
// (glossy shader + reduced tyre grip), lightning flashes the sky and thunder rolls in after a delay.
using Shehar.Audio;
using Shehar.City;
using Shehar.Vehicles;
using UnityEngine;

namespace Shehar.World
{
    public enum WeatherKind { Clear, Cloudy, Haze, Rain, Thunderstorm }

    public sealed class WeatherSystem : MonoBehaviour
    {
        public static WeatherSystem Instance { get; private set; }
        public WeatherKind Current = WeatherKind.Clear;
        public float Cloudiness { get; private set; }
        public float Haze { get; private set; }
        public float FogExtra { get; private set; }
        public float Rain { get; private set; }
        public float Wetness { get; private set; }

        static readonly int WetId = Shader.PropertyToID("_SheharWetness");
        ParticleSystem rainPs;
        AudioSource rainAudio, thunderAudio, ambience;
        float nextChangeHour = -1, nextThunder, thunderDelay = -1, flash;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        public static string Label(WeatherKind k)
        {
            switch (k)
            {
                case WeatherKind.Haze: return "Haze";
                case WeatherKind.Thunderstorm: return "Thunderstorm";
                default: return k.ToString();
            }
        }

        public static WeatherSystem Create(Transform parent)
        {
            var go = new GameObject("Weather");
            go.transform.SetParent(parent, false);
            var w = go.AddComponent<WeatherSystem>();
            w.BuildRain();
            w.rainAudio = go.AddComponent<AudioSource>(); w.rainAudio.clip = SoundSynth.Rain(); w.rainAudio.loop = true; w.rainAudio.volume = 0; w.rainAudio.Play();
            w.thunderAudio = go.AddComponent<AudioSource>(); w.thunderAudio.clip = SoundSynth.Thunder();
            w.ambience = go.AddComponent<AudioSource>(); w.ambience.clip = SoundSynth.CityAmbience(); w.ambience.loop = true; w.ambience.Play();
            int locked = GameSettings.Current.LockedWeather;
            if (locked >= 0) w.Current = (WeatherKind)locked;
            return w;
        }

        void BuildRain()
        {
            var go = new GameObject("Rain");
            go.transform.SetParent(transform, false);
            go.transform.rotation = Quaternion.Euler(90, 0, 0); // emit downwards
            rainPs = go.AddComponent<ParticleSystem>();
            rainPs.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = rainPs.main;
            main.startLifetime = 1.1f;
            main.startSpeed = 22f;
            main.startSize = 0.035f;
            main.maxParticles = 7000;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startColor = new Color(0.75f, 0.8f, 0.9f, 0.45f);
            var shape = rainPs.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = new Vector3(70f, 70f, 1f);
            var em = rainPs.emission;
            em.rateOverTime = 0;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.velocityScale = 0.045f;
            r.lengthScale = 1f;
            r.sharedMaterial = Effects.ParticleMaterial(false);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            rainPs.Play();
        }

        public void Set(WeatherKind k) { Current = k; }

        void Update()
        {
            float dt = Time.deltaTime;
            var clock = DayNightCycle.Instance;
            int locked = GameSettings.Current.LockedWeather;
            if (locked >= 0) Current = (WeatherKind)locked;
            else if (clock != null)
            {
                if (nextChangeHour < 0) nextChangeHour = (clock.Hour + Random.Range(2f, 5f)) % 24f;
                if (Mathf.Abs(Mathf.DeltaAngle(clock.Hour * 15f, nextChangeHour * 15f)) < 0.5f)
                {
                    float r = Random.value;
                    Current = r < 0.38f ? WeatherKind.Clear : r < 0.62f ? WeatherKind.Cloudy : r < 0.74f ? WeatherKind.Haze : r < 0.9f ? WeatherKind.Rain : WeatherKind.Thunderstorm;
                    nextChangeHour = (clock.Hour + Random.Range(2f, 6f)) % 24f;
                }
            }

            float tc = 0, th = 0, tf = 0, tr = 0;
            switch (Current)
            {
                case WeatherKind.Cloudy: tc = 0.55f; break;
                case WeatherKind.Haze: tc = 0.25f; th = 1f; tf = 0.0035f; break;
                case WeatherKind.Rain: tc = 0.85f; tf = 0.0016f; tr = 0.55f; break;
                case WeatherKind.Thunderstorm: tc = 1f; tf = 0.0022f; tr = 1f; break;
            }
            float k = dt * 0.25f;
            Cloudiness = Mathf.MoveTowards(Cloudiness, tc, k);
            Haze = Mathf.MoveTowards(Haze, th, k);
            FogExtra = Mathf.MoveTowards(FogExtra, tf, k * 0.004f);
            Rain = Mathf.MoveTowards(Rain, tr, k);
            Wetness = Rain > 0.05f ? Mathf.MoveTowards(Wetness, 1f, dt * 0.08f) : Mathf.MoveTowards(Wetness, 0f, dt * 0.01f);
            Shader.SetGlobalFloat(WetId, Wetness);
            VehicleController.WeatherGrip = 1f - Wetness * 0.28f;

            var cam = Camera.main;
            if (cam != null) rainPs.transform.position = cam.transform.position + Vector3.up * 16f + cam.transform.forward * 8f;
            var em = rainPs.emission;
            em.rateOverTime = Rain * 6000f;
            float vol = VehicleAudio.MasterVolume;
            rainAudio.volume = Rain * 0.6f * vol;
            ambience.volume = 0.22f * vol * (1f - Rain * 0.5f);

            // lightning
            if (Current == WeatherKind.Thunderstorm)
            {
                nextThunder -= dt;
                if (nextThunder <= 0)
                {
                    nextThunder = Random.Range(7f, 22f);
                    flash = 1f;
                    thunderDelay = Random.Range(0.4f, 2.5f);
                }
            }
            if (thunderDelay >= 0) { thunderDelay -= dt; if (thunderDelay < 0) thunderAudio.PlayOneShot(thunderAudio.clip, vol); }
            flash = Mathf.MoveTowards(flash, 0, dt * 4f);
            if (clock != null) clock.Flash = flash > 0.5f ? flash : flash * 0.3f;
        }
    }
}
