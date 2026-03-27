/*
 * Lore — Thread List Component
 * Design: Dense, scannable list of thread cards with color-coded type borders
 */

import { useState } from "react";
import { type ThreadSummary } from "@/lib/api";
import {
  cn,
  formatDate,
  getThreadTypeBadgeClass,
  getThreadTypeBorderColor,
  getInitials,
  stringToColor,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, MessageSquare, Users, ExternalLink, Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";

interface ThreadListProps {
  threads: ThreadSummary[];
  selectedId?: string;
  loading: boolean;
  onSelect: (thread: ThreadSummary) => void;
  onSummarize: (threadId: string, force?: boolean) => Promise<string | null>;
  backendOnline: boolean;
}

function ThreadCard({
  thread,
  selected,
  onSelect,
  onSummarize,
}: {
  thread: ThreadSummary;
  selected: boolean;
  onSelect: () => void;
  onSummarize: (force?: boolean) => Promise<string | null>;
}) {
  const [summarizing, setSummarizing] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const handleSummarize = async (e: React.MouseEvent, force = false) => {
    e.stopPropagation();
    setSummarizing(true);
    setSummaryExpanded(true);
    await onSummarize(force);
    setSummarizing(false);
  };

  // A summary is considered an error if it starts with a known error prefix
  const isSummaryError = thread.summary
    ? /^(No API key|claude CLI|codex CLI|Summary generation failed|Ollama error|AI summarization is disabled)/i.test(
        thread.summary
      )
    : false;

  const initials = getInitials(thread.author);
  const avatarColor = stringToColor(thread.author_email);

  const isUnread = !thread.is_read;

  return (
    <div
      className={cn(
        "group border-l-2 px-4 py-3 cursor-pointer transition-colors border-b border-border",
        getThreadTypeBorderColor(thread.type),
        selected
          ? "bg-accent/60"
          : "hover:bg-accent/30"
      )}
      onClick={onSelect}
    >
      {/* Top row: avatar + subject + date */}
      <div className="flex items-start gap-2.5">
        {/* Avatar with unread dot */}
        <div className="relative shrink-0 mt-0.5">
          <div
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
              avatarColor
            )}
          >
            {initials}
          </div>
          {isUnread && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-400 border-2 border-background" />
          )}
        </div>

        {/* Subject + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={cn(
                "text-sm leading-snug line-clamp-2",
                isUnread ? "font-semibold text-foreground" : "font-medium",
                selected ? "text-foreground" : "text-foreground/90"
              )}
            >
              {thread.subject}
            </h3>
            <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">
              {formatDate(thread.date)}
            </span>
          </div>

          {/* Author + type badge */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground truncate">
              {thread.author}
            </span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-mono uppercase shrink-0",
                getThreadTypeBadgeClass(thread.type)
              )}
            >
              {thread.type}
            </span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MessageSquare className="w-3 h-3" />
              {thread.message_count}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="w-3 h-3" />
              {thread.participant_count}
            </span>
            <a
              href={thread.lore_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-blue-400 transition-colors ml-auto"
            >
              <ExternalLink className="w-3 h-3" />
              lore
            </a>
          </div>
        </div>
      </div>

      {/* Summary section */}
      {thread.summary && !isSummaryError ? (
        <div className="mt-2 ml-9">
          {summaryExpanded || thread.summary.length < 200 ? (
            <div className="text-xs text-muted-foreground leading-relaxed prose prose-invert prose-xs max-w-none">
              <Streamdown>{thread.summary.slice(0, 600)}</Streamdown>
              <button
                className="mt-1 text-[10px] text-muted-foreground/50 hover:text-blue-400 transition-colors"
                onClick={(e) => handleSummarize(e, true)}
              >
                {summarizing ? "Regenerating..." : "↺ Regenerate"}
              </button>
            </div>
          ) : (
            <button
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setSummaryExpanded(true);
              }}
            >
              Show AI summary ↓
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 ml-9">
          {isSummaryError && (
            <p className="text-[11px] text-red-400/80 mb-1 line-clamp-2">{thread.summary}</p>
          )}
          <div className={cn(!isSummaryError && "opacity-0 group-hover:opacity-100 transition-opacity")}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] text-muted-foreground hover:text-blue-400 px-2 gap-1"
              onClick={(e) => handleSummarize(e, isSummaryError)}
              disabled={summarizing}
            >
              {summarizing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {summarizing ? "Summarizing..." : isSummaryError ? "Retry Summary" : "AI Summary"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ThreadList({
  threads,
  selectedId,
  loading,
  onSelect,
  onSummarize,
  backendOnline,
}: ThreadListProps) {
  if (!backendOnline) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <span className="text-red-400 text-xl">⚠</span>
          </div>
          <h3 className="text-sm font-medium text-foreground mb-1">
            Backend offline
          </h3>
          <p className="text-xs text-muted-foreground max-w-xs">
            Start the backend server with{" "}
            <code className="font-mono bg-muted px-1 rounded">
              python3 backend/main.py
            </code>
          </p>
        </div>
      </div>
    );
  }

  if (loading && threads.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="border-l-2 border-l-slate-700 px-4 py-3 border-b border-border">
            <div className="flex items-start gap-2.5">
              <Skeleton className="w-7 h-7 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium text-foreground mb-1">
            No threads found
          </h3>
          <p className="text-xs text-muted-foreground">
            Try refreshing or adjusting your filters
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
      {/* List header */}
      <div className="px-4 py-2 border-b border-border bg-card/50 flex items-center justify-between shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Threads
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          {threads.length}
        </span>
      </div>

      {/* Thread cards */}
      <div className="flex-1 overflow-y-auto">
        {threads.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            selected={thread.id === selectedId}
            onSelect={() => onSelect(thread)}
            onSummarize={(force) => onSummarize(thread.id, force)}
          />
        ))}
      </div>
    </div>
  );
}
