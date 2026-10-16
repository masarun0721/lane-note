// v0.26.64 管理者だけがチームの一覧（teams）を読める・中（members・records・codes など）は読めない・作成と名前の変更はそのまま。エミュレーターで確かめる（架空のデータだけ・本番にはつながない）
//   リポジトリ直下で：npx -y firebase-tools@14.12.0 emulators:exec --only firestore --project demo-lane-note --config firebase.json "node source/test/rules_admin_list_check.mjs"
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
const {doc, collection, collectionGroup, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, setLogLevel} = F;
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
const LaneTeam = createRequire(import.meta.url)('../src/team.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok', name); } catch (e) { failed++; console.log('  NG', name, e && e.message); } }
const google = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const db = (u, c) => env.authenticatedContext(u, c || google).firestore();
const T = (u, name) => LaneTeam.make({ F, fs: db(u), uid: u, name: name || '架空の' + u });
async function adminSet(p, v) { await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), p), v)); }
async function adminGet(p) { let v; await env.withSecurityRulesDisabled(async c => { v = (await getDoc(doc(c.firestore(), p))).data(); }); return v; }
console.log('[v0.26.64] 管理者だけチームの一覧（名前）を読める');
try {
  await env.clearFirestore();
  const ADM = 'fake-admin-uid-9';
  await adminSet('admins/' + ADM, {});
  const alice = T('alice', '架空顧問A'), carol = T('carol', '架空顧問C');
  let t1, t2;
  await test('作成：Google の顧問はこれまで通りチームを作れる（2チーム）', async () => { t1 = await alice.createTeam('わかば架空高校'); t2 = await carol.createTeam('あおば架空中学校'); if (!t1 || !t2) throw new Error('作れない'); });
  await alice.put(t1, 'coach', [{ id: 'r1', name: '架空選手1', team: '架空高', event: '100m', mark: '12.34', meet: '架空記録会', date: '2026-04-01' }]);
  await test('名前の変更：持ち主の顧問はこれまで通り変えられる', async () => { await alice.rename(t1, 'わかば架空高校陸上部'); const d = await adminGet('teams/' + t1); if (d.name !== 'わかば架空高校陸上部') throw new Error(d.name); });
  await test('管理者でない（Google の顧問）：チームの一覧は読めない', () => assertFails(getDocs(collection(db('alice'), 'teams'))));
  await test('管理者でない：名前で絞っても一覧は読めない', () => assertFails(getDocs(query(collection(db('alice'), 'teams'), where('name', '==', 'あおば架空中学校')))));
  await test('ログインなし：チームの一覧は読めない', () => assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'teams'))));
  await test('匿名ログインは admins があっても管理者にならない（一覧は読めない）', () => assertFails(getDocs(collection(db(ADM, { firebase: { sign_in_provider: 'anonymous' } }), 'teams'))));
  await test('管理者：チームの一覧を読める（チーム名）', async () => {
    const s = await assertSucceeds(getDocs(collection(db(ADM), 'teams'))); const names = s.docs.map(d => d.data().name).sort((a, b) => a.localeCompare(b, 'ja'));
    if (JSON.stringify(names) !== JSON.stringify(['あおば架空中学校', 'わかば架空高校陸上部'])) throw new Error(JSON.stringify(names));
    const keys = [...new Set(s.docs.flatMap(d => Object.keys(d.data())))].sort(); if (JSON.stringify(keys) !== JSON.stringify(['createdAt', 'name', 'ownerUid', 'v'])) throw new Error('チームの文書の欄：' + keys);
  });
  await test('管理者：1チームを get では読めない（メンバーではない）', () => assertFails(getDoc(doc(db(ADM), 'teams', t1))));
  for (const sub of ['members', 'records', 'codes', 'hist', 'meets', 'banned']) {
    await test('管理者：' + sub + ' は一覧も1件も読めない', async () => { await assertFails(getDocs(collection(db(ADM), 'teams', t1, sub))); await assertFails(getDoc(doc(db(ADM), 'teams', t1, sub, sub === 'members' ? 'alice' : sub === 'records' ? 'r1' : 'x'))); });
  }
  await test('管理者：参加コード（codes）の実物も読めない', async () => { const c = await alice.codes(t1); await assertFails(getDoc(doc(db(ADM), 'teams', t1, 'codes', c.coach.code.split('-')[1]))); });
  await test('管理者：collectionGroup（members・records・codes）も読めない', async () => { for (const g of ['members', 'records', 'codes']) await assertFails(getDocs(collectionGroup(db(ADM), g))); });
  await test('管理者：ほかの人の users/{uid}/teams も読めない', () => assertFails(getDocs(collection(db(ADM), 'users', 'alice', 'teams'))));
  await test('管理者：チームの名前を書きかえられない・消せない・作れない（新しい書き込みの道はない）', async () => {
    await assertFails(updateDoc(doc(db(ADM), 'teams', t1), { name: 'x' })); await assertFails(deleteDoc(doc(db(ADM), 'teams', t1)));
    await assertFails(setDoc(doc(db(ADM), 'teams', 'ZZZZZZZZZZZZZZZZZZZZ'), { v: 1, name: 'x', ownerUid: ADM, createdAt: F.serverTimestamp() }));
  });
  await test('管理者：admins の一覧は読めない（自分の印だけ get できる）', async () => { await assertFails(getDocs(collection(db(ADM), 'admins'))); await assertSucceeds(getDoc(doc(db(ADM), 'admins', ADM))); await assertFails(getDoc(doc(db('alice'), 'admins', ADM))); });
  await test('管理者でない人は admins に自分を足せない', () => assertFails(setDoc(doc(db('alice'), 'admins', 'alice'), {})));
  await test('チームの文書に name 以外の欄（選手名など）は足せない（作成・変更とも）', async () => {
    await assertFails(updateDoc(doc(db('alice'), 'teams', t1), { players: '架空' }));
  });
  await test('メンバー（顧問）はこれまで通り自分のチームを get できる・一覧はできない', async () => { await assertSucceeds(getDoc(doc(db('alice'), 'teams', t1))); await assertFails(getDocs(collection(db('alice'), 'teams'))); });
} finally {
  await env.cleanup();
}
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
