// v0.26.41 Astra 第5回 段階3（C508 片づけ・表現、C509 出典と転送の鎖、C510 検索）の再現テスト（架空データだけ・本番に接続しない・外には出ない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SRC = path.join(here, '../src'), require = createRequire(import.meta.url);
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.41] 段階3：片づけ・表現・出典・転送の鎖・みんなの要項の検索');
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
await check('C510 再現：同じ日に120件の登録があり、目的の大会は日付の一覧の21件目より後 → 決まったIDで直接見つける・一部だけなら truncated', async () => {
  const s = fakeStore();
  for (let i = 0; i < 120; i++) s.put('pubMeets', { date: PLAN.date, meet: '架空記録会' + i }, 'https://www.jaaf.or.jp/kaku/x' + i + '.pdf', { exp: Date.now() + 2 * 864e5 + i * 1000 });
  s.put('pubMeets', PLAN, 'https://www.jaaf.or.jp/kaku/target.pdf', { exp: Date.now() + 60 * 864e5 });
  const ms = await LanePub.make({ F: s.F, fs: {}, uid: 'uA' }).search(PLAN);
  assert.equal(ms[0] && ms[0].url, 'https://www.jaaf.or.jp/kaku/target.pdf'); assert.equal(ms.truncated, true, 'truncated がない');
});
await check('C510：日付の一覧は20件で止めず、ページ送りで全部見る（似た名前の30件 → 30件とも候補に。truncated ではない）', async () => {
  const s = fakeStore();
  for (let i = 0; i < 30; i++) s.put('pubResults', { date: PLAN.date, meet: '架空新人陸上競技大会 ' + String(i) + '会場' }, 'https://www.jaaf.or.jp/kaku/r' + i + '.html');
  const ms = await LanePub.make({ F: s.F, fs: {}, uid: 'uA', col: 'pubResults' }).search(PLAN);
  assert.equal(ms.length, 30); assert.equal(ms.truncated, false);
});
await check('C510：何日かの大会は、初日から最終日までの毎日を調べる（2日目の日付で登録されたものも見つける）', async () => {
  const s = fakeStore(), P3 = Object.assign({}, PLAN, { end: '2026-10-26' });
  s.put('pubMeets', { date: '2026-10-25', end: '2026-10-25', meet: '第5回 架空新人陸上大会' }, 'https://www.jaaf.or.jp/kaku/day2.pdf');
  const ms = await LanePub.make({ F: s.F, fs: {}, uid: 'uA' }).search(P3);
  assert(ms.some(e => e.url === 'https://www.jaaf.or.jp/kaku/day2.pdf'), JSON.stringify(ms.map(e => e.url)));
  assert.deepEqual(LanePub.dayList('2026-10-24', '2026-10-26'), ['2026-10-24', '2026-10-25', '2026-10-26']); assert.equal(LanePub.dayList('2026-10-01', '2027-01-01').length, 7);
});
await check('C510：そろえた大会名（key）でも探す（初日の前から始まった同じ名前の大会）・隠れた／期限切れは出さない', async () => {
  const s = fakeStore();
  s.put('pubMeets', { date: '2026-10-23', end: '2026-10-24', meet: '架空新人陸上競技大会' }, 'https://www.jaaf.or.jp/kaku/k.pdf');
  s.put('pubMeets', { date: PLAN.date, meet: '架空新人陸上競技大会（隠）' }, 'https://www.jaaf.or.jp/kaku/h.pdf', { hid: true });
  const ms = await LanePub.make({ F: s.F, fs: {}, uid: 'uA' }).search(PLAN);
  assert.deepEqual(ms.map(e => e.url), ['https://www.jaaf.or.jp/kaku/k.pdf']);
});
await check('C510：1回の一覧は20件まで（ルールの上限）・条件（hid・exp）つき', () => { assert.equal(LanePub.PAGE, 20); assert(LanePub.PAGES >= 2); });

