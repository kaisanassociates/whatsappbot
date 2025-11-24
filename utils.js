// utils.js - Utility functions for the WhatsApp bot

/**
 * Rate limiter to prevent sending too many messages too fast
 * WhatsApp may rate-limit or block if messages are sent too rapidly
 */
class RateLimiter {
  constructor(delayMs = 500) {
    this.delayMs = delayMs;
    this.lastSendTime = 0;
  }

  async wait() {
    const timeSinceLastSend = Date.now() - this.lastSendTime;
    if (timeSinceLastSend < this.delayMs) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs - timeSinceLastSend));
    }
    this.lastSendTime = Date.now();
  }

  reset() {
    this.lastSendTime = 0;
  }
}

/**
 * Retry utility for failed database operations
 */
async function retryAsync(fn, maxAttempts = 3, delayMs = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt}/${maxAttempts} failed. Retrying in ${delayMs}ms...`, error.message);
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

/**
 * Format phone number for WhatsApp with error handling
 */
function validateAndFormatPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove all non-digit characters
  let p = String(phone).replace(/\D+/g, '');

  // Remove leading zeros
  p = p.replace(/^0+/, '');

  // If it's a 10-digit number, assume Indian mobile and add country code 91
  if (p.length === 10) {
    p = '91' + p;
  }

  // Basic validation: must be at least 11 digits (country + number)
  if (p.length < 11 || p.length > 15) {
    return null;
  }

  return p + '@c.us';
}

/**
 * Get the database flag field name for a message type
 */
function getFlagFieldForMessageType(messageType) {
  const mapping = {
    'initial': 'whatsappInitialSent',
    'followUp': 'whatsappFollowUpSent',
    'finalReminder': 'whatsappFinalReminderSent',
    'confirmed': 'whatsappConfirmedSent',
    'twoDayReminder': 'whatsappTwoDayReminderSent'
  };
  return mapping[messageType] || null;
}

/**
 * Validate date string in YYYY-MM-DD format
 */
function validateDateString(dateStr) {
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) ? date : null;
}

module.exports = {
  RateLimiter,
  retryAsync,
  validateAndFormatPhone,
  getFlagFieldForMessageType,
  validateDateString
};
