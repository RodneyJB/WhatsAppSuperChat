import pkg from '@whiskeysockets/baileys';
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = pkg;
import fs from 'fs';

const authDir = './auth';

// Create auth directory if it doesn't exist, but keep existing auth for persistence
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
    console.log('Created auth directory');
} else {
    console.log('Using existing auth directory for persistent connection');
}

let globalSock = null;
let currentQRCode = null;
let connectionStatus = 'disconnected';
let heartbeatInterval = null;

function isSocketOpen(sock) {
    if (!sock || !sock.ws) return false;
    return sock.ws.readyState === 1;
}

function getCurrentQRCode() {
    return currentQRCode;
}

// Heartbeat system to maintain connection
function startHeartbeat(sock) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    heartbeatInterval = setInterval(async () => {
        try {
            if (isSocketOpen(sock)) {
                // Send a lightweight query to keep connection alive
                await sock.query({ tag: 'iq', attrs: { type: 'get', xmlns: 'jabber:iq:ping' } });
                console.log('💓 Heartbeat - connection alive');
                connectionStatus = 'connected';
            } else {
                console.log('💔 Heartbeat failed - connection lost');
                connectionStatus = 'disconnected';
                clearInterval(heartbeatInterval);
            }
        } catch (error) {
            console.log('💔 Heartbeat error:', error.message);
            connectionStatus = 'disconnected';
            clearInterval(heartbeatInterval);
        }
    }, 300000); // Every 5 minutes
}

async function initializeWhatsApp() {
    return new Promise(async (resolve, reject) => {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(authDir);

            const sock = makeWASocket({
                auth: state,
                browser: ['SuperChat-Bridge', 'Ubuntu', '22.04.0'], // Unique browser ID
                defaultQueryTimeoutMs: 120000,
                connectTimeoutMs: 60000,
                generateHighQualityLinkPreview: false,
                markOnlineOnConnect: false, // Prevent conflicts
                shouldIgnoreJid: jid => false,
                shouldSyncFullHistory: false,
                maxMsgRetryCount: 3,
                transactionOpts: { maxCommitRetries: 5, delayBetweenTriesMs: 2000 },
                getMessage: async (key) => undefined,
                syncFullHistory: false,
                fireInitQueries: true,
                emitOwnEvents: false, // Prevent duplicate events
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    currentQRCode = qr;
                    console.log('🔗 QR code generated - available at /qr endpoint');
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    const errorCode = lastDisconnect?.error?.output?.statusCode;
                    
                    console.log('Connection closed:', lastDisconnect?.error?.message || 'Unknown error');
                    console.log('Error code:', errorCode);
                    currentQRCode = null;
                    connectionStatus = 'disconnected';

                    // Handle specific error types
                    if (errorCode === 440) { // Stream conflict
                        console.log('🔄 Conflict detected - waiting 30 seconds before reconnect...');
                        setTimeout(() => {
                            initializeWhatsApp().then(sock => {
                                globalSock = sock;
                                console.log('✅ Reconnection successful after conflict resolution');
                            }).catch(err => {
                                console.error('❌ Reconnection failed:', err.message);
                            });
                        }, 30000); // Wait longer for conflicts
                    } else if (shouldReconnect) {
                        console.log('🔄 Auto-reconnecting in 15 seconds...');
                        setTimeout(() => {
                            initializeWhatsApp().then(sock => {
                                globalSock = sock;
                                console.log('✅ Reconnection successful');
                            }).catch(err => {
                                console.error('❌ Reconnection failed:', err.message);
                            });
                        }, 15000);
                    } else {
                        console.log('❌ Logged out. Need new QR scan.');
                        reject(new Error('Logged out from WhatsApp'));
                    }
                }

                if (connection === 'open') {
                    console.log('✅ WhatsApp connected!');
                    console.log('Phone:', sock.user?.id);
                    console.log('Ready to forward SuperChat messages to Weboat++ group');
                    globalSock = sock;
                    currentQRCode = null;
                    connectionStatus = 'connected';
                    
                    // Start heartbeat to maintain connection
                    startHeartbeat(sock);
                    
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
    connectionStatus,
};