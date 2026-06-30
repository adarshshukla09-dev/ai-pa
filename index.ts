import express from 'express';
import dotenv from "dotenv";
import { handleWebhookNotification, verifyWebhook } from './lib/controllers/whatsapp.controllers';
import { connectDB } from './lib/db/mongo.config';
import { initAppointmentAgent } from './agents/graphs/appointmentAgentGraph';
import { initDoctorEngine } from './agents/graphs/doctorEngineAgentGraph';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// WhatsApp Webhook Routes
app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWebhookNotification);

// Initialize integrations and boot up server
app.listen(PORT, async () => {
  console.log(`🚀 HealBot Orchestration Engine running on port ${PORT}`);
  try {
    // 1. Establish Mongo connection
    await connectDB();
    
    // 2. Safely initialize your LangGraph checkpointer now that nativeMongoClient is loaded
    await initAppointmentAgent();
    await initDoctorEngine();
    
  } catch (err) {
    console.error('❌ Initialization failed:', err);
  }
});