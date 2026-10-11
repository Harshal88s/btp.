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
 *  Things that change often (students, faculty, toppers, notices)
 *  are NOT here — manage them from the Admin Panel at /admin.
 */

const SHOW_PLACEHOLDERS = true;

const SITE = {
  // ---------------- BASIC INFO ----------------
  name: "SRVP",
  fullName: "Shri Ram Vidya Pratishthan",
  tagline: "Striving towards Academic & Spiritual Excellence",
  mission: "Decolonising the Bhartiya Minds 🇮🇳🚩",
  logo: "images/logo.png",
  established: "[ADD: Year SRVP was founded, e.g. 2015]",

  // ---------------- CONTACT ----------------
  contact: {
    phone: "[ADD: Main phone number, e.g. +91 98xxxxxxxx]",
    whatsapp: "", // digits only with country code, e.g. "919800000000" — leave "" to hide the WhatsApp button
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
    eyebrow: "Striving towards Academic & Spiritual Excellence",
    title: "Top Notch Academics & Shatrubodh",
    subtitle:
      "Nurturing Nationalists & Indic Warriors through SHATRUBODH & SWAYAMBODH — with smart-board classrooms, a curated library, debates from an early age, and live online classes. Admissions open, offline & online.",
    primaryButton: "Apply for Admission",
    secondaryButton: "Explore Courses",
  },

  // Navy strip under the banner (same as the poster)
  programsStrip: ["Academics", "Competitive", "Foundation Programs"],

  // Numbers shown under the banner. Update them as you grow.
  stats: [
    { value: "250+", label: "Students (online + offline)" },
    { value: "6+", label: "Competitive exams prepared for" },
    { value: "[ADD: number]", label: "Years of teaching" },
    { value: "[ADD: number]", label: "Selections / scholarship winners" },
  ],

  // ---------------- ABOUT / FOUNDER ----------------
  about: {
    heading: "About SRVP",
    paragraphs: [
      "Shri Ram Vidya Pratishthan (SRVP) was started in Lasur with one belief: a child from a small town deserves the same quality of learning as a child in any metro city.",
      "Today SRVP teaches 250–300 students across offline classrooms and live online batches, preparing them for foundation courses and competitive examinations — and many of these exams were introduced to Lasur's students for the first time by SRVP.",
      "[ADD: 1–2 lines on how and why SRVP started — the founder's own story]",
    ],
    founder: {
      name: "[ADD: Founder's full name]",
      role: "Founder & Director, SRVP",
      photo: "", // e.g. "images/founder.jpg" — put the photo in public/images/
      qualification: "[ADD: Founder's qualifications / background]",
      message:
        "Education is not only about marks. It is about building a curious, fearless and thoughtful human being. At SRVP we start early — when the mind is fresh — so that knowledge becomes a way of thinking, not a burden.",
      // His philosophy / spiritual outlook, in his own words
      philosophy: "[ADD: A short quote or paragraph from the founder on his philosophy, values and spiritual outlook]",
    },
  },

  // ---------------- OUR PHILOSOPHY (what makes SRVP unique) ----------------
  // ✏️ Ask the founder to check these definitions and rewrite them in his own words.
  ideology: {
    heading: "Shatrubodh & Swayambodh",
    intro:
      "Marks alone don't make a strong citizen. SRVP pairs top-notch academics with two kinds of awareness that most coaching classes never teach.",
    pillars: [
      {
        word: "स्वयंबोध",
        title: "Swayambodh — Knowing Oneself",
        text: "Knowing who we are: our roots, our civilisation, our languages, our knowledge traditions and our values. A student who knows himself studies with confidence and purpose.",
      },
      {
        word: "शत्रुबोध",
        title: "Shatrubodh — Knowing the Challenges",
        text: "Recognising what stands against the nation and against one's own growth: distorted narratives of history, misinformation, distraction and lack of discipline. Awareness is the first step to overcoming them.",
      },
      {
        word: "विमुक्ति",
        title: "Decolonising the Bhartiya Mind",
        text: "Learning India's history, science and philosophy from Indian perspectives and sources, so that students think for themselves with pride, not borrowed inferiority.",
      },
    ],
    note: "[ADD: Founder's own explanation of Shatrubodh & Swayambodh, and how it is taught in class — e.g. weekly sessions, books from the library, debates]",
  },

  // ---------------- WHAT MAKES SRVP DIFFERENT ----------------
  highlights: [
    { icon: "🖥️", title: "Smart-Board Classrooms", text: "Concepts come alive with visuals, animations and diagrams on interactive smart boards — a first for classes in Lasur." },
    { icon: "📚", title: "Curated Library", text: "A hand-picked library of books on science, history, general knowledge, biographies and philosophy — open to every SRVP student." },
    { icon: "💻", title: "Live Online Classes", text: "Live Zoom classes by trained faculty, so students outside Lasur learn with the same teachers and the same rigour." },
    { icon: "🗣️", title: "Debates & Opinions", text: "Students present, debate and defend their views from an early age, building confidence and clear thinking." },
    { icon: "🔬", title: "Practical Knowledge", text: "Facts, experiments and real-world examples instead of rote learning — curiosity is the starting point of every lesson." },
    { icon: "🏆", title: "Competitive Exam Culture", text: "SRVP brought several competitive exams to Lasur's students, giving them early exposure and a head start." },
  ],

  // ---------------- TEACHING APPROACH ----------------
  approach: {
    heading: "Our Approach: Start Early, Think Deep",
    intro:
      "Young minds are at their most curious. SRVP builds on that curiosity with a method that blends concepts, practical knowledge and expression.",
    steps: [
      { title: "Curiosity", text: "Every topic begins with a question, a fact or a real-life observation." },
      { title: "Concept", text: "Clear, visual explanation on smart boards — understanding before memorising." },
      { title: "Practice", text: "Regular tests in competitive-exam pattern, with individual feedback." },
      { title: "Expression", text: "Debates, presentations and discussions so students learn to think and speak independently." },
      { title: "Values", text: "Discipline, character and a grounded outlook, inspired by the founder's philosophy." },
    ],
  },

  // ---------------- COURSES ----------------
  courses: [
    {
      name: "Foundation Course",
      forWhom: "[ADD: Which classes/standards, e.g. Std 3rd to 8th]",
      description:
        "Builds strong basics in Maths, Science, English and reasoning, along with general knowledge and expression skills, so students are ready for any competitive exam later.",
      points: ["Concept-based learning on smart boards", "Weekly tests and progress reports", "Library and debate sessions"],
      mode: "Offline & Online",
      fees: "[ADD: Fee per year, or write 'Contact us']",
    },
    {
      name: "Competitive Exam Preparation",
      forWhom: "[ADD: Which classes/standards]",
      description: "Focused preparation with exam-pattern practice, mock tests and doubt sessions.",
      points: ["Exam-pattern mock tests", "Previous-year paper practice", "Personal mentoring"],
      mode: "Offline & Online",
      fees: "[ADD: Fee, or 'Contact us']",
    },
    // To add a course, copy one { ... }, block above and paste it here.
  ],

  // Exams SRVP prepares students for — shown as tags (taken from the SRVP poster).
  exams: [
    "Scholarship Exams",
    "Homi Bhabha Bal Vaidnyanik",
    "VVM (Vidyarthi Vigyan Manthan)",
    "Olympiads",
    "NDA",
    "UPSC Foundation",
    "[ADD: Any other exams, e.g. Navodaya, NMMS, Sainik School — the poster was partly hidden]",
  ],

  // ---------------- LIBRARY ----------------
  library: {
    heading: "The SRVP Library",
    text:
      "A curated library in a small town — built so that students read beyond textbooks. Biographies, science, history, philosophy and spirituality, general knowledge and competitive-exam books, all chosen with care.",
    facts: [
      { value: "[ADD: number]", label: "Books" },
      { value: "[ADD: e.g. Daily 4–8 PM]", label: "Open hours" },
      { value: "Free", label: "For SRVP students" },
    ],
    photo: "", // e.g. "images/library.jpg"
  },

  // ---------------- ONLINE CLASSES ----------------
  online: {
    heading: "Learn from anywhere — Live online on Zoom",
    text:
      "Students who cannot travel to Lasur join the same batches live on Zoom, taught by trained SRVP faculty, with recorded doubt sessions and online tests.",
    points: [
      "Live interactive classes — not pre-recorded videos",
      "Same syllabus, tests and teachers as offline batches",
      "[ADD: Device / internet requirements, e.g. smartphone or laptop with Zoom]",
      "[ADD: How online students receive notes and tests, e.g. WhatsApp group / Google Classroom]",
    ],
  },

  // ---------------- TESTIMONIALS ----------------
  testimonials: [
    { quote: "[ADD: A real quote from a parent]", name: "[ADD: Parent name]", role: "Parent of a Std __ student" },
    { quote: "[ADD: A real quote from a student]", name: "[ADD: Student name]", role: "[ADD: Exam cleared / class]" },
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

  // ---------------- ADMISSION FORM ----------------
  admission: {
    heading: "Admissions Open",
    text: "Fill in the form and our team will call you within 24 hours. You can also visit the centre or call us directly.",
    // Options in the "Interested in" dropdown
    courseOptions: ["Foundation Course", "Competitive Exam Preparation", "Not sure — please guide me"],
    successMessage: "Thank you! We have received your enquiry and will call you soon.",
  },

  footerNote: "Shri Ram Vidya Pratishthan, Lasur. All rights reserved.",
};
