// Screenshots the preview views with headless Chromium. Usage: node render.js <outdir>
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = __dirname, outDir = process.argv[2] || path.join(root, 'out');
const threeJs = process.env.THREE_JS || path.join(root, 'three.min.js');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = p === '/three.min.js' ? threeJs : path.join(root, p === '/' ? 'viewer.html' : p);
  fs.readFile(f, (e, data) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200); res.end(data); } });
}).listen(8765, async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  for (let v = 0; v < 4; v++) {
    await page.goto('http://localhost:8765/viewer.html?view=' + v);
    await page.waitForFunction(() => document.title === 'ready', null, { timeout: 180000 });
    await page.screenshot({ path: path.join(outDir, 'preview_view' + v + '.png') });
    console.log('view', v, 'done');
  }
  await browser.close(); server.close();
});
