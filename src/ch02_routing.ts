import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  RunnablePassthrough,
  RunnableBranch,
  RunnableLambda,
} from "@langchain/core/runnables";
import { config } from "./config.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { z } from "zod";

// Define Zod schemas
const messageSchema = z.object({
  type: z.string(),
  content: z.string(),
});

const promptsSchema = z.object({
  coordinatorRouterPrompt: z.array(messageSchema),
});

const routerOutputSchema = z.enum(["booker", "info", "unclear"]);

const lambdaInputSchema = z.object({
  decision: routerOutputSchema,
  request: z.object({
    request: z.string(),
  }),
});
type LambdaInput = z.infer<typeof lambdaInputSchema>;

import { SystemMessage, HumanMessage } from "@langchain/core/messages";
// ... (keep other imports)

// ... (after lambdaInputSchema type definition)

// Load and parse the YAML file
const promptsData = promptsSchema.parse(
  yaml.load(fs.readFileSync("src/prompts/ch02_routing_prompts.yaml", "utf8")),
);

// Create the prompt from the loaded data
const coordinatorRouterPromptMessages = promptsData.coordinatorRouterPrompt.map(
  (msg) => {
    switch (msg.type) {
      case "system":
        return new SystemMessage(msg.content);
      case "user":
        return new HumanMessage(msg.content);
      default:
        throw new Error(`Unknown message type: ${msg.type}`);
    }
  },
);
const coordinatorRouterPrompt = ChatPromptTemplate.fromMessages(
  coordinatorRouterPromptMessages,
);

// --- Define Simulated Sub-Agent Handlers (equivalent to ADK sub_agents) ---

const bookingHandler = (request: string): string => {
  console.log("\n--- DELEGATING TO BOOKING HANDLER ---");
  return `Booking Handler processed request: '${request}'. Result: Simulated booking action.`;
};

const infoHandler = (request: string): string => {
  console.log("\n--- DELEGATING TO INFO HANDLER ---");
  return `Info Handler processed request: '${request}'. Result: Simulated information retrieval.`;
};

const unclearHandler = (request: string): string => {
  console.log("\n--- HANDLING UNCLEAR REQUEST ---");
  return `Coordinator could not delegate request: '${request}'. Please clarify.`;
};

// --- Example Usage ---
const main = async () => {
  // --- Configuration ---
  // Ensure your API key environment variable is set (e.g., OPENAI_API_KEY)
  let llm: BaseChatModel | null = null;
  try {
    llm = new ChatOpenAI({
      apiKey: config.OPENAI_API_KEY,
      temperature: 0,
    });
    console.log(`Language model initialized: ChatOpenAI`);
  } catch (e) {
    console.log(`Error initializing language model: ${e}`);
  }

  if (!llm) {
    console.log("\nSkipping execution due to LLM initialization failure.");
    return;
  }

  const nonNullableLlm = llm; // TypeScript will now infer nonNullableLlm as BaseChatModel

  const coordinatorRouterChain = coordinatorRouterPrompt
    .pipe(nonNullableLlm)
    .pipe(new StringOutputParser())
    .pipe((output: string) => routerOutputSchema.parse(output.trim()));

  const delegationBranch = new RunnableBranch({
    branches: [
      [
        new RunnableLambda({
          func: (x: LambdaInput) => x.decision === "booker",
        }),
        RunnablePassthrough.assign({
          output: (x: LambdaInput) => bookingHandler(x.request.request),
        }),
      ],
      [
        new RunnableLambda({
          func: (x: LambdaInput) => x.decision === "info",
        }),
        RunnablePassthrough.assign({
          output: (x: LambdaInput) => infoHandler(x.request.request),
        }),
      ],
    ],
    default: RunnablePassthrough.assign({
      output: (x: LambdaInput) => unclearHandler(x.request.request),
    }),
  });

  // Combine the router chain and the delegation branch into a single runnable
  // The router chain's output ('decision') is passed along with the original input ('request')
  // to the delegation_branch.
  const coordinatorAgent = RunnablePassthrough.assign({
    decision: coordinatorRouterChain,
    request: (input: { request: string }) => ({ request: input.request }), // Wrap the request string in an object
  })
    .pipe(delegationBranch)
    .pipe((x: { output: string }) => x.output);

  console.log("--- Running with a booking request ---");
  const requestA = "Book me a flight to London.";
  const resultA = await coordinatorAgent.invoke({ request: requestA });
  console.log(`Final Result A: ${resultA}`);

  console.log("\n--- Running with an info request ---");
  const requestB = "What is the capital of Italy?";
  const resultB = await coordinatorAgent.invoke({ request: requestB });
  console.log(`Final Result B: ${resultB}`);

  console.log("\n--- Running with an unclear request ---");
  const requestC = "Tell me about quantum physics.";
  const resultC = await coordinatorAgent.invoke({ request: requestC });
  console.log(`Final Result C: ${resultC}`);
};
main().catch(console.error);
