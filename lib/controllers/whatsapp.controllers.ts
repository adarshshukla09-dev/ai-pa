import type { Request, Response } from 'express';
import { WhatsAppService } from '../whatsapp.config';
import { Doctor } from '../db/models/doctor.models';
import { appointmentAgent } from '../../agents/graphs/appointmentAgentGraph';
; // 👈 Import your doctor agent
import { HumanMessage } from '@langchain/core/messages';
import type { AppointmentAgentStateType } from '../../agents/state/appointmentAgentState';
import type { DoctorEngineStateType } from '../../agents/state/doctorEngineState'; // 👈 Import doctor state type
import { doctorAgent } from '../../agents/graphs/doctorEngineAgentGraph';

const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'my_super_secret_handshake_123';

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

export const handleWebhookNotification = async (req: Request, res: Response) => {
  // Acknowledge the WhatsApp event immediately to prevent retries
  res.status(200).send("EVENT_RECEIVED");

  try {
    const body = req.body;
    if (body.entry?.[0]?.changes?.[0]?.value?.statuses) return;

    const messageData = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!messageData || messageData.type !== "text") return;

    const senderPhoneNumber = messageData.from; // The actual person sending the message
    const incomingText = messageData.text.body;
    const businessPhoneNumber = body.entry[0].changes[0].value.metadata.display_phone_number;

    // 1. Check if the sender is a Doctor in your database
    const matchingDoctor = await Doctor.findOne({ phoneNumber: senderPhoneNumber });

    let botReply = "Thank you for reaching out. We are processing your request.";

    if (matchingDoctor) {
      // --- 👨‍⚕️ ROUTE TO DOCTOR AGENT ---
      console.log(`⚡ Routing incoming message from Doctor: ${matchingDoctor.name}`);

      // Threads for doctors can simply be their own phone number or a specific global directive ID
      const doctorThreadId = `doctor_${senderPhoneNumber}`;

      const response = await doctorAgent.invoke({
        doctor: matchingDoctor,
        doctorPhoneNumber: senderPhoneNumber,
        messages: [new HumanMessage(incomingText)],
        // targetPatientId, targetPatientPhone, and pendingInstruction will initialize naturally or via graph nodes
      }, {
        configurable: { thread_id: doctorThreadId }
      }) as DoctorEngineStateType;

      const lastGraphMessage = response.messages[response.messages.length - 1];
      if (lastGraphMessage) {
        botReply = lastGraphMessage.content.toString();
      }

    } else {
      // --- 👤 ROUTE TO PATIENT AGENT ---
      console.log(`⚡ Routing incoming message from Patient: ${senderPhoneNumber}`);

      // Fallback fallback / target clinic doctor instance lookup 
      // Using your original default instance logic for context
      const fallbackClinicDoctor = await Doctor.findOne({ phoneNumber: "15556761267" });
      if (!fallbackClinicDoctor) {
        console.error("❌ Clinic config failure: Primary Doctor document not found.");
        return;
      }

      const patientThreadId = `${businessPhoneNumber}_${senderPhoneNumber}`;

      const response = await appointmentAgent.invoke({
        doctor: fallbackClinicDoctor,
        patientPhoneNumber: senderPhoneNumber,
        doctorPhoneNumber: businessPhoneNumber,
        messages: [new HumanMessage(incomingText)], 
      }, {
        configurable: { thread_id: patientThreadId }
      }) as AppointmentAgentStateType;

      const lastGraphMessage = response.messages[response.messages.length - 1];
      if (lastGraphMessage) {
        botReply = lastGraphMessage.content.toString();
      }
    }

    // 2. Dispatch reply back to the respective sender via WhatsApp
    await WhatsAppService.sendTextMessage(senderPhoneNumber, botReply);

  } catch (error) {
    console.error("❌ Error handling LangGraph orchestration routing:", error);
  }
};