import express from 'express';
import { initializeWhatsApp, sendToGroup, isSocketOpen, getCurrentQRCode } from './whatsapp.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

let whatsappSock = null;
let isInitializing = false;

async function startServer() {
    if (isInitializing) return;
    isInitializing = true;
    
    try {
        console.log('Initializing WhatsApp connection...');
        whatsappSock = await initializeWhatsApp();
        console.log('WhatsApp connection established successfully');
    } catch (error) {
        console.error('Failed to initialize WhatsApp:', error);
        // Don't exit, let the server run and try to reconnect later
    } finally {
        isInitializing = false;
    }
}

// SuperChat webhook endpoint with comprehensive payload handling
app.post('/superchat', async (req, res) => {
    try {
        console.log('🔔 Received SuperChat webhook:', JSON.stringify(req.body, null, 2));
        console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));

        const webhookData = req.body;
        let formattedMessage = '';

        // Handle different SuperChat webhook formats
        if (webhookData.message) {
            // SuperChat automation format: { "message": { "sender": { "name": "..." }, "content": { "text": "..." }, ... } }
            const senderName = webhookData?.message?.sender?.name || 'Unknown Sender';
            const messageText = webhookData?.message?.content?.text || 'No message content';
            const attachments = webhookData?.message?.attachments || [];
            const conversationId = webhookData?.message?.conversation?.id || 'unknown';

            formattedMessage = `📩 New SuperChat message!\n👤 ${senderName}\n💬 "${messageText}"`;

            if (attachments.length > 0) {
                const fileInfo = attachments.map(att => {
                    if (typeof att === 'string') return att;
                    if (att.url) return att.url;
                    if (att.name) return att.name;
                    return 'Unknown file';
                }).join(', ');
                formattedMessage += `\n📎 Files: ${fileInfo}`;
            }

            formattedMessage += `\n🔗 https://app.superchat.com/inbox/${conversationId}\n⚠️ Reply in SuperChat only.`;
        } 
        else if (webhookData.type === 'superchat' || webhookData.amount) {
            // SuperChat donation format
            const amount = webhookData.amount || 'Unknown';
            const currency = webhookData.currency || '';
            const authorName = webhookData.author?.name || webhookData.sender?.name || 'Anonymous';
            const messageText = webhookData.message || webhookData.text || '';
            
            formattedMessage = `💰 SuperChat Donation: ${authorName} - ${amount}${currency}\n💬 "${messageText}"`;
        }
        else {
            // Fallback - log everything and create basic message
            console.log('🔍 Unknown webhook format - using fallback parser');
            const possibleSender = webhookData.sender?.name || 
                                  webhookData.author?.name || 
                                  webhookData.user?.name || 
                                  'Unknown Sender';
            const possibleMessage = webhookData.message || 
                                   webhookData.text || 
                                   webhookData.content ||
                                   JSON.stringify(webhookData);
            
            formattedMessage = `📝 SuperChat Notification\n👤 ${possibleSender}\n💬 ${possibleMessage}`;
        }

        console.log('📤 Formatted message for WhatsApp:', formattedMessage);

        // Reconnect if socket is dead
        if (!isSocketOpen(whatsappSock)) {
            console.warn('⚠️ WhatsApp socket closed — reinitializing...');
            whatsappSock = await initializeWhatsApp();
        }

        const result = await sendToGroup(whatsappSock, 'Weboat++', formattedMessage);
        if (result.success) {
            console.log('✅ Message sent to WhatsApp successfully');
            res.status(200).json({ status: 'success', message: 'Message forwarded to WhatsApp' });
        } else {
            console.error('❌ Failed to send message:', result.error);
            res.status(500).json({ status: 'error', message: 'Failed to send message', error: result.error });
        }

    } catch (error) {
        console.error('❌ Error processing webhook:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error', error: error.message });
    }
});

// QR Code endpoint for authentication (text only)
app.get('/qr', async (req, res) => {
    try {
        const qrCode = getCurrentQRCode();
        
        if (qrCode) {
            res.status(200).json({
                qr: qrCode,
                message: 'QR code available for scanning',
                expires: '30 seconds',
                instructions: 'Copy this text, generate QR code image, and scan with WhatsApp'
            });
        } else {
            if (isSocketOpen(whatsappSock)) {
                res.status(200).json({
                    qr: null,
                    message: 'WhatsApp already connected',
                    connected: true
                });
            } else {
                // Try to reinitialize if no QR and not connected
                console.log('No QR available, attempting to reinitialize WhatsApp...');
                try {
                    whatsappSock = await initializeWhatsApp();
                    const newQrCode = getCurrentQRCode();
                    if (newQrCode) {
                        res.status(200).json({
                            qr: newQrCode,
                            message: 'QR code generated after reinitializing',
                            expires: '30 seconds'
                        });
                    } else {
                        res.status(202).json({
                            qr: null,
                            message: 'WhatsApp initializing. Please try again in a few seconds.',
                            connected: false
                        });
                    }
                } catch (initError) {
                    console.error('Failed to reinitialize WhatsApp:', initError);
                    res.status(500).json({
                        qr: null,
                        message: 'Failed to initialize WhatsApp connection',
                        error: initError.message
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error getting QR code:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to get QR code',
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        whatsappConnected: isSocketOpen(whatsappSock),
        hasQR: getCurrentQRCode() !== null
    });
});

// Test endpoint to send a message and debug groups
app.get('/test-send', async (req, res) => {
    try {
        console.log('🧪 Test endpoint called');
        
        if (!whatsappSock || !isSocketOpen(whatsappSock)) {
            console.log('⚠️ WhatsApp socket not available, attempting to reconnect...');
            whatsappSock = await initializeWhatsApp();
        }
        
        const testMessage = '🧪 Test message from /test-send endpoint - ' + new Date().toISOString();
        const result = await sendToGroup(whatsappSock, 'Weboat++', testMessage);
        
        res.status(200).json({
            status: 'test_completed',
            message: testMessage,
            result: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Test endpoint error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Debug endpoint to capture webhook data (accepts any method)
app.all('/debug-webhook', (req, res) => {
    console.log('🔍 DEBUG WEBHOOK CAPTURED:');
    console.log('📋 Method:', req.method);
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('📋 Query:', JSON.stringify(req.query, null, 2));
    console.log('📋 Body:', JSON.stringify(req.body, null, 2));
    console.log('📋 Raw URL:', req.url);
    console.log('📋 Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
    console.log('==========================================');
    
    res.status(200).json({
        status: 'captured',
        method: req.method,
        headers: req.headers,
        query: req.query,
        body: req.body,
        timestamp: new Date().toISOString(),
        message: 'Webhook data captured in server logs'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Superchat to WhatsApp server is running',
        endpoints: {
            webhook: 'POST /superchat',
            qr: 'GET /qr (text format)',
            health: 'GET /health',
            test: 'GET /test-send (send test message)'
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://0.0.0.0:${PORT}/superchat`);
    console.log(`QR code endpoint: http://0.0.0.0:${PORT}/qr`);
    console.log(`Health check: http://0.0.0.0:${PORT}/health`);
    startServer();
});

process.on('SIGINT', () => {
    console.log('Shutting down server...');
    if (whatsappSock?.end) whatsappSock.end();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    if (whatsappSock?.end) whatsappSock.end();
    process.exit(0);
});