import { AIMessage } from "@langchain/core/messages";
import { generateText } from "ai";
import { getDynamicProvider } from "../llm/llm.config";
import type { CalendarState } from "../state/state";
import { calendarTools } from "../tools/calendar-tools";

export async function calendarNode(state: typeof CalendarState.State) {
  try {
    const llm = getDynamicProvider(state.provider, state.apiKey);
    const model = llm(state.model);
    
    // 1. Get the current date/time context dynamically
    const now = new Date();
    const currentDateTimeContext = `Current date and time: ${now.toString()} (ISO: ${now.toISOString()}).`;
    
    // 2. Inject it cleanly into your System Prompt
    const SYSTEM_PROMPT = `You are a helpful assistant that can read and write to a Google Calendar. You have access to the user's calendar events and can create, update, delete, and read events based on user instructions using tools available to you.
    
${currentDateTimeContext}
Use this current time context to calculate relative dates and times (like 'tomorrow', 'next week', '3 PM') accurately before calling any tools. Unless specified otherwise by the user, assume their preferred duration for events is 1 hour and fallback to a default timezone if none is derived.`;
    
    const promptText = state.message.map(m => m.content).join("\n");

    const response = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: promptText,
      tools: calendarTools,
    });
    
    return {
      message: [new AIMessage(response.text)]
    };

  } catch (error) {
    if (error instanceof Error) {
      console.error('Error in calendarNode:', error.message);
    } else {
      console.error('Unknown error in calendarNode:', error);
    }
    throw error; 
  }
}