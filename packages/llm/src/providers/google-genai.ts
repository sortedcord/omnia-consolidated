import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ILLMProvider, LLMRequest, LLMResponse } from "../llm.js";

export class GeminiProvider implements ILLMProvider {
  providerName = "Gemini";
  private model: ChatGoogleGenerativeAI;

  constructor(apiKey: string) {
    this.model = new ChatGoogleGenerativeAI({
      apiKey,
      model: "gemini-3-flash",
    });
  }

  async generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>> {
    const structuredModel = this.model.withStructuredOutput(request.schema);
    const result = await structuredModel.invoke([
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userContext },
    ]);
    return { success: true, data: result as z.infer<T> };
  }
}
