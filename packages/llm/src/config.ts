import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config();
// In a monorepo, the cwd might be a package subdirectory, so check parent directories as well
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const LLMConfigSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required"),
});

export const llmConfig = LLMConfigSchema.parse(process.env);
