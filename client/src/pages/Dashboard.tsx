/*
 * Lore — Main Dashboard Page
 * Design: Dark Technical Dashboard (IDE-inspired)
 * Layout: Left sidebar (settings/filters) + Main thread list + Right panel (email reader)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
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
  const [selectedEmailIndex, setSelectedEmailIndex] = useState<number | null>(null);

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

  // Stream queue status using Server-Sent Events (SSE)
  const startPolling = useCallback(() => {
    if (pollRef.current) return; // already streaming
    
    // Uses the proxy in vite.config.ts if available, or relative path
    const es = new EventSource('/api/queue/stream');
    
    es.onmessage = (event) => {
      try {
        const status = JSON.parse(event.data);
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

        // Stop streaming when queue is drained
        if (!status.worker_running && status.pending === 0) {
          es.close();
          pollRef.current = null;
        }
      } catch (e) {}
    };

    es.onerror = () => {
      es.close();
      pollRef.current = null;
    };

    pollRef.current = es as any;
  }, []);

  // Start streaming whenever we enqueue something
  useEffect(() => {
    if (!backendOnline) return;
    if (filteredThreads.some((t) => !t.summary)) {
      startPolling();
    }
    return () => {
      if (pollRef.current) {
        (pollRef.current as unknown as EventSource).close();
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
    } catch (err: unknown) {
      toast.error(`Failed to load threads: ${err instanceof Error ? err.message : String(err)}`);
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
      setSelectedThread({ ...thread, summary: existing?.summary ?? thread.summary, versions: existing?.versions });
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
    } catch (err: unknown) {
      toast.error(`Failed to load thread: ${err instanceof Error ? err.message : String(err)}`);
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
      } catch (err: unknown) {
        toast.error(`Summarization failed: ${err instanceof Error ? err.message : String(err)}`);
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
    } catch (err: unknown) {
      toast.error(`Failed to save settings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [loadThreads]);


  const handleSelectVersion = useCallback((id: string) => {
    const t = threads.find(x => x.id === id);
    if (t) {
      handleSelectThread(t);
    } else {
      // Fetch thread directly if not in current view
      toast.info("Fetching older version...");
      api.getThread(id).then(thread => {
         setSelectedThread(thread);
      }).catch(err => toast.error(`Failed to load version: ${err instanceof Error ? err.message : String(err)}`));
    }
  }, [threads, handleSelectThread]);

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
    } catch (err: unknown) {
      toast.error(`Failed to mark as read: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [threads]);

  const handleCancelQueue = useCallback(async () => {
    try {
      await api.clearQueue();
      if (pollRef.current) {
        (pollRef.current as unknown as EventSource).close();
        pollRef.current = null;
      }
      setQueueState(null);
      toast.info("Background summarization cancelled");
    } catch (err: unknown) {
      toast.error(`Failed to cancel queue: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Left Sidebar — fixed width, not part of resizable group */}
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

      {/* Resizable main area: thread list + thread panel */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* Thread list panel */}
        <ResizablePanel defaultSize={selectedThread ? 40 : 100} minSize={20}>
          <div className="h-full flex flex-col overflow-hidden">
            <ThreadList
              threads={filteredThreads}
              selectedId={selectedThread?.id}
              selectedThread={selectedThread}
              loading={loadingThreads}
              onSelect={handleSelectThread}
              onSummarize={handleSummarize}
              onEmailSelect={(emailIndex) => {
                setSelectedEmailIndex(emailIndex);
              }}
              backendOnline={backendOnline}
            />
          </div>
        </ResizablePanel>

        {/* Thread detail panel */}
        {selectedThread && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={60} minSize={25}>
              <div className="h-full flex flex-col overflow-hidden">
                <ThreadPanel
                  thread={selectedThread}
                  loading={loadingThread}
                  onClose={handleCloseThread}
                  onSummarize={handleSummarize}
                  initialEmailIndex={selectedEmailIndex}
                  onEmailIndexConsumed={() => setSelectedEmailIndex(null)}
                  onSelectVersion={handleSelectVersion}
                />
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
