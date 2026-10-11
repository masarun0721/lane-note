// LANE NOTE 画面の回帰テスト（v0.14・Astra 監査 2026-10-11 の app_check.mjs を参考に、期待値を「起きないこと」に直したもの）
//   node app_check.mjs   （要 jsdom・fake-indexeddb：npm install）
// jsdom ＋ fake-indexeddb ＋ 模擬の Firebase だけを使う。本物の Firebase・ネットワークには一切つながない（fetch も禁止）。
// 実際のブラウザでの確認（ログイン・IndexedDB の消去）の代わりにはならない。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
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
// 模擬 Firebase：パスを文字列で扱い、書き込みを記録する
function fakeFirebase({ read = async () => [], commit = async () => {}, getDoc = async () => ({ exists: () => false }) } = {}) {
  const auth = { currentUser: null, authStateReady: async () => {} };
  return { fs: {}, auth, A: { signOut: async () => { auth.currentUser = null; }, getRedirectResult: async () => null },
    F: { collection: (_, ...parts) => parts.join('/'), doc: (...a) => typeof a[0] === 'string' ? a.join('/') : a.slice(1).join('/'),
      getDocs: async p => { const rows = await read(p); return { forEach: f => rows.forEach((r, i) => f({ id: r.id || String(i), data: () => r })) }; },
      getDoc, setDoc: async (p, d) => commit([{ op: 'set', path: p, data: d }]),
      writeBatch: () => { const ops = []; return { set: (p, d) => ops.push({ op: 'set', path: p, data: d }), delete: p => ops.push({ op: 'delete', path: p }), commit: () => commit(ops) }; } } };
}
async function recordHarness() {
  const w = await makeDom('records_template.html', 'http://127.0.0.1:9090/records.html');
  w.eval(src('auth_common.js')); w.eval(src('results.js'));
  let js = src('records_app.js'); const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
  assert(js.includes(tail));
  js = js.replace(tail, `window.__t={getAll,cloudPut,clearAll,lgetAll,ltx,db,reload,putMany,onAuth,scope,recRow,
    setFB(f){FB=f;},setReady(v){CLOUD_READY=v;},all(){return ALL;},setAll(a){ALL=a;},user(){return USER;}};renderAuth();`);
  w.eval(js);
  return w;
}
const rec = (id = 'r1', extra = {}) => ({ id, name: '架空 一郎', team: '架空高', event: '男子100m', mark: '12.00', wind: '+0.0', date: '2026-10-10', meet: '架空大会', grade: '1', ...extra });
const putGuest = (t, rows) => t.ltx('readwrite', s => rows.forEach(r => s.put(r)), 'lanenote-records');
const dbNames = async w => (await w.indexedDB.databases()).map(d => d.name);
const text = (w, id) => w.document.getElementById(id).textContent;
try {
console.log('[1] F02：ログインしていないときの記録を、ログインした人へ自動で移さない');
await check('ゲストの記録はログインしても自動で上がらず、件数つきで確認を出す。移すときは今の人にだけ・端末からは消す', async () => {
  const w = await recordHarness(), t = w.__t, writes = [];
  await putGuest(t, [rec('g1'), rec('g2', { mark: '12.10' })]);
  t.setFB(fakeFirebase({ commit: async ops => writes.push(...ops) })); t.setReady(true);
  await t.onAuth({ uid: 'alice', email: 'alice@example.jp' }); await delay();
  assert.equal(writes.length, 0, 'ログインしただけで書き込まれた');
  const box = w.document.getElementById('rbGuest');
  assert.equal(box.hidden, false); assert.match(box.textContent, /2件/); assert.match(box.textContent, /alice@example\.jp/);
  box.querySelector('[data-guest="keep"]').click(); await delay();
  assert.equal(writes.length, 0, '「移さない」で書き込まれた'); assert.equal(box.hidden, true);
  assert.equal((await t.lgetAll('lanenote-records')).length, 2, '「移さない」で端末の記録が消えた');
  await t.onAuth({ uid: 'bob', email: 'bob@example.jp' }); await delay();
  assert.equal(writes.length, 0, '次の人のログインで書き込まれた');
  assert.equal(w.document.getElementById('rbGuest').hidden, false);
  w.document.querySelector('#rbGuest [data-guest="move"]').click(); await delay(120);
  assert(writes.length >= 2 && writes.every(o => o.path.startsWith('users/bob/')), JSON.stringify(writes.map(o => o.path)));
  assert(!writes.some(o => o.path.startsWith('users/alice/')));
  assert.equal((await t.lgetAll('lanenote-records')).length, 0, '移したあと端末に残っている');
  await t.onAuth({ uid: 'carol' }); await delay();
  assert.equal(w.document.getElementById('rbGuest').hidden, true, '移したあとも次の人に出る');
});
await check('「移さずに端末から消す」はクラウドに書かず、端末のゲストの記録だけ消す', async () => {
  const w = await recordHarness(), t = w.__t, writes = [];
  await putGuest(t, [rec('g1')]); t.setFB(fakeFirebase({ commit: async ops => writes.push(...ops) })); t.setReady(true);
  await t.onAuth({ uid: 'alice' }); await delay();
  w.document.querySelector('#rbGuest [data-guest="discard"]').click(); await delay(80);
  assert.equal(writes.length, 0); assert.equal((await t.lgetAll('lanenote-records')).length, 0);
});

console.log('[2] F03：途中でアカウントが変わったら、続きの読み書きをしない');
await check('Aliceの読み込みが遅れて返ってきても、ログアウト後のゲストの端末・画面に入らない', async () => {
  const w = await recordHarness(), t = w.__t; let release; const gate = new Promise(r => release = r);
  let n = 0; t.setFB(fakeFirebase({ read: async p => p === 'users/alice/records' && n++ ? gate : [] })); t.setReady(true);
  await t.onAuth({ uid: 'alice' });
  const pending = t.reload();
  await t.onAuth(null);
  release([rec('alice-secret')]); await pending; await delay();
  assert(!(await t.lgetAll('lanenote-records')).some(r => r.id === 'alice-secret'), 'ゲストの端末に入った');
  assert(!t.all().some(r => r.id === 'alice-secret'), '画面に出た');
  assert(!(await dbNames(w)).includes('lanenote-cache-alice') || !(await t.lgetAll('lanenote-cache-alice')).some(r => r.id === 'alice-secret'), 'ログアウト後に Alice の控えへ書いた');
});
await check('401件の保存の途中で Bob に切り替わったら、2回目のまとめ書きをしない（Bob に書かない）', async () => {
  const w = await recordHarness(), t = w.__t, paths = []; let release, first = true; const gate = new Promise(r => release = r);
  t.setFB(fakeFirebase({ commit: async ops => { paths.push(ops.map(o => o.path)); if (first) { first = false; await gate; } } })); t.setReady(true);
  await t.onAuth({ uid: 'alice' }); paths.length = 0; first = true;
  const pending = t.cloudPut(Array.from({ length: 401 }, (_, i) => rec("r" + i)), t.scope());
  await delay(); await t.onAuth({ uid: 'bob' }); release();
  await assert.rejects(pending, e => e.code === 'auth-context-changed');
  assert.equal(paths.length, 1); assert(paths[0].every(p => p.startsWith('users/alice/')));
});
await check('ログイン中に保存した記録の保存先は、保存を始めたときの人', async () => {
  const w = await recordHarness(), t = w.__t, writes = [];
  t.setFB(fakeFirebase({ commit: async ops => writes.push(...ops) })); t.setReady(true);
  await t.onAuth({ uid: 'alice' });
  const sc = t.scope(); await t.onAuth({ uid: 'bob' });
  await assert.rejects(t.putMany([rec('x1')], sc), e => e.code === 'auth-context-changed');
  assert.equal(writes.length, 0);
});

console.log('[3] F04：ログアウトで端末の控えを本当に消し、失敗したら失敗と出す');
await check('ログアウト：控えのDBを閉じて消し、その人のキーも消してから「消しました」と出す', async () => {
  const w = await recordHarness(), t = w.__t, fb = fakeFirebase({ read: async () => [rec('a1')] }); t.setFB(fb); t.setReady(true);
  fb.auth.currentUser = { uid: 'alice' }; await t.onAuth({ uid: 'alice' }); await delay();
  w.localStorage.setItem('lanenote-rec-divov-alice', '{"x":"hs"}'); w.localStorage.setItem('lanenote-rec-meets-alice', '{}'); w.localStorage.setItem('other-app-key', 'keep');
  assert((await dbNames(w)).includes('lanenote-cache-alice'));
  fb.A.signOut = async () => { fb.auth.currentUser = null; await t.onAuth(null); };
  w.document.getElementById('rbSignOut').click(); await delay(150);
  assert(!(await dbNames(w)).includes('lanenote-cache-alice'), '控えのDBが残っている');
  assert.equal(w.localStorage.getItem('lanenote-rec-divov-alice'), null); assert.equal(w.localStorage.getItem('lanenote-rec-meets-alice'), null);
  assert.equal(w.localStorage.getItem('other-app-key'), 'keep', 'LANE NOTE 以外のキーを消した');
  assert.match(text(w, 'rbAuthStatus'), /控え.*も消しました/);
  assert(!t.all().length, '画面に前の人の記録が残っている');
});
await check('ほかのタブが控えを開いたまま（閉じない）だと「まだ消えていません」と出し、閉じたあと「端末の控えを消す」で消せる', async () => {
  const w = await recordHarness(), t = w.__t, fb = fakeFirebase({ read: async () => [rec('a1')] }); t.setFB(fb); t.setReady(true);
  await t.onAuth({ uid: 'alice' }); await delay();
  const other = await new Promise((ok, ng) => { const q = w.indexedDB.open('lanenote-cache-alice', 1); q.onsuccess = () => ok(q.result); q.onerror = ng; });   // versionchange で閉じないタブ
  w.document.getElementById('rbSignOut').click(); await delay(1800);
  assert.match(text(w, 'rbAuthStatus'), /まだ消えていません/); assert.doesNotMatch(text(w, 'rbAuthStatus'), /^✔/);
  other.close(); await delay(50);
  if ((await dbNames(w)).includes('lanenote-cache-alice')) { w.document.getElementById('rbWipeRetry').click(); await delay(150); }
  assert(!(await dbNames(w)).includes('lanenote-cache-alice'));
});

console.log('[4] F06・F09：重複の判定・読み込みの検査');
await check('v0.5 までのIDで保存済みの記録は、新しいIDで入れ直しても重ねない（区分が同じとき）', async () => {
  const w = await recordHarness(), t = w.__t, R = w.ResultParser;
  const r = rec('', { team: '架空高' }); r.id = R.recIdLegacy(r.meet, r.date, r); t.setAll([r]);
  const again = { ...r }; again.id = R.recId(again.meet, again.date, again); assert.notEqual(again.id, r.id);
  const res = await t.putMany([again], t.scope()); assert.equal(res.added, 0); assert.equal(res.dup, 1);
  const mid = { ...r, team: '架空中' }; mid.id = R.recId(mid.meet, mid.date, mid);
  assert.equal((await t.putMany([mid], t.scope())).added, 1, '中学の同じ名前・同じ記録が落ちた');
});
await check('JSONの読み込みは型を確かめ、決まった項目だけで作り直す', async () => {
  const w = await recordHarness(), R = w.ResultParser;
  assert.equal(R.sanitizeRecord(rec('bad', { date: 1 })), null);
  assert.equal(R.sanitizeRecord(rec('bad', { date: '2026-02-30' })), null);
  assert.equal(R.sanitizeRecord(rec('bad', { name: { x: 1 } })), null);
  const o = R.sanitizeRecord(rec('ok', { evil: '<img>', __proto__x: 1, heat: 2 }));
  assert(o && !('evil' in o) && !('__proto__x' in o) && o.heat === 2);
});
await check('記録の表は文字として出す（XSSなし）', async () => {
  const w = await recordHarness(), marker = '"><img data-m="1" src="x" onerror="window.__x=1">', r = rec();
  for (const k of ['name', 'team', 'event', 'round', 'heat', 'grade', 'mark', 'rank', 'comment', 'kana']) r[k] = marker;
  const box = w.document.createElement('div'); box.innerHTML = '<table>' + w.__t.recRow(r) + '</table>';
  assert.equal(box.querySelectorAll('[data-m]').length, 0);
});

console.log('[5] B：1件ずつ入力・直す・消す');
await check('1件ずつ入力：必須のチェック・記録の形をそろえて保存する', async () => {
  const w = await recordHarness(), t = w.__t, d = w.document; await t.reload(); await delay();
  const set = (id, v) => { d.getElementById(id).value = v; };
  d.getElementById('rbManual').dispatchEvent(new w.Event('submit', { cancelable: true })); await delay();
  assert.match(text(w, 'rmStatus'), /氏名/); assert.match(text(w, 'rmStatus'), /日付/);
  set('rmDate', '2026-10-04'); set('rmName', '架空 二郎'); set('rmEvent', '男子走幅跳'); set('rmMark', '5.74'); set('rmWind', '1.2'); set('rmTeam', '架空中'); set('rmRank', '3');
  d.getElementById('rbManual').dispatchEvent(new w.Event('submit', { cancelable: true })); await delay(80);
  const all = t.all(); assert.equal(all.length, 1, text(w, 'rmStatus'));
  assert.equal(all[0].mark, '5m74'); assert.equal(all[0].wind, '+1.2'); assert.equal(all[0].meet, '大会名なし（2026-10-04）'); assert.equal(all[0].rank, 3); assert(all[0].manual);
  assert.equal(d.getElementById('rmDate').value, '2026-10-04', '続けて入れるときの日付が消えた');
});
await check('記録を直す（IDが変わるときは古いほうを消す）・1件だけ消す', async () => {
  const w = await recordHarness(), t = w.__t, d = w.document, R = w.ResultParser;
  const a = rec('', { meet: '架空大会' }); a.id = R.recId(a.meet, a.date, a); const b = rec('', { name: '架空 三郎' }); b.id = R.recId(b.meet, b.date, b);
  await t.putMany([a, b], t.scope()); await t.reload(); await delay();
  d.querySelector('.tabs button[data-v="all"]').click(); await delay();
  const btn = [...d.querySelectorAll('[data-edit]')].find(x => x.getAttribute('data-edit') === a.id); assert(btn, '直すボタンがない');
  btn.click(); await delay();
  assert.equal(d.getElementById('rmName').value, '架空 一郎'); assert.equal(d.getElementById('rmDelete').hidden, false);
  d.getElementById('rmMark').value = '11.95';
  d.getElementById('rbManual').dispatchEvent(new w.Event('submit', { cancelable: true })); await delay(80);
  const ids = t.all().map(r => r.id);
  assert(!ids.includes(a.id), '古いIDが残った'); assert.equal(t.all().length, 2); assert(t.all().some(r => r.mark === '11.95'));
  const del = [...d.querySelectorAll('[data-delrec]')].find(x => t.all().find(r => r.id === x.getAttribute('data-delrec') && r.name === '架空 三郎'));
  del.click(); await delay(80);
  assert.equal(t.all().length, 1); assert(!t.all().some(r => r.name === '架空 三郎'));
});
await check('URLだけを貼ったら「今はまだURLからの読み込みには対応していません」', async () => {
  const w = await recordHarness(), d = w.document;
  d.getElementById('rbPaste').value = 'https://example.jp/result/100m.html'; d.getElementById('rbPasteGo').click(); await delay();
  assert.match(text(w, 'rbStatus'), /今はまだURLからの読み込みには対応していません。後日実装予定です。/);
  assert.equal(d.getElementById('rbBatches').children.length, 0);
});

console.log('[6] F05：不具合・要望はGoogleログインが必要');
await check('ログインしていなければ送らずにログインの案内を出す。ログイン中は uid 付きで送る', async () => {
  const w = await makeDom('records_template.html', 'http://127.0.0.1:9090/records.html', w => { w.LANE_FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo' }; });
  const adds = [], fb = fakeFirebase(); fb.F.addDoc = async (c, d) => { adds.push({ c, d }); return { id: 'f1' }; }; fb.F.serverTimestamp = () => 'TS';
  w.__fakeFB = fb; w.eval(src('auth_common.js'));
  w.eval(src('feedback.js').replace('if (FBm) return FBm;', 'if (window.__fakeFB) FBm = window.__fakeFB; if (FBm) return FBm;'));
  assert(!/ログインしていなくても送れます/.test(src('feedback.js')));
  w.LaneFeedback.open(); await delay(60);
  assert.match(w.document.getElementById('fbLogin').textContent, /Googleでのログインが必要/);
  assert(w.document.getElementById('fbSignIn'));
  w.document.getElementById('fbBody').value = '架空の不具合';
  w.document.getElementById('fbForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await delay(60);
  assert.equal(adds.length, 0, 'ログインなしで送った'); assert.match(w.document.getElementById('fbStatus').textContent, /ログインが必要/);
  assert.equal(w.document.getElementById('fbBody').value, '架空の不具合', '書いた内容が消えた');
  fb.auth.currentUser = { uid: 'alice', email: 'a@example.jp' };
  w.document.getElementById('fbForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await delay(60);
  assert.equal(adds.length, 1); assert.equal(adds[0].c, 'feedback'); assert.equal(adds[0].d.uid, 'alice');
  assert.deepEqual(Object.keys(adds[0].d).sort(), ['body', 'contact', 'createdAt', 'kind', 'page', 'path', 'screen', 'ua', 'uid', 'version']);
});

console.log('[7] 大会準備：共有リンク（F07〜F09）');
async function meetHarness(url, before) {
  const w = await makeDom('template.html', url || 'http://127.0.0.1:9090/index.html', before);
  w.eval(src('parser.js')); w.eval(src('logic.js')); w.eval(src('player.js')); w.eval(src('personal.js')); w.eval(src('auth_common.js'));
  let app = src('app.js').replace('if (FB) return FB;', 'if (window.__fakeFB) FB = window.__fakeFB; if (FB) return FB;');
  const end = 'window.__meetApp = {'; assert(app.includes(end));
  app = app.replace(end, 'window.__t={openViewerStr,fetchShare,makeShortUrl,validatePayload,pvLoad};\n  ' + end);
  w.eval(app); w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay(); return w;
}
await check('展開後2MiBを超える共有データは読まない', async () => {
  const w = await meetHarness(), str = await w.__meetApp.encodePayload({ v: 1, r: [], n: 'A'.repeat(2 * 1024 * 1024 + 10) });
  await assert.rejects(w.__meetApp.decodePayload(str), /大きすぎ/);
});
await check('形のおかしいカード・行は読み込む段階で断る（画面を作る前に）', async () => {
  const w = await meetHarness();
  await assert.rejects(w.__meetApp.decodePayload(await w.__meetApp.encodePayload({ v: 1, r: [], c: [['school', {}]] })), /形が違います/);
  await assert.rejects(w.__meetApp.decodePayload(await w.__meetApp.encodePayload({ v: 1, r: [{ a: 1 }] })), /形が違います/);
  const ok = await w.__meetApp.decodePayload(await w.__meetApp.encodePayload({ v: 1, n: '架空大会', r: [['10:00', '男子100m']], c: [['架空高', [['1', 2]], [], []]], extra: 'x' }));
  assert.equal(ok.n, '架空大会'); assert(!('extra' in ok));
});
await check('共有の文字は文字として出す（XSSなし）', async () => {
  const w = await meetHarness(), m = '"><img data-m="1" src="x" onerror="window.__x=1">', row = Array(15).fill(m); row[12] = '';
  await w.__t.openViewerStr(await w.__meetApp.encodePayload({ v: 1, n: m, ts: [m], r: [row], c: [] }), true);
  assert.equal(w.document.querySelectorAll('[data-m]').length, 0);
});
await check('短いリンク：期限は119日・shares と自分の一覧（shareIndex）を一緒に作る', async () => {
  const ops = [], fb = fakeFirebase({ commit: async o => ops.push(...o) }); fb.auth.currentUser = { uid: 'alice' };
  fb.F.serverTimestamp = () => 'TS'; fb.F.Timestamp = { fromMillis: ms => ({ ms, toMillis: () => ms }) };
  const w = await meetHarness(undefined, w => { w.LANE_FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo' }; w.__fakeFB = fb; });
  const t0 = Date.now(), url = await w.__t.makeShortUrl('1.abc', '大会：架空');
  assert.match(url, /\?s=[A-Za-z0-9]{10}$/); const id = url.slice(-10);
  assert.deepEqual(ops.map(o => o.path).sort(), ['shares/' + id, 'users/alice/shareIndex/' + id].sort());
  const sh = ops.find(o => o.path === 'shares/' + id).data;
  assert.deepEqual(Object.keys(sh).sort(), ['createdAt', 'data', 'expiresAt', 'ownerUid']);
  const days = (sh.expiresAt.ms - t0) / 864e5; assert(days > 118.99 && days < 119.01, String(days));
});
await check('期限切れ・止めたリンク（permission-denied）は、端末の控えを消して開かない', async () => {
  const fb = fakeFirebase({ getDoc: async () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; } });
  const w = await meetHarness('http://127.0.0.1:9090/index.html?s=Abcdefghij', w => {
    w.LANE_FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo' }; w.__fakeFB = fb;
    w.localStorage.setItem('lanenote.player.v1.Abcdefghij', JSON.stringify({ p: '1.xxx', own: [], exp: Date.now() + 864e5 }));
  });
  await delay(150);
  assert.equal(w.localStorage.getItem('lanenote.player.v1.Abcdefghij'), null, '控えが残っている');
  assert.match(w.document.getElementById('vTime').textContent, /開けません/);
  assert.equal(w.document.getElementById('player').hidden, true, '控えから選手ページを開いた');
});
await check('選手のページ：控えに期限を持ち、「この予定を端末から削除」で消える', async () => {
  const w = await meetHarness(), o = { v: 1, k: 'p', n: '架空大会', d: '2026-10-10', a: { name: '架空 一郎', team: '架空高' }, e: [] };
  const str = await w.__meetApp.encodePayload(o), exp = Date.now() + 864e5;
  w.__meetApp.openPlayer(await w.__meetApp.decodePayload(str), str, 'Player0001', exp);
  const st = JSON.parse(w.localStorage.getItem('lanenote.player.v1.Player0001')); assert.equal(st.exp, exp);
  w.document.getElementById('pvForget').click(); await delay();
  assert.equal(w.localStorage.getItem('lanenote.player.v1.Player0001'), null);
});
await check('大会準備のログアウトは、同じ人の記録の控え（lanenote-cache-<uid>）も消す', async () => {
  const fb = fakeFirebase(); fb.auth.currentUser = { uid: 'alice' };
  const w = await meetHarness(undefined, w => { w.LANE_FIREBASE_CONFIG = { apiKey: 'demo', projectId: 'demo' }; w.__fakeFB = fb; });
  await new Promise((ok, ng) => { const q = w.indexedDB.open('lanenote-cache-alice', 1); q.onupgradeneeded = () => q.result.createObjectStore('records', { keyPath: 'id' }); q.onsuccess = () => { q.result.close(); ok(); }; q.onerror = ng; });
  w.localStorage.setItem('lanenote-rec-divov-alice', '{}');
  w.document.getElementById('shareSignOut').click(); await delay(150);
  assert(!(await dbNames(w)).includes('lanenote-cache-alice')); assert.equal(w.localStorage.getItem('lanenote-rec-divov-alice'), null);
  assert.equal(fb.auth.currentUser, null);
});
} finally { doms.forEach(d => d.window.close()); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
