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

// SuperChat webhook endpoint
app.post('/superchat', async (req, res) => {
    try {
        console.log('Received Superchat webhook:', JSON.stringify(req.body, null, 2));

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

        let formattedMessage = `📩 New Superchat message!\n👤 ${senderName}\n💬 "${messageText}"`;

        if (attachments.length > 0) {
            const fileInfo = attachments.map(att => {
                if (typeof att === 'string') return att;
                if (att.url) return att.url;
                if (att.name) return att.name;
                return 'Unknown file';
            }).join(', ');
            formattedMessage += `\n📎 Files: ${fileInfo}`;
        }

        formattedMessage += `\n🔗 https://app.superchat.com/inbox/${conversationId}\n⚠️ Reply in Superchat only.`;

        console.log('Formatted message:', formattedMessage);

        // Reconnect if socket is dead
        if (!isSocketOpen(whatsappSock)) {
            console.warn('WhatsApp socket closed — reinitializing...');
            whatsappSock = await initializeWhatsApp();
        }

        const result = await sendToGroup(whatsappSock, 'Weboat++', formattedMessage);
        if (result.success) {
            console.log('Message sent to WhatsApp successfully');
            res.status(200).json({ status: 'success', message: 'Message forwarded to WhatsApp' });
        } else {
            console.error('Failed to send message:', result.error);
            res.status(500).json({ status: 'error', message: 'Failed to send message', error: result.error });
        }

    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error', error: error.message });
    }
});

// QR Code endpoint for authentication (text only)
app.get('/qr', (req, res) => {
    try {
        const qrCode = getCurrentQRCode();
        
        if (qrCode) {
            res.status(200).json({
                qr: qrCode,
                message: 'QR code available for scanning',
                expires: '30 seconds'
            });
        } else {
            if (isSocketOpen(whatsappSock)) {
                res.status(200).json({
                    qr: null,
                    message: 'WhatsApp already connected',
                    connected: true
                });
            } else {
                res.status(202).json({
                    qr: null,
                    message: 'No QR code available. WhatsApp may be initializing.',
                    connected: false
                });
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

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Superchat to WhatsApp server is running',
        endpoints: {
            webhook: 'POST /superchat',
            qr: 'GET /qr (text format)',
            health: 'GET /health'
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