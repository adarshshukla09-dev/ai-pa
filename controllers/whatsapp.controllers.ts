import type { Request, Response } from 'express';
import { WhatsAppService } from '../lib/whatsapp.config';
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'my_super_secret_handshake_123';

/**
 * Meta Webhook Verification (GET /webhook)
 */
export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully.');
    return res.status(200).send(challenge); // Critical: must be plain text, not JSON
  } else {
    console.error('❌ Webhook verification failed.');
    return res.sendStatus(403);
  }
}

/**
 * Handle incoming events from Meta (POST /webhook)
 */
export async function handleWebhookNotification(req: Request, res: Response) {
  const entry = req.body?.entry;

  // Acknowledge receipt instantly to Meta to keep webhook latency healthy
  res.sendStatus(200);

  if (!entry || entry.length === 0) return;

  try {
    const changes = entry[0]?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return;

    const incomingMessage = messages[0];
    const from = incomingMessage.from; // Patient's WhatsApp Phone Number

    console.log(`📩 Received raw webhook message from ${from}`);

    if (incomingMessage.type === 'text') {
      const textBody = incomingMessage.text.body;
      console.log(`💬 Processing Text: "${textBody}"`);
      
      // TODO: Pass 'textBody' and 'from' context directly to the LLM/Gemini ReAct Loop here
      await WhatsAppService.sendTextMessage(from, `HealBot received: "${textBody}". Initial setup validation complete.`);
    } 
    
    else if (incomingMessage.type === 'interactive') {
      const buttonId = incomingMessage.interactive.button_reply?.id;
      console.log(`🔘 Received Interactive Button Reply: ${buttonId}`);
      // Handle DPDP Act compliance tracking logic here
    }
  } catch (error) {
    console.error('❌ Error processing incoming Webhook Event stream:', error);
  }
}