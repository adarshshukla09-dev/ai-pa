import express from 'express';
import dotenv from 'dotenv';
import { testCalendarConnection } from './config/calendar.config';
import { WhatsAppService } from './config/whatsapp.config';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 1. WhatsApp Webhook Verification Route (GET)
app.get('/webhook', (req, res) => {
    // Meta sends these query parameters
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // 1. Check if the mode and token are correct
    if (mode === 'subscribe' && token === 'my_super_secret_handshake_123') {
        console.log('Webhook verified successfully!');
        
        // 2. Respond with the challenge token as PLAIN TEXT (Status 200)
        // CRITICAL: Do not send this as JSON (e.g., do not use res.json())
        return res.status(200).send(challenge);
    } else {
        // Responds with '403 Forbidden' if tokens do not match
        return res.sendStatus(403);
    }
});
// 2. WhatsApp Event Ingestion Engine (POST)
app.post('/webhook', async (req: any, res: any) => {
  const entry = req.body.entry;

  if (!entry || entry.length === 0) {
    res.sendStatus(200);
    return;
  }

  // Acknowledge receipt immediately to Meta to keep webhook latency healthy
  res.sendStatus(200);

  try {
    const changes = entry[0].changes;
    if (!changes || changes.length === 0) return;

    const value = changes[0].value;
    const messages = value.messages;

    if (messages && messages.length > 0) {
      const incomingMessage = messages[0];
      const from = incomingMessage.from; // Patient's WhatsApp Phone Number
      
      console.log(`📩 Received raw webhook message from ${from}`);

      // Handle raw incoming text or voice notes
      if (incomingMessage.type === 'text') {
        const textBody = incomingMessage.text.body;
        console.log(`💬 Processing Text: "${textBody}"`);
        
        // TODO: Pass 'textBody' and 'from' context directly to the LLM/Gemini ReAct Loop here
        // For testing core configuration setup, send back an acknowledgment echo:
        await WhatsAppService.sendTextMessage(from, `HealBot received: "${textBody}". Initial setup validation complete.`);
      } 
      else if (incomingMessage.type === 'interactive') {
        const buttonId = incomingMessage.interactive.button_reply?.id;
        console.log(`🔘 Received Interactive Button Reply: ${buttonId}`);
        // Handle consent tracking here (DPDP Act requirement)
      }
    }
  } catch (error) {
    console.error('❌ Error processing incoming Webhook Event stream:', error);
  }
});

// Initialize integrations and boot up the orchestration engine
app.listen(PORT, async () => {
  console.log(`🚀 HealBot Orchestration Engine running on port ${PORT}`);
  try {
    await testCalendarConnection();
  } catch (err) {
    console.warn('⚠️ Google Calendar initialization failed. Verify refresh tokens.');
  }
});