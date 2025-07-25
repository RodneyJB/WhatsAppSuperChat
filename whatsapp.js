const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');

class WhatsAppService {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'superchat-whatsapp'
      }),
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

    this.qrCodeData = null;
    this.isReady = false;
    this.targetGroupName = 'Weboat++';
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on('qr', async (qr) => {
      console.log('QR Code received');
      this.qrCodeData = await qrcode.toDataURL(qr);
      console.log('QR Code generated. Access /qr endpoint to view it.');
    });

    this.client.on('ready', () => {
      console.log('WhatsApp client is ready!');
      this.isReady = true;
    });

    this.client.on('authenticated', () => {
      console.log('WhatsApp client authenticated');
      this.isReady = true;
    });

    this.client.on('auth_failure', (msg) => {
      console.error('Authentication failed:', msg);
      this.isReady = false;
    });

    this.client.on('disconnected', (reason) => {
      console.log('WhatsApp client disconnected:', reason);
      this.isReady = false;
    });
  }

  async initialize() {
    try {
      await this.client.initialize();
    } catch (error) {
      console.error('Failed to initialize WhatsApp client:', error);
      throw error;
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
      throw new Error('WhatsApp client is not ready');
    }

    const targetGroup = await this.findTargetGroup();

    try {
      if (attachmentUrl) {
        const media = await MessageMedia.fromUrl(attachmentUrl);
        await targetGroup.sendMessage(media, { caption: messageText });
      } else {
        await targetGroup.sendMessage(messageText);
      }
      console.log(`Message sent to ${this.targetGroupName} group`);
    } catch (error) {
      console.error('Failed to send message:', error);
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
💬 "Testing connection to Weboat++ group"
🔗 https://app.superchat.com/inbox/test_conversation_123
⚠ Reply in SuperChat only.`;

    await this.sendMessageToGroup(testMessage);
  }

  isClientReady() {
    return this.isReady;
  }

  async destroy() {
    await this.client.destroy();
  }
}

module.exports = WhatsAppService;