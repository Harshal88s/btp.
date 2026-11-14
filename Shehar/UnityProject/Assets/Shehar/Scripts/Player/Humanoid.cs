// Simple procedural humanoid (player and pedestrians) with code-driven walk / run / seated / knocked-down poses.
// Outfits include shirt & trousers, kurta, and saree silhouettes for a distinctly Indian street crowd.
using Shehar.City;
using UnityEngine;

namespace Shehar.Player
{
    public enum Outfit { ShirtTrousers, Kurta, Saree, Uniform }

    public sealed class Humanoid : MonoBehaviour
    {
        public Transform Root, Torso, Head, LegL, LegR, ArmL, ArmR;
        public float Speed;      // m/s, drives the gait
        public bool Seated, Riding, Down;
        float phase, downT;

        static readonly Color32[] Skins = { new Color32(198, 140, 100, 255), new Color32(170, 115, 80, 255), new Color32(140, 95, 65, 255), new Color32(214, 165, 125, 255), new Color32(120, 80, 55, 255) };
        static readonly Color32[] Bright = {
            new Color32(220, 40, 60, 255), new Color32(240, 150, 30, 255), new Color32(30, 120, 200, 255), new Color32(40, 150, 90, 255),
            new Color32(150, 50, 160, 255), new Color32(245, 210, 60, 255), new Color32(240, 240, 235, 255), new Color32(60, 60, 70, 255),
            new Color32(180, 30, 100, 255), new Color32(20, 140, 150, 255) };

        public static Humanoid Build(Transform parent, System.Random rng, Outfit? forced = null, Color32? shirtOverride = null)
        {
            Materials.Init();
            var root = new GameObject("Humanoid");
            root.transform.SetParent(parent, false);
            var h = root.AddComponent<Humanoid>();
            h.Root = root.transform;
            Outfit outfit = forced ?? (Outfit)rng.Next(0, 3);
            Color32 skin = Skins[rng.Next(Skins.Length)];
            Color32 shirt = shirtOverride ?? Bright[rng.Next(Bright.Length)];
            Color32 pants = rng.NextDouble() < 0.6 ? new Color32(40, 45, 70, 255) : new Color32(90, 80, 70, 255);
            Color32 hair = new Color32(20, 18, 16, 255);
            if (outfit == Outfit.Uniform) { shirt = new Color32(200, 180, 130, 255); pants = shirt; }  // khaki
            if (outfit == Outfit.Kurta) pants = new Color32(235, 232, 225, 255);

            var torso = new MeshBuilder();
            torso.Frustum(new Vector3(0, 0, 0), new Vector2(0.34f, 0.2f), new Vector2(0.42f, 0.23f), 0.58f, 0, shirt);
            if (outfit == Outfit.Kurta) torso.Frustum(new Vector3(0, -0.4f, 0), new Vector2(0.4f, 0.26f), new Vector2(0.34f, 0.21f), 0.4f, 0, shirt);
            if (outfit == Outfit.Saree)
            {
                torso.Frustum(new Vector3(0, -0.86f, 0), new Vector2(0.5f, 0.38f), new Vector2(0.34f, 0.24f), 0.88f, 0, shirt);
                torso.Box(new Vector3(0.08f, 0.32f, -0.02f), new Vector3(0.12f, 0.6f, 0.26f), shirt, Quaternion.Euler(0, 0, 28)); // pallu
            }
            torso.Box(new Vector3(0, 0.62f, 0), new Vector3(0.1f, 0.08f, 0.1f), skin); // neck
            h.Torso = Limb(root.transform, "Torso", torso, new Vector3(0, 0.9f, 0));

            var head = new MeshBuilder();
            head.Blob(new Vector3(0, 0.12f, 0), new Vector3(0.105f, 0.125f, 0.115f), 8, 6, skin);
            head.Blob(new Vector3(0, 0.17f, -0.015f), new Vector3(0.11f, 0.09f, 0.115f), 8, 4, hair);
            if (outfit == Outfit.Saree) head.Blob(new Vector3(0, 0.1f, -0.11f), new Vector3(0.06f, 0.06f, 0.05f), 6, 4, hair); // bun
            if (outfit == Outfit.Uniform) head.Frustum(new Vector3(0, 0.2f, 0), new Vector2(0.24f, 0.26f), new Vector2(0.2f, 0.22f), 0.08f, 0, new Color32(60, 50, 40, 255));
            h.Head = Limb(h.Torso, "Head", head, new Vector3(0, 0.66f, 0));

            for (int side = -1; side <= 1; side += 2)
            {
                var leg = new MeshBuilder();
                Color32 lc = outfit == Outfit.Saree ? skin : pants;
                leg.Box(new Vector3(0, -0.42f, 0), new Vector3(0.14f, 0.84f, 0.15f), lc);
                leg.Box(new Vector3(0, -0.86f, 0.05f), new Vector3(0.12f, 0.06f, 0.25f), new Color32(50, 35, 25, 255));
                var l = Limb(root.transform, side < 0 ? "LegL" : "LegR", leg, new Vector3(side * 0.1f, 0.9f, 0));
                var arm = new MeshBuilder();
                arm.Box(new Vector3(0, -0.15f, 0), new Vector3(0.1f, 0.32f, 0.11f), outfit == Outfit.Saree ? skin : shirt);
                arm.Box(new Vector3(0, -0.45f, 0), new Vector3(0.085f, 0.3f, 0.09f), skin);
                var a = Limb(h.Torso, side < 0 ? "ArmL" : "ArmR", arm, new Vector3(side * 0.25f, 0.55f, 0));
                if (side < 0) { h.LegL = l; h.ArmL = a; } else { h.LegR = l; h.ArmR = a; }
            }
            h.phase = (float)rng.NextDouble() * 6f;
            return h;
        }

