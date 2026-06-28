import { Document, Schema, model,Types } from "mongoose";

interface IAppointment  {
   doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  date: Date;
  startTime: string;
  reason:string
  endTime: string;
  googleEventId?: string; // Optional for Update (U) and Delete (D) operations
  googleHangoutLink?: string; // Optional for video consultations (if generated)
  status?: "pending" | "confirmed" | "cancelled" | "completed"; // Optional, defaults to "pending"
}

const appointmentSchema: Schema = new Schema({
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    reason : { type: String, required: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    googleEventId: { type: String }, // Kept for Update (U) and Delete (D) operations
  googleHangoutLink: { type: String }, // For video consultations (if generated)
  
  status: { 
    type: String, 
    enum: ["pending", "confirmed", "cancelled", "completed"], 
    default: "pending" 
  },
}, { timestamps: true });
appointmentSchema.index({ doctorId: 1, startTime: 1 }, { unique: true });
export type AppointmentDocument = IAppointment
export const Appointment = model<IAppointment>("Appointment", appointmentSchema);