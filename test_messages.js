const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const registrationSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  contactNumber: String,
  paymentStatus: String,
  whatsappInitialSent: Boolean,
});

const Registration = mongoose.model('Registration', registrationSchema);

const messageSendLogSchema = new mongoose.Schema({
  timestamp: Date,
  registrationId: mongoose.Schema.Types.ObjectId,
  phone: String,
  email: String,
  name: String,
  messageType: String,
  status: String,
  error: String
});

const MessageSendLog = mongoose.model('MessageSendLog', messageSendLogSchema);

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get first registration
    const reg = await Registration.findOne().select('_id name email phone contactNumber');
    if (!reg) {
      console.log('❌ No registrations found in database');
      process.exit(1);
    }

    console.log('📋 First Registration:');
    console.log(JSON.stringify({ 
      _id: reg._id.toString(), 
      name: reg.name, 
      email: reg.email, 
      phone: reg.phone || reg.contactNumber 
    }, null, 2));

    // Get message logs for this registration
    const logs = await MessageSendLog.find({ registrationId: reg._id }).sort({ timestamp: -1 }).limit(10);
    
    console.log(`\n📊 Message Logs (${logs.length} found):`);
    if (logs.length === 0) {
      console.log('  No message logs yet. Send a message first to populate logs!');
    } else {
      logs.forEach(log => {
        console.log(`  - [${log.timestamp.toISOString()}] ${log.messageType} → ${log.status}${log.error ? ` (${log.error})` : ''}`);
      });
    }

    console.log(`\n🔗 API Endpoint to test:\nGET /registration/${reg._id}/message-history`);
    console.log(`Header: x-dashboard-key: admin123\n`);

    // Also show the raw JSON structure
    console.log('📋 Expected JSON Response Structure:');
    console.log(JSON.stringify({
      registration: {
        _id: reg._id.toString(),
        name: reg.name,
        email: reg.email,
        phone: reg.phone || reg.contactNumber
      },
      messages: logs.map(l => ({
        timestamp: l.timestamp.toISOString(),
        messageType: l.messageType,
        status: l.status
      }))
    }, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
