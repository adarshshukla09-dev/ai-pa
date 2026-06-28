import { Schema, model, Document } from "mongoose";

export interface IDrInstruction extends Document {
  doctorPhoneNumber: string;
  patientPhoneNumber: string;
  instructionType: 'block' | 'force_schedule' | 'override';
  metaData: {
    blockUntil?: Date;
    forcedAppointmentTime?: Date;
  };
  rawInstruction: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const drInstructionSchema = new Schema<IDrInstruction>(
  {
    doctorPhoneNumber: { 
      type: String, 
      required: true,
      trim: true 
    },
    patientPhoneNumber: { 
      type: String, 
      required: true,
      trim: true 
    },
    instructionType: { 
      type: String, 
      required: true, 
      enum: ['block', 'force_schedule', 'override'] 
    },
    metaData: {
      blockUntil: { type: Date },
      forcedAppointmentTime: { type: Date }
    },
    rawInstruction: { 
      type: String, 
      required: true 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    }
  },
  { 
    timestamps: true 
  }
);

// Compound index for lightning-fast restriction checks inside your verifyPatientNode middleware
drInstructionSchema.index({ doctorPhoneNumber: 1, patientPhoneNumber: 1, isActive: 1 });

export const DrInstruction = model<IDrInstruction>("DrInstruction", drInstructionSchema);