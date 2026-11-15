// Copies the OSM-derived city data produced by Tools/osm_pipeline (shared with the Unity project)
// into public/cities so the web build is self-contained (Vercel deploys only this folder's output).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'UnityProject', 'Assets', 'StreamingAssets', 'Cities');
const dst = join(here, '..', 'public', 'cities');
// The web build now has its own richer Pune data (terrain + hostel), generated with
// `build_city.py pune --out ../../Web/public/cities/pune`. Refuse to overwrite it unless --force.
if (existsSync(join(dst, 'pune', 'terrain.bin')) && !process.argv.includes('--force')) {
  console.log('public/cities has web-specific data (terrain.bin); not overwriting. Use --force to replace it with the Unity data.');
  process.exit(0);
}
if (!existsSync(src)) { console.log('No source data at', src, '- keeping existing public/cities'); process.exit(0); }
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith('.meta') });
console.log('Copied city data to', dst);
