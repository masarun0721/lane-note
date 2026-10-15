// v0.26.40 Astra 第5回 段階2（C503・C504・C505・C506・C507）の再現テスト（架空データ・本番に接続しない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), FIX = path.join(here, 'fixtures');
const delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.40] 大会準備：切り替え・採用・版つき保存・権限・ログイン変化');
const K = '2026-10-24|架空新人大会', PL = { date: '2026-10-24', end: '2026-10-25', meet: '架空新人大会', venue: '架空競技場' };
const K2 = '2026-11-07|架空秋季大会', PL2 = { date: '2026-11-07', end: '2026-11-07', meet: '架空秋季大会', venue: '架空公園' };
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = html.match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/^<script>|<\/script>$/g, ''));
const NM = path.join(here, 'node_modules/pdfjs-dist/');
const fix = s => s.replace('var lib = await loadPdfjs();', 'var lib = window.__pdfjs;').replace("cMapUrl: PDFJS_BASE + 'cmaps/'", "cMapUrl: " + JSON.stringify(NM + 'cmaps/')).replace("standardFontDataUrl: PDFJS_BASE + 'standard_fonts/'", "standardFontDataUrl: " + JSON.stringify(NM + 'standard_fonts/'));
// にせの Firestore（メモリの中だけ）
const store = new Map(), DEL = { __del: 1 }, clone = v => JSON.parse(JSON.stringify(v));
const merge = (a, b) => { for (const k of Object.keys(b)) { if (b[k] === DEL) delete a[k]; else if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k] && typeof b[k] === 'object' ? clone(b[k]) : b[k]; } return a; };
const setPath = (o, p, v) => { const a = p.split('.'); let x = o; for (let i = 0; i < a.length - 1; i++) x = x[a[i]] = x[a[i]] || {}; if (v === DEL) delete x[a[a.length - 1]]; else x[a[a.length - 1]] = v && typeof v === 'object' ? clone(v) : v; };
const writes = []; const hook = { setFail: null, getFail: null };
const F = {
  doc: (fs_, ...a) => ({ path: a.join('/') }),
  getDoc: async r => { if (hook.getFail && hook.getFail(r.path)) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }); const v = store.get(r.path); return { exists: () => !!v, data: () => v && clone(v) }; },
  setDoc: async (r, d, o) => { if (hook.setFail && hook.setFail(r.path)) throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); writes.push(r.path); if (o && o.merge && store.has(r.path)) merge(store.get(r.path), d); else store.set(r.path, merge({}, d)); },
  updateDoc: async (r, ...a) => { if (!store.has(r.path)) throw Object.assign(new Error('not found'), { code: 'not-found' }); writes.push(r.path); for (let i = 0; i < a.length; i += 2) setPath(store.get(r.path), a[i], a[i + 1]); },
  deleteDoc: async r => { writes.push('del:' + r.path); store.delete(r.path); },
  deleteField: () => DEL,
  Timestamp: { fromMillis: ms => ({ ms }) }
};
const fakeFB = uid => ({ F, fs: {}, A: {}, auth: { currentUser: uid ? { uid } : null } });
async function open({ uid, team, copyUid, idb, fetchMap, preIdx }) {
  const d = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), { url: 'http://127.0.0.1:9/index.html?plan=' + encodeURIComponent(K), runScripts: 'outside-only', virtualConsole: (() => { const v = new VirtualConsole(); if (process.env.DBG) v.on('error', e => console.log('CE', String(e && e.stack || e).slice(0, 300))); return v; })(),
    beforeParse(v) { v.localStorage.setItem('lanenote.plans.v1', JSON.stringify({ at: 1, uid: copyUid != null ? copyUid : (uid || ''), team: team || '', list: [PL, PL2] })); v.HTMLElement.prototype.scrollIntoView = function () {}; if (preIdx) v.localStorage.setItem('lanenote.prep.idx.v1', preIdx); } });
  await delay(30); const w = d.window;
  Object.assign(w, { TextEncoder, TextDecoder, Response, File, Blob, __pdfjs: pdfjs }); w.indexedDB = idb; w.scrollTo = () => {}; if (!(w.crypto && w.crypto.subtle)) Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });   // 本物のブラウザと同じく SHA-256 を使えるようにする
  w.__confirms = []; w.confirm = m => { w.__confirms.push(m); return true; }; w.alert = () => {};
  w.fetch = async u => { const m = /[?&]url=([^&]+)/.exec(String(u)); const t = m && fetchMap && fetchMap[decodeURIComponent(m[1])]; if (!t) return new Response('x', { status: 404 }); return new Response(fs.readFileSync(t), { status: 200, headers: { 'content-type': 'application/pdf' } }); };
  for (const s of scripts) { try { w.eval(fix(s)); } catch (e) { } }
  if (uid !== undefined && uid !== null) w.__meetApp.setFB(fakeFB(uid));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay(400);
  return w;
}

