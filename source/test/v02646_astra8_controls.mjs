// v0.26.46：Astra 第8回の対照テスト（C701・C702 の安全な動き3グループ）と、C802 の同意文の回帰（自動削除を約束しない）。架空データ・にせの Firestore だけ
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), FIX = path.join(ROOT, 'source/test/fixtures');
const delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.46] Astra 第8回の対照テスト・C802 の同意文');
const K = '2026-10-24|架空新人大会', PL = { date: '2026-10-24', end: '2026-10-25', meet: '架空新人大会', venue: '架空競技場' };
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = html.match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/^<script>|<\/script>$/g, ''));
const NM = path.join(here, 'node_modules/pdfjs-dist/');
const fix = s => s.replace('handleFile: handleFile, prep:', 'onShareAuth: onShareAuth, prepErase: prepErase, prepDocDone: prepDocDone, pubShow: pubShow, prep:') .replace('var lib = await loadPdfjs();', 'var lib = window.__pdfjs;').replace("cMapUrl: PDFJS_BASE + 'cmaps/'", "cMapUrl: " + JSON.stringify(NM + 'cmaps/')).replace("standardFontDataUrl: PDFJS_BASE + 'standard_fonts/'", "standardFontDataUrl: " + JSON.stringify(NM + 'standard_fonts/'));
// にせの Firestore（メモリの中だけ）
const store = new Map(), DEL = { __del: 1 }, clone = v => JSON.parse(JSON.stringify(v));
const merge = (a, b) => { for (const k of Object.keys(b)) { if (b[k] === DEL) delete a[k]; else if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k] && typeof b[k] === 'object' ? clone(b[k]) : b[k]; } return a; };
const setPath = (o, p, v) => { const a = p.split('.'); let x = o; for (let i = 0; i < a.length - 1; i++) x = x[a[i]] = x[a[i]] || {}; if (v === DEL) delete x[a[a.length - 1]]; else x[a[a.length - 1]] = v && typeof v === 'object' ? clone(v) : v; };
const reads = []; const writes = []; let denyRead = false, failChunk = false, readGate = null, missingPdfDenied = false, revokeOnChunk = false, failDel = null;
const F = {
  doc: (fs_, ...a) => ({ path: a.join('/') }),
  getDoc: async r => { reads.push(r.path); if(denyRead && r.path.startsWith('teams/')) throw Object.assign(new Error('revoked'),{code:'permission-denied'}); let v = store.get(r.path); if(readGate && !readGate.used && r.path===readGate.path){v=clone(v);readGate.used=true;readGate.enter();await readGate.promise;} if(revokeOnChunk && r.path.includes('/pdf/')){denyRead=true;throw Object.assign(new Error('revoked'),{code:'permission-denied'});} if(missingPdfDenied && r.path.includes('/pdf/') && !v)throw Object.assign(new Error('missing document fails resource-based read rule'),{code:'permission-denied'}); return { exists: () => !!v, data: () => v && clone(v) }; },
  setDoc: async (r, d, o) => { if(failChunk && r.path.endsWith('/pdf/yoko_1')) throw Object.assign(new Error('simulated connection loss'),{code:'unavailable'}); writes.push(r.path); if (o && o.merge && store.has(r.path)) merge(store.get(r.path), d); else store.set(r.path, merge({}, d)); },
  updateDoc: async (r, ...a) => { if (!store.has(r.path)) throw Object.assign(new Error('not found'), { code: 'not-found' }); writes.push(r.path); for (let i = 0; i < a.length; i += 2) setPath(store.get(r.path), a[i], a[i + 1]); },
  runTransaction: async (fs_, fn) => fn({ get: r => F.getDoc(r), update: (r, ...a) => { F.updateDoc(r, ...a); } }),
  onDelete: null,
  deleteDoc: async r => { if (F.onDelete) await F.onDelete(r.path); if(failDel && failDel(r.path)) throw Object.assign(new Error('injected delete failure'),{code:'resource-exhausted'}); writes.push('del:' + r.path); store.delete(r.path); },
  deleteField: () => DEL,
  Timestamp: { fromMillis: ms => ({ ms }) }
};
const fakeFB = uid => ({ F, fs: {}, A: {}, auth: { currentUser: uid ? { uid } : null } });
async function open({ uid, team, copyUid, idb, fetchMap, plain, session }) {
  const d = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), { url: 'http://127.0.0.1:9/index.html' + (plain ? '' : '?plan=' + encodeURIComponent(K)), runScripts: 'outside-only', virtualConsole: (() => { const v = new VirtualConsole(); if (process.env.DBG) v.on('error', e => console.log('CE', String(e && e.stack || e).slice(0, 300))); return v; })(),
    beforeParse(v) { if(session) v.sessionStorage.setItem('lanenote-meet-session',session); v.localStorage.setItem('lanenote.plans.v1', JSON.stringify({ at: 1, uid: copyUid != null ? copyUid : (uid || ''), team: team || '', list: [PL, {date:'2026-11-08',end:'2026-11-08',meet:'架空B大会'}] })); v.HTMLElement.prototype.scrollIntoView = function () {}; } });
  await delay(30); const w = d.window;
  Object.assign(w, { TextEncoder, TextDecoder, Response, File, Blob, __pdfjs: pdfjs }); w.indexedDB = idb; w.scrollTo = () => {}; if(!(w.crypto && w.crypto.subtle))Object.defineProperty(w,'crypto',{value:globalThis.crypto,configurable:true});
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



const SKEY='lanenote-meet-session';

