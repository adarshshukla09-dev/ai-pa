import { Schema, model, Document } from "mongoose";

export interface IDoctorAvailabilityInstruction extends Document {
  doctorPhoneNumber: string;

  type:
    | "leave"
    | "holiday"
    | "clinic_closed"
    | "busy"
    | "working_hours_override";

  start: Date;
  end: Date;

  reason: string;

  rawInstruction: string;

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const doctorAvailabilityInstructionSchema = new Schema<IDoctorAvailabilityInstruction>({
  doctorPhoneNumber:{type: String, required: true, trim: true},
  type:{
    type: String,
    required: true,
    enum: [
      "leave",
      "holiday",
      "clinic_closed",
      "busy",
      "working_hours_override",
    ],
  },
  start:{type: Date, required: true},
  end:{type: Date, required: true},
  reason:{type: String, required: true},
  rawInstruction:{type: String, required: true},
  isActive:{type: Boolean, default: true},
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})
export type DoctorAvailabilityInstructionDocument = IDoctorAvailabilityInstruction;
export const DoctorAvailabilityInstruction = model<IDoctorAvailabilityInstruction>("DoctorAvailabilityInstruction", doctorAvailabilityInstructionSchema);
