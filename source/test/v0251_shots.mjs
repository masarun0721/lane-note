// マニュアル（guide.html#manual）の絵を撮る（v0.25.1 で作り、v0.25.3 で「実際のページ全体」に拡張）。
// ・データはすべて架空（名前は「架空 一郎」など、学校は「架空第一中」）。外のネットワークには出ない。
// ・できあがるものの絵：source/img/manual/<name>_pc.webp（1280×800）と <name>_sp.webp（412×915）
// ・画面ごとのボタンの絵：source/img/manual/btn_*.webp
// 使い方（重いので分けられる）：
//   node v0251_shots.mjs                 … 全部
//   node v0251_shots.mjs use_meet use_check … 名前を指定したものだけ
//   node v0251_shots.mjs --guide /workspace/lane_note_shots … マニュアルのスクショ（PC・スマホ）だけ
// 撮ったあとは python3 build.py --out .. で img/manual/ に写す（guide.html には埋め込まない）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), IMG = path.join(ROOT, 'source/img/manual');
const args = process.argv.slice(2), gi = args.indexOf('--guide'), GUIDE_OUT = gi >= 0 ? args[gi + 1] : '', ONLY = args.filter((a, i) => !a.startsWith('--') && !(gi >= 0 && i === gi + 1));
const want = n => gi < 0 && (!ONLY.length || ONLY.includes(n));
fs.mkdirSync(IMG, { recursive: true });
const TYPE = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.webp': 'image/webp' };
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPE[path.extname(p)] || 'application/octet-stream' }); let d = fs.readFileSync(p); if (/records\.html$/.test(p) && /[?&]demo=1/.test(q.url)) d = Buffer.from(String(d).replace('if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }', 'window.__t={putMany,scope,reload,setTab:v=>{setTab(v);render();}};renderAuth();').replace('  msOpenFromQuery();', '')); s.end(d); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--font-render-hinting=none'], timeout: 120000, protocolTimeout: 180000 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PC = { width: 1280, height: 800, deviceScaleFactor: 1 }, SP = { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, MINI = { width: 390, height: 760, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
async function open(pg, mode, vp, pre) {
  const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) ? r.continue() : r.abort());
  await p.setViewport(vp); await p.goto(B + 'guide.html'); await p.evaluate(m => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('lanenote.mode.v1', m); }, mode);
  if (pre) await pre(p);
  await p.goto(B + pg, { waitUntil: 'domcontentloaded' }); await sleep(600);
  await p.addStyleTag({ content: '.status.ng,#rbAuthMsg .ng,p.ng{display:none!important}' }).catch(() => {});   // 外につながないので出る「部品を読み込めません」は絵に入れない
  return p;
}
async function snap(p, file, q = 55) { await sleep(300); await p.screenshot({ path: path.join(IMG, file + '.webp'), type: 'webp', quality: q }); console.log('  img', file); }
const N = ['架空 一郎', '見本 二郎', '試験 三郎', '仮名 四郎', '例示 花子', '模擬 葉子', '空想 太一', '想定 美咲'];
// 大会準備：架空の大会（スタートリスト・タイムテーブルの読み取り結果を入れる）
async function meet(p) {
  await p.evaluate(N => {
    const A = window.__meetApp, entries = [], ev = [['男子中学共通 100m', '予選', '9:30', 'レーン'], ['男子中学共通 走幅跳', '決勝', '10:00', '試技順'], ['女子中学共通 200m', '予選', '11:00', 'レーン'], ['女子中学共通 800m', 'タイムレース', '13:00', 'レーン'], ['男子中学共通 1500m', 'タイムレース', '13:40', 'レーン'], ['女子中学共通 走高跳', '決勝', '10:30', '試技順']];
    N.forEach((n, i) => { const girl = /花子|葉子|美咲/.test(n); [0, 1].forEach(k => { const e = ev.filter(x => x[0].startsWith(girl ? '女子' : '男子'))[(i + k) % 3]; entries.push({ team: '架空第一中', event: e[0], round: e[1], heat: 1 + i % 3, pos: 2 + i % 7, posKind: e[3], bib: String(101 + i), name: n, grade: String(1 + i % 3), page: 1 }); }); });
    const tt = ev.map(e => { const m = /^(男子|女子)中学共通 (.+)$/.exec(e[0]); return { event: m[2], gender: m[1], cat: '中学共通', round: e[1], time: e[2] }; });
    document.getElementById('school').value = '架空第一'; Object.assign(A.state, { sl: { format: 'startlist', hasTimes: false, warnings: [], diag: [], entries, relays: [] }, tt, teams: ['架空第一中'], slName: '架空大会_スタートリスト.pdf', ttName: '架空大会_タイムテーブル.pdf' });
    document.getElementById('meetName').value = '第1回 架空区中学校陸上競技大会'; document.getElementById('meetDate').value = '2026年10月25日';
    A.updateTeams(); A.render();
  }, N); await sleep(500);
}
// 記録：架空の記録（3大会・男女・いくつかの種目）
async function recs(p) {
  await p.evaluate(async N => {
    const R = window.ResultParser, out = [], meets = [['2026-05-10', '架空区 春季記録会'], ['2026-07-20', '架空区 夏季大会'], ['2026-10-11', '架空区 秋季大会']];
    const add = o => { const r = Object.assign({ team: '架空第一中', wind: '' }, o); r.id = R.recId(r.meet, r.date, r); out.push(r); };
    N.forEach((n, i) => { const girl = /花子|葉子|美咲/.test(n), g = String(1 + i % 3); meets.forEach(([d, m], k) => {
      add({ name: n, event: girl ? '中学共通女子100m' : '中学共通男子100m', mark: ((girl ? 13.6 : 12.5) + i * 0.12 - k * 0.15).toFixed(2), wind: ['+0.4', '-0.2', '+1.1'][k], grade: g, rank: String(1 + (i + k) % 6), date: d, meet: m });
      if (i % 2 === 0) add({ name: n, event: girl ? '中学共通女子走幅跳' : '中学共通男子走幅跳', mark: ((girl ? 4.2 : 5.1) + k * 0.12 - i * 0.03).toFixed(2).replace('.', 'm'), wind: '+0.8', grade: g, rank: String(2 + k), date: d, meet: m }); }); });
    document.getElementById('rbSchool').value = '架空第一中'; await window.__t.putMany(out, window.__t.scope()); await window.__t.reload(window.__t.scope());
  }, N); await sleep(500);
}
async function both(name, setup) {
  if (!want(name)) return;
  for (const [suf, vp] of [['pc', PC], ['sp', SP]]) { const p = await setup(vp); try { await p.evaluate(() => { if (!window.__keepScroll) scrollTo(0, 0); }); await snap(p, name + '_' + suf); } catch (e) { console.log('  NG', name, suf, e.message); } await p.close(); }
}
// 1 時間表・記録用紙
await both('use_meet', async vp => { const p = await open('index.html', 'coach', vp); await meet(p); await p.evaluate(() => document.getElementById('btnPrintView').click()); await sleep(900); return p; });
await both('use_recsheet', async vp => { const p = await open('index.html', 'coach', vp); await meet(p); await p.evaluate(() => document.getElementById('btnRecView').click()); await sleep(900); return p; });
// 2 保護者へのお知らせ
await both('use_parent', async vp => { const p = await open('index.html', 'coach', vp); await meet(p); await p.evaluate(() => document.getElementById('btnParent').click()); await sleep(900);
  await p.evaluate(() => { const e = document.querySelector('#ntEdit [data-t="school"]'); if (e) { e.value = '架空区立第一中学校'; e.dispatchEvent(new Event('input', { bubbles: true })); } document.getElementById('pvView').click(); }); await sleep(1200); return p; });
