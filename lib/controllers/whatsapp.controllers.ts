import type { Request, Response } from "express";
import { WhatsAppService } from "../whatsapp.config";
import { Doctor } from "../db/models/doctor.models";
import { appointmentAgent } from "../../agents/graphs/appointmentAgentGraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { AppointmentAgentStateType } from "../../agents/state/appointmentAgentState";
import type { DoctorEngineStateType } from "../../agents/state/doctorEngineState"; // 👈 Import doctor state type
import { doctorAgent } from "../../agents/graphs/doctorEngineAgentGraph";

const WEBHOOK_VERIFY_TOKEN =
  process.env.WEBHOOK_VERIFY_TOKEN || "my_super_secret_handshake_123";

export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully.");
    return res.status(200).send(challenge);
  } else {
    console.error("❌ Webhook verification failed.");
    return res.sendStatus(403);
  }
}

export const handleWebhookNotification = async (
  req: Request,
  res: Response,
) => {
  // Acknowledge the WhatsApp event immediately to prevent retries
  res.status(200).send("EVENT_RECEIVED");

  try {
    const body = req.body;
    if (body.entry?.[0]?.changes?.[0]?.value?.statuses) return;

    const messageData = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!messageData || messageData.type !== "text") return;

    const senderPhoneNumber = messageData.from;
    console.log(senderPhoneNumber);
    const incomingText = messageData.text.body;
    const businessPhoneNumber =
      body.entry[0].changes[0].value.metadata.display_phone_number;

    // 1. Determine Identity (Is the sender a Doctor?)
    const matchingDoctor = await Doctor.findOne({
      phoneNumber: senderPhoneNumber,
    });
    let botReply =
      "I'm having trouble processing your request right now. Please try again shortly.";

    if (matchingDoctor) {
      // --- 👨‍⚕️ ROUTE TO DOCTOR AGENT ---
      console.log(
        `⚡ Routing message to Doctor Engine | Doctor: ${matchingDoctor.name} (${senderPhoneNumber})`,
      );
      const doctorThreadId = `doctor_${senderPhoneNumber}`;

      const response = (await doctorAgent.invoke(
        {
          doctor: matchingDoctor,
          doctorPhoneNumber: senderPhoneNumber,
          messages: [new HumanMessage(incomingText)],
        },
        {
          configurable: { thread_id: doctorThreadId },
        },
      )) as DoctorEngineStateType;

      // Extract the last AI Message specifically from the trace history
      const aiMessages = (response.messages || []).filter(
        (m) => m instanceof AIMessage || m._getType() === "ai",
      );
      if (aiMessages.length > 0) {
        botReply =
          aiMessages[aiMessages.length - 1]?.content?.toString() ?? botReply;
      }
    } else {
      // --- 👤 ROUTE TO PATIENT AGENT ---
      console.log(
        `⚡ Routing incoming message from Patient: ${senderPhoneNumber}`,
      );

      // Fallback fallback / target clinic doctor instance lookup
      // Using your original default instance logic for context
      const fallbackClinicDoctor = await Doctor.findOne({
        phoneNumber: "8766067044",
      });
      if (!fallbackClinicDoctor) {
        console.error(
          "❌ Clinic config failure: Primary Doctor document not found.",
        );
        return;
      }

      const patientThreadId = `${businessPhoneNumber}_${senderPhoneNumber}`;

      const response = (await appointmentAgent.invoke(
        {
          doctor: fallbackClinicDoctor,
          patientPhoneNumber: senderPhoneNumber,
          doctorPhoneNumber: businessPhoneNumber,
          messages: [new HumanMessage(incomingText)],
        },
        {
          configurable: { thread_id: patientThreadId },
        },
      )) as AppointmentAgentStateType;

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
