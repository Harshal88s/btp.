/*
 * Builds the page from content.js (SITE) and the public API.
 * You normally don't need to edit this file — change content.js instead.
 */
(function () {
  const PLACEHOLDER = /\[ADD:[^\]]*\]/g;
  const $ = (sel) => document.querySelector(sel);
  const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), SITE);
  const isBlank = (s) => !s || (String(s).replace(PLACEHOLDER, '').trim() === '' && !SHOW_PLACEHOLDERS);

  // Put text into an element; [ADD: ...] parts become yellow hint boxes.
  function fill(el, str) {
    el.textContent = '';
    const s = str == null ? '' : String(str);
    let last = 0;
    for (const m of s.matchAll(PLACEHOLDER)) {
      el.append(s.slice(last, m.index));
      if (SHOW_PLACEHOLDERS) {
        const span = document.createElement('span');
        span.className = 'todo';
        span.title = 'Placeholder — edit public/js/content.js';
        span.textContent = '✏️ ' + m[0].slice(1, -1);
        el.append(span);
      }
      last = m.index + m[0].length;
    }
    el.append(s.slice(last));
    return el;
  }

  // Tiny element builder: h('div', {class: 'x'}, 'text', childEl)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      if (typeof kid === 'string' || typeof kid === 'number') {
        const span = fill(document.createElement('span'), kid);
        el.append(...span.childNodes);
      } else el.append(kid);
    }
    return el;
  }
  const todo = (text) => (SHOW_PLACEHOLDERS ? h('p', { class: 'todo-block' }, `[ADD: ${text}]`) : null);
  const safeUrl = (u) => (u && /^(https?:\/\/|\/|images\/|[\w-]+\.html)/i.test(u) ? u : null);
  const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const avatar = (src, name) => (safeUrl(src) ? h('img', { class: 'avatar', src, alt: name, loading: 'lazy' }) : h('div', { class: 'avatar ph' }, initials(name)));

  // ---------- simple bindings in index.html ----------
  document.querySelectorAll('[data-text]').forEach((el) => fill(el, get(el.dataset.text)));
  document.querySelectorAll('[data-src]').forEach((el) => (el.src = get(el.dataset.src)));
  document.title = `${SITE.name} — ${SITE.fullName}`;
  $('#year').textContent = new Date().getFullYear();

  // ---------- stats ----------
  $('#stats').append(...SITE.stats.map((s) => h('div', { class: 'stat' }, h('b', {}, s.value), h('span', {}, s.label))));

  // ---------- about + founder ----------
  $('#about-text').append(...SITE.about.paragraphs.filter((p) => !isBlank(p)).map((p) => h('p', {}, p)));
  if (SITE.established) $('#about-text').append(h('p', { class: 'muted' }, 'Established: ', SITE.established));
  const f = SITE.about.founder;
  $('#founder').append(
    avatar(f.photo, f.name.replace(PLACEHOLDER, 'SRVP')),
    h('h3', {}, f.name), h('p', { class: 'muted' }, f.role), h('p', { class: 'small' }, f.qualification),
    h('blockquote', {}, `“${f.message}”`),
    isBlank(f.philosophy) ? null : h('p', { class: 'philosophy' }, f.philosophy)
  );

  // ---------- highlights, approach ----------
  $('#highlights').append(...SITE.highlights.map((x) => h('div', { class: 'card feature' }, h('div', { class: 'icon' }, x.icon), h('h3', {}, x.title), h('p', {}, x.text))));
  $('#steps').append(...SITE.approach.steps.map((s) => h('li', {}, h('h3', {}, s.title), h('p', {}, s.text))));

  // ---------- courses & exams ----------
  $('#courses-list').append(...SITE.courses.map((c) =>
    h('div', { class: 'card course' },
      h('h3', {}, c.name),
      h('p', { class: 'muted' }, 'For: ', c.forWhom),
      h('p', {}, c.description),
      h('ul', { class: 'checks' }, c.points.map((p) => h('li', {}, p))),
      h('div', { class: 'course-meta' }, h('span', {}, '📍 ', c.mode), h('span', {}, '₹ Fees: ', c.fees)),
      h('a', { href: '#admission', class: 'btn btn-sm' }, 'Enquire')
    )));
  $('#exams').append(...SITE.exams.filter((e) => !isBlank(e)).map((e) => h('span', { class: 'tag' }, e)));

  // ---------- library ----------
  $('#library-facts').append(...SITE.library.facts.map((s) => h('div', {}, h('b', {}, s.value), h('span', {}, s.label))));
  $('#library-photo').append(safeUrl(SITE.library.photo)
    ? h('img', { src: SITE.library.photo, alt: 'SRVP library', class: 'photo', loading: 'lazy' })
    : h('div', { class: 'photo ph' }, todo('Library photo — put it in public/images/ and set library.photo in content.js') || '📚'));

  // ---------- online ----------
  $('#online-points').append(...SITE.online.points.filter((p) => !isBlank(p)).map((p) => h('li', {}, p)));

  // ---------- testimonials ----------
  $('#testimonials').append(...SITE.testimonials.filter((t) => !isBlank(t.quote)).map((t) =>
    h('figure', { class: 'card quote' }, h('blockquote', {}, `“${t.quote}”`), h('figcaption', {}, h('b', {}, t.name), ' — ', t.role))));

  // ---------- gallery ----------
  const gal = $('#gallery');
  if (SITE.gallery.length) {
    gal.append(...SITE.gallery.map((g) => h('figure', { class: 'gal' }, h('img', { src: g.src, alt: g.caption || '', loading: 'lazy' }), g.caption ? h('figcaption', {}, g.caption) : null)));
  } else if (SHOW_PLACEHOLDERS) {
    gal.append(...SITE.galleryWishlist.map((w) => h('div', { class: 'gal ph' }, h('span', { class: 'todo' }, '✏️ ADD photo: ' + w))));
  } else gal.closest('section').hidden = true;

  // ---------- admission form ----------
  $('#course-options').append(...SITE.admission.courseOptions.map((o) => h('option', {}, o)));
  const form = $('#enquiry-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#form-msg');
    const data = Object.fromEntries(new FormData(form));
    if (!data.student_name.trim() || !/^[+\d][\d\s-]{6,15}$/.test(data.phone.trim())) {
      msg.className = 'form-msg err';
      msg.textContent = 'Please enter the student name and a valid phone number.';
      return;
    }
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const r = await fetch('api/public/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Something went wrong');
      msg.className = 'form-msg ok';
      msg.textContent = SITE.admission.successMessage;
      form.reset();
    } catch (err) {
      msg.className = 'form-msg err';
      msg.textContent = err.message === 'Failed to fetch' ? 'Could not send. Please call us directly.' : err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- contact, map, social, whatsapp ----------
  const c = SITE.contact;
  const tel = c.phone.replace(PLACEHOLDER, '').replace(/[^\d+]/g, '');
  $('#contact').append(
    h('p', {}, '📞 ', tel ? h('a', { href: 'tel:' + tel }, c.phone) : c.phone),
    h('p', {}, '✉️ ', c.email),
    h('p', {}, '📍 ', c.address),
    h('p', {}, '🕘 ', c.timings)
  );
  if (safeUrl(c.mapEmbedUrl)) {
    $('#map').append(h('iframe', { class: 'map', src: c.mapEmbedUrl, loading: 'lazy', title: 'Map to SRVP', referrerpolicy: 'no-referrer-when-downgrade' }));
  } else $('#map').append(todo('Google Maps embed link — see contact.mapEmbedUrl in content.js') || '');
  const social = Object.entries(SITE.social).filter(([, url]) => safeUrl(url));
  $('#social').append(...social.map(([k, url]) => h('a', { href: url, target: '_blank', rel: 'noopener' }, k[0].toUpperCase() + k.slice(1))));
  if (/^\d{10,15}$/.test(c.whatsapp)) {
    const wa = $('#whatsapp');
    wa.href = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent('Hello SRVP, I would like to know about admissions.')}`;
    wa.target = '_blank';
    wa.rel = 'noopener';
    wa.hidden = false;
  }

  // ---------- mobile menu ----------
  const menuBtn = $('.menu-btn');
  menuBtn.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    menuBtn.setAttribute('aria-expanded', open);
  });
  document.querySelectorAll('.links a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('menu-open')));

  // ---------- data from the Admin Panel ----------
  const api = (name) => fetch('api/public/' + name).then((r) => (r.ok ? r.json() : [])).catch(() => []);

  api('announcements').then((rows) => {
    if (!rows.length) return;
    const bar = $('#notices');
    bar.append(h('div', { class: 'wrap' }, h('b', {}, '📢 '), ...rows.slice(0, 3).map((n, i) => {
      const link = safeUrl(n.link);
      const t = link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, n.title) : h('span', {}, n.title);
      return [i ? ' · ' : '', t, n.body ? h('span', { class: 'muted' }, ' — ' + n.body) : ''];
    }).flat()));
    bar.hidden = false;
  });

  api('results').then((rows) => {
    const box = $('#results-list');
    if (!rows.length) { box.append(todo('Add toppers in Admin Panel → Results / Toppers, and tick "Show on website"') || ''); return; }
    box.append(...rows.map((r) => h('div', { class: 'card person' }, avatar(r.photo_url, r.student_name), h('h3', {}, r.student_name), h('p', { class: 'achv' }, r.achievement || ''), h('p', { class: 'muted' }, [r.exam, r.year].filter(Boolean).join(' · ')))));
  });

  api('faculty').then((rows) => {
    const box = $('#faculty-list');
    if (!rows.length) { box.append(todo('Add teachers in Admin Panel → Faculty, and tick "Show on website"') || ''); return; }
    box.append(...rows.map((t) => h('div', { class: 'card person' }, avatar(t.photo_url, t.full_name), h('h3', {}, t.full_name), h('p', { class: 'achv' }, t.subject || ''),
      h('p', { class: 'muted' }, [t.qualification, t.experience_years ? `${t.experience_years} yrs experience` : ''].filter(Boolean).join(' · ')), t.bio ? h('p', { class: 'small' }, t.bio) : null)));
  });
})();
