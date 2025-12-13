import { ChatOpenAI } from "@langchain/openai";
import { config } from "./config.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { promises as fs } from "fs";
import * as path from "path";
import { BaseMessage } from "@langchain/core/messages";
import * as yaml from "js-yaml";
import { z } from "zod";
import { PromptTemplate } from "@langchain/core/prompts";

// ✅ Initialize OpenAI model
console.log("📡 Initializing OpenAI LLM (gpt-4o)...");
const llm = new ChatOpenAI({
  model: "gpt-4o", // If you dont have access to gpt-4o use other OpenAI LLMs
  temperature: 0.3,
  apiKey: config.OPENAI_API_KEY,
});

// Zod schema for prompts
const promptsSchema = z.object({
  generatePrompt: z.string(),
  refinePrompt: z.string(),
  feedbackPrompt: z.string(),
  endPrompt: z.string(),
  getCodeFeedback: z.string(),
  goalsMet: z.string(),
  saveCodeToFile: z.string(),
});

// Load and parse YAML
const promptsData = promptsSchema.parse(
  yaml.load(
    await fs.readFile("src/prompts/ch11_goal_setting_prompts.yaml", "utf8"),
  ),
);

// --- Utility Functions ---

const generatePrompt = (
  useCase: string,
  goals: string[],
  previousCode = "",
  feedback = "",
): string => {
  console.log("📝 Constructing prompt for code generation...");
  let basePrompt = promptsData.generatePrompt
    .replace("{useCase}", useCase)
    .replace("{goals}", goals.map((g) => `- ${g.trim()}`).join("\n"));

  if (previousCode) {
    console.log("🔄 Adding previous code to the prompt for refinement.");
    basePrompt +=
      "\n" + promptsData.refinePrompt.replace("{previousCode}", previousCode);
  }
  if (feedback) {
    console.log("📋 Including feedback for revision.");
    basePrompt +=
      "\n" + promptsData.feedbackPrompt.replace("{feedback}", feedback);
  }

  basePrompt += "\n" + promptsData.endPrompt;
  return basePrompt;
};

const getCodeFeedback = async (
  model: BaseChatModel,
  code: string,
  goals: string[],
): Promise<string> => {
  console.log("🔍 Evaluating code against the goals...");
  const feedbackPrompt = await new PromptTemplate({
    template: promptsData.getCodeFeedback,
    inputVariables: ["goals", "code"],
  }).format({
    goals: goals.map((g) => `- ${g.trim()}`).join("\n"),
    code,
  });
  const response = await model.invoke(feedbackPrompt);
  return response.content.toString();
};

const goalsMet = async (
  model: BaseChatModel,
  feedbackText: string,
  goals: string[],
): Promise<boolean> => {
  const reviewPrompt = await new PromptTemplate({
    template: promptsData.goalsMet,
    inputVariables: ["goals", "feedbackText"],
  }).format({
    goals: goals.map((g) => `- ${g.trim()}`).join("\n"),
    feedbackText,
  });
  const response = await model.invoke(reviewPrompt);
  return response.content.toString().trim().toLowerCase() === "true";
};

const cleanCodeBlock = (code: string): string => {
  const lines = code.trim().split("\n");
  if (lines.length > 0 && lines[0].trim().startsWith("```")) {
    lines.shift();
  }
  if (lines.length > 0 && lines[lines.length - 1].trim() === "```") {
    lines.pop();
  }
  return lines.join("\n").trim();
};

const addCommentHeader = (code: string, useCase: string): string => {
  const comment = `# This Python program implements the following use case:\n# ${useCase.trim()}\n`;
  return `${comment}\n${code}`;
};

const saveCodeToFile = async (
  model: BaseChatModel,
  code: string,
  useCase: string,
): Promise<string> => {
  console.log("💾 Saving final code to file...");

  const summaryPrompt = promptsData.saveCodeToFile.replace(
    "{useCase}",
    useCase,
  );
  const rawSummary = (await model.invoke(summaryPrompt)).content
    .toString()
    .trim();
  const shortName = rawSummary
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/ /g, "_")
    .toLowerCase()
    .substring(0, 10);

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const filename = `${shortName}_${randomSuffix}.py`;
  const filepath = path.join(process.cwd(), filename);

  await fs.writeFile(filepath, code);

  console.log(`✅ Code saved to: ${filepath}`);
  return filepath;
};

// --- Main Agent Function ---

const runCodeAgent = async (
  model: BaseChatModel,
  useCase: string,
  goalsInput: string,
  maxIterations = 5,
): Promise<string> => {
  const goals = goalsInput.split(",").map((g) => g.trim());

  console.log(`\n🎯 Use Case: ${useCase}`);
  console.log("🎯 Goals:");
  goals.forEach((g) => console.log(`  - ${g}`));

  let previousCode = "";
  let feedback = "";
  let code = "";

  for (let i = 0; i < maxIterations; i++) {
    console.log(`\n=== 🔁 Iteration ${i + 1} of ${maxIterations} ===`);
    const prompt = generatePrompt(useCase, goals, previousCode, feedback);

    console.log("🚧 Generating code...");
    const codeResponse: BaseMessage = await model.invoke(prompt);
    const rawCode = codeResponse.content.toString().trim();
    code = cleanCodeBlock(rawCode);
    console.log(
      "\n🧾 Generated Code:\n" +
        "-".repeat(50) +
        `\n${code}\n` +
        "-".repeat(50),
    );

    console.log("\n📤 Submitting code for feedback review...");
    const feedbackText = await getCodeFeedback(model, code, goals);
    console.log(
      "\n📥 Feedback Received:\n" +
        "-".repeat(50) +
        `\n${feedbackText}\n` +
        "-".repeat(50),
    );

    if (await goalsMet(model, feedbackText, goals)) {
      console.log("✅ LLM confirms goals are met. Stopping iteration.");
      break;
    }

    console.log("🛠️ Goals not fully met. Preparing for next iteration...");
    previousCode = code;
    feedback = feedbackText;
  }

  const finalCode = addCommentHeader(code, useCase);
  return saveCodeToFile(model, finalCode, useCase);
};

// --- CLI Test Run ---

const main = async () => {
  if (!config.OPENAI_API_KEY) {
    console.error("❌ Please set the OPENAI_API_KEY environment variable.");
    return;
  }

  console.log("\n🧠 Welcome to the AI Code Generation Agent");

  // Example 1
  const useCaseInput1 =
    "Write code to find BinaryGap of a given positive integer";
  const goalsInput1 =
    "Code simple to understand, Functionally correct, Handles comprehensive edge cases, Takes positive integer input only, prints the results with few examples";
  await runCodeAgent(llm, useCaseInput1, goalsInput1);

  // Example 2
  // const useCaseInput2 = "Write code to count the number of files in current directory and all its nested sub directories, and print the total count";
  // const goalsInput2 = "Code simple to understand, Functionally correct, Handles comprehensive edge cases, Ignore recommendations for performance, Ignore recommendations for test suite use like unittest or pytest";
  // await runCodeAgent(llm, useCaseInput2, goalsInput2);

  // Example 3
  // const useCaseInput3 = "Write code which takes a command line input of a word doc or docx file and opens it and counts the number of words, and characters in it and prints all";
  // const goalsInput3 = "Code simple to understand, Functionally correct, Handles edge cases";
  // await runCodeAgent(llm, useCaseInput3, goalsInput3);
};

main().catch(console.error);
