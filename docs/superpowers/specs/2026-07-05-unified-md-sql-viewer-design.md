# Unified MD + SQL Viewer — Design

**Date:** 2026-07-05
**Status:** Approved pending user review
**Working title:** `md-sql-viewer` (final name TBD before repo goes public — see Open Questions)

## Context

Two existing apps do nearly the same job with wildly different footprints:

| | markdown-viewer | sql-viewer |
|---|---|---|
| Size on disk | 1.0 GB (node_modules 721MB, release 286MB) | 1.1 MB |
| Stack | Electron + React + Vite + TypeScript | Self-contained 27KB HTML + AppleScript launcher |
| Opens | `.md` (tabs, TOC, search, checkbox write-back, auto-reload, persisted state) | `.sql` (highlighting, statement outline, gutter, tabs, drag-drop) |

This project merges them into one app using the sql-viewer's proven pattern, for a
public GitHub repo where cloning is the whole installation.

## Goals

1. One app that opens `.md` and `.sql` files.
2. Repo under ~1 MB; **zero build step** — clone, open `viewer.html`, done.
3. Basic editing with save-back where the browser allows it (Chromium); honest
   fallbacks elsewhere (Safari/Firefox: download a copy).
4. Lean feature set: tabs, sidebar outline, Cmd+F search, syntax highlighting,
   auto dark/light, drag-drop, file picker, macOS Finder double-click integration.

### Search & keyboard

Cmd+F opens a custom find bar scoped to the active tab: it searches the raw
source text, shows a match count, and Enter/Shift+Enter steps through matches —
scrolling/highlighting the match in view mode, moving the textarea selection in
edit mode.

| Shortcut | Action |
|---|---|
| `Cmd+O` | Open files (picker) |
| `Cmd+W` | Close tab (prompts if dirty) |
| `[` / `]` | Previous / next tab |
| `Cmd+E` | Toggle View ⇄ Edit |
| `Cmd+S` | Save / Save As… / Download (per capability) |
| `Cmd+F` | Find in active tab |

### Explicitly out of scope (v1)

- Auto-reload on external file change, persisted tabs across sessions,
  task-checkbox click-toggle (user chose lean; editing covers the checkbox use case).
- Syntax highlighting inside the edit textarea (would require CodeMirror-class
  dependency; contradicts the size goal).
- Windows/Linux double-click launcher scripts (README documents browser
  file-association instead).
- Save-back in Safari/Firefox (impossible without native helper; escape hatch on
  record: Tauri port if this ever becomes a must).

## Architecture

**One file is the app.** `viewer.html` contains four layers:

```
viewer.html  (~150KB, ~2,500–3,000 lines, clear section banners)
├── CSS          — shell styles + :root theme vars (auto dark/light, --t-* token
│                  variable scheme carried over from sql-viewer)
├── VENDORED     — marked.min.js inlined verbatim (MIT, license header kept)
├── CORE         — filetype-agnostic:
│                  • state: tabs[] {id, name, ext, source, handle?, mode, dirty,
│                    lastModified}
│                  • tab strip, drag-drop, file picker, seed decoder
│                  • sidebar container, Cmd+F search, keyboard shortcuts
│                  • line-number gutter (SQL view + all edit modes)
│                  • edit-mode plumbing + save logic
└── RENDERERS    — plug-ins behind one interface:
                   render(source) → { bodyEl, outline[] }
                   • markdown — marked + angle-bracket sanitizer preprocessing
                     (ported from md-viewer.html)
                   • sql      — existing tokenizer + statement outline, ported
                     unchanged from sql-viewer.html
                   • plaintext — fallback: gutter + raw text, empty outline
```

**Core contract:** CORE never knows filetypes beyond `RENDERERS[ext] ?? plaintext`
(extension = lowercased suffix; none → plaintext). Renderers take raw source text,
return rendered DOM plus a flat outline of `{label, level, anchor, line}` entries
that CORE pours into the sidebar — `anchor` is the rendered-DOM jump target used
in view mode; `line` is the 1-based source line used in edit mode (the markdown
renderer computes it by locating each heading's markup in the source; the SQL
renderer already tracks statement lines). A new filetype = one new renderer
object, no CORE changes.

Rendering is cached per tab; invalidated when source changes (edit-mode save or
view toggle after edits).

**Three doors in, one function:** all converge on `addTab(name, source, handle?)`.

1. **Finder double-click (macOS)** → launcher seeds base64 into temp copy of the
   HTML → content only, no handle → editable, but save = Save As… (Chromium) or
   download (others).
2. **Drag-drop / picker in Chromium** → `FileSystemFileHandle` captured → full
   in-place save-back.
3. **Drag-drop / picker in Safari/Firefox** → `File` object only → save = download.

## Repo layout

