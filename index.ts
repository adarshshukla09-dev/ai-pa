// import express from 'express';
// import dotenv from 'dotenv';
// import { testCalendarConnection } from './lib/calendar.config';
// import { verifyWebhook, handleWebhookNotification } from "./controllers/whatsapp.controllers"

import { HumanMessage } from "langchain";
import { graph } from "./agents/graphs/graph"
import type { CalendarState } from "./agents/state/state";
import dotenv from "dotenv"
dotenv.config();

// const app = express();
// app.use(express.json());

// const PORT = process.env.PORT || 3000;

// // WhatsApp Webhook Routes
// app.get('/webhook', verifyWebhook);
// app.post('/webhook', handleWebhookNotification);

// // Initialize integrations and boot up server
// app.listen(PORT, async () => {
//   console.log(`🚀 HealBot Orchestration Engine running on port ${PORT}`);
//   try {
//     await testCalendarConnection();
//   } catch (err) {
//     console.warn('⚠️ Google Calendar initialization failed. Verify refresh tokens.');
//   }
// });

async function main() {

 
// If using LangGraph's typeof state inference
const initialState: typeof CalendarState.State = {
  provider: "gemini", 
  model: "gemini-2.5-flash",
  apiKey: process.env.GEMINI_API_KEY!,
  message: [
    new HumanMessage("Create a calendar event for tomorrow at 10 AM titled 'Team Meeting' with a description 'Discuss project updates'."),
  ]
};
  const response = await graph.invoke(initialState);
  console.log("Response from graph:", response);
}
main().catch((error) => {
  console.error("Error in main execution:", error);
});