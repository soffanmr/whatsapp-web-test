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
  
  // Normalize the input to a phone number (remove @c.us if present for getNumberId)
  const phone = to.includes('@') ? to.split('@')[0] : to;
  
  try {
    // getNumberId resolves the correct JID (e.g. adding country code or finding the LID)
    const numberId = await client.getNumberId(phone);
    if (!numberId) {
      throw new Error(`The number ${to} is not registered on WhatsApp.`);
    }
    
    // Use the resolved JID (_serialized) to send the message
    return client.sendMessage(numberId._serialized, message);
  } catch (err) {
    console.error('Error in sendText:', err);
    throw err;
  }
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
  // options.originRemote: the message id.remote from sendMessage - most reliable for matching
  const originRemote = typeof options.originRemote === 'string' && options.originRemote.trim() !== '' ? options.originRemote.trim() : null;
  const jid = (typeof to === 'string' && to.includes('@')) ? to : (typeof to === 'string' && to ? `${to}@c.us` : null);

  // Maintain active listeners keyed by jid only (not callbackUrl) so that
  // the very last callback registered for a number is the active listener.
  if (!global.__whatsapp_active_listeners) global.__whatsapp_active_listeners = new Map();

  // Use jid (phone number) as the key to ensure only one listener per number.
  // This prevents duplicate callbacks when multiple messages are sent to the same recipient.
  const key = jid || '__no_jid__';

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
        // Match by msg.id.remote if originRemote is available (most reliable)
        // This handles cases where phone numbers have different formats (country codes, etc.)
        let matched = false;

        if (originRemote && msg && msg.id && msg.id.remote) {
          matched = (msg.id.remote === originRemote);
          if (matched) {
            console.log('[DEBUG] Matched by originRemote:', originRemote);
          }
        }

        // Fallback: try matching by jid if originRemote not available or didn't match
        if (!matched && jid) {
          if (msg.from === jid || msg.author === jid) {
            matched = true;
            console.log('[DEBUG] Matched by jid:', jid, 'from msg.from/msg.author');
          }
        }

        if (matched) {
          onReply(msg);
        }
      } catch (e) {
        console.error('[DEBUG] Error in handler:', e);
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
