"""
Lore — FastAPI Backend

Design: Dark Technical Dashboard (IDE-inspired)
- Wraps b4 utility to fetch threads from lore.kernel.org
- Parses mbox files into structured thread/email data
- Provides AI summarization via configurable provider (Claude default)
- Serves REST API consumed by the React frontend
"""

import asyncio
import email.parser
import email.policy
import gzip
import hashlib
import json
import mailbox
import os
import re
import subprocess
import tempfile
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import b4
import requests
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Lore API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Persistent config & cache paths
# ---------------------------------------------------------------------------

DATA_DIR = Path.home() / ".local" / "share" / "lore-mail-dashboard"
CACHE_DIR = DATA_DIR / "cache"
THREADS_DIR = DATA_DIR / "threads"
CONFIG_FILE = DATA_DIR / "config.json"
SUMMARIES_FILE = DATA_DIR / "summaries.json"
READ_STATE_FILE = DATA_DIR / "read-state.json"

for d in [DATA_DIR, CACHE_DIR, THREADS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------

DEFAULT_CONFIG = {
    "list_id": "bpf.vger.kernel.org",
    "list_name": "BPF",
    "lore_base_url": "https://lore.kernel.org",
    "days_back": 30,
    "b4_folder": None,  # None = use managed cache
    "ai_provider": "claude-cli",  # claude-cli | codex-cli | claude | openai | ollama | none
    "ai_model": "claude-opus-4-5",
    "ai_api_key": "",
    "ollama_url": "http://localhost:11434",
}


def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE) as f:
                saved = json.load(f)
            cfg = {**DEFAULT_CONFIG, **saved}
            return cfg
        except Exception:
            pass
    return dict(DEFAULT_CONFIG)


def save_config(cfg: dict) -> None:
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def load_summaries() -> dict:
    if SUMMARIES_FILE.exists():
        try:
            with open(SUMMARIES_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_summaries(summaries: dict) -> None:
    with open(SUMMARIES_FILE, "w") as f:
        json.dump(summaries, f, indent=2)


def load_read_state() -> set:
    if READ_STATE_FILE.exists():
        try:
            with open(READ_STATE_FILE) as f:
                return set(json.load(f))
        except Exception:
            pass
    return set()


def save_read_state(read_ids: set) -> None:
    with open(READ_STATE_FILE, "w") as f:
        json.dump(sorted(read_ids), f, indent=2)


# ---------------------------------------------------------------------------
# b4 / lore helpers
# ---------------------------------------------------------------------------

def setup_b4_config(cfg: dict) -> None:
    """Ensure b4 git config is set for the configured lore URL."""
    base = cfg.get("lore_base_url", "https://lore.kernel.org")
    subprocess.run(
        ["git", "config", "--global", "b4.searchmask", f"{base}/all/?x=m&q=%s"],
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "--global", "b4.midmask", f"{base}/all/%s"],
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "--global", "b4.cache-expire", "10"],
        capture_output=True,
    )
    # Force b4 to reload its config
    b4.MAIN_CONFIG = {}
    b4._setup_main_config()


def clean_msgid(msgid: str) -> str:
    """Strip angle brackets from a Message-ID."""
    return msgid.strip().lstrip("<").rstrip(">")


def extract_email_body(msg) -> str:
    """Extract plain-text body from an email message."""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in cd:
                try:
                    charset = part.get_content_charset() or "utf-8"
                    body = part.get_payload(decode=True).decode(charset, errors="replace")
                    break
                except Exception:
                    pass
    else:
        try:
            charset = msg.get_content_charset() or "utf-8"
            body = msg.get_payload(decode=True).decode(charset, errors="replace")
        except Exception:
            body = str(msg.get_payload())
    return body


def parse_date(date_str: Optional[str]) -> Optional[str]:
    """Parse email date string to ISO 8601."""
    if not date_str:
        return None
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(date_str)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return date_str


def classify_thread(subject: str) -> str:
    """Classify thread type from subject line."""
    s = subject.upper()
    if re.search(r"\[RFC", s):
        return "rfc"
    if re.search(r"\[PATCH", s):
        return "patch"
    if re.search(r"\[GIT PULL\]", s):
        return "pull"
    return "discussion"


