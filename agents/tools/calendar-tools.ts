import { calendar } from "../../config/calendar.config";

// Define an interface for the event data structure
interface CalendarEventData {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
}

/**
 * 1. CREATE - Add a new event to the primary calendar
 */
export async function createEvent(eventData: CalendarEventData) {
  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.start.dateTime,
          timeZone: eventData.start.timeZone || 'UTC',
        },
        end: {
          dateTime: eventData.end.dateTime,
          timeZone: eventData.end.timeZone || 'UTC',
        },
      },
    });
    console.log(`✅ Event created successfully: ${response.data.htmlLink}`);
    return response.data;
  } catch (error) {
    console.error('❌ Error creating event:', error);
    throw error;
  }
}

/**
 * 2. READ - List events or fetch a specific event
 */
export async function listEvents(maxResults = 10) {
  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return response.data.items || [];
  } catch (error) {
    console.error('❌ Error listing events:', error);
    throw error;
  }
}

export async function getEventById(eventId: string) {
  try {
    const response = await calendar.events.get({
      calendarId: 'primary',
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
export async function updateEvent(eventId: string, updatedData: Partial<CalendarEventData>) {
  try {
    // googleapis package requires requestBody for updates
    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: {
        summary: updatedData.summary,
        description: updatedData.description,
        ...(updatedData.start && { start: { dateTime: updatedData.start.dateTime, timeZone: updatedData.start.timeZone || 'UTC' } }),
        ...(updatedData.end && { end: { dateTime: updatedData.end.dateTime, timeZone: updatedData.end.timeZone || 'UTC' } }),
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
      calendarId: 'primary',
      eventId: eventId,
    });
    console.log(`✅ Event ${eventId} deleted successfully.`);
    return { success: true, message: `Event ${eventId} deleted successfully.` };
  } catch (error) {
    console.error(`❌ Error deleting event ${eventId}:`, error);
    throw error;
  }
}

export async function createNewCalendar(summary: string, timeZone = 'UTC'): Promise<string> {
  try {
    const response = await calendar.calendars.insert({
      requestBody: {
        summary: summary,
        timeZone: timeZone,
      },
    });

    const calendarId = response.data.id;
    
    if (!calendarId) {
      throw new Error('Calendar created, but no ID was returned by Google.');
    }

    console.log(`✅ New calendar "${summary}" created successfully.`);
    console.log(`🆔 Calendar ID: ${calendarId}`);
    
    return calendarId;
  } catch (error) {
    console.error('❌ Error creating new calendar:', error);
    throw error;
  }
}