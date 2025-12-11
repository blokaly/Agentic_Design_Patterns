import { tool } from "@langchain/core/tools";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";
import { config } from "./config.js";
import { SystemMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { ChatXAI } from "@langchain/xai";
// import { MemorySaver } from "@langchain/langgraph";
// import { createDeepAgent } from "deepagents";

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
    description: "Run a web search",
    schema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of results to return"),
      topic: z
        .enum(["general", "news", "finance"])
        .optional()
        .default("general")
        .describe("Search topic category"),
      includeRawContent: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to include raw content"),
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

  const researchInstructions = `You are an expert researcher. Your job is to conduct thorough research and then write a polished report.

You have access to an internet search tool as your primary means of gathering information.

## \`internet_search\`

Use this to run an internet search for a given query. You can specify the max number of results to return, the topic, and whether raw content should be included.
`;

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
      new SystemMessage(researchInstructions),
      { role: "user", content: "What is langgraph?" },
    ],
  });

  // Print the agent's response
  console.log(result.messages[result.messages.length - 1].content);
};

main().catch(console.error);