        static Transform Limb(Transform parent, string name, MeshBuilder mb, Vector3 pos)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh(name);
            go.AddComponent<MeshRenderer>().sharedMaterial = Materials.Cloth;
            return go.transform;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (Down)
            {
                downT = Mathf.Min(1, downT + dt * 3f);
                Root.localRotation = Quaternion.Slerp(Quaternion.identity, Quaternion.Euler(-85, 0, 0), downT);
                Root.localPosition = new Vector3(0, 0.15f * downT, 0);
                return;
            }
            if (downT > 0) { downT = 0; Root.localRotation = Quaternion.identity; Root.localPosition = Vector3.zero; }
            if (Seated || Riding)
            {
                float legA = Riding ? -70 : -85;
                LegL.localRotation = Quaternion.Euler(legA, Riding ? -12 : 0, 0);
                LegR.localRotation = Quaternion.Euler(legA, Riding ? 12 : 0, 0);
                ArmL.localRotation = Quaternion.Euler(-60, 0, Riding ? 10 : 0);
                ArmR.localRotation = Quaternion.Euler(-60, 0, Riding ? -10 : 0);
                Torso.localRotation = Quaternion.Euler(Riding ? 12 : 0, 0, 0);
                return;
            }
            Torso.localRotation = Quaternion.identity;
            float s = Mathf.Clamp(Speed, 0, 7f);
            phase += dt * (2.2f + s * 1.6f);
            float amp = Mathf.Clamp01(s / 1.4f) * (s > 3.5f ? 50f : 32f);
            float sw = Mathf.Sin(phase) * amp;
            LegL.localRotation = Quaternion.Euler(sw, 0, 0);
            LegR.localRotation = Quaternion.Euler(-sw, 0, 0);
            ArmL.localRotation = Quaternion.Euler(-sw * 0.8f, 0, 0);
            ArmR.localRotation = Quaternion.Euler(sw * 0.8f, 0, 0);
            Torso.localPosition = new Vector3(0, 0.9f + Mathf.Abs(Mathf.Cos(phase)) * 0.03f * Mathf.Clamp01(s), 0);
        }
    }
}
