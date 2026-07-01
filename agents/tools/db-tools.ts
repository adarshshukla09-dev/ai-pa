import { tool } from "ai";
import z from "zod";
import { Patient } from "../../lib/db/models/patient.model";
import { createPatient, getPatientByPhoneNumber, updatePatient } from "../../lib/controllers/patient.controllers";

const patientSchema = z.object({
  name: z.string().describe("Patient full name."),
  phoneNumber: z.string().describe("Patient phone number."),
  email: z.string().email().optional().describe("Optional email address."),
  age: z.number().int().positive().optional().describe("Optional patient age."),
  gender: z.string().optional().describe("Optional gender descriptor."),
});

export const dbTools = () => {
  return Object.freeze({
   findPatientByNameOrPhone: tool({
  description: "Find patient profiles by name, phone number, or a general search string in MongoDB.",
  inputSchema: z.object({
    name: z.string().optional().nullable().describe("The isolated patient name if found (e.g. 'Anurag Shukla')."),
    phoneNumber: z.string().optional().nullable().describe("The isolated patient phone number string if found (e.g. '1111111111')."),
    searchString: z.string().optional().nullable().describe("A general fallback search query containing name or phone."),
  }),
  execute: async ({ name, phoneNumber, searchString }) => {
    const queryConditions: any[] = [];

    // If the LLM isolated a phone number, clean it and search
    if (phoneNumber) {
      const cleanPhone = phoneNumber.replace(/\D/g, ""); // Strip non-digits if necessary
      queryConditions.push({ phoneNumber: cleanPhone });
    }

    // If the LLM isolated a name, apply regex
    if (name) {
      const cleanedName = name.replace(/^(mr|ms|mrs|dr)\.?\s+/i, "").trim();
      queryConditions.push({ name: { $regex: cleanedName, $options: "i" } });
    }

    // Fallback if the LLM put everything into searchString
    if (searchString && !name && !phoneNumber) {
      const cleanedQuery = searchString.replace(/^(mr|ms|mrs|dr)\.?\s+/i, "").trim();
      queryConditions.push({ name: { $regex: cleanedQuery, $options: "i" } });
      queryConditions.push({ phoneNumber: cleanedQuery });
    }

    // If nothing was provided, return empty
    if (queryConditions.length === 0) {
      return { success: false, message: "No search criteria provided." };
    }

    const patients = await Patient.find({ $or: queryConditions }).limit(3).lean();

    if (patients.length === 0) {
      return { success: false, message: "No patients found." };
    }

    return {
      success: true,
      source: "mongodb",
      patients: patients.map((patient) => ({
        id: patient._id.toString(),
        name: patient.name,
        phoneNumber: patient.phoneNumber,
      })),
    };
  },
}),
    getPatientByPhoneNumber: tool({
      description: "Get a patient profile by phone number in MongoDB.",
      inputSchema: z.object({
        phoneNumber: z.string().describe("Patient phone number."),
      }),
      execute: async ({ phoneNumber }) => {
        const patient = await getPatientByPhoneNumber(phoneNumber);
        if (!patient) {
          return { success: false, message: "Patient not found." };
        }
        return {
          success: true,
          source: "mongodb",
          patient: {
            id: patient._id.toString(),
            name: patient.name,
            phoneNumber: patient.phoneNumber,
          },
        };
      },
    }),
    createPatient: tool({
      description: "Create a patient profile in MongoDB.",
      inputSchema: patientSchema,
      execute: async (args) => {
        const existing = await Patient.findOne({ phoneNumber: args.phoneNumber });
        if (existing) {
          return {
            success: true,
            source: "mongodb",
            patient: {
              id: existing._id.toString(),
              name: existing.name,
              phoneNumber: existing.phoneNumber,
            },
          };
        }

        const patient = await createPatient(args as any);
        return {
          success: true,
          source: "mongodb",
          patient: {
            id: patient._id.toString(),
            name: patient.name,
            phoneNumber: patient.phoneNumber,
          },
        };
      },
    }),

    updatePatient: tool({
      description: "Update a patient profile in MongoDB.",
      inputSchema: z.object({
        patientId: z.string().describe("MongoDB Patient _id."),
        updateData: patientSchema.partial().describe("Patient fields to update."),
      }),
      execute: async ({ patientId, updateData }) => {
        return await updatePatient(patientId, updateData);
      },
    }),
  });
};
