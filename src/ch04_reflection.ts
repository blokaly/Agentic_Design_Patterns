import {
    ChatOpenAI
} from "@langchain/openai";
import {
    BaseMessage,
    HumanMessage,
    SystemMessage
} from "@langchain/core/messages";
import { config } from "./config.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import {ChatXAI} from "@langchain/xai";

// Zod schema for prompts
const promptsSchema = z.object({
    taskPrompt: z.string(),
    refinementPrompt: z.string(),
    reflectorPrompt: z.string(),
});

// Load and parse YAML
const promptsData = promptsSchema.parse(yaml.load(fs.readFileSync('src/prompts/ch04_reflection_prompts.yaml', 'utf8')));

const runReflectionLoop = async (taskllm: BaseChatModel, reflectionllm: BaseChatModel) => {
    /**
     * Demonstrates a multi-step AI reflection loop to progressively improve a Python function.
     */
    const maxIterations = 3;
    let currentCode = "";
    // We will build a conversation history to provide context in each step.
    const messageHistory: BaseMessage[] = [new HumanMessage(promptsData.taskPrompt)];

    for (let i = 0; i < maxIterations; i++) {
        console.log(`\n========================= REFLECTION LOOP: ITERATION ${i + 1} =========================`);

        // --- 1. GENERATE / REFINE STAGE ---
        let response: BaseMessage;
        if (i === 0) {
            console.log("\n>>> STAGE 1: GENERATING initial code...");
            // The first message is just the task prompt.
            response = await taskllm.invoke(messageHistory);
        } else {
            console.log("\n>>> STAGE 1: REFINING code based on previous critique...");
            // The message history now contains the task, the last code, and the last critique.
            // We instruct the model to apply the critiques.
            messageHistory.push(new HumanMessage(promptsData.refinementPrompt));
            response = await taskllm.invoke(messageHistory);
        }

        currentCode = response.content as string;
        console.log(`\n--- Generated Code (v${i + 1}) ---\n${currentCode}`);
        messageHistory.push(response); // Add the AIMessage to history

        // --- 2. REFLECT STAGE ---
        console.log("\n>>> STAGE 2: REFLECTING on the generated code...");

        // Create a specific prompt for the reflector agent.
        const reflectorPrompt = [
            new SystemMessage(promptsData.reflectorPrompt),
            new HumanMessage(`Original Task:\n${promptsData.taskPrompt}\n\nCode to Review:\n${currentCode}`)
        ];

        const critiqueResponse = await reflectionllm.invoke(reflectorPrompt);
        const critique = critiqueResponse.content as string;

        // --- 3. STOPPING CONDITION ---
        if (critique.includes("CODE_IS_PERFECT")) {
            console.log("\n--- Critique ---\nNo further critiques found. The code is satisfactory.");
            break;
        }

        console.log(`\n--- Critique ---\n${critique}`);
        // Add the critique to the history for the next refinement loop.
        messageHistory.push(new HumanMessage(`Critique of the previous code:\n${critique}`));
    }

    console.log("\n============================== FINAL RESULT ==============================");
    console.log("\nFinal refined code after the reflection process:\n");
    console.log(currentCode);
};

// --- Main Execution ---
const main = async () => {
    let openaillm: BaseChatModel;
    let xaillm: BaseChatModel;

    if (!config.OPENAI_API_KEY || !config.XAI_API_KEY) {
        console.log("OPENAI_API_KEY or XAI_API_KEY is not set. Using FakeListChatModel for mocking.");
        openaillm = new FakeListChatModel({
            responses: [
                // Iteration 1: Generation
                `def calculate_factorial(n):
  """Calculates the factorial of a non-negative integer."""
  if n == 0:
    return 1
  else:
    return n * calculate_factorial(n-1)`,
                // Iteration 1: Critique
                "- The code does not handle negative input. It will lead to infinite recursion. A ValueError should be raised. \\n - The docstring is a bit brief. It could be more descriptive.",
                // Iteration 2: Refinement
                `def calculate_factorial(n):
  """
  Calculates the factorial of a non-negative integer (n!).

  Args:
    n: A non-negative integer.

  Returns:
    The factorial of n.

  Raises:
    ValueError: If the input is a negative number.
  """
  if n < 0:
    raise ValueError("Input must be a non-negative integer.")
  if n == 0:
    return 1
  else:
    return n * calculate_factorial(n-1)`,
                // Iteration 2: Critique
                "CODE_IS_PERFECT"
            ]
        });
    xaillm = openaillm
    } else {
        console.log("OPENAI_API_KEY is set. Using ChatOpenAI.");
        // A lower temperature is used for more deterministic and focused outputs.
        openaillm = new ChatOpenAI({ apiKey: config.OPENAI_API_KEY, temperature: 0.1 });
        xaillm = new ChatXAI({
            apiKey: config.XAI_API_KEY,
            model: "grok-code-fast-1",
            temperature: 0.1

        });
    }

    await runReflectionLoop(openaillm, xaillm);
};

main().catch(console.error);
