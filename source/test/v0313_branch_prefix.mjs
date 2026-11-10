// v0.31.3：大会準備のスタートリストで、高体連プログラムの所属「3・架空」（支部番号・学校名）を学校名だけにする。
// リレーは「架空」「架空B」のままなので、候補が2校に分かれない。架空データのみ。
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const P = require('../src/parser.js');
globalThis.MeetParser = P;
const L = require('../src/logic.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  NG', m); } };

const it = (str, x, y, h = 9) => ({ str, x, y, w: String(str).length * 5, h });

// 個人：ヘッダー（レーン・ﾅﾝﾊﾞｰ・氏名・所属）と、先頭「3・架空」、半角中黒、末尾「架空 ・3」、別校、中体連の「地区・学校」
const track = { width: 595, height: 842, items: [
  it('男子 100m', 40, 40, 16),
  it('タイムレース', 40, 60, 13),
  it('1組', 40, 80),
  it('レーン', 40, 100), it('ﾅﾝﾊﾞｰ', 70, 100), it('氏名', 120, 100), it('所属', 220, 100), it('記録', 320, 100),
  it('1', 52, 120), it('5801', 74, 120), it('架空 一郎(1)', 120, 120), it('3・架空', 220, 120),
  it('2', 52, 140), it('5802', 74, 140), it('架空 二郎(2)', 120, 140), it('3・架空', 220, 140),
  it('3', 52, 160), it('5803', 74, 160), it('架空 三郎(1)', 120, 160), it('3･架空', 220, 160),
  it('4', 52, 180), it('5804', 74, 180), it('架空 四郎(2)', 120, 180), it('架空 ・3', 220, 180),
  it('5', 52, 200), it('1001', 74, 200), it('見本 五郎(2)', 120, 200), it('2・見本高', 220, 200),
  it('6', 52, 220), it('2001', 74, 220), it('試験 六郎(1)', 120, 220), it('墨田・試験中', 220, 220)
] };

// リレー：チーム名は支部番号なし（「架空」「架空B」）
const relay = { width: 595, height: 842, items: [
  it('男子 4×100m', 40, 40, 16),
  it('タイムレース', 40, 60, 13),
  it('1組', 40, 80),
  it('4レーン', 40, 120), it('架空', 130, 120),
  it('5801', 50, 140), it('架空 一郎(1)', 110, 140),
  it('8レーン', 40, 180), it('架空B', 130, 180),
  it('5805', 50, 200), it('架空 七郎(2)', 110, 200)
] };

console.log('[v0.31.3] 所属の先頭「3・学校名」（支部番号）を外す');
const sl = P.parseStartList([track, relay]);
const teamsE = sl.entries.map(e => e.team);
const teamsR = sl.relays.map(r => r.team);
ok(sl.entries.length === 6, '個人6人を読む：' + sl.entries.length);
ok(sl.relays.length === 2, 'リレー2チームを読む：' + sl.relays.length + ' ' + JSON.stringify(teamsR));
ok(teamsE.filter(t => t === '架空').length === 4, '先頭「3・架空」「3･架空」と末尾「架空 ・3」はどれも「架空」：' + JSON.stringify(teamsE));
ok(teamsE.includes('見本高') && !teamsE.includes('2・見本高'), '別校「2・見本高」も「見本高」になる：' + JSON.stringify(teamsE));
ok(teamsE.includes('墨田・試験中'), '先頭が数字でない「墨田・試験中」（中体連の地区・学校）はそのまま：' + JSON.stringify(teamsE));
ok(!teamsE.some(t => /^\d+[・･]/.test(t)), '個人の所属に先頭の「N・」が残らない');
ok(teamsR.includes('架空') && teamsR.includes('架空B'), 'リレーのチーム名は「架空」「架空B」のまま：' + JSON.stringify(teamsR));

const found = L.findTeams(sl, '架空');
ok(found.length === 1 && found[0] === '架空', '「架空」の候補は1校（「3・架空」と「架空」に分かれない）：' + JSON.stringify(found));
const rows = L.build(sl, [], found, {});
ok(rows.length === 6, '個人4＋リレー2＝6件（架空Bも架空にまとまる）：' + rows.length + ' typ=' + rows.map(r => r.typ).join(','));
ok(rows.every(r => r.team === '架空'), '一覧の所属はすべて「架空」：' + [...new Set(rows.map(r => r.team))]);
ok(L.findTeams(sl, '見本').length === 1 && L.findTeams(sl, '見本')[0] === '見本高', '見本高も1候補：' + JSON.stringify(L.findTeams(sl, '見本')));
ok(L.findTeams(sl, '試験中')[0] === '墨田・試験中', '試験中は地区付きのまま見つかる：' + JSON.stringify(L.findTeams(sl, '試験中')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
