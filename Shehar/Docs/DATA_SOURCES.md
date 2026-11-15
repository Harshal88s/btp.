# Data sources, licensing and fact/assumption register

Report generated: 14 Nov 2026

## 1. Geographic data

| Source | URL | Date of data | Used for | Licence |
|---|---|---|---|---|
| OpenStreetMap main API (`/api/0.6/map`, 36 tiles of 0.01°) | https://api.openstreetmap.org | Downloaded 14 Nov 2026 | Roads, one-way flags, lanes, speed limits, signals, crossings, speed breakers, buildings, land use, water, rail/metro, POIs, landmarks, neighbourhood names | ODbL 1.0 |
| OSM copyright / attribution guidance | https://www.openstreetmap.org/copyright | Current | Attribution text shown in-game | — |

Not used (no licensed source was available in this environment): satellite imagery, DEM/elevation, 3D building datasets, an official India boundary layer. The city-selection board therefore shows only a graticule and city pins, and **no national boundary**. A future version should use the Survey of India boundary.

## 2. Fact / assumption register

| # | Claim in the game | Tag | Basis |
|---|---|---|---|
| 1 | Road geometry, junctions and street names | **FACT** | OSM ways (`highway=*`, `name`, `alt_name`) |
| 2 | FC Road (Gopal Krishna Gokhale Path) is one-way northbound and JM Road (Jangli Maharaj Path) is one-way southbound | **FACT** (per OSM) | `oneway=yes` on those ways. Pune's on-street regulation may change, and OSM can lag behind. |
| 3 | Traffic signal, zebra crossing and speed breaker locations | **FACT** (per OSM) | `highway=traffic_signals`, `crossing`, `traffic_calming`. OSM coverage is incomplete (only 2 speed breakers are mapped in this extract). |
| 4 | Signal timing (15 s green / 3 s amber, two-phase) | **ASSUMPTION** | Game value. Real Pune signal plans aren't public in OSM. |
| 5 | Building footprints | **FACT** | OSM `building=*` |
| 6 | Building heights | **ASSUMPTION** for 98.6 % of buildings | Only 92 `height` and 192 `building:levels` tags exist among 20,983 buildings. The rest come from the heuristic in `build_city.py`. |
| 7 | Road widths | **ASSUMPTION** unless `lanes` or `width` is tagged (663 ways) | Defaults by road class in `ROAD_TYPES` |
| 8 | Default speed limits (50/40/30 km/h by class) | **ASSUMPTION** unless `maxspeed` is tagged | Game defaults for Indian urban roads |
| 9 | Landmark positions (21) | **FACT** (per OSM) | Name lookup in OSM data. Missing names (e.g. Bund Garden, outside the bbox) are not placed. |
| 10 | Shaniwar Wada projected position | **Cross-checked** | OSM centroid vs a reference lat/lon (18.5195 N, 73.8553 E): 14 m offset (see `Tests/CoreTests`) |
| 11 | City-board pin coordinates (11 cities) | **FACT** (approximate city centres) | Widely published WGS84 coordinates. Pins are illustrative only. |
| 12 | Heritage blurbs (Shaniwar Wada 1732 / 1828 fire, Fergusson College 1885, Dagdusheth temple 1890s, etc.) | **FACT** (general reference) | Widely documented history. Kept short and hedged. |
| 13 | Auto fare = ₹26 for the first 1.5 km + ₹17/km | **ASSUMPTION** | Game value styled on a meter fare. **Not** the official RTA tariff. |
| 14 | Petrol at about ₹105/L | **ASSUMPTION** | Approximate recent Pune retail price, used only as a game price |
| 15 | Fines (₹500–2,000) | **ASSUMPTION** | Game values inspired by, but **not equal to**, Motor Vehicles (Amendment) Act 2019 fines |
| 16 | Traffic mix (two-wheelers and autos dominate) | **ASSUMPTION** | Tuned for gameplay. Not calibrated to RTO registration data. |
| 17 | Vehicle performance figures | **ASSUMPTION** | Typical for each archetype. No manufacturer data is used and the vehicles are unbranded. |
| 18 | Characters (Aarav, dispatcher, examiner) | Fiction | — |

## 3. Conflicts and gaps flagged

- OSM has the metro stations "Savitribai Phule Pune University", "Deccan Gymkhana" and "Mahatma Phule Mandai" with the **same names** as the landmarks. The pipeline prefers the campus, park or market feature over the station. Railway-station landmarks prefer the station.
- 17 buildings tagged `layer≥1` cover drivable roads (mostly elevated metro stations). They are raised to a 7 m clearance so roads stay passable. Their real clearance isn't tagged.
- `Pune Railway Station` and a few campus buildings contain service-road nodes inside their footprints, which is an OSM mapping overlap. They are kept at ground level.

## Terrain (browser build)

| Source | Use | Licence |
|---|---|---|
| AWS Terrain Tiles (`elevation-tiles-prod.s3.amazonaws.com`, Terrarium PNG, zoom 14), mostly SRTM 30 m in India | Height map resampled to a 12.5 m grid with a light Gaussian blur, written to `terrain.bin` (Int16 decimetres above the base elevation) | SRTM is public domain; the tiles are from Mapzen/Tilezen. Attribution is shown in-game. |

## Rathi Maheshwari Hostel (browser build)

| Source | Claim supported |
|---|---|
| [kondhwa.in directory listing](https://www.kondhwa.in) | Coordinates 18.4545933, 73.8759129 and the Kondhwa Budruk address |
| [Justdial listing](https://www.justdial.com) | Same latitude; the hostel is in the Kondhwa / Bibwewadi area, Pune 411048 |
| [ABMECT, contact page](https://abmectpune.in) | The hostel's trust (unreachable from the build machine; quoted from search snippets) |
| [Facebook: rathihostel1](https://www.facebook.com/rathihostel1) and Instagram `rathimaheshwari_hostel` | Name: Seth Shri Gangadhar Bansilal Rathi Maheshwari Hostel |
| OpenStreetMap way 360976845 | Building footprint (689 m², 8 m from the reference point). OSM has no name tag on it, so the match is by proximity and size. |

The 4-storey height and the facade are an approximation. Nothing in the sources gives the real architecture.
