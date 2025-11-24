// app.js - INFLUENCIA WhatsApp Bot + API
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const messages = require('./messages');

// ---- CONFIG ----
const MONGODB_URI = process.env.MONGODB_URI;
const EVENT_DATE = new Date(process.env.EVENT_DATE || '2025-12-20');

const FOLLOW_UP_AFTER_DAYS = 2;
const FINAL_REMINDER_AFTER_DAYS = 5;
const PORT = process.env.PORT || 4000;

// ---- EXPRESS SETUP ----
const app = express();
app.use(cors());
app.use(express.json());

// ---- MONGODB SETUP ----
const registrationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  organization: String,
  ticketType: { type: String, enum: ['standard', 'premium', 'vip'], default: 'standard' },
  paymentStatus: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
  registrationDate: { type: Date, default: Date.now },
  attended: { type: Boolean, default: false },
  checkInTime: Date,
  // Extended fields
  fullName: String,
  contactNumber: String,
  business: String,
  sectors: [String],
  designation: String,
  experience: String,
  achievements: String,
  futurePlan: String,
  dateOfBirth: String,
  linkedinProfile: String,
  otherSector: String,
  address: String,
  city: String,
  state: String,
  pincode: String,
  country: String,
  website: String,
  gstin: String,
  pan: String,
  referralCode: String,
  qrCode: String,

  // WhatsApp send-tracking fields
  whatsappInitialSent: { type: Boolean, default: false },
  whatsappFollowUpSent: { type: Boolean, default: false },
  whatsappFinalReminderSent: { type: Boolean, default: false },
  whatsappConfirmedSent: { type: Boolean, default: false },
  whatsappTwoDayReminderSent: { type: Boolean, default: false }
});

const Registration =
  mongoose.models.Registration || mongoose.model('Registration', registrationSchema);

