// v0.26.9 安全面のルール（機能の一時停止・参加コードの期限/回数/承認）をエミュレーターで確かめる（架空のデータだけ・本番にはつながない）
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
const tid = () => LaneTeam.newSecret().replace(/[^A-Za-z0-9]/g, '').slice(0, 20).padEnd(20, 'A');
const share = uid => ({ data: '1.abc', ownerUid: uid, createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 864e5) });
const talk = uid => ({ v: 2, ownerUid: uid, name: '架空選手', note: '', noteAt: serverTimestamp(), active: true, closed: false, n: 0, lastAt: serverTimestamp(), createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 864e5) });
try {
  await env.clearFirestore();
  await adminSet('admins/root', { note: 'コンソールで作った管理者（架空）' });
  console.log('[FLAGS] 機能の一時停止');
  await test('だれでも（ログインなしでも）config/flags を読める', async () => { await adminSet('config/flags', { talk: true, relay: true, counter: true, share: true, at: Timestamp.now(), by: 'root' }); await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/flags'))); });
  await test('管理者でない人は config/flags を書けない', () => assertFails(setDoc(doc(db('alice'), 'config/flags'), flags({ talk: false }, 'alice'))));
  await test('自分を管理者にはできない（admins はコンソールだけ）・他人の admins は読めない', async () => { await assertFails(setDoc(doc(db('alice'), 'admins/alice'), { x: 1 })); await assertFails(getDoc(doc(db('alice'), 'admins/root'))); await assertSucceeds(getDoc(doc(db('root'), 'admins/root'))); });
  await test('管理者は正しい形で書ける・余計な項目や型ちがいは拒否', async () => { await assertSucceeds(setDoc(doc(db('root'), 'config/flags'), flags({}, 'root'))); await assertFails(setDoc(doc(db('root'), 'config/flags'), flags({ evil: 1 }, 'root'))); await assertFails(setDoc(doc(db('root'), 'config/flags'), flags({ talk: 'no' }, 'root'))); await assertFails(setDoc(doc(db('root'), 'config/flags'), flags({}, 'alice'))); });
  await test('config のほかの文書・一覧・削除は不可', async () => { await assertFails(setDoc(doc(db('root'), 'config/other'), flags({}, 'root'))); await assertFails(getDocs(collection(db('root'), 'config'))); await assertFails(deleteDoc(doc(db('root'), 'config/flags'))); });
  await test('share=false：短いリンクを新しく作れない（true に戻すと作れる）', async () => {
    await setDoc(doc(db('root'), 'config/flags'), flags({ share: false }, 'root'));
    await assertFails(setDoc(doc(db('alice'), 'shares/Abcdefghij'), share('alice')));
    await setDoc(doc(db('root'), 'config/flags'), flags({}, 'root'));
    await assertSucceeds(setDoc(doc(db('alice'), 'shares/Abcdefghij'), share('alice')));
  });
  await test('talk=false：新しいやり取りを作れない・選手は読めない（記録は読める）', async () => {
    const id = 'TalkTalkTalkTalk0001';
    await adminSet('users/alice/settings/talk', { enabled: true });
    await assertSucceeds(setDoc(doc(db('alice'), 'talks', id), talk('alice')));
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'talks', id)));
    await setDoc(doc(db('root'), 'config/flags'), flags({ talk: false }, 'root'));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'talks', id)));
    await assertFails(setDoc(doc(db('alice'), 'talks', 'TalkTalkTalkTalk0002'), talk('alice')));
    const b = writeBatch(env.unauthenticatedContext().firestore()); const pf = env.unauthenticatedContext().firestore();
    const b2 = writeBatch(pf); b2.set(doc(pf, 'talks', id, 'msgs', 'm1'), { from: 'p', body: 'こんにちは', createdAt: serverTimestamp(), purgeAt: (await adminGet('talks/' + id)).expiresAt }); b2.update(doc(pf, 'talks', id), { n: 1, lastAt: serverTimestamp() });
    await assertFails(b2.commit());
    await assertSucceeds(getDoc(doc(db('alice'), 'talks', id)));   // 顧問本人は見られる（止めたことの確認用）
    await adminSet('users/alice/records/r1', { id: 'r1' }); await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/records/r1')));
    await setDoc(doc(db('root'), 'config/flags'), flags({}, 'root'));
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'talks', id)));
  });
  await test('counter=false：利用カウンターを増やせない（true で増やせる・読むのはいつでも可）', async () => {
    const an = env.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(an, 'stats/counter'), { n: 1, at: serverTimestamp() }));
    await setDoc(doc(db('root'), 'config/flags'), flags({ counter: false }, 'root'));
    await new Promise(r => setTimeout(r, 2100));
    await assertFails(updateDoc(doc(an, 'stats/counter'), { n: increment(1), at: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(an, 'stats/counter')));
    await setDoc(doc(db('root'), 'config/flags'), flags({}, 'root'));
    await assertSucceeds(updateDoc(doc(an, 'stats/counter'), { n: increment(1), at: serverTimestamp() }));
  });
  console.log('[CODE] 参加コードの期限・回数・承認');
  const alice = T('alice', '架空顧問A'); let t;
  await test('顧問がチームを作り、制限つきのコードを作れる（期限・回数・承認）', async () => {
    t = await alice.createTeam('架空高校陸上部');
    await alice.regen(t, 'manager', LaneTeam.schoolYearEnd(), { max: 1, exp: Date.now() + 7 * 864e5 });
    const c = (await alice.codes(t)).manager; if (c.max !== 1 || c.used !== 0 || !c.exp) throw new Error(JSON.stringify(c));
  });
  await test('コードの形：回数は1〜100・used は0から・期限は400日以内・余計な項目は拒否', async () => {
    const f = db('alice'), base = { role: 'coach', createdAt: serverTimestamp(), by: 'alice' }, id = () => LaneTeam.newSecret();
    await assertFails(setDoc(doc(f, 'teams', t, 'codes', id()), Object.assign({}, base, { max: 0, used: 0 })));
    await assertFails(setDoc(doc(f, 'teams', t, 'codes', id()), Object.assign({}, base, { max: 5, used: 3 })));
    await assertFails(setDoc(doc(f, 'teams', t, 'codes', id()), Object.assign({}, base, { max: 101, used: 0 })));
    await assertFails(setDoc(doc(f, 'teams', t, 'codes', id()), Object.assign({}, base, { exp: Timestamp.fromMillis(Date.now() + 500 * 864e5) })));
    await assertFails(setDoc(doc(f, 'teams', t, 'codes', id()), Object.assign({}, base, { exp: Timestamp.fromMillis(Date.now() - 864e5) })));
    await assertFails(setDoc(doc(f, 'teams', t, 'codes', id()), Object.assign({}, base, { used: 0 })));
    await assertFails(setDoc(doc(f, 'teams', t, 'codes', id()), Object.assign({}, base, { approve: 'yes' })));
  });
  await test('回数1のコード：1人目は入れて used が1になる', async () => { const code = (await alice.codes(t)).manager.code; const r = await T('bob', '架空マネB').join(code); if (r.role !== 'manager') throw new Error(JSON.stringify(r)); const c = (await alice.codes(t)).manager; if (c.used !== 1) throw new Error('used ' + c.used); });
  await test('回数1のコード：2人目は入れない（使い切り）', async () => { const code = (await alice.codes(t)).manager.code; let e; try { await T('carl').join(code); } catch (x) { e = x; } if (!e || e.code !== 'bad-code') throw new Error(e ? e.code : '入れてしまった'); });
  await test('入る人は used を勝手に変えられない（2増やす・max を変える・入らずに増やす）', async () => {
    const sec = (await alice.codes(t)).manager.id;
    await adminSet('teams/' + t + '/codes/' + sec, Object.assign(await adminGet('teams/' + t + '/codes/' + sec), { max: 5 }));
    const f = db('dina'); await setDoc(doc(f, 'joinTries/dina'), { n: 1, lastAt: serverTimestamp(), team: t, code: sec });
    await assertFails(updateDoc(doc(f, 'teams', t, 'codes', sec), { used: increment(2) }));
    await assertFails(updateDoc(doc(f, 'teams', t, 'codes', sec), { max: 50 }));
    await assertFails(updateDoc(doc(f, 'teams', t, 'codes', sec), { used: increment(1) }));
  });
  await test('回数つきのコードで、used を増やさずに入ることはできない', async () => {
    const c = (await alice.codes(t)).manager, f = db('dina');
    await assertFails(setDoc(doc(f, 'teams', t, 'members', 'dina'), { role: 'manager', name: 'x', joinedAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(c.mexp) }));
  });
  await test('期限切れのコードでは入れない', async () => {
    const sec = LaneTeam.newSecret(); await adminSet('teams/' + t + '/codes/' + sec, { role: 'coach', createdAt: Timestamp.now(), by: 'alice', exp: Timestamp.fromMillis(Date.now() - 1000) });
    let e; try { await T('ed').join(t + '-' + sec); } catch (x) { e = x; } if (!e || e.code !== 'bad-code') throw new Error(e ? e.code : '入れてしまった');
  });
  let ac;
  await test('承認が要るコードで入ると「承認待ち」：チーム・記録・メンバー一覧は読めない（自分の文書だけ読める）', async () => {
    ac = await alice.regen(t, 'coach', null, { approve: true });
    const r = await T('fay', '架空顧問F').join(ac); if (r.role !== 'pending' || r.want !== 'coach') throw new Error(JSON.stringify(r));
    const f = db('fay'); await assertFails(getDoc(doc(f, 'teams', t))); await assertFails(getDocs(collection(f, 'teams', t, 'records'))); await assertFails(getDocs(collection(f, 'teams', t, 'members')));
    await assertSucceeds(getDoc(doc(f, 'teams', t, 'members', 'fay'))); if (await T('fay').myStatus(t) !== 'pending') throw new Error('status');
  });
  await test('承認待ちの人は自分で役割を変えられない・コードの役割と違う役割を名乗れない', async () => {
    await assertFails(updateDoc(doc(db('fay'), 'teams', t, 'members', 'fay'), { role: 'coach' }));
    const sec = LaneTeam.parseCode(ac).secret, f = db('gus');
    await setDoc(doc(f, 'joinTries/gus'), { n: 1, lastAt: serverTimestamp(), team: t, code: sec });
    await assertFails(setDoc(doc(f, 'teams', t, 'members', 'gus'), { role: 'coach', name: 'x', joinedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(f, 'teams', t, 'members', 'gus'), { role: 'pending', want: 'manager', name: 'x', joinedAt: serverTimestamp() }));
  });
  await test('マネージャーは承認できない・顧問が承認すると読めるようになる', async () => {
    const m = (await alice.members(t)).filter(x => x.uid === 'fay')[0]; if (!m || m.role !== 'pending') throw new Error(JSON.stringify(m));
    await assertFails(updateDoc(doc(db('bob'), 'teams', t, 'members', 'fay'), { role: 'coach', want: F.deleteField() }));
    await alice.approve(t, 'fay', m); await assertSucceeds(getDoc(doc(db('fay'), 'teams', t)));
    const v = await adminGet('teams/' + t + '/members/fay'); if (v.role !== 'coach' || 'want' in v) throw new Error(JSON.stringify(v));
  });
  await test('承認待ちを、ほかの役割にして承認することはできない（want と同じ役割だけ）', async () => {
    await new Promise(r => setTimeout(r, 100)); const r = await T('hal').join(ac); if (r.role !== 'pending') throw new Error('not pending');
    await assertFails(updateDoc(doc(db('alice'), 'teams', t, 'members', 'hal'), { role: 'manager', want: F.deleteField(), expiresAt: Timestamp.fromMillis(Date.now() + 864e5) }));
  });
  await test('顧問は承認待ちを断れる（外した印なしで消せる）・マネージャーは断れない', async () => { await assertFails(deleteDoc(doc(db('bob'), 'teams', t, 'members', 'hal'))); await alice.reject(t, 'hal'); if (await adminGet('teams/' + t + '/members/hal')) throw new Error('残っている'); });
  await test('ふつうのコード（制限なし）も今までどおり入れる', async () => { const c = await alice.regen(t, 'manager', LaneTeam.schoolYearEnd()); const r = await T('ivy').join(c); if (r.role !== 'manager') throw new Error(JSON.stringify(r)); });
  console.log('[ROSTER] v0.26.11 選手台帳のID（aid）・リレーの走順（legs）');
  const rec = (id, o) => Object.assign({ id, name: '架空 一郎', event: '男子100m', mark: '11.52', meet: '架空記録会', date: '2026-09-13', team: '架空高' }, o || {});
  await test('チームの記録に正しい aid・legs をつけて書ける（変更履歴つき）', async () => { const r = await alice.put(t, 'coach', [rec('r-aid-1', { aid: 'AbcdEFGH234' }), rec('r-relay-1', { event: '男子4×100mR', name: '架空高', mark: '43.21', legs: '1走 架空一郎／2走 見本太郎／3走 空想健／4走 架空次郎' })], 'add', { strict: true }); if (r.written !== 2) throw new Error(JSON.stringify(r)); });
  await test('形のちがう aid（短い・記号）や長すぎる legs は拒否', async () => {
    const f = db('alice'), bad = async (o0) => { const o = Object.assign({}, o0); const okc = o.ok; delete o.ok; const id = 'r-bad-' + Math.random().toString(36).slice(2, 8); const h = LaneTeam.newSecret().replace(/[^A-Za-z0-9]/g, '').slice(0, 20).padEnd(20, 'B'); const d = Object.assign(rec(id), o, { _by: 'alice', _at: serverTimestamp(), _st: 'ok', _h: h }); const b = writeBatch(f); b.set(doc(f, 'teams', t, 'records', id), d); b.set(doc(f, 'teams', t, 'hist', h), { rid: id, uid: 'alice', name: '架空顧問A', at: serverTimestamp(), act: 'add', before: null, after: d }); if (okc) { await assertSucceeds(b.commit()); } else await assertFails(b.commit()); };
    await bad({ ok: 1, aid: 'AbcdEFGH235' });   // 対照：正しい形なら同じ書き方で通る
    await bad({ aid: 'A123' }); await bad({ aid: 'A12345678/0' }); await bad({ aid: 5 }); await bad({ legs: 'x'.repeat(301) });
  });
  await test('選手台帳（settings/roster）は顧問だけが書ける・マネージャーは読むだけ', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'teams', t, 'settings', 'roster'), { list: [{ aid: 'AbcdEFGH234', name: '架空 一郎' }], updatedAt: '2026-10-13' }));
    await assertSucceeds(getDoc(doc(db('ivy'), 'teams', t, 'settings', 'roster')));
    await assertFails(setDoc(doc(db('ivy'), 'teams', t, 'settings', 'roster'), { list: [] }));
  });
} finally { await env.cleanup(); }
console.log(passed + ' passed, ' + failed + ' failed'); if (failed) process.exit(1);
