import { z } from "zod";
import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  LLMCallRecord,
} from "./llm.js";
import { ProviderManager } from "./provider-manager.js";
import { getLlmConfig } from "./config.js";

export interface ResolvedCredentials {
  key: string | undefined;
  model: string | undefined;
  providerInstanceName: string | undefined;
  maxContext: number | undefined;
}

export function resolveCredentials(opts: {
  explicitKey?: string;
  explicitModel?: string;
  explicitProviderInstanceName?: string;
  explicitMaxContext?: number;
  providerId: string;
  envVarName: string;
  type: "generative" | "embedding";
}): ResolvedCredentials {
  let key = opts.explicitKey;
  let model = opts.explicitModel;
  let providerInstanceName = opts.explicitProviderInstanceName;
  let maxContext = opts.explicitMaxContext;

  if (!key) {
    const active = ProviderManager.getActive(opts.type);
    if (active && active.providerName === opts.providerId) {
      key = active.apiKey;
      if (!model) model = active.modelName;
      if (!providerInstanceName) providerInstanceName = active.name;
      if (maxContext === undefined) maxContext = active.maxContext;
    }
  }

  if (!key) {
    const cfg = getLlmConfig();
    key = cfg[opts.envVarName];
    if (!providerInstanceName && key) {
      providerInstanceName = "Environment Variable";
    }
  }

  return { key, model, providerInstanceName, maxContext };
}

export abstract class BaseLLMProvider implements ILLMProvider {
  abstract providerName: string;
  protected abstract readonly model: unknown;
  protected abstract modelNameUsed: string;
  protected abstract providerInstanceName?: string;
  protected abstract maxContextUsed?: number;
  protected abstract defaultMaxContext: number;
  lastCalls: LLMCallRecord[] = [];

  async generateStructuredResponse<T extends z.ZodTypeAny>(
    request: LLMRequest<T>,
  ): Promise<LLMResponse<z.infer<T>>> {
    const structuredModel = (
      this.model as {
        withStructuredOutput(
          s: z.ZodTypeAny,
          o: { includeRaw: true },
        ): {
          invoke(m: unknown): Promise<unknown>;
        };
      }
    ).withStructuredOutput(request.schema, { includeRaw: true });
    const result = (await structuredModel.invoke([
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userContext },
    ])) as unknown as {
      parsed?: z.infer<T>;
      raw?: {
        usage_metadata?: {
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
        };
      };
    };

    const parsed = result?.parsed;
    const raw = result?.raw;

    const usage = {
      inputTokens: raw?.usage_metadata?.input_tokens || 0,
      outputTokens: raw?.usage_metadata?.output_tokens || 0,
      totalTokens: raw?.usage_metadata?.total_tokens || 0,
      modelName: this.modelNameUsed,
      providerInstanceName: this.providerInstanceName || "Default",
      maxContext:
        this.maxContextUsed !== undefined
          ? this.maxContextUsed
          : this.defaultMaxContext,
    };

    this.lastCalls.push({
      systemPrompt: request.systemPrompt,
      userContext: request.userContext,
      usage,
      response: parsed,
    });

    return { success: true, data: parsed, usage };
  }
}