def msg_to_dict(msg, thread_id: str, index: int) -> dict:
    """Convert an email message to a serializable dict."""
    msgid = clean_msgid(msg.get("Message-ID", "") or "")
    subject = b4.LoreMessage.clean_header(msg.get("Subject", "(no subject)"))
    from_raw = b4.LoreMessage.clean_header(msg.get("From", ""))
    # Parse name and email from From header
    from email.utils import parseaddr
    from_name, from_email = parseaddr(from_raw)
    if not from_name:
        from_name = from_email.split("@")[0] if from_email else "Unknown"

    return {
        "id": msgid or f"{thread_id}-{index}",
        "thread_id": thread_id,
        "subject": subject,
        "from_name": from_name,
        "from_email": from_email,
        "date": parse_date(msg.get("Date")),
        "in_reply_to": clean_msgid(msg.get("In-Reply-To", "") or ""),
        "body": extract_email_body(msg),
        "lore_url": f"https://lore.kernel.org/bpf/{urllib.parse.quote(msgid)}/",
        "index": index,
    }


def mbox_to_thread(mbox_path: Path, root_msgid: str) -> dict:
    """Parse an mbox file into a structured thread dict."""
    mbox = mailbox.mbox(str(mbox_path))
    messages = list(mbox)
    mbox.close()

    if not messages:
        return {}

    emails = [msg_to_dict(m, root_msgid, i) for i, m in enumerate(messages)]

    # Find the root message (no In-Reply-To, or matches root_msgid)
    root = None
    for e in emails:
        if not e["in_reply_to"] or e["id"] == root_msgid:
            root = e
            break
    if root is None:
        root = emails[0]

    subject = root["subject"]
    thread_type = classify_thread(subject)

    # Count unique participants
    participants = list({e["from_email"] for e in emails})

    return {
        "id": root_msgid,
        "subject": subject,
        "type": thread_type,
        "author": root["from_name"],
        "author_email": root["from_email"],
        "date": root["date"],
        "last_activity": emails[-1]["date"] if emails else root["date"],
        "message_count": len(emails),
        "participants": participants,
        "participant_count": len(participants),
        "lore_url": f"https://lore.kernel.org/bpf/{urllib.parse.quote(root_msgid)}/",
        "emails": emails,
        "mbox_path": str(mbox_path),
    }


# ---------------------------------------------------------------------------
# Thread listing from lore search
# ---------------------------------------------------------------------------

def fetch_thread_list(cfg: dict) -> list[dict]:
    """
    Use b4's search API to get thread root messages from the configured list.
    Returns a list of lightweight thread summary dicts (no full email bodies).
    """
    setup_b4_config(cfg)

    list_id = cfg.get("list_id", "bpf.vger.kernel.org")
    days_back = cfg.get("days_back", 30)

    # Build date query: last N days
    query = f"l:{list_id} d:last.{days_back}.days.."

    try:
        msgs = b4.get_pi_search_results(query, nocache=False, full_threads=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"b4 search failed: {e}")

    if not msgs:
        return []

    # Filter to root messages only (no In-Reply-To)
    threads = []
    seen_ids = set()

    for msg in msgs:
        in_reply = msg.get("In-Reply-To", "")
        if in_reply:
            continue  # skip replies

        msgid = clean_msgid(msg.get("Message-ID", "") or "")
        if not msgid or msgid in seen_ids:
            continue
        seen_ids.add(msgid)

        subject = b4.LoreMessage.clean_header(msg.get("Subject", "(no subject)"))
        from_raw = b4.LoreMessage.clean_header(msg.get("From", ""))
        from email.utils import parseaddr
        from_name, from_email = parseaddr(from_raw)
        if not from_name:
            from_name = from_email.split("@")[0] if from_email else "Unknown"

        threads.append({
            "id": msgid,
            "subject": subject,
            "type": classify_thread(subject),
            "author": from_name,
            "author_email": from_email,
            "date": parse_date(msg.get("Date")),
            "last_activity": parse_date(msg.get("Date")),
            "message_count": 1,  # will be updated when thread is fetched
            "participant_count": 1,
            "lore_url": f"https://lore.kernel.org/bpf/{urllib.parse.quote(msgid)}/",
            "has_full_thread": False,
            "summary": None,
        })

    # Sort by date descending
    threads.sort(key=lambda t: t["date"] or "", reverse=True)
    return threads


# ---------------------------------------------------------------------------
# Full thread download via b4 mbox
# ---------------------------------------------------------------------------

