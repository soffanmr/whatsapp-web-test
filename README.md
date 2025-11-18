# WhatsApp API (whatsapp-web.js)

This small project exposes a simple HTTP API to send WhatsApp messages using whatsapp-web.js.

Quick start

1. Install dependencies

```bash
npm install
```

2. Start the server

```bash
npm start
```

On first run you will see a QR code printed in the terminal. Scan it with WhatsApp on your phone to authenticate. Session data is stored automatically in `.wwebjs_auth/` using LocalAuth.

API

- GET /status
  - Returns JSON { ready: true|false }
- POST /send
  - Send a text message. JSON body: { "to": "1234567890", "message": "Hello" }
  - `to` may either be a phone number string (country code + number) or a full JID like `1234567890@c.us`.

Example

```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"to":"1234567890","message":"Hello from API"}'
```

Notes

- This project uses LocalAuth which stores authentication data on disk (default folder `.wwebjs_auth/`). Make sure the process has write permissions.
- The server must keep running to send messages. If the client is not ready, the API will return 503 until authentication completes.
