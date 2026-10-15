// v0.26.41 Astra 第5回 段階3（C508 個人のPDFのかけら・users の広いルール、C510 key での検索）をエミュレーターで確かめる（架空データだけ・本番には接続しない）
import fs from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, collection, query, where, limit, Timestamp, setLogLevel} from 'firebase/firestore';
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok', name); } catch (e) { failed++; console.log('  NG', name, e && e.message); } }
const claims = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const db = u => env.authenticatedContext(u, claims).firestore();
const nowPlus = d => Timestamp.fromMillis(Date.now() + d * 864e5);
const adminSet = (p, v) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), p), v));
const adminGet = async p => { let v = null; await env.withSecurityRulesDisabled(async c => { const s = await getDoc(doc(c.firestore(), p)); v = s.exists() ? s.data() : null; }); return v; };
const K = '2026-10-24|架空新人大会', V = 'abcd1234';
const chunk = (u, o = {}) => Object.assign({ kind: 'yoko', v: V, i: 0, n: 1, sha: '', data: 'JVBERi0xLjQK', name: '架空要項.pdf', size: 1000, exp: nowPlus(40), by: u }, o);
const P = (u, c = 'yoko_abcd1234_0', owner = u) => doc(db(u), 'users', owner, 'meets', K, 'pdf', c);
console.log('[v0.26.41] C508 個人のPDFのかけら・users のルール／C510 key 検索');
try {
  await env.clearFirestore();
  // ---- C508：個人のPDFのかけら（Astra の再現：前は本人なら何でも書けた） ----
  await test('本人：正しい形のかけらは保存・読める', async () => { await assertSucceeds(setDoc(P('alice'), chunk('alice'))); await assertSucceeds(getDoc(P('alice'))); });
  await test('再現：本人でも、形の合わないかけら（余分な項目・巨大なデータ・IDと中身のずれ）は書けない', async () => {
    await assertFails(setDoc(P('alice', 'yoko_abcd1234_1'), chunk('alice')));
    await assertFails(setDoc(P('alice', 'yoko_abcd1234_0'), Object.assign(chunk('alice'), { athletes: ['架空 選手'] })));
    await assertFails(setDoc(P('alice', 'note_abcd1234_0'), chunk('alice', { kind: 'note', data: 'A'.repeat(900001) })));
    await assertFails(setDoc(P('alice', 'note_abcd1234_0'), chunk('alice', { kind: 'note', size: 5242881 })));
    await assertFails(setDoc(P('alice', 'note_abcd1234_0'), chunk('alice', { kind: 'note', n: 11 })));
    await assertFails(setDoc(P('alice', 'whatever'), { anything: 'x'.repeat(1000) }));
  });
  await test('再現：期限（exp）なし・数字の exp・過去・430日より先は書けない（exp は Timestamp）', async () => {
    const c = chunk('alice', { kind: 'tt' }); delete c.exp;
    await assertFails(setDoc(P('alice', 'tt_abcd1234_0'), c));
    await assertFails(setDoc(P('alice', 'tt_abcd1234_0'), chunk('alice', { kind: 'tt', exp: Date.now() + 864e5 })));
    await assertFails(setDoc(P('alice', 'tt_abcd1234_0'), chunk('alice', { kind: 'tt', exp: nowPlus(-1) })));
    await assertFails(setDoc(P('alice', 'tt_abcd1234_0'), chunk('alice', { kind: 'tt', exp: nowPlus(431) })));
  });
  await test('by は本人の uid だけ・古い形（種類_番号）の新規作成は不可', async () => {
    await assertFails(setDoc(P('alice', 'sl_abcd1234_0'), chunk('bob', { kind: 'sl' })));
    await assertFails(setDoc(P('alice', 'sl_0'), chunk('alice', { kind: 'sl' })));
  });
  await test('書いたかけらは書き換えられない（update 不可）', async () => {
    await assertFails(setDoc(P('alice'), chunk('alice', { name: '別.pdf' })));
    await assertFails(updateDoc(P('alice'), { name: '別.pdf' }));
  });
  await test('再現：期限が過ぎたかけらは本人でも読めない・消すのはできる', async () => {
    await adminSet('users/alice/meets/' + K + '/pdf/note_zzzz9999_0', chunk('alice', { kind: 'note', v: 'zzzz9999', exp: nowPlus(-2) }));
    await assertFails(getDoc(P('alice', 'note_zzzz9999_0')));
    await assertSucceeds(deleteDoc(P('alice', 'note_zzzz9999_0')));
  });
  await test('古い形（種類_番号）は読める（期限内）・消せる', async () => {
    await adminSet('users/alice/meets/' + K + '/pdf/sl_0', { kind: 'sl', i: 0, n: 1, data: 'JVBE', name: '架空.pdf', size: 3, exp: nowPlus(5), by: 'alice' });
    await assertSucceeds(getDoc(P('alice', 'sl_0'))); await assertSucceeds(deleteDoc(P('alice', 'sl_0')));
  });
  await test('ほかの人・ログインなしは、読めない・書けない・消せない', async () => {
    await assertFails(getDoc(P('bob', 'yoko_abcd1234_0', 'alice'))); await assertFails(setDoc(P('bob', 'tt_abcd1234_0', 'alice'), chunk('bob', { kind: 'tt' })));
    await assertFails(deleteDoc(P('bob', 'yoko_abcd1234_0', 'alice')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users', 'alice', 'meets', K, 'pdf', 'yoko_abcd1234_0')));
  });
  await test('一覧は本人でも不可', () => assertFails(getDocs(collection(db('alice'), 'users', 'alice', 'meets', K, 'pdf'))));
  await test('pdf は meets の下だけ（records/x/pdf などは不可）', async () => {
    await assertFails(setDoc(doc(db('alice'), 'users', 'alice', 'records', 'r1', 'pdf', 'yoko_abcd1234_0'), chunk('alice')));
  });
  // ---- 広いルールが狭いルールを上書きしない ----
  await test('users の1段（records・meets・settings・shareIndex・talkIndex・teams）は今までどおり本人だけ読み書き', async () => {
    for (const [c, id, v] of [['records', 'r1', { id: 'r1', mark: '12.34' }], ['meets', K, { plan: true, prep: { docs: { yoko: { n: 1, v: V, exp: Date.now() + 864e5 } } } }], ['settings', 'divOverrides', { a: 1 }], ['shareIndex', 'AAAAAAAAAA', { at: 1 }], ['talkIndex', 't1', { at: 1 }], ['teams', 'T1', { role: 'coach' }]]) {
      await assertSucceeds(setDoc(doc(db('alice'), 'users', 'alice', c, id), v)); await assertSucceeds(getDoc(doc(db('alice'), 'users', 'alice', c, id)));
      await assertFails(getDoc(doc(db('bob'), 'users', 'alice', c, id))); await assertFails(setDoc(doc(db('bob'), 'users', 'alice', c, id), v));
    }
    await assertSucceeds(getDocs(collection(db('alice'), 'users', 'alice', 'records'))); await assertSucceeds(deleteDoc(doc(db('alice'), 'users', 'alice', 'records', 'r1')));
  });
  await test('再現：ほかの深い場所（users/本人/meets/k/other/x・records/r/sub/x）には書けない', async () => {
    await assertFails(setDoc(doc(db('alice'), 'users', 'alice', 'meets', K, 'other', 'x'), { a: 1 }));
    await assertFails(setDoc(doc(db('alice'), 'users', 'alice', 'records', 'r1', 'sub', 'x'), { a: 1 }));
  });
  // ---- C510：key（そろえた大会名）での一覧（隠れていない・期限内の条件つき）はルールで通る ----
  await adminSet('pubMeets/2026-10-24_0000aaaa', { name: '架空新人大会', key: '架空新人大会', date: '2026-10-24', end: '2026-10-25', venue: '', url: 'https://www.jaaf.or.jp/kaku/y.pdf', host: 'www.jaaf.or.jp', info: '{}', at: Timestamp.now(), by: 'carol', exp: nowPlus(30), ver: 1, rep: 0, hid: false });
  await test('C510：key＋hid==false＋exp>今 の一覧（20件ずつ）は Google ログインで読める・21件以上や条件なしの key 一覧は不可', async () => {
    const s = await assertSucceeds(getDocs(query(collection(db('alice'), 'pubMeets'), where('key', '==', '架空新人大会'), where('hid', '==', false), where('exp', '>', nowPlus(1 / 24)), limit(20))));
    if (s.size !== 1) throw new Error('件数 ' + s.size);
    await assertFails(getDocs(query(collection(db('alice'), 'pubMeets'), where('key', '==', '架空新人大会'), where('hid', '==', false), where('exp', '>', nowPlus(1 / 24)), limit(21))));   // 1回は20件まで（続きはページ送り）
    await assertFails(getDocs(query(collection(db('alice'), 'pubMeets'), where('key', '==', '架空新人大会'), limit(20))));
  });
  await test('C510：pubResults も同じ', async () => {
    await assertSucceeds(getDocs(query(collection(db('alice'), 'pubResults'), where('key', '==', '架空新人大会'), where('hid', '==', false), where('exp', '>', nowPlus(1 / 24)), limit(20))));
  });
} finally { await env.cleanup(); }
console.log('rules_astra5_stage3_check: ' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
