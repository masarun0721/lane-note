// firestore.rules をエミュレーターで確かめる（v0.15・再監査A08：設定はリポジトリ直下の firebase.json、版は固定）
// 必ず demo プロジェクト・ローカルのエミュレーターで動かす（本番には絶対につながない。firebase deploy もしない）。要 Java 17 以上：
//   リポジトリ直下で：npx -y firebase-tools@14.12.0 emulators:exec --only firestore --project demo-lane-note --config firebase.json "node source/test/rules_check.mjs"
//   （source/test で npm run test:rules でも同じ）
import fs from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, Timestamp, query, where, writeBatch, setLogLevel} from 'firebase/firestore';
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
let passed=0, failed=0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok',name); } catch (e) { failed++; console.log('  NG',name,e.message); } }
const projectId='demo-lane-note';
const claims={firebase:{sign_in_provider:'google.com'},email_verified:true};
const mkShare=(uid='alice',extra={})=>({data:'1.e30',ownerUid:uid,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+119*864e5),...extra});
const mkFeedback=(uid='alice',extra={})=>({kind:'不具合',body:'架空のテスト',createdAt:serverTimestamp(),uid,...extra});
let env;
env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8089,rules:fs.readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')}});
try {
 await env.clearFirestore();
 const anon=env.unauthenticatedContext().firestore(), alice=env.authenticatedContext('alice',claims).firestore(), bob=env.authenticatedContext('bob',claims).firestore(), anonymousAuth=env.authenticatedContext('anon',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 const path='shares/Valid00001';
 await test('FINAL: owner records create',()=>assertSucceeds(setDoc(doc(alice,'users/alice/records/r1'),{id:'r1',name:'架空選手'})));
 await test('FINAL: owner records get',()=>assertSucceeds(getDoc(doc(alice,'users/alice/records/r1'))));
 await test('FINAL: owner records list',()=>assertSucceeds(getDocs(collection(alice,'users/alice/records'))));
 await test('FINAL: other user records get denied',()=>assertFails(getDoc(doc(bob,'users/alice/records/r1'))));
 await test('FINAL: anonymous records get denied',()=>assertFails(getDoc(doc(anon,'users/alice/records/r1'))));
 await test('FINAL: other user records write denied',()=>assertFails(setDoc(doc(bob,'users/alice/records/r2'),{id:'r2'})));
 await test('FINAL: other user records list denied',()=>assertFails(getDocs(collection(bob,'users/alice/records'))));
 await test('FINAL: owner weather write',()=>assertSucceeds(setDoc(doc(alice,'users/alice/meets/meet1'),{key:'meet1',weather:'晴'})));
 await test('FINAL: owner division override write',()=>assertSucceeds(setDoc(doc(alice,'users/alice/settings/divOverrides'),{map:{'架空選手@架空高':'hs'}})));
 await test('FINAL: owner record delete',()=>assertSucceeds(deleteDoc(doc(alice,'users/alice/records/r1'))));
 await test('FINAL: Google user valid share create',()=>assertSucceeds(setDoc(doc(alice,path),mkShare())));
 await test('FINAL: valid share anonymous get',()=>assertSucceeds(getDoc(doc(anon,path))));
 await test('FINAL: valid share other user get',()=>assertSucceeds(getDoc(doc(bob,path))));
 await test('FINAL: anonymous list denied',()=>assertFails(getDocs(collection(anon,'shares'))));
 await test('FINAL: owner-filtered list also denied',()=>assertFails(getDocs(query(collection(alice,'shares'),where('ownerUid','==','alice')))));
 await test('FINAL: anonymous create denied',()=>assertFails(setDoc(doc(anon,'shares/Anon000001'),mkShare())));
 await test('FINAL: Firebase anonymous-auth create denied',()=>assertFails(setDoc(doc(anonymousAuth,'shares/Anon000002'),mkShare('anon'))));
 await test('FINAL: spoofed owner denied',()=>assertFails(setDoc(doc(alice,'shares/Spoof00001'),mkShare('bob'))));
 await test('FINAL: update denied even for owner',()=>assertFails(updateDoc(doc(alice,path),{data:'1.e31'})));
 await test('FINAL: other user delete denied',()=>assertFails(deleteDoc(doc(bob,path))));
 await test('FINAL: anonymous delete denied',()=>assertFails(deleteDoc(doc(anon,path))));
 const invalids=[
 ['bad length ID','short',{}],['bad alphabet ID','Invalid_01',{}],
 ['extra field','Extra00001',{x:1}],['non-string data','Type000001',{data:5}],
 ['empty data','Empty00001',{data:''}],['non-base64url data','Format0001',{data:'1.あ'}],
 ['missing owner','Missing001',{ownerUid:undefined}],['missing createdAt','Missing002',{createdAt:undefined}],
 ['client createdAt','Created001',{createdAt:Timestamp.fromMillis(Date.now()-10000)}],
 ['past expiry','Past000001',{expiresAt:Timestamp.fromMillis(Date.now()-10000)}],
 ['non-timestamp expiry','ExpType001',{expiresAt:'2027-01-01'}],
 ['excess expiry','TooLong001',{expiresAt:Timestamp.fromMillis(Date.now()+121*864e5)}],
 ['190001 chars','TooBig0001',{data:'1.'+'A'.repeat(189999)}]
 ];
 for(const [label,id,extra] of invalids){ const d=mkShare('alice',extra); for(const k of Object.keys(d)) if(d[k]===undefined)delete d[k]; await test('FINAL: '+label+' denied',()=>assertFails(setDoc(doc(alice,'shares',id),d))); }
 await test('FINAL: 190000 chars accepted',()=>assertSucceeds(setDoc(doc(alice,'shares/MaxSize001'),mkShare('alice',{data:'1.'+'A'.repeat(189998)}))));
 await test('FINAL: 4-min forward clock skew accepted',()=>assertSucceeds(setDoc(doc(alice,'shares/Clock00001'),mkShare('alice',{expiresAt:Timestamp.fromMillis(Date.now()+120*864e5+240000)}))));
 const seed=async(id,d)=>env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'shares',id),d));
 await seed('Expired001',{data:'1.e30',ownerUid:'alice',createdAt:Timestamp.fromMillis(Date.now()-130*864e5),expiresAt:Timestamp.fromMillis(Date.now()-10*864e5)});
 await seed('Cap1200001',{data:'1.e30',ownerUid:'alice',createdAt:Timestamp.fromMillis(Date.now()-121*864e5),expiresAt:Timestamp.fromMillis(Date.now()+864e5)});
 await seed('Missing003',{data:'1.e30',ownerUid:'alice',createdAt:Timestamp.now()});
 await test('FINAL: expired anonymous get denied',()=>assertFails(getDoc(doc(anon,'shares/Expired001'))));
 await test('FINAL: expired owner get denied',()=>assertFails(getDoc(doc(alice,'shares/Expired001'))));
 await test('FINAL: createdAt + 120 days ceiling enforced',()=>assertFails(getDoc(doc(anon,'shares/Cap1200001'))));
 await test('FINAL: missing expiry get denied',()=>assertFails(getDoc(doc(anon,'shares/Missing003'))));
 await test('FINAL: expired owner delete allowed',()=>assertSucceeds(deleteDoc(doc(alice,'shares/Expired001'))));
 await test('FINAL: valid owner delete allowed',()=>assertSucceeds(deleteDoc(doc(alice,path))));
 await test('FINAL: deleted link cannot be read',()=>assertFails(getDoc(doc(anon,path))));
 await test('FINAL: Google feedback accepted',()=>assertSucceeds(setDoc(doc(alice,'feedback/f1'),mkFeedback())));
 await test('FINAL: anonymous feedback denied',()=>assertFails(setDoc(doc(anon,'feedback/f2'),mkFeedback(null))));
 await test('FINAL: anonymous-auth feedback denied',()=>assertFails(setDoc(doc(anonymousAuth,'feedback/f3'),mkFeedback('anon'))));
 await test('FINAL: feedback UID spoof denied',()=>assertFails(setDoc(doc(alice,'feedback/f4'),mkFeedback('bob'))));
 await test('FINAL: feedback UID null denied',()=>assertFails(setDoc(doc(alice,'feedback/f5'),mkFeedback(null))));
 await test('FINAL: feedback empty body denied',()=>assertFails(setDoc(doc(alice,'feedback/f6'),mkFeedback('alice',{body:''}))));
 await test('FINAL: feedback 5001-char body denied',()=>assertFails(setDoc(doc(alice,'feedback/f7'),mkFeedback('alice',{body:'あ'.repeat(5001)}))));
 await test('FINAL: feedback invalid kind denied',()=>assertFails(setDoc(doc(alice,'feedback/f8'),mkFeedback('alice',{kind:'spam'}))));
 await test('FINAL: feedback oversized contact denied',()=>assertFails(setDoc(doc(alice,'feedback/f9'),mkFeedback('alice',{contact:'x'.repeat(201)}))));
 await test('FINAL: feedback extra field denied',()=>assertFails(setDoc(doc(alice,'feedback/f10'),mkFeedback('alice',{extra:1}))));
 await test('FINAL: feedback own get denied',()=>assertFails(getDoc(doc(alice,'feedback/f1'))));
 await test('FINAL: feedback list denied',()=>assertFails(getDocs(collection(alice,'feedback'))));
 await test('FINAL: feedback update denied',()=>assertFails(updateDoc(doc(alice,'feedback/f1'),{body:'changed'})));
 await test('FINAL: feedback delete denied',()=>assertFails(deleteDoc(doc(alice,'feedback/f1'))));
 await test('FINAL: unknown collection denied',()=>assertFails(setDoc(doc(alice,'unknown/u1'),{x:1})));
 await test('RESIDUAL（未対応・回数制限なし）: ログインした人は何件でも送れる',()=>assertSucceeds(setDoc(doc(alice,'feedback/repeated'),mkFeedback())));

 // v0.14：アプリが実際に書く形
 await test('APP: shares と users/{uid}/shareIndex を1回のまとめ書きで作れる（119日）',async()=>{const b=writeBatch(alice),exp=Timestamp.fromMillis(Date.now()+119*864e5);b.set(doc(alice,'shares/AppBatch01'),{data:'1.e30',ownerUid:'alice',createdAt:serverTimestamp(),expiresAt:exp});b.set(doc(alice,'users/alice/shareIndex/AppBatch01'),{createdAt:serverTimestamp(),expiresAt:exp,label:'大会：架空'});await assertSucceeds(b.commit());});
 await test('APP: 共有を止める（shares と一覧を一緒に消す）',async()=>{const b=writeBatch(alice);b.delete(doc(alice,'shares/AppBatch01'));b.delete(doc(alice,'users/alice/shareIndex/AppBatch01'));await assertSucceeds(b.commit());});
 await test('APP: ほかの人の shareIndex は読めない',()=>assertFails(getDocs(collection(bob,'users/alice/shareIndex'))));
 await test('APP: feedback.js が送る形（全項目）が通る',()=>assertSucceeds(setDoc(doc(alice,'feedback/app1'),mkFeedback('alice',{contact:'',page:'記録',version:'v0.14／記録 v0.6.0',ua:'x'.repeat(400),screen:'390x844（表示 390x844）',path:'/lane-note/records.html［全記録］'}))));
 // v0.24：選手とのやり取り（talks）
 const TID='TalkAbcdefghij012345', TID2='TalkInactive00000001', TID3='TalkExpired000000001';
 const mkTalk=(uid='alice',extra={})=>({ownerUid:uid,name:'架空 一郎',note:'',noteAt:serverTimestamp(),active:true,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+119*864e5),...extra});
 const mkMsg=(from='p',extra={})=>({from,body:'架空の返信',createdAt:serverTimestamp(),...extra});
 const MID=n=>('Msg'+n).padEnd(20,'0');
 await env.withSecurityRulesDisabled(async c=>{const f=c.firestore();
   await setDoc(doc(f,'talks/'+TID2),{ownerUid:'alice',name:'架空',note:'',noteAt:Timestamp.now(),active:false,createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+864e5)});
   await setDoc(doc(f,'talks/'+TID3),{ownerUid:'alice',name:'架空',note:'',noteAt:Timestamp.now(),active:true,createdAt:Timestamp.fromMillis(Date.now()-130*864e5),expiresAt:Timestamp.fromMillis(Date.now()+864e5)});
   await setDoc(doc(f,'talks/'+TID2+'/msgs/'+MID('old')),{from:'p',body:'前の',createdAt:Timestamp.now()}); });
 await test('TALK: 顧問（Google）が作れる（119日・active）',()=>assertSucceeds(setDoc(doc(alice,'talks/'+TID),mkTalk())));
 await test('TALK: ログインなしでは作れない',()=>assertFails(setDoc(doc(anon,'talks/TalkAnon000000000001'),mkTalk('alice'))));
 await test('TALK: 匿名認証では作れない',()=>assertFails(setDoc(doc(anonymousAuth,'talks/TalkAnon000000000002'),mkTalk('anon'))));
 await test('TALK: ほかの人の名前（ownerUid）では作れない',()=>assertFails(setDoc(doc(alice,'talks/TalkSpoof00000000001'),mkTalk('bob'))));
 await test('TALK: 短いID（推測しやすい）は不可',()=>assertFails(setDoc(doc(alice,'talks/Short00001'),mkTalk())));
 await test('TALK: 期限が120日を超えると作れない',()=>assertFails(setDoc(doc(alice,'talks/TalkLong000000000001'),mkTalk('alice',{expiresAt:Timestamp.fromMillis(Date.now()+130*864e5)}))));
 await test('TALK: 余計な項目は不可',()=>assertFails(setDoc(doc(alice,'talks/TalkExtra00000000001'),mkTalk('alice',{x:1}))));
 await test('TALK: 停止した状態では作れない',()=>assertFails(setDoc(doc(alice,'talks/TalkOff0000000000001'),mkTalk('alice',{active:false}))));
 await test('TALK: リンクを知っていればログインなしで読める',()=>assertSucceeds(getDoc(doc(anon,'talks/'+TID))));
 await test('TALK: 一覧は不可（顧問本人も）',()=>assertFails(getDocs(query(collection(alice,'talks'),where('ownerUid','==','alice')))));
 await test('TALK: 停止中は選手が読めない',()=>assertFails(getDoc(doc(anon,'talks/'+TID2))));
 await test('TALK: 停止中でも顧問本人は読める',()=>assertSucceeds(getDoc(doc(alice,'talks/'+TID2))));
 await test('TALK: 作ってから120日を過ぎたら選手は読めない',()=>assertFails(getDoc(doc(anon,'talks/'+TID3))));
 await test('TALK: 顧問がひとことを書ける（note・noteAt）',()=>assertSucceeds(updateDoc(doc(alice,'talks/'+TID),{note:'次はスタートを意識',noteAt:serverTimestamp()})));
 await test('TALK: ひとことは500文字まで',()=>assertFails(updateDoc(doc(alice,'talks/'+TID),{note:'あ'.repeat(501),noteAt:serverTimestamp()})));
 await test('TALK: 名前・期限・持ち主は変えられない',async()=>{await assertFails(updateDoc(doc(alice,'talks/'+TID),{name:'別'}));await assertFails(updateDoc(doc(alice,'talks/'+TID),{expiresAt:Timestamp.fromMillis(Date.now()+119*864e5)}));await assertFails(updateDoc(doc(alice,'talks/'+TID),{ownerUid:'bob'}));});
 await test('TALK: ほかの人・選手は書きかえられない',async()=>{await assertFails(updateDoc(doc(bob,'talks/'+TID),{note:'x',noteAt:serverTimestamp()}));await assertFails(updateDoc(doc(anon,'talks/'+TID),{active:false}));});
 await test('TALK: 選手（ログインなし）が返信できる',()=>assertSucceeds(setDoc(doc(anon,'talks/'+TID+'/msgs/'+MID(1)),mkMsg())));
 await test('TALK: 選手が「先生に送る」体調メモ',()=>assertSucceeds(setDoc(doc(anon,'talks/'+TID+'/msgs/'+MID(2)),mkMsg('p',{body:'',cond:{d:'2026-10-12',s:4,sl:7.5,m:'足が軽い'}}))));
 await test('TALK: 体調メモの形がおかしいと不可（体調6・日付なし）',async()=>{await assertFails(setDoc(doc(anon,'talks/'+TID+'/msgs/'+MID(3)),mkMsg('p',{body:'',cond:{d:'2026-10-12',s:6}})));await assertFails(setDoc(doc(anon,'talks/'+TID+'/msgs/'+MID(4)),mkMsg('p',{body:'',cond:{s:3}})));});
 await test('TALK: 空の返信・501文字は不可',async()=>{await assertFails(setDoc(doc(anon,'talks/'+TID+'/msgs/'+MID(5)),mkMsg('p',{body:''})));await assertFails(setDoc(doc(anon,'talks/'+TID+'/msgs/'+MID(6)),mkMsg('p',{body:'あ'.repeat(501)})));});
 await test('TALK: 選手は先生のふり（from:t）をできない',()=>assertFails(setDoc(doc(anon,'talks/'+TID+'/msgs/'+MID(7)),mkMsg('t'))));
 await test('TALK: 顧問本人は from:t で書ける・ほかの人は不可',async()=>{await assertSucceeds(setDoc(doc(alice,'talks/'+TID+'/msgs/'+MID(8)),mkMsg('t')));await assertFails(setDoc(doc(bob,'talks/'+TID+'/msgs/'+MID(9)),mkMsg('t')));});
 await test('TALK: 選手はやり取りを読める（そのIDだけ）',()=>assertSucceeds(getDocs(collection(anon,'talks/'+TID+'/msgs'))));
 await test('TALK: 停止中は選手が読めず・書けない',async()=>{await assertFails(getDocs(collection(anon,'talks/'+TID2+'/msgs')));await assertFails(setDoc(doc(anon,'talks/'+TID2+'/msgs/'+MID(10)),mkMsg()));});
 await test('TALK: 停止中でも顧問本人は読める',()=>assertSucceeds(getDocs(collection(alice,'talks/'+TID2+'/msgs'))));
 await test('TALK: ないIDには書けない',()=>assertFails(setDoc(doc(anon,'talks/TalkNone000000000001/msgs/'+MID(11)),mkMsg())));
 await test('TALK: メッセージは直せない（顧問も）',()=>assertFails(updateDoc(doc(alice,'talks/'+TID+'/msgs/'+MID(1)),{body:'x'})));
 await test('TALK: 選手・ほかの人は消せない',async()=>{await assertFails(deleteDoc(doc(anon,'talks/'+TID+'/msgs/'+MID(1))));await assertFails(deleteDoc(doc(bob,'talks/'+TID+'/msgs/'+MID(1))));await assertFails(deleteDoc(doc(bob,'talks/'+TID)));});
 await test('TALK: 顧問が停止できる（active:false）→ 選手は読めない',async()=>{await assertSucceeds(updateDoc(doc(alice,'talks/'+TID),{active:false}));await assertFails(getDoc(doc(anon,'talks/'+TID)));await assertSucceeds(updateDoc(doc(alice,'talks/'+TID),{active:true}));});
 await test('TALK: 顧問がメッセージとやり取りを削除できる',async()=>{const b=writeBatch(alice);b.delete(doc(alice,'talks/'+TID+'/msgs/'+MID(1)));b.delete(doc(alice,'talks/'+TID+'/msgs/'+MID(2)));b.delete(doc(alice,'talks/'+TID+'/msgs/'+MID(8)));b.delete(doc(alice,'talks/'+TID));b.delete(doc(alice,'users/alice/talkIndex/'+TID));await assertSucceeds(b.commit());await assertFails(getDoc(doc(anon,'talks/'+TID)));});
 await test('TALK: 顧問の設定と一覧（users/{uid}/settings/talk・talkIndex）は本人だけ',async()=>{await assertSucceeds(setDoc(doc(alice,'users/alice/settings/talk'),{enabled:true}));await assertSucceeds(setDoc(doc(alice,'users/alice/talkIndex/'+TID2),{name:'架空'}));await assertFails(getDocs(collection(bob,'users/alice/talkIndex')));});
} finally { await env.cleanup(); }
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
