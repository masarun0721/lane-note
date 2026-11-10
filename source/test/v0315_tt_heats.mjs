// v0.31.5 タイムテーブル：性別・種目・組数の表で、種目名のない「続きの組」の行と、混成（（混）／8種）と通常の100mを分けて読む（架空データのみ）
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const P = require('../src/parser.js'); globalThis.MeetParser = P; const L = require('../src/logic.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  NG', m); } };

const it = (str, x, y) => ({ str, x, y, w: String(str).length * 5, h: 9 });
const hdrY = 40;
const items = [
  it('（第１日）11月14日（土）', 40, 20),
  it('競技開始時刻', 40, hdrY), it('性別', 103, hdrY), it('種目', 169, hdrY),
  it('出場数', 242, hdrY), it('組数', 300, hdrY), it('招集開始', 380, hdrY), it('招集完了', 430, hdrY),
  // 混成100m（21人・1～3組）のあと、通常の100mは種目名のない続きの組が続き、33～40組の行に「男 100m」と出る
  it('9:15', 40, 60), it('男', 90, 60), it('110mH', 169, 60), it('1～3組', 300, 60), it('8:45', 380, 60), it('8:55', 430, 60),
  it('9:40', 40, 80), it('男', 90, 80), it('（混）', 156, 80), it('100m', 186, 80), it('21', 252, 80), it('1～3組', 300, 80), it('9:10', 380, 80), it('9:20', 430, 80),
  it('9:50', 40, 100), it('1～8組', 300, 100), it('9:20', 380, 100), it('9:30', 430, 100),
  it('10:10', 40, 120), it('9～16組', 300, 120), it('9:40', 380, 120), it('9:50', 430, 120),
  it('10:30', 40, 140), it('17～24組', 300, 140), it('10:00', 380, 140), it('10:10', 430, 140),
  it('10:50', 40, 160), it('25～32組', 300, 160), it('10:20', 380, 160), it('10:30', 430, 160),
  it('11:10', 40, 180), it('男', 90, 180), it('100m', 169, 180), it('540', 252, 180), it('33～40組', 300, 180), it('10:40', 380, 180), it('10:50', 430, 180),
  it('11:30', 40, 200), it('41～48組', 300, 200), it('11:00', 380, 200), it('11:10', 430, 200),
  it('12:30', 40, 220), it('65～68組', 300, 220), it('12:00', 380, 220), it('12:10', 430, 220),
  // 組が1から再開。種目名は同じ行の途中に出る
  it('12:40', 40, 240), it('1～8組', 300, 240), it('女', 90, 240), it('100m', 169, 240), it('151', 252, 240), it('12:10', 380, 240), it('12:20', 430, 240),
  it('13:00', 40, 260), it('9～19組', 300, 260), it('12:30', 380, 260), it('12:40', 430, 260),
  // 種目名は後の行（9～16組）に出る
  it('13:30', 40, 280), it('1～8組', 300, 280), it('13:00', 380, 280), it('13:10', 430, 280),
  it('13:55', 40, 300), it('男', 90, 300), it('400m', 169, 300), it('186', 252, 300), it('9～16組', 300, 300), it('13:25', 380, 300), it('13:35', 430, 300),
  it('14:20', 40, 320), it('17～24組', 300, 320), it('13:50', 380, 320), it('14:00', 430, 320),
  it('14:45', 40, 340), it('女', 90, 340), it('3000m', 169, 340), it('1組', 300, 340), it('14:15', 380, 340), it('14:25', 430, 340),
  it('15:00', 40, 360), it('男', 90, 360), it('5000m', 169, 360), it('3組', 300, 360), it('14:30', 380, 360), it('14:40', 430, 360),
  // フィールド：別の見出しのあと、1組・2組
  it('競技開始時刻', 40, 400), it('性別', 103, 400), it('種目', 169, 400),
  it('出場数', 242, 400), it('組数', 300, 400), it('招集開始', 380, 400), it('招集完了', 430, 400),
  it('13:00', 40, 420), it('男', 90, 420), it('走高跳', 169, 420), it('1組・2組', 300, 420), it('12:20', 380, 420), it('12:40', 430, 420),
  it('13:30', 40, 440), it('男', 90, 440), it('（混）', 156, 440), it('走幅跳', 186, 440), it('1組', 300, 440), it('12:50', 380, 440), it('13:10', 430, 440),
  it('14:30', 40, 460), it('男', 90, 460), it('走幅跳', 169, 460), it('3組・4組', 300, 460), it('13:50', 380, 460), it('14:00', 430, 460),
  // 1・2組（「組」が後だけ）と、前の種目が1組のあとに「3組」とだけ書かれた種目
  it('15:00', 40, 480), it('男', 90, 480), it('三段跳', 169, 480), it('1', 290, 480), it('・', 300, 480), it('2組', 310, 480), it('14:20', 380, 480), it('14:30', 430, 480)
];
const tt = [{ width: 595, height: 842, items }];
console.log('[v0.31.5] 競技日程の続きの組と混成');
const T = P.parseTimetable(tt);
const evs = T.map(s => `${s.time} ${s.gender || ''} ${s.cat || ''} ${s.event} ${s.heats && s.heats.from != null ? s.heats.from + '–' + s.heats.to : (s.heats && s.heats.all ? '全' + s.heats.count : JSON.stringify(s.heats))}`);
ok(T.length >= 18, '続きの組を含む行を読む（' + T.length + '）：' + evs.join(' / '));

