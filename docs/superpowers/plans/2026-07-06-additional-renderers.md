# Additional Renderers (JSON, CSV/TSV, diff) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JSON, CSV/TSV, and diff/patch renderers to viewer.html using the established plug-in contract, plus launcher/doc updates.

**Architecture:** Three new renderer sections after `RENDERERS · markdown`, each `render(source) → { bodyEl, outline, outlineTitle, notice? }`. The optional `notice` field is new — CORE shows it in `#notice` and it rides the render cache. One shared helper (`tokensToLines`) is extracted from the SQL renderer.

**Spec:** `docs/superpowers/specs/2026-07-05-unified-md-sql-viewer-design.md` § "v1.1 — Additional renderers".

## Global Constraints

- Repo root: `/Users/bob/Rob's Coding Projects/MD-SQL Editor/md-sql-viewer`, branch `feature/more-filetypes`. Baseline: Node suite 37 passed, browser suite 23 tests.
- All prior Global Constraints from `docs/superpowers/plans/2026-07-05-unified-md-sql-viewer.md` still bind: classic scripts, top level = functions/constants only, DOM wiring inside `initApp`, no raw control bytes (escapes are literal source characters), `node tests/run-node.mjs` exit 0 before every commit, browser suite verified by the controller via Safari tab title.
- Renderer contract (v1.1): `render(source) → { bodyEl, outline, outlineTitle, notice? }`. Outline entries: `{ label, level?, anchor?, line?, kind?, text? }`.
- New browser tests: append `t()` definitions after the existing ones (queued async runner; sync bodies fine).
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: `tokensToLines` extraction + `notice` contract + JSON renderer

**Files:** Modify `viewer.html`, `tests/run-node.mjs`, `tests/browser-tests.js`.

**Interfaces:**
- Consumes: `stickyAt`, `escapeHTML`, `truncate`, `buildCodeScroll`, `RENDERERS`, `noticeEl`.
- Produces: `tokensToLines(toks) → string[]` (CORE utility; token `t` is the `t-*` class suffix, `ws` renders unwrapped); `tokenizeJSON(s) → [{t, v, line}]` with `t ∈ func|string|number|keyword|punct|ws` (keys are `func`); `jsonOutline(toks)`; `jsonRenderer`; `RENDERERS.json/.geojson`; CORE honors `result.notice`.

- [ ] **Step 1: Failing Node tests** — append before the summary lines:

```js
/* ===== v1.1: json renderer ===== */
t('tokenizeJSON distinguishes keys from string values', () => {
  const toks = T.tokenizeJSON('{"a": "b"}').filter(x => x.t !== 'ws' && x.t !== 'punct');
  eq(toks.map(x => x.t), ['func', 'string']);
});
t('tokenizeJSON numbers and literals', () => {
  const toks = T.tokenizeJSON('[1.5e2, true, null]').filter(x => x.t === 'number' || x.t === 'keyword');
  eq(toks.map(x => x.v), ['1.5e2', 'true', 'null']);
});
t('jsonOutline lists top-level keys with lines', () => {
  const src = '{\n  "alpha": 1,\n  "beta": { "inner": 2 }\n}';
  const entries = T.jsonOutline(T.tokenizeJSON(src));
  eq(entries.map(e => [e.label, e.line]), [['alpha', 2], ['beta', 3]]);
});
t('tokensToLines splits multi-line tokens and escapes', () => {
  const lines = T.tokensToLines([{ t: 'string', v: '"a\nb<c"' }]);
  eq(lines.length, 2);
  ok(lines[1].includes('&lt;c'));
});
```

- [ ] **Step 2: Run** `node tests/run-node.mjs` → 4 new FAILs (37 pass, 4 fail).

- [ ] **Step 3: Implement.**

(a) In the CORE utilities area add `tokensToLines` (extracted verbatim from the loop inside `highlightToLines`):

```js
function tokensToLines(toks) {
  const lines = [''];
  let cur = 0;
  for (const { t, v } of toks) {
    const parts = v.split('\n');
    for (let k = 0; k < parts.length; k++) {
      if (k > 0) { lines.push(''); cur++; }
      const piece = parts[k];
      if (piece === '') continue;
      const esc = escapeHTML(piece);
      lines[cur] += (t === 'ws') ? esc : '<span class="t-' + t + '">' + esc + '</span>';
    }
  }
  return lines;
}
```

Reduce `highlightToLines` in the sql section to: `function highlightToLines(sql) { return tokensToLines(tokenizeSQL(sql)); }` (existing sql Node tests must stay green — they prove the extraction).

(b) New section `/* ═ RENDERERS · json ═ */` after the markdown section:

