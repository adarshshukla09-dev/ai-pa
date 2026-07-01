import { generateText, isStepCount, Output } from "ai";
import { llmConfig } from "../llm/llm.config";
import { type DoctorEngineStateType } from "../state/doctorEngineState";
import { AIMessage } from "@langchain/core/messages";
import { DrInstruction } from "../../lib/db/models/drInstruction.model";
import z from "zod";

/**
 * NODE 1: Extract Intent
 */
export const extractInstructionIntent = async (state: DoctorEngineStateType) => {
  try {
    const lastMessage = state.messages.findLast((m) => m._getType() === "human")?.content;
    if (!lastMessage) return {};

    const modelConfig = await llmConfig(state.doctor);
    const prompt = `You are an AI assistant helping extract instructions, booking intents, etc., from the following message: ${lastMessage}`;
    
    const extractionSchema = z.object({
      pendingInstruction: z.object({
        action: z.enum([ "block_patient" , "book_appointment" ,"update_appointment" ,"cancel_appointment" , "override_rule"])         
          .describe("Must be 'book_appointment' if the user is attempting to schedule a visit."),
        reason: z.string().nullable().describe("Reason for system constraint or visit objective."),
        blockUntil: z.string().nullable().describe("ISO timestamp if action is block_patient"),
      }),
      AppointmentData: z.object({
        start: z.string().nullable().describe("ISO timestamp for booking start."),
        end: z.string().nullable().describe("ISO timestamp for booking end. (If omitted but start is found, default to start + 1hr)"),
        purpose: z.string().nullable().describe("Purpose of visit"),
      }).nullable(),
    });

    const response = await generateText({
      model: modelConfig.m,
      system: `Analyze doctor configuration inputs. Map durations cleanly using system baseline: ${new Date().toISOString()}`,
      prompt,
      output: Output.object({ schema: extractionSchema }),
    });

    let extracted = response.output;

    // 🟢 SAFEGUARD: Force action type if booking components are extracted
    if (extracted.AppointmentData?.start && (!extracted.pendingInstruction || extracted.pendingInstruction.action !== "block_patient")) {
      extracted.pendingInstruction = {
        action: "book_appointment",
        reason: extracted.AppointmentData.purpose || "Appointment booking",
        blockUntil: null
      };
    }
console.log(state)
console.log(extracted)
    return {
      pendingInstruction: extracted.pendingInstruction,
      AppointmentData: extracted.AppointmentData || {},
    };
  } catch (error) {
    console.error("❌ Error in extractInstructionIntent node:", error);
    return {};
  }
};

