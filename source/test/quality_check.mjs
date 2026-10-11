// 記録の取りこぼし・ID の回帰テスト（v0.14・Astra 監査の quality_check.mjs の期待値を「起きないこと」に反転したもの）
//   node quality_check.mjs   （架空の選手・架空の大会だけ）
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../src/results.js');
let pass = 0, fail = 0; const ok = (name, fn) => { try { fn(); pass++; console.log('  ok', name); } catch (e) { fail++; console.log('  NG', name, '\n    ', e.message); } };
console.log('[1] F06：重複の判定（所属・区分・ナンバーまで見る）');
const input = [
  { type: 'text', v: '第1回架空区陸上競技大会' }, { type: 'text', v: '男子100m 決勝' },
  { type: 'row', cells: ['順位', 'ﾚｰﾝ', 'Bib', '氏名', '所属', '記録', '風'] },
  { type: 'row', cells: ['1', '4', '101', '架空 太郎(高1)', '別の高', '12.00', '+0.1'] },
  { type: 'row', cells: ['1', '5', '102', '架空 太郎(高1)', '架空高', '12.00', '+0.1'] }];
const parsed = R.parseCells(input, {});
ok('Q1：別の学校の同じ名前・同じ記録の2人を1人にまとめない', () => {
  assert.equal(parsed.recs.length, 2);
  assert.deepEqual(parsed.recs.map(r => r.team).sort(), ['別の高', '架空高'].sort());
  assert.equal(parsed.recs.filter(r => R.matchSchool(r.team, '架空')).length, 1);
});
ok('Q1b：同じ資料の中の本当の重なり（同じ所属・同じナンバー）はまとめる', () => {
  const d = R.dedupe([{ event: '男子100m', team: '架空高', bib: '101', name: '架空 太郎', mark: '12.00', round: '決勝', heat: 1 }, { event: '男子100m', team: '架空高', bib: '101', name: '架空 太郎', mark: '12.00', round: '決勝', heat: 1 }]);
  assert.equal(d.length, 1);
});
const row = { event: '男子100m', round: '決勝', heat: 1, name: '架空 太郎', mark: '12.00' };
ok('Q2：本郷中と本郷高のように、同じ系列の中学と高校の記録は別のIDになる', () => {
  const mid = R.recId('架空大会', '2026-10-10', { ...row, team: '架空中' }), high = R.recId('架空大会', '2026-10-10', { ...row, team: '架空高' });
  assert.notEqual(mid, high);
  assert.equal(R.recId('架 空大会', '2026-10-10', { ...row, team: '架空高' }), high, '同じ記録は同じID');
  assert.equal(R.recIdLegacy('架空大会', '2026-10-10', { ...row, team: '架空高' }) + '|hs', R.recIdV6('架空大会', '2026-10-10', { ...row, team: '架空高' }), 'v0.6 のID（旧IDに区分を足した形）は recIdV6 で作れる（照合は中身で行う・v0.7 A03）');
});
console.log('[2] B：1件ずつ入力の正規化');
const M = f => R.manualRecord(Object.assign({ name: '架空 一郎', event: '男子100m', mark: '11.85', date: '2026-10-04' }, f));
ok('タイム・距離・DNS をそろえる', () => {
  assert.equal(M({ mark: '11"85' }).rec.mark, '11.85');
  assert.equal(M({ mark: '11.8' }).rec.mark, '11.80');
  assert.equal(M({ event: '男子1500m', mark: '4分31秒15' }).rec.mark, '4:31.15');
  assert.equal(M({ event: '男子走幅跳', mark: '5.74' }).rec.mark, '5m74');
  assert.equal(M({ event: '男子走幅跳', mark: '５ｍ７４' }).rec.mark, '5m74');
  assert.equal(M({ mark: 'dns' }).rec.mark, 'DNS');
});
ok('風：+1.2・1.2・-0.5・0 をそろえ、風のない種目では入れない', () => {
  assert.equal(M({ wind: '1.2' }).rec.wind, '+1.2'); assert.equal(M({ wind: '-0.5' }).rec.wind, '-0.5'); assert.equal(M({ wind: '0' }).rec.wind, '+0.0'); assert.equal(M({ wind: '＋２' }).rec.wind, '+2.0');
  assert.equal(M({ event: '男子400m', wind: '+1.0' }).rec.wind, '');
  assert(M({ wind: 'つよい' }).errors.length);
});
ok('必須・形のまちがいを返す', () => {
  assert(R.manualRecord({}).errors.length >= 4);
  assert(M({ date: '2026-02-30' }).errors.some(e => /日付/.test(e)));
  assert(M({ mark: '5m74' }).errors.some(e => /タイム/.test(e)), 'トラック種目に距離');
  assert(M({ event: '男子走幅跳', mark: '11.85x' }).errors.length);
  assert(M({ rank: '一位' }).errors.some(e => /順位/.test(e)));
  assert.equal(M({}).rec.meet, '大会名なし（2026-10-04）');
  assert.equal(M({}).errors.length, 0);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
