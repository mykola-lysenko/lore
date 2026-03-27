import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string for display.
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Unknown date";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return `${diffMins}m ago`;
      }
      return `${diffHours}h ago`;
    }
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

/**
 * Format a full date for the email reader.
 */
export function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return "Unknown date";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return dateStr;
  }
}

export function getThreadTypeBorderColor(type: string): string {
  switch (type) {
    case "patch": return "border-l-blue-500";
    case "rfc": return "border-l-amber-500";
    case "discussion": return "border-l-emerald-500";
    case "pull": return "border-l-purple-500";
    default: return "border-l-slate-500";
  }
}

export function getThreadTypeBadgeClass(type: string): string {
  switch (type) {
    case "patch": return "bg-blue-500/15 text-blue-400 border border-blue-500/30";
    case "rfc": return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
    case "discussion": return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
    case "pull": return "bg-purple-500/15 text-purple-400 border border-purple-500/30";
    default: return "bg-slate-500/15 text-slate-400 border border-slate-500/30";
  }
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function stringToColor(str: string): string {
  const colors = [
    "bg-blue-600", "bg-emerald-600", "bg-violet-600", "bg-amber-600",
    "bg-rose-600", "bg-cyan-600", "bg-indigo-600", "bg-teal-600",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export interface BodySegment {
  type: "normal" | "quoted";
  text: string;
}

export function parseEmailBody(body: string): BodySegment[] {
  const lines = body.split("\n");
  const segments: BodySegment[] = [];
  let current: BodySegment | null = null;

  for (const line of lines) {
    const isQuoted = line.startsWith(">") || line.startsWith("| ");
    const type: "normal" | "quoted" = isQuoted ? "quoted" : "normal";

    if (current && current.type === type) {
      current.text += "\n" + line;
    } else {
      if (current) segments.push(current);
      current = { type, text: line };
    }
  }
  if (current) segments.push(current);
  return segments;
}
