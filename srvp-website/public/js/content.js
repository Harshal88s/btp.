/*
 * ================================================================
 *   SRVP WEBSITE CONTENT  —  EDIT THIS FILE TO CHANGE THE WEBSITE
 * ================================================================
 *
 *  Every piece of text on the public website lives here.
 *  Edit the text inside the quotes, save the file, refresh the
 *  browser — the change appears. No restart needed.
 *
 *  ✏️  MISSING DETAILS
 *  Anything written as  [ADD: ...]  is a placeholder. It shows on
 *  the website as a yellow "ADD" box so you can spot it. Replace the
 *  whole [ADD: ...] with the real text.
 *  Once everything is filled in, set SHOW_PLACEHOLDERS to false so
 *  any leftover placeholders are hidden from visitors.
 *
 *  RULES SO NOTHING BREAKS
 *   - Keep the quotes "..." around text. To use a " inside text, write \"
 *   - Keep the commas at the end of lines inside lists [ ... ].
 *   - To add an item to a list, copy an existing { ... }, block,
 *     paste it below, and change the text.
 *   - If the page goes blank after an edit, press F12 → Console:
 *     it shows the line number of the typo.
 *
 *  ICONS: wherever you see icon: "board", you can use any of:
 *   board, book, video, chat, flask, trophy, target, users, pin,
 *   clock, phone, mail, star, shield, compass
 *
 *  Things that change often (students, faculty, toppers, notices)
 *  are NOT here — manage them from the Admin Panel at /admin.
 */

const SHOW_PLACEHOLDERS = true;