const file = (w, f, name, extra) => { let b = fs.readFileSync(path.join(FIX, f)); if (extra) b = Buffer.concat([b, Buffer.from('\n%' + 'x'.repeat(extra) + '\n')]); return new File([b], name, { type: 'application/pdf' }); };
// 読み込みを止めておけるファイル（open() を呼ぶまで arrayBuffer を返さない）
const gated = (w, f, name, extra) => { const x = file(w, f, name, extra), orig = x.arrayBuffer.bind(x); let open; const g = new Promise(r => { open = r; }); x.arrayBuffer = async () => { await g; return orig(); }; x.open = open; return x; };
const bar = w => (w.document.getElementById('prepBar') || {}).textContent || '';
const st = (w, k) => w.document.getElementById(k + 'Status').textContent;
const meetPath = (k, t = 'T1') => 'teams/' + t + '/meets/' + k;
const ptr = (k, kind) => { const m = store.get(meetPath(k)); return m && m.prep && m.prep.docs && m.prep.docs[kind]; };
const chunks = (k, kind) => [...store.keys()].filter(x => x.startsWith(meetPath(k) + '/pdf/' + kind + '_')).sort();
const ids = (v, n) => Array.from({ length: n }, (_, i) => meetPath(K) + '/pdf/yoko_' + v + '_' + i).sort();
const pick = (w, k) => { const s = w.document.getElementById('planPick'); s.value = k; assert.equal(s.value, k, '大会予定の選択肢に無い'); s.dispatchEvent(new w.Event('change')); };
const idbOwners = idb => new Promise(ok => { const q = idb.open('lanenote-prep', 1); q.onupgradeneeded = () => q.result.createObjectStore('snap', { keyPath: 'id' }); q.onsuccess = () => { const db = q.result, r = db.transaction('snap', 'readonly').objectStore('snap').getAll(); r.onsuccess = () => { db.close(); ok(r.result.map(x => x.owner)); }; }; });

// ---- C503：大会を切り替えたら、前の大会には書かない ----
await check('C503：大会Aを開いたまま大会Bを選ぶ → 準備はBに切り替わり、読み込み中だったAの保存は捨てる（Aには書かない）', async () => {
  const w = await open({ uid: 'uA', team: 'T1', idb: new IDBFactory() });
  assert.equal(w.__meetApp.prep().key, K);
  const f = gated(w, 'f5_note_fee500.pdf', '架空要項A.pdf'); const pend = w.__meetApp.handleFile('yoko', f); await delay(50);
  const n = writes.length;
  pick(w, K2); await delay(500);
  assert.equal(w.__meetApp.prep().key, K2, '準備がBに切り替わっていない');
  assert.equal(w.document.getElementById('meetName').value, '架空秋季大会');
  f.open(); const r = await pend; await delay(300);
  assert.equal(r.adopted, false, '前の大会の読み込みが採用された');
  assert(!writes.slice(n).some(x => x.includes(K)), 'Aに書いた：' + writes.slice(n).join(','));
  assert(!/架空要項A/.test(st(w, 'yoko')), '前の大会のファイルが画面に出た');
  await w.__meetApp.handleFile('yoko', file(w, 'f5_note_fee500.pdf', '架空要項B.pdf')); await delay(400);
  assert.equal(ptr(K2, 'yoko').name, '架空要項B.pdf'); assert(!ptr(K, 'yoko'), 'Aの大会の印に保存された');
});

// ---- C504：採用された読み込みだけを保存（同じファイル名でも古いものは保存しない） ----
await check('C504：同じ名前 yoko.pdf を2回入れ、1回目が後から終わる → 保存されるのは2回目だけ（handleFile0 は {adopted, procId}）', async () => {
  const w = await open({ uid: 'uA', team: 'T1', idb: new IDBFactory() }); store.delete(meetPath(K2));
  const f1 = gated(w, 'f5_note_fee500.pdf', 'yoko.pdf'), f2 = file(w, 'f5_note_nofee.pdf', 'yoko.pdf');
  assert.notEqual(f1.size, f2.size);
  const p1 = w.__meetApp.handleFile('yoko', f1); await delay(30);
  const r2 = await w.__meetApp.handleFile('yoko', f2); await delay(300);
  assert.equal(r2.adopted, true); assert.equal(typeof r2.procId, 'number');
  assert.equal(ptr(K, 'yoko').size, f2.size);
  const v2 = ptr(K, 'yoko').v;
  f1.open(); const r1 = await p1; await delay(400);
  assert.equal(r1.adopted, false); assert(r1.procId < r2.procId);
  assert.equal(ptr(K, 'yoko').size, f2.size, '古い読み込みで上書きされた'); assert.equal(ptr(K, 'yoko').v, v2);
});

