/*
 * Builds preview/srvp-preview.html: ONE self-contained file of the public
 * website (logo, CSS and JS inlined) that opens with a double-click or can
 * be shared as a link. The enquiry form and the faculty/results lists only
 * talk to the real database when the full site runs with `npm start`.
 *
 * Run:  npm run preview
 */
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const read = (p) => fs.readFileSync(path.join(pub, p), 'utf8');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(pub, 'images/logo.png')).toString('base64');

const html = read('index.html');
const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0];
const body = html.split('<body>')[1].split('<script')[0];

// Stand-in for the server while previewing
const mock = `
window.fetch = async (url, opts) => {
  const ok = (data) => ({ ok: true, json: async () => data });
  if (String(url).includes('enquiry')) return ok({ ok: true });
  if (String(url).includes('announcements')) return ok([{ title: 'Admissions Open — Offline & Online', body: '', link: '' }]);
  return ok([]);
};`;

const out = `<title>SRVP Website Preview</title>
${fonts}
<style>
${read('css/style.css')}
.nav { top: env(safe-area-inset-top, 0px); }
.preview-bar { background: #FFF3BF; color: #5A4300; text-align: center; font: 500 13px/1.4 'Poppins', sans-serif; padding: 8px 16px; }
</style>
<div class="preview-bar">Preview of the SRVP website. Yellow ✏️ boxes show details still to be filled in. The enquiry form and admin panel are live only on the full site.</div>
${body}
<script>${mock}</script>
<script>${read('js/content.js')}
SITE.logo = ${JSON.stringify(logo)};
SITE.admission.successMessage += ' (Preview: nothing was actually sent.)';</script>
<script>${read('js/main.js')}</script>
`;

fs.mkdirSync(path.join(__dirname, '..', 'preview'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'preview', 'srvp-preview.html'), out);
console.log('Wrote preview/srvp-preview.html');
