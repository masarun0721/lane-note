// v0.28.8 学年を「2年」にそろえる（「高2」「高校2年」「2」）。架空データだけ
import assert from 'node:assert/strict'; import {createRequire} from 'node:module';
const req = createRequire(import.meta.url), R = req('../src/results.js'), E = req('../src/entrydraft.js'), S = req('../src/survey.js');
let pass = 0, fail = 0; function check(n, f) { try { f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.28.8] 学年をそろえる');
const rec = o => Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中高', mark: '12.40', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '' }, o);
check('そろえる：高2・高校2年・2年・2 → 2、中2・中学2年 → 中2', () => { for (const g of ['高2', '高校2年', '2年', '2', '２']) { assert.equal(E.gradeNo(g), '2', g); assert.equal(S.gNo(g), '2', g); } for (const g of ['中2', '中学2年', '中２']) { assert.equal(E.gradeNo(g), '中2', g); assert.equal(S.gNo(g), '中2', g); } assert.equal(E.gradeNo(''), ''); });
check('記録帳の選手：「高2」の人も「2」・しぼるキーも同じ・札は「2年」', () => {
  const D = E.data(R, [rec({}), rec({ name: '架空 次郎', grade: '高2', mark: '12.50' }), rec({ name: '架空 三郎', grade: '中1', mark: '13.00' })]);
  const g = n => D.athletes.find(a => a.name === n).grade; assert.equal(g('架空 次郎'), '2'); assert.equal(g('架空 一郎'), '2'); assert.equal(g('架空 三郎'), '中1');
  const b = E.gradeBase(D.athletes.map(a => a.grade), ''); const k = n => E.gradeInfo(g(n), b);
  assert.equal(k('架空 次郎').key, k('架空 一郎').key); assert.equal(k('架空 次郎').lbl, '2年'); assert.equal(E.gradeInfo('高2', 'hs').lbl, '2年'); assert.equal(k('架空 三郎').lbl, '中1年');
  assert.notEqual(E.gradeInfo('中2', b).key, E.gradeInfo('2', b).key); assert.equal(E.gradeInfo('高校2年', b).key, E.gradeInfo('2', b).key); assert.equal(E.gradeInfo('中学2年', b).lbl, '中2年');
  assert.deepEqual(E.byGrade(['高2', '中3', '1', '中1'], x => x, b, 1), ['中1', '中3', '1', '高2']);
});
check('調査の名簿：作るときに数字だけ', () => {
  const d = S.buildDocs({ meet: '架空 秋季', sexes: 'm', roster: [{ n: '架空 次郎', g: '高2', s: 'm', key: 'k1' }, { n: '架空 三郎', g: '中学2年', s: 'm', key: 'k2' }], evs: ['男子100m'], rels: [], deadline: S.jstDay(Date.now() + 5 * 864e5) });
  assert.equal(d.pub.roster[0].g, '2'); assert.equal(d.pub.roster[1].g, '中2');
});
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
