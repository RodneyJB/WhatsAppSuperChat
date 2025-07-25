import express from 'express';
import WhatsAppService from './whatsapp.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize WhatsApp service
const whatsappService = new WhatsAppService();

// Global message storage (in production, use a database)
const messages = [];
let messageCounter = 0;

// Helper function to add message to storage
const addMessage = (messageData) => {
  const message = {
    id: Date.now().toString(),
    ...messageData,
    timestamp: new Date(),
    status: 'pending'
  };
  messages.unshift(message);
  messageCounter++;
  return message;
};

// Helper function to update message status
const updateMessageStatus = (id, status) => {
  const message = messages.find(msg => msg.id === id);
  if (message) {
    message.status = status;
  }
  return message;
};

// Initialize WhatsApp service
console.log('Initializing WhatsApp service...');
whatsappService.initialize().catch(error => {
  console.error('Failed to initialize WhatsApp service:', error);
});

// Routes

// SuperChat webhook endpoint
app.post('/superchat', async (req, res) => {
  try {
    console.log('Received SuperChat webhook:', JSON.stringify(req.body, null, 2));
    
    // Validate webhook payload
    if (!req.body.message || !req.body.message.sender || !req.body.message.content) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid webhook payload' 
      });
    }

    const { message } = req.body;
    const senderName = message.sender.name;
    const content = message.content.text;
    const conversationId = message.conversation?.id || 'unknown';
    const attachmentUrl = message.attachments && message.attachments.length > 0 ? message.attachments[0] : undefined;
    
    // Create message record
    const messageRecord = addMessage({
      senderName,
      content,
      conversationId,
      attachmentUrl,
      superchatUrl: `https://app.superchat.com/inbox/${conversationId}`
    });

    try {
      // Send to WhatsApp group
      await whatsappService.sendSuperchatMessage(
        senderName,
        content,
        conversationId,
        attachmentUrl
      );

      // Update message status to delivered
      updateMessageStatus(messageRecord.id, 'delivered');
      
      console.log('✅ Message forwarded to WhatsApp group successfully');
      res.json({ 
        success: true, 
        message: "Message forwarded to WhatsApp group successfully",
        messageId: messageRecord.id
      });
    } catch (whatsappError) {
      console.error('❌ WhatsApp sending failed:', whatsappError);
      
      // Update message status to failed
      updateMessageStatus(messageRecord.id, 'failed');
      
      res.status(500).json({ 
        success: false, 
        error: "Failed to send message to WhatsApp group",
        details: whatsappError.message,
        messageId: messageRecord.id
      });
    }
  } catch (error) {
    console.error('SuperChat webhook error:', error);
    res.status(400).json({ 
      success: false, 
      error: "Invalid webhook payload" 
    });
  }
});

