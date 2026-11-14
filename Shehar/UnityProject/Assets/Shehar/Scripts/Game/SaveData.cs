// Persistent player progress (career) and settings, stored as JSON in PlayerPrefs.
using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

namespace Shehar
{
    public enum GameMode { FreeRoam, Story, DrivingSimulator, Missions, Career, Multiplayer }

    [Serializable]
    public sealed class GameSettings
    {
        public float MouseSensitivity = 2.2f;
        public bool InvertY;
        public float DrawDistance = 700f;     // chunk streaming radius (m)
        public float TrafficDensity = 1f;     // 0..2
        public float PedestrianDensity = 1f;  // 0..2
        public float Volume = 0.8f;
        public float DayLengthMinutes = 24f;  // real minutes per in-game day
        public bool Shadows = true;
        public bool ShowFps;
        public int LockedWeather = -1;        // -1 = dynamic

        static GameSettings current;
        public static GameSettings Current
        {
            get
            {
                if (current == null)
                {
                    string j = PlayerPrefs.GetString("settings", "");
                    try { current = string.IsNullOrEmpty(j) ? new GameSettings() : JsonUtility.FromJson<GameSettings>(j); }
                    catch { current = new GameSettings(); }
                }
                return current;
            }
        }
        public void Save() { PlayerPrefs.SetString("settings", JsonUtility.ToJson(this)); PlayerPrefs.Save(); }
    }

    [Serializable]
    public sealed class SaveData
    {
        public long Money = 10000;
        public List<string> OwnedVehicles = new List<string> { "hatch" };
        public string SelectedVehicle = "hatch";
        public List<string> CompletedMissions = new List<string>();
        public int StoryChapter;
        public float DistanceKm;
        public int MissionsPassed, MissionsFailed, Fares, Deliveries;
        public long TotalEarned, FinesPaid;
        public int LandmarksVisitedCount;
        public List<string> LandmarksVisited = new List<string>();
        public int BestLicenceScore;

        static SaveData current;
        public static SaveData Current
        {
            get
            {
                if (current == null)
                {
                    string j = PlayerPrefs.GetString("career", "");
                    try { current = string.IsNullOrEmpty(j) ? new SaveData() : JsonUtility.FromJson<SaveData>(j); }
                    catch { current = new SaveData(); }
                }
                return current;
            }
        }

        public void Save() { PlayerPrefs.SetString("career", JsonUtility.ToJson(this)); PlayerPrefs.Save(); }
        public static void Reset() { current = new SaveData(); current.Save(); }
        /// <summary>Discard unsaved changes (non-persistent modes) by re-reading PlayerPrefs.</summary>
        public static void Reload() { current = null; }

        public bool Owns(string id) { return OwnedVehicles.Contains(id); }

        public void Earn(long amount)
        {
            Money += amount;
            if (amount > 0) TotalEarned += amount;
            else FinesPaid -= amount;
        }

        public bool Spend(long amount)
        {
            if (Money < amount) return false;
            Money -= amount;
            return true;
        }

        public void VisitLandmark(string name)
        {
            if (LandmarksVisited.Contains(name)) return;
            LandmarksVisited.Add(name);
            LandmarksVisitedCount = LandmarksVisited.Count;
        }
    }

    public static class Fmt
    {
        /// <summary>Indian digit grouping: 120000 -> "₹1,20,000".</summary>
        public static string INR(long v)
        {
            bool neg = v < 0; v = Math.Abs(v);
            string s = v.ToString(CultureInfo.InvariantCulture);
            if (s.Length > 3)
            {
                string last3 = s.Substring(s.Length - 3), rest = s.Substring(0, s.Length - 3);
                var parts = new List<string>();
                while (rest.Length > 2) { parts.Insert(0, rest.Substring(rest.Length - 2)); rest = rest.Substring(0, rest.Length - 2); }
                if (rest.Length > 0) parts.Insert(0, rest);
                s = string.Join(",", parts) + "," + last3;
            }
            return (neg ? "-" : "") + "₹" + s;
        }

        public static string Dist(float m) { return m >= 1000 ? (m / 1000f).ToString("0.0") + " km" : (Mathf.Round(m / 10f) * 10).ToString("0") + " m"; }

        public static string Time(float seconds)
        {
            int s = Mathf.Max(0, Mathf.CeilToInt(seconds));
            return (s / 60) + ":" + (s % 60).ToString("00");
        }
    }
}
