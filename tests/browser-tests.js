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

  t('sql tab renders token spans and outline', () => {
    const id = A.addTab({ name: 'demo.sql', source: '-- ====\n-- Core\n-- ====\nCREATE TABLE users (id int);\nSELECT 1;' });
    ok(document.querySelector('.lc .t-keyword'), 'keyword tokens colored');
    const links = [...document.querySelectorAll('#outline .o-item a')].map(a => a.textContent);
    ok(links.some(l => l.includes('CREATE TABLE users')), 'outline lists statement, got: ' + links.join('|'));
    ok(document.querySelector('#outline .o-item.section'), 'banner section present');
    ok(document.querySelector('#outline .o-copy'), 'statement copy chip present');
    A.closeTab(id);
  });

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

  t('md renderer scrubs active HTML (XSS)', () => {
    const id = A.addTab({ name: 'evil.md', source: '# t\n\n<img src=x onerror="window.__pwned=1">\n\n<a href="javascript:alert(1)">c</a>\n\n<details open ontoggle="window.__pwned=2">d</details>' });
    ok(!window.__pwned, 'no handler executed');
    const host = document.getElementById('content-host');
    ok(!host.querySelector('[onerror],[ontoggle],[onclick]'), 'no on* attributes survive');
    const a = [...host.querySelectorAll('a')].find(x => x.textContent === 'c');
    ok(a && !a.hasAttribute('href'), 'javascript: href removed');
    A.closeTab(id);
  });

  window.confirm = realConfirm;

  const failCount = results.filter(r => r.err).length;
  // Publish results in the tab title so AppleScript (read-only tab name) can
  // verify the suite on machines with no scriptable/headless browser.
  document.title = 'TESTS: ' + (results.length - failCount) + ' passed, ' + failCount + ' failed';
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
