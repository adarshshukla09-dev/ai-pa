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

  // Renamed for extensible scaling (Point 7)
  action: Annotation<"book" | "cancel" | "reschedule" | "query" | "register" | "insurance">(),
  
  confirmationPending: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),

  // Fixed Reducer: Merges across turns instead of wiping past values (Point 8)
  registrationData: Annotation<{
    name?: string;
    email?: string;
    age?: number;
    gender?: string;
  }>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),

  // Fixed Reducer & Structure: Preserves checked slot verification data (Points 5 & 9)
  bookingIntent: Annotation<{
    date?: string;
    start?: string;
    end?: string;
    purpose?: string;
  }>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),

  // Track availability outcomes & targets natively (Points 5 & 6)
  slotAvailable: Annotation<boolean | undefined>(),
  selectedAppointmentId: Annotation<string | undefined>(),
});

export type AppointmentAgentStateType = typeof AppointmentAgentState.State;