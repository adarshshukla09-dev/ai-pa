import {
  START,
  END,
  StateGraph,
  CompiledStateGraph,
} from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";


import { nativeMongoClient } from "../../lib/db/mongo.config";
import { DoctorEngineState, type DoctorEngineStateType } from "../state/doctorEngineState";
import { extractInstructionIntent, resolveTargetPatient, saveDoctorInstruction } from "../nodes/doctorEngineNode";


function routeAfterPatientResolution(state: DoctorEngineStateType) {
  // If the patient was successfully resolved and verified, move to save
  if (state.targetPatientPhone) {
    return "saveDoctorInstruction";
  }
  // Otherwise, stop execution here and wait for Human-In-The-Loop feedback
  return END;
}

const doctorWorkflow = new StateGraph(DoctorEngineState)
  .addNode("extractInstructionIntent", extractInstructionIntent)
  .addNode("resolveTargetPatient", resolveTargetPatient)
  .addNode("saveDoctorInstruction", saveDoctorInstruction)

  // Linear flow from Start -> Extraction -> Resolution
  .addEdge(START, "extractInstructionIntent")
  .addEdge("extractInstructionIntent", "resolveTargetPatient")

  // Conditional split out of Resolution
  .addConditionalEdges(
    "resolveTargetPatient",
    routeAfterPatientResolution,
    {
      saveDoctorInstruction: "saveDoctorInstruction",
      [END]: END,
    }
  )
  .addEdge("saveDoctorInstruction", END);

export let doctorAgent: CompiledStateGraph<any, any, any>;

export async function initDoctorAgent() {
  const checkpointer = new MongoDBSaver({ client: nativeMongoClient });
  await checkpointer.setup();

  doctorAgent = doctorWorkflow.compile({
    checkpointer,
  });
  console.log("👨‍⚕️ LangGraph Doctor Engine workflow initialized successfully!");
}