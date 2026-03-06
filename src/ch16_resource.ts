import OpenAI from "openai";
import { config } from "./config.js";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { z } from "zod";

// --- Step 1: Define Interfaces and Schemas ---

const promptsSchema = z.object({
  classifySystemMessage: z.string(),
  internetSearchPrompt: z.string(),
});

interface IClassification {
  classification: "simple" | "reasoning" | "internet_search";
}

interface ISearchResult {
  title?: string;
  snippet?: string;
  link?: string;
}

interface IHandlePromptResult {
  classification: string;
  response: string;
  model: string;
}

// Load and parse the YAML file
const promptsData = promptsSchema.parse(
  yaml.load(fs.readFileSync("src/prompts/ch16_resource_prompts.yaml", "utf8")),
);

// Initialize OpenAI client
const client = new OpenAI.OpenAI({ apiKey: config.OPENAI_API_KEY });

// --- Step 2: Classify the Prompt ---

/**
 * Uses a small, fast model to classify the user's prompt.
 */
async function classifyPrompt(prompt: string): Promise<IClassification> {
  console.log(`\n🔍 Classifying prompt: "${prompt}"`);

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: promptsData.classifySystemMessage },
      { role: "user", content: prompt },
    ],
    temperature: 1,
  });

  const reply =
    response.choices[0].message.content || '{ "classification": "simple" }';
  // Strip code blocks if present
  const cleanReply = reply.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleanReply) as IClassification;
}

// --- Step 3: Google Search ---

/**
 * Performs a search using Google Custom Search API.
 */
async function googleSearch(
  query: string,
  numResults = 1,
): Promise<ISearchResult[]> {
  console.log(`\n🌐 Searching internet for: "${query}"`);

  if (!config.GOOGLE_CUSTOM_SEARCH_API_KEY || !config.GOOGLE_CSE_ID) {
    console.error("Missing Google Search configuration.");
    return [];
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.append("key", config.GOOGLE_CUSTOM_SEARCH_API_KEY);
  url.searchParams.append("cx", config.GOOGLE_CSE_ID);
  url.searchParams.append("q", query);
  url.searchParams.append("num", numResults.toString());

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Google Search API error: ${response.statusText}`);
    }
    const data = (await response.json()) as any;

    if (data.items && Array.isArray(data.items)) {
      return data.items.map((item: any) => ({
        title: item.title,
        snippet: item.snippet,
        link: item.link,
      }));
    }
    return [];
  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
}

// --- Step 4: Generate Response ---

/**
 * Routes to the appropriate model based on classification.
 */
async function generateResponse(
  prompt: string,
  classification: string,
  searchResults: ISearchResult[] | null = null,
): Promise<[string, string]> {
  let model: string;
  let fullPrompt: string;

  if (classification === "simple") {
    model = "gpt-4o-mini";
    fullPrompt = prompt;
  } else if (classification === "reasoning") {
    // Note: Using o4-mini as per original python source
    model = "o4-mini";
    fullPrompt = prompt;
  } else if (classification === "internet_search") {
    model = "gpt-4o";
    const searchContext = searchResults
      ? searchResults
          .map(
            (item) =>
              `Title: ${item.title}\nSnippet: ${item.snippet}\nLink: ${item.link}`,
          )
          .join("\n\n")
      : "No search results found.";

    fullPrompt = promptsData.internetSearchPrompt
      .replace("{searchContext}", searchContext)
      .replace("{prompt}", prompt);
  } else {
    model = "gpt-4o-mini";
    fullPrompt = prompt;
  }

  console.log(`\n🤖 Generating response with model: ${model}`);

  const response = await client.chat.completions.create({
    model: model,
    messages: [{ role: "user", content: fullPrompt }],
    temperature: 1,
  });

  return [response.choices[0].message.content || "", model];
}

// --- Step 5: Combined Router ---

/**
 * Handles the complete prompt processing lifecycle.
 */
export async function handlePrompt(
  prompt: string,
): Promise<IHandlePromptResult> {
  const classificationResult = await classifyPrompt(prompt);
  const classification = classificationResult.classification;

  let searchResults: ISearchResult[] | null = null;
  if (classification === "internet_search") {
    searchResults = await googleSearch(prompt);
  }

  const [answer, model] = await generateResponse(
    prompt,
    classification,
    searchResults,
  );
  return { classification, response: answer, model };
}

// --- Step 6: Main Execution ---

const main = async () => {
  // Check for required configuration
  if (!config.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set. Please set it in your .env file.",
    );
    process.exit(1);
  }

  const queries = [
    "What is the capital of Australia?", // simple
    "Explain the impact of quantum computing on cryptography.", // reasoning
    "When does the Australian Open 2026 start, and when does it end, give me full date with year?", // internet_search
  ];

  for (const query of queries) {
    try {
      const result = await handlePrompt(query);
      console.log("\n--- Final Result ---");
      console.log(`Classification: ${result.classification}`);
      console.log(`Model Used:     ${result.model}`);
      console.log(`Response:\n${result.response}`);
      console.log("-".repeat(50));
    } catch (error) {
      console.error(`Error processing query "${query}":`, error);
    }
  }
};

// Only run main if this is the entry file
if (import.meta.url.endsWith(process.argv[1])) {
  main().catch(console.error);
}
