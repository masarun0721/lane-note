// v0.26.35 参加できないときの理由（もう入っている・承認待ち・外された）をエミュレーターで確かめる（架空のデータだけ・本番にはつながない）
//   リポジトリ直下で：npx -y firebase-tools@14.12.0 emulators:exec --only firestore --project demo-lane-note --config firebase.json "node source/test/rules_safety_check.mjs"
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
const {doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch, increment, setLogLevel} = F;
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
const LaneTeam = createRequire(import.meta.url)('../src/team.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok', name); } catch (e) { failed++; console.log('  NG', name, e && e.message); } }
const claims = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const db = u => env.authenticatedContext(u, claims).firestore();
const T = (u, name) => LaneTeam.make({ F, fs: db(u), uid: u, name: name || '架空の' + u });
async function adminSet(p, v) { await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), p), v)); }
async function adminGet(p) { let v; await env.withSecurityRulesDisabled(async c => { v = (await getDoc(doc(c.firestore(), p))).data(); }); return v; }
const flags = (o, uid) => Object.assign({ talk: true, relay: true, counter: true, share: true, at: serverTimestamp(), by: uid }, o);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const try_ = async f => { try { await f(); return null; } catch (e) { return e; } };
try {
  await env.clearFirestore();
  const alice = T('alice', '架空顧問'); const t = await alice.createTeam('架空中学陸上部');
  const codes = await alice.codes(t), cc = codes.coach.code;
  await test('はじめての参加は今までどおり', async () => { await T('bob').join(codes.manager.code); });
  await test('もう入っている人がもう一度押す →「もうこのチームにマネージャーとして入っています」', async () => {
    await sleep(10500); const e = await try_(() => T('bob').join(cc)); if (!e || e.code !== 'already-member' || !/マネージャーとして入っています/.test(e.message)) throw new Error(e ? e.code + e.message : '通ってしまった');
  });
  await test('承認が要るコードで申しこみ済み（承認待ち）の人がもう一度押す →「承認待ち」', async () => {
    const sec = LaneTeam.newSecret(); await adminSet('teams/' + t + '/codes/' + sec, { role: 'coach', createdAt: Timestamp.now(), by: 'alice', approve: true });
    const r = await T('carol').join(t + '-' + sec); if (r.role !== 'pending') throw new Error(JSON.stringify(r));
    await sleep(10500); const e = await try_(() => T('carol').join(t + '-' + sec)); if (!e || e.code !== 'already-pending' || !/承認待ち/.test(e.message)) throw new Error(e ? e.code : '通った');
  });
  await test('外された人 →「このチームから外されています」（再参加の許可を頼む）', async () => {
    await alice.remove(t, 'bob'); await sleep(10500); const e = await try_(() => T('bob').join(cc)); if (!e || e.code !== 'banned' || !/外されています/.test(e.message)) throw new Error(e ? e.code : '通った');
  });
  await test('外された印：本人は自分のだけ読める・ほかの人は読めない・一覧は顧問だけ', async () => {
    await assertSucceeds(getDoc(doc(db('bob'), 'teams', t, 'banned', 'bob'))); await assertFails(getDoc(doc(db('dave'), 'teams', t, 'banned', 'bob')));
    await assertFails(getDocs(collection(db('bob'), 'teams', t, 'banned')));
  });
  await test('まちがったコードは今までどおり bad-code', async () => { const e = await try_(() => T('erin').join(t + '-' + LaneTeam.newSecret())); if (!e || e.code !== 'bad-code') throw new Error(e ? e.code : '通った'); });
} finally { await env.cleanup(); }
console.log(passed + ' passed, ' + failed + ' failed'); if (failed) process.exit(1);
