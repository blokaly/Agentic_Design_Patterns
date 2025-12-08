import {ChatOpenAI} from "@langchain/openai";
import {ChatPromptTemplate,} from "@langchain/core/prompts";
import {StringOutputParser} from "@langchain/core/output_parsers";
import {RunnablePassthrough} from "@langchain/core/runnables";
import {config} from "./config.js";

/**
 * Main function to run the LangChain sequence.
 */
const runSpecificationChain = async () => {
    // Initialize the Language Model (using ChatOpenAI is recommended)
    // temperature: 0 is set for deterministic and factual extraction/transformation.
    const llm = new ChatOpenAI({apiKey: config.OPENAI_API_KEY, temperature: 0});

    // --- Prompt 1: Extract Information ---
    const promptExtract = ChatPromptTemplate.fromTemplate(
        "Extract the technical specifications from the following text:\n\n{text_input}"
    );

    // --- Prompt 2: Transform to JSON ---
    const promptTransform = ChatPromptTemplate.fromTemplate(
        "Transform the following specifications into a JSON object with 'cpu', 'memory', and 'storage' as keys:\n\n{specifications}"
    );

    // --- Build the Chain using LCEL ---

    // 1. Extraction Chain: Extracts raw specifications from text_input
    // The StringOutputParser() converts the LLM's message output to a simple string.
    const extractionChain = promptExtract.pipe(llm).pipe(new StringOutputParser());

    // 2. Full Chain: Combines the extraction and transformation steps.
    // The output of the extractionChain (the specifications string) is passed
    // into the 'specifications' key for the transformation prompt.

    // RunnablePassthrough.assign is used to create a new object.
    // We use RunnablePassthrough.assign to call extractionChain and assign its result to the 'specifications' key.
    const fullChain = RunnablePassthrough.assign({
        specifications: extractionChain,
    })
        .pipe(promptTransform)
        .pipe(llm)
        .pipe(new StringOutputParser());

    // --- Run the Chain ---
    const input_text =
        "The new laptop model features a 3.5 GHz octa-core processor, 16GB of RAM, and a 1TB NVMe SSD.";

    // Execute the chain with the input text dictionary.
    const finalResult = await fullChain.invoke({
        text_input: input_text,
    });

    console.log("\n--- Final JSON Output ---");
    console.log(finalResult);
}

runSpecificationChain().catch(console.error);