import { AIMessage } from "@langchain/core/messages";
import { generateText, Output, convertToModelMessages, isStepCount } from "ai";
import type { AppointmentAgentStateType } from "../state/appointmentAgentState";
import { Patient } from "../../lib/db/models/patient.model";
import { llmConfig } from "../llm/llm.config";
import z from "zod";
import { getSystemPrompt } from "../prompts/SYSTEM_PROMPT";
// --- Node 1: Verify Patient ---
export async function verifyPatientNode(state: AppointmentAgentStateType) {
  try {
    const existingPatient = await Patient.findOne({
      phoneNumber: state.patientPhoneNumber,
    });
    if (existingPatient) {
      return {
        patientStatus: "KNOWN" as const,
        patientId: existingPatient._id.toString(),
        patientData: existingPatient,
      };
    }
    return { patientStatus: "UNKNOWN" as const };
  } catch (error) {
    console.error("Error in verifyPatientNode:", error);
    return { patientStatus: "UNKNOWN" as const };
  }
}

// --- Node 2: Register Patient (Fixed Logic & Tool Execution Loops) ---
export async function registerPatientNode(state: AppointmentAgentStateType) {
  try {
    const modelConfig = await llmConfig(state.doctor);

    const prompt = `You are onboarding a new patient. Collect their name. 
    Current gathered data: ${JSON.stringify(state.registrationData || {})}
    If you have enough information (Name & Phone), call the "createPatient" tool.
    Otherwise, ask the user politely for their missing details.
    
    Latest user message: ${state.messages[state.messages.length - 1]?.content}`;

    const response = await generateText({
      model: modelConfig.m,
      system: getSystemPrompt(),
      prompt,
      tools: {
        createPatient: modelConfig.tools.createPatient,
      },
      stopWhen: isStepCount(3),
    });

    // Re-verify if registration occurred during tool execution loop
    const patient = await Patient.findOne({
      phoneNumber: state.patientPhoneNumber,
    });
    if (patient) {
      return {
        patientStatus: "KNOWN" as const,
        patientId: patient._id.toString(),
        patientData: patient,
        messages: [new AIMessage(response.text || "Registration complete!")],
      };
    }

    return {
      patientStatus: "UNKNOWN" as const,
      messages: [
        new AIMessage(
          response.text ||
            "Could you please provide your full name to get registered?",
        ),
      ],
    };
  } catch (error) {
    console.error("Error in registerPatientNode:", error);
    return {
      messages: [new AIMessage("Something went wrong with registration.")],
    };
  }
}

// --- Node 3: Analyze Intent (Perfect As-is) ---
export async function analyzeIntentNode(state: AppointmentAgentStateType) {
  try {
    const historyText = state.messages
      .slice(-4)
      .map((m) => `${m._getType?.() || "user"}: ${m.content}`)
      .join("\n");
    const prompt = `Analyze the user conversation history and identify their primary intent.
Return exactly one classification token: "book", "cancel", "reschedule", or "query".

History:
${historyText}`;

    const modelConfig = await llmConfig(state.doctor);
    const response = await generateText({
      model: modelConfig.m,
      prompt,
      output: Output.object({
        schema: z.object({
          intent: z.enum(["book", "cancel", "reschedule", "query"]),
        }),
      }),
    });

    return { appointmentIntent: response.output.intent };
  } catch (error) {
    console.error("Error in analyzeIntentNode:", error);
    return { appointmentIntent: "query" as const };
  }
}

// --- Node 4: Book Appointment (Fixed multi-step tool sequence requirement) ---
export async function bookAppointmentNode(state: AppointmentAgentStateType) {
  try {
    const historyText = state.messages
      .slice(-4)
      .map((m) => `${m._getType?.() || "user"}: ${m.content}`)
      .join("\n");
    const prompt = `Help the patient book an appointment.
Step 1: Call "checkAvailability" first to see if the requested date/time slot is open.
Step 2: If available, call "bookAppointment" to commit the record.

Patient ID Context: ${state.patientId}
History:
${historyText}`;

    const modelConfig = await llmConfig(state.doctor);
    const response = await generateText({
      model: modelConfig.m, // Valid CoreLM instance
      prompt,
      tools: {
        checkAvailability: modelConfig.tools.checkAvailability,
        bookAppointment: modelConfig.tools.bookAppointment,
      }, // Your combined dbTools and calendarTools
      stopWhen: isStepCount(5),
      system: getSystemPrompt(),
    });

    return {
      messages: [
        new AIMessage(response.text || "Appointment booked successfully."),
      ],
    };
  } catch (error) {
    console.error("Error in bookAppointmentNode:", error);
    return {
      messages: [
        new AIMessage("Sorry, I ran into an error booking your appointment."),
      ],
    };
  }
}

