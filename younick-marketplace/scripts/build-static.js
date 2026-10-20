/**
 * Builds a self-contained static site in dist/ (GitHub Pages, Netlify, any static host, or the Claude artifact preview):
 *   dist/index.html, dist/artifact.html, dist/assets/, dist/sitemap.xml, dist/robots.txt
 * The catalogue is read from the Excel workbook (or downloaded from YOUNICK_SHEET_URL) at build time and embedded as JSON.
 */
const fs = require("fs");
const path = require("path");
const { loadCatalog } = require("../lib/catalog");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");
const WORKBOOK = process.env.YOUNICK_WORKBOOK || path.join(ROOT, "data", "younick-catalog.xlsx");
const SHEET_URL = process.env.YOUNICK_SHEET_URL || "";

(async () => {
  let workbook = WORKBOOK;
  if (SHEET_URL) {
    const res = await fetch(SHEET_URL, { redirect: "follow", headers: { "User-Agent": "younick-gifts-site" } });
    if (!res.ok) throw new Error(`Could not download the Google Sheet: HTTP ${res.status}`);
    workbook = path.join(ROOT, "data", "younick-catalog.remote.xlsx");
    fs.mkdirSync(path.dirname(workbook), { recursive: true });
    fs.writeFileSync(workbook, Buffer.from(await res.arrayBuffer()));
    console.log("Downloaded catalogue from Google Sheet");
  }
  const catalog = { ...loadCatalog(workbook, { version: Date.now(), publicDir: PUB }), mode: "static", source: SHEET_URL ? "google-sheet" : "excel-file" };
  if (catalog.issues.length) console.warn(`Workbook issues:\n  - ${catalog.issues.join("\n  - ")}`);
  const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(PUB, "css", "style.css"), "utf8");
  const js = fs.readFileSync(path.join(PUB, "js", "app.js"), "utf8");
  const json = JSON.stringify(catalog).replace(/<\/script/gi, "<\\/script");

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.cpSync(path.join(PUB, "assets"), path.join(DIST, "assets"), { recursive: true, filter: (src) => !src.endsWith("_manifest.json") });

  const dataTag = `<script id="catalog-data" type="application/json">${json}</script>`;
  const full = html
    .replace('<link rel="stylesheet" href="css/style.css">', `<style>\n${css}\n</style>`)
    .replace('<script src="js/app.js"></script>', `${dataTag}\n<script>\n${js}\n</script>`);
  fs.writeFileSync(path.join(DIST, "index.html"), full);

  const body = html.slice(html.indexOf("<!-- YN:BODY:START -->"), html.indexOf("<!-- YN:BODY:END -->"));
  const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
  const artifact = `<title>Younick Gifts</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${css}\n</style>\n${body}\n${dataTag}\n<script>\n${js}\n</script>\n`;
  fs.writeFileSync(path.join(DIST, "artifact.html"), artifact);

  const base = (catalog.settings.site_url || "").replace(/\/+$/, "");
  const urls = [`${base}/`, ...catalog.products.map((p) => `${base}/#${p.id}`)];
  fs.writeFileSync(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
  fs.writeFileSync(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  fs.writeFileSync(path.join(DIST, ".nojekyll"), "");

  const size = (f) => (fs.statSync(f).size / 1024).toFixed(0) + " KB";
  console.log(`Built dist/index.html (${size(path.join(DIST, "index.html"))}) and dist/artifact.html with ${catalog.products.length} products, season "${catalog.season && catalog.season.name}", ${catalog.setup.length} setup item(s) pending.`);
})().catch((e) => { console.error(e); process.exit(1); });
