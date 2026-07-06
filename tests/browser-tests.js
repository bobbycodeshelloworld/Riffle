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
