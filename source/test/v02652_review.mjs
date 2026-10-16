// v0.26.52 今年のふりかえりシート（選手1人＝A4 1枚）。架空データのみ・外のネットワークには出ない。
// 前半：関数（LaneReview.build / sheet / 一言の保存）。後半：実際の records.html（Chrome）で、選ぶ画面・画面で見る・印刷（A4 1人1ページ）
// SAMPLES=<フォルダ> を付けると、スマホの画面の絵（PNG）と A4 の PDF をそのフォルダに書き出す
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {makeRecords} from './review_data.mjs';
import {loadPages} from './load.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), req = createRequire(import.meta.url);
const R = req('../src/results.js'); globalThis.ResultParser = R; const P = req('../src/print.js'); globalThis.LanePrint = P; const V = req('../src/review.js'); const A = req('../src/auth_common.js');
const SAMPLES = process.env.SAMPLES || '';
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.52] 今年のふりかえりシート');
const ALL = makeRecords(R), F = '2026-04-01', T = '2027-03-31';
const key = n => V.athletes(R, ALL, F, T).find(a => a.name === n).key;
const B1 = () => V.build(R, ALL, key('架空 一郎'), { from: F, to: T });

await check('期間：年度は4月1日〜翌3月31日・表示は「2026年度」、ほかの期間は日付', () => {
  assert.deepEqual(V.seasonRange(2026), ['2026-04-01', '2027-03-31']);
  assert.equal(V.periodLabel(F, T), '2026年度'); assert.equal(V.periodLabel('2026-04-01', '2026-10-31'), '2026.04.01〜2026.10.31');
});
await check('選ぶ一覧：期間の中に記録がある選手だけ（リレーのチームは選手にしない）・大会数・最新の学年', () => {
  const ls = V.athletes(R, ALL, F, T);
  assert.deepEqual(ls.map(a => a.name).sort(), ['架空 一郎', '見本 二郎', '松﨑 健', '試験 三郎'].sort());
  assert.ok(!ls.some(a => /リレー/.test(a.name)));
  const a = ls.find(x => x.name === '架空 一郎'); assert.equal(a.grade, '2'); assert.equal(a.nMeets, 5);   // 支部予選の2日間は1大会
  assert.equal(V.athletes(R, ALL, '2025-04-01', '2026-03-31').length, 2);
});
await check('期間のベスト：公認と参考（追い風2.0m超）を分ける・風を出す・期間の外の記録は入れない', () => {
  const d = B1(), e = d.events.find(x => /100m/.test(x.eventLabel));
  assert.equal(e.best.mark, '11.69'); assert.equal(e.ref.mark, '11.55');
  assert.equal(e.n, 5);
  const s = V.sheet(R, d, { school: '架空第一高', date: '2026-10-16' });
  assert.match(s, /11\.69<\/b><span class="rv-bdg rv-ok">公認<\/span><small>風\+0\.9<\/small>/);
  assert.match(s, /11\.55<\/b><span class="rv-bdg rv-ref">参考<\/span><small>風\+2\.8<\/small>/);
  assert.doesNotMatch(s, /12\.02|24\.10<\/b>/);   // 前の年度の記録はベストの欄に出さない
});
await check('昨年度からの伸び：前の年度までの公認ベストより良ければ「昨年度まで 11.86 → 0.17秒アップ」・距離は「昨年度まで 1m75 → 0.09mアップ」', () => {
  const s = V.sheet(R, B1(), {});
  assert.match(s, /<th>昨年度からの伸び<\/th>/); assert.doesNotMatch(s, /これまでとくらべて/);
  assert.match(s, /昨年度まで 11\.86 → 0\.17秒アップ<\/span><small>自己ベスト更新（前は 2025\.09\.20）/);
  assert.match(s, /→ 0\.32秒アップ/); assert.doesNotMatch(s, /アップ[^<]*[−+]|[−+]0\.\d+秒アップ/);
  const t = V.sheet(R, V.build(R, ALL, key('試験 三郎'), { from: F, to: T }), {});
  assert.match(t, /昨年度まで 1m75 → 0\.09mアップ<\/span>/);
});
await check('前の記録が無いときは数字を作らない（「昨年度までの記録なし」）・PB更新と初記録の印・回数', () => {
  const d = V.build(R, ALL, key('見本 二郎'), { from: F, to: T }), s = V.sheet(R, d, {});
  assert.equal(d.events.every(e => !e.prev && e.diff == null), true);
  assert.match(s, /昨年度までの記録なし/); assert.doesNotMatch(s, /この期間がはじめて|初めての記録|昨年度まで |アップ<|あと /);
  assert.equal(d.counts.pb, 2); assert.match(s, /rv-kpb"><b>2<\/b><span>自己ベスト更新/);
  assert.match(s, /自己ベスト更新 ×2<\/span>/); assert.match(s, /rv-bfs">初記録/);
});
await check('期間のベストが前の自己ベストに届かないとき：「自己ベストまで あと …」（マイナスの印は付けない）', () => {
  const recs = [{ name: '例題 太郎', team: '架空第一高', event: '男子100m', mark: '11.80', wind: '+0.5', date: '2026-03-01', meet: '前の大会' }, { name: '例題 太郎', team: '架空第一高', event: '男子100m', mark: '11.95', wind: '+0.5', date: '2026-05-01', meet: '今の大会' }].map(r => (r.id = R.recId(r.meet, r.date, r), r));
  const s = V.sheet(R, V.build(R, recs, R.athleteKey(recs[0]), { from: F, to: T }), {});
  assert.match(s, /昨年度まで 11\.80　自己ベストまで あと 0\.15秒/); assert.doesNotMatch(s, /自己ベスト更新 |アップ</);
});
await check('昨年度からの伸び：前の自己ベストと同じなら「昨年度まで 11.80　自己ベストと同じ記録」・公認の前の記録が無ければ「昨年度までの公認記録なし」（数字は作らない）', () => {
  const recs = [{ name: '例題 太郎', team: '架空第一高', event: '男子100m', mark: '11.80', wind: '+0.5', date: '2026-03-01', meet: '前の大会' }, { name: '例題 太郎', team: '架空第一高', event: '男子100m', mark: '11.80', wind: '+0.5', date: '2026-05-01', meet: '今の大会' }];
  const s = V.sheet(R, V.build(R, recs, R.athleteKey(recs[0]), { from: F, to: T }), {});
  assert.match(s, /rv-eq">昨年度まで 11\.80　自己ベストと同じ記録<\/span>/); assert.doesNotMatch(s, /アップ</);
  const r2 = [{ name: '例題 太郎', team: '架空第一高', event: '男子100m', mark: '11.70', wind: '+3.1', date: '2026-03-01', meet: '前の大会' }, { name: '例題 太郎', team: '架空第一高', event: '男子100m', mark: '11.90', wind: '+0.5', date: '2026-05-01', meet: '今の大会' }];
  const s2 = V.sheet(R, V.build(R, r2, R.athleteKey(r2[0]), { from: F, to: T }), {});
  assert.match(s2, /rv-new">昨年度までの公認記録なし<\/span>/); assert.doesNotMatch(s2, /昨年度まで |アップ</);
});
await check('出場した大会：何日かある大会は1行（5/3〜5/4）・ラウンド・組と着・PBの印・DNSは灰色', () => {
  const d = B1(), s = V.sheet(R, d, {});
  assert.equal(d.meets.length, 5); assert.match(s, /5\/3〜5\/4<\/td><td class="rv-mt">架空県 高校総体 支部予選/);
  assert.match(s, /予選<\/em> <b>11\.74<\/b><small>（風\+1\.5）<\/small> <small>1組2着<\/small>/);
  assert.match(s, /決勝<\/em> <b>11\.69<\/b><small>（風\+0\.9）<\/small> <small>3位<\/small><span class="rv-bdg rv-bpb">PB/);
  assert.match(s, /rv-it rv-nm"><em>[^<]*200m・予選<\/em> <b>DNS<\/b><\/span>/);
});
await check('リレー：走順に名前がある記録だけ（自分の走順を太字）・名字だけ「松崎」は同じ名字が1人なら松﨑 健・前の年度は出さない', () => {
  const d = B1(); assert.equal(d.relays.length, 3); assert.deepEqual(d.relays.map(x => x.leg), [2, 2, 4]);
  const s = V.sheet(R, d, {}); assert.match(s, /<b>2走 架空 一郎<\/b>/); assert.doesNotMatch(s, /45\.01/);
  const m = V.build(R, ALL, key('松﨑 健'), { from: F, to: T }); assert.equal(m.relays.length, 3);
  // 同じ名字の選手がもう1人いると、名字だけの走順は決めない
  const more = ALL.concat([{ name: '松崎 大地', team: '架空第一高', event: '男子100m', mark: '12.50', wind: '+0.1', date: '2026-06-14', meet: '架空区 夏季大会' }].map(r => (r.id = R.recId(r.meet, r.date, r), r)));
  assert.equal(V.build(R, more, key('松﨑 健'), { from: F, to: T }).relays.length, 1);
  // ほかの学校のリレーは出さない
  const other = R.relayRecord({ event: '男子4×100mR', team: '架空第二高', mark: '45.50', date: '2026-06-14', meet: '架空区 夏季大会', legs: ['架空 一郎', 'b c', 'd e', 'f g'] }).rec;
  assert.equal(V.build(R, ALL.concat([other]), key('架空 一郎'), { from: F, to: T }).relays.length, 3);
});
await check('入れないもの：記録の備考（体調メモなど）・会話。名前などはエスケープ', () => {
  const s = V.sheet(R, B1(), { note: '<img src=x onerror=1>よく頑張りました' });
  assert.doesNotMatch(s, /体調|寝不足|やり取り/); assert.doesNotMatch(s, /<img/); assert.match(s, /&lt;img src=x onerror=1&gt;よく頑張りました/);
  const bad = [{ name: '<b>x</b> y', team: '"><script>', event: '男子100m', mark: '12.00', wind: '+0.1', date: '2026-05-01', meet: '<i>m</i>' }].map(r => (r.id = R.recId(r.meet, r.date, r), r));
  const t = V.sheet(R, V.build(R, bad, R.athleteKey(bad[0]), { from: F, to: T }), { school: '<u>' });
  assert.doesNotMatch(t, /<b>x|<script|<i>m|<u>/);
});
await check('シートの形：紺の帯（LANE NOTE ・ ふりかえり）・名前・学校・学年・年度・グラフ（主な種目・最大4つ）・先生から一言（空なら手書きの線）', () => {
  const s = V.sheet(R, B1(), { school: '架空第一高', date: '2026-10-16' });
  assert.match(s, /^<section class="lp-page rv-page[^"]*" data-rv="/); assert.match(s, /LANE NOTE ・ ふりかえり/); assert.match(s, /架空 一郎/); assert.match(s, /<i>2年<\/i>/); assert.match(s, /<i>2026年度<\/i>/); assert.match(s, /出力日 2026-10-16/);
  assert.match(s, /2026年度　今年のふりかえり/); assert.equal((s.match(/<svg class="lp-svg"/g) || []).length, 2);   // 200m は記録が1つ（とDNS）なのでグラフにしない
  assert.match(s, /先生から一言<\/div><div class="rv-lines"/);
  assert.doesNotMatch(s, /<button|<input|<textarea/);
  const t = V.build(R, ALL, key('試験 三郎'), { from: F, to: T }); assert.ok(t.charts.length <= 4); assert.match(V.sheet(R, t, {}), /rv-page rv-dense2?"/);
});
await check('期間に記録が無い選手は null（空のページを作らない）', () => { assert.equal(V.build(R, ALL, key('見本 二郎'), { from: '2025-04-01', to: '2026-03-31' }), null); });
await check('先生から一言：この端末にだけ保存・アカウントごとのキー・300文字まで・空にすると消える・ログアウトで消すキーに入っている', () => {
  const store = {}; globalThis.localStorage = { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  V.noteSet('u1', 'k1', F, T, 'よく頑張りました'); V.noteSet(null, 'k1', F, T, 'ゲスト');
  assert.equal(V.noteGet('u1', 'k1', F, T), 'よく頑張りました'); assert.equal(V.noteGet(null, 'k1', F, T), 'ゲスト'); assert.equal(V.noteGet('u2', 'k1', F, T), ''); assert.equal(V.noteGet('u1', 'k1', '2025-04-01', '2026-03-31'), '');
  V.noteSet('u1', 'k2', F, T, 'あ'.repeat(500)); assert.equal(V.noteGet('u1', 'k2', F, T).length, 300);
  V.noteSet('u1', 'k1', F, T, '  '); V.noteSet('u1', 'k2', F, T, ''); assert.equal(store['lanenote-review-notes-u1'], undefined);
  assert.ok(A.userKeys('u1').includes('lanenote-review-notes-u1'));
  delete globalThis.localStorage;
});
const src = f => fs.readFileSync(path.join(here, '../src', f), 'utf8');
await check('入口：「1年分の記録をまとめる」の保存のあと・選手別の一覧・選手のページ。ルール・Worker は変えていない', () => {
  const a = src('records_app.js');
  assert.match(a, /<button type="button" class="btn" data-ybreview="1">📝 ふりかえりシートを作る<\/button>/);
  assert.match(a, /ppBtns\('rpick', '', 'ふりかえりシート（選手を選ぶ）'\)/); assert.match(a, /ppBtns\('review', key, 'ふりかえりシート'\)/);
  assert.match(fs.readFileSync(path.join(here, '../build.py'), 'utf8'), /text\('src\/print\.js'\) \+ '\\n' \+ text\('src\/review\.js'\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'records.html'), 'utf8'), /var LaneReview = \(function/);
});

/* ---------- Chrome：実際の records.html ---------- */
const TYPE = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript' };
const srv = http.createServer((q, s) => { const f = decodeURIComponent(q.url.split(/[?#]/)[0]), p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': TYPE[path.extname(p)] || 'application/octet-stream' }); let d = fs.readFileSync(p); if (/records\.html$/.test(p)) d = Buffer.from(String(d).replace('if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }', 'window.__t={putMany,scope,reload,setTab:v=>{setTab(v);render();}};renderAuth();').replace('  msOpenFromQuery();', '')); s.end(d); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
const puppeteer = req('puppeteer-core'); const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=ja-JP', '--font-render-hinting=none'] });
const sl = ms => new Promise(r => setTimeout(r, ms));
async function open(vp) {
  const p = await br.newPage(); await p.setBypassServiceWorker(true); await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(BASE) ? r.continue() : r.abort());
  p.on('dialog', d => d.accept());
  await p.setViewport(vp); await p.goto(BASE + 'guide.html'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', 'coach'); });
  await p.goto(BASE + 'records.html', { waitUntil: 'domcontentloaded' }); await sl(700);
  const recs = makeRecords(R);
  await p.evaluate(async recs => { document.getElementById('rbSchool').value = '架空第一高'; await window.__t.putMany(recs, window.__t.scope()); await window.__t.reload(window.__t.scope()); window.__t.setTab('ath'); }, recs); await sl(400);
  return p;
}
const SP = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
try {
  const p = await open(SP);
  await check('選手別の一覧に「ふりかえりシート（選手を選ぶ）」の3つのボタン（画面で見る・PDF作成・印刷）', async () => {
    const n = await p.evaluate(() => document.querySelectorAll('#rbView [data-print="rpick"]').length); assert.equal(n, 3);
  });
  await check('選ぶ画面：期間（今の年度が選ばれている）・全員選択／全解除・人数・一言の欄', async () => {
    await p.evaluate(() => document.querySelector('#rbView [data-print="rpick"][data-act="view"]').click()); await sl(300);
    const st = await p.evaluate(() => { const b = document.getElementById('rbPrintBody'); return { open: !document.getElementById('rbPrint').hidden, sel: b.querySelector('[data-rvseason]').value, from: b.querySelector('[data-rvfrom]').value, to: b.querySelector('[data-rvto]').value, n: b.querySelectorAll('[data-rvk]').length, cnt: document.getElementById('rbRVn').textContent, notes: b.querySelectorAll('textarea[data-rvnote]').length, pdfHidden: document.getElementById('rbPrintPdf').hidden }; });
    assert.equal(st.open, true); assert.equal(st.sel, '2026'); assert.equal(st.from, '2026-04-01'); assert.equal(st.to, '2027-03-31'); assert.equal(st.n, 4); assert.equal(st.cnt, '4'); assert.equal(st.notes, 4); assert.equal(st.pdfHidden, true);
    await p.evaluate(() => document.querySelector('[data-rvnone]').click()); assert.equal(await p.evaluate(() => document.getElementById('rbRVn').textContent), '0');
    await p.evaluate(() => document.querySelector('[data-rvall]').click()); assert.equal(await p.evaluate(() => document.getElementById('rbRVn').textContent), '4');
  });
  if (SAMPLES) { fs.mkdirSync(SAMPLES, { recursive: true }); await p.screenshot({ path: path.join(SAMPLES, 'review_pick_phone.png') }); }
  await check('一言を入れると、この端末（localStorage）にだけ入り、シートに出る', async () => {
    await p.evaluate(() => { const li = [...document.querySelectorAll('#rbPrintBody li')].find(l => /架空 一郎/.test(l.textContent)); li.querySelector('details').open = true; const t = li.querySelector('textarea'); t.value = '春から大きく伸びました。来年も楽しみです！'; t.dispatchEvent(new Event('input', { bubbles: true })); });
    const ls = await p.evaluate(() => localStorage.getItem('lanenote-review-notes')); assert.match(ls, /春から大きく伸びました/);
  });
  await check('期間を前の年度にすると、その年度に記録がある選手だけになる', async () => {
    await p.evaluate(() => { const s = document.querySelector('[data-rvseason]'); s.value = '2025'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sl(200);
    assert.equal(await p.evaluate(() => document.querySelectorAll('#rbPrintBody [data-rvk]').length), 2);
    await p.evaluate(() => { const s = document.querySelector('[data-rvseason]'); s.value = '2026'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sl(200);
    assert.equal(await p.evaluate(() => document.querySelectorAll('#rbPrintBody [data-rvk]').length), 4);
  });
  await check('画面で見る：選んだ人数だけシート（1人1枚）・一言が入る・印刷とPDF作成のボタンが出る・スマホの幅に収まる', async () => {
    await p.evaluate(() => { [...document.querySelectorAll('#rbPrintBody [data-rvk]')].forEach(c => { c.checked = !/松崎|松﨑/.test(c.closest('li').textContent); }); document.querySelector('[data-rvmake]').click(); }); await sl(500);
    const st = await p.evaluate(() => ({ pages: document.querySelectorAll('#rbPrintBody .rv-page').length, note: /春から大きく伸びました/.test(document.getElementById('rbPrintBody').textContent), pdf: !document.getElementById('rbPrintPdf').hidden, go: !document.getElementById('rbPrintGo').hidden, sw: document.getElementById('rbPrint').scrollWidth, cw: document.getElementById('rbPrint').clientWidth }));
    assert.equal(st.pages, 3); assert.equal(st.note, true); assert.equal(st.pdf && st.go, true); assert.ok(st.sw <= st.cw + 1, '横にはみ出さない ' + st.sw + '/' + st.cw);
  });
  if (SAMPLES) {
    await p.evaluate(() => { const pg = [...document.querySelectorAll('#rbPrintBody .rv-page')].find(x => /架空 一郎/.test(x.querySelector('.lp-big').textContent)); pg.scrollIntoView({ block: 'start' }); document.getElementById('rbPrint').scrollBy(0, -128); }); await sl(200);
    await p.screenshot({ path: path.join(SAMPLES, 'review_phone.png') });
    const full = await p.evaluate(() => { const pg = [...document.querySelectorAll('#rbPrintBody .rv-page')].find(x => /架空 一郎/.test(x.querySelector('.lp-big').textContent)); const r = pg.getBoundingClientRect(); return { y: pg.offsetTop, h: r.height }; });
    await p.evaluate(() => { document.getElementById('rbPrint').style.position = 'absolute'; document.getElementById('rbPrint').style.overflow = 'visible'; }); await sl(100);
    const box = await p.evaluate(() => { const pg = [...document.querySelectorAll('#rbPrintBody .rv-page')].find(x => /架空 一郎/.test(x.querySelector('.lp-big').textContent)); const r = pg.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
    await p.screenshot({ path: path.join(SAMPLES, 'review_phone_full.png'), clip: { x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4), width: Math.min(390, box.w + 8), height: box.h + 8 }, captureBeyondViewport: true });
    await p.evaluate(() => { document.getElementById('rbPrint').style.position = ''; document.getElementById('rbPrint').style.overflow = ''; });
  }
  await p.close();
  const q = await open({ width: 1200, height: 900, deviceScaleFactor: 1 });
  await check('印刷（A4）：1人1ページ（大会がとても多い選手も1枚に入る）', async () => {
    await q.evaluate(() => document.querySelector('#rbView [data-print="rpick"][data-act="view"]').click()); await sl(300);
    await q.evaluate(() => { const li = [...document.querySelectorAll('#rbPrintBody li')].find(l => /架空 一郎/.test(l.textContent)); const t = li.querySelector('textarea'); t.value = '春から大きく伸びました。来年も楽しみです！'; t.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-rvmake]').click(); }); await sl(500);
    const n = await q.evaluate(() => document.querySelectorAll('#rbPrintBody .rv-page').length); assert.equal(n, 4);
    const pdf = await q.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const f = path.join(SAMPLES || '/tmp', SAMPLES ? 'review_sheets_A4.pdf' : 'v02652_review.pdf'); fs.writeFileSync(f, pdf);
    const pages = await loadPages(f); assert.equal(pages.length, 4, 'ページ数 ' + pages.length);
    pages.forEach((pg, i) => { assert.ok(Math.abs(pg.width - 595.3) < 2 && Math.abs(pg.height - 841.9) < 2, 'A4'); });
    const txt = pages.map(pg => pg.items.map(i => i.str).join('').normalize('NFKC').replace(/\s/g, ''));   // 漢字が康煕部首（⼀ など）で出ることがあるので NFKC
    const seen = () => txt.map(t => t.slice(0, 160)).join(' ‖ ');
    assert.ok(txt.some(t => /LANENOTE.ふりかえり/.test(t) && /架空一郎/.test(t) && /先生から一言/.test(t) && /春から大きく伸びました/.test(t)), seen());
    assert.ok(txt.some(t => /試験三郎/.test(t) && /16出場した大会/.test(t) && /先生から一言/.test(t) && /架空区秋季大会/.test(t)), '大会が多い選手も1枚（最後の大会と一言の枠が同じページ） ' + seen());
    assert.ok(txt.every(t => !/体調|寝不足/.test(t))); assert.ok(txt.every(t => /LANENOTE.ふりかえり/.test(t) && /今年のふりかえり/.test(t) && /先生から一言/.test(t)), 'どのページにも帯と一言の枠（はみ出しのページが無い） ' + seen());
  });
  await check('選手のページから1人分（今の年度）', async () => {
    await q.evaluate(() => document.getElementById('rbPrintClose').click()); await sl(200);
    await q.evaluate(() => { window.__t.setTab('ath'); [...document.querySelectorAll('#rbView a.ath')].find(a => /見本 二郎/.test(a.textContent)).click(); }); await sl(400);
    const n = await q.evaluate(() => document.querySelectorAll('#rbView [data-print="review"]').length); assert.equal(n, 3);
    await q.evaluate(() => document.querySelector('#rbView [data-print="review"][data-act="view"]').click()); await sl(400);
    const st = await q.evaluate(() => ({ pages: document.querySelectorAll('#rbPrintBody .rv-page').length, name: document.querySelector('#rbPrintBody .lp-big').textContent }));
    assert.equal(st.pages, 1); assert.match(st.name, /見本 二郎/);
  });
  await q.close();
} finally { await br.close(); srv.close(); }
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
