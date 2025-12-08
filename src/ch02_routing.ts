import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnablePassthrough, RunnableBranch, RunnableLambda } from "@langchain/core/runnables";
import { config } from "./config.js";
import {BaseChatModel} from "@langchain/core/language_models/chat_models";

// --- Define Simulated Sub-Agent Handlers (equivalent to ADK sub_agents) ---

const booking_handler = (request: string): string => {
    console.log("\n--- DELEGATING TO BOOKING HANDLER ---");
    return `Booking Handler processed request: '${request}'. Result: Simulated booking action.`;
}

const info_handler = (request: string): string => {
    console.log("\n--- DELEGATING TO INFO HANDLER ---");
    return `Info Handler processed request: '${request}'. Result: Simulated information retrieval.`;
}

const unclear_handler = (request: string): string => {
    console.log("\n--- HANDLING UNCLEAR REQUEST ---");
    return `Coordinator could not delegate request: '${request}'. Please clarify.`;
}

// --- Define Coordinator Router Chain (equivalent to ADK coordinator's instruction) ---
// This chain decides which handler to delegate to.
const coordinator_router_prompt = ChatPromptTemplate.fromMessages([
    ["system", `Analyze the user's request and determine which specialist handler should process it.
     - If the request is related to booking flights or hotels, output 'booker'.
     - For all other general information questions, output 'info'.
     - If the request is unclear or doesn't fit either category, output 'unclear'.
     ONLY output one word: 'booker', 'info', or 'unclear'.`],
    ["user", "{request}"]
]);

// --- Example Usage ---
const main = async () => {
// --- Configuration ---
// Ensure your API key environment variable is set (e.g., OPENAI_API_KEY)
    let llm: BaseChatModel | null = null;
    try {
        llm = new ChatOpenAI({
            apiKey: config.OPENAI_API_KEY,
            temperature: 0
        });
        console.log(`Language model initialized: ChatOpenAI`);
    } catch (e) {
        console.log(`Error initializing language model: ${e}`);
    }

    if (!llm) {
        console.log("\nSkipping execution due to LLM initialization failure.");
        return;
    }

    const nonNullableLlm = llm; // TypeScript will now infer nonNullableLlm as BaseChatModel

    const coordinator_router_chain = coordinator_router_prompt.pipe(nonNullableLlm).pipe(new StringOutputParser());

    const delegation_branch = new RunnableBranch({
        branches: [
            [
                new RunnableLambda({
                    func: (x: { decision: string; request: { request: string } }) => x.decision.trim() === 'booker'
                }),
                RunnablePassthrough.assign({output: (x: { decision: string; request: { request: string } }) => booking_handler(x.request.request)})
            ],
            [
                new RunnableLambda({
                    func: (x: { decision: string; request: { request: string } }) => x.decision.trim() === 'info'
                }),
                RunnablePassthrough.assign({output: (x: { decision:string; request: { request: string } }) => info_handler(x.request.request)})
            ],
        ],
        default: RunnablePassthrough.assign({output: (x: { decision: string; request: { request: string } }) => unclear_handler(x.request.request)})
    });


    // Combine the router chain and the delegation branch into a single runnable
    // The router chain's output ('decision') is passed along with the original input ('request')
    // to the delegation_branch.
    const coordinator_agent = RunnablePassthrough.assign({
        decision: coordinator_router_chain,
        request: (input: { request: string }) => ({ request: input.request }) // Wrap the request string in an object
    })
    .pipe(delegation_branch)
    .pipe((x: { output: string }) => x.output);

    console.log("--- Running with a booking request ---");
    const request_a = "Book me a flight to London.";
    const result_a = await coordinator_agent.invoke({ "request": request_a });
    console.log(`Final Result A: ${result_a}`);

    console.log("\n--- Running with an info request ---");
    const request_b = "What is the capital of Italy?";
    const result_b = await coordinator_agent.invoke({ "request": request_b });
    console.log(`Final Result B: ${result_b}`);

    console.log("\n--- Running with an unclear request ---");
    const request_c = "Tell me about quantum physics.";
    const result_c = await coordinator_agent.invoke({ "request": request_c });
    console.log(`Final Result C: ${result_c}`);
}
main().catch(console.error);
