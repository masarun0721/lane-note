// v0.26.50「1年分の記録をまとめる」：大会予定 → 結果の一覧（gold.jaic.org 型・江東区陸協型）から候補 → まとめて読む → 確認 → まとめて保存。架空データのみ。
// 一覧・結果のページは架空のもの（中継への問い合わせを差し替え）。実際のソース・画面（jsdom）・fake-indexeddb。クラウドにはつながない
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const req = createRequire(import.meta.url), R = req('../src/results.js'), Y = req('../src/yearbuild.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.50] 1年分の記録をまとめる');
const G = 'https://gold.jaic.org/jaic/member/tokyo/';
const H = Object.fromEntries(Y.HUBS.map(h => [h.id, h]));

/* ---------- 一覧の読み取り・候補の決め方（関数だけ） ---------- */
await check('一覧の名前から日付を読む（「9/19 大井,9/21,22,23 駒沢」「4/24-26」「8/17 大井・8/18～8/20」「10/3・4」・1〜3月は次の年・年つき）', async () => {
  assert.deepEqual(Y.labelDays('9/19 大井,9/21,22,23 駒沢', 2026), ['2026-09-19', '2026-09-21', '2026-09-22', '2026-09-23']);
  assert.deepEqual(Y.labelDays('4/24-26 駒沢', 2026), ['2026-04-24', '2026-04-25', '2026-04-26']);
  assert.deepEqual(Y.labelDays('8/17 大井・8/18～8/20 駒沢', 2026), ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20']);
  assert.deepEqual(Y.labelDays('10/3・4', 2026), ['2026-10-03', '2026-10-04']);
  assert.deepEqual(Y.labelDays('5/5大井 5/9,10,16,17駒沢', 2026), ['2026-05-05', '2026-05-09', '2026-05-10', '2026-05-16', '2026-05-17']);
  assert.deepEqual(Y.labelDays('1/25 夢の島', 2025), ['2026-01-25']);
  assert.deepEqual(Y.labelDays('10/11,12,11/9 上柚木', 2025), ['2025-10-11', '2025-10-12', '2025-11-09']);
  assert.deepEqual(Y.labelDays('2026/8/28・29', null), ['2026-08-28', '2026-08-29']);
  assert.deepEqual(Y.labelDays('第3回', 2026), []);
});
const TOP = `<html><body><a href="2026r/0503kaku/kyougi.html">第29回架空区春季陸上競技大会(5/3・5/4 夢の島)</a><br>
<a href="2026r/0817kaku/M/kyougi.html">・第9回架空私立中学高等学校陸上競技選手権大会（8/17 大井・8/18～8/20 駒沢）</a>
<a href="2026r/0906kaku/kyougi.html">第9回架空区民陸上 兼 架空区中高選手権(9/6 夢の島)</a>
<a href="2025r/0101kyoho/kyougi.html"></a><a href="2025r/0101kyoho/kyougi.html">・</a><a href="index.htm">高体連</a></body></html>`;
const KOU = `<a href="2026r-kou/23shibu/01_syunki/kyougi.html">・第23支部春季競技会（4/3,4 江戸川）</a><a href="2026r-kou/1shibu/01_haru/kyougi.html">・第1支部春季競技会（4/3,4 大井）</a>
<a href="2026r-kou/1shibu/05_shinjin/kyougi.html">・第1支部新人予選会（8/26 江戸川 8/29,30 大井）</a><a href="2026r-kou/23shibu/05_shinjin/kyougi.html">・第23支部新人予選会（8/26,29,30 江戸川）</a>
<a href="2026r-kou/soutai/kyougi.html">・第79回東京都高等学校陸上競技対校選手権大会（5/5大井 5/9,10,16,17駒沢）</a>`;
const CHU = `<a href="record/2026/26shibu/kyougi.html">第79回架空中学校支部対抗陸上競技選手権大会 （10/3・4</a><a href="record/2026/26soutai/kyougi.html">駒沢）</a>
<a href="record/2026/26soutai/kyougi.html">第65回架空中学校総合体育大会陸上競技（7/24・25・26 上柚木）</a>`;
const KOTO = `<div class="item"><p>スプリングトライアル（2026/5/24）</p><a href="https://www.kotorikkyo.info/_files/ugd/x_1.pdf">競技結果</a></div><div class="item"><p>ナイター（2026/8/28・29）</p><a href="https://www.kotorikkyo.info/_files/ugd/x_2.pdf">競技結果</a></div><a href="https://www.kotorikkyo.info/_files/ugd/x_3.pdf">要項</a>`;
const ENTS = [].concat(Y.parseIndex(H.rk, TOP, G + 'top.htm', 2026), Y.parseIndex(H.kou, KOU, G + 'index.htm', 2026), Y.parseIndex(H.chu, CHU, G + 'cyuugaku/index.htm', 2026), Y.parseIndex(H.koto, KOTO, 'https://www.kotorikkyo.info/result2026', 2026));
await check('一覧のページの読み取り：リンク名の大会名・日付・会場・区分。閉じない（ ）の続きのリンクはつなぐ・日付のないリンクは捨てる・江東区陸協は「名前（年/月/日）」のあとの「競技結果」', async () => {
  const by = n => ENTS.find(e => e.name.includes(n));
  assert.equal(ENTS.filter(e => /0101kyoho|index\.htm/.test(e.url)).length, 0);
  assert.deepEqual(by('支部対抗').days, ['2026-10-03', '2026-10-04']); assert.deepEqual(by('支部対抗').venues, ['駒沢']); assert.equal(by('支部対抗').div, '中学');
  assert.equal(by('総合体育').name, '第65回架空中学校総合体育大会陸上競技'); assert.equal(by('総合体育').url, G + 'cyuugaku/record/2026/26soutai/kyougi.html');
  assert.deepEqual(by('私立').venues.sort(), ['大井', '駒沢']); assert.equal(by('私立').url, G + '2026r/0817kaku/M/kyougi.html'); assert.equal(by('私立').div, '');
  assert.equal(by('第23支部春季').div, '高校'); assert.deepEqual(by('第23支部春季').venues, ['江戸川']);
  const k = ENTS.filter(e => e.hub === 'koto'); assert.equal(k.length, 2); assert.equal(k[0].name, '江東区スプリングトライアル'); assert.equal(k[0].kind, 'pdf'); assert.deepEqual(k[1].days, ['2026-08-28', '2026-08-29']);
});
await check('候補の決め方：日付が重なる・会場が同じ・区分が同じで1つに決まれば「見つかった」。決まらなければ「候補を確認」（勝手に選ばない）。なければ「見つからない」', async () => {
  const m = (meet, date, end, venue, div) => Y.match({ meet, date, end, venue, div }, ENTS);
  let r = m('支部春季', '2026-04-03', '2026-04-04', '江戸川', '高校'); assert.equal(r.st, 'found'); assert.match(r.cands[0].url, /23shibu\/01_syunki/);
  r = m('支部春季', '2026-04-03', '2026-04-04', '', '高校'); assert.equal(r.st, 'pick'); assert.equal(r.cands.length, 2);   // 会場がなければ2つ → 選ぶ
  r = m('支部新人（1日目）', '2026-08-26', '', '江戸川', '高校'); assert.equal(r.st, 'pick'); assert.equal(r.cands.length, 2);   // どちらも 8/26 江戸川
  assert.match(Y.suggest(r, [m('支部春季', '2026-04-03', '2026-04-04', '江戸川', '高校').cands[0]]), /23shibu\/05_shinjin/);   // おすすめの印だけ（選ぶのは先生）
  r = m('都大会（3・4日目）', '2026-05-16', '2026-05-17', '駒沢', '高校'); assert.equal(r.st, 'found'); assert.match(r.why, /会場/);   // 名前が短すぎる → 日付と会場
  r = m('都大会（3・4日目）', '2026-05-16', '2026-05-17', '', '高校'); assert.notEqual(r.st, 'found');   // 会場もなければ決めない
  r = m('私学', '2026-08-17', '', '大井', '高校'); assert.equal(r.st, 'found'); assert.match(r.cands[0].url, /0817kaku/);
  r = m('支部対抗', '2026-10-03', '2026-10-04', '駒沢', '高校'); assert.equal(r.st, 'none');   // 中体連の大会は高校の予定の候補にしない
  r = m('支部対抗', '2026-10-03', '2026-10-04', '駒沢', '中学'); assert.equal(r.st, 'found');
  r = m('江東区ナイター陸上競技大会', '2026-08-28', '2026-08-29', '夢の島', '高校'); assert.equal(r.st, 'found'); assert.equal(r.cands[0].kind, 'pdf');
  r = m('架空区春季', '2026-05-04', '', '駒沢', ''); assert.equal(r.st, 'none'); assert.match(r.why, /会場か名前/);   // 会場がちがう
  r = m('南関東', '2026-06-11', '2026-06-12', '茨城', '高校'); assert.equal(r.st, 'none'); assert.match(r.why, /同じ日の大会がありません/);
});
await check('読む一覧：今の年度はトップの一覧、前の年度は「過去の記録」の年度別の一覧。江東区陸協は年度ごと。終わっていない・期間の外の予定は入れない', async () => {
  const ps = [{ key: 'a', meet: 'A', date: '2026-01-25' }, { key: 'b', meet: 'B', date: '2026-05-03', end: '2026-05-04' }, { key: 'c', meet: 'C', date: '2026-10-26', end: '2026-10-28' }, { key: 'd', meet: 'D', date: '2026-11-03' }, { key: 'e', meet: 'E', date: '2025-09-01' }];
  const inn = Y.plansIn(ps, '2025-10-28', '2026-10-27', '2026-10-27'); assert.deepEqual(inn.map(p => p.key), ['a', 'b']);
  const us = Y.hubsFor(inn, '2026-10-27').map(h => h.url);
  assert.deepEqual(us, [G + 'record/2025r.htm', G + 'record-kou/2025r-kou/k25r.htm', G + 'cyuugaku/record/25r.htm', 'https://www.kotorikkyo.info/result2025', G + 'top.htm', G + 'index.htm', G + 'cyuugaku/index.htm', 'https://www.kotorikkyo.info/result2026']);
});

/* ---------- 画面（jsdom）：架空の一覧と速報ページ ---------- */
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
const PROXY = 'https://lane-note-fetch.masashi-sakata1007.workers.dev/';
const ind = (date, title, rows) => `<!-- ${date} 09:00:00 15 (Lsoku=0)-->\n<html lang="ja"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${title}</title></head>\n${title}<br>\n<hr>\n<center>風:+0.5<br></center>\n` + rows.map(r => `<font color="#000080">${r}<br>\n</font>`).join('') + '<hr>\n<a href="kyougi.html">競技一覧画面へ</a></body></html>';
const kyougi = (title, n) => `<html><head><meta charset="utf-8"><title>${title}</title></head><body>${title}<br>` + Array.from({ length: n }, (_, i) => `<a href="rel00${i + 1}.html">${i + 1}組</a>`).join(' ') + '</body></html>';
const p1 = (name, team, mark, g = 2, bib = 11) => `1位　(${bib})<br>　${mark}<br>${name}(${g})<br>${team}<br>`, p2 = (name, team, mark, g = 2, bib = 21) => `2位　(${bib})<br>　${mark}<br>${name}(${g})<br>${team}<br>`;
// 架空の大会（日付・会場はこの年度のもの）
const SITE = {
  [G + 'top.htm']: `<a href="2026r/0503kaku/kyougi.html">第29回架空区春季陸上競技大会(5/3・5/4 夢の島)</a><a href="2026r/0906kaku/kyougi.html">第9回架空区民陸上 兼 架空区中高選手権(9/6 夢の島)</a><a href="2026r/0912mihon/kyougi.html">見本記録会(9/12 駒沢)</a><a href="2026r/0718kaku/kyougi.html">架空私立中高大会(7/18・19 駒沢)</a><a href="2026r/0912mihon2/kyougi.html">見本スプリント(9/12 駒沢)</a>`,
  [G + 'index.htm']: `<a href="2026r-kou/23shibu/01_syunki/kyougi.html">・第23支部春季競技会（4/3,4 江戸川）</a><a href="2026r-kou/1shibu/01_haru/kyougi.html">・第1支部春季競技会（4/3,4 大井）</a>`,
  [G + 'cyuugaku/index.htm']: `<a href="record/2026/26x/kyougi.html">架空中学校記録会 （7/4 上柚木）</a>`,
  'https://www.kotorikkyo.info/result2026': '<p>ありません</p>',
  [G + '2026r-kou/23shibu/01_syunki/kyougi.html']: kyougi('第23支部春季競技会', 2),
  [G + '2026r-kou/23shibu/01_syunki/rel001.html']: ind('2026/04/03', '男子 １００ｍ 決勝', [p1('架空 一郎', '架空高', '11.50'), p2('見本 二郎', '見本高', '11.80')]),
  [G + '2026r-kou/23shibu/01_syunki/rel002.html']: ind('2026/04/04', '男子 ２００ｍ 決勝', [p1('架空 一郎', '架空高', '23.10'), p2('架空 三郎', '架空高', '23.90', 1)]),
  [G + '2026r/0503kaku/kyougi.html']: kyougi('第29回架空区春季陸上競技大会', 2),
  [G + '2026r/0503kaku/rel001.html']: ind('2026/05/03', '男子 ４００ｍ 決勝', [p1('架空 一郎', '架空高', '52.00')]),
  [G + '2026r/0503kaku/rel002.html']: ind('2026/05/04', '男子 ８００ｍ 決勝', [p1('架空 四郎', '架空中', '2:10.00', 3)]),
  [G + '2026r/0912mihon/kyougi.html']: kyougi('見本記録会', 1), [G + '2026r/0912mihon/rel001.html']: ind('2026/09/12', '男子 １００ｍ 決勝', [p1('見本 五郎', '見本高', '11.20')]),
  [G + '2026r/0912mihon2/kyougi.html']: kyougi('見本スプリント', 1), [G + '2026r/0912mihon2/rel001.html']: ind('2026/09/12', '男子 ６０ｍ 決勝', [p1('見本 六郎', '見本高', '7.20')]),
  [G + '2026r/0718kaku/kyougi.html']: kyougi('架空私立中高大会', 2),
  [G + '2026r/0718kaku/rel001.html']: ind('2026/07/18', '男子中学 ２００ｍ 予選', [p1('架空 四郎', '架空中', '25.10', 3), p2('見本 七郎', '見本中', '25.50', 3)]),
  [G + '2026r/0718kaku/rel002.html']: ind('2026/07/19', '男子高校 ２００ｍ 予選', [p1('架空 一郎', '架空高', '22.90'), p2('見本 八郎', '見本高', '23.30')]),
  [G + '2026r/0906kaku/kyougi.html']: kyougi('第9回架空区民陸上', 2),
  [G + '2026r/0906kaku/rel001.html']: ind('2026/09/06', '男子 １００ｍ 決勝', [p1('架空 一郎', '架空高', '11.40'), p2('架空 四郎', '架空中', '12.40', 3)]),
  [G + '2026r/0906kaku/rel002.html']: ind('2026/09/06', '男子 走幅跳 決勝', [p1('架空 四郎', '架空中', '5.80', 3), p2('架空 三郎', '架空高', '6.10', 1)]),
};
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
    if (!(u in SITE)) return new Response('nf', { status: 404 });
    return new Response(SITE[u], { status: 200, headers: { 'X-Lane-Type': 'text/html; charset=utf-8', 'X-Lane-Url': u } });
  };
  w.eval('Date.now = (function () { return function () { return Date.parse("2026-10-27T03:00:00Z"); }; })();');
  w.localStorage.setItem('lanenote-rec-meets', JSON.stringify(mets));
  for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js', 'pubmeets.js', 'prepdel.js', 'yearbuild.js']) w.eval(src(s));
  assert(src('records_app.js').includes(tail));
  w.eval(src('records_app.js').replace(tail, 'window.__t={all:function(){return ALL;},mets:function(){return METS;},put:function(a){return putMany(a,scope()).then(function(){return reload(scope());});},batches:function(){return batches;},yb:function(){return YB;}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
  const sch = w.document.getElementById('rbSchool'); sch.value = school; sch.dispatchEvent(new w.Event('input', { bubbles: true })); await delay();
  w.__t.yb().wait429 = 0;
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

await check('さがす：期間の中の終わった大会予定ごとに 見つかった／候補を確認／見つからない。まだ何も読まない・保存しない（中継へは一覧のページだけ）', async () => {
  CALLS = []; const w = await page(METS0, '架空');
  try {
    assert($('rbYear').open);   // records.html?year=1 で開く
    const o = Object.assign({}, OTHER); o.id = R.recId(o.meet, o.date, o); await w.__t.put([o]); await delay(100);
    assert.match($('ybBody').textContent, /終わった大会予定：4件/);   // 11/3 の駅伝はまだ（期間の外）
    $('ybFind').click(); await idle(w);
    assert.deepEqual(ybRows(w), [['2026-03-01|別の記録会', undefined]].filter(() => false).concat([['2026-04-03|支部春季', 'found'], ['2026-05-03|架空区春季', 'found'], ['2026-06-11|南関東', 'none'], ['2026-09-12|見本大会', 'pick']]));
    assert(CALLS.length >= 4 && CALLS.every(u => u.startsWith(PROXY)), 'すべて中継を通す');
    assert(CALLS.every(u => /top\.htm|index\.htm|result2026/.test(decodeURIComponent(u))), '一覧のページだけ');
    assert.equal(w.__t.batches().length, 0); assert.equal(w.__t.all().length, 1);
    assert.match($('ybMsg').textContent, /見つかった 2・候補を確認 1・見つからない 1/);
    assert($('ybBody').querySelector('[data-ybman]'), '見つからない大会に「資料を入れる」');
  } finally { w.close(); }
});
await check('まとめて読む → 確認画面（大会名・日付は大会予定・学校の行だけ）→ まとめて保存（確認つき）→ 大会予定は結果取込済・関係のない記録は残る・まとめの表示', async () => {
  const w = await page(METS0, '架空');
  try {
    const o = Object.assign({}, OTHER); o.id = R.recId(o.meet, o.date, o); await w.__t.put([o]); await delay(100);
    $('ybFind').click(); await idle(w);
    // 候補を確認：選ばないうちは読まない
    assert.match($('ybRead').textContent, /2大会/);
    const pk = w.document.querySelector('input[data-ybpick][value="0"]'); pk.checked = true; pk.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
    assert.match($('ybRead').textContent, /3大会/);
    $('ybRead').click(); await idle(w);
    const bs = w.__t.batches(); assert.equal(bs.length, 3);
    const b1 = bs.find(b => b.yb === '2026-04-03|支部春季'); assert.equal(b1.meta.name, '支部春季'); assert.equal(b1.meta.date, '2026-04-03');
    assert.equal(w.__t.all().length, 1, 'まだ保存しない');
    assert.deepEqual(ybRows(w).map(x => x[1]), ['ready', 'ready', 'none', 'empty']);   // 見本記録会には架空の行がない
    // まとめて保存をやめたら何もしない
    w.confirm = () => false; $('ybSave').click(); await idle(w); assert.equal(w.__t.all().length, 1);
    w.confirm = () => true; $('ybSave').click(); await idle(w, 15000);
    assert.deepEqual(mine(w), [['支部春季', '2026-04-03', '男子100m', '架空 一郎', '11.50'], ['支部春季', '2026-04-04', '男子200m', '架空 一郎', '23.10'], ['支部春季', '2026-04-04', '男子200m', '架空 三郎', '23.90'],
      ['架空区春季', '2026-05-03', '男子400m', '架空 一郎', '52.00'], ['架空区春季', '2026-05-04', '男子800m', '架空 四郎', '2:10.00']].sort());
    assert(w.__t.all().some(r => r.meet === '別の記録会'));
    assert.equal(w.__t.mets()['2026-04-03|支部春季'].importedN, 3); assert(w.__t.mets()['2026-05-03|架空区春季'].importedAt);
    assert.match($('ybBody').querySelector('.yb-done.status').textContent, /今回 5件を保存/); assert.match($('ybBody').querySelector('.yb-done.status').textContent, /2大会・5件・選手 3人/);   // v0.26.55 はじめの期間は今年度（4/1〜）：3/1 の「別の記録会」は期間の外
    assert.deepEqual(ybRows(w).map(x => x[1]).slice(0, 2), ['saved', 'saved']);
    // 選手別を見るボタン
    w.document.querySelector('[data-ybview="ath"]').click(); await delay(); assert(w.document.querySelector('.tabs [data-v="ath"]').classList.contains('on'));
    // もう一度さがす → 取り込み済み（読まないのが基本）。「もう一度読む」で読んで保存しても、同じ記録は重ねない
    $('ybFind').click(); await idle(w);
    assert.deepEqual(ybRows(w).map(x => x[1]).slice(0, 2), ['done', 'done']); assert.match($('ybBody').textContent, /取り込み済み（3件）/);
    const g = w.document.querySelector('input[data-ybgo="0"]'); g.checked = true; g.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
    $('ybRead').click(); await idle(w); $('ybSave').click(); await idle(w, 15000);
    assert.equal(mine(w).length, 5); assert.match($('ybBody').querySelector('.yb-done.status').textContent, /3件は保存済み/);
  } finally { w.close(); }
});
await check('中学と高校の大会予定で同じ資料（同じ日・同じ一覧の大会）：高校の予定には高校の行、中学の予定には中学の行だけ（二重に保存しない）', async () => {
  const M = Object.fromEntries([PL('2026-09-06', '架空区民大会', { div: '高校', venue: '夢の島' }), PL('2026-09-06', '架空区大会', { div: '中学', venue: '夢の島' })]);
  const w = await page(M, '架空');
  try {
    $('ybFind').click(); await idle(w);
    assert.deepEqual(ybRows(w).map(x => x[1]), ['found', 'found']);
    assert.equal(w.__t.yb().rows[0].sel.url, w.__t.yb().rows[1].sel.url);
    const n0 = CALLS.length; $('ybRead').click(); await idle(w);
    assert.equal(CALLS.slice(n0).filter(u => /0906kaku%2Fkyougi/.test(u)).length, 1, '同じ大会は1回だけ読む');
    $('ybSave').click(); await idle(w, 15000);
    assert.deepEqual(mine(w), [['架空区民大会', '2026-09-06', '男子100m', '架空 一郎', '11.40'], ['架空区民大会', '2026-09-06', '男子走幅跳', '架空 三郎', '6.10'], ['架空区大会', '2026-09-06', '男子100m', '架空 四郎', '12.40'], ['架空区大会', '2026-09-06', '男子走幅跳', '架空 四郎', '5.80']].sort());
  } finally { w.close(); }
});
await check('v0.26.53 同じ資料の中学・高校の大会予定を片方ずつ読んで保存しても、ほかの区分の行が別の大会名で入らない（同じ行を2回保存しない）', async () => {
  const M = Object.fromEntries([PL('2026-09-06', '架空区民大会', { div: '高校', venue: '夢の島' }), PL('2026-09-06', '架空区大会', { div: '中学', venue: '夢の島' })]);
  const w = await page(M, '架空');
  try {
    $('ybFind').click(); await idle(w); assert.deepEqual(ybRows(w).map(x => x[1]), ['found', 'found']);
    const iH = w.__t.yb().rows.findIndex(r => r.p.meet === '架空区民大会'), iC = 1 - iH;
    const g0 = w.document.querySelector('input[data-ybgo="' + iH + '"]'); g0.checked = false; g0.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();   // 1回目は中学の予定だけ
    $('ybRead').click(); await idle(w); $('ybSave').click(); await idle(w, 15000);
    assert.deepEqual(mine(w), [['架空区大会', '2026-09-06', '男子100m', '架空 四郎', '12.40'], ['架空区大会', '2026-09-06', '男子走幅跳', '架空 四郎', '5.80']].sort(), '中学の予定には中学の行だけ');
    $('ybFind').click(); await idle(w); assert.deepEqual(ybRows(w).map(x => x[1]).sort(), ['done', 'found']);
    const g1 = w.document.querySelector('input[data-ybgo="' + iC + '"]'); if (g1) { g1.checked = true; g1.dispatchEvent(new w.Event('change', { bubbles: true })); await delay(); }   // 中学の予定も「もう一度読む」
    $('ybRead').click(); await idle(w); $('ybSave').click(); await idle(w, 15000);
    assert.deepEqual(mine(w), [['架空区民大会', '2026-09-06', '男子100m', '架空 一郎', '11.40'], ['架空区民大会', '2026-09-06', '男子走幅跳', '架空 三郎', '6.10'], ['架空区大会', '2026-09-06', '男子100m', '架空 四郎', '12.40'], ['架空区大会', '2026-09-06', '男子走幅跳', '架空 四郎', '5.80']].sort());
  } finally { w.close(); }
});
await check('v0.26.53 前の版で、同じ資料の高校の行が中学の予定の名前で保存されていたとき：高校の予定を読んでも、その行は入れなおさない', async () => {
  const M = Object.fromEntries([PL('2026-09-06', '架空区民大会', { div: '高校', venue: '夢の島' }), PL('2026-09-06', '架空区大会', { div: '中学', venue: '夢の島' })]);
  const w = await page(M, '架空');
  try {
    $('ybFind').click(); await idle(w);
    const b = w.__t.yb().rows.find(r => r.p.meet === '架空区民大会');
    // 前の版で入った二重（高校の行が「架空区大会」の名前で）。読み取った行と同じ形で作る
    $('ybRead').click(); await idle(w);
    const hsRow = w.__t.batches().find(x => x.yb === b.p.key).all.recs.find(r => r.name === '架空 一郎');
    w.__t.batches().length = 0;
    const old = Object.assign({}, hsRow, { meet: '架空区大会', date: '2026-09-06' }); old.id = R.recId(old.meet, old.date, old); await w.__t.put([old]); await delay(100);
    $('ybFind').click(); await idle(w); $('ybRead').click(); await idle(w); $('ybSave').click(); await idle(w, 15000);
    const m = mine(w); assert(!m.some(r => r[0] === '架空区民大会' && r[3] === '架空 一郎'), JSON.stringify(m));
    assert(m.some(r => r[0] === '架空区民大会' && r[3] === '架空 三郎')); assert.equal(m.filter(r => r[3] === '架空 一郎').length, 1);
  } finally { w.close(); }
});
await check('中学と高校が同じ種目に出る何日かの大会（学校名「架空」で両方入る）：種目の日付は中学・高校で別々に資料から決める', async () => {
  const w = await page(Object.fromEntries([PL('2026-07-18', '架空私立', { end: '2026-07-19', venue: '駒沢' })]), '架空');
  try {
    $('ybFind').click(); await idle(w); assert.deepEqual(ybRows(w).map(x => x[1]), ['found']);
    $('ybRead').click(); await idle(w);
    assert(!/日付要確認/.test(w.document.getElementById('rbBatches').textContent), '日付は資料から決まる');
    $('ybSave').click(); await idle(w, 15000);
    assert.deepEqual(mine(w).map(r => [r[1], r[3]]), [['2026-07-18', '架空 四郎'], ['2026-07-19', '架空 一郎']]);
  } finally { w.close(); }
});
await check('学校・クラブ名がないときは、さがさない（中継にも問い合わせない）', async () => {
  CALLS = []; const w = await page(METS0, '');
  try { $('ybFind').click(); await idle(w); assert.match($('ybMsg').textContent, /学校・クラブ名/); assert.equal(CALLS.length, 0); assert(!$('ybList')); }
  finally { w.close(); }
});
await check('中継が混んでいる（429）ときは待ってから続ける。やめると、そこまでの分は保存しない', async () => {
  const w = await page(Object.fromEntries([PL('2026-04-03', '支部春季', { end: '2026-04-04', venue: '江戸川', div: '高校' })]), '架空', { slow: 30 });
  try {
    FAIL429 = 2; $('ybFind').click(); await idle(w); assert.deepEqual(ybRows(w).map(x => x[1]), ['found']);
    $('ybRead').click(); await delay(40); assert($('ybStop')); $('ybStop').click(); await idle(w);
    assert.match($('ybMsg').textContent, /やめました/); assert.equal(w.__t.all().length, 0);
  } finally { FAIL429 = 0; w.close(); }
});
await check('見つからない大会は「📎 資料を入れる」：次に入れた資料を、その大会予定の名前・日付で読み取る', async () => {
  const w = await page(METS0, '架空');
  try {
    $('ybFind').click(); await idle(w);
    w.document.querySelector('[data-ybk="2026-06-11|南関東"] [data-ybman]').click(); await delay();
    assert.match($('ybBody').textContent, /この大会の資料を待っています/);
    $('rbPaste').value = '6月11日\n男子100m 決勝\n順位\tナンバー\t氏名\t所属\t記録\n1\t11\t架空 一郎(2)\t架空高\t11.30\n'; $('rbPasteGo').click(); await delay(300);
    const b = w.__t.batches().find(x => x.yb === '2026-06-11|南関東'); assert(b); assert.equal(b.meta.name, '南関東'); assert.equal(b.meta.date, '2026-06-11');
    await delay(50); assert.equal(ybRows(w).find(x => x[0] === '2026-06-11|南関東')[1], 'ready');
    assert(!/待っています/.test($('ybBody').textContent));
  } finally { w.close(); }
});
await check('大会予定のページに「1年分の記録をまとめる」へのリンク（終わった予定があるとき）。記録のページには「1年分」の欄', async () => {
  assert(src('records_template.html').includes('id="rbYear"'));
  assert(/records\.html\?year=1/.test(src('records_app.js')));
  const b = fs.readFileSync(path.join(here, '../build.py'), 'utf8'); assert(/yearbuild\.js/.test(b));
});
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