const m100 = T.filter(s => s.event === '100m' && s.gender && s.gender[0] === '男' && !s.cat);
ok(m100.some(s => s.heats && s.heats.from === 1 && s.heats.to === 8 && s.time === '9:50'), '男100m 1～8組は9:50（混成の9:40ではない）');
ok(m100.some(s => s.heats && s.heats.from === 33 && s.heats.to === 40 && s.time === '11:10'), '男100m 33～40組は11:10（種目名が途中の行）');
ok(m100.some(s => s.heats && s.heats.from === 41 && s.heats.to === 48 && s.time === '11:30'), '男100m 41～48組は11:30');
ok(m100.every(s => s.time !== '9:40'), '通常の男100mに混成の9:40を付けない');

const comb = T.filter(s => /混成/.test(s.cat || '') && s.event === '100m');
ok(comb.length === 1 && comb[0].time === '9:40' && comb[0].heats && comb[0].heats.from === 1 && comb[0].heats.to === 3, '（混）100m は混成・9:40・1～3組：' + JSON.stringify(comb[0] && { time: comb[0].time, cat: comb[0].cat, heats: comb[0].heats }));

const w100 = T.filter(s => s.event === '100m' && s.gender && s.gender[0] === '女');
ok(w100.some(s => s.heats && s.heats.from === 1 && s.heats.to === 8 && s.time === '12:40'), '女100m 1～8組は12:40');
ok(w100.some(s => s.heats && s.heats.from === 9 && s.heats.to === 19 && s.time === '13:00'), '女100m 9～19組は13:00');

const m400 = T.filter(s => s.event === '400m' && s.gender && s.gender[0] === '男');
ok(m400.some(s => s.heats && s.heats.from === 1 && s.heats.to === 8 && s.time === '13:30'), '男400m 1～8組は13:30（種目名は後の行）');
ok(m400.some(s => s.heats && s.heats.from === 9 && s.heats.to === 16 && s.time === '13:55'), '男400m 9～16組は13:55');

const hj = T.find(s => s.event === '走高跳');
ok(hj && hj.heats && hj.heats.from === 1 && hj.heats.to === 2 && hj.time === '13:00', 'フィールド「1組・2組」は1～2組：' + JSON.stringify(hj && hj.heats));
ok(T.some(s => s.event === '走幅跳' && /混成/.test(s.cat || '') && s.time === '13:30'), '（混）走幅跳は混成');
ok(T.some(s => s.event === '走幅跳' && !s.cat && s.time === '14:30' && s.heats && s.heats.from === 3 && s.heats.to === 4), '通常の走幅跳 3組・4組は14:30（混成や1～2組に飲み込まない）');
ok(T.some(s => s.event === '三段跳' && s.heats && s.heats.from === 1 && s.heats.to === 2 && s.time === '15:00'), '「1・2組」は1～2組');
ok(T.some(s => s.event === '5000m' && s.heats && s.heats.from === 1 && s.heats.to === 3 && s.time === '15:00'), '「3組」だけ（人数の多い種目）は1～3組の15:00：' + JSON.stringify(T.filter(s=>s.event==='5000m')));

