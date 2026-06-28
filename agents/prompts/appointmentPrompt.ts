// src/agents/prompts/appointmentPrompts.ts
import type { AppointmentAgentStateType } from "../state/appointmentAgentState";

interface PromptConfig {
  state: AppointmentAgentStateType;
  historyText: string;
}
const date = new Date().toISOString().split("T")[0];
// src/agents/prompts/appointmentPrompt.ts
export const getSchedulingPrompt = ({ state, historyText }: PromptConfig): string => {
  const patientIdString = state.patientId ? state.patientId.toString() : (state.patientData?._id?.toString() || "UNKNOWN");
  const patientName = state.patientData?.name || "Patient";

  return `[OBJECTIVE]
You are handling the Appointment Scheduling workflow for: ${patientName}.
CRITICAL DATA REQUIRED FOR BOOKING: You MUST pass this exact value for patientId when calling booking tools: "${patientIdString}"

[CONVERSATION HISTORY]
${historyText}

[WORKFLOW & TOOL INSTRUCTIONS]
1. Read the history closely. If you already stated a slot is available and the user confirms (e.g., "confirm and book", "yes please", "y"), you MUST immediately invoke the 'bookAppointment' tool right now.
2. DO NOT output text or ask another confirmation question. Call the tool.
3. Compute the current targeted ISO values. The targeted appointment is:
   - Date/Time: 2026-06-28 at 15:00:00 UTC
   - Start ISO Window: "2026-06-28T15:00:00.000Z"
   - End ISO Window: "2026-06-28T16:00:00.000Z"

[TOOL EXECUTION VALUES]
- patientId: "${patientIdString}"
- summary: "Normal Visit - ${patientName}"
- start: { "dateTime": "2026-06-28T15:00:00.000Z", "timeZone": "UTC" }
- end: { "dateTime": "2026-06-28T16:00:00.000Z", "timeZone": "UTC" }`;
};

export const getRegisterPrompt = ({ state, historyText }: PromptConfig): string => {
  return `[OBJECTIVE]
You are registering a new patient. 
Known Phone Number: ${state.patientPhoneNumber} (Do not ask for this).
today date is ${date}
[CONVERSATION HISTORY]
${historyText}

[WORKFLOW]
1. Identify missing required information based on history.
   - Required: Name
   - Optional: Age, Gender, Email
2. If Name is missing -> Ask for it clearly.
3. The instant the required info is available -> Call the createPatient tool.`;
};