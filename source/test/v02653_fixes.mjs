// v0.26.53 速報の所属の前置き（支部番号・都道府県・地区）を表示で外す／110mJH の高さ・(選)・地区名の種目をまとめる／「みんなの要項・結果」の見出しのことば。架空データのみ。
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), req = createRequire(import.meta.url), R = req('../src/results.js');
const src = f => fs.readFileSync(path.join(here, '../src', f), 'utf8');
let pass = 0, fail = 0; function check(n, f) { try { f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.53] 所属・種目の表記ゆれ');
const rec = (o) => Object.assign({ meet: '架空大会', date: '2026-05-03', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空高', mark: '11.50', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '' }, o);

check('所属の表示：支部番号・都道府県・中体連の地区を外す（ほかはそのまま）', () => {
  const t = { '3・架空': '架空', '東 京・架空高': '架空高', '東京・架空高': '架空高', '東京都・架空高': '架空高', '墨田・架空': '架空中', '豊 島・架 空': '架空中', '架空中 A': '架空中 A', '架空AC': '架空AC', 'Kaku AC': 'Kaku AC', '12 架空高': '架空高', '架空高': '架空高', '': '' };
  for (const [a, b] of Object.entries(t)) assert.equal(R.teamLabel(a), b, a);
});
check('同じ選手の判定（schoolBase）は前置きを外しても同じ', () => {
  for (const a of ['3・架空', '東 京・架空高', '墨田・架空', '豊 島・架 空', '架空中']) assert.equal(R.schoolBase(R.teamLabel(a)), R.schoolBase(a), a);
});
check('選手別：同じ選手は種目がちがっても所属が1つ（いちばん新しい「〜高」の書き方）', () => {
  const rs = [rec({ team: '3・架空', date: '2026-04-03', grade: '高2' }), rec({ team: '東 京・架空高', date: '2026-05-03', event: '男子200m', mark: '23.50', grade: '高2' }), rec({ team: '架空', date: '2026-09-06', event: '男子400m', mark: '52.00', grade: '高2' }), rec({ team: '架空高', date: '2026-06-01', event: '男子100m', mark: '11.40', grade: '高2' })];
  rs.forEach((r, i) => { r.id = 'x' + i; });
  const b = R.computeBests(rs).bests; assert(b.length >= 3); assert.deepEqual([...new Set(b.map(x => x.team))], ['架空高']);
  const keys = new Set(rs.map(r => R.athleteKey(r))); assert.equal(keys.size, 1, '1人のまま');
  assert.equal(R.athleteProfile(rs, [...keys][0]).team, '架空高');
});
check('「架空」だけの選手も、高校とわかっていて同じ表に「架空高」があれば「架空高」と出す（無ければそのまま）', () => {
  const a = [rec({ team: '3・架空', name: '架空 二郎', grade: '高1' }), rec({ team: '架空高', name: '架空 三郎', mark: '11.80' })]; a.forEach((r, i) => { r.id = 'y' + i; });
  assert.deepEqual(R.computeBests(a).bests.map(b => [b.name, b.team]).sort(), [['架空 三郎', '架空高'], ['架空 二郎', '架空高']]);
  const b = [rec({ team: '3・架空', name: '架空 二郎', grade: '高1' })]; b[0].id = 'z';
  assert.equal(R.computeBests(b).bests[0].team, '架空');
});
check('保存のID・同じ記録の判定は変えない（前の版と同じID）', () => {
  const ids = [['3・架空', '男子(選) 200m', '["架空大会","2026-05-03","架空","","男子200m","","","決勝","","架空一郎","11.50"]'],
    ['東 京・架空高', '男子西部2. 1500m', '["架空大会","2026-05-03","架空高","hs","男子西部2.1500m","","","決勝","","架空一郎","11.50"]'],
    ['墨田・架空', '男子110mJH', '["架空大会","2026-05-03","墨田・架空","jh","男子110mJH","","","決勝","","架空一郎","11.50"]'],
    ['架空高', '男子 110mH(1.067m_9.14m)', '["架空大会","2026-05-03","架空高","hs","男子110mH(1.067m_9.14m)","","","決勝","","架空一郎","11.50"]']];
  for (const [team, event, id] of ids) { const r = rec({ team, event }); assert.equal(R.recId(r.meet, r.date, r), 'v7' + id, team + ' ' + event); }
});
check('110mJH と 110mJH(0.991m) は同じ種目。110mH(1.067m) は高校の 110mH と同じ。高さのちがうものはまとめない', () => {
  const k = (e, team = '架空高') => R.eventKey(rec({ event: e, team }));
  assert.equal(k('男子110mJH'), k('男子110mJH(0.991m)')); assert.equal(k('男子110mJH'), k('男子 110mJH(0.991m_9.14m)'));
  assert.equal(k('男子110mJH', '架空'), k('男子110mJH(0.991m)', '架空'), '中学・高校のわからない記録でも');
  assert.equal(k('男子110mH'), k('男子 110mH(1.067m)')); assert.equal(k('男子 高校 110mH(1.067m)'), k('男子OP 110mH(1.067m)'));
  assert.notEqual(k('男子110mJH'), k('男子110mH')); assert.notEqual(k('男子110mJH(0.991m)'), k('男子110mH(1.067m)'));
  assert.notEqual(k('男子110mH', '架空中'), k('男子110mH(1.067m)', '架空中'), '中学の 110mH(0.914m) と 1.067m は別');
  assert.equal(R.eventKeyLabel(rec({ event: '男子110mJH' })), '男子 高校 110mJH(0.991m)');
});
check('(選)・地区名（東部・西部…）は種目名から外してまとめる', () => {
  const k = (e, team = '架空中') => R.eventKey(rec({ event: e, team }));
  for (const e of ['男子(選) 200m', '男子（選）200m', '男子西部 200m', '男子西部共通 200m', '男子西部2. 200m', '男子東部 200m']) assert.equal(k(e), k('男子200m'), e);
  assert.equal(k('男子西部 走幅跳'), k('男子走幅跳')); assert.equal(k('男子西部共通 砲丸投'), k('男子砲丸投(5.000kg)'));
  assert.equal(R.eventShown('男子(選) 200m'), '男子 200m'); assert.equal(R.eventShown('(選) 200m'), '200m'); assert.equal(R.eventShown('男子100m'), '男子100m');
});
check('設定の見出しと説明（みんなの要項／みんなの結果）', () => {
  const a = src('records_app.js');
  assert(a.includes('🤝 だれかが入れた大会は、もう入れなくてOK</b>（みんなの要項／みんなの結果）'));
  assert(a.includes('だれか1人が要項や結果のURLを登録すると、同じ大会に出るほかの先生は、大会を選ぶだけで入れられます。登録されるのは大会名・日付・会場・URL（要項は大会のきまりも）だけで、選手の名前や記録は送りません。すでに登録したものは、オフにしてもそのままです。'));
  assert(a.includes('顧問だけ'));
  for (const f of ['records_app.js', 'app.js', 'guide_template.html', 'buttons.json']) assert(!/「🤝 学校をこえて分け合う」|<b>🤝 学校をこえて分け合う/.test(src(f)), f);
});
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
