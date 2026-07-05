# Unified MD+SQL Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One self-contained `viewer.html` that opens, renders, and edits `.md` and `.sql` files, with a macOS Finder launcher, in a zero-build public repo under 1 MB.

**Architecture:** Single HTML file with four layers — CSS, vendored marked UMD, a filetype-agnostic CORE (tabs, sidebar, edit mode, save, find), and pluggable RENDERERS (`render(source) → {bodyEl, outline, outlineTitle}`). Most code is ported verbatim from two existing proven apps; new code covers edit mode, saving, and find.

**Tech Stack:** Vanilla JS (classic scripts only), marked v18.0.5 (vendored inline), AppleScript/bash launcher, Node built-ins for tests.

**Spec:** `docs/superpowers/specs/2026-07-05-unified-md-sql-viewer-design.md` — read it before starting any task.

## Global Constraints

- Repo root: `/Users/bob/Rob's Coding Projects/MD-SQL Editor/md-sql-viewer` (git repo, branch `main`). ALL new files go here. Every path below that isn't absolute is relative to this root.
- Port sources (read-only — never modify them):
  - `SRC_SQL` = `/Users/bob/Rob's Coding Projects/MD-SQL Editor/sql-viewer/sql-viewer.html`
  - `SRC_MD` = `/Users/bob/Rob's Coding Projects/MD-SQL Editor/markdown-viewer/md-viewer.html`
  - `SRC_LAUNCH` = `/Users/bob/Rob's Coding Projects/MD-SQL Editor/sql-viewer/` (build.sh, launcher.applescript, seed-and-open.sh)
- Zero build, zero runtime dependencies, no CDN/network at runtime. `marked` is vendored inline, pinned to **v18.0.5** (`https://cdn.jsdelivr.net/npm/marked@18.0.5/lib/marked.umd.js`, MIT — keep its license header).
- Classic `<script>` blocks only. NO ES modules, NO `import` in viewer.html (they fail over `file://`).
- **Node-testability rule:** viewer.html's top level declares only functions and constants. Every `document.getElementById`, element reference, and event wiring lives inside `initApp()`, called via `if (typeof document !== 'undefined') initApp();` at the end of the script. Violating this breaks `tests/run-node.mjs`.
- Pure functions are exported on `window.__TEST__` (top level); app functions on `window.__TEST__.app` (inside `initApp`).
- Tests: `node tests/run-node.mjs` must exit 0 before every commit. Browser suite: run `bash tests/open-in-browser.sh` and confirm the overlay shows `0 failed`.
- This machine has NO Chromium browser (default is Safari). Steps that need Chrome/Edge/Arc are marked **[CHROMIUM-MANUAL]** and are deferred to the Task 9 checklist — do not block on them.
- Tab shape (canonical, used everywhere): `{ id, name, path, ext, source, savedSource, handle, lastModified, mode: 'view'|'edit', rendered, lastOutline, _ta }`.
- Outline entry shape: `{ label, level?, anchor?, line?, kind?, text? }`.
- Commit at the end of every task. Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

```
md-sql-viewer/
├── viewer.html                 — the app (Tasks 1–7 build this incrementally)
├── tests.html                  — redirect to viewer.html?test=1        (Task 1)
├── tests/
│   ├── run-node.mjs            — Node runner, pure functions           (Task 1, grows through Task 7)
│   ├── browser-tests.js        — DOM suite injected by ?test=1         (Task 2, grows through Task 7)
│   └── open-in-browser.sh      — opens ?test=1 in default browser      (Task 2)
├── samples/sample.md           — feature-exercising sample             (Task 8)
├── samples/sample.sql          — copied from sql-viewer                (Task 8)
├── macos/build.sh              — builds "MD+SQL Viewer.app"            (Task 8)
├── macos/launcher.applescript                                          (Task 8)
├── macos/seed-and-open.sh                                              (Task 8)
├── README.md, LICENSE, .gitignore                                      (Task 8)
└── docs/superpowers/…          — spec + this plan (already committed)
```

---

### Task 1: Test infrastructure + viewer.html skeleton + pure utilities

**Files:**
- Create: `tests/run-node.mjs`
- Create: `viewer.html`
- Create: `tests.html`

**Interfaces:**
- Produces: `extOf(name) → string` (lowercased extension, `''` if none); `classifyContent(source) → 'text'|'binary'|'huge'`; `escapeHTML(s)`; `formatBytes(b)`; `b64ToString(b64)`; `lineStartIndex(source, line) → charIndex`; `truncate(s, n)`; all on `window.__TEST__`. The HTML skeleton with element IDs `tabs, content-host, outline, file-meta, drop-hint, copyAll, editToggle, saveBtn, openBtn, picker, findbar, find-input, find-count, find-prev, find-next, find-close, notice, edit-note, toast` and markers `<!--__VIEWER_SEED__-->` and `/*__VENDOR_MARKED__*/`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing Node test runner**

Create `tests/run-node.mjs`:

```js
#!/usr/bin/env node
// Zero-dependency test runner for viewer.html's pure-function layer.
// Evaluates viewer.html's <script> blocks in a node:vm sandbox (no DOM);
// viewer.html must keep all DOM access inside initApp() for this to work.
// Usage: node tests/run-node.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../viewer.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) { console.error('no <script> blocks found in viewer.html'); process.exit(1); }

const sandbox = { console, atob, btoa, TextDecoder, TextEncoder, URL, Blob,
  setTimeout, clearTimeout, queueMicrotask };
sandbox.window = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
for (const src of scripts) vm.runInContext(src, sandbox);
const T = sandbox.window.__TEST__;
if (!T) { console.error('window.__TEST__ not defined'); process.exit(1); }

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + (e && e.message)); }
}
function eq(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error('expected ' + jb + ', got ' + ja);
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy, got ' + JSON.stringify(v)); }

/* ===== Task 1: utilities ===== */
t('extOf lowercases and strips', () => { eq(T.extOf('Schema.SQL'), 'sql'); eq(T.extOf('README.md'), 'md'); });
t('extOf handles no extension', () => { eq(T.extOf('Makefile'), ''); eq(T.extOf(''), ''); eq(T.extOf('a.tar.gz'), 'gz'); });
t('classifyContent text', () => { eq(T.classifyContent('select 1;'), 'text'); });
t('classifyContent binary on NUL', () => { eq(T.classifyContent('ab\u0000cd'), 'binary'); });
t('classifyContent huge past 5MB', () => { eq(T.classifyContent('x'.repeat(5 * 1024 * 1024 + 1)), 'huge'); });
t('escapeHTML', () => { eq(T.escapeHTML('a<b>&c'), 'a&lt;b&gt;&amp;c'); });
t('formatBytes', () => { eq(T.formatBytes(512), '512 B'); eq(T.formatBytes(2048), '2.0 KB'); });
t('b64ToString handles UTF-8', () => { eq(T.b64ToString(Buffer.from('héllo — ✓', 'utf8').toString('base64')), 'héllo — ✓'); });
t('lineStartIndex', () => {
  eq(T.lineStartIndex('ab\ncd\nef', 1), 0);
  eq(T.lineStartIndex('ab\ncd\nef', 2), 3);
  eq(T.lineStartIndex('ab\ncd\nef', 3), 6);
  eq(T.lineStartIndex('ab\ncd', 9), 5); // past EOF clamps to length
});
t('truncate collapses whitespace and ellipsizes', () => {
  eq(T.truncate('a  b   c', 20), 'a b c');
  ok(T.truncate('x'.repeat(60), 10).endsWith('…'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "/Users/bob/Rob's Coding Projects/MD-SQL Editor/md-sql-viewer" && node tests/run-node.mjs`
Expected: FAIL — `ENOENT ... viewer.html` (non-zero exit).

- [ ] **Step 3: Create viewer.html skeleton**

Create `viewer.html` with exactly this structure. The `<style>` block is assembled from ports plus new rules:

1. Open with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MD+SQL Viewer</title>
<style>
```

2. Paste `SRC_SQL` lines 7–167 verbatim (the `:root` Catppuccin dark/light vars, base, header, tabs, layout, code, outline, drop-hint, drag-overlay CSS).
3. Paste `SRC_MD` lines 108–179 verbatim (the `.prose` block) **except** delete the two lines 162–163 (the comment + `.prose pre code.hljs` rule — we don't use highlight.js). Do NOT copy `SRC_MD`'s `:root`, tabs, layout, `#toc`, drop-hint, or overlay CSS (the SQL versions already cover them; the sidebar is `#outline`).
4. Append this new CSS verbatim:

```css
/* ============ FIND BAR ============ */
#findbar { display: flex; align-items: center; gap: 8px; padding: 6px 20px;
  border-top: 1px solid var(--border); background: var(--panel); }
#findbar[hidden] { display: none; }
#find-input { flex: 0 1 340px; font: 12px ui-monospace, Menlo, monospace;
  padding: 5px 9px; color: var(--ink); background: var(--bg);
  border: 1px solid var(--border); border-radius: 6px; outline: none; }
#find-input:focus { border-color: var(--accent); }
#find-count { font: 11px ui-monospace, Menlo, monospace; color: var(--muted); min-width: 64px; }
.find-nav { padding: 4px 9px; }

/* ============ EDITOR ============ */
.editor-wrap { display: flex; background: var(--code-bg);
  border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  height: calc(100vh - 230px); min-height: 320px; }
.editor-gutter { flex: 0 0 auto; min-width: 3.4em; padding: 8px 12px 8px 14px;
  text-align: right; color: var(--gutter-ink); background: var(--code-bg);
  border-right: 1px solid var(--border); overflow: hidden; user-select: none;
  -webkit-user-select: none; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12.8px; line-height: 1.55; white-space: pre; }
.editor-ta { flex: 1 1 auto; padding: 8px 16px 8px 14px; background: transparent;
  color: var(--ink); border: none; outline: none; resize: none;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12.8px; line-height: 1.55; white-space: pre; overflow: auto; tab-size: 4; }

/* ============ DIRTY DOT / NOTICES / TOAST ============ */
.tab.dirty .tab-name::after { content: " •"; color: var(--accent); }
#notice { margin: 0 0 12px; padding: 9px 14px; font-size: 12.5px;
  border: 1px solid var(--border); border-left: 3px solid var(--accent);
  border-radius: 6px; color: var(--muted); background: var(--panel); }
#edit-note { margin: 10px 0 0; font-size: 11.5px; color: var(--muted);
  font-family: ui-monospace, Menlo, monospace; }
#toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
  padding: 9px 16px; font-size: 12.5px; color: var(--ink); background: var(--panel);
  border: 1px solid var(--accent); border-radius: 8px; z-index: 2000; }

/* ============ OUTLINE INDENT (markdown levels) ============ */
.o-item.o-l3 a { padding-left: 22px; font-size: 11.5px; }
.o-item.o-l4 a { padding-left: 34px; font-size: 11px; color: var(--muted); }
```

