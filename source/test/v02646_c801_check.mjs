// v0.26.46 Astra 第8回 C801 の回帰テスト：記録・大会予定のページの削除（予定を消す・期限切れの片づけ・クラウドのデータをすべて消す）も、
//   クラウドの最新の印を読み直して、その版を消し、トランザクションで版を確かめてから親を消す・置き換える。版が変わったら新しい印を残して「未完了」。
//   Astra の independent_deletion_paths.mjs を、安全な結果を期待する形にしたもの（架空データだけ・本番に接続しない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), src = n => fs.readFileSync(path.join(here, '../src', n), 'utf8');
const clone = v => v == null ? v : JSON.parse(JSON.stringify(v)), delay = ms => new Promise(r => setTimeout(r, ms));
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const dom = new JSDOM(html, { url: 'https://audit.example/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
const w = dom.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(Error('network disabled')); w.indexedDB = new IDBFactory();
for (const name of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js', 'pubmeets.js', 'prepdel.js']) w.eval(src(name));
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
w.eval(src('records_app.js').replace(tail, 'window.__t={switchTeam:switchTeam,clearCloudSide:clearCloudSide,planDelete:planDelete,prepPurge:prepPurge,prepSweep:prepSweep,writeMeetDoc:writeMeetDoc,saveMeet:saveMeet,mets:function(){return METS;},scope:scope,login:function(f,u,t,m){FB=f;USER={uid:u};TEAM=t;METS=m;ALL=[];authEpoch++;}};AUTH_SEEN=true;renderAuth();reload();'));
await delay(300);
console.log('[v0.26.46] C801 記録・大会予定のページの削除も最新の版を確かめる');
const K = '2026-10-24|架空新人大会', DEL = { __del: 1 };
const setPath = (o, p, v) => { const a = p.split('.'); let x = o; for (let i = 0; i < a.length - 1; i++) x = x[a[i]] = x[a[i]] || {}; if (v === DEL) delete x[a[a.length - 1]]; else x[a[a.length - 1]] = clone(v); };
function fixture(team, { tx = true, extra = {} } = {}) {
  const store = new Map(), base = (team ? 'teams/auditDeletionTeam8' : 'users/auditDeletion8') + '/meets/' + K;
  const before = Object.assign({ plan: true, prep: { docs: { yoko: { n: 1, v: 'old80000', at: '2026-10-15T01:00:00Z', name: 'old.pdf', exp: Date.now() + 864e5 } } } }, extra);
  store.set(base, clone(before)); store.set(base + '/pdf/yoko_old80000_0', { kind: 'yoko', v: 'old80000', i: 0, n: 1, data: 'synthetic-old' });
  const events = []; let onDelete = null, onTxRead = null;
  const F = {
    doc: (_fs, ...a) => ({ path: a.join('/') }), collection: (_fs, ...a) => ({ path: a.join('/') }),
    getDoc: async r => { events.push(['get', r.path]); const s = store.has(r.path) ? clone(store.get(r.path)) : null; return { exists: () => s !== null, data: () => clone(s) }; },
    getDocsFromServer: async q => { const docs = [...store].filter(([p]) => p.startsWith(q.path + '/') && !p.slice(q.path.length + 1).includes('/')).map(([p, v]) => { const s = clone(v); return { id: p.slice(q.path.length + 1), data: () => clone(s) }; }); return { docs, size: docs.length, forEach: f => docs.forEach(f) }; },
    deleteDoc: async r => { if (onDelete) await onDelete(r.path); events.push(['delete', r.path]); store.delete(r.path); },
    setDoc: async (r, d) => { events.push(['set', r.path]); store.set(r.path, clone(d)); },
    updateDoc: async (r, ...a) => { events.push(['update', r.path]); const o = store.get(r.path); for (let i = 0; i < a.length; i += 2) setPath(o, a[i], a[i + 1]); },
    deleteField: () => DEL,
    writeBatch: () => { const ops = []; return { delete: r => ops.push(r.path), commit: async () => { for (const p of ops) { events.push(['batch-delete', p]); store.delete(p); } } }; }
  };
  // Firestore と同じく、読んだ文書が確定までに変わっていたらやり直す（5回まで）
  if (tx) F.runTransaction = async (_fs, fn) => {
    for (let n = 0; n < 5; n++) {
      const seen = new Map(), ops = [];
      const t = { get: async r => { const s = store.has(r.path) ? clone(store.get(r.path)) : null; seen.set(r.path, JSON.stringify(s)); if (onTxRead) { const f = onTxRead; onTxRead = null; await f(r.path); } return { exists: () => s !== null, data: () => clone(s) }; },
        set: (r, d) => ops.push(['set', r, d]), update: (r, ...a) => ops.push(['update', r, a]), delete: r => ops.push(['delete', r]) };
      const out = await fn(t);
      if ([...seen].some(([p, j]) => JSON.stringify(store.has(p) ? store.get(p) : null) !== j)) { events.push(['tx-retry']); continue; }
      for (const [op, r, x] of ops) { events.push(['tx-' + op, r.path]); if (op === 'set') store.set(r.path, clone(x)); else if (op === 'delete') store.delete(r.path); else { const o = store.get(r.path); for (let i = 0; i < x.length; i += 2) setPath(o, x[i], x[i + 1]); } }
      return out;
    }
    throw Object.assign(new Error('too much contention'), { code: 'aborted' });
  };
  const publishNew = (v = 'new80000') => { store.set(base + '/pdf/yoko_' + v + '_0', { kind: 'yoko', v, i: 0, n: 1, data: 'synthetic-new' }); const cur = store.get(base).prep.docs.yoko; store.get(base).prep.docs.yoko = { ...before.prep.docs.yoko, v, at: '2026-10-15T02:00:00Z', name: v + '.pdf' }; store.delete(base + '/pdf/yoko_' + cur.v + '_0'); events.push(['publish-new', base]); };
  return { F, store, base, before, publishNew, events, setDeleteHook: f => { onDelete = f; }, setTxReadHook: f => { onTxRead = f; } };
}
const chunks = t => [...t.store.keys()].filter(k => k.startsWith(t.base + '/pdf/'));
let passed = 0, failed = 0;
async function check(n, fn) { try { await fn(); passed++; console.log('  ok', n); } catch (e) { failed++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const login = (t, team, mets) => w.__t.login({ F: t.F, fs: {} }, 'auditDeletion8', team ? { id: 'auditDeletionTeam8', role: 'coach' } : null, mets);

for (const team of [false, true]) for (const tx of [true, false]) await check(`C801 再現A：予定画面を開いたあとにほかの画面が新しいPDFを保存しても、予定を消すと最新の版を消してから親を消す（${team ? 'チーム' : '個人'}${tx ? '' : '・トランザクションなしの環境'}）`, async () => {
  const t = fixture(team, { tx }); login(t, team, { [K]: clone(t.before) });
  t.publishNew();
  await w.__t.planDelete(K);
  assert(t.events.some(e => e[0] === 'get' && e[1] === t.base), '最新の親を読む');
  assert.deepEqual(chunks(t), [], '新しい版のかけらも残らない'); assert(!t.store.has(t.base), '親も消える'); assert(!w.__t.mets()[K]);
});
await check('C801：記録・天気が残る大会の予定を消すとき、古い METS で新しい prep を上書きしない（最新の版を消し、予定の欄だけ外して残す）', async () => {
  const t = fixture(false, { extra: { weather: '晴れ', temp: 20 } }); login(t, false, { [K]: clone(t.before) });
  t.publishNew();
  await w.__t.planDelete(K);
  assert.deepEqual(chunks(t), []); const p = t.store.get(t.base); assert(p, '天気が残るので親は残す'); assert.equal(p.weather, '晴れ'); assert(!p.prep && !p.plan, '予定の欄と prep は外す');
});
await check('C801：予定を消している最中に版が変わったら、新しい版の印とかけらを残し、未完了（prep-changed）を返す。再試行で消える', async () => {
  const t = fixture(true); login(t, true, { [K]: clone(t.before) });
  let injected = false; t.setDeleteHook(async p => { if (!injected && p.includes('/pdf/')) { injected = true; t.publishNew(); } });
  let err = null; try { await w.__t.planDelete(K); } catch (e) { err = e; }
  assert(injected); assert(err && err.code === 'prep-changed', String(err && err.message)); assert.match(err.message, /消し終わっていません/);
  assert(t.store.has(t.base) && t.store.get(t.base).prep.docs.yoko.v === 'new80000', '新しい印は残す'); assert.deepEqual(chunks(t), [t.base + '/pdf/yoko_new80000_0']);
  t.setDeleteHook(null); await w.__t.planDelete(K);
  assert.deepEqual(chunks(t), []); assert(!t.store.has(t.base));
});
await check('C801：親を確かめたあと（トランザクションの中）で版が変わっても、新しい印を消さない（やり直して未完了を返す）', async () => {
  const t = fixture(false); login(t, false, { [K]: clone(t.before) });
  t.setTxReadHook(async () => { t.publishNew(); });
  let err = null; try { await w.__t.planDelete(K); } catch (e) { err = e; }
  assert(t.events.some(e => e[0] === 'tx-retry'), 'トランザクションがやり直す'); assert(err && err.code === 'prep-changed');
  assert.equal(t.store.get(t.base).prep.docs.yoko.v, 'new80000'); assert(t.store.has(t.base + '/pdf/yoko_new80000_0'));
});
await check('C801 再現B：クラウドを全部消す途中で版が変わったら、親（新しい印）を残して未完了を返し、再試行で新しい版も消える', async () => {
  const t = fixture(false); login(t, false, { [K]: clone(t.before) });
  let injected = false; t.setDeleteHook(async p => { if (!injected && p.includes('/pdf/')) { injected = true; t.publishNew(); } });
  let err = null; try { await w.__t.clearCloudSide(w.__t.scope()); } catch (e) { err = e; }
  assert(injected); assert(err && err.code === 'prep-changed', '成功として終わらない');
  assert(t.store.has(t.base) && t.store.get(t.base).prep.docs.yoko.v === 'new80000'); assert(t.store.has(t.base + '/pdf/yoko_new80000_0'));
  t.setDeleteHook(null); await w.__t.clearCloudSide(w.__t.scope());
  assert.deepEqual([...t.store.keys()], [], '再試行で全部消える');
});
await check('C801：期限切れの片づけ（prepSweep）は、ほかの画面が保存した新しい版（期限内）を消さず、古い METS で印を上書きしない', async () => {
  const t = fixture(false); t.store.get(t.base).prep.docs.yoko.exp = Date.now() - 1000; const stale = clone(t.store.get(t.base));
  login(t, false, { [K]: clone(stale) });
  t.publishNew(); t.store.get(t.base).prep.docs.yoko.exp = Date.now() + 864e5;
  w.document.body.classList.add('sched-page'); await w.__t.prepSweep(w.__t.scope()); w.document.body.classList.remove('sched-page');   // 大会予定のページを開いたときの片づけ
  assert.equal(t.store.get(t.base).prep.docs.yoko.v, 'new80000', '新しい印を古い METS で上書きしない'); assert(t.store.has(t.base + '/pdf/yoko_new80000_0'));
  assert.equal(w.__t.mets()[K].prep.docs.yoko.v, 'new80000', '画面の控えも最新に');
});
await check('C801：天気などを保存し直すとき（writeMeetDoc・saveMeet）、古い METS の prep でクラウドの新しい prep を上書きしない', async () => {
  const t = fixture(false); login(t, false, { [K]: clone(t.before) });
  t.publishNew();
  const o = clone(w.__t.mets()[K]); o.weather = '雨'; await w.__t.writeMeetDoc(K, o, w.__t.scope());
  assert.equal(t.store.get(t.base).weather, '雨'); assert.equal(t.store.get(t.base).prep.docs.yoko.v, 'new80000');
  assert.equal(w.__t.mets()[K].prep.docs.yoko.v, 'new80000', '画面の控えも最新の prep に');
  await w.__t.saveMeet(K, { weather: '曇り' }, w.__t.scope());
  assert.equal(t.store.get(t.base).weather, '曇り'); assert.equal(t.store.get(t.base).prep.docs.yoko.v, 'new80000');
});
await check('C602（維持）：予定を消すとき、かけらを消せなければ親を残して一部未削除', async () => {
  const t = fixture(false); login(t, false, { [K]: clone(t.before) });
  t.setDeleteHook(async p => { if (p.includes('/pdf/')) throw Object.assign(new Error('injected'), { code: 'resource-exhausted' }); });
  let err = null; try { await w.__t.planDelete(K); } catch (e) { err = e; }
  assert(err && err.code === 'prep-partial'); assert(t.store.has(t.base)); assert.equal(t.store.get(t.base).prep.docs.yoko.v, 'old80000');
});
// v0.26.47（監査 C901）：w.eval('authEpoch++') は IIFE の中の変数に届かず（ReferenceError → prep-partial）、切り替えを確かめていなかった。本物の switchTeam で切り替える
await check('ログイン・チームが変わったら途中で止める（本物の switchTeam でチーム→自分だけ・親も印も書かない）', async () => {
  const t = fixture(true); login(t, true, { [K]: clone(t.before) }); const sc0 = w.__t.scope();
  let sc1 = null; t.setDeleteHook(async p => { if (!sc1 && p.includes('/pdf/')) { await w.__t.switchTeam(''); sc1 = w.__t.scope(); } });
  let err = null; try { await w.__t.planDelete(K); } catch (e) { err = e; }
  assert(sc1, '切り替えた'); assert.equal(sc1.uid, sc0.uid); assert.equal(sc1.team, null); assert(sc1.epoch > sc0.epoch, '保存先の世代が進んだ');
  assert.equal(err && err.code, 'auth-context-changed', String(err && (err.code || err.message)));
  assert(t.store.has(t.base), '親は残す'); assert.equal(t.store.get(t.base).prep.docs.yoko.v, 'old80000', '印も残す');
  assert(!t.events.some(e => /^(tx-|set$|update$)/.test(e[0]) || (e[0] === 'delete' && e[1] === t.base)), '親への書き込みなし：' + JSON.stringify(t.events));
});
w.close(); console.log(JSON.stringify({ passed, failed })); if (failed) process.exitCode = 1;
