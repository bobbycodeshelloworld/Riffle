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

/* ===== Security: URL predicates ===== */
t('isSafeUrl href: https/mailto/# ok, javascript blocked', () => {
  ok(T.isSafeUrl('https://example.com', 'href'));
  ok(T.isSafeUrl('mailto:a@b.c', 'href'));
  ok(T.isSafeUrl('#section', 'href'));
  ok(!T.isSafeUrl('javascript:alert(1)', 'href'));
  ok(!T.isSafeUrl(' javascript:alert(1)', 'href'));
  ok(!T.isSafeUrl('data:text/html,<script>x</script>', 'href'));
});
t('isSafeUrl src: https/data-image ok, others blocked', () => {
  ok(T.isSafeUrl('https://example.com/x.png', 'src'));
  ok(T.isSafeUrl('data:image/png;base64,AAAA', 'src'));
  ok(!T.isSafeUrl('data:text/html,x', 'src'));
  ok(!T.isSafeUrl('javascript:alert(1)', 'src'));
});

/* ===== Task 5: edit mode ===== */
t('isDirty compares source to savedSource', () => {
  ok(!T.isDirty({ source: 'a', savedSource: 'a' }));
  ok(T.isDirty({ source: 'b', savedSource: 'a' }));
});

/* ===== Task 6: save pipeline ===== */
t('saveActionFor: handle → save', () => { eq(T.saveActionFor({ handle: {} }, { canPick: true }), 'save'); });
t('saveActionFor: no handle + picker → saveAs', () => { eq(T.saveActionFor({ handle: null }, { canPick: true }), 'saveAs'); });
t('saveActionFor: no capability → download', () => { eq(T.saveActionFor({ handle: null }, { canPick: false }), 'download'); });

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

t('preprocessMarkdown leaves ~~~ fences untouched', () => {
  const md = '~~~\nRecord<string, unknown>\n~~~';
  eq(T.preprocessMarkdown(md), md);
});

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
t('theme library has 12 themes with distinct dark backgrounds', () => {
  const ids = Object.keys(T.THEMES);
  eq(ids.length, 12);
  for (const id of ['nord', 'solarized', 'gruvbox', 'everforest', 'rosepine', 'tokyonight', 'one', 'github', 'kanagawa', 'dracula']) ok(ids.includes(id), id + ' present');
  const bgs = new Set(ids.map(id => T.THEMES[id].dark.bg));
  eq(bgs.size, 12);
});
t('all themes meet contrast and chrome floors', () => {
  const lum = h => {
    const c = h.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const ids = Object.keys(T.THEMES);
  const TOKENS = T.VAR_SCHEMA.filter(k => k.startsWith('t-'));
  for (const id of ids) {
    const th = T.THEMES[id];
    // every schema value must be a hex color or an rgba() — no silent third format
    for (const mode of ['dark', 'light']) {
      for (const k of T.VAR_SCHEMA) {
        const v = th[mode][k];
        ok(v.startsWith('#') || v.startsWith('rgba('), id + '.' + mode + '.' + k + ' is neither #hex nor rgba(): ' + v);
      }
    }
    // token contrast floors: light >= 4.5 vs code-bg, dark >= 2.5 vs code-bg
    for (const [mode, floor] of [['light', 4.5], ['dark', 2.5]]) {
      const m = th[mode];
      for (const tk of TOKENS) {
        if (!m[tk].startsWith('#')) continue;
        ok(ratio(m[tk], m['code-bg']) >= floor,
           id + '.' + mode + '.' + tk + ' contrast ' + ratio(m[tk], m['code-bg']).toFixed(2) + ' < ' + floor);
      }
    }
    // chrome-ink vs chrome-bg >= 4.5 in both modes; chrome-muted and tab inks >= 3 vs chrome-bg
    for (const mode of ['dark', 'light']) {
      const m = th[mode];
      ok(ratio(m['chrome-ink'], m['chrome-bg']) >= 4.5,
         id + '.' + mode + ' chrome-ink/chrome-bg contrast ' + ratio(m['chrome-ink'], m['chrome-bg']).toFixed(2) + ' < 4.5');
      for (const k of ['chrome-muted', 'tab-active-ink', 'tab-idle-ink', 'tab-hover-ink']) {
        ok(ratio(m[k], m['chrome-bg']) >= 3,
           id + '.' + mode + ' ' + k + '/chrome-bg contrast ' + ratio(m[k], m['chrome-bg']).toFixed(2) + ' < 3');
      }
    }
    // light bg must not be near-pure-white; light chrome-bg must be genuinely dark
    ok(lum(th.light.bg) <= 0.93, id + '.light.bg luminance ' + lum(th.light.bg).toFixed(3) + ' > 0.93');
    ok(lum(th.light['chrome-bg']) <= 0.15, id + '.light.chrome-bg luminance ' + lum(th.light['chrome-bg']).toFixed(3) + ' > 0.15');
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
