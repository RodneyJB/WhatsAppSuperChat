const express = require('express');
const PersistentWhatsAppService = require('./db-whatsapp.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize persistent WhatsApp service
const whatsappService = new PersistentWhatsAppService();

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
console.log('Initializing persistent WhatsApp service...');
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

// QR Code endpoint with enhanced information
app.get('/qr', async (req, res) => {
  try {
    const qrCode = await whatsappService.getQRCode();
    const connectionInfo = await whatsappService.getConnectionInfo();
    
    if (connectionInfo.isReady) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>WhatsApp - Connected</title>
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
              max-width: 600px;
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
            .info {
              background-color: #f8f9fa;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              text-align: left;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔗 WhatsApp SuperChat Bridge</h1>
            <div class="connected">✅ WhatsApp is connected and ready!</div>
            
            <div class="info">
              <h3>Connection Status:</h3>
              <ul>
                <li><strong>Status:</strong> Connected & Persistent</li>
                <li><strong>Business Account:</strong> +4917674729899</li>
                <li><strong>Target Group:</strong> Weboat++</li>
                <li><strong>Last Connected:</strong> ${connectionInfo.lastConnected || 'Just now'}</li>
                <li><strong>Server Uptime:</strong> ${Math.floor(connectionInfo.uptime / 60)} minutes</li>
                <li><strong>Session Saved:</strong> ${connectionInfo.hasSession ? 'Yes' : 'No'}</li>
              </ul>
            </div>
            
            <div class="info">
              <h3>✅ Your SuperChat automation is working!</h3>
              <p>Messages will be automatically forwarded to your WhatsApp group.</p>
              <p>The connection is persistent and will survive server restarts.</p>
            </div>
            
            <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #25D366; color: white; border: none; border-radius: 5px;">
              🔄 Refresh Status
            </button>
          </div>
        </body>
        </html>
      `);
    } else if (qrCode) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>WhatsApp QR Code - Scan Once</title>
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
            .important {
              background-color: #d1ecf1;
              color: #0c5460;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔗 One-Time WhatsApp Setup</h1>
            <div class="status waiting">⏳ Scan QR code for persistent connection</div>
            
            <img src="${qrCode}" alt="WhatsApp QR Code" />
            
            <div class="important">
              <h3>🎯 Important: This is a ONE-TIME setup!</h3>
              <p>After scanning, your WhatsApp will stay connected for months, even after server restarts.</p>
              <p>You won't need to scan again unless you manually disconnect.</p>
            </div>
            
            <div class="instructions">
              <h3>How to connect:</h3>
              <ol>
                <li>Open WhatsApp on your phone</li>
                <li>Go to Settings → Linked Devices</li>
                <li>Tap "Link a Device"</li>
                <li>Scan the QR code above</li>
                <li>✅ Done! Connection will be persistent</li>
              </ol>
            </div>
            
            <div style="margin-top: 30px; font-size: 12px; color: #666;">
              <p>Business Account: +4917674729899</p>
              <p>Target Group: Weboat++</p>
              <p>Session will be saved and restored automatically</p>
            </div>
          </div>
          
          <script>
            // Auto-refresh every 10 seconds to check connection
            setTimeout(() => window.location.reload(), 10000);
          </script>
        </body>
        </html>
      `);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>WhatsApp Connection</title>
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
            <div class="waiting">⏳ Initializing persistent connection...</div>
            <p>Please wait while the system starts up.</p>
            <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #25D366; color: white; border: none; border-radius: 5px;">
              🔄 Check Again
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
          <p>Failed to get connection status: ${error.message}</p>
          <button onclick="window.location.reload()">Try Again</button>
        </body>
      </html>
    `);
  }
});

// Test message endpoint
app.post('/test-send', async (req, res) => {
  try {
    await whatsappService.sendTestMessage();
    
    // Create a test message record
    const testMessage = addMessage({
      senderName: "System Test",
      content: "Testing persistent connection to Weboat++ group",
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

// Enhanced status endpoint
app.get('/status', async (req, res) => {
  try {
    const connectionInfo = await whatsappService.getConnectionInfo();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const messagesCount = messages.filter(msg => msg.timestamp >= today).length;
    
    res.json({
      whatsapp: {
        isConnected: connectionInfo.isReady,
        status: connectionInfo.isReady ? 'Connected (Persistent)' : 'Disconnected',
        lastConnected: connectionInfo.lastConnected,
        hasSession: connectionInfo.hasSession,
        uptime: Math.floor(connectionInfo.uptime / 60) + ' minutes'
      },
      messagesCount,
      webhook: {
        isActive: true,
        endpoint: "/superchat"
      },
      group: {
        name: "Weboat++",
        status: connectionInfo.isReady ? "Connected" : "Disconnected"
      },
      businessAccount: "+4917674729899",
      persistence: {
        enabled: true,
        sessionSaved: connectionInfo.hasSession,
        autoReconnect: true
      }
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: "Failed to get status" });
  }
});

// Get messages endpoint
app.get('/messages', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const recentMessages = messages.slice(0, limit);
  res.json(recentMessages);
});

// Enhanced root endpoint
app.get('/', async (req, res) => {
  const connectionInfo = await whatsappService.getConnectionInfo();
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp SuperChat Bridge - Persistent</title>
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
        .feature {
          background-color: #d1ecf1;
          color: #0c5460;
          padding: 10px;
          margin: 10px 0;
          border-radius: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📱 WhatsApp SuperChat Bridge - Persistent Connection</h1>
        <p>Server running with persistent WhatsApp sessions that survive restarts.</p>
        
        <div class="status ${connectionInfo.isReady ? 'connected' : 'disconnected'}">
          WhatsApp Status: ${connectionInfo.isReady ? '✅ Connected (Persistent)' : '❌ Disconnected'}
        </div>
        
        <div class="feature">
          <h3>🎯 Persistent Features:</h3>
          <ul>
            <li>✅ Sessions survive server restarts</li>
            <li>✅ Auto-reconnection every 5 minutes</li>
            <li>✅ One-time QR scan setup</li>
            <li>✅ Works for months without intervention</li>
          </ul>
        </div>
        
        <h3>📋 Available Endpoints:</h3>
        <div class="endpoint">POST /superchat - SuperChat webhook endpoint</div>
        <div class="endpoint">GET /qr - WhatsApp QR code for one-time setup</div>
        <div class="endpoint">POST /test-send - Send test message to WhatsApp group</div>
        <div class="endpoint">GET /status - Enhanced system status</div>
        <div class="endpoint">GET /messages - Recent messages</div>
        
        <h3>⚙️ Configuration:</h3>
        <ul>
          <li><strong>Business Account:</strong> +4917674729899</li>
          <li><strong>Target Group:</strong> Weboat++</li>
          <li><strong>SuperChat Webhook:</strong> ${req.protocol}://${req.get('host')}/superchat</li>
          <li><strong>Session Persistence:</strong> ${connectionInfo.hasSession ? 'Enabled' : 'Not Set'}</li>
          <li><strong>Server Uptime:</strong> ${Math.floor(connectionInfo.uptime / 60)} minutes</li>
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
            🔗 ${connectionInfo.isReady ? 'View Connection Status' : 'Set Up WhatsApp Connection'}
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
  console.log(`🚀 Persistent WhatsApp SuperChat Bridge running on port ${PORT}`);
  console.log(`📱 Visit /qr for one-time WhatsApp setup`);
  console.log(`🔗 SuperChat webhook URL: /superchat`);
  console.log(`🧪 Test endpoint: /test-send`);
  console.log(`✨ Persistent sessions enabled - works for months!`);
});

module.exports = app;