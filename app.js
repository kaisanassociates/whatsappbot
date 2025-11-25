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
const ENABLE_AUTO_SCHEDULERS = process.env.ENABLE_AUTO_SCHEDULERS === 'true'; // Disabled by default

// ---- EXPRESS SETUP ----
const app = express();
app.use(cors());
app.use(express.json());
// Serve dashboard assets
app.use(express.static('public'));

// Dashboard authentication middleware
function requireDashboardAuth(req, res, next) {
  const secret = process.env.DASHBOARD_SECRET;
  // If no secret configured, deny mutating operations for safety
  if (!secret) {
    return res.status(401).json({ error: 'Dashboard secret not configured' });
  }

  const key = req.headers['x-dashboard-key'] || req.query.dashboardKey;
  if (!key || key !== secret) {
    return res.status(401).json({ error: 'Unauthorized - invalid dashboard key' });
  }

  next();
}

// ---- MONGODB SETUP ----
const registrationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  phone: { type: String, required: true, index: true },
  organization: String,
  ticketType: { type: String, enum: ['standard', 'premium', 'vip'], default: 'standard' },
  paymentStatus: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending', index: true },
  registrationDate: { type: Date, default: Date.now, index: true },
  attended: { type: Boolean, default: false },
  checkInTime: Date,
  // Extended fields
  fullName: String,
  contactNumber: { type: String, index: true },
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
  whatsappInitialSent: { type: Boolean, default: false, index: true },
  whatsappFollowUpSent: { type: Boolean, default: false, index: true },
  whatsappFinalReminderSent: { type: Boolean, default: false, index: true },
  whatsappConfirmedSent: { type: Boolean, default: false, index: true },
  whatsappTwoDayReminderSent: { type: Boolean, default: false, index: true }
});

const Registration =
  mongoose.models.Registration || mongoose.model('Registration', registrationSchema);

// Operation log schema for audit trail
const operationLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  action: String,
  messageType: String,
  targetCount: Number,
  successCount: Number,
  failedCount: Number,
  registrationIds: [String],
  details: String
});

const OperationLog = mongoose.models.OperationLog || mongoose.model('OperationLog', operationLogSchema);

// Message send log schema - tracks every message sent
const messageSendLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  registrationId: { type: mongoose.Schema.Types.ObjectId, index: true },
  phone: { type: String, index: true },
  email: { type: String, index: true },
  name: String,
  messageType: { type: String, enum: ['initial', 'followUp', 'finalReminder', 'confirmed', 'twoDayReminder', 'bulk'], index: true },
  status: { type: String, enum: ['success', 'failed'], default: 'success', index: true },
  error: String
});

const MessageSendLog = mongoose.models.MessageSendLog || mongoose.model('MessageSendLog', messageSendLogSchema);

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
  if (ENABLE_AUTO_SCHEDULERS) {
    startSchedulers();
  } else {
    console.log('⚠️  Auto-schedulers are DISABLED. Set ENABLE_AUTO_SCHEDULERS=true in .env to enable them.');
  }
});

client.on('auth_failure', (msg) => {
  console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
  console.log('Client was logged out', reason);
});

// ---- HELPERS ----
function formatWhatsAppNumber(phone) {
  if (!phone) return null;

  // Remove all non-digit characters
  let p = String(phone).replace(/\D+/g, '');

  // Remove leading zeros
  p = p.replace(/^0+/, '');

  // If it's a 10-digit number, assume Indian mobile and add country code 91
  if (p.length === 10) {
    p = '91' + p;
  }

  // Basic validation: must be at least 11 digits (country + number)
  if (p.length < 11 || p.length > 15) return null;

  return p + '@c.us';
}

