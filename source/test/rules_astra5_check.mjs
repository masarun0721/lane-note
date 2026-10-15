// v0.26.39 第5回外部監査（C501・C502・C508 の一部・C512）の再現例を「拒否または安全な結果」を期待する回帰テストにしたもの
// pubMeets（みんなの要項）と pubResults（みんなの結果）の両方で確かめる。架空データだけ・ローカルのエミュレーターだけ（本番には接続しない）
import fs from 'node:fs'; import {createRequire} from 'node:module';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
const {doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, limit, writeBatch, serverTimestamp, Timestamp, setLogLevel} = F;
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
const LanePub = createRequire(import.meta.url)('../src/pubmeets.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok', name); } catch (e) { failed++; console.log('  NG', name, e && e.message); } }
const G = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const DBS = {}, db = u => DBS[u] || (DBS[u] = env.authenticatedContext(u, G).firestore());
const adminSet = (p, v) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), p), v));
let GOT; const adminGet = async p => { await env.withSecurityRulesDisabled(async c => { const s = await getDoc(doc(c.firestore(), p)); GOT = s.exists() ? s.data() : null; }); return GOT; };
const TA = 'ATEAMAAAAAAAAAAAAAAA', TB = 'BTEAMAAAAAAAAAAAAAAA';
const day = () => Math.floor(Date.now() / 864e5);
const cool = (u, team, n = 1) => adminSet('pubQuota/' + u, { team, at: Timestamp.fromMillis(Date.now() - 60000), day: day(), n, tgt: 'pubMeets/2000-01-01_00000000', op: 'create' });
const fresh = u => env.withSecurityRulesDisabled(c => F.deleteDoc(doc(c.firestore(), 'pubQuota', u)));
const PL = { date: '2026-11-08', end: '2026-11-08', meet: '架空市 秋季陸上競技大会', venue: '架空競技場' };
const plan = name => Object.assign({}, PL, { meet: name });
const body = (COL, p, by, url) => Object.assign(COL === 'pubResults' ? LanePub.entryRes(p, url) : LanePub.entry(p, url, {}), { by, at: serverTimestamp(), exp: Timestamp.fromMillis(LanePub.exp(p)), ver: 1, rep: 0, hid: false });
const qd = (team, tgt, op, n = 1) => Object.assign({ team, at: serverTimestamp(), day: day(), n }, tgt === undefined ? {} : { tgt }, op === undefined ? {} : { op });
try {
  await env.clearFirestore();
  await adminSet('teams/' + TA, { v: 1, name: '架空A中', ownerUid: 'ua', createdAt: Timestamp.now() });
  await adminSet('teams/' + TB, { v: 1, name: '架空B中（Bが自分で作ったチーム）', ownerUid: 'ub', createdAt: Timestamp.now() });
  await adminSet('teams/' + TA + '/members/ua', { role: 'coach', name: '架空 顧問A', at: Timestamp.now() });
  await adminSet('teams/' + TB + '/members/ub', { role: 'coach', name: '架空 顧問B', at: Timestamp.now() });
  for (const COL of ['pubMeets', 'pubResults']) {
    console.log('[' + COL + ']');
    const api = u => LanePub.make({ F, fs: db(u), uid: u, col: COL }), U = COL === 'pubResults' ? 'https://kaku.example/kekka.pdf' : 'https://kaku.example/yoko.pdf';
    await test(COL + ' C501：quota 1回（n=1）＋新規25件の一括書き込みは拒否（1件も作られない）', async () => {
      await fresh('ub'); const b = writeBatch(db('ub')); const p0 = plan('架空大会0');
      b.set(doc(db('ub'), 'pubQuota', 'ub'), qd(TB, COL + '/' + LanePub.docId(p0.date, p0.meet), 'create'));
      for (let i = 0; i < 25; i++) { const p = plan('架空大会' + i); b.set(doc(db('ub'), COL, LanePub.docId(p.date, p.meet)), body(COL, p, 'ub', U)); }
      await assertFails(b.commit());
      for (let i = 0; i < 25; i++) { const p = plan('架空大会' + i); if (await adminGet(COL + '/' + LanePub.docId(p.date, p.meet))) throw new Error('作られた ' + i); }
    });
    await test(COL + ' C501：quota 1回＋2件は拒否、1件だけの正規の登録は通る', async () => {
      await fresh('ub'); const p1 = plan('架空二件1'), p2 = plan('架空二件2'), id1 = LanePub.docId(p1.date, p1.meet);
      const b = writeBatch(db('ub')); b.set(doc(db('ub'), 'pubQuota', 'ub'), qd(TB, COL + '/' + id1, 'create'));
      b.set(doc(db('ub'), COL, id1), body(COL, p1, 'ub', U)); b.set(doc(db('ub'), COL, LanePub.docId(p2.date, p2.meet)), body(COL, p2, 'ub', U)); await assertFails(b.commit());
      await assertSucceeds(api('ub').publish(p1, U, {}, TB));
      const q = await adminGet('pubQuota/ub'); if (q.tgt !== COL + '/' + id1 || q.op !== 'create' || q.n !== 1) throw new Error(JSON.stringify(q));
    });
    await test(COL + ' C501：別の対象・別の操作・別のコレクション・tgt なしの quota は使えない', async () => {
      const p3 = plan('架空別対象'), id3 = LanePub.docId(p3.date, p3.meet), other = LanePub.docId(p3.date, '架空ほか');
      const OTHER = COL === 'pubMeets' ? 'pubResults' : 'pubMeets';
      for (const [tgt, op] of [[COL + '/' + other, 'create'], [COL + '/' + id3, 'report'], [COL + '/' + id3, 'update'], [OTHER + '/' + id3, 'create'], [undefined, undefined], [COL + '/' + id3, undefined], [COL + '/' + id3, 'delete']]) {
        await cool('ub', TB); const b = writeBatch(db('ub')); b.set(doc(db('ub'), 'pubQuota', 'ub'), qd(TB, tgt, op, 2)); b.set(doc(db('ub'), COL, id3), body(COL, p3, 'ub', U));
        await assertFails(b.commit());
      }
      await cool('ub', TB); const ok = writeBatch(db('ub')); ok.set(doc(db('ub'), 'pubQuota', 'ub'), qd(TB, COL + '/' + id3, 'create', 2)); ok.set(doc(db('ub'), COL, id3), body(COL, p3, 'ub', U)); await assertSucceeds(ok.commit());
    });
    await test(COL + ' C501：報告用の quota で、別の登録の報告や新規登録を一緒に書けない', async () => {
      const pa = plan('架空報告A'), pb = plan('架空報告B'), ida = LanePub.docId(pa.date, pa.meet), idb = LanePub.docId(pb.date, pb.meet);
      await cool('ua', TA); await assertSucceeds(api('ua').publish(pa, U, {}, TA)); await cool('ua', TA); await assertSucceeds(api('ua').publish(pb, U, {}, TA));
      await cool('ub', TB); const b = writeBatch(db('ub')); b.set(doc(db('ub'), 'pubQuota', 'ub'), qd(TB, COL + '/' + ida, 'report', 2));
      b.set(doc(db('ub'), COL, ida, 'reports', 'ub'), { at: serverTimestamp() }); b.update(doc(db('ub'), COL, ida), { rep: 1, hid: false });
      b.set(doc(db('ub'), COL, idb, 'reports', 'ub'), { at: serverTimestamp() }); b.update(doc(db('ub'), COL, idb), { rep: 1, hid: false }); await assertFails(b.commit());
      await cool('ub', TB); const e = (await api('ub').search(pa)).find(x => x.id === ida); await assertSucceeds(api('ub').report(e, TB));
      if ((await adminGet(COL + '/' + idb)).rep !== 0) throw new Error('B に報告が入った');
    });
    await test(COL + ' C502：A が登録 → B の削除は拒否 → B の差し替えは拒否 → A の原本・削除権限はそのまま（B の削除は拒否・A の削除は通る）', async () => {
      const p = plan('架空乗っ取り'), id = LanePub.docId(p.date, p.meet);
      await cool('ua', TA); await assertSucceeds(api('ua').publish(p, U, {}, TA));
      await assertFails(deleteDoc(doc(db('ub'), COL, id)));
      await cool('ub', TB); const b = writeBatch(db('ub')); b.set(doc(db('ub'), 'pubQuota', 'ub'), qd(TB, COL + '/' + id, 'update', 2));
      b.update(doc(db('ub'), COL, id), Object.assign({ url: 'https://evil.example/x.pdf', host: 'evil.example', at: serverTimestamp(), ver: 2, by: 'ub' }, COL === 'pubMeets' ? { info: '{}' } : { kind: 'pdf' })); await assertFails(b.commit());
      await cool('ub', TB); const c = writeBatch(db('ub')); c.set(doc(db('ub'), 'pubQuota', 'ub'), qd(TB, COL + '/' + id, 'update', 2));
      c.update(doc(db('ub'), COL, id), { url: 'https://evil.example/x.pdf', host: 'evil.example', at: serverTimestamp(), ver: 2 }); await assertFails(c.commit());
      await cool('ub', TB); const old = (await api('ub').search(p)).find(x => x.id === id); let code = ''; try { await api('ub').publish(p, 'https://evil.example/x.pdf', {}, TB, old); } catch (x) { code = x.code; } if (code !== 'notmine') throw new Error('アプリが止めない ' + code);
      const v = await adminGet(COL + '/' + id); if (v.by !== 'ua' || v.url !== U || v.ver !== 1) throw new Error(JSON.stringify(v));
      await assertFails(deleteDoc(doc(db('ub'), COL, id))); await assertSucceeds(deleteDoc(doc(db('ua'), COL, id)));
    });
    await test(COL + ' C502：登録した本人の差し替えでも by（作成者）は変えられない', async () => {
      const p = plan('架空本人差し替え'), id = LanePub.docId(p.date, p.meet); await cool('ua', TA); await assertSucceeds(api('ua').publish(p, U, {}, TA));
      await cool('ua', TA); const b = writeBatch(db('ua')); b.set(doc(db('ua'), 'pubQuota', 'ua'), qd(TA, COL + '/' + id, 'update', 2)); b.update(doc(db('ua'), COL, id), { url: 'https://kaku.example/v2.pdf', host: 'kaku.example', at: serverTimestamp(), ver: 2, by: 'ub' }); await assertFails(b.commit());
      await cool('ua', TA); const old = (await api('ua').search(p)).find(x => x.id === id); await assertSucceeds(api('ua').publish(p, 'https://kaku.example/v2.pdf', {}, TA, old));
      const v = await adminGet(COL + '/' + id); if (v.by !== 'ua' || v.ver !== 2) throw new Error(JSON.stringify(v));
    });
    await test(COL + ' C512：読めるのは Google でログインした人だけ（匿名・メールとパスワード・ログインなしは get も list も不可）', async () => {
      const p = plan('架空本人差し替え'), id = LanePub.docId(p.date, p.meet), qq = d => query(collection(d, COL), where('date', '==', p.date), where('hid', '==', false), where('exp', '>', Timestamp.fromMillis(Date.now() + 36e5)), limit(20));
      await assertSucceeds(getDoc(doc(db('ub'), COL, id))); await assertSucceeds(getDocs(qq(db('ub'))));
      for (const d of [env.authenticatedContext('anon1', { firebase: { sign_in_provider: 'anonymous' } }).firestore(), env.authenticatedContext('pw1', { firebase: { sign_in_provider: 'password' }, email_verified: true }).firestore(), env.unauthenticatedContext().firestore()]) {
        await assertFails(getDoc(doc(d, COL, id))); await assertFails(getDocs(qq(d)));
      }
    });
    await test(COL + ' C508：期限（exp）が過ぎた登録は get できず、一覧は exp の条件なしでは不可・条件つきでは出ない。期限切れの片づけはできる', async () => {
      const p = plan('架空期限切れ' + COL), id = LanePub.docId(p.date, p.meet);
      await adminSet(COL + '/' + id, Object.assign(body(COL, p, 'ua', U), { at: Timestamp.fromMillis(Date.now() - 2 * 864e5), exp: Timestamp.fromMillis(Date.now() - 864e5) }));
      const v0 = await adminGet(COL + '/' + id); if (!(v0.exp.toMillis() < Date.now())) throw new Error('準備 ' + JSON.stringify(v0));
      try { const z = await F.getDocFromServer(doc(db('ub'), COL, id)); throw new Error('get ub 読めた exp=' + z.data().exp.toMillis() + ' now=' + Date.now() + ' hid=' + z.data().hid + ' by=' + z.data().by); } catch (e) { if (/読めた/.test(e.message)) throw e; } await assertFails(getDoc(doc(db('ua'), COL, id))).catch(e => { throw new Error('get ua ' + e.message); });
      await assertFails(getDocs(query(collection(db('ub'), COL), where('date', '==', p.date), where('hid', '==', false), limit(20)))).catch(e => { throw new Error('list no exp ' + e.message); });
      await assertFails(getDocs(query(collection(db('ub'), COL), where('date', '==', p.date), where('hid', '==', false), where('exp', '>', Timestamp.fromMillis(Date.now() - 864e5)), limit(20)))).catch(e => { throw new Error('list past ' + e.message); });
      const r = await api('ub').search(p); if (r.some(x => x.id === id)) throw new Error('期限切れが候補に出た');
      if ((await api('ub').get(p)) !== null) throw new Error('期限切れが get で出た');
      await assertSucceeds(deleteDoc(doc(db('ub'), COL, id)));
    });
  }
} finally { await env.cleanup(); }
console.log(`rules_astra5_check: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
