import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';

import { createCalendarTools } from '../tools/calendar-tools';
import { dbTools } from '../tools/db-tools';
import type { AppointmentAgentStateType } from '../state/appointmentAgentState';
import type { DoctorDocument } from '../../lib/db/models/doctor.models';

export const llm = async (provider: string, model: string, apikey: string) => {
  const normalizedProvider = provider.toLowerCase().trim();

  switch (normalizedProvider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: apikey });
      return openai(model);
    }

    case 'google':
    case 'gemini': {
      const google = createGoogleGenerativeAI({ apiKey: apikey });
      return google(model);
    }

    case 'groq': {
      const groq = createGroq({ apiKey: apikey });
      return groq(model);
    }

    default:
      throw new Error(`Unsupported provider: "${provider}". Choose openai, google, or groq.`);
  }
};

export const llmConfig = async (
    doctor:DoctorDocument
) => {  const llmProvider = doctor.llmProvider;
  const llmModel = doctor.llmModel;
  const llmApiKey = doctor.apiKey;
  const m = await llm(llmProvider, llmModel, llmApiKey);
const calendarTools = createCalendarTools(doctor);

const tools = {
  ...dbTools(),
    ...calendarTools,
};
  return {m, tools};
};
