import { Document, Schema, model, Types } from "mongoose";

interface IAppointment extends Document {
  doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  date: Date;
  startTime: string;
  endTime: string;
  reason: string;
  googleEventId?: string;
  googleHangoutLink?: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
}

const appointmentSchema = new Schema<IAppointment>(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    reason: { type: String, required: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    googleEventId: { type: String },
    googleHangoutLink: { type: String },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
  },
  { timestamps: true },
);

appointmentSchema.index({ doctorId: 1, date: 1, startTime: 1 });
appointmentSchema.index({ doctorId: 1, patientId: 1, status: 1, date: 1 });
appointmentSchema.index({ googleEventId: 1 }, { sparse: true });

export type AppointmentDocument = IAppointment;
export const Appointment = model<IAppointment>("Appointment", appointmentSchema);
