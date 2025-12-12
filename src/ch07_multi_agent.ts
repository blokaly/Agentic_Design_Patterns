import { tool } from "@langchain/core/tools";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";
import { config } from "./config.js";
import { SystemMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { ChatXAI } from "@langchain/xai";
import * as fs from "fs";
import * as yaml from "js-yaml";
// import { MemorySaver } from "@langchain/langgraph";
// import { createDeepAgent } from "deepagents";

// --- Zod Schema for Prompts ---
const promptsSchema = z.object({
  internetSearch: z.object({
    description: z.string(),
    schema: z.object({
      query: z.object({
        describe: z.string(),
      }),
      maxResults: z.object({
        describe: z.string(),
      }),
      topic: z.object({
        describe: z.string(),
      }),
      includeRawContent: z.object({
        describe: z.string(),
      }),
    }),
  }),
  researchInstructions: z.string(),
});

// Load prompts from external YAML file
const promptsData = promptsSchema.parse(
  yaml.load(
    fs.readFileSync("src/prompts/ch07_multi_agent_prompts.yaml", "utf8"),
  ),
);

const internetSearch = tool(
  async ({
    query,
    maxResults = 5,
    topic = "general",
    includeRawContent = false,
  }: {
    query: string;
    maxResults?: number;
    topic?: "general" | "news" | "finance";
    includeRawContent?: boolean;
  }) => {
    const tavilySearch = new TavilySearch({
      maxResults,
      tavilyApiKey: config.TAVILY_API_KEY,
      includeRawContent,
      topic,
    });
    return await tavilySearch.invoke({ query: query });
  },
  {
    name: "internet_search",
    description: promptsData.internetSearch.description,
    schema: z.object({
      query: z
        .string()
        .describe(promptsData.internetSearch.schema.query.describe),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe(promptsData.internetSearch.schema.maxResults.describe),
      topic: z
        .enum(["general", "news", "finance"])
        .optional()
        .default("general")
        .describe(promptsData.internetSearch.schema.topic.describe),
      includeRawContent: z
        .boolean()
        .optional()
        .default(false)
        .describe(promptsData.internetSearch.schema.includeRawContent.describe),
    }),
  },
);

const main = async () => {
  const tools = [internetSearch];
  const model = new ChatXAI({
    apiKey: config.XAI_API_KEY,
    model: "grok-4-fast-reasoning",
    temperature: 0.1,
  });

  const agent = createAgent({
    model,
    tools,
  });

  // const subagents = [{
  //     name: "research-agent",
  //     description: "Used to research more in depth questions",
  //     systemPrompt: "You are a great researcher",
  //     tools: [internetSearch],
  //     model: new ChatXAI({
  //       apiKey: config.XAI_API_KEY,
  //       model: "grok-4-fast-reasoning",
  //       temperature: 0.1,
  //     }),
  //   }];

  // const agent = createDeepAgent({
  //   checkpointer: new MemorySaver(),
  //   model: new ChatXAI({
  //     apiKey: config.XAI_API_KEY,
  //     model: "grok-4-fast-reasoning",
  //     temperature: 0.1,
  //   }),
  //   subagents: subagents,
  // });

  const result = await agent.invoke({
    messages: [
      new SystemMessage(promptsData.researchInstructions),
      { role: "user", content: "What is langgraph?" },
    ],
  });

  // Print the agent's response
  console.log(result.messages[result.messages.length - 1].content);
};

main().catch(console.error);
