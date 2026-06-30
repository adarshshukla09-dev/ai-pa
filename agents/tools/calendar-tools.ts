import { tool } from "ai";
import z from "zod";
import { google } from "googleapis";
import { Types } from "mongoose";
import { Doctor, type DoctorDocument } from "../../lib/db/models/doctor.models";
import { createAppointment } from "../../lib/controllers/appointment.controllers";
import { Appointment } from "../../lib/db/models/appointment.model";

const TZ_DEFAULT = "UTC";

// --- Schemas ---
const calendarEventSchema = z.object({
  summary: z.string().describe("Short appointment title."),
  patientId: z.string().describe("MongoDB Patient _id."),
  description: z.string().optional().describe("Appointment reason or symptoms summary."),
  start: z.object({ dateTime: z.string(), timeZone: z.string().optional().default(TZ_DEFAULT) }),
  end: z.object({ dateTime: z.string(), timeZone: z.string().optional().default(TZ_DEFAULT) }),
});

const appointmentIdSchema = z.object({
  appointmentId: z.string().describe("MongoDB Appointment _id."),
});

// --- Utility Helpers ---
const addMinutes = (date: Date, min: number) => new Date(date.getTime() + min * 60000);
const toTimeString = (date: Date) => date.toTimeString().slice(0, 5);

function getDayRange(date: Date) {
  const startOfDay = new Date(date).setHours(0, 0, 0, 0);
  const endOfDay = new Date(date).setHours(23, 59, 59, 999);
  return { startOfDay: new Date(startOfDay), endOfDay: new Date(endOfDay) };
}

function validateObjectId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new Error("Invalid ID format.");
  return new Types.ObjectId(id);
}

function normalizeAppointment(app: any) {
  return {
    id: app._id?.toString(),
    doctorId: app.doctorId?.toString(),
    patientId: app.patientId?.toString(),
    date: app.date,
    startTime: app.startTime,
    endTime: app.endTime,
    reason: app.reason,
    status: app.status,
    googleEventId: app.googleEventId,
    googleHangoutLink: app.googleHangoutLink,
  };
}

async function findMongoConflict(doctorId: Types.ObjectId, startDate: Date, endDate: Date, ignoreId?: string) {
  const { startOfDay, endOfDay } = getDayRange(startDate);
  const query: Record<string, any> = {
    doctorId,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $ne: "cancelled" },
    startTime: { $lt: toTimeString(endDate) },
    endTime: { $gt: toTimeString(startDate) },
  };
  if (ignoreId && Types.ObjectId.isValid(ignoreId)) {
    query._id = { $ne: new Types.ObjectId(ignoreId) };
  }
  return Appointment.findOne(query).lean();
}

// Fixed Wrapper to match the updated envelope blueprint (Point 11)
export const withErrorHandler = (fn: (input: any) => Promise<any>) => async (input: any) => {
  try {
    return await fn(input);
  } catch (err: any) {
    return { 
      success: false, 
      data: null, 
      error: err.message || "An unexpected error occurred processing the calendar tool." 
    };
  }
};

