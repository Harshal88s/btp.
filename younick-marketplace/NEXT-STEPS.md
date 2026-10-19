# What the shop needs to supply to make this site production-ready

The site is fully working with the brochure data. These inputs from the shop will make it sharper.

## Must do before going live
| # | Item | Where it goes | Why |
| --- | --- | --- | --- |
| 1 | **Real UPI QR code** exported from PhonePe Business / GPay / Paytm / bank app | `public/assets/payment-qr.png` | The checkout currently shows a placeholder QR. |
| 2 | **UPI id and payee name** | Settings sheet → `upi_id`, `upi_payee_name` | Used for the "Open UPI app" link and the copy button. |
| 3 | **Confirm every price, MRP and stock flag** | Products sheet | Brochure prices were only printed for two items (MF-22 ₹800, Spiderman pillow ₹300); the rest are estimates and must be corrected by the shop. |
| 4 | **Advance rule** (percent and minimum) | Settings sheet → `advance_percent`, `advance_min` | Default is 20 % with a ₹200 floor. |
| 5 | **Delivery charges and areas** | Delivery sheet | Default: pickup free, Delivery Express ₹49 (free above ₹999), Courier Express ₹99. |
| 6 | Decide where the server runs (any ₹300-400/month Node host, Render, Railway, or a shop PC) | `npm start` | The Excel live-link and order book need the Node server; the static build only sends orders over WhatsApp. |

## Content that will lift conversion
| # | Item | Where it goes | Notes |
| --- | --- | --- | --- |
| 7 | **Clean product photos** (white background, 1000×1000 px, JPG/WebP) for the top 40 sellers | `public/assets/products/<ID>.webp` + `Image` column | Brochure crops are 96 dpi; real photos will look far better in the hero and modal. |
| 8 | **Short vertical videos** (10-20 s, MP4/WebM, under 8 MB) of magic mugs, LED pillows, spinning lamps, explosion box | `public/assets/video/<ID>.mp4` + `Video` column | The `Video` column is already read by the site; add a video and it can autoplay muted in the product modal (ask for this wiring once files exist). |
| 9 | **Founder photo** of Ritesh Navandar and 3-4 shop / workshop photos | `public/assets/founder.jpg`, `public/assets/store/` | Replaces the initials avatar; builds trust for first-time buyers. |
| 10 | **Real customer reviews with first names and area** (WhatsApp screenshots are fine, we transcribe) | Feedback sheet | Six sample reviews are placeholders written from the catalogue and must be replaced. |
| 11 | **Google Maps share link** of the store | Settings sheet → `maps_url` | Currently a search link to the address. |
| 12 | **Instagram / Facebook handles** and a few reel links | Settings sheet | Shown in the store card. |
| 13 | **Logo file** if the shop has one (SVG or PNG) | `public/assets/logo.svg` | A generated gift-box mark is used now. |
| 14 | **Season banners**: 4-6 photos per season (Diwali, New Year, Valentine, Rakhi, birthdays) | Seasons sheet → `CampaignImages` | Generated Diwali composites are used now; real photos of lit-up products sell better. |
| 15 | Bulk / corporate price breaks (e.g. 50+, 200+, 500+) | New columns can be added to Products sheet on request | The site caps at 1000 pieces per line and shows unit price only. |

## Optional upgrades the code is ready for
- WhatsApp Business API or an SMS gateway to auto-confirm orders (currently the shop confirms manually from the admin page).
- Razorpay / PhonePe payment-gateway integration instead of manual QR verification.
- Google Sheets instead of a local Excel file: point `YOUNICK_WORKBOOK` at a synced OneDrive/Drive copy, or ask for a Sheets API connector.
- Custom domain (younickgifts.in) + HTTPS when hosted.
