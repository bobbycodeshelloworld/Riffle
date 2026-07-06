# Themes & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ⚙ settings panel — 12 selectable themes, appearance override, font size, line wrap, tab width — persisted to localStorage, in ≤ ~15KB.

**Architecture:** Themes as a JS table (`THEMES[id] = { label, dark: {vars}, light: {vars} }`, 29-var schema); `applySettings()` writes inline custom properties on `document.documentElement` (inline beats stylesheet, which stays as no-JS fallback). One settings JSON in localStorage, sanitized on load. Panel built in JS, wired in initApp.

**Spec:** `docs/superpowers/specs/2026-07-05-unified-md-sql-viewer-design.md` § "v1.2 — Themes & settings".

## Global Constraints

- Repo root: `/Users/bob/Rob's Coding Projects/MD-SQL Editor/riffle`, branch `feature/settings-themes`. Baseline: Node 46 passed, browser 26 tests.
- All prior Global Constraints bind (classic scripts; top level = functions/constants; DOM wiring in initApp; no raw control bytes; suites green before every commit; controller verifies browser suite via Safari tab title).
- **VAR_SCHEMA** (canonical order, no `--` prefix):
  `bg, panel, ink, muted, border, accent, accent-ink, code-bg, sel, tab-active-ink, tab-idle-ink, tab-hover-ink, gutter-ink, flash, t-comment, t-string, t-dollar, t-number, t-param, t-keyword, t-type, t-func, t-ident, t-qident, t-punct, t-add, t-del, t-hunk, t-filehdr`
- Settings shape: `{ theme, appearance: 'auto'|'light'|'dark', fontScale: 's'|'m'|'l', wrap: boolean, tabSize: 2|4|8 }`; defaults `{ theme: 'catppuccin', appearance: 'auto', fontScale: 'm', wrap: false, tabSize: 4 }`; storage key `riffle.settings`.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Settings engine + panel UI + Catppuccin & Slate themes

**Files:** Modify `viewer.html`, `tests/run-node.mjs`, `tests/browser-tests.js`.

**Interfaces:**
- Consumes: header markup (brand-row), initApp, `toast`.
- Produces (pure, on `__TEST__`): `VAR_SCHEMA` (array), `THEMES`, `sanitizeSettings(raw) → settings`, `loadSettings(storage?) → settings`, `saveSettings(s, storage?)`. App-level (on `__TEST__.app`): `applySettings`, `openSettingsPanel`, `closeSettingsPanel`, `getSettings` (returns the live settings object). Element ids: `settingsBtn`, `settings-panel`.

- [ ] **Step 1: Failing Node tests** (append before summary lines):

```js
/* ===== v1.2: settings ===== */
t('sanitizeSettings fills defaults and rejects bad values', () => {
  eq(T.sanitizeSettings({}), { theme: 'catppuccin', appearance: 'auto', fontScale: 'm', wrap: false, tabSize: 4 });
  eq(T.sanitizeSettings({ theme: 'nope', appearance: 'purple', fontScale: 9, wrap: 'yes', tabSize: 3 }),
     { theme: 'catppuccin', appearance: 'auto', fontScale: 'm', wrap: true, tabSize: 4 });
  eq(T.sanitizeSettings({ theme: 'slate', appearance: 'dark', fontScale: 'l', wrap: true, tabSize: 8 }),
     { theme: 'slate', appearance: 'dark', fontScale: 'l', wrap: true, tabSize: 8 });
});
t('loadSettings tolerates corrupt or missing storage', () => {
  const bad = { getItem: () => '{not json', setItem: () => {} };
  eq(T.loadSettings(bad).theme, 'catppuccin');
  const none = { getItem: () => null, setItem: () => {} };
  eq(T.loadSettings(none).appearance, 'auto');
  const boom = { getItem: () => { throw new Error('denied'); }, setItem: () => {} };
  eq(T.loadSettings(boom).tabSize, 4);
});
t('settings round-trip through storage', () => {
  const mem = {};
  const st = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  T.saveSettings({ theme: 'slate', appearance: 'light', fontScale: 's', wrap: true, tabSize: 2 }, st);
  eq(T.loadSettings(st), { theme: 'slate', appearance: 'light', fontScale: 's', wrap: true, tabSize: 2 });
});
t('every theme defines the full var schema in both modes', () => {
  const ids = Object.keys(T.THEMES);
  ok(ids.length >= 2, 'at least catppuccin+slate');
  for (const id of ids) {
    const th = T.THEMES[id];
    ok(typeof th.label === 'string' && th.label, id + ' label');
    for (const mode of ['dark', 'light']) {
      const keys = Object.keys(th[mode] || {}).sort();
      eq(keys, [...T.VAR_SCHEMA].sort(), id + '.' + mode + ' schema');
    }
  }
});
```