// ---- WHATSAPP CLIENT ----
const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on('qr', (qr) => {
  console.log('Scan this QR with WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('WhatsApp client is ready ✅');
  startSchedulers();
});

client.on('auth_failure', (msg) => {
  console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
  console.log('Client was logged out', reason);
});

// ---- HELPERS ----
function formatWhatsAppNumber(phone) {
  let p = (phone || '').trim();

  if (!p) return null;

  if (p.startsWith('+')) {
    p = p.replace('+', '');
  } else if (p.length === 10) {
    p = '91' + p; // assume Indian numbers
  }

  return p + '@c.us';
}

async function sendMessageToRegistration(reg, text) {
  const rawPhone = reg.contactNumber || reg.phone;
  const chatId = formatWhatsAppNumber(rawPhone);

  if (!chatId) {
    console.log('No valid phone for registration:', reg._id);
    return;
  }

  try {
    await client.sendMessage(chatId, text);
    console.log(`✅ Message sent to ${rawPhone} (${reg.email})`);
  } catch (err) {
    console.error(`❌ Failed to send message to ${rawPhone}`, err);
  }
}

// ---- CRON SCHEDULERS ----
function startSchedulers() {
  // Initial message for new pending registrations
  cron.schedule('* * * * *', async () => {
    try {
      const regs = await Registration.find({
        paymentStatus: 'pending',
        whatsappInitialSent: { $ne: true },
      }).limit(50);

      for (const reg of regs) {
        await sendMessageToRegistration(reg, messages.initial(reg));
        reg.whatsappInitialSent = true;
        await reg.save();
      }
    } catch (err) {
      console.error('Error in initial message job:', err);
    }
  });

  // Follow-up reminder
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const cutoff = new Date(
        now.getTime() - FOLLOW_UP_AFTER_DAYS * 24 * 60 * 60 * 1000
      );

      const regs = await Registration.find({
        paymentStatus: 'pending',
        registrationDate: { $lte: cutoff },
        whatsappFollowUpSent: { $ne: true },
      }).limit(50);

      for (const reg of regs) {
        await sendMessageToRegistration(reg, messages.followUp(reg));
        reg.whatsappFollowSent = true;
        await reg.save();
      }
    } catch (err) {
      console.error('Error in follow-up job:', err);
    }
  });

  // Final reminder
  cron.schedule('*/10 * * * *', async () => {
    try {
      const now = new Date();
      const cutoff = new Date(
        now.getTime() - FINAL_REMINDER_AFTER_DAYS * 24 * 60 * 60 * 1000
      );

      const regs = await Registration.find({
        paymentStatus: 'pending',
        registrationDate: { $lte: cutoff },
        whatsappFinalReminderSent: { $ne: true },
      }).limit(50);

      for (const reg of regs) {
        await sendMessageToRegistration(reg, messages.finalReminder(reg));
        reg.whatsappFinalReminderSent = true;
        await reg.save();
      }
    } catch (err) {
      console.error('Error in final reminder job:', err);
    }
  });

  // Confirmed message (if not yet sent)
  cron.schedule('0 9 * * *', async () => {
    try {
      const regs = await Registration.find({
        paymentStatus: 'confirmed',
        whatsappConfirmedSent: { $ne: true },
      });

      for (const reg of regs) {
        await sendMessageToRegistration(reg, messages.confirmed(reg));
        reg.whatsappConfirmedSent = true;
        await reg.save();
      }
    } catch (err) {
      console.error('Error in confirmed message job:', err);
    }
  });

  // 2-day reminder before event
  cron.schedule('0 10 * * *', async () => {
    try {
      const now = new Date();
      const diffDays =
        (EVENT_DATE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays < 1.5 || diffDays > 2.5) return;

      const regs = await Registration.find({
        paymentStatus: 'confirmed',
        whatsappTwoDayReminderSent: { $ne: true },
      });

      for (const reg of regs) {
        await sendMessageToRegistration(reg, messages.twoDayReminder(reg));
        reg.whatsappTwoDayReminderSent = true;
        await reg.save();
      }
    } catch (err) {
      console.error('Error in two-day reminder job:', err);
    }
  });

  console.log('⏱️ Schedulers started');
}

// ---- API ENDPOINTS ----

