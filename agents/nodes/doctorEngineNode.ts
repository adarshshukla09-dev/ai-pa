import { generateText, isStepCount, Output } from "ai";
import { llmConfig } from "../llm/llm.config";
import { type DoctorEngineStateType } from "../state/doctorEngineState";
import { AIMessage } from "@langchain/core/messages";
import { DrInstruction } from "../../lib/db/models/drInstruction.model";
import z from "zod";

/**
 * NODE 1: Extract Intent
 * Structured extraction reflecting the cleaner separation of Action configurations 
 * vs Booking Intent payloads.
 */
export const extractInstructionIntent = async (state: DoctorEngineStateType) => {
  try {
    const lastMessage = state.messages[state.messages.length - 1]?.content;
    if (!lastMessage) return {};

    const modelConfig = await llmConfig(state.doctor);

    const extractionSchema = z.object({
      pendingInstruction: z.object({
        action: z.enum(["block_patient", "book_appointment", "override_rule"]),
        reason: z.string().optional().describe("Reason for system constraint or visit objective."),
        blockUntil: z.string().optional().describe("ISO timestamp if action is block_patient"),
      }),
      bookingIntent: z.object({
        start: z.string().optional().describe("ISO timestamp for booking start."),
        end: z.string().optional().describe("ISO timestamp for booking end. (If omitted but start is found, default to start + 1hr)"),
        purpose: z.string().optional().describe("Purpose of visit"),
      }).optional()
    });

    const response = await generateText({
      model: modelConfig.m,
      system: `Analyze doctor configuration inputs. Map durations cleanly using system baseline: ${new Date().toISOString()}`,
      prompt: `Extract structured details from: "${lastMessage}"`,
      output: Output.object({ schema: extractionSchema }),
    });

    const output = response.output;

    // Default calculations if a book action is missing absolute end times
    if (output.pendingInstruction.action === "book_appointment" && output.bookingIntent?.start) {
      if (!output.bookingIntent.end) {
        const startSecs = Date.parse(output.bookingIntent.start);
        output.bookingIntent.end = new Date(startSecs + 60 * 60 * 1000).toISOString();
      }
    }

    return {
      pendingInstruction: output.pendingInstruction,
      bookingIntent: output.bookingIntent || {}
    };
  } catch (error) {
    console.error("❌ Error in extractInstructionIntent node:", error);
    return {};
  }
};

/**
 * NODE 2: Resolve Target Patient
 * Persists name data, preserving structural data properties cleanly.
 */
export const resolveTargetPatient = async (state: DoctorEngineStateType) => {
  try {
    const originalMessage = state.messages.find(m => m._getType() === "human")?.content;
    if (!originalMessage) return {};

    const modelConfig = await llmConfig(state.doctor);
    const response = await generateText({
      model: modelConfig.m,
      system: "Identify target profile via findPatientByNameOrPhone.",
      prompt: `Identify patient references inside: "${originalMessage}"`,
      tools: { findPatientByNameOrPhone: modelConfig.tools.findPatientByNameOrPhone },
      stopWhen: isStepCount(3),
    });

    let targetPatientId: string | undefined;
    let targetPatientPhone: string | undefined;
    let targetPatientName: string | undefined;

    for (const step of response.steps) {
      for (const result of step.toolResults ?? []) {
        if (result.toolName === "findPatientByNameOrPhone") {
          const resEnvelope = result.output as { success: boolean; data: any; error: string | null };
          
          if (resEnvelope.success && resEnvelope.data?.patients?.length === 1) {
            const match = resEnvelope.data.patients[0];
            targetPatientId = match.id;
            targetPatientPhone = match.phoneNumber;
            targetPatientName = match.name; // Preserving context for future steps
          } else if (resEnvelope.success && resEnvelope.data?.patients?.length > 1) {
            const options = resEnvelope.data.patients.map((p: any) => p.name).join(", ");
            return {
              messages: [new AIMessage(`Multiple records matched (${options}). Which patient do you mean?`)],
            };
          }
        }
      }
    }

    if (!targetPatientPhone) {
      return {
        messages: [new AIMessage("I couldn't identify that patient record. Could you please clarify with their full name or phone number?")],
      };
    }

    return { targetPatientId, targetPatientPhone, targetPatientName };
  } catch (error) {
    console.error("❌ Error in resolveTargetPatient node:", error);
    return {};
  }
};

/**
 * NODE 3: Save Rules Architecture
 */
export const saveDoctorInstruction = async (state: DoctorEngineStateType) => {
  try {
    const { doctorPhoneNumber, targetPatientPhone, targetPatientName, pendingInstruction, messages } = state;
    const rawText = messages.find((m) => m._getType() === "human")?.content || "";

    if (!targetPatientPhone || !pendingInstruction?.action) return {};

    // Map legacy schema to matches cleanly
    await DrInstruction.findOneAndUpdate(
      {
        doctorPhoneNumber,
        patientPhoneNumber: targetPatientPhone,
        instructionType: pendingInstruction.action === "block_patient" ? "block" : "override",
        isActive: true,
      },
      {
        metaData: {
          blockUntil: pendingInstruction.blockUntil ? new Date(pendingInstruction.blockUntil) : undefined,
        },
        rawInstruction: rawText,
      },
      { upsert: true }
    );

    let confirmation = `System update completed: Parameters saved for ${targetPatientName || "the patient"}.`;
    if (pendingInstruction.action === "block_patient") {
      confirmation = `Confirmed: Profile for ${targetPatientName || targetPatientPhone} has been put on a rest period until ${pendingInstruction.blockUntil}.`;
    }

    return { messages: [new AIMessage(confirmation)] };
  } catch (error) {
    console.error("❌ Error running saveDoctorInstruction node:", error);
    return {};
  }
};