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

/**
 * Wait for the next message from a specific phone number (the recipient jid).
 * Resolves with the message object when a matching message arrives, or null on timeout.
 * to: phone number like '1234567890' or '1234567890@c.us'
 * options: { timeout: milliseconds }
 */
function waitForReply(to, options = {}) {
  const timeoutMs = typeof options.timeout === 'number' ? options.timeout : 60000;
  const jid = to.includes('@') ? to : `${to}@c.us`;

  return new Promise((resolve) => {
    const handler = (msg) => {
      try {
        // msg.from is like '1234567890@c.us' for individual chats
        if (msg.from === jid || msg.author === jid) {
          client.removeListener('message', handler);
          clearTimeout(timeout);
          resolve(msg);
        }
      } catch (e) {
        // swallow and continue
      }
    };

    const timeout = setTimeout(() => {
      client.removeListener('message', handler);
      resolve(null); // timed out
    }, timeoutMs);

    client.on('message', handler);
  });
}

/**
 * Listen for all replies from a specific number (jid) for a given timeout.
 * Calls onReply(msg) for each reply received within the window.
 * Returns a promise that resolves after the timeout.
 */
function waitForReplies(to, onReply, options = {}) {
  const timeoutMs = typeof options.timeout === 'number' ? options.timeout : 60000;
  const jid = to.includes('@') ? to : `${to}@c.us`;
  const callbackUrl = typeof options.callbackUrl === 'string' && options.callbackUrl.trim() !== '' ? options.callbackUrl.trim() : null;

  // Maintain active listeners keyed by jid+callbackUrl so repeated sends with same
  // recipient and callback remove previous listeners to avoid duplicate callbacks.
  if (!global.__whatsapp_active_listeners) global.__whatsapp_active_listeners = new Map();

  // If callbackUrl provided, form a stable key; otherwise create a unique key
  // so listeners without callbackUrl do not collide.
  const key = callbackUrl ? `${jid}|${callbackUrl}` : `${jid}|__unique__|${Date.now()}|${Math.random()}`;

  // If an existing listener exists for this key, remove it now.
  const existing = global.__whatsapp_active_listeners.get(key);
  if (existing) {
    try {
      client.removeListener('message', existing.handler);
    } catch (e) {}
    if (existing.timeoutId) clearTimeout(existing.timeoutId);
    global.__whatsapp_active_listeners.delete(key);
  }

  return new Promise((resolve) => {
    const handler = (msg) => {
      try {
        if (msg.from === jid || msg.author === jid) {
          onReply(msg);
        }
      } catch (e) {
        // swallow and continue
      }
    };

    client.on('message', handler);
    const timeoutId = setTimeout(() => {
      try {
        client.removeListener('message', handler);
      } catch (e) {}
      global.__whatsapp_active_listeners.delete(key);
      resolve();
    }, timeoutMs);

    // store active listener so subsequent calls with same key can remove it
    global.__whatsapp_active_listeners.set(key, { handler, timeoutId });
  });
}

module.exports = { sendText, isReady, client, getQrImageBuffer, getInfo, waitForReply, waitForReplies };