// 3 自己ベスト・部内ランキング・大会まとめ
await both('use_rank', async vp => { const p = await open('records.html?demo=1', 'coach', vp); await recs(p); await p.evaluate(() => { window.__t.setTab('rank'); document.getElementById('rbView').scrollIntoView(); }); await sleep(500); return p; });
await both('use_meetsum', async vp => { const p = await open('records.html?demo=1', 'coach', vp); await recs(p); await p.evaluate(() => window.__t.setTab('meet')); await sleep(300);
  await p.evaluate(() => { const v = document.querySelector('[data-print="meet"][data-act="view"]'); if (v) v.click(); }); await sleep(900); return p; });
// 4 選手に自分の記録（選手別の自己ベストとグラフ・個人ページを作る画面）
await both('use_ath', async vp => { const p = await open('records.html?demo=1', 'coach', vp); await recs(p); await p.evaluate(() => { window.__t.setTab('ath'); const a = document.querySelector('#rbView [data-ath], #rbView button, #rbView a'); if (a) a.click(); document.getElementById('rbView').scrollIntoView(); }); await sleep(700); return p; });
await both('use_pp', async vp => { const p = await open('records.html?demo=1', 'coach', vp); await recs(p); await p.evaluate(() => document.getElementById('rbPPOpen').click()); await sleep(600); return p; });
// 5 エントリー照合
await both('use_check', async vp => { const p = await open('check.html', 'coach', vp); const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'source/test/fixtures/manual_check_demo.json'), 'utf8'));
  await p.evaluate(async D => { window.__check.setBooks(D.books, '架空_エントリー票.xlsx'); await new Promise(r => setTimeout(r, 200)); window.__check.setSl(D.sl, '架空_スタートリスト.pdf', 3); const s = document.getElementById('ckSchool'); if (!s.value) { s.value = '架空第一'; s.dispatchEvent(new Event('input')); } }, D); await sleep(800);
  await p.evaluate(() => { const r = document.getElementById('ckResult'); if (r && !r.hidden) { r.scrollIntoView(); scrollBy(0, -8); window.__keepScroll = 1; } }); return p; });
