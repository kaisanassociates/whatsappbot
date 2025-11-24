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

# Required: A strong secret key to protect the dashboard from unauthorized access
DASHBOARD_SECRET=your-strong-secret-here

# Optional: Enable automatic schedulers (disabled by default for safety)
# Set to 'true' to enable automatic message sends based on payment status and timing
# ENABLE_AUTO_SCHEDULERS=false
```

> The `MONGODB_URI` should point to the same database your Vercel registration API writes to.

## Run

```bash
npm start
```

- On first run, a **QR code** will appear in your terminal.
- Scan it with the WhatsApp account you want to use for outbound messages.
- After that, the session is cached locally.

Open your browser to `http://localhost:4000/` to access the dashboard.

### Dashboard Features

1. **Login**: Enter your `DASHBOARD_SECRET` to unlock the dashboard.
2. **Stats**: Real-time overview of total, confirmed, pending, and cancelled registrations.
3. **Registrations Table**: 
   - Search by name, email, or phone.
   - Select one or multiple registrations with checkboxes.
   - View payment status and which messages have been sent.
4. **Bulk Send**: 
   - Select multiple registrations.
   - Choose a message template (Initial, Follow Up, Final Reminder, Confirmed, 2-Day Reminder).
   - Click **"Send to Selected"** — only those registrations receive the message.
   - A confirmation dialog prevents accidental bulk sends.
5. **Individual Actions**:
   - Send a template or custom message to a single registration.
   - Update payment status directly from the table.
6. **Operation Logs**: View a history of all message sends and status updates (audit trail).

### Important: Auto-Schedulers (Disabled by Default)

By default, **automatic schedulers are disabled**. This means:
- Messages are sent **only** when you explicitly select and send them from the dashboard.
- The bot does **not** automatically send messages based on registration date or payment status.

To **enable** automatic message scheduling (sends messages automatically based on conditions):
```env
ENABLE_AUTO_SCHEDULERS=true
```

When enabled, the schedulers will automatically send:
- **Initial message** to new pending registrations (every minute).
- **Follow-up message** 2 days after registration if still pending (every 5 minutes).
- **Final reminder** 5 days after registration if still pending (every 10 minutes).
- **Confirmed message** to confirmed registrations daily.
- **2-day reminder** to confirmed registrations 2 days before the event.

### API Endpoints

All state-changing endpoints (POST/PUT) require the `x-dashboard-key` header set to your `DASHBOARD_SECRET`.

- `GET /stats` — registration statistics
- `GET /registrations` — list registrations (supports `?search=...` and `?status=...`)
- `GET /health` — health & readiness check
- `GET /message-templates` — available message templates
- `GET /operation-logs` — audit log of all sends
- `POST /send-test` — test a message to a phone number
- `POST /registrations/:id/send` — send a template to one registration
- `POST /registrations/:id/send-custom` — send custom text to one registration
- `PUT /registrations/:id/paymentStatus` — update payment status (auto-sends confirmation if confirmed)
- `POST /bulk-send` — send a template to multiple selected registrations
