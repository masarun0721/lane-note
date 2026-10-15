// v0.26.33 大会ごとの準備の保存（この端末・クラウド＝自分だけ／チーム）・続きから・保存を消す・A01・大会終了の1か月後に消える（架空データ・本番に接続しない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), FIX = path.join(here, 'fixtures');
const delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.33] 大会準備の保存');
const K = '2026-10-24|架空新人大会', PL = { date: '2026-10-24', end: '2026-10-25', meet: '架空新人大会', venue: '架空競技場' };
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = html.match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/^<script>|<\/script>$/g, ''));
const NM = path.join(here, 'node_modules/pdfjs-dist/');
const fix = s => s.replace('var lib = await loadPdfjs();', 'var lib = window.__pdfjs;').replace("cMapUrl: PDFJS_BASE + 'cmaps/'", "cMapUrl: " + JSON.stringify(NM + 'cmaps/')).replace("standardFontDataUrl: PDFJS_BASE + 'standard_fonts/'", "standardFontDataUrl: " + JSON.stringify(NM + 'standard_fonts/'));
// にせの Firestore（メモリの中だけ）
const store = new Map(), DEL = { __del: 1 }, clone = v => JSON.parse(JSON.stringify(v));
const merge = (a, b) => { for (const k of Object.keys(b)) { if (b[k] === DEL) delete a[k]; else if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k] && typeof b[k] === 'object' ? clone(b[k]) : b[k]; } return a; };
const setPath = (o, p, v) => { const a = p.split('.'); let x = o; for (let i = 0; i < a.length - 1; i++) x = x[a[i]] = x[a[i]] || {}; if (v === DEL) delete x[a[a.length - 1]]; else x[a[a.length - 1]] = v && typeof v === 'object' ? clone(v) : v; };
const writes = [];
const F = {
  doc: (fs_, ...a) => ({ path: a.join('/') }),
  getDoc: async r => { const v = store.get(r.path); return { exists: () => !!v, data: () => v && clone(v) }; },
  setDoc: async (r, d, o) => { writes.push(r.path); if (o && o.merge && store.has(r.path)) merge(store.get(r.path), d); else store.set(r.path, merge({}, d)); },
  updateDoc: async (r, ...a) => { if (!store.has(r.path)) throw Object.assign(new Error('not found'), { code: 'not-found' }); writes.push(r.path); for (let i = 0; i < a.length; i += 2) setPath(store.get(r.path), a[i], a[i + 1]); },
  deleteDoc: async r => { writes.push('del:' + r.path); store.delete(r.path); },
  deleteField: () => DEL,
  Timestamp: { fromMillis: ms => ({ ms }) }
};
const fakeFB = uid => ({ F, fs: {}, A: {}, auth: { currentUser: uid ? { uid } : null } });
async function open({ uid, team, copyUid, idb, fetchMap }) {
  const d = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), { url: 'http://127.0.0.1:9/index.html?plan=' + encodeURIComponent(K), runScripts: 'outside-only', virtualConsole: (() => { const v = new VirtualConsole(); if (process.env.DBG) v.on('error', e => console.log('CE', String(e && e.stack || e).slice(0, 300))); return v; })(),
    beforeParse(v) { v.localStorage.setItem('lanenote.plans.v1', JSON.stringify({ at: 1, uid: copyUid != null ? copyUid : (uid || ''), team: team || '', list: [PL] })); v.HTMLElement.prototype.scrollIntoView = function () {}; } });
  await delay(30); const w = d.window;
  Object.assign(w, { TextEncoder, TextDecoder, Response, File, Blob, __pdfjs: pdfjs }); w.indexedDB = idb; w.scrollTo = () => {};
  w.__confirms = []; w.confirm = m => { w.__confirms.push(m); return true; }; w.alert = () => {};
  w.fetch = async u => { const m = /[?&]url=([^&]+)/.exec(String(u)); const t = m && fetchMap && fetchMap[decodeURIComponent(m[1])]; if (!t) return new Response('x', { status: 404 }); return new Response(fs.readFileSync(t), { status: 200, headers: { 'content-type': 'application/pdf' } }); };
  for (const s of scripts) { try { w.eval(fix(s)); } catch (e) { } }
  if (uid !== undefined && uid !== null) w.__meetApp.setFB(fakeFB(uid));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay(400);
  return w;
}
const file = (w, f, name, extra) => { let b = fs.readFileSync(path.join(FIX, f)); if (extra) b = Buffer.concat([b, Buffer.from('\n%' + 'x'.repeat(extra) + '\n')]); return new File([b], name, { type: 'application/pdf' }); };
const bar = w => (w.document.getElementById('prepBar') || {}).textContent || '';
const idbA = new IDBFactory(), idbB = new IDBFactory();
const pdfKeys = () => [...store.keys()].filter(k => k.includes('/pdf/')).sort();
// v0.26.40 C505：かけらは版ごとのID（種類_版ID_番号）。大会の印の v から探す
const chunkOf = (k, i) => { const m = store.get('teams/T1/meets/' + K); const d = m && m.prep && m.prep.docs[k]; return d && d.v ? store.get('teams/T1/meets/' + K + '/pdf/' + k + '_' + d.v + '_' + i) : undefined; };
const noChunk = k => !pdfKeys().some(x => x.startsWith('teams/T1/meets/' + K + '/pdf/' + k + '_'));
const EXP = Date.parse('2026-10-25T00:00:00+09:00') + 31 * 864e5;
let w1;
await check('チームで開く：保存先の説明（チームで共有・大会終了の1か月後から使えなくなる）と、4種類の待ち', async () => {
  w1 = await open({ uid: 'uA', team: 'T1', idb: idbA });
  const p = w1.__meetApp.prep(); assert.deepEqual([p.key, p.owner.uid, p.owner.team], [K, 'uA', 'T1']);
  const t = bar(w1); assert(/チーム（顧問・マネージャー）で共有/.test(t) && /大会終了の1か月後から[^。]*(使え|読め)なくな/.test(t) && /要項 待ち/.test(t) && /スタートリスト 待ち/.test(t) && /タイムテーブル 待ち/.test(t), t);
});
await check('ファイルで入れた要項：チームのクラウド（meets/{大会}/pdf）に保存・期限は大会終了の1か月後・大会の印に名前と数', async () => {
  await w1.__meetApp.handleFile('yoko', file(w1, 'f5_note_fee500.pdf', '架空要項.pdf')); await delay(200);
  const c = chunkOf('yoko', 0); assert(c, [...store.keys()].join(','));
  assert.deepEqual([c.kind, c.i, c.by, c.name, c.exp.ms], ['yoko', 0, 'uA', '架空要項.pdf', EXP]);
  const m = store.get('teams/T1/meets/' + K).prep; assert.equal(m.docs.yoko.n, 1); assert.equal(m.docs.yoko.exp, EXP); assert(!m.docs.yoko.url);
  assert(/要項 ✓/.test(bar(w1)));
});
await check('スタートリスト：最初の保存で「ほかの学校の選手名」「チームのメンバーだけ」「大会終了の1か月後から使えなくなる」を確かめる（2回目は聞かない）', async () => {
  await w1.__meetApp.handleFile('sl', file(w1, 'f3_sl_heats.pdf', '架空SL.pdf')); await delay(200);
  assert.equal(w1.__confirms.length, 1); const m = w1.__confirms[0]; assert(/ほかの学校の選手の名前/.test(m) && /チームのメンバー（顧問・マネージャー）だけ/.test(m) && /大会終了の1か月後から[^。]*(使え|読め)なくな/.test(m), m);
  assert(chunkOf('sl', 0));
  await w1.__meetApp.handleFile('sl', file(w1, 'f3_sl_heats.pdf', '架空SL2.pdf')); await delay(200); assert.equal(w1.__confirms.length, 1);
});
await check('URLから読んだもの：URLだけ（中身は保存しない）', async () => {
  const f = file(w1, 'f3_tt_all.pdf', 'tt.pdf'); f.srcUrl = 'https://kaku.example/meet/tt.pdf';
  await w1.__meetApp.handleFile('tt', f); await delay(200);
  assert(noChunk('tt')); assert.equal(store.get('teams/T1/meets/' + K).prep.docs.tt.url, 'https://kaku.example/meet/tt.pdf');
});
await check('5MBより大きいファイル：この端末だけ・「URLから読み込む」をすすめる', async () => {
  await w1.__meetApp.handleFile('note', file(w1, 'f6_note_track60.pdf', '大きい注意事項.pdf', 5.3 * 1048576)); await delay(300);
  assert(noChunk('note')); assert.equal(store.get('teams/T1/meets/' + K).prep.docs.note.here, 1);
  assert(/5MBより大きい/.test(bar(w1)) && /URLから読み込む/.test(bar(w1)));
});
await check('この端末にも控える（IndexedDB・アカウントとチームの組ごと）・大会予定のバッジ用の印（名前だけ）', async () => {
  await delay(400);
  const ix = JSON.parse(w1.localStorage.getItem('lanenote.prep.idx.v1')); assert.deepEqual(Object.keys(ix['uA|T1'][K].kinds).sort(), ['note', 'sl', 'tt', 'yoko']);
  assert(!/架空/.test(JSON.stringify(ix).replace(K, '')), '印に中身が入っている');
});
await check('A01：途中でアカウントが変わったら、もう保存しない', async () => {
  w1.__meetApp.setFB(fakeFB('uB')); const n = writes.length;
  await w1.__meetApp.handleFile('yoko', file(w1, 'f5_note_fee500.pdf', '別の要項.pdf')); await delay(200);
  assert.equal(writes.length, n); w1.__meetApp.setFB(fakeFB('uA'));
});
let w2;
await check('別のPC（この端末の控えなし）：クラウドから続きを戻す（ファイルは読み直し・URLは取り直し・大きいものは出さない）', async () => {
  w2 = await open({ uid: 'uA', team: 'T1', idb: idbB, fetchMap: { 'https://kaku.example/meet/tt.pdf': path.join(FIX, 'f3_tt_all.pdf') } }); await delay(1500);
  const d = w2.document; assert(/架空要項\.pdf/.test(d.getElementById('yokoStatus').textContent), d.getElementById('yokoStatus').textContent);
  assert(/架空SL2\.pdf/.test(d.getElementById('slStatus').textContent)); assert(/✔/.test(d.getElementById('ttStatus').textContent), d.getElementById('ttStatus').textContent);
  const t = bar(w2); assert(/続きから/.test(t) && /要項 ✓/.test(t) && /スタートリスト ✓/.test(t) && /タイムテーブル ✓/.test(t), t);
});
await check('同じPC：この端末の控えから戻す（通信なしでも）', async () => {
  const w = await open({ uid: 'uA', team: 'T1', idb: idbA }); await delay(600);
  assert(/続きから/.test(bar(w))); assert(/✔/.test(w.document.getElementById('slStatus').textContent));
});
await check('A01：ほかのアカウントでは、前の人の保存（この端末・クラウド）を出さない', async () => {
  const w = await open({ uid: 'uB', copyUid: 'uA', team: 'T1', idb: idbA }); await delay(600);
  const p = w.__meetApp.prep(); assert.deepEqual([p.owner.uid, p.owner.team], ['uB', '']);
  assert(!/続きから/.test(bar(w)) && /要項 待ち/.test(bar(w))); assert(!/✔/.test(w.document.getElementById('slStatus').textContent));
});
await check('ログインなし：この端末だけに保存（クラウドには書かない）・説明', async () => {
  const n = writes.length, w = await open({ uid: null, idb: new IDBFactory() });
  assert(/この端末にだけ保存します/.test(bar(w)) && /大会終了の1か月後から[^。]*(使え|読め)なくな/.test(bar(w)));
  await w.__meetApp.handleFile('yoko', file(w, 'f5_note_fee500.pdf', '架空要項.pdf')); await delay(500);
  assert.equal(writes.length, n); assert(JSON.parse(w.localStorage.getItem('lanenote.prep.idx.v1'))['|'][K].kinds.yoko);
});
await check('保存を消す：クラウドのPDF・大会の印の prep・この端末の控えを消す（画面はそのまま）', async () => {
  w2.document.getElementById('prepErase').click(); await delay(500);
  assert.deepEqual(pdfKeys(), []); assert(!('prep' in store.get('teams/T1/meets/' + K)));
  assert(!JSON.parse(w2.localStorage.getItem('lanenote.prep.idx.v1'))['uA|T1'][K]); assert(/保存を消しました/.test(bar(w2)));
  assert(/架空要項\.pdf/.test(w2.document.getElementById('yokoStatus').textContent));
});
await check('新しい大会を始める（全消去）：保存は消さずに、この大会への保存をやめる（確認の文にも書く）', async () => {
  w1.__meetApp.resetAll(); await delay(100);
  assert(/保存した準備は消えません/.test(w1.__confirms[w1.__confirms.length - 1])); assert.equal(w1.__meetApp.prep(), null); assert(!w1.document.getElementById('prepBar'));
});
await check('文言：「PDF本文はサーバーへ送りません」は無くし、正しい説明に', () => {
  for (const f of ['index.html', 'guide.html', 'records.html', 'schedule.html']) assert(!/PDF本文はサーバーへ送りません|PDF本文はどこにも送りません/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
  assert(/大会終了の1か月後から[^。]*(使え|読め)なくな/.test(html)); assert(/大会終了の1か月後から[^。]*(使え|読め)なくな/.test(fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8')));
});
console.log(`v02633_prep_save: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);
