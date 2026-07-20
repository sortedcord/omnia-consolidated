"use client";

import { useEffect, useState } from "react";
import type { SimSnapshot, PromptBreakdown } from "@/lib/simulation-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { PromptSwitcher } from "@/components/play/PromptSwitcher";
import { PromptAnalyzer } from "@/components/play/PromptAnalyzer";

interface PromptModalProps {
  entry: SimSnapshot["log"][number];
  onClose: () => void;
}

export function PromptModal({ entry, onClose }: PromptModalProps) {
  const [activeTab, setActiveTab] = useState<string>("actor");

  useEffect(() => {
    if (!entry.rawPrompt && entry.decoderPrompt) {
      setActiveTab("decoder");
    }
  }, [entry]);

  // Helper to resolve components with a fallback if none exist (for backwards-compatibility)
  const getComponents = (
    promptBreakdown: PromptBreakdown | null | undefined,
    defaultType: "world" | "input",
  ) => {
    if (!promptBreakdown) return [];
    if (promptBreakdown.components && promptBreakdown.components.length > 0) {
      return promptBreakdown.components;
    }
    // Fallback: convert flat strings into components list
    return [
      {
        label: "System Prompt",
        type: "system" as const,
        content: promptBreakdown.systemPrompt || "",
      },
      {
        label: "User Context",
        type: defaultType,
        content: promptBreakdown.userContext || "",
      },
    ];
  };

  const actorComponents = getComponents(entry.rawPrompt, "world");
  const decoderComponents = getComponents(entry.decoderPrompt, "input");

  const isValidatorTab = activeTab.startsWith("validator-");
  const validatorIndex = isValidatorTab
    ? parseInt(activeTab.substring("validator-".length), 10)
    : -1;
  const validatorCall = isValidatorTab
    ? entry.validatorCalls?.find((c) => c.intentIndex === validatorIndex)
    : null;
  const validatorComponents = validatorCall
    ? getComponents(validatorCall.prompt, "world")
    : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-187.5 sm:max-w-187.5 h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-lg">
            Raw Prompts & Token Usage ({entry.entityName})
          </DialogTitle>
        </DialogHeader>

        <PromptSwitcher
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasActor={!!entry.rawPrompt}
          hasDecoder={!!entry.decoderPrompt}
          validatorCalls={
            entry.validatorCalls?.map((c) => ({
              intentIndex: c.intentIndex,
              intentContent: c.intentContent,
            })) || []
          }
        />

        <div className="overflow-y-auto flex-1 p-5">
          {activeTab === "actor" && entry.rawPrompt && (
            <PromptAnalyzer
              components={actorComponents}
              inputTokens={entry.usage?.inputTokens || 0}
              maxContext={
                entry.usage?.maxContext !== undefined
                  ? entry.usage.maxContext
                  : 32768
              }
              modelName={entry.usage?.modelName}
              providerInstanceName={entry.usage?.providerInstanceName}
              outputLabel="LLM Output (Narrative Prose)"
              outputText={entry.narrativeProse}
              outputTokens={entry.usage?.outputTokens}
            />
          )}

          {activeTab === "decoder" && entry.decoderPrompt && (
            <PromptAnalyzer
              components={decoderComponents}
              inputTokens={entry.decoderUsage?.inputTokens || 0}
              maxContext={
                entry.decoderUsage?.maxContext !== undefined
                  ? entry.decoderUsage.maxContext
                  : 32768
              }
              modelName={entry.decoderUsage?.modelName}
              providerInstanceName={entry.decoderUsage?.providerInstanceName}
              outputLabel="LLM Output (Decoded Intent Sequence)"
              outputText={JSON.stringify(
                entry.decodedIntents || entry.intents,
                null,
                2,
              )}
              outputTokens={entry.decoderUsage?.outputTokens}
            />
          )}

          {validatorCall && validatorCall.prompt && (
            <PromptAnalyzer
              components={validatorComponents}
              inputTokens={validatorCall.usage?.inputTokens || 0}
              maxContext={
                validatorCall.usage?.maxContext !== undefined
                  ? validatorCall.usage.maxContext
                  : 32768
              }
              modelName={validatorCall.usage?.modelName}
              providerInstanceName={validatorCall.usage?.providerInstanceName}
              outputLabel={`LLM Output`}
              outputText={JSON.stringify(validatorCall.response, null, 2)}
              outputTokens={validatorCall.usage?.outputTokens}
            />
          )}

          {validatorCall && !validatorCall.prompt && (
            <div className="flex flex-col items-center justify-center border border-dashed rounded-lg bg-muted/20 text-muted-foreground p-8 my-6">
              <span className="text-sm font-semibold mb-2 text-foreground">
                Bypassed LLM Validation
              </span>
              <p className="text-xs text-center text-muted-foreground max-w-md">
                {validatorCall.response.reason}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
