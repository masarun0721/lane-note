// v0.26.43 Astra 第6回 C605（同時に保存し直されたときの読み取り）・C602（保存を消す：一部未削除）・C604（みんなの要項：検索の一部失敗）の回帰テスト。Astra の再現テストを、安全な結果を期待する形にしたもの（架空データだけ・本番に接続しない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), FIX = path.join(ROOT, 'source/test/fixtures');
const delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.43] C605・C602（保存を消す）・C604（みんなの要項）');
const K = '2026-10-24|架空新人大会', PL = { date: '2026-10-24', end: '2026-10-25', meet: '架空新人大会', venue: '架空競技場' };
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = html.match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/^<script>|<\/script>$/g, ''));
const NM = path.join(here, 'node_modules/pdfjs-dist/');
const fix = s => s.replace('handleFile: handleFile, prep:', 'onShareAuth: onShareAuth, prepDocDone: prepDocDone, pubShow: pubShow, prep:') .replace('var lib = await loadPdfjs();', 'var lib = window.__pdfjs;').replace("cMapUrl: PDFJS_BASE + 'cmaps/'", "cMapUrl: " + JSON.stringify(NM + 'cmaps/')).replace("standardFontDataUrl: PDFJS_BASE + 'standard_fonts/'", "standardFontDataUrl: " + JSON.stringify(NM + 'standard_fonts/'));
// にせの Firestore（メモリの中だけ）
const store = new Map(), DEL = { __del: 1 }, clone = v => JSON.parse(JSON.stringify(v));
const merge = (a, b) => { for (const k of Object.keys(b)) { if (b[k] === DEL) delete a[k]; else if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k] && typeof b[k] === 'object' ? clone(b[k]) : b[k]; } return a; };
const setPath = (o, p, v) => { const a = p.split('.'); let x = o; for (let i = 0; i < a.length - 1; i++) x = x[a[i]] = x[a[i]] || {}; if (v === DEL) delete x[a[a.length - 1]]; else x[a[a.length - 1]] = v && typeof v === 'object' ? clone(v) : v; };
const writes = []; let denyRead = false, failChunk = false, readGate = null, missingPdfDenied = false, revokeOnChunk = false, failDel = null;
const F = {
  doc: (fs_, ...a) => ({ path: a.join('/') }),
  getDoc: async r => { if(denyRead && r.path.startsWith('teams/')) throw Object.assign(new Error('revoked'),{code:'permission-denied'}); let v = store.get(r.path); if(readGate && !readGate.used && r.path===readGate.path){v=clone(v);readGate.used=true;readGate.enter();await readGate.promise;} if(revokeOnChunk && r.path.includes('/pdf/')){denyRead=true;throw Object.assign(new Error('revoked'),{code:'permission-denied'});} if(missingPdfDenied && r.path.includes('/pdf/') && !v)throw Object.assign(new Error('missing document fails resource-based read rule'),{code:'permission-denied'}); return { exists: () => !!v, data: () => v && clone(v) }; },
  setDoc: async (r, d, o) => { if(failChunk && r.path.endsWith('/pdf/yoko_1')) throw Object.assign(new Error('simulated connection loss'),{code:'unavailable'}); writes.push(r.path); if (o && o.merge && store.has(r.path)) merge(store.get(r.path), d); else store.set(r.path, merge({}, d)); },
  updateDoc: async (r, ...a) => { if (!store.has(r.path)) throw Object.assign(new Error('not found'), { code: 'not-found' }); writes.push(r.path); for (let i = 0; i < a.length; i += 2) setPath(store.get(r.path), a[i], a[i + 1]); },
  deleteDoc: async r => { if(failDel && failDel(r.path)) throw Object.assign(new Error('injected delete failure'),{code:'resource-exhausted'}); writes.push('del:' + r.path); store.delete(r.path); },
  deleteField: () => DEL,
  Timestamp: { fromMillis: ms => ({ ms }) }
};
const fakeFB = uid => ({ F, fs: {}, A: {}, auth: { currentUser: uid ? { uid } : null } });
async function open({ uid, team, copyUid, idb, fetchMap, plain, session }) {
  const d = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), { url: 'http://127.0.0.1:9/index.html' + (plain ? '' : '?plan=' + encodeURIComponent(K)), runScripts: 'outside-only', virtualConsole: (() => { const v = new VirtualConsole(); if (process.env.DBG) v.on('error', e => console.log('CE', String(e && e.stack || e).slice(0, 300))); return v; })(),
    beforeParse(v) { if(session) v.sessionStorage.setItem('lanenote-meet-session',session); v.localStorage.setItem('lanenote.plans.v1', JSON.stringify({ at: 1, uid: copyUid != null ? copyUid : (uid || ''), team: team || '', list: [PL, {date:'2026-11-08',end:'2026-11-08',meet:'架空B大会'}] })); v.HTMLElement.prototype.scrollIntoView = function () {}; } });
  await delay(30); const w = d.window;
  Object.assign(w, { TextEncoder, TextDecoder, Response, File, Blob, __pdfjs: pdfjs }); w.indexedDB = idb; w.scrollTo = () => {};
  w.__confirms = []; w.confirm = m => { w.__confirms.push(m); return true; }; w.alert = () => {};
  w.fetch = async u => { const m = /[?&]url=([^&]+)/.exec(String(u)); const t = m && fetchMap && fetchMap[decodeURIComponent(m[1])]; if (!t) return new Response('x', { status: 404 }); return new Response(fs.readFileSync(t), { status: 200, headers: { 'content-type': 'application/pdf' } }); };
  for (const s of scripts) { const tag=w.document.createElement('script');w.document.body.appendChild(tag);Object.defineProperty(w.document,'currentScript',{value:tag,configurable:true});try { w.eval(fix(s)); } catch (e) { console.log('SCRIPT LOAD ERROR', e.message); throw e; } finally{tag.remove();} }
  if (uid !== undefined && uid !== null) w.__meetApp.setFB(fakeFB(uid));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay(400);
  return w;
}
const file = (w, f, name, extra) => { let b = fs.readFileSync(path.join(FIX, f)); if (extra) b = Buffer.concat([b, Buffer.from('\n%' + 'x'.repeat(extra) + '\n')]); return new File([b], name, { type: 'application/pdf' }); };
const bar = w => (w.document.getElementById('prepBar') || {}).textContent || '';
const idbA = new IDBFactory(), idbB = new IDBFactory();
const pdfKeys = () => [...store.keys()].filter(k => k.includes('/pdf/')).sort();
const EXP = Date.parse('2026-10-25T00:00:00+09:00') + 31 * 864e5;
const windows=[]; const openW=async o=>{const w=await open(o);windows.push(w);return w};


