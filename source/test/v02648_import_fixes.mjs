// v0.26.48 結果の取り込みの直し（精度テストで見つけたもの）。架空データのみ・本番に接続しない
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.48] 結果の取り込みの直し');

// ---------- 学校名 ----------
await check('高体連の「3・〇〇」（支部番号・学校名）は「〇〇高」に合う（中体連の「地区・学校」とはしない）。「〇〇中」には合わない', () => {
  assert.equal(R.cyuTeam('3・架空'), ''); assert.equal(R.cyuTeam('12・架空'), '');
  assert.equal(R.matchSchool('3・架空', '架空高'), true); assert.equal(R.matchSchool('3・架空', '架空中'), false);
  assert.equal(R.matchSchool('墨　田・架空', '架空中'), true);   // 中体連の形はこれまでどおり
  assert.equal(R.matchSchool('墨　田・架空', '架空高'), false);
});
await check('所属が「東　京<br>架空中」（都道府県の字の間に空白）でも合う。ほかの学校には合わない', () => {
  assert.equal(R.matchSchool('東 京 架空中', '架空中'), true); assert.equal(R.matchSchool('東　京 架空高', '架空高'), true);
  assert.equal(R.matchSchool('東 京 架空中', '架空高'), false); assert.equal(R.matchSchool('東 京 見本中', '架空中'), false);
  assert.equal(R.matchSchool('東 京・架空高', '架空高'), true);
});
// ---------- 記録・学年 ----------
await check('失格の理由が2つ以上「DQ,T1,T2」も DQ（理由は備考）。「DQ,FS」はこれまでどおり', () => {
  assert.deepEqual(R.cleanMark('DQ,T1,T2'), { mark: 'DQ', wind: null, tags: ['T1', 'T2'] });
  assert.deepEqual(R.cleanMark('DQ,FS'), { mark: 'DQ', wind: null, tags: ['FS'] });
  assert.equal(R.cleanMark('12.34').mark, '12.34');
});
await check('種目名の学年の範囲「2・3年」は学年にしない・種目名もそのまま（「3年」だけ取って「2・」が残らない）', () => {
  assert.deepEqual(R.gradeFromEvent('男子2支部2・3年 走幅跳'), { grade: '', event: '男子2支部2・3年 走幅跳', changed: false });
  assert.deepEqual(R.gradeFromEvent('男子中学2・3年 1500m'), { grade: '', event: '男子中学2・3年 1500m', changed: false });
  assert.equal(R.gradeFromEvent('男子2支部1年 800m').grade, '1');
  assert.equal(R.eventCat('男子中学2・3年 1500m'), '2・3年');
});
// ---------- 種目名の前置き ----------
await check('種目名の前置き（OP・Rising Star中学・U16代表選考・オープン・招待）を外して同じ種目にする。距離・高さ・男女・区分は残す', () => {
  assert.equal(R.normEvent('男子OP 110mH(1.067m)'), '男子110mH(1.067m)');
  assert.equal(R.normEvent('男子OP 3000mSC'), '男子3000mSC');
  assert.equal(R.normEvent('男子Rising Star中学 100m'), '男子100m');
  assert.equal(R.normEvent('男子U16代表選考 150m'), '男子150m');
  assert.equal(R.normEvent('女子オープン 100m'), '女子100m');
  assert.equal(R.normEvent('男子招待 1500m'), '男子1500m');
  assert.equal(R.normEvent('男子OP'), '男子OP');   // 種目が残らないときは外さない
  assert.equal(R.baseEvent('男子OP 110mH(1.067m)').name, '110mH');
  assert.equal(R.eventCat('男子U16代表選考 150m'), 'U16');
  assert.equal(R.divisionOf({ event: '男子Rising Star中学 100m', team: '' }), 'jh');   // 中学の区分は消えない
  assert.notEqual(R.baseEvent('男子 400m').name, R.baseEvent('男子 4×400mR').name);
});
await check('ハードルの「(1.067m_9.14m)」：ふつうの間隔は高さだけ（同じ種目）、ちがう間隔は区別して残す', () => {
  assert.deepEqual(R.baseEvent('男子 110mH(1.067m_9.14m)'), { name: '110mH', spec: '1.067m' });
  assert.deepEqual(R.baseEvent('男子110mJH(0.991m_9.14m)'), { name: '110mJH', spec: '0.991m' });
  assert.deepEqual(R.baseEvent('男子110mJH(0.991m_8.9m)'), { name: '110mJH', spec: '0.991m_8.9m' });
});
await check('保存の ID・同じ記録の判定は前の版と同じ（前置きのある種目を取り込み直しても二重にならない）', () => {
  const r = { event: '男子OP 110mH(1.067m)', team: '3・架空', name: '架空 一郎', round: 'タイムレース', heat: 1, mark: '15.00' };
  assert.equal(R.recId('架空大会', '2026-10-24', r), 'v7' + JSON.stringify(['架空大会', '2026-10-24', R.normSchool(r.team), R.rawDivisionOf(r), '男子OP110mH(1.067m)', '', '', 'タイムレース', '1', '架空一郎', '15.00']));
  const u = Object.assign({}, r, { event: '男子U16代表選考 150m' });
  assert(R.recId('架空大会', '2026-10-24', u).includes('"男子代表選考150m",""'));
});

