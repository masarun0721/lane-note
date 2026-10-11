import puppeteer from 'puppeteer-core'; import fs from 'fs'; import http from 'http'; import path from 'path';
const ROOT = '/workspace/lane_note_repo', OUT = '/workspace/lane_note_shots/';
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' }); r.end(d); }); }).listen(9124);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:9124/index.html', { waitUntil: 'networkidle0' });
const W = ms => new Promise(r => setTimeout(r, ms));
await p.evaluate(() => {
  const A = window.__meetApp;
  const entries = [['山田 太郎', '男子中学1年 100m'], ['佐藤 花子', '女子中学共通 200m']].map((x, i) => ({ team: '本郷中', event: x[1], round: '予選', heat: 1, pos: 3 + i, posKind: 'レーン', bib: String(101 + i), name: x[0], grade: '2', page: 1 }));
  document.getElementById('school').value = '本郷';
  Object.assign(A.state, { sl: { format: 'startlist', hasTimes: false, warnings: [], diag: [], entries, relays: [] }, tt: [{ event: '100m', gender: '男子', cat: '中学1年', round: '予選', time: '9:30' }, { event: '200m', gender: '女子', cat: '中学共通', round: '予選', time: '10:30' }], teams: ['本郷中'], slName: 'a.pdf', ttName: 'b.pdf',
    docText: { yoko: '4．期　　日　　2026年10月11日（日）　9時30分競技開始予定\n5．場　　所　　スピアーズえどりくフィールド　〒134-0087 江戸川区清新町２－１－１　電話 03-3878-3388' } });
  document.getElementById('meetName').value = '第77回 北区中学校陸上競技大会'; A.updateTeams(); A.render();
  A.openVenues();
});
await W(300);
// 1件登録済みにする（架空の値）
await p.evaluate(() => { document.getElementById('vnAdd').click(); });
await p.evaluate(() => { const f = document.getElementById('vnForm'), s = (n, v) => f.querySelector(`[name=${n}]`).value = v; s('name', '架空区総合運動場'); s('station', '架空駅'); s('access', '徒歩10分'); s('place', '正門前'); s('route', '本郷駅〜架空駅'); s('fareRound', '800'); f.requestSubmit(); });
await W(400); await p.screenshot({ path: OUT + 'v0_22_3_venues_list.png' });
await p.evaluate(() => { document.getElementById('vnClose').click(); document.getElementById('btnParent').click(); }); await W(800);
await p.evaluate(() => { const s = document.querySelector('[data-venue]'); s.closest('.nt-f').scrollIntoView({ block: 'start' }); document.getElementById('ntEdit').closest('.nt-wrap').scrollTop -= 40; window.scrollBy(0,0); }); await W(200);
await p.screenshot({ path: OUT + 'v0_22_3_venues_select.png' });
await p.evaluate(() => document.querySelector('[data-va="regfound"]').click()); await W(400);
await p.screenshot({ path: OUT + 'v0_22_3_venues_form.png' });
await b.close(); srv.close();
