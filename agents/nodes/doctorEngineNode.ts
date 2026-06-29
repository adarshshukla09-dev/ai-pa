import { generateText, isStepCount, Output } from "ai";
import { llmConfig } from "../llm/llm.config";
import { type DoctorEngineStateType } from "../state/doctorEngineState";
import { AIMessage } from "@langchain/core/messages";
import { DrInstruction } from "../../lib/db/models/drInstruction.model";
import z from "zod";

/**
 * NODE 1: Extract Intent
 * Extracts WHAT the doctor wants to do (e.g., block, duration) immediately.
 */
export const extractInstructionIntent = async (state: DoctorEngineStateType) => {
  try {
    const lastMessage = state.messages[state.messages.length - 1]?.content;
    if (!lastMessage) return {};

    const modelConfig = await llmConfig(state.doctor);
    
    const extractionSchema = z.object({
      instructionType: z.enum(["block", "force_schedule", "override"]),
      blockUntil: z.string().optional().describe("ISO date-time string if placing a block rule."),
      forcedAppointmentTime: z.string().optional().describe("ISO date-time string if forcing a specific time rule."),
    });

    const response = await generateText({
      model: modelConfig.model,
      system: `Analyze the instruction text from the doctor. Map relative dates/durations (like 'until 2 days') accurately using the server system time reference: ${new Date().toISOString()}`,
      prompt: `Extract routing metrics for this directive: "${lastMessage}"`,
      output: Output.object({ schema: extractionSchema }),
    });

    return {
      pendingInstruction: response.output,
    };
  } catch (error) {
    console.error("❌ Error extracting intent in node 1:", error);
    return {};
  }
};

/**
 * NODE 2: Resolve Target Patient
 * Uses the lookup tool to bind the rule to an actual patient profile.
 */
export const resolveTargetPatient = async (state: DoctorEngineStateType) => {
  try {
    const originalMessage = state.messages.find(m => m._getType() === "human")?.content;
    if (!originalMessage) return {};

    const modelConfig = await llmConfig(state.doctor);

    const response = await generateText({
      model: modelConfig.model,
      system: `You are a clinic assistant. Look up the patient mentioned in this text using 'findPatientByNameOrPhone'. 
      If the doctor explicitly requests to book an appointment, use the 'bookAppointment' tool as well. 
      Pass raw names directly to the tool.`,
      prompt: `Doctor instruction: "${originalMessage}"`,
      tools: modelConfig.tools, // Ensure bookAppointment is inside this list
      stopWhen: isStepCount(5),
    });

    let targetPatientId: string | undefined = undefined;
    let targetPatientPhone: string | undefined = undefined;
    let appointmentBookedSuccess = false;
    let appointmentDetails = null;

    // Iterate over tool execution steps
    for (const step of response.steps) {
      for (const result of step.toolResults ?? []) {
        
        // 1. Handle Patient Lookup
        if (result.toolName === "findPatientByNameOrPhone") {
          const output = result.output as { success: boolean; patients?: any[]; message?: string };

          if (output.success && output.patients?.length === 1) {
            const matchedPatient = output.patients[0];
            targetPatientId = matchedPatient.id;
            targetPatientPhone = matchedPatient.phoneNumber;
          } 
          
          if (output.success && output.patients && output.patients.length > 1) {
            const namesList = output.patients.map((p) => p.name).join(", ");
            return {
              messages: [
                new AIMessage(`I found multiple matching records: (${namesList}). Could you reply with the exact full name or phone number?`),
              ],
            };
          }
        }

        // 2. Handle Appointment Booking Tool Result
        if (result.toolName === "bookAppointment") {
          const output = result.output as { success: boolean; appointment?: any; error?: string };
          if (output.success) {
            appointmentBookedSuccess = true;
            appointmentDetails = output.appointment;
          }
        }
      }
    }

    // If no patient was found globally
    if (!targetPatientPhone) {
      return {
        messages: [
          new AIMessage(response.text || "I couldn't identify that patient record. Could you please specify their full name or phone number?"),
        ],
      };
    }

    // Return the state updates, passing down booking variables if any
    return {
      targetPatientId,
      targetPatientPhone,
      appointmentBooked: appointmentBookedSuccess,
      appointmentDetails: appointmentDetails
    };

  } catch (error) {
    console.error("❌ Error matching patient and booking in resolve node:", error);
    return {};
  }
};

/**
 * NODE 3: Persist Rule
 * Writes finalized rules into the database once the target patient is resolved.
 */
export const saveDoctorInstruction = async (state: DoctorEngineStateType) => {
  try {
    // Read appointment variables injected from Node 2 state
    const { doctorPhoneNumber, targetPatientPhone, pendingInstruction, messages, appointmentBooked } = state as any;
    const originalText = messages.find((m:any)=> m._getType() === "human")?.content || "";

    if (!targetPatientPhone || !pendingInstruction?.instructionType) return {};

    // Persist your blocking rule restrictions
    await DrInstruction.findOneAndUpdate(
      {
        doctorPhoneNumber,
        patientPhoneNumber: targetPatientPhone,
        instructionType: pendingInstruction.instructionType,
        isActive: true,
      },
      {
        metaData: {
          blockUntil: pendingInstruction.blockUntil ? new Date(pendingInstruction.blockUntil) : undefined,
          forcedAppointmentTime: pendingInstruction.forcedAppointmentTime ? new Date(pendingInstruction.forcedAppointmentTime) : undefined,
        },
        rawInstruction: originalText,
      },
      { upsert: true }
    );

    // Build compound response message
    let successConfirmation = `Understood. System constraints updated successfully.`;
    if (pendingInstruction.instructionType === "block") {
      successConfirmation = `Confirmed: Patient profile (${targetPatientPhone}) has been placed on a rest period until ${pendingInstruction.blockUntil}.`;
    }

    // Append appointment booking notes if the tool was fired
    if (appointmentBooked) {
      successConfirmation += ` Additionally, I have successfully booked their appointment on your calendar as requested.`;
    }

    return {
      messages: [new AIMessage(successConfirmation)],
    };
  } catch (error) {
    console.error("❌ Error updating drInstruction database record:", error);
    return {};
  }
};