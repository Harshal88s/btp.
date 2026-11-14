// Engine / horn / skid / crash audio for a vehicle, driven by VehicleController state.
using Shehar.Vehicles;
using UnityEngine;

namespace Shehar.Audio
{
    public sealed class VehicleAudio : MonoBehaviour
    {
        public static float MasterVolume = 0.8f;
        VehicleController vc;
        AudioSource engine, horn, skid, fx, siren;
        bool player;
        float hornCooldown;

        public static VehicleAudio Attach(VehicleController vc, bool player)
        {
            var a = vc.gameObject.GetComponent<VehicleAudio>();
            if (a == null) a = vc.gameObject.AddComponent<VehicleAudio>();
            a.Init(vc, player);
            return a;
        }

        void Init(VehicleController v, bool isPlayer)
        {
            vc = v;
            if (engine == null)
            {
                string kind = v.Spec.Class == VehicleClass.AutoRickshaw ? "auto" : v.Spec.TwoWheeler ? "bike"
                    : v.Spec.Mass > 5000 ? "heavy" : v.Spec.Class == VehicleClass.Sports ? "sports" : "car";
                engine = Src(SoundSynth.Engine(kind), true);
                horn = Src(SoundSynth.Horn(v.Spec.HornKind == "siren" ? "car" : v.Spec.HornKind), false);
                skid = Src(SoundSynth.Skid(), true);
                fx = Src(SoundSynth.Crash(), false);
                if (v.Spec.HornKind == "siren") siren = Src(SoundSynth.Siren(), true);
                engine.Play(); skid.volume = 0; skid.Play();
                v.Crashed += (dv, c) => { if (dv > 3f) fx.PlayOneShot(SoundSynth.Crash(), Mathf.Clamp01(dv / 12f) * MasterVolume); };
            }
            SetPlayer(isPlayer);
        }

        public void SetPlayer(bool isPlayer)
        {
            player = isPlayer;
            foreach (var s in new[] { engine, horn, skid, fx, siren })
            {
                if (s == null) continue;
                s.spatialBlend = isPlayer ? 0.35f : 1f;
                s.maxDistance = isPlayer ? 500f : 70f;
                s.priority = isPlayer ? 0 : 160;
            }
        }

        AudioSource Src(AudioClip clip, bool loop)
        {
            var s = gameObject.AddComponent<AudioSource>();
            s.clip = clip; s.loop = loop; s.playOnAwake = false;
            s.rolloffMode = AudioRolloffMode.Linear; s.minDistance = 4f; s.maxDistance = 70f;
            s.dopplerLevel = 0.3f; s.spatialBlend = 1f;
            return s;
        }

        public void Horn()
        {
            if (horn == null || hornCooldown > 0) return;
            hornCooldown = horn.clip.length * 0.9f;
            horn.volume = MasterVolume * (player ? 0.7f : 0.8f);
            horn.Play();
        }

        void Update()
        {
            if (vc == null) return;
            hornCooldown -= Time.deltaTime;
            float rpm = vc.Rpm01;
            bool running = vc.EngineRunning && vc.Fuel > 0;
            engine.pitch = 0.55f + rpm * 1.6f;
            engine.volume = running ? MasterVolume * (player ? 0.45f : 0.6f) * (0.5f + rpm * 0.5f) : 0f;
            skid.volume = Mathf.Lerp(skid.volume, vc.Grounded && vc.SpeedKmh > 15 ? vc.TyreSlip * 0.5f * MasterVolume : 0f, Time.deltaTime * 8f);
            if (siren != null)
            {
                if (vc.SirenOn && !siren.isPlaying) siren.Play();
                if (!vc.SirenOn && siren.isPlaying) siren.Stop();
                siren.volume = MasterVolume * 0.5f;
            }
        }
    }
}
