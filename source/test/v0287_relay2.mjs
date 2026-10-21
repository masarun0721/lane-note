// v0.28.7 エントリー調査：リレーを2つ（4×100mR・4×400mR）とも選べる。架空データだけ
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), req = createRequire(import.meta.url), R = req('../src/results.js'), E = req('../src/entrydraft.js'), S = req('../src/survey.js');
let pass = 0, fail = 0; function check(n, f) { try { f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.28.7] リレーを2つ選ぶ');
const s = { evs: ['男子100m'], rels: ['男子4×100mR', '男子4×400mR'] };
check('答え：rel と rel2 を両方残す・同じものや不可のときは外す・rel2 だけなら rel にする', () => {
  const o = S.cleanAnswer({ ev1: '男子100m', relay: 'ok', rel: '男子4×100mR', rel2: '男子4×400mR' }, s).ok; assert.deepEqual([o.rel, o.rel2], ['男子4×100mR', '男子4×400mR']);
  assert.equal(S.cleanAnswer({ ev1: '男子100m', relay: 'ok', rel: '男子4×100mR', rel2: '男子4×100mR' }, s).ok.rel2 || '', '');
  assert.equal(S.cleanAnswer({ ev1: '男子100m', relay: 'no', rel: '男子4×100mR', rel2: '男子4×400mR' }, s).ok.rel2 || '', '');
  const p = S.cleanAnswer({ ev1: '男子100m', relay: 'ok', rel: '', rel2: '男子4×400mR' }, s).ok; assert.deepEqual([p.rel, p.rel2 || ''], ['男子4×400mR', '']);
  assert.equal(S.cleanAnswer({ join: false, relay: 'ok', rel: '男子4×100mR', rel2: '男子4×400mR' }, s).ok.rel2 || '', '');
});
check('下書き：両方のリレーのチームに入る', () => {
  const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '' }, o); r.id = R.recId(r.meet, r.date, r.event, r.round, r.heat, r.name, r.mark); return r; };
  const D = E.data(R, [rec({}), rec({ event: '男子4×100mR', name: '架空中', mark: '47.50', wind: '' }), rec({ event: '男子4×400mR', name: '架空中', mark: '3:40.00', wind: '' })]);
  const k = D.athletes.find(a => a.name === '架空 一郎').key, P = E.newPlan();
  const r = S.apply(E, D, P, { roster: [{ n: '架空 一郎' }], akeys: [k] }, { 0: { ev1: '男子100m', relay: 'ok', rel: '男子4×100mR', rel2: '男子4×400mR' } });
  assert.equal(r.relay, 2, r.skip.join()); assert.equal(Object.keys(P.relays).length, 2);
});
check('選手の画面：チップは rel・rel2 を光らせ、押すとそれぞれ入れる／外す（単一選択でない）。顧問の一覧は両方出す', () => {
  const src = fs.readFileSync(path.join(here, '../src/survey.js'), 'utf8'), ra = fs.readFileSync(path.join(here, '../src/records_app.js'), 'utf8');
  assert(src.includes("(st.rel === e || st.rel2 === e)")); assert(src.includes("else if (st.rel2 === e) st.rel2 = ''; else if (!st.rel) st.rel = e; else st.rel2 = e;"));
  assert(src.includes('if (o.rel2) w.rel2 = o.rel2;')); assert(ra.includes("a.rel2 ? '・'"));
  assert(fs.readFileSync(path.join(here, '../../firestore.rules'), 'utf8').includes("(!('rel2' in d) || (d.rel2 is string && d.rel != '' && d.rel2 in s.rels && d.rel2 != d.rel))"));
});
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
