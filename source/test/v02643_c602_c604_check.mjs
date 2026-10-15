// v0.26.43 Astra 第6回 C602（消せなかったかけら）・C604（検索の一部失敗）の回帰テスト。Astra の再現テストを、安全な結果を期待する形にしたもの（架空データだけ・本番に接続しない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SRC = path.join(ROOT, 'source/src'), require = createRequire(import.meta.url);
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.43] C602・C604');
const LanePub = require('../src/pubmeets.js');

// ===== C510：にせの Firestore（ルールと同じく 1回20件まで・hid==false と exp> の条件が要る） =====
function fakeStore() {
  const col = new Map(), calls = { get: 0, list: 0 };
  const Ts = ms => ({ ms, toMillis: () => ms, _ts: 1 });
  const F = {
    doc: (fs_, c, id) => ({ c, id }), collection: (fs_, c) => ({ c }),
    where: (f, op, v) => ({ w: [f, op, v] }), limit: n => ({ lim: n }), startAfter: s => ({ after: s }),
    query: (c, ...p) => Object.assign({ c: c.c, p }),
    Timestamp: { fromMillis: Ts },
    getDoc: async r => { calls.get++; const v = col.get(r.c + '/' + r.id); if (v && (v.hid || v.exp.ms <= Date.now())) throw Object.assign(new Error('denied'), { code: 'permission-denied' }); return { id: r.id, exists: () => !!v, data: () => v && Object.assign({}, v) }; },
    getDocs: async q => {
      calls.list++; const ws = q.p.filter(x => x.w).map(x => x.w), lim = (q.p.find(x => x.lim) || {}).lim, after = (q.p.find(x => x.after) || {}).after;
      if (!(lim <= 20) || !ws.some(w => w[0] === 'hid' && w[1] === '==' && w[2] === false) || !ws.some(w => w[0] === 'exp' && w[1] === '>')) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
      let rows = [...col.entries()].filter(([k]) => k.startsWith(q.c + '/')).map(([k, v]) => ({ id: k.slice(q.c.length + 1), v }));
      rows = rows.filter(r => ws.every(([f, op, val]) => op === '==' ? r.v[f] === val : r.v[f].ms > val.ms)).sort((a, b) => a.v.exp.ms - b.v.exp.ms || a.id.localeCompare(b.id));
      if (after) { const i = rows.findIndex(r => r.id === after.id); rows = rows.slice(i + 1); }
      rows = rows.slice(0, lim); const docs = rows.map(r => ({ id: r.id, data: () => Object.assign({}, r.v) }));
      return { size: docs.length, forEach: f => docs.forEach(f) };
    }
  };
  const put = (c, plan, url, o = {}) => { const e = LanePub.entry(plan, url, null); col.set(c + '/' + (o.id || LanePub.docId(plan.date, plan.meet)), Object.assign(e, { by: o.by || 'uX', at: '2026-10-01', exp: Ts(o.exp || Date.now() + 30 * 864e5), ver: 1, rep: 0, hid: !!o.hid })); };
  return { F, put, col, calls };
}
const PLAN = { date: '2026-10-24', end: '2026-10-24', meet: '架空新人陸上競技大会', venue: '架空競技場' };

