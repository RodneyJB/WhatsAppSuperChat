const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Ensure auth directory exists
const authDir = './auth';
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
    console.log('Created auth directory');
}

async function initializeWhatsApp() {
    return new Promise(async (resolve, reject) => {
        try {
            // Use multi-file auth state to save credentials
            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            
            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false, // We'll handle QR display manually
                browser: ['Superchat Webhook', 'Safari', '1.0.0'],
                defaultQueryTimeoutMs: 60000,
            });

            // Handle credential updates
            sock.ev.on('creds.update', saveCreds);

            // Handle connection updates
            sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    console.log('\n--- WhatsApp QR Code ---');
                    console.log('Please scan this QR code with your WhatsApp mobile app:');
                    qrcode.generate(qr, { small: true });
                    console.log('\nAlternatively, you can use this QR string in other QR readers:');
                    console.log(qr);
                    console.log('--- End QR Code ---\n');
                }
                
                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Connection closed due to:', lastDisconnect?.error);
                    
                    if (shouldReconnect) {
                        console.log('Attempting to reconnect...');
                        setTimeout(() => {
                            initializeWhatsApp().then(resolve).catch(reject);
                        }, 5000);
                    } else {
                        console.log('Logged out from WhatsApp. Please restart the server and scan QR again.');
                        reject(new Error('Logged out from WhatsApp'));
                    }
                } else if (connection === 'open') {
                    console.log('✅ WhatsApp connected successfully!');
                    console.log('Phone number:', sock.user?.id);
                    resolve(sock);
                }
            });

            // Handle messages (optional - for debugging)
            sock.ev.on('messages.upsert', (m) => {
                console.log('Received message update:', JSON.stringify(m, undefined, 2));
            });

        } catch (error) {
            console.error('Error initializing WhatsApp:', error);
            reject(error);
        }
    });
}

async function sendToGroup(sock, groupName, message) {
    try {
        console.log(`Looking for group: "${groupName}"`);
        
        // Get all chats
        const chats = await sock.groupFetchAllParticipating();
        
        // Find the group by name
        let targetGroupId = null;
        
        for (const groupId in chats) {
            const group = chats[groupId];
            if (group.subject === groupName) {
                targetGroupId = groupId;
                console.log(`Found group "${groupName}" with ID: ${groupId}`);
                break;
            }
        }
        
        if (!targetGroupId) {
            console.error(`Group "${groupName}" not found. Available groups:`);
            for (const groupId in chats) {
                const group = chats[groupId];
                console.log(`- ${group.subject} (${groupId})`);
            }
            return { success: false, error: `Group "${groupName}" not found` };
        }
        
        // Send message to the group
        console.log(`Sending message to group ${groupName}...`);
        await sock.sendMessage(targetGroupId, { text: message });
        console.log('Message sent successfully!');
        
        return { success: true };
        
    } catch (error) {
        console.error('Error sending message to group:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    initializeWhatsApp,
    sendToGroup
};
