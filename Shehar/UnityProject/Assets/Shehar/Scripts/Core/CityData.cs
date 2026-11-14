// Engine-independent data model for city data produced by Tools/osm_pipeline/build_city.py.
// Field names must match the JSON keys exactly (Unity JsonUtility and System.Text.Json both bind public fields).
// No UnityEngine dependency: this folder is compiled and unit-tested outside Unity (see Tests/CoreTests).
using System;

namespace Shehar.Core
{
    [Serializable]
    public class ChunkRef
    {
        public int cx, cz, buildings;
        public string file;
    }

    [Serializable]
    public class RoadInfo
    {
        public long id;
        public string name, alt, type;
        public float width;
        public int rank, lanes, oneway, speed, drivable, traffic, bridge, tunnel, layer;
        public int[] nodes;

        public string DisplayName
        {
            get
            {
                if (!string.IsNullOrEmpty(alt) && alt.Length <= 12) return alt; // "FC Road", "JM Road"
                return string.IsNullOrEmpty(name) ? "" : name;
            }
        }
    }

    [Serializable]
    public class Poi
    {
        public string name, osmName, kind;
        public float x, z;
    }

    [Serializable]
    public class CityIndex
    {
        public string cityId, name, state, attribution;
        public double bboxS, bboxW, bboxN, bboxE, originLat, originLon, metersPerDegLat, metersPerDegLon;
        public float minX, minZ, maxX, maxZ;
        public int chunkSize, chunksX, chunksZ;
        public ChunkRef[] chunks;
        public string spawnName;
        public float spawnX, spawnZ;
        public float[] nodeX, nodeZ;
        public int[] nodeFlags;
        public int[] edgeA, edgeB, edgeRoad, edgeDir;
        public RoadInfo[] roads;
        public Poi[] pois;
        public Poi[] landmarks;
    }

    [Serializable]
    public class BuildingData
    {
        public long id;
        public string kind, name;
        public float h, minH;
        public int levels;
        public float[] pts;
    }

    [Serializable]
    public class AreaData
    {
        public long id;
        public string kind, name;
        public float[] pts;
    }

    [Serializable]
    public class RoadPiece
    {
        public int road;
        public int[] nodes;
    }

    [Serializable]
    public class RailData
    {
        public long id;
        public string kind, name;
        public int elevated;
        public float[] pts;
    }

    [Serializable]
    public class WaterLine
    {
        public long id;
        public string kind, name;
        public float width;
        public float[] pts;
    }

    [Serializable]
    public class ChunkData
    {
        public int cx, cz;
        public BuildingData[] buildings;
        public AreaData[] areas;
        public RoadPiece[] roads;
        public RailData[] rails;
        public float[] trees;
    }

    [Serializable]
    public class GlobalData
    {
        public AreaData[] areas;
        public WaterLine[] waterLines;
    }

    public static class NodeFlags
    {
        public const int TrafficSignal = 1;
        public const int SpeedBump = 2;
        public const int Crossing = 4;
        public const int MainNetwork = 8;
    }

    /// <summary>Converts between WGS84 and the local metric frame used by the game (x = east, z = north).</summary>
    public struct GeoFrame
    {
        public double OriginLat, OriginLon, MPerDegLat, MPerDegLon;

        public GeoFrame(CityIndex idx)
        {
            OriginLat = idx.originLat; OriginLon = idx.originLon;
            MPerDegLat = idx.metersPerDegLat; MPerDegLon = idx.metersPerDegLon;
        }

        public void ToLocal(double lat, double lon, out float x, out float z)
        {
            x = (float)((lon - OriginLon) * MPerDegLon);
            z = (float)((lat - OriginLat) * MPerDegLat);
        }

        public void ToLatLon(float x, float z, out double lat, out double lon)
        {
            lat = OriginLat + z / MPerDegLat;
            lon = OriginLon + x / MPerDegLon;
        }
    }
}
