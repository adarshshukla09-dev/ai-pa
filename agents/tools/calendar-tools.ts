import { tool } from "ai";
import { calendar } from "../../lib/calendar.config";
import z from "zod";

// Define an interface for the event data structure
interface CalendarEventData {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
}
const calendarEventSchema = z.object({
  summary: z.string(),
  description: z.string().optional(),
  start: z.object({
    dateTime: z.string(),
    timeZone: z.string().optional(),
  }),
  end: z.object({
    dateTime: z.string(),
    timeZone: z.string().optional(),
  }),
});
/**
 * 1. CREATE - Add a new event to the primary calendar
 */
export async function createEvent(eventData: CalendarEventData) {
  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.start.dateTime,
          timeZone: eventData.start.timeZone || "UTC",
        },
        end: {
          dateTime: eventData.end.dateTime,
          timeZone: eventData.end.timeZone || "UTC",
        },
      },
    });
    console.log(`✅ Event created successfully: ${response.data.htmlLink}`);
    return response.data;
  } catch (error) {
    console.error("❌ Error creating event:", error);
    throw error;
  }
}

/**
 * 2. READ - List events or fetch a specific event
 */
export async function listEvents(maxResults = 10) {
  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });
    return response.data.items || [];
  } catch (error) {
    console.error("❌ Error listing events:", error);
    throw error;
  }
}

export async function getEventById(eventId: string) {
  try {
    const response = await calendar.events.get({
      calendarId: "primary",
      eventId: eventId,
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Error fetching event ${eventId}:`, error);
    throw error;
  }
}

/**
 * 3. UPDATE - Modify an existing event
 */
export async function updateEvent(
  eventId: string,
  updatedData: Partial<CalendarEventData>,
) {
  try {
    // googleapis package requires requestBody for updates
    const response = await calendar.events.patch({
      calendarId: "primary",
      eventId: eventId,
      requestBody: {
        summary: updatedData.summary,
        description: updatedData.description,
        ...(updatedData.start && {
          start: {
            dateTime: updatedData.start.dateTime,
            timeZone: updatedData.start.timeZone || "UTC",
          },
        }),
        ...(updatedData.end && {
          end: {
            dateTime: updatedData.end.dateTime,
            timeZone: updatedData.end.timeZone || "UTC",
          },
        }),
      },
    });
    console.log(`✅ Event ${eventId} updated successfully.`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error updating event ${eventId}:`, error);
    throw error;
  }
}

/**
 * 4. DELETE - Remove an event
 */
export async function deleteEvent(eventId: string) {
  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId: eventId,
    });
    console.log(`✅ Event ${eventId} deleted successfully.`);
    return { success: true, message: `Event ${eventId} deleted successfully.` };
  } catch (error) {
    console.error(`❌ Error deleting event ${eventId}:`, error);
    throw error;
  }
}

export async function createNewCalendar(
  summary: string,
  timeZone = "UTC",
): Promise<string> {
  try {
    const response = await calendar.calendars.insert({
      requestBody: {
        summary: summary,
        timeZone: timeZone,
      },
    });

    const calendarId = response.data.id;

    if (!calendarId) {
      throw new Error("Calendar created, but no ID was returned by Google.");
    }

    console.log(`✅ New calendar "${summary}" created successfully.`);
    console.log(`🆔 Calendar ID: ${calendarId}`);

    return calendarId;
  } catch (error) {
    console.error("❌ Error creating new calendar:", error);
    throw error;
  }
}

export const calendarTools = {
  createCalendarEvent: tool({
    description: "Create a new calendar event.",
    inputSchema: calendarEventSchema,
    execute: async (args) => {
      return createEvent(args);
    },
  }),

  listCalendarEvents: tool({
    description: "List upcoming calendar events.",
    inputSchema: z.object({
      maxResults: z.number().optional().default(10),
    }),
    execute: async (args) => {
      return listEvents(args.maxResults);
    },
  }),
  getCalendarEventById: tool({
    description: "Get details of a specific calendar event by its ID.",
    inputSchema: z.object({
      eventId: z.string(),
    }),
    execute: async (args) => {
      return getEventById(args.eventId);
    },
  }),
  updateCalendarEvent: tool({
    description: "Update an existing calendar event.",
    inputSchema: calendarEventSchema.partial().extend({
      eventId: z.string(),
    }),
    execute: async (args) => {
      const { eventId, ...updatedData } = args;

      return updateEvent(eventId, updatedData);
    },
  }),
  deleteCalendarEvent: tool({
    description: "Delete a calendar event.",
    inputSchema: z.object({
      eventId: z.string(),
    }),
    execute: async (args) => {
      return deleteEvent(args.eventId);
    },
  }),
  createCalendar: tool({
    description: "Create a new calendar.",
    inputSchema: z.object({
      summary: z.string(),
      timeZone: z.string().optional().default("UTC"),
    }),
    execute: async (args) => {
      return createNewCalendar(args.summary, args.timeZone);
    },
  }),
};

