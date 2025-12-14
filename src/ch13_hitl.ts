import { ChatOpenAI } from "@langchain/openai";
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createAgent } from "langchain";
import { config } from "./config.js";
import * as fs from "fs";
import * as yaml from "js-yaml";

// --- Zod Schema for Prompts ---
const promptsSchema = z.object({
  baseInstruction: z.string(),
  personalizationContext: z.string(),
  troubleshootIssueTool: z.object({
    description: z.string(),
    schema: z.object({
      issue_description: z.object({
        describe: z.string(),
      }),
    }),
  }),
  createTicketTool: z.object({
    description: z.string(),
    schema: z.object({
      issue_type: z.object({
        describe: z.string(),
      }),
      details: z.object({
        describe: z.string(),
      }),
    }),
  }),
  escalateToHumanTool: z.object({
    description: z.string(),
    schema: z.object({
      issue_type: z.object({
        describe: z.string(),
      }),
      reason: z.object({
        describe: z.string(),
      }),
    }),
  }),
});

// Load prompts from external YAML file
const promptsData = promptsSchema.parse(
  yaml.load(fs.readFileSync("src/prompts/ch13_hitl_prompts.yaml", "utf8")),
);

// Helper interface for customer data
interface ICustomerInfo {
  name: string;
  tier: string;
  recent_purchases: string[];
  support_history: string;
}

// --- 2. Implement Tools using StructuredTool and Zod ---

class TroubleshootIssueTool extends DynamicStructuredTool<
  z.ZodObject<{ issue_description: z.ZodString }>
> {
  constructor() {
    super({
      name: "TroubleshootIssue",
      description: promptsData.troubleshootIssueTool.description,
      schema: z.object({
        issue_description: z
          .string()
          .describe(
            promptsData.troubleshootIssueTool.schema.issue_description.describe,
          ),
      }),
      func: async (input: z.infer<typeof this.schema>): Promise<string> => {
        console.log(
          `\n[TOOL EXECUTION] TroubleshootIssue for: ${input.issue_description}`,
        );
        return JSON.stringify({
          status: "success",
          report: `Troubleshooting steps initiated for: ${input.issue_description}. Please check power, connectivity, and firmware version.`,
        });
      },
    });
  }
}

class CreateTicketTool extends DynamicStructuredTool<
  z.ZodObject<{ issue_type: z.ZodString; details: z.ZodString }>
> {
  constructor() {
    super({
      name: "CreateTicket",
      description: promptsData.createTicketTool.description,
      schema: z.object({
        issue_type: z
          .string()
          .describe(promptsData.createTicketTool.schema.issue_type.describe),
        details: z
          .string()
          .describe(promptsData.createTicketTool.schema.details.describe),
      }),
      func: async (): Promise<string> => {
        const ticketId = `TICKET-${Date.now()}`;
        console.log(`\n[TOOL EXECUTION] CreateTicket: ${ticketId}`);
        return JSON.stringify({
          status: "success",
          ticket_id: ticketId,
          message: `Issue logged successfully. Ticket ID: ${ticketId}. A specialist will review your details.`,
        });
      },
    });
  }
}

class EscalateToHumanTool extends DynamicStructuredTool<
  z.ZodObject<{ issue_type: z.ZodString; reason: z.ZodString }>
> {
  constructor() {
    super({
      name: "EscalateToHuman",
      description: promptsData.escalateToHumanTool.description,
      schema: z.object({
        issue_type: z
          .string()
          .describe(promptsData.escalateToHumanTool.schema.issue_type.describe),
        reason: z
          .string()
          .describe(promptsData.escalateToHumanTool.schema.reason.describe),
      }),
      func: async (input: z.infer<typeof this.schema>): Promise<string> => {
        console.log(
          `\n[TOOL EXECUTION] EscalateToHuman for: ${input.issue_type} (Reason: ${input.reason})`,
        );
        return JSON.stringify({
          status: "success",
          message: `Escalation for ${input.issue_type} requested. Reason: ${input.reason}. Connecting you to a human specialist now.`,
        });
      },
    });
  }
}

