/*
 * Builds the page from content.js (SITE) and the public API.
 * You normally don't need to edit this file — change content.js instead.
 */
(function () {
  const PLACEHOLDER = /\[ADD:[^\]]*\]/g;
  const $ = (sel) => document.querySelector(sel);
  const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), SITE);
  const hasTodo = (s) => /\[ADD:/.test(String(s || ''));
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
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false || kid === '') continue;
      if (typeof kid === 'string' || typeof kid === 'number') {
        const span = fill(document.createElement('span'), kid);
        el.append(...span.childNodes);
      } else el.append(kid);
    }
    return el;
  }

  // Line icons (24×24, drawn with the current text colour)
  const ICONS = {
    board: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8M7 9l3 3 4-4 3 3"/>',
    book: '<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8 11h8M8 14h5"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7 15h10"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    whatsapp: '<path d="M21 12a9 9 0 0 1-13.3 7.9L3 21l1.2-4.6A9 9 0 1 1 21 12z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 1a4 4 0 0 1-2.5-2.5l1-1-1-2z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="m5 12 4 4 10-10"/>',
  };
  function icon(name, cls = 'ico') {
    const span = document.createElement('span');
    span.className = cls;
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.star}</svg>`;
    return span;
  }

  const todoBlock = (text) => (SHOW_PLACEHOLDERS ? h('p', { class: 'todo-block' }, `[ADD: ${text}]`) : null);
  const safeUrl = (u) => (u && /^(https?:\/\/|\/|images\/|data:image\/|[\w-]+\.html)/i.test(u) ? u : null);
  const initials = (name) => String(name || '?').replace(PLACEHOLDER, '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '★';
  const avatar = (src, name) => (safeUrl(src) ? h('img', { class: 'avatar', src, alt: name, loading: 'lazy', width: 96, height: 96 }) : h('div', { class: 'avatar ph' }, initials(name)));
  const checks = (items) => h('ul', { class: 'checks' }, items.filter((p) => !isBlank(p)).map((p) => h('li', {}, icon('check'), h('span', {}, p))));

  // ---------- simple bindings in index.html ----------
  document.querySelectorAll('[data-text]').forEach((el) => fill(el, get(el.dataset.text)));
  document.querySelectorAll('[data-src]').forEach((el) => (el.src = get(el.dataset.src)));
  document.title = `${SITE.name} — ${SITE.fullName}, Lasur`;
  $('#year').textContent = new Date().getFullYear();

  // ---------- hero + stats ----------
  $('#hero-chips').append(...SITE.hero.chips.map((c) => h('li', {}, icon(c.icon), h('span', {}, c.text))));
  $('#stats').append(...SITE.stats.map((s) => h('div', { class: 'stat' }, h('b', {}, s.value), h('span', {}, s.label))));

  // ---------- "Choose your goal" → enquiry form with that goal selected ----------
  const courseNames = [...new Set([...SITE.goals.map((g) => g.name), ...SITE.courses.map((c) => c.name)])];
  $('#course-options').append(...courseNames.map((o) => h('option', {}, o)), h('option', {}, 'Not sure — please guide me'));
  function enquireAbout(name) {
    const sel = $('#course-options');
    if ([...sel.options].some((o) => o.value === name)) sel.value = name;
    $('#admission').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(() => $('#enquiry-form [name=student_name]').focus({ preventScroll: true }), 500);
  }
  $('#goals-list').append(...SITE.goals.map((g) =>
    h('button', { type: 'button', class: 'goal', onclick: () => enquireAbout(g.name) },
      icon(g.icon, 'goal-ico'),
      h('span', { class: 'goal-text' }, h('b', {}, g.name), h('small', {}, g.forWhom)),
      icon('arrow', 'goal-arrow'))));

  // ---------- courses ----------
  $('#courses-list').append(...SITE.courses.map((c) =>
    h('article', { class: 'card course' },
      c.tag ? h('span', { class: 'badge' }, c.tag) : null,
      h('h3', {}, c.name),
      h('p', { class: 'muted' }, c.description),
      h('dl', { class: 'meta' },
        h('div', {}, h('dt', {}, 'For'), h('dd', {}, c.forWhom)),
        h('div', {}, h('dt', {}, 'Mode'), h('dd', {}, c.mode)),
        h('div', {}, h('dt', {}, 'Duration'), h('dd', {}, c.duration)),
        h('div', {}, h('dt', {}, 'Fees'), h('dd', {}, c.fees))),
      checks(c.points),
      h('div', { class: 'course-actions' },
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => enquireAbout(c.name) }, 'Enquire now'),
        h('a', { href: '#demo-form', class: 'btn btn-sm btn-ghost js-demo' }, 'Free demo')))));

  // ---------- offline / online ----------
  $('#modes').append(...SITE.modes.map((m) =>
    h('article', { class: 'card mode' }, icon(m.icon, 'mode-ico'), h('h3', {}, m.title), h('p', { class: 'muted' }, m.text), checks(m.points))));

  // ---------- why SRVP, approach ----------
  $('#highlights').append(...SITE.highlights.map((x) => h('div', { class: 'feature' }, icon(x.icon, 'feat-ico'), h('div', {}, h('h3', {}, x.title), h('p', {}, x.text)))));
  $('#steps').append(...SITE.approach.steps.map((s) => h('li', {}, h('h3', {}, s.title), h('p', {}, s.text))));

  // ---------- about, values, founder ----------
  $('#about-text').append(...SITE.about.paragraphs.filter((p) => !isBlank(p)).map((p) => h('p', {}, p)));
  if (!isBlank(SITE.established)) $('#about-text').append(h('p', { class: 'muted small' }, 'Established: ', SITE.established));
  const v = SITE.values;
  if (v && v.show) {
    $('#values').append(
      h('h3', {}, v.heading), h('p', { class: 'muted' }, v.text),
      h('div', { class: 'value-row' }, v.items.map((it) =>
        h('div', { class: 'value' }, h('span', { class: 'deva', lang: 'hi' }, it.word), h('b', {}, it.title), h('p', {}, it.text)))));
    $('#values').hidden = false;
  }
  const f = SITE.about.founder;
  $('#founder').append(
    avatar(f.photo, f.name),
    h('h3', {}, f.name), h('p', { class: 'muted small' }, f.role), h('p', { class: 'small' }, f.qualification),
    h('blockquote', {}, `“${f.message}”`));

  // ---------- library ----------
  $('#library-facts').append(...SITE.library.facts.map((s) => h('div', {}, h('b', {}, s.value), h('span', {}, s.label))));
  $('#library-photo').append(safeUrl(SITE.library.photo)
    ? h('img', { src: SITE.library.photo, alt: 'SRVP library', class: 'photo', loading: 'lazy' })
    : h('div', { class: 'photo ph' }, todoBlock('Library photo — put it in public/images/ and set library.photo in content.js') || icon('book', 'big-ico')));

  // ---------- testimonials ----------
  $('#testimonials').append(...SITE.testimonials.filter((t) => !isBlank(t.quote)).map((t) =>
    h('figure', { class: 'card quote' }, icon('star', 'stars'), h('blockquote', {}, `“${t.quote}”`), h('figcaption', {}, h('b', {}, t.name), h('span', {}, t.role)))));

  // ---------- gallery ----------
  const gal = $('#gallery');
  if (SITE.gallery.length) {
    gal.append(...SITE.gallery.map((g) => h('figure', { class: 'gal' }, h('img', { src: g.src, alt: g.caption || '', loading: 'lazy' }), g.caption ? h('figcaption', {}, g.caption) : null)));
  } else if (SHOW_PLACEHOLDERS) {
    gal.append(...SITE.galleryWishlist.map((w) => h('div', { class: 'gal ph' }, h('span', { class: 'todo' }, '✏️ ADD photo: ' + w))));
  } else $('#gallery-section').hidden = true;

  // ---------- FAQ ----------
  $('#faq-list').append(...SITE.faq.filter((x) => !isBlank(x.a)).map((x) => h('details', {}, h('summary', {}, x.q), h('p', {}, x.a))));

  // ---------- contact, footer, map, social ----------
  const c = SITE.contact;
  const tel = hasTodo(c.phone) ? '' : c.phone.replace(/[^\d+]/g, '');
  const wa = /^\d{10,15}$/.test(c.whatsapp) ? c.whatsapp : '';
  const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent('Hello SRVP, I would like to know about admissions.')}` : '';
  const contactRows = () => [
    h('p', {}, icon('phone'), tel ? h('a', { href: 'tel:' + tel }, c.phone) : h('span', {}, c.phone)),
    h('p', {}, icon('mail'), h('span', {}, c.email)),
    h('p', {}, icon('pin'), h('span', {}, c.address)),
    h('p', {}, icon('clock'), h('span', {}, c.timings)),
  ];
  $('#contact').append(...contactRows());
  $('#footer-contact').append(...contactRows());
  $('#footer-courses').append(...SITE.goals.slice(0, 6).map((g) => h('li', {}, h('a', { href: '#goals' }, g.name))));
  if (safeUrl(c.mapEmbedUrl)) {
    $('#map').append(h('iframe', { class: 'map', src: c.mapEmbedUrl, loading: 'lazy', title: 'Map to SRVP', referrerpolicy: 'no-referrer-when-downgrade' }));
  } else $('#map').append(todoBlock('Google Maps embed link — see contact.mapEmbedUrl in content.js') || '');
  const social = Object.entries(SITE.social).filter(([, url]) => safeUrl(url));
  $('#social').append(...social.map(([k, url]) => h('a', { href: url, target: '_blank', rel: 'noopener' }, k[0].toUpperCase() + k.slice(1))));

  // Floating WhatsApp (desktop) + sticky action bar (phones)
  if (waLink) {
    const btn = $('#whatsapp');
    btn.href = waLink; btn.target = '_blank'; btn.rel = 'noopener'; btn.append(icon('whatsapp')); btn.hidden = false;
  }
  $('#mobile-bar').append(...[
    tel ? h('a', { href: 'tel:' + tel }, icon('phone'), 'Call') : null,
    waLink ? h('a', { href: waLink, target: '_blank', rel: 'noopener' }, icon('whatsapp'), 'WhatsApp') : null,
    h('a', { href: '#demo-form', class: 'primary js-demo' }, 'Book Free Demo'),
  ].filter(Boolean));

  // "Free demo" buttons: jump to the call-back form and put the cursor in it
  document.addEventListener('click', (e) => {
    if (e.target.closest('.js-demo')) setTimeout(() => $('#demo-form [name=student_name]').focus({ preventScroll: true }), 450);
  });

  // ---------- enquiry forms (banner call-back form + full form) ----------
  document.querySelectorAll('.js-enquiry').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = form.querySelector('.form-msg');
      const data = Object.fromEntries(new FormData(form));
      data.enquiry_type = form.dataset.type;
      if (!data.student_name.trim() || !/^[+\d][\d\s-]{6,15}$/.test(data.phone.trim())) {
        msg.className = 'form-msg err';
        msg.textContent = 'Please enter the student name and a valid phone number.';
        return;
      }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const r = await fetch('api/public/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Something went wrong');
        msg.className = 'form-msg ok';
        msg.textContent = get(msg.dataset.success);
        form.reset();
      } catch (err) {
        msg.className = 'form-msg err';
        msg.textContent = err.message === 'Failed to fetch' ? 'Could not send. Please call us directly.' : err.message;
      } finally {
        btn.disabled = false;
      }
    });
  });

  // ---------- mobile menu ----------
  const menuBtn = $('.menu-btn');
  menuBtn.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    menuBtn.setAttribute('aria-expanded', open);
  });
  document.querySelectorAll('.links a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('menu-open')));

  // ---------- Google search info (structured data) ----------
  const ld = { '@context': 'https://schema.org', '@type': 'EducationalOrganization', name: SITE.fullName, alternateName: SITE.name, description: SITE.hero.subtitle, url: location.origin + location.pathname };
  if (tel) ld.telephone = tel;
  if (!hasTodo(c.email)) ld.email = c.email;
  if (!hasTodo(c.address)) ld.address = c.address;
  document.head.append(h('script', { type: 'application/ld+json' }, JSON.stringify(ld)));

  // ---------- data from the Admin Panel ----------
  const api = (name) => fetch('api/public/' + name).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const sample = (n, make) => (SHOW_PLACEHOLDERS ? Array.from({ length: n }, make) : []);

  api('announcements').then((rows) => {
    if (!rows.length) return;
    const bar = $('#notices');
    bar.append(h('div', { class: 'wrap' }, ...rows.slice(0, 3).map((n, i) => {
      const link = safeUrl(n.link);
      const t = link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, n.title) : h('b', {}, n.title);
      return [i ? h('span', { class: 'sep' }, ' • ') : null, t, n.body ? h('span', { class: 'muted' }, ' — ' + n.body) : null];
    }).flat()));
    bar.hidden = false;
  });

  api('results').then((rows) => {
    const box = $('#results-list');
    const cards = rows.length ? rows.map((r) => ({ name: r.student_name, big: r.achievement, sub: [r.exam, r.year].filter(Boolean).join(' · '), photo: r.photo_url }))
      : sample(4, () => ({ name: '[ADD: Student name]', big: '[ADD: Rank / marks]', sub: '[ADD: Exam · Year]' }));
    box.append(...cards.map((r) => h('div', { class: 'card result' }, avatar(r.photo, r.name), h('b', { class: 'rank' }, r.big || ''), h('h3', {}, r.name), h('p', { class: 'muted small' }, r.sub))));
    if (!rows.length && SHOW_PLACEHOLDERS) box.after(h('p', { class: 'hint small' }, 'These are empty sample cards. Add real toppers in Admin Panel → Results / Toppers and tick “Show on website”.'));
  });

  api('faculty').then((rows) => {
    const box = $('#faculty-list');
    const cards = rows.length ? rows : sample(3, () => ({ full_name: '[ADD: Teacher name]', subject: '[ADD: Subject]', qualification: '[ADD: Qualification]' }));
    box.append(...cards.map((t) => h('div', { class: 'card person' }, avatar(t.photo_url, t.full_name), h('h3', {}, t.full_name), h('p', { class: 'subject' }, t.subject || ''),
      h('p', { class: 'muted small' }, [t.qualification, t.experience_years ? `${t.experience_years} yrs experience` : ''].filter(Boolean).join(' · ')), t.bio ? h('p', { class: 'small' }, t.bio) : null)));
    if (!rows.length && SHOW_PLACEHOLDERS) box.after(h('p', { class: 'hint small' }, 'Add teachers in Admin Panel → Faculty and tick “Show on website”.'));
  });
})();
