// v0.26.66 分で書く種目（800m以上・障害・競歩など）の差は60秒より短くても「14秒40」「0秒04」・短距離とハードルは今まで通り「0.07秒」（架空データのみ・外には通信しない）
//   node v02666_secdiff.mjs [スクショの保存先（PNG）]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), req = createRequire(import.meta.url), SHOT = process.argv[2] || '';
const R = req('../src/results.js'); globalThis.ResultParser = R; const P = req('../src/print.js'); globalThis.LanePrint = P; const V = req('../src/review.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.66] 分で書く種目の差は「14秒40」');
const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '', bib: '', lane: '', rank: 1, comment: '' }, o); if (/100m|走幅跳/.test(r.event) && !r.wind) r.wind = '+0.5'; r.id = R.recId(r.meet, r.date, r); return r; };

// 種目と記録（前 → 今）から、差の表示を作る（共通の部品だけ）
const show = (ev, a, b) => R.fmtImprovement(R.improvement(a, b, ev), true, R.minuteStyle(ev, a, b));
await check('頼まれた例：1500m −2秒79・5000m −14秒40・800m −0秒04・100m −0.07秒・5000m −2分23秒35', () => {
  assert.equal(show('男子1500m', '4:30.00', '4:27.21'), '−2秒79'); assert.equal(show('女子5000m', '16:00.00', '15:45.60'), '−14秒40');
  assert.equal(show('男子800m', '2:10.04', '2:10.00'), '−0秒04'); assert.equal(show('男子100m', '12.07', '12.00'), '−0.07秒');
  assert.equal(show('男子5000m', '20:38.05', '18:14.70'), '−2分23秒35'); assert.equal(show('男子200m', '25.12', '24.00'), '−1.12秒');
});
await check('種目で決める：障害（SC）・競歩・3000m は「秒＋2けた」、ハードル・400m以下は今まで通り', () => {
  assert.equal(show('男子3000mSC', '10:20.00', '10:10.50'), '−9秒50'); assert.equal(show('男子3000m障害', '10:20.00', '10:19.95'), '−0秒05');
  assert.equal(show('女子5000mW', '26:00.00', '25:48.30'), '−11秒70'); assert.equal(show('男子10000m競歩', '50:00.00', '49:30.00'), '−30秒00');
  assert.equal(show('中学男子3000m', '10:00.00', '9:58.80'), '−1秒20');
  assert.equal(show('男子110mH', '16.00', '15.50'), '−0.50秒'); assert.equal(show('女子100mH', '15.30', '15.27'), '−0.03秒'); assert.equal(show('男子400mH', '1:00.10', '58.90'), '−1.20秒');
  assert.equal(show('男子400m', '1:00.50', '58.50'), '−2.00秒'); assert.equal(show('男子100m', '12.67', '12.40'), '−0.27秒');
});
await check('種目で決まらないとき（リレー・600m・わからない種目）は、記録に「:」があるか', () => {
  assert.equal(show('男子4×400mR', '3:40.00', '3:37.21'), '−2秒79'); assert.equal(show('男子4×100mR', '50.00', '49.50'), '−0.50秒');
  assert.equal(show('男子600m', '1:40.00', '1:38.00'), '−2秒00'); assert.equal(R.minuteStyle('', '58.10', '57.00'), false); assert.equal(R.minuteStyle('', '5:10.00', '5:00.00'), true);
});
await check('共通の部品 fmtSecDiff(d, long)：0秒00・0秒04・59秒99・60秒からは分（long でも同じ）・マイナス・long なしは今まで通り', () => {
  const f = R.fmtSecDiff;
  assert.equal(f(0, true), '0秒00'); assert.equal(f(0.04, true), '0秒04'); assert.equal(f(14.4, true), '14秒40'); assert.equal(f(59.99, true), '59秒99'); assert.equal(f(59.999, true), '1分00秒00');
  assert.equal(f(60, true), '1分00秒00'); assert.equal(f(143.35, true), '2分23秒35'); assert.equal(f(-14.4, true), '-14秒40'); assert.equal(f(null, true), '');
  assert.equal(f(14.4), '14.40秒'); assert.equal(f(0.07), '0.07秒'); assert.equal(f(143.35), '2分23秒35');
  assert.equal(R.fmtImprovement(0.2, false, true), '+0.20m');   // 距離は変わらない
});
const RECS = () => [
  rec({ event: '男子5000m', mark: '16:00.00', date: '2026-06-01', meet: '春の記録会' }), rec({ event: '男子5000m', mark: '15:45.60' }),
  rec({ event: '男子1500m', mark: '4:30.00', date: '2026-06-01', meet: '春の記録会' }), rec({ event: '男子1500m', mark: '4:27.21' }),
  rec({ event: '男子800m', mark: '2:10.04', date: '2026-06-01', meet: '春の記録会' }), rec({ event: '男子800m', mark: '2:10.00' }),
  rec({ event: '男子100m', mark: '12.07', date: '2026-06-01', meet: '春の記録会' }), rec({ event: '男子100m', mark: '12.00' }),
  rec({ event: '男子3000mSC', mark: '20:38.05', date: '2026-06-01', meet: '春の記録会' }), rec({ event: '男子3000mSC', mark: '18:14.70' })];
