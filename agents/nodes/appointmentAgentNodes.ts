// src/agents/nodes/appointmentNodes.ts
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { generateText, isStepCount, Output } from "ai";
import type { AppointmentAgentStateType } from "../state/appointmentAgentState";
import { Patient } from "../../lib/db/models/patient.model";
import { getSystemPrompt } from "../prompts/SYSTEM_PROMPT";
import { llmConfig } from "../llm/llm.config";
import z from "zod";
import { getRegisterPrompt, getSchedulingPrompt } from "../prompts/appointmentPrompt";

export async function verifyPatientNode(state: AppointmentAgentStateType) {
  try {
    const existingPatient = await Patient.findOne({
      phoneNumber: state.patientPhoneNumber,
    });

    if (existingPatient) {
      return {
        patientStatus: "KNOWN" as const,
        patientId: existingPatient._id.toString(), // 👈 Explicitly cast MongoDB ObjectIDs to safe strings
        patientData: existingPatient,
      };
    }

    return {
      patientStatus: "UNKNOWN" as const,
    };
  } catch (error) {
    console.error("Error in verifyPatientNode:", error);
    return { patientStatus: "UNKNOWN" as const };
  }
}

export async function registerPatientNode(
  state: AppointmentAgentStateType,
): Promise<Partial<AppointmentAgentStateType>> {
  
  // Safe history string generation checking for both runtime classes and raw DB JSON rows
  const historyText = state.messages
    .slice(-4)
    .map(m => {
      const type = typeof m._getType === 'function' ? m._getType() : ((m as any).type || 'human');
      return `${type}: ${m.content}`;
    })
    .join("\n");

  const prompt = getRegisterPrompt({ state, historyText });
  const model = await llmConfig(state.doctor, 'registration');
  
  const patientSchema = z.object({
    name: z.string().min(1),
    phoneNumber: z.string().min(1),
    email: z.string().email().optional(),
    age: z.number().int().positive().optional(),
    gender: z.string().optional(),
  });

  const response = await generateText({
    model: model.m,
    system: getSystemPrompt(),
    prompt,
    tools: model.tools,
    output: Output.object({ schema: patientSchema }),
    stopWhen: isStepCount(2), 
  });

  const replyText = response.text?.trim() || "Processing your registration.";

  const patient = await Patient.findOne({ phoneNumber: state.patientPhoneNumber });
  if (patient) {
    return {
      patientStatus: "KNOWN",
      patientId: patient._id.toString(), // 👈 Sync tracking here during active fallback matches
      patientData: patient,
      messages: [new AIMessage(replyText)],
    };
  }

  return {
    patientStatus: "UNKNOWN",
    patientData: undefined,
    messages: [new AIMessage(replyText)],
  };
}

export async function scheduleAppointmentNode(
  state: AppointmentAgentStateType,
): Promise<Partial<AppointmentAgentStateType>> {
  
  const historyText = state.messages
    .slice(-4)
    .map(m => {
      const type = typeof m._getType === "function" ? m._getType() : ((m as any).type || "human");
      return `${type}: ${m.content}`;
    })
    .join("\n");

  const prompt = getSchedulingPrompt({ state, historyText });
  const model = await llmConfig(state.doctor, "scheduling");

  const response = await generateText({
    model: model.m,
    prompt,
    tools: model.tools,
    system: getSystemPrompt(),
    stopWhen: isStepCount(2), 
  });

  const newMessages: BaseMessage[] = [];

  // Check if a tool was executed during this turn
 // Inside scheduleAppointmentNode...
if (response.toolResults && response.toolResults.length > 0) {
  for (const toolResult of response.toolResults) {
    // ✅ Check if it's the right tool and safely verify the result property exists
    if (
      toolResult.toolName === "bookAppointment" && 
      "result" in toolResult && 
      (toolResult.result as any)?.success
    ) {
      const bookingData = toolResult.result as any;
      const appt = bookingData.appointment;
      
      const successMessage = `🎉 **Appointment Confirmed!** I have booked your *normal visit* for **${state.bookingIntent?.date || "today"} at 3:00 pm UTC**. Your booking ID is \`${appt?._id || "Verified"}\`. See you then!`;
      
      newMessages.push(new AIMessage(successMessage));
      
      return {
        messages: newMessages,
        confirmationPending: false,
      };
    }
  }
}

  // Fallback: If no tool ran and it generated text responses instead
  if (response.text) {
    newMessages.push(new AIMessage(response.text));
  }

  return {
    messages: newMessages,
  };
}