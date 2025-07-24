const express = require('express');
const { initializeWhatsApp, sendToGroup } = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON bodies
app.use(express.json());

// Initialize WhatsApp connection on server start
let whatsappSock = null;

async function startServer() {
    try {
        console.log('Initializing WhatsApp connection...');
        whatsappSock = await initializeWhatsApp();
        console.log('WhatsApp connection established successfully');
    } catch (error) {
        console.error('Failed to initialize WhatsApp:', error);
        process.exit(1);
    }
}

// POST endpoint to receive Superchat webhooks
app.post('/superchat', async (req, res) => {
    try {
        console.log('Received Superchat webhook:', JSON.stringify(req.body, null, 2));
        
        // Extract data from webhook payload
        const senderName = req.body?.message?.sender?.name || 'Unknown Sender';
        const messageText = req.body?.message?.content?.text || 'No message content';
        const attachments = req.body?.message?.attachments || [];
        const conversationId = req.body?.message?.conversation?.id || 'unknown';
        
        console.log('Extracted data:', {
            senderName,
            messageText,
            attachments: attachments.length,
            conversationId
        });
        
        // Format the message
        let formattedMessage = `📩 New Superchat message!\n👤 ${senderName}\n💬 "${messageText}"`;
        
        // Add files if any
        if (attachments && attachments.length > 0) {
            const fileInfo = attachments.map(attachment => {
                // Handle both URL strings and objects with url/name properties
                if (typeof attachment === 'string') {
                    return attachment;
                } else if (attachment.url) {
                    return attachment.url;
                } else if (attachment.name) {
                    return attachment.name;
                } else {
                    return 'Unknown file';
                }
            }).join(', ');
            formattedMessage += `\n📎 Files: ${fileInfo}`;
        }
        
        // Add conversation link and warning
        formattedMessage += `\n🔗 https://app.superchat.com/inbox/${conversationId}\n⚠️ Reply in Superchat only.`;
        
        console.log('Formatted message:', formattedMessage);
        
        // Send to WhatsApp group
        if (whatsappSock) {
            const result = await sendToGroup(whatsappSock, 'Weboat++', formattedMessage);
            if (result.success) {
                console.log('Message sent to WhatsApp successfully');
                res.status(200).json({ 
                    status: 'success', 
                    message: 'Message forwarded to WhatsApp successfully' 
                });
            } else {
                console.error('Failed to send message to WhatsApp:', result.error);
                res.status(500).json({ 
                    status: 'error', 
                    message: 'Failed to send message to WhatsApp',
                    error: result.error 
                });
            }
        } else {
            console.error('WhatsApp connection not available');
            res.status(500).json({ 
                status: 'error', 
                message: 'WhatsApp connection not available' 
            });
        }
        
    } catch (error) {
        console.error('Error processing Superchat webhook:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Internal server error',
            error: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        whatsappConnected: whatsappSock ? true : false
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({ 
        message: 'Superchat to WhatsApp webhook server is running',
        endpoints: {
            webhook: 'POST /superchat',
            health: 'GET /health'
        }
    });
});

// Start the server first
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Webhook endpoint: http://0.0.0.0:${PORT}/superchat`);
    console.log(`Health check: http://0.0.0.0:${PORT}/health`);
    
    // Then initialize WhatsApp connection
    startServer().catch((error) => {
        console.error('Failed to initialize WhatsApp:', error);
        // Server will still run for webhook testing even if WhatsApp fails
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    if (whatsappSock) {
        whatsappSock.end();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    if (whatsappSock) {
        whatsappSock.end();
    }
    process.exit(0);
});
