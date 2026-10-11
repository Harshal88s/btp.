/*
 * Builds preview/srvp-preview.html: ONE self-contained file of the public
 * website (logo, CSS and JS inlined) that opens with a double-click or can
 * be shared as a link. The enquiry form and the faculty/results lists only
 * talk to the real database when the full site runs with `npm start`.
 *
 * Run:  npm run preview
 * Optional: FEEDBACK_WHATSAPP=919800000000 npm run preview
 *   sends "Suggest a change" messages straight to that number
 *   (otherwise WhatsApp asks which chat to send it to).
 */
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const read = (p) => fs.readFileSync(path.join(pub, p), 'utf8');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(pub, 'images/logo-sm.png')).toString('base64');

const html = read('index.html');
const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0];
const body = html.split('<body>')[1].split('<script')[0];

// The starter book list (the real site serves it from the database)
const keep = ['title', 'author', 'category', 'classes', 'language', 'format', 'copies_total', 'copies_available', 'link', 'source'];
const books = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'books.json'), 'utf8'))
  .filter((b) => b.show_on_site)
  .map((b) => Object.fromEntries(keep.map((k) => [k, b[k]])))
  .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

// Stand-in for the server while previewing
const mock = `
const PREVIEW_BOOKS = ${JSON.stringify(books)};
window.fetch = async (url, opts) => {
  const ok = (data) => ({ ok: true, json: async () => data });
  if (String(url).includes('enquiry')) return ok({ ok: true });
  if (String(url).includes('books')) return ok(PREVIEW_BOOKS);
  if (String(url).includes('announcements')) return ok([{ title: 'Admissions Open — Offline & Online', body: '', link: '' }]);
  return ok([]);
};`;

const out = `<title>SRVP Website Preview</title>
${fonts}
<style>
${read('css/style.css')}
.nav { top: env(safe-area-inset-top, 0px); }
.preview-bar { background: #FFF3BF; color: #5A4300; text-align: center; font: 500 13px/1.4 'Poppins', sans-serif; padding: 8px 16px; }
.fb-btn { position: fixed; left: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 70; background: var(--navy); color: #fff; border: 0; border-radius: 999px; padding: 12px 18px; font: 600 14px var(--font); box-shadow: 0 8px 24px rgba(0,0,0,.25); cursor: pointer; }
.fb-panel { position: fixed; left: 16px; right: 16px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); z-index: 70; max-width: 380px; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 18px; box-shadow: 0 16px 48px rgba(0,0,0,.25); }
.fb-panel h3 { margin: 0 0 4px; color: var(--navy); }
.fb-panel p { font-size: .85rem; color: var(--muted); margin: 0 0 12px; }
.fb-panel label { display: block; font-size: .85rem; font-weight: 500; margin-bottom: 10px; }
.fb-panel select, .fb-panel textarea { display: block; width: 100%; margin-top: 4px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; font: inherit; }
.fb-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.fb-actions .btn { background: #1F9D55; }
.fb-actions .btn.ghost { background: transparent; color: var(--navy); border: 2px solid var(--navy); }
@media (max-width: 720px) { .fb-btn { bottom: calc(76px + env(safe-area-inset-bottom, 0px)); padding: 10px 14px; font-size: 13px; } .fb-panel { bottom: calc(130px + env(safe-area-inset-bottom, 0px)); max-height: 60vh; overflow-y: auto; } }
.fb-btn:focus-visible, .fb-panel :focus-visible { outline: 3px solid var(--saffron); outline-offset: 2px; }
</style>
<div class="preview-bar">Draft website for review. Yellow ✏️ boxes are details still to be filled in. Tap “Suggest a change” to send feedback.</div>
${body}
<button class="fb-btn" id="fb-open" aria-expanded="false" aria-controls="fb-panel">✍️ Suggest a change</button>
<div class="fb-panel" id="fb-panel" hidden>
  <h3>Suggest a change</h3>
  <p>Write what to add, remove or reword. It opens WhatsApp so you can send it.</p>
  <label for="fb-section">Which part?<select id="fb-section">
    <option>Whole website</option><option>Top banner &amp; demo form</option><option>Numbers band</option><option>Choose your goal (exams)</option>
    <option>Courses &amp; fees</option><option>Offline / Online</option><option>Results</option><option>Why SRVP</option><option>How we teach</option>
    <option>Faculty</option><option>About / Founder / Values</option><option>Library &amp; book list</option><option>Animations</option><option>Testimonials</option><option>Gallery</option>
    <option>FAQ</option><option>Admission form &amp; contact</option><option>Colours / design</option></select></label>
  <label for="fb-text">Your suggestion<textarea id="fb-text" rows="4" placeholder="e.g. Add Navodaya to the exam list; phone number is 98…"></textarea></label>
  <div class="fb-actions">
    <a class="btn" id="fb-send" href="https://wa.me/" target="_blank" rel="noopener">Send on WhatsApp</a>
    <button type="button" class="btn ghost" id="fb-copy">Copy text</button>
  </div>
  <p id="fb-msg" role="status" style="margin:10px 0 0"></p>
</div>
<script>
(function () {
  const open = document.getElementById('fb-open'), panel = document.getElementById('fb-panel');
  const sec = document.getElementById('fb-section'), txt = document.getElementById('fb-text');
  const send = document.getElementById('fb-send'), msg = document.getElementById('fb-msg');
  const message = () => 'SRVP website feedback\\nSection: ' + sec.value + '\\n' + txt.value.trim();
  const update = () => { send.href = ${JSON.stringify('https://wa.me/' + (process.env.FEEDBACK_WHATSAPP || ''))} + '?text=' + encodeURIComponent(message()); };
  open.addEventListener('click', () => { panel.hidden = !panel.hidden; open.setAttribute('aria-expanded', !panel.hidden); if (!panel.hidden) txt.focus(); });
  sec.addEventListener('change', update); txt.addEventListener('input', update); update();
  document.getElementById('fb-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(message()).then(() => { msg.textContent = 'Copied. Paste it into WhatsApp or SMS.'; })
      .catch(() => { txt.select(); msg.textContent = 'Press Ctrl+C (or long-press → Copy) to copy.'; });
  });
})();
</script>
<script>${mock}</script>
<script>${read('js/content.js')}
SITE.logo = ${JSON.stringify(logo)};
SITE.admission.successMessage += ' (Draft website: please also tap the WhatsApp button so SRVP receives it.)';
SITE.demoForm.successMessage += ' (Draft website: please also tap the WhatsApp button so SRVP receives it.)';</script>
<script>${read('js/main.js')}</script>
`;

fs.mkdirSync(path.join(__dirname, '..', 'preview'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'preview', 'srvp-preview.html'), out);
console.log('Wrote preview/srvp-preview.html');
