/*
 * Sends one test enquiry alert using the settings in .env, without starting the website.
 *
 * Run:  npm run test-alert
 */
try { process.loadEnvFile(); } catch { console.error('No .env file found. Copy .env.example to .env first.'); process.exit(1); }
const notify = require('../notify');

console.log('Set up:', notify.channels());
notify.enquiry({
  enquiry_type: 'Test', student_name: 'Test Student', parent_name: 'Test Parent', phone: '9999999999',
  class_grade: '6th', course: 'Foundation Course', mode: 'Offline', message: 'Test alert from npm run test-alert.',
}).then((result) => {
  console.log('Result:', result);
  process.exit(Object.values(result).some((v) => String(v).startsWith('failed')) ? 1 : 0);
});
