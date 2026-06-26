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
} from "../state/state";
import {
  verifyPatientNode,
  registerPatientNode,
  scheduleAppointmentNode,
} from "../nodes/nodes";
import { nativeMongoClient } from "../../lib/db/mongo.config";




function routeAfterVerify(state: AppointmentAgentStateType) {
  if (state.patientStatus === "KNOWN") {
    return "scheduleAppointmentNode";
  }

  return "registerPatientNode";
}
function routeAfterRegistration(state: AppointmentAgentStateType) {
  if (state.patientStatus === "KNOWN") {
    return "scheduleAppointmentNode";
  }

  return END;
}
const workflow = new StateGraph(AppointmentAgentState)
  .addNode("verifyPatientNode", verifyPatientNode)
  .addNode("registerPatientNode", registerPatientNode)
  .addNode("scheduleAppointmentNode", scheduleAppointmentNode)

  .addEdge(START, "verifyPatientNode")

  .addConditionalEdges(
    "verifyPatientNode",
    routeAfterVerify,
    {
      scheduleAppointmentNode: "scheduleAppointmentNode",
      registerPatientNode: "registerPatientNode",
    }
  )

  .addConditionalEdges(
    "registerPatientNode",
    routeAfterRegistration,
    {
      scheduleAppointmentNode: "scheduleAppointmentNode",
      [END]: END,
    }
  )

  .addEdge("scheduleAppointmentNode", END);
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
