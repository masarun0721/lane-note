// v0.26.51「1年分の記録をまとめる」を速く：ラウンドの順に必要なページだけ（学校がいない種目のあとのラウンドは取らない）・1分540回までの間隔で同時に取る・429・取ったページの使い回し・残り時間・大会ごとの件数と自己ベスト。架空データのみ。
// 一覧・結果のページは架空のもの（中継への問い合わせを差し替え）。実際のソース・画面（jsdom）・fake-indexeddb。クラウドにはつながない
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const req = createRequire(import.meta.url), R = req('../src/results.js'), Y = req('../src/yearbuild.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.51] 1年分の記録をまとめる（速く・大会ごとに結果）');
const G = 'https://gold.jaic.org/jaic/member/tokyo/';
const H = Object.fromEntries(Y.HUBS.map(h => [h.id, h]));

/* ---------- 画面（jsdom）：架空の一覧と速報ページ ---------- */
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
const PROXY = 'https://lane-note-fetch.masashi-sakata1007.workers.dev/';
const ind = (date, title, rows) => `<!-- ${date} 09:00:00 15 (Lsoku=0)-->\n<html lang="ja"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${title}</title></head>\n${title}<br>\n<hr>\n<center>風:+0.5<br></center>\n` + rows.map(r => `<font color="#000080">${r}<br>\n</font>`).join('') + '<hr>\n<a href="kyougi.html">競技一覧画面へ</a></body></html>';
const kyougi = (title, n) => `<html><head><meta charset="utf-8"><title>${title}</title></head><body>${title}<br>` + Array.from({ length: n }, (_, i) => `<a href="rel00${i + 1}.html">${i + 1}組</a>`).join(' ') + '</body></html>';
const p1 = (name, team, mark, g = 2, bib = 11) => `1位　(${bib})<br>　${mark}<br>${name}(${g})<br>${team}<br>`, p2 = (name, team, mark, g = 2, bib = 21) => `2位　(${bib})<br>　${mark}<br>${name}(${g})<br>${team}<br>`;
// 架空の速報ページ（競技一覧 kyougi1.html に種目ごとのラウンド。gold と同じ形）
const KY = (title, evs) => `<html><head><meta charset="utf-8"><title>${title}</title></head><body>競技一覧<br><a href="kyougi.html">競技先頭ページへ</a>\n<hr>` + evs.map((e, i) => `<a name="KY${String(i).padStart(2, '0')}">${e[0]}</a><br>\n` + e[1].map(r => `${r[0]}&nbsp;5月3日<br>\n(全 ${r[1].length}組)<br>\n` + r[1].map((u, j) => `<a href="${u}">${j + 1}組&nbsp;10:0${j}</a>&nbsp;<font color="#E00000">結果</font><br>\n`).join('')).join('') + '<hr>\n').join('') + '<a href="cond.html">コンディション画面へ</a></body></html>';
const M1 = G + '2026r/0503kaku/';
const EV1 = [['男子 １００ｍ', [['予選', ['rel001.html', 'rel002.html']], ['決勝', ['rel010.html']]]],
  ['男子 ２００ｍ', [['予選', ['rel003.html', 'rel004.html']], ['決勝', ['rel011.html']]]],
  ['男子 ４×１００ｍ', [['ﾀｲﾑﾚｰｽ', ['rel005.html']], ['ﾀｲﾑﾚｰｽ総合結果', ['rel012.html']]]],
  ['女子 走幅跳', [['決勝', ['rel006.html']], ['決勝', ['rel013.html']]]]];