- [ ] **Step 2:** `node tests/run-node.mjs` → 4 new FAILs (46/4).

- [ ] **Step 3: Implement.**

(a) New `/* ═ CORE · settings & themes ═ */` section (top level, before initApp):

```js
const VAR_SCHEMA = ['bg', 'panel', 'ink', 'muted', 'border', 'accent', 'accent-ink',
  'code-bg', 'sel', 'tab-active-ink', 'tab-idle-ink', 'tab-hover-ink', 'gutter-ink',
  'flash', 't-comment', 't-string', 't-dollar', 't-number', 't-param', 't-keyword',
  't-type', 't-func', 't-ident', 't-qident', 't-punct', 't-add', 't-del', 't-hunk', 't-filehdr'];

const THEMES = {
  catppuccin: {
    label: 'Catppuccin',
    dark: { /* transcribe the CURRENT :root values from the top of this file's
              <style> block, key by VAR_SCHEMA name (strip the -- prefix) */ },
    light: { /* transcribe the CURRENT @media light block values */ },
  },
  slate: {
    label: 'Slate',
    dark: {
      'bg': '#0f1115', 'panel': '#161a21', 'ink': '#e6e8eb', 'muted': '#8b93a1',
      'border': '#252a33', 'accent': '#7dd3fc', 'accent-ink': '#0f1115',
      'code-bg': '#0b0d11', 'sel': 'rgba(125,211,252,0.25)',
      'tab-active-ink': '#e6e8eb', 'tab-idle-ink': '#8b93a1', 'tab-hover-ink': '#c7cbd3',
      'gutter-ink': '#4b5563', 'flash': 'rgba(125,211,252,0.14)',
      't-comment': '#6b7280', 't-string': '#86efac', 't-dollar': '#86efac',
      't-number': '#fdba74', 't-param': '#f0abfc', 't-keyword': '#7dd3fc',
      't-type': '#fcd34d', 't-func': '#a5b4fc', 't-ident': '#e6e8eb',
      't-qident': '#5eead4', 't-punct': '#9ca3af',
      't-add': '#86efac', 't-del': '#fda4af', 't-hunk': '#a5b4fc', 't-filehdr': '#fcd34d',
    },
    light: {
      'bg': '#fafaf7', 'panel': '#ffffff', 'ink': '#1a1d22', 'muted': '#5b6370',
      'border': '#e4e6eb', 'accent': '#0369a1', 'accent-ink': '#ffffff',
      'code-bg': '#f3f4f6', 'sel': 'rgba(3,105,161,0.18)',
      'tab-active-ink': '#0369a1', 'tab-idle-ink': '#5b6370', 'tab-hover-ink': '#1a1d22',
      'gutter-ink': '#9ca3af', 'flash': 'rgba(3,105,161,0.10)',
      't-comment': '#6b7280', 't-string': '#15803d', 't-dollar': '#15803d',
      't-number': '#c2410c', 't-param': '#a21caf', 't-keyword': '#0369a1',
      't-type': '#a16207', 't-func': '#4338ca', 't-ident': '#1a1d22',
      't-qident': '#0f766e', 't-punct': '#5b6370',
      't-add': '#15803d', 't-del': '#be123c', 't-hunk': '#4338ca', 't-filehdr': '#a16207',
    },
  },
};

const SETTING_DEFAULTS = { theme: 'catppuccin', appearance: 'auto', fontScale: 'm', wrap: false, tabSize: 4 };
const SETTINGS_KEY = 'riffle.settings';

function sanitizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    theme: Object.prototype.hasOwnProperty.call(THEMES, r.theme) ? r.theme : SETTING_DEFAULTS.theme,
    appearance: ['auto', 'light', 'dark'].includes(r.appearance) ? r.appearance : SETTING_DEFAULTS.appearance,
    fontScale: ['s', 'm', 'l'].includes(r.fontScale) ? r.fontScale : SETTING_DEFAULTS.fontScale,
    wrap: Boolean(r.wrap),
    tabSize: [2, 4, 8].includes(r.tabSize) ? r.tabSize : SETTING_DEFAULTS.tabSize,
  };
}

function loadSettings(storage) {
  try {
    const st = storage || window.localStorage;
    const raw = st.getItem(SETTINGS_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : { ...SETTING_DEFAULTS };
  } catch (e) { return { ...SETTING_DEFAULTS }; }
}

function saveSettings(s, storage) {
  try { (storage || window.localStorage).setItem(SETTINGS_KEY, JSON.stringify(s)); }
  catch (e) { /* storage unavailable (e.g. some file:// contexts) — session-only */ }
}

Object.assign(window.__TEST__, { VAR_SCHEMA, THEMES, sanitizeSettings, loadSettings, saveSettings });
```

