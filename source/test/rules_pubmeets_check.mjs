// v0.26.35 みんなの要項（pubMeets・pubQuota）のルールをエミュレーターで確かめる（架空データだけ・本番には接続しない）
import fs from 'node:fs'; import {createRequire} from 'node:module';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
const {doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, collection, query, where, limit, writeBatch, serverTimestamp, Timestamp, setLogLevel} = F;
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
const LanePub = createRequire(import.meta.url)('../src/pubmeets.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok', name); } catch (e) { failed++; console.log('  NG', name, e && e.message); } }
const claims = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const DBS = {}, db = u => DBS[u] || (DBS[u] = env.authenticatedContext(u, claims).firestore());
const adminSet = (p, v) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), p), v));
let GOT; const adminGet = async p => { await env.withSecurityRulesDisabled(async c => { GOT = (await getDoc(doc(c.firestore(), p))).data(); }); return GOT; };
const T = 'PTEAMAAAAAAAAAAAAAAA', T2 = 'QTEAMAAAAAAAAAAAAAAA';
const PL = { date: '2026-11-03', end: '2026-11-03', meet: '第12回 架空区 中学校陸上競技大会', venue: '架空競技場' };
const api = u => LanePub.make({ F, fs: db(u), uid: u });
const day = () => Math.floor(Date.now() / 864e5);
const cool = (u, n = 1, team = T) => adminSet('pubQuota/' + u, { team, at: Timestamp.fromMillis(Date.now() - 60000), day: day(), n });
const ID = LanePub.docId(PL.date, PL.meet);
try {
  await env.clearFirestore();
  await adminSet('teams/' + T, { v: 1, name: '架空中学陸上部', ownerUid: 'alice', createdAt: Timestamp.now() });
  for (const [u, t, r] of [['alice', T, 'coach'], ['bob', T, 'manager'], ['carol', T2, 'coach'], ['dan', T2, 'coach'], ['eve', T2, 'coach'], ['fay', T2, 'coach']]) await adminSet('teams/' + t + '/members/' + u, r === 'manager' ? { role: r, name: '架空', expiresAt: Timestamp.fromMillis(Date.now() + 864e7) } : { role: r, name: '架空' });
  await adminSet('teams/' + T2, { v: 1, name: '架空高校陸上部', ownerUid: 'carol', createdAt: Timestamp.now() });
  await test('顧問は登録できる（URL・大会の情報だけ）', async () => { await assertSucceeds(api('alice').publish(PL, 'https://www.kotorikkyo.info/m/12/yoko.pdf', { rules: { call: '30分前' }, fees: {} }, T)); const v = await adminGet('pubMeets/' + ID); if (v.rep !== 0 || v.hid !== false || v.by !== 'alice' || v.ver !== 1) throw new Error(JSON.stringify(v)); });
  await test('マネージャー・チームのない人・ログインなしは登録できない', async () => {
    await assertFails(api('bob').publish(Object.assign({}, PL, { meet: '架空記録会' }), 'https://kaku.example/y.pdf', {}, T));
    await assertFails(api('zed').publish(Object.assign({}, PL, { meet: '架空記録会' }), 'https://kaku.example/y.pdf', {}, T));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'pubMeets', ID), { name: 'x' }));
  });
  await test('ほかのチームのIDを書いて顧問のふりはできない', async () => { await cool('carol', 1, T2); await assertFails(api('carol').publish(Object.assign({}, PL, { meet: '架空秋季' }), 'https://kaku.example/y.pdf', {}, T)); });
  await test('回数の制限：30秒に1回・1日20件まで（pubQuota を同じ書き込みで書かないと不可）', async () => {
    const b = writeBatch(db('carol')); b.set(doc(db('carol'), 'pubMeets', LanePub.docId(PL.date, '架空A')), Object.assign(LanePub.entry(Object.assign({}, PL, { meet: '架空A' }), 'https://kaku.example/a.pdf', {}), { by: 'carol', at: serverTimestamp(), exp: Timestamp.fromMillis(LanePub.exp(PL)), ver: 1, rep: 0, hid: false })); await assertFails(b.commit());
    await adminSet('pubQuota/carol', { team: T2, at: Timestamp.fromMillis(Date.now() - 5000), day: day(), n: 1 });
    const c = writeBatch(db('carol')); c.set(doc(db('carol'), 'pubQuota', 'carol'), { team: T2, at: serverTimestamp(), day: day(), n: 2 }); await assertFails(c.commit());
    await cool('carol', 20, T2); const e = writeBatch(db('carol')); e.set(doc(db('carol'), 'pubQuota', 'carol'), { team: T2, at: serverTimestamp(), day: day(), n: 21 }); await assertFails(e.commit());
    await cool('carol', 3, T2); const g = writeBatch(db('carol')); g.set(doc(db('carol'), 'pubQuota', 'carol'), { team: T2, at: serverTimestamp(), day: day(), n: 9 }); await assertFails(g.commit());
  });
  await test('形の検査：選手の項目・http や javascript のURL・ほかの人の名前（by）・反則の報告数は不可', async () => {
    await cool('alice'); const mk = (o) => { const b = writeBatch(db('alice')); b.set(doc(db('alice'), 'pubQuota', 'alice'), { team: T, at: serverTimestamp(), day: day(), n: 2 }); b.set(doc(db('alice'), 'pubMeets', LanePub.docId(PL.date, '架空B')), Object.assign(LanePub.entry(Object.assign({}, PL, { meet: '架空B' }), 'https://kaku.example/b.pdf', {}), { by: 'alice', at: serverTimestamp(), exp: Timestamp.fromMillis(LanePub.exp(PL)), ver: 1, rep: 0, hid: false }, o)); return b.commit(); };
    await assertFails(mk({ athletes: ['架空 一郎'] })); await assertFails(mk({ url: 'http://kaku.example/b.pdf' })); await assertFails(mk({ url: 'javascript:alert(1)' }));
    await assertFails(mk({ by: 'carol' })); await assertFails(mk({ rep: 0, hid: true })); await assertFails(mk({ info: 'x'.repeat(8001) }));
    await assertSucceeds(mk({}));
  });
  await test('読む：ログインした人は日付で探せる（20件まで・隠れていないもの）。ログインなしは不可', async () => {
    const r = await api('carol').search({ date: PL.date, meet: '架空区中学校陸上競技大会' }); if (r.length !== 1 || r[0].id !== ID || !(r[0].score >= 0.85)) throw new Error(JSON.stringify(r));
    await assertFails(getDocs(query(collection(db('carol'), 'pubMeets'), where('date', '==', PL.date), limit(20))));   // hid の条件なしは不可
    await assertFails(getDocs(query(collection(db('carol'), 'pubMeets'), where('hid', '==', false), limit(50))));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'pubMeets', ID)));
  });
  await test('差し替え：ほかの顧問がURLを差し替えられる（版+1）。大会名・日付・期限・報告数は変えられない', async () => {
    await cool('carol', 1, T2); const old = (await api('carol').search(PL))[0];
    await assertSucceeds(api('carol').publish(PL, 'https://www.kotorikkyo.info/m/12/yoko_v2.pdf', {}, T2, old));
    const v = await adminGet('pubMeets/' + ID); if (v.ver !== 2 || v.by !== 'carol' || !/v2/.test(v.url) || v.name !== old.name) throw new Error(JSON.stringify(v));
    await cool('alice'); const b = writeBatch(db('alice')); b.set(doc(db('alice'), 'pubQuota', 'alice'), { team: T, at: serverTimestamp(), day: day(), n: 2 }); b.update(doc(db('alice'), 'pubMeets', ID), { date: '2026-11-04', by: 'alice', at: serverTimestamp(), ver: 3 }); await assertFails(b.commit());
  });
  await test('報告：顧問が1人1回。3件で隠れて、だれも読めない・差し替えもできない', async () => {
    for (const u of ['dan', 'eve']) { await cool(u, 1, T2); const e = (await api(u).search(PL))[0]; await assertSucceeds(api(u).report(e, T2)); }
    await cool('dan', 1, T2); { const e = (await api('dan').search(PL))[0]; await assertFails(api('dan').report(e, T2)); }   // 2回目は不可
    await cool('bob', 1, T); { const e = Object.assign({}, (await api('alice').search(PL))[0]); await assertFails(api('bob').report(e, T)); }   // マネージャーは不可
    await cool('fay', 1, T2); { const e = (await api('fay').search(PL))[0]; if (e.rep !== 2) throw new Error('rep ' + e.rep); await assertSucceeds(api('fay').report(e, T2)); }
    const v = await adminGet('pubMeets/' + ID); if (v.rep !== 3 || v.hid !== true) throw new Error(JSON.stringify(v));
    await assertFails(getDoc(doc(db('alice'), 'pubMeets', ID))); if ((await api('alice').search(PL)).length !== 0) throw new Error('隠れていない');
  });
  await test('報告数を一気に増やす・下げる・報告の記録なしで増やすのは不可', async () => {
    const id2 = LanePub.docId(PL.date, '架空B'); await cool('dan', 1, T2);
    const b = writeBatch(db('dan')); b.set(doc(db('dan'), 'pubQuota', 'dan'), { team: T2, at: serverTimestamp(), day: day(), n: 2 }); b.update(doc(db('dan'), 'pubMeets', id2), { rep: 1, hid: false }); await assertFails(b.commit());
    const c = writeBatch(db('dan')); c.set(doc(db('dan'), 'pubQuota', 'dan'), { team: T2, at: serverTimestamp(), day: day(), n: 2 }); c.set(doc(db('dan'), 'pubMeets', id2, 'reports', 'dan'), { at: serverTimestamp() }); c.update(doc(db('dan'), 'pubMeets', id2), { rep: 3, hid: true }); await assertFails(c.commit());
  });
  await test('消す：登録した本人はできる・ほかの人はできない・期限切れはだれでも片づけられる', async () => {
    const id2 = LanePub.docId(PL.date, '架空B'); await assertFails(deleteDoc(doc(db('carol'), 'pubMeets', id2))); await assertSucceeds(deleteDoc(doc(db('alice'), 'pubMeets', id2)));
    await adminSet('pubMeets/2026-01-01_00000000', Object.assign(LanePub.entry({ date: '2026-01-01', meet: '架空古い大会' }, 'https://kaku.example/o.pdf', {}), { by: 'alice', at: Timestamp.now(), exp: Timestamp.fromMillis(Date.now() - 1000), ver: 1, rep: 0, hid: false }));
    await assertSucceeds(deleteDoc(doc(db('carol'), 'pubMeets', '2026-01-01_00000000')));
  });
  await test('回数の記録（pubQuota）と報告の記録はほかの人に読めない・登録するかの設定は本人だけ', async () => {
    await assertFails(getDoc(doc(db('carol'), 'pubQuota', 'alice'))); await assertSucceeds(getDoc(doc(db('alice'), 'pubQuota', 'alice')));
    await assertFails(getDoc(doc(db('alice'), 'pubMeets', ID, 'reports', 'dan')));
    await assertSucceeds(api('alice').setPref(false)); await assertFails(getDoc(doc(db('carol'), 'users', 'alice', 'settings', 'pub')));
  });
} finally { await env.cleanup(); }
console.log(passed + ' passed, ' + failed + ' failed'); if (failed) process.exit(1);
