/*
 * Enquiry alerts: when a parent fills a form on the website, SRVP gets
 *   - a WhatsApp message on each number in WHATSAPP_ALERTS (free, via CallMeBot)
 *   - an email at the address(es) in NOTIFY_EMAIL         (free, via any email account's SMTP, e.g. Gmail)
 *   - an SMS on the phone number(s) in NOTIFY_PHONE       (paid, via Fast2SMS)
 *
 * Set it up in .env — see .env.example and README section "Enquiry alerts".
 * Anything not set up is skipped quietly, so the website keeps working.
 * Test it from Admin Panel → Dashboard → "Send test alert".
 */
const env = (k) => (process.env[k] || '').trim();
const list = (k) => env(k).split(',').map((s) => s.trim()).filter(Boolean);

// WHATSAPP_ALERTS="919800000001:apikey1,919800000002:apikey2"  →  [{ phone, key }, …]
const waTargets = () => list('WHATSAPP_ALERTS').map((pair) => {
  const [phone, key] = pair.split(':').map((x) => (x || '').trim());
  return { phone: phone.replace(/\D/g, ''), key };
}).filter((t) => t.phone.length >= 10 && t.key && !/^KEY_FROM_BOT$/i.test(t.key)); // skip the README placeholder

function channels() {
  return {
    whatsapp: waTargets().length > 0,
    email: Boolean(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS') && list('NOTIFY_EMAIL').length),
    sms: env('SMS_PROVIDER').toLowerCase() === 'fast2sms' && Boolean(env('FAST2SMS_API_KEY') && list('NOTIFY_PHONE').length),
    parentEmail: env('EMAIL_PARENT') === 'true',
  };
}

let transport;
function mailer() {
  if (!transport) {
    const nodemailer = require('nodemailer');
    const port = Number(env('SMTP_PORT')) || 465;
    // Google shows app passwords as "abcd efgh ijkl mnop"; the spaces are not part of it
    const pass = /gmail\.com$/i.test(env('SMTP_HOST')) ? env('SMTP_PASS').replace(/\s+/g, '') : env('SMTP_PASS');
    transport = nodemailer.createTransport({
      host: env('SMTP_HOST'), port, secure: port === 465,
      auth: { user: env('SMTP_USER'), pass },
    });
  }
  return transport;
}

const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

function sendEmail(to, subject, text) {
  return mailer().sendMail({ from: `"SRVP Website" <${env('SMTP_USER')}>`, to, subject: oneLine(subject), text });
}

// Fast2SMS "Quick SMS" route: no DLT registration, about ₹5 per SMS.
// For a cheaper DLT route later, only this function needs to change.
async function sendSms(numbers, message) {
  const r = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { authorization: env('FAST2SMS_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      route: 'q', message, language: 'english', flash: 0,
      numbers: numbers.map((n) => n.replace(/\D/g, '').slice(-10)).join(','),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.return === false) throw new Error(j.message ? String(j.message) : `Fast2SMS replied ${r.status}`);
}

// CallMeBot: free WhatsApp messages to your OWN number. Each number activates once
// (see README "Enquiry alerts") and gets its own API key.
async function sendWhatsApp({ phone, key }, text) {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent('+' + phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const body = await r.text().catch(() => '');
  if (!r.ok || /error|invalid|not (been )?activated/i.test(body)) {
    throw new Error(`WhatsApp to ${phone.slice(-4).padStart(phone.length, '•')}: ${body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || r.status}`);
  }
}

async function enquiry(e) {
  const ch = channels();
  const type = oneLine(e.enquiry_type) || 'Enquiry';
  const sms = oneLine(`SRVP ${type}: ${e.student_name}${e.class_grade ? ', Std ' + e.class_grade : ''}, Ph ${e.phone}` +
    `${e.course ? ', ' + e.course : ''}${e.mode ? ' (' + e.mode + ')' : ''}`).slice(0, 300);
  const details = [
    `New ${type} from the SRVP website`, '',
    `Student : ${oneLine(e.student_name)}`,
    `Parent  : ${oneLine(e.parent_name) || '-'}`,
    `Phone   : ${oneLine(e.phone)}`,
    `Email   : ${oneLine(e.email) || '-'}`,
    `Class   : ${oneLine(e.class_grade) || '-'}`,
    `Course  : ${oneLine(e.course) || '-'}`,
    `Mode    : ${oneLine(e.mode) || '-'}`,
    `Message : ${e.message || '-'}`, '',
    'Open the Admin Panel → Enquiries to follow up.',
  ].join('\n');

  const jobs = [];
  if (ch.whatsapp) {
    const wa = `*New ${type} — SRVP website*\nStudent: ${oneLine(e.student_name)}\nPhone: ${oneLine(e.phone)}` +
      `${e.class_grade ? '\nClass: ' + oneLine(e.class_grade) : ''}${e.course ? '\nCourse: ' + oneLine(e.course) : ''}` +
      `${e.mode ? '\nMode: ' + oneLine(e.mode) : ''}${e.message ? '\nMessage: ' + oneLine(e.message).slice(0, 300) : ''}`;
    jobs.push(['whatsapp', Promise.all(waTargets().map((t) => sendWhatsApp(t, wa)))]);
  }
  if (ch.sms) jobs.push(['sms', sendSms(list('NOTIFY_PHONE'), sms)]);
  if (ch.email) jobs.push(['email', sendEmail(list('NOTIFY_EMAIL').join(','), `New ${type}: ${e.student_name} (${e.phone})`, details)]);
  if (ch.email && ch.parentEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email || '')) {
    jobs.push(['parent email', sendEmail(e.email, 'Thank you for contacting SRVP',
      `Dear Parent,\n\nThank you for your enquiry about ${oneLine(e.student_name)}. Our team will call you soon.\n\nShri Ram Vidya Pratishthan (SRVP), Lasur`)]);
  }
  const out = { whatsapp: 'not set up', email: 'not set up', sms: 'not set up' };
  if (!jobs.length) return out;

  const settled = await Promise.allSettled(jobs.map(([, p]) => p));
  jobs.forEach(([name], i) => {
    out[name] = settled[i].status === 'fulfilled' ? 'sent' : `failed: ${settled[i].reason?.message || settled[i].reason}`;
  });
  return out;
}

module.exports = { channels, enquiry };
