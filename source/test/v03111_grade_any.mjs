// v0.31.11：選ぶ一覧・個人表（画面で見る／PDF）の学年を、学年のある いちばん新しい記録（台帳があれば台帳）から。どこにも無ければ出さない。架空のデータだけ
import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const R = require('../src/results.js');
let ok = 0, ng = 0; const t = (c, m) => { if (c) { ok++; console.log('  ✔ ' + m); } else { ng++; console.log('  NG ' + m); } };
console.log('[v0.31.11] 学年があったりなかったり');
const A = { name: '架空 一郎', team: '本郷高', event: '男子 100m' };
const recs = [
  Object.assign({ id: 'a1', date: '2026-05-01', meet: '架空記録会', mark: '11.50', grade: '' }, A),
  Object.assign({ id: 'a2', date: '2026-06-01', meet: '架空記録会2', mark: '11.40', grade: '高1' }, A),
  Object.assign({ id: 'a3', date: '2026-09-01', meet: '架空記録会3', mark: '11.30', grade: '' }, A, { event: '男子 200m' }),
  { id: 'b1', name: '見本 次郎', team: '本郷高', grade: '', date: '2026-06-01', meet: '架空記録会', event: '男子 100m', mark: '12.00' },
  { id: 'c1', name: '例 三太', team: '本郷高', grade: '高1', date: '2025-06-01', meet: '架空記録会0', event: '男子 400m', mark: '55.00' },
  { id: 'c2', name: '例 三太', team: '本郷高', grade: '2', date: '2026-06-01', meet: '架空記録会', event: '男子 400m', mark: '54.00' },
  { id: 'c3', name: '例 三太', team: '本郷高', grade: '', date: '2026-10-01', meet: '架空記録会4', event: '男子 800m', mark: '2:05.00' }];
R.setDivisionHints(R.inferDivisions(recs, {}).hints);
const gm = R.latestGrades(recs), ka = R.athleteKey(recs[0]), kb = R.athleteKey(recs[3]), kc = R.athleteKey(recs[4]);
t(gm[ka] === '高1', '学年の無い記録が新しくても・種目がちがっても、学年のある記録から（高1）');
t(gm[kc] === '2', '学年のある記録のうち、いちばん新しい日付のもの（2）');
t(!(kb in gm), 'どこにも学年が無い選手は空（推測で埋めない）');
t(R.athleteProfile(recs, ka).grade === '高1' && R.athleteProfile(recs, kb).grade === '', '個人表の元（athleteProfile）も同じ');
const src = fs.readFileSync(new URL('../src/records_app.js', import.meta.url), 'utf8');
const fn = src.match(/function athGrade\(key, gm\) \{[\s\S]*?\n  \}/)[0], gs = src.match(/function grShort\(g\) \{[^\n]*\}/)[0];
const mk = (roster) => new Function('R', 'ALL', 'LaneRoster', 'rosterOf', gs + '\n' + fn + '; return athGrade;')(R, recs, { gradeIn: (e, y) => y - e.entry + 1, schoolYear: () => 2026, maxGrade: () => 3 }, (aid) => roster[aid] || null);
const ag = mk({ A1234567890: { aid: 'A1234567890', entry: 2025, status: 'active' }, A0000000000: { aid: 'A0000000000', status: 'active' } });
t(ag(ka, gm) === '1年' && ag(kc, gm) === '2年' && ag(kb, gm) === '', '一覧の表示は「1年」「2年」、無い人は何も出さない');
t(ag('id:A1234567890', gm) === '2年', '台帳に1年生だった年度があれば、今の年度の学年（2025年度に1年→2026年度は2年）');
t(ag('id:A0000000000', { 'id:A0000000000': '高3' }) === '3年', '台帳に年度が無ければ記録の学年');
const uses = (src.match(/athGrade\(b\.key, gm\)/g) || []).length >= 3 && !/grShort\(\(b\.best \|\| b\.ref/.test(src) && !/var g = \(b\.best \|\| b\.ref \|\| \{\}\)\.grade/.test(src);
t(uses, '個人表・ふりかえりシート・個人ページの選ぶ一覧で同じ学年');
t(/o\.gradeOf = function \(k\) \{ return athGrade\(k, gm\); \}/.test(src) && /o\.gradeOf \? o\.gradeOf\(key\)/.test(fs.readFileSync(new URL('../src/print.js', import.meta.url), 'utf8')), '個人表（画面で見る・PDF）も一覧と同じ学年');
console.log((ng ? 'NG ' : '') + 'v0.31.11 学年 OK ' + ok + (ng ? ' / NG ' + ng : '')); process.exit(ng ? 1 : 0);
