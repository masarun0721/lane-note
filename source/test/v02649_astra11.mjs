// v0.26.49 監査11回目（C1101〜C1105）：監査の再現（独立検証スクリプト）を、安全な動きを確かめるテストに反転したもの。架空データのみ。
// 実際のソース・画面（jsdom）・fake-indexeddb。クラウドにはつながない。保存のあとに大会・日付・区分・件数と、関係のない記録が残ることまで見る
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.49] 監査11回目の指摘（C1101〜C1105）');

const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
async function page(url, mets, school, o={}) {
  const d = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = m => { w.__alert = m; }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = o.idb || new IDBFactory();
  w.eval('Date.now = (function () { return function () { return Date.parse("2026-10-27T03:00:00Z"); }; })();');
  w.localStorage.setItem('lanenote-rec-meets', JSON.stringify(mets));
  if(o.snaps) await putSnaps(w,o.snaps);
  for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js', 'pubmeets.js', 'prepdel.js']) w.eval(src(s));
  assert(src('records_app.js').includes(tail));
  w.eval(src('records_app.js').replace(tail, 'window.__t={all:function(){return ALL;},put:function(a){return putMany(a,scope()).then(function(){return reload(scope());});},handle:function(f){return handleFiles(f,scope());},batches:function(){return batches;}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
  const sch = w.document.getElementById('rbSchool'); sch.value = school; sch.dispatchEvent(new w.Event('input', { bubbles: true })); await delay();
  return w;
}
const IMP = k => 'https://masarun0721.github.io/lane-note/records.html?imp=' + encodeURIComponent(k);
async function paste(w, t) { const d = w.document; d.getElementById('rbPaste').value = t; d.getElementById('rbPasteGo').click(); await delay(250); }
async function save(w) { w.document.querySelector('#rbBatches [data-save]').click(); await delay(500); }
const dayRows = w => [...w.document.querySelectorAll('.rb-days tr')].slice(1).map(tr => [tr.cells[0].textContent, tr.cells[1].textContent, tr.querySelector('input').value, tr.cells[4].textContent.replace(/\s+/g, ' ').trim()]);
const HEAD = '順位\tナンバー\t氏名\t所属\t記録\n';

function putSnaps(w, snaps) {
  return new Promise((ok, ng) => { const q = w.indexedDB.open('lanenote-prep', 1); q.onupgradeneeded = () => q.result.createObjectStore('snap', { keyPath: 'id' }); q.onerror = () => ng(q.error);
    q.onsuccess = () => { const db = q.result, tx = db.transaction('snap', 'readwrite'); snaps.forEach(s => tx.objectStore('snap').put(Object.assign({ id: s.owner + '|' + s.key, at: 1, docs: {} }, s))); tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => ng(tx.error); }; });
}
const goldRelay = (date, title, blocks) => `<!-- ${date} 10:00:00 15 (Lsoku=0)-->\n<html lang="ja"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${title}</title></head>\n${title}<br>\n<hr>\n` + blocks.map((b, i) => `<font color="#00008${i % 2}">${b}<br>\n</font>`).join('') + '<hr>\n<a href="kyougi.html">競技一覧画面へ</a></body></html>';
const goldInd = (date, title, rows) => `<!-- ${date} 09:00:00 15 (Lsoku=0)-->\n<html lang="ja"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${title}</title></head>\n${title}<br>\n<hr>\n<center>風:+0.5<br></center>\n` + rows.map(r => `<font color="#000080">${r}<br>\n</font>`).join('') + '<hr>\n<a href="kyougi.html">競技一覧画面へ</a></body></html>';
const KA='2026-10-24|架空大会A', KB='2026-10-26|架空大会B';
const plans={ [KA]:{plan:1,date:'2026-10-24',end:'2026-10-25',meet:'架空大会A'}, [KB]:{plan:1,date:'2026-10-26',meet:'架空大会B'} };
const row=(date,event,mark,name='架空 一郎',bib='11')=>date+'\n'+event+' 決勝\n'+HEAD+'1\t'+bib+'\t'+name+'(2)\t架空高\t'+mark+'\n';


// 関係のない記録（別の大会）。どのテストでも最後まで残ることを確かめる
const OTHER = { meet: '見本記録会', date: '2026-09-01', event: '男子100m', name: '架空 九郎', team: '架空高', mark: '11.90', round: '決勝', heat: '', lane: '', bib: '', rank: 1, grade: '2', kana: '', wind: '', comment: '' };
async function putOther(w) { const o = Object.assign({}, OTHER); o.id = R.recId(o.meet, o.date, o); await w.__t.put([o]); await delay(150); return o.id; }
const J = x => JSON.parse(JSON.stringify(x));
const has = (w, id) => w.__t.all().some(r => r.id === id);
const rows3 = w => w.__t.all().filter(r => r.meet !== '見本記録会').map(r => [r.meet, r.date, r.event, r.mark]).sort();

await check('C1101：期間の外の行を別の大会（大会予定）へ振り分けても、元の大会の同じ記録は消えない。プレビューに置き換えの予告も出ない。取り込み直しても増えない', async () => {
  const w = await page(IMP(KA), plans, '架空高');
  try {
    const oid = await putOther(w);
    await paste(w, '架空大会A\n' + row('10月24日', '男子100m', '11.50')); await save(w);
    const old = w.__t.all().find(r => r.meet === '架空大会A'); assert.equal(old.date, '2026-10-24');
    for (let k = 0; k < 2; k++) {
      await paste(w, '架空大会A\n' + row('10月25日', '男子200m', '23.00') + row('10月26日', '男子100m', '11.50'));
      const sel = w.document.querySelector('[data-oor="2026-10-26"]'); assert(sel); assert.equal(sel.value, 'skip');
      sel.value = 'sug'; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
      assert(!/置き換えます/.test(w.document.getElementById('rbBatches').textContent));
      await save(w);
      assert(!/日付を直しました/.test(w.document.getElementById('rbDone').textContent));
      assert(has(w, old.id), '元の大会Aの100mが残る');
      assert.deepEqual(rows3(w), [['架空大会A', '2026-10-24', '男子100m', '11.50'], ['架空大会A', '2026-10-25', '男子200m', '23.00'], ['架空大会B', '2026-10-26', '男子100m', '11.50']]);
    }
    assert(has(w, oid), '関係のない記録が残る');
  } finally { w.close(); }
});

await check('C1101：「今の大会名のまま保存」を選んだ期間の外の行も、元の日の同じ記録を消さない', async () => {
  const w = await page(IMP(KA), plans, '架空高');
  try {
    const oid = await putOther(w);
    await paste(w, '架空大会A\n' + row('10月24日', '男子100m', '11.50')); await save(w);
    const old = w.__t.all().find(r => r.meet === '架空大会A');
    await paste(w, '架空大会A\n' + row('10月25日', '男子200m', '23.00') + row('10月26日', '男子100m', '11.50'));
    const sel = w.document.querySelector('[data-oor="2026-10-26"]'); sel.value = 'here'; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
    await save(w);
    assert(has(w, old.id)); assert(has(w, oid));
    assert.deepEqual(rows3(w), [['架空大会A', '2026-10-24', '男子100m', '11.50'], ['架空大会A', '2026-10-25', '男子200m', '23.00'], ['架空大会A', '2026-10-26', '男子100m', '11.50']]);
  } finally { w.close(); }
});

await check('対照（C1101）：同じ大会の期間の中の正しい日付の直し（v0.26.47）はこれまでどおり。プレビューに大会名と日付を出す', async () => {
  const w = await page(IMP(KA), plans, '架空高');
  try {
    const oid = await putOther(w);
    await paste(w, '架空大会A\n' + row('', '男子100m', '11.50')); await save(w);   // 日付なし → 開始日（24日）
    assert.deepEqual(rows3(w), [['架空大会A', '2026-10-24', '男子100m', '11.50']]);
    await paste(w, '架空大会A\n' + row('10月25日', '男子100m', '11.50') + row('10月24日', '男子200m', '23.00', '見本 二郎', '21'));
    const t = w.document.querySelector('.rb-days').textContent; assert(/置き換えます/.test(t) && /架空大会A 男子100m 架空 一郎 11\.50：2026-10-24 → 2026-10-25/.test(t), t);
    await save(w);
    assert.deepEqual(rows3(w), [['架空大会A', '2026-10-24', '男子200m', '23.00'], ['架空大会A', '2026-10-25', '男子100m', '11.50']]);
    assert(has(w, oid));
  } finally { w.close(); }
});

await check('対照：期間の外の行を「保存しない」なら、元の大会の行は残り、Bには入らない', async () => {
  const w = await page(IMP(KA), plans, '架空高');
  try {
    await paste(w, '架空大会A\n' + row('10月24日', '男子100m', '11.50')); await save(w); const old = w.__t.all()[0];
    await paste(w, '架空大会A\n' + row('10月25日', '男子200m', '23.00') + row('10月26日', '男子100m', '11.50')); await save(w);
    assert(has(w, old.id)); assert.equal(w.__t.all().length, 2); assert(!w.__t.all().some(r => r.meet === '架空大会B'));
  } finally { w.close(); }
});

await check('C1102：期間の中の日付がほかの学校の行だけでも、自分の学校の期間の外の行に警告と「保存しない」が付く。選べばその行き先で保存', async () => {
  const t = '架空大会A\n' + row('10月24日', '男子200m', '23.50', '見本 二郎', '21').replace('架空高', '見本高') + row('10月26日', '男子100m', '11.50');
  let w = await page(IMP(KA), plans, '架空高');
  try {
    const oid = await putOther(w);
    await paste(w, t);
    const sel = w.document.querySelector('[data-oor="2026-10-26"]'); assert(sel); assert.equal(sel.value, 'skip');
    assert(/大会予定の期間の外の日付の記録：2026-10-26（1件・大会予定「架空大会B」の日）/.test(w.document.getElementById('rbBatches').textContent));
    await save(w);
    assert.deepEqual(rows3(w), []); assert(has(w, oid));
    assert(/期間の外の日付なので保存しませんでした/.test(w.document.querySelector('[data-st]').textContent));
  } finally { w.close(); }
  w = await page(IMP(KA), plans, '架空高');
  try {
    await paste(w, t); const sel = w.document.querySelector('[data-oor="2026-10-26"]'); sel.value = 'sug'; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
    await save(w); assert.deepEqual(rows3(w), [['架空大会B', '2026-10-26', '男子100m', '11.50']]);
  } finally { w.close(); }
});

await check('対照（C1102）：資料の日付がどれも期間の外（ほかの学校の行も）なら、これまでどおり警告しない', async () => {
  const w = await page(IMP(KA), plans, '架空高');
  try {
    await paste(w, '架空大会A\n' + row('10月26日', '男子200m', '23.50', '見本 二郎', '21').replace('架空高', '見本高') + row('10月26日', '男子100m', '11.50'));
    assert.equal(w.document.querySelector('[data-oor]'), null);
  } finally { w.close(); }
});

await check('C1104：学年別の種目（男子2年800m）は、表示は「（2年）」のまま、タイムテーブルの2年の日（25日）で保存。1年は24日', async () => {
  const tt = [{ event: '800m', gender: '男子', cat: '1年', round: '決勝', date: '10/24' }, { event: '800m', gender: '男子', cat: '2年', round: '決勝', date: '10/25' }];
  const w = await page(IMP(KA), plans, '架空高', { snaps: [{ owner: '|', key: KA, end: '2026-10-25', snap: { st: { tt, ttName: '架空タイムテーブル.pdf' } } }] });
  try {
    const oid = await putOther(w);
    await paste(w, '架空大会A\n' + row('', '男子2年800m', '2:05.00') + row('', '男子1年800m', '2:10.00', '見本 二郎', '21')); await delay(200);
    assert.deepEqual(dayRows(w).map(r => r.slice(0, 4)), [['男子800m（2年）', '決勝', '2026-10-25', 'タイムテーブル'], ['男子800m（1年）', '決勝', '2026-10-24', 'タイムテーブル']]);
    await save(w);
    assert.deepEqual(w.__t.all().filter(r => r.meet === '架空大会A').map(r => [r.event, r.grade, r.date]).sort(), [['男子800m', '1', '2026-10-24'], ['男子800m', '2', '2026-10-25']]);
    assert(has(w, oid)); assert(w.__t.all().every(r => !('ecat' in r) && !('_oor' in r)));
  } finally { w.close(); }
});

await check('C1104：タイムテーブルに区分が書いてあって、その区分がないときは推測しない（開始日のまま要確認）', async () => {
  const tt = [{ event: '800m', gender: '男子', cat: '1年', round: '決勝', date: '10/25' }];
  const w = await page(IMP(KA), plans, '架空高', { snaps: [{ owner: '|', key: KA, end: '2026-10-25', snap: { st: { tt } } }] });
  try { await paste(w, '架空大会A\n' + row('', '男子2年800m', '2:05.00')); await delay(200); const r = dayRows(w)[0]; assert.equal(r[2], '2026-10-24'); assert.match(r[3], /この区分（2年）が見つかりません/); } finally { w.close(); }
});

await check('対照：学年のない種目はこれまでどおりタイムテーブルで合わせる', async () => {
  const tt = [{ event: '800m', gender: '男子', round: '決勝', date: '10/25' }];
  const w = await page(IMP(KA), plans, '架空高', { snaps: [{ owner: '|', key: KA, end: '2026-10-25', snap: { st: { tt } } }] });
  try { await paste(w, '架空大会A\n' + row('', '男子800m', '2:05.00')); await delay(200); assert.deepEqual(dayRows(w)[0].slice(2), ['2026-10-25', 'タイムテーブル']); } finally { w.close(); }
});

const KJ='2026-10-24|架空合同大会', JP={[KJ]:{plan:1,date:'2026-10-24',end:'2026-10-25',meet:'架空合同大会'}};
const legs=['架空 一郎','架空 二郎','架空 三郎','架空 四郎'];
const block=(mark,numbered=false,names=legs)=>(/^(DNS|DNF|DQ)$/.test(mark)?'　　':'1位　　')+mark+'<br>架空<br>'+names.map((n,i)=>(numbered?'('+(i+1)+')':'')+n+'<br>').join('');
const file=(w,n,h)=>new w.File([h],n,{type:'text/html'});


await check('C1103：中学の個人のページと「高校」と書かれたリレーのページを一緒に入れても、高校のリレーは中学の候補にしない。保存しても入らない', async () => {
  const w = await page(IMP(KJ), JP, '架空中');
  try {
    const oid = await putOther(w);
    await w.__t.handle([
      file(w, 'junior.html', goldInd('2026/10/24', '男子中学100m 決勝', ['1位　(11)<br>　12.50<br>架空 一郎(1)<br>墨　田・架空<br>'])),
      file(w, 'senior-relay.html', goldRelay('2026/10/25', '男子高校4×100m 決勝', [block('44.13', true)]))
    ]); await delay(250);
    assert.equal(w.document.querySelectorAll('[data-rlc]').length, 0);
    await save(w);
    assert.equal(w.__t.all().filter(r => R.isRelay(r.event)).length, 0);
    assert.deepEqual(w.__t.all().filter(r => r.meet === '架空合同大会').map(r => [r.event, r.mark, r.date, R.rawDivisionOf(r)]), [['男子中学100m', '12.50', '2026-10-24', 'jh']]);
    assert(has(w, oid));
  } finally { w.close(); }
});

await check('C1103：区分の書いていないリレーで、走者が中学の個人の記録にいないときは、候補に出すがチェックなし（区分を確かめて）。「中学」と書いてあればチェックあり', async () => {
  const w = await page(IMP(KJ), JP, '架空中');
  try {
    await w.__t.handle([
      file(w, 'junior.html', goldInd('2026/10/24', '男子中学100m 決勝', ['1位　(11)<br>　12.50<br>架空 一郎(1)<br>墨　田・架空<br>'])),
      file(w, 'relay-plain.html', goldRelay('2026/10/25', '男子4×100m 決勝', [block('44.13', true, ['見本 五郎', '見本 六郎', '見本 七郎', '見本 八郎'])])),
      file(w, 'relay-jh.html', goldRelay('2026/10/25', '男子中学4×400m 決勝', [block('3:50.00', true, ['見本 五郎', '見本 六郎', '見本 七郎', '見本 八郎'])]))
    ]); await delay(250);
    const ins = [...w.document.querySelectorAll('[data-rlc]')]; assert.equal(ins.length, 2);
    const byEv = Object.fromEntries(ins.map(i => [i.closest('.rl-cand').textContent.match(/4×\d+mR/)[0], i.checked]));
    assert.deepEqual(byEv, { '4×100mR': false, '4×400mR': true });
    assert(/中学か高校か分かりません/.test(w.document.getElementById('rbBatches').textContent));
    await save(w);
    assert.deepEqual(w.__t.all().filter(r => R.isRelay(r.event)).map(r => [r.event, r.team, r.mark, r.date]), [['男子4×400mR', '架空', '3:50.00', '2026-10-25']]);
  } finally { w.close(); }
});

await check('対照（C1103）：高校のページだけなら中学の候補にしない', async () => {
  const w = await page(IMP(KJ), JP, '架空中');
  try {
    await w.__t.handle([file(w, 'senior.html', goldInd('2026/10/24', '男子高校100m 決勝', ['1位　(11)<br>　12.50<br>架空 一郎(1)<br>3・架空<br>'])), file(w, 'senior-relay.html', goldRelay('2026/10/25', '男子高校4×100m 決勝', [block('44.13', true)]))]); await delay(250);
    assert.equal(w.document.querySelectorAll('[data-rlc]').length, 0);
  } finally { w.close(); }
});

await check('C1105：学年別のリレー（1年は24日・2年は25日）は日付の表で別の行、それぞれの日付で保存。種目名に学年が残る', async () => {
  const w = await page(IMP(KJ), JP, '架空中');
  try {
    const oid = await putOther(w);
    await w.__t.handle([
      file(w, 'junior.html', goldInd('2026/10/24', '男子中学100m 決勝', ['1位　(11)<br>　12.50<br>架空 一郎(1)<br>墨　田・架空<br>'])),
      file(w, 'grade1-relay.html', goldRelay('2026/10/24', '男子1年4×100m 決勝', [block('50.13')])),
      file(w, 'grade2-relay.html', goldRelay('2026/10/25', '男子2年4×100m 決勝', [block('49.10', false, ['見本 五郎', '見本 六郎', '見本 七郎', '見本 八郎'])]))
    ]); await delay(250);
    const rels = w.__t.batches()[0].relays; assert.deepEqual(J(rels.map(r => [r.event, r.ecat, r.dday])), [['男子4×100mR', '1年', 'd:2026-10-24'], ['男子4×100mR', '2年', 'd:2026-10-25']]);
    const rows = dayRows(w).filter(r => r[0].includes('4×100')); assert.deepEqual(J(rows.map(r => [r[0], r[2], r[3]])), [['男子4×100mR（1年）', '2026-10-24', '資料'], ['男子4×100mR（2年）', '2026-10-25', '資料']]);
    assert([...w.document.querySelectorAll('[data-rlc]')].every(i => i.checked));
    await save(w);
    assert.deepEqual(w.__t.all().filter(r => R.isRelay(r.event)).map(r => [r.event, r.team, r.mark, r.date, r.meet]).sort(), [['男子1年4×100mR', '架空', '50.13', '2026-10-24', '架空合同大会'], ['男子2年4×100mR', '架空', '49.10', '2026-10-25', '架空合同大会']]);
    assert(has(w, oid)); assert(w.__t.all().every(r => !('ecat' in r) && !('ediv' in r) && !('_oor' in r) && !('dday' in r)));
  } finally { w.close(); }
});

await check('C1105：別の学年の DNS 2つは1つにまとめない（別の日でも同じ日でも）。保存しても2件', async () => {
  const a = R.parseRelayGold(goldRelay('2026/10/24', '男子1年4×100m 決勝', [block('DNS')]));
  const b = R.parseRelayGold(goldRelay('2026/10/25', '男子2年4×100m 決勝', [block('DNS', false, ['見本 五郎', '見本 六郎', '見本 七郎', '見本 八郎'])]));
  const m = R.mergeRelays([...a.cands, ...b.cands]); assert.deepEqual(m.map(c => [c.ecat, c.dday, c.mark]), [['1年', 'd:2026-10-24', 'DNS'], ['2年', 'd:2026-10-25', 'DNS']]);
  const b2 = R.parseRelayGold(goldRelay('2026/10/24', '男子2年4×100m 決勝', [block('DNS', false, ['見本 五郎', '見本 六郎', '見本 七郎', '見本 八郎'])]));
  assert.equal(R.mergeRelays([...a.cands, ...b2.cands]).length, 2);
  const w = await page(IMP(KJ), JP, '架空中');
  try {
    await w.__t.handle([
      file(w, 'junior.html', goldInd('2026/10/24', '男子中学100m 決勝', ['1位　(11)<br>　12.50<br>架空 一郎(1)<br>墨　田・架空<br>'])),
      file(w, 'g1.html', goldRelay('2026/10/24', '男子1年4×100m 決勝', [block('DNS')])),
      file(w, 'g2.html', goldRelay('2026/10/24', '男子2年4×100m 決勝', [block('DNS', false, ['見本 五郎', '見本 六郎', '見本 七郎', '見本 八郎'])]))
    ]); await delay(250);
    await save(w);
    assert.deepEqual(w.__t.all().filter(r => R.isRelay(r.event)).map(r => [r.event, r.mark, r.date]).sort(), [['男子1年4×100mR', 'DNS', '2026-10-24'], ['男子2年4×100mR', 'DNS', '2026-10-24']]);
  } finally { w.close(); }
});

await check('対照（C1105）：同じ区分の「組」と「総合」はこれまでどおり1つにして総合順位を付ける。予選と決勝が同じ記録なら別の行のまま', () => {
  const h1 = R.parseRelayGold(goldRelay('2026/10/24', '男子 ４×１００ｍ タイムレース1組', [block('44.13', true)])), h2 = R.parseRelayGold(goldRelay('2026/10/24', '男子 ４×１００ｍ タイムレース総合', [block('44.13', true).replace('1位', '3位')]));
  const m = R.mergeRelays([...h1.cands, ...h2.cands]); assert.equal(m.length, 1); assert.equal(m[0].overall, 3); assert.equal(m[0].heat, 1);
  const p1 = R.parseRelayGold(goldRelay('2026/10/24', '男子 ４×１００ｍ 予選1組', [block('44.13', true)])), p2 = R.parseRelayGold(goldRelay('2026/10/24', '男子 ４×１００ｍ 決勝', [block('44.13', true)]));
  assert.equal(R.mergeRelays([...p1.cands, ...p2.cands]).length, 2);
  assert.equal(R.mergeRelays([...h1.cands, ...h1.cands]).length, 1);   // 同じページを2回
  const pdf = (round, heat, rank) => ({ event: '男子4×100mR', team: '架空', mark: '44.95', round, heat, rank, runners: [], dday: 'd:2026-10-24' });
  assert.equal(R.mergeRelays([pdf('タイムレース', 4, 1), pdf('タイムレース上位8位', '', '')]).length, 1);   // PDF の「上位8位」の一覧も総合として1つに
});

await check('C1105：v0.26.48 までに学年を落として保存した学年別のリレー（「男子4×100mR」）があれば、取り込み直しても二重にしない', async () => {
  const w = await page(IMP(KJ), JP, '架空中');
  try {
    const old = R.relayRecord({ event: '男子4×100mR', team: '架空', mark: '50.13', round: '決勝', rank: '1', date: '2026-10-24', meet: '架空合同大会', legs: ['架空 一郎', '架空 二郎', '架空 三郎', '架空 四郎'] }).rec;
    delete old.manual; old.id = R.recId(old.meet, old.date, old); await w.__t.put([old]);
    await w.__t.handle([
      file(w, 'junior.html', goldInd('2026/10/24', '男子中学100m 決勝', ['1位　(11)<br>　12.50<br>架空 一郎(1)<br>墨　田・架空<br>'])),
      file(w, 'grade1-relay.html', goldRelay('2026/10/24', '男子1年4×100m 決勝', [block('50.13')]))]); await delay(250);
    await save(w);
    assert.deepEqual(J(w.__t.all().filter(r => R.isRelay(r.event)).map(r => [r.event, r.mark, r.date])), [['男子4×100mR', '50.13', '2026-10-24']]);
  } finally { w.close(); }
});

await check('保存の ID は前の版と同じ（学年のないリレー・個人）。学年の区分は relaySaveEvent で学年のときだけ種目名に残る', () => {
  const r = { event: '男子4×100mR', team: '架空中', name: '架空中 リレー', mark: '50.00', round: '決勝', heat: '', bib: '' };
  assert.equal(R.recId('架空大会', '2026-10-24', r), 'v7' + JSON.stringify(['架空大会', '2026-10-24', '架空中', 'jh', '男子4×100mR', '', '', '決勝', '', '架空中リレー', '50.00']));
  assert.deepEqual(['1年', '2・3年', '共通', 'U16', ''].map(k => R.relaySaveEvent({ event: '男子4×100mR', ecat: k })), ['男子1年4×100mR', '男子2・3年4×100mR', '男子4×100mR', '男子4×100mR', '男子4×100mR']);
});
console.log(JSON.stringify({passed:pass,failed:fail}));if(fail)process.exitCode=1;