5. Close `</style></head>` and add this body verbatim:

```html
<body>
<header>
  <div class="brand-row">
    <span class="brand">MD+SQL Viewer</span>
    <span class="hint-kbd"><kbd>[</kbd> <kbd>]</kbd> switch · <kbd>x</kbd> close · <kbd>⌘E</kbd> edit · <kbd>⌘S</kbd> save · <kbd>⌘F</kbd> find</span>
    <span class="spacer"></span>
    <button class="copy-btn" id="copyAll" title="Copy the whole file to the clipboard (c)" hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      <span>Copy file</span>
    </button>
    <button class="ghost-btn" id="editToggle" title="Toggle edit mode (⌘E)" hidden>Edit</button>
    <button class="copy-btn" id="saveBtn" title="Save (⌘S)" hidden><span>Save</span></button>
    <button class="ghost-btn" id="openBtn" title="Open files (⌘O)">Open file(s)</button>
    <input type="file" id="picker" accept=".md,.markdown,.mdown,.mkd,.sql,.ddl,.pgsql,.psql,.txt" multiple>
  </div>
  <nav class="tabs-row" id="tabs" aria-label="Open files" hidden></nav>
  <div id="findbar" hidden>
    <input id="find-input" type="text" placeholder="Find in file…" spellcheck="false">
    <span id="find-count"></span>
    <button class="ghost-btn find-nav" id="find-prev" title="Previous match (Shift+Enter)">‹</button>
    <button class="ghost-btn find-nav" id="find-next" title="Next match (Enter)">›</button>
    <button class="ghost-btn find-nav" id="find-close" title="Close (Esc)">×</button>
  </div>
</header>

<div class="body-layout">
  <main id="main">
    <div id="file-meta" class="file-meta" hidden></div>
    <div id="notice" hidden></div>
    <div id="content-host"></div>
    <div id="edit-note" hidden>This browser can't write files in place; saving downloads a copy.</div>
    <div id="drop-hint">
      <strong>Drop .md or .sql files anywhere</strong>
      <div class="sub">or click <em>Open file(s)</em> above · multiple files open as tabs</div>
    </div>
  </main>
  <aside id="outline"></aside>
</div>
<div id="toast" hidden></div>

<!--__VIEWER_SEED__-->

<script>/*__VENDOR_MARKED__*/</script>
<script>
"use strict";

/* ════════════════════════════════════════════════════════════
   CORE · pure utilities
   ════════════════════════════════════════════════════════════ */
function extOf(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

const MAX_RENDER_CHARS = 5 * 1024 * 1024;
function classifyContent(source) {
  if (source.includes('\u0000')) return 'binary';
  if (source.length > MAX_RENDER_CHARS) return 'huge';
  return 'text';
}

function escapeHTML(s) { return s.replace(/[&<>]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;')); }

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function b64ToString(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  try { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); }
  catch (e) { return bin; }
}

function lineStartIndex(s, line) {
  let i = 0;
  for (let l = 1; l < line; l++) {
    const nl = s.indexOf('\n', i);
    if (nl === -1) return s.length;
    i = nl + 1;
  }
  return i;
}

function truncate(s, n) { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

window.__TEST__ = { extOf, classifyContent, escapeHTML, formatBytes, b64ToString, lineStartIndex, truncate };

/* ════════════════════════════════════════════════════════════
   CORE · app bootstrap (all DOM access lives in initApp)
   ════════════════════════════════════════════════════════════ */
let tabsEl, contentHost, outlineEl, metaEl, dropHint, copyAllBtn, editBtn, saveBtn,
    openBtn, pickerInput, noticeEl, editNoteEl, toastEl,
    findbarEl, findInputEl, findCountEl;

function initApp() {
  tabsEl = document.getElementById('tabs');
  contentHost = document.getElementById('content-host');
  outlineEl = document.getElementById('outline');
  metaEl = document.getElementById('file-meta');
  dropHint = document.getElementById('drop-hint');
  copyAllBtn = document.getElementById('copyAll');
  editBtn = document.getElementById('editToggle');
  saveBtn = document.getElementById('saveBtn');
  openBtn = document.getElementById('openBtn');
  pickerInput = document.getElementById('picker');
  noticeEl = document.getElementById('notice');
  editNoteEl = document.getElementById('edit-note');
  toastEl = document.getElementById('toast');
  findbarEl = document.getElementById('findbar');
  findInputEl = document.getElementById('find-input');
  findCountEl = document.getElementById('find-count');

  // Test mode: viewer.html?test=1 pulls in the browser suite (classic script;
  // iframes/ES modules don't work over file://).
  if (/[?&]test=1/.test(location.search)) {
    const s = document.createElement('script');
    s.src = 'tests/browser-tests.js';
    document.body.appendChild(s);
  }
}

if (typeof document !== 'undefined') initApp();
</script>
</body>
</html>
```

- [ ] **Step 4: Run the Node tests to verify they pass**

Run: `cd "/Users/bob/Rob's Coding Projects/MD-SQL Editor/md-sql-viewer" && node tests/run-node.mjs`
Expected: `10 passed, 0 failed`, exit 0.

- [ ] **Step 5: Create tests.html**

```html
<!DOCTYPE html>
<meta charset="utf-8">
<title>MD+SQL Viewer — Tests</title>
<script>location.replace('viewer.html?test=1');</script>
```

- [ ] **Step 6: Visual smoke check**

Run: `cd "/Users/bob/Rob's Coding Projects/MD-SQL Editor/md-sql-viewer" && python3 -c "import pathlib,subprocess; subprocess.run(['open', pathlib.Path('viewer.html').resolve().as_uri()])"`
Expected: browser opens showing the header (brand, hints, Open button) and the "Drop .md or .sql files anywhere" hint, auto dark/light. No console errors.

- [ ] **Step 7: Commit**

```bash
cd "/Users/bob/Rob's Coding Projects/MD-SQL Editor/md-sql-viewer"
git add viewer.html tests.html tests/run-node.mjs
git commit -m "feat: viewer skeleton, pure utilities, zero-dep Node test runner

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Tab CORE, plaintext renderer, outline pane, open paths

**Files:**
- Modify: `viewer.html` (grow the app `<script>` between the utilities and `initApp`)
- Modify: `tests/run-node.mjs` (append tests before the summary lines)
- Create: `tests/browser-tests.js`
- Create: `tests/open-in-browser.sh`

**Interfaces:**
- Consumes: Task 1 utilities and element IDs.
- Produces:
  - `state = { tabs: [], activeId: null, nextId: 1 }`; `activeTab() → tab|null`
  - `addTab({name, path?, source, handle?, lastModified?}) → id` — computes `ext`, sets `savedSource = source`, `mode: 'view'`, activates, renders
  - `closeTab(id)`, `setActive(id)`, `prevTab()`, `nextTab()`
  - `rendererFor(ext) → renderer`; `RENDERERS` (empty map for now — everything falls back to `plaintextRenderer`)
  - renderer contract: `render(source) → { bodyEl, outline, outlineTitle }`
  - `buildCodeScroll(lineHTMLArray) → HTMLElement` (`.code-scroll` with `#line-N` rows)
  - `decodeSeed(seedArray) → [{name, path, source}]` (pure)
  - `renderActive()`, `renderTabs()`, `renderOutlinePane(outline, title, tab)`, `flashLine(n)`, `jumpTo(entry, tab)`, `toast(msg)`, `updateHeaderButtons()` (v1: copyAll only)
  - `readFile(file)` FileReader fallback; picker/drop/keyboard/seed wiring in `initApp`
  - `window.__TEST__.app = { state, activeTab, addTab, closeTab, setActive, prevTab, nextTab, renderActive }` (inside initApp)

- [ ] **Step 1: Append failing Node tests**

Insert before the `console.log(\`\n${pass} passed…\`)` line in `tests/run-node.mjs`:

```js
/* ===== Task 2: core ===== */
t('decodeSeed decodes base64 items', () => {
  const seed = [{ name: 'a.sql', path: '/x/a.sql', b64: btoa('select 1;') }];
  eq(T.decodeSeed(seed), [{ name: 'a.sql', path: '/x/a.sql', source: 'select 1;' }]);
});
t('decodeSeed skips malformed entries', () => {
  eq(T.decodeSeed([{ nope: true }, null, { name: 'b.md', b64: btoa('# hi') }]),
     [{ name: 'b.md', path: 'b.md', source: '# hi' }]);
  eq(T.decodeSeed('not an array'), []);
});
t('rendererFor falls back to plaintext for unknown ext', () => {
  ok(typeof T.rendererFor('xyz').render === 'function');
  ok(T.rendererFor('xyz') === T.rendererFor(''));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node tests/run-node.mjs`
Expected: 3 new tests FAIL (`T.decodeSeed is not a function`), exit 1.

- [ ] **Step 3: Implement CORE**

Add to viewer.html's app script, after the utilities `window.__TEST__` line and before the `initApp` section. Ported blocks are called out; new code is complete:

```js
/* ════════════════════════════════════════════════════════════
   CORE · state + renderer registry
   ════════════════════════════════════════════════════════════ */
const state = { tabs: [], activeId: null, nextId: 1 };
function activeTab() { return state.tabs.find(t => t.id === state.activeId) || null; }

const RENDERERS = {}; // filled by the sql (Task 3) and md (Task 4) sections

const plaintextRenderer = {
  render(source) {
    const lines = source.split('\n').map(l => (l === '' ? '' : escapeHTML(l)));
    return { bodyEl: buildCodeScroll(lines), outline: [], outlineTitle: null };
  }
};
function rendererFor(ext) { return RENDERERS[ext] || plaintextRenderer; }

function decodeSeed(seed) {
  if (!Array.isArray(seed)) return [];
  const out = [];
  for (const s of seed) {
    if (!s || typeof s.b64 !== 'string') continue;
    let source;
    try { source = b64ToString(s.b64); } catch (e) { continue; }
    out.push({ name: String(s.name || 'untitled'), path: String(s.path || s.name || 'untitled'), source });
  }
  return out;
}

Object.assign(window.__TEST__, { decodeSeed, rendererFor, plaintextRenderer });
```

Then, still before `initApp`:

- `buildCodeScroll(lineHTML)` — port `renderCode` from `SRC_SQL` lines 420–437, renamed, returning the `.code-scroll` element instead of writing to `codeHost` (drop the last three lines that touch `codeHost`; end with `return scroll;`).
- `flashLine(n)` — port `SRC_SQL` 439–445 verbatim.
- `copyText(text, btn, doneLabel)` — port `SRC_SQL` 447–454 verbatim.
- `renderTabs()` — port `SRC_SQL` 518–534 with ONE addition after `btn.title = …`: `btn.dataset.id = String(t.id);`.
- `setActive`, `closeTab`, `prevTab`, `nextTab` — port `SRC_SQL` 543–552 verbatim.
- Scrollspy — port `SRC_SQL` 554–569: keep `let outlineLinks = [];` (SRC_SQL 418) and `let spyTick = false;` (555) at module level, and move the `window.addEventListener('scroll', …)` registration (556–569) INSIDE `initApp` (wiring lives in initApp, per the Node-testability rule).

New code (complete):

```js
function addTab({ name, path, source, handle = null, lastModified = null }) {
  const id = state.nextId++;
  state.tabs.push({ id, name, path: path || name, ext: extOf(name), source,
    savedSource: source, handle, lastModified, mode: 'view',
    rendered: null, lastOutline: [], _ta: null });
  state.activeId = id;
  renderTabs(); renderActive();
  return id;
}

function copyActiveSource() { const t = activeTab(); if (t) copyText(t.source, copyAllBtn, 'Copied'); }

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  setTimeout(() => { toastEl.hidden = true; }, 4000);
}

function updateHeaderButtons() {
  const tab = activeTab();
  copyAllBtn.hidden = !tab;
  // editToggle/saveBtn stay hidden until Tasks 5–6
}

function renderOutlinePane(entries, title, tab) {
  outlineEl.innerHTML = '';
  outlineLinks = [];
  if (!entries.length) return;
  const t = document.createElement('div');
  t.className = 'o-title';
  t.textContent = title || 'Outline';
  outlineEl.appendChild(t);
  const ul = document.createElement('ul');
  entries.forEach(e => {
    const li = document.createElement('li');
    li.className = 'o-item' + (e.kind === 'section' ? ' section' : '') + (e.level ? ' o-l' + e.level : '');
    const a = document.createElement('a');
    a.href = e.anchor ? '#' + e.anchor : '#line-' + e.line;
    a.textContent = e.label;
    a.title = e.label + (e.line ? '  ·  line ' + e.line : '');
    a.addEventListener('click', ev => { ev.preventDefault(); jumpTo(e, tab); });
    li.appendChild(a);
    if (e.line) outlineLinks.push({ a, line: e.line });
    if (e.text) { // sql statements: hover-copy chip
      const cp = document.createElement('span');
      cp.className = 'o-copy'; cp.textContent = 'copy'; cp.title = 'Copy this statement';
      cp.addEventListener('click', ev => { ev.stopPropagation(); copyText(e.text.endsWith(';') ? e.text : e.text + ';', cp, 'ok'); });
      li.appendChild(cp);
    }
    ul.appendChild(li);
  });
  outlineEl.appendChild(ul);
}

function jumpTo(entry, tab) {
  // edit-mode branch added in Task 5
  if (entry.anchor) {
    const el = document.getElementById(entry.anchor);
    if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
  }
  if (entry.line) flashLine(entry.line);
}

function renderActive() {
  const tab = activeTab();
  if (!tab) {
    contentHost.innerHTML = ''; outlineEl.innerHTML = ''; outlineLinks = [];
    metaEl.hidden = true; noticeEl.hidden = true; editNoteEl.hidden = true;
    dropHint.style.display = ''; tabsEl.hidden = true;
    document.title = 'MD+SQL Viewer';
    updateHeaderButtons();
    return;
  }
  dropHint.style.display = 'none';
  tabsEl.hidden = false;
  noticeEl.hidden = true;

  // view mode (edit mode branch added in Task 5)
  const cls = classifyContent(tab.source);
  let result;
  if (cls === 'binary') {
    const el = document.createElement('div');
    el.id = 'binary-note';
    el.textContent = 'This looks like a binary file — nothing to display.';
    el.style.cssText = 'padding:60px 20px;text-align:center;color:var(--muted)';
    result = { bodyEl: el, outline: [], outlineTitle: null };
  } else if (cls === 'huge') {
    noticeEl.textContent = 'Rendered view disabled for large files (>5 MB) — showing plain text.';
    noticeEl.hidden = false;
    result = plaintextRenderer.render(tab.source);
  } else {
    if (!tab.rendered || tab.rendered.source !== tab.source) {
      const r = rendererFor(tab.ext).render(tab.source);
      tab.rendered = { source: tab.source, bodyEl: r.bodyEl, outline: r.outline, outlineTitle: r.outlineTitle };
    }
    result = tab.rendered;
  }
  tab.lastOutline = result.outline;
  contentHost.replaceChildren(result.bodyEl);
  renderOutlinePane(result.outline, result.outlineTitle, tab);

  const lineCount = tab.source.split('\n').length;
  const bytes = new Blob([tab.source]).size;
  metaEl.innerHTML = '<span><b>' + escapeHTML(tab.name) + '</b></span>' +
    '<span>' + lineCount.toLocaleString() + ' lines</span>' +
    '<span>' + formatBytes(bytes) + '</span>';
  metaEl.hidden = false;
  document.title = tab.name + ' — MD+SQL Viewer';
  updateHeaderButtons();
  window.scrollTo(0, 0);
}

function readFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => addTab({ name: file.name, path: file.name, source: e.target.result,
    lastModified: file.lastModified || null });
  reader.readAsText(file);
}
```

Inside `initApp()` (after the element lookups, before the test-mode block), add:

```js
  // ---- open paths (handle-aware upgrades land in Task 6) ----
  openBtn.addEventListener('click', () => pickerInput.click());
  pickerInput.addEventListener('change', e => { Array.from(e.target.files).forEach(readFile); e.target.value = ''; });
  copyAllBtn.addEventListener('click', copyActiveSource);

  ['dragenter', 'dragover'].forEach(evt => document.addEventListener(evt, e => { e.preventDefault(); document.body.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(evt => document.addEventListener(evt, e => { e.preventDefault(); document.body.classList.remove('dragging'); }));
  document.addEventListener('drop', e => { e.preventDefault(); Array.from(e.dataTransfer.files).forEach(readFile); });

  // ---- keyboard (⌘-chords added in Tasks 5–7) ----
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '[') { e.preventDefault(); prevTab(); }
    else if (e.key === ']') { e.preventDefault(); nextTab(); }
    else if (e.key === 'x' && state.activeId) { e.preventDefault(); closeTab(state.activeId); }
    else if (e.key === 'c' && state.activeId) { e.preventDefault(); copyActiveSource(); }
  });

  // ---- scrollspy (ported registration moved here) ----
  /* paste the window.addEventListener('scroll', …) registration from SRC_SQL 556–569 here */

  // ---- seed from the macOS launcher ----
  if (window.__SEED__ !== undefined) {
    const items = decodeSeed(window.__SEED__);
    items.forEach(it => addTab(it));
    if (!items.length) toast("Couldn't decode the file passed by the launcher.");
    else setActive(state.tabs[0].id);
  }

  window.__TEST__.app = { state, activeTab, addTab, closeTab, setActive, prevTab, nextTab, renderActive };
```

- [ ] **Step 4: Run Node tests**

Run: `node tests/run-node.mjs`
Expected: `13 passed, 0 failed`, exit 0.

- [ ] **Step 5: Create the browser suite + opener script**

Create `tests/open-in-browser.sh`:

```bash
#!/bin/bash
# Opens the in-browser test suite (viewer.html?test=1) in the default browser.
cd "$(dirname "$0")/.."
python3 -c "import pathlib,subprocess; subprocess.run(['open', pathlib.Path('viewer.html').resolve().as_uri() + '?test=1'])"
```

Run: `chmod +x tests/open-in-browser.sh`

Create `tests/browser-tests.js`:

```js
// DOM test suite. Loaded by viewer.html?test=1 (never in normal use).
// Drives the live app through window.__TEST__ / window.__TEST__.app and
// renders a green/red overlay with #test-summary[data-fail] for grepping.
(function () {
  const T = window.__TEST__, A = T && T.app;
  const results = [];
  function t(name, fn) { try { fn(); results.push({ name, err: null }); } catch (e) { results.push({ name, err: e }); } }
  function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }
  function eq(a, b) { const ja = JSON.stringify(a), jb = JSON.stringify(b); if (ja !== jb) throw new Error('expected ' + jb + ', got ' + ja); }
  const realConfirm = window.confirm;
  window.confirm = () => true; // never block the suite on dialogs

  t('__TEST__.app is exposed', () => { ok(A && typeof A.addTab === 'function'); });

  t('addTab renders plaintext rows for unknown ext', () => {
    const id = A.addTab({ name: 'notes.xyz', source: 'alpha\nbeta' });
    ok(document.querySelector('#line-2 .lc'), 'row 2 exists');
    eq(document.querySelector('#line-2 .lc').textContent, 'beta');
    A.closeTab(id);
  });

  t('tab strip shows and switches tabs', () => {
    const a = A.addTab({ name: 'a.xyz', source: 'AAA' });
    const b = A.addTab({ name: 'b.xyz', source: 'BBB' });
    eq(document.querySelectorAll('#tabs .tab').length, 2);
    ok(document.title.startsWith('b.xyz'));
    A.setActive(a);
    ok(document.title.startsWith('a.xyz'));
    A.closeTab(a); A.closeTab(b);
  });

  t('binary content shows notice, no rows', () => {
    const id = A.addTab({ name: 'blob.bin', source: 'ab\u0000cd' });
    ok(document.getElementById('binary-note'), 'binary note shown');
    ok(!document.querySelector('#line-1'), 'no code rows');
    A.closeTab(id);
  });

  t('closing last tab restores drop hint', () => {
    const id = A.addTab({ name: 'x.txt', source: 'x' });
    A.closeTab(id);
    ok(document.getElementById('drop-hint').style.display !== 'none');
  });

  window.confirm = realConfirm;

  const failCount = results.filter(r => r.err).length;
  const box = document.createElement('div');
  box.id = 'test-summary';
  box.dataset.fail = String(failCount);
  box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:45vh;overflow:auto;'
    + 'background:var(--panel);border-top:2px solid ' + (failCount ? '#e64553' : '#40a02b')
    + ';padding:10px 20px;font:12px ui-monospace,Menlo,monospace;z-index:9999';
  box.innerHTML = '<b>' + (results.length - failCount) + ' passed, ' + failCount + ' failed</b>'
    + results.map(r => '<div style="color:' + (r.err ? '#e64553' : '#40a02b') + '">'
      + (r.err ? '✗ ' : '✓ ') + r.name + (r.err ? ' — ' + r.err.message : '') + '</div>').join('');
  document.body.appendChild(box);
})();
```

- [ ] **Step 6: Run the browser suite**

Run: `bash tests/open-in-browser.sh`
Expected: overlay shows `5 passed, 0 failed` (green bar). Also drag any `.txt` file onto the window — it opens as a plaintext tab.

- [ ] **Step 7: Commit**

```bash
git add viewer.html tests/
git commit -m "feat: tab core, plaintext renderer, outline pane, open paths, browser suite

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: SQL renderer (tokenizer + statement outline port)

**Files:**
- Modify: `viewer.html` (new `RENDERERS · sql` section between plaintextRenderer and the CORE render functions)
- Modify: `tests/run-node.mjs`, `tests/browser-tests.js` (append)

**Interfaces:**
- Consumes: `buildCodeScroll`, `escapeHTML`, `truncate`, `RENDERERS`.
- Produces: `tokenizeSQL(s) → [{t, v, line}]`; `highlightToLines(sql) → string[]` (per-line HTML); `buildSQLOutline(sql) → [{label, line, kind, text?}]`; `sqlRenderer`; `RENDERERS.sql/.ddl/.pgsql/.psql` registered. All pure functions on `__TEST__`.

- [ ] **Step 1: Append failing Node tests**

```js
/* ===== Task 3: sql renderer ===== */
t('tokenizeSQL basic statement', () => {
  const toks = T.tokenizeSQL('SELECT 1;').filter(x => x.t !== 'ws');
  eq(toks.map(x => x.t), ['keyword', 'number', 'punct']);
});
t('tokenizeSQL dollar quoting stays one token', () => {
  const toks = T.tokenizeSQL('DO $$ select 1; $$;').filter(x => x.t === 'dollar');
  eq(toks.length, 1);
  ok(toks[0].v.includes('select 1;'));
});
t('tokenizeSQL E-string escapes', () => {
  const toks = T.tokenizeSQL("E'a\\'b' ").filter(x => x.t === 'string');
  eq(toks.length, 1);
});
t('tokenizeSQL tracks line numbers', () => {
  const toks = T.tokenizeSQL('SELECT 1;\n\nSELECT 2;').filter(x => x.t === 'keyword');
  eq(toks.map(x => x.line), [1, 3]);
});
t('highlightToLines splits multi-line comment per line', () => {
  const lines = T.highlightToLines('/* a\nb */');
  eq(lines.length, 2);
  ok(lines[0].includes('t-comment') && lines[1].includes('t-comment'));
});
t('buildSQLOutline labels CREATE TABLE with name', () => {
  const entries = T.buildSQLOutline('CREATE TABLE IF NOT EXISTS public.users (id int);');
  eq(entries.length, 1);
  eq(entries[0].label, 'CREATE TABLE public.users');
  eq(entries[0].line, 1);
});
t('buildSQLOutline emits banner sections', () => {
  const sql = '-- ============\n-- User tables\n-- ============\nCREATE TABLE users (id int);';
  const kinds = T.buildSQLOutline(sql).map(e => e.kind);
  eq(kinds, ['section', 'stmt']);
});
```

- [ ] **Step 2: Run to verify failure** — `node tests/run-node.mjs` → 7 new FAILs (`T.tokenizeSQL is not a function`).

- [ ] **Step 3: Port the tokenizer + outline, wrap as renderer**

Add a `/* ═ RENDERERS · sql ═ */` section to viewer.html directly after `plaintextRenderer`/`rendererFor`:

1. Copy `SRC_SQL` lines 210–307 verbatim (`KEYWORDS`, `TYPES`, the `RE_*` regexes, `stickyAt`, `tokenizeSQL`). Do NOT copy line 309 (`escapeHTML` — already in CORE) or line 332 (`truncate` — already in CORE).
2. Copy `SRC_SQL` lines 311–327 verbatim (`highlightToLines`).
3. Copy `SRC_SQL` lines 334–406 verbatim (`hasRule`, `hasLetters`, `commentLabel`, `labelForStatement`, `buildOutline`) and rename `buildOutline` → `buildSQLOutline` (declaration only — it has no other callers in the ported block).
4. Append:

```js
const sqlRenderer = {
  render(source) {
    const bodyEl = buildCodeScroll(highlightToLines(source));
    const entries = buildSQLOutline(source).map(e =>
      ({ label: e.label, line: e.line, kind: e.kind, text: e.text,
         level: e.kind === 'section' ? 1 : 2 }));
    const stmtCount = entries.filter(e => e.kind === 'stmt').length;
    return { bodyEl, outline: entries, outlineTitle: 'Statements (' + stmtCount + ')' };
  }
};
RENDERERS.sql = RENDERERS.ddl = RENDERERS.pgsql = RENDERERS.psql = sqlRenderer;

Object.assign(window.__TEST__, { tokenizeSQL, highlightToLines, buildSQLOutline, sqlRenderer });
```

- [ ] **Step 4: Run Node tests** — `node tests/run-node.mjs` → `20 passed, 0 failed`.

- [ ] **Step 5: Append browser tests**

Insert before the `window.confirm = realConfirm;` line in `tests/browser-tests.js`:

```js
  t('sql tab renders token spans and outline', () => {
    const id = A.addTab({ name: 'demo.sql', source: '-- ====\n-- Core\n-- ====\nCREATE TABLE users (id int);\nSELECT 1;' });
    ok(document.querySelector('.lc .t-keyword'), 'keyword tokens colored');
    const links = [...document.querySelectorAll('#outline .o-item a')].map(a => a.textContent);
    ok(links.some(l => l.includes('CREATE TABLE users')), 'outline lists statement, got: ' + links.join('|'));
    ok(document.querySelector('#outline .o-item.section'), 'banner section present');
    ok(document.querySelector('#outline .o-copy'), 'statement copy chip present');
    A.closeTab(id);
  });
```

- [ ] **Step 6: Run browser suite** — `bash tests/open-in-browser.sh` → `6 passed, 0 failed`. Also click the outline's `CREATE TABLE users` link and confirm the line flashes.

- [ ] **Step 7: Commit**

```bash
git add viewer.html tests/
git commit -m "feat: SQL renderer — tokenizer, highlighting, statement outline (ported)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Markdown renderer + vendored marked

**Files:**
- Modify: `viewer.html` (fill `/*__VENDOR_MARKED__*/`; new `RENDERERS · markdown` section after the sql section)
- Modify: `tests/run-node.mjs`, `tests/browser-tests.js`

