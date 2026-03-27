/*
 * Lore — Thread Panel Component
 * Design: Full-width email reader with monospace body, thread navigation
 */

import { useState } from "react";
import { type Thread, type EmailMessage } from "@/lib/api";
import {
  cn,
  formatFullDate,
  getThreadTypeBadgeClass,
  getInitials,
  stringToColor,
  parseEmailBody,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Loader2,
  Users,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Streamdown } from "streamdown";

interface ThreadPanelProps {
  thread: Thread;
  loading: boolean;
  onClose: () => void;
  onSummarize: (threadId: string, force?: boolean) => Promise<string | null>;
}

function renderEmailLine(line: string, idx: number) {
  // Diff additions
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return <div key={idx} className="text-emerald-400 bg-emerald-500/5">{line}</div>;
  }
  // Diff deletions
  if (line.startsWith('-') && !line.startsWith('---')) {
    return <div key={idx} className="text-red-400 bg-red-500/5">{line}</div>;
  }
  // Diff hunk headers
  if (line.startsWith('@@')) {
    return <div key={idx} className="text-cyan-400 bg-cyan-500/5">{line}</div>;
  }
  // Diff file headers
  if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
    return <div key={idx} className="text-muted-foreground">{line}</div>;
  }
  return <div key={idx}>{line}</div>;
}

function EmailViewer({ email, defaultExpanded = false }: { email: EmailMessage; defaultExpanded?: boolean }) {
  const [bodyExpanded, setBodyExpanded] = useState(defaultExpanded);
  const segments = parseEmailBody(email.body);
  const initials = getInitials(email.from_name);
  const avatarColor = stringToColor(email.from_email);

  // First line of the body (non-empty, non-quoted) for collapsed preview
  const previewLine = email.body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith(">") && !l.startsWith("|"));

  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      {/* Email header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setBodyExpanded((v) => !v)}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0",
            avatarColor
          )}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {email.from_name}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatFullDate(email.date)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground truncate">
              {email.from_email}
            </span>
            <a
              href={email.lore_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-blue-400 transition-colors ml-auto shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              lore
            </a>
          </div>
          {email.subject && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {email.subject}
            </p>
          )}
          {/* Collapsed preview: first line of body */}
          {!bodyExpanded && previewLine && (
            <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate italic">
              {previewLine.slice(0, 120)}
            </p>
          )}
        </div>
        <div className="shrink-0 text-muted-foreground">
          {bodyExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* Email body */}
      {bodyExpanded && (
        <div className="border-t border-border px-4 py-3">
          <div className="email-body text-foreground/85">
            {segments.map((seg, i) =>
              seg.type === "quoted" ? (
                <div
                  key={i}
                  className="border-l-2 border-border pl-3 text-muted-foreground my-1"
                >
                  {seg.text.split("\n").map((line, j) => (
                    <div key={j}>{line}</div>
                  ))}
                </div>
              ) : (
                <div key={i}>
                  {seg.text.split("\n").map((line, j) => renderEmailLine(line, j))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ThreadPanel({
  thread,
  loading,
  onClose,
  onSummarize,
}: ThreadPanelProps) {
  const [currentEmailIndex, setCurrentEmailIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"all" | "single">("all");
  const [summarizing, setSummarizing] = useState(false);

  const emails = thread.emails || [];
  const currentEmail = emails[currentEmailIndex];

  const handleSummarize = async (force = false) => {
    setSummarizing(true);
    await onSummarize(thread.id, force);
    setSummarizing(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-mono uppercase shrink-0",
                  getThreadTypeBadgeClass(thread.type)
                )}
              >
                {thread.type}
              </span>
              <a
                href={thread.lore_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-blue-400 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View on lore.kernel.org
              </a>
            </div>
            <h2 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
              {thread.subject}
            </h2>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageSquare className="w-3 h-3" />
                {thread.message_count} messages
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                {thread.participant_count} participants
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* View mode + navigation */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex rounded border border-border overflow-hidden text-xs">
            <button
              className={cn(
                "px-2.5 py-1 transition-colors",
                viewMode === "all"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setViewMode("all")}
            >
              All ({emails.length})
            </button>
            <button
              className={cn(
                "px-2.5 py-1 border-l border-border transition-colors",
                viewMode === "single"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setViewMode("single")}
            >
              Single
            </button>
          </div>

          {viewMode === "single" && (
            <div className="flex items-center gap-1 ml-auto">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={currentEmailIndex === 0}
                onClick={() => setCurrentEmailIndex((i) => i - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground font-mono">
                {currentEmailIndex + 1}/{emails.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={currentEmailIndex === emails.length - 1}
                onClick={() => setCurrentEmailIndex((i) => i + 1)}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* AI Summary button */}
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-7 text-xs gap-1.5 border-border ml-auto",
              viewMode === "single" && "ml-0"
            )}
            onClick={() => handleSummarize(!!thread.summary)}
            disabled={summarizing}
          >
            {summarizing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : thread.summary ? (
              <RefreshCw className="w-3 h-3" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {summarizing
              ? "Summarizing..."
              : thread.summary
              ? "Re-summarize"
              : "AI Summary"}
          </Button>
        </div>
      </div>

      {/* AI Summary section — scrollable, capped at 40% viewport height */}
      {thread.summary && (
        <div className="border-b border-border bg-blue-500/5 shrink-0" style={{ maxHeight: "40vh" }}>
          <ScrollArea className="h-full max-h-[40vh]">
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-blue-400">AI Summary</span>
              </div>
              <div className="text-xs text-foreground/85 leading-relaxed prose prose-invert prose-xs max-w-none">
                <Streamdown>{thread.summary}</Streamdown>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Email content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : viewMode === "all" ? (
            emails.map((email, i) => (
              <EmailViewer key={email.id || i} email={email} defaultExpanded={i === 0} />
            ))
          ) : currentEmail ? (
            <EmailViewer email={currentEmail} defaultExpanded={true} />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
