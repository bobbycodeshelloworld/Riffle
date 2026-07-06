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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
