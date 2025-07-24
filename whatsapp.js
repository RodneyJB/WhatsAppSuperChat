import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import fs from 'fs';

const authDir = './auth';
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
    console.log('Created auth directory');
}

let globalSock = null;
let currentQRCode = null;

function isSocketOpen(sock) {
    if (!sock || !sock.ws) return false;
    return sock.ws.readyState === 1;
}

function getCurrentQRCode() {
    return currentQRCode;
}

async function initializeWhatsApp() {
    return new Promise(async (resolve, reject) => {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(authDir);

            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false, // Don't print to terminal since we want to serve via API
                browser: ['Superchat Webhook', 'Safari', '1.0.0'],
                defaultQueryTimeoutMs: 60000,
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    console.log('\n--- WhatsApp QR Code Available ---');
                    console.log('QR Code Text:', qr);
                    console.log('Access via: GET /qr');
                    console.log('--- End QR Code ---\n');
                    currentQRCode = qr;
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Connection closed:', lastDisconnect?.error);
                    currentQRCode = null;

                    if (shouldReconnect) {
                        console.log('Reconnecting...');
                        setTimeout(() => {
                            initializeWhatsApp().then(resolve).catch(reject);
                        }, 5000);
                    } else {
                        console.log('Logged out. Restart and scan QR again.');
                        reject(new Error('Logged out from WhatsApp'));
                    }
                }

                if (connection === 'open') {
                    console.log('✅ WhatsApp connected!');
                    console.log('Phone:', sock.user?.id);
                    globalSock = sock;
                    currentQRCode = null;
                    resolve(sock);
                }
            });

        } catch (error) {
            console.error('Error initializing WhatsApp:', error);
            reject(error);
        }
    });
}

async function sendToGroup(sock, groupName, message) {
    try {
        if (!isSocketOpen(sock)) {
            console.warn('Socket not open — reconnecting');
            sock = await initializeWhatsApp();
        }

        console.log(`Looking for group: "${groupName}"`);
        const chats = await sock.groupFetchAllParticipating();

        let targetGroupId = null;
        for (const groupId in chats) {
            if (chats[groupId].subject === groupName) {
                targetGroupId = groupId;
                console.log(`Found group "${groupName}" with ID: ${groupId}`);
                break;
            }
        }

        if (!targetGroupId) {
            console.error(`Group "${groupName}" not found. Available groups:`);
            for (const groupId in chats) {
                console.log(`- ${chats[groupId].subject} (${groupId})`);
            }
            return { success: false, error: `Group "${groupName}" not found` };
        }

        console.log(`Sending message to group ${groupName}...`);
        await sock.sendMessage(targetGroupId, { text: message });
        console.log('✅ Message sent successfully!');

        return { success: true };

    } catch (error) {
        console.error('Error sending message to group:', error);
        return { success: false, error: error.message };
    }
}

export {
    initializeWhatsApp,
    sendToGroup,
    isSocketOpen,
    getCurrentQRCode,
};