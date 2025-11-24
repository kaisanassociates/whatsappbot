// messages.js - INFLUENCIA WhatsApp message templates
module.exports = {
  initial: (registration) => {
    const name = registration.fullName || registration.name || 'Attendee';
    return `🎉 Hello ${name}!

Thank you for registering for *INFLUENCIA Edition 2.0* - Program Your 2026

📅 *Event Date:* Saturday, 20 December 2025
📍 *Venue:* Nilgiri College of Arts and Science

⚠️ *Payment Pending*
Your registration is confirmed, but we haven't received your payment yet.

💰 *Registration Fee:* ₹2999

💳 *Click below to pay now:*
upi://pay?ver=01&mode=01&pa=c0j9uodoggyh@idbi&pn=KAISAN%20ASSOCIATES%20LLP&mc=5816&qrMedium=06&am=2999&cu=INR

_👆 Click the link above to complete payment securely via UPI_

Please complete your payment at your earliest convenience to secure your spot.

For queries, contact:
📞 +91 858 999 00 60
📧 info@kaisanassociates.com

See you at INFLUENCIA! 🎯

_Kaisan Associates_`;
  },

  followUp: (registration) => {
    const name = registration.fullName || registration.name || 'Attendee';
    return `👋 Hello ${name},

This is a gentle reminder about your pending payment for *INFLUENCIA Edition 2.0*.

📅 Event Date: *20 December 2025*

⏰ *Your registration is on hold* until we receive your payment.

💰 *Amount:* ₹2999

💳 *Click below to pay now:*
upi://pay?ver=01&mode=01&pa=c0j9uodoggyh@idbi&pn=KAISAN%20ASSOCIATES%20LLP&mc=5816&qrMedium=06&am=2999&cu=INR

_👆 Tap the link above to complete payment instantly via UPI_

Don't miss out on this transformative experience! Complete your payment today.

Questions? We're here to help:
📞 +91 858 999 00 60
📧 info@kaisanassociates.com

_Kaisan Associates_`;
  },

  finalReminder: (registration) => {
    const name = registration.fullName || registration.name || 'Attendee';
    return `⚠️ Hello ${name},

*INFLUENCIA Edition 2.0* is just around the corner! 🎯

📅 *Event Date:* Saturday, 20 December 2025

⚠️ *PAYMENT STILL PENDING*

This is your final reminder to complete your registration payment. Your spot may be released if payment is not received soon.

💰 *Amount:* ₹2999

💳 *PAY NOW - Click below:*
upi://pay?ver=01&mode=01&pa=c0j9uodoggyh@idbi&pn=KAISAN%20ASSOCIATES%20LLP&mc=5816&qrMedium=06&am=2999&cu=INR

_👆 TAP NOW to secure your spot! Payment takes just 30 seconds_

⏰ *Time is running out!*

For immediate assistance:
📞 +91 858 999 00 60
📧 info@kaisanassociates.com

We look forward to seeing you at INFLUENCIA!

_Kaisan Associates_`;
  },

  confirmed: (registration) => {
    const name = registration.fullName || registration.name || 'Attendee';
    return `Congratulations ${name}! 

Your seat is confirmed for Dr. Rashid Gazzali's transformative program: Programming 2026: Shaping the Year Ahead.

Get ready to explore the PRP Framework —
🔹 Personal Mastery
🔹 Relationship Building
🔹 Professional Excellence

📍 Nilgiri College of Arts and Science
🗓 December 20, 2025 | 9:00 AM – 6:00 PM

We're excited to have you join this journey of growth, learning, and inspiration.

_Kaisan Associates_`;
  },

  twoDayReminder: (registration) => {
    const name = registration.fullName || registration.name || 'Attendee';
    return `Hello ${name}! 

Just 2 days to go! 🎯

Your seat is confirmed for *INFLUENCIA EDITION 2.0 2026* with Dr. Rashid Gazzali.

📍 Nilgiri College of Arts and Science
🗓 December 20, 2025 | 9:00 AM – 6:00 PM

See you soon! 🚀

_Kaisan Associates_`;
  }
};