// ===== C509：中継の転送の鎖（https → http → https）を止める =====
const {default: worker, _resetRate} = await import('data:text/javascript;base64,' + fs.readFileSync(path.join(ROOT, 'worker/worker.js')).toString('base64'));
const PDF = new TextEncoder().encode('%PDF-1.4\n% fictional\n%%EOF\n');
const viaWorker = async (u, up) => { globalThis.fetch = async x => up(x); _resetRate(); return worker.fetch(new Request('https://lane-note-fetch.example.workers.dev/?url=' + encodeURIComponent(u), { headers: { Origin: 'https://masarun0721.github.io' } })); };
await check('C509 再現：https → 302 → http → 302 → https の鎖は、最後が https でも中継で止める', async () => {
  const up = u => u.startsWith('https://www.jaaf.or.jp/') ? new Response(null, { status: 302, headers: { Location: 'http://audit.example/mid' } })
    : u.startsWith('http://audit.example/') ? new Response(null, { status: 302, headers: { Location: 'https://audit.example/final.pdf' } }) : new Response(PDF, { headers: { 'Content-Type': 'application/pdf' } });
  const r = await viaWorker('https://www.jaaf.or.jp/kaku/chain.pdf', up); assert.equal(r.status, 400); assert.match(await r.text(), /insecure redirect/);
});
await check('C509：https → https の転送はこれまでどおり通り、X-Lane-Url に最後のURL', async () => {
  const up = u => u.startsWith('https://www.jaaf.or.jp/') ? new Response(null, { status: 302, headers: { Location: 'https://audit.example/final.pdf' } }) : new Response(PDF, { headers: { 'Content-Type': 'application/pdf' } });
  const r = await viaWorker('https://www.jaaf.or.jp/kaku/ok.pdf', up); assert.equal(r.status, 200); assert.equal(r.headers.get('X-Lane-Url'), 'https://audit.example/final.pdf');
});

