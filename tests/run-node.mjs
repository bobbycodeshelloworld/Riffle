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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
