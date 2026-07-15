"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  SidebarProvider,
  Sidebar,
  SidebarContent,
} from "@/components/ui/sidebar";
import { 
  getConfigStatus, 
  loadScenarioJson, 
  saveScenario 
} from "@/app/actions";
import type { Scenario } from "@omnia/scenario";
import { 
  Plus, 
  Trash2, 
  Save, 
  FileJson, 
  Globe, 
  MapPin, 
  Users, 
  Sparkles, 
  ChevronRight, 
  Info,
  Eye
} from "lucide-react";

interface AttributeData {
  name: string;
  value: string;
  visibility: "PUBLIC" | "PRIVATE";
  allowedEntities: string[];
}

interface ConnectionData {
  targetId: string;
  portalName?: string;
  portalStateDescriptor?: string;
  visionProp: number;
  soundProp: number;
  bidirectional: boolean;
}

interface LocationData {
  id: string;
  parentId?: string;
  attributes: AttributeData[];
  connections: ConnectionData[];
}

interface MemoryData {
  id: string;
  timestamp: string;
  locationId: string | null;
  intent: {
    type: "dialogue" | "action" | "monologue";
    originalText: string;
    description: string;
    selfDescription?: string;
    actorId: string;
    targetIds: string[];
    modifiers?: string[];
  };
  outcome?: {
    isValid: boolean;
    reason: string;
  };
}

interface EntityData {
  id: string;
  locationId?: string;
  attributes: AttributeData[];
  aliases: Record<string, string>; // targetId -> subjective descriptor
  initialMemories: MemoryData[];
}

