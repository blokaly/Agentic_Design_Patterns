import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";
import { config } from "./config.js";
import { ChatXAI } from "@langchain/xai";

const client = new MultiServerMCPClient({
  math: {
    transport: "stdio", // Local subprocess communication
    command: "node",
    // Replace with absolute path to your math_server.js file
    args: ["./dist/ch09_mcp_math.js"],
  },
  // weather: {
  //   transport: "streamable_http", // HTTP-based remote server
  //   // Ensure you start your weather server on port 8000
  //   url: "http://localhost:8000/mcp",
  // },
});

const model = new ChatXAI({
  apiKey: config.XAI_API_KEY,
  model: "grok-4-fast-reasoning",
  temperature: 0.1,
});

const main = async () => {
  const tools = await client.getTools();
  const agent = createAgent({
    model,
    tools,
  });
  const mathResponse = await agent.invoke({
    messages: [{ role: "user", content: "what's (3 + 5) x 12?" }],
  });
  console.log(mathResponse.messages[mathResponse.messages.length - 1].content);
  await client.close();
};

main().catch(console.error);

// const weatherResponse = await agent.invoke({
//   messages: [{ role: "user", content: "what is the weather in nyc?" }],
// });
