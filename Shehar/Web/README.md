# Shehar – browser version (desktop + mobile)

The browser version of the Pune prototype: **Vite + Three.js + TypeScript**. It reads the same OpenStreetMap city data as the Unity project, copied into `public/cities/pune`.

- **No lag from one giant file.** The city streams in 250 m chunks (~10 KB each), and their 3D geometry is built on a **Web Worker** so the screen never freezes. About 4 draw calls per chunk.
- **Mobile.** On-screen joystick (left thumb), BRAKE / BOOST / HORN / E / F buttons, drag-to-look, fullscreen, landscape prompt. *Auto* graphics picks a light profile on phones (pixel ratio 1, 360 m view distance, fewer cars, no shadows).
- **Gameplay.** Real Pune roads, buildings, river, metro. Arcade driving with 11 vehicle types, taking cars from traffic (E), AI traffic that keeps left and stops at the real signals, pedestrians, a GPS with turn-by-turn and real street names, a minimap and a full map (tap a street to route), 5 missions (Welcome to Pune, Peshwa Heritage Trail, FC Road–JM Road Sprint, Rickshaw Fares, Hot Food Express), day/night, petrol pumps, money.

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
3. Set **Root Directory** to `Shehar/Web`. Vercel detects **Vite**, and `vercel.json` sets `npm run build` with output `dist`.
4. Click **Deploy**. The site is fully static (≈150 KB of gzipped code plus 8 MB of city data, which Vercel serves compressed).

Or from a terminal, with the Vercel CLI logged in:

```bash
cd Shehar/Web
```

```bash
npx vercel --prod
```

## Controls

| Desktop | Phone | Action |
|---|---|---|
| W / S | joystick up / down | accelerate / brake & reverse |
| A / D | joystick left / right | steer |
| Space | BRAKE | handbrake (drift) |
| Shift | BOOST | boost / sprint |
| E | E | get in / out (any vehicle, including traffic) |
| F | F | interact: start mission, refuel, buy street food |
| H | HORN | horn |
| C | CAM | third / first person |
| M | MAP | city map: tap a street or landmark to set GPS |
| Tab | ☰ → Missions | missions list |
| R | RESET | put the vehicle back on the road |
| Esc | ☰ | pause |
| mouse drag | drag right side | look around |

Gamepads work too: left stick, RT/LT to accelerate and brake, A handbrake, Y enter/exit.

## Updating the city data

The data comes from `Tools/osm_pipeline` (see the main README). After regenerating it:

```bash
npm run sync-data
```

That copies `UnityProject/Assets/StreamingAssets/Cities` into `public/cities`.

Map data © OpenStreetMap contributors, ODbL 1.0.
