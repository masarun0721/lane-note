// v0.26.2（Q251）：ui_repro.mjs の U01・U06 を「安全な状態を直接 assert する」形に書きかえたもの（失敗＝直った、の反転判定をやめる）
// Offline jsdom harness; production source is used; Firebase/network boundary is mocked.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';import {IDBFactory} from 'fake-indexeddb';
const root=path.resolve(process.env.LANE_NOTE_SOURCE||new URL('../attached-source',import.meta.url).pathname);
const src=f=>fs.readFileSync(path.join(root,'source/src',f),'utf8');
const delay=ms=>new Promise(r=>setTimeout(r,ms));let pass=0,fail=0;const doms=[];
async function check(n,f){try{await f();pass++;console.log('PASS',n);}catch(e){fail++;console.error('FAIL',n,e.stack);}}
function dom(html='<div id="box"></div>'){
 const d=new JSDOM(html,{url:'https://audit.invalid/records.html',runScripts:'outside-only'});doms.push(d);const w=d.window;
 w.confirm=()=>true;w.alert=()=>{};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.indexedDB=new IDBFactory();
 w.fetch=()=>Promise.reject(Error('No network permitted'));Object.assign(w,{TextEncoder,TextDecoder,CompressionStream,DecompressionStream,Response,Blob});return w;
}
function safeDocument(doc){assert.equal(doc.querySelectorAll('script,img,iframe,object,embed').length,0);for(const e of doc.querySelectorAll('*'))for(const a of e.attributes)assert.ok(!/^on/i.test(a.name),a.name);}
const marker='\"><img src=x onerror=alert(1)>';
await check('U01: late note callback does NOT reopen Alice health thread in Bob account screen',async()=>{
 const html=src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/__[A-Z_0-9]+__/g,'');
 const w=dom(html);await delay(20);for(const f of ['auth_common.js','results.js','talk.js'])w.eval(src(f));
 const tail='if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';assert.ok(src('records_app.js').includes(tail));
 w.eval(src('records_app.js').replace(tail,'window.__audit={onAuth,scope,openTalk,openThread,setFB:f=>{FB=f;CLOUD_READY=true;}};renderAuth();'));
 const id='AAAAAAAAAAAAAAAAAAAA',ts={toMillis:()=>Date.now()},t=w.__audit;let release,started=false;const gate=new Promise(r=>release=r);
 const snap=d=>({exists:()=>!!d,data:()=>d,metadata:{fromCache:false}});
 const FB={fs:{},auth:{currentUser:null},F:{
 doc:(_, ...p)=>p.join('/'),collection:(_, ...p)=>p.join('/'),query:q=>q,orderBy:()=>0,limit:()=>0,serverTimestamp:()=>ts,
 getDoc:async p=>snap(p==='talks/'+id?{ownerUid:'alice',active:true,name:'ALICE-ATHLETE',note:'ALICE-PRIVATE-HEALTH'}:p.endsWith('/settings/talk')?{enabled:true}:null),
 getDocs:async()=>({metadata:{fromCache:false},forEach:()=>{}}),updateDoc:async()=>{started=true;await gate;},
 }};FB.F.getDocFromServer=FB.F.getDoc;t.setFB(FB);
 FB.auth.currentUser={uid:'alice'};await t.onAuth(FB.auth.currentUser);await t.openTalk();await t.openThread(id);
 w.document.querySelector('[data-tknote]').click();for(let i=0;i<30&&!started;i++)await delay(10);assert.ok(started);
 FB.auth.currentUser={uid:'bob'};await t.onAuth(FB.auth.currentUser);await t.openTalk();
 assert.equal(w.document.getElementById('rbTalkThread').hidden,true);
 release();await delay(100);
 assert.equal(t.scope().uid,'bob');assert.equal(w.document.getElementById('rbTalkScreen').hidden,false);
 assert.equal(w.document.getElementById('rbTalkThread').hidden,true);assert.doesNotMatch(w.document.body.textContent,/ALICE-PRIVATE-HEALTH|ALICE-ATHLETE/);
});
await check('U02: talk message/health/body/id payloads remain text',()=>{
 const w=dom();w.eval(src('talk.js'));const box=w.document.getElementById('box');
 box.innerHTML=w.LaneTalk.msgsHtml([{id:marker,from:'p',body:marker,cond:{d:'2026-10-12',s:marker,sl:marker,m:marker}}],'t',true);
 safeDocument(box);assert.ok(box.textContent.includes('<img'));
});
await check('U03: shared pp names/rows/SVG titles/attributes remain text after sanitize',()=>{
 const w=dom();w.eval(src('personal.js'));const o=w.LanePersonal.sanitize({v:1,k:'pp',a:{name:marker,team:marker,grade:marker},e:[{l:marker,n:marker,lw:true,b:[marker,marker,marker,marker],p:[['2026-10-11',12,marker,marker,0],['2026-10-12',11,marker,marker,0]],x:[['2026-10-12',marker,marker,marker]],r:[['2026-10-12',marker,marker,marker,marker,'PB']]}],nx:{s:'abcdefghij',n:marker},tk:marker});
 const box=w.document.getElementById('box');w.LanePersonal.render(o,box,{base:'https://audit.invalid/'});safeDocument(box);assert.equal(o.tk,'');
});
await check('U04: notice imported text/template fields remain inert HTML in all 3 layouts',()=>{
 const w=dom();w.eval(src('notice.js'));const N=w.LaneNotice;
 for(const layout of ['std','table','clean']){
 const T=N.defaults();Object.assign(T,{layout,school:marker,club:marker,to:marker,title:marker,greeting:marker,place:marker,advisors:[marker],cautions:[marker],contact:[marker]});T.sections.push({id:'extra',type:'free',on:true,title:marker,text:marker});
 const M=Object.fromEntries(['name','date','venue','station','gather','fare','address','phone','place','docDate'].map(k=>[k,marker]));
 const grid={head:[marker],body:[[marker]],ncol:1,caps:[marker]};
 const d=new w.DOMParser().parseFromString(N.docHtml(N.sanitize(T),M,{ath:grid,time:grid}),'text/html');safeDocument(d);
 }
});
await check('U05: URL importer filters javascript/data URLs and does not adopt upstream elements',()=>{
 const w=dom();w.eval(src('urlload.js'));const links=w.LaneUrl.findLinks('<script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="data:text/html,x">bad</a><a href="/x.pdf">&lt;img src=x onerror=alert(1)&gt;</a>','https://example.org/');
 assert.equal(links.length,1);assert.equal(links[0].url,'https://example.org/x.pdf');assert.match(links[0].label,/<img/);safeDocument(w.document);
});
await check('U06: localStorage tampering stays inert text in condition HTML',()=>{
 const w=dom();w.eval(src('personal.js'));w.localStorage.setItem('lanenote.cond.v1',JSON.stringify({'2026-10-12':{sl:marker,s:marker}}));
 const box=w.document.getElementById('box');box.innerHTML=w.LanePersonal.condFormHtml('2026-10-12');safeDocument(box);assert.equal(box.querySelector('img'),null);assert.ok(box.querySelector('input,select,textarea'),'フォームが出ること');
});
for(const d of doms)d.window.close();console.log(`${pass} passed, ${fail} failed`);if(fail)process.exitCode=1;
