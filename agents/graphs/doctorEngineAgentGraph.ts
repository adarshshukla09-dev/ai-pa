import { START, END, StateGraph, CompiledStateGraph } from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { nativeMongoClient } from "../../lib/db/mongo.config";
import { DoctorEngineState, type DoctorEngineStateType } from "../state/doctorEngineState";
import {
  extractInstructionIntent,
  resolveTargetPatient,
  checkavailability,
  bookingDrNode,
  updateAppointment,
  cancelAppointment,
  saveDoctorInstruction,
} from "../nodes/doctorEngineNode";

/**
 * Clean Top-Level Router: Isolates action states cleanly right after 
 * resolving target patient context.
 */
function routeAfterPatientResolution(state: DoctorEngineStateType) {
  if (!state.targetPatientPhone) {
    return END;
  }

  switch (state.pendingInstruction?.action) {
    case "book_appointment":
    case "update_appointment":
      return "checkAvailabilityNode";

    case "cancel_appointment":
      return "cancelAppointmentNode";

    case "block_patient":
    case "override_rule":
      return "saveDoctorInstruction";

    default:
      return END;
  }
}

/**
 * Mid-workflow Availability Router: Diverges execution paths cleanly 
 * based on the isolated action intent.
 */
function routeAfterAvailability(state: DoctorEngineStateType) {
  if (!state.slotAvailable) {
    return END;
  }

  switch (state.pendingInstruction?.action) {
    case "book_appointment":
      return "bookAppointmentByDrNode";

    case "update_appointment":
      return "updateAppointmentNode";

    default:
      return END;
  }
}

// --- Workflow DAG Initialization ---
const doctorWorkflow = new StateGraph(DoctorEngineState)
  // Intent & Context Discovery Layer
  .addNode("extractInstructionIntent", extractInstructionIntent)
  .addNode("resolveTargetPatient", resolveTargetPatient)
  
  // Guard/Checking Layer
  .addNode("checkAvailabilityNode", checkavailability)
  
  // Execution Layer
  .addNode("bookAppointmentByDrNode", bookingDrNode)
  .addNode("updateAppointmentNode", updateAppointment)
  .addNode("cancelAppointmentNode", cancelAppointment)
  .addNode("saveDoctorInstruction", saveDoctorInstruction)

  // Linear Entry Definition
  .addEdge(START, "extractInstructionIntent")
  .addEdge("extractInstructionIntent", "resolveTargetPatient")

  // Router Splitting Block
  .addConditionalEdges(
    "resolveTargetPatient",
    routeAfterPatientResolution,
    {
      checkAvailabilityNode: "checkAvailabilityNode",
      cancelAppointmentNode: "cancelAppointmentNode",
      saveDoctorInstruction: "saveDoctorInstruction",
      [END]: END,
    }
  )

  // Availability Branch Block
  .addConditionalEdges(
    "checkAvailabilityNode",
    routeAfterAvailability,
    {
      bookAppointmentByDrNode: "bookAppointmentByDrNode",
      updateAppointmentNode: "updateAppointmentNode",
      [END]: END,
    }
  )

  // Unified Terminal Collection Points
  .addEdge("bookAppointmentByDrNode", END)
  .addEdge("updateAppointmentNode", END)
  .addEdge("cancelAppointmentNode", END)
  .addEdge("saveDoctorInstruction", END);

export let doctorAgent: CompiledStateGraph<any, any, any>;

export async function initDoctorAgent() {
  if (nativeMongoClient && typeof (nativeMongoClient as any).appendMetadata !== "function") {
    (nativeMongoClient as any).appendMetadata = () => {};
  }

  const checkpointer = new MongoDBSaver({ client: nativeMongoClient });
  await checkpointer.setup();

  doctorAgent = doctorWorkflow.compile({
    checkpointer,
  });
  console.log("🤖 LangGraph Agent workflow initialized successfully with Isolated Action Architecture!");
}