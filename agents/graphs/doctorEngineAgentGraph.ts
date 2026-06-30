import { START, END, StateGraph, CompiledStateGraph } from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { nativeMongoClient } from "../../lib/db/mongo.config";
import { DoctorEngineState, type DoctorEngineStateType } from "../state/doctorEngineState";
import { 
  extractInstructionIntent, 
  resolveTargetPatient, 
  saveDoctorInstruction 
} from "../nodes/doctorEngineNode";

// Clean workflow branching using absolute context state matching instead of guessing LLM context outputs
function routeAfterPatientResolution(state: DoctorEngineStateType) {
  if (!state.targetPatientPhone) {
    return END; // Halt for human clarification input loop
  }
  
  // Deterministic routing based on clean action extraction
  if (state.pendingInstruction?.action === "book_appointment") {
    return "checkAvailabilityNode"; 
  }
  
  return "saveDoctorInstruction";
}

function routeAfterAvailability(state: DoctorEngineStateType) {
  if (state.slotAvailable === true) {
    return "bookAppointmentByDrNode";
  }
  return "saveDoctorInstruction"; // Save the instruction context anyway or notify failure
}

const doctorWorkflow = new StateGraph(DoctorEngineState)
  .addNode("extractInstructionIntent", extractInstructionIntent)
  .addNode("resolveTargetPatient", resolveTargetPatient)
  .addNode("saveDoctorInstruction", saveDoctorInstruction)
  // Assuming the node implementations are imported or declared below...

  .addEdge(START, "extractInstructionIntent")
  .addEdge("extractInstructionIntent", "resolveTargetPatient")

  .addConditionalEdges(
    "resolveTargetPatient",
    routeAfterPatientResolution,
    {
      saveDoctorInstruction: "saveDoctorInstruction",
      // checkAvailabilityNode: "checkAvailabilityNode", // Hooks up cleanly when adding appointment execution steps
      [END]: END,
    }
  )
  .addEdge("saveDoctorInstruction", END);
  export let doctorEngineGraph: CompiledStateGraph<any, any, any>;

// --- Persistence initialization ---

export async function initDoctorEngine() {
  if (
    nativeMongoClient &&
    typeof (nativeMongoClient as any).appendMetadata !== "function"
  ) {
    (nativeMongoClient as any).appendMetadata = () => {};
  }

  const checkpointer = new MongoDBSaver({ client: nativeMongoClient });
  await checkpointer.setup();

  doctorEngineGraph = doctorWorkflow.compile({
    checkpointer,
  });
  console.log("🩺 LangGraph Doctor Engine workflow initialized successfully!");
}