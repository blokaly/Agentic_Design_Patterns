import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "math-server",
  version: "0.1.0",
});

// Define the addition tool
const add = async (a: number, b: number): Promise<CallToolResult> => {
  const sum = a + b;
  return {
    content: [
      {
        type: "text",
        text: sum.toString(),
      },
    ],
  };
};

// Define a simple Zod object as inputSchema
const toolInputSchema = z.object({
  a: z.number().describe("The first number"),
  b: z.number().describe("The second number"),
});

// Register the tool with the McpServer
server.registerTool(
  "add",
  {
    description: "Adds two numbers together",
    inputSchema: toolInputSchema,
  },
  ({ a, b }) => add(a, b),
);

const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Math MCP server running on stdio");
};

main().catch(console.error);
