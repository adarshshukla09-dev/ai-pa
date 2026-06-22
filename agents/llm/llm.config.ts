import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';

export function getDynamicProvider(provider: string, apiKey: string) {
  switch (provider.toLowerCase()) {
    case 'openai':
    case 'chatgpt': // Mapping 'chatgpt' alias to the OpenAI provider
      return createOpenAI({ apiKey });
            
    case 'google':
    case 'gemini': // Mapping 'gemini' alias to the Google provider
      return createGoogleGenerativeAI({ apiKey });
      
    case 'groq':
      return createGroq({ apiKey });
      
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}