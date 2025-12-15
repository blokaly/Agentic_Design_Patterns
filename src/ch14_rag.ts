// This script demonstrates a Retrieval-Augmented Generation (RAG) pipeline using LangChain.js.
// It fetches a document, splits it into chunks, embeds them, and stores them in a Weaviate vector store.
// A LangGraph graph is then constructed to orchestrate the retrieval of relevant documents and generation of a response.

import { Document } from "@langchain/core/documents";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { WeaviateStore } from "@langchain/weaviate";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { z } from "zod";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { config } from "./config.js";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import weaviate from "weaviate-client";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { END, START, StateGraph } from "@langchain/langgraph"; // Modern v3+ client

// --- 0. Preparation, start docker in a command line console first
// docker run -p 8080:8080 -p 50051:50051 -e QUERY_DEFAULTS_LIMIT=10000 -e AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true -e DEFAULT_VECTORIZER_MODULE=none cr.weaviate.io/semitechnologies/weaviate:latest

// --- 1. Load Prompts and Define State ---

// Define a Zod schema for validating the prompts loaded from the YAML file.
const promptsSchema = z.object({
  template: z.string(),
});

// Load and parse the YAML file containing the prompt template.
const promptsData = promptsSchema.parse(
  yaml.load(fs.readFileSync("src/prompts/ch14_rag_prompts.yaml", "utf8")),
);

// Define the state for the LangGraph. This interface represents the data that will be passed between nodes.
interface RAGGraphState {
  question: string;
  documents: Document[];
  generation: string;
}

// Define a Zod schema for validating the RAGGraphState.
const RAGGraphStateSchema = z.object({
  question: z.string(),
  documents: z.array(z.any()), // Simplified for compatibility with StateGraph constructor
  generation: z.string(),
});

// --- 2. Main RAG Application Logic ---

const main = async () => {
  // Check if the OpenAI API key is set.
  if (!config.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY is not set. Please set it in your .env file.");
    return;
  }

  // --- 3. Data Preparation ---

  // Load the document from the local file.
  const loader = new TextLoader("./docs/state_of_the_union.txt");
  const documents = await loader.load();

  // Split the document into smaller chunks for processing.
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  const chunks = await textSplitter.splitDocuments(documents);

  // --- 4. Vector Store and Retriever Setup ---

  // Connect to local Docker Weaviate
  const client = await weaviate.connectToLocal({
    host: "localhost", // or "127.0.0.1"
    port: 8080,
    grpcPort: 50051, // Recommended for better performance
  });

  // Create a Weaviate vector store from the document chunks.
  const vectorStore = await WeaviateStore.fromDocuments(
    chunks,
    new OpenAIEmbeddings({ apiKey: config.OPENAI_API_KEY }),
    {
      client: client,
      indexName: "LangChain",
      textKey: "text", // Default, but explicit is good
    },
  );

  console.log(`Loaded ${chunks.length} chunks into vector store`);

  // Test similarity search
  // const results = await vectorStore.similaritySearch(
  //   "What did the president say about Justice Breyer",
  //   4,
  // );
  // console.log(results.map((doc) => doc.pageContent));

  // Create a retriever from the vector store.
  const retriever = vectorStore.asRetriever();

  // Initialize the language model.
  const llm = new ChatOpenAI({
    apiKey: config.OPENAI_API_KEY,
    model: "gpt-4o-mini",
    temperature: 0,
  });

  // --- 5. Define Graph Nodes ---

  // Node to retrieve documents based on the question.
  const retrieveDocumentsNode = async (
    state: RAGGraphState,
  ): Promise<Partial<RAGGraphState>> => {
    console.log("--- Retrieving Documents ---");
    const { question } = state;
    const documents = await retriever.invoke(question);
    return { documents, question, generation: "" };
  };

  // Node to generate a response based on the retrieved documents.
  const generateResponseNode = async (
    state: RAGGraphState,
  ): Promise<Partial<RAGGraphState>> => {
    console.log("--- Generating Response ---");
    const { question, documents } = state;
    const prompt = ChatPromptTemplate.fromTemplate(promptsData.template);
    const context = documents.map((doc) => doc.pageContent).join("\n\n");
    const ragChain = prompt.pipe(llm).pipe(new StringOutputParser());
    const generation = await ragChain.invoke({ context, question });
    return { documents, question, generation };
  };

  // --- 6. Build and Compile the Graph ---

  // Create a new StateGraph with the defined state schema.
  const workflow = new StateGraph(RAGGraphStateSchema)
    // Add the nodes to the graph.
    .addNode("retrieve", retrieveDocumentsNode)
    .addNode("generate", generateResponseNode)
    // Add the entry point for the graph.
    .addEdge(START, "retrieve");

  // Add edges to define the flow of the graph.
  workflow.addEdge("retrieve", "generate");
  workflow.addEdge("generate", END);

  // Compile the graph into a runnable application.
  const app = workflow.compile();

  // --- 7. Run the RAG Application ---

  // Helper function to run a query through the RAG application.
  const runQuery = async (query: string) => {
    console.log(`\n--- Running RAG Query for: "${query}" ---`);
    const inputs = { question: query };
    for await (const s of await app.stream(inputs)) {
      console.log(s);
    }
  };

  // Run two example queries.
  await runQuery("What did the president say about Justice Breyer");
  await runQuery("What did the president say about the economy?");
};

// --- 8. Execute the Main Function ---

main().catch((e) => console.error(e));
