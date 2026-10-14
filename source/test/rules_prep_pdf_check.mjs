// v0.26.33 大会準備のPDF（teams/{T}/meets/{k}/pdf/{c}）のルールをエミュレーターで確かめる（架空データだけ・本番には接続しない）
import fs from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDoc, getDocs, deleteDoc, collection, Timestamp, setLogLevel} from 'firebase/firestore';
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok', name); } catch (e) { failed++; console.log('  NG', name, e && e.message); } }
const claims = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const db = u => env.authenticatedContext(u, claims).firestore();
const nowPlus = d => Timestamp.fromMillis(Date.now() + d * 864e5);
const adminSet = (p, v) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), p), v));
const T = 'PTEAMAAAAAAAAAAAAAAA', K = '2026-10-24|架空新人大会';
const chunk = (u, o = {}) => Object.assign({ kind: 'yoko', i: 0, n: 1, data: 'JVBERi0xLjQK', name: '架空要項.pdf', size: 1000, exp: nowPlus(40), by: u }, o);
const P = (u, c = 'yoko_0') => doc(db(u), 'teams', T, 'meets', K, 'pdf', c);
try {
  await env.clearFirestore();
  await adminSet('teams/' + T, { v: 1, name: '架空高校陸上部', ownerUid: 'alice', createdAt: Timestamp.now() });
  await adminSet('teams/' + T + '/members/alice', { role: 'coach', name: '架空顧問A' });
  await adminSet('teams/' + T + '/members/bob', { role: 'manager', name: '架空マネB', expiresAt: nowPlus(100) });
  await adminSet('teams/' + T + '/members/erin', { role: 'manager', name: '架空マネE', expiresAt: nowPlus(-1) });
  await test('顧問はPDFのかけらを保存・読める', async () => { await assertSucceeds(setDoc(P('alice'), chunk('alice'))); await assertSucceeds(getDoc(P('alice'))); });
  await test('マネージャー（期限内）も保存・読める', async () => { await assertSucceeds(setDoc(P('bob', 'sl_0'), chunk('bob', { kind: 'sl' }))); await assertSucceeds(getDoc(P('bob'))); });
  await test('期限切れのマネージャー・メンバー以外・ログインなしは読めない・書けない', async () => {
    await assertFails(getDoc(P('erin'))); await assertFails(setDoc(P('erin', 'tt_0'), chunk('erin', { kind: 'tt' })));
    await assertFails(getDoc(P('dave'))); await assertFails(setDoc(P('dave', 'tt_0'), chunk('dave', { kind: 'tt' })));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'teams', T, 'meets', K, 'pdf', 'yoko_0')));
  });
  await test('一覧は不可（メンバーでも）', () => assertFails(getDocs(collection(db('alice'), 'teams', T, 'meets', K, 'pdf'))));
  await test('形の検査：IDと種類・番号が合わない／余分な項目／4種類以外は不可', async () => {
    await assertFails(setDoc(P('alice', 'yoko_1'), chunk('alice')));
    await assertFails(setDoc(P('alice', 'sl_0'), chunk('alice')));
    await assertFails(setDoc(P('alice', 'xx_0'), chunk('alice', { kind: 'xx' })));
    await assertFails(setDoc(P('alice'), Object.assign(chunk('alice'), { athletes: ['架空'] })));
  });
  await test('大きさ：1かけら 90万文字まで・10かけらまで・元のファイル 5MB まで', async () => {
    await assertSucceeds(setDoc(P('alice', 'note_0'), chunk('alice', { kind: 'note', data: 'A'.repeat(900000) })));
    await assertFails(setDoc(P('alice', 'note_0'), chunk('alice', { kind: 'note', data: 'A'.repeat(900001) })));
    await assertFails(setDoc(P('alice', 'note_0'), chunk('alice', { kind: 'note', n: 11 })));
    await assertFails(setDoc(P('alice', 'note_0'), chunk('alice', { kind: 'note', size: 5242881 })));
  });
  await test('期限（exp）：過去・430日より先は不可', async () => {
    await assertFails(setDoc(P('alice'), chunk('alice', { exp: nowPlus(-1) })));
    await assertFails(setDoc(P('alice'), chunk('alice', { exp: nowPlus(431) })));
    await assertSucceeds(setDoc(P('alice'), chunk('alice', { exp: nowPlus(429) })));
  });
  await test('書いた人（by）は自分だけ', () => assertFails(setDoc(P('bob', 'tt_0'), chunk('alice', { kind: 'tt' }))));
  await test('期限（大会終了の1か月後）が過ぎたら、メンバーでも読めない・消すことはできる', async () => {
    await adminSet('teams/' + T + '/meets/' + K + '/pdf/tt_0', chunk('alice', { kind: 'tt', exp: nowPlus(-1) }));
    await assertFails(getDoc(P('alice', 'tt_0'))); await assertSucceeds(deleteDoc(P('bob', 'tt_0')));
  });
  await test('ほかのチームのPDFは読めない', async () => { await adminSet('teams/QTEAMAAAAAAAAAAAAAAA/meets/k/pdf/yoko_0', chunk('carol')); await assertFails(getDoc(doc(db('alice'), 'teams', 'QTEAMAAAAAAAAAAAAAAA', 'meets', 'k', 'pdf', 'yoko_0'))); });
  await test('個人の大会（users/{uid}/meets/{k}/pdf）は本人だけ', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'users', 'alice', 'meets', K, 'pdf', 'yoko_0'), chunk('alice')));
    await assertFails(getDoc(doc(db('bob'), 'users', 'alice', 'meets', K, 'pdf', 'yoko_0')));
  });
  await test('大会の印（meets/{k}）の prep（URL・読み取った日付など）はメンバーが書ける（今まで通り）', () => assertSucceeds(setDoc(doc(db('bob'), 'teams', T, 'meets', K), { prep: { docs: { yoko: { url: 'https://kaku.example/y.pdf', at: 'x' } } } }, { merge: true })));
} finally { await env.cleanup(); }
console.log(passed + ' passed, ' + failed + ' failed'); if (failed) process.exit(1);
