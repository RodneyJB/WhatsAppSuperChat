import pkg from '@whiskeysockets/baileys';
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = pkg;
import fs from 'fs';

const authDir = './auth';

// Clear old auth data that might be causing 401 errors
if (fs.existsSync(authDir)) {
    try {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log('Cleared old auth directory');
    } catch (error) {
        console.log('Could not clear auth directory:', error.message);
    }
}

if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
    console.log('Created fresh auth directory');
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
                browser: ['Superchat Webhook', 'Chrome', '1.0.0'],
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 30000,
                generateHighQualityLinkPreview: false,
                markOnlineOnConnect: false,
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    console.log('\n=== WhatsApp QR Code ===');
                    console.log('QR CODE TEXT:', qr);
                    console.log('=== Copy this text above and generate QR image ===\n');
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
                    console.log('Ready to forward SuperChat messages to Weboat++ group');
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
        
        console.log(`Total groups found: ${Object.keys(chats).length}`);
        
        // Log all groups for debugging
        console.log('All available groups:');
        for (const groupId in chats) {
            console.log(`- "${chats[groupId].subject}" (ID: ${groupId})`);
        }

        let targetGroupId = null;
        for (const groupId in chats) {
            // Try exact match first
            if (chats[groupId].subject === groupName) {
                targetGroupId = groupId;
                console.log(`✅ Found exact match: "${groupName}" with ID: ${groupId}`);
                break;
            }
            // Try case-insensitive match
            if (chats[groupId].subject.toLowerCase() === groupName.toLowerCase()) {
                targetGroupId = groupId;
                console.log(`✅ Found case-insensitive match: "${chats[groupId].subject}" with ID: ${groupId}`);
                break;
            }
            // Try partial match
            if (chats[groupId].subject.includes(groupName) || groupName.includes(chats[groupId].subject)) {
                targetGroupId = groupId;
                console.log(`✅ Found partial match: "${chats[groupId].subject}" with ID: ${groupId}`);
                break;
            }
        }

        if (!targetGroupId) {
            console.error(`❌ Group "${groupName}" not found in any of the ${Object.keys(chats).length} groups`);
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