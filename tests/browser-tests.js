// DOM test suite. Loaded by viewer.html?test=1 (never in normal use).
// Drives the live app through window.__TEST__ / window.__TEST__.app and
// renders a green/red overlay with #test-summary[data-fail] for grepping.
(function () {
  const T = window.__TEST__, A = T && T.app;
  const results = [];
  const tests = [];
  function t(name, fn) { tests.push([name, fn]); }
  function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }
  function eq(a, b) { const ja = JSON.stringify(a), jb = JSON.stringify(b); if (ja !== jb) throw new Error('expected ' + jb + ', got ' + ja); }
  const realConfirm = window.confirm;

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

  t('tab × close button honors dirty guard', () => {
    const id = A.addTab({ name: 'g.sql', source: 'SELECT 1;' });
    A.toggleEdit();
    const ta = document.querySelector('.editor-ta');
    ta.value = 'SELECT 9;';
    ta.dispatchEvent(new Event('input'));
    let asked = false;
    const prev = window.confirm;
    window.confirm = () => { asked = true; return true; };
    document.querySelector('#tabs .tab.active .tab-close').click();
    window.confirm = prev;
    ok(asked, 'confirm was called for dirty mouse-close');
    ok(!A.state.tabs.some(t2 => t2.id === id), 'tab closed after confirm true');
  });

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

  t('binary tabs cannot enter edit mode', () => {
    const id = A.addTab({ name: 'blob.bin', source: 'ab\u0000cd' });
    ok(document.getElementById('editToggle').hidden, 'Edit button hidden');
    A.toggleEdit();
    ok(!document.querySelector('.editor-ta'), 'toggleEdit no-ops');
    A.closeTab(id);
  });

  t('save with stubbed handle writes and clears dirty', async () => {
    let written = null;
    const fake = { name: 'h.sql', kind: 'file',
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async getFile() { return { lastModified: 111 }; },
      async createWritable() { return { async write(v) { written = v; }, async close() {} }; } };
    const id = A.addTab({ name: 'h.sql', source: 'SELECT 1;', handle: fake, lastModified: 111 });
    A.toggleEdit();
    const ta = document.querySelector('.editor-ta');
    ta.value = 'SELECT 2;';
    ta.dispatchEvent(new Event('input'));
    await A.saveActiveTab();
    eq(written, 'SELECT 2;');
    ok(!T.isDirty(A.state.tabs.find(t2 => t2.id === id)), 'tab clean after save');
    A.toggleEdit(); A.closeTab(id);
  });

  t('double save is guarded: one write for overlapping calls', async () => {
    let writes = 0; let release;
    const gate = new Promise(r => { release = r; });
    const fake = { name: 'r.sql', kind: 'file',
      async queryPermission() { return 'granted'; },
      async getFile() { return { lastModified: 5 }; },
      async createWritable() { await gate; writes++; return { async write() {}, async close() {} }; } };
    const id = A.addTab({ name: 'r.sql', source: 'a', handle: fake, lastModified: 5 });
    A.toggleEdit();
    const ta = document.querySelector('.editor-ta');
    ta.value = 'b'; ta.dispatchEvent(new Event('input'));
    const p1 = A.saveActiveTab();
    const p2 = A.saveActiveTab();
    release();
    await p1; await p2;
    eq(writes, 1);
    A.toggleEdit(); A.closeTab(id);
  });

  t('save-as re-renders with new extension renderer', async () => {
    const fake = { name: 'x.sql', kind: 'file',
      async queryPermission() { return 'granted'; },
      async getFile() { return { lastModified: 7 }; },
      async createWritable() { return { async write() {}, async close() {} }; } };
    const prevPicker = window.showSaveFilePicker;
    window.showSaveFilePicker = async () => fake;
    let id;
    try {
      id = A.addTab({ name: 'x.md', source: 'SELECT 1;' });
      A.toggleEdit();
      await A.saveActiveTab();
      eq(A.activeTab().ext, 'sql');
      A.toggleEdit();
      ok(document.querySelector('.lc .t-keyword'), 'sql renderer used after ext change');
      A.closeTab(id);
    } finally {
      window.showSaveFilePicker = prevPicker;
    }
  });

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

  t('find recomputes on tab switch', () => {
    const a = A.addTab({ name: 'fa.sql', source: 'SELECT a;\nSELECT b;' });
    const b = A.addTab({ name: 'fb.sql', source: 'nothing here\nSELECT one;' });
    A.openFindBar();
    document.getElementById('find-input').value = 'select';
    A.runFind();
    eq(document.getElementById('find-count').textContent, '1/1'); // active tab is b
    A.setActive(a);
    eq(document.getElementById('find-count').textContent, '1/2'); // recomputed for a
    A.closeFindBar();
    A.closeTab(a); A.closeTab(b);
  });

  t('closing a background tab leaves the active editor intact', () => {
    const a = A.addTab({ name: 'bg1.sql', source: 'SELECT 1;' });
    const b = A.addTab({ name: 'bg2.sql', source: 'SELECT 2;' });
    A.toggleEdit();
    const ta = document.querySelector('.editor-ta');
    A.closeTab(a); // background tab
    ok(document.querySelector('.editor-ta') === ta, 'editor not rebuilt');
    A.toggleEdit(); A.closeTab(b);
  });

  t('dirty edit survives switch-away and back', () => {
    const a = A.addTab({ name: 'sw1.sql', source: 'SELECT 1;' });
    const b = A.addTab({ name: 'sw2.sql', source: 'SELECT 2;' });
    A.setActive(a);
    A.toggleEdit();
    const ta = document.querySelector('.editor-ta');
    ta.value = 'SELECT 111;';
    ta.dispatchEvent(new Event('input'));
    A.setActive(b);
    A.setActive(a);
    eq(document.querySelector('.editor-ta').value, 'SELECT 111;');
    ok(document.querySelector('#tabs .tab.active').classList.contains('dirty'), 'dirty dot persists');
    A.toggleEdit(); A.closeTab(a); A.closeTab(b);
  });

  t('typing in editor with find open does not steal focus or caret', () => {
    const id = A.addTab({ name: 'fs.sql', source: 'SELECT a;\nSELECT b;' });
    A.toggleEdit();
    A.openFindBar();
    document.getElementById('find-input').value = 'select';
    A.runFind();
    const ta = document.querySelector('.editor-ta');
    ta.focus();
    ta.value = 'SELECT a;\nSELECT bb;';
    ta.setSelectionRange(3, 3);
    ta.dispatchEvent(new Event('input'));
    ok(document.activeElement === ta, 'focus stays in textarea');
    eq(ta.selectionStart, 3);
    ok(document.getElementById('find-count').textContent.endsWith('/2'), 'count recomputed');
    A.closeFindBar(); A.toggleEdit(); A.closeTab(id);
  });

  t('json tab renders colored keys, outline, and invalid-json notice', () => {
    const id = A.addTab({ name: 'bad.json', source: '{\n  "alpha": 1,\n  "beta": oops\n}' });
    ok(document.querySelector('.lc .t-func'), 'key colored');
    const links = [...document.querySelectorAll('#outline .o-item a')].map(a => a.textContent);
    ok(links.includes('alpha') && links.includes('beta'), 'outline keys');
    const notice = document.getElementById('notice');
    ok(!notice.hidden && notice.textContent.startsWith('Not valid JSON'), 'invalid notice shown');
    A.closeTab(id);
  });

  t('csv tab renders header and data cells as a table', () => {
    const id = A.addTab({ name: 'd.csv', source: 'name,qty\nwidget,"1,5"' });
    ok(document.querySelector('.csv-wrap thead th'), 'header cell');
    const tds = [...document.querySelectorAll('.csv-wrap tbody td')].map(x => x.textContent);
    eq(tds, ['widget', '1,5']);
    A.closeTab(id);
  });

  t('diff tab colors changes and outlines files', () => {
    const id = A.addTab({ name: 'x.diff', source: 'diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-old\n+new\n' });
    ok(document.querySelector('.lc .d-add'), 'added line colored');
    ok(document.querySelector('.lc .d-del'), 'deleted line colored');
    ok([...document.querySelectorAll('#outline .o-item a')].some(a => a.textContent === 'f'), 'file in outline');
    A.closeTab(id);
  });

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

  (async () => {
    window.confirm = () => true; // never block the suite on dialogs
    for (const [name, fn] of tests) {
      try { await fn(); results.push({ name, err: null }); }
      catch (e) { results.push({ name, err: e }); }
      while (A.state.tabs.length) A.closeTab(A.state.tabs[0].id);
    }
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
})();
