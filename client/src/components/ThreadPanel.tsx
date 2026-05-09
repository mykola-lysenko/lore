/*
 * Lore — Thread Panel Component
 * Design: Full-width email reader with monospace body, thread navigation
 */

import { useState, useEffect } from "react";
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
import { type ThreadComment, api } from "@/lib/api";
import { ReplyDialog } from "./ReplyDialog";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ThreadPanelProps {
  thread: Thread;
  loading: boolean;
  onClose: () => void;
  onSummarize: (threadId: string, force?: boolean) => Promise<string | null>;
  initialEmailIndex?: number | null;
  onEmailIndexConsumed?: () => void;
  onSelectVersion?: (id: string) => void;
}

function EmailLine({ 
  line, 
  idx, 
  msgId,
  threadId,
  comments,
  onCommentAdded,
  onCommentDeleted,
  readonly = false
}: { 
  line: string; 
  idx: number; 
  msgId: string;
  threadId: string;
  comments: ThreadComment[];
  onCommentAdded: (c: ThreadComment) => void;
  onCommentDeleted: (id: string) => void;
  readonly?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const lineComments = comments.filter(c => c.line_index === idx);

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const c = await api.addComment(threadId, msgId, idx, line.trim(), draft.trim());
      onCommentAdded(c);
      setIsEditing(false);
      setDraft("");
    } catch (err: unknown) {
      toast.error(`Failed to save comment: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteComment(threadId, id);
      onCommentDeleted(id);
    } catch (err: unknown) {
      toast.error(`Failed to delete comment: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  let contentClass = "";
  if (line.startsWith('+') && !line.startsWith('+++')) contentClass = "text-emerald-400 bg-emerald-500/5";
  else if (line.startsWith('-') && !line.startsWith('---')) contentClass = "text-red-400 bg-red-500/5";
  else if (line.startsWith('@@')) contentClass = "text-cyan-400 bg-cyan-500/5";
  else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) contentClass = "text-muted-foreground";

  return (
    <div className="group relative">
      <div className={cn("pr-2 min-h-[20px] whitespace-pre-wrap", contentClass)}>{line || " "}</div>
      
      {!readonly && !isEditing && (
        <button
          onClick={() => setIsEditing(true)}
          className="absolute -left-6 top-0 opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-blue-400 transition-colors bg-background"
          title="Add comment"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" />
        </button>
      )}

      {isEditing && (
        <div className="my-2 ml-4 p-3 bg-card border border-blue-500/30 rounded-md shadow-sm z-10 relative">
          <textarea
            autoFocus
            className="w-full bg-input/50 border border-border rounded p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-sans"
            rows={3}
            placeholder="Leave a comment..."
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSave();
              if (e.key === "Escape") setIsEditing(false);
            }}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !draft.trim()}>
              {saving ? "Saving..." : "Comment"}
            </Button>
          </div>
        </div>
      )}

      {lineComments.length > 0 && (
        <div className="my-1 ml-4 space-y-2 relative z-10">
          {lineComments.map(c => (
            <div key={c.id} className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md group/comment relative">
              <div className="text-sm text-foreground whitespace-pre-wrap font-sans">{c.comment}</div>
              <button
                onClick={() => handleDelete(c.id)}
                className="absolute top-2 right-2 opacity-0 group-hover/comment:opacity-100 p-1 text-red-400/70 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailViewer({ 
  threadId,
  email, 
  comments,
  onCommentAdded,
  onCommentDeleted,
  defaultExpanded = false 
}: { 
  threadId: string;
  email: EmailMessage; 
  comments: ThreadComment[];
  onCommentAdded: (c: ThreadComment) => void;
  onCommentDeleted: (id: string) => void;
  defaultExpanded?: boolean; 
}) {
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
            <div className="ml-auto flex items-center gap-3 shrink-0">
              {comments.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    document.dispatchEvent(new CustomEvent("open-reply-dialog", { detail: email.id }));
                  }}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-medium transition-colors bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20"
                >
                  <MessageSquarePlus className="w-3 h-3" />
                  Draft Reply ({comments.length})
                </button>
              )}
              <a
                href={email.lore_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-blue-400 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                lore
              </a>
            </div>
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

      {/* Email body — each expanded email has its own scroll region */}
      {bodyExpanded && (
        <div className="border-t border-border">
          <div className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
            <div className="px-4 py-3">
              <div className="email-body text-foreground/85">
                {segments.map((seg, i) => {
                  const offset = segments.slice(0, i).reduce((acc, s) => acc + s.text.split("\n").length, 0);
                  
                  return seg.type === "quoted" ? (
                    <div
                      key={i}
                      className="border-l-2 border-border pl-3 text-muted-foreground my-1"
                    >
                      {seg.text.split("\n").map((line, j) => (
                        <div key={j}>{line}</div>
                      ))}
                    </div>
                  ) : (
                    <div key={i} className="pl-6">
                      {seg.text.split("\n").map((line, j) => (
                        <EmailLine 
                          key={offset + j} 
                          line={line} 
                          idx={offset + j} 
                          msgId={email.id}
                          threadId={threadId}
                          comments={comments}
                          onCommentAdded={onCommentAdded}
                          onCommentDeleted={onCommentDeleted}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
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
  initialEmailIndex,
  onEmailIndexConsumed,
  onSelectVersion,
}: ThreadPanelProps) {
  const [currentEmailIndex, setCurrentEmailIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"all" | "single" | "compare">("all");
  const [compareV1, setCompareV1] = useState<number | null>(null);
  const [compareV2, setCompareV2] = useState<number | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Initialize compare versions automatically when toggling compare mode
  useEffect(() => {
    if (viewMode === "compare" && thread.versions && thread.versions.length >= 2) {
      if (compareV1 === null || compareV2 === null) {
        // default to latest and one before latest
        const sorted = [...thread.versions].sort((a, b) => a.version - b.version);
        setCompareV1(sorted[sorted.length - 2].version);
        setCompareV2(sorted[sorted.length - 1].version);
      }
    }
  }, [viewMode, thread.versions, compareV1, compareV2]);

  // Fetch diff when versions change
  useEffect(() => {
    if (viewMode === "compare" && compareV1 !== null && compareV2 !== null) {
      setDiffLoading(true);
      setDiffError(null);
      
      // Look up the msgid of the newer version to use as the base target for b4
      const v2Obj = thread.versions?.find(v => v.version === compareV2);
      const targetId = v2Obj ? v2Obj.id : thread.id;

      import("@/lib/api").then(({ api }) => {
        api.getThreadDiff(targetId, compareV1, compareV2)
          .then(res => setDiffText(res.diff))
          .catch(err => setDiffError(err instanceof Error ? err.message : String(err)))
          .finally(() => setDiffLoading(false));
      });
    }
  }, [viewMode, compareV1, compareV2, thread.id, thread.versions]);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  
  const [localComments, setLocalComments] = useState<Record<string, ThreadComment[]>>(thread.comments || {});

  useEffect(() => {
    setLocalComments(thread.comments || {});
  }, [thread.comments]);

  useEffect(() => {
    const handler = (e: Event) => {
      const msgId = (e as CustomEvent).detail;
      setReplyTargetId(msgId);
      setReplyDialogOpen(true);
    };
    document.addEventListener("open-reply-dialog", handler);
    return () => document.removeEventListener("open-reply-dialog", handler);
  }, []);

  const handleAddComment = (msgId: string, c: ThreadComment) => {
    setLocalComments(prev => ({
      ...prev,
      [msgId]: [...(prev[msgId] || []), c]
    }));
  };

  const handleDeleteComment = (msgId: string, cId: string) => {
    setLocalComments(prev => ({
      ...prev,
      [msgId]: (prev[msgId] || []).filter(c => c.id !== cId)
    }));
  };

  // When the outline in the middle pane is clicked, jump to that email in single mode
  useEffect(() => {
    if (initialEmailIndex != null) {
      setCurrentEmailIndex(initialEmailIndex);
      setViewMode("single");
      onEmailIndexConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmailIndex]);

  const emails = thread.emails || [];
  const currentEmail = emails[currentEmailIndex];

  const handleSummarize = async (force = false) => {
    setSummarizing(true);
    await onSummarize(thread.id, force);
    setSummarizing(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
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
              
              {thread.versions && thread.versions.length > 1 && (
                <div className="flex items-center gap-1 ml-2 text-xs">
                  <span className="text-muted-foreground">Versions:</span>
                  {thread.versions.map(v => (
                    <button
                      key={v.version}
                      onClick={() => onSelectVersion?.(v.id)}
                      className={cn(
                        "px-1.5 py-0.5 rounded font-mono transition-colors border",
                        v.id === thread.id
                          ? "bg-blue-500/20 text-blue-400 border-blue-500/30 font-medium"
                          : "bg-muted text-muted-foreground border-transparent hover:bg-accent hover:text-foreground"
                      )}
                    >
                      v{v.version}
                    </button>
                  ))}
                </div>
              )}
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
            {thread.versions && thread.versions.length > 1 && (
              <button
                className={cn(
                  "px-2.5 py-1 border-l border-border transition-colors",
                  viewMode === "compare"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setViewMode("compare")}
              >
                Compare
              </button>
            )}
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

      {/* AI Summary section — collapsible, capped at 40vh, independently scrollable */}
      {thread.summary && (
        <div className="border-b border-border bg-blue-500/5 shrink-0">
          {/* Summary header — always visible, click to collapse */}
          <button
            className="w-full flex items-center gap-1.5 px-4 py-2 hover:bg-blue-500/10 transition-colors text-left"
            onClick={() => setSummaryCollapsed((v) => !v)}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-xs font-medium text-blue-400 flex-1">AI Summary</span>
            {summaryCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5 text-blue-400/60" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-blue-400/60" />
            )}
          </button>
          {/* Summary body — hidden when collapsed */}
          {!summaryCollapsed && (
            <div
              className="overflow-y-auto"
              style={{ maxHeight: "40vh" }}
            >
              <div className="px-4 pb-3">
                <div className="text-xs text-foreground/85 leading-relaxed prose prose-invert prose-xs max-w-none">
                  <Streamdown>{thread.summary}</Streamdown>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Email content — takes remaining height, scrolls independently */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : viewMode === "compare" ? (
            <div className="flex flex-col h-full bg-card border border-border rounded-md overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-3 text-xs shrink-0">
                <span className="text-muted-foreground font-medium">Range-diff</span>
                <select 
                  className="bg-input border border-border rounded px-1.5 py-0.5 text-foreground font-mono"
                  value={compareV1 || ""}
                  onChange={e => setCompareV1(Number(e.target.value))}
                >
                  {thread.versions?.map(v => (
                    <option key={v.version} value={v.version} disabled={v.version >= (compareV2 || 999)}>
                      v{v.version}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground">..</span>
                <select 
                  className="bg-input border border-border rounded px-1.5 py-0.5 text-foreground font-mono"
                  value={compareV2 || ""}
                  onChange={e => setCompareV2(Number(e.target.value))}
                >
                  {thread.versions?.map(v => (
                    <option key={v.version} value={v.version} disabled={v.version <= (compareV1 || 0)}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-4 text-[13px] font-mono leading-relaxed bg-black/40">
                {diffLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-3">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Computing range-diff via b4...</p>
                  </div>
                ) : diffError ? (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded text-red-400">
                    <p className="font-medium mb-1">Failed to generate diff</p>
                    <p className="text-xs opacity-80 font-mono whitespace-pre-wrap">{diffError}</p>
                  </div>
                ) : diffText ? (
                  <div className="whitespace-pre-wrap pl-6">
                    {diffText.split("\n").map((line, i) => (
                      <EmailLine 
                        key={i} 
                        line={line} 
                        idx={i} 
                        msgId="diff" 
                        threadId={thread.id} 
                        comments={[]} 
                        onCommentAdded={() => {}} 
                        onCommentDeleted={() => {}} 
                        readonly 
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : viewMode === "all" ? (
            emails.map((email, i) => (
              <EmailViewer 
                key={email.id || i} 
                threadId={thread.id}
                email={email} 
                comments={localComments[email.id] || []}
                onCommentAdded={(c) => handleAddComment(email.id, c)}
                onCommentDeleted={(id) => handleDeleteComment(email.id, id)}
                defaultExpanded={i === 0} 
              />
            ))
          ) : currentEmail ? (
            <EmailViewer 
              threadId={thread.id}
              email={currentEmail} 
              comments={localComments[currentEmail.id] || []}
              onCommentAdded={(c) => handleAddComment(currentEmail.id, c)}
              onCommentDeleted={(id) => handleDeleteComment(currentEmail.id, id)}
              defaultExpanded={true} 
            />
          ) : null}
        </div>
      </div>
      {replyTargetId && (
        <ReplyDialog
          open={replyDialogOpen}
          onOpenChange={setReplyDialogOpen}
          thread={{ ...thread, comments: localComments }}
          targetEmail={emails.find(e => e.id === replyTargetId)!}
        />
      )}
    </div>
  );
}
