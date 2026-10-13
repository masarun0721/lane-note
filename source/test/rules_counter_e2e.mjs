// v0.26.19 利用カウンターの端から端まで：記録のページの useCounter() を、本物の Firebase SDK とローカルのエミュレーター（いまの firestore.rules）で動かす
//   新しい端末で文書を作る → 別の端末で1増える → 前の版の「数えた」印（v1）が残っていても数える → 今日数えた端末は書かずに数だけ出す
//   リポジトリ直下で：npx -y firebase-tools@14.12.0 emulators:exec --only firestore --project demo-lane-note --config firebase.json "node source/test/rules_counter_e2e.mjs"
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {initializeApp, deleteApp} from 'firebase/app';
import * as F from 'firebase/firestore';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
F.setLogLevel('silent');
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0; async function test(n, fn) { try { await fn(); passed++; console.log('  ok', n); } catch (e) { failed++; console.log('  NG', n, e && e.message); } }
const env = await initializeTestEnvironment({ projectId: 'demo-lane-note', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(path.join(here, '../../firestore.rules'), 'utf8') } });
await env.clearFirestore();
// jsdom の中で作ったオブジェクトは Node 側から「ふつうのオブジェクト」に見えない（SDK が invalid-argument にする）。中身だけ Node 側に写して渡す（テストの都合のみ）
const FN = { ...F, setDoc: (r, d) => F.setDoc(r, { ...d }), updateDoc: (r, d) => F.updateDoc(r, { ...d }) };
let appN = 0; const apps = [];
async function device(ls) {
  const app = initializeApp({ projectId: 'demo-lane-note', apiKey: 'demo' }, 'dev' + (appN++)); apps.push(app);
  const db = F.getFirestore(app); F.connectFirestoreEmulator(db, '127.0.0.1', 8089);
  const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
  const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: process.env.DBG ? new VirtualConsole().sendTo(console) : new VirtualConsole() }); await delay();
  const w = d.window; Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory(); w.confirm = () => true; w.scrollTo = () => {};
  for (const [k, v] of Object.entries(ls || {})) w.localStorage.setItem(k, v);
  w.LANE_FIREBASE_CONFIG = { apiKey: 'demo-key', projectId: 'demo-lane-note' }; w.__FB = { A: {}, F: FN, auth: {}, fs: db };
  for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js']) w.eval(src(s));
  let js = src('records_app.js').replace("var FB_VER = '10.14.1', FB = null,", "var FB_VER = '10.14.1', FB = window.__FB,");
  const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }'; if (!js.includes(tail) || !js.includes('FB = window.__FB')) throw new Error('差しかえ失敗');
  js = js.replace("window.addEventListener('load', function () { setTimeout(useCounter, 1200); });", '');
  if (process.env.DBG) js = js.replace('} catch (e) { el.hidden = true; }', '} catch (e) { console.log("DBG", e && (e.code || e.message)); el.hidden = true; }'); w.eval(js.replace(tail, 'window.__t={useCounter:useCounter,dbg:function(){return [!!$("useCount"),CLOUD_READY,!!FB];}};'));
  return w;
}
const nNow = async () => { let v; await env.withSecurityRulesDisabled(async c => { const s = await F.getDoc(F.doc(c.firestore(), 'stats/counter')); v = s.exists() ? s.data().n : null; }); return v; };
const shown = w => { const e = w.document.getElementById('useCount'); return e.hidden ? null : [...e.querySelectorAll('.uc-d')].map(x => x.textContent).join(''); };
const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
console.log('[COUNTER] 利用カウンター（エミュレーター）');
try {
  await test('新しい端末：文書がなければ作り（n=1）、数を出す・「今日数えた」印（v2）が付く', async () => { const w = await device(); if (process.env.DBG) console.log('DBG0', w.__t.dbg()); await w.__t.useCounter(); if (await nNow() !== 1) throw new Error('n=' + await nNow()); if (shown(w) !== '1') throw new Error('表示 ' + shown(w)); if (w.localStorage.getItem('lanenote.count.v2') !== today) throw new Error('印がない'); });
  await new Promise(r => setTimeout(r, 2100));   // ルール：全体で2秒に1回まで
  await test('前の版の印（v1＝今日）が残っている端末でも数える・古い印は消える', async () => { const w = await device({ 'lanenote.count.v1': today }); await w.__t.useCounter(); if (await nNow() !== 2) throw new Error('n=' + await nNow()); if (shown(w) !== '2') throw new Error('表示 ' + shown(w)); if (w.localStorage.getItem('lanenote.count.v1') !== null) throw new Error('v1 が残った'); });
  await test('今日もう数えた端末：書かずに、今の数だけ出す', async () => { const w = await device({ 'lanenote.count.v2': today }); await w.__t.useCounter(); if (await nNow() !== 2) throw new Error('増えた'); if (shown(w) !== '2') throw new Error('表示 ' + shown(w)); });
  await test('2秒以内にほかの端末とぶつかって断られたら、印を付けない（次に開いたとき数え直す）・数は出す', async () => { const w = await device(); await w.__t.useCounter(); if (await nNow() !== 2) throw new Error('n=' + await nNow()); if (w.localStorage.getItem('lanenote.count.v2') !== null) throw new Error('断られたのに印'); if (shown(w) !== '2') throw new Error('表示 ' + shown(w)); });
  await new Promise(r => setTimeout(r, 2100));
  await test('管理者が counter=false にしていると数えず・出さない（文書があっても）', async () => { await env.withSecurityRulesDisabled(c => F.setDoc(F.doc(c.firestore(), 'config/flags'), { talk: true, relay: true, counter: false, share: true, at: F.Timestamp.now(), by: 'root' })); const w = await device(); await w.__t.useCounter(); if (await nNow() !== 2) throw new Error('増えた'); if (shown(w) !== null) throw new Error('出ている'); });
} finally { for (const a of apps) await deleteApp(a).catch(() => {}); await env.cleanup(); }
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
