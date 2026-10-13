// v0.26.5：速報（gold.jaic.org 携帯形）の所属末尾「・3」（地区・支部番号）と、高・中の付かない学校名（架空データのみ）
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const R = createRequire(import.meta.url)('../src/results.js');
let ok = 0; const check = (n, f) => { f(); ok++; console.log('  ✔ ' + n); };
const page = (rows) => '<html><head><title>架空高校夏季競技会</title></head><body>男子 100m<br>タイムレース 1組<br>風:+0.7<br>' +
  rows.map(([rk, no, mk, nm, tm]) => '<font color="#000080">' + rk + '位　(' + no + ')<br>　' + mk + '<br>' + nm + '<br>' + tm + '<br></font>').join('') + '</body></html>';
console.log('[v0.26.5] 所属の「・3」と学校名の書き方');
const html = page([[1, 5901, '10.52', '架空　一郎(3)', '架空学園            ・3'], [2, 1701, '11.93', '架空　二郎(中2)', '架空学園中          ・3'], [3, 5902, '11.10', '例示　三郎(2)', '例示ヶ丘            ･12'], [4, 5903, '11.20', '別校　四郎(1)', '架空学園大附属']]);
const res = R.parseCells(R.goldMobileStream(html), {});
check('読み取った所属から末尾の「・3」「･12」を取る', () => assert.deepEqual(res.recs.map(r => r.team), ['架空学園', '架空学園中', '例示ヶ丘', '架空学園大附属']));
const hit = (q) => res.recs.filter(r => R.matchSchool(r.team, q)).map(r => r.name);
check('「架空学園」「架空学園高」「架空学園高校」「架空学園高等学校」で高校の選手が見つかる', () => { for (const q of ['架空学園高', '架空学園高校', '架空学園高等学校']) assert.deepEqual(hit(q), ['架空 一郎'], q); assert.deepEqual(hit('架空学園'), ['架空 一郎', '架空 二郎']); });
check('「架空学園中」は中学の選手だけ・高校名で中学は拾わない・別の学校（〜大附属）は拾わない', () => { assert.deepEqual(hit('架空学園中'), ['架空 二郎']); assert(!hit('架空学園高').includes('別校 四郎')); });
check('前に保存した「・3」付きの所属も一致する（全角・半角どちらも）', () => { assert(R.matchSchool('架空学園            ・3', '架空学園高')); assert(R.matchSchool('架空学園 ･3', '架空学園')); assert(!R.matchSchool('架空学園中 ・3', '架空学園高')); });
check('「・3」の有無で別の記録として二重にならない', () => assert.equal(R.identityKey({ team: '架空学園 ・3', event: '男子 100m', name: '架空 一郎', mark: '10.52' }), R.identityKey({ team: '架空学園', event: '男子 100m', name: '架空 一郎', mark: '10.52' })));
check('ほかの学校名の一致は今までどおり（本郷高 ⇔ 本郷・本郷高校、本郷 は 本郷中も含む、本郷中 ≠ 本郷高）', () => { assert(R.matchSchool('本郷高', '本郷')); assert(R.matchSchool('本郷', '本郷高')); assert(R.matchSchool('本郷中', '本郷')); assert(!R.matchSchool('本郷中', '本郷高')); assert(!R.matchSchool('本郷台', '本郷高')); });
console.log('v0.26.5 学校名 OK ' + ok);