**Interfaces:**
- Consumes: `truncate`, `highlightToLines` (for ```sql fences), `RENDERERS`, global `marked` (vendored).
- Produces: `preprocessMarkdown(md)`, `sanitizeAngles(seg)`, `slugify(s)`, `maskFences(lines) → lines`, `headingLineFor(lines, level, fromLine) → line|null` (all pure, on `__TEST__`); `mdRenderer`; `RENDERERS.md/.markdown/.mdown/.mkd` registered.

- [ ] **Step 1: Append failing Node tests**

```js
/* ===== Task 4: markdown renderer ===== */
t('marked is vendored and parses', () => {
  ok(typeof sandbox.marked === 'object' || typeof sandbox.marked === 'function', 'marked global exists');
  ok(sandbox.marked.parse('# Hi').includes('<h1'), 'marked.parse works');
});
t('preprocessMarkdown escapes generics outside code', () => {
  ok(T.preprocessMarkdown('a Record<string, unknown> b').includes('&lt;string, unknown&gt;'));
});
t('preprocessMarkdown leaves fenced code untouched', () => {
  const md = '```ts\nconst x: Array<number> = [];\n```';
  eq(T.preprocessMarkdown(md), md);
});
t('preprocessMarkdown leaves inline code untouched', () => {
  ok(T.preprocessMarkdown('use `Set<T>` here').includes('`Set<T>`'));
});
t('slugify', () => {
  eq(T.slugify('Hello,  World!'), 'hello-world');
  eq(T.slugify('   '), 'section');
});
t('maskFences blanks fenced lines', () => {
  eq(T.maskFences(['a', '```', '# not a heading', '```', 'b']), ['a', '', '', '', 'b']);
});
t('headingLineFor finds next ATX heading of level', () => {
  const lines = ['intro', '## One', 'text', '## Two'];
  eq(T.headingLineFor(lines, 2, 0), 2);
  eq(T.headingLineFor(lines, 2, 2), 4);
  eq(T.headingLineFor(lines, 3, 0), null);
});
```

Note: the `marked` test reads `sandbox.marked` — at the top of run-node.mjs the sandbox variable is already in scope; no change needed.

- [ ] **Step 2: Run to verify failure** — `node tests/run-node.mjs` → 7 new FAILs.

- [ ] **Step 3: Vendor marked v18.0.5 into the placeholder**

```bash
cd "/Users/bob/Rob's Coding Projects/MD-SQL Editor/md-sql-viewer"
SCRATCH="/private/tmp/claude-501/-Users-bob-Rob-s-Coding-Projects-MD-SQL-Editor/028902db-6df0-4ad9-bd97-3c320b2f0ec1/scratchpad"
curl -sL "https://cdn.jsdelivr.net/npm/marked@18.0.5/lib/marked.umd.js" -o "$SCRATCH/marked.umd.js"
grep -c "marked v18.0.5" "$SCRATCH/marked.umd.js"   # expect 1
python3 - "$SCRATCH/marked.umd.js" <<'EOF'
import pathlib, sys
lib = pathlib.Path(sys.argv[1]).read_text()
v = pathlib.Path('viewer.html'); html = v.read_text()
marker = '/*__VENDOR_MARKED__*/'
assert marker in html, 'marker missing'
v.write_text(html.replace(marker,
  '/* ═══ VENDORED: marked v18.0.5 — https://github.com/markedjs/marked (MIT) ═══ */\n' + lib, 1))
print('vendored', len(lib), 'bytes')
EOF
```

Expected: `vendored 42921 bytes` (±, if jsdelivr re-serves). Verify: `grep -c "marked v18.0.5" viewer.html` → ≥1.

- [ ] **Step 4: Implement the markdown renderer**

Add a `/* ═ RENDERERS · markdown ═ */` section after the sql section:

1. At the top of the section: `marked.use({ gfm: true, breaks: false });`
2. Copy `SRC_MD` lines 256–277 verbatim (`HTML_ALLOW`, `sanitizeAngles`, `preprocessMarkdown`).
3. Copy `SRC_MD` lines 290–295 verbatim (`slugify`).
4. Add `processContent` — this is `SRC_MD` 297–337 with three deliberate changes (full modified version):

```js
function processContent(root) {
  const used = new Set();
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    let base = slugify(h.textContent);
    let id = base, i = 2;
    while (used.has(id)) { id = base + '-' + (i++); }
    used.add(id); h.id = id;
    const a = document.createElement('a');
    a.href = '#' + id; a.className = 'anchor'; a.textContent = '#';
    a.setAttribute('aria-hidden', 'true');
    h.prepend(a);
  });
  root.querySelectorAll('pre > code').forEach(code => {
    const cls = Array.from(code.classList).find(c => c.startsWith('language-'));
    const lang = cls ? cls.replace('language-', '') : '';
    if (lang) code.parentElement.setAttribute('data-lang', lang);
    // CHANGED vs SRC_MD: no highlight.js — but sql fences reuse our tokenizer.
    if (/^(sql|pgsql|psql|ddl)$/i.test(lang)) {
      code.innerHTML = highlightToLines(code.textContent).join('\n');
    }
    const pre = code.parentElement;
    const btn = document.createElement('button');
    btn.className = 'code-copy';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(code.textContent);
        btn.textContent = 'Copied'; btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1200);
      } catch (err) {
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      }
    });
    pre.appendChild(btn);
  });
  // CHANGED vs SRC_MD: task checkboxes STAY disabled — v1 has no checkbox
  // write-back (edit the source instead). Deliberately no cb.disabled = false.
}
```

5. Add the outline helpers and renderer (complete new code):

```js
// Fenced code can contain lines like "# comment" that would false-match ATX
// headings; blank those lines before line-matching.
function maskFences(lines) {
  const out = []; let inFence = false;
  for (const l of lines) {
    if (/^(```|~~~)/.test(l.trim())) { inFence = !inFence; out.push(''); continue; }
    out.push(inFence ? '' : l);
  }
  return out;
}

// Next ATX heading of `level` at/after 0-based index fromLine → 1-based line.
// DOM heading order matches source order, so sequential scanning aligns them.
// (Setext headings return null; caller falls back to the previous entry's line.)
function headingLineFor(lines, level, fromLine) {
  const prefix = '#'.repeat(level) + ' ';
  for (let i = fromLine; i < lines.length; i++)
    if (lines[i].startsWith(prefix)) return i + 1;
  return null;
}

function mdOutline(root, source) {
  const lines = maskFences(source.split('\n'));
  let cursor = 0;
  const entries = [];
  root.querySelectorAll('h1, h2, h3, h4').forEach(h => {
    const level = Number(h.tagName[1]);
    const label = truncate(h.textContent.replace(/^#\s*/, ''), 46);
    const line = headingLineFor(lines, level, cursor);
    if (line !== null) cursor = line;
    entries.push({ label, level, anchor: h.id,
      line: line !== null ? line : (entries.length ? entries[entries.length - 1].line : 1) });
  });
  return entries;
}

const mdRenderer = {
  render(source) {
    const art = document.createElement('article');
    art.className = 'prose';
    art.innerHTML = marked.parse(preprocessMarkdown(source));
    processContent(art);
    const outline = mdOutline(art, source);
    return { bodyEl: art, outline, outlineTitle: outline.length >= 2 ? 'On this page' : null };
  }
};
RENDERERS.md = RENDERERS.markdown = RENDERERS.mdown = RENDERERS.mkd = mdRenderer;

Object.assign(window.__TEST__, { preprocessMarkdown, sanitizeAngles, slugify, maskFences, headingLineFor, mdRenderer });
```

Note `outlineTitle: … ? 'On this page' : null` — but entries still render even for 1 heading; that matches SRC_MD's "hide TOC under 2 headings" only for the title. Simplification: pass outline `[]` when `outline.length < 2` is NOT done — keep all entries; a one-heading outline is harmless.

- [ ] **Step 5: Run Node tests** — `node tests/run-node.mjs` → `27 passed, 0 failed`.

- [ ] **Step 6: Append browser tests**

```js
  t('md tab renders prose with heading ids and outline anchors', () => {
    const id = A.addTab({ name: 'doc.md', source: '# Title\n\n## Alpha\ntext\n\n## Beta\n\n```sql\nSELECT 1;\n```\n\n- [ ] task' });
    ok(document.querySelector('.prose h2#alpha'), 'heading id assigned');
    const links = [...document.querySelectorAll('#outline .o-item a')];
    ok(links.some(a => a.getAttribute('href') === '#beta'), 'outline anchors to #beta');
    ok(document.querySelector('.prose pre .t-keyword'), 'sql fence tokenized');
    const cb = document.querySelector('.prose li input[type=checkbox]');
    ok(cb && cb.disabled, 'task checkbox stays disabled in v1');
    A.closeTab(id);
  });
```

- [ ] **Step 7: Run browser suite** — `bash tests/open-in-browser.sh` → `7 passed, 0 failed`.

- [ ] **Step 8: Commit**

```bash
git add viewer.html tests/
git commit -m "feat: markdown renderer with vendored marked v18.0.5, sql-fence highlighting

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Edit mode

**Files:**
- Modify: `viewer.html` (CORE: editor builder, mode plumbing, dirty tracking, guards)
- Modify: `tests/run-node.mjs`, `tests/browser-tests.js`

**Interfaces:**
- Consumes: tab shape, `renderActive`, `lineStartIndex`, element refs `editBtn`, `contentHost`.
- Produces: `isDirty(tab) → boolean` (pure); `toggleEdit()`; `buildEditor(tab) → HTMLElement` (sets `tab._ta`); `refreshDirtyMarkers()`; `closeTabWithGuard(id)`; `jumpTextareaToLine(tab, line)`; `beforeunload` guard; `Cmd+E`; `jumpTo` gains the edit-mode branch. Task 6 consumes: `tab.source` live-updated on input; `editBtn` label toggling; `updateHeaderButtons()` still owns button visibility.

- [ ] **Step 1: Append failing Node test**

```js
/* ===== Task 5: edit mode ===== */
t('isDirty compares source to savedSource', () => {
  ok(!T.isDirty({ source: 'a', savedSource: 'a' }));
  ok(T.isDirty({ source: 'b', savedSource: 'a' }));
});
```

- [ ] **Step 2: Run to verify failure** — `node tests/run-node.mjs` → 1 new FAIL.

- [ ] **Step 3: Implement edit mode**

Add to CORE (before `renderActive`):

```js
function isDirty(tab) { return tab.source !== tab.savedSource; }

function refreshDirtyMarkers() {
  document.querySelectorAll('#tabs .tab').forEach(btn => {
    const t = state.tabs.find(x => String(x.id) === btn.dataset.id);
    if (t) btn.classList.toggle('dirty', isDirty(t));
  });
}

function buildEditor(tab) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-wrap';
  const gutter = document.createElement('div');
  gutter.className = 'editor-gutter';
  const ta = document.createElement('textarea');
  ta.className = 'editor-ta';
  ta.value = tab.source;
  ta.spellcheck = false;
  const syncGutter = () => {
    const n = tab.source.split('\n').length;
    if (gutter.childElementCount !== n) {
      gutter.innerHTML = Array.from({ length: n }, (_, i) => '<div>' + (i + 1) + '</div>').join('');
    }
    gutter.scrollTop = ta.scrollTop;
  };
  ta.addEventListener('input', () => {
    tab.source = ta.value;
    tab.rendered = null;
    syncGutter();
    refreshDirtyMarkers();
    updateHeaderButtons();
  });
  ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
  wrap.append(gutter, ta);
  queueMicrotask(syncGutter);
  tab._ta = ta;
  return wrap;
}

function toggleEdit() {
  const tab = activeTab();
  if (!tab) return;
  tab.mode = tab.mode === 'edit' ? 'view' : 'edit';
  renderActive();
  if (tab.mode === 'edit' && tab._ta) tab._ta.focus();
}

function jumpTextareaToLine(tab, line) {
  const ta = tab._ta;
  if (!ta || !line) return;
  const idx = lineStartIndex(tab.source, line);
  ta.focus();
  ta.setSelectionRange(idx, idx);
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 19;
  ta.scrollTop = Math.max(0, (line - 1) * lh - ta.clientHeight / 3);
}

function closeTabWithGuard(id) {
  const tab = state.tabs.find(t => t.id === id);
  if (tab && isDirty(tab) &&
      !confirm('"' + tab.name + '" has unsaved changes. Close and discard them?')) return;
  closeTab(id);
}
```

Modify `jumpTo` — replace its first line with:

```js
function jumpTo(entry, tab) {
  if (tab && tab.mode === 'edit') { jumpTextareaToLine(tab, entry.line); return; }
  if (entry.anchor) {
```

Modify `renderActive` — after `noticeEl.hidden = true;` insert the edit branch:

```js
  if (tab.mode === 'edit') {
    contentHost.replaceChildren(buildEditor(tab));
    // Outline stays from the last render (static while editing); clicks jump lines.
    renderOutlinePane(tab.lastOutline, 'Outline', tab);
    metaEl.hidden = true;
    document.title = tab.name + ' — MD+SQL Viewer';
    updateHeaderButtons();
    return;
  }
```

Replace `updateHeaderButtons` with:

```js
function updateHeaderButtons() {
  const tab = activeTab();
  editBtn.hidden = !tab;
  copyAllBtn.hidden = !tab || tab.mode === 'edit';
  // saveBtn stays hidden until Task 6
  if (tab) editBtn.textContent = tab.mode === 'edit' ? 'View' : 'Edit';
  editNoteEl.hidden = true;
}
```

Also: `renderTabs()` port ends by rebuilding all tab buttons — add `refreshDirtyMarkers();` as its last line so dirty dots survive rebuilds.

In `initApp`, wire:
- `editBtn.addEventListener('click', toggleEdit);`
- Change the plain-key handler's close line from `closeTab(state.activeId)` to `closeTabWithGuard(state.activeId)`.
- Add the ⌘-chord branch at the TOP of the keydown handler (before the input/textarea early-return, so ⌘E/⌘S work while typing):

```js
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'e') { e.preventDefault(); toggleEdit(); return; }
      // 's' (save) added in Task 6, 'f' (find) in Task 7, 'o' (open) in Task 6
    }
```

- Add the unload guard:

```js
  window.addEventListener('beforeunload', e => {
    if (state.tabs.some(isDirty)) { e.preventDefault(); e.returnValue = ''; }
  });
```

- Extend the app export: `Object.assign(window.__TEST__.app, { toggleEdit, closeTabWithGuard, isDirty });` and add `isDirty` to the top-level `Object.assign(window.__TEST__, { … })` alongside the other pure functions (add `isDirty` to the utilities export line in Task 1's block: `window.__TEST__ = { …, isDirty }` — define `isDirty` above that line or extend via `Object.assign(window.__TEST__, { isDirty })` right after its definition).

- [ ] **Step 4: Run Node tests** — `node tests/run-node.mjs` → `28 passed, 0 failed`.

- [ ] **Step 5: Append browser tests**

```js
  t('toggle edit shows textarea with source and gutter', () => {
    const id = A.addTab({ name: 'e.sql', source: 'SELECT 1;\nSELECT 2;' });
    A.toggleEdit();
    const ta = document.querySelector('.editor-ta');
    ok(ta, 'textarea present');
    eq(ta.value, 'SELECT 1;\nSELECT 2;');
    eq(document.querySelectorAll('.editor-gutter div').length, 2);
    A.toggleEdit();
    ok(!document.querySelector('.editor-ta'), 'back to view');
    A.closeTab(id);
  });

  t('editing marks tab dirty; view re-renders edited source', () => {
    const id = A.addTab({ name: 'd.sql', source: 'SELECT 1;' });
    A.toggleEdit();
    const ta = document.querySelector('.editor-ta');
    ta.value = 'SELECT 42;';
    ta.dispatchEvent(new Event('input'));
    ok(document.querySelector('#tabs .tab.dirty'), 'dirty dot shown');
    A.toggleEdit();
    ok(document.querySelector('#content-host').textContent.includes('42'), 'view shows edit');
    A.closeTab(id); // confirm stubbed true — discards
  });

  t('outline click in edit mode moves textarea caret', () => {
    const id = A.addTab({ name: 'o.sql', source: 'SELECT 1;\nSELECT 2;\nCREATE TABLE t (i int);' });
    A.toggleEdit();
    const link = [...document.querySelectorAll('#outline .o-item a')].find(a => a.textContent.includes('CREATE TABLE'));
    ok(link, 'outline entry present in edit mode');
    link.click();
    const ta = document.querySelector('.editor-ta');
    eq(ta.selectionStart, 'SELECT 1;\nSELECT 2;\n'.length);
    A.closeTab(id);
  });
```

- [ ] **Step 6: Run browser suite** — `bash tests/open-in-browser.sh` → `10 passed, 0 failed`. Manually: ⌘E toggles, dirty tab close asks for confirmation (open a file, edit, press `x` outside the textarea).

- [ ] **Step 7: Commit**

```bash
git add viewer.html tests/
git commit -m "feat: edit mode — textarea+gutter, dirty tracking, close guards, line jumps

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Save pipeline + file-handle capture

**Files:**
- Modify: `viewer.html` (CORE save section; upgrade open paths; full `updateHeaderButtons`)
- Modify: `tests/run-node.mjs`, `tests/browser-tests.js`

**Interfaces:**
- Consumes: tab shape (`handle`, `lastModified`, `savedSource`), `isDirty`, `toast`, `saveBtn`, `editNoteEl`.
- Produces: `saveActionFor(tab, caps?) → 'save'|'saveAs'|'download'` (pure — caps defaults to feature detection, injectable for tests); `saveActiveTab()`; `downloadCopy(tab)`; `openViaPicker()`; handle-capturing drop; `Cmd+S`, `Cmd+O`.

- [ ] **Step 1: Append failing Node tests**

```js
/* ===== Task 6: save pipeline ===== */
t('saveActionFor: handle → save', () => { eq(T.saveActionFor({ handle: {} }, { canPick: true }), 'save'); });
t('saveActionFor: no handle + picker → saveAs', () => { eq(T.saveActionFor({ handle: null }, { canPick: true }), 'saveAs'); });
t('saveActionFor: no capability → download', () => { eq(T.saveActionFor({ handle: null }, { canPick: false }), 'download'); });
```

- [ ] **Step 2: Run to verify failure** — 3 new FAILs.

- [ ] **Step 3: Implement**

Add a `/* ═ CORE · saving ═ */` section (before `initApp`):

```js
function saveActionFor(tab, caps) {
  caps = caps || { canPick: typeof window.showSaveFilePicker === 'function' };
  if (tab.handle) return 'save';
  return caps.canPick ? 'saveAs' : 'download';
}
Object.assign(window.__TEST__, { saveActionFor });

function downloadCopy(tab) {
  const blob = new Blob([tab.source], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = tab.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function ensureWritePermission(handle) {
  if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return;
  if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
    throw new Error('write permission denied');
  }
}

async function saveActiveTab() {
  const tab = activeTab();
  if (!tab) return;
  const action = saveActionFor(tab);
  try {
    if (action === 'save') {
      await ensureWritePermission(tab.handle);
      const before = await tab.handle.getFile();
      if (tab.lastModified != null && before.lastModified !== tab.lastModified) {
        const overwrite = confirm('"' + tab.name + '" changed on disk since it was opened.\n\n'
          + 'OK — overwrite the disk version with your edits.\n'
          + 'Cancel — leave the disk version alone (your edits stay in this tab, unsaved).');
        if (!overwrite) return;
      }
      const w = await tab.handle.createWritable();
      await w.write(tab.source);
      await w.close();
      const after = await tab.handle.getFile();
      tab.lastModified = after.lastModified;
      tab.savedSource = tab.source;
      toast('Saved ' + tab.name);
    } else if (action === 'saveAs') {
      const handle = await window.showSaveFilePicker({ suggestedName: tab.name });
      const w = await handle.createWritable();
      await w.write(tab.source);
      await w.close();
      tab.handle = handle;
      tab.name = handle.name || tab.name;
      tab.ext = extOf(tab.name);
      const f = await handle.getFile();
      tab.lastModified = f.lastModified;
      tab.savedSource = tab.source;
      renderTabs();
      toast('Saved ' + tab.name);
    } else {
      downloadCopy(tab);
      // The original file is untouched, so the tab intentionally stays dirty.
      toast('Downloaded a copy — the original file is unchanged.');
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // user cancelled the picker
    alert('Save failed: ' + (err && err.message || err)
      + '\n\nYour edits are still in this tab. Try again, or use Download copy.');
  }
  refreshDirtyMarkers();
  updateHeaderButtons();
}

async function openViaPicker() {
  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const handles = await window.showOpenFilePicker({ multiple: true });
      for (const h of handles) {
        const f = await h.getFile();
        addTab({ name: f.name, path: f.name, source: await f.text(), handle: h, lastModified: f.lastModified });
      }
    } catch (err) { if (!err || err.name !== 'AbortError') throw err; }
    return;
  }
  pickerInput.click();
}
```

Replace `updateHeaderButtons` with the final version:

```js
function updateHeaderButtons() {
  const tab = activeTab();
  editBtn.hidden = !tab;
  copyAllBtn.hidden = !tab || tab.mode === 'edit';
  saveBtn.hidden = !tab || tab.mode !== 'edit';
  editNoteEl.hidden = true;
  if (!tab) return;
  editBtn.textContent = tab.mode === 'edit' ? 'View' : 'Edit';
  if (tab.mode === 'edit') {
    const action = saveActionFor(tab);
    saveBtn.querySelector('span').textContent =
      action === 'save' ? 'Save' : action === 'saveAs' ? 'Save As…' : 'Download copy';
    editNoteEl.hidden = action !== 'download';
  }
}
```

In `initApp`:
- Change `openBtn.addEventListener('click', () => pickerInput.click());` → `openBtn.addEventListener('click', openViaPicker);`
- Replace the drop listener with the handle-aware version. CRITICAL: `dataTransfer.items` is invalidated after the first `await`, so all `getAsFileSystemHandle()` calls must be kicked off synchronously first:

```js
  document.addEventListener('drop', e => {
    e.preventDefault();
    const items = e.dataTransfer.items ? Array.from(e.dataTransfer.items) : [];
    if (items.length && typeof items[0].getAsFileSystemHandle === 'function') {
      const pending = items.filter(i => i.kind === 'file').map(i => i.getAsFileSystemHandle());
      (async () => {
        for (const p of pending) {
          try {
            const h = await p;
            if (!h || h.kind !== 'file') continue;
            const f = await h.getFile();
            addTab({ name: f.name, path: f.name, source: await f.text(), handle: h, lastModified: f.lastModified });
          } catch (err) { /* one bad item shouldn't kill the batch */ }
        }
      })();
      return;
    }
    Array.from(e.dataTransfer.files).forEach(readFile);
  });
```

- In the ⌘-chord branch add: `if (k === 's') { e.preventDefault(); saveActiveTab(); return; }` and `if (k === 'o') { e.preventDefault(); openViaPicker(); return; }`
- Wire `saveBtn.addEventListener('click', saveActiveTab);`
- Extend app export: `Object.assign(window.__TEST__.app, { saveActiveTab, openViaPicker, updateHeaderButtons });`

- [ ] **Step 4: Run Node tests** — `node tests/run-node.mjs` → `31 passed, 0 failed`.

- [ ] **Step 5: Append browser tests**

```js
  t('save button label reflects capability', () => {
    const id = A.addTab({ name: 's.md', source: '# s' });
    A.toggleEdit();
    const label = document.querySelector('#saveBtn span').textContent;
    const canPick = typeof window.showSaveFilePicker === 'function';
    eq(label, canPick ? 'Save As…' : 'Download copy');
    const note = document.getElementById('edit-note');
    eq(note.hidden, canPick); // note shows exactly when download is the only option
    A.toggleEdit();
    A.closeTab(id);
  });
```

- [ ] **Step 6: Run browser suite** — `bash tests/open-in-browser.sh` → `11 passed, 0 failed` (in Safari the label reads "Download copy" and the footer note shows).

Manual (this machine, Safari): open a file via drag, ⌘E, type, ⌘S → a copy downloads, toast appears, tab stays dirty. **[CHROMIUM-MANUAL]** deferred to Task 9: drag-drop → edit → ⌘S saves in place; picker-opened file gains handle; conflict prompt fires if the file is edited externally between open and save.

- [ ] **Step 7: Commit**

```bash
git add viewer.html tests/
git commit -m "feat: save pipeline — FS Access save/save-as, download fallback, conflict guard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Find bar

**Files:**
- Modify: `viewer.html` (CORE find section + wiring)
- Modify: `tests/run-node.mjs`, `tests/browser-tests.js`

**Interfaces:**
- Consumes: `activeTab`, `flashLine`, `jumpTextareaToLine`, `tab.lastOutline`, findbar elements.
- Produces: `findMatches(source, query) → [{index, line}]` (pure, case-insensitive, non-overlapping, capped at 5000); `openFindBar()`, `closeFindBar()`, `stepFind(dir)`; Cmd+F/Enter/Shift+Enter/Esc wiring.

- [ ] **Step 1: Append failing Node tests**

```js
/* ===== Task 7: find ===== */
t('findMatches finds case-insensitive with line numbers', () => {
  eq(T.findMatches('Alpha\nbeta ALPHA', 'alpha'), [{ index: 0, line: 1 }, { index: 11, line: 2 }]);
});
t('findMatches empty query → no matches', () => {
  eq(T.findMatches('anything', ''), []);
});
t('findMatches non-overlapping', () => {
  eq(T.findMatches('aaaa', 'aa').length, 2);
});
```

- [ ] **Step 2: Run to verify failure** — 3 new FAILs.

- [ ] **Step 3: Implement**

Pure function (top-level, in the utilities section):

```js
function findMatches(source, query) {
  if (!query) return [];
  const out = [];
  const s = source.toLowerCase(), q = query.toLowerCase();
  let i = 0, line = 1, scanned = 0;
  while ((i = s.indexOf(q, i)) !== -1) {
    for (let k = scanned; k < i; k++) if (source.charCodeAt(k) === 10) line++;
    scanned = i;
    out.push({ index: i, line });
    i += q.length;
    if (out.length >= 5000) break;
  }
  return out;
}
```

Add `findMatches` to the utilities `window.__TEST__` export.

UI section (before `initApp`):

```js
const findState = { query: '', matches: [], cur: -1 };

function updateFindCount() {
  findCountEl.textContent = findState.matches.length
    ? (findState.cur + 1) + '/' + findState.matches.length
    : (findState.query ? '0/0' : '');
}

function gotoMatch() {
  const tab = activeTab();
  const m = findState.matches[findState.cur];
  if (!tab || !m) return;
  if (tab.mode === 'edit' && tab._ta) {
    tab._ta.setSelectionRange(m.index, m.index + findState.query.length);
    jumpTextareaToLine(tab, m.line);
    tab._ta.setSelectionRange(m.index, m.index + findState.query.length);
    findInputEl.focus(); // keep Enter stepping
    return;
  }
  if (document.getElementById('line-' + m.line)) { flashLine(m.line); return; }
  // markdown rendered view: scroll to the nearest heading at/above the match
  let best = null;
  for (const e of (tab.lastOutline || [])) { if (e.line && e.line <= m.line) best = e; else if (e.line) break; }
  if (best && best.anchor) {
    const el = document.getElementById(best.anchor);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

function runFind() {
  const tab = activeTab();
  findState.query = findInputEl.value;
  findState.matches = tab ? findMatches(tab.source, findState.query) : [];
  findState.cur = findState.matches.length ? 0 : -1;
  updateFindCount();
  gotoMatch();
}

function stepFind(dir) {
  if (!findState.matches.length) return;
  findState.cur = (findState.cur + dir + findState.matches.length) % findState.matches.length;
  updateFindCount();
  gotoMatch();
}

function openFindBar() {
  findbarEl.hidden = false;
  findInputEl.focus();
  findInputEl.select();
}

function closeFindBar() {
  findbarEl.hidden = true;
  findState.query = ''; findState.matches = []; findState.cur = -1;
  findCountEl.textContent = '';
}
```

In `initApp`:

```js
  let findDebounce = null;
  findInputEl.addEventListener('input', () => {
    clearTimeout(findDebounce);
    findDebounce = setTimeout(runFind, 120);
  });
  findInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); closeFindBar(); }
  });
  document.getElementById('find-next').addEventListener('click', () => stepFind(1));
  document.getElementById('find-prev').addEventListener('click', () => stepFind(-1));
  document.getElementById('find-close').addEventListener('click', closeFindBar);
```

Add to the ⌘-chord branch: `if (k === 'f') { e.preventDefault(); openFindBar(); return; }`
Extend app export: `Object.assign(window.__TEST__.app, { openFindBar, closeFindBar, runFind, stepFind, findState });`

- [ ] **Step 4: Run Node tests** — `node tests/run-node.mjs` → `34 passed, 0 failed`.

- [ ] **Step 5: Append browser tests**

```js
  t('find bar counts and steps matches', () => {
    const id = A.addTab({ name: 'f.sql', source: 'SELECT a;\nSELECT b;\nSELECT c;' });
    A.openFindBar();
    document.getElementById('find-input').value = 'select';
    A.runFind();
    eq(document.getElementById('find-count').textContent, '1/3');
    A.stepFind(1);
    eq(document.getElementById('find-count').textContent, '2/3');
    A.stepFind(-1);
    eq(document.getElementById('find-count').textContent, '1/3');
    A.closeFindBar();
    A.closeTab(id);
  });

  t('find in edit mode selects the match', () => {
    const id = A.addTab({ name: 'fe.sql', source: 'alpha\nbeta' });
    A.toggleEdit();
    A.openFindBar();
    document.getElementById('find-input').value = 'beta';
    A.runFind();
    const ta = document.querySelector('.editor-ta');
    eq(ta.selectionStart, 6);
    eq(ta.selectionEnd, 10);
    A.closeFindBar();
    A.closeTab(id);
  });
```

- [ ] **Step 6: Run browser suite** — `bash tests/open-in-browser.sh` → `13 passed, 0 failed`.

- [ ] **Step 7: Commit**

```bash
git add viewer.html tests/
git commit -m "feat: find bar — source search, match stepping, view/edit navigation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: macOS launcher, samples, README, LICENSE

**Files:**
- Create: `macos/build.sh`, `macos/launcher.applescript`, `macos/seed-and-open.sh`
- Create: `samples/sample.md`, `samples/sample.sql`
- Create: `README.md`, `LICENSE`, `.gitignore`
- Modify: none of viewer.html (the `<!--__VIEWER_SEED__-->` marker already exists)

**Interfaces:**
- Consumes: `viewer.html` (bundled into the .app), `window.__SEED__` array-of-`{name, path, b64}` format, `<!--__VIEWER_SEED__-->` marker.
- Produces: `MD+SQL Viewer.app` (built artifact, gitignored).

- [ ] **Step 1: Create macos/seed-and-open.sh**

Copy `SRC_LAUNCH/seed-and-open.sh` verbatim, then make exactly these changes:
- Line 2 comment: `seed-and-open.sh <template.html> [file.md|file.sql ...]`
- Line 4–5 comment: `Builds a temp copy of the MD+SQL Viewer HTML with the given file(s) injected`
- `OUT=` / `SEEDFILE=` prefixes: `sqlview-` → `mdsqlview-`
- The awk marker: `index($0, "__SQLVIEWER_SEED__")` → `index($0, "__VIEWER_SEED__")`

Run: `chmod +x macos/seed-and-open.sh`

- [ ] **Step 2: Create macos/launcher.applescript**

```applescript
-- MD+SQL Viewer launcher
-- Double-clicking a .md or .sql file (when this app is the default opener) sends
-- an open-document Apple Event -> `on open`. Double-clicking the app -> `on run`.
-- Both route to the bundled seed-and-open.sh + viewer.html in Contents/Resources.

on run
	openWith({})
end run

on open theFiles
	openWith(theFiles)
end open

on openWith(theFiles)
	set resDir to POSIX path of (path to me) & "Contents/Resources/"
	set helper to quoted form of (resDir & "seed-and-open.sh")
	set template to quoted form of (resDir & "viewer.html")
	set fileArgs to ""
	repeat with f in theFiles
		set fileArgs to fileArgs & " " & quoted form of (POSIX path of f)
	end repeat
	do shell script "/bin/bash " & helper & " " & template & fileArgs
end openWith
```

- [ ] **Step 3: Create macos/build.sh**

```bash
#!/bin/bash
# build.sh — compile "MD+SQL Viewer.app" from launcher.applescript, bundle
# viewer.html + the seed helper inside it, and register it as a handler for
# BOTH Markdown (.md/.markdown/.mdown/.mkd) and SQL (.sql) files.
# Re-run any time you edit viewer.html.
set -euo pipefail
cd "$(dirname "$0")"

APP="MD+SQL Viewer.app"
PLIST_BUDDY="/usr/libexec/PlistBuddy"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

echo "› compiling $APP"
rm -rf "$APP"
osacompile -o "$APP" launcher.applescript

echo "› bundling resources"
cp ../viewer.html "$APP/Contents/Resources/viewer.html"
cp seed-and-open.sh "$APP/Contents/Resources/seed-and-open.sh"
chmod +x "$APP/Contents/Resources/seed-and-open.sh"

echo "› patching Info.plist (declare .md + .sql document types)"
PLIST="$APP/Contents/Info.plist"
"$PLIST_BUDDY" -c "Set :CFBundleName MD+SQL Viewer" "$PLIST" 2>/dev/null \
  || "$PLIST_BUDDY" -c "Add :CFBundleName string 'MD+SQL Viewer'" "$PLIST"
"$PLIST_BUDDY" -c "Set :CFBundleIdentifier com.vanovian.mdsqlviewer" "$PLIST" 2>/dev/null \
  || "$PLIST_BUDDY" -c "Add :CFBundleIdentifier string com.vanovian.mdsqlviewer" "$PLIST"
# osacompile seeds a default CFBundleDocumentTypes — drop it and add our own.
"$PLIST_BUDDY" -c "Delete :CFBundleDocumentTypes" "$PLIST" 2>/dev/null || true
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0 dict" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeName string 'Markdown Document'" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Viewer" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:LSHandlerRank string Alternate" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:0 string md" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:1 string markdown" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:2 string mdown" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:3 string mkd" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1 dict" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1:CFBundleTypeName string 'SQL Script'" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1:CFBundleTypeRole string Viewer" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1:LSHandlerRank string Alternate" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1:CFBundleTypeExtensions array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1:CFBundleTypeExtensions:0 string sql" "$PLIST"

echo "› registering with LaunchServices"
"$LSREGISTER" -f "$APP" || true

echo "✓ built $(pwd)/$APP"
echo "  Set it as your default opener: right-click a .md or .sql file → Get Info →"
echo "  Open with → MD+SQL Viewer → Change All. (See README.md.)"
```

Run: `chmod +x macos/build.sh`

- [ ] **Step 4: Create samples**

Run: `cp "/Users/bob/Rob's Coding Projects/MD-SQL Editor/sql-viewer/sample.sql" samples/sample.sql`

Create `samples/sample.md`:

```markdown
# MD+SQL Viewer sample

A quick tour of what the viewer renders. Open this file, then press `⌘E` to
see the same content as editable source.

## Formatting

**Bold**, *italic*, `inline code`, ~~strikethrough~~, and [a link](https://example.com).

> Blockquotes render with an accent bar.
> Multiple lines stay together.

## Tables

| Column | Type | Notes |
|---|---|---|
| id | bigint | primary key |
| email | citext | unique |
| created_at | timestamptz | defaults to now() |

## Task list

- [x] Ship the unified viewer
- [ ] Add a third filetype
- [ ] Bikeshed the name

## Code fences

SQL fences get real syntax highlighting:

```sql
CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email citext NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Other languages render as plain code:

```js
const answer = 42;
```

### Generics survive

Types like `Record<string, unknown>` and Array<number> don't vanish into
phantom HTML.

## A long section

This paragraph exists so the table of contents has something to highlight
while you scroll. The outline on the right tracks your position and clicking
an entry jumps to it — in edit mode it jumps your cursor to the same line.
```

- [ ] **Step 5: Create README.md**

```markdown
# MD+SQL Viewer

One self-contained HTML file that opens, renders, and edits Markdown and SQL.
No install, no build, no dependencies, no network — clone and double-click.

**[Open `viewer.html` in your browser.](viewer.html)** Drag `.md` or `.sql`
files in, or click *Open file(s)*. That's the whole setup.

## What you get

- **Markdown** — GFM rendering (tables, task lists, fenced code), a live
  "On this page" outline, per-block copy buttons, and real syntax
  highlighting inside ```sql fences.
- **SQL** — offline PostgreSQL-aware highlighting (dollar-quoting, `E''`
  strings, `$1` params), a clickable statement outline with hover-copy,
  and a pinned line-number gutter.
- **Editing** — press `⌘E` for raw source with line numbers. In Chromium
  browsers (Chrome, Edge, Arc, Brave) saving writes back to the original
  file; elsewhere the Save button honestly reads *Download copy*.
- Tabs, drag-and-drop, `⌘F` find, auto dark/light, unknown text files open
  as plain text. Everything lives in one ~150 KB `viewer.html`.

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

builds `macos/MD+SQL Viewer.app`. Then: right-click any `.md` or `.sql` file
→ **Get Info** → **Open with** → MD+SQL Viewer → **Change All…**. Double-clicked
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

Open `samples/sample.md` and `samples/sample.sql` — they exercise everything
above.

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
8. Drop a `.json` or `.log` — opens as plain text.
9. Drop a binary (e.g. a `.png`) — friendly refusal, app still works.
10. `node tests/run-node.mjs` and `viewer.html?test=1` — all green.

## Tweaking

- **Colors:** the `:root` / `@media (prefers-color-scheme: light)` blocks at
  the top of `viewer.html` (token colors are the `--t-*` variables).
- **SQL keywords/types:** the `KEYWORDS` / `TYPES` sets in the sql renderer section.
- **New filetype:** add one renderer object exposing
  `render(source) → { bodyEl, outline, outlineTitle }` and register its
  extensions in `RENDERERS`. The core never needs to change.

## License

MIT. Bundles [marked](https://github.com/markedjs/marked) v18.0.5 (MIT),
vendored inline with its license header intact.
```

- [ ] **Step 6: Create LICENSE and .gitignore**

Run: `cp "/Users/bob/Rob's Coding Projects/MD-SQL Editor/markdown-viewer/LICENSE" LICENSE` — then open it and confirm it is the MIT text; update the copyright year to 2026 if it says an earlier year, keep the existing author name.

Create `.gitignore`:

```
.DS_Store
macos/*.app
```

- [ ] **Step 7: Build and verify the launcher**

```bash
cd "/Users/bob/Rob's Coding Projects/MD-SQL Editor/md-sql-viewer/macos"
bash build.sh
/usr/libexec/PlistBuddy -c "Print :CFBundleDocumentTypes" "MD+SQL Viewer.app/Contents/Info.plist"
```

Expected: build prints `✓ built …/MD+SQL Viewer.app`; PlistBuddy output lists BOTH dicts — Markdown Document with extensions md/markdown/mdown/mkd, and SQL Script with sql.

```bash
cd ..
bash macos/seed-and-open.sh viewer.html samples/sample.sql samples/sample.md
```

Expected: default browser opens with two tabs — `sample.sql` highlighted with a statement outline, `sample.md` rendered as prose with a TOC. (This is the exact code path the .app uses.)

- [ ] **Step 8: Commit**

```bash
cd "/Users/bob/Rob's Coding Projects/MD-SQL Editor/md-sql-viewer"
git add -A
git commit -m "feat: macOS launcher (dual .md/.sql registration), samples, README, LICENSE

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification sweep

**Files:**
- Modify: none expected (fix regressions if found)

- [ ] **Step 1: Full Node suite** — `node tests/run-node.mjs` → `34 passed, 0 failed`, exit 0.

- [ ] **Step 2: Full browser suite** — `bash tests/open-in-browser.sh` → overlay `13 passed, 0 failed`.

- [ ] **Step 3: Repo size + hygiene**

```bash
git clean -nxd                      # nothing unexpected untracked
du -sh --exclude=.git . 2>/dev/null || du -sh .   # well under 1 MB excluding macos/*.app
git ls-files | wc -l                # ~13 files
```

- [ ] **Step 4: Manual smoke checklist** — run the 10-item checklist from README.md § "Smoke checklist" in the default browser. Items 3 (Chrome in-place save) is **[CHROMIUM-MANUAL]**: run it if any Chromium browser is available; otherwise record it as "not verified on this machine — needs a Chromium browser" in the final report. Do not claim it verified.

- [ ] **Step 5: Spec coverage sweep** — re-read `docs/superpowers/specs/2026-07-05-unified-md-sql-viewer-design.md` top to bottom; for each requirement confirm a shipped behavior or record a gap. Fix small gaps; report anything larger.

- [ ] **Step 6: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore: verification sweep fixes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Plan Self-Review Notes

- Spec coverage: architecture/layers (T1–4), repo layout (T1/T2/T8), edit+save incl. conflict guard and honest fallbacks (T5–6), find (T7), launcher deltas incl. `{name,b64}` seed — already present in the ported seed format (T8), error handling: unknown-ext→plaintext (T2), binary (T2), huge (T2), seed-decode toast (T2), save-failure alert keeps edits (T6). Out-of-scope items (auto-reload, persisted tabs, checkbox write-back, editor highlighting) deliberately absent; checkbox stays disabled (T4).
- Known limitation, accepted by spec: in-place save-back cannot be machine-verified on this Chromium-less machine (T9 records it honestly).
- Type consistency: tab/outline/renderer shapes match across tasks (checked against the Global Constraints shapes).
```