// ===== 記録のページ（records）：C508 clearCloudSide・C509 みんなの結果の出典 =====
const rhtml = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
const rd = new JSDOM(rhtml, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const rw = rd.window; rw.confirm = () => true; rw.alert = () => {}; rw.scrollTo = () => {}; rw.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(rw, { TextEncoder, TextDecoder, Response, Blob, File }); rw.fetch = () => Promise.reject(new Error('no network')); rw.indexedDB = new IDBFactory();
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js', 'pubmeets.js', 'prepdel.js']) rw.eval(src(s));
rw.eval(src('records_app.js').replace(tail, 'window.__t={clearCloudSide:clearCloudSide,resSrc:resSrc,resBox:resBox,RES:function(){return RES;},scope:scope,login:function(f,u,t){FB=f;USER={uid:u};TEAM=t;authEpoch++;}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
await check('C508 再現：クラウドを全部消す（clearCloudSide）で、大会の文書の下のPDFのかけら（版つき・古い形）も消す', async () => {
  const store = new Map(), K = '2026-10-24|架空新人大会', base = 'users/uA/meets/' + K;
  store.set(base, { plan: true, prep: { docs: { yoko: { n: 2, v: 'abcd1234' }, sl: { n: 1 }, tt: { url: 'https://kaku.example/tt.pdf' } } } });
  for (const c of ['yoko_abcd1234_0', 'yoko_abcd1234_1', 'sl_0']) store.set(base + '/pdf/' + c, { kind: 'x' });
  store.set('users/uA/settings/divOverrides', { a: 1 });
  const F = { doc: (fs_, ...a) => ({ path: a.join('/') }), collection: (fs_, ...a) => ({ path: a.join('/') }),
    getDocsFromServer: async q => { const docs = [...store.entries()].filter(([k]) => k.startsWith(q.path + '/') && k.slice(q.path.length + 1).indexOf('/') < 0).map(([k, v]) => ({ id: k.slice(q.path.length + 1), data: () => v })); return { forEach: f => docs.forEach(f), docs }; },
    getDoc: async r => { const v = store.get(r.path); return { exists: () => v != null, data: () => v == null ? v : JSON.parse(JSON.stringify(v)) }; },   // v0.26.46 C801：最新の印を読み直す
    deleteDoc: async r => { store.delete(r.path); }, writeBatch: () => { const ops = []; return { delete: r => ops.push(r.path), set: () => {}, commit: async () => ops.forEach(p => store.delete(p)) }; } };
  rw.__t.login({ F, fs: {} }, 'uA', null);
  await rw.__t.clearCloudSide(rw.__t.scope());
  assert.deepEqual([...store.keys()], [], [...store.keys()].join(','));
});
await check('C509 再現：みんなの結果の取り込みは、出典に実際に読んだ先（転送のあとのURL）を出す・登録とちがうサイトなら ⚠', () => {
  rw.__t.resBox('<div class="status" id="resMsg"></div>');
  const pub = { url: 'https://www.jaaf.or.jp/kaku/res.html', host: 'www.jaaf.or.jp' }, f = new File(['x'], 'res.html', { type: 'text/html' }); f.srcUrl = 'https://audit.example/other.html';
  rw.__t.resSrc(pub, [f]); const t = rw.document.getElementById('resSrc').textContent;
  assert(/実際に読んだ先/.test(t) && /audit\.example/.test(t) && /ちがうサイトへ転送/.test(t), t); assert.equal(rw.__t.RES().src.url, 'https://audit.example/other.html');
  const g = new File(['x'], 'res.html', { type: 'text/html' }); g.srcUrl = 'https://www.jaaf.or.jp/kaku/res.html';
  rw.__t.resSrc(pub, [g]); const t2 = rw.document.getElementById('resSrc').textContent; assert(/www\.jaaf\.or\.jp/.test(t2) && !/転送/.test(t2), t2);
});

// ===== 大会準備（index.html）：C508 表現と、起動したときの端末の控えの整理 =====
await check('C508・C802（v0.26.46）：「自動で消えます」「順次削除」は使わない（公開するページ・アプリの文言）。期限後はアプリで読めなくなる・クラウドの自動削除はしていない', () => {
  for (const f of ['index.html', 'records.html', 'guide.html', 'intro.html', 'schedule.html', 'team.html', 'check.html', 'try.html']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<section class="box g-card changelog" id="changelog">[\s\S]*?<\/section>/, '');   // 更新情報（過去の記録）はそのまま
    const body = s.replace(/"text":\s*"[^"]*"/g, '');
    assert(!/自動で消えます/.test(body), f + ' に「自動で消えます」が残っている');
    assert(!/順次削除/.test(body), f + ' に「順次削除」が残っている');   // v0.26.46 C802：TTL を使っていないので、自動の削除を約束しない
  }
  const a = src('app.js'); assert.match(a, /大会終了の1か月後から、保存したPDFはアプリで読めなくなります/); assert.match(a, /現在、クラウド上の自動削除は行っていません/); assert.match(a, /サーバーに残る場合があります/);
  assert.match(src('template.html'), /現在、クラウド上の自動削除は行っていません/); assert.match(src('guide_template.html'), /現在、クラウド上の自動削除は行っていません/);
});
await check('C508：起動したとき、期限が過ぎた端末の控え（IndexedDB）と準備の一覧を整理する（期限内のものは残す）', async () => {
  const idb = new IDBFactory();
  await new Promise(ok => { const q = idb.open('lanenote-prep', 1); q.onupgradeneeded = () => q.result.createObjectStore('snap', { keyPath: 'id' }); q.onsuccess = () => { const db = q.result, tx = db.transaction('snap', 'readwrite'); tx.objectStore('snap').put({ id: '|2026-08-01|架空夏季大会', owner: '|', key: '2026-08-01|架空夏季大会', end: '2026-08-01', snap: {}, docs: {} }); tx.objectStore('snap').put({ id: '|2026-12-01|架空冬季大会', owner: '|', key: '2026-12-01|架空冬季大会', end: '2026-12-01', snap: {}, docs: {} }); tx.oncomplete = () => { db.close(); ok(); }; }; });
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), scripts = html.match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/^<script>|<\/script>$/g, ''));
  const d = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), { url: 'http://127.0.0.1:9/index.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    beforeParse(v) { v.localStorage.setItem('lanenote.prep.idx.v1', JSON.stringify({ '|': { '2026-08-01|架空夏季大会': { kinds: { yoko: 1 } }, '2026-12-01|架空冬季大会': { kinds: { yoko: 1 } } } })); v.HTMLElement.prototype.scrollIntoView = function () {}; } });
  await delay(30); const w = d.window; Object.assign(w, { TextEncoder, TextDecoder, Response, File, Blob }); w.indexedDB = idb; w.scrollTo = () => {};
  for (const s of scripts) { try { w.eval(s); } catch (e) { } }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay(600);
  const ids = await new Promise(ok => { const q = idb.open('lanenote-prep', 1); q.onsuccess = () => { const db = q.result, r = db.transaction('snap', 'readonly').objectStore('snap').getAllKeys(); r.onsuccess = () => { db.close(); ok(r.result); }; }; });
  assert.deepEqual(ids, ['|2026-12-01|架空冬季大会']); assert.deepEqual(Object.keys(JSON.parse(w.localStorage.getItem('lanenote.prep.idx.v1'))['|']), ['2026-12-01|架空冬季大会']);
});
console.log('v02641_stage3_check: ' + pass + ' ok / ' + fail + ' NG'); process.exit(fail ? 1 : 0);
