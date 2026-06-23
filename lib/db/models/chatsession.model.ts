import { Schema, model } from "mongoose";

const chatSessionSchema: Schema = new Schema(
  {
    phoneNumber: { type: String, required: true },

    currentStep: {
      type: String,
      enum: [
        "idle",
        "awaiting_name",
        "selecting_doctor",
        "selecting_date",
        "selecting_time",
        "confirming",
      ],
      default: "idle",
    },
    tempData: {
      doctorId: { type: Schema.Types.ObjectId },
      patientName: { type: String },
      selectedDate: { type: String }, // "YYYY-MM-DD"
      selectedTime: { type: String }, // "HH:MM"
      appointmentIdToCancel: { type: Schema.Types.ObjectId }, // For handling Delete requests
    },
    // Session timeout tracking (e.g., expire session after 15 mins of inactivity)
    updatedAt: { type: Date, default: Date.now, expires: 900 },
  },
  { timestamps: true },
);

export const ChatSession = model("ChatSession", chatSessionSchema);