const tools = [
  new TroubleshootIssueTool(),
  new CreateTicketTool(),
  new EscalateToHumanTool(),
];

// --- 3. Agent Logic and Execution (Mimics agent_node and personalization_callback) ---

const runSupportAgent = async (
  customerInfo: ICustomerInfo,
  messages: BaseMessage[],
): Promise<string> => {
  // NOTE: This relies on the OPENAI_API_KEY environment variable being set.
  const llm = new ChatOpenAI({
    apiKey: config.OPENAI_API_KEY,
    model: "gpt-4o-mini",
    temperature: 0,
  });

  // 1. Construct Dynamic System Prompt (Personalization)
  const customerName = customerInfo.name || "valued customer";
  const customerTier = customerInfo.tier || "standard";
  const recentPurchases = customerInfo.recent_purchases.join(", ") || "None";
  const supportHistory = customerInfo.support_history || "None available.";

  const personalizationNote = new SystemMessage(
    promptsData.personalizationContext
      .replace("{customerName}", customerName)
      .replace("{customerTier}", customerTier)
      .replace("{recentPurchases}", recentPurchases)
      .replace("{supportHistory}", supportHistory),
  );

  // 2. Combine the dynamic prompt with the base instructions
  const fullSystemPrompt = new SystemMessage(promptsData.baseInstruction);

  // 4. Create the Agent and Executor
  const agentExecutor = createAgent({
    model: llm,
    tools,
  });

  // 6. Invoke the executor. We must separate the full history into the
  // current input and the chat history used by the MessagesPlaceholder.
  const currentInput = messages[messages.length - 1].content;
  const chatHistory = messages.slice(0, -1);

  console.log(`\n--- AGENT: Invoking with user message: ${currentInput} ---`);

  const result = await agentExecutor.invoke({
    messages: [
      personalizationNote, // Dynamic Personalization Context
      fullSystemPrompt, // Static Base Instruction
      ...chatHistory,
      new HumanMessage(currentInput),
    ],
  });

  const lastMessage = result.messages.at(-1);
  return lastMessage
    ? (lastMessage.content as string)
    : "No response from agent.";
};

// --- 4. Simulation ---

const main = async () => {
  const customerData: ICustomerInfo = {
    name: "Alex Johnson",
    tier: "Premium",
    recent_purchases: ["Zeta Headset Pro", "Gamma Gaming Mouse"],
    support_history:
      "Had an issue with Zeta Headset (Ticket TICKET-8822) 2 months ago, which was resolved by a firmware update.",
  };

  // Scenario 1: Basic Troubleshooting (LLM should use TroubleshootIssue tool)
  const initialMessage1 =
    "My new Gamma Gaming Mouse suddenly stopped connecting to my PC. I can't figure out why.";
  const messages1: BaseMessage[] = [new HumanMessage(initialMessage1)];

  console.log("=".repeat(60));
  console.log("SCENARIO 1: Mouse connection issue (Requires Troubleshooting)");
  console.log("=".repeat(60));

  try {
    const finalResponse1 = await runSupportAgent(customerData, messages1);
    console.log("\n--- Final Agent Response (SCENARIO 1) ---");
    console.log(finalResponse1);
  } catch (error) {
    console.error("An error occurred in Scenario 1:", error);
  }

  // Scenario 2: Immediate Escalation Request (LLM should use EscalateToHuman tool)
  const initialMessage2 =
    "The Zeta Headset Pro you sent me is defective. I want to speak to a human supervisor immediately to process a full refund and replacement.";
  const messages2: BaseMessage[] = [new HumanMessage(initialMessage2)];

  console.log("\n\n" + "=".repeat(60));
  console.log(
    "SCENARIO 2: Immediate Escalation Request (Requires EscalateToHuman)",
  );
  console.log("=".repeat(60));

  try {
    const finalResponse2 = await runSupportAgent(customerData, messages2);
    console.log("\n--- Final Agent Response (SCENARIO 2) ---");
    console.log(finalResponse2);
  } catch (error) {
    console.error("An error occurred in Scenario 2:", error);
  }
};

// Uncomment the line below to run the simulation in a Node.js environment
main().catch(console.error);
