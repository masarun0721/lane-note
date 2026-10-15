// v0.26.42 Astra 第6回 C601：大会準備のタブの一時保存（sessionStorage）を、持ち主・チーム・期限を確かめてから戻す（Astra の再現 tests/independent_session.mjs C601 をもとにした回帰テスト。架空データ・本番に接続しない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), FIX = path.join(here, 'fixtures');
const delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.42] C601 一時保存の持ち主の確認');
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
async function open({ uid, team, copyUid, idb, fetchMap, preIdx, plain, session }) {
  const d = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), { url: 'http://127.0.0.1:9/index.html' + (plain ? '' : '?plan=' + encodeURIComponent(K)), runScripts: 'outside-only', virtualConsole: (() => { const v = new VirtualConsole(); if (process.env.DBG) v.on('error', e => console.log('CE', String(e && e.stack || e).slice(0, 300))); return v; })(),
    beforeParse(v) { v.localStorage.setItem('lanenote.plans.v1', JSON.stringify({ at: 1, uid: copyUid != null ? copyUid : (uid || ''), team: team || '', list: [PL, PL2] })); v.HTMLElement.prototype.scrollIntoView = function () {}; if (preIdx) v.localStorage.setItem('lanenote.prep.idx.v1', preIdx); if (session) v.sessionStorage.setItem('lanenote-meet-session', session); } });
  await delay(30); const w = d.window;
  Object.assign(w, { TextEncoder, TextDecoder, Response, File, Blob, __pdfjs: pdfjs }); w.indexedDB = idb; w.scrollTo = () => {}; if (!(w.crypto && w.crypto.subtle)) Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });   // 本物のブラウザと同じく SHA-256 を使えるようにする
  w.__confirms = []; w.confirm = m => { w.__confirms.push(m); return true; }; w.alert = () => {};
  w.fetch = async u => { const m = /[?&]url=([^&]+)/.exec(String(u)); const t = m && fetchMap && fetchMap[decodeURIComponent(m[1])]; if (!t) return new Response('x', { status: 404 }); return new Response(fs.readFileSync(t), { status: 200, headers: { 'content-type': 'application/pdf' } }); };
  for (const s of scripts) { try { w.eval(fix(s)); } catch (e) { } }
  if (uid !== undefined && uid !== null) w.__meetApp.setFB(fakeFB(uid));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay(400);
  return w;
}