const SITE = {
  // ---------------- BASIC INFO ----------------
  name: "SRVP",
  fullName: "Shri Ram Vidya Pratishthan",
  tagline: "Striving towards Academic & Spiritual Excellence",
  logo: "images/logo-sm.png",
  established: "[ADD: Year SRVP was founded, e.g. 2015]",

  // ---------------- CONTACT ----------------
  contact: {
    phone: "[ADD: Main phone number, e.g. +91 98xxxxxxxx]",
    whatsapp: "", // digits only with country code, e.g. "919800000000" — leave "" to hide WhatsApp buttons
    email: "[ADD: Email address, e.g. srvp.lasur@gmail.com]",
    address: "[ADD: Full address of the classes — building, road, Lasur, taluka, district, PIN code]",
    timings: "[ADD: Office / enquiry timings, e.g. Mon–Sat, 8:00 AM – 8:00 PM]",
    // Google Maps → search your classes → Share → Embed a map → copy ONLY the src="..." link here
    mapEmbedUrl: "",
  },

  social: {
    // Paste full links. Leave "" to hide an icon.
    youtube: "",
    instagram: "",
    facebook: "",
    telegram: "",
  },

  // ---------------- TOP BANNER (HERO) ----------------
  hero: {
    eyebrow: "Foundation & Competitive Exam Classes · Lasur & Online",
    title: "Top Notch Academics, right here in Lasur",
    highlight: "Top Notch",          // these words get an animated underline ("" to turn off)
    // The line that cycles through exam names under the heading
    rotatingPrefix: "Preparing students for",
    rotating: ["Scholarship Exams", "Olympiads", "Homi Bhabha", "VVM", "NDA", "UPSC Foundation"],
    subtitle:
      "Concept-first teaching on smart boards, regular exam-pattern tests and personal attention, in our Lasur classrooms or live online. Building strong foundations for scholarship, Olympiad and competitive exams.",
    primaryButton: "Book a Free Demo Class",
    secondaryButton: "Explore Courses",
    // Small points shown under the buttons
    chips: [
      { icon: "pin", text: "Offline classes in Lasur" },
      { icon: "video", text: "Live online on Zoom" },
      { icon: "board", text: "Smart-board classrooms" },
      { icon: "book", text: "Free library: 100+ books" },
    ],
  },

  // The small form on the right of the banner
  demoForm: {
    heading: "Book a FREE demo class",
    text: "Leave your number. We'll call you back within 24 hours.",
    button: "Request Call Back",
    successMessage: "Thank you! Our team will call you soon to fix your demo class.",
  },

  // Numbers in the blue band under the banner. Update them as you grow.
  stats: [
    { value: "250+", label: "Students online + offline" },
    { value: "6+", label: "Competitive exams covered" },
    { value: "[ADD: number]", label: "Years of teaching" },
    { value: "[ADD: number]", label: "Selections & scholarships" },
  ],

  // Scrolling ribbon under the numbers band
  marquee: ["Scholarship 5th & 8th", "Olympiads", "Homi Bhabha", "VVM", "NDA", "UPSC Foundation", "Smart boards", "Live Zoom classes", "Free library", "Debates"],

  // ---------------- CHOOSE YOUR GOAL (exam tiles) ----------------
  // Clicking a tile takes the visitor to the enquiry form with that goal selected.
  goals: [
    { name: "Foundation Course", forWhom: "[ADD: e.g. Std 3rd–8th]", icon: "compass" },
    { name: "Scholarship Exams", forWhom: "Std 5th & 8th", icon: "star" },
    { name: "Olympiads", forWhom: "[ADD: classes]", icon: "trophy" },
    { name: "Homi Bhabha Bal Vaidnyanik", forWhom: "Std 6th & 9th", icon: "flask" },
    { name: "VVM (Vidyarthi Vigyan Manthan)", forWhom: "[ADD: classes]", icon: "flask" },
    { name: "NDA Foundation", forWhom: "[ADD: classes]", icon: "shield" },
    { name: "UPSC Foundation", forWhom: "[ADD: classes]", icon: "book" },
    // { name: "Navodaya (JNVST)", forWhom: "Std 5th", icon: "target" },   ← remove the // to show
  ],

  // ---------------- COURSES / BATCHES ----------------
  courses: [
    {
      name: "Foundation Course",
      tag: "Most popular",
      forWhom: "[ADD: Which classes/standards, e.g. Std 3rd to 8th]",
      description:
        "Strong basics in Maths, Science, English and reasoning, plus general knowledge and expression skills, so students are ready for any competitive exam later.",
      points: ["Concept-based learning on smart boards", "Weekly tests and progress reports", "Library and debate sessions"],
      mode: "Offline & Online",
      duration: "[ADD: e.g. June to March]",
      fees: "[ADD: Fee per year, or 'Contact us']",
    },
    {
      name: "Competitive Exam Preparation",
      tag: "",
      forWhom: "[ADD: Which classes/standards]",
      description: "Focused preparation for scholarship, Olympiad, Homi Bhabha, VVM, NDA and UPSC foundation, with exam-pattern practice and mock tests.",
      points: ["Exam-pattern mock tests", "Previous-year paper practice", "Personal mentoring and doubt sessions"],
      mode: "Offline & Online",
      duration: "[ADD: e.g. 6 months before the exam]",
      fees: "[ADD: Fee, or 'Contact us']",
    },
    // To add a course, copy one { ... }, block above and paste it here.
  ],

  // ---------------- OFFLINE vs ONLINE ----------------
  modes: [
    {
      icon: "pin",
      title: "Study at SRVP, Lasur",
      text: "Classroom learning with smart boards, our curated library, debates and in-person doubt solving.",
      points: ["Smart-board classrooms", "Library access for every student", "Debates and presentations", "[ADD: Batch timings, e.g. 7–9 AM and 5–7 PM]"],
    },
    {
      icon: "video",
      title: "Learn Live Online",
      text: "Same teachers, same syllabus and same tests, live on Zoom for students outside Lasur.",
      points: ["Live interactive classes, not recordings", "Online tests and doubt sessions", "[ADD: How notes are shared, e.g. WhatsApp group]", "[ADD: Device needed, e.g. phone or laptop with Zoom]"],
    },
  ],

  // ---------------- WHY SRVP ----------------
  highlights: [
    { icon: "board", title: "Smart-Board Classrooms", text: "Concepts come alive with visuals, animations and diagrams. A first for classes in Lasur." },
    { icon: "book", title: "Curated Library", text: "Hand-picked books on science, history, general knowledge, biographies and philosophy, open to every student." },
    { icon: "video", title: "Live Online Classes", text: "Trained faculty teach live on Zoom, so distance is no barrier." },
    { icon: "chat", title: "Debates & Opinions", text: "Students present and defend their views from an early age, building confidence and clear thinking." },
    { icon: "flask", title: "Practical Knowledge", text: "Facts, experiments and real-world examples instead of rote learning." },
    { icon: "trophy", title: "Competitive Exam Culture", text: "SRVP introduced several competitive exams to Lasur's students, giving them an early head start." },
  ],

  // ---------------- TEACHING APPROACH ----------------
  approach: {
    heading: "How we teach",
    intro: "Young minds are at their most curious. Every SRVP class builds on that curiosity.",
    steps: [
      { title: "Curiosity", text: "Every topic begins with a question, a fact or a real-life observation." },
      { title: "Concept", text: "Clear, visual explanation on smart boards: understanding before memorising." },
      { title: "Practice", text: "Regular tests in competitive-exam pattern, with individual feedback." },
      { title: "Expression", text: "Debates, presentations and discussions so students learn to think independently." },
      { title: "Character", text: "Discipline, self-awareness and good values alongside academics." },
    ],
  },

  // ---------------- ABOUT / FOUNDER ----------------
  about: {
    heading: "About SRVP",
    paragraphs: [
      "Shri Ram Vidya Pratishthan (SRVP) was started in Lasur with one belief: a child from a small town deserves the same quality of learning as a child in any metro city.",
      "Today SRVP teaches 250–300 students across offline classrooms and live online batches, preparing them for foundation courses and competitive examinations. Many of these exams were introduced to Lasur's students for the first time by SRVP.",
      "[ADD: 1–2 lines on how and why SRVP started — the founder's own story]",
    ],
    founder: {
      name: "[ADD: Founder's full name]",
      role: "Founder & Director, SRVP",
      photo: "", // e.g. "images/founder.jpg" — put the photo in public/images/
      qualification: "[ADD: Founder's qualifications / background]",
      message:
        "Education is not only about marks. It is about building a curious, confident and thoughtful human being. We start early, when the mind is fresh, so that knowledge becomes a way of thinking, not a burden.",
    },
  },

  // ---------------- OUR VALUES (shown quietly inside the About section) ----------------
  // Set show: false to hide this block completely.
  // ✏️ Ask the founder to check this wording.
  values: {
    show: true,
    heading: "Our values",
    text: "Alongside academics, SRVP helps students grow in character and self-awareness. Our classrooms are open to every child, of every background and belief.",
    items: [
      { word: "स्वयंबोध", title: "Swayambodh", text: "Self-awareness: knowing one's strengths, goals and roots." },
      { word: "विवेक", title: "Critical thinking", text: "Telling facts from misinformation, and forming one's own views." },
      { word: "संस्कार", title: "Discipline & values", text: "Respect, hard work and pride in India's knowledge traditions." },
    ],
  },

  // ---------------- LIBRARY ----------------
  // The book list itself is managed in Admin Panel → Library Books.
  library: {
    heading: "The SRVP Library",
    text:
      "A curated library in a small town, built so that students read beyond textbooks: biographies, science, history, philosophy, general knowledge and competitive-exam books, all chosen with care.",
    hours: "[ADD: e.g. Daily 4–8 PM]",
    photo: "", // e.g. "images/library.jpg"
    catalogueHeading: "Find a book",
    catalogueText:
      "Search the catalogue to see whether a book is on our shelf, or download it free. Free downloads open the official source (NCERT, Balbharati, exam boards) or public-domain libraries.",
    starterNote: "[ADD: This is a starter list of 100 books — check it against the real shelf and update copies in Admin → Library Books]",
  },

  // ---------------- TESTIMONIALS ----------------
  testimonials: [
    { quote: "[ADD: A real quote from a parent]", name: "[ADD: Parent name]", role: "Parent of a Std __ student" },
    { quote: "[ADD: A real quote from a student]", name: "[ADD: Student name]", role: "[ADD: Exam cleared / class]" },
    { quote: "[ADD: Another real quote]", name: "[ADD: Name]", role: "[ADD: Role]" },
  ],

  // ---------------- PHOTO GALLERY ----------------
  // Put photos in public/images/gallery/ and list them here.
  // Example: { src: "images/gallery/smartboard-class.jpg", caption: "Smart-board class" },
  gallery: [],
  // What to photograph (shown as empty boxes until gallery has photos):
  galleryWishlist: [
    "Smart-board classroom in session",
    "The SRVP library",
    "Students during a debate",
    "Toppers' felicitation",
    "Online class on Zoom (screenshot)",
    "Founder with students",
  ],

  // ---------------- FAQ ----------------
  faq: [
    { q: "Which classes do you teach?", a: "[ADD: e.g. Std 3rd to 10th, foundation and competitive batches]" },
    { q: "Can my child join online from outside Lasur?", a: "Yes. Online batches run live on Zoom with the same teachers, syllabus and tests as our Lasur classrooms." },
    { q: "Is there a free demo class?", a: "[ADD: Yes / No, and how to book it]" },
    { q: "What are the fees?", a: "[ADD: Fee range, instalment options, or 'Please call us for the current fee structure']" },
    { q: "What are the batch timings?", a: "[ADD: Morning / evening batch timings]" },
    { q: "Do you give study material and tests?", a: "[ADD: What material is given — notes, books, weekly tests, mock tests]" },
  ],

  // ---------------- ADMISSION FORM ----------------
  admission: {
    heading: "Admissions Open",
    text: "Fill in the form and our team will call you within 24 hours. You can also visit the centre or call us directly.",
    successMessage: "Thank you! We have received your enquiry and will call you soon.",
  },

  footerNote: "Shri Ram Vidya Pratishthan, Lasur. All rights reserved.",
};
