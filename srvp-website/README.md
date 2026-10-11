# SRVP — Shri Ram Vidya Pratishthan, Lasur

Website + admin panel for SRVP classes.

- **Public website**: about, founder, approach, courses, exams, results, faculty, library, online classes, gallery, admission enquiry form, contact.
- **Admin panel** (`/admin`, password protected): students, faculty, enquiries, results/toppers, announcements, fee dues, CSV import/export, database backup.

---

## 1. Run it on your computer

1. Install **Node.js 22.13 or newer** from https://nodejs.org (choose the LTS version).
2. Open a terminal in this `srvp-website` folder and run:
   ```bash
   npm install
   cp .env.example .env      # on Windows: copy .env.example .env
   ```
3. Open `.env` and set a strong `ADMIN_PASSWORD`.
4. Start it:
   ```bash
   npm start
   ```
5. Open **http://localhost:3000** for the website and **http://localhost:3000/admin** for the admin panel.

Use `npm run dev` while editing: the server restarts on its own when you change `server.js` or `schema.js`.

---

## 2. Where to change things

| I want to change… | Edit this file | Then |
|---|---|---|
| Any text on the website (about, courses, fees, contact, address, stats, testimonials, gallery) | `public/js/content.js` | Refresh the browser |
| Colours / fonts / spacing | `public/css/style.css` (colours are at the top) | Refresh |
| Logo | Replace `public/images/logo.png` (keep the same name) | Refresh |
| Photos (founder, library, gallery, faculty, toppers) | Put files in `public/images/…` and write the path in `content.js`, or in the admin form's photo field | Refresh |
| Order or layout of sections | `public/index.html` | Refresh |
| Students, faculty, enquiries, toppers, notices, **library books** | **Admin panel** `/admin`, no code needed | Instantly live |
| Book issued / returned | Admin → Library Books → Edit → "Copies on the shelf now" | Instantly live |
| Phone / email that get enquiry alerts | `.env` (see section 5) | Restart the server |
| Add a new field (e.g. blood group, Aadhaar last 4 digits, batch timing) | `schema.js` (instructions at the top) | Restart the server |
| Admin password | `.env` | Restart the server |