const file = (w, f, name) => new File([fs.readFileSync(path.join(FIX, f))], name, { type: 'application/pdf' });
const SKEY = 'lanenote-meet-session';
async function makeSession(uid, team) {   // A がチームの大会準備でスタートリストを読み込み、一時保存ができる
  const w = await open({ uid, team, idb: new IDBFactory() });
  await w.__meetApp.handleFile('sl', file(w, 'f3_sl_heats.pdf', '架空A部の名簿.pdf')); await delay(650);
  const s = w.sessionStorage.getItem(SKEY); w.close(); return s;
}
let sessA;
await check('一時保存に持ち主（uid・チーム・大会準備のキー）と期限が入る', async () => {
  sessA = await makeSession('auditA', 'auditTeamA'); assert(sessA, '一時保存がない');
  const o = JSON.parse(sessA); assert(o.st.sl && o.st.sl.entries.length > 0);
  assert.deepEqual([o.own.uid, o.own.team, o.own.plan], ['auditA', 'auditTeamA', K]); assert(o.own.exp > Date.now() && o.own.exp <= Date.now() + 24 * 36e5 + 1000);
});
await check('C601 再現：同じタブで、B のアカウントが ?plan= なしの大会準備を開いても、A の名簿は出さず、一時保存も消す', async () => {
  hook.getFail = p => p.startsWith('teams/');   // B は A のチームを読めない
  try {
    const w2 = await open({ uid: 'auditB', team: 'auditTeamB', plain: true, session: sessA, idb: new IDBFactory() });
    w2.__meetApp.setFB(fakeFB('auditB')); await delay(300);
    const st = w2.__meetApp.state; assert.notEqual(st.slName, '架空A部の名簿.pdf'); assert(!st.sl || !st.sl.entries || !st.sl.entries.length, 'A の名簿が戻った');
    assert.equal(w2.__meetApp.prep(), null); assert.equal(w2.sessionStorage.getItem(SKEY), null, '一時保存が残った');
    assert(w2.document.getElementById('ssNote').hidden);
  } finally { hook.getFail = null; }
});
await check('同じ人（A・同じチーム・期限内・チームの印を読める）なら、これまでどおり戻す（帯に名前）', async () => {
  const w = await open({ uid: 'auditA', team: 'auditTeamA', plain: true, session: sessA, idb: new IDBFactory() }); await delay(300);
  assert.equal(w.__meetApp.state.slName, '架空A部の名簿.pdf'); assert.equal(w.document.getElementById('ssNote').hidden, false);
});
await check('A でもチームから外れていたら（permission-denied）戻さず、一時保存とこの端末の控えを消す', async () => {
  hook.getFail = p => p.startsWith('teams/auditTeamA/');
  try {
    const w = await open({ uid: 'auditA', team: 'auditTeamA', plain: true, session: sessA, idb: new IDBFactory(), preIdx: JSON.stringify({ 'auditA|auditTeamA': { [K]: { kinds: { sl: 1 } } } }) }); await delay(300);
    assert.notEqual(w.__meetApp.state.slName, '架空A部の名簿.pdf'); assert.equal(w.sessionStorage.getItem(SKEY), null);
    assert(!JSON.parse(w.localStorage.getItem('lanenote.prep.idx.v1') || '{}')['auditA|auditTeamA']);
  } finally { hook.getFail = null; }
});
await check('A でも、通信できないだけ（unavailable）なら戻す（C506 と同じ区別）', async () => {
  const G0 = F.getDoc; F.getDoc = async r => { if (r.path.startsWith('teams/')) throw Object.assign(new Error('offline'), { code: 'unavailable' }); return G0(r); };
  try { const w = await open({ uid: 'auditA', team: 'auditTeamA', plain: true, session: sessA, idb: new IDBFactory() }); await delay(300); assert.equal(w.__meetApp.state.slName, '架空A部の名簿.pdf'); }
  finally { F.getDoc = G0; }
});
await check('持ち主のない古い形の一時保存は戻さずに消す', async () => {
  const o = JSON.parse(sessA); delete o.own;
  const w = await open({ uid: 'auditA', team: 'auditTeamA', plain: true, session: JSON.stringify(o), idb: new IDBFactory() }); await delay(300);
  assert.notEqual(w.__meetApp.state.slName, '架空A部の名簿.pdf'); assert.equal(w.sessionStorage.getItem(SKEY), null);
});
await check('期限（exp）が過ぎた一時保存は戻さずに消す', async () => {
  const o = JSON.parse(sessA); o.own.exp = Date.now() - 1000;
  const w = await open({ uid: 'auditA', team: 'auditTeamA', plain: true, session: JSON.stringify(o), idb: new IDBFactory() }); await delay(300);
  assert.notEqual(w.__meetApp.state.slName, '架空A部の名簿.pdf'); assert.equal(w.sessionStorage.getItem(SKEY), null);
});
await check('ログインなしで作った一時保存（anon）は、ログインしていないときだけ戻す（ログイン中の B には出さない）', async () => {
  const o = JSON.parse(sessA); o.own = { uid: 'anon', team: '', plan: '', exp: Date.now() + 36e5 }; const s = JSON.stringify(o);
  const wb = await open({ uid: 'auditB', team: '', plain: true, session: s, idb: new IDBFactory() }); await delay(300);
  assert.notEqual(wb.__meetApp.state.slName, '架空A部の名簿.pdf');
  const wn = await open({ uid: null, plain: true, session: s, idb: new IDBFactory() }); await delay(300);
  assert.equal(wn.__meetApp.state.slName, '架空A部の名簿.pdf');
});
await check('ログアウト・別のアカウントへの切り替えで一時保存を消す（大会準備のページ）', async () => {
  const w = await open({ uid: 'auditA', team: 'auditTeamA', plain: true, session: sessA, idb: new IDBFactory() }); await delay(300);
  w.__meetApp.onShareAuth({ uid: 'auditA' }); assert(w.sessionStorage.getItem(SKEY));   // 最初の通知（同じ人）では消さない
  w.__meetApp.onShareAuth(null); await delay(50); assert.equal(w.sessionStorage.getItem(SKEY), null);
});
await check('ほかのページ：共通のログアウト（LaneAuth.signOutAndWipe）と記録ページのアカウント変更でも消す', async () => {
  const d = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1:9/records.html', runScripts: 'outside-only' }), w = d.window;
  w.sessionStorage.setItem(SKEY, sessA); w.eval(fs.readFileSync(path.join(ROOT, 'source/src/auth_common.js'), 'utf8') + '\nwindow.__LA = LaneAuth;');
  const r = await w.__LA.signOutAndWipe({ A: { signOut: async () => {} }, auth: {} }, 'auditA'); assert(r.signedOut); assert.equal(w.sessionStorage.getItem(SKEY), null);
  assert.match(fs.readFileSync(path.join(ROOT, 'source/src/records_app.js'), 'utf8'), /if \(prev && prev !== \(USER \? USER\.uid : null\) && window\.LaneAuth && LaneAuth\.clearMeetSession\) LaneAuth\.clearMeetSession\(\);/);
});
console.log('v02642_c601_session: ' + pass + ' ok / ' + fail + ' NG'); process.exit(fail ? 1 : 0);
