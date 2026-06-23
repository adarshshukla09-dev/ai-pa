import {Schema, model, Document} from 'mongoose';

export interface IPatient extends Document {
    name: string;
    phoneNumber: string;
    email?: string;
    age?: number
    gender?: string
}

const patientSchema: Schema = new Schema<IPatient>({

    name: { type: String, required: true },
    phoneNumber: { type: String, required: true, unique: true },
    email: { type: String, unique: true },
    age: { type: Number },
    gender: { type: String },

}, { timestamps: true });

export type PatientDocument = IPatient & Document;
export const Patient = model("Patient", patientSchema);