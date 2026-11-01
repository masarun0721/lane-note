// v0.30.1 タイムテーブル：区分の欄に「中学共通女子」と性別が書かれていれば、上の行（男子リレー）の性別を引き継がない。架空のデータだけ
import {createRequire} from 'module'; const require = createRequire(import.meta.url);
const P = require('../src/parser.js'); globalThis.MeetParser = P; const L = require('../src/logic.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  NG', m); } };
const X = [30, 80, 160, 250, 290, 330, 380], it = (str, x, y) => ({str, x, y, w: str.length * 5, h: 9});
const line = (y, a) => a.map((s, i) => [s, X[i]]).filter(c => c[0] !== '').map(([s, x]) => it(s, x, y));
const tt = [{width: 595, height: 842, items: [
  ...line(40, ['競技時刻', '区分', '競技名', '申込数', '組数', '招集開始', '招集完了']),
  ...line(60, ['11:30', '男子', '4X100mR(1~4)', '20', '4', '11:05', '11:15']),
  ...line(70, ['12:25', '中学共通女子', '100m(1~6)', '60', '8', '12:00', '12:10']),
  ...line(80, ['12:40', '中学共通女子', '100m(7~8)', '', '', '12:15', '12:25']),
  ...line(90, ['13:30', '中学共通男子', '100m(1~6)', '90', '12', '13:05', '13:15']),
  ...line(100, ['13:45', '中学共通男子', '100m(7~12)', '', '', '13:20', '13:30']),
]}];
console.log('[v0.30.1] タイムテーブルの性別（男子リレーの下の女子100m）');
const T = P.parseTimetable(tt);
ok(T.filter(s => s.cat === '中学共通女子').every(s => s.gender === '女子'), '「中学共通女子」の行は女子：' + T.map(s => s.cat + '=' + s.gender).join(','));
const mk = (event, heat) => ({event, round: 'タイムレース', heat, pos: 1, posKind: 'レーン', bib: '1', name: '架空 太郎', team: '架空中', grade: '2', page: 1});
const R = L.build({entries: [mk('中学共通男子100m', 1), mk('中学共通男子100m', 8), mk('中学共通女子100m', 2)], relays: [], events: []}, T, ['架空中'], {});
const g = (e, h) => R.find(r => r.event === e && r.heat === h);
ok(g('中学共通男子100m', 1).start === '13:30' && g('中学共通男子100m', 1).call === '13:05〜13:15', '男子100m 1組は男子の13:30（女子の12:25ではない）：' + g('中学共通男子100m', 1).start);
ok(g('中学共通男子100m', 8).start === '13:45', '男子100m 8組は男子の13:45：' + g('中学共通男子100m', 8).start);
ok(g('中学共通女子100m', 2).start === '12:25', '女子100m 2組は女子の12:25：' + g('中学共通女子100m', 2).start);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