const pt = P.parseTitle('男子 8種100m');
ok(pt.gender === '男子' && pt.cat === '8種' && pt.disc === '100m', 'parseTitle「男子 8種100m」→ 8種 + 100m：' + JSON.stringify(pt));
ok(P.parseTitle('男子8種100m').cat === '8種' && P.parseTitle('男子8種100m').disc === '100m', 'スペース無しの「男子8種100m」も同じ');

const mk = (event, heat) => ({ event, round: 'タイムレース', heat, pos: 1, posKind: 'レーン', bib: '1', name: '架空 太郎', team: '架空高', grade: '2', page: 1 });
const entries = [
  mk('男子 100m', 3), mk('男子 100m', 4), mk('男子 100m', 7), mk('男子 100m', 8),
  mk('男子 100m', 10), mk('男子 100m', 17), mk('男子 100m', 22), mk('男子 100m', 29),
  mk('男子 100m', 31), mk('男子 100m', 46),
  mk('男子 8種100m', 1), mk('男子 8種100m', 3),
  mk('男子 400m', 1), mk('男子 400m', 10),
  { event: '男子 走高跳', round: '決勝', heat: 2, pos: 1, posKind: '試技順', bib: '2', name: '架空 次郎', team: '架空高', grade: '2', page: 2 },
  { event: '男子 走幅跳', round: '決勝', heat: 3, pos: 2, posKind: '試技順', bib: '3', name: '架空 三郎', team: '架空高', grade: '2', page: 2 },
  mk('男子 5000m', 2)
];
const R = L.build({ entries, relays: [], events: [] }, T, ['架空高'], {});
const g = (e, h) => R.find(r => r.event === e && r.heat === h);
const want = { 3: '9:50', 4: '9:50', 7: '9:50', 8: '9:50', 10: '10:10', 17: '10:30', 22: '10:30', 29: '10:50', 31: '10:50', 46: '11:30' };
Object.keys(want).forEach(h => {
  const r = g('男子 100m', +h);
  ok(r && r.start === want[h], '男子100m ' + h + '組は' + want[h] + '（混成の9:40や時刻不明ではない）：' + (r && (r.start || '（空）') + ' ' + (r.note || '')));
});
ok(g('男子 100m', 3).call === '9:20〜9:30', '男子100m 3組の招集は9:20〜9:30：' + (g('男子 100m', 3).call || ''));
ok(g('男子 8種100m', 1) && g('男子 8種100m', 1).start === '9:40', '男子8種100m 1組は混成の9:40：' + (g('男子 8種100m', 1) && g('男子 8種100m', 1).start));
ok(g('男子 8種100m', 3) && g('男子 8種100m', 3).start === '9:40', '男子8種100m 3組は9:40');
ok(g('男子 400m', 1) && g('男子 400m', 1).start === '13:30', '男子400m 1組は13:30：' + (g('男子 400m', 1) && g('男子 400m', 1).start));
ok(g('男子 400m', 10) && g('男子 400m', 10).start === '13:55', '男子400m 10組は13:55');
const fj = R.find(r => r.event === '男子 走高跳');
ok(fj && fj.start === '13:00', '走高跳 2組は1組・2組の13:00：' + (fj && fj.start));
const lj = R.find(r => r.event === '男子 走幅跳' && r.heat === 3);
ok(lj && lj.start === '14:30', '走幅跳 3組は3組・4組の14:30：' + (lj && (lj.start || '（空）') + ' ' + (lj.note || '')));
ok(g('男子 5000m', 2) && g('男子 5000m', 2).start === '15:00', '男子5000m 2組は「3組」＝1～3組の15:00：' + (g('男子 5000m', 2) && g('男子 5000m', 2).start));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
