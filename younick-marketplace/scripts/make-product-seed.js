// Converts the image manifest (from the brochure extraction) into data/seed/products.json
const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "public/assets/products/_manifest.json"), "utf8"));
const featured = new Set(["LMP-01","LDP-02","MUG-04","CLP-01","HF-23","SPK-01","EXP-01","MSQ-01","TED-01","MUG-11","LMP-03","LDP-04","CUR-01","DIA-01","BHF-01","WF-08"]);
const badges = { "LMP-01":"Bestseller","MUG-11":"Bestseller","EXP-01":"Handmade","MSQ-01":"Trending","LDP-02":"Diwali Pick","MUG-04":"Diwali Pick","CLP-01":"Diwali Pick","SPK-01":"New","TED-01":"Bestseller","HF-23":"Diwali Pick","LMP-03":"New","CUR-01":"Premium","BED-01":"Premium","KEY-01":"Budget Pick","PEN-02":"Return Gift" };
const seasonOf = (p) => {
  const t = new Set(p.tags.split(",").map(s=>s.trim()));
  const s = [];
  if (t.has("diwali") || t.has("led") || t.has("corporate") || t.has("lamp") || t.has("premium")) s.push("diwali");
  if (t.has("valentine") || t.has("couple") || t.has("heart") || t.has("love")) s.push("valentine");
  if (t.has("rakhi") || t.has("rakshabandhan") || t.has("sister")) s.push("rakhi");
  if (t.has("birthday") || t.has("kids") || t.has("cartoon")) s.push("birthday");
  if (t.has("corporate") || t.has("desk") || t.has("diary") || t.has("clock")) s.push("newyear");
  return [...new Set(s)].join(",");
};
const out = manifest.map(p => ({ id:p.id, name:p.name, category:p.category, price:p.price, mrp:p.mrp, size:p.size, tags:p.tags, desc:p.desc, image:p.image, featured: featured.has(p.id), badge: badges[p.id]||"", season: seasonOf(p) }));
fs.writeFileSync(path.join(ROOT, "data/seed/products.json"), JSON.stringify(out, null, 1));
console.log("products.json", out.length);
