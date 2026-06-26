// import { google } from 'googleapis';
// import dotenv from 'dotenv';

// dotenv.config();

// const oauth2Client = new google.auth.OAuth2(
//   process.env.GOOGLE_CLIENT_ID,
//   process.env.GOOGLE_CLIENT_SECRET,
//   process.env.GOOGLE_REDIRECT_URI
// );

// // Set the persistent credentials for background/asynchronous orchestration
// oauth2Client.setCredentials({
//   refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
// });
// console.log('✅ Google Calendar credentials set successfully.');
// console.log( process.env.GOOGLE_REFRESH_TOKEN);
// export const calendar = google.calendar({
//   version: 'v3',
//   auth: oauth2Client,
// });

// export async function testCalendarConnection() {
//   try {
//     const response = await calendar.events.list({
//       calendarId: 'primary',
//       timeMin: new Date().toISOString(),
//       maxResults: 5,
//       singleEvents: true,
//       orderBy: 'startTime',
//     });
//     console.log('✅ Google Calendar connected successfully.');
//     return response.data.items;
//   } catch (error) {
//     console.error('❌ Failed to connect to Google Calendar:', error);
//     throw error;
//   }
// }