// --- Core Export ---
export function createCalendarTools(doctor: DoctorDocument) {
  const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ access_token: doctor.googleAccessToken, refresh_token: doctor.googleRefreshToken });

  oauth2Client.on("tokens", async ({ access_token }) => {
    if (!access_token) return;
    doctor.googleAccessToken = access_token;
    await Doctor.findByIdAndUpdate(doctor._id, { $set: { googleAccessToken: access_token } });
  });

  const calendarClient = google.calendar({ version: "v3", auth: oauth2Client });
  const calendarId = doctor.googleCalendarId;

  return Object.freeze({
    getPatientAppointments: tool({
      description: "Read the patient's appointment records from MongoDB.",
      inputSchema: z.object({ patientId: z.string(), includeCancelled: z.boolean().optional().default(false) }),
      execute: withErrorHandler(async ({ patientId, includeCancelled }) => {
        const pId = validateObjectId(patientId);
        const query: Record<string, any> = { patientId: pId, doctorId: doctor._id };
        if (!includeCancelled) query.status = { $ne: "cancelled" };

        const appointments = await Appointment.find(query).sort({ date: 1, startTime: 1 }).lean();
        return { 
          success: true, 
          data: {
            source: "mongodb", 
            count: appointments.length, 
            appointments: appointments.map(normalizeAppointment) 
          },
          error: null 
        };
      }),
    }),

    checkAvailability: tool({
      description: "Check MongoDB and Google Calendar before booking or rescheduling.",
      inputSchema: z.object({
        start: z.string(),
        duration: z.number().default(doctor.slotDurationInMinutes ?? 60),
        appointmentIdToIgnore: z.string().optional(),
      }),
      execute: withErrorHandler(async ({ start, duration, appointmentIdToIgnore }) => {
        const startDate = new Date(start);
        const endDate = addMinutes(startDate, duration);

        const ignoredApp = appointmentIdToIgnore && Types.ObjectId.isValid(appointmentIdToIgnore)
          ? await Appointment.findOne({ _id: new Types.ObjectId(appointmentIdToIgnore), doctorId: doctor._id }).lean()
          : null;

        const mongoConflict = await findMongoConflict(doctor._id, startDate, endDate, appointmentIdToIgnore);
        const calRes = await calendarClient.events.list({
          calendarId,
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          singleEvents: true,
        });

        const items = calRes.data.items ?? [];
        const calConflict = ignoredApp?.googleEventId ? items.find((i) => i.id && i.id !== ignoredApp.googleEventId) : items[0];

        if (mongoConflict || calConflict) {
          return {
            success: true, // Tool executed cleanly but slot is occupied
            data: {
              available: false,
              source: "mongodb+calendar",
              reason: "This slot is already booked.",
              mongoConflict: mongoConflict ? normalizeAppointment(mongoConflict) : undefined,
              calendarConflictId: calConflict?.id,
            },
            error: null
          };
        }
        
        return { 
          success: true, 
          data: { available: true, source: "mongodb+calendar" }, 
          error: null 
        };
      }),
    }),

    bookAppointment: tool({
      description: "Create an appointment in Google Calendar and MongoDB with rollback capability.",
      inputSchema: calendarEventSchema,
      execute: withErrorHandler(async ({ summary, description, start, end, patientId }) => {
        const pId = validateObjectId(patientId);
        const startDate = new Date(start.dateTime);
        const endDate = new Date(end.dateTime);

        const mongoConflict = await findMongoConflict(doctor._id, startDate, endDate);
        if (mongoConflict) {
          return { 
            success: false, 
            data: { appointment: normalizeAppointment(mongoConflict) }, 
            error: "Slot already booked in MongoDB." 
          };
        }

        let createdEventId: string | undefined;
        try {
          const calRes = await calendarClient.events.insert({
            calendarId,
            conferenceDataVersion: 1,
            requestBody: {
              summary,
              description,
              start,
              end,
              conferenceData: { createRequest: { requestId: `${Date.now()}-${patientId}` } },
            },
          });

          createdEventId = calRes.data.id ?? undefined;
          if (!createdEventId) throw new Error("Google Calendar failed to return an event id.");

          const appointment = await createAppointment({
            doctorId: doctor._id,
            patientId: pId,
            reason: description ?? summary,
            date: startDate,
            startTime: toTimeString(startDate),
            endTime: toTimeString(endDate),
            googleEventId: createdEventId,
            googleHangoutLink: calRes.data.hangoutLink ?? undefined,
          });

          return { 
            success: true, 
            data: { source: "mongodb+calendar", appointment: normalizeAppointment(appointment) }, 
            error: null 
          };
        } catch (err) {
          if (createdEventId) await calendarClient.events.delete({ calendarId, eventId: createdEventId }).catch(() => null);
          throw err;
        }
      }),
    }),

    updateAppointment: tool({
      description: "Reschedule an existing appointment across Calendar and MongoDB with rollback mechanism.",
      inputSchema: appointmentIdSchema.extend({
        summary: z.string().optional(),
        description: z.string().optional(),
        start: z.object({ dateTime: z.string(), timeZone: z.string().optional().default(TZ_DEFAULT) }),
        end: z.object({ dateTime: z.string(), timeZone: z.string().optional().default(TZ_DEFAULT) }),
      }),
      execute: withErrorHandler(async ({ appointmentId, summary, description, start, end }) => {
        const appId = validateObjectId(appointmentId);
        const appointment = await Appointment.findOne({ _id: appId, doctorId: doctor._id, status: { $ne: "cancelled" } });

        if (!appointment?.googleEventId) throw new Error("Appointment not found or missing Google Event link.");

        const startDate = new Date(start.dateTime);
        const endDate = new Date(end.dateTime);
        const mongoConflict = await findMongoConflict(doctor._id, startDate, endDate, appointmentId);
        if (mongoConflict) {
          return { 
            success: false, 
            data: { appointment: normalizeAppointment(mongoConflict) }, 
            error: "New slot is already booked." 
          };
        }

        const oldEvent = await calendarClient.events.get({ calendarId, eventId: appointment.googleEventId });
        await calendarClient.events.patch({
          calendarId,
          eventId: appointment.googleEventId,
          requestBody: { ...(summary && { summary }), ...(description && { description }), start, end },
        });

        try {
          appointment.date = startDate;
          appointment.startTime = toTimeString(startDate);
          appointment.endTime = toTimeString(endDate);
          if (description) appointment.reason = description;
          await appointment.save();
        } catch (mongoError) {
          await calendarClient.events.update({ calendarId, eventId: appointment.googleEventId, requestBody: oldEvent.data });
          throw mongoError;
        }

        return { 
          success: true, 
          data: { source: "mongodb+calendar", appointment: normalizeAppointment(appointment) }, 
          error: null 
        };
      }),
    }),

    cancelAppointment: tool({
      description: "Cancel an appointment in Google Calendar and then mark it cancelled in MongoDB.",
      inputSchema: appointmentIdSchema,
      execute: withErrorHandler(async ({ appointmentId }) => {
        const appId = validateObjectId(appointmentId);
        const appointment = await Appointment.findOne({ _id: appId, doctorId: doctor._id, status: { $ne: "cancelled" } });

        if (!appointment?.googleEventId) throw new Error("Active appointment not found.");

        await calendarClient.events.delete({ calendarId, eventId: appointment.googleEventId });
        appointment.status = "cancelled";
        await appointment.save();

        return { 
          success: true, 
          data: { 
            source: "mongodb+calendar", 
            appointment: normalizeAppointment(appointment), 
            message: "Cancelled successfully." 
          }, 
          error: null 
        };
      }),
    }),
  });
}