// QR Code endpoint
app.get('/qr', async (req, res) => {
  try {
    const qrCode = await whatsappService.getQRCode();
    const isConnected = whatsappService.isClientReady();
    
    if (qrCode) {
      // Return HTML page with QR code
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>WhatsApp QR Code</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px;
              background-color: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              display: inline-block;
            }
            .status {
              padding: 10px;
              border-radius: 5px;
              margin: 20px 0;
              font-weight: bold;
            }
            .connected { background-color: #d4edda; color: #155724; }
            .waiting { background-color: #fff3cd; color: #856404; }
            img { 
              max-width: 300px; 
              height: auto; 
              border: 2px solid #ddd;
              border-radius: 5px;
            }
            .instructions {
              margin-top: 20px;
              text-align: left;
              background-color: #f8f9fa;
              padding: 15px;
              border-radius: 5px;
            }
            .refresh-btn {
              background-color: #25D366;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 5px;
              cursor: pointer;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔗 WhatsApp Connection</h1>
            ${isConnected ? 
              '<div class="status connected">✅ WhatsApp is connected and ready!</div>' :
              '<div class="status waiting">⏳ Waiting for WhatsApp scan...</div>'
            }
            
            ${qrCode && !isConnected ? 
              `<img src="${qrCode}" alt="WhatsApp QR Code" />
               <div class="instructions">
                 <h3>How to connect:</h3>
                 <ol>
                   <li>Open WhatsApp on your phone</li>
                   <li>Go to Settings → Linked Devices</li>
                   <li>Tap "Link a Device"</li>
                   <li>Scan the QR code above</li>
                 </ol>
               </div>` :
              ''
            }
            
            <br/>
            <button class="refresh-btn" onclick="window.location.reload()">🔄 Refresh Page</button>
            
            <div style="margin-top: 30px; font-size: 12px; color: #666;">
              <p>Business Account: +4917674729899</p>
              <p>Target Group: Weboat++</p>
            </div>
          </div>
          
          <script>
            // Auto-refresh every 10 seconds if not connected
            ${!isConnected ? 'setTimeout(() => window.location.reload(), 10000);' : ''}
          </script>
        </body>
        </html>
      `);
    } else if (isConnected) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>WhatsApp Connected</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px;
              background-color: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              display: inline-block;
            }
            .connected { 
              background-color: #d4edda; 
              color: #155724; 
              padding: 20px;
              border-radius: 5px;
              margin: 20px 0;
              font-weight: bold;
              font-size: 18px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔗 WhatsApp Connection</h1>
            <div class="connected">✅ WhatsApp is connected and ready!</div>
            <p>Your WhatsApp SuperChat bridge is working properly.</p>
            <div style="margin-top: 30px; font-size: 12px; color: #666;">
              <p>Business Account: +4917674729899</p>
              <p>Target Group: Weboat++</p>
            </div>
          </div>
        </body>
        </html>
      `);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>WhatsApp QR Code</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px;
              background-color: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              display: inline-block;
            }
            .waiting { 
              background-color: #fff3cd; 
              color: #856404; 
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔗 WhatsApp Connection</h1>
            <div class="waiting">⏳ Generating QR code...</div>
            <p>Please wait while the QR code is being generated.</p>
            <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #25D366; color: white; border: none; border-radius: 5px;">
              🔄 Refresh Page
            </button>
          </div>
          <script>
            setTimeout(() => window.location.reload(), 5000);
          </script>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('QR code error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>❌ Error</h1>
          <p>Failed to get QR code: ${error.message}</p>
          <button onclick="window.location.reload()">Try Again</button>
        </body>
      </html>
    `);
  }
});

// Test message endpoint
app.post('/test-send', async (req, res) => {
  try {
    if (!whatsappService.isClientReady()) {
      return res.status(400).json({ 
        success: false, 
        error: "WhatsApp client is not ready. Please scan QR code first at /qr" 
      });
    }

    await whatsappService.sendTestMessage();
    
    // Create a test message record
    const testMessage = addMessage({
      senderName: "System Test",
      content: "Testing connection to Weboat++ group",
      conversationId: "test_conversation_123",
      superchatUrl: "https://app.superchat.com/inbox/test_conversation_123"
    });

    updateMessageStatus(testMessage.id, 'delivered');

    console.log('✅ Test message sent successfully');
    res.json({ 
      success: true, 
      message: "Test message sent to WhatsApp group successfully" 
    });
  } catch (error) {
    console.error('❌ Test message error:', error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to send test message",
      details: error.message
    });
  }
});

// Get messages endpoint (for monitoring)
app.get('/messages', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const recentMessages = messages.slice(0, limit);
  res.json(recentMessages);
});

// Status endpoint
app.get('/status', (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const messagesCount = messages.filter(msg => msg.timestamp >= today).length;
  
  res.json({
    whatsapp: {
      isConnected: whatsappService.isClientReady(),
      status: whatsappService.isClientReady() ? 'Connected' : 'Disconnected'
    },
    messagesCount,
    webhook: {
      isActive: true,
      endpoint: "/superchat"
    },
    group: {
      name: "Weboat++",
      status: whatsappService.isClientReady() ? "Connected" : "Disconnected"
    },
    businessAccount: "+4917674729899"
  });
});

// Root endpoint with basic info
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp SuperChat Bridge</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          max-width: 800px; 
          margin: 0 auto; 
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .endpoint {
          background-color: #f8f9fa;
          padding: 10px;
          margin: 10px 0;
          border-radius: 5px;
          font-family: monospace;
        }
        .status {
          padding: 10px;
          border-radius: 5px;
          margin: 10px 0;
          font-weight: bold;
        }
        .connected { background-color: #d4edda; color: #155724; }
        .disconnected { background-color: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📱 WhatsApp SuperChat Bridge</h1>
        <p>Server is running and ready to forward SuperChat messages to WhatsApp group.</p>
        
        <div class="status ${whatsappService.isClientReady() ? 'connected' : 'disconnected'}">
          WhatsApp Status: ${whatsappService.isClientReady() ? '✅ Connected' : '❌ Disconnected'}
        </div>
        
        <h3>📋 Available Endpoints:</h3>
        <div class="endpoint">POST /superchat - SuperChat webhook endpoint</div>
        <div class="endpoint">GET /qr - WhatsApp QR code for authentication</div>
        <div class="endpoint">POST /test-send - Send test message to WhatsApp group</div>
        <div class="endpoint">GET /status - System status</div>
        <div class="endpoint">GET /messages - Recent messages</div>
        
        <h3>⚙️ Configuration:</h3>
        <ul>
          <li><strong>Business Account:</strong> +4917674729899</li>
          <li><strong>Target Group:</strong> Weboat++</li>
          <li><strong>SuperChat Webhook:</strong> ${req.protocol}://${req.get('host')}/superchat</li>
        </ul>
        
        <h3>📝 SuperChat Webhook Format:</h3>
        <pre style="background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto;">
{
  "message": {
    "sender": { "name": "{{contact.fullName}}" },
    "content": { "text": "{{message.text}}" },
    "attachments": [ "{{message.media.url}}" ],
    "conversation": { "id": "{{conversation.id}}" }
  }
}</pre>
        
        <div style="margin-top: 30px; text-align: center;">
          <a href="/qr" style="background: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            🔗 Connect WhatsApp
          </a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down WhatsApp service...');
  try {
    await whatsappService.destroy();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WhatsApp SuperChat Bridge server running on port ${PORT}`);
  console.log(`📱 Visit /qr to connect your WhatsApp`);
  console.log(`🔗 SuperChat webhook URL: /superchat`);
  console.log(`🧪 Test endpoint: /test-send`);
});

export default app;