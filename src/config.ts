import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]),
    OPENAI_API_KEY: z.string().optional(),
    XAI_API_KEY: z.string().optional()
});

export const config = schema.parse(process.env);
