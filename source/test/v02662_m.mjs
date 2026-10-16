// v0.26.62 跳躍・投てきの記録と差に「m」を付けて見せる（表示だけ。保存した記録・ID・書き出しは変えない）。走る種目はそのまま。架空データのみ・外には通信しない
//   node v02662_m.mjs [スクショの保存先（PNG）]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import {JSDOM, VirtualConsole} from 'jsdom'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), req = createRequire(import.meta.url), SHOT = process.argv[2] || '';
const R = req('../src/results.js'); globalThis.ResultParser = R; const P = req('../src/print.js'); globalThis.LanePrint = P; const V = req('../src/review.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.62] 跳躍・投てきは m を付けて表示');
const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子走幅跳', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '6.00', wind: '+0.5', bib: '', lane: '', rank: 1, comment: '' }, o); r.id = R.recId(r.meet, r.date, r); return r; };
const noMM = s => assert.doesNotMatch(s, /\dmm|m m\b/, '「mm」にならない');

await check('showMark：跳躍・投てきの「5.80」「5.8」「1.75」「12.40」は m 付き。「5m80」「5.80m」・記号・得点・走る種目はそのまま', () => {
  const S = R.showMark;
  assert.equal(S('5.80', '男子走幅跳'), '5.80m'); assert.equal(S('5.8', '女子三段跳'), '5.8m'); assert.equal(S('1.75', '男子走高跳'), '1.75m'); assert.equal(S('3.20', '男子棒高跳'), '3.20m');
  assert.equal(S('12.40', '男子砲丸投'), '12.40m'); assert.equal(S('45.30', '女子円盤投'), '45.30m'); assert.equal(S('38.10', '中学女子ジャベリックスロー'), '38.10m'); assert.equal(S('５．８０', '男子走幅跳'), '5.80m');
  for (const m of ['5m80', '5.80m', 'NM', '×', '記録なし', '', 'DNS']) assert.equal(S(m, '男子走幅跳'), m, m);
  assert.equal(S(S('5.80', '男子走幅跳'), '男子走幅跳'), '5.80m', '2回かけても「5.80mm」にならない');
  for (const [m, ev] of [['12.40', '男子100m'], ['2:05.30', '男子800m'], ['48.30', '男子4×100mR'], ['6012', '男子八種競技'], ['5.80', undefined]]) assert.equal(S(m, ev), m, m + ' ' + ev);
  assert.equal(S(null, '男子走幅跳'), null);
});
await check('差：距離は「+0.20m」、時間は今まで通り「−0.27秒」', () => {
  assert.equal(R.fmtImprovement(0.2, false), '+0.20m'); assert.equal(R.fmtImprovement(1.5, false), '+1.50m'); assert.equal(R.fmtImprovement(0.27, true), '−0.27秒');
});
const JUMP = () => [rec({ mark: '5.80', date: '2025-09-01', meet: '去年の大会' }), rec({ mark: '6.00' }), rec({ mark: '5m90', date: '2026-07-01', meet: '夏の大会' }), rec({ mark: 'NM', date: '2026-08-01', meet: '八月の大会' }),
  rec({ event: '男子砲丸投', mark: '9.50', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子砲丸投', mark: '9.20' }),
  rec({ event: '男子100m', mark: '12.67', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子100m', mark: '12.40' }),
  rec({ name: '架空 二郎', event: '男子走高跳', mark: '1.60', date: '2025-09-01', meet: '去年の大会', wind: '' }), rec({ name: '架空 二郎', event: '男子走高跳', mark: '1.65', wind: '' })];
await check('大会まとめ（印刷）：記録の欄「6.00m」・PBの印「PB +0.10m」・前のPB「1.60m」（「5m90」はそのまま）。走る種目は「12.40」のまま', () => {
  const all = JUMP(), recs = all.filter(r => r.meet === '架空区大会'), s = P.meetSheet(R, recs, all, { meet: '架空区大会', meetDate: '2026-09-20' });
  assert.match(s, /lp-mk">6\.00m<\/b> <span class="lp-bdg lp-bpb">PB \+0\.10m</); assert.match(s, /lp-mk">6\.00m<\/span> <span class="lp-up">\+0\.10m<\/span> <small>（前のPB 5m90）/);
  assert.match(s, /lp-mk">1\.65m<\/span> <span class="lp-up">\+0\.05m<\/span> <small>（前のPB 1\.60m）/); assert.match(s, /lp-mk">1\.65m<\/b> <span class="lp-bdg lp-bpb">PB \+0\.05m</);
  assert.match(s, /lp-mk">9\.20m</); assert.match(s, /lp-mk">12\.40<\/b>/); assert.doesNotMatch(s, /12\.40m/); noMM(s);
});
await check('個人表（印刷・PDF）：自己ベストのカード・PB・記録の表・グラフのPBの字に m', () => {
  const all = JUMP(), s = P.athleteSheet(R, all, R.athleteKey(all[0]), {});
  assert.match(s, /lp-cmk">6\.00m/); assert.match(s, /<em>PB 6\.00m<\/em>/); assert.match(s, /lp-mk lp-r">5m90/); assert.match(s, /lp-mk lp-r">5\.80m/); assert.match(s, /lp-pblab[^>]*>PB 6\.00m</);
  assert.match(s, /lp-cmk">12\.40/); assert.doesNotMatch(s, /12\.40m|12\.67m/); noMM(s);
});
await check('ふりかえり（画面・PDF）：ベスト「6.00m」・「昨年度まで 5.80m → 0.20mアップ」・「あと 0.30m」・大会の欄も m', () => {
  const all = JUMP(), g = V.seasonRange(2026), d = V.build(R, all, R.athleteKey(all[0]), { from: g[0], to: g[1] }), s = V.sheet(R, d, {});
  assert.match(s, /rv-mk">6\.00m</); assert.match(s, /昨年度まで 5\.80m → 0\.20mアップ/); assert.match(s, /昨年度まで 9\.50m　自己ベストまで あと 0\.30m/);
  assert.match(s, /<b>6\.00m<\/b>/); assert.match(s, /<b>NM<\/b>/); assert.match(s, /rv-mk">12\.40</); assert.match(s, /あと 0\.27秒|0\.27秒アップ/); assert.doesNotMatch(s, /12\.40m/); noMM(s);
});
await check('部内ランキング・歴代（印刷）：跳躍は m 付き、走る種目はそのまま', () => {
  const all = JUMP(), rk = R.ranking(all, { season: 2026 }), evs = Object.keys(rk);
  const s = P.rankSheet(R, 'rank', rk, evs, ev => ev, {}); assert.match(s, /lp-mk lp-r">6\.00m</); assert.match(s, /lp-mk lp-r">12\.40</); noMM(s);
});
await check('選手の個人ページ（リンクで開く画面）：自己ベスト・参考・最近の記録・グラフに m。リンクの中身は変えない・走る種目はそのまま', () => {
  const d = new JSDOM('<div id="b"></div>', { runScripts: 'outside-only', url: 'https://example.invalid/', virtualConsole: new VirtualConsole() }), w = d.window;
  w.eval(fs.readFileSync(path.join(here, '../src/personal.js'), 'utf8') + ';window.LP=LanePersonal;');
  const o = { v: 1, k: 'pp', g: '2026-10-01', a: { name: '架空 一郎', team: '架空中', grade: '2' }, e: [
    { l: '走幅跳', lw: 0, n: 3, b: ['6.00', '+0.5', '2026-09-20', '架空区大会'], rf: ['6.10', '+2.5', '2026-08-20', '風の大会'], p: [['2025-09-01', 5.8, '5.80', '+0.5', 0], ['2026-09-20', 6, '6.00', '+0.5', 0]], x: [['2026-08-01', 'NM', '八月の大会', '決勝']], r: [['2026-09-20', '6.00', '+0.5', '架空区大会', '決勝', 'PB'], ['2026-07-01', '5m90', '', '夏の大会', '決勝', '']] },
    { l: '100m', lw: 1, n: 1, b: ['12.40', '+0.5', '2026-09-20', '架空区大会'], p: [['2026-09-20', 12.4, '12.40', '+0.5', 0]], x: [], r: [['2026-09-20', '12.40', '+0.5', '架空区大会', '決勝', 'PB']] }] };
  const raw = JSON.stringify(o), so = w.LP.sanitize(JSON.parse(raw)); w.LP.render(so, w.document.getElementById('b'), {});
  const h = w.document.getElementById('b').innerHTML;
  assert.match(h, /<b>6\.00m<\/b>/); assert.match(h, /参考 6\.10m/); assert.match(h, /<b>5m90<\/b>/); assert.match(h, /5\.80m（風/); assert.match(h, /<b>12\.40<\/b>/); assert.doesNotMatch(h, /12\.40m/); noMM(h);
  assert.equal(so.e[0].b[0], '6.00', 'リンクの中身（読んだもの）は「6.00」のまま'); assert.equal(JSON.stringify(o), raw);
});
// 記録のページ（Chrome）：ホームのPB更新・選手別・全記録・ランキング。書き出し（JSON）は保存したまま「6.00」
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
try {
  await check('記録のページ：ホーム「1.65m PB 前のベスト 1.60m +0.05m」・選手別・全記録・ランキングに m／走る種目はそのまま／書き出しは「6.00」のまま', async () => {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
    await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort());
    await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('__i')) { localStorage.clear(); sessionStorage.setItem('__i', '1'); } localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); });
    await p.goto(B + 'records.html', { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 900));
    await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
    const f = path.join(fs.mkdtempSync('/tmp/v02662-'), 'synth.json'); fs.writeFileSync(f, JSON.stringify({ records: JUMP() }));
    await (await p.$('#rbImport')).uploadFile(f); await p.waitForFunction(() => document.querySelectorAll('.pblist li').length >= 2, { timeout: 15000 });
    const home = await p.evaluate(() => [...document.querySelectorAll('.pblist li')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    assert(home.some(t => /走幅跳6\.00mPB前のベスト 5m90\+0\.10m$/.test(t)), JSON.stringify(home)); assert(home.some(t => /走高跳1\.65mPB前のベスト 1\.60m\+0\.05m$/.test(t)), JSON.stringify(home)); assert(home.some(t => /100m12\.40PB前のベスト 12\.67−0\.27秒$/.test(t)), JSON.stringify(home));
    if (SHOT) { await p.evaluate(() => document.querySelector('.pblist').scrollIntoView({ block: 'center' })); await new Promise(r => setTimeout(r, 300)); }
    const tab = async v => { await p.evaluate(v => document.querySelector('.tabs [data-v="' + v + '"]').click(), v); await new Promise(r => setTimeout(r, 600)); return p.evaluate(() => document.getElementById('rbView').innerText); };
    const ath = await tab('ath'); assert.match(ath, /6\.00m/); assert.match(ath, /12\.40/); assert.doesNotMatch(ath, /12\.40m|\dmm/);
    await p.evaluate(() => { const x = document.querySelector('#rbView [data-ath], #rbView .athlink, #rbView a[href*="athlete="]'); if (x) x.click(); }); await new Promise(r => setTimeout(r, 700));
    await p.evaluate(() => { const x = [...document.querySelectorAll('#rbView [data-athev]')].find(e => /走幅跳/.test(e.getAttribute('data-athev'))); if (x) x.click(); }); await new Promise(r => setTimeout(r, 700));
    const one = await p.evaluate(() => document.getElementById('rbView').innerText);
    assert.match(one, /6\.00m/); assert.match(one, /5\.80m/); assert.match(one, /5m90/); assert.doesNotMatch(one, /\dmm|12\.40m/);
    if (SHOT) { await p.evaluate(() => window.scrollTo(0, document.getElementById('rbView').getBoundingClientRect().top + scrollY - 60)); await new Promise(r => setTimeout(r, 300)); await p.screenshot({ path: SHOT }); }
    const allv = await tab('all'); assert.match(allv, /5\.80m/); assert.match(allv, /9\.50m/); assert.match(allv, /12\.67/); assert.doesNotMatch(allv, /12\.67m|\dmm/);
    let rank = await tab('rank');
    await p.evaluate(() => { const sel = [...document.querySelectorAll('#rbView select')].find(x => [...x.options].some(o => /走幅跳/.test(o.textContent))); if (sel) { sel.value = [...sel.options].find(o => /走幅跳/.test(o.textContent)).value; sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
      const bt = [...document.querySelectorAll('#rbView button')].find(x => /走幅跳/.test(x.textContent)); if (bt) bt.click(); }); await new Promise(r => setTimeout(r, 600));
    rank = await p.evaluate(() => document.getElementById('rbView').innerText); assert.match(rank, /6\.00m/); assert.doesNotMatch(rank, /\dmm/);
    await p.evaluate(() => { window.__blobs = []; const o = URL.createObjectURL; URL.createObjectURL = b => { window.__blobs.push(b); return o.call(URL, b); }; HTMLAnchorElement.prototype.click = function () {}; document.getElementById('rbExport').click(); });
    await new Promise(r => setTimeout(r, 500));
    const ex = JSON.parse(await p.evaluate(() => window.__blobs[0].text())).records;
    assert.deepEqual(ex.filter(r => /跳|砲丸/.test(r.event)).map(r => r.mark).sort(), ['1.60', '1.65', '5.80', '5m90', '6.00', '9.20', '9.50', 'NM'], '書き出しは保存したまま');
    assert.deepEqual(ex.map(r => r.id).sort(), JUMP().map(r => r.id).sort(), 'IDも変わらない');
    await p.close();
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
