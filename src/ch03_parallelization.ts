import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableParallel } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { config } from "./config.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { z } from "zod";

// Define Zod schemas
const messageSchema = z.object({
  type: z.string(),
  content: z.string(),
});
type Message = z.infer<typeof messageSchema>;

const promptsSchema = z.object({
  summarizePrompt: z.array(messageSchema),
  questionsPrompt: z.array(messageSchema),
  termsPrompt: z.array(messageSchema),
  synthesisPrompt: z.array(messageSchema),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const inputSchema = z.object({
  topic: z.string(),
});
type Input = z.infer<typeof inputSchema>;

// Load and parse the YAML file
const promptsData = promptsSchema.parse(
  yaml.load(
    fs.readFileSync("src/prompts/ch03_parallelization_prompts.yaml", "utf8"),
  ),
);

// --- Define Independent Chains ---
const runParallelExample = async (llm: BaseChatModel, topic: string) => {
  // These three chains represent distinct tasks that can be executed in parallel.
  const summarizeChain = ChatPromptTemplate.fromMessages(
    promptsData.summarizePrompt.map((msg: Message) => [msg.type, msg.content]),
  )
    .pipe(llm)
    .pipe(new StringOutputParser());

  const questionsChain = ChatPromptTemplate.fromMessages(
    promptsData.questionsPrompt.map((msg: Message) => [msg.type, msg.content]),
  )
    .pipe(llm)
    .pipe(new StringOutputParser());

  const termsChain = ChatPromptTemplate.fromMessages(
    promptsData.termsPrompt.map((msg: Message) => [msg.type, msg.content]),
  )
    .pipe(llm)
    .pipe(new StringOutputParser());

  // --- Build the Parallel + Synthesis Chain ---

  // 1. Define the block of tasks to run in parallel. The results of these,
  //    along with the original topic, will be fed into the next step.
  const mapChain = RunnableParallel.from({
    summary: summarizeChain,
    questions: questionsChain,
    keyTerms: termsChain,
    topic: (input: Input) => input.topic,
  });

  // 2. Define the final synthesis prompt which will combine the parallel results.
  const synthesisPrompt = ChatPromptTemplate.fromMessages(
    promptsData.synthesisPrompt.map((msg: Message) => [msg.type, msg.content]),
  );

  // 3. Construct the full chain by piping the parallel results directly
  //    into the synthesis prompt, followed by the LLM and output parser.
  const fullParallelChain = mapChain
    .pipe(synthesisPrompt)
    .pipe(llm)
    .pipe(new StringOutputParser());

  // --- Run the Chain ---
  console.log(
    `\n--- Running Parallel LangChain Example for Topic: '${topic}' ---`,
  );
  try {
    // The input to `invoke` is the single 'topic' string, which is
    // then passed to each runnable in the `mapChain`.
    const response = await fullParallelChain.invoke({ topic });
    console.log("\n--- Final Response ---");
    console.log(response);
  } catch (e) {
    console.log(`\nAn error occurred during chain execution: ${e}`);
  }
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
        "A concise summary of space exploration.",
        "1. What was the Space Race? 2. Who was the first person in space? 3. What is the future of space exploration?",
        "NASA, Sputnik, Apollo, Space Race, ISS",
        "A synthesized answer about the history of space exploration, combining the summary, questions, and key terms.",
      ],
    });
  } else {
    console.log("OPENAI_API_KEY is set. Using ChatOpenAI.");
    llm = new ChatOpenAI({ apiKey: config.OPENAI_API_KEY, temperature: 0.7 });
  }

  if (!llm) {
    console.log("LLM not initialized. Cannot run example.");
    return;
  }

  const testTopic = "The history of space exploration";
  await runParallelExample(llm, testTopic);
};

main().catch(console.error);
