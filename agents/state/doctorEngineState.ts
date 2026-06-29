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

  targetPatientId: Annotation<string | undefined>(),
  targetPatientPhone: Annotation<string | undefined>(),

  pendingInstruction: Annotation<{
    instructionType?: "block" | "force_schedule" | "override";
    blockUntil?: string; // ISO String
    forcedAppointmentTime?: string; // ISO String
  }>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
});

export type DoctorEngineStateType = typeof DoctorEngineState.State;
