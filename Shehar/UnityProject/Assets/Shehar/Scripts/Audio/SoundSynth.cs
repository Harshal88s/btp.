// Procedurally synthesised audio clips (no audio assets needed): engines per vehicle type, horns, siren,
// rain, thunder, city ambience with distant honking, crash, skid and UI cues.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Shehar.Audio
{
    public static class SoundSynth
    {
        const int Rate = 22050;
        static readonly Dictionary<string, AudioClip> cache = new Dictionary<string, AudioClip>();
        static System.Random rng = new System.Random(1234);

        static AudioClip Make(string name, float seconds, Func<int, float, float> sample)
        {
            if (cache.TryGetValue(name, out var c)) return c;
            int n = Mathf.CeilToInt(seconds * Rate);
            var data = new float[n];
            for (int i = 0; i < n; i++) data[i] = Mathf.Clamp(sample(i, i / (float)Rate), -1f, 1f);
            c = AudioClip.Create(name, n, 1, Rate, false);
            c.SetData(data, 0);
            cache[name] = c;
            return c;
        }

        static float Noise() { return (float)(rng.NextDouble() * 2 - 1); }

        /// <summary>Seamless 1 s engine loop. Pitch it with AudioSource.pitch according to RPM.</summary>
        public static AudioClip Engine(string kind)
        {
            float f0 = 48f, pulse = 0.35f, noise = 0.08f, sub = 0.5f;
            switch (kind)
            {
                case "auto": f0 = 24f; pulse = 0.85f; noise = 0.22f; sub = 0.2f; break;   // single-cylinder putt-putt
                case "bike": f0 = 34f; pulse = 0.7f; noise = 0.15f; sub = 0.3f; break;
                case "heavy": f0 = 30f; pulse = 0.5f; noise = 0.2f; sub = 0.9f; break;    // diesel rumble
                case "sports": f0 = 60f; pulse = 0.4f; noise = 0.06f; sub = 0.4f; break;
            }
            float lp = 0;
            return Make("engine_" + kind, 1f, (i, t) =>
            {
                double ph = t * f0;
                float frac = (float)(ph - Math.Floor(ph));
                float firing = Mathf.Exp(-frac * (6f + 10f * pulse)) * pulse;
                float tone = Mathf.Sin(2 * Mathf.PI * f0 * t) * 0.5f + Mathf.Sin(4 * Mathf.PI * f0 * t) * 0.25f + Mathf.Sin(Mathf.PI * f0 * t) * sub * 0.4f;
                lp += (Noise() - lp) * 0.2f;
                return (tone * (1 - pulse * 0.5f) + firing + lp * noise * 3f) * 0.45f;
            });
        }

        public static AudioClip Horn(string kind)
        {
            float a = 420, b = 505, len = 0.55f, buzz = 0.35f;
            switch (kind)
            {
                case "auto": a = 330; b = 335; len = 0.4f; buzz = 0.8f; break;
                case "bike": a = 610; b = 640; len = 0.35f; buzz = 0.5f; break;
                case "heavy": a = 240; b = 300; len = 0.9f; buzz = 0.6f; break;
            }
            return Make("horn_" + kind, len, (i, t) =>
            {
                float env = Mathf.Clamp01(t / 0.02f) * Mathf.Clamp01((len - t) / 0.05f);
                float s1 = Mathf.Sign(Mathf.Sin(2 * Mathf.PI * a * t)) * buzz + Mathf.Sin(2 * Mathf.PI * a * t) * (1 - buzz);
                float s2 = Mathf.Sign(Mathf.Sin(2 * Mathf.PI * b * t)) * buzz + Mathf.Sin(2 * Mathf.PI * b * t) * (1 - buzz);
                return (s1 + s2) * 0.22f * env;
            });
        }

        public static AudioClip Siren()
        {
            return Make("siren", 2f, (i, t) =>
            {
                float f = 650 + 450 * (0.5f + 0.5f * Mathf.Sin(2 * Mathf.PI * 0.5f * t - Mathf.PI / 2));
                // integrate frequency for a clean sweep
                double phase = 650 * t + 450 * (0.5 * t - Math.Cos(Math.PI * t - Math.PI / 2) / (2 * Math.PI * 0.5) * 0.5);
                return Mathf.Sin((float)(2 * Math.PI * phase)) * 0.3f + Mathf.Sign(Mathf.Sin(2 * Mathf.PI * f * t)) * 0.05f;
            });
        }

        public static AudioClip Rain()
        {
            float lp = 0;
            return Make("rain", 3f, (i, t) =>
            {
                float n = Noise();
                lp += (n - lp) * 0.45f;
                float drop = rng.NextDouble() < 0.002 ? Noise() * 0.6f : 0f;
                return (n - lp) * 0.35f + drop;
            });
        }

        public static AudioClip Thunder()
        {
            float lp = 0, lp2 = 0;
            return Make("thunder", 4.5f, (i, t) =>
            {
                lp += (Noise() - lp) * 0.04f;
                lp2 += (lp - lp2) * 0.1f;
                float env = Mathf.Exp(-t * 0.9f) * (t < 0.05f ? t / 0.05f : 1f) * (1f + 0.6f * Mathf.Sin(t * 7f));
                return lp2 * env * 9f;
            });
        }

        public static AudioClip CityAmbience()
        {
            float lp = 0, lp2 = 0;
            var r = new System.Random(77);
            var honks = new List<(float t, float f, float len)>();
            for (int k = 0; k < 14; k++) honks.Add(((float)r.NextDouble() * 11.5f, 300f + (float)r.NextDouble() * 400f, 0.15f + (float)r.NextDouble() * 0.4f));
            return Make("city", 12f, (i, t) =>
            {
                lp += (Noise() - lp) * 0.02f;
                lp2 += (Noise() - lp2) * 0.3f;
                float s = lp * 1.8f + (lp2 - lp) * 0.04f;
                foreach (var h in honks)
                    if (t >= h.t && t < h.t + h.len)
                        s += Mathf.Sign(Mathf.Sin(2 * Mathf.PI * h.f * t)) * 0.025f * Mathf.Clamp01((h.t + h.len - t) / 0.05f);
                return s;
            });
        }

        public static AudioClip Crash()
        {
            float lp = 0;
            return Make("crash", 0.7f, (i, t) =>
            {
                lp += (Noise() - lp) * 0.25f;
                float clank = Mathf.Sin(2 * Mathf.PI * 180 * t) * Mathf.Exp(-t * 12f) * 0.5f;
                return (lp * 1.4f + clank + Noise() * 0.3f * Mathf.Exp(-t * 20f)) * Mathf.Exp(-t * 5f);
            });
        }

        public static AudioClip Skid()
        {
            float lp = 0;
            return Make("skid", 1f, (i, t) =>
            {
                lp += (Noise() - lp) * 0.6f;
                return (Noise() - lp) * 0.3f + Mathf.Sin(2 * Mathf.PI * 900 * t) * 0.05f;
            });
        }

        public static AudioClip Splash()
        {
            float lp = 0;
            return Make("splash", 1.2f, (i, t) => { lp += (Noise() - lp) * 0.15f; return lp * 1.6f * Mathf.Exp(-t * 3f); });
        }

        public static AudioClip Blip() { return Make("blip", 0.09f, (i, t) => Mathf.Sin(2 * Mathf.PI * 880 * t) * 0.3f * (1 - t / 0.09f)); }

        public static AudioClip Cash()
        {
            return Make("cash", 0.45f, (i, t) =>
            {
                float a = t < 0.12f ? Mathf.Sin(2 * Mathf.PI * 1320 * t) : Mathf.Sin(2 * Mathf.PI * 1760 * t);
                return a * 0.3f * Mathf.Exp(-t * 6f);
            });
        }

        public static AudioClip Jingle(bool success)
        {
            float[] notes = success ? new[] { 523.25f, 659.25f, 783.99f, 1046.5f } : new[] { 392f, 349.2f, 311.1f, 261.6f };
            return Make(success ? "pass" : "fail", 1.1f, (i, t) =>
            {
                int k = Mathf.Min(3, (int)(t / 0.18f));
                float lt = t - k * 0.18f;
                float f = notes[k];
                return (Mathf.Sin(2 * Mathf.PI * f * t) * 0.6f + Mathf.Sin(4 * Mathf.PI * f * t) * 0.15f) * 0.3f * Mathf.Exp(-lt * (k == 3 ? 2.5f : 6f));
            });
        }
    }
}
