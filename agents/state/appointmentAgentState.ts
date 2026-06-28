// src/agents/state/appointmentAgentState.ts
import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import type { DoctorDocument } from "../../lib/db/models/doctor.models";
import { type PatientDocument } from "../../lib/db/models/patient.model";

export const AppointmentAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  doctor: Annotation<DoctorDocument>(),

  patientPhoneNumber: Annotation<string>(),
  doctorPhoneNumber: Annotation<string>(),

  patientStatus: Annotation<"UNKNOWN" | "KNOWN" | "PENDING_REGISTRATION">(),
  patientId: Annotation<string | undefined>(), // 👈 ADD THIS LINE HERE
  confirmationPending: Annotation<boolean>(),
  patientData: Annotation<PatientDocument | undefined>(),

  registrationData: Annotation<{
    name?: string;
    email?: string;
    age?: number;
    gender?: string;
  }>({
    reducer: (_, y) => y,
    default: () => ({}),
  }),

  bookingIntent: Annotation<{
    date: string;
    start: string;
    purpose: string;
  }>({
    reducer: (_, y) => y,
  }),
});

export type AppointmentAgentStateType = typeof AppointmentAgentState.State;