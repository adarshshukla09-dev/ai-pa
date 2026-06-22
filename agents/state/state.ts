import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "langchain";
type provider = "openai" | "chatgpt" | "google" | "gemini" | "groq";

type mode = "creating" | "updating" | "deleting" | "reading";
export const CalendarState = Annotation.Root({
  provider: Annotation<provider>(),
  model: Annotation<string>(),
  apiKey: Annotation<string>(),
  message: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});