def fetch_full_thread(msgid: str, cfg: dict) -> dict:
    """
    Use b4 mbox to download the complete thread for a given message ID.
    Saves the mbox to THREADS_DIR and returns the parsed thread dict.
    """
    setup_b4_config(cfg)

    # Check if we already have it
    safe_name = re.sub(r"[^\w@.\-]", "_", msgid)
    mbox_path = THREADS_DIR / f"{safe_name}.mbx"

    if not mbox_path.exists():
        # Use b4 folder if specified
        b4_folder = cfg.get("b4_folder")
        if b4_folder:
            # Look for existing mbox in user-specified folder
            existing = Path(b4_folder) / f"{safe_name}.mbx"
            if existing.exists():
                mbox_path = existing
            else:
                outdir = b4_folder
        else:
            outdir = str(THREADS_DIR)

        if not mbox_path.exists():
            result = subprocess.run(
                ["b4", "mbox", "-o", outdir, msgid],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode != 0:
                raise HTTPException(
                    status_code=500,
                    detail=f"b4 mbox failed: {result.stderr}"
                )
            # b4 names the file after the message ID
            mbox_path = THREADS_DIR / f"{msgid}.mbx"
            if not mbox_path.exists():
                # Try to find the file
                for f in THREADS_DIR.glob("*.mbx"):
                    if msgid in f.name or safe_name in f.name:
                        mbox_path = f
                        break

    if not mbox_path.exists():
        raise HTTPException(status_code=404, detail=f"Thread mbox not found for {msgid}")

    return mbox_to_thread(mbox_path, msgid)


# ---------------------------------------------------------------------------
# AI Summarization
# ---------------------------------------------------------------------------

def build_summary_prompt(thread: dict) -> str:
    """Build the prompt for AI summarization of a thread."""
    emails = thread.get("emails", [])
    subject = thread.get("subject", "")
    thread_type = thread.get("type", "discussion")

    # Build a condensed representation of the thread
    lines = [
        f"Subject: {subject}",
        f"Type: {thread_type}",
        f"Author: {thread.get('author', 'Unknown')}",
        f"Messages: {thread.get('message_count', len(emails))}",
        f"Participants: {', '.join(thread.get('participants', [])[:5])}",
        "",
        "Thread content (condensed):",
        "=" * 60,
    ]

    # Include first 3 emails in full, rest as excerpts
    for i, em in enumerate(emails[:10]):
        lines.append(f"\n--- Message {i+1}: {em['subject']} ---")
        lines.append(f"From: {em['from_name']} <{em['from_email']}>")
        lines.append(f"Date: {em['date']}")
        body = em.get("body", "")
        if i < 3:
            # Full body for first 3 messages (truncated at 2000 chars)
            lines.append(body[:2000])
        else:
            # Just first 500 chars for later messages
            lines.append(body[:500] + ("..." if len(body) > 500 else ""))

    content = "\n".join(lines)

    return f"""You are a technical assistant helping Linux kernel developers track the BPF mailing list.

Analyze this email thread and provide a concise technical summary.

{content}

Please provide:
1. **Summary** (2-3 sentences): What is this thread about? What problem does it solve or discuss?
2. **Key Points** (3-5 bullet points): The most important technical details, decisions, or outcomes.
3. **Status**: What is the current state? (e.g., "Patch series under review", "RFC seeking feedback", "Merged", "Discussion ongoing")
4. **Notable Reviewers**: Who are the key people engaging with this thread?

Keep the summary technical and precise. Focus on what matters to a BPF developer."""


def summarize_with_claude(prompt: str, cfg: dict) -> str:
    """Generate summary using Anthropic Claude."""
    import anthropic
    api_key = cfg.get("ai_api_key", "") or os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return "No API key configured for Claude. Please set your Anthropic API key in Settings."

    client = anthropic.Anthropic(api_key=api_key)
    model = cfg.get("ai_model", "claude-opus-4-5")

    message = client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def summarize_with_openai(prompt: str, cfg: dict) -> str:
    """Generate summary using OpenAI."""
    from openai import OpenAI
    api_key = cfg.get("ai_api_key", "") or os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return "No API key configured for OpenAI. Please set your OpenAI API key in Settings."

    client = OpenAI(api_key=api_key)
    model = cfg.get("ai_model", "gpt-4o")

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1024,
    )
    return response.choices[0].message.content


