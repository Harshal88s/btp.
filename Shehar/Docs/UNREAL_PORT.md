# Unreal Engine 5 port plan (Phase 2 track)

As agreed, the game was built **first in Unity**. This document covers how the Unreal Engine version reuses that work. **Nothing has been built in Unreal yet.**

## What carries over unchanged

| Asset | Why it ports |
|---|---|
| `Tools/osm_pipeline/*` and `StreamingAssets/Cities/<id>/*.json` | Plain JSON (index + graph + chunks) with no engine dependency |
| `Scripts/Core/*` (road graph, A*, triangulation, data model) | Pure C# with no UnityEngine dependency. It can be ported line-for-line to C++ or kept as a reference implementation, and `Tests/CoreTests` serve as the spec. |
| Geometry rules in `ChunkBuilder` / `MeshBuilder` | Ribbon, extrusion and junction trimming are engine-neutral maths |
| Mission scripts, vehicle specs, traffic rules | Data and logic that map directly onto UE gameplay classes |

## Proposed UE5 architecture

| Unity (current) | Unreal 5 equivalent |
|---|---|
| `CityWorld` chunk streaming on worker threads | **World Partition** cells, or a custom `UWorldSubsystem` that streams JSON chunks with `AsyncTask` + **`UDynamicMeshComponent` / `UProceduralMeshComponent`** |
| `ChunkBuilder` meshes | Same, plus **PCG** graphs for trees, lamps and props, **Nanite** static meshes for authored landmarks, and HLODs for far chunks |
| Raycast `VehicleController` | **Chaos Vehicles** (`UChaosWheeledVehicleMovementComponent`) with per-archetype data assets, and a custom 3-wheel setup for the auto-rickshaw |
| Kinematic `TrafficCar` | **Mass Entity + MassTraffic** (City Sample pattern) for dense Indian traffic, using the OSM graph as `ZoneGraph` lanes |
| IMGUI HUD/menus | **UMG / CommonUI** |
| `DayNightCycle` / `WeatherSystem` | Sky Atmosphere + Volumetric Clouds + Exponential Height Fog, with Niagara rain |
| Terrain (missing in Unity) | Landscape from a DEM (SRTM/Cartosat). Road ribbons are draped with spline meshes. |
| Audio synth | MetaSounds (procedural engines and horns) |

## Suggested order

1. A C++ `FCityData` loader for `index.json` and chunk JSON, plus a port of `RoadGraph` with the CoreTests ported as automation tests.
2. A chunk mesh builder in UE (`UDynamicMeshComponent`), verified against the same Deccan Gymkhana viewpoints as `Docs/images/`.
3. Chaos vehicle archetypes (hatchback, auto-rickshaw, scooter), then third- and first-person cameras.
4. MassTraffic on the OSM graph, keeping left, with signals and one-ways.
5. GPS, HUD and the three story missions, then parity review against the Unity build.

A UE5 project can't be compiled or run in this cloud environment (no Unreal Editor). Plan for the port to be built and tested on a Windows PC with UE 5.4 or later.