For `catppuccin.dark`/`light`: transcribe the hex/rgba values that already exist in the `<style>` `:root` and light blocks — they are the source of truth; do not invent values. (The stylesheet blocks stay in place untouched as the no-JS fallback.)

(b) Runtime application (same section):

```js
let settings = { ...SETTING_DEFAULTS };
const FONT_SCALES = { s: '0.88', m: '1', l: '1.15' };
let darkMedia = null; // assigned in initApp

function currentMode() {
  if (settings.appearance !== 'auto') return settings.appearance;
  return darkMedia && !darkMedia.matches ? 'light' : 'dark';
}

function applySettings() {
  const theme = THEMES[settings.theme] || THEMES.catppuccin;
  const vars = theme[currentMode()];
  const root = document.documentElement;
  for (const k of VAR_SCHEMA) root.style.setProperty('--' + k, vars[k]);
  root.style.setProperty('--font-scale', FONT_SCALES[settings.fontScale]);
  root.style.setProperty('--tab-size-setting', String(settings.tabSize));
  document.body.classList.toggle('wrap', settings.wrap);
  refreshSettingsPanel();
}
```

(c) Panel construction `buildSettingsPanel()` + `openSettingsPanel/closeSettingsPanel/refreshSettingsPanel` (top level; all `document` use is call-time only). Panel structure (create with createElement/textContent):

- `#settings-panel` (hidden by default), sections in order:
  - "Theme" — one `button.theme-row` per THEMES entry: five `span.swatch` dots colored inline from `theme[currentMode()]` (`bg`, `accent`, `t-string`, `t-keyword`, `t-del`) + label; click → `settings.theme = id; persistAndApply();`. Active row gets `.active`.
  - "Appearance" — segmented buttons Auto/Light/Dark (`.seg-btn`, active per settings).
  - "Font size" — S/M/L segmented.
  - "Line wrap" — On/Off segmented.
  - "Tab width" — 2/4/8 segmented.
