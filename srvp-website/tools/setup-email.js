/*
 * One-time setup for EMAIL enquiry alerts (WhatsApp and SMS stay off).
 * Asks for the Gmail address and its app password, saves them in .env on
 * this computer only (never uploaded), then sends a test email.
 *
 * Run:  npm run setup-email
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const EXAMPLE = path.join(ROOT, '.env.example');

// Replace KEY=... lines (or add them at the end)
function setVars(text, vars) {
  for (const [key, value] of Object.entries(vars)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  }
  return text;
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q) => { process.stdout.write(q); const { value } = await lines.next(); return (value || '').trim(); };

  console.log('\nSRVP email alerts setup\n-----------------------');
  console.log('You need a Gmail "app password": Google Account → Security → 2-Step Verification ON,');
  console.log('then https://myaccount.google.com/apppasswords → create one named "SRVP website".\n');

  const email = await ask('Gmail address that should get the alerts: ');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('That is not an email address. Nothing was saved.'); process.exit(1); }
  const pass = (await ask('Gmail app password (16 letters, spaces are fine): ')).replace(/\s+/g, '');
  rl.close();
  if (!/^[a-zA-Z]{16}$/.test(pass)) { console.error('An app password is 16 letters. Nothing was saved.'); process.exit(1); }

  const vars = {
    NOTIFY_EMAIL: email, SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: email, SMTP_PASS: pass,
    WHATSAPP_ALERTS: '', NOTIFY_PHONE: '', FAST2SMS_API_KEY: '', // email only for now
  };
  const base = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : fs.readFileSync(EXAMPLE, 'utf8');
  fs.writeFileSync(ENV_FILE, setVars(base, vars), { mode: 0o600 });
  console.log(`\nSaved in ${path.relative(process.cwd(), ENV_FILE) || '.env'} (this file stays on this computer).`);

  Object.assign(process.env, vars);
  console.log('Sending a test email…');
  const result = await require('../notify').enquiry({
    enquiry_type: 'Test', student_name: 'Test Student', parent_name: 'Test Parent', phone: '9999999999',
    class_grade: '6th', course: 'Foundation Course', mode: 'Offline', message: 'Test alert from npm run setup-email.',
  });
  if (result.email === 'sent') {
    console.log(`✅ Test email sent to ${email}. Check the inbox (and Spam the first time).`);
    console.log('Start the website with "npm start" (restart it if it was already running).');
  } else {
    console.log(`❌ Email ${result.email}`);
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH/.test(result.email)) {
      console.log('Could not reach Gmail. Check the internet connection, then run "npm run setup-email" again.');
    } else {
      console.log('Gmail refused the login. Check the address and app password (and that 2-Step Verification is on),');
      console.log('then run "npm run setup-email" again.');
    }
    process.exit(1);
  }
})();
