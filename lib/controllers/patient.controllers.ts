import { Patient, type IPatient, type PatientDocument } from "../db/models/patient.model";


export const getAllPatients = async () => {
    try {
        const patients = await Patient.find();
        return patients;
    } catch (error) {
        console.error("Error fetching patients:", error);
        throw error;
    }
};

export const getPatientById = async (patientId: string) => {
    try {
        if (!patientId) {
            throw new Error("Patient ID is required");
        }
        const patient = await Patient.findById(patientId);
        return patient;
    } catch (error) {
        console.error("Error fetching patient by ID:", error);
        throw error;
    }
};

export const createPatient = async (patientData:PatientDocument) => {
    try {
        if (!patientData.name || !patientData.phoneNumber) {
            throw new Error("Name and phone number are required");
        }
        const newPatient = new Patient(patientData);
        return await newPatient.save();
    } catch (error) {
        console.error("Error creating patient:", error);
        throw error;
    }
};

export const updatePatient = async (patientId: string, updateData: Partial<IPatient>) => {
    try {
        if (!patientId) {
            throw new Error("Patient ID is required");
        }
        const existingPatient = await Patient.findById(patientId);
        if (!existingPatient) {
            throw new Error("Patient not found");
        }
        const updatedPatient = await Patient.findByIdAndUpdate(patientId, updateData, { new: true });
        return updatedPatient;
    } catch (error) {
        console.error("Error updating patient:", error);
        throw error;
    }    
};
export const deletePatient = async (patientId: string) => {
    try {
        if (!patientId) {
            throw new Error("Patient ID is required");
        }
        if (!await Patient.exists({ _id: patientId })) {
            throw new Error("Patient not found");
        }   
        const deletedPatient = await Patient.findByIdAndDelete(patientId);
        if (!deletedPatient) {
            throw new Error("Patient not found");
        }
        return deletedPatient;
    }   catch (error) { 
        console.error("Error deleting patient:", error);
        throw error;
    }
};
// getPatientById,createPatient,updatePatient,deletePatient