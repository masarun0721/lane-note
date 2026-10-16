// v0.26.57 記録の読み方：跳躍・投てきの「5.80」（m の無い距離）は種目で距離として読む・手動計時「12.1」もタイムとして読む。架空データのみ。
import assert from 'node:assert/strict'; import {createRequire} from 'node:module';
const req = createRequire(import.meta.url), R = req('../src/results.js'); globalThis.ResultParser = R;
const P = req('../src/print.js'); globalThis.LanePrint = P; const V = req('../src/review.js'), S = req('../src/suspect.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.57] 記録の読み方（距離の「5.80」・手動計時の「12.1」）');
const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-06-01', event: '男子走幅跳', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '5.80', wind: '+0.5', bib: '', lane: '', rank: 1, comment: '' }, o); r.id = R.recId(r.meet, r.date, r); return r; };
const mv = (m, ev) => { const x = R.markValue(m, ev); return x && [Math.round(x.v * 100) / 100, x.lower]; };

await check('種目を渡すと、跳躍・投てき（走高跳・棒高跳も）の 5.80 / 5m80 / 5.80m / 5.8 は同じ m。走る種目・種目なしは今までどおり', () => {
  for (const ev of ['男子走幅跳', '女子三段跳', '男子走高跳', '男子棒高跳', '男子砲丸投', '女子やり投', '男子ジャベリックスロー', '中学男子立幅跳']) {
    for (const m of ['5.80', '5m80', '5.80m', '5.8', '５．８０']) assert.deepEqual(mv(m, ev), [5.8, false], ev + ' ' + m);
  }
  assert.deepEqual(mv('1.75', '男子走高跳'), [1.75, false]); assert.deepEqual(mv('12.40', '男子砲丸投'), [12.4, false]); assert.deepEqual(mv('45.30', '男子円盤投'), [45.3, false]);
  assert.deepEqual(mv('5.80'), [5.8, true], '種目なしは前と同じ（タイム）'); assert.deepEqual(mv('11.85', '男子100m'), [11.85, true]); assert.deepEqual(mv('5m80', '男子100m'), [5.8, false], '走る種目の「5m80」は距離のまま（怪しい記録で出す）');
  assert.deepEqual(mv('1:58.23', '男子800m'), [118.23, true]); assert.deepEqual(mv('2:05.30', '男子走幅跳'), [125.3, true], '時間の形は時間のまま（怪しい記録で出す）');
  assert.deepEqual(mv('6012', '男子八種競技'), [6012, false]); assert.deepEqual(mv('4520点', '女子四種競技'), [4520, false]); assert.equal(R.markValue('580cm', '男子走幅跳'), null, 'cm は前から読まない');
  assert.deepEqual(mv('614', '男子走幅跳'), [614, false], '「614」は前と同じ（得点の形・怪しい記録の「単位がcm」で出す）');
});
await check('手動計時：12.1 / 55.1 / 2:05.3 はタイム。電気計時に直さない（0.24 を足さない）。12.1 と 12.05 は値のままくらべる', () => {
  assert.deepEqual(mv('12.1', '男子100m'), [12.1, true]); assert.deepEqual(mv('55.1', '男子400m'), [55.1, true]); assert.deepEqual(mv('2:05.3', '男子800m'), [125.3, true]); assert.deepEqual(mv('12.1'), [12.1, true]);
  for (const m of ['NM', 'DNS', 'DQ', 'NR', '記録なし', '×××', '4分12秒3', '11"25', '12.']) assert.equal(R.markValue(m, '男子100m'), null, m);
  const a = rec({ event: '男子100m', mark: '12.1', date: '2026-05-01', meet: '春の記録会' }), b = rec({ event: '男子100m', mark: '12.05', date: '2026-06-01' });
  assert.equal(R.isOfficial(a), true); assert.equal(R.hasMark(a), true);
  const pb = R.pbDetails([a, b]); assert.equal(pb[a.id].flag, '初'); assert.equal(pb[b.id].flag, 'PB'); assert.equal(pb[b.id].diff, 0.05);
  assert.equal(a.mark, '12.1', '保存した記録は書きかえない');
});
await check('自己ベスト・PB・初・ランキング・歴代・選手のページ：「5.80」と「5m80」がまざっても距離として正しくくらべる', () => {
  const r1 = rec({ mark: '5m80', date: '2025-09-01', meet: '去年の大会' }), r2 = rec({ mark: '6.00', date: '2026-06-01' }), r3 = rec({ mark: '5.90', date: '2026-07-01', meet: '夏の大会' });
  const x1 = rec({ name: '見本 二郎', mark: '6.10', date: '2026-06-01' }), x2 = rec({ name: '試験 三郎', mark: '5m95', date: '2026-06-01' });
  const all = [r1, r2, r3, x1, x2];
  const cb = R.computeBests(all), b = cb.bests.find(x => x.name === '架空 一郎'); assert.equal(b.best.mark, '6.00'); assert.equal(cb.flags[r1.id], '初'); assert.equal(cb.flags[r2.id], 'PB'); assert.equal(cb.flags[r3.id], undefined);
  const pb = R.pbDetails(all); assert.equal(pb[r2.id].flag, 'PB'); assert.equal(pb[r2.id].diff, 0.2); assert.equal(pb[r2.id].lower, false); assert.equal(pb[r3.id], undefined);
  const rk = R.ranking(all, { season: 2026 }); assert.deepEqual(Object.values(rk)[0].map(x => [x.name, x.best.mark]), [['見本 二郎', '6.10'], ['架空 一郎', '6.00'], ['試験 三郎', '5m95']]);
  const at = R.allTimeTop(all, 10); assert.equal(Object.values(at)[0][0].best.mark, '6.10');
  const pf = R.athleteProfile(all, R.athleteKey(r1)); assert.equal(pf.events[0].lower, false); assert.equal(pf.events[0].best.mark, '6.00');
  assert.equal(R.improvement('5.80', '6.00', '男子走幅跳'), 0.2); assert.equal(R.improvement('5.80', '6.00'), -0.2, '種目なしは前と同じ');
  assert.equal(R.dupCheck([rec({ mark: '6m00', meet: '別の名前' })], [r2])[0] !== '', true, '取り込みの重複の確かめでも同じ記録');
});
await check('ふりかえりシート：走幅跳の「5.80」→「6.00」は「0.20mアップ」（「あと 0.20秒」にならない）。グラフは大きいほど上', () => {
  const all = [rec({ mark: '5.80', date: '2025-09-01', meet: '去年の大会' }), rec({ mark: '6.00', date: '2026-06-01' }), rec({ event: '男子100m', mark: '12.1', date: '2025-09-01', meet: '去年の大会' }), rec({ event: '男子100m', mark: '12.05', date: '2026-06-01' })];
  const g = V.seasonRange(2026), d = V.build(R, all, R.athleteKey(all[0]), { from: g[0], to: g[1] }), s = V.sheet(R, d, {});
  assert.match(s, /昨年度まで 5\.80 → 0\.20mアップ/); assert.doesNotMatch(s, /あと 0\.20秒/);
  assert.match(s, /昨年度まで 12\.1 → 0\.05秒アップ/);
  assert.equal(d.events.find(e => /走幅跳/.test(e.event)).lower, false);
});
await check('大会まとめ（印刷）：走幅跳は遠い順・PBの印', () => {
  const hist = [rec({ name: '見本 二郎', mark: '5.10', date: '2025-09-01', meet: '去年の大会' })];
  const recs = [rec({ mark: '5.80' }), rec({ name: '見本 二郎', mark: '5.40' }), rec({ name: '試験 三郎', mark: '6m02' })];
  const s = P.meetSheet(R, recs, hist.concat(recs), { meet: '架空区大会', meetDate: '2026-06-01' }), bx = s.slice(s.indexOf('lp-boxes'));
  const i1 = bx.indexOf('試験 三郎'), i2 = bx.indexOf('架空 一郎'), i3 = bx.indexOf('見本 二郎'); assert(i1 > 0 && i1 < i2 && i2 < i3, '6m02 → 5.80 → 5.40 の順');
  assert.match(s, /PB \+0\.30/);
});
await check('怪しい記録チェック：走幅跳の「5.80」は時間あつかいしない。「5.80」と「5m80」は二重（記録がちがう、にしない）。手動計時「12.1」は読める', () => {
  assert.equal(S.markWhy(R, rec({ mark: '5.80' })), ''); assert.equal(S.markWhy(R, rec({ event: '男子走高跳', mark: '1.75' })), '');
  assert.equal(S.markWhy(R, rec({ event: '男子100m', mark: '12.1' })), ''); assert.equal(S.markWhy(R, rec({ event: '男子800m', mark: '2:05.3' })), '');
  assert.match(S.markWhy(R, rec({ event: '男子走幅跳', mark: '2:05.30' })), /時間の形/);
  const L = S.scan(R, [rec({ mark: '5.80' }), rec({ mark: '5m80', meet: '架空区大会（速報）' })], {}); assert.deepEqual(L.map(x => x.type), ['dup']); assert.match(L[0].why, /記録（5\.80）も同じ/);
  const L2 = S.scan(R, [rec({ mark: '5.80' }), rec({ mark: '5m90', meet: '別' })], {}); assert.deepEqual(L2.map(x => x.type), ['conflict']); assert.match(L2[0].why, /5\.80・5M90|5M90・5\.80/);
});
await check('取り込み（表・貼り付け・HTML）：手動計時「12.1」は残す（前は記録を消していた）。距離の「5.80」は書きかえずに保存。「11\"25」などは今までどおり読めない', () => {
  const txt = '男子走幅跳 決勝\n順位\t氏名\t所属\t記録\t風\n1\t架空 一郎(2)\t架空中\t5.80\t+1.2\n2\t見本 二郎(2)\t架空中\t5m60\t+0.3\n男子100m 決勝\n順位\t氏名\t所属\t記録\t風\n1\t架空 三郎(2)\t架空中\t12.1\t+0.5\n2\t架空 四郎(2)\t架空中\t11"25\t+0.5\n3\t架空 五郎(2)\t架空中\t12.15\t+0.5\n';
  const o = R.parsePlain(txt, {}), m = Object.fromEntries(o.recs.map(r => [r.name, r]));
  assert.equal(m['架空 一郎'].mark, '5.80'); assert.equal(m['見本 二郎'].mark, '5m60'); assert.equal(m['架空 三郎'].mark, '12.1'); assert.equal(m['架空 三郎'].warn, '');
  assert.equal(m['架空 五郎'].mark, '12.15'); assert.equal(m['架空 四郎'].mark, ''); assert.match(m['架空 四郎'].warn, /記録の形/);
  const o2 = R.parsePlain('男子走幅跳 決勝\n順位\t氏名\t所属\t記録\t風\n1\t架空 一郎(2)\t架空中\t5.8\t+1.2\n', {}); assert.equal(o2.recs[0].mark, '', '跳躍の1けた「5.8」は前と同じ（読まない）');
});
await check('1件ずつ入れる・Excel：今までどおり（走幅跳 5.74 → 5m74、11.8 → 11.80）', () => {
  const M = f => R.manualRecord(Object.assign({ name: '架空 一郎', event: '男子100m', mark: '11.85', date: '2026-10-04' }, f));
  assert.equal(M({ event: '男子走幅跳', mark: '5.74' }).rec.mark, '5m74'); assert.equal(M({ mark: '11.8' }).rec.mark, '11.80'); assert.deepEqual(M({ event: '男子800m', mark: '2:05.3' }).errors, []);
  assert.match(M({ event: '男子100m', mark: '5m74' }).errors.join(), /タイム/);
});
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
