/**
 * Younick Gifts marketplace server
 * - Serves the storefront from /public
 * - Reads the owner's Excel workbook (data/younick-catalog.xlsx) and exposes it as /api/catalog
 * - Watches the workbook; every save is pushed to open browsers over Server-Sent Events
 * - Accepts orders (POST /api/orders) -> data/orders.xlsx + data/orders.json (+ uploaded photos)
 */
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const WORKBOOK = process.env.YOUNICK_WORKBOOK || path.join(DATA, "younick-catalog.xlsx");
const ORDERS_JSON = path.join(DATA, "orders.json");
const ORDERS_XLSX = path.join(DATA, "orders.xlsx");
const FEEDBACK_PENDING = path.join(DATA, "feedback-pending.json");
const UPLOADS = path.join(DATA, "uploads");
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "younick-admin";

const app = express();
app.use(express.json({ limit: "25mb" }));

/* ------------------------------------------------------------------ catalog */
const { loadCatalog: readWorkbook, num, str } = require("./lib/catalog");
let catalog = null;
let catalogVersion = 0;
function loadCatalog() {
  catalogVersion += 1;
  catalog = { ...readWorkbook(WORKBOOK, { version: catalogVersion, pendingFeedbackPath: FEEDBACK_PENDING }), mode: "server" };
  return catalog;
}

/* ---------------------------------------------------------------- watching */
const sseClients = new Set();
function broadcast(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) res.write(line);
}
let reloadTimer = null;
function scheduleReload(reason) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    try {
      loadCatalog();
      console.log(`[catalog] reloaded (${reason}) -> v${catalog.version}, ${catalog.products.length} products`);
      broadcast({ type: "catalog", version: catalog.version });
    } catch (e) {
      console.warn("[catalog] reload failed, keeping previous version:", e.message);
    }
  }, 400);
}
fs.watchFile(WORKBOOK, { interval: 1500 }, (cur, prev) => {
  if (cur.mtimeMs !== prev.mtimeMs && cur.size > 0) scheduleReload("workbook saved");
});
try { fs.watch(path.dirname(WORKBOOK), (ev, f) => { if (f && f === path.basename(WORKBOOK)) scheduleReload("file event"); }); } catch {}

/* --------------------------------------------------------------------- api */
app.get("/api/catalog", (req, res) => {
  if (!catalog) loadCatalog();
  res.set("Cache-Control", "no-store");
  res.json(catalog);
});