// 6 選手モードのホーム（架空の大会の予定リンクを1つ保存した状態）
await both('use_home', async vp => {
  const c = await open('index.html', 'coach', PC); await meet(c); const str = await c.evaluate(async () => { const A = window.__meetApp, rows = A.state.rows || [], a = PlayerLogic.athletes(rows)[0]; return A.encodePayload(PlayerLogic.payloadFor(rows, a, { n: '第1回 架空区 中学校陸上競技大会', d: '2026年10月25日', pl: '架空市 陸上競技場', cp: '招集所（メインスタンド下）' })); }); await c.close();
  return open('index.html', 'player', vp, p => p.evaluate(s => localStorage.setItem('lanenote.player.v1.demo00001', JSON.stringify({ kind: 'p', p: s, at: new Date().toISOString(), exp: null })), str));
});
// 画面ごとのボタンの絵（小さめ・スマホ幅）
for (const [name, pg, mode] of [['btn_meet', 'index.html', 'coach'], ['btn_records', 'records.html', 'coach'], ['btn_check', 'check.html', 'coach'], ['btn_player', 'index.html', 'player']]) {
  if (!want(name)) continue;
  const p = await open(pg, mode, MINI); const y = await p.evaluate(() => { const m = document.querySelector('main'); return Math.max(0, m.getBoundingClientRect().top + scrollY - 8); });
  await p.screenshot({ path: path.join(IMG, name + '.webp'), type: 'webp', quality: 50, clip: { x: 0, y, width: 390, height: 640 } }); console.log('  img', name); await p.close();
}
// マニュアルのスクショ（確認用。リポジトリには入れない）
if (GUIDE_OUT) {
  fs.mkdirSync(GUIDE_OUT, { recursive: true });
  for (const [w, vp] of [['pc', { width: 1280, height: 900 }], ['phone', { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    let p = await open('guide.html#manual', 'coach', vp); await sleep(800); await p.screenshot({ path: path.join(GUIDE_OUT, `v0253_manual_top_${w}.png`) });
    await p.evaluate(() => document.getElementById('u1').scrollIntoView()); await sleep(1200); await p.screenshot({ path: path.join(GUIDE_OUT, `v0253_manual_u1_${w}.png`) });
    await p.evaluate(() => document.querySelector('#u1 .mz-open').click()); await sleep(1200); await p.screenshot({ path: path.join(GUIDE_OUT, `v0253_manual_zoom_${w}.png`) });
    await p.goBack(); await sleep(500); const closed = await p.evaluate(() => document.getElementById('mzView').hidden && location.pathname.endsWith('guide.html'));
    console.log('  戻るで閉じる', w, closed); await p.close();
  }
  console.log('  shots →', GUIDE_OUT);
}
await b.close(); srv.close();
