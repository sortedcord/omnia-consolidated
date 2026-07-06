import { z } from "zod";

const LLMConfigSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required"),
});

export const llmConfig = LLMConfigSchema.parse(process.env);