export const resolveTargetPatient = async (state: DoctorEngineStateType) => {
  try {
    // Grabs the most recent human message input
const originalMessage =state.messages.findLast((m) => m._getType() === "human")?.content || "";    
    if (!originalMessage) return {};

    const prompt = `Identify patient and get information by calling tool name "findPatientByNameOrPhone" from the following message: ${originalMessage}`;
    const modelConfig = await llmConfig(state.doctor);
    
    const response = await generateText({
      model: modelConfig.m,
      prompt,
      tools: {
        findPatientByNameOrPhone: modelConfig.tools.findPatientByNameOrPhone,
      },
      stopWhen: isStepCount(3),
    });

    let targetPatientId: string | undefined;
    let targetPatientPhone: string | undefined;
    let targetPatientName: string | undefined;

    for (const step of response.steps) {
      for (const result of step.toolResults ?? []) {
        if (result.toolName === "findPatientByNameOrPhone") {
          // FIX: Adjusted interface signature to match your actual tool return type (no nested .data)
          const resEnvelope = result.output as { 
            success: boolean; 
            patients?: Array<{ id?: string; _id?: string; name: string; phoneNumber?: string; phone?: string }>; 
            message?: string; 
          };

          // FIX: Access resEnvelope.patients directly instead of resEnvelope.data.patients
          if (resEnvelope.success && resEnvelope.patients && resEnvelope.patients.length === 1) {
            const match = resEnvelope.patients[0];
            console.log("Matched Patient:", match);
            if(!match) return {};
            targetPatientId = match.id || match._id; 
            targetPatientPhone = match.phoneNumber || match.phone;
            targetPatientName = match.name;
          } else if (resEnvelope.success && resEnvelope.patients && resEnvelope.patients.length > 1) {
            const options = resEnvelope.patients.map((p: any) => p.name).join(", ");
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
 * NODE 3: Check Availability
 */
export const checkavailability = async (state: DoctorEngineStateType) => {
  try {
    const modelconfig = await llmConfig(state.doctor);
    let slotAvailable = false;

    const response = await generateText({
      model: modelconfig.m,
      tools: {
        checkAvailability: modelconfig.tools.checkAvailability,
      },
      prompt: `check whether the slot or time period is available or not for the patient's appointment using tool checkAvailability with start time: ${state.AppointmentData?.start}`,
    });

    // Extract dynamic outcome execution details from tool results
    for (const step of response.steps) {
      for (const result of step.toolResults ?? []) {
        if (result.toolName === "checkAvailability") {
          const resEnvelope = result.output as { success: boolean; data: any };
          if (resEnvelope.success && resEnvelope.data?.available === true) {
            slotAvailable = true;
          }
        }
      }
    }

    return {
      slotAvailable,
      messages: [new AIMessage(response.text || `Checked availability. Slot available: ${slotAvailable}`)],
    };
  } catch (error) {
    console.error("❌ Error in checkavailability node:", error);
    return { slotAvailable: false };
  }
};

/**
 * NODE 4: Book Appointment Execution
 */
export const bookingDrNode = async (state: DoctorEngineStateType) => {
  try {
    const llmconfig = await llmConfig(state.doctor);
    let bookedAppointmentId: string | undefined;

    const response = await generateText({
      model: llmconfig.m,
      tools: {
        bookAppointment: llmconfig.tools.bookAppointment,
      },
      prompt: `book a slot for the patient using tool bookAppointment with start:${state.AppointmentData?.start}, end:${state.AppointmentData?.end}, patientId:${state.targetPatientId} and purpose:${state.AppointmentData?.purpose}`,
    });

    for (const step of response.steps) {
      for (const result of step.toolResults ?? []) {
        if (result.toolName === "bookAppointment") {
          const resEnvelope = result.output as { success: boolean; data: any };
          // Fixed structural evaluation logic to match appointment attributes instead of patient attributes
          if (resEnvelope.success && resEnvelope.data?.Appointments?.length > 0) {
            const match = resEnvelope.data.Appointments[0];
            bookedAppointmentId = match.id;
          }
        }
      }
    }

    return {
      appointmentBooked: !!bookedAppointmentId,
      bookedAppointmentId,
      messages: [new AIMessage(response.text || "Appointment process completed successfully.")],
    };
  } catch (error) {
    console.error("❌ Error in bookingDrNode:", error);
    return {};
  }
};
export const cancelAppointment = async (state: DoctorEngineStateType) => {
  try {
    const modelConfig = await llmConfig(state.doctor);
    
    // Explicit system prompt guidance ensures the LLM knows to look up the list first
    const response = await generateText({
      model: modelConfig.m,
      system: `You are an executive medical assistant. When a doctor requests to cancel an appointment 
               without providing a direct ID, call 'getPatientAppointments' to view active entries, 
               identify the target slot based on the user conversation timeline, and then invoke 'cancelAppointment'.`,
      prompt: `Cancel the appointment for patientId: ${state.targetPatientId}. 
               If context is missing, look it up using getPatientAppointments.`,
      tools: {
        getPatientAppointments: modelConfig.tools.getPatientAppointments,
        cancelAppointment: modelConfig.tools.cancelAppointment,
      },
      stopWhen: isStepCount(5),
    });

    let successfullyCancelledId = state.bookedAppointmentId;

    // Scan execution outcomes to confirm database success and extract the real ID
    for (const step of response.steps) {
      for (const result of step.toolResults ?? []) {
        if (result.toolName === "cancelAppointment") {
          const envelope = result.output as { 
            success: boolean; 
            data?: { appointment?: { id?: string } } 
          };
          
          if (envelope.success && envelope.data?.appointment?.id) {
            successfullyCancelledId = envelope.data.appointment.id;
          }
        }
      }
    }

    return {
      // Updates state context so follow-up actions or logs know which ID was affected
      bookedAppointmentId: successfullyCancelledId,
      messages: [new AIMessage(response.text || "The appointment cancellation was processed successfully.")]
    };
  }
  catch (error) {
    console.error("❌ Error running cancelAppointment node execution path:", error);
    return {
      messages: [new AIMessage("I encountered an internal error trying to clear that appointment slot.")]
    };
  }
};
export const updateAppointment = async (state: DoctorEngineStateType) => {
  try {
    const modelConfig = await llmConfig(state.doctor);
    const response = await generateText({
      model: modelConfig.m,
      prompt: `update an appointment for the patient using tool updateAppointment with patientId:${state.targetPatientId} and appointmentId:${state.bookedAppointmentId} if needed`,
      tools: {
        updateAppointment: modelConfig.tools.updateAppointment,
      },
    })
    return {
      messages: [new AIMessage(response.text || "The update order was executed successfully.")],
    };
  }
  catch (error) {
    console.log(error instanceof Error? error.message : String(error));
  }
}

/**
 * NODE 5: Save Rules Configuration Architecture
 */
export const saveDoctorInstruction = async (state: DoctorEngineStateType) => {
  try {
    const { doctorPhoneNumber, targetPatientPhone, targetPatientName, pendingInstruction, messages } = state;
const rawText =state.messages.findLast((m) => m._getType() === "human")?.content || "";    

    if (!targetPatientPhone || !pendingInstruction?.action) return {};

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
      { upsert: true },
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
