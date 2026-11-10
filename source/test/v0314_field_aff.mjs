// v0.31.4：フィールド種目のプログラムで、所属が「氏名の行＝支部番号だけ／ナンバーの下の行＝学校名」に分かれているとき、
// 番号のすぐ下（同じx）に学校名がある場合だけつなぐ。隣の組や次の行は使わない。架空データのみ。
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const P = require('../src/parser.js');
globalThis.MeetParser = P;
const L = require('../src/logic.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  NG', m); } };

const it = (str, x, y, h = 5.7) => ({ str, x, y, w: String(str).length * 5, h });

// 2列の走幅跳：左「3」+下「架空」、右は同じ行に別校。次の行は見本高。最後の1人は下に学校名なし。
const field = { width: 595, height: 842, items: [
  it('男子 走幅跳', 40, 40, 16),
  it('決勝', 40, 70, 13),
  it('1組', 40, 85), it('2組', 310, 85),
  it('試', 33, 98), it('順', 33, 104), it('ﾅﾝﾊﾞｰ', 41, 100, 4.2),
  it('氏', 64, 101, 6), it('名', 76, 101, 6), it('所', 106, 101, 6), it('属', 119, 101, 6),
  it('1回目', 140, 101, 6), it('記録', 205, 101, 6), it('順位', 222, 101, 5.3),
  it('試', 306, 98), it('順', 306, 104), it('ﾅﾝﾊﾞｰ', 314, 100, 4.2),
  it('氏', 337, 101, 6), it('名', 349, 101, 6), it('所', 379, 101, 6), it('属', 392, 101, 6),
  it('1回目', 413, 101, 6), it('記録', 477, 101, 6), it('順位', 495, 101, 5.3),

  // 1人目：左 架空（番号は上、学校は下）、右 ウェルネス（カタカナの学校名）
  it('架空 一郎(2)', 52, 118), it('3', 95, 118), it('m', 146, 118),
  it('見本 花子(1)', 325, 118), it('2', 368, 118), it('m', 419, 118),
  it('1', 37, 121), it('8801', 45, 121, 5.3), it('1', 310, 121), it('9901', 318, 121, 5.3),
  it('ｶﾅ ｲﾁﾛｳ', 52, 124.3), it('架空', 95, 124.3), it('+･- .', 139, 124.3),
  it('ｶﾅ ﾊﾅｺ', 325, 124.3), it('ウェルネス', 368, 124.3), it('+･- .', 412, 124.3),

  // 2人目：左 見本高。右は試験高。前の行の「架空」を取らないこと。
  it('見本 二郎(1)', 52, 130), it('2', 95, 130), it('m', 146, 130),
  it('試験 三郎(2)', 325, 130), it('3', 368, 130), it('m', 419, 130),
  it('2', 37, 133), it('8802', 45, 133, 5.3), it('2', 310, 133), it('9902', 318, 133, 5.3),
  it('ｶﾅ ｼﾞﾛｳ', 52, 136.3), it('見本高', 95, 136.3), it('+･- .', 139, 136.3),
  it('ｶﾅ ｻﾌﾞﾛｳ', 325, 136.3), it('試験高', 368, 136.3), it('+･- .', 412, 136.3),

  // 3人目：下の行に学校名が無い → 所属は「3」のまま（推測しない）
  it('欠 四郎(1)', 52, 142), it('3', 95, 142), it('m', 146, 142),
  it('3', 37, 145), it('8803', 45, 145, 5.3),
  it('ｶﾅ ｼﾛｳ', 52, 148.3), it('+･- .', 139, 148.3)
] };

// トラック：同じ行に「3・架空」と書く従来形式は、この修正のあとでも架空のまま
const track = { width: 595, height: 842, items: [
  it('男子 100m', 40, 40, 16),
  it('タイムレース', 40, 60, 13),
  it('1組', 40, 80),
  it('レーン', 40, 100), it('ﾅﾝﾊﾞｰ', 70, 100), it('氏名', 120, 100), it('所属', 220, 100), it('記録', 320, 100),
  it('1', 52, 120), it('8801', 74, 120), it('架空 一郎(2)', 120, 120), it('3・架空', 220, 120),
  it('2', 52, 140), it('2001', 74, 140), it('試験 六郎(1)', 120, 140), it('墨田・試験中', 220, 140)
] };

console.log('[v0.31.4] フィールド所属が番号と学校名で2行に分かれている');
const sl = P.parseStartList([field, track]);
const byBib = Object.fromEntries(sl.entries.map(e => [String(e.bib), e]));
const f8801 = byBib['8801'];
const f8802 = byBib['8802'];
const f8803 = byBib['8803'];
const f9901 = byBib['9901'];
const f9902 = byBib['9902'];
const t8801 = sl.entries.filter(e => String(e.bib) === '8801' && /100m/.test(e.event))[0];

ok(sl.entries.filter(e => /走幅跳/.test(e.event)).length === 5, '走幅跳を5人読む：' + sl.entries.filter(e => /走幅跳/.test(e.event)).length);
ok(f8801 && f8801.team === '架空' && f8801.name === '架空 一郎' && f8801.grade === '2',
  '左1：番号「3」と下の「架空」をつないで架空：' + JSON.stringify(f8801 && { team: f8801.team, name: f8801.name, grade: f8801.grade }));
ok(f9901 && f9901.team === 'ウェルネス' && f9901.name === '見本 花子',
  '右1：同じ行のカタカナ校名ウェルネス（隣の「架空」を取らない）：' + JSON.stringify(f9901 && { team: f9901.team, name: f9901.name }));
ok(f8802 && f8802.team === '見本高',
  '左2：見本高（前の行の「架空」を取らない）：' + (f8802 && f8802.team));
ok(f9902 && f9902.team === '試験高',
  '右2：試験高：' + (f9902 && f9902.team));
ok(f8803 && f8803.team === '3' && f8803.name === '欠 四郎',
  '下に学校名が無い行は「3」のまま（推測しない）：' + JSON.stringify(f8803 && { team: f8803.team, name: f8803.name }));
ok(t8801 && t8801.team === '架空',
  'トラックの「3・架空」（同じ行）はこれまでどおり架空：' + (t8801 && t8801.team));
ok(sl.entries.some(e => e.team === '墨田・試験中'),
  '中体連の「墨田・試験中」はそのまま');

const found = L.findTeams(sl, '架空');
ok(found.length === 1 && found[0] === '架空',
  '「架空」の候補は1校：' + JSON.stringify(found));
const rows = L.build(sl, [], found, {});
ok(rows.length === 2 && rows.every(r => r.team === '架空'),
  '架空はフィールド1＋トラック1＝2件：' + rows.length + ' typ=' + rows.map(r => r.typ).join(','));
ok(L.findTeams(sl, 'ウェルネス').length === 1,
  'ウェルネスも1候補：' + JSON.stringify(L.findTeams(sl, 'ウェルネス')));

const w = (sl.warnings || []).filter(d => (d.warn || []).some(x => /番号だけ/.test(x)));
ok(w.length >= 1 && w.some(d => /走幅跳/.test(d.title || '')),
  '学校名を読めない行がある種目に警告が残る：' + JSON.stringify(w.map(d => d.title + ':' + d.warn.join(','))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