// Ensure cancel, reschedule, and query nodes also receive `maxSteps: 3` properties inside their `generateText` execution parameters
// --- Node 5: Cancel Appointment ---
export async function cancelAppointmentNode(state: AppointmentAgentStateType) {
    try {
    const historyText = state.messages
      .slice(-4)
      .map((m) => `${m._getType?.() || "user"}: ${m.content}`)
      .join("\n");
    const modelConfig = await llmConfig(state.doctor);
    const prompt = `Cancel appointment workflow:

* Always call "getPatientAppointments" first use ${state.patientId}.
* Identify the appointment from DB results.
* If one match, call "cancelAppointment".
* If multiple, clarify using only date/time.
* Never request or expose internal IDs.
* Confirm only on successful cancellation.
 converstional history: ${historyText}`;

    const response = await generateText({
      model: modelConfig.m,
      prompt,
       tools: {
    getPatientAppointments: modelConfig.tools.getPatientAppointments,
    cancelAppointment: modelConfig.tools.cancelAppointment,
  },
      stopWhen: isStepCount(3),
    });

    return {
      messages: [new AIMessage(response.text || "Processing cancellation.")],
    };
  } catch (error) {
    console.error("Error in cancelAppointmentNode:", error);
    return {
      messages: [
        new AIMessage("Could not complete cancellation at this time."),
      ],
    };
  }
}

// --- Node 6: Reschedule Appointment ---
export async function rescheduleAppointmentNode(
  state: AppointmentAgentStateType,
) {
  try {
    const historyText = state.messages
      .slice(-4)
      .map((m) => `${m._getType?.() || "user"}: ${m.content}`)
      .join("\n");
    const modelConfig = await llmConfig(state.doctor);
    const prompt = `The user wants to reschedule. Use "checkAvailability" to verify the new slot, then use "updateAppointment" to change it also consider patientid as ${state.patientId} . conversational history: ${historyText}`;

    const response = await generateText({
      model: modelConfig.m,
      prompt,
      tools: {
        getPatientAppointments: modelConfig.tools.getPatientAppointments,
        checkAvailability: modelConfig.tools.checkAvailability,
        updateAppointment: modelConfig.tools.updateAppointment,
      },
      stopWhen: isStepCount(3),
    });

    return {
      messages: [
        new AIMessage(response.text || "Processing rescheduling request."),
      ],
    };
  } catch (error) {
    console.error("Error in rescheduleAppointmentNode:", error);
    return {
      messages: [new AIMessage("Could not complete rescheduling process.")],
    };
  }
}

// --- Node 7: Query Appointments ---
export async function queryAppointmentNode(state: AppointmentAgentStateType) {
  try {
    const historyText = state.messages
      .slice(-4)
      .map((m) => `${m._getType?.() || "user"}: ${m.content}`)
      .join("\n");
    const modelConfig = await llmConfig(state.doctor);
    const prompt = `The user is querying their schedule. Use the "getPatientAppointments" tool to check status for patientId: ${state.patientId} converstional history: ${historyText}`;

    const response = await generateText({
      model: modelConfig.m,
      prompt,
      tools:{ getPatientAppointments: modelConfig.tools.getPatientAppointments },
      stopWhen: isStepCount(3),
    });

    return {
      messages: [
        new AIMessage(response.text || "Fetching your appointment info."),
      ],
    };
  } catch (error) {
    console.error("Error in queryAppointmentNode:", error);
    return {
      messages: [
        new AIMessage("Could not look up your appointments right now."),
      ],
    };
  }
}
