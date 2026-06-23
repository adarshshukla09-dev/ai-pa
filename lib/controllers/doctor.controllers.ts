import { Doctor } from "../db/models/doctor.models";
import { connectDB } from "../db/mongo.config";

interface DoctorData {
    name: string;
    phoneNumber: string;
    googleProviderId: string;
    googleAccessToken: string;
    googleRefreshToken: string;
    whatsappAccessToken: string;
    whatsappPhoneNumberId: string;
    whatsappBusinessAccountId: string;
    workingHours: {
        dayOfWeek: number;
        startTime: string;
        endTime: string;
    }[];
    slotDurationInMinutes: number;
}
export const getAllDoctors = async () => {
    try {
        await connectDB(); // Ensure the database is connected before querying
        const doctors = await Doctor.find();
        return doctors;
    } catch (error) {
        console.error("❌ Error fetching doctors:", error);
        throw error;
    }
}
export const getDoctorById = async (doctorId: string) => {
    try {
        await connectDB(); // Ensure the database is connected before querying
        if (!doctorId) {
            throw new Error("Doctor ID is required to fetch doctor details.");
        }
        const doctor = await Doctor.findById(doctorId);
        return doctor;
    } catch (error) {
        console.error("❌ Error fetching doctor by ID:", error);
        throw error;
    }
}   
export const createDoctor = async (doctorData: DoctorData) => {
    try {
        if (!doctorData) {
            throw new Error("Doctor data is required for creating a new doctor.");
        }
        await connectDB();
        const newDoctor = new Doctor(doctorData);
        return await newDoctor.save();
    }catch (error) {
        console.error("❌ Error creating doctor:", error);
        throw error;
    }
}

export const updateDoctorData    = async (doctorId: string, updateData: Partial<DoctorData>) => {
    try {
        await connectDB();
        if (!doctorId) {
            throw new Error("Doctor ID is required for updating doctor data.");
        }
        const existingDoctor = await Doctor.findById(doctorId);
        if (!existingDoctor) {
            throw new Error("Doctor not found");
        }
        const updatedDoctor = await Doctor.findByIdAndUpdate(doctorId, updateData, { new: true });
        return updatedDoctor;
    } catch (error) {
        console.error("❌ Error updating doctor data:", error);
        throw error;
    }
}

export const deleteDoctor = async (doctorId: string) => {
    try {
        await connectDB();
        if (!doctorId) {
            throw new Error("Doctor ID is required for deleting a doctor.");
        }
        const deletedDoctor = await Doctor.findByIdAndDelete(doctorId);
        return deletedDoctor;
    } catch (error) {
        console.error("❌ Error deleting doctor:", error);
        throw error;
    }
}
