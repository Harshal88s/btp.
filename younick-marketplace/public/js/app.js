/* Younick Gifts storefront – vanilla JS, no build step.
   Works in two modes:
   - server: fetches /api/catalog, listens to /api/events (Excel saves push live updates), posts orders to /api/orders
   - static: catalogue embedded in <script id="catalog-data"> (dist / artifact preview); orders go out via WhatsApp */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const state = {
    catalog: null, mode: "server", products: [], byId: new Map(),
    filter: { cat: "all", q: "", sort: "featured", seasonOnly: false, shown: 24 },
    cart: store.get("yn.cart", []), promo: store.get("yn.promo", ""),
    prevPrices: new Map(), heroTimer: null, heroIndex: 0, reviewTimer: null, reviewIndex: 0,
    pm: { product: null, photos: [] }, checkout: { deliveryKey: null, order: null }, db: null,
  };
  // Claude artifact preview: if the viewer grants the shared order book, orders placed in the preview are saved there too.
  try { if (window.claude && typeof window.claude.use === "function") window.claude.use("db").then((db) => { state.db = db || null; }).catch(() => {}); } catch {}

  /* ------------------------------------------------------------ theme */
  const root = document.documentElement;
  const savedTheme = store.get("yn.theme", null);
  if (savedTheme === "dark" || savedTheme === "light") root.setAttribute("data-theme", savedTheme);
  $("#themeToggle").addEventListener("click", () => {
    const isDark = root.getAttribute("data-theme") === "dark" || (!root.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    root.setAttribute("data-theme", next); store.set("yn.theme", next);
    toast(next === "dark" ? "Dark mode on 🌙" : "Light mode on ☀️");
  });

  /* ------------------------------------------------------------ toasts */
  function toast(msg, kind = "") {
    const el = document.createElement("div"); el.className = "toast " + kind; el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .4s"; setTimeout(() => el.remove(), 400); }, 2600);
  }
  function copyText(text, btn) {
    const done = () => { if (btn) { btn.classList.add("done"); btn.textContent = "Copied"; setTimeout(() => { btn.classList.remove("done"); btn.textContent = "Copy"; }, 1600); } toast("Copied: " + text); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch { toast("Copy failed, long-press to copy"); }
    ta.remove();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    const el = $(b.dataset.copy); if (el) copyText(el.textContent.trim(), b);
  });

  /* ------------------------------------------------------------ catalog loading */
  async function loadCatalog() {
    const embedded = $("#catalog-data");
    if (embedded) { state.mode = "static"; return JSON.parse(embedded.textContent); }
    const res = await fetch("/api/catalog", { cache: "no-store" });
    if (!res.ok) throw new Error("Catalogue unavailable");
    state.mode = "server";
    return res.json();
  }
  function applyCatalog(cat, { silent = false } = {}) {
    const changed = [];
    if (state.catalog) {
      for (const p of cat.products) { const old = state.byId.get(p.id); if (old && old.price !== p.price) changed.push(p.id); }
    }
    state.catalog = cat; state.products = cat.products; state.byId = new Map(cat.products.map((p) => [p.id, p]));
    renderAll(changed);
    if (!silent) {
      if (changed.length) toast(`Prices updated from the Excel sheet (${changed.length} product${changed.length > 1 ? "s" : ""})`, "good");
      else toast("Catalogue refreshed from the Excel sheet", "good");
    }
    // keep cart prices in sync
    let cartChanged = false;
    state.cart = state.cart.filter((it) => { const p = state.byId.get(it.id); if (!p) { cartChanged = true; return false; } if (p.price !== it.price) { it.price = p.price; cartChanged = true; } return true; });
    if (cartChanged) { saveCart(); }
    renderCart();
  }
  function connectLive() {
    if (state.mode !== "server" || !("EventSource" in window)) return;
    const es = new EventSource("/api/events");
    es.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "catalog" && msg.version !== state.catalog.version) {
          const cat = await (await fetch("/api/catalog", { cache: "no-store" })).json();
          applyCatalog(cat);
        }
      } catch {}
    };
    es.onerror = () => { $("#modeLabel").textContent = "live link reconnecting…"; };
    es.onopen = () => { $("#modeLabel").textContent = "live-linked to Excel"; };
  }

  /* ------------------------------------------------------------ rendering */
  function renderAll(changed = []) {
    const c = state.catalog, s = c.settings, se = c.season;
    document.title = (s.store_name || "Younick Gifts");
    $("#brandName").textContent = s.store_name || "Younick Gifts";
    $("#brandBy").textContent = s.store_by || "";
    $("#footBrand").textContent = `${s.store_name || "Younick Gifts"} ${s.store_by || ""}`;
    $("#footTag").textContent = s.tagline || "";
    $("#footYear").textContent = `© ${new Date().getFullYear()}`;
    $("#catalogVersion").textContent = c.version;
    $("#modeLabel").textContent = state.mode === "server" ? "live-linked to Excel" : "preview build (static catalogue)";
    $("#statProducts").textContent = String(c.products.length);
    $("#statYearsLi").hidden = !s.stat_years; $("#statYears").textContent = s.stat_years || "";
    $("#statCustomersLi").hidden = !s.stat_customers; $("#statCustomers").textContent = s.stat_customers || "";
    $("#founderName").textContent = s.founder_name || ""; $("#founderTitle").textContent = s.founder_title || ""; $("#founderQuote").textContent = s.founder_quote || "";
    $("#founderInitials").textContent = (s.founder_name || "YN").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    $("#trustProd").textContent = s.production_time || "24–48 hours";
    $("#qrImage").src = s.qr_image || "assets/payment-qr.png";
    $("#advanceRule").textContent = `${s.advance_percent || 20}%, min ${inr(s.advance_min || 200)}`;
    renderContact(); renderSeo();

    // season theming
    if (se) {
      root.style.setProperty("--sa", se.colorA); root.style.setProperty("--sb", se.colorB); root.style.setProperty("--s-dark", se.colorDark);
      $("#seasonEmoji").textContent = se.emoji || "🎁"; $("#mbEmoji").textContent = se.emoji || "🎁"; $("#seasonBadgeText").textContent = se.badge || se.name;
      $("#heroHeadline").innerHTML = glowLastWords(se.headline || "Gifts that are truly theirs");
      $("#heroSubline").textContent = se.subline || "";
      $("#picksEyebrow").textContent = `${se.name} picks`; $("#picksTitle").textContent = pickTitle(se);
      $("#seasonOnlyLabel").textContent = `${se.name.split(" ")[0]} only`;
      const promo = $("#promoChip");
      if (se.promoCode && se.discountPercent) { promo.hidden = false; $("#promoCode").textContent = se.promoCode; $("#promoText").textContent = `for ${se.discountPercent}% off`; } else promo.hidden = true;
      document.body.dataset.season = se.theme || "festive";
    }
    const ann = se && se.announcement ? se.announcement : s.announcement;
    const annEl = $("#announce");
    if (ann) { annEl.hidden = false; const items = Array(6).fill(`<span>${esc(ann)} ✦</span>`).join(""); $("#announceTrack").innerHTML = items; } else annEl.hidden = true;

    renderHero(); renderChips(); renderPicks(); renderGrid(changed); renderDelivery(); renderReviews(); renderCart();
  }
  const todo = (label) => `<span class="todo">${esc(label)} to be added</span>`;
  const mailto = (subject, body) => `mailto:${state.catalog.settings.email || ""}?subject=${encodeURIComponent(subject)}${body ? "&body=" + encodeURIComponent(body) : ""}`;
  function renderContact() {
    const s = state.catalog.settings, setup = state.catalog.setup || [];
    $("#storeAddress").innerHTML = s.address_line1 || s.address_line2 ? `${esc(s.address_line1)}${s.address_line2 ? "<br>" + esc(s.address_line2) : ""}` : todo("Store address");
    $("#storeHours").innerHTML = s.store_hours ? esc(s.store_hours) : todo("Store hours");
    const rows = [
      ["Email", s.email ? `<strong id="storeEmail">${esc(s.email)}</strong><button class="chip-copy" data-copy="#storeEmail" type="button">Copy</button>` : todo("Email")],
      ["Phone", s.phone ? `<strong id="storePhone">${esc(s.phone)}</strong><button class="chip-copy" data-copy="#storePhone" type="button">Copy</button>` : todo("Phone number")],
      ["WhatsApp", s.whatsapp ? `<strong>+${esc(s.whatsapp)}</strong>` : todo("WhatsApp number")],
      ["Instagram", s.instagram ? `<strong>@${esc(s.instagram)}</strong>` : todo("Instagram handle")],
      ["Facebook", s.facebook ? `<strong>${esc(s.facebook)}</strong>` : todo("Facebook page")],
    ];
    $("#contactRows").innerHTML = rows.map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join("");
    const links = [];
    if (s.whatsapp) links.push(`<a class="btn btn-primary" href="https://wa.me/${esc(s.whatsapp)}?text=${encodeURIComponent("Hi Younick Gifts, I want to order a personalised gift.")}" target="_blank" rel="noopener">Chat on WhatsApp</a>`);
    if (s.email) links.push(`<a class="btn ${s.whatsapp ? "btn-ghost" : "btn-primary"}" href="${mailto("Enquiry from the Younick Gifts website")}">Email us</a>`);
    if (s.maps_url) links.push(`<a class="btn btn-ghost" href="${esc(s.maps_url)}" target="_blank" rel="noopener">Open in Maps</a>`);
    if (s.instagram) links.push(`<a class="btn btn-ghost" href="https://instagram.com/${esc(s.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
    $("#storeLinks").innerHTML = links.join("");
    const bulk = $("#bulkMail"); bulk.href = mailto("Bulk / corporate gifting quote", "Hi Younick Gifts,\n\nProduct(s):\nQuantity:\nDelivery city:\nNeeded by:\nArtwork / logo attached: yes / no\n");
    $("#mbHelp").href = s.whatsapp ? `https://wa.me/${s.whatsapp}` : mailto("Help with my order");
    $("#cartHelpMail").textContent = s.email || ""; $("#cartHelpMail").href = mailto("Help with my order");
    $("#footContact").innerHTML = [s.email ? `<a href="${mailto("Enquiry")}">${esc(s.email)}</a>` : "", s.phone ? esc(s.phone) : "", s.gstin ? `GSTIN ${esc(s.gstin)}` : todo("GSTIN")].filter(Boolean).join(" · ");
    $("#footerTerms").innerHTML = (s.terms || "").split("|").map((t) => t.trim()).filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join("");
    const box = $("#setupBox"); box.hidden = !setup.length;
    $("#setupCount").textContent = setup.length; $("#setupList").innerHTML = setup.map((f) => `<li>${esc(f.label)} <code>${esc(f.where)}</code></li>`).join("");
  }
  function renderSeo() {
    const s = state.catalog.settings, c = state.catalog;
    if (s.seo_title) document.title = s.seo_title;
    const md = document.querySelector('meta[name="description"]'); if (md && s.seo_description) md.setAttribute("content", s.seo_description);
    const og = document.querySelector('meta[property="og:description"]'); if (og && s.seo_description) og.setAttribute("content", s.seo_description);
    if (s.site_url) { let l = document.querySelector('link[rel="canonical"]'); if (!l) { l = document.createElement("link"); l.rel = "canonical"; document.head.appendChild(l); } l.href = s.site_url.replace(/\/+$/, "") + "/"; }
    const base = (s.site_url || "").replace(/\/+$/, "");
    const ld = [
      { "@context": "https://schema.org", "@type": "Store", name: `${s.store_name} ${s.store_by}`.trim(), email: s.email || undefined, telephone: s.phone || undefined, url: base || undefined, founder: s.founder_name ? { "@type": "Person", name: s.founder_name } : undefined, areaServed: "IN", paymentAccepted: "UPI", address: s.address_line1 ? { "@type": "PostalAddress", streetAddress: s.address_line1, addressLocality: s.address_line2, addressCountry: "IN" } : undefined },
      { "@context": "https://schema.org", "@type": "ItemList", itemListElement: c.products.filter((p) => p.featured).slice(0, 20).map((p, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "Product", name: p.name, sku: p.sku, image: p.imageUrl, description: p.description, category: p.category, offers: { "@type": "Offer", priceCurrency: "INR", price: p.price, availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: base ? `${base}/#${p.id}` : undefined } } })) },
    ];
    let tag = $("#ld-json"); if (!tag) { tag = document.createElement("script"); tag.id = "ld-json"; tag.type = "application/ld+json"; document.head.appendChild(tag); }
    tag.textContent = JSON.stringify(ld);
  }
  function glowLastWords(text) {
    const words = text.split(" "); if (words.length < 3) return esc(text);
    const n = Math.min(3, Math.ceil(words.length / 3));
    return esc(words.slice(0, -n).join(" ")) + ' <span class="glow-word">' + esc(words.slice(-n).join(" ")) + "</span>";
  }
  function pickTitle(se) { return ({ diwali: "Gifts that glow this Diwali", valentine: "Gifts that say it from the heart", rakhi: "Gifts for the bond that lasts", newyear: "Gifts for a fresh start", birthday: "Gifts that make birthdays legendary" })[se.theme] || `${se.name} picks`; }

  /* ---- hero slideshow ---- */
  function renderHero() {
    const se = state.catalog.season; const wrap = $("#heroSlides"); const dots = $("#heroDots");
    clearInterval(state.heroTimer); wrap.innerHTML = ""; dots.innerHTML = "";
    const ids = (se && se.slides.length ? se.slides : state.products.filter((p) => p.featured).slice(0, 5).map((p) => p.id));
    const imgs = se ? se.campaignImages : [];
    const slides = ids.map((id, i) => ({ p: state.byId.get(id), bg: imgs[i] || "" })).filter((s) => s.p);
    if (!slides.length) return;
    slides.forEach((s, i) => {
      const el = document.createElement("div"); el.className = "slide" + (s.bg ? " has-bg" : "") + (i === 0 ? " on" : "");
      el.innerHTML = `${s.bg ? `<div class="slide-bg" style="background-image:url('${s.bg}')"></div>` : `<div class="slide-art"><img src="${s.p.image}" alt="${esc(s.p.name)}" loading="${i ? "lazy" : "eager"}"></div>`}
        <div class="slide-cap"><div><h3>${esc(s.p.name)}</h3><p>${esc(s.p.category)}${s.p.badge ? " · " + esc(s.p.badge) : ""}</p></div>
        <div style="display:flex;align-items:center;gap:.6rem"><span class="slide-price">${inr(s.p.price)}</span><button class="btn btn-primary" data-open="${s.p.id}" type="button">View</button></div></div>`;
      wrap.appendChild(el);
      const d = document.createElement("button"); d.setAttribute("aria-label", `Slide ${i + 1}`); if (i === 0) d.className = "on";
      d.addEventListener("click", () => goHero(i, true)); dots.appendChild(d);
    });
    state.heroIndex = 0;
    state.heroTimer = setInterval(() => goHero((state.heroIndex + 1) % slides.length), 4800);
    let sx = 0; wrap.ontouchstart = (e) => (sx = e.touches[0].clientX);
    wrap.ontouchend = (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) goHero((state.heroIndex + (dx < 0 ? 1 : slides.length - 1)) % slides.length, true); };
  }
  function goHero(i, manual) {
    const slides = $$("#heroSlides .slide"), dots = $$("#heroDots button"); if (!slides.length) return;
    slides.forEach((s, k) => s.classList.toggle("on", k === i)); dots.forEach((d, k) => d.classList.toggle("on", k === i));
    state.heroIndex = i;
    if (manual) { clearInterval(state.heroTimer); state.heroTimer = setInterval(() => goHero((state.heroIndex + 1) % slides.length), 4800); }
  }

  /* ---- category chips ---- */
  function renderChips() {
    const counts = new Map();
    for (const p of state.products) counts.set(p.category, (counts.get(p.category) || 0) + 1);
    const icons = { Mugs: "☕", Pillows: "🛋️", Frames: "🖼️", Keychains: "🔑", "Lamps & Mirrors": "💡", Apparel: "👕", "Soft Toys": "🧸", "Kids & School": "🎒", "Home Decor": "🏠", Festive: "🎀", "Desk Gifts": "🗂️", "Sipper Bottles": "🍶", "Wall Clocks": "🕰️", Tiles: "🧱", "Glass & Rock Frames": "🪞", "Badges & Coasters": "📛", Accessories: "⌚", "Puzzles & Scrolls": "🧩", "Mobile Accessories": "📱", "Trophies & Plates": "🏆", Party: "🎉", "Premium Gifts": "💝", Electronics: "🔊" };
    const cats = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    const wrap = $("#catChips");
    wrap.innerHTML = `<button class="chip ${state.filter.cat === "all" ? "on" : ""}" data-cat="all">✨ All gifts <small>${state.products.length}</small></button>` +
      cats.map((c) => `<button class="chip ${state.filter.cat === c ? "on" : ""}" data-cat="${esc(c)}">${icons[c] || "🎁"} ${esc(c)} <small>${counts.get(c)}</small></button>`).join("");
  }
  $("#catChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    state.filter.cat = b.dataset.cat; state.filter.shown = 24; renderChips(); renderGrid();
    $("#shop").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---- product card ---- */
  function cardHTML(p, changed, eager) {
    const off = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
    return `<article class="card ${p.inStock ? "" : "oos"}" data-id="${p.id}">
      <div class="card-media" data-open="${p.id}">
        <img src="${p.image}" alt="${esc(p.name)}" loading="${eager ? "eager" : "lazy"}" decoding="async">
        ${p.badge ? `<span class="card-badge">${esc(p.badge)}</span>` : ""}
        ${off ? `<span class="card-off">${off}% off</span>` : ""}
        <span class="card-quick">Quick view</span>
      </div>
      <div class="card-body">
        <span class="card-cat">${esc(p.category)}${p.size ? " · " + esc(p.size) : ""}</span>
        <h3 class="card-title">${esc(p.name)}</h3>
        <div class="card-price ${changed.includes(p.id) ? "changed" : ""}"><strong>${inr(p.price)}</strong>${p.mrp > p.price ? `<s>${inr(p.mrp)}</s>` : ""}</div>
        <div class="card-foot">${p.inStock ? `<button class="btn btn-primary" data-add="${p.id}" type="button">Add to cart</button><button class="btn btn-ghost" data-open="${p.id}" type="button">Personalise</button>` : `<span class="oos-tag">Out of stock</span>`}</div>
      </div></article>`;
  }
  function renderPicks() {
    const se = state.catalog.season;
    let picks = state.products.filter((p) => p.inStock && (p.featured || (se && p.season.includes(se.key))));
    picks.sort((a, b) => (b.featured - a.featured) || (b.badge ? 1 : 0) - (a.badge ? 1 : 0));
    picks = picks.slice(0, 14);
    $("#picksRow").innerHTML = picks.map((p, i) => cardHTML(p, [], i < 6)).join("") || `<p class="tiny">Mark products as Featured in the Excel sheet to show them here.</p>`;
  }
  $$(".scroll-ctl [data-scroll]").forEach((b) => b.addEventListener("click", () => $("#picksRow").scrollBy({ left: Number(b.dataset.scroll) * 480, behavior: "smooth" })));

  function filtered() {
    const f = state.filter, se = state.catalog.season; const q = f.q.trim().toLowerCase();
    let list = state.products.filter((p) => (f.cat === "all" || p.category === f.cat) && (!f.seasonOnly || !se || p.season.includes(se.key) || p.featured) &&
      (!q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)) || p.description.toLowerCase().includes(q)));
    const sorters = { featured: (a, b) => (b.featured - a.featured) || (b.inStock - a.inStock) || ((b.badge ? 1 : 0) - (a.badge ? 1 : 0)) || 0, "price-asc": (a, b) => a.price - b.price, "price-desc": (a, b) => b.price - a.price, name: (a, b) => a.name.localeCompare(b.name) };
    return list.sort(sorters[f.sort] || sorters.featured);
  }
  function renderGrid(changed = []) {
    const list = filtered(); const grid = $("#productGrid");
    const show = list.slice(0, state.filter.shown);
    grid.innerHTML = show.map((p, i) => cardHTML(p, changed, i < 12)).join("");
    $("#gridEmpty").hidden = list.length > 0;
    $("#resultCount").textContent = list.length ? `Showing ${show.length} of ${list.length} gifts${state.filter.cat !== "all" ? " in " + state.filter.cat : ""}${state.filter.q ? ` for “${state.filter.q}”` : ""}` : "";
    $("#loadMore").hidden = show.length >= list.length;
  }
  $("#loadMore").addEventListener("click", () => { state.filter.shown += 24; renderGrid(); });
  $("#sortSelect").addEventListener("change", (e) => { state.filter.sort = e.target.value; renderGrid(); });
  $("#seasonOnly").addEventListener("change", (e) => { state.filter.seasonOnly = e.target.checked; state.filter.shown = 24; renderGrid(); });
  let searchT; $("#searchInput").addEventListener("input", (e) => { clearTimeout(searchT); searchT = setTimeout(() => { state.filter.q = e.target.value; state.filter.shown = 24; renderGrid(); if (e.target.value) $("#shop").scrollIntoView({ behavior: "smooth", block: "start" }); }, 220); });
  $("#clearFilters").addEventListener("click", () => { state.filter = { ...state.filter, cat: "all", q: "", seasonOnly: false, shown: 24 }; $("#searchInput").value = ""; $("#seasonOnly").checked = false; renderChips(); renderGrid(); });

  // 3D tilt on cards (pointer only)
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest && e.target.closest(".card"); if (!card || e.pointerType !== "mouse") return;
    const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `translateY(-6px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg)`;
  });
  document.addEventListener("pointerout", (e) => { const card = e.target.closest && e.target.closest(".card"); if (card) card.style.transform = ""; });

  /* ---- delivery cards ---- */
  function renderDelivery() {
    const ic = { pickup: "🏪", express: "🛵", courier: "📦" };
    $("#deliveryCards").innerHTML = state.catalog.delivery.map((d) => `<div class="dcard"><span class="d-ic">${ic[d.key] || "🚚"}</span><div><strong>${esc(d.label)}</strong><span class="d-meta">${esc(d.eta)} · <span class="d-charge">${d.charge ? inr(d.charge) : "Free"}</span></span><p class="tiny">${esc(d.description)}</p></div></div>`).join("");
  }

  /* ---- reviews slideshow ---- */
  function renderReviews() {
    const list = state.catalog.feedback; const track = $("#reviewTrack"), dots = $("#reviewDots");
    clearInterval(state.reviewTimer); track.innerHTML = ""; dots.innerHTML = "";
    if (!list.length) {
      track.innerHTML = `<div class="review-empty"><div class="stars-row" aria-hidden="true">★★★★★</div><h3>Be our first reviewer</h3><p>Verified customer reviews appear here as orders are delivered. Ordered from us already? Tell everyone how it turned out.</p><button class="btn btn-primary" type="button" id="reviewEmptyBtn">Write a review</button></div>`;
      $("#reviewEmptyBtn").addEventListener("click", () => open("feedback"));
      return;
    }
    list.forEach((f, i) => {
      const p = state.byId.get(f.productId);
      const el = document.createElement("article"); el.className = "review" + (i === 0 ? " on" : "");
      el.innerHTML = `<div class="avatar" aria-hidden="true">${esc(f.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase())}</div>
        <div><div class="stars-row" aria-label="${f.rating} out of 5">${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}</div>
        <blockquote>“${esc(f.text)}”</blockquote>
        <p class="who"><strong>${esc(f.name)}</strong>${f.city ? ", " + esc(f.city) : ""}${p ? ` · bought <a href="#" data-open="${p.id}">${esc(p.name)}</a>` : ""}${f.date ? ` · ${esc(f.date)}` : ""}</p></div>`;
      track.appendChild(el);
      const d = document.createElement("button"); d.setAttribute("aria-label", `Review ${i + 1}`); if (i === 0) d.className = "on";
      d.addEventListener("click", () => goReview(i, true)); dots.appendChild(d);
    });
    state.reviewIndex = 0; state.reviewTimer = setInterval(() => goReview((state.reviewIndex + 1) % list.length), 5200);
  }
  function goReview(i, manual) {
    const els = $$("#reviewTrack .review"), dots = $$("#reviewDots button");
    els.forEach((e, k) => e.classList.toggle("on", k === i)); dots.forEach((d, k) => d.classList.toggle("on", k === i)); state.reviewIndex = i;
    if (manual) { clearInterval(state.reviewTimer); state.reviewTimer = setInterval(() => goReview((state.reviewIndex + 1) % els.length), 5200); }
  }

  /* ------------------------------------------------------------ overlays */
  const overlays = { cart: $("#cartDrawer"), product: $("#productModal"), checkout: $("#checkoutModal"), feedback: $("#feedbackModal"), orders: $("#ordersModal") };
  function open(name) { Object.entries(overlays).forEach(([k, el]) => { if (k !== name && k !== "cart") el.hidden = true; }); overlays[name].hidden = false; if (name === "cart") $("#backdrop").hidden = false; document.body.style.overflow = "hidden"; }
  function close(name) { overlays[name].hidden = true; if (name === "cart") $("#backdrop").hidden = true; if (Object.values(overlays).every((el) => el.hidden)) document.body.style.overflow = ""; }
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-close]"); if (c) { close(c.dataset.close); return; }
    if (e.target.classList.contains("modal")) { const name = Object.keys(overlays).find((k) => overlays[k] === e.target); if (name) close(name); }
    const o = e.target.closest("[data-open]"); if (o) { e.preventDefault(); openProduct(o.dataset.open); return; }
    const a = e.target.closest("[data-add]"); if (a) { addToCart(a.dataset.add, 1, "", [], a); }
  });
  $("#backdrop").addEventListener("click", () => close("cart"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") Object.keys(overlays).forEach(close); });
  $("#cartBtn").addEventListener("click", () => open("cart"));
  $("#ordersBtn").addEventListener("click", () => { renderMyOrders(); open("orders"); });
  $("#feedbackOpen").addEventListener("click", () => open("feedback"));

  /* ---- product modal ---- */
  function openProduct(id) {
    const p = state.byId.get(id); if (!p) return;
    state.pm = { product: p, photos: [] };
    $("#pmImage").src = p.image; $("#pmImage").alt = p.name; $("#pmCat").textContent = p.category; $("#pmTitle").textContent = p.name;
    $("#pmId").textContent = p.id; $("#pmSize").textContent = p.size || "Standard size";
    $("#pmPrice").textContent = inr(p.price); $("#pmMrp").textContent = p.mrp > p.price ? inr(p.mrp) : ""; $("#pmOff").textContent = p.mrp > p.price ? `${Math.round(((p.mrp - p.price) / p.mrp) * 100)}% off` : "";
    $("#pmDesc").textContent = p.description || "Personalised with your photo, name or message."; $("#pmBadge").hidden = !p.badge; $("#pmBadge").textContent = p.badge;
    $("#pmNote").value = ""; $("#pmPhotos").value = ""; $("#pmThumbs").innerHTML = ""; $("#pmQty").value = 1; $("#pmQty").max = p.maxQty; $("#pmMax").textContent = `Max ${p.maxQty.toLocaleString("en-IN")} pieces per order`;
    $("#pmStock").textContent = p.inStock ? `${p.availability || "Made to order"}${p.leadTime ? " · ready in " + p.leadTime : ""}` : "Currently out of stock"; $("#pmStock").classList.toggle("oos", !p.inStock);
    $("#pmQty").value = p.minQty || 1; $("#pmQty").min = p.minQty || 1;
    $("#pmAdd").disabled = !p.inStock; $("#pmBuy").disabled = !p.inStock;
    open("product");
  }
  $$("#productModal .qty button").forEach((b) => b.addEventListener("click", () => { const i = $("#pmQty"); i.value = clampQty(Number(i.value) + Number(b.dataset.q), state.pm.product.maxQty); }));
  $("#pmQty").addEventListener("change", (e) => { e.target.value = clampQty(e.target.value, state.pm.product.maxQty); });
  function clampQty(v, max, min = 1) { v = Math.floor(Number(v) || 1); return Math.min(Math.max(min || 1, v), max || 1000); }
  $("#pmPhotos").addEventListener("change", async (e) => {
    const files = [...e.target.files].slice(0, 6); state.pm.photos = [];
    $("#pmThumbs").innerHTML = "";
    for (const f of files) {
      try { const url = await shrinkImage(f, 1400); state.pm.photos.push(url); const img = document.createElement("img"); img.src = url; img.alt = ""; $("#pmThumbs").appendChild(img); } catch {}
    }
    if (files.length) toast(`${state.pm.photos.length} photo${state.pm.photos.length > 1 ? "s" : ""} attached`);
  });
  function shrinkImage(file, max) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.86)); };
      img.onerror = rej; img.src = url;
    });
  }
  $("#pmAdd").addEventListener("click", () => { const p = state.pm.product; addToCart(p.id, Number($("#pmQty").value), $("#pmNote").value, state.pm.photos, $("#pmAdd")); close("product"); });
  $("#pmBuy").addEventListener("click", () => { const p = state.pm.product; addToCart(p.id, Number($("#pmQty").value), $("#pmNote").value, state.pm.photos, $("#pmBuy"), true); close("product"); startCheckout(); });

  /* ------------------------------------------------------------ cart */
  function saveCart() { store.set("yn.cart", state.cart); }
  function addToCart(id, qty, note, photos, fromEl, quiet) {
    const p = state.byId.get(id); if (!p || !p.inStock) return;
    qty = clampQty(qty, p.maxQty);
    const key = id + "|" + (note || "").trim();
    const existing = state.cart.find((it) => it.key === key);
    if (existing) { existing.qty = clampQty(existing.qty + qty, p.maxQty); if (photos && photos.length) existing.photos = photos; }
    else state.cart.push({ key, id, name: p.name, price: p.price, image: p.image, qty, note: (note || "").trim(), photos: photos || [], maxQty: p.maxQty });
    saveCart(); renderCart();
    if (!quiet) { toast(`${p.name} added to cart`, "good"); flyToCart(fromEl, p.image); }
    const cc = $("#cartCount"); cc.classList.add("bump"); setTimeout(() => cc.classList.remove("bump"), 350);
  }
  function flyToCart(fromEl, src) {
    if (!fromEl || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const from = fromEl.getBoundingClientRect(), to = $("#cartBtn").getBoundingClientRect();
    const img = document.createElement("img"); img.src = src; img.className = "fly"; img.style.left = from.left + from.width / 2 - 30 + "px"; img.style.top = from.top - 30 + "px";
    document.body.appendChild(img);
    requestAnimationFrame(() => { img.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - from.top}px) scale(.2)`; img.style.opacity = "0"; });
    setTimeout(() => img.remove(), 900);
  }
  function cartTotals() {
    const subtotal = state.cart.reduce((a, it) => a + it.qty * it.price, 0);
    const se = state.catalog && state.catalog.season; let discount = 0;
    if (state.promo && se && se.promoCode && state.promo.toUpperCase() === se.promoCode.toUpperCase()) discount = Math.round((subtotal * se.discountPercent) / 100);
    return { subtotal, discount };
  }
  function renderCart() {
    const n = state.cart.reduce((a, it) => a + it.qty, 0); $("#cartCount").textContent = n > 999 ? "999+" : n; $("#mbCount").textContent = n > 99 ? "99+" : n; $("#mbCount").hidden = !n;
    const body = $("#cartItems");
    if (!state.cart.length) body.innerHTML = `<div class="empty"><p>Your cart is empty. Add a gift and personalise it.</p><button class="btn btn-primary" data-close="cart" type="button">Start shopping</button></div>`;
    else body.innerHTML = state.cart.map((it, i) => `<div class="cart-item">
        <img src="${it.image}" alt="">
        <div><div class="ci-name">${esc(it.name)}</div>${it.note ? `<div class="ci-note">✎ ${esc(it.note)}</div>` : ""}${it.photos.length ? `<div class="ci-note">📷 ${it.photos.length} photo${it.photos.length > 1 ? "s" : ""}</div>` : ""}
          <div class="qty sm" style="margin-top:.35rem"><button type="button" data-cq="-1" data-i="${i}">−</button><input type="number" value="${it.qty}" min="1" max="${it.maxQty}" data-ci="${i}"><button type="button" data-cq="1" data-i="${i}">+</button></div></div>
        <div style="text-align:right;display:grid;gap:.3rem"><span class="ci-price">${inr(it.qty * it.price)}</span><span class="tiny">${inr(it.price)} each</span><button class="ci-remove" type="button" data-rm="${i}">Remove</button></div></div>`).join("");
    const t = cartTotals(); $("#cartSubtotal").textContent = inr(t.subtotal);
    $("#discountRow").hidden = !t.discount; $("#cartDiscount").textContent = "−" + inr(t.discount);
    $("#checkoutBtn").disabled = !state.cart.length; $("#promoInput").value = state.promo || "";
    if (state.promo) { const ok = t.discount > 0; $("#promoMsg").textContent = ok ? `Code ${state.promo.toUpperCase()} applied` : `Code ${state.promo.toUpperCase()} is not valid this season`; $("#promoMsg").className = "promo-msg " + (ok ? "ok" : "err"); }
    else { $("#promoMsg").textContent = ""; }
    const s = state.catalog && state.catalog.settings;
    if (s) $("#cartHint").textContent = `Pay ${s.advance_percent || 20}% advance (min ${inr(s.advance_min || 200)}) now. Up to 1000 pieces per gift.`;
  }
  $("#cartItems").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]"); if (rm) { state.cart.splice(Number(rm.dataset.rm), 1); saveCart(); renderCart(); return; }
    const q = e.target.closest("[data-cq]"); if (q) { const it = state.cart[Number(q.dataset.i)]; it.qty = clampQty(it.qty + Number(q.dataset.cq), it.maxQty); saveCart(); renderCart(); }
  });
  $("#cartItems").addEventListener("change", (e) => { const i = e.target.dataset.ci; if (i == null) return; const it = state.cart[Number(i)]; it.qty = clampQty(e.target.value, it.maxQty); saveCart(); renderCart(); });
  $("#promoApply").addEventListener("click", () => { state.promo = $("#promoInput").value.trim().toUpperCase(); store.set("yn.promo", state.promo); renderCart(); });
  $("#promoCopy").addEventListener("click", (e) => { const code = $("#promoCode").textContent; state.promo = code; store.set("yn.promo", code); renderCart(); copyText(code, e.currentTarget); });
  $("#checkoutBtn").addEventListener("click", () => { close("cart"); startCheckout(); });

  /* ------------------------------------------------------------ checkout */
  function setStep(n) {
    for (let i = 1; i <= 5; i++) $(`#step${i}`).hidden = i !== n;
    $$("#stepper li").forEach((li, i) => { li.classList.toggle("on", i + 1 === n); li.classList.toggle("done", i + 1 < n); });
    $("#checkoutModal .modal-card").scrollTop = 0;
  }
  function startCheckout() {
    if (!state.cart.length) { toast("Your cart is empty"); return; }
    const saved = store.get("yn.customer", {});
    ["name", "phone", "email", "address", "city", "pincode"].forEach((k) => { const el = $("#c" + (k === "pincode" ? "Pin" : k[0].toUpperCase() + k.slice(1))); if (el && saved[k]) el.value = saved[k]; });
    $("#orderError").hidden = true; setStep(1); open("checkout");
  }
  $$("#checkoutModal [data-step]").forEach((b) => b.addEventListener("click", () => setStep(Number(b.dataset.step))));
  $("#step1").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = customer(); store.set("yn.customer", c);
    const d = state.catalog.delivery; const el = $("#deliveryOptions");
    const sub = cartTotals().subtotal;
    el.innerHTML = d.map((o, i) => { const free = o.key === "express" && sub >= 999; return `<label class="dopt"><input type="radio" name="delivery" value="${esc(o.key)}" ${i === 0 ? "checked" : ""}><span><strong>${esc(o.label)}</strong><small>${esc(o.eta)} · ${esc(o.description)}</small></span><span class="d-price">${free ? "Free" : o.charge ? inr(o.charge) : "Free"}</span></label>`; }).join("");
    setStep(2);
  });
  function customer() { return { name: $("#cName").value.trim(), phone: $("#cPhone").value.trim(), email: $("#cEmail").value.trim(), address: $("#cAddress").value.trim(), city: $("#cCity").value.trim(), pincode: $("#cPin").value.trim(), notes: $("#cNotes").value.trim() }; }
  function deliveryChoice() { const key = ($("input[name=delivery]:checked") || {}).value; const d = state.catalog.delivery.find((x) => x.key === key) || state.catalog.delivery[0]; const sub = cartTotals().subtotal; const charge = d.key === "express" && sub >= 999 ? 0 : d.charge; return { ...d, charge }; }
  function quote() {
    const t = cartTotals(); const d = deliveryChoice(); const s = state.catalog.settings;
    const grand = t.subtotal - t.discount + d.charge;
    const advance = Math.min(grand, Math.max(Number(s.advance_min) || 200, Math.round((grand * (Number(s.advance_percent) || 20)) / 100)));
    return { ...t, delivery: d, grand, advance, balance: grand - advance };
  }
  $("#toReview").addEventListener("click", () => {
    const q = quote(), c = customer();
    $("#reviewBox").innerHTML = `<table><thead><tr><th>Gift</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>
      ${state.cart.map((it) => `<tr><td>${esc(it.name)}${it.note ? `<br><span class="tiny">✎ ${esc(it.note)}</span>` : ""}${it.photos.length ? `<br><span class="tiny">📷 ${it.photos.length} photo(s)</span>` : ""}</td><td class="num">${it.qty}</td><td class="num">${inr(it.qty * it.price)}</td></tr>`).join("")}
      <tr><td colspan="2">Subtotal</td><td class="num">${inr(q.subtotal)}</td></tr>
      ${q.discount ? `<tr><td colspan="2">Discount (${esc(state.promo)})</td><td class="num">−${inr(q.discount)}</td></tr>` : ""}
      <tr><td colspan="2">${esc(q.delivery.label)}</td><td class="num">${q.delivery.charge ? inr(q.delivery.charge) : "Free"}</td></tr>
      <tr class="grand"><td colspan="2">Order total</td><td class="num">${inr(q.grand)}</td></tr>
      <tr><td colspan="2">Advance payable now</td><td class="num" style="color:var(--good);font-weight:800">${inr(q.advance)}</td></tr></tbody></table>
      <div class="addr"><strong>${esc(c.name)}</strong> · ${esc(c.phone)}${c.email ? " · " + esc(c.email) : ""}<br>${esc(c.address)}, ${esc(c.city)} – ${esc(c.pincode)}${c.notes ? `<br><span class="tiny">Note: ${esc(c.notes)}</span>` : ""}</div>
      <p class="tiny">${esc(state.catalog.settings.gst_note || "")}</p>`;
    setStep(3);
  });
  $("#toPay").addEventListener("click", () => {
    const q = quote(), s = state.catalog.settings;
    $("#payAdvance").textContent = inr(q.advance); $("#payTotal").textContent = inr(q.grand); $("#payBalance").textContent = inr(q.balance);
    if (s.upi_id) {
      $("#upiId").textContent = s.upi_id; $("#upiRow").querySelector(".chip-copy").hidden = false; $("#upiLink").hidden = false;
      $("#upiLink").href = `upi://pay?pa=${encodeURIComponent(s.upi_id)}&pn=${encodeURIComponent(s.upi_payee_name || s.store_name || "Younick Gifts")}&am=${q.advance}&cu=INR&tn=${encodeURIComponent("Younick advance")}`;
    } else { $("#upiId").innerHTML = todo("UPI ID"); $("#upiRow").querySelector(".chip-copy").hidden = true; $("#upiLink").hidden = true; }
    $("#payNote").textContent = `The shop verifies the advance and confirms your order by ${s.whatsapp ? "WhatsApp" : "email"}. No card details are collected on this site.`;
    setStep(4);
  });
  $("#confirmOrder").addEventListener("click", async () => {
    const btn = $("#confirmOrder"); btn.disabled = true; btn.textContent = "Placing order…"; $("#orderError").hidden = true;
    const c = customer(); const q = quote();
    const payload = { customer: c, notes: c.notes, items: state.cart.map((it) => ({ id: it.id, qty: it.qty, note: it.note, photos: it.photos })), deliveryKey: q.delivery.key, promoCode: state.promo, payment: { mode: "UPI QR", reference: $("#payRef").value.trim() } };
    try {
      let order;
      if (state.mode === "server") {
        const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error((data.errors || ["Could not place the order"]).join(". "));
        order = data.order;
      } else {
        order = { id: `YN-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`, createdAt: new Date().toISOString(), status: "Preview order (send on WhatsApp to confirm)", customer: c, items: state.cart.map((it) => ({ id: it.id, name: it.name, price: it.price, qty: it.qty, note: it.note, photos: it.photos.map((_, i) => `photo-${i + 1}`) })), delivery: { key: q.delivery.key, label: q.delivery.label, charge: q.delivery.charge, eta: q.delivery.eta }, promoCode: q.discount ? state.promo : "", totals: { subtotal: q.subtotal, discount: q.discount, grand: q.grand }, payment: { mode: "UPI QR", reference: $("#payRef").value.trim(), advance: q.advance, balance: q.balance }, notes: c.notes };
      }
      if (state.mode !== "server" && state.db) {
        try { await state.db.collection("orders").doc(order.id).set(order); order.status = "Saved to preview order book"; order.savedToPreview = true; } catch {}
      }
      const mine = store.get("yn.orders", []); mine.unshift({ ...order, items: order.items.map((it) => ({ ...it, photos: (it.photos || []).length })) }); store.set("yn.orders", mine.slice(0, 20));
      state.cart = []; state.promo = ""; saveCart(); store.set("yn.promo", ""); renderCart();
      renderSuccess(order); setStep(5); confetti();
    } catch (err) {
      $("#orderError").textContent = err.message; $("#orderError").hidden = false;
    } finally { btn.disabled = false; btn.textContent = "I have paid · Confirm order"; }
  });
  function orderText(o) {
    const lines = [`*Younick Gifts order ${o.id}*`, `Name: ${o.customer.name}`, `Phone: ${o.customer.phone}`, `Address: ${o.customer.address}, ${o.customer.city} - ${o.customer.pincode}`, ``, `Items:`];
    o.items.forEach((it) => lines.push(`• ${it.name} × ${it.qty} = ₹${it.qty * it.price}${it.note ? ` (${it.note})` : ""}${it.photos && it.photos.length ? ` [${typeof it.photos === "number" ? it.photos : it.photos.length} photo(s) to share]` : ""}`));
    lines.push(``, `Delivery: ${o.delivery.label} (₹${o.delivery.charge})`);
    if (o.totals.discount) lines.push(`Discount ${o.promoCode}: -₹${o.totals.discount}`);
    lines.push(`Total: ₹${o.totals.grand}`, `Advance paid: ₹${o.payment.advance}${o.payment.reference ? ` (ref ${o.payment.reference})` : ""}`, `Balance: ₹${o.payment.balance}`);
    if (o.notes) lines.push(`Notes: ${o.notes}`);
    return lines.join("\n");
  }
  function renderSuccess(o) {
    const s = state.catalog.settings; const txt = orderText(o);
    const sendHref = s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(txt)}` : mailto(`Younick Gifts order ${o.id}`, txt);
    const sendLabel = s.whatsapp ? "Send on WhatsApp" : "Send by email";
    $("#successBox").innerHTML = `<div class="big">🎉</div><h3>${state.mode === "server" ? "Order placed!" : "Order ready to send!"}</h3>
      <p>${state.mode === "server" ? "We have saved your order. The shop will verify the advance and confirm by " + (s.whatsapp ? "WhatsApp" : "email") + "." : o.savedToPreview ? "Your order is saved in the preview order book. Send it to the shop too so they can confirm the advance." : "This is the preview build, so send the order to the shop to confirm it."}</p>
      <div class="oid">${esc(o.id)}</div>
      <p class="tiny">Total ${inr(o.totals.grand)} · advance ${inr(o.payment.advance)} · balance ${inr(o.payment.balance)} · ${esc(o.delivery.label)}</p>
      ${o.items.some((it) => (typeof it.photos === "number" ? it.photos : (it.photos || []).length)) && state.mode !== "server" ? `<p class="tiny">Attach your photos in the ${s.whatsapp ? "WhatsApp chat" : "email"} after sending the order.</p>` : ""}
      <div class="acts"><a class="btn btn-primary btn-lg" href="${sendHref}" target="_blank" rel="noopener">${sendLabel}</a><button class="btn btn-ghost" type="button" id="copyOrder">Copy order details</button><button class="btn btn-ghost" type="button" data-close="checkout">Continue shopping</button></div>
      <textarea readonly id="orderTextArea">${esc(txt)}</textarea>`;
    $("#copyOrder").addEventListener("click", (e) => copyText(txt, e.currentTarget));
  }
  function renderMyOrders() {
    const mine = store.get("yn.orders", []);
    $("#ordersList").innerHTML = mine.length ? mine.map((o) => `<div class="order-row"><strong>${esc(o.id)}</strong> · ${new Date(o.createdAt).toLocaleString("en-IN")}<br>${o.items.map((it) => `${esc(it.name)} × ${it.qty}`).join(", ")}<br>Total ${inr(o.totals.grand)} · advance ${inr(o.payment.advance)} · <em>${esc(o.status)}</em></div>`).join("") : `<p class="tiny">No orders on this device yet.</p>`;
  }

  /* ------------------------------------------------------------ feedback */
  let fbRating = 5;
  $("#fbStars").addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (!b) return; fbRating = Number(b.dataset.r); $$("#fbStars button").forEach((x) => x.classList.toggle("on", Number(x.dataset.r) <= fbRating)); });
  $("#feedbackForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: $("#fbName").value.trim(), city: $("#fbCity").value.trim(), rating: fbRating, text: $("#fbText").value.trim() };
    if (state.mode === "server") {
      try { const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); $("#fbMsg").textContent = d.message || (d.errors || []).join(", "); if (d.ok) { toast("Thanks for the feedback!", "good"); setTimeout(() => close("feedback"), 1200); } } catch { $("#fbMsg").textContent = "Could not send right now."; }
    } else {
      const s = state.catalog.settings; const txt = `Feedback from ${body.name}${body.city ? " (" + body.city + ")" : ""} – ${"★".repeat(body.rating)}: ${body.text}`;
      const href = s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(txt)}` : mailto("Feedback for Younick Gifts", txt);
      const a = document.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
      $("#fbMsg").textContent = `Opened ${s.whatsapp ? "WhatsApp" : "your email app"} with your feedback (preview mode).`;
    }
  });

  /* ------------------------------------------------------------ effects */
  function reveal() {
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = $$(".reveal"); els.forEach((el) => { if (el.getBoundingClientRect().top > innerHeight) el.classList.add("pre"); });
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.remove("pre"); en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.08 });
    els.forEach((el) => io.observe(el));
  }
  function particles() {
    const cv = $("#heroParticles"); if (!cv || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d"); let W, H, items = [], raf;
    const theme = () => (document.body.dataset.season || "festive");
    const palette = () => { const cs = getComputedStyle(root); return [cs.getPropertyValue("--sa").trim() || "#f59e0b", cs.getPropertyValue("--sb").trim() || "#c2185b", "#ffffff"]; };
    function resize() { W = cv.width = cv.offsetWidth * devicePixelRatio; H = cv.height = cv.offsetHeight * devicePixelRatio; }
    function spawn() { const t = theme(); return { x: Math.random() * W, y: H + 20, r: (2 + Math.random() * 4) * devicePixelRatio, vy: (0.25 + Math.random() * 0.7) * devicePixelRatio, vx: (Math.random() - 0.5) * 0.3 * devicePixelRatio, a: 0.3 + Math.random() * 0.6, c: palette()[Math.floor(Math.random() * 3)], k: t, tw: Math.random() * Math.PI * 2 }; }
    function draw(p) {
      ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(p.tw)); ctx.fillStyle = p.c;
      if (p.k === "valentine") { const r = p.r; ctx.beginPath(); ctx.moveTo(p.x, p.y + r); ctx.bezierCurveTo(p.x - r * 1.6, p.y - r * 0.4, p.x - r * 0.6, p.y - r * 1.6, p.x, p.y - r * 0.6); ctx.bezierCurveTo(p.x + r * 0.6, p.y - r * 1.6, p.x + r * 1.6, p.y - r * 0.4, p.x, p.y + r); ctx.fill(); }
      else if (p.k === "newyear" || p.k === "birthday") { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.tw); ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); if (p.r > 4 * devicePixelRatio) { ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2); ctx.fill(); } }
    }
    function tick() {
      ctx.clearRect(0, 0, W, H);
      if (items.length < 70 && Math.random() < 0.5) items.push(spawn());
      items = items.filter((p) => p.y > -30);
      for (const p of items) { p.y -= p.vy; p.x += p.vx + Math.sin(p.tw) * 0.2; p.tw += 0.03; draw(p); }
      raf = requestAnimationFrame(tick);
    }
    resize(); addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else tick(); });
    tick();
  }
  function confetti() {
    const cv = $("#confetti"); if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d"); cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
    const cs = getComputedStyle(root); const cols = [cs.getPropertyValue("--sa").trim(), cs.getPropertyValue("--sb").trim(), "#7c3aed", "#22c55e", "#f97316"];
    const bits = Array.from({ length: 160 }, () => ({ x: cv.width / 2, y: cv.height / 2.5, vx: (Math.random() - 0.5) * 18 * devicePixelRatio, vy: (Math.random() * -14 - 4) * devicePixelRatio, r: (4 + Math.random() * 6) * devicePixelRatio, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3 }));
    let frames = 0;
    (function loop() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const b of bits) { b.x += b.vx; b.y += b.vy; b.vy += 0.35 * devicePixelRatio; b.vx *= 0.99; b.a += b.va; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = b.c; ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2); ctx.restore(); }
      if (++frames < 150) requestAnimationFrame(loop); else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  /* ------------------------------------------------------------ mobile bar, back to top */
  $("#mbCart").addEventListener("click", () => open("cart"));
  const backTop = $("#backTop");
  addEventListener("scroll", () => { backTop.hidden = scrollY < 900; }, { passive: true });
  backTop.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));

  /* ------------------------------------------------------------ boot */
  (async () => {
    try {
      const cat = await loadCatalog();
      applyCatalog(cat, { silent: true });
      connectLive(); reveal(); particles();
      if (location.hash && /^#[A-Z]{2,4}-\d+$/.test(location.hash)) openProduct(location.hash.slice(1));
    } catch (err) {
      $("#productGrid").innerHTML = `<div class="empty"><p>Could not load the catalogue. ${esc(err.message)}.<br>Start the server with <code>npm start</code> or open the built preview.</p></div>`;
    }
  })();
})();