// ---- C505：版つきのかけら・確かめてから切り替え・失敗したら「クラウド未保存」 ----
let w5, v1;
await check('C505：2つに分かれるPDFの保存 → かけらは 種類_版ID_番号・数と大きさとSHA-256を大会の印に・確かめてから切り替え', async () => {
  w5 = await open({ uid: 'uA', team: 'T1', idb: new IDBFactory() });
  const f = file(w5, 'f5_note_fee500.pdf', '架空要項1.pdf', 1200000);
  await w5.__meetApp.handleFile('yoko', f); await delay(500);
  const d = ptr(K, 'yoko'); assert(d, 'ポインタなし'); v1 = d.v;
  assert.match(v1, /^[a-z0-9]{8}$/); assert(d.n >= 2, 'n=' + d.n); assert.equal(d.size, f.size); assert.match(d.sha, /^[0-9a-f]{64}$/);
  assert.deepEqual(chunks(K, 'yoko'), ids(v1, d.n));
  const c = store.get(meetPath(K) + '/pdf/yoko_' + v1 + '_1'); assert.deepEqual([c.kind, c.v, c.i, c.n, c.sha], ['yoko', v1, 1, d.n, d.sha]);
});
await check('C505：新しい版の2つめのかけらで失敗 → 古い版のかけらと大会の印はそのまま・新しい版は片づける・「クラウド未保存」と再試行', async () => {
  hook.setFail = p => p.includes('/pdf/yoko_') && !p.includes(v1) && p.endsWith('_1');
  const f = file(w5, 'f5_note_nofee.pdf', '架空要項2.pdf', 1200000);
  await w5.__meetApp.handleFile('yoko', f); await delay(500); hook.setFail = null;
  assert.equal(ptr(K, 'yoko').v, v1, '大会の印が新しい版を指した'); assert.equal(ptr(K, 'yoko').name, '架空要項1.pdf');
  assert.deepEqual(chunks(K, 'yoko'), ids(v1, ptr(K, 'yoko').n), '版が混ざった：' + chunks(K, 'yoko').join(','));
  assert(/クラウド未保存/.test(bar(w5)), bar(w5));
  const b = w5.document.querySelector('[data-prepretry="yoko"]'); assert(b, '再試行ボタンなし');
  b.click(); await delay(800);
  const d = ptr(K, 'yoko'); assert.notEqual(d.v, v1); assert.equal(d.name, '架空要項2.pdf'); assert.equal(d.size, f.size);
  assert.deepEqual(chunks(K, 'yoko'), ids(d.v, d.n), '古い版が残った');
  assert(!/クラウド未保存/.test(bar(w5)));
});
await check('C505：大会の印を切り替える前に失敗（ポインタ更新の失敗）→ 古い版のまま・新しい版は片づける', async () => {
  const before = ptr(K, 'yoko').v, F0 = F.updateDoc; F.updateDoc = async () => { throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); };
  try { await w5.__meetApp.handleFile('yoko', file(w5, 'f5_note_fee500.pdf', '架空要項3.pdf')); await delay(500); } finally { F.updateDoc = F0; }
  assert.equal(ptr(K, 'yoko').v, before); assert(chunks(K, 'yoko').every(x => x.includes('_' + before + '_')), chunks(K, 'yoko').join(','));
  assert(/クラウド未保存/.test(bar(w5)));
});
await check('C505：別の端末で戻すとき、かけらの中身が合わない（版が混ざった・壊れた）なら使わない', async () => {
  const d = ptr(K, 'yoko'), id = meetPath(K) + '/pdf/yoko_' + d.v + '_1', good = store.get(id);
  store.set(id, Object.assign({}, good, { data: good.data.slice(0, -8) + 'AAAAAAAA' }));
  try {
    const w = await open({ uid: 'uA', team: 'T1', idb: new IDBFactory() }); await delay(1200);
    assert(/✖ 保存した要項を読めませんでした/.test(st(w, 'yoko')), st(w, 'yoko'));
    store.set(id, Object.assign({}, good, { v: 'zzzz9999' }));
    const w2 = await open({ uid: 'uA', team: 'T1', idb: new IDBFactory() }); await delay(1200);
    assert(/✖ 保存した要項を読めませんでした/.test(st(w2, 'yoko')), st(w2, 'yoko'));
  } finally { store.set(id, good); }
  const w3 = await open({ uid: 'uA', team: 'T1', idb: new IDBFactory() }); await delay(1500);
  assert(/架空要項2\.pdf/.test(st(w3, 'yoko')), '正しい版が戻らない：' + st(w3, 'yoko'));
});

