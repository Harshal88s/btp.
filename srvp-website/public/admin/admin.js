/*
 * SRVP Admin Panel.
 * Forms and tables are generated from schema.js on the server —
 * to add a field, edit schema.js (not this file) and restart.
 */
(function () {
  const API = '../api/admin/';
  const $ = (s) => document.querySelector(s);
  let SCHEMA = {};
  let current = 'dashboard';
  let afterSave = null; // optional hook, used by "Admit" on enquiries

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  async function call(path, opts = {}) {
    const r = await fetch(API + path, {
      ...opts,
      headers: opts.body && typeof opts.body === 'string' && !opts.csv ? { 'Content-Type': 'application/json' } : opts.csv ? { 'Content-Type': 'text/csv' } : {},
    });
    if (r.status === 401 && path !== 'login') { showLogin(); throw new Error('Please log in'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  // ---------- login ----------
  function showLogin() { $('#app-view').hidden = true; $('#login-view').hidden = false; }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-err').textContent = '';
    try {
      await call('login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
      e.target.reset();
      start();
    } catch (err) { $('#login-err').textContent = err.message; }
  });
  $('#logout').addEventListener('click', async () => { await call('logout', { method: 'POST' }).catch(() => {}); showLogin(); });

  async function start() {
    try { SCHEMA = await call('schema'); } catch { return; }
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    const tabs = $('#tabs');
    tabs.textContent = '';
    tabs.append(h('button', { 'data-tab': 'dashboard', onclick: () => show('dashboard') }, 'Dashboard'),
      ...Object.entries(SCHEMA).map(([k, d]) => h('button', { 'data-tab': k, onclick: () => show(k) }, d.label)));
    show(location.hash.slice(1) || 'dashboard');
  }

  function show(tab) {
    current = SCHEMA[tab] || tab === 'dashboard' ? tab : 'dashboard';
    location.hash = current;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === current));
    current === 'dashboard' ? dashboard() : tableView(current);
  }

  // ---------- dashboard ----------
  async function dashboard() {
    const main = $('#main');
    main.textContent = '';
    const s = await call('stats');
    const card = (label, value, tab) => h('div', { class: 'stat', onclick: tab ? () => show(tab) : null }, h('b', {}, String(value)), h('span', {}, label));
    main.append(
      h('h1', {}, 'Dashboard'),
      h('div', { class: 'stats' },
        card('Active students', s.students, 'students'),
        card('Offline', s.offline, 'students'),
        card('Online', s.online, 'students'),
        card('Active faculty', s.faculty, 'faculty'),
        card('New enquiries', s.newEnquiries, 'enquiries'),
        card('Fees collected', rupee(s.feePaid)),
        card('Fees pending', rupee(s.feeTotal - s.feePaid))),
      h('div', { class: 'panel' },
        h('h2', {}, 'Backup'),
        h('p', {}, 'Download a copy of the whole database (all students, faculty, enquiries). Do this every week and keep it on Google Drive / a pen drive.'),
        h('a', { class: 'btn', href: API + 'backup' }, '⬇ Download backup')),
      h('div', { class: 'panel' },
        h('h2', {}, 'Quick help'),
        h('ul', {},
          h('li', {}, 'Website text (about, courses, contact…) → edit public/js/content.js and refresh the site.'),
          h('li', {}, 'Faculty and toppers appear on the website only when "Show on website" is ticked.'),
          h('li', {}, 'Announcements with "Show on website" ticked appear in the bar at the top of the site.'),
          h('li', {}, 'To load many students at once: Students → Export CSV to get the format, fill it in Excel, then Import CSV.'))));
  }

  // ---------- table view ----------
  const display = (f, v) => {
    if (!f) return v ?? '';
    if (f.type === 'checkbox') return v ? '✅' : '—';
    if (f.type === 'number' && /fee|salary/.test(f.name) && v != null) return rupee(v);
    return v ?? '';
  };

  async function tableView(table) {
    const def = SCHEMA[table];
    const fmap = Object.fromEntries(def.fields.map((f) => [f.name, f]));
    const main = $('#main');
    main.textContent = '';
    const params = new URLSearchParams();
    const search = h('input', { type: 'search', placeholder: 'Search…' });
    const filterEls = (def.filters || []).map((name) => {
      const sel = h('select', { 'data-f': name }, h('option', { value: '' }, `All ${fmap[name].label}`), ...fmap[name].options.map((o) => h('option', {}, o)));
      sel.addEventListener('change', load);
      return sel;
    });
    let t;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });

    const fileIn = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true });
    fileIn.addEventListener('change', async () => {
      const file = fileIn.files[0];
      if (!file) return;
      try {
        const r = await call(`${table}/import`, { method: 'POST', body: await file.text(), csv: true });
        alert(`Imported ${r.added} rows.` + (r.failed.length ? `\n\nSkipped:\n${r.failed.slice(0, 20).join('\n')}` : ''));
        load();
      } catch (e) { alert(e.message); }
      fileIn.value = '';
    });

    const exportBtn = h('a', { class: 'btn ghost' }, '⬇ Export CSV');
    const count = h('span', { class: 'muted' });
    const tbody = h('tbody');
    const cols = def.list;
    const extra = table === 'students' ? ['Due'] : [];

    main.append(
      h('div', { class: 'toolbar' },
        h('h1', {}, def.label), count,
        h('div', { class: 'grow' }),
        search, ...filterEls,
        h('button', { class: 'btn', onclick: () => openEditor(table) }, '+ Add'),
        exportBtn,
        h('button', { class: 'btn ghost', onclick: () => fileIn.click() }, '⬆ Import CSV'), fileIn),
      h('div', { class: 'table-wrap' },
        h('table', {},
          h('thead', {}, h('tr', {}, ...cols.map((c) => h('th', {}, c === 'created_at' ? 'Date' : fmap[c]?.label || c)), ...extra.map((x) => h('th', {}, x)), h('th', {}, ''))),
          tbody)));

    async function load() {
      for (const k of [...params.keys()]) params.delete(k);
      if (search.value.trim()) params.set('q', search.value.trim());
      filterEls.forEach((s) => s.value && params.set(s.dataset.f, s.value));
      exportBtn.href = `${API}${table}/export.csv?${params}`;
      const rows = await call(`${table}?${params}`);
      count.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
      tbody.textContent = '';
      if (!rows.length) tbody.append(h('tr', {}, h('td', { colspan: cols.length + extra.length + 1, class: 'empty' }, 'Nothing here yet. Click “+ Add”.')));
      for (const row of rows) {
        const due = (row.fee_total || 0) - (row.fee_paid || 0);
        tbody.append(h('tr', {},
          ...cols.map((c) => h('td', {}, String(c === 'created_at' ? (row[c] || '').slice(0, 10) : display(fmap[c], row[c])))),
          ...(table === 'students' ? [!row.fee_total ? h('td', {}, '—') : h('td', { class: due > 0 ? 'due' : 'paid' }, due > 0 ? rupee(due) : 'Paid')] : []),
          h('td', { class: 'row-actions' },
            table === 'enquiries' && row.status !== 'Admitted' ? h('button', { onclick: () => admit(row) }, 'Admit →') : null,
            h('button', { onclick: () => openEditor(table, row) }, 'Edit'),
            h('button', { class: 'danger', onclick: () => remove(table, row) }, 'Delete'))));
      }
    }
    load().catch((e) => alert(e.message));
  }

  async function remove(table, row) {
    const name = row.full_name || row.student_name || row.title || `#${row.id}`;
    if (!confirm(`Delete "${name}" permanently?`)) return;
    try { await call(`${table}/${row.id}`, { method: 'DELETE' }); show(table); } catch (e) { alert(e.message); }
  }

  // Enquiry → new student, pre-filled. Marks the enquiry "Admitted" after saving.
  function admit(enq) {
    afterSave = () => call(`enquiries/${enq.id}`, { method: 'PUT', body: JSON.stringify({ status: 'Admitted' }) });
    const mode = ['Offline', 'Online'].includes(enq.mode) ? enq.mode : '';
    openEditor('students', null, {
      full_name: enq.student_name, parent_name: enq.parent_name, phone: enq.phone, email: enq.email,
      class_grade: enq.class_grade, mode, status: 'Active', admission_date: new Date().toISOString().slice(0, 10),
      notes: enq.message ? `From enquiry: ${enq.message}` : '',
    }, 'enquiries');
  }

  // ---------- add / edit popup ----------
  const dlg = $('#editor');
  let editing = null;
  $('#editor-cancel').addEventListener('click', () => { afterSave = null; dlg.close(); });

  function openEditor(table, row, prefill, returnTab) {
    const def = SCHEMA[table];
    editing = { table, id: row?.id, returnTab: returnTab || table };
    const data = row || prefill || {};
    $('#editor-title').textContent = `${row ? 'Edit' : 'Add'} ${def.label.replace(/s$/, '').replace(/ \/.*/, '')}`;
    $('#editor-err').textContent = '';
    const box = $('#editor-fields');
    box.textContent = '';
    for (const f of def.fields) {
      const val = data[f.name] ?? '';
      let input;
      if (f.type === 'textarea') input = h('textarea', { name: f.name, rows: 3 });
      else if (f.type === 'select') input = h('select', { name: f.name }, h('option', { value: '' }, '—'), ...f.options.map((o) => h('option', {}, o)));
      else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', name: f.name });
      else input = h('input', { name: f.name, type: f.type === 'number' ? 'number' : f.type, step: f.type === 'number' ? 'any' : null });
      if (f.type === 'checkbox') input.checked = !!(row ? val : f.name === 'show_on_site' || f.name === 'is_active');
      else input.value = val ?? '';
      if (f.required) input.required = true;
      box.append(h('label', { class: f.type === 'textarea' ? 'wide' : f.type === 'checkbox' ? 'check' : '' }, f.label + (f.required ? ' *' : ''), input));
    }
    dlg.showModal();
  }

  $('#editor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { table, id, returnTab } = editing;
    const body = {};
    for (const f of SCHEMA[table].fields) {
      const el = e.target.elements[f.name];
      body[f.name] = f.type === 'checkbox' ? el.checked : el.value;
    }
    try {
      await call(id ? `${table}/${id}` : table, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      if (afterSave) await afterSave();
      afterSave = null;
      dlg.close();
      show(returnTab);
    } catch (err) { $('#editor-err').textContent = err.message; }
  });

  start();
})();
