/*
 * Lore — Main Dashboard Page
 * Design: Dark Technical Dashboard (IDE-inspired)
 * Layout: Left sidebar (settings/filters) + Main thread list + Right panel (email reader)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { api, type ThreadSummary, type Thread, type Config } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { ThreadList } from "@/components/ThreadList";
import { ThreadPanel } from "@/components/ThreadPanel";
import { toast } from "sonner";

export interface QueueState {
  pending: number;
  in_progress: string | null;
  completed: number;
  failed: number;
  worker_running: boolean;
  last_completed: string | null;
}

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
  const [queueState, setQueueState] = useState<QueueState | null>(null);

  // Track which thread IDs have already been enqueued this session
  const enqueuedRef = useRef<Set<string>>(new Set());
  // Polling interval ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Auto-enqueue visible threads that don't have a summary yet
  useEffect(() => {
    if (!backendOnline || filteredThreads.length === 0) return;
    const toEnqueue = filteredThreads
      .filter((t) => !t.summary && !enqueuedRef.current.has(t.id))
      .map((t) => t.id);
    if (toEnqueue.length === 0) return;
    toEnqueue.forEach((id) => enqueuedRef.current.add(id));
    api.enqueueForSummary(toEnqueue).catch(() => {});
  }, [filteredThreads, backendOnline]);

  // Poll queue status while worker is running; stop when idle
  const startPolling = useCallback(() => {
    if (pollRef.current) return; // already polling
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getQueueStatus();
        setQueueState(status);

        // If a thread just completed, refresh its summary in the list
        if (status.last_completed) {
          setThreads((prev) =>
            prev.map((t) => {
              if (t.id === status.last_completed && !t.summary) {
                // We don't have the summary text here — trigger a lightweight fetch
                api.summarize(t.id, false)
                  .then((r) => {
                    setThreads((p) =>
                      p.map((x) => (x.id === t.id ? { ...x, summary: r.summary } : x))
                    );
                    setSelectedThread((prev) =>
                      prev?.id === t.id ? { ...prev, summary: r.summary } : prev
                    );
                  })
                  .catch(() => {});
              }
              return t;
            })
          );
        }

        // Stop polling when queue is drained
        if (!status.worker_running && status.pending === 0) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch {
        // backend offline — stop polling
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 3000);
  }, []);

  // Start polling whenever we enqueue something
  useEffect(() => {
    if (!backendOnline) return;
    if (filteredThreads.some((t) => !t.summary)) {
      startPolling();
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [backendOnline, startPolling]);

  const loadThreads = useCallback(async (refresh: boolean) => {
    setLoadingThreads(true);
    try {
      const data = await api.listThreads(refresh);
      setThreads(data.threads);
      // Reset enqueued tracking on refresh so new threads get queued
      if (refresh) {
        enqueuedRef.current = new Set();
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
      // Attach any already-fetched summary
      const existing = threads.find((t) => t.id === summary.id);
      setSelectedThread({ ...thread, summary: existing?.summary ?? thread.summary });
      // Mark thread as read
      if (!summary.is_read) {
        api.markRead([summary.id]).catch(() => {});
      }
      setThreads((prev) =>
        prev.map((t) =>
          t.id === summary.id
            ? {
                ...t,
                message_count: thread.message_count,
                participant_count: thread.participant_count,
                has_full_thread: true,
                is_read: true,
              }
            : t
        )
      );
    } catch (err: any) {
      toast.error(`Failed to load thread: ${err.message}`);
    } finally {
      setLoadingThread(false);
    }
  }, [threads]);

  const handleSummarize = useCallback(
    async (threadId: string, force = false) => {
      try {
        const result = await api.summarize(threadId, force);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId ? { ...t, summary: result.summary } : t
          )
        );
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

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = threads.filter((t) => !t.is_read).map((t) => t.id);
    if (unreadIds.length === 0) return;
    try {
      await api.markRead(unreadIds);
      setThreads((prev) => prev.map((t) => ({ ...t, is_read: true })));
      toast.success(`Marked ${unreadIds.length} threads as read`);
    } catch (err: any) {
      toast.error(`Failed to mark as read: ${err.message}`);
    }
  }, [threads]);

  const handleCancelQueue = useCallback(async () => {
    try {
      await api.clearQueue();
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setQueueState(null);
      toast.info("Background summarization cancelled");
    } catch (err: any) {
      toast.error(`Failed to cancel queue: ${err.message}`);
    }
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
        unreadCount={threads.filter((t) => !t.is_read).length}
        backendOnline={backendOnline}
        onRefresh={() => loadThreads(true)}
        onMarkAllRead={handleMarkAllRead}
        loading={loadingThreads}
        queueState={queueState}
        onCancelQueue={handleCancelQueue}
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
