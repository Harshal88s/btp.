/**
 * Creates data/younick-catalog.xlsx (the owner's master sheet) from the seed JSON.
 * Run: npm run seed   (use --force to overwrite an existing workbook)
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "younick-catalog.xlsx");
const SEED = path.join(ROOT, "data", "seed");

const args = process.argv.slice(2);
if (fs.existsSync(OUT) && !args.includes("--force")) {
  if (args.includes("--if-missing")) process.exit(0);
  console.log("Workbook already exists:", OUT, "\nUse --force to rebuild it from the seed.");
  process.exit(0);
}

const products = JSON.parse(fs.readFileSync(path.join(SEED, "products.json"), "utf8"));
const settings = JSON.parse(fs.readFileSync(path.join(SEED, "settings.json"), "utf8"));
const seasons = JSON.parse(fs.readFileSync(path.join(SEED, "seasons.json"), "utf8"));
const feedback = JSON.parse(fs.readFileSync(path.join(SEED, "feedback.json"), "utf8"));
const delivery = JSON.parse(fs.readFileSync(path.join(SEED, "delivery.json"), "utf8"));

const wb = XLSX.utils.book_new();

const productRows = products.map((p) => ({
  ID: p.id,
  Name: p.name,
  Category: p.category,
  Price: p.price,
  MRP: p.mrp,
  MaxQty: 1000,
  Stock: "YES",
  Featured: p.featured ? "YES" : "NO",
  Badge: p.badge || "",
  Size: p.size || "",
  Tags: p.tags || "",
  Season: p.season || "",
  Description: p.desc || "",
  Image: p.image,
  Video: p.video || "",
}));
const wsP = XLSX.utils.json_to_sheet(productRows);
wsP["!cols"] = [8, 42, 20, 8, 8, 8, 7, 9, 12, 14, 30, 16, 60, 34, 30].map((w) => ({ wch: w }));
XLSX.utils.book_append_sheet(wb, wsP, "Products");

const wsS = XLSX.utils.json_to_sheet(Object.entries(settings).map(([Key, Value]) => ({ Key, Value })));
wsS["!cols"] = [{ wch: 22 }, { wch: 70 }];
XLSX.utils.book_append_sheet(wb, wsS, "Settings");

const wsSe = XLSX.utils.json_to_sheet(seasons);
wsSe["!cols"] = Object.keys(seasons[0]).map(() => ({ wch: 24 }));
XLSX.utils.book_append_sheet(wb, wsSe, "Seasons");

const wsF = XLSX.utils.json_to_sheet(feedback);
wsF["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 7 }, { wch: 70 }, { wch: 10 }, { wch: 12 }];
XLSX.utils.book_append_sheet(wb, wsF, "Feedback");

const wsD = XLSX.utils.json_to_sheet(delivery);
wsD["!cols"] = [{ wch: 16 }, { wch: 26 }, { wch: 8 }, { wch: 16 }, { wch: 50 }, { wch: 8 }];
XLSX.utils.book_append_sheet(wb, wsD, "Delivery");

const help = [
  ["Younick Gifts – how this workbook drives the website"],
  [""],
  ["Products sheet", "One row per product. Edit Price / MRP / Stock / Featured / Badge / Season and save: the website refreshes within ~2 seconds (server mode)."],
  ["", "ID must stay unique. Image is the path under public/. MaxQty caps how many pieces a customer can order (default 1000)."],
  ["", "Stock = YES/NO. Featured = YES shows the product in the 'Picks' scroller. Season = comma list of season keys (e.g. diwali,newyear)."],
  ["Settings sheet", "Store name, phone, UPI id, advance percentage, QR image path, announcement bar text, founder details."],
  ["Seasons sheet", "One row per campaign. Set Active=YES on exactly one row (or leave all NO and fill StartDate/EndDate: the site picks the season whose dates include today)."],
  ["", "Slides = product IDs separated by | that appear in the hero slideshow. Colours accept any CSS colour (hex)."],
  ["Feedback sheet", "Customer testimonials shown in the feedback slideshow on the home page."],
  ["Delivery sheet", "Delivery methods offered at checkout with charge and ETA. Enabled = YES/NO."],
  ["Orders", "Orders placed on the website are written to data/orders.xlsx and data/orders.json (never to this workbook)."],
];
const wsH = XLSX.utils.aoa_to_sheet(help);
wsH["!cols"] = [{ wch: 18 }, { wch: 120 }];
XLSX.utils.book_append_sheet(wb, wsH, "READ ME");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
XLSX.writeFile(wb, OUT);
console.log("Wrote", OUT, "with", products.length, "products");
