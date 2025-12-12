import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { config } from "./config.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";

// --- Define a Tool ---
const searchInformationTool = tool(
  async ({ query }: { query: string }) => {
    console.log(
      `\n--- Tool Called: search_information with query: '${query}' ---`,
    );

    const simulatedResults: { [key: string]: string } = {
      "weather in london":
        "The weather in London is currently cloudy with a temperature of 15°C.",
      "capital of france": "The capital of France is Paris.",
      "population of earth":
        "The estimated population of Earth is around 8 billion people.",
      "tallest mountain":
        "Mount Everest is the tallest mountain above sea level.",
    };

    const result =
      simulatedResults[query.toLowerCase()] ??
      `Simulated search result for '${query}': No specific information found, but the topic seems interesting.`;

    console.log(`--- TOOL RESULT: ${result} ---`);
    return result;
  },
  {
    name: "search_information",
    description:
      "Provides factual information on a given topic. Use this tool to find answers to questions like 'What is the capital of France?' or 'What is the weather in London?'.",
    schema: z.object({
      query: z
        .string()
        .describe("The search query or question the user wants answered"),
    }),
  },
);

const tools = [searchInformationTool];

const runAgentWithTool = async (agentExecutor: any, query: string) => {
  console.log(`\n--- 🏃 Running Agent with Query: '${query}' ---`);
  try {
    const response = await agentExecutor.invoke({
      messages: [{ role: "user", content: query }],
    });
    console.log("\n--- ✅ Final Agent Response ---");
    console.log(response.messages.at(-1).content);
  } catch (e) {
    if (e instanceof Error) {
      console.log(
        `\n🛑 An error occurred during agent execution: ${e.message}`,
      );
      console.error(e.stack);
    } else {
      console.log(
        `\n🛑 An unknown error occurred during agent execution: ${e}`,
      );
    }
  }
};

const main = async () => {
  const model: BaseChatModel = new ChatOpenAI({
    apiKey: config.OPENAI_API_KEY || "dummy-key", // Use provided key or dummy
    temperature: 0,
  });

  if (!config.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY is not set. Using a dummy key.");
  }

  console.log(`✅ Language model initialized`);

  const agentExecutor = createAgent({
    model,
    tools,
  });

  const tasks = [
    () => runAgentWithTool(agentExecutor, "What is the capital of France?"),
    () => runAgentWithTool(agentExecutor, "What's the weather like in London?"),
    () => runAgentWithTool(agentExecutor, "Tell me something about dogs."),
  ];

  for (const task of tasks) {
    await task();
  }
};

main().catch(console.error);
