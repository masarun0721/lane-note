// v0.26.23 大会ごとに違う種目名をまとめる（PB・ランキング・並び・グラフ）。架空データのみ
import assert from 'node:assert/strict'; import {createRequire} from 'node:module';
const R = createRequire(import.meta.url)('../src/results.js');
let ok = 0; const check = (n, f) => { f(); ok++; console.log('  ✔ ' + n); };
console.log('[v0.26.23] 種目名のまとめ');
const mk = (id, date, ev, mark, o) => Object.assign({ id, date, event: ev, name: '架空 一郎', team: '架空中', grade: '2', mark, wind: '+0.5' }, o || {});
const K = (ev, team) => R.eventKey({ event: ev, team: team || '架空中', name: 'a' });
check('学年・区分の書き方が違っても同じ 100m（中2・中学2年・中学共通・共通・低学年・少年B・一般・U18）', () => {
  const evs = ['男子中学2年 100m', '男子中学共通 １００ｍ', '中2男子 100m', '共通男子100m', '男子低学年 100m', '少年B男子 100m', '男子一般 100m', '男子U18 100m', '男子 中2 100m', '男子中学2・3年 100m'];
  assert.deepEqual([...new Set(evs.map(e => K(e)))], ['jh:男子100m']);
  assert.equal(K('男子中学1年 1500m'), K('男子中学2・3年 1500m'));
});
check('男女は別・中学と高校は別', () => {
  assert.notEqual(K('男子中学 100m'), K('女子中学 100m')); assert.notEqual(K('男子中学 100m'), K('男子高校 100m', '架空高'));
});
check('ハードル：中学 110mH(0.914m) と 高校 110mH(1.067m) は別。書いていなければ中学・高校の標準の高さとして、同じ仕様ならまとめる', () => {
  assert.notEqual(K('男子 110mH(0.914m)', '架空学園'), K('男子 110mH(1.067m)', '架空学園'));
  assert.equal(K('男子中学 110mH'), K('男子中学共通 １１０ｍＨ(0.914m)')); assert.equal(K('男子高校 110mH', '架空高'), K('男子高校 110mH(1.067m)', '架空高'));
  assert.equal(K('女子中学 100mH(76.2cm)'), K('女子中学共通 100mH')); assert.notEqual(K('女子中学 100mH'), K('女子中学 100mYH'));
});
check('投てき：重さが違えば別（砲丸 5kg / 6kg / 2.721kg、円盤 1.5kg / 1.75kg）。「5kg」「5.000kg」は同じ', () => {
  assert.equal(K('男子中学 砲丸投(5kg)'), K('男子中学共通 砲丸投(5.000kg)')); assert.equal(K('男子中学 砲丸投'), K('男子中学 砲丸投(5.000kg)'));
  assert.notEqual(K('男子 砲丸投(5.000kg)', '架空学園'), K('男子 砲丸投(6.000kg)', '架空学園'));
  assert.notEqual(K('男子 円盤投(1.500kg)', '架空学園'), K('男子 円盤投(1.750kg)', '架空学園'));
});
check('リレーと個人は別（4×100m・4×100mR・4×100mリレーは同じ）', () => {
  assert.notEqual(K('男子中学共通 4×100m'), K('男子中学共通 100m'));
  assert.equal(K('男子中学共通 4×100m'), K('男子 4×100mR')); assert.equal(K('男子 4×100mリレー'), K('男子中学 ４×１００ｍ'));
});
check('私学大会の「男子中学2年 100m」の自己ベストが、ほかの大会の「男子中学共通 100m」「中2 100m（男女なし）」と同じ種目で PB になる。保存した種目名は変えない', () => {
  const rs = [mk('a', '2026-05-01', '男子中学共通 100m', '12.80'), mk('b', '2026-08-19', '男子中学2年 100m', '12.40'), mk('c', '2026-09-20', '中2 100m', '12.60')];
  const before = JSON.stringify(rs), cb = R.computeBests(rs);
  assert.equal(cb.bests.length, 1); assert.equal(cb.bests[0].best.id, 'b'); assert.equal(cb.flags.b, 'PB'); assert.equal(cb.bests[0].eventLabel, '男子 中学 100m');
  assert.equal(JSON.stringify(rs), before);   // 保存する中身はそのまま（読むときにまとめるだけ）
  const rk = R.ranking(rs.concat([mk('d', '2026-08-19', '男子中学1年 100m', '13.10', { name: '架空 二郎', grade: '1' })]), {});
  const k = Object.keys(rk); assert.equal(k.length, 1); assert.deepEqual(rk[k[0]].map(x => x.name), ['架空 一郎', '架空 二郎']);
});
check('ランキングの見出し・並べ替えも同じ種目として1つ（元の種目名は記録の行に残る）', () => {
  const rs = [mk('a', '2026-05-01', '男子中学共通 200m', '26.00'), mk('b', '2026-08-19', '男子中学2年 100m', '12.40'), mk('c', '2026-08-19', '男子中学共通 100m', '12.50', { name: '架空 三郎' })];
  const keys = [...new Set(rs.map(r => R.eventKey(r)))], g = R.groupEvents(keys, rs, true);
  assert.deepEqual(g.map(x => [x.group, x.items.map(i => i.label)]), [['中学', ['中学 100m', '中学 200m']]]);
  assert.equal(rs[1].event, '男子中学2年 100m');
});
console.log('v0.26.23 種目名のまとめ OK ' + ok);