def summarize_with_ollama(prompt: str, cfg: dict) -> str:
    """Generate summary using a local Ollama model."""
    ollama_url = cfg.get("ollama_url", "http://localhost:11434")
    model = cfg.get("ai_model", "llama3")

    try:
        resp = requests.post(
            f"{ollama_url}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json().get("response", "No response from Ollama.")
    except Exception as e:
        return f"Ollama error: {e}"


def summarize_with_claude_cli(prompt: str, cfg: dict) -> str:
    """Generate summary using the local `claude` CLI (Claude Code) — no API key needed."""
    import shutil
    binary = shutil.which("claude")
    if not binary:
        return (
            "'claude' CLI not found in PATH. "
            "Install Claude Code (https://claude.ai/code) and make sure it is on your PATH."
        )
    try:
        result = subprocess.run(
            [binary, "-p", prompt],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            return f"claude CLI error (exit {result.returncode}): {stderr or 'no output'}"
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        return "claude CLI timed out after 120 seconds."
    except Exception as e:
        return f"claude CLI failed: {e}"


def summarize_with_codex_cli(prompt: str, cfg: dict) -> str:
    """Generate summary using the local `codex` CLI (Meta Codex Plugboard) — no API key needed."""
    import shutil
    binary = shutil.which("codex")
    if not binary:
        return (
            "'codex' CLI not found in PATH. "
            "Make sure the Codex CLI is installed and on your PATH."
        )
    try:
        # Codex requires a TTY on stdin; work around by writing the prompt to a
        # temp file and feeding it via 'script' (macOS/Linux) which allocates a
        # pseudo-TTY, or by using a shell heredoc through bash -c.
        # The simplest cross-platform approach: use 'script' if available,
        # otherwise fall back to a shell pipe with 'echo | codex'.
        import shlex
        import shutil as _shutil

        # Try: echo prompt | codex  (some builds accept piped stdin)
        result = subprocess.run(
            f"{shlex.quote(binary)} {shlex.quote(prompt)}",
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            # If still a TTY error, try via 'script' pseudo-TTY wrapper
            if "stdin is not a terminal" in stderr and _shutil.which("script"):
                result = subprocess.run(
                    ["script", "-q", "/dev/null", binary, prompt],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if result.returncode == 0:
                    return result.stdout.strip()
            return f"codex CLI error (exit {result.returncode}): {stderr or 'no output'}"
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        return "codex CLI timed out after 120 seconds."
    except Exception as e:
        return f"codex CLI failed: {e}"


def generate_summary(thread: dict, cfg: dict) -> str:
    """Generate an AI summary for a thread using the configured provider."""
    provider = cfg.get("ai_provider", "claude")
    prompt = build_summary_prompt(thread)

    try:
        if provider == "claude":
            return summarize_with_claude(prompt, cfg)
        elif provider == "openai":
            return summarize_with_openai(prompt, cfg)
        elif provider == "ollama":
            return summarize_with_ollama(prompt, cfg)
        elif provider == "claude-cli":
            return summarize_with_claude_cli(prompt, cfg)
        elif provider == "codex-cli":
            return summarize_with_codex_cli(prompt, cfg)
        else:
            return "AI summarization is disabled. Enable a provider in Settings."
    except Exception as e:
        return f"Summary generation failed: {e}"


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ConfigUpdate(BaseModel):
    list_id: Optional[str] = None
    list_name: Optional[str] = None
    lore_base_url: Optional[str] = None
    days_back: Optional[int] = None
    b4_folder: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    ai_api_key: Optional[str] = None
    ollama_url: Optional[str] = None


class SummarizeRequest(BaseModel):
    thread_id: str
    force: bool = False


class MarkReadRequest(BaseModel):
    thread_ids: list[str]


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/config")
def get_config():
    cfg = load_config()
    # Mask API key
    safe = dict(cfg)
    if safe.get("ai_api_key"):
        safe["ai_api_key"] = "***" + safe["ai_api_key"][-4:] if len(safe["ai_api_key"]) > 4 else "****"
    return safe


@app.put("/api/config")
def update_config(update: ConfigUpdate):
    cfg = load_config()
    data = update.model_dump(exclude_none=True)
    # Don't overwrite key with masked value
    if data.get("ai_api_key", "").startswith("***"):
        data.pop("ai_api_key")
    cfg.update(data)
    save_config(cfg)
    return {"status": "saved"}


@app.get("/api/threads")
def list_threads(refresh: bool = False):
    """
    Return list of thread summaries from the configured mailing list.
    Uses cached results unless refresh=true.
    """
    cfg = load_config()
    cache_file = CACHE_DIR / f"threads_{cfg['list_id'].replace('.', '_')}.json"

    if not refresh and cache_file.exists():
        age = time.time() - cache_file.stat().st_mtime
        if age < 86400:  # 24-hour cache — avoids re-fetching on every restart
            with open(cache_file) as f:
                threads = json.load(f)
            # Merge in any saved summaries and read state
            summaries = load_summaries()
            read_ids = load_read_state()
            for t in threads:
                if t["id"] in summaries:
                    t["summary"] = summaries[t["id"]]
                t["is_read"] = t["id"] in read_ids
            return {"threads": threads, "cached": True, "count": len(threads)}

    threads = fetch_thread_list(cfg)

    # Merge in saved summaries and read state
    summaries = load_summaries()
    read_ids = load_read_state()
    for t in threads:
        if t["id"] in summaries:
            t["summary"] = summaries[t["id"]]
            t["has_full_thread"] = True
        t["is_read"] = t["id"] in read_ids

    # Cache the results
    with open(cache_file, "w") as f:
        json.dump(threads, f, indent=2)

    return {"threads": threads, "cached": False, "count": len(threads)}


@app.get("/api/threads/{thread_id:path}")
def get_thread(thread_id: str):
    """
    Fetch the full thread (all emails) for a given message ID.
    Downloads via b4 mbox if not already cached.
    """
    cfg = load_config()
    thread = fetch_full_thread(thread_id, cfg)

    # Attach summary if available
    summaries = load_summaries()
    thread["summary"] = summaries.get(thread_id)

    return thread


@app.post("/api/summarize")
def summarize_thread(req: SummarizeRequest):
    """
    Generate an AI summary for a thread.
    Fetches the full thread first if needed.
    """
    cfg = load_config()
    summaries = load_summaries()

    # Return cached summary if available and not forced
    if not req.force and req.thread_id in summaries:
        return {"summary": summaries[req.thread_id], "cached": True}

    # Fetch the full thread
    thread = fetch_full_thread(req.thread_id, cfg)

    # Generate summary
    summary = generate_summary(thread, cfg)

    # Cache it
    summaries[req.thread_id] = summary
    save_summaries(summaries)

    return {"summary": summary, "cached": False}


@app.get("/api/read-state")
def get_read_state():
    """Return the set of read thread IDs."""
    return {"read_ids": sorted(load_read_state())}


@app.post("/api/read-state")
def mark_read(req: MarkReadRequest):
    """Mark one or more threads as read."""
    read_ids = load_read_state()
    read_ids.update(req.thread_ids)
    save_read_state(read_ids)
    return {"status": "ok", "read_count": len(read_ids)}


@app.delete("/api/read-state")
def mark_all_unread():
    """Reset all read state (mark everything as unread)."""
    save_read_state(set())
    return {"status": "cleared"}


@app.delete("/api/cache")
def clear_cache():
    """Clear the thread list cache (forces re-fetch on next request)."""
    for f in CACHE_DIR.glob("threads_*.json"):
        f.unlink()
    return {"status": "cleared"}


@app.get("/api/lists")
def known_lists():
    """Return a list of well-known kernel mailing lists."""
    return {
        "lists": [
            {"id": "bpf.vger.kernel.org", "name": "BPF", "url": "lore.kernel.org/bpf"},
            {"id": "netdev.vger.kernel.org", "name": "netdev", "url": "lore.kernel.org/netdev"},
            {"id": "linux-kernel.vger.kernel.org", "name": "LKML", "url": "lore.kernel.org/lkml"},
            {"id": "linux-mm.kvack.org", "name": "linux-mm", "url": "lore.kernel.org/linux-mm"},
            {"id": "kvm.vger.kernel.org", "name": "KVM", "url": "lore.kernel.org/kvm"},
            {"id": "io-uring.vger.kernel.org", "name": "io_uring", "url": "lore.kernel.org/io-uring"},
            {"id": "linux-trace-kernel.vger.kernel.org", "name": "linux-trace", "url": "lore.kernel.org/linux-trace-kernel"},
            {"id": "linux-perf-users.vger.kernel.org", "name": "perf", "url": "lore.kernel.org/linux-perf-users"},
        ]
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8765, reload=True)