```js
function tokenizeJSON(s) {
  const RE_JWS = /\s+/y, RE_JNUM = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, RE_JLIT = /true|false|null/y;
  const toks = [];
  const n = s.length;
  let i = 0, line = 1;
  function push(t, v) { toks.push({ t, v, line }); for (let k = 0; k < v.length; k++) if (v.charCodeAt(k) === 10) line++; }
  while (i < n) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === '"') { j++; break; } j++; }
      let k = j;
      while (k < n && (s[k] === ' ' || s[k] === '\t')) k++;
      push(s[k] === ':' ? 'func' : 'string', s.slice(i, j));
      i = j; continue;
    }
    let m = stickyAt(RE_JWS, s, i);
    if (m !== null) { push('ws', m); i += m.length; continue; }
    m = stickyAt(RE_JNUM, s, i);
    if (m !== null) { push('number', m); i += m.length; continue; }
    m = stickyAt(RE_JLIT, s, i);
    if (m !== null) { push('keyword', m); i += m.length; continue; }
    push('punct', c); i++;
  }
  return toks;
}

function jsonOutline(toks) {
  const entries = [];
  let depth = 0;
  for (const tk of toks) {
    if (tk.t === 'punct') {
      if (tk.v === '{' || tk.v === '[') depth++;
      else if (tk.v === '}' || tk.v === ']') depth--;
    } else if (tk.t === 'func' && depth === 1) {
      entries.push({ label: truncate(tk.v.slice(1, -1), 40), line: tk.line, level: 2 });
      if (entries.length >= 500) break;
    }
  }
  return entries;
}

const jsonRenderer = {
  render(source) {
    const toks = tokenizeJSON(source);
    const bodyEl = buildCodeScroll(tokensToLines(toks));
    const outline = jsonOutline(toks);
    let notice = null;
    try { JSON.parse(source); }
    catch (e) { notice = 'Not valid JSON: ' + String(e.message || e).split('\n')[0]; }
    return { bodyEl, outline, outlineTitle: outline.length ? 'Keys (' + outline.length + ')' : null, notice };
  }
};
RENDERERS.json = RENDERERS.geojson = jsonRenderer;

Object.assign(window.__TEST__, { tokensToLines, tokenizeJSON, jsonOutline, jsonRenderer });
```

(c) CORE `renderActive`: after `renderOutlinePane(result.outline, result.outlineTitle, tab);` add:

```js
  if (result.notice) { noticeEl.textContent = result.notice; noticeEl.hidden = false; }
```

(the huge/binary branches set their own notices and their results carry no `notice` field — no interference).

(d) Picker accept attr in the markup: append `,.json,.geojson`.

- [ ] **Step 4: Run** `node tests/run-node.mjs` → 41 passed, 0 failed.

- [ ] **Step 5: Browser test** — append:

```js
  t('json tab renders colored keys, outline, and invalid-json notice', () => {
    const id = A.addTab({ name: 'bad.json', source: '{\n  "alpha": 1,\n  "beta": oops\n}' });
    ok(document.querySelector('.lc .t-func'), 'key colored');
    const links = [...document.querySelectorAll('#outline .o-item a')].map(a => a.textContent);
    ok(links.includes('alpha') && links.includes('beta'), 'outline keys');
    const notice = document.getElementById('notice');
    ok(!notice.hidden && notice.textContent.startsWith('Not valid JSON'), 'invalid notice shown');
    A.closeTab(id);
  });
```

- [ ] **Step 6:** `bash tests/open-in-browser.sh` (controller verifies "TESTS: 24 passed, 0 failed"). Control-byte check → 0.

- [ ] **Step 7: Commit** — `feat: JSON renderer — lexical highlighting, key outline, validity notice`

---

### Task 2: CSV/TSV renderer

**Files:** Modify `viewer.html`, `tests/run-node.mjs`, `tests/browser-tests.js`.

**Interfaces:**
- Consumes: `RENDERERS`, `truncate`, notice contract from Task 1.
- Produces: `parseCSV(source, delim) → string[][]` (pure); `makeCsvRenderer(delim)`; `RENDERERS.csv/.tsv`. New CSS class `.csv-wrap`.

- [ ] **Step 1: Failing Node tests:**

```js
/* ===== v1.1: csv renderer ===== */
t('parseCSV quoted fields and "" escapes', () => {
  eq(T.parseCSV('a,"b ""x"", c",d\n1,2,3', ','), [['a', 'b "x", c', 'd'], ['1', '2', '3']]);
});
t('parseCSV newline inside quotes', () => {
  eq(T.parseCSV('a,"line1\nline2"\nb,c', ','), [['a', 'line1\nline2'], ['b', 'c']]);
});
t('parseCSV tab delimiter and trailing newline', () => {
  eq(T.parseCSV('a\tb\n1\t2\n', '\t'), [['a', 'b'], ['1', '2']]);
});
```

