// v0.28.3 大会準備・今後の大会 →「📝 エントリー下書き」（records.html#entry=大会）／PDFの文字は上から下の順／URLから読んだ要項は「元のPDFを開く」（架空データ）
//   node v0283_prep_links.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import vm from 'node:vm';
import {fileURLToPath} from 'node:url'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.28.3] エントリー下書きへのボタン・文字の順・元のPDF');
await check('PDFの文字：ページ順 → 上から下 → 左から右。少しずれた高さは同じ行（pdf.js が下から返しても）', () => {
  const a = fs.readFileSync(path.join(ROOT, 'source/src/app.js'), 'utf8'), src = a.slice(a.indexOf('  function pagesText('), a.indexOf('  function ntTimes('));
  const pagesText = vm.runInNewContext('(function(){' + src + ';return pagesText;})()');
  const pg1 = { items: [{ str: '10月23日（金）17:00', x: 120, y: 300.8, h: 10 }, { str: 'エントリー期間', x: 20, y: 300, h: 10 }, { str: '5 申込方法', x: 20, y: 200, h: 10 }, { str: '要項（架空）', x: 60, y: 40, h: 14 }, { str: '', x: 0, y: 0 }] }, pg2 = { items: [{ str: '2ページ目', x: 20, y: 30, h: 10 }] };
  assert.equal(pagesText([pg1, pg2]), '要項（架空）\n5 申込方法\nエントリー期間 10月23日（金）17:00\n2ページ目');
});
const A = '2026-11-03|架空 秋季3支部大会', U = '2026-11-15|架空 URLの大会', SRC = 'https://example.org/kakuu/yoko.pdf';
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
try {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); const errs = [];
  await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort()); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument(() => { const T = Date.parse('2026-10-20T03:00:00Z'); Date.now = () => T; if (!sessionStorage.getItem('__i')) { localStorage.clear(); sessionStorage.setItem('__i', '1'); } localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); });
  await p.goto(B + 'records.html', { waitUntil: 'load' }); await sl(1000);
  await p.evaluate(() => { const d = document.querySelector('#rpPaste'); d.closest('details') && (d.closest('details').open = true); d.value = '大会名,日付,会場,区分,締切\n架空 秋季3支部大会,2026/11/3,架空競技場,高,\n架空 URLの大会,2026/11/15,,高,\n'; document.getElementById('rpRead').click(); }); await sl(400);
  await p.evaluate(() => document.getElementById('rpSave').click()); await sl(1200);
  // A：元のPDFあり（v0.28.2 から）。U：v0.28.2 より前に URL から読んだ形（URL と文字だけ・PDFの控えなし）
  await p.evaluate(async (A, U, SRC) => {
    const idx = { '|': {} }; [A, U].forEach(k => { idx['|'][k] = { kinds: { yoko: 1 }, end: k.slice(0, 10), at: 1 }; }); localStorage.setItem('lanenote.prep.idx.v1', JSON.stringify(idx));
    const pdf = new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' });
    const recs = [{ id: '||' + A, owner: '|', key: A, end: A.slice(0, 10), docs: { yoko: { name: 'kakuu_yoko.pdf', url: SRC + '?a' } }, snap: { st: { docText: { yoko: '架空 要項' } } } },
      { id: '||' + A + '|file|yoko', owner: '|', key: A, end: A.slice(0, 10), file: 1, kind: 'yoko', name: 'kakuu_yoko.pdf', type: 'application/pdf', blob: pdf },
      { id: '||' + U, owner: '|', key: U, end: U.slice(0, 10), docs: { yoko: { name: 'yoko.pdf', url: SRC }, sl: { name: 'x.pdf', url: 'javascript:alert(1)' } }, snap: { st: { docText: { yoko: '架空 URLの要項の文字\n申込締切 10月30日' } } } }];
    await new Promise((ok, ng) => { const q = indexedDB.open('lanenote-prep', 1); q.onupgradeneeded = () => q.result.createObjectStore('snap', { keyPath: 'id' }); q.onsuccess = () => { const db = q.result, tx = db.transaction('snap', 'readwrite'); recs.forEach(r => tx.objectStore('snap').put(r)); tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => ng(tx.error); }; q.onerror = () => ng(q.error); });
  }, A, U, SRC);
  await p.goto(B + 'schedule.html', { waitUntil: 'load' }); await sl(1800);
  const li = n => `[...document.querySelectorAll('#lpHome .lp-list > li')].find(l => l.textContent.includes(${JSON.stringify(n)}))`;
  await check('今後の大会のカード：「📝 エントリー下書き」→ records.html#entry=<この大会>（指のカーソル）', async () => {
    const r = await p.evaluate(s => { const e = eval(s).querySelector('[data-lpentry]'); return [e.textContent, e.getAttribute('href'), getComputedStyle(e).cursor]; }, li('秋季3支部'));
    assert.deepEqual(r, ['📝 エントリー下書き', 'records.html#entry=' + encodeURIComponent(A), 'pointer']);
  });
  await check('URLから読んだ要項（PDFの控えなし）：カードに「🔗 元のPDFを開く」（新しいタブ・元のURL）。控えがある大会・http(s) でないURLは出さない', async () => {
    const r = await p.evaluate(s => [...eval(s).querySelectorAll('a.pp-src')].map(e => [e.textContent, e.getAttribute('href'), e.target, e.rel]), li('URLの大会'));
    assert.deepEqual(r, [['🔗 元のPDFを開く', SRC, '_blank', 'noopener noreferrer']]);
    assert.equal(await p.evaluate(s => eval(s).querySelectorAll('a.pp-src').length, li('秋季3支部')), 0);
  });
  await check('要項の文字の画面：PDFは無いがURLがある →「🔗 元のPDFを開く」（「保存されていません」は出さない）', async () => {
    await p.evaluate(s => eval(s).querySelector('[data-pv="yoko"]').click(), li('URLの大会')); await sl(300);
    const r = await p.evaluate(() => { const m = document.getElementById('pvModal'), a = m.querySelector('[data-pvsrc] a'); return [a.textContent, a.getAttribute('href'), a.target, !!m.querySelector('[data-pvnofile]'), m.querySelector('.pv-text').textContent]; });
    assert.deepEqual(r, ['🔗 元のPDFを開く', SRC, '_blank', false, '架空 URLの要項の文字\n申込締切 10月30日']);
    if (SHOT) await p.screenshot({ path: path.join(SHOT, 'fix74_src_390.png') });
    await p.evaluate(() => document.querySelector('#pvModal [data-pvclose]').click());
  });
  await check('records.html#entry=<大会>：エントリー下書きが開き、その大会が選ばれている（参加料の大会名）', async () => {
    await p.goto(B + 'records.html#entry=' + encodeURIComponent(U), { waitUntil: 'load' }); await sl(1800);
    const r = await p.evaluate(() => { const e = document.getElementById('rbEntry'); return [e.hidden, document.getElementById('rbEntryOpen').getAttribute('aria-expanded'), e.textContent.includes('架空 URLの大会'), e.textContent.includes('架空 秋季3支部大会')]; });
    assert.deepEqual(r, [false, 'true', true, false]);
    const fk = await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('lanenote.entry.fees.v1') || '{}'); return Object.keys(o); });
    assert(!fk.includes('2026-11-03|架空 秋季3支部大会'), JSON.stringify(fk));
    if (SHOT) await p.screenshot({ path: path.join(SHOT, 'fix74_entry_from_meet_390.png') });
  });
  await check('ページのエラーなし', async () => { assert.deepEqual(errs, []); });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
