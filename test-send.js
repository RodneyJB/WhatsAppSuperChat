import { initializeWhatsApp, sendToGroup } from './whatsapp.js';

(async () => {
    try {
        console.log('🧪 Testing WhatsApp message sending...');
        const sock = await initializeWhatsApp();
        const message = '🧪 Test message from manual test file';
        const result = await sendToGroup(sock, 'Weboat++', message);
        console.log('Send result:', result);
        process.exit(0);
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
})();