import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai'; // 👈 1. Import generateText wrapper
import { Doctor, type DoctorDocument } from '../../lib/db/models/doctor.models';
import { createCalendarTools } from '../tools/calendar-tools';
import { dbTools } from '../tools/db-tools';
import type { AppointmentAgentStateType } from '../state/state';

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
    state: AppointmentAgentStateType
) => {  const llmProvider = state.doctor.llmProvider;
  const llmModel = state.doctor.llmModel;
  const llmApiKey = state.doctor.apiKey;
  const m = await llm(llmProvider, llmModel, llmApiKey);
const calendarTools = createCalendarTools(state);

const tools = {
    ...calendarTools,
    ...dbTools(state)
};
  return {m, tools};
};

