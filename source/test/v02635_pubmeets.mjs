// v0.26.35 みんなの要項（架空データ・本番に接続しない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), FIX = path.join(here, 'fixtures');
const P = createRequire(import.meta.url)('../src/pubmeets.js');
const delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.35] みんなの要項');
// ---- しくみ（名前・日付・公式・自動の条件）
await check('大会名をそろえる：第n回・年度・西暦・空白・記号を落とす／似ている度合い', () => {
  assert.equal(P.normName('第75回 令和8年度 架空区（中学校）陸上競技大会'), P.normName('架空区中学校陸上競技大会'));
  assert.equal(P.normName('2026年度 架空区 中学校陸上競技大会'), P.normName('架空区中学校陸上競技大会'));
  assert(P.sim('架空区中学校陸上競技大会', '架空区 中学 陸上競技大会') >= 0.6); assert(P.sim('架空区中学校陸上競技大会', '見本市駅伝') < 0.3);
});
const E = (o) => Object.assign({ id: 'x', name: '架空区中学校陸上競技大会', date: '2026-11-03', url: 'https://www.kotorikkyo.info/y.pdf', host: 'www.kotorikkyo.info', rep: 0, hid: false, at: '2026-10-01T00:00:00Z', ver: 1 }, o);
await check('日付：同じ日、または大会の期間に入るものだけ・期限切れ／隠れたもの／URLがおかしいものは出さない', () => {
  const pl = { date: '2026-11-03', end: '2026-11-04', meet: '第3回 架空区中学校陸上競技大会' };
  assert.equal(P.match([E({}), E({ id: 'b', date: '2026-11-04' }), E({ id: 'c', date: '2026-11-10' })], pl).length, 2);
  assert.equal(P.match([E({ hid: true }), E({ rep: 3 }), E({ exp: Date.now() - 1 }), E({ url: 'javascript:alert(1)' }), E({ host: 'evil.example' })], pl).length, 0);
});
await check('自動で読むのは：公式のサイト・報告0件・よく似ている・候補が1つのときだけ', () => {
  const pl = { date: '2026-11-03', meet: '架空区中学校陸上競技大会' };
  assert(P.pickAuto(P.match([E({})], pl)));
  assert(!P.pickAuto(P.match([E({ url: 'https://kaku.example/y.pdf', host: 'kaku.example' })], pl)), '公式でない');
  assert(!P.pickAuto(P.match([E({ rep: 1 })], pl)), '報告あり');
  assert(!P.pickAuto(P.match([E({}), E({ id: 'b', url: 'https://www.jaaf.or.jp/y.pdf', host: 'www.jaaf.or.jp' })], pl)), '候補が2つ');
  assert(!P.pickAuto(P.match([E({ name: '架空区陸上競技大会 秋' })], pl)) || P.sim('架空区陸上競技大会 秋', pl.meet) >= 0.85);
  assert(P.official('www.jaaf.or.jp') && P.official('city.kaku.lg.jp') && !P.official('kotorikkyo.info.evil.example') && !P.official('kaku.example'));
});
await check('出典の表示：サイト・公式かどうか・登録日・差し替え回数・報告数', () => {
  assert.equal(P.srcText(E({ ver: 2, rep: 1 })), '出典：www.kotorikkyo.info（公式のサイト）・2026-10-01 にほかの先生が登録（差し替え1回）・報告 1件');
  assert(/公式かどうか未確認/.test(P.srcText(E({ host: 'kaku.example' }))));
});
await check('登録する中身：大会名・日付・会場・URL・公開の情報だけ（https 以外・社内のアドレスは不可）', () => {
  const e = P.entry({ date: '2026-11-03', meet: '架空大会', venue: '架空競技場' }, 'https://kaku.example/y.pdf', { rules: { call: '30分前' }, fees: { 一般: 500 } });
  assert.deepEqual(Object.keys(e).sort(), ['date', 'end', 'host', 'info', 'key', 'name', 'url', 'venue']);
  for (const u of ['http://kaku.example/y.pdf', 'https://localhost/y.pdf', 'https://192.168.1.2/y.pdf', 'javascript:x']) assert(!P.okUrl(u), u);
});
// ---- 画面（大会準備）：にせの Firestore
const store = new Map(), clone = v => JSON.parse(JSON.stringify(v)), DEL = { __del: 1 }; let NOW = Date.now();
const TS = ms => ({ ms, toMillis: () => ms, toDate: () => new Date(ms) });
const val = v => v && v.__sts ? TS(NOW) : v;
const setPath = (o, p, v) => { const a = p.split('.'); let x = o; for (let i = 0; i < a.length - 1; i++) x = x[a[i]] = x[a[i]] || {}; if (v === DEL) delete x[a[a.length - 1]]; else x[a[a.length - 1]] = v; };
const fix = o => { const r = {}; for (const k of Object.keys(o)) r[k] = val(o[k]); return r; };
const F = {
  doc: (fs_, ...a) => ({ path: a.join('/') }), collection: (fs_, ...a) => ({ path: a.join('/') }),
  where: (f, op, v) => ({ f, v }), limit: n => ({ n }), query: (c, ...q) => ({ c, q }),
  getDocs: async q => { const pre = q.c.path + '/'; const out = [...store.entries()].filter(([k, v]) => k.startsWith(pre) && !k.slice(pre.length).includes('/') && q.q.every(x => !x.f || v[x.f] === x.v)); return { forEach: f => out.forEach(([k, v]) => f({ id: k.slice(pre.length), data: () => v })) }; },
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
await check('大会準備のページのスクリプトに文法のまちがいがない', () => { scripts.forEach((x, i) => { try { new Function(x); } catch (e) { if (!/import|await/.test(e.message)) throw new Error('script ' + i + ': ' + e.message); } }); });
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
store.set('teams/T1/members/uA', { role: 'coach' }); store.set('teams/T1/members/uM', { role: 'manager' }); store.set('teams/T2/members/uB', { role: 'coach' }); store.set('teams/T3/members/uC', { role: 'coach' }); store.set('teams/T4/members/uD', { role: 'coach' });
const pubs = () => [...store.keys()].filter(k => /^pubMeets\/[^/]+$/.test(k));
await check('マネージャーは登録しない（顧問だけ）', async () => {
  const w = await open({ uid: 'uM', team: 'T1', pl: PL }); await w.__meetApp.handleFile('yoko', urlFile('https://www.kotorikkyo.info/m/3/yoko.pdf')); await delay(300);
  assert.equal(pubs().length, 0); assert(!w.__confirms.some(m => /みんなの要項/.test(m)));
});
let wA;
await check('顧問がURLから要項を読む：最初の1回だけ聞く → 登録（URLと大会の情報だけ・選手やPDFの中身なし）', async () => {
  wA = await open({ uid: 'uA', team: 'T1', pl: PL });
  await wA.__meetApp.handleFile('yoko', urlFile('https://www.kotorikkyo.info/m/3/yoko.pdf')); await delay(300);
  const ask = wA.__confirms.filter(m => /みんなの要項/.test(m)); assert.equal(ask.length, 1); assert(/選手の名前やPDFの中身は登録しません/.test(ask[0]) && /最初の1回だけ/.test(ask[0]), ask[0]);
  assert.equal(pubs().length, 1); const e = store.get(pubs()[0]);
  assert.deepEqual([e.url, e.host, e.by, e.rep, e.hid, e.ver, e.date, e.venue], ['https://www.kotorikkyo.info/m/3/yoko.pdf', 'www.kotorikkyo.info', 'uA', 0, false, 1, '2026-11-03', '架空競技場']);
  assert(!('data' in e) && JSON.parse(e.info).fees !== undefined); assert.equal(store.get('users/uA/settings/pub').on, true);
  assert.equal(store.get('pubQuota/uA').team, 'T1'); assert(/登録しました/.test(box(wA)), box(wA));
  await wA.__meetApp.handleFile('yoko', urlFile('https://www.kotorikkyo.info/m/3/yoko.pdf')); await delay(300);
  assert.equal(wA.__confirms.filter(m => /みんなの要項/.test(m)).length, 1, '2回目は聞かない'); assert(/もう「みんなの要項」にあります/.test(box(wA)));
});
await check('ファイルで入れた要項は登録しない', async () => {
  const w = await open({ uid: 'uD', team: 'T4', pl: { date: '2026-12-01', meet: '架空冬季記録会' } }); await w.__meetApp.handleFile('yoko', new File([fs.readFileSync(YOKO)], 'y.pdf', { type: 'application/pdf' })); await delay(300);
  assert(!pubs().some(k => k.startsWith('pubMeets/2026-12-01'))); assert(!w.__confirms.some(m => /みんなの要項/.test(m)));
});
await check('ほかの学校の先生：名前が少しちがっても同じ日なら見つかる・公式のサイトで報告0件 → 自動で読み込み・出典を出す', async () => {
  const w = await open({ uid: 'uB', team: 'T2', pl: PL2 }); await delay(800);
  assert(w.__fetched.includes('https://www.kotorikkyo.info/m/3/yoko.pdf'), w.__fetched.join(','));
  assert(w.__meetApp.prep().docs.yoko, '要項が読み込まれていない'); const t = box(w);
  assert(/自動で読み込みました/.test(t) && /出典：www\.kotorikkyo\.info（公式のサイト）/.test(t) && /報告/.test(t), t);
  assert.equal(store.get(pubs()[0]).ver, 1, '自分が読んだだけでは差し替えない');
});
await check('報告：顧問が「報告」→ 1件。報告ありは自動で読まず「この要項を使う」の1クリック', async () => {
  const w = await open({ uid: 'uC', team: 'T3', pl: PL2 }); await delay(800);
  w.document.querySelector('[data-pubrep]').click(); await delay(300);
  assert.equal(store.get(pubs()[0]).rep, 1); assert(store.get(pubs()[0] + '/reports/uC')); assert(/報告しました（1件目）/.test(box(w)), box(w));
  const w2 = await open({ uid: 'uD', team: 'T4', pl: PL2 }); await delay(800);
  assert(!w2.__meetApp.prep().docs.yoko, '自動で読んだ'); assert(/この要項を使う/.test(box(w2)) && /報告 1件/.test(box(w2)), box(w2));
  w2.document.querySelector('[data-pubuse]').click(); await delay(1200);
  assert(w2.__meetApp.prep().docs.yoko && /読み込みました/.test(box(w2)), box(w2));
});
await check('公式でないサイトの登録は自動で読まない（提案だけ）', async () => {
  store.set('pubMeets/2026-11-20_aaaaaaaa', { name: '架空秋季記録会', key: P.normName('架空秋季記録会'), date: '2026-11-20', end: '2026-11-20', venue: '', url: 'https://kaku.example/yoko.pdf', host: 'kaku.example', info: '{}', by: 'uX', at: TS(NOW), exp: TS(NOW + 864e8), ver: 1, rep: 0, hid: false });
  const w = await open({ uid: 'uD', team: 'T4', pl: { date: '2026-11-20', meet: '架空 秋季記録会' } }); await delay(800);
  assert(!w.__meetApp.prep().docs.yoko); assert(/公式かどうか未確認/.test(box(w)) && /この要項を使う/.test(box(w)), box(w));
});
await check('差し替え：ちがうURLの要項を読んだ顧問 → 確かめてから差し替え（版2）', async () => {
  const w = await open({ uid: 'uB', team: 'T2', pl: PL2, answer: m => true }); await delay(800); NOW += 60000;
  await w.__meetApp.handleFile('yoko', urlFile('https://www.kotorikkyo.info/m/3/yoko2.pdf')); await delay(400);
  assert(w.__confirms.some(m => /差し替えますか/.test(m)), w.__confirms.join('|'));
  const e = store.get(pubs()[0]); assert.deepEqual([e.url, e.ver, e.by, e.rep], ['https://www.kotorikkyo.info/m/3/yoko2.pdf', 2, 'uB', 1]);
});
await check('先生ごとにやめられる：「これからは登録しない」→ 次から登録しない', async () => {
  store.delete('pubQuota/uA');
  const w = await open({ uid: 'uA', team: 'T1', pl: { date: '2026-12-05', meet: '架空冬季大会' } });
  await w.__meetApp.handleFile('yoko', urlFile('https://www.kotorikkyo.info/m/3/yoko.pdf')); await delay(300);
  assert(pubs().some(k => k.startsWith('pubMeets/2026-12-05'))); w.document.querySelector('[data-pubpref="0"]').click(); await delay(100);
  assert.equal(store.get('users/uA/settings/pub').on, false);
  const w2 = await open({ uid: 'uA', team: 'T1', pl: { date: '2026-12-06', meet: '架空冬季大会2' } }); NOW += 60000;
  await w2.__meetApp.handleFile('yoko', urlFile('https://www.kotorikkyo.info/m/3/yoko.pdf')); await delay(300);
  assert(!pubs().some(k => k.startsWith('pubMeets/2026-12-06')));
});
await check('最初の質問で「キャンセル」→ 登録しない・その答えを覚える', async () => {
  const w = await open({ uid: 'uC', team: 'T3', pl: { date: '2026-12-10', meet: '架空駅伝' }, answer: m => !/みんなの要項/.test(m) });
  await w.__meetApp.handleFile('yoko', urlFile('https://kaku.example/yoko.pdf')); await delay(300);
  assert(!pubs().some(k => k.startsWith('pubMeets/2026-12-10'))); assert.equal(store.get('users/uC/settings/pub').on, false);
});
await check('回数の制限：30秒以内の2回目・1日20件をこえる登録は断る（画面に理由）', async () => {
  store.set('pubQuota/uD', { team: 'T4', at: TS(Date.now()), day: Math.floor(Date.now() / 864e5), n: 3 }); store.set('users/uD/settings/pub', { on: true });
  const w = await open({ uid: 'uD', team: 'T4', pl: { date: '2026-12-12', meet: '架空室内' } });
  await w.__meetApp.handleFile('yoko', urlFile('https://kaku.example/yoko.pdf')); await delay(300);
  assert(/30秒に1回/.test(box(w)), box(w));
  store.set('pubQuota/uD', { team: 'T4', at: TS(Date.now() - 864e5 / 2 > 0 ? Date.now() - 120000 : 0), day: Math.floor(Date.now() / 864e5), n: 20 });
  await w.__meetApp.handleFile('yoko', urlFile('https://kaku.example/yoko.pdf')); await delay(300);
  assert(/1日20件まで/.test(box(w)), box(w)); assert(!pubs().some(k => k.startsWith('pubMeets/2026-12-12')));
});
console.log(`v02635_pubmeets: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);