await check('PBの情報（pbDetails）に long がつく：分で書く種目だけ', () => {
  const all = RECS(), pd = R.pbDetails(all), by = ev => pd[all.find(r => r.event === ev && r.meet === '架空区大会').id];
  assert.equal(by('男子5000m').long, true); assert.equal(by('男子800m').long, true); assert.equal(by('男子100m').long, false);
});
await check('大会まとめ（印刷）：PB更新「−14秒40」「−2秒79」「−0秒04」「−0.07秒」「−2分23秒35」・PBの印「PB −14秒40」「PB −0.07」', () => {
  const all = RECS(), s = P.meetSheet(R, all.filter(r => r.meet === '架空区大会'), all, { meet: '架空区大会', meetDate: '2026-09-20' });
  for (const t of ['−14秒40', '−2秒79', '−0秒04', '−0.07秒', '−2分23秒35']) assert(s.includes('lp-up">' + t + '<'), t);
  for (const t of ['PB −14秒40<', 'PB −2秒79<', 'PB −0秒04<', 'PB −0.07<', 'PB −2分23秒35<']) assert(s.includes(t), t);
  assert(!/14\.40秒|2\.79秒|0\.04秒/.test(s));
});
await check('ふりかえり：「14秒40アップ」「あと 2秒79」「あと 0秒04」・100m は「0.07秒アップ」', () => {
  const all = [
    rec({ event: '男子5000m', mark: '16:00.00', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子5000m', mark: '15:45.60' }),
    rec({ event: '男子1500m', mark: '4:27.21', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子1500m', mark: '4:30.00' }),
    rec({ event: '男子800m', mark: '2:10.00', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子800m', mark: '2:10.04' }),
    rec({ event: '男子100m', mark: '12.07', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子100m', mark: '12.00' })];
  const g = V.seasonRange(2026), d = V.build(R, all, R.athleteKey(all[0]), { from: g[0], to: g[1] }), s = V.sheet(R, d, {});
  assert.match(s, /昨年度まで 16:00\.00 → 14秒40アップ/); assert.match(s, /昨年度まで 4:27\.21　自己ベストまで あと 2秒79/);
  assert.match(s, /昨年度まで 2:10\.00　自己ベストまで あと 0秒04/); assert.match(s, /昨年度まで 12\.07 → 0\.07秒アップ/);
});
// 記録のページ（ホームの「PB更新」の一覧）：実際の画面で
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : p.endsWith('.json') ? 'application/json' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
try {
  await check('記録のページ：ホームのPB更新「前のベスト 16:00.00 −14秒40」「−2秒79」「−0秒04」「−0.07秒」「−2分23秒35」', async () => {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
    await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort());
    await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('__i')) { localStorage.clear(); sessionStorage.setItem('__i', '1'); } localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); });
    await p.goto(B + 'records.html', { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 900));
    await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
    const f = path.join(fs.mkdtempSync('/tmp/v02666-'), 'synth.json'); fs.writeFileSync(f, JSON.stringify({ records: RECS() }));
    await (await p.$('#rbImport')).uploadFile(f); await p.waitForFunction(() => document.querySelectorAll('.pblist li').length >= 5, { timeout: 15000 });
    const L = await p.evaluate(() => [...document.querySelectorAll('.pblist li .prev')].map(e => e.textContent.trim()));
    for (const t of ['前のベスト 16:00.00−14秒40', '前のベスト 4:30.00−2秒79', '前のベスト 2:10.04−0秒04', '前のベスト 12.07−0.07秒', '前のベスト 20:38.05−2分23秒35']) assert(L.includes(t), t + ' / ' + JSON.stringify(L));
    if (SHOT) { await p.evaluate(() => { const e = document.querySelector('.pblist'); e.scrollIntoView({ block: 'center' }); }); await new Promise(r => setTimeout(r, 300)); await p.screenshot({ path: SHOT }); }
    await p.close();
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
