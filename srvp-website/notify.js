/*
 * Enquiry alerts: when a parent fills a form on the website, SRVP gets
 *   - an SMS on the phone number(s) in NOTIFY_PHONE   (via Fast2SMS)
 *   - an email at the address(es) in NOTIFY_EMAIL    (via any email account's SMTP, e.g. Gmail)
 *
 * Set it up in .env — see .env.example and README section "Enquiry alerts".
 * Anything not set up is skipped quietly, so the website keeps working.
 * Test it from Admin Panel → Dashboard → "Send test alert".
 */
const env = (k) => (process.env[k] || '').trim();
const list = (k) => env(k).split(',').map((s) => s.trim()).filter(Boolean);

function channels() {
  return {
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
    transport = nodemailer.createTransport({
      host: env('SMTP_HOST'), port, secure: port === 465,
      auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
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
  if (ch.sms) jobs.push(['sms', sendSms(list('NOTIFY_PHONE'), sms)]);
  if (ch.email) jobs.push(['email', sendEmail(list('NOTIFY_EMAIL').join(','), `New ${type}: ${e.student_name} (${e.phone})`, details)]);
  if (ch.email && ch.parentEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email || '')) {
    jobs.push(['parent email', sendEmail(e.email, 'Thank you for contacting SRVP',
      `Dear Parent,\n\nThank you for your enquiry about ${oneLine(e.student_name)}. Our team will call you soon.\n\nShri Ram Vidya Pratishthan (SRVP), Lasur`)]);
  }
  if (!jobs.length) return { sms: 'not set up', email: 'not set up' };

  const settled = await Promise.allSettled(jobs.map(([, p]) => p));
  const out = { sms: ch.sms ? '' : 'not set up', email: ch.email ? '' : 'not set up' };
  jobs.forEach(([name], i) => {
    out[name] = settled[i].status === 'fulfilled' ? 'sent' : `failed: ${settled[i].reason?.message || settled[i].reason}`;
  });
  return out;
}

module.exports = { channels, enquiry };
