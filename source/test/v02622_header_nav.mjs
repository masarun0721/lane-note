// v0.26.22 全ページ共通のヘッダー（記録・大会準備・照合＋はじめての人・3分体験・チーム・マニュアル・更新情報・不具合・モード）。PC は全部、スマホは「≡ メニュー」
//   node v02622_header_nav.mjs [スクショの頭（例 /workspace/lane_note_shots/v02622）]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), SHOT = process.argv[2] || '';
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.setRequestInterception(true);
p.on('request', r => /^http:\/\/127\.0\.0\.1/.test(r.url()) ? r.continue() : r.respond({ status: 404, body: '' }));
const PAGES = [['index.html', 'index'], ['records.html', 'records'], ['check.html', 'check'], ['team.html', 'team'], ['schedule.html', 'schedule'], ['guide.html', 'guide'], ['try.html', 'try']];
const ORDER = 'records,index,check,schedule,changelog,guide,try,team,manual,feedback';
const PC = { width: 1280, height: 900 }, PH = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function open(u, vp, mode = 'coach') { await p.setViewport(vp); await p.goto(B + 'guide.html'); await p.evaluate(m => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', m); }, mode); await p.goto(B + u, { waitUntil: 'load' }); await sleep(700); }
const st = () => p.evaluate(() => {
  const n = document.getElementById('lnNav'), vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
  const items = [...n.querySelectorAll('[data-tb]')].map(e => e.getAttribute('data-tb')).join(',') + (n.querySelector('#modeSw') ? ',mode' : '');
  const shown = [...n.querySelectorAll('[data-tb],#modeSw,.pn-menu')].filter(vis).map(e => e.getAttribute('data-tb') || (e.id === 'modeSw' ? 'mode' : 'menu'));
  const cur = [...n.querySelectorAll('[aria-current="page"]')].map(e => e.getAttribute('data-tb'));
  const navs = document.querySelectorAll('nav.pagenav').length, rows = [...document.querySelectorAll('.topbar .tb-btn, .topbar summary')].filter(e => e.getBoundingClientRect().height > 0).length;
  const over = [...n.querySelectorAll('[data-tb],#modeSw,.pn-menu')].filter(vis).some(e => e.getBoundingClientRect().right > innerWidth + 0.5 || e.getBoundingClientRect().left < -0.5);
  const more = [...(document.getElementById('lnNavMore') || { children: [] }).children].map(e => e.getAttribute('data-tb') || 'mode');
  return { more, items, shown, cur, navs, rows, over, sw: document.documentElement.scrollWidth, iw: innerWidth, inHeader: !!n.closest('header') };
});
const sets = {};
for (const [u, k] of PAGES) {
  await open(u, PC); let s = await st(); sets[u] = s.items;
  ok(u + ' PC：ヘッダーの中に1つだけ・ページ内の別のボタン列はない・今のページを強調', s.navs === 1 && s.inHeader && s.rows === 0 && s.cur.length === 1 && s.cur[0] === k, JSON.stringify(s));
  ok(u + ' PC：全部のボタンが同じ順で見える（入りきらない分は「≡ メニュー」の中・v0.26.34.1）、はみ出さない', s.items.split(',').sort().join() === (ORDER + ',mode').split(',').sort().join() && (() => { const all = (ORDER + ',mode').split(','), sh = s.shown.filter(x => x !== 'menu'); return all.filter(x => sh.includes(x)).join() === sh.join() && all.every(x => sh.includes(x) || s.more.includes(x)) && (s.more.length === 0 || s.shown.includes('menu')); })() && !s.over, JSON.stringify(s));
  if (SHOT && ['records.html', 'team.html', 'guide.html', 'try.html'].includes(u)) { await (await p.$('header')).screenshot({ path: SHOT + '_' + k + '_pc.png' }); }
  await open(u, PH); s = await st();
  ok(u + ' スマホ：記録・大会準備・照合と「≡ メニュー」だけ・はみ出さない', s.shown.join(',') === 'records,index,check,menu' && !s.over && s.sw <= s.iw, JSON.stringify(s));
  await p.click('#lnNav .pn-menu'); await sleep(300); s = await st();
  ok(u + ' スマホ：メニューを開くと残り全部（全ページ同じ）・画面からはみ出さない', s.shown.join(',') === 'records,index,check,menu,schedule,changelog,guide,try,team,manual,feedback,mode' && !s.over, JSON.stringify(s.shown));
  if (SHOT && ['records.html', 'team.html', 'guide.html', 'try.html'].includes(u)) { await p.screenshot({ path: SHOT + '_' + k + '_phone_menu.png', clip: { x: 0, y: 0, width: 390, height: 640 } }); }
  await p.keyboard.press('Escape'); await sleep(200); s = await st(); ok(u + ' スマホ：Esc で閉じる', s.shown.join(',') === 'records,index,check,menu', JSON.stringify(s.shown));
}
ok('ボタンの列は全ページで同じ（強調だけちがう）', new Set(Object.values(sets)).size === 1, JSON.stringify(sets));
// 更新情報：ボタンで開く（閉じているときは出さない）
await open('records.html', PC); let cl = await p.evaluate(() => { const d = document.getElementById('changelog'); const a = d.getBoundingClientRect().height; document.querySelector('[data-tb="changelog"]').click(); return [a, d.open, d.getBoundingClientRect().height > 0]; });
ok('「📰 更新情報」で開く・閉じているときは場所をとらない', cl[0] === 0 && cl[1] && cl[2], JSON.stringify(cl));
// 選手モード（大会準備のページ＝選手のホーム）：チーム・記録/大会準備/照合・更新情報は出さず、モードの切りかえは残る
await open('index.html', PC, 'player'); let s = await st();
ok('選手モード PC：チームと記録・大会準備・照合・更新情報は出さない・モード切りかえは出る', !s.shown.includes('team') && !s.shown.includes('records') && !s.shown.includes('changelog') && s.shown.includes('mode') && s.shown.includes('guide'), JSON.stringify(s.shown));
await open('index.html', PH, 'player'); await p.click('#lnNav .pn-menu'); await sleep(300); s = await st();
ok('選手モード スマホ：メニューにチームは出ない', !s.shown.includes('team') && s.shown.includes('mode') && !s.over, JSON.stringify(s.shown));
if (SHOT) await p.screenshot({ path: SHOT + '_player_phone_menu.png', clip: { x: 0, y: 0, width: 390, height: 640 } });
ok('ページのエラーなし', errs.length === 0, errs.join(' / '));
await b.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
