// v0.26.52 ふりかえりシートのテスト・見本に使う架空の記録（名前・学校・大会はすべて架空）
export function makeRecords(R) {
  const out = [];
  const add = o => { const r = Object.assign({ team: '架空第一高', wind: '', round: '', heat: '', rank: '' }, o); r.id = R.recId(r.meet, r.date, r); out.push(r); return r; };
  // 架空 一郎（2年）：前の年度にも記録がある。100m・200m・走幅跳。追い風参考も1つ
  [['2025-05-10', '架空区 春季記録会', '12.02', '+0.6'], ['2025-09-20', '架空区 秋季大会', '11.86', '+1.2']].forEach(([d, m, mk, w]) => add({ name: '架空 一郎', grade: '1', event: '男子100m', mark: mk, wind: w, date: d, meet: m, round: '予選', heat: '2', rank: '3' }));
  add({ name: '架空 一郎', grade: '1', event: '男子200m', mark: '24.10', wind: '+0.3', date: '2025-09-21', meet: '架空区 秋季大会', round: '決勝', rank: '4' });
  const M = [['2026-04-12', '架空区 春季記録会'], ['2026-05-03', '架空県 高校総体 支部予選'], ['2026-05-04', '架空県 高校総体 支部予選'], ['2026-06-14', '架空区 夏季大会'], ['2026-08-23', '架空区 ナイター記録会'], ['2026-09-27', '架空県 新人戦']];
  add({ name: '架空 一郎', grade: '2', event: '男子100m', mark: '11.91', wind: '-0.4', date: M[0][0], meet: M[0][1], round: 'タイムレース', heat: '3', rank: '1' });
  add({ name: '架空 一郎', grade: '2', event: '男子100m', mark: '11.74', wind: '+1.5', date: M[1][0], meet: M[1][1], round: '予選', heat: '1', rank: '2' });
  add({ name: '架空 一郎', grade: '2', event: '男子100m', mark: '11.69', wind: '+0.9', date: M[1][0], meet: M[1][1], round: '決勝', rank: '3' });
  add({ name: '架空 一郎', grade: '2', event: '男子200m', mark: '23.78', wind: '+1.1', date: M[2][0], meet: M[2][1], round: '決勝', rank: '5' });
  add({ name: '架空 一郎', grade: '2', event: '男子100m', mark: '11.55', wind: '+2.8', date: M[3][0], meet: M[3][1], round: '決勝', rank: '1' });
  add({ name: '架空 一郎', grade: '2', event: '男子走幅跳', mark: '6m12', wind: '+1.0', date: M[3][0], meet: M[3][1], rank: '2' });
  add({ name: '架空 一郎', grade: '2', event: '男子100m', mark: '11.72', wind: '+0.2', date: M[4][0], meet: M[4][1], round: 'タイムレース', heat: '1', rank: '1', comment: '体調メモ：寝不足' });
  add({ name: '架空 一郎', grade: '2', event: '男子走幅跳', mark: '6m31', wind: '+1.8', date: M[5][0], meet: M[5][1], rank: '3' });
  add({ name: '架空 一郎', grade: '2', event: '男子200m', mark: 'DNS', date: M[5][0], meet: M[5][1], round: '予選' });
  // 見本 二郎（1年）：この年度がはじめて。400m・800m
  add({ name: '見本 二郎', grade: '1', event: '男子400m', mark: '56.80', date: M[0][0], meet: M[0][1], round: 'タイムレース', heat: '2', rank: '4' });
  add({ name: '見本 二郎', grade: '1', event: '男子400m', mark: '55.21', date: M[3][0], meet: M[3][1], round: '決勝', rank: '6' });
  add({ name: '見本 二郎', grade: '1', event: '男子800m', mark: '2:08.44', date: M[4][0], meet: M[4][1], round: 'タイムレース', heat: '1', rank: '2' });
  add({ name: '見本 二郎', grade: '1', event: '男子400m', mark: '54.62', date: M[5][0], meet: M[5][1], round: '予選', heat: '3', rank: '2' });
  // 松﨑 健（2年）：リレーの走順は名字だけ「松崎」
  add({ name: '松﨑 健', grade: '2', event: '男子200m', mark: '23.95', wind: '+0.4', date: M[1][0], meet: M[1][1], round: '予選', heat: '2', rank: '2' });
  add({ name: '松﨑 健', grade: '2', event: '男子200m', mark: '23.51', wind: '+1.0', date: M[5][0], meet: M[5][1], round: '決勝', rank: '4' });
  // 試験 三郎（3年）：大会がとても多い（1枚に入るかを見る）
  const many = [['2026-04-05', '架空区 記録会 第1戦'], ['2026-04-19', '架空区 記録会 第2戦'], ['2026-04-29', '架空市 陸上競技選手権'], ['2026-05-03', '架空県 高校総体 支部予選'], ['2026-05-17', '架空県 高校総体'], ['2026-05-30', '架空区 記録会 第3戦'], ['2026-06-14', '架空区 夏季大会'], ['2026-06-28', '架空ブロック大会'], ['2026-07-12', '架空区 記録会 第4戦'], ['2026-07-26', '架空ナイター'], ['2026-08-09', '架空区 記録会 第5戦'], ['2026-08-23', '架空区 ナイター記録会'], ['2026-09-06', '架空区 記録会 第6戦'], ['2026-09-27', '架空県 新人戦'], ['2026-10-04', '架空区 記録会 第7戦'], ['2026-10-11', '架空区 秋季大会']];
  add({ name: '試験 三郎', grade: '2', event: '男子110mH', mark: '16.20', wind: '+0.5', date: '2025-10-05', meet: '架空区 記録会 前年', rank: '2' });
  add({ name: '試験 三郎', grade: '2', event: '男子走高跳', mark: '1m75', date: '2025-10-05', meet: '架空区 記録会 前年', rank: '1' });
  many.forEach(([d, m], i) => {
    add({ name: '試験 三郎', grade: '3', event: '男子110mH', mark: (16.4 - i * 0.07).toFixed(2), wind: ['+0.5', '-0.3', '+1.2', '+2.4', '+0.8'][i % 5], date: d, meet: m, round: i % 3 ? '決勝' : '予選', heat: i % 3 ? '' : '1', rank: String(1 + i % 5) });
    if (i % 2 === 0) add({ name: '試験 三郎', grade: '3', event: '男子走高跳', mark: '1m' + (70 + i), date: d, meet: m, rank: String(2 + i % 4) });
    if (i % 4 === 1) add({ name: '試験 三郎', grade: '3', event: '男子三段跳', mark: (12.1 + i * 0.05).toFixed(2).replace('.', 'm'), wind: '+1.0', date: d, meet: m, rank: '3' });
    if (i === 7) add({ name: '試験 三郎', grade: '3', event: '男子110mH', mark: 'DQ', date: d, meet: m, round: '準決勝' });
  });
  // リレー（チームの記録・走順）
  const relay = (d, m, ev, mark, legs, o = {}) => { const res = R.relayRecord(Object.assign({ event: ev, team: '架空第一高', mark, date: d, meet: m, legs, round: '決勝', rank: '' }, o)); if (!res.rec) throw new Error(res.errors.join('/')); out.push(res.rec); };
  relay(M[1][0], M[1][1], '男子4×100mR', '44.12', ['見本 二郎', '架空 一郎', '松崎', '試験 三郎'], { rank: '3' });
  relay(M[5][0], M[5][1], '男子4×100mR', '43.80', ['試験 三郎', '架空 一郎', '松崎', '見本 二郎'], { rank: '2' });
  relay(M[5][0], M[5][1], '男子4×400mR', '3:36.50', ['見本 二郎', '松﨑 健', '空想 太一', '架空 一郎'], { rank: '4' });
  relay('2025-09-21', '架空区 秋季大会', '男子4×100mR', '45.01', ['架空 一郎', '仮名 四郎', '例示 五郎', '想定 六郎']);   // 前の年度（今年度のシートには出ない）
  return out;
}
