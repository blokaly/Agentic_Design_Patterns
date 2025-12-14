import { END, StateGraph, START } from "@langchain/langgraph";
import * as z from "zod";

// --- 1. Define the Shared State Interface ---
// This interface defines all the data passed between the sequential agents.
const LocationStateSchema = z.object({
  // Original query from the user (e.g., "Find 123 Fake St, Los Angeles")
  query: z.string(),

  // Result from the primary (precise) lookup attempt
  preciseLocationResult: z.string().optional(),

  // Flag set by the primary handler to signal failure
  primaryLocationFailed: z.boolean().default(false),

  // Result from the fallback (general area) lookup
  generalAreaResult: z.string().optional(),

  // The final message to be presented to the user
  finalResponseMessage: z.string().default(""),
});

type ILocationState = z.infer<typeof LocationStateSchema>;

// --- 2. Tool Placeholders (Mocking the ADK tools) ---
// These functions simulate the execution of the tools the agents are instructed to use.
type Tool = (input: string) => Promise<string>;

const getPreciseLocationInfo: Tool = async (address: string) => {
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

const getGeneralAreaInfo: Tool = async (city: string) => {
  console.log(`[Tool] Attempting general lookup for city: "${city}"`);
  return `General Area Info for ${city}: Climate is moderate, nearest airport is LAX.`;
};

// --- 3. Define the Nodes (The Agents) ---

/**
 * Node 1: Primary Handler
 * Tries the precise location tool and sets a failure flag if it fails.
 */
const primaryHandler = async (
  state: ILocationState,
): Promise<Partial<ILocationState>> => {
  console.log("--- Executing Primary Handler ---");
  let preciseLocationResult: string | undefined;
  let primaryLocationFailed = false;

  try {
    // In a real LangGraph agent, this would be an LLM call that decides to use the tool.
    // Here we simulate the direct tool use and error handling based on the ADK instruction.
    preciseLocationResult = await getPreciseLocationInfo(state.query);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Primary Handler failed: ${error.message}`);
    }
    primaryLocationFailed = true;
  }

  return {
    preciseLocationResult,
    primaryLocationFailed,
  };
};

/**
 * Node 2: Fallback Handler
 * Checks the failure flag from Node 1. If true, it executes the general area tool.
 */
const fallbackHandler = async (
  state: ILocationState,
): Promise<Partial<ILocationState>> => {
  console.log("--- Executing Fallback Handler ---");

  if (state.primaryLocationFailed) {
    // LLM instruction: "extract the city from the user's original query"
    // We simulate this extraction (assuming the city is always the last word for simplicity)
    const queryParts = state.query.split(",").map((p) => p.trim());
    const city = queryParts[queryParts.length - 1];
    console.log(`Fallback triggered. Extracted city: ${city}`);

    const generalAreaResult = await getGeneralAreaInfo(city);

    return { generalAreaResult };
  } else {
    console.log("Primary Handler succeeded. Skipping fallback.");
    return {}; // No state changes needed
  }
};

/**
 * Node 3: Response Agent
 * Reviews the accumulated state and generates the final user response.
 */
const responseAgent = async (
  state: ILocationState,
): Promise<Partial<ILocationState>> => {
  console.log("--- Executing Response Agent ---");
  let finalResponseMessage: string;

  if (state.preciseLocationResult) {
    // Primary succeeded
    finalResponseMessage = `Successfully found precise location information based on your query "${state.query}". Result: ${state.preciseLocationResult}`;
  } else if (state.generalAreaResult) {
    // Fallback succeeded
    finalResponseMessage = `Could not find the precise address, but I found general information for the area. Query: "${state.query}". General Info: ${state.generalAreaResult}`;
  } else {
    // Both failed
    finalResponseMessage =
      "I apologize, but I was unable to retrieve either precise or general location information based on your query. Please try a different query.";
  }

  return { finalResponseMessage };
};

// --- 4. Build the Sequential StateGraph ---

const robustLocationWorkflow = new StateGraph(LocationStateSchema)
  .addNode("primaryHandler", primaryHandler)
  .addNode("fallbackHandler", fallbackHandler)
  .addNode("responseAgent", responseAgent)
  .addEdge(START, "primaryHandler")
  .addEdge("primaryHandler", "fallbackHandler")
  .addEdge("fallbackHandler", "responseAgent")
  .addEdge("responseAgent", END);

const robust_location_agent = robustLocationWorkflow.compile();

// --- Example Execution ---

const runSequentialAgent = async (query: string) => {
  console.log(`\n--- Running Agent for Query: ${query} ---
`);

  const initialState = {
    query: query,
  };

  const finalState = await robust_location_agent.invoke(initialState, {
    configurable: { thread_id: "test-run" },
  });

  console.log("\n--- Final Result ---");
  console.log(finalState.finalResponseMessage);
};

// Example 1: Successful Primary Lookup (Fallback skipped)
await runSequentialAgent("123 Fake St, Los Angeles");

// Example 2: Primary Lookup Fails (Fallback triggered)
await runSequentialAgent("Vague Area near Los Angeles");
