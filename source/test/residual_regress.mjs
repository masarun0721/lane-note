// v0.15：Astra 再監査（2026-10-11）の residual_check.mjs R01〜R08 を「起きないこと」の期待値に反転した回帰テスト。
//   node residual_regress.mjs
// 実際のソース（../src）をそのまま読み込み、入口（input の change・ボタンの click・関数の入口）から保存・表示までを確かめる。
// 模擬するのは Firebase（通信先）とファイルの読み込み待ちだけで、テスト対象のコードは置き換えない。
// R08 だけは実際の Firebase SDK 10.14.1 を使い、ネットワークを disableNetwork で止める（接続先は demo 用 127.0.0.1。本番にはつながない）。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {initializeApp, deleteApp} from 'firebase/app';
import * as FS from 'firebase/firestore';
FS.setLogLevel('silent');
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let pass = 0, fail = 0;
const delay = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function check(name, fn) { try { await fn(); pass++; console.log('  ok', name); } catch (e) { fail++; console.log('  NG', name, '\n    ', e && e.stack || e); } }
const doms = [];
async function makeDom(file, url, before) {
  const html = src(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
  const d = new JSDOM(html, { url, runScripts: 'outside-only' }); doms.push(d); await delay();
  const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob });
  w.fetch = () => Promise.reject(new Error('network prohibited in tests'));
  w.indexedDB = new IDBFactory();
  if (before) before(w);
  return w;
}
function fakeFirebase({ read = async () => [], commit = async () => {}, getDoc = async () => ({ exists: () => false }) } = {}) {
  const auth = { currentUser: null, authStateReady: async () => {} };
  return { fs: {}, auth, A: { signOut: async () => { auth.currentUser = null; } },
    F: { collection: (_, ...parts) => parts.join('/'), doc: (...a) => typeof a[0] === 'string' ? a.join('/') : a.slice(1).join('/'),
      getDocs: async p => { const rows = await read(p); return { metadata: { fromCache: false }, forEach: f => rows.forEach((r, i) => f({ id: r.id || String(i), data: () => r })) }; },
      getDoc, setDoc: async (p, d) => commit([{ op: 'set', path: p, data: d }]),
      writeBatch: () => { const ops = []; return { set: (p, d) => ops.push({ op: 'set', path: p, data: d }), delete: p => ops.push({ op: 'delete', path: p }), commit: () => commit(ops) }; } } };
}
async function recordHarness() {
  const w = await makeDom('records_template.html', 'http://127.0.0.1:9090/records.html');
  w.eval(src('auth_common.js')); w.eval(src('results.js'));
  let js = src('records_app.js'); const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
  assert(js.includes(tail));
  js = js.replace(tail, `window.__t={getAll,lgetAll,ltx,reload,putMany,onAuth,scope,handleFiles,
    setFB(f){FB=f;},setReady(v){CLOUD_READY=v;},all(){return ALL;},batches(){return batches;},user(){return USER;}};renderAuth();`);
  w.eval(js);
  return w;
}
const rec = (id = 'r1', extra = {}) => ({ id, name: '架空 一郎', team: '架空高', event: '男子100m', mark: '12.00', wind: '+0.0', date: '2026-10-10', meet: '架空大会', grade: '1', ...extra });
const text = (w, id) => w.document.getElementById(id).textContent;
async function meetHarness(url, before) {
  const w = await makeDom('template.html', url || 'http://127.0.0.1:9090/index.html', before);
  w.eval(src('parser.js')); w.eval(src('logic.js')); w.eval(src('player.js')); w.eval(src('personal.js')); w.eval(src('auth_common.js'));
  // 模擬 Firebase を差し込む口だけを足す（読み込み部分の import の代わり。テスト対象の処理は変えない）
  let app = src('app.js').replace('if (FB) return FB;', 'if (window.__fakeFB && !FB) { FB = window.__fakeFB; if (FB.A.onAuthStateChanged) FB.A.onAuthStateChanged(FB.auth, onShareAuth); } if (FB) return FB;');
  const end = 'window.__meetApp = {'; assert(app.includes(end));
  app = app.replace(end, 'window.__t={openViewerStr,fetchShare,makeShortUrl,renderMyShares,shareSignOut,saveViewing,renderSaved,openSaved,onShareAuth};\n  ' + end);
  w.eval(app); w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay(); return w;
}
async function waitUntil(fn, n = 100) { for (let i = 0; i < n; i++) { if (await fn()) return; await delay(10); } throw new Error('timeout'); }
// ファイル選択の input に、読み込みが gate まで終わらないファイルを入れて change を起こす
function pickDelayed(w, id, file) { const el = w.document.getElementById(id); Object.defineProperty(el, 'files', { value: [file], configurable: true }); el.dispatchEvent(new w.Event('change')); }