app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: "hello", version: catalog ? catalog.version : 0 })}\n\n`);
  sseClients.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => { clearInterval(ping); sseClients.delete(res); });
});

function readOrders() {
  try { return JSON.parse(fs.readFileSync(ORDERS_JSON, "utf8")); } catch { return []; }
}
function writeOrders(orders) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(ORDERS_JSON, JSON.stringify(orders, null, 2));
  // Flat sheet for the owner: one row per line item
  const rows = [];
  for (const o of orders) {
    for (const it of o.items) {
      rows.push({
        OrderID: o.id, Date: o.createdAt, Status: o.status, Customer: o.customer.name, Phone: o.customer.phone, Email: o.customer.email,
        Address: `${o.customer.address}, ${o.customer.city} - ${o.customer.pincode}`, Delivery: o.delivery.label, DeliveryCharge: o.delivery.charge,
        ProductID: it.id, Product: it.name, Qty: it.qty, UnitPrice: it.price, LineTotal: it.qty * it.price, Personalisation: it.note || "", Photos: (it.photos || []).join(" | "),
        Subtotal: o.totals.subtotal, Discount: o.totals.discount, PromoCode: o.promoCode || "", GrandTotal: o.totals.grand, AdvancePaid: o.payment.advance, BalanceDue: o.payment.balance,
        PaymentRef: o.payment.reference || "", PaymentMode: o.payment.mode, Notes: o.notes || "",
      });
    }
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0] || { a: 1 }).map((k) => ({ wch: Math.min(40, Math.max(10, k.length + 6)) }));
  XLSX.utils.book_append_sheet(wb, ws, "Orders");
  const summary = orders.map((o) => ({ OrderID: o.id, Date: o.createdAt, Status: o.status, Customer: o.customer.name, Phone: o.customer.phone, Items: o.items.reduce((a, b) => a + b.qty, 0), GrandTotal: o.totals.grand, AdvancePaid: o.payment.advance, BalanceDue: o.payment.balance, Delivery: o.delivery.label }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
  XLSX.writeFile(wb, ORDERS_XLSX);
}

function makeOrderId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `YN-${stamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

app.post("/api/orders", (req, res) => {
  if (!catalog) loadCatalog();
  const b = req.body || {};
  const c = b.customer || {};
  const errors = [];
  if (!str(c.name)) errors.push("Name is required");
  if (!/^[6-9]\d{9}$/.test(str(c.phone))) errors.push("Enter a valid 10-digit Indian mobile number");
  if (c.email && !/^\S+@\S+\.\S+$/.test(str(c.email))) errors.push("Email looks invalid");
  if (!str(c.address)) errors.push("Address is required");
  if (!str(c.city)) errors.push("City is required");
  if (!/^\d{6}$/.test(str(c.pincode))) errors.push("PIN code must be 6 digits");
  if (!Array.isArray(b.items) || b.items.length === 0) errors.push("Cart is empty");

  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const items = [];
  for (const it of b.items || []) {
    const p = byId.get(str(it.id));
    if (!p) { errors.push(`Unknown product ${it.id}`); continue; }
    if (!p.inStock) errors.push(`${p.name} is out of stock`);
    const qty = Math.floor(num(it.qty, 0));
    if (qty < 1) errors.push(`Quantity for ${p.name} must be at least 1`);
    if (qty > p.maxQty) errors.push(`Maximum ${p.maxQty} pieces of ${p.name} per order`);
    items.push({ id: p.id, name: p.name, price: p.price, qty, note: str(it.note).slice(0, 500), photos: [], rawPhotos: Array.isArray(it.photos) ? it.photos.slice(0, 6) : [] });
  }
  const delivery = catalog.delivery.find((d) => d.key === str(b.deliveryKey).toLowerCase());
  if (!delivery) errors.push("Choose a delivery option");
  if (errors.length) return res.status(400).json({ ok: false, errors });

  const subtotal = items.reduce((a, it) => a + it.qty * it.price, 0);
  let discount = 0;
  const promo = str(b.promoCode).toUpperCase();
  if (promo && catalog.season && catalog.season.promoCode && promo === catalog.season.promoCode.toUpperCase()) {
    discount = Math.round((subtotal * catalog.season.discountPercent) / 100);
  }
  const grand = subtotal - discount + delivery.charge;
  const advPct = num(catalog.settings.advance_percent, 20);
  const advMin = num(catalog.settings.advance_min, 200);
  const advance = Math.min(grand, Math.max(advMin, Math.round((grand * advPct) / 100)));

  const id = makeOrderId();
  // store uploaded personalisation photos (data URLs) on disk
  for (const it of items) {
    it.rawPhotos.forEach((dataUrl, i) => {
      const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(String(dataUrl));
      if (!m) return;
      const buf = Buffer.from(m[3], "base64");
      if (buf.length > 8 * 1024 * 1024) return;
      const dir = path.join(UPLOADS, id);
      fs.mkdirSync(dir, { recursive: true });
      const file = `${it.id}-${i + 1}.${m[2] === "jpeg" ? "jpg" : m[2]}`;
      fs.writeFileSync(path.join(dir, file), buf);
      it.photos.push(`data/uploads/${id}/${file}`);
    });
    delete it.rawPhotos;
  }

  const order = {
    id, createdAt: new Date().toISOString(), status: "Awaiting payment confirmation",
    customer: { name: str(c.name), phone: str(c.phone), email: str(c.email), address: str(c.address), city: str(c.city), pincode: str(c.pincode) },
    items, delivery: { key: delivery.key, label: delivery.label, charge: delivery.charge, eta: delivery.eta },
    promoCode: discount ? promo : "", totals: { subtotal, discount, grand },
    payment: { mode: str(b.payment && b.payment.mode) || "UPI QR", reference: str(b.payment && b.payment.reference).slice(0, 60), advance, balance: grand - advance },
    notes: str(b.notes).slice(0, 500), season: catalog.season ? catalog.season.key : "",
  };
  const orders = readOrders();
  orders.push(order);
  writeOrders(orders);
  console.log(`[order] ${id} ${order.customer.name} ₹${grand} (advance ₹${advance})`);
  res.json({ ok: true, order });
});

app.post("/api/feedback", (req, res) => {
  const b = req.body || {};
  if (!str(b.name) || !str(b.text)) return res.status(400).json({ ok: false, errors: ["Name and feedback text are required"] });
  let list = [];
  try { list = JSON.parse(fs.readFileSync(FEEDBACK_PENDING, "utf8")); } catch {}
  list.push({ name: str(b.name).slice(0, 60), city: str(b.city).slice(0, 40), rating: Math.min(5, Math.max(1, num(b.rating, 5))), text: str(b.text).slice(0, 400), productId: str(b.productId), date: new Date().toISOString().slice(0, 10), approved: false });
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FEEDBACK_PENDING, JSON.stringify(list, null, 2));
  res.json({ ok: true, message: "Thanks! Your feedback will appear after the shop approves it." });
});

