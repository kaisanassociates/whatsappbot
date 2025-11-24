// constants.js - Centralized configuration and enums
module.exports = {
  // Payment statuses
  PAYMENT_STATUSES: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled'
  },

  // Ticket types
  TICKET_TYPES: {
    STANDARD: 'standard',
    PREMIUM: 'premium',
    VIP: 'vip'
  },

  // Message types
  MESSAGE_TYPES: {
    INITIAL: 'initial',
    FOLLOW_UP: 'followUp',
    FINAL_REMINDER: 'finalReminder',
    CONFIRMED: 'confirmed',
    TWO_DAY_REMINDER: 'twoDayReminder',
    BULK: 'bulk'
  },

  // Operation actions
  OPERATION_ACTIONS: {
    BULK_SEND: 'bulk_send',
    CUSTOM_SEND: 'custom_send',
    TEMPLATE_UPDATE: 'template_update',
    SCHEDULER_TOGGLE: 'scheduler_toggle'
  },

  // Message send status
  MESSAGE_SEND_STATUS: {
    SUCCESS: 'success',
    FAILED: 'failed'
  },

  // Validation patterns
  PATTERNS: {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE_LENGTH_MIN: 10,
    PHONE_LENGTH_MAX: 15,
    PHONE_DIGITS_ONLY: /\D+/g
  },

  // API limits
  API_LIMITS: {
    MAX_REGISTRATIONS_PER_PAGE: 200,
    SCHEDULER_BATCH_SIZE: 50,
    OPERATION_LOGS_LIMIT: 100,
    MESSAGE_LOGS_LIMIT: 500
  },

  // Message send delays (ms)
  DELAYS: {
    MESSAGE_SEND_DELAY: 500, // 500ms between sends to avoid WhatsApp rate limiting
    DB_LOG_RETRY_DELAY: 1000 // 1s before retrying failed log
  },

  // Scheduler intervals (in days)
  SCHEDULER_INTERVALS: {
    FOLLOW_UP_DAYS: 2,
    FINAL_REMINDER_DAYS: 5
  },

  // Error messages
  ERRORS: {
    INVALID_PHONE: 'Invalid phone number',
    INVALID_MESSAGE_TYPE: 'Invalid message type',
    INVALID_PAYMENT_STATUS: 'Invalid payment status',
    NOT_FOUND: 'Resource not found',
    UNAUTHORIZED: 'Unauthorized - invalid dashboard key',
    WHATSAPP_NOT_READY: 'WhatsApp client not ready',
    INTERNAL_ERROR: 'Internal server error'
  },

  // Log retention (days)
  LOG_RETENTION_DAYS: 90
};
