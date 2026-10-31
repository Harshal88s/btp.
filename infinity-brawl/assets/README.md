# Infinity Brawl assets

Drop your own HD images and sound clips here. Nothing else needs to change: the game looks for these exact paths and falls back to the built-in drawn characters and synth sounds when a file is missing.

## Character images → `assets/sprites/`

One PNG per fighter, **transparent background, full body, facing right**. Portrait-shaped images (taller than wide) look best. 600–1200 px tall is plenty.

| File | Fighter |
| --- | --- |
| `ironman.png` | Iron Man |
| `cap.png` | Captain America |
| `thor.png` | Thor |
| `hulk.png` | Hulk |
| `spiderman.png` | Spider-Man |
| `panther.png` | Black Panther |
| `strange.png` | Doctor Strange |
| `thanos.png` | Thanos |
| `loki.png` | Loki |
| `venom.png` | Venom |

The image is used as the in-fight sprite (animated with lunges, tilts, flashes and glows), the select-screen portrait, and the roster card. The top square of the image is used for portraits, so keep the head in the upper part.

## Stage photos → `assets/stages/`

Optional wide images (`newyork.jpg`, `wakanda.jpg`, `titan.jpg`, `arena.jpg`, PNG also works). The photo replaces the drawn background; the floor, reflections, camera and colour grade stay. Use something at least 1600 px wide with the horizon near the bottom third.

## Sounds → `assets/sounds/<id>/`

Per character, in a folder named by the id above (for example `assets/sounds/venom/`):

| File | When it plays |
| --- | --- |
| `intro.mp3` | Round start, with the speech bubble |
| `special.mp3` | Special move |
| `super.mp3` | Super move |
| `hit.mp3` | Taking a heavy hit (grunt) |
| `win.mp3` | Winning the match |

Add numbered variants for variety: `hit2.mp3`, `hit3.mp3`, `special2.mp3`. One is chosen at random each time. `.mp3`, `.ogg`, `.wav` and `.m4a` all work.

Global effects (optional) go directly in `assets/sounds/`: `punch`, `kick`, `hit`, `block`, `ko`, `round`.

## Optional manifest

If you host on a server where 404 lookups are noisy, list your files in `assets/manifest.json` and the game will load only those:

```json
{
  "sounds": {
    "venom": { "intro": ["intro.mp3"], "hit": ["hit.mp3", "hit2.mp3"] },
    "global": { "punch": ["punch.mp3"] }
  }
}
```

## Legal note

Film stills, renders and audio clips are copyrighted by their owners. Using them for a private game between friends is one thing; putting them on a public website is another. The drawn characters and synth sounds that ship with the game are original.