- `function persistAndApply() { saveSettings(settings); applySettings(); }`
- `refreshSettingsPanel()` re-marks `.active` states and re-colors swatches for the current mode; no-op if panel not built yet.
- Open/close: gear click toggles; Escape (reuse the pattern of the find bar — its own keydown or the panel's) and clicking outside (a document-level `mousedown` listener that closes when the click is outside `#settings-panel` and `#settingsBtn`) close it.

(d) Markup: add to `.brand-row` right before the `openBtn` button: `<button class="ghost-btn" id="settingsBtn" title="Settings">⚙</button>`. Add `<div id="settings-panel" hidden></div>` immediately after `</header>`'s findbar (inside header, after `#findbar`).

(e) CSS (append to the new-rules area):

```css
/* ============ SETTINGS PANEL ============ */
#settings-panel { position: absolute; right: 16px; top: 52px; z-index: 40;
  width: 300px; max-height: 70vh; overflow-y: auto; background: var(--panel);
  border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.35); }
#settings-panel h4 { margin: 12px 0 6px; font-size: 10.5px; text-transform: uppercase;
  letter-spacing: 1px; color: var(--muted); }
#settings-panel h4:first-child { margin-top: 0; }
.theme-row { display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; margin: 1px 0; border: 1px solid transparent; border-radius: 6px;
  background: transparent; color: var(--ink); font: 12.5px -apple-system, sans-serif;
  cursor: pointer; text-align: left; }
.theme-row:hover { border-color: var(--border); }
.theme-row.active { border-color: var(--accent); }
.swatch { width: 11px; height: 11px; border-radius: 50%; flex: 0 0 auto;
  border: 1px solid rgba(127,127,127,0.35); }
.seg-row { display: flex; gap: 4px; }
.seg-btn { flex: 1; padding: 5px 0; font-size: 11.5px; border: 1px solid var(--border);
  background: transparent; color: var(--muted); border-radius: 6px; cursor: pointer; }
.seg-btn.active { border-color: var(--accent); color: var(--accent); font-weight: 600; }

/* ============ SETTINGS CONSUMERS ============ */
.code-scroll, .editor-gutter, .editor-ta { font-size: calc(12.8px * var(--font-scale, 1)); }
.prose { font-size: calc(15.5px * var(--font-scale, 1)); }
.lc, .editor-ta { tab-size: var(--tab-size-setting, 4); }
body.wrap .row { min-width: 0; }
body.wrap .lc { white-space: pre-wrap; }
```

(The consumer rules appear AFTER the originals in the stylesheet, so they win; the editor-ta already sets `tab-size: 4` — the new rule overrides it.)

(f) In `initApp` (early, right after element lookups): assign `darkMedia = window.matchMedia('(prefers-color-scheme: dark)');`, `darkMedia.addEventListener('change', () => { if (settings.appearance === 'auto') applySettings(); });`, `settings = loadSettings();`, `buildSettingsPanel();`, `applySettings();`, wire `settingsBtn` click + outside-close + Escape. Export: `Object.assign(window.__TEST__.app, { applySettings, openSettingsPanel, closeSettingsPanel, getSettings: () => settings });`

- [ ] **Step 4:** `node tests/run-node.mjs` → 50 passed, 0 failed.

- [ ] **Step 5: Browser tests** (append):

```js
  t('settings panel opens and applies a theme live', () => {
    A.openSettingsPanel();
    const panel = document.getElementById('settings-panel');
    ok(!panel.hidden, 'panel visible');
    const slateRow = [...panel.querySelectorAll('.theme-row')].find(b => b.textContent.includes('Slate'));
    ok(slateRow, 'slate row present');
    slateRow.click();
    eq(A.getSettings().theme, 'slate');
    const mode = document.documentElement.style.getPropertyValue('--accent').trim();
    ok(mode === T.THEMES.slate.dark.accent || mode === T.THEMES.slate.light.accent, 'accent var applied');
    A.closeSettingsPanel();
    ok(panel.hidden, 'panel closed');
  });

  t('forced appearance switches modes; wrap and tab width apply', () => {
    const before = document.documentElement.style.getPropertyValue('--bg').trim();
    const s = A.getSettings();
    s.appearance = 'light'; A.applySettings();
    const lightBg = document.documentElement.style.getPropertyValue('--bg').trim();
    eq(lightBg, T.THEMES[s.theme].light.bg);
    s.appearance = 'dark'; A.applySettings();
    eq(document.documentElement.style.getPropertyValue('--bg').trim(), T.THEMES[s.theme].dark.bg);
    s.wrap = true; s.tabSize = 8; A.applySettings();
    ok(document.body.classList.contains('wrap'), 'wrap class set');
    eq(document.documentElement.style.getPropertyValue('--tab-size-setting').trim(), '8');
    // restore defaults for subsequent tests
    s.appearance = 'auto'; s.wrap = false; s.tabSize = 4; s.theme = 'catppuccin'; A.applySettings();
    ok(before.length >= 0);
  });
```

- [ ] **Step 6:** `bash tests/open-in-browser.sh` (controller expects "TESTS: 28 passed, 0 failed"). Control bytes → 0.

- [ ] **Step 7: Commit** — `feat: settings engine + panel — themes, appearance, font size, wrap, tab width`

---

### Task 2: Theme library (10 more palettes)

**Files:** Modify `viewer.html` (THEMES table only), `tests/run-node.mjs`.

**Interfaces:** Consumes VAR_SCHEMA + the two existing themes as structural examples. Produces THEMES entries: `nord, solarized, gruvbox, everforest, rosepine, tokyonight, one, github, kanagawa, dracula`.

**Palette mapping rules (binding):** use each palette's CANONICAL published hex values (these are all open, published color schemes; use their official base/accent sets — e.g. Nord's nord0–nord15, Solarized's base03–base3 + accents, Gruvbox dark/light hard-neutral sets, Rosé Pine main + Dawn, Tokyo Night night/day, Atom One dark/light, GitHub Primer dark/light, Kanagawa wave/lotus, Everforest dark/light medium, Dracula + a light complement derived per these rules since Dracula has no official light). Map roles:
- `bg` = editor/base background · `panel` = elevated surface (slightly offset from bg) · `code-bg` = darkest/most-recessed surface
- `ink` = main foreground · `muted` = secondary foreground · `border` = surface border
- `accent` = the palette's signature accent · `accent-ink` = readable text ON accent (usually bg or near-white)
- `sel` = accent at ~20–25% alpha (rgba) · `flash` = accent at ~12–16% alpha · `gutter-ink` = faint foreground
- tab inks: `tab-active-ink` = ink or accent, `tab-idle-ink` = muted, `tab-hover-ink` = between
- tokens: `t-comment` = palette comment gray · `t-string`/`t-dollar` = green · `t-number` = orange · `t-param` = pink/magenta · `t-keyword` = purple/blue (accent family) · `t-type` = yellow · `t-func` = blue · `t-ident` = ink · `t-qident` = teal/cyan · `t-punct` = muted
- diff: `t-add` = green, `t-del` = red, `t-hunk` = blue, `t-filehdr` = yellow — all from the same palette
Every value a real CSS color (hex or rgba). Calm variants preferred where a palette offers intensity choices (e.g. Gruvbox "medium" contrast).

- [ ] **Step 1: Failing Node test** (append):

```js
t('theme library has 12 themes with distinct dark backgrounds', () => {
  const ids = Object.keys(T.THEMES);
  eq(ids.length, 12);
  for (const id of ['nord', 'solarized', 'gruvbox', 'everforest', 'rosepine', 'tokyonight', 'one', 'github', 'kanagawa', 'dracula']) ok(ids.includes(id), id + ' present');
  const bgs = new Set(ids.map(id => T.THEMES[id].dark.bg));
  eq(bgs.size, 12);
});
```

- [ ] **Step 2:** Run → 1 new FAIL. (The existing schema-completeness test automatically extends to all 12 — it iterates THEMES.)
- [ ] **Step 3:** Add the 10 entries to THEMES following the mapping rules. Every theme's `label`: Nord, Solarized, Gruvbox, Everforest, Rosé Pine, Tokyo Night, One, GitHub, Kanagawa, Dracula.
- [ ] **Step 4:** `node tests/run-node.mjs` → 51 passed, 0 failed (schema test now validates 12×2 modes).
- [ ] **Step 5:** `bash tests/open-in-browser.sh` (controller expects 28 still — no new browser tests). Visual spot-check: open the panel, click through several themes on a SQL tab. Control bytes → 0.
- [ ] **Step 6: Commit** — `feat: theme library — Nord, Solarized, Gruvbox, Everforest, Rosé Pine, Tokyo Night, One, GitHub, Kanagawa, Dracula`

---

### Task 3: Docs, rebuild, verification sweep

**Files:** Modify `README.md`; rebuild `macos/Riffle.app`.

- [ ] **Step 1:** README: add to "What you get": `- **Themes & settings** — ⚙ in the header: 12 built-in themes (Catppuccin, Nord, Solarized, Gruvbox, Rosé Pine, Tokyo Night, Dracula, GitHub, …), light/dark/auto, font size, line wrap, tab width. Settings persist locally; nothing leaves your machine.` Update the "Colors" tweaking bullet: themes now live in the `THEMES` table in viewer.html (the `:root` block is the no-JS fallback). Add smoke-checklist item 11: `⚙ → switch theme — colors change live; reload — choice persisted.`
- [ ] **Step 2:** `bash macos/build.sh` → ✓ (bundles the new viewer.html).
- [ ] **Step 3:** Full suites: Node 51, browser 28 (controller-verified). File size check: `wc -c viewer.html` ≤ ~130KB expected; report the number.
- [ ] **Step 4:** Spec-coverage check of the v1.2 section: every bullet shipped (5 settings, 12 themes, persistence tolerance, live matchMedia, size budget). Report the matrix in the task report.
- [ ] **Step 5: Commit** — `docs: settings/themes README + smoke item; rebuild app`
