# Infinity Brawl

Free browser fighting game. Static site: `index.html`, `style.css`, `game.js`, `assets/`.

## Deploy to Vercel

1. Push this folder to a GitHub repository (it can be the repo root or this subfolder).
2. On vercel.com, **Add New → Project**, import the repository.
3. If the game is in a subfolder, set **Root Directory** to `infinity-brawl`. Framework preset: **Other**. Leave build command and output directory empty.
4. Deploy. The site is live at `https://<project>.vercel.app`. Add a custom domain under Settings → Domains if you want one.

`vercel.json` sets clean URLs and caching for assets. `.vercelignore` keeps this README and the artifact fragment out of the deployment.

## Optional audio clips

Drop files in `assets/sounds/<id>/` named `intro`, `special`, `super`, `hit`, `win` (`.mp3`, `.ogg`, `.wav`, `.m4a`); numbered variants like `hit2.mp3` are picked at random. Fighter ids: ironman, cap, thor, hulk, spiderman, panther, strange, thanos, loki, venom. Stage photos go in `assets/stages/<id>.jpg` (newyork, wakanda, titan, arena).

## Note

Characters are trademarks of Marvel Entertainment / The Walt Disney Company. This is an unofficial fan game: keep it free, with no ads or sales.
