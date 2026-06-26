import { Schema, model,Document } from "mongoose";
export interface IDoctor extends Document {
  name: string;
  phoneNumber: string;
  availableNow: boolean;
  
  // Google Calendar Fields
  googleCalendarId: string; // 👈 CRITICAL: Added this to store the Calendar ID from your first step
  googleProviderId: string;
  googleAccessToken: string;
  googleRefreshToken: string;
  
  // LLM Configuration
  llmProvider: 'openai' | 'groq' | 'gemini';
 llmModel: string;
  apiKey: string;
  // WhatsApp Credentials
  whatsappAccessToken: string;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccountId: string;
  
  // Schedule Options
  workingHours: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }[];
  slotDurationInMinutes: number;
}
export type DoctorDocument = IDoctor & Document;
const doctorSchema: Schema = new Schema<IDoctor>(
  {
    name: { type: String, required: true },
    phoneNumber: { type: String, required: true, unique: true }, 
    availableNow: { type: Boolean, default: true },

    // Google Calendar Fields
    googleCalendarId: { type: String, required: true }, // Store the individual calendar ID here
    googleProviderId: { type: String, required: true, unique: true },
    googleAccessToken: { type: String, required: true },
    googleRefreshToken: { type: String, required: true },
    
    // LLM Setup
    llmProvider: { type: String, required: true, enum: ['openai', 'groq', 'gemini'] }, 
    llmModel: { type: String, required: true }, 
    apiKey: { type: String, required: true }, 
    whatsappAccessToken: { type: String, required: true }, 
    whatsappPhoneNumberId: { type: String, required: true }, 
    whatsappBusinessAccountId: { type: String, required: true }, 
    
    workingHours: [
      {
        dayOfWeek: { type: Number, required: true }, // 0 for Sunday, 1 for Monday, etc.
        startTime: { type: String, required: true }, // e.g., "09:00"
        endTime: { type: String, required: true },   // e.g., "17:00"
      },
    ],
    slotDurationInMinutes: { type: Number, required: true, default: 60 },
  },
  { timestamps: true },
);

export const Doctor = model<IDoctor>("Doctor", doctorSchema);
