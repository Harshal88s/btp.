# Shehar – browser version (desktop + mobile)

The browser version of the Pune prototype: **Vite + Three.js + TypeScript**. It reads the same OpenStreetMap city data as the Unity project, copied into `public/cities/pune`.

- **No lag from one giant file.** The city streams in 250 m chunks, and all 3D geometry is built on a **Web Worker**, so the screen never freezes. Draw calls are merged per material.
- **Real Pune terrain.** Elevation comes from SRTM (AWS Terrain Tiles) on a 12.5 m grid. Roads, buildings, cars and people follow the ground, so Taljai, Parvati and the Bibwewadi slopes are real hills. The play area is 7.4 × 12.4 km, from Shivajinagar and Deccan south to Katraj ghat, with 60,139 OSM buildings.
- **City dressing.** Textured asphalt, lane and zebra markings, black-and-yellow kerbs, footpaths, streetlights, signals, speed-limit signs and street-name boards at junctions. Buildings get facade textures (apartments, glass, old city and hostel). Shopfronts with English and Marathi signboards appear only on sides that face busy roads. Water tanks and parapets sit on the roofs. The ground is coloured by land use (parks, forest, water), and trees follow OSM.
- **Rathi Maheshwari Hostel, Bibwewadi–Kondhwa.** The building's location is verified (see *Hostel location* below). It carries a big **RATHI MAHESHWARI HOSTEL** rooftop sign, a facade banner and a gold beacon with a label. It also appears as a star on the minimap and the full map, with *Navigate* and *Fast travel* buttons.
- **On foot.** An articulated character with walk/jog/sprint blending, acceleration and deceleration, smooth turning, lean, jump with a wind-up and landing squash, and building collision.
- **Camera.** A third-person orbit camera that rotates independently of the character: mouse, touch drag, gamepad or the phone gyroscope. It damps smoothly, returns behind you a moment after you stop looking, and has a spring arm that doesn't clip through walls. First-person view is on C / CAM.
- **Vehicles.** 11 types. Enter and exit are animated (walk to the door, door opens, sit, door closes). Driving has acceleration, braking, reverse, a handbrake drift, slope gravity, body pitch and roll on terrain, collisions, and a chase camera.
- **Helicopter cheat.** Type **HELIPUNE** while in a car and it transforms (1.6 s) into a helicopter: rotors spin up, then you take off, climb, descend, fly forward and back, yaw and bank, and land on the ground or a rooftop. It has its own camera. Land and type **CARMODE** to turn back into the car.
- **Interactive tutorial** on first launch: 14 steps, one control at a time. It highlights the real on-screen button on phones, ticks each step when you actually do it, and has Next / Back / Skip. Replay it from **?** or Settings.
- **Settings** (saved in the browser): camera, movement and steering sensitivity, follow distance, camera return speed, gyroscope on/off and sensitivity, invert Y, graphics quality, volume.
- **Free roam, no police.** There are no police, wanted levels or chases. Missions are optional.
- Day and night (with a moonlight pass), monsoon rain, a GPS with turn-by-turn and real street names, a minimap, and a full map with hillshade that you can pan, zoom and click to route.

## Run locally

> Opening `index.html` by double-clicking won't work. Browsers block a `file://` page from loading the city data. Always use a local server:

```bash
cd Shehar/Web
```

```bash
npm install
```

```bash
npm run dev
```

Then open the URL it prints (http://localhost:5173). The dev server also listens on your Wi-Fi address (`--host`), so you can open `http://<your-PC-IP>:5173` on your phone on the same network.

Production build and preview:

```bash
npm run build
```

```bash
npm run preview
```

## Deploy on Vercel

1. Push this repository to GitHub (already done on branch `claude/gallant-wright-l5njy5`).
2. On vercel.com: **Add New → Project → Import** the repository and pick that branch, or merge it to your main branch first.
3. Leave **Root Directory** blank or set it to `Shehar/Web`: both work through `vercel.json`.
4. Click **Deploy**. The site is fully static (about 200 KB of gzipped code plus about 21 MB of city data, served compressed and loaded chunk by chunk).

Or from a terminal, with the Vercel CLI logged in:

```bash
cd Shehar/Web
```

```bash
npx vercel --prod
```

## Controls

| Desktop | Phone | On foot | In a car | In the helicopter |
|---|---|---|---|---|
| W A S D / arrows | left-thumb joystick | walk (push further = run) | accelerate / brake-reverse / steer | fly forward-back / turn |
| Shift | SPRINT / BOOST | sprint | boost | descend |
| Space | JUMP / BRAKE | jump | handbrake | climb |
| E | E | get into the nearest vehicle | get out | get out (after landing) |
| mouse drag | right-side drag / gyroscope | look around | look around | look around |
| C | CAM | first / third person | same | same |
| M | MAP | map | map | map |
| ` or T | Cheats | cheat box | cheat box | cheat box |
| F | F | interact (missions, food, fuel) | same | – |
| H, R, Esc, Tab | HORN, RESET, ☰ | horn, reset, pause, missions | | |

**Cheats:** `HELIPUNE` (car → helicopter), `CARMODE` (back to the car, after landing), `MONSOON` (rain on/off), `NIGHTRIDER`, `SUNRISE`, `FULLTANK`, `RICKSHAW`.

Gamepads work too: left stick moves, right stick looks, RT/LT accelerate and brake, A handbrake, Y enter/exit.

## Hostel location

*Seth Shri Gangadhar Bansilal Rathi Maheshwari Hostel* (run by ABMECT), Sai Nagar / Shatrunjay Nagar, Kondhwa Budruk (Bibwewadi side), Pune 411048. The reference coordinate 18.4545933 N, 73.8759129 E comes from the kondhwa.in business directory, and the Justdial listing gives the same latitude. OSM has no named feature for the hostel, so the game uses the nearest large building footprint (OSM way 360976845, 689 m², 8 m from the reference point). Its height (4 storeys) and its look are an approximation: they are not surveyed.

## Updating the city data

The web build has its own Pune data (with terrain and the hostel), generated straight into `public/cities/pune`:

```bash
cd Shehar/Tools/osm_pipeline
```

```bash
python3 fetch_dem.py pune
```

```bash
python3 build_city.py pune --out ../../Web/public/cities/pune
```

`fetch_dem.py` downloads the SRTM elevation tiles. `build_city.py` needs the OSM tiles in `raw/pune` (see the main README). `npm run sync-data`, which copies the Unity StreamingAssets, now refuses to overwrite this data unless you pass `--force`.

Map data © OpenStreetMap contributors, ODbL 1.0. Elevation: SRTM via AWS Terrain Tiles (Mapzen / Tilezen), public domain.
