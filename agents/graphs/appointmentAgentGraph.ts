import {
  START,
  END,
  StateGraph,
  CompiledStateGraph,
} from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import {
  AppointmentAgentState,
  type AppointmentAgentStateType,
} from "../state/appointmentAgentState";
import {
  verifyPatientNode,
  registerPatientNode,
  analyzeIntentNode,
  bookAppointmentNode,
  cancelAppointmentNode,
  rescheduleAppointmentNode,
  queryAppointmentNode,
} from "../nodes/appointmentAgentNodes";
import { nativeMongoClient } from "../../lib/db/mongo.config";

function routeAfterVerify(state: AppointmentAgentStateType) {
  if (state.patientStatus === "KNOWN") {
    return "analyzeIntentNode";
  }
  return "registerPatientNode";
}

function routeAfterRegistration(state: AppointmentAgentStateType) {
  if (state.patientStatus === "KNOWN") {
    return "analyzeIntentNode";
  }
  return END;
}

function routeAfterIntentAnalysis(state: AppointmentAgentStateType) {
  switch (state.appointmentIntent) {
    case "book": return "bookAppointmentNode";
    case "cancel": return "cancelAppointmentNode";
    case "reschedule": return "rescheduleAppointmentNode";
    case "query":
    default: return "queryAppointmentNode";
  }
}

const workflow = new StateGraph(AppointmentAgentState)
  .addNode("verifyPatientNode", verifyPatientNode)
  .addNode("registerPatientNode", registerPatientNode)
  .addNode("analyzeIntentNode", analyzeIntentNode)
  .addNode("bookAppointmentNode", bookAppointmentNode)
  .addNode("cancelAppointmentNode", cancelAppointmentNode)
  .addNode("rescheduleAppointmentNode", rescheduleAppointmentNode)
  .addNode("queryAppointmentNode", queryAppointmentNode)

  .addEdge(START, "verifyPatientNode")

  .addConditionalEdges(
    "verifyPatientNode",
    routeAfterVerify,
    {
      analyzeIntentNode: "analyzeIntentNode",
      registerPatientNode: "registerPatientNode",
    }
  )

  .addConditionalEdges(
    "registerPatientNode",
    routeAfterRegistration,
    {
      analyzeIntentNode: "analyzeIntentNode",
      [END]: END,
    }
  )

  .addConditionalEdges(
    "analyzeIntentNode",
    routeAfterIntentAnalysis,
    {
      bookAppointmentNode: "bookAppointmentNode",
      cancelAppointmentNode: "cancelAppointmentNode",
      rescheduleAppointmentNode: "rescheduleAppointmentNode",
      queryAppointmentNode: "queryAppointmentNode",
    }
  )

  .addEdge("bookAppointmentNode", END)
  .addEdge("cancelAppointmentNode", END)
  .addEdge("rescheduleAppointmentNode", END)
  .addEdge("queryAppointmentNode", END);
export let appointmentAgent: CompiledStateGraph<any, any, any>;

export async function initAppointmentAgent() {
  if (
    nativeMongoClient &&
    typeof (nativeMongoClient as any).appendMetadata !== "function"
  ) {
    (nativeMongoClient as any).appendMetadata = () => {};
  }

  const checkpointer = new MongoDBSaver({ client: nativeMongoClient });
  await checkpointer.setup();

  appointmentAgent = workflow.compile({
    checkpointer,
  });
  console.log("🤖 LangGraph Agent workflow initialized successfully!");
}
