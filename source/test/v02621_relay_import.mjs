// v0.26.21 リレーを結果から取り込む：PDF（2つの形）・gold.jaic.org 速報（携帯向け）。架空データのみ（fixtures/relay_*.pdf・relay_gold_*.html）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
import {loadPages} from './load.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), FX = path.join(here, 'fixtures');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.21] リレーの取り込み');
const sj = f => new TextDecoder('shift_jis').decode(fs.readFileSync(path.join(FX, f)));
const pa = await loadPages(path.join(FX, 'relay_a.pdf')), pb = await loadPages(path.join(FX, 'relay_b.pdf'));
const A = R.parseRelayPdf(pa), B = R.parseRelayPdf(pb);
await check('PDF の形A（走者名の列に「ナンバー 名前(中3) ﾌﾘｶﾞﾅ」が縦に4行・2組を左右に）：種目・組・順位・レーン・チーム・記録・4人の順', () => {
  assert.equal(A.length, 5);
  const a = A[0]; assert.deepEqual([a.event, a.round, a.heat, a.rank, a.lane, a.team, a.mark], ['男子4×100mR', 'タイムレース', 1, 1, 5, '架空中A', '45.33']);
  assert.deepEqual(a.runners.map(r => [r.bib, r.name, r.grade, r.kana]), [['150', '架空 一郎', '中3', 'カクウ イチロウ'], ['151', '見本 二郎', '中2', 'ミホン ジロウ'], ['152', '試験 三太', '中3', 'シケン サンタ'], ['153', '仮名 四郎', '中1', 'カメイ シロウ']]);
  const dns = A[2]; assert.deepEqual([dns.rank, dns.lane, dns.team, dns.mark, dns.runners.length], ['', 3, '試験中', 'DNS', 0]);
  assert.deepEqual([A[3].heat, A[3].team, A[3].runners[0].bib], [2, '仮名中B', '200']);
});
await check('PDF の形B（順位 ﾚｰﾝ ﾁｰﾑ ﾅﾝﾊﾞｰ ｵｰﾀﾞｰ ｶﾅ 記録 ｺﾒﾝﾄ・4行で1チーム）：右寄せ・小さい字のチーム名、詰めた小さい字の名前、DQ はコメントから', () => {
  assert.equal(B.length, 6);
  assert.deepEqual(B.map(c => [c.heat, c.rank, c.lane, c.team, c.mark, c.comment]), [[3, 1, 6, '架空中B', '52.78', ''], [3, 2, 4, '見本第三中A', '53.58', ''], [3, '', 3, '架空中D', 'DQ', 'R1'], [4, 1, 3, '試験中', '51.26', ''], [4, 2, 4, '架空中E', '52.55', ''], [4, '', 1, '仮名中C', 'DQ', 'R1']]);
  assert.equal(B[0].event, '女子4×100mR');
  assert.deepEqual(B[1].runners.map(r => r.name), ['架空 花子', '見本 桜', 'コールンストラ 未来', '試験 葵']);
  assert.equal(B[1].runners[2].kana, 'コールンストラ ミライ'); assert.equal(B[1].runners[0].grade, '');   // 「(13)」は学年にしない
  assert(B.every(c => c.runners.length === 4));
});
await check('リレーの表は個人の記録には入れない（今までの読み取りはそのまま）', () => { assert.equal(R.parsePdf(pa, {}).recs.length, 0); assert.equal(R.parsePdf(pb, {}).recs.length, 0); });
const GH = R.parseRelayGold(sj('relay_gold_heat.html')), GT = R.parseRelayGold(sj('relay_gold_total.html'));
await check('gold.jaic.org 速報（組）：見出しから種目・ラウンド・組、日付、順位・記録・チーム・(1)〜(4)、DQ（*R8）・DNS（名前なし）', () => {
  assert.equal(GH.date, '2026-08-29'); assert.equal(GH.cands.length, 4);
  assert.deepEqual(GH.cands.map(c => [c.event, c.round, c.heat, c.rank, c.team, c.mark, c.comment, c.runners.length]), [['男子4×100mR', 'タイムレース', 1, 1, '架空', '41.96', '', 4], ['男子4×100mR', 'タイムレース', 1, 2, '都見本', '42.98', '', 4], ['男子4×100mR', 'タイムレース', 1, '', '試験', 'DQ', 'R8', 4], ['男子4×100mR', 'タイムレース', 1, '', '仮名', 'DNS', '', 0]]);
  assert.deepEqual(GH.cands[0].runners.map(r => [r.name, r.grade]), [['架空 一郎', '2'], ['架空 二郎', '1'], ['架空 三太', '2'], ['架空 四郎', '1']]);
});
await check('gold.jaic.org 速報（タイムレース総合結果）：組の結果と重ねず、総合の順位を付ける', () => {
  assert.equal(GT.cands[0].round, 'タイムレース総合結果'); assert.equal(GT.cands[0].heat, '');
  const m = R.mergeRelays(GH.cands.concat(GT.cands)); assert.equal(m.length, 5);
  const k = m.find(c => c.team === '架空'); assert.equal(k.heat, 1); assert.equal(k.overall, 1);
  assert.equal(m.find(c => c.team === '例示').round, 'タイムレース総合結果');
  assert.equal(R.parseRelayGold('<html><title>男子 100m 予選1組</title><font>1位 (12)</font></html>'), null);
});
await check('学校名の照合：「本郷中A」「本郷中E」は「本郷中」に合う・ほかの学校は合わない', () => {
  assert(R.matchRelayTeam('架空中A', '架空中')); assert(R.matchRelayTeam('架空中E', '架空中')); assert(R.matchRelayTeam('架空中', '架空中'));
  assert(!R.matchRelayTeam('見本第二中A', '架空中')); assert(!R.matchRelayTeam('第二架空中A', '架空中')); assert(R.matchRelayTeam('架空', '架空高'));
});
// 画面：記録のページ（ログインなし・端末保存）で、資料を読んだときの候補 → 確かめて保存 → 🏃リレーの記録
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js']) w.eval(src(s));
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
w.eval(src('records_app.js').replace(tail, 'window.__t={putMany:putMany,reload:reload,scope:scope,all:function(){return ALL;},add:function(b){addBatchIn(b,scope());},readHtml:readHtml,batches:function(){return batches;}};renderAuth();reload();')); await delay(150);
const T = w.__t, doc = w.document;
doc.getElementById('rbSchool').value = '架空中'; doc.getElementById('rbSchool').dispatchEvent(new w.Event('input', { bubbles: true })); await delay();
// 個人の記録（同じ日・ナンバー 461 は「見本 さくら」と別の書き方）と名簿の代わりの記録
await T.putMany([{ id: 'p1', name: '見本 さくら', kana: 'ミホン サクラ', team: '架空中', bib: '461', date: '2026-09-20', event: '女子100m', mark: '13.50', wind: '+0.5', meet: '架空記録会' }, { id: 'p2', name: '試験　葵', team: '架空中', date: '2026-06-01', event: '女子100m', mark: '13.90', wind: '+0.1', meet: '架空春季' }], T.scope()); await T.reload(T.scope()); await delay();
T.add({ src: 'relay_b.pdf', kind: 'PDF', all: R.parsePdf(pb, {}), meta: { name: '架空中学記録会', date: '2026-09-20' }, relays: R.mergeRelays(B) }); await delay();
const box = () => doc.querySelector('.rb-batch');
await check('候補：学校・クラブ名に合うチームだけ（架空中B・架空中D・架空中E）・ほかの学校は出さない・「表が見つからない」の注意は出さない', () => {
  const t = box().textContent; const c = [...doc.querySelectorAll('.rl-cand')].map(x => x.querySelector('b').textContent);
  assert.deepEqual(c, ['架空中B', '架空中D', '架空中E']); assert(!/見本第三中A|試験中|仮名中C/.test([...doc.querySelectorAll('.rl-cand')].map(x => x.textContent).join(''))); assert(!/結果の表/.test(t), t.slice(0, 300));
  assert(!doc.querySelector('[data-save]').disabled);
});
await check('走者：ナンバー（同じ日の個人の記録）→ 名前（空白の違い）→ 資料のまま。DQ は最初はチェックなし', () => {
  const v = [...doc.querySelectorAll('[data-rll^="0,"]')].map(x => x.value); assert.deepEqual(v, ['架空 花子', '見本 さくら', 'コールンストラ 未来', '試験　葵']);
  const how = [...doc.querySelectorAll('.rl-cand')][0].textContent; assert(/✔ナンバーで一致/.test(how) && /✔名前で一致/.test(how) && /資料のまま/.test(how), how);
  const ch = [...doc.querySelectorAll('[data-rlc]')].map(x => x.checked); assert.deepEqual(ch, [true, false, true]);
});
await check('直してから保存 → 🏃リレーの記録に入る（チーム・記録・順位・組・レーン・走順）。チェックしていない DQ は入れない', async () => {
  const inp = doc.querySelector('[data-rll="0,0"]'); inp.value = '架空 はなこ'; inp.dispatchEvent(new w.Event('input', { bubbles: true }));
  doc.querySelector('[data-save]').click(); await delay(400);
  const rs = T.all().filter(r => R.isRelay(r.event)); assert.equal(rs.length, 2, JSON.stringify(rs));
  const b1 = rs.find(r => r.team === '架空中B'); assert.equal(b1.name, '架空中B リレー'); assert.equal(b1.mark, '52.78'); assert.equal(b1.rank, 1); assert.equal(b1.heat, 3); assert.equal(b1.lane, 6); assert.equal(b1.meet, '架空中学記録会'); assert.equal(b1.date, '2026-09-20'); assert.equal(b1.manual, undefined);
  assert.equal(b1.legs, '1走 架空 はなこ／2走 見本 さくら／3走 コールンストラ 未来／4走 試験 葵');
  assert(!rs.some(r => r.team === '架空中D'));
});
await check('gold の速報 HTML を読む（Shift_JIS）：日付と見出しを返し、リレーの候補を集める', async () => {
  const out = []; const f = new w.File([fs.readFileSync(path.join(FX, 'relay_gold_heat.html'))], 'rel160.html', { type: 'text/html' });
  const st = await T.readHtml(f, out); assert.equal(out.length, 4); assert.equal(st[0].v, '2026年8月29日'); assert(/4×100m/.test(st[1].v));
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