// ---------- PDF（座標の架空ページ） ----------
const it = (str, x, y, h = 9) => ({ str, x, y, w: str.length * 8, h });
const pg = items => ({ width: 620, height: 800, items });
await check('PDF の投てき：試技の「×」が所属にくっつかない（「架空中××」にならない）', () => {
  const P = [pg([it('男子砲丸投(5.000kg)', 20, 40, 12), it('決勝', 20, 60),
    it('順位', 20, 90), it('試順', 45, 90), it('ﾅﾝﾊﾞｰ', 70, 90), it('氏名', 110, 90), it('所属', 190, 90), it('1回目', 250, 90), it('2回目', 290, 90), it('3回目', 330, 90), it('記録', 380, 90),
    it('1', 20, 110), it('3', 45, 110), it('301', 70, 110), it('架空 四郎', 110, 110), it('架空中', 190, 110), it('×', 252, 110), it('×', 292, 110), it('9m39', 330, 110), it('9m39', 380, 110)])];
  const r = R.parsePdf(P, { school: '架空中' });
  assert.equal(r.recs.length, 1); assert.equal(r.recs[0].team, '架空中'); assert.equal(r.recs[0].mark, '9m39');
});
await check('PDF の2段組み（左＝組の結果・右＝「タイムレース上位8位」）：右の見出しを左の組に付けない。右の表は左の行の総合順位になる', () => {
  const L = (y, a) => a.map(([s, x]) => it(s, x, y));
  const P = [pg([it('男子100m', 20, 40, 12), it('タイムレース', 20, 60),
    it('1組', 20, 80), it('(風:+1.0)', 120, 80), it('タイムレース上位8位', 330, 80),
    ...L(95, [['順位', 20], ['ﾅﾝﾊﾞｰ', 50], ['氏名', 90], ['所属', 170], ['記録', 240], ['順位', 330], ['ﾅﾝﾊﾞｰ', 360], ['氏名', 400], ['所属', 480], ['記録', 550]]),
    ...L(110, [['1', 20], ['101', 50], ['架空 一郎', 90], ['架空中', 170], ['12.00', 240], ['1', 330], ['205', 360], ['見本 二郎', 400], ['見本中', 480], ['11.80', 550]]),
    ...L(125, [['2', 20], ['102', 50], ['例示 三郎', 90], ['例示中', 170], ['12.50', 240], ['2', 330], ['101', 360], ['架空 一郎', 400], ['架空中', 480], ['12.00', 550]])])];
  const r = R.parsePdf(P, {}), a = r.recs.filter(x => x.name === '架空 一郎');
  assert.equal(a.length, 1, JSON.stringify(r.recs.map(x => [x.name, x.round, x.heat, x.rank])));
  assert.equal(a[0].round, 'タイムレース'); assert.equal(a[0].heat, 1); assert.equal(a[0].rank, 1); assert.equal(String(a[0].overall), '2');
  const one = [pg([it('男子100m', 20, 40, 12), it('決勝', 20, 60), it('(風:+1.0)', 120, 80), ...L(95, [['順位', 20], ['ﾅﾝﾊﾞｰ', 50], ['氏名', 90], ['所属', 170], ['記録', 240]]), ...L(110, [['1', 20], ['101', 50], ['架空 一郎', 90], ['架空中', 170], ['12.00', 240]])])];
  assert.equal(R.parsePdf(one, {}).recs[0].round, '決勝');   // 1段はこれまでどおり
});

