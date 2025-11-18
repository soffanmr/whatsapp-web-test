const express = require('express');
const { sendText, isReady, getQrImageBuffer, getInfo } = require('./whatsapp');

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
  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: 'Missing "to" or "message" in JSON body' });
  if (!isReady()) return res.status(503).json({ error: 'WhatsApp client not ready. Please check the server logs and scan the QR code if needed.' });
  try {
    const result = await sendText(to, message);
    res.json({ ok: true, id: result.id });
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
