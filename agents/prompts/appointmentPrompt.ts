import type { AppointmentAgentStateType } from "../state/appointmentAgentState";

interface PromptConfig {
  state: AppointmentAgentStateType;
}

export const getSchedulingPrompt = ({ state }: PromptConfig): string => {
  const patientId = state.patientId ?? state.patientData?._id?.toString() ?? "UNKNOWN";
  const patientName = state.patientData?.name ?? "Patient";
  const doctorId = state.doctor?._id?.toString() ?? "UNKNOWN";

  return [
    "## APPOINTMENT CONTEXT",
    "Patient Name: " + patientName,
    "Patient ID: " + patientId,
    "Doctor ID: " + doctorId,
    "",
    "The database is the only source of truth for appointment facts.",
    "Use conversation text only to understand what the patient is asking.",
    "",
    "Required behavior:",
    "- For appointment questions, call getPatientAppointments before answering.",
    "- For booking, call checkAvailability before bookAppointment.",
    "- For rescheduling, call getPatientAppointments first, then checkAvailability, then updateAppointment.",
    "- For cancellation, call getPatientAppointments first, then cancelAppointment.",
    "- If multiple appointments match and the patient did not identify which one, ask a brief clarifying question.",
    "- Never claim an appointment was booked, moved, or cancelled unless the matching tool returns success: true.",
    "- Do not expose internal ids unless the patient explicitly asks for them.",
  ].join("\n");
};

export const getRegisterPrompt = ({ state }: PromptConfig): string => {
  return [
    "## PATIENT REGISTRATION",
    "Known Phone Number: " + state.patientPhoneNumber,
    "",
    "Collect only missing profile data.",
    "Required: name.",
    "Optional: age, gender, email.",
    "",
    "When the patient provides their name, immediately call createPatient with the known phone number.",
    "Do not ask again for the phone number.",
  ].join("\n");
};
