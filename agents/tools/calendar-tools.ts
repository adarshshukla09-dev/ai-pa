import { tool } from "ai";
import z from "zod";
import { google } from "googleapis";
import { Doctor, type DoctorDocument } from "../../lib/db/models/doctor.models";
import { createAppointment } from "../../lib/controllers/appointment.controllers";
import type { AppointmentAgentStateType } from "../state/state";
import { Appointment } from "../../lib/db/models/appointment.model";

// --- Vercel AI SDK Zod Input Schemas ---
const calendarEventSchema = z.object({
  summary: z
    .string()
    .describe("The purpose or title of the medical appointment."),
  description: z
    .string()
    .optional()
    .describe("Optional patient details or symptoms."),
  start: z.object({
    dateTime: z.string().describe("ISO 8601 string format start time"),
    timeZone: z.string().optional().default("UTC"),
  }),
  end: z.object({
    dateTime: z.string().describe("ISO 8601 string format end time"),
    timeZone: z.string().optional().default("UTC"),
  }),
});

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}
export function createCalendarTools(state: AppointmentAgentStateType) {
  const doctor:DoctorDocument =state.doctor
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    access_token: doctor.googleAccessToken,
    refresh_token: doctor.googleRefreshToken,
  });
  oauth2Client.on("tokens", async (tokens) => {
    if (!tokens.access_token) return;
    console.log(`🔄 Refreshing token for ${doctor.name}`);
    doctor.googleAccessToken = tokens.access_token;
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: doctor.googleRefreshToken,
    });
    await Doctor.findByIdAndUpdate(doctor._id, {
      $set: { googleAccessToken: tokens.access_token },
    });
  });
   const calendarClient = google.calendar({ version: "v3", auth: oauth2Client });
  const googleCalendarId = doctor.googleCalendarId;
  return {
  bookAppointment: tool({
      description: "Create a Google Calendar appointment and also save it in appointment of mongodb collection named appointment.",
      inputSchema: calendarEventSchema,
      execute: async ({ summary, description, start, end }) => {
        let calendarEventId: string | null | undefined = null;

        try {
          // 1. Insert into Google Calendar
          const response = await calendarClient.events.insert({
            calendarId: googleCalendarId,
            requestBody: {
              summary,
              description,
              start: { dateTime: start.dateTime, timeZone: start.timeZone },
              end: { dateTime: end.dateTime, timeZone: end.timeZone },
            },
          });

          // Capture event ID immediately for the rollback mechanism
          calendarEventId = response.data.id;

          // 2. Parse date strings out of start.dateTime 
          const appointmentDate = new Date(start.dateTime);
          const startTimeStr = appointmentDate.toTimeString().slice(0, 5);

          // 3. Persist back to MongoDB
          const appointment = await createAppointment({
            doctorId: state.doctor._id,
            patientId: state.patientData!._id,
            date: appointmentDate,
            startTime: startTimeStr,
          });

          return {
            success: true,
            calendarEvent: response.data,
            dbAppointment: appointment,
          };
        } catch (err: any) {
          console.error("❌ Booking transaction failed:", err.message || err);

          // 4. Automated Rollback Transaction if Google Event was successfully tracked
          if (calendarEventId) {
            try {
              await calendarClient.events.delete({
                calendarId: googleCalendarId,
                eventId: calendarEventId,
              });
              console.log(`🔄 Successfully rolled back calendar event slot: ${calendarEventId}`);
            } catch (deleteErr) {
              console.error("⚠️ Fail-safe warning: Failed to remove dangling Google Calendar event:", deleteErr);
            }
          }

          return {
            success: false,
            error: err.message,
          };
        }
      }, // 👈 Properly closing execute block
    }),
    checkAvailability: tool({
      description: "Checks whether a requested appointment slot is available across both MongoDB and Google Calendar, and returns alternative slots if busy.",
      inputSchema: z.object({
        start: z.string().describe("ISO string format start time"),
        duration: z.number().default(60).describe("Duration of slot in minutes"),
      }),
      execute: async ({ start, duration }) => {
        try {
          const startDate = new Date(start);
          const endDate = addMinutes(startDate, duration);

          const startTimeStr = startDate.toTimeString().slice(0, 5); // "HH:MM"
          const endTimeStr = endDate.toTimeString().slice(0, 5);     // "HH:MM"

          // 1. Setup Day Boundaries for MongoDB query
          const startOfDay = new Date(startDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(startDate);
          endOfDay.setHours(23, 59, 59, 999);

          // 2. Query MongoDB for overlapping active appointments
          const mongoConflict = await Appointment.findOne({
            doctorId: state.doctor._id,
            date: { $gte: startOfDay, $lte: endOfDay },
            status: { $ne: "cancelled" },
            startTime: { $lt: endTimeStr },
            endTime: { $gt: startTimeStr },
          });

          // 3. Query Google Calendar for overlapping events
          const calendarResponse = await calendarClient.events.list({
            calendarId: googleCalendarId,
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
            singleEvents: true,
          });
          const googleEvents = calendarResponse.data.items ?? [];

          // If either source registers an event block, the slot is unavailable
          if (mongoConflict || googleEvents.length > 0) {
            console.log("⚠️ Conflict detected. Checking alternative slots...");
            
            const alternatives: string[] = [];
            let candidateStart = endDate;

            // 4. Generate 3 rolling alternative slots checking both sources sequentially
            while (alternatives.length < 3) {
              const candidateEnd = addMinutes(candidateStart, duration);
              const cStartStr = candidateStart.toTimeString().slice(0, 5);
              const cEndStr = candidateEnd.toTimeString().slice(0, 5);

              const cStartOfDay = new Date(candidateStart);
              cStartOfDay.setHours(0, 0, 0, 0);
              const cEndOfDay = new Date(candidateStart);
              cEndOfDay.setHours(23, 59, 59, 999);

              // Check DB conflict for alternative candidate
              const dbAltConflict = await Appointment.findOne({
                doctorId: state.doctor._id,
                date: { $gte: cStartOfDay, $lte: cEndOfDay },
                status: { $ne: "cancelled" },
                startTime: { $lt: cEndStr },
                endTime: { $gt: cStartStr },
              });

              if (!dbAltConflict) {
                // Check Google Calendar conflict for alternative candidate
                const calAltRes = await calendarClient.events.list({
                  calendarId: googleCalendarId,
                  timeMin: candidateStart.toISOString(),
                  timeMax: candidateEnd.toISOString(),
                  singleEvents: true,
                });

                if ((calAltRes.data.items ?? []).length === 0) {
                  alternatives.push(candidateStart.toISOString());
                }
              }

              // Move window forward
              candidateStart = addMinutes(candidateStart, duration);
            }

            return { 
              available: false, 
              reason: mongoConflict ? "Booked in local database" : "Booked on Google Calendar",
              alternatives 
            };
          }

          // If completely clear on both ends
          return { available: true, alternatives: [] };
        } catch (err: any) {
  console.error("❌ checkAvailability failed");
  console.error(err);
  console.error(err?.stack);

  return {
    available: false,
    error: String(err),
    alternatives: [],
  };
}
      },
    }),
    getCalendarEventById: tool({
      description: "Fetch a calendar event by ID.",
      inputSchema: z.object({ eventId: z.string() }),
      execute: async ({ eventId }) => {
        try {
          const response = await calendarClient.events.get({
            calendarId: googleCalendarId,
            eventId,
          });
          return response.data;
        } catch (err: any) {
          console.error(err);
          return { success: false, error: err.message };
        }
      },
    }),
    updateCalendarEvent: tool({
      description: "Update an existing calendar event.",
      inputSchema: calendarEventSchema
        .partial()
        .extend({ eventId: z.string() }),
      execute: async ({ eventId, ...updatedData }) => {
        try {
          const response = await calendarClient.events.patch({
            calendarId: googleCalendarId,
            eventId,
            requestBody: {
              summary: updatedData.summary,
              description: updatedData.description,
              ...(updatedData.start && { start: updatedData.start }),
              ...(updatedData.end && { end: updatedData.end }),
            },
          });
          return response.data;
        } catch (err: any) {
          console.error(err);
          return { success: false, error: err.message };
        }
      },
    }),
    deleteCalendarEvent: tool({
      description:
        "Cancel or remove a calendar appointment using its event ID.",
      inputSchema: z.object({ eventId: z.string() }),
      execute: async ({ eventId }) => {
        try {
          await calendarClient.events.delete({
            calendarId: googleCalendarId,
            eventId,
          });
          return {
            success: true,
            message: `Appointment ${eventId} cancelled successfully.`,
          };
        } catch (err: any) {
          console.error(
            `❌ Error deleting calendar event (${eventId}):`,
            err.message || err,
          );
          return {
            success: false,
            error: "Failed to cancel the appointment slot.",
            details: err.message,
          };
        }
      },
    }),
  };
}
