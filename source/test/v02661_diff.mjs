// v0.26.61 時間の差の表し方：60秒以上は分から「2分23秒35」・60秒より短ければ今まで通り「0.27秒」・距離は今まで通り（架空データのみ・外には通信しない）
//   node v02661_diff.mjs [スクショの保存先（PNG）]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), req = createRequire(import.meta.url), SHOT = process.argv[2] || '';
const R = req('../src/results.js'); globalThis.ResultParser = R; const P = req('../src/print.js'); globalThis.LanePrint = P; const V = req('../src/review.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.61] 時間の差（60秒以上は分から）');
const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '', bib: '', lane: '', rank: 1, comment: '' }, o); if (/100m|走幅跳/.test(r.event) && !r.wind) r.wind = '+0.5'; r.id = R.recId(r.meet, r.date, r); return r; };

await check('共通の形 fmtSecDiff：59.99秒・1分00秒00・2分23秒35・マイナス・0', () => {
  const f = R.fmtSecDiff;
  assert.equal(f(0.27), '0.27秒'); assert.equal(f(59.99), '59.99秒'); assert.equal(f(60), '1分00秒00'); assert.equal(f(60.0), '1分00秒00');
  assert.equal(f(143.35), '2分23秒35'); assert.equal(f(125.3), '2分05秒30'); assert.equal(f(600.07), '10分00秒07');
  assert.equal(f(-0.27), '-0.27秒'); assert.equal(f(-59.99), '-59.99秒'); assert.equal(f(-60), '-1分00秒00'); assert.equal(f(-143.35), '-2分23秒35');
  assert.equal(f(0), '0.00秒'); assert.equal(f(-0), '0.00秒'); assert.equal(f(null), ''); assert.equal(f(NaN), '');
  assert.equal(f(1238.05 - 1094.7), '2分23秒35', '引き算の小数のずれがあっても');
});
await check('PBの伸び fmtImprovement：時間は「−0.27秒」「−59.99秒」「−1分00秒00」「−2分23秒35」・距離は「+0.20」「+143.35」のまま', () => {
  assert.equal(R.fmtImprovement(0.27, true), '−0.27秒'); assert.equal(R.fmtImprovement(59.99, true), '−59.99秒');
  assert.equal(R.fmtImprovement(60, true), '−1分00秒00'); assert.equal(R.fmtImprovement(143.35, true), '−2分23秒35');
  assert.equal(R.fmtImprovement(0.2, false), '+0.20'); assert.equal(R.fmtImprovement(143.35, false), '+143.35'); assert.equal(R.fmtImprovement(null, true), '');
  assert.equal(R.improvement('20:38.05', '18:14.70', '男子5000m'), 143.35);
});
const LONG = () => [
  rec({ event: '男子5000m', mark: '20:38.05', date: '2026-06-01', meet: '春の記録会' }), rec({ event: '男子5000m', mark: '18:14.70' }),
  rec({ event: '男子1500m', mark: '5:10.00', date: '2026-06-01', meet: '春の記録会' }), rec({ event: '男子1500m', mark: '4:10.00' }),
  rec({ event: '男子800m', mark: '2:59.99', date: '2026-06-01', meet: '春の記録会' }), rec({ event: '男子800m', mark: '2:00.00' }),
  rec({ event: '男子100m', mark: '12.67', date: '2026-06-01', meet: '春の記録会' }), rec({ event: '男子100m', mark: '12.40' }),
  rec({ event: '男子走幅跳', mark: '5.80', date: '2026-06-01', meet: '春の記録会' }), rec({ event: '男子走幅跳', mark: '6.00' })];
await check('大会まとめ（印刷）：PB更新の伸びとPBの印も同じ形（距離はそのまま）', () => {
  const all = LONG(), recs = all.filter(r => r.meet === '架空区大会');
  const s = P.meetSheet(R, recs, all, { meet: '架空区大会', meetDate: '2026-09-20' });
  assert.match(s, /lp-up">−2分23秒35</); assert.match(s, /lp-up">−1分00秒00</); assert.match(s, /lp-up">−59\.99秒</); assert.match(s, /lp-up">−0\.27秒</); assert.match(s, /lp-up">\+0\.20</);
  assert.match(s, /PB −2分23秒35</); assert.match(s, /PB −0\.27</); assert.match(s, /PB \+0\.20</);
  assert.doesNotMatch(s, /143\.35|60\.00秒/);
});
await check('ふりかえり「昨年度からの伸び」：「2分23秒35アップ」「59.99秒アップ」「あと 1分00秒00」・距離は「0.20mアップ」', () => {
  const all = [
    rec({ event: '男子5000m', mark: '20:38.05', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子5000m', mark: '18:14.70' }),
    rec({ event: '男子800m', mark: '2:59.99', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子800m', mark: '2:00.00' }),
    rec({ event: '男子1500m', mark: '4:10.00', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子1500m', mark: '5:10.00' }),
    rec({ event: '男子100m', mark: '12.67', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子100m', mark: '12.94' }),
    rec({ event: '男子走幅跳', mark: '5.80', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子走幅跳', mark: '6.00' })];
  const g = V.seasonRange(2026), d = V.build(R, all, R.athleteKey(all[0]), { from: g[0], to: g[1] }), s = V.sheet(R, d, {});
  assert.match(s, /昨年度まで 20:38\.05 → 2分23秒35アップ/); assert.match(s, /昨年度まで 2:59\.99 → 59\.99秒アップ/);
  assert.match(s, /昨年度まで 4:10\.00　自己ベストまで あと 1分00秒00/); assert.match(s, /昨年度まで 12\.67　自己ベストまで あと 0\.27秒/);
  assert.match(s, /昨年度まで 5\.80 → 0\.20mアップ/); assert.doesNotMatch(s, /143\.35|60\.00秒/);
});
// 記録のページ（ホームの「PB更新」の一覧）：実際の画面で
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : p.endsWith('.json') ? 'application/json' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
try {
  await check('記録のページ：ホームのPB更新「前のベスト 20:38.05 −2分23秒35」・「−59.99秒」「−1分00秒00」「−0.27秒」・走幅跳は「+0.20」', async () => {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
    await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort());
    await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('__i')) { localStorage.clear(); sessionStorage.setItem('__i', '1'); } localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); });
    await p.goto(B + 'records.html', { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 900));
    await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
    const f = path.join(fs.mkdtempSync('/tmp/v02661-'), 'synth.json'); fs.writeFileSync(f, JSON.stringify({ records: LONG() }));
    await (await p.$('#rbImport')).uploadFile(f); await p.waitForFunction(() => document.querySelectorAll('.pblist li').length >= 5, { timeout: 15000 });
    const L = await p.evaluate(() => [...document.querySelectorAll('.pblist li .prev')].map(e => e.textContent.trim()));
    for (const t of ['前のベスト 20:38.05−2分23秒35', '前のベスト 5:10.00−1分00秒00', '前のベスト 2:59.99−59.99秒', '前のベスト 12.67−0.27秒', '前のベスト 5.80+0.20']) assert(L.includes(t), t + ' / ' + JSON.stringify(L));
    if (SHOT) { await p.evaluate(() => { const e = document.querySelector('.pblist'); e.scrollIntoView({ block: 'center' }); }); await new Promise(r => setTimeout(r, 300)); await p.screenshot({ path: SHOT }); }
    await p.close();
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
