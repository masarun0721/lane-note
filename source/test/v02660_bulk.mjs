// v0.26.60 🔍 大会名だけちがう二重を「まとめて消す／まとめて問題ない」・保存の前の「まとめて外す」・「同じ大会ですか？」（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const req = createRequire(import.meta.url), R = req('../src/results.js'), S = req('../src/suspect.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.60] まとめて消す・同じ大会ですか');
const rec = (o) => Object.assign({ meet: '架空区大会', date: '2026-09-06', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '中2', team: '架空中', mark: '12.40', wind: '+0.5', bib: '', lane: '', rank: 1, comment: '' }, o);
const withId = r => (r.id = r.id || R.recId(r.meet, r.date, r), r);
const types = L => L.map(x => x.type + ':' + x.recs.map(r => r.name + '/' + r.mark).join(','));

/* ---------- 画面（jsdom・fake-indexeddb。クラウドにはつながない） ---------- */
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
const ind = (date, title, rows) => `<!-- ${date} 09:00:00 15 (Lsoku=0)-->\n<html lang="ja"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${title}</title></head>\n${title}<br>\n<hr>\n<center>風:+0.5<br></center>\n` + rows.map(r => `<font color="#000080">${r}<br>\n</font>`).join('') + '<hr>\n<a href="kyougi.html">競技一覧画面へ</a></body></html>';
const pr = (k, name, team, mark, g = 2, bib = 11) => `${k}位　(${bib})<br>　${mark}<br>${name}(${g})<br>${team}<br>`;
async function page(o = {}) {
  const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() }); await delay();
  const w = d.window; w.confirm = () => (w.__conf = (w.__conf || 0) + 1, o.confirm !== false); w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.indexedDB = new IDBFactory(); w.fetch = () => Promise.reject(new Error('no network'));
  if (o.player) w.localStorage.setItem('lanenote.mode.v1', 'player');
  if (o.mets) w.localStorage.setItem('lanenote-rec-meets', JSON.stringify(o.mets));
  for (const s of ['auth_common.js', 'mode.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js', 'pubmeets.js', 'prepdel.js', 'yearbuild.js', 'suspect.js', 'print.js', 'review.js', 'tips.js']) { try { w.eval(src(s)); } catch (e) { if (s !== 'mode.js') throw e; } }
  assert(src('records_app.js').includes(tail));
  w.eval(src('records_app.js').replace(tail, 'window.__t={all:function(){return ALL;},put:function(a){return putMany(a,scope()).then(function(){return reload(scope());});},batches:function(){return batches;},files:function(f){return handleFilesIn(f,scope()).then(function(){renderBatches();});},rb:function(){renderBatches();},ev:function(s){return eval(s);}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
  const sch = w.document.getElementById('rbSchool'); sch.value = '架空'; sch.dispatchEvent(new w.Event('input', { bubbles: true })); await delay();
  return w;
}
const PAGE = ind('2026/09/06', '男子 １００ｍ 決勝', [pr(1, '架空 一郎', '架空中', '12.40'), pr(2, '架空 三郎', '架空中', '8.10', 3, 12), pr(3, '架空 五郎', '架空中', '12.90', 1, 13)]);
const B0 = { round: '決勝', heat: '', lane: '', bib: '', rank: '', comment: '', wind: '', kana: '', team: '架空中', grade: '2' };
const mk = (meet, date, name, event, mark) => withId(Object.assign({}, B0, { meet, date, name, event, mark }));
// 3つの組（同じ日・大会名2つ）＋組にならないもの（1件だけの組・3件の組・相手のいない記録）
const PAIRS = [['2026-08-26', '支部新人', '支部新人(1日目)', [['架空 一郎', '男子100m', '12.40'], ['架空 二郎', '男子100m', '12.80'], ['架空 三郎', '男子走幅跳', '5m10']]],
  ['2026-08-27', '支部新人', '支部新人(2日目)', [['架空 四郎', '男子200m', '25.90'], ['架空 五郎', '男子200m', '26.40']]],
  ['2026-09-06', '架空区大会', '架空区民大会', [['架空 六郎', '男子400m', '58.10'], ['架空 七郎', '男子400m', '59.20']]]];
const DATA = () => {
  const a = []; PAIRS.forEach(([d, m1, m2, L]) => L.forEach(([n, e, x]) => { a.push(mk(m1, d, n, e, x)); a.push(mk(m2, d, n, e, x)); }));
  a.push(mk('支部新人(1日目)', '2026-08-26', '架空 八郎', '男子100m', '13.10'));   // 相手がいない（消さない）
  a.push(mk('支部新人', '2026-08-26', '架空 一郎', '男子200m', '25.10'));          // 同じ選手の別の種目（消さない）
  a.push(mk('秋季A', '2026-10-01', '架空 九郎', '男子100m', '12.90')); a.push(mk('秋季B', '2026-10-01', '架空 九郎', '男子100m', '12.90'));   // 1組だけ（まとめない）
  ['三田A', '三田B', '三田C'].forEach(m => a.push(mk(m, '2026-10-04', '架空 十郎', '男子100m', '13.00')));   // 3件の組（まとめない）
  return a;
};
await check('決まり：dupClusters は日付と大会名の組でまとめる（2組以上・2件の組だけ）。meetOverlap は「重なる2件以上・その日の半分以上」のときだけ', () => {
  const L = S.scan(R, DATA(), {}), cs = S.dupClusters(L);
  assert.deepEqual(cs.map(c => [c.date, c.meets.join('／'), c.items.length]), [['2026-08-26', '支部新人／支部新人(1日目)', 3], ['2026-08-27', '支部新人／支部新人(2日目)', 2], ['2026-09-06', '架空区大会／架空区民大会', 2]]);
  assert(cs[0].side[1].every(r => r.meet === '支部新人(1日目)') && cs[0].side[0].every(r => r.meet === '支部新人'));
  const ex = [mk('支部新人', '2026-08-26', '架空 一郎', '男子100m', '12.40'), mk('支部新人', '2026-08-26', '架空 二郎', '男子100m', '12.80'), mk('支部新人', '2026-08-26', '架空 三郎', '男子100m', '13.30')];
  const inc = n => [['架空 一郎', '12.40'], ['架空 二郎', '12.80'], ['架空 八郎', '13.10'], ['架空 九郎', '13.50']].slice(0, n).map(([x, m]) => mk('支部新人(1日目)', '2026-08-26', x, '男子100m', m));
  assert.deepEqual(S.meetOverlap(R, inc(4), ex).map(q => [q.date, q.meet, q.inMeet, q.n, q.total]), [['2026-08-26', '支部新人', '支部新人(1日目)', 2, 4]]);
  assert.deepEqual(S.meetOverlap(R, inc(4).concat(mk('支部新人(1日目)', '2026-08-26', '架空 十郎', '男子100m', '14.00')), ex), [], '5件のうち2件（半分より少ない）');
  assert.deepEqual(S.meetOverlap(R, [mk('支部新人(1日目)', '2026-08-26', '架空 一郎', '男子100m', '12.40')], ex), [], '1件だけ');
  assert.deepEqual(S.meetOverlap(R, inc(2).map(r => withId(Object.assign({}, r, { meet: '支部新人' }))), ex), [], '同じ大会名');
  assert.deepEqual(S.meetOverlap(R, inc(2).map(r => withId(Object.assign({}, r, { date: '2026-08-27' }))), ex), [], 'ちがう日');
});
await check('🔍：組ごとのまとめの行（日付・大会名2つ・件数・ボタン3つ）。1件ずつの行も残る', async () => {
  const w = await page(), $ = id => w.document.getElementById(id);
  try {
    await w.__t.put(DATA()); await delay(100); $('rbSusOpen').click(); await delay();
    const cl = [...$('rbSus').querySelectorAll('.sus-cl')].map(x => x.querySelector('b').textContent);
    assert.deepEqual(cl, ['2026-08-26：『支部新人』と『支部新人(1日目)』で同じ記録が 3件', '2026-08-27：『支部新人』と『支部新人(2日目)』で同じ記録が 2件', '2026-09-06：『架空区大会』と『架空区民大会』で同じ記録が 2件']);
    const bt = [...$('rbSus').querySelector('.sus-cl').querySelectorAll('button')].map(b => b.textContent);
    assert.deepEqual(bt, ['🗑 『支部新人(1日目)』の方を3件まとめて消す', '🗑 『支部新人』の方を3件まとめて消す', '✔ まとめて問題ない']);
    assert.equal($('rbSus').querySelectorAll('.sus-list:not(.sus-bulk) > .sus-dup').length, 9, '1件ずつの行（7＋1組だけ＋3件の組）');
  } finally { w.close(); }
});
await check('まとめて消す：確認に件数・やめたら消さない・組の片方だけ消す（ほかの記録はそのまま）→ 元に戻すで全部1回で戻る', async () => {
  const w = await page(), $ = id => w.document.getElementById(id);
  try {
    await w.__t.put(DATA()); await delay(100); $('rbSusOpen').click(); await delay();
    const before = w.__t.all().map(r => r.id).sort(), del1 = DATA().filter(r => r.meet === '支部新人(1日目)' && r.name !== '架空 八郎').map(r => r.id).sort();
    const btn = () => $('rbSus').querySelector('.sus-cl [data-susbulk="del"][data-susside="1"]');
    let msg = ''; w.confirm = m => { msg = m; return false; }; btn().click(); await delay(200);
    assert.match(msg, /『支部新人\(1日目\)』（2026-08-26）の記録を 3件まとめて消します/); assert.deepEqual(w.__t.all().map(r => r.id).sort(), before, 'やめたら消さない');
    w.confirm = () => true; btn().click(); await delay(500);
    const now = w.__t.all().map(r => r.id).sort();
    assert.deepEqual(now, before.filter(id => !del1.includes(id)), '消えたのは組の『支部新人(1日目)』の3件だけ');
    assert(w.__t.all().some(r => r.name === '架空 八郎'), '相手のいない記録は残る'); assert(w.__t.all().some(r => r.name === '架空 一郎' && r.event === '男子200m'));
    assert.match($('rbSus').textContent, /『支部新人\(1日目\)』の方を 3件消しました/); assert.equal($('rbSus').querySelectorAll('.sus-cl').length, 2, 'のこり2組');
    $('rbSus').querySelector('[data-sus="undo"]').click(); await delay(500);
    assert.deepEqual(w.__t.all().map(r => r.id).sort(), before, '元に戻す：3件まとめて戻る'); assert.match($('rbSus').textContent, /元に戻しました（3件）/); assert.equal($('rbSus').querySelectorAll('.sus-cl').length, 3);
    // 1件ずつの「消す」もそのまま使える
    const one = $('rbSus').querySelector('.sus-list:not(.sus-bulk) [data-susdel]').getAttribute('data-susdel');
    $('rbSus').querySelector('.sus-list:not(.sus-bulk) [data-susdel]').click(); await delay(400); assert(!w.__t.all().some(r => r.id === one)); assert.equal(w.__t.all().length, before.length - 1);
  } finally { w.close(); }
});
await check('まとめて問題ない：その組の二重をこの端末で覚えて出さない（記録は消さない）。選手モードは消すボタンなし', async () => {
  const w = await page(), $ = id => w.document.getElementById(id);
  try {
    await w.__t.put(DATA()); await delay(100); $('rbSusOpen').click(); await delay(); const n0 = w.__t.all().length;
    $('rbSus').querySelectorAll('.sus-cl')[1].querySelector('[data-susbulk="ok"]').click(); await delay();
    assert.equal(Object.keys(JSON.parse(w.localStorage.getItem('lanenote-sus-ok'))).length, 2); assert.equal(w.__t.all().length, n0);
    assert.deepEqual([...$('rbSus').querySelectorAll('.sus-cl b')].map(x => x.textContent.slice(0, 10)), ['2026-08-26', '2026-09-06']);
    assert.match($('rbSus').textContent, /2件を「問題ない」にしました/);
  } finally { w.close(); }
  const w2 = await page({ player: true });
  try {
    await w2.__t.put(DATA()); await delay(100); w2.document.getElementById('rbSusOpen').click(); await delay();
    assert.equal(w2.document.querySelectorAll('#rbSus .sus-cl').length, 3); assert.equal(w2.document.querySelectorAll('#rbSus [data-susbulk="del"]').length, 0); assert.equal(w2.document.querySelectorAll('#rbSus [data-susbulk="ok"]').length, 3);
  } finally { w2.close(); }
});
// 取り込みの前：「同じ大会ですか？」
const OLD2 = b => ['架空 一郎', '架空 五郎'].map(n => { const o = Object.assign({}, b.all.recs.find(r => r.name === n), { meet: '架空区民大会', date: '2026-09-06' }); o.id = R.recId(o.meet, o.date, o); return o; });
async function imp(w) {
  await w.__t.files([new w.File([PAGE], 'rel001.html', { type: 'text/html' })]); await delay(200);
  const b = w.__t.batches()[0]; b.meta.name = '架空区大会'; b.meta.date = '2026-09-06'; b.meta.typedName = b.meta.typedDate = true;
  await w.__t.put(OLD2(b)); await delay(100); w.__t.rb(); await delay(); return b;
}
const recs = w => w.__t.all().map(r => [r.meet, r.name, r.mark]).sort();
await check('取り込みの前：同じ日に記録がほぼ同じ大会があれば「同じ大会ですか？」。答えるまで保存しない（自動で決めない）', async () => {
  const w = await page(), $ = id => w.document.getElementById(id);
  try {
    await imp(w); const q = w.document.querySelector('.rb-mq'); assert(q, '質問が出る');
    assert.match(q.textContent, /同じ日に、記録がほぼ同じ大会『架空区民大会』がすでにあります。同じ大会ですか？/);
    assert.deepEqual([...q.querySelectorAll('button')].map(b => b.textContent), ['同じ大会（重なる2件は入れず、新しい分だけ『架空区民大会』として入れる）', '別の大会として入れる']);
    w.document.querySelector('[data-save]').click(); await delay(400);
    assert.deepEqual(recs(w), [['架空区民大会', '架空 一郎', '12.40'], ['架空区民大会', '架空 五郎', '12.90']], '保存しない');
    assert.match(w.document.querySelector('.rb-batch').textContent, /「同じ大会ですか？」に答えてから保存してください/);
  } finally { w.close(); }
});
await check('「同じ大会」：重なる2件は入れず、新しい分だけ保存ずみの大会名で入れる。「選び直す」で戻せる', async () => {
  const w = await page(), $ = id => w.document.getElementById(id);
  try {
    await imp(w); w.document.querySelector('[data-mqv="same"]').click(); await delay();
    assert.match(w.document.querySelector('.rb-mq').textContent, /同じ大会：重なる記録は入れず/);
    w.document.querySelector('[data-mqv=""]').click(); await delay(); assert(w.document.querySelector('[data-mqv="same"]'), '選び直す');
    w.document.querySelector('[data-mqv="same"]').click(); await delay();
    w.document.querySelector('[data-save]').click(); await delay(500);
    assert.deepEqual(recs(w), [['架空区民大会', '架空 一郎', '12.40'], ['架空区民大会', '架空 三郎', '8.10'], ['架空区民大会', '架空 五郎', '12.90']]);
    assert.match($('rbDone').textContent, /2件はすでに保存済み/);
  } finally { w.close(); }
});
await check('「別の大会」：重なる記録も入れる。保存の前の「まとめて外す」で大会名ちがいの重複をまとめて入れないにできる', async () => {
  const w = await page();
  try {
    await imp(w); w.document.querySelector('[data-mqv="diff"]').click(); await delay();
    const bt = w.document.querySelector('.rb-sus [data-susxall]'); assert(bt, 'まとめて外すボタン'); assert.equal(bt.textContent, 'この大会名ちがいの重複2件をまとめて外す');
    bt.click(); await delay();
    assert(!w.document.querySelector('.rb-sus [data-susxall]')); assert.match(w.document.querySelector('.rb-sus').textContent, /2件とも入れません/);
    w.document.querySelector('[data-save]').click(); await delay(500);
    assert.deepEqual(recs(w), [['架空区大会', '架空 三郎', '8.10'], ['架空区民大会', '架空 一郎', '12.40'], ['架空区民大会', '架空 五郎', '12.90']]);
  } finally { w.close(); }
  const w2 = await page();
  try {
    await imp(w2); w2.document.querySelector('[data-mqv="diff"]').click(); await delay(); w2.document.querySelector('[data-save]').click(); await delay(500);
    assert.equal(recs(w2).length, 5, '別の大会：3件とも入れる'); assert.equal(recs(w2).filter(r => r[0] === '架空区大会').length, 3);
  } finally { w2.close(); }
});
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
