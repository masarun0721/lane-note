// v0.29.7 監査 R296-01・02・04 のルールをエミュレーターで確かめる（架空データだけ・本番には接続しない）
import fs from 'node:fs'; import {createRequire} from 'node:module';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
const {doc, setDoc, getDoc, updateDoc, deleteField, serverTimestamp, Timestamp, setLogLevel} = F;
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
const S = createRequire(import.meta.url)('../src/survey.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok', name); } catch (e) { failed++; console.log('  NG', name, e && e.message); } }
const google = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const db = u => env.authenticatedContext(u, google).firestore(), anon = env.unauthenticatedContext().firestore();
const adminSet = (p, v) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), p), v));
const adminUpd = (p, v) => env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), p), v));
let GOT; const adminGet = async p => { await env.withSecurityRulesDisabled(async c => { const d = await getDoc(doc(c.firestore(), p)); GOT = d.exists() ? d.data() : null; }); return GOT; };
const day = n => S.jstDay(Date.now() + n * 864e5);
const ROSTER = Array.from({ length: 12 }, (_, i) => ({ n: '架空 選手' + (i + 1), g: '2', s: 'm', key: 'k' + i }));
const A = 'AAAAAAAAAAAAAAAA', B = 'BBBBBBBBBBBBBBBB';
const T = 'VTEAMAAAAAAAAAAAAAAA';
try {
  await env.clearFirestore();
  const SID = await S.coach({ F, fs: db('alice') }, 'alice').create({ meet: '架空区 秋季大会', team: '', sexes: 'm', roster: ROSTER, evs: ['男子100m', '男子200m'], rels: [], deadline: day(10) });
  const EX = (await adminGet('surveys/' + SID)).expireAt;
  const ans = o => Object.assign({ ev1: '男子100m', ev2: '', relay: '', rel: '', cm: '', at: serverTimestamp(), expireAt: EX }, o);
  const put = (rid, o) => setDoc(doc(anon, 'surveys', SID, 'answers', rid), ans(o));
  const cool = rid => adminUpd('surveys/' + SID + '/answers/' + rid, { at: Timestamp.fromMillis(Date.now() - 60000) });
  await test('R296-01 作る：d1・dv がない／片方だけ／ちがう値、は不可。そろっていれば可', async () => {
    await assertFails(put('r1', {})); await assertFails(put('r1', { d1: A })); await assertFails(put('r1', { dv: A })); await assertFails(put('r1', { d1: A, dv: B }));
    await assertSucceeds(put('r1', { d1: A, dv: A }));
  });
  await test('R296-01 書きかえ：dv を消す・d1 を変える／消す、は不可。dv を別の端末の印にするのは可（顧問に警告が出る）', async () => {
    await cool('r1'); await assertFails(updateDoc(doc(anon, 'surveys', SID, 'answers', 'r1'), { ev1: '男子200m', dv: deleteField(), at: serverTimestamp() }));
    await assertFails(updateDoc(doc(anon, 'surveys', SID, 'answers', 'r1'), { ev1: '男子200m', d1: B, at: serverTimestamp() }));
    await assertFails(setDoc(doc(anon, 'surveys', SID, 'answers', 'r1'), ans({ ev1: '男子200m', dv: B })));
    await assertSucceeds(updateDoc(doc(anon, 'surveys', SID, 'answers', 'r1'), { ev1: '男子200m', dv: B, at: serverTimestamp() }));
    const a = await S.coach({ F, fs: db('alice') }, 'alice').answers(SID); if (!a[1].moved || a[1].nocmp || a[1].ev1 !== '男子200m') throw new Error(JSON.stringify(a[1]));
  });
  await test('R296-01 印のない古い答え：顧問には「端末を比べられない」（nocmp）。書きかえるときも dv が要る', async () => {
    await adminSet('surveys/' + SID + '/answers/r2', ans({ at: Timestamp.fromMillis(Date.now() - 60000) }));
    let a = await S.coach({ F, fs: db('alice') }, 'alice').answers(SID); if (!a[2].nocmp || a[2].moved) throw new Error(JSON.stringify(a[2]));
    await assertFails(updateDoc(doc(anon, 'surveys', SID, 'answers', 'r2'), { ev1: '男子200m', at: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(anon, 'surveys', SID, 'answers', 'r2'), { ev1: '男子200m', dv: A, at: serverTimestamp() }));
    a = await S.coach({ F, fs: db('alice') }, 'alice').answers(SID); if (!a[2].nocmp) throw new Error('d1 なしは比べられない');
  });
  await test('R296-02 番号：r0・r9・r10・r11 は可。r00・r01・r000・r010 は不可', async () => {
    for (const r of ['r0', 'r9', 'r10', 'r11']) await assertSucceeds(put(r, { d1: A, dv: A }));
    for (const r of ['r00', 'r01', 'r000', 'r010']) await assertFails(put(r, { d1: B, dv: B }));
    await assertFails(put('r12', { d1: A, dv: A }));
  });
  await test('R296-02 すでにある別名の文書（r00）は顧問の表に入れず、数だけ知らせる。本人の r0 の答えが表に出る', async () => {
    await adminSet('surveys/' + SID + '/answers/r00', ans({ ev1: '男子200m', d1: B, dv: B }));
    const a = await S.coach({ F, fs: db('alice') }, 'alice').answers(SID);
    if (a[0].ev1 !== '男子100m' || a.bad !== 1 || Object.keys(a).includes('00')) throw new Error(JSON.stringify(a) + ' bad=' + a.bad);
  });
  await adminSet('teams/' + T, { v: 1, name: '架空中学陸上部', ownerUid: 'alice', createdAt: Timestamp.now() });
  await adminSet('teams/' + T + '/members/alice', { role: 'coach', name: '架空' });
  await adminSet('teams/' + T + '/members/bob', { role: 'manager', name: '架空', expiresAt: Timestamp.fromMillis(Date.now() + 864e7) });
  const M = o => Object.assign({ key: '2026-11-01|架空テスト大会', date: '2026-11-01', meet: '架空テスト大会', plan: true }, o);
  const mref = (u, k = 'm1') => doc(db(u), 'teams', T, 'meets', k);
  await test('R296-04 大会の印：entryAt・payAt・date・deadline が文字でない／plan が真偽でない／temp が地図、は不可', async () => {
    for (const o of [{ entryAt: { unexpected: 'object' } }, { payAt: { unexpected: 'object' } }, { payAt: ['2026-10-01'] }, { date: 20261101 }, { deadline: true }, { plan: 'yes' }, { temp: { a: 1 } }, { fee: 1200 }, { payDueTime: { h: 1 } }])
      await assertFails(setDoc(mref('bob'), M(o)));
  });
  await test('R296-04 prep：info が文字（100,001文字）・知らない項目・at が数、は不可', async () => {
    await assertFails(setDoc(mref('bob', 'm2'), { prep: { info: 'x'.repeat(100001) } }));
    await assertFails(setDoc(mref('bob', 'm2'), { prep: { info: { name: '架空', evil: 1 } } }));
    await assertFails(setDoc(mref('bob', 'm2'), { prep: { at: 123 } }));
  });
  await test('R296-04 今までの正しい形は書ける：日付の文字・エントリー済の日・数の気温・Timestamp の更新日時・大会準備だけの部分文書', async () => {
    await assertSucceeds(setDoc(mref('bob'), M({ entryAt: '2026-10-20', payAt: '', payDue: '2026-10-25', payDueTime: '17:00', fee: '12,000円', temp: 18.5, humidity: '', weather: '晴', updatedAt: Timestamp.now(), importedAt: '', importedN: 3, end: '2026-11-02', div: '中学' })));
    await assertSucceeds(setDoc(mref('alice', 'm3'), { prep: { at: new Date().toISOString(), info: { name: '架空テスト大会', date: '2026年11月1日', rules: { maxEv: '2' }, fees: {} }, docs: {} } }, { merge: true }));
    await assertSucceeds(updateDoc(mref('alice', 'm3'), 'prep.at', new Date().toISOString(), 'prep.info', { name: '架空', date: '' }));
  });
} finally { await env.cleanup(); }
console.log(`rules_v0297_check: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