await check('C605: 読んでいる途中でほかの画面が保存し直しても「権限なし」にせず、新しい版を読み直す', async () => {
 const w=await openW({uid:'auditConcurrent',team:'Tconcurrent',idb:new IDBFactory()});
 await w.__meetApp.handleFile('yoko',file(w,'f5_note_fee500.pdf','old.pdf'));
 let release,enter;const started=new Promise(r=>enter=r),promise=new Promise(r=>release=r);
 readGate={path:'teams/Tconcurrent/meets/'+K,promise,enter};
 const reading=openW({uid:'auditConcurrent',team:'Tconcurrent',idb:new IDBFactory()});await started;
 await w.__meetApp.handleFile('yoko',file(w,'f6_note_track60.pdf','new.pdf'));
 assert.equal(store.get(readGate.path).prep.docs.yoko.name,'new.pdf');
 missingPdfDenied=true;release();const w2=await reading;await delay(300);missingPdfDenied=false;readGate=null;
 assert.notEqual(w2.__meetApp.prep(),null,'控えを消さない');assert.doesNotMatch(bar(w2),/権限がありません/);
 assert.equal(w2.__meetApp.prep().docs.yoko && w2.__meetApp.prep().docs.yoko.name,'new.pdf','新しい版を読み直す');
});
await check('C605: 版が同じなのにかけらが読めない（権限なし）ときは「更新されました。再読み込みしてください」で、消さない', async () => {
 const K3='teams/Tsame/meets/'+K;
 const w=await openW({uid:'auditSame',team:'Tsame',idb:new IDBFactory()});
 await w.__meetApp.handleFile('yoko',file(w,'f5_note_fee500.pdf','same.pdf'));await delay(200);
 const d=store.get(K3).prep.docs.yoko;assert(d&&d.v);
 store.delete(K3+'/pdf/yoko_'+d.v+'_0');
 missingPdfDenied=true;const w2=await openW({uid:'auditSame',team:'Tsame',idb:new IDBFactory()});await delay(300);missingPdfDenied=false;
 assert.notEqual(w2.__meetApp.prep(),null);assert.doesNotMatch(bar(w2),/権限がありません/);assert.match(bar(w2),/更新されました。再読み込みしてください/);
});
await check('C605: かけらも親も権限なし（本当に外された）ときは、これまでどおり控えを消して「権限がありません」', async () => {
 const w=await openW({uid:'auditRevoked',team:'Trevoked',idb:new IDBFactory()});
 await w.__meetApp.handleFile('yoko',file(w,'f5_note_fee500.pdf','rev.pdf'));await delay(200);
 revokeOnChunk=true;const w2=await openW({uid:'auditRevoked',team:'Trevoked',idb:new IDBFactory()});await delay(300);revokeOnChunk=false;denyRead=false;
 assert.equal(w2.__meetApp.prep(),null);assert.match(bar(w2)+w2.document.body.textContent,/権限がありません/);
});
await check('C602: 保存を消す：かけらを1つでも消せなければ「一部未削除」＋再試行。印（v・n）は残し、成功とは出さない', async () => {
 const P='teams/Terase/meets/'+K;
 const w=await openW({uid:'auditErase',team:'Terase',idb:new IDBFactory()});
 await w.__meetApp.handleFile('yoko',file(w,'f5_note_fee500.pdf','erase.pdf'));await delay(200);
 const d=store.get(P).prep.docs.yoko;assert(d&&d.v&&d.n>=1);const bad=P+'/pdf/yoko_'+d.v+'_0';assert(store.has(bad));
 failDel=p=>p===bad;
 w.document.getElementById('prepErase').click();await delay(300);
 assert.match(bar(w),/一部未削除/);assert.doesNotMatch(bar(w),/保存を消しました/);
 assert(store.has(bad));assert.equal(store.get(P).prep.docs.yoko.v,d.v,'印を残す');
 const rb=w.document.querySelector('[data-preperase]');assert(rb,'再試行のボタン');
 failDel=null;rb.click();await delay(300);
 assert.match(bar(w),/保存を消しました/);assert(!store.has(bad));assert(!(store.get(P).prep));
});
await check('C604: みんなの要項：0件でも検索の一部が失敗していたら「検索の一部を取得できませんでした」＋再試行', async () => {
 const w=await openW({uid:'auditPub',team:'Tpub',idb:new IDBFactory()});await delay(100);
 let n=0;const orig=w.LanePub.make;w.LanePub.make=()=>({search:async()=>{n++;return Object.assign([],{incomplete:true,reason:'failed-precondition',truncated:false});}});
 await w.__meetApp.pubSuggest(w.__meetApp.prep());
 const box=()=>(w.document.getElementById('pubBox')||{}).textContent||'';
 assert.match(box(),/検索の一部を取得できませんでした/);assert.doesNotMatch(box(),/まだだれも登録していません/);
 const before=n;w.document.querySelector('[data-pubretry]').click();await delay(100);assert.equal(n,before+1,'再試行で検索し直す');
 w.LanePub.make=orig;
});
for(const w of windows)w.close();
console.log(JSON.stringify({passed:pass,failed:fail}));if(fail)process.exitCode=1;
