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
  patientId: Annotation<string | undefined>(),
  patientData: Annotation<PatientDocument | undefined>(),

  appointmentIntent: Annotation<"book" | "cancel" | "reschedule" | "query">(),
  
  confirmationPending: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),

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
    end:string | undefined;
    purpose: string;
  } | undefined>({
    reducer: (_, y) => y,
    default: () => undefined,
  }),
});

export type AppointmentAgentStateType = typeof AppointmentAgentState.State;
