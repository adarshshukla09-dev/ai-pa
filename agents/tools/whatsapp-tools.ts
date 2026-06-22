import type { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID || !WEBHOOK_VERIFY_TOKEN) {
  console.error('❌ Missing required environment variables for WhatsApp configuration.');
  process.exit(1);
}



/**
 * 1. SEND MESSAGE - Sends a text message via the Cloud API
 * @param to - Recipient's phone number with country code (e.g., "14155552671")
 * @param text - The message content
 */
export async function sendWhatsAppMessage(to: string, text: string) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ WhatsApp message sent successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 2. WEBHOOK VALIDATION - Required by Meta to verify your endpoint
 */
export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully.');
    return res.status(200).send(challenge);
  } else {
    console.error('❌ Webhook verification failed.');
    return res.sendStatus(403);
  }
}

/**
 * 3. WEBHOOK RECEIVER - Listens for incoming user messages
 */
export function handleWebhookNotification(req: Request, res: Response) {
  const body = req.body;

  // Check if it's a WhatsApp webhook event
  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message) {
      const from = message.from; // User's phone number
      const messageText = message.text?.body; // Message content

      console.log(`📩 Received message from ${from}: "${messageText}"`);

      // Optional: Process message or trigger an automatic reply here
    }

    // Always return a 200 OK quickly to acknowledge receipt to Meta
    return res.status(200).send('EVENT_RECEIVED');
  } else {
    return res.sendStatus(404);
  }
}