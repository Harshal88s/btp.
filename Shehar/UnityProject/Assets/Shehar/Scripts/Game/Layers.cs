// Physics layer conventions (uses Unity's built-in layers so the project needs no custom TagManager):
//   0 Default        : world geometry (ground, buildings, parapets, speed breakers)
//   1 TransparentFX  : characters (player on foot, pedestrians) - wheels never ride on them
//   2 Ignore Raycast : vehicles - excluded from wheel / camera rays, included explicitly in AI sensing
namespace Shehar
{
    public static class Layers
    {
        public const int World = 0, Character = 1, Vehicle = 2;
        public const int WorldMask = 1 << World;
        public const int VehicleMask = 1 << Vehicle;
        public const int CharacterMask = 1 << Character;
        public const int WheelMask = WorldMask;
        public const int CameraMask = WorldMask;
        public const int SensingMask = WorldMask | VehicleMask | CharacterMask;

        public static void SetRecursive(UnityEngine.GameObject go, int layer)
        {
            go.layer = layer;
            foreach (UnityEngine.Transform t in go.transform) SetRecursive(t.gameObject, layer);
        }
    }
}
