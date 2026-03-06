import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { config } from "./config.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import * as fs from "fs";
import * as yaml from "js-yaml";

// --- 1. Task Management System ---

interface ITask {
  id: string;
  description: string;
  priority?: string; // P0, P1, P2
  assignedTo?: string; // Name of the worker
}

class SuperSimpleTaskManager {
  private tasks: Map<string, ITask> = new Map();
  private nextTaskId = 1;

  createTask(description: string): ITask {
    const taskId = `TASK-${this.nextTaskId.toString().padStart(3, "0")}`;
    const newTask: ITask = { id: taskId, description };
    this.tasks.set(taskId, newTask);
    this.nextTaskId += 1;
    console.log(`DEBUG: Task created - ${taskId}: ${description}`);
    return newTask;
  }

  updateTask(
    taskId: string,
    updates: Partial<Omit<ITask, "id">>,
  ): ITask | undefined {
    const task = this.tasks.get(taskId);
    if (task) {
      const updatedTask = { ...task, ...updates };
      this.tasks.set(taskId, updatedTask);
      console.log(
        `DEBUG: Task ${taskId} updated with ${JSON.stringify(updates)}`,
      );
      return updatedTask;
    }
    console.log(`DEBUG: Task ${taskId} not found for update.`);
    return undefined;
  }

  listAllTasks(): string {
    if (this.tasks.size === 0) {
      return "No tasks in the system.";
    }

    const taskStrings: string[] = [];
    for (const task of this.tasks.values()) {
      taskStrings.push(
        `ID: ${task.id}, Desc: '${task.description}', ` +
          `Priority: ${task.priority || "N/A"}, ` +
          `Assigned To: ${task.assignedTo || "N/A"}`,
      );
    }
    return "Current Tasks:\n" + taskStrings.join("\n");
  }
}

const taskManager = new SuperSimpleTaskManager();

// --- 2. Zod Schema for Prompts and Tools ---

const promptsSchema = z.object({
  systemMessage: z.string(),
  createNewTaskTool: z.object({
    description: z.string(),
    schema: z.object({
      description: z.object({ describe: z.string() }),
    }),
  }),
  assignPriorityToTaskTool: z.object({
    description: z.string(),
    schema: z.object({
      taskId: z.object({ describe: z.string() }),
      priority: z.object({ describe: z.string() }),
    }),
  }),
  assignTaskToWorkerTool: z.object({
    description: z.string(),
    schema: z.object({
      taskId: z.object({ describe: z.string() }),
      workerName: z.object({ describe: z.string() }),
    }),
  }),
  listAllTasksTool: z.object({
    description: z.string(),
  }),
});

// Load prompts from external YAML file
const promptsData = promptsSchema.parse(
  yaml.load(
    fs.readFileSync("src/prompts/ch20_prioritization_prompts.yaml", "utf8"),
  ),
);

// --- 3. Define Tools ---

const createNewTaskTool = tool(
  async ({ description }: { description: string }) => {
    const task = taskManager.createTask(description);
    return `Created task ${task.id}: '${task.description}'.`;
  },
  {
    name: "create_new_task",
    description: promptsData.createNewTaskTool.description,
    schema: z.object({
      description: z
        .string()
        .describe(promptsData.createNewTaskTool.schema.description.describe),
    }),
  },
);

const assignPriorityToTaskTool = tool(
  async ({ taskId, priority }: { taskId: string; priority: string }) => {
    if (!["P0", "P1", "P2"].includes(priority)) {
      return "Invalid priority. Must be P0, P1, or P2.";
    }
    const task = taskManager.updateTask(taskId, { priority });
    return task
      ? `Assigned priority ${priority} to task ${task.id}.`
      : `Task ${taskId} not found.`;
  },
  {
    name: "assign_priority_to_task",
    description: promptsData.assignPriorityToTaskTool.description,
    schema: z.object({
      taskId: z
        .string()
        .describe(promptsData.assignPriorityToTaskTool.schema.taskId.describe),
      priority: z
        .string()
        .describe(
          promptsData.assignPriorityToTaskTool.schema.priority.describe,
        ),
    }),
  },
);

const assignTaskToWorkerTool = tool(
  async ({ taskId, workerName }: { taskId: string; workerName: string }) => {
    const task = taskManager.updateTask(taskId, { assignedTo: workerName });
    return task
      ? `Assigned task ${task.id} to ${workerName}.`
      : `Task ${taskId} not found.`;
  },
  {
    name: "assign_task_to_worker",
    description: promptsData.assignTaskToWorkerTool.description,
    schema: z.object({
      taskId: z
        .string()
        .describe(promptsData.assignTaskToWorkerTool.schema.taskId.describe),
      workerName: z
        .string()
        .describe(
          promptsData.assignTaskToWorkerTool.schema.workerName.describe,
        ),
    }),
  },
);

const listAllTasksTool = tool(
  async () => {
    return taskManager.listAllTasks();
  },
  {
    name: "list_all_tasks",
    description: promptsData.listAllTasksTool.description,
    schema: z.object({}),
  },
);

const tools = [
  createNewTaskTool,
  assignPriorityToTaskTool,
  assignTaskToWorkerTool,
  listAllTasksTool,
];

// --- 4. Agent Logic and Execution ---

const runSimulation = async (agentExecutor: any) => {
  console.log("--- Project Manager Simulation ---");

  // Scenario 1: Handle a new, urgent feature request
  const query1 =
    "Create a task to implement a new login system. It's urgent and should be assigned to Worker B.";
  console.log(`\n[User Request] ${query1}`);
  const response1 = await agentExecutor.invoke({
    messages: [
      { role: "system", content: promptsData.systemMessage },
      { role: "user", content: query1 },
    ],
  });
  console.log("\n--- Final Agent Response (Scenario 1) ---");
  console.log(response1.messages.at(-1).content);

  console.log("\n" + "-".repeat(60) + "\n");

  // Scenario 2: Handle a less urgent content update with fewer details
  const query2 = "Manage a new task: Review marketing website content.";
  console.log(`[User Request] ${query2}`);
  const response2 = await agentExecutor.invoke({
    messages: [
      { role: "system", content: promptsData.systemMessage },
      { role: "user", content: query2 },
    ],
  });
  console.log("\n--- Final Agent Response (Scenario 2) ---");
  console.log(response2.messages.at(-1).content);

  console.log("\n--- Simulation Complete ---");
};

const main = async () => {
  const model: BaseChatModel = new ChatOpenAI({
    apiKey: config.OPENAI_API_KEY || "dummy-key",
    temperature: 0.5,
    modelName: "gpt-4o-mini",
  });

  if (!config.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY is not set. Using a dummy key.");
  }

  console.log(`✅ Language model initialized`);

  const agentExecutor = createAgent({
    model,
    tools,
  });

  await runSimulation(agentExecutor);
};

main().catch(console.error);
