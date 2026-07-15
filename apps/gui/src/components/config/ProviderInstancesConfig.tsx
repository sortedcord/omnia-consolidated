"use client";

import { useEffect, useState } from "react";
import {
  createProviderInstance,
  updateProviderInstance,
  setActiveProviderInstance,
  regenerateEmbeddings,
  deleteProviderInstance,
} from "@/app/actions";
import type { ModelProviderInstance, ModelProviderMeta } from "@omnia/llm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item";
import { Empty, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface ProviderInstancesConfigProps {
  instances: ModelProviderInstance[];
  availableProviders: ModelProviderMeta[];
  mappings: Record<string, string>;
  onChanged: () => Promise<void>;
}

export function ProviderInstancesConfig({
  instances,
  availableProviders,
  mappings,
  onChanged,
}: ProviderInstancesConfigProps) {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [editProvider, setEditProvider] = useState("google-genai");
  const [editKey, setEditKey] = useState("");
  const [editModel, setEditModel] = useState("gemini-2.5-flash");
  const [editIsActive, setEditIsActive] = useState(false);
  const [editType, setEditType] = useState<"generative" | "embedding">(
    "generative",
  );
  const [editMaxContext, setEditMaxContext] = useState<number>(32768);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedInstanceId === null) {
      setEditName("");
      setEditProvider("google-genai");
      setEditKey("");
      setEditModel("gemini-2.5-flash");
      setEditIsActive(false);
      setEditType("generative");
      setEditMaxContext(32768);
    } else if (selectedInstanceId === "new") {
      setEditName("");
      const defaultProvider = "google-genai";
      setEditProvider(defaultProvider);
      setEditKey("");
      setEditType("generative");
      const pMeta = availableProviders.find((p) => p.id === defaultProvider);
      setEditModel(pMeta?.defaultModel || "gemini-2.5-flash");
      setEditIsActive(false);
      setEditMaxContext(32768);
    } else {
      const inst = instances.find((i) => i.id === selectedInstanceId);
      if (inst) {
        setEditName(inst.name);
        setEditProvider(inst.providerName);
        setEditKey("");
        setEditType(inst.type || "generative");
        const pMeta = availableProviders.find(
          (p) => p.id === inst.providerName,
        );
        setEditModel(
          inst.modelName ||
            (inst.type === "embedding"
              ? pMeta?.defaultEmbeddingModel
              : pMeta?.defaultModel) ||
            "gemini-2.5-flash",
        );
        setEditIsActive(inst.isActive);
        setEditMaxContext(
          inst.maxContext !== undefined && inst.maxContext !== null
            ? inst.maxContext
            : 32768,
        );
      }
    }
  }, [selectedInstanceId, instances, availableProviders]);

  const handleProviderChange = (providerId: string | null) => {
    if (!providerId) return;
    setEditProvider(providerId);
    const pMeta = availableProviders.find((p) => p.id === providerId);
    setEditModel(
      editType === "embedding"
        ? pMeta?.defaultEmbeddingModel || ""
        : pMeta?.defaultModel || "",
    );
  };

  const handleTypeChange = (type: "generative" | "embedding") => {
    setEditType(type);
    const pMeta = availableProviders.find((p) => p.id === editProvider);
    setEditModel(
      type === "embedding"
        ? pMeta?.defaultEmbeddingModel || ""
        : pMeta?.defaultModel || "",
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setError("Name is required.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      let shouldRegenerate = false;
      let targetInstanceId = selectedInstanceId;

      if (selectedInstanceId === "new") {
        if (!editKey.trim()) {
          setError("API Key is required for new instances.");
          setLoading(false);
          return;
        }
        const created = await createProviderInstance(
          editName,
          editProvider,
          editKey,
          editModel || undefined,
          editType,
          editType === "generative" ? editMaxContext : 0,
        );
        if (editIsActive) {
          await setActiveProviderInstance(created.id);
        }
        targetInstanceId = created.id;
        setSelectedInstanceId(created.id);
      } else {
        if (!selectedInstanceId) return;
        const inst = instances.find((i) => i.id === selectedInstanceId);
        if (inst && inst.type === "embedding") {
          const isMapped = mappings["embeddings"] === selectedInstanceId;
          const isActive = inst.isActive && !mappings["embeddings"];
          if (isMapped || isActive) {
            const hasChanged =
              inst.providerName !== editProvider ||
              inst.modelName !== editModel;
            if (hasChanged) {
              const confirmChange = window.confirm(
                "You have changed the configuration of the active embedding provider. This will delete all existing embeddings and regenerate them from scratch. Are you sure you want to do this?",
              );
              if (!confirmChange) {
                setLoading(false);
                return;
              }
              shouldRegenerate = true;
            }
          }
        }

        await updateProviderInstance(
          selectedInstanceId,
          editName,
          editProvider,
          editKey || undefined,
          editModel || undefined,
          editType,
          editType === "generative" ? editMaxContext : 0,
        );
        if (editIsActive) {
          await setActiveProviderInstance(selectedInstanceId);
        }
      }

      await onChanged();

      if (shouldRegenerate && targetInstanceId && targetInstanceId !== "new") {
        await regenerateEmbeddings(targetInstanceId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (selectedInstanceId === "new" || selectedInstanceId === null) return;
    if (!confirm("Are you sure you want to delete this provider instance?"))
      return;

    try {
      setLoading(true);
      setError("");
      await deleteProviderInstance(selectedInstanceId);
      setSelectedInstanceId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-8">
      {error && (
        <div className="mb-4 rounded border-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div
        className={cn(
          "mt-4 grid min-h-[400px] grid-cols-1 gap-4 md:grid-cols-[30%_70%]",
          loading && "pointer-events-none opacity-60",
          "transition-opacity duration-200",
        )}
      >
        {/* Left panel - Instance list */}
        <Card>
          <CardHeader>
            <CardTitle>Instances</CardTitle>
            <CardAction>
              <Button onClick={() => setSelectedInstanceId("new")} size="sm">
                + Add
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {instances.length === 0 ? (
              <Empty>
                <EmptyTitle>No instances configured</EmptyTitle>
              </Empty>
            ) : (
              <ItemGroup>
                {instances.map((inst) => (
                  <Item
                    key={inst.id}
                    variant={
                      selectedInstanceId === inst.id ? "outline" : "muted"
                    }
                    className={cn(
                      "cursor-pointer",
                      selectedInstanceId === inst.id && "border-primary",
                    )}
                    onClick={() => setSelectedInstanceId(inst.id)}
                  >
                    <ItemContent>
                      <ItemTitle>{inst.name}</ItemTitle>
                      <ItemDescription>{inst.providerName}</ItemDescription>
                      <div className="flex flex-row gap-1.5">
                        {inst.isActive && <Badge>Active</Badge>}
                        <Badge variant="outline">
                          {inst.type === "generative" ? "gen" : "embed"}
                        </Badge>
                      </div>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>

        {/* Right panel - Form */}
        <Card>
          {selectedInstanceId === null ? (
            <CardContent className="flex min-h-[300px] items-center justify-center">
              <Empty>
                <EmptyTitle>No instance selected</EmptyTitle>
                <EmptyDescription>
                  Press + to add or select an existing Instance to edit
                </EmptyDescription>
              </Empty>
            </CardContent>
          ) : (
            <form onSubmit={handleSave} className="flex h-full flex-col">
              <CardHeader>
                <CardTitle>
                  {selectedInstanceId === "new"
                    ? "Create New Provider Instance"
                    : `Configure: ${editName}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="formName">Friendly Name</Label>
                  <Input
                    id="formName"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. Gemini - Production"
                    required
                  />
                </div>

                <div className="grid grid-cols-[2fr_3fr] gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Instance Type</Label>
                    <Select
                      value={editType}
                      onValueChange={(v) =>
                        handleTypeChange(v as "generative" | "embedding")
                      }
                      items={[
                        {
                          label: "Generative (Text Completion)",
                          value: "generative",
                        },
                        {
                          label: "Embedding (Vector generation)",
                          value: "embedding",
                        },
                      ]}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="generative">
                            Generative (Chat / Text Completion)
                          </SelectItem>
                          <SelectItem value="embedding">
                            Embedding (Vector generation)
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label>Provider Type</Label>
                    <Select
                      value={editProvider}
                      onValueChange={handleProviderChange}
                      items={availableProviders.map((p) => ({
                        label: p.displayName,
                        value: p.id,
                      }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        align="end"
                        className="min-w-[var(--anchor-width)]"
                      >
                        <SelectGroup>
                          {availableProviders.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {editProvider && availableProviders.length > 0 && (
                  <span className="block rounded border-2 bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {
                      availableProviders.find((p) => p.id === editProvider)
                        ?.description
                    }
                  </span>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="formKey">API Key</Label>
                  <Input
                    id="formKey"
                    type="password"
                    value={editKey}
                    onChange={(e) => setEditKey(e.target.value)}
                    placeholder={
                      selectedInstanceId === "new"
                        ? "AIzaSy..."
                        : "•••••••• (unchanged)"
                    }
                    required={selectedInstanceId === "new"}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="formModel">Model Name</Label>
                  <Input
                    id="formModel"
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    placeholder="e.g. gemini-2.5-flash, gemini-2.5-pro"
                  />
                </div>

                {editType === "generative" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="formMaxContext">
                      Max Context Length (Tokens, 0 for infinite)
                    </Label>
                    <Input
                      id="formMaxContext"
                      type="number"
                      value={editMaxContext}
                      onChange={(e) =>
                        setEditMaxContext(parseInt(e.target.value) || 0)
                      }
                      min={0}
                      placeholder="e.g. 32768"
                    />
                  </div>
                )}

                <div className="flex flex-row items-center gap-2">
                  <Checkbox
                    id="formActive"
                    checked={editIsActive}
                    onCheckedChange={(v) => setEditIsActive(v === true)}
                  />
                  <Label htmlFor="formActive" className="cursor-pointer">
                    Set as Active Instance
                  </Label>
                </div>

                <div className="flex flex-row items-center justify-between gap-2">
                  <div>
                    {selectedInstanceId !== "new" && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={loading}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </form>
          )}
        </Card>
      </div>
    </section>
  );
}
