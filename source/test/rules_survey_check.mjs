// v0.28.0 エントリー調査（surveys・surveyAdmins・answers）のルールをエミュレーターで確かめる（架空データだけ・本番には接続しない）
import fs from 'node:fs'; import {createRequire} from 'node:module';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
const {doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, collection, query, where, writeBatch, serverTimestamp, Timestamp, setLogLevel} = F;
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
const S = createRequire(import.meta.url)('../src/survey.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok', name); } catch (e) { failed++; console.log('  NG', name, e && e.message); } }
const google = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const DBS = {}, db = u => DBS[u] || (DBS[u] = env.authenticatedContext(u, google).firestore());
const anonDb = env.unauthenticatedContext().firestore();
const anonAuthDb = env.authenticatedContext('anonx', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const adminSet = (p, v) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), p), v));
const adminUpd = (p, v) => env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), p), v));
let GOT; const adminGet = async p => { await env.withSecurityRulesDisabled(async c => { const d = await getDoc(doc(c.firestore(), p)); GOT = d.exists() ? d.data() : null; }); return GOT; };
const T = 'STEAMAAAAAAAAAAAAAAA', T2 = 'UTEAMAAAAAAAAAAAAAAA';
const day = n => S.jstDay(Date.now() + n * 864e5);
const ROSTER = [{ n: '架空 一郎', g: '2', s: 'm', key: 'k1' }, { n: '架空 二郎', g: '1', s: 'm', key: 'k2' }, { n: '架空 花子', g: '3', s: 'f', key: 'k3' }];
const OPT = (o = {}) => Object.assign({ meet: '架空区 秋季大会', team: '', sexes: 'mf', roster: ROSTER, evs: ['男子100m', '男子走幅跳', '女子100m'], rels: ['男子4×100mR'], deadline: day(10) }, o);
const coach = u => S.coach({ F, fs: db(u) }, u);
const stu = dbx => S.student({ F, fs: dbx });
const ans = (o = {}) => Object.assign({ ev1: '男子100m', ev2: '男子走幅跳', relay: 'ok', rel: '男子4×100mR', cm: 'よろしくお願いします', at: serverTimestamp() }, o);
const rawAns = async (dbx, sid, rid, o) => { const s = await adminGet('surveys/' + sid); return setDoc(doc(dbx, 'surveys', sid, 'answers', rid), Object.assign(ans(), { expireAt: s.expireAt, d1: 'RAWDEV0000000001', dv: 'RAWDEV0000000001' }, o)); };   // v0.29.7（R296-01）答えには端末の印が要る
const cool = async (sid, rid) => adminUpd('surveys/' + sid + '/answers/' + rid, { at: Timestamp.fromMillis(Date.now() - 60000) });
// ルールを通さずに作る（いろいろな形を試すため）
const rawCreate = (u, sid, pub, adm) => { const b = writeBatch(db(u)); if (pub) b.set(doc(db(u), 'surveys', sid), pub); if (adm) b.set(doc(db(u), 'surveyAdmins', sid), adm); return b.commit(); };
const docsFor = (u, o) => { const D = S.buildDocs(OPT(o)), p = D.pub, ex = Timestamp.fromMillis(p.expireMs);
  return [{ v: 1, meet: p.meet, sexes: p.sexes, roster: p.roster, n: p.n, evs: p.evs, rels: p.rels, open: true, deadline: Timestamp.fromMillis(p.deadlineMs), expireAt: ex, updatedAt: serverTimestamp() },
    { ownerUid: u, team: D.admin.team, meet: p.meet, akeys: D.admin.akeys, createdAt: serverTimestamp(), expireAt: ex }]; };
