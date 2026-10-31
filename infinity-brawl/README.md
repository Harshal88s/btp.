# Infinity Brawl

An unofficial Marvel fan fighting game for the browser. Plain HTML, CSS and JavaScript. No build step, no dependencies, no backend. All art is drawn in code on a canvas.

**Fan project.** Marvel characters, names and catchphrases are trademarks of Marvel Entertainment / The Walt Disney Company. This game is not affiliated with or endorsed by them. Keep it free and non-commercial.

## Roster

| Fighter | Side | Special | Super |
| --- | --- | --- | --- |
| Iron Man | Hero | Repulsor Blast (beam) | Unibeam (full-screen chest beam) |
| Captain America | Hero | Shield Throw (boomerang, hits out and back) | Avengers Assemble (allies charge through) |
| Thor | Hero | Lightning Strike (bolt on opponent's position) | God of Thunder (lightning storm) |
| Hulk | Hero | Thunder Clap (shockwave knockdown) | Hulk Smash (leap and meteor landing) |
| Spider-Man | Hero | Web Shot (binds and pulls in) | Swing Kick Barrage (three swings) |
| Black Panther | Hero | Kinetic Dash (claw rush) | Kinetic Release (purple waves) |
| Doctor Strange | Hero | Sling Ring (portal teleport strike) | Time Loop (Eye of Agamotto) |
| Thanos | Villain | Power Stone Blast (heavy orb) | The Snap (half the health bar turns to dust) |
| Loki | Villain | Dagger Fan (three daggers and an illusion) | Glorious Purpose (clone army) |
| Venom | Villain | Symbiote Lash (long-range grab) | Symbiote Storm (tendrils from everywhere) |

Each fighter opens the round with their signature line in a speech bubble. Flyers (Iron Man, Thor, Doctor Strange) can hover-jump; Spider-Man double jumps.

## Settings

On the title screen (or pause and press O): movement sensitivity, CPU difficulty (Easy / Medium / Hard), voice lines (clips, else spoken by the browser speech engine; clips only; off), volume, and full key remapping for both players. Saved in the browser.

## Phones

Turn the phone sideways and tap **Fullscreen**. The arena fills the screen and the touch pad floats on top of it. Tap ✕ to leave.

## Modes

- 1P vs CPU (Easy / Medium / Hard)
- 2P on one keyboard
- Stages: New York Street (rain, neon), Wakanda (dusk, fireflies), Titan (dust storm, embers), Grandmaster's Arena (crowd, spotlights). Dynamic camera, floor reflections, vignette.
- Double-tap left/right to dash
- Best of three rounds, 60 seconds each; combos, blocking, meter, specials, unblockable supers
- Touch pad for phones and tablets

## Controls

| Action | Player 1 | Player 2 |
| --- | --- | --- |
| Move | A / D | ← / → |
| Jump | W | ↑ |
| Block (hold) | S | ↓ |
| Punch | J | , or Num 1 |
| Kick | K | . or Num 2 |
| Special | L | / or Num 3 |
| Super | I | ' or Num 0 |
| Pause | Esc or P | |

## HD assets

All ten characters ship with HD cut-out sprites in `assets/sprites/`. Replace any file of the same name with your own transparent PNG. Stage photos go in `assets/stages/<id>.jpg`. Sound clips go in `assets/sounds/<id>/`. See `assets/README.md`.

## Host it for free

The game is three files: `index.html`, `style.css`, `game.js`. Any static host works.

**GitHub Pages**
1. Create a new public repository and upload the three files to its root.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
3. Live at `https://<username>.github.io/<repo>/` in a minute or two.

**Netlify Drop**: open https://app.netlify.com/drop and drag the folder in. You get a link immediately.

**Vercel / Cloudflare Pages**: import the repo, framework *None*, no build command, output directory `/`.

**Cost.** All three are free for a static site like this. Vercel's Hobby plan costs nothing and includes a `*.vercel.app` URL, HTTPS, custom domains and 100 GB of bandwidth a month, but its terms allow personal, non-commercial use only. GitHub Pages and Cloudflare Pages are free with no commercial restriction. None of them need a credit card.

## Files

- `index.html` – page markup
- `style.css` – styles
- `game.js` – engine, character drawing, specials, supers, CPU, UI
- `body.fragment.html` – page body without the document shell, used for embedding
