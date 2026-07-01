import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import type { DoctorDocument } from "../../lib/db/models/doctor.models";

export const DoctorEngineState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  doctorPhoneNumber: Annotation<string>(),
  doctor: Annotation<DoctorDocument>(),

  // Resolved Patient Context (Points 3 & 12)
  targetPatientId: Annotation<string | undefined>(),
  targetPatientName: Annotation<string | undefined>(),
  targetPatientPhone: Annotation<string | undefined>(),

  // Cleaner Separation of Intent vs Booking Data (Points 1, 10, & 12)
  pendingInstruction: Annotation<{
    action?: | "block_patient"
| "book_appointment"
| "update_appointment"
| "cancel_appointment"
| "override_rule"
| "block_schedule"
| "update_schedule";
    reason?: string;
    blockUntil?: string; // ISO String
  }>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),

AppointmentData: Annotation<{
    start: string; // ISO String
    end: string;   // ISO String
    purpose: string;
  }>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({ start: "", end: "", purpose: "" }),
  }),

  slotAvailable: Annotation<boolean | undefined>(),
  appointmentBooked: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),
  bookedAppointmentId: Annotation<string | undefined>(),
});

export type DoctorEngineStateType = typeof DoctorEngineState.State;