try {
console.log('[A01] 読み込み途中にアカウントが変わっても、前の人の資料を保存・表示しない');
for (const seqName of ['Alice→Bob', 'Alice→未ログイン', 'Alice→Bob→Alice']) await check('R01 反転：JSON読み込み中の ' + seqName + ' で、どこにも保存されない', async () => {
  const w = await recordHarness(), t = w.__t, writes = []; t.setReady(true); t.setFB(fakeFirebase({ commit: async ops => writes.push(...ops) }));
  await t.onAuth({ uid: 'alice' }); let release; const gate = new Promise(r => release = r);
  pickDelayed(w, 'rbImport', { size: 500, text: () => gate }); await delay();
  if (seqName === 'Alice→Bob') await t.onAuth({ uid: 'bob' });
  else if (seqName === 'Alice→未ログイン') await t.onAuth(null);
  else { await t.onAuth({ uid: 'bob' }); await t.onAuth({ uid: 'alice' }); }
  release(JSON.stringify([rec('alice-import-secret')])); await delay(120);
  assert.equal(writes.length, 0, JSON.stringify(writes.map(x => x.path)));
  assert(!(await t.lgetAll('lanenote-records')).some(x => x.id === 'alice-import-secret'), 'ゲストDBに保存された');
  assert.doesNotMatch(text(w, 'rbDataStatus'), /読み込みました/);
});
await check('R01 対照：アカウントが変わらなければ、選んだ人のクラウドにだけ保存される', async () => {
  const w = await recordHarness(), t = w.__t, writes = []; t.setReady(true); t.setFB(fakeFirebase({ commit: async ops => writes.push(...ops) }));
  await t.onAuth({ uid: 'alice' }); let release; const gate = new Promise(r => release = r);
  pickDelayed(w, 'rbImport', { size: 500, text: () => gate }); await delay();
  release(JSON.stringify([rec('alice-own')])); await waitUntil(() => /読み込みました/.test(text(w, 'rbDataStatus')));
  assert(writes.length >= 1 && writes.every(x => x.path.startsWith('users/alice/records/')), JSON.stringify(writes.map(x => x.path)));
});
for (const next of ['bob', null]) await check('R02 反転：テキスト資料の読み込み中に ' + (next || 'ログアウト') + ' → 選手名入りプレビューが戻らない', async () => {
  const w = await recordHarness(), t = w.__t; t.setReady(true); t.setFB(fakeFirebase()); await t.onAuth({ uid: 'alice' });
  let release; const gate = new Promise(r => release = r);
  const pending = t.handleFiles([{ name: 'Alice_private_result.txt', size: 500, type: 'text/plain', text: () => gate }]);
  await delay(); await t.onAuth(next ? { uid: next } : null); assert.equal(t.batches().length, 0);
  release('第1回架空大会\n男子100m 決勝\n順位\tﾚｰﾝ\tBib\t氏名\t所属\t記録\t風\n1\t4\t101\t架空 太郎(高1)\t架空高\t12.00\t+0.1');
  await pending; await delay();
  assert.equal(t.batches().length, 0); assert.doesNotMatch(text(w, 'rbBatches'), /架空 太郎/); assert.doesNotMatch(text(w, 'rbStatus'), /読み取りました/);
});
await check('R02 対照：アカウントが変わらなければプレビューが出る', async () => {
  const w = await recordHarness(), t = w.__t; t.setReady(true); t.setFB(fakeFirebase()); await t.onAuth({ uid: 'alice' });
  await t.handleFiles([{ name: 'a.txt', size: 500, type: 'text/plain', text: async () => '第1回架空大会\n男子100m 決勝\n順位\tﾚｰﾝ\tBib\t氏名\t所属\t記録\t風\n1\t4\t101\t架空 太郎(高1)\t架空高\t12.00\t+0.1' }]);
  assert.equal(t.batches().length, 1); assert.match(text(w, 'rbBatches'), /架空 太郎/);
});
await check('A01：手入力も、押した時点のアカウントに保存（途中で切り替わったら書かない）', async () => {
  const w = await recordHarness(), t = w.__t, writes = []; let release; const gate = new Promise(r => release = r);
  t.setReady(true); t.setFB(fakeFirebase({ commit: async ops => { await gate; writes.push(...ops); } })); await t.onAuth({ uid: 'alice' });
  const d = w.document; const set = (id, v) => { d.getElementById(id).value = v; };
  set('rmDate', '2026-10-10'); set('rmName', '架空 花子'); set('rmEvent', '女子100m'); set('rmMark', '13.10'); set('rmTeam', '架空高');
  d.getElementById('rbManual').dispatchEvent(new w.Event('submit', { cancelable: true })); await delay();
  await t.onAuth({ uid: 'bob' }); release(); await delay(80);
  assert(!writes.some(x => x.path.startsWith('users/bob/')));
  assert.doesNotMatch(text(w, 'rmStatus'), /保存しました/);
});

console.log('[A04] 「この端末のデータを消す」のあと、控えが作り直されない');
await check('R03 反転：消したあと・非同期処理の完了後も lanenote-cache-alice に記録が戻らない', async () => {
  const w = await recordHarness(), t = w.__t; t.setReady(true); t.setFB(fakeFirebase({ read: async p => p === 'users/alice/records' ? [rec('a-secret')] : [] }));
  await t.onAuth({ uid: 'alice' }); assert.equal((await t.lgetAll('lanenote-cache-alice')).length, 1);
  w.document.getElementById('rbWipeDevice').click();
  await waitUntil(() => /端末のデータを消しました/.test(text(w, 'rbDataStatus'))); await delay(150);
  const names = (await w.indexedDB.databases()).map(d => d.name);
  assert(!names.includes('lanenote-cache-alice') || (await t.lgetAll('lanenote-cache-alice')).length === 0, '控えが戻った');
  assert.equal(t.all().length, 1, '画面にはクラウドの記録を出す');
  assert.match(text(w, 'rbAuthInfo'), /控えを置いていません/);
  await t.reload(t.scope()); await delay();
  assert(!(await w.indexedDB.databases()).map(d => d.name).includes('lanenote-cache-alice') || (await t.lgetAll('lanenote-cache-alice')).length === 0);
  w.document.getElementById('rbCacheOn').click(); await delay(120);
  assert.equal((await t.lgetAll('lanenote-cache-alice')).length, 1, '再開したら控えを作る');
});

console.log('[A02] 大会準備：ログアウト後に共有一覧が戻らない');
await check('R04 反転：遅い一覧の応答がログアウト後に届いても、氏名・リンクIDを出さない', async () => {
  let release; const gate = new Promise(r => release = r); const fb = fakeFirebase({ read: async () => gate }); fb.auth.currentUser = { uid: 'alice' }; fb.F.serverTimestamp = () => 0; fb.F.Timestamp = { fromMillis: ms => ({ toMillis: () => ms }) };
  const w = await meetHarness(undefined, w => { w.LANE_FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo' }; w.__fakeFB = fb; });
  await w.__t.makeShortUrl('1.abc', 'seed');
  const box = w.document.getElementById('shareMine'), pending = w.__t.renderMyShares(box); await delay();
  fb.auth.currentUser = null; await w.__t.renderMyShares(box);
  release([{ id: 'Secret0001', label: '選手：架空太郎（架空大会）' }]); await pending; await delay();
  assert.doesNotMatch(box.textContent, /架空太郎/); assert.doesNotMatch(box.textContent, /Secret0001/);
});
await check('A02：onAuthStateChanged（別タブのログアウト・切替）で shareMine・plMine の両方を消し、遅い応答も戻らない', async () => {
  let release; const gate = new Promise(r => release = r); const fb = fakeFirebase({ read: async p => p.includes('/alice/') ? gate : [] }); let cb = null;
  fb.A.onAuthStateChanged = (_, f) => { cb = f; }; fb.auth.currentUser = { uid: 'alice' }; fb.F.serverTimestamp = () => 0; fb.F.Timestamp = { fromMillis: ms => ({ toMillis: () => ms }) };
  const w = await meetHarness(undefined, w => { w.LANE_FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo' }; w.__fakeFB = fb; });
  await w.__t.makeShortUrl('1.abc', 'seed');
  const a = w.document.getElementById('shareMine'), b = w.document.getElementById('plMine');
  const p1 = w.__t.renderMyShares(a), p2 = w.__t.renderMyShares(b); await delay();
  b.innerHTML = '<p>選手：前の人（大会）?s=Old0000001</p>';
  fb.auth.currentUser = { uid: 'bob' }; cb(fb.auth.currentUser);   // 別アカウントへ切替
  release([{ id: 'Secret0002', label: '選手：架空次郎（架空大会）' }]); await Promise.all([p1, p2]); await delay();
  assert.doesNotMatch(a.textContent + b.textContent, /架空次郎|Secret0002|前の人|Old0000001/);
  assert.match(a.textContent, /まだ作っていません/, 'bob の一覧（空）を出す');
});

console.log('[A03] 別の選手・区分を重複扱いで落とさない／同じレースの再取込は増えない');
await check('R05 反転：bib 101 と 102 は解析でも保存でも2件', async () => {
  const w = await recordHarness(), t = w.__t, R = w.ResultParser;
  const a = rec('', { bib: '101', round: '決勝', heat: 1 }), b = rec('', { bib: '102', round: '決勝', heat: 1 });
  assert.equal(R.dedupe([a, b]).length, 2); a.id = R.recId(a.meet, a.date, a); b.id = R.recId(b.meet, b.date, b); assert.notEqual(a.id, b.id);
  const res = await t.putMany([a, b], t.scope()); assert.equal(res.added, 2); assert.equal(res.dup, 0);
  const again = await t.putMany([Object.assign({}, a), Object.assign({}, b)], t.scope()); assert.equal(again.added, 0, '同じレースの再取込で増えた');
});
await check('R06 反転：「男子1年100m」と「男子共通100m」はIDが別・保存でも2件', async () => {
  const w = await recordHarness(), t = w.__t, R = w.ResultParser;
  const a = rec('', { team: '架空中', event: '男子1年100m' }), b = { ...a, event: '男子共通100m' };
  assert.notEqual(R.recId(a.meet, a.date, a), R.recId(b.meet, b.date, b));
  a.id = R.recId(a.meet, a.date, a); b.id = R.recId(b.meet, b.date, b);
  assert.equal((await t.putMany([a, b], t.scope())).added, 2);
});
await check('A03：v0.5/v0.6 の古いIDで保存済みの記録と同じ中身は重ねない／古いIDがぶつかる別の選手は落とさない', async () => {
  const w = await recordHarness(), t = w.__t, R = w.ResultParser;
  const old101 = rec('', { bib: '101', round: '決勝', heat: 1 }); old101.id = R.recIdV6(old101.meet, old101.date, old101);
  const old5 = rec('', { team: '架空高', event: '男子200m', mark: '24.00' }); old5.id = R.recIdLegacy(old5.meet, old5.date, old5);
  await t.ltx('readwrite', s => { s.put(old101); s.put(old5); }, 'lanenote-records'); await t.reload(t.scope());
  const same = { ...old101 }; same.id = R.recId(same.meet, same.date, same);
  const same5 = { ...old5 }; same5.id = R.recId(same5.meet, same5.date, same5);
  const other = rec('', { bib: '102', round: '決勝', heat: 1 }); other.id = old101.id;   // 古いIDだけ同じ（旧版のJSONから）
  const res = await t.putMany([same, same5, other], t.scope());
  assert.equal(res.added, 1, JSON.stringify(res)); assert.equal(res.dup, 2);
  const all = await t.lgetAll('lanenote-records'); assert.equal(all.length, 3); assert(all.some(r => r.bib === '102'));
});
await check('A03：JSONの再取込（同じファイルを2回）で増えない・bib違いは2件残る', async () => {
  const w = await recordHarness(), t = w.__t, R = w.ResultParser;
  const a = rec('', { bib: '101' }), b = rec('', { bib: '102' }); a.id = R.recId(a.meet, a.date, a); b.id = R.recId(b.meet, b.date, b);
  const file = JSON.stringify({ records: [a, b] });
  for (let i = 0; i < 2; i++) { pickDelayed(w, 'rbImport', { size: file.length, text: async () => file }); await waitUntil(() => /読み込みました/.test(text(w, 'rbDataStatus'))); w.document.getElementById('rbDataStatus').textContent = ''; }
  assert.equal((await t.lgetAll('lanenote-records')).length, 2);
});
await check('A03：ナンバーの無い古い記録と、ナンバー付きの同じ内容は自動で捨てず「要確認」に出す', async () => {
  const w = await recordHarness(), t = w.__t, R = w.ResultParser;
  const old = rec('', { bib: '' }); old.id = R.recIdLegacy(old.meet, old.date, old);
  await t.ltx('readwrite', s => s.put(old), 'lanenote-records'); await t.reload(t.scope());
  const n = rec('', { bib: '101' }); n.id = R.recId(n.meet, n.date, n);
  const res = await t.putMany([n], t.scope()); assert.equal(res.added, 1); assert.equal(res.review, 1);
  await t.reload(t.scope()); assert.match(text(w, 'rbReview'), /同じかもしれない記録 1件/);
});
await check('A03：手入力（ナンバーなし）で同じ記録を2回入れても1件、別の記録は入る', async () => {
  const w = await recordHarness(), t = w.__t, R = w.ResultParser;
  const m = R.manualRecord({ date: '2026-10-10', name: '架空 三郎', event: '男子100m', mark: '12.34', team: '架空高' }).rec; m.id = R.recId(m.meet, m.date, m);
  assert.equal((await t.putMany([{ ...m }], t.scope())).added, 1);
  assert.equal((await t.putMany([{ ...m }], t.scope())).added, 0);
  const m2 = { ...m, mark: '12.30' }; m2.id = R.recId(m2.meet, m2.date, m2);
  assert.equal((await t.putMany([m2], t.scope())).added, 1);
});

console.log('[A07] 大会全体の「この端末に保存」は元のリンクIDと期限を持ち、期限・停止に従う');
await check('R07 反転：保存したコピーに shareId・exp が入り、期限切れは開かずに消す', async () => {
  const w = await meetHarness(), s = await w.__meetApp.encodePayload({ v: 1, n: '架空秘密大会', r: [], c: [], ts: [] });
  await w.__t.openViewerStr(s, true, 'Secret0001', Date.now() + 10000); w.__t.saveViewing();
  const stored = JSON.parse(w.localStorage.getItem('lanenote.saved.v1'))[0];
  assert.equal(stored.shareId, 'Secret0001'); assert(stored.exp > Date.now());
  const past = { ...stored, exp: Date.now() - 1000 }; w.localStorage.setItem('lanenote.saved.v1', JSON.stringify([past]));
  w.document.getElementById('vTitle').textContent = '';
  assert.equal(await w.__t.openSaved(past), 'expired');
  assert.doesNotMatch(text(w, 'vTitle'), /架空秘密大会/); assert.equal(JSON.parse(w.localStorage.getItem('lanenote.saved.v1')).length, 0);
});
await check('A07：止めたリンク（見つからない）から保存したコピーは、電波があれば確かめて消す', async () => {
  const fb = fakeFirebase(); const w = await meetHarness(undefined, w => { w.LANE_FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo' }; w.__fakeFB = fb; });
  const s = await w.__meetApp.encodePayload({ v: 1, n: '架空停止大会', r: [], c: [], ts: [] });
  await w.__t.openViewerStr(s, true, 'Stopped001', Date.now() + 1e6); w.__t.saveViewing();
  const stored = JSON.parse(w.localStorage.getItem('lanenote.saved.v1'))[0];
  assert.equal(await w.__t.openSaved(stored), 'stopped'); assert.equal(JSON.parse(w.localStorage.getItem('lanenote.saved.v1')).length, 0);
});

console.log('[A05] 実際の Firebase SDK：通信できないときに控えを空で上書きしない');
await check('R08 反転：fromCache の空結果で IndexedDB の控えが消えず、通信不能の表示になる', async () => {
  const w = await recordHarness(), t = w.__t; t.setReady(true);
  t.setFB(fakeFirebase({ read: async p => p === 'users/alice/records' ? [rec('offline-only-copy')] : [] }));
  await t.onAuth({ uid: 'alice' }); assert.equal((await t.lgetAll('lanenote-cache-alice')).length, 1);
  const app = initializeApp({ projectId: 'demo-lane-note-regress', apiKey: 'demo' }, 'offline-' + Date.now());
  const db = FS.getFirestore(app); FS.connectFirestoreEmulator(db, '127.0.0.1', 8089); await FS.disableNetwork(db);
  t.setFB({ fs: db, auth: { currentUser: { uid: 'alice' } }, A: {}, F: FS });
  try {
    const out = await t.getAll(t.scope());
    assert.equal(out.length, 1, '控えを出していない'); assert.equal((await t.lgetAll('lanenote-cache-alice')).length, 1, '控えが消えた');
    w.eval('void 0'); await t.reload(t.scope()); assert.match(text(w, 'rbAuthInfo'), /クラウドにつながらない/);
  } finally { await FS.terminate(db); await deleteApp(app); }
});
await check('A05：権限エラーは控えで隠さない（従来どおり）', async () => {
  const w = await recordHarness(), t = w.__t; t.setReady(true);
  const fb = fakeFirebase(); fb.F.getDocsFromServer = async () => { const e = new Error('denied'); e.code = 'permission-denied'; throw e; };
  t.setFB(fb); await t.onAuth({ uid: 'alice' }); await assert.rejects(t.getAll(t.scope()), /権限/);
});

console.log('[A06] ログインは popup だけ（redirect しない）');
await check('A06：popup がブロックされても redirect せず、入力が残り案内が出る', async () => {
  const w = await recordHarness(), t = w.__t; let redirected = false;
  const fb = fakeFirebase(); fb.A.GoogleAuthProvider = function () {}; fb.A.signInWithPopup = async () => { const e = new Error('blocked'); e.code = 'auth/popup-blocked'; throw e; }; fb.A.signInWithRedirect = async () => { redirected = true; };
  t.setReady(true); t.setFB(fb); w.document.getElementById('rbPaste').value = '残しておきたい入力';
  w.document.getElementById('rbSignIn').click(); await delay(60);
  assert.equal(redirected, false); assert.equal(w.document.getElementById('rbPaste').value, '残しておきたい入力');
  assert.match(text(w, 'rbAuthStatus'), /ポップアップ/); assert.match(text(w, 'rbAuthStatus'), /もう一度/);
  assert.doesNotMatch(src('auth_common.js'), /signInWithRedirect\(/);
});

console.log('[追加] 取り込み済みの大会から大会ごとに削除');
await check('取り込み済みの大会の「削除」：確認に大会名と件数を出し、その大会だけ消す（押した時点のアカウント）', async () => {
  const w = await recordHarness(), t = w.__t; let asked = '';
  w.confirm = m => { asked = m; return true; };
  await t.putMany([rec('m1'), rec('m2', { mark: '12.50' }), rec('k1', { meet: '別の大会' })], t.scope()); await t.reload(t.scope());
  const btn = [...w.document.querySelectorAll('#rbMeets [data-delmeet]')].find(b => /架空大会/.test(b.getAttribute('data-delmeet')));
  assert(btn); btn.click(); await waitUntil(() => /件を消しました/.test(text(w, 'rbDataStatus')));
  assert.match(asked, /架空大会/); assert.match(asked, /2件/);
  const left = await t.lgetAll('lanenote-records'); assert.equal(left.length, 1); assert.equal(left[0].meet, '別の大会');
});
} finally { doms.forEach(d => d.window.close()); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