const SITE = {
  [G + 'top.htm']: `<a href="2026r/0503kaku/kyougi.html">第29回架空区春季陸上競技大会(5/3 夢の島)</a>`,
  [G + 'index.htm']: '<p>なし</p>', [G + 'cyuugaku/index.htm']: '<p>なし</p>', 'https://www.kotorikkyo.info/result2026': '<p>ありません</p>',
  [M1 + 'kyougi.html']: `<html><body>競技一覧<br>男子<br><a href="kyougi1.html#KY00">１００ｍ</a><br><a href="kyougi1.html#KY01">２００ｍ</a><br><a href="kyougi1.html#KY02">４×１００ｍ</a><br>女子<br><a href="kyougi1.html#KY03">走幅跳</a><br><a href="rel020.html">男子 砲丸投 決勝</a><br><a href="cond.html">コンディション</a></body></html>`,
  [M1 + 'kyougi1.html']: KY('第29回架空区春季陸上競技大会', EV1),
  [M1 + 'rel001.html']: ind('2026/05/03', '男子 １００ｍ 予選 1組', [p1('架空 一郎', '架空高', '11.30'), p2('見本 二郎', '見本高', '11.80')]),
  [M1 + 'rel002.html']: ind('2026/05/03', '男子 １００ｍ 予選 2組', [p1('見本 五郎', '見本高', '11.60'), p2('見本 六郎', '見本高', '11.90')]),
  [M1 + 'rel006.html']: ind('2026/05/03', '女子 走幅跳 決勝 1組', [p1('架空 花子', '架空高', '5.10'), p2('見本 春子', '見本高', '4.90')]),
  [M1 + 'rel010.html']: ind('2026/05/03', '男子 １００ｍ 決勝', [p1('架空 一郎', '架空高', '11.20'), p2('見本 五郎', '見本高', '11.50')]),
  [M1 + 'rel003.html']: ind('2026/05/03', '男子 ２００ｍ 予選 1組', [p1('見本 七郎', '見本高', '23.00')]),
  [M1 + 'rel004.html']: ind('2026/05/03', '男子 ２００ｍ 予選 2組', [p1('見本 八郎', '3・見本高', '23.20')]),
  [M1 + 'rel011.html']: ind('2026/05/03', '男子 ２００ｍ 決勝', [p1('見本 七郎', '見本高', '22.90'), p2('見本 八郎', '見本高', '23.10')]),
  [M1 + 'rel005.html']: ind('2026/05/03', '男子 ４×１００ｍ ﾀｲﾑﾚｰｽ 1組', [p1('見本高', '見本高', '44.00')]),
  [M1 + 'rel012.html']: ind('2026/05/03', '男子 ４×１００ｍ ﾀｲﾑﾚｰｽ総合結果', [p1('見本高', '見本高', '44.00')]),
  [M1 + 'rel013.html']: ind('2026/05/03', '女子 走幅跳 決勝', [p1('架空 花子', '架空高', '5.10'), p2('見本 春子', '見本高', '4.90')]),
  [M1 + 'rel020.html']: ind('2026/05/03', '男子 砲丸投 決勝', [p1('見本 九郎', '見本高', '12.00')]),
};
const BAD = {}; let T = [];
let CALLS = [], FAIL429 = 0;
async function page(mets, school, o = {}) {
  const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html?year=1', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
  const w = d.window; w.confirm = () => (w.__conf = (w.__conf || 0) + 1, o.confirm !== false); w.alert = m => { w.__alert = m; }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.indexedDB = o.idb || new IDBFactory();
  w.fetch = async (url, op) => {
    url = String(url); CALLS.push(url);
    if (!url.startsWith(PROXY + '?url=')) return Promise.reject(new Error('no network'));
    const u = decodeURIComponent(url.slice((PROXY + '?url=').length));
    if (o.slow) await delay(o.slow);
    if (op && op.signal && op.signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    if (FAIL429 > 0) { FAIL429--; return new Response('too many requests', { status: 429 }); }
    T.push(Date.now());
    if (BAD[u]) return new Response('err', { status: 500 });
    if (!(u in SITE)) return new Response('nf', { status: 404 });
    return new Response(SITE[u], { status: 200, headers: { 'X-Lane-Type': 'text/html; charset=utf-8', 'X-Lane-Url': u } });
  };
  w.eval('(function () { var real = Date.now, off = Date.parse("2026-10-27T03:00:00Z") - real(); Date.now = function () { return real() + off; }; })();');
  w.localStorage.setItem('lanenote-rec-meets', JSON.stringify(mets));
  for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js', 'pubmeets.js', 'prepdel.js', 'yearbuild.js']) w.eval(src(s));
  assert(src('records_app.js').includes(tail));
  w.eval(src('records_app.js').replace(tail, 'window.__t={all:function(){return ALL;},mets:function(){return METS;},put:function(a){return putMany(a,scope()).then(function(){return reload(scope());});},batches:function(){return batches;},yb:function(){return YB;}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
  const sch = w.document.getElementById('rbSchool'); sch.value = school; sch.dispatchEvent(new w.Event('input', { bubbles: true })); await delay();
  w.__t.yb().wait429 = 0; w.__t.yb().lim = o.lim || 60000;
  CW = w; return w;
}
const PL = (date, meet, x = {}) => [date + '|' + meet, Object.assign({ plan: true, date, meet }, x)];
const METS0 = Object.fromEntries([PL('2026-04-03', '支部春季', { end: '2026-04-04', venue: '江戸川', div: '高校' }), PL('2026-05-03', '架空区春季', { end: '2026-05-04', venue: '夢の島', div: '高校' }), PL('2026-06-11', '南関東', { end: '2026-06-12', venue: '茨城', div: '高校' }),
  PL('2026-09-12', '見本大会', { venue: '駒沢' }), PL('2026-11-03', '駅伝', { venue: '味スタ', div: '高校' })]);
const OTHER = { meet: '別の記録会', date: '2026-03-01', event: '男子100m', name: '架空 九郎', team: '架空高', mark: '11.90', round: '決勝', heat: '', lane: '', bib: '', rank: 1, grade: '2', kana: '', wind: '', comment: '' };
let CW = null; const $ = id => CW.document.getElementById(id);
const idle = async (w, max = 8000) => { const t = Date.now(); await delay(50); while (w.__t.yb().busy && Date.now() - t < max) await delay(40); await delay(120); };
const ybRows = w => [...w.document.querySelectorAll('#ybList li')].map(li => [li.getAttribute('data-ybk'), li.className.replace('yb-r yb-', '')]);
const mine = w => w.__t.all().filter(r => r.meet !== '別の記録会').map(r => [r.meet, r.date, r.event.replace(/\s/g, ''), r.name, r.mark]).sort();

const PLAN = Object.fromEntries([PL('2026-05-03', '架空区春季', { venue: '夢の島', div: '高校' })]);
const got = n0 => CALLS.slice(n0).map(u => decodeURIComponent(u).replace(/^.*\/0503kaku\//, '')).filter(u => !/^https?:/.test(u)).sort();
const OLD = { meet: '架空記録会', date: '2026-04-01', event: '男子100m', name: '架空 一郎', team: '架空高', mark: '11.50', round: '決勝', heat: '', lane: '', bib: '', rank: 1, grade: '2', kana: '', wind: '+0.5', comment: '' };

await check('競技一覧（kyougiN）の読み取り：種目ごとのラウンド・総合結果の印・リンクの絶対URL', async () => {
  const e = Y.goldRounds(SITE[M1 + 'kyougi1.html'], M1 + 'kyougi1.html');
  assert.deepEqual(e.map(x => x.ev), ['男子 100m', '男子 200m', '男子 4×100m', '女子 走幅跳']);
  assert.deepEqual(e[0].rounds.map(r => [r.lab, r.sogo, r.links.map(u => u.slice(M1.length))]), [['予選 5月3日', false, ['rel001.html', 'rel002.html']], ['決勝 5月3日', false, ['rel010.html']]]);
  assert.deepEqual(e[2].rounds.map(r => r.sogo), [false, true]);
  assert.deepEqual(Y.goldRounds('<a href="rel001.html">1組</a>', M1), []);   // 種目のない一覧は分けない
});
await check('学校がいそうなページ：学校名の本体・空白入り（中体連）・「3・」つき・リレーの「A」・アプリの学校名の比べ方。いない・学校名がないとき', async () => {
  const m = q => t => R.matchSchool(t, q) || R.matchSchool(R.relayTeamBase(t), q);
  assert(Y.pageHas(SITE[M1 + 'rel001.html'], '架空高', m('架空高')));
  assert(Y.pageHas('1位<br>架　空<br>', '架空中学校', m('架空中学校')));
  assert(Y.pageHas('<td>3・架空</td>', '都立架空高等学校', m('都立架空高等学校')));
  assert(Y.pageHas('1位<br>架空A<br>', '架空', m('架空')));
  assert(!Y.pageHas(SITE[M1 + 'rel002.html'], '架空高', m('架空高')));
  assert(Y.pageHas('<td>見本</td>', '', null), '学校名がなければ全部');
  assert(Y.pageHas('<td>見本</td>', '架空', () => { throw new Error('x'); }), '比べられないときは「いそう」');
});
await check('まとめて読む（速報ページ）：最初のラウンドに学校がいない種目は、あとのラウンド・総合結果を取らない。いた種目・読めなかったページの種目・一覧にない結果は取る。記録は同じ', async () => {
  BAD[M1 + 'rel006.html'] = 1;
  const w = await page(PLAN, '架空');
  try {
    $('ybFind').click(); await idle(w); assert.deepEqual(ybRows(w).map(x => x[1]), ['found']);
    const n0 = CALLS.length; $('ybRead').click(); await idle(w, 20000);
    assert.deepEqual(got(n0), ['kyougi.html', 'kyougi1.html', 'rel001.html', 'rel002.html', 'rel003.html', 'rel004.html', 'rel005.html', 'rel006.html', 'rel010.html', 'rel013.html', 'rel020.html'].sort());
    const r = w.__t.yb().rows[0]; assert.equal(r.skip, 2); assert.match(r.warn, /読み込めなかった結果のページ 1件/);
    $('ybSave').click(); await idle(w, 15000);
    assert.deepEqual(mine(w).map(x => [x[2], x[3], x[4]]).sort(), [['女子走幅跳', '架空 花子', '5.10'], ['男子100m', '架空 一郎', '11.20'], ['男子100m', '架空 一郎', '11.30']]);
  } finally { delete BAD[M1 + 'rel006.html']; w.close(); }
});
await check('ほかの学校名（見本）なら、その学校の種目のあとのラウンドを取る（学校ごとに決まる）', async () => {
  const w = await page(PLAN, '見本');
  try {
    $('ybFind').click(); await idle(w); const n0 = CALLS.length; $('ybRead').click(); await idle(w, 20000);
    const g = got(n0); ['rel010.html', 'rel011.html', 'rel012.html', 'rel013.html'].forEach(u => assert(g.includes(u), u));
  } finally { w.close(); }
});
await check('大会が終わるたびに、その大会の行に件数・選手の数・自己ベスト更新（保存済みの記録とくらべる）を出す。読み込み中は残り時間の目安', async () => {
  const w = await page(PLAN, '架空', { lim: 600 });
  try {
    const o = Object.assign({}, OLD); o.id = R.recId(o.meet, o.date, o); await w.__t.put([o]); await delay(100);
    $('ybFind').click(); await idle(w);
    let eta = ''; $('ybRead').click(); const t0 = Date.now();
    while (w.__t.yb().busy && Date.now() - t0 < 20000) { const m = $('ybMsg').textContent; if (process.env.DBG) console.log(m); if (/あと(約\d+分|1分たらず)/.test(m)) eta = m; await delay(20); }
    await idle(w);
    assert.match(eta, /読み込み中…（1／1大会）架空区春季　あと/);
    const li = w.document.querySelector('[data-ybk="2026-05-03|架空区春季"]').textContent;
    assert.match(li, /保存する記録 3件・選手 2人/); assert.match(li, /自己ベスト更新 2件/); assert.match(li, /架空 一郎 男子 高校 100m 11\.[23]0/);
    assert.match($('ybMsg').textContent, /記録のあった大会 1・保存する記録 3件/);
    assert.equal(w.__t.all().length, 1, 'まだ保存しない');
  } finally { w.close(); }
});
await check('この画面で取ったページは使い回す：もう一度さがす・もう一度読むとき、一覧・学校のいるページ・学校のいないページを取りに行かない', async () => {
  const w = await page(PLAN, '架空');
  try {
    $('ybFind').click(); await idle(w); $('ybRead').click(); await idle(w, 20000); $('ybSave').click(); await idle(w, 15000);
    const n0 = CALLS.length; $('ybFind').click(); await idle(w);
    assert.equal(CALLS.length - n0, 0, '一覧は取りに行かない'); assert.deepEqual(ybRows(w).map(x => x[1]), ['done']);
    const g = w.document.querySelector('input[data-ybgo="0"]'); g.checked = true; g.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
    $('ybRead').click(); await idle(w, 20000);
    assert.deepEqual(got(n0), [], '同じ画面のうちは取りに行かない');
    assert.equal(w.__t.batches().filter(b => b.yb).length >= 1, true); assert.match(w.document.querySelector('[data-ybk="2026-05-03|架空区春季"]').textContent, /保存する記録 3件/);
    $('ybSave').click(); await idle(w, 15000);
    // 学校名を変えたら、いる・いないは決め直す（一覧は使い回す）
    const sch = $('rbSchool'); sch.value = '見本'; sch.dispatchEvent(new w.Event('input', { bubbles: true })); await delay();
    $('ybFind').click(); await idle(w); const n1 = CALLS.length; assert.deepEqual(ybRows(w).map(x => x[1]), ['done']);
    const g1 = w.document.querySelector('input[data-ybgo="0"]'); g1.checked = true; g1.dispatchEvent(new w.Event('change', { bubbles: true })); await delay(); $('ybRead').click(); await idle(w, 20000);
    const g2 = got(n1); assert(!g2.includes('kyougi.html') && !g2.includes('kyougi1.html')); assert(g2.includes('rel011.html') && g2.includes('rel002.html'));
  } finally { w.close(); }
});
await check('間をあけて取る：1分に YB.lim 回まで（同時にいくつか取っても間隔は守る）', async () => {
  const w = await page(PLAN, '架空', { lim: 300 });   // 200ms ごと
  try {
    $('ybFind').click(); await idle(w); T = []; $('ybRead').click(); await idle(w, 20000);
    assert(T.length >= 10, String(T.length)); const gaps = T.slice(1).map((t, i) => t - T[i]);
    assert(Math.min(...gaps) >= 180, 'gaps ' + gaps.join(',')); assert(T[T.length - 1] - T[0] >= 180 * (T.length - 1));
    assert.equal(w.__t.yb().lim, 300); assert.equal(w.__t.yb().par > 1, true);
  } finally { w.close(); }
});
await check('中継が混んでいる（429）：全部いったん待ってから、少しゆっくりにして続ける。取りこぼさない', async () => {
  const w = await page(PLAN, '架空');
  try {
    $('ybFind').click(); await idle(w); const n0 = CALLS.length;
    FAIL429 = 3; $('ybRead').click(); await idle(w, 20000);
    const yb = w.__t.yb(); assert(yb.limNow < yb.lim, 'ゆっくりにする'); assert(yb.gate.until > 0);
    assert.deepEqual(ybRows(w).map(x => x[1]), ['ready']); assert.match(w.document.querySelector('#ybList li').textContent, /保存する記録 3件/);
    assert(got(n0).filter(u => u === 'rel010.html').length >= 1);
  } finally { FAIL429 = 0; w.close(); }
});
await check('説明・更新情報：時間の目安（5分くらい）と、出ていない種目の決勝などは読まないこと', async () => {
  assert(/1年分（30大会ほど）で5分くらい/.test(src('records_app.js')));
  assert(/YB\.lim = 1080;/.test(src('records_app.js')), '中継の上限（1分1200回）より少なめ');
  assert(/const RATE = \{ limit: 1200, period: 60000 \}/.test(fs.readFileSync(path.join(here, '../../worker/worker.js'), 'utf8')));
  const cl = JSON.parse(fs.readFileSync(path.join(here, '../src/changelog.json'), 'utf8')); const e51 = cl.find(x => x.ver === 'v0.26.51'); assert.ok(e51); assert.match(e51.text, /決勝や総合結果のページは読みません/);   // v0.26.52：あとの版が末尾に足されても見る
});
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
