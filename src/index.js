const express = require('express');
const { sendText, isReady, getQrImageBuffer, getInfo, waitForReply } = require('./whatsapp');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const app = express();
app.use(express.json());

app.get('/status', (req, res) => {
  res.json({ ready: isReady() });
});

// Returns connection/ready status and client info if available
app.get('/connected', (req, res) => {
  res.json({ connected: isReady(), info: getInfo() });
});

app.post('/send', async (req, res) => {
  const { to, message, timeout, callbackUrl, callback } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: 'Missing "to" or "message" in JSON body' });
  if (!isReady()) return res.status(503).json({ error: 'WhatsApp client not ready. Please check the server logs and scan the QR code if needed.' });
  try {
    const result = await sendText(to, message);
    res.json({ ok: true, id: result.id });
    // Determine timeout (milliseconds). Accept numeric or numeric-string in payload.
    let waitTimeout = 60000;
    if (typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0) {
      waitTimeout = timeout;
    } else if (typeof timeout === 'string' && timeout.trim() !== '' && !Number.isNaN(Number(timeout))) {
      const parsed = Number(timeout);
      if (Number.isFinite(parsed) && parsed > 0) waitTimeout = parsed;
    }

    // Determine callback URL if provided (accept either callbackUrl or callback)
    const cbUrl = (typeof callbackUrl === 'string' && callbackUrl.trim() !== '') ? callbackUrl : (typeof callback === 'string' && callback.trim() !== '' ? callback : null);

    // helper: POST JSON to the callback URL, returns a Promise
    const postJson = (urlString, data) => {
      return new Promise((resolve, reject) => {
        let parsed;
        try {
          parsed = new URL(urlString);
        } catch (e) {
          return reject(new Error('Invalid callback URL'));
        }

        const payload = JSON.stringify(data);
        const isHttps = parsed.protocol === 'https:';
        const opts = {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: (parsed.pathname || '/') + (parsed.search || ''),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        const lib = isHttps ? https : http;
        const req = lib.request(opts, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            resolve({ statusCode: res.statusCode, body });
          });
        });
        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
      });
    };

    // Non-blocking: listen for the first reply from the recipient number
    // This will log the reply if it arrives within the specified timeout (fallback 60s)
    waitForReply(to, { timeout: waitTimeout })
      .then((reply) => {
        if (reply) {
          const replyText = reply && typeof reply.body !== 'undefined' ? reply.body : reply;
          console.log(`Received reply from ${to}:`, replyText);
          // If a callback URL was provided, POST the to and reply to it
          if (cbUrl) {
            postJson(cbUrl, { to, reply: replyText })
              .then((resp) => {
                console.log(`Callback POST to ${cbUrl} succeeded with status ${resp.statusCode}`);
              })
              .catch((err) => {
                console.error(`Callback POST to ${cbUrl} failed:`, err && err.message ? err.message : err);
              });
          }
        } else {
          console.log(`No reply received from ${to} within timeout`);
        }
      })
      .catch((err) => console.error('Error while waiting for reply:', err));
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Returns current QR code as PNG image for scanning (first-run)
app.get('/qr', async (req, res) => {
  try {
    const buf = await getQrImageBuffer();
    const b64 = buf.toString('base64');
    const dataUri = `data:image/png;base64,${b64}`;
    res.json({ image: dataUri });
  } catch (err) {
    res.status(404).json({ error: 'QR not available. Maybe already authenticated or not yet generated.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WhatsApp API listening on http://localhost:${PORT}`));
