// Message bus between gameplay systems and the HUD: toasts, big centre titles, subtitles/dialogue.
using System.Collections.Generic;
using Shehar.Audio;
using UnityEngine;

namespace Shehar.UI
{
    public static class HudMessages
    {
        public sealed class Toast { public string Text; public Color Color; public float Until; }

        public static readonly List<Toast> Toasts = new List<Toast>();
        public static string BigTitle, BigSub;
        public static Color BigColor = Color.white;
        public static float BigUntil;
        public static string Speaker, Line;
        public static float LineUntil;

        public static void Notify(string text, Color? color = null, float seconds = 4f)
        {
            Toasts.Add(new Toast { Text = text, Color = color ?? Color.white, Until = Time.unscaledTime + seconds });
            if (Toasts.Count > 6) Toasts.RemoveAt(0);
        }

        public static void Big(string title, string sub, Color color, float seconds = 4f)
        {
            BigTitle = title; BigSub = sub; BigColor = color; BigUntil = Time.unscaledTime + seconds;
        }

        public static void Say(string speaker, string line, float seconds)
        {
            Speaker = speaker; Line = line; LineUntil = Time.unscaledTime + seconds;
        }

        public static void Money(long amount, string reason)
        {
            Notify((amount >= 0 ? "+" : "") + Fmt.INR(amount) + "  " + reason, amount >= 0 ? new Color(0.45f, 0.95f, 0.5f) : new Color(1f, 0.45f, 0.4f));
            if (amount > 0) UiSound.Play(SoundSynth.Cash());
        }

        public static void Clear()
        {
            Toasts.Clear(); BigTitle = null; Line = null;
        }
    }

    public static class UiSound
    {
        static AudioSource src;
        public static void Play(AudioClip c, float vol = 0.7f)
        {
            if (src == null)
            {
                var go = new GameObject("UiSound");
                Object.DontDestroyOnLoad(go);
                src = go.AddComponent<AudioSource>();
                src.spatialBlend = 0;
            }
            src.PlayOneShot(c, vol * VehicleAudio.MasterVolume);
        }
    }
}
