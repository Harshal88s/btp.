// Global session state shared across systems.
namespace Shehar
{
    public static class GameState
    {
        public static GameMode Mode = GameMode.FreeRoam;
        public static string CityId = "pune";
        public static bool Paused;
        public static bool Playing;
        /// <summary>Money, purchases and fines persist only in Career; other modes use a session wallet.</summary>
        public static bool PersistentProgress { get { return Mode == GameMode.Career || Mode == GameMode.Story; } }
        public static bool FinesApply { get { return Mode == GameMode.DrivingSimulator || Mode == GameMode.Career; } }
    }
}
