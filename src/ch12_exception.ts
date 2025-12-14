import { END, StateGraph } from "@langchain/langgraph";
import * as z from "zod";

// --- 1. Define the Shared State Interface ---
// This interface defines all the data passed between the sequential agents.
const LocationState = z.object({
  // Original query from the user (e.g., "Find 123 Fake St, Los Angeles")
  query: z.string(),

  // Result from the primary (precise) lookup attempt
  precise_location_result: z.string().optional(),

  // Flag set by the primary handler to signal failure
  primary_location_failed: z.boolean().default(false),

  // Result from the fallback (general area) lookup
  general_area_result: z.string().optional(),

  // The final message to be presented to the user
  final_response_message: z.string().default(""),
});

type LocationState = z.infer<typeof LocationState>;

// --- 2. Tool Placeholders (Mocking the ADK tools) ---
// These functions simulate the execution of the tools the agents are instructed to use.
type Tool = (input: string) => Promise<string>;

const get_precise_location_info: Tool = async (address: string) => {
  console.log(`[Tool] Attempting precise lookup for: "${address}"`);

  // Simulate success for a known address
  if (address.includes("123 Fake St")) {
    return "Precise Coordinates: 34.0522 N, 118.2437 W. Building ID: A40.";
  }

  // Simulate failure if the input is too vague or unknown
  throw new Error(
    "Precise lookup failed: Address not specific enough or invalid.",
  );
};

const get_general_area_info: Tool = async (city: string) => {
  console.log(`[Tool] Attempting general lookup for city: "${city}"`);
  return `General Area Info for ${city}: Climate is moderate, nearest airport is LAX.`;
};

// --- 3. Define the Nodes (The Agents) ---

/**
 * Node 1: Primary Handler
 * Tries the precise location tool and sets a failure flag if it fails.
 */
const primary_handler = async (
  state: LocationState,
): Promise<Partial<LocationState>> => {
  console.log("--- Executing Primary Handler ---");
  let precise_location_result: string | undefined;
  let primary_location_failed = false;

  try {
    // In a real LangGraph agent, this would be an LLM call that decides to use the tool.
    // Here we simulate the direct tool use and error handling based on the ADK instruction.
    precise_location_result = await get_precise_location_info(state.query);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Primary Handler failed: ${error.message}`);
    }
    primary_location_failed = true;
  }

  return {
    precise_location_result,
    primary_location_failed,
  };
};

/**
 * Node 2: Fallback Handler
 * Checks the failure flag from Node 1. If true, it executes the general area tool.
 */
const fallback_handler = async (
  state: LocationState,
): Promise<Partial<LocationState>> => {
  console.log("--- Executing Fallback Handler ---");

  if (state.primary_location_failed) {
    // LLM instruction: "extract the city from the user's original query"
    // We simulate this extraction (assuming the city is always the last word for simplicity)
    const queryParts = state.query.split(",").map((p) => p.trim());
    const city = queryParts[queryParts.length - 1];
    console.log(`Fallback triggered. Extracted city: ${city}`);

    const general_area_result = await get_general_area_info(city);

    return { general_area_result };
  } else {
    console.log("Primary Handler succeeded. Skipping fallback.");
    return {}; // No state changes needed
  }
};

/**
 * Node 3: Response Agent
 * Reviews the accumulated state and generates the final user response.
 */
const response_agent = async (
  state: LocationState,
): Promise<Partial<LocationState>> => {
  console.log("--- Executing Response Agent ---");
  let final_response_message: string;

  if (state.precise_location_result) {
    // Primary succeeded
    final_response_message = `Successfully found precise location information based on your query "${state.query}". Result: ${state.precise_location_result}`;
  } else if (state.general_area_result) {
    // Fallback succeeded
    final_response_message = `Could not find the precise address, but I found general information for the area. Query: "${state.query}". General Info: ${state.general_area_result}`;
  } else {
    // Both failed
    final_response_message =
      "I apologize, but I was unable to retrieve either precise or general location information based on your query. Please try a different query.";
  }

  return { final_response_message };
};

// --- 4. Build the Sequential StateGraph ---

const robustLocationWorkflow = new StateGraph(LocationState)
  .addNode("primary_handler", primary_handler)
  .addNode("fallback_handler", fallback_handler)
  .addNode("response_agent", response_agent)
  .setEntryPoint("primary_handler")
  .addEdge("primary_handler", "fallback_handler")
  .addEdge("fallback_handler", "response_agent")
  .setFinishPoint("response_agent");

const robust_location_agent = robustLocationWorkflow.compile();

// --- Example Execution ---

async function runSequentialAgent(query: string) {
  console.log(`\n--- Running Agent for Query: ${query} ---
`);

  const initialState = {
    query: query,
  };

  const finalState = await robust_location_agent.invoke(initialState, {
    configurable: { thread_id: "test-run" },
  });

  console.log("\n--- Final Result ---");
  console.log(finalState.final_response_message);
}

// Example 1: Successful Primary Lookup (Fallback skipped)
await runSequentialAgent("123 Fake St, Los Angeles");

// Example 2: Primary Lookup Fails (Fallback triggered)
await runSequentialAgent("Vague Area near Los Angeles");
