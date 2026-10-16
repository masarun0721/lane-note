// v0.26.40 Astra 第5回 段階2 C511：中の id と文書IDが違う古い記録でも「全部消す」「消す」が通る（エミュレーターだけ・架空データ・本番にはつながない）
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
const {doc, collection, getDocs, getDoc, writeBatch, setLogLevel} = F;
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
const LaneTeam = createRequire(import.meta.url)('../src/team.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok', name); } catch (e) { failed++; console.log('  NG', name, e && e.message); } }
const claims = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
const db = u => env.authenticatedContext(u, claims).firestore();
const T = (u, name) => LaneTeam.make({ F, fs: db(u), uid: u, name: name || '架空の' + u });
const rec = id => ({ id, date: '2026-05-10', meet: '架空記録会', event: '男子100m', name: '架空 選手', team: '架空中', mark: '12.34', round: '予選', _by: 'alice', _at: new Date(), _st: 'ok', _h: 'h' + id });
const raw = async p => { let v = null; await env.withSecurityRulesDisabled(async c => { const s = await getDoc(doc(c.firestore(), p)); v = s.exists() ? s.data() : null; }); return v; };
async function seed(t, list) { await env.withSecurityRulesDisabled(async c => { const f = c.firestore(), b = writeBatch(f); for (const [rid, id] of list) b.set(doc(f, 'teams', t, 'records', rid), rec(id)); await b.commit(); }); }
console.log('[v0.26.40] C511 削除の印は実際の文書IDから');
try {
  await env.clearFirestore();
  const alice = T('alice', '架空顧問'); const t = await alice.createTeam('架空中学陸上部');
  const born = await alice.codes(t); const mcode = await alice.regen(t, 'manager', born.manager.mexp);   // v0.26.63 はじめのコードは承認あり。マネージャーとしての削除は承認なしのコードで入る
  await T('bob', '架空マネ').join(mcode);
  // 古いデータ：文書ID legacy の中の id が different（Astra の再現）。ふつうの記録もまぜる
  await seed(t, [['legacy', 'different'], ['ok1', 'ok1'], ['legacy2', 'other2']]);
  await test('顧問の「全部消す」：中の id が違う記録があっても止まらず、全部に削除の印（left 0）', async () => {
    const r = await T('alice', '架空顧問').delAll(t, 'coach');
    if (r.total !== 3 || r.left !== 0 || r.written !== 3) throw new Error(JSON.stringify(r));
  });
  await test('削除の印は文書ID legacy 自身につく（id も legacy）・別のID different の文書は作らない', async () => {
    const v = await raw('teams/' + t + '/records/legacy'); if (!v || v._del !== true || v.id !== 'legacy') throw new Error(JSON.stringify(v));
    if (await raw('teams/' + t + '/records/different')) throw new Error('different が作られた');
  });
  await test('元の中身は変更履歴の before に残る（戻せる）', async () => {
    let ok = false; await env.withSecurityRulesDisabled(async c => { (await getDocs(collection(c.firestore(), 'teams', t, 'hist'))).forEach(x => { const h = x.data(); if (h.rid === 'legacy' && h.before && h.before.id === 'different') ok = true; }); });
    if (!ok) throw new Error('before が無い');
  });
  await seed(t, [['legacy3', 'other3']]);
  await test('マネージャーの「消す」（1件）：中の id が違っても通る（マネージャーの削除は仕様どおり）', async () => {
    await T('bob', '架空マネ').del(t, 'manager', ['legacy3']);
    const v = await raw('teams/' + t + '/records/legacy3'); if (!v || v._del !== true || v.id !== 'legacy3') throw new Error(JSON.stringify(v));
    if (await raw('teams/' + t + '/records/other3')) throw new Error('other3 が作られた');
  });
} finally { await env.cleanup(); }
console.log('rules_astra5_stage2_check: ' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
