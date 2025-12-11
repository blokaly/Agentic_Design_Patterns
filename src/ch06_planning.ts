import OpenAI from "openai";
import { config } from "./config.js";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { z } from "zod";

// --- Zod Schema for Prompts ---
const promptsSchema = z.object({
  system_message: z.string(),
  user_query: z.string(),
});

// --- Enhanced TypeScript Interfaces for the Deep Research API Response ---
interface Annotation {
  start_index: number;
  end_index: number;
  title: string;
  url: string;
}

interface TextContent {
  type: "text";
  text: string;
  annotations?: Annotation[];
}

interface InputTextContent {
  type: "input_text";
  text: string;
}

interface InputItem {
  role: "developer" | "user";
  content: InputTextContent[];
}

interface ReasoningSummaryPart {
  text: string;
}

interface ReasoningStep {
  type: "reasoning";
  summary: ReasoningSummaryPart[];
}

interface WebSearchAction {
  query: string;
}

interface WebSearchCall {
  type: "web_search_call";
  action: WebSearchAction;
  status: string;
}

interface CodeInterpreterCall {
  type: "code_interpreter_call";
  input: string;
  output: string;
}

interface FinalReport {
  type: "final_report";
  content: TextContent[];
}

type ResponseOutput =
  | ReasoningStep
  | WebSearchCall
  | CodeInterpreterCall
  | FinalReport;

interface DeepResearchResponse {
  output?: ResponseOutput[];
}

// --- Main Application Logic ---
async function runDeepResearch() {
  if (!config.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set. Please add it to your .env file.",
    );
    return;
  }

  const client = new OpenAI.OpenAI({ apiKey: config.OPENAI_API_KEY });

  // Load prompts from external YAML file
  const promptsData = promptsSchema.parse(
    yaml.load(
      fs.readFileSync("src/prompts/ch06_planning_prompts.yaml", "utf8"),
    ),
  );
  const { system_message, user_query } = promptsData;

  try {
    console.log("Starting deep research with o3-deep-research...\n");

    // The 'responses.create' method is not in the official typings, so we cast to 'any'
    // while still typing the expected 'response' variable.
    const response: DeepResearchResponse = await (
      client as any
    ).responses.create({
      model: "o3-deep-research-2025-06-26",
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: system_message }],
        },
        { role: "user", content: [{ type: "input_text", text: user_query }] },
      ],
      reasoning: { summary: "auto" },
      tools: [{ type: "web_search_preview" }],
    });

    if (!response.output) {
      console.log("The API response did not contain an 'output' field.");
      return;
    }

    // --- Extract and Print Final Report ---
    const finalReportItem = response.output.find(
      (item) => item.type === "final_report",
    ) as FinalReport | undefined;
    const finalContent = finalReportItem?.content?.[0];

    if (!finalContent?.text) {
      console.log("No final report generated.");
      return;
    }

    const finalReportText = finalContent.text;
    console.log("FINAL REPORT:\n");
    console.log(finalReportText);
    console.log("\n" + "=".repeat(70) + "\n");

    // --- Process and Print Inline Citations ---
    console.log("CITATIONS:");
    const annotations = finalContent.annotations ?? [];

    if (annotations.length === 0) {
      console.log("No annotations found in the report.");
    } else {
      annotations.forEach((citation: Annotation, i: number) => {
        const citedText = finalReportText.slice(
          citation.start_index,
          citation.end_index,
        );
        console.log(`Citation ${i + 1}:`);
        console.log(`  Cited Text: "${citedText}"`);
        console.log(`  Title: ${citation.title}`);
        console.log(`  URL: ${citation.url}`);
        console.log(
          `  Location: chars ${citation.start_index}–${citation.end_index}\n`,
        );
      });
    }
    console.log("\n" + "=".repeat(70) + "\n");

    // --- Inspect and Print Intermediate Steps ---
    console.log("INTERMEDIATE STEPS:\n");

    const reasoningStep = response.output.find(
      (item) => item.type === "reasoning",
    ) as ReasoningStep | undefined;
    if (reasoningStep) {
      console.log("[Found a Reasoning Step]");
      reasoningStep.summary?.forEach((part) => console.log(`  - ${part.text}`));
    } else {
      console.log("No reasoning steps found.");
    }

    const searchStep = response.output.find(
      (item) => item.type === "web_search_call",
    ) as WebSearchCall | undefined;
    if (searchStep) {
      console.log("\n[Found a Web Search Call]");
      console.log(`  Query Executed: '${searchStep.action.query}'`);
      console.log(`  Status: ${searchStep.status}`);
    } else {
      console.log("\nNo web search steps found.");
    }

    const codeStep = response.output.find(
      (item) => item.type === "code_interpreter_call",
    ) as CodeInterpreterCall | undefined;
    if (codeStep) {
      console.log("\n[Found a Code Execution Step]");
      console.log("  Code Input:\n  ```python\n" + codeStep.input + "\n  ```");
      console.log(`  Code Output:\n  ${codeStep.output}`);
    } else {
      console.log("\nNo code execution steps found.");
    }
  } catch (error: any) {
    console.error("Error during deep research:", error.message || error);
  }
}

runDeepResearch().catch(console.error);
