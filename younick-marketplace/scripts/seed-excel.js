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
  SKU: p.id,
  Name: p.name,
  Category: p.category,
  Price: p.price,
  MRP: p.mrp,
  Stock: "YES",
  Availability: "Made to order",
  LeadTime: p.leadTime || "2-3 days",
  MinQty: p.minQty || 1,
  MaxQty: 1000,
  Featured: p.featured ? "YES" : "NO",
  Badge: p.badge || "",
  Size: p.size || "",
  Tags: p.tags || "",
  Season: p.season || "",
  Keywords: p.keywords || `${p.name.toLowerCase()}, personalised ${p.category.toLowerCase()}, photo gift`,
  Description: p.desc || "",
  Image: p.image,
  Video: p.video || "",
  GSTPercent: p.gst || "",
  WeightGrams: p.weight || "",
}));
const wsP = XLSX.utils.json_to_sheet(productRows);
wsP["!cols"] = [8, 8, 42, 20, 8, 8, 7, 14, 10, 7, 7, 9, 12, 14, 30, 16, 40, 60, 34, 30, 9, 11].map((w) => ({ wch: w }));
XLSX.utils.book_append_sheet(wb, wsP, "Products");

const wsS = XLSX.utils.json_to_sheet(Object.entries(settings).map(([Key, Value]) => ({ Key, Value })));
wsS["!cols"] = [{ wch: 22 }, { wch: 70 }];
XLSX.utils.book_append_sheet(wb, wsS, "Settings");

const wsSe = XLSX.utils.json_to_sheet(seasons);
wsSe["!cols"] = Object.keys(seasons[0]).map(() => ({ wch: 24 }));
XLSX.utils.book_append_sheet(wb, wsSe, "Seasons");

const wsF = feedback.length ? XLSX.utils.json_to_sheet(feedback) : XLSX.utils.aoa_to_sheet([["Name", "City", "Rating", "Text", "ProductID", "Date"]]);
wsF["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 7 }, { wch: 70 }, { wch: 10 }, { wch: 12 }];
XLSX.utils.book_append_sheet(wb, wsF, "Feedback");

const wsD = XLSX.utils.json_to_sheet(delivery);
wsD["!cols"] = [{ wch: 16 }, { wch: 26 }, { wch: 8 }, { wch: 16 }, { wch: 50 }, { wch: 8 }];
XLSX.utils.book_append_sheet(wb, wsD, "Delivery");

const help = [
  ["Younick Gifts – how this workbook drives the website"],
  [""],
  ["Products sheet", "One row per product. Edit Price / MRP / Stock / Availability / Featured / Badge / Season / Description / Image and save: the website refreshes within ~2 seconds (server mode) or on the next build (static mode)."],
  ["", "ID must stay unique (it is also the SKU and the image file name). Image is the path under public/ or a full https:// URL. MaxQty caps pieces per order (default 1000); MinQty sets the minimum."],
  ["", "Stock = YES/NO. Availability = text shown on the product (e.g. Made to order, In stock). LeadTime = production time text. Keywords feed search and SEO. GSTPercent / WeightGrams are optional for invoicing and courier rates."],
  ["Settings sheet", "Store name, founder, email, phone, WhatsApp, address, UPI id, QR confirmation, advance %, announcement, SEO title/description, site_url, footer terms (separate with |)."],
  ["", "Any contact field left blank is shown on the website as a dashed 'to be added' placeholder and listed in the Setup checklist on the admin page. Fill it in and save to replace the placeholder."],
  ["Seasons sheet", "One row per campaign. Set Active = YES on exactly one row (or leave all NO and fill StartDate/EndDate: the site picks the season whose dates include today)."],
  ["", "Slides = product IDs separated by | that appear in the hero slideshow. CampaignImages = banner images separated by |. Colours accept any CSS colour (hex)."],
  ["Feedback sheet", "Customer testimonials for the home-page slideshow. Leave empty to show the 'be our first reviewer' invitation. Feedback submitted on the site waits in data/feedback-pending.json until approved on the admin page."],
  ["Delivery sheet", "Delivery methods offered at checkout with charge and ETA. Enabled = YES/NO."],
  ["Google Sheets", "Upload this file to Google Drive, open with Google Sheets, Share > Anyone with the link (Viewer), then set YOUNICK_SHEET_URL=https://docs.google.com/spreadsheets/d/<ID>/export?format=xlsx on the server. The site polls it every 60 s and the GitHub Pages build every hour."],
  ["Orders", "Orders placed on the website are written to data/orders.xlsx and data/orders.json (never to this workbook)."],
];
const wsH = XLSX.utils.aoa_to_sheet(help);
wsH["!cols"] = [{ wch: 18 }, { wch: 120 }];
XLSX.utils.book_append_sheet(wb, wsH, "READ ME");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
XLSX.writeFile(wb, OUT);
console.log("Wrote", OUT, "with", products.length, "products");
