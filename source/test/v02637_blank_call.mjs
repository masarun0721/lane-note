// v0.26.37 招集時刻・組を読めなかったときは空欄＋⚠（仮の値で埋めない）。架空のデータだけ
import {createRequire} from 'node:module'; import fs from 'node:fs';
const require = createRequire(import.meta.url);
globalThis.MeetParser = require('../src/parser.js');
const L = require('../src/logic.js'), PL = require('../src/player.js'), PA = require('../src/parent.js');
let ok = 0, ng = 0; const t = (n, c) => { if (c) { ok++; console.log('  ok', n); } else { ng++; console.log('  NG', n); } };
const E = (o) => Object.assign({ team: '架空中', event: '男子100m', round: '予選', heat: 2, pos: 3, posKind: 'lane', bib: '101', name: '架空 一郎', grade: '2', time: '10:00', date: '' }, o);
const sl = { entries: [E({}), E({ bib: '102', name: '架空 二郎', heat: null, pos: 5, time: '10:30', event: '男子200m' }), E({ bib: '103', name: '架空 三郎', event: '男子走幅跳', heat: null, pos: 4, posKind: 'order', time: '11:00' })],
  relays: [{ team: '架空中', event: '男子4x100mR', round: '予選', heat: null, pos: 2, time: '13:00', date: '', members: [{ bib: '101', name: '架空 一郎' }] }], dates: [] };
// 1) ルールなし（注意事項が読めない）→ 招集は空欄・callNG
let rows = L.build(sl, [], ['架空中'], { relayOrderMin: 60, relayOrderBase: '招集完了' });
t('ルールなし：仮の 30〜20分前 で計算しない（招集時刻は全部空欄）', rows.every(r => r.call === '' && r.callStart === '' && r.callEnd === ''));
t('ルールなし：時刻のある行には ⚠ の印（callNG）', rows.every(r => r.callNG === true));
t('callText は「⚠ 招集時刻を読めませんでした」', rows.every(r => L.callText(r) === '⚠ 招集時刻を読めませんでした'));
const r200 = rows.find(r => r.event === '男子200m'), rJump = rows.find(r => r.event === '男子走幅跳'), rRel = rows.find(r => r.typ === 'relay'), r100 = rows.find(r => r.event === '男子100m');
t('トラックで組が読めない → 「1組」にせず空欄・heatNG', r200.heat === '' && r200.heatNG === true && L.heatText(r200) === '⚠組?');
t('読めた組はそのまま（2組）', r100.heat === 2 && !r100.heatNG && L.heatText(r100) === 2);
t('フィールドの組なしは今までどおり「-」で ⚠ なし', rJump.heat === '-' && !rJump.heatNG);
t('リレーの組なしも空欄・heatNG', rRel.heat === '' && rRel.heatNG === true);
t('リレーオーダー提出（招集完了の60分前）は計算せず ⚠', !rRel.orderDeadline && /⚠ オーダー用紙提出の時刻は、招集時刻を読めなかったため出せません/.test(rRel.note));
let sorted; t('並べかえ（時刻順・選手別）が空欄でもこわれない', (() => { sorted = L.byTime(rows); L.byAthlete(rows); return sorted.length === rows.length && sorted[0].event === '男子100m'; })());
t('同じ時刻・空欄の組がまざっても並べかえられる', L.byTime(rows.concat(rows.map(r => Object.assign({}, r, { heat: r.heat === '' ? 1 : '' })))).length === rows.length * 2);
// 2) 手入力したルールは使う
rows = L.build(sl, [], ['架空中'], { callTrack: [30, 20], callField: [40, 30] });
t('手入力（または読めた）ルールでは今までどおり計算', rows.find(r => r.event === '男子100m').call === '9:30〜9:40' && rows.find(r => r.event === '男子走幅跳').call === '10:20〜10:30' && rows.every(r => !r.callNG));
t('フィールドだけ読めないとき：フィールドだけ空欄', (() => { const x = L.build(sl, [], ['架空中'], { callTrack: [30, 20] }); return x.find(r => r.event === '男子走幅跳').callNG && x.find(r => r.event === '男子100m').call === '9:30〜9:40'; })());
// 3) タイムテーブルの招集の列はそのまま使う
const tt = [{ event: '100m', gender: '男子', cat: '', round: '予選', time: '10:00', heats: null, callStart: '9:20', callEnd: '9:35', raw: '10:00 男子100m 予選' }];
rows = L.build(sl, tt, ['架空中'], {});
const tr = rows.find(r => r.event === '男子100m');
t('タイムテーブルの招集の列があれば、ルールなしでもその時刻（⚠ なし）', !tr.callNG && tr.call === '9:20〜9:35' && tr.callSrc === 'tt');
// 4) 通過したら出るラウンド（仮の行）
const tt2 = [{ event: '100m', gender: '男子', cat: '', round: '予選', time: '10:00', heats: null, raw: 'a' }, { event: '100m', gender: '男子', cat: '', round: '決勝', time: '15:00', heats: null, raw: 'b' }];
const base = L.build(sl, [], ['架空中'], {});
const tent = L.tentative(base, tt2, sl, {});
t('通過したら出るラウンド：ルールなしなら招集は空欄・⚠', tent.length > 0 && tent.every(x => x.call === '' && x.callNG));
t('通過したら出るラウンド：ルールがあれば計算', L.tentative(base, tt2, sl, { callTrack: [30, 20] }).every(x => x.call === '14:30〜14:40'));
// 5) 選手のスマホ（共有）：'!' で ⚠ の予定・組は ⚠組?
const p = PL.payloadFor(base, { name: '架空 二郎', team: '架空中', bib: '102', grade: '2', key: PL.keyOf('架空中', '102', '架空 二郎') }, { n: '架空大会' });
t('共有の中身：招集を読めなかった印 "!"・組を読めなかった印 "?"', p.e[0][1] === '!' && p.e[0][5] === '?');
const items = PL.autoItems(p);
t('選手のスマホの予定：「⚠ 招集時刻を読めませんでした」が出る（時刻を作らない）', items.some(i => i.kind === 'call' && /⚠ 招集時刻を読めませんでした/.test(i.label)) && !items.some(i => i.kind === 'call' && /^\d/.test(i.t2 || '') ));
t('選手のスマホの予定：組は「⚠組?」', items.some(i => i.kind === 'race' && /⚠組\?/.test(i.sub)));
// 6) 保護者・印刷用の表（parent.js）
if (PA.timeGrid) { const g = PA.timeGrid(base, L.byTime); t('保護者向けの表：招集の欄に ⚠', g.body.some(r => /⚠ 招集時刻を読めませんでした/.test(r[1]))); }
// 7) 画面・印刷・共有のソース：仮の値を入れない・⚠ を出す
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8'), tpl = fs.readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
t('RULE_DEF に 30/20/40/30 がない', /RULE_DEF = \{ cT0: '', cT1: '', cF0: '', cF1: ''/.test(app));
t('入力欄の初期値も空欄', !/id="c[TF][01]" value="\d/.test(tpl));
t('settings() の 30/20/40/30 の代わりの値がない', !/n\('cT0', 30\)|n\('cF0', 40\)/.test(app));
t('一覧・印刷・Excel・共有で callText/heatText を使う', (app.match(/MeetLogic\.callText\(r\)/g) || []).length >= 5 && (app.match(/MeetLogic\.heatText\(r\)/g) || []).length >= 7);
t('前に保存した仮の値は、読み直すときに空欄へ', /前の版で保存した「仮の初期値」/.test(app));
console.log(`v02637_blank_call: ${ok} ok / ${ng} NG`); if (ng) process.exit(1);
