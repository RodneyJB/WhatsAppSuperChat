# replit.md

## Overview

This is a WhatsApp webhook integration service that receives Superchat messages via HTTP webhooks and forwards them to WhatsApp groups. The application uses Express.js as the web server and the Baileys WhatsApp Web API library to connect to WhatsApp.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Framework**: Express.js server running on Node.js
- **WhatsApp Integration**: Uses @whiskeysockets/baileys library for WhatsApp Web API connection
- **Authentication**: Multi-file auth state for persistent WhatsApp session management
- **Communication Pattern**: Webhook-based message forwarding system

### Key Design Decisions
1. **WhatsApp Web API**: Chosen over official WhatsApp Business API for easier setup and no business verification requirements
2. **File-based Authentication**: Uses multi-file auth state to persist WhatsApp login sessions across server restarts
3. **QR Code Terminal Display**: Displays QR codes in terminal for WhatsApp authentication
4. **Webhook Integration**: Receives Superchat messages via HTTP POST endpoints

## Key Components

### 1. Express Server (server.js)
- Main HTTP server handling incoming webhook requests
- Initializes WhatsApp connection on startup
- Provides `/superchat` POST endpoint for webhook data
- Extracts message data and formats for WhatsApp delivery

### 2. WhatsApp Module (whatsapp.js)
- Manages WhatsApp Web socket connection using Baileys
- Handles authentication state persistence
- Provides QR code generation for initial setup
- Implements automatic reconnection logic
- Contains group messaging functionality

### 3. Authentication System
- Uses `./auth` directory for storing WhatsApp session credentials
- Multi-file auth state ensures session persistence
- QR code authentication for initial setup

## Data Flow

1. **Initialization**:
   - Server starts and initializes WhatsApp connection
   - If not authenticated, displays QR code for scanning
   - Establishes persistent WebSocket connection to WhatsApp

2. **Webhook Processing**:
   - Superchat sends webhook to `/superchat` endpoint
   - Server extracts sender name, message content, and attachments
   - Formats message for WhatsApp delivery
   - Sends formatted message to configured WhatsApp group

3. **Message Format**:
   ```
   📩 New Superchat message!
   👤 [Sender Name]
   💬 "[Message Content]"
   [Attachment info if present]
   ```

## External Dependencies

### Core Dependencies
- **@whiskeysockets/baileys**: WhatsApp Web API client library
- **express**: Web server framework
- **@hapi/boom**: Error handling utilities
- **qrcode-terminal**: QR code display in terminal

### Authentication Requirements
- WhatsApp mobile app for QR code scanning
- Persistent file system for auth state storage

## Deployment Strategy

### Environment Setup
- Node.js runtime environment
- File system access for authentication storage
- Network access for WhatsApp Web API connections
- Port configuration (default: 3000, configurable via PORT env var)

### Initialization Process
1. Install dependencies: `npm install`
2. Start server: `npm start`
3. Scan QR code with WhatsApp mobile app
4. Configure webhook URL in Superchat to point to `/superchat` endpoint

### Production Considerations
- Implement proper error handling and logging
- Set up process management (PM2 or similar)
- Configure reverse proxy (Nginx) for HTTPS
- Monitor WhatsApp connection status
- Backup authentication files

## Current Status

### ✅ Completed Features
1. **WhatsApp Integration**: Successfully connected to WhatsApp Web API using phone +4917674729899
2. **Group Detection**: Server successfully finds and sends messages to "Weboat++" group (ID: 120363402608728270@g.us)
3. **Webhook Endpoint**: `/superchat` endpoint working correctly, processes all required data fields
4. **Message Formatting**: Proper formatting with emojis, sender info, content, attachments, and Superchat links
5. **Authentication**: QR code authentication working, credentials persist in `./auth/` directory
6. **Port Configuration**: Server runs on port 5000 (ready for Render.com deployment)

### 🔄 Next Steps Required
1. **Superchat Webhook Configuration**: Need to configure Superchat to send webhooks to server URL
2. **Production Deployment**: Deploy to Render.com to get public webhook URL
3. **Webhook URL Setup**: Configure the public URL in Superchat's webhook settings

### ⚠️ Known Issues
- Minor warning about missing `link-preview-js` dependency (doesn't affect functionality)
- WhatsApp session errors are normal and automatically handled

## Development Notes

The application uses WhatsApp Web API which requires:
- Active WhatsApp account
- Phone connected to internet for initial setup
- Stable internet connection for webhook processing
- Group admin permissions to send messages to target groups