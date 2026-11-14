// Particle helpers: soft-particle texture/material, damage smoke for vehicles.
using Shehar.City;
using Shehar.Vehicles;
using UnityEngine;

namespace Shehar.World
{
    public static class Effects
    {
        static Material alpha, additive;
        static Texture2D soft;

        static Texture2D Soft()
        {
            if (soft != null) return soft;
            int s = 32;
            soft = new Texture2D(s, s, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "SoftParticle" };
            for (int y = 0; y < s; y++)
                for (int x = 0; x < s; x++)
                {
                    float d = Vector2.Distance(new Vector2(x, y), new Vector2(s / 2f - 0.5f, s / 2f - 0.5f)) / (s / 2f);
                    soft.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(1 - d) * Mathf.Clamp01(1 - d)));
                }
            soft.Apply();
            return soft;
        }

        public static Material ParticleMaterial(bool add)
        {
            Materials.Init();
            if (add)
            {
                if (additive == null) { additive = new Material(Materials.UnlitAdditive) { mainTexture = Soft(), name = "ParticleAdd" }; }
                return additive;
            }
            if (alpha == null) { alpha = new Material(Materials.Unlit) { mainTexture = Soft(), name = "ParticleAlpha" }; }
            return alpha;
        }

        public static ParticleSystem Smoke(Transform parent, Vector3 local)
        {
            var go = new GameObject("Smoke");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = local;
            go.transform.localRotation = Quaternion.Euler(-90, 0, 0);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.startLifetime = 2.2f; main.startSpeed = 1.8f; main.startSize = new ParticleSystem.MinMaxCurve(0.6f, 1.4f);
            main.startColor = new Color(0.25f, 0.25f, 0.25f, 0.55f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 300;
            var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Cone; shape.angle = 12f; shape.radius = 0.2f;
            var sz = ps.sizeOverLifetime; sz.enabled = true; sz.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 0.6f, 1, 2.5f));
            var col = ps.colorOverLifetime; col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) },
                      new[] { new GradientAlphaKey(0.8f, 0), new GradientAlphaKey(0f, 1) });
            col.color = g;
            var em = ps.emission; em.rateOverTime = 0;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = ParticleMaterial(false);
            ps.Play();
            return ps;
        }
    }

    /// <summary>Emits engine smoke as a vehicle's health drops.</summary>
    public sealed class DamageSmoke : MonoBehaviour
    {
        VehicleController vc;
        ParticleSystem ps;

        public static void Attach(VehicleController v)
        {
            if (v.GetComponent<DamageSmoke>() != null) return;
            var d = v.gameObject.AddComponent<DamageSmoke>();
            d.vc = v;
            d.ps = Effects.Smoke(v.transform, new Vector3(0, v.Spec.Height * 0.6f, v.Spec.Length * 0.35f));
        }

        void Update()
        {
            if (vc == null || ps == null) return;
            var em = ps.emission;
            em.rateOverTime = vc.Health < 40f ? Mathf.Lerp(30f, 3f, vc.Health / 40f) : 0f;
            var main = ps.main;
            main.startColor = vc.Health <= 0 ? new Color(0.08f, 0.08f, 0.08f, 0.7f) : new Color(0.35f, 0.35f, 0.35f, 0.5f);
        }
    }
}
