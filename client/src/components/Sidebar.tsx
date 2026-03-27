/*
 * Lore — Sidebar Component
 * Design: Dark IDE-inspired sidebar with settings, filters, and navigation
 */

import { useState } from "react";
import { type Config } from "@/lib/api";
import { cn, getThreadTypeBadgeClass } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Settings,
  ChevronDown,
  ChevronUp,
  Wifi,
  WifiOff,
  Search,
  Filter,
  Layers,
} from "lucide-react";

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  config: Config | null;
  onConfigSave: (updates: Partial<Config>) => void;
  filterType: string;
  onFilterType: (type: string) => void;
  searchQuery: string;
  onSearchQuery: (q: string) => void;
  threadCounts: Record<string, number>;
  backendOnline: boolean;
  onRefresh: () => void;
  loading: boolean;
}

const FILTER_TYPES = [
  { value: "all", label: "All Threads" },
  { value: "patch", label: "Patches" },
  { value: "rfc", label: "RFC" },
  { value: "discussion", label: "Discussion" },
  { value: "pull", label: "Pull Requests" },
];

const AI_PROVIDERS = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "openai", label: "OpenAI GPT" },
  { value: "ollama", label: "Ollama (local)" },
  { value: "none", label: "Disabled" },
];

const CLAUDE_MODELS = [
  { value: "claude-opus-4-5", label: "Claude Opus 4.5" },
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
];

const OPENAI_MODELS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

export function Sidebar({
  open,
  onToggle,
  config,
  onConfigSave,
  filterType,
  onFilterType,
  searchQuery,
  onSearchQuery,
  threadCounts,
  backendOnline,
  onRefresh,
  loading,
}: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState<Partial<Config>>({});
  const [dirty, setDirty] = useState(false);

  const updateLocal = (key: keyof Config, value: any) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    onConfigSave(localConfig);
    setLocalConfig({});
    setDirty(false);
  };

  const getVal = <K extends keyof Config>(key: K): Config[K] | undefined => {
    if (key in localConfig) return localConfig[key] as Config[K];
    return config?.[key];
  };

  const currentProvider = getVal("ai_provider") || "claude";

  const getModelOptions = () => {
    if (currentProvider === "claude") return CLAUDE_MODELS;
    if (currentProvider === "openai") return OPENAI_MODELS;
    return [];
  };

  return (
    <div
      className={cn(
        "flex flex-col border-r border-border bg-sidebar transition-all duration-200 ease-in-out shrink-0",
        open ? "w-64" : "w-12"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        {open && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center shrink-0">
              <Layers className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground truncate">
              Lore
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onToggle}
        >
          {open ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
      </div>

      {open && (
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          {/* Status */}
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              {backendOnline ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  <span className="text-xs text-emerald-400">Backend online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-red-400" />
                  <span className="text-xs text-red-400">Backend offline</span>
                </>
              )}
            </div>
            {config && (
              <div className="mt-1 text-xs text-muted-foreground truncate">
                {config.list_name} · last {config.days_back}d
              </div>
            )}
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search threads..."
                value={searchQuery}
                onChange={(e) => onSearchQuery(e.target.value)}
                className="pl-7 h-7 text-xs bg-input border-border"
              />
            </div>
          </div>

          {/* Filter by type */}
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-1.5 mb-2">
              <Filter className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Filter
              </span>
            </div>
            <div className="space-y-0.5">
              {FILTER_TYPES.map((ft) => (
                <button
                  key={ft.value}
                  onClick={() => onFilterType(ft.value)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                    filterType === ft.value
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  <span>{ft.label}</span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-mono",
                      ft.value !== "all"
                        ? getThreadTypeBadgeClass(ft.value)
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {threadCounts[ft.value] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Refresh */}
          <div className="px-3 py-2 border-b border-border">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs gap-1.5 border-border"
              onClick={onRefresh}
              disabled={loading || !backendOnline}
            >
              <RefreshCw
                className={cn("w-3 h-3", loading && "animate-spin")}
              />
              {loading ? "Fetching..." : "Refresh Threads"}
            </Button>
          </div>

          {/* Settings */}
          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border-b border-border transition-colors">
                <div className="flex items-center gap-1.5">
                  <Settings className="w-3 h-3" />
                  <span className="uppercase tracking-wider">Settings</span>
                </div>
                {settingsOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 py-3 space-y-3 border-b border-border">
                {/* Mailing list */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    List ID
                  </Label>
                  <Input
                    value={getVal("list_id") || ""}
                    onChange={(e) => updateLocal("list_id", e.target.value)}
                    placeholder="bpf.vger.kernel.org"
                    className="h-7 text-xs bg-input border-border font-mono"
                  />
                </div>

                {/* Days back */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Days to fetch
                  </Label>
                  <Input
                    type="number"
                    value={getVal("days_back") || 30}
                    onChange={(e) =>
                      updateLocal("days_back", parseInt(e.target.value) || 30)
                    }
                    min={1}
                    max={365}
                    className="h-7 text-xs bg-input border-border"
                  />
                </div>

                {/* b4 folder */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    b4 folder (optional)
                  </Label>
                  <Input
                    value={getVal("b4_folder") || ""}
                    onChange={(e) =>
                      updateLocal("b4_folder", e.target.value || null)
                    }
                    placeholder="/path/to/mbox/folder"
                    className="h-7 text-xs bg-input border-border font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Leave empty to use managed cache
                  </p>
                </div>

                {/* AI Provider */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    AI Provider
                  </Label>
                  <Select
                    value={currentProvider}
                    onValueChange={(v) => updateLocal("ai_provider", v)}
                  >
                    <SelectTrigger className="h-7 text-xs bg-input border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_PROVIDERS.map((p) => (
                        <SelectItem key={p.value} value={p.value} className="text-xs">
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* AI Model */}
                {(currentProvider === "claude" || currentProvider === "openai") && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Model
                    </Label>
                    <Select
                      value={getVal("ai_model") || ""}
                      onValueChange={(v) => updateLocal("ai_model", v)}
                    >
                      <SelectTrigger className="h-7 text-xs bg-input border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getModelOptions().map((m) => (
                          <SelectItem key={m.value} value={m.value} className="text-xs">
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Ollama URL */}
                {currentProvider === "ollama" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Ollama URL
                    </Label>
                    <Input
                      value={getVal("ollama_url") || ""}
                      onChange={(e) => updateLocal("ollama_url", e.target.value)}
                      placeholder="http://localhost:11434"
                      className="h-7 text-xs bg-input border-border font-mono"
                    />
                  </div>
                )}

                {/* API Key */}
                {(currentProvider === "claude" || currentProvider === "openai") && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      API Key
                    </Label>
                    <Input
                      type="password"
                      value={getVal("ai_api_key") || ""}
                      onChange={(e) => updateLocal("ai_api_key", e.target.value)}
                      placeholder="sk-..."
                      className="h-7 text-xs bg-input border-border font-mono"
                    />
                  </div>
                )}

                {/* Save button */}
                {dirty && (
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs"
                    onClick={handleSave}
                  >
                    Save Settings
                  </Button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Footer */}
          <div className="mt-auto px-3 py-2">
            <p className="text-[10px] text-muted-foreground">
              Powered by b4 + lore.kernel.org
            </p>
          </div>
        </div>
      )}

      {/* Collapsed state icons */}
      {!open && (
        <div className="flex flex-col items-center gap-2 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
            disabled={loading || !backendOnline}
            title="Refresh threads"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => {
              onToggle();
              setTimeout(() => setSettingsOpen(true), 200);
            }}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