- [ ] **Step 2: Run** → 3 new FAILs (41/3).

- [ ] **Step 3: Implement** — new `/* ═ RENDERERS · csv ═ */` section:

```js
function parseCSV(source, delim) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (inQ) {
      if (c === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    }
    else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const CSV_MAX_ROWS = 2000;
function makeCsvRenderer(delim) {
  return {
    render(source) {
      const rows = parseCSV(source, delim);
      const wrap = document.createElement('div');
      wrap.className = 'prose csv-wrap';
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const tbody = document.createElement('tbody');
      rows.slice(0, CSV_MAX_ROWS + 1).forEach((r, idx) => {
        const tr = document.createElement('tr');
        r.forEach(cell => {
          const el = document.createElement(idx === 0 ? 'th' : 'td');
          el.textContent = cell;
          tr.appendChild(el);
        });
        (idx === 0 ? thead : tbody).appendChild(tr);
      });
      table.append(thead, tbody);
      wrap.appendChild(table);
      const dataRows = Math.max(0, rows.length - 1);
      const notice = dataRows > CSV_MAX_ROWS
        ? 'Showing first ' + CSV_MAX_ROWS.toLocaleString() + ' of ' + dataRows.toLocaleString() + ' data rows.'
        : null;
      return { bodyEl: wrap, outline: [], outlineTitle: null, notice };
    }
  };
}
RENDERERS.csv = makeCsvRenderer(',');
RENDERERS.tsv = makeCsvRenderer('\t');

Object.assign(window.__TEST__, { parseCSV });
```

CSS (append in the new-rules section of the `<style>` block): `.csv-wrap { overflow-x: auto; }`
Picker accept: append `,.csv,.tsv`.

- [ ] **Step 4: Run** → 44 passed, 0 failed.

- [ ] **Step 5: Browser test:**

```js
  t('csv tab renders header and data cells as a table', () => {
    const id = A.addTab({ name: 'd.csv', source: 'name,qty\nwidget,"1,5"' });
    ok(document.querySelector('.csv-wrap thead th'), 'header cell');
    const tds = [...document.querySelectorAll('.csv-wrap tbody td')].map(x => x.textContent);
    eq(tds, ['widget', '1,5']);
    A.closeTab(id);
  });
```

- [ ] **Step 6:** browser suite (controller expects 25). Control bytes → 0.
- [ ] **Step 7: Commit** — `feat: CSV/TSV renderer — table view with quoted-field parsing`

---

### Task 3: diff/patch renderer + theme vars

**Files:** Modify `viewer.html`, `tests/run-node.mjs`, `tests/browser-tests.js`.

**Interfaces:**
- Consumes: `buildCodeScroll`, `escapeHTML`, `truncate`, `RENDERERS`.
- Produces: `classifyDiffLine(l) → 'file'|'hunk'|'meta'|'add'|'del'|'ctx'` (pure); `diffOutline(lines)`; `diffRenderer`; `RENDERERS.diff/.patch`; theme vars `--t-add/--t-del/--t-hunk/--t-filehdr` and classes `.d-add/.d-del/.d-hunk/.d-file/.d-meta`.

- [ ] **Step 1: Failing Node tests:**

```js
/* ===== v1.1: diff renderer ===== */
t('classifyDiffLine covers all line kinds', () => {
  eq(['--- a/x', '+++ b/x', '@@ -1,2 +1,2 @@', 'diff --git a/x b/x', '+new', '-old', ' ctx'].map(T.classifyDiffLine),
     ['file', 'file', 'hunk', 'meta', 'add', 'del', 'ctx']);
});
t('diffOutline lists files as sections and hunks', () => {
  const d = 'diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-a\n+b\n';
  const entries = T.diffOutline(d.split('\n'));
  eq(entries.map(e => [e.kind || 'hunk', e.line]), [['section', 3], ['hunk', 4]]);
});
```

- [ ] **Step 2: Run** → 2 new FAILs (44/2).

- [ ] **Step 3: Implement** — new `/* ═ RENDERERS · diff ═ */` section:

