# INFLUENCIA WhatsApp Bot

This service runs on your **local machine** and does three things:

1. Connects to WhatsApp via **whatsapp-web.js**
2. Connects to your existing **MongoDB registrations** collection
3. Exposes a small **REST API** used by the dashboard + runs schedulers to send messages

## Setup

```bash
cd whatsapp-bot
npm install
```

Create a `.env` file (or edit the existing one):

```env
MONGODB_URI=your-mongodb-connection-string-here
EVENT_DATE=2025-12-20
PORT=4000
```

> The `MONGODB_URI` should point to the same database your Vercel registration API writes to.

## Run

```bash
npm start
```

- On first run, a **QR code** will appear in your terminal.
- Scan it with the WhatsApp account you want to use for outbound messages.
- After that, the session is cached locally.

The API will be available at:

- `GET /stats`
- `GET /registrations`
- `POST /send-test`
- `POST /registrations/:id/send`
- `PUT /registrations/:id/paymentStatus`

All on `http://localhost:4000` by default.
