const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrcodeLib = require('qrcode');

// Initialize WhatsApp client with LocalAuth (stores session in .wwebjs_auth)
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

let ready = false;
let lastQr = null;

client.on('qr', (qr) => {
  // Print QR to terminal for scanning (first-time auth)
  lastQr = qr;
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code above with your phone.');
});

client.on('ready', () => {
  ready = true;
  console.log('WhatsApp client is ready');
});

client.on('auth_failure', (msg) => {
  console.error('Authentication failure:', msg);
});

client.on('disconnected', (reason) => {
  ready = false;
  console.log('WhatsApp client disconnected:', reason);
});

client.initialize();

function isReady() {
  return ready;
}

/**
 * Send a text message.
 * to: phone number like '1234567890' or '1234567890@c.us'
 * message: text body
 */
async function sendText(to, message) {
  if (!ready) throw new Error('WhatsApp client not ready');
  const jid = to.includes('@') ? to : `${to}@c.us`;
  return client.sendMessage(jid, message);
}

async function getQrImageBuffer() {
  if (!lastQr) throw new Error('No QR available');
  // generate PNG buffer (300px width)
  return qrcodeLib.toBuffer(lastQr, { type: 'png', width: 300 });
}

function getInfo() {
  try {
    return client.info || null;
  } catch (e) {
    return null;
  }
}

module.exports = { sendText, isReady, client, getQrImageBuffer, getInfo };