### Yellow "✏️ ADD" boxes
Anything still missing (founder's name, address, phone, fees, exam list, photos…) is written as `[ADD: …]` in `content.js` and shows on the site as a **yellow box**. Replace each one with real text. When everything is filled in, set `SHOW_PLACEHOLDERS = false` at the top of `content.js`.

---

## 3. Folder map

```
srvp-website/
├── server.js            ← backend: API, login, serves the site
├── schema.js            ← database tables & fields (edit to add fields)
├── db.js                ← creates/updates the SQLite database
├── .env.example         ← copy to .env; admin password, port
├── notify.js            ← SMS + email alerts for new enquiries
├── seed/books.json      ← starter list of 100 library books (loaded once, on first run)
├── tools/build-preview.js ← builds the one-file shareable preview (npm run preview)
├── data/srvp.db         ← ALL student/faculty data (created on first run; back it up!)
└── public/              ← everything the browser sees
    ├── index.html       ← page structure
    ├── css/style.css    ← look & feel
    ├── js/content.js    ← ★ ALL WEBSITE TEXT — edit this most
    ├── js/main.js       ← builds the page (rarely needs editing)
    ├── images/          ← logo, photos, gallery/
    └── admin/           ← admin panel (index.html, admin.js, admin.css)
```

---

## 4. Data & backup

- Every student, teacher and enquiry is stored in **one file**: `data/srvp.db`.
- Admin panel → Dashboard → **Download backup** once a week, and keep copies on Google Drive or a pen drive.
- You can open the `.db` file with the free **DB Browser for SQLite** to view or edit it like Excel.
- To load all 250–300 existing students at once: Admin → Students → **Export CSV** (this gives you the column format), fill it in Excel, save as CSV, then **Import CSV**. The header can use either field names (`full_name`) or labels (`Full Name`).
- `data/*.db` and `.env` are in `.gitignore` on purpose. **Never upload student data or passwords to GitHub.**

---

## 5. Enquiry alerts (WhatsApp + email + SMS)

Every time a parent fills the demo or admission form, the enquiry is saved **and** sent to you.
All settings go in the `.env` file (on your computer only, never upload it). After editing it, run

```bash
npm run test-alert
```

which sends one test alert and prints "sent" or the exact error for each channel. (Same as
Admin → Dashboard → **Send test alert** once the server is running; restart the server after editing `.env`.)

### A. WhatsApp alerts (free, via CallMeBot) — do this once on EACH phone
1. Open the official guide: https://www.callmebot.com/blog/free-api-whatsapp-messages/ and save the
   bot's phone number shown there in your contacts (the number can change, so always take it from that page).
2. From that phone's WhatsApp, send the bot the activation message given on the page
   (it is like: `I allow callmebot to send me messages`).
3. The bot replies with your **API key** (if nothing comes in 2 minutes, try again after 24 hours).
4. Put the number (with 91 in front) and its key in `.env`, separated by `:`; several phones with commas:
   ```
   WHATSAPP_ALERTS=91XXXXXXXXXX:KEY1,91YYYYYYYYYY:KEY2
   ```
CallMeBot is a free shared service, so a message can sometimes take a minute. Email is the backup.

### B. Gmail alerts (free)
1. Sign in to the Gmail account that will **send** the alerts (it can be the same one that receives them).
2. Turn on **2-Step Verification** in your Google Account (Security).
3. Open https://myaccount.google.com/apppasswords, create an app password named "SRVP website", copy the 16 letters.
4. In `.env`:
   ```
   NOTIFY_EMAIL=address-that-receives-alerts@gmail.com
   SMTP_USER=address-that-sends@gmail.com
   SMTP_PASS=the16letterapppassword
   ```
   (Spaces in the app password are fine; they are removed automatically.)
Install the Gmail app on the phone with notifications on, and every enquiry pops up instantly.

### C. SMS (optional, paid)
Fast2SMS "Quick SMS" route, about ₹5 per SMS, no DLT registration: sign up at fast2sms.com, add balance,
copy the key from "Dev API", then set `NOTIFY_PHONE` and `FAST2SMS_API_KEY`. Fast2SMS checks Quick SMS
manually before delivery, so they can be a little late. Leave blank to keep SMS off.

### D. WhatsApp from the parent (free, no setup on the server)
`contact.whatsapp` in `content.js` is the public WhatsApp number. After a parent sends a form, they get an
"Also send on WhatsApp" button that opens a chat to that number with the enquiry already typed.

`EMAIL_PARENT=true` also sends parents a "thank you" email when they give an email address.

---

## 6. Library & free downloads

- The **book catalogue** on the website comes from Admin → **Library Books**. It starts with 100 books from `seed/books.json`. Check them against the real shelf: fix copies, delete what you don't have, add what you do (or Import CSV).
- **"Download free"** only links to legal free sources: NCERT and Balbharati textbooks, official exam-body past papers (MSCE, MSTA, UPSC, SOF, Navodaya), and public-domain books (Project Gutenberg, Internet Archive, Wikisource).
- **Never upload or link pirated PDFs** of paid books (Arihant, MTG, Laxmikanth, etc.). It is illegal and can get the website taken down. Paid books show "On our shelf: X of Y copies" instead, so students can borrow the printed copy.

---

## 7. Putting it online (going live)

The site needs a server that runs Node.js **and keeps files on disk** (the database is a file). Options:

| Option | Approx. cost | Notes |
|---|---|---|
| Small VPS (Hostinger VPS, DigitalOcean, AWS Lightsail) | ₹400–800 / month | Best fit. Install Node, run with `pm2`, put Nginx + free Let's Encrypt HTTPS in front |
| Render / Railway with a **persistent disk** | ~$7+/month | Easy deploys from GitHub. Free plans wipe the disk, so the data would be lost |
| Shared "website hosting" (PHP-only) | — | ❌ Won't run this backend |

On the server, set `NODE_ENV=production` in `.env` (only works over HTTPS), and use a strong password.

---

## 8. What else is required (checklist)

**Information to collect from the founder**
- [ ] Founder's name, photo, qualifications, his story and philosophy quote
- [ ] Full address with PIN, phone, WhatsApp number, email, office timings
- [ ] Google Maps embed link for the centre
- [ ] Final list of courses: classes covered, batch timings, fees (or "Contact us")
- [ ] The real list of competitive exams SRVP prepares for (the ones in `content.js` are examples only)
- [ ] Results: topper names, exam, year, rank/marks, photos (**get written consent from parents before publishing a child's photo/name**)
- [ ] Faculty details and photos
- [ ] 6–12 good photos: smart-board class, library, debates, felicitation, online class
- [ ] 2–4 genuine testimonials from parents/students
- [ ] Number of library books and library hours

**Things to buy / set up**
- [ ] Domain name, e.g. `srvplasur.in` / `srvp.in` (~₹500–1,000/year)
- [ ] Hosting (see section 7) + HTTPS certificate (free with Let's Encrypt)
- [ ] Google Business Profile for "SRVP Lasur" (free; helps parents find you on Google Maps)
- [ ] Official email (e.g. Google Workspace or Zoho Mail with your domain)
- [ ] YouTube / Instagram pages, then paste the links in `content.js → social`

**Legal / trust**
- [ ] Privacy policy page (you collect children's names and phone numbers; India's DPDP Act 2023 requires parental consent for children's data)
- [ ] Parent consent line in the admission form for publishing results/photos
- [ ] Fee & refund policy page

**Good next features when you scale** (can be added to this same code)
- [ ] Student/parent login to see attendance, test marks and fee status
- [ ] Attendance and test-marks tables (add them in `schema.js`)
- [ ] Online fee payment (Razorpay / PhonePe payment gateway)
- [ ] SMS/WhatsApp alerts to parents (e.g. WhatsApp Business API, MSG91)
- [ ] Zoom class links and timetable per batch for online students
- [ ] Marathi / Hindi version of the website for parents
- [ ] Study material / notes download section
- [ ] Multiple admin users (separate logins for teachers vs owner)