async function sendMessageToRegistration(reg, text, messageType = 'bulk') {
  const rawPhone = reg.contactNumber || reg.phone || '';
  const chatId = formatWhatsAppNumber(rawPhone);

  if (!chatId) {
    console.log('No valid phone for registration:', reg._id);
    // Log the failed send
    try {
      await MessageSendLog.create({
        registrationId: reg._id,
        phone: rawPhone,
        email: reg.email,
        name: reg.name,
        messageType,
        status: 'failed',
        error: 'Invalid phone number'
      });
    } catch (logErr) {
      console.error('Failed to log message send:', logErr);
    }
    return false;
  }

  try {
    if (!client || !client.info) {
      console.warn('WhatsApp client not ready, cannot send message yet');
      return false;
    }

    await client.sendMessage(chatId, text);
    console.log(`✅ Message sent to ${rawPhone} (${reg.email})`);
    
    // Log the successful send
    try {
      await MessageSendLog.create({
        registrationId: reg._id,
        phone: rawPhone,
        email: reg.email,
        name: reg.name,
        messageType,
        status: 'success'
      });
    } catch (logErr) {
      console.error('Failed to log successful message send:', logErr);
    }
    
    return true;
  } catch (err) {
    console.error(`❌ Failed to send message to ${rawPhone}`, err);
    
    // Log the failed send
    try {
      await MessageSendLog.create({
        registrationId: reg._id,
        phone: rawPhone,
        email: reg.email,
        name: reg.name,
        messageType,
        status: 'failed',
        error: err.message
      });
    } catch (logErr) {
      console.error('Failed to log failed message send:', logErr);
    }
    
    return false;
  }
}

// ---- CRON SCHEDULERS (Disabled by default; set ENABLE_AUTO_SCHEDULERS=true to enable) ----
function startSchedulers() {
  if (!ENABLE_AUTO_SCHEDULERS) {
    console.log('Auto-schedulers are disabled.');
    return;
  }
  startSchedulersWithJobs();
}

function startSchedulersWithJobs() {
  // Only start if not already running
  if (schedulerJobs.length > 0) {
    console.log('Schedulers already running.');
    return;
  }

  // Initial message for new pending registrations
  const job1 = cron.schedule('* * * * *', async () => {
    try {
      const regs = await Registration.find({
        paymentStatus: 'pending',
        whatsappInitialSent: { $ne: true },
      }).limit(50);

      for (const reg of regs) {
        const ok = await sendMessageToRegistration(reg, messages.initial(reg), 'initial');
        if (ok) {
          reg.whatsappInitialSent = true;
          await reg.save();
        }
      }
    } catch (err) {
      console.error('Error in initial message job:', err);
    }
  });
  schedulerJobs.push(job1);

  // Follow-up reminder
  const job2 = cron.schedule('*/5 * * * *', async () => {
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
        const ok = await sendMessageToRegistration(reg, messages.followUp(reg), 'followUp');
        if (ok) {
          reg.whatsappFollowUpSent = true;
          await reg.save();
        }
      }
    } catch (err) {
      console.error('Error in follow-up job:', err);
    }
  });
  schedulerJobs.push(job2);

  // Final reminder
  const job3 = cron.schedule('*/10 * * * *', async () => {
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
        const ok = await sendMessageToRegistration(reg, messages.finalReminder(reg), 'finalReminder');
        if (ok) {
          reg.whatsappFinalReminderSent = true;
          await reg.save();
        }
      }
    } catch (err) {
      console.error('Error in final reminder job:', err);
    }
  });
  schedulerJobs.push(job3);

  // Confirmed message (if not yet sent)
  const job4 = cron.schedule('0 9 * * *', async () => {
    try {
      const regs = await Registration.find({
        paymentStatus: 'confirmed',
        whatsappConfirmedSent: { $ne: true },
      });

      for (const reg of regs) {
        const ok = await sendMessageToRegistration(reg, messages.confirmed(reg), 'confirmed');
        if (ok) {
          reg.whatsappConfirmedSent = true;
          await reg.save();
        }
      }
    } catch (err) {
      console.error('Error in confirmed message job:', err);
    }
  });
  schedulerJobs.push(job4);

  // 2-day reminder before event
  const job5 = cron.schedule('0 10 * * *', async () => {
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
        const ok = await sendMessageToRegistration(reg, messages.twoDayReminder(reg), 'twoDayReminder');
        if (ok) {
          reg.whatsappTwoDayReminderSent = true;
          await reg.save();
        }
      }
    } catch (err) {
      console.error('Error in 2-day reminder job:', err);
    }
  });
  schedulerJobs.push(job5);

  console.log('✅ Auto-schedulers started');
}

// ---- API ENDPOINTS ----
// Scheduler state management
let runtimeSchedulersEnabled = ENABLE_AUTO_SCHEDULERS;
let schedulerJobs = [];