// ---- C506：権限なし と 通信できない を分ける ----
await check('C506：チームから外れた（大会の印の読み取りが permission-denied）→ この端末の控えを出さず、そのチームの控えと一覧を消す', async () => {
  const idb = new IDBFactory(), w = await open({ uid: 'uA', team: 'T1', idb });
  await w.__meetApp.handleFile('yoko', file(w, 'f5_note_fee500.pdf', '架空要項C.pdf')); await delay(600);
  assert((await idbOwners(idb)).includes('uA|T1')); assert(JSON.parse(w.localStorage.getItem('lanenote.prep.idx.v1'))['uA|T1']);
  const ls = w.localStorage.getItem('lanenote.prep.idx.v1'); w.close(); await delay(100);   // 前のタブは閉じる（同じ端末で別のタブが開いたままだと、そのタブが控えを書き直すことがある）
  hook.getFail = p => p.startsWith('teams/T1/');
  try {
    const w2 = await open({ uid: 'uA', team: 'T1', idb, preIdx: ls }); await delay(800);   // 同じ端末＝同じ IndexedDB・同じ localStorage の印
    assert(!/続きから/.test(bar(w2)), bar(w2)); assert(!/架空要項C/.test(st(w2, 'yoko')), '控えが戻った');
    assert(!(await idbOwners(idb)).includes('uA|T1'), 'この端末の控えが残った：' + JSON.stringify(await idbOwners(idb)));
    const ix = JSON.parse(w2.localStorage.getItem('lanenote.prep.idx.v1') || '{}'); assert(!ix['uA|T1'], '準備の一覧が残った');
    assert(/権限がありません/.test(w2.document.body.textContent));
  } finally { hook.getFail = null; }
});
await check('C506：通信できないだけ（unavailable）なら、この端末の控えで続ける', async () => {
  const idb = new IDBFactory(), w = await open({ uid: 'uA', team: 'T1', idb });
  await w.__meetApp.handleFile('yoko', file(w, 'f5_note_fee500.pdf', '架空要項D.pdf')); await delay(600);
  const ls = w.localStorage.getItem('lanenote.prep.idx.v1'), G0 = F.getDoc;
  F.getDoc = async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); };
  try { const w2 = await open({ uid: 'uA', team: 'T1', idb, preIdx: ls }); await delay(800);
    assert(/続きから/.test(bar(w2)), bar(w2)); assert((await idbOwners(idb)).includes('uA|T1'));
  } finally { F.getDoc = G0; }
});

// ---- C507：読み込みの途中でログインが変わったら、結果を出さない ----
await check('C507：読み込み中にアカウントが変わる → 結果を画面に出さず、保存もしない', async () => {
  const w = await open({ uid: 'uA', team: 'T1', idb: new IDBFactory() });
  const f = gated(w, 'f5_note_fee500.pdf', '架空要項E.pdf'), pend = w.__meetApp.handleFile('yoko', f); await delay(50);
  const n = writes.length; w.__meetApp.setFB(fakeFB('uB'));
  f.open(); const r = await pend; await delay(300);
  assert.equal(r.adopted, false); assert(!/架空要項E/.test(st(w, 'yoko')) || /読み取り中/.test(st(w, 'yoko')), st(w, 'yoko')); assert.equal(writes.length, n);
});
await check('C507：ログインが変わるたびに、すべての読み込み番号（loadSeq）を進める・大会の世代（prepGen）を読み込みの初めに控えて確かめる', () => {
  const s = fs.readFileSync(path.join(ROOT, 'source/src/app.js'), 'utf8');
  const a = s.slice(s.indexOf('function onShareAuth'), s.indexOf('function onShareAuth') + 1500);
  assert.match(a, /authEpoch\+\+;\s*Object\.keys\(loadSeq\)\.forEach\(function \((\w)\) \{ loadSeq\[\1\]\+\+; \}\)/);
  assert.match(s, /function ctxOk\(c\) \{ return !!c && c\.epoch === authEpoch && c\.uid === prepUid\(\) && c\.gen === prepGen; \}/);
});
console.log('v02640_prep_check: ' + pass + ' ok / ' + fail + ' NG'); process.exit(fail ? 1 : 0);
