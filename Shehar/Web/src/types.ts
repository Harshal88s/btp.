// City data model produced by Tools/osm_pipeline (same files the Unity build uses).
export interface ChunkRef { cx: number; cz: number; file: string; buildings: number }
export interface RoadInfo {
  id: number; name: string; alt: string; type: string; width: number; rank: number; lanes: number;
  oneway: number; speed: number; drivable: number; traffic: number; bridge: number; tunnel: number; layer: number; nodes: number[];
}
export interface Poi { name: string; osmName?: string; kind: string; x: number; z: number }
export interface CityIndex {
  cityId: string; name: string; state: string; attribution: string;
  bboxS: number; bboxW: number; bboxN: number; bboxE: number; originLat: number; originLon: number;
  metersPerDegLat: number; metersPerDegLon: number;
  minX: number; minZ: number; maxX: number; maxZ: number;
  chunkSize: number; chunksX: number; chunksZ: number; chunks: ChunkRef[];
  spawnName: string; spawnX: number; spawnZ: number;
  nodeX: number[]; nodeZ: number[]; nodeFlags: number[];
  edgeA: number[]; edgeB: number[]; edgeRoad: number[]; edgeDir: number[];
  roads: RoadInfo[]; pois: Poi[]; landmarks: Poi[];
}
export interface BuildingData { id: number; kind: string; name: string; h: number; minH: number; levels: number; pts: number[] }
export interface AreaData { id: number; kind: string; name: string; pts: number[] }
export interface RoadPiece { road: number; nodes: number[] }
export interface RailData { id: number; kind: string; name: string; elevated: number; pts: number[] }
export interface WaterLine { id: number; kind: string; name: string; width: number; pts: number[] }
export interface ChunkData { cx: number; cz: number; buildings: BuildingData[]; areas: AreaData[]; roads: RoadPiece[]; rails: RailData[]; trees: number[] }
export interface GlobalData { areas: AreaData[]; waterLines: WaterLine[] }

export const NodeFlags = { TrafficSignal: 1, SpeedBump: 2, Crossing: 4, MainNetwork: 8 } as const;

export function roadDisplayName(r: RoadInfo): string {
  if (r.alt && r.alt.length <= 12) return r.alt;
  return r.name || '';
}
