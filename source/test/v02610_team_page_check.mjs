// v0.26.10 見出しの「⏱ 3分体験」「👥 チーム」とチームの設定ページ（team.html）。架空データのみ
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), DIST = path.join(here, '../dist');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), dist = f => fs.readFileSync(path.join(DIST, f), 'utf8'), delay = (ms = 40) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.10] 見出しのボタンとチームの設定ページ');
const PAGES = ['index.html', 'records.html', 'check.html', 'guide.html', 'team.html'];
await check('どのページの見出しにも「⏱ 3分体験」と「👥 チーム」がある（1つずつ）', () => {
  for (const p of PAGES) { const h = dist(p); const i = h.indexOf('<nav class="pagenav ln-nav"'); assert(i > 0, p); const top = [h.slice(i, h.indexOf('</nav>', i))]; assert.equal((top[0].match(/class="tb-btn tb-guide tb-try( on)?"/g) || []).length, 1, p + ' try'); assert.match(top[0], /href="team\.html" class="tb-btn tb-guide tb-team/, p + ' team'); }
});
await check('選手モード（body.ln-player）では「チーム」を出さない', () => { for (const p of PAGES) assert.match(dist(p), /body\.ln-player \.ln-nav \.pn-main,body\.ln-player \.ln-nav \.tb-team/, p); });
await check('team.html は記録のページと同じ部品で、team-page の印・題名・今のページの印', () => { const t = dist('team.html'); assert.match(t, /<body class="records team-page">/); assert.match(t, /<title>LANE NOTE チームの設定<\/title>/); assert.match(t, /tb-team on" data-tb="team" aria-current="page"/); assert.doesNotMatch(t, /pn-main on/); assert.doesNotMatch(dist('records.html'), /team-page">/); });
await check('Service Worker：team.html も保存・ページは毎回サーバーに確かめる（古い記録ページを出さない）・キャッシュ名は版つき', () => { const s = dist('sw.js'); assert.match(s, /\.\/team\.html/); assert.match(s, /fetch\(r, \{ cache: 'no-cache' \}\)/); assert.match(s, /var CACHE = 'lanenote-page-v0\.\d+\.\d+(\.\d+)?-r/); });
async function recW(teamPage) {
  const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '').replace('<body class="records">', teamPage ? '<body class="records team-page">' : '<body class="records">');
  const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/' + (teamPage ? 'team' : 'records') + '.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
  for (const s of ['auth_common.js', 'results.js', 'team.js']) w.eval(src(s));
  let js = src('records_app.js'); const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }'; assert(js.includes(tail));
  w.eval(js.replace(tail, 'window.__t={set:function(team){USER={uid:"u1",displayName:"架空 顧問"};CLOUD_READY=true;TEAM=team;TEAMS=team?[team]:[];renderTeam();}};renderAuth();')); await delay(80); return w;
}
const TEAMC = { id: 'AAAAAAAAAAAAAAAAAAAA', name: '架空高校陸上部', role: 'coach', owner: true };
await check('記録のページ：チームの欄は「保存先・今の状態・設定を開く」だけ（メンバーやコードは出さない）', async () => {
  const w = await recW(false); w.__t.set(TEAMC); const box = w.document.getElementById('rbTeam');
  assert.equal(box.hidden, false); assert(box.querySelector('a[href="team.html"]')); assert(box.querySelector('#rbTeamSel'));
  assert.match(box.textContent, /架空高校陸上部/); assert(!box.querySelector('[data-tmd="members"]')); assert(!box.querySelector('[data-tmd="codes"]'));
});
await check('記録のページ：選手モードではチームの欄を出さない', async () => { const w = await recW(false); w.document.body.classList.add('ln-player'); w.__t.set(TEAMC); assert.equal(w.document.getElementById('rbTeam').hidden, true); });
await check('チームのページ（顧問）：メンバー・参加コード・引き継ぎ・見える人とリンクが出る', async () => {
  const w = await recW(true); w.__t.set(TEAMC); const box = w.document.getElementById('rbTeam');
  assert(box.querySelector('[data-tmd="members"]')); assert(box.querySelector('[data-tmd="codes"]')); assert.match(box.textContent, /引き継ぎ/); assert(box.querySelector('[data-safe-d]'));
  assert.equal(w.document.getElementById('tpGate').hidden, true);
});
await check('チームのページ（マネージャー）：参加コード・引き継ぎは出さない（メンバー一覧は見るだけ）', async () => {
  const w = await recW(true); w.__t.set({ id: 'AAAAAAAAAAAAAAAAAAAA', name: '架空高校陸上部', role: 'manager', expiresAt: Date.now() + 864e5 }); const box = w.document.getElementById('rbTeam');
  assert(box.querySelector('[data-tmd="members"]')); assert(!box.querySelector('[data-tmd="codes"]')); assert.doesNotMatch(box.textContent, /持ち主を渡す/); assert.match(box.textContent, /抜ける/);
});
await check('チームのページ（チームなし）：作る・参加コードで入る', async () => { const w = await recW(true); w.__t.set(null); assert(w.document.getElementById('rbTeamName')); assert(w.document.getElementById('rbTeamCode')); });
await check('v0.26.17 記録のページ：公式Xのお知らせ（別タブ・閉じられる・閉じたら出ない・チームのページでは出さない）', () => {
  const r = dist('records.html'); assert.match(r, /<a href="https:\/\/x\.com\/lanenote" target="_blank" rel="noopener">📣 公式Xアカウント <b>@lanenote<\/b> を開設しました！更新情報やお知らせを発信します。<\/a>/); assert.match(r, /lanenote\.xnews\.v1/); assert.match(r, /team-page/);
});
await check('v0.26.18 スマホの見出し：右上の文字はデスクトップ用の右ずらしを使わない・カウンターは書けたときだけ「今日は数えた」', () => {
  for (const p of ['records.html', 'index.html', 'check.html', 'team.html']) assert.match(dist(p), /@media screen and \(max-width:720px\)\{header>\.hdr-meta\{position:relative;right:auto;top:auto\}/, p);
  assert.match(src('records_app.js'), /if \(wrote\) try \{ localStorage\.setItem\(COUNT_KEY, day\)/);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
