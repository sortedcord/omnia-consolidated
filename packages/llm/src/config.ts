import { z } from "zod";

const LLMConfigSchema = z.object({
  GOOGLE_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
});

export const llmConfig = LLMConfigSchema.parse(process.env);
