/**
 * Builds a self-contained static preview in dist/:
 *   dist/index.html    – open directly in a browser or host on any static server (GitHub Pages, Netlify)
 *   dist/artifact.html – same page without the document skeleton, for the Claude artifact preview
 *   dist/assets/       – product cut-outs, campaign banners, logo, QR
 * The catalogue is read from the Excel workbook at build time and embedded as JSON.
 */
const fs = require("fs");
const path = require("path");
const { loadCatalog } = require("../lib/catalog");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");
const WORKBOOK = process.env.YOUNICK_WORKBOOK || path.join(ROOT, "data", "younick-catalog.xlsx");

const catalog = { ...loadCatalog(WORKBOOK, { version: Date.now() }), mode: "static" };
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

// Artifact variant: no doctype/html/head/body; title + meta + style at the top, body content, then scripts.
const body = html.slice(html.indexOf("<!-- YN:BODY:START -->"), html.indexOf("<!-- YN:BODY:END -->"));
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
const artifact = `<title>Younick Gifts</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${css}\n</style>\n${body}\n${dataTag}\n<script>\n${js}\n</script>\n`;
fs.writeFileSync(path.join(DIST, "artifact.html"), artifact);

const size = (f) => (fs.statSync(f).size / 1024).toFixed(0) + " KB";
console.log(`Built dist/index.html (${size(path.join(DIST, "index.html"))}) and dist/artifact.html with ${catalog.products.length} products, season "${catalog.season && catalog.season.name}".`);
