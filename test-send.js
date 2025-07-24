// Test SuperChat webhook payload to verify parsing
import fetch from 'node-fetch';

const testPayload = {
  "message": {
    "sender": { "name": "John Doe" },
    "content": { "text": "Hello from SuperChat!" },
    "attachments": [ "https://example.com/file.jpg" ],
    "conversation": { "id": "conv_12345" }
  }
};

async function testWebhook() {
    try {
        console.log('Testing SuperChat webhook payload...');
        console.log('Payload:', JSON.stringify(testPayload, null, 2));
        
        const response = await fetch('https://whatsappsuperchat.onrender.com/superchat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testPayload)
        });
        
        const result = await response.json();
        console.log('Response:', result);
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testWebhook();