import { tool } from "ai";
import z from "zod";
import mongoose from "mongoose";
import { 
  getAllPatients, 
  getPatientById, 
  createPatient, 
  updatePatient, 
  deletePatient 
} from "../../lib/controllers/patient.controllers";
import { 
  createAppointment, 
  getAppointmentById, 
  getAppointmentsByDoctor, 
  getAppointmentsByPatient, 
  updateAppointmentStatus, 
  confirmAppointment, 
  cancelAppointment, 
  completeAppointment, 
  getBookedAppointmentsForDoctor 
} from "../../lib/controllers/appointment.controllers";
import { Appointment } from "../../lib/db/models/appointment.model";
import { Patient } from "../../lib/db/models/patient.model";
import type { AppointmentAgentStateType } from "../state/state";

// Shared Schemas
const patientSchema = z.object({
  name: z.string().describe("The full name of the patient"),
  phoneNumber: z.string().describe("The phone number of the patient"),
  email: z.string().optional().describe("Optional email address"),
  dateOfBirth: z.string().optional().describe("ISO format date of birth string"),
  gender: z.string().optional().describe("Gender of the patient"),
});

const appointmentSchema = z.object({
  doctorId: z.string().describe("The database ID of the doctor"),
  patientId: z.string().describe("The database ID of the patient"),
  date: z.string().describe("ISO string representation of the appointment date"),
  startTime: z.string().describe("Start time format (e.g., 'HH:MM')"),
  endTime: z.string().describe("End time format (e.g., 'HH:MM')"),
});

export const dbTools =(state: AppointmentAgentStateType) => {
 return{
  createPatient: tool({
  inputSchema: patientSchema,
  execute: async (args) => {
    await createPatient(args as any);

    return {
      success: true,
    };
  },
}),
  updatePatient: tool({
    description: "Modify an existing patient's details using their ID.",
    inputSchema: z.object({
      patientId: z.string().describe("The patient ID to update"),
      updateData: patientSchema.partial().describe("The patient fields to update"),
    }),
    execute: async ({ patientId, updateData }) => {
      return await updatePatient(patientId, updateData);
    },
  }),



  /* ==========================================================================
     APPOINTMENT TOOLS
     ========================================================================== */

  getAppointmentById: tool({
    description: "Get detailed status and schedule info of a specific appointment by ID.",
    inputSchema: z.object({
      appointmentId: z.string().describe("The unique appointment ID"),
    }),
    execute: async ({ appointmentId }) => {
      return await getAppointmentById(appointmentId);
    },
  }),

  getAppointmentsByDoctor: tool({
    description: "List all scheduled appointments assigned to a specific doctor.",
    inputSchema: z.object({
      doctorId: z.string().describe("The doctor's unique ID"),
    }),
    execute: async ({ doctorId }) => {
      return await getAppointmentsByDoctor(doctorId);
    },
  }),

  getAppointmentsByPatient: tool({
    description: "List all historical or upcoming appointments belonging to a patient.",
    inputSchema: z.object({
      patientId: z.string().describe("The patient's unique ID"),
    }),
    execute: async ({ patientId }) => {
      return await getAppointmentsByPatient(patientId);
    },
  }),

  updateAppointmentStatus: tool({
    description: "Change the tracking state of an appointment directly.",
    inputSchema: z.object({
      appointmentId: z.string(),
      status: z.enum(["pending", "confirmed", "cancelled", "completed"]),
    }),
    execute: async ({ appointmentId, status }) => {
      return await updateAppointmentStatus(appointmentId, status);
    },
  }),

  confirmAppointment: tool({
    description: "Quickly mark an existing appointment as confirmed.",
    inputSchema: z.object({
      appointmentId: z.string(),
    }),
    execute: async ({ appointmentId }) => {
      return await confirmAppointment(appointmentId);
    },
  }),

  cancelAppointment: tool({
    description: "Quickly cancel an existing appointment schedule.",
    inputSchema: z.object({
      appointmentId: z.string(),
    }),
    execute: async ({ appointmentId }) => {
      return await cancelAppointment(appointmentId);
    },
  }),

  completeAppointment: tool({
    description: "Close out an appointment and mark it fulfilled or completed.",
    inputSchema: z.object({
      appointmentId: z.string(),
    }),
    execute: async ({ appointmentId }) => {
      return await completeAppointment(appointmentId);
    },
  }),

  getBookedAppointmentsForDoctor: tool({
    description: "Look up all active, non-cancelled appointment blocks for a specific doctor on a chosen day.",
    inputSchema: z.object({
      doctorId: z.string(),
      date: z.string().describe("The date query filter as an ISO format string"),
    }),
    execute: async ({ doctorId, date }) => {
      return await getBookedAppointmentsForDoctor(doctorId, new Date(date));
    },
  }),


  cancelAndOptimizeSlot: tool({
    description: "Use this tool when a patient explicitly cancels an appointment. It opens up the slot and returns candidates who can pull their appointments forward.",
    inputSchema: z.object({
      appointmentId: z.string().describe("The ID of the appointment being cancelled"),
      doctorId: z.string().describe("The ID of the operating doctor"),
    }),
    execute: async ({ appointmentId, doctorId }) => {
      // 1. Cancel the current slot
      const cancelledAppt = await Appointment.findByIdAndUpdate(
        appointmentId, 
        { status: "cancelled" }, 
        { new: true }
      );

      if (!cancelledAppt) return { error: "Appointment not found." };

     
      const startOfDay = new Date(cancelledAppt.date);
      startOfDay.setHours(0,0,0,0);
      const endOfDay = new Date(cancelledAppt.date);
      endOfDay.setHours(23,59,59,999);

      const targetCandidates = await Appointment.find({
        doctorId,
        date: { $gte: startOfDay, $lte: endOfDay },
        startTime: { $gt: cancelledAppt.startTime }, // Scheduled LATER than the empty spot
        status: "confirmed"
      }).sort({ startTime: 1 }); // Get the immediate next patients

      return {
        status: "success",
        freedSlot: {
          date: cancelledAppt.date,
          startTime: cancelledAppt.startTime,
          endTime: cancelledAppt.endTime
        },
        candidatesToBumpForward: targetCandidates.map(c => ({
          appointmentId: c._id,
          patientId: c.patientId,
          currentStartTime: c.startTime
        }))
      };
    },
  }),
}};