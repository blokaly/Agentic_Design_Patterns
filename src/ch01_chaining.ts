import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnablePassthrough } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { config } from "./config.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { z } from "zod";
import { StringOutputParser } from "@langchain/core/output_parsers";

// Define Zod schema for prompts
const promptsSchema = z.object({
  promptExtract: z.object({
    template: z.string(),
  }),
  promptTransform: z.object({
    template: z.string(),
  }),
  formatInstructions: z.string(),
});

// Load and parse the YAML file
const promptsData = promptsSchema.parse(
  yaml.load(fs.readFileSync("src/prompts/ch01_chaining_prompts.yaml", "utf8")),
);

// Define Zod schema for the output
const techSpecSchema = z.object({
  cpu: z.string(),
  memory: z.string(),
  storage: z.string(),
});

// --- Prompt 1: Extract Information ---
const promptExtract = ChatPromptTemplate.fromTemplate(
  promptsData.promptExtract.template,
);

// --- Prompt 2: Transform to JSON ---
const promptTransform = ChatPromptTemplate.fromTemplate(
  promptsData.promptTransform.template + promptsData.formatInstructions,
);

/**
 * Main function to run the LangChain sequence.
 */
const runSpecificationChain = async (llm: BaseChatModel) => {
  // --- Build the Chain using LCEL ---

  // 1. Extraction Chain: Extracts raw specifications from text_input
  const extractionChain = promptExtract
    .pipe(llm)
    .pipe(new StringOutputParser());

  // 2. Full Chain: Combines the extraction and transformation steps.
  const fullChain = RunnablePassthrough.assign({
    specifications: extractionChain,
  })
    .pipe(promptTransform)
    .pipe(llm)
    .pipe(new StringOutputParser());

  // --- Run the Chain ---
  const inputText =
    "The new laptop model features a 3.5 GHz octa-core processor, 16GB of RAM, and a 1TB NVMe SSD.";

  // Execute the chain with the input text dictionary.
  const finalResultString = await fullChain.invoke({
    textInput: inputText,
  });

  const jsonString = finalResultString.replace(/```json\n|\n```/g, "");
  const finalResult = techSpecSchema.parse(JSON.parse(jsonString));

  console.log("\n--- Final JSON Output ---");
  console.log(finalResult);
};

// --- Main Execution ---
const main = async () => {
  let llm: BaseChatModel;

  if (!config.OPENAI_API_KEY) {
    console.log(
      "OPENAI_API_KEY is not set. Using FakeListChatModel for mocking.",
    );
    llm = new FakeListChatModel({
      responses: [
        "CPU: 3.5 GHz octa-core processor, Memory: 16GB of RAM, Storage: 1TB NVMe SSD",
        `\`\`\`json
{"cpu": "3.5 GHz octa-core processor", "memory": "16GB of RAM", "storage": "1TB NVMe SSD"}
\`\`\``,
      ],
    });
  } else {
    console.log("OPENAI_API_KEY is set. Using ChatOpenAI.");
    llm = new ChatOpenAI({ apiKey: config.OPENAI_API_KEY, temperature: 0 });
  }
  await runSpecificationChain(llm);
};

main().catch(console.error);