// 1) Stats for dashboard
app.get('/stats', async (req, res) => {
  try {
    const regs = await Registration.find({});
    const total = regs.length;
    const confirmed = regs.filter((r) => r.paymentStatus === 'confirmed').length;
    const pending = regs.filter((r) => r.paymentStatus === 'pending').length;
    const cancelled = regs.filter((r) => r.paymentStatus === 'cancelled').length;

    return res.json({
      total,
      confirmed,
      pending,
      cancelled,
      messages: {
        initial: regs.filter((r) => r.whatsappInitialSent).length,
        followUp: regs.filter((r) => r.whatsappFollowUpSent).length,
        finalReminder: regs.filter((r) => r.whatsappFinalReminderSent).length,
        confirmed: regs.filter((r) => r.whatsappConfirmedSent).length,
        twoDayReminder: regs.filter((r) => r.whatsappTwoDayReminderSent).length,
      },
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 2) List registrations (simplified view)
app.get('/registrations', async (req, res) => {
  try {
    const { status, search } = req.query;

    const query = {};
    if (status && ['pending', 'confirmed', 'cancelled'].includes(status)) {
      query.paymentStatus = status;
    }

    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { fullName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') },
        { contactNumber: new RegExp(search, 'i') },
      ];
    }

    const regs = await Registration.find(query)
      .sort({ registrationDate: -1 })
      .limit(200);

    const simplified = regs.map((r) => ({
      id: r._id,
      name: r.fullName || r.name,
      email: r.email,
      phone: r.contactNumber || r.phone,
      paymentStatus: r.paymentStatus,
      registrationDate: r.registrationDate,
      whatsappInitialSent: r.whatsappInitialSent,
      whatsappFollowUpSent: r.whatsappFollowUpSent,
      whatsappFinalReminderSent: r.whatsappFinalReminderSent,
      whatsappConfirmedSent: r.whatsappConfirmedSent,
      whatsappTwoDayReminderSent: r.whatsappTwoDayReminderSent,
    }));

    return res.json(simplified);
  } catch (err) {
    console.error('Registrations error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 3) Test message endpoint
app.post('/send-test', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res
        .status(400)
        .json({ success: false, error: 'Phone and message required' });
    }

    const chatId = formatWhatsAppNumber(phone);
    if (!chatId) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid phone number' });
    }

    await client.sendMessage(chatId, message);
    return res.json({ success: true, message: 'Message sent successfully!' });
  } catch (err) {
    console.error('Test message error:', err);
    return res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// 4) Send one of the templates to a registration
app.post('/registrations/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;

    if (
      !['initial', 'followUp', 'finalReminder', 'confirmed', 'twoDayReminder'].includes(
        type
      )
    ) {
      return res.status(400).json({ error: 'Invalid message type' });
    }

    const reg = await Registration.findById(id);
    if (!reg) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const text = messages[type](reg);
    await sendMessageToRegistration(reg, text);

    const flagField =
      type === 'initial'
        ? 'whatsappInitialSent'
        : type === 'followUp'
        ? 'whatsappFollowUpSent'
        : type === 'finalReminder'
        ? 'whatsappFinalReminderSent'
        : type === 'confirmed'
        ? 'whatsappConfirmedSent'
        : 'whatsappTwoDayReminderSent';

    reg[flagField] = true;
    await reg.save();

    return res.json({ success: true });
  } catch (err) {
    console.error('Send template error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 5) Update payment status from dashboard
app.put('/registrations/:id/paymentStatus', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    if (!['pending', 'confirmed', 'cancelled'].includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid paymentStatus' });
    }

    const reg = await Registration.findByIdAndUpdate(
      id,
      { paymentStatus },
      { new: true }
    );

    if (!reg) return res.status(404).json({ error: 'Registration not found' });

    return res.json({
      id: reg._id,
      paymentStatus: reg.paymentStatus,
    });
  } catch (err) {
    console.error('Update paymentStatus error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 6) Get available message templates
app.get('/message-templates', async (req, res) => {
  try {
    // Return the available message templates with their names and content
    // The content will be a function that takes registration data, but we'll return a
    // simplified version for the dashboard UI
    const templates = [
      {
        id: 'initial',
        name: 'Initial Message',
        content: messages.initial({fullName: 'Attendee Name'}) // Render with placeholder
      },
      {
        id: 'followUp',
        name: 'Follow Up Message',
        content: messages.followUp({fullName: 'Attendee Name'}) // Render with placeholder
      },
      {
        id: 'finalReminder',
        name: 'Final Reminder',
        content: messages.finalReminder({fullName: 'Attendee Name'}) // Render with placeholder
      },
      {
        id: 'confirmed',
        name: 'Confirmed Message',
        content: messages.confirmed({fullName: 'Attendee Name'}) // Render with placeholder
      },
      {
        id: 'twoDayReminder',
        name: '2-Day Reminder',
        content: messages.twoDayReminder({fullName: 'Attendee Name'}) // Render with placeholder
      }
    ];

    return res.json(templates);
  } catch (err) {
    console.error('Get message templates error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 7) Send custom message to a registration
app.post('/registrations/:id/send-custom', async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message content required' });
    }

    const reg = await Registration.findById(id);
    if (!reg) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    await sendMessageToRegistration(reg, message);

    return res.json({ success: true });
  } catch (err) {
    console.error('Send custom message error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ---- START EVERYTHING ----
async function start() {
  try {
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI not set in .env');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB ✅');

    app.listen(PORT, () => {
      console.log(`📡 Dashboard API running on http://localhost:${PORT}`);
    });

    client.initialize();
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

start();
