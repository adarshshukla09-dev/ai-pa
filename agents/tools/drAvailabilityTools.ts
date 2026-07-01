import { tool } from "ai";
import z from "zod";
import { DoctorAvailabilityInstruction } from "../../lib/db/models/drAvailabilityInstruction.models";

export const drAvailabilityTools = () => {
  return Object.freeze({
    // 1. Create a block (Now capturing raw instruction)
    blockDoctorAvailability: tool({
      description: "Block a doctor's availability for a specific time range due to leave, holidays, or clinic closures.",
      inputSchema: z.object({
        doctorPhoneNumber: z.string().describe("The doctor's phone number matching E.164 format."),
        type: z.enum(["leave", "holiday", "clinic_closed", "busy", "working_hours_override"]).describe("The type of availability block."),
        start: z.string().describe("The start date and time of the block (ISO 8601 format)."),
        end: z.string().describe("The end date and time of the block (ISO 8601 format)."),
        reason: z.string().describe("The explicit reason for the block."),
        rawInstruction: z.string().optional().describe("The raw text utterance provided by the doctor."),
      }),
      execute: async ({ doctorPhoneNumber, type, start, end, reason, rawInstruction }) => {
        const instruction = await DoctorAvailabilityInstruction.create({
          doctorPhoneNumber,
          type,
          start: new Date(start),
          end: new Date(end),
          reason,
          rawInstruction,
          isActive: true,
        });
        return instruction;
      },
    }),

    // 2. Update a block
    updateDoctorAvailability: tool({
      description: "Update an existing doctor availability instruction block.",
      inputSchema: z.object({
        instructionId: z.string().describe("The unique ID of the instruction to update."),
        type: z.enum(["leave", "holiday", "clinic_closed", "busy", "working_hours_override"]).optional().describe("The updated type of instruction."),
        start: z.string().optional().nullable().describe("The updated start date and time (ISO 8601 format)."),
        end: z.string().optional().nullable().describe("The updated end date and time (ISO 8601 format)."),
        reason: z.string().optional().describe("The updated reason for the block."),
        isActive: z.boolean().optional().describe("Toggle whether this instruction is currently active."),
      }),
      execute: async ({ instructionId, ...updateFields }) => {
        // Clean up date strings into Date objects if provided
        const updatePayload: Record<string, any> = { ...updateFields };
        if (updateFields.start) updatePayload.start = new Date(updateFields.start);
        if (updateFields.end) updatePayload.end = new Date(updateFields.end);

        const updatedInstruction = await DoctorAvailabilityInstruction.findByIdAndUpdate(
          instructionId,
          updatePayload,
          { new: true }
        );

        if (!updatedInstruction) {
          throw new Error("Availability instruction not found.");
        }
        return updatedInstruction;
      },
    }),

    // 3. Delete a block
    deleteDoctorAvailability: tool({
      description: "Permanently delete a doctor's availability instruction override.",
      inputSchema: z.object({
        instructionId: z.string().describe("The ID of the instruction to delete."),
      }),
      execute: async ({ instructionId }) => {
        const instruction = await DoctorAvailabilityInstruction.findByIdAndDelete(instructionId);
        return instruction || { success: false, message: "Instruction not found." };
      },
    }),

    // 4. Get a single block
    getDoctorAvailability: tool({
      description: "Get details of a specific availability instruction by its ID.",
      inputSchema: z.object({
        instructionId: z.string().describe("The ID of the instruction to retrieve."),
      }),
      execute: async ({ instructionId }) => {
        return await DoctorAvailabilityInstruction.findById(instructionId);
      },
    }),

    // 5. NEW: List/Query blocks for a doctor
    listDoctorAvailability: tool({
      description: "Retrieve all availability blocks/instructions for a specific doctor, optionally filtered by a date range.",
      inputSchema: z.object({
        doctorPhoneNumber: z.string().describe("The doctor's phone number."),
        startDate: z.string().optional().describe("ISO string to filter instructions starting after this date."),
        endDate: z.string().optional().describe("ISO string to filter instructions ending before this date."),
      }),
      execute: async ({ doctorPhoneNumber, startDate, endDate }) => {
        const query: Record<string, any> = { doctorPhoneNumber, isActive: true };
        
        if (startDate || endDate) {
          query.$or = [];
          if (startDate) query.$or.push({ end: { $gte: new Date(startDate) } });
          if (endDate) query.$or.push({ start: { $lte: new Date(endDate) } });
        }

        return await DoctorAvailabilityInstruction.find(query).sort({ start: 1 });
      },
    }),
  });
};