// ---------- gold.jaic.org 形のリレー（架空） ----------
const goldRelay = (date, title, blocks) => `<!-- ${date} 10:00:00 15 (Lsoku=0)-->\n<html lang="ja"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${title}</title></head>\n${title}<br>\n<hr>\n` + blocks.map((b, i) => `<font color="#00008${i % 2}">${b}<br>\n</font>`).join('') + '<hr>\n<a href="kyougi.html">競技一覧画面へ</a></body></html>';
await check('gold のリレー：ページの日付を種目ごとの日付（dday）にする。番号なしで並ぶ4人（中学の速報）も走者として読む。DNS のチームも読む', () => {
  const h = goldRelay('2026/10/25', '男子１年 ４×１００ｍ 予選1組', ['1位　　50.13<br>架空<br>架空 一郎<br>架空 二郎<br>架空 三郎<br>架空 四郎<br>', '　　DNS<br>見本<br>見本 一郎<br>見本 二郎<br>見本 三郎<br>見本 四郎<br>']);
  const g = R.parseRelayGold(h);
  assert.equal(g.cands.length, 2); assert.equal(g.cands[0].dday, 'd:2026-10-25'); assert.equal(g.cands[0].mark, '50.13');
  assert.deepEqual(g.cands[0].runners.map(x => x.name), ['架空 一郎', '架空 二郎', '架空 三郎', '架空 四郎']);
  assert.equal(g.cands[1].mark, 'DNS'); assert.equal(g.cands[1].rank, '');
  const h2 = goldRelay('2026/10/25', '男子 ４×１００ｍ 決勝', ['1位　　44.00<br>架空高<br>(1)架空 一郎(2)<br>(2)架空 二郎(2)<br>(3)架空 三郎(1)<br>(4)架空 四郎(1)<br>']);
  assert.deepEqual(R.parseRelayGold(h2).cands[0].runners.map(x => x.name), ['架空 一郎', '架空 二郎', '架空 三郎', '架空 四郎']);   // 「(1)」の形はこれまでどおり
});

await check('PC 用の表のリレー：記録の欄が空でコメントの欄に「DNS」のチームも、記録なし（DNS）として読む。ページの日付も付ける', () => {
  const h = '<!-- 2026/10/25 10:00:00 -->\n<html><head><title>男子共通 4×100m タイムレース2組</title></head><body><table>' +
    '<tr><th>順位</th><th>ﾚｰﾝ</th><th>チーム</th><th>氏名</th><th>ﾌﾘｶﾞﾅ</th><th>記録</th><th>ｺﾒﾝﾄ</th></tr>' +
    '<tr><td>1</td><td>3</td><td>見本中</td><td>(1)見本 一郎<br>(2)見本 二郎<br>(3)見本 三郎<br>(4)見本 四郎</td><td><br></td><td>50.00</td><td><br></td></tr>' +
    '<tr><td><br></td><td>2</td><td>架空中B</td><td>(1)<br>(2)<br>(3)<br>(4)</td><td><br></td><td><br></td><td>DNS </td></tr></table></body></html>';
  const g = R.parseRelayGold(h);
  assert.deepEqual(g.cands.map(c => [c.team, c.mark, c.rank, c.dday]), [['見本中', '50.00', 1, 'd:2026-10-25'], ['架空中B', 'DNS', '', 'd:2026-10-25']]);
});

