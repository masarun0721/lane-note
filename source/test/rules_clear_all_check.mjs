// v0.26.35.1 「記録を全部消す」をエミュレーターで確かめる（架空のデータだけ・本番にはつながない）。1000件をこえる記録で
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {initializeTestEnvironment, assertFails} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
const {doc, collection, setDoc, getDocs, writeBatch, deleteDoc, setLogLevel} = F;
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
const LaneTeam = createRequire(import.meta.url)('../src/team.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok', name); } catch (e) { failed++; console.log('  NG', name, e && e.message); } }
const claims = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const db = u => env.authenticatedContext(u, claims).firestore();
const T = (u, name) => LaneTeam.make({ F, fs: db(u), uid: u, name: name || '架空の' + u });
const N = 1200;
const rec = i => ({ id: 'r' + i, date: '2026-05-' + String(1 + i % 28).padStart(2, '0'), meet: '架空記録会' + (i % 7), event: '男子100m', name: '架空 選手' + (i % 50), team: '架空中', mark: String(11 + (i % 90) / 100), round: '予選' });
async function adminCount(p, live) { let n = 0; await env.withSecurityRulesDisabled(async c => { (await getDocs(collection(c.firestore(), p))).forEach(x => { if (!live || !x.data()._del) n++; }); }); return n; }
try {
  await env.clearFirestore();
  const alice = T('alice', '架空顧問'); const t = await alice.createTeam('架空中学陸上部');
  const codes = await alice.codes(t); await T('bob', '架空マネ').join(codes.manager.code);
  // 架空の記録 1200件（ルールを外して入れる＝前から入っていたチームの記録の形）
  await env.withSecurityRulesDisabled(async c => { const f = c.firestore(); for (let i = 0; i < N; i += 400) { const b = writeBatch(f); for (let j = i; j < Math.min(N, i + 400); j++) b.set(doc(f, 'teams', t, 'records', 'r' + j), Object.assign(rec(j), { _by: 'alice', _at: new Date(), _st: 'ok', _h: 'x' })); await b.commit(); } });
  // 形の正しくない文書もまぜる
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'teams', t, 'records', 'broken1'), { id: 5, junk: 'x'.repeat(10) }); });
  await test('準備：' + (N + 1) + '件ある', async () => { const n = await adminCount('teams/' + t + '/records', true); if (n !== N + 1) throw new Error(n); });
  await test('チームの記録の文書そのものは消せない（ルールどおり。だから削除の印で消す）', async () => { await assertFails(deleteDoc(doc(db('alice'), 'teams', t, 'records', 'r1'))); });
  let prog = [];
  await test('顧問が全部消す：' + (N + 1) + '件が8件ずつ消え、進み具合が N/全部 で出る', async () => {
    const r = await T('alice', '架空顧問').delAll(t, 'coach', (d, n) => prog.push([d, n]));
    if (r.total !== N + 1 || r.left !== 0 || r.written !== N + 1) throw new Error(JSON.stringify(r));
    const last = prog[prog.length - 1]; if (prog[0][0] !== 0 || last[0] !== N + 1 || last[1] !== N + 1) throw new Error(JSON.stringify([prog[0], last]));
    if (prog.length < 100) throw new Error('進み具合の回数が少ない ' + prog.length);
    for (let i = 1; i < prog.length; i++) if (prog[i][0] < prog[i - 1][0]) throw new Error('戻った');
  });
  await test('読み直しても空（getRecords は 0件）', async () => { const n = (await T('alice').getRecords(t)).length; if (n) throw new Error(n); });
  await test('変更履歴に削除が残る（戻せる）', async () => { const h = await T('alice').history(t, 5); if (!h.length || !h.every(x => x.act === 'del')) throw new Error(JSON.stringify(h.map(x => x.act))); });
  await test('2回目は何もしない（0件・エラーなし）', async () => { const r = await T('alice').delAll(t, 'coach'); if (r.total !== 0 || r.left !== 0) throw new Error(JSON.stringify(r)); });
  await test('外された人が押す → 権限エラー（黙って終わらない）', async () => {
    await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'teams', t, 'records', 'r9999'), Object.assign(rec(9999), { _by: 'alice', _at: new Date(), _st: 'ok', _h: 'y' })); });
    await alice.remove(t, 'bob');
    let e = null; try { await T('bob').delAll(t, 'manager'); } catch (x) { e = x; } if (!e || !/permission/.test(e.code || e.message)) throw new Error(e ? e.code : '通った');
    if (await adminCount('teams/' + t + '/records', true) !== 1) throw new Error('消えてしまった');
  });
  // 個人のクラウド（users/{uid}/records）：アプリと同じ 400件ずつのまとめ削除
  await test('個人のクラウド ' + N + '件を400件ずつ消す → 読み直して0件', async () => {
    await env.withSecurityRulesDisabled(async c => { const f = c.firestore(); for (let i = 0; i < N; i += 400) { const b = writeBatch(f); for (let j = i; j < Math.min(N, i + 400); j++) b.set(doc(f, 'users', 'carol', 'records', 'r' + j), rec(j)); await b.commit(); } });
    const f = db('carol'), ids = (await getDocs(collection(f, 'users', 'carol', 'records'))).docs.map(d => d.id); if (ids.length !== N) throw new Error(ids.length);
    for (let i = 0; i < ids.length; i += 400) { const b = writeBatch(f); ids.slice(i, i + 400).forEach(id => b.delete(doc(f, 'users', 'carol', 'records', id))); await b.commit(); }
    if ((await getDocs(collection(f, 'users', 'carol', 'records'))).size) throw new Error('残った');
  });
} finally { await env.cleanup(); }
console.log(passed + ' passed, ' + failed + ' failed'); if (failed) process.exit(1);
