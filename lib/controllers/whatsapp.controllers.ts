import type { Request, Response } from 'express';
import { WhatsAppService } from '../whatsapp.config';
import { Doctor } from '../db/models/doctor.models';
import { appointmentAgent } from '../../agents/graphs/appointmentAgentGraph';
import { HumanMessage } from '@langchain/core/messages';
import type { AppointmentAgentStateType } from '../../agents/state/appointmentAgentState';
import { Patient } from '../db/models/patient.model';

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
  res.status(200).send("EVENT_RECEIVED");

  try {
    const body = req.body;
    if (body.entry?.[0]?.changes?.[0]?.value?.statuses) return;

    const messageData = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!messageData || messageData.type !== "text") return;

    const patientNumber = messageData.from;
    const incomingText = messageData.text.body;
    const doctorNumber = body.entry[0].changes[0].value.metadata.display_phone_number;

    const doctor = await Doctor.findOne({ phoneNumber: "15556761267" });
    if (!doctor) return;

    const dynamicThreadId = `${doctorNumber}_${patientNumber}`;
    
    const response = await appointmentAgent.invoke({
      doctor: doctor,
    
      patientPhoneNumber: patientNumber,
      doctorPhoneNumber: doctorNumber,
      messages: [new HumanMessage(incomingText)], 
    }, {
      configurable: { thread_id: dynamicThreadId }
    })as AppointmentAgentStateType;

    const lastGraphMessage = response.messages[response.messages.length - 1];
    const botReply = lastGraphMessage?.content || "Thank you for reaching out. We are processing your request.";

    await WhatsAppService.sendTextMessage(patientNumber, botReply.toString());

  } catch (error) {
    console.error("❌ Error handling LangGraph orchestration:", error);
  }
};