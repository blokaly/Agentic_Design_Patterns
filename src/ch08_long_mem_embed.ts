import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { config } from "./config.js";

// --- 1. Define Documents and Query ---
const trainingDocuments = [
  new Document({
    pageContent:
      "The key to a good RAG system is quality, relevant documents and a strong embedding model.",
    metadata: { source: "LangChain Blog" },
  }),
  new Document({
    pageContent:
      "Embedding models convert text into high-dimensional vectors that capture semantic meaning.",
    metadata: { source: "ML Glossary" },
  }),
  new Document({
    pageContent:
      "The text-embedding-3-small model is recommended for its balance of cost and performance.",
    metadata: { source: "OpenAI Docs" },
  }),
  new Document({
    pageContent: "If the sky is red, it may mean a sunset or sunrise.",
    metadata: { source: "Nature Facts" },
  }),
];

const userQuery = "What makes a RAG system effective?";

const main = async () => {
  try {
    console.log("--- Starting RAG Workflow Example ---");

    // --- 2. Initialize Embeddings and Vector Store ---
    // The model reads OPENAI_API_KEY from environment variables
    const embeddings = new OpenAIEmbeddings({
      apiKey: config.OPENAI_API_KEY,
      model: "text-embedding-3-small",
      dimensions: 256,
    });

    // --- 3. Generate Embeddings and Save to Store (Indexing) ---
    console.log("\n[1/3] Indexing documents and saving embeddings...");
    // The 'fromDocuments' method handles generating embeddings for all documents
    // and storing them in the MemoryVectorStore.
    const vectorStore = await MemoryVectorStore.fromDocuments(
      trainingDocuments,
      embeddings,
    );
    console.log(
      `✅ Indexed ${trainingDocuments.length} documents successfully.`,
    );

    //

    // --- 4. Generate Embedding for the Query and Search the Store (Retrieval) ---
    console.log(
      `\n[2/3] Searching for context similar to query: "${userQuery}"`,
    );

    // The similaritySearch method internally converts the 'userQuery' into an
    // embedding vector using the 'embeddings' instance we provided, and then
    // finds the closest vectors in the store.

    const relevantDocuments = await vectorStore.similaritySearch(userQuery, 2); // Retrieve top 2 results

    console.log("✅ Search complete. Found the following relevant documents:");

    // --- 5. Display Results ---
    relevantDocuments.forEach((doc, index) => {
      console.log(`\n--- Result ${index + 1} ---`);
      console.log(`Content: ${doc.pageContent}`);
      console.log(`Source: ${doc.metadata.source}`);
      // Note: The retrieval result shows high semantic similarity to the query.
    });

    console.log(
      "\n[3/3] Retrieval complete. These documents would then be passed to an LLM for generation.",
    );
  } catch (error) {
    console.error("An error occurred during the RAG example:", error);
  }
};

main().catch(console.error);