// 1) Stats for dashboard
app.get('/stats', requireDashboardAuth, async (req, res) => {
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
app.get('/registrations', requireDashboardAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;

    // Validate pagination params
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const skip = (pageNum - 1) * pageSize;

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

    const total = await Registration.countDocuments(query);
    const regs = await Registration.find(query)
      .sort({ registrationDate: -1 })
      .skip(skip)
      .limit(pageSize);

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

    return res.json({
      data: simplified,
      pagination: {
        total,
        page: pageNum,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (err) {
    console.error('Registrations error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 3) Test message endpoint
app.post('/send-test', requireDashboardAuth, async (req, res) => {
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

    if (!client || !client.info) {
      return res.status(503).json({ success: false, error: 'WhatsApp client not ready' });
    }

    await client.sendMessage(chatId, message);
    return res.json({ success: true, message: 'Message sent successfully!' });
  } catch (err) {
    console.error('Test message error:', err);
    return res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// 4) Send one of the templates to a registration
app.post('/registrations/:id/send', requireDashboardAuth, async (req, res) => {
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
app.put('/registrations/:id/paymentStatus', requireDashboardAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    if (!['pending', 'confirmed', 'cancelled'].includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid paymentStatus' });
    }

    const reg = await Registration.findByIdAndUpdate(id, { paymentStatus }, { new: true });
    if (!reg) return res.status(404).json({ error: 'Registration not found' });

    // If payment confirmed, attempt to send confirmation message (once)
    if (paymentStatus === 'confirmed' && !reg.whatsappConfirmedSent) {
      try {
        const ok = await sendMessageToRegistration(reg, messages.confirmed(reg));
        if (ok) {
          reg.whatsappConfirmedSent = true;
          await reg.save();
        }
      } catch (err) {
        console.error('Failed to send confirmation message after payment update:', err);
      }
    }

    return res.json({ id: reg._id, paymentStatus: reg.paymentStatus });
  } catch (err) {
    console.error('Update paymentStatus error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Health / readiness endpoint
app.get('/health', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState; // 0 = disconnected, 1 = connected
    const waReady = !!(client && client.info);

    return res.json({
      ok: true,
      db: dbState === 1 ? 'connected' : 'disconnected',
      whatsappClientReady: waReady,
    });
  } catch (err) {
    console.error('Health check error:', err);
    return res.status(500).json({ ok: false });
  }
});

// 6) Get available message templates
app.get('/message-templates', requireDashboardAuth, async (req, res) => {
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
app.post('/registrations/:id/send-custom', requireDashboardAuth, async (req, res) => {
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

    const ok = await sendMessageToRegistration(reg, message);

    // Log operation
    if (ok) {
      await OperationLog.create({
        action: 'custom_send',
        targetCount: 1,
        successCount: 1,
        failedCount: 0,
        registrationIds: [id],
        details: 'Custom message sent from dashboard'
      });
    }

    return res.json({ success: ok });
  } catch (err) {
    console.error('Send custom message error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 8) BULK SEND - Send a template to multiple selected registrations (dashboard only)
app.post('/bulk-send', requireDashboardAuth, async (req, res) => {
  try {
    const { registrationIds, messageType } = req.body;

    if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
      return res.status(400).json({ error: 'registrationIds array required and must not be empty' });
    }

    // Limit bulk send to prevent DoS
    const MAX_BULK_SEND = 1000;
    if (registrationIds.length > MAX_BULK_SEND) {
      return res.status(400).json({ error: `Cannot send to more than ${MAX_BULK_SEND} registrations at once` });
    }

    if (!['initial', 'followUp', 'finalReminder', 'confirmed', 'twoDayReminder'].includes(messageType)) {
      return res.status(400).json({ error: 'Invalid messageType' });
    }

    // Fetch only the selected registrations
    const regs = await Registration.find({ _id: { $in: registrationIds } });

    if (regs.length === 0) {
      return res.status(404).json({ error: 'No registrations found' });
    }

    let successCount = 0;
    let failedCount = 0;
    let skippedDuplicates = 0;
    let skippedStatusMismatch = 0;
    const sendResults = []; // Track individual send results with reasons

    for (const reg of regs) {
      // Check if already sent to prevent duplicates
      const flagField = messageType === 'initial' ? 'whatsappInitialSent'
        : messageType === 'followUp' ? 'whatsappFollowUpSent'
        : messageType === 'finalReminder' ? 'whatsappFinalReminderSent'
        : messageType === 'confirmed' ? 'whatsappConfirmedSent'
        : 'whatsappTwoDayReminderSent';

      if (reg[flagField] === true) {
        console.log(`⏭️  Skipping ${reg.email} - ${messageType} already sent`);
        skippedDuplicates++;
        sendResults.push({
          registrationId: reg._id.toString(),
          email: reg.email,
          phone: reg.phone || reg.contactNumber,
          status: 'skipped',
          reason: `${messageType} message already sent previously`
        });
        continue;
      }

      // Check for correct payment status before sending
      const allowedStatuses = {
        initial: ['pending'],
        followUp: ['pending'],
        finalReminder: ['pending'],
        confirmed: ['confirmed'],
        twoDayReminder: ['confirmed'],
      };

      if (!allowedStatuses[messageType].includes(reg.paymentStatus)) {
        console.log(`⏭️  Skipping ${reg.email} - incorrect status '${reg.paymentStatus}' for message '${messageType}'`);
        skippedStatusMismatch++;
        sendResults.push({
          registrationId: reg._id.toString(),
          email: reg.email,
          phone: reg.phone || reg.contactNumber,
          status: 'skipped',
          reason: `Incorrect payment status: is '${reg.paymentStatus}', but message type '${messageType}' requires one of '${allowedStatuses[messageType].join(', ')}'`
        });
        continue;
      }

      const text = messages[messageType](reg);
      const ok = await sendMessageToRegistration(reg, text, messageType);
      if (ok) {
        reg[flagField] = true;
        await reg.save();
        successCount++;
        sendResults.push({
          registrationId: reg._id.toString(),
          email: reg.email,
          phone: reg.phone || reg.contactNumber,
          status: 'success',
          reason: 'Message sent successfully'
        });
      } else {
        failedCount++;
        sendResults.push({
          registrationId: reg._id.toString(),
          email: reg.email,
          phone: reg.phone || reg.contactNumber,
          status: 'failed',
          reason: 'WhatsApp send failed (invalid number or client not ready)'
        });
      }
    }

    // Log the bulk operation
    const log = await OperationLog.create({
      action: 'bulk_send',
      messageType,
      targetCount: regs.length,
      successCount,
      failedCount,
      registrationIds: regs.map(r => r._id.toString()),
      details: `Sent to ${successCount}/${regs.length} (${skippedDuplicates} skipped as duplicate, ${skippedStatusMismatch} skipped for status mismatch, ${failedCount} failed)`
    });

    return res.json({
      success: true,
      targetCount: regs.length,
      successCount,
      failedCount,
      skippedDuplicates,
      skippedStatusMismatch,
      results: sendResults,
      summary: {
        sent: `${successCount} message(s) sent successfully`,
        skipped: `${skippedDuplicates} message(s) skipped (already sent)`,
        skippedStatusMismatch: `${skippedStatusMismatch} message(s) skipped (incorrect payment status)`,
        failed: `${failedCount} message(s) failed to send`
      },
      logId: log._id
    });
  } catch (err) {
    console.error('Bulk send error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 9) Get operation logs (dashboard only)
app.get('/operation-logs', requireDashboardAuth, async (req, res) => {
  try {
    const logs = await OperationLog.find({})
      .sort({ timestamp: -1 })
      .limit(100);

    return res.json(logs);
  } catch (err) {
    console.error('Get logs error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 9a) Get message send logs - view all messages sent to registrations (dashboard only)
app.get('/message-send-logs', requireDashboardAuth, async (req, res) => {
  try {
    const { registrationId, phone, messageType, limit = 500 } = req.query;
    const filter = {};
    
    if (registrationId) filter.registrationId = registrationId;
    if (phone) filter.phone = new RegExp(phone, 'i');
    if (messageType) filter.messageType = messageType;
    
    const logs = await MessageSendLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    
    return res.json(logs);
  } catch (err) {
    console.error('Get message send logs error:', err);
    return res.json([]);
  }
});

// 9b) Get detailed message history for a registration (dashboard only)
app.get('/registration/:id/message-history', requireDashboardAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await MessageSendLog.find({ registrationId: id })
      .sort({ timestamp: -1 });
    
    const reg = await Registration.findById(id).select('name email phone contactNumber');
    
    return res.json({
      registration: reg,
      messages: logs
    });
  } catch (err) {
    console.error('Get message history error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 9c) Statistics for dashboard - message send stats (dashboard only)
app.get('/message-stats', requireDashboardAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const totalSent = await MessageSendLog.countDocuments({ status: 'success' });
    const sentToday = await MessageSendLog.countDocuments({ 
      status: 'success',
      timestamp: { $gte: today }
    });
    const failedMessages = await MessageSendLog.countDocuments({ status: 'failed' });
    
    const messagesByType = await MessageSendLog.aggregate([
      { $group: { _id: '$messageType', count: { $sum: 1 }, success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } } } }
    ]);
    
    return res.json({
      totalSent,
      sentToday,
      failedMessages,
      messagesByType
    });
  } catch (err) {
    console.error('Get message stats error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 13) Get all message templates (dashboard only)
app.get('/templates', requireDashboardAuth, async (req, res) => {
  try {
    const templates = {
      initial: messages.initial({ fullName: 'Attendee' }),
      followUp: messages.followUp({ fullName: 'Attendee' }),
      finalReminder: messages.finalReminder({ fullName: 'Attendee' }),
      confirmed: messages.confirmed({ fullName: 'Attendee' }),
      twoDayReminder: messages.twoDayReminder({ fullName: 'Attendee' })
    };
    return res.json(templates);
  } catch (err) {
    console.error('Get templates error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 14) Update a message template (dashboard only)
app.put('/templates/:type', requireDashboardAuth, async (req, res) => {
  try {
    const { type } = req.params;
    let { content } = req.body;

    if (!['initial', 'followUp', 'finalReminder', 'confirmed', 'twoDayReminder'].includes(type)) {
      return res.status(400).json({ error: 'Invalid template type' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a non-empty string' });
    }

    // Trim whitespace
    content = content.trim();
    if (content.length === 0) {
      return res.status(400).json({ error: 'Content cannot be empty' });
    }

    // Limit content length to prevent abuse
    const MAX_TEMPLATE_LENGTH = 4096;
    if (content.length > MAX_TEMPLATE_LENGTH) {
      return res.status(400).json({ error: `Content exceeds maximum length of ${MAX_TEMPLATE_LENGTH} characters` });
    }

    // Update the messages module in memory
    messages[type] = () => content;

    // Log the update
    await OperationLog.create({
      action: 'template_update',
      messageType: type,
      targetCount: 1,
      successCount: 1,
      failedCount: 0,
      details: `Template "${type}" updated by admin (${content.length} chars)`
    });

    return res.json({ success: true, message: `Template "${type}" updated (${content.length} chars)` });
  } catch (err) {
    console.error('Update template error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// 15) Get scheduler status and toggle (dashboard only)
app.get('/scheduler-status', requireDashboardAuth, async (req, res) => {
  try {
    return res.json({
      enabled: runtimeSchedulersEnabled,
      configuredValue: ENABLE_AUTO_SCHEDULERS
    });
  } catch (err) {
    console.error('Get scheduler status error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/scheduler-toggle', requireDashboardAuth, async (req, res) => {
  try {
    const { enable } = req.body;

    if (typeof enable !== 'boolean') {
      return res.status(400).json({ error: 'Enable flag (boolean) required' });
    }

    runtimeSchedulersEnabled = enable;

    if (enable && schedulerJobs.length === 0) {
      // Start schedulers
      startSchedulersWithJobs();
    } else if (!enable && schedulerJobs.length > 0) {
      // Stop all scheduler jobs
      schedulerJobs.forEach(job => {
        if (job.stop) job.stop();
      });
      schedulerJobs = [];
    }

    // Log the toggle
    await OperationLog.create({
      action: 'scheduler_toggle',
      targetCount: 1,
      successCount: 1,
      failedCount: 0,
      details: `Auto-schedulers ${enable ? 'enabled' : 'disabled'}`
    });

    return res.json({
      success: true,
      enabled: runtimeSchedulersEnabled,
      message: `Schedulers ${enable ? 'enabled' : 'disabled'}`
    });
  } catch (err) {
    console.error('Toggle scheduler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ---- START EVERYTHING ----
async function start() {
  try {
    // Validate configuration
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI not set in .env');
      process.exit(1);
    }

    // Validate EVENT_DATE format
    if (isNaN(EVENT_DATE.getTime())) {
      console.error('❌ Invalid EVENT_DATE format in .env. Use YYYY-MM-DD format (e.g., 2025-12-20)');
      process.exit(1);
    }

    if (EVENT_DATE < new Date()) {
      console.warn('⚠️  EVENT_DATE is in the past. Two-day reminders will not be sent.');
    }

    if (!process.env.DASHBOARD_SECRET) {
      console.warn('⚠️  DASHBOARD_SECRET not configured. Dashboard will be inaccessible.');
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