await check('C604: 一覧の検索が失敗したら incomplete＋理由を返す（truncated とは別）', async () => {
 const s=fakeStore();s.put('pubResults',{...PLAN,meet:'第5回 架空新人陸上大会'},'https://audit.example/result.html');
 const api=LanePub.make({F:s.F,fs:{},uid:'auditA',col:'pubResults'});
 const ok=await api.search(PLAN);assert.equal(ok.length,1);assert.equal(ok.incomplete,false);assert.equal(ok.reason,'');
 s.F.getDocs=async()=>{throw Object.assign(new Error('missing index'),{code:'failed-precondition'})};
 const ms=await api.search(PLAN);assert.equal(ms.length,0);assert.equal(ms.truncated,false);assert.equal(ms.incomplete,true);assert.equal(ms.reason,'failed-precondition');assert(ms.failed.length>=2);
});
await check('C604: 決まったIDが権限なし（隠れた・期限切れ）だけなら incomplete にしない', async () => {
 const s=fakeStore();s.put('pubResults',PLAN,'https://audit.example/r.html',{hid:true});
 const api=LanePub.make({F:s.F,fs:{},uid:'auditA',col:'pubResults'});
 const ms=await api.search(PLAN);assert.equal(ms.length,0);assert.equal(ms.incomplete,false);
});
await check('C604: 決まったIDの読み取りが失敗（unavailable）でも incomplete', async () => {
 const s=fakeStore();const api=LanePub.make({F:s.F,fs:{},uid:'auditA',col:'pubResults'});
 s.F.getDoc=async()=>{throw Object.assign(new Error('offline'),{code:'unavailable'})};
 const ms=await api.search(PLAN);assert.equal(ms.length,0);assert.equal(ms.incomplete,true);assert.equal(ms.reason,'unavailable');
});
const rhtml = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
const rd = new JSDOM(rhtml, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const rw = rd.window; rw.confirm = () => true; rw.alert = () => {}; rw.scrollTo = () => {}; rw.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(rw, { TextEncoder, TextDecoder, Response, Blob, File }); rw.fetch = () => Promise.reject(new Error('no network')); rw.indexedDB = new IDBFactory();
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js', 'pubmeets.js', 'prepdel.js']) rw.eval(src(s));
rw.eval(src('records_app.js').replace(tail, 'window.__t={clearCloudSide:clearCloudSide,prepPurge:prepPurge,resSrc:resSrc,resBox:resBox,RES:function(){return RES;},scope:scope,login:function(f,u,t){FB=f;USER={uid:u};TEAM=t;authEpoch++;}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
function mkStore(failIds) {
  const store = new Map(), K = '2026-10-24|架空新人大会', K2 = '2026-11-08|架空B大会', base = 'users/uA/meets/' + K, base2 = 'users/uA/meets/' + K2;
  store.set(base, { plan: true, prep: { docs: { yoko: { n: 2, v: 'abcd1234' }, sl: { n: 1 }, tt: { url: 'https://kaku.example/tt.pdf' } } } });
  store.set(base2, { plan: true, prep: { docs: { yoko: { n: 1, v: 'efgh5678' } } } });
  for (const c of ['yoko_abcd1234_0', 'yoko_abcd1234_1', 'sl_0']) store.set(base + '/pdf/' + c, { kind: 'x' });
  store.set(base2 + '/pdf/yoko_efgh5678_0', { kind: 'x' });
  store.set('users/uA/settings/divOverrides', { a: 1 });
  const F = { doc: (fs_, ...a) => ({ path: a.join('/') }), collection: (fs_, ...a) => ({ path: a.join('/') }),
    getDocsFromServer: async q => { const docs = [...store.entries()].filter(([k]) => k.startsWith(q.path + '/') && k.slice(q.path.length + 1).indexOf('/') < 0).map(([k, v]) => ({ id: k.slice(q.path.length + 1), data: () => v })); return { forEach: f => docs.forEach(f), docs }; },
    deleteField: () => '__DEL__', updateDoc: async (r, ...a) => { const o = store.get(r.path); for (let i = 0; i < a.length; i += 2) { const ks = a[i].split('.'); let x = o; for (let j = 0; j < ks.length - 1; j++) x = x[ks[j]]; if (a[i + 1] === '__DEL__') delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = a[i + 1]; } },
    getDoc: async r => { const v = store.get(r.path); return { exists: () => v != null, data: () => v == null ? v : JSON.parse(JSON.stringify(v)) }; },   // v0.26.46 C801：最新の印を読み直す
    deleteDoc: async r => { if (failIds.fail && r.path.endsWith('/yoko_abcd1234_0')) throw Object.assign(new Error('injected delete failure'), { code: 'resource-exhausted' }); store.delete(r.path); }, writeBatch: () => { const ops = []; return { delete: r => ops.push(r.path), set: () => {}, commit: async () => ops.forEach(p => store.delete(p)) }; } };
  return { store, F, base, base2 };
}
await check('C602: かけらを1つでも消せなければ、成功にせず（prep-partial）、その大会の文書（かけらの場所）は残す。ほかは消す', async () => {
  const fl = { fail: true }, { store, F, base, base2 } = mkStore(fl);
  rw.__t.login({ F, fs: {} }, 'uA', null);
  let err = null; try { await rw.__t.clearCloudSide(rw.__t.scope()); } catch (e) { err = e; }
  assert(err, 'clearCloudSide は失敗を返す'); assert.equal(err.code, 'prep-partial'); assert.match(err.message, /一部未削除/);
  assert(store.has(base), '親（印）は残す'); assert(store.has(base + '/pdf/yoko_abcd1234_0'));
  assert.equal(store.get(base).prep.docs.yoko.v, 'abcd1234');
  assert(!store.has(base2) && !store.has(base2 + '/pdf/yoko_efgh5678_0'), 'ほかの大会は消える');
  assert(!store.has('users/uA/settings/divOverrides'));
  // 再試行：失敗がなくなれば全部消える
  fl.fail = false; await rw.__t.clearCloudSide(rw.__t.scope());
  assert.deepEqual([...store.keys()], []);
});
await check('C602: 大会予定から消す・期限切れの片づけ（prepPurge）も、消せなかった種類の印は残して失敗を返す', async () => {
  const fl = { fail: true }, { store, F, base } = mkStore(fl);
  rw.__t.login({ F, fs: {} }, 'uA', null);
  const m = JSON.parse(JSON.stringify(store.get(base)));
  let err = null; try { await rw.__t.prepPurge('2026-10-24|架空新人大会', m, rw.__t.scope(), false); } catch (e) { err = e; }
  assert(err && err.code === 'prep-partial');
  const pd = store.get(base).prep.docs;   // v0.26.46：クラウドの最新の印で確かめる
  assert.equal(pd.yoko.v, 'abcd1234', '消せなかった要項の印は残す'); assert(!pd.sl, '消せた種類は外す');
  assert(store.has(base + '/pdf/yoko_abcd1234_0'));
});
rw.close();console.log(JSON.stringify({passed:pass,failed:fail}));if(fail)process.exitCode=1;