await check('C701 safe: future manager restored; expired and pending members rejected; offline restoration preserves identity', async () => {
  const uid='auditManager8',team='auditManagerTeam8',member='teams/'+team+'/members/'+uid;
  const a=await openW({uid,team,idb:new IDBFactory()});
  await a.__meetApp.handleFile('sl',file(a,'f3_sl_heats.pdf','架空名簿8.pdf'));await delay(650);
  const saved=JSON.parse(a.sessionStorage.getItem(SKEY));saved.own.plan='';a.close();
  const noPlan=JSON.stringify(saved), expected=JSON.stringify(saved.own);
  for(const scenario of [
    {name:'active-manager',data:{role:'manager',expiresAt:{seconds:Math.floor(Date.now()/1000)+3600}},restores:true},
    {name:'expired-manager',data:{role:'manager',expiresAt:{seconds:Math.floor(Date.now()/1000)-60}},restores:false},
    {name:'pending',data:{role:'pending'},restores:false},
    {name:'offline',data:null,restores:true}
  ]){
    store.set(member,scenario.data);const orig=F.getDoc;
    if(scenario.name==='offline')F.getDoc=async r=>{if(r.path===member)throw Object.assign(new Error('offline'),{code:'unavailable'});return orig(r)};
    try{
      const w=await openW({uid,team,plain:true,session:noPlan,idb:new IDBFactory()});
      assert.equal(!!(w.__meetApp.state.sl&&w.__meetApp.state.sl.entries.length),scenario.restores,scenario.name);
      if(scenario.restores){const el=w.document.getElementById('meetName');el.value='再確認';el.dispatchEvent(new w.Event('input',{bubbles:true}));await delay(650);assert.equal(JSON.stringify(JSON.parse(w.sessionStorage.getItem(SKEY)).own),expected,scenario.name+' owner retained');}
      else assert.equal(w.sessionStorage.getItem(SKEY),null);
      w.close();
    }finally{F.getDoc=orig;}
  }
});

await check('C702 safe: transaction conflict retries and preserves concurrently published version; second erase succeeds', async () => {
  const base='teams/TxnTeam8/meets/'+K;
  const w=await openW({uid:'auditTxn8',team:'TxnTeam8',idb:new IDBFactory()});
  await w.__meetApp.handleFile('yoko',file(w,'f5_note_fee500.pdf','original.pdf'));
  const old=clone(store.get(base).prep.docs.yoko), v='audit888', chunk=base+'/pdf/yoko_'+v+'_0';
  const orig=F.runTransaction;let attempts=0;
  F.runTransaction=async (_fs,fn)=>{
    for(let tries=0;tries<3;tries++){
      attempts++;const versions=new Map(),ops=[];
      const res=await fn({
        get:async r=>{const snap=store.has(r.path)?clone(store.get(r.path)):null;versions.set(r.path,JSON.stringify(snap));return {exists:()=>snap!==null,data:()=>snap===null?undefined:clone(snap)};},
        update:(r,...a)=>ops.push([r,a])
      });
      // A real transaction observes a concurrent parent update at commit and reruns the callback.
      if(tries===0){store.set(chunk,{kind:'yoko',v,i:0,n:1,data:'synthetic'});store.get(base).prep.docs.yoko={...old,v,n:1,at:'2099-01-01T00:00:00.000Z',name:'new-concurrent.pdf'};}
      const conflict=[...versions].some(([p,ver])=>JSON.stringify(store.has(p)?store.get(p):null)!==ver);
      if(conflict)continue;
      for(const [r,a] of ops)await F.updateDoc(r,...a);
      return res;
    }
    throw Error('too many retries');
  };
  try{await w.__meetApp.prepErase();}finally{F.runTransaction=orig;}
  assert.equal(attempts,2);assert.match(bar(w),/消し終わっていません/);assert.doesNotMatch(bar(w),/保存を消しました/);
  assert.equal(store.get(base).prep.docs.yoko.v,v);assert(store.has(chunk));
  await w.__meetApp.prepErase();assert.match(bar(w),/保存を消しました/);assert(!store.has(chunk));assert(!store.get(base).prep);
});

await check('C702 safe: authoritative parent read denied prevents deletion and success display', async () => {
  const base='teams/DenyTeam8/meets/'+K;
  const w=await openW({uid:'auditDeny8',team:'DenyTeam8',idb:new IDBFactory()});
  await w.__meetApp.handleFile('yoko',file(w,'f5_note_fee500.pdf','retain.pdf'));
  const before=JSON.stringify([...store.entries()].filter(([p])=>p.startsWith(base))), nw=writes.length;
  denyRead=true;
  try{await assert.rejects(w.__meetApp.prepErase(),e=>e.code==='permission-denied');}finally{denyRead=false;}
  assert.equal(writes.length,nw);assert.equal(JSON.stringify([...store.entries()].filter(([p])=>p.startsWith(base))),before);
  assert.doesNotMatch(bar(w),/保存を消しました/);
});

await check('C802：スタートリストを保存するときの同意文は、自動削除を約束しない（アプリで読めなくなる・自動削除は行っていない・残る場合がある）', async () => {
  const w=await openW({uid:'auditConsent8',team:'ConsentTeam8',idb:new IDBFactory()});
  await w.__meetApp.handleFile('sl',file(w,'f3_sl_heats.pdf','架空同意確認.pdf'));
  const prompt=w.__confirms.find(x=>x.includes('スタートリストには'));
  assert(prompt);assert.doesNotMatch(prompt,/順次削除/);
  assert.match(prompt,/大会終了の1か月後から、保存したPDFはアプリで読めなくなります/);assert.match(prompt,/現在、クラウド上の自動削除は行っていません/);assert.match(prompt,/サーバーに残る場合があります/);
});

for(const w of windows)w.close();
console.log(JSON.stringify({passed:pass,failed:fail}));if(fail)process.exitCode=1;

