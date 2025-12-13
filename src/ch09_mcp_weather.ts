import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { config } from "./config.js";

const server = new McpServer({
  name: "weather-server",
  version: "0.1.0",
});

const getWeather = async (location: string): Promise<CallToolResult> => {
  return {
    content: [
      {
        type: "text",
        text: `It's always sunny in ${location}`,
      },
    ],
  };
};

// Define a simple Zod object as inputSchema for get_weather
const toolInputSchema = z.object({
  location: z.string().describe("The location to get weather for"),
});

server.registerTool(
  "get_weather",
  {
    description: "Get weather for location",
    inputSchema: toolInputSchema,
  },
  ({ location }) => getWeather(location),
);

const app = express();

app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = config.SERVER_PORT;
app.listen(PORT, () => {
  console.log(`Weather MCP server running on port ${PORT}`);
});
