import { END, START, StateGraph } from "@langchain/langgraph";
import { calendarNode } from "../nodes/nodes";
import { CalendarState } from "../state/state";


const workflow = new StateGraph(CalendarState)
.addNode("calendar", calendarNode)
.addEdge(START, "calendar")
.addEdge("calendar", END);


export const graph = workflow.compile();