// v0.31.5 記録用紙の PB・前回：同じ人の記録が「架空」と「架空高」に分かれていてもまとめる。中学と高校が両方ある同名は空欄のまま（架空データのみ）
import assert from 'node:assert/strict';
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const R = require('../src/results.js');
let pass = 0, fail = 0;
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const mk = (name, ev, mark, wind, team, date, meet) => {
  const r = { name, team: team || '架空', event: ev, mark, wind: wind || '+0.5', date: date || '2026-06-01', meet: meet || '架空大会', grade: '2' };
  r.id = R.recId(r.meet, r.date, r); return r;
};

console.log('[v0.31.5] pbLookup の区分のまとめ');

await check('所属が「架空」と「架空高」に分かれた同じ人は、空の区分の行でも PB と前回が出る（日付が違えば PB と前回は別）', () => {
  const recs = [
    mk('記録 太郎', '男子100m', '12.10', '+0.5', '架空', '2026-05-01', '架空春季'),
    mk('記録 太郎', '男子100m', '11.80', '+0.8', '架空高', '2026-08-18', '架空私学')
  ];
  const look = R.pbLookup(recs);
  const p = look({ name: '記録 太郎', team: '架空', event: '男子 100m', grade: '2' });
  assert.ok(p && p.best && p.last, 'まとめた結果がある');
  assert.equal(p.best.mark, '11.80');
  assert.equal(p.last.mark, '11.80');
  assert.equal(p.last.date, '2026-08-18');
  const p2 = look({ name: '記録 太郎', team: '架空高', event: '男子 高校 100m' });
  assert.equal(p2.best.mark, '11.80');
  assert.equal(p2.last.mark, '11.80');
});

await check('記録が2つあれば PB と前回は別の大会になりうる', () => {
  const recs = [
    mk('記録 太郎', '男子400m', '56.63', '', '架空', '2026-08-18', '架空私学'),
    mk('記録 太郎', '男子400m', '57.10', '', '架空高', '2026-10-01', '架空秋季')
  ];
  const p = R.pbLookup(recs)({ name: '記録 太郎', team: '架空', event: '男子 400m' });
  assert.equal(p.best.mark, '56.63');
  assert.equal(p.last.mark, '57.10');
  assert.notEqual(p.best.mark, p.last.mark);
});

await check('中学と高校が両方ある同名は、所属に中高が無いとき今までどおり空欄', () => {
  const recs = [
    mk('同名 一郎', '男子100m', '12.50', '+0.1', '架空中'),
    mk('同名 一郎', '男子100m', '11.70', '+0.1', '架空高')
  ];
  const look = R.pbLookup(recs);
  assert.equal(look({ name: '同名 一郎', team: '架空中', event: '男子 中学 100m' }).best.mark, '12.50');
  assert.equal(look({ name: '同名 一郎', team: '架空高', event: '男子 高校 100m' }).best.mark, '11.70');
  assert.equal(look({ name: '同名 一郎', team: '架空', event: '男子100m' }), null);
});

await check('プログラムの「男子 110mH(1.067m)」は、記録の「男子110mH」（高校）に当たる', () => {
  const recs = [mk('ハード 太郎', '男子110mH', '16.20', '+0.4', '架空高', '2026-07-01', '架空夏季')];
  const look = R.pbLookup(recs);
  const p = look({ name: 'ハード 太郎', team: '架空高', event: '男子 110mH(1.067m)', grade: '2' });
  assert.ok(p && p.best, '当たる');
  assert.equal(p.best.mark, '16.20');
});

await check('プログラムの「男子 110mH(1.067m)」は、所属が「架空」だけで高さが書いていない記録にも当たる', () => {
  const recs = [mk('ハード 太郎', '男子110mH', '16.20', '+0.4', '架空', '2026-07-01', '架空夏季')];
  const p = R.pbLookup(recs)({ name: 'ハード 太郎', team: '架空', event: '男子 110mH(1.067m)' });
  assert.ok(p && p.best, '高さが無い記録にも当たる');
  assert.equal(p.best.mark, '16.20');
});

await check('砲丸投の重さが違う記録はまとめない', () => {
  const recs = [
    mk('投 太郎', '男子砲丸投(6.000kg)', '12m00', '', '架空高', '2026-05-01', 'A'),
    mk('投 太郎', '男子砲丸投(5.000kg)', '13m00', '', '架空高', '2026-06-01', 'B')
  ];
  const look = R.pbLookup(recs);
  assert.equal(look({ name: '投 太郎', team: '架空高', event: '男子 砲丸投(6.000kg)' }).best.mark, '12m00');
  assert.equal(look({ name: '投 太郎', team: '架空高', event: '男子 砲丸投(5.000kg)' }).best.mark, '13m00');
});

console.log(`\n${pass} ok / ${fail} NG`);
if (fail) process.exit(1);
