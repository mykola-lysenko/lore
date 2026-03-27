/**
 * Lore — API Client
 * Communicates with the FastAPI backend on port 8765
 */

const BASE_URL = ""; // Uses Vite proxy: /api -> http://localhost:8765/api

export interface ThreadSummary {
  id: string;
  subject: string;
  type: "patch" | "rfc" | "discussion" | "pull";
  author: string;
  author_email: string;
  date: string | null;
  last_activity: string | null;
  message_count: number;
  participant_count: number;
  lore_url: string;
  has_full_thread: boolean;
  summary: string | null;
  is_read: boolean;
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  subject: string;
  from_name: string;
  from_email: string;
  date: string | null;
  in_reply_to: string;
  body: string;
  lore_url: string;
  index: number;
}

export interface Thread extends ThreadSummary {
  last_activity: string | null;
  participants: string[];
  emails: EmailMessage[];
  mbox_path: string;
}

export interface Config {
  list_id: string;
  list_name: string;
  lore_base_url: string;
  days_back: number;
  b4_folder: string | null;
  ai_provider: "claude" | "openai" | "ollama" | "none";
  ai_model: string;
  ai_api_key: string;
  ollama_url: string;
}

export interface KnownList {
  id: string;
  name: string;
  url: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ status: string; version: string }>("/api/health"),

  getConfig: () => request<Config>("/api/config"),

  updateConfig: (update: Partial<Config>) =>
    request<{ status: string }>("/api/config", {
      method: "PUT",
      body: JSON.stringify(update),
    }),

  listThreads: (refresh = false) =>
    request<{ threads: ThreadSummary[]; cached: boolean; count: number }>(
      `/api/threads${refresh ? "?refresh=true" : ""}`
    ),

  getThread: (threadId: string) =>
    request<Thread>(`/api/threads/${encodeURIComponent(threadId)}`),

  summarize: (threadId: string, force = false) =>
    request<{ summary: string; cached: boolean }>("/api/summarize", {
      method: "POST",
      body: JSON.stringify({ thread_id: threadId, force }),
    }),

  clearCache: () =>
    request<{ status: string }>("/api/cache", { method: "DELETE" }),

  knownLists: () =>
    request<{ lists: KnownList[] }>("/api/lists"),

  markRead: (threadIds: string[]) =>
    request<{ status: string; read_count: number }>("/api/read-state", {
      method: "POST",
      body: JSON.stringify({ thread_ids: threadIds }),
    }),

  markAllUnread: () =>
    request<{ status: string }>("/api/read-state", { method: "DELETE" }),
};
