// v0.26.44 Astra 第7回 C701（戻した画面を保存し直しても持ち主・大会・期限を残す）・C702（保存を消すは最新の印の版を消す）の回帰テスト。Astra の再現テストを、安全な結果を期待する形にしたもの（架空データだけ・本番に接続しない）
// PASS は v0.26.43 で問題を再現できた意味。修正後は安全な期待値へ変更する。
// 架空データだけ。本番には接続しない。
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), FIX = path.join(ROOT, 'source/test/fixtures');
const delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.44] C701・C702（Astra 第7回）');
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

await check('C701: 戻した画面で入力して保存し直しても、チーム・大会のキー・元の期限が残る。外されたあとは戻さずに消す', async () => {
 const w=await openW({uid:'auditA',team:'auditTeamA',idb:new IDBFactory()});
 await w.__meetApp.handleFile('sl',file(w,'f3_sl_heats.pdf','架空A部の名簿.pdf'));await delay(650);
 const session=w.sessionStorage.getItem(SKEY);const own0=JSON.parse(session).own;assert.equal(own0.plan,K);assert.equal(own0.team,'auditTeamA');w.close();
 const w2=await openW({uid:'auditA',team:'auditTeamA',plain:true,session,idb:new IDBFactory()});
 assert.equal(w2.__meetApp.state.slName,'架空A部の名簿.pdf');assert.equal(w2.__meetApp.prep(),null);
 await delay(50);
 const field=w2.document.getElementById('meetName');field.value='架空新人大会（確認済み）';field.dispatchEvent(new w2.Event('input',{bubbles:true}));await delay(650);
 const rewritten=w2.sessionStorage.getItem(SKEY);assert(rewritten);const own1=JSON.parse(rewritten).own;
 assert.equal(own1.plan,K,'大会のキーを残す');assert.equal(own1.team,'auditTeamA');assert.equal(own1.uid,'auditA');assert.equal(own1.exp,own0.exp,'期限は元のまま（24時間に伸ばさない）');
 w2.close();
 denyRead=true;const before=reads.length;
 const w3=await openW({uid:'auditA',team:'auditTeamA',plain:true,session:rewritten,idb:new IDBFactory()});
 denyRead=false;
 assert(!w3.__meetApp.state.sl||!w3.__meetApp.state.sl.entries.length,'名簿を出さない');
 assert(reads.slice(before).some(x=>x==='teams/auditTeamA/meets/'+K),'チームの大会の印で権限を確かめる');
 assert.equal(w3.sessionStorage.getItem(SKEY),null,'一時保存を消す');
});
await check('C701: 権限のある同じ人なら、保存し直したものもこれまでどおり戻る', async () => {
 const w=await openW({uid:'auditA2',team:'auditTeamA2',idb:new IDBFactory()});
 await w.__meetApp.handleFile('sl',file(w,'f3_sl_heats.pdf','架空A2の名簿.pdf'));await delay(650);
 const session=w.sessionStorage.getItem(SKEY);w.close();
 const w2=await openW({uid:'auditA2',team:'auditTeamA2',plain:true,session,idb:new IDBFactory()});await delay(50);
 const field=w2.document.getElementById('meetName');field.value='架空大会2';field.dispatchEvent(new w2.Event('input',{bubbles:true}));await delay(650);
 const rewritten=w2.sessionStorage.getItem(SKEY);w2.close();
 const w3=await openW({uid:'auditA2',team:'auditTeamA2',plain:true,session:rewritten,idb:new IDBFactory()});
 assert.equal(w3.__meetApp.state.slName,'架空A2の名簿.pdf');assert(w3.__meetApp.state.sl.entries.length>0);
});
await check('C701: チームのものなのに大会のキーがない一時保存は、メンバーの文書で在籍を確かめる（外されていれば戻さない・顧問なら戻す）', async () => {
 const w=await openW({uid:'auditA3',team:'auditTeamA3',idb:new IDBFactory()});
 await w.__meetApp.handleFile('sl',file(w,'f3_sl_heats.pdf','架空A3の名簿.pdf'));await delay(650);
 const o=JSON.parse(w.sessionStorage.getItem(SKEY));w.close();o.own.plan='';const noPlan=JSON.stringify(o);
 // メンバーの文書がない（外された）
 let before=reads.length;
 const w2=await openW({uid:'auditA3',team:'auditTeamA3',plain:true,session:noPlan,idb:new IDBFactory()});
 assert(!w2.__meetApp.state.sl||!w2.__meetApp.state.sl.entries.length);assert.equal(w2.sessionStorage.getItem(SKEY),null);
 assert(reads.slice(before).includes('teams/auditTeamA3/members/auditA3'));
 // 期限切れのマネージャー
 store.set('teams/auditTeamA3/members/auditA3',{role:'manager',expiresAt:{ms:Date.now()-1000,toMillis(){return this.ms;}}});
 const w3=await openW({uid:'auditA3',team:'auditTeamA3',plain:true,session:noPlan,idb:new IDBFactory()});
 assert(!w3.__meetApp.state.sl||!w3.__meetApp.state.sl.entries.length);
 // 顧問なら戻す
 store.set('teams/auditTeamA3/members/auditA3',{role:'coach'});
 const w4=await openW({uid:'auditA3',team:'auditTeamA3',plain:true,session:noPlan,idb:new IDBFactory()});
 assert.equal(w4.__meetApp.state.slName,'架空A3の名簿.pdf');
 store.delete('teams/auditTeamA3/members/auditA3');
});
await check('C701: 「最初から」で戻した画面の持ち主の情報も消す（そのあとの保存は今の状態から作る）', async () => {
 const w=await openW({uid:'auditA4',team:'auditTeamA4',idb:new IDBFactory()});
 await w.__meetApp.handleFile('sl',file(w,'f3_sl_heats.pdf','架空A4の名簿.pdf'));await delay(650);
 const session=w.sessionStorage.getItem(SKEY);const own0=JSON.parse(session).own;w.close();
 const w2=await openW({uid:'auditA4',team:'auditTeamA4',plain:true,session,idb:new IDBFactory()});await delay(50);
 w2.__meetApp.resetAll();assert.equal(w2.sessionStorage.getItem(SKEY),null);
 await w2.__meetApp.handleFile('sl',file(w2,'f3_sl_heats.pdf','架空A4の別の名簿.pdf'));await delay(650);
 const own1=JSON.parse(w2.sessionStorage.getItem(SKEY)).own;assert.equal(own1.plan,'');assert.notEqual(own1.exp,own0.exp);
});
await check('C702: 新しい版を読み直したら p.cloud も最新にし、「保存を消す」でその版のかけらも消える', async () => {
 const base='teams/Tconcurrent7/meets/'+K;
 const w=await openW({uid:'auditConcurrent',team:'Tconcurrent7',idb:new IDBFactory()});
 await w.__meetApp.handleFile('yoko',file(w,'f5_note_fee500.pdf','old.pdf'));const old=clone(store.get(base).prep.docs.yoko);
 let release,enter;const started=new Promise(r=>enter=r),promise=new Promise(r=>release=r);readGate={path:base,promise,enter};
 const reading=openW({uid:'auditConcurrent',team:'Tconcurrent7',idb:new IDBFactory()});await started;
 await w.__meetApp.handleFile('yoko',file(w,'f6_note_track60.pdf','new.pdf'));const newer=clone(store.get(base).prep.docs.yoko);
 missingPdfDenied=true;release();const w2=await reading;await delay(300);missingPdfDenied=false;readGate=null;
 assert.equal(w2.__meetApp.state.yokoName,'new.pdf');assert.equal(w2.__meetApp.prep().docs.yoko.v,newer.v);assert.notEqual(old.v,newer.v);
 assert.equal(w2.__meetApp.prep().cloud.docs.yoko.v,newer.v,'p.cloud も新しい版');
 w.close();
 await w2.__meetApp.prepErase();
 assert.match(bar(w2),/保存を消しました/);assert(!store.get(base).prep);
 assert(![...store.keys()].some(k=>k.startsWith(base+'/pdf/')),'新しい版のかけらも残らない');
});
await check('C702: 消している間にほかの画面が保存し直したら、新しい版の印とかけらを残し、成功とは出さない（再試行あり）', async () => {
 const base='teams/Trace7/meets/'+K;
 const w=await openW({uid:'auditRace',team:'Trace7',idb:new IDBFactory()});
 await w.__meetApp.handleFile('yoko',file(w,'f5_note_fee500.pdf','first.pdf'));await delay(200);
 const cur=clone(store.get(base).prep.docs.yoko);
 const nv='zzzz9999', nchunk=base+'/pdf/yoko_'+nv+'_0';
 F.onDelete=async p=>{ if(p.includes('/pdf/')&&!store.has(nchunk)){ store.set(nchunk,{kind:'yoko',v:nv,i:0,n:1,data:'x'}); store.get(base).prep.docs.yoko=Object.assign({},cur,{v:nv,n:1,at:'2099-01-01T00:00:00.000Z',name:'other.pdf'}); } };
 await w.__meetApp.prepErase();F.onDelete=null;
 assert.doesNotMatch(bar(w),/保存を消しました/);assert.match(bar(w),/消し終わっていません/);
 assert.equal(store.get(base).prep.docs.yoko.v,nv,'新しい版の印は残す');assert(store.has(nchunk),'新しい版のかけらは残す');
 assert(!store.has(base+'/pdf/yoko_'+cur.v+'_0'),'読み直した時点の版は消す');
 assert(w.document.querySelector('[data-preperase]'),'再試行のボタン');
 // 再試行で、今度は新しい版も消える
 w.document.querySelector('[data-preperase]').click();await delay(300);
 assert.match(bar(w),/保存を消しました/);assert(!store.has(nchunk));assert(!store.get(base).prep);
});
await check('C602（維持）: 一部のかけらを消せなければ、印を残して「一部未削除」＋再試行', async () => {
 const P='teams/Terase7/meets/'+K;
 const w=await openW({uid:'auditErase7',team:'Terase7',idb:new IDBFactory()});
 await w.__meetApp.handleFile('yoko',file(w,'f5_note_fee500.pdf','erase.pdf'));await delay(200);
 const d=store.get(P).prep.docs.yoko,bad=P+'/pdf/yoko_'+d.v+'_0';failDel=p=>p===bad;
 await w.__meetApp.prepErase();failDel=null;
 assert.match(bar(w),/一部未削除/);assert(store.has(bad));assert.equal(store.get(P).prep.docs.yoko.v,d.v);
});
for(const w of windows)w.close();
console.log(JSON.stringify({passed:pass,failed:fail}));if(fail)process.exitCode=1;
