import { tool } from "ai";
import z from "zod";
import { Patient } from "../../lib/db/models/patient.model";
import { createPatient, updatePatient } from "../../lib/controllers/patient.controllers";

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
      description: "Find patient profiles by name or phone number in MongoDB.",
      inputSchema: z.object({
        searchString: z.string().describe("Name or phone number to search."),
      }),
      execute: async ({ searchString }) => {
        const cleanedQuery = searchString.replace(/^(mr|ms|mrs|dr)\.?\s+/i, "").trim();
        const patients = await Patient.find({
          $or: [
            { name: { $regex: cleanedQuery, $options: "i" } },
            { phoneNumber: cleanedQuery },
          ],
        }).limit(3).lean();

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
