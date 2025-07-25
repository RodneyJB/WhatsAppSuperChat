const WhatsAppService = require('./whatsapp.js');

const testSend = async () => {
  console.log('Starting WhatsApp test send...');
  
  const whatsapp = new WhatsAppService();
  
  try {
    console.log('Initializing WhatsApp client...');
    await whatsapp.initialize();
    
    // Wait for client to be ready
    let attempts = 0;
    const maxAttempts = 60; // Wait up to 60 seconds
    
    while (!whatsapp.isClientReady() && attempts < maxAttempts) {
      console.log(`Waiting for WhatsApp client to be ready... (${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    if (!whatsapp.isClientReady()) {
      console.error('WhatsApp client is not ready. Please make sure you have scanned the QR code.');
      console.log('Visit /qr endpoint to get the QR code for authentication.');
      process.exit(1);
    }
    
    console.log('WhatsApp client is ready! Sending test message...');
    
    // Send test message
    await whatsapp.sendTestMessage();
    
    console.log('✅ Test message sent successfully to Weboat++ group!');
    
  } catch (error) {
    console.error('❌ Error sending test message:', error.message);
    process.exit(1);
  } finally {
    // Clean up
    await whatsapp.destroy();
    process.exit(0);
  }
};

// Run if this file is executed directly
if (require.main === module) {
  testSend();
}

module.exports = testSend;