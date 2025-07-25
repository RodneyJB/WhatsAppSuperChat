const { Client, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');

class PersistentWhatsAppService {
  constructor() {
    // Use local file system for session persistence (survives restarts)
    this.client = new Client({
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      }
    });

    this.qrCodeData = null;
    this.isReady = false;
    this.targetGroupName = 'Weboat++';
    this.sessionPath = '/tmp/whatsapp-session.json';
    this.maxRetries = 5;
    this.retryDelay = 30000; // 30 seconds
    this.setupEventHandlers();
    this.setupAutoReconnect();
  }

  setupEventHandlers() {
    this.client.on('qr', async (qr) => {
      console.log('QR Code received - session needs authentication');
      this.qrCodeData = await qrcode.toDataURL(qr);
      console.log('QR Code generated. Access /qr endpoint to view it.');
    });

    this.client.on('ready', async () => {
      console.log('WhatsApp client is ready and persistent!');
      this.isReady = true;
      await this.saveSession();
    });

    this.client.on('authenticated', async (session) => {
      console.log('WhatsApp client authenticated - saving session');
      this.isReady = true;
      await this.saveSessionData(session);
    });

    this.client.on('auth_failure', async (msg) => {
      console.error('Authentication failed:', msg);
      this.isReady = false;
      await this.clearSession();
      setTimeout(() => this.reconnect(), this.retryDelay);
    });

    this.client.on('disconnected', async (reason) => {
      console.log('WhatsApp client disconnected:', reason);
      this.isReady = false;
      // Auto-reconnect after disconnection
      setTimeout(() => this.reconnect(), this.retryDelay);
    });
  }

  setupAutoReconnect() {
    // Check connection every 5 minutes and reconnect if needed
    setInterval(async () => {
      if (!this.isReady) {
        console.log('Auto-reconnecting WhatsApp...');
        await this.reconnect();
      }
    }, 300000); // 5 minutes
  }

  async saveSession() {
    try {
      const sessionData = {
        timestamp: Date.now(),
        isAuthenticated: true,
        lastConnected: new Date().toISOString()
      };
      await fs.writeFile(this.sessionPath, JSON.stringify(sessionData, null, 2));
      console.log('Session data saved successfully');
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  async saveSessionData(session) {
    try {
      const sessionData = {
        session: session,
        timestamp: Date.now(),
        isAuthenticated: true,
        lastConnected: new Date().toISOString()
      };
      await fs.writeFile(this.sessionPath, JSON.stringify(sessionData, null, 2));
      console.log('Full session data saved successfully');
    } catch (error) {
      console.error('Failed to save session data:', error);
    }
  }

  async loadSession() {
    try {
      const data = await fs.readFile(this.sessionPath, 'utf8');
      const sessionData = JSON.parse(data);
      console.log('Session data loaded from:', sessionData.lastConnected);
      return sessionData;
    } catch (error) {
      console.log('No existing session found, will need QR authentication');
      return null;
    }
  }

  async clearSession() {
    try {
      await fs.unlink(this.sessionPath);
      console.log('Session cleared');
    } catch (error) {
      // File might not exist, that's OK
    }
  }

  async initialize() {
    try {
      console.log('Initializing persistent WhatsApp service...');
      
      // Try to load existing session
      const existingSession = await this.loadSession();
      if (existingSession && existingSession.isAuthenticated) {
        console.log('Found existing session, attempting to restore...');
      }

      await this.client.initialize();
      
      // Wait up to 2 minutes for connection
      let attempts = 0;
      while (!this.isReady && attempts < 24) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        if (attempts % 6 === 0) {
          console.log(`Still connecting... (${attempts * 5}s)`);
        }
      }

    } catch (error) {
      console.error('Failed to initialize WhatsApp client:', error);
      throw error;
    }
  }

  async reconnect() {
    if (this.isReady) return;
    
    console.log('Attempting to reconnect WhatsApp...');
    try {
      await this.client.destroy();
      
      // Recreate client
      this.client = new Client({
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
          ]
        }
      });
      
      this.setupEventHandlers();
      await this.initialize();
    } catch (error) {
      console.error('Reconnection failed:', error);
    }
  }

  async getQRCode() {
    return this.qrCodeData;
  }

  async findTargetGroup() {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    const chats = await this.client.getChats();
    const targetGroup = chats.find(chat => 
      chat.isGroup && chat.name === this.targetGroupName
    );

    if (!targetGroup) {
      throw new Error(`Group "${this.targetGroupName}" not found`);
    }

    return targetGroup;
  }

  async sendMessageToGroup(messageText, attachmentUrl) {
    if (!this.isReady) {
      // Try to reconnect once
      await this.reconnect();
      if (!this.isReady) {
        throw new Error('WhatsApp client is not ready and reconnection failed');
      }
    }

    const targetGroup = await this.findTargetGroup();

    try {
      if (attachmentUrl) {
        const media = await MessageMedia.fromUrl(attachmentUrl);
        await targetGroup.sendMessage(media, { caption: messageText });
      } else {
        await targetGroup.sendMessage(messageText);
      }
      console.log(`Message sent to ${this.targetGroupName} group successfully`);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Try to reconnect for next time
      this.isReady = false;
      setTimeout(() => this.reconnect(), 5000);
      throw error;
    }
  }

  async sendSuperchatMessage(senderName, content, conversationId, attachmentUrl) {
    const formattedMessage = this.formatSuperchatMessage(senderName, content, conversationId);
    await this.sendMessageToGroup(formattedMessage, attachmentUrl);
  }

  formatSuperchatMessage(senderName, content, conversationId) {
    const superchatUrl = `https://app.superchat.com/inbox/${conversationId}`;
    
    return `📩 New SuperChat message!
👤 ${senderName}
💬 "${content}"
🔗 ${superchatUrl}
⚠ Reply in SuperChat only.`;
  }

  async sendTestMessage() {
    const testMessage = `📩 New SuperChat test message!
👤 System Test
💬 "Testing persistent connection to Weboat++ group"
🔗 https://app.superchat.com/inbox/test_conversation_123
⚠ Reply in SuperChat only.`;

    await this.sendMessageToGroup(testMessage);
  }

  isClientReady() {
    return this.isReady;
  }

  async getConnectionInfo() {
    try {
      const sessionData = await this.loadSession();
      return {
        isReady: this.isReady,
        lastConnected: sessionData ? sessionData.lastConnected : null,
        hasSession: sessionData !== null,
        uptime: process.uptime()
      };
    } catch (error) {
      return {
        isReady: this.isReady,
        lastConnected: null,
        hasSession: false,
        uptime: process.uptime()
      };
    }
  }

  async destroy() {
    await this.client.destroy();
  }
}

module.exports = PersistentWhatsAppService;