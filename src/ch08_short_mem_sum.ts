import { createAgent, summarizationMiddleware } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { ChatXAI } from "@langchain/xai";
import { config } from "./config.js";
import { ChatOpenAI } from "@langchain/openai";

const checkpointer = new MemorySaver();

const model = new ChatOpenAI({
  apiKey: config.OPENAI_API_KEY,
  temperature: 0.1,
});

const summarizationModel = new ChatXAI({
  apiKey: config.XAI_API_KEY,
  model: "grok-4-1-fast-non-reasoning",
  temperature: 0.1,
});

const agent = createAgent({
  model,
  tools: [],
  middleware: [
    summarizationMiddleware({
      model: summarizationModel,
      trigger: { tokens: 400 },
      keep: { messages: 2 },
    }),
  ],
  checkpointer,
});

const agentConfig = { configurable: { thread_id: "1" } };
await agent.invoke({ messages: "hi, my name is Alex" }, agentConfig);
await agent.invoke({ messages: "write a short poem about cats" }, agentConfig);
await agent.invoke({ messages: "now do the same but for dogs" }, agentConfig);
await agent.invoke(
  { messages: "write a blog about AI in 300 words" },
  agentConfig,
);
const finalResponse = await agent.invoke(
  { messages: "what's my name?" },
  agentConfig,
);

const messageDetails = finalResponse.messages.map((message) => [
  message.type,
  message.content,
]);
console.log(messageDetails);
