// Remappable keyboard bindings (persisted in PlayerPrefs) + basic gamepad support through Unity's default
// Input Manager axes ("Horizontal"/"Vertical"/"Mouse X"/"Mouse Y") and joystick buttons.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Shehar
{
    public enum GameAction
    {
        Forward, Back, Left, Right, Handbrake, Sprint, EnterExit, Interact, Camera, Map, Missions, Pause, Reset, Horn, Lights, Siren
    }

    public static class GameInput
    {
        static readonly Dictionary<GameAction, KeyCode> defaults = new Dictionary<GameAction, KeyCode>
        {
            { GameAction.Forward, KeyCode.W }, { GameAction.Back, KeyCode.S }, { GameAction.Left, KeyCode.A }, { GameAction.Right, KeyCode.D },
            { GameAction.Handbrake, KeyCode.Space }, { GameAction.Sprint, KeyCode.LeftShift }, { GameAction.EnterExit, KeyCode.E },
            { GameAction.Interact, KeyCode.F }, { GameAction.Camera, KeyCode.C }, { GameAction.Map, KeyCode.M }, { GameAction.Missions, KeyCode.Tab },
            { GameAction.Pause, KeyCode.Escape }, { GameAction.Reset, KeyCode.R }, { GameAction.Horn, KeyCode.H }, { GameAction.Lights, KeyCode.L },
            { GameAction.Siren, KeyCode.G },
        };
        // fixed gamepad buttons (Xbox layout on the default Input Manager)
        static readonly Dictionary<GameAction, KeyCode> pad = new Dictionary<GameAction, KeyCode>
        {
            { GameAction.Handbrake, KeyCode.JoystickButton0 }, { GameAction.Camera, KeyCode.JoystickButton1 },
            { GameAction.Interact, KeyCode.JoystickButton2 }, { GameAction.EnterExit, KeyCode.JoystickButton3 },
            { GameAction.Horn, KeyCode.JoystickButton4 }, { GameAction.Sprint, KeyCode.JoystickButton5 },
            { GameAction.Map, KeyCode.JoystickButton6 }, { GameAction.Pause, KeyCode.JoystickButton7 },
            { GameAction.Reset, KeyCode.JoystickButton9 },
        };
        static readonly Dictionary<GameAction, KeyCode> binds = new Dictionary<GameAction, KeyCode>();
        static bool loaded;

        public static readonly string[] Labels =
        {
            "Accelerate / Forward", "Brake / Reverse", "Steer left", "Steer right", "Handbrake / Jump", "Sprint / Boost",
            "Enter / Exit vehicle", "Interact", "Change camera", "City map", "Missions", "Pause", "Reset vehicle", "Horn", "Headlights", "Siren (emergency vehicles)"
        };

        static void Load()
        {
            if (loaded) return;
            loaded = true;
            foreach (var kv in defaults)
            {
                int v = PlayerPrefs.GetInt("bind_" + kv.Key, (int)kv.Value);
                binds[kv.Key] = Enum.IsDefined(typeof(KeyCode), v) ? (KeyCode)v : kv.Value;
            }
        }

        public static KeyCode Get(GameAction a) { Load(); return binds[a]; }

        public static void Set(GameAction a, KeyCode k)
        {
            Load();
            // swap with any action already using that key so nothing becomes unbound
            foreach (var other in new List<GameAction>(binds.Keys))
                if (other != a && binds[other] == k) { binds[other] = binds[a]; PlayerPrefs.SetInt("bind_" + other, (int)binds[other]); }
            binds[a] = k;
            PlayerPrefs.SetInt("bind_" + a, (int)k);
            PlayerPrefs.Save();
        }

        public static void ResetDefaults()
        {
            Load();
            foreach (var kv in defaults) { binds[kv.Key] = kv.Value; PlayerPrefs.SetInt("bind_" + kv.Key, (int)kv.Value); }
            PlayerPrefs.Save();
        }

        public static bool Held(GameAction a)
        {
            Load();
            return Input.GetKey(binds[a]) || (pad.TryGetValue(a, out var p) && Input.GetKey(p));
        }

        public static bool Down(GameAction a)
        {
            Load();
            return Input.GetKeyDown(binds[a]) || (pad.TryGetValue(a, out var p) && Input.GetKeyDown(p));
        }

        static float Axis(string name)
        {
            try { return Input.GetAxis(name); } catch (ArgumentException) { return 0f; }
        }

        static bool KeyboardSteering { get { return Held(GameAction.Left) || Held(GameAction.Right) || Held(GameAction.Forward) || Held(GameAction.Back); } }

        /// <summary>-1..1 (forward positive).</summary>
        public static float Vertical
        {
            get
            {
                float k = (Held(GameAction.Forward) ? 1f : 0f) - (Held(GameAction.Back) ? 1f : 0f);
                if (KeyboardSteering) return k;
                float a = Axis("Vertical");
                return Mathf.Abs(a) > 0.15f ? a : 0f;
            }
        }

        /// <summary>-1..1 (right positive).</summary>
        public static float Horizontal
        {
            get
            {
                float k = (Held(GameAction.Right) ? 1f : 0f) - (Held(GameAction.Left) ? 1f : 0f);
                if (KeyboardSteering) return k;
                float a = Axis("Horizontal");
                return Mathf.Abs(a) > 0.15f ? a : 0f;
            }
        }

        public static Vector2 Look
        {
            get
            {
                float s = GameSettings.Current.MouseSensitivity;
                return new Vector2(Axis("Mouse X") * s, Axis("Mouse Y") * s * (GameSettings.Current.InvertY ? -1 : 1));
            }
        }

        public static string KeyName(KeyCode k)
        {
            switch (k)
            {
                case KeyCode.LeftShift: return "L-Shift";
                case KeyCode.RightShift: return "R-Shift";
                case KeyCode.Escape: return "Esc";
                case KeyCode.Space: return "Space";
                case KeyCode.Tab: return "Tab";
                default: return k.ToString();
            }
        }
    }
}