function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token") || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, errors: ["Admin token required"] });
  next();
}
app.get("/api/orders", requireAdmin, (req, res) => res.json({ ok: true, orders: readOrders().reverse() }));
app.get("/api/orders.xlsx", requireAdmin, (req, res) => (fs.existsSync(ORDERS_XLSX) ? res.download(ORDERS_XLSX, "younick-orders.xlsx") : res.status(404).json({ ok: false, errors: ["No orders yet"] })));
app.patch("/api/orders/:id", requireAdmin, (req, res) => {
  const orders = readOrders();
  const o = orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ ok: false, errors: ["Order not found"] });
  if (str(req.body.status)) o.status = str(req.body.status).slice(0, 60);
  if (str(req.body.reference)) o.payment.reference = str(req.body.reference).slice(0, 60);
  writeOrders(orders);
  res.json({ ok: true, order: o });
});
app.get("/api/feedback/pending", requireAdmin, (req, res) => {
  try { res.json({ ok: true, feedback: JSON.parse(fs.readFileSync(FEEDBACK_PENDING, "utf8")) }); } catch { res.json({ ok: true, feedback: [] }); }
});
app.patch("/api/feedback/:index", requireAdmin, (req, res) => {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(FEEDBACK_PENDING, "utf8")); } catch {}
  const f = list[Number(req.params.index)];
  if (!f) return res.status(404).json({ ok: false });
  f.approved = !!req.body.approved;
  fs.writeFileSync(FEEDBACK_PENDING, JSON.stringify(list, null, 2));
  scheduleReload("feedback approved");
  res.json({ ok: true });
});
app.use("/data/uploads", requireAdmin, express.static(UPLOADS));

/* ------------------------------------------------------------------ static */
app.use(express.static(path.join(ROOT, "public"), { extensions: ["html"] }));
app.get("/health", (req, res) => res.json({ ok: true, version: catalog ? catalog.version : 0 }));

loadCatalog();
app.listen(PORT, () => {
  console.log(`\n  Younick Gifts marketplace  ->  http://localhost:${PORT}`);
  console.log(`  Admin orders page          ->  http://localhost:${PORT}/admin.html  (token: ${ADMIN_TOKEN})`);
  console.log(`  Catalogue workbook         ->  ${WORKBOOK}  (${catalog.products.length} products, watching for changes)\n`);
});