const generateUUID = () => {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export default function BuilderPage() {
  const router = useRouter();

  // Load scenarios templates list
  const [availableScenarios, setAvailableScenarios] = useState<
    { path: string; name: string; description: string }[]
  >([]);
  const [selectedTemplatePath, setSelectedTemplatePath] = useState("");

  // Tabs: "metadata", "locations", "entities", "json"
  const [activeTab, setActiveTab] = useState<"metadata" | "locations" | "entities" | "json">("metadata");

  // Form State
  const [scenarioId, setScenarioId] = useState("");
  const [name, setName] = useState("My Custom Scenario");
  const [description, setDescription] = useState("A custom scenario template created via builder.");
  const [startTime, setStartTime] = useState("2026-07-06T12:00:00.000Z");
  const [worldAttributes, setWorldAttributes] = useState<AttributeData[]>([]);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [entities, setEntities] = useState<EntityData[]>([]);

  // Initialize dynamic UUIDs client-side to prevent NextJS SSR hydration mismatch
  useEffect(() => {
    if (!scenarioId) {
      const uId = generateUUID();
      const locId = generateUUID();
      const entId = generateUUID();
      
      setScenarioId(uId);
      setLocations([{ id: locId, attributes: [], connections: [] }]);
      setEntities([{
        id: entId,
        locationId: locId,
        attributes: [{ name: "role", value: "adventurer", visibility: "PUBLIC", allowedEntities: [] }],
        aliases: {},
        initialMemories: []
      }]);
    }
  }, [scenarioId]);

  // Selected sub-items for active editing lists
  const [selectedLocIndex, setSelectedLocIndex] = useState(0);
  const [selectedEntIndex, setSelectedEntIndex] = useState(0);

  // Status & Notification Banners
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch available templates on load
  useEffect(() => {
    async function loadTemplates() {
      try {
        const config = await getConfigStatus();
        setAvailableScenarios(config.availableScenarios);
      } catch (err) {
        console.error("Failed to load scenario list:", err);
      }
    }
    loadTemplates();
  }, []);

  // Set timeout to dismiss messages
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Populate helper lists
  const locationIds = useMemo(() => locations.map(l => l.id).filter(Boolean), [locations]);
  const entityIds = useMemo(() => entities.map(e => e.id).filter(Boolean), [entities]);

  // Load selected template
  const handleLoadTemplate = async (path: string) => {
    if (!path) return;
    setStatusMessage({ text: "Loading template...", type: "info" });
    try {
      const res = await loadScenarioJson(path);
      if (!res.ok) {
        setStatusMessage({ text: res.error || "Failed to load template.", type: "error" });
        return;
      }
      
      const s = res.scenario as Scenario;
      if (!s) {
        setStatusMessage({ text: "Scenario template was empty.", type: "error" });
        return;
      }

      setScenarioId(s.id || "custom-scenario");
      setName(s.name || "Loaded Scenario");
      setDescription(s.description || "");
      setStartTime(s.startTime || "2026-07-06T12:00:00.000Z");
      
      // World attributes
      const wAttrs = (s.world?.attributes || []).map(a => ({
        name: a.name,
        value: a.value,
        visibility: a.visibility,
        allowedEntities: a.allowedEntities || [],
      }));
      setWorldAttributes(wAttrs);

      // Locations
      const locs = (s.locations || []).map(l => ({
        id: l.id,
        parentId: l.parentId || undefined,
        attributes: (l.attributes || []).map(a => ({
          name: a.name,
          value: a.value,
          visibility: a.visibility,
          allowedEntities: a.allowedEntities || [],
        })),
        connections: (l.connections || []).map(c => ({
          targetId: c.targetId,
          portalName: c.portalName,
          portalStateDescriptor: c.portalStateDescriptor,
          visionProp: c.visionProp,
          soundProp: c.soundProp,
          bidirectional: c.bidirectional ?? true,
        })),
      }));
      setLocations(locs.length > 0 ? locs : [{ id: generateUUID(), attributes: [], connections: [] }]);
      setSelectedLocIndex(0);

      // Entities
      const ents = (s.entities || []).map(e => ({
        id: e.id,
        locationId: e.locationId || undefined,
        attributes: (e.attributes || []).map(a => ({
          name: a.name,
          value: a.value,
          visibility: a.visibility,
          allowedEntities: a.allowedEntities || [],
        })),
        aliases: e.aliases || {},
        initialMemories: (e.initialMemories || []).map(m => ({
          id: m.id || generateUUID(),
          timestamp: m.timestamp || s.startTime,
          locationId: m.locationId || null,
          intent: {
            type: m.intent.type,
            originalText: m.intent.originalText,
            description: m.intent.description,
            selfDescription: m.intent.selfDescription,
            actorId: m.intent.actorId || e.id,
            targetIds: m.intent.targetIds || [],
            modifiers: m.intent.modifiers || [],
          },
          outcome: m.outcome ? {
            isValid: m.outcome.isValid,
            reason: m.outcome.reason
          } : undefined,
        })),
      }));
      setEntities(ents.length > 0 ? ents : [{ id: generateUUID(), locationId: locs[0]?.id || generateUUID(), attributes: [], aliases: {}, initialMemories: [] }]);
      setSelectedEntIndex(0);

      setStatusMessage({ text: "Template loaded successfully!", type: "success" });
    } catch (err) {
      setStatusMessage({ text: err instanceof Error ? err.message : String(err), type: "error" });
    }
  };

  // Compile full scenario object
  const compiledScenario = useMemo(() => {
    return {
      id: scenarioId.trim(),
      name: name.trim(),
      description: description.trim(),
      startTime: startTime.trim(),
      world: worldAttributes.length > 0 ? {
        attributes: worldAttributes.map(a => ({
          name: a.name.trim(),
          value: a.value.trim(),
          visibility: a.visibility,
          ...(a.visibility === "PRIVATE" && a.allowedEntities.length > 0 ? { allowedEntities: a.allowedEntities } : {})
        }))
      } : undefined,
      locations: locations.map(l => ({
        id: l.id.trim(),
        ...(l.parentId ? { parentId: l.parentId } : {}),
        ...(l.attributes.length > 0 ? {
          attributes: l.attributes.map(a => ({
            name: a.name.trim(),
            value: a.value.trim(),
            visibility: a.visibility,
            ...(a.visibility === "PRIVATE" && a.allowedEntities.length > 0 ? { allowedEntities: a.allowedEntities } : {})
          }))
        } : {}),
        ...(l.connections.length > 0 ? {
          connections: l.connections.map(c => ({
            targetId: c.targetId,
            ...(c.portalName ? { portalName: c.portalName.trim() } : {}),
            ...(c.portalStateDescriptor ? { portalStateDescriptor: c.portalStateDescriptor.trim() } : {}),
            visionProp: Number(c.visionProp),
            soundProp: Number(c.soundProp),
            bidirectional: !!c.bidirectional
          }))
        } : {})
      })),
      entities: entities.map(e => ({
        id: e.id.trim(),
        ...(e.locationId ? { locationId: e.locationId } : {}),
        ...(e.attributes.length > 0 ? {
          attributes: e.attributes.map(a => ({
            name: a.name.trim(),
            value: a.value.trim(),
            visibility: a.visibility,
            ...(a.visibility === "PRIVATE" && a.allowedEntities.length > 0 ? { allowedEntities: a.allowedEntities } : {})
          }))
        } : {}),
        ...(Object.keys(e.aliases).length > 0 ? { aliases: e.aliases } : {}),
        ...(e.initialMemories.length > 0 ? {
          initialMemories: e.initialMemories.map(m => ({
            id: m.id,
            timestamp: m.timestamp,
            locationId: m.locationId,
            intent: {
              type: m.intent.type,
              originalText: m.intent.originalText.trim(),
              description: m.intent.description.trim(),
              ...(m.intent.selfDescription ? { selfDescription: m.intent.selfDescription.trim() } : {}),
              actorId: m.intent.actorId,
              targetIds: m.intent.targetIds,
              ...(m.intent.modifiers && m.intent.modifiers.length > 0 ? { modifiers: m.intent.modifiers } : [])
            },
            ...(m.outcome ? { outcome: { isValid: !!m.outcome.isValid, reason: m.outcome.reason.trim() } } : {})
          }))
        } : {})
      }))
    };
  }, [scenarioId, name, description, startTime, worldAttributes, locations, entities]);

  // Save scenario to server
  const handleSaveToServer = async () => {
    if (!scenarioId.trim()) {
      setStatusMessage({ text: "Scenario Template ID is required to save.", type: "error" });
      return;
    }
    setIsSubmitting(true);
    setStatusMessage({ text: "Saving scenario file...", type: "info" });
    try {
      const res = await saveScenario(compiledScenario);
      if (res.ok) {
        setStatusMessage({ text: `Scenario template saved as ${scenarioId}.json successfully!`, type: "success" });
        // Refresh template list
        const config = await getConfigStatus();
        setAvailableScenarios(config.availableScenarios);
      } else {
        setStatusMessage({ text: res.error || "Failed to save scenario.", type: "error" });
      }
    } catch (err) {
      setStatusMessage({ text: err instanceof Error ? err.message : String(err), type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download scenario file directly
  const handleDownloadJson = () => {
    try {
      const jsonStr = JSON.stringify(compiledScenario, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${scenarioId || "scenario"}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatusMessage({ text: "JSON download initiated.", type: "success" });
    } catch {
      setStatusMessage({ text: "Download failed.", type: "error" });
    }
  };

  // World Attribute Management
  const addWorldAttribute = () => {
    setWorldAttributes([...worldAttributes, { name: "", value: "", visibility: "PUBLIC", allowedEntities: [] }]);
  };

  // Helper component for Attributes list editor
  const AttributeEditor = ({ 
    attributes, 
    onChange, 
    onAdd, 
    title = "Attributes" 
  }: { 
    attributes: AttributeData[]; 
    onChange: (attrs: AttributeData[]) => void; 
    onAdd: () => void;
    title?: string;
  }) => {
    const handleAttrChange = <K extends keyof AttributeData>(index: number, key: K, val: AttributeData[K]) => {
      const copy = [...attributes];
      copy[index] = { ...copy[index], [key]: val };
      onChange(copy);
    };

    const handleToggleEntityAccess = (index: number, entId: string) => {
      const copy = [...attributes];
      const allowed = copy[index].allowedEntities || [];
      if (allowed.includes(entId)) {
        copy[index].allowedEntities = allowed.filter(id => id !== entId);
      } else {
        copy[index].allowedEntities = [...allowed, entId];
      }
      onChange(copy);
    };

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-border/20 pb-2">
          <h3 className="text-body-md font-mono text-foreground font-bold">{title}</h3>
          <Button type="button" size="sm" variant="outline" onClick={onAdd} className="h-7 text-xs flex gap-1 cursor-pointer">
            <Plus className="size-3" /> Add Attribute
          </Button>
        </div>
        {attributes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No attributes defined yet.</p>
        ) : (
          <div className="space-y-3">
            {attributes.map((attr, index) => (
              <div key={index} className="border border-border/20 bg-secondary/10 p-3 rounded space-y-3">
                <div className="flex gap-2 items-center">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Name (e.g. role)"
                      value={attr.name}
                      onChange={(e) => handleAttrChange(index, "name", e.target.value)}
                      className="h-8 font-mono text-xs"
                    />
                    <Input
                      placeholder="Value (e.g. merchant)"
                      value={attr.value}
                      onChange={(e) => handleAttrChange(index, "value", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button 
                    type="button" 
                    variant="destructive" 
                    size="icon" 
                    className="size-8 shrink-0 cursor-pointer"
                    onClick={() => onChange(attributes.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <Label className="text-muted-foreground cursor-pointer flex items-center gap-1.5">
                      <Checkbox
                        checked={attr.visibility === "PUBLIC"}
                        onCheckedChange={(checked) => 
                          handleAttrChange(index, "visibility", checked ? "PUBLIC" : "PRIVATE")
                        }
                      />
                      Publicly Visible
                    </Label>
                  </div>
                  {attr.visibility === "PRIVATE" && (
                    <div className="flex-1 border-l border-border/25 pl-4">
                      <span className="text-muted-foreground font-semibold block mb-1">Visible to Entities:</span>
                      {entityIds.length === 0 ? (
                        <span className="text-[10px] italic text-muted-foreground">Add entities first to grant private access</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {entityIds.map(entId => {
                            const isAllowed = attr.allowedEntities?.includes(entId);
                            return (
                              <button
                                key={entId}
                                type="button"
                                onClick={() => handleToggleEntityAccess(index, entId)}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                                  isAllowed 
                                    ? "bg-primary/20 border-primary text-primary font-bold"
                                    : "bg-background border-border/30 text-muted-foreground hover:bg-secondary"
                                }`}
                              >
                                {entId}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Location connections manager
  const addLocationConnection = (locIndex: number) => {
    const copy = [...locations];
    copy[locIndex].connections = [
      ...copy[locIndex].connections,
      { targetId: locationIds[0] || "", visionProp: 10, soundProp: 10, bidirectional: true }
    ];
    setLocations(copy);
  };

  const updateLocationConnection = <K extends keyof ConnectionData>(locIndex: number, connIndex: number, key: K, val: ConnectionData[K]) => {
    const copy = [...locations];
    copy[locIndex].connections[connIndex] = { ...copy[locIndex].connections[connIndex], [key]: val };
    setLocations(copy);
  };

  const removeLocationConnection = (locIndex: number, connIndex: number) => {
    const copy = [...locations];
    copy[locIndex].connections = copy[locIndex].connections.filter((_, i) => i !== connIndex);
    setLocations(copy);
  };

  return (
    <SidebarProvider>
      <div className="flex flex-1 min-h-0 w-full overflow-hidden bg-background">
        
        {/* Save Status Banner */}
        {statusMessage && (
          <div className={`fixed top-4 right-4 z-50 max-w-sm border p-4 shadow-lg animate-fade-in ${
            statusMessage.type === "success" ? "bg-emerald-950/80 border-emerald-500 text-emerald-300" :
            statusMessage.type === "error" ? "bg-destructive/10 border-destructive text-destructive" :
            "bg-secondary/90 border-border text-foreground"
          }`}>
            <div className="flex items-start gap-3">
              <Info className="size-4 shrink-0 mt-0.5" />
              <div className="text-xs">{statusMessage.text}</div>
            </div>
          </div>
        )}

        {/* Viewport-level Vertical Sidebar on the Left Side */}
        <Sidebar collapsible="none" className="h-full border-r border-border/30 bg-card shrink-0">
          <SidebarContent className="flex flex-col justify-between h-full bg-card p-6">
            <div className="flex flex-col gap-2 font-head">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-2">Configuration</span>
              
              <button
                onClick={() => setActiveTab("metadata")}
                className={`w-full text-left px-4 py-2.5 text-xs font-mono font-bold tracking-wide border transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "metadata" 
                    ? "border-primary bg-primary/10 text-primary shadow-[2px_2px_0_0_var(--primary)] font-bold" 
                    : "border-border/30 hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Globe className="size-3.5" /> 
                <span>World Metadata</span>
              </button>

              <button
                onClick={() => setActiveTab("locations")}
                className={`w-full text-left px-4 py-2.5 text-xs font-mono font-bold tracking-wide border transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "locations" 
                    ? "border-primary bg-primary/10 text-primary shadow-[2px_2px_0_0_var(--primary)] font-bold" 
                    : "border-border/30 hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <MapPin className="size-3.5" /> 
                <span>Locations</span>
                <span className="ml-auto text-[10px] font-mono border border-muted-foreground/20 bg-muted/10 px-1 rounded">{locations.length}</span>
              </button>

              <button
                onClick={() => setActiveTab("entities")}
                className={`w-full text-left px-4 py-2.5 text-xs font-mono font-bold tracking-wide border transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "entities" 
                    ? "border-primary bg-primary/10 text-primary shadow-[2px_2px_0_0_var(--primary)] font-bold" 
                    : "border-border/30 hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="size-3.5" /> 
                <span>Entities</span>
                <span className="ml-auto text-[10px] font-mono border border-muted-foreground/20 bg-muted/10 px-1 rounded">{entities.length}</span>
              </button>

              <button
                onClick={() => setActiveTab("json")}
                className={`w-full text-left px-4 py-2.5 text-xs font-mono font-bold tracking-wide border transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "json" 
                    ? "border-primary bg-primary/10 text-primary shadow-[2px_2px_0_0_var(--primary)] font-bold" 
                    : "border-border/30 hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="size-3.5" /> 
                <span>Live JSON Preview</span>
              </button>
            </div>

            {/* Sidebar Footer link */}
            <div className="border-t border-border/10 pt-3 flex items-center justify-between text-[10px] text-muted-foreground">
              <button 
                onClick={() => router.push("/")}
                className="w-full py-1 text-center hover:text-foreground text-primary font-bold uppercase transition-colors cursor-pointer"
              >
                Back to Dashboard
              </button>
            </div>
          </SidebarContent>
        </Sidebar>

        {/* Main Centered Content Pane on the Right */}
        <main className="flex-1 overflow-y-auto px-10 py-8 min-h-0 flex flex-col">
          <div className="mx-auto max-w-[1200px] w-full flex-1 flex flex-col min-h-0 gap-6">
            
            {/* Header block with Page Name and Load/Save Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/20 pb-4 shrink-0">
              <div>
                <h1 className="text-headline-md text-primary flex items-center gap-2 font-head">
                  <Sparkles className="size-6 text-primary" /> Scenario Builder
                </h1>
              </div>
              
              <div className="flex items-center gap-3 self-end md:self-auto">
                {/* Load Template dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">Load:</span>
                  <select
                    className="bg-card border border-border/30 px-2 py-1 text-xs outline-none h-8 w-44 rounded"
                    value={selectedTemplatePath}
                    onChange={(e) => {
                      setSelectedTemplatePath(e.target.value);
                      handleLoadTemplate(e.target.value);
                    }}
                  >
                    <option value="">-- Choose existing --</option>
                    {availableScenarios.map(sc => (
                      <option key={sc.path} value={sc.path}>{sc.name}</option>
                    ))}
                  </select>
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownloadJson}
                  className="h-8 text-xs flex gap-1.5 items-center cursor-pointer"
                >
                  <FileJson className="size-3.5" /> Export JSON
                </Button>

                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleSaveToServer}
                  disabled={isSubmitting}
                  className="h-8 text-xs flex gap-1.5 items-center cursor-pointer"
                >
                  <Save className="size-3.5" /> Save to Server
                </Button>
              </div>
            </div>

            {/* Active configuration tab form */}
            <div className="flex-1 min-h-0">
              
              {/* TAB 1: World Metadata & Attributes */}
              {activeTab === "metadata" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  
                  {/* Basic Fields */}
                  <div className="lg:col-span-2 space-y-5 border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)]">
                    <h2 className="text-body-lg text-primary font-bold border-b border-border/20 pb-2">Scenario Metadata</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="sc-id">Scenario Template ID</Label>
                        <Input 
                          id="sc-id" 
                          placeholder="e.g. my-custom-scenario" 
                          value={scenarioId} 
                          onChange={e => setScenarioId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))}
                          className="font-mono text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">Unique filename ID. Alphanumeric, hyphens and underscores only.</span>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="sc-start">Start Time (ISO Date)</Label>
                        <Input 
                          id="sc-start" 
                          placeholder="e.g. 2026-07-06T12:00:00.000Z" 
                          value={startTime} 
                          onChange={e => setStartTime(e.target.value)}
                          className="font-mono text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">Global clock starting timestamp.</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="sc-name">Scenario Name</Label>
                      <Input 
                        id="sc-name" 
                        placeholder="e.g. The Quiet Tavern" 
                        value={name} 
                        onChange={e => setName(e.target.value)}
                        className="text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="sc-desc">Description</Label>
                      <Textarea 
                        id="sc-desc" 
                        placeholder="Describe the starting setup..." 
                        value={description} 
                        onChange={e => setDescription(e.target.value)}
                        className="text-xs h-24"
                      />
                    </div>
                  </div>

                  {/* World level Attributes */}
                  <div className="border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)]">
                    <AttributeEditor 
                      title="World Attributes"
                      attributes={worldAttributes}
                      onChange={setWorldAttributes}
                      onAdd={addWorldAttribute}
                    />
                  </div>

                </div>
              )}

              {/* TAB 2: Locations & Spatial connections */}
              {activeTab === "locations" && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-start min-h-0">
                  
                  {/* Left sidebar: Locations list */}
                  <div className="md:col-span-1 border border-border/20 bg-card shadow-[2px_2px_0_0_var(--border)] flex flex-col max-h-[500px]">
                    <div className="p-3 border-b border-border/25 flex justify-between items-center bg-secondary/15">
                      <strong className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Locations</strong>
                      <Button 
                        type="button" 
                        size="sm" 
                        onClick={() => {
                          const newId = generateUUID();
                          setLocations([...locations, { id: newId, attributes: [], connections: [] }]);
                          setSelectedLocIndex(locations.length);
                        }}
                        className="h-6 text-[10px] px-2 flex gap-1 cursor-pointer"
                      >
                        <Plus className="size-3" /> Add
                      </Button>
                    </div>
                    <div className="overflow-y-auto divide-y divide-border/10 flex-1">
                      {locations.map((loc, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSelectedLocIndex(idx)}
                          className={`p-3 text-xs font-mono cursor-pointer flex justify-between items-center transition-all ${
                            selectedLocIndex === idx 
                              ? "bg-primary/10 text-primary font-bold border-l-4 border-primary" 
                              : "hover:bg-secondary/40 text-foreground"
                          }`}
                        >
                          <span className="truncate">{loc.id || `(Empty ID)`}</span>
                          {locations.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newLocs = locations.filter((_, i) => i !== idx);
                                setLocations(newLocs);
                                setSelectedLocIndex(Math.max(0, idx - 1));
                              }}
                              className="text-muted-foreground hover:text-destructive transition-colors pl-2 cursor-pointer"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right panel: Edit selected location details */}
                  <div className="md:col-span-3 border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)] grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Basic location fields */}
                    <div className="space-y-4">
                      <h2 className="text-body-lg text-primary font-bold border-b border-border/20 pb-2">Location Configuration</h2>
                      
                      <div className="space-y-1.5">
                        <Label>Location ID</Label>
                        <Input
                          placeholder="e.g. tavern-cellar"
                          value={locations[selectedLocIndex]?.id || ""}
                          onChange={(e) => {
                            const copy = [...locations];
                            copy[selectedLocIndex].id = e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "");
                            setLocations(copy);
                          }}
                          className="font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Parent Location (Optional)</Label>
                        <select
                          className="bg-card border border-border/30 px-3 py-1.5 text-xs outline-none w-full rounded"
                          value={locations[selectedLocIndex]?.parentId || ""}
                          onChange={(e) => {
                            const copy = [...locations];
                            copy[selectedLocIndex].parentId = e.target.value || undefined;
                            setLocations(copy);
                          }}
                        >
                          <option value="">-- No parent --</option>
                          {locationIds.filter(id => id !== locations[selectedLocIndex]?.id).map(id => (
                            <option key={id} value={id}>{id}</option>
                          ))}
                        </select>
                      </div>

                      {/* Attributes for Location */}
                      <div className="pt-2">
                        <AttributeEditor
                          title="Location Attributes"
                          attributes={locations[selectedLocIndex]?.attributes || []}
                          onChange={(newAttrs) => {
                            const copy = [...locations];
                            copy[selectedLocIndex].attributes = newAttrs;
                            setLocations(copy);
                          }}
                          onAdd={() => {
                            const copy = [...locations];
                            copy[selectedLocIndex].attributes = [
                              ...copy[selectedLocIndex].attributes,
                              { name: "", value: "", visibility: "PUBLIC", allowedEntities: [] }
                            ];
                            setLocations(copy);
                          }}
                        />
                      </div>
                    </div>

                    {/* Connections (spatial paths) */}
                    <div className="space-y-4 border-t lg:border-t-0 lg:border-l border-border/20 lg:pl-6 pt-4 lg:pt-0">
                      <div className="flex justify-between items-center border-b border-border/20 pb-2">
                        <h3 className="text-body-md text-foreground font-bold">Connections / Portals</h3>
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="outline" 
                          onClick={() => addLocationConnection(selectedLocIndex)}
                          className="h-7 text-xs flex gap-1 cursor-pointer"
                        >
                          <Plus className="size-3" /> Add Connection
                        </Button>
                      </div>

                      {(!locations[selectedLocIndex]?.connections || locations[selectedLocIndex].connections.length === 0) ? (
                        <p className="text-xs text-muted-foreground italic">No connections leading from this location.</p>
                      ) : (
                        <div className="space-y-4 overflow-y-auto max-h-[400px] pr-1">
                          {locations[selectedLocIndex].connections.map((conn, connIdx) => (
                            <div key={connIdx} className="border border-border/20 bg-secondary/10 p-3 rounded space-y-3 relative group">
                              
                              <button
                                type="button"
                                onClick={() => removeLocationConnection(selectedLocIndex, connIdx)}
                                className="absolute top-2 right-2 text-muted-foreground hover:text-destructive cursor-pointer"
                                title="Delete connection"
                              >
                                <Trash2 className="size-3.5" />
                              </button>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                                <div className="space-y-1">
                                  <span className="text-[10px] font-semibold text-muted-foreground">Target Location</span>
                                  <select
                                    className="bg-card border border-border/30 px-2 py-1 text-xs outline-none w-full rounded"
                                    value={conn.targetId}
                                    onChange={(e) => updateLocationConnection(selectedLocIndex, connIdx, "targetId", e.target.value)}
                                  >
                                    <option value="">-- Choose target --</option>
                                    {locationIds.filter(id => id !== locations[selectedLocIndex].id).map(id => (
                                      <option key={id} value={id}>{id}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <span className="text-[10px] font-semibold text-muted-foreground">Portal Name</span>
                                  <Input
                                    placeholder="e.g. wooden door"
                                    value={conn.portalName || ""}
                                    onChange={(e) => updateLocationConnection(selectedLocIndex, connIdx, "portalName", e.target.value)}
                                    className="h-7 text-xs"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[10px] font-semibold text-muted-foreground">Portal State</span>
                                <Input
                                  placeholder="e.g. locked, closed, heavy iron gate"
                                  value={conn.portalStateDescriptor || ""}
                                  onChange={(e) => updateLocationConnection(selectedLocIndex, connIdx, "portalStateDescriptor", e.target.value)}
                                  className="h-7 text-xs"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div className="space-y-1">
                                  <span className="text-[10px] font-semibold text-muted-foreground block">Vision Propagation ({conn.visionProp})</span>
                                  <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    value={conn.visionProp}
                                    onChange={(e) => updateLocationConnection(selectedLocIndex, connIdx, "visionProp", Number(e.target.value))}
                                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <span className="text-[10px] font-semibold text-muted-foreground block">Sound Propagation ({conn.soundProp})</span>
                                  <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    value={conn.soundProp}
                                    onChange={(e) => updateLocationConnection(selectedLocIndex, connIdx, "soundProp", Number(e.target.value))}
                                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                                  <Checkbox
                                    checked={conn.bidirectional}
                                    onCheckedChange={(checked) => 
                                      updateLocationConnection(selectedLocIndex, connIdx, "bidirectional", !!checked)
                                    }
                                  />
                                  Bidirectional Connection (creates reverse path automatically)
                                </Label>
                              </div>

                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* TAB 3: Entities */}
              {activeTab === "entities" && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-start min-h-0">
                  
                  {/* Left sidebar: Entities list */}
                  <div className="md:col-span-1 border border-border/20 bg-card shadow-[2px_2px_0_0_var(--border)] flex flex-col max-h-[500px]">
                    <div className="p-3 border-b border-border/25 flex justify-between items-center bg-secondary/15">
                      <strong className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Entities</strong>
                      <Button 
                        type="button" 
                        size="sm" 
                        onClick={() => {
                          const newId = generateUUID();
                          setEntities([...entities, { id: newId, locationId: locationIds[0], attributes: [], aliases: {}, initialMemories: [] }]);
                          setSelectedEntIndex(entities.length);
                        }}
                        className="h-6 text-[10px] px-2 flex gap-1 cursor-pointer"
                      >
                        <Plus className="size-3" /> Add
                      </Button>
                    </div>
                    <div className="overflow-y-auto divide-y divide-border/10 flex-1">
                      {entities.map((ent, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSelectedEntIndex(idx)}
                          className={`p-3 text-xs font-mono cursor-pointer flex justify-between items-center transition-all ${
                            selectedEntIndex === idx 
                              ? "bg-primary/10 text-primary font-bold border-l-4 border-primary" 
                              : "hover:bg-secondary/40 text-foreground"
                          }`}
                        >
                          <span className="truncate">{ent.id || `(Empty ID)`}</span>
                          {entities.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newEnts = entities.filter((_, i) => i !== idx);
                                setEntities(newEnts);
                                setSelectedEntIndex(Math.max(0, idx - 1));
                              }}
                              className="text-muted-foreground hover:text-destructive pl-2 cursor-pointer"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right panel: Edit selected entity details */}
                  <div className="md:col-span-3 border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)] grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Column 1: ID, Location, Attributes */}
                    <div className="space-y-4">
                      <h2 className="text-body-lg text-primary font-bold border-b border-border/20 pb-2">Entity Configuration</h2>
                      
                      <div className="space-y-1.5">
                        <Label>Entity ID</Label>
                        <Input
                          placeholder="e.g. alice"
                          value={entities[selectedEntIndex]?.id || ""}
                          onChange={(e) => {
                            const copy = [...entities];
                            copy[selectedEntIndex].id = e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "");
                            setEntities(copy);
                          }}
                          className="font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Current Location</Label>
                        <select
                          className="bg-card border border-border/30 px-3 py-1.5 text-xs outline-none w-full rounded font-mono"
                          value={entities[selectedEntIndex]?.locationId || ""}
                          onChange={(e) => {
                            const copy = [...entities];
                            copy[selectedEntIndex].locationId = e.target.value || undefined;
                            setEntities(copy);
                          }}
                        >
                          <option value="">-- No Location (floating) --</option>
                          {locationIds.map(id => (
                            <option key={id} value={id}>{id}</option>
                          ))}
                        </select>
                      </div>

                      {/* Attributes */}
                      <div className="pt-2">
                        <AttributeEditor
                          title="Entity Attributes"
                          attributes={entities[selectedEntIndex]?.attributes || []}
                          onChange={(newAttrs) => {
                            const copy = [...entities];
                            copy[selectedEntIndex].attributes = newAttrs;
                            setEntities(copy);
                          }}
                          onAdd={() => {
                            const copy = [...entities];
                            copy[selectedEntIndex].attributes = [
                              ...copy[selectedEntIndex].attributes,
                              { name: "", value: "", visibility: "PUBLIC", allowedEntities: [] }
                            ];
                            setEntities(copy);
                          }}
                        />
                      </div>
                    </div>

                    {/* Column 2: Aliases and Initial Memories */}
                    <div className="space-y-6 border-t lg:border-t-0 lg:border-l border-border/20 lg:pl-6 pt-4 lg:pt-0">
                      
                      {/* Aliases Section */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center border-b border-border/20 pb-2">
                          <h3 className="text-body-md text-foreground font-bold">Aliases (Perceptions)</h3>
                          <Button 
                            type="button" 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              const copy = [...entities];
                              const target = entityIds.find(id => id !== copy[selectedEntIndex].id && !copy[selectedEntIndex].aliases[id]);
                              if (target) {
                                copy[selectedEntIndex].aliases = {
                                  ...copy[selectedEntIndex].aliases,
                                  [target]: ""
                                };
                                setEntities(copy);
                              }
                            }}
                            disabled={entityIds.length <= 1}
                            className="h-7 text-xs flex gap-1 cursor-pointer"
                          >
                            <Plus className="size-3" /> Add Alias
                          </Button>
                        </div>

                        {Object.keys(entities[selectedEntIndex]?.aliases || {}).length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No descriptive aliases configured. Defaults to actual entity ID.</p>
                        ) : (
                          <div className="space-y-2">
                            {Object.entries(entities[selectedEntIndex].aliases).map(([targetId, aliasText]) => (
                              <div key={targetId} className="flex gap-2 items-center bg-secondary/15 p-2 rounded">
                                <span className="text-[11px] font-mono text-muted-foreground w-1/3 truncate">{targetId}</span>
                                <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                                <Input
                                  placeholder="Descriptive name (e.g. the guard)"
                                  value={aliasText}
                                  onChange={(e) => {
                                    const copy = [...entities];
                                    copy[selectedEntIndex].aliases = {
                                      ...copy[selectedEntIndex].aliases,
                                      [targetId]: e.target.value
                                    };
                                    setEntities(copy);
                                  }}
                                  className="h-7 text-xs flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const copy = [...entities];
                                    const updated = { ...copy[selectedEntIndex].aliases };
                                    delete updated[targetId];
                                    copy[selectedEntIndex].aliases = updated;
                                    setEntities(copy);
                                  }}
                                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Initial Memories Section */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center border-b border-border/20 pb-2">
                          <h3 className="text-body-md text-foreground font-bold">Initial Memories</h3>
                          <Button 
                            type="button" 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              const copy = [...entities];
                              const newMem: MemoryData = {
                                id: generateUUID(),
                                timestamp: startTime,
                                locationId: copy[selectedEntIndex].locationId || null,
                                intent: {
                                  type: "dialogue",
                                  originalText: "",
                                  description: "",
                                  actorId: copy[selectedEntIndex].id,
                                  targetIds: [],
                                }
                              };
                              copy[selectedEntIndex].initialMemories = [
                                ...copy[selectedEntIndex].initialMemories,
                                newMem
                              ];
                              setEntities(copy);
                            }}
                            className="h-7 text-xs flex gap-1 cursor-pointer"
                          >
                            <Plus className="size-3" /> Add Memory
                          </Button>
                        </div>

                        {(!entities[selectedEntIndex]?.initialMemories || entities[selectedEntIndex].initialMemories.length === 0) ? (
                          <p className="text-xs text-muted-foreground italic">No initial memories loaded. Entities will start blank.</p>
                        ) : (
                          <div className="space-y-4 overflow-y-auto max-h-[300px] pr-1">
                            {entities[selectedEntIndex].initialMemories.map((mem, memIdx) => (
                              <div key={mem.id} className="border border-border/20 bg-secondary/5 p-3 rounded space-y-3 relative">
                                
                                <button
                                  type="button"
                                  onClick={() => {
                                    const copy = [...entities];
                                    copy[selectedEntIndex].initialMemories = copy[selectedEntIndex].initialMemories.filter((_, i) => i !== memIdx);
                                    setEntities(copy);
                                  }}
                                  className="absolute top-2 right-2 text-muted-foreground hover:text-destructive cursor-pointer"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>

                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-semibold text-muted-foreground">Type</span>
                                    <select
                                      className="bg-card border border-border/30 px-2 py-0.5 text-xs outline-none w-full rounded"
                                      value={mem.intent.type}
                                      onChange={(e) => {
                                        const copy = [...entities];
                                        copy[selectedEntIndex].initialMemories[memIdx].intent.type = e.target.value as "dialogue" | "action" | "monologue";
                                        setEntities(copy);
                                      }}
                                    >
                                      <option value="dialogue">Dialogue</option>
                                      <option value="action">Action</option>
                                      <option value="monologue">Monologue</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[10px] font-semibold text-muted-foreground">Location</span>
                                    <select
                                      className="bg-card border border-border/30 px-2 py-0.5 text-xs outline-none w-full rounded font-mono"
                                      value={mem.locationId || ""}
                                      onChange={(e) => {
                                        const copy = [...entities];
                                        copy[selectedEntIndex].initialMemories[memIdx].locationId = e.target.value || null;
                                        setEntities(copy);
                                      }}
                                    >
                                      <option value="">-- Nowhere --</option>
                                      {locationIds.map(id => (
                                        <option key={id} value={id}>{id}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-semibold text-muted-foreground">Verbatim Text (originalText)</span>
                                  <Input
                                    placeholder='e.g. "We should leave," Alice said.'
                                    value={mem.intent.originalText}
                                    onChange={(e) => {
                                      const copy = [...entities];
                                      copy[selectedEntIndex].initialMemories[memIdx].intent.originalText = e.target.value;
                                      setEntities(copy);
                                    }}
                                    className="h-7 text-xs"
                                  />
                                </div>

                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-semibold text-muted-foreground">Objective Description</span>
                                  <Input
                                    placeholder="e.g. Alice says she wants to leave."
                                    value={mem.intent.description}
                                    onChange={(e) => {
                                      const copy = [...entities];
                                      copy[selectedEntIndex].initialMemories[memIdx].intent.description = e.target.value;
                                      setEntities(copy);
                                    }}
                                    className="h-7 text-xs"
                                  />
                                </div>

                                {/* Targets multi-select */}
                                <div className="space-y-1">
                                  <span className="text-[10px] font-semibold text-muted-foreground block">Involved Targets</span>
                                  <div className="flex flex-wrap gap-1">
                                    {entityIds.filter(id => id !== entities[selectedEntIndex].id).map(entId => {
                                      const isSelected = mem.intent.targetIds?.includes(entId);
                                      return (
                                        <button
                                          key={entId}
                                          type="button"
                                          onClick={() => {
                                            const copy = [...entities];
                                            const targets = copy[selectedEntIndex].initialMemories[memIdx].intent.targetIds || [];
                                            if (targets.includes(entId)) {
                                              copy[selectedEntIndex].initialMemories[memIdx].intent.targetIds = targets.filter(t => t !== entId);
                                            } else {
                                              copy[selectedEntIndex].initialMemories[memIdx].intent.targetIds = [...targets, entId];
                                            }
                                            setEntities(copy);
                                          }}
                                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-all cursor-pointer ${
                                            isSelected 
                                              ? "bg-primary/20 border-primary text-primary"
                                              : "bg-background border-border/30 text-muted-foreground hover:bg-secondary"
                                          }`}
                                        >
                                          {entId}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Action Validation outcome */}
                                {mem.intent.type === "action" && (
                                  <div className="border-t border-border/20 pt-2 space-y-2">
                                    <Label className="text-[10px] text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                                      <Checkbox
                                        checked={!!mem.outcome}
                                        onCheckedChange={(checked) => {
                                          const copy = [...entities];
                                          if (checked) {
                                            copy[selectedEntIndex].initialMemories[memIdx].outcome = { isValid: true, reason: "" };
                                          } else {
                                            copy[selectedEntIndex].initialMemories[memIdx].outcome = undefined;
                                          }
                                          setEntities(copy);
                                        }}
                                      />
                                      Include validation outcome
                                    </Label>
                                    {mem.outcome && (
                                      <div className="grid grid-cols-3 gap-2 bg-secondary/15 p-2 rounded">
                                        <div className="col-span-1 flex flex-col justify-center">
                                          <Label className="text-[9px] mb-1">isValid</Label>
                                          <Checkbox
                                            checked={mem.outcome.isValid}
                                            onCheckedChange={(checked) => {
                                              const copy = [...entities];
                                              if (copy[selectedEntIndex].initialMemories[memIdx].outcome) {
                                                copy[selectedEntIndex].initialMemories[memIdx].outcome!.isValid = !!checked;
                                                setEntities(copy);
                                              }
                                            }}
                                          />
                                        </div>
                                        <div className="col-span-2 space-y-1">
                                          <Label className="text-[9px]">Reason</Label>
                                          <Input
                                            placeholder="Reason for valid/invalid status"
                                            value={mem.outcome.reason}
                                            onChange={(e) => {
                                              const copy = [...entities];
                                              if (copy[selectedEntIndex].initialMemories[memIdx].outcome) {
                                                copy[selectedEntIndex].initialMemories[memIdx].outcome!.reason = e.target.value;
                                                setEntities(copy);
                                              }
                                            }}
                                            className="h-6 text-[10px]"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>

                  </div>
                </div>
              )}

              {/* TAB 4: Live JSON Preview */}
              {activeTab === "json" && (
                <div className="flex-1 flex flex-col border border-border/20 bg-card p-6 shadow-[2px_2px_0_0_var(--border)] min-h-[400px]">
                  <div className="flex justify-between items-center border-b border-border/20 pb-3 mb-4">
                    <h2 className="text-body-lg text-primary font-bold">Scenario JSON Code Output</h2>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(compiledScenario, null, 2));
                          setStatusMessage({ text: "JSON copied to clipboard!", type: "success" });
                        }}
                        className="h-8 text-xs cursor-pointer"
                      >
                        Copy to Clipboard
                      </Button>
                    </div>
                  </div>
                  <pre className="flex-1 bg-black/40 border border-border/10 p-4 rounded overflow-auto font-mono text-xs text-emerald-400 select-text leading-relaxed">
                    {JSON.stringify(compiledScenario, null, 2)}
                  </pre>
                </div>
              )}

            </div>
          </div>
        </main>

      </div>
    </SidebarProvider>
  );
}
