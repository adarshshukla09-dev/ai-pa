// nodes.ts
import { AIMessage } from "@langchain/core/messages";
import { generateText, isStepCount, Output } from "ai";
import type { AppointmentAgentStateType } from "../state/state";
import { Patient } from "../../lib/db/models/patient.model";
import { SYSTEM_PROMPT } from "../prompts/SYSTEM_PROMPT";
import { llmConfig } from "../llm/llm.config";
import z from "zod";

export async function verifyPatientNode(state: AppointmentAgentStateType) {
  try {
    const existingPatient = await Patient.findOne({
      phoneNumber: state.patientPhoneNumber,
    });

    if (existingPatient) {
      return {
        patientStatus: "KNOWN",
        patientId: existingPatient.id,
        patientData: existingPatient, // Keep context hydrated if needed
      };
    }

    return {
      patientStatus: "UNKNOWN",
    };
  } catch (error) {
    console.error("Error in verifyPatientNode:", error);
    return { patientStatus: "UNKNOWN" };
  }
}
export async function registerPatientNode(
  state: AppointmentAgentStateType,
): Promise<Partial<AppointmentAgentStateType>> {
  const history = state.messages
    .map(
      (m) => `${m._getType() === "human" ? "User" : "Assistant"}: ${m.content}`,
    )
    .join("\n");

  const prompt = `
[OBJECTIVE]
You are currently in the Patient Registration workflow.

The patient is not registered.

Known information:
- Phone Number: ${state.patientPhoneNumber}

Conversation:
${history}

Your responsibilities:

1. Read the entire conversation.
2. Extract any patient information already provided.
3. Do NOT ask for the phone number because it is already known.
4. If enough information exists to register the patient, immediately call the createPatient tool.
5. If registration succeeds, tell the patient they have been registered.
6. If required information is still missing, ask ONLY for the next missing required field.

Required field:
- name

Optional fields:
- age
- gender
- email

Rules:
- Never ask for information already provided.
- Never ask multiple questions if only one required field is missing.
- Never fabricate information.
- Use createPatient only once all required information is available.
`;

  const model = await llmConfig(state);
  const patientSchema = z.object({
    name: z.string().min(1),
    phoneNumber: z.string().min(1),
    email: z.string().email().optional(),
    age: z.number().int().positive().optional(),
    gender: z.string().optional(),
  });

  const response = await generateText({
    model: model.m,
    system: SYSTEM_PROMPT,
    prompt,
    tools: model.tools,
    output: Output.object({
      schema: patientSchema,
    }),
    stopWhen: isStepCount(8),
  });

  const replyText =
    response.text?.trim() || "Thank you. Processing your registration.";
  let registered = false;
  for (const step of response.steps) {
    for (const result of step.toolResults ?? []) {
      if (
        result.toolName === "createPatient" &&
        (result.output as { success?: boolean }).success === true
      ) {
        registered = true;
      }
    }
  }

  const patient = await Patient.findOne({
    phoneNumber: state.patientPhoneNumber,
  });
  if (!patient) {
    return {
      patientStatus: "KNOWN",
      patientData: patient ?? undefined, // 👈 Convert null to undefined
    };
  }

  return {
    patientStatus: "UNKNOWN",
    patientData: undefined, // 👈 Explicitly clear it or leave it undefined
    messages: [new AIMessage(replyText)],
  };
}

export async function scheduleAppointmentNode(
  state: AppointmentAgentStateType,
): Promise<Partial<AppointmentAgentStateType>> {
  const historyText = state.messages
    .map((m) => `${m._getType() === "ai" ? "Assistant" : "User"}: ${m.content}`)
    .join("\n");

  const prompt = `[OBJECTIVE]
You are in the Appointment Scheduling workflow.
If the appointment details are incomplete,
ask the patient for the missing information.

Only call createCalendarEvent after:
- date
- time
- purpose

are all known.
Patient Phone:
${state.patientPhoneNumber}

Today's date:
${new Date().toISOString()}

Conversation:
${historyText}

Your responsibilities:

1. Understand the appointment request.
2. Determine the requested date and time.
3.Use checkAvailability before booking.

If available=true:
- summarize the booking
- wait for confirmation

If available=false:
- offer ONLY the returned alternatives

Never invent availability.
Never invent alternative slots.4. Never assume a slot is free.
When all required information is known:

1. Use checkAvailability.

2. If unavailable:
   Offer returned alternatives.

3. If available:
   Summarize booking.

4. Wait for confirmation.

5. After confirmation call bookAppointment.
6.When calling bookAppointment/createCalendarEventAndAppointment:

summary format:
<Purpose> - <Patient Name> (<Phone Number>)

Examples:
"Cough & Fever - Anurag (9876543210)"
"Dental Checkup - Rahul (9988776655)"
Never call any other booking tool.
Rules:
- Never create duplicate appointments.
- Never invent availability.
- Never expose raw tool outputs.
`;

  const model = await llmConfig(state);

  const response = await generateText({
    model: model.m,
    prompt: prompt,
    tools: model.tools,
    system: SYSTEM_PROMPT,
    stopWhen: isStepCount(5),
  });

  // FIX: Only return the *new* message instance. Do NOT spread state.messages here
  // because the Annotation reducer `x.concat(y)` is already doing it!
  return {
    messages: [new AIMessage(response.text)],
  };
}