const ID = c => (c.repeat(24)).slice(0, 24);
try {
  await env.clearFirestore();
  await adminSet('teams/' + T, { v: 1, name: '架空中学陸上部', ownerUid: 'alice', createdAt: Timestamp.now() });
  await adminSet('teams/' + T2, { v: 1, name: '架空高校陸上部', ownerUid: 'carol', createdAt: Timestamp.now() });
  for (const [u, t, r] of [['alice', T, 'coach'], ['dave', T, 'coach'], ['bob', T, 'manager'], ['carol', T2, 'coach']]) await adminSet('teams/' + t + '/members/' + u, r === 'manager' ? { role: r, name: '架空', expiresAt: Timestamp.fromMillis(Date.now() + 864e7) } : { role: r, name: '架空' });
  let SID, TSID;
  await test('作る：Google ログインの顧問が、調査（公開）と管理の文書（非公開）を1回で作れる。公開の文書に uid・チーム・選手のキーは無い', async () => {
    SID = await coach('alice').create(OPT()); if (!S.validId(SID)) throw new Error('id');
    const p = await adminGet('surveys/' + SID), a = await adminGet('surveyAdmins/' + SID);
    if (Object.keys(p).sort().join() !== 'deadline,evs,expireAt,kind,meet,n,open,relayAsk,rels,roster,sexes,updatedAt,v') throw new Error(Object.keys(p).join());
    if (JSON.stringify(p).match(/alice|k1|ownerUid|team/)) throw new Error('公開の文書に持ち主・キー');
    if (a.ownerUid !== 'alice' || a.akeys.join() !== 'k1,k2,k3') throw new Error('admin');
  });
  await test('作る：ログインなし・匿名ログイン・管理の文書なし・ほかの人を持ち主にする、は不可', async () => {
    const [p, a] = docsFor('alice');
    await assertFails(rawCreate('alice', ID('a'), p, null));
    await assertFails(rawCreate('alice', ID('b'), null, a));
    await assertFails(rawCreate('alice', ID('c'), p, Object.assign({}, a, { ownerUid: 'zed' })));
    const b = writeBatch(anonDb); b.set(doc(anonDb, 'surveys', ID('d')), p); b.set(doc(anonDb, 'surveyAdmins', ID('d')), a); await assertFails(b.commit());
    const c = writeBatch(anonAuthDb); c.set(doc(anonAuthDb, 'surveys', ID('e')), p); c.set(doc(anonAuthDb, 'surveyAdmins', ID('e')), Object.assign({}, a, { ownerUid: 'anonx' })); await assertFails(c.commit());
    await assertSucceeds(rawCreate('alice', ID('f'), p, a));
  });
  await test('作る：IDは24文字だけ（20文字・記号は不可）・同じIDで作り直し・乗っ取りは不可', async () => {
    const [p, a] = docsFor('alice'); await assertFails(rawCreate('alice', 'A'.repeat(20), p, a)); await assertFails(rawCreate('alice', 'A'.repeat(23) + '-', p, a));
    const [p2, a2] = docsFor('carol'); await assertFails(rawCreate('carol', SID, p2, a2)); await assertFails(rawCreate('carol', ID('f'), null, a2));
    await assertFails(setDoc(doc(db('carol'), 'surveyAdmins', SID), a2));
  });
  await test('作る：項目は決まったものだけ・名簿0人・種目0・名簿151人・締切が過去／121日後・expireAt が締切より前／60日より後・n が名簿の数とちがう、は不可', async () => {
    const [p, a] = docsFor('alice'); let i = 0; const bad = async (pp, aa = a) => assertFails(rawCreate('alice', ID('g') .slice(0, 22) + 'x' + (i++), pp, aa));
    await bad(Object.assign({}, p, { ownerUid: 'alice' })); await bad(Object.assign({}, p, { records: ['12.40'] }));
    await bad(Object.assign({}, p, { roster: [], n: 0 }), Object.assign({}, a, { akeys: [] }));
    await bad(Object.assign({}, p, { evs: [] }));
    const big = Array.from({ length: 151 }, (_, k) => ({ n: '架空' + k, g: '1', s: 'm' })); await bad(Object.assign({}, p, { roster: big, n: 151 }), Object.assign({}, a, { akeys: big.map((_, k) => 'k' + k) }));
    await bad(Object.assign({}, p, { n: 2 }));
    await bad(Object.assign({}, p, { deadline: Timestamp.fromMillis(Date.now() - 10 * 60 * 1000), expireAt: Timestamp.fromMillis(Date.now() + 864e5) }), Object.assign({}, a, { expireAt: Timestamp.fromMillis(Date.now() + 864e5) }));
    const far = Date.now() + 121 * 864e5; await bad(Object.assign({}, p, { deadline: Timestamp.fromMillis(far), expireAt: Timestamp.fromMillis(far) }), Object.assign({}, a, { expireAt: Timestamp.fromMillis(far) }));
    const ex1 = Timestamp.fromMillis(p.deadline.toMillis() - 1000); await bad(Object.assign({}, p, { expireAt: ex1 }), Object.assign({}, a, { expireAt: ex1 }));
    const ex2 = Timestamp.fromMillis(p.deadline.toMillis() + 61 * 864e5); await bad(Object.assign({}, p, { expireAt: ex2 }), Object.assign({}, a, { expireAt: ex2 }));
    await bad(Object.assign({}, p, { meet: 'x'.repeat(81) })); await bad(Object.assign({}, p, { sexes: 'x' })); await bad(Object.assign({}, p, { open: 'yes' }));
    await bad(p, Object.assign({}, a, { akeys: ['k1'] })); await bad(p, Object.assign({}, a, { extra: 1 }));
  });
  await test('チーム：チームの顧問はチームに付けて作れる。マネージャー・ほかのチームの顧問は不可', async () => {
    TSID = await coach('alice').create(OPT({ team: T, meet: '架空 新人戦' }));
    await assertFails(coach('bob').create(OPT({ team: T }))); await assertFails(coach('carol').create(OPT({ team: T })));
    await assertSucceeds(coach('bob').create(OPT({ team: '' })));
  });
  await test('読む（公開）：ログインなしでも受付中の調査は get できる。一覧は誰も不可。管理の文書はログインなし・ほかの人は読めない', async () => {
    const s = await stu(anonDb).load(SID); if (!s || s.roster.length !== 3 || s.evs.length !== 3) throw new Error('load');
    await assertSucceeds(getDoc(doc(anonDb, 'surveys', SID)));
    await assertFails(getDocs(collection(anonDb, 'surveys'))); await assertFails(getDocs(collection(db('alice'), 'surveys')));
    await assertFails(getDoc(doc(anonDb, 'surveyAdmins', SID))); await assertFails(getDoc(doc(db('carol'), 'surveyAdmins', SID)));
    await assertFails(getDocs(collection(anonDb, 'surveyAdmins'))); await assertFails(getDocs(query(collection(db('carol'), 'surveyAdmins'), where('ownerUid', '==', 'alice'))));
    await assertFails(getDocs(query(collection(db('carol'), 'surveyAdmins'), where('team', '==', T))));
    await assertFails(getDocs(query(collection(db('bob'), 'surveyAdmins'), where('team', '==', T))));
    await assertSucceeds(getDocs(query(collection(db('alice'), 'surveyAdmins'), where('ownerUid', '==', 'alice'))));
    await assertSucceeds(getDocs(query(collection(db('dave'), 'surveyAdmins'), where('team', '==', T))));
    const l = await coach('dave').list(T); if (!l.some(x => x.id === TSID) || l.some(x => x.id === SID)) throw new Error('list ' + JSON.stringify(l));
  });
  await test('答える：ログインなしで名簿の番号に送れる（送り直すと置きかわる・5秒に1回）', async () => {
    const s = await stu(anonDb).load(SID);
    await assertSucceeds(stu(anonDb).send(s, 0, { ev1: '男子100m', ev2: '男子走幅跳', relay: 'ok', rel: '男子4×100mR', cm: 'よろしく' }));
    await assertFails(stu(anonDb).send(s, 0, { ev1: '男子走幅跳', relay: 'no' }));   // 5秒以内
    await cool(SID, 'r0'); await assertSucceeds(stu(anonDb).send(s, 0, { ev1: '男子走幅跳', relay: 'no' }));
    const v = await adminGet('surveys/' + SID + '/answers/r0'); if (v.ev1 !== '男子走幅跳' || v.ev2 !== '' || v.relay !== 'no' || v.rel !== '' || v.cm !== '') throw new Error(JSON.stringify(v));
    await assertSucceeds(stu(anonAuthDb).send(s, 2, { ev1: '女子100m', relay: '' }));
  });
  await test('答える：番号の外（r3・r999・x0・r-1）・項目の追加・種目の外・第2＝第1・第1なしの第2・ひとこと101文字・リレーの値・時刻・expireAt のちがい・空の答え、は不可', async () => {
    const bad = (rid, o) => assertFails(rawAns(anonDb, SID, rid, o));
    for (const rid of ['r3', 'r999', 'x0', 'r-1', 'r01x']) await bad(rid, {});
    await bad('r1', { name: '架空 二郎' }); await bad('r1', { mark: '12.40' });
    await bad('r1', { ev1: '男子200m' }); await bad('r1', { ev2: '男子100m' }); await bad('r1', { ev1: '', ev2: '男子100m' });
    await bad('r1', { cm: 'あ'.repeat(101) }); await bad('r1', { cm: 5 });
    await bad('r1', { relay: 'maybe' }); await bad('r1', { relay: 'no', rel: '男子4×100mR' }); await bad('r1', { rel: '男子4×400mR' });
    await bad('r1', { at: Timestamp.now() }); await bad('r1', { expireAt: Timestamp.fromMillis(Date.now() + 864e5) });
    await bad('r1', { ev1: '', ev2: '', relay: '', rel: '', cm: '' });
    await assertSucceeds(rawAns(anonDb, SID, 'r1', { cm: 'あ'.repeat(100) }));
  });
  await test('v0.28.2 出場しない（join:false）：希望・リレーが空なら、ひとこと（理由）だけでも空でも送れる。join:false で種目やリレーがある・join が真偽でない・join:true で空、は不可', async () => {
    const bad = o => assertFails(rawAns(anonDb, SID, 'r1', o));
    await cool(SID, 'r1');
    await bad({ join: false, ev1: '男子100m' }); await bad({ join: false, relay: 'ok' }); await bad({ join: false, relay: 'no' }); await bad({ join: 'no' }); await bad({ join: 1 });
    await bad({ join: true, ev1: '', ev2: '', relay: '', rel: '', cm: '' });
    await assertSucceeds(rawAns(anonDb, SID, 'r1', { join: false, ev1: '', ev2: '', relay: '', rel: '', cm: '' }));
    await cool(SID, 'r1'); await assertSucceeds(rawAns(anonDb, SID, 'r1', { join: false, ev1: '', ev2: '', relay: '', rel: '', cm: '部活の大会と重なる' }));
    await cool(SID, 'r1'); await assertSucceeds(rawAns(anonDb, SID, 'r1', { join: true, ev1: '男子100m' }));
    const s = await stu(anonDb).load(SID); await cool(SID, 'r1');
    await assertSucceeds(stu(anonDb).send(s, 1, { join: false, ev1: '男子100m', relay: 'ok', cm: '理由' }));   // アプリは希望とリレーを空にして送る
    const v = await adminGet('surveys/' + SID + '/answers/r1'); if (v.join !== false || v.ev1 !== '' || v.relay !== '' || v.cm !== '理由') throw new Error(JSON.stringify(v));
    const a = await coach('alice').answers(SID); if (a[1].join !== false || a[0].join !== true) throw new Error('join の読み（古い答えは出場する）' + JSON.stringify(a));
  });
  await test('v0.28.2 調査の種類（kind：official/kiroku）・リレーを聞く（relayAsk）：ほかの値は不可。relayAsk:false の調査にはリレーの答えを送れない（古い調査＝聞く）', async () => {
    const [p, a] = docsFor('alice');
    await assertFails(rawCreate('alice', ID('k').slice(0, 23) + '1', Object.assign({}, p, { kind: 'other' }), a));
    await assertFails(rawCreate('alice', ID('k').slice(0, 23) + '2', Object.assign({}, p, { relayAsk: 'no' }), a));
    const sid = ID('k'); await assertSucceeds(rawCreate('alice', sid, Object.assign({}, p, { kind: 'kiroku', relayAsk: false }), a));
    await assertFails(rawAns(anonDb, sid, 'r0', { ev1: '男子100m', relay: 'ok' })); await assertFails(rawAns(anonDb, sid, 'r0', { ev1: '男子100m', relay: 'no' }));
    await assertSucceeds(rawAns(anonDb, sid, 'r0', { ev1: '男子100m', ev2: '', relay: '', rel: '' }));
    const s = await stu(anonDb).load(sid); if (s.kind !== 'kiroku' || s.rels.length) throw new Error(JSON.stringify([s.kind, s.rels]));
  });
  await test('答えを読む：ログインなし・匿名・ほかの顧問・チームのマネージャーは get も一覧も不可。持ち主は読める', async () => {
    for (const d of [anonDb, anonAuthDb, db('carol'), db('bob'), db('dave')]) { await assertFails(getDoc(doc(d, 'surveys', SID, 'answers', 'r0'))); await assertFails(getDocs(collection(d, 'surveys', SID, 'answers'))); }
    const a = await coach('alice').answers(SID); if (Object.keys(a).sort().join() !== '0,1,2') throw new Error(JSON.stringify(a));
  });
  await test('チームの調査：チームの顧問（作った人でなくても）は読める・止める・消せる。マネージャー・ほかのチームは不可', async () => {
    const s = await stu(anonDb).load(TSID); await assertSucceeds(stu(anonDb).send(s, 1, { ev1: '男子100m', relay: 'ok' }));
    await assertSucceeds(getDocs(collection(db('dave'), 'surveys', TSID, 'answers')));
    await assertFails(getDocs(collection(db('bob'), 'surveys', TSID, 'answers'))); await assertFails(getDocs(collection(db('carol'), 'surveys', TSID, 'answers')));
    await assertFails(coach('bob').setOpen(TSID, false)); await assertFails(coach('carol').setOpen(TSID, false));
    await assertSucceeds(coach('dave').setOpen(TSID, false)); await assertSucceeds(coach('dave').setOpen(TSID, true));
    await assertFails(coach('carol').remove(TSID)); await assertFails(deleteDoc(doc(db('bob'), 'surveys', TSID)));
  });
  await test('止める：止めると、ログインなしは読めない・送れない。持ち主は読める。再開すると戻る', async () => {
    await coach('alice').setOpen(SID, false);
    if (await stu(anonDb).load(SID) !== null) throw new Error('止めたのに読めた');
    await assertFails(getDoc(doc(anonDb, 'surveys', SID))); await cool(SID, 'r0'); await assertFails(rawAns(anonDb, SID, 'r0', {}));
    await assertSucceeds(getDoc(doc(db('alice'), 'surveys', SID)));
    await coach('alice').setOpen(SID, true); const o0 = await adminGet('surveys/' + SID + '/answers/r0'); const k0 = o0 && o0.d1 ? { d1: o0.d1, dv: o0.d1 } : {}; await assertSucceeds(rawAns(anonDb, SID, 'r0', k0));
    if (k0.d1) { await cool(SID, 'r0'); await assertFails(rawAns(anonDb, SID, 'r0', {})); } // v0.29.4 最初の端末の印（d1）は消せない
  });
  await test('v0.29.4 端末の印：作るときは d1==dv（16文字）。上書きで dv は変えられる・d1 は変えられない', async () => {
    const A = 'Aa'.repeat(8), B = 'Bb'.repeat(8), C = 'Cc'.repeat(8); const [p, a] = docsFor('alice'); const SID = ID('d'); await rawCreate('alice', SID, p, a);
    await assertFails(rawAns(anonDb, SID, 'r0', { d1: A, dv: B })); await assertFails(rawAns(anonDb, SID, 'r0', { d1: 'short', dv: 'short' }));
    await assertSucceeds(rawAns(anonDb, SID, 'r0', { d1: A, dv: A })); await cool(SID, 'r0');
    await assertSucceeds(rawAns(anonDb, SID, 'r0', { d1: A, dv: B })); await cool(SID, 'r0');
    await assertFails(rawAns(anonDb, SID, 'r0', { d1: C, dv: C }));
  });
  await test('締切：締切を過ぎると、ログインなしは読めない・送れない（新しく・送り直し）', async () => {
    const [p, a] = docsFor('alice'); const sid = ID('h'); await rawCreate('alice', sid, p, a);
    await assertSucceeds(rawAns(anonDb, sid, 'r0', {}));
    const past = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000); await adminUpd('surveys/' + sid, { deadline: past }); await cool(sid, 'r0');
    await assertFails(getDoc(doc(anonDb, 'surveys', sid))); await assertFails(rawAns(anonDb, sid, 'r0', {})); await assertFails(rawAns(anonDb, sid, 'r1', {}));
    await assertSucceeds(getDocs(collection(db('alice'), 'surveys', sid, 'answers')));
  });
  await test('直す：締切の延長は持ち主だけ（expireAt を管理の文書と同じにする）。名簿・種目・大会名・持ち主は変えられない。締切を過去にできない。ログインなし・ほかの人は不可', async () => {
    await assertSucceeds(coach('alice').setDeadline(SID, day(20)));
    const p = await adminGet('surveys/' + SID), a = await adminGet('surveyAdmins/' + SID); if (p.expireAt.toMillis() !== a.expireAt.toMillis()) throw new Error('expireAt');
    await assertFails(coach('carol').setDeadline(SID, day(30)));
    await assertFails(updateDoc(doc(db('alice'), 'surveys', SID), { expireAt: Timestamp.fromMillis(p.expireAt.toMillis() + 864e5), updatedAt: serverTimestamp() }));   // 管理の文書の expireAt と合わない
    await assertFails(updateDoc(doc(db('alice'), 'surveyAdmins', SID), { expireAt: Timestamp.fromMillis(p.expireAt.toMillis() + 864e5) }));   // 調査の expireAt と合わない
    for (const o of [{ roster: [{ n: 'x', g: '1', s: 'm' }, { n: 'y', g: '1', s: 'm' }, { n: 'z', g: '1', s: 'm' }] }, { evs: ['男子1500m'] }, { meet: '別の大会' }, { rels: [] }, { v: 2 }])
      await assertFails(updateDoc(doc(db('alice'), 'surveys', SID), Object.assign({ updatedAt: serverTimestamp() }, o)));
    await assertFails(updateDoc(doc(db('alice'), 'surveyAdmins', SID), { ownerUid: 'carol' })); await assertFails(updateDoc(doc(db('alice'), 'surveyAdmins', SID), { akeys: ['a', 'b', 'c'] }));
    await assertFails(updateDoc(doc(anonDb, 'surveys', SID), { open: false, updatedAt: serverTimestamp() }));
    const pt = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000), b = writeBatch(db('alice')); b.update(doc(db('alice'), 'surveys', SID), { deadline: pt, expireAt: pt, updatedAt: serverTimestamp() }); b.update(doc(db('alice'), 'surveyAdmins', SID), { expireAt: pt }); await assertFails(b.commit());
  });
  await test('消す：ほかの人・ログインなしは不可。管理の文書だけ先に消すのは不可。持ち主が消すと回答も全部消え、そのあとは送れない', async () => {
    await assertFails(deleteDoc(doc(anonDb, 'surveys', SID))); await assertFails(deleteDoc(doc(db('carol'), 'surveys', SID)));
    await assertFails(deleteDoc(doc(anonDb, 'surveys', SID, 'answers', 'r0'))); await assertFails(deleteDoc(doc(db('alice'), 'surveyAdmins', SID)));
    await assertSucceeds(coach('alice').remove(SID));
    if (await adminGet('surveys/' + SID) || await adminGet('surveyAdmins/' + SID) || await adminGet('surveys/' + SID + '/answers/r0') || await adminGet('surveys/' + SID + '/answers/r1')) throw new Error('残っている');
    const st = await env.withSecurityRulesDisabled(async c => (await getDocs(collection(c.firestore(), 'surveys', SID, 'answers'))).size); if (st) throw new Error('回答が残る ' + st);
    await assertFails(setDoc(doc(anonDb, 'surveys', SID, 'answers', 'r0'), { ev1: '男子100m', ev2: '', relay: '', rel: '', cm: '', at: serverTimestamp(), expireAt: Timestamp.now() }));
    await assertSucceeds(coach('dave').remove(TSID));
  });
} finally { await env.cleanup(); }
console.log(`\nrules_survey_check: ${passed} passed, ${failed} failed`); if (failed) process.exit(1);
