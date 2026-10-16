// v0.26.65 みんなの要項の登録の状態の1行（大会予定から開いた大会・チームの顧問・登録をやめていない人だけ）。架空データ・本番に接続しない
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), FIX = path.join(here, 'fixtures');
const P = createRequire(import.meta.url)('../src/pubmeets.js');
const delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const store = new Map(), clone = v => JSON.parse(JSON.stringify(v)), DEL = { __del: 1 }; let NOW = Date.now();
const TS = ms => ({ ms, toMillis: () => ms, toDate: () => new Date(ms) });
const val = v => v && v.__sts ? TS(NOW) : v;
const setPath = (o, p, v) => { const a = p.split('.'); let x = o; for (let i = 0; i < a.length - 1; i++) x = x[a[i]] = x[a[i]] || {}; if (v === DEL) delete x[a[a.length - 1]]; else x[a[a.length - 1]] = v; };
const fix = o => { const r = {}; for (const k of Object.keys(o)) r[k] = val(o[k]); return r; };
const F = {
  doc: (fs_, ...a) => ({ path: a.join('/') }), collection: (fs_, ...a) => ({ path: a.join('/') }),
  where: (f, op, v) => ({ f, op, v }), /* v0.26.39 exp > の条件も見る */ limit: n => ({ n }), query: (c, ...q) => ({ c, q }),
  getDocs: async q => { const pre = q.c.path + '/'; const out = [...store.entries()].filter(([k, v]) => k.startsWith(pre) && !k.slice(pre.length).includes('/') && q.q.every(x => !x.f || (x.op === '>' ? (v[x.f] && v[x.f].toMillis ? v[x.f].toMillis() : v[x.f]) > x.v.toMillis() : v[x.f] === x.v))); return { forEach: f => out.forEach(([k, v]) => f({ id: k.slice(pre.length), data: () => v })) }; },
  getDoc: async r => { const v = store.get(r.path); return { exists: () => !!v, data: () => v }; },
  setDoc: async (r, d, o) => { store.set(r.path, Object.assign(o && o.merge && store.get(r.path) || {}, fix(d))); },
  updateDoc: async (r, ...a) => { if (!store.has(r.path)) throw Object.assign(new Error('nf'), { code: 'not-found' }); if (typeof a[0] === 'object') Object.assign(store.get(r.path), fix(a[0])); else for (let i = 0; i < a.length; i += 2) setPath(store.get(r.path), a[i], a[i + 1]); },
  deleteDoc: async r => { store.delete(r.path); }, deleteField: () => DEL, serverTimestamp: () => ({ __sts: 1 }),
  Timestamp: { fromMillis: ms => TS(ms) },
  writeBatch: () => { const ops = []; return { set: (r, d) => ops.push(() => store.set(r.path, fix(d))), update: (r, d) => ops.push(() => Object.assign(store.get(r.path), fix(d))), commit: async () => ops.forEach(f => f()) }; }
};
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), scripts = html.match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/^<script>|<\/script>$/g, ''));
const NM = path.join(here, 'node_modules/pdfjs-dist/');
const fx = s => s.replace('var lib = await loadPdfjs();', 'var lib = window.__pdfjs;').replace("cMapUrl: PDFJS_BASE + 'cmaps/'", "cMapUrl: " + JSON.stringify(NM + 'cmaps/')).replace("standardFontDataUrl: PDFJS_BASE + 'standard_fonts/'", "standardFontDataUrl: " + JSON.stringify(NM + 'standard_fonts/'));
const YOKO = path.join(FIX, 'f5_note_fee500.pdf');
const FM = { 'https://www.kotorikkyo.info/m/3/yoko.pdf': YOKO, 'https://kaku.example/yoko.pdf': YOKO, 'https://www.kotorikkyo.info/m/3/yoko2.pdf': YOKO };
async function open({ uid, team, pl, answer = true }) {
  const K = pl.date + '|' + pl.meet;
  const d = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), { url: 'http://127.0.0.1:9/index.html?plan=' + encodeURIComponent(K), runScripts: 'outside-only', virtualConsole: (() => { const v = new VirtualConsole(); if (process.env.DBG) v.on('error', e => console.log('CE', String(e && e.stack || e).slice(0, 300))); return v; })(),
    beforeParse(v) { v.localStorage.setItem('lanenote.plans.v1', JSON.stringify({ at: 1, uid, team, list: [pl] })); v.HTMLElement.prototype.scrollIntoView = function () {}; } });
  await delay(30); const w = d.window;
  Object.assign(w, { TextEncoder, TextDecoder, Response, File, Blob, __pdfjs: pdfjs }); w.indexedDB = new IDBFactory(); w.scrollTo = () => {};
  w.__confirms = []; w.confirm = m => { w.__confirms.push(m); return typeof answer === 'function' ? answer(m) : answer; }; w.alert = () => {};
  w.__fetched = []; w.fetch = async u => { const m = /[?&]url=([^&]+)/.exec(String(u)); const url = m && decodeURIComponent(m[1]); w.__fetched.push(url); const t = url && FM[url]; if (!t) return new Response('x', { status: 404 }); return new Response(fs.readFileSync(t), { status: 200, headers: { 'content-type': 'application/pdf' } }); };
  for (const s of scripts) { try { w.eval(fx(s)); } catch (e) { } }
  w.__meetApp.setFB({ F, fs: {}, A: {}, auth: { currentUser: { uid } } });
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay(1200);
  return w;
}
const urlFile = (url) => { const f = new File([fs.readFileSync(YOKO)], 'yoko.pdf', { type: 'application/pdf' }); f.srcUrl = url; return f; };
const box = w => (w.document.getElementById('pubBox') || {}).textContent || '';
const PL = { date: '2026-11-03', end: '2026-11-03', meet: '第3回 架空区中学校陸上競技大会', venue: '架空競技場' };
const PL2 = { date: '2026-11-03', end: '2026-11-03', meet: '架空区 中学校陸上競技大会', venue: '架空競技場' };
const NONE = '📚 みんなの要項：この大会はまだ登録がありません。要項をURLから読むと、ほかの学校の先生も使えるように登録できます。';
const FILE = 'ファイルで入れた要項は登録されません（URLから読むと登録できます）';
const MINE = '📚 この大会の要項は、あなたが『みんなの要項』に登録済みです。';
const none = w => { const e = w.document.getElementById('pubNone'); return e ? { t: e.textContent, small: e.tagName === 'SMALL' && e.classList.contains('muted'), inBox: !!e.closest('#pubBox') } : null; };
const pubs = () => [...store.keys()].filter(k => /^pubMeets\/[^/]+$/.test(k));
store.set('teams/T1/members/uA', { role: 'coach' }); store.set('teams/T1/members/uM', { role: 'manager' }); store.set('teams/T2/members/uB', { role: 'coach' }); store.set('teams/T3/members/uO', { role: 'coach' }); store.set('users/uO/settings/pub', { on: false });
store.set('teams/T5/members/uE', { role: 'coach' });
const fileYoko = () => new File([fs.readFileSync(YOKO)], 'y.pdf', { type: 'application/pdf' });
console.log('[v0.26.65] みんなの要項：登録がないとき・ファイルのとき・登録済みのとき');
await check('文言：「分け合う」を使わない', async () => { for (const s of [NONE, FILE, MINE]) assert(!/分け合/.test(s)); assert(html.includes(NONE) && html.includes(FILE) && html.includes(MINE)); });
await check('チームの顧問・大会予定から開いた・登録0件：同じ箱に小さな灰色の1行（ファイルの注意は出さない）', async () => {
  const w = await open({ uid: 'uA', team: 'T1', pl: { date: '2026-11-08', meet: '架空市民記録会' } });
  const n = none(w); assert(n && n.t === NONE && n.small && n.inBox, JSON.stringify(n)); assert(!/ファイル/.test(box(w)));
});
await check('要項をファイルで入れた・登録0件：1行＋「ファイルで入れた要項は登録されません」（登録はしない）', async () => {
  const w = await open({ uid: 'uA', team: 'T1', pl: { date: '2026-11-09', meet: '架空秋季大会' } });
  await w.__meetApp.handleFile('yoko', fileYoko()); await delay(400);
  const n = none(w); assert(n && n.t === NONE + FILE && n.small, JSON.stringify(n)); assert(!pubs().some(k => k.startsWith('pubMeets/2026-11-09'))); assert(!w.__confirms.some(m => /みんなの要項/.test(m)));
});
await check('マネージャーには出さない', async () => { const w = await open({ uid: 'uM', team: 'T1', pl: { date: '2026-11-10', meet: '架空記録会A' } }); assert(!none(w), box(w)); });
await check('チームなし（個人）には出さない', async () => { const w = await open({ uid: 'uP', team: '', pl: { date: '2026-11-11', meet: '架空記録会B' } }); assert(!none(w), box(w)); });
await check('「これからは登録しない」にした顧問には出さない', async () => { const w = await open({ uid: 'uO', team: 'T3', pl: { date: '2026-11-12', meet: '架空記録会C' } }); assert(!none(w), box(w)); });
await check('検索の一部が失敗（incomplete）：「まだ登録がありません」とは言わない（再試行を出す）', async () => {
  const g = F.getDocs; F.getDocs = async q => { if (/^pubMeets/.test(q.c.path)) throw Object.assign(new Error('x'), { code: 'unavailable' }); return g(q); };
  try { const w = await open({ uid: 'uA', team: 'T1', pl: { date: '2026-11-13', meet: '架空記録会D' } }); assert(!none(w) && /もう一度さがす/.test(box(w)), box(w)); } finally { F.getDocs = g; }
});
await check('ほかの先生の登録があるときは今まで通り（「この要項を使う」・1行は出さない）', async () => {
  store.set('pubMeets/2026-11-14_bbbbbbbb', { name: '架空記録会E', key: P.normName('架空記録会E'), date: '2026-11-14', end: '2026-11-14', venue: '', url: 'https://kaku.example/yoko.pdf', host: 'kaku.example', info: '{}', by: 'uX', at: TS(NOW), exp: TS(NOW + 864e8), ver: 1, rep: 0, hid: false });
  const w = await open({ uid: 'uA', team: 'T1', pl: { date: '2026-11-14', meet: '架空記録会E' } });
  assert(!none(w) && /ほかの学校の先生が登録した/.test(box(w)) && /この要項を使う/.test(box(w)), box(w));
});
await check('URLから読んで登録 → 開き直すと「あなたが『みんなの要項』に登録済みです」（取り消しボタンつき）', async () => {
  const pl = { date: '2026-11-15', end: '2026-11-15', meet: '架空区秋季陸上競技大会', venue: '架空競技場' };
  const w = await open({ uid: 'uA', team: 'T1', pl }); await w.__meetApp.handleFile('yoko', urlFile('https://www.kotorikkyo.info/m/3/yoko.pdf')); await delay(400);
  assert(pubs().some(k => k.startsWith('pubMeets/2026-11-15')), '登録されていない ' + box(w)); assert(/登録しました/.test(box(w)), box(w));
  const w2 = await open({ uid: 'uA', team: 'T1', pl }); await delay(800);
  assert(w2.__meetApp.prep().docs.yoko && w2.__meetApp.prep().docs.yoko.url, '要項が戻っていない');
  const t = box(w2); assert(t.startsWith(MINE) && /登録を取り消す/.test(t) && !/ほかの学校の先生が登録した/.test(t) && !/この要項を使う/.test(t), t);
});
await check('要項がまだない端末でも、自分の登録だけなら見出しは「登録済み」（「この要項を使う」は残す）', async () => {
  store.set('pubMeets/2026-11-16_cccccccc', { name: '架空記録会F', key: P.normName('架空記録会F'), date: '2026-11-16', end: '2026-11-16', venue: '', url: 'https://kaku.example/yoko.pdf', host: 'kaku.example', info: '{}', by: 'uE', at: TS(NOW), exp: TS(NOW + 864e8), ver: 1, rep: 0, hid: false });
  const w = await open({ uid: 'uE', team: 'T5', pl: { date: '2026-11-16', meet: '架空記録会F' } });
  const t = box(w); assert(t.startsWith(MINE) && /この要項を使う/.test(t) && /登録を取り消す/.test(t) && !/ほかの学校の先生/.test(t), t);
});
console.log(`v02665_pubnote: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);
