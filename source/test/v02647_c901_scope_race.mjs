// v0.26.47（監査 C901）：第9回監査の独立スクリプト（independent_scope_race.mjs）の再現3グループを、安全な結果を期待する形にしたもの。架空データ・ローカルのモックだけ

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
console.log('[v0.26.47] C901 トランザクションの読み取りを待つ間にチームを切り替えても、元のチームに書かない');
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
const parentWrites = t => t.events.filter(e => /^tx-(set|update|delete)$/.test(e[0]) || (/^(set|update|delete)$/.test(e[0]) && e[1] === t.base));
const switched = (t, sc0, box) => async () => { await w.__t.switchTeam(''); box.sc = w.__t.scope(); t.events.push(['scope-switched']); };
function sawSwitch(box, sc0) { assert(box.sc, '切り替えた'); assert.equal(box.sc.uid, sc0.uid); assert.equal(box.sc.team, null); assert(box.sc.epoch > sc0.epoch); }

await check('C901 再現A（予定を消す）：tx.get を待つ間に本物の switchTeam で自分だけへ → 中止・元のチームの親は消さない', async () => {
  const t = fixture(true);
  t.store.get(t.base).prep.docs.yoko = { url: 'https://audit.example/public.pdf', at: '2026-10-15T01:00:00Z', exp: Date.now() + 864e5 };   // URLだけの準備（かけらを消さない普通の状態）
  t.store.delete(t.base + '/pdf/yoko_old80000_0');
  login(t, true, { [K]: clone(t.store.get(t.base)) }); const sc0 = w.__t.scope(), box = {};
  t.setTxReadHook(switched(t, sc0, box));
  let err; try { await w.__t.planDelete(K); } catch (e) { err = e; }
  sawSwitch(box, sc0); assert.equal(err && err.code, 'auth-context-changed');
  assert(t.store.has(t.base), '元のチームの親は残る'); assert.equal(t.store.get(t.base).prep.docs.yoko.url, 'https://audit.example/public.pdf');
  assert.deepEqual(parentWrites(t), []);
});
for (const method of ['writeMeetDoc', 'saveMeet']) await check('C901 再現' + (method === 'writeMeetDoc' ? 'B' : 'C') + '（' + method + '）：tx.get を待つ間に切り替え → 中止・元のチームの天気は変えない', async () => {
  const t = fixture(true, { extra: { weather: '晴れ' } }); login(t, true, { [K]: clone(t.before) }); const sc0 = w.__t.scope(), box = {};
  t.setTxReadHook(switched(t, sc0, box));
  let err; try { if (method === 'writeMeetDoc') await w.__t.writeMeetDoc(K, { ...clone(t.before), weather: '雨' }, sc0); else await w.__t.saveMeet(K, { weather: '雨' }, sc0); } catch (e) { err = e; }
  sawSwitch(box, sc0); assert.equal(err && err.code, 'auth-context-changed');
  assert.equal(t.store.get(t.base).weather, '晴れ'); assert.deepEqual(parentWrites(t), []);
});
for (const method of ['planDelete', 'saveMeet']) await check('C901：競合でやり直した2回目の読み取り中に切り替えても書かない（' + method + '）', async () => {
  const t = fixture(true, { extra: { weather: '晴れ' } }); login(t, true, { [K]: clone(t.before) }); const sc0 = w.__t.scope(), box = {};
  t.setTxReadHook(async () => { t.store.get(t.base).memo = '別の画面'; t.setTxReadHook(switched(t, sc0, box)); });   // 1回目：ほかの画面が書いた → やり直し → 2回目：切り替え
  let err; try { if (method === 'planDelete') await w.__t.planDelete(K); else await w.__t.saveMeet(K, { weather: '雨' }, sc0); } catch (e) { err = e; }
  sawSwitch(box, sc0); assert.equal(err && err.code, 'auth-context-changed'); assert(t.events.some(e => e[0] === 'tx-retry'), 'やり直した');
  assert(t.store.has(t.base)); assert.equal(t.store.get(t.base).weather, '晴れ'); assert.deepEqual(parentWrites(t), []);
});
await check('対照：トランザクションの前（かけらを消している間）の切り替えも中止・親は残す', async () => {
  const t = fixture(true); login(t, true, { [K]: clone(t.before) });
  let sw = false; t.setDeleteHook(async p => { if (!sw && p.includes('/pdf/')) { sw = true; await w.__t.switchTeam(''); } });
  let err; try { await w.__t.planDelete(K); } catch (e) { err = e; }
  assert(sw); assert.equal(err && err.code, 'auth-context-changed'); assert(t.store.has(t.base)); assert(!t.events.some(e => e[0].startsWith('tx-')));
});
await check('対照：切り替えなければ、予定を消す・天気を直すは今までどおり終わる', async () => {
  let t = fixture(true); login(t, true, { [K]: clone(t.before) });
  await w.__t.planDelete(K); assert(!t.store.has(t.base)); assert.deepEqual([...t.store.keys()].filter(k => k.startsWith(t.base + '/pdf/')), []);
  t = fixture(true, { extra: { weather: '晴れ' } }); login(t, true, { [K]: clone(t.before) });
  await w.__t.saveMeet(K, { weather: '雨' }, w.__t.scope()); assert.equal(t.store.get(t.base).weather, '雨'); assert.equal(t.store.get(t.base).prep.docs.yoko.v, 'old80000');
});
w.close(); console.log(JSON.stringify({ passed, failed })); if (failed) process.exitCode = 1;