```
md-sql-viewer/                  (~200KB total; viewer.html is ~150KB of it)
├── viewer.html                 ← the app
├── README.md                   — 30-second quickstart; per-OS setup below it
├── LICENSE                     — MIT (compatible with vendored marked)
├── tests.html                  — zero-dependency in-browser test harness
├── samples/
│   ├── sample.md               — exercises TOC, tables, task lists, code fences
│   └── sample.sql              — existing sample.sql (outline, dollar-quoting)
└── macos/
    ├── build.sh                — builds "MD+SQL Viewer.app"; registers .md + .sql
    ├── launcher.applescript
    └── seed-and-open.sh
```

No `package.json`, no `node_modules`, no build for the app itself. `build.sh` is
optional, macOS-only, for Finder integration.

**Per-OS story:** any OS opens `viewer.html` in a browser and drags files in.
macOS optionally runs `./macos/build.sh` and sets the app as default opener.
Windows/Linux README documents "Open with → browser" association.

## Edit mode & saving

- **Toggle:** View ⇄ Edit per tab (button + `Cmd+E`). Edit mode = plain
  `<textarea>` with raw source + line-number gutter. Sidebar outline stays live;
  clicking jumps to the corresponding line in the textarea.
- **Dirty tracking:** keystroke marks tab dirty (dot on tab). Switching to View
  re-renders from edited source (free preview). Closing a dirty tab or the window
  prompts first.
- **Save (`Cmd+S` / button)** — resolved in order:
  1. **Handle present** (Chromium picker/drag-drop): request `readwrite`
     permission on first save (one prompt/session) → `createWritable()` → write →
     close. Atomic by API design.
  2. **No handle, Chromium** (seeded file): button reads **Save As…** →
     `showSaveFilePicker()` pre-filled with original filename. Tab gains a handle;
     subsequent saves are case 1.
  3. **No capability** (Safari/Firefox): button reads **Download copy** → blob
     download. Footer note in edit mode: "This browser can't write files in
     place; saving downloads a copy."
- **Detection:** feature-detect (`'showSaveFilePicker' in window`), never
  browser-sniff.
- **Conflict safety:** before a case-1 write, compare the file's current
  `lastModified` to the value recorded at open/last save. If changed underneath:
  warn — overwrite / reload.

## macOS launcher

Light remix of the existing sql-viewer launcher; mechanics (osacompile,
temp-copy seed injection, `open` in default browser, self-contained
`Contents/Resources`) unchanged. Three deltas:

1. **Dual registration:** Info.plist declares `.md/.markdown/.mdown/.mkd`
   (Markdown Document) and `.sql` (SQL Script), role Viewer.
2. **Seed format:** `window.__SEED__` becomes an array of `{name, b64}` objects
   (viewer needs the extension for renderer dispatch and real tab names).
   Multi-select open seeds multiple tabs.
3. **Identity:** app name `MD+SQL Viewer.app`, bundle id
   `com.vanovian.mdsqlviewer` (aligned with final name later).

Documented caveat: double-clicked files arrive as content, not handles (browser
security), so that flow is read-mostly; Save As… is its editing escape hatch.
Power-edit sessions start from inside the app in Chromium.

## Error handling

- **Unknown extension** → plaintext fallback renderer (gutter + raw text, no outline).
- **Binary file** (NUL bytes detected) → friendly "looks like a binary file" tab,
  no render attempt.
- **Huge file** (>5 MB) → plaintext view with "rendered view disabled for large
  files" note; no freeze.
- **Seed decode failure** → error toast; app remains usable.
- **Save failure** (permission denied, write error) → tab stays dirty; offer
  Save As… / Download. Edits are never silently dropped.

## Testing

- **`tests.html`:** loads `viewer.html` in an iframe. The viewer exposes its pure
  functions (SQL tokenizer, outline builders, markdown preprocessing, seed
  decoder) on a `window.__TEST__` namespace; the harness feeds known inputs and
  asserts return values and resulting DOM. Open in browser → green/red list. No
  framework, no npm.
- **`samples/` as manual smoke suite:** README checklist (~10 items): open both
  samples, toggle edit, save-back in Chrome, download fallback in Safari,
  double-click flow after `build.sh`, dirty-close prompt, large-file fallback.
- **Save-back paths:** manual, per-browser (automating native file dialogs isn't
  worth it at this scale).

## Source material

- `sql-viewer/sql-viewer.html` — tokenizer, outline, gutter, seed decoding, theme vars (port basis)
- `markdown-viewer/md-viewer.html` — marked preprocessing (angle-bracket sanitizer), TOC builder, tab shell (port basis; its CDN loads are replaced by vendored copies)
- `sql-viewer/build.sh`, `launcher.applescript`, `seed-and-open.sh` — launcher basis
- `markdown-viewer/` (Electron) — reference only; retired after migration. Deleting it reclaims ~1 GB.

## Open questions

1. **Name.** Working title `md-sql-viewer`. Decide before the repo goes public;
   affects app name, bundle id, README title only.