```js
function classifyDiffLine(l) {
  if (l.startsWith('+++ ') || l.startsWith('--- ')) return 'file';
  if (l.startsWith('@@')) return 'hunk';
  if (l.startsWith('diff ') || l.startsWith('Index: ') || l.startsWith('index ')) return 'meta';
  if (l.startsWith('+')) return 'add';
  if (l.startsWith('-')) return 'del';
  return 'ctx';
}

const DIFF_CLASS = { file: 'd-file', hunk: 'd-hunk', meta: 'd-meta', add: 'd-add', del: 'd-del' };

function diffOutline(lines) {
  const entries = [];
  lines.forEach((l, idx) => {
    if (l.startsWith('+++ ')) {
      entries.push({ label: truncate(l.slice(4).replace(/^b\//, ''), 46), line: idx + 1, kind: 'section', level: 1 });
    } else if (l.startsWith('@@')) {
      entries.push({ label: truncate(l, 46), line: idx + 1, level: 2 });
    }
  });
  return entries;
}

const diffRenderer = {
  render(source) {
    const lines = source.split('\n');
    const html = lines.map(l => {
      if (l === '') return '';
      const cls = DIFF_CLASS[classifyDiffLine(l)];
      const esc = escapeHTML(l);
      return cls ? '<span class="' + cls + '">' + esc + '</span>' : esc;
    });
    const outline = diffOutline(lines);
    const fileCount = outline.filter(e => e.kind === 'section').length;
    return { bodyEl: buildCodeScroll(html), outline,
      outlineTitle: fileCount ? 'Files (' + fileCount + ')' : (outline.length ? 'Hunks (' + outline.length + ')' : null) };
  }
};
RENDERERS.diff = RENDERERS.patch = diffRenderer;

Object.assign(window.__TEST__, { classifyDiffLine, diffOutline, diffRenderer });
```

CSS — add to the dark `:root` token-color block: `--t-add: #a6e3a1; --t-del: #f38ba8; --t-hunk: #89b4fa; --t-filehdr: #f9e2af;`
Add to the light-theme block: `--t-add: #40a02b; --t-del: #d20f39; --t-hunk: #1e66f5; --t-filehdr: #df8e1d;`
Add next to the `.t-*` classes:

```css
.d-add  { color: var(--t-add); }
.d-del  { color: var(--t-del); }
.d-hunk { color: var(--t-hunk); font-weight: 600; }
.d-file { color: var(--t-filehdr); font-weight: 600; }
.d-meta { color: var(--t-comment); font-style: italic; }
```

Picker accept: append `,.diff,.patch`.

- [ ] **Step 4: Run** → 46 passed, 0 failed.

- [ ] **Step 5: Browser test:**

```js
  t('diff tab colors changes and outlines files', () => {
    const id = A.addTab({ name: 'x.diff', source: 'diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-old\n+new\n' });
    ok(document.querySelector('.lc .d-add'), 'added line colored');
    ok(document.querySelector('.lc .d-del'), 'deleted line colored');
    ok([...document.querySelectorAll('#outline .o-item a')].some(a => a.textContent === 'f'), 'file in outline');
    A.closeTab(id);
  });
```

- [ ] **Step 6:** browser suite (controller expects 26). Control bytes → 0.
- [ ] **Step 7: Commit** — `feat: diff/patch renderer — change coloring, file/hunk outline`

---

### Task 4: Launcher registration, docs, rebuild, verify

**Files:** Modify `macos/build.sh`, `README.md`, `viewer.html` (drop-hint copy only).

- [ ] **Step 1:** In `macos/build.sh`, after the existing `:CFBundleDocumentTypes:1` block, add three more document types following the same PlistBuddy pattern: index 2 "JSON Document" (extensions json, geojson), index 3 "CSV Document" (csv, tsv), index 4 "Diff Document" (diff, patch) — each with CFBundleTypeRole Viewer and LSHandlerRank Alternate.
- [ ] **Step 2:** viewer.html drop-hint: change `<strong>Drop .md or .sql files anywhere</strong>` to `<strong>Drop .md, .sql, .json, .csv or .diff files anywhere</strong>`.
- [ ] **Step 3:** README: in "What you get", add a bullet: `- **JSON / CSV / diff** — colored JSON with a key outline (and a validity notice), CSV/TSV as real tables, diffs with green/red change lines and a file/hunk outline. Anything else opens as plain text.` Update the "New filetype" tweaking bullet's contract to mention the optional `notice` field.
- [ ] **Step 4:** Rebuild + verify: `bash macos/build.sh` → ✓ line; `/usr/libexec/PlistBuddy -c "Print :CFBundleDocumentTypes" "macos/MD+SQL Viewer.app/Contents/Info.plist"` shows all FIVE type dicts.
- [ ] **Step 5:** Full suites: `node tests/run-node.mjs` → 46 passed; `bash tests/open-in-browser.sh` (controller expects 26). Control bytes → 0 on touched files.
- [ ] **Step 6: Commit** — `feat: register json/csv/diff types in launcher; docs`

## Self-Review Notes

- Spec v1.1 coverage: JSON (T1), CSV (T2), diff (T3), launcher/picker/drop-hint/docs (T1–T4). Notice contract introduced once (T1) and reused (T2).
- Type consistency: token `t` values are class suffixes shared with `tokensToLines`; outline entries follow the established shape; `notice` is additive and optional.
