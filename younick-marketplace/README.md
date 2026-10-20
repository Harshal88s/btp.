# Younick Gifts – personalised gifts marketplace

Storefront for **Younick Gifts by Pari's Play Store** (founder: **Ritesh Navandar**).
Customers browse the catalogue, personalise a gift (names, quotes, photos), place an order with their
delivery details, pay a small **UPI advance by QR**, and choose **store pickup, Local Express Delivery
or Courier Express (all India)**. Contact details (phone, WhatsApp, address, UPI id) are intentionally
blank in the Settings sheet: the site shows dashed **"to be added"** placeholders and a **Setup checklist**
(footer + admin page) until the shop fills them in.

The whole catalogue, the season campaign, prices, stock and testimonials live in **one Excel workbook**
(`data/younick-catalog.xlsx`). Save the sheet and the website updates itself within two seconds.

## Run on localhost

```bash
cd younick-marketplace
npm install
npm start            # http://localhost:3000   (admin: http://localhost:3000/admin.html, token "younick-admin")
```

Requirements: Node.js 18 or newer. No database, no build step.

| What | Where |
| --- | --- |
| Storefront | `http://localhost:3000` |
| Orders admin (status updates, photos, Excel download) | `http://localhost:3000/admin.html` |
| Catalogue workbook (edit in Excel / LibreOffice / Google Sheets export) | `data/younick-catalog.xlsx` |
| Orders written by the site | `data/orders.xlsx` and `data/orders.json` |
| Customer photo uploads | `data/uploads/<order id>/` |
| Pending customer feedback (approve in admin) | `data/feedback-pending.json` |

Change the admin password: `ADMIN_TOKEN=mysecret npm start`. Change the port: `PORT=8080 npm start`.
Point to a workbook elsewhere (e.g. a synced OneDrive/Google Drive folder): `YOUNICK_WORKBOOK="C:\path\catalog.xlsx" npm start`.

### Option B: edit the catalogue in Google Sheets (from any phone or laptop)

1. Upload `data/younick-catalog.xlsx` to Google Drive and open it with Google Sheets (keep the sheet names).
2. Share → **Anyone with the link → Viewer**. Copy the sheet ID from the address bar.
3. Start the server with the export link:
   ```bash
   YOUNICK_SHEET_URL="https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=xlsx" npm start
   ```
   The server downloads the sheet every 60 s (`SHEET_POLL_SECONDS` to change), keeps the last good copy if
   Google is unreachable, and pushes changes to open browsers exactly like a local Excel save.
4. For the static site, add the same link as the GitHub repository secret `YOUNICK_SHEET_URL`; the
   `Publish Younick Gifts site` workflow rebuilds GitHub Pages on every push and every hour.

Validation runs on every load: duplicate IDs, missing prices or images, MRP below price, unknown slide IDs
and more are listed at `/api/health` and on the admin page, and the previous catalogue stays live until the
sheet is fixed.

## The Excel workbook drives everything

| Sheet | Controls |
| --- | --- |
| **Products** | `ID`, `SKU`, `Name`, `Category`, `Price`, `MRP`, `Stock` (YES/NO), `Availability`, `LeadTime`, `MinQty`, `MaxQty` (default 1000), `Featured`, `Badge`, `Size`, `Tags`, `Season`, `Keywords`, `Description`, `Image` (path or https URL), `Video`, `GSTPercent`, `WeightGrams` |
| **Settings** | store name, founder, email, phone/WhatsApp, address, city, hours, socials, UPI id, `qr_confirmed`, advance % and minimum, announcement, `terms` (separated by \|), `seo_title`, `seo_description`, `site_url`, stats |
| **Seasons** | one row per campaign: `Active` (YES on exactly one row, or use `StartDate`/`EndDate`), headline, promo code and discount, colours, emoji, `Slides` (product IDs separated by `\|`), `CampaignImages`, announcement |
| **Feedback** | testimonials for the home-page slideshow |
| **Delivery** | delivery methods, charges and ETAs shown at checkout |

Price changes, stock changes, a new season, a new testimonial: edit the cell, save, done. The server watches
the file and pushes the change to every open browser (a toast says "Prices updated from the Excel sheet").

To switch from Diwali to New Year: set `Active = NO` on the diwali row and `YES` on the newyear row. The hero
slideshow, colours, promo code, announcement and "season picks" all follow.

## Setup checklist (what is intentionally blank)

Phone, WhatsApp, address, city, hours, Maps link, Instagram, Facebook, UPI id, GSTIN, site URL and the two
hero stats are empty in the Settings sheet. Each blank one renders as a dashed "… to be added" pill on the
site, and the full list with the exact cell to edit appears in the footer ("Setup pending") and on
`/admin.html`. The pills disappear automatically once the cell is filled and saved.

## Payment QR

Replace `public/assets/payment-qr.png` with the shop's real UPI QR (export it from PhonePe/GPay/Paytm for Business
or the bank app) and set `upi_id` / `upi_payee_name` in the Settings sheet. The checkout shows the QR, a copyable
UPI id and an "Open UPI app" deep link with the advance amount pre-filled. The site never collects card details.

## Static preview build (no server)

```bash
npm run build        # -> dist/index.html (open directly or host anywhere) and dist/artifact.html
```

The static build embeds the catalogue at build time. In this mode orders are sent to the shop's WhatsApp
number as a pre-filled message (there is no server to save them). Rebuild after editing the workbook.

## Regenerating product images from the brochure

Product cut-outs in `public/assets/products/` were extracted from the 2021 brochure PDF, background-removed,
colour-enhanced and upscaled. Campaign banners in `public/assets/campaign/` are generated composites (rangoli
rings, bokeh, diyas). To add a product: drop a PNG/WebP into `public/assets/products/`, add a row in the
Products sheet with the `Image` path, save.

## Project layout

```
younick-marketplace/
├── server.js              Express server: static files, /api/catalog, /api/events (SSE), /api/orders, admin APIs
├── lib/catalog.js         Excel -> catalogue JSON (shared by server and static build)
├── scripts/seed-excel.js  Builds data/younick-catalog.xlsx from data/seed/*.json
├── scripts/build-static.js Builds dist/
├── public/                index.html, admin.html, css/, js/, assets/
└── data/                  younick-catalog.xlsx (+ orders.xlsx, orders.json, uploads/ created at runtime)
```
