<p align="center">
  <img src="macos/icon.png" width="128" alt="Riffle icon — riffled pages with syntax-colored stripes">
</p>

<h1 align="center">Riffle</h1>

**Riffle through your files.** One self-contained HTML file that opens,
renders, and edits Markdown, SQL, JSON, CSV, and diffs. No install, no build,
no dependencies, no network — clone and double-click.

**[Open `viewer.html` in your browser.](viewer.html)** Drag files in, or
click *Open file(s)*. That's the whole setup.

## What you get

- **Markdown** — GFM rendering (tables, task lists, fenced code), a live
  "On this page" outline, per-block copy buttons, and real syntax
  highlighting inside ```sql fences.
- **SQL** — offline PostgreSQL-aware highlighting (dollar-quoting, `E''`
  strings, `$1` params), a clickable statement outline with hover-copy,
  and a pinned line-number gutter.
- **JSON / CSV / diff** — colored JSON with a key outline (and a validity
  notice), CSV/TSV as real tables, diffs with green/red change lines and a
  file/hunk outline. Anything else opens as plain text.
- **Themes & settings** — ⚙ in the header: 12 built-in themes (Catppuccin,
  Nord, Solarized, Gruvbox, Rosé Pine, Tokyo Night, Dracula, GitHub, …),
  light/dark/auto, font size, line wrap, tab width. Settings persist
  locally; nothing leaves your machine.
- **Editing** — press `⌘E` for raw source with line numbers. In Chromium
  browsers (Chrome, Edge, Arc, Brave) saving writes back to the original
  file; elsewhere the Save button honestly reads *Download copy*.
- Tabs, drag-and-drop, `⌘F` find, auto dark/light, unknown text files open
  as plain text. Everything lives in one ~138 KB `viewer.html`.

## Editing & saving — browser support

| Opened via | Chrome / Edge / Arc / Brave | Safari / Firefox |
|---|---|---|
| Drag-drop or ⌘O | **Saves in place** (asks permission once) | Download copy |
| Finder double-click (macOS app) | Save As… once, then in place | Download copy |

Before overwriting, the viewer checks whether the file changed on disk since
you opened it and asks before clobbering.

## macOS: double-click integration

```bash
./macos/build.sh
```

builds `macos/Riffle.app` (with its icon, generated from `macos/icon.png` —
itself rendered by `swift macos/render-icon.swift macos/icon.png`).
Install it where you like — e.g. `ditto "macos/Riffle.app" /Applications/Riffle.app`
— then: right-click any `.md` or `.sql` file
→ **Get Info** → **Open with** → Riffle → **Change All…**. Double-clicked
files open as read-mostly tabs (browser security means no direct file handle);
use *Save As…* once to start saving in place, or open files from inside the
app for full save-back.

> First launch only: if macOS complains about an unidentified developer,
> right-click the app → Open once.

**Windows / Linux:** open `viewer.html` in a Chromium browser and associate
your files with it, or just drag files in.

## Keyboard

| Key | Action |
|---|---|
| `⌘O` | Open files |
| `⌘E` | Toggle view ⇄ edit |
| `⌘S` | Save / Save As… / Download copy |
| `⌘F` | Find in file (Enter / Shift+Enter step matches) |
| `[` / `]` | Previous / next tab |
| `x` | Close tab (asks if unsaved) |
| `c` | Copy whole file |

## Try it

Open the files in `samples/` — `sample.md`, `sample.sql`, `sample.json`,
`sample.csv`, and `sample.diff` exercise every renderer.

## Tests

- `node tests/run-node.mjs` — pure-function suite (zero dependencies).
- Open `tests.html` (or `viewer.html?test=1`) — DOM suite, green/red overlay.

## Smoke checklist (release)

1. Open both samples via drag-drop — rendering + outlines correct.
2. `⌘E` on each, edit a line, `⌘E` back — preview reflects the edit, tab shows •.
3. `⌘S` in Chrome after drag-drop — file updates in place.
4. `⌘S` in Safari — a copy downloads, note explains why.
5. Close a dirty tab with `x` — confirmation appears.
6. `⌘F` "select" in sample.sql — count shows, Enter steps, lines flash.
7. `./macos/build.sh`, set as default opener, double-click a `.sql` — tabs open seeded.
8. Drop a `.json` — colored keys + outline; drop a `.log` — opens as plain text.
9. Drop a binary (e.g. a `.png`) — friendly refusal, app still works.
10. `node tests/run-node.mjs` and `viewer.html?test=1` — all green.
11. ⚙ → switch theme — colors change live; reload — choice persisted.

## Tweaking

- **Colors:** pick a theme from ⚙, or add your own to the `THEMES` table in
  `viewer.html` (the `:root` CSS block is just the no-JS fallback).
- **SQL keywords/types:** the `KEYWORDS` / `TYPES` sets in the sql renderer section.
- **New filetype:** add one renderer object exposing
  `render(source) → { bodyEl, outline, outlineTitle, notice? }` and register its
  extensions in `RENDERERS`. The core never needs to change.

## License

MIT. Bundles [marked](https://github.com/markedjs/marked) v18.0.5 (MIT),
vendored inline with its license header intact.
