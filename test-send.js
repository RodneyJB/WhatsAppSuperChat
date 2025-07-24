const { initializeWhatsApp, sendToGroup } = require('./whatsapp');

(async () => {
    const sock = await initializeWhatsApp();
    const message = '🧪 Test message from manual test file';
    const result = await sendToGroup(sock, 'Weboat++', message);
    console.log('Send result:', result);
})();