// ---------- 画面（jsdom・実際のソース） ----------
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
async function page(url, mets, school) {
  const d = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = m => { w.__alert = m; }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
  w.eval('Date.now = (function () { return function () { return Date.parse("2026-10-27T03:00:00Z"); }; })();');
  w.localStorage.setItem('lanenote-rec-meets', JSON.stringify(mets));
  for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js', 'pubmeets.js', 'prepdel.js']) w.eval(src(s));
  assert(src('records_app.js').includes(tail));
  w.eval(src('records_app.js').replace(tail, 'window.__t={all:function(){return ALL;},handle:function(f){return handleFiles(f,scope());},batches:function(){return batches;}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
  const sch = w.document.getElementById('rbSchool'); sch.value = school; sch.dispatchEvent(new w.Event('input', { bubbles: true })); await delay();
  return w;
}
const IMP = k => 'https://masarun0721.github.io/lane-note/records.html?imp=' + encodeURIComponent(k);
async function paste(w, t) { const d = w.document; d.getElementById('rbPaste').value = t; d.getElementById('rbPasteGo').click(); await delay(250); }
async function save(w) { w.document.querySelector('#rbBatches [data-save]').click(); await delay(500); }
const dayRows = w => [...w.document.querySelectorAll('.rb-days tr')].slice(1).map(tr => [tr.cells[0].textContent, tr.cells[1].textContent, tr.querySelector('input').value, tr.cells[4].textContent.replace(/\s+/g, ' ').trim()]);
const HEAD = '順位\tナンバー\t氏名\t所属\t記録\n';

const KM = '2026-10-24|架空学年別大会';
const M1 = { [KM]: { plan: 1, date: '2026-10-24', end: '2026-10-25', meet: '架空学年別大会' } };
const T_CAT = '架空学年別大会\n10月24日\n男子1年 800m タイムレース\n' + HEAD + '1\t11\t架空 一郎(1)\t架空高\t2:10.00\n10月25日\n男子2年 800m タイムレース\n' + HEAD + '1\t12\t架空 二郎(2)\t架空高\t2:05.00\n';
await check('複数日の大会：「1年800m」と「2年800m」は日付の表で別の種目（区分も見る）。それぞれ資料の日付で保存し、区分の控え（ecat）は保存しない', async () => {
  const w = await page(IMP(KM), M1, '架空高'); await paste(w, T_CAT);
  assert.deepEqual(dayRows(w), [['男子800m（1年）', 'タイムレース', '2026-10-24', '資料'], ['男子800m（2年）', 'タイムレース', '2026-10-25', '資料']]);
  assert(!/日付要確認/.test(w.document.getElementById('rbBatches').textContent));
  await save(w);
  const a = w.__t.all().filter(r => r.meet === '架空学年別大会').map(r => [r.event, r.grade, r.date]).sort();
  assert.deepEqual(a, [['男子800m', '1', '2026-10-24'], ['男子800m', '2', '2026-10-25']]);
  assert(w.__t.all().every(r => !('ecat' in r) && !('dday' in r)));
  w.close();
});

const KA = '2026-10-24|架空支部大会（1日目）', KB = '2026-10-25|架空支部大会（2日目）';
const M2 = { [KA]: { plan: 1, date: '2026-10-24', meet: '架空支部大会（1日目）' }, [KB]: { plan: 1, date: '2026-10-25', meet: '架空支部大会（2日目）' }, '2026-10-25|見本区大会': { plan: 1, date: '2026-10-25', meet: '見本区大会' } };
const T_TWO = '架空支部大会\n10月24日\n男子100m 決勝\n' + HEAD + '1\t11\t架空 一郎(2)\t架空高\t11.50\n10月25日\n男子200m 決勝\n' + HEAD + '1\t11\t架空 一郎(2)\t架空高\t23.00\n';
await check('予定の期間の外の日付の行：警告を出し、ふつうは保存しない。その日の大会予定（名前が近いもの）を勧め、選んだときだけその名前で保存', async () => {
  let w = await page(IMP(KA), M2, '架空高'); await paste(w, T_TWO);
  const tx = w.document.getElementById('rbBatches').textContent;
  assert(/大会予定の期間の外の日付の記録：2026-10-25（1件・大会予定「架空支部大会（2日目）」の日）/.test(tx), tx);
  const sel = w.document.querySelector('[data-oor="2026-10-25"]'); assert.equal(sel.value, 'skip');
  await save(w);
  assert.deepEqual(w.__t.all().map(r => [r.meet, r.event, r.date]), [['架空支部大会（1日目）', '男子100m', '2026-10-24']]);
  w.close();
  w = await page(IMP(KA), M2, '架空高'); await paste(w, T_TWO);
  const s2 = w.document.querySelector('[data-oor="2026-10-25"]'); s2.value = 'sug'; s2.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  await save(w);
  assert.deepEqual(w.__t.all().map(r => [r.meet, r.event, r.date]).sort(), [['架空支部大会（1日目）', '男子100m', '2026-10-24'], ['架空支部大会（2日目）', '男子200m', '2026-10-25']]);
  w.close();
  // 資料の日付がどれも期間の外（作成日などかもしれない）ときは、これまでどおり（警告しない・保存する）
  w = await page(IMP(KA), M2, '架空高'); await paste(w, '架空支部大会\n10月25日\n男子200m 決勝\n' + HEAD + '1\t11\t架空 一郎(2)\t架空高\t23.00\n');
  assert(!/期間の外/.test(w.document.getElementById('rbBatches').textContent)); await save(w);
  assert.equal(w.__t.all().length, 1); w.close();
});

const KC = '2026-10-24|架空中学大会';
const M3 = { [KC]: { plan: 1, date: '2026-10-24', end: '2026-10-25', meet: '架空中学大会' } };
const goldInd = (date, title, rows) => `<!-- ${date} 09:00:00 15 (Lsoku=0)-->\n<html lang="ja"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${title}</title></head>\n${title}<br>\n<hr>\n<center>風:+0.5<br></center>\n` + rows.map(r => `<font color="#000080">${r}<br>\n</font>`).join('') + '<hr>\n<a href="kyougi.html">競技一覧画面へ</a></body></html>';
await check('中学の速報（gold 形）：チーム名「架空」（中なし）のリレーも「架空中」で取り込む。DNS のチームも記録なしで入る。2日目のリレーは2日目の日付', async () => {
  const w = await page(IMP(KC), M3, '架空中');
  const f = (n, s) => new w.File([s], n, { type: 'text/html' });
  await w.__t.handle([
    f('rel001.html', goldInd('2026/10/24', '男子１年 １００ｍ 決勝', ['1位　(11)<br>　12.50<br>架空 一郎(1)<br>墨　田・架空<br>', '2位　(21)<br>　12.80<br>見本 二郎(1)<br>江　東・見本<br>'])),
    f('rel002.html', goldRelay('2026/10/25', '男子１年 ４×１００ｍ 決勝', ['1位　　50.13<br>架空<br>架空 一郎<br>架空 二郎<br>架空 三郎<br>架空 四郎<br>', '　　DNS<br>架空B<br>架空 五郎<br>架空 六郎<br>架空 七郎<br>架空 八郎<br>', '2位　　51.00<br>見本<br>見本 一郎<br>見本 二郎<br>見本 三郎<br>見本 四郎<br>']))]);
  await delay(300);
  const t = w.document.getElementById('rbBatches').textContent;
  assert(/2チーム/.test(t), t.slice(0, 600));
  await save(w);
  const rel = w.__t.all().filter(r => R.isRelay(r.event)).map(r => [r.team, r.mark, r.date]).sort();
  assert.deepEqual(rel, [['架空', '50.13', '2026-10-25'], ['架空B', 'DNS', '2026-10-25']]);
  const ind = w.__t.all().filter(r => !R.isRelay(r.event)).map(r => [r.mark, r.date]);
  assert.deepEqual(ind, [['12.50', '2026-10-24']]);
  w.close();
});
await check('高校の速報で「中」なしのチーム名は、これまでどおり「〇〇中」に合わせない', async () => {
  const w = await page(IMP(KC), M3, '架空中');
  const f = (n, s) => new w.File([s], n, { type: 'text/html' });
  await w.__t.handle([f('rel001.html', goldInd('2026/10/24', '男子 １００ｍ 決勝', ['1位　(11)<br>　12.50<br>架空 一郎(1)<br>3・架空<br>'])),
    f('rel002.html', goldRelay('2026/10/25', '男子 ４×１００ｍ 決勝', ['1位　　44.13<br>架空<br>(1)架空 一郎(1)<br>(2)架空 二郎(1)<br>(3)架空 三郎(1)<br>(4)架空 四郎(1)<br>']))]);
  await delay(300);
  assert(!/🏃 リレー<\/b>：1チーム/.test(w.document.getElementById('rbBatches').innerHTML));
  w.close();
});
console.log(JSON.stringify({ passed: pass, failed: fail }));
if (fail) process.exit(1);
