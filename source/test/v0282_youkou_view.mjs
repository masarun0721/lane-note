// v0.28.2 今後の大会：読み込んだ要項を見る（この端末の控えだけ・架空データ）／前に入れた要項の締切を読み直す／警告は1行
//   node v0282_youkou_view.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.28.2] 読み込んだ要項を見る');
const A = '2026-11-03|架空 秋季3支部大会', Bk = '2026-11-15|架空 文字だけ大会', C = '2026-11-20|架空 なにもない大会';
const YOKO = ['第2・3支部 秋季大会 要項（架空）', '5 申込方法 JAAF STARTLINE によるエントリー', 'エントリー期間 10月13日（月）〜10月23日（金）17:00', '6 Ａ票・参加料 10月27日（月）までに提出・振込'].join('\n');
await check('大会準備：元のPDFをこの端末にだけ控える（クラウドには送らない）・「保存を消す」で一緒に消す', () => {
  const a = fs.readFileSync(path.join(ROOT, 'source/src/app.js'), 'utf8');
  assert(/prepFileSave\(p, kind, file\);[^\n]*\n    if \(!o\.uid \|\| !FB\) return;/.test(a), '控えはクラウドより前・ログインなしでも');
  const f = a.slice(a.indexOf('function prepFileSave'), a.indexOf('function b64Of')); assert(!/setDoc|FB\./.test(f), 'クラウドに書かない');
  assert(/prepFileId\(p\.owner, p\.key, PREP_KINDS\[fk\]\)/.test(a));
});
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
try {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); const errs = [];
  await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort()); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument(() => { const T = Date.parse('2026-10-20T03:00:00Z'); Date.now = () => T; if (!sessionStorage.getItem('__i')) { localStorage.clear(); sessionStorage.setItem('__i', '1'); } localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); });
  await p.goto(B + 'records.html', { waitUntil: 'load' }); await sl(1000);
  await p.evaluate(() => { const d = document.querySelector('#rpPaste'); d.closest('details') && (d.closest('details').open = true); d.value = '大会名,日付,会場,区分,締切\n架空 秋季3支部大会,2026/11/3,架空競技場,高,\n架空 文字だけ大会,2026/11/15,,高,\n架空 なにもない大会,2026/11/20,,高,\n'; document.getElementById('rpRead').click(); }); await sl(400);
  await p.evaluate(() => document.getElementById('rpSave').click()); await sl(1200);
  // v0.28.1 より前に入れた形：一覧に dl が無い。控え（IndexedDB）に読み取った文字、A は元のPDFも
  await p.evaluate(async (A, Bk, C, YOKO) => {
    const idx = { '|': {} }; [A, Bk, C].forEach(k => { idx['|'][k] = { kinds: { yoko: 1 }, end: k.slice(0, 10), at: 1 }; }); idx['|'][Bk].kinds.sl = 1; localStorage.setItem('lanenote.prep.idx.v1', JSON.stringify(idx));
    const pdf = new Blob(['%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'], { type: 'application/pdf' });
    const recs = [{ id: '||' + A, owner: '|', key: A, end: A.slice(0, 10), docs: { yoko: { name: 'kakuu_yoko.pdf' } }, snap: { st: { docText: { yoko: YOKO } } } },
      { id: '||' + A + '|file|yoko', owner: '|', key: A, end: A.slice(0, 10), file: 1, kind: 'yoko', name: 'kakuu_yoko.pdf', type: 'application/pdf', blob: pdf },
      { id: '||' + Bk, owner: '|', key: Bk, end: Bk.slice(0, 10), docs: {}, snap: { st: { docText: { yoko: '架空の要項の文字\n参加料は当日受付で支払う', sl: '架空スタートリスト 1組 1レーン 見本太郎' } } } },
      { id: 'x|other|' + C, owner: 'x|other', key: C, end: C.slice(0, 10), snap: { st: { docText: { yoko: 'ほかの人の控え 申込締切 10/25' } } } }];
    await new Promise((ok, ng) => { const q = indexedDB.open('lanenote-prep', 1); q.onupgradeneeded = () => q.result.createObjectStore('snap', { keyPath: 'id' }); q.onsuccess = () => { const db = q.result, tx = db.transaction('snap', 'readwrite'); recs.forEach(r => tx.objectStore('snap').put(r)); tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => ng(tx.error); }; q.onerror = () => ng(q.error); });
  }, A, Bk, C, YOKO);
  await p.goto(B + 'schedule.html', { waitUntil: 'load' }); await sl(1800);
  const li = n => `[...document.querySelectorAll('#lpHome .lp-list > li')].find(l => l.textContent.includes(${JSON.stringify(n)}))`;
  await check('前に入れた要項：控えの文字から締切を読み直す（一覧にも残す）→「読めませんでした」にならない', async () => {
    const r = await p.evaluate(s => { const l = eval(s); return [[...l.querySelectorAll('.lp-dl')].map(x => x.textContent), !!l.querySelector('.lp-warnl'), l.querySelector('.lp-via') && l.querySelector('.lp-via').textContent]; }, li('秋季3支部'));
    assert.deepEqual(r, [['⏰ 〆 10/23(金)17:00（あと3日）', '⏰ 〆 10/27(火)（あと7日）', '📝 A票など提出 〆 10/27(火)（あと7日）'], false, 'JAAF']);
    const ix = await p.evaluate(k => JSON.parse(localStorage.getItem('lanenote.prep.idx.v1'))['|'][k].dl.entry.date, A); assert.equal(ix, '2026-10-23');
  });
  await check('読めなかった：警告は1行だけ・小さいボタン（指のカーソル）。控えも無いものは「まだ読んでいません」。ほかの人の控えは使わない', async () => {
    const r = await p.evaluate(s => { const l = eval(s), w = l.querySelectorAll('.lp-warnl'), b = l.querySelector('.lp-fixb'); return [w.length, w[0].textContent, b.getBoundingClientRect().height, getComputedStyle(b).cursor, l.querySelectorAll('.lp-dl,.lp-via').length]; }, li('文字だけ大会'));
    assert.equal(r[0], 1); assert.equal(r[1], '⚠ 要項から読めませんでした：エントリー締切・振込締切・出し方 ✏️ 締切を入力'); assert(r[2] < 26, '小さいボタン ' + r[2]); assert.equal(r[3], 'pointer'); assert.equal(r[4], 0);
    const c = await p.evaluate(s => { const l = eval(s); return [l.querySelectorAll('.lp-warnl').length, l.querySelector('.lp-warnl').getAttribute('data-dlwarn'), l.querySelector('.lp-warnl').textContent]; }, li('なにもない大会'));
    assert.deepEqual(c, [1, 'none', '⚠ 要項の締切はまだ読んでいません（要項を入れ直すと読みます） ✏️ 締切を入力']);
  });
  await check('「要項 ✓」はボタン（指のカーソル・ホバー）。待ちの札はボタンではない', async () => {
    const r = await p.evaluate(s => { const l = eval(s), y = l.querySelector('[data-pv="yoko"]'); return [y.tagName, getComputedStyle(y).cursor, y.textContent, l.querySelectorAll('.pp-b.wait').length, [...l.querySelectorAll('.pp-b.wait')].every(x => x.tagName === 'SPAN')]; }, li('秋季3支部'));
    assert.deepEqual(r, ['BUTTON', 'pointer', '要項 ✓', 2, true]);
  });
  if (SHOT) { const c = await p.evaluate(() => { const ls = [...document.querySelectorAll('#lpHome .lp-list > li')].filter(l => l.offsetHeight); window.scrollBy(0, ls[0].getBoundingClientRect().top - 60); return null; }); await sl(300);
    const k = await p.evaluate(() => { const ls = [...document.querySelectorAll('#lpHome .lp-list > li')].filter(l => l.offsetHeight), a = ls[0].getBoundingClientRect(), z = ls[ls.length - 1].getBoundingClientRect(); return { x: 0, y: Math.max(0, a.top - 50) + scrollY, width: 390, height: z.bottom - a.top + 60 }; });
    await p.screenshot({ path: path.join(SHOT, 'fix73_home_390.png'), clip: k, captureBeyondViewport: true }); }
  await check('元のPDFが控えてある：「要項 ✓」で新しいタブにPDF（blob:）', async () => {
    const tp = new Promise(r => b.once('targetcreated', t => r(t)));
    await p.evaluate(s => eval(s).querySelector('[data-pv="yoko"]').click(), li('秋季3支部'));
    const t = await Promise.race([tp, sl(4000).then(() => null)]); assert(t, '新しいタブが開かない'); assert(/^blob:/.test(t.url()), t.url());
    assert.equal(await p.evaluate(() => !!document.getElementById('pvModal')), false);
    const np = await t.page(); if (np) await np.close();
  });
  await check('PDFが無い（文字だけ）：画面の中に読み取った文字と「元のファイルは保存されていません。もう一度入れると見られます。」・閉じる', async () => {
    await p.evaluate(s => eval(s).querySelector('[data-pv="yoko"]').click(), li('文字だけ大会')); await sl(300);
    const r = await p.evaluate(() => { const m = document.getElementById('pvModal'); return m && [m.querySelector('[data-pvnofile]').textContent, m.querySelector('.pv-text').textContent, m.querySelector('[role=dialog]').getAttribute('aria-label')]; });
    assert.deepEqual(r, ['元のファイルは保存されていません。もう一度入れると見られます。', '架空の要項の文字\n参加料は当日受付で支払う', '要項']);
    if (SHOT) await p.screenshot({ path: path.join(SHOT, 'fix73_modal_390.png') });
    await p.evaluate(() => document.querySelector('[data-pvclose]').click()); assert.equal(await p.evaluate(() => !!document.getElementById('pvModal')), false);
    await p.evaluate(s => eval(s).querySelector('[data-pv="sl"]').click(), li('文字だけ大会')); await sl(300);
    assert.equal(await p.evaluate(() => document.querySelector('#pvModal .pv-text').textContent), '架空スタートリスト 1組 1レーン 見本太郎');
    await p.keyboard.press('Escape'); assert.equal(await p.evaluate(() => !!document.getElementById('pvModal')), false);
  });
  await check('なにも控えていない（前の版で入れた）：はっきり「保存されていません」・ほかの人の控えは出さない', async () => {
    await p.evaluate(s => eval(s).querySelector('[data-pv="yoko"]').click(), li('なにもない大会')); await sl(300);
    const r = await p.evaluate(() => { const m = document.getElementById('pvModal'); return [m.querySelector('[data-pvnofile]').textContent, !!m.querySelector('[data-pvnotext]'), !!m.querySelector('.pv-text'), /ほかの人/.test(m.textContent)]; });
    assert.deepEqual(r, ['元のファイルは保存されていません。もう一度入れると見られます。', true, false, false]);
    await p.evaluate(() => document.querySelector('[data-pvclose]').click());
    assert(!errs.length, errs.join(' / '));
  });
  // 実際の秋季3支部要項の文面（人名・学校名・口座・住所だけ架空）を Chrome で PDF にして、大会準備（index.html）に入れる。アプリの pdf.js で文字を取り出す道を通す
  const FXT = fs.readFileSync(path.join(here, 'fixtures/v0282_shibu3_yoko.txt'), 'utf8'), PDF = path.join(fs.mkdtempSync('/tmp/v0282-'), 'kakuu_shibu3_yoko.pdf');
  { const q = await b.newPage(); await q.setContent('<html><body style="font-family:\'Noto Sans CJK JP\',\'Noto Serif CJK JP\',sans-serif;font-size:11pt;line-height:1.6">' + FXT.split('\n').map(l => '<div>' + l.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>').join('') + '</body></html>'); await q.pdf({ path: PDF, format: 'A4' }); await q.close(); }
  const K2 = '2026-11-14|架空 秋季3支部大会';
  await check('実際の要項の文面（PDF → アプリの pdf.js）：文字は上から下の順・大会準備に「📝 エントリー下書き」・JAAF・〆 10/23 17:00（八種競技の期間は使わない）・参加費とA票 10/27・元のPDFをこの端末に控える', async () => {
    const q = await b.newPage(); await q.setViewport({ width: 390, height: 844 }); const er = [];
    await q.setRequestInterception(true); q.on('request', r => { const u = r.url(), m = /cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[^/]+\/(.+)$/.exec(u), NM = path.join(here, 'node_modules/pdfjs-dist/');
      if (m) { const fp = NM + m[1].split('?')[0]; if (fs.existsSync(fp)) return r.respond({ status: 200, contentType: /\.m?js$/.test(fp) ? 'application/javascript' : 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(fp) }); }
      return u.startsWith(B) || /^(data|blob):/.test(u) ? r.continue() : r.abort(); }); q.on('pageerror', e => er.push(e.message)); q.on('dialog', d => d.accept());
    await q.goto(B + 'index.html?plan=' + encodeURIComponent(K2), { waitUntil: 'load' }); await sl(1500);
    await (await q.$('#yokoFile')).uploadFile(PDF);
    await q.waitForFunction(k => { try { const o = JSON.parse(localStorage.getItem('lanenote.prep.idx.v1'))['|'][k]; return o && o.dl; } catch (e) { return false; } }, { timeout: 30000 }, K2); await sl(800);
    const r = await q.evaluate(k => JSON.parse(localStorage.getItem('lanenote.prep.idx.v1'))['|'][k].dl, K2);
    assert.deepEqual([r.entry.date, r.entry.time, r.entry.from, r.pay.date, r.slip.date, r.via], ['2026-10-23', '17:00', '2026-10-13', '2026-10-27', '2026-10-27', { via: 'jaaf' }]);
    const f = await q.evaluate(k => new Promise(ok => { const o = indexedDB.open('lanenote-prep', 1); o.onsuccess = () => { const g = o.result.transaction('snap').objectStore('snap').get('||' + k + '|file|yoko'); g.onsuccess = () => ok(g.result ? [g.result.name, g.result.blob.size > 1000, g.result.blob.type] : null); }; }), K2);
    assert.deepEqual(f, ['kakuu_shibu3_yoko.pdf', true, 'application/pdf']); assert(!er.length, er.join(' / '));
    // v0.28.3 読み取った文字は上から下の順（前は下の行から出ていた）
    const t = await q.evaluate(k => new Promise(ok => { const o = indexedDB.open('lanenote-prep', 1); o.onsuccess = () => { const g = o.result.transaction('snap').objectStore('snap').get('||' + k); g.onsuccess = () => ok(g.result.snap.st.docText.yoko); }; }), K2);
    const fl = FXT.split('\n').map(x => x.replace(/\s+/g, '')).filter(x => x.length >= 6), tl = t.split('\n').map(x => x.replace(/\s+/g, ''));
    const pos = fl.slice(0, 12).map(x => tl.findIndex(y => y.includes(x.slice(0, 6)))); const hit = pos.filter(i => i >= 0); assert(hit.length >= 5, JSON.stringify(pos)); assert(hit.every((v, i) => !i || v > hit[i - 1]), '上から下の順 ' + JSON.stringify(pos));
    // v0.28.3 大会準備の「📝 エントリー下書き」→ records.html#entry=<この大会>
    assert.equal(await q.$eval('#prepEntry', e => [e.textContent, e.getAttribute('href')].join(' ')), '📝 エントリー下書き records.html#entry=' + encodeURIComponent(K2));
    await q.close();
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
