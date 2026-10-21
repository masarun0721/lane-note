// v0.28.4 旧アドレス（masarun0721.github.io）で開いたら、全部のページで全画面の引っ越しのお知らせ（架空データ）
//   node v0284_move.mjs [スクショの保存先フォルダ]
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.28.4] 引っ越しのお知らせ');
const OLD = 'https://masarun0721.github.io/lane-note/', PAGES = ['index.html', 'records.html', 'team.html', 'schedule.html', 'check.html', 'guide.html', 'try.html', 'admin.html', 'intro.html'];
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
async function page(w, h = 800, host = OLD) {
  const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setViewport({ width: w, height: h }); await p.setRequestInterception(true); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
  p.on('request', r => { const m = r.url().startsWith(host) && r.url().slice(host.length).match(/^([^?#]*)/); if (!m) return /^(data|blob):/.test(r.url()) ? r.continue() : r.abort(); const f = path.join(ROOT, m[1] || 'index.html'); if (!fs.existsSync(f)) return r.respond({ status: 404, body: '' }); r.respond({ status: 200, contentType: f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript', body: fs.readFileSync(f) }); });
  await p.evaluateOnNewDocument(() => localStorage.setItem('lanenote.mode.v1', 'coach')); return p;
}
const seed = p => p.evaluate(() => new Promise((ok, ng) => { const q = indexedDB.open('lanenote-records', 1); q.onupgradeneeded = () => q.result.createObjectStore('records', { keyPath: 'id' }); q.onsuccess = () => { const tx = q.result.transaction('records', 'readwrite'); tx.objectStore('records').put({ id: 'x1', name: '架空 太郎', event: '100m', mark: '12.34', date: '2026-09-20', meet: '架空記録会' }); tx.oncomplete = () => { q.result.close(); ok(); }; tx.onerror = () => ng(tx.error); }; }));
const info = p => p.evaluate(() => { const o = document.getElementById('laneMoveOv'), r = e => e && e.getBoundingClientRect(), vis = e => !!e && r(e).width > 0 && r(e).height > 0 && getComputedStyle(e).visibility !== 'hidden';
  const g = o && o.querySelector('#laneMoveGo'), x = o && o.querySelector('#laneMoveExp');
  return { ov: !!o, full: o ? [Math.round(r(o).width) === innerWidth, Math.round(r(o).height) === innerHeight] : null, title: o && o.querySelector('h2').textContent, sub: o && o.querySelector('.mv-sub').textContent, url: o && o.querySelector('.mv-url').textContent,
    go: g && [g.textContent, g.getAttribute('href'), vis(g), Math.round(r(g).height), getComputedStyle(g).cursor], rec: !!(o && o.querySelector('#laneMoveRec')), exp: x && [x.textContent, x.tagName, x.getAttribute('href'), vis(x)], stay: o && vis(o.querySelector('#laneMoveStay')), bar: !!document.getElementById('laneMoveBar'), url0: location.href }; });
await check('全部のページ（1280・390）：全画面・題・「今後更新されません」・新しい住所を大きく・大きな「新しい住所で開く」（同じページ）・自動では移らない。記録が無いと書き出しは出さない', async () => {
  for (const w of [1280, 390]) for (const pg of PAGES) {
    const p = await page(w); await p.goto(OLD + pg + '?x=1#h', { waitUntil: 'load' }); await sl(900); const i = await info(p);
    assert.deepEqual([i.ov, i.full, i.title, i.sub, i.url], [true, [true, true], 'LANE NOTEは新しい住所に引っ越しました', 'こちらの住所は今後更新されません。', 'https://lane-note.web.app/'], pg + ' ' + w + ' ' + JSON.stringify(i));
    assert.deepEqual(i.go.slice(0, 3), ['新しい住所で開く', 'https://lane-note.web.app/' + pg + '?x=1#h', true], pg); assert(i.go[3] >= 50, '大きいボタン ' + i.go[3]); assert.equal(i.go[4], 'pointer');
    assert.deepEqual([i.rec, i.stay, i.bar, i.url0.startsWith(OLD)], [false, true, false, true], pg + ' ' + w); assert.deepEqual(p.errs.filter(e => /LaneMove|laneMove/.test(e)), [], pg);
    if (SHOT && w === 1280 && pg === 'index.html') await p.screenshot({ path: path.join(SHOT, 'fix75_overlay_nolocal_1280.png') });
    await p.close();
  }
});
await check('この端末に記録がある：「この端末に記録を保存している人へ」→ ①「💾 記録を書き出す」②「ファイルから読み込む」・ログインの説明。記録のページではその場で書き出す（JSON）。ほかのページは records.html?export=1', async () => {
  const p = await page(1280); await p.goto(OLD + 'records.html', { waitUntil: 'load' }); await seed(p);
  for (const pg of PAGES) { await p.goto(OLD + pg, { waitUntil: 'load' }); await sl(900); const i = await info(p);
    assert.equal(i.rec, true, pg); assert.equal(i.exp[0], '💾 記録を書き出す'); assert.equal(i.exp[3], true, pg);
    assert.deepEqual(i.exp.slice(1, 3), pg === 'records.html' ? ['BUTTON', null] : ['A', 'records.html?export=1#rbH3'], pg);
    const sg = await p.$eval('#laneMoveSign', e => [e.textContent, e.tagName, e.getAttribute('href'), e.getBoundingClientRect().height > 36, getComputedStyle(e).cursor, e.compareDocumentPosition(document.getElementById('laneMoveExp')) & 4 ? 'first' : 'after']);
    assert.deepEqual(sg, ['Googleでログインして移す（おすすめ）', pg === 'records.html' ? 'BUTTON' : 'A', pg === 'records.html' ? null : 'records.html?migrate=1', true, 'pointer', 'first'], pg);
    const t = await p.$eval('#laneMoveRec', e => e.textContent); assert(/このページでGoogleでログイン →「このアカウントへ移す」を押す/.test(t) && /新しい住所で同じGoogleアカウントでログイン/.test(t), t); assert(/新しい住所の記録のページで「ファイルから読み込む」/.test(t) && /Googleでログインして保存している記録は、新しい住所でログインすればそのまま見られます/.test(t)); }
  await p.goto(OLD + 'records.html', { waitUntil: 'load' }); await sl(1500);
  if (SHOT) await p.screenshot({ path: path.join(SHOT, 'fix75_overlay_1280.png') });
  const cdp = await p.target().createCDPSession(), dl = fs.mkdtempSync('/tmp/v0284-'); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await p.click('#laneMoveExp'); await sl(1500);
  const f = fs.readdirSync(dl).filter(x => /^LANE_NOTE_kiroku_\d{8}\.json$/.test(x)); assert.equal(f.length, 1, fs.readdirSync(dl).join());
  assert.equal(JSON.parse(fs.readFileSync(path.join(dl, f[0]), 'utf8')).records.length, 1); assert(/1件をファイルに書き出しました/.test(await p.$eval('#laneMoveMsg', e => e.textContent)));
  const p2 = await page(390, 844); await p2.goto(OLD + 'records.html', { waitUntil: 'load' }); await sl(1200); if (SHOT) await p2.screenshot({ path: path.join(SHOT, 'fix75_overlay_390.png') }); await p2.close();
  await p.close();
});
await check('「このまま使う（記録を移すときだけ）」：お知らせを閉じ、この画面のあいだは上に赤い帯（新しい住所で開く・記録を書き出す）。v0.28.6：別のページを開く・読み直すとまた全画面（タブに覚えない）', async () => {
  const p = await page(1280); await p.goto(OLD + 'records.html', { waitUntil: 'load' }); await seed(p); await p.reload({ waitUntil: 'load' }); await sl(900);
  await p.click('#laneMoveStay'); await sl(200);
  const r = await p.evaluate(() => { const b = document.getElementById('laneMoveBar'), s = getComputedStyle(b); return [!!document.getElementById('laneMoveOv'), b.textContent, s.backgroundColor, s.position, !!b.querySelector('#laneMoveGo'), !!b.querySelector('#laneMoveExp')]; });
  assert.deepEqual(r, [false, '⚠ LANE NOTEは新しい住所（lane-note.web.app）に引っ越しました。こちらは今後更新されません。新しい住所で開く💾 記録を書き出す', 'rgb(179, 38, 30)', 'sticky', true, true]);
  if (SHOT) await p.screenshot({ path: path.join(SHOT, 'fix75_banner_1280.png') });
  await p.goto(OLD + 'index.html', { waitUntil: 'load' }); await sl(900); assert.deepEqual([(await info(p)).ov, (await info(p)).bar], [true, false], '開き直すとまた全画面');
  const q = await page(390, 700); await q.goto(OLD + 'records.html', { waitUntil: 'load' }); await sl(900); assert.equal((await info(q)).ov, true, '別の画面ではまた出す');
  await q.click('#laneMoveStay'); await sl(200); if (SHOT) await q.screenshot({ path: path.join(SHOT, 'fix75_banner_390.png') }); await q.close(); await p.close();
});
await check('「Googleでログインして移す（おすすめ）」（記録のページ）：お知らせは赤い帯に。ログインのあと出る「このアカウントへ移す」（今までの画面）へ連れていく', async () => {
  const p = await page(1280); await p.goto(OLD + 'records.html', { waitUntil: 'load' }); await seed(p); await p.reload({ waitUntil: 'load' }); await sl(900);
  await p.click('#laneMoveSign'); await sl(300); assert.deepEqual([(await info(p)).ov, (await info(p)).bar], [false, true]);
  await p.evaluate(() => { const g = document.getElementById('rbGuest'); g.hidden = false; g.innerHTML = '<b>📦 この端末に、ログインしていないときに保存した記録が 1件あります。</b><button class="btn" type="button" data-guest="move">このアカウントへ移す（1件・端末からは消す）</button>'; }); await sl(900);
  assert.deepEqual(await p.evaluate(() => [document.getElementById('rbGuest').classList.contains('mv-hl'), document.activeElement && document.activeElement.getAttribute('data-guest')]), [true, 'move']);
  if (SHOT) await p.screenshot({ path: path.join(SHOT, 'fix75_migrate_1280.png') }); await p.close();
});
await check('ページが組み立て直して消しても戻る・新しい住所と手元のサーバーでは出さない', async () => {
  const p = await page(900); await p.goto(OLD + 'index.html', { waitUntil: 'load' }); await sl(800); await p.evaluate(() => document.getElementById('laneMoveOv').remove()); await sl(100); assert.equal((await info(p)).ov, true); await p.close();
  for (const h of ['https://lane-note.web.app/', 'http://127.0.0.1:9/']) { const q = await page(900, 700, h); await q.goto(h + 'records.html', { waitUntil: 'load' }); await sl(800); const i = await info(q); assert.deepEqual([i.ov, i.bar], [false, false], h); await q.close(); }
});
await check('Pages は v0.28.4 で止める：Pages は pages_frozen を出すだけ（ビルドしない）。テストは別の仕事、Hosting はテストだけを待つ（Pages を待たない）・hosting だけ出す', async () => {
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8'), job = n => { const i = y.indexOf('\n  ' + n + ':\n'); assert(i > 0, n); const j = y.slice(i + 1).search(/\n  [a-z]+:\n/); return y.slice(i, j < 0 ? undefined : i + 1 + j); };
  const t = job('test'), pg = job('pages'), h = job('hosting');
  assert(/npm test/.test(t) && /build\.py --check \./.test(t)); assert(/needs: \[rules, test\]/.test(h) && /deploy --only hosting --project lane-note/.test(h));
  assert(/path: pages_frozen/.test(pg) && !/build\.py/.test(pg) && /deploy-pages@v4/.test(pg)); assert(!/needs:.*pages/.test(h));
  const fz = path.join(ROOT, 'pages_frozen'); for (const f of PAGES) assert(fs.readFileSync(path.join(fz, f), 'utf8').includes('LANE NOTEは新しい住所に引っ越しました'), f);
  assert(fs.existsSync(path.join(fz, '.nojekyll')) && fs.existsSync(path.join(fz, 'sw.js')) && fs.existsSync(path.join(fz, 'firebase-config.js')));
});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
