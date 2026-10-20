# Launch checklist and growth recommendations

## A. Details the shop must add (the site shows a dashed "to be added" pill for each until it is filled)

| # | Detail | Where to add it | Effect on the site |
| --- | --- | --- | --- |
| 1 | Phone number | Settings sheet → `phone` | Store card, footer, structured data |
| 2 | WhatsApp number (digits with country code, e.g. 91XXXXXXXXXX) | Settings sheet → `whatsapp` | "Chat on WhatsApp" button, order confirmation send, Help button on mobile |
| 3 | Store address (two lines) and city | Settings sheet → `address_line1`, `address_line2`, `city` | Store card, Local Express Delivery wording, Maps |
| 4 | Store hours | Settings sheet → `store_hours` | Store card |
| 5 | Google Maps link | Settings sheet → `maps_url` | "Open in Maps" button |
| 6 | Instagram handle and Facebook page | Settings sheet → `instagram`, `facebook` | Store card links |
| 7 | **UPI ID** and payee name | Settings sheet → `upi_id`, `upi_payee_name` | Checkout "Open UPI app" link and copy button |
| 8 | **Real UPI QR image**, then set `qr_confirmed = YES` | `public/assets/payment-qr.png` + Settings sheet | Checkout QR (a placeholder is shown until then) |
| 9 | GSTIN | Settings sheet → `gstin` | Footer, invoices |
| 10 | Public website URL once hosted | Settings sheet → `site_url` | Canonical tag, sitemap, Open Graph, product URLs in the spreadsheet |
| 11 | Years in business and customers served (only if true and provable) | Settings sheet → `stat_years`, `stat_customers` | Extra hero stats (hidden while blank) |
| 12 | Genuine customer reviews (name, city, rating, text, product ID) | Feedback sheet | Replaces the "Be our first reviewer" panel |
| 13 | Confirm every price, MRP, stock flag and lead time | Products sheet | The brochure printed only two prices; the rest are estimates |

## B. Content that lifts conversion
- Clean product photos (white background, 1000×1000) for the top 40 sellers → `public/assets/products/<ID>.webp`.
- 10–20 s product videos (magic mug reveal, LED pillow, spinning lamp) → `Video` column; the modal can autoplay them muted.
- Founder photo and 3–4 workshop photos → replaces the initials avatar; builds trust for first-time buyers.
- Real season banners per campaign → Seasons sheet `CampaignImages`.
- A logo file if one exists → `public/assets/logo.svg`.

## C. Recommendations to grow nationally, build trust and increase sales
1. **Own domain + HTTPS** (e.g. younickgifts.in) and set `site_url`; submit `sitemap.xml` to Google Search Console and Bing. Create a Google Business Profile for the store.
2. **Online payment gateway** (Razorpay or PhonePe PG: UPI, cards, EMI) so the advance is captured and verified automatically; keep the QR flow as a fallback.
3. **Order notifications**: WhatsApp Business API or an SMS/email service to confirm orders, share design proofs and tracking automatically (today the shop confirms manually from the admin page).
4. **Courier integration** (Shiprocket, Delhivery or Pickrr) for live rates by PIN code, label printing and tracking links; the `WeightGrams` column is already there for rates.
5. **Design proof step**: upload the print preview to the order and get a one-tap approval from the customer before printing; it cuts reprints and disputes.
6. **Reviews with photos**: ask every delivered customer for a photo review (the feedback form already exists); show them on product pages and in a Google Business profile.
7. **Trust page**: shipping & returns policy, replacement for damage in transit, GST invoice on request, "about the workshop" with photos.
8. **Corporate landing page**: bulk price tiers (50 / 200 / 500 / 1000), logo mock-up generator, GST invoicing, dedicated email, and case studies; corporate orders have the highest ticket size.
9. **Occasion calendar**: run the Seasons sheet all year (Valentine, Rakhi, Mother's Day, Father's Day, Teacher's Day, Diwali, Christmas, New Year) with a promo code per season; the site already switches colours, slides and copy per row.
10. **Marketplaces and social**: list hero products on Amazon/Flipkart/Meesho for discovery, and post reels of the magic-mug and LED pillow reveals; link each reel to the product with `#PRODUCT-ID` deep links (e.g. `/#MUG-11`).
11. **Analytics**: add Google Analytics 4 or Plausible, track add-to-cart and order events, and watch which categories and seasons convert.
12. **Abandoned cart recovery**: the cart persists on the device; with the payment gateway in place, send a WhatsApp nudge for carts not paid within 24 h.
13. **Performance**: product images are already WebP cut-outs (~40 KB) with lazy loading; when real photos arrive, keep them under 150 KB and 1200 px.
14. **Scale the catalogue**: the Google Sheet flow lets the shop add products from a phone; add a `Collection` column later for curated bundles (e.g. "Office Diwali hamper").
