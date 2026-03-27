# BPF Mailing List Dashboard — Design Ideas

## Idea 1: Terminal Noir
**Design Movement:** Brutalist Monochrome with Terminal Aesthetics
**Core Principles:**
- Monospace typography throughout — evokes the kernel developer's natural habitat
- High-contrast dark background with phosphor-green or amber accents
- Strict information density — no wasted space, every pixel earns its place
- Raw, utilitarian beauty: borders, dividers, and ASCII-style decorations

**Color Philosophy:** Near-black (#0d0d0d) background with #00ff41 (Matrix green) accent for active states, #888 for muted text, #e0e0e0 for primary text. Feels like reading a terminal.

**Layout Paradigm:** Left sidebar (fixed, narrow) for navigation + filter controls. Main area is a dense list of thread cards. Right panel slides in for thread/email reading. No rounded corners except on tags.

**Signature Elements:**
- Monospace font (JetBrains Mono or Fira Code) for all text
- Thread cards styled like terminal output lines with `>` prefix
- Status badges styled as `[PATCH v3]`, `[RFC]` etc. in square brackets

**Interaction Philosophy:** Keyboard-first. Hover states use background highlight rather than shadows. Click feels immediate, no bounce animations.

**Animation:** Minimal — only fade-in for panels, no spring physics. Cursor blink on active input.

**Typography System:** JetBrains Mono for everything. Size scale: 11px body, 13px headings, 16px titles.

---

## Idea 2: Editorial Broadsheet
**Design Movement:** Swiss International Typographic Style meets Editorial Design
**Core Principles:**
- Strong typographic hierarchy with serif display + sans-serif body
- Asymmetric grid layout — content columns of unequal width
- Generous whitespace with precise alignment
- Color used sparingly as accent, not decoration

**Color Philosophy:** Off-white (#fafaf7) background, near-black (#1a1a1a) text, deep indigo (#2d3a8c) as primary accent, warm amber (#e8a020) for highlights. Feels like a high-quality technical journal.

**Layout Paradigm:** Three-column asymmetric grid: narrow left column for metadata/filters, wide center for thread list, collapsible right panel for reading. Header is a thin horizontal bar with list selector.

**Signature Elements:**
- Playfair Display for thread subject lines (editorial feel)
- Thin horizontal rules between sections
- Author avatars as initials in colored circles

**Interaction Philosophy:** Smooth, deliberate transitions. Cards expand in-place rather than navigating away.

**Animation:** 200ms ease-out for panel slides, subtle card lift on hover (2px translateY + shadow).

**Typography System:** Playfair Display for subjects/titles, IBM Plex Sans for body/metadata. Strict 4px baseline grid.

---

## Idea 3: Dark Technical Dashboard
**Design Movement:** Modern Developer Tool / IDE-inspired
**Core Principles:**
- Dark theme as primary (developers prefer dark)
- Subtle color-coding by email type (patch, RFC, discussion, review)
- Dense but scannable layout with clear visual hierarchy
- Functional beauty: every visual element serves a purpose

**Color Philosophy:** Deep slate (#0f1117) background, #e2e8f0 primary text, #3b82f6 (blue) for interactive elements, #10b981 (emerald) for applied/merged patches, #f59e0b (amber) for RFC/discussion, #ef4444 for rejected. Feels like a well-designed IDE.

**Layout Paradigm:** Persistent left sidebar with list/filter controls. Main content area with thread cards in a vertical feed. Thread detail opens as a full-width overlay with email navigation.

**Signature Elements:**
- Color-coded left border on thread cards by type
- Compact metadata chips (date, reply count, patch version)
- Code-style diff preview in email body

**Interaction Philosophy:** Instant feedback. Hover states are subtle background changes. Active states are clear blue highlights.

**Animation:** 150ms transitions, slide-in for detail panel, skeleton loading states.

**Typography System:** Inter for UI chrome, JetBrains Mono for email body/code content. Clear size hierarchy: 12px metadata, 14px body, 16px subjects, 20px section headers.

---

## Selected Design: Idea 3 — Dark Technical Dashboard

**Rationale:** BPF developers work in dark terminals and IDEs. A dark, information-dense layout with color-coded thread types and monospace email body rendering will feel native to the audience. The IDE-inspired aesthetic is familiar and reduces cognitive load for technical users.

**Key design decisions:**
- Default dark theme, no light mode toggle needed
- Color-coded thread cards by type (PATCH, RFC, discussion)
- Monospace font for email body content
- Left sidebar for settings/filters, main feed for threads, slide-in panel for reading
- JetBrains Mono + Inter font pairing
