// v0.26.26 東京都高体連の速報（PC 用の表）：所属の欄が「3<br>架空」（上に支部の番号）でも学校名で見つかる（架空データのみ）
import assert from 'node:assert/strict'; import {createRequire} from 'node:module';
const R = createRequire(import.meta.url)('../src/results.js');
let ok = 0; const check = (n, f) => { f(); ok++; console.log('  ✔ ' + n); };
console.log('[v0.26.26] 所属の上の支部番号');
const st = [{ type: 'text', v: '2026年 8月29日' }, { type: 'text', v: '第1回架空新人大会' }, { type: 'text', v: '男子3支部 ２００ｍ 予選1組' },
  { type: 'row', cells: ['順位', 'ﾚｰﾝ', 'Bib', '氏名', '氏名', '所属', '記録', 'ｺﾒﾝﾄ'], th: true },
  { type: 'row', cells: ['1', '5', '5801', '架空　一郎(1)', 'ｶｸｳ ｲﾁﾛｳ', '3\n架空', '23.14', 'Q'] },
  { type: 'row', cells: ['2', '7', '5802', '見本　二郎(1)', 'ﾐﾎﾝ ｼﾞﾛｳ', '3 都見本', '23.16\n[23.152]', 'q'] },
  { type: 'row', cells: ['3', '4', '5803', '試験　三太(2)', 'ｼｹﾝ ｻﾝﾀ', '12\n架空学園', '23.28', ''] }];
const r = R.parseCells(st, {});
check('所属から支部の番号（「3」「12」）を外す', () => assert.deepEqual(r.recs.map(x => [x.name, x.team, x.mark]), [['架空 一郎', '架空', '23.14'], ['見本 二郎', '都見本', '23.16'], ['試験 三太', '架空学園', '23.28']]));
check('学校名「架空」で個人の記録が見つかる（「架空学園」は別の学校）', () => assert.deepEqual(r.recs.filter(x => R.matchSchool(x.team, '架空')).map(x => x.name), ['架空 一郎']));
check('前に保存した「3 架空」「3\\n架空」の所属も一致する。「3年」「2001」などの学校名は削らない', () => {
  assert(R.matchSchool('3 架空', '架空')); assert(R.matchSchool('3\n架空', '架空高')); assert.equal(R.normSchool('3年A組'), '3年A組'); assert.equal(R.normSchool('2001'), '2001');
});
console.log('v0.26.26 支部番号 OK ' + ok);
