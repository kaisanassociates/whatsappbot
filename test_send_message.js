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
      console.log('❌ No registrations found');
      process.exit(1);
    }

    console.log('📋 Registration:');
    console.log(`  Name: ${reg.name}`);
    console.log(`  Email: ${reg.email}`);
    console.log(`  Phone: ${reg.phone || reg.contactNumber}\n`);

    // Simulate a message send log (test data)
    console.log('📝 Creating test message logs...\n');
    
    const testLogs = [
      {
        registrationId: reg._id,
        phone: reg.phone || reg.contactNumber,
        email: reg.email,
        name: reg.name,
        messageType: 'initial',
        status: 'success',
        timestamp: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
      },
      {
        registrationId: reg._id,
        phone: reg.phone || reg.contactNumber,
        email: reg.email,
        name: reg.name,
        messageType: 'bulk',
        status: 'success',
        timestamp: new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
      },
      {
        registrationId: reg._id,
        phone: reg.phone || reg.contactNumber,
        email: reg.email,
        name: reg.name,
        messageType: 'followUp',
        status: 'success',
        timestamp: new Date() // just now
      }
    ];

    // Insert test logs
    await MessageSendLog.insertMany(testLogs);
    console.log('✅ Test message logs created\n');

    // Retrieve and display
    const logs = await MessageSendLog.find({ registrationId: reg._id }).sort({ timestamp: -1 });
    
    console.log(`📊 Message History (${logs.length} messages):`);
    logs.forEach(log => {
      console.log(`  - [${log.timestamp.toISOString()}] ${log.messageType.padEnd(15)} → ${log.status}`);
    });

    console.log(`\n📤 Expected API Response Format:\n`);
    const response = {
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
    };
    console.log(JSON.stringify(response, null, 2));

    console.log(`\n\n🔗 Test the API:\n`);
    console.log(`curl -X GET "http://localhost:4000/registration/${reg._id}/message-history" \\`);
    console.log(`  -H "x-dashboard-key: admin123" \\`);
    console.log(`  -H "Content-Type: application/json"\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
