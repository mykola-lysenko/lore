/*
 * Lore — Main Dashboard Page
 * Design: Dark Technical Dashboard (IDE-inspired)
 * Layout: Left sidebar (settings/filters) + Main thread list + Right panel (email reader)
 */

import { useState, useEffect, useCallback } from "react";
import { api, type ThreadSummary, type Thread, type Config } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { ThreadList } from "@/components/ThreadList";
import { ThreadPanel } from "@/components/ThreadPanel";
import { toast } from "sonner";

export default function Dashboard() {
  const [config, setConfig] = useState<Config | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [filteredThreads, setFilteredThreads] = useState<ThreadSummary[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Check backend health
  useEffect(() => {
    api.health()
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
  }, []);

  // Load config
  useEffect(() => {
    if (backendOnline) {
      api.getConfig().then(setConfig).catch(console.error);
    }
  }, [backendOnline]);

  // Load threads on mount
  useEffect(() => {
    if (backendOnline) {
      loadThreads(false);
    }
  }, [backendOnline]);

  // Apply filters
  useEffect(() => {
    let result = threads;
    if (filterType !== "all") {
      result = result.filter((t) => t.type === filterType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.author.toLowerCase().includes(q) ||
          t.author_email.toLowerCase().includes(q)
      );
    }
    setFilteredThreads(result);
  }, [threads, filterType, searchQuery]);

  const loadThreads = useCallback(async (refresh: boolean) => {
    setLoadingThreads(true);
    try {
      const data = await api.listThreads(refresh);
      setThreads(data.threads);
      if (refresh) {
        toast.success(`Loaded ${data.count} threads`);
      }
    } catch (err: any) {
      toast.error(`Failed to load threads: ${err.message}`);
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const handleSelectThread = useCallback(async (summary: ThreadSummary) => {
    setLoadingThread(true);
    try {
      const thread = await api.getThread(summary.id);
      setSelectedThread(thread);
      // Update the summary in the list with full message count
      setThreads((prev) =>
        prev.map((t) =>
          t.id === summary.id
            ? {
                ...t,
                message_count: thread.message_count,
                participant_count: thread.participant_count,
                has_full_thread: true,
              }
            : t
        )
      );
    } catch (err: any) {
      toast.error(`Failed to load thread: ${err.message}`);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  const handleSummarize = useCallback(
    async (threadId: string, force = false) => {
      try {
        const result = await api.summarize(threadId, force);
        // Update thread in list
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId ? { ...t, summary: result.summary } : t
          )
        );
        // Update selected thread if it matches
        setSelectedThread((prev) =>
          prev?.id === threadId ? { ...prev, summary: result.summary } : prev
        );
        return result.summary;
      } catch (err: any) {
        toast.error(`Summarization failed: ${err.message}`);
        return null;
      }
    },
    []
  );

  const handleConfigSave = useCallback(async (updates: Partial<Config>) => {
    try {
      await api.updateConfig(updates);
      const newConfig = await api.getConfig();
      setConfig(newConfig);
      toast.success("Settings saved");
      // Reload threads if list changed
      if (updates.list_id || updates.days_back) {
        await api.clearCache();
        await loadThreads(true);
      }
    } catch (err: any) {
      toast.error(`Failed to save settings: ${err.message}`);
    }
  }, [loadThreads]);

  const handleCloseThread = useCallback(() => {
    setSelectedThread(null);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Left Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        config={config}
        onConfigSave={handleConfigSave}
        filterType={filterType}
        onFilterType={setFilterType}
        searchQuery={searchQuery}
        onSearchQuery={setSearchQuery}
        threadCounts={{
          all: threads.length,
          patch: threads.filter((t) => t.type === "patch").length,
          rfc: threads.filter((t) => t.type === "rfc").length,
          discussion: threads.filter((t) => t.type === "discussion").length,
          pull: threads.filter((t) => t.type === "pull").length,
        }}
        backendOnline={backendOnline}
        onRefresh={() => loadThreads(true)}
        loading={loadingThreads}
      />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Thread list */}
        <ThreadList
          threads={filteredThreads}
          selectedId={selectedThread?.id}
          loading={loadingThreads}
          onSelect={handleSelectThread}
          onSummarize={handleSummarize}
          backendOnline={backendOnline}
        />

        {/* Thread detail panel */}
        {selectedThread && (
          <ThreadPanel
            thread={selectedThread}
            loading={loadingThread}
            onClose={handleCloseThread}
            onSummarize={handleSummarize}
          />
        )}
      </div>
    </div>
  );
}
