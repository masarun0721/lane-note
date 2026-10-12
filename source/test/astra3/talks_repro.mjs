// Local emulator only. Assertions confirm the audited vulnerable behavior, not safety.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
const root=path.resolve(process.env.LANE_NOTE_SOURCE || new URL('../attached-source',import.meta.url).pathname);
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089') throw Error('Requires local demo emulator 127.0.0.1:8089');
F.setLogLevel('silent');
const env=await initializeTestEnvironment({projectId:'demo-lane-note',firestore:{host:'127.0.0.1',port:8089,rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')}});
const claims={firebase:{sign_in_provider:'google.com'},email_verified:true};
const owner=env.authenticatedContext('audit-owner',claims).firestore(), attacker=env.authenticatedContext('audit-other',claims).firestore(), anon=env.unauthenticatedContext().firestore();
const read=f=>fs.readFileSync(path.join(root,'source/src',f),'utf8');
const w=new JSDOM('<div id="box"></div>',{url:'https://audit.invalid/',runScripts:'outside-only'}).window;
globalThis.window=w;globalThis.localStorage=w.localStorage;globalThis.location=w.location;globalThis.confirm=()=>true;
vm.runInThisContext(read('personal.js'));vm.runInThisContext(read('talk.js'));w.LanePersonal=globalThis.LanePersonal;w.LaneTalk=globalThis.LaneTalk;
const teacher=w.LaneTalk.teacher({F,fs:owner},{uid:'audit-owner'},()=>{});
let passed=0,failed=0;
async function test(n,f){try{await f();passed++;console.log('CONFIRMED',n);}catch(e){failed++;console.error('FAIL',n,e.stack);}}
const msg=(body,extra={})=>({from:'p',body,createdAt:F.serverTimestamp(),...extra});
const mid=n=>'Message'+String(n).padStart(13,'0');
const thread=(uid='audit-other')=>({ownerUid:uid,name:'架空選手',note:'',noteAt:F.serverTimestamp(),active:true,createdAt:F.serverTimestamp(),expiresAt:F.Timestamp.fromMillis(Date.now()+86400000)});
try{
await env.clearFirestore();
const id=await teacher.create('fictional-a','架空A');
await test('T01: enabled:false does not block anonymous read/write',async()=>{
 await teacher.setEnabled(false); await F.setDoc(F.doc(anon,'talks',id,'msgs',mid(1)),msg('off yet writable'));
 assert.equal((await F.getDoc(F.doc(anon,'talks',id))).data().active,true);
});
await test('T02: bearer holder reads health and writes as player; teacher spoof rejected on existing parent',async()=>{
 await F.setDoc(F.doc(anon,'talks',id,'msgs',mid(2)),msg('',{cond:{d:'2026-10-12',s:2,sl:5,m:'FICTIONAL-HEALTH'}}));
 const otherAnon=env.unauthenticatedContext().firestore();
 assert.equal((await F.getDoc(F.doc(otherAnon,'talks',id,'msgs',mid(2)))).data().cond.m,'FICTIONAL-HEALTH');
 await assertFails(F.setDoc(F.doc(otherAnon,'talks',id,'msgs',mid(3)),msg('spoof',{from:'t'})));
});
await test('T03: 201 anonymous messages accepted; query without limit reads all; app shows oldest 200',async()=>{
 const many=await teacher.create('fictional-b','架空B');
 for(let i=0;i<201;i++) await F.setDoc(F.doc(anon,'talks',many,'msgs',mid(i)),msg('message-'+i));
 assert.equal((await F.getDocs(F.collection(anon,'talks',many,'msgs'))).size,201);
 const result=await teacher.read(many); assert.equal(result.msgs.length,200);
 assert.equal(result.msgs[0].body,'message-0');assert.ok(!result.msgs.some(x=>x.body==='message-200'));
});
let race,orphan=mid(444);
await test('T04: actual remove() races with player post and leaves orphan health message',async()=>{
 race=await teacher.create('fictional-c','架空C');
 await F.setDoc(F.doc(anon,'talks',race,'msgs',mid(443)),msg('before removal'));
 let injected=false;
 const wrapped={...F,getDocs:async(q)=>{
   const s=await F.getDocs(q);
   if(!injected){injected=true;await F.setDoc(F.doc(anon,'talks',race,'msgs',orphan),msg('',{cond:{d:'2026-10-12',m:'ORPHAN-FICTIONAL-HEALTH'}}));}
   return s;
 }};
 await w.LaneTalk.teacher({F:wrapped,fs:owner},{uid:'audit-owner'},()=>{}).remove(race);
 await env.withSecurityRulesDisabled(async c=>{
   const admin=c.firestore();assert.equal((await F.getDoc(F.doc(admin,'talks',race))).exists(),false);
   assert.equal((await F.getDoc(F.doc(admin,'talks',race,'msgs',orphan))).data().cond.m,'ORPHAN-FICTIONAL-HEALTH');
 });
 await assertFails(F.deleteDoc(F.doc(owner,'talks',race,'msgs',orphan)));
});
await test('T05: different Google user recreates deleted token, inherits orphan health, sends as teacher',async()=>{
 await F.setDoc(F.doc(attacker,'talks',race),thread());
 assert.equal((await F.getDoc(F.doc(attacker,'talks',race,'msgs',orphan))).data().cond.m,'ORPHAN-FICTIONAL-HEALTH');
 await F.setDoc(F.doc(attacker,'talks',race,'msgs',mid(445)),msg('FAKE-TEACHER',{from:'t'}));
 assert.equal((await F.getDoc(F.doc(anon,'talks',race,'msgs',mid(445)))).data().from,'t');
});
await test('T06: same device condition memo for A is offered and sent to B talk',async()=>{
 const bob=await teacher.create('fictional-d','架空D');
 w.LanePersonal.cSet('2026-10-12',{s:1,sl:4,m:'A-PRIVATE-FICTIONAL'});
 w.LaneTalk.setFirebase({F,fs:anon});const box=w.document.getElementById('box');
 assert.equal(await w.LaneTalk.renderPlayer(box,bob),true);
 box.querySelector('.tk-cday').value='2026-10-12';box.querySelector('.tk-csend').click();
 let messages;
 for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,25));messages=await F.getDocs(F.collection(owner,'talks',bob,'msgs'));if(messages.size)break;}
 assert.equal(messages.docs[0].data().cond.m,'A-PRIVATE-FICTIONAL');
});
await test('T07: offline read fails closed in the tested SDK configuration (control)',async()=>{
 const off=await teacher.create('fictional-e','架空E');
 await F.setDoc(F.doc(anon,'talks',off,'msgs',mid(900)),msg('CACHED-FICTIONAL-HEALTH'));
 const cached=env.unauthenticatedContext().firestore(); w.LaneTalk.setFirebase({F,fs:cached});
 const box=w.document.createElement('div');w.document.body.appendChild(box);assert.equal(await w.LaneTalk.renderPlayer(box,off),true);
 await F.disableNetwork(cached);await teacher.setActive(off,false);
 assert.equal(await w.LaneTalk.renderPlayer(box,off),false);assert.equal(box.hidden,true);assert.equal(box.innerHTML,'');
 await F.enableNetwork(cached);await assertFails(F.getDocFromServer(F.doc(cached,'talks',off)));
});
await test('T08: stopped parent rejects new anonymous writes (positive control)',async()=>{
 await teacher.setActive(id,false);await assertFails(F.setDoc(F.doc(anon,'talks',id,'msgs',mid(999)),msg('blocked')));
});
}finally{await env.cleanup();w.close();}
console.log(`${passed} confirmed checks, ${failed} failed`);if(failed)process.exitCode